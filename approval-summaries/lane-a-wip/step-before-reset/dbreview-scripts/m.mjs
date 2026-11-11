// Experiment M: the migration (D7) against connections the previous image holds open. Scratch only.
import { readFileSync } from 'node:fs';
import { attempt, beginAs, connect, log, makeDevice, makeSession, makeUser, sleep, sha, uuid } from './h.mjs';

const su = await connect('su', 'su');
const user = await makeUser(su);
const device = await makeDevice(su, user);
const session = await makeSession(su, user, device.id);

// M1: a pooled connection of the previous image that has already run resolve_session() (its %ROWTYPE variables compiled).
const old = await connect('app', 'old-image');
log('M1 before: resolve_session ->', (await old.query('SELECT outcome, user_status FROM resolve_session($1)', [session.hash])).rows[0]);
log('M1 before: sign_in_account ->', Object.keys((await old.query('SELECT * FROM sign_in_account($1, $2)', [null, `sub-${user}`])).rows[0]).join(','));

const files = async () => (await su.query(`SELECT relname, relfilenode FROM pg_class WHERE relname IN ('user', 'user_session') ORDER BY 1`)).rows;
const before = await files();

// M2: what one open reader does to each lock mode.
const reader = await connect('app', 'reader');
await beginAs(reader, user);
await reader.query('SELECT app_actor_is_person()'); // what withJobScope runs first: ACCESS SHARE on "user", held to the end
const owner = await connect('owner', 'migration');
const tryLock = async (sql) => {
  await owner.query('BEGIN');
  const r = await attempt(owner, sql);
  await owner.query('ROLLBACK');
  return r.ok ? 'granted' : r.code;
};
log('M2 reader open (app_actor_is_person): "user" SHARE ROW EXCLUSIVE NOWAIT ->', await tryLock('LOCK TABLE "user" IN SHARE ROW EXCLUSIVE MODE NOWAIT'));
log('M2 reader open (app_actor_is_person): "user" ACCESS EXCLUSIVE NOWAIT    ->', await tryLock('LOCK TABLE "user" IN ACCESS EXCLUSIVE MODE NOWAIT'));
await reader.query('ROLLBACK');
await beginAs(reader, user);
await reader.query('INSERT INTO mutation_request (user_id, request_key, route_id) VALUES (app_actor_id(), $1, $2)', [uuid(), 'x.y']); // FK check: ROW SHARE on "user"
log('M2 FK check open (mutation_request): "user" SHARE ROW EXCLUSIVE NOWAIT ->', await tryLock('LOCK TABLE "user" IN SHARE ROW EXCLUSIVE MODE NOWAIT'));
log('M2 FK check open (mutation_request): "user" ACCESS EXCLUSIVE NOWAIT    ->', await tryLock('LOCK TABLE "user" IN ACCESS EXCLUSIVE MODE NOWAIT'));
await reader.query('ROLLBACK');

// M3: the migration's loop while a reader stays open for about three seconds, then the DDL.
await beginAs(reader, user);
await reader.query('SELECT app_actor_is_person()');
const draft = readFileSync(new URL('./draft.sql', import.meta.url), 'utf8');
const started = Date.now();
await owner.query('BEGIN');
const applying = attempt(owner, draft);
await sleep(3200);
// A request arriving while the loop is trying: it must not queue behind the migration.
const bystander = await connect('app', 'bystander');
const t0 = Date.now();
await bystander.query('SELECT * FROM sign_in_account($1, $2)', [null, `sub-${user}`]);
log('M3 a read of "user" while the loop retries took ms:', Date.now() - t0);
await reader.query('ROLLBACK');
const applied = await applying;
log('M3 draft applied:', applied.ok ? 'ok' : applied, 'after ms:', Date.now() - started);
// With the locks held, what waits: a read of "user" by the previous image.
const blocked = attempt(bystander, 'SELECT * FROM sign_in_account($1, $2)', [null, `sub-${user}`]);
await sleep(300);
const w = (await su.query("SELECT application_name, wait_event_type, wait_event FROM pg_stat_activity WHERE application_name = 'bystander'")).rows[0];
log('M3 while the migration holds its locks, a read of "user" is:', w.wait_event_type, w.wait_event);
await owner.query('COMMIT');
log('M3 after commit the read returns:', (await blocked).ok);
const after = await files();
log('M3 relfilenode before/after (no rewrite when equal):', JSON.stringify(before), JSON.stringify(after));

// M4: the connection that compiled resolve_session() before the columns existed.
log('M4 after: resolve_session on the old connection ->', await attempt(old, 'SELECT outcome, user_status FROM resolve_session($1)', [session.hash]));
log('M4 after: sign_in_account columns ->', Object.keys((await old.query('SELECT * FROM sign_in_account($1, $2)', [null, `sub-${user}`])).rows[0]).join(','));

// M5: the previous image's insert (no sign_in_began_at) still opens a session, and takes no lock on the account's row.
await beginAs(old, user);
const ins = await attempt(old, "INSERT INTO user_session (user_id, device_id, token_sha256, mfa_method) VALUES ($1, $2, $3, 'totp') RETURNING id, sign_in_began_at", [user, device.id, sha(uuid())]);
log('M5 previous image insert ->', ins.ok ? ins.rows[0] : ins);
log('M5 record_sign_in_with_mfa() after it ->', await attempt(old, 'SELECT record_sign_in_with_mfa() AS changed'));
await su.query('BEGIN');
log('M5 the account row is lockable by another transaction meanwhile (NO KEY UPDATE NOWAIT) ->', (await attempt(su, 'SELECT 1 FROM "user" WHERE id = $1 FOR NO KEY UPDATE NOWAIT', [user])).ok);
await su.query('ROLLBACK');
await old.query('COMMIT');

for (const c of [su, old, reader, owner, bystander]) await c.end();

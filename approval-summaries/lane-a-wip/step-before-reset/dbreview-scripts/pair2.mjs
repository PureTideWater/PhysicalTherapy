// Experiment D3: the reset's two passes against another caller of revoke_user_sessions() (membership end). Scratch only.
import { attempt, beginAs, connect, DB, log, makeDevice, makeSession, makeUser, sha, untilWaiting, uuid, waiting } from './h.mjs';
const su = await connect('su', 'su');
const design = (await su.query("SELECT to_regprocedure('audit_event_sign_in_not_before()') IS NOT NULL AS has")).rows[0].has;
const user = await makeUser(su);
const device = await makeDevice(su, user);
// A slot ahead of the old session in the table, for the session that commits during the reset.
const placeholder = await makeSession(su, user, device.id);
const old = await makeSession(su, user, device.id);
await su.query('DELETE FROM user_session WHERE id = $1', [placeholder.id]);
await su.query('VACUUM user_session');
const reset = await connect('app', 'reset');
const open = await connect('app', 'open');
const end = await connect('app', 'membership-end');
const RESET = "INSERT INTO audit_event (actor_id, actor_kind, action, object_type, object_id, purpose, request_id) VALUES ($1, 'user', 'password_reset_completed', 'user', $1, 'email_code', 'req-1')";
// 1. The reset ends the sessions it sees (the old one).
await beginAs(reset, user);
log(DB, 'the reset\'s revoke ended:', (await reset.query('SELECT revoke_user_sessions($1) AS n', [user])).rows[0].n);
// 2. A sign-in commits meanwhile.
await beginAs(open, user);
const fresh = design
  ? await open.query("INSERT INTO user_session (user_id, device_id, token_sha256, mfa_method, sign_in_began_at) VALUES ($1, $2, $3, 'totp', clock_timestamp()) RETURNING id, ctid::text", [user, device.id, sha(uuid())])
  : await open.query("INSERT INTO user_session (user_id, device_id, token_sha256, mfa_method) VALUES ($1, $2, $3, 'totp') RETURNING id, ctid::text", [user, device.id, sha(uuid())]);
await open.query('COMMIT');
log('row places (new session, old session):', fresh.rows[0].ctid, (await su.query('SELECT ctid::text FROM user_session WHERE id = $1', [old.id])).rows[0].ctid);
// 3. An administrator ends the person's membership: revoke_user_sessions() (here as the person; the lock order is the function's).
await beginAs(end, user);
const ending = attempt(end, 'SELECT revoke_user_sessions($1) AS n', [user]);
log('3. the other revoke waits on:', (await untilWaiting(su, 'membership-end'))?.blockers);
// 4. The reset records its event: the stamp, then the sweep.
const resetting = attempt(reset, RESET, [user]);
await untilWaiting(su, 'reset', 800);
log('wait graph:', JSON.stringify((await waiting(su)).map((w) => `${w.who} -> ${w.blockers}`)));
const settle = async (c, p) => { const r = await p; await c.query(r.ok ? 'COMMIT' : 'ROLLBACK'); return r; };
const [a, b] = await Promise.all([settle(reset, resetting), settle(end, ending)]);
log('reset:', a.ok ? 'ok' : a.code, '| the other revoke:', b.ok ? 'ok' : b.code);
for (const c of [su, reset, open, end]) await c.end();

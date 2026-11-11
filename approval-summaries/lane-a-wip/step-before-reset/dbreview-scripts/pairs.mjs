// Experiment P: the key-share to no-key-update step on the account's row (D3's upgrade claim), with a failed sign-in queued. Scratch only.
import { attempt, beginAs, connect, log, makeUser, sha, sleep, untilWaiting, uuid, waiting } from './h.mjs';
const su = await connect('su', 'su');
const user = await makeUser(su);
const a = await connect('app', 'open-a');
const b = await connect('app', 'open-b');
const f = await connect('app', 'fail');
const r = await connect('app', 'reset');
const DEVICE = "INSERT INTO user_device (user_id, token_sha256, label) VALUES ($1, $2, 'Chrome on Linux') RETURNING id";
const OPEN = "INSERT INTO user_session (user_id, device_id, token_sha256, mfa_method, sign_in_began_at) VALUES ($1, $2, $3, 'totp', clock_timestamp())";
const RESET = "INSERT INTO audit_event (actor_id, actor_kind, action, object_type, object_id, purpose, request_id) VALUES ($1, 'user', 'password_reset_completed', 'user', $1, 'email_code', 'req-1')";
// Two sign-ins from two new devices each hold KEY SHARE on the account's row (the device's foreign key) ...
await beginAs(a, user);
const da = (await a.query(DEVICE, [user, sha(uuid())])).rows[0].id;
await beginAs(b, user);
const db = (await b.query(DEVICE, [user, sha(uuid())])).rows[0].id;
// ... the reset holds one too (the notice's foreign key) and then asks for the row ...
await beginAs(r, user);
await r.query('SELECT revoke_user_sessions($1)', [user]);
// ... and a failed sign-in queues for FOR UPDATE behind them.
const failing = attempt(f, "SELECT failures FROM sign_in_failed($1, 'password', 'req-1')", [user]);
log('failed sign-in waits on:', (await untilWaiting(su, 'fail'))?.blockers);
const ia = attempt(a, OPEN, [user, da, sha(uuid())]);
await sleep(150);
const ib = attempt(b, OPEN, [user, db, sha(uuid())]);
const ir = attempt(r, RESET, [user]);
await sleep(300);
log('wait graph with all four in flight:', JSON.stringify((await waiting(su)).map((w) => `${w.who} -> ${w.blockers} (${w.event})`)));
const ra = await ia;
await a.query(ra.ok ? 'COMMIT' : 'ROLLBACK');
const [rb, rr] = await Promise.all([ib.then(async (x) => (await b.query(x.ok ? 'COMMIT' : 'ROLLBACK'), x)), ir.then(async (x) => (await r.query(x.ok ? 'COMMIT' : 'ROLLBACK'), x))]);
const rf = await failing;
const code = (x) => (x.ok ? 'ok' : `${x.code} ${x.constraint ?? ''}`);
log('open-a:', code(ra), '| open-b:', code(rb), '| reset:', code(rr), '| failed sign-in:', code(rf));
log('sessions:', JSON.stringify((await su.query('SELECT ended_at IS NOT NULL AS ended FROM user_session WHERE user_id = $1 ORDER BY created_at', [user])).rows));
for (const c of [su, a, b, f, r]) await c.end();

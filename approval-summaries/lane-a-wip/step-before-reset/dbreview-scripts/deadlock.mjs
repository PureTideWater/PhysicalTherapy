// Experiment D: lock cycles. Scratch only.
//   D1 (the design): reset (R_user -> R_session in the sweep), resolve_session (R_session -> R_device), a second sign-in on that device (R_device -> R_user).
//   D2 (control, the tree before the change, DBNAME=tp_w8_dbreview_base): the same three transactions.
import { attempt, beginAs, connect, DB, log, makeDevice, makeUser, sleep, sha, untilWaiting, uuid, waiting } from './h.mjs';

const su = await connect('su', 'su');
const design = (await su.query("SELECT to_regprocedure('audit_event_sign_in_not_before()') IS NOT NULL AS has")).rows[0].has;
log(`database ${DB}; the design's triggers present: ${design}; deadlock_timeout: ${(await su.query('SHOW deadlock_timeout')).rows[0].deadlock_timeout}`);
const RESET = "INSERT INTO audit_event (actor_id, actor_kind, action, object_type, object_id, purpose, request_id) VALUES ($1, 'user', 'password_reset_completed', 'user', $1, 'email_code', 'req-1')";
const OPEN = design
  ? "INSERT INTO user_session (user_id, device_id, token_sha256, mfa_method, sign_in_began_at) VALUES ($1, $2, $3, 'totp', clock_timestamp()) RETURNING id"
  : "INSERT INTO user_session (user_id, device_id, token_sha256, mfa_method) VALUES ($1, $2, $3, 'totp') RETURNING id";
const TOUCH = 'UPDATE user_device SET last_seen_at = now(), label = $2 WHERE id = $1';

const user = await makeUser(su);
const device = await makeDevice(su, user);
const reset = await connect('app', 'reset');
const open1 = await connect('app', 'open1');
const open2 = await connect('app', 'open2');
const resolve = await connect('app', 'resolve');

// a. The reset begins and ends the sessions it sees (none yet), exactly as confirmPasswordReset does.
await beginAs(reset, user);
await reset.query('SELECT revoke_user_sessions($1)', [user]);
// b. A sign-in completes meanwhile (openSession, whole): its session is committed after the revoke's snapshot.
const token = sha(uuid());
await beginAs(open1, user);
await open1.query(TOUCH, [device.id, 'Chrome on Linux']);
await open1.query(OPEN, [user, device.id, token]);
await open1.query('SELECT sign_in_succeeded($1)', [user]);
await open1.query('SELECT record_sign_in_with_mfa()');
await open1.query('COMMIT');
// c. A second sign-in on the same browser reaches openSession's device statement.
await beginAs(open2, user);
await open2.query(TOUCH, [device.id, 'Chrome on Linux']);
// d. A request with the new session's cookie: resolve_session() locks the session, then touches the device.
const resolving = attempt(resolve, 'SELECT outcome FROM resolve_session($1)', [token]);
log('d. resolve_session waits on:', (await untilWaiting(su, 'resolve'))?.blockers);
// e. The reset records its event: the stamp takes the account's row, the sweep wants the new session.
const resetting = attempt(reset, RESET, [user]);
const e = await untilWaiting(su, 'reset', 1500);
log('e. the reset waits on:', e?.blockers ?? '(nothing: it finished)');
// f. The second sign-in inserts its session: the insert trigger wants the account's row.
const opening = attempt(open2, OPEN, [user, device.id, sha(uuid())]);
const f = await untilWaiting(su, 'open2', 1500);
log('f. the second sign-in waits on:', f?.blockers ?? '(nothing: it finished)');
log('wait graph:', JSON.stringify((await waiting(su)).map((w) => `${w.who} -> ${w.blockers}`)));
const started = Date.now();
// Each transaction ends as its real caller would: commit on success, roll back on an error.
const settle = async (c, pending) => {
  const r = await pending;
  await c.query(r.ok ? 'COMMIT' : 'ROLLBACK');
  return r;
};
const [r1, r2, r3] = await Promise.all([settle(reset, resetting), settle(open2, opening), resolving]);
const results = { reset: r1, open2: r2, resolve: r3 };
log('settled after ms:', Date.now() - started);
for (const [who, r] of Object.entries(results)) log(`  ${who}:`, r.ok ? 'ok' : `${r.code} ${r.message.split('\n')[0]}`);
log('sessions:', JSON.stringify((await su.query('SELECT ended_at IS NOT NULL AS ended, end_reason FROM user_session WHERE user_id = $1 ORDER BY created_at', [user])).rows));
for (const c of [su, reset, open1, open2, resolve]) await c.end();

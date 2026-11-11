// Experiment S: who can fire the triggers, what they reveal, and the values they accept. Scratch only.
import { attempt, beginAs, connect, log, makeDevice, makeSession, makeUser, sleep, sha, untilWaiting, uuid } from './h.mjs';

const su = await connect('su', 'su');
const x = await makeUser(su);
const y = await makeUser(su);
const xd = await makeDevice(su, x);
const yd = await makeDevice(su, y);
const ys = await makeSession(su, y, yd.id);
const app = await connect('app', 'app-x');
const show = (r) => (r.ok ? `ok ${JSON.stringify(r.rows ?? [])}` : `${r.code}${r.constraint ? ' ' + r.constraint : ''} ${r.message.split('\n')[0].slice(0, 90)}`);
const inTx = async (c, actor, run) => {
  await beginAs(c, actor);
  try {
    return await run();
  } finally {
    await c.query('ROLLBACK');
  }
};
const yState = async () => (await su.query('SELECT (SELECT sign_in_not_before FROM "user" WHERE id = $1) AS mark, (SELECT count(*)::int FROM user_session WHERE user_id = $1 AND ended_at IS NULL) AS live', [y])).rows[0];

// S1: the application role's own row lock on "user" (D3 says it holds no row-lock right).
log('S1 tp_app, acting as X: SELECT ... FROM "user" WHERE id = X FOR NO KEY UPDATE ->', show(await inTx(app, x, () => attempt(app, 'SELECT id FROM "user" WHERE id = $1 FOR NO KEY UPDATE', [x]))));
log('S1 tp_app, acting as X: the same for Y ->', show(await inTx(app, x, () => attempt(app, 'SELECT id FROM "user" WHERE id = $1 FOR NO KEY UPDATE', [y]))));

// S2: what an audit_event insert by the application role, acting as X, can do to Y.
const EVENT = 'INSERT INTO audit_event (actor_id, actor_kind, action, object_type, object_id) VALUES ($1, $2, $3, $4, $5)';
for (const [label, values] of [
  ['actor Y (not the transaction\'s actor)', [y, 'user', 'password_reset_completed', 'user', y]],
  ['actor X, object Y', [x, 'user', 'password_reset_completed', 'user', y]],
  ['actor X as a service, object X', [x, 'service', 'password_reset_completed', 'user', x]],
  ['actor X, object type membership, object X', [x, 'user', 'password_reset_completed', 'membership', x]],
]) {
  await beginAs(app, x);
  const r = await attempt(app, EVENT, values);
  if (r.ok) await app.query('COMMIT');
  else await app.query('ROLLBACK');
  log(`S2 ${label} ->`, r.ok ? 'recorded' : r.code, '| Y:', JSON.stringify(await yState()), '| X mark:', (await su.query('SELECT sign_in_not_before FROM "user" WHERE id = $1', [x])).rows[0].sign_in_not_before);
}

// S3: the insert trigger runs before the row-level policy: what acting as X learns about Y, and what it locks.
await su.query(`UPDATE "user" SET sign_in_not_before = '2026-11-01 00:00:00+00' WHERE id = $1`, [y]);
const INSERT = "INSERT INTO user_session (user_id, device_id, token_sha256, mfa_method, sign_in_began_at) VALUES ($1, $2, $3, 'totp', $4)";
log('S3 acting as X, a session for Y begun before Y\'s mark ->', show(await inTx(app, x, () => attempt(app, INSERT, [y, yd.id, sha(uuid()), '2026-10-31 00:00:00+00']))));
log('S3 acting as X, a session for Y begun after Y\'s mark  ->', show(await inTx(app, x, () => attempt(app, INSERT, [y, yd.id, sha(uuid()), '2026-11-02 00:00:00+00']))));
{
  // The lock on Y's row, taken as the owner before the policy refuses the row: does it wait behind Y's own transaction?
  const holder = await connect('su', 'holder');
  await holder.query('BEGIN');
  await holder.query('SELECT 1 FROM "user" WHERE id = $1 FOR NO KEY UPDATE', [y]);
  await beginAs(app, x);
  const pending = attempt(app, INSERT, [y, yd.id, sha(uuid()), '2026-11-02 00:00:00+00']);
  const w = await untilWaiting(su, 'app-x', 800);
  log('S3 acting as X, the same insert while Y\'s row is locked elsewhere: waits on ->', w?.blockers ?? '(does not wait)');
  await holder.query('ROLLBACK');
  await pending;
  await app.query('ROLLBACK');
  await holder.end();
}

// S4: the value the application role may put in sign_in_began_at.
await su.query('UPDATE "user" SET sign_in_not_before = clock_timestamp() WHERE id = $1', [x]);
for (const value of ['infinity', '2099-01-01 00:00:00+00']) {
  log(`S4 acting as X, own session with sign_in_began_at = ${value} after X's reset ->`, show(await inTx(app, x, () => attempt(app, INSERT + ' RETURNING sign_in_began_at::text', [x, xd.id, sha(uuid()), value]))));
}
log('S4 tp_app UPDATE user_session.sign_in_began_at ->', show(await inTx(app, y, () => attempt(app, 'UPDATE user_session SET sign_in_began_at = now() WHERE id = $1', [ys.id]))));
log('S4 tp_app UPDATE "user".sign_in_not_before ->', show(await inTx(app, x, () => attempt(app, 'UPDATE "user" SET sign_in_not_before = NULL WHERE id = $1', [x]))));
log('S4 tp_app reads another account\'s mark (X administers nobody) ->', show(await inTx(app, x, () => attempt(app, 'SELECT sign_in_not_before FROM "user" WHERE id = $1', [y]))));

// S5: sign_in_step_current().
const cur = async (c, user, began) => (await c.query('SELECT sign_in_step_current($1, $2) AS ok', [user, began])).rows[0].ok;
const z = await makeUser(su);
log('S5 unknown user:', await cur(app, uuid(), new Date()), '| NULL mark:', await cur(app, z, new Date()), '| NULL mark, NULL began:', await cur(app, z, null), '| NULL user:', await cur(app, null, new Date()));
log('S5 Y (mark 2026-11-01): before', await cur(app, y, '2026-10-31T00:00:00Z'), '| at', await cur(app, y, '2026-11-01T00:00:00Z'), '| after', await cur(app, y, '2026-11-01T00:00:00.001Z'), '| NULL', await cur(app, y, null), '| infinity', await cur(app, y, 'infinity'));
log('S5 no actor set at all, any account:', await cur(app, y, '2026-11-02T00:00:00Z'));
// A STABLE function under a snapshot taken before the stamp (a caller in REPEATABLE READ).
{
  const rr = await connect('app', 'rr');
  await rr.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
  await rr.query('SELECT 1 FROM "user" LIMIT 1');
  await su.query('UPDATE "user" SET sign_in_not_before = clock_timestamp() WHERE id = $1', [z]);
  log('S5 in a snapshot older than the stamp, a step begun before it:', await cur(rr, z, new Date(Date.now() - 60000)), '(a fresh statement answers', await cur(app, z, new Date(Date.now() - 60000)), ')');
  await rr.query('ROLLBACK');
  await rr.end();
}

// S6: the sweep meets a session another transaction is ending (user_session_end_is_final must not fire).
{
  const u = await makeUser(su);
  const d = await makeDevice(su, u);
  const s = await makeSession(su, u, d.id);
  const out = await connect('app', 'sign-out');
  const rs = await connect('app', 'reset');
  await beginAs(rs, u);
  await rs.query('SELECT 1'); // the reset has begun, and skips its own revoke here so the sweep does the work
  await beginAs(out, u);
  await out.query("UPDATE user_session SET ended_at = now(), end_reason = 'signed_out' WHERE id = $1 AND ended_at IS NULL", [s.id]);
  const pending = attempt(rs, EVENT, [u, 'user', 'password_reset_completed', 'user', u]);
  log('S6 the sweep waits on:', (await untilWaiting(su, 'reset'))?.blockers);
  await out.query('COMMIT');
  const r = await pending;
  await rs.query(r.ok ? 'COMMIT' : 'ROLLBACK');
  log('S6 reset ->', r.ok ? 'ok' : show(r), JSON.stringify((await su.query('SELECT end_reason, ended_at >= started_at AS ordered FROM user_session WHERE id = $1', [s.id])).rows[0]));
  await out.end();
  await rs.end();
}

// S7: GREATEST: a mark ahead of the clock stays, and refuses every sign-in until the clock passes it.
{
  const u = await makeUser(su);
  const d = await makeDevice(su, u);
  await su.query(`UPDATE "user" SET sign_in_not_before = clock_timestamp() + interval '2 hours' WHERE id = $1`, [u]);
  await beginAs(app, u);
  await app.query(EVENT, [u, 'user', 'password_reset_completed', 'user', u]);
  await app.query('COMMIT');
  const ahead = (await su.query('SELECT sign_in_not_before > clock_timestamp() AS ahead FROM "user" WHERE id = $1', [u])).rows[0].ahead;
  const began = (await app.query('SELECT sign_in_step_began() AS b')).rows[0].b;
  log('S7 after a reset, a mark set two hours ahead is still ahead:', ahead, '| a sign-in begun now ->', show(await inTx(app, u, () => attempt(app, INSERT, [u, d.id, sha(uuid()), began]))));
}

// S8: row_security off in the caller's session.
{
  const u = await makeUser(su);
  const d = await makeDevice(su, u);
  await app.query('SET row_security = off');
  await beginAs(app, u);
  log('S8 row_security off: the insert with a began ->', show(await attempt(app, INSERT, [u, d.id, sha(uuid()), new Date()])));
  await app.query('ROLLBACK');
  await app.query('RESET row_security');
}
await sleep(10);
for (const c of [su, app]) await c.end();

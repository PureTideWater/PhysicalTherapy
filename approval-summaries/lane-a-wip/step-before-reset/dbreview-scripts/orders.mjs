// Experiment O: the two lock orders of D3, and the interleavings around them. Scratch only.
import { attempt, beginAs, connect, log, makeDevice, makeSession, makeUser, sleep, sha, untilWaiting, uuid } from './h.mjs';

const su = await connect('su', 'su');
const clock = async () => (await su.query('SELECT clock_timestamp()::text AS t')).rows[0].t;
const state = async (user) =>
  (await su.query(
    `SELECT (SELECT sign_in_not_before::text FROM "user" WHERE id = $1) AS mark,
            (SELECT json_agg(json_build_object('began', sign_in_began_at::text, 'ended', ended_at IS NOT NULL, 'reason', end_reason) ORDER BY created_at, id) FROM user_session WHERE user_id = $1) AS sessions`,
    [user],
  )).rows[0];
const RESET = "INSERT INTO audit_event (actor_id, actor_kind, action, object_type, object_id, purpose, request_id) VALUES ($1, 'user', 'password_reset_completed', 'user', $1, 'email_code', 'req-1')";
const OPEN = "INSERT INTO user_session (user_id, device_id, token_sha256, mfa_method, sign_in_began_at) VALUES ($1, $2, $3, 'totp', $4) RETURNING id";
const began = async (c) => (await c.query('SELECT sign_in_step_began() AS began')).rows[0].began;

async function world() {
  const user = await makeUser(su);
  const device = await makeDevice(su, user);
  const old = await makeSession(su, user, device.id);
  return { user, device, old };
}

// ---- O1: the session's transaction wins the lock; the reset waits, then sweeps it.
for (const variant of ['lock only', 'row also updated by sign_in_succeeded']) {
  const { user, device } = await world();
  if (variant !== 'lock only') await su.query('UPDATE "user" SET failed_sign_ins = 3 WHERE id = $1', [user]);
  const a = await connect('app', 'open');
  const b = await connect('app', 'reset');
  const stale = await began(a);
  await beginAs(a, user);
  await a.query('UPDATE user_device SET last_seen_at = now(), label = $2 WHERE id = $1', [device.id, 'Chrome on Linux']);
  const opened = await a.query(OPEN, [user, device.id, sha(uuid()), stale]);
  await beginAs(b, user);
  log(`O1 [${variant}] revoke before the event ended:`, (await b.query('SELECT revoke_user_sessions($1) AS n', [user])).rows[0].n, '(the old session only)');
  const resetting = attempt(b, RESET, [user]);
  const w = await untilWaiting(su, 'reset');
  log(`O1 [${variant}] the reset's stamp waits on:`, w?.blockers, w?.event);
  await sleep(1500);
  await a.query('SELECT sign_in_succeeded($1)', [user]);
  await a.query('SELECT record_sign_in_with_mfa()');
  const wonAt = await clock();
  await a.query('COMMIT');
  log(`O1 [${variant}] reset's insert:`, (await resetting).ok);
  await b.query('COMMIT');
  const s = await state(user);
  const mine = (await su.query('SELECT ended_at IS NOT NULL AS ended, end_reason FROM user_session WHERE id = $1', [opened.rows[0].id])).rows[0];
  log(`O1 [${variant}] the session that won the lock:`, mine);
  log(`O1 [${variant}] mark:`, s.mark, '| the lock was released (session committed) after:', wonAt, '| mark before that:', new Date(s.mark) < new Date(wonAt));
  await a.end();
  await b.end();
}

// ---- O2: the reset wins; a stale insert waits, re-reads the mark and is refused; a fresh one waits and passes.
{
  const { user, device } = await world();
  const a = await connect('app', 'open-stale');
  const f = await connect('app', 'open-fresh');
  const b = await connect('app', 'reset');
  const stale = await began(a);
  await beginAs(b, user);
  await b.query('SELECT revoke_user_sessions($1)', [user]);
  log('O2 reset insert (stamp and sweep, uncommitted):', (await attempt(b, RESET, [user])).ok);
  const fresh = await began(f);
  await beginAs(a, user);
  await beginAs(f, user);
  const staleInsert = attempt(a, OPEN, [user, device.id, sha(uuid()), stale]);
  const w = await untilWaiting(su, 'open-stale');
  log('O2 the stale insert waits on:', w?.blockers, w?.event);
  const freshInsert = attempt(f, OPEN, [user, device.id, sha(uuid()), fresh]);
  await sleep(300);
  await b.query('COMMIT');
  const r = await staleInsert;
  log('O2 stale insert after the reset commits ->', r.ok ? 'OPENED (wrong)' : `${r.code} ${r.constraint}`);
  await a.query('ROLLBACK');
  const r2 = await freshInsert;
  log('O2 fresh insert (began after the stamp) ->', r2.ok ? 'opened' : `${r2.code} ${r2.constraint}`);
  await f.query('COMMIT');
  log('O2 state:', JSON.stringify(await state(user)));
  // Equality and the microsecond around it.
  const mark = (await su.query('SELECT sign_in_not_before AS m FROM "user" WHERE id = $1', [user])).rows[0].m;
  for (const [label, expr] of [['at the mark', "$4::timestamptz"], ['one microsecond after', "$4::timestamptz + interval '1 microsecond'"]]) {
    await beginAs(a, user);
    const q = await attempt(a, `INSERT INTO user_session (user_id, device_id, token_sha256, mfa_method, sign_in_began_at) VALUES ($1, $2, $3, 'totp', (SELECT sign_in_not_before FROM "user" WHERE id = $1) + ${label === 'at the mark' ? "interval '0'" : "interval '1 microsecond'"})`, [user, device.id, sha(uuid())]);
    log(`O2 began ${label} ->`, q.ok ? 'opened' : `${q.code} ${q.constraint}`);
    await a.query('ROLLBACK');
  }
  void mark;
  for (const c of [a, f, b]) await c.end();
}

// ---- O3: the previous image's insert (no began) commits while the reset runs: nothing waits, the session survives (the design's known limit).
{
  const { user, device } = await world();
  const a = await connect('app', 'open-previous-image');
  const b = await connect('app', 'reset');
  await beginAs(a, user);
  await a.query("INSERT INTO user_session (user_id, device_id, token_sha256, mfa_method) VALUES ($1, $2, $3, 'totp')", [user, device.id, sha(uuid())]);
  await beginAs(b, user);
  await b.query('SELECT revoke_user_sessions($1)', [user]);
  const r = await attempt(b, RESET, [user]);
  await a.query('COMMIT');
  await b.query('COMMIT');
  log('O3 previous image: reset ok', r.ok, JSON.stringify(await state(user)));
  await a.end();
  await b.end();
}

// ---- O4: the same event recorded by a REPEATABLE READ transaction: the sweep reads the old snapshot.
{
  const { user, device } = await world();
  const a = await connect('app', 'open');
  const b = await connect('app', 'reset-rr');
  const stale = await began(a);
  await beginAs(b, user, 'BEGIN ISOLATION LEVEL REPEATABLE READ');
  await b.query('SELECT 1 FROM user_session LIMIT 1'); // the snapshot is taken here
  await beginAs(a, user);
  await a.query(OPEN, [user, device.id, sha(uuid()), stale]);
  await a.query('COMMIT');
  const n = (await b.query('SELECT revoke_user_sessions($1) AS n', [user])).rows[0].n;
  const r = await attempt(b, RESET, [user]);
  await b.query(r.ok ? 'COMMIT' : 'ROLLBACK');
  log('O4 repeatable read: revoke ended', n, '; event recorded:', r.ok ? 'yes' : r.code, JSON.stringify(await state(user)));
  await a.end();
  await b.end();
}

for (const c of [su]) await c.end();

// Experiment X: every transaction that touches an account's row, sessions and devices, as its real statement sequence,
// run at once against two accounts under deliberately unrealistic contention. Counts deadlocks (40P01) by who was in the cycle.
// DBNAME=tp_w8_dbreview_1 (the design) or tp_w8_dbreview_base (the tree before the change). Scratch only.
import { connect, DB, log, makeDevice, makeUser, sha, sleep, uuid } from './h.mjs';

const SECONDS = Number(process.argv[2] ?? 30);
const CLIENTS = Number(process.argv[3] ?? 24);
const LOCK_FIRST = process.env.LOCK_FIRST === '1';
const LOCK_OPEN = LOCK_FIRST || process.env.LOCK_OPEN === '1';
const LOCK_RESET = LOCK_FIRST || process.env.LOCK_RESET === '1'; // variant: openSession and the reset take the account's row before anything else
const ACCOUNT = 'SELECT 1 FROM "user" WHERE id = $1 FOR NO KEY UPDATE';
const samples = [];
const su = await connect('su', 'su');
const design = (await su.query("SELECT to_regprocedure('audit_event_sign_in_not_before()') IS NOT NULL AS has")).rows[0].has;
const users = [];
for (let i = 0; i < 2; i += 1) {
  const id = await makeUser(su);
  users.push({ id, devices: [await makeDevice(su, id), await makeDevice(su, id)], sessions: [] });
}
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const jitter = () => sleep(Math.random() * 3);
const current = new Map(); // backend pid -> the operation it is running
const counts = {};
const cycles = {};
const errors = {};
const bump = (o, k) => {
  o[k] = (o[k] ?? 0) + 1;
};

async function tx(c, user, run) {
  await c.query('BEGIN');
  try {
    await c.query("SELECT set_config('app.actor_id', $1, true), set_config('app.practice_ids', '{}', true)", [user.id]);
    const out = await run();
    await c.query('COMMIT');
    return out;
  } catch (error) {
    await c.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
}
const audit = (c, user, action, type = 'user') =>
  c.query('INSERT INTO audit_event (actor_id, actor_kind, action, object_type, object_id, request_id) VALUES ($1, $2, $3, $4, $1, $5)', [user.id, 'user', action, type, 'req-x']);
const key = (c, user) => c.query('INSERT INTO mutation_request (user_id, request_key, route_id) VALUES (app_actor_id(), $1, $2) ON CONFLICT (user_id, request_key) DO NOTHING', [uuid(), 'x.y']);

const ops = {
  // openSession (apps/web/src/lib/auth/sessions.ts), a known device or a new one.
  async open(c, user) {
    const began = design ? (await c.query('SELECT sign_in_step_began() AS b')).rows[0].b : undefined;
    await jitter();
    const token = sha(uuid());
    const fresh = Math.random() < 0.25;
    await tx(c, user, async () => {
      if (LOCK_OPEN) await c.query(ACCOUNT, [user.id]);
      let device = pick(user.devices);
      const known = (await c.query('SELECT id, revoked_at IS NOT NULL AS revoked FROM user_device WHERE user_id = $1 AND token_sha256 = $2', [user.id, sha(device.token)])).rows[0];
      await jitter();
      if (fresh || known === undefined || known.revoked) {
        const t = uuid();
        await c.query('SELECT EXISTS (SELECT 1 FROM user_device WHERE user_id = $1) AS had', [user.id]);
        const id = (await c.query('INSERT INTO user_device (user_id, token_sha256, label) VALUES ($1, $2, $3) RETURNING id', [user.id, sha(t), 'Chrome on Linux'])).rows[0].id;
        device = { id, token: t };
      } else {
        await c.query('UPDATE user_device SET last_seen_at = now(), label = $2 WHERE id = $1', [device.id, 'Chrome on Linux']);
      }
      await jitter();
      if (design) await c.query("INSERT INTO user_session (user_id, device_id, token_sha256, mfa_method, sign_in_began_at) VALUES ($1, $2, $3, 'totp', $4)", [user.id, device.id, token, began]);
      else await c.query("INSERT INTO user_session (user_id, device_id, token_sha256, mfa_method) VALUES ($1, $2, $3, 'totp')", [user.id, device.id, token]);
      await jitter();
      await c.query('SELECT sign_in_succeeded($1)', [user.id]);
      await c.query('SELECT record_sign_in_with_mfa()');
      await audit(c, user, 'sign_in', 'user_session');
      if (fresh && user.devices.length < 4) user.devices.push(device);
    });
    user.sessions.push(token);
    if (user.sessions.length > 12) user.sessions.shift();
  },
  // confirmPasswordReset's transaction (sign-in.ts:533-538), retried once as it is there.
  async reset(c, user) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await tx(c, user, async () => {
          if (LOCK_RESET) await c.query(ACCOUNT, [user.id]);
          await c.query('SELECT revoke_user_sessions($1)', [user.id]);
          await jitter();
          await audit(c, user, 'password_reset_completed');
        });
        return;
      } catch (error) {
        if (attempt === 1) throw error;
        bump(counts, 'reset retried');
      }
    }
  },
  fail: (c, user) => c.query("SELECT * FROM sign_in_failed($1, 'password', 'req-x')", [user.id]),
  // console.unlock_user's write (unlock_user() needs a platform administrator; the same row update, here as the account)
  unlock: (c, user) => tx(c, user, () => c.query('SELECT sign_in_succeeded($1)', [user.id])),
  resolve: (c, user) => (user.sessions.length === 0 ? undefined : c.query('SELECT outcome FROM resolve_session($1)', [pick(user.sessions)])),
  // account.sign_out and account.revoke_device (selfRoute: the request key, the handler, the audit event).
  async signOut(c, user) {
    if (user.sessions.length === 0) return;
    await tx(c, user, async () => {
      await key(c, user);
      await jitter();
      await c.query("UPDATE user_session SET ended_at = now(), end_reason = 'signed_out' WHERE token_sha256 = $1 AND ended_at IS NULL", [pick(user.sessions)]);
      await audit(c, user, 'sign_out', 'user_session');
    });
  },
  async revokeDevice(c, user) {
    const device = pick(user.devices);
    await tx(c, user, async () => {
      await key(c, user);
      const r = await c.query('UPDATE user_device SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL RETURNING id', [device.id]);
      await jitter();
      if (r.rowCount > 0) await c.query("UPDATE user_session SET ended_at = now(), end_reason = 'device_revoked' WHERE device_id = $1 AND ended_at IS NULL", [device.id]);
      await audit(c, user, 'device_revoked', 'user_device');
    });
    if (user.devices.length > 2) user.devices.splice(user.devices.indexOf(device), 1);
  },
  // monitoring.ts:223, a person's own settings.
  async settings(c, user) {
    await tx(c, user, async () => {
      await key(c, user);
      await jitter();
      await c.query('UPDATE "user" SET settings = settings WHERE id = $1', [user.id]);
      await audit(c, user, 'notification_settings_changed');
    });
  },
  // settings.ts:1103 and console.ts:789 after a membership ends: the revoke, then a provider call inside the transaction.
  async membershipEnd(c, user) {
    await tx(c, user, async () => {
      await c.query('SELECT revoke_user_sessions($1)', [user.id]);
      await sleep(5 + Math.random() * 15);
      await audit(c, user, 'membership_ended', 'membership');
    });
  },
};
const weights = { open: 22, resolve: 30, reset: 10, fail: 6, unlock: 2, signOut: 8, revokeDevice: 6, settings: 8, membershipEnd: 8 };
const bag = Object.entries(weights).flatMap(([name, w]) => Array(w).fill(name));

const until = Date.now() + SECONDS * 1000;
async function worker(i) {
  const c = await connect('app', `w${String(i)}`);
  const pid = (await c.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
  while (Date.now() < until) {
    const name = pick(bag);
    current.set(pid, name);
    try {
      await ops[name](c, pick(users));
      bump(counts, name);
    } catch (error) {
      if (error.code === '40P01') {
        const pids = [...String(error.detail ?? '').matchAll(/Process (\d+) waits/g)].map((m) => Number(m[1]));
        const who = pids.map((p) => current.get(p) ?? '?').sort().join(' + ');
        bump(cycles, who);
        if (samples.length < 40) samples.push(String(error.detail).replace(/[Pp]rocess (\d+)/g, (_, p) => `[${current.get(Number(p)) ?? '?'}]`).replace(/ of database \d+/g, '').replace(/transaction \d+/g, 'a transaction'));
        bump(errors, `${name}: deadlock victim`);
      } else {
        bump(errors, `${name}: ${error.code ?? 'error'} ${error.constraint ?? ''}`.trim());
      }
    }
    current.delete(pid);
    await jitter();
  }
  await c.end();
}
await Promise.all(Array.from({ length: CLIENTS }, (_, i) => worker(i)));
log(`database ${DB} (the design's triggers: ${design}; account lock first in openSession: ${LOCK_OPEN}, in the reset: ${LOCK_RESET}); ${String(SECONDS)} s, ${String(CLIENTS)} connections, 2 accounts`);
log('completed:', JSON.stringify(counts));
log('refused or failed:', JSON.stringify(errors));
log('deadlocks by the operations in the cycle:', JSON.stringify(cycles));
if (design) {
  // The invariant: no live session whose sign-in began at or before its account's mark.
  const bad = (await su.query('SELECT count(*)::int AS n FROM user_session s JOIN "user" u ON u.id = s.user_id WHERE s.user_id = ANY ($1) AND s.ended_at IS NULL AND s.sign_in_began_at <= u.sign_in_not_before', [users.map((u) => u.id)])).rows[0].n;
  log('live sessions begun at or before their account\'s mark:', bad);
}
if (process.env.SAMPLES) {
  const seen = new Set();
  for (const d of samples) {
    const k = d.replace(/\(\d+,\d+\)/g, '(t)').replace(/relation \d+/g, 'relation');
    if (!seen.has(k) && seen.size < Number(process.env.SAMPLES)) {
      seen.add(k);
      log('---\n' + d);
    }
  }
}
await su.end();

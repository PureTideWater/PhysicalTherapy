// Scratch harness for the database review (not for merge). Drives several connections against a scratch database.
import { createRequire } from 'node:module';
import { randomUUID, randomBytes, createHash } from 'node:crypto';

const require = createRequire('/home/user/step-before-reset/packages/db/package.json');
const pg = require('pg');

export const DB = process.env.DBNAME ?? 'tp_w8_dbreview_1';
const base = { host: 'localhost', port: 5433, database: DB };

export async function connect(kind, name) {
  const cfg = kind === 'app' ? { ...base, user: 'tp_app_dev', password: 'tp_app_dev' } : { ...base, user: 'postgres', password: 'test' };
  const c = new pg.Client({ ...cfg, application_name: name ?? kind });
  await c.connect();
  if (kind === 'owner') await c.query('SET ROLE tp_owner');
  c.tag = name ?? kind;
  return c;
}

export const sha = (s) => createHash('sha256').update(s).digest('hex');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const uuid = () => randomUUID();

/** A user with MFA, active, created by the superuser (bypasses row-level security). */
export async function makeUser(su, opts = {}) {
  const id = uuid();
  await su.query('INSERT INTO "user" (id, cognito_sub, email, mfa_enrolled, hardware_key_required, status) VALUES ($1, $2, $3, $4, false, $5)', [
    id,
    `sub-${id}`,
    `u-${id}@synthetic.test`,
    opts.mfa ?? true,
    opts.status ?? 'active',
  ]);
  return id;
}

export async function makeDevice(su, userId) {
  const token = randomBytes(16).toString('hex');
  const { rows } = await su.query("INSERT INTO user_device (user_id, token_sha256, label) VALUES ($1, $2, 'Chrome on Linux') RETURNING id", [userId, sha(token)]);
  return { id: rows[0].id, token };
}

export async function makeSession(su, userId, deviceId) {
  const token = randomBytes(16).toString('hex');
  const { rows } = await su.query("INSERT INTO user_session (user_id, device_id, token_sha256, mfa_method) VALUES ($1, $2, $3, 'totp') RETURNING id", [userId, deviceId, sha(token)]);
  return { id: rows[0].id, token, hash: sha(token) };
}

/** BEGIN + the actor, as withActor does (READ COMMITTED unless told otherwise). */
export async function beginAs(c, userId, begin = 'BEGIN') {
  await c.query(begin);
  await c.query("SELECT set_config('app.actor_id', $1, true), set_config('app.practice_ids', '{}', true)", [userId]);
}

/** What a connection is waiting for, as pg_stat_activity and pg_locks see it. */
export async function waiting(su) {
  const { rows } = await su.query(
    `SELECT a.application_name AS who, a.wait_event_type AS type, a.wait_event AS event, pg_blocking_pids(a.pid) AS blocked_by,
            (SELECT array_agg(b.application_name ORDER BY b.application_name) FROM pg_stat_activity b WHERE b.pid = ANY (pg_blocking_pids(a.pid))) AS blockers,
            left(a.query, 70) AS query
       FROM pg_stat_activity a
      WHERE a.datname = current_database() AND a.pid <> pg_backend_pid() AND a.wait_event_type = 'Lock'
      ORDER BY a.application_name`,
  );
  return rows;
}

/** Waits until the named connection is blocked on a lock (or gives up). */
export async function untilWaiting(su, who, ms = 5000) {
  const until = Date.now() + ms;
  for (;;) {
    const rows = await waiting(su);
    const row = rows.find((r) => r.who === who);
    if (row) return row;
    if (Date.now() > until) return undefined;
    await sleep(20);
  }
}

/** Runs a query and returns {ok, rows} or {error: code, constraint, message}; never throws. */
export function attempt(c, text, values) {
  return c.query(text, values).then(
    (r) => ({ ok: true, rows: r.rows, rowCount: r.rowCount }),
    (e) => ({ ok: false, code: e.code, constraint: e.constraint, message: e.message }),
  );
}

export function log(...parts) {
  console.log(...parts);
}

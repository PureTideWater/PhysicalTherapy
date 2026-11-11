// Experiment F: with the guards, a start read from sign_in_step_began() is never refused when no reset follows it. Scratch only.
import { connect, DB, log, makeDevice, makeUser, sha, uuid } from './h.mjs';
const su = await connect('su', 'su');
const app = await connect('app', 'app');
const never = await makeUser(su);
const once = await makeUser(su);
await su.query('UPDATE "user" SET sign_in_not_before = clock_timestamp() WHERE id = $1', [once]);
let opened = 0;
let refused = 0;
let current = 0;
for (const user of [never, once]) {
  const device = await makeDevice(su, user);
  for (let i = 0; i < 1000; i += 1) {
    const began = (await app.query('SELECT sign_in_step_began() AS b')).rows[0].b;
    if ((await app.query('SELECT sign_in_step_current($1, $2) AS ok', [user, began])).rows[0].ok) current += 1;
    await app.query('BEGIN');
    await app.query("SELECT set_config('app.actor_id', $1, true), set_config('app.practice_ids', '{}', true)", [user]);
    try {
      await app.query("INSERT INTO user_session (user_id, device_id, token_sha256, mfa_method, sign_in_began_at) VALUES ($1, $2, $3, 'totp', $4)", [user, device.id, sha(uuid()), began]);
      await app.query('COMMIT');
      opened += 1;
    } catch {
      await app.query('ROLLBACK');
      refused += 1;
    }
  }
}
log(DB, `2,000 sign-ins with a start read from sign_in_step_began(): current ${String(current)}, opened ${String(opened)}, refused ${String(refused)}`);
await su.end();
await app.end();

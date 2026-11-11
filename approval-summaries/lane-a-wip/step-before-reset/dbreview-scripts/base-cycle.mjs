// Control: a lock-order inversion the tree before the change already has (resolve_session: session -> device; revokeDevice: device -> session).
import { attempt, beginAs, connect, DB, log, makeDevice, makeSession, makeUser, untilWaiting, waiting } from './h.mjs';
const su = await connect('su', 'su');
const user = await makeUser(su);
const device = await makeDevice(su, user);
const session = await makeSession(su, user, device.id);
const revoke = await connect('app', 'revoke-device');
const resolve = await connect('app', 'resolve');
await beginAs(revoke, user);
await revoke.query('UPDATE user_device SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL RETURNING id', [device.id]);
const resolving = attempt(resolve, 'SELECT outcome FROM resolve_session($1)', [session.hash]);
log(DB, 'resolve_session waits on:', (await untilWaiting(su, 'resolve'))?.blockers);
const revoking = attempt(revoke, "UPDATE user_session SET ended_at = now(), end_reason = 'device_revoked' WHERE device_id = $1 AND ended_at IS NULL", [device.id]);
await untilWaiting(su, 'revoke-device', 800);
log('wait graph:', JSON.stringify((await waiting(su)).map((w) => `${w.who} -> ${w.blockers}`)));
const [a, b] = await Promise.all([revoking.then(async (r) => (await revoke.query(r.ok ? 'COMMIT' : 'ROLLBACK'), r)), resolving]);
log('revokeDevice:', a.ok ? 'ok' : a.code, '| resolve_session:', b.ok ? JSON.stringify(b.rows[0]) : b.code);
for (const c of [su, revoke, resolve]) await c.end();

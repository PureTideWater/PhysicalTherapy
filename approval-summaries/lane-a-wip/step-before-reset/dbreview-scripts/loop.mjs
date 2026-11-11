// Experiment L: the lock loop when the first table is free and the second is not (a partial try must release "user"). Scratch only.
import { attempt, connect, log, sleep } from './h.mjs';
process.env.DBNAME;
const su = await connect('su', 'su');
const holder = await connect('su', 'holder');
const owner = await connect('owner', 'migration');
const probe = await connect('app', 'probe');
await holder.query('BEGIN');
await holder.query('SELECT count(*) FROM user_session'); // ACCESS SHARE on user_session only
const LOOP = `DO $$ BEGIN
  FOR attempt IN 1..300 LOOP
    BEGIN
      LOCK TABLE "user" IN ACCESS EXCLUSIVE MODE NOWAIT;
      LOCK TABLE user_session IN ACCESS EXCLUSIVE MODE NOWAIT;
      LOCK TABLE audit_event IN SHARE ROW EXCLUSIVE MODE NOWAIT;
      RAISE NOTICE 'locks taken on try %', attempt;
      RETURN;
    EXCEPTION WHEN lock_not_available THEN PERFORM pg_sleep(1);
    END;
  END LOOP;
  RAISE EXCEPTION 'stayed in use' USING ERRCODE = 'lock_not_available';
END $$`;
owner.on('notice', (n) => log('migration:', n.message));
await owner.query('BEGIN');
const looping = attempt(owner, LOOP);
let worst = 0;
let reads = 0;
const until = Date.now() + 3500;
while (Date.now() < until) {
  const t = process.hrtime.bigint();
  await probe.query('SELECT * FROM sign_in_account($1, $2)', ['nobody@synthetic.test', null]);
  worst = Math.max(worst, Number(process.hrtime.bigint() - t) / 1e6);
  reads += 1;
}
log(`while the loop retried (user_session held elsewhere): ${String(reads)} reads of "user", the slowest ${worst.toFixed(1)} ms`);
await holder.query('ROLLBACK');
log('loop result:', (await looping).ok);
await owner.query('ROLLBACK');
for (const c of [su, holder, owner, probe]) await c.end();

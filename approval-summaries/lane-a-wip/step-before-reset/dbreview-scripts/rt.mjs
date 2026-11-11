// Experiment R: D2's value through node-postgres as a Date, both ways. Scratch only.
import { connect, log } from './h.mjs';
const c = await connect('app', 'rt');
const zone = process.argv[2] ?? 'UTC';
await c.query(`SET TimeZone = '${zone}'`);
let bad = 0;
let sample;
for (let i = 0; i < 1500; i += 1) {
  const { rows } = await c.query("WITH x AS (SELECT sign_in_step_began() AS b) SELECT b, b::text AS t, (extract(epoch FROM b) * 1000)::text AS ms, b = date_trunc('milliseconds', b) AS whole FROM x");
  const { b, t, ms, whole } = rows[0];
  const epoch = b.getTime();
  // Back as a Date (what openSession and the check would send), and as the epoch number the cookie holds, rebuilt.
  const back = await c.query('SELECT $1::timestamptz = $2::timestamptz AS same, $3::timestamptz = $2::timestamptz AS rebuilt, $4::timestamptz = $2::timestamptz AS iso', [b, t, new Date(epoch), new Date(epoch).toISOString()]);
  if (!whole || Number(ms) !== epoch || !back.rows[0].same || !back.rows[0].rebuilt || !back.rows[0].iso) bad += 1;
  sample = { text: t, epoch };
}
// Typed by the column and by the function's argument, with no cast.
const inferred = await c.query('SELECT sign_in_step_current($1, $2) IS NOT NULL AS typed', ['00000000-0000-0000-0000-000000000000', new Date(sample.epoch)]);
// The epoch number sent as it is.
const asNumber = await c.query('SELECT $1::timestamptz', [sample.epoch]).then(() => 'accepted', (e) => `${e.code} ${e.message.slice(0, 60)}`);
// to_timestamp(ms / 1000.0) over a spread of milliseconds.
const sweep = await c.query("SELECT count(*) FILTER (WHERE to_timestamp(ms / 1000.0) <> timestamptz 'epoch' + ms * interval '1 millisecond')::int AS off FROM generate_series(1762840000000::bigint, 1762840000000::bigint + 2000000, 1) ms");
log(`node TZ=${process.env.TZ ?? '(unset)'} session TimeZone=${zone}: 1500 values, mismatches ${bad}; last ${JSON.stringify(sample)}; parameter typed by the function: ${inferred.rows[0].typed}; epoch number as timestamptz: ${asNumber}; to_timestamp(ms/1000.0) off in 2,000,001: ${sweep.rows[0].off}`);
await c.end();

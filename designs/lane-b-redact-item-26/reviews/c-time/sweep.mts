// Review C-TIME, step 1: every crafted row in eight variants. Usage: sweep.mts <shard> <shards> <runs> [variants] [rows]
import { ROWS } from './rows.mts';
import { VARIANTS, fit, measure, record } from './lib.mts';
const [shard, shards, runs, vs, rs] = [Number(process.argv[2] ?? 0), Number(process.argv[3] ?? 1), Number(process.argv[4] ?? 2), process.argv[5] ?? '', process.argv[6] ?? ''];
const out = `${import.meta.dirname}/out/sweep-${rs === '' ? '' : `${rs.replaceAll(',', '_')}-`}${String(shard)}of${String(shards)}.jsonl`;
const warm = fit(ROWS[3]!, VARIANTS[0]!); measure(warm.text.slice(0, 21_000), warm.who, warm.claims, 2);
ROWS.forEach((row, i) => {
  if (i % shards !== shard || (rs !== '' && !rs.split(',').includes(row.id))) return;
  for (const v of VARIANTS) {
    if ((vs !== '' && !vs.split(',').includes(v.id)) || (row.asIsOnly === true && v.id !== 'a') || (row.intrinsic === true && v.id === 'c')) continue;
    const { text, who, claims, ...rest } = fit(row, v);
    const m = measure(text, who, claims, runs);
    const line = { row: row.id, v: v.id, note: row.note, names: row.names.join('|'), ...rest, ...m };
    record(out, line);
    console.log(`${row.id} ${v.id} len ${String(m.len)} work ${String((rest as { work?: number }).work ?? '-')} wider ${String((rest as { wider?: number }).wider ?? '-')} ${m.refused ? (m.bounded ? 'REFUSED(bound)' : 'refused') : 'sent'} best ${String(m.best)} worst ${String(m.worst)} cal ${String(m.cal)} ms ${m.ms.join(' ')}`);
  }
});

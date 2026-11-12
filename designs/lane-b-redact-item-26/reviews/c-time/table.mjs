// Review C-TIME: the sweep's table from out/sweep-*.jsonl. Each cell: best of the runs at reference speed, then S (sent), R (refused by the
// check) or B (refused by the bound's count). Usage: node table.mjs [md]
import { readFileSync, readdirSync } from 'node:fs';
const dir = `${import.meta.dirname}/out`;
const lines = readdirSync(dir).filter((f) => /^sweep-.*\.jsonl$/.test(f)).flatMap((f) => readFileSync(`${dir}/${f}`, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)));
const V = ['a', 'b1', 'b2', 'c', 'd1', 'd2', 'e', 'g'];
const rows = [...new Set(lines.map((l) => l.row))].sort();
const cell = (l) => (l === undefined ? '-' : `${l.best}${l.refused ? (l.bounded ? 'B' : 'R') : 'S'}${l.same ? '' : '!'}`);
console.log(`| row | names | letter (unit or shape) | ${V.join(' | ')} |`);
console.log(`|---|---|---|${V.map(() => '---').join('|')}|`);
for (const row of rows) {
  const of = Object.fromEntries(lines.filter((l) => l.row === row).map((l) => [l.v, l]));
  const any = Object.values(of)[0];
  console.log(`| ${row} | ${any.names} | ${String(any.note).replaceAll('|', '\\|').slice(0, 90)} | ${V.map((v) => cell(of[v])).join(' | ')} |`);
}
console.log('\nDearest of each variant (best of the sweep runs, ms at reference; len; work; wider; ms measured; calibration):');
for (const v of V) {
  const top = lines.filter((l) => l.v === v).sort((x, y) => y.best - x.best).slice(0, 4);
  console.log(`- ${v}: ${top.map((l) => `${l.row} ${l.best}-${l.worst}${l.refused ? (l.bounded ? 'B' : 'R') : 'S'} (len ${l.len}, work ${l.work ?? '-'}, wider ${l.wider ?? '-'}, ms ${l.ms.join('/')}, cal ${l.cal})`).join('; ')}`);
}
console.log('\nEvery cell at or above 2,400 ms at reference (best of the sweep runs):');
for (const l of lines.filter((x) => x.best >= 2400).sort((x, y) => y.best - x.best)) console.log(`- ${l.row} ${l.v}: best ${l.best} worst ${l.worst} ${l.refused ? (l.bounded ? 'refused(bound)' : 'refused') : 'sent'} len ${l.len} n ${l.n} work ${l.work ?? '-'} wider ${l.wider ?? '-'} ms ${l.ms.join('/')} cal ${l.cal}`);
console.log('\nRefused by the bound (B): slowest');
for (const l of lines.filter((x) => x.bounded).sort((x, y) => y.best - x.best).slice(0, 6)) console.log(`- ${l.row} ${l.v}: best ${l.best} worst ${l.worst} len ${l.len} ms ${l.ms.join('/')} cal ${l.cal}`);
console.log(`\n${lines.length} cells; answers that differed between runs: ${lines.filter((l) => !l.same).length}; letters over 100,000 characters: ${lines.filter((l) => l.len > 100000).map((l) => `${l.row} ${l.v} ${l.len}`).join(', ') || 'none'}`);
console.log(`wider variants with no wider match (the split found nothing): ${lines.filter((l) => ['c', 'd1', 'd2', 'g'].includes(l.v) && l.wider === 0).map((l) => `${l.row} ${l.v}`).join(', ') || 'none'}`);
console.log(`wider variants left over the bound by the fit: ${lines.filter((l) => l.work !== undefined && l.wider > 0 && l.work > 100000).map((l) => `${l.row} ${l.v} work ${l.work}`).join(', ') || 'none'}`);

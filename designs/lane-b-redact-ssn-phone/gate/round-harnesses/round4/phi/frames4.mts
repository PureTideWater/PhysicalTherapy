// Synthetic only. Find held frames: cc3dd7f6 refuses with a neutral token, B sends unchanged.
import { writeFileSync } from 'node:fs';
import { A, B, run } from './lib.mts';
const ranges = ['01/01/2020-01/02/2020', '1/1/20-1/2/20', '2020-01-01-2020-01-02', '2020-01-01–2020-01-02', '01.01.2020-01.02.2020', 'Jan 1, 2020-Jan 2, 2020', '01/01/2020 - 01/02/2020', '01/01/2020–150.00', '$150.00-$120.00', '150.00-120.00', '01/01/2020-150.00', '1/1/2020—$45.00', '03/01/2020−03/05/2020', '01/01/2020‐01/02/2020', '01/01/2020-\n01/02/2020'];
const glues = ['{T}', ' {T}', 'Paid {T}', 'Paid. {T}', '\n{T}'];
const pre = ['Paid $0,000.00. Service ', 'Seen ', 'DOS ', 'Billed $1,234.56. DOS '];
const post = [' $0,000.00', ' in full.', '', '. Allowed $0.00.'];
const frames: string[] = [];
const p = { names: ['JANE Q ZEPHYRA'] };
for (const r of ranges) for (const g of glues) for (const a of pre) for (const b of post) {
  const f = `${a}${r}${g}${b}`;
  const l = f.replace('{T}', 'Paid');
  const ra = run(A, l, p), rb = run(B, l, p);
  if (ra === 'REFUSED' && rb === l) frames.push(f);
}
// Also frames with the token before the range
for (const r of ranges) for (const a of pre) {
  for (const f of [`{T} ${a}${r}Paid $0,000.00`, `{T}${r}Paid in full.`, `Re: {T}. ${a}${r}Paid $0,000.00`]) {
    const l = f.replace('{T}', 'Paid');
    const ra = run(A, l, p), rb = run(B, l, p);
    if (ra === 'REFUSED' && rb === l) frames.push(f);
  }
}
writeFileSync(process.argv[2]!, JSON.stringify(frames, null, 0));
console.log('held frames', frames.length);

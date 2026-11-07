// Synthetic only. Does B mark a letter 'held' (held-only rules refuse it) that cc3dd7f6 sends? Token "Newborn 3 visits"
// fires only held rules (HELD_BIRTH_LABEL "BORN" + a digit). Hit: A sends the letter, B refuses it.
import { writeFileSync } from 'node:fs';
import { A, B, run } from './lib.mts';
const firsts = ['01/01/2020', '1/1/20', '2020-01-01', 'Jan 1, 2020', '150.00', '$150.00', '$1,234.56', '0.00', '12/31/2019', '03-01-2020', '2020/01/01', '1.1.2020'];
const dashes = ['-', '–', '—', '−', '‐', '‑', ' - ', ' to ', '-\n'];
const seconds = ['01/02/2020', '1/2/20', '2020-01-02', 'Jan 2, 2020', '120.00', '$120.00', '$45.00', '30.00', '01/15/2020', '2020/01/02'];
const glues = ['{T}', ' {T}', 'Paid {T}', '. {T}', 'Paid. {T}', 'St. {T}', 'TH {T}', '\n{T}', ', {T}'];
const pre = ['', 'Seen ', 'DOS ', 'Paid $0,000.00. Service ', 'Allowed 97110 ', 'ICN 1234567890123 DOS '];
const post = ['', ' $0,000.00', ' in full.', ' 97110 GP 1 unit'];
const p = { names: ['JANE Q ZEPHYRA'] };
const out: string[] = []; let n = 0; const by: Record<string, number> = {};
for (const f1 of firsts) for (const d of dashes) for (const s2 of seconds) for (const g of glues) for (const a of pre) for (const b of post) {
  if ((n++ % 7) !== 0) continue;
  const frame = `${a}${f1}${d}${s2}${g}${b}`;
  const l = frame.replace('{T}', 'Newborn 3 visits');
  const ctl = frame.replace('{T}', 'Newborn visits');
  const ra = run(A, l, p), rb = run(B, l, p);
  const k = `A:${ra === 'REFUSED' ? 'R' : 'S'} B:${rb === 'REFUSED' ? 'R' : 'S'}`;
  by[k] = (by[k] ?? 0) + 1;
  if (ra !== 'REFUSED' && rb === 'REFUSED') {
    const rbc = run(B, ctl, p);
    out.push(JSON.stringify({ l, a: ra === l ? 'SENT' : ra, ctlB: rbc === 'REFUSED' ? 'REFUSED' : 'SENT' }));
  }
}
writeFileSync(process.argv[2]!, out.join('\n') + '\n');
console.log('letters', Math.ceil(n / 7), 'A-sent B-refused', out.length, JSON.stringify(by));

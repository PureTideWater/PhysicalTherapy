// Synthetic only. Label-read DOB forms with wider gaps between parts, in held frames. A = cc3dd7f6, B = candidate.
import { writeFileSync } from 'node:fs';
import { A, B, run } from './lib.mts';
import { FRAMES } from './frames.mts';
const out: string[] = [];
const by: Record<string, number> = {};
let n = 0;
const DOBS = ['1980-03-14', '1975-11-02'];
const GAPS = ['  /  ', '   /   ', ' /    ', '     ', '      ', '\t\t\t', '/\n      ', ' -  ', '  -  ', '-\n\n\n', '/ \n  ', '  .  ', '   ', '  /  ', ' /   ', '/\r\n   '];
const MW = ['March', 'Nov'];
for (const dob of DOBS) {
  const [y, m, d] = dob.split('-');
  const y2 = y!.slice(2);
  const mw = dob.startsWith('1980') ? MW[0] : MW[1];
  const p = { names: ['JANE Q ZEPHYRA'], dob };
  const forms: string[] = [];
  for (const g of GAPS) {
    for (const [a, b, c] of [[y2, m, d], [y, d, m], [y2, d, m], [d, y2, m], [m, y2, d], [d, m, y2], [m, d, y2], [y, m, d], [m, d, y], [d, m, y]]) forms.push([a, b, c].join(g));
    for (const [a, b, c] of [[y2, mw, d], [d, y2, mw], [mw, y2, d], [y2, d, mw]]) forms.push([a, b, c].join(g.replace(/[/.-]/g, ' ')));
  }
  for (const t of new Set(forms)) {
    const lab = run(B, `DOB ${t} today.`, p);
    const plain = run(B, `Seen ${t} today.`, p);
    const labelRead = lab !== 'REFUSED' && !lab.includes(t);
    const plainRead = plain !== 'REFUSED' && !plain.includes(t);
    for (const f of FRAMES) {
      const l = f.replace('{T}', t);
      n++;
      const a = run(A, l, p), b = run(B, l, p);
      const clear = (x: string) => x !== 'REFUSED' && x.includes(t);
      if (clear(b) && !clear(a)) {
        const k = `${plainRead ? 'plain' : labelRead ? 'label' : 'unread'} A:${a === 'REFUSED' ? 'REF' : 'RED'}`;
        by[k] = (by[k] ?? 0) + 1;
        out.push(JSON.stringify({ dob, t, l, k, a: a === 'REFUSED' ? a : a === l ? 'SENT' : a, b: b === l ? 'SENT' : b, lab: lab === 'REFUSED' ? lab : lab }));
      }
    }
  }
}
writeFileSync(process.argv[2]!, out.join('\n') + '\n');
console.log('letters', n, 'hits', out.length, JSON.stringify(by));

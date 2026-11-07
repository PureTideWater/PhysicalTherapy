// Dirty variants for the prototype's exemptions: the name part split at the head the prototype exempts, glued to the time,
// ordinal or unit. Compare cc3dd7f6 (A), HEAD (B), prototype (P).
import fs from 'node:fs';
import { A, B, run, patient } from './lib.mts';
const P: any = (await import('./lib.mts')).B;
type Case = { names: string[]; head: string; rest: string; others: string; prefixes: string[] };
const cases: Case[] = [
  { names: ['AMAL AL HASSAN'], head: 'AM', rest: 'AL', others: 'HASSAN', prefixes: ['9-10', '9am-10', '10:00-11:00', '9.30', '0930', '9:30', '9', '8 - 9', '9/10'] },
  { names: ['AMAN AN ZEPHYRA'], head: 'AM', rest: 'AN', others: 'ZEPHYRA', prefixes: ['8-9', '9.30', '0930', '9'] },
  { names: ['NGUYEN THANH ANH'], head: 'TH', rest: 'ANH', others: '', prefixes: ['3rd-4', '3/4', '3-4', '4', 'March 3rd-4', '2-14'] },
  { names: ['MINSEO SEO'], head: 'MIN', rest: 'SEO', others: '', prefixes: ['30', '45', '1-2', '150.00', '$30', '2020'] },
  { names: ['MINHO HO'], head: 'MIN', rest: 'HO', others: '', prefixes: ['30', '45', '15'] },
  { names: ['HRISTO TO'], head: 'HR', rest: 'ISTO', others: '', prefixes: ['2', '1-2'] },
  { names: ['YOLANDA LANDA'], head: 'YO', rest: 'LANDA', others: '', prefixes: ['45', '30'] },
  { names: ['MOANA ANA'], head: 'MO', rest: 'ANA', others: '', prefixes: ['6', '3-6'] },
  { names: ['SECUNDA UNDA'], head: 'SEC', rest: 'UNDA', others: '', prefixes: ['30'] },
  { names: ['WKALA ALA'], head: 'WK', rest: 'ALA', others: '', prefixes: ['6'] },
];
const cases2 = cases.filter((c) => {
  // only keep cases where rest is indeed another part
  return true;
});
const contexts = [
  (x: string) => `Seen ${x} tolerated treatment.`,
  (x: string) => `Paid $0,000.00. Service 01/01/2020-01/02/2020 ${x} paid`,
  (x: string) => `Paid $0,000.00. Service 01/01/2020-01/02/2020${x} paid`,
  (x: string) => `Service 01/01/2020-01/02/2020 ${x}`,
  (x: string) => `DOB 03/14/1980 ${x} seen`,
  (x: string) => `Claim SYNCLAIM0001 ${x} paid $150.00`,
  (x: string) => `${x}`,
];
const cap = (w: string) => w ? w[0] + w.slice(1).toLowerCase() : w;
let total = 0; const out: string[] = []; const cnt: Record<string, number> = {};
for (const c of cases2) {
  for (const pre of c.prefixes) {
    for (const cs of [(w: string) => w, cap, (w: string) => w.toLowerCase()]) {
      const heads = [cs(c.head)];
      for (const h of heads) {
        const x = `${pre}${h} ${cs(c.rest)}${c.others ? ' ' + cs(c.others) : ''}`;
        contexts.forEach((ctx, k) => {
          const t = ctx(x);
          total++;
          const Pt = patient(c.names);
          const a = run(A, t, Pt), b = run(B, t, Pt), p = run(P, t, Pt);
          const key = `${a === 'REFUSED' ? 'Aref' : 'Asent'}/${b === 'REFUSED' ? 'Bref' : 'Bsent'}/${p === 'REFUSED' ? 'Pref' : 'Psent'}`;
          cnt[key] = (cnt[key] ?? 0) + 1;
          if (a === 'REFUSED' && p !== 'REFUSED') out.push(`P-SENDS-A-REFUSED [${c.names}] k${k} ${JSON.stringify(t)} B=${JSON.stringify(b)} P=${JSON.stringify(p)}`);
          else if (a !== 'REFUSED' && p !== 'REFUSED' && a !== p) out.push(`DIFF-A-P [${c.names}] ${JSON.stringify(t)} A=${JSON.stringify(a)} P=${JSON.stringify(p)}`);
        });
      }
    }
  }
}
fs.writeFileSync(process.argv[2]!, out.join('\n') + '\n');
console.log(`letters ${total} ${JSON.stringify(cnt)} flagged ${out.length}`);

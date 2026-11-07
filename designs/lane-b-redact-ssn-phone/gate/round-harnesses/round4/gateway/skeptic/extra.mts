import fs from 'node:fs';
import { A, B, run, patient } from './lib.mts';
const P: any = (await import('./lib.mts')).B;
const rows: [string[], string][] = [
  [['COLE LE'], 'Line 1: 97110CO Cole Le 02/14/2026 $45.00'],
  [['COLE LE'], 'Billed 97110CO Cole Le was seen.'],
  [['GORAN RAN'], 'Billed 97110GO Goran Ran was seen.'],
  [['INES ES'], 'Measured 5in Ines Es tolerated.'],
  [['MOANA ANA'], 'Follow-up in 6mo Moana Ana agreed.'],
  [['MINSEO SEO'], 'Seen 2-3x/wk for 30mins Minseo Seo attended.'],
  [['MINSEO SEO'], 'Session 30mins Minseo Seo attended.'],
  [['MINSEO SEO'], 'Session 1-30min Minseo Seo attended.'],
  [['AMAL AL HASSAN'], 'Seen 9AM-10AM Amal Al Hassan attended.'],
  [['AMAL AL HASSAN'], 'Seen 9:00am-10:30am Amal Al Hassan attended.'],
  [['AMAL AL HASSAN'], 'Seen 9–10am Amal Al Hassan attended.'],
  [['AMAL AL HASSAN'], 'Seen 9 - 10am Amal Al Hassan attended.'],
  [['AMAL AL HASSAN'], 'Seen 1400-1500am Amal Al Hassan attended.'],
  [['AMAL AL HASSAN'], 'On 02/14 9-10am Amal Al Hassan attended.'],
  [['AMAL AL HASSAN'], 'On 02/14/2026 9-10am Amal Al Hassan attended.'],
  [['AMAL AL HASSAN'], 'Paid $45.00 on 02/14/2026, 9-10am Amal Al Hassan attended.'],
  [['STAN AN ZEPHYRA'], 'Paid 150.00ST AN Zephyra'],
  [['DANIELLE LE'], '1Daniel Le'],
  [['DANIELLE LE'], 'Seen 9-10Daniel Le'],
  [['DANIELLE LE'], 'Seen 3rd-4Daniel Le'],
  [['THANH ANH'], 'Seen 3rd–4th Thanh Anh attended.'],
];
const out: string[] = [];
for (const [n, t] of rows) {
  const Pt = patient(n);
  const a = run(A, t, Pt), b = run(B, t, Pt), p = run(P, t, Pt);
  out.push(`[${n}] ${JSON.stringify(t)}\n  A=${JSON.stringify(a)}\n  B=${JSON.stringify(b)}\n  P=${JSON.stringify(p)}`);
}
console.log(out.join('\n'));

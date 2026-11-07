import { A, B, run, patient } from './lib.mts';
const P: any = (await import('./lib.mts')).B;
const rows: [string[], string][] = [
  [['COLIN LIN'], 'Billed 97110CO Colin Lin tolerated treatment.'],
  [['COLIN LIN'], 'Line 2: 97530CO Colin Lin 02/14/2026 $38.00'],
  [['AMAL AL HASSAN'], 'Billed 97110AM Amal Al Hassan.'],
  [['COLIN LIN'], 'Billed 97110-CO Colin Lin tolerated treatment.'],
  [['COLIN LIN'], 'Billed G0283CO Colin Lin.'],
  [['COLIN LIN'], 'Billed 97110 CO Colin Lin.'],
  [['COLIN LIN'], 'Billed 97110CQ Colin Lin.'],
];
for (const [n, t] of rows) {
  const Pt = patient(n);
  console.log(`[${n}] ${JSON.stringify(t)}\n  A=${JSON.stringify(run(A, t, Pt))}\n  B=${JSON.stringify(run(B, t, Pt))}\n  P=${JSON.stringify(run(P, t, Pt))}`);
}

import { A, B, run, patient } from './lib.mts';
const rows: [string[], string][] = [
  [['AMAL AL HASSAN'], 'Seen 9-10am Amal Al Hassan tolerated treatment.'],
  [['AMAL AL HASSAN'], 'Session 9am-10am Amal Al Hassan attended.'],
  [['AMAL AL HASSAN'], 'Appointment 10:00-11:00am Amal Al Hassan arrived on time.'],
  [['AMAL AL HASSAN'], 'Appointment at 9.30am Amal Al Hassan arrived on time.'],
  [['AMAL AL HASSAN'], 'Appointment at 0930am Amal Al Hassan arrived on time.'],
  [['AMAN AN ZEPHYRA'], 'Seen 8-9am Aman An Zephyra.'],
  [['NGUYEN THANH ANH'], 'Seen on March 3rd-4th Thanh Anh attended both visits.'],
  [['NGUYEN THANH ANH'], 'Seen on the 3rd/4th Thanh Anh attended.'],
  [['NGUYEN THANH ANH'], 'Seen 3-4th Thanh Anh attended.'],
  [['MINSEO SEO'], 'Session 30min Minseo Seo attended.'],
  [['MINSEO SEO'], 'Session 30min Minseo attended.'],
  [['MINJI JI'], 'Session 30min Minji Ji attended.'],
  [['MINHO HO'], 'Treatment time 45min Minho Ho tolerated treatment.'],
  [['MINSU SU'], 'Therapeutic exercise 15min Minsu Su.'],
  [['MINJUN JUN'], 'Session 30min Minjun Jun attended.'],
  // controls
  [['AMAL AL HASSAN'], 'Appointment at 9am Amal Al Hassan arrived on time.'],
  [['NGUYEN THANH ANH'], 'Seen on the 4th Thanh Anh attended.'],
  [['MINSEO KIM'], 'Session 30min Minseo Kim attended.'],
];
for (const [n, t] of rows) {
  const P = patient(n);
  const a = run(A, t, P), b = run(B, t, P);
  console.log(`${a === b ? 'same' : (b === 'REFUSED' && a !== 'REFUSED' ? 'B-ONLY-REFUSAL' : 'DIFF')} [${n}] ${JSON.stringify(t)}\n   A=${JSON.stringify(a)}\n   B=${JSON.stringify(b)}`);
}

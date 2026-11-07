// Head rule (non-held) after the GATEWAYJ3-1 fix: natural sentences with a unit, a time range, or an ordinal range glued
// before the patient's name, where a long part = the glued letters + another part of the name.
import { cmp, patient } from './lib.mts';
const rows: [string[], string][] = [
  // time ranges and other time writings before the name (AMAL AL HASSAN: AMAL = AM + AL)
  [['AMAL AL HASSAN'], 'Seen 9-10am Amal Al Hassan tolerated treatment.'],
  [['AMAL AL HASSAN'], 'Session 9am-10am Amal Al Hassan attended.'],
  [['AMAL AL HASSAN'], 'Appointment 10:00-11:00am Amal Al Hassan arrived on time.'],
  [['AMAL AL HASSAN'], 'Appointment at 9.30am Amal Al Hassan arrived on time.'],
  [['AMAL AL HASSAN'], 'Appointment at 0930am Amal Al Hassan arrived on time.'],
  [['AMAL AL HASSAN'], 'Appointment at 9am Amal Al Hassan arrived on time.'],
  [['AMAL AL HASSAN'], 'Appointment at 9:30am Amal Al Hassan arrived on time.'],
  [['AMAN AN ZEPHYRA'], 'Seen 8-9am Aman An Zephyra.'],
  // ordinal ranges
  [['NGUYEN THANH ANH'], 'Seen on March 3rd-4th Thanh Anh attended both visits.'],
  [['NGUYEN THANH ANH'], 'Seen on the 3rd/4th Thanh Anh attended.'],
  [['NGUYEN THANH ANH'], 'Seen 3-4th Thanh Anh attended.'],
  [['NGUYEN THANH ANH'], 'Visit #4th Thanh Anh attended.'],
  [['NGUYEN THANH ANH'], 'Seen on the 4th Thanh Anh attended.'],
  // a unit's letters and a part whose rest is another part
  [['MINHO HO'], 'Session 30min Minho Ho attended.'],
  [['MINHO HO'], 'Treatment time 45min Minho Ho tolerated treatment.'],
  [['MINJI JI'], 'Session 30min Minji Ji attended.'],
  [['MINSU SU'], 'Therapeutic exercise 15min Minsu Su.'],
  [['MINHO HO'], 'Session 30 min Minho Ho attended.'],
  [['MINHO HO'], 'Session 30min, Minho Ho attended.'],
  [['MINHO HO'], 'Seen 150.00MIN HO paid'],
];
let bad = 0;
for (const [names, t] of rows) {
  const r = cmp(t, patient(names));
  const flag = r.b === 'REFUSED' && r.a !== 'REFUSED' ? 'B-ONLY-REFUSAL' : r.same ? 'same' : 'DIFF';
  if (flag === 'B-ONLY-REFUSAL') bad += 1;
  console.log(`${flag} [${names.join('; ')}] ${JSON.stringify(t)} A: ${JSON.stringify(r.a)} B: ${JSON.stringify(r.b)}`);
}
console.log(`B-only refusals ${bad} of ${rows.length}`);

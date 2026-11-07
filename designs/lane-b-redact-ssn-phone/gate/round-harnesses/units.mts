// The head rule's rest-an-initial branch on natural sentences: a unit or ordinal glued to a digit, then the whole name,
// where a long part is the unit's letters plus one letter that is an initial of another part.
import { cmp, patient } from './lib-gateway.mts';
const rows: [string[], string][] = [
  [['MINA A ZEPHYRA'], 'Therapy 30min Mina Zephyra tolerated well.'],
  [['MINA ALI'], 'Session 30min Mina Ali attended.'],
  [['MINA ALI'], 'Treatment time 45min Mina Ali, 97110 x3.'],
  [['MINH H NGUYEN'], 'Treatment 45min Minh Nguyen tolerated treatment.'],
  [['MINH HA'], 'Therapeutic exercise 15min Minh Ha.'],
  [['DANA A ZEPHYRA'], 'Visit 2Dan Dana Zephyra'],
  [['TINA I ZEPHYRA'], 'Units 4tin Tina Zephyra'],
  [['MOSE S ZEPHYRA'], 'Coverage 6mos Mose Zephyra'],
  [['HRSA H ZEPHYRA'], 'Time 2hrs Hrsa Zephyra'],
  [['AMAL AL ZEPHYRA'], 'Seen at 9am Amal Al Zephyra.'],
  [['THEO EO ZEPHYRA'], 'On the 4th Theo Eo Zephyra called.'],
  [['STAN AN ZEPHYRA'], 'On March 1st Stan An Zephyra called.'],
  [['MINA ALI'], 'Seen 01/02/2020 for 30min, Mina Ali was evaluated.'],
  [['MINA ALI'], 'Seen 01/02/2020 for 30min - Mina Ali was evaluated.'],
  [['MINA ALI'], 'Seen 01/02/2020 for 30min. Mina Ali was evaluated.'],
];
let bad = 0;
for (const [names, t] of rows) {
  const r = cmp(t, patient(names));
  const flag = r.b === 'REFUSED' && r.a !== 'REFUSED' ? 'B-ONLY-REFUSAL' : r.same ? 'same' : 'DIFF';
  if (flag === 'B-ONLY-REFUSAL') bad += 1;
  console.log(`${flag} [${names.join('; ')}] ${JSON.stringify(t)} A: ${JSON.stringify(r.a)} B: ${JSON.stringify(r.b)}`);
}
console.log(`B-only refusals ${bad} of ${rows.length}`);

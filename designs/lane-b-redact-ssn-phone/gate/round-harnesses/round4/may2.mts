import { A, B, run, judge1 } from './lib.mts';
const HELD = 'Paid $0,000.00. Service 01/01/2020-01/02/2020Paid $0,000.00. ';
const rows: [string, string][] = [
  ['2009-05-20', `${HELD}Seen May/2009     20`],
  ['1995-09-19', `${HELD}Seen Sep.1995  .     19`],
  ['1941-06-19', `${HELD}Seen Jun\r\n   –     1941  -\r\n   19`],
  ['1941-06-19', `${HELD}Seen 19     June 1941`],
  ['1941-06-19', `${HELD}Seen 19 ,\n      June 1941 today.`],
  ['2009-05-20', 'Seen May/2009     20'],
  ['1941-06-19', 'Seen 19     June 1941'],
];
for (const [dob, letter] of rows) {
  const a = run(A, letter, ['JANE Q ZEPHYRA'], { datesOfBirth: [dob] }), b = run(B, letter, ['JANE Q ZEPHYRA'], { datesOfBirth: [dob] });
  const { patient, claims } = judge1(['JANE Q ZEPHYRA'], { datesOfBirth: [dob] });
  console.log(dob, JSON.stringify(letter.slice(55)), 'A', JSON.stringify(a), 'B', JSON.stringify(b), 'Bred', JSON.stringify(B.redactLetterForScreen(letter, patient, claims).text.slice(55)));
}

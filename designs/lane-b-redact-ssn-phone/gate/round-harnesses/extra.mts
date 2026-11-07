import { cmp, patient, B, C } from './lib-gateway.mts';
const rows: [string[], string, string?][] = [
  [['NGUYEN THANH ANH'], 'On March 4th Thanh Anh was seen for therapy.'],
  [['NGUYEN THANH ANH'], 'Seen on the 4th Nguyen Thanh Anh.'],
  [['NGUYEN THANH ANH'], 'Seen on the 4th Thanh Anh Nguyen.'],
  [['NGUYEN THANH ANH'], 'On March 4th, Thanh Anh was seen.'],
  [['TRAN STAN AN'], 'Since the 1st Stan An has attended 8 visits.'],
  [['JANE Q ZEPHYRA'], 'DOB 80-03-14', '1980-03-14'],
  [['JANE Q ZEPHYRA'], 'DOB 800314', '1980-03-14'],
  [['JANE Q ZEPHYRA'], 'Date of birth: 80/03/14', '1980-03-14'],
];
for (const [names, t, dob] of rows) {
  const r = cmp(t, patient(names, dob ?? '1980-03-14'));
  const flag = r.b === 'REFUSED' && r.a !== 'REFUSED' ? 'B-ONLY-REFUSAL' : r.same ? 'same' : 'DIFF';
  console.log(`${flag} [${names.join('; ')}] ${JSON.stringify(t)} A: ${JSON.stringify(r.a)} B: ${JSON.stringify(r.b)}`);
}

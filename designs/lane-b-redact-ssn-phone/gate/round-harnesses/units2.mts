import { cmp, patient } from './lib-gateway.mts';
const rows: [string[], string][] = [
  [['MINA ALI'], 'Seen 150.00MIN A ALI paid'],
  [['MINA ALI'], 'Seen 150.00MIN A Ali paid'],
  [['MINA ALI'], 'Paid 150.00Min A Ali'],
  [['MINH H NGUYEN'], 'Paid 150.00Min H Nguyen'],
  [['STAN AN ZEPHYRA'], 'Paid 150.00ST AN Zephyra'],
  [['MINA ALI'], 'Seen 01/01/2020-150.00MIN A ALI paid'],
  [['MING G ZEPHYRA'], 'Session 30min Ming Zephyra attended.'],
  [['MING GAO'], 'Session 30min Ming Gao attended.'],
  [['MINH HOANG'], 'PT 45min Minh Hoang, 97110 x3 units.'],
  [['MINA ALI'], 'Session 30 min Mina Ali attended.'],
  [['MINA ALI'], 'Session 30min, Mina Ali attended.'],
];
for (const [names, t] of rows) {
  const r = cmp(t, patient(names));
  const flag = r.b === 'REFUSED' && r.a !== 'REFUSED' ? 'B-ONLY-REFUSAL' : r.same ? 'same' : 'DIFF';
  console.log(`${flag} [${names.join('; ')}] ${JSON.stringify(t)} A: ${JSON.stringify(r.a)} B: ${JSON.stringify(r.b)}`);
}

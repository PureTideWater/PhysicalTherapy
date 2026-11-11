import { pathToFileURL } from 'node:url';
const P = { pseudonym: 'p', names: ['JANE Q ZEPHYRA'], datesOfBirth: ['1980-03-14'], memberIds: ['ZZ7654321', '7654321'] };
const C = [{ claimId: 'c', patientPseudonym: 'p', claimNumbers: ['SYNCLAIM0001'] }, { claimId: 'd', patientPseudonym: 'p', claimNumbers: ['4455667'] }];
const S = 'packages/model-gateway/src/redact.ts';
const trees: Record<string, string> = { K: `/home/user/leaks/${S}`, f2f9: `/home/user/work/p16/before/${S}`, x24ad: `/home/user/work/p15/before/${S}`, a66f: `/home/user/work/p14/before/${S}`, x8e59: `/home/user/work/p13/before/${S}`, x91e1: `/home/user/work/p12/before/${S}`, base: `/home/user/tree-ef3/${S}`, cc3: `/home/user/tree-cc3/${S}` };
const letters = [
  'Paid $10.00. Toll-Free -\n\r\n900-12-\n  345678\r\nLine 3. ID ZZ76543ꛯ1\n01-02-2020 Zephyra',
  'Line 3. ID ZZ76543ꛯ1\n01-02-2020 Zephyra',
  'ID ZZ76543ꛯ1\n01-02-2020 Zephyra',
  'ID ZZ76543ꛯ1\n01-02-2020',
  'ID ZZ7654321\n01-02-2020 Zephyra',
  'ID ZZ765432١\n01-02-2020',
  'ID ZZ76543٢١\n01-02-2020',
];
for (const t of letters) {
  console.log(JSON.stringify(t));
  for (const [name, path] of Object.entries(trees)) {
    const R = await import(pathToFileURL(path).href);
    const s = R.redactLetterForScreen(t, P, C).text;
    const refused = R.holdsIdentifier(s, P, C);
    console.log(`   ${name.padEnd(6)} ${refused ? 'REFUSED' : 'sent   '} ${JSON.stringify(s)}`);
  }
}

import path from 'node:path'; import { pathToFileURL } from 'node:url';
const H = await import(pathToFileURL(path.join(process.argv[2]!, 'redact.ts')).href);
const mk = (names: string[], m: string[], c: string[]) => [{ pseudonym: 'synthetic-patient-r3', names, datesOfBirth: ['1961-03-03'], memberIds: m },
  [{ claimId: '00000000-0000-4000-8000-000000000001', patientPseudonym: 'synthetic-patient-r3', claimNumbers: c }]] as const;
const full = mk(['AAAAAAAA'], ['7,7,7,7,7'], ['11111111', 'ZZ12345 01']); const min = mk(['JANE ZEPHYRA'], ['7,7,7,7,7'], ['ZZ99887']);
const min2 = mk(['JANE ZEPHYRA'], ['7-6-5-4-3'], ['ZZ99887']);
const rows: [string, readonly [any, any], string][] = [
  ['full', full, '1 Fax XAAAA\r7,7,7,7,7:a1 1-1/1/1/1/17,7,7,7,7.,7\u00041+'],
  ['m1', min, 'Ref 17,7,7,7,7.,7 end'], ['m2', min, 'Ref 7,7,7,7,7.,7 end'], ['m3', min, 'Ref 17,7,7,7,7 end'], ['m4', min, 'Ref 7,7,7,7,7,7 end'], ['m5', min, 'Ref 7,7,7,7,7 end'],
  ['m6', min, 'Ref 7,7,7,7,7 and 7,7,7,7,7.,7 end'], ['m7', min, 'Ref 7,7,7,7.,7 end'],
  ['n1', min2, 'Ref 17-6-5-4-3.-3 end'], ['n2', min2, 'Ref 7-6-5-4-3.-3 end'], ['n3', min2, 'Ref 17-6-5-4-3 end'], ['n4', min2, 'Ref 7-6-5-4.-3 end'], ['n5', min2, 'Ref 7-6-5-4-3 x 7-6-5-4.-3 end'],
];
for (const [name, [P, C], text] of rows) { const r = H.redactLetterForScreen(text, P, C); const ref = H.holdsIdentifier(r.text, P, C, H.checkWorkOf(r)); console.log(`${name} | ${ref ? 'REFUSED' : 'SENT'} | ${JSON.stringify(r.text)}`); }

import path from 'node:path'; import { pathToFileURL } from 'node:url';
const H = await import(pathToFileURL(path.join(process.argv[2]!, 'redact.ts')).href);
const mk = (n: string) => [{ pseudonym: 'synthetic-patient-r3', names: [n], datesOfBirth: ['1961-03-03'], memberIds: ['SYN555001'] },
  [{ claimId: '00000000-0000-4000-8000-000000000001', patientPseudonym: 'synthetic-patient-r3', claimNumbers: ['ZZ99887'] }]] as const;
const rows: [string, string][] = [['ZZZZZZ', 'ZZ/ZZZZ Z.Z.Z'], ['ZZZZZZ', 'ZZ/ZZZZ Z.Z'], ['ZZZZZZ', 'ZZZZZZ Z.Z.Z'], ['ZZZZZZ', 'Dear ZZ/ZZZZ Z.Z.Z,'], ['AAAAAAAA', 'AA/AAAAAA A.A.A'], ['JANE ZEPHYRA', 'Zeph/yra J.Z.J'], ['JANE ZEPHYRA', 'Ja/ne Zephyra J.Z.J'], ['ANNA ANNA', 'An/na Anna A.A.A'], ['ZEPHYRAZ', 'ZE/PHYRAZ Z.Z.Z'], ['OTTO OTTO', 'Ot/to O.O.O'],['ZZZZZZ','Z.Z.Z'],['ZZZZZZ','ZZZZZZ and Z.Z.Z']];
for (const [n, text] of rows) { const [P, C] = mk(n); const r = H.redactLetterForScreen(text, P, C); const ref = H.holdsIdentifier(r.text, P, C, H.checkWorkOf(r)); console.log(`${n} | ${JSON.stringify(text)} | ${ref ? 'REFUSED' : 'SENT'} | ${JSON.stringify(r.text)}`); }

import path from 'node:path'; import { pathToFileURL } from 'node:url';
const H = await import(pathToFileURL(path.join(process.argv[2]!, 'redact.ts')).href);
const mk = (names: string[], m: string[], c: string[]) => [{ pseudonym: 'synthetic-patient-r3', names, datesOfBirth: ['1961-03-03'], memberIds: m },
  [{ claimId: '00000000-0000-4000-8000-000000000001', patientPseudonym: 'synthetic-patient-r3', claimNumbers: c }]] as const;
const rows: [readonly [any, any], string][] = [[mk(['AAAAAAAA'], ['7,7,7,7,7'], ['11111111', 'ZZ12345 01']), 'Fax 7777,7:1111,7777.7'],
  [mk(['AAAAAAAA'], ['12121/2121'], ['12312312', '000&11']), '000&11.12121\u00852121\u0085aaAaaaAa A\u0085A\u0085AaA\u0085Aa\u0085a\r\naaAaA&']];
console.log(rows.map(([[P, C], t]) => { const r = H.redactLetterForScreen(t, P, C); return (H.holdsIdentifier(r.text, P, C, H.checkWorkOf ? H.checkWorkOf(r) : undefined) ? 'REFUSED' : 'SENT') + ' ' + JSON.stringify(r.text); }).join(' || '));

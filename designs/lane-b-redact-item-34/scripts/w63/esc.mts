import path from 'node:path'; import { pathToFileURL } from 'node:url';
const mk = (names: string[], m: string[], c: string[]) => [{ pseudonym: 'synthetic-patient-r3', names, datesOfBirth: ['1961-03-03'], memberIds: m },
  [{ claimId: '00000000-0000-4000-8000-000000000001', patientPseudonym: 'synthetic-patient-r3', claimNumbers: c }]] as const;
const esc = (t: string) => JSON.stringify(t).replace(/[^\x20-\x7e]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
for (const tree of process.argv.slice(2)) { const H = await import(pathToFileURL(path.join(tree, 'redact.ts')).href);
  for (const [[P, C], t] of [[mk(['AAAAAAAA'], ['12121/2121'], ['12312312', '000&11']), '000&11.12121\u00852121\u0085aaAaaaAa A\u0085A\u0085AaA\u0085Aa\u0085a\r\naaAaA&'], [mk(['AAAAAAAA'], ['7,7,7,7,7'], ['11111111', 'ZZ12345 01']), '1 Fax XAAAA\r7,7,7,7,7:a1 1-1/1/1/1/17,7,7,7,7.,7\u00041+']] as const) {
    const r = H.redactLetterForScreen(t, P, C); console.log(path.basename(path.resolve(tree, '../../..')), H.holdsIdentifier(r.text, P, C, H.checkWorkOf(r)) ? 'REFUSED' : 'SENT', esc(r.text), r.replaced, JSON.stringify(r.candidates), '| redactLetter', esc(H.redactLetter(t, P, C).text)); } }

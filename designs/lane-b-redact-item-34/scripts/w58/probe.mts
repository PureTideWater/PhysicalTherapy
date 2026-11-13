import path from 'node:path'; import { pathToFileURL } from 'node:url';
const H = await import(pathToFileURL(path.join(process.argv[2]!, 'redact.ts')).href);
const BUDGET: number = H.CHECK_WORK_BUDGET;
const mk = (names: string[], m: string[], c: string[]) => [{ pseudonym: 'synthetic-patient-r3', names, datesOfBirth: ['1961-03-03'], memberIds: m },
  [{ claimId: '00000000-0000-4000-8000-000000000001', patientPseudonym: 'synthetic-patient-r3', claimNumbers: c }]] as const;
const rows: [string, readonly [any, any], string][] = [
  ['R3-1 A x49000', mk(['AAAAAAAA'], ['SYN555001'], ['ZZ99887']), 'A '.repeat(49000)],
  ['R3-1 A x40000', mk(['AAAAAAAA'], ['SYN555001'], ['ZZ99887']), 'A '.repeat(40000)],
  ['R3-4', mk(['AAAAAAAA'], ['12121/2121'], ['12312312', '000&11']), '000&11.12121\u00852121\u0085aaAaaaAa A\u0085A\u0085AaA\u0085Aa\u0085a\r\naaAaA&'],
];
for (const [name, [P, C], text] of rows) {
  const t0 = performance.now(); const r = H.redactLetterForScreen(text, P, C); const spent = H.checkWorkOf(r);
  const refused = H.holdsIdentifier(r.text, P, C, spent); const ms = Math.round(performance.now() - t0);
  let units = 'n/a';
  if (!refused) { let lo = 0, hi = BUDGET - spent; while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (H.holdsIdentifier(r.text, P, C, spent + mid)) hi = mid - 1; else lo = mid; } units = String(BUDGET - lo); }
  const clear = r.text.replace(/\[[A-Z_0-9]+\]/g, '').replace(/[^\p{L}\p{N}]/gu, '').length;
  console.log(`${name} | ${refused ? 'REFUSED' : 'SENT'} | redaction ${spent} | units ${units} | letters/digits outside placeholders ${clear} | ${ms} ms${text.length < 200 ? ' | ' + JSON.stringify(r.text) : ''}`);
}

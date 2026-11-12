// Units (redaction + check) of the rows nearest the check's work budget, read off the product's own entries:
// the check is given the redaction's count plus E more; the largest E it still sends at is budget - units.
import path from 'node:path'; import { pathToFileURL } from 'node:url';
const H = await import(pathToFileURL(path.join(process.argv[2]!, 'redact.ts')).href);
const BUDGET: number = H.CHECK_WORK_BUDGET;
const F = (u: string, n: number) => u.repeat(Math.floor(n / u.length));
const P = { pseudonym: 'synthetic-patient-7', names: ['JANE Q VANTREE'], datesOfBirth: ['1961-03-03'], memberIds: ['ZZ1234567'] };
const C = [{ claimId: '00000000-0000-4000-8000-000000000001', patientPseudonym: 'synthetic-patient-7', claimNumbers: ['SYN555001'] }];
const ROWS: [string, string][] = [
  ['gap + initials 100k', `Vantree${' '.repeat(2000)}x${' J'.repeat(49000)}`],
  ['U+33FE; to 57,972 with a CR LF', F('㏾;', 57970) + '\r\n'],
];
for (const [name, text] of ROWS) {
  const r = H.redactLetterForScreen(text, P, C); const spent = H.checkWorkOf(r);
  if (H.holdsIdentifier(r.text, P, C, spent)) { console.log(`${name} | ${text.length} | REFUSED (redaction ${spent})`); continue; }
  let lo = 0, hi = BUDGET - spent; // sent at lo; find the largest extra still sent
  while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (H.holdsIdentifier(r.text, P, C, spent + mid)) hi = mid - 1; else lo = mid; }
  console.log(`${name} | ${text.length} | budget ${BUDGET} | units ${BUDGET - lo} | sent`);
}

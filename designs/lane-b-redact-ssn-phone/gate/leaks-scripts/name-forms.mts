// node --import ../ts-resolve.mjs name-forms.mts <redact.ts>...: the three name forms the packets verifier's fold asked about (its status file, row
// D1-2), each alone and in a held letter, one column per tree. The middle dot and the hyphenation point are closed by
// co-001/redact-ssn-phone-leaks; a lower-case piece after a space or a period and a name written letter by letter are MOD-23's
// residuals (sent in clear outside a held letter). Synthetic patient only.
import { pathToFileURL } from 'node:url';
const P = { pseudonym: 'p', names: ['JANE Q ZEPHYRA'], datesOfBirth: ['1980-03-14'], memberIds: ['SYNMEMBER0042'] };
const C = [{ claimId: 'c', patientPseudonym: 'p', claimNumbers: ['SYNCLAIM0001'] }];
const HELD = 'Seen 01/01/2020-150.00Paid in full. ';
const mods = await Promise.all(process.argv.slice(2).map((t) => import(pathToFileURL(t).href)));
for (const base of ['Dear Zeph·yra, your claim', 'Dear Zeph‧yra, your claim', 'Dear Zephy ra, your claim', 'Dear Zephy. ra, your claim', 'Dear Z e p h y r a, your claim', 'Dear Z E P H Y R A, your claim', 'Dear Zephy Ra, your claim']) {
  for (const text of [base, HELD + base]) {
    console.log(JSON.stringify(text).slice(0, 74).padEnd(74), mods.map((R) => { const s = R.redactLetterForScreen(text, P, C); return (R.holdsIdentifier(s.text, P, C) ? 'REFUSED' : s.replaced ? 'redacted' : 'SENT in clear').padEnd(14); }).join(' | '));
  }
}

// Synthetic only. Review round 5 (F10): what cc3dd7f6 does with each failSafe row tagged "must-stay" of the residual table.
// Usage: node gen-residual5.mts <residuals.json> <cc3dd7f6 redact.ts> > must-stay-base.jsonl
import { readFileSync } from 'node:fs';
const [path = '', base = ''] = process.argv.slice(2);
const A: any = await import(base);
const table = JSON.parse(readFileSync(path, 'utf8'));
const unbracketed = (text: string) => text.normalize('NFKC').replace(/[[\]]/g, (bracket) => (bracket === '[' ? '(' : ')'));
for (const row of table.failSafe) {
  if (row.gate !== 'must-stay') continue;
  const stored = table.patients[row.p];
  const patient = { pseudonym: 'synthetic-patient-21', names: stored.names, datesOfBirth: stored.datesOfBirth, memberIds: stored.memberIds };
  const claims = [{ claimId: 'synthetic-claim-21', patientPseudonym: 'synthetic-patient-21', claimNumbers: stored.claimNumbers }];
  const screened = A.redactLetterForScreen(row.letter, patient, claims);
  const refused = A.holdsIdentifier(screened.text, patient, claims);
  console.log(JSON.stringify({ p: row.p, letter: row.letter, base: refused ? 'REFUSED' : screened.text === unbracketed(row.letter) ? 'UNCHANGED' : screened.text }));
}

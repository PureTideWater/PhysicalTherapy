// node rows.mts <redact.ts> [show]: the pinned residual rows of a tree: how each class is handled now.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
const R = await import(pathToFileURL(process.argv[2]!).href);
const show = Number(process.argv[3] ?? 6);
const d = JSON.parse(fs.readFileSync(process.env.RESIDUALS ?? '/home/user/tree-ef3/packages/model-gateway/src/redact.residuals.json', 'utf8'));
const call = (row: any) => { const s = d.patients[row.p]; return { patient: { pseudonym: 'synthetic-patient-21', names: s.names, datesOfBirth: s.datesOfBirth, memberIds: s.memberIds }, claims: [{ claimId: 'synthetic-claim-21', patientPseudonym: 'synthetic-patient-21', claimNumbers: s.claimNumbers }] }; };
for (const cls of ['ssnPhone', 'ownIdentifierA', 'monthWordName', 'loneInitial', 'failSafe']) {
  const out: Record<string, number> = {}; const left: string[] = [];
  for (const row of d[cls]) {
    const { patient, claims } = call(row);
    const s = R.redactLetterForScreen(row.letter, patient, claims);
    const refused = R.holdsIdentifier(s.text, patient, claims);
    const tok = row.number ?? row.token;
    const state = refused ? 'refused' : tok !== undefined ? (s.text.includes(tok) ? 'SENT-in-clear' : 'redacted') : s.text === row.sent ? 'sent-as-recorded' : 'sent-changed';
    out[state] = (out[state] ?? 0) + 1;
    if ((state === 'SENT-in-clear' || state === 'sent-as-recorded') && left.length < show) left.push(`${row.gate} | ${JSON.stringify(row.letter).slice(0, 170)} | ${tok ?? ''}`);
  }
  console.log(cls, d[cls].length, JSON.stringify(out));
  if (cls !== 'loneInitial' && cls !== 'failSafe') for (const l of left) console.log('    ', l);
}

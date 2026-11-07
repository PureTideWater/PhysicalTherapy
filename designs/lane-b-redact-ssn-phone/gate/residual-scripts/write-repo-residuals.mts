// Writes packages/model-gateway/src/redact.residuals.json from gen-residual's output and this round's attack hits (att2,
// att5: class A representatives), each row verified again: cc3dd7f6 refuses it and the candidate sends exactly `sent`
// (class A, B), or the candidate refuses it (fail-safe). usage: node write-repo-residuals.mts <residual.json> <att dir> <out>
import fs from 'node:fs';
import * as base from './h/redact.base.ts';
import * as win from './h/redact.win.ts';
const [resFile, attDir, outFile] = process.argv.slice(2) as [string, string, string];
const res = JSON.parse(fs.readFileSync(resFile, 'utf8'));
const patients: any[] = [];
const keyOf = (r: any) => JSON.stringify([r.names, r.datesOfBirth, r.memberIds, r.claimNumbers]);
const index = new Map<string, number>();
const pIndex = (r: any) => { const k = keyOf(r); if (!index.has(k)) { index.set(k, patients.length); patients.push({ names: r.names, datesOfBirth: r.datesOfBirth, memberIds: r.memberIds, claimNumbers: r.claimNumbers }); } return index.get(k)!; };
const PC = (r: any) => ({ P: { pseudonym: 'synthetic-patient-21', names: r.names, datesOfBirth: r.datesOfBirth, memberIds: r.memberIds }, C: [{ claimId: 'synthetic-claim-1', patientPseudonym: 'synthetic-patient-21', claimNumbers: r.claimNumbers }] });
const out = (M: any, letter: string, r: any) => { const { P, C } = PC(r); const s = M.redactLetterForScreen(letter, P, C); return M.holdsIdentifier(s.text, P, C) ? null : (s.text as string); };
const sentRows = (rows: any[], gate: (r: any) => string) => rows.map((r) => {
  if (out(base, r.letter, r) !== null) throw new Error('base sends a residual row');
  const sent = out(win, r.letter, r);
  if (sent === null || sent !== r.sent) throw new Error('candidate outcome differs');
  return { p: pIndex(r), gate: gate(r), letter: r.letter, sent };
});
const ssnPhone = sentRows(res.classA, (r) => (r.gate === 'PHI.ssn' ? 'ssn' : 'phone'));
// This round's representatives: one row per form and frame kind of att2 and att5 (JANE Q ZEPHYRA, as those harnesses wrote).
const jane2 = { names: ['JANE Q ZEPHYRA'], datesOfBirth: ['1980-03-14'], memberIds: ['SYNMEMBER0042', 'ZZ7654321'], claimNumbers: ['SYNCLAIM0001', 'C2026000417'] };
const jane5 = { names: ['JANE Q ZEPHYRA'], datesOfBirth: ['1980-03-14'], memberIds: ['SYNMEMBER0042'], claimNumbers: ['SYNCLAIM0001'] };
const reps: any[] = [];
const seen = new Set<string>();
for (const line of fs.readFileSync(`${attDir}/att2.jsonl`, 'utf8').split('\n').filter(Boolean)) {
  const o = JSON.parse(line);
  const frame = o.letter.startsWith('Paid $0,000.00. Service') ? 'service' : o.letter.startsWith('Seen 01/01/2020-150.00') ? 'seen' : o.letter.split(' ')[0];
  const k = `${o.kind}|${o.form}|${frame}|${/SSN|Phone|Call|Tel/u.test(o.letter) ? 'label' : 'none'}`;
  if (seen.has(k)) continue;
  seen.add(k);
  const r = { ...jane2, letter: o.letter };
  const sent = out(win, o.letter, r);
  if (out(base, o.letter, r) === null && sent !== null) reps.push({ ...r, sent, gate: `att2-${o.kind}` });
}
for (const line of fs.readFileSync(`${attDir}/att5.jsonl`, 'utf8').split('\n').filter(Boolean)) {
  const o = JSON.parse(line);
  const k = `${o.f}|${o.L}|${o.j}`;
  if (seen.has(k) || o.cls !== 'A') continue;
  seen.add(k);
  const r = { ...jane5, letter: o.letter };
  const sent = out(win, o.letter, r);
  if (out(base, o.letter, r) === null && sent !== null) reps.push({ ...r, sent, gate: `att5-${/555/u.test(o.f) ? 'phone' : 'ssn'}` });
}
const round1 = reps.map((r) => ({ p: pIndex(r), gate: r.gate, letter: r.letter, sent: r.sent }));
const monthWordName = sentRows(res.classB, () => 'name');
const failSafe = res.failSafe.map((r: any) => {
  if (out(win, r.letter, r) !== null) throw new Error('fail-safe row sent');
  return { p: pIndex(r), gate: r.gate, letter: r.letter };
});
const about = [
  'Recorded residuals of co-001/redact-range-glued (docs/adr/0054; the orchestrator\'s rulings of 2026-11-07), as SYNTHETIC rows',
  'from the differential gate (975,489 synthetic letters, cc3dd7f6 against this head) and the judge\'s review round 1. ssnPhone',
  '(ruling A): an SSN or phone cc3dd7f6 refused only because a range\'s own digits chained, sent by this head as written in',
  '`sent`; SSN digits 900-xx-xxxx and phone digits 202/555-01xx where that mapping keeps the row\'s outcome, else 9xx (never',
  'issued). co-001/redact-ssn-phone-leaks (MOD-21, MOD-22) flips every row to redacted or refused, its generator and patterns',
  'changed together, before any real PHI is processed. monthWordName (ruling B): a name part that is a month\'s word next to a',
  'date, a named case for that PR\'s design. failSafe: letters cc3dd7f6 sent that this head refuses (must-stay: the date of',
  'birth glued digit to digit; glued-check: an own identifier glued where no boundary can be read). Regenerate from a gate run',
  'with the scripts kept beside the gate, never by hand.',
].join(' ');
const lines: string[] = ['{', `  "about": ${JSON.stringify(about)},`, '  "patients": ['];
patients.forEach((p, i) => lines.push(`    ${JSON.stringify(p)}${i < patients.length - 1 ? ',' : ''}`));
lines.push('  ],');
const section = (name: string, rows: any[], last = false) => {
  lines.push(`  ${JSON.stringify(name)}: [`);
  rows.forEach((r, i) => lines.push(`    ${JSON.stringify(r)}${i < rows.length - 1 ? ',' : ''}`));
  lines.push(`  ]${last ? '' : ','}`);
};
section('ssnPhone', [...ssnPhone, ...round1]);
section('monthWordName', monthWordName);
section('failSafe', failSafe, true);
lines.push('}');
fs.writeFileSync(outFile, lines.join('\n') + '\n');
console.log(`patients ${patients.length}; ssnPhone ${ssnPhone.length} gate + ${round1.length} round 1; monthWordName ${monthWordName.length}; failSafe ${failSafe.length}`);

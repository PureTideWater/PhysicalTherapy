// Writes packages/model-gateway/src/redact.residuals.json: the gate's rows (gen-residual2), the judge's round 1 class-A
// representatives (att2, att5), ruling A' rows (review round 2's att1/att2 re-run on this head, PHIJ2-2's inputs, the gate's
// fold scan), the lone-initial rows (round 1's att4 re-run on this head, PHIJ2-1's inputs) and the fail-safe rows. Every
// row verified again: cc3dd7f6 refuses it and the head sends exactly `sent`, holding `number`/`token` in clear (A, A',
// lone initial, B), or the head refuses it (fail-safe).
// usage: node write-repo-residuals2.mts <residual2.json> <fix-1 att dir> <aprime dir> <out>
import fs from 'node:fs';
import * as base from './h/redact.base.ts';
import * as win from './h/redact.win.ts';
const [resFile, attDir, apDir, outFile] = process.argv.slice(2) as [string, string, string, string];
const res = JSON.parse(fs.readFileSync(resFile, 'utf8'));
const G = '/tmp/claude-0/-home-user-PhysicalTherapy/b3c6553f-bf86-5901-9a05-bd89989a0ff9/scratchpad/rg-judge/gate/corpus';
const gatePatients: { P: any; C: any }[] = JSON.parse(fs.readFileSync(`${G}/patients.json`, 'utf8'));
const patients: any[] = [];
const keyOf = (r: any) => JSON.stringify([r.names, r.datesOfBirth, r.memberIds, r.claimNumbers]);
const index = new Map<string, number>();
const pIndex = (r: any) => { const k = keyOf(r); if (!index.has(k)) { index.set(k, patients.length); patients.push({ names: r.names, datesOfBirth: r.datesOfBirth, memberIds: r.memberIds, claimNumbers: r.claimNumbers }); } return index.get(k)!; };
const PC = (r: any) => ({ P: { pseudonym: 'synthetic-patient-21', names: r.names, datesOfBirth: r.datesOfBirth, memberIds: r.memberIds }, C: [{ claimId: 'synthetic-claim-1', patientPseudonym: 'synthetic-patient-21', claimNumbers: r.claimNumbers }] });
const out = (M: any, letter: string, r: any) => { const { P, C } = PC(r); const s = M.redactLetterForScreen(letter, P, C); return M.holdsIdentifier(s.text, P, C) ? null : (s.text as string); };
const report: string[] = [];
/** A row of a sent class: cc3dd7f6 refuses, the head sends `sent` holding `field` in clear. */
const sentRow = (r: any, gate: string, field: 'number' | 'token' | null, value?: string) => {
  if (out(base, r.letter, r) !== null) { report.push(`SKIP base sends ${gate} ${JSON.stringify(r.letter)}`); return null; }
  const sent = out(win, r.letter, r);
  if (sent === null) { report.push(`SKIP head refuses ${gate} ${JSON.stringify(r.letter)}`); return null; }
  if (r.sent !== undefined && sent !== r.sent) throw new Error('head outcome differs from the generator');
  const v = value?.normalize('NFKC');
  if (field !== null && (v === undefined || v === '' || !sent.includes(v))) { report.push(`SKIP not in clear ${gate} ${JSON.stringify(r.letter)} ${JSON.stringify(v)}`); return null; }
  return { p: pIndex(r), gate, letter: r.letter, sent, ...(field === null ? {} : { [field]: v }) };
};
const dedupe = (rows: any[]) => { const seen = new Set<string>(); return rows.filter((r) => { if (r === null) return false; const k = `${r.p}|${r.letter}`; if (seen.has(k)) return false; seen.add(k); return true; }); };
// (A) the gate's rows, then the round 1 representatives.
const ssnPhone: any[] = res.classA.map((r: any) => sentRow(r, r.gate === 'PHI.ssn' ? 'ssn' : 'phone', 'number', r.number));
const jane2 = { names: ['JANE Q ZEPHYRA'], datesOfBirth: ['1980-03-14'], memberIds: ['SYNMEMBER0042', 'ZZ7654321'], claimNumbers: ['SYNCLAIM0001', 'C2026000417'] };
const jane5 = { names: ['JANE Q ZEPHYRA'], datesOfBirth: ['1980-03-14'], memberIds: ['SYNMEMBER0042'], claimNumbers: ['SYNCLAIM0001'] };
const seen = new Set<string>();
for (const line of fs.readFileSync(`${attDir}/att2.jsonl`, 'utf8').split('\n').filter(Boolean)) {
  const o = JSON.parse(line);
  const frame = o.letter.startsWith('Paid $0,000.00. Service') ? 'service' : o.letter.startsWith('Seen 01/01/2020-150.00') ? 'seen' : o.letter.split(' ')[0];
  const k = `${o.kind}|${o.form}|${frame}|${/SSN|Phone|Call|Tel/u.test(o.letter) ? 'label' : 'none'}`;
  if (seen.has(k)) continue;
  seen.add(k);
  ssnPhone.push(sentRow({ ...jane2, letter: o.letter }, `att2-${o.kind}`, 'number', o.form));
}
for (const line of fs.readFileSync(`${attDir}/att5.jsonl`, 'utf8').split('\n').filter(Boolean)) {
  const o = JSON.parse(line);
  const k = `${o.f}|${o.L}|${o.j}`;
  if (seen.has(k) || o.cls !== 'A') continue;
  seen.add(k);
  ssnPhone.push(sentRow({ ...jane5, letter: o.letter }, `att5-${/555/u.test(o.f) ? 'phone' : 'ssn'}`, 'number', o.f));
}
// (B)
const monthWordName = res.classB.map((r: any) => sentRow(r, 'name', null));
// (A') the call's own identifiers in forms no rule reads, in held letters.
const ownA: any[] = [];
const simone = { names: ['SIMONE Q VANTREE'], datesOfBirth: ['1975-11-02'], memberIds: ['SYNMEMBER0042', '76543210'], claimNumbers: ['SYNCLAIM0001'] };
const alJune = { names: ['AL Q ZEPHYRA', 'JUNE VANTREE'], datesOfBirth: ['1980-03-14'], memberIds: ['ZZ7654321'], claimNumbers: ['C2026000417'] };
const F = 'Paid $0,000.00. Service 01/01/2020-01/02/2020Paid $0,000.00. ';
for (const [who, letter, kind, token] of [
  [simone, `${F}Patient: S1MONE VANTR3E`, 'name', 'S1MONE'],
  [simone, `${F}Member SYNMEMBERO042`, 'member', 'SYNMEMBERO042'],
  [simone, `${F}Claim SYNCLA1M0001 denied`, 'claim', 'SYNCLA1M0001'],
  [simone, `${F}Seen for 2-XI-1975`, 'dob', '2-XI-1975'],
  [simone, `${F}1121975`, 'dob', '1121975'],
  [jane2, `${F}Patient: ZЕРНYRА`, 'name', 'ZЕРНYRА'],
  [jane2, `${F}ΖΕΡΗΥRΑ`, 'name', 'ΖΕΡΗΥRΑ'],
  [jane2, `${F}1980年3月14日`, 'dob', '1980年3月14日'],
  [jane2, `${F}ЅYNMEMBER0042`, 'member', 'ЅYNMEMBER0042'],
  [alJune, `${F}ZZ765432l`, 'member', 'ZZ765432l'],
  [alJune, `${F}C2O26000417`, 'claim', 'C2O26000417'],
] as const) ownA.push(sentRow({ ...who, letter }, `PHIJ2-2-${kind}`, 'token', token));
for (const f of ['att1', 'att2']) {
  for (const line of fs.readFileSync(`${apDir}/${f}.jsonl`, 'utf8').split('\n').filter(Boolean)) {
    const o = JSON.parse(line);
    const who = o.names === undefined ? jane2 : o.names[0].startsWith('SIMONE') ? simone : alJune;
    ownA.push(sentRow({ ...who, letter: o.l }, `${f}-${o.kind}`, 'token', o.t));
  }
}
if (fs.existsSync(`${apDir}/gate.jsonl`)) {
  for (const line of fs.readFileSync(`${apDir}/gate.jsonl`, 'utf8').split('\n').filter(Boolean)) {
    const o = JSON.parse(line);
    const { P, C } = gatePatients[o.p]!;
    const who = { names: P.names, datesOfBirth: P.datesOfBirth, memberIds: P.memberIds, claimNumbers: C.flatMap((c: any) => c.claimNumbers) };
    ownA.push(sentRow({ ...who, letter: o.letter }, `gate-${o.kind}`, 'token', o.token));
  }
}
// The lone initial at a range's end.
const lone: any[] = [];
const janeQ = { names: ['JANE Q ZEPHYRA'], datesOfBirth: ['1980-03-14'], memberIds: ['SYNMEMBER0042'], claimNumbers: ['SYNCLAIM0001'] };
for (const [letter, initial] of [['Seen 01/01/2020-150.00Q Paid in full', 'Q'], ['Seen 01/01/2020-150.00J Paid in full', 'J'], ['Seen 01/01/2020-150.00Q, Paid in full', 'Q'], ['Paid $0,000.00. Service 01/01/2020-01/02/2020J Paid $0,000.00', 'J']] as const) {
  lone.push(sentRow({ ...janeQ, letter }, 'PHIJ2-1', 'token', initial));
}
const att4P = { names: ['AL Q ZEPHYRA', 'JUNE VANTREE'], datesOfBirth: ['1980-03-14'], memberIds: ['SYNMEMBER0042', 'ZZ7654321', '76543210'], claimNumbers: ['SYNCLAIM0001', 'C2026000417', '88776655'] };
for (const line of fs.readFileSync(`${apDir}/att4.jsonl`, 'utf8').split('\n').filter(Boolean)) {
  const o = JSON.parse(line);
  lone.push(sentRow({ ...att4P, letter: o.letter }, 'att4', 'token', o.t));
}
// Fail-safe.
const failSafe = res.failSafe.map((r: any) => {
  if (out(win, r.letter, r) !== null) throw new Error('fail-safe row sent');
  return { p: pIndex(r), gate: r.gate, letter: r.letter };
});
const about = [
  'Recorded residuals of co-001/redact-range-glued (docs/adr/0054; the orchestrator\'s rulings of 2026-11-07), as SYNTHETIC rows',
  'from the differential gate (975,489 synthetic letters, cc3dd7f6 against this head) and the judge\'s review rounds 1 and 2, each',
  'refused by cc3dd7f6 and handled by this head exactly as written here. ssnPhone (ruling A): an SSN or phone cc3dd7f6 refused',
  'only because a range\'s own digits chained, sent with `number` in clear; SSN digits 900-xx-xxxx (or the never-issued area',
  '000) and phone digits 202/555-01xx where that keeps the number sent in clear, else the digits kept: 9xx, never issued, or',
  'a date\'s shape with a digit beside it that a fuzzer wrote as an SSN (`9 01-12-1985`, `01-12-1985 9`).',
  'ownIdentifierA (ruling A\', 15:27): the call\'s own name, member ID, claim number or date of birth in a form no rule reads',
  '(OCR letter/digit confusions, homoglyphs, Roman or CJK months, unpadded digits, a year in words), sent with `token` in clear.',
  'co-001/redact-ssn-phone-leaks (MOD-21, MOD-22) flips every ssnPhone and ownIdentifierA row to redacted or refused, its',
  'generator and patterns (and an OCR/homoglyph fold for own identifiers) changed together, before any real PHI is processed.',
  'monthWordName (ruling B): a name part that is a month\'s word next to a date. loneInitial: a lone letter that is an initial',
  'of the name glued to a range\'s end, with no name, part, label or full stop beside it, sent (`token` the initial). failSafe:',
  'letters cc3dd7f6 sent that this head refuses. Regenerate from a gate run with the scripts kept beside the gate, never by hand.',
].join(' ');
const sections: [string, any[]][] = [
  ['ssnPhone', dedupe(ssnPhone)],
  ['ownIdentifierA', dedupe(ownA)],
  ['monthWordName', dedupe(monthWordName)],
  ['loneInitial', dedupe(lone)],
  ['failSafe', failSafe],
];
const lines: string[] = ['{', `  "about": ${JSON.stringify(about)},`, '  "patients": ['];
patients.forEach((p, i) => lines.push(`    ${JSON.stringify(p)}${i < patients.length - 1 ? ',' : ''}`));
lines.push('  ],');
sections.forEach(([name, rows], s) => {
  lines.push(`  ${JSON.stringify(name)}: [`);
  rows.forEach((r, i) => lines.push(`    ${JSON.stringify(r)}${i < rows.length - 1 ? ',' : ''}`));
  lines.push(`  ]${s < sections.length - 1 ? ',' : ''}`);
});
lines.push('}');
fs.writeFileSync(outFile, lines.join('\n') + '\n');
const kinds = (rows: any[]) => JSON.stringify(rows.reduce((m: any, r: any) => { const k = r.gate.split('-').at(-1); m[k] = (m[k] ?? 0) + 1; return m; }, {}));
console.log(`patients ${patients.length}; ${sections.map(([n, r]) => `${n} ${r.length}`).join('; ')}; ownIdentifierA by kind ${kinds(sections[1]![1])}; ssnPhone by kind ${kinds(sections[0]![1])}`);
fs.writeFileSync(`${outFile}.report.txt`, report.join('\n') + '\n');
console.log(`skipped ${report.length}`);

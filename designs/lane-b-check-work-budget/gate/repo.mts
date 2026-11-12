// Every string of 40 characters or more in the repository's fixtures (JSON values, and text files whole), read as a letter
// by the base (58fb29e5) and the head, the head's check with the redaction's count as prepare hands it on.
import fs from 'node:fs'; import path from 'node:path';
import * as H from '/home/user/headsrc-x/redact.ts';
import * as A from '/home/user/tree-base/packages/redact/src/redact.ts';
const root = '/home/user/PhysicalTherapy/fixtures';
const letters = new Set<string>();
const walk = (v: unknown) => { if (typeof v === 'string') { if (v.length >= 40) letters.add(v); } else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
const files = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(d, e.name)) : [path.join(d, e.name)]));
let nFiles = 0;
for (const f of files(root)) { if (!/\.(json|txt|md|csv|edi|835|html)$/i.test(f)) continue; const s = fs.readFileSync(f, 'utf8'); nFiles += 1; if (/\.json$/i.test(f)) { try { walk(JSON.parse(s)); continue; } catch {} } if (s.length >= 40) letters.add(s); }
const patients = [
  { P: { pseudonym: 'synthetic-patient-13', names: ['JANE Q ZEPHYRA'], datesOfBirth: ['1980-03-14'], memberIds: ['SYNMEMBER0042', 'ZZ7654321'] }, C: [{ claimId: 'c1', patientPseudonym: 'synthetic-patient-13', claimNumbers: ['SYNCLAIM0001', 'C2026000417'] }] },
  { P: { pseudonym: 'synthetic-patient-m', names: ['JUNE MARCH'], datesOfBirth: ['1984-11-02'], memberIds: ['SYN777002'] }, C: [{ claimId: 'c1', patientPseudonym: 'synthetic-patient-m', claimNumbers: ['ZZ900002'] }, { claimId: 'c2', patientPseudonym: 'synthetic-patient-m', claimNumbers: ['20261101'] }] },
];
const S = { files: nFiles, letters: letters.size, runs: 0, sentBoth: 0, refusedBoth: 0, textDiffers: 0, baseRefusedHeadSent: 0, headRefusedBaseSent: 0, pastBudget: 0, maxLength: 0, maxSpentRedaction: 0, lengthOfMaxSpent: 0, over100k: 0 };
const top: [number, number][] = [];
for (const t of letters) for (const { P, C } of patients) {
  S.runs += 1; S.maxLength = Math.max(S.maxLength, t.length); if (t.length > 100_000) S.over100k += 1;
  const a = A.redactLetterForScreen(t, P as any, C as any); const aHeld = A.holdsIdentifier(a.text, P as any, C as any);
  const h = H.redactLetterForScreen(t, P as any, C as any); const spent = H.checkWorkOf(h); const hHeld = H.holdsIdentifier(h.text, P as any, C as any, spent);
  if (spent > H.CHECK_WORK_BUDGET) S.pastBudget += 1; else { if (spent > S.maxSpentRedaction) { S.maxSpentRedaction = spent; S.lengthOfMaxSpent = t.length; } if (a.text !== h.text || a.replaced !== h.replaced || JSON.stringify(a.candidates) !== JSON.stringify(h.candidates)) S.textDiffers += 1; }
  if (t.length <= 100_000) top.push([(H as any).__last.total, t.length]);
  if (aHeld && !hHeld) S.baseRefusedHeadSent += 1; else if (!aHeld && hHeld) S.headRefusedBaseSent += 1; else if (aHeld) S.refusedBoth += 1; else S.sentBoth += 1;
}
top.sort((x, y) => y[0] - x[0]); console.log(JSON.stringify(S)); console.log('dearest whole checks at 100,000 characters or fewer [count, characters]:', JSON.stringify(top.slice(0, 5)), 'longest:', Math.max(...top.map((x) => x[1])));

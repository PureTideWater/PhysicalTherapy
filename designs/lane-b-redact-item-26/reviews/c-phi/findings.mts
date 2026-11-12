// Review C-PHI: each finding of report.md, run once more from its letter, on the four trees and both paths.
// Synthetic only. Run: tsx findings.mts   (writes out/findings.json)
import { readFileSync, writeFileSync } from 'node:fs';
const HERE = '/home/user/ops/designs/lane-b-redact-item-26/reviews/c-phi';
const TREES = ['base', 'r0', 'f0d', 'head'] as const;
type Mod = typeof import('/home/user/rev/head/redact.ts');
const mods = {} as Record<(typeof TREES)[number], Mod>;
for (const tree of TREES) mods[tree] = (await import(`/home/user/rev/${tree}/redact.ts`)) as Mod;
const work = (text: string) => text.length + (text.includes('\r\n') ? text.replace(/\r+\n/g, '\n').length : 0);
interface Who { patient: { pseudonym: string; names: string[]; datesOfBirth: string[]; memberIds: string[] }; claims: { claimId: string; patientPseudonym: string; claimNumbers: string[] }[] }
function table(letter: string, who: Who, apart: string) {
  const rows = [];
  for (const tree of TREES) {
    const m = mods[tree];
    const s = m.redactLetterForScreen(letter, who.patient, who.claims);
    rows.push({ tree, path: 'screen', refused: m.holdsIdentifier(s.text, who.patient, who.claims), endsInMark: s.text.endsWith('\u0001'), firstWorkOrLength: s.text.length, apartInClear: s.text.includes(apart) });
    const spans = m.redactionSpans(letter, who.patient, who.claims);
    const l = m.redactLetter(letter, who.patient, who.claims);
    rows.push({ tree, path: 'letter', refused: m.holdsIdentifier(l.text, who.patient, who.claims), endsInMark: l.text.endsWith('\u0001'), firstWorkOrLength: l.text.length, apartInClear: l.text.includes(apart), spansTextLength: spans.text.length, nfkcLength: letter.normalize('NFKC').length });
  }
  return rows;
}
const p0: Who = { patient: { pseudonym: 'p', names: ['JANE Q ZEPHYRA'], datesOfBirth: ['1980-03-14'], memberIds: ['SYNMEMBER0042'] }, claims: [{ claimId: 'c1', patientPseudonym: 'p', claimNumbers: ['SYNCLAIM0001'] }] };
const at = `${'paid in full. '.repeat(7141).slice(1)} Patient Zephy ra was seen.`;
const over = `${'paid in full. '.repeat(7141)} Patient Zephy ra was seen.`;
const p7: Who = { patient: { pseudonym: 'p', names: ['JANE Q ZEPHYRA'], datesOfBirth: ['1980-03-14'], memberIds: ['3456150.00', '12-3456', '345.678'] }, claims: ['56150', '0123', '1/02/2020', '12/3456'].map((number, i) => ({ claimId: `c${String(i + 1)}`, patientPseudonym: 'p', claimNumbers: [number] })) };
const kept = readFileSync(`${HERE}/out/asym-5.jsonl`, 'utf8').trim().split('\n').map((line) => JSON.parse(line) as { core: string; patient: number });
const core = (kept.at(-1) as { core: string }).core;
let n = 99_800;
let odd = false;
const make = () => `${core}\n${'paid in full. '.repeat(7200).slice(0, n)}${odd ? '\r\n' : ''}\nPatient Zephy ra was seen.`;
for (let i = 0; i < 14; i += 1) {
  const off = 100_001 - work(mods.base.redactLetterForScreen(make(), p7.patient, p7.claims).text);
  if (off === 0) break;
  if (Math.abs(off) % 2 === 1) odd = !odd;
  else n += off / 2;
}
const both = make();
const out = {
  f1: { atLength: at.length, overLength: over.length, at: table(at, p0, 'Zephy ra'), over: table(over, p0, 'Zephy ra') },
  f3: { core: JSON.stringify(core), n, odd, written: both.length, screenFirstWork: work(mods.base.redactLetterForScreen(both, p7.patient, p7.claims).text), letterFirstWork: work(mods.base.redactLetter(both, p7.patient, p7.claims).text), rows: table(both, p7, 'Zephy ra') },
};
writeFileSync(`${HERE}/out/findings.json`, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out).slice(0, 6000));

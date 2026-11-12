// Review C-PHI: the bound counts the normalised first text, in UTF-16 units. Letters whose written length is under the
// bound and whose NFKC text is over it (ligatures grow), and the reverse (combining marks compose), each exactly at
// and one over the bound, base against f0d against head on both paths. Synthetic only. Run: tsx nfkc.mts
import { writeFileSync } from 'node:fs';
const HERE = '/home/user/ops/designs/lane-b-redact-item-26/reviews/c-phi';
const base = await import('/home/user/rev/base/redact.ts');
const f0d = await import('/home/user/rev/f0d/redact.ts');
const head = await import('/home/user/rev/head/redact.ts');
type Mod = typeof head;
const patient = { pseudonym: 'p', names: ['JANE Q ZEPHYRA'], datesOfBirth: ['1980-03-14'], memberIds: ['SYNMEMBER0042'] };
const claims = [{ claimId: 'c1', patientPseudonym: 'p', claimNumbers: ['SYNCLAIM0001'] }];
const MARK = '\u0001';
const work = (text: string) => text.length + (text.includes('\r\n') ? text.replace(/\r+\n/g, '\n').length : 0);
const screenOf = (m: Mod, text: string) => {
  const r = m.redactLetterForScreen(text, patient, claims);
  return { text: r.text, extra: JSON.stringify(r.candidates), refused: m.holdsIdentifier(r.text, patient, claims) };
};
const letterOf = (m: Mod, text: string) => {
  const s = m.redactionSpans(text, patient, claims);
  const r = m.redactLetter(text, patient, claims);
  return { text: r.text, extra: JSON.stringify([s.spans, s.text.length]), refused: m.holdsIdentifier(r.text, patient, claims) };
};
const CORE = 'Patient Zephy ra was seen.';
const UNITS: [string, string, string][] = [
  ['ligatures grow (o\\uFB03ce)', 'oﬃce paid. ', ' '],
  ['U+FDFA grows 18-fold', 'paid ﷺ. ', ' '],
  ['combining marks compose (e + U+0301)', 'pére payé. ', ' '],
  ['ligatures grow, CR LF', 'oﬃce paid.\r\n', '\r\n'],
  ['supplementary letters (two units each)', 'paid \u{1D4AB}. ', ' '],
];
const rows: string[] = [];
let violations = 0;
for (const [name, unit, eol] of UNITS) {
  for (const target of [100_000, 100_001]) {
    // Whole units, then plain filler, so that the first text's work is the target exactly.
    let letter = '';
    for (let fill = 0, tries = 0; tries < 12; tries += 1) {
      const count = Math.floor((target - 400) / work(`${unit}`.normalize('NFKC').repeat(2)) * 2);
      letter = `${unit.repeat(Math.max(1, count))}${'x'.repeat(Math.max(0, fill))}${eol}${CORE}`;
      const off = target - work(screenOf(base as Mod, letter).text);
      if (off === 0) break;
      fill += eol === '\r\n' ? Math.sign(off) * Math.max(1, Math.floor(Math.abs(off) / 2)) : off;
    }
    for (const [path, read] of [['s', screenOf], ['l', letterOf]] as const) {
      const b = read(base as Mod, letter);
      const f = read(f0d as Mod, letter);
      const h = read(head, letter);
      const w = work(b.text);
      const marked = h.text === `${b.text}${MARK}` && h.text !== f.text;
      const problems: string[] = [];
      if (b.refused && !h.refused) problems.push('BAR1');
      if (marked && (!h.refused || w <= 100_000)) problems.push('BAR3 mark');
      if (!marked && (h.text !== f.text || h.refused !== f.refused || h.extra !== f.extra)) problems.push('BAR3 head differs from f0d');
      if (!marked && w > 100_000 && f.text !== b.text) problems.push('over the bound, a wider match applied by f0d, not marked');
      if (problems.length > 0) violations += 1;
      const row = { name, target, path, written: letter.length, normal: letter.normalize('NFKC').length, firstWork: w, marked, baseRefused: b.refused, f0dRefused: f.refused, headRefused: h.refused, f0dAppliedWider: f.text !== b.text, problems };
      rows.push(JSON.stringify(row));
      console.log(`${problems.length > 0 ? 'VIOLATION ' : ''}${JSON.stringify(row)}`);
    }
  }
}
writeFileSync(`${HERE}/out/nfkc.jsonl`, `${rows.join('\n')}\n`);
console.log(`judged: ${String(rows.length)}; violations: ${String(violations)}`);

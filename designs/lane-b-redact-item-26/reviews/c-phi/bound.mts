// Review C-PHI: the work bound (WIDER_WORK_BOUND = 100,000) and its mark (U+0001), base against f0d against head, on
// both paths, with letters padded so that the first reading's text is just under, at and over the bound. Synthetic only.
// Run: tsx bound.mts   (writes out/bound.jsonl; prints one line per letter and path; "VIOLATION" marks a broken bar)
import { writeFileSync } from 'node:fs';

const HERE = '/home/user/ops/designs/lane-b-redact-item-26/reviews/c-phi';
const base = await import('/home/user/rev/base/redact.ts');
const f0d = await import('/home/user/rev/f0d/redact.ts');
const head = await import('/home/user/rev/head/redact.ts');
type Mod = typeof head;
const patient = { pseudonym: 'p', names: ['JANE Q ZEPHYRA'], datesOfBirth: ['1980-03-14'], memberIds: ['SYNMEMBER0042'] };
const claims = [{ claimId: 'c1', patientPseudonym: 'p', claimNumbers: ['SYNCLAIM0001'] }];
const BOUND = 100_000;
const MARK = '\u0001';
const asLF = (text: string) => text.replace(/\r+\n/g, '\n');
const work = (text: string) => text.length + (text.includes('\r\n') ? asLF(text).length : 0);

function pad(n: number, eol = ' '): string {
  if (n <= 0) return '';
  const line = `${'paid in full. '.repeat(5).trimEnd()}${eol}`;
  let text = line.repeat(Math.ceil(n / line.length)).slice(0, n);
  if (eol !== '\r') text = text.replace(/\r+$/, (run) => '.'.repeat(run.length));
  return text;
}
function growing(n: number): string {
  // NFKC growth: "oﬃce paid. " is 13 units as written and 15 normalised.
  return 'oﬃce paid. '.repeat(Math.ceil(n / 13)).slice(0, n);
}

interface Out { text: string; refused: boolean; extra: string; ms: number }
function screenOf(m: Mod, text: string): Out {
  const t = performance.now();
  const r = m.redactLetterForScreen(text, patient, claims);
  const refused = m.holdsIdentifier(r.text, patient, claims);
  return { text: r.text, extra: JSON.stringify(r.candidates), refused, ms: Math.round(performance.now() - t) };
}
function letterOf(m: Mod, text: string): Out {
  const t = performance.now();
  const s = m.redactionSpans(text, patient, claims);
  const r = m.redactLetter(text, patient, claims);
  const refused = m.holdsIdentifier(r.text, patient, claims);
  // The spans must fit the text they are returned with: every span inside it, in order.
  let fits = true;
  let at = 0;
  for (const span of s.spans) {
    if (span.start < at || span.end > s.text.length || span.end <= span.start) fits = false;
    at = span.end;
  }
  return { text: r.text, extra: JSON.stringify([s.spans, s.text.length, fits]), refused, ms: Math.round(performance.now() - t) };
}
const PATHS = { s: screenOf, l: letterOf } as const;

const rows: string[] = [];
let violations = 0;
function judge(name: string, letter: string, expectWider: boolean | null) {
  for (const path of ['s', 'l'] as const) {
    const b = PATHS[path](base as Mod, letter);
    const f = PATHS[path](f0d as Mod, letter);
    const h = PATHS[path](head, letter);
    const w = work(b.text);
    // Marked by the bound: the first reading's text (the base's) and one mark more (a letter may end in U+0001 itself).
    const marked = h.text === `${b.text}${MARK}` && h.text !== f.text;
    const problems: string[] = [];
    if (b.refused && !h.refused) problems.push('BAR1 base refuses, head sends');
    if (marked) {
      if (!h.refused) problems.push('BAR3 marked text is sent');
      if (w <= BOUND) problems.push('BAR3 marked at or under the bound');
      if (h.text.slice(0, -1) !== b.text) problems.push('BAR3 marked text is not the first reading\'s text and the mark');
      if (path === 's' && h.extra !== b.extra) problems.push('marked: candidates are not the first reading\'s');
      if (path === 'l') {
        const [spans, length, fits] = JSON.parse(h.extra) as [unknown, number, boolean];
        const [baseSpans, baseLength] = JSON.parse(b.extra) as [unknown, number, boolean];
        if (!fits || JSON.stringify(spans) !== JSON.stringify(baseSpans) || length !== baseLength + 1) problems.push('BAR3 marked spans do not fit');
      }
    } else {
      if (h.text !== f.text || h.refused !== f.refused || h.extra !== f.extra) problems.push('BAR3 head differs from f0d and is not marked');
      if (expectWider === true && w > BOUND) problems.push('over the bound with a wider match, and not marked');
    }
    if (!b.refused && !h.refused && h.text !== b.text && h.text.length > b.text.length + 40) problems.push('look: head text much longer than base');
    if (problems.length > 0) violations += 1;
    const row = { name, path, written: letter.length, normal: letter.normalize('NFKC').length, firstWork: w, marked, baseRefused: b.refused, f0dRefused: f.refused, headRefused: h.refused, headIsF0d: h.text === f.text && h.extra === f.extra && h.refused === f.refused, f0dAppliedWider: f.text !== b.text, ms: { base: b.ms, f0d: f.ms, head: h.ms }, problems };
    rows.push(JSON.stringify(row));
    console.log(`${problems.length > 0 ? 'VIOLATION ' : ''}${JSON.stringify(row)}`);
  }
}

/** The pad length at which the first reading's text (the base's, on `path`) has work `target`, or the nearest it reaches. */
function calibrate(make: (n: number) => string, target: number, path: 's' | 'l', slope: number): string {
  let n = Math.max(0, Math.round((target - work(PATHS[path](base as Mod, make(0)).text)) / slope));
  let best = make(n);
  let bestOff = Infinity;
  for (let i = 0; i < 7; i += 1) {
    const letter = make(n);
    const off = target - work(PATHS[path](base as Mod, letter).text);
    if (Math.abs(off) < Math.abs(bestOff)) {
      best = letter;
      bestOff = off;
    }
    if (off === 0) break;
    n += Math.abs(off) < slope ? Math.sign(off) : Math.round(off / slope);
  }
  return best;
}

const CORE = 'Patient Zephy ra was seen.';
const V: { name: string; make: (n: number) => string; slope: number; targets: number[]; wider: boolean | null }[] = [
  { name: 'apart name, no line ending', make: (n) => `${pad(n)} ${CORE}`, slope: 1, targets: [99_999, 100_000, 100_001, 100_002], wider: true },
  { name: 'apart name, CR LF, even', make: (n) => `${pad(n, '\r\n')}\r\n${CORE}`, slope: 2, targets: [99_999, 100_000, 100_001, 100_002], wider: true },
  { name: 'apart name, CR LF, odd', make: (n) => `${pad(n, '\r\n')}\r\n\r\n${CORE}`, slope: 2, targets: [100_000, 100_001], wider: true },
  { name: 'apart name first, CR LF after', make: (n) => `${CORE}\r\n${pad(n, '\r\n')}`, slope: 2, targets: [100_000, 100_001], wider: true },
  { name: 'own identifiers replaced, apart name, CR LF', make: (n) => `Member ID: SYNMEMBER0042\r\nClaim SYNCLAIM0001\r\nPatient: JANE Q ZEPHYRA\r\nDOB 03/14/1980\r\n${pad(n, '\r\n')}\r\n${CORE}`, slope: 2, targets: [100_000, 100_001], wider: true },
  { name: 'held range, apart name', make: (n) => `Seen 01/01/2020-150.00Paid in full. ${pad(n)} ${CORE}`, slope: 1, targets: [100_000, 100_001], wider: true },
  { name: 'SSN twin, apart name', make: (n) => `${pad(n)} SSN 900-12-3456. ${CORE}`, slope: 1, targets: [100_000, 100_001], wider: true },
  { name: 'NFKC growth, apart name', make: (n) => `${growing(n)} ${CORE}`, slope: 15 / 13, targets: [100_000, 100_001, 100_002], wider: true },
  { name: 'NFKC growth, CR LF, apart name', make: (n) => `${growing(n)}\r\n${CORE}`, slope: 30 / 13, targets: [100_000, 100_001, 100_002], wider: true },
  { name: 'letter holds U+0001 inside, apart name', make: (n) => `${pad(n)}\u0001 ${CORE}`, slope: 1, targets: [100_000, 100_001], wider: null },
  { name: 'letter ends in U+0001, apart name', make: (n) => `${pad(n)} ${CORE}\u0001`, slope: 1, targets: [100_000, 100_001], wider: null },
  { name: 'letter holds U+0004 inside, apart name', make: (n) => `${pad(n)}\u0004 ${CORE}`, slope: 1, targets: [100_000, 100_001], wider: true },
  { name: 'letter ends in a lone high surrogate, apart name', make: (n) => `${pad(n)} ${CORE}\ud83d`, slope: 1, targets: [100_000, 100_001], wider: true },
  { name: 'letter ends in a lone low surrogate and CR, apart name', make: (n) => `${pad(n, '\r\n')} ${CORE}\udc00\r`, slope: 2, targets: [100_000, 100_001], wider: true },
  { name: 'CR CR LF endings, apart name', make: (n) => `${pad(n, '\r\r\n')}\r\r\n${CORE}`, slope: 1.99, targets: [100_000, 100_001, 100_002], wider: true },
  { name: 'lone CR endings, apart name', make: (n) => `${pad(n, '\r')}\r${CORE}`, slope: 1, targets: [100_000, 100_001], wider: true },
  { name: 'U+0085 inside the name', make: (n) => `${pad(n)} Patient Zephy\u0085ra was seen.`, slope: 1, targets: [100_000, 100_001], wider: true },
  { name: 'CR LF inside the name only', make: (n) => `${pad(n)} Patient Zephy\r\nra was seen.`, slope: 2, targets: [100_000, 100_001, 100_002], wider: true },
  { name: 'look-alike apart name', make: (n) => `${pad(n)} Patient Zеphy ra was seen.`, slope: 1, targets: [100_000, 100_001], wider: true },
];
const only = process.argv[2];
for (const variant of V) {
  if (only !== undefined && !variant.name.includes(only)) continue;
  for (const target of variant.targets) judge(`${variant.name} @${String(target)}`, calibrate(variant.make, target, 's', variant.slope), variant.wider);
}
if (only === undefined) {
  // No bound where the wider reading has nothing to apply, whatever the length.
  judge('no wider match, 200,000 written, CR LF', `${pad(200_000, '\r\n')}\r\nPatient JANE Q ZEPHYRA was seen.`, false);
  judge('no name at all, 250,000 written', pad(250_000), false);
  judge('apart name far over the bound, 300,000 written, CR LF', `${pad(300_000, '\r\n')}\r\n${CORE}`, true);

  // One path under the bound and the other over it: letters whose first text differs between the paths.
  const HELD = ['Seen 01/01/2020-150.00Paid in full. ', 'Paid $0,000.00. Service 01/01/2020-01/02/2020Paid $0,000.00. '];
  const MID = ['SSN 900-12-3456', 'Tel 555-0123', '202-555-0123', 'Member ID: SYNMEMBER0042', 'Claim SYNCLAIM0001', 'JANE Q ZEPHYRA', '900-12-3456150.00', 'No. 900-12-3456150.00', 'DOB 03/14/1980', 'ZZ1980O314', 'SYNMEMBER0042150.00', '555-0123 SYNCLAIM0001', 'Member ID 900-12-3456', 'ID Number: 5550123', 'J. ZEPHYRA', 'Zephyra, Jane'];
  let asymmetric = 0;
  for (const held of HELD) {
    for (const one of MID) {
      for (const two of MID) {
        if (asymmetric >= 4) break;
        const core = `${held}${one} ${two}`;
        const s = screenOf(base as Mod, core).text;
        const l = letterOf(base as Mod, core).text;
        if (s.length === l.length) continue;
        asymmetric += 1;
        const longer = s.length > l.length ? 's' : 'l';
        // The longer path's first text one over the bound, so the other is at or under it.
        judge(`paths differ (${longer} longer by ${String(Math.abs(s.length - l.length))}): ${JSON.stringify(core)} @100001 on ${longer}`, calibrate((n) => `${core} ${pad(n)} ${CORE}`, 100_001, longer, 1), null);
      }
    }
  }
  console.log(`asymmetric cores found: ${String(asymmetric)}`);
}
writeFileSync(`${HERE}/out/bound${only === undefined ? '' : `-${only.replace(/\W+/g, '_')}`}.jsonl`, `${rows.join('\n')}\n`);
console.log(`letters and paths judged: ${String(rows.length)}; violations: ${String(violations)}`);

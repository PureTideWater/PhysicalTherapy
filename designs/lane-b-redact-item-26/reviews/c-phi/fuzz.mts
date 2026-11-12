// Review C-PHI: differential fuzzer over the four trees (base, r0, f0d, head) and a copy of the head whose stores are
// never opened (nostore/), on both paths (screen: redactLetterForScreen; letter: redactionSpans + redactLetter).
// Synthetic letters only. Generators between the two marker comments are reviewer A's (../a/fuzz.mts), unchanged.
// Run: tsx fuzz.mts <seed> <seconds>   (writes out/fuzz-<seed>.json and out/fuzz-<seed>-<category>.jsonl)
import { writeFileSync } from 'node:fs';

const HERE = '/home/user/ops/designs/lane-b-redact-item-26/reviews/c-phi';
const seed = Number(process.argv[2] ?? 1);
const seconds = Number(process.argv[3] ?? 300);
const deadline = performance.now() + seconds * 1000;
// ---- reviewer A's generators ----
let state = seed >>> 0;
const rng = () => {
  state = (state + 0x6d2b79f5) >>> 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const int = (n: number) => Math.floor(rng() * n);
const pick = <T,>(list: readonly T[]): T => list[int(list.length)] as T;
const chance = (p: number) => rng() < p;

const mk = (names: string[], datesOfBirth: string[], memberIds: string[], numbers: string[]) => ({
  patient: { pseudonym: 'synthetic-patient-1', names, datesOfBirth, memberIds },
  claims: numbers.map((number, i) => ({ claimId: `synthetic-claim-${i + 1}`, patientPseudonym: 'synthetic-patient-1', claimNumbers: [number] })),
});
export const PATIENTS = [
  mk(['JANE Q ZEPHYRA'], ['1980-03-14'], ['SYNMEMBER0042'], ['SYNCLAIM0001']),
  mk(['JUNE MARCH'], ['1975-06-01'], ['ZZ12345/01'], ['1234.56']),
  mk(['INA VANTREE'], ['1990-12-31'], ['ZZ12345.01', '12.3456'], ['3456/15', 'ZZ98765+43']),
  mk(['BOB XU', 'AL VANTREE-ZEPHYRA'], ['2001-01-02'], ['76543210'], ['0283', 'ZZ 4455,66']),
  mk(["MARY-ANNE O'ZEPHYR"], ['1969-07-04'], ['ZZ12345&01', 'ZZ555*0123'], ['900.12', '555/0123']),
  mk(['TOBE ZEPHYRA', 'ISA QUILLFEATHER'], ['1988-02-29'], ['SYN 0042 77', '0123.45'], ['2020/01/01', '150.00']),
  mk(['ZЕPHYRA VANTREE'], ['1955-07-14'], ['ZZ12345]01', 'ZZ77^88', 'ZZ66\\55', 'ZZ44-33'], ['SYN\u{1F600}0001', 'ZZ12٣45']),
  mk(['JANE Q ZEPHYRA'], ['1980-03-14'], ['3456150.00', '12-3456', '345.678'], ['56150', '0123', '1/02/2020', '12/3456']),
  mk(['ASA NEWMAN', 'THEO UNDERWOOD'], ['1999-09-09'], ['SYN+MEMBER/0042', '5550,123'], ['55.50123', 'SYN.CLAIM,0001']),
];
type P = (typeof PATIENTS)[number];

const SEPS = [' ', ' ', ' ', '. ', '.', '  ', '\t', '\n', '\r\n', '\r', '\n\r', ' ', '​', ' ', ' . ', '-', '­', ',', '/', '*', '{', ':', ';', '_', '\u0085', '·', '…', '-\n', '-\r\n', "'", '+', '&', '|', '(', ')'];
const ALIKE: Record<string, string> = { e: 'е', a: 'а', o: 'о', E: 'Е', A: 'Α', Z: 'Ζ', H: 'Н', P: 'Р', y: 'у', '0': 'O', '1': 'l', '5': 'S', '8': 'B', '3': 'E', O: '0', S: '5' };
const SSN = ['900-12-3456', '900 12 3456', '900123456', '900.12.3456', '900-12-3456150.00', '90012345601/02/2020', '900-12-345678', '900*12*3456', '900-12-\n3456', '900-12 3456', '900 - 12 - 3456', '9 0 0 1 2 3 4 5 6', '900‑12‑3456'];
const PHONE = ['202-555-0123', '555-0123', '(202) 555-0123', '5550123', '202.555.0123', '1-800-555-0199', '2025550123', '202 555 0123', '555.0123', '(202)555-0123 x12'];
const LABELS = ['SSN', 'SSN:', 'SSN on file.', 'SSN verified.', 'Social Security No.', 'Phone', 'Tel:', 'Fax', 'Call', 'Statement', 'Account', 'Provider', 'No.', 'Member', 'ID Number:', 'Member ID:', 'Claim', 'Claim No.', 'ICN', 'DOB', 'Date of birth:', 'Patient', 'Dear', 'RE:', 'Medicare'];
const AMOUNTS = ['150.00', '$1,234.56', '$150.00', '01/01/2020-150.00', '01/01/2020-01/31/2020', '01/01/2020 - 01/31/2020150.00', 'Service 01/01/2020-150.00 Paid', 'Seen 01/01/2020-150.00Paid in full.', 'Paid $0,000.00. Service 01/01/2020-01/02/2020Paid $0,000.00.', '01/02/2020', '2020-01-02', 'units 4', '97110', 'G0283', '3 visits'];
const FILL = ['Paid', 'Thank you.', 'your claim', 'was denied', 'in a timely manner', 'This is a request', 'Resubmit it as a new claim', 'It was sent to be reviewed', 'units', 'Paid in full.', 'for', 'on', 'the', 'Dear', 'RE:', 'Patient', 'Member', 'was paid short.', 'Denied:', 'was a duplicate.'];
const GAPS = [' ', ' ', ' ', ' ', '  ', '\n', '\n', '\r\n', '\r\n', '\r', '\n\r', '\r\n\r\n', ' \r\n', '\r\n ', '\r\r\n', '', '', ', ', '. ', '\t', ' ', '​', ': ', '-', '/', '\n\n', '(', ') '];
const K1 = ['SSN on file. Statement\nNo. 900-12-3456150.00', 'SSN: see Member\nID Number: 900-12-3456150.00', 'SSN verified. Provider\nNo. 90012345601/02/2020', 'Service 01/01/2020-150.00 Paid\nSSN on file. Statement\nNo. 900-12-345678', 'SSN verified. Account No. \n900-12-3456150.00', 'SSN verified. Account \nNo. 900-12-345678'];
const HELD = ['Seen 01/01/2020-150.00Paid in full. ', 'Paid $0,000.00. Service 01/01/2020-01/02/2020Paid $0,000.00. '];
const OVERLAP_BEFORE = ['900-12-', '900.12.', '900 12 ', '900-', '202-555-', '555-', '(202) ', 'SSN 900-12-', 'Tel 202-', 'SSN ', 'Phone '];
const OVERLAP_AFTER = ['', '', '150.00', '.00', '01/02/2020', ' x12', '-3456', '-0123'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const styled = (word: string) => {
  const how = int(5);
  const letters = [...word];
  return letters.map((letter, i) => (how === 0 || (how === 1 && i === 0) || (how === 2 && i % 2 === 1) || (how === 4 && chance(0.5)) ? letter.toUpperCase() : how === 3 || how === 1 || how === 2 || how === 4 ? letter.toLowerCase() : letter)).join('');
};
const alike = (word: string) => [...word].map((letter) => (ALIKE[letter] !== undefined && chance(0.35) ? ALIKE[letter] : letter)).join('');
const split = (word: string, p: number) => {
  const one = pick(SEPS);
  return [...word].map((letter, i) => (i > 0 && chance(p) ? `${chance(0.8) ? one : pick(SEPS)}${letter}` : letter)).join('');
};

function namePiece(who: P): string {
  const name = pick(who.patient.names);
  const words = name.split(/\s+/u);
  const parts = name.split(/[\s\-']+/u);
  const mode = int(8);
  let text: string;
  if (mode === 0) text = styled(name);
  else if (mode === 1) text = split(styled(pick(parts)), 0.3);
  else if (mode === 2) text = split(styled(pick(parts)), 1);
  else if (mode === 3) text = `${(pick(words)[0] ?? 'J').toUpperCase()}${pick(['. ', ' ', '.', ', '])}${split(styled(pick(parts)), 0.25)}`;
  else if (mode === 4) text = words.map((word) => split(styled(word), 0.2)).join(pick([' ', ', ', '  ', '\n', '\r\n']));
  else if (mode === 5) text = `${split(styled(pick(parts)), 0.25)}${pick([', ', ' ', ' '])}${(pick(words)[0] ?? 'J').toUpperCase()}${pick(['.', ''])}`;
  else if (mode === 6) text = `${pick(['X', 'Mr', 'Pt', '9', 'ID'])}${split(styled(pick(parts)), 0.2)}${pick(['', 'X', '7', 'Paid'])}`;
  else text = split(styled(pick(parts)), 0.5);
  return chance(0.2) ? alike(text) : text;
}

function numberPiece(who: P): string {
  const value = pick([...who.patient.memberIds, ...who.claims.flatMap((claim) => claim.claimNumbers)]);
  const mode = int(8);
  let text: string;
  if (mode === 0 || mode === 1) text = value;
  else if (mode === 2) text = value.replace(/[^\p{L}\p{N}]+/gu, '');
  else if (mode === 3) text = value.replace(/[^\p{L}\p{N}]+/gu, pick(['/', '.', ',', '+', '&', '*', ' ', '-', ' / ', ':', '#', '\n', '\r\n', '_']));
  else if (mode === 4) text = split(value, 0.25);
  else if (mode === 5) text = value.toLowerCase();
  else if (mode === 6) text = `${pick(['X', 'ID', 'No', 'Fax ', 'ICN', '9'])}${value}${pick(['', 'X', '7', '.00'])}`;
  else text = alike(value);
  return chance(0.45) ? `${pick(['Member ID: ', 'Member ID ', 'Claim ', 'Claim No. ', 'ICN ', 'Claim: ', 'Member\n', 'ID Number: ', 'Claim#'])}${text}` : text;
}

function dobPiece(who: P): string {
  const [year, month, day] = (who.patient.datesOfBirth[0] ?? '1980-03-14').split('-');
  const forms = [`${month}/${day}/${year}`, `${year}-${month}-${day}`, `${MONTHS[Number(month) - 1]} ${Number(day)}, ${year}`, `${month}.${day}.${year}`, `${month}${day}${year}`, `${Number(month)}/${Number(day)}/${(year ?? '').slice(2)}`];
  return `${pick(['DOB ', 'DOB: ', 'Date of birth: ', '', 'born ', 'DOB'])}${pick(forms)}`;
}

function piece(who: P): string {
  const r = rng();
  if (r < 0.22) return namePiece(who);
  if (r < 0.4) return numberPiece(who);
  if (r < 0.52) return `${chance(0.4) ? `${pick(['SSN', 'SSN:', 'Social Security No.', 'SS#', 'Medicare'])}${pick([' ', '', '\n', '\r\n', ': '])}` : ''}${pick(SSN)}`;
  if (r < 0.62) return `${chance(0.4) ? `${pick(['Phone', 'Tel:', 'Fax', 'Call'])}${pick([' ', '', '\n', '\r\n', ': '])}` : ''}${pick(PHONE)}`;
  if (r < 0.72) return pick(LABELS);
  if (r < 0.82) return pick(AMOUNTS);
  if (r < 0.87) return dobPiece(who);
  if (r < 0.93) {
    const value = pick([...who.patient.memberIds, ...who.claims.flatMap((claim) => claim.claimNumbers)]);
    return `${pick(OVERLAP_BEFORE)}${chance(0.3) ? value.replace(/[^\p{L}\p{N}]+/gu, '') : value}${pick(OVERLAP_AFTER)}`;
  }
  return pick(FILL);
}

function letterFor(who: P): string {
  const other = pick(PATIENTS);
  const pieces = () => {
    let text = '';
    const n = 2 + int(7);
    for (let i = 0; i < n; i += 1) text += `${piece(chance(0.12) ? other : who)}${i < n - 1 ? pick(GAPS) : pick(['', '', '.', '\n', '\r\n'])}`;
    return text;
  };
  const r = rng();
  let text: string;
  if (r < 0.14) {
    const ending = pick(['\n', '\r\n', '\r\n', '\r', '\n\r', '\r\r\n', '\r\n\r\n']);
    text = `${chance(0.5) ? `${piece(who)}${pick(GAPS)}` : ''}${pick(K1).replaceAll('\n', ending)}${chance(0.5) ? `${pick(GAPS)}${piece(who)}` : ''}`;
  } else if (r < 0.26) text = `${pick(HELD)}${pieces()}`;
  else text = pieces();
  const s = rng();
  if (s < 0.2) text = text.replace(/\r?\n/gu, '\r\n');
  else if (s < 0.24) text = text.replace(/\r?\n/gu, '\r');
  return text;
}

const PLACEHOLDER = /\[(?:PATIENT_NAME|DATE_OF_BIRTH|MEMBER_ID|SSN|PHONE|CLAIM_[1-9]\d*)\]/gu;
/** A literal run of the head's text that is nowhere, in order, in the base's literal runs: something the base replaced stands in the head's text. */
function shown(baseText: string, headText: string): string | null {
  const b = baseText.replace(PLACEHOLDER, '\u0000');
  let at = 0;
  for (const run of headText.split(PLACEHOLDER)) {
    if (run === '') continue;
    const i = b.indexOf(run, at);
    if (i < 0) return run;
    at = i + run.length;
  }
  return null;
}

// ---- end of reviewer A's generators ----

const base = await import('/home/user/rev/base/redact.ts');
const r0 = await import('/home/user/rev/r0/redact.ts');
const f0d = await import('/home/user/rev/f0d/redact.ts');
// HEAD_TREE: another tree read in the head's place, to prove the harness (r0 holds review A's finding A-1 on the letter path).
const head = (await import(process.env.HEAD_TREE ?? '/home/user/rev/head/redact.ts')) as typeof import('/home/user/rev/head/redact.ts');
const plain = await import(`${HERE}/nostore/redact.ts`);
type Mod = typeof head;
const TREES: [string, Mod][] = [['base', base as Mod], ['r0', r0 as Mod], ['f0d', f0d as Mod], ['head', head], ['plain', plain as Mod]];

// Stored numbers with brackets and parentheses (the delta's numberForm change), and the A-2 patient.
PATIENTS.push(mk(['ZEPHYRA VANTREE'], ['1980-03-14'], ['[ZZ]123[45]', 'ZZ(12)345', 'SYN[0042]'], ['SYN]77[88', '150.00']));
PATIENTS.push(mk(['JANE Q ZEPHYRA'], ['1980-03-14'], ['3456150.00', 'SYN 0042/77'], ['150.00', 'ZZ.44.55']));

const EXOTIC = ['\r\r\n', '\r\r\r\n', '\r', '\u0085', ' ', ' ', '\n\r', '\v', '\f', '\r\n', '\r\n\r\n', ' \u0085', '\u0085 ', '\r \n', '\r\u0085\n', '​\r\n', '\r​\n', '\r\n\u0085', ' \r\n'];
const APART = [' ', ' ', '. ', '.', '\u0085', ' ', '\r\n', '\r\r\n', '\n', '\r', ' \r\n', '.\r\n', '\t', ' ', ' . ', ' ', '\f', '\u0085\u0085', '. .', '\r\n\r\n', '-\r\n', '​ ', '　'];
function apartPiece(who: P): string {
  const parts = pick(who.patient.names).split(/[\s\-']+/u).filter((part) => part.length >= 3);
  const part = styled(parts.length > 0 ? pick(parts) : 'ZEPHYRA');
  const mode = int(4);
  if (mode === 0) return [...part].join(pick(APART));
  const at = 1 + int(part.length - 1);
  const text = `${part.slice(0, at)}${pick(APART)}${part.slice(at)}`;
  if (mode === 1) return text;
  if (mode === 2) return `${pick(['J', 'Z', 'V', 'I', 'T'])}${pick(['. ', ' ', '.'])}${text}`;
  return `${text}${pick(['', ' ', '\r\n'])}${pick(OVERLAP_AFTER)}`;
}
function storedPiece(who: P): string {
  const value = pick([...who.patient.memberIds, ...who.claims.flatMap((claim) => claim.claimNumbers)]);
  const mode = int(4);
  const text = mode === 0 ? value : mode === 1 ? value.replace(/[[\]]/g, (c) => (c === '[' ? '(' : ')')) : mode === 2 ? value.replace(/[()]/g, (c) => (c === '(' ? '[' : ']')) : value.replace(/\s/gu, pick(APART));
  return `${pick(['', '', 'Member ID: ', 'Claim ', 'No. ', 'SSN ', 'Tel ', 'ID'])}${text}${pick(['', '', '.', '150.00', ' Paid'])}`;
}
function mine(who: P): string {
  let text = letterFor(who);
  if (chance(0.35)) text = `${text}${pick(GAPS)}${apartPiece(who)}${pick(GAPS)}${chance(0.5) ? piece(who) : ''}`;
  if (chance(0.15)) text = `${apartPiece(who)}${pick(EXOTIC)}${text}`;
  if (chance(0.2)) text = `${text}${pick(GAPS)}${storedPiece(who)}`;
  if (chance(0.12)) text = `${pick(K1).replaceAll('\n', pick(EXOTIC))}${pick(GAPS)}${text}`;
  if (chance(0.25)) {
    const ending = pick(EXOTIC);
    text = text.replace(/\r?\n/gu, () => (chance(0.7) ? ending : pick(EXOTIC)));
  }
  if (chance(0.1)) text = `${text}${pick(GAPS)}${pick(HELD)}${chance(0.5) ? apartPiece(who) : ''}`;
  if (chance(0.03)) {
    const at = int(text.length + 1);
    text = `${text.slice(0, at)}${pick(['\u0001', '\u0002', '\u0003', '\u0004', '\u0004'])}${text.slice(at)}`;
  }
  return text;
}

const counts: Record<string, number> = {};
const kept: Record<string, string[]> = {};
const record = (category: string, row: unknown) => {
  counts[category] = (counts[category] ?? 0) + 1;
  const list = (kept[category] ??= []);
  if (list.length < 60) list.push(JSON.stringify(row));
};
const count = (category: string) => {
  counts[category] = (counts[category] ?? 0) + 1;
};

interface Out { text: string; refused: boolean; extra: string; candidates?: readonly string[]; spans?: readonly { start: number; end: number; placeholder: string }[]; normal?: string }
function screenOf(m: Mod, text: string, who: P): Out {
  const r = m.redactLetterForScreen(text, who.patient, who.claims);
  return { text: r.text, candidates: r.candidates, extra: JSON.stringify(r.candidates), refused: m.holdsIdentifier(r.text, who.patient, who.claims) };
}
function letterOf(m: Mod, text: string, who: P): Out {
  const s = m.redactionSpans(text, who.patient, who.claims);
  const r = m.redactLetter(text, who.patient, who.claims);
  return { text: r.text, spans: s.spans, normal: s.text, extra: JSON.stringify([s.text, s.spans]), refused: m.holdsIdentifier(r.text, who.patient, who.claims) };
}
const both = (m: Mod, text: string, who: P) => ({ s: screenOf(m, text, who), l: letterOf(m, text, who) });
const same = (a: Out, b: Out) => a.text === b.text && a.refused === b.refused && a.extra === b.extra;
const coveredBy = (spans: NonNullable<Out['spans']>, at: number) => spans.some((span) => span.start <= at && at < span.end);

const ring: { text: string; pi: number; s: Out; l: Out }[] = [];

function one(text: string, pi: number) {
  const who = PATIENTS[pi] as P;
  const row = { letter: text, patient: pi };
  count('letters');
  const R: Record<string, { s: Out; l: Out } | null> = {};
  for (const [name, m] of TREES) {
    try {
      R[name] = both(m, text, who);
    } catch (error) {
      record(`throws_${name}`, { ...row, error: String(error).slice(0, 300) });
      R[name] = null;
    }
  }
  if (R.base === null && R.head !== null && (!R.head.s.refused || !R.head.l.refused)) record('base_throws_head_sends', row);
  if (!R.base || !R.r0 || !R.f0d || !R.head || !R.plain) return;
  for (const path of ['s', 'l'] as const) {
    const b = R.base[path], r = R.r0[path], f = R.f0d[path], h = R.head[path], p = R.plain[path];
    // Bar 1
    if (b.refused && !h.refused) record(`BAR1_base_refuses_head_sends_${path}`, { ...row, baseText: b.text, headText: h.text });
    if (b.refused && h.text !== b.text) record(`refused_letter_written_otherwise_${path}`, { ...row, baseText: b.text, headText: h.text });
    if (path === 's' && b.refused && h.extra !== b.extra) record('refused_letter_other_candidates', { ...row, base: b.extra, head: h.extra });
    // Bar 2
    if (!b.refused && !h.refused) {
      count(`both_send_${path}`);
      const run = shown(b.text, h.text);
      if (run !== null) record(`BAR2_shown_${path}`, { ...row, run, baseText: b.text, headText: h.text });
      if (path === 's') {
        const offered = new Set(h.candidates);
        const dropped = (b.candidates ?? []).filter((candidate) => !offered.has(candidate));
        if (dropped.length > 0) record('BAR2_candidate_dropped', { ...row, dropped, base: b.extra, head: h.extra });
      } else if (b.normal === h.normal) {
        for (const span of b.spans ?? []) {
          for (let at = span.start; at < span.end; at += 1) {
            if (!coveredBy(h.spans ?? [], at)) {
              record('BAR2_span_uncovered', { ...row, at, base: b.extra, head: h.extra });
              at = span.end;
            }
          }
        }
      } else record('normal_differs_l', { ...row, base: b.normal, head: h.normal });
      if (h.text !== b.text) count(`wider_applied_and_sent_${path}`);
    }
    // Bar 3: the head is f0d, or refuses by the mark.
    const marked = h.text.endsWith('\u0001') && !f.text.endsWith('\u0001');
    if (marked) {
      count(`marked_${path}`);
      if (!h.refused) record(`BAR3_marked_sent_${path}`, row);
    } else if (!same(h, f)) record(`BAR3_head_differs_from_f0d_${path}`, { ...row, f0d: f, head: h });
    // Bar 4: the stores.
    if (!same(h, p)) record(`BAR4_stored_differs_from_fresh_${path}`, { ...row, fresh: p, head: h });
    // For the record: the reviewed build against the head, and how often the head refuses what the base sends.
    if (r.refused && !h.refused) record(`r0_refuses_head_sends_${path}`, { ...row, r0Text: r.text, headText: h.text });
    if (!r.refused && h.refused) record(`r0_sends_head_refuses_${path}`, { ...row, r0Text: r.text, headText: h.text });
    if (!b.refused && h.refused) count(`base_sends_head_refuses_${path}`);
    if (b.refused) count(`base_refuses_${path}`);
    if (!h.refused) count(`head_sends_${path}`);
  }
  if (R.head.s.refused !== R.head.l.refused) count('paths_answer_differently');
  ring.push({ text, pi, s: R.head.s, l: R.head.l });
  if (ring.length > 300) ring.splice(int(ring.length), 1);
}

/** A letter read earlier, read again now (another order, other letters and patients in between), by the head `m`. */
function again(m: Mod, category: string) {
  const entry = pick(ring);
  const who = PATIENTS[entry.pi] as P;
  count(`${category}_reads`);
  try {
    const now = both(m, entry.text, who);
    if (!same(now.s, entry.s) || !same(now.l, entry.l)) record(`BAR4_${category}_differs`, { letter: entry.text, patient: entry.pi, then: entry, now });
  } catch (error) {
    record(`BAR4_${category}_throws`, { letter: entry.text, patient: entry.pi, error: String(error).slice(0, 300) });
  }
}

let n = 0;
let instances = 0;
while (performance.now() < deadline) {
  const pi = int(PATIENTS.length);
  one(mine(PATIENTS[pi] as P), pi);
  n += 1;
  if (ring.length > 20 && chance(0.1)) again(head, 'reread_in_another_order');
  if (n % 400 === 0) {
    // A fresh instance of the head's module (its own module state: fold, stores, patterns' lastIndex), as a new process has.
    const fresh = (await import(`/home/user/rev/head/redact.ts?instance=${String(seed)}-${String(n)}`)) as Mod;
    if (fresh === head || fresh.redactLetter === head.redactLetter) count('fresh_instance_was_not_fresh');
    else {
      instances += 1;
      for (let i = 0; i < 40; i += 1) again(fresh, 'fresh_instance');
    }
  }
}
counts.fresh_instances = instances;
writeFileSync(`${HERE}/out/fuzz-${String(seed)}.json`, JSON.stringify({ seed, seconds, counts }, null, 1));
for (const [category, rows] of Object.entries(kept)) writeFileSync(`${HERE}/out/fuzz-${String(seed)}-${category}.jsonl`, `${rows.join('\n')}\n`);
console.log(JSON.stringify({ seed, counts }));

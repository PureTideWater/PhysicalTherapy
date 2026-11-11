// Review A: differential fuzzer, base (f3f5a642) against head. Synthetic letters only.
// Run: node fuzz.mts <seed> <seconds>   (writes out/fuzz-<seed>.json and out/fuzz-<seed>-<category>.jsonl)
import { writeFileSync } from 'node:fs';

const HERE = '/home/user/ops/designs/lane-b-redact-item-26/reviews/a';
const base = await import('/home/user/rev/base/redact.ts');
const head = await import('/home/user/rev/head/redact.ts');
const open = await import(`${HERE}/open/redact.ts`);
const O = open.__open;

const seed = Number(process.argv[2] ?? 1);
const seconds = Number(process.argv[3] ?? 400);
const deadline = performance.now() + seconds * 1000;

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

const counts: Record<string, number> = {};
const kept: Record<string, string[]> = {};
const record = (category: string, row: unknown) => {
  counts[category] = (counts[category] ?? 0) + 1;
  const list = (kept[category] ??= []);
  if (list.length < 400) list.push(JSON.stringify(row));
};
const count = (category: string) => {
  counts[category] = (counts[category] ?? 0) + 1;
};
const time = { baseScreen: 0, headScreen: 0, baseLetter: 0, headLetter: 0 };
let worst = { ratio: 0, letter: '', baseMs: 0, headMs: 0, patient: 0 };

type Mod = typeof head;
function screenOf(m: Mod, text: string, who: P) {
  const r = m.redactLetterForScreen(text, who.patient, who.claims);
  return { text: r.text as string, candidates: r.candidates as readonly string[], refused: m.holdsIdentifier(r.text, who.patient, who.claims) as boolean };
}

function one(text: string, pi: number, n: number) {
  const who = PATIENTS[pi] as P;
  const row = { letter: text, patient: pi };
  count('letters');
  let t = performance.now();
  const b = screenOf(base, text, who);
  const baseMs = performance.now() - t;
  time.baseScreen += baseMs;
  t = performance.now();
  let h: ReturnType<typeof screenOf>;
  try {
    h = screenOf(head, text, who);
  } catch (error) {
    record('d_head_throws', { ...row, error: String(error) });
    return;
  }
  const headMs = performance.now() - t;
  time.headScreen += headMs;
  if (headMs > 40 && headMs / baseMs > worst.ratio) worst = { ratio: headMs / baseMs, letter: text, baseMs, headMs, patient: pi };
  if (headMs > 3 * baseMs + 30) record('slow', { ...row, baseMs, headMs });

  if (b.refused && !h.refused) record('a_base_refuses_head_sends', { ...row, base: null, head: h.text });
  if (b.refused && (h.text !== b.text || JSON.stringify(h.candidates) !== JSON.stringify(b.candidates))) record('f_refused_letter_written_otherwise', { ...row, baseText: b.text, headText: h.text });
  if (!b.refused && h.refused) {
    count('e_base_sends_head_refuses');
    const lf = text.includes('\r\n') ? screenOf(head, text.replaceAll('\r\n', '\n'), who) : null;
    record(text.includes('\r\n') ? (lf !== null && lf.refused ? 'e_crlf_lf_refused_too' : 'e_crlf_lf_SENT') : 'e_no_crlf', { ...row, base: b.text, headText: h.text });
  }
  if (!b.refused && !h.refused) {
    count('both_send');
    if (h.text !== b.text) {
      record('both_send_text_differs', { ...row, base: b.text, head: h.text });
      const run = shown(b.text, h.text);
      if (run !== null) record('b_base_replaced_head_shows', { ...row, base: b.text, head: h.text, run });
    }
    const missing = b.candidates.filter((candidate) => !h.candidates.includes(candidate));
    if (missing.length > 0) record('c_candidate_missing', { ...row, missing, base: b.candidates, head: h.candidates });
  }
  if (b.refused && h.refused) count('both_refuse');

  // The path without the screen: redactLetter and redactionSpans apply every match.
  if (n % 2 === 0) {
    const sb = base.redactionSpans(text, who.patient, who.claims);
    const sh = head.redactionSpans(text, who.patient, who.claims);
    if (sb.text !== sh.text) record('p2_spans_text_differs', row);
    const bare = sb.spans.filter((span: { start: number; end: number }) => !sh.spans.some((wide: { start: number; end: number }) => wide.start <= span.start && span.end <= wide.end));
    if (bare.length > 0) record('p2_base_span_not_covered', { ...row, bare, base: sb.spans, head: sh.spans });
    t = performance.now();
    const lb = base.redactLetter(text, who.patient, who.claims).text as string;
    const hb = base.holdsIdentifier(lb, who.patient, who.claims) as boolean;
    time.baseLetter += performance.now() - t;
    t = performance.now();
    const lh = head.redactLetter(text, who.patient, who.claims).text as string;
    const hh = head.holdsIdentifier(lh, who.patient, who.claims) as boolean;
    time.headLetter += performance.now() - t;
    count('p2_letters');
    if (hb && !hh) record('p2_base_refuses_head_sends', { ...row, baseLetter: lb, headLetter: lh, headWouldRefuseBaseText: head.holdsIdentifier(lb, who.patient, who.claims), baseChecksHeadText: base.holdsIdentifier(lh, who.patient, who.claims), screenBase: b.refused ? null : b.text, screenHead: h.refused ? null : h.text });
    if (!hb && hh) count('p2_base_sends_head_refuses');
    if (h.refused && !hh && !(b.refused && !hb)) record('p2_head_paths_part', { ...row, headLetter: lh, baseLetter: lb, baseLetterRefused: hb });
  }

  // The stores: the first reading inside and outside a reading, against the base; the wider reading; the same call twice.
  if (n % 3 === 0) {
    const normal = O.unbracketed(text);
    const subject = O.letterSubject(who.patient, who.claims);
    const outside = O.screenAsFirstRead(normal, subject, who.claims);
    const freshRefused = O.holdsAsFirstRead(outside.text, who.patient, who.claims);
    const freshWider = O.widerMatchesIn(O.unmarked(normal), subject);
    const inside = O.inOneReading(() => {
      const first = O.screenAsFirstRead(normal, subject, who.claims);
      const refused = O.holdsAsFirstRead(first.text, who.patient, who.claims);
      const wider = O.widerMatchesIn(O.unmarked(normal), subject);
      const again = O.screenAsFirstRead(normal, subject, who.claims);
      return { first, refused, wider, again };
    });
    count('store_letters');
    if (outside.text !== b.text || JSON.stringify(outside.candidates) !== JSON.stringify(b.candidates)) record('s_first_reading_is_not_the_base', { ...row, base: b.text, first: outside.text });
    if (freshRefused !== b.refused && outside.text === b.text) record('s_first_check_is_not_the_base', { ...row, base: b.refused, first: freshRefused });
    if (JSON.stringify(inside.first) !== JSON.stringify(outside) || JSON.stringify(inside.again) !== JSON.stringify(outside)) record('s_first_reading_inside_differs', { ...row, inside: inside.first.text, outside: outside.text });
    if (inside.refused !== freshRefused) record('s_check_inside_differs', { ...row, inside: inside.refused, outside: freshRefused });
    if (JSON.stringify(inside.wider) !== JSON.stringify(freshWider)) record('s_wider_inside_differs', { ...row, inside: inside.wider, outside: freshWider });
    const stores = O.stores();
    if (stores.views !== null || stores.dates !== null || stores.forms !== null || stores.fold !== 'plain') record('s_store_left_open', { ...row, stores });
    const twin = screenOf(open, text, who);
    if (twin.text !== h.text || twin.refused !== h.refused || JSON.stringify(twin.candidates) !== JSON.stringify(h.candidates)) record('s_opened_copy_differs_from_head', row);
    const twice = screenOf(head, text, who);
    if (twice.text !== h.text || twice.refused !== h.refused || JSON.stringify(twice.candidates) !== JSON.stringify(h.candidates)) record('s_second_call_differs', row);
    // The composition, exactly: where the head wrote another text than the first reading, every span of the first reading is inside a span of the head's.
    if (h.text !== outside.text) {
      const covered = O.within([...outside.spans]);
      const spans = O.merge([...outside.found, ...freshWider.filter((match: { start: number; end: number }) => !covered(match))]);
      if (O.written(normal, spans) !== h.text) record('s_composition_not_reproduced', { ...row, head: h.text, rebuilt: O.written(normal, spans) });
      const bare = outside.spans.filter((span: { start: number; end: number }) => !spans.some((wide: { start: number; end: number }) => wide.start <= span.start && span.end <= wide.end));
      if (bare.length > 0) record('b_exact_first_span_not_covered', { ...row, bare });
    }
  }
}

/**
 * Mode k1 (node fuzz.mts <seed> <seconds> k1): K-1's own claim, "a CR LF letter is refused wherever its LF writing is".
 * Every letter is written with CR LF; where the head sends it, the head reads the same letter written with LF.
 */
function k1(text: string, pi: number) {
  const who = PATIENTS[pi] as P;
  const crlf = text.replace(/\r\n|\n\r|\r|\n/gu, '\r\n');
  if (!crlf.includes('\r\n')) return;
  count('k1_letters');
  const h = screenOf(head, crlf, who);
  if (h.refused) return;
  count('k1_head_sends_crlf');
  const lf = screenOf(head, crlf.replaceAll('\r\n', '\n'), who);
  if (!lf.refused) return;
  const b = screenOf(base, crlf, who);
  const first = O.screenAsFirstRead(O.unbracketed(crlf), O.letterSubject(who.patient, who.claims), who.claims);
  record(first.text === h.text ? 'k1_sent_with_crlf_refused_with_lf_no_wider_match' : 'k1_sent_with_crlf_refused_with_lf_wider_applied', { letter: crlf, patient: pi, head: h.text, headOnLf: null, base: b.refused ? null : b.text });
}

let n = 0;
while (process.argv[4] === 'k1' && performance.now() < deadline) {
  const pi = int(PATIENTS.length);
  k1(letterFor(PATIENTS[pi] as P), pi);
  n += 1;
}
while (performance.now() < deadline) {
  const pi = int(PATIENTS.length);
  const text = letterFor(PATIENTS[pi] as P);
  one(text, pi, n);
  // The same letter for another patient: the words of a letter that are no identifier of theirs.
  if (n % 4 === 0) one(text, int(PATIENTS.length), n + 1);
  n += 1;
}

const run = process.argv[4] === 'k1' ? `k1-${seed}` : `fuzz-${seed}`;
writeFileSync(`${HERE}/out/${run}.json`, JSON.stringify({ seed, seconds, generated: n, counts, time, worst }, null, 2));
for (const [category, rows] of Object.entries(kept)) writeFileSync(`${HERE}/out/${run}-${category}.jsonl`, `${rows.join('\n')}\n`);
console.log(JSON.stringify({ seed, generated: n, counts, time, worstRatio: worst.ratio }, null, 1));

// Review C-PHI: one path under the work bound and the other over it. The screen path counts the text appliedMatches
// wrote, the letter path the text matchesIn wrote; letters whose two first texts differ in length are found with
// reviewer A's generators (between the marker comments, unchanged), padded so that the longer first text is one over
// the bound, and judged on both paths, base against f0d against head. Synthetic only. Run: tsx asym.mts <seed>
import { writeFileSync } from 'node:fs';

const HERE = '/home/user/ops/designs/lane-b-redact-item-26/reviews/c-phi';
const seed = Number(process.argv[2] ?? 5);
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
const f0d = await import('/home/user/rev/f0d/redact.ts');
const head = await import('/home/user/rev/head/redact.ts');
type Mod = typeof head;
const BOUND = 100_000;
const MARK = '\u0001';
const work = (text: string) => text.length + (text.includes('\r\n') ? text.replace(/\r+\n/g, '\n').length : 0);
const pad = (n: number) => (n <= 0 ? '' : `${'paid in full. '.repeat(5).trimEnd()} `.repeat(Math.ceil(n / 70)).slice(0, n));
interface Out { text: string; refused: boolean; extra: string }
const screenOf = (m: Mod, text: string, who: P): Out => {
  const r = m.redactLetterForScreen(text, who.patient, who.claims);
  return { text: r.text, extra: JSON.stringify(r.candidates), refused: m.holdsIdentifier(r.text, who.patient, who.claims) };
};
const letterOf = (m: Mod, text: string, who: P): Out => {
  const s = m.redactionSpans(text, who.patient, who.claims);
  const r = m.redactLetter(text, who.patient, who.claims);
  return { text: r.text, extra: JSON.stringify(s.spans), refused: m.holdsIdentifier(r.text, who.patient, who.claims) };
};
const PATHS = { s: screenOf, l: letterOf } as const;

// Harvest: short letters whose first text differs in length between the paths (the base is the first reading).
const cores: { letter: string; pi: number; screenSends: boolean; by: number }[] = [];
let tried = 0;
let asymmetric = 0;
let asymmetricScreenSends = 0;
// With `any` as the second argument: any letter of the generators, to the count the third argument gives, the screen path's
// first text to the bound (even cores) or one over it (odd cores).
const ANY = process.argv[3] === 'any';
const LIMIT = Number(process.argv[4] ?? 8);
while (tried < 40_000 && (ANY ? cores.length < LIMIT : cores.filter((core) => core.screenSends).length < 4 || cores.length < 8)) {
  tried += 1;
  const pi = int(PATIENTS.length);
  const who = PATIENTS[pi] as P;
  const letter = letterFor(who);
  if (/[\u0001-\u0003]/u.test(letter)) continue;
  let s: Out, l: Out;
  try {
    s = screenOf(base as Mod, letter, who);
    l = letterOf(base as Mod, letter, who);
  } catch {
    continue;
  }
  if (ANY) {
    cores.push({ letter, pi, screenSends: !s.refused, by: 1 });
    continue;
  }
  if (s.text.length === l.text.length) continue;
  asymmetric += 1;
  if (!s.refused) asymmetricScreenSends += 1;
  if ((!s.refused && cores.filter((core) => core.screenSends).length < 4) || (s.refused && cores.filter((core) => !core.screenSends).length < 4)) cores.push({ letter, pi, screenSends: !s.refused, by: s.text.length - l.text.length });
}
console.log(JSON.stringify({ tried, asymmetric, asymmetricScreenSends, kept: cores.length }));

const rows: string[] = [];
let violations = 0;
for (const core of cores) {
  const who = PATIENTS[core.pi] as P;
  const part = who.patient.names.flatMap((name) => name.split(/[\s\-']+/u)).find((each) => /^[A-Z]{5,}$/u.test(each)) ?? 'ZEPHYRA';
  const apart = `${part[0] ?? 'Z'}${part.slice(1, -2).toLowerCase()} ${part.slice(-2).toLowerCase()}`;
  let odd = false;
  const make = (n: number) => `${core.letter}\n${pad(n)}${odd ? '\r\n' : ''}\nPatient ${apart} was seen.`;
  const target = ANY && cores.indexOf(core) % 2 === 0 ? BOUND : BOUND + 1;
  const longer = core.by > 0 ? 's' : 'l';
  // The longer path's first text to one over the bound.
  let n = BOUND;
  for (let i = 0; i < 12; i += 1) {
    const off = target - work(PATHS[longer](base as Mod, make(n), who).text);
    if (off === 0) break;
    // With CR LF a character of padding counts twice: one more CR LF (three) changes the parity.
    if (Math.abs(off) % 2 === 1 && make(n).includes('\r\n')) {
      odd = !odd;
      continue;
    }
    n += Math.abs(off) < 2 ? Math.sign(off) : Math.round(off / (make(n).includes('\r\n') ? 2 : 1));
  }
  const letter = make(n);
  for (const path of ['s', 'l'] as const) {
    const b = PATHS[path](base as Mod, letter, who);
    const f = PATHS[path](f0d as Mod, letter, who);
    const h = PATHS[path](head, letter, who);
    const marked = h.text === `${b.text}${MARK}` && h.text !== f.text;
    const problems: string[] = [];
    if (b.refused && !h.refused) problems.push('BAR1 base refuses, head sends');
    if (marked && !h.refused) problems.push('BAR3 marked text is sent');
    if (marked && work(b.text) <= BOUND) problems.push('BAR3 marked at or under the bound');
    if (!marked && (h.text !== f.text || h.refused !== f.refused || h.extra !== f.extra)) problems.push('BAR3 head differs from f0d and is not marked');
    if (problems.length > 0) violations += 1;
    const row = { core: core.letter, patient: core.pi, apart, path, firstWork: work(b.text), marked, baseRefused: b.refused, f0dRefused: f.refused, headRefused: h.refused, f0dAppliedWider: f.text !== b.text, headIsF0d: h.text === f.text && h.refused === f.refused && h.extra === f.extra, problems };
    rows.push(JSON.stringify(row));
    console.log(`${problems.length > 0 ? 'VIOLATION ' : ''}${JSON.stringify(row)}`.slice(0, 900));
  }
}
writeFileSync(`${HERE}/out/asym-${String(seed)}${ANY ? '-any' : ''}.jsonl`, `${rows.join('\n')}\n`);
console.log(`judged: ${String(rows.length)}; violations: ${String(violations)}`);

// Corpus sources with generator metadata: the round-3 findings' literal inputs (S1), targeted generators T1-T4, and the
// property tests' own generators (T5). SYNTHETIC data only: patients ZEPHYRA / VANTREE and the reviewers' synthetic
// short-part names, SYN-prefixed and ZZ IDs, SSNs 900-xx-xxxx, phones NPA-555-01xx.
//
// A record: { s: source, P: patient, C: claims, t: text, sec?: [kind, at, len][], keep?: [cls, at, len][] }.
// Positions are in the letter as redaction reads it (NFKC, its own square brackets made parentheses: same positions).
// Secret kinds: ssn, phone, name, initial, dob, member, claim. Keep classes: code, amount, date, id, ref, unit.
import fc from 'fast-check';

export interface Patient { pseudonym: string; names: string[]; datesOfBirth: string[]; memberIds: string[] }
export interface Claim { claimId: string; patientPseudonym: string; claimNumbers: string[] }
export type Sec = [string, number, number];
export interface Rec { s: string; P: Patient; C: Claim[]; t: string; sec?: Sec[]; keep?: Sec[]; d?: string[] }

/** The reviewers' PRNG (mulberry32 variant): deterministic per seed. */
export function prng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const MEMBERS = ['SYNMEMBER0042', 'ZZ7654321'];
export const CLAIMS = ['SYNCLAIM0001', 'C2026000417'];
export const patientOf = (names: string[], id = 'synthetic-patient-g'): { P: Patient; C: Claim[] } => ({
  P: { pseudonym: id, names, datesOfBirth: ['1980-03-14'], memberIds: [...MEMBERS] },
  C: [{ claimId: 'c1', patientPseudonym: id, claimNumbers: [...CLAIMS] }],
});
/** The reviewers' default patient (rg-review-phi-3/cmp.mts), exactly, so harvested letters share its key. */
export const P13 = { P: { pseudonym: 'synthetic-patient-13', names: ['JANE Q ZEPHYRA'], datesOfBirth: ['1980-03-14'], memberIds: ['SYNMEMBER0042', 'ZZ7654321'] }, C: [{ claimId: 'c1', patientPseudonym: 'synthetic-patient-13', claimNumbers: ['SYNCLAIM0001', 'C2026000417'] }] };

type Piece = string | [string, string?, string?]; // text | [text, secretKind?, keepClass?]

const nk = (s: string) => s.normalize('NFKC');
/** A letter from pieces, with each secret or keep piece's position; null metadata where NFKC is not piecewise. */
export function build(s: string, who: { P: Patient; C: Claim[] }, pieces: Piece[]): Rec {
  let text = '';
  const sec: Sec[] = [];
  const keep: Sec[] = [];
  let ok = true;
  for (const piece of pieces) {
    const [t, kind, cls] = typeof piece === 'string' ? [piece] : piece;
    const at = nk(text).length;
    text += t;
    const len = nk(text).length - at;
    if (nk(text).slice(at, at + len) !== nk(t)) ok = false;
    if (kind) sec.push([kind, at, len]);
    if (cls) keep.push([cls, at, len]);
  }
  const rec: Rec = { s, P: who.P, C: who.C, t: text };
  if (ok) { rec.sec = sec; if (keep.length > 0) rec.keep = keep; }
  return rec;
}

const title = (w: string) => w.charAt(0) + w.slice(1).toLowerCase();

// ---------------------------------------------------------------------------------------------------------------------
// S1: the round-3 findings' inputs (and the earlier rounds' rows they cite), by hand from round3-findings.json.
export function findings(): Rec[] {
  const out: Rec[] = [];
  const add = (who: { P: Patient; C: Claim[] }, tag: string, letters: string[]) => { for (const t of letters) out.push({ s: `findings/${tag}`, P: who.P, C: who.C, t }); };
  add(P13, 'PHI3-1', ['Please call MsZephyra at 555-0123.', 'Phone for JaneZephyra: 555-0123', 'Re: Fax DrJane 555-0123', 'SSN of MsZephyra: 90012-3456', 'Social Security number of MsZephyra: 900.12 3456', 'SSN DearJane 900.12 3456', 'SSN ZEPHYRAJane 900.12 3456', 'TTY DOB03/14/1980-9001 23456', 'Fax for Zephyra 897.24 6610', 'Call us about 150.00 1234']);
  add(P13, 'PHI3-2', ['Re: SSN MsZephyra0900123456', 'Re: SSN Zephyra1900123456', 'Re: SSN for Zephyra1900123456', 'Re: Fax ZephyraPaid900.12 3456', 'Re: SSN ZephyraPaid900,12 3456', 'SSN Zephyra900.12 3456', 'SSN Zephyra1900123456', 'SSN MsZephyra0900123456', 'Fax ZephyraPaid900.12 3456']);
  add(patientOf(['TY Q ZEPHYRA']), 'PHI3-3', ['Re: Social Security900.12 3456', 'SOCIAL SECURITY90012-3456', 'Member Ty Zephyra, Social Security900,12 3456', 'Social Security900.12 3456']);
  add(patientOf(['SN VANTREE']), 'PHI3-3', ['SSN900.12 3456']);
  add(P13, 'PHI3-4', ['DOB 03/14/1980150.00 - 01/01/2020', '(14 March 1980150.00-01/01/2020)', '(3/14/80150.00 - 01/01/2020)', '(Zeph­yraSeen0.00-01/02/2020)', 'Seen 3/14/80150.00']);
  add(P13, 'PHI3-5', ['Re: SSN 01/01/2020-1st Jan 2020St 90012-3456', 'SSN 01/01/2020-4th of March, 2020St 900.12 3456', 'SSN $10-1st Jan 2020 202 555 01.23', 'SSN $10-01/02/2020 202 555 01.23', 'DOS Tel: ZZ7654321: 900 12 34.56-01/03/2020']);
  add(P13, 'PHI2-1', ['Paid $0,000.00. Service 01/01/2020-01/02/2020Zephyra $0,000.00', 'DOB 150.00-03/14/1980Paid', 'Seen 150.00Q Zephyra', 'Seen 0.00-01/02/2020Q ZephyraPaid', '01/02/2020ZEPHYRAJANEQ150.00', 'ZEPHYRA Q150.00']);
  add(P13, 'PHI2-2', ['Seen 150.00SYNCLAIM0001', 'Seen 150.00ZZ7654321', 'Seen 150.00Zephyra']);
  add(P13, 'MOD-16', ['Paid $0,000.00. Service 01/01/2020-01/02/2020Paid $0,000.00']);
  add(patientOf(['MARIA MARTINEZ']), 'GATEWAY3-1', ['MARTINEZ, MARIA M54.50 97110 1 150.00']);
  add(patientOf(['GEORGE ZEPHYRA']), 'GATEWAY3-1', ['Patient GEORGE ZEPHYRA G0283 denied.', 'Patient George Zephyra Z96.651 on file']);
  add(P13, 'GATEWAY3-1', ['Patient: JANE Q ZEPHYRA\nJ3301 1 150.00']);
  add(patientOf(['QIANG MA']), 'GATEWAY3-2', ['Remark: MA130 applies.', 'Remark: MA04 applies.']);
  add(patientOf(['MIN XU']), 'GATEWAY3-2', ['CPT 97110XU denied', 'Total time 45min.', 'Total time 30MIN.']);
  add(patientOf(['ANN LIN']), 'GATEWAY3-2', ['Line1 97110 150.00', 'Paid 150.00Annual']);
  add(patientOf(['AL ZEPHYRA']), 'GATEWAY3-2', ['Remark: ALJ2 applies.']);
  add(patientOf(['ED VANTREE']), 'GATEWAY3-2', ['Remark: Edit1 applies.']);
  add(patientOf(['DE VANTREE']), 'GATEWAY3-2', ['Seen 150.00Deductible']);
  add(patientOf(['AA VANTREE']), 'GATEWAY3-2', ['Paid $10-$20AA']);
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// T1: PHI2-1/PHI2-2 glued shapes for every own-identifier kind, glued before/after a digit, a letter, a range end and a
// placeholder, for patients with short parts ("Al", "Ma", "Xu", "May", "June", "Ty") and initials.
const DOB_FORMS = ['03/14/1980', '3/14/80', '1980-03-14', '14.03.1980', 'March 14, 1980', '14 March 1980', '03-14-1980', 'Mar 14, 1980', '14th March 1980', '3.14.1980', '1980/03/14', '14-Mar-1980', '03141980', '19800314', 'Mar. 14 1980', '03/14/80'];
const T1_LEFT = ['', 'Seen ', 'Seen', 'Paid', 'PAID', 'Dear', 'Ms', 'DOB', 'DOB ', '150.00', '$10', '1', '01/02/2020', '01/01/2020-01/02/2020', '150.00-120.00', '$10-$20', '01/01/2020-150.00', '2020-01-01–2020-01-02', '1/1/20−1/2/20', '[SSN]', '[CLAIM_1]', '#'];
const T1_RIGHT = ['', ' ', 'Paid', 'paid', 'PAID', 'Seen', 'St. Mary', 'TH', 'th', 'nd floor', '150.00', '1', '-01/03/2020', '-150.00', '01/02/2020', '.', '[SSN]', '\nPaid', '_'];
const WRAP: [string, string][] = [['Re: ', ''], ['Paid $0,000.00. Service ', ' $0,000.00'], ['(', ')'], ['DOS ', '.'], ['', '']];
const T1_PATIENTS = ['JANE Q ZEPHYRA', 'AL Q ZEPHYRA', 'JANE MA', 'XU VANTREE', 'MAY ZEPHYRA', 'JUNE Q VANTREE', 'TY Q ZEPHYRA'];

function nameForms(name: string): Piece[][] {
  const parts = name.split(' ');
  const first = parts[0]!, last = parts.at(-1)!, mi = parts.length > 2 ? parts[1]! : undefined;
  const F = title(first), L = title(last);
  const forms: Piece[][] = [
    [[F, 'name']], [[first, 'name']], [[first.toLowerCase(), 'name']], [[L, 'name']], [[last, 'name']], [[last.toLowerCase(), 'name']],
    [[F, 'name'], ' ', [L, 'name']], [[L, 'name'], ', ', [F, 'name']], [[F, 'name'], [L, 'name']], [[last, 'name'], [first, 'name']],
    [[first[0]!, 'initial'], '. ', [L, 'name']],
  ];
  if (mi !== undefined) forms.push([[L, 'name'], ' ', [mi, 'initial']], [[F, 'name'], [mi, 'initial']], [[mi, 'initial'], [L, 'name']], [[F, 'name'], ' ', [mi, 'initial'], ' ', [L, 'name']]);
  return forms;
}

export function t1(): Rec[] {
  const out: Rec[] = [];
  let w = 0;
  const emit = (who: { P: Patient; C: Claim[] }, tag: string, form: Piece[]) => {
    for (const l of T1_LEFT) for (const r of T1_RIGHT) {
      const [pre, post] = WRAP[w++ % WRAP.length]!;
      out.push(build(`T1/${tag}`, who, [pre, l, ...form, r, post]));
    }
  };
  for (const name of T1_PATIENTS) {
    const who = patientOf([name], 'synthetic-patient-t1');
    for (const form of nameForms(name)) emit(who, 'name', form);
  }
  const who = patientOf(['JANE Q ZEPHYRA'], 'synthetic-patient-t1');
  for (const d of DOB_FORMS) emit(who, 'dob', [[d, 'dob']]);
  for (const m of ['SYNMEMBER0042', 'ZZ7654321', 'ZZ 7654321', 'zz7654321', 'ZZ-7654321']) emit(who, 'member', [[m, 'member']]);
  for (const c of ['SYNCLAIM0001', 'C2026000417', 'synclaim0001', 'c2026000417']) emit(who, 'claim', [[c, 'claim']]);
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// T2: SSN and phone label forms with the call's own identifier (glued, camel-case or spaced) between label and number.
const T2_LABELS = ['SSN ', 'SSN: ', 'SSN', 'SSN#', 'SSN for ', 'SSN of ', 'Social Security ', 'Social Security', 'SOCIAL SECURITY', 'Social Security number of ', 'Soc Sec ', 'Patient SSN ', 'Phone ', 'Phone: ', 'Phone for ', 'Tel: ', 'Tel', 'Fax ', 'Call ', 'TTY ', 'Contact ', 'Cell ', 'Medicare '];
const T2_JOINS = ['', ' ', ': ', ', ', ' - ', '\n', ' is ', '. '];
const T2_TAILS = ['', '.', ' on file.', 'Paid', ' 150.00', '-01/02/2020', '\n'];
const T2_PRE = ['', 'Re: ', 'Paid $0,000.00. '];
const SSN_SHAPES = ['ddd-dd-dddd', 'ddd dd dddd', 'ddd.dd dddd', 'ddddd-dddd', 'ddddddddd', '0ddddddddd', '1ddddddddd', 'ddd,dd dddd', 'ddd dd dd.dd', 'ddd dd dddd.00', 'dddd ddddd', 'ddd.dd.dddd', 'ddd 1ddd dd'];
const PHONE_SHAPES = ['(ddd) ddd-dddd', 'ddd-ddd-dddd', 'ddd.ddd.dddd', 'dddddddddd', '1-ddd-ddd-dddd', '+1 ddd ddd dddd', 'ddd ddd dd.dd', 'ddddd ddddd', 'ddd.dd dddd'];
const LOCAL_SHAPES = ['ddd-dddd', 'ddd dddd', 'ddddddd', 'ddd.dddd'];
const fillShape = (shape: string, digits: string) => { let i = 0; return shape.replace(/d/g, () => digits[i++] ?? '0'); };

function ownBetween(name: string): Piece[][] {
  const parts = name.split(' ');
  const first = parts[0]!, last = parts.at(-1)!, mi = parts.length > 2 ? parts[1]! : undefined;
  const F = title(first), L = title(last);
  const own: Piece[][] = [
    ['Ms', [L, 'name']], ['Dear', [F, 'name']], ['Dr', [F, 'name']], [[L, 'name'], [F, 'name']], [[F, 'name'], [L, 'name']], [[first, 'name'], [L, 'name']], [[last, 'name'], [F, 'name']],
    [[L, 'name'], 'Paid'], ['PAID', [F, 'name']], [[L, 'name']], [[F, 'name']], [[F, 'name'], ' ', [L, 'name']], [[L, 'name'], ', ', [F, 'name']], [[last, 'name']],
    ['DOB', ['03/14/1980', 'dob']], [['03/14/1980', 'dob']], [['ZZ7654321', 'member']], [['SYNCLAIM0001', 'claim']], [],
  ];
  if (mi !== undefined) own.push([[F, 'name'], [mi, 'initial']], [[mi, 'initial'], [L, 'name']]);
  return own;
}

export function t2(perPatient = 16_000): Rec[] {
  const out: Rec[] = [];
  const pick = <T,>(r: () => number, a: readonly T[]) => a[Math.floor(r() * a.length)] as T;
  for (const [k, name] of ['JANE Q ZEPHYRA', 'TY Q ZEPHYRA', 'SN VANTREE', 'AL ZEPHYRA', 'JANE MA'].entries()) {
    const who = patientOf([name], 'synthetic-patient-t2');
    const r = prng(2000 + k);
    const owns = ownBetween(name);
    for (let i = 0; i < perPatient; i += 1) {
      const label = pick(r, T2_LABELS);
      const own = pick(r, owns);
      const kind = r() < 0.5 ? 'ssn' : 'phone';
      let num: string;
      if (kind === 'ssn') num = fillShape(pick(r, SSN_SHAPES), `900${String(Math.floor(r() * 1e6)).padStart(6, '0')}`);
      else if (r() < 0.3) num = fillShape(pick(r, LOCAL_SHAPES), `55501${String(Math.floor(r() * 100)).padStart(2, '0')}`);
      else num = fillShape(pick(r, PHONE_SHAPES), `${pick(r, ['202', '312', '415', '555'])}55501${String(Math.floor(r() * 100)).padStart(2, '0')}`);
      const join = own.length === 0 ? pick(r, ['', ' ']) : pick(r, T2_JOINS);
      out.push(build('T2/label-own-number', who, [pick(r, T2_PRE), label, ...own, join, [num, kind], pick(r, T2_TAILS)]));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// T3: codes, modifiers and units right after the patient's name, and the same tokens alone in a clean letter.
const MA_CODES = Array.from({ length: 130 }, (_, i) => `MA${String(i + 1).padStart(2, '0')}`);
const T3_TOKENS: [string, string][] = [
  ...['97110', '97140', '97530', '97112', '97161'].map((t): [string, string] => [t, 'code']),
  ...['G0283', 'J3301', 'Q4100', 'K0001', 'L3908', 'E0745', 'A4556', 'S9131', 'V2020'].map((t): [string, string] => [t, 'code']),
  ...['M54.50', 'Z96.651', 'S83.511A', 'M25.561', 'G89.29', 'M79.604', 'Q66.89'].map((t): [string, string] => [t, 'code']),
  ...['CO45', 'CO-45', 'PR1', 'PR-2', 'OA23', 'PI-97', 'CO-97', 'CO-16', 'N130', 'M80', 'N362', 'M15'].map((t): [string, string] => [t, 'code']),
  ...MA_CODES.map((t): [string, string] => [t, 'code']),
  ...['97110GP', '97110KX', '97110XU', '97110-59', '97110 XU', '97140 59', '97530-XU', '97140XS', '97112GO', '97110CQ'].map((t): [string, string] => [t, 'code']),
  ...['45min', '30MIN', '15 min', '60 minutes', '2 units', '1 unit', '4u', '2hrs', '8 mins'].map((t): [string, string] => [t, 'unit']),
  ...['150.00', '$1,234.56', '$45'].map((t): [string, string] => [t, 'amount']),
  ...['01/02/2026', 'Jan 2, 2026', '2026-01-02'].map((t): [string, string] => [t, 'date']),
  ...['PA123456', 'Ref:AB12', 'Line1', 'Box123', 'Edit1', 'ALJ2', 'Level2', 'Inv12', 'REF-SYN-77'].map((t): [string, string] => [t, 'ref']),
  ...['1234567893', '12-3456789', '20201', '20201-1234', '12345678901234'].map((t): [string, string] => [t, 'id']),
];
const T3_NAMES = ['GEORGE ZEPHYRA', 'MARIA M VANTREE', 'JANE Q ZEPHYRA', 'QIANG MA', 'MIN XU', 'ANN LIN', 'KAY ZEPHYRA', 'AL ZEPHYRA', 'ED VANTREE', 'TH VANTREE', 'CO VANTREE', 'GP ZEPHYRA', 'SN VANTREE', 'MAY ZEPHYRA', 'NA LI'];
const T3_SEPS = [' ', '\n', ', ', ': ', '\t', ''];

export function t3(): Rec[] {
  const out: Rec[] = [];
  for (const name of T3_NAMES) {
    const who = patientOf([name], 'synthetic-patient-t3');
    const parts = name.split(' ');
    const first = parts[0]!, last = parts.at(-1)!, mi = parts.length > 2 ? parts[1]! : undefined;
    const written: Piece[][] = [
      [[first, 'name'], ...(mi ? [' ', [mi, 'initial'] as Piece] : []), ' ', [last, 'name']],
      [[last, 'name'], ', ', [first, 'name'], ...(mi ? [' ', [mi, 'initial'] as Piece] : [])],
      [[title(first), 'name'], ' ', [title(last), 'name']],
    ];
    let k = 0;
    for (const [tok, cls] of T3_TOKENS) {
      out.push(build('T3/clean', who, ['Remark: ', [tok, undefined, cls], ' applies.']));
      out.push(build('T3/clean', who, ['Paid 150.00. ', [tok, undefined, cls], ' 1 150.00']));
      for (const form of written) {
        for (const sep of T3_SEPS) {
          k += 1;
          if (sep === '' && k % 2 === 0) continue;
          const lead = ['Patient: ', 'Patient ', 'Re: ', ''][k % 4]!;
          const tail = [' 1 150.00', ' denied.', '', ' on file'][k % 4]!;
          out.push(build('T3/after-name', who, [lead, ...form, sep, [tok, undefined, cls], tail]));
        }
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// T4: the MOD-16 seed shapes: a range glued to the next word between amounts, with the forms and words varied.
export function t4(): Rec[] {
  const out: Rec[] = [];
  const r = prng(16);
  const who = { P: { pseudonym: 'synthetic-patient-16', names: ['JANE Q ZEPHYRA'], datesOfBirth: ['1980-03-14'], memberIds: ['SYNMEMBER0042'] }, C: [{ claimId: 'synthetic-claim-1', patientPseudonym: 'synthetic-patient-16', claimNumbers: ['SYNCLAIM0001'] }] };
  const dg = (n: number) => Array.from({ length: n }, () => String(Math.floor(r() * 10))).join('');
  const amt = () => [`$${dg(1)},${dg(3)}.${dg(2)}`, `${1 + Math.floor(r() * 9)}${dg(2)}.${dg(2)}`, `$${dg(2)}`, `$0,000.00`, `0.00`][Math.floor(r() * 5)]!;
  const date = () => [`01/0${1 + Math.floor(r() * 9)}/2020`, `2020-01-0${1 + Math.floor(r() * 9)}`, `1/${1 + Math.floor(r() * 9)}/20`, `Jan ${1 + Math.floor(r() * 9)}, 2020`, `${1 + Math.floor(r() * 9)} March 2020`][Math.floor(r() * 5)]!;
  const WORDS = ['Paid', 'St. Mary', 'TH', 'Seen', 'nd floor', 'Rd. 9', 'Billed', 'Total', 'PAID', 'th', 'St', 'Deductible', 'Annual'];
  const DASH = ['-', '–', '−', '--', '—'];
  for (let i = 0; i < 6000; i += 1) {
    const a = r() < 0.6 ? date() : amt();
    const b = r() < 0.6 ? date() : amt();
    const lead = ['Paid $0,000.00. Service ', 'Service ', 'Seen ', 'DOS ', 'Billed ', ''][Math.floor(r() * 6)]!;
    const t = `${lead}${a}${DASH[Math.floor(r() * DASH.length)]}${b}${WORDS[Math.floor(r() * WORDS.length)]}${[' ', '', '. '][Math.floor(r() * 3)]}${amt()}${['', '.', ' paid.'][Math.floor(r() * 3)]}`;
    out.push({ s: 'T4/mod16-shape', P: who.P, C: who.C, t, sec: [] });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// T5: the property tests' generators (snapshots of 3fcb9359 and cc3dd7f6), sampled on fixed seeds, the pinned seeds among them.
export async function t5(): Promise<Rec[]> {
  const out: Rec[] = [];
  const G = new URL('./snap/', import.meta.url);
  const head = await import(new URL('prop-3fcb9359.mts', G).href);
  const base = await import(new URL('prop-cc3dd7f6.mts', G).href);
  // MOD-13 and MOD-15 letters cost 10-25 ms each (a new patient per letter), so they are drawn sparingly.
  const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const PINNED = [1162287068, 460548619]; // YEAR_BELOW_1900_SEED, LABEL_BOUNDARY_SEED (400 runs each, as the tests run them)
  const mod13 = (src: string, arb: fc.Arbitrary<any>, seeds: number[], runs: number) => {
    for (const seed of seeds) for (const c of fc.sample(arb, { seed, numRuns: runs })) {
      let text = '';
      const sec: Sec[] = [];
      for (const seg of c.segments) {
        if (seg.secret !== 'none') sec.push([seg.secret === 'birth' ? 'dob' : seg.secret, text.length, seg.text.length]);
        text += seg.text;
      }
      out.push({ s: src, P: c.patient, C: c.claims, t: text, sec });
    }
  };
  mod13('T5/MOD-13 letterCase@3fcb9359', head.letterCase, PINNED, 400);
  mod13('T5/MOD-13 letterCase@3fcb9359', head.letterCase, [1, 2, 3], 500);
  mod13('T5/MOD-13 gluedLetterCase@3fcb9359', head.gluedLetterCase, PINNED, 400);
  mod13('T5/MOD-13 gluedLetterCase@3fcb9359', head.gluedLetterCase, [1, 2, 3], 500);
  mod13('T5/MOD-13 letterCase@cc3dd7f6', base.letterCase, PINNED, 400);
  mod13('T5/MOD-13 letterCase@cc3dd7f6', base.letterCase, [11], 500);
  const mod15 = (src: string, arb: fc.Arbitrary<any>, seeds: number[], runs: number) => {
    for (const seed of seeds) for (const c of fc.sample(arb, { seed, numRuns: runs })) {
      let text = '';
      const sec: Sec[] = [];
      for (const seg of c.segments) {
        if (seg.secret !== 'none') {
          const digits = seg.text.replace(/\D/gu, '');
          const kind = seg.secret === 'pattern' ? (/55501\d\d$/.test(digits) ? 'phone' : 'ssn') : seg.secret;
          sec.push([kind, text.length, seg.text.length]);
        }
        text += seg.text;
      }
      out.push({ s: src, P: c.patient, C: c.claims, t: text, sec });
    }
  };
  mod15('T5/MOD-15 ssnPhoneCase@3fcb9359', head.ssnPhoneCase, [1, 2, 3], 600);
  mod15('T5/MOD-15 ssnPhoneCase@cc3dd7f6', base.ssnPhoneCase, [21], 600);
  const mod16 = (src: string, mod: any, seeds: number[], runs: number) => {
    const who = { P: { pseudonym: 'synthetic-patient-16', names: ['JANE Q ZEPHYRA'], datesOfBirth: ['1980-03-14'], memberIds: ['SYNMEMBER0042'] }, C: [{ claimId: 'synthetic-claim-1', patientPseudonym: 'synthetic-patient-16', claimNumbers: ['SYNCLAIM0001'] }] };
    const arb = fc.array(fc.tuple(mod.keptSegment, fc.constantFrom(...mod.KEPT_JOINS)), { minLength: 1, maxLength: 8 });
    for (const seed of seeds) for (const pieces of fc.sample(arb, { seed, numRuns: runs }) as [{ text: string }, string][][]) {
      const glues = (i: number) => !/\p{L}$/u.test(pieces[i]?.[0].text ?? '') && /^\p{L}/u.test(pieces[i + 1]?.[0].text ?? '');
      const text = pieces.map(([segment, join], i) => `${segment.text}${i === pieces.length - 1 ? '' : join === '' && !glues(i) ? ' ' : join}`).join('');
      out.push({ s: src, P: who.P, C: who.C, t: text, sec: [] });
    }
  };
  // The three MOD-16 seeds CI failed on (cc3dd7f6's generator), 300 runs each as the test runs them, on both generators.
  mod16('T5/MOD-16 seeds@cc3dd7f6', base, [1034253323, 383403599, -1074798020], 300);
  mod16('T5/MOD-16 seeds@3fcb9359', head, [1034253323, 383403599, -1074798020], 300);
  mod16('T5/MOD-16 keptSegment@3fcb9359', head, SEEDS, 1000);
  mod16('T5/MOD-16 keptSegment@cc3dd7f6', base, [31, 32, 33, 34, 35], 1000);
  return out;
}

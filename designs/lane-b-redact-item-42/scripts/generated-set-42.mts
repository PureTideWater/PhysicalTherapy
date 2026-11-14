// generated-set-42.mts <out corpus dir> [seed=42]: Queues item 42's generated set, in the gate's corpus layout (as
// generated-set-40.mts), so the gate's worker and generated-run-40.mts read it unchanged. Every record is synthetic.
// Every row is 'observe' (counted, never judged): the note counts what the base sends and what each candidate closes.
//   m1.<kind>.<class>.<count>   mechanism 1 by representatives: an inserted character of the class inside the kind's
//                               value; count n1 (at three positions), n2a (two together), n2s (two apart), n3 (three).
//   m1s.<kind>.<class>          mechanism 1 swept: every character of the class (letters sampled), one in the middle.
//   m2.<side>.<class>.<shape>   mechanism 2: a name word glued to the character before or after it, by that
//                               character's class and the word's case.
//   real.<body>.<patient>       real-shaped letters (bodies42.mts), the patient's identifiers written plainly:
//                               patients with a short or common surname, and with a number the letter's own digits spell.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { BODIES, GIVEN, SURNAMES } from './bodies42.mts';

const out = process.argv[2]!;
let state = Number(process.argv[3] ?? 42) >>> 0;
const rand = () => { state = (state + 0x6d2b79f5) >>> 0; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const seen = new Set<string>();
const digits = (n: number): string => { for (;;) { let s = String(1 + Math.floor(rand() * 9)); while (s.length < n) s += String(Math.floor(rand() * 10)); if (!seen.has(s)) { seen.add(s); return s; } } };
const rd = (n: number): string => Array.from({ length: n }, () => String(Math.floor(rand() * 10))).join('');
type Part = string | [kind: string, text: string];
interface Rec { i: number; s: string; p: number; t: string; sec: [string, number, number][]; exp: string }
const patients: { P: unknown; C: unknown }[] = [];
const patientIndex = new Map<string, number>();
const recs: Rec[] = [];
const nfkc = (s: string) => s.normalize('NFKC');
function patient(names: string[], memberIds: string[], claimNumbers: string[], dob = '1980-03-14'): number {
  const key = JSON.stringify([names, memberIds, claimNumbers, dob]);
  let at = patientIndex.get(key);
  if (at === undefined) {
    at = patients.length;
    patientIndex.set(key, at);
    patients.push({ P: { pseudonym: `synthetic-patient-g42-${at}`, names, datesOfBirth: [dob], memberIds }, C: claimNumbers.map((number, k) => ({ claimId: `synthetic-claim-g42-${at}-${k + 1}`, patientPseudonym: `synthetic-patient-g42-${at}`, claimNumbers: [number] })) });
  }
  return at;
}
let skipped = 0;
function add(form: string, p: number, parts: Part[]): void {
  let t = '';
  const sec: [string, number, number][] = [];
  for (const part of parts) {
    if (typeof part === 'string') { t += part; continue; }
    const at = nfkc(t).length;
    t += part[1];
    sec.push([part[0], at, nfkc(part[1]).length]);
    if (nfkc(t).length !== at + nfkc(part[1]).length) { skipped += 1; return; }
  }
  if (/[[\]]/u.test(t)) { skipped += 1; return; }
  recs.push({ i: recs.length, s: `G42/${form}`, p, t, sec, exp: 'observe' });
}

// ---- The characters, by class. Kept: NFKC leaves it as it is, it is no bracket, no white space, not default-ignorable,
// not one of the checks' marks, and (for the classes below) on neither joiner list.
const JOINER = /[\s\p{Pd}−⁃˗➖_|\\­'‘’ʼʹˊ′‵`´~·‧∙⋅・•;"“”￼\p{Nl}\p{No}]/u;
const classOf = (ch: string): string => {
  if (/^[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}]$/u.test(ch) && ch.codePointAt(0)! > 0xff) return 'emoji';
  if (/^\p{L}$/u.test(ch)) return 'letter';
  if (/^\p{M}$/u.test(ch)) return 'mark';
  if (/^\p{Sc}$/u.test(ch)) return 'currency';
  if (/^\p{S}$/u.test(ch)) return 'symbol';
  if (/^\p{P}$/u.test(ch)) return 'punctuation';
  return 'other';
};
const CLASSES = ['letter', 'punctuation', 'symbol', 'currency', 'mark', 'emoji'] as const;
const SWEEP: Record<string, string[]> = Object.fromEntries(CLASSES.map((c) => [c, []]));
let letters = 0;
for (let cp = 0x21; cp <= 0x10ffff; cp += 1) {
  if (cp >= 0xd800 && cp <= 0xdfff) continue;
  const ch = String.fromCodePoint(cp);
  if (nfkc(ch) !== ch || /[[\]\p{Default_Ignorable_Code_Point}\p{N}\p{C}\p{Z}]/u.test(ch) || JOINER.test(ch)) continue;
  const cls = classOf(ch);
  if (cls === 'other') continue;
  // Letters: every one under U+0530 (Latin, Greek, Cyrillic), then every 41st.
  if (cls === 'letter' && cp >= 0x530 && (letters += 1) % 41 !== 0) continue;
  SWEEP[cls]!.push(ch);
}
const REP: Record<string, string[]> = {
  letter: ['X', 'x', 'O', 'l', 'Ж', '中'],
  punctuation: [',', '.', '/', ':', '#', '(', '!', '*', '«', '‿'],
  symbol: ['+', '=', '^', '°', '■', '→'],
  currency: ['$', '€', '£', '¥', '¢'],
  mark: ['́', '̈', '⃝', 'ः'],
  emoji: ['\u{1F600}', '✅', '❤', '\u{1F44D}'],
  // Controls for the reading: what the base reads through today (a joiner, U+FFFC, a number character), and a digit.
  joiner: ['-', '￼', 'ↀ'],
  digit: ['7'],
};

// ---- Mechanism 1. Each kind: a patient, the value as a letter writes it, and a labeled sentence.
const NAME = 'JANE Q ZEPHYRA';
interface KindOf { kind: string; sec: string; make: (draw: number) => { p: number; written: string }; label: string; digitsOnly: boolean }
const KINDS: KindOf[] = [
  { kind: 'member-digits', sec: 'member', digitsOnly: true, label: 'Member ID ', make: (d) => { const v = digits(8 + (d % 3)); return { p: patient([NAME], [v], ['SYNCLAIM0001']), written: v }; } },
  { kind: 'member-mixed', sec: 'member', digitsOnly: false, label: 'Member ID ', make: () => { const v = `ZZ${digits(7)}`; return { p: patient([NAME], [v], ['SYNCLAIM0001']), written: v }; } },
  { kind: 'claim-digits', sec: 'claim', digitsOnly: true, label: 'Claim number ', make: (d) => { const v = digits(10 + (d % 3)); return { p: patient([NAME], ['SYNMEMBER0042'], [v]), written: v }; } },
  { kind: 'claim-mixed', sec: 'claim', digitsOnly: false, label: 'Claim number ', make: () => { const v = `C${digits(10)}`; return { p: patient([NAME], ['SYNMEMBER0042'], [v]), written: v }; } },
  { kind: 'name-surname', sec: 'name', digitsOnly: false, label: 'Patient: Ms. ', make: (d) => ({ p: patient([NAME], ['SYNMEMBER0042'], ['SYNCLAIM0001']), written: d % 2 === 0 ? 'Zephyra' : 'ZEPHYRA' }) },
  { kind: 'name-given', sec: 'name', digitsOnly: false, label: 'Dear ', make: (d) => ({ p: patient([NAME], ['SYNMEMBER0042'], ['SYNCLAIM0001']), written: d % 2 === 0 ? 'Jane' : 'JANE' }) },
  { kind: 'dob-numeric', sec: 'dob', digitsOnly: true, label: 'Date of birth: ', make: (d) => ({ p: patient([NAME], ['SYNMEMBER0042'], ['SYNCLAIM0001']), written: d % 2 === 0 ? '03/14/1980' : '1980-03-14' }) },
  { kind: 'dob-words', sec: 'dob', digitsOnly: false, label: 'Born ', make: (d) => ({ p: patient([NAME], ['SYNMEMBER0042'], ['SYNCLAIM0001']), written: d % 2 === 0 ? 'March 14, 1980' : '14 March 1980' }) },
  { kind: 'ssn', sec: 'ssn', digitsOnly: true, label: 'SSN ', make: (d) => ({ p: patient([NAME], ['SYNMEMBER0042'], ['SYNCLAIM0001']), written: `9${rd(2)}-${1 + Math.floor(rand() * 9)}${rd(1)}-${1 + Math.floor(rand() * 9)}${rd(3)}` }) },
  { kind: 'phone', sec: 'phone', digitsOnly: true, label: 'Phone ', make: (d) => ({ p: patient([NAME], ['SYNMEMBER0042'], ['SYNCLAIM0001']), written: d % 2 === 0 ? `(900) 555-01${rd(2)}` : `900-555-01${rd(2)}` }) },
];
/** `written` with `ins` put after its k-th letter or digit (1-based), never after the last. */
function insertAfter(written: string, k: number, ins: string): string {
  let n = 0;
  const cps = [...written];
  for (let i = 0; i < cps.length; i += 1) if (/[\p{L}\p{N}]/u.test(cps[i]!) && (n += 1) === k) return cps.slice(0, i + 1).join('') + ins + cps.slice(i + 1).join('');
  throw new Error('no place');
}
const count = (written: string) => [...written].filter((ch) => /[\p{L}\p{N}]/u.test(ch)).length;
const sentence = (k: KindOf, labeled: boolean, value: string): Part[] => (labeled ? [k.label, [k.sec, value], ' was on file.'] : ['Ref ', [k.sec, value], ' on file.']);
for (const k of KINDS) for (const [cls, reps] of Object.entries(REP)) {
  if (cls === 'digit' && k.digitsOnly) continue;
  reps.forEach((ch, r) => {
    for (let draw = 0; draw < 2; draw += 1) {
      const { p, written } = k.make(draw + r);
      const n = count(written), mid = Math.floor(n / 2);
      const other = reps[(r + 1) % reps.length]!;
      for (const labeled of [false, true]) {
        for (const at of [1, mid, n - 1]) add(`m1.${k.kind}.${cls}.n1`, p, sentence(k, labeled, insertAfter(written, at, ch)));
        add(`m1.${k.kind}.${cls}.n2a`, p, sentence(k, labeled, insertAfter(written, mid, ch + other)));
        add(`m1.${k.kind}.${cls}.n2s`, p, sentence(k, labeled, insertAfter(insertAfter(written, n - 1, other), 1, ch)));
        add(`m1.${k.kind}.${cls}.n3`, p, sentence(k, labeled, insertAfter(written, mid, ch + other + ch)));
      }
    }
  });
}
// The sweep: member ID of digits, the surname, a Social Security number and a phone number; one character in the middle.
for (const k of KINDS.filter((x) => ['member-digits', 'name-surname', 'ssn', 'phone'].includes(x.kind))) for (const cls of CLASSES) {
  const set = k.kind === 'ssn' || k.kind === 'phone' ? SWEEP[cls]!.filter((_, n) => n % 7 === 0) : SWEEP[cls]!;
  set.forEach((ch, r) => {
    const { p, written } = k.make(r);
    add(`m1s.${k.kind}.${cls}`, p, sentence(k, r % 2 === 1, insertAfter(written, Math.floor(count(written) / 2), ch)));
  });
}

// ---- Mechanism 2. The name word glued to what stands before or after it.
const PEOPLE: [string, string, string][] = [['JANE Q ZEPHYRA', 'Jane', 'Zephyra'], ['ROSA VANTREE', 'Rosa', 'Vantree'], ['ANN LEE', 'Ann', 'Lee'], ['QIANG MA', 'Qiang', 'Ma'], ['OTTO QUILLFEATHER', 'Otto', 'Quillfeather']];
const shapes = (w: string): [string, string][] => [['UPPER', w.toUpperCase()], ['Capital', w], ['lower', w.toLowerCase()]];
const WORDS_BEFORE = ['Paid in full', 'Dear Ms', 'Dear Mr', 'Dear', 'Patient', 'Attn', 'for', 'to', 'Re', 'member', 'claimant', 'denied', 'the', 'a', 'Dr', 'Mrs'];
const WORDS_AFTER = ['paid', 'was seen', 'is covered', 'denied', 's claim', 'and', 'has'];
for (const [full, given, surname] of PEOPLE) {
  const p = patient([full], ['SYNMEMBER0042'], ['SYNCLAIM0001']);
  for (const [which, word] of [['surname', surname], ['given', given]] as const) for (const [shape, w] of shapes(word)) {
    const N: Part = ['name', w];
    for (const before of WORDS_BEFORE) {
      add(`m2.before.lower.${shape}`, p, [before, N, '.']);
      add(`m2.before.upper.${shape}`, p, [before.toUpperCase(), N, '.']);
      add(`m2.both.lower.${shape}`, p, [before, N, 'paid.']);
    }
    for (const after of WORDS_AFTER) {
      add(`m2.after.lower.${shape}`, p, ['Notice: ', N, `${after}.`]);
      add(`m2.after.Capital.${shape}`, p, ['Notice: ', N, `${after[0]!.toUpperCase()}${after.slice(1)}.`]);
      add(`m2.after.upper.${shape}`, p, ['Notice: ', N, `${after.toUpperCase()}.`]);
    }
    add(`m2.before.digit.${shape}`, p, ['Paid 100', N, '.']);
    add(`m2.after.digit.${shape}`, p, ['Notice: ', N, '100 paid.']);
    add(`m2.before.nocase-letter.${shape}`, p, ['支払', N, '.']);
    for (const cls of CLASSES) if (cls !== 'letter') for (const ch of REP[cls]!) {
      add(`m2.before.${cls}.${shape}`, p, [`Paid in full${ch}`, N, '.']);
      add(`m2.after.${cls}.${shape}`, p, ['Notice: ', N, `${ch}paid.`]);
    }
    if (which === 'surname') {
      // The whole name, its first word glued: "fullJane Zephyra", "DearJANE ZEPHYRA".
      add(`m2.before.lower.whole-name.${shape}`, p, ['Paid in full', ['name', `${shape === 'UPPER' ? given.toUpperCase() : given} ${w}`], '.']);
      add(`m2.given-surname-glued.${shape}`, p, ['Patient ', ['name', `${shape === 'UPPER' ? given.toUpperCase() : given}${w}`], ' was seen.']);
    }
  }
}
// The sweep: every character of each class right before the surname, with a word before it.
for (const cls of CLASSES) SWEEP[cls]!.forEach((ch, r) => {
  const p = patient([NAME], ['SYNMEMBER0042'], ['SYNCLAIM0001']);
  add(`m2s.before.${cls}`, p, [`Paid in full${ch}`, ['name', r % 2 === 0 ? 'ZEPHYRA' : 'Zephyra'], '.']);
});

// ---- Real-shaped letters. The patient's own identifiers are written plainly; what a rule finds elsewhere is its cost.
const cap = (w: string) => w[0] + w.slice(1).toLowerCase();
const fill = (body: string, given: string, surname: string, member: string, claim: string, upper: boolean): Part[] => {
  const parts: Part[] = [];
  const G = upper ? given.toUpperCase() : cap(given), S = upper ? surname.toUpperCase() : cap(surname);
  for (const piece of body.split(/(\{[A-Z]+\})/u)) {
    if (piece === '{NAME}') parts.push(['name', `${G} ${S}`]);
    else if (piece === '{GIVEN}') parts.push(['name', G]);
    else if (piece === '{SURNAME}') parts.push(['name', S]);
    else if (piece === '{MEMBER}') parts.push(['member', member]);
    else if (piece === '{CLAIM}') parts.push(['claim', claim]);
    else if (piece === '{DOB}') parts.push(['dob', '03/14/1980']);
    else if (piece !== '') parts.push(piece);
  }
  return parts;
};
SURNAMES.forEach((surname, n) => {
  const given = GIVEN[n % GIVEN.length]!, member = `ZZ${digits(7)}`, claim = `C${digits(10)}`;
  const p = patient([`${given} ${surname}`], [member], [claim]);
  for (const [name, body] of BODIES) add(`real.${name}.surname-${surname}`, p, fill(body, given, surname, member, claim, name === 'all-caps'));
});
// Numbers the letters' own digits spell with one or two characters between them (a code beside an amount, an amount's
// own punctuation, a code and its units), and drawn numbers of each length, which nothing in the letter spells.
const SPELLED: [string, string][] = [['97110125', 'code-amount'], ['971104', 'code-units'], ['9711231', 'code-x-units'], ['15390', 'amount-5'], ['54000', 'amount-5b'], ['114000', 'amount-6'], ['09142026', 'date-8'], ['1324', 'visits-4'], ['2337', 'minutes-4'], ['81000', 'time-5'], ['21236', 'amount-5c'], ['18000', 'days-5'], ['9711097140', 'two-codes-10'], ['30555', 'po-box-5'], ['235010555', 'zip-9'], ['8005550199', 'payer-phone-10']];
for (const [value, why] of SPELLED) for (const kind of ['member', 'claim'] as const) {
  const p = kind === 'member' ? patient([NAME], [value], ['SYNCLAIM0001']) : patient([NAME], ['SYNMEMBER0042'], [value]);
  for (const [name, body] of BODIES) add(`real.${name}.spelled-${why}.${kind}`, p, fill(body.replace(kind === 'member' ? '{MEMBER}' : '{CLAIM}', 'on file'), 'Jane', 'Zephyra', 'SYNMEMBER0042', 'SYNCLAIM0001', name === 'all-caps'));
}
for (const n of [4, 5, 6, 7, 8, 9, 10, 11]) for (let draw = 0; draw < 40; draw += 1) {
  const v = digits(n), p = patient([NAME], [v], [`C${digits(10)}`]);
  const [name, body] = BODIES[draw % BODIES.length]!;
  add(`real.${name}.drawn-${n}`, p, fill(body, 'Jane', 'Zephyra', v, (patients[p]!.C as { claimNumbers: string[] }[])[0]!.claimNumbers[0]!, name === 'all-caps'));
}

fs.mkdirSync(out, { recursive: true });
const SHARDS = 4;
const hash = crypto.createHash('sha256');
fs.writeFileSync(path.join(out, 'patients.json'), JSON.stringify(patients));
hash.update(JSON.stringify(patients));
for (let k = 0; k < SHARDS; k += 1) {
  const body = recs.filter((rec) => rec.i % SHARDS === k).map((rec) => JSON.stringify(rec)).join('\n') + '\n';
  hash.update(body);
  fs.writeFileSync(path.join(out, `shard-${k}.jsonl.gz`), zlib.gzipSync(body));
}
const families: Record<string, number> = {};
for (const rec of recs) { const f = rec.s.split('.').slice(0, rec.s.startsWith('G42/real') ? 1 : 2).join('.'); families[f] = (families[f] ?? 0) + 1; }
const swept = Object.fromEntries(CLASSES.map((c) => [c, SWEEP[c]!.length]));
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify({ built: 'designs/lane-b-redact-item-42/scripts/generated-set-42.mts', seed: Number(process.argv[3] ?? 42), letters: recs.length, patients: patients.length, shards: SHARDS, sha256: hash.digest('hex'), swept, skipped, families }, null, 1));
console.log(`letters ${recs.length} patients ${patients.length} forms ${new Set(recs.map((r) => r.s)).size} skipped ${skipped} swept ${JSON.stringify(swept)} families ${JSON.stringify(families)}`);

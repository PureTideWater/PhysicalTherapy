// generated-set-40.mts <out corpus dir> [seed=40]: Queues item 40's generated set (stage 1, W71), in the gate's corpus
// layout, so the gate's own worker.mts reads it unchanged (generated-run-40.mts). Every record is synthetic (invented
// names, drawn digits, SYN and ZZ numbers, 900-area and 555-01 twins). Fields and `exp` as item 34's generated-set.mts:
//   'refused' the rule refuses; 'hidden' the value is replaced (or the letter refused); 'left' a recorded residual;
//   'observe' counted, never judged: the base's controls, the probes of section 4, and every REAL-SHAPED row (real.*).
// Families: r13.* (R1-3, and ruling 3 of 2026-11-13: r13.nfkc.*), r14.* (R1-4), A.* (ruling (A)), probe.* (an unseen
// character inside a name, a date of birth, a Social Security and a phone number), real.* (U+0085 line endings, U+0091 to
// U+0097 as quotes and dashes, a NUL from a bad extraction, a footnote's superscript and a list number beside a number).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';

const out = process.argv[2]!;
let state = Number(process.argv[3] ?? 40) >>> 0;
const rand = () => { state = (state + 0x6d2b79f5) >>> 0; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const seen = new Set<string>();
const digits = (n: number): string => { for (;;) { let s = String(1 + Math.floor(rand() * 9)); while (s.length < n) s += String(Math.floor(rand() * 10)); if (!seen.has(s)) { seen.add(s); return s; } } };
type Part = string | [kind: string, text: string];
interface Rec { i: number; s: string; p: number; t: string; sec: [string, number, number][]; exp: string }
const patients: { P: unknown; C: unknown }[] = [];
const patientIndex = new Map<string, number>();
const recs: Rec[] = [];
const nfkc = (s: string) => s.normalize('NFKC');
function patient(names: string[], memberIds: string[], claimNumbers: string[]): number {
  const key = JSON.stringify([names, memberIds, claimNumbers]);
  let at = patientIndex.get(key);
  if (at === undefined) {
    at = patients.length;
    patientIndex.set(key, at);
    patients.push({ P: { pseudonym: `synthetic-patient-g40-${at}`, names, datesOfBirth: ['1980-03-14'], memberIds }, C: claimNumbers.map((number, k) => ({ claimId: `synthetic-claim-g40-${at}-${k + 1}`, patientPseudonym: `synthetic-patient-g40-${at}`, claimNumbers: [number] })) });
  }
  return at;
}
function add(form: string, exp: string, p: number, parts: Part[]): void {
  let t = '';
  const sec: [string, number, number][] = [];
  for (const part of parts) {
    if (typeof part === 'string') { t += part; continue; }
    const at = nfkc(t).length;
    t += part[1];
    sec.push([part[0], at, nfkc(part[1]).length]);
    if (nfkc(t).length !== at + nfkc(part[1]).length) throw new Error(`NFKC joins over a part in ${form}`);
  }
  if (/[[\]]/u.test(t)) throw new Error(`a bracket in ${form}`);
  recs.push({ i: recs.length, s: `G40/${form}`, p, t, sec, exp });
}
const KINDS = ['member', 'claim'] as const;
const holder = (value: string, kind: string, name = 'JANE Q ZEPHYRA') => (kind === 'member' ? patient([name], [value], ['SYNCLAIM0001']) : patient([name], ['SYNMEMBER0042'], ['SYNCLAIM0001', value]));
const each = <T,>(xs: readonly T[], k: number): T => xs[k % xs.length]!;

// ---- The characters. NUMERIC: every Nl and No; UNSEEN: every control and format character that is not
// default-ignorable, not white space and not one of the checks' marks, three private-use and four unassigned code
// points (checked unassigned in this runtime), and the two lone surrogates.
const NUMERIC: string[] = [], UNSEEN: string[] = [];
for (let cp = 0; cp <= 0x10ffff; cp += 1) {
  if (cp >= 0xd800 && cp <= 0xdfff) continue;
  const ch = String.fromCodePoint(cp);
  if (/[\p{Nl}\p{No}]/u.test(ch)) NUMERIC.push(ch);
  else if (/[\p{Cc}\p{Cf}]/u.test(ch) && !/[\p{Default_Ignorable_Code_Point}\s]/u.test(ch) && !(cp >= 1 && cp <= 3)) UNSEEN.push(ch);
}
const CLASSED = UNSEEN.length;
for (const cp of [0xe000, 0xf8ff, 0x100000]) UNSEEN.push(String.fromCodePoint(cp));
for (const cp of [0x0378, 0x0530, 0x2fe0, 0x1fffe]) { const ch = String.fromCodePoint(cp); if (!/\p{Cn}/u.test(ch) || /\p{Default_Ignorable_Code_Point}/u.test(ch)) throw new Error(`U+${cp.toString(16)} is assigned here`); UNSEEN.push(ch); }
const SURROGATES = ['\uD800', '\uDC00'];
const STABLE = NUMERIC.filter((ch) => nfkc(ch) === ch), REWRITTEN = NUMERIC.filter((ch) => nfkc(ch) !== ch);

// ---- R1-3: a number character that is no decimal digit right beside a digits-only number. Ruling 3: refused whether
// or not NFKC rewrites it.
for (const [family, set] of [['stable', STABLE], ['nfkc', REWRITTEN]] as const) set.forEach((ch, k) => {
  const kind = each(KINDS, k), value = digits(5 + (k % 4));
  const p = holder(value, kind);
  add(`r13.${family}.bare.before`, 'refused', p, [`Ref ${ch}`, [kind, value], ' on file.']);
  add(`r13.${family}.bare.after`, 'refused', p, ['Ref ', [kind, value], `${ch} on file.`]);
  add(`r13.${family}.labeled.before`, 'refused', p, [`Member ID ${ch}`, [kind, value], ' paid']);
  add(`r13.${family}.labeled.after`, 'refused', p, ['Member ID ', [kind, value], `${ch} paid`]);
  // Controls, the base's: a number that holds letters, and a name.
  const q = patient(['JANE Q ZEPHYRA'], ['SYNMEMBER0042', 'ZZ7654321'], ['SYNCLAIM0001']);
  add(`r13.control.${family}.lettered`, 'observe', q, k % 2 === 0 ? [`Ref ${ch}`, ['member', 'ZZ7654321'], ' on file.'] : ['Ref ', ['member', 'ZZ7654321'], `${ch} on file.`]);
  add(`r13.control.${family}.name`, 'observe', q, k % 2 === 0 ? [`Ms. ${ch}`, ['name', 'Zephyra'], ' was seen.'] : ['Ms. ', ['name', 'Zephyra'], `${ch} was seen.`]);
  if (k % 40 === 0) {
    const short = digits(4), r = holder(short, kind);
    add('r13.left.floor', 'left', r, [`Ref ${ch}`, [kind, short], ' on file.']);
    add('r13.apart', 'hidden', p, [`Ref ${ch} `, [kind, value], ' on file.']);
    add('r13.apart', 'hidden', p, ['Ref ', [kind, value], ` ${ch} on file.`]);
  }
});

// ---- R1-4: an unseen character inside a stored number (refused), and before or after it (hidden as today).
[...UNSEEN, ...SURROGATES].forEach((ch, k) => {
  const family = k < UNSEEN.length ? 'r14' : 'r14.surrogate';
  const kind = each(KINDS, k), value = digits(8), cut = 1 + Math.floor(rand() * 7);
  const p = holder(value, kind), inside = value.slice(0, cut) + ch + value.slice(cut);
  add(`${family}.inside.labeled`, 'refused', p, ['Member ID ', [kind, inside], ' paid']);
  add(`${family}.inside.bare`, 'refused', p, [[kind, inside]]);
  add(`${family}.inside.glued`, 'refused', p, ['Fax X', [kind, inside], ' ext']);
  add(`${family}.inside.after-first-digit`, 'refused', p, ['Ref ', [kind, value[0] + ch + value.slice(1)], ' on file.']);
  add(`${family}.inside.twice`, 'refused', p, ['Member ID ', [kind, value.slice(0, cut) + ch + ch + value.slice(cut)], ' paid']);
  add(`${family}.inside.after-dash`, 'refused', p, ['Member ID ', [kind, `${value.slice(0, cut)}-${ch}${value.slice(cut)}`], ' paid']);
  add(`${family}.inside.before-space`, 'refused', p, ['Member ID ', [kind, `${value.slice(0, cut)}${ch} ${value.slice(cut)}`], ' paid']);
  const lettered = `ZZ${digits(7)}`, q = holder(lettered, kind);
  add(`${family}.inside.lettered`, 'refused', q, ['Member ID ', [kind, `${lettered.slice(0, 4)}${ch}${lettered.slice(4)}`], ' paid']);
  add(`${family}.outside.before`, 'hidden', p, [`Member ID ${ch}`, [kind, value], ' paid']);
  add(`${family}.outside.after`, 'hidden', p, ['Member ID ', [kind, value], `${ch} paid`]);
  add(`${family}.outside.letter-before`, 'hidden', p, [`Fax X${ch}`, [kind, value], ' ext']);
  add(`${family}.outside.letter-after`, 'hidden', p, ['Fax ', [kind, value], `${ch}B ext`]);
  // Section 4's probes: inside a name, a date of birth, a Social Security and a phone number (twins). Observed.
  const jane = patient(['JANE Q ZEPHYRA'], ['SYNMEMBER0042'], ['SYNCLAIM0001']);
  const s = k < UNSEEN.length ? '' : '.surrogate';
  add(`probe${s}.name`, 'observe', jane, ['Dear Ms. ', ['name', `Zeph${ch}yra`], ', your claim']);
  add(`probe${s}.name`, 'observe', jane, ['Patient: ', ['name', `Jane Ze${ch}phyra`], ' was seen.']);
  add(`probe${s}.dob`, 'observe', jane, ['DOB ', ['dob', `03/1${ch}4/1980`], ' on file.']);
  add(`probe${s}.dob`, 'observe', jane, ['Date of birth: ', ['dob', `1980-03${ch}-14`], '']);
  add(`probe${s}.dob`, 'observe', jane, ['born ', ['dob', `March 1${ch}4, 1980`], ' in the record']);
  add(`probe${s}.ssn`, 'observe', jane, ['SSN ', ['ssn', `900-12-34${ch}56`], ' verified']);
  add(`probe${s}.ssn`, 'observe', jane, ['SSN ', ['ssn', `9001${ch}23456`], ' verified']);
  add(`probe${s}.phone`, 'observe', jane, ['Call ', ['phone', `212-555-01${ch}42`], ' today']);
  add(`probe${s}.phone`, 'observe', jane, ['Phone ', ['phone', `(212) 55${ch}5-0142`], '']);
});

// ---- (A): a name of one repeated letter written in pieces with a chain of initials (the probe's 42,240 rows), and the
// other names of the note.
for (const L of ['Z', 'A']) for (let n = 2; n <= 12; n += 1) {
  const name = L.repeat(n), p = patient([name], ['SYN555001'], ['ZZ99887']);
  const writings = new Set<string>([name]);
  for (let k = 1; k < n; k += 1) for (const mark of ['/', ' ', '.', '-']) writings.add(`${L.repeat(k)}${mark}${L.repeat(n - k)}`);
  for (let k = 1; k < n - 1; k += 1) writings.add(`${L.repeat(k)}/${L.repeat(n - k - 1)} ${L}`);
  const chains: string[] = [];
  for (let m = 1; m <= 4; m += 1) chains.push(Array(m).fill(L).join('.'), Array(m).fill(`${L}.`).join(''), Array(m).fill(`${L}.`).join(' '), Array(m).fill(L).join(' '));
  const form = `A.length-${String(n).padStart(2, '0')}`;
  for (const w of writings) for (const chain of chains) {
    add(form, 'hidden', p, [['name', `${w} ${chain}`]]);
    add(form, 'hidden', p, [['name', `${chain} ${w}`]]);
    add(form, 'hidden', p, [['name', `${w}, ${chain}`]]);
    add(form, 'hidden', p, ['Dear ', ['name', `${w} ${chain}`], ', your claim']);
  }
}
for (const [name, written] of [['ANNA', 'Ann A.A.'], ['ANNA', 'Ann/a A.'], ['OTTO', 'Ott O.O.'], ['ELLE', 'Ell E.E.'], ['ANA ZEPHYRA', 'Zephyr A.A.'], ['ANA ZEPHYRA', 'Zephyr/A A.Z.'], ['JANE Q ZEPHYRA', 'Zephyr A.J.Q.'], ['JANE Q ZEPHYRA', 'Zephyr/a J.Q.']] as const) add('A.other-names', 'hidden', patient([name], ['SYN555001'], ['ZZ99887']), [['name', written]]);
add('A.control.sentence', 'observe', patient(['JANE Q ZEPHYRA'], ['SYN555001'], ['ZZ99887']), ['Dear ', ['name', 'Zephyra'], '. I am writing']);

// ---- Real-shaped rows the gate lacks. Observed: what each rule newly refuses here is its cost, named by form.
const NEL = '\u0085', NUL = '\u0000';
for (const n of [8, 9, 10, 11]) for (const kind of KINDS) for (let draw = 0; draw < 2; draw += 1) {
  const v = digits(n), p = holder(v, kind), N: Part = [kind, v], Z: Part = ['name', 'Zephyra'];
  const real = (form: string, parts: Part[]) => add(`real.${form}`, 'observe', p, parts);
  // U+0085 as the line ending (a mainframe's NEL, or EBCDIC text converted).
  real('nel.letter', [`Dear Ms. `, Z, `,${NEL}Your claim was processed.${NEL}Member ID: `, N, `${NEL}Paid 150.00 on 01/05/2026.${NEL}Thank you.${NEL}`]);
  real('nel.number-ends-line', ['Re: claim ', N, `${NEL}Paid 150.00${NEL}`]);
  real('nel.number-then-date-line', ['Member ID: ', N, `${NEL}01/05/2026 Paid 150.00${NEL}`]);
  real('nel.amount-line-then-number', [`Paid 150.00${NEL}`, N, ` Member ID${NEL}`]);
  real('nel.name-ends-line', ['Patient: ', Z, `${NEL}Paid in full.${NEL}Member `, N, NEL]);
  real('nel.no-identifier', [`STATEMENT${NEL}Paid 150.00${NEL}01/05/2026 97110 2 units${NEL}97112 1 unit${NEL}Total 225.00${NEL}`]);
  // U+0091 to U+0097: Windows-1252 quotes and dashes decoded as Latin-1.
  real('c1.possessive', ['Ms. ', Z, '\u0092s claim ', N, ' was paid.']);
  real('c1.quotes', ['The plan\u0092s notice said \u0093paid in full\u0094 for member ', N, '.']);
  real('c1.code-range', ['Codes 97110\u009697112 were billed for member ', N, '.']);
  real('c1.date-range', ['Service 01/05/2026 \u0096 01/09/2026, member ID ', N, ' \u0097 paid 150.00.']);
  real('c1.dash-after-number', ['Member ID ', N, '\u0097paid in full.']);
  real('c1.dash-before-number', ['Member\u0096', N, ' paid']);
  real('c1.quoted-number', ['Member ID \u0093', N, '\u0094 paid.']);
  real('c1.quoted-name', ['Patient \u0093', Z, '\u0094 was seen.']);
  real('c1.no-identifier', ['We\u0092ve reviewed the provider\u0092s appeal \u0096 codes 97110\u009697112 \u0097 and paid \u0093150.00\u0094.']);
  // A NUL from a bad extraction.
  real('nul.trailing', ['Member ID: ', N, NUL]);
  real('nul.between-words', [`Paid${NUL} 150.00 for member `, N, '.']);
  real('nul.in-number', ['Member ID: ', [kind, v.slice(0, 4) + NUL + v.slice(4)], ' paid']);
  real('nul.utf16-read-as-bytes', [[...'Member ID: '].join(NUL) + NUL, [kind, [...v].join(NUL)], NUL + [...' paid'].join(NUL) + NUL]);
  real('nul.no-identifier', [`Paid 150.00${NUL}${NUL} on 01/05/2026.`]);
  // Ruling 3: a footnote's superscript after a member ID or claim number; an ordinal or circled list number before one.
  real('r3.footnote-after-member-id', ['Member ID: ', N, '\u00B9 was verified.']);
  real('r3.footnote-after-claim-number', ['Claim ', N, '\u00B2 was denied.\n\u00B2 See the plan document.']);
  real('r3.footnote-after-number-at-line-end', ['Member ID: ', N, '\u00B3']);
  real('r3.footnote-set-apart', ['Member ID: ', N, ' \u00B9 was verified.']);
  real('r3.footnote-after-period', ['Member ID: ', N, '.\u00B9 Verified.']);
  real('r3.circled-list-number-before', ['\u2460', N, ' \u2461150.00 paid']);
  real('r3.circled-list-number-set-apart', ['\u2460 Member ID ', N, '\n\u2461 Paid 150.00']);
  real('r3.parenthesized-list-number-before', ['\u2474', N, ' paid']);
  real('r3.list-number-with-full-stop-before', ['\u2488', N, ' paid']);
  real('r3.list-number-with-full-stop-set-apart', ['\u2488 ', N, ' paid']);
  real('r3.superscripts-no-number-beside', ['Paid 150.00\u00B9 for 97110\u00B2, member ', N, '.']);
  real('r3.no-identifier', ['Paid 150.00\u00B9 for 97110\u00B2.\n\u00B9 Allowed amount. \u00B2 Per unit.']);
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
const forms: Record<string, number> = {};
for (const rec of recs) forms[rec.s] = (forms[rec.s] ?? 0) + 1;
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify({ built: 'designs/lane-b-redact-item-40/scripts/generated-set-40.mts', seed: Number(process.argv[3] ?? 40), letters: recs.length, patients: patients.length, shards: SHARDS, sha256: hash.digest('hex'), characters: { numeric: NUMERIC.length, nfkcStable: STABLE.length, nfkcRewritten: REWRITTEN.length, unseenControlsAndFormat: CLASSED, unseen: UNSEEN.length, surrogates: 2 }, forms }, null, 1));
console.log(`letters ${recs.length} patients ${patients.length} forms ${Object.keys(forms).length} numeric ${NUMERIC.length} (${STABLE.length} + ${REWRITTEN.length}) unseen ${UNSEEN.length} (+2 surrogates)`);

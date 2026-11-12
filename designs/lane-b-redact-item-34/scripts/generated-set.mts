// generated-set.mts <out corpus dir> [seed]: Queues item 34's stage 6 generated set, in the gate's corpus layout
// (patients.json, shard-K.jsonl.gz, manifest.json), so the gate's own worker.mts reads it unchanged. Every record is
// synthetic (invented names, drawn digits, SYN and ZZ numbers, 900-area twins). Beside the gate's fields (i, s, p, t,
// sec in NFKC offsets) each record carries what generated-run.mts checks on the head:
//   exp 'refused' the rule refuses the letter;  exp 'hidden' the rule replaces the value;
//   exp 'strict'  refused where its line-feed control is (A-6);
//   exp 'left'    a recorded residual: sent with the value as written, the same as the base sends it;
//   exp 'observe' a control: counted, never judged.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';

const out = process.argv[2]!;
let state = Number(process.argv[3] ?? 34) >>> 0;
const rand = () => { state = (state + 0x6d2b79f5) >>> 0; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
/** Digits alone; the first is 1 to 9 unless zero is asked for, and no two calls of one length give the same value. */
const seen = new Set<string>();
const digits = (n: number, zero = false): string => { for (;;) { let s = zero ? '0' : String(1 + Math.floor(rand() * 9)); while (s.length < n) s += String(Math.floor(rand() * 10)); if (!seen.has(s)) { seen.add(s); return s; } } };

type Part = string | [kind: string, text: string];
interface Rec { i: number; s: string; p: number; t: string; sec: [string, number, number][]; exp: string; ctl?: number }
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
    patients.push({ P: { pseudonym: `synthetic-patient-g34-${at}`, names, datesOfBirth: ['1980-03-14'], memberIds }, C: claimNumbers.map((number, k) => ({ claimId: `synthetic-claim-g34-${at}-${k + 1}`, patientPseudonym: `synthetic-patient-g34-${at}`, claimNumbers: [number] })) });
  }
  return at;
}
function add(form: string, exp: string, p: number, parts: Part[], ctl?: number): number {
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
  recs.push({ i: recs.length, s: `G34/${form}`, p, t, sec, exp, ...(ctl === undefined ? {} : { ctl }) });
  return recs.length - 1;
}

const HELD = 'Seen 01/01/2020-150.00Paid in full. ';
const LENGTHS = [5, 6, 7, 8, 9, 10, 11, 12];
/** The patient holding one digits-only number, as a member ID or as a claim number. */
const holder = (value: string, kind: string) => (kind === 'member' ? patient(['JANE Q ZEPHYRA'], [value], ['SYNCLAIM0001']) : patient(['JANE Q ZEPHYRA'], ['SYNMEMBER0042'], ['SYNCLAIM0001', value]));
const KINDS = ['member', 'claim'] as const;
const BEFORE = ['X', 'XYZ', 'q', 'AB', 'é', 'Ж', '中'];
const AFTER = ['B', 'x', 'é', 'Ж', '中'];
const FRAMES: [string, string][] = [['Fax ', ' ext 12'], ['Ref ', ' on file.'], ['Re: ', '\r\nPaid 150.00'], ['(', ')'], [HELD, ' Paid'], ['', '']];
const SIDES: [string, string][] = [...BEFORE.map((b): [string, string] => [b, '']), ...AFTER.map((a): [string, string] => ['', a]), ['X', 'B'], ['é', 'x'], ['Ж', '中']];

// ---- (a): a digits-only number of 5 to 12 digits glued to a letter is refused.
for (const n of LENGTHS) for (const kind of KINDS) for (let draw = 0; draw < 3; draw += 1) {
  const value = digits(n, draw === 2);
  const p = holder(value, kind);
  for (const [b, a] of SIDES) { const [f0, f1] = pick(FRAMES); add(`a.glued.${n}`, 'refused', p, [f0 + b, [kind, value], a + f1]); }
  // Joiners inside the number, one cut and every cut.
  for (const joiner of ['-', ' ', '_', "'", '\u00B7', ' - ', '\n']) for (const [b, a] of [['X', ''], ['', 'B'], ['Ж', '']] as const) {
    const cut = 1 + Math.floor(rand() * (n - 1));
    const [f0, f1] = pick(FRAMES);
    add(`a.joiner.${n}`, 'refused', p, [f0 + b, [kind, value.slice(0, cut) + joiner + value.slice(cut)], a + f1]);
  }
  for (const joiner of ['-', ' ']) add(`a.joiner.${n}`, 'refused', p, ['Fax X', [kind, [...value].join(joiner)], ' ext']);
  for (const [b, a] of [['X', ''], ['', 'B'], ['XYZ', 'x']] as const) for (const ending of ['\r\n', '\r\r\n']) {
    const cut = 1 + Math.floor(rand() * (n - 1));
    add(`a.crlf.${n}`, 'refused', p, [`Fax ${b}`, [kind, value.slice(0, cut) + ending + value.slice(cut)], `${a} ext`]);
    add(`a.crlf.${n}`, 'refused', p, [`Thank you.\r\nRef ${b}`, [kind, value], `${a} on file.\r\nPaid 150.00\r\n`]);
  }
  // Another script's digits: all of them, and half of them.
  for (const [script, zero] of [['fullwidth', 0xff10], ['arabic', 0x0660], ['persian', 0x06f0], ['devanagari', 0x0966]] as const) {
    const all = [...value].map((d) => String.fromCodePoint(zero + Number(d))).join('');
    const half = [...value].map((d, k) => (k % 2 === 0 ? String.fromCodePoint(zero + Number(d)) : d)).join('');
    for (const [b, a] of [['X', ''], ['', 'B']] as const) { add(`a.script.${script}.${n}`, 'refused', p, [`Fax ${b}`, [kind, all], `${a} ext`]); add(`a.script.${script}.${n}`, 'refused', p, [`Ref ${b}`, [kind, half], `${a} on file.`]); }
    add(`a.script-control.${script}`, 'observe', p, ['Ref ', [kind, all], ' on file.']);
  }
  // No other side is asked: a joiner and digits, or digits, after a number a letter stands before.
  add(`a.glued.${n}`, 'refused', p, ['Ref XYZ', [kind, value], '-01 on file.']);
  add(`a.glued.${n}`, 'refused', p, ['Ref XYZ', [kind, value], '123 on file.']);
  // Review 1, R1-2 (fix round 2): the writing after a label, joined over "." or "/", glued to a letter, label or none.
  // No draw is taken here, so every other letter of the set is as it was (13,780 before these 576).
  for (const sep of ['.', '/']) for (const label of ['Claim No. ', 'Member ID: ', 'Paid ']) for (const [b, a] of [['X', ''], ['', 'B']] as const) {
    const cut = Math.floor(n / 2);
    add('a.labeled-separator', 'refused', p, [label + b, [kind, value.slice(0, cut) + sep + value.slice(cut)], a + ' on file.']);
  }
  // Left, recorded: a digit right beside the number is another, longer number.
  for (const [b, a] of [['Ref 9', ' on file.'], ['Ref 00', ' on file.'], ['Ref ', '01 on file.'], ['Ref ', '9B on file.'], ['Ref B00', ' on file.']] as const) add('left.digit-beside', 'left', p, [b, [kind, value], a]);
  // Set apart it is the first reading's.
  add('a.control.apart', 'hidden', p, ['Ref ', [kind, value], ' on file.']);
}
// A stored separator: the number as the records hold it, compact, and with a run of marks there (A-5), each glued.
for (const n of LENGTHS) for (const kind of KINDS) for (const separator of ['/', ' ', '-', '.']) {
  const value = digits(n);
  const cut = 1 + Math.floor(rand() * (n - 1));
  const [head, tail] = [value.slice(0, cut), value.slice(cut)];
  const p = holder(head + separator + tail, kind);
  for (const between of [separator, '', '.', ':', ' # ', '/']) for (const [b, a] of [['X', ''], ['', 'B']] as const) add(`a.stored-separator.${n}`, 'refused', p, [`Fax ${b}`, [kind, head + between + tail], `${a} ext`]);
}
// A piece: of two pieces of digits, and the digits of a number that holds letters.
for (const n of LENGTHS) for (const kind of KINDS) for (const separator of [' ', '/', '-']) {
  const one = digits(n), two = digits(5 + Math.floor(rand() * 4));
  const p = holder(one + separator + two, kind);
  add(`a.piece.${n}`, 'refused', p, ['Fax X', [kind, one], ' ext']);
  add(`a.piece.${n}`, 'refused', p, ['Fax ', [kind, two], 'B ext']);
  add(`a.piece.${n}`, 'refused', p, ['Fax X', [kind, [...one].join('-')], ' ext']);
  const lettered = digits(n);
  const q = holder(`ZZ${separator}${lettered}`, kind);
  add(`a.piece-of-lettered.${n}`, 'refused', q, ['Fax XQ', [kind, lettered], ' ext']);
  add(`a.piece-of-lettered.${n}`, 'refused', q, ['Fax ', [kind, lettered], 'B ext']);
}
// The floor: 2 to 4 digits glued to a letter that is no label word is the recorded residual.
for (const n of [2, 3, 4]) for (const kind of KINDS) for (let draw = 0; draw < 12; draw += 1) {
  const value = digits(n, draw % 4 === 3);
  const p = holder(value, kind);
  for (const [b, a] of [['Fax X', ' ext'], ['Billed G', ' twice'], ['Ref ', 'B on file.'], ['Room AB', ''], ['Fax Ж', ' ext']] as const) add(`left.glued.${n}`, 'left', p, [b, [kind, value], a]);
}
for (const kind of KINDS) for (let draw = 0; draw < 12; draw += 1) {
  // A piece of 4 digits, glued: under the floor too.
  const piece = digits(4), other = digits(6);
  const p = holder(`${piece} ${other}`, kind);
  add('left.glued.piece-4', 'left', p, ['Fax X', [kind, piece], ' ext']);
  add('left.glued.piece-4', 'left', p, ['Ref ', [kind, piece], 'B on file.']);
}

// ---- (c): one piece of a stored number, of 5 characters or more and holding a digit, is a number of its kind.
for (const n of LENGTHS) for (const kind of KINDS) for (const separator of [' ', '/', '-', '_', '.', '+', '#', ' / ']) {
  const body = digits(n - 2);
  const lettered = `ZZ${body}`;
  const p = holder(`${lettered}${separator}01`, kind);
  for (const [b, a] of [['Member ', ' was seen.'], ['Ref ', ' on file.'], ['', ''], ['(', ')'], ['Thank you.\r\n', '\r\nPaid 150.00']] as const) add(`c.piece.${n}`, 'hidden', p, [b, [kind, pick([lettered, lettered.toLowerCase(), lettered])], a]);
  add('left.piece-under-5', 'left', p, ['Line ', [kind, '01'], ' of the claim.']);
  const one = digits(n), two = digits(5 + Math.floor(rand() * 8));
  const q = holder(`${one}${separator}${two}`, kind);
  for (const piece of [one, two]) { add(`c.piece-digits.${piece.length}`, 'hidden', q, [kind === 'member' ? 'Member ID: ' : 'Claim number: ', [kind, piece], '']); add(`c.piece-digits.${piece.length}`, 'hidden', q, ['Ref ', [kind, piece], ' on file.']); }
  const short = digits(4);
  const r = holder(`${short}${separator}${digits(6)}`, kind);
  add('left.piece-under-5', 'left', r, ['Ref ', [kind, short], ' on file.']);
  const s = holder(`ZZ${separator}${digits(7)}`, kind);
  add('left.piece-of-letters', 'left', s, ['Ref ', [kind, 'ZZ'], ' on file.']);
}

// ---- A-5: where the records write a separator, a run of marks joins.
for (const n of LENGTHS) for (const kind of KINDS) for (const separator of ['/', '.', '-', ' ', '+', '#']) {
  const lettered = `ZZ${digits(n - 2)}`;
  const p = holder(`${lettered}${separator}01`, kind);
  for (const between of ['.', ',', '+', '*', ':', '#', ' / ', '. ', ' - ', '\u3002', '\u30FB', '=', '(', ')', '&', './', ' , ', '\t:\t', '\n/', '\r\n/']) {
    const [f0, f1] = pick([['Ref ', ' on file.'], ['Member ', ' was seen.'], ['', ''], ['(', ')']] as const);
    add(`a5.marks.${n}`, 'hidden', p, [f0, [kind, `${lettered}${between}01`], f1]);
  }
  const one = digits(n - 2), two = digits(3);
  const q = holder(`${one}${separator}${two}`, kind);
  for (const between of ['+', '*', ':', '#', '&', ' / ']) add(`a5.marks-digits.${n}`, 'hidden', q, ['Ref ', [kind, `${one}${between}${two}`], ' on file.']);
}

// ---- (b) and A-4: names. Every name is invented.
const NAMES: [string, string][] = [['JANE', 'ZEPHYRA'], ['TOMASZ', 'VANTREE'], ['ORLA', 'QUILLBY'], ['BRONWEN', 'TREEBY'], ['MIRELLE', 'OSTRAVEK'], ['DAVETH', 'ZORBANE']];
const title = (word: string) => word[0]! + word.slice(1).toLowerCase();
const NAME_MARKS = ['+', '&', '*', ':', '(', '=', '#', ' + ', ' & ', '|', '\\', '@', '!'];
for (const [first, last] of NAMES) {
  for (const mark of NAME_MARKS) for (const order of [[first, last], [last, first]] as const) {
    const p = patient([`${order[0]}${mark}${order[1]}`], ['SYNMEMBER0042'], ['SYNCLAIM0001']);
    add('b.held-with-mark', 'hidden', p, ['Ms. ', ['name', title(last)], ' was seen.']);
    add('b.held-with-mark', 'hidden', p, ['Seen: ', ['name', first], ', twice.']);
    add('b.held-with-mark', 'hidden', p, ['Dear ', ['name', title(first)], ' ', ['name', title(last)], ', your claim']);
    add('b.held-with-mark', 'hidden', p, ['Dear ', ['name', title(last)], ', ', ['name', title(first)], ': your claim']);
    add('b.held-with-mark', 'hidden', p, ['Thank you.\r\nPatient: ', ['name', last.toLowerCase()], '\r\nPaid 150.00']);
    // Held with a mark and written as A-4 reads: a run of marks inside the part.
    for (const between of [', ', '(', '\u3002', '*', '/', '+']) { const cut = 2 + Math.floor(rand() * (last.length - 3)); add('b.held-with-mark.a4', 'hidden', p, ['Dear ', ['name', `${title(last).slice(0, cut)}${between}${last.slice(cut).toLowerCase()}`], ', your claim']); }
  }
  for (const held of [`${last}(${first})`, `${last} [${first}]`, `${last}+${first}+Q`, `${first}+Q+${last}`]) {
    const p = patient([held], ['SYNMEMBER0042'], ['SYNCLAIM0001']);
    add('b.held-three', 'hidden', p, ['Dear ', ['name', title(first)], ' ', ['name', title(last)], ', your claim']);
    add('b.held-three', 'hidden', p, ['Dear ', ['name', title(last)], ', your claim']);
    add('b.held-three', 'hidden', p, ['Seen: ', ['name', first], ', twice.']);
  }
  // Left, recorded: a name the records glue to another word or to a digit is one word.
  add('left.name-glued', 'left', patient([`${first}${last}`], ['SYNMEMBER0042'], ['SYNCLAIM0001']), ['Ms. ', ['name', title(last)], ' was seen.']);
  add('left.name-glued', 'left', patient([`${last}2`], ['SYNMEMBER0042'], ['SYNCLAIM0001']), ['Ms. ', ['name', title(last)], ' was seen.']);
  // A-4 on a name held with spaces: every cut that leaves two letters or more on each side, three writings.
  const A4_MARKS = [', ', ',', '(', ')', '\u3002', '*', '/', '+', ': ', '; ', '&', '=', '#', '!', '?', '"', '%', '@', '<', '>', '{', '|', '~', '^', '\\', '\u30FB', '\u2026', ' / ', '., ', '\n, ', '\r\n, ', ' * '];
  const p = patient([`${first} Q ${last}`], ['SYNMEMBER0042'], ['SYNCLAIM0001']);
  for (const between of A4_MARKS) for (let cut = 1; cut < last.length; cut += 1) {
    const inner = cut >= 2 && cut <= last.length - 2;
    const cased = pick([title(last), last, title(last)]);
    const written = `${cased.slice(0, cut)}${between}${cased === last ? last.slice(cut) : last.slice(cut).toLowerCase()}`;
    add(inner ? 'a4.mark-in-part' : 'a4.edge-cut', inner ? 'hidden' : 'observe', p, [pick(['Dear ', 'Ms. ', 'Patient: ']), ['name', written], ', your claim']);
  }
  for (let cut = 1; cut < last.length; cut += 1) add('a4.control.space', 'observe', p, ['Dear ', ['name', `${title(last).slice(0, cut)} ${last.slice(cut).toLowerCase()}`], ', your claim']);
}

// ---- A-6: a line feed before a CR is one line ending too. Each row's control is the same letter with line feeds.
const JANE = patient(['JANE Q ZEPHYRA'], ['SYNMEMBER0042', 'ZZ7654321'], ['SYNCLAIM0001', 'C2026000417']);
const ENDINGS = ['\n\r', '\n\r\r', '\r\n\r', '\n\r\r\r', '\r\r\n\r\r'];
for (let draw = 0; draw < 40; draw += 1) {
  const d = (n: number) => { let s = ''; while (s.length < n) s += String(Math.floor(rand() * 10)); return s; };
  const rows: Part[][] = [
    ['SSN verified. Account \nNo. ', ['ssn', `900-${d(2)}-${d(6)}`]],
    ['Claim Number:\n\n', ['claim', `20260${d(6)}.01`]],
    ['STATEMENT\n\n', ['ssn', `900-${d(2)}-${d(4)}`], '150.00'],
    [`${HELD}Member ID:\n\n`, ['member', `802-${d(2)}-${d(6)}`]],
    ['Thank you.\nSSN verified. Account \nNo. ', ['ssn', `900-${d(2)}-${d(6)}`], '\nPaid.'],
  ];
  for (const row of rows) {
    const ctl = add('a6.control.lf', 'observe', JANE, row);
    for (const ending of [...ENDINGS, '\r\n']) add(ending === '\r\n' ? 'a6.control.crlf' : 'a6.lf-cr', 'strict', JANE, row.map((part) => (typeof part === 'string' ? part.replaceAll('\n', ending) : part)), ctl);
    // One ending of several written so.
    let k = 0;
    add('a6.lf-cr', 'strict', JANE, row.map((part) => (typeof part === 'string' ? part.replaceAll('\n', () => (k++ % 2 === 0 ? pick(ENDINGS) : '\r\n')) : part)), ctl);
  }
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
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify({ built: 'designs/lane-b-redact-item-34/scripts/generated-set.mts', seed: Number(process.argv[3] ?? 34), letters: recs.length, patients: patients.length, shards: SHARDS, sha256: hash.digest('hex'), forms }, null, 1));
console.log(`letters ${recs.length} patients ${patients.length} forms ${Object.keys(forms).length}`);

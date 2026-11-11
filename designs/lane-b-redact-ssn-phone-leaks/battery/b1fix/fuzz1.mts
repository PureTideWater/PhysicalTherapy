// Avenue 1 fuzzer: letters the base REFUSES that the head SENDS, and letters both send where the head shows more digits.
// node fuzz1.mts <runs> <seed> [maxShown]
import { load, outcome, digitsOf, plain, show } from './lib.mts';
const B = await load('base');
const H = await load('head');
const runs = Number(process.argv[2] ?? 2000); let seed = Number(process.argv[3] ?? 1); const maxShown = Number(process.argv[4] ?? 40);
const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)]!;
const P = { pseudonym: 'p', names: ['JANE Q ZEPHYRA', 'SIMONE VANTREE'], datesOfBirth: ['1980-03-14'], memberIds: ['SYNMEMBER0042', 'ZZ7654321'] };
const C = [{ claimId: 'c', patientPseudonym: 'p', claimNumbers: ['SYNCLAIM0001'] }];
const LABELS = ['SSN', 'Social Security', 'Soc. Sec.', 'SS#', 'Phone', 'Tel', 'Tel.', 'Fax', 'Call', 'Contact', 'TTY', 'Cell', 'Mobile', 'Medicare', 'HICN', 'Telephone', 'Ph', 'Phones', 'PatientSSN', 'Claim', 'Ref', 'ID', 'Member'];
const TAIL = ['', '', '', ':', ' No.', ' #', ' number', ' -', ' no'];
const OWN = ['Zephyra', 'Jane Zephyra', 'JANE Q ZEPHYRA', 'Vantree', 'S1MONE', 'VANTR3E', 'SYNMEMBER0042', 'SYNMEMBERO042', 'ZZ7654321', 'ZZ765432l', 'SYNCLAIM0001', 'SYNCLAIMOOO1', '03/14/1980', 'DOB 03/14/1980', 'Zephyra, Jane', 'J. Zephyra', '(Jane Zephyra, home)', 'Zephyra’s', 'ZЕРНYRА', 'νantree', 'March 14, 1980'];
const MID = [' ', ' ', ': ', ' for ', ' at ', ', ', ' - ', ' (', ') ', '\n', ' ​', '​', '', '-', '/', '\t', ' is ', ':', ' #'];
const INV = ['​', '­', '⁠', '﻿', '‎', '‬'];
const SCRIPT = [0x0660, 0x06F0, 0x0966, 0xFF10];
const NUMS = ['555-0123', '555 0123', '555.0123', '555-\n0123', '900-12-3456', '90012-3456', '9001-23456', '900 12 3456', '900.12 3456', '900123456', '900-123456', '90012 3456', '202-555-0123', '2025550123', '(202) 555-0123', '202 555 0123', '20255 50123', '202-5550123', 'XXXXX3456', 'XXX-XX-3456', '***-**-3456', '1234567893', '5550123', '0123'];
const EXTRA = ['900-12', '3456', '12-3456', '555', '9001', '150.00', '$150.00', '2020', '01/01/2020', '1', '45', '555-0124', '202', '900', '0124', '9', '90012', '2025550124', '900-12-3457'];
const GLUE = [' ', '-', '/', ', ', ' or ', ' and ', '\n', ' x', ' ext ', '.', '', 'Paid', ' Paid ', '(', ')', ') ', ' (', ':', ': ', ';', ' #', '#', '*', ' | ', '|', '~', '·', '•', '\t', ' / ', ',', '; ', ' – ', '–', '"', "'"];
const PREFIX = ['', '', '', 'Paid $10.00. ', 'Seen 01/01/2020-150.00Paid in full. ', 'DOS 01/01/2020-01/31/2020 ', 'Service period 01/01/2020 - 01/31/2020.\n', 'Dear Jane Zephyra,\n'];
const SUFFIX = ['', '', '', '.', ' Paid $1.00', '150.00', 'Zephyra', ' 03/14/1980', 'th', 'x12', ' ext 12', '-1', ' (home)', '\n150.00', ' 2020', 'A'];
const D = () => String(Math.floor(rnd() * 10));
const randomNumber = () => { const groups = Array.from({ length: 1 + Math.floor(rnd() * 4) }, () => Array.from({ length: 1 + Math.floor(rnd() * 6) }, D).join('')); return groups.map((g, i) => (i === 0 ? g : pick(['-', ' ', '.', '\n', '', '/', ')', '-\n', ', ']) + g)).join(''); };
const sprinkle = (s: string) => { // an invisible character at a random position, or another script's digits
  const k = rnd();
  if (k < 0.35) { const at = Math.floor(rnd() * (s.length + 1)); return s.slice(0, at) + pick(INV) + s.slice(at); }
  if (k < 0.45) { const zero = pick(SCRIPT); return s.replace(/[0-9]/g, (d) => (rnd() < 0.7 ? String.fromCodePoint(zero + Number(d)) : d)); }
  return s;
};
const glue = () => { const g = pick(GLUE); const k = rnd(); return k < 0.25 ? pick(INV) + g : k < 0.5 ? g + pick(INV) : k < 0.55 ? pick(INV) + g + pick(INV) : g; };
const letter = () => {
  const lab = pick(LABELS) + pick(TAIL);
  const k = rnd();
  let through = '';
  if (k < 0.35) through = pick(MID) + pick(OWN);
  else if (k < 0.55) through = ` ${1 + Math.floor(rnd() * 12)}${pick([':', ')', '', 'st:', ' :', '.'])}`;
  else if (k < 0.65) through = pick(MID) + pick(OWN) + pick(MID) + pick(OWN);
  else if (k < 0.72) through = pick(MID) + pick(OWN) + ` ${1 + Math.floor(rnd() * 9)}:`;
  let number = rnd() < 0.8 ? pick(NUMS) : randomNumber();
  if (rnd() < 0.3) number = sprinkle(number);
  let body = `${lab}${through}${pick(MID)}${number}`;
  const e = rnd();
  if (e < 0.45) body = `${body}${glue()}${rnd() < 0.8 ? pick(EXTRA) : randomNumber()}`;
  else if (e < 0.6) body = `${lab}${through}${pick(MID)}${pick(EXTRA)}${glue()}${number}`;
  else if (e < 0.7) body = `${pick(EXTRA)}${glue()}${body}`;
  return `${pick(PREFIX)}${body}${pick(SUFFIX)}`;
};
let flips = 0; let flipDigits = 0; let unredact = 0; let threw = 0;
const shown = new Map<string, number>(); const lines: string[] = [];
const shapeOf = (t: string) => plain(t).replace(/[0-9]+/g, '9').replace(/\p{L}+/gu, 'a').slice(0, 60);
for (let i = 0; i < runs; i += 1) {
  const text = letter();
  const b = outcome(B, text, P, C); const h = outcome(H, text, P, C);
  if (h.threw !== null) { threw += 1; if (threw < 5) lines.push(`THREW ${show(text)} ${h.threw}`); continue; }
  if (h.refused) continue;
  if (b.refused) {
    flips += 1;
    // digits a reader still sees in the head's letter, apart from the amounts and dates the generator writes as context
    const rest = plain(h.sent).replace(/\$?[0-9]+\.[0-9]{2}(?![0-9])|01\/(?:01|31)\/2020|\$10\.00|\$1\.00/g, ' ');
    if (/[0-9]{3,}|[0-9][^\p{L}\p{N}|]{0,2}[0-9][^\p{L}\p{N}|]{0,2}[0-9]/u.test(rest)) {
      flipDigits += 1; const key = `F ${shapeOf(h.sent)}`; shown.set(key, (shown.get(key) ?? 0) + 1);
      if (shown.get(key) === 1 && lines.length < maxShown) lines.push(`FLIP ${show(text, 110)} => ${show(h.sent, 110)}`);
    }
  } else if (b.threw === null && digitsOf(h.sent).length > digitsOf(b.sent).length) {
    unredact += 1; const key = `U ${shapeOf(h.sent)}`; shown.set(key, (shown.get(key) ?? 0) + 1);
    if (shown.get(key) === 1 && lines.length < maxShown) lines.push(`UNREDACT ${show(text, 100)} => base ${show(b.sent, 80)} head ${show(h.sent, 80)}`);
  }
}
for (const l of lines) console.log(l);
console.log(`runs ${runs} seed ${process.argv[3] ?? 1}: flips(base refused, head sent) ${flips}, of them with 3+ digits in clear ${flipDigits}; both sent and head shows more digits ${unredact}; head threw ${threw}`);

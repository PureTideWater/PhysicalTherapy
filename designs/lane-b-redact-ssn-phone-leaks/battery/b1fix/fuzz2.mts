// Avenue 1 fuzzer, second pass: only ASCII writings of the call's own identifiers and no invisible characters, so a flip here is
// none of B1-1 (an invisible run), B1-2 (a newly read own identifier) or B1-3 (a letter read as a digit). node fuzz2.mts <runs> <seed>
import { load, outcome, digitsOf, plain, show } from './lib.mts';
const B = await load('base'); const H = await load('head');
const runs = Number(process.argv[2] ?? 2000); let seed = Number(process.argv[3] ?? 1);
const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)]!;
const P = { pseudonym: 'p', names: ['JANE Q ZEPHYRA', 'SIMONE VANTREE'], datesOfBirth: ['1980-03-14'], memberIds: ['SYNMEMBER0042', 'ZZ7654321'] };
const C = [{ claimId: 'c', patientPseudonym: 'p', claimNumbers: ['SYNCLAIM0001'] }];
const LABELS = ['SSN', 'Social Security', 'Soc. Sec.', 'SS#', 'Phone', 'Tel', 'Tel.', 'Fax', 'Call', 'Contact', 'TTY', 'Cell', 'Mobile', 'Medicare', 'HICN', 'Telephone', 'Ph', 'Phones', 'PatientSSN', 'Claim', 'Ref', 'ID', 'Member', 'Case No.', 'NPI', 'Paid'];
const TAIL = ['', '', '', ':', ' No.', ' #', ' number', ' -', ' no'];
const OWN = ['Zephyra', 'Jane Zephyra', 'JANE Q ZEPHYRA', 'Vantree', 'SYNMEMBER0042', 'ZZ7654321', 'SYNCLAIM0001', '03/14/1980', 'DOB 03/14/1980', 'Zephyra, Jane', 'J. Zephyra', '(Jane Zephyra, home)', 'Zephyra’s', 'March 14, 1980', 'ZZ 7654321', 'SYN-MEMBER-0042', 'Simone Vantree'];
const MID = [' ', ' ', ': ', ' for ', ' at ', ', ', ' - ', ' (', ') ', '\n', '', '-', '/', '\t', ' is ', ':', ' #', '. ', '; '];
const NUMS = ['555-0123', '555 0123', '555.0123', '555-\n0123', '900-12-3456', '90012-3456', '9001-23456', '900 12 3456', '900.12 3456', '900123456', '900-123456', '90012 3456', '202-555-0123', '2025550123', '(202) 555-0123', '202 555 0123', '20255 50123', '202-5550123', 'XXXXX3456', 'XXX-XX-3456', '***-**-3456', '1234567893', '5550123', '0123', '900-12-3456150.00', '150.00900-12-3456', '$150.00900-12-3456', '900123456150.00', 'PaidXXX-XX-3456', '(202) 555-0123x45', '1-202-555-0123', '+1 202 555 0123'];
const EXTRA = ['900-12', '3456', '12-3456', '555', '9001', '150.00', '$150.00', '2020', '01/01/2020', '1', '45', '555-0124', '202', '900', '0124', '9', '90012', '2025550124', '900-12-3457', '$1,234.56', '97110', '12', '1,234.56'];
const GLUE = [' ', '-', '/', ', ', ' or ', ' and ', '\n', ' x', ' ext ', '.', '', 'Paid', ' Paid ', '(', ')', ') ', ' (', ':', ': ', ';', ' #', '#', '*', ' | ', '|', '~', '·', '•', '\t', ' / ', ',', '; ', ' – ', '–', '"', "'", '\n\n', ' \n', '\r\n', '\f', '  ', '=', '+', ' + ', ' ', ' ', '　'];
const PREFIX = ['', '', '', 'Paid $10.00. ', 'Seen 01/01/2020-150.00Paid in full. ', 'DOS 01/01/2020-01/31/2020 ', 'Service period 01/01/2020 - 01/31/2020.\n', 'Dear Jane Zephyra,\n', '150.00 ', '2020-01-02 ', 'Claim SYNCLAIM0001 '];
const SUFFIX = ['', '', '', '.', ' Paid $1.00', '150.00', 'Zephyra', ' 03/14/1980', 'th', 'x12', ' ext 12', '-1', ' (home)', '\n150.00', ' 2020', 'A', ' SYNCLAIM0001', '/SYNMEMBER0042'];
const D = () => String(Math.floor(rnd() * 10));
const randomNumber = () => { const groups = Array.from({ length: 1 + Math.floor(rnd() * 4) }, () => Array.from({ length: 1 + Math.floor(rnd() * 6) }, D).join('')); return groups.map((g, i) => (i === 0 ? g : pick(['-', ' ', '.', '\n', '', '/', ')', '-\n', ', ', '(', ' - ']) + g)).join(''); };
const letter = () => {
  const lab = pick(LABELS) + pick(TAIL);
  const k = rnd();
  let through = '';
  if (k < 0.35) through = pick(MID) + pick(OWN);
  else if (k < 0.55) through = ` ${1 + Math.floor(rnd() * 12)}${pick([':', ')', '', 'st:', ' :', '.'])}`;
  else if (k < 0.65) through = pick(MID) + pick(OWN) + pick(MID) + pick(OWN);
  else if (k < 0.72) through = pick(MID) + pick(OWN) + ` ${1 + Math.floor(rnd() * 9)}:`;
  const number = rnd() < 0.8 ? pick(NUMS) : randomNumber();
  let body = `${lab}${through}${pick(MID)}${number}`;
  const e = rnd();
  if (e < 0.45) body = `${body}${pick(GLUE)}${rnd() < 0.8 ? pick(EXTRA) : randomNumber()}`;
  else if (e < 0.6) body = `${lab}${through}${pick(MID)}${pick(EXTRA)}${pick(GLUE)}${number}`;
  else if (e < 0.7) body = `${pick(EXTRA)}${pick(GLUE)}${body}`;
  else if (e < 0.8) body = `${body}${pick(GLUE)}${pick(LABELS)}${pick(MID)}${pick(NUMS)}`;
  return `${pick(PREFIX)}${body}${pick(SUFFIX)}`;
};
let flips = 0; let unredact = 0; const shown = new Set<string>(); const lines: string[] = [];
const shapeOf = (t: string) => plain(t).replace(/[0-9]+/g, '9').replace(/\p{L}+/gu, 'a').slice(0, 50);
for (let i = 0; i < runs; i += 1) {
  const text = letter();
  const b = outcome(B, text, P, C); const h = outcome(H, text, P, C);
  if (h.threw !== null) { lines.push(`THREW ${show(text)} ${h.threw}`); continue; }
  if (h.refused) continue;
  if (b.refused) { flips += 1; const key = `F${shapeOf(h.sent)}`; if (!shown.has(key) && lines.length < 30) { shown.add(key); lines.push(`FLIP ${show(text, 100)} => ${show(h.sent, 100)}`); } }
  else if (b.threw === null && digitsOf(h.sent).length > digitsOf(b.sent).length) { unredact += 1; const key = `U${shapeOf(h.sent)}`; if (!shown.has(key) && lines.length < 30) { shown.add(key); lines.push(`UNREDACT ${show(text, 90)} => base ${show(b.sent, 70)} head ${show(h.sent, 70)}`); } }
}
for (const l of lines) console.log(l);
console.log(`runs ${runs} seed ${process.argv[3] ?? 1}: flips(base refused, head sent) ${flips}; both sent and head shows more digits ${unredact}`);

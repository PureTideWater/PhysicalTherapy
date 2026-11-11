// node probe2.mts: follow-ups to probe.mts. P1 a Social Security label above a noun, line breaks written "\n" against U+0085 and
// the other breaks; P2 the rate of RULE_LINE's {0,8} (padding 0..14 before the number, after the label, in a cell); P3 the
// guard on a spaced year; P5 DATE_AFTER_REACH against the guard.
import { load, line, outcome } from './lib.mts';
const [H, P, B] = [await load('head'), await load('before'), await load('base')];
const sp = (n: number) => ' '.repeat(n);
const sections: [string, string[]][] = [];
const PAY = '900-12-3456150.00';
const breaks: [string, string][] = [['\\n', '\n'], ['U+0085', '\u0085'], ['U+2028', ' '], ['\\f', '\f'], ['\\v', '\v'], ['\\r\\n', '\r\n']];
sections.push(['P1 a Social Security label above a noun: each layout with every line break (does U+0085 let the noun reach where "\\n" does not?)',
  breaks.flatMap(([, b]) => [
    `SSN${b}Account${b}${PAY}`,
    `SSN${b}Account ${PAY}`,
    `SSN: Account${b}${PAY}`,
    `SSN Account${b}${PAY}`,
    `Patient SSN${b}Claim: ${PAY}`,
    `Social Security${b}Account Number: ${PAY}`,
    `Social Security${b}Account Number${b}${PAY}`,
    `SSN${b}Account${b}Number${b}${PAY}`,
    `SSN${b}Statement${b}#${b}${PAY}`,
    `SSN:${b}Record 900-12-345678`,
    `Member SSN${b}Reference: 90012345601/02/2020`,
  ])]);
sections.push(['P1b the same under "\\n" only: how many lines up the scan reads a Social Security label over a named number', [
  `SSN\nAccount\n${PAY}`, `SSN\nAccount Number\n${PAY}`, `SSN\nAccount\nNumber\n${PAY}`, `SSN\nAccount\nID\nNumber\n${PAY}`,
  `SSN\nAccount\n-------\n${PAY}`, `SSN\nAccount\n-------\nNo. ${PAY}`, `SSN\nAccount:\n\n${PAY}`, `SSN\nRecord\nNo.\n900 12 3456150.00`,
  `Social Security\nAccount\nID\nNumber\n${PAY}`, `Social Security Account\nID\nNumber\n${PAY}`, `Social Security Account\nID\nNumber:\n-----\n${PAY}`,
  `SSN Record\n#\n${PAY}`, `SSN Record\n-----\nNo. ${PAY}`, `SSN / Record\n-----\nNo.\n${PAY}`, `SSN: see Record\n-----\nNo.\n${PAY}`,
]]);
sections.push(['P3 the guard on a spaced year: what follows the year', [
  'DOS,SSN,Billed\n900-12-345601Jan 2020,150.00',
  '900-12-345615-Mar, 2021,2022',
  '202-555-012305MAY 2026,1 unit',
  '900-12-345601 Jan 2020,150.00',
  '900-12-345601Jan-2020,150.00',
  '900-12-345601Jan2020,150.00',
  '900-12-345601Jan, 2020, 150.00',
  '900-12-345601Jan 2020.',
  '900-12-345601Jan 2020. 5 units',
  '900-12-345601Jan 2020.5 units',
  '900-12-345601Jan 2020.01.15',
  '900-12-345601Jan 2020,5',
  'SSN 900.12 345601Jan 2020,2021',
  'SSN 900-12-345601Jan 2020,150.00',
  'Soc. Sec. 900.12 345601-Jan, 2020,150.00',
  'Phone (202) 555-012301Jan 2020,150.00',
  'Row 366-535-16935Nov 2000,150.00',
  'Row 366-535-16935Nov 2000,00',
  'Row 366-535-16935Nov 2000.00',
]]);
sections.push(['P5 DATE_AFTER_REACH (20 characters after the last four) against the guard\'s two characters', [
  'Row 366-535-16901-September, 2000.00',
  'Row 366-535-16901-September., 2000.00',
  'Row 366-535-16901-Sept., 2000.00',
  'Row 366-535-16901September. 2000.00',
  'Row 366-535-16901-September. 2000.00',
]]);
sections.push(['P6 beside the rules this round added (minors)', [
  'Phone:    900 77.3283150.00', 'Phone: 900 77.3283150.00', 'Phone #: 900 77.3283150.00', 'Phone # 900 77.3283150.00',
  'Medicare ID No. 900 12.3456150.00', 'Medicare ID 900 12.3456150.00', 'Phone\u0085900 77.3283150.00', 'Phone\n900 77.3283150.00',
  'Medicare\n   900 12.3456150.00', 'Medicare\n  900 12.3456150.00', 'Phone (cell) 900 77.3283150.00', 'Phone: [900 77.3283150.00',
  'SSN: 90012345601Jan 2020,150.00', 'SSN: 90012345601Jan 2020', '90012345601 Jan 2020', '90012345601Jan\n2020', '9001234560 1Jan 2020', '900123456001Jan 2020', '90012345601JAN.2020', '90012345601Jan  2020', '90012345601Jan , 2020',
  'Provider -+1-202-555-0123150.00', 'Provider: +1-202-555-0123150.00', 'Provider =+1 (202) 555-0123150.00',
  'STATEMENT\n│\nNo. 900-12-3456150.00', 'STATEMENT\n.\nNo. 900-12-3456150.00', 'STATEMENT\n"\n900-12-3456150.00', 'STATEMENT\n(:)\n900-12-3456150.00', 'STATEMENT\n::\n\n900-12-3456150.00',
]]);
let n = 0;
const tally: Record<string, number> = {};
for (const [name, letters] of sections) {
  console.log(`\n## ${name}`);
  for (const text of letters) {
    n += 1;
    const { flags, row } = line(H, P, B, text);
    for (const f of flags) tally[f] = (tally[f] ?? 0) + 1;
    console.log(row.length > 330 ? `${row.slice(0, 330)}...` : row);
  }
}
console.log(`\n${n} letters; flags ${JSON.stringify(tally)}`);

// P2: the rate. One letter per padding; "R" refused, "=" sent unchanged, "c" sent changed; head/before/base.
const mark = (R: any, text: string) => { const o = outcome(R, text); return o.refused ? 'R' : o.text === text ? '=' : 'c'; };
console.log('\n## P2 RULE_LINE {0,8}: padding 0..14, each cell head/before/base');
const shapes: [string, (pad: number) => string][] = [
  ['indent before the number   "Claim\\n-----\\n"+pad+"20260112345.01"', (pad) => `Claim\n-----\n${sp(pad)}20260112345.01`],
  ['blanks after the label     "Claim"+pad+"\\n-----\\n20260112345.01"', (pad) => `Claim${sp(pad)}\n-----\n20260112345.01`],
  ['a padded cell              "| Claim"+pad+" |\\n|"+rule+"|\\n| 20260112345.01 |"', (pad) => `| Claim${sp(pad)} |\n|${'-'.repeat(7 + pad)}|\n| 20260112345.01 |`],
  ['a centred block            pad+"Reference\\n"+pad+"---------\\n"+pad+"802-45-678901.50"', (pad) => `${sp(pad)}Reference\n${sp(pad)}---------\n${sp(pad)}802-45-678901.50`],
];
for (const [name, make] of shapes) {
  const cells: string[] = [];
  for (let pad = 0; pad <= 14; pad += 1) { const t = make(pad); cells.push(`${pad}:${mark(H, t)}${mark(P, t)}${mark(B, t)}`); }
  console.log(`${name}\n    ${cells.join(' ')}`);
}
const NOUNS = ['Claim', 'Reference', 'Invoice', 'Check', 'Policy', 'Account', 'Authorization', 'Case', 'Tracking', 'Confirmation', 'Statement', 'Group'];
const NUMBERS = ['20260112345.01', '802-45-678901.50', '12345678901234.01', '123-45-678901.02'];
const RULES = ['-', '=', '_', '*', '~', '─'];
let [all, headOnly, others] = [0, 0, 0];
for (const noun of NOUNS) for (const num of NUMBERS) for (const rule of RULES) for (const pad of [10, 16, 24, 40]) {
  for (const text of [`${sp(pad)}${noun}\n${sp(pad)}${rule.repeat(noun.length)}\n${sp(pad)}${num}`, `| ${noun}${sp(pad)} |\n|${rule.repeat(noun.length + pad + 2)}|\n| ${num}${sp(Math.max(0, noun.length + pad - num.length))} |`]) {
    all += 1;
    const [h, p, b] = [mark(H, text), mark(P, text), mark(B, text)];
    if (h === 'R' && p === '=' && b === '=') headOnly += 1;
    else if (h !== p || h !== b) others += 1;
  }
}
console.log(`grid: ${NOUNS.length} nouns x ${NUMBERS.length} numbers x ${RULES.length} rules x 4 paddings x 2 layouts = ${all} letters; refused by the head only (before and base send unchanged): ${headOnly}; other differences: ${others}`);

// node probe.mts: hand-built letters aimed at the four hunks of the delta 24ad1075..f2f9f05e, each on head, before and base.
// Flags: BASE-* the head sends more than the base; PHI-* the head sends more than "before"; STAY-* base and before send it
// unchanged and the head does not; newR the head refuses what "before" sent.
import { load, line } from './lib.mts';
const [H, P, B] = [await load('head'), await load('before'), await load('base')];
const NUM = '20260112345.01';
const sp = (n: number) => ' '.repeat(n);
const sections: [string, string[]][] = [];

sections.push(['A hunk 2, RULE_LINE {0,8}: a label, its rule, and a number indented or in a padded cell', [
  `Claim\n-----\n${NUM}`,
  `Claim\n-----\n${sp(8)}${NUM}`,
  `Claim\n-----\n${sp(9)}${NUM}`,
  `${sp(30)}Claim\n${sp(30)}-----\n${sp(30)}${NUM}`,
  `${sp(30)}Reference\n${sp(30)}---------\n${sp(30)}802-45-678901.50`,
  `| Claim |\n|-------|\n| ${NUM} |`,
  `| Claim          |\n|----------------|\n| ${NUM} |`,
  `+-------+\n| Claim |\n+-------+\n| ${NUM} |\n+-------+`,
  `+----------------+\n| Claim          |\n+----------------+\n| ${NUM} |\n+----------------+`,
  `Reference${sp(11)}\n--------------------\n${NUM}`,
  `Invoice\n=======\n${'\t'.repeat(9)}802-45-678901.50`,
  `│ Claim          │\n├────────────────┤\n│ ${NUM} │`,
  `┌────────────────┐\n│ Check          │\n├────────────────┤\n│ ${NUM} │\n└────────────────┘`,
  `| Paid   | Claim          |\n|--------|----------------|\n|        | ${NUM} |`,
  `Claim:\n-----\n${sp(12)}${NUM}`,
  `Claim Number\n------------\n${sp(12)}${NUM}`,
  `Your claim\n**********\n${sp(12)}${NUM}`,
  `Tracking\n________\n${sp(10)}802-45-678901.50`,
  `Claim\n${sp(12)}${NUM}`,
]]);

sections.push(['B hunk 1, "+" beside other things than a dash or "="', [
  `+*******+\n| Claim |\n+*******+\n| ${NUM} |`,
  `+~~~~~~~+\n| Claim |\n+~~~~~~~+\n| ${NUM} |`,
  `+_______+\n| Claim |\n+_______+\n| ${NUM} |`,
  `+───────+\n│ Claim │\n+───────+\n│ ${NUM} │`,
  `+ - - - - +\n| Claim |\n+ - - - - +\n| ${NUM} |`,
  `| Claim |\n+ ----- +\n| ${NUM} |`,
  `Claim\n-----+\n${NUM}`,
  `Claim +${NUM}`,
  `Claim: + ${NUM}`,
  `Invoice (+) ${NUM}`,
  `Claim |+| ${NUM}`,
  `Claim\n+−−−−−+\n${NUM}`,
  `Claim ___│___ ${NUM}`,
  `Claim __│__ ${NUM}`,
  `Claim ─_─ ${NUM}`,
]]);

const BLANKS = ['', ' ', '\t', '\u00A0', '\u2003', '\u3000', '\u1680', '\u202F', '\u205F', '\u200A', '\u200B', '\uFEFF', '\u00AD', '\u2060', '\u180E', '\u2800', '\u3164', '\u115F', '\u001F', '\u007F', '\u061C', '\u200E', '\u034F', '\u2063', '\u0085', '\u001C', '\u0008', '\u00A0 \u00A0'];
sections.push(['C hunk 2, BLANK_LINE: a line that looks blank inside a three-line label (control: a true blank line is refused)', [
  ...BLANKS.map((x) => `STATEMENT\n${x}\nNo. 900-12-3456150.00`),
  ...BLANKS.slice(3).map((x) => `REMITTANCE ADVICE\r\n${x}\r\nID: 202-555-0123150.00`),
]]);

sections.push(['D hunk 3, the guard on a spaced year (a point or comma and a digit after it)', [
  '900-12-345601Jan 2020',
  '900-12-345601Jan 2020.50',
  '900-12-345601Jan 2020,150.00',
  '900-12-345601Jan 2020,150.00,120.00,30.00',
  '900-12-345601-Jan, 2020,150.00',
  '900-12-345601Jan 2020,2021',
  '900-12-345601Jan 2020.1',
  '900-12-345614 Mar 2020,150.00',
  '202-555-012301Jan 2020,150.00',
  '202-555-012301Jan 2020',
  '(202) 555-012301Jan 2020,150.00',
  '(202) 555-012301Jan 2020',
  'SSN 900.12 345601Jan 2020',
  'SSN 900.12 345601Jan 2020,150.00',
  'SSN 900.12 345601Jan 2020.50',
  'SSN 900.12 345601Nov 2000.00',
  'Medicare 900.12 345601Jan 2020',
  'Medicare 900.12 345601Jan 2020,150.00',
  'Medicare ID 900.12 345601Nov 2000.00',
  'Tel 250.75 123401Jan 2020',
  'Tel 250.75 123401Jan 2020,150.00',
  'Phone 202.555 012301Jan 2020,150.00',
  'Medicare rate 900 12.345601Jan 2020',
  'Medicare rate 900 12.345601Jan 2020,150.00',
  'Contact: Billing 900.12 345601Jan 2020,150.00',
  '90012345601Jan 2020',
  '90012345601Jan 2020,150.00',
  '90012345601Jan 2020.50',
  'SSN: 90012345601Jan 2020,150.00',
  'SSN: 90012345601Jan, 2020.5',
  '202555012301Jan 2020,150.00',
  '900-12-345601Jan 2020,150.00\nService 01/01/2020-150.00 Paid',
]]);

sections.push(['E hunk 4, right after a phone word or Medicare (recorded family first, then what stands beside it)', [
  'Medicare 110 32.74420',
  'Medicare 110 32.7442',
  'Medicare allowed 110 32.74420',
  'Units Rate Medicare\n110 32.74420',
  'Paid by Medicare.\n110 32.74420 97110',
  'TTY: 711 12.34567',
  'Call 800 55.51234 today',
  'Contact 123 45.67890 units',
  'Medicare (110 32.74420)',
  'Medicare - 110 32.74420',
  'Medicare ID 110 32.74420',
  'Tel. 250 75.123456',
  'Phone:\n  250 75.123456',
  'Cell 110 32.74420',
  'Medicare 110  32.74420',
  'Medicare 110 - 32.74420',
  'Medicare 110 32 .74420',
  'Medicare 110 32. 74420',
  'Non-Medicare 110 32.74420',
  'Medicare: 2026 110 32.74420',
  'Medicare 97110 32.74420',
  'Medicare 110 2 32.74420',
  'Medicare\n\n110 32.74420',
  'Medicare:    110 32.74420',
  'Medicare ID No. 110 32.74420',
  'Phone #: 110 32.74420',
  'Phone\u0085110 32.74420',
  'Phone\u2028110 32.74420',
  'Fax\f250 75.123456',
  'Medicare ID No. 900 12.3456150.00',
  'Phone #: 900 77.3283150.00',
  'Phone:    900 77.3283150.00',
  'Phone\u0085900 77.3283150.00',
  'Phone\n\n900 77.3283150.00',
  'Medicare\n   900 12.3456150.00',
]]);

sections.push(['E2 hunk 3, a bare eleven to fourteen and a month word with a year-like number (recorded: "Seq 12345678901Jan 2026")', [
  'Seq 12345678901Jan 2026',
  'Claim 12345678901Jan 2026',
  'Seq 12345678901Jan 2000.00',
  'Seq 12345678901Jan 2000,00',
  'Row 12345678931Dec 2000 units',
  'Seq 123456789012Mar 2026',
  'Seq 1234567890123Jan 2026',
  'Seq 12345678901234Jan 2026',
  'Ref. 12345678901.May 2026 statement',
  'Seq 12345678901May 2026-01',
  'Seq 12345678945Jan 2026',
  'Seq 12345678901Jan  2026',
  'Seq 12345678901Jan-.2026',
  'Seq 12345678901Jan 20260112.50',
]]);

sections.push(['F hunks 1 and 2 under a person label, and with the call\'s own identifiers (is the base stricter anywhere?)', [
  'Phone\nStatement\n#\n202 555 0123150.00',
  'Phone:\nStatement\n#\n202-555-0123150.00',
  'Fax\nAccount\nID\nNumber\n202-555-0123150.00',
  'Phone\nAccount\n-------\nNo. 202-555-0123150.00',
  'Phone\nAccount\n-------\nNo. (202) 555-0123150.00',
  'Tel\n│ Account │ 202-555-0123150.00',
  'Phone │ Account │ 202-555-0123150.00',
  'Phone | Account | 202-555-0123150.00',
  'Phone │ Account │ 202 555 0123150.00',
  'Phone | Account | 202 555 0123150.00',
  'Phone\u0085Account\u0085202-555-0123150.00',
  'SSN\nStatement\n#\n900-12-3456150.00',
  'SSN\nCertificate\nNumber\nID #:\n900-12-3456150.00',
  'SSN on file\nAccount\nID\nNumber\n900-12-3456150.00',
  'Social Security\nAccount\nID\nNumber\n900-12-3456150.00',
  'SSN │ Account │ 900-12-3456150.00',
  'SSN | Account | 900-12-3456150.00',
  'SSN\u0085Account\u0085900-12-3456150.00',
  'SSN\u0085\u0085Account\u0085900-12-3456150.00',
  'Medicare\nAccount\nID\nNumber\n900-12-3456150.00',
  'Medicare ID\nRecord\n#\n900-12-3456150.00',
  'Member SSN\nRecord\n:\n900-12-3456150.00',
  'Patient SSN\n-----\nRecord\n-----\nNo. 900-12-3456150.00',
  'SSN\nRecord\nNo.\n900 12 3456150.00',
  'Member\nID\nNumber\nZZ7654321150.00',
  'Claim\n#\nSYNCLAIM0001150.00',
  'Claim Number │ SYNCLAIM000120260112345.01',
  'Member ID │ ZZ76543219001234561.50',
  'STATEMENT\n#\nJane Zephyra 900-12-3456150.00',
  'STATEMENT\n#\n900-12-34567\nService 01/01/2020-150.00 Paid',
  'Claim Number │ 900-12-34567\nService 01/01/2020-150.00 Paid',
  'Account\nID\nNumber\n202-555-01234\nService 01/01/2020-150.00 Paid',
  'Phone\nAccount\nID\nNumber\n202-555-01234\nService 01/01/2020-150.00 Paid',
]]);

sections.push(['G hunk 1, "+" after a dash or "=" before a phone\'s own digits', [
  'Provider: +1-202-555-0123150.00',
  'Provider -+1-202-555-0123150.00',
  'Provider: =+1-202-555-0123150.00',
  'Provider — +1-202-555-0123150.00',
  'Provider —+1-202-555-0123150.00',
  'Claim -+ 900-12-3456150.00',
  'Claim +- 900-12-3456150.00',
  'Claim + 900-12-3456150.00',
  'Claim +-+ 900-12-3456150.00',
  'Fax -+1-202-555-0123150.00',
]]);

let n = 0;
const tally: Record<string, number> = {};
for (const [name, letters] of sections) {
  console.log(`\n## ${name}`);
  for (const text of letters) {
    n += 1;
    const { flags, row } = line(H, P, B, text);
    for (const f of flags) tally[f] = (tally[f] ?? 0) + 1;
    console.log(row.length > 420 ? `${row.slice(0, 420)}...` : row);
  }
}
console.log(`\n${n} letters; flags ${JSON.stringify(tally)}`);

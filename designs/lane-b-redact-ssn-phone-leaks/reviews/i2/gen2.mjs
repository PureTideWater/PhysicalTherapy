// node gen2.mjs: the letters of the findings, one JSON string per line, for /home/user/work/cmp.mts
import fs from 'node:fs';
const c = (n) => String.fromCharCode(n);
const [H, V, L, R, TL, TR, BL, BR, DH, DV, DL, DR] = [0x2500, 0x2502, 0x251c, 0x2524, 0x250c, 0x2510, 0x2514, 0x2518, 0x2550, 0x2551, 0x2560, 0x2563].map(c);
const cell = (W) => `| ${'Claim Number'.padEnd(W - 2)} |\n|${'-'.repeat(W)}|\n| ${'20260112345.01'.padEnd(W - 2)} |`;
const letters = [
  'Claim\n#\n20260112345.01\nDate of\nService\n01/15/2026\nAmount\nPaid\n150.00',
  'Claim\n#:\n12345678901234.01',
  '| Invoice |\n|:--------|\n| 802-45-678901.50 |',
  '| Claim |\n|:-----:|\n| 20260112345.01 |',
  '| Claim # |\n|:--------|\n| 20260112345.01 |',
  '| Claim Number |\n|:-------------|\n| 20260112345.01 |',
  'Statement\n#########\n802-45-678901.50',
  'Member\nID\nNumber\n802-45-678901.50',
  'Remittance\nAdvice\nNumber\n12345678901234.01',
  'Account\nID\nNo.\n20260112345.01',
  'STATEMENT\n---------\nID: 12345678901234.01',
  `${V} Claim Number ${V}\n${L}${H.repeat(14)}${R}\n${V} 20260112345.01 ${V}`,
  `${TL}${H.repeat(7)}${TR}\n${V} Claim ${V}\n${L}${H.repeat(7)}${R}\n${V} 20260112345.01 ${V}\n${BL}${H.repeat(7)}${BR}`,
  `${DV} Claim Number ${DV}\n${DL}${DH.repeat(14)}${DR}\n${DV} 20260112345.01 ${DV}`,
  `Claim Number\n${H.repeat(12)}\n20260112345.01`,
  `| Claim Number |\n|${H.repeat(14)}|\n| 20260112345.01 |`,
  'Claim Number\n_ _ _ _ _ _\n20260112345.01',
  'Claim Number\n____________\n20260112345.01',
  'Claim Number: __ 20260112345.01',
  'Acct.\n-----\n802-45-678901.50',
  'Acct\n-----\n802-45-678901.50',
  cell(57), cell(58),
  'Medicare rate 110 32.744201Jan 2026',
  'Medicare rate 110 32.74420 Jan 2026',
  'Lot 361-102-35375SEP 2026',
  'Row 366-535-16935Nov 2000.00',
  'Unit 398-272-12393MAY 1999 units',
  'Dear Jane Zephyra, member ZZ7654321, claim SYNCLAIM0001 paid 150.00 on 01/15/2026.',
  `IMPORTANT NOTICE\n${'_'.repeat(44)}\nClaim Number: 20260112345.01`,
  `We have reviewed your appeal.\n${H.repeat(44)}\nPolicy 01-23456-78-9012`,
  `Please keep this notice.\n${'_'.repeat(44)}\nClaim Number: 20260112345.01\nDate of service: 01/15/2026\nPaid: 150.00`,
];
fs.writeFileSync('/home/user/review-i2/cmp2.jsonl', letters.map((t) => JSON.stringify(t)).join('\n') + '\n');
console.log(letters.length, 'letters');

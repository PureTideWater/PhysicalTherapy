// node gen3.mjs: the same layouts in a held letter (a range of two kinds glued) with a plain dashed number, and controls
import fs from 'node:fs';
const HELD = 'Service 01/01/2020-150.00 Paid\n';
const letters = [
  'Claim\n#\n802-456-78901',
  `${HELD}Claim\n#\n802-456-78901`,
  `${HELD}Claim # 802-456-78901`,
  `${HELD}Claim\n802-456-78901`,
  `${HELD}| Claim |\n|:------|\n| 802-456-78901 |`,
  `${HELD}| Claim |\n|-------|\n| 802-456-78901 |`,
  `${HELD}Member\nID\nNumber\n123-45-67890`,
  `${HELD}Member\nID Number\n123-45-67890`,
  `${HELD}Invoice\n-------\nNo. 802-456-78901`,
  `${HELD}Invoice No.\n-------\n802-456-78901`,
  `${HELD}Statement\n#########\n802-456-78901`,
  '| Claim |\n|:------|\n| 20260112345.01 |\n| 20260112346.01 |',
  '| Claim |\n|-------|\n| 20260112345.01 |\n| 20260112346.01 |',
  'Claim\n#\n20260112345.01\nClaim\n#\n20260112346.01',
  'Claim:\u0085\u008520260112345.01'.replace(/\\u0085/g, String.fromCharCode(0x85)),
  `Claim:${String.fromCharCode(0x85)}20260112345.01`,
  `Claim: 20260112345.01`,
];
fs.writeFileSync('/home/user/review-i2/cmp3.jsonl', letters.map((t) => JSON.stringify(t)).join('\n') + '\n');
console.log(letters.length, 'letters');

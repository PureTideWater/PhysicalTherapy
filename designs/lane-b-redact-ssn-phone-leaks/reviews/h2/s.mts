// TREES=head,before,base,v1 node s.mts: last checks (a filler word on the number's line, ON ... FILE at a line's start, rates for the Medicare branch and for the second reading under a glued label).
import { out, rng, pick, int, digits } from './lib2.mts';
const LET: [string, boolean?][] = [
  ['Statement\n\n\n\n802-45-678901.50'], ['ID: 802-45-678901.50'], ['Statement\n\n\n\nID: 802-45-678901.50'], ['Claim\n\n\n\nLine: 802-45-678901.50'], ['REMITTANCE ADVICE\n\n\n\nNo. 900-12-3456150.00'], ['REMITTANCE ADVICE\n\n\n\n900-12-3456150.00'], ['Statement\n\nNumber 802-45-678901.50'],
  ['File Number: 12345678901234.01'], ['This notice is based on\nFile Number: 12345678901234.01'], ['Auto-pay: ON\nFile No. 802-45-678901.50'], ['Account number on-file: 802-45-678901.50'], ['Account number on file: 802-45-678901.50'],
  ['Claim Number:\n____________\n20260112345.01'], ['Check Number ____________ 12345678901234.01'], ['Claim Number    DOS    Billed\n------------------------------\n20260112345.01    01/15/2026    150.00'], ['Claim Number\n------------\n20260112345.01    01/15/2026    150.00'],
  ['under section 1833 of the Social Security Act. Medicare rate 110 32.74420'], ['Medicare rate 110 32.74420 under the Social Security Act.'], ['Social Security and Medicare 110 32.7442'], ['SSN: Medicare rate 97110 32.74420'],
  ['MemberSSN 8 1234567893.1', true], ['Assoc. Sec. 8 1234567893.1', true], ['Assoc. Sec. 8 1234567893.12', true], ['MemberSSN: 150.00 120.00 30.00', true],
];
for (const [text, v1] of LET) console.log(`${JSON.stringify(text)}\n     head: ${out('head', text)} | before: ${out('before', text)} | base: ${out('base', text)}${v1 ? ` | head, no 2nd reading: ${out('v1', text)}` : ''}`);
type R = () => number;
const tally = (title: string, n: number, gen: (r: R) => string, v1 = false) => {
  const r = rng(909 + title.length * 7919);
  let base = 0, head = 0, before = 0, second = 0; let ex = '';
  for (let i = 0; i < n; i += 1) {
    const text = gen(r);
    const b = out('base', text); if (b === 'REFUSED') continue; base += 1;
    const h = out('head', text); const bf = out('before', text);
    if (bf !== b) before += 1;
    if (h !== b) { head += 1; if (v1 && out('v1', text) === b) second += 1; if (ex === '') ex = `${JSON.stringify(text)} head ${h}, before ${bf}, base ${b}`; }
  }
  console.log(`## RATE ${title}: ${n} letters, base sends ${base}; head refuses ${head} (${((100 * head) / Math.max(1, base)).toFixed(0)}%), before ${before}${v1 ? `; of head's, sent with no 2nd reading ${second}` : ''}\n     ${ex}`);
};
const num = (r: R) => `${100 + int(r, 900)} ${10 + int(r, 90)}.${digits(r, 5, false)}`;
const WORD = ['rate', 'fee', 'allowed', 'factor', 'paid', 'amount'];
tally('Medicare + a word + "ddd dd.ddddd", a Social Security label within reach before it', 300, (r) => `${pick(r, ['of the Social Security Act.', 'Social Security Act.', 'SSN on file.', 'Soc. Sec. Act;', 'Social Security and', 'SSN:'])}${pick(r, [' ', ' ', '\n'])}Medicare ${pick(r, WORD)} ${num(r)}`);
tally('the same with no Social Security label (control)', 300, (r) => `${pick(r, ['Per the fee schedule.', 'See the notice.', ''])} Medicare ${pick(r, WORD)} ${num(r)}`.trim());
tally('the same, the label further back than 24 characters (control)', 300, (r) => `${pick(r, ['Social Security Act, as amended in 2026.', 'SSN on file with the plan sponsor.'])} Medicare ${pick(r, WORD)} ${num(r)}`);
tally('a label only head reads (glued, or "Assoc. Sec.") + a digit + ten digits from 1 + one decimal', 300, (r) => `${pick(r, ['MemberSSN', 'PatientSSN', 'InsuredSSN', 'Assoc. Sec.', 'Assoc Sec', 'SubscriberSSN No.'])}${pick(r, [' ', ': '])}${1 + int(r, 9)} 1${digits(r, 9, false)}.${1 + int(r, 9)}`, true);
tally('the same under a label both trees read (control)', 300, (r) => `${pick(r, ['Member SSN', 'Telephone number', 'Cell number'])}${pick(r, [' ', ': '])}${1 + int(r, 9)} 1${digits(r, 9, false)}.${1 + int(r, 9)}`, true);

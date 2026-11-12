// Review C-TIME: every crafted row of denial-letter.test.ts lines 332 to 481, as a function of the length it is filled to (n = 100,000 is the test's row,
// but for the few rows the test writes a few characters past 100,000: here every letter is at most 100,000 characters).
import { F, type Row } from './lib.mts';
const J = ['JANE Q VANTREE'];
const HELD = 'Paid $0,000.00. Service 01/01/2020-01/02/2020Paid $0,000.00. ';
const SIX = ['SIMONE VANTREE', 'ZEPHYRA BELLO', 'JUNE ORLANDO'];
const fill = (id: string, unit: string, names: string[] = J, more: Partial<Row> = {}): Row => ({ id, names, build: (n) => F(unit, n), note: JSON.stringify(unit), ...more });
const held = (id: string, unit: string, names: string[] = J, tail = ''): Row => ({ id, names, build: (n) => `${HELD}${F(unit, n - HELD.length - tail.length)}${tail}`, note: `HELD+${JSON.stringify(unit)}+${JSON.stringify(tail)}` });
export const ROWS: Row[] = [
  // first list (line 332)
  { id: 'r01', names: J, build: (n) => `Vantree${' '.repeat(Math.floor(n / 50))}x${' J'.repeat(Math.floor(n * 0.49))}`, note: 'gap after a name, initials past it' },
  { id: 'r02', names: J, build: (n) => `Vantree${' '.repeat(n - 20)}x J`, note: 'gap as long as the letter' },
  fill('r03', '1/1/11 '), fill('r04', '1 1 11 '),
  { id: 'r05', names: J, intrinsic: true, build: (n) => `${F('1/1/11 ', n - 8)}Vant ree`, note: 'slashes + Vant ree' },
  { id: 'r06', names: J, intrinsic: true, build: (n) => `${F('1 1 11 ', n - 9)}Vant. ree`, note: 'spaces + Vant. ree' },
  fill('r07', 'V a n t r e e ', J, { intrinsic: true }),
  { id: 'r08', names: J, intrinsic: true, build: (n) => `Vant ree${' J'.repeat(Math.floor((n - 8) / 2))}`, note: 'Vant ree + initials' },
  fill('r09', 'V a n t r e ', J),
  { id: 'r10', names: J, asIsOnly: true, build: (n) => `${F('1 1 11 ', n)}\r\n`, note: 'test row: spaces + CR LF (100,002 characters as the test writes it)' },
  fill('r11', '5\r\n'),
  { id: 'r12', names: J, asIsOnly: true, build: () => `${F('1 1 11 ', 100_000 / 2 - 10)}\r\nVant ree`, note: 'test row at the bound' },
  { id: 'r13', names: J, asIsOnly: true, build: () => `${'5\r\n'.repeat(Math.floor((100_000 - 16) / 5))}Vant ree`, note: 'test row at the bound' },
  fill('r14', '1-1-11 555001 ', ['JANE VANTREE'], { claims: ['555001'] }),
  fill('r15', '(202) 555-0123 '), fill('r16', '900-12-3456 '), fill('r17', '202 555 0123 '),
  { id: 'r18', names: J, build: (n) => '9'.repeat(n), note: 'digit run' },
  fill('r19', '5-'), fill('r20', '5​'), fill('r21', '900123456 '), fill('r22', 'Phone 900123456 '), fill('r23', '5\n    '), fill('r24', '5--\n  '),
  fill('r25', '5\n'), fill('r26', '1\r\n'), fill('r27', '5-\n'), fill('r28', '$150.00 2026-11-01 '), fill('r29', '10/01/2026-10/15/2026 '), fill('r30', '150.00-120.00 '),
  { id: 'r31', names: J, build: (n) => `Claims 900123456${F(' and 900123457', n - 16)}`, note: 'list after a keep-noun' },
  fill('r32', 'Service 01/01/2020-01/02/2020Paid '),
  { id: 'r33', names: J, build: (n) => `${'a'.repeat(n - 2)}1a`, note: 'one word glued to a digit' },
  fill('r34', 'Service 01/01/2020-01/02/2020St. '),
  // third list (line 410)
  { id: 'r40', names: ['ZZ ZZZ ZZZZ ZZZZZ', 'ZZ-ZZ ZZZ', 'ZZZZZZ ZZ'], build: (n) => `1${'Z'.repeat(n - 2)}1`, note: 'Z run, parts held' },
  { id: 'r41', names: ['ZQ ZZQ ZZZQ', 'QZ'], build: (n) => `1${'Z'.repeat(n - 2)}1`, note: 'Z run, no part' },
  { id: 'r42', names: ['AB BA'], build: (n) => `1${F('aB', n - 1)}`, note: 'camel run' },
  fill('r43', 'xMar 3, 1961', ['MAY MARCH']), fill('r44', '3/3/61150.00 '), fill('r45', '01/01/2020-150.00 '), fill('r46', '1/1/20-1.00Ja ', ['JA Q ZE']),
  fill('r47', 'Billed 01/01/2020-150.00-120.00 1.00 '), fill('r48', '01/01/2020-150.00-PaidSSN 9 '), fill('r49', 'Seen 01/01/2020-150.00Paid in full ', ['AL MAY Q']),
  fill('r50', 'Paid $0,000.00. Service 01/01/2020-01/02/2020Paid $0,000.00 1 2 '),
  { id: 'r51', names: J, build: (n) => `Seen 01/01/2020-150.00Paid${'X'.repeat(n - 30)}-a1`, note: 'held range glued to X run' },
  { id: 'r52', names: J, build: (n) => `Seen 01/01/2020-150.00${'x'.repeat(n - 30)}-a1`, note: 'held range glued to x run' },
  fill('r53', '1Daniel Le ', ['DANIELLE LE']), fill('r54', '1Dan Le ', ['DANIELLE LE']), fill('r55', 'DOB on file 01/01/2020-150.00 '),
  { id: 'r56', names: J, build: (n) => `${HELD}${F('Mar. ', (n - 100) / 2)} filler words here and there. ${F('1961/', (n - 100) / 2)}`, note: 'month words then years' },
  { id: 'r57', names: J, build: (n) => `${HELD}${F('1961/', (n - 100) / 2)} filler words here and there. ${F('March ', (n - 100) / 2)}`, note: 'years then month words' },
  held('r58', 'A Lx 61-03-0 on 6103134 ', ['AL Q VANTREE']), held('r59', 'A Lx 61-03-0 on 6103134 ', ['AL Q VANTREE'], 'ref 6103034'),
  held('r60', '61 03 04 Mar 6104 on 610304 on '), held('r61', '03/03/1961 5 '), held('r62', 'PaidDOBon file, see the enclosed record. '),
  held('r63', 'JX QQ VXJ 61  /  03  /  04 Mar     6104     '), held('r64', 'JJJJJJJJ QQQQXVVVVVV XJXQXVX '), held('r65', '03/03/1961  /     5     '),
  fill('r66', '9-10am Al 3rd-4th 30min Al 97110AM Al ', ['AMAL AL HASSAN']),
  { id: 'r67', names: J, build: (n) => `Service 01/01/2020${F('-150.00-01/01/2020', n - 18)}`, note: 'one held range' },
  { id: 'r68', names: J, build: (n) => `${F('01/01/2020-150.00-', n - 14)}01/01/2020Paid`, note: 'one held range glued to a word' },
  held('r69', 'S1MONXVANTR3XZ3PHYRXB3LLXORLANDXZZ12345X7SYN5550X1', SIX), held('r70', 'S1MONXVANTR3XZ3PHYRXB3LLXORLANDXZZ12345X7SYN5550X1', SIX, 'S1MONE'),
  held('r71', 'Seen 3-III-1962 and III/13/1962, March the 13th, 4th of March; ref 6134 and 61304 on file, March nineteen sixty-two. '),
  held('r72', 'Seen 3-III-1962 and III/13/1962, March the 13th, 4th of March; ref 6134 and 61304 on file, March nineteen sixty-two. ', J, '3-III-1961'),
  fill('r73', 'Phone 1: 555-0100, '), fill('r74', 'Call Vantree at 555-0123/555-0124 '), fill('r75', 'SY 55 50 0l x '), fill('r76', 'PaidXXX - XX - 345 '),
];

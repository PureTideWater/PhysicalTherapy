// node a.mts: letters aimed at the delta (plain and inside a held letter); prints those the base sends unchanged and the head does not, or where head differs from before.
import { three, HELD, fmt, JANE, MAYA } from './lib.mts';
const T0 = Date.now();
console.log('sanity:', JSON.stringify(three('Thank you for your letter.')), JSON.stringify(three(HELD + 'Thank you.')));
function section(title: string, letters: readonly string[], opts: { held?: boolean; patient?: any; showAll?: boolean } = {}) {
  const variants: string[] = [];
  for (const l of letters) {
    variants.push(l);
    if (opts.held !== false) variants.push(HELD + l);
  }
  let fresh = 0;
  const lines: string[] = [];
  for (const v of variants) {
    const t = three(v, opts.patient ?? JANE);
    const isNew = t.base === 'same' && t.head !== 'same';
    const delta = t.head !== t.before;
    if (isNew) fresh += 1;
    if (opts.showAll || isNew || delta) lines.push(`  ${isNew ? 'NEW ' : '    '}${delta ? 'D ' : '  '}${fmt(v, t)}`);
  }
  console.log(`\n## ${title}: ${variants.length} letters; base same and head not: ${fresh}  [${Date.now() - T0}ms]`);
  for (const l of lines) console.log(l);
}
section('A1 noun two lines above (blank line, rule, wrapped header)', [
  'Claim Number:\n20260112345.01', 'Claim Number:\n\n20260112345.01', 'Claim Number:\r\n\r\n20260112345.01', 'Claim Number:\n \n20260112345.01',
  'ICN\n\n12345678901234.01', 'ICN\n-----------------\n12345678901234.01', 'Claim\nNumber\n20260112345.01', 'Reference\nNumber:\n20260112345.01 processed 01/15/2026',
  'Reference Number\n================\n20260112345.01', 'Claim No. | Reference\n----------|----------\n20260112345.01 | 20260112346', 'Your reference number is\n\n20260112345.01 and it was paid.',
  'Member ID:\n\n802-45-678901', 'Policy Number\n\n802-456-78901', 'Case No.\n\n123-45-678901-02', 'Case\nNo.\n123-45-678901-02', 'Control Number\n--------------\n802-45-678901', 'Member ID:\n802-45-678901', 'Claim Number\f\n20260112345.01',
  'Check\nNumber\n12345678901.50', 'Invoice No.\n\n12345678901.50',
]);
section('A1/B on file, advice, SSN label windows (logic)', [
  'Phone on file: 202-555-0123150.00', 'Phone on-file: 202-555-0123150.00', 'Phone on\nfile: 202-555-0123150.00', 'Phone on   file: 202-555-0123150.00', 'Phone ON FILE NO. 202-555-0123150.00',
  'SSN Account 802-45-678901.50', 'SSN 01/02/2020 Account 802-45-678901.50', 'SSN (Jane Zephyra) Account 802-45-678901.50', 'SSN: Jane Zephyra, Account 802-45-678901.50', 'SSN 1: Account 802-45-678901.50',
  'Payment Advice No. 20260112345.01', 'Remittance\nAdvice No. 20260112345.01', 'Remittance Advice No. 20260112345.01', 'Number on file 802-45-678901', 'Account on file: 20260112345.01',
  'under section 1862(b)(2) of the Social Security Act (42 U.S.C. 1395y(b)(2)).', 'Title XVIII of the Social Security Act, 42 CFR 405.980-405.986', 'Social Security Act 1862-45-678901',
]);
section('A2 year glued before', [
  'Dismay 2026011-22-3333', 'CODEC 2026011-22-3333', 'Items 3 - 5 - 2026011-22-3333', 'Sec. 2.1. 2026011-22-3333', 'Line 2 / 3 / 2026011-22-3333', 'Seen 2026011-22-3333', 'Order 2026011-22-3333',
  'You may 2026011-22-3333', 'Summary 2026011-22-3333', 'mar 2026011-123-4567', 'Qty 1/2026011-123-4567', 'Version 1.2.2026011-123-4567', 'Stage 3 2026011-22-3333', '1st 2026011-22-3333', 'Step 2 of 2026011-22-3333',
  '12 2026011-22-3333', 'Rev 0420 2026011-22-3333', 'Unit 5,2026011-22-3333', 'Days 30/2026011-22-3333',
]);
section('A3 bare run and a date after: pipes, underscores, backslashes, month words', [
  '12345678901|2|2026-01-15|97110|150.00', 'Claim|Line|DOS\n12345678901|2|2026-01-15', '12345678901|02|2026', '12345678915|1|20260115|97110', '1234567892026|1|150.00', '12345678912026|3|20.00',
  'ERA_12345678901_01_2026.pdf', 'claims_12345678901_02_2026.csv', '\\\\fs01\\era\\12345678901\\01\\2026\\remit.pdf', '12345678901~02~2026', '12345678901,2,2026-01-15', '12345678901\t2\t2026-01-15', '12345678901 | 2 | 2026-01-15',
  '12345678945|2|2026-01-15', '123456789012|2|2026-01-15', '12345678901|2|01/15/2026', 'ICN|12345678901|2|2026-01-15', '12345678901.02.20261', '12345678901-02-20260115',
]);
section('A3 a month-word date after a dashed reference (DATE_GLUED_AFTER third alternative)', [
  '802-45-678901 Jan 15, 2026 97110 150.00', '123-456-78905 March 3, 2026', '001-420-97116 Jan 15, 2026', 'Line (001) 420-97116 Jan 15, 2026 150.00', '(001) 420 97116 Jan 15, 2026', 'Claim 802-45-678901 Jan 15, 2026',
  '802-45-678901 Dec 12', '802-45-678945 Jan 15', '802-45-67890 Jan 15', '802-45-678901 may 30 days', '802-45-678901, Jan 15, 2026', '802-45-678901\tJan 15, 2026', '802-45-678901  Jan 15, 2026', '802-45-678901 on Jan 15, 2026',
  'Web ID 802-456-78901 Sep 30, 2026', 'Your appeal 802-45-678912 Mar 20 was received.', 'Line (001) 420-97110 Jan 15, 2026', '(002) 420-97112 Feb 12, 2026 2 150.00',
]);
section('A4 digits, currency or a date before a mask; underscores', [
  'Check No. 1234___ __ 2026', 'Units 120___-__-2026', 'Total $150___ __ 2026', 'Qty 100*** ** 2026', 'Rate 150### ## 2026', 'Paid 150.00 ___ __ 2026', 'Amount 150___ __ ____', 'Initials 123___ __ 2026', 'Group 12345___.__.2026',
  'Acct 12XXX-XX-1234', 'Acct $4XXX-XX-1234', 'Card 4111XXXX XXXX 1234', 'Paid $150_____2026', 'DOS 2020-01-02_____2026', 'Total $1,500*****1234', 'Ref 2026-01-15XXXXX1234', 'Sign 01/15/2026___ __ 2026', 'Date 2026___-__-2026',
  'Member 987XXX XX 1234', 'ID 987***.**.1234', 'Dx M54.50XXX-XX-1234', '97110 x 2___ __ 2026',
]);
section('A5 list numbers, times after a phone word, parentheses, cents', [
  'Call 8:00 a.m. to 5:00 p.m. CT', 'Telephone: 8:00 a.m. - 4:30 p.m.', 'Call\n8:00 a.m. to 5:00 p.m.', 'Please call\n1) Member Services 97110 97140', 'Ways to contact:\n1) 150.00 120.00 30.00', 'by phone\n2) Billed 150.00 120.00 30.00',
  'Questions? Call\n1: 150.00 120.00 30.00', 'Telephone calls (2) 30.00 60.00', 'Phone\n1) 97110 97140 97530', 'Contact\n2) Springfield, IL 62701-1234', 'You may call\n1) 01/15/2026 97110 150.00 120.00', 'Fax\n2) PO Box 30555, Salt Lake City, UT 84130-0555',
  'Calls (12) 97110 97140', 'Contacts (2) 150.00 120.00 30.00', 'Phones 8:30 - 5:00 123 4567', 'Call 7:30 - 5:30 555 0100', 'Tel (1) 97110 97140 97530', 'Call (2nd) 150.00 120.00 30.00',
  'Adjustments (120) 300 15000.00', '(123) 456 78901 Jan 15', 'Net (150)\n200-30001.50', '(100) 200-30001.50', 'Units (120) 300-45001/15/2026', 'Line (001)420-97110', 'Line (001) 420-97110', 'Line ( 001 ) 420-97110',
  '12345678901.50/120.00', '20260112345.01/02/2026', '12345678901.01-1.2.2020', '802-45-678901.50/60', '802-45-678901.50/1/15/2026',
]);
section('A5 May at a line end, ordinal on the next line (patient born 1980-05-14)', [
  'Benefits may\n14th Street office', 'You may\nthe 14th day after this notice appeal.', 'Coverage may\n14th', 'You may\n14 days', 'Payment may,\n14th of each month, be issued.',
], { patient: MAYA });
console.log(`\n[${Date.now() - T0}ms total]`);

// node findings.mts [ids]: the letters of each finding and their controls, on head, before and base.
import { judge, digitsOnly } from './lib.mts';
const H = 'Service 01/01/2020-150.00 Paid\n';
const sp = (n: number) => ' '.repeat(n);
export const FINDINGS: Record<string, string[]> = {
  'G1-1 listNumberAt in survivorIn': ['Phone (20) 2555 0123', 'Tel (20) 2555-0123', 'Phone: (20) 2555-0123', 'Fax 20) 2555 0123', 'Phone\n(20) 2555 0123', 'Phone numbers ( 20 ) 2555 0123', 'Dear Member,\nQuestions? Tel (20) 2555-0123\nThank you.', 'Phone (20) 2555 0123 or 202-555-0124', 'SSN (9) 00-12-3456', 'SSN 9) 00 12 3456', 'SSN (90) 0123456', 'SSN: (90) 0-12-3456', 'Line 1 97110 150.00\nSSN (9) 00-12-3456 Paid 150.00', 'Phone 20 2555 0123', 'Phone (202) 555 0123'],
  'G1-2 BARE_DATE_AFTER one-digit day': ['Seen 9001234562020-1-5', 'Seen 9001234562020-01-5', 'DOB 20255501232020-12-5.', '9001234562020/1/5 Paid', 'Seen 9001234562020-01-05'],
  'G1-3 named() without SSN_LABEL_THEN': ['Social Security Account Number:' + sp(14) + '900-12-3456150.00', 'Social Security Account Number' + sp(14) + '900123456150.00', 'SSN Account 01-900-12-3456150.00', 'Social Security Account Number 01/02/2020900-12-3456', 'Social Security Claim Number 900-12-3456150.00', 'SSN Account Code 900-12-3456150.00', 'Social Security Account Number 900-12-3456150.00'],
  'G1-4 parenthesized sets no shape': [H + '(202) 555-01234', H + '(202) 555-01232020', H + '(202) 555-01231 97110 150.00', 'Service 01/01/2020-150.00 Paid (202) 555-01234 Units', H + '(202)555-01234', H + 'Line (001) 420-97110'],
  'G1-5 loose branch, point in the second gap': ['SSN 900 12.3456150.00', 'SSN 900 12.345678', 'Social Security 900 12.3456150.00 Paid', 'SSN (900) 12.3456150.00', 'HICN 900 12.3456150.00', 'SSN 900 12.345601/02/2020', 'Medicare rate 110 32.74420'],
  'X more': ['Phone (20)2555-0123', 'Phone (20) 2555.0123', 'Mobile (20) 2555 0123', 'Tel. No. (20) 2555-0123', 'Phone number: (20) 2555-0123', 'Call (20) 2555-0123 today', 'SSN (9)00123456', 'SSN (90) 012 3456', 'TTY (20) 2555 0123', 'Toll-free (20) 2555 0123', 'Medicare (90) 0123456', 'HICN (9) 00123456A', 'Phone (20) 2555 0123 x12', H + 'Tel (20) 2555-0123',
    'SSN Account 2020-900-12-3456150.00', 'Soc Sec Acct 01/02/20900-12-3456', 'SSN Record 150.00900-12-3456', 'Social Security Account Number 4-900-12-345678', H + 'Dept. (202) 555-01234',
    'Phone (2) 202-555-0123150.00', 'SSN (2) 900-12-3456150.00', 'Phone 2) (202) 555-0123150.00', 'SSN (90) 0-12-3456150.00', 'Phone (2) 01/01/2020-150.00 97110 2 555 0123', 'SSN (9) 00 12 34.56', 'SSN (9) 0012 3456', 'Phone (1) 202 555 0123', 'Phone (12) 025550123'],
};
if (process.argv[1]?.endsWith('findings.mts')) {
  for (const [id, letters] of Object.entries(FINDINGS)) {
    if (process.argv[2] && !process.argv[2].split(',').some((want) => id.startsWith(want))) continue;
    console.log(`== ${id}`);
    for (const letter of letters) { const j = judge(letter, ['900123456', '2025550123'].filter((n) => digitsOnly(letter).includes(n))); console.log(`  [${j.sev || '-'}] ${j.line}`); }
  }
}

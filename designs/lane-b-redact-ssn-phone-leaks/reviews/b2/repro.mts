// One reproduction for every finding of REPORT.md: node repro.mts [B2-n]. Each row: the letter (a JSON string), the patient, base (ef3e8d20), head (aea2852d).
import { H, B, out, pat, cl, JANE, CLAIMS } from './lib.mts';
const HELD = 'Service 01/01/2020-150.00 Paid\n';
const only = process.argv[2];
const P = (name: string, dob = '1980-03-14', member = 'SYNMEMBER0042') => pat([name], dob, [member]);
type Row = [string, any?];
const F: Record<string, Row[]> = {
  'B2-1': [
    ['Dear Liam Vantree:\n\nWe approved 12 physical therapy visits (CPT 97110, 97140) from 01/05/2026 through 03/31/2026.\nQuestions? Our office is open Monday through Friday, 8am to 11am and 1pm to 5pm. Call 1-800-555-0199 (TTY: 711).', P('LIAM VANTREE')],
    ['Hours 8am-11am', P('LIAM VANTREE')], ['Please call before 11AM Eastern.', P('LIAM VANTREE')],
    ['Coverage ends JAN31.', JANE], ['Service dates JAN3, JAN10, JAN17', JANE], ['Coverage ends JUN30.', P('JUNE VANTREE')],
    ['Adjustment CO13 applied.', P('COLE VANTREE')], ['Adjustment CO131 (claim specific negotiated discount).', P('COLE VANTREE')],
    ['DOS 10MAR2026 97110 GP 2 150.00', P('OMAR VANTREE')], ['DOS MAR13 2026', P('ANN MARIE VANTREE')], ['Service period MAR10-MAR24, 2026.', P('MARIO VANTREE')], ['Due APR11.', P('APRIL VANTREE')], ['DOS JUL13 2026', P('JULIE VANTREE')],
    ['See Line11 of the form.', P('NEIL VANTREE')], ['Year1 deductible', P('EARL VANTREE')], ['Plan3 benefits apply.', P('ANNA LANE')], ['Limit: 13visits per year.', P('LEVI VANTREE')], ['Plan of care: Week5 reassessment', P('ANNA WEEKS')], ['Remark codes MA83, N130.', P('SARA MABE')], ['the 80th percentile', P('ERIC BOTH')],
    ['For accessibility help, see www.example.com/a11y.', P('ALLY VANTREE')],
  ],
  'B2-2': [
    ['Deposited to Acct#XXXX1234 on 01/15/2026.'], ['Payment to acct#XXXX1234 of $1,234.56 on 01/15/2026 (EFT trace 021000021234567).'], ['Acct#XXXX1234'], ['Account#****1234'], ['Bank Acct No.*****1234'], ['Acct No.XXXXX1234'], ['Acct.XXXXX1234'], ['Card#XXXX1234'], ['Member ID#XXXX1234'], ['Claim#XXXX1234'], ['Ending•••••1234'], ['Signature_____2026'], ['PAY*****1500.00'],
    ['Acct #XXXX1234'], ['Acct# XXXX1234'], ['Acct#XXXXXX1234'], ['Acct#XXX1234'], ['Fax#XXXX1234'], ['XXXXXX1234'],
  ],
  'B2-3': [
    ['Case No. 123-45-678901'], ['Case No. A123-45-678901'], ['Claim # E802-91-69413'], ['Reference: R802-91-69413'], ['Ticket INC-802-91-69413'], ['Order SO-802-91-69413'], ['Claim No. CLM-123-45-67890'], ['Tracking TRK123-456-78901'], ['Appeal APL-802-91-69413'], ['Inquiry # 150-98-68279'], ['Inquiry # Q150-98-68279'], ['Reference number: REF-123-456-78901'],
    ['Confirmation: 802-91-69413'], ['Confirmation code 802-91-69413'], ['Your confirmation number is 802-91-69413.'], ['Your payment number is 802-91-69413.'], ['Payment No. 802-91-69413'], ['Payment no 802-91-69413'],
    ['ID # 802-91-69413'], ['ID: 802-91-69413'], ['No. 802-91-69413'], ['Number: 802-91-69413'], ['Conf. No. 802-91-69413'], ['Case (No.) 123-45-678901'], ['Case number (appeal) 123-45-678901'], ['Case Nos. 123-45-678901 and 123-45-678902'], ['Cases 123-45-678901, 123-45-678902'], ['Case No. 123-45-678901 / 123-45-678902'],
    ['Claim Number\n802-91-69413'], ['Claim Number   Service Date   Billed\n802-91-69413   01/05/2026   $150.00'], ['Authorization 123-456-78901'], ['Preauthorization 123-456-78901'], ['Referral 123-456-78901'],
  ],
  'B2-4': [['Medicare 900-12-3456150.00'], ['Medicare No. 900-12-3456150.00'], ['Medicare # 900-12-3456150.00'], ['Medicaid 900-12-345678'], ['Medicare ID 900-12-345678'], ['Medicaid ID 900-12-345678'], ['SSN No. 900-12-3456150.00'], ['Patient # 900-12-3456150.00'], ['Beneficiary ID 900-12-3456150.00'], ['Paid # 900-12-3456150.00'], ['900-12-3456150.00'], ['$900-12-3456150.00'], ['Paid $900-12-3456150.00'], ['$202-555-01234567']],
  'B2-5': [
    [HELD + 'Visits over 12 may require prior authorization.', P('JANE Q ZEPHYRA', '1980-05-12')], ['Visits over 12 may require prior authorization.', P('JANE Q ZEPHYRA', '1980-05-12')], [HELD + 'Visits over 12 may require prior authorization.', P('JANE Q ZEPHYRA', '1980-03-12')],
    [HELD + 'A copay of $20 may apply.', P('JANE Q ZEPHYRA', '1975-05-20')], [HELD + 'Visits beyond 30 may be denied.', P('JANE Q ZEPHYRA', '1962-05-30')], [HELD + '5. May include a copay.', P('JANE Q ZEPHYRA', '2000-05-05')], [HELD + 'You may be responsible for up to two thousand dollars.', P('JANE Q ZEPHYRA', '2000-05-05')],
  ],
  'B2-6': [['Claim # 20260115-12-3456'], ['Statement ID 1234567-01-2026'], ['Policy No. 01-23456-78-9012'], ['DCN: 20260115-123-4567'], ['Claim No. 1234567-12-3456'], ['Claim No. 123456-78-9012'], ['Claim No. 12345-67-8901'], ['Claim line 2026008123456.01'], ['Claim 2026008123456.01'], ['Visit ID 123456789.1'], ['Visit ID 123456789'], ['Visit ID 1234567890.1']],
  'B2-7': [
    ['ВНИМАНИЕ: Если вы говорите на русском языке, то вам доступны бесплатные услуги перевода. Звоните 1-800-555-0199 (телетайп: 711).', P('LINH HA')],
    ['ВНИМАНИЕ: Если вы говорите на русском языке, то вам доступны бесплатные услуги перевода. Звоните 1-800-555-0199 (телетайп: 711).', P('TY BAM')],
    ['ΠΡΟΣΟΧΗ: Αν μιλάτε ελληνικά, στη διάθεσή σας βρίσκονται υπηρεσίες γλωσσικής υποστήριξης, οι οποίες παρέχονται δωρεάν. Καλέστε 1-800-555-0199 (TTY: 711).', P('SOO AN')],
    ['Μπορείτε να υποβάλετε ένσταση και να ζητήσετε αντίγραφο. Μια ένσταση ανά έτος.', P('MIA VANTREE')], ['Μπορείτε να υποβάλετε ένσταση και να ζητήσετε αντίγραφο.', P('KAI VANTREE')], ['Там вам помогут.', P('MINH TAM')],
  ],
  'B2-8': [
    [HELD + 'CPT 97110 97140'], [HELD + 'CPT code(s) 97110 97140'], [HELD + 'CPT®: 97110 97140'], [HELD + 'CPT Codes Billed 97110 97140'], [HELD + 'Service codes\n97110 97140'],
    [HELD + 'Washington, DC 20201-0001'], [HELD + 'Washington, D.C. 20201-0001'], [HELD + 'New York, N.Y. 10001-1234'], [HELD + 'Springfield, IL, 62701-1234'], [HELD + 'Springfield IL\n62701-1234'], [HELD + 'APO AE 09001-1234'], [HELD + 'Pago Pago, AS 96799-1234'], [HELD + 'Saipan, MP 96950-1234'], [HELD + 'San Juan, PR 00901-1234'],
    [HELD + 'Tax ID No.: 12-3456789'], [HELD + 'Tax ID #: 12-3456789'], [HELD + 'Provider Tax ID (TIN) 12-3456789'], [HELD + 'Tax I.D. 12-3456789'],
    [HELD + 'M54.5 97110'], [HELD + 'M54.50 97110'], [HELD + '97110 2 150.00'], [HELD + '97110 (2) 150.00'], [HELD + '97110 2 1 150.00'],
    [HELD + 'CPT 97110', P('JANE Q ZEPHYRA', '1997-01-10')], [HELD + 'CPT 97110', P('JANE Q ZEPHYRA', '1971-10-09')], [HELD + 'HCPCS G0283', P('JANE Q ZEPHYRA', '2002-08-03')],
  ],
  'B2-9': [['Dear Zυphyra,'], ['Dear Zephυra,'], ['Dear Jυne,', P('JUNE VANTREE')]],
};
for (const [id, rows] of Object.entries(F)) {
  if (only && only !== id) continue;
  console.log(`== ${id}`);
  for (const [text, p] of rows) {
    const who = p ?? JANE;
    console.log(`${JSON.stringify(text)}\n      patient ${who.names[0]}, born ${who.datesOfBirth[0]} | base: ${out(B, text, who, CLAIMS)} | head: ${out(H, text, who, CLAIMS)}`);
  }
}

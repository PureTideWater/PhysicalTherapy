// Every finding of review C2: node repro.mts [C2-n]. Each row: the letter (a JSON string), the patient where not the default,
// then the outcome on base ef3e8d20 | aea2852d (before the fix round) | 405314b4 | head a64cc9af (/home/user/fix).
import { B, A, H4, H, pat, out, HELD, JANE, CLAIMS } from './lib3.mts';
import { writeFileSync } from 'node:fs';
const P = (name: string, dob = '1980-03-14', member = 'SYNMEMBER0042') => pat([name], dob, [member]);
const D = (dob: string) => P('JANE Q ZEPHYRA', dob);
const only = process.argv[2];
type Row = [string, any?];
const LA = 'Dear Provider:\n\nWe reprocessed the following claims for Jane Zephyra (Member ID SYNMEMBER0042).\n\nICN,Service Date,Billed,Paid\n20260112345,01/05/2026,150.00,96.40\n20260112346,01/07/2026,150.00,96.40\n\nPayment was issued by EFT on 01/20/2026. Questions? Call Provider Services at 1-800-555-0199.\n';
const LB = 'RE: Medicare crossover claim for Jane Zephyra\n\nMedicare Secondary Payer 2026-123-45678 has been closed. The primary payer allowed $112.50 for CPT 97110 on 01/05/2026.\n\nIf you disagree, you may appeal within 180 days.\n';
const LC = 'Dear Jane Zephyra:\n\nYour request for physical therapy (CPT 97110, 97140) was approved for 12 visits from 01/05/2026 through 03/31/2026.\n\nContact Information\nPolicy: 1234-567-89012\nMember Services: 1-800-555-0199 (TTY: 711)\n';
const LD = 'Dear Provider:\n\nReferral # 123-45-67890-01 for Jane Zephyra was received on 01/05/2026. Internal Control Number (ICN): 2026008123456.01.\n';
const F: Record<string, Row[]> = {
  'C2-1 a name part of two or three letters in the patient\'s own script is no longer the name (matchesIn, the B2-7 fix)': [
    ['Пациент: Зефира Ли. Г-жа Ли получила 12 визитов.', P('ЗЕФИРА ЛИ')], ['Dear Ms. Ли:', P('ЗЕФИРА ЛИ')], ['Patient 泽飞 was approved for 12 visits.', P('泽飞')], ['Patient: 王 泽飞', P('泽飞 王')],
    ['환자: 김 제피', P('제피 김')], ['Dear 김:', P('제피 김')], ['Αγαπητή κα Ρω:', P('ΖΕΦΥΡΑ ΡΩ')], ['Dear Ms. Ли:', P('ZEPHYRA ЛИ')],
    ['control (B2-7, stays sent): Если вы говорите на русском языке', P('LINH HA')], ['control: Dear Linh Ha, Ms. Ha was approved.', P('LINH HA')],
  ],
  'C2-2 a reference within 24 characters after a phone word or "Medicare" is refused (gluedShape: labeled, LOOSE_JOIN)': [
    ['Contact Information\nMember ID: 1234-567-89012'], ['Contact Information\nPolicy: 1234-567-89012'], ['Questions? Call us.\nSubscriber ID: 2345-67-89012'], ['Call us. Member number 2345-678-9012'],
    ['Fax confirmation 2026-123-45678'], ['Fax confirmation 2026-123-\n45678'], ['Call tracking number 2345-678-9012'], ['Call log 2026-015-1234'], ['Please call about account 2345-678-9012.'], ['Phone inquiry 2026-123-45678 was closed.'],
    ['Medicare Secondary Payer 2026-123-45678'], ['Medicare Provider Number 12345-67-8901'], ['Medicare crossover 2026-123-45678'], ['Medicare remittance 2026-123-45678'], ['Medicare Redetermination Number 2026-123-45678'],
    ['Contact Jane Zephyra about policy 1234-567-89012'], ['Contact: Billing 250.75 123456'], ['Telephone visit 250.00   1234567'],
    [LB], [LC],
    ['control: Call Reference Number 2026-123-45678'], ['control: Contact us about claim 2026-123-45678'], ['control: Medicare Advantage authorization 2026-123-45678'], ['control: Policy: 1234-567-89012'],
  ],
  'C2-3 a reference its own noun names is refused: the any-word naming is gone, and NAMED_BEFORE reads no "(ICN)", pipe, comma or quote': [
    ['TCN # 2026008123456.01'], ['Payment ID 2026008123456.01'], ['Referral # 123-45-67890-01'], ['Receipt # 123-456-78901-2'], ['Rx # 1234-567-89012-01'],
    ['Internal Control Number (ICN): 2026008123456.01'], ['Document control number (DCN): 2026-0115-123-4567'], ['Claim number (ICN) 123-45-67890-01'], ['Claim Number | 2026-0115-123-4567'], ['Claim Number, 2026-0115-123-4567'],
    ['Claim number "2026-0115-123-4567"'], ['Claim #/Line: 2026-0115-123-4567'], ['Claim Number   Service Date\n2026-0115-123-4567   01/05/2026'], ['Referral # 01-23456-78-9012'], ['Precertification # 01-23456-78-9012'],
    ['TCN 2026008123456.01'], ['CCN: 2026008123456.01'], ['MRN 12345678901.01'], [LD],
    ['control: Claim number: 2026-0115-123-4567'], ['control: Policy No. 01-23456-78-9012'], ['control: Payer Claim Control Number 2026008123456.01'], ['control: Inquiry # 123-45-67890-01'],
  ],
  'C2-4 a comma (or a period) and then eleven or twelve digits is read as cents and a number; ",150.00" after a long ID as an amount\'s end (gluedShape)': [
    ['ICN 12345678901,12345678902'], ['Claims 20260112345,20260112346,20260112347'], ['NDC 00002143380,00002143480'], ['Reference numbers: 202601123456,202601123457'], ['Trace numbers 21000021234,21000021235'],
    ['CPT,ICN,Billed\n97110,20260112345,150.00'], ['Claim,Amount\n20261234567890,150.00'], ['Remit 20261234567,150.00'], ['Claim 20261234567,01/05/2026'], [LA],
    ['control: ICN 12345678901, 12345678902'], ['control: ICN 1234567890,1234567891'], ['control: Claim 20261234567890,150.00'],
  ],
  'C2-5 held letters: the day as an ordinal\'s word, and "may" after an ordinal or at a line\'s end (heldBirthUnread)': [
    [HELD + 'The first March payment was applied.', D('1980-03-01')], [HELD + 'We received your third June claim.', D('2001-06-03')], [HELD + 'Coverage begins in March. First, verify eligibility.', D('1980-03-01')],
    [HELD + 'Only a second may\nbe requested.', D('1980-05-02')], [HELD + 'You may first\ncall Member Services.', D('1980-05-01')],
    [HELD + 'Visits after the 12th may require prior authorization.', D('1980-05-12')], [HELD + 'Visits over 12 may\nrequire prior authorization.', D('1980-05-12')], [HELD + 'Claims received after the 15th may be denied.', D('1975-05-15')],
    [HELD + 'A copay of $20 may\napply.', D('1975-05-20')], [HELD + 'You may 1) call us or 2) write to us.', D('1980-05-01')],
    ['control (no held range): The first March payment was applied.', D('1980-03-01')], [HELD + 'control: Visits over 12 may require prior authorization.', D('1980-05-12')], [HELD + 'control: The first March payment was applied.', D('1980-03-02')],
  ],
  'C2-6 a masked account number of four, two and four after "#" (MASKED_SSN_GLUED, three to five mask characters)': [
    ['Acct#XXXX-XX-1234'], ['Deposited to Acct#XXXX-XX-1234 on 01/15/2026.'], ['Card#XXXX-XX-1234'], ['Acct#****-**-1234'], ['Loan#XXXX XX 1234'], ['control: Acct #XXXX-XX-1234'], ['control: Acct#XXXX1234'],
  ],
  'C2-7 a label read through its list number (G5) refuses what follows it': [
    ['Contact 1: Springfield, IL 62701-1234'], ['Contact (1): Springfield, IL 62701-1234'], ['Fax 1 (main): Dayton, OH 45402-1234'], ['Tel. 2: Dayton, OH 45402-1234'], ['control: Contact: Springfield, IL 62701-1234'],
  ],
};
F['C2-8 the pieces rule: neighbouring tokens read as one of the call\'s identifiers (confusedMatchesIn)'] = [
  ['Plan of care: Week-5 reassessment', P('ANNA WEEKS')], ['See Field-5 of the claim form.', P('SALLY FIELDS')], ['House Bill-13 takes effect 01/01/2027.', P('BILLIE VANTREE')],
  ['07/18/2027  S9131  CO  6  $4242.00  $876.00  $3,323.30  CO-253', pat(['JANE Q ZEPHYRA'], '1980-03-14', ['202759131'])], ['Diagnosis codes: M62.81 M48.061 I69.354', pat(['JANE Q ZEPHYRA'], '1980-03-14', ['061169'])],
  ['control: Plan of care: Week 5 reassessment', P('ANNA WEEKS')], ['control: 07/18/2027  S9131  CO  6  $4242.00', pat(['JANE Q ZEPHYRA'], '1980-03-14', ['202759132'])],
];
const lines: string[] = [];
for (const [id, rows] of Object.entries(F)) {
  if (only && !id.startsWith(only)) continue;
  lines.push(`== ${id}`);
  for (const [raw, p] of rows) {
    const control = /^(?:Service 01\/01\/2020-150\.00 Paid\n)?control[^:]*: /.exec(raw);
    const text = control ? raw.replace(/control[^:]*: /, '') : raw;
    const who = p ?? JANE; const cut = (s: string) => (s.length > 150 ? s.slice(0, 150) + '…' : s);
    const [b, a, h4, h] = [out(B, text, who, CLAIMS), out(A, text, who, CLAIMS), out(H4, text, who, CLAIMS), out(H, text, who, CLAIMS)];
    lines.push(`${control ? '  (control) ' : ''}${JSON.stringify(text)}${p ? `   patient ${who.names[0]}, born ${who.datesOfBirth[0]}${who.memberIds[0] !== 'SYNMEMBER0042' ? `, member ID ${who.memberIds[0]}` : ''}` : ''}\n      base: ${cut(b)} | aea2852d: ${cut(a)} | 405314b4: ${cut(h4)} | head a64cc9af: ${cut(h)}`);
  }
}
writeFileSync('/home/user/review-c2/repro.out', lines.join('\n') + '\n');
console.log(lines.join('\n'));

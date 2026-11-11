// Reviewer E2: node time.mts. 5,000 characters of what a changed pattern repeats: milliseconds on head and before.
import { M, JANE, MAYP, CLAIMS, HELD } from './lib.mts';
const N = Number(process.argv[2] ?? 5000);
const rep = (s: string, total = N) => s.repeat(Math.ceil(total / s.length)).slice(0, total);
const rows: [string, string, any?][] = [
  ['phone-list-numbers', 'Phone ' + rep('(1) ')],
  ['call-(2)', rep('Call (2) ')],
  ['ssn-(2)-amounts', rep('SSN (2) 150.00 ')],
  ['label-spaces-(2)', 'Phone' + rep(' ') + '(2) 555-0100'],
  ['(2)-parens', 'Phone (2)' + rep(')') + ' 555-0100'],
  ['digits', rep('1')],
  ['cents-range', rep('150.00-')],
  ['cents-range-11', rep('12345678901.50-')],
  ['shape-cents-digits', '900-12-3456150.00-' + rep('1')],
  ['shape-cents-commas', '900-12-3456150.00-1' + rep(',000') + '.00'],
  ['mdy-before', rep('01/02/') + '2020900-12-3456'],
  ['month-before', rep('JAN 1, ') + '2020900-12-3456'],
  ['month-glued', rep('JAN') + ' 1, 2020900-12-3456'],
  ['bare-date-year', rep('9001234562020-01-')],
  ['bare-date', rep('96104065401-04-')],
  ['mask-x', 'Paid' + rep('X') + '-XX-3456'],
  ['mask-star', 'Paid' + rep('*') + '-**-3456'],
  ['mask-dates', rep('1/2/') + '2020XXX-XX-3456'],
  ['mask-gap', 'PaidXXX' + rep(' ') + 'XX 3456'],
  ['mask-held', HELD + 'Paid' + rep('_') + '1234'],
  ['bullets', rep('•')],
  ['name-bullets', rep('Zephyra•')],
  ['initial-bullets', rep('J•') + 'Zephyra'],
  ['named-(S)', 'Claim ' + rep('(S)') + ' 802-45-678901.50'],
  ['named-spaces', 'Claim' + rep(' ') + '802-45-678901.50'],
  ['named-no', 'Claim ' + rep('No. ') + '802-45-678901.50'],
  ['named-nouns', rep('Claim ') + '802-45-678901.50'],
  ['joined-groups', rep('123-45-67890-')],
  ['paren-phones', rep('(123) 456-78901 ')],
  ['paren-open', rep('(123) 456-')],
  ['loose-label', 'SSN ' + rep('900.12 3456 ')],
  ['ssn-label-then', rep('SSN ') + 'Account 900-12-345678'],
  ['soc-sec-spaces', 'SOC' + rep(' ') + 'SEC Account 900-12-345678'],
  ['dots', rep('1.')],
  ['cents-dash', rep('.12-')],
  ['may-the', HELD + rep('MAY THE '), MAYP],
  ['12-of', HELD + rep('12 OF '), MAYP],
  ['may-seps', HELD + 'May' + rep(' ,.-') + '12th', MAYP],
  ['12-may', HELD + rep('12 may, '), MAYP],
];
for (const [name, text, p] of rows) {
  const pt = p ?? JANE;
  process.stdout.write(`${name} (${text.length} chars):`);
  for (const tree of ['head', 'before']) {
    const t = performance.now();
    let o: string;
    try {
      const s = M[tree].redactLetterForScreen(text, pt, CLAIMS);
      o = M[tree].holdsIdentifier(s.text, pt, CLAIMS) ? 'REFUSED' : s.text === text ? 'same' : 'changed';
    } catch (e) {
      o = `THROW ${String(e).slice(0, 100)}`;
    }
    process.stdout.write(` ${tree} ${Math.round(performance.now() - t)}ms ${o};`);
  }
  process.stdout.write('\n');
}

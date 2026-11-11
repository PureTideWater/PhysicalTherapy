// node b.mts: time and exceptions on long lines (5,000 characters of what a changed pattern repeats) and on 20,000-character letters under labels; head against before and base.
import { M, JANE, MAYA, CLAIMS, HELD } from './lib.mts';
function time(tree: string, text: string, patient: any) {
  const R = M[tree];
  const t0 = performance.now();
  let res = '';
  try {
    const s = R.redactLetterForScreen(text, patient, CLAIMS);
    res = R.holdsIdentifier(s.text, patient, CLAIMS) ? 'REFUSED' : s.text === text ? 'same' : 'changed';
  } catch (e) {
    res = 'THROW ' + String(e).slice(0, 100);
  }
  return { ms: performance.now() - t0, res };
}
let worst = 0;
function bench(title: string, text: string, patient: any = JANE) {
  const cells: string[] = [];
  const ms: Record<string, number> = {};
  for (const t of ['head', 'before', 'base']) {
    const a = time(t, text, patient);
    ms[t] = a.ms;
    cells.push(`${t} ${a.ms.toFixed(0)}ms ${a.res}`);
  }
  worst = Math.max(worst, ms.head ?? 0);
  const flag = (ms.head ?? 0) > 3 * Math.max(ms.before ?? 0, 30) || cells.some((c) => c.includes('THROW')) ? '  <<<<' : '';
  console.log(`${title} [${text.length}] ${cells.join(' | ')}${flag}`);
}
for (let i = 0; i < 3; i += 1) for (const t of ['head', 'before', 'base']) time(t, 'Claim 20260112345 was paid 150.00 on 01/15/2026. Call 800-555-0199. ' + HELD, JANE);
const SHAPE = '2020900-12-3456';
console.log('# month words and date gaps before a year glued to a shape');
bench('JANJAN...+shape', 'JAN'.repeat(1660) + ' ' + SHAPE);
bench('JAN JAN ...+shape', 'JAN '.repeat(1250) + SHAPE);
bench('1 JAN 1 JAN ...+shape', '1 JAN '.repeat(830) + SHAPE);
bench('JAN + gap characters + shape', 'JAN' + ', . - / '.repeat(620) + SHAPE);
bench('MAYMAY... + many shapes', ('MAY'.repeat(12) + ' 2026011-22-3333 ').repeat(95));
bench('Claim + year-led shape, named, x220', 'Claim 2020900-12-3456 '.repeat(220));
bench('1/2/ x1600 + shape', '1/2/'.repeat(1250) + SHAPE);
console.log('# underscores, masks, currency');
bench('underscores', '_'.repeat(5000));
bench('123 + underscores + 1234', '123' + '_'.repeat(5000) + '1234');
bench('150.00___ __ x380', '150.00___ __ '.repeat(380) + '2026');
bench('123___-__- x500', '123___-__-'.repeat(500) + '1234');
bench('12___ __ x550', '12___ __ '.repeat(550));
bench('$ + 1, x2500 + mask', '$' + '1,'.repeat(2500) + 'XXX-XX-1234');
bench('$1 x2500', '$1'.repeat(2500));
bench('$1,234,567 x500 + mask', '$1,234,567 '.repeat(450) + '$1XXX-XX-1234');
bench('X x5000 -XX-1234', 'X'.repeat(5000) + '-XX-1234');
bench('digits x5000 + mask', '1'.repeat(5000) + 'XXX-XX-1234');
bench('123XXX-XX-<16 spaces> x190', ('123XXX-XX-' + ' '.repeat(16)).repeat(190));
bench('held: $150_____ x450', HELD + '$150_____ '.repeat(450) + '2026');
console.log('# parentheses and list numbers');
bench('( x5000', '('.repeat(5000));
bench('(123) x830', '(123) '.repeat(830));
bench('(123) newline x830', '(123)\n'.repeat(830));
bench('( + 5000 spaces + 202) 555-0123150.00', '(' + ' '.repeat(5000) + '202) 555-0123150.00');
bench('(123) 456 78901 x350', '(123) 456 78901 '.repeat(310));
bench('Phone + (2) x1240', 'Phone ' + '(2) '.repeat(1240));
bench('Phone (2) x500', 'Phone (2) '.repeat(500));
bench('Call newline 1) x550', 'Call\n1) '.repeat(550));
bench('SOCIAL + 30 spaces + SECURITY (2) x100', ('SOCIAL' + ' '.repeat(30) + 'SECURITY (2) ').repeat(100));
bench('SOC + 5000 spaces + SEC 1: 123', 'SOC' + ' '.repeat(5000) + 'SEC 1: 123 45 6789');
console.log('# bare runs and date joiners, cents');
bench('12345678945| x416', '12345678945|'.repeat(416));
bench('12345678901 + | x5000', '12345678901' + '|'.repeat(5000));
bench('Claim 12345678901|02|2026 x200', 'Claim 12345678901|02|2026 '.repeat(190));
bench('Claim 12345678901.50-120.00 x180', 'Claim 12345678901.50-120.00 '.repeat(180));
bench('802-45-678901 JANJAN.. x200', ('Claim 802-45-678901 ' + 'JAN'.repeat(2) + ' ').repeat(190));
console.log('# May at a line end (patient born 1980-05-14, held letter)');
bench('held MAY x1250', HELD + 'MAY '.repeat(1250), MAYA);
bench('held MAY newline x1250', HELD + 'MAY\n'.repeat(1250), MAYA);
bench('held MAY THE + 5000 spaces + 14TH', HELD + 'MAY THE' + ' '.repeat(5000) + '14TH', MAYA);
bench('held MAY THE x620', HELD + 'MAY THE '.repeat(620), MAYA);
console.log('# 20,000 characters, many digit groups under labels');
bench('Fax order <shape.cents> x740', 'Fax order 802-45-678901.50 '.repeat(740));
bench('Tel order 123-45-67890-12 x770', 'Tel order 123-45-67890-12 '.repeat(770));
bench('Phone (2) order <shape.cents> x600', 'Phone (2) order 802-45-678901.50 '.repeat(600));
bench('Contact us regarding account <shape.cents> x420', 'Contact us regarding account 802-45-678901.50. '.repeat(420));
bench('Phone + own name x1530 + order shape', 'Phone ' + 'Jane Zephyra '.repeat(1530) + 'order 802-45-678901.50');
bench('Phone: + 12345-67-8901 x1430', 'Phone: ' + '12345-67-8901 '.repeat(1430));
bench('SSN: + 12345-67-8901 x1430', 'SSN: ' + '12345-67-8901 '.repeat(1430));
bench('SSN 12345-67-8901 x1100', 'SSN 12345-67-8901 '.repeat(1100));
bench('SSN Claim <shape.cents> x700', 'SSN Claim 802-45-678901.50 '.repeat(700));
bench('Fax confirmation 12345678901.50 x620', 'Fax confirmation 12345678901.50 '.repeat(620));
bench('Fax order 12345678901|02|2026 x660', 'Fax order 12345678901|02|2026 '.repeat(660));
console.log(`worst head time ${worst.toFixed(0)}ms`);

// node f.mts: last checks. (a) phone-word service rows with units or a list number: what is new this round and what the base sends with the mark taken out; (b) the rate give-back with a month-word date after it; (c) rows under a table heading.
import { three, out, HELD, fmt } from './lib.mts';
{
  const WORDS = ['Telephone call', 'Phone visit', 'Telephone E/M', 'Fax fee', 'Call', 'Contact', 'Telephone calls', 'Phone consults'];
  const MARKS = ['(1)', '(2)', '1:', '2)', '(2nd)', '( 2 )', '(12)'];
  const ROWS = ['99441 1 45.00 45.00', '30.00 60.00', '97110 2 150.00 120.00 30.00', '98966 45.00', '01/15/2026 99442 80.00 64.00', '15.00 30.00 0.00', 'units 99443 120.00', '45.00', 'G2012 14.50 14.50', '2 x 45.00 = 90.00'];
  for (const pre of ['', HELD]) {
    let n = 0, baseSame = 0, head = 0, before = 0, roundNew = 0, roundNewOutside = 0, givenBack = 0;
    const ex: string[] = [];
    for (const w of WORDS) for (const m of MARKS) for (const r of ROWS) {
      const text = `${pre}${w} ${m} ${r}`;
      const t = three(text);
      n += 1;
      if (t.base !== 'same') continue;
      baseSame += 1;
      if (t.before !== 'same') before += 1;
      if (t.head === 'same') { if (t.before !== 'same') givenBack += 1; continue; }
      head += 1;
      if (t.before !== 'same') continue;
      roundNew += 1;
      const without = out('base', `${pre}${w} ${r}`);
      if (without === 'same') { roundNewOutside += 1; }
      if (ex.length < 5) ex.push(`${fmt(text, t)}\n        base without the mark: ${without}`);
    }
    console.log(`## phone-word rows ${pre ? '[held letter]' : '[plain]'}: ${n} letters, base sends ${baseSame}; head refuses ${head}, before ${before}; given back this round ${givenBack}; new this round ${roundNew}, of which the base also sends with the mark taken out ${roundNewOutside}`);
    for (const e of ex) console.log('   ' + e);
  }
}
console.log('\n## the rate give-back and a month-word date; rows under a table heading; sentences');
for (const l of [
  'Medicare rate 110 32.74425', 'Medicare rate 110 32.74425 Jan 15, 2026', 'Medicare rate 110 32.74420 Jan 15, 2026', 'Medicare rate 110 32.74425 01/15/2026',
  'Claim Number  Date of Service  Code  Billed\n802-45-678901 Jan 15, 2026 97110 150.00', 'Reference: 802-45-678901 Jan 15, 2026', 'We received your appeal for 802-45-678901 Jan 15, 2026 services.',
  'Your case 123-45-678912 March 2026 is closed.', 'Tracking ID 123-456-78915 Oct 20, 2026', 'Your number 123-456-78915 Oct 20, 2026', 'DOS Jan 15, 2026 Ref 802-45-678901',
  '1234567899/9/2020', '12345678909/9/2020',
]) console.log('  ' + fmt(l, three(l)));

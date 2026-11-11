// node e.mts: scope checks for the findings, a few logic checks, and phone-word service rows with units; every letter with its three outcomes.
import { three, out, HELD, fmt } from './lib.mts';
function all(title: string, letters: readonly string[]) {
  console.log(`\n## ${title}`);
  for (const l of letters) console.log('  ' + fmt(l, three(l)));
}
all('month-word date after a number: scope', [
  'Application No. 802-45-678901 Jan 15, 2026', 'ID 802-45-678901 Jan 15, 2026', 'Member ID 802-45-678901 Jan 15, 2026', 'Medicare rate 110 32.74425 Jan 15, 2026', 'Contact: Billing 250 75.12345 Jan 15, 2026',
  'Received 802-45-678901 May 2026 statement', '802-45-678901 Mar 3, 2026', 'Episode 123-456-78912 Sep 30', 'Predetermination 123-45-67895 Oct 2026', 'Line (001) 420-97112 Jan 15, 2026 2 150.00 120.00', 'Rev 420-971-16005 Jan 15',
]);
all('joiners after a bare run: scope', [
  'Statement_12345678915_May_2026.pdf', 'ClaimNo|Line|DOS\n12345678901|1|20260115', '12345678901|1|2026|Q1', 'ICN 12345678901|1|20260115', 'Claim|12345678901|1|20260115', '12345678901 | 1 | 20260115', '12345678901|1|20260115', '12345678901;1;20260115',
  '9001234569/9/2020', '1234567899/9/2020',
]);
all('noun above: scope', ['Remittance\nAdvice No. 20260112345.01', 'Claim\nNumber: 20260112345.01', 'Claim Number\n\n\n20260112345.01', 'Claim Number: 20260112345.01', 'Claim #\n\n20260112345.01', 'Re: Claim\n\n20260112345.01 dated 01/15/2026']);
// phone-word service descriptions with units or a list number, then a row
{
  const WORDS = ['Telephone call', 'Phone visit', 'Telephone E/M', 'Fax fee', 'Call', 'Contact', 'Telephone calls', 'Phone consults'];
  const MARKS = ['(1)', '(2)', '1:', '2)', '(2nd)', '( 2 )', '(12)'];
  const ROWS = ['99441 1 45.00 45.00', '30.00 60.00', '97110 2 150.00 120.00 30.00', '98966 45.00', '01/15/2026 99442 80.00 64.00', '15.00 30.00 0.00', 'units 99443 120.00', '45.00', 'G2012 14.50 14.50', '2 x 45.00 = 90.00'];
  let n = 0, baseSame = 0, head = 0, before = 0, outside = 0;
  const ex: string[] = [];
  for (const w of WORDS) for (const m of MARKS) for (const r of ROWS) for (const pre of ['', HELD]) {
    const text = `${pre}${w} ${m} ${r}`;
    const t = three(text);
    n += 1;
    if (t.base !== 'same') continue;
    baseSame += 1;
    if (t.before !== 'same') before += 1;
    if (t.head === 'same') continue;
    head += 1;
    const without = out('base', `${pre}${w} ${r}`);
    if (without === 'same') { outside += 1; if (ex.length < 6) ex.push(`${fmt(text, t)}\n        base without the list number: ${without}`); }
  }
  console.log(`\n## phone-word rows with units or a list number: ${n} letters, base sends ${baseSame}; head refuses/changes ${head}, before ${before}; head's that the base also sends with the mark taken out: ${outside}`);
  for (const e of ex) console.log('   ' + e);
}

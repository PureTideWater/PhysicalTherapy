// node c.mts [seed]: small generators with rates. A letter counts where the base sends it unchanged; "head" and "before" are how many of those each tree refuses or changes.
import { three, out, HELD, fmt, rng, pick, digits } from './lib.mts';
const seed = Number(process.argv[2] ?? 12);
const T0 = Date.now();
const CPT = ['97110', '97112', '97116', '97140', '97530', '97535', '97161', '97164', '97014', '97035', '98941', '97750'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'January', 'March', 'September', 'Sept.', 'Dec.'];
const amt = (r: () => number) => `${String(10 + Math.floor(r() * 490))}.${String(Math.floor(r() * 100)).padStart(2, '0')}`;
const two = (n: number) => String(n).padStart(2, '0');
function rate(title: string, gen: (r: () => number) => string, n: number, held = false, show = 3) {
  const r = rng(seed + title.length * 7919);
  let baseSame = 0, headNew = 0, beforeNew = 0, onlyHead = 0;
  const ex: string[] = [];
  for (let i = 0; i < n; i += 1) {
    const text = (held ? HELD : '') + gen(r);
    const t = three(text);
    if (t.base !== 'same') continue;
    baseSame += 1;
    if (t.before !== 'same') beforeNew += 1;
    if (t.head !== 'same') {
      headNew += 1;
      if (t.before === 'same') { onlyHead += 1; if (ex.length < show) ex.push(fmt(text, t)); }
    }
  }
  const pct = (k: number) => `${k} (${((100 * k) / Math.max(1, baseSame)).toFixed(1)}%)`;
  console.log(`\n## RATE ${title}${held ? ' [held letter]' : ''}: ${n} letters, base sends unchanged ${baseSame}; head refuses/changes ${pct(headNew)}, before ${pct(beforeNew)}, new this round ${pct(onlyHead)}  [${Date.now() - T0}ms]`);
  for (const e of ex) console.log('     ' + e);
}
const ref = (r: () => number, shape?: string) => (shape ?? pick(r, ['3-2-6', '3-2-5', '3-3-5', '3-3-6'])).split('-').map((n, i) => digits(r, Number(n), i === 0)).join('-');
const wordDate = (r: () => number) => {
  const d = 1 + Math.floor(r() * 28);
  const m = pick(r, MON);
  return pick(r, [`${m} ${d}, 2026`, `${m} ${two(d)}, 2026`, `${m} 2026`, `${m} ${d} 2026`]);
};
// 1. a row: a dashed reference no noun names, a space, a date with its month's word, a code, an amount
for (const held of [false, true]) {
  rate('1a ref + space + month-word date (row: ref date code amount)', (r) => `${pick(r, ['', '', 'Web ID ', 'Number ', 'Your ID '])}${ref(r)} ${wordDate(r)} ${pick(r, CPT)} ${amt(r)}`, 400, held);
}
rate('1b same row, the reference named by Claim (control)', (r) => `Claim ${ref(r)} ${wordDate(r)} ${pick(r, CPT)} ${amt(r)}`, 200);
rate('1c same row, a numeric date (control)', (r) => `${ref(r)} ${two(1 + Math.floor(r() * 12))}/${two(1 + Math.floor(r() * 28))}/2026 ${pick(r, CPT)} ${amt(r)}`, 200);
rate('1d claim line: Line (nnn) rev-HCPCS + month-word date + amount', (r) => `Line (${two(1 + Math.floor(r() * 12)).padStart(3, '0')}) ${pick(r, ['420', '421', '424', '430', '434'])}-${pick(r, CPT)} ${wordDate(r)} ${amt(r)}`, 400);
rate('1e claim line: (nnn) rev HCPCS + month-word date (spaces only)', (r) => `(${two(1 + Math.floor(r() * 12)).padStart(3, '0')}) ${pick(r, ['420', '421', '424', '430', '434'])} ${pick(r, CPT)} ${wordDate(r)} ${amt(r)}`, 400);
rate('1f letter of 5 such rows under a heading', (r) => `Lines reviewed:\n${[0, 1, 2, 3, 4].map(() => `${ref(r)} ${wordDate(r)} ${pick(r, CPT)} ${amt(r)}`).join('\n')}`, 200);
// 2. pipe rows and file names: an eleven- to fourteen-digit ID, then small columns
const compact = (r: () => number) => `2026${two(1 + Math.floor(r() * 12))}${two(1 + Math.floor(r() * 28))}`;
const iso = (r: () => number) => `2026-${two(1 + Math.floor(r() * 12))}-${two(1 + Math.floor(r() * 28))}`;
rate('2a pipe row: id11-12|line|CCYYMMDD|code|amount', (r) => `${digits(r, pick(r, [11, 12]))}|${1 + Math.floor(r() * 12)}|${compact(r)}|${pick(r, CPT)}|${amt(r)}`, 400);
rate('2b pipe row: id11-12|line|YYYY-MM-DD|code|amount', (r) => `${digits(r, pick(r, [11, 12]))}|${1 + Math.floor(r() * 12)}|${iso(r)}|${pick(r, CPT)}|${amt(r)}`, 300);
rate('2c pipe row: id11-12|units|year-led claim number|amount', (r) => `${digits(r, pick(r, [11, 12]))}|${1 + Math.floor(r() * 8)}|2026${digits(r, 8, false)}|${amt(r)}`, 300);
rate('2d pipe row: id13-14|units|amount|amount', (r) => `${digits(r, pick(r, [13, 14]))}|${1 + Math.floor(r() * 8)}|${amt(r)}|${amt(r)}`, 600);
rate('2e pipe row with a year-led id13 (2026 + 9 digits)|units|amount|amount', (r) => `${digits(r, 9)}2026|${1 + Math.floor(r() * 8)}|${amt(r)}|${amt(r)}`, 200);
rate('2f the same as 2a with commas (control)', (r) => `${digits(r, pick(r, [11, 12]))},${1 + Math.floor(r() * 12)},${compact(r)},${pick(r, CPT)},${amt(r)}`, 200);
rate('2g letter: header and 5 pipe rows (2a)', (r) => `ClaimNo|Line|DOS|HCPCS|Billed\n${[0, 1, 2, 3, 4].map(() => `${digits(r, 11)}|${1 + Math.floor(r() * 12)}|${compact(r)}|${pick(r, CPT)}|${amt(r)}`).join('\n')}`, 200);
rate('2h file name: Statement_<id11>_<mm>_<yyyy>.pdf', (r) => `See attached ${pick(r, ['Statement', 'ERA', 'EOB', 'remit'])}_${digits(r, 11)}_${two(1 + Math.floor(r() * 12))}_2026.pdf for details.`, 300);
// 3. a noun two line breaks above its number: every layout against every number
{
  const NOUNS = ['Claim Number', 'ICN', 'Reference No.', 'Control Number', 'Invoice No.', 'Check Number', 'Policy Number', 'Member ID'];
  const LAYOUTS: readonly (readonly [string, (noun: string) => string])[] = [
    ['same line', (n) => `${n}: `], ['one break', (n) => `${n}:\n`], ['blank line', (n) => `${n}:\n\n`], ['rule under it', (n) => `${n}\n${'-'.repeat(n.length)}\n`],
    ['wrapped label', (n) => (n.includes(' ') ? `${n.replace(' ', '\n')}\n` : `${n}\n\n`)], ['CRLF blank line', (n) => `${n}:\r\n\r\n`],
  ];
  const NUMBERS = ['20260112345.01', '12345678901234.01', '802-45-678901.50', '123456789012.5'];
  for (const [name, layout] of LAYOUTS) {
    let baseSame = 0, head = 0, before = 0;
    for (const noun of NOUNS) for (const number of NUMBERS) {
      const t = three(`${layout(noun)}${number}`);
      if (t.base !== 'same') continue;
      baseSame += 1;
      if (t.head !== 'same') head += 1;
      if (t.before !== 'same') before += 1;
    }
    console.log(`## RATE 3 noun above its number, layout "${name}": ${NOUNS.length * NUMBERS.length} letters, base sends ${baseSame}; head refuses ${head}, before ${before}`);
  }
  let hb = 0, hh = 0, hbf = 0;
  for (const noun of NOUNS) for (const number of ['802-45-678901', '802-456-78901', '123-45-678901']) for (const sep of [':\n\n', '\n---------\n']) {
    const t = three(`${HELD}${noun}${sep}${number}`);
    if (t.base !== 'same') continue;
    hb += 1; if (t.head !== 'same') hh += 1; if (t.before !== 'same') hbf += 1;
  }
  console.log(`## RATE 3 held letter, a dashed number two lines under its noun: base sends ${hb}; head refuses ${hh}, before ${hbf}`);
}
// 4. a numbered list on the line after a phone word
{
  const LEADS = ['If you have questions, please call', 'You can reach us by phone', 'Send the following by fax', 'Reason for contact', 'Ways to contact us:', 'Please contact', 'Summary of your call', 'Preferred contact:', 'Hours to call:', 'Items we need you to fax.', 'What we discussed on the call:', 'Documents received by fax -'];
  const MARKS = ['1) ', '1: ', '2) ', '(1) ', '1. ', 'a) ', '1 - '];
  const ITEMS = ['97110 97140', '97110 x 2 units, 97140 x 1 unit', '150.00 billed, 120.00 allowed, 30.00 owed', '150.00 120.00 30.00', '01/15/2026 97110 150.00 120.00', 'Member Services 97110 97140', 'PO Box 30555, Salt Lake City, UT 84130-0555', 'Springfield, IL 62701-1234',
    'the claim form and 12 pages of records', '30 days from 01/15/2026 to appeal', '8:00 a.m. to 5:00 p.m. Central', 'Visits 12 of 30 used, 18 left', 'Units billed 4, allowed 2, 97530', 'Line 3: 97112 denied CO-97', '2 units 97110, 1 unit 97140', 'Rev 0420 97110 GP 2 150.00'];
  const tally: Record<string, { n: number; baseSame: number; head: number; before: number; outside: number; ex: string[] }> = {};
  for (const mark of MARKS) {
    const k = (tally[mark] = { n: 0, baseSame: 0, head: 0, before: 0, outside: 0, ex: [] });
    for (const lead of LEADS) for (const item of ITEMS) {
      const text = `${lead}\n${mark}${item}\nThank you.`;
      const t = three(text);
      k.n += 1;
      if (t.base !== 'same') continue;
      k.baseSame += 1;
      if (t.before !== 'same') k.before += 1;
      if (t.head === 'same') continue;
      k.head += 1;
      // the recorded family: what the base refuses with the list number taken out
      const without = [`${lead}\n${item}\nThank you.`, `${lead}\n${mark.replace(/[0-9]+/u, '')}${item}\nThank you.`].map((s) => out('base', s));
      const outside = without.every((o) => o === 'same');
      if (outside) k.outside += 1;
      if (k.ex.length < (outside ? 4 : 2) && t.before === 'same') k.ex.push(`${fmt(text, t)}\n        base without the list number: ${without.join(' / ')}`);
    }
  }
  for (const [mark, k] of Object.entries(tally)) {
    console.log(`\n## RATE 4 line ends in a phone word, next line starts ${JSON.stringify(mark)}: ${k.n} letters, base sends ${k.baseSame}; head refuses/changes ${k.head}, before ${k.before}; of head's, base also sends with the list number taken out: ${k.outside}`);
    for (const e of k.ex) console.log('     ' + e);
  }
}
console.log(`\n[${Date.now() - T0}ms total]`);

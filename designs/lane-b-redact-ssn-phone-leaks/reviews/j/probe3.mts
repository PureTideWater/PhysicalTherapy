// node probe3.mts: (1) BLANK_LINE against one CRLF; (2) a stray mark or an empty table row as the middle line of a
// three-line label; (3) DATE_AFTER_REACH with a two-digit day; (4) realistic letters for the "+" time finding, each tree in its
// own process with a cap.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { load, line } from './lib.mts';
const [H, P, B] = [await load('head'), await load('before'), await load('base')];
const sections: [string, string[]][] = [];
const twins = (letters: string[]) => letters.flatMap((t) => [t, t.replaceAll('\n', '\r\n')]);
sections.push(['1 a label wrapped over one line break: "\\n" and its "\\r\\n" twin (ordinary content)', twins([
  'Please refer to claim\nnumber 20260112345.01 when you call.',
  'Claim\nNumber: 20260112345.01',
  'Reference\nNo. 802-45-678901.50',
  'Your policy\nnumber is 20260112345.01',
  'Member\nID: 802-45-678901.50',
  'Invoice\n#12345678901234.01',
  'Claim\n20260112345.01',
  'Claim Number:\n\n20260112345.01',
  'Claim\n-----\n20260112345.01',
  'Member\nID\nNumber\n20260112345.01',
  'Invoice\n-------\nNo. 20260112345.01',
  'Claim\n#\n20260112345.01',
])]);
sections.push(['1b the same break written otherwise', [
  'Claim\rNumber: 20260112345.01', 'Claim\n\rNumber: 20260112345.01', 'Claim \r\n Number: 20260112345.01', 'Claim\r\n\tNumber: 20260112345.01', 'Claim -\r\nNumber: 20260112345.01',
]]);
sections.push(['2 a heading, a line that holds one stray mark or an empty table row, and a number word on the number\'s line (controls first: a true blank line, a rule)', [
  'STATEMENT\n\nNo. 900-12-3456150.00',
  'STATEMENT\n-----\nNo. 900-12-3456150.00',
  'STATEMENT\n.\nNo. 900-12-3456150.00',
  'STATEMENT\n\'\nNo. 900-12-3456150.00',
  'STATEMENT\n,\nID: 202-555-0123150.00',
  'STATEMENT\n-\nNo. 900-12-3456150.00',
  'STATEMENT\n*\nNo. 900-12-3456150.00',
  'STATEMENT\n|\nNo. 900-12-3456150.00',
  'STATEMENT\n/\nNumber 900-12-3456150.00',
  'STATEMENT\n  .  \nNo. 900-12-3456150.00',
  'REMITTANCE ADVICE\n| |\nNo. 900-12-3456150.00',
  '| STATEMENT             |\n|                       |\n| No. 900-12-3456150.00 |',
  '| PATIENT STATEMENT |           |\n|                   |           |\n| ID                | 900-12-3456150.00 |',
  'Notice\n( )\nNo. 202-555-0123150.00',
  'STATEMENT\n.\n900-12-3456150.00',
  'STATEMENT\n.\n.\nNo. 900-12-3456150.00',
  'STATEMENT\nJane Zephyra\nNo. 900-12-3456150.00',
  'STATEMENT\n.\nNo. 900-12-34567\nService 01/01/2020-150.00 Paid',
]]);
sections.push(['3 DATE_AFTER_REACH: a two-digit day, a joiner, SEPTEMBER, its point, two characters and the year fill the 20 characters', [
  'Row 366-535-169012-September, 2000.00',
  'Row 366-535-169012-September., 2000.00',
  'Row 366-535-169012September., 2000.00',
]]);
for (const [name, letters] of sections) {
  console.log(`\n## ${name}`);
  for (const text of letters) console.log(line(H, P, B, text).row);
}

// (4) time, per tree in its own process
const letters = [
  { id: 'advice-26', text: `REMITTANCE ADVICE\n${'-+'.repeat(26)}-\nPaid 20260112345.01` },
  { id: 'advice-28', text: `REMITTANCE ADVICE\n${'-+'.repeat(28)}-\nPaid 20260112345.01` },
  { id: 'advice-30', text: `REMITTANCE ADVICE\n${'-+'.repeat(30)}-\nPaid 20260112345.01` },
  { id: 'nearer-noun-28', text: `Statement\n${'=+'.repeat(28)}=\nAccount 802-45-678901.50` },
  { id: 'grid-27', text: `Claim\n+${'--+'.repeat(27)}\n| Paid | 20260112345.01 |` },
  { id: 'grid-30', text: `Claim\n+${'--+'.repeat(30)}\n| Paid | 20260112345.01 |` },
];
fs.mkdirSync('/home/user/review-j/t', { recursive: true });
fs.writeFileSync('/home/user/review-j/t/probe3.json', JSON.stringify(letters));
console.log('\n## 4 time: a rule or a grid of "+" between dashes or "=" under a listed noun, a word before the number');
for (const { id, text } of letters) console.log(`  ${id}: ${JSON.stringify(text)}`);
for (const [tree, cap] of [['head', 75000], ['before', 15000], ['base', 15000]] as const) {
  const p = spawnSync(process.execPath, ['/home/user/review-j/time.mts', 'child', tree, '/home/user/review-j/t/probe3.json'], { timeout: cap, killSignal: 'SIGKILL', encoding: 'utf8' });
  const rows = (p.stdout ?? '').trim().split('\n').filter((row) => row.startsWith('done') || row.startsWith('start'));
  const done = rows.filter((row) => row.startsWith('done')).map((row) => { const f = row.split('\t'); return `${f[1]} ${f[2]}ms ${f[3]}`; });
  const last = rows[rows.length - 1] ?? '';
  console.log(`  ${tree}: ${done.join('; ')}${last.startsWith('start') ? `; ${last.split('\t')[1]} NO RETURN in ${cap / 1000}s (killed)` : ''}`);
}

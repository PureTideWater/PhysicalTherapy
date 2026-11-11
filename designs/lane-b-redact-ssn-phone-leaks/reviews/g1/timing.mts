// node timing.mts: head against before on long inputs built from this round's new readings (ms for redact + holdsIdentifier).
import { pathToFileURL } from 'node:url';
import { TREES, patient, claims } from './lib.mts';
const mods: Record<string, any> = {};
for (const k of ['head', 'before']) mods[k] = await import(pathToFileURL(TREES[k]!).href);
const inputs: [string, string][] = [
  ['list numbers', 'Phone (2) 555-0100\n'.repeat(2500)], ['ordinal list numbers', 'Phone\n( 2nd ) 12 '.repeat(2500)], ['currency before mask', '$' + '1,'.repeat(20000) + 'XXX-XX-3456'], ['digits before mask', 'Paid 150XXX-XX-3456 '.repeat(2500)],
  ['month words before year', 'Jan 1, '.repeat(6000) + '2020900-12-3456'], ['parentheses', '(202) '.repeat(6000) + '555-0123150.00'], ['nouns over breaks', 'Statement\n'.repeat(4000) + '900-12-3456150.00'], ['bare and dates', '9001234562020-01-02150.00 '.repeat(1500)], ['ssn on file', 'SSN on file: 900-12-345678\n'.repeat(1500)], ['soc sec gap', 'Soc' + ' '.repeat(30000) + 'Sec (2) 555-0100'],
];
for (const [name, text] of inputs) {
  const row = ['head', 'before'].map((k) => { const R = mods[k]; const t = performance.now(); const s = R.redactLetterForScreen(text, patient, claims); const refused = R.holdsIdentifier(s.text, patient, claims); return `${k} ${(performance.now() - t).toFixed(0)} ms${refused ? ' R' : ' S'}`; });
  console.log(`  ${name} (${text.length} chars): ${row.join(' | ')}`);
}

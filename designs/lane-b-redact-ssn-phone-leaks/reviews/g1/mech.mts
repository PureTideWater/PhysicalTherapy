// node mech.mts: the head with one line of this round's delta put back at a time (copies under ./patched), on each finding's letters.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { patient, claims } from './lib.mts';
import { FINDINGS } from './findings.mts';
const HEAD = '/home/user/fix/packages/model-gateway/src/redact.ts';
const OUT = '/home/user/review-g1/patched';
fs.mkdirSync(OUT, { recursive: true });
const rel = path.relative(OUT, path.dirname(HEAD)).split(path.sep).join('/');
const rewired = fs.readFileSync(HEAD, 'utf8').replace(/(\bfrom\s+['"]|\bimport\s*\(\s*['"]|\bimport\s+['"])(\.\.?\/)/g, (_m, a, b) => `${a}${rel}/${b}`);
const PATCHES: [string, string, string][] = [
  ['none', '', ''],
  ['a', 'if (strict && !blocked && listNumberAt(text, start, end)) {', 'if (false && strict && !blocked && listNumberAt(text, start, end)) {'],
  ['b', "!(g1 + g2).includes('.')", "!g1.includes('.')"],
  ['c', 'if (!inCurrency && head === 0 && !parenthesized) {', 'if (!inCurrency && head === 0) {'],
  ['d', 'return noun !== null && (before.slice(noun.index).match(LINE_BREAKS) ?? []).length <= 1;', "return noun !== null && !new RegExp('(?:' + SSN_LABEL.source + ')[ \\\\t]*$', 'u').test(before.slice(0, noun.index)) && (before.slice(noun.index).match(LINE_BREAKS) ?? []).length <= 1;"],
  ['e', '${BARE_DATE_JOIN}(?:0[1-9]|[12][0-9]|3[01])`,', '${BARE_DATE_JOIN}(?:0[1-9]|[12][0-9]|3[01]|[1-9](?![0-9]))`,'],
];
const mods: Record<string, any> = {};
for (const [name, find, repl] of PATCHES) {
  let text = rewired;
  if (find) { const n = text.split(find).length - 1; if (n !== 1) { console.log(`patch ${name}: ${n} occurrences, skipped`); continue; } text = text.replace(find, () => repl); }
  const file = path.join(OUT, `redact-${name}.ts`);
  fs.writeFileSync(file, text);
  try { mods[name] = await import(pathToFileURL(file).href); } catch (error) { console.log(`patch ${name}: import failed: ${String(error).slice(0, 300)}`); }
}
const names = Object.keys(mods);
console.log(`S = sent, R = REFUSED; columns: ${names.join(' ')} (none = the head's copy unchanged; a = no listNumberAt in survivorIn; b = point looked for in g1 only; c = parenthesized sets shape; d = SSN_LABEL_THEN put back; e = one-digit day put back in BARE_DATE_AFTER)`);
for (const [id, letters] of Object.entries(FINDINGS)) {
  if (id.startsWith('X')) continue;
  console.log(`== ${id}`);
  for (const letter of letters) {
    const row = names.map((name) => { const R = mods[name]; const s = R.redactLetterForScreen(letter, patient, claims); return R.holdsIdentifier(s.text, patient, claims) ? 'R' : 'S'; });
    console.log(`  ${row.join(' ')}  ${JSON.stringify(letter)}`);
  }
}

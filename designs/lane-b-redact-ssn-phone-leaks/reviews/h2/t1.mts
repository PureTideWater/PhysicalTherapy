// node t1.mts <index> <tree>: best of two timings (ms) of redactLetterForScreen + holdsIdentifier on one letter, and the outcome.
import { pathToFileURL } from 'node:url';
import { TESTS, JANE, CLAIMS } from './tests.mts';
const SRC = 'packages/model-gateway/src/redact.ts';
const PATHS: Record<string, string> = { head: `/home/user/fix/${SRC}`, before: `/home/user/work/p13/before/${SRC}`, base: `/home/user/tree-ef3/${SRC}` };
const [, , idx, tree] = process.argv;
const R = await import(pathToFileURL(PATHS[tree as string] as string).href);
const [, text, patient = JANE] = TESTS[Number(idx)] as [string, string, any?];
let best = Infinity; let outcome = '';
for (let k = 0; k < 2; k += 1) {
  const t0 = performance.now();
  const s = R.redactLetterForScreen(text, patient, CLAIMS);
  const held = R.holdsIdentifier(s.text, patient, CLAIMS);
  const ms = performance.now() - t0;
  best = Math.min(best, ms);
  outcome = held ? 'REFUSED' : s.text === text ? 'same' : 'changed';
  if (ms > 4000) break;
}
console.log(`${best.toFixed(0)} ${outcome}`);

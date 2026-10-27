import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { price } from '@tp/pricing';

import { repositoryRoot } from '../content-files';
import { type GoldenFile, goldenPricingInput, readGoldenClaims } from './engine';

/**
 * The golden claims' traces for the calculation words' golden test (combined audit #38; docs/adr/0072, design 4.2):
 * each golden claim priced through the engine exactly as engine.golden.test.ts prices it (goldenPricingInput), and its
 * lines' traces written as canonical JSON (keys sorted, no whitespace) to
 * packages/packets/src/explain/__golden__/<claim>.traces.json. @tp/packets cannot reach the golden harness (it needs
 * @tp/rules, which @tp/packets does not import), and @tp/tools does not import @tp/packets, so the words' test reads
 * these committed traces; explain-traces.golden.test.ts prices every
 * claim again and requires each file to equal what this writes, byte for byte, so the copy cannot go stale while the
 * engine is frozen and fails loudly if a later ruling changes the engine. SYNTHETIC claims only, outside fixtures/ (the
 * engine freeze keeps fixtures/golden as it is). Run `pnpm tsx tools/golden-worksheet/write-explain-traces.ts` after
 * a change to the engine or a golden claim, then review the words' pins it moves.
 */

export const EXPLAIN_GOLDEN_DIR = 'packages/packets/src/explain/__golden__';

/** A JSON value with every object's keys sorted, so a file's text depends on its values alone. */
function sorted(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sorted);
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => [key, sorted(item)]),
    );
  }
  return value;
}

/** A golden claim's traces file: its claim file's name without `.json`, and its text. */
export function explainTracesFile(golden: GoldenFile, root = repositoryRoot): { readonly name: string; readonly text: string } {
  const name = `${path.basename(golden.file, '.json')}.traces.json`;
  const traces = price(goldenPricingInput(golden.claim, root)).map((line) => line.trace);
  return { name, text: `${JSON.stringify(sorted({ claim: golden.file, traces }))}\n` };
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const directory = path.join(repositoryRoot, EXPLAIN_GOLDEN_DIR);
  mkdirSync(directory, { recursive: true });
  const claims = readGoldenClaims();
  for (const golden of claims) {
    const { name, text } = explainTracesFile(golden);
    writeFileSync(path.join(directory, name), text);
  }
  process.stdout.write(`${String(claims.length)} golden claims' traces written to ${EXPLAIN_GOLDEN_DIR}\n`);
}

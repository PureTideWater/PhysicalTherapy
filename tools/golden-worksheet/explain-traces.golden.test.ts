import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { repositoryRoot } from '../content-files';
import { readGoldenClaims } from './engine';
import { EXPLAIN_GOLDEN_DIR, explainTracesFile } from './write-explain-traces';

/**
 * The calculation words' golden traces (combined audit #38; docs/adr/0072, design 4.2): every golden claim, priced
 * again in a test of its own (as engine.golden.test.ts prices them; docs/adr/0066, Part 4), must equal its committed
 * traces file under packages/packets/src/explain/__golden__ byte for byte, so the words' golden test there reads the
 * engine's own traces. A difference means the engine or a golden claim changed: write the files again with
 * `pnpm tsx tools/golden-worksheet/write-explain-traces.ts` and review the words' pins that move with them.
 */

const claims = readGoldenClaims();
const directory = path.join(repositoryRoot, EXPLAIN_GOLDEN_DIR);

describe('the golden traces the calculation words are pinned on', () => {
  it.each(claims.map((golden) => [path.basename(golden.file), golden] as const))('%s: the committed traces are the engine’s', (_name, golden) => {
    const { name, text } = explainTracesFile(golden);
    expect(readFileSync(path.join(directory, name), 'utf8'), `${name}: run pnpm tsx tools/golden-worksheet/write-explain-traces.ts`).toBe(text);
  });

  it('holds one traces file per golden claim, and no other', () => {
    const files = readdirSync(directory).filter((name) => name.endsWith('.traces.json')).sort();
    expect(files).toEqual(claims.map((golden) => `${path.basename(golden.file, '.json')}.traces.json`).sort());
    expect(files.length).toBeGreaterThan(100);
  });
});

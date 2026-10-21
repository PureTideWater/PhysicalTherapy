import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The oracle of the release read (audit #53 part 2; test matrix SCR-09) stays frozen and out of the product:
 * test-support/legacy-adapter.ts is adapter.ts at commit 3c1b289 with one import path changed, and nothing but a test,
 * the oracle's own files and the capacity harness's oracle (a test tool run in a child process) imports either file.
 */

const ROOT = path.resolve(import.meta.dirname, '../../../..');
const LEGACY = path.join(import.meta.dirname, 'test-support/legacy-adapter.ts');
/** SHA-256 of apps/worker/src/screening/adapter.ts at 3c1b289 (`git show 3c1b289:apps/worker/src/screening/adapter.ts | sha256sum`). */
const ADAPTER_AT_3C1B289 = '5a03ac8b0b856766f0176be24861d17de357a2213fbf53481035c5e448661337';
const ORACLE_IMPORT = /from\s+['"][^'"]*(?:test-support\/legacy-(?:adapter|release)|@tp\/worker\/screening-oracle)['"]/;
const ALLOWED_IMPORTER = /\.test\.tsx?$|^apps\/worker\/src\/screening\/test-support\/|^tools\/screening-capacity\/oracle\.ts$/;

function sources(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.') || entry.name === 'dist' || entry.name === 'cdk.out' || entry.name === 'coverage') {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      sources(full, found);
    } else if (/\.(?:ts|tsx|mts)$/.test(entry.name)) {
      found.push(full);
    }
  }
  return found;
}

describe('the release read’s oracle', () => {
  it('is adapter.ts as it was at 3c1b289, its import path aside', () => {
    const text = readFileSync(LEGACY, 'utf8');
    const body = text.slice(text.indexOf('*/\n\n') + 4).replace("from '../format'", "from './format'");
    expect(createHash('sha256').update(body, 'utf8').digest('hex')).toBe(ADAPTER_AT_3C1B289);
  });

  it('is imported by tests and the capacity harness’s oracle only, never by the product', () => {
    const importers = ['apps', 'packages', 'tools']
      .flatMap((top) => sources(path.join(ROOT, top)))
      .map((file) => path.relative(ROOT, file).split(path.sep).join('/'))
      .filter((file) => ORACLE_IMPORT.test(readFileSync(path.join(ROOT, file), 'utf8')));
    expect(importers.length).toBeGreaterThan(0);
    expect(importers.filter((file) => !ALLOWED_IMPORTER.test(file))).toEqual([]);
  });
});

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { PAGE_READ_LIMITS, readerArgv, readerEntry } from '@tp/contracts/pages';
import { describe, expect, it } from 'vitest';

/**
 * The page reader's entry in the worker's image (docs/adr/0033): build.ts bundles it as dist/page-reader.js beside
 * dist/main.js, and the bundled pages.ts starts it from there, allowed to read that one file. The weekly real-size test
 * reads a SYNTHETIC PDF through it in the real image (tools/release-capacity).
 */
describe("the worker bundle's page reader", () => {
  it('is built from page-reader.ts as dist/page-reader.js beside dist/main.js', () => {
    const build = readFileSync(path.resolve(import.meta.dirname, '../build.ts'), 'utf8');
    expect(build).toContain("main: 'src/main.ts',");
    expect(build).toContain("'page-reader': '../../packages/contracts/src/evidence/page-reader.ts',");
    expect(build).not.toContain('page-thread');
  });

  it('is started from beside the bundle, reading only itself', () => {
    const entry = readerEntry('file:///app/dist/main.js');
    expect(entry.href).toBe('file:///app/dist/page-reader.js');
    expect(readerArgv(PAGE_READ_LIMITS, entry)).toContain('--allow-fs-read=/app/dist/page-reader.js');
  });
});

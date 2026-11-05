import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { PAGE_READ_LIMITS, type PageReadLimits, readInChild, readerArgv, readerEntry } from '@tp/contracts/pages';
import { syntheticPdf, syntheticXlsx } from '@tp/contracts/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * The page reader's entry in the worker's image (docs/adr/0033): build.ts bundles it as dist/page-reader.js beside
 * dist/main.js, and the bundled pages.ts starts it from there, allowed to read that one file. The weekly real-size test
 * reads its SYNTHETIC PDF in the harness's own process, from the source tree (tools/release-capacity/scenario.ts), so it
 * never starts the image's reader: the last test here builds the bundle as build.ts does and reads SYNTHETIC documents
 * through the bundled reader, under the image's argv.
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

describe('the bundled page reader, built as the image builds it (test matrix SEC-24)', () => {
  let out = '';
  beforeAll(() => {
    out = mkdtempSync(path.join(tmpdir(), 'tp-worker-bundle-'));
    const built = spawnSync(process.execPath, ['--import', 'tsx', 'build.ts', out], { cwd: path.resolve(import.meta.dirname, '..'), encoding: 'utf8', timeout: 120_000 });
    expect(built.status, built.stderr).toBe(0);
  }, 120_000);
  afterAll(() => {
    rmSync(out, { recursive: true, force: true });
  });

  it('reads a PDF, a workbook and a CSV allowed to read only its own file, at its own heap', async () => {
    const entry = pathToFileURL(path.join(out, 'page-reader.js'));
    expect(existsSync(entry)).toBe(true);
    expect(readerArgv(PAGE_READ_LIMITS, entry)).toContain(`--allow-fs-read=${path.join(out, 'page-reader.js')}`);
    const limits: PageReadLimits = PAGE_READ_LIMITS;
    const caps = { maxPages: limits.maxPages, maxTextCharacters: limits.maxTextCharacters, maxInflatedBytes: limits.maxInflatedBytes };
    // SYNTHETIC documents, built here.
    const pdf = await readInChild({ format: 'pdf', bytes: syntheticPdf([['SYNTHETIC PROVIDER AGREEMENT'], ['SYNTHETIC EXHIBIT A']]), ...caps }, limits, entry);
    expect(pdf).toEqual({ kind: 'pages', pages: ['SYNTHETIC PROVIDER AGREEMENT', 'SYNTHETIC EXHIBIT A'], heapSizeLimit: 240 * 1024 * 1024 });
    const xlsx = await readInChild({ format: 'xlsx', bytes: syntheticXlsx([{ name: 'Fees', rows: [['SYNTHETIC CODE', 'RATE'], ['97110', 45]] }], { deflate: true }), ...caps }, limits, entry);
    expect(xlsx).toEqual({ kind: 'pages', pages: ['SYNTHETIC CODE\tRATE\n97110\t45'], heapSizeLimit: 240 * 1024 * 1024 });
    const csv = await readInChild({ format: 'csv', bytes: new TextEncoder().encode('SYNTHETIC,FEE\n97110,45\n'), ...caps }, limits, entry);
    expect(csv).toEqual({ kind: 'pages', pages: ['SYNTHETIC\tFEE\n97110\t45'], heapSizeLimit: 240 * 1024 * 1024 });
  }, 60_000);
});

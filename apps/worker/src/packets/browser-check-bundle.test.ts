import path from 'node:path';

import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

/**
 * The browser's packet check as a bundler sees it (docs/adr/0047, amendment of 2026-11-11): bundled for a browser,
 * @tp/packets/check holds neither the letter reader's matcher (@tp/redact) nor the server's reading for the case's
 * identifiers (verifier/identifiers.ts), and reads no Node module (a browser bundle of one does not build). The
 * packets package's own test (check-browser.test.ts) holds the same of the modules as they load; this one holds it of
 * every static import, loaded or not. It is here because the worker is the package that bundles with esbuild.
 */

const PACKETS = path.resolve(import.meta.dirname, '../../../../packages/packets/src');
const inputsOf = async (entry: string, platform: 'browser' | 'node') => {
  const result = await build({ entryPoints: [path.join(PACKETS, entry)], bundle: true, write: false, metafile: true, platform, format: 'esm', logLevel: 'silent' });
  return Object.keys(result.metafile.inputs);
};
const SERVER_ONLY = /(?:^|\/)packages\/redact\/|(?:^|\/)verifier\/identifiers\.ts$|(?:^|\/)packages\/model-gateway\//;

describe('the browser’s packet check, bundled', () => {
  it('holds neither the letter reader’s matcher nor the server’s reading, and builds for a browser', async () => {
    const inputs = await inputsOf('check.ts', 'browser');
    expect(inputs.some((file) => file.endsWith('packages/packets/src/check.ts'))).toBe(true);
    expect(inputs.some((file) => file.endsWith('packages/packets/src/verifier/mismatches.ts'))).toBe(true);
    expect(inputs.filter((file) => SERVER_ONLY.test(file))).toEqual([]);
  });

  it('is told apart from the server’s entry, which holds both', async () => {
    const inputs = await inputsOf('verifier/index.ts', 'node');
    expect(inputs.filter((file) => SERVER_ONLY.test(file)).map((file) => file.replace(/^.*packages\//, 'packages/')).sort()).toEqual([
      'packages/packets/src/verifier/identifiers.ts',
      'packages/redact/src/confusables.ts',
      'packages/redact/src/index.ts',
      'packages/redact/src/redact.ts',
    ]);
    // The server's entry reads a Node module (node:crypto), so it does not build for a browser at all.
    await expect(inputsOf('verifier/index.ts', 'browser')).rejects.toThrow();
  });
});

import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { type Spawn, runStryker } from './stryker';

/**
 * Stryker run by path (tools/stryker/stryker.ts; docs/adr/0066, Part 7; test matrix CI-29): this Node on the bin
 * @stryker-mutator/core's own manifest names, found from the root it is given, so no root script, pre or post script, or
 * other package's `stryker` bin decides what runs. Each case records the spawn it would make, so no process starts.
 */

interface Spawned {
  readonly command: string;
  readonly args: readonly string[];
  readonly options: Parameters<Spawn>[2];
}

/** A spawn that records each call and answers with the status given. */
function recorder(status = 0): { calls: Spawned[]; spawn: Spawn } {
  const calls: Spawned[] = [];
  return {
    calls,
    spawn: (command, args, options) => {
      calls.push({ command, args: [...args], options });
      return { status };
    },
  };
}

/** A synthetic root, its files written relative to it; removed by the caller. */
function syntheticRoot(files: Readonly<Record<string, string>>): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'tp-stryker-'));
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
  return root;
}

const CORE = 'node_modules/@stryker-mutator/core';
const coreManifest = (bin: unknown) => JSON.stringify({ name: '@stryker-mutator/core', version: '0.0.0', bin, exports: { '.': './dist/index.js', './package.json': './package.json' } });

describe('Stryker by path', () => {
  it('runs @stryker-mutator/core’s bin.stryker, found through its package.json from the given root, on this Node, in that root', () => {
    const root = syntheticRoot({ 'package.json': '{"name":"synthetic"}', [`${CORE}/package.json`]: coreManifest({ stryker: './bin/stryker.js' }), [`${CORE}/bin/stryker.js`]: '' });
    try {
      const env = { TP_MUTATION_SHARD: 'synthetic' };
      const { calls, spawn } = recorder();
      expect(runStryker(['run', 'stryker/money.config.mjs'], env, root, spawn)).toBe(0);
      expect(calls).toEqual([{ command: process.execPath, args: [path.join(realpathSync(root), CORE, 'bin/stryker.js'), 'run', 'stryker/money.config.mjs'], options: { cwd: root, stdio: 'inherit', env } }]);
      // Stryker's exit status is the run's.
      expect(runStryker(['run', 'x.config.mjs'], env, root, recorder(3).spawn)).toBe(3);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails, naming the package, and starts nothing when the root holds no usable @stryker-mutator/core of its own', () => {
    for (const [why, files, message] of [
      ['not installed', { 'package.json': '{"name":"synthetic"}' }, '@stryker-mutator/core is not installed in '],
      ['no stryker bin', { [`${CORE}/package.json`]: coreManifest('./bin/stryker.js') }, "@stryker-mutator/core's package.json names no bin.stryker"],
      ['a bin outside the package', { [`${CORE}/package.json`]: coreManifest({ stryker: '../../../evil.js' }), 'evil.js': '' }, "@stryker-mutator/core's bin.stryker, ../../../evil.js, lies outside the package"],
      ['a bin that is not there', { [`${CORE}/package.json`]: coreManifest({ stryker: './bin/stryker.js' }) }, "@stryker-mutator/core's bin.stryker, ./bin/stryker.js, is not installed"],
      // The root is `repo`, and the only core is its parent directory's: resolvable from the root, and still refused.
      ['one a parent directory supplies', { 'repo/package.json': '{"name":"synthetic"}', [`${CORE}/package.json`]: coreManifest({ stryker: './bin/stryker.js' }), [`${CORE}/bin/stryker.js`]: '' }, /^@stryker-mutator\/core is not installed in .+, outside it\), so Stryker cannot run by path/],
    ] as const) {
      const top = syntheticRoot(files);
      const root = 'repo/package.json' in files ? path.join(top, 'repo') : top;
      try {
        const { calls, spawn } = recorder();
        expect(() => runStryker(['run', 'x.config.mjs'], {}, root, spawn), why).toThrow(message);
        expect(calls, why).toEqual([]);
      } finally {
        rmSync(top, { recursive: true, force: true });
      }
    }
  });
});

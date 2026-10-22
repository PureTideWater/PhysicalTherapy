import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { repositoryRoot } from '../content-files';

/**
 * The mutation runner names a test as Vitest 5 filters it (pnpm-workspace.yaml, patchedDependencies). Stryker selects a
 * mutant's covering tests by a name pattern built from the names the runner gives them, and Vitest 5 matches that
 * pattern against a test's fullTestName: its describe names and its own joined by " > ". @stryker-mutator/vitest-runner
 * 10.0.0 joined them by spaces, so the pattern selected no test and every covered mutant survived, whatever the tests
 * did. The patch has the runner use fullTestName, in the helper the runner reads results with and in the setup file it
 * copies into each test run, which keeps its own copy of the function.
 */
const RUNNER_DIST = path.join(path.dirname(createRequire(path.join(repositoryRoot, 'package.json')).resolve('@stryker-mutator/vitest-runner/package.json')), 'dist/src');

interface NamedTask {
  readonly name: string;
  readonly fullTestName?: string;
  readonly suite?: NamedTask;
}

const helpers = (await import(pathToFileURL(path.join(RUNNER_DIST, 'test-helpers.js')).href)) as { collectTestName: (task: NamedTask) => string };

/** The source of a function the file declares, from its `function` to the closing brace at the line's start. */
function functionSource(file: string, name: string): string {
  const text = readFileSync(path.join(RUNNER_DIST, file), 'utf8');
  const found = new RegExp(`(?:export )?function ${name}\\([\\s\\S]*?\\n\\}`).exec(text);
  if (found === null) throw new Error(`${file} declares no function ${name}`);
  return found[0].replace(/^export /, '');
}

describe('the mutation runner', () => {
  describe('names a test', () => {
    it('as Vitest filters it, by its fullTestName', ({ task }) => {
      expect(task.fullTestName).toBe('the mutation runner > names a test > as Vitest filters it, by its fullTestName');
      expect(helpers.collectTestName(task)).toBe(task.fullTestName);
    });

    it('in the setup file it copies into each run as in its own helper', () => {
      expect(functionSource('stryker-setup.js', 'collectTestName')).toBe(functionSource('test-helpers.js', 'collectTestName'));
      expect(functionSource('stryker-setup.js', 'collectTestName')).toContain('fullTestName');
    });
  });
});

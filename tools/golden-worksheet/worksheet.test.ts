import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { repositoryRoot } from '../content-files';

/**
 * The golden worksheet is Python (standard library only) so that it shares no code with
 * packages/pricing; its unit tests are Python too. `pnpm test` runs them here, isolated (-I) so
 * nothing from the environment or the working directory is imported.
 */
/**
 * The worksheet's own tests recompute every golden claim in one Python process: 1.0 to 1.5 s on CI, about ten seconds
 * on one CPU shared with eight busy loops, where vitest's five-second default failed it. Sixty seconds, and the child is
 * killed after it, so a hang fails the test rather than holding it.
 */
const TIMEOUT_MS = 60_000;

describe('the golden worksheet', () => {
  it('passes its own unit tests, leaving no bytecode in the source tree', () => {
    const result = spawnSync('python3', ['-I', '-B', 'tools/golden-worksheet/test_golden_worksheet.py'], { cwd: repositoryRoot, encoding: 'utf8', timeout: TIMEOUT_MS, killSignal: 'SIGKILL' });
    expect(result.error).toBeUndefined();
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stderr).toMatch(/\nOK\n$/);
    expect(existsSync(path.join(repositoryRoot, 'tools/golden-worksheet/__pycache__'))).toBe(false);
  }, TIMEOUT_MS);
});

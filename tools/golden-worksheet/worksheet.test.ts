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
describe('the golden worksheet', () => {
  it('passes its own unit tests, leaving no bytecode in the source tree', () => {
    const result = spawnSync('python3', ['-I', '-B', 'tools/golden-worksheet/test_golden_worksheet.py'], { cwd: repositoryRoot, encoding: 'utf8' });
    expect(result.error).toBeUndefined();
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stderr).toMatch(/\nOK\n$/);
    expect(existsSync(path.join(repositoryRoot, 'tools/golden-worksheet/__pycache__'))).toBe(false);
  });
});

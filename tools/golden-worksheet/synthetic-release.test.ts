import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { MANIFEST_FILE, RELEASE_NOTES_FILE } from '@tp/rules';
import { listContentFiles } from '@tp/rules/content';
import { afterEach, describe, expect, it } from 'vitest';

import { repositoryRoot } from '../content-files';
import { SYNTHETIC_RELEASE_DIR } from '../release/synthetic';
import { checkContent } from '../verify-content/check';
import { SECOND_YEAR_RELEASE_DIR, SECOND_YEAR_SOURCES_DIR, renderSecondYearRelease } from './synthetic-release';

const committed = (dir: string) => listContentFiles(path.join(repositoryRoot, dir)).map((file) => file.path);

describe('SYNTHETIC release 900002', () => {
  let scratch: string | undefined;
  afterEach(() => {
    if (scratch !== undefined) {
      rmSync(scratch, { recursive: true, force: true });
      scratch = undefined;
    }
  });

  it('is exactly what tools/golden-worksheet/synthetic-release.ts builds', () => {
    const rendered = renderSecondYearRelease();
    expect(committed(SECOND_YEAR_RELEASE_DIR)).toEqual([...rendered.keys()].sort());
    for (const [file, text] of rendered) {
      expect(readFileSync(path.join(repositoryRoot, SECOND_YEAR_RELEASE_DIR, file), 'utf8'), file).toBe(text);
    }
  });

  it('carries every record file of release 900001 unchanged and adds only 2025 records', () => {
    const first = committed(SYNTHETIC_RELEASE_DIR).filter((file) => file !== MANIFEST_FILE && file !== RELEASE_NOTES_FILE);
    for (const file of first) {
      expect(readFileSync(path.join(repositoryRoot, SECOND_YEAR_RELEASE_DIR, file), 'utf8'), file).toBe(readFileSync(path.join(repositoryRoot, SYNTHETIC_RELEASE_DIR, file), 'utf8'));
    }
    const added = committed(SECOND_YEAR_RELEASE_DIR).filter((file) => !first.includes(file) && file !== MANIFEST_FILE && file !== RELEASE_NOTES_FILE);
    expect(added).toEqual([
      'conversion_factor/2025/conversion-factor-SYNTHETIC-2025-pass-1.json',
      'pfs_gpci/2025/GPCI_SYNTHETIC_2025.json',
      'pfs_rvu/2025/PPRRVU_SYNTHETIC_2025.json',
    ]);
  });

  it('passes the content checker', () => {
    expect(checkContent(repositoryRoot, [SECOND_YEAR_RELEASE_DIR]).problems).toEqual([]);
  });

  it('refuses to build when the two preparations of the 2025 conversion factors differ', () => {
    scratch = mkdtempSync(path.join(tmpdir(), 'tp-release-900002-'));
    cpSync(path.join(repositoryRoot, SYNTHETIC_RELEASE_DIR), path.join(scratch, SYNTHETIC_RELEASE_DIR), { recursive: true });
    cpSync(path.join(repositoryRoot, SECOND_YEAR_SOURCES_DIR), path.join(scratch, SECOND_YEAR_SOURCES_DIR), { recursive: true });
    cpSync(path.join(repositoryRoot, 'fixtures/synthetic/cms'), path.join(scratch, 'fixtures/synthetic/cms'), { recursive: true });
    expect(renderSecondYearRelease(scratch).get(MANIFEST_FILE)).toBe(readFileSync(path.join(repositoryRoot, SECOND_YEAR_RELEASE_DIR, MANIFEST_FILE), 'utf8'));
    const secondPass = path.join(scratch, SECOND_YEAR_SOURCES_DIR, 'conversion-factor-SYNTHETIC-2025-pass-2.csv');
    writeFileSync(secondPass, readFileSync(secondPass, 'utf8').replaceAll('19.7123', '19.7124'));
    expect(() => renderSecondYearRelease(scratch)).toThrow(/only in the second pass: qualifying_apm 19\.7124/);
  });
});

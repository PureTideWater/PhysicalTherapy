import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { readApproverRecords } from '../../packages/db/src/domain-model/sources';
import { repositoryRoot } from '../content-files';

/**
 * .github/CODEOWNERS (docs/adr/0063): the founder's review on the schema and its approval, the code that decides
 * an approval, the releases, CLAUDE.md, .claude and .github, once the ruleset requires code owners' review. GitHub
 * reads the first CODEOWNERS it finds (.github/, the root, docs/), and a line it cannot read is ignored, so these
 * tests hold the file to what GitHub reads.
 */
const FILE = path.join(repositoryRoot, '.github/CODEOWNERS');

const rules = (): { readonly pattern: string; readonly owners: readonly string[] }[] =>
  readFileSync(FILE, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '' && !line.startsWith('#'))
    .map((line) => {
      const [pattern = '', ...owners] = line.trim().split(/\s+/);
      return { pattern, owners };
    });

/** A CODEOWNERS pattern as a regular expression over repository paths (anchored ones only, which is all this file uses). */
function matcher(pattern: string): RegExp {
  const body = pattern
    .slice(1)
    .split('')
    .map((c) => (c === '*' ? '[^/]*' : c.replace(/[.+?^${}()|[\]\\]/g, '\\$&')))
    .join('');
  return new RegExp(`^${body}${pattern.endsWith('/') ? '' : '$'}`);
}

describe('.github/CODEOWNERS', () => {
  it('is the only CODEOWNERS file, so GitHub reads this one', () => {
    expect(existsSync(FILE)).toBe(true);
    expect(existsSync(path.join(repositoryRoot, 'CODEOWNERS'))).toBe(false);
    expect(existsSync(path.join(repositoryRoot, 'docs/CODEOWNERS'))).toBe(false);
  });

  it('names the paths the founder approved, and the code that decides an approval', () => {
    expect(rules().map((rule) => rule.pattern)).toEqual([
      '/packages/db/migrations/',
      '/docs/product/domain-model.md',
      '/packages/db/domain-model/',
      '/packages/db/src/domain-model/',
      '/packages/db/src/cli/domain-model.ts',
      '/tools/approval-of-record/',
      '/content/releases/',
      '/fixtures/synthetic/rules/release-*/',
      '/CLAUDE.md',
      '/.claude/',
      '/.github/',
    ]);
  });

  it('names as owners only logins on the approver list', () => {
    const logins = new Set(readApproverRecords().map((record) => `@${record.github.toLowerCase()}`));
    for (const rule of rules()) {
      expect(rule.owners.length, rule.pattern).toBeGreaterThan(0);
      for (const owner of rule.owners) expect(logins.has(owner.toLowerCase()), `${rule.pattern} ${owner}`).toBe(true);
    }
  });

  it('uses only patterns GitHub reads, each matching a tracked file but the releases directory publish-content creates', () => {
    const tracked = execFileSync('git', ['-C', repositoryRoot, 'ls-files'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\n');
    for (const { pattern } of rules()) {
      // Anchored, no negation, no character ranges or escapes (GitHub's CODEOWNERS reads none of them).
      expect(pattern.startsWith('/'), pattern).toBe(true);
      expect(pattern, pattern).not.toMatch(/[!\\[\]]/);
      const matching = tracked.filter((file) => matcher(pattern).test(file));
      if (pattern !== '/content/releases/') expect(matching.length, pattern).toBeGreaterThan(0);
    }
    expect(tracked.filter((file) => matcher('/fixtures/synthetic/rules/release-*/').test(file)).every((file) => /^fixtures\/synthetic\/rules\/release-[^/]+\//.test(file))).toBe(true);
    expect(matcher('/.github/').test('.github/workflows/ci.yml')).toBe(true);
    expect(matcher('/CLAUDE.md').test('docs/CLAUDE.md')).toBe(false);
  });
});

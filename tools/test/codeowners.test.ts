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

  it('names the paths the founder approved, the code that decides an approval, and the code that decides whether the gate runs', () => {
    expect(rules().map((rule) => rule.pattern)).toEqual([
      '/packages/db/migrations/',
      '/docs/product/domain-model.md',
      '/packages/db/domain-model/',
      '/packages/db/src/domain-model/',
      '/packages/db/src/cli/domain-model.ts',
      '/tools/approval-of-record/',
      '/packages/db/src/migrate.ts',
      '/packages/db/src/cli/migrate.ts',
      '/packages/db/src/catalog.ts',
      '/vitest.config.ts',
      '/package.json',
      '/packages/db/package.json',
      '/packages/synth/src/guard/',
      '/tools/check-releases-immutable.sh',
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

  it('covers what the schema gate runs on: the migrations directory migrate.ts reads, the db test project, and the scripts that run them', () => {
    const owned = (file: string): boolean => rules().some(({ pattern }) => matcher(pattern).test(file));
    // migrate.ts names the directory of migrations; the db project of vitest.config.ts runs domain-model.db.test.ts.
    expect(readFileSync(path.join(repositoryRoot, 'packages/db/src/migrate.ts'), 'utf8')).toContain("path.resolve(import.meta.dirname, '../migrations')");
    expect(readFileSync(path.join(repositoryRoot, 'vitest.config.ts'), 'utf8')).toContain("name: 'db'");
    const scripts = (file: string): Record<string, string> => (JSON.parse(readFileSync(path.join(repositoryRoot, file), 'utf8')) as { scripts: Record<string, string> }).scripts;
    expect(scripts('package.json')['test:db']).toBe('vitest run --project db');
    expect(scripts('package.json')['db:domain-model']).toBe('tsx packages/db/src/cli/domain-model.ts');
    expect(scripts('packages/db/package.json')['db:domain-model']).toBe('tsx src/cli/domain-model.ts');
    for (const file of [
      'packages/db/src/migrate.ts',
      'packages/db/src/cli/migrate.ts',
      'packages/db/src/catalog.ts',
      'packages/db/src/domain-model/domain-model.db.test.ts',
      'packages/db/src/domain-model/domain-model-drift.db.test.ts',
      'vitest.config.ts',
      'package.json',
      'packages/db/package.json',
      'packages/synth/src/guard/cli.ts',
      'packages/synth/src/guard/pinned-tables.json',
      'tools/check-releases-immutable.sh',
      '.github/workflows/ci.yml',
      '.claude/hooks/fixture-guard.sh',
    ]) {
      expect(owned(file), file).toBe(true);
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
    // The root package.json alone: a package's own is not the root's (packages/db's is named on its own line).
    expect(matcher('/package.json').test('apps/web/package.json')).toBe(false);
  });
});

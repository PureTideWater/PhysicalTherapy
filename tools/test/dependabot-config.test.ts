import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import { repositoryRoot } from '../content-files';
import { workspaceDirs } from '../typecheck/run';

/**
 * Dependabot's configuration (test matrix CI-12; docs/adr/0066, Part 2 and its amendment of 2026-11-01;
 * docs/runbooks/dependency-upgrades.md): the groups in their order, each dependency in exactly one of them
 * (minor-and-patch excludes every pattern a specific group names, and a model of Dependabot's own group assignment
 * routes every direct dependency of the workspace to the group this file means for it), the majors left to deliberate
 * upgrades, the cooldowns the co-founder's CQ1 (a) set, three weekly days none of which is Monday, one entry for each
 * ecosystem the repository uses, and no target branch, since Dependabot reads the file from the default branch, which
 * is the build branch until launch (the founder's F1 (a)). Every read of the configuration goes through CI_TREE when it
 * is set (workflows.test.ts, the simulated rewrite); the workspace's manifests are read from the repository.
 */

const CI_ROOT = process.env.CI_TREE ?? repositoryRoot;

interface Update {
  readonly 'package-ecosystem': string;
  readonly directory?: string;
  readonly directories?: string[];
  readonly schedule?: { readonly interval: string; readonly day?: string; readonly time?: string; readonly timezone?: string };
  readonly 'open-pull-requests-limit'?: number;
  readonly cooldown?: Record<string, unknown>;
  readonly ignore?: readonly { readonly 'dependency-name': string; readonly 'update-types'?: readonly string[] }[];
  readonly groups?: Record<string, Group>;
  readonly 'multi-ecosystem-group'?: string;
  readonly patterns?: string[];
  readonly 'target-branch'?: string;
}

interface Group {
  readonly patterns?: string[];
  readonly 'exclude-patterns'?: string[];
  readonly 'update-types'?: string[];
  readonly 'applies-to'?: string;
}

interface Config {
  readonly version: number;
  readonly 'multi-ecosystem-groups'?: Record<string, { readonly schedule: NonNullable<Update['schedule']> }>;
  readonly updates: readonly Update[];
}

const config = (): Config => parse(readFileSync(path.join(CI_ROOT, '.github/dependabot.yml'), 'utf8')) as Config;
const entry = (ecosystem: string): Update => {
  const found = config().updates.find((update) => update['package-ecosystem'] === ecosystem);
  if (found === undefined) throw new Error(`dependabot.yml has no ${ecosystem} entry`);
  return found;
};
const MAJOR = ['version-update:semver-major'];
/** The specific version-update groups, in the file's order: every group but minor-and-patch and security. */
const SPECIFIC = ['browser-tests', 'anthropic-sdk', 'pg-boss', 'next', 'aws-sdk', 'aws-cdk'];

/**
 * Dependabot's group assignment for a version-updates job, ported from dependabot-core 85379652 (2026-10-30):
 * - the job sees only the groups that apply to version updates (updater/lib/dependabot/dependency_group_engine.rb, from_job_config);
 * - in the file's order, a group takes a dependency it contains unless the specificity rule skips it there
 *   (assign_dependency_to_matching_groups, should_skip_due_to_specificity?);
 * - a group contains a dependency it already took, else one no exclude-pattern matches and a pattern matches, or any
 *   when it has no patterns (common/lib/dependabot/dependency_group.rb, contains?), each pattern a case-insensitive glob
 *   (common/lib/wildcard_matcher.rb);
 * - a group with patterns gives the dependency up when another group whose update-types overlap its own contains it with
 *   a higher score (updater/lib/dependabot/updater/pattern_specificity_calculator.rb): a group that already took it
 *   1000, an exact name 1000, a name without a wildcard 500, a group with no patterns 500, a wildcard pattern 100 less
 *   10 a wildcard plus its length past 5 (at least 1), '*' 1, excluded 0; a group with no patterns, or scoring 1000,
 *   never gives one up.
 * The file uses no dependency-type or group-by rule (the exact objects below hold that), so the port has neither.
 * GitHub's documentation says only "the first group that it matches" (dependabot-options-reference.md, groups); the
 * configuration must route each dependency the same way under both rules, which minor-and-patch's exclusions make true.
 */
const wildcard = (pattern: string, name: string): boolean =>
  new RegExp(`^${pattern.toLowerCase().split('*').map((part) => part.replace(/[.+?^${}()|[\]\\/-]/g, '\\$&')).join('.*')}$`).test(name.toLowerCase());
const excludes = (group: Group, name: string): boolean => (group['exclude-patterns'] ?? []).some((pattern) => wildcard(pattern, name));
const patternScore = (pattern: string, name: string): number => {
  if (pattern === name) return 1000;
  if (pattern === '*') return 1;
  const wildcards = pattern.split('*').length - 1;
  return wildcards === 0 ? 500 : Math.max(100 - 10 * wildcards + Math.max(pattern.length - 5, 0), 1);
};
/** Every version-update group that takes the dependency, in the file's order. */
const dependabotMembers = (groups: Record<string, Group>, name: string): string[] => {
  const version = Object.entries(groups).filter(([, group]) => (group['applies-to'] ?? 'version-updates') === 'version-updates');
  const taken = new Set<string>();
  const contains = (groupName: string, group: Group): boolean =>
    taken.has(groupName) || (!excludes(group, name) && (group.patterns === undefined || group.patterns.some((pattern) => wildcard(pattern, name))));
  const score = (groupName: string, group: Group): number => {
    if (taken.has(groupName)) return 1000;
    if (excludes(group, name)) return 0;
    if (group.patterns === undefined) return 500;
    return Math.max(0, ...group.patterns.filter((pattern) => wildcard(pattern, name)).map((pattern) => patternScore(pattern, name)));
  };
  const overlap = (one: Group, other: Group): boolean =>
    one['update-types'] === undefined || other['update-types'] === undefined || other['update-types'].some((type) => one['update-types']?.includes(type));
  for (const [groupName, group] of version) {
    if (!contains(groupName, group)) continue;
    const own = score(groupName, group);
    const givesUp =
      (group.patterns ?? []).length > 0 &&
      !excludes(group, name) &&
      own < 1000 &&
      version.some(([otherName, other]) => otherName !== groupName && overlap(group, other) && contains(otherName, other) && score(otherName, other) > own);
    if (!givesUp) taken.add(groupName);
  }
  return version.map(([groupName]) => groupName).filter((groupName) => taken.has(groupName));
};

/**
 * Every direct dependency Dependabot's npm job reads: each manifest of the root and of every workspace
 * pnpm-workspace.yaml's globs find (as pnpm finds them, tools/typecheck/run.ts), less the workspace's own packages, and
 * the catalog's names. Read from the repository, never from CI_TREE's copy, which holds only the CI files.
 */
const directDependencies = (): string[] => {
  const names = new Set<string>();
  for (const dir of ['.', ...workspaceDirs(repositoryRoot)]) {
    const manifest = JSON.parse(readFileSync(path.join(repositoryRoot, dir, 'package.json'), 'utf8')) as Record<string, Record<string, string> | undefined>;
    for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
      for (const [name, range] of Object.entries(manifest[field] ?? {})) if (!range.startsWith('workspace:')) names.add(name);
    }
  }
  const workspace = parse(readFileSync(path.join(repositoryRoot, 'pnpm-workspace.yaml'), 'utf8')) as { catalog?: Record<string, string>; catalogs?: Record<string, Record<string, string>> };
  for (const catalog of [workspace.catalog ?? {}, ...Object.values(workspace.catalogs ?? {})]) for (const name of Object.keys(catalog)) names.add(name);
  return [...names].sort();
};

describe('dependabot.yml (CI-12)', () => {
  it('has one entry for each ecosystem the repository uses: the workspace, the actions, both Dockerfiles and the compose file while it exists', () => {
    expect(config().version).toBe(2);
    const ecosystems = config().updates.map((update) => update['package-ecosystem']);
    expect(ecosystems).toEqual(['npm', 'github-actions', 'docker', 'docker-compose']);
    expect(new Set(ecosystems).size).toBe(ecosystems.length);
    expect(entry('npm').directory).toBe('/');
    expect(entry('github-actions').directory).toBe('/');
    const dockerfiles = ['apps/web/Dockerfile', 'apps/worker/Dockerfile'].filter((file) => existsSync(path.join(CI_ROOT, file)));
    expect(entry('docker').directories).toEqual(dockerfiles.map((file) => `/${path.dirname(file)}`));
    expect(existsSync(path.join(CI_ROOT, 'docker-compose.yml'))).toBe(true);
    expect(entry('docker-compose').directory).toBe('/');
  });

  it('groups the workspace’s updates in this order, the specific groups before minor-and-patch, which excludes them, and security updates last', () => {
    const groups = entry('npm').groups ?? {};
    expect(Object.keys(groups)).toEqual(['browser-tests', 'anthropic-sdk', 'pg-boss', 'next', 'aws-sdk', 'aws-cdk', 'minor-and-patch', 'security']);
    expect(groups['browser-tests']).toEqual({ patterns: ['@playwright/test', 'playwright', 'playwright-core', '@axe-core/playwright', 'axe-core'] });
    expect(groups['anthropic-sdk']).toEqual({ patterns: ['@anthropic-ai/sdk'] });
    expect(groups['pg-boss']).toEqual({ patterns: ['pg-boss'] });
    expect(groups.next).toEqual({ patterns: ['next', '@next/*'], 'update-types': ['minor', 'patch'] });
    expect(groups['aws-sdk']).toEqual({ patterns: ['@aws-sdk/*'], 'update-types': ['minor', 'patch'] });
    expect(groups['aws-cdk']).toEqual({ patterns: ['aws-cdk', 'aws-cdk-lib', 'constructs'], 'update-types': ['minor', 'patch'] });
    expect(groups['minor-and-patch']).toEqual({ 'exclude-patterns': SPECIFIC.flatMap((name) => groups[name]?.patterns ?? []), 'update-types': ['minor', 'patch'] });
    expect(groups.security).toEqual({ 'applies-to': 'security-updates', patterns: ['*'] });
    // Every version group and room for one update no group takes.
    expect(entry('npm')['open-pull-requests-limit']).toBe(8);
    expect(entry('github-actions').groups).toEqual({ actions: { patterns: ['*'] } });
    expect(entry('github-actions')['open-pull-requests-limit']).toBe(2);
  });

  it('excludes from minor-and-patch every pattern a specific group names, in their order, so no dependency is in two groups', () => {
    const groups = entry('npm').groups ?? {};
    // A version-update group is specific whether it leaves applies-to out or names its default.
    const specific = Object.keys(groups).filter((name) => name !== 'minor-and-patch' && (groups[name]?.['applies-to'] ?? 'version-updates') === 'version-updates');
    // A new group fails here until minor-and-patch excludes its patterns.
    expect(specific).toEqual(SPECIFIC);
    expect(groups['minor-and-patch']?.patterns).toBeUndefined();
    expect(groups['minor-and-patch']?.['exclude-patterns']).toEqual(specific.flatMap((name) => groups[name]?.patterns ?? []));
    for (const name of specific) expect(groups[name]?.['exclude-patterns'], name).toBeUndefined();
  });

  it('routes every direct dependency, and each named case, to the one group the file means for it, under Dependabot’s specificity rule and the documented first match alike (run 40818560725)', () => {
    const groups = entry('npm').groups ?? {};
    const intended: Record<string, string> = {
      '@playwright/test': 'browser-tests',
      playwright: 'browser-tests',
      'playwright-core': 'browser-tests',
      '@axe-core/playwright': 'browser-tests',
      'axe-core': 'browser-tests',
      '@anthropic-ai/sdk': 'anthropic-sdk',
      'pg-boss': 'pg-boss',
      next: 'next',
      '@next/eslint-plugin-next': 'next',
      '@aws-sdk/client-bedrock-runtime': 'aws-sdk',
      '@aws-sdk/client-s3': 'aws-sdk',
      '@aws-sdk/client-sts': 'aws-sdk',
      '@aws-sdk/s3-request-presigner': 'aws-sdk',
      'aws-cdk': 'aws-cdk',
      'aws-cdk-lib': 'aws-cdk',
      constructs: 'aws-cdk',
      stripe: 'minor-and-patch',
      '@stripe/stripe-js': 'minor-and-patch',
      zod: 'minor-and-patch',
      typescript: 'minor-and-patch',
      '@types/node': 'minor-and-patch',
      'next-auth': 'minor-and-patch',
      'aws-cdk-local': 'minor-and-patch',
    };
    const direct = directDependencies();
    // The manifests are found, and the names this file exists for are among them.
    for (const name of ['@anthropic-ai/sdk', '@aws-sdk/client-bedrock-runtime', '@next/eslint-plugin-next', 'next', 'pg-boss', 'aws-cdk-lib', 'stripe']) expect(direct, name).toContain(name);
    for (const name of [...new Set([...direct, ...Object.keys(intended)])]) {
      const owner = SPECIFIC.find((group) => (groups[group]?.patterns ?? []).some((pattern) => wildcard(pattern, name))) ?? 'minor-and-patch';
      if (intended[name] !== undefined) expect(owner, name).toBe(intended[name]);
      // Exactly one group takes it, so neither the scores nor the file's order decides.
      expect(dependabotMembers(groups, name), name).toEqual([owner]);
    }
  });

  it('models Dependabot’s rule as run 40818560725 showed it on the configuration of 2026-10-29, before the exclusions', () => {
    const before: Record<string, Group> = {
      'browser-tests': { patterns: ['@playwright/test', 'playwright', 'playwright-core', '@axe-core/playwright', 'axe-core'] },
      'anthropic-sdk': { patterns: ['@anthropic-ai/sdk'] },
      'pg-boss': { patterns: ['pg-boss'] },
      next: { patterns: ['next', '@next/*'], 'update-types': ['minor', 'patch'] },
      'aws-sdk': { patterns: ['@aws-sdk/*'], 'update-types': ['minor', 'patch'] },
      'aws-cdk': { patterns: ['aws-cdk', 'aws-cdk-lib', 'constructs'], 'update-types': ['minor', 'patch'] },
      'minor-and-patch': { 'update-types': ['minor', 'patch'] },
      security: { 'applies-to': 'security-updates', patterns: ['*'] },
    };
    // "Skipping … for group 'aws-sdk' - belongs to more specific group 'minor-and-patch'", and the same for '@next/*'.
    expect(dependabotMembers(before, '@aws-sdk/client-s3')).toEqual(['minor-and-patch']);
    expect(dependabotMembers(before, '@aws-sdk/client-bedrock-runtime')).toEqual(['minor-and-patch']);
    expect(dependabotMembers(before, '@next/eslint-plugin-next')).toEqual(['minor-and-patch']);
    // An exact name kept its group, and only the file's order kept it out of a second pull request.
    expect(dependabotMembers(before, 'aws-cdk-lib')).toEqual(['aws-cdk', 'minor-and-patch']);
    expect(dependabotMembers(before, '@anthropic-ai/sdk')).toEqual(['anthropic-sdk', 'minor-and-patch']);
    expect(dependabotMembers(before, 'stripe')).toEqual(['minor-and-patch']);
    // A group that already took a dependency scores 1000 for it, so of two groups scoring alike the earlier keeps it.
    expect(dependabotMembers({ first: { patterns: ['@scope/*'] }, second: { patterns: ['@scope/*'] } }, '@scope/name')).toEqual(['first']);
    // The higher score wins whatever the order.
    expect(dependabotMembers({ wide: { patterns: ['@scope/*'] }, narrow: { patterns: ['@scope/name-*'] } }, '@scope/name-a')).toEqual(['narrow']);
    // Groups whose update-types do not overlap are never compared, so each keeps what it contains.
    expect(dependabotMembers({ majors: { patterns: ['@aws-sdk/*'], 'update-types': ['major'] }, rest: { 'update-types': ['minor', 'patch'] } }, '@aws-sdk/client-s3')).toEqual(['majors', 'rest']);
    // Only the groups that apply to version updates take part: a security-updates group neither takes nor contests one.
    expect(dependabotMembers({ a: { patterns: ['x'] }, s: { 'applies-to': 'security-updates', patterns: ['x'] } }, 'x')).toEqual(['a']);
    // An exact name scores 1000, so a group holding one never gives it up, and two such groups both keep it.
    expect(dependabotMembers({ first: { patterns: ['x'] }, second: { patterns: ['x'] } }, 'x')).toEqual(['first', 'second']);
  });

  it('leaves each named major to a deliberate upgrade pull request', () => {
    expect(entry('npm').ignore).toEqual(['@types/node', 'typescript', 'next', '@next/eslint-plugin-next', 'pg-boss'].map((name) => ({ 'dependency-name': name, 'update-types': MAJOR })));
    expect(entry('docker').ignore).toEqual([{ 'dependency-name': 'node', 'update-types': MAJOR }]);
    expect(entry('docker-compose').ignore).toEqual([{ 'dependency-name': 'postgres', 'update-types': MAJOR }]);
    expect(entry('github-actions').ignore).toBeUndefined();
  });

  it('puts both images in one weekly pull request, the multi-ecosystem group, with patterns on each entry as the group requires', () => {
    expect(Object.keys(config()['multi-ecosystem-groups'] ?? {})).toEqual(['container-images']);
    for (const ecosystem of ['docker', 'docker-compose']) {
      expect(entry(ecosystem)['multi-ecosystem-group'], ecosystem).toBe('container-images');
      expect(entry(ecosystem).patterns, ecosystem).toEqual(['*']);
      expect(entry(ecosystem).schedule, ecosystem).toBeUndefined();
    }
  });

  it('runs the three ecosystems weekly on three days, none of them Monday, when the weekly mutation, large-zip and capacity runs start', () => {
    const schedules = {
      npm: entry('npm').schedule,
      'github-actions': entry('github-actions').schedule,
      'container-images': config()['multi-ecosystem-groups']?.['container-images']?.schedule,
    };
    expect(schedules).toEqual({
      npm: { interval: 'weekly', day: 'thursday', time: '04:31', timezone: 'Etc/UTC' },
      'github-actions': { interval: 'weekly', day: 'tuesday', time: '04:37', timezone: 'Etc/UTC' },
      'container-images': { interval: 'weekly', day: 'wednesday', time: '04:43', timezone: 'Etc/UTC' },
    });
    const days = Object.values(schedules).map((schedule) => schedule?.day);
    expect(new Set(days).size).toBe(3);
    expect(days).not.toContain('monday');
  });

  it('cools npm for 3 days, the workspace’s release age, with no per-semver days, and the actions and images for 7 (the co-founder’s CQ1 (a))', () => {
    expect(entry('npm').cooldown).toEqual({ 'default-days': 3 });
    for (const ecosystem of ['github-actions', 'docker', 'docker-compose']) expect(entry(ecosystem).cooldown, ecosystem).toEqual({ 'default-days': 7 });
    // A per-semver key anywhere would pass pnpm a gate longer than the workspace's on the update checker's probe.
    expect(readFileSync(path.join(CI_ROOT, '.github/dependabot.yml'), 'utf8')).not.toMatch(/semver-(?:major|minor|patch)-days/);
    // The npm cooldown equals pnpm's minimumReleaseAge, in minutes, once the workspace sets it.
    const workspace = parse(readFileSync(path.join(repositoryRoot, 'pnpm-workspace.yaml'), 'utf8')) as { minimumReleaseAge?: number };
    expect(workspace.minimumReleaseAge).toBe(3 * 24 * 60);
  });

  it('names no target branch: Dependabot reads this file from the default branch, the build branch until launch (the founder’s F1 (a))', () => {
    for (const update of config().updates) expect(update['target-branch'], update['package-ecosystem']).toBeUndefined();
    expect(readFileSync(path.join(CI_ROOT, '.github/dependabot.yml'), 'utf8')).not.toMatch(/target-branch|main's copy/);
  });
});

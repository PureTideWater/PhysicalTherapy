import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import { repositoryRoot } from '../content-files';

/**
 * Dependabot's configuration (test matrix CI-12; docs/adr/0066, Part 2; docs/runbooks/dependency-upgrades.md): the
 * groups in the order Dependabot matches them, the majors left to deliberate upgrades, the cooldowns the co-founder's
 * CQ1 (a) set, three weekly days none of which is Monday, one entry for each ecosystem the repository uses, and no
 * target branch, since Dependabot reads the file from the default branch, which is the build branch until launch (the
 * founder's F1 (a)). Every read goes through CI_TREE when it is set (workflows.test.ts, the simulated rewrite).
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
  readonly groups?: Record<string, { readonly patterns?: string[]; readonly 'update-types'?: string[]; readonly 'applies-to'?: string }>;
  readonly 'multi-ecosystem-group'?: string;
  readonly patterns?: string[];
  readonly 'target-branch'?: string;
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

  it('groups the workspace’s updates in the order Dependabot matches them, the specific groups before minor-and-patch, and security updates last', () => {
    const groups = entry('npm').groups ?? {};
    expect(Object.keys(groups)).toEqual(['browser-tests', 'anthropic-sdk', 'pg-boss', 'next', 'aws-sdk', 'aws-cdk', 'minor-and-patch', 'security']);
    expect(groups['browser-tests']).toEqual({ patterns: ['@playwright/test', 'playwright', 'playwright-core', '@axe-core/playwright', 'axe-core'] });
    expect(groups['anthropic-sdk']).toEqual({ patterns: ['@anthropic-ai/sdk'] });
    expect(groups['pg-boss']).toEqual({ patterns: ['pg-boss'] });
    expect(groups.next).toEqual({ patterns: ['next', '@next/*'], 'update-types': ['minor', 'patch'] });
    expect(groups['aws-sdk']).toEqual({ patterns: ['@aws-sdk/*'], 'update-types': ['minor', 'patch'] });
    expect(groups['aws-cdk']).toEqual({ patterns: ['aws-cdk', 'aws-cdk-lib', 'constructs'], 'update-types': ['minor', 'patch'] });
    expect(groups['minor-and-patch']).toEqual({ 'update-types': ['minor', 'patch'] });
    expect(groups.security).toEqual({ 'applies-to': 'security-updates', patterns: ['*'] });
    // Every version group and room for one update no group takes.
    expect(entry('npm')['open-pull-requests-limit']).toBe(8);
    expect(entry('github-actions').groups).toEqual({ actions: { patterns: ['*'] } });
    expect(entry('github-actions')['open-pull-requests-limit']).toBe(2);
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

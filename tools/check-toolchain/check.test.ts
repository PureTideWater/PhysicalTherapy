import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';
import { stringify } from 'yaml';

import { type CheckEvent, type Finding, type Tree, checkOffline, checkToolchain, dockerfileRule } from './check';
import { compareVersions, parseSelector, rangeHolds, splitSpec } from './policy';
import { type Advisory, NetworkReadError, type Packument, type Registry, type VersionFacts } from './registry';

/**
 * check-toolchain's rules on synthetic trees, against recorded synthetic registry answers (no network). Now is
 * 2026-10-26T00:00Z throughout, so a version published after 2026-10-23T00:00Z is under three days old.
 */
const NOW = new Date('2026-10-26T00:00:00.000Z');

/** Synthetic registry documents: name to version to publish time. */
const TIMES: Record<string, Record<string, string>> = {
  pnpm: {
    '10.33.0': '2026-09-01T00:00:00.000Z',
    '10.34.8': '2026-10-01T00:00:00.000Z',
    '10.34.9': '2026-10-25T17:54:00.000Z',
    '11.0.0': '2026-09-15T00:00:00.000Z',
    '10.35.0-rc.0': '2026-10-02T00:00:00.000Z',
  },
  'old-lib': { '1.0.0': '2024-01-01T00:00:00.000Z', '1.1.0': '2026-10-01T00:00:00.000Z' },
  'young-lib': { '2.0.0': '2026-01-01T00:00:00.000Z', '2.0.1': '2026-10-24T12:00:00.000Z' },
  '@scope/fix': { '2.0.0': '2025-03-01T00:00:00.000Z', '3.0.0': '2026-10-25T06:00:00.000Z' },
  'semver': { '6.3.1': '2023-07-10T22:57:32.000Z' },
};

/** Synthetic per-version facts (integrity, trust evidence, declared dependencies); a version not listed has the defaults. */
type Facts = Record<string, Record<string, Partial<VersionFacts>>>;
const DEFAULT_FACTS: VersionFacts = { integrity: 'sha512-synthetic', evidence: null, dependencies: {} };

/** A synthetic pnpm tarball's sha512 for each version, as hex (packageManager's suffix) and as the registry's integrity. */
const pnpmDigest = (version: string) => createHash('sha512').update(`synthetic pnpm ${version}`).digest();
/** packageManager for a pnpm version, with the sha512 suffix the registry's synthetic integrity matches. */
const pm = (version: string) => `pnpm@${version}+sha512.${pnpmDigest(version).toString('hex')}`;

/** Bulk advisory answers by `name@version`. */
type AdvisoryTable = Record<string, Advisory[]>;

/** The advisory FIX_EXCLUDE names, which the bulk endpoint reports against @scope/fix 2.0.0, the base's locked version. */
const FIX_ADVISORY: Advisory = { id: 2, url: 'https://github.com/advisories/GHSA-2222-3333-4444', title: 'synthetic', severity: 'moderate', vulnerable_versions: '<3.0.0' };
const DEFAULT_ADVISORIES: AdvisoryTable = { '@scope/fix@2.0.0': [FIX_ADVISORY] };

/**
 * A registry that answers from TIMES, FACTS and an advisory table keyed by `name@version` (a bare version key is
 * pnpm's), counting reads; `fail` names packages whose reads fail closed.
 */
function fakeRegistry(
  options: { readonly advisories?: AdvisoryTable; readonly fail?: readonly string[]; readonly times?: Record<string, Record<string, string>>; readonly facts?: Facts } = {},
): Registry & { readonly reads: string[] } {
  const reads: string[] = [];
  const times = { ...TIMES, ...options.times };
  return {
    reads,
    packument(name: string): Promise<Packument> {
      reads.push(name);
      if (options.fail?.includes(name)) {
        return Promise.reject(new NetworkReadError(`registry.npmjs.org: reading ${name}'s registry document failed after 3 tries with backoff (last: HTTP 503); check-toolchain fails closed`));
      }
      const time = times[name];
      if (time === undefined) {
        return Promise.reject(new NetworkReadError(`registry.npmjs.org: reading ${name}'s registry document failed (HTTP 404); check-toolchain fails closed`));
      }
      const facts = Object.fromEntries(
        Object.keys(time).map((version) => [version, { ...DEFAULT_FACTS, ...(name === 'pnpm' ? { integrity: `sha512-${pnpmDigest(version).toString('base64')}` } : {}), ...options.facts?.[name]?.[version] }]),
      );
      return Promise.resolve({ name, versions: Object.keys(time), time, facts });
    },
    advisories(packages) {
      reads.push('advisories');
      if (options.fail?.includes('advisories')) {
        return Promise.reject(new NetworkReadError('registry.npmjs.org: reading the bulk advisory endpoint failed after 3 tries with backoff (last: fetch failed); check-toolchain fails closed'));
      }
      const answer: Record<string, Advisory[]> = {};
      for (const [name, versions] of Object.entries(packages)) {
        const table = { ...DEFAULT_ADVISORIES, ...options.advisories };
        const hits = versions.flatMap((version) => table[`${name}@${version}`] ?? (name === 'pnpm' ? table[version] : undefined) ?? []);
        const unique = [...new Map(hits.map((hit) => [hit.url, hit])).values()];
        if (unique.length > 0) {
          answer[name] = unique;
        }
      }
      return Promise.resolve(answer);
    },
  };
}

const DOCKERFILE = [
  'FROM node:24-trixie-slim@sha256:' + 'a'.repeat(64) + ' AS build',
  'COPY package.json ./',
  'COPY tools/check-toolchain/install-pnpm.sh /tmp/install-pnpm.sh',
  'RUN sh /tmp/install-pnpm.sh package.json && rm /tmp/install-pnpm.sh',
].join('\n');

interface Shape {
  readonly packageManager?: string;
  readonly workspace?: Record<string, unknown>;
  readonly locked?: readonly string[];
  readonly snapshots?: Record<string, { readonly dependencies?: Record<string, string> } | null>;
  readonly releaseAge?: readonly Record<string, string>[];
  readonly audit?: readonly Record<string, string>[];
  readonly trust?: readonly Record<string, string>[];
  readonly overrides?: readonly Record<string, string>[];
  readonly dockerfiles?: Record<string, string>;
  /** A lockfile entry's resolution, by key, in place of `{integrity: sha512-synthetic}`. */
  readonly resolutions?: Record<string, unknown>;
  /** The lockfile's top-level `overrides:` map. */
  readonly lockOverrides?: Record<string, string>;
  /** package.json fields beside name and packageManager. */
  readonly packageJson?: Record<string, unknown>;
  readonly npmrc?: string;
  readonly pnpmfile?: string;
}

/** packageManager as the tree holds it. */
const PACKAGE_MANAGER = pm('10.34.8');

const TRUST = [{ package: 'semver@6.3.1', reason: 'published without provenance after a version with it, reached through @babel/core', added: '2026-10-26' }];

/** A synthetic tree: the gates as ruled, semver@6.3.1's trust exclude, and the files' empty lists. */
function tree(shape: Shape = {}): Tree {
  const workspace = { minimumReleaseAge: 4320, minimumReleaseAgeExclude: [], trustPolicy: 'no-downgrade', trustPolicyExclude: ['semver@6.3.1'], ...shape.workspace };
  const locked = shape.locked ?? ['old-lib@1.0.0', 'semver@6.3.1', '@scope/fix@2.0.0'];
  return {
    packageJson: JSON.stringify({ name: 'synthetic', packageManager: shape.packageManager ?? PACKAGE_MANAGER, ...shape.packageJson }),
    workspace: stringify(workspace),
    lockfile: stringify({
      lockfileVersion: '9.0',
      ...(shape.lockOverrides === undefined ? {} : { overrides: shape.lockOverrides }),
      packages: Object.fromEntries(locked.map((key) => [key, { resolution: shape.resolutions !== undefined && key in shape.resolutions ? shape.resolutions[key] : { integrity: 'sha512-synthetic' } }])),
      snapshots: shape.snapshots ?? Object.fromEntries(locked.map((key) => [key, null])),
    }),
    releaseAgeExceptions: JSON.stringify({ entries: shape.releaseAge ?? [] }),
    auditExceptions: JSON.stringify({ entries: shape.audit ?? [] }),
    trustExceptions: JSON.stringify({ entries: shape.trust ?? TRUST }),
    overrides: JSON.stringify({ entries: shape.overrides ?? [] }),
    dockerfiles: shape.dockerfiles ?? { 'apps/web/Dockerfile': DOCKERFILE, 'apps/worker/Dockerfile': DOCKERFILE },
    ...(shape.npmrc === undefined ? {} : { npmrc: shape.npmrc }),
    ...(shape.pnpmfile === undefined ? {} : { pnpmfile: shape.pnpmfile }),
  };
}

async function run(head: Tree, base: Tree = tree(), options: { readonly event?: CheckEvent; readonly registry?: Registry } = {}): Promise<Finding[]> {
  return checkToolchain({ head, base, event: options.event ?? 'pull_request', now: NOW }, options.registry ?? fakeRegistry());
}

const problems = (findings: readonly Finding[], level: 'error' | 'warning' = 'error') => findings.filter((finding) => finding.level === level).map((finding) => `${finding.rule}: ${finding.message}`);

/** A young security fix's exclude, dated as F2 (b) allows: from its publish + 3 days to within 7 days of being added. */
const FIX_EXCLUDE = { package: '@scope/fix@3.0.0', advisory: 'GHSA-2222-3333-4444', reason: 'synthetic: the fixed version of a moderate advisory', added: '2026-10-25T12:00:00.000Z', expires: '2026-10-29T00:00:00.000Z' };

describe('check-toolchain', () => {
  it('passes a tree that holds every rule, saying what each checked', async () => {
    const findings = await run(tree());
    expect(problems(findings)).toEqual([]);
    expect(problems(findings, 'warning')).toEqual([]);
    expect(findings.map((finding) => finding.rule)).toEqual(['gates', 'settings', 'pnpm advisories', 'pnpm release age', 'newer pnpm', 'pnpm integrity', 'Dockerfiles', 'audit exceptions', 'release-age excludes', 'lockfile resolutions', 'lockfile release age', 'lockfile integrity', 'lockfile trust', 'trust excludes', 'overrides']);
  });

  it('fails on a moderate or worse advisory against packageManager’s pnpm, and warns on a low one', async () => {
    const advisory = (severity: string): Advisory => ({ id: 1, url: 'https://github.com/advisories/GHSA-2222-3333-4444', title: 'synthetic', severity, vulnerable_versions: '<10.34.9' });
    for (const severity of ['moderate', 'high', 'critical']) {
      const findings = await run(tree(), tree(), { registry: fakeRegistry({ advisories: { '10.34.8': [advisory(severity)] } }) });
      expect(problems(findings)).toEqual([expect.stringMatching(new RegExp(`^pnpm advisories: packageManager's pnpm 10.34.8 has a ${severity} advisory, https://github.com/advisories/GHSA-2222-3333-4444`))]);
    }
    const low = await run(tree(), tree(), { registry: fakeRegistry({ advisories: { '10.34.8': [advisory('low')] } }) });
    expect(problems(low)).toEqual([]);
    expect(problems(low, 'warning')).toHaveLength(1);
  });

  it('fails on a pnpm literal in a Dockerfile, or one that installs pnpm other than through install-pnpm.sh (N1)', () => {
    const literal = dockerfileRule({ 'apps/web/Dockerfile': `${DOCKERFILE}\nRUN npm install --global pnpm@10.28.0` }, '10.34.8');
    expect(literal.map((finding) => finding.message)).toEqual([
      "apps/web/Dockerfile:5 names a pnpm version; derive it from package.json's packageManager, so one field moves every pnpm",
      'apps/web/Dockerfile:5 installs pnpm other than through tools/check-toolchain/install-pnpm.sh, which alone checks the tarball against packageManager\'s sha512',
    ]);
    expect(dockerfileRule({ 'apps/worker/Dockerfile': 'RUN corepack enable && corepack prepare pnpm 10.34.8 --activate # packageManager' }, '10.34.8')[0]?.level).toBe('error');
    const unverified = 'FROM node:24\nCOPY package.json ./\n# packageManager\nRUN npm install --global "pnpm@$(node -p "require(\'./package.json\').packageManager.slice(5)")"';
    expect(dockerfileRule({ 'apps/worker/Dockerfile': unverified }, '10.34.8').map((finding) => finding.message)).toEqual([
      'apps/worker/Dockerfile:4 installs pnpm other than through tools/check-toolchain/install-pnpm.sh, which alone checks the tarball against packageManager\'s sha512',
      "apps/worker/Dockerfile does not install pnpm with tools/check-toolchain/install-pnpm.sh (COPY it, then RUN sh <it> package.json), which checks the tarball against packageManager's sha512",
    ]);
    expect(dockerfileRule({}, '10.34.8')[0]?.message).toBe('no Dockerfile found under apps/*/');
    expect(dockerfileRule({ 'apps/web/Dockerfile': DOCKERFILE }, '10.34.8')[0]?.level).toBe('ok');
  });

  it('fails an audit exception that has expired, is older than 30 days, or is missing from either list', async () => {
    const entry = { ghsa: 'GHSA-2222-3333-4444', reason: 'synthetic: no fix released yet, development-only', added: '2026-10-20T00:00:00.000Z', expires: '2026-11-15T00:00:00.000Z' };
    const ignore = { auditConfig: { ignoreGhsas: ['GHSA-2222-3333-4444'] } };
    expect(problems(await run(tree({ workspace: ignore, audit: [entry] })))).toEqual([]);
    expect(problems(await run(tree({ workspace: ignore, audit: [{ ...entry, expires: '2026-10-25T00:00:00.000Z' }] })))).toEqual(['audit exceptions: GHSA-2222-3333-4444: expired 2026-10-25T00:00:00.000Z; fix it or remove the exception']);
    expect(problems(await run(tree({ workspace: ignore, audit: [{ ...entry, added: '2026-09-20T00:00:00.000Z', expires: '2026-10-19T00:00:00.000Z' }] })))).toContain(
      'audit exceptions: GHSA-2222-3333-4444: added 2026-09-20T00:00:00.000Z, more than 30 days ago; fix it or remove the exception',
    );
    expect(problems(await run(tree({ workspace: ignore })))).toEqual([
      "audit exceptions: pnpm-workspace.yaml's auditConfig.ignoreGhsas lists GHSA-2222-3333-4444, which tools/check-toolchain/audit-exceptions.json does not; the two lists are kept equal",
    ]);
    expect(problems(await run(tree({ audit: [entry] })))).toEqual([
      "audit exceptions: tools/check-toolchain/audit-exceptions.json lists GHSA-2222-3333-4444, which pnpm-workspace.yaml's auditConfig.ignoreGhsas does not; the two lists are kept equal",
    ]);
  });

  it('refuses a release-age exclude that is a bare name, a pattern or a union', async () => {
    for (const item of ['young-lib', '@types/*', 'young-lib@2.0.1 || 2.0.2', 'young-lib@^2.0.0']) {
      const findings = await run(tree({ workspace: { minimumReleaseAgeExclude: [item] }, releaseAge: [{ ...FIX_EXCLUDE, package: item }] }));
      expect(problems(findings), item).toContain(
        `release-age excludes: pnpm-workspace.yaml: minimumReleaseAgeExclude entry "${item}" is not one exact version (name@x.y.z); a bare name, a pattern or a union is refused, so each exclude has one expiry`,
      );
    }
  });

  it('refuses an exclude listed in only one of the two lists', async () => {
    expect(problems(await run(tree({ workspace: { minimumReleaseAgeExclude: ['@scope/fix@3.0.0'] } })))).toEqual([
      "release-age excludes: pnpm-workspace.yaml's minimumReleaseAgeExclude lists @scope/fix@3.0.0, which tools/check-toolchain/release-age-exceptions.json does not; the two lists are kept equal",
    ]);
    expect(problems(await run(tree({ releaseAge: [FIX_EXCLUDE] })))).toEqual([
      "release-age excludes: tools/check-toolchain/release-age-exceptions.json lists @scope/fix@3.0.0, which pnpm-workspace.yaml's minimumReleaseAgeExclude does not; the two lists are kept equal",
    ]);
  });

  it('holds an added exclude between its version’s publish + 3 days and its added date + 7 days', async () => {
    const withExclude = (entry: typeof FIX_EXCLUDE) => tree({ workspace: { minimumReleaseAgeExclude: [entry.package] }, releaseAge: [entry] });
    expect(problems(await run(withExclude(FIX_EXCLUDE)))).toEqual([]);
    // Published 2026-10-25T06:00Z, so it is three days old from 2026-10-28T06:00Z.
    expect(problems(await run(withExclude({ ...FIX_EXCLUDE, expires: '2026-10-28T05:59:59.000Z' })))).toEqual([
      'release-age excludes: @scope/fix@3.0.0: expires 2026-10-28T05:59:59.000Z, before the version is three days old (2026-10-28T06:00:00.000Z; published 2026-10-25T06:00:00.000Z), so it would lapse while still needed',
    ]);
    expect(problems(await run(withExclude({ ...FIX_EXCLUDE, expires: '2026-11-01T12:00:01.000Z' })))).toEqual([
      'release-age excludes: @scope/fix@3.0.0: expires 2026-11-01T12:00:01.000Z, more than 7 days after it was added (2026-10-25T12:00:00.000Z); F2 (b) allows seven',
    ]);
    expect(problems(await run(withExclude({ ...FIX_EXCLUDE, added: '2026-10-27T00:00:00.000Z' })))).toEqual(['release-age excludes: @scope/fix@3.0.0: added 2026-10-27T00:00:00.000Z, a time in the future']);
    // An entry the base already holds is not judged again (its window was checked when it was added).
    const stale = { ...FIX_EXCLUDE, expires: '2026-10-28T05:00:00.000Z' };
    const registry = fakeRegistry();
    expect(problems(await run(withExclude(stale), withExclude(stale), { registry }))).toEqual([]);
    expect(registry.reads).not.toContain('@scope/fix');
  });

  it('confirms an added exclude’s advisory through the bulk endpoint against the version it replaces (N3)', async () => {
    const withExclude = (entry: typeof FIX_EXCLUDE, base: Shape = {}) => [tree({ workspace: { minimumReleaseAgeExclude: [entry.package] }, releaseAge: [entry] }), tree(base)] as const;
    // The base locks @scope/fix 2.0.0, which the bulk endpoint reports GHSA-2222-3333-4444 against: a security fix.
    const registry = fakeRegistry();
    expect(problems(await run(...withExclude(FIX_EXCLUDE), { registry }))).toEqual([]);
    expect(registry.reads).toContain('advisories');
    // Another advisory, or none against what the base locks: not shown to be a security fix.
    expect(problems(await run(...withExclude({ ...FIX_EXCLUDE, advisory: 'GHSA-3333-4444-5555' })))).toEqual([
      'release-age excludes: @scope/fix@3.0.0: the bulk advisory endpoint does not report GHSA-3333-4444-5555 against the version the base locks (2.0.0); an exclude is only for the fix of an advisory against what we run (docs/runbooks/dependency-upgrades.md, "The release age")',
    ]);
    expect(problems(await run(...withExclude(FIX_EXCLUDE, { locked: ['old-lib@1.0.0', 'semver@6.3.1'] })))).toEqual([
      'release-age excludes: @scope/fix@3.0.0: the base locks no other version of @scope/fix, so no advisory against what we run can be fixed by it; an exclude is only for the fix of an advisory against what we run (docs/runbooks/dependency-upgrades.md, "The release age")',
    ]);
    // The excluded version is itself affected: it fixes nothing.
    const affected = fakeRegistry({ advisories: { '@scope/fix@3.0.0': [FIX_ADVISORY] } });
    expect(problems(await run(...withExclude(FIX_EXCLUDE), { registry: affected }))).toEqual([
      'release-age excludes: @scope/fix@3.0.0: the bulk advisory endpoint reports GHSA-2222-3333-4444 against @scope/fix@3.0.0 itself, so it is not the fix',
    ]);
    // A pnpm exclude is judged against the base's packageManager.
    const pnpmExclude = { ...FIX_EXCLUDE, package: 'pnpm@10.34.9', added: '2026-10-25T20:00:00.000Z', expires: '2026-10-29T00:00:00.000Z' };
    const pnpmHead = tree({ packageManager: pm('10.34.9'), workspace: { minimumReleaseAgeExclude: ['pnpm@10.34.9'] }, releaseAge: [pnpmExclude] });
    expect(problems(await run(pnpmHead, tree(), { registry: fakeRegistry({ advisories: { 'pnpm@10.34.8': [FIX_ADVISORY] } }) }))).toEqual([]);
    expect(problems(await run(pnpmHead, tree()))).toEqual([
      'release-age excludes: pnpm@10.34.9: the bulk advisory endpoint does not report GHSA-2222-3333-4444 against the version the base locks (10.34.8); an exclude is only for the fix of an advisory against what we run (docs/runbooks/dependency-upgrades.md, "The release age")',
    ]);
    // The endpoint unreadable: fails closed.
    expect(problems(await run(...withExclude(FIX_EXCLUDE), { registry: fakeRegistry({ fail: ['advisories'] }) }))).toContain(
      'release-age excludes: registry.npmjs.org: reading the bulk advisory endpoint failed after 3 tries with backoff (last: fetch failed); check-toolchain fails closed',
    );
  });

  it('fails an expired exclude on a pull request that edits either list, and warns on a push run or any other pull request', async () => {
    const expired = { ...FIX_EXCLUDE, added: '2026-10-18T00:00:00.000Z', expires: '2026-10-25T00:00:00.000Z' };
    const holding = tree({ workspace: { minimumReleaseAgeExclude: [expired.package] }, releaseAge: [expired] });
    const message = 'release-age excludes: @scope/fix@3.0.0: expired 2026-10-25T00:00:00.000Z; remove it from both lists (the weekly triage, docs/runbooks/dependency-upgrades.md)';
    // Edited: the base held another exclude as well.
    const other = { ...FIX_EXCLUDE, package: 'young-lib@2.0.1', added: '2026-10-24T13:00:00.000Z', expires: '2026-10-28T00:00:00.000Z' };
    const before = tree({ workspace: { minimumReleaseAgeExclude: [expired.package, other.package] }, releaseAge: [expired, other] });
    expect(problems(await run(holding, before))).toEqual([message]);
    expect(problems(await run(holding, before, { event: 'push' }))).toEqual([]);
    expect(problems(await run(holding, before, { event: 'push' }), 'warning')).toEqual([message]);
    // Not edited: a pull request that leaves both lists as they were (a Dependabot one, say) only warns.
    expect(problems(await run(holding, holding))).toEqual([]);
    expect(problems(await run(holding, holding), 'warning')).toEqual([message]);
  });

  it('fails a version the lockfile adds under three days old, unless a live exclude names it; a young version already in the base passes', async () => {
    const adds = (extra: Shape = {}) => tree({ locked: ['old-lib@1.0.0', 'semver@6.3.1', '@scope/fix@2.0.0', 'young-lib@2.0.1', '@scope/fix@3.0.0'], ...extra });
    const findings = await run(adds());
    expect(problems(findings)).toEqual([
      expect.stringMatching(/^lockfile release age: @scope\/fix@3\.0\.0 was published 2026-10-25T06:00:00\.000Z, under three days ago, and the lockfile adds it .* it is old enough from 2026-10-28T06:00:00\.000Z: wait until then, or, for a security fix, add "@scope\/fix@3\.0\.0" to/),
      expect.stringMatching(/^lockfile release age: young-lib@2\.0\.1 was published 2026-10-24T12:00:00\.000Z, under three days ago/),
    ]);
    // With the fix's exclude, live in both lists, only the other young version fails.
    const excused = await run(adds({ workspace: { minimumReleaseAgeExclude: ['@scope/fix@3.0.0'] }, releaseAge: [FIX_EXCLUDE] }));
    expect(problems(excused)).toEqual([expect.stringMatching(/^lockfile release age: young-lib@2\.0\.1 /)]);
    // Already in the base: not added by this change, so not judged (the exclude path F2 (b) needs keeps working).
    expect(problems(await run(adds({ workspace: { minimumReleaseAgeExclude: ['@scope/fix@3.0.0'] }, releaseAge: [FIX_EXCLUDE] }), adds()))).toEqual([]);
    // An old version added passes; one that is not from the registry fails.
    expect(problems(await run(tree({ locked: ['old-lib@1.0.0', 'old-lib@1.1.0', 'semver@6.3.1'] })))).toEqual([]);
    expect(problems(await run(tree({ locked: ['old-lib@1.0.0', 'semver@6.3.1', 'tarball@https://example.invalid/t.tgz'] })))).toEqual([
      'lockfile release age: tarball@https://example.invalid/t.tgz: not a registry version, so its release age cannot be read; take it from the registry',
    ]);
  });

  it('does not let an expired exclude excuse a young version', async () => {
    const expired = { ...FIX_EXCLUDE, added: '2026-10-18T00:00:00.000Z', expires: '2026-10-25T23:00:00.000Z' };
    const head = tree({ locked: ['old-lib@1.0.0', 'semver@6.3.1', '@scope/fix@3.0.0'], workspace: { minimumReleaseAgeExclude: ['@scope/fix@3.0.0'] }, releaseAge: [expired] });
    expect(problems(await run(head, tree({ workspace: { minimumReleaseAgeExclude: ['@scope/fix@3.0.0'] }, releaseAge: [expired] })))).toEqual([
      expect.stringMatching(/^lockfile release age: @scope\/fix@3\.0\.0 was published/),
    ]);
  });

  it('warns, never fails, when a newer release of the same major is at least three days old', async () => {
    // 10.34.9 is under three days old and 11.0.0 is another major; 10.35.0-rc.0 is a prerelease.
    expect(problems(await run(tree()), 'warning')).toEqual([]);
    const later = new Date('2026-10-28T18:00:00.000Z');
    const findings = await checkToolchain({ head: tree(), base: tree(), event: 'pull_request', now: later }, fakeRegistry());
    expect(problems(findings)).toEqual([]);
    expect(problems(findings, 'warning')).toEqual([expect.stringMatching(/^newer pnpm: pnpm 10\.34\.9 \(published 2026-10-25T17:54:00\.000Z\) is newer than packageManager's 10\.34\.8 and at least three days old/)]);
  });

  it('fails a packageManager without the registry tarball’s sha512, or with another one (N1)', async () => {
    const want = pm('10.34.8');
    expect(problems(await run(tree({ packageManager: 'pnpm@10.34.8' })))).toEqual([
      `pnpm integrity: package.json: packageManager "pnpm@10.34.8" carries no +sha512.<hex>; set it to "${want}", the registry's dist.integrity for pnpm 10.34.8 in hex, which both Dockerfiles check the tarball against (docs/runbooks/dependency-upgrades.md, "pnpm itself")`,
    ]);
    const otherHex = pnpmDigest('10.34.9').toString('hex');
    expect(problems(await run(tree({ packageManager: `pnpm@10.34.8+sha512.${otherHex}` })))).toEqual([
      `pnpm integrity: package.json: packageManager's sha512 ${otherHex} is not the registry's dist.integrity for pnpm 10.34.8 (${pnpmDigest('10.34.8').toString('hex')}); set packageManager to "${want}"`,
    ]);
    expect(problems(await run(tree({ packageManager: `pnpm@10.34.8+sha256.${'a'.repeat(64)}` })))).toEqual([
      `pnpm integrity: package.json: packageManager "pnpm@10.34.8+sha256.${'a'.repeat(64)}" carries no +sha512.<hex>; set it to "${want}", the registry's dist.integrity for pnpm 10.34.8 in hex, which both Dockerfiles check the tarball against (docs/runbooks/dependency-upgrades.md, "pnpm itself")`,
    ]);
    const noIntegrity = fakeRegistry({ facts: { pnpm: { '10.34.8': { integrity: null } } } });
    expect(problems(await run(tree(), tree(), { registry: noIntegrity }))).toEqual(['pnpm integrity: registry.npmjs.org gives no sha512 dist.integrity for pnpm 10.34.8; check-toolchain fails closed']);
  });

  it('fails a packageManager pnpm under three days old, and passes it only with its exclude in both lists (CQ3 (a))', async () => {
    const young = tree({ packageManager: pm('10.34.9') });
    expect(problems(await run(young))).toEqual([
      expect.stringMatching(/^pnpm release age: packageManager's pnpm 10\.34\.9 was published 2026-10-25T17:54:00\.000Z, under three days ago; it is old enough from 2026-10-28T17:54:00\.000Z\. .*add "pnpm@10\.34\.9" to/),
    ]);
    const exclude = { package: 'pnpm@10.34.9', advisory: 'GHSA-2222-3333-4444', reason: 'synthetic: the first pnpm that fixes an advisory against the pinned one', added: '2026-10-25T20:00:00.000Z', expires: '2026-10-29T00:00:00.000Z' };
    const fixed = fakeRegistry({ advisories: { 'pnpm@10.34.8': [FIX_ADVISORY] } });
    expect(problems(await run(tree({ packageManager: pm('10.34.9'), workspace: { minimumReleaseAgeExclude: ['pnpm@10.34.9'] }, releaseAge: [exclude] }), tree(), { registry: fixed }))).toEqual([]);
    // In one list only: the age rule still fails, and so does the lists' equality.
    const half = problems(await run(tree({ packageManager: pm('10.34.9'), releaseAge: [exclude] }), tree(), { registry: fakeRegistry({ advisories: { 'pnpm@10.34.8': [FIX_ADVISORY] } }) }));
    expect(half).toHaveLength(2);
    expect(half[0]).toMatch(/^pnpm release age: /);
    expect(half[1]).toMatch(/^release-age excludes: tools\/check-toolchain\/release-age-exceptions\.json lists pnpm@10\.34\.9, which/);
    expect(problems(await run(tree({ packageManager: 'pnpm@10' })))).toEqual(['pnpm: package.json: packageManager is "pnpm@10", not pnpm@x.y.z']);
  });

  it('fails a trust exclude missing from either list or no longer in the lockfile', async () => {
    expect(problems(await run(tree({ trust: [] })))).toEqual([
      "trust excludes: pnpm-workspace.yaml's trustPolicyExclude lists semver@6.3.1, which tools/check-toolchain/trust-exceptions.json does not; the two lists are kept equal",
    ]);
    expect(problems(await run(tree({ workspace: { trustPolicyExclude: [] } })))).toEqual([
      "trust excludes: tools/check-toolchain/trust-exceptions.json lists semver@6.3.1, which pnpm-workspace.yaml's trustPolicyExclude does not; the two lists are kept equal",
    ]);
    expect(problems(await run(tree({ locked: ['old-lib@1.0.0'] })))).toEqual([
      'trust excludes: semver@6.3.1 is no longer resolved in pnpm-lock.yaml; remove it from trustPolicyExclude and tools/check-toolchain/trust-exceptions.json',
    ]);
  });

  it('fails an override without its entry, an entry without its override, and one whose target left the lockfile', async () => {
    const entry = { selector: 'typed-rest-client@2>qs', version: '6.16.1', reason: 'synthetic: the parent pins a version with advisories', removeWhen: 'the parent moves to a fixed range', added: '2026-10-27' };
    const locked = ['typed-rest-client@2.3.1', 'qs@6.16.1', 'semver@6.3.1'];
    const applied = { 'typed-rest-client@2.3.1': { qs: '6.16.1' }, 'qs@6.16.1': {}, 'semver@6.3.1': {} };
    const snapshots = (map: Record<string, Record<string, string>>) => Object.fromEntries(Object.entries(map).map(([key, dependencies]) => [key, { dependencies }]));
    const old = { 'old-lib': { '1.0.0': '2024-01-01T00:00:00.000Z' }, 'typed-rest-client': { '2.3.1': '2025-01-01T00:00:00.000Z' }, qs: { '6.16.1': '2026-10-14T22:06:00.000Z' } };
    const registry = () => fakeRegistry({ times: old });
    const workspace = { overrides: { 'typed-rest-client@2>qs': '6.16.1' } };
    const lockOverrides = workspace.overrides;
    expect(problems(await run(tree({ workspace, lockOverrides, locked, snapshots: snapshots(applied), overrides: [entry] }), tree(), { registry: registry() }))).toEqual([]);
    expect(problems(await run(tree({ workspace, lockOverrides, locked, snapshots: snapshots(applied) }), tree(), { registry: registry() }))).toEqual([
      'overrides: the pnpm overrides (pnpm-workspace.yaml, package.json) lists typed-rest-client@2>qs: 6.16.1, which tools/check-toolchain/overrides.json does not; the two lists are kept equal',
      "overrides: pnpm-lock.yaml's overrides (what pnpm applied) lists typed-rest-client@2>qs: 6.16.1, which tools/check-toolchain/overrides.json does not; the two lists are kept equal",
    ]);
    expect(problems(await run(tree({ locked, snapshots: snapshots(applied), overrides: [entry] }), tree(), { registry: registry() }))).toEqual([
      'overrides: tools/check-toolchain/overrides.json lists typed-rest-client@2>qs: 6.16.1, which the pnpm overrides (pnpm-workspace.yaml, package.json) does not; the two lists are kept equal',
      "overrides: tools/check-toolchain/overrides.json lists typed-rest-client@2>qs: 6.16.1, which pnpm-lock.yaml's overrides (what pnpm applied) does not; the two lists are kept equal",
    ]);
    // typed-rest-client 3 no longer depends on qs 6.16.1 through this selector: the override applies to nothing.
    const moved = { 'typed-rest-client@3.1.2': { qs: '6.16.1' }, 'qs@6.16.1': {}, 'semver@6.3.1': {} };
    const findings = await run(tree({ workspace, lockOverrides, locked: Object.keys(moved), snapshots: snapshots(moved), overrides: [entry] }), tree(), { registry: fakeRegistry({ times: { ...old, 'typed-rest-client': { '3.1.2': '2025-06-01T00:00:00.000Z' } } }) });
    expect(problems(findings)).toEqual([
      'overrides: the override typed-rest-client@2>qs: 6.16.1 no longer applies to anything pnpm-lock.yaml resolves (its target left); remove it and its entry (removal trigger: the parent moves to a fixed range)',
    ]);
  });

  it("reads package.json's resolutions as overrides, and holds overrides.json to the lockfile's own overrides map (S3)", async () => {
    // pnpm applies Yarn's resolutions as overrides: one entering there needs its entry like any other.
    expect(problems(await run(tree({ packageJson: { resolutions: { 'old-lib': '1.0.0' } }, lockOverrides: { 'old-lib': '1.0.0' } })))).toEqual([
      'overrides: the pnpm overrides (pnpm-workspace.yaml, package.json) lists old-lib: 1.0.0, which tools/check-toolchain/overrides.json does not; the two lists are kept equal',
      "overrides: pnpm-lock.yaml's overrides (what pnpm applied) lists old-lib: 1.0.0, which tools/check-toolchain/overrides.json does not; the two lists are kept equal",
    ]);
    const entry = { selector: 'old-lib', version: '1.0.0', reason: 'synthetic: the parent pins a version with advisories', removeWhen: 'the parent moves to a fixed range', added: '2026-10-27' };
    expect(problems(await run(tree({ packageJson: { resolutions: { 'old-lib': '1.0.0' } }, lockOverrides: { 'old-lib': '1.0.0' }, overrides: [entry] })))).toEqual([]);
    // The lockfile's map is what pnpm applied, whatever its source: one there and in no manifest is refused.
    expect(problems(await run(tree({ lockOverrides: { 'old-lib': '1.0.0' } })))).toEqual([
      "overrides: pnpm-lock.yaml's overrides (what pnpm applied) lists old-lib: 1.0.0, which tools/check-toolchain/overrides.json does not; the two lists are kept equal",
    ]);
  });

  it('fails closed when a networked read fails after its tries, naming the host', async () => {
    const findings = await run(tree({ locked: ['old-lib@1.0.0', 'semver@6.3.1', 'young-lib@2.0.1'] }), tree(), { registry: fakeRegistry({ fail: ['young-lib', 'pnpm', 'advisories'] }) });
    expect(problems(findings)).toEqual([
      'pnpm advisories: registry.npmjs.org: reading the bulk advisory endpoint failed after 3 tries with backoff (last: fetch failed); check-toolchain fails closed',
      "pnpm release age: registry.npmjs.org: reading pnpm's registry document failed after 3 tries with backoff (last: HTTP 503); check-toolchain fails closed",
      "lockfile release age: registry.npmjs.org: reading young-lib's registry document failed after 3 tries with backoff (last: HTTP 503); check-toolchain fails closed",
    ]);
  });

  it('refuses a lockfile entry that does not resolve from registry.npmjs.org by its sha512 integrity alone (S1)', async () => {
    const refused = (key: string, resolution: unknown) =>
      `lockfile resolutions: ${key}: resolves ${JSON.stringify(resolution)}; every entry resolves from https://registry.npmjs.org by its sha512 integrity alone (a tarball only under https://registry.npmjs.org/), so a git, directory or other host's tarball is refused`;
    const cases: Record<string, unknown>[] = [
      { integrity: 'sha512-AAAA', tarball: 'https://evil.example/evilpkg-9.9.9.tgz' },
      { integrity: 'sha512-AAAA', tarball: 'https://registry.npmjs.org.evil.example/old-lib/-/old-lib-1.0.0.tgz' },
      { integrity: 'sha512-AAAA', tarball: 'http://registry.npmjs.org/old-lib/-/old-lib-1.0.0.tgz' },
      { integrity: 'sha512-AAAA', tarball: 'https://user:pass@registry.npmjs.org/old-lib/-/old-lib-1.0.0.tgz' },
      { type: 'git', repo: 'https://github.com/octo/old-lib.git', commit: 'a'.repeat(40) },
      { type: 'directory', directory: '../old-lib' },
      { tarball: 'https://registry.npmjs.org/old-lib/-/old-lib-1.0.0.tgz' },
      { integrity: 'sha1-AAAA' },
    ];
    for (const resolution of cases) {
      // The entry is the base's too: the rule reads every entry, not only those a change adds.
      const shape = { resolutions: { 'old-lib@1.0.0': resolution } };
      expect(problems(await run(tree(shape), tree(shape))), JSON.stringify(resolution)).toEqual([refused('old-lib@1.0.0', resolution)]);
    }
    const missing = problems(await run(tree({ resolutions: { 'old-lib@1.0.0': null } }), tree()));
    expect(missing).toEqual(['lockfile resolutions: old-lib@1.0.0: resolves null; every entry resolves from https://registry.npmjs.org by its sha512 integrity alone (a tarball only under https://registry.npmjs.org/), so a git, directory or other host\'s tarball is refused']);
    // The registry's own tarball URL, with its integrity, is accepted.
    const own = { integrity: 'sha512-synthetic', tarball: 'https://registry.npmjs.org/old-lib/-/old-lib-1.0.0.tgz' };
    expect(problems(await run(tree({ resolutions: { 'old-lib@1.0.0': own } })))).toEqual([]);
  });

  it('fails an added version whose lockfile integrity is not the registry’s dist.integrity (S1)', async () => {
    const adds = tree({ locked: ['old-lib@1.0.0', 'old-lib@1.1.0', 'semver@6.3.1'] });
    expect(problems(await run(adds, tree(), { registry: fakeRegistry({ facts: { 'old-lib': { '1.1.0': { integrity: 'sha512-other' } } } }) }))).toEqual([
      "lockfile integrity: old-lib@1.1.0: the lockfile's integrity sha512-synthetic is not registry.npmjs.org's dist.integrity sha512-other for it; resolve it again from the registry",
    ]);
    expect(problems(await run(adds, tree(), { registry: fakeRegistry({ facts: { 'old-lib': { '1.1.0': { integrity: null } } } }) }))).toEqual([
      'lockfile integrity: old-lib@1.1.0: registry.npmjs.org gives no dist.integrity for it, so the lockfile\'s cannot be confirmed',
    ]);
    // An entry the base already holds is not read again.
    const registry = fakeRegistry({ facts: { 'old-lib': { '1.0.0': { integrity: 'sha512-other' } } } });
    expect(problems(await run(tree(), tree(), { registry }))).toEqual([]);
    expect(registry.reads).not.toContain('old-lib');
  });

  it('refuses a registry other than registry.npmjs.org, and a pnpmfile or config dependency that could rewrite resolutions (S1)', async () => {
    const npmjs = ['registry=https://registry.npmjs.org/', 'registry = "https://registry.npmjs.org"', '; a comment', '# another', '@tp:registry=https://registry.npmjs.org/', 'engine-strict=true'].join('\n');
    expect(problems(await run(tree({ npmrc: npmjs })))).toEqual([]);
    const refusals: [Shape, string][] = [
      [{ npmrc: 'registry=https://evil.example/' }, 'settings: .npmrc: registry is https://evil.example/; every package resolves from https://registry.npmjs.org/, the registry check-toolchain reads'],
      [{ npmrc: '@tp:registry=https://npm.pkg.github.com' }, 'settings: .npmrc: @tp:registry is https://npm.pkg.github.com; every package resolves from https://registry.npmjs.org/, the registry check-toolchain reads'],
      [{ npmrc: 'registry=${NPM_REGISTRY}' }, 'settings: .npmrc: registry is ${NPM_REGISTRY}; every package resolves from https://registry.npmjs.org/, the registry check-toolchain reads'],
      [{ workspace: { registry: 'https://evil.example' } }, 'settings: pnpm-workspace.yaml: registry is https://evil.example; every package resolves from https://registry.npmjs.org/, the registry check-toolchain reads'],
      [{ workspace: { '@tp:registry': 'https://evil.example' } }, 'settings: pnpm-workspace.yaml: @tp:registry is https://evil.example; every package resolves from https://registry.npmjs.org/, the registry check-toolchain reads'],
      [{ workspace: { registries: { default: 'https://evil.example/' } } }, 'settings: pnpm-workspace.yaml: registries.default is https://evil.example/; every package resolves from https://registry.npmjs.org/, the registry check-toolchain reads'],
      [{ pnpmfile: 'module.exports = { hooks: {} }' }, 'settings: .pnpmfile.cjs exists; a pnpmfile can rewrite any manifest or resolution where check-toolchain cannot see it, so the repository has none'],
      [{ workspace: { pnpmfile: 'hooks.cjs' } }, 'settings: pnpm-workspace.yaml: pnpmfile is set; a pnpmfile can rewrite any manifest or resolution where check-toolchain cannot see it, so the repository has none'],
      [{ workspace: { globalPnpmfile: '/tmp/hooks.cjs' } }, 'settings: pnpm-workspace.yaml: globalPnpmfile is set; a pnpmfile can rewrite any manifest or resolution where check-toolchain cannot see it, so the repository has none'],
      [{ workspace: { configDependencies: { hooks: '1.0.0+sha512-synthetic' } } }, 'settings: pnpm-workspace.yaml: configDependencies is set; a config dependency loads a pnpmfile, which can rewrite any manifest or resolution where check-toolchain cannot see it, so the repository has none'],
      [{ packageJson: { pnpm: { configDependencies: { hooks: '1.0.0+sha512-synthetic' } } } }, 'settings: package.json: pnpm.configDependencies is set; a config dependency loads a pnpmfile, which can rewrite any manifest or resolution where check-toolchain cannot see it, so the repository has none'],
      [{ npmrc: 'pnpmfile=hooks.cjs' }, 'settings: .npmrc: pnpmfile is set; a pnpmfile can rewrite any manifest or resolution where check-toolchain cannot see it, so the repository has none'],
      [{ npmrc: 'global-pnpmfile=/tmp/hooks.cjs' }, 'settings: .npmrc: global-pnpmfile is set; a pnpmfile can rewrite any manifest or resolution where check-toolchain cannot see it, so the repository has none'],
    ];
    for (const [shape, message] of refusals) {
      expect(problems(await run(tree(shape))), message).toEqual([message]);
    }
  });

  it('fails an added version with weaker trust evidence than a version published before it, unless trustPolicyExclude names it (S2)', async () => {
    const times = {
      trusty: { '1.0.0': '2025-01-01T00:00:00.000Z', '1.1.0': '2025-06-01T00:00:00.000Z', '1.1.1': '2026-10-02T00:00:00.000Z', '1.2.0': '2026-10-01T00:00:00.000Z', '0.9.9': '2026-10-03T00:00:00.000Z' },
      pre: { '2.0.0-rc.1': '2025-01-01T00:00:00.000Z', '2.0.0': '2025-02-01T00:00:00.000Z' },
      semver: { '7.5.1': '2023-05-12T00:00:00.000Z', '6.3.1': '2023-07-10T22:57:32.000Z' },
    };
    const facts: Facts = {
      trusty: { '1.0.0': { evidence: 'provenance' }, '1.1.0': { evidence: 'trustedPublisher' }, '1.1.1': { evidence: 'provenance' }, '1.2.0': { evidence: null }, '0.9.9': { evidence: 'trustedPublisher' } },
      pre: { '2.0.0-rc.1': { evidence: 'trustedPublisher' } },
      semver: { '7.5.1': { evidence: 'provenance' } },
    };
    const registry = () => fakeRegistry({ times, facts });
    const adds = (keys: readonly string[], extra: Shape = {}) => tree({ locked: ['old-lib@1.0.0', ...keys], trust: [], workspace: { trustPolicyExclude: [] }, ...extra });
    const downgrade = (key: string, has: string, had: string) =>
      `lockfile trust: ${key} has ${has}, but a version published before it had ${had}: a trust downgrade, the sign a maintainer's account may have published it outside the project's pipeline. pnpm's trustPolicy no-downgrade holds only where pnpm resolves, never in a frozen install, so it is held here where the version lands; a recent one is a security question for the founder, an old fixed one an exact trustPolicyExclude with its entry (docs/runbooks/dependency-upgrades.md, "The trust policy")`;
    expect(problems(await run(adds(['trusty@1.2.0', 'trusty@1.1.1']), tree({ locked: ['old-lib@1.0.0'], trust: [], workspace: { trustPolicyExclude: [] } }), { registry: registry() }))).toEqual([
      downgrade('trusty@1.1.1', 'a provenance attestation', 'a trusted publisher'),
      downgrade('trusty@1.2.0', 'no trust evidence', 'a trusted publisher'),
    ]);
    // By publish date, not semver: 0.9.9 was published after 1.1.0 and has a trusted publisher itself; 1.0.0 had nothing before it.
    const base = tree({ locked: ['old-lib@1.0.0'], trust: [], workspace: { trustPolicyExclude: [] } });
    expect(problems(await run(adds(['trusty@0.9.9', 'trusty@1.0.0']), base, { registry: registry() }))).toEqual([]);
    // A prerelease's evidence does not bind a release.
    expect(problems(await run(adds(['pre@2.0.0']), base, { registry: registry() }))).toEqual([]);
    // An exact exclude in both lists passes the version (semver 6.3.1, CQ2 (a)).
    const excluded = tree({ locked: ['old-lib@1.0.0', 'semver@6.3.1'] });
    expect(problems(await run(excluded, base, { registry: registry() }))).toEqual([]);
    expect(problems(await run(adds(['semver@6.3.1']), base, { registry: registry() }))).toEqual([downgrade('semver@6.3.1', 'no trust evidence', 'a provenance attestation')]);
  });

  it('refuses trustPolicyIgnoreAfter, and any release-age or trust-policy setting in .npmrc (S2)', async () => {
    expect(problems(await run(tree({ workspace: { trustPolicyIgnoreAfter: 1 } })))).toEqual([
      'gates: pnpm-workspace.yaml: trustPolicyIgnoreAfter is set; it waives the trust policy for every version published longer ago than that many minutes, so a future downgrade of any old version would pass (CQ2 (a))',
    ]);
    for (const line of ['trust-policy=off', 'trust-policy-ignore-after=1', 'trust-policy-exclude[]=evil@1.0.0', 'minimum-release-age=0', 'minimum-release-age-exclude[]=evil@1.0.0', 'trustPolicy=off']) {
      const key = line.slice(0, line.indexOf('='));
      expect(problems(await run(tree({ npmrc: line }))), line).toEqual([
        `gates: .npmrc: ${key} is set; the release age and the trust policy are set in pnpm-workspace.yaml alone, where check-toolchain reads and holds them`,
      ]);
    }
  });

  it('holds the gates as ruled: at least three days, and no trust downgrade', async () => {
    expect(problems(await run(tree({ workspace: { minimumReleaseAge: 1440, trustPolicy: undefined } })))).toEqual([
      "gates: pnpm-workspace.yaml: minimumReleaseAge is 1440; the founder's F2 (b) requires at least 4320 (three days)",
      'gates: pnpm-workspace.yaml: trustPolicy is unset, not no-downgrade (CQ2 (a))',
    ]);
  });

  it('refuses a list it cannot read, naming the file', async () => {
    const findings = await run({ ...tree(), releaseAgeExceptions: '{"entries": [{"package": "x@1.0.0"}]}' });
    expect(findings.map((finding) => finding.rule)).toEqual(['files']);
    expect(findings[0]?.message).toMatch(/^tools\/check-toolchain\/release-age-exceptions\.json: entries\.0\.advisory: /);
  });

  it('reads specs, versions and override selectors', () => {
    expect(splitSpec('@scope/name@1.2.3')).toEqual({ name: '@scope/name', version: '1.2.3' });
    expect(['10.34.9', '10.4.0', '10.34.8', '10.35.0-rc.0', '10.35.0'].sort(compareVersions)).toEqual(['10.4.0', '10.34.8', '10.34.9', '10.35.0-rc.0', '10.35.0']);
    expect(parseSelector('typed-rest-client@2>qs')).toEqual({ parent: { name: 'typed-rest-client', range: '2' }, target: { name: 'qs', range: '' } });
    expect(parseSelector('@scope/a@>=2>@scope/b@<1')).toEqual({ parent: { name: '@scope/a', range: '>=2' }, target: { name: '@scope/b', range: '<1' } });
    expect(parseSelector('qs@<6.16.0')).toEqual({ parent: null, target: { name: 'qs', range: '<6.16.0' } });
    expect([rangeHolds('2', '2.3.1'), rangeHolds('2', '3.0.0'), rangeHolds('2.3', '2.3.9'), rangeHolds('2.3.1', '2.3.1'), rangeHolds('', '9.9.9')]).toEqual([true, false, true, true, true]);
  });
});

describe('the committed lists', () => {
  it('hold the trust exclude CQ2 (a) ruled, and no audit or release-age entry', async () => {
    const { readFileSync } = await import('node:fs');
    const read = (file: string) => JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8')) as { entries: Record<string, string>[] };
    expect(read('./trust-exceptions.json').entries.map((entry) => entry.package)).toEqual(['semver@6.3.1']);
    expect(read('./audit-exceptions.json').entries).toEqual([]);
    expect(read('./release-age-exceptions.json').entries).toEqual([]);
  });

  it("hold the repository's real tree to every offline rule, overrides and trust excludes among them (ci-infra N3)", async () => {
    const { repositoryRoot } = await import('../content-files');
    const { readWorkingTree } = await import('./tree');
    const real = readWorkingTree(repositoryRoot);
    const findings = checkOffline(real);
    expect(problems(findings)).toEqual([]);
    expect(findings.map((finding) => finding.rule)).toEqual(['gates', 'settings', 'Dockerfiles', 'lockfile resolutions', 'trust excludes', 'overrides']);
    // packageManager carries the tarball's sha512 the images check (N1); the networked rule holds it to the registry.
    expect(JSON.parse(real.packageJson ?? '{}')).toMatchObject({ packageManager: expect.stringMatching(/^pnpm@\d+\.\d+\.\d+\+sha512\.[0-9a-f]{128}$/) as unknown });
    // The slip it exists to catch: an override without its overrides.json entry. Whatever overrides the real tree
    // declares (none, the qs one, or more), each has its entry, and the same tree with the entries dropped fails once
    // for each; the synthetic case in the overrides block holds the rule even when the real tree declares none.
    const { parse } = await import('yaml');
    const manifest = JSON.parse(real.packageJson ?? '{}') as { resolutions?: Record<string, string>; pnpm?: { overrides?: Record<string, string> } };
    const workspace = parse(real.workspace ?? '') as { overrides?: Record<string, string> } | null;
    const declared = Object.entries({ ...manifest.resolutions, ...manifest.pnpm?.overrides, ...workspace?.overrides }).map(([selector, version]) => `${selector}: ${version}`);
    const entries = (JSON.parse(real.overrides ?? '{}') as { entries: { selector: string; version: string }[] }).entries;
    expect(entries.map((entry) => `${entry.selector}: ${entry.version}`).sort()).toEqual([...declared].sort());
    const dropped = problems(checkOffline({ ...real, overrides: JSON.stringify({ entries: [] }) }));
    expect(dropped.filter((problem) => problem.startsWith('overrides: the pnpm overrides ')).sort()).toEqual(
      declared.map((pair) => `overrides: the pnpm overrides (pnpm-workspace.yaml, package.json) lists ${pair}, which tools/check-toolchain/overrides.json does not; the two lists are kept equal`).sort(),
    );
  });
});

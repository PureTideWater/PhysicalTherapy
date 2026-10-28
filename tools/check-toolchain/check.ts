import { ageWords, excludeWindowProblems, expiredExclude, releaseAgeMinutes } from './exclude-window';
import { COMPOSE_FILE, IMAGE_AGE_EXCEPTIONS_FILE, imageFormRule, imageRule } from './images';
import {
  AUDIT_EXCEPTION_MAX_DAYS,
  DAY_MS,
  EXACT_SPEC,
  MINIMUM_RELEASE_AGE_MINUTES,
  MINUTE_MS,
  type PackageJson,
  SEMVER,
  type Workspace,
  auditExceptionsSchema,
  compareVersions,
  lockedPackages,
  lockfileSchema,
  type Lockfile,
  imageAgeExceptionsSchema,
  type ImageAgeException,
  overrideEntriesSchema,
  packageJsonSchema,
  parseJsonFile,
  parseSelector,
  parseYamlFile,
  pnpmDigest,
  pnpmVersion,
  rangeHolds,
  releaseAgeExceptionsSchema,
  type ReleaseAgeException,
  sha512Hex,
  snapshotSpec,
  splitSpec,
  trustExceptionsSchema,
  workspaceSchema,
} from './policy';
import { NetworkReadError, type Packument, type Registry, type TrustEvidence } from './registry';

/**
 * `pnpm toolchain:check` (designs/lane-b-ci.md §3.2.1, "Audit and toolchain"; test matrix CI-14; ADR 0066 Part 2): the
 * pnpm CI runs and every version the lockfile adds, held to the founder's F2 (b) three-day release age, with each
 * exception written down, dated and kept equal to the setting pnpm reads; and (ADR 0066 Part 5, CI-22) every image
 * digest the tree adds, held to the same age by the push time Docker Hub recorded (images.ts). It compares this tree with
 * the base (the range step's base, reduced with git merge-base), so a change is judged on what it adds.
 */

/** The files check-toolchain reads, root-relative. */
export const FILES = {
  packageJson: 'package.json',
  workspace: 'pnpm-workspace.yaml',
  lockfile: 'pnpm-lock.yaml',
  auditExceptions: 'tools/check-toolchain/audit-exceptions.json',
  releaseAgeExceptions: 'tools/check-toolchain/release-age-exceptions.json',
  trustExceptions: 'tools/check-toolchain/trust-exceptions.json',
  overrides: 'tools/check-toolchain/overrides.json',
  npmrc: '.npmrc',
  pnpmfile: '.pnpmfile.cjs',
  compose: COMPOSE_FILE,
  imageAgeExceptions: IMAGE_AGE_EXCEPTIONS_FILE,
} as const;

/** The one registry every package resolves from, and the one check-toolchain reads. */
export const NPMJS = 'https://registry.npmjs.org/';

/**
 * One tree's text of those files (undefined: absent), its apps' Dockerfiles and its workflows by root-relative path, and
 * the paths of the image files it tracks outside the three the image rule reads (tree.ts).
 */
export type Tree = { readonly [key in keyof typeof FILES]?: string } & {
  readonly dockerfiles?: Readonly<Record<string, string>>;
  readonly workflows?: Readonly<Record<string, string>>;
  readonly imageFiles?: readonly string[];
};

/** A push run follows a green pull request, so it warns where a pull request that edits a list fails. */
export type CheckEvent = 'push' | 'pull_request';

export interface CheckInput {
  readonly head: Tree;
  readonly base: Tree;
  readonly event: CheckEvent;
  readonly now: Date;
  /** The deadline of the image rule's Docker Hub reads in ms, from the first (READ_DEADLINE_MS by default); its message names it. */
  readonly deadlineMs?: number;
}

export type Level = 'error' | 'warning' | 'ok';
export interface Finding {
  readonly level: Level;
  readonly rule: string;
  readonly message: string;
}

/** What one tree says, parsed; problems name the file that could not be read. */
interface Config {
  readonly packageJson: PackageJson;
  readonly workspace: Workspace;
  readonly lockfile: Lockfile | null;
  readonly auditExceptions: ReturnType<typeof auditExceptionsSchema.parse>['entries'];
  readonly releaseAgeExceptions: readonly ReleaseAgeException[];
  readonly trustExceptions: ReturnType<typeof trustExceptionsSchema.parse>['entries'];
  readonly overrides: ReturnType<typeof overrideEntriesSchema.parse>['entries'];
  readonly imageAgeExceptions: readonly ImageAgeException[];
  /** `.npmrc`'s settings, key to value, in file order (absent: none). */
  readonly npmrc: readonly (readonly [string, string])[];
  /** Whether the tree holds a `.pnpmfile.cjs`. */
  readonly pnpmfile: boolean;
  readonly problems: readonly string[];
}

/** `.npmrc`'s `key=value` lines, comments and blank lines dropped, a quoted value unquoted. */
export function npmrcSettings(text: string | undefined): [string, string][] {
  if (text === undefined) {
    return [];
  }
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#') && !line.startsWith(';'))
    .map((line): [string, string] => {
      const at = line.indexOf('=');
      const key = (at === -1 ? line : line.slice(0, at)).trim();
      const value = at === -1 ? 'true' : line.slice(at + 1).trim();
      return [key, /^(["']).*\1$/.test(value) ? value.slice(1, -1) : value];
    });
}

function readConfig(tree: Tree): Config {
  const problems: string[] = [];
  const take = <T>(parsed: { ok: true; value: T } | { ok: false; problem: string }, empty: T): T => {
    if (parsed.ok) {
      return parsed.value;
    }
    problems.push(parsed.problem);
    return empty;
  };
  const lockfile = tree.lockfile === undefined ? null : take(parseYamlFile(FILES.lockfile, tree.lockfile, lockfileSchema, { lockfileVersion: '9.0' }), null);
  return {
    packageJson: take(parseJsonFile(FILES.packageJson, tree.packageJson, packageJsonSchema, {}), {}),
    workspace: take(parseYamlFile(FILES.workspace, tree.workspace, workspaceSchema, {}), {}),
    lockfile,
    auditExceptions: take(parseJsonFile(FILES.auditExceptions, tree.auditExceptions, auditExceptionsSchema, { entries: [] }), { entries: [] }).entries,
    releaseAgeExceptions: take(parseJsonFile(FILES.releaseAgeExceptions, tree.releaseAgeExceptions, releaseAgeExceptionsSchema, { entries: [] }), { entries: [] }).entries,
    trustExceptions: take(parseJsonFile(FILES.trustExceptions, tree.trustExceptions, trustExceptionsSchema, { entries: [] }), { entries: [] }).entries,
    overrides: take(parseJsonFile(FILES.overrides, tree.overrides, overrideEntriesSchema, { entries: [] }), { entries: [] }).entries,
    imageAgeExceptions: take(parseJsonFile(FILES.imageAgeExceptions, tree.imageAgeExceptions, imageAgeExceptionsSchema, { entries: [] }), { entries: [] }).entries,
    npmrc: npmrcSettings(tree.npmrc),
    pnpmfile: tree.pnpmfile !== undefined,
    problems,
  };
}

function failClosed(rule: string, error: unknown): Finding {
  if (error instanceof NetworkReadError) {
    return { level: 'error', rule, message: error.message };
  }
  throw error;
}

/** The members of a list that occur more than once. */
function duplicates(items: readonly string[]): string[] {
  const seen = new Set<string>();
  return [...new Set(items.filter((item) => (seen.has(item) ? true : (seen.add(item), false))))];
}

/** One line per member of either list missing from the other, naming both. */
function sameMembers(rule: string, left: readonly string[], leftName: string, right: readonly string[], rightName: string): Finding[] {
  const findings: Finding[] = [];
  for (const item of duplicates(left)) {
    findings.push({ level: 'error', rule, message: `${leftName} lists ${item} more than once` });
  }
  for (const item of duplicates(right)) {
    findings.push({ level: 'error', rule, message: `${rightName} lists ${item} more than once` });
  }
  const rightSet = new Set(right);
  const leftSet = new Set(left);
  for (const item of left.filter((entry) => !rightSet.has(entry))) {
    findings.push({ level: 'error', rule, message: `${leftName} lists ${item}, which ${rightName} does not; the two lists are kept equal` });
  }
  for (const item of right.filter((entry) => !leftSet.has(entry))) {
    findings.push({ level: 'error', rule, message: `${rightName} lists ${item}, which ${leftName} does not; the two lists are kept equal` });
  }
  return findings;
}

/** At most `limit` reads at once. */
async function mapLimit<T, R>(items: readonly T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await run(items[index] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

/** The release-age excludes in force: in minimumReleaseAgeExclude and in release-age-exceptions.json, unexpired. */
function liveExcludes(head: Config, now: Date): ReadonlySet<string> {
  const listed = new Set(head.workspace.minimumReleaseAgeExclude ?? []);
  return new Set(head.releaseAgeExceptions.filter((entry) => listed.has(entry.package) && Date.parse(entry.expires) > now.getTime()).map((entry) => entry.package));
}

const REMEDY =
  'wait until then, or, for a security fix, add it to pnpm-workspace.yaml’s minimumReleaseAgeExclude and to tools/check-toolchain/release-age-exceptions.json with its advisory, the date added and an expiry (docs/runbooks/dependency-upgrades.md, "The release age")';

function gatesRule(head: Config): Finding[] {
  const rule = 'gates';
  const { workspace } = head;
  const findings: Finding[] = [];
  const minutes = workspace.minimumReleaseAge;
  if (minutes === undefined || minutes < MINIMUM_RELEASE_AGE_MINUTES) {
    findings.push({ level: 'error', rule, message: `${FILES.workspace}: minimumReleaseAge is ${String(minutes ?? 'unset')}; the founder's F2 (b) requires at least ${String(MINIMUM_RELEASE_AGE_MINUTES)} (three days)` });
  }
  if (workspace.trustPolicy !== 'no-downgrade') {
    findings.push({ level: 'error', rule, message: `${FILES.workspace}: trustPolicy is ${String(workspace.trustPolicy ?? 'unset')}, not no-downgrade (CQ2 (a))` });
  }
  // S2: pnpm 10.34.8 honours trustPolicyIgnoreAfter (minutes since publish), which would pass a downgrade of any older version.
  if ('trustPolicyIgnoreAfter' in workspace) {
    findings.push({
      level: 'error',
      rule,
      message: `${FILES.workspace}: trustPolicyIgnoreAfter is set; it waives the trust policy for every version published longer ago than that many minutes, so a future downgrade of any old version would pass (CQ2 (a))`,
    });
  }
  // The gates live in one file: an .npmrc setting would override or loosen them where this check does not read.
  for (const [key] of head.npmrc) {
    const plain = key.toLowerCase().replace(/[-_]/g, '').replace(/\[\]$/, '');
    if (plain.startsWith('trustpolicy') || plain.startsWith('minimumreleaseage')) {
      findings.push({ level: 'error', rule, message: `${FILES.npmrc}: ${key} is set; the release age and the trust policy are set in ${FILES.workspace} alone, where check-toolchain reads and holds them` });
    }
  }
  return findings.length > 0 ? findings : [{ level: 'ok', rule, message: `minimumReleaseAge ${String(minutes)} minutes, trustPolicy no-downgrade, neither loosened elsewhere` }];
}

/** Whether a registry setting names registry.npmjs.org itself (with or without its trailing slash). */
function isNpmjs(value: unknown): boolean {
  return value === NPMJS || value === NPMJS.slice(0, -1);
}

const PNPMFILE = 'a pnpmfile can rewrite any manifest or resolution where check-toolchain cannot see it, so the repository has none';

/**
 * S1: every package resolves from registry.npmjs.org, the registry whose times, integrity and trust check-toolchain
 * reads, and nothing rewrites a resolution out of its sight: no other registry (default or scoped) in `.npmrc` or
 * `pnpm-workspace.yaml`, no pnpmfile and no config dependency (which loads one).
 */
function settingsRule(head: Config): Finding[] {
  const rule = 'settings';
  const findings: Finding[] = [];
  const registry = (file: string, key: string, value: unknown) => {
    if (!isNpmjs(value)) {
      findings.push({ level: 'error', rule, message: `${file}: ${key} is ${typeof value === 'string' ? value : JSON.stringify(value)}; every package resolves from ${NPMJS}, the registry check-toolchain reads` });
    }
  };
  for (const [key, value] of head.npmrc) {
    if (key === 'registry' || /^@[^:]+:registry$/.test(key)) {
      registry(FILES.npmrc, key, value);
    }
    if (key === 'pnpmfile' || key === 'global-pnpmfile') {
      findings.push({ level: 'error', rule, message: `${FILES.npmrc}: ${key} is set; ${PNPMFILE}` });
    }
  }
  const workspace = head.workspace as Record<string, unknown>;
  for (const [key, value] of Object.entries(workspace)) {
    if (key === 'registry' || /^@[^:]+:registry$/.test(key)) {
      registry(FILES.workspace, key, value);
    }
    if (key === 'registries') {
      const entries = value !== null && typeof value === 'object' ? Object.entries(value) : [['', value] as const];
      for (const [scope, url] of entries) {
        registry(FILES.workspace, scope === '' ? key : `${key}.${scope}`, url);
      }
    }
    if (key === 'pnpmfile' || key === 'globalPnpmfile') {
      findings.push({ level: 'error', rule, message: `${FILES.workspace}: ${key} is set; ${PNPMFILE}` });
    }
    if (key === 'configDependencies' && value !== null && !(typeof value === 'object' && Object.keys(value).length === 0)) {
      findings.push({ level: 'error', rule, message: `${FILES.workspace}: ${key} is set; a config dependency loads a pnpmfile, which can rewrite any manifest or resolution where check-toolchain cannot see it, so the repository has none` });
    }
  }
  // pnpm 10 also reads configDependencies from package.json's pnpm field.
  const fromManifest = head.packageJson.pnpm?.configDependencies;
  if (fromManifest !== undefined && fromManifest !== null && !(typeof fromManifest === 'object' && Object.keys(fromManifest).length === 0)) {
    findings.push({ level: 'error', rule, message: `${FILES.packageJson}: pnpm.configDependencies is set; a config dependency loads a pnpmfile, which can rewrite any manifest or resolution where check-toolchain cannot see it, so the repository has none` });
  }
  if (head.pnpmfile) {
    findings.push({ level: 'error', rule, message: `${FILES.pnpmfile} exists; ${PNPMFILE}` });
  }
  return findings.length > 0 ? findings : [{ level: 'ok', rule, message: `every package resolves from ${NPMJS}; no pnpmfile or config dependency` }];
}

function pnpmRules(
  packageManager: string,
  version: string,
  pnpm: Packument | Error,
  advisories: Awaited<ReturnType<Registry['advisories']>> | Error,
  live: ReadonlySet<string>,
  minutes: number,
  now: Date,
): Finding[] {
  const findings: Finding[] = [];
  // Advisories: moderate or worse fails, a low one warns.
  if (advisories instanceof Error) {
    findings.push(failClosed('pnpm advisories', advisories));
  } else {
    const hits = advisories.pnpm ?? [];
    for (const advisory of hits) {
      const serious = ['moderate', 'high', 'critical'].includes(advisory.severity);
      findings.push({
        level: serious ? 'error' : 'warning',
        rule: 'pnpm advisories',
        message: `packageManager's pnpm ${version} has a ${advisory.severity} advisory, ${advisory.url} (${advisory.title}; vulnerable ${advisory.vulnerable_versions}); move packageManager to the first fixed version (docs/runbooks/dependency-upgrades.md, "pnpm itself")`,
      });
    }
    if (hits.length === 0) {
      findings.push({ level: 'ok', rule: 'pnpm advisories', message: `pnpm ${version}: no advisory (registry.npmjs.org bulk endpoint)` });
    }
  }
  if (pnpm instanceof Error) {
    findings.push(failClosed('pnpm release age', pnpm));
    return findings;
  }
  // CQ3 (a): the pnpm every CI job switches to is held to the release age the lockfile is held to.
  const published = pnpm.time[version];
  if (published === undefined) {
    findings.push({ level: 'error', rule: 'pnpm release age', message: `registry.npmjs.org gives no publish time for pnpm ${version}` });
  } else {
    const matureAt = Date.parse(published) + minutes * MINUTE_MS;
    if (matureAt <= now.getTime()) {
      findings.push({ level: 'ok', rule: 'pnpm release age', message: `pnpm ${version} was published ${published}, at least ${ageWords(minutes)} ago` });
    } else if (live.has(`pnpm@${version}`)) {
      findings.push({ level: 'ok', rule: 'pnpm release age', message: `pnpm ${version} was published ${published}, under ${ageWords(minutes)} ago, and has a live dated exclude` });
    } else {
      findings.push({
        level: 'error',
        rule: 'pnpm release age',
        message: `packageManager's pnpm ${version} was published ${published}, under ${ageWords(minutes)} ago; it is old enough from ${new Date(matureAt).toISOString()}. CI switches to it outside the workspace's release age (CQ3 (a)): ${REMEDY.replace('add it', `add "pnpm@${version}"`)}`,
      });
    }
  }
  // A newer release of the same major, old enough: Dependabot never moves packageManager, so a person does.
  const major = SEMVER.exec(version)?.[1];
  const newer = pnpm.versions
    .filter((candidate) => {
      const match = SEMVER.exec(candidate);
      const time = pnpm.time[candidate];
      return match !== null && match[1] === major && match[4] === undefined && compareVersions(candidate, version) > 0 && time !== undefined && Date.parse(time) + minutes * MINUTE_MS <= now.getTime();
    })
    .sort(compareVersions)
    .at(-1);
  findings.push(
    newer === undefined
      ? { level: 'ok', rule: 'newer pnpm', message: `no ${String(major)}.x newer than ${version} is ${ageWords(minutes)} old` }
      : {
          level: 'warning',
          rule: 'newer pnpm',
          message: `pnpm ${newer} (published ${pnpm.time[newer] ?? '?'}) is newer than packageManager's ${version} and at least ${ageWords(minutes)} old; Dependabot never moves packageManager, so bump it by hand at the weekly triage (docs/runbooks/dependency-upgrades.md, "pnpm itself")`,
        },
  );
  findings.push(pnpmIntegrityRule(packageManager, version, pnpm));
  return findings;
}

/**
 * N1: packageManager carries `+sha512.<hex>` of the registry's tarball for its pnpm, which both Dockerfiles check the
 * tarball they install against (tools/check-toolchain/install-pnpm.sh). Neither pnpm's own switch nor action-setup
 * reads the suffix (each strips it), so it is held here, equal to the registry's dist.integrity.
 */
function pnpmIntegrityRule(packageManager: string, version: string, pnpm: Packument): Finding {
  const rule = 'pnpm integrity';
  const registry = sha512Hex(pnpm.facts[version]?.integrity);
  if (registry === null) {
    return { level: 'error', rule, message: `registry.npmjs.org gives no sha512 dist.integrity for pnpm ${version}; check-toolchain fails closed` };
  }
  const want = `pnpm@${version}+sha512.${registry}`;
  const digest = pnpmDigest(packageManager);
  if (digest === null) {
    return {
      level: 'error',
      rule,
      message: `${FILES.packageJson}: packageManager ${JSON.stringify(packageManager)} carries no +sha512.<hex>; set it to "${want}", the registry's dist.integrity for pnpm ${version} in hex, which both Dockerfiles check the tarball against (docs/runbooks/dependency-upgrades.md, "pnpm itself")`,
    };
  }
  if (digest !== registry) {
    return { level: 'error', rule, message: `${FILES.packageJson}: packageManager's sha512 ${digest} is not the registry's dist.integrity for pnpm ${version} (${registry}); set packageManager to "${want}"` };
  }
  return { level: 'ok', rule, message: `packageManager's sha512 is the registry's dist.integrity for pnpm ${version}` };
}

/** The one way an image installs pnpm: install-pnpm.sh, which checks the tarball against packageManager's sha512 (N1). */
export const PNPM_INSTALLER = 'tools/check-toolchain/install-pnpm.sh';

/**
 * Neither Dockerfile names a pnpm version, and each installs pnpm only by copying install-pnpm.sh and running it on
 * package.json, which derives the version from packageManager and checks the tarball against its sha512.
 */
export function dockerfileRule(dockerfiles: Readonly<Record<string, string>>, version: string | null): Finding[] {
  const rule = 'Dockerfiles';
  const findings: Finding[] = [];
  const files = Object.keys(dockerfiles).sort();
  if (files.length === 0) {
    return [{ level: 'error', rule, message: 'no Dockerfile found under apps/*/' }];
  }
  for (const file of files) {
    const text = dockerfiles[file] ?? '';
    text.split('\n').forEach((line, index) => {
      const literal = /pnpm@v?\d/.test(line) || (version !== null && /pnpm/i.test(line) && line.includes(version));
      if (literal) {
        findings.push({ level: 'error', rule, message: `${file}:${String(index + 1)} names a pnpm version; derive it from package.json's packageManager, so one field moves every pnpm` });
      }
      const instruction = line.trim();
      const other = !instruction.startsWith('#') && /\bpnpm\b/.test(instruction) && (/\b(?:npm|yarn)\s+(?:install|i|add)\b/.test(instruction) || /\bcorepack\b/.test(instruction) || /\bnpx\s+(?:-y\s+)?pnpm\b/.test(instruction));
      if (other) {
        findings.push({ level: 'error', rule, message: `${file}:${String(index + 1)} installs pnpm other than through ${PNPM_INSTALLER}, which alone checks the tarball against packageManager's sha512` });
      }
    });
    const copied = /^COPY\s+(?:--\S+\s+)*tools\/check-toolchain\/install-pnpm\.sh\s+(\S+)\s*$/m.exec(text)?.[1];
    const runs = copied !== undefined && new RegExp(`^RUN\\s+sh\\s+${copied.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}\\s+package\\.json\\b`, 'm').test(text);
    if (!runs) {
      findings.push({ level: 'error', rule, message: `${file} does not install pnpm with ${PNPM_INSTALLER} (COPY it, then RUN sh <it> package.json), which checks the tarball against packageManager's sha512` });
    }
  }
  return findings.length > 0 ? findings : [{ level: 'ok', rule, message: `${files.join(' and ')} install pnpm with ${PNPM_INSTALLER}, from packageManager and checked against its sha512; no pnpm literal` }];
}

function auditRule(head: Config, now: Date): Finding[] {
  const rule = 'audit exceptions';
  const ignored = head.workspace.auditConfig?.ignoreGhsas ?? [];
  const findings = sameMembers(rule, ignored, `${FILES.workspace}'s auditConfig.ignoreGhsas`, head.auditExceptions.map((entry) => entry.ghsa), FILES.auditExceptions);
  for (const entry of head.auditExceptions) {
    const added = Date.parse(entry.added);
    const expires = Date.parse(entry.expires);
    if (added > now.getTime()) {
      findings.push({ level: 'error', rule, message: `${entry.ghsa}: added ${entry.added}, a date in the future` });
    }
    if (now.getTime() - added > AUDIT_EXCEPTION_MAX_DAYS * DAY_MS) {
      findings.push({ level: 'error', rule, message: `${entry.ghsa}: added ${entry.added}, more than ${String(AUDIT_EXCEPTION_MAX_DAYS)} days ago; fix it or remove the exception` });
    }
    if (expires <= now.getTime()) {
      findings.push({ level: 'error', rule, message: `${entry.ghsa}: expired ${entry.expires}; fix it or remove the exception` });
    }
    if (expires - added > AUDIT_EXCEPTION_MAX_DAYS * DAY_MS) {
      findings.push({ level: 'error', rule, message: `${entry.ghsa}: expires ${entry.expires}, more than ${String(AUDIT_EXCEPTION_MAX_DAYS)} days after it was added` });
    }
  }
  return findings.length > 0 ? findings : [{ level: 'ok', rule, message: `${String(ignored.length)} audit exception(s), equal in both lists and in date` }];
}

const EXCLUDE_PURPOSE = 'an exclude is only for the fix of an advisory against what we run (docs/runbooks/dependency-upgrades.md, "The release age")';

/** The versions of a package the base runs, other than `except`: its lockfile's, and packageManager's for pnpm. */
function baseVersions(base: Config, name: string, except: string): string[] {
  const versions = new Set<string>();
  for (const key of base.lockfile === null ? [] : lockedPackages(base.lockfile)) {
    const spec = splitSpec(key);
    if (spec.name === name) {
      versions.add(spec.version);
    }
  }
  const pnpm = name === 'pnpm' ? pnpmVersion(base.packageJson.packageManager) : null;
  if (pnpm !== null) {
    versions.add(pnpm);
  }
  versions.delete(except);
  return [...versions].sort(compareVersions);
}

/** Whether an advisory list names a GHSA (the bulk endpoint gives it as the advisory's GitHub URL). */
function namesGhsa(advisories: readonly { readonly url: string }[] | undefined, ghsa: string): boolean {
  return (advisories ?? []).some((advisory) => advisory.url.replace(/\/+$/, '').split('/').at(-1)?.toUpperCase() === ghsa.toUpperCase());
}

/**
 * N3: an exclude this change adds names an advisory npm's bulk endpoint reports against a version of the package the
 * base runs, and not against the excluded version itself, so "a security fix" is checked rather than only well formed.
 */
async function excludeAdvisoryFindings(entry: ReleaseAgeException, base: Config, registry: Registry): Promise<Finding[]> {
  const rule = 'release-age excludes';
  const { name, version } = splitSpec(entry.package);
  const before = baseVersions(base, name, version);
  if (before.length === 0) {
    return [{ level: 'error', rule, message: `${entry.package}: the base locks no other version of ${name}, so no advisory against what we run can be fixed by it; ${EXCLUDE_PURPOSE}` }];
  }
  try {
    const [against, itself] = await Promise.all([registry.advisories({ [name]: before }), registry.advisories({ [name]: [version] })]);
    const findings: Finding[] = [];
    if (!namesGhsa(against[name], entry.advisory)) {
      findings.push({ level: 'error', rule, message: `${entry.package}: the bulk advisory endpoint does not report ${entry.advisory} against the version${before.length === 1 ? '' : 's'} the base locks (${before.join(', ')}); ${EXCLUDE_PURPOSE}` });
    }
    if (namesGhsa(itself[name], entry.advisory)) {
      findings.push({ level: 'error', rule, message: `${entry.package}: the bulk advisory endpoint reports ${entry.advisory} against ${entry.package} itself, so it is not the fix` });
    }
    return findings;
  } catch (error) {
    return [failClosed(rule, error)];
  }
}

async function releaseAgeExcludeRule(head: Config, base: Config, input: CheckInput, minutes: number, registry: Registry): Promise<Finding[]> {
  const rule = 'release-age excludes';
  const listed = head.workspace.minimumReleaseAgeExclude ?? [];
  const findings: Finding[] = [];
  for (const item of listed) {
    if (!EXACT_SPEC.test(item) || item.includes('*') || item.includes('||')) {
      findings.push({ level: 'error', rule, message: `${FILES.workspace}: minimumReleaseAgeExclude entry "${item}" is not one exact version (name@x.y.z); a bare name, a pattern or a union is refused, so each exclude has one expiry` });
    }
  }
  findings.push(...sameMembers(rule, listed, `${FILES.workspace}'s minimumReleaseAgeExclude`, head.releaseAgeExceptions.map((entry) => entry.package), FILES.releaseAgeExceptions));
  const baseEntries = new Set(base.releaseAgeExceptions.map((entry) => JSON.stringify(entry)));
  const edited =
    JSON.stringify([...listed].sort()) !== JSON.stringify([...(base.workspace.minimumReleaseAgeExclude ?? [])].sort()) ||
    JSON.stringify(head.releaseAgeExceptions.map((entry) => JSON.stringify(entry)).sort()) !== JSON.stringify([...baseEntries].sort());
  for (const entry of head.releaseAgeExceptions) {
    if (!EXACT_SPEC.test(entry.package)) {
      findings.push({ level: 'error', rule, message: `${FILES.releaseAgeExceptions}: "${entry.package}" is not one exact version (name@x.y.z)` });
      continue;
    }
    // An entry this change adds (or rewrites) covers its version's whole young window and never outlives seven days.
    if (!baseEntries.has(JSON.stringify(entry))) {
      const { name, version } = splitSpec(entry.package);
      let published: string | undefined;
      let unread: Finding | undefined;
      try {
        published = (await registry.packument(name)).time[version];
      } catch (error) {
        unread = failClosed(rule, error);
      }
      const known = published === undefined ? null : { what: 'the version', at: published, as: 'published' };
      findings.push(...excludeWindowProblems(entry.package, entry, { kind: 'security-fix', known, minutes }, input.now).map((message): Finding => ({ level: 'error', rule, message })));
      if (unread !== undefined) {
        findings.push(unread);
      } else if (published === undefined) {
        findings.push({ level: 'error', rule, message: `${entry.package}: registry.npmjs.org gives no publish time for it` });
      }
      findings.push(...(await excludeAdvisoryFindings(entry, base, registry)));
    }
    // Once expired the version is three days old, so the exclude changes no resolution (Dependabot's pull requests touch only the lockfile).
    const expired = expiredExclude(entry.package, entry.expires, input.now, { event: input.event, edited, list: 'both lists' });
    if (expired !== null) {
      findings.push({ ...expired, rule });
    }
  }
  return findings.length > 0 ? findings : [{ level: 'ok', rule, message: `${String(listed.length)} exclude(s), each one exact version, equal in both lists and in date` }];
}

/** The lockfile's own description of an entry's source: `resolution`, as `pnpm install --frozen-lockfile` fetches it. */
function resolutionOf(entry: unknown): unknown {
  return entry !== null && typeof entry === 'object' && 'resolution' in entry ? entry.resolution : null;
}

/** A sha512 Subresource Integrity string, the only form the registry gives for a current package. */
const SHA512_SRI = /^sha512-[A-Za-z0-9+/]+={0,2}$/;

/** Whether a tarball URL is on registry.npmjs.org over https, with no credentials, port, query or fragment. */
function npmjsTarball(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false;
  }
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.host === 'registry.npmjs.org' && url.username === '' && url.password === '' && url.search === '' && url.hash === '' && value.startsWith(NPMJS);
  } catch {
    return false;
  }
}

/**
 * S1: every lockfile entry resolves from the registry by its sha512 integrity alone, `{integrity}`, or with a
 * tarball on registry.npmjs.org. A frozen install fetches whatever `tarball` names and checks only the lockfile's own
 * integrity, so a git, directory or other host's resolution under a registry-looking key would install bytes from
 * anywhere. Offline, over every entry, not only those a change adds.
 */
export function lockfileResolutionRule(lockfile: Lockfile | null): Finding[] {
  const rule = 'lockfile resolutions';
  if (lockfile === null) {
    return [{ level: 'error', rule, message: `${FILES.lockfile} is missing` }];
  }
  const findings: Finding[] = [];
  const entries = Object.entries(lockfile.packages ?? {});
  for (const [key, entry] of entries) {
    const resolution = resolutionOf(entry);
    const fields = resolution !== null && typeof resolution === 'object' ? (resolution as Record<string, unknown>) : null;
    const keys = fields === null ? [] : Object.keys(fields).sort();
    const shaped = fields !== null && typeof fields.integrity === 'string' && SHA512_SRI.test(fields.integrity) && (keys.join() === 'integrity' || (keys.join() === 'integrity,tarball' && npmjsTarball(fields.tarball)));
    if (!shaped) {
      findings.push({
        level: 'error',
        rule,
        message: `${key}: resolves ${JSON.stringify(resolution)}; every entry resolves from ${NPMJS.slice(0, -1)} by its sha512 integrity alone (a tarball only under ${NPMJS}), so a git, directory or other host's tarball is refused`,
      });
    }
  }
  return findings.length > 0 ? findings : [{ level: 'ok', rule, message: `all ${String(entries.length)} entries resolve from ${NPMJS} by sha512 integrity` }];
}

/** The versions the head's lockfile adds against the base, and each one's registry document (or why it was not read). */
interface Added {
  readonly keys: readonly string[];
  readonly documents: ReadonlyMap<string, Packument | Error>;
}

async function readAdded(head: Config, base: Config, registry: Registry): Promise<Added> {
  const before = base.lockfile === null ? new Set<string>() : lockedPackages(base.lockfile);
  const keys = head.lockfile === null ? [] : [...lockedPackages(head.lockfile)].filter((key) => !before.has(key)).sort();
  const names = [...new Set(keys.filter((key) => SEMVER.test(splitSpec(key).version)).map((key) => splitSpec(key).name))];
  const documents = new Map<string, Packument | Error>();
  await mapLimit(names, 8, async (name) => {
    documents.set(
      name,
      await registry.packument(name).catch((error: unknown) => {
        if (error instanceof NetworkReadError) {
          return error;
        }
        throw error;
      }),
    );
  });
  return { keys, documents };
}

/** Each added registry version with its document; a version that is not one, or whose document was not read, is reported once by the release-age rule. */
function* addedDocuments(added: Added): Generator<{ readonly key: string; readonly name: string; readonly version: string; readonly document: Packument }> {
  for (const key of added.keys) {
    const { name, version } = splitSpec(key);
    const document = added.documents.get(name);
    if (SEMVER.test(version) && document !== undefined && !(document instanceof Error)) {
      yield { key, name, version, document };
    }
  }
}

function lockfileRule(head: Config, added: Added, live: ReadonlySet<string>, minutes: number, now: Date): Finding[] {
  const rule = 'lockfile release age';
  if (head.lockfile === null) {
    return [{ level: 'error', rule, message: `${FILES.lockfile} is missing` }];
  }
  const findings: Finding[] = [];
  let young = 0;
  for (const key of added.keys) {
    const { name, version } = splitSpec(key);
    if (!SEMVER.test(version)) {
      findings.push({ level: 'error', rule, message: `${key}: not a registry version, so its release age cannot be read; take it from the registry` });
      continue;
    }
    const document = added.documents.get(name);
    if (document === undefined || document instanceof Error) {
      findings.push(failClosed(rule, document ?? new NetworkReadError(`registry.npmjs.org: ${name} was not read`)));
      continue;
    }
    const published = document.time[version];
    if (published === undefined) {
      findings.push({ level: 'error', rule, message: `${key}: registry.npmjs.org gives no publish time for it` });
      continue;
    }
    const matureAt = Date.parse(published) + minutes * MINUTE_MS;
    if (matureAt > now.getTime()) {
      young += 1;
      if (!live.has(key)) {
        findings.push({
          level: 'error',
          rule,
          message: `${key} was published ${published}, under ${ageWords(minutes)} ago, and the lockfile adds it (a frozen install never checks the release age, and Dependabot's security updates resolve without it); it is old enough from ${new Date(matureAt).toISOString()}: ${REMEDY.replace('add it', `add "${key}"`)}`,
        });
      }
    }
  }
  return findings.length > 0
    ? findings
    : [{ level: 'ok', rule, message: added.keys.length === 0 ? 'the lockfile adds no version against the base' : `the lockfile adds ${String(added.keys.length)} version(s) against the base, each at least ${ageWords(minutes)} old${young > 0 ? ` or under a live dated exclude (${String(young)})` : ''}` }];
}

/** S1: each added version's lockfile integrity is the registry's `dist.integrity` for it, read from the document already fetched. */
function lockfileIntegrityRule(head: Config, added: Added): Finding[] {
  const rule = 'lockfile integrity';
  const findings: Finding[] = [];
  let checked = 0;
  for (const { key, version, document } of addedDocuments(added)) {
    const resolution = resolutionOf(head.lockfile?.packages?.[key]);
    const locked = resolution !== null && typeof resolution === 'object' ? (resolution as Record<string, unknown>).integrity : undefined;
    const registered = document.facts[version]?.integrity ?? null;
    checked += 1;
    if (registered === null) {
      findings.push({ level: 'error', rule, message: `${key}: registry.npmjs.org gives no dist.integrity for it, so the lockfile's cannot be confirmed` });
    } else if (locked !== registered) {
      findings.push({ level: 'error', rule, message: `${key}: the lockfile's integrity ${String(locked)} is not registry.npmjs.org's dist.integrity ${registered} for it; resolve it again from the registry` });
    }
  }
  return findings.length > 0 ? findings : [{ level: 'ok', rule, message: checked === 0 ? 'no added version to compare' : `${String(checked)} added version(s), each with the registry's dist.integrity` }];
}

const TRUST_RANK: Readonly<Record<TrustEvidence, number>> = { trustedPublisher: 2, provenance: 1 };
const TRUST_WORDS: Readonly<Record<TrustEvidence | 'none', string>> = { trustedPublisher: 'a trusted publisher', provenance: 'a provenance attestation', none: 'no trust evidence' };

/**
 * S2: pnpm's `trustPolicy: no-downgrade`, held where a version lands. pnpm applies it only when it resolves (never in a
 * frozen install, and pnpm 10 has no trustLockfile), so a downgraded version could arrive by a hand-edited hunk, a
 * local `--config.trust-policy=off` or a resolver that does not apply it. Over every version the lockfile adds, from the
 * documents already fetched, exactly as pnpm 10.34.8's failIfTrustDowngraded reads them: the strongest evidence of any
 * version published before this one (prereleases left out unless this is one), a trusted publisher over provenance over
 * none, fails when this version's is weaker. An exact trustPolicyExclude entry passes its version.
 */
function lockfileTrustRule(head: Config, added: Added): Finding[] {
  const rule = 'lockfile trust';
  const excluded = new Set(head.workspace.trustPolicyExclude ?? []);
  const findings: Finding[] = [];
  let checked = 0;
  for (const { key, version, document } of addedDocuments(added)) {
    if (excluded.has(key)) {
      continue;
    }
    checked += 1;
    const published = document.time[version];
    if (published === undefined) {
      continue; // the release-age rule reports a version with no publish time
    }
    const at = Date.parse(published);
    const prerelease = SEMVER.exec(version)?.[4] !== undefined;
    let strongest: TrustEvidence | null = null;
    for (const other of document.versions) {
      const time = document.time[other];
      const evidence = document.facts[other]?.evidence ?? null;
      if (time === undefined || evidence === null || !(Date.parse(time) < at) || (!prerelease && SEMVER.exec(other)?.[4] !== undefined)) {
        continue;
      }
      if (strongest === null || TRUST_RANK[evidence] > TRUST_RANK[strongest]) {
        strongest = evidence;
      }
    }
    const current = document.facts[version]?.evidence ?? null;
    if (strongest !== null && (current === null || TRUST_RANK[strongest] > TRUST_RANK[current])) {
      findings.push({
        level: 'error',
        rule,
        message: `${key} has ${TRUST_WORDS[current ?? 'none']}, but a version published before it had ${TRUST_WORDS[strongest]}: a trust downgrade, the sign a maintainer's account may have published it outside the project's pipeline. pnpm's trustPolicy no-downgrade holds only where pnpm resolves, never in a frozen install, so it is held here where the version lands; a recent one is a security question for the founder, an old fixed one an exact trustPolicyExclude with its entry (docs/runbooks/dependency-upgrades.md, "The trust policy")`,
      });
    }
  }
  return findings.length > 0 ? findings : [{ level: 'ok', rule, message: checked === 0 ? 'no added version to compare' : `${String(checked)} added version(s), none with weaker trust evidence than a version published before it` }];
}

function trustRule(head: Config): Finding[] {
  const rule = 'trust excludes';
  const listed = head.workspace.trustPolicyExclude ?? [];
  const findings: Finding[] = [];
  for (const item of listed) {
    if (!EXACT_SPEC.test(item)) {
      findings.push({ level: 'error', rule, message: `${FILES.workspace}: trustPolicyExclude entry "${item}" is not one exact version (name@x.y.z)` });
    }
  }
  findings.push(...sameMembers(rule, listed, `${FILES.workspace}'s trustPolicyExclude`, head.trustExceptions.map((entry) => entry.package), FILES.trustExceptions));
  const locked = head.lockfile === null ? new Set<string>() : lockedPackages(head.lockfile);
  for (const entry of head.trustExceptions) {
    if (!locked.has(entry.package)) {
      findings.push({ level: 'error', rule, message: `${entry.package} is no longer resolved in ${FILES.lockfile}; remove it from trustPolicyExclude and ${FILES.trustExceptions}` });
    }
  }
  return findings.length > 0 ? findings : [{ level: 'ok', rule, message: `${String(listed.length)} trust exclude(s) (${listed.join(', ') || 'none'}), equal in both lists and each still resolved` }];
}

/** Whether an override still changes something the lockfile resolves. */
function overrideApplies(lockfile: Lockfile, selector: string, version: string): boolean {
  const { parent, target } = parseSelector(selector);
  const exact = SEMVER.test(version);
  for (const [key, snapshot] of Object.entries(lockfile.snapshots ?? {})) {
    const spec = snapshotSpec(key);
    if (parent === null) {
      if (spec.name === target.name && (!exact || spec.version === version)) {
        return true;
      }
      continue;
    }
    if (spec.name !== parent.name || !rangeHolds(parent.range, spec.version)) {
      continue;
    }
    const resolved = { ...snapshot?.dependencies, ...snapshot?.optionalDependencies }[target.name];
    if (version === '-' || (resolved !== undefined && (!exact || snapshotSpec(`${target.name}@${resolved}`).version === version))) {
      return true;
    }
  }
  return false;
}

function overridesRule(head: Config): Finding[] {
  const rule = 'overrides';
  // pnpm 10.34.8 applies package.json's resolutions (Yarn's field) and pnpm.overrides, and the workspace's overrides.
  const declared: Record<string, string> = { ...head.packageJson.resolutions, ...head.packageJson.pnpm?.overrides, ...head.workspace.overrides };
  const pairs = (map: Readonly<Record<string, string>>) => Object.entries(map).map(([selector, version]) => `${selector}: ${version}`);
  const entries = head.overrides.map((entry) => `${entry.selector}: ${entry.version}`);
  const findings = sameMembers(rule, pairs(declared), `the pnpm overrides (${FILES.workspace}, ${FILES.packageJson})`, entries, FILES.overrides);
  // S3: the lockfile's own map is what pnpm applied, from any source; a frozen install refuses one that differs.
  if (head.lockfile !== null) {
    findings.push(...sameMembers(rule, pairs(head.lockfile.overrides ?? {}), `${FILES.lockfile}'s overrides (what pnpm applied)`, entries, FILES.overrides));
  }
  for (const entry of head.overrides) {
    if (declared[entry.selector] === entry.version && head.lockfile !== null && !overrideApplies(head.lockfile, entry.selector, entry.version)) {
      findings.push({ level: 'error', rule, message: `the override ${entry.selector}: ${entry.version} no longer applies to anything ${FILES.lockfile} resolves (its target left); remove it and its entry (removal trigger: ${entry.removeWhen})` });
    }
  }
  return findings.length > 0 ? findings : [{ level: 'ok', rule, message: `${String(head.overrides.length)} override(s), each with its entry and still applied` }];
}

/**
 * The rules that read only the tree, with no base and no registry: the gates, the settings, the Dockerfiles' pnpm
 * install, every image's form (images.ts, E5), every lockfile entry's resolution, the trust excludes and the overrides.
 * The unit tests run them on the repository's real tree, so a list out of step with pnpm's settings, or an image not
 * pinned by tag and digest, fails offline as well as in static's networked run (ci-infra N3).
 */
export function checkOffline(tree: Tree): Finding[] {
  const head = readConfig(tree);
  if (head.problems.length > 0) {
    return head.problems.map((message) => ({ level: 'error', rule: 'files', message }));
  }
  const dockerfiles = dockerfileRule(tree.dockerfiles ?? {}, pnpmVersion(head.packageJson.packageManager));
  return [...gatesRule(head), ...settingsRule(head), ...dockerfiles, ...imageFormRule(tree, head.imageAgeExceptions), ...lockfileResolutionRule(head.lockfile), ...trustRule(head), ...overridesRule(head)];
}

/** Every rule, in order. Never throws for a network failure: each fails closed as an error finding. */
export async function checkToolchain(input: CheckInput, registry: Registry): Promise<Finding[]> {
  const head = readConfig(input.head);
  const base = readConfig(input.base);
  if (head.problems.length > 0) {
    return head.problems.map((message) => ({ level: 'error', rule: 'files', message }));
  }
  const findings: Finding[] = base.problems.map((message) => ({ level: 'warning', rule: 'files', message: `the base's ${message}; its lists are read as empty` }));
  findings.push(...gatesRule(head));
  findings.push(...settingsRule(head));
  const minutes = releaseAgeMinutes(head.workspace);
  const live = liveExcludes(head, input.now);
  const version = pnpmVersion(head.packageJson.packageManager);
  if (version === null) {
    findings.push({ level: 'error', rule: 'pnpm', message: `${FILES.packageJson}: packageManager is ${JSON.stringify(head.packageJson.packageManager ?? null)}, not pnpm@x.y.z` });
  } else {
    const [pnpm, advisories] = await Promise.all([
      registry.packument('pnpm').catch((error: unknown) => (error instanceof Error ? error : new Error(String(error)))),
      registry.advisories({ pnpm: [version] }).catch((error: unknown) => (error instanceof Error ? error : new Error(String(error)))),
    ]);
    findings.push(...pnpmRules(head.packageJson.packageManager ?? '', version, pnpm, advisories, live, minutes, input.now));
  }
  findings.push(...dockerfileRule(input.head.dockerfiles ?? {}, version));
  findings.push(...(await imageRule(input, { head: head.imageAgeExceptions, base: base.imageAgeExceptions }, minutes, registry)));
  findings.push(...auditRule(head, input.now));
  findings.push(...(await releaseAgeExcludeRule(head, base, input, minutes, registry)));
  findings.push(...lockfileResolutionRule(head.lockfile));
  const added = await readAdded(head, base, registry);
  findings.push(...lockfileRule(head, added, live, minutes, input.now));
  findings.push(...lockfileIntegrityRule(head, added));
  findings.push(...lockfileTrustRule(head, added));
  findings.push(...trustRule(head));
  findings.push(...overridesRule(head));
  return findings;
}

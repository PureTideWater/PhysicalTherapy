import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import { MAX_OPENED_PER_RUN } from '../content-calendar/render';
import { repositoryRoot } from '../content-files';
import { REQUIRED_CHECKS } from '../required-checks';
import { RELEASE_RUNNER } from '../screening-capacity/launch-check';

/**
 * The workflows: ci.yml's parallel jobs behind its one gate (docs/adr/0066, Part 1), with the image and licence gates
 * among them (docs/adr/0010), the release and capacity workflows (docs/adr/0062), the approval of record
 * (docs/adr/0063), and the content calendar and the weekly real-size test (docs/adr/0071). No Docker daemon or GitHub runner exists here, so these tests read the workflow files and check
 * that each gate is wired where the plan needs it, in the right order, and run under bash, on fixture input, the
 * scripts whose logic decides what a run checks.
 */

interface Step {
  readonly name?: string;
  readonly id?: string;
  readonly if?: string;
  readonly uses?: string;
  readonly run?: string;
  readonly with?: Record<string, unknown>;
  readonly env?: Record<string, string>;
  readonly shell?: string;
  readonly 'continue-on-error'?: unknown;
}

interface Job {
  readonly name?: string;
  readonly 'runs-on'?: unknown;
  readonly uses?: string;
  readonly if?: string;
  readonly needs?: unknown;
  readonly steps: readonly Step[];
  readonly strategy?: { readonly 'fail-fast'?: boolean; readonly matrix?: Record<string, unknown> };
  readonly services?: Record<string, unknown>;
  readonly env?: Record<string, string>;
  readonly concurrency?: unknown;
  readonly 'timeout-minutes'?: number;
  readonly defaults?: { readonly run?: { readonly shell?: string } };
  readonly 'continue-on-error'?: unknown;
}

interface Workflow {
  readonly name?: string;
  readonly on: unknown;
  readonly concurrency?: unknown;
  readonly permissions?: unknown;
  readonly defaults?: { readonly run?: { readonly shell?: string } };
  readonly jobs: Record<string, Job>;
}

const WORKFLOWS = path.join(repositoryRoot, '.github/workflows');

function workflow(name: string): Workflow {
  return parse(readFileSync(path.join(WORKFLOWS, name), 'utf8')) as Workflow;
}

const workflowFiles = (): string[] =>
  readdirSync(WORKFLOWS)
    .filter((file) => /\.ya?ml$/.test(file))
    .sort();

/**
 * The actions the release, capacity and ci workflows run, each pinned to a full commit SHA with its version in a
 * comment (the review of 2026-10-22): a moved tag cannot run code in the push job, which holds packages: write, nor
 * write the capacity report the launch check reads, nor change what a required check runs. trivy-action was pinned
 * this way already. The content-calendar and release-capacity workflows take the same lines (docs/adr/0071).
 */
const PINNED = {
  // v4.2.2, read with git ls-remote (the verification of PR 6b-3's capacity changes): the report's provenance.
  attestBuildProvenance: 'actions/attest-build-provenance@4d101475d8b20a2381f78447822ac1eab6504dd8',
  checkout: 'actions/checkout@11d5960a326750d5838078e36cf38b85af677262',
  cacheRestore: 'actions/cache/restore@0057852bfaa89a56745cba8c7296529d2fc39830',
  cacheSave: 'actions/cache/save@0057852bfaa89a56745cba8c7296529d2fc39830',
  downloadArtifact: 'actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093',
  uploadArtifact: 'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02',
  setupNode: 'actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020',
  // v5.6.0, read with git ls-remote (docs/adr/0066, Part 1): ci.yml's static job, for the 835 oracle.
  setupPython: 'actions/setup-python@a26af69be951a213d495a4c3e4e4022e16d87065',
  buildPush: 'docker/build-push-action@10e90e3645eae34f1e60eeb005ba3a3d33f178e8',
  login: 'docker/login-action@c94ce9fb468520275223c153574b00df6fe4bcc9',
  setupBuildx: 'docker/setup-buildx-action@8d2750c68a42422c14e847fe6c8ac0403b4cbd6f',
  pnpm: 'pnpm/action-setup@b906affcce14559ad1aafd4ab0e942779e9f58b1',
} as const;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isList = (value: unknown): value is readonly unknown[] => Array.isArray(value);

/** A runs-on value, or one label of it, that is wholly one matrix value: its key, and any property of that value. */
const MATRIX_REFERENCE = /^\$\{\{\s*matrix\.([\w-]+(?:\.[\w-]+)*)\s*\}\}$/;

const listKeys = (matrix: Record<string, unknown>) => Object.keys(matrix).filter((name) => name !== 'include' && name !== 'exclude');

/**
 * The jobs a matrix's lists make, less each one an exclude entry matches in every key it names (GitHub applies exclude
 * before include), or undefined where a list or the exclude list is an expression.
 */
function listedJobs(matrix: Record<string, unknown>): Record<string, unknown>[] | undefined {
  const exclude = matrix.exclude ?? [];
  const lists = listKeys(matrix).map((name) => [name, matrix[name]] as const);
  if (!isList(exclude) || lists.some(([, values]) => !isList(values))) return undefined;
  const jobs = lists.reduce<Record<string, unknown>[]>((made, [name, values]) => made.flatMap((job) => (values as unknown[]).map((value) => ({ ...job, [name]: value }))), [{}]);
  const matches = (job: Record<string, unknown>, entry: unknown) => isRecord(entry) && Object.entries(entry).every(([name, value]) => isDeepStrictEqual(job[name], value));
  return jobs.filter((job) => !exclude.some((entry) => matches(job, entry)));
}

/**
 * Every value a job's matrix gives one of its keys, or undefined where this test cannot tell: the matrix, a list, the
 * include list or the exclude list is an expression, or some job the matrix makes has no such key. An include entry
 * joins each listed job whose values it leaves as they are, and where it joins none GitHub makes it a job of its own;
 * so an entry without the key is safe only when it joins a job.
 */
function matrixValues(matrix: unknown, key: string): unknown[] | undefined {
  const include = isRecord(matrix) ? (matrix.include ?? []) : undefined;
  if (!isRecord(matrix) || !isList(include)) return undefined;
  const listed = matrix[key];
  const named = (entry: unknown) => (isRecord(entry) ? entry[key] : entry);
  if (isList(listed)) {
    const without = include.filter((entry): entry is Record<string, unknown> => isRecord(entry) && !(key in entry));
    const jobs = without.length === 0 ? [] : listedJobs(matrix);
    const joins = (entry: Record<string, unknown>, job: Record<string, unknown>) => Object.entries(entry).every(([name, value]) => !Object.hasOwn(job, name) || isDeepStrictEqual(job[name], value));
    if (jobs === undefined || !without.every((entry) => jobs.some((job) => joins(entry, job)))) return undefined;
    return [...listed, ...include.filter((entry) => !isRecord(entry) || key in entry).map(named)];
  }
  // Without a list of the key, only a matrix of include entries alone gives it to every job, each entry its own job.
  return listed === undefined && listKeys(matrix).length === 0 ? include.map(named) : undefined;
}

/** GitHub-hosted labels other than -latest ones that name an image without its version. */
const UNVERSIONED_HOSTED = /^ubuntu-slim$/i;

/**
 * Why a runs-on value does not name only pinned runner images (audit item #19). GitHub moves a -latest label to a new
 * image on its own schedule (ubuntu-latest to Ubuntu 26.04 from 2026-10-19, which Playwright 1.56.1 predates), and can
 * move any hosted label without a version, so a job on one changes under a commit that changed nothing. runs-on is a
 * label, a list of labels or a group with its labels; an expression is followed only when it is one of the job's own
 * matrix values, and refused otherwise.
 */
function runnerProblems(runsOn: unknown, matrix?: unknown): string[] {
  const shown = JSON.stringify(runsOn);
  if (runsOn === undefined || runsOn === null || (isList(runsOn) && runsOn.length === 0)) return ['names no runner label'];
  if (isList(runsOn)) return runsOn.flatMap((label) => runnerProblems(label, matrix));
  if (isRecord(runsOn)) return runnerProblems(runsOn.labels, matrix);
  if (typeof runsOn !== 'string') return [`${shown} is not a runner label`];
  const reference = matrix === undefined ? undefined : MATRIX_REFERENCE.exec(runsOn)?.[1]?.split('.');
  if (reference !== undefined) {
    const [key = '', ...properties] = reference;
    const values = matrixValues(matrix, key);
    if (values === undefined || values.length === 0) return [`${shown} is a matrix value this test cannot resolve`];
    const resolved = values.map((value) => properties.reduce<unknown>((within, property) => (isRecord(within) ? within[property] : undefined), value));
    return resolved.flatMap((value) => runnerProblems(value).map((problem) => `${shown}: ${problem}`));
  }
  if (runsOn.includes('${{')) return [`${shown} is an expression this test cannot resolve to a pinned label`];
  if (/-latest(-|$)/i.test(runsOn)) return [`${shown} is a -latest label, whose image GitHub moves`];
  return UNVERSIONED_HOSTED.test(runsOn) ? [`${shown} names a hosted image without a version, which GitHub can move`] : [];
}

/** A job's runner problems. A job that calls one of the directory's own reusable workflows runs on that file's jobs. */
function jobRunnerProblems(job: Job, workflows: readonly string[]): string[] {
  const called = /^\.\/\.github\/workflows\/([^/]+)$/.exec(job.uses ?? '')?.[1];
  return called !== undefined && workflows.includes(called) ? [] : runnerProblems(job['runs-on'], job.strategy?.matrix);
}

function stepIndex(steps: readonly Step[], predicate: (step: Step) => boolean): number {
  const index = steps.findIndex(predicate);
  expect(index, 'step not found').toBeGreaterThanOrEqual(0);
  return index;
}

const isScan = (step: Step) => step.uses?.startsWith('aquasecurity/trivy-action@') === true && step.with?.['exit-code'] === '1';

/** The first step of a job whose action is this one, whatever its ref: steps are matched by action, never by version. */
const usesAction = (step: Step, action: string): boolean => step.uses?.startsWith(`${action}@`) === true;

/** A ci.yml job, which must exist. */
function ciJob(id: string): Job {
  const job = workflow('ci.yml').jobs[id];
  expect(job, `ci.yml has no job ${id}`).toBeDefined();
  return job as Job;
}

// Made before the tests run, not when the file is collected, which runs no hook to remove it (tools/test/collection.test.ts).
let scratch = '';
beforeAll(() => {
  scratch = mkdtempSync(path.join(os.tmpdir(), 'tp-workflows-'));
});
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

/** Runs a step's script as GitHub runs a `shell: bash` step (bash --noprofile --norc -eo pipefail), with this environment alone. */
function runScript(script: string, env: Record<string, string>, cwd: string): { status: number | null; output: string } {
  const result = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', script], { cwd, encoding: 'utf8', env: { PATH: process.env.PATH ?? '/usr/bin:/bin', ...env } });
  expect(result.error).toBeUndefined();
  return { status: result.status, output: result.stdout + result.stderr };
}

/**
 * Why a workflow's or a job's concurrency group could cancel another workflow's runs: groups are shared by every
 * workflow of the repository, so each must start with its own workflow's name, as `${{ github.workflow }}-` or the
 * literal name (github/docs, "Only cancel in-progress jobs or runs for the current workflow").
 */
function concurrencyProblems(file: string, parsed: Workflow): string[] {
  const name = parsed.name ?? file;
  const own = (group: string) => group === name || group.startsWith(`${name}-`) || group.startsWith('${{ github.workflow }}-');
  const groupOf = (concurrency: unknown) => (typeof concurrency === 'string' ? concurrency : isRecord(concurrency) ? concurrency.group : undefined);
  const entries: [string, unknown][] = [['the workflow', parsed.concurrency], ...Object.entries(parsed.jobs).map(([id, job]): [string, unknown] => [`job ${id}`, job.concurrency])];
  return entries.flatMap(([where, concurrency]) => {
    if (concurrency === undefined) return [];
    const group = groupOf(concurrency);
    if (typeof group !== 'string') return [`${file} ${where}: a concurrency with no group`];
    return own(group) ? [] : [`${file} ${where}: the group ${group} starts with neither \${{ github.workflow }}- nor ${name}-`];
  });
}

/** playwright-core's list of the browser builds its version pins, under pnpm's store: the browsers' cache key. */
const BROWSERS_JSON = 'node_modules/.pnpm/playwright-core@*/node_modules/playwright-core/browsers.json';

/** Playwright's Chromium with its system libraries, which the printing tests need (docs/adr/0058). */
const CHROMIUM_INSTALL = /\bplaywright install --with-deps chromium\b/;

/**
 * Whether a script runs vitest's unit or db project: `pnpm test` or `pnpm test:db` (never test:golden, test:oracle or
 * test:e2e), or vitest itself without `--project golden`, since a vitest run with no project runs them all.
 */
function runsVitestUnitOrDb(run: string): boolean {
  const lines = run.split('\n');
  return lines.some((line) => /\bpnpm\s+(?:run\s+)?test(?::db)?(?=$|[\s;&|)])/.test(line) || (/\bvitest\b/.test(line) && !/\bvitest\s+list\b/.test(line) && !/--project[=\s]+golden\b/.test(line)));
}

/**
 * Every step that runs vitest's unit or db project with no Chromium installed by an earlier step of its job: the
 * printing tests would fail there (tools/test/ci-chromium.ts), and before that guard they skipped in silence.
 */
function chromiumProblems(file: string, parsed: Workflow): string[] {
  return Object.entries(parsed.jobs).flatMap(([id, job]) => {
    const steps = job.steps ?? [];
    const install = steps.findIndex((step) => CHROMIUM_INSTALL.test(step.run ?? ''));
    return steps.flatMap((step, index) =>
      step.run !== undefined && runsVitestUnitOrDb(step.run) && (install === -1 || install > index) ? [`${file} ${id}: "${step.run.split('\n')[0] ?? ''}" runs vitest's unit or db project with no Chromium installed before it`] : [],
    );
  });
}

/** Script idioms that swallow a failing command: `|| true`, `|| :`, `|| exit 0`, and errexit or pipefail turned off. */
const SWALLOWS = [/\|\|\s*(?:true\b|:(?=\s|;|\)|$)|exit\s+0\b)/m, /\bset\s+\+[a-z]*e/, /\bset\s+\+o\s+(?:errexit|pipefail)\b/];

/**
 * Why a workflow's jobs could pass a failure. In every job: `continue-on-error`, on the job or a step, under any value
 * (a failed step then leaves its job's conclusion success, so `needs.<job>.result` reads success and a gate passes it;
 * on a job it keeps a failed job from failing its run). In the jobs `scripts` names: a step or job shell other than the
 * workflow's bash, which runs with -e and pipefail, and a script that swallows a failing command.
 */
function maskingProblems(file: string, parsed: Workflow, scripts: (id: string) => boolean): string[] {
  return Object.entries(parsed.jobs).flatMap(([id, job]) => {
    const steps = job.steps ?? [];
    const where = (step: Step, index: number) => `${file} ${id} step ${String(index + 1)} (${step.name ?? step.run?.split('\n')[0] ?? step.uses ?? ''})`;
    const problems = [
      ...('continue-on-error' in job ? [`${file} ${id}: continue-on-error on the job`] : []),
      ...steps.flatMap((step, index) => ('continue-on-error' in step ? [`${where(step, index)}: continue-on-error`] : [])),
    ];
    if (!scripts(id)) return problems;
    return [
      ...problems,
      ...(job.defaults?.run?.shell === undefined ? [] : [`${file} ${id}: the job's shell is ${job.defaults.run.shell}, not the workflow's bash`]),
      ...steps.flatMap((step, index) => [
        ...(step.shell === undefined ? [] : [`${where(step, index)}: runs under ${step.shell}, not the workflow's bash`]),
        ...(step.run !== undefined && SWALLOWS.some((idiom) => idiom.test(step.run ?? '')) ? [`${where(step, index)}: swallows a failing command`] : []),
      ]),
    ];
  });
}

/** A job's reported name as a pattern: its name, or its id, with each expression in it standing for any text. */
function reportedName(id: string, job: Job): RegExp {
  const parts = (job.name ?? id).split(/\$\{\{.*?\}\}/s);
  return new RegExp(`^${parts.map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`, 's');
}

/**
 * Why a required check could be reported by a job other than its own: a ruleset matches a required check by its name
 * and the app that reports it (GitHub Actions), never by workflow, so a second job of any workflow that is named, or
 * whose name's expressions could make it named, as one of the checks would stand for it.
 */
function requiredNameProblems(workflows: Readonly<Record<string, Workflow>>, checks: typeof REQUIRED_CHECKS = REQUIRED_CHECKS): string[] {
  return checks.flatMap((check) => {
    const reporters = Object.entries(workflows).flatMap(([file, parsed]) =>
      Object.entries(parsed.jobs)
        .filter(([id, job]) => reportedName(id, job).test(check.name))
        .map(([id]) => `${file} ${id}`),
    );
    const own = `${check.workflow} ${check.job}`;
    return [
      ...(reporters.includes(own) ? [] : [`${check.name}: ${own} does not report it`]),
      ...reporters.filter((reporter) => reporter !== own).map((reporter) => `${check.name}: ${reporter} could report it too`),
    ];
  });
}

/** A step's script, found by its name or by its run's text. */
function stepNamed(steps: readonly Step[], name: string): Step {
  return steps[stepIndex(steps, (step) => step.name === name)] as Step;
}

/** A matrix of shards: the public repository's widths and the private one's, read from its one expression. */
function shardWidths(matrix: Record<string, unknown> | undefined): { public: unknown; private: unknown } | undefined {
  const match = /^\$\{\{ fromJSON\(github\.event\.repository\.private && '(\[[\d,]+\])' \|\| '(\[[\d,]+\])'\) \}\}$/.exec(String(matrix?.shard));
  return match === null ? undefined : { private: JSON.parse(match[1] ?? '[]') as unknown, public: JSON.parse(match[2] ?? '[]') as unknown };
}

/** A small git repository with three commits on main and origin/main at the first, for the range scripts. */
function rangeRepository(): { dir: string; first: string; second: string; head: string; env: Record<string, string> } {
  const dir = mkdtempSync(path.join(scratch, 'range-'));
  const env = { HOME: dir, GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'Synthetic', GIT_AUTHOR_EMAIL: 'synthetic@example.invalid', GIT_COMMITTER_NAME: 'Synthetic', GIT_COMMITTER_EMAIL: 'synthetic@example.invalid' };
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, env: { ...process.env, ...env }, encoding: 'utf8' }).trim();
  git('init', '-q', '-b', 'main');
  const shas = ['first', 'second', 'third'].map((name) => {
    writeFileSync(path.join(dir, `${name}.txt`), `${name}\n`);
    git('add', '.');
    git('commit', '-q', '-m', name);
    return git('rev-parse', 'HEAD');
  });
  git('update-ref', 'refs/remotes/origin/main', shas[0] ?? '');
  return { dir, first: shas[0] ?? '', second: shas[1] ?? '', head: shas[2] ?? '', env };
}

describe('workflows', () => {
  it('all parse', () => {
    for (const file of readdirSync(path.join(repositoryRoot, '.github/workflows'))) {
      expect(() => workflow(file), file).not.toThrow();
    }
  });

  it('run every job on a pinned runner image: none on a -latest or other unversioned hosted label, none without runs-on, none on an expression this test cannot resolve (audit item #19)', () => {
    const files = readdirSync(path.join(repositoryRoot, '.github/workflows')).filter((file) => /\.ya?ml$/.test(file));
    expect(files).toContain('ci.yml');
    const problems = files.flatMap((file) => Object.entries(workflow(file).jobs).flatMap(([name, job]) => jobRunnerProblems(job, files).map((problem) => `${file} ${name}: ${problem}`)));
    expect(problems).toEqual([]);
  });

  it('run every job on GitHub’s free ubuntu-24.04 runner, both capacity jobs included, and name no larger runner’s label (the founder’s third ruling of 2026-10-23, “Free: time advisory”)', () => {
    const files = readdirSync(path.join(repositoryRoot, '.github/workflows')).filter((file) => /\.ya?ml$/.test(file));
    const runners = Object.fromEntries(files.flatMap((file) => Object.entries(workflow(file).jobs).map(([name, job]) => [`${file} ${name}`, job['runs-on']])));
    expect(runners['release.yml capacity']).toBe('ubuntu-24.04');
    expect(runners['screening-capacity.yml capacity']).toBe('ubuntu-24.04');
    expect(Object.entries(runners).filter(([, runner]) => runner !== 'ubuntu-24.04')).toEqual([]);
    // GitHub's larger runners exist only for an organization on GitHub Team or Enterprise Cloud, and PureTideWater is a
    // personal account: actionlint's configuration, which named the 8-core runner's label, is gone with it.
    for (const config of ['.github/actionlint.yaml', '.github/actionlint.yml']) {
      expect(existsSync(path.join(repositoryRoot, config)), config).toBe(false);
    }
  });

  it('refuse a -latest or unversioned hosted runner as a label, in a list, in a group, as a matrix value or an include entry’s, and any runner they cannot resolve', () => {
    const problems = (job: string) => jobRunnerProblems(parse(job) as Job, ['build.yml']);
    expect(problems('runs-on: ubuntu-latest')).toEqual(['"ubuntu-latest" is a -latest label, whose image GitHub moves']);
    for (const pinned of [
      'runs-on: ubuntu-24.04',
      'runs-on: [self-hosted, linux, x64]',
      'runs-on: { group: larger, labels: [ubuntu-24.04-arm] }',
      'runs-on: ${{ matrix.os }}\nstrategy: { matrix: { os: [ubuntu-24.04, windows-2025], include: [{ os: macos-15 }, { node: 24 }] } }',
      'runs-on: ${{ matrix.os }}\nstrategy: { matrix: { include: [{ os: ubuntu-24.04 }, { os: ubuntu-22.04 }] } }',
      'runs-on: ${{ matrix.os }}\nstrategy: { matrix: { os: [ubuntu-24.04], app: [web, worker], exclude: [{ app: web }], include: [{ app: worker, node: 24 }] } }',
      'runs-on: ${{ matrix.target.runner }}\nstrategy: { matrix: { target: [{ runner: ubuntu-24.04 }, { runner: [self-hosted, arm64] }] } }',
      'runs-on: [self-hosted, "${{ matrix.arch }}"]\nstrategy: { matrix: { arch: [x64, arm64] } }',
      'uses: ./.github/workflows/build.yml',
    ]) {
      expect(problems(pinned), pinned).toEqual([]);
    }
    for (const unpinned of [
      'runs-on: UBUNTU-LATEST',
      'runs-on: macos-latest-xlarge',
      'runs-on: [self-hosted, ubuntu-latest]',
      'runs-on: { group: larger, labels: windows-latest }',
      'runs-on: { group: larger }',
      'runs-on: []',
      'runs-on: 2404',
      'steps: []',
      'uses: ./.github/workflows/missing.yml',
      'uses: octo-org/ci/.github/workflows/build.yml@v1',
      'runs-on: ${{ matrix.os }}\nstrategy: { matrix: { os: [ubuntu-24.04, ubuntu-latest] } }',
      'runs-on: ${{ matrix.os }}\nstrategy: { matrix: { os: [ubuntu-24.04], include: [{ os: windows-latest }] } }',
      'runs-on: ${{ matrix.os }}\nstrategy: { matrix: { include: [{ os: ubuntu-24.04 }, { node: 24 }] } }',
      'runs-on: ${{ matrix.os }}\nstrategy: { matrix: { app: [web, worker], include: [{ app: web, os: ubuntu-24.04 }] } }',
      'runs-on: ${{ matrix.os }}\nstrategy: { matrix: { os: [ubuntu-24.04, "${{ inputs.os }}"] } }',
      'runs-on: ${{ matrix.os }}\nstrategy: { matrix: { os: "${{ fromJSON(inputs.oses) }}" } }',
      'runs-on: ${{ matrix.os }}\nstrategy: { matrix: "${{ fromJSON(needs.plan.outputs.matrix) }}" }',
      'runs-on: ${{ matrix.runner }}\nstrategy: { matrix: { os: [ubuntu-24.04] } }',
      'runs-on: ${{ matrix.os }}',
      'runs-on: ${{ matrix.target.runner }}\nstrategy: { matrix: { target: [{ runner: ubuntu-latest }] } }',
      'runs-on: [self-hosted, "${{ matrix.image }}"]\nstrategy: { matrix: { image: [ubuntu-latest] } }',
      'runs-on: ubuntu-${{ matrix.version }}\nstrategy: { matrix: { version: ["24.04"] } }',
      'runs-on: ${{ inputs.runner }}',
      'runs-on: ubuntu-slim',
      'runs-on: ${{ matrix.os }}\nstrategy: { matrix: { os: [ubuntu-24.04], app: [web], include: [{ app: mobile }] } }',
      'runs-on: ${{ matrix.os }}\nstrategy: { matrix: { os: [ubuntu-24.04], app: [web, worker], exclude: [{ app: worker }], include: [{ app: worker, node: 24 }] } }',
    ]) {
      expect(problems(unpinned), unpinned).not.toEqual([]);
    }
  });

  it('take Debian security updates into both runtime images and leave no package manager in them', () => {
    for (const app of ['web', 'worker']) {
      const dockerfile = readFileSync(path.join(repositoryRoot, 'apps', app, 'Dockerfile'), 'utf8');
      const runtime = dockerfile.slice(dockerfile.indexOf('AS runtime'));
      expect(runtime, app).toContain('apt-get upgrade -y');
      for (const removed of ['/usr/local/lib/node_modules/npm', '/usr/local/bin/npm', '/usr/local/bin/npx', '/usr/local/bin/corepack']) {
        expect(runtime, `${app}: ${removed}`).toContain(removed);
      }
      expect(runtime.indexOf('apt-get upgrade'), app).toBeLessThan(runtime.indexOf('/usr/local/bin/npm'));
    }
  });

  it('leave /etc/ssl traversable in both runtime images and prove Node starts as their user', () => {
    // BuildKit gives an ADD's --chmod to the directories it creates (moby/buildkit#5943): --chmod=644 on the RDS bundle
    // left /etc/ssl untraversable, and Node, which reads /etc/ssl/openssl.cnf as it starts, could not start as node.
    for (const app of ['web', 'worker']) {
      const dockerfile = readFileSync(path.join(repositoryRoot, 'apps', app, 'Dockerfile'), 'utf8');
      const runtime = dockerfile.slice(dockerfile.indexOf('AS runtime'));
      const instructions = runtime.split('\n').filter((line) => /^(ADD|COPY)\s/.test(line));
      expect(instructions.filter((line) => line.includes('--chmod')), app).toEqual([]);
      expect(runtime, app).toContain('RUN chmod 0755 /etc/ssl /etc/ssl/certs && chmod 0644 /etc/ssl/certs/rds-global-bundle.pem');
      const user = runtime.indexOf('\nUSER node\n');
      expect(user, app).toBeGreaterThan(0);
      expect(runtime.indexOf(`RUN ["node", "-e", "require('node:fs').readFileSync('/etc/ssl/certs/rds-global-bundle.pem')"]`), app).toBeGreaterThan(user);
    }
  });

  describe('release (decision 13; docs/adr/0062): build each image once, scan it, measure the screening on exactly the production web image and the worker image, and push exactly what was built', () => {
    const file = readFileSync(path.join(repositoryRoot, '.github/workflows/release.yml'), 'utf8');
    type ReleaseJob = Job & { needs?: unknown; if?: string; permissions?: unknown; 'timeout-minutes'?: number };
    const release = parse(file) as Workflow & { permissions: unknown; jobs: Record<string, ReleaseJob> };
    const job = (name: string) => release.jobs[name] as ReleaseJob;
    const runs = (name: string) => job(name).steps.map((step) => step.run ?? '').join('\n');

    it('runs on a release tag with a read-only token, four jobs, each with a timeout', () => {
      expect(release.on).toEqual({ push: { tags: ['v*'] } });
      expect(release.permissions).toEqual({ contents: 'read' });
      expect(Object.keys(release.jobs).sort()).toEqual(['build', 'capacity', 'push', 'report']);
      // The capacity job's 100 minutes hold S4's three runs (the founder's ruling of 2026-10-23), as the workflow's own.
      expect(Object.fromEntries(Object.entries(release.jobs).map(([name, entry]) => [name, entry['timeout-minutes']]))).toEqual({ build: 60, capacity: 100, push: 30, report: 10 });
    });

    it('builds the worker image and three web images, each with its own static host, and scans each and writes its SBOM before anything leaves the job', () => {
      const build = job('build');
      expect(build.strategy?.matrix?.image).toEqual(['web', 'web-staging', 'web-production', 'worker']);
      expect(build.permissions).toBeUndefined();
      const steps = build.steps;
      const built = stepIndex(steps, (step) => step.uses === PINNED.buildPush);
      expect(steps.filter((step) => step.uses?.startsWith('docker/build-push-action@') === true)).toHaveLength(1);
      expect(steps[built]?.with).toMatchObject({ push: false, load: true, file: '${{ steps.image.outputs.dockerfile }}', tags: '${{ steps.image.outputs.ref }}' });
      expect(String(steps[built]?.with?.['build-args']).trim()).toBe('STATIC_ASSET_ORIGIN=${{ steps.image.outputs.origin }}');
      // Each environment's CloudFront origin from its repository variable; the plain web image has none.
      const naming = steps.find((step) => (step as Step & { id?: string }).id === 'image') as Step & { env?: Record<string, string> };
      expect(naming.env).toMatchObject({ STAGING_ORIGIN: '${{ vars.STAGING_STATIC_ASSET_ORIGIN }}', PRODUCTION_ORIGIN: '${{ vars.PRODUCTION_STATIC_ASSET_ORIGIN }}' });
      expect(naming.run).toContain('web-production) echo "dockerfile=apps/web/Dockerfile" >> "$GITHUB_OUTPUT"; origin="$PRODUCTION_ORIGIN" ;;');
      expect(naming.run).toContain('worker) echo "dockerfile=apps/worker/Dockerfile" >> "$GITHUB_OUTPUT"; origin="" ;;');
      const scan = stepIndex(steps, isScan);
      const sbom = stepIndex(steps, (step) => step.with?.format === 'spdx-json');
      const saved = stepIndex(steps, (step) => step.run?.includes('docker save') === true);
      const kept = steps.findLastIndex((step) => step.uses === PINNED.uploadArtifact);
      expect(steps[scan]?.with).toMatchObject({ 'image-ref': '${{ steps.image.outputs.ref }}', severity: 'HIGH,CRITICAL', 'exit-code': '1' });
      expect([built < scan, scan < sbom, sbom < saved, saved < kept]).toEqual([true, true, true, true]);
      // The image ID beside the image, so the jobs that load it can prove it is the one scanned.
      expect(steps[saved]?.run).toContain(`docker image inspect -f '{{.Id}}' "$REF" > "$RUNNER_TEMP/image/$IMAGE.id"`);
      expect(String(steps[kept]?.with?.path).trim().split('\n')).toEqual(['${{ runner.temp }}/image/${{ matrix.image }}.tar.gz', '${{ runner.temp }}/image/${{ matrix.image }}.id']);
      expect(file).not.toMatch(/push: true/);
    });

    it('measures exactly the production web image and the worker image as built, with time binding (decision 13; the founder’s ruling of 2026-10-23, time advisory), on the capacity workflow\'s runner', () => {
      const capacity = job('capacity');
      expect(capacity.needs).toBe('build');
      expect(capacity.permissions).toBeUndefined();
      const workflowRunner = (parse(readFileSync(path.join(repositoryRoot, '.github/workflows/screening-capacity.yml'), 'utf8')) as Workflow).jobs.capacity?.['runs-on'];
      expect(capacity['runs-on']).toEqual(workflowRunner);
      expect(capacity['runs-on']).toBe('ubuntu-24.04');
      // The launch check accepts only the layout this runner gives (launch-check.ts, RELEASE_RUNNER): moving the release
      // to another runner fails here until the check moves with it.
      expect(capacity['runs-on']).toBe(RELEASE_RUNNER.label);
      const steps = capacity.steps;
      expect(steps[0]).toEqual({ uses: PINNED.checkout, with: { 'persist-credentials': false } });
      expect(steps.filter((step) => step.uses === PINNED.downloadArtifact).map((step) => step.with?.name)).toEqual(['image-web-production', 'image-worker']);
      expect(steps.some((step) => step.uses?.startsWith('docker/build-push-action@') === true)).toBe(false);
      expect(runs('capacity')).not.toMatch(/docker (?:buildx )?build/);
      const measure = stepIndex(steps, (step) => step.run?.includes('pnpm screening:capacity') === true);
      const loaded = stepIndex(steps, (step) => step.run?.includes('docker load') === true);
      expect(loaded).toBeLessThan(measure);
      expect(steps[measure]?.run).toContain('--web-image "$repository/web-production:$GITHUB_REF_NAME" --worker-image "$repository/worker:$GITHUB_REF_NAME"');
      expect(steps[measure]?.run).toContain('taskset -c "$cpus" pnpm screening:capacity "$@"');
      // The release's run is binding: time fails it, and only its pass opens production (decision 13). Never advisory.
      expect(steps[measure]?.run).toContain('--time-mode binding');
      expect(steps[measure]?.run).not.toContain('advisory');
      // Production's static host, the one the web-production image was built with, routed to the web container.
      expect((steps[measure] as Step & { env?: Record<string, string> }).env).toEqual({ PRODUCTION_ORIGIN: '${{ vars.PRODUCTION_STATIC_ASSET_ORIGIN }}' });
      expect(steps[measure]?.run).toContain('set -- "$@" --static-asset-origin "$PRODUCTION_ORIGIN"');
      const kept = steps[measure + 1] as Step & { if?: string };
      expect(kept.uses).toBe(PINNED.uploadArtifact);
      expect(kept.if).toBe('always()');
      expect(String(kept.with?.path)).toContain('screening-capacity.sha256');
    });

    it('pushes exactly the images that were scanned, checking each ID, with packages: write in that job alone and no build', () => {
      const push = job('push');
      // A failed measurement does not hold a security fix back: the push needs the build alone.
      expect(push.needs).toBe('build');
      expect(push.permissions).toEqual({ contents: 'read', packages: 'write' });
      expect(push.steps.some((step) => step.uses?.startsWith('docker/build-push-action@') === true || step.uses?.startsWith('actions/checkout') === true)).toBe(false);
      const script = runs('push');
      expect(script).not.toMatch(/docker (?:buildx )?build/);
      expect(script).toContain('for image in web web-staging web-production worker; do');
      expect(script).toContain('docker load --input "$RUNNER_TEMP/image/$image.tar.gz"');
      expect(script).toContain('if [ "$id" != "$(cat "$RUNNER_TEMP/image/$image.id")" ]; then');
      expect(script.indexOf('exit 1')).toBeLessThan(script.indexOf('docker push'));
      expect([...script.matchAll(/docker push "([^"]+)"/g)].map((match) => match[1])).toEqual(['$ref', '$repository/$image:sha-$GITHUB_SHA']);
      for (const [name, entry] of Object.entries(release.jobs)) {
        expect(JSON.stringify(entry.permissions ?? {}).includes('packages'), name).toBe(name === 'push');
      }
    });

    it('attests the report with GitHub\'s artifact attestation and keeps it, its SHA-256, its summary and the attestation\'s bundle as the tag\'s release assets, from a job that alone may write contents, mint an OIDC token or write attestations, and runs nothing but the attestation and gh (the verification of PR 6b-3\'s capacity changes)', () => {
      const report = job('report');
      expect(report.needs).toBe('capacity');
      expect(report.if).toBe("${{ !cancelled() && needs.capacity.result != 'skipped' }}");
      expect(report.permissions).toEqual({ contents: 'write', 'id-token': 'write', attestations: 'write' });
      for (const [name, entry] of Object.entries(release.jobs)) {
        const granted = JSON.stringify(entry.permissions ?? {});
        expect(granted.includes('"contents":"write"'), name).toBe(name === 'report');
        expect(granted.includes('id-token'), name).toBe(name === 'report');
        expect(granted.includes('attestations'), name).toBe(name === 'report');
      }
      expect(JSON.stringify(release.permissions)).not.toMatch(/id-token|attestations/);
      expect(report.steps.map((step) => step.uses ?? 'run')).toEqual([PINNED.downloadArtifact, PINNED.attestBuildProvenance, 'run']);
      // The attestation's subject is the report's bytes as the harness wrote them, the file the release keeps.
      const attest = report.steps[1] as Step & { id?: string };
      expect(attest.id).toBe('attest');
      expect(attest.with).toEqual({ 'subject-path': '${{ runner.temp }}/screening-capacity/screening-capacity.json' });
      expect(file).toContain(`uses: ${PINNED.attestBuildProvenance} # v4.2.2`);
      const keep = report.steps[2] as Step & { env?: Record<string, string> };
      expect(keep.env?.BUNDLE).toBe('${{ steps.attest.outputs.bundle-path }}');
      const commands = runs('report')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== '' && !line.startsWith('"$RUNNER_TEMP'));
      expect(commands.every((line) => line.startsWith('gh release ') || line === 'cp "$BUNDLE" "$RUNNER_TEMP/screening-capacity/screening-capacity.sigstore.json"'), commands.join('\n')).toBe(true);
      expect(runs('report').indexOf('cp "$BUNDLE"')).toBeLessThan(runs('report').indexOf('gh release upload'));
      expect(runs('report')).toContain('gh release upload "$TAG" --clobber');
      for (const asset of ['screening-capacity.json', 'screening-capacity.sha256', 'summary.md', 'screening-capacity.sigstore.json']) {
        expect(runs('report'), asset).toContain(`"$RUNNER_TEMP/screening-capacity/${asset}"`);
      }
      // It never makes a tag: a release is made only for the tag the founder pushed.
      expect(runs('report')).toContain('--verify-tag');
    });
  });

  it('run the intake test on a 2 GiB zip of 835s weekly against PostgreSQL (the milestone 3 done check)', () => {
    const large = workflow('large-zip.yml');
    expect(large.on).toMatchObject({ schedule: [{ cron: expect.any(String) as unknown }], workflow_dispatch: null });
    const steps = large.jobs['large-zip']?.steps ?? [];
    const test: (Step & { env?: Record<string, string> }) | undefined = steps.find((step) => step.run?.includes('apps/worker/src/intake/intake.large.db.test.ts') === true);
    expect(test?.env).toMatchObject({ TP_LARGE_ZIP_MB: '2048' });
    // Chromium first: the db project fails on CI without it rather than skip a printing test (CI-05).
    expect(stepIndex(steps, (step) => step.run === 'pnpm --filter @tp/web exec playwright install --with-deps chromium')).toBeLessThan(steps.indexOf(test as Step));
  });

  it('rasterize the e2e browser’s text with fixed parameters and its own fontconfig, so the brand baselines compare the same on any Linux host', () => {
    // A runner with fontconfig's stock hinting drew the same Chromium's text in other pixels than the machine that made
    // the baselines (docs/adr/0058): the switches set hinting and LCD text, and e2e/fonts.conf the rest, over the host's.
    const config = readFileSync(path.join(repositoryRoot, 'apps/web/playwright.config.ts'), 'utf8');
    expect(config).toContain("args: ['--font-render-hinting=none', '--disable-lcd-text']");
    expect(config).toContain("FONTCONFIG_FILE: path.join(import.meta.dirname, 'e2e/fonts.conf')");
    expect(config).toContain('launchOptions: textRendering');
    const fonts = readFileSync(path.join(repositoryRoot, 'apps/web/e2e/fonts.conf'), 'utf8');
    // The host's configuration first, for its fonts; then one set of rendering properties, assigned to every request and every match.
    expect(fonts.indexOf('<include ignore_missing="yes">/etc/fonts/fonts.conf</include>')).toBeLessThan(fonts.indexOf('<match target="pattern">'));
    const assigned = ['antialias">true', 'hinting">false', 'hintstyle">hintnone', 'autohint">false', 'rgba">none', 'lcdfilter">lcdnone'];
    for (const target of ['pattern', 'font']) {
      const block = /<match target="(\w+)">([\s\S]*?)<\/match>/g;
      const edits = [...fonts.matchAll(block)].filter((match) => match[1] === target).map((match) => [...(match[2] ?? '').matchAll(/<edit name="(\w+)" mode="assign"><\w+>(\w+)<\/\w+><\/edit>/g)].map((edit) => `${edit[1] ?? ''}">${edit[2] ?? ''}`));
      expect(edits, target).toEqual([assigned]);
    }
  });

  it('run the content checker on each outgoing release before publishing it', () => {
    const steps = workflow('publish-content.yml').jobs.publish?.steps ?? [];
    const verify = stepIndex(steps, (step) => step.run?.includes('pnpm verify-content') === true);
    const publish = stepIndex(steps, (step) => step.run?.includes('tools/publish-content.sh') === true);
    expect(verify).toBeLessThan(publish);
  });

  it('measure the screening under production limits with time advisory on pull requests, pushes, weekly and on request, and gate every pull request through one required job that measures only when a watched path changed (audit #53 part 1; the founder’s Q8 of 2026-10-21 and third ruling of 2026-10-23)', () => {
    const file = readFileSync(path.join(repositoryRoot, '.github/workflows/screening-capacity.yml'), 'utf8');
    const capacity = parse(file) as Workflow & {
      permissions: unknown;
      concurrency: Record<string, unknown>;
      jobs: Record<string, Job & { name?: string; 'timeout-minutes'?: number; needs?: unknown; if?: string; permissions?: unknown; outputs?: Record<string, string> }>;
    };
    const on = capacity.on as Record<string, { branches?: string[]; paths?: string[] } | null | { cron: string }[]>;
    expect(Object.keys(on).sort()).toEqual(['pull_request', 'push', 'schedule', 'workflow_dispatch']);
    expect(on.schedule).toEqual([{ cron: '41 6 * * 1' }]);
    expect(on.workflow_dispatch).toBeNull();
    const push = on.push as { branches: string[]; paths: string[] };
    expect(push.branches).toEqual(['claude/build-platform']);
    // A push to the build branch measures any change to what the images or the harness are built from.
    const pushPaths = [
      'apps/web/**',
      'apps/worker/**',
      'packages/**',
      'tools/screening-capacity/**',
      'tools/release/**',
      'tools/content-files.ts',
      'tools/verify-content/**',
      'infra/lib/**',
      'fixtures/synthetic/rules/**',
      'package.json',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
      '.github/workflows/screening-capacity.yml',
    ];
    expect(push.paths).toEqual(pushPaths);
    // Every pull request runs it, so the required gate is always reported: no path filter on the trigger.
    expect(on.pull_request).toBeNull();
    expect(capacity.permissions).toEqual({ contents: 'read' });
    // Pushes group by commit and are never cancelled; only a pull request's older run is.
    expect(capacity.concurrency).toEqual({
      group: "screening-capacity-${{ github.event_name == 'pull_request' && github.ref || github.sha }}",
      'cancel-in-progress': "${{ github.event_name == 'pull_request' }}",
    });
    expect(Object.keys(capacity.jobs).sort()).toEqual(['capacity', 'changes', 'gate', 'notify']);

    // The changed paths: file names only, from a checkout that keeps no token; a pull request measures when it changes a
    // path of the derived watched list as the base keeps it or as the pull request does (tools/screening-capacity/
    // watched.ts; its own test holds the list to the import graph and the push paths to the list).
    const changes = capacity.jobs.changes;
    expect(changes?.['runs-on']).toBe('ubuntu-24.04');
    expect(changes?.permissions).toBeUndefined();
    expect(changes?.outputs).toEqual({ measure: '${{ steps.watched.outputs.measure }}' });
    expect(changes?.steps[0]).toEqual({ uses: PINNED.checkout, with: { 'persist-credentials': false, 'fetch-depth': 0, filter: 'blob:none' } });
    const watched = changes?.steps.find((step) => (step as Step & { id?: string }).id === 'watched');
    const script = watched?.run ?? '';
    expect(script).toContain('git diff --name-only "$BASE...$HEAD" > "$RUNNER_TEMP/changed-paths"');
    expect(script).toContain('list=tools/screening-capacity/watched-paths.txt');
    // A base with no list measures; the list is read from the base and from the head, so a pull request cannot drop its own path.
    expect(script).toContain('if ! git cat-file -e "$BASE:$list" 2>/dev/null; then');
    expect(script).toContain('{ git show "$BASE:$list"; git show "$HEAD:$list" 2>/dev/null || true; }');
    expect(script).toContain('if [ "$file" = "$pattern" ]; then');
    expect(script).toMatch(/case "\$file" in\s+\$pattern\)/);
    expect(script).toContain('if [ "$EVENT" != "pull_request" ]; then');

    // The measurement: only when the changes say so, on GitHub's free 4-CPU runner, its CPUs shared (the founder's third
    // ruling of 2026-10-23, "Free: time advisory").
    const measure = capacity.jobs.capacity;
    expect(measure?.needs).toBe('changes');
    expect(measure?.if).toBe("needs.changes.outputs.measure == 'true'");
    expect(measure?.['runs-on']).toBe('ubuntu-24.04');
    // 100 minutes: S4 runs three times (the founder's ruling of 2026-10-23), about 3 minutes more than the 90 before.
    expect(measure?.['timeout-minutes']).toBe(100);
    expect(measure?.permissions).toBeUndefined();
    const steps = measure?.steps ?? [];
    // Both production images built from their Dockerfiles before the harness runs.
    const builds = steps.filter((step) => step.uses === PINNED.buildPush);
    expect(builds.map((step) => [step.with?.file, step.with?.load, step.with?.tags])).toEqual([
      ['apps/web/Dockerfile', true, 'tp-web:capacity'],
      ['apps/worker/Dockerfile', true, 'tp-worker:capacity'],
    ]);
    // Every run reads the layer cache; only a push to the build branch writes it, and only its final layers.
    expect(builds.map((step) => [step.with?.['cache-from'], step.with?.['cache-to']])).toEqual(
      ['web', 'worker'].map((image) => [
        `type=gha,scope=screening-capacity-${image}`,
        `\${{ github.event_name == 'push' && github.ref == 'refs/heads/claude/build-platform' && 'type=gha,mode=min,scope=screening-capacity-${image}' || '' }}`,
      ]),
    );
    // The scale release: restored, built in a step of its own when missing, and saved straight after, before the
    // measurement, so a failing measurement still caches it.
    const restore = stepIndex(steps, (step) => step.uses === PINNED.cacheRestore);
    const build = stepIndex(steps, (step) => step.run?.includes('tools/release/scale.ts') === true);
    const save = stepIndex(steps, (step) => step.uses === PINNED.cacheSave);
    expect([restore < build, build < save]).toEqual([true, true]);
    expect(steps.some((step) => step.uses === 'actions/cache@v4')).toBe(false);
    expect((steps[build] as Step & { if?: string }).if).toBe("steps.scale-release.outputs.cache-hit != 'true'");
    expect((steps[save] as Step & { if?: string }).if).toBe("steps.scale-release.outputs.cache-hit != 'true'");
    const run = stepIndex(steps, (step) => step.run?.includes('pnpm screening:capacity') === true);
    expect(stepIndex(steps, (step) => step.uses === PINNED.buildPush)).toBeLessThan(run);
    expect(save).toBeLessThan(run);
    // The harness, its children and Chromium where the runner's layout puts them (Postgres's 0-1 on the free runner),
    // never the consumer's CPUs.
    expect(steps[run]?.run).toContain('cpus=$(pnpm -s screening:capacity --print-harness-cpus)');
    expect(steps[run]?.run).toContain('taskset -c "$cpus" pnpm screening:capacity');
    // Advisory on every event this workflow runs on (none is a release): time warns, every other check fails the job.
    expect(steps[run]?.run).toContain('--time-mode advisory');
    expect(steps[run]?.run).not.toContain('binding');
    const upload = stepIndex(steps, (step) => step.uses === PINNED.uploadArtifact);
    expect(upload).toBe(run + 1);
    expect((steps[upload] as Step & { if?: string }).if).toBe('always()');
    expect(String(steps[upload]?.with?.path).trim().split('\n')).toEqual([
      '${{ runner.temp }}/screening-capacity/screening-capacity.json',
      '${{ runner.temp }}/screening-capacity/screening-capacity.sha256',
      '${{ runner.temp }}/screening-capacity/summary.md',
      '${{ runner.temp }}/screening-capacity/logs/',
    ]);
    expect(steps[upload]?.with?.['retention-days']).toBe(90);
    // The measuring job's checkout keeps no token: nothing it runs calls GitHub.
    expect(steps[0]).toEqual({ uses: PINNED.checkout, with: { 'persist-credentials': false } });
    // A sizing question (a worst time above 44 s) and the time warnings leave the job as outputs the gate prints as
    // warnings (O9; the founder's ruling of 2026-10-23, time advisory).
    expect(measure?.outputs).toEqual({ sizing: '${{ steps.measure.outputs.sizing }}', 'time-warnings': '${{ steps.measure.outputs.time-warnings }}' });
    expect((steps[run] as Step & { id?: string }).id).toBe('measure');

    // The required check: one job, named for the ruleset, that runs whatever the others did, a cancelled run included (a
    // job its condition skips reports success to a required check), passes when nothing watched changed and otherwise
    // only on a passing measurement; it checks nothing out.
    const gate = capacity.jobs.gate;
    expect(gate?.name).toBe('screening-capacity gate');
    expect(gate?.needs).toEqual(['changes', 'capacity']);
    expect(gate?.if).toBe('${{ always() }}');
    expect(gate?.permissions).toBeUndefined();
    expect(gate?.steps.every((step) => step.uses === undefined)).toBe(true);
    const decide = gate?.steps.map((step) => step.run ?? '').join('\n') ?? '';
    expect(decide).toContain('if [ "$CHANGES" != "success" ]; then');
    expect(decide).toContain('if [ "$MEASURE" != "true" ]; then');
    expect(decide).toContain('if [ "$CAPACITY" != "success" ]; then');
    const decision: Step & { readonly env?: unknown } = gate?.steps[0] ?? {};
    expect(decision.env).toEqual({
      CHANGES: '${{ needs.changes.result }}',
      MEASURE: '${{ needs.changes.outputs.measure }}',
      CAPACITY: '${{ needs.capacity.result }}',
      SIZING: '${{ needs.capacity.outputs.sizing }}',
      TIME_WARNINGS: '${{ needs.capacity.outputs.time-warnings }}',
    });
    expect(decide).toContain('echo "::warning title=Sizing question (O9)::$SIZING"');
    // An advisory run whose only failures are time passed its job: the gate passes it with the warnings on the checks.
    expect(decide).toContain('echo "::warning title=Time (advisory)::$TIME_WARNINGS"');
    expect(decide.indexOf('if [ "$CAPACITY" != "success" ]; then')).toBeLessThan(decide.indexOf('$TIME_WARNINGS'));

    // The issue: a job of its own, the only one that may write, that needs the measurement, skips pull requests and runs no repository code.
    const notify = capacity.jobs.notify;
    expect(notify?.['runs-on']).toBe('ubuntu-24.04');
    expect(notify?.needs).toBe('capacity');
    expect(notify?.if).toBe("failure() && github.event_name != 'pull_request'");
    expect(notify?.permissions).toEqual({ issues: 'write' });
    expect(notify?.['timeout-minutes']).toBe(5);
    expect(notify?.steps.some((step) => step.uses?.startsWith('actions/checkout') === true)).toBe(false);
    expect(notify?.steps.every((step) => step.uses === undefined)).toBe(true);
    expect(notify?.steps.map((step) => step.run ?? '').join('\n')).toContain('--label screening-capacity');
  });
});

describe('the content calendar and the weekly real-size test (docs/adr/0071; test matrix RCC-07 and RCC-08)', () => {
  type ContentJob = Job & { permissions?: unknown; outputs?: Record<string, string> };
  const read = (name: string) => parse(readFileSync(path.join(WORKFLOWS, name), 'utf8')) as Workflow & { jobs: Record<string, ContentJob> };
  const runs = (job: ContentJob | undefined) => (job?.steps ?? []).map((step) => step.run ?? '');

  /** A notify job writes issues alone, with the job's own token: it checks nothing out, runs no action and puts no expression in its shell. */
  function expectQuietNotify(name: string, needs: string, condition: string) {
    const notify = read(name).jobs.notify;
    expect(notify?.needs, name).toBe(needs);
    expect(notify?.if, name).toBe(condition);
    expect(notify?.permissions, name).toEqual({ issues: 'write' });
    expect(notify?.steps.filter((step) => step.uses !== undefined), name).toEqual([]);
    expect(runs(notify).filter((run) => run.includes('${{')), name).toEqual([]);
    for (const step of notify?.steps ?? []) expect(Object.keys(step.env ?? {}).filter((key) => /SECRET|PASSWORD|KEY/.test(key)), name).toEqual([]);
    expect(JSON.stringify(notify?.steps ?? []), name).not.toContain('secrets.');
  }

  it('content-calendar: runs daily, on request, and on a push to the build branch or a pull request touching the calendar or the content, with a read-only token', () => {
    const calendar = read('content-calendar.yml');
    const on = calendar.on as Record<string, { branches?: string[]; paths?: string[] } | { cron: string }[] | null>;
    expect(Object.keys(on)).toEqual(['schedule', 'workflow_dispatch', 'push', 'pull_request']);
    expect(on.schedule).toEqual([{ cron: '17 7 * * *' }]);
    const push = on.push as { branches?: string[]; paths?: string[] };
    const pull = on.pull_request as { paths?: string[] };
    expect(push.branches).toEqual(['claude/build-platform']);
    expect(push.paths).toEqual(['packages/rules/src/calendar.ts', 'packages/rules/src/records.ts', 'tools/content-calendar/**', 'content/**', '.github/workflows/content-calendar.yml']);
    expect(pull.paths).toEqual(push.paths);
    expect(calendar.permissions).toEqual({ contents: 'read' });
    expect(calendar.concurrency).toEqual({ group: '${{ github.workflow }}-${{ github.ref }}', 'cancel-in-progress': "${{ github.event_name == 'pull_request' }}" });
    expect(Object.keys(calendar.jobs)).toEqual(['check', 'notify']);
  });

  it('content-calendar: its check job only reads, with no permissions of its own and no secret, and hands the findings on as an output', () => {
    const check = read('content-calendar.yml').jobs.check;
    expect(check?.permissions).toBeUndefined();
    expect(check?.steps[0]).toEqual({ uses: PINNED.checkout, with: { 'persist-credentials': false } });
    expect(runs(check).filter((run) => run.startsWith('pnpm install'))).toEqual(['pnpm install --frozen-lockfile']);
    expect(JSON.stringify(check?.steps ?? [])).not.toContain('secrets.');
    expect(runs(check).filter((run) => run.includes('${{'))).toEqual([]);
    const script = runs(check).find((run) => run.includes('tools/content-calendar/index.ts')) ?? '';
    expect(script).toContain('--today "$(date -u +%F)" --out "$RUNNER_TEMP/findings.json" --summary "$RUNNER_TEMP/summary.md"');
    expect(script).toContain('>> "$GITHUB_STEP_SUMMARY"');
    expect(check?.outputs).toEqual({ findings: '${{ steps.calendar.outputs.findings }}' });
  });

  /**
   * A fake gh on PATH for a notify script: `gh api` answers with the open issues (as its --jq would print them, one
   * object a line), `gh issue list` with them as one JSON array, and every call is logged one line each.
   */
  function fakeGh(open: readonly { number: number; title: string }[]): { dir: string; log: () => string[]; bodies: () => string[] } {
    const dir = mkdtempSync(path.join(scratch, 'notify-'));
    mkdirSync(path.join(dir, 'bin'));
    mkdirSync(path.join(dir, 'fake'));
    writeFileSync(path.join(dir, 'fake/open.jsonl'), open.map((issue) => JSON.stringify(issue)).join('\n') + (open.length > 0 ? '\n' : ''));
    writeFileSync(path.join(dir, 'fake/open.json'), JSON.stringify(open));
    writeFileSync(
      path.join(dir, 'bin/gh'),
      [
        '#!/usr/bin/env bash',
        'set -euo pipefail',
        'printf "%s\\n" "$*" >> "$FAKE_DIR/log"',
        'if [ "$1" = api ]; then cat "$FAKE_DIR/fake/open.jsonl"; exit 0; fi',
        'if [ "$1 $2" = "issue list" ]; then cat "$FAKE_DIR/fake/open.json"; exit 0; fi',
        'for arg in "$@"; do if [ "${previous:-}" = --body-file ]; then { cat "$arg"; printf "\\n---\\n"; } >> "$FAKE_DIR/bodies"; fi; previous=$arg; done',
      ].join('\n'),
      { mode: 0o755 },
    );
    const lines = (name: string) => (existsSync(path.join(dir, name)) ? readFileSync(path.join(dir, name), 'utf8') : '');
    return { dir, log: () => lines('log').split('\n').filter((line) => line !== ''), bodies: () => lines('bodies').split('\n---\n').filter((body) => body !== '') };
  }

  const notifyStep = (name: string) => read(name).jobs.notify?.steps[0];

  /** Runs a notify step as GitHub runs it, with its env's literals and these values for its expressions. */
  function runNotify(name: string, values: Record<string, string>, open: readonly { number: number; title: string }[]) {
    const step = notifyStep(name);
    const gh = fakeGh(open);
    const literals = Object.fromEntries(Object.entries(step?.env ?? {}).filter(([, value]) => !value.includes('${{')));
    const result = runScript(step?.run ?? '', { ...literals, GH_REPO: 'owner/repo', GH_TOKEN: 'token', RUN_URL: 'https://github.com/owner/repo/actions/runs/1', GITHUB_REF_NAME: 'claude/build-platform', GITHUB_SHA: 'abc123', FAKE_DIR: gh.dir, PATH: `${path.join(gh.dir, 'bin')}:${process.env.PATH ?? '/usr/bin:/bin'}`, ...values }, gh.dir);
    return { ...result, log: gh.log(), bodies: gh.bodies() };
  }
  const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64');
  const finding = (index: number) => ({ title: `Finding ${String(index)}`, body: `Body ${String(index)}` });

  it('content-calendar: its notify job alone writes issues, skips pull requests, dedupes by exact title against every open issue, and opens at most MAX_OPENED_PER_RUN a run', () => {
    expectQuietNotify('content-calendar.yml', 'check', "always() && github.event_name != 'pull_request'");
    const step = notifyStep('content-calendar.yml');
    expect(step?.env?.MAX_OPENED).toBe(String(MAX_OPENED_PER_RUN));
    const script = step?.run ?? '';
    expect(script.startsWith('set -euo pipefail\n')).toBe(true);
    // Every page of the open issues, not the first 200 (sec-boundary improvement 3).
    expect(script).toContain('gh api --paginate "repos/$GH_REPO/issues?labels=content-due&state=open&per_page=100"');
    expect(script).not.toContain('--limit 200');
  });

  it('content-calendar: notify files the findings not open, at most 20 a run, and lists the rest in one issue it closes once every finding is filed (fix round SB-5)', () => {
    const all = Array.from({ length: 25 }, (_, index) => finding(index));
    const open = [0, 1, 2].map((index) => ({ number: 100 + index, title: `Finding ${String(index)}` }));
    const first = runNotify('content-calendar.yml', { CHECK_RESULT: 'success', FINDINGS_B64: b64(all) }, open);
    expect(first.status, first.output).toBe(0);
    const creates = first.log.filter((line) => line.startsWith('issue create'));
    expect(creates).toEqual([
      ...Array.from({ length: 20 }, (_, index) => `issue create --title Finding ${String(index + 3)} --label content-due --body-file body.md`),
      'issue create --title Content calendar: findings not filed --label content-due --body-file body.md',
    ]);
    expect(first.bodies[0]).toBe('Body 3\n\n\nOpened by the content-calendar workflow: https://github.com/owner/repo/actions/runs/1\n');
    expect(first.bodies.at(-1)).toBe('A run opens at most 20 new issues. These 2 findings were not filed by https://github.com/owner/repo/actions/runs/1; a later run files them:\n\n- Finding 23\n- Finding 24\n');
    // The next day, with those open: findings 23 and 24 are filed, and the list of findings not filed is closed.
    const nowOpen = [...open, ...Array.from({ length: 20 }, (_, index) => ({ number: 200 + index, title: `Finding ${String(index + 3)}` })), { number: 300, title: 'Content calendar: findings not filed' }];
    const second = runNotify('content-calendar.yml', { CHECK_RESULT: 'success', FINDINGS_B64: b64(all) }, nowOpen);
    expect(second.status, second.output).toBe(0);
    expect(second.log.filter((line) => line.startsWith('issue '))).toEqual([
      'issue create --title Finding 23 --label content-due --body-file body.md',
      'issue create --title Finding 24 --label content-due --body-file body.md',
      'issue close 300 --comment Every finding is filed: https://github.com/owner/repo/actions/runs/1',
    ]);
    // Twenty-five more the day after, while the list is open: it is commented on, not opened twice.
    const third = runNotify('content-calendar.yml', { CHECK_RESULT: 'success', FINDINGS_B64: b64(Array.from({ length: 21 }, (_, index) => finding(index + 50))) }, [{ number: 300, title: 'Content calendar: findings not filed' }]);
    expect(third.log.filter((line) => line.startsWith('issue ')).at(-1)).toBe('issue comment 300 --body-file body.md');
    expect(third.log.filter((line) => line.startsWith('issue create'))).toHaveLength(20);
  });

  it('content-calendar: notify opens, or comments on, the one "check failing" issue when the check did not finish or handed on no findings list (fix round S8; sec-boundary improvement 2)', () => {
    const failing = 'issue create --title Content calendar check failing --label content-due --body-file body.md';
    for (const values of [
      { CHECK_RESULT: 'failure', FINDINGS_B64: '' },
      { CHECK_RESULT: 'cancelled', FINDINGS_B64: b64([finding(1)]) },
      { CHECK_RESULT: 'success', FINDINGS_B64: '' },
      { CHECK_RESULT: 'success', FINDINGS_B64: '!!not base64!!' },
      { CHECK_RESULT: 'success', FINDINGS_B64: b64({ title: 'x' }) },
      { CHECK_RESULT: 'success', FINDINGS_B64: b64([{ title: 'x' }]) },
    ]) {
      const result = runNotify('content-calendar.yml', values, []);
      expect(result.status, `${JSON.stringify(values)} ${result.output}`).toBe(0);
      expect(result.log.filter((line) => line.startsWith('issue ')), JSON.stringify(values)).toEqual([failing]);
      expect(result.bodies[0], JSON.stringify(values)).toBe(`The content calendar check did not hand on its findings (the check: ${values.CHECK_RESULT}) on claude/build-platform at abc123: https://github.com/owner/repo/actions/runs/1\n`);
    }
    // Each later failing run comments on the open issue, so a long failure shows in its history.
    const again = runNotify('content-calendar.yml', { CHECK_RESULT: 'failure', FINDINGS_B64: '' }, [{ number: 7, title: 'Content calendar check failing' }]);
    expect(again.log.filter((line) => line.startsWith('issue '))).toEqual(['issue comment 7 --body-file body.md']);
    // An empty list on a passing check files nothing.
    expect(runNotify('content-calendar.yml', { CHECK_RESULT: 'success', FINDINGS_B64: b64([]) }, []).log.filter((line) => line.startsWith('issue '))).toEqual([]);
  });

  it('release-capacity: runs weekly and on request with a read-only token, builds release 900110 outside the repository and measures the production worker image under the worker task’s limits', () => {
    const capacity = read('release-capacity.yml');
    expect(capacity.on).toEqual({ schedule: [{ cron: '29 3 * * 2' }], workflow_dispatch: null });
    expect(capacity.permissions).toEqual({ contents: 'read' });
    expect(capacity.concurrency).toEqual({ group: 'release-capacity-${{ github.sha }}', 'cancel-in-progress': false });
    expect(Object.keys(capacity.jobs)).toEqual(['capacity', 'notify']);
    const job = capacity.jobs.capacity;
    expect(job?.permissions).toBeUndefined();
    expect(job?.steps[0]).toEqual({ uses: PINNED.checkout, with: { 'persist-credentials': false } });
    const build = job?.steps.find((step) => step.uses === PINNED.buildPush);
    expect(build?.with).toMatchObject({ file: 'apps/worker/Dockerfile', load: true, push: false, tags: 'tp-worker:capacity' });
    expect(build?.with?.['cache-to']).toBeUndefined();
    const steps = runs(job);
    const release = steps.findIndex((run) => run === 'pnpm exec tsx tools/release/scale.ts --shape quarterly --out "$RUNNER_TEMP/quarterly-release"');
    const measure = steps.findIndex((run) => run.includes('tools/release-capacity/run.ts \\'));
    expect(release).toBeGreaterThan(-1);
    expect(measure).toBeGreaterThan(release);
    expect(steps[measure]).toContain('--release-dir "$RUNNER_TEMP/quarterly-release"');
    expect(steps[measure]).toContain('--worker-image tp-worker:capacity');
    expect(steps.filter((run) => run.startsWith('pnpm install'))).toEqual(['pnpm install --frozen-lockfile']);
    expect(JSON.stringify(job?.steps ?? [])).not.toContain('secrets.');
  });

  it('release-capacity: its notify job alone writes issues, on a failure, a cancel or an advisory that is not a pull request’s (fix round S3, SB-7)', () => {
    expectQuietNotify(
      'release-capacity.yml',
      'capacity',
      "always() && github.event_name != 'pull_request' && (needs.capacity.result == 'failure' || needs.capacity.result == 'cancelled' || needs.capacity.outputs.advisories != '')",
    );
    const capacity = read('release-capacity.yml').jobs.capacity;
    expect(capacity?.outputs).toEqual({ advisories: '${{ steps.measure.outputs.advisories }}' });
    expect(capacity?.steps.find((step) => step.id === 'measure')?.run).toContain('tools/release-capacity/run.ts \\');
    expect(notifyStep('release-capacity.yml')?.env).toMatchObject({ CAPACITY_RESULT: '${{ needs.capacity.result }}', ADVISORIES_B64: '${{ needs.capacity.outputs.advisories }}' });
    const advisory = Buffer.from('the windows query took 7000 ms cold, above its 5000 ms budget (advisory)').toString('base64');

    const failed = runNotify('release-capacity.yml', { CAPACITY_RESULT: 'failure', ADVISORIES_B64: advisory }, []);
    expect(failed.status, failed.output).toBe(0);
    expect(failed.log.filter((line) => line.startsWith('issue '))).toEqual(['issue list --label release-capacity --state open --json number,title', 'issue create --title Release capacity test failing --label release-capacity --body-file body.md']);
    expect(failed.bodies[0]).toBe(
      'The release capacity test ended failure on claude/build-platform at abc123: https://github.com/owner/repo/actions/runs/1. The artifact of the run holds release-capacity.json and summary.md with each failing check.\n\nAdvisory:\n\n- the windows query took 7000 ms cold, above its 5000 ms budget (advisory)\n',
    );
    const cancelled = runNotify('release-capacity.yml', { CAPACITY_RESULT: 'cancelled', ADVISORIES_B64: '' }, [{ number: 4, title: 'Release capacity test failing' }]);
    expect(cancelled.log.filter((line) => line.startsWith('issue ')).at(-1)).toBe('issue comment 4 --body-file body.md');
    expect(cancelled.bodies[0]).toContain('ended cancelled');
    // A pass with an advisory: its own issue, so the failing one's title never misleads.
    const passed = runNotify('release-capacity.yml', { CAPACITY_RESULT: 'success', ADVISORIES_B64: advisory }, [{ number: 4, title: 'Release capacity test failing' }]);
    expect(passed.log.filter((line) => line.startsWith('issue ')).at(-1)).toBe('issue create --title Release capacity advisory --label release-capacity --body-file body.md');
    expect(passed.bodies[0]).toBe('The release capacity test passed on claude/build-platform at abc123 with an advisory: https://github.com/owner/repo/actions/runs/1\n\nAdvisory:\n\n- the windows query took 7000 ms cold, above its 5000 ms budget (advisory)\n');
  });

  it('are neither of them a required check', () => {
    expect(REQUIRED_CHECKS.filter((check) => check.workflow === 'content-calendar.yml' || check.workflow === 'release-capacity.yml')).toEqual([]);
  });
});

describe('ci.yml: every gate as parallel jobs behind one all green gate (docs/adr/0066, Part 1)', () => {
  const ci = workflow('ci.yml');
  const JOBS = ['static', 'lint', 'unit', 'db', 'domain-model', 'build', 'e2e', 'images', 'all-green'];

  it('runs on every pull request and every push to the build branch, with no path filter, a read-only token and bash with pipefail', () => {
    expect(ci.on).toEqual({ pull_request: null, push: { branches: ['claude/build-platform'] } });
    // The whole workflow reads the repository and nothing more, and no checkout keeps the token.
    expect(ci.permissions).toEqual({ contents: 'read' });
    for (const [id, job] of Object.entries(ci.jobs)) {
      for (const step of job.steps.filter((candidate) => usesAction(candidate, 'actions/checkout'))) {
        expect(step.with?.['persist-credentials'], id).toBe(false);
      }
    }
    expect(ci.defaults).toEqual({ run: { shell: 'bash' } });
  });

  it('groups a pull request’s runs by its number and a push’s by its commit, cancelling only a pull request’s older run', () => {
    expect(ci.concurrency).toEqual({
      group: "${{ github.workflow }}-${{ github.event_name == 'pull_request' && format('pr-{0}', github.event.pull_request.number) || github.sha }}",
      'cancel-in-progress': "${{ github.event_name == 'pull_request' }}",
    });
  });

  it('has exactly its job graph, and its gate needs every other job, so no job escapes it (CI-01)', () => {
    expect(Object.keys(ci.jobs)).toEqual(JOBS);
    const gate = ci.jobs['all-green'];
    expect([...((gate?.needs as string[] | undefined) ?? [])].sort()).toEqual(JOBS.filter((id) => id !== 'all-green').sort());
    expect(gate?.if).toBe('${{ always() }}');
    // Every other job starts at once, but the e2e shards, which run the build job's build.
    expect(Object.fromEntries(Object.entries(ci.jobs).filter(([id]) => id !== 'all-green').map(([id, job]) => [id, job.needs ?? null]))).toEqual({
      static: null,
      lint: null,
      unit: null,
      db: null,
      'domain-model': null,
      build: null,
      e2e: 'build',
      images: null,
    });
    expect(Object.fromEntries(Object.entries(ci.jobs).map(([id, job]) => [id, job.name ?? id]))).toEqual({
      static: 'static',
      lint: 'lint',
      unit: 'unit',
      db: 'db (${{ matrix.shard }}/${{ strategy.job-total }})',
      'domain-model': 'domain model',
      build: 'build',
      e2e: 'e2e (${{ matrix.shard }}/${{ strategy.job-total }})',
      images: 'images',
      'all-green': 'all green',
    });
    expect(Object.values(ci.jobs).every((job) => job.if === undefined || job === gate)).toBe(true);
  });

  it('writes every verdict it puts in a job’s summary to the job’s log as well, which the verifier reads', () => {
    const text = readFileSync(path.join(WORKFLOWS, 'ci.yml'), 'utf8');
    expect(text).toContain('tee -a "$GITHUB_STEP_SUMMARY"');
    expect(text).not.toMatch(/>>\s*"\$GITHUB_STEP_SUMMARY"/);
  });

  describe('static', () => {
    const steps = () => ciJob('static').steps;

    it('checks out the whole history, runs every check once the install succeeded whatever the one before it did, and each once', () => {
      expect(steps()[0]).toEqual({ uses: PINNED.checkout, with: { 'fetch-depth': 0, 'persist-credentials': false } });
      const install = stepIndex(steps(), (step) => step.run === 'pnpm install --frozen-lockfile');
      const checks = ['pnpm audit --prod', 'pnpm check:fixtures', 'pnpm verify-content', 'pnpm synth --all', 'pnpm typecheck', 'pnpm lint:logs', 'pnpm test:golden', 'pnpm test:oracle', 'pnpm licenses:check'];
      for (const run of checks) {
        const at = stepIndex(steps(), (step) => step.run === run);
        expect(at, run).toBeGreaterThan(install);
        expect(steps()[at]?.if, run).toBe("${{ !cancelled() && steps.install.outcome == 'success' }}");
        expect(steps().filter((step) => step.run === run), run).toHaveLength(1);
      }
      // The 835 oracle's pyx12 on Python 3.12, before the oracle test.
      expect(stepIndex(steps(), (step) => usesAction(step, 'actions/setup-python'))).toBeLessThan(stepIndex(steps(), (step) => step.run === 'pip install pyx12'));
      expect(stepIndex(steps(), (step) => step.run === 'pip install pyx12')).toBeLessThan(stepIndex(steps(), (step) => step.run === 'pnpm test:oracle'));
      // The oracle also reads the 10,000-claim PAR-29 remittance, generated into its ignored path and never committed:
      // in this job no unit test writes it first, so pnpm synth --large does, once, before the oracle.
      const large = stepIndex(steps(), (step) => step.run === 'pnpm synth --large');
      expect([install < large, large < stepIndex(steps(), (step) => step.run === 'pnpm test:oracle')]).toEqual([true, true]);
      expect(steps()[large]?.if).toBe("${{ !cancelled() && steps.install.outcome == 'success' }}");
      expect(steps().filter((step) => step.run === 'pnpm synth --large')).toHaveLength(1);
      // Every step after the install runs on its own condition, so a red one leaves the others' verdicts.
      for (const step of steps().slice(install + 1)) expect(step.if, step.name ?? step.run ?? step.uses).toMatch(/^\$\{\{ (?:github\.event_name == 'pull_request' && )?!cancelled\(\)/);
    });

    it('runs the fixture check on the commit as it is, and fails when the generation changes a committed fixture (CO-03)', () => {
      const check = stepIndex(steps(), (step) => step.run === 'pnpm check:fixtures');
      const synth = stepIndex(steps(), (step) => step.run === 'pnpm synth --all');
      // Before pnpm synth --all, which rewrites a hand-edited generated file and removes an extra one, so the check
      // reads the commit's own bytes.
      expect(check).toBeLessThan(synth);
      // Right after the generation, a clean tree under fixtures/synthetic: what the commit holds is what synth writes.
      expect(steps()[synth + 1]?.run).toBe('git diff --exit-code -- fixtures/synthetic && test -z "$(git status --porcelain -- fixtures/synthetic)"');
      expect(steps()[synth + 1]?.if).toBe("${{ !cancelled() && steps.synth.outcome == 'success' }}");
      expect(steps().filter((step) => step.run?.includes('check:fixtures') === true)).toHaveLength(1);
      const scripts = (JSON.parse(readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8')) as { scripts: Record<string, string> }).scripts;
      expect(scripts['check:fixtures']).toBe('tsx tools/fixture-check/index.ts');
    });

    it('typechecks over the build information a run on this branch or its base saved, restored by prefix and saved by commit', () => {
      const restore = stepIndex(steps(), (step) => usesAction(step, 'actions/cache/restore'));
      const typecheck = stepIndex(steps(), (step) => step.run === 'pnpm typecheck');
      const save = stepIndex(steps(), (step) => usesAction(step, 'actions/cache/save'));
      expect([restore < typecheck, typecheck < save]).toEqual([true, true]);
      expect(steps()[restore]?.with).toEqual({
        path: 'node_modules/.cache/tsc',
        key: "tsc-v1-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}-${{ github.sha }}",
        'restore-keys': "tsc-v1-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}-\ntsc-v1-${{ runner.os }}-\n",
      });
      expect(steps()[save]?.with).toEqual({ path: 'node_modules/.cache/tsc', key: '${{ steps.tsc-cache.outputs.cache-primary-key }}' });
      expect(steps()[save]?.if).toBe("${{ !cancelled() && steps.typecheck.outcome != 'skipped' && steps.tsc-cache.outputs.cache-hit != 'true' }}");
    });

    it('scans the commits it checks with the pinned gitleaks the pre-push hook runs, never the gitleaks action, which an organization’s repository must license', () => {
      const actions = workflowFiles().flatMap((file) => Object.values(workflow(file).jobs).flatMap((job) => (job.steps ?? []).map((step) => step.uses ?? '')));
      expect(actions.filter((uses) => /gitleaks/i.test(uses))).toEqual([]);
      const step = stepNamed(steps(), "Secret scan of the pull request's commits");
      expect(step.env).toEqual({ BASE: '${{ steps.range.outputs.base }}' });
      expect(step.if).toBe("${{ !cancelled() && steps.range.outcome == 'success' }}");
      const script = step.run ?? '';
      expect(script).toContain('gitleaks="$(tools/gitleaks/install.sh)"');
      expect(script).not.toContain('${{');
      for (const option of ['git --no-banner --redact', '--config .gitleaks.toml', '--gitleaks-ignore-path .gitleaksignore', '--log-opts "--no-color --no-ext-diff --no-textconv --diff-merges=remerge $BASE..HEAD" .']) {
        expect(script, option).toContain(option);
      }
      // The pin it installs: one version and a SHA-256 for each platform, the archive checked before anything in it runs.
      const release = readFileSync(path.join(repositoryRoot, 'tools/gitleaks/release.txt'), 'utf8');
      expect(release).toMatch(/^version \d+\.\d+\.\d+$/m);
      for (const platform of ['linux_x64', 'linux_arm64', 'darwin_x64', 'darwin_arm64']) {
        expect(release, platform).toMatch(new RegExp(`^${platform} [0-9a-f]{64}$`, 'm'));
      }
      const installer = readFileSync(path.join(repositoryRoot, 'tools/gitleaks/install.sh'), 'utf8');
      expect(installer.indexOf('if [ "$actual" != "$expected" ]')).toBeLessThan(installer.indexOf('tar -xzf'));
      // The release-immutability gate checks the same range's base.
      const releases = stepNamed(steps(), 'Published releases and prompt versions unchanged');
      expect(releases.run).toBe('tools/check-releases-immutable.sh "$BASE"');
      expect(releases.env).toEqual({ BASE: '${{ steps.range.outputs.base }}' });
    });

    it('checks a pull request’s commits beyond its base, a push’s beyond the branch’s previous head, a new branch’s last commit, and refuses a previous head it does not hold', () => {
      const step = stepNamed(steps(), 'The commits this run checks');
      expect(step.env).toEqual({ EVENT: '${{ github.event_name }}', BASE_REF: '${{ github.base_ref }}', BEFORE: '${{ github.event.before }}' });
      expect(step.run).not.toContain('${{');
      const repo = rangeRepository();
      const run = (env: Record<string, string>) => {
        const output = path.join(repo.dir, `output-${String(Math.random()).slice(2)}`);
        const summary = `${output}.md`;
        writeFileSync(output, '');
        writeFileSync(summary, '');
        const result = runScript(step.run ?? '', { ...repo.env, GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary, ...env }, repo.dir);
        return { ...result, base: /^base=(.*)$/m.exec(readFileSync(output, 'utf8'))?.[1], summary: readFileSync(summary, 'utf8') };
      };
      const pull = run({ EVENT: 'pull_request', BASE_REF: 'main', BEFORE: '' });
      expect([pull.status, pull.base]).toEqual([0, 'origin/main']);
      expect(pull.summary).toContain('This run checks the commits origin/main..HEAD.');
      expect(pull.output).toContain('This run checks the commits origin/main..HEAD.');
      const push = run({ EVENT: 'push', BASE_REF: '', BEFORE: repo.first });
      expect([push.status, push.base]).toEqual([0, repo.first]);
      const created = run({ EVENT: 'push', BASE_REF: '', BEFORE: '0000000000000000000000000000000000000000' });
      expect([created.status, created.base]).toEqual([0, repo.second]);
      const missing = run({ EVENT: 'push', BASE_REF: '', BEFORE: 'f'.repeat(40) });
      expect([missing.status, missing.base]).toEqual([1, undefined]);
      expect(missing.output).toContain(`::error title=The commits this run checks::${'f'.repeat(40)} is not a commit in this checkout`);
    });

    it('runs the engine freeze’s check on a pull request only, against its merge base, with its number for the exception', () => {
      const step = stepNamed(steps(), 'Engine freeze');
      expect(step.if).toBe("${{ github.event_name == 'pull_request' && !cancelled() && steps.install.outcome == 'success' }}");
      expect(step.env).toEqual({ BASE_REF: '${{ github.base_ref }}', PR_NUMBER: '${{ github.event.pull_request.number }}' });
    });
  });

  it('lints every file in one job with the repository’s lint command', () => {
    const steps = ciJob('lint').steps;
    expect(steps.map((step) => step.run ?? step.uses?.split('@')[0])).toEqual(['actions/checkout', 'pnpm/action-setup', 'actions/setup-node', 'pnpm install --frozen-lockfile', 'pnpm lint']);
  });

  describe('unit', () => {
    const steps = () => ciJob('unit').steps;

    it('installs Playwright’s Chromium and sets the engine freeze’s base before the unit tests, over the whole history', () => {
      expect(steps()[0]).toEqual({ uses: PINNED.checkout, with: { 'fetch-depth': 0, 'persist-credentials': false } });
      const install = stepIndex(steps(), (step) => step.run === 'pnpm --filter @tp/web exec playwright install --with-deps chromium');
      const base = stepIndex(steps(), (step) => step.name === "The engine freeze's base");
      const unit = stepIndex(steps(), (step) => step.run === 'pnpm test');
      expect([install < unit, base < unit]).toEqual([true, true]);
      expect(steps()[unit]).toEqual({ run: 'pnpm test' });
    });

    it('installs the pinned gitleaks before the unit tests, so the pre-push hook’s real secret-scan cases run rather than skip', () => {
      const gitleaks = stepNamed(steps(), "The pinned gitleaks for the pre-push hook's tests");
      expect(gitleaks.run).toBe('tools/gitleaks/install.sh');
      expect(steps().indexOf(gitleaks)).toBeLessThan(stepIndex(steps(), (step) => step.run === 'pnpm test'));
    });

    it('gives the differential test a pull request’s merge base, a push’s previous head or a new branch’s parent, through GITHUB_ENV', () => {
      const step = stepNamed(steps(), "The engine freeze's base");
      expect(step.env).toEqual({ EVENT: '${{ github.event_name }}', BASE_REF: '${{ github.base_ref }}', BEFORE: '${{ github.event.before }}' });
      const repo = rangeRepository();
      const run = (env: Record<string, string>) => {
        const file = path.join(repo.dir, `env-${String(Math.random()).slice(2)}`);
        writeFileSync(file, '');
        const result = runScript(step.run ?? '', { ...repo.env, GITHUB_ENV: file, ...env }, repo.dir);
        return { ...result, base: /^ENGINE_FREEZE_BASE=(.*)$/m.exec(readFileSync(file, 'utf8'))?.[1] };
      };
      expect(run({ EVENT: 'pull_request', BASE_REF: 'main', BEFORE: '' })).toMatchObject({ status: 0, base: repo.first });
      expect(run({ EVENT: 'push', BASE_REF: '', BEFORE: repo.second })).toMatchObject({ status: 0, base: repo.second });
      expect(run({ EVENT: 'push', BASE_REF: '', BEFORE: '0000000000000000000000000000000000000000' })).toMatchObject({ status: 0, base: repo.second });
      expect(run({ EVENT: 'push', BASE_REF: '', BEFORE: 'e'.repeat(40) })).toMatchObject({ status: 1, base: undefined });
    });
  });

  describe('db', () => {
    const job = () => ciJob('db');
    const steps = () => job().steps;

    it('shards the database suite four ways on the public repository’s 4-CPU runners and six on a private one’s 2-CPU runners, none cancelling another (CI-04)', () => {
      expect(shardWidths(job().strategy?.matrix)).toEqual({ public: [1, 2, 3, 4], private: [1, 2, 3, 4, 5, 6] });
      expect(job().strategy?.['fail-fast']).toBe(false);
      const suite = stepNamed(steps(), "The database suite, this shard's files");
      expect(suite.env).toEqual({ SHARD: '${{ matrix.shard }}/${{ strategy.job-total }}' });
      expect(suite.run).toBe('pnpm db:migrate && pnpm test:db --shard="$SHARD" --reporter=default --reporter=json --outputFile.json="$RUNNER_TEMP/db-results.json"');
    });

    it('migrates its own Postgres, quieted, and installs Chromium before the suite', () => {
      expect(Object.keys(job().services ?? {})).toEqual(['postgres']);
      expect(job().env).toEqual({ DATABASE_URL: 'postgres://postgres:test@localhost:5432/postgres' });
      const quiet = stepIndex(steps(), (step) => step.name === "Quiet the database's log");
      const chromium = stepIndex(steps(), (step) => CHROMIUM_INSTALL.test(step.run ?? ''));
      const suite = stepIndex(steps(), (step) => step.name === "The database suite, this shard's files");
      expect([quiet < suite, chromium < suite]).toEqual([true, true]);
      expect(steps()[quiet]?.run).toContain(`psql "$DATABASE_URL" -qc "ALTER SYSTEM SET log_min_messages = 'panic'"`);
    });

    it('orders each shard’s files by that shard’s own last durations, restored and saved under its width and number', () => {
      // The durations' own cache step, by its id (the browsers' cache comes before it).
      const restore = steps()[stepIndex(steps(), (step) => usesAction(step, 'actions/cache/restore') && step.id === 'vitest-cache')];
      expect(restore?.with).toEqual({
        path: 'node_modules/.vite/vitest',
        key: 'vitest-db-v1-${{ runner.os }}-${{ strategy.job-total }}-${{ matrix.shard }}-${{ github.sha }}',
        'restore-keys': 'vitest-db-v1-${{ runner.os }}-${{ strategy.job-total }}-${{ matrix.shard }}-',
      });
      const save = stepIndex(steps(), (step) => usesAction(step, 'actions/cache/save'));
      expect(save).toBeGreaterThan(stepIndex(steps(), (step) => step.name === "The database suite, this shard's files"));
      expect(steps()[save]?.with).toEqual({ path: 'node_modules/.vite/vitest', key: '${{ steps.vitest-cache.outputs.cache-primary-key }}' });
    });

    it('prints the files the shard ran, sorted, with their count and the list’s SHA-256, to the log and the summary, whatever the suite’s result (CI-04)', () => {
      const step = stepNamed(steps(), 'Files this shard ran');
      expect(step.if).toBe('${{ !cancelled() }}');
      expect(stepIndex(steps(), (candidate) => candidate.name === 'Files this shard ran')).toBe(stepIndex(steps(), (candidate) => candidate.name === "The database suite, this shard's files") + 1);
      const dir = mkdtempSync(path.join(scratch, 'shard-'));
      const workspace = '/home/runner/work/PhysicalTherapy/PhysicalTherapy';
      const file = (name: string, seconds: number) => ({ name: `${workspace}/${name}`, startTime: 1_000, endTime: 1_000 + seconds * 1_000 });
      writeFileSync(path.join(dir, 'db-results.json'), JSON.stringify({ testResults: [file('packages/db/src/catalog.db.test.ts', 3), file('apps/web/src/lib/routes/route-tests/route-tests.4.db.test.ts', 61), file('apps/worker/src/screening/consumer-lease.db.test.ts', 190)] }));
      writeFileSync(path.join(dir, 'summary.md'), '');
      // The runner's sha256sum, or a stand-in on a host that has only shasum.
      const tools = path.join(dir, 'bin');
      const shim = spawnSync('/bin/sh', ['-c', 'command -v sha256sum'], { encoding: 'utf8' }).stdout.trim() === '';
      if (shim) {
        mkdirSync(tools);
        writeFileSync(path.join(tools, 'sha256sum'), '#!/bin/sh\nexec shasum -a 256 "$@"\n', { mode: 0o755 });
      }
      const PATH = shim ? `${tools}:${process.env.PATH ?? '/usr/bin:/bin'}` : (process.env.PATH ?? '/usr/bin:/bin');
      // The paths sorted bytewise (LC_ALL=C), whatever the host's locale, so the list and its hash are the same everywhere.
      expect(step.run).toContain('| LC_ALL=C sort >');
      const result = runScript(step.run ?? '', { PATH, LANG: 'en_US.UTF-8', RUNNER_TEMP: dir, GITHUB_WORKSPACE: workspace, GITHUB_STEP_SUMMARY: path.join(dir, 'summary.md'), SHARD: '2/4' }, dir);
      expect(result.status).toBe(0);
      const list = ['apps/web/src/lib/routes/route-tests/route-tests.4.db.test.ts', 'apps/worker/src/screening/consumer-lease.db.test.ts', 'packages/db/src/catalog.db.test.ts'];
      const sha = createHash('sha256').update(`${list.join('\n')}\n`).digest('hex');
      for (const text of [result.output, readFileSync(path.join(dir, 'summary.md'), 'utf8')]) {
        expect(text).toContain(`### Files db (2/4) ran: 3, list SHA-256 ${sha}\n\n\`\`\`\n${list.join('\n')}\n\`\`\``);
        expect(text).toContain('190\tapps/worker/src/screening/consumer-lease.db.test.ts\n61\tapps/web/src/lib/routes/route-tests/route-tests.4.db.test.ts\n3\tpackages/db/src/catalog.db.test.ts');
      }
      // No results at all fails the shard rather than show an empty list.
      rmSync(path.join(dir, 'db-results.json'));
      const none = runScript(step.run ?? '', { PATH, RUNNER_TEMP: dir, GITHUB_WORKSPACE: workspace, GITHUB_STEP_SUMMARY: path.join(dir, 'summary.md'), SHARD: '2/4' }, dir);
      expect(none.status).toBe(1);
      expect(none.output).toContain('::error title=Files this shard ran::vitest wrote no results, so db (2/4) cannot show which files it ran.');
    });
  });

  describe('domain model (CI-09)', () => {
    const job = () => ciJob('domain-model');
    const steps = () => job().steps;

    it('migrates its own Postgres and runs CLAUDE.md’s command, --check --strict --require-approval, as its own check', () => {
      expect(Object.keys(job().services ?? {})).toEqual(['postgres']);
      expect(job().env).toEqual({ DATABASE_URL: 'postgres://postgres:test@localhost:5432/postgres' });
      const migrate = stepIndex(steps(), (step) => step.run === 'pnpm db:migrate');
      const check = stepIndex(steps(), (step) => step.run === 'pnpm db:domain-model --check --strict --require-approval');
      expect(migrate).toBeLessThan(check);
      expect(steps()[check]).toEqual({ run: 'pnpm db:domain-model --check --strict --require-approval' });
    });

    it('writes the changes since the last approved domain model to its summary and its log on a pull request, against the base branch, before the check can fail', () => {
      const summary = stepIndex(steps(), (step) => step.run?.includes('db:domain-model --summary-since') === true);
      const step = steps()[summary] as Step;
      expect(step.name).toBe('Changes since the last approved domain model');
      expect(summary).toBe(stepIndex(steps(), (candidate) => candidate.run === 'pnpm install --frozen-lockfile') + 1);
      expect(summary).toBeLessThan(stepIndex(steps(), (candidate) => candidate.run === 'pnpm db:migrate'));
      expect(step.if).toBe("${{ github.event_name == 'pull_request' }}");
      // The base branch by its name from the environment, never pasted into the script.
      expect(step.env).toEqual({ BASE_REF: '${{ github.base_ref }}' });
      expect(step.run).toContain('pnpm -s db:domain-model --summary-since "origin/$BASE_REF" | tee -a "$GITHUB_STEP_SUMMARY"');
      expect(step.run).not.toContain('${{');
      // It needs the base branch's history, which the checkout fetches whole.
      expect(steps()[0]).toEqual({ uses: PINNED.checkout, with: { 'fetch-depth': 0, 'persist-credentials': false } });
    });

    it('leaves no approval case in the database suite, which keeps the drift case', () => {
      const suite = readFileSync(path.join(repositoryRoot, 'packages/db/src/domain-model/domain-model.db.test.ts'), 'utf8');
      expect(suite).toContain("it('matches the schema a fresh database migrates to, every divergence explained and every table in an area'");
      expect(suite).not.toMatch(/documentApprovalProblems|readApprovers|approver list/);
      expect([...suite.matchAll(/\bit\(/g)]).toHaveLength(1);
    });
  });

  describe('build and e2e (CI-06)', () => {
    it('builds the web app and the worker once, stamps the web build with its commit and keeps it for the shards, replacing it on a re-run, then diffs the stacks', () => {
      const steps = ciJob('build').steps;
      const build = stepIndex(steps, (step) => step.run === 'pnpm build');
      const keep = stepIndex(steps, (step) => step.name === 'Keep the web build for the e2e shards');
      const upload = stepIndex(steps, (step) => usesAction(step, 'actions/upload-artifact'));
      const diff = stepIndex(steps, (step) => step.run === 'pnpm cdk:diff');
      expect([build < keep, keep < upload, upload < diff]).toEqual([true, true, true]);
      expect(steps[keep]?.run).toContain('git rev-parse HEAD > apps/web/.next/BUILD_COMMIT');
      expect(steps[keep]?.run).toContain('tar -C apps/web -cf - .next/standalone .next/static .next/BUILD_COMMIT | gzip -1 > "$RUNNER_TEMP/web-build.tar.gz"');
      expect(steps[upload]?.with).toEqual({ name: 'web-build', path: '${{ runner.temp }}/web-build.tar.gz', 'if-no-files-found': 'error', 'compression-level': 0, 'retention-days': 1, overwrite: true });
      expect(steps[diff]?.if).toBe("${{ !cancelled() && steps.install.outcome == 'success' }}");
      // The build job builds with no e2e setting, so the journeys run the production build that ships.
      expect(JSON.stringify(ciJob('build'))).not.toMatch(/E2E_|TP_ALLOW_LOCAL_PROVIDERS/);
    });

    it('runs the journeys in two shards, three on a private repository, each on its own Postgres over the build job’s artifact', () => {
      const job = ciJob('e2e');
      expect(job.needs).toBe('build');
      expect(shardWidths(job.strategy?.matrix)).toEqual({ public: [1, 2], private: [1, 2, 3] });
      expect(job.strategy?.['fail-fast']).toBe(false);
      expect(Object.keys(job.services ?? {})).toEqual(['postgres']);
      const steps = job.steps;
      const chromium = stepIndex(steps, (step) => step.run === 'pnpm --filter @tp/web exec playwright install --with-deps chromium');
      const download = stepIndex(steps, (step) => usesAction(step, 'actions/download-artifact'));
      const unpack = stepIndex(steps, (step) => step.run === 'tar -C apps/web -xzf "$RUNNER_TEMP/web-build/web-build.tar.gz"');
      const e2e = stepIndex(steps, (step) => step.name === "The end-to-end journeys, this shard's");
      expect([chromium < e2e, download < unpack, unpack < e2e]).toEqual([true, true, true]);
      expect(steps[download]?.with).toEqual({ name: 'web-build', path: '${{ runner.temp }}/web-build' });
      expect(steps[e2e]?.env).toEqual({ E2E_PREBUILT: '1', SHARD: '${{ matrix.shard }}/${{ strategy.job-total }}' });
      expect(steps[e2e]?.run).toBe('pnpm test:e2e --shard="$SHARD"');
    });

    it('starts the shards’ web server on the downloaded build only when its stamp names this commit, and fails a run on a test that passed only on its retry, naming it (CI-07)', () => {
      const config = readFileSync(path.join(repositoryRoot, 'apps/web/playwright.config.ts'), 'utf8');
      // E2E_PREBUILT: the stamp check in place of a second build (apps/web/scripts/build-stamp.ts refuses another commit's).
      expect(config).toContain('E2E_PREBUILT');
      expect(config).toContain('scripts/build-stamp.ts --expect');
      // The stamp's verdict, a pass included, reaches the shard's log: the stamp prints it to stderr, which the web
      // server keeps as [WebServer] lines (apps/web/scripts/build-stamp.test.ts runs both).
      expect(config).toContain("stdout: 'ignore',\n    stderr: 'pipe',");
      expect(readFileSync(path.join(repositoryRoot, 'apps/web/scripts/build-stamp.ts'), 'utf8')).not.toContain('process.stdout');
      // One retry keeps the first attempt's trace and the "flaky" label; the flake still fails the run, and the github
      // reporter names it on the pull request.
      expect(config).toContain('retries: process.env.CI ? 1 : 0');
      expect(config).toContain('failOnFlakyTests: Boolean(process.env.CI)');
      expect(config).toContain("trace: 'retain-on-failure'");
      expect(config).toMatch(/\[\s*'github'\s*\]/);
    });

    it('keeps each shard’s report, results and brand screenshots, failed runs included, under its own name', () => {
      const steps = ciJob('e2e').steps;
      const e2e = stepIndex(steps, (step) => step.name === "The end-to-end journeys, this shard's");
      const upload = stepIndex(steps, (step) => usesAction(step, 'actions/upload-artifact'));
      expect(upload).toBe(e2e + 1);
      const step = steps[upload] as Step;
      expect(step.if).toBe('always()');
      expect(step.with?.name).toBe('playwright-${{ matrix.shard }}');
      expect(step.with?.overwrite).toBe(true);
      // Playwright's defaults beside apps/web/playwright.config.ts (it names no outputFolder or outputDir), and the
      // brand journey's screenshots (BRAND_SCREENSHOTS_DIR's default, apps/web/e2e/brand.spec.ts).
      expect(String(step.with?.path).trim().split('\n')).toEqual(['apps/web/playwright-report/', 'apps/web/test-results/', 'brand-screenshots/']);
      const config = readFileSync(path.join(repositoryRoot, 'apps/web/playwright.config.ts'), 'utf8');
      expect(config).not.toMatch(/outputDir|outputFolder/);
      expect(readFileSync(path.join(repositoryRoot, 'apps/web/e2e/brand.spec.ts'), 'utf8')).toContain("path.resolve(import.meta.dirname, '../../../brand-screenshots')");
    });

    it('prints a failed shard’s screenshot diffs and actuals into its log, each under 300 KB as its path and its base64 on one line', () => {
      const steps = ciJob('e2e').steps;
      const print = stepIndex(steps, (step) => step.run?.includes('base64 -w 0') === true);
      expect(print).toBeGreaterThan(stepIndex(steps, (step) => usesAction(step, 'actions/upload-artifact')));
      const step = steps[print] as Step;
      expect(step.if).toBe('failure()');
      expect(step.run).toContain("find apps/web/test-results -type f \\( -name '*-diff.png' -o -name '*-actual.png' \\) -size -300k");
      expect(step.run).toContain('echo "$file $(base64 -w 0 "$file")"');
      // Run as GitHub runs it: a shard that left no results prints nothing and passes; one that did prints each picture.
      const dir = mkdtempSync(path.join(scratch, 'pictures-'));
      expect(runScript(step.run ?? '', {}, dir)).toEqual({ status: 0, output: '' });
      // The pictures need GNU base64's -w, as the runner has. On CI (CI set to anything but empty or "false", as
      // tools/test/ci-chromium.ts reads it) they run whatever, so a runner without it fails here rather than skip
      // them; elsewhere, where a BSD base64 has no -w, only the empty case runs.
      const onCi = process.env.CI !== undefined && process.env.CI !== '' && process.env.CI !== 'false';
      if (onCi || spawnSync('base64', ['-w', '0'], { input: '' }).status === 0) {
        mkdirSync(path.join(dir, 'apps/web/test-results/brand'), { recursive: true });
        writeFileSync(path.join(dir, 'apps/web/test-results/brand/header-diff.png'), 'png');
        writeFileSync(path.join(dir, 'apps/web/test-results/brand/header-expected.png'), 'png');
        expect(runScript(step.run ?? '', {}, dir)).toEqual({ status: 0, output: `apps/web/test-results/brand/header-diff.png ${Buffer.from('png').toString('base64')}\n` });
      }
    });
  });

  it('names every artifact once per run and lets a re-run of failed jobs replace it (upload-artifact v4 names are unique per run)', () => {
    const uploads = Object.entries(ci.jobs).flatMap(([id, job]) => job.steps.filter((step) => usesAction(step, 'actions/upload-artifact')).map((step) => ({ id, job, step })));
    expect(uploads.map(({ id }) => id)).toEqual(['build', 'e2e']);
    for (const { id, job, step } of uploads) {
      expect(step.with?.overwrite, id).toBe(true);
      // A matrix job's artifact carries its shard, so no two of its jobs write one name.
      if (job.strategy?.matrix !== undefined) expect(String(step.with?.name), id).toContain('${{ matrix.shard }}');
    }
  });

  it('builds and scans both images in one job, failing on HIGH or CRITICAL, the worker whatever the web image did', () => {
    const steps = ciJob('images').steps;
    const builds = steps.filter((step) => usesAction(step, 'docker/build-push-action'));
    expect(builds.map((step) => [step.with?.file, step.with?.load, step.with?.push, step.with?.tags])).toEqual([
      ['apps/web/Dockerfile', true, false, 'tp-web:scan'],
      ['apps/worker/Dockerfile', true, false, 'tp-worker:scan'],
    ]);
    const scans = steps.filter(isScan);
    expect(scans.map((step) => [step.with?.['image-ref'], step.with?.severity, step.with?.['ignore-unfixed']])).toEqual([
      ['tp-web:scan', 'HIGH,CRITICAL', true],
      ['tp-worker:scan', 'HIGH,CRITICAL', true],
    ]);
    expect(steps.indexOf(scans[0] as Step)).toBe(steps.indexOf(builds[0] as Step) + 1);
    expect(steps.indexOf(scans[1] as Step)).toBe(steps.indexOf(builds[1] as Step) + 1);
    expect(builds[1]?.if).toBe('${{ !cancelled() }}');
    expect(builds[1]?.id).toBe('worker');
    expect(scans[1]?.if).toBe("${{ !cancelled() && steps.worker.outcome == 'success' }}");
    // Each verdict is made from the vulnerability database this run downloads, never one another run cached (the
    // action caches it by default, and a push run's copy would be every pull request's).
    expect(scans.map((step) => step.with?.cache)).toEqual([false, false]);
    // And kept outside the workspace: the worker image is built after the web scan from the checkout (`context: .`,
    // whose Dockerfile copies it whole), and the action's default, the workspace's .cache/trivy, put the database in
    // that context (1.63 GB sent to the worker's build in run 40166129200, against the checkout's 16 MB).
    expect(builds.map((step) => step.with?.context)).toEqual(['.', '.']);
    expect(scans.map((step) => step.with?.['cache-dir'])).toEqual(['${{ runner.temp }}/trivy', '${{ runner.temp }}/trivy']);
    expect(existsSync(path.join(WORKFLOWS, 'supply-chain.yml'))).toBe(false);
  });

  it('checks production licenses against the allowlist on every pull request', () => {
    expect(ciJob('static').steps.some((step) => step.run === 'pnpm licenses:check')).toBe(true);
  });

  it('installs Playwright’s own Chromium, with its system libraries, wherever vitest or the journeys run, so the printing tests run and the brand baselines compare under the build that made them', () => {
    for (const id of ['unit', 'db', 'e2e']) {
      const steps = ciJob(id).steps;
      const install = stepIndex(steps, (step) => step.run === 'pnpm --filter @tp/web exec playwright install --with-deps chromium');
      expect(install, id).toBeGreaterThan(stepIndex(steps, (step) => step.run === 'pnpm install --frozen-lockfile'));
      // The browsers from the cache, keyed by the builds this Playwright pins, so the install fetches only the system
      // libraries on a hit, and installs the pinned builds on a miss or a stale entry.
      expect(steps[install - 1], id).toEqual({ name: "Restore Playwright's browsers", id: 'browsers', uses: PINNED.cacheRestore, with: { path: '~/.cache/ms-playwright', key: `playwright-v1-\${{ runner.os }}-\${{ hashFiles('${BROWSERS_JSON}') }}` } });
    }
    // Saved once a run, by the unit job, on a miss: a hit is never saved again, and no other job writes the key.
    const unit = ciJob('unit').steps;
    const save = unit.findIndex((step) => usesAction(step, 'actions/cache/save'));
    expect(unit[save - 1]?.run).toBe('pnpm --filter @tp/web exec playwright install --with-deps chromium');
    expect(unit[save]).toEqual({ name: "Save Playwright's browsers", if: "${{ steps.browsers.outputs.cache-hit != 'true' }}", uses: PINNED.cacheSave, with: { path: '~/.cache/ms-playwright', key: '${{ steps.browsers.outputs.cache-primary-key }}' } });
    expect(['db', 'e2e'].flatMap((id) => ciJob(id).steps.filter((step) => step.with?.path === '~/.cache/ms-playwright' && !usesAction(step, 'actions/cache/restore')))).toEqual([]);
    // The key's file is the one playwright-core this lockfile installs: it names the browser builds the install fetches.
    const store = path.join(repositoryRoot, 'node_modules/.pnpm');
    const cores = readdirSync(store).filter((name) => name.startsWith('playwright-core@') && existsSync(path.join(store, name, 'node_modules/playwright-core/browsers.json')));
    expect(cores).toEqual([`playwright-core@${(JSON.parse(readFileSync(path.join(repositoryRoot, 'apps/web/node_modules/@playwright/test/package.json'), 'utf8')) as { version: string }).version}`]);
    // The config takes that Chromium wherever it is installed, and Google Chrome only where it is not (docs/adr/0058).
    const config = readFileSync(path.join(repositoryRoot, 'apps/web/playwright.config.ts'), 'utf8');
    expect(config).toContain('const bundledChromium = existsSync(chromium.executablePath());');
    expect(config).toContain("...(bundledChromium ? {} : { channel: 'chrome' })");
    // The baselines the brand journey compares are committed for that browser on Linux.
    for (const name of ['header-1280', 'header-390', 'header-lockup-1280', 'header-lockup-390', 'report-cover-with-seal', 'report-cover-without-seal', 'report-cover-top']) {
      expect(existsSync(path.join(repositoryRoot, 'apps/web/e2e/brand.spec.ts-snapshots', `${name}-chromium-linux.png`)), name).toBe(true);
    }
  });
});

describe('the release, capacity, ci, content-calendar and release-capacity workflows\' actions (the review of 2026-10-22; docs/adr/0066, Part 1; docs/adr/0071)', () => {
  it('pin every action to a full commit SHA with its version beside it, so no moved tag runs in a job that pushes images, writes the report or decides a required check', () => {
    for (const name of ['release.yml', 'screening-capacity.yml', 'ci.yml', 'content-calendar.yml', 'release-capacity.yml']) {
      const lines = readFileSync(path.join(repositoryRoot, '.github/workflows', name), 'utf8')
        .split('\n')
        .filter((line) => /^\s*(?:-\s+)?uses:/.test(line));
      expect(lines.length, name).toBeGreaterThan(0);
      for (const line of lines) {
        expect(line, `${name}: ${line.trim()}`).toMatch(/uses: [\w./-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/);
      }
    }
    const pinned = new Set(Object.values(PINNED));
    for (const name of ['release.yml', 'screening-capacity.yml', 'ci.yml', 'content-calendar.yml', 'release-capacity.yml']) {
      const used = [...readFileSync(path.join(repositoryRoot, '.github/workflows', name), 'utf8').matchAll(/uses: ([\w./-]+@[0-9a-f]{40})/g)].map((match) => match[1] ?? '');
      expect(used.filter((ref) => !ref.startsWith('aquasecurity/trivy-action@') && !pinned.has(ref as (typeof PINNED)[keyof typeof PINNED])), name).toEqual([]);
    }
  });
});

describe('approval-of-record (docs/adr/0063)', () => {
  const file = readFileSync(path.join(repositoryRoot, '.github/workflows/approval-of-record.yml'), 'utf8');
  const parsed = parse(file) as Workflow & { permissions?: unknown; jobs: Record<string, { 'timeout-minutes'?: number }> };

  it('runs on each pull request event and each review, so a review re-runs it', () => {
    expect(parsed.on).toEqual({
      pull_request: { types: ['opened', 'synchronize', 'reopened', 'edited', 'ready_for_review'] },
      pull_request_review: { types: ['submitted', 'edited', 'dismissed'] },
    });
    // Its job is the required check the ruleset names (docs/runbooks/github-governance.md, step 4).
    expect(Object.keys(parsed.jobs)).toEqual(['approval-of-record']);
  });

  it('reads with a read-only token, installs nothing and runs the decision on Node 24 alone', () => {
    expect(parsed.permissions).toEqual({ contents: 'read', 'pull-requests': 'read' });
    const steps = parsed.jobs['approval-of-record']?.steps ?? [];
    expect(steps.map((step) => step.uses ?? step.run)).toEqual(['actions/checkout@v4', 'actions/setup-node@v4', 'node tools/approval-of-record/approval-of-record.ts']);
    expect(steps[0]?.with).toEqual({ 'persist-credentials': false });
    expect(steps[1]?.with).toEqual({ 'node-version': 24 });
    expect((steps[2] as Step & { env?: Record<string, string> }).env).toEqual({
      GITHUB_TOKEN: '${{ github.token }}',
      APPROVAL_REVIEW_REQUIRED: '${{ vars.APPROVAL_REVIEW_REQUIRED }}',
    });
    // No secret but the workflow's own token, and no step that installs or builds anything.
    expect(file).not.toMatch(/secrets\./);
    expect(file).not.toMatch(/pnpm|npm (?:ci|install)|pull_request_target/);
    expect(parsed.jobs['approval-of-record']?.['timeout-minutes']).toBe(5);
    expect(existsSync(path.join(repositoryRoot, 'tools/approval-of-record/approval-of-record.ts'))).toBe(true);
  });

  // actionlint where it is installed (or ACTIONLINT names it); the YAML of every workflow is parsed above either way.
  const actionlint = process.env.ACTIONLINT ?? spawnSync('/bin/sh', ['-c', 'command -v actionlint'], { encoding: 'utf8' }).stdout.trim();
  it.runIf(actionlint !== '')('every workflow passes actionlint', () => {
    const files = readdirSync(path.join(repositoryRoot, '.github/workflows')).map((name) => path.join(repositoryRoot, '.github/workflows', name));
    const result = spawnSync(actionlint, ['-shellcheck=', '-pyflakes=', ...files], { encoding: 'utf8' });
    expect(result.error).toBeUndefined();
    expect(result.stdout + result.stderr).toBe('');
    expect(result.status).toBe(0);
  });
});

describe('mutation testing (docs/adr/0066, Part 4; CI-15 to CI-17)', () => {
  type MutationStep = Step & { readonly id?: string; readonly if?: string; readonly env?: Record<string, string> };
  interface MutationJob {
    readonly name?: string;
    readonly needs?: string | readonly string[];
    readonly if?: string;
    readonly 'timeout-minutes'?: number;
    readonly outputs?: Record<string, string>;
    readonly env?: Record<string, string>;
    readonly strategy?: { readonly 'fail-fast'?: boolean; readonly matrix?: Record<string, unknown> };
    readonly steps: readonly MutationStep[];
  }
  const parsed = parse(readFileSync(path.join(repositoryRoot, '.github/workflows/mutation.yml'), 'utf8')) as {
    on: unknown;
    permissions?: unknown;
    concurrency?: { group?: string; 'cancel-in-progress'?: unknown };
    jobs: Record<string, MutationJob>;
  };
  const job = (name: string): MutationJob => {
    const found = parsed.jobs[name];
    if (found === undefined) throw new Error(`mutation.yml has no ${name} job`);
    return found;
  };
  const runs = (steps: readonly MutationStep[]) => steps.map((step) => step.run ?? step.uses ?? '');

  it('runs on every push to the build branch, every pull request on its default types, weekly and on request, with a read-only token', () => {
    expect(parsed.on).toEqual({ push: { branches: ['claude/build-platform'] }, pull_request: null, schedule: [{ cron: '23 5 * * 1' }], workflow_dispatch: null });
    expect(parsed.permissions).toEqual({ contents: 'read' });
    // No label decides any more: path-affected runs replace the money label.
    expect(readFileSync(path.join(repositoryRoot, '.github/workflows/mutation.yml'), 'utf8')).not.toMatch(/labels|labeled/);
    expect(Object.keys(parsed.jobs)).toEqual(['changes', 'stryker', 'mutation']);
    // ci.yml holds no Stryker run: mutation keeps its own required gate.
    const ci = workflow('ci.yml');
    expect(Object.values(ci.jobs).flatMap((ciJob) => ciJob.steps).filter((step) => step.run?.includes('stryker') === true)).toEqual([]);
  });

  it('groups its runs under its own name, cancelling only a pull request’s older run', () => {
    expect(parsed.concurrency).toEqual({
      group: "${{ github.workflow }}-${{ github.event_name == 'pull_request' && format('pr-{0}', github.event.pull_request.number) || github.sha }}",
      'cancel-in-progress': "${{ github.event_name == 'pull_request' }}",
    });
    expect(parsed.concurrency?.group?.startsWith('${{ github.workflow }}-')).toBe(true);
  });

  it('decides what to measure in its changes job, from the merge base on a pull request, and outputs the shard matrix', () => {
    const changes = job('changes');
    expect(changes['timeout-minutes']).toBe(5);
    expect(changes.outputs).toEqual({ any: '${{ steps.affected.outputs.any }}', packages: '${{ steps.affected.outputs.packages }}', shards: '${{ steps.affected.outputs.shards }}' });
    expect(changes.steps[0]?.with).toEqual({ 'persist-credentials': false, 'fetch-depth': 0 });
    const affected = changes.steps.find((step) => step.id === 'affected');
    expect(affected?.run).toBe('pnpm -s exec tsx tools/stryker/affected.ts --event "$EVENT" --base "$BASE" --github-output "$GITHUB_OUTPUT" --summary "$GITHUB_STEP_SUMMARY"');
    expect(affected?.env).toEqual({ EVENT: '${{ github.event_name }}', BASE: '${{ github.event.pull_request.base.sha }}' });
    expect(existsSync(path.join(repositoryRoot, 'tools/stryker/affected.ts'))).toBe(true);
  });

  it('runs every selected shard, the canary first, then the shard in full, and uploads its reports overwriting a re-run’s', () => {
    const stryker = job('stryker');
    expect(stryker.name).toBe('stryker (${{ matrix.shard }})');
    expect(stryker.needs).toBe('changes');
    // An empty matrix is an error, so the job is skipped instead when nothing is affected.
    expect(stryker.if).toBe("needs.changes.outputs.any == 'true'");
    expect(stryker['timeout-minutes']).toBe(30);
    expect(stryker.strategy).toEqual({ 'fail-fast': false, matrix: { shard: '${{ fromJSON(needs.changes.outputs.shards) }}' } });
    expect(stryker.env).toEqual({ TP_MUTATION_SHARD: '${{ matrix.shard }}' });
    const steps = stryker.steps;
    const install = stepIndex(steps, (step) => step.run === 'pnpm install --frozen-lockfile');
    const canary = stepIndex(steps, (step) => step.name === 'The canary');
    const shard = stepIndex(steps, (step) => step.name === 'The shard');
    expect(steps[canary]?.run).toBe('pnpm stryker run tools/stryker/canary/stryker.config.mjs\npnpm -s exec tsx tools/stryker/canary/verdict.ts --shard "$TP_MUTATION_SHARD"\n');
    expect(steps[shard]?.run).toBe('pnpm -s exec tsx tools/stryker/shards.ts "$TP_MUTATION_SHARD"');
    // The canary is the first step after the install, and no Stryker run comes before it.
    expect(canary).toBe(install + 1);
    expect(runs(steps.slice(0, canary)).filter((run) => run.includes('stryker'))).toEqual([]);
    expect(canary).toBeLessThan(shard);
    // Its verdicts, the shard's scores and survivors, go to the log whatever the shard did, as long as it was not cancelled.
    const view = stepIndex(steps, (step) => step.run === 'pnpm -s exec tsx tools/stryker/gate.ts reports/mutation --shard "$TP_MUTATION_SHARD"');
    expect(steps[view]?.if).toBe('${{ !cancelled() }}');
    const upload = stepIndex(steps, (step) => step.uses === PINNED.uploadArtifact);
    expect(upload).toBeGreaterThan(shard);
    expect(steps[upload]?.if).toBe('${{ !cancelled() }}');
    expect(steps[upload]?.with).toEqual({ name: 'mutation-${{ matrix.shard }}', path: 'reports/mutation/', 'if-no-files-found': 'error', overwrite: true, 'retention-days': 14 });
  });

  it('gates every run in its mutation job: always run, failing on a failed, cancelled or skipped need, then on the gate’s rules', () => {
    const mutation = job('mutation');
    expect(mutation.name).toBe('mutation');
    expect(mutation.needs).toEqual(['changes', 'stryker']);
    expect(mutation.if).toBe('${{ always() }}');
    expect(mutation['timeout-minutes']).toBe(10);
    expect(mutation.strategy).toBeUndefined();
    const needs = mutation.steps[0];
    expect(needs?.env).toEqual({
      CHANGES: '${{ needs.changes.result }}',
      STRYKER: '${{ needs.stryker.result }}',
      ANY: '${{ needs.changes.outputs.any }}',
      PACKAGES: '${{ needs.changes.outputs.packages }}',
      SHARDS: '${{ needs.changes.outputs.shards }}',
    });
    for (const text of ['if [ "$CHANGES" != success ]; then', 'case "$ANY" in', 'if [ "$STRYKER" != skipped ]; then', 'No money path changed: no mutation run.', 'if [ "$STRYKER" != success ]; then']) expect(needs?.run).toContain(text);
    expect(needs?.run?.match(/exit 1/g)).toHaveLength(7);
    for (const step of mutation.steps.slice(1)) expect(step.if, step.name ?? step.uses ?? step.run).toBe("steps.needs.outputs.run == 'true'");
    const download = stepIndex(mutation.steps, (step) => step.uses === PINNED.downloadArtifact);
    expect(mutation.steps[download]?.with).toEqual({ pattern: 'mutation-*', path: 'reports/mutation', 'merge-multiple': true });
    const gate = stepIndex(mutation.steps, (step) => step.name === 'The gate');
    expect(gate).toBeGreaterThan(download);
    expect(mutation.steps[gate]?.run).toBe('pnpm -s exec tsx tools/stryker/gate.ts reports/mutation --expected "$SHARDS" --summary "$GITHUB_STEP_SUMMARY"');
    expect(mutation.steps[gate]?.env).toEqual({ SHARDS: '${{ needs.changes.outputs.shards }}' });
  });

  // The step's own script, run with bash -e as the runner runs it, its outputs and summary in temporary files bash
  // makes, the outputs printed after a marker.
  const guard = (env: { CHANGES?: string; STRYKER?: string; ANY?: string; PACKAGES?: string; SHARDS?: string }) => {
    const wrapper = 'out=$(mktemp); sum=$(mktemp); status=0; GITHUB_OUTPUT="$out" GITHUB_STEP_SUMMARY="$sum" bash -e -c "$1" || status=$?; printf "\\n--outputs--\\n%s" "$(cat "$out")"; rm -f "$out" "$sum"; exit "$status"';
    const ran = spawnSync('bash', ['-c', wrapper, 'guard', job('mutation').steps[0]?.run ?? ''], { encoding: 'utf8', env: { PATH: process.env.PATH ?? '/usr/bin:/bin', ...env } });
    const [log = '', output = ''] = ran.stdout.split('\n--outputs--\n');
    return { status: ran.status, output, log: log + ran.stderr };
  };
  const affectedRun = { CHANGES: 'success', ANY: 'true', PACKAGES: '["money","ledger"]', SHARDS: '["money-ledger"]', STRYKER: 'success' };
  const quietRun = { CHANGES: 'success', ANY: 'false', PACKAGES: '[]', SHARDS: '[]', STRYKER: 'skipped' };

  it('fails closed on any verdict of the changes job but the two it writes, and on shards that do not match it', () => {
    expect(guard(affectedRun)).toMatchObject({ status: 0, output: 'run=true' });
    expect(guard(quietRun)).toMatchObject({ status: 0, output: 'run=false' });
    for (const [why, env] of [
      ['the changes job failed', { ...affectedRun, CHANGES: 'failure' }],
      ['the changes job was cancelled', { ...quietRun, CHANGES: 'cancelled' }],
      ['no any output', { ...quietRun, ANY: '' }],
      ['no outputs at all', { CHANGES: 'success', STRYKER: 'skipped' }],
      ['a garbled any', { ...affectedRun, ANY: 'True' }],
      ['nothing affected, yet shards', { ...quietRun, SHARDS: '["money-ledger"]' }],
      ['nothing affected, yet packages', { ...quietRun, PACKAGES: '["money"]' }],
      ['affected, with packages that are not a JSON array', { ...affectedRun, PACKAGES: 'money' }],
      ['nothing affected, yet a shard job ran', { ...quietRun, STRYKER: 'success' }],
      ['affected, with no shards', { ...affectedRun, SHARDS: '[]' }],
      ['affected, with no shards output', { ...affectedRun, SHARDS: '' }],
      ['affected, with shards that are not a JSON array', { ...affectedRun, SHARDS: 'money-ledger' }],
      ['affected, with no packages', { ...affectedRun, PACKAGES: '[]' }],
      ['affected, the shard jobs skipped', { ...affectedRun, STRYKER: 'skipped' }],
      ['affected, a shard job failed', { ...affectedRun, STRYKER: 'failure' }],
      ['affected, a shard job cancelled', { ...affectedRun, STRYKER: 'cancelled' }],
    ] as const) {
      const result = guard(env);
      expect(result.status, why).toBe(1);
      expect(result.output, why).toBe('');
      expect(result.log, why).toMatch(/::error::/);
    }
  });

  it('runs every job on one exact Node, the one tools/stryker/unicode.json’s equivalents were checked on', () => {
    const versions = Object.entries(parsed.jobs).map(([name, mutationJob]) => [name, mutationJob.steps.find((step) => step.uses === PINNED.setupNode)?.with?.['node-version']] as const);
    expect(versions.map(([name]) => name)).toEqual(['changes', 'stryker', 'mutation']);
    for (const [name, version] of versions) expect(version, name).toMatch(/^\d+\.\d+\.\d+$/);
    expect(new Set(versions.map(([, version]) => version)).size).toBe(1);
    const unicode = JSON.parse(readFileSync(path.join(repositoryRoot, 'tools/stryker/unicode.json'), 'utf8')) as { checkedOn: { node: string } };
    expect(versions[0]?.[1]).toBe(unicode.checkedOn.node);
  });

  it('pins every action to the release workflows’ SHAs and installs from the lockfile in every job that runs code', () => {
    const pinned = new Set<string>(Object.values(PINNED));
    for (const [name, mutationJob] of Object.entries(parsed.jobs)) {
      for (const step of mutationJob.steps) if (step.uses !== undefined) expect(pinned.has(step.uses), `${name}: ${step.uses}`).toBe(true);
      expect(mutationJob.steps.some((step) => step.uses === PINNED.checkout && step.with?.['persist-credentials'] === false), name).toBe(true);
      expect(runs(mutationJob.steps).filter((run) => run.startsWith('pnpm install')), name).toEqual(['pnpm install --frozen-lockfile']);
    }
  });

  it('scores each package with the mutate and test sets its configuration names', async () => {
    const { MUTATE, MUTATION_PACKAGES, PACKAGE_VARIABLE, SHARD_VARIABLE } = await import('../../stryker/base.mjs');
    const { TEST_SETS, default: mutationConfig } = await import('../../vitest.mutation.config');
    const saved = [process.env[PACKAGE_VARIABLE], process.env[SHARD_VARIABLE]] as const;
    delete process.env[SHARD_VARIABLE];
    try {
      for (const pkg of MUTATION_PACKAGES) {
        const config = ((await import(`../../stryker/${pkg}.config.mjs`)) as { default: { mutate?: string[]; vitest?: { configFile?: string }; testRunner?: string; coverageAnalysis?: string } }).default;
        expect(config.mutate, pkg).toEqual(MUTATE[pkg]);
        expect(config.vitest?.configFile, pkg).toBe('vitest.mutation.config.ts');
        expect([config.testRunner, config.coverageAnalysis], pkg).toEqual(['vitest', 'perTest']);
        process.env[PACKAGE_VARIABLE] = pkg;
        const resolved = (mutationConfig as unknown as (env: object) => { test: { include: string[] } })({});
        expect(resolved.test.include, pkg).toEqual(TEST_SETS[pkg]);
      }
    } finally {
      for (const [name, value] of [[PACKAGE_VARIABLE, saved[0]], [SHARD_VARIABLE, saved[1]]] as const) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });
});

describe('dependabot', () => {
  it('updates the workspace, the actions and both base images weekly, grouped, a few pull requests at a time', () => {
    const config = parse(readFileSync(path.join(repositoryRoot, '.github/dependabot.yml'), 'utf8')) as {
      updates: {
        'package-ecosystem': string;
        schedule: { interval: string };
        directory?: string;
        directories?: string[];
        'open-pull-requests-limit'?: number;
        groups?: Record<string, { 'update-types'?: string[]; patterns?: string[] }>;
      }[];
    };
    expect(config.updates.map((update) => [update['package-ecosystem'], update.schedule.interval])).toEqual([
      ['npm', 'weekly'],
      ['github-actions', 'weekly'],
      ['docker', 'weekly'],
    ]);
    expect(config.updates[2]?.directories).toEqual(['/apps/web', '/apps/worker']);
    // Each pull request runs ci.yml (about 10 minutes behind all green since docs/adr/0066, 35 before it) and, on a
    // watched path, the capacity gate: one a week for every action, one for both images.
    expect(config.updates.map((update) => update['open-pull-requests-limit'])).toEqual([5, 2, 2]);
    expect(config.updates[0]?.groups).toEqual({ 'minor-and-patch': { 'update-types': ['minor', 'patch'] } });
    expect(config.updates[1]?.groups).toEqual({ actions: { patterns: ['*'] } });
    expect(config.updates[2]?.groups).toEqual({ 'base-images': { patterns: ['*'] } });
  });
});

describe('job timeouts (CI-10)', () => {
  it('give every job of every workflow the timeout its table names, well under GitHub’s 360 minutes but where a ruling is pending', () => {
    const limits = Object.fromEntries(
      workflowFiles().map((file) => [file, Object.fromEntries(Object.entries(workflow(file).jobs).map(([name, job]) => [name, job['timeout-minutes'] ?? 360]))]),
    );
    expect(limits).toEqual({
      'approval-of-record.yml': { 'approval-of-record': 5 },
      // Each about three times its expected time (docs/adr/0066, Part 1); the gate's 5 for a job that only reads results.
      'ci.yml': { static: 15, lint: 15, unit: 20, db: 20, 'domain-model': 10, build: 15, e2e: 25, images: 20, 'all-green': 5 },
      // The daily calendar check and its one issues call (docs/adr/0071).
      'content-calendar.yml': { check: 15, notify: 5 },
      // The 2 GiB intake run, weekly and on request.
      'large-zip.yml': { 'large-zip': 45 },
      'mutation.yml': { changes: 5, stryker: 30, mutation: 10 },
      // The one job without a timeout: reconciliation-001 keeps publish-content.yml unchanged until the founder's ruling
      // on a standing exception for its pins, runner and timeout (F4 in the CI series' design; docs/adr/0066).
      'publish-content.yml': { publish: 360 },
      // The release's own table is held in its describe block above; S4 three times in the capacity job.
      'release.yml': { build: 60, capacity: 100, push: 30, report: 10 },
      // The weekly real-size test builds and loads the quarterly scale release 900110 before it measures (docs/adr/0071).
      'release-capacity.yml': { capacity: 180, notify: 5 },
      // Every pull request runs its path check and gate; one that touches a watched path also measures (Q8), S4 three
      // times since the founder's ruling of 2026-10-23.
      'screening-capacity.yml': { changes: 5, capacity: 100, gate: 5, notify: 5 },
    });
  });
});

describe('concurrency groups', () => {
  it('start with their own workflow’s name in every workflow, and no two workflows share a name', () => {
    expect(workflowFiles().flatMap((file) => concurrencyProblems(file, workflow(file)))).toEqual([]);
    const names = workflowFiles().map((file) => workflow(file).name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('refuse a group that could cancel another workflow’s runs, at the workflow’s level or a job’s', () => {
    const problems = (text: string) => concurrencyProblems('fixture.yml', parse(text) as Workflow);
    const job = 'jobs: { a: { runs-on: ubuntu-24.04, steps: [] } }';
    for (const own of [
      "name: ci\nconcurrency: { group: '${{ github.workflow }}-${{ github.ref }}' }",
      "name: screening-capacity\nconcurrency: { group: 'screening-capacity-${{ github.sha }}' }",
      'name: publish-content\nconcurrency: publish-content',
      'name: ci',
    ]) {
      expect(problems(`${own}\n${job}`), own).toEqual([]);
    }
    expect(problems(`name: mutation\nconcurrency: { group: '\${{ github.event.pull_request.number || github.ref }}' }\n${job}`)).toEqual([
      'fixture.yml the workflow: the group ${{ github.event.pull_request.number || github.ref }} starts with neither ${{ github.workflow }}- nor mutation-',
    ]);
    expect(problems(`name: mutation\nconcurrency: { group: 'ci-\${{ github.ref }}' }\n${job}`)).toHaveLength(1);
    expect(problems(`name: mutation\nconcurrency: { cancel-in-progress: true }\n${job}`)).toEqual(['fixture.yml the workflow: a concurrency with no group']);
    expect(problems("name: ci\njobs: { a: { runs-on: ubuntu-24.04, concurrency: 'deploy', steps: [] } }")).toEqual(['fixture.yml job a: the group deploy starts with neither ${{ github.workflow }}- nor ci-']);
    expect(problems("name: ci\njobs: { a: { runs-on: ubuntu-24.04, concurrency: { group: '${{ github.workflow }}${{ github.ref }}' }, steps: [] } }")).toHaveLength(1);
  });
});

describe('Chromium before vitest (CI-05)', () => {
  it('is installed in every job of every workflow before any step that runs vitest’s unit or db project', () => {
    expect(workflowFiles().flatMap((file) => chromiumProblems(file, workflow(file)))).toEqual([]);
  });

  it('is required before pnpm test, pnpm test:db and vitest itself, and not before golden, oracle, e2e or mutation runs', () => {
    const problems = (steps: string) => chromiumProblems('fixture.yml', parse(`name: fixture\non: push\njobs: { a: { runs-on: ubuntu-24.04, steps: [${steps}] } }`) as Workflow);
    const install = '{ run: pnpm --filter @tp/web exec playwright install --with-deps chromium }';
    for (const run of ['pnpm test', 'pnpm test && pnpm test:golden', 'pnpm db:migrate && pnpm test:db --shard=1/4', 'pnpm vitest run --project db apps/worker/src/intake/intake.large.db.test.ts', 'pnpm exec vitest run tools/test', 'pnpm run test']) {
      expect(problems(`{ run: '${run}' }`), run).toEqual([`fixture.yml a: "${run}" runs vitest's unit or db project with no Chromium installed before it`]);
      expect(problems(`${install}, { run: '${run}' }`), run).toEqual([]);
      expect(problems(`{ run: '${run}' }, ${install}`), `${run} before the install`).toHaveLength(1);
    }
    for (const run of ['pnpm test:golden', 'pnpm test:oracle', 'pnpm test:e2e --shard=1/2', 'pnpm stryker run', 'pnpm vitest run --project golden', 'pnpm -s vitest list --project db --filesOnly']) {
      expect(problems(`{ run: '${run}' }`), run).toEqual([]);
    }
    // The install of another browser, or without its system libraries, is not it.
    expect(problems("{ run: 'pnpm exec playwright install chromium' }, { run: 'pnpm test' }")).toHaveLength(1);
    expect(problems("{ run: 'pnpm exec playwright install --with-deps firefox' }, { run: 'pnpm test' }")).toHaveLength(1);
  });
});

describe('the required checks (docs/adr/0066; tools/required-checks.ts)', () => {
  it.each(REQUIRED_CHECKS.map((check) => [check.name, check]))('%s is a job of its workflow, reported on every pull request', (_, check) => {
    const parsed = workflow(check.workflow);
    const job = parsed.jobs[check.job];
    expect(job, `${check.workflow} has no job ${check.job}`).toBeDefined();
    // The name GitHub reports: the job's name, or its id when it has none.
    expect(job?.name ?? check.job).toBe(check.name);
    // On every pull request, with no path, branch or type filter that leaves one out, so it never waits forever.
    const on = parsed.on as Record<string, { types?: string[]; paths?: unknown; 'paths-ignore'?: unknown; branches?: unknown; 'branches-ignore'?: unknown } | null>;
    expect(Object.keys(on)).toContain('pull_request');
    const trigger = on.pull_request ?? {};
    expect([trigger.paths, trigger['paths-ignore'], trigger.branches, trigger['branches-ignore']]).toEqual([undefined, undefined, undefined, undefined]);
    for (const type of ['opened', 'synchronize', 'reopened']) expect(trigger.types ?? ['opened', 'synchronize', 'reopened'], type).toContain(type);
    // Never skipped by its own condition, which GitHub would count as passing.
    expect([undefined, '${{ always() }}']).toContain(job?.if);
    expect(job?.strategy?.matrix, 'a matrix job reports one check per value, never the name the ruleset requires').toBeUndefined();
  });
});

describe('the Postgres services', () => {
  it('start every job’s steps only once the server answers on TCP, in every workflow, so no step waits on its own', () => {
    const services = workflowFiles().flatMap((file) =>
      Object.entries(workflow(file).jobs).flatMap(([id, job]) => Object.entries(job.services ?? {}).map(([name, service]) => ({ where: `${file} ${id} ${name}`, service: service as { image?: string; options?: string } }))),
    );
    const postgres = services.filter(({ service }) => service.image?.startsWith('postgres:') === true);
    expect(postgres.map(({ where }) => where)).toEqual(['ci.yml db postgres', 'ci.yml domain-model postgres', 'ci.yml e2e postgres', 'large-zip.yml large-zip postgres']);
    // On TCP: the image's first-run setup serves only its Unix socket, where pg_isready would answer early.
    for (const { where, service } of postgres) {
      expect(service.options, where).toBe('--health-cmd "pg_isready -h localhost -U postgres" --health-interval 2s --health-timeout 5s --health-retries 30');
    }
    const loops = workflowFiles().flatMap((file) => Object.values(workflow(file).jobs).flatMap((job) => (job.steps ?? []).filter((step) => step.run?.includes('pg_isready') === true)));
    expect(loops).toEqual([]);
  });
});

describe('no job hides a failure from a required check (CI-01)', () => {
  const ownJob = new Map(REQUIRED_CHECKS.map((check) => [check.workflow, check.job]));
  /** Every job of ci.yml, whose gate needs them all, and each required check's own job elsewhere. */
  const scriptsHeld = (file: string) => (id: string) => file === 'ci.yml' || ownJob.get(file) === id;
  const fixture = (jobs: Record<string, unknown>): Workflow => ({ name: 'fixture', on: 'push', jobs }) as unknown as Workflow;
  const job = (fields: Record<string, unknown>) => ({ 'runs-on': 'ubuntu-24.04', steps: [{ run: 'pnpm test' }], ...fields });

  it('sets continue-on-error on no job or step of any workflow, and runs every script of ci.yml and of each required check’s job under bash with -e and pipefail, swallowing no failing command', () => {
    expect(workflowFiles().flatMap((file) => maskingProblems(file, workflow(file), scriptsHeld(file)))).toEqual([]);
  });

  it('refuses continue-on-error on a job or on a step, whatever its value, as the review’s two edits of ci.yml show', () => {
    const text = readFileSync(path.join(WORKFLOWS, 'ci.yml'), 'utf8');
    const lint = text.replace('  lint:\n    runs-on: ubuntu-24.04\n', '  lint:\n    runs-on: ubuntu-24.04\n    continue-on-error: true\n');
    const oracle = text.replace('      - run: pnpm test:oracle\n', '      - run: pnpm test:oracle\n        continue-on-error: true\n');
    expect([lint, oracle].map((edited) => edited === text)).toEqual([false, false]);
    expect(maskingProblems('ci.yml', parse(lint) as Workflow, scriptsHeld('ci.yml'))).toEqual(['ci.yml lint: continue-on-error on the job']);
    expect(maskingProblems('ci.yml', parse(oracle) as Workflow, scriptsHeld('ci.yml'))).toEqual([expect.stringMatching(/^ci\.yml static step \d+ \(pnpm test:oracle\): continue-on-error$/)]);
    for (const value of [true, false, '${{ matrix.experimental }}']) {
      expect(maskingProblems('fixture.yml', fixture({ a: job({ 'continue-on-error': value }) }), () => false), String(value)).toEqual(['fixture.yml a: continue-on-error on the job']);
      expect(maskingProblems('fixture.yml', fixture({ a: job({ steps: [{ run: 'pnpm test', 'continue-on-error': value }] }) }), () => false), String(value)).toEqual(['fixture.yml a step 1 (pnpm test): continue-on-error']);
    }
  });

  it('refuses, where it holds the scripts, a shell other than the workflow’s bash and a script that swallows a failing command', () => {
    const problems = (fields: Record<string, unknown>, held = true) => maskingProblems('fixture.yml', fixture({ a: job(fields) }), () => held);
    expect(problems({ steps: [{ run: 'pnpm test', shell: 'bash {0}' }] })).toEqual(['fixture.yml a step 1 (pnpm test): runs under bash {0}, not the workflow\'s bash']);
    expect(problems({ defaults: { run: { shell: 'sh' } } })).toEqual(['fixture.yml a: the job\'s shell is sh, not the workflow\'s bash']);
    for (const run of ['pnpm test || true', 'pnpm test ||true', 'pnpm test || :', '{ pnpm test || :; }', 'pnpm test || exit 0', 'set +e\npnpm test', 'set +eu\npnpm test', 'set +o errexit\npnpm test', 'set +o pipefail\npnpm test | tee log']) {
      expect(problems({ steps: [{ run }] }), run).toEqual([`fixture.yml a step 1 (${run.split('\n')[0] ?? ''}): swallows a failing command`]);
      // A job whose scripts no required check stands on keeps its own idioms (the capacity workflow's notify job).
      expect(problems({ steps: [{ run }] }, false), run).toEqual([]);
    }
    for (const run of ['pnpm test', 'pnpm test || exit 1', 'set -euo pipefail\npnpm test', 'if [ -d apps/web/test-results ]; then\n  find apps/web/test-results -type f\nfi', 'test -z "$(git status --porcelain)"', 'echo "a: b"']) {
      expect(problems({ steps: [{ run }] }), run).toEqual([]);
    }
  });
});

describe('the required checks’ names (docs/adr/0066; docs/runbooks/github-governance.md, step 4A)', () => {
  const all = () => Object.fromEntries(workflowFiles().map((file) => [file, workflow(file)]));
  const rogue = (jobs: Record<string, unknown>) => ({ ...all(), 'rogue.yml': { name: 'rogue', on: { pull_request: null }, jobs } as unknown as Workflow });

  it('are each reported by their own job alone, in every workflow: a ruleset matches a required check by name and source, never by workflow', () => {
    expect(requiredNameProblems(all())).toEqual([]);
  });

  it('refuse a second job named as a required check, by its name, by its id, or by a name its expressions could make one', () => {
    expect(requiredNameProblems(rogue({ x: { name: 'all green', steps: [] } }))).toEqual(['all green: rogue.yml x could report it too']);
    expect(requiredNameProblems(rogue({ mutation: { steps: [] } }))).toEqual(['mutation: rogue.yml mutation could report it too']);
    expect(requiredNameProblems(rogue({ x: { name: '${{ matrix.check }}', steps: [] } }))).toEqual(REQUIRED_CHECKS.map((check) => `${check.name}: rogue.yml x could report it too`));
    expect(requiredNameProblems(rogue({ x: { name: 'approval-of-${{ matrix.what }}', steps: [] } }))).toEqual(['approval-of-record: rogue.yml x could report it too']);
    // A name its expressions cannot make a required one, as ci.yml's shards are named.
    expect(requiredNameProblems(rogue({ x: { name: 'db (${{ matrix.shard }}/${{ strategy.job-total }})', steps: [] }, green: { steps: [] } }))).toEqual([]);
    // The check's own job renamed: no job reports it.
    const renamed = all();
    const ci = renamed['ci.yml'] as Workflow;
    renamed['ci.yml'] = { ...ci, jobs: { ...ci.jobs, 'all-green': { ...(ci.jobs['all-green'] as Job), name: 'all-green' } } };
    expect(requiredNameProblems(renamed)).toEqual(['all green: ci.yml all-green does not report it']);
  });
});

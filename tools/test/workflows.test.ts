import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { isDeepStrictEqual, stripVTControlCharacters } from 'node:util';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import ts from 'typescript';
import { LineCounter, isMap, isPair, isScalar, isSeq, parse, parseDocument } from 'yaml';

import { consistencyProblems, formProblems, parsePin } from '../check-action-pins/workflows';
import { readDockerfile } from '../check-toolchain/images';
import { MAX_FILE_BYTES, MAX_OPENED_PER_RUN } from '../content-calendar/render';
import { repositoryRoot } from '../content-files';
import { REQUIRED_CHECKS } from '../required-checks';
import { RELEASE_RUNNER } from '../screening-capacity/launch-check';
import { CONFIG, attestedArchive } from '../screening-capacity/test-support/image-archive';

/**
 * Many of these tests run a workflow step's script, git or a fake gh as GitHub would, hundreds of processes for the
 * notify tests, and the simulated Dependabot rewrite runs the whole file again in a vitest of its own while the rest of
 * the unit project runs, so their time grows with the runner's load. The content-calendar notify test took 0.9 s on an
 * idle 4-CPU container, 1.0 to 2.2 s in that nested run beside the full unit project, 1.8 s in CI's own run (job
 * 122241596089) and over 5 s in that job's nested run, which failed it at vitest's five-second default; on one CPU
 * shared with eight busy loops it took 7.4 s and the slowest other test 4.0 s. The worst one is now the 41-finding
 * notify test (ci-findings-transport): 1.3 to 1.5 s idle and 10.2 to 10.7 s on that loaded CPU. Forty-five seconds
 * holds four times the worst of those. A test's timeout cannot interrupt a synchronous child process, so each one the
 * file starts is bounded by the same forty-five seconds and killed after it: a hung script, git or actionlint fails its
 * test rather than holding it.
 */
const TEST_TIMEOUT_MS = 45_000;
vi.setConfig({ testTimeout: TEST_TIMEOUT_MS });

/**
 * The workflows: ci.yml's parallel jobs behind its one gate (docs/adr/0066, Part 1), with the image and licence gates
 * among them (docs/adr/0010), the release and capacity workflows (docs/adr/0062), the release's dry run, the action pin
 * policy and Postgres from the compose file (docs/adr/0066, Part 2), the approval of record (docs/adr/0063), and the
 * content calendar and the weekly real-size test (docs/adr/0071). No Docker daemon or GitHub runner exists here, so
 * these tests read the workflow files and check that each gate is wired where the plan needs it, in the right order,
 * and run under bash, on fixture input, the scripts whose logic decides what a run checks.
 *
 * Every read of .github/, the Dockerfiles and docker-compose.yml goes through one root, CI_ROOT: the directory CI_TREE
 * names when it is set, the repository otherwise. The simulated Dependabot rewrite below runs these tests on a copy
 * with every pin and digest replaced, and the failing-first proofs run them on the merge base's tree.
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

/** The tree whose CI files these tests judge: CI_TREE when set (a rewritten copy, or a base's archive), else the repository. */
const CI_ROOT = process.env.CI_TREE ?? repositoryRoot;

const WORKFLOWS = path.join(CI_ROOT, '.github/workflows');

function workflow(name: string): Workflow {
  return parse(readFileSync(path.join(WORKFLOWS, name), 'utf8')) as Workflow;
}

const workflowFiles = (): string[] =>
  readdirSync(WORKFLOWS)
    .filter((file) => /\.ya?ml$/.test(file))
    .sort();

/**
 * A step's `uses:` as these tests expect it: the action, at any full commit SHA. Which commit and which release is the pin
 * rules' to hold (tools/check-action-pins, below), never a behaviour test's, so a Dependabot pin bump changes no
 * assertion here.
 */
const escaped = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pinOf = (action: string): unknown => expect.stringMatching(new RegExp(`^${escaped(action)}@[0-9a-f]{40}$`));

/** The action a step names: its `uses:` before the @. */
const actionOf = (step: Step): string | undefined => step.uses?.split('@')[0];

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
 * A runs-on value that is one dispatch input or, on every other event (where `inputs` is empty), one label: the
 * capacity probe's form (the founder's F5). It resolves to the label and the input's options.
 */
const INPUT_OR_LABEL = /^\$\{\{\s*inputs\.([\w-]+)\s*\|\|\s*'([^'$]+)'\s*\}\}$/;

/** A workflow's workflow_dispatch inputs, by name, or undefined when it has none. */
function dispatchInputs(on: unknown): Record<string, unknown> | undefined {
  const dispatch = isRecord(on) ? on.workflow_dispatch : undefined;
  return isRecord(dispatch) && isRecord(dispatch.inputs) ? dispatch.inputs : undefined;
}

/**
 * The labels a runs-on value of the INPUT_OR_LABEL form can take: its label, then each option of its input, which must
 * be a choice input whose default is that label, so a dispatch with no choice runs where every other event does. Any
 * other input, or none, resolves to nothing.
 */
function inputLabels(runsOn: string, inputs: Record<string, unknown> | undefined): string[] | undefined {
  const match = INPUT_OR_LABEL.exec(runsOn);
  if (match === null) return undefined;
  const [, name = '', label = ''] = match;
  const input = inputs?.[name];
  if (!isRecord(input) || input.type !== 'choice' || !isList(input.options) || input.default !== label || !input.options.every((option) => typeof option === 'string')) return undefined;
  return [label, ...(input.options as string[])];
}

/**
 * Why a runs-on value does not name only pinned runner images (audit item #19). GitHub moves a -latest label to a new
 * image on its own schedule (ubuntu-latest to Ubuntu 26.04, announced for November 2026 in runner-images #14748), and can
 * move any hosted label without a version, so a job on one changes under a commit that changed nothing. runs-on is a
 * label, a list of labels or a group with its labels; an expression is followed only when it is one of the job's own
 * matrix values, and refused otherwise.
 */
function runnerProblems(runsOn: unknown, matrix?: unknown, inputs?: Record<string, unknown>): string[] {
  const shown = JSON.stringify(runsOn);
  if (runsOn === undefined || runsOn === null || (isList(runsOn) && runsOn.length === 0)) return ['names no runner label'];
  if (isList(runsOn)) return runsOn.flatMap((label) => runnerProblems(label, matrix, inputs));
  if (isRecord(runsOn)) return runnerProblems(runsOn.labels, matrix, inputs);
  if (typeof runsOn !== 'string') return [`${shown} is not a runner label`];
  const fromInput = inputLabels(runsOn, inputs);
  if (fromInput !== undefined) return fromInput.flatMap((value) => runnerProblems(value).map((problem) => `${shown}: ${problem}`));
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
function jobRunnerProblems(job: Job, workflows: readonly string[], inputs?: Record<string, unknown>): string[] {
  const called = /^\.\/\.github\/workflows\/([^/]+)$/.exec(job.uses ?? '')?.[1];
  return called !== undefined && workflows.includes(called) ? [] : runnerProblems(job['runs-on'], job.strategy?.matrix, inputs);
}

/** Every label a job's runs-on can take, in order and once each: a label, or the INPUT_OR_LABEL form's label and options. */
function jobLabels(runsOn: unknown, inputs: Record<string, unknown> | undefined): string[] {
  if (typeof runsOn !== 'string') return [JSON.stringify(runsOn)];
  return [...new Set(inputLabels(runsOn, inputs) ?? [runsOn])];
}

/**
 * The jobs F5 keeps on the release's runner (RELEASE_RUNNER.label, ubuntu-24.04): the release's capacity chain, by file
 * and job. Every other job of every workflow runs on ubuntu-26.04 (docs/adr/0066, Part 3). Exact, so a job added to a
 * release workflow is placed by an edit here.
 */
const RELEASE_CHAIN = ['release-dry-run.yml build', 'release-dry-run.yml push', 'release-dry-run.yml capacity', 'release.yml build', 'release.yml capacity', 'release.yml push', 'release.yml report', 'screening-capacity.yml capacity'];

/** The label every job outside RELEASE_CHAIN runs on. */
const RUNNER = 'ubuntu-26.04';

/** The step that installs Playwright's browsers, the one ci-chromium.ts names, and the id every such step carries. */
const BROWSER_INSTALL = 'pnpm --filter @tp/web exec playwright install --with-deps chromium';

/** The browser check that follows every browser install (tools/ci/browser-build.ts; docs/adr/0066, Part 3). */
const BROWSER_CHECK = 'node tools/ci/browser-build.ts';

/** The condition of every step after a browser check that runs whatever the check said, as long as the install succeeded. */
const AFTER_CHECK = "${{ !cancelled() && steps.browser-install.outcome == 'success' }}";

/** The apt cache steps' key, restore keys and path (tools/ci/apt-archives.sh; V3). */
const APT_RESTORE = {
  path: '${{ runner.temp }}/apt-archives',
  key: "apt-v1-${{ steps.runner-image.outputs.key }}-${{ hashFiles('node_modules/.pnpm/playwright-core@*/node_modules/playwright-core/browsers.json') }}",
  'restore-keys': 'apt-v1-${{ steps.runner-image.outputs.key }}-\napt-v1-${{ steps.runner-image.outputs.os }}-\n',
};
const APT_SAVE_IF = "${{ github.event_name != 'pull_request' && steps.apt.outputs.cache-hit != 'true' }}";

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
  const result = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', script], { cwd, encoding: 'utf8', env: { PATH: process.env.PATH ?? '/usr/bin:/bin', ...env }, timeout: TEST_TIMEOUT_MS, killSignal: 'SIGKILL' });
  expect(result.error).toBeUndefined();
  return { status: result.status, output: result.stdout + result.stderr };
}

/**
 * A stand-in docker in <dir>/bin, for the scripts that load an image and read its ID (release.yml's push check, ci.yml's
 * worker identity step): `info` names the containerd snapshotter on that store alone, `load` succeeds, `image inspect`
 * prints <dir>/id-<the image's name>, any other command exits 97, and every call is appended to <dir>/calls.
 */
function standInDocker(dir: string, store: 'classic' | 'containerd'): string {
  const bin = path.join(dir, 'bin');
  mkdirSync(bin);
  writeFileSync(
    path.join(bin, 'docker'),
    `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> '${dir}/calls'\ncase "$1" in\n  info) [ '${store}' = containerd ] && echo io.containerd.snapshotter.v1; exit 0 ;;\n  load) exit 0 ;;\n  image) ref="\${@: -1}"; name="\${ref##*/}"; cat '${dir}/id-'"\${name%%:*}" ;;\n  *) exit 97 ;;\nesac\n`,
    { mode: 0o755 },
  );
  return bin;
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

/** A step's script with each `$NAME`, `${NAME}` or `"$NAME"` its own env sets written out as that value. */
function expandedRun(step: Step): string {
  return (step.run ?? '').replace(/"?\$(?:\{(\w+)\}|(\w+))"?/g, (whole: string, braced: string | undefined, bare: string | undefined) => step.env?.[braced ?? bare ?? ''] ?? whole);
}

/** The tag a worker image's browser check names (`node tools/ci/browser-build.ts --image <tag>`), or undefined. */
function imageCheckTag(step: Step): string | undefined {
  return /^node tools\/ci\/browser-build\.ts --image (\S.*)$/.exec(expandedRun(step).trim())?.[1]?.trim();
}

/** Whether a step measures, saves, tags or pushes an image tag: what must wait for the image's browser check. */
function usesImageTag(step: Step, tag: string): boolean {
  return new RegExp(`(?:--worker-image|\\bdocker\\s+(?:image\\s+)?(?:save|tag|push))\\s+"?${escaped(tag)}"?(?=\\s|;|\\||$)`).test(expandedRun(step));
}

/**
 * Why a job's worker image could be measured, saved, tagged or pushed with a headless shell browser.json does not
 * record (test matrix CI-18; docs/adr/0066, Part 3). Every job that builds apps/worker/Dockerfile into a local tag (load,
 * or a type=docker archive it then loads) runs `node tools/ci/browser-build.ts --image <that tag>` once the tag exists
 * and before any step measures, saves, tags or pushes it; a build into no local tag, or in a script this rule cannot
 * follow, is refused. A scan may read the image first (the release's build scans, then checks, then saves): the browser
 * changes no scan. And every such check has actions/setup-node with Node 24 before it in its job, since it runs on
 * Node's own type stripping (the review's S6); the cache inputs stay each job's own, since the check imports only
 * Node's own modules. A matrix build whose Dockerfile is an expression counts as the worker's when its job names
 * apps/worker/Dockerfile anywhere (the release's naming step).
 */
function workerImageProblems(file: string, parsed: Workflow): string[] {
  return Object.entries(parsed.jobs).flatMap(([id, job]) => {
    const steps = job.steps ?? [];
    const where = `${file} ${id}`;
    const namesWorker = JSON.stringify(steps).includes('apps/worker/Dockerfile');
    return steps.flatMap((step, index) => {
      const problems: string[] = [];
      const run = step.run ?? '';
      if (/\bdocker\s+(?:buildx\s+)?build\b/.test(run) && run.includes('apps/worker/Dockerfile')) problems.push(`${where}: builds apps/worker/Dockerfile in a script, which this rule cannot follow`);
      const checked = imageCheckTag(step);
      if (checked !== undefined && !steps.slice(0, index).some((before) => usesAction(before, 'actions/setup-node') && String(before.with?.['node-version']) === '24')) {
        problems.push(`${where}: checks ${checked} with no actions/setup-node of Node 24 before it`);
      }
      const input = (name: string): string => {
        const value = step.with?.[name];
        return typeof value === 'string' ? value : '';
      };
      const dockerfile = input('file');
      if (!usesAction(step, 'docker/build-push-action') || !(dockerfile === 'apps/worker/Dockerfile' || (dockerfile.includes('${{') && namesWorker))) return problems;
      const tag = input('tags').trim();
      const archive = /(?:^|,)\s*type=docker\b/.test(input('outputs'));
      if (step.with?.load !== true && !archive) return [...problems, `${where}: builds apps/worker/Dockerfile into no local tag, so nothing checks its headless shell before it leaves the job`];
      const later = steps.slice(index + 1);
      const check = later.findIndex((candidate) => imageCheckTag(candidate) === tag);
      if (check === -1) return [...problems, `${where}: builds apps/worker/Dockerfile into ${tag} and never runs node tools/ci/browser-build.ts --image ${tag}`];
      const used = later.findIndex((candidate) => usesImageTag(candidate, tag));
      if (used !== -1 && used < check) problems.push(`${where}: "${later[used]?.name ?? later[used]?.run?.split('\n')[0] ?? ''}" uses ${tag} before its browser check`);
      if (archive && !later.slice(0, check).some((candidate) => /\bdocker\s+load\b/.test(candidate.run ?? ''))) problems.push(`${where}: checks ${tag} before its archive is loaded`);
      return problems;
    });
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
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, env: { ...process.env, ...env }, encoding: 'utf8', timeout: TEST_TIMEOUT_MS, killSignal: 'SIGKILL' }).trim();
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
    for (const file of readdirSync(WORKFLOWS)) {
      expect(() => workflow(file), file).not.toThrow();
    }
  });

  it('run every job on a pinned runner image: none on a -latest or other unversioned hosted label, none without runs-on, none on an expression this test cannot resolve (audit item #19)', () => {
    const files = readdirSync(WORKFLOWS).filter((file) => /\.ya?ml$/.test(file));
    expect(files).toContain('ci.yml');
    const problems = files.flatMap((file) => {
      const parsed = workflow(file);
      return Object.entries(parsed.jobs).flatMap(([name, job]) => jobRunnerProblems(job, files, dispatchInputs(parsed.on)).map((problem) => `${file} ${name}: ${problem}`));
    });
    expect(problems).toEqual([]);
  });

  it('run every job on GitHub’s free ubuntu-26.04 runner but the release’s capacity chain, which stays on the release’s runner, and name no larger runner’s label (the founder’s F5 and third ruling of 2026-10-23, “Free: time advisory”)', () => {
    const files = readdirSync(WORKFLOWS).filter((file) => /\.ya?ml$/.test(file));
    const runners = Object.fromEntries(
      files.flatMap((file) => {
        const parsed = workflow(file);
        return Object.entries(parsed.jobs).map(([name, job]) => [`${file} ${name}`, jobLabels(job['runs-on'], dispatchInputs(parsed.on))]);
      }),
    );
    // The release's runner is the launch check's (RELEASE_RUNNER), which accepts only the layout it gives.
    expect(RELEASE_RUNNER.label).toBe('ubuntu-24.04');
    expect(Object.keys(runners).filter((job) => RELEASE_CHAIN.includes(job)).sort()).toEqual([...RELEASE_CHAIN].sort());
    for (const job of RELEASE_CHAIN.filter((name) => name !== 'screening-capacity.yml capacity')) expect(runners[job], job).toEqual([RELEASE_RUNNER.label]);
    // The capacity workflow's measurement: the release's runner on every event, and ubuntu-26.04 only when a dispatch
    // names it, the advisory probe (F5).
    expect(runners['screening-capacity.yml capacity']).toEqual([RELEASE_RUNNER.label, RUNNER]);
    expect(workflow('screening-capacity.yml').jobs.capacity?.['runs-on']).toBe(`\${{ inputs.runner || '${RELEASE_RUNNER.label}' }}`);
    expect(Object.entries(runners).filter(([job, labels]) => !RELEASE_CHAIN.includes(job) && !isDeepStrictEqual(labels, [RUNNER]))).toEqual([]);
    // Twenty-three on ubuntu-26.04: approval-of-record's one, ci.yml's nine, content-calendar's check, handoff and
    // notify, large-zip's one, mutation's three, publish-content's one, release-capacity's capacity and notify (its
    // report is advisory and never attested, so F5's chain does not hold it), and screening-capacity's changes, gate and
    // notify.
    expect(Object.keys(runners).filter((job) => !RELEASE_CHAIN.includes(job))).toHaveLength(23);
    // GitHub's larger runners exist only for an organization on GitHub Team or Enterprise Cloud, and PureTideWater is a
    // personal account: actionlint's configuration, which named the 8-core runner's label, is gone with it, and none
    // names ubuntu-26.04 as a self-hosted label (the actionlint test ignores that one message instead).
    for (const config of ['.github/actionlint.yaml', '.github/actionlint.yml']) {
      expect(existsSync(path.join(CI_ROOT, config)), config).toBe(false);
    }
  });

  it('resolve a runner from a dispatch input only in the form `${{ inputs.<name> || \'<label>\' }}`, whose choice input defaults to that label, and check every label it can take', () => {
    const inputs = (options: unknown, extra: Record<string, unknown> = {}) => ({ runner: { type: 'choice', options, default: 'ubuntu-24.04', ...extra } });
    const probe = "${{ inputs.runner || 'ubuntu-24.04' }}";
    expect(runnerProblems(probe, undefined, inputs(['ubuntu-24.04', 'ubuntu-26.04']))).toEqual([]);
    expect(jobLabels(probe, inputs(['ubuntu-24.04', 'ubuntu-26.04']))).toEqual(['ubuntu-24.04', 'ubuntu-26.04']);
    // An option that is not a pinned image is refused by name.
    expect(runnerProblems(probe, undefined, inputs(['ubuntu-24.04', 'ubuntu-latest']))).toEqual([`${JSON.stringify(probe)}: "ubuntu-latest" is a -latest label, whose image GitHub moves`]);
    // Anything else stays unresolved: no inputs, another input, a free-text input, a default other than the label,
    // another expression.
    for (const [runsOn, given] of [
      [probe, undefined],
      ["${{ inputs.os || 'ubuntu-24.04' }}", inputs(['ubuntu-24.04'])],
      [probe, inputs(['ubuntu-24.04'], { type: 'string' })],
      [probe, inputs(['ubuntu-24.04'], { default: 'ubuntu-26.04' })],
      ["${{ inputs.runner || 'ubuntu-24.04' }}-arm", inputs(['ubuntu-24.04'])],
      ["${{ inputs.runner && 'ubuntu-24.04' }}", inputs(['ubuntu-24.04'])],
      ['${{ inputs.runner }}', inputs(['ubuntu-24.04'])],
    ] as const) {
      expect(runnerProblems(runsOn, undefined, given), runsOn).toEqual([`${JSON.stringify(runsOn)} is an expression this test cannot resolve to a pinned label`]);
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
      const dockerfile = readFileSync(path.join(CI_ROOT, 'apps', app, 'Dockerfile'), 'utf8');
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
      const dockerfile = readFileSync(path.join(CI_ROOT, 'apps', app, 'Dockerfile'), 'utf8');
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
    const file = readFileSync(path.join(CI_ROOT, '.github/workflows/release.yml'), 'utf8');
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
      const built = stepIndex(steps, (step) => usesAction(step, 'docker/build-push-action'));
      expect(steps.filter((step) => step.uses?.startsWith('docker/build-push-action@') === true)).toHaveLength(1);
      expect(steps[built]?.with).toMatchObject({ push: false, load: true, provenance: false, sbom: false, file: '${{ steps.image.outputs.dockerfile }}', tags: '${{ steps.image.outputs.ref }}' });
      expect(String(steps[built]?.with?.['build-args']).trim()).toBe('STATIC_ASSET_ORIGIN=${{ steps.image.outputs.origin }}');
      // Each environment's CloudFront origin from its repository variable; the plain web image has none.
      const naming = steps.find((step) => (step as Step & { id?: string }).id === 'image') as Step & { env?: Record<string, string> };
      expect(naming.env).toMatchObject({ STAGING_ORIGIN: '${{ vars.STAGING_STATIC_ASSET_ORIGIN }}', PRODUCTION_ORIGIN: '${{ vars.PRODUCTION_STATIC_ASSET_ORIGIN }}' });
      expect(naming.run).toContain('web-production) echo "dockerfile=apps/web/Dockerfile" >> "$GITHUB_OUTPUT"; origin="$PRODUCTION_ORIGIN" ;;');
      expect(naming.run).toContain('worker) echo "dockerfile=apps/worker/Dockerfile" >> "$GITHUB_OUTPUT"; origin="" ;;');
      // Run: each image's three outputs, one line each, and a variable with a line break refused before it is written,
      // so it can add no other output or build argument (the value table's bounds, docs/adr/0066, Part 3, N32).
      const dir = mkdtempSync(path.join(os.tmpdir(), 'release-image-'));
      try {
        const named = (image: string, origin: string) => {
          const file = path.join(dir, `output-${String(Math.random()).slice(2)}`);
          writeFileSync(file, '');
          const result = runScript(naming.run ?? '', { IMAGE: image, STAGING_ORIGIN: origin, PRODUCTION_ORIGIN: 'https://d222.cloudfront.net', GITHUB_OUTPUT: file, GITHUB_REPOSITORY: 'PureTideWater/PhysicalTherapy', GITHUB_REF_NAME: 'v1.2.3' }, dir);
          return { status: result.status, written: readFileSync(file, 'utf8'), output: result.output };
        };
        expect(named('web-staging', 'https://d111.cloudfront.net')).toMatchObject({ status: 0, written: 'ref=ghcr.io/puretidewater/physicaltherapy/web-staging:v1.2.3\ndockerfile=apps/web/Dockerfile\norigin=https://d111.cloudfront.net\n' });
        expect(named('worker', '')).toMatchObject({ status: 0, written: 'ref=ghcr.io/puretidewater/physicaltherapy/worker:v1.2.3\ndockerfile=apps/worker/Dockerfile\norigin=\n' });
        for (const origin of ['https://d111.cloudfront.net\ndockerfile=apps/worker/Dockerfile', 'https://d111.cloudfront.net\r\nref=evil']) {
          const refused = named('web-staging', origin);
          expect(refused, JSON.stringify(origin)).toMatchObject({ status: 1, written: 'ref=ghcr.io/puretidewater/physicaltherapy/web-staging:v1.2.3\ndockerfile=apps/web/Dockerfile\n' });
          expect(refused.output).toContain("::error title=web-staging::its static host's repository variable holds a line break");
          expect(refused.output).not.toContain('d111');
        }
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
      const scan = stepIndex(steps, isScan);
      const sbom = stepIndex(steps, (step) => step.with?.format === 'spdx-json');
      const saved = stepIndex(steps, (step) => step.run?.includes('docker save') === true);
      const kept = steps.findLastIndex((step) => usesAction(step, 'actions/upload-artifact'));
      expect(steps[scan]?.with).toMatchObject({ 'image-ref': '${{ steps.image.outputs.ref }}', severity: 'HIGH,CRITICAL', 'exit-code': '1' });
      expect([built < scan, scan < sbom, sbom < saved, saved < kept]).toEqual([true, true, true, true]);
      // The identity read from the archive's bytes, the tag proved to be that image on the store, and both left as the
      // job's outputs (docs/adr/0066, Part 3); the .tar.sha256 and .id beside the archive are for a person reading it.
      expect(steps[saved]?.id).toBe('identity');
      expect(steps[saved]?.run).toContain('docker save "$REF" | gzip -1 > "$RUNNER_TEMP/image/$IMAGE.tar.gz"');
      expect(steps[saved]?.run).toContain('identity="$(node tools/screening-capacity/image-id.ts "$RUNNER_TEMP/image/$IMAGE.tar.gz")"');
      expect(steps[saved]?.run).toContain('echo "$config" > "$RUNNER_TEMP/image/$IMAGE.id"');
      expect(String(steps[kept]?.with?.path).trim().split('\n')).toEqual(['${{ runner.temp }}/image/${{ matrix.image }}.tar.gz', '${{ runner.temp }}/image/${{ matrix.image }}.tar.sha256', '${{ runner.temp }}/image/${{ matrix.image }}.id']);
      // The worker's headless shell, inside the image that ships, against browser.json before the image is saved, on
      // Node 24 with no cache (nothing is installed in this job).
      const check = stepIndex(steps, (step) => step.run === 'node tools/ci/browser-build.ts --image "$REF"');
      expect(steps[check]?.if).toBe("${{ matrix.image == 'worker' }}");
      expect(steps[check]?.env).toEqual({ REF: '${{ steps.image.outputs.ref }}' });
      const node = stepIndex(steps, (step) => usesAction(step, 'actions/setup-node'));
      expect(steps[node]?.with).toEqual({ 'node-version': 24, 'package-manager-cache': false });
      expect([node < check, check < saved]).toEqual([true, true]);
      expect(steps.some((step) => /\bpnpm\b/.test(step.run ?? '') || usesAction(step, 'pnpm/action-setup'))).toBe(false);
      expect(file).not.toMatch(/push: true/);
    });

    it('measures exactly the production web image and the worker image as built, with time binding (decision 13; the founder’s ruling of 2026-10-23, time advisory), on the capacity workflow\'s runner', () => {
      const capacity = job('capacity');
      expect(capacity.needs).toBe('build');
      expect(capacity.permissions).toBeUndefined();
      // The capacity workflow's measurement runs here on every event but the dispatched ubuntu-26.04 probe (F5).
      const workflowRunner = (parse(readFileSync(path.join(CI_ROOT, '.github/workflows/screening-capacity.yml'), 'utf8')) as Workflow).jobs.capacity?.['runs-on'];
      expect(workflowRunner).toBe(`\${{ inputs.runner || '${String(capacity['runs-on'])}' }}`);
      expect(capacity['runs-on']).toBe('ubuntu-24.04');
      // The launch check accepts only the layout this runner gives (launch-check.ts, RELEASE_RUNNER): moving the release
      // to another runner fails here until the check moves with it.
      expect(capacity['runs-on']).toBe(RELEASE_RUNNER.label);
      const steps = capacity.steps;
      expect(steps[0]).toEqual({ uses: pinOf('actions/checkout'), with: { 'persist-credentials': false } });
      expect(steps.filter((step) => usesAction(step, 'actions/download-artifact')).map((step) => step.with?.name)).toEqual(['image-web-production', 'image-worker']);
      expect(steps.some((step) => step.uses?.startsWith('docker/build-push-action@') === true)).toBe(false);
      expect(runs('capacity')).not.toMatch(/docker (?:buildx )?build(?!x)/);
      const measure = stepIndex(steps, (step) => step.run?.includes('pnpm screening:capacity') === true);
      const loaded = stepIndex(steps, (step) => step.run?.includes('docker load') === true);
      expect(loaded).toBeLessThan(measure);
      // The archives are checked and loaded before anything is installed, so no installed package runs before the check.
      expect(loaded).toBeLessThan(stepIndex(steps, (step) => usesAction(step, 'pnpm/action-setup')));
      expect(steps[loaded]?.run).toContain('for image in web-production worker; do');
      // The browser checked right after its install, and nothing after the check runs past a red one: a measurement
      // made with another browser than browser.json's must never be attested as passing.
      const install = stepIndex(steps, (step) => step.run === BROWSER_INSTALL);
      expect(steps[install]?.id).toBe('browser-install');
      expect(steps[install + 1]).toEqual({ name: 'Check the browser builds against browser.json', run: BROWSER_CHECK });
      for (const step of steps.slice(install + 1, measure + 1)) expect(step.if, step.name ?? step.run).toBeUndefined();
      expect(steps[measure]?.run).toContain('--web-image "$repository/web-production:$GITHUB_REF_NAME" --worker-image "$repository/worker:$GITHUB_REF_NAME"');
      expect(steps[measure]?.run).toContain('taskset -c "$cpus" pnpm screening:capacity "$@"');
      // The release's run is binding: time fails it, and only its pass opens production (decision 13). Never advisory.
      expect(steps[measure]?.run).toContain('--time-mode binding');
      expect(steps[measure]?.run).not.toContain('advisory');
      // Production's static host, the one the web-production image was built with, routed to the web container.
      expect((steps[measure] as Step & { env?: Record<string, string> }).env).toEqual({ PRODUCTION_ORIGIN: '${{ vars.PRODUCTION_STATIC_ASSET_ORIGIN }}' });
      expect(steps[measure]?.run).toContain('set -- "$@" --static-asset-origin "$PRODUCTION_ORIGIN"');
      const kept = steps[measure + 1] as Step & { if?: string };
      expect(actionOf(kept)).toBe('actions/upload-artifact');
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
      expect(script).not.toMatch(/docker (?:buildx )?build(?!x)/);
      expect(script).toContain('for image in web web-staging web-production worker; do');
      expect(script).toContain('docker load --input "$archive"');
      expect(script).toContain('if [ -z "$want" ] || [ "$id" != "$want" ]; then');
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
      expect(report.steps.map((step) => actionOf(step) ?? 'run')).toEqual(['actions/download-artifact', 'actions/attest-build-provenance', 'run']);
      // The attestation's subject is the report's bytes as the harness wrote them, the file the release keeps.
      const attest = report.steps[1] as Step & { id?: string };
      expect(attest.id).toBe('attest');
      expect(attest.with).toEqual({ 'subject-path': '${{ runner.temp }}/screening-capacity/screening-capacity.json' });
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

    it('carries each image’s identity from the build as job outputs, per image, and checks every archive against them before it is loaded, never against the files that travel with it (docs/adr/0066, Part 3; the review’s S1)', () => {
      const build = job('build') as ReleaseJob & { outputs?: Record<string, string> };
      const images = ['web', 'web-staging', 'web-production', 'worker'];
      expect(build.outputs).toEqual(Object.fromEntries(images.flatMap((image) => ['sha256', 'config', 'target'].map((kind) => [`${kind}_${image}`, `\${{ steps.identity.outputs.${kind}_${image} }}`]))));
      const identity = build.steps.find((step) => step.id === 'identity');
      for (const line of ['echo "sha256_$IMAGE=$sha"', 'echo "config_$IMAGE=$config"', 'echo "target_$IMAGE=$target"', '} >> "$GITHUB_OUTPUT"']) expect(identity?.run, line).toContain(line);
      // The dry run's two legs, web and worker, carry theirs the same way, so a pull request merges two legs' outputs.
      const dry = workflow('release-dry-run.yml') as Workflow & { jobs: Record<string, ReleaseJob & { outputs?: Record<string, string> }> };
      expect(dry.jobs.build?.outputs).toEqual(Object.fromEntries(['web', 'worker'].flatMap((image) => ['sha256', 'config', 'target'].map((kind) => [`${kind}_${image}`, `\${{ steps.identity.outputs.${kind}_${image} }}`]))));
      // Every docker load of both workflows, in a step that reads the build's outputs and checks the archive's SHA-256
      // against them first.
      const loads = [release, dry].flatMap((parsed, which) =>
        Object.entries(parsed.jobs).flatMap(([id, entry]) => entry.steps.filter((step) => /\bdocker load\b/.test(step.run ?? '')).map((step) => ({ where: `${which === 0 ? 'release.yml' : 'release-dry-run.yml'} ${id}`, step }))),
      );
      expect(loads.map(({ where }) => where)).toEqual(['release.yml capacity', 'release.yml push', 'release-dry-run.yml push', 'release-dry-run.yml capacity']);
      for (const { where, step } of loads) {
        const script = step.run ?? '';
        expect(step.env, where).toEqual({ BUILD: '${{ toJSON(needs.build.outputs) }}' });
        expect(script, where).toContain(`sha="$(jq -r --arg key "sha256_$image" '.[$key] // empty' <<< "$BUILD")"`);
        expect(script.indexOf('echo "$sha  $archive" | sha256sum --check --strict'), where).toBeGreaterThan(0);
        expect(script.indexOf('echo "$sha  $archive" | sha256sum --check --strict'), where).toBeLessThan(script.indexOf('docker load --input "$archive"'));
        expect(script, where).not.toMatch(/\.tar\.sha256|\.id\b|\bcat\b/);
      }
    });

    it('proves each loaded image is the one built on either image store before the first push, and reads the pushed manifests back after the pushes', () => {
      const steps = job('push').steps;
      const check = stepIndex(steps, (step) => /\bdocker load\b/.test(step.run ?? ''));
      const push = stepIndex(steps, (step) => /\bdocker push\b/.test(step.run ?? ''));
      const registry = stepIndex(steps, (step) => step.run?.includes('docker buildx imagetools inspect --raw') === true);
      expect([check < push, push < registry]).toEqual([true, true]);
      // Every image checked before any is pushed: the push step runs no load and the check step no push.
      expect(steps[check]?.run).not.toMatch(/\bdocker (?:push|tag)\b/);
      expect(steps[push]?.run).not.toMatch(/\bdocker load\b/);
      expect(steps[registry]?.env).toEqual({ BUILD: '${{ toJSON(needs.build.outputs) }}' });
      expect(steps[registry]?.run).toContain('for ref in "$repository/$image:$GITHUB_REF_NAME" "$repository/$image:sha-$GITHUB_SHA"; do');
      expect(steps[registry]?.run).toContain('select(.platform.os == "linux" and .platform.architecture == "amd64")');
      expect(steps[registry]?.run).toContain(`pushed="$(jq -r '.config.digest // empty' <<< "$raw")"`);
      expect(steps[registry]?.run).toContain('if [ -z "$config" ] || [ "$pushed" != "$config" ]; then');
    });

    it('runs no repository code in the jobs that hold the registry or the release: push, report and the dry run’s push check nothing out, set up no Node and run no node, pnpm or tsx', () => {
      const dry = workflow('release-dry-run.yml');
      const jobs = [
        ['release.yml push', job('push')],
        ['release.yml report', job('report')],
        ['release-dry-run.yml push', dry.jobs.push],
      ] as const;
      for (const [where, entry] of jobs) {
        const steps = entry?.steps ?? [];
        expect(steps.length, where).toBeGreaterThan(0);
        expect(steps.filter((step) => usesAction(step, 'actions/checkout') || usesAction(step, 'actions/setup-node') || usesAction(step, 'pnpm/action-setup')), where).toEqual([]);
        expect(steps.filter((step) => /(?:^|[\s;&|(])(?:node|pnpm|tsx|npx|npm)(?:\s|$)/m.test(step.run ?? '')).map((step) => step.name), where).toEqual([]);
      }
    });

    it('builds every image whose identity is checked with no attestation manifest, so either store holds one manifest for it (the review’s S2)', () => {
      const builds = ['release.yml', 'release-dry-run.yml', 'ci.yml', 'screening-capacity.yml'].flatMap((name) =>
        Object.entries(workflow(name).jobs).flatMap(([id, entry]) => entry.steps.filter((step) => usesAction(step, 'docker/build-push-action')).map((step) => ({ where: `${name} ${id} ${String(step.with?.file)}`, step }))),
      );
      expect(builds).toHaveLength(6);
      for (const { where, step } of builds) expect([step.with?.provenance, step.with?.sbom], where).toEqual([false, false]);
    });

    describe('the archive check, run as the runner runs it with a stand-in docker', () => {
      const SCRIPT_ENV = { GITHUB_REPOSITORY: 'PureTideWater/PhysicalTherapy', GITHUB_REF_NAME: 'v1.2.3' };
      /** The push job's check step, on archives under RUNNER_TEMP, with docker answering for this store and these IDs. */
      function check(setup: { store: 'classic' | 'containerd'; tamper?: string; ids: (identity: { config: string; target: string }) => string }) {
        const dir = mkdtempSync(path.join(scratch, 'release-check-'));
        const temp = path.join(dir, 'runner-temp');
        mkdirSync(path.join(temp, 'image'), { recursive: true });
        const outputs: Record<string, string> = {};
        for (const image of ['web', 'web-staging', 'web-production', 'worker']) {
          const archive = path.join(temp, 'image', `${image}.tar.gz`);
          writeFileSync(archive, `archive of ${image}`);
          const identity = { config: `sha256:${createHash('sha256').update(`config ${image}`).digest('hex')}`, target: `sha256:${createHash('sha256').update(`index ${image}`).digest('hex')}` };
          outputs[`sha256_${image}`] = createHash('sha256').update(`archive of ${image}`).digest('hex');
          outputs[`config_${image}`] = identity.config;
          outputs[`target_${image}`] = identity.target;
          writeFileSync(path.join(dir, `id-${image}`), `${setup.ids(identity)}\n`);
          if (setup.tamper === image) writeFileSync(archive, `another archive of ${image}`);
        }
        const bin = standInDocker(dir, setup.store);
        const script = job('push').steps.find((step) => /\bdocker load\b/.test(step.run ?? ''))?.run ?? '';
        const result = runScript(script, { ...SCRIPT_ENV, PATH: `${bin}:${process.env.PATH ?? '/usr/bin:/bin'}`, RUNNER_TEMP: temp, BUILD: JSON.stringify(outputs) }, dir);
        const calls = existsSync(path.join(dir, 'calls')) ? readFileSync(path.join(dir, 'calls'), 'utf8').trim().split('\n') : [];
        return { ...result, loads: calls.filter((call) => call.startsWith('load ')).map((call) => path.basename(call.split(' ').at(-1) ?? '')) };
      }

      it('loads every archive whose SHA-256 is the build’s and whose loaded .Id is the config digest on the classic store or the top-level descriptor on the containerd store', () => {
        expect(check({ store: 'classic', ids: ({ config }) => config })).toMatchObject({ status: 0, loads: ['web.tar.gz', 'web-staging.tar.gz', 'web-production.tar.gz', 'worker.tar.gz'] });
        expect(check({ store: 'containerd', ids: ({ target }) => target }).status).toBe(0);
      });

      it('stops before loading an archive replaced after the build, and on a loaded .Id that is not the store’s digest', () => {
        const replaced = check({ store: 'classic', tamper: 'web-production', ids: ({ config }) => config });
        expect(replaced.status).not.toBe(0);
        expect(replaced.loads).toEqual(['web.tar.gz', 'web-staging.tar.gz']);
        expect(replaced.output).toContain('FAILED');
        const wrongStore = check({ store: 'containerd', ids: ({ config }) => config });
        expect(wrongStore.status).toBe(1);
        expect(wrongStore.output).toMatch(/::error title=web::ghcr\.io\/puretidewater\/physicaltherapy\/web:v1\.2\.3 loaded as sha256:[0-9a-f]{64} on the containerd image store, not the sha256:[0-9a-f]{64} the build recorded/);
        const classic = check({ store: 'classic', ids: ({ target }) => target });
        expect([classic.status, classic.loads]).toEqual([1, ['web.tar.gz']]);
      });
    });

    it('restores no cache: every scale release, scanner, database, builder and pnpm store is made in its own run (docs/adr/0062; docs/adr/0066, Part 2)', () => {
      // A tag's run may restore the default branch's caches, which the build branch's push runs save until launch.
      const steps = Object.entries(release.jobs).flatMap(([name, entry]) => entry.steps.map((step) => ({ where: `${name}: ${step.name ?? step.uses ?? step.run?.split('\n')[0] ?? ''}`, step })));
      expect(steps.filter(({ step }) => /^actions\/cache(?:\/|@)/.test(step.uses ?? '')).map(({ where }) => where)).toEqual([]);
      const named = (action: string) => steps.filter(({ step }) => usesAction(step, action));
      // These explicit inputs are the only guard for a JavaScript action's built-in cache (setup-node's, action-setup's,
      // setup-buildx's binary cache): tools/check-action-pins follows the actions/cache steps a composite nests, and a
      // JavaScript action's cache is code it cannot read (the security review's N2).
      // Node without its package-manager cache, which v7 turns on by itself for a packageManager it caches.
      expect(named('actions/setup-node').map(({ step }) => step.with)).toEqual([
        { 'node-version': 24, 'package-manager-cache': false },
        { 'node-version': 24, 'package-manager-cache': false },
      ]);
      expect(named('pnpm/action-setup').map(({ step }) => step.with)).toEqual([{ cache: false }]);
      expect(named('docker/setup-buildx-action').map(({ step }) => step.with?.['cache-binary'])).toEqual([false]);
      for (const { where, step } of named('docker/build-push-action')) {
        expect([step.with?.['cache-from'], step.with?.['cache-to'], step.with?.['no-cache']], where).toEqual([undefined, undefined, undefined]);
      }
      // Trivy's binary and its vulnerability database, each made by this run, kept outside the checkout; the actions it
      // nests are tools/check-action-pins' to follow to this input.
      const trivy = named('aquasecurity/trivy-action');
      expect(trivy).toHaveLength(2);
      for (const { where, step } of trivy) expect([step.with?.cache, step.with?.['cache-dir']], where).toEqual([false, '${{ runner.temp }}/trivy']);
      // The scale release built every time, in this run.
      const scale = job('capacity').steps.find((step) => step.run?.includes('tools/release/scale.ts') === true);
      expect(scale?.if).toBeUndefined();
      expect(file).not.toMatch(/cache-hit|hashFiles/);
    });
  });

  it('run the intake test on a 2 GiB zip of 835s weekly against PostgreSQL (the milestone 3 done check)', () => {
    const large = workflow('large-zip.yml');
    expect(large.on).toMatchObject({ schedule: [{ cron: expect.any(String) as unknown }], workflow_dispatch: null });
    const steps = large.jobs['large-zip']?.steps ?? [];
    const test: (Step & { env?: Record<string, string> }) | undefined = steps.find((step) => step.run?.includes('apps/worker/src/intake/intake.large.db.test.ts') === true);
    expect(test?.env).toMatchObject({ TP_LARGE_ZIP_MB: '2048' });
    // Chromium first: the db project fails on CI without it rather than skip a printing test (CI-05).
    expect(stepIndex(steps, (step) => step.run === BROWSER_INSTALL)).toBeLessThan(steps.indexOf(test as Step));
    // Past a red browser check too, as ci.yml's jobs run (docs/adr/0066, Part 3).
    expect(test?.if).toBe(AFTER_CHECK);
    // GitHub's bash with pipefail, as ci.yml and the release run theirs, so no pipe in a step can hide a failure.
    expect(large.defaults).toEqual({ run: { shell: 'bash' } });
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
    const file = readFileSync(path.join(CI_ROOT, '.github/workflows/screening-capacity.yml'), 'utf8');
    const capacity = parse(file) as Workflow & {
      permissions: unknown;
      concurrency: Record<string, unknown>;
      jobs: Record<string, Job & { name?: string; 'timeout-minutes'?: number; needs?: unknown; if?: string; permissions?: unknown; outputs?: Record<string, string> }>;
    };
    const on = capacity.on as Record<string, { branches?: string[]; paths?: string[] } | null | { cron: string }[]>;
    expect(Object.keys(on).sort()).toEqual(['pull_request', 'push', 'schedule', 'workflow_dispatch']);
    expect(on.schedule).toEqual([{ cron: '41 6 * * 1' }]);
    // One input, the runner: the release's by default, or ubuntu-26.04 for the advisory probe (the founder's F5).
    expect(on.workflow_dispatch).toEqual({ inputs: { runner: { description: 'The runner image to measure on (ubuntu-26.04 is an advisory probe)', type: 'choice', options: ['ubuntu-24.04', 'ubuntu-26.04'], default: 'ubuntu-24.04' } } });
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
      // The Postgres image the harness and CI take (tools/screening-capacity/watched.ts watches it).
      'docker-compose.yml',
      // The capacity job's cached system packages' check and its browser check, which it runs (watched.ts watches them).
      'tools/ci/apt-archives.sh',
      'tools/ci/browser-build.ts',
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
    expect(changes?.['runs-on']).toBe(RUNNER);
    expect(changes?.permissions).toBeUndefined();
    expect(changes?.outputs).toEqual({ measure: '${{ steps.watched.outputs.measure }}' });
    // Every object fetched by the checkout, with the job's token: a blobless clone fetches each blob it reads later from
    // its promisor remote with no credentials, which a private repository refuses (run 41765454724, "could not read
    // Username"); the script's run on a clone without its remote is below.
    expect(changes?.steps[0]).toEqual({ uses: pinOf('actions/checkout'), with: { 'persist-credentials': false, 'fetch-depth': 0 } });
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
    expect(measure?.['runs-on']).toBe("${{ inputs.runner || 'ubuntu-24.04' }}");
    // 100 minutes: S4 runs three times (the founder's ruling of 2026-10-23), about 3 minutes more than the 90 before.
    expect(measure?.['timeout-minutes']).toBe(100);
    expect(measure?.permissions).toBeUndefined();
    const steps = measure?.steps ?? [];
    // Both production images built from their Dockerfiles into archives before the harness runs, then loaded once each
    // archive's identity is read from its bytes and the loaded tag proved that image on the store (docs/adr/0066, Part 3).
    const builds = steps.filter((step) => usesAction(step, 'docker/build-push-action'));
    expect(builds.map((step) => [step.with?.file, step.with?.load, step.with?.tags, step.with?.outputs])).toEqual([
      ['apps/web/Dockerfile', undefined, 'tp-web:capacity', 'type=docker,dest=${{ runner.temp }}/image/web.tar'],
      ['apps/worker/Dockerfile', undefined, 'tp-worker:capacity', 'type=docker,dest=${{ runner.temp }}/image/worker.tar'],
    ]);
    const loads = stepNamed(steps, 'Load the images as built');
    expect(steps.indexOf(loads)).toBeGreaterThan(stepIndex(steps, (step) => usesAction(step, 'actions/setup-node')));
    expect(loads.run).toContain('identity="$(node tools/screening-capacity/image-id.ts "$RUNNER_TEMP/image/$image.tar")"');
    expect(loads.run).toContain('docker load --input "$RUNNER_TEMP/image/$image.tar"');
    expect(loads.run).toContain('if [ "$store" = containerd ]; then want="$target"; else want="$config"; fi');
    expect(loads.run?.indexOf('image-id.ts')).toBeLessThan(loads.run?.indexOf('docker load') ?? -1);
    // Every run reads the layer cache; only a push to the build branch writes it, and only its final layers.
    expect(builds.map((step) => [step.with?.['cache-from'], step.with?.['cache-to']])).toEqual(
      ['web', 'worker'].map((image) => [
        `type=gha,scope=screening-capacity-${image}`,
        `\${{ github.event_name == 'push' && github.ref == 'refs/heads/claude/build-platform' && 'type=gha,mode=min,scope=screening-capacity-${image}' || '' }}`,
      ]),
    );
    // The scale release: restored, built in a step of its own when missing, and saved straight after, before the
    // measurement, so a failing measurement still caches it.
    const restore = stepIndex(steps, (step) => usesAction(step, 'actions/cache/restore') && step.id === 'scale-release');
    const build = stepIndex(steps, (step) => step.run?.includes('tools/release/scale.ts') === true);
    const save = stepIndex(steps, (step) => usesAction(step, 'actions/cache/save') && step.with?.key === '${{ steps.scale-release.outputs.cache-primary-key }}');
    expect([restore < build, build < save]).toEqual([true, true]);
    // The scale release only, by its own restore and save: no actions/cache step, at any ref, which would also save
    // whatever its path held at the job's end.
    expect(plainCacheSteps(steps)).toEqual([]);
    expect((steps[build] as Step & { if?: string }).if).toBe("steps.scale-release.outputs.cache-hit != 'true'");
    expect((steps[save] as Step & { if?: string }).if).toBe("steps.scale-release.outputs.cache-hit != 'true'");
    const run = stepIndex(steps, (step) => step.run?.includes('pnpm screening:capacity') === true);
    expect(stepIndex(steps, (step) => usesAction(step, 'docker/build-push-action'))).toBeLessThan(run);
    expect(save).toBeLessThan(run);
    // The harness, its children and Chromium where the runner's layout puts them (Postgres's 0-1 on the free runner),
    // never the consumer's CPUs.
    expect(steps[run]?.run).toContain('cpus=$(pnpm -s screening:capacity --print-harness-cpus)');
    expect(steps[run]?.run).toContain('taskset -c "$cpus" pnpm screening:capacity');
    // Advisory on every event this workflow runs on (none is a release): time warns, every other check fails the job.
    expect(steps[run]?.run).toContain('--time-mode advisory');
    expect(steps[run]?.run).not.toContain('binding');
    const upload = stepIndex(steps, (step) => usesAction(step, 'actions/upload-artifact'));
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
    expect(steps[0]).toEqual({ uses: pinOf('actions/checkout'), with: { 'persist-credentials': false } });
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
    expect(notify?.['runs-on']).toBe(RUNNER);
    expect(notify?.needs).toBe('capacity');
    // A dispatched ubuntu-26.04 probe is advisory: its failure goes to issue #41 by hand, never to the capacity issue.
    expect(notify?.if).toBe("failure() && github.event_name != 'pull_request' && !(github.event_name == 'workflow_dispatch' && inputs.runner == 'ubuntu-26.04')");
    expect(gate?.['runs-on']).toBe(RUNNER);
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
  function expectQuietNotify(name: string, needs: string, condition: string, permissions: Readonly<Record<string, string>> = { issues: 'write' }) {
    const notify = read(name).jobs.notify;
    expect(notify?.needs, name).toBe(needs);
    expect(notify?.if, name).toBe(condition);
    expect(notify?.permissions, name).toEqual(permissions);
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
    expect(Object.keys(calendar.jobs)).toEqual(['check', 'handoff', 'notify']);
    // The header names every public output, the one-day findings artifact among them (docs/adr/0071, Amendment).
    const lines = readFileSync(path.join(WORKFLOWS, 'content-calendar.yml'), 'utf8').split('\n');
    const header = lines.slice(1, lines.findIndex((line) => line.startsWith('on:'))).map((line) => line.replace(/^# ?/, '')).join(' ');
    expect(header).toContain("Issues, the check's summary and its one-day findings artifact hold only calendar data");
  });

  it("content-calendar: its check job only reads, with no permissions of its own and no secret, and uploads its findings as the run's own artifact", () => {
    const check = read('content-calendar.yml').jobs.check;
    expect(check?.permissions).toBeUndefined();
    expect(check?.steps[0]).toEqual({ uses: pinOf('actions/checkout'), with: { 'persist-credentials': false } });
    expect(runs(check).filter((run) => run.startsWith('pnpm install'))).toEqual(['pnpm install --frozen-lockfile']);
    expect(JSON.stringify(check?.steps ?? [])).not.toContain('secrets.');
    expect(runs(check).filter((run) => run.includes('${{'))).toEqual([]);
    const script = runs(check).find((run) => run.includes('tools/content-calendar/index.ts')) ?? '';
    expect(script).toContain('--today "$(date -u +%F)" --out "$RUNNER_TEMP/findings.json" --summary "$RUNNER_TEMP/summary.md"');
    expect(script).toContain('>> "$GITHUB_STEP_SUMMARY"');
    expect(check?.outputs).toBeUndefined();
    // The findings, every one whole, as this run's own artifact, kept one day and replaced on a re-run, uploaded right
    // after the step that writes them.
    const steps = check?.steps ?? [];
    expect(steps.at(-1)).toEqual({
      uses: pinOf('actions/upload-artifact'),
      with: { name: 'findings', path: '${{ runner.temp }}/findings.json', 'if-no-files-found': 'error', 'retention-days': 1, overwrite: true },
    });
    expect(steps.at(-2)?.run).toBe(script);
  });

  it("content-calendar: its check step, as the runner runs it, appends the summary also when the check stops, exits with the check's status, and logs the findings file's size and SHA-256 (ci-findings-transport)", () => {
    const step = read('content-calendar.yml').jobs.check?.steps.find((one) => one.run?.includes('tools/content-calendar/index.ts') === true);
    const dir = mkdtempSync(path.join(scratch, 'calendar-check-'));
    // A stand-in pnpm: the check refused at a bound (its summary written, exit 1), stopped before one (exit 2), or passed.
    mkdirSync(path.join(dir, 'bin'));
    writeFileSync(
      path.join(dir, 'bin/pnpm'),
      [
        '#!/usr/bin/env bash',
        'while [ "$#" -gt 0 ]; do case "$1" in --out) out=$2; shift ;; --summary) summary=$2; shift ;; esac; shift; done',
        'case "$PNPM_CASE" in',
        `  refused) printf '## Content calendar, 2026-11-01\\n\\n- Finding 1\\n' > "$summary"; echo 'content-calendar: the findings file holds 101 bytes, over 100' >&2; exit 1 ;;`,
        '  usage) exit 2 ;;',
        `  passed) printf '## Content calendar, 2026-11-01\\n\\nNothing is due.\\n' > "$summary"; printf '[]\\n' > "$out"; exit 0 ;;`,
        'esac',
      ].join('\n'),
      { mode: 0o755 },
    );
    const run = (which: string) => {
      const temp = mkdtempSync(path.join(dir, `${which}-`));
      const summary = path.join(temp, 'step-summary.md');
      writeFileSync(summary, '');
      writeFileSync(path.join(temp, 'output'), '');
      const file = path.join(temp, 'step.sh');
      writeFileSync(file, step?.run ?? '');
      const env = { PATH: `${path.join(dir, 'bin')}:${process.env.PATH ?? '/usr/bin:/bin'}`, RUNNER_TEMP: temp, GITHUB_STEP_SUMMARY: summary, GITHUB_OUTPUT: path.join(temp, 'output'), PNPM_CASE: which };
      const result = spawnSync('bash', ['--noprofile', '--norc', '-e', '-o', 'pipefail', file], { cwd: temp, encoding: 'utf8', env, timeout: TEST_TIMEOUT_MS, killSignal: 'SIGKILL' });
      expect(result.error?.message, `${which}: bash did not start`).toBeUndefined();
      return { status: result.status, output: result.stdout + result.stderr, summary: readFileSync(summary, 'utf8') };
    };
    const refused = run('refused');
    expect([refused.status, refused.summary], refused.output).toEqual([1, '## Content calendar, 2026-11-01\n\n- Finding 1\n']);
    const usage = run('usage');
    expect([usage.status, usage.summary], usage.output).toEqual([2, '']);
    expect(usage.output).not.toContain('No such file');
    const passed = run('passed');
    expect([passed.status, passed.summary], passed.output).toEqual([0, '## Content calendar, 2026-11-01\n\nNothing is due.\n']);
    expect(passed.output).toContain(`content-calendar: the findings file holds 3 bytes, SHA-256 ${createHash('sha256').update('[]\n').digest('hex')}\n`);
  });

  /**
   * A fake gh on PATH for a notify script: `gh api` answers with the open issues (as its --jq would print them, one
   * object a line), `gh issue list` with them as one JSON array, and every call is logged one line each. `gh run
   * download` copies fake/findings.json into its -D directory, after stalling as many tries as fake/stall holds (each
   * writing a cut findings.json first, as a try killed while it extracts leaves one), failing as many as fake/fail holds
   * and failing as many as fake/partial holds after writing a cut findings.json (a zip checksum error), and answers as
   * gh does when there is no artifact. The artifact's file is named as fake/name holds (findings.json unless a case
   * names another). As gh 2.89 and 2.103 extract (O_EXCL), it refuses a findings.json already in -D
   * and never overwrites one. A `sleep` beside it logs each pause ("sleep <seconds>") and returns at once; the stall
   * waits with /bin/sleep, which it does not log.
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
        'if [ "$1 $2" = "run download" ]; then',
        '  dest="${!#}"; fails=$(cat "$FAKE_DIR/fake/fail" 2>/dev/null || echo 0); stalls=$(cat "$FAKE_DIR/fake/stall" 2>/dev/null || echo 0); partials=$(cat "$FAKE_DIR/fake/partial" 2>/dev/null || echo 0); name=$(cat "$FAKE_DIR/fake/name" 2>/dev/null || echo findings.json)',
        '  if [ "$stalls" -gt 0 ]; then echo $((stalls - 1)) > "$FAKE_DIR/fake/stall"; if [ -f "$FAKE_DIR/fake/findings.json" ] && [ ! -e "$dest/findings.json" ]; then mkdir -p "$dest"; head -c 5 "$FAKE_DIR/fake/findings.json" > "$dest/findings.json"; fi; exec /bin/sleep 30; fi',
        '  if [ "$fails" -gt 0 ]; then echo $((fails - 1)) > "$FAKE_DIR/fake/fail"; echo "HTTP 502: Bad Gateway" >&2; exit 1; fi',
        '  if [ ! -f "$FAKE_DIR/fake/findings.json" ]; then echo "no valid artifacts found to download" >&2; exit 1; fi',
        '  if [ -e "$dest/findings.json" ]; then echo "error downloading findings: error extracting \\"findings.json\\": open $dest/findings.json: file exists" >&2; exit 1; fi',
        '  if [ "$partials" -gt 0 ]; then echo $((partials - 1)) > "$FAKE_DIR/fake/partial"; mkdir -p "$dest"; head -c 5 "$FAKE_DIR/fake/findings.json" > "$dest/findings.json"; echo "error downloading findings: zip: checksum error" >&2; exit 1; fi',
        '  mkdir -p "$dest"; cp "$FAKE_DIR/fake/findings.json" "$dest/$name"; exit 0',
        'fi',
        'for arg in "$@"; do if [ "${previous:-}" = --body-file ]; then { cat "$arg"; printf "\\n---\\n"; } >> "$FAKE_DIR/bodies"; fi; previous=$arg; done',
      ].join('\n'),
      { mode: 0o755 },
    );
    writeFileSync(path.join(dir, 'bin/sleep'), ['#!/usr/bin/env bash', 'printf "sleep %s\\n" "$*" >> "$FAKE_DIR/log"'].join('\n'), { mode: 0o755 });
    const lines = (name: string) => (existsSync(path.join(dir, name)) ? readFileSync(path.join(dir, name), 'utf8') : '');
    return { dir, log: () => lines('log').split('\n').filter((line) => line !== ''), bodies: () => lines('bodies').split('\n---\n').filter((body) => body !== '') };
  }

  const notifyStep = (name: string, job = 'notify') => read(name).jobs[job]?.steps[0];

  /**
   * A notify step's env as the runner evaluates it, in identityEnv's form: a value the case gives (a literal lowered, or
   * an expression's value), each literal as written, and the expression forms these jobs use. The check's findings
   * output, while a workflow still had one, is the base64 of the staged file. Any other form fails the test, so a value
   * this emulator does not know (a large one among them) cannot pass unnoticed, and so does a value the case gives for a
   * name the step does not set.
   */
  function notifyEnv(name: string, step: Step, values: Readonly<Record<string, string>>, findings: string | null): Record<string, string> {
    const env = step.env ?? {};
    for (const key of Object.keys(values)) if (!Object.hasOwn(env, key)) throw new Error(`${name}: ${key} is not in the step's env`);
    const forms: Readonly<Record<string, string>> = {
      '${{ github.token }}': 'token',
      '${{ github.repository }}': 'owner/repo',
      '${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}': 'https://github.com/owner/repo/actions/runs/1',
      '${{ needs.check.outputs.findings }}': Buffer.from(findings ?? '').toString('base64'),
    };
    return Object.fromEntries(
      Object.entries(env).map(([key, value]): [string, string] => {
        const given = values[key];
        if (given !== undefined) return [key, given];
        if (!value.includes('${{')) return [key, value];
        const known = forms[value];
        if (known === undefined) throw new Error(`${name}: ${value} is a form this emulator does not know`);
        return [key, known];
      }),
    );
  }

  /**
   * Runs a notify job's step as the runner starts it (a file, bash --noprofile --norc -e -o pipefail), with notifyEnv's
   * values, the runner's own RUNNER_TEMP and GITHUB_RUN_ID, the fake's sleep logging each pause, `findings`, when not null,
   * staged as the run's findings artifact, and the fake's download stalling its first `stalls` tries (a sleep past any
   * DOWNLOAD_LIMIT a case gives), then failing its next `failures` tries, then its next `partials` after writing a cut
   * findings.json, and the artifact's file named `artifactFile`.
   */
  function runNotify(name: string, values: Readonly<Record<string, string>>, open: readonly { number: number; title: string }[], findings: string | null = null, job = 'notify', failures = 0, stalls = 0, partials = 0, artifactFile = 'findings.json') {
    const step = notifyStep(name, job);
    if (step === undefined) throw new Error(`${name}: no job ${job}`);
    const gh = fakeGh(open);
    if (findings !== null) writeFileSync(path.join(gh.dir, 'fake/findings.json'), findings);
    if (failures > 0) writeFileSync(path.join(gh.dir, 'fake/fail'), String(failures));
    if (stalls > 0) writeFileSync(path.join(gh.dir, 'fake/stall'), String(stalls));
    if (partials > 0) writeFileSync(path.join(gh.dir, 'fake/partial'), String(partials));
    if (artifactFile !== 'findings.json') writeFileSync(path.join(gh.dir, 'fake/name'), artifactFile);
    const env = {
      ...notifyEnv(name, step, values, findings),
      RUNNER_TEMP: mkdtempSync(path.join(scratch, 'runner-temp-')),
      GITHUB_RUN_ID: '1',
      GITHUB_REF_NAME: 'claude/build-platform',
      GITHUB_SHA: 'abc123',
      FAKE_DIR: gh.dir,
      PATH: `${path.join(gh.dir, 'bin')}:${process.env.PATH ?? '/usr/bin:/bin'}`,
    };
    const file = path.join(scratch, `${path.basename(gh.dir)}.sh`);
    writeFileSync(file, step.run ?? '');
    const result = spawnSync('bash', ['--noprofile', '--norc', '-e', '-o', 'pipefail', file], { cwd: gh.dir, encoding: 'utf8', env, timeout: TEST_TIMEOUT_MS, killSignal: 'SIGKILL' });
    // As #42's job met it: one environment string over 131,072 bytes stops bash before it starts (E2BIG).
    expect(result.error?.message, `${name} ${job}: bash did not start`).toBeUndefined();
    return { status: result.status, output: result.stdout + result.stderr, stdout: result.stdout, stderr: result.stderr, env, log: gh.log(), bodies: gh.bodies() };
  }
  const finding = (index: number) => ({ title: `Finding ${String(index)}`, body: `Body ${String(index)}` });
  /** A run's download tries and pauses in order, each try as "run download". */
  /** A one-finding list of exactly `bytes` bytes, its body padding it, for a MAX_FILE_BYTES of 100 in a case. */
  const listOf = (bytes: number) => {
    const list = JSON.stringify([{ title: 'Finding 1', body: 'x'.repeat(bytes - JSON.stringify([{ title: 'Finding 1', body: '' }]).length) }]);
    expect(Buffer.byteLength(list)).toBe(bytes);
    return list;
  };
  /** Two files past a MAX_FILE_BYTES of 100: a valid list padded with whitespace, and a closed list followed by other bytes. */
  const PAST_BOUND = [JSON.stringify([{ title: 'Finding 1', body: 'b' }]) + ' '.repeat(200), JSON.stringify([{ title: 'Finding 1', body: 'b' }]) + 'x'.repeat(200)];
  const paced = (ran: { log: string[] }) => ran.log.filter((line) => line.startsWith('run download ') || line.startsWith('sleep ')).map((line) => (line.startsWith('run download ') ? 'run download' : line));

  it('content-calendar: its notify job alone writes issues, skips pull requests, dedupes by exact title against every open issue, and opens at most MAX_OPENED_PER_RUN a run', () => {
    expectQuietNotify('content-calendar.yml', 'check', "always() && github.event_name != 'pull_request'", { actions: 'read', issues: 'write' });
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
    const first = runNotify('content-calendar.yml', { CHECK_RESULT: 'success' }, open, JSON.stringify(all));
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
    const second = runNotify('content-calendar.yml', { CHECK_RESULT: 'success' }, nowOpen, JSON.stringify(all));
    expect(second.status, second.output).toBe(0);
    expect(second.log.filter((line) => line.startsWith('issue '))).toEqual([
      'issue create --title Finding 23 --label content-due --body-file body.md',
      'issue create --title Finding 24 --label content-due --body-file body.md',
      'issue close 300 --comment Every finding is filed: https://github.com/owner/repo/actions/runs/1',
    ]);
    // Twenty-five more the day after, while the list is open: it is commented on, not opened twice.
    const third = runNotify('content-calendar.yml', { CHECK_RESULT: 'success' }, [{ number: 300, title: 'Content calendar: findings not filed' }], JSON.stringify(Array.from({ length: 21 }, (_, index) => finding(index + 50))));
    expect(third.log.filter((line) => line.startsWith('issue ')).at(-1)).toBe('issue comment 300 --body-file body.md');
    expect(third.log.filter((line) => line.startsWith('issue create'))).toHaveLength(20);
  });

  it('content-calendar: notify opens, or comments on, the one "check failing" issue when the check did not finish or handed on no findings list (fix round S8; sec-boundary improvement 2)', () => {
    const failing = 'issue create --title Content calendar check failing --label content-due --body-file body.md';
    for (const [result, findings] of [
      ['failure', null],
      ['cancelled', JSON.stringify([finding(1)])],
      ['success', null],
      ['success', '!!not json!!'],
      ['success', JSON.stringify({ title: 'x' })],
      ['success', JSON.stringify([{ title: 'x' }])],
    ] as const) {
      const at = `${result} ${String(findings)}`;
      const ran = runNotify('content-calendar.yml', { CHECK_RESULT: result }, [], findings);
      expect(ran.status, `${at} ${ran.output}`).toBe(0);
      expect(ran.log.filter((line) => line.startsWith('issue ')), at).toEqual([failing]);
      expect(ran.bodies[0], at).toBe(`The content calendar check did not hand on its findings (the check: ${result}) on claude/build-platform at abc123: https://github.com/owner/repo/actions/runs/1\n`);
      // The download is tried only when the check succeeded, three times when there is no artifact.
      expect(ran.log.filter((line) => line.startsWith('run download ')), at).toHaveLength(result !== 'success' ? 0 : findings === null ? 3 : 1);
    }
    // Each later failing run comments on the open issue, so a long failure shows in its history.
    const again = runNotify('content-calendar.yml', { CHECK_RESULT: 'failure' }, [{ number: 7, title: 'Content calendar check failing' }]);
    expect(again.log.filter((line) => line.startsWith('issue '))).toEqual(['issue comment 7 --body-file body.md']);
    // An empty list on a passing check files nothing.
    expect(runNotify('content-calendar.yml', { CHECK_RESULT: 'success' }, [], JSON.stringify([])).log.filter((line) => line.startsWith('issue '))).toEqual([]);
  });

  it('content-calendar: notify downloads the findings in three tries, each stopped after DOWNLOAD_LIMIT seconds, refuses a file over MAX_FILE_BYTES, and opens or comments on "check failing" when it cannot read them (ci-findings-transport)', () => {
    const failing = 'issue create --title Content calendar check failing --label content-due --body-file body.md';
    const issues = (ran: { log: string[] }) => ran.log.filter((line) => line.startsWith('issue '));
    const tries = (ran: { log: string[] }) => ran.log.filter((line) => line.startsWith('run download ')).length;
    // The tries and the pauses in order: DOWNLOAD_PAUSE's 10 seconds between two tries, never after the last.
    const t = 'run download';
    const p = 'sleep 10';
    // A file over the bound, as the check would never write it.
    const over = runNotify('content-calendar.yml', { CHECK_RESULT: 'success', MAX_FILE_BYTES: '100' }, [], JSON.stringify([{ title: 'Finding 1', body: 'x'.repeat(200) }]));
    expect([over.status, issues(over), tries(over)], over.output).toEqual([0, [failing], 1]);
    expect(paced(over)).toEqual([t]);
    // The bound itself: a file of exactly MAX_FILE_BYTES is read and filed, one byte more is refused.
    const atBound = runNotify('content-calendar.yml', { CHECK_RESULT: 'success', MAX_FILE_BYTES: '100' }, [], listOf(100));
    expect([atBound.status, issues(atBound), tries(atBound)], atBound.output).toEqual([0, ['issue create --title Finding 1 --label content-due --body-file body.md'], 1]);
    const pastBound = runNotify('content-calendar.yml', { CHECK_RESULT: 'success', MAX_FILE_BYTES: '100' }, [], listOf(101));
    expect([pastBound.status, issues(pastBound), tries(pastBound)], pastBound.output).toEqual([0, [failing], 1]);
    // Past the bound, a file the first MAX_FILE_BYTES + 1 bytes of which still read as a list is refused too: a list
    // padded with whitespace, and a list followed by other bytes.
    for (const past of PAST_BOUND) {
      const ran = runNotify('content-calendar.yml', { CHECK_RESULT: 'success', MAX_FILE_BYTES: '100' }, [], past);
      expect([ran.status, issues(ran), tries(ran)], `${JSON.stringify(past.slice(0, 40))} ${ran.output}`).toEqual([0, [failing], 1]);
    }
    // Two failed tries, then the artifact: filed, each failure's message in the log.
    const late = runNotify('content-calendar.yml', { CHECK_RESULT: 'success' }, [], JSON.stringify([finding(1)]), 'notify', 2);
    expect([late.status, issues(late), tries(late)], late.output).toEqual([0, ['issue create --title Finding 1 --label content-due --body-file body.md'], 3]);
    expect(late.output.split('HTTP 502: Bad Gateway')).toHaveLength(3);
    expect(paced(late)).toEqual([t, p, t, p, t]);
    // Three failed tries: "check failing".
    const down = runNotify('content-calendar.yml', { CHECK_RESULT: 'success' }, [], JSON.stringify([finding(1)]), 'notify', 3);
    expect([down.status, issues(down), tries(down)], down.output).toEqual([0, [failing], 3]);
    expect(paced(down)).toEqual([t, p, t, p, t]);
    // Each try is stopped after DOWNLOAD_LIMIT seconds (1 here, 60 in the workflow): a stalled try is retried, and three
    // end in "check failing" rather than at the job's timeout with no issue.
    const slow = runNotify('content-calendar.yml', { CHECK_RESULT: 'success', DOWNLOAD_LIMIT: '1' }, [], JSON.stringify([finding(1)]), 'notify', 0, 1);
    expect([slow.status, issues(slow), tries(slow)], slow.output).toEqual([0, ['issue create --title Finding 1 --label content-due --body-file body.md'], 2]);
    expect(paced(slow)).toEqual([t, p, t]);
    const stalled = runNotify('content-calendar.yml', { CHECK_RESULT: 'success', DOWNLOAD_LIMIT: '1' }, [], JSON.stringify([finding(1)]), 'notify', 0, 3);
    expect([stalled.status, issues(stalled), tries(stalled)], stalled.output).toEqual([0, [failing], 3]);
    expect(paced(stalled)).toEqual([t, p, t, p, t]);
    // A try that leaves a cut findings.json behind (a zip checksum error) is retried into an emptied directory, as gh
    // refuses to extract over a file already there: filed on the second try, never "file exists".
    const partial = runNotify('content-calendar.yml', { CHECK_RESULT: 'success' }, [], JSON.stringify([finding(1)]), 'notify', 0, 0, 1);
    expect([partial.status, issues(partial), tries(partial)], partial.output).toEqual([0, ['issue create --title Finding 1 --label content-due --body-file body.md'], 2]);
    expect(partial.output).not.toContain('file exists');
    expect(paced(partial)).toEqual([t, p, t]);
    // An artifact that downloads but holds no findings.json: "check failing", not a red job with no issue.
    const nameless = runNotify('content-calendar.yml', { CHECK_RESULT: 'success' }, [], JSON.stringify([finding(1)]), 'notify', 0, 0, 0, 'other.txt');
    expect([nameless.status, issues(nameless), tries(nameless)], nameless.output).toEqual([0, [failing], 1]);
  });

  it('content-calendar: notify lists at most MAX_LISTED titles in the "findings not filed" issue and names how many more (ci-findings-transport)', () => {
    // MAX_LISTED is lowered to 5 to keep the case fast: 26 findings took 0.5 to 0.6 s on an idle 4-CPU container and 3.6
    // to 4.3 s on one CPU beside eight busy loops (2026-11-02), where 400 at the real 200 took 32.7 s there, over
    // TEST_TIMEOUT_MS. The real 200 is pinned below and its body's bound proved in content-calendar.test.ts.
    const all = Array.from({ length: 26 }, (_, index) => finding(index));
    const ran = runNotify('content-calendar.yml', { CHECK_RESULT: 'success', MAX_LISTED: '5' }, [], JSON.stringify(all));
    expect(ran.status, ran.output).toBe(0);
    expect(ran.log.filter((line) => line.startsWith('issue create'))).toHaveLength(21);
    expect(ran.bodies.at(-1)).toBe(
      "A run opens at most 20 new issues. These 6 findings were not filed by https://github.com/owner/repo/actions/runs/1; a later run files them:\n\n- Finding 20\n- Finding 21\n- Finding 22\n- Finding 23\n- Finding 24\n- and 1 more, each named in the run's summary\n",
    );
  });

  /** A script's gh commands, comment lines left out. */
  const ghCommands = (script: string) =>
    script
      .split('\n')
      .filter((line) => !line.trim().startsWith('#'))
      .flatMap((line) => [...line.matchAll(/\bgh [^;\n]*/g)].map((match) => match[0].trim()));
  /** The download block, from its first marker line to its last, each of which stands once in the script. */
  const downloadBlock = (script: string) => {
    const lines = script.split('\n');
    expect(lines.filter((line) => line.startsWith('# The download, word for word'))).toHaveLength(1);
    expect(lines.filter((line) => line === '# End of the download.')).toHaveLength(1);
    return lines.slice(
      lines.findIndex((line) => line.startsWith('# The download, word for word')),
      lines.indexOf('# End of the download.') + 1,
    );
  };
  const DOWNLOAD = 'gh run download "$GITHUB_RUN_ID" -n findings -D "$RUNNER_TEMP/findings"';
  const BOUNDED_READ = 'head -c "$((MAX_FILE_BYTES + 1))" "$RUNNER_TEMP/findings/findings.json" > findings.json 2>/dev/null || : > findings.json';

  it("content-calendar: notify makes one Actions call, the download of this run's findings artifact, and reads no findings from its env (ci-findings-transport)", () => {
    const step = notifyStep('content-calendar.yml');
    expect(ghCommands(step?.run ?? '').filter((command) => !/^gh (?:api --paginate "repos\/\$GH_REPO\/issues\?|label |issue )/.test(command))).toEqual([DOWNLOAD]);
    expect(step?.env?.MAX_FILE_BYTES).toBe(String(MAX_FILE_BYTES));
    expect(step?.env?.DOWNLOAD_PAUSE).toBe('10');
    expect(step?.env?.DOWNLOAD_LIMIT).toBe('60');
    // Every try is stopped and killed 10 seconds later, so three tries and two pauses end inside the job's timeout.
    expect(step?.run).toContain(`if timeout -k 10 "$DOWNLOAD_LIMIT" ${DOWNLOAD}; then`);
    expect(3 * (Number(step?.env?.DOWNLOAD_LIMIT) + 10) + 2 * Number(step?.env?.DOWNLOAD_PAUSE)).toBeLessThan(5 * 60);
    // The downloaded file is read once, at most MAX_FILE_BYTES + 1 bytes of it, and what was read is refused past the
    // bound (downloadBlock holds handoff's lines equal to these).
    const block = downloadBlock(step?.run ?? '').map((line) => line.trim());
    expect(block.filter((line) => line.includes('$RUNNER_TEMP/findings/findings.json'))).toEqual([BOUNDED_READ]);
    expect(block[block.indexOf(BOUNDED_READ) + 1]).toBe('[ "$(wc -c < findings.json)" -le "$MAX_FILE_BYTES" ] || : > findings.json');
    expect(read('content-calendar.yml').jobs.notify?.['timeout-minutes']).toBe(5);
    expect(step?.env?.MAX_LISTED).toBe('200');
    expect(step?.env).not.toHaveProperty('FINDINGS_B64');
  });

  it("content-calendar: on a pull request, its handoff job downloads the findings with the notify job's own lines, holds actions: read alone and writes nothing (ci-findings-transport)", () => {
    const handoff = read('content-calendar.yml').jobs.handoff;
    expect(handoff?.needs).toBe('check');
    expect(handoff?.if).toBe("github.event_name == 'pull_request'");
    expect(handoff?.permissions).toEqual({ actions: 'read' });
    expect(handoff?.['timeout-minutes']).toBe(5);
    expect(handoff?.steps).toHaveLength(1);
    expect(handoff?.steps.filter((step) => step.uses !== undefined)).toEqual([]);
    expect(runs(handoff).filter((run) => run.includes('${{'))).toEqual([]);
    expect(JSON.stringify(handoff?.steps ?? [])).not.toContain('secrets.');
    const step = handoff?.steps[0];
    const keys = ['GH_TOKEN', 'GH_REPO', 'CHECK_RESULT', 'MAX_FILE_BYTES', 'DOWNLOAD_PAUSE', 'DOWNLOAD_LIMIT'];
    expect(Object.keys(step?.env ?? {})).toEqual(keys);
    const notify = notifyStep('content-calendar.yml');
    for (const key of keys) expect(step?.env?.[key], key).toBe(notify?.env?.[key]);
    // The download, word for word in both jobs, and its one gh line the only one in handoff's script.
    expect(downloadBlock(step?.run ?? '')).toEqual(downloadBlock(notify?.run ?? ''));
    expect(ghCommands(step?.run ?? '')).toEqual([DOWNLOAD]);
    // As the runner runs it: a findings list reads, with its count, size and SHA-256 logged; anything else exits 1.
    const list = JSON.stringify([finding(1), finding(2)]);
    const reads = runNotify('content-calendar.yml', { CHECK_RESULT: 'success' }, [], list, 'handoff');
    expect(reads.status, reads.output).toBe(0);
    expect(reads.stdout).toContain(`content-calendar: the notify job reads 2 findings, ${String(Buffer.byteLength(list))} bytes, SHA-256 ${createHash('sha256').update(list).digest('hex')}\n`);
    expect(reads.log.filter((line) => !line.startsWith('run download '))).toEqual([]);
    expect(paced(reads)).toEqual(['run download']);
    // A file of exactly MAX_FILE_BYTES reads; one byte more is a failure row below.
    const atBound = runNotify('content-calendar.yml', { CHECK_RESULT: 'success', MAX_FILE_BYTES: '100' }, [], listOf(100), 'handoff');
    expect(atBound.status, atBound.output).toBe(0);
    expect(atBound.stdout).toContain(`content-calendar: the notify job reads 1 findings, 100 bytes, SHA-256 ${createHash('sha256').update(listOf(100)).digest('hex')}\n`);
    // A try that leaves a cut findings.json behind, or is stopped while it extracts, is retried into an emptied directory.
    for (const [at, stalls, partials] of [['partial', 0, 1], ['stalled', 1, 0]] as const) {
      const retried = runNotify('content-calendar.yml', { CHECK_RESULT: 'success', DOWNLOAD_LIMIT: '1' }, [], list, 'handoff', 0, stalls, partials);
      expect([retried.status, retried.log.filter((line) => line.startsWith('run download ')).length], `${at} ${retried.output}`).toEqual([0, 2]);
      expect(retried.stdout, at).toContain(`content-calendar: the notify job reads 2 findings, ${String(Buffer.byteLength(list))} bytes`);
      expect(retried.output, at).not.toContain('file exists');
      expect(paced(retried), at).toEqual(['run download', 'sleep 10', 'run download']);
    }
    for (const [at, values, findings] of [
      ['no artifact', { CHECK_RESULT: 'success' }, null],
      ['over MAX_FILE_BYTES', { CHECK_RESULT: 'success', MAX_FILE_BYTES: '100' }, JSON.stringify([{ title: 'Finding 1', body: 'x'.repeat(200) }])],
      ['one byte over MAX_FILE_BYTES', { CHECK_RESULT: 'success', MAX_FILE_BYTES: '100' }, listOf(101)],
      ['a list padded past MAX_FILE_BYTES', { CHECK_RESULT: 'success', MAX_FILE_BYTES: '100' }, PAST_BOUND[0] ?? ''],
      ['a list followed by other bytes past MAX_FILE_BYTES', { CHECK_RESULT: 'success', MAX_FILE_BYTES: '100' }, PAST_BOUND[1] ?? ''],
      ['not a list', { CHECK_RESULT: 'success' }, JSON.stringify({ title: 'x' })],
    ] as const) {
      const failed = runNotify('content-calendar.yml', values, [], findings, 'handoff');
      expect(failed.status, `${at} ${failed.output}`).toBe(1);
      expect(failed.stderr, at).toContain("content-calendar: the notify job could not read this run's findings (the check: success)\n");
      expect(failed.log.filter((line) => !line.startsWith('run download ') && !line.startsWith('sleep ')), at).toEqual([]);
      expect(paced(failed), at).toEqual(findings === null ? ['run download', 'sleep 10', 'run download', 'sleep 10', 'run download'] : ['run download']);
    }
    // An artifact that downloads but holds no findings.json exits 1 with the same message.
    const nameless = runNotify('content-calendar.yml', { CHECK_RESULT: 'success' }, [], list, 'handoff', 0, 0, 0, 'other.txt');
    expect([nameless.status, paced(nameless)], nameless.output).toEqual([1, ['run download']]);
    expect(nameless.stderr).toBe("content-calendar: the notify job could not read this run's findings (the check: success)\n");
  });

  /**
   * Runs notify on a findings file the old transport could not carry and asserts bash started (runNotify), the step's
   * environment, every string with its name, its = and its NUL, is under 131,072 bytes, and the findings are filed.
   */
  function expectCarried(findings: string, filed: number, unfiled: number) {
    const ran = runNotify('content-calendar.yml', { CHECK_RESULT: 'success' }, [], findings);
    expect(ran.status, ran.output).toBe(0);
    expect(Object.entries(ran.env).reduce((bytes, [name, value]) => bytes + Buffer.byteLength(`${name}=${value}`) + 1, 0)).toBeLessThan(131_072);
    const creates = ran.log.filter((line) => line.startsWith('issue create'));
    expect(creates.filter((line) => !line.includes('findings not filed'))).toHaveLength(filed);
    expect(creates.filter((line) => line.includes('findings not filed'))).toHaveLength(unfiled > 0 ? 1 : 0);
    if (unfiled > 0) expect(ran.bodies.at(-1)?.split('\n').filter((line) => line.startsWith('- '))).toHaveLength(unfiled);
  }

  it("content-calendar: notify starts bash and files the finding from a file one byte past the 98,292 bytes FINDINGS_B64 could carry, the over row #86's T6 held (ci-findings-transport)", () => {
    const edge = JSON.stringify([{ title: 'Finding 1', body: 'x'.repeat(98_293 - JSON.stringify([{ title: 'Finding 1', body: '' }]).length) }]);
    expect(Buffer.byteLength(edge)).toBe(98_293);
    expectCarried(edge, 1, 0);
  });

  it('content-calendar: notify starts bash, opens 20 and lists the other 21 titles from the worst 41-finding file, 1,540,660 bytes (ci-findings-transport)', () => {
    // About 62 jq reads of the whole file: 1.3 to 1.5 s on an idle 4-CPU container, 10.2 to 10.7 s on one CPU beside
    // eight busy loops (2026-11-02), so a test of its own, under TEST_TIMEOUT_MS.
    const worst = `${JSON.stringify(
      Array.from({ length: 41 }, () => ({ title: '\u0001'.repeat(256), body: '\u0001'.repeat(6_000) })),
      null,
      2,
    )}\n`;
    expect(Buffer.byteLength(worst)).toBe(1_540_660);
    expectCarried(worst, 20, 21);
  });

  it('release-capacity: runs weekly and on request with a read-only token, builds release 900110 outside the repository and measures the production worker image under the worker task’s limits', () => {
    const capacity = read('release-capacity.yml');
    expect(capacity.on).toEqual({ schedule: [{ cron: '29 3 * * 2' }], workflow_dispatch: null });
    expect(capacity.permissions).toEqual({ contents: 'read' });
    expect(capacity.concurrency).toEqual({ group: 'release-capacity-${{ github.sha }}', 'cancel-in-progress': false });
    expect(Object.keys(capacity.jobs)).toEqual(['capacity', 'notify']);
    const job = capacity.jobs.capacity;
    expect(job?.permissions).toBeUndefined();
    expect(job?.steps[0]).toEqual({ uses: pinOf('actions/checkout'), with: { 'persist-credentials': false } });
    const build = job?.steps.find((step) => usesAction(step, 'docker/build-push-action'));
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

/** github.token as the runner reads it: its names in any case, spaces allowed around the dot (actions/runner, OrdinalIgnoreCase). */
const GITHUB_TOKEN_NAMED = /\bgithub\s*\.\s*token\b/gi;
/**
 * The token by another name, in any case: secrets.GITHUB_TOKEN or secrets[…] (the same token), and the github context,
 * which carries it, indexed, filtered (github.*), joined or as JSON, or toJSON(secrets).
 */
const TOKEN_ELSEWHERE = /\bsecrets\s*[.[]|\bgithub\s*\[|\bgithub\s*\.\s*\*|\bjoin\s*\(\s*github\b|\btojson\s*\(\s*(?:github|secrets)\b/gi;

/**
 * Where ci.yml hands a step the job's token (docs/adr/0066, Part 5; E8, S8): named once, as github.token in the Action
 * pins step's env, and under no other name. GitHub reads an expression's context, property and function names ignoring
 * case (actions/runner's ExpressionParser and DictionaryContextData), so every name is matched in any case and each
 * step's text compared lower-cased (the reviews' CI-S1 and SEC-N2). Improve as you go: inside an expression, the github
 * context is named only by a property (github.<name>), never whole, which would hand a step the token among the rest.
 * The problems, or none.
 */
function tokenProblems(text: string): string[] {
  const problems: string[] = [];
  const named = text.match(GITHUB_TOKEN_NAMED) ?? [];
  if (named.length !== 1) problems.push(`github.token is named ${String(named.length)} times, not once`);
  const parsed = parse(text) as Workflow;
  const holders = Object.entries(parsed.jobs).flatMap(([id, job]) =>
    job.steps.flatMap((step, index) => (new RegExp(GITHUB_TOKEN_NAMED.source).test(JSON.stringify(step).toLowerCase()) ? [step.name ?? `${id} step ${String(index + 1)}`] : [])),
  );
  if (!isDeepStrictEqual(holders, ['Action pins'])) problems.push(`the steps naming github.token are ${JSON.stringify(holders)}, not the Action pins step alone`);
  const pins = parsed.jobs.static?.steps.find((step) => step.name === 'Action pins');
  if (pins?.env?.GITHUB_TOKEN !== '${{ github.token }}') problems.push(`the Action pins step's GITHUB_TOKEN is ${JSON.stringify(pins?.env?.GITHUB_TOKEN)}, not \${{ github.token }}`);
  for (const match of text.matchAll(TOKEN_ELSEWHERE)) problems.push(`${match[0]}: reaches the token by another name`);
  for (const [expression] of text.matchAll(/\$\{\{[\s\S]*?\}\}/g)) {
    // String literals dropped first, so 'https://github.com' or 'github-x' in one is no name.
    if (/\bgithub\b(?!\s*\.\s*[A-Za-z_])/i.test(expression.replace(/'(?:[^']|'')*'/g, "''"))) problems.push(`${expression}: names the whole github context, the token among it`);
  }
  return problems;
}

describe('ci.yml: every gate as parallel jobs behind one all green gate (docs/adr/0066, Part 1)', () => {
  const ci = workflow('ci.yml');
  const JOBS = ['static', 'lint', 'unit', 'db', 'domain-model', 'build', 'e2e', 'images', 'all-green'];

  it('runs on every pull request and every push to the build branch, with no path filter, a read-only token and bash with pipefail', () => {
    expect(ci.on).toEqual({ pull_request: null, push: { branches: ['claude/build-platform'] } });
    // The whole workflow reads the repository and nothing more, no checkout keeps the token, and only the Action pins step is given it.
    expect(ci.permissions).toEqual({ contents: 'read' });
    for (const [id, job] of Object.entries(ci.jobs)) {
      for (const step of job.steps.filter((candidate) => usesAction(candidate, 'actions/checkout'))) {
        expect(step.with?.['persist-credentials'], id).toBe(false);
      }
    }
    // The token is named once, in that step's env, and under no other name (tokenProblems).
    expect(tokenProblems(readFileSync(path.join(WORKFLOWS, 'ci.yml'), 'utf8'))).toEqual([]);
    expect(ci.defaults).toEqual({ run: { shell: 'bash' } });
  });

  it('refuses the token handed to a second step under any spelling GitHub reads, its names in any case (the reviews’ CI-S1 and SEC-N2)', () => {
    const text = readFileSync(path.join(WORKFLOWS, 'ci.yml'), 'utf8');
    const toolchain = '        env: { BASE: "${{ steps.range.outputs.base }}" }\n        run: pnpm toolchain:check\n';
    // The Toolchain step given the token as the reviewers wrote it: each reaches the same token, and the runner reads it.
    const given = (value: string) => text.replace(toolchain, `        env: { BASE: "\${{ steps.range.outputs.base }}", T: "${value}" }\n        run: pnpm toolchain:check\n`);
    const forms = ['${{ GITHUB.TOKEN }}', '${{ Secrets.GITHUB_TOKEN }}', '${{ ToJSON(GitHub) }}', "${{ join(github.*, ',') }}", '${{ github[\'token\'] }}', '${{ github . token }}', "${{ format('{0}', github) }}"];
    expect(forms.map((form) => given(form) === text)).toEqual(forms.map(() => false));
    expect(tokenProblems(given('${{ GITHUB.TOKEN }}'))).toEqual(['github.token is named 2 times, not once', 'the steps naming github.token are ["Action pins","Toolchain"], not the Action pins step alone']);
    for (const form of forms) expect(tokenProblems(given(form)), form).not.toEqual([]);
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
      expect(steps()[0]).toEqual({ uses: pinOf('actions/checkout'), with: { 'fetch-depth': 0, 'persist-credentials': false } });
      const install = stepIndex(steps(), (step) => step.run === 'pnpm install --frozen-lockfile');
      const checks = ['pnpm audit --prod', 'pnpm audit --audit-level=high', 'pnpm check:fixtures', 'pnpm verify-content', 'pnpm synth --all', 'pnpm typecheck', 'pnpm lint:logs', 'pnpm test:golden', 'pnpm test:oracle', 'pnpm licenses:check'];
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
      // The action pins and the toolchain, each once, after the install and the range step, against the range's base:
      // on every run, with no condition beyond the two steps they need (docs/adr/0066, Part 2).
      const range = stepIndex(steps(), (step) => step.id === 'range');
      // The action pins step alone also gets the job's read-only token, for the age rule's API reads (Part 5); the
      // toolchain reads npm and Docker Hub only.
      for (const [run, env] of [
        ['pnpm actions:check', { BASE: '${{ steps.range.outputs.base }}', GITHUB_TOKEN: '${{ github.token }}' }],
        ['pnpm toolchain:check', { BASE: '${{ steps.range.outputs.base }}' }],
      ] as const) {
        const at = stepIndex(steps(), (step) => step.run === run);
        expect(steps().filter((step) => step.run === run), run).toHaveLength(1);
        expect([at > install, at > range], run).toEqual([true, true]);
        expect(steps()[at]?.if, run).toBe("${{ !cancelled() && steps.install.outcome == 'success' && steps.range.outcome == 'success' }}");
        expect(steps()[at]?.env, run).toEqual(env);
      }
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
      expect(steps()[0]).toEqual({ uses: pinOf('actions/checkout'), with: { 'fetch-depth': 0, 'persist-credentials': false } });
      const install = stepIndex(steps(), (step) => step.run === 'pnpm --filter @tp/web exec playwright install --with-deps chromium');
      const base = stepIndex(steps(), (step) => step.name === "The engine freeze's base");
      const unit = stepIndex(steps(), (step) => step.run === 'pnpm test');
      expect([install < unit, base < unit]).toEqual([true, true]);
      // Past a red browser check too, so a Playwright upgrade's other effects show (docs/adr/0066, Part 3).
      expect(steps()[unit]).toEqual({ run: 'pnpm test', if: AFTER_CHECK });
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
        // The whole file the step writes, so a second line (a newline in the value) is caught as the first is.
        return { ...result, written: readFileSync(file, 'utf8') };
      };
      expect(run({ EVENT: 'pull_request', BASE_REF: 'main', BEFORE: '' })).toMatchObject({ status: 0, written: `ENGINE_FREEZE_BASE=${repo.first}\n` });
      expect(run({ EVENT: 'push', BASE_REF: '', BEFORE: repo.second })).toMatchObject({ status: 0, written: `ENGINE_FREEZE_BASE=${repo.second}\n` });
      expect(run({ EVENT: 'push', BASE_REF: '', BEFORE: '0000000000000000000000000000000000000000' })).toMatchObject({ status: 0, written: `ENGINE_FREEZE_BASE=${repo.second}\n` });
      expect(run({ EVENT: 'push', BASE_REF: '', BEFORE: 'e'.repeat(40) })).toMatchObject({ status: 1, written: '' });
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
      expect(job().services).toBeUndefined();
      expect(job().env).toEqual({ DATABASE_URL: 'postgres://postgres:test@localhost:5432/postgres' });
      const quiet = stepIndex(steps(), (step) => step.name === "Quiet the database's log");
      const chromium = stepIndex(steps(), (step) => CHROMIUM_INSTALL.test(step.run ?? ''));
      const suite = stepIndex(steps(), (step) => step.name === "The database suite, this shard's files");
      expect([quiet < suite, chromium < suite, chromium < quiet]).toEqual([true, true, true]);
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
      expect(job().services).toBeUndefined();
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
      expect(steps()[0]).toEqual({ uses: pinOf('actions/checkout'), with: { 'fetch-depth': 0, 'persist-credentials': false } });
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
      expect(job.services).toBeUndefined();
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

    it('prints a failed shard’s screenshot diffs and actuals into its log, each under 300 KB as its SHA-256 and then its base64 in numbered chunks of 8,000 characters', () => {
      const steps = ciJob('e2e').steps;
      const print = stepIndex(steps, (step) => step.run?.includes("-name '*-diff.png'") === true);
      expect(print).toBeGreaterThan(stepIndex(steps, (step) => usesAction(step, 'actions/upload-artifact')));
      const step = steps[print] as Step;
      expect(step.name).toBe("The failed comparisons' pictures");
      expect(step.if).toBe('failure()');
      // One printer for both of the job's prints (tools/ci/print-pictures.sh, its own test), so neither prints a picture
      // on one line that a log reader may cut.
      expect(step.run).toContain("find apps/web/test-results -type f \\( -name '*-diff.png' -o -name '*-actual.png' \\) -size -300k | LC_ALL=C sort | tools/ci/print-pictures.sh");
      expect(step.run).not.toMatch(/base64|sha256sum/);
      const baselines = stepNamed(steps, 'The brand baselines, regenerated from nothing').run ?? '';
      expect(baselines).toContain('printer="$PWD/tools/ci/print-pictures.sh"');
      expect(baselines).toContain('| LC_ALL=C sort -u | (cd "$fresh" && "$printer")');
      // Run as GitHub runs it: a shard that left no results prints nothing and passes; one that did prints each picture.
      const dir = mkdtempSync(path.join(scratch, 'pictures-'));
      mkdirSync(path.join(dir, 'tools/ci'), { recursive: true });
      copyFileSync(path.join(repositoryRoot, 'tools/ci/print-pictures.sh'), path.join(dir, 'tools/ci/print-pictures.sh'));
      expect(runScript(step.run ?? '', {}, dir)).toEqual({ status: 0, output: '' });
      // The pictures need GNU base64's -w, as the runner has. On CI (CI set to anything but empty or "false", as
      // tools/test/ci-chromium.ts reads it) they run whatever, so a runner without it fails here rather than skip
      // them; elsewhere, where a BSD base64 has no -w, only the empty case runs.
      const onCi = process.env.CI !== undefined && process.env.CI !== '' && process.env.CI !== 'false';
      if (onCi || spawnSync('base64', ['-w', '0'], { input: '' }).status === 0) {
        mkdirSync(path.join(dir, 'apps/web/test-results/brand'), { recursive: true });
        writeFileSync(path.join(dir, 'apps/web/test-results/brand/header-diff.png'), 'png');
        writeFileSync(path.join(dir, 'apps/web/test-results/brand/header-expected.png'), 'png');
        const name = 'apps/web/test-results/brand/header-diff.png';
        expect(runScript(step.run ?? '', {}, dir)).toEqual({ status: 0, output: `${name} sha256 ${createHash('sha256').update('png').digest('hex')}\n${name} 1/1 ${Buffer.from('png').toString('base64')}\n` });
      }
    });
  });

  it('names every artifact once per run and lets a re-run of failed jobs replace it, in every workflow (upload-artifact v7 names are unique per run and immutable)', () => {
    const uploads = Object.entries(ci.jobs).flatMap(([id, job]) => job.steps.filter((step) => usesAction(step, 'actions/upload-artifact')).map((step) => ({ id, job, step })));
    expect(uploads.map(({ id }) => id)).toEqual(['build', 'e2e']);
    for (const { id, job, step } of uploads) {
      // A matrix job's artifact carries its shard, so no two of its jobs write one name.
      if (job.strategy?.matrix !== undefined) expect(String(step.with?.name), id).toContain('${{ matrix.shard }}');
    }
    // Every upload of every workflow, the release's three and its dry run's included, overwrites, so a re-run of a
    // failed job replaces what its first attempt left instead of failing on the name; and in a matrix job, of any
    // workflow, the name carries a matrix value, so no two legs write one name (the release's build and its dry run's
    // upload each leg's archive as image-<image>).
    const every = workflowFiles().flatMap((file) => Object.entries(workflow(file).jobs).flatMap(([id, job]) => job.steps.filter((step) => usesAction(step, 'actions/upload-artifact')).map((step) => ({ where: `${file} ${id}`, job, step }))));
    expect(every.filter(({ where }) => where.startsWith('release.yml ')).length).toBe(3);
    expect(every.filter(({ where }) => where.startsWith('release-dry-run.yml ')).map(({ step }) => step.with?.name)).toEqual(['image-${{ matrix.image }}']);
    for (const { where, step } of every) expect(step.with?.overwrite, where).toBe(true);
    for (const { where, job, step } of every.filter((upload) => upload.job.strategy?.matrix !== undefined)) {
      expect(String(step.with?.name), where).toMatch(new RegExp(`\\$\\{\\{ matrix\\.(?:${Object.keys(job.strategy?.matrix ?? {}).map(escaped).join('|')}) \\}\\}`));
    }
  });

  it('builds both images into archives and scans each archive in one job, failing on HIGH or CRITICAL, the worker whatever the web image did', () => {
    const steps = ciJob('images').steps;
    const builds = steps.filter((step) => usesAction(step, 'docker/build-push-action'));
    expect(builds.map((step) => [step.with?.file, step.with?.push, step.with?.tags, step.with?.outputs, step.with?.load])).toEqual([
      ['apps/web/Dockerfile', false, 'tp-web:scan', 'type=docker,dest=${{ runner.temp }}/image/web.tar', undefined],
      ['apps/worker/Dockerfile', false, 'tp-worker:scan', 'type=docker,dest=${{ runner.temp }}/image/worker.tar', undefined],
    ]);
    // The archives' directory exists before the first build writes into it.
    expect(stepIndex(steps, (step) => step.run === 'mkdir -p "$RUNNER_TEMP/image"')).toBeLessThan(steps.indexOf(builds[0] as Step));
    const scans = steps.filter(isScan);
    // Trivy reads each archive, the bytes the checks below read, never the daemon's store, whose containerd form its
    // daemon source would have to understand (the review's S10).
    expect(scans.map((step) => [step.with?.input, step.with?.['image-ref'], step.with?.severity, step.with?.['ignore-unfixed']])).toEqual([
      ['${{ runner.temp }}/image/web.tar', undefined, 'HIGH,CRITICAL', true],
      ['${{ runner.temp }}/image/worker.tar', undefined, 'HIGH,CRITICAL', true],
    ]);
    expect(steps.indexOf(scans[0] as Step)).toBe(steps.indexOf(builds[0] as Step) + 1);
    expect(steps.indexOf(scans[1] as Step)).toBe(steps.indexOf(builds[1] as Step) + 1);
    expect(builds[0]?.id).toBe('web');
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

  it('proves on every pull request, on ubuntu-26.04’s image store, the release’s identity rules and the worker image’s headless shell (docs/adr/0066, Part 3)', () => {
    const steps = ciJob('images').steps;
    const node = stepIndex(steps, (step) => usesAction(step, 'actions/setup-node'));
    expect(steps[node]?.with).toEqual({ 'node-version': 24, 'package-manager-cache': false });
    expect(steps[node]?.if).toBe('${{ !cancelled() }}');
    // Each archive's config digest, read from its bytes, is the one buildx reports for its build.
    const web = stepNamed(steps, 'The web archive holds the image buildx built');
    expect(web.if).toBe("${{ !cancelled() && steps.web.outcome == 'success' }}");
    expect(web.env).toEqual({ BUILT: "${{ fromJSON(steps.web.outputs.metadata || '{}')['containerimage.config.digest'] }}" });
    expect(web.run).toContain('built="$BUILT"');
    expect(web.run).toContain(`read="$(node tools/screening-capacity/image-id.ts "$RUNNER_TEMP/image/web.tar" | jq -r '.config')"`);
    expect(web.run).toContain('if [ -z "$built" ] || [ "$read" != "$built" ]; then');
    // The worker's too, then it loads as the archive's top-level descriptor on the containerd store (its config digest
    // on the classic one), as release.yml's push job checks before pushing.
    const worker = stepNamed(steps, 'The worker archive holds the image buildx built, and loads as itself');
    expect(worker.id).toBe('worker-identity');
    expect(worker.if).toBe("${{ !cancelled() && steps.worker.outcome == 'success' }}");
    expect(worker.env).toEqual({ BUILT: "${{ fromJSON(steps.worker.outputs.metadata || '{}')['containerimage.config.digest'] }}" });
    expect(worker.run).toContain('built="$BUILT"');
    const script = worker.run ?? '';
    expect(script).toContain('identity="$(node tools/screening-capacity/image-id.ts "$RUNNER_TEMP/image/worker.tar")"');
    expect(script).toContain('docker load --input "$RUNNER_TEMP/image/worker.tar"');
    expect(script).toContain('if [ "$store" = containerd ]; then want="$target"; else want="$config"; fi');
    expect(script).toContain(`id="$(docker image inspect -f '{{.Id}}' tp-worker:scan)"`);
    expect(script.indexOf('if [ -z "$built" ] || [ "$config" != "$built" ]; then')).toBeLessThan(script.indexOf('docker load'));
    // Its headless shell, which prints customers' reports, against browser.json, inside the image.
    const browser = stepNamed(steps, "The worker image's headless shell is browser.json's");
    expect(browser.run).toBe(`${BROWSER_CHECK} --image tp-worker:scan`);
    expect(browser.if).toBe("${{ !cancelled() && steps.worker-identity.outcome == 'success' }}");
    const scans = steps.filter(isScan).map((step) => steps.indexOf(step));
    expect([Math.max(...scans) < node, node < steps.indexOf(web), steps.indexOf(web) < steps.indexOf(worker), steps.indexOf(worker) < steps.indexOf(browser)]).toEqual([true, true, true, true]);
  });

  /**
   * buildx's metadata output as build-push-action sets it (`JSON.stringify(metadata, null, 2)`, its src/main.ts:139 at
   * v7.4.0), keyed as buildx v0.38.1 writes it on a pull request (#42's job 122624309161): its provenance holds the whole
   * event, whose description here is a synthetic ruler, cut so the output is exactly `bytes` bytes of UTF-8.
   */
  function buildxMetadata(digest: string | undefined, bytes: number): string {
    let ruler = '| Row | Characters so far | What it is |\n| --- | --- | --- |\n';
    for (let row = 1; row <= 1_400; row += 1) {
      const prefix = `| ${String(row).padStart(4, '0')} | `;
      ruler += `${prefix}${String(ruler.length + 100).padStart(7, '0')}${' | synthetic length-test row, no data |\n'.padStart(100 - prefix.length - 7)}`;
    }
    const text = (body: string) =>
      JSON.stringify(
        {
          'buildx.build.provenance': {
            buildType: 'https://mobyproject.org/buildkit@v1',
            invocation: { environment: { github_event_name: 'pull_request', github_event_payload: { action: 'synchronize', number: 1, pull_request: { number: 1, title: 'Synthetic length test', body } } } },
          },
          'buildx.build.ref': 'builder-synthetic/builder-synthetic0/synthetic',
          ...(digest === undefined ? {} : { 'containerimage.config.digest': digest }),
          'containerimage.digest': `sha256:${'0'.repeat(64)}`,
          'image.name': 'docker.io/library/tp-synthetic:scan',
        },
        null,
        2,
      );
    // Each character cut is at least one byte (a newline two, as \n), so the cut leaves at most `bytes`; dots fill the rest.
    let body = ruler.slice(0, ruler.length - (Buffer.byteLength(text(ruler)) - bytes));
    while (Buffer.byteLength(text(body)) < bytes) body += '.';
    return text(body);
  }

  /**
   * A step's env as the runner evaluates it from the builds' metadata outputs, in the two forms an identity step has
   * had: the whole output, or `fromJSON(output || '{}')[key]`, whose missing key (or a non-object) is null and so ''
   * (docs/adr/0066, Part 3, N32). Any other form fails the test.
   */
  function identityEnv(step: Step, metadata: Readonly<Record<string, string>>): Record<string, string> {
    return Object.fromEntries(
      Object.entries(step.env ?? {}).map(([name, value]): [string, string] => {
        const whole = /^\$\{\{ steps\.([\w-]+)\.outputs\.metadata \}\}$/.exec(value);
        if (whole !== null) return [name, metadata[whole[1] ?? ''] ?? ''];
        const keyed = /^\$\{\{ fromJSON\(steps\.([\w-]+)\.outputs\.metadata \|\| '\{\}'\)\['([^']+)'\] \}\}$/.exec(value);
        if (keyed === null) throw new Error(`${name}: ${value} is a form this emulator does not know`);
        const parsed: unknown = JSON.parse(metadata[keyed[1] ?? ''] || '{}');
        const found = isRecord(parsed) ? parsed[keyed[2] ?? ''] : undefined;
        if (typeof found === 'string') return [name, found];
        if (found === undefined || found === null) return [name, ''];
        throw new Error(`${name}: ${value} is a ${typeof found}, a value this emulator does not know`);
      }),
    );
  }

  it('starts and passes both identity steps when buildx’s metadata is 132,377 bytes, and names a missing or other digest (run 40630123457)', () => {
    const steps = ciJob('images').steps;
    const web = stepNamed(steps, 'The web archive holds the image buildx built');
    const worker = stepNamed(steps, 'The worker archive holds the image buildx built, and loads as itself');
    const dir = mkdtempSync(path.join(scratch, 'identity-'));
    const temp = path.join(dir, 'runner-temp');
    mkdirSync(path.join(temp, 'image'), { recursive: true });
    // A synthetic archive of each image, as image-id.ts reads buildx's type=docker export.
    const images = { web: attestedArchive(), worker: attestedArchive(CONFIG.replace('"User":"node"', '"User":"worker"')) };
    expect(images.worker.config).not.toBe(images.web.config);
    writeFileSync(path.join(temp, 'image/web.tar'), images.web.archive);
    writeFileSync(path.join(temp, 'image/worker.tar'), images.worker.archive);
    // docker on either image store: tp-worker:scan loads as the archive's top-level descriptor on the containerd store,
    // as its config digest on the classic one.
    const dockerOn = (store: 'classic' | 'containerd') => {
      const home = mkdtempSync(path.join(dir, `docker-${store}-`));
      writeFileSync(path.join(home, 'id-tp-worker'), `${store === 'containerd' ? images.worker.target : images.worker.config}\n`);
      return standInDocker(home, store);
    };
    const bins = { containerd: dockerOn('containerd'), classic: dockerOn('classic') };
    /** The step's script as the runner starts it (a file, bash --noprofile --norc -e -o pipefail), with this environment alone. */
    const run = (step: Step, metadata: Readonly<Record<string, string>>, store: 'classic' | 'containerd' = 'containerd') => {
      const env = { PATH: `${bins[store]}:${process.env.PATH ?? '/usr/bin:/bin'}`, RUNNER_TEMP: temp, ...identityEnv(step, metadata) };
      const file = path.join(dir, 'step.sh');
      writeFileSync(file, step.run ?? '');
      const result = spawnSync('bash', ['--noprofile', '--norc', '-e', '-o', 'pipefail', file], { cwd: repositoryRoot, encoding: 'utf8', env, timeout: TEST_TIMEOUT_MS, killSignal: 'SIGKILL' });
      // First, as #42's job met it: one environment string over 131,072 bytes stops bash before it starts (E2BIG), and
      // there is no output to read.
      expect(result.error?.message, `${step.name ?? ''}: bash did not start`).toBeUndefined();
      // Every string of the step's environment, each with its name, its = and its NUL.
      expect(Object.entries(env).reduce((bytes, [name, value]) => bytes + Buffer.byteLength(`${name}=${value}`) + 1, 0)).toBeLessThan(131_072);
      return [result.status, result.stdout + result.stderr] as const;
    };
    const outputs = (webDigest: string | undefined, workerDigest: string | undefined) => ({ web: buildxMetadata(webDigest, 132_377), worker: buildxMetadata(workerDigest, 132_377) });

    // #42's size: the web metadata whole, as METADATA= and its NUL, was 132,387 bytes.
    const built = outputs(images.web.config, images.worker.config);
    expect([Buffer.byteLength(built.web), Buffer.byteLength(`METADATA=${built.web}`) + 1]).toEqual([132_377, 132_387]);
    expect(run(web, built)).toEqual([0, expect.stringContaining(`web: config ${images.web.config}\n`)]);
    for (const store of ['containerd', 'classic'] as const) {
      const id = store === 'containerd' ? images.worker.target : images.worker.config;
      expect(run(worker, built, store), store).toEqual([0, expect.stringContaining(`worker: config ${images.worker.config}, target ${images.worker.target}, loaded as ${id} on the ${store} image store\n`)]);
    }
    // An empty output (its build failed or was cancelled) and a metadata without the key each stop on the step's own message.
    for (const [why, nothing] of Object.entries({ 'an empty output': { web: '', worker: '' }, 'no config digest': outputs(undefined, undefined) })) {
      expect(run(web, nothing), why).toEqual([1, expect.stringContaining(`::error title=The web archive::its config digest is ${images.web.config}, and buildx built nothing it reported`)]);
      expect(run(worker, nothing), why).toEqual([1, expect.stringContaining(`::error title=The worker archive::its config digest is ${images.worker.config}, and buildx built nothing it reported`)]);
    }
    // Another digest names both.
    const other = `sha256:${'1'.repeat(64)}`;
    expect(run(web, outputs(other, other))).toEqual([1, expect.stringContaining(`its config digest is ${images.web.config}, and buildx built ${other}`)]);
    expect(run(worker, outputs(other, other))).toEqual([1, expect.stringContaining(`its config digest is ${images.worker.config}, and buildx built ${other}`)]);
  });

  it('checks production licenses against the allowlist on every pull request', () => {
    expect(ciJob('static').steps.some((step) => step.run === 'pnpm licenses:check')).toBe(true);
  });

  it('installs Playwright’s own Chromium, with its system libraries, wherever vitest or the journeys run, from cached system packages checked against the signed index, and checks the browser builds right after, so the printing tests run and the brand baselines compare under the build that made them', () => {
    for (const id of ['unit', 'db', 'e2e']) {
      const steps = ciJob(id).steps;
      const install = stepIndex(steps, (step) => step.run === BROWSER_INSTALL);
      expect(install, id).toBeGreaterThan(stepIndex(steps, (step) => step.run === 'pnpm install --frozen-lockfile'));
      // The browsers from the cache, keyed by the builds this Playwright pins, so the install fetches only the system
      // libraries on a hit; those from apt's cache, each kept only when the signed index gives its SHA-256 (V3); then
      // the install, then the check of every file of both builds against browser.json (docs/adr/0066, Part 3).
      expect(steps.slice(install - 4, install + 2), id).toEqual([
        { name: "Restore Playwright's browsers", id: 'browsers', uses: pinOf('actions/cache/restore'), with: { path: '~/.cache/ms-playwright', key: `playwright-v1-\${{ runner.os }}-\${{ hashFiles('${BROWSERS_JSON}') }}` } },
        { name: 'The runner image', id: 'runner-image', run: expect.any(String) as unknown },
        { name: "Restore the browsers' system packages", id: 'apt', uses: pinOf('actions/cache/restore'), with: APT_RESTORE },
        { name: 'Check the restored system packages against the signed index', run: 'tools/ci/apt-archives.sh verify "$RUNNER_TEMP/apt-archives"' },
        { id: 'browser-install', run: BROWSER_INSTALL },
        { name: 'Check the browser builds against browser.json', run: BROWSER_CHECK },
      ]);
    }
    // Saved once a run, by the unit job, on a miss, before anything else runs and only after the check passed (a save's
    // default condition): a build that failed its check is never cached. The system packages are saved by the build
    // branch's own runs alone.
    const unit = ciJob('unit').steps;
    const check = stepIndex(unit, (step) => step.run === BROWSER_CHECK);
    expect(unit.slice(check + 1, check + 4)).toEqual([
      { name: "Save Playwright's browsers", if: "${{ steps.browsers.outputs.cache-hit != 'true' }}", uses: pinOf('actions/cache/save'), with: { path: '~/.cache/ms-playwright', key: '${{ steps.browsers.outputs.cache-primary-key }}' } },
      { name: 'Collect the system packages apt downloaded', if: APT_SAVE_IF, run: 'tools/ci/apt-archives.sh collect "$RUNNER_TEMP/apt-archives"' },
      { name: "Save the browsers' system packages", if: APT_SAVE_IF, uses: pinOf('actions/cache/save'), with: { path: APT_RESTORE.path, key: '${{ steps.apt.outputs.cache-primary-key }}' } },
    ]);
    // No other job writes either key: the capacity job keeps its own runner image's system packages under its own key.
    const savers = workflowFiles().flatMap((file) =>
      Object.entries(workflow(file).jobs).flatMap(([id, job]) => job.steps.filter((step) => usesAction(step, 'actions/cache/save') && [APT_RESTORE.path, '~/.cache/ms-playwright'].includes(String(step.with?.path))).map((step) => ({ where: `${file} ${id} ${String(step.with?.path)}`, step }))),
    );
    expect(savers.map(({ where }) => where)).toEqual(['ci.yml unit ~/.cache/ms-playwright', 'ci.yml unit ${{ runner.temp }}/apt-archives', 'screening-capacity.yml capacity ${{ runner.temp }}/apt-archives']);
    for (const { where, step } of savers) expect(step.if, where).not.toMatch(/always\(\)|cancelled\(\)|failure\(\)/);
    // The runner image from the runner's environment (the env context holds only what a workflow sets): both outputs.
    const image = stepNamed(unit, 'The runner image');
    expect(image.run).toContain('echo "key=$ImageOS-$ImageVersion" >> "$GITHUB_OUTPUT"');
    expect(image.run).toContain('echo "os=$ImageOS" >> "$GITHUB_OUTPUT"');
    expect(image.run).toContain('if [ -z "${ImageOS:-}" ] || [ -z "${ImageVersion:-}" ]; then');
    // The key's file is the one playwright-core this lockfile installs: it names the browser builds the install fetches.
    // CI installs into an empty node_modules, so the glob finds one; a local install after an upgrade can keep the old
    // playwright-core as an orphan for up to seven days, which this names with its remedy rather than passing over.
    const store = path.join(repositoryRoot, 'node_modules/.pnpm');
    const cores = readdirSync(store).filter((name) => name.startsWith('playwright-core@') && existsSync(path.join(store, name, 'node_modules/playwright-core/browsers.json')));
    expect(cores, `the apt key's glob over node_modules/.pnpm must find exactly the playwright-core the lockfile installs; an orphan of an earlier install goes with pnpm install --frozen-lockfile --config.modules-cache-max-age=0 (docs/runbooks/ci.md, "Upgrading the browser")`).toEqual([`playwright-core@${(JSON.parse(readFileSync(path.join(repositoryRoot, 'apps/web/node_modules/@playwright/test/package.json'), 'utf8')) as { version: string }).version}`]);
    // The config takes that Chromium wherever it is installed, and Google Chrome only where it is not (docs/adr/0058).
    const config = readFileSync(path.join(repositoryRoot, 'apps/web/playwright.config.ts'), 'utf8');
    expect(config).toContain('const bundledChromium = existsSync(chromium.executablePath());');
    expect(config).toContain("...(bundledChromium ? {} : { channel: 'chrome' })");
    // The baselines the brand journey compares are committed for that browser on Linux.
    for (const name of ['header-1280', 'header-390', 'header-lockup-1280', 'header-lockup-390', 'report-cover-with-seal', 'report-cover-without-seal', 'report-cover-top']) {
      expect(existsSync(path.join(repositoryRoot, 'apps/web/e2e/brand.spec.ts-snapshots', `${name}-chromium-linux.png`)), name).toBe(true);
    }
  });

  it('follows every browser install of every workflow with the browser check, and in ci.yml and large-zip runs every later step past a red check as long as the install succeeded, caching nothing then (the review’s S4 and S9)', () => {
    const installs = workflowFiles().flatMap((file) =>
      Object.entries(workflow(file).jobs).flatMap(([id, job]) =>
        job.steps
          .map((step, index) => ({ file, id, job, step, index }))
          .filter(({ step }) => CHROMIUM_INSTALL.test(step.run ?? '')),
      ),
    );
    expect(installs.map(({ file, id }) => `${file} ${id}`)).toEqual(['ci.yml unit', 'ci.yml db', 'ci.yml e2e', 'large-zip.yml large-zip', 'release.yml capacity', 'screening-capacity.yml capacity']);
    for (const { file, id, job, step, index } of installs) {
      const where = `${file} ${id}`;
      expect(step, where).toMatchObject({ id: 'browser-install', run: BROWSER_INSTALL });
      expect(job.steps[index + 1], where).toEqual({ name: 'Check the browser builds against browser.json', run: BROWSER_CHECK });
      // Nothing is cached before the check.
      expect(job.steps.slice(0, index + 2).filter((candidate) => usesAction(candidate, 'actions/cache/save')), where).toEqual([]);
      const later = job.steps.slice(index + 2);
      if (file === 'ci.yml' || file === 'large-zip.yml') {
        // Every later step runs on a condition of its own: a test step past a red check, a cache save only after a
        // passing one (its default success()), a report or a log whatever happened.
        for (const after of later) {
          const what = `${where}: ${after.name ?? after.run?.split('\n')[0] ?? after.uses ?? ''}`;
          expect(after.if, what).toBeDefined();
          const caches = after.run?.includes('apt-archives.sh collect') === true || (usesAction(after, 'actions/cache/save') && [APT_RESTORE.path, '~/.cache/ms-playwright'].includes(String(after.with?.path)));
          if (caches) expect(after.if, what).not.toMatch(/always\(\)|cancelled\(\)|failure\(\)/);
        }
        const tests = later.filter((after) => /\bpnpm test\b|test:db|test:e2e|vitest run/.test(after.run ?? ''));
        expect(tests.length, where).toBe(1);
        for (const test of tests) expect(test.if, where).toBe(AFTER_CHECK);
      } else {
        // The capacity jobs measure only with the recorded browser: nothing after the check runs past a red one.
        const measure = later.findIndex((after) => after.run?.includes('pnpm screening:capacity') === true);
        expect(measure, where).toBeGreaterThanOrEqual(0);
        for (const after of later.slice(0, measure + 1)) expect(after.if ?? '', `${where}: ${after.name ?? after.run ?? ''}`).not.toMatch(/always\(\)|cancelled\(\)|failure\(\)/);
      }
    }
    // The same check with --image on the worker image: in ci.yml's images job, in the release's build and its dry run's
    // before the save, and in both measuring jobs that build it before the measurement (below).
    const imageChecks = workflowFiles().flatMap((file) => Object.entries(workflow(file).jobs).flatMap(([id, job]) => job.steps.filter((step) => step.run?.startsWith(`${BROWSER_CHECK} --image`) === true).map(() => `${file} ${id}`)));
    expect(imageChecks).toEqual(['ci.yml images', 'release-capacity.yml capacity', 'release-dry-run.yml build', 'release.yml build', 'screening-capacity.yml capacity']);
  });

  it('checks the headless shell of every worker image a job builds into a local tag with --image before the tag is measured, saved, tagged or pushed, on Node 24 (design 3.3.7; the review’s S6)', () => {
    expect(workflowFiles().flatMap((file) => workerImageProblems(file, workflow(file)))).toEqual([]);
    // The jobs that build it, each checked by the rule above: none is left out by a form the rule does not read.
    const builders = workflowFiles().flatMap((file) => Object.entries(workflow(file).jobs).flatMap(([id, job]) => (JSON.stringify(job.steps).includes('apps/worker/Dockerfile') && job.steps.some((step) => usesAction(step, 'docker/build-push-action')) ? [`${file} ${id}`] : [])));
    expect(builders).toEqual(['ci.yml images', 'release-capacity.yml capacity', 'release-dry-run.yml build', 'release.yml build', 'screening-capacity.yml capacity']);
    // The two measuring jobs check the image before anything is installed, so no installed package runs before it;
    // release-capacity's Node 24 for it restores no cache, while its own pnpm setup keeps cache: pnpm after.
    for (const file of ['release-capacity.yml', 'screening-capacity.yml']) {
      const steps = workflow(file).jobs.capacity?.steps ?? [];
      const check = stepIndex(steps, (step) => step.run === `${BROWSER_CHECK} --image tp-worker:capacity`);
      expect(steps[check], file).toEqual({ name: "Check the worker image's headless shell against browser.json", run: `${BROWSER_CHECK} --image tp-worker:capacity` });
      expect(check, file).toBeLessThan(stepIndex(steps, (step) => step.run === 'pnpm install --frozen-lockfile'));
      expect(check, file).toBeLessThan(stepIndex(steps, (step) => step.run?.includes('--worker-image tp-worker:capacity') === true));
    }
    const weekly = workflow('release-capacity.yml').jobs.capacity?.steps ?? [];
    const check = stepIndex(weekly, (step) => step.run === `${BROWSER_CHECK} --image tp-worker:capacity`);
    expect(weekly[check - 1]).toEqual({ uses: pinOf('actions/setup-node'), with: { 'node-version': 24, 'package-manager-cache': false } });
    expect(usesAction(weekly[check - 2] ?? {}, 'docker/build-push-action')).toBe(true);
    const screening = workflow('screening-capacity.yml').jobs.capacity?.steps ?? [];
    expect(screening[stepIndex(screening, (step) => step.run === `${BROWSER_CHECK} --image tp-worker:capacity`) - 1]?.name).toBe('Load the images as built');
  });

  it('refuses a worker image build whose headless shell is not checked before its tag is used, and a check without Node 24 before it', () => {
    const problems = (steps: string) => workerImageProblems('fixture.yml', parse(`name: fixture\non: push\njobs: { a: { runs-on: ubuntu-24.04, steps: [${steps}] } }`) as Workflow);
    const node = `{ uses: 'actions/setup-node@${'1'.repeat(40)}', with: { node-version: 24 } }`;
    const loaded = "{ uses: 'docker/build-push-action@x', with: { file: apps/worker/Dockerfile, load: true, tags: 'tp-worker:t' } }";
    const archived = "{ uses: 'docker/build-push-action@x', with: { file: apps/worker/Dockerfile, tags: 'tp-worker:t', outputs: 'type=docker,dest=/tmp/w.tar' } }";
    const load = "{ run: 'docker load --input /tmp/w.tar' }";
    const check = "{ run: 'node tools/ci/browser-build.ts --image tp-worker:t' }";
    const measure = "{ run: 'pnpm exec tsx run.ts --worker-image tp-worker:t' }";
    expect(problems(`${loaded}, ${node}, ${check}, ${measure}`)).toEqual([]);
    expect(problems(`${archived}, ${node}, ${load}, ${check}, ${measure}`)).toEqual([]);
    // The release's form: the Dockerfile and the tag from a naming step, the check through the step's env, then the save.
    const named = "{ id: image, run: 'echo dockerfile=apps/worker/Dockerfile >> $GITHUB_OUTPUT' }, { uses: 'docker/build-push-action@x', with: { file: '${{ steps.image.outputs.dockerfile }}', load: true, tags: '${{ steps.image.outputs.ref }}' } }";
    const viaEnv = (run: string) => `{ env: { REF: '\${{ steps.image.outputs.ref }}' }, run: '${run}' }`;
    expect(problems(`${named}, ${node}, ${viaEnv('node tools/ci/browser-build.ts --image "$REF"')}, ${viaEnv('docker save "$REF" | gzip -1 > w.tar.gz')}`)).toEqual([]);
    expect(problems(`${named}, ${viaEnv('docker save "$REF" | gzip -1 > w.tar.gz')}, ${node}, ${viaEnv('node tools/ci/browser-build.ts --image "$REF"')}`)).toEqual([`fixture.yml a: "docker save "$REF" | gzip -1 > w.tar.gz" uses \${{ steps.image.outputs.ref }} before its browser check`]);
    // The web image needs no check.
    expect(problems("{ uses: 'docker/build-push-action@x', with: { file: apps/web/Dockerfile, load: true, tags: 'tp-web:t' } }, { run: 'run.ts --web-image tp-web:t' }")).toEqual([]);
    expect(problems(`${loaded}, ${measure}`)).toEqual(['fixture.yml a: builds apps/worker/Dockerfile into tp-worker:t and never runs node tools/ci/browser-build.ts --image tp-worker:t']);
    expect(problems(`${loaded}, ${node}, ${measure}, ${check}`)).toEqual(['fixture.yml a: "pnpm exec tsx run.ts --worker-image tp-worker:t" uses tp-worker:t before its browser check']);
    for (const use of ['docker tag tp-worker:t registry/w:1', 'docker push tp-worker:t', 'docker image save "tp-worker:t" > w.tar']) {
      expect(problems(`${loaded}, ${node}, { run: '${use}' }, ${check}`), use).toEqual([`fixture.yml a: "${use}" uses tp-worker:t before its browser check`]);
    }
    // A check of another tag is not this one's.
    expect(problems(`${loaded}, ${node}, { run: 'node tools/ci/browser-build.ts --image tp-worker:other' }, ${measure}`)).toEqual(['fixture.yml a: builds apps/worker/Dockerfile into tp-worker:t and never runs node tools/ci/browser-build.ts --image tp-worker:t']);
    expect(problems(`${archived}, ${node}, ${check}, ${load}, ${measure}`)).toEqual(['fixture.yml a: checks tp-worker:t before its archive is loaded']);
    // Node 24 before every check, whatever its cache inputs; another Node, or none, is refused.
    expect(problems(`${loaded}, ${check}, ${measure}`)).toEqual(['fixture.yml a: checks tp-worker:t with no actions/setup-node of Node 24 before it']);
    expect(problems(`${loaded}, { uses: 'actions/setup-node@${'1'.repeat(40)}', with: { node-version: 22 } }, ${check}`)).toEqual(['fixture.yml a: checks tp-worker:t with no actions/setup-node of Node 24 before it']);
    expect(problems(`${loaded}, { uses: 'actions/setup-node@${'1'.repeat(40)}', with: { node-version: 24, cache: pnpm } }, ${check}`)).toEqual([]);
    expect(problems(`${loaded}, ${check}, ${node}`)).toEqual(['fixture.yml a: checks tp-worker:t with no actions/setup-node of Node 24 before it']);
    // A build this rule cannot follow, or into no local tag, is refused.
    expect(problems("{ run: 'docker build -f apps/worker/Dockerfile -t tp-worker:t .' }")).toEqual(['fixture.yml a: builds apps/worker/Dockerfile in a script, which this rule cannot follow']);
    expect(problems("{ uses: 'docker/build-push-action@x', with: { file: apps/worker/Dockerfile, push: true, tags: 'registry/w:1' } }")).toEqual(['fixture.yml a: builds apps/worker/Dockerfile into no local tag, so nothing checks its headless shell before it leaves the job']);
  });

  it('restores and checks the system packages before the browser install wherever Playwright installs its libraries but the release, which restores no cache (V3)', () => {
    for (const [file, id] of [
      ['ci.yml', 'unit'],
      ['ci.yml', 'db'],
      ['ci.yml', 'e2e'],
      ['large-zip.yml', 'large-zip'],
      ['screening-capacity.yml', 'capacity'],
    ] as const) {
      const steps = workflow(file).jobs[id]?.steps ?? [];
      const install = stepIndex(steps, (step) => step.run === BROWSER_INSTALL);
      const where = `${file} ${id}`;
      expect(steps[install - 1], where).toEqual({ name: 'Check the restored system packages against the signed index', run: 'tools/ci/apt-archives.sh verify "$RUNNER_TEMP/apt-archives"' });
      expect(steps[install - 2], where).toEqual({ name: "Restore the browsers' system packages", id: 'apt', uses: pinOf('actions/cache/restore'), with: APT_RESTORE });
      expect(stepIndex(steps, (step) => step.id === 'runner-image'), where).toBeLessThan(install - 2);
      // The key's file is installed before it is hashed.
      expect(stepIndex(steps, (step) => step.run === 'pnpm install --frozen-lockfile'), where).toBeLessThan(install - 2);
    }
    expect(JSON.stringify(workflow('release.yml'))).not.toContain('apt-archives');
  });

  describe('the brand baselines, regenerated from nothing (docs/adr/0058; the review’s B1)', () => {
    const NAME = 'The brand baselines, regenerated from nothing';

    it('run in the first e2e shard of every pull request and push, after its journeys, with no path condition, past a red browser check, and nowhere else', () => {
      const steps = ciJob('e2e').steps;
      const baseline = stepNamed(steps, NAME);
      expect(baseline.if).toBe("${{ !cancelled() && steps.browser-install.outcome == 'success' && matrix.shard == 1 }}");
      expect(baseline.env).toEqual({ E2E_PREBUILT: '1' });
      const index = steps.indexOf(baseline);
      expect(index).toBeGreaterThan(stepIndex(steps, (step) => step.name === "The end-to-end journeys, this shard's"));
      // After the journeys' upload and their failed comparisons' pictures, which its own run leaves untouched.
      expect(index).toBeGreaterThan(stepIndex(steps, (step) => step.run?.includes("-name '*-diff.png'") === true));
      const script = baseline.run ?? '';
      // Written from nothing into an empty directory outside the repository, so the tracked tree stays as committed,
      // which E2E_PREBUILT's build stamp requires: a step that removed the committed pictures first made the stamp refuse
      // the tree, and the journey never ran (PR #77's first run, e2e (1/2)).
      expect(script).not.toMatch(/\brm\b[^\n]*brand\.spec\.ts-snapshots/);
      expect(script.indexOf('rm -rf "$fresh"')).toBeLessThan(script.indexOf('playwright test'));
      expect(script).toContain('fresh="$RUNNER_TEMP/baselines"');
      expect(script).toContain('E2E_BASELINES_DIR="$fresh/apps/web/e2e" pnpm --filter @tp/web exec playwright test e2e/brand.spec.ts --update-snapshots=all --retries=0 --reporter=list --output="$RUNNER_TEMP/baselines-results" 2>&1 || status=$?');
      // The pictures written are the ones present after the run in that empty directory: no message text of
      // Playwright's is read, which a release may reword (the review's N5).
      const written = '(cd "$fresh" && find "$committed" -type f -name \'*-chromium-linux.png\' | LC_ALL=C sort) > "$RUNNER_TEMP/baselines-written"';
      expect(script.indexOf(written)).toBeGreaterThan(script.indexOf('playwright test'));
      expect(script).not.toMatch(/doesn't exist|writing actual|baselines\.log/);
      const elsewhere = workflowFiles().flatMap((file) => Object.entries(workflow(file).jobs).flatMap(([id, job]) => job.steps.filter((step) => step.run?.includes('--update-snapshots') === true).map(() => `${file} ${id}`)));
      expect(elsewhere).toEqual(['ci.yml e2e']);
    });

    /** A picture whose base64 takes three chunks of 8,000 characters: 12,345 bytes, 16,460 characters. */
    const LARGE = Buffer.from(Array.from({ length: 12_345 }, (_, index) => (index * 7) % 256));

    /**
     * The step's script in a git repository holding two committed baselines, with a stand-in pnpm that refuses a working
     * tree with uncommitted changes, as E2E_PREBUILT's build stamp does, then renders by mode into E2E_BASELINES_DIR and
     * prints none of Playwright's messages, but in 'claimed', where it claims a picture it did not write.
     */
    function regenerate(mode: 'same' | 'changed' | 'large' | 'unreached' | 'claimed' | 'extra' | 'failed') {
      const dir = mkdtempSync(path.join(scratch, 'baselines-'));
      const env = { HOME: dir, GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'Synthetic', GIT_AUTHOR_EMAIL: 'synthetic@example.invalid', GIT_COMMITTER_NAME: 'Synthetic', GIT_COMMITTER_EMAIL: 'synthetic@example.invalid' };
      const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, env: { ...process.env, ...env }, encoding: 'utf8', timeout: TEST_TIMEOUT_MS, killSignal: 'SIGKILL' });
      const snapshots = path.join(dir, 'apps/web/e2e/brand.spec.ts-snapshots');
      mkdirSync(snapshots, { recursive: true });
      writeFileSync(path.join(snapshots, 'header-1280-chromium-linux.png'), 'header');
      writeFileSync(path.join(snapshots, 'report-cover-top-chromium-linux.png'), 'cover');
      mkdirSync(path.join(dir, 'tools/ci'), { recursive: true });
      copyFileSync(path.join(repositoryRoot, 'tools/ci/print-pictures.sh'), path.join(dir, 'tools/ci/print-pictures.sh'));
      // The stand-ins and the runner's temporary directory sit outside a CI checkout; here they are ignored instead.
      writeFileSync(path.join(dir, '.gitignore'), ['/bin/', '/runner-temp/', '/large.png', '/pnpm-args', '/baselines-dir', ''].join('\n'));
      git('init', '-q', '-b', 'main');
      git('add', '.');
      git('commit', '-q', '-m', 'baselines');
      const bin = path.join(dir, 'bin');
      const temp = path.join(dir, 'runner-temp');
      mkdirSync(bin);
      mkdirSync(temp);
      writeFileSync(path.join(dir, 'large.png'), LARGE);
      writeFileSync(
        path.join(bin, 'pnpm'),
        [
          '#!/usr/bin/env bash',
          `printf '%s\\n' "$*" > '${dir}/pnpm-args'`,
          `printf '%s\\n' "\${E2E_BASELINES_DIR:-}" > '${dir}/baselines-dir'`,
          // scripts/build-stamp.ts --expect refuses any uncommitted change under E2E_PREBUILT=1.
          '[ -z "$(git status --porcelain)" ] || { echo "build-stamp: the working tree has uncommitted changes"; exit 1; }',
          'shots="$E2E_BASELINES_DIR/brand.spec.ts-snapshots"',
          'mkdir -p "$shots"',
          'write() { printf "%s" "$2" > "$shots/$1"; }',
          // Playwright's own line for a missing baseline it writes under --update-snapshots=all (handleMissing).
          'claim() { echo "  A snapshot doesn\'t exist at $shots/$1, writing actual."; }',
          `case '${mode}' in`,
          '  same|failed) write header-1280-chromium-linux.png header; write report-cover-top-chromium-linux.png cover ;;',
          '  changed) write header-1280-chromium-linux.png header; write report-cover-top-chromium-linux.png "cover, drawn otherwise" ;;',
          `  large) write header-1280-chromium-linux.png header; cp '${dir}/large.png' "$shots/report-cover-top-chromium-linux.png" ;;`,
          '  unreached) write header-1280-chromium-linux.png header ;;',
          '  claimed) write header-1280-chromium-linux.png header; claim header-1280-chromium-linux.png; claim report-cover-top-chromium-linux.png ;;',
          '  extra) write header-1280-chromium-linux.png header; write report-cover-top-chromium-linux.png cover; write footer-chromium-linux.png footer ;;',
          'esac',
          `[ '${mode}' = failed ] && exit 1`,
          'exit 0',
          '',
        ].join('\n'),
        { mode: 0o755 },
      );
      const script = stepNamed(ciJob('e2e').steps, NAME).run ?? '';
      const result = runScript(script, { ...env, PATH: `${bin}:${process.env.PATH ?? '/usr/bin:/bin'}`, RUNNER_TEMP: temp, E2E_PREBUILT: '1' }, dir);
      return {
        ...result,
        args: readFileSync(path.join(dir, 'pnpm-args'), 'utf8').trim(),
        baselinesDir: readFileSync(path.join(dir, 'baselines-dir'), 'utf8').trim(),
        temp,
        tree: git('status', '--porcelain'),
      };
    }

    const sha = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
    /** What the step printed of one picture after its path: its SHA-256 line, then its chunks. */
    const printed = (output: string, name: string) => {
      const prefix = `apps/web/e2e/brand.spec.ts-snapshots/${name} `;
      return output
        .split('\n')
        .filter((line) => line.startsWith(prefix))
        .map((line) => line.slice(prefix.length));
    };

    it('pass when the run writes every committed baseline from nothing, byte for byte, whatever Playwright prints, printing their SHA-256s', () => {
      const same = regenerate('same');
      expect(same.status, same.output).toBe(0);
      expect(same.args).toMatch(/^--filter @tp\/web exec playwright test e2e\/brand\.spec\.ts --update-snapshots=all --retries=0 --reporter=list --output=\S+\/baselines-results$/);
      expect(same.output).toContain(`${sha('header')}  apps/web/e2e/brand.spec.ts-snapshots/header-1280-chromium-linux.png`);
      expect(same.output).toContain(`${sha('cover')}  apps/web/e2e/brand.spec.ts-snapshots/report-cover-top-chromium-linux.png`);
      expect(same.output).not.toContain('::error');
      // The run wrote into an empty directory under the runner's temporary directory, laid out as the repository is,
      // and left the tracked tree as committed.
      expect(same.baselinesDir).toBe(path.join(same.temp, 'baselines/apps/web/e2e'));
      expect(same.tree).toBe('');
    });

    it('fail on a changed picture, printing its SHA-256 and then the picture in numbered chunks of 8,000 base64 characters, on a picture the run did not reach, on one more than committed, and on a failed run', () => {
      const changed = regenerate('changed');
      expect(changed.status).toBe(1);
      expect(changed.output).toContain('::error title=The brand baselines::this runner renders other bytes than the committed baselines');
      expect(changed.output).toContain('  differs: apps/web/e2e/brand.spec.ts-snapshots/report-cover-top-chromium-linux.png');
      expect(changed.output).not.toContain('  differs: apps/web/e2e/brand.spec.ts-snapshots/header-1280-chromium-linux.png');
      expect(changed.tree).toBe('');
      // GNU base64's -w, as the runner has; only the changed picture is printed, its SHA-256 first.
      if (spawnSync('base64', ['-w', '0'], { input: '' }).status === 0) {
        expect(printed(changed.output, 'report-cover-top-chromium-linux.png')).toEqual([`sha256 ${sha('cover, drawn otherwise')}`, `1/1 ${Buffer.from('cover, drawn otherwise').toString('base64')}`]);
        expect(printed(changed.output, 'header-1280-chromium-linux.png')).toEqual([]);
        // A picture past one chunk: every chunk numbered of the whole, none longer than 8,000 characters, and the chunks
        // joined decode to the picture whose SHA-256 came first, so a log reader that cuts long lines loses nothing.
        const large = regenerate('large');
        expect(large.status).toBe(1);
        const encoded = LARGE.toString('base64');
        expect(encoded).toHaveLength(16_460);
        const lines = printed(large.output, 'report-cover-top-chromium-linux.png');
        expect(lines).toEqual([`sha256 ${sha(LARGE)}`, `1/3 ${encoded.slice(0, 8000)}`, `2/3 ${encoded.slice(8000, 16_000)}`, `3/3 ${encoded.slice(16_000)}`]);
        const joined = Buffer.from(lines.slice(1).map((line) => line.split(' ')[1] ?? '').join(''), 'base64');
        expect(sha(joined)).toBe(lines[0]?.slice('sha256 '.length));
        expect(large.output.split('\n').every((line) => line.length <= 8000 + 'apps/web/e2e/brand.spec.ts-snapshots/report-cover-top-chromium-linux.png 3/3 '.length)).toBe(true);
      }
      const unreached = regenerate('unreached');
      expect(unreached.status).toBe(1);
      expect(unreached.output).toContain('::error title=The brand baselines::the run wrote 1 baselines from nothing, not the 2 committed');
      expect(unreached.output).toContain('  committed, not written: apps/web/e2e/brand.spec.ts-snapshots/report-cover-top-chromium-linux.png');
      // A message claiming a picture the run did not write does not make it written.
      const claimed = regenerate('claimed');
      expect(claimed.status).toBe(1);
      expect(claimed.output).toContain('::error title=The brand baselines::the run wrote 1 baselines from nothing, not the 2 committed');
      const extra = regenerate('extra');
      expect(extra.status).toBe(1);
      expect(extra.output).toContain('the run wrote 3 baselines from nothing, not the 2 committed');
      expect(extra.output).toContain('  written, not committed: apps/web/e2e/brand.spec.ts-snapshots/footer-chromium-linux.png');
      const failed = regenerate('failed');
      expect(failed.status).toBe(1);
      expect(failed.output).toContain('::error title=The brand baselines::the brand journey exited 1 while regenerating its baselines');
    });
  });
});

describe('the action pin rules (CI-11; docs/adr/0066, Part 2)', () => {
  const texts = () => workflowFiles().map((file) => ({ file, text: readFileSync(path.join(WORKFLOWS, file), 'utf8') }));

  it('(a) pin every action of every workflow to a full commit SHA with its release version beside it, so no moved tag runs anywhere', () => {
    expect(texts().length).toBeGreaterThanOrEqual(8);
    expect(formProblems(texts())).toEqual([]);
    // The workflows that push images, write the report or decide a required check, and the content-calendar and
    // release-capacity workflows (docs/adr/0071), are among the files read, each naming at least one action.
    for (const name of ['release.yml', 'screening-capacity.yml', 'ci.yml', 'content-calendar.yml', 'release-capacity.yml']) {
      expect(texts().find((entry) => entry.file === name)?.text.match(/^\s*(?:-\s+)?uses:/gm)?.length ?? 0, name).toBeGreaterThan(0);
    }
    // Every action the YAML names is one of the lines read.
    const uses = workflowFiles().flatMap((file) => Object.values(workflow(file).jobs).flatMap((job) => job.steps.flatMap((step) => (step.uses === undefined ? [] : [step.uses]))));
    expect(uses.length).toBeGreaterThan(0);
    for (const ref of uses) expect(parsePin(ref), ref).toBeDefined();
  });

  it('(b) pin each action’s repository to one commit and one version across every workflow', () => {
    expect(consistencyProblems(texts())).toEqual([]);
  });

  it('(c) match steps by the action they name, never by its ref, so a capacity step of actions/cache at any SHA is caught', () => {
    const fixture: Step[] = [{ uses: `actions/cache/restore@${'1'.repeat(40)}` }, { uses: `actions/cache@${'2'.repeat(40)}` }, { uses: `actions/cache/save@${'1'.repeat(40)}` }];
    expect(plainCacheSteps(fixture)).toEqual([fixture[1]]);
    expect(plainCacheSteps([{ uses: 'actions/cache@v4' }, { run: 'actions/cache@v4' }])).toHaveLength(1);
    expect(usesAction({ uses: `actions/checkout@${'3'.repeat(40)}` }, 'actions/checkout')).toBe(true);
    expect(usesAction({ uses: `actions/checkout-extra@${'3'.repeat(40)}` }, 'actions/checkout')).toBe(false);
  });

  it('are checked on every run by pnpm actions:check, whose root script runs tools/check-action-pins', () => {
    const scripts = (JSON.parse(readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8')) as { scripts: Record<string, string> }).scripts;
    expect(scripts['actions:check']).toBe('tsx tools/check-action-pins/index.ts');
    expect(scripts['toolchain:check']).toBe('tsx tools/check-toolchain/index.ts');
  });
});

describe('the release’s dry run (docs/adr/0066, Part 2)', () => {
  type DryJob = Job & { permissions?: unknown };
  const dry = () => workflow('release-dry-run.yml') as Workflow & { permissions?: unknown; jobs: Record<string, DryJob> };
  const release = () => workflow('release.yml') as Workflow & { jobs: Record<string, DryJob> };
  // The images' pnpm installer runs in both Dockerfiles' build stage, so a change to it is a change to the image build;
  // the worker leg runs the browser check, which reads browser.json and its file lists, as image-id.ts is run.
  const PATHS = [
    '.github/workflows/release.yml',
    '.github/workflows/release-dry-run.yml',
    'tools/screening-capacity/image-id.ts',
    'apps/web/Dockerfile',
    'apps/worker/Dockerfile',
    'tools/check-toolchain/install-pnpm.sh',
    'tools/ci/browser-build.ts',
    'apps/web/e2e/browser.json',
    'apps/web/e2e/browser-builds/*',
    // The pinned Trivy every build leg installs (tools/trivy/install.sh and its release.txt).
    'tools/trivy/**',
  ];
  // Two of the release build's four legs: the web image (which stands for the capacity job's production web image) and
  // the worker image. web-staging and web-production differ from web only by a repository variable's static host.
  const IMAGES = ['web', 'worker'];
  /** A script of release.yml's as the dry run runs it: each image list cut to these two images, the tag to this run's. */
  const cutScript = (script: string) =>
    script
      .replace(/for image in ([^;\n]+); do/g, (_whole: string, list: string) => `for image in ${[...new Set(list.trim().split(/\s+/).map((image) => (image === 'web-production' ? 'web' : image)))].filter((image) => IMAGES.includes(image)).join(' ')}; do`)
      .replaceAll('$GITHUB_REF_NAME', 'dry-run-$GITHUB_RUN_ID');
  /** An input of release.yml's as the dry run gives it: the tag `dry-run`, the production web archive the web one, kept a day. */
  const cutInput = (key: string, value: unknown): unknown => {
    if (key === 'retention-days') return 1;
    if (typeof value !== 'string') return value;
    return value.replaceAll('${{ github.ref_name }}', 'dry-run').replace(/^image-web-production$/, 'image-web');
  };
  /** One of release.yml's steps as the dry run runs it. */
  const asDryRun = (step: Step): Step => ({
    ...step,
    ...(step.run === undefined ? {} : { run: cutScript(step.run) }),
    ...(step.with === undefined ? {} : { with: Object.fromEntries(Object.entries(step.with).map(([key, value]) => [key, cutInput(key, value)])) }),
  });

  it('runs on every pull request and push that changes the release, its dry run, the images’ Dockerfiles or their pnpm installer, or the worker’s browser check and its record, outside the required checks', () => {
    expect(dry().on).toEqual({ pull_request: { paths: PATHS }, push: { branches: ['claude/build-platform'], paths: PATHS } });
    expect(Object.keys(dry().jobs)).toEqual(['build', 'push', 'capacity']);
    expect(dry().jobs.push?.needs).toBe('build');
    expect(dry().jobs.capacity?.needs).toBe('build');
    expect(REQUIRED_CHECKS.filter((check) => check.workflow === 'release-dry-run.yml')).toEqual([]);
  });

  it('holds no write permission and never tags, pushes or attests', () => {
    expect(dry().permissions).toEqual({ contents: 'read' });
    expect(dry().jobs.build?.permissions).toBeUndefined();
    expect(dry().jobs.push?.permissions).toEqual({ contents: 'read', packages: 'read' });
    const text = readFileSync(path.join(WORKFLOWS, 'release-dry-run.yml'), 'utf8');
    expect(text).not.toMatch(/: write|id-token|attestations/);
    const steps = Object.values(dry().jobs).flatMap((entry) => entry.steps);
    expect(steps.filter((step) => /\bdocker (?:push|tag)\b/.test(step.run ?? ''))).toEqual([]);
    expect(steps.filter((step) => /attest/.test(step.uses ?? ''))).toEqual([]);
    expect(steps.filter((step) => usesAction(step, 'docker/build-push-action')).map((step) => [step.with?.push, step.with?.load])).toEqual([[false, true]]);
  });

  it('runs each action release.yml’s job runs with the same pin and the same inputs, overwriting its upload and caching nothing', () => {
    for (const [id, entry] of Object.entries(dry().jobs)) {
      const theirs = release().jobs[id]?.steps ?? [];
      for (const step of entry.steps.filter((candidate) => candidate.uses !== undefined)) {
        const where = `${id}: ${step.uses ?? ''}`;
        const same = theirs.filter((candidate) => candidate.uses === step.uses && isDeepStrictEqual(Object.keys(candidate.with ?? {}).sort(), Object.keys(step.with ?? {}).sort()));
        expect(same.length, `${where}: release.yml's ${id} job runs it with the inputs ${JSON.stringify(Object.keys(step.with ?? {}).sort())}`).toBeGreaterThan(0);
        for (const input of ['overwrite', 'cache', 'cache-binary', 'package-manager-cache', 'cache-from', 'cache-to']) {
          expect(same.some((candidate) => isDeepStrictEqual(candidate.with?.[input], step.with?.[input])), `${where}: ${input}`).toBe(true);
        }
      }
    }
    expect(dry().jobs.build?.steps.find((step) => usesAction(step, 'actions/upload-artifact'))?.with?.overwrite).toBe(true);
  });

  it('builds release.yml’s web and worker legs with release.yml’s own steps, cut to this run’s tag, less the scan and the bill of materials’ upload: each leg’s identity under its own names, the worker’s headless shell checked before its save (the ci-infra review’s CI-3)', () => {
    const theirs = release().jobs.build as DryJob & { outputs?: Record<string, string> };
    const ours = dry().jobs.build as DryJob & { outputs?: Record<string, string> };
    // Two of the release's four legs, in its order, and its outputs for those two: each leg writes its own names, so the
    // legs' outputs merge as the release's four must, and the worker leg runs the release's --image step.
    expect(ours.strategy).toEqual({ matrix: { image: IMAGES } });
    expect((theirs.strategy?.matrix?.image as unknown[]).filter((image) => IMAGES.includes(String(image)))).toEqual(IMAGES);
    expect(ours.outputs).toEqual(Object.fromEntries(Object.entries(theirs.outputs ?? {}).filter(([key]) => IMAGES.includes(key.replace(/^[a-z0-9]+_/, '')))));
    expect(Object.keys(ours.outputs ?? {}).sort()).toEqual(['config_web', 'config_worker', 'sha256_web', 'sha256_worker', 'target_web', 'target_worker']);
    expect(ours['runs-on']).toBe(theirs['runs-on']);
    // Every step of release.yml's build, cut, but the scan (ci.yml's images job scans both images on every pull request)
    // and the bill of materials' upload; the bill of materials is read as SPDX instead.
    const kept = theirs.steps.filter((step) => !isScan(step) && !(usesAction(step, 'actions/upload-artifact') && String(step.with?.name).startsWith('sbom-')));
    expect(theirs.steps.length - kept.length).toBe(2);
    const sbom = stepIndex(kept, (step) => usesAction(step, 'aquasecurity/trivy-action'));
    const read = { name: 'Read the bill of materials as SPDX', env: { SBOM: 'sbom-${{ matrix.image }}-dry-run.spdx.json' }, run: `jq -e '.spdxVersion and (.packages | length > 0)' "$SBOM" > /dev/null` };
    expect(ours.steps).toEqual([...kept.slice(0, sbom + 1).map(asDryRun), read, ...kept.slice(sbom + 1).map(asDryRun)]);
    // The cut changes only the tag (the image's name, its version label and the bill of materials' name) and how long
    // the archive is kept; the worker's check and the identity step are release.yml's word for word.
    expect(kept.filter((step) => !isDeepStrictEqual(asDryRun(step), step)).map((step) => step.name ?? actionOf(step))).toEqual(['Name the image, its Dockerfile and its static host', 'Build the image without pushing it', 'Write the software bill of materials', 'actions/upload-artifact']);
    const check = stepIndex(ours.steps, (step) => step.run === 'node tools/ci/browser-build.ts --image "$REF"');
    expect(ours.steps[check]?.if).toBe("${{ matrix.image == 'worker' }}");
    expect(check).toBeLessThan(stepIndex(ours.steps, (step) => step.run?.includes('docker save') === true));
    expect(ours.steps.find((step) => step.id === 'image')?.run).toContain('echo "ref=ghcr.io/${GITHUB_REPOSITORY,,}/$IMAGE:dry-run-$GITHUB_RUN_ID" >> "$GITHUB_OUTPUT"');
  });

  it('checks and loads both archives in push and capacity with release.yml’s own steps, cut to this run’s two images and tag: push stops before its first push, capacity after its frozen install (the ci-infra review’s N4 and CI-3)', () => {
    const theirs = release().jobs;
    const ours = dry().jobs;
    const push = theirs.push?.steps ?? [];
    expect(ours.push?.steps).toEqual(push.slice(0, stepIndex(push, (step) => /\bdocker push\b/.test(step.run ?? ''))).map(asDryRun));
    const capacity = theirs.capacity?.steps ?? [];
    expect(ours.capacity?.steps).toEqual(capacity.slice(0, stepIndex(capacity, (step) => step.run === 'pnpm install --frozen-lockfile') + 1).map(asDryRun));
    for (const id of ['push', 'capacity']) {
      expect([ours[id]?.['runs-on'], ours[id]?.needs], id).toEqual([theirs[id]?.['runs-on'], theirs[id]?.needs]);
      const check = (ours[id]?.steps ?? []).find((step) => /\bdocker load\b/.test(step.run ?? ''));
      expect(check?.run, id).toContain('for image in web worker; do');
      expect(check?.run, id).toContain('ref="$repository/$image:dry-run-$GITHUB_RUN_ID"');
      expect(check?.run, id).not.toContain('GITHUB_REF_NAME');
      expect(check?.env, id).toEqual({ BUILD: '${{ toJSON(needs.build.outputs) }}' });
    }
    // The capacity job downloads both archives by name, its production web image the web image built here.
    expect(ours.capacity?.steps.filter((step) => usesAction(step, 'actions/download-artifact')).map((step) => step.with)).toEqual([
      { name: 'image-web', path: '${{ runner.temp }}/image' },
      { name: 'image-worker', path: '${{ runner.temp }}/image' },
    ]);
    expect(ours.push?.steps.map((step) => step.name ?? actionOf(step))).toEqual(['actions/download-artifact', 'docker/login-action', "Check each archive against the build's outputs and load it as the image built"]);
    expect(ours.capacity?.permissions).toBeUndefined();
  });

  it('writes the software bill of materials with release.yml’s own step, cut to this run’s tag, and checks it is SPDX', () => {
    const sbom = (entry: Job | undefined) => entry?.steps.find((step) => usesAction(step, 'aquasecurity/trivy-action') && step.with?.format === 'spdx-json');
    const theirs = sbom(release().jobs.build);
    const ours = sbom(dry().jobs.build);
    expect(ours?.uses).toBe(theirs?.uses);
    expect(ours?.with).toEqual({ ...theirs?.with, output: 'sbom-${{ matrix.image }}-dry-run.spdx.json' });
    expect(theirs?.with?.output).toBe('sbom-${{ matrix.image }}-${{ github.ref_name }}.spdx.json');
    const steps = dry().jobs.build?.steps ?? [];
    const index = steps.findIndex((step) => usesAction(step, 'aquasecurity/trivy-action') && step.with?.format === 'spdx-json');
    expect(index).toBeGreaterThan(steps.findIndex((step) => usesAction(step, 'docker/build-push-action')));
    expect(steps[index + 1]).toEqual({ name: 'Read the bill of materials as SPDX', env: { SBOM: 'sbom-${{ matrix.image }}-dry-run.spdx.json' }, run: `jq -e '.spdxVersion and (.packages | length > 0)' "$SBOM" > /dev/null` });
  });
});

describe('every checkout (CI-11)', () => {
  it('keeps no token in the checkout, in every workflow but publish-content.yml, which pushes the releases it publishes', () => {
    for (const file of workflowFiles()) {
      for (const [id, job] of Object.entries(workflow(file).jobs)) {
        for (const step of job.steps.filter((candidate) => usesAction(candidate, 'actions/checkout'))) {
          expect(step.with?.['persist-credentials'], `${file} ${id}`).toBe(file === 'publish-content.yml' ? undefined : false);
        }
      }
    }
  });
});

/**
 * A read of this repository from its remote, which a private repository refuses without the job's token (CI-11): git's
 * fetch, clone, ls-remote, pull, submodule update or archive --remote, with any global options before the command; and
 * raw.githubusercontent.com, or curl or wget of the API, the server or this repository by any of their names.
 */
const REMOTE_READ = new RegExp(
  [
    /\bgit\b(?:\s+(?:-C\s+\S+|-c\s+\S+|--[\w-]+(?:=\S+)?))*\s+(?:fetch|clone|ls-remote|pull|submodule\s+update|archive\s+--remote)\b/.source,
    /raw\.githubusercontent\.com/.source,
    /\b(?:curl|wget)\b[^\n]*(?:api\.github\.com|github\.com\/\$|\$\{?GITHUB_(?:API_URL|SERVER_URL|REPOSITORY)\b|\$\{\{\s*github\.(?:repository|api_url|server_url)\b|PureTideWater\/PhysicalTherapy\b)/.source,
  ].join('|'),
);
/** A command line that runs gh. */
const RUNS_GH = /(?:^|[\s;&|(`$])gh\s+(?:api|issue|pr|release|run|repo|attestation|secret|variable|workflow|cache|label|search)\b/m;

describe('every read of this repository works when it is private (CI-11)', () => {
  /** Every step of every workflow, with its job, named for a message. */
  const everyStep = () => workflowFiles().flatMap((file) => Object.entries(workflow(file).jobs).flatMap(([id, job]) => job.steps.map((step) => ({ where: `${file} ${id}: ${step.name ?? step.uses ?? step.run?.split('\n')[0] ?? ''}`, job, step }))));

  it('makes no partial clone: a checkout that keeps no token fetches every object once, with the job’s token, so no later git command fetches a blob without credentials', () => {
    // A blobless or treeless clone (`filter:`) fetches what a later git command reads from its promisor remote, without
    // credentials once persist-credentials is false: a private repository refuses that ("could not read Username for
    // 'https://github.com'", screening-capacity run 41765454724, job 126369187941).
    const filtered = everyStep().filter(({ step }) => usesAction(step, 'actions/checkout') && step.with?.filter !== undefined && step.with?.['persist-credentials'] === false);
    expect(filtered.map(({ where }) => where)).toEqual([]);
    for (const { where, step } of everyStep().filter((entry) => usesAction(entry.step, 'actions/checkout'))) expect(step.with?.['sparse-checkout'], where).toBeUndefined();
  });

  it('knows every form of a read of this repository from its remote: each git form with any global options before its command, and curl or wget of the API, the server or this repository by any of their names', () => {
    // Each would fail on the private repository without a token; each must be caught (mutation cases: the review's S1).
    const caught = [
      'git fetch origin main',
      'git -C . fetch origin main',
      'git -C "$dir" --no-pager fetch --depth=1 origin main',
      'git --no-pager fetch origin main',
      'git -c protocol.version=2 fetch --depth=1 origin main',
      'git --git-dir=.git fetch origin',
      'git clone https://github.com/PureTideWater/PhysicalTherapy',
      'git ls-remote origin',
      'git pull --ff-only',
      'git submodule update --init',
      'git archive --remote=origin HEAD',
      'curl -fsSL "$GITHUB_API_URL/repos/$GITHUB_REPOSITORY/contents/x"',
      'curl -fsSL "${GITHUB_API_URL}/repos/x"',
      'curl -fsSL "${{ github.api_url }}/repos/x"',
      'curl -fsSL "$GITHUB_SERVER_URL/x/archive/main.tar.gz"',
      'wget -q "${{ github.server_url }}/x"',
      'curl -fsSL "https://example.invalid/$GITHUB_REPOSITORY"',
      'curl -fsSL https://github.com/PureTideWater/PhysicalTherapy/archive/main.tar.gz',
      'curl -fsSL https://github.com/${{ github.repository }}/archive/main.tar.gz',
      'curl -fsSL https://api.github.com/repos/x',
      'curl -fsSL https://raw.githubusercontent.com/x/y/main/z',
    ];
    expect(caught.filter((text) => !REMOTE_READ.test(text))).toEqual([]);
    // What the workflows and their scripts do run, none of it a read of this repository's remote.
    const local = ['git diff --name-only "$BASE" "$HEAD"', 'git -C "$dir" rev-parse HEAD', 'git --no-pager log --format=%H', 'curl -fsSL --retry 3 -o "$work/$archive" "$base/$archive"', 'git cat-file -e "$BASE^{commit}"'];
    expect(local.filter((text) => REMOTE_READ.test(text))).toEqual([]);
    expect(['gh api repos/x', 'out=$(gh pr view 1)', 'x && gh release view'].filter((text) => !RUNS_GH.test(text))).toEqual([]);
  });

  it('reads this repository with the job’s token alone: no step fetches, clones or lists a remote, or reads raw.githubusercontent.com or the API by curl, and every step that runs gh sets GH_TOKEN', () => {
    const scripts = everyStep().filter(({ step }) => step.run !== undefined);
    expect(scripts.length).toBeGreaterThan(50);
    expect(scripts.filter(({ step }) => REMOTE_READ.test(step.run ?? '')).map(({ where }) => where)).toEqual([]);
    const gh = scripts.filter(({ step }) => RUNS_GH.test(step.run ?? ''));
    expect(gh.length).toBeGreaterThan(3);
    for (const { where, job, step } of gh) expect(step.env?.GH_TOKEN ?? job.env?.GH_TOKEN, where).toBe('${{ github.token }}');
  });

  it('reads this repository with the job’s token alone in what the steps run: no shell script reads the remote or runs gh, the TypeScript a step runs lists or fetches only other repositories with git, and reads the API only where the step gives it the job’s token', () => {
    // Read from the repository, never from CI_TREE's copy, which holds only the CI files.
    const files = (dir: string, pattern: RegExp) =>
      readdirSync(path.join(repositoryRoot, dir), { recursive: true, encoding: 'utf8' })
        .map((file) => path.posix.join(dir, file.split(path.sep).join('/')))
        .filter((file) => pattern.test(file) && !file.split('/').includes('node_modules'))
        .sort();
    const read = (file: string) => readFileSync(path.join(repositoryRoot, file), 'utf8');
    const shell = [...files('tools', /\.sh$/), ...files('.github', /\.sh$/)];
    expect(shell.length).toBeGreaterThan(5);
    expect(shell.filter((file) => REMOTE_READ.test(read(file)) || RUNS_GH.test(read(file)))).toEqual([]);

    // The TypeScript entry points the steps run, directly (tsx or node) or through a package.json script, and the files
    // under tools/ each imports, transitively.
    const scripts = (JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts;
    const ENTRY = /\b(?:tsx|node)\s+(tools\/[\w./-]+\.(?:ts|mjs))/g;
    const runs = everyStep().filter(({ step }) => step.run !== undefined);
    const entries = runs.flatMap((entry) => [
      ...[...(entry.step.run ?? '').matchAll(ENTRY)].map((match) => ({ ...entry, file: match[1] ?? '' })),
      ...[...(entry.step.run ?? '').matchAll(/\bpnpm\s+(?:run\s+)?([a-z][\w:.-]*)/g)].flatMap((match) => [...(scripts[match[1] ?? ''] ?? '').matchAll(ENTRY)].map((named) => ({ ...entry, file: named[1] ?? '' }))),
    ]);
    expect(new Set(entries.map(({ file }) => file)).size).toBeGreaterThan(15);
    const closure = (entry: string) => {
      const seen = new Set<string>();
      const queue = [entry];
      while (queue.length > 0) {
        const file = queue.pop() ?? '';
        if (seen.has(file) || !existsSync(path.join(repositoryRoot, file))) continue;
        seen.add(file);
        for (const match of read(file).matchAll(/(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
          let next = path.posix.normalize(path.posix.join(path.posix.dirname(file), match[1] ?? ''));
          if (next.endsWith('.js')) next = `${next.slice(0, -3)}.ts`;
          else if (!/\.(?:ts|mjs|json)$/.test(next)) next = `${next}.ts`;
          if (next.startsWith('tools/') && !next.endsWith('.json')) queue.push(next);
        }
      }
      return [...seen];
    };
    // git's remote commands as an argument list, and the API, the server or this repository by any name, or gh.
    const GIT_REMOTE = /['"`](?:fetch|clone|ls-remote|pull|submodule)['"`]\s*[,\]]/;
    const API = /api\.github\.com|raw\.githubusercontent\.com|GITHUB_(?:API|SERVER)_URL|GITHUB_REPOSITORY|PureTideWater\/PhysicalTherapy|['"`]gh['"`]/;
    expect(['git(["-C", dir, "fetch", url])', "run('git', ['ls-remote', url])", "git('clone', url)"].filter((text) => !GIT_REMOTE.test(text))).toEqual([]);
    const gitReaders = new Set<string>();
    for (const { where, job, step, file } of entries) {
      const reached = closure(file);
      expect(reached.length, where).toBeGreaterThan(0);
      for (const found of reached.filter((candidate) => GIT_REMOTE.test(read(candidate)))) gitReaders.add(found);
      if (reached.some((candidate) => API.test(read(candidate)))) {
        const token = step.env?.GITHUB_TOKEN ?? step.env?.GH_TOKEN ?? job.env?.GITHUB_TOKEN ?? job.env?.GH_TOKEN;
        expect(token, `${where} runs ${file}, which reads GitHub's API or runs gh`).toBe('${{ github.token }}');
      }
    }
    // check-action-pins alone runs git against a remote: the upstreams of the actions the workflows pin, read by
    // owner/name, never this repository, which no `uses:` names (no local action, no reusable workflow of its own).
    expect([...gitReaders].sort()).toEqual(['tools/check-action-pins/network.ts']);
    const uses = everyStep().map(({ step }) => step.uses ?? '').filter((uses) => uses !== '');
    expect(uses.filter((uses) => uses.startsWith('./') || uses.toLowerCase().startsWith('puretidewater/'))).toEqual([]);
    expect(workflowFiles().flatMap((file) => Object.values(workflow(file).jobs)).filter((job) => typeof (job as { uses?: unknown }).uses === 'string')).toEqual([]);
  });

  it('reads the changed paths of screening-capacity’s pull request from its checkout alone: the script passes on a full clone whose remote is gone, and a blobless clone fails it', () => {
    const changes = workflow('screening-capacity.yml').jobs.changes;
    const checkout = changes?.steps[0]?.with ?? {};
    const script = changes?.steps.find((step) => step.id === 'watched')?.run ?? '';
    expect(script).toContain('git diff --name-only');
    const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'init.defaultBranch=main', ...args], { cwd, encoding: 'utf8', timeout: TEST_TIMEOUT_MS, killSignal: 'SIGKILL' }).trim();
    const root = mkdtempSync(path.join(scratch, 'changes-'));
    const work = path.join(root, 'work');
    mkdirSync(work);
    git(work, 'init', '-q');
    mkdirSync(path.join(work, 'tools/screening-capacity'), { recursive: true });
    mkdirSync(path.join(work, 'apps/worker/src/screening'), { recursive: true });
    mkdirSync(path.join(work, 'docs'), { recursive: true });
    writeFileSync(path.join(work, 'tools/screening-capacity/watched-paths.txt'), '# watched\napps/worker/src/screening/*\n');
    writeFileSync(path.join(work, 'apps/worker/src/screening/consumer.ts'), 'export const a = 1;\n');
    // A file the pull request moves: rename detection reads both blobs, as a pull request that renames anything does.
    writeFileSync(path.join(work, 'docs/old.md'), `${'a line of the document\n'.repeat(40)}`);
    git(work, 'add', '-A');
    git(work, 'commit', '-q', '-m', 'base');
    const base = git(work, 'rev-parse', 'HEAD');
    writeFileSync(path.join(work, 'apps/worker/src/screening/consumer.ts'), 'export const a = 2;\n');
    // Moved and edited, so the base's blob is one the head's checkout does not bring; the list changes too, so its
    // base copy is read from the base's own blob.
    git(work, 'mv', 'docs/old.md', 'docs/new.md');
    writeFileSync(path.join(work, 'docs/new.md'), `${'a line of the document\n'.repeat(39)}an edited line\n`);
    writeFileSync(path.join(work, 'tools/screening-capacity/watched-paths.txt'), '# watched\napps/worker/src/screening/*\napps/web/src/screening/*\n');
    git(work, 'commit', '-q', '-am', 'head');
    const head = git(work, 'rev-parse', 'HEAD');
    const origin = path.join(root, 'origin.git');
    git(root, 'clone', '-q', '--bare', work, origin);
    git(origin, 'config', 'uploadpack.allowFilter', 'true');
    // A clone as the job's checkout makes it (actions/checkout's fetch with its filter, if any), then the remote gone,
    // as a private repository's is to a git that holds no token.
    const cloneAs = (name: string, options: Record<string, unknown>) => {
      const target = path.join(root, name);
      git(root, 'clone', '-q', '--no-checkout', ...(typeof options.filter === 'string' ? [`--filter=${options.filter}`] : []), `file://${origin}`, target);
      git(target, 'checkout', '-q', head);
      return target;
    };
    const run = (cwd: string) => {
      const output = path.join(cwd, '..', `${path.basename(cwd)}.output`);
      writeFileSync(output, '');
      const result = runScript(script, { EVENT: 'pull_request', BASE: base, HEAD: head, GITHUB_OUTPUT: output, RUNNER_TEMP: mkdtempSync(path.join(root, 'temp-')), GIT_TERMINAL_PROMPT: '0', HOME: root }, cwd);
      return { ...result, written: readFileSync(output, 'utf8') };
    };
    const ours = cloneAs('ours', checkout);
    const blobless = cloneAs('blobless', { ...checkout, filter: 'blob:none' });
    rmSync(origin, { recursive: true, force: true });
    const read = run(ours);
    expect(read.status, read.output).toBe(0);
    expect(read.output).toContain('watched: apps/worker/src/screening/consumer.ts');
    expect(read.written).toBe('measure=true\n');
    const refused = run(blobless);
    expect(refused.status, refused.output).not.toBe(0);
    expect(refused.written).toBe('');
  });
});

describe('every Trivy step runs the pinned Trivy (CI-11; docs/adr/0066, Part 2)', () => {
  /** The step every job with a Trivy step runs first: the pinned release, its archive checked, onto this run's PATH. */
  const INSTALL: Step = { name: 'The pinned Trivy', run: 'trivy="$(tools/trivy/install.sh "$RUNNER_TEMP/trivy-bin")"\ndirname "$trivy" >> "$GITHUB_PATH"\necho "TRIVY_CMD=$trivy" >> "$GITHUB_ENV"\n' };
  /** A file's lines less its whole-line comments. */
  const uncommented = (text: string) => text.split('\n').filter((line) => !/^\s*#/.test(line)).join('\n');
  const trivyJobs = () => workflowFiles().flatMap((file) => Object.entries(workflow(file).jobs).filter(([, job]) => job.steps.some((step) => usesAction(step, 'aquasecurity/trivy-action'))).map(([id, job]) => ({ where: `${file} ${id}`, job })));

  it('installs Trivy from its GitHub release, checked against tools/trivy/release.txt, before the first Trivy step of each job, and never by setup-trivy, whose installer downloads from get.trivy.dev', () => {
    // ci.yml's images job, release.yml's build and the dry run's build: five Trivy steps in three jobs.
    expect(trivyJobs().map(({ where }) => where)).toEqual(['ci.yml images', 'release-dry-run.yml build', 'release.yml build']);
    for (const { where, job } of trivyJobs()) {
      const install = job.steps.findIndex((step) => step.name === INSTALL.name);
      expect(install, where).toBeGreaterThanOrEqual(0);
      expect(job.steps[install], where).toEqual(INSTALL);
      expect(install, where).toBeLessThan(job.steps.findIndex((step) => usesAction(step, 'aquasecurity/trivy-action')));
      // Each Trivy step runs the installed binary by its absolute path (TRIVY_CMD, which trivy-action's entrypoint runs in
      // place of `trivy` from PATH, where each trivy-action step prepends its own directory), never one setup-trivy
      // downloads, and no step sets TRIVY_CMD otherwise; nothing names a version for it.
      for (const step of job.steps.filter((candidate) => usesAction(candidate, 'aquasecurity/trivy-action'))) {
        expect([step.with?.['skip-setup-trivy'], step.with?.version, step.with?.cache], `${where}: ${step.name ?? ''}`).toEqual([true, undefined, false]);
        expect([step.env?.TRIVY_CMD, job.env?.TRIVY_CMD], `${where}: ${step.name ?? ''}`).toEqual([undefined, undefined]);
      }
    }
    // No line but a comment names setup-trivy or its installer's host.
    for (const file of workflowFiles()) {
      expect(uncommented(readFileSync(path.join(WORKFLOWS, file), 'utf8')), file).not.toMatch(/aquasecurity\/setup-trivy|get\.trivy\.dev|contrib\/install\.sh/);
    }
  });

  it('pins one version and a SHA-256 for each Linux archive, and checks the archive before anything in it runs', () => {
    const release = readFileSync(path.join(repositoryRoot, 'tools/trivy/release.txt'), 'utf8');
    expect(release).toMatch(/^version \d+\.\d+\.\d+$/m);
    for (const platform of ['linux_x64', 'linux_arm64']) expect(release, platform).toMatch(new RegExp(`^${platform} [0-9a-f]{64}$`, 'm'));
    const installer = readFileSync(path.join(repositoryRoot, 'tools/trivy/install.sh'), 'utf8');
    expect(installer).toContain('https://github.com/aquasecurity/trivy/releases/download/v$version');
    expect(uncommented(installer)).not.toMatch(/get\.trivy\.dev/);
    expect(installer.indexOf('if [ "$actual" != "$expected" ]')).toBeGreaterThan(0);
    expect(installer.indexOf('if [ "$actual" != "$expected" ]')).toBeLessThan(installer.indexOf('tar -xzf'));
    // Both pinned installers download over https alone, and follow a redirect only to https (a file:// mirror is the
    // tests'); the pinned SHA-256 still decides what runs.
    for (const tool of ['trivy', 'gitleaks']) {
      const text = readFileSync(path.join(repositoryRoot, `tools/${tool}/install.sh`), 'utf8');
      const curls = uncommented(text).split('\n').filter((line) => /\bcurl\b/.test(line));
      expect(curls.length, tool).toBe(1);
      expect(curls[0], tool).toContain("curl -fsSL --proto '=https,file' --proto-redir '=https' --retry 3 ");
    }
  });

  // The two lines each install step writes, read from the files the runner reads, on any machine: a stand-in uname
  // names the release's Linux x64 archive, served from a file:// mirror with the SHA-256 a release.txt beside the
  // repository's installer pins (GITHUB_ENV_WRITES' TRIVY_CMD and GITHUB_PATH_WRITES' trivy-bin; docs/adr/0066, Part 3, N32).
  it('gives the later steps the pinned Trivy by its absolute path through GITHUB_ENV and its directory through GITHUB_PATH, one line each, and writes neither when the install fails', () => {
    const root = realpathSync(mkdtempSync(path.join(scratch, 'trivy-step-')));
    const version = '0.70.0';
    const mirror = path.join(root, 'mirror');
    mkdirSync(path.join(mirror, 'x'), { recursive: true });
    const asset = path.join(mirror, `trivy_${version}_Linux-64bit.tar.gz`);
    const pack = (body: string) => {
      writeFileSync(path.join(mirror, 'x/trivy'), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
      execFileSync('tar', ['-czf', asset, '-C', path.join(mirror, 'x'), 'trivy']);
      return createHash('sha256').update(readFileSync(asset)).digest('hex');
    };
    const good = pack(`echo "Version: ${version}"`);
    const tools = path.join(root, 'checkout/tools/trivy');
    mkdirSync(tools, { recursive: true });
    copyFileSync(path.join(repositoryRoot, 'tools/trivy/install.sh'), path.join(tools, 'install.sh'));
    writeFileSync(path.join(tools, 'release.txt'), `version ${version}\nlinux_x64 ${good}\nlinux_arm64 ${good}\n`);
    const bin = path.join(root, 'bin');
    mkdirSync(bin);
    writeFileSync(path.join(bin, 'uname'), '#!/bin/sh\ncase "$1" in -s) echo Linux ;; -m) echo x86_64 ;; *) exit 97 ;; esac\n', { mode: 0o755 });
    let run = 0;
    const step = (script: string) => {
      run += 1;
      const temp = path.join(root, `runner-temp-${String(run)}`);
      mkdirSync(temp);
      const files = { env: path.join(root, `env-${String(run)}`), path: path.join(root, `path-${String(run)}`) };
      writeFileSync(files.env, '');
      writeFileSync(files.path, '');
      const result = runScript(script, { PATH: `${bin}:${process.env.PATH ?? '/usr/bin:/bin'}`, HOME: root, RUNNER_TEMP: temp, GITHUB_ENV: files.env, GITHUB_PATH: files.path, TRIVY_DOWNLOAD_BASE: `file://${mirror}` }, path.join(root, 'checkout'));
      return { status: result.status, temp, env: readFileSync(files.env, 'utf8'), path: readFileSync(files.path, 'utf8') };
    };
    for (const { where, job } of trivyJobs()) {
      const script = job.steps.find((candidate) => candidate.name === INSTALL.name)?.run ?? '';
      const ok = step(script);
      // The whole of each file: one line, the binary's absolute path and its directory, so no second variable or directory.
      expect(ok, where).toMatchObject({ status: 0, env: `TRIVY_CMD=${ok.temp}/trivy-bin/trivy\n`, path: `${ok.temp}/trivy-bin\n` });
      expect(readdirSync(path.join(ok.temp, 'trivy-bin')), where).toEqual(['trivy']);
    }
    // Another archive served: the install fails, so the step stops before either write.
    pack(`echo "Version: ${version}"; echo planted`);
    const refused = step(INSTALL.run ?? '');
    expect(refused).toMatchObject({ status: 1, env: '', path: '' });
  });

  const linux = process.platform === 'linux' && (process.arch === 'x64' || process.arch === 'arm64');
  it.runIf(linux)('installs the archive whose SHA-256 release.txt pins into the directory it is given, and refuses another, leaving nothing installed', () => {
    const root = mkdtempSync(path.join(scratch, 'trivy-'));
    const version = '0.70.0';
    const asset = `trivy_${version}_Linux-${process.arch === 'x64' ? '64bit' : 'ARM64'}.tar.gz`;
    const archive = (dir: string, body: string) => {
      mkdirSync(path.join(dir, 'x'), { recursive: true });
      writeFileSync(path.join(dir, 'x/trivy'), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
      writeFileSync(path.join(dir, 'x/README.md'), 'not installed\n');
      execFileSync('tar', ['-czf', path.join(dir, asset), '-C', path.join(dir, 'x'), 'trivy', 'README.md']);
      return createHash('sha256').update(readFileSync(path.join(dir, asset))).digest('hex');
    };
    const good = archive(path.join(root, 'good'), `echo "Version: ${version}"`);
    archive(path.join(root, 'bad'), `echo "Version: ${version}"; echo planted`);
    // The repository's installer beside a release.txt that pins the good archive (the script reads the file beside it).
    const tools = path.join(root, 'tools/trivy');
    mkdirSync(tools, { recursive: true });
    copyFileSync(path.join(repositoryRoot, 'tools/trivy/install.sh'), path.join(tools, 'install.sh'));
    writeFileSync(path.join(tools, 'release.txt'), `version ${version}\nlinux_x64 ${good}\nlinux_arm64 ${good}\n`);
    const install = (from: string, into: string) =>
      spawnSync('bash', [path.join(tools, 'install.sh'), into], { encoding: 'utf8', env: { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: root, TRIVY_DOWNLOAD_BASE: `file://${path.join(root, from)}` }, timeout: TEST_TIMEOUT_MS, killSignal: 'SIGKILL' });
    const ok = install('good', path.join(root, 'bin-good'));
    expect(ok.status, ok.stderr).toBe(0);
    expect(ok.stdout.trim()).toBe(path.join(root, 'bin-good/trivy'));
    expect(readdirSync(path.join(root, 'bin-good'))).toEqual(['trivy']);
    const refused = install('bad', path.join(root, 'bin-bad'));
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain(`not the ${good} that`);
    expect(existsSync(path.join(root, 'bin-bad/trivy'))).toBe(false);
    // An archive that matches but whose trivy reports another version is refused too, and not left on PATH.
    const other = archive(path.join(root, 'other'), 'echo "Version: 0.69.4"');
    writeFileSync(path.join(tools, 'release.txt'), `version ${version}\nlinux_x64 ${other}\nlinux_arm64 ${other}\n`);
    const wrong = install('other', path.join(root, 'bin-other'));
    expect(wrong.status).toBe(1);
    expect(wrong.stderr).toContain('0.69.4');
    expect(existsSync(path.join(root, 'bin-other/trivy'))).toBe(false);
  });
});

describe('publish-content.yml, held to its frozen copy (the founder’s F4)', () => {
  /** The text with each action's ref and version comment set aside, the one change a Dependabot pin bump makes. */
  const normalised = (text: string) => text.replace(/^(\s*(?:-\s+)?uses:\s*[\w./-]+)@\S+(?:\s+#.*)?$/gm, '$1');

  it('changes only by its actions’ pins: every other line is tools/test/frozen/publish-content.yml’s, its runner and its one timeout included', () => {
    const live = readFileSync(path.join(WORKFLOWS, 'publish-content.yml'), 'utf8');
    const frozen = readFileSync(path.join(repositoryRoot, 'tools/test/frozen/publish-content.yml'), 'utf8');
    expect(normalised(live)).toBe(normalised(frozen));
    // The frozen copy keeps the workflow's own tags, so only the live file's pins vary.
    expect(frozen).toContain('timeout-minutes: 15');
    // Its one runs-on move, with every other job's (F4; docs/adr/0066, Part 3).
    expect(frozen).toContain('runs-on: ubuntu-26.04');
    expect(normalised('      - uses: actions/checkout@v4\n        with: x\n      - uses: a/b@' + 'f'.repeat(40) + ' # v7.0.1\n')).toBe('      - uses: actions/checkout\n        with: x\n      - uses: a/b\n');
  });
});

/** The capacity or release steps that run actions/cache itself, at any ref: matched by the action, never by its ref. */
function plainCacheSteps(steps: readonly Step[]): Step[] {
  return steps.filter((step) => usesAction(step, 'actions/cache'));
}

/** The one actionlint message the workflows' test ignores: an exact label, its dots escaped. */
const ACTIONLINT_IGNORE = 'label "ubuntu-26\\.04" is unknown';

describe('approval-of-record (docs/adr/0063)', () => {
  const file = readFileSync(path.join(CI_ROOT, '.github/workflows/approval-of-record.yml'), 'utf8');
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
    expect(steps.map((step) => actionOf(step) ?? step.run)).toEqual(['actions/checkout', 'actions/setup-node', 'node tools/approval-of-record/approval-of-record.ts']);
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
  // actionlint (1.7.7 to 1.7.12 and main) does not know GitHub's ubuntu-26.04 label yet: exactly that one message is
  // ignored, with no configuration file, which would call a hosted label self-hosted. Remove it once actionlint lists
  // the label (docs/adr/0066, Part 3; P10).
  const actionlint = process.env.ACTIONLINT ?? spawnSync('/bin/sh', ['-c', 'command -v actionlint'], { encoding: 'utf8' }).stdout.trim();
  it.runIf(actionlint !== '')('every workflow passes actionlint, ubuntu-26.04’s unknown label alone ignored', () => {
    const files = readdirSync(WORKFLOWS).map((name) => path.join(WORKFLOWS, name));
    const result = spawnSync(actionlint, ['-shellcheck=', '-pyflakes=', '-ignore', ACTIONLINT_IGNORE, ...files], { encoding: 'utf8', timeout: TEST_TIMEOUT_MS, killSignal: 'SIGKILL' });
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
  const parsed = parse(readFileSync(path.join(CI_ROOT, '.github/workflows/mutation.yml'), 'utf8')) as {
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
    expect(readFileSync(path.join(CI_ROOT, '.github/workflows/mutation.yml'), 'utf8')).not.toMatch(/labels|labeled/);
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
    expect(steps[canary]?.run).toBe('pnpm -s exec tsx tools/stryker/stryker.ts run tools/stryker/canary/stryker.config.mjs\npnpm -s exec tsx tools/stryker/canary/verdict.ts --shard "$TP_MUTATION_SHARD"\n');
    expect(steps[shard]?.run).toBe('pnpm -s exec tsx tools/stryker/shards.ts "$TP_MUTATION_SHARD"');
    // The canary is the first step after the install, and no Stryker run comes before it.
    expect(canary).toBe(install + 1);
    expect(runs(steps.slice(0, canary)).filter((run) => run.includes('stryker'))).toEqual([]);
    expect(canary).toBeLessThan(shard);
    // Its verdicts, the shard's scores and survivors, go to the log whatever the shard did, as long as it was not cancelled.
    const view = stepIndex(steps, (step) => step.run === 'pnpm -s exec tsx tools/stryker/gate.ts reports/mutation --shard "$TP_MUTATION_SHARD"');
    expect(steps[view]?.if).toBe('${{ !cancelled() }}');
    const upload = stepIndex(steps, (step) => usesAction(step, 'actions/upload-artifact'));
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
    const download = stepIndex(mutation.steps, (step) => usesAction(step, 'actions/download-artifact'));
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
    const ran = spawnSync('bash', ['-c', wrapper, 'guard', job('mutation').steps[0]?.run ?? ''], { encoding: 'utf8', env: { PATH: process.env.PATH ?? '/usr/bin:/bin', ...env }, timeout: TEST_TIMEOUT_MS, killSignal: 'SIGKILL' });
    expect(ran.error).toBeUndefined();
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
    const versions = Object.entries(parsed.jobs).map(([name, mutationJob]) => [name, mutationJob.steps.find((step) => usesAction(step, 'actions/setup-node'))?.with?.['node-version']] as const);
    expect(versions.map(([name]) => name)).toEqual(['changes', 'stryker', 'mutation']);
    for (const [name, version] of versions) expect(version, name).toMatch(/^\d+\.\d+\.\d+$/);
    expect(new Set(versions.map(([, version]) => version)).size).toBe(1);
    const unicode = JSON.parse(readFileSync(path.join(repositoryRoot, 'tools/stryker/unicode.json'), 'utf8')) as { checkedOn: { node: string } };
    expect(versions[0]?.[1]).toBe(unicode.checkedOn.node);
  });

  it('pins every action to a full commit SHA and installs from the lockfile in every job that runs code', () => {
    for (const [name, mutationJob] of Object.entries(parsed.jobs)) {
      for (const step of mutationJob.steps) if (step.uses !== undefined) expect(parsePin(step.uses), `${name}: ${step.uses}`).toBeDefined();
      expect(mutationJob.steps.some((step) => usesAction(step, 'actions/checkout') && step.with?.['persist-credentials'] === false), name).toBe(true);
      expect(runs(mutationJob.steps).filter((run) => run.startsWith('pnpm install')), name).toEqual(['pnpm install --frozen-lockfile']);
    }
  });

  /**
   * docs/adr/0066, Part 7: no step runs a root or package script (so their edits stay inert), Stryker starts by path,
   * and the changes job checks its own runtime before it decides. Every `run:` of each job, in order, is one of these
   * whole commands; the mutation job's own shell script is listed verbatim.
   */
  const NEEDS_SCRIPT = [
    'echo "changes: $CHANGES; stryker: $STRYKER; any: ${ANY:-(none)}; packages: ${PACKAGES:-(none)}; shards: ${SHARDS:-(none)}"',
    'if [ "$CHANGES" != success ]; then',
    '  echo "::error::The changes job ended $CHANGES, so what this change affects is unknown."',
    '  exit 1',
    'fi',
    '# The outputs exactly as tools/stryker/affected.ts writes them; anything else (none, or garbled) fails closed.',
    'case "$ANY" in',
    '  true | false) ;;',
    '  *)',
    '    echo "::error::The changes job gave no verdict (any=${ANY:-(none)}), so what this change affects is unknown."',
    '    exit 1',
    '    ;;',
    'esac',
    "NAMES='^\\[(\"[a-z]+(-[a-z]+)*\"(,\"[a-z]+(-[a-z]+)*\")*)?\\]$'",
    'if ! printf \'%s\' "$SHARDS" | grep -Eq "$NAMES" || ! printf \'%s\' "$PACKAGES" | grep -Eq "$NAMES"; then',
    '  echo "::error::The changes job gave shards=${SHARDS:-(none)} and packages=${PACKAGES:-(none)}, not JSON arrays of names."',
    '  exit 1',
    'fi',
    'if [ "$ANY" = false ]; then',
    '  if [ "$SHARDS" != \'[]\' ] || [ "$PACKAGES" != \'[]\' ]; then',
    '    echo "::error::The changes job said no package is affected, yet gave shards=$SHARDS and packages=$PACKAGES."',
    '    exit 1',
    '  fi',
    '  if [ "$STRYKER" != skipped ]; then',
    '    echo "::error::No package was affected, yet the shard jobs ended $STRYKER."',
    '    exit 1',
    '  fi',
    '  echo "No money path changed: no mutation run." | tee -a "$GITHUB_STEP_SUMMARY"',
    '  echo "run=false" >> "$GITHUB_OUTPUT"',
    '  exit 0',
    'fi',
    'if [ "$SHARDS" = \'[]\' ] || [ "$PACKAGES" = \'[]\' ]; then',
    '  echo "::error::The changes job said a package is affected, yet gave shards=$SHARDS and packages=$PACKAGES."',
    '  exit 1',
    'fi',
    'if [ "$STRYKER" != success ]; then',
    '  echo "::error::A shard job ended $STRYKER (skipped, failed or cancelled), so the affected packages are not scored."',
    '  exit 1',
    'fi',
    'echo "run=true" >> "$GITHUB_OUTPUT"',
    '',
  ].join('\n');
  /** Each job's own runtime and checkout check (tools/stryker/runtime.ts), the changes job's and the gate's. */
  const RUNTIME_CHECK = 'pnpm -s exec tsx tools/stryker/runtime.ts --pnpm "$(pnpm --version)" --commit "$GITHUB_SHA"';
  const RUNS: Readonly<Record<string, readonly string[]>> = {
    changes: ['pnpm install --frozen-lockfile', RUNTIME_CHECK, 'pnpm -s exec tsx tools/stryker/affected.ts --event "$EVENT" --base "$BASE" --github-output "$GITHUB_OUTPUT" --summary "$GITHUB_STEP_SUMMARY"'],
    stryker: [
      'pnpm install --frozen-lockfile',
      'pnpm -s exec tsx tools/stryker/stryker.ts run tools/stryker/canary/stryker.config.mjs\npnpm -s exec tsx tools/stryker/canary/verdict.ts --shard "$TP_MUTATION_SHARD"\n',
      'pnpm -s exec tsx tools/stryker/shards.ts "$TP_MUTATION_SHARD"',
      'pnpm -s exec tsx tools/stryker/gate.ts reports/mutation --shard "$TP_MUTATION_SHARD"',
    ],
    mutation: [NEEDS_SCRIPT, 'pnpm install --frozen-lockfile', RUNTIME_CHECK, 'pnpm -s exec tsx tools/stryker/gate.ts reports/mutation --expected "$SHARDS" --summary "$GITHUB_STEP_SUMMARY"'],
  };

  it('runs only whole commands it lists, none of them a script, Stryker by path, and checks the changes and gate jobs’ runtime and checkout before they decide or judge', () => {
    for (const [name, mutationJob] of Object.entries(parsed.jobs)) {
      expect(mutationJob.steps.filter((step) => step.run !== undefined).map((step) => step.run), name).toEqual(RUNS[name]);
    }
    // Each listed command is the install from the lockfile or a tooling file run by tsx: no `pnpm <script>`, `pnpm run`,
    // `node --run`, npm, npx, corepack or Stryker's bin by name; the needs step's script runs none of them either.
    for (const run of Object.values(RUNS).flat()) {
      if (run === NEEDS_SCRIPT) continue;
      for (const line of run.split('\n').filter((text) => text !== '')) expect(line).toMatch(/^pnpm (?:install --frozen-lockfile|-s exec tsx tools\/stryker\/[a-z/]+\.ts(?: .*)?)$/);
    }
    expect(NEEDS_SCRIPT).not.toMatch(/\b(?:pnpm|npm|npx|node|corepack|tsx|yarn|bun|deno)\b/);
    // The changes job: install, then its runtime check, then the decision, so a runtime other than the pinned one fails
    // the job before anything is decided.
    const changes = job('changes').steps;
    const install = stepIndex(changes, (step) => step.run === 'pnpm install --frozen-lockfile');
    const runtime = stepIndex(changes, (step) => step.name === 'The runtime is the pinned one');
    const affected = stepIndex(changes, (step) => step.id === 'affected');
    expect(changes[runtime]?.run).toBe(RUNTIME_CHECK);
    expect(changes[runtime]?.if).toBeUndefined();
    expect([install, runtime]).toEqual([runtime - 1, affected - 1]);
    // The review of #96 (N3): the gate job checks its own runtime and checkout too, after its install and before it
    // reads a report, whenever it runs; the shard jobs are held by their canary verdicts instead.
    const gate = job('mutation').steps;
    const gateInstall = stepIndex(gate, (step) => step.run === 'pnpm install --frozen-lockfile');
    const gateRuntime = stepIndex(gate, (step) => step.name === 'The runtime is the pinned one');
    const download = stepIndex(gate, (step) => step.uses?.startsWith('actions/download-artifact@') === true);
    const judge = stepIndex(gate, (step) => step.name === 'The gate');
    expect(gate[gateRuntime]?.run).toBe(RUNTIME_CHECK);
    expect(gate[gateRuntime]?.if).toBe("steps.needs.outputs.run == 'true'");
    expect([gateInstall + 1, gateRuntime + 1]).toEqual([gateRuntime, download]);
    expect(judge).toBeGreaterThan(download);
    for (const [name, mutationJob] of Object.entries(parsed.jobs)) {
      const tsx = mutationJob.steps.findIndex((step) => step.run?.includes('exec tsx tools/stryker/') === true);
      if (name !== 'stryker') expect(mutationJob.steps[tsx]?.run, name).toBe(RUNTIME_CHECK);
    }
  });

  /**
   * docs/adr/0066, Part 7 (E3): what keeps every root or package script, and every manifest field no shard reads, inert
   * is that nothing a mutation run loads runs a process or reads a manifest but these, each for what it names. The scan
   * covers the mutation tooling's own closure (tools/stryker/affected.ts globalFiles, called, so it grows with that
   * closure) and the four packages' closures. Every entry must be among the scanned files and still hold each literal
   * it lists, so the lists cannot go stale.
   */
  const SPAWNS: Readonly<Record<string, { readonly program: string; readonly runs: string }>> = {
    'tools/stryker/affected.ts': { program: "'git'", runs: 'git alone: the tracked files, a revision’s tree, the diff and the merge base' },
    'tools/stryker/stryker.ts': { program: 'process.execPath', runs: 'this Node on @stryker-mutator/core’s bin.stryker, through the spawn it is given (stryker.test.ts holds the bin)' },
  };
  const MANIFEST_LITERALS = ['package.json', 'pnpm-workspace.yaml', 'mutation.yml', 'read-pkg', 'read-package-up', 'pkg-up', '@npmcli/package-json', 'npm_package_'] as const;
  const MANIFEST_READERS: Readonly<Record<string, { readonly literals: readonly (typeof MANIFEST_LITERALS)[number][]; readonly reads: string }>> = {
    'tools/stryker/affected.ts': { literals: ['package.json', 'pnpm-workspace.yaml', 'mutation.yml'], reads: 'all three as data: the global inputs and each closure’s manifests, diffed, never run' },
    'tools/stryker/manifests.ts': { literals: ['package.json', 'pnpm-workspace.yaml', 'mutation.yml'], reads: 'all three as data: each side’s text of the root and workspace manifests, the workspace file and this workflow, classified field by field, never run' },
    'tools/stryker/canary/stryker.config.mjs': { literals: ['mutation.yml'], reads: 'a comment naming the workflow whose shard step runs it' },
    'tools/stryker/workspace.ts': { literals: ['package.json', 'pnpm-workspace.yaml'], reads: 'the workspace’s packages, and each workspace manifest’s name and exports (the aliases)' },
    'tools/stryker/stryker.ts': { literals: ['package.json'], reads: '@stryker-mutator/core’s own manifest under node_modules, for its bin' },
    'tools/stryker/runtime.ts': { literals: ['package.json'], reads: 'the root packageManager, the pinned pnpm' },
    'tools/screening-capacity/watched.ts': { literals: ['package.json', 'pnpm-workspace.yaml'], reads: 'paths in its watched list, and comments' },
    'vitest.mutation.config.ts': { literals: ['package.json', 'pnpm-workspace.yaml'], reads: 'comments naming where the aliases come from' },
  };

  // It reads the repository's tooling, never CI_TREE's copy, so the runs on a copy skip it (as both the simulated
  // Dependabot rewrite's runs do, each starting its own vitest with CI_TREE set).
  it.skipIf(process.env.CI_TREE !== undefined)('lets no file a mutation run loads run a process but git and Stryker by path, or name a manifest or this workflow but those listed with what they read', async () => {
    const { globalFiles, repositoryClosures, trackedFiles } = await import('../stryker/affected');
    // TypeScript's parser, loaded here so collecting this file stays light.
    const ts = (await import('typescript')).default;
    type Node = Parameters<typeof ts.forEachChild>[0];
    /** Each use of a child_process binding in a file, other than a call whose first argument is `program`. */
    const spawnProblems = (file: string, text: string, program: string): string[] => {
      const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
      const at = (node: Node) => `${file}:${String(source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1)}`;
      const problems: string[] = [];
      const bindings = new Set<string>();
      const visit = (node: Node): void => {
        if (ts.isStringLiteralLike(node) && /^(?:node:)?child_process$/.test(node.text)) {
          const declaration = node.parent;
          const clause = ts.isImportDeclaration(declaration) ? declaration.importClause : undefined;
          const named = clause?.namedBindings;
          if (clause === undefined || clause.name !== undefined || named === undefined || !ts.isNamedImports(named)) problems.push(`${at(node)}: child_process reached other than by named imports, so its spawns cannot be read`);
          else if (!clause.isTypeOnly) for (const element of named.elements) if (!element.isTypeOnly) bindings.add(element.name.text);
        } else if (ts.isIdentifier(node) && bindings.has(node.text)) {
          const parent = node.parent;
          const declares = (ts.isImportSpecifier(parent) || ts.isParameter(parent)) && parent.name === node;
          const member = (ts.isPropertyAccessExpression(parent) || ts.isPropertyAssignment(parent)) && parent.name === node;
          if (declares || member || ts.isTypeQueryNode(parent)) {
            // Its declaration, a property of the same name, or its type.
          } else if (ts.isCallExpression(parent) && parent.expression === node) {
            const first = parent.arguments[0]?.getText(source) ?? '(nothing)';
            if (first !== program) problems.push(`${at(node)}: ${node.text} runs ${first}, not ${program}`);
          } else if (ts.isParameter(parent) && parent.initializer === node && ts.isIdentifier(parent.name)) {
            // The default of a parameter (the injected spawn): the parameter is held to the same program.
            bindings.add(parent.name.text);
          } else problems.push(`${at(node)}: ${node.text} is used other than to run ${program}`);
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
      return problems;
    };
    const files = trackedFiles(repositoryRoot);
    const scanned = [...new Set([...globalFiles(repositoryRoot, files).files, ...repositoryClosures(repositoryRoot, files).flatMap((closure) => closure.files)])].sort();
    expect(scanned).toContain('tools/stryker/gate.ts');
    expect(scanned).toContain('packages/money/src/index.ts');
    const problems: string[] = [];
    for (const file of [...new Set([...Object.keys(SPAWNS), ...Object.keys(MANIFEST_READERS)])]) if (!scanned.includes(file)) problems.push(`${file} is listed, but no mutation run loads it`);
    for (const file of scanned) {
      const text = readFileSync(path.join(repositoryRoot, file), 'utf8');
      const spawn = SPAWNS[file];
      if (spawn === undefined) {
        if (text.includes('child_process')) problems.push(`${file} names child_process: no file a mutation run loads may run a process but those SPAWNS lists`);
      } else {
        if (!text.includes('child_process')) problems.push(`${file} no longer names child_process: remove its SPAWNS entry`);
        problems.push(...spawnProblems(file, text, spawn.program));
      }
      const held = MANIFEST_LITERALS.filter((literal) => text.includes(literal));
      const listed = MANIFEST_READERS[file]?.literals ?? [];
      for (const literal of held) if (!listed.includes(literal)) problems.push(`${file} names ${literal}: no file a mutation run loads may name a manifest or this workflow but those MANIFEST_READERS lists, with what each reads`);
      for (const literal of listed) if (!held.includes(literal)) problems.push(`${file} no longer names ${literal}: remove it from its MANIFEST_READERS entry`);
    }
    expect(problems).toEqual([]);
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

describe('job timeouts (CI-10)', () => {
  it('give every job of every workflow the timeout its table names, well under GitHub’s 360 minutes', () => {
    const limits = Object.fromEntries(
      workflowFiles().map((file) => [file, Object.fromEntries(Object.entries(workflow(file).jobs).map(([name, job]) => [name, job['timeout-minutes'] ?? 360]))]),
    );
    expect(limits).toEqual({
      'approval-of-record.yml': { 'approval-of-record': 5 },
      // Each about three times its expected time (docs/adr/0066, Part 1); the gate's 5 for a job that only reads results.
      'ci.yml': { static: 15, lint: 15, unit: 20, db: 20, 'domain-model': 10, build: 15, e2e: 25, images: 20, 'all-green': 5 },
      // The daily calendar check, its one issues call, and on a pull request the hand-over proof (docs/adr/0071).
      'content-calendar.yml': { check: 15, handoff: 5, notify: 5 },
      // The 2 GiB intake run, weekly and on request.
      'large-zip.yml': { 'large-zip': 45 },
      'mutation.yml': { changes: 5, stryker: 30, mutation: 10 },
      // Its one run took 21 s; the work of the static job's band (the founder's F4, which allows this one line).
      'publish-content.yml': { publish: 15 },
      // Each about three times its expected time (docs/adr/0066, Part 2).
      'release-dry-run.yml': { build: 20, push: 10, capacity: 15 },
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

/**
 * One environment string stops at 131,072 bytes, its name, its = and its NUL included (Linux's MAX_ARG_STRLEN): one
 * longer and bash never starts ("Argument list too long", #42's job 122624309161, where a build's whole metadata, with
 * the pull request's description in it, reached 132,387). So nothing that can grow past it may reach a step's
 * environment, an action's input (an INPUT_* variable) or a script. Every expression there is read as the runner reads
 * it (actions/runner's LexicalAnalyzer: whitespace skipped before every token, a name before "(" a function, names and
 * keys without case) and admitted only from a closed list: values GitHub or the workflow bounds, and each step output
 * or value one job hands another, listed with its bound (docs/adr/0066, Part 3, N32). A workflow's, a job's or a step's
 * key the rule does not read is refused, no key holds an expression, and each environment string a workflow sets is
 * summed from its name, its literal bytes and each value's bound in bytes. These read this repository's workflows: a
 * pinned action's own action.yml and code are not read by them (actions:check reads a pin's action.yml for the pin
 * rules, never to bound a value), and the defect itself came from action code (buildx copying the event into its
 * metadata), which no expression rule can read, so every step output is bounded where a workflow hands it to a process.
 */
describe('one environment string of at most Linux’s 131,072 bytes (docs/adr/0066, Part 3, N32)', () => {
  type Token = { readonly kind: 'string' | 'number' | 'keyword' | 'name' | 'function' | 'punctuation' | 'operator' | 'star'; readonly text: string };
  type Expression =
    | { readonly t: 'literal'; readonly kind: 'string' | 'number' | 'keyword'; readonly value: string }
    | { readonly t: 'not'; readonly operand: Expression }
    | { readonly t: 'binary'; readonly operator: string; readonly left: Expression; readonly right: Expression }
    | { readonly t: 'call'; readonly name: string; readonly args: readonly Expression[] }
    | { readonly t: 'reference'; readonly name: string }
    | { readonly t: 'access'; readonly target: Expression; readonly path: readonly Access[] };
  type Access = { readonly name: string } | { readonly star: true } | { readonly computed: Expression };

  /** An expression's tokens, after the runner's lexer: names, functions and keywords in lower case, '' one quote in a string. */
  function lexExpression(text: string): Token[] {
    const tokens: Token[] = [];
    let at = 0;
    while (at < text.length) {
      const rest = text.slice(at);
      const char = text.charAt(at);
      if (/\s/.test(char)) {
        at += 1;
      } else if (char === "'") {
        let value = '';
        let end = at + 1;
        for (;;) {
          if (end >= text.length) throw new SyntaxError('a string with no closing quote');
          if (text.charAt(end) === "'") {
            if (text.charAt(end + 1) !== "'") break;
            value += "'";
            end += 2;
          } else {
            value += text.charAt(end);
            end += 1;
          }
        }
        tokens.push({ kind: 'string', text: value });
        at = end + 1;
      } else if (/^(?:&&|\|\||==|!=|<=|>=)/.test(rest)) {
        tokens.push({ kind: 'operator', text: rest.slice(0, 2) });
        at += 2;
      } else if (char === '<' || char === '>') {
        tokens.push({ kind: 'operator', text: char });
        at += 1;
      } else if ('()[],.!'.includes(char)) {
        tokens.push({ kind: 'punctuation', text: char });
        at += 1;
      } else if (char === '*') {
        tokens.push({ kind: 'star', text: char });
        at += 1;
      } else {
        const word = /^[A-Za-z_][A-Za-z0-9_-]*/.exec(rest)?.[0];
        const number = /^[-+]?(?:0x[0-9a-fA-F]+|[0-9]+(?:\.[0-9]+)?(?:[eE][-+]?[0-9]+)?)/.exec(rest)?.[0];
        if (word !== undefined) {
          const name = word.toLowerCase();
          const call = /^\s*\(/.test(text.slice(at + word.length));
          tokens.push({ kind: ['true', 'false', 'null'].includes(name) ? 'keyword' : call ? 'function' : 'name', text: name });
          at += word.length;
        } else if (number !== undefined) {
          tokens.push({ kind: 'number', text: number });
          at += number.length;
        } else {
          throw new SyntaxError(`an unexpected ${char}`);
        }
      }
    }
    return tokens;
  }

  /** The tree of an expression's tokens: references with their property path, calls and operators (each left to right). */
  function parseExpression(tokens: readonly Token[]): Expression {
    let at = 0;
    const peek = (): Token | undefined => tokens[at];
    const take = (): Token => {
      const token = tokens[at];
      if (token === undefined) throw new SyntaxError('an expression that stops short');
      at += 1;
      return token;
    };
    const punctuation = (token: Token | undefined, text: string) => token?.kind === 'punctuation' && token.text === text;
    const close = (text: string) => {
      if (!punctuation(take(), text)) throw new SyntaxError(`no ${text}`);
    };
    const primary = (): Expression => {
      const token = take();
      let node: Expression;
      if (token.kind === 'string' || token.kind === 'number' || token.kind === 'keyword') {
        node = { t: 'literal', kind: token.kind, value: token.text };
      } else if (token.kind === 'function') {
        close('(');
        const args: Expression[] = [];
        if (!punctuation(peek(), ')')) {
          args.push(expression());
          while (punctuation(peek(), ',')) {
            take();
            args.push(expression());
          }
        }
        close(')');
        node = { t: 'call', name: token.text, args };
      } else if (token.kind === 'name') {
        node = { t: 'reference', name: token.text };
      } else if (punctuation(token, '(')) {
        node = expression();
        close(')');
      } else if (punctuation(token, '!')) {
        return { t: 'not', operand: primary() };
      } else {
        throw new SyntaxError(`an unexpected ${token.text}`);
      }
      const path: Access[] = [];
      for (;;) {
        if (punctuation(peek(), '.')) {
          take();
          const property = take();
          if (property.kind === 'star') path.push({ star: true });
          else if (property.kind === 'name' || property.kind === 'function' || property.kind === 'keyword' || property.kind === 'number') path.push({ name: property.text });
          else throw new SyntaxError(`a property named ${property.text}`);
        } else if (punctuation(peek(), '[')) {
          take();
          if (peek()?.kind === 'star') {
            take();
            path.push({ star: true });
          } else {
            const index = expression();
            path.push(index.t === 'literal' && index.kind !== 'keyword' ? { name: index.kind === 'string' ? index.value.toLowerCase() : index.value } : { computed: index });
          }
          close(']');
        } else {
          break;
        }
      }
      return path.length === 0 ? node : { t: 'access', target: node, path };
    };
    const expression = (): Expression => {
      let left = primary();
      for (let next = peek(); next?.kind === 'operator'; next = peek()) {
        take();
        left = { t: 'binary', operator: next.text, left, right: primary() };
      }
      return left;
    };
    const tree = expression();
    if (at !== tokens.length) throw new SyntaxError(`${tokens[at]?.text ?? ''} after the expression`);
    return tree;
  }

  /** A reference and its literal property names, or undefined where the path holds a * or a computed index. */
  function namesOf(node: Expression): string[] | undefined {
    if (node.t === 'reference') return [node.name];
    if (node.t !== 'access' || node.target.t !== 'reference') return undefined;
    const names = [node.target.name];
    for (const access of node.path) {
      if (!('name' in access)) return undefined;
      names.push(access.name);
    }
    return names;
  }

  /** Linux's limit on one environment string, NAME=value and its NUL, or one argument (MAX_ARG_STRLEN, 32 pages of 4 KiB). */
  const MAX_ARG_STRLEN = 131_072;
  /**
   * Linux's limit on a process's environment and arguments together (ARG_MAX: a quarter of the 8 MiB stack limit
   * the runner's images set), and what is kept back of it for the runner's own: the image's variables, GITHUB_* and
   * RUNNER_*, and a pointer for each string. 256 KiB is a round figure with headroom, not a measured one.
   */
  const ARG_MAX = 2_097_152;
  const RUNNER_MARGIN = 262_144;
  /** A repository variable's or a secret's bound, 48 KB (GitHub's documentation). */
  const VARIABLE_BYTES = 49_152;
  /** A path the runner or git keeps (Linux's PATH_MAX). */
  const PATH_BYTES = 4_096;
  /** A 64-bit integer's decimal digits. */
  const INTEGER_BYTES = 20;
  /** A commit SHA: 40 hexadecimal digits, or 64 in a SHA-256 repository. */
  const SHA_BYTES = 64;
  /** A result, an outcome or a conclusion, of which cancelled is the longest; and true or false. */
  const WORD_BYTES = 9;
  const BOOLEAN_BYTES = 5;
  /**
   * The github context's paths admitted whole, each with its bound in bytes: scalars GitHub bounds, the ones in use. A
   * login is at most 39 characters (a bot's is its app's name, at most 34, and [bot]); a branch or a ref is a path git
   * keeps; a trigger's name is a word (the longest, pull_request_review_comment, has 27 characters); a repository is an
   * owner of at most 39 characters, a slash and a name of at most 100; the server's URL is https:// and a host name of
   * at most 253 bytes, with a port; the token is held as a secret is.
   */
  const BOUNDED_GITHUB: ReadonlyMap<string, number> = new Map([
    ['actor', 64],
    ['base_ref', PATH_BYTES],
    ['event_name', 64],
    ['ref', PATH_BYTES],
    ['ref_name', PATH_BYTES],
    ['repository', 140],
    ['run_id', INTEGER_BYTES],
    ['server_url', 'https://'.length + 253 + ':65535'.length],
    ['sha', SHA_BYTES],
    ['token', VARIABLE_BYTES],
    ['event.before', SHA_BYTES],
    ['event.pull_request.number', INTEGER_BYTES],
    ['event.pull_request.base.sha', SHA_BYTES],
    ['event.pull_request.head.sha', SHA_BYTES],
    ['event.repository.private', BOOLEAN_BYTES],
  ]);
  /**
   * Contexts admitted one level down: a runner, strategy, matrix or job value, a variable the workflow sets (each held
   * here where it is set), and a repository variable or a secret, each at most 48 KB (GitHub's documentation).
   */
  const ONE_LEVEL = new Set(['runner', 'strategy', 'matrix', 'job', 'env', 'vars', 'secrets']);
  /** The input types that bound an input; a string input has no bound GitHub documents. */
  const BOUNDED_INPUT_TYPES = new Set(['choice', 'boolean', 'number']);
  /** A number as the runner writes one (a double's shortest form, its exponent included), or a number input's value. */
  const NUMBER_BYTES = 24;
  /** The one-level values of the runner and job contexts, each with its bound: a path or a name the runner sets, a word, an integer. */
  const RUNNER_BYTES = PATH_BYTES;
  const JOB_BYTES: Readonly<Record<string, number>> = { status: WORD_BYTES, check_run_id: INTEGER_BYTES };
  /** Where a file command write is made: its file, job and step, and the fingerprint of that step (as a row's run: producer holds one). */
  interface FileCommandSite {
    readonly file: string;
    readonly job: string;
    readonly step: string;
    readonly fingerprint: string;
  }
  /** One write a script may make to a runner file command: its line exactly (so its value's form too), where, its bound and the test that holds it. */
  interface FileCommandWrite {
    readonly line: string;
    readonly sites: readonly FileCommandSite[];
    readonly bound: string;
    readonly test: string;
  }
  /**
   * The only writes a script may make to $GITHUB_ENV, by the variable each sets, and to $GITHUB_PATH, by the directory
   * each puts on PATH: its line exactly (so its value's form too), each step that makes it (its file, job and step, and
   * that step's fingerprint, so any change to the script or its inputs fails until a person re-reads the bound), and
   * its bound, which the behavioural test named beside it holds by running the step and reading the whole file it
   * writes. Each is written once in each step it names, and every line of every workflow's script that names
   * GITHUB_ENV or GITHUB_PATH (a backslash-newline joining two, as bash reads them) is one of them; nothing but a
   * step's run: names either, nothing names the runner's file command files, no env sets
   * ACTIONS_ALLOW_UNSECURE_COMMANDS (::set-env), and every other tracked file naming any of them is in a closed list
   * (NAMES_FILE_COMMANDS). A script that reaches the file without naming it (a name built at run time, another
   * interpreter), and a dependency's or an action's code, are not closed by reading text.
   */
  const GITHUB_ENV_WRITES: Readonly<Record<string, FileCommandWrite>> = {
    ENGINE_FREEZE_BASE: {
      line: 'echo "ENGINE_FREEZE_BASE=$base" >> "$GITHUB_ENV"',
      sites: [{ file: 'ci.yml', job: 'unit', step: "The engine freeze's base", fingerprint: '9be9805d' }],
      bound: "a commit SHA (the pull request's merge base, github.event.before or HEAD's parent), written only once git rev-parse --verify names it a commit, the step exiting 1 otherwise",
      test: 'gives the differential test a pull request’s merge base, a push’s previous head or a new branch’s parent, through GITHUB_ENV',
    },
    TRIVY_CMD: {
      line: 'echo "TRIVY_CMD=$trivy" >> "$GITHUB_ENV"',
      sites: [
        { file: 'ci.yml', job: 'images', step: 'The pinned Trivy', fingerprint: '3ad03da4' },
        { file: 'release-dry-run.yml', job: 'build', step: 'The pinned Trivy', fingerprint: '3ad03da4' },
        { file: 'release.yml', job: 'build', step: 'The pinned Trivy', fingerprint: '3ad03da4' },
      ],
      bound:
        "the absolute path tools/trivy/install.sh prints, its one line of output: the directory it is given ($RUNNER_TEMP/trivy-bin, the runner's own temporary directory), resolved by pwd -P, then /trivy, so a runner path with no line break, at most PATH_BYTES; a failed install fails the step under bash -e before this line runs",
      test: 'gives the later steps the pinned Trivy by its absolute path through GITHUB_ENV and its directory through GITHUB_PATH, one line each, and writes neither when the install fails',
    },
  };
  const GITHUB_PATH_WRITES: Readonly<Record<string, FileCommandWrite>> = {
    'trivy-bin': {
      line: 'dirname "$trivy" >> "$GITHUB_PATH"',
      sites: GITHUB_ENV_WRITES.TRIVY_CMD?.sites ?? [],
      bound:
        "the directory of TRIVY_CMD's path ($RUNNER_TEMP/trivy-bin resolved), a runner path with no line break, at most PATH_BYTES, which the runner puts before PATH for every later step of the job: PATH is the runner's own environment, inside the RUNNER_MARGIN the whole leaves it",
      test: 'gives the later steps the pinned Trivy by its absolute path through GITHUB_ENV and its directory through GITHUB_PATH, one line each, and writes neither when the install fails',
    },
  };
  /**
   * The keys a workflow, a job and a step may have, each read by the rule below or reaching no process (a name, a
   * condition, a timeout, permissions, a concurrency group, runs-on's labels, an environment's name and URL).
   */
  const WORKFLOW_KEYS: ReadonlySet<string> = new Set(['name', 'run-name', 'on', 'permissions', 'env', 'defaults', 'concurrency', 'jobs']);
  const JOB_KEYS: ReadonlySet<string> = new Set(['name', 'needs', 'if', 'runs-on', 'timeout-minutes', 'continue-on-error', 'container', 'services', 'env', 'environment', 'permissions', 'concurrency', 'outputs', 'defaults', 'steps', 'strategy', 'uses', 'with', 'secrets']);
  const STEP_KEYS: ReadonlySet<string> = new Set(['name', 'id', 'if', 'uses', 'run', 'with', 'env', 'working-directory', 'shell', 'continue-on-error', 'timeout-minutes']);
  /** The one form a build's metadata output may take: its config digest, '' for an empty output (fromJSON('') fails a step). */
  const DIGEST_KEY = 'containerimage.config.digest';

  /** Why this expression is not admitted (none when it is), and the step outputs and cross-job values it reads, for BOUNDED_VALUES. */
  function expressionProblems(tree: Expression, inputs: Readonly<Record<string, unknown>>, values: string[]): string[] {
    const problems: string[] = [];
    const reference = (names: readonly string[] | undefined, inToJson = false): void => {
      if (names === undefined) {
        problems.push('a wildcard or a computed index');
        return;
      }
      const [base = '', ...rest] = names;
      const dotted = names.join('.');
      if (base === 'github') {
        if (!BOUNDED_GITHUB.has(rest.join('.'))) problems.push(`${dotted}, not a bounded github value`);
      } else if (ONE_LEVEL.has(base)) {
        if (rest.length !== 1) problems.push(`${dotted}, not one level of ${base}`);
      } else if (base === 'inputs') {
        if (rest.length !== 1 || !BOUNDED_INPUT_TYPES.has(String(inputs[rest[0] ?? '']))) problems.push(`${dotted}, an input whose type does not bound it`);
      } else if ((base === 'needs' && rest.length === 2 && rest[1] === 'result') || (base === 'steps' && rest.length === 2 && (rest[1] === 'outcome' || rest[1] === 'conclusion'))) {
        // A result, an outcome or a conclusion: one word.
      } else if (base === 'steps' && rest.length === 3 && rest[1] === 'outputs' && rest[2] === 'metadata') {
        problems.push(`${dotted} whole`);
      } else if ((base === 'steps' || base === 'needs') && rest.length === 3 && rest[1] === 'outputs') {
        values.push(dotted);
      } else if (inToJson && base === 'needs' && (rest.length === 0 || (rest.length === 2 && rest[1] === 'outputs'))) {
        values.push(`tojson(${dotted})`);
      } else {
        problems.push(dotted);
      }
    };
    const walk = (node: Expression): void => {
      switch (node.t) {
        case 'literal':
          return;
        case 'not':
          walk(node.operand);
          return;
        case 'binary':
          walk(node.left);
          walk(node.right);
          return;
        case 'reference':
          reference([node.name]);
          return;
        case 'access': {
          const target = node.target;
          if (target.t !== 'call') {
            reference(namesOf(node));
            return;
          }
          const [argument] = target.args;
          const [key] = node.path;
          if (target.name === 'fromjson' && target.args.length === 1 && argument?.t === 'binary' && argument.operator === '||' && argument.right.t === 'literal' && argument.right.kind === 'string' && argument.right.value === '{}' && node.path.length === 1 && key !== undefined && 'name' in key && key.name === DIGEST_KEY) {
            const names = namesOf(argument.left);
            if (names?.length === 4 && names[0] === 'steps' && names[2] === 'outputs' && names[3] === 'metadata') {
              values.push(`fromjson(${names.join('.')} || '{}')['${DIGEST_KEY}']`);
              return;
            }
          }
          // fromJSON of an admitted value, then literal keys alone (the matrices).
          if (target.name === 'fromjson' && node.path.every((access) => 'name' in access)) {
            walk(target);
            return;
          }
          problems.push(`an index or a wildcard on ${target.name}()`);
          return;
        }
        case 'call': {
          if (['success', 'failure', 'always', 'cancelled'].includes(node.name) && node.args.length === 0) return;
          if (node.name === 'tojson') {
            // toJSON of needs or of one job's outputs, each a row; of one value it would quote and escape the value, up
            // to six bytes for each of its bytes, which no row's bound counts, so it is refused.
            const [argument] = node.args;
            const names = node.args.length === 1 && argument !== undefined ? namesOf(argument) : undefined;
            if (names?.[0] === 'needs' && (names.length === 1 || (names.length === 3 && names[2] === 'outputs'))) reference(names, true);
            else problems.push(`toJSON of ${names?.join('.') ?? 'an expression'}`);
            return;
          }
          if (node.name === 'fromjson' && node.args.length === 1) {
            node.args.forEach(walk);
            return;
          }
          // hashFiles and any other function of literals alone.
          if (!node.args.every((argument) => argument.t === 'literal')) problems.push(`${node.name}() of a context`);
          return;
        }
      }
    };
    walk(tree);
    return problems;
  }

  interface ValueKey {
    readonly file: string;
    readonly job: string;
    readonly value: string;
  }

  interface FoundValue extends ValueKey {
    /** Where it is read, as the rule's messages name a place: its job, its step and its key. */
    readonly where: string;
    /** The index of the step that reads it, when a step does (a job's own keys are read before or after its steps). */
    readonly step?: number;
  }

  /**
   * Every expression of a workflow that reaches a process, read as the runner reads it: the workflow's env and defaults;
   * each job's env, outputs, strategy, container, services, with, secrets and defaults (its run's shell is the command
   * the runner starts); each step's env, with, run, working-directory and shell (`if:` and `name:` reach none). A key
   * outside the closed lists of a workflow's, a job's and a step's keys is refused, so none goes unread. GitHub's contexts table
   * names every key that takes a context. A mapping's keys are read too, anywhere in the file: GitHub evaluates an
   * expression in an env name, an input's name (INPUT_<key>), a service's id or a matrix key, and in keys whose own
   * text reaches no process (a container's or a service's own, registry credentials, strategy, a matrix's include
   * entries, a job's defaults.run), and refuses one when it parses the file in the rest (on:, the workflow's
   * defaults.run, a job's id or outputs, a step's own keys, a reusable workflow's with: and secrets:); none may hold one. What it refuses, each naming its file, job, step and
   * key, and the values it found for BOUNDED_VALUES.
   */
  function unboundedValueProblems(file: string, parsed: unknown): { problems: string[]; values: FoundValue[] } {
    const problems: string[] = [];
    const values: FoundValue[] = [];
    const writes = new Map<string, number>();
    const root = isRecord(parsed) ? parsed : {};
    const inputs: Record<string, unknown> = {};
    for (const trigger of ['workflow_dispatch', 'workflow_call']) {
      const on = isRecord(root.on) ? root.on[trigger] : undefined;
      const declared = isRecord(on) && isRecord(on.inputs) ? on.inputs : {};
      for (const [name, declaration] of Object.entries(declared)) inputs[name.toLowerCase()] = isRecord(declaration) ? declaration.type : undefined;
    }
    const visit = (value: unknown, where: string, job: string, step?: number): void => {
      if (typeof value === 'string') {
        for (const match of value.matchAll(/\$\{\{([\s\S]*?)\}\}/g)) {
          const text = match[1] ?? '';
          const found: string[] = [];
          let refused: string[];
          try {
            refused = expressionProblems(parseExpression(lexExpression(text)), inputs, found);
          } catch (error) {
            refused = [`does not parse (${error instanceof Error ? error.message : 'unknown'})`];
          }
          problems.push(...refused.map((problem) => `${file} ${where}: ${problem}, in \${{${text}}}`));
          values.push(...found.map((entry) => ({ file, job, value: entry.toLowerCase(), where, ...(step === undefined ? {} : { step }) })));
        }
      } else if (isList(value)) {
        value.forEach((item, index) => visit(item, `${where}[${String(index)}]`, job, step));
      } else if (isRecord(value)) {
        for (const [key, item] of Object.entries(value)) visit(item, `${where}.${key}`, job, step);
      }
    };
    // Every key of the whole file, independent of the places visit reads: an expression in a key is refused wherever it
    // stands.
    const keys = (value: unknown, where: string): void => {
      if (isList(value)) {
        value.forEach((item, index) => keys(item, `${where}[${String(index)}]`));
      } else if (isRecord(value)) {
        for (const [key, item] of Object.entries(value)) {
          const at = where === '' ? key : `${where}.${key}`;
          if (key.includes('${{')) problems.push(`${file} ${at}: an expression in a key`);
          // The runner's switch for ::set-env and ::add-path, which let any script set a variable for every later step
          // without $GITHUB_ENV; actionlint, which flags them, does not run on CI.
          if (key.toUpperCase() === 'ACTIONS_ALLOW_UNSECURE_COMMANDS') problems.push(`${file} ${at}: a switch for ::set-env, which writes a variable outside $GITHUB_ENV's closed map`);
          keys(item, at);
        }
      }
    };
    keys(root, '');
    // Only a step's run: may name $GITHUB_ENV or $GITHUB_PATH, where every line naming either is an entry of its closed
    // map (GITHUB_ENV_WRITES, GITHUB_PATH_WRITES), made in a step the entry names. A shell (a step's or a default), an input, an env name or value, or any other string naming either,
    // and anything naming the runner's file command files themselves, would let a command template or an action set a
    // later step's environment that no line of a script shows, so each is refused.
    // The runner's file command files by their directory or their own names (set_env_<uuid>, add_path_<uuid>), which a
    // script could reach beside $GITHUB_OUTPUT's file without naming $GITHUB_ENV.
    const RUNNER_FILES = /_runner_file_commands|set_env_|add_path_/i;
    const fileCommand = (text: string): boolean => text.includes('GITHUB_ENV') || text.includes('GITHUB_PATH') || RUNNER_FILES.test(text);
    const outsideRun = (where: string) => `${file} ${where}: names $GITHUB_ENV, $GITHUB_PATH or the runner's file commands outside a step's run:, where a shell, an input or an action could set a later step's environment unread`;
    const commands = (value: unknown, where: string): void => {
      if (typeof value === 'string') {
        if (fileCommand(value) && !/^jobs\.[^.]+\.steps\[\d+\]\.run$/.test(where)) problems.push(outsideRun(where));
      } else if (isList(value)) {
        value.forEach((item, index) => commands(item, `${where}[${String(index)}]`));
      } else if (isRecord(value)) {
        for (const [key, item] of Object.entries(value)) {
          const at = where === '' ? key : `${where}.${key}`;
          if (fileCommand(key)) problems.push(outsideRun(at));
          commands(item, at);
        }
      }
    };
    commands(root, '');
    // A key this rule does not know, at the top, in a job or in a step (a nested parallel: step list, say), would hold
    // expressions nothing reads, so each is refused until the rule reads it.
    const unread = (value: Record<string, unknown>, known: ReadonlySet<string>, where: string): void => {
      for (const key of Object.keys(value)) if (!known.has(key)) problems.push(`${file} ${where}: ${key}, a key the value rule does not read`);
    };
    unread(root, WORKFLOW_KEYS, 'the workflow');
    visit(root.env, 'env', '-');
    visit(root.defaults, 'defaults', '-');
    for (const [id, job] of Object.entries(isRecord(root.jobs) ? root.jobs : {})) {
      if (!isRecord(job)) continue;
      unread(job, JOB_KEYS, `job ${id}`);
      for (const key of ['env', 'outputs', 'strategy', 'container', 'services', 'with', 'secrets', 'defaults']) visit(job[key], `job ${id} ${key}`, id);
      (isList(job.steps) ? job.steps : []).forEach((step, index) => {
        if (!isRecord(step)) return;
        const named = `job ${id} step ${typeof step.name === 'string' ? JSON.stringify(step.name) : String(index)}`;
        unread(step, STEP_KEYS, named);
        for (const key of ['env', 'with', 'run', 'working-directory', 'shell']) visit(step[key], `${named} ${key}`, id, index);
        // Each line as bash reads it, a backslash-newline joining two, so a write split across lines is still read.
        const lines = (typeof step.run === 'string' ? step.run : '').replace(/\\\n/g, '').split('\n');
        for (const line of lines.filter((text) => RUNNER_FILES.test(text))) problems.push(`${file} ${named} run: names the runner's file commands, which set a later step's environment unread: ${line.trim()}`);
        const listed = (map: Readonly<Record<string, FileCommandWrite>>, line: string) =>
          Object.entries(map).find(([, entry]) => entry.line === line.trim() && entry.sites.some((site) => site.file === file && site.job === id && site.step === step.name))?.[0];
        for (const line of lines.filter((text) => text.includes('GITHUB_PATH'))) {
          const write = listed(GITHUB_PATH_WRITES, line);
          if (write === undefined) problems.push(`${file} ${named} run: a $GITHUB_PATH write, which sets PATH for every later step and no row bounds: ${line.trim()}`);
          else writes.set(`$GITHUB_PATH\0${write}\0${id}`, (writes.get(`$GITHUB_PATH\0${write}\0${id}`) ?? 0) + 1);
        }
        for (const line of lines.filter((text) => text.includes('GITHUB_ENV'))) {
          const write = listed(GITHUB_ENV_WRITES, line);
          if (write === undefined) problems.push(`${file} ${named} run: a $GITHUB_ENV write outside its closed map: ${line.trim()}`);
          else writes.set(`$GITHUB_ENV\0${write}\0${id}`, (writes.get(`$GITHUB_ENV\0${write}\0${id}`) ?? 0) + 1);
        }
      });
    }
    for (const [key, count] of writes) {
      const [command = '', name = ''] = key.split('\0');
      if (count > 1) problems.push(`${file}: ${name} is written to ${command} ${String(count)} times, not once`);
    }
    return { problems, values };
  }

  /** Where an expression is read, for its bound: its job, the env mappings env.X reads (innermost first), and what the sum found. */
  interface Reading {
    readonly job: string | undefined;
    readonly scopes: readonly Readonly<Record<string, unknown>>[];
    /** What has no bound, each in words. */
    readonly unbounded: string[];
  }

  /**
   * Every environment string a workflow sets, NAME=value and its NUL as Linux counts it against MAX_ARG_STRLEN: the
   * workflow's, each job's, each job container's and service's, and each step's env, and each step input as
   * INPUT_<NAME>. Its bytes are the name's, '=' and the NUL, the value's literal bytes outside ${{ }}, and each
   * expression's bound: a github value BOUNDED_GITHUB's, a variable or a secret 48 KB, a bounded input its type's, a
   * matrix key its longest value's (its include entries' among them), env.X the bound of X where it is set (the
   * step's env, the job's, the workflow's), and a table row its bytes. What refuses one: a sum over 131,072, or a value
   * with no bound, each naming its file, place and name.
   */
  function environmentProblems(file: string, parsed: unknown, rows: readonly BoundedValue[] = BOUNDED_VALUES): string[] {
    const problems: string[] = [];
    const record = (value: unknown): Readonly<Record<string, unknown>> => (isRecord(value) ? value : {});
    const root = record(parsed);
    const jobs = record(root.jobs);
    const inputs = new Map<string, number>();
    for (const trigger of ['workflow_dispatch', 'workflow_call']) {
      for (const [name, declaration] of Object.entries(record(record(record(root.on)[trigger]).inputs))) {
        const { type, options } = record(declaration);
        const bytes = type === 'boolean' ? BOOLEAN_BYTES : type === 'number' ? NUMBER_BYTES : type === 'choice' && isList(options) ? Math.max(0, ...options.map((option) => Buffer.byteLength(String(option)))) : Infinity;
        inputs.set(name.toLowerCase(), Math.max(inputs.get(name.toLowerCase()) ?? 0, bytes));
      }
    }
    const row = (job: string | undefined, value: string, at: Reading): number => {
      const found = rows.find((entry) => entry.file === file && entry.job === job && entry.value === value);
      if (found === undefined) {
        at.unbounded.push(`${value}, which no row of the table bounds`);
        return Infinity;
      }
      return found.bytes;
    };
    /** The value an admitted expression reads, as the table keys it, when it reads exactly one. */
    const readValue = (node: Expression): string | undefined => {
      const values: string[] = [];
      return expressionProblems(node, {}, values).length === 0 && values.length === 1 ? values[0]?.toLowerCase() : undefined;
    };
    const scalar = (value: unknown, at: Reading): number => {
      if (typeof value === 'number' || typeof value === 'boolean') return Buffer.byteLength(String(value));
      if (typeof value !== 'string') {
        if (value !== null && value !== undefined) at.unbounded.push('a list or a mapping');
        return value === null || value === undefined ? 0 : Infinity;
      }
      let bytes = Buffer.byteLength(value.replace(/\$\{\{[\s\S]*?\}\}/g, ''));
      for (const match of value.matchAll(/\$\{\{([\s\S]*?)\}\}/g)) {
        try {
          bytes += expression(parseExpression(lexExpression(match[1] ?? '')), at);
        } catch {
          at.unbounded.push(`\${{${match[1] ?? ''}}}, which does not parse`);
          bytes = Infinity;
        }
      }
      return bytes;
    };
    const matrix = (key: string, at: Reading): number => {
      const strategy = record(record(jobs[at.job ?? '']).strategy);
      const given = strategy.matrix;
      // A matrix from an expression, or a key's list from one: each value is part of what it gives, and so is each
      // include entry's value for the key (GitHub makes an entry that would change it a job of its own), or the whole
      // include where an expression gives it.
      const include = isRecord(given) ? given.include : undefined;
      const beside = include === undefined ? [] : isList(include) ? include.map((entry) => (isRecord(entry) ? entry[key] : entry)) : [include];
      const values = typeof given === 'string' ? [given] : (matrixValues(given, key) ?? (isRecord(given) && typeof given[key] === 'string' ? [given[key], ...beside] : undefined));
      if (values === undefined) {
        at.unbounded.push(`matrix.${key}, which job ${at.job ?? '-'}'s matrix does not give`);
        return Infinity;
      }
      // A matrix is read with no env context.
      const job = { ...at, scopes: [] };
      return Math.max(
        0,
        ...values.map((value) => {
          if (!isRecord(value) && !isList(value)) return scalar(value, job);
          at.unbounded.push(`matrix.${key}, a list or a mapping`);
          return Infinity;
        }),
      );
    };
    const env = (name: string, at: Reading): number => {
      if (Object.hasOwn(GITHUB_ENV_WRITES, name.toUpperCase())) {
        at.unbounded.push(`env.${name}, which a script writes to $GITHUB_ENV`);
        return Infinity;
      }
      // The most of any env in scope that sets it (a step's own, its job's, the workflow's), so never less than what GitHub
      // reads there: a step's env reads its job's (the job's over the workflow's), and GitHub's schema gives a job's or
      // the workflow's env no env context at all, so an env.X there is a parse error, which this still bounds.
      const set = at.scopes.flatMap((scope, index) =>
        Object.entries(scope)
          .filter(([key]) => key.toLowerCase() === name)
          .map(([, value]) => scalar(value, { ...at, scopes: at.scopes.slice(index + 1) })),
      );
      if (set.length === 0) {
        at.unbounded.push(`env.${name}, which no env in scope sets`);
        return Infinity;
      }
      return Math.max(...set);
    };
    const reference = (names: readonly string[] | undefined, at: Reading): number => {
      const [base = '', ...rest] = names ?? [];
      const [first = '', second] = rest;
      const dotted = (names ?? []).join('.');
      let bytes: number | undefined;
      if (base === 'github') bytes = BOUNDED_GITHUB.get(rest.join('.'));
      else if (base === 'vars' || base === 'secrets') bytes = rest.length === 1 ? VARIABLE_BYTES : undefined;
      else if (base === 'runner') bytes = rest.length === 1 ? RUNNER_BYTES : undefined;
      else if (base === 'strategy') bytes = rest.length === 1 ? INTEGER_BYTES : undefined;
      else if (base === 'job') bytes = rest.length === 1 ? JOB_BYTES[first] : undefined;
      else if (base === 'inputs') bytes = rest.length === 1 ? inputs.get(first) : undefined;
      else if (base === 'matrix' && rest.length === 1) return matrix(first, at);
      else if (base === 'env' && rest.length === 1) return env(first, at);
      else if ((base === 'needs' && rest.length === 2 && second === 'result') || (base === 'steps' && rest.length === 2 && (second === 'outcome' || second === 'conclusion'))) bytes = WORD_BYTES;
      else if ((base === 'steps' || base === 'needs') && rest.length === 3 && second === 'outputs') return row(at.job, dotted.toLowerCase(), at);
      if (bytes === undefined || bytes === Infinity) {
        at.unbounded.push(names === undefined ? 'a wildcard or a computed index' : dotted);
        return Infinity;
      }
      return bytes;
    };
    const expression = (node: Expression, at: Reading): number => {
      switch (node.t) {
        case 'literal':
          return node.kind === 'string' ? Buffer.byteLength(node.value) : node.kind === 'number' ? NUMBER_BYTES : node.value === 'null' ? 0 : node.value.length;
        case 'not':
          return BOOLEAN_BYTES;
        case 'binary':
          // && and || give one of their operands, a comparison true or false; but parseExpression folds operators left to
          // right, not by precedence, so an operand this tree puts under a comparison may be what an || gives: each counts.
          return Math.max(BOOLEAN_BYTES, expression(node.left, at), expression(node.right, at));
        case 'reference':
          return reference([node.name], at);
        case 'access': {
          if (node.target.t !== 'call') return reference(namesOf(node), at);
          const value = readValue(node);
          if (value?.startsWith('fromjson(') === true) return row(at.job, value, at);
          // fromJSON of an admitted value, then literal keys: no longer than the value's text, or than a number written out.
          if (node.target.name === 'fromjson' && node.path.every((access) => 'name' in access)) return Math.max(expression(node.target, at), NUMBER_BYTES);
          at.unbounded.push(`an index on ${node.target.name}()`);
          return Infinity;
        }
        case 'call': {
          if (['success', 'failure', 'always', 'cancelled', 'contains', 'startswith', 'endswith'].includes(node.name)) return BOOLEAN_BYTES;
          if (node.name === 'hashfiles') return 64;
          if (node.name === 'tojson') {
            const value = readValue(node);
            if (value !== undefined) return row(at.job, value, at);
          }
          if (node.name === 'fromjson' && node.args.length === 1 && node.args[0] !== undefined) return Math.max(expression(node.args[0], at), NUMBER_BYTES);
          at.unbounded.push(`${node.name}()`);
          return Infinity;
        }
      }
    };
    /** Each string of a mapping, refused over the limit or unbounded; their bytes together, for the totals below (Infinity where one is already refused). */
    const strings = (mapping: unknown, where: string, at: Omit<Reading, 'unbounded'>, input = false): number => {
      // GitHub takes one expression in place of a mapping wherever the mapping takes a context (its schema's step env
      // and with, job and workflow env, a container and its env): its names and strings come from the value at run
      // time, so neither this sum nor the key rule could read them.
      if (typeof mapping === 'string' && mapping.includes('${{')) {
        problems.push(`${file} ${where}: a mapping from an expression, whose names and strings no sum can read`);
        return Infinity;
      }
      let total = 0;
      for (const [name, value] of Object.entries(record(mapping))) {
        const reading: Reading = { ...at, unbounded: [] };
        const variable = input ? `INPUT_${name.replace(/ /g, '_').toUpperCase()}` : name;
        const bytes = Buffer.byteLength(`${variable}=`) + scalar(value, reading) + 1;
        total += bytes;
        if (reading.unbounded.length > 0) problems.push(`${file} ${where}.${name}: no bound for ${reading.unbounded.join('; ')}`);
        else if (bytes > MAX_ARG_STRLEN) problems.push(`${file} ${where}.${name}: ${variable}=… is up to ${String(bytes)} bytes with its NUL, over ${String(MAX_ARG_STRLEN)}`);
      }
      return total;
    };
    /** One argument the runner hands a process (an image, a container's options, a shell), held to the same 131,072 bytes. */
    const argument = (value: unknown, where: string, at: Omit<Reading, 'unbounded'>): number => {
      if (value === undefined || value === null) return 0;
      const reading: Reading = { ...at, unbounded: [] };
      const bytes = scalar(value, reading) + 1;
      if (reading.unbounded.length > 0) problems.push(`${file} ${where}: no bound for ${reading.unbounded.join('; ')}`);
      else if (bytes > MAX_ARG_STRLEN) problems.push(`${file} ${where}: an argument of up to ${String(bytes)} bytes with its NUL, over ${String(MAX_ARG_STRLEN)}`);
      return bytes;
    };
    /** A process's environment and arguments together, under ARG_MAX less what the runner adds. */
    const total = (bytes: number, where: string): void => {
      if (Number.isFinite(bytes) && bytes > ARG_MAX - RUNNER_MARGIN) problems.push(`${file} ${where}: its environment and arguments are up to ${String(bytes)} bytes, over ${String(ARG_MAX - RUNNER_MARGIN)} (ARG_MAX, less ${String(RUNNER_MARGIN)} for the runner's own)`);
    };
    const shellOf = (defaults: unknown): unknown => record(record(defaults).run).shell;
    const workflowEnv = strings(root.env, 'env', { job: undefined, scopes: [] });
    const workflowShell = argument(shellOf(root.defaults), 'defaults.run.shell', { job: undefined, scopes: [record(root.env)] });
    for (const [id, job] of Object.entries(jobs)) {
      if (!isRecord(job)) continue;
      const jobEnv = strings(job.env, `job ${id} env`, { job: id, scopes: [record(root.env)] });
      const jobShell = shellOf(job.defaults) === undefined ? workflowShell : argument(shellOf(job.defaults), `job ${id} defaults.run.shell`, { job: id, scopes: [record(job.env), record(root.env)] });
      // A container or a service: its env, and each other value an argument of docker's (an image, options, an
      // entrypoint, a command, a volume, a port, credentials). One named by a string is its image, an expression in it
      // read as any other (node:${{ matrix.node }}); one given as one expression alone may be a mapping, so it is
      // refused, its strings unread.
      const container = (definition: unknown, where: string): void => {
        const at = { job: id, scopes: [] };
        if (typeof definition === 'string') {
          if (/^\$\{\{(?:(?!\}\})[\s\S])*\}\}$/.test(definition)) strings(definition, where, at);
          else argument(definition, `${where} image`, at);
          return;
        }
        let bytes = strings(record(definition).env, `${where}.env`, at);
        for (const [key, value] of Object.entries(record(definition))) {
          if (key === 'env') continue;
          const items: [string, unknown][] = isList(value) ? value.map((item, index) => [`${key}[${String(index)}]`, item]) : isRecord(value) ? Object.entries(value).map(([name, item]) => [`${key}.${name}`, item]) : [[key, value]];
          for (const [name, item] of items) bytes += argument(item, `${where}.${name}`, at);
        }
        total(bytes, where);
      };
      if (job.container !== undefined) container(job.container, `job ${id} container`);
      // A value a job passes a called workflow as a secret: that workflow's own sum bounds secrets.<name> at a secret's
      // 48 KB, so the value is held to it where it is made (three secrets joined in one are refused here). `inherit`
      // passes each secret as it is.
      if (job.secrets !== 'inherit') strings(typeof job.secrets === 'string' ? job.secrets : {}, `job ${id} secrets`, { job: id, scopes: [] });
      for (const [name, value] of Object.entries(record(job.secrets))) {
        const reading: Reading = { job: id, scopes: [], unbounded: [] };
        const bytes = scalar(value, reading);
        if (reading.unbounded.length > 0) problems.push(`${file} job ${id} secrets.${name}: no bound for ${reading.unbounded.join('; ')}`);
        else if (bytes > VARIABLE_BYTES) problems.push(`${file} job ${id} secrets.${name}: up to ${String(bytes)} bytes, over the ${String(VARIABLE_BYTES)} a called workflow bounds secrets.${name} at`);
      }
      if (typeof job.services === 'string') strings(job.services, `job ${id} services`, { job: id, scopes: [] });
      for (const [service, definition] of Object.entries(record(job.services))) container(definition, `job ${id} services.${service}`);
      (isList(job.steps) ? job.steps : []).forEach((step, index) => {
        if (!isRecord(step)) return;
        const named = `job ${id} step ${typeof step.name === 'string' ? JSON.stringify(step.name) : String(index)}`;
        const scopes = [record(step.env), record(job.env), record(root.env)];
        const stepEnv = strings(step.env, `${named} env`, { job: id, scopes });
        const inputs = strings(step.with, `${named} with`, { job: id, scopes }, true);
        const shell = step.shell === undefined ? (step.run === undefined ? 0 : jobShell) : argument(step.shell, `${named} shell`, { job: id, scopes });
        // Every string the step's process is given from the workflow: the workflow's, the job's and its own env, its
        // inputs, and its shell (a name set twice counted twice, more than the runner passes).
        total(workflowEnv + jobEnv + stepEnv + inputs + shell, named);
      });
    }
    return problems;
  }

  it('admits into a step’s environment, an input or a script only values GitHub, the workflow or the table bounds, read as the runner reads an expression, in every workflow', () => {
    expect(workflowFiles().flatMap((file) => unboundedValueProblems(file, workflow(file)).problems)).toEqual([]);
    // Each $GITHUB_ENV write of the map is made where it says, exactly once, and the test that holds its bound runs it.
    const titles = testTitles('tools/test/workflows.test.ts', repositorySource('tools/test/workflows.test.ts') ?? '');
    for (const [name, write] of [...Object.entries(GITHUB_ENV_WRITES), ...Object.entries(GITHUB_PATH_WRITES)]) {
      expect(write.sites.length, name).toBeGreaterThan(0);
      for (const site of write.sites) {
        const named = (workflow(site.file).jobs[site.job]?.steps ?? []).filter((step) => step.name === site.step);
        const lines = named.flatMap((step) => (step.run ?? '').split('\n'));
        expect(lines.filter((line) => line.trim() === write.line), `${name} in ${site.file} ${site.job}`).toHaveLength(1);
        expect(
          named.map((step) => fingerprint(step, workflow(site.file).jobs[site.job], workflow(site.file))),
          `${name} in ${site.file} ${site.job}: the step that writes it has changed (its script, or its env, shell, working-directory or container, its own or inherited): re-read the bound against it, then write the new fingerprint in the map`,
        ).toEqual([site.fingerprint]);
      }
      expect(titles.has(write.test), `${name}: no test named "${write.test}" that always runs`).toBe(true);
    }
    // A file a step runs (a script, a package's script, tool code) could write $GITHUB_ENV or $GITHUB_PATH, or the
    // runner's file command files, that no workflow line shows, so every tracked file but a workflow (which the rule
    // above reads) naming any of them, in any case, is one of this closed list, each with why it sets nothing. A name
    // built at run time, and a dependency's or a pinned action's own code, are not read.
    const NAMES_FILE_COMMANDS: Readonly<Record<string, string>> = {
      'docs/adr/0066-run-ci-as-parallel-jobs-behind-one-gate-measure-mutation-on-every-money-package-move-the-browser-and-runner-together-and-pin-every-dependency.md': 'the decision that states this rule; no step runs it',
      'docs/runbooks/ci.md': 'the runbook that states this rule; no step runs it',
      'tools/engine-freeze/check.test.ts': "reads ci.yml's one $GITHUB_ENV write as text and writes none",
      'tools/test/workflows.test.ts': "this rule; it runs that write's step with $GITHUB_ENV a file of its own temporary directory",
    };
    const naming = execFileSync('git', ['grep', '-lIi', '-e', 'GITHUB_ENV', '-e', 'GITHUB_PATH', '-e', '_runner_file_commands', '-e', 'set_env_', '-e', 'add_path_', '--', '.', ':!.github/workflows'], { cwd: repositoryRoot, encoding: 'utf8' })
      .split('\n')
      .filter((line) => line !== '');
    expect(naming.sort()).toEqual(Object.keys(NAMES_FILE_COMMANDS).sort());
  });

  it('keeps every environment string a workflow sets at 131,072 bytes at most, NAME=value and its NUL, summed from its name, its literal bytes and each value’s bound', () => {
    expect(workflowFiles().flatMap((file) => environmentProblems(file, workflow(file)))).toEqual([]);
    const huge: BoundedValue = { file: 'fixture.yml', job: 'images', value: 'steps.web.outputs.size', bytes: 100_000, refs: [], bound: 'a fixture' };
    const sum = (jobs: string, rows: readonly BoundedValue[] = [huge]) =>
      environmentProblems('fixture.yml', parse(`name: fixture\non:\n  workflow_dispatch:\n    inputs:\n      runner: { type: choice, options: [ubuntu-24.04, ubuntu-26.04] }\n      note: { type: string }\n${jobs}\n`), rows);
    const step = (env: string, more = '') => `jobs:\n  images:\n    runs-on: ubuntu-26.04\n${more}    steps:\n      - name: The step\n        ${env}\n        run: echo`;
    const over = (where: string, variable: string, bytes: number) => `fixture.yml job images step "The step" ${where}: ${variable}=… is up to ${String(bytes)} bytes with its NUL, over 131072`;
    // Three repository variables, or secrets, in one value: each admitted, together up to 147,456 bytes. Two fit.
    expect(sum(step('env: { NOTES: "${{ vars.A }}${{ vars.B }}${{ vars.C }}" }'))).toEqual([over('env.NOTES', 'NOTES', 6 + 3 * 49_152 + 1)]);
    expect(sum(step('env: { NOTES: "${{ secrets.A }}-${{ secrets.B }}-${{ vars.C }}" }'))).toEqual([over('env.NOTES', 'NOTES', 6 + 3 * 49_152 + 2 + 1)]);
    expect(sum(step('env: { NOTES: "${{ vars.A }}${{ vars.B }}" }'))).toEqual([]);
    // An input is INPUT_ and its name in capitals; a table row adds its bytes.
    expect(sum(step('uses: actions/fixture@v1\n        with: { notes: "${{ steps.web.outputs.size }}${{ vars.A }}" }'))).toEqual([over('with.notes', 'INPUT_NOTES', 12 + 100_000 + 49_152 + 1)]);
    // env.X is the bound of X where it is set, the step's env, the job's or the workflow's, each read as GitHub reads it.
    expect(sum(step('env: { B: "${{ env.A }}${{ vars.C }}" }', '    env: { A: "${{ vars.A }}${{ vars.B }}" }\n'))).toEqual([over('env.B', 'B', 2 + 3 * 49_152 + 1)]);
    expect(sum(`env: { X: "\${{ vars.X }}" }\n${step('env: { Z: "${{ env.Y }}${{ vars.Z }}" }', '    env: { Y: "${{ env.X }}${{ env.X }}" }\n')}`)).toEqual([over('env.Z', 'Z', 2 + 3 * 49_152 + 1)]);
    expect(sum(step('uses: actions/fixture@v1\n        env: { A: "${{ vars.A }}${{ vars.B }}" }\n        with: { notes: "${{ env.A }}${{ vars.C }}" }'))).toEqual([over('with.notes', 'INPUT_NOTES', 12 + 3 * 49_152 + 1)]);
    expect(sum(step('env: { B: "${{ env.MISSING }}" }'))).toEqual(['fixture.yml job images step "The step" env.B: no bound for env.missing, which no env in scope sets']);
    expect(sum(step('env: { B: "${{ env.ENGINE_FREEZE_BASE }}" }', '    env: { ENGINE_FREEZE_BASE: x }\n'))).toEqual(['fixture.yml job images step "The step" env.B: no bound for env.engine_freeze_base, which a script writes to $GITHUB_ENV']);
    // The limit's own count: the name, = and the NUL with the value make 131,072 bytes at most.
    const fits = 'x'.repeat(131_072 - 'VALUE='.length - 1);
    expect(sum(step(`env: { VALUE: "${fits}" }`))).toEqual([]);
    expect(sum(step(`env: { VALUE: "${fits}x" }`))).toEqual([over('env.VALUE', 'VALUE', 131_073)]);
    // A matrix key is its longest value; a value no row bounds, a string input and an unknown function have no bound.
    expect(sum(step('env: { M: "${{ matrix.note }}${{ vars.A }}${{ vars.B }}" }', `    strategy: { matrix: { note: [a, ${'y'.repeat(40_000)}] } }\n`))).toEqual([over('env.M', 'M', 2 + 40_000 + 2 * 49_152 + 1)]);
    expect(sum(step('env: { S: "${{ steps.web.outputs.size }}" }'), [])).toEqual(['fixture.yml job images step "The step" env.S: no bound for steps.web.outputs.size, which no row of the table bounds']);
    expect(sum(step('env: { S: "${{ inputs.note }}" }'))).toEqual(['fixture.yml job images step "The step" env.S: no bound for inputs.note']);
    expect(sum(step("env: { S: \"${{ format('{0}', vars.A) }}\" }"))).toEqual(['fixture.yml job images step "The step" env.S: no bound for format()']);
    // A comparison's operand counts too (the parser does not read precedence), and a choice input is its longest option.
    expect(sum(step('env: { S: "${{ vars.A || vars.B == vars.C }}${{ vars.D }}${{ vars.E }}" }'))).toEqual([over('env.S', 'S', 2 + 3 * 49_152 + 1)]);
    expect(sum(step('env: { S: "${{ inputs.runner }}" }'))).toEqual([]);
    // Each level's own strings are summed: the workflow's env, a job's, its container's and each service's.
    const three = '"${{ vars.A }}${{ vars.B }}${{ vars.C }}"';
    const notes = (where: string) => `fixture.yml ${where}.NOTES: NOTES=… is up to ${String(6 + 3 * 49_152 + 1)} bytes with its NUL, over 131072`;
    expect(sum(`env: { NOTES: ${three} }\n${step('env: { E: x }')}`)).toEqual([notes('env')]);
    expect(sum(step('env: { E: x }', `    env: { NOTES: ${three} }\n`))).toEqual([notes('job images env')]);
    expect(sum(step('env: { E: x }', `    container: { image: x, env: { NOTES: ${three} } }\n`))).toEqual([notes('job images container.env')]);
    expect(sum(step('env: { E: x }', `    services:\n      db: { image: x, env: { NOTES: ${three} } }\n`))).toEqual([notes('job images services.db.env')]);
    // One argument the runner hands a process is held to the same limit: a container's or a service's options, image,
    // entrypoint or command, a job's or the workflow's default shell, a step's shell.
    const argumentOver = (where: string, bytes: number) => `fixture.yml ${where}: an argument of up to ${String(bytes)} bytes with its NUL, over 131072`;
    const vars3 = '${{ vars.A }}${{ vars.B }}${{ vars.C }}';
    expect(sum(step('env: { E: x }', `    container: { image: x, options: "--label=${vars3}" }\n`))).toEqual([argumentOver('job images container.options', '--label='.length + 3 * 49_152 + 1)]);
    expect(sum(step('env: { E: x }', `    services: { db: { image: x, entrypoint: "${vars3}" } }\n`))).toEqual([argumentOver('job images services.db.entrypoint', 3 * 49_152 + 1)]);
    expect(sum(step('env: { E: x }', `    services: { db: { image: "${vars3}" } }\n`))).toEqual([argumentOver('job images services.db.image', 3 * 49_152 + 1)]);
    expect(sum(step('env: { E: x }', `    defaults: { run: { shell: "bash -c '${vars3}' {0}" } }\n`))).toEqual([argumentOver('job images defaults.run.shell', "bash -c '' {0}".length + 3 * 49_152 + 1)]);
    expect(sum(`defaults: { run: { shell: "${vars3}" } }\n${step('env: { E: x }')}`)).toEqual([argumentOver('defaults.run.shell', 3 * 49_152 + 1)]);
    expect(sum(step(`shell: "${vars3}"\n        env: { E: x }`))).toEqual([argumentOver('job images step "The step" shell', 3 * 49_152 + 1)]);
    // An argument's own count: its bytes and the NUL make 131,072 at most.
    const argumentFits = 'x'.repeat(131_072 - 1);
    expect(sum(step(`shell: "${argumentFits}"\n        env: { E: x }`))).toEqual([]);
    expect(sum(step(`shell: "${argumentFits}x"\n        env: { E: x }`))).toEqual([argumentOver('job images step "The step" shell', 131_073)]);
    expect(sum(step('env: { E: x }', `    container: { image: x, options: "\${{ inputs.note }}" }\n`))).toEqual(['fixture.yml job images container.options: no bound for inputs.note']);
    // And a process's environment and arguments together are held under ARG_MAX, less the runner's own: fifty
    // variables of 48 KB, each one string under the limit, are 2,457,840 bytes.
    const many = (count: number) => Array.from({ length: count }, (_, index) => `V${String(index)}: "\${{ vars.A${String(index)} }}"`).join(', ');
    const allOf = (count: number) => Array.from({ length: count }, (_, index) => `V${String(index)}=`.length + 49_152 + 1).reduce((all, bytes) => all + bytes, 0);
    const totalOver = (where: string, bytes: number) => `fixture.yml ${where}: its environment and arguments are up to ${String(bytes)} bytes, over 1835008 (ARG_MAX, less 262144 for the runner's own)`;
    expect(sum(step(`env: { ${many(50)} }`))).toEqual([totalOver('job images step "The step"', allOf(50))]);
    expect(sum(step(`env: { ${many(30)} }`))).toEqual([]);
    expect(sum(step('env: { E: x }', `    container: { image: x, env: { ${many(40)} } }\n`))).toEqual([totalOver('job images container', allOf(40) + 'x'.length + 1)]);
    // A key's list from an expression, with include entries beside it: each entry's value counts, and an include from
    // an expression its whole bound. The key's expression alone fits.
    const keyed = (include: string, env = 'env: { M: "${{ matrix.note }}${{ vars.A }}" }') => step(env, `    strategy: { matrix: { note: "\${{ fromJSON(steps.web.outputs.size) }}"${include} } }\n`);
    const tiny = [{ ...huge, bytes: 10 }, { ...huge, value: 'steps.web.outputs.whole' }];
    expect(sum(keyed(''), tiny)).toEqual([]);
    expect(sum(keyed(`, include: [ { note: "${'y'.repeat(90_000)}" } ]`), tiny)).toEqual([over('env.M', 'M', 2 + 90_000 + 49_152 + 1)]);
    expect(sum(keyed(', include: [ { note: "${{ vars.A }}${{ vars.B }}${{ vars.C }}" } ]', 'env: { M: "${{ matrix.note }}" }'), tiny)).toEqual([over('env.M', 'M', 2 + 3 * 49_152 + 1)]);
    expect(sum(keyed(', include: "${{ fromJSON(steps.web.outputs.whole) }}"'), tiny)).toEqual([over('env.M', 'M', 2 + 100_000 + 49_152 + 1)]);
    expect(sum(keyed(', include: [ "${{ fromJSON(steps.web.outputs.whole) }}" ]'), tiny), 'an include entry from an expression').toEqual([over('env.M', 'M', 2 + 100_000 + 49_152 + 1)]);
    expect(sum(keyed(', include: [ { other: x }, { note: short } ]'), tiny)).toEqual([]);
    // And beside a key's list, as matrixValues reads one: an include entry's value counts there too.
    expect(sum(step('env: { M: "${{ matrix.note }}${{ vars.A }}" }', `    strategy: { matrix: { note: [a], include: [ { note: "${'y'.repeat(90_000)}" } ] } }\n`))).toEqual([over('env.M', 'M', 2 + 90_000 + 49_152 + 1)]);
    // Each part of an expression at its own bound: fromJSON's value and an access on it, the right of && or ||, and
    // bytes counted as UTF-8, not as UTF-16 units, outside an expression and in its string literals.
    expect(sum(step('env: { S: "${{ fromJSON(vars.A) }}${{ vars.B }}${{ vars.C }}" }')), 'fromJSON(x)').toEqual([over('env.S', 'S', 2 + 3 * 49_152 + 1)]);
    expect(sum(step('env: { S: "${{ fromJSON(vars.A).x }}${{ vars.B }}${{ vars.C }}" }')), 'fromJSON(x).y').toEqual([over('env.S', 'S', 2 + 3 * 49_152 + 1)]);
    expect(sum(step('env: { S: "${{ true && vars.A }}${{ vars.B }}${{ vars.C }}" }')), 'the right of &&').toEqual([over('env.S', 'S', 2 + 3 * 49_152 + 1)]);
    expect(sum(step(`env: { VALUE: "${'é'.repeat(65_533)}" }`)), 'a literal in UTF-8').toEqual([over('env.VALUE', 'VALUE', 6 + 2 * 65_533 + 1)]);
    expect(sum(step(`env: { S: "\${{ '${'é'.repeat(65_535)}' }}" }`)), 'a string literal in UTF-8').toEqual([over('env.S', 'S', 2 + 2 * 65_535 + 1)]);
    // The token is held as a secret is, 48 KB.
    expect(sum(step('env: { NOTES: "${{ github.token }}${{ secrets.A }}${{ vars.B }}" }'))).toEqual([over('env.NOTES', 'NOTES', 6 + 3 * 49_152 + 1)]);
    // A mapping given as one expression, wherever GitHub accepts one, names its own strings: refused, where a container
    // or a service named by an image alone sets none.
    const mapping = '"${{ fromJSON(steps.web.outputs.size) }}"';
    const fromExpression = (where: string) => `fixture.yml ${where}: a mapping from an expression, whose names and strings no sum can read`;
    expect(sum(step(`env: ${mapping}`))).toEqual([fromExpression('job images step "The step" env')]);
    expect(sum(step(`uses: actions/fixture@v1\n        with: ${mapping}`))).toEqual([fromExpression('job images step "The step" with')]);
    expect(sum(step('env: { E: x }', `    env: ${mapping}\n`))).toEqual([fromExpression('job images env')]);
    expect(sum(`env: "\${{ fromJSON(vars.A) }}"\n${step('env: { E: x }')}`)).toEqual([fromExpression('env')]);
    expect(sum(step('env: { E: x }', `    container: ${mapping}\n`))).toEqual([fromExpression('job images container')]);
    expect(sum(step('env: { E: x }', `    container: { image: x, env: ${mapping} }\n`))).toEqual([fromExpression('job images container.env')]);
    expect(sum(step('env: { E: x }', `    services: ${mapping}\n`))).toEqual([fromExpression('job images services')]);
    expect(sum(step('env: { E: x }', `    services: { db: ${mapping} }\n`))).toEqual([fromExpression('job images services.db')]);
    expect(sum(step('env: { E: x }', `    services: { db: { image: x, env: ${mapping} } }\n`))).toEqual([fromExpression('job images services.db.env')]);
    expect(sum(step('env: { E: x }', '    container: node:24\n    services: { db: postgres:18 }\n'))).toEqual([]);
    // A container or a service named by a string with an expression in it is its image, an argument held to the limit.
    expect(sum(step('env: { E: x }', '    strategy: { matrix: { node: [22, 24] } }\n    container: "node:${{ matrix.node }}"\n    services: { db: "postgres:${{ matrix.node }}" }\n'))).toEqual([]);
    // One that starts with an expression and goes on is an image too, not a mapping.
    expect(sum(step('env: { E: x }', '    strategy: { matrix: { node: [22, 24] } }\n    container: "${{ matrix.node }}-slim"\n    services: { db: "${{ matrix.node }}-postgres" }\n'))).toEqual([]);
    expect(sum(step('env: { E: x }', `    container: "node:${vars3}"\n`))).toEqual([argumentOver('job images container image', 'node:'.length + 3 * 49_152 + 1)]);
    expect(sum(step('env: { E: x }', `    services: { db: "postgres:${vars3}" }\n`))).toEqual([argumentOver('job images services.db image', 'postgres:'.length + 3 * 49_152 + 1)]);
    // A value a job passes a called workflow as a secret is held to a secret's 48 KB, the bound that workflow's own sum
    // gives secrets.<name>: one secret passes; two joined, under an environment string's 131,072 bytes but over a
    // secret's, and three are refused.
    const call = (secrets: string) => sum(`jobs:\n  images:\n    uses: ./.github/workflows/called.yml\n    secrets: ${secrets}\n`);
    expect(call('{ TOKEN: "${{ secrets.A }}" }')).toEqual([]);
    expect(call('inherit')).toEqual([]);
    expect(call('{ TOKEN: "${{ secrets.A }}${{ secrets.B }}" }')).toEqual([`fixture.yml job images secrets.TOKEN: up to ${String(2 * 49_152)} bytes, over the 49152 a called workflow bounds secrets.TOKEN at`]);
    expect(call('{ TOKEN: "${{ secrets.A }}${{ secrets.B }}${{ secrets.C }}" }')).toEqual([`fixture.yml job images secrets.TOKEN: up to ${String(3 * 49_152)} bytes, over the 49152 a called workflow bounds secrets.TOKEN at`]);
    expect(call('{ TOKEN: "${{ inputs.note }}" }')).toEqual(['fixture.yml job images secrets.TOKEN: no bound for inputs.note']);
    expect(call('"${{ fromJSON(vars.A) }}"')).toEqual([fromExpression('job images secrets')]);
  });

  it('refuses each route a value could take whole', () => {
    const fixture = (expression: string) =>
      unboundedValueProblems(
        'fixture.yml',
        parse(
          `name: fixture\non:\n  workflow_dispatch:\n    inputs:\n      runner: { type: choice, options: [ubuntu-24.04, ubuntu-26.04] }\n      note: { type: string }\njobs:\n  images:\n    runs-on: ubuntu-26.04\n    steps:\n      - name: The step\n        env:\n          VALUE: "\${{ ${expression} }}"\n        run: echo "$VALUE"\n`,
        ),
      );
    const refused = [
      'steps.web.outputs.metadata',
      'steps.web.outputs.METADATA',
      'steps.*.outputs.metadata',
      'toJSON(github)',
      'toJSON(github.event)',
      'ToJson(GitHub.Event)',
      'toJSON (github.event)',
      'toJSON(steps)',
      'github.event',
      'github.event.pull_request.body',
      'github . event . pull_request . body',
      "github.event.pull_request['body']",
      'github.event.pull_request.title',
      'github.event.head_commit.message',
      "github['event']",
      "github['event']['pull_request']['body']",
      "join(steps.web.outputs.*, '')",
      "steps.web.outputs[format('meta{0}', 'data')]",
      "fromJSON(steps.web.outputs.metadata || '{}')['buildx.build.provenance']",
      // The hand-over's form: fromJSON('') of a build's empty output fails a step its if: would skip.
      "fromJSON(steps.web.outputs.metadata)['containerimage.config.digest']",
      "toJSON(fromJSON(steps.web.outputs.metadata || '{}'))",
      "format('{0}', github.event.pull_request.body)",
      'inputs.note',
      'toJSON(needs.build)',
      'toJSON(needs.build.outputs.digest)',
      'toJSON(needs.build.result)',
      'needs.build.outputs[github.ref]',
    ];
    for (const expression of refused) {
      expect(fixture(expression).problems, expression).toEqual([expect.stringMatching(/^fixture\.yml job images step "The step" env\.VALUE: .+, in \$\{\{ .+ \}\}$/)]);
    }
    const accepted: readonly (readonly [string, readonly string[]])[] = [
      ["fromJSON(steps.web.outputs.metadata || '{}')['containerimage.config.digest']", ["fromjson(steps.web.outputs.metadata || '{}')['containerimage.config.digest']"]],
      ["FromJSON( steps.web.outputs.metadata || '{}' )[ 'containerimage.config.digest' ]", ["fromjson(steps.web.outputs.metadata || '{}')['containerimage.config.digest']"]],
      ['github.event.pull_request.number', []],
      ["github['sha']", []],
      ['toJSON(needs)', ['tojson(needs)']],
      ['toJSON(needs.build.outputs)', ['tojson(needs.build.outputs)']],
      ['runner.temp', []],
      ["hashFiles('pnpm-lock.yaml')", []],
      ['inputs.runner', []],
    ];
    for (const [expression, values] of accepted) {
      expect(fixture(expression), expression).toEqual({ problems: [], values: values.map((value) => ({ file: 'fixture.yml', job: 'images', value, where: 'job images step "The step" env.VALUE', step: 0 })) });
    }

    // The whole metadata is refused in every place a value reaches a process.
    const whole = '"${{ steps.web.outputs.metadata }}"';
    const places: (readonly [string, string])[] = [
      [`env: { VALUE: ${whole} }\njobs: { images: { runs-on: ubuntu-26.04, steps: [] } }`, 'env.VALUE'],
      [`jobs: { images: { runs-on: ubuntu-26.04, env: { VALUE: ${whole} }, steps: [] } }`, 'job images env.VALUE'],
      [`jobs: { images: { runs-on: ubuntu-26.04, outputs: { value: ${whole} }, steps: [] } }`, 'job images outputs.value'],
      [`jobs: { images: { runs-on: ubuntu-26.04, strategy: { matrix: { value: [${whole}] } }, steps: [] } }`, 'job images strategy.matrix.value[0]'],
      [`jobs: { images: { runs-on: ubuntu-26.04, container: { image: 'node:24', env: { VALUE: ${whole} } }, steps: [] } }`, 'job images container.env.VALUE'],
      [`jobs: { images: { runs-on: ubuntu-26.04, services: { db: { image: 'postgres:18', env: { VALUE: ${whole} } } }, steps: [] } }`, 'job images services.db.env.VALUE'],
      [`jobs: { images: { uses: ./.github/workflows/fixture.yml, with: { value: ${whole} } } }`, 'job images with.value'],
      [`jobs: { images: { uses: ./.github/workflows/fixture.yml, secrets: { value: ${whole} } } }`, 'job images secrets.value'],
      [`jobs: { images: { runs-on: ubuntu-26.04, steps: [{ name: The step, uses: actions/fixture@v1, with: { value: ${whole} } }] } }`, 'job images step "The step" with.value'],
      [`jobs: { images: { runs-on: ubuntu-26.04, steps: [{ name: The step, run: ${whole} }] } }`, 'job images step "The step" run'],
      [`jobs: { images: { runs-on: ubuntu-26.04, defaults: { run: { shell: ${whole} } }, steps: [] } }`, 'job images defaults.run.shell'],
      [`jobs: { images: { runs-on: ubuntu-26.04, steps: [{ name: The step, run: echo, working-directory: ${whole} }] } }`, 'job images step "The step" working-directory'],
    ];
    for (const [jobs, where] of places) {
      expect(unboundedValueProblems('fixture.yml', parse(`name: fixture\non: push\n${jobs}\n`)).problems, where).toEqual([`fixture.yml ${where}: steps.web.outputs.metadata whole, in \${{ steps.web.outputs.metadata }}`]);
    }

    // An expression in a key, wherever GitHub evaluates one: an env name (the workflow's, a job's, a step's, a job
    // container's or a service's), a step input's name (INPUT_<key>), a service's id or a matrix key, so the
    // description would be an environment string's name, a container's or a matrix value's; anywhere in a key, not only
    // at its start. GitHub refuses one in a job's outputs, a reusable workflow's with: and secrets:, a step's own keys
    // or a job's id when it parses the file, and the rule refuses those too.
    const body = '${{ github.event.pull_request.body }}';
    const packed = '${{github.event.pull_request.body}}';
    // Each with the rule's message and any other the fixture earns (a step's own key is also one the rule does not read).
    const keyed: (readonly [string, string, ...string[]])[] = [
      [`env: { "${body}": '1' }\njobs: { images: { runs-on: ubuntu-26.04, steps: [] } }`, `env.${body}`],
      [`jobs: { images: { runs-on: ubuntu-26.04, env: { "${body}": '1' }, steps: [] } }`, `jobs.images.env.${body}`],
      [`jobs: { images: { runs-on: ubuntu-26.04, steps: [{ name: The step, env: { "${body}": '1' }, run: echo }] } }`, `jobs.images.steps[0].env.${body}`],
      [`jobs: { images: { runs-on: ubuntu-26.04, container: { image: 'node:24', env: { "${body}": '1' } }, steps: [] } }`, `jobs.images.container.env.${body}`],
      [`jobs: { images: { runs-on: ubuntu-26.04, services: { db: { image: 'postgres:18', env: { "${body}": '1' } } }, steps: [] } }`, `jobs.images.services.db.env.${body}`],
      [`jobs: { images: { runs-on: ubuntu-26.04, steps: [{ name: The step, uses: actions/fixture@v1, with: { "${body}": '1' } }] } }`, `jobs.images.steps[0].with.${body}`],
      [`jobs: { images: { runs-on: ubuntu-26.04, outputs: { "${body}": '1' }, steps: [] } }`, `jobs.images.outputs.${body}`],
      [`jobs: { images: { uses: ./.github/workflows/fixture.yml, with: { "${body}": '1' } } }`, `jobs.images.with.${body}`],
      [`jobs: { images: { uses: ./.github/workflows/fixture.yml, secrets: { "${body}": '1' } } }`, `jobs.images.secrets.${body}`],
      [`jobs: { images: { runs-on: ubuntu-26.04, services: { "${body}": { image: 'postgres:18' } }, steps: [] } }`, `jobs.images.services.${body}`],
      [`jobs: { images: { runs-on: ubuntu-26.04, strategy: { matrix: { "${body}": [a] } }, steps: [] } }`, `jobs.images.strategy.matrix.${body}`],
      [`jobs: { images: { runs-on: ubuntu-26.04, steps: [{ name: The step, run: echo, "${body}": '1' }] } }`, `jobs.images.steps[0].${body}`, `fixture.yml job images step "The step": ${body}, a key the value rule does not read`],
      [`jobs: { images: { runs-on: ubuntu-26.04, steps: [{ name: The step, env: { "X_${body}": '1' }, run: echo }] } }`, `jobs.images.steps[0].env.X_${body}`],
      // GitHub evaluates the spelling with no spaces too; and a job's id is refused at parse time.
      [`jobs: { images: { runs-on: ubuntu-26.04, steps: [{ name: The step, env: { "${packed}": '1' }, run: echo }] } }`, `jobs.images.steps[0].env.${packed}`],
      [`jobs: { "${body}": { runs-on: ubuntu-26.04, steps: [] } }`, `jobs.${body}`],
    ];
    for (const [jobs, where, ...also] of keyed) {
      expect(unboundedValueProblems('fixture.yml', parse(`name: fixture\non: push\n${jobs}\n`)).problems, where).toEqual([`fixture.yml ${where}: an expression in a key`, ...also]);
    }
    // And an input's name under on:, which GitHub refuses at parse time.
    expect(unboundedValueProblems('fixture.yml', parse(`name: fixture\non:\n  workflow_dispatch:\n    inputs:\n      "${body}": { type: string }\njobs: {}\n`)).problems).toEqual([`fixture.yml on.workflow_dispatch.inputs.${body}: an expression in a key`]);

    // A key the rule does not read, whatever it holds: a nested parallel: list of steps (GitHub's parser has one), a
    // job's or the workflow's key it does not know.
    const unreadKey = (yaml: string) => unboundedValueProblems('fixture.yml', parse(`name: fixture\non: push\n${yaml}\n`)).problems;
    expect(unreadKey('jobs: { images: { runs-on: ubuntu-26.04, steps: [{ parallel: [{ name: Leak, env: { B: "${{ github.event.pull_request.body }}" }, run: echo }] }] } }')).toEqual(['fixture.yml job images step 0: parallel, a key the value rule does not read']);
    expect(unreadKey('jobs: { images: { runs-on: ubuntu-26.04, snapshot: image, steps: [] } }')).toEqual(['fixture.yml job images: snapshot, a key the value rule does not read']);
    expect(unreadKey('extra: { env: { B: "${{ github.event.pull_request.body }}" } }\njobs: {}')).toEqual(['fixture.yml the workflow: extra, a key the value rule does not read']);
    expect(unreadKey("defaults: { run: { shell: '${{ github.event.pull_request.body }}' } }\njobs: {}")).toEqual(['fixture.yml defaults.run.shell: github.event.pull_request.body, not a bounded github value, in ${{ github.event.pull_request.body }}']);

    // $GITHUB_ENV: each write one entry of a closed map, its file, job, step and line exactly, written once.
    const write = (lines: readonly string[], file = 'ci.yml', job = 'unit', step = "The engine freeze's base") =>
      unboundedValueProblems(file, parse(`name: fixture\non: push\njobs:\n  ${job}:\n    runs-on: ubuntu-26.04\n    steps:\n      - name: ${JSON.stringify(step)}\n        run: |\n${lines.map((line) => `          ${line}\n`).join('')}`)).problems;
    const freeze = 'echo "ENGINE_FREEZE_BASE=$base" >> "$GITHUB_ENV"';
    const outside = (line: string, where = 'ci.yml job unit step "The engine freeze\'s base"') => `${where} run: a $GITHUB_ENV write outside its closed map: ${line}`;
    expect(write(['base="$(git rev-parse HEAD^1)"', freeze])).toEqual([]);
    // A changed value form, a second write, and the write in another step, job or file.
    expect(write(['echo "ENGINE_FREEZE_BASE=$(git log -1 --format=%B)" >> "$GITHUB_ENV"'])).toEqual([outside('echo "ENGINE_FREEZE_BASE=$(git log -1 --format=%B)" >> "$GITHUB_ENV"')]);
    expect(write([freeze, freeze])).toEqual(['ci.yml: ENGINE_FREEZE_BASE is written to $GITHUB_ENV 2 times, not once']);
    expect(write([freeze], 'ci.yml', 'unit', 'Another step')).toEqual([outside(freeze, 'ci.yml job unit step "Another step"')]);
    expect(write([freeze], 'ci.yml', 'db')).toEqual([outside(freeze, 'ci.yml job db step "The engine freeze\'s base"')]);
    expect(write([freeze], 'fixture.yml')).toEqual([outside(freeze, 'fixture.yml job unit step "The engine freeze\'s base"')]);
    // Any other variable, or any other form.
    expect(write(['echo "BODY=$x" >> "$GITHUB_ENV"'])).toEqual([outside('echo "BODY=$x" >> "$GITHUB_ENV"')]);
    expect(write(['cat file >> $GITHUB_ENV'])).toEqual([outside('cat file >> $GITHUB_ENV')]);
    // A write split by a backslash-newline is the line bash reads; the switch for ::set-env is refused anywhere.
    expect(write([freeze, 'echo "BODY=$x" >> "$GITHUB_\\', 'ENV"'])).toEqual([outside('echo "BODY=$x" >> "$GITHUB_ENV"')]);
    expect(unboundedValueProblems('fixture.yml', parse("name: fixture\non: push\njobs: { images: { runs-on: ubuntu-26.04, steps: [{ name: The step, env: { ACTIONS_ALLOW_UNSECURE_COMMANDS: 'true' }, run: echo }] } }\n")).problems).toEqual([
      "fixture.yml jobs.images.steps[0].env.ACTIONS_ALLOW_UNSECURE_COMMANDS: a switch for ::set-env, which writes a variable outside $GITHUB_ENV's closed map",
    ]);
    expect(unboundedValueProblems('fixture.yml', parse("name: fixture\non: push\nenv: { actions_allow_unsecure_commands: 'true' }\njobs: {}\n")).problems).toEqual([
      "fixture.yml env.actions_allow_unsecure_commands: a switch for ::set-env, which writes a variable outside $GITHUB_ENV's closed map",
    ]);
    // $GITHUB_ENV or $GITHUB_PATH named anywhere but a step's run: (a step's shell, a job's or the workflow's default
    // shell, an input, an env value or name), the runner's file command files named anywhere, a script line included,
    // and any line of a script naming $GITHUB_PATH, of which none is listed.
    const commandsIn = (yaml: string) => unboundedValueProblems('fixture.yml', parse(`name: fixture\non: push\n${yaml}\n`)).problems;
    const outsideRun = (where: string) => `fixture.yml ${where}: names $GITHUB_ENV, $GITHUB_PATH or the runner's file commands outside a step's run:, where a shell, an input or an action could set a later step's environment unread`;
    const shell = `'bash -c "git log -1 --format=BODY=%s >> $GITHUB_ENV; bash --noprofile --norc -eo pipefail {0}"'`;
    expect(commandsIn(`jobs: { check: { runs-on: ubuntu-26.04, steps: [{ name: Probe, shell: ${shell}, run: echo probe }] } }`)).toEqual([outsideRun('jobs.check.steps[0].shell')]);
    expect(commandsIn(`jobs: { check: { runs-on: ubuntu-26.04, defaults: { run: { shell: ${shell} } }, steps: [{ name: Probe, run: echo probe }] } }`)).toEqual([outsideRun('jobs.check.defaults.run.shell')]);
    expect(commandsIn(`defaults: { run: { shell: ${shell} } }\njobs: {}`)).toEqual([outsideRun('defaults.run.shell')]);
    expect(commandsIn('jobs: { check: { runs-on: ubuntu-26.04, steps: [{ name: Probe, uses: actions/fixture@v1, with: { file: $GITHUB_ENV } }] } }')).toEqual([outsideRun('jobs.check.steps[0].with.file')]);
    expect(commandsIn('jobs: { check: { runs-on: ubuntu-26.04, env: { TARGET: $GITHUB_ENV }, steps: [] } }')).toEqual([outsideRun('jobs.check.env.TARGET')]);
    expect(commandsIn('jobs: { check: { runs-on: ubuntu-26.04, steps: [{ name: Probe, env: { GITHUB_ENV: /tmp/env }, run: echo }] } }')).toEqual([outsideRun('jobs.check.steps[0].env.GITHUB_ENV')]);
    expect(commandsIn('jobs: { check: { runs-on: ubuntu-26.04, steps: [{ name: Probe, uses: actions/fixture@v1, with: { path: "$RUNNER_TEMP/_runner_file_commands" } }] } }')).toEqual([outsideRun('jobs.check.steps[0].with.path')]);
    expect(commandsIn('jobs: { check: { runs-on: ubuntu-26.04, steps: [{ name: Probe, uses: actions/fixture@v1, with: { file: $GITHUB_PATH } }] } }')).toEqual([outsideRun('jobs.check.steps[0].with.file')]);
    expect(write(['echo "$V$V$V" >> "$GITHUB_PATH"'])).toEqual(['ci.yml job unit step "The engine freeze\'s base" run: a $GITHUB_PATH write, which sets PATH for every later step and no row bounds: echo "$V$V$V" >> "$GITHUB_PATH"']);
    // The pinned Trivy's two writes, each listed for its three steps: admitted there once each, refused in another step,
    // job or file, in another form, or twice.
    const trivy = ['trivy="$(tools/trivy/install.sh "$RUNNER_TEMP/trivy-bin")"', 'dirname "$trivy" >> "$GITHUB_PATH"', 'echo "TRIVY_CMD=$trivy" >> "$GITHUB_ENV"'];
    const pathOutside = (line: string, where: string) => `${where} run: a $GITHUB_PATH write, which sets PATH for every later step and no row bounds: ${line}`;
    for (const [file, job] of [['ci.yml', 'images'], ['release.yml', 'build'], ['release-dry-run.yml', 'build']] as const) expect(write(trivy, file, job, 'The pinned Trivy'), file).toEqual([]);
    expect(write(trivy, 'ci.yml', 'unit', 'The pinned Trivy')).toEqual([pathOutside(trivy[1] ?? '', 'ci.yml job unit step "The pinned Trivy"'), outside(trivy[2] ?? '', 'ci.yml job unit step "The pinned Trivy"')]);
    expect(write(trivy, 'ci.yml', 'images', 'Another step')).toEqual([pathOutside(trivy[1] ?? '', 'ci.yml job images step "Another step"'), outside(trivy[2] ?? '', 'ci.yml job images step "Another step"')]);
    expect(write([...trivy, trivy[1] ?? ''], 'ci.yml', 'images', 'The pinned Trivy')).toEqual(['ci.yml: trivy-bin is written to $GITHUB_PATH 2 times, not once']);
    expect(write([trivy[0] ?? '', 'echo "$trivy" >> "$GITHUB_PATH"', 'echo "TRIVY_CMD=$trivy:$V" >> "$GITHUB_ENV"'], 'ci.yml', 'images', 'The pinned Trivy')).toEqual([
      pathOutside('echo "$trivy" >> "$GITHUB_PATH"', 'ci.yml job images step "The pinned Trivy"'),
      outside('echo "TRIVY_CMD=$trivy:$V" >> "$GITHUB_ENV"', 'ci.yml job images step "The pinned Trivy"'),
    ]);
    // Or by a file's own name, beside $GITHUB_OUTPUT's, so a script reaching it without naming $GITHUB_ENV is refused.
    expect(write(['echo "X=$V$V$V" >> "${GITHUB_OUTPUT%/*}"/set_env_${GITHUB_OUTPUT##*set_output_}'])).toEqual([
      'ci.yml job unit step "The engine freeze\'s base" run: names the runner\'s file commands, which set a later step\'s environment unread: echo "X=$V$V$V" >> "${GITHUB_OUTPUT%/*}"/set_env_${GITHUB_OUTPUT##*set_output_}',
    ]);
    expect(write(['echo /tmp/bin >> "$(dirname "$GITHUB_OUTPUT")"/ADD_PATH_x'])).toEqual([
      'ci.yml job unit step "The engine freeze\'s base" run: names the runner\'s file commands, which set a later step\'s environment unread: echo /tmp/bin >> "$(dirname "$GITHUB_OUTPUT")"/ADD_PATH_x',
    ]);
    expect(commandsIn('jobs: { check: { runs-on: ubuntu-26.04, steps: [{ name: Probe, uses: actions/fixture@v1, with: { file: set_env_x } }] } }')).toEqual([outsideRun('jobs.check.steps[0].with.file')]);
    expect(write(['cat file >> "$RUNNER_TEMP"/_runner_file_commands/set_env_*'])).toEqual([
      'ci.yml job unit step "The engine freeze\'s base" run: names the runner\'s file commands, which set a later step\'s environment unread: cat file >> "$RUNNER_TEMP"/_runner_file_commands/set_env_*',
    ]);
  });

  /**
   * Where a row's value comes from, each named by what it is, never by a line, so an edit elsewhere in a file moves
   * none and a renamed, moved or removed producer turns the table red:
   * - a step of a job, by its id: a `run:` step with the fingerprint of what its script runs with as parsed, its run,
   *   its env over its job's and the workflow's, its shell and working-directory or the defaults it takes, and its
   *   job's container (fingerprint, below), so a changed script or input, its own or inherited, fails until a person
   *   re-reads the bound and writes the new one; a `uses:` step with its action (its pin is the pin rules', CI-11);
   * - an output a job declares, a key of a job's matrix, and a job the reading job needs (the steps, needed jobs and
   *   outputs a row names being exactly those its value reads, producersOf);
   * - tool code by the name it declares (path#symbol, read with TypeScript's parser), never fingerprinted: other lanes
   *   own it and change it for their own reasons, so the row names instead the unit test its owners keep for the
   *   bound, by its title, one test's alone that always runs as written (testTitles); what it asserts is not read.
   */
  type Ref =
    | { readonly kind: 'step'; readonly job: string; readonly step: string; readonly run: string }
    | { readonly kind: 'step'; readonly job: string; readonly step: string; readonly uses: string }
    | { readonly kind: 'output'; readonly job: string; readonly name: string }
    | { readonly kind: 'matrix'; readonly job: string; readonly key: string }
    | { readonly kind: 'needs'; readonly job: string }
    | { readonly kind: 'symbol'; readonly path: string; readonly symbol: string }
    | { readonly kind: 'test'; readonly path: string; readonly name: string };

  interface BoundedValue extends ValueKey {
    /** What writes it, resolved by name in the test below. */
    readonly refs: readonly Ref[];
    /** Its bound, in words: what the producers write, and why no more. */
    readonly bound: string;
    /** Its bound in bytes, which every environment string that holds it adds (the sum, below). */
    readonly bytes: number;
    /**
     * Where it may be read, exactly (a place as FoundValue's where names it): every use of a row whose bytes pass
     * MAX_ARG_STRLEN is pinned, so such a value reaches no environment string or input it was not reviewed for.
     */
    readonly sites?: readonly string[];
  }

  const script = (job: string, step: string, run: string): Ref => ({ kind: 'step', job, step, run });
  const action = (job: string, step: string, uses: string): Ref => ({ kind: 'step', job, step, uses });
  const output = (job: string, name: string): Ref => ({ kind: 'output', job, name });
  const needs = (job: string): Ref => ({ kind: 'needs', job });
  const symbol = (reference: string): Ref => {
    const [file = '', name = ''] = reference.split('#');
    return { kind: 'symbol', path: file, symbol: name };
  };
  const unitTest = (file: string, name: string): Ref => ({ kind: 'test', path: file, name });

  /** The runner image's two names, which the image sets (ubuntu26-20261019.27.1 is 22 bytes). */
  const RUNNER_IMAGE_BYTES = 256;
  /** A cache key: actions/cache refuses one over 512 characters, each at most 4 bytes. */
  const CACHE_KEY_BYTES = 4 * 512;
  /** A digest: sha256: and 64 hexadecimal digits. */
  const DIGEST_BYTES = 'sha256:'.length + 64;
  /**
   * affected.ts's lists as JSON: the mutation packages' names (38 bytes for today's four) and their shards' names from
   * stryker/shards.json (116 bytes for today's seven; 1,024 holds some fifty more of their length).
   */
  const PACKAGES_BYTES = 256;
  const SHARDS_BYTES = 1_024;
  /**
   * The most toJSON writes of one job's outputs, given each output's bound, as the runner writes JSON: two-space
   * indents, each value quoted and escaped (a quote or a backslash two bytes, a control character six, \u and four
   * digits), so six bytes for each of its value's, its name, and ten more for the indent, the quotes, ': ', ',' and
   * the newline; and the braces.
   */
  /**
   * A job's own lines in toJSON(needs), past its id and its outputs' own: by hand from the runner's indented form,
   * `  "<id>": {` and its newline (id + 8), `    "result": "cancelled",` and its newline (27, cancelled the longest
   * result), `    "outputs": {` and its newline (17), its close (6) and the job's own close (5), so id + 63; 96 keeps a
   * third again over that count, should the runner's form differ by a line ending or a space.
   */
  const NEEDS_JOB_BYTES = 96;
  const toJsonBytes = (outputs: Readonly<Record<string, number>>): number => Object.entries(outputs).reduce((sum, [name, bytes]) => sum + name.length + 6 * bytes + 10, '{\n}'.length);
  /**
   * The same of needs: each job it is given, its id and NEEDS_JOB_BYTES of its own lines (its result, a word, among
   * them), and its outputs one level deeper, four more bytes of indent each.
   */
  const needsJsonBytes = (jobs: Readonly<Record<string, Readonly<Record<string, number>>>>): number =>
    Object.entries(jobs).reduce((sum, [job, outputs]) => sum + job.length + NEEDS_JOB_BYTES + toJsonBytes(outputs) - '{\n}'.length + 4 * Object.keys(outputs).length, '{\n}'.length);
  /** An image's name in a release matrix, the longest being web-production. */
  const IMAGE_NAME_BYTES = 'web-production'.length;
  const RUNNER_IMAGE = "the runner image step writes the runner image's name and version, $ImageOS-$ImageVersion and $ImageOS";
  /** The runner image step's row: the same script everywhere, fingerprinted with what its job and workflow give it. */
  const runnerImage = (job: string, run: string): Ref[] => [script(job, 'runner-image', run)];
  const cacheKey = (parts: string) => `actions/cache/restore echoes the key it was given, made of ${parts}`;
  const RUNNER_HASH = 'runner.os and a hashFiles digest';
  const APT_KEY = "the runner image's key and a hashFiles digest";
  const IDENTITY = "the identity step writes, for its matrix's image, the archive's SHA-256 (64 hexadecimal digits) and the config and top-level digests image-id.ts reads from the archive's bytes (sha256: and 64 hexadecimal digits, the top-level one '' for an archive without an index)";
  const IMAGE_ID = [symbol('tools/screening-capacity/image-id.ts#identityOf'), unitTest('tools/screening-capacity/image-id.test.ts', 'refuses a config whose bytes do not hash to the digest that names it, and a missing config')];
  const identity = (run: string): Ref[] => [script('build', 'identity', run), { kind: 'matrix', job: 'build', key: 'image' }, ...IMAGE_ID];
  const AFFECTED = 'tools/stryker/affected.ts writes any (true or false), packages and shards (JSON lists of the mutation packages, MUTATION_PACKAGES, and their shards, shardsFor)';
  const AFFECTED_CODE = [symbol('stryker/base.mjs#MUTATION_PACKAGES'), symbol('tools/stryker/affected.ts#shardsFor'), unitTest('tools/stryker/affected.test.ts', 'selects every shard of each affected package')];
  const AFFECTED_STEP = script('changes', 'affected', '4d1e744c');
  const RELEASE_BUILD = (digests: string) => `the build job's outputs, ${digests} digests of 64 hexadecimal digits (sha256: before the config and top-level ones), by the identity step`;
  const releaseBuild = (images: readonly string[]): Ref[] => [needs('build'), ...images.flatMap((image) => ['sha256', 'config', 'target'].map((kind) => output('build', `${kind}_${image}`)))];
  /** What toJSON writes of the build job's outputs: each image's archive SHA-256 and its config and top-level digests. */
  const releaseJson = (images: readonly string[]): number => toJsonBytes(Object.fromEntries(images.flatMap((image) => [[`sha256_${image}`, 64], [`config_${image}`, DIGEST_BYTES], [`target_${image}`, DIGEST_BYTES]])));
  /** The jobs ci.yml's gate needs, none of which declares outputs (asserted below). */
  const ALL_GREEN_NEEDS = ['static', 'lint', 'unit', 'db', 'domain-model', 'build', 'e2e', 'images'];
  const ADVISORIES = [
    symbol('tools/release-capacity/checks.ts#verdict'),
    symbol('tools/release-capacity/checks.ts#advisoriesOutput'),
    unitTest('tools/release-capacity/checks.test.ts', 'records times as advisory: a slow windows query, or none, fails nothing'),
    unitTest('tools/release-capacity/checks.test.ts', 'is empty with no advisory, and otherwise one line of base64 holding each advisory on a line of its own'),
  ];
  // The tests that hold the sentence's text exactly: the job's sizing output, and sizingQuestion's longest form.
  const SIZING = [
    symbol('tools/screening-capacity/report.ts#sizingQuestion'),
    unitTest('tools/screening-capacity/report.test.ts', 'passes an advisory run failing only on time, each time verdict a warning the job annotates and hands to the gate'),
    unitTest('tools/screening-capacity/report.test.ts', 'raises the sizing question when the middle run is between 44 and 48 s, and passes'),
  ];
  const TIME_WARNINGS = [symbol('tools/screening-capacity/report.ts#verdict'), unitTest('tools/screening-capacity/report.test.ts', 'passes an advisory run failing only on time, each time verdict a warning the job annotates and hands to the gate')];
  const MEASURE_OUTPUTS = [script('capacity', 'measure', '73daec9d'), symbol('tools/screening-capacity/report.ts#jobResult'), symbol('tools/screening-capacity/run.ts#main')];

  /**
   * Every step output and every value one job hands another that reaches a process, each with its bound: a new one fails
   * the test below until a reviewed row names its producers and its bound (docs/adr/0066, Part 3, N32).
   */
  const BOUNDED_VALUES: readonly BoundedValue[] = [
    {
      file: 'ci.yml',
      job: 'all-green',
      value: 'tojson(needs)',
      bytes: needsJsonBytes(Object.fromEntries(ALL_GREEN_NEEDS.map((job) => [job, {}]))),
      refs: ALL_GREEN_NEEDS.map(needs),
      bound: 'the eight jobs it needs, each a result word, and their outputs, of which there are none: no ci.yml job declares outputs (asserted below)',
    },
    { file: 'ci.yml', job: 'db', value: 'steps.runner-image.outputs.key', bytes: RUNNER_IMAGE_BYTES, refs: runnerImage('db', 'e2fd2a82'), bound: RUNNER_IMAGE },
    { file: 'ci.yml', job: 'db', value: 'steps.runner-image.outputs.os', bytes: RUNNER_IMAGE_BYTES, refs: runnerImage('db', 'e2fd2a82'), bound: RUNNER_IMAGE },
    { file: 'ci.yml', job: 'db', value: 'steps.vitest-cache.outputs.cache-primary-key', bytes: CACHE_KEY_BYTES, refs: [action('db', 'vitest-cache', 'actions/cache/restore')], bound: cacheKey('runner.os, strategy.job-total, matrix.shard and github.sha') },
    { file: 'ci.yml', job: 'e2e', value: 'steps.runner-image.outputs.key', bytes: RUNNER_IMAGE_BYTES, refs: runnerImage('e2e', 'e2fd2a82'), bound: RUNNER_IMAGE },
    { file: 'ci.yml', job: 'e2e', value: 'steps.runner-image.outputs.os', bytes: RUNNER_IMAGE_BYTES, refs: runnerImage('e2e', 'e2fd2a82'), bound: RUNNER_IMAGE },
    {
      file: 'ci.yml',
      job: 'images',
      value: "fromjson(steps.web.outputs.metadata || '{}')['containerimage.config.digest']",
      bytes: DIGEST_BYTES,
      refs: [action('images', 'web', 'docker/build-push-action')],
      bound: "buildx's config digest of the web build, sha256: and 64 hexadecimal digits, or '' when the metadata lacks it",
    },
    {
      file: 'ci.yml',
      job: 'images',
      value: "fromjson(steps.worker.outputs.metadata || '{}')['containerimage.config.digest']",
      bytes: DIGEST_BYTES,
      refs: [action('images', 'worker', 'docker/build-push-action')],
      bound: "buildx's config digest of the worker build, sha256: and 64 hexadecimal digits, or '' when the metadata lacks it",
    },
    { file: 'ci.yml', job: 'static', value: 'steps.range.outputs.base', bytes: 'origin/'.length + PATH_BYTES, refs: [script('static', 'range', '93428fc5')], bound: 'the commits step writes origin/ and the base branch, github.event.before or a commit SHA, each checked to name a commit' },
    { file: 'ci.yml', job: 'static', value: 'steps.tsc-cache.outputs.cache-primary-key', bytes: CACHE_KEY_BYTES, refs: [action('static', 'tsc-cache', 'actions/cache/restore')], bound: cacheKey(`${RUNNER_HASH} and github.sha`) },
    { file: 'ci.yml', job: 'unit', value: 'steps.apt.outputs.cache-primary-key', bytes: CACHE_KEY_BYTES, refs: [action('unit', 'apt', 'actions/cache/restore')], bound: cacheKey(APT_KEY) },
    { file: 'ci.yml', job: 'unit', value: 'steps.browsers.outputs.cache-primary-key', bytes: CACHE_KEY_BYTES, refs: [action('unit', 'browsers', 'actions/cache/restore')], bound: cacheKey(RUNNER_HASH) },
    { file: 'ci.yml', job: 'unit', value: 'steps.runner-image.outputs.key', bytes: RUNNER_IMAGE_BYTES, refs: runnerImage('unit', '1b44a36b'), bound: RUNNER_IMAGE },
    { file: 'ci.yml', job: 'unit', value: 'steps.runner-image.outputs.os', bytes: RUNNER_IMAGE_BYTES, refs: runnerImage('unit', '1b44a36b'), bound: RUNNER_IMAGE },
    { file: 'large-zip.yml', job: 'large-zip', value: 'steps.runner-image.outputs.key', bytes: RUNNER_IMAGE_BYTES, refs: runnerImage('large-zip', '1b44a36b'), bound: RUNNER_IMAGE },
    { file: 'large-zip.yml', job: 'large-zip', value: 'steps.runner-image.outputs.os', bytes: RUNNER_IMAGE_BYTES, refs: runnerImage('large-zip', '1b44a36b'), bound: RUNNER_IMAGE },
    { file: 'mutation.yml', job: 'changes', value: 'steps.affected.outputs.any', bytes: BOOLEAN_BYTES, refs: [AFFECTED_STEP, ...AFFECTED_CODE], bound: AFFECTED },
    { file: 'mutation.yml', job: 'changes', value: 'steps.affected.outputs.packages', bytes: PACKAGES_BYTES, refs: [AFFECTED_STEP, ...AFFECTED_CODE], bound: AFFECTED },
    { file: 'mutation.yml', job: 'changes', value: 'steps.affected.outputs.shards', bytes: SHARDS_BYTES, refs: [AFFECTED_STEP, ...AFFECTED_CODE], bound: AFFECTED },
    { file: 'mutation.yml', job: 'mutation', value: 'needs.changes.outputs.any', bytes: BOOLEAN_BYTES, refs: [needs('changes'), output('changes', 'any'), ...AFFECTED_CODE], bound: `the changes job's outputs: ${AFFECTED}` },
    { file: 'mutation.yml', job: 'mutation', value: 'needs.changes.outputs.packages', bytes: PACKAGES_BYTES, refs: [needs('changes'), output('changes', 'packages'), ...AFFECTED_CODE], bound: `the changes job's outputs: ${AFFECTED}` },
    { file: 'mutation.yml', job: 'mutation', value: 'needs.changes.outputs.shards', bytes: SHARDS_BYTES, refs: [needs('changes'), output('changes', 'shards'), ...AFFECTED_CODE], bound: `the changes job's outputs: ${AFFECTED}` },
    {
      file: 'mutation.yml',
      job: 'stryker',
      value: 'needs.changes.outputs.shards',
      bytes: SHARDS_BYTES,
      refs: [needs('changes'), output('changes', 'shards'), { kind: 'matrix', job: 'stryker', key: 'shard' }, ...AFFECTED_CODE],
      bound: `the shards' matrix: ${AFFECTED}`,
    },
    {
      file: 'publish-content.yml',
      job: 'publish',
      value: 'steps.publish.outputs.releases',
      bytes: 899_999 * 7,
      refs: [script('publish', 'publish', '03b3bf3e'), unitTest('tools/test/publish-content.test.ts', 'refuses a directory that is not a release number'), unitTest('tools/test/publish-content.test.ts', 'refuses a number reserved for SYNTHETIC fixture releases')],
      sites: ['job publish step "Push the release commits and tags" run'],
      bound: 'the release numbers tools/publish-content.sh publishes, each a number below 900,000, separated by spaces, and read in a script, which the runner writes to a file (the file is frozen to its copy)',
    },
    {
      file: 'release-capacity.yml',
      job: 'capacity',
      value: 'steps.measure.outputs.advisories',
      bytes: 256,
      refs: [script('capacity', 'measure', 'a3c1a1ff'), symbol('tools/release-capacity/run.ts#main'), ...ADVISORIES],
      bound: 'base64 of at most one advisory line (verdict, tools/release-capacity/checks.ts), written by tools/release-capacity/run.ts',
    },
    { file: 'release-capacity.yml', job: 'notify', value: 'needs.capacity.outputs.advisories', bytes: 256, refs: [needs('capacity'), output('capacity', 'advisories'), ...ADVISORIES], bound: 'ADVISORIES_B64: base64 of at most one advisory line (verdict, tools/release-capacity/checks.ts)' },
    { file: 'release-dry-run.yml', job: 'build', value: 'steps.identity.outputs.config_web', bytes: DIGEST_BYTES, refs: identity('854bf72c'), bound: IDENTITY },
    { file: 'release-dry-run.yml', job: 'build', value: 'steps.identity.outputs.config_worker', bytes: DIGEST_BYTES, refs: identity('854bf72c'), bound: IDENTITY },
    { file: 'release-dry-run.yml', job: 'build', value: 'steps.identity.outputs.sha256_web', bytes: 64, refs: identity('854bf72c'), bound: IDENTITY },
    { file: 'release-dry-run.yml', job: 'build', value: 'steps.identity.outputs.sha256_worker', bytes: 64, refs: identity('854bf72c'), bound: IDENTITY },
    { file: 'release-dry-run.yml', job: 'build', value: 'steps.identity.outputs.target_web', bytes: DIGEST_BYTES, refs: identity('854bf72c'), bound: IDENTITY },
    { file: 'release-dry-run.yml', job: 'build', value: 'steps.identity.outputs.target_worker', bytes: DIGEST_BYTES, refs: identity('854bf72c'), bound: IDENTITY },
    { file: 'release-dry-run.yml', job: 'build', value: 'steps.image.outputs.dockerfile', bytes: 'apps/worker/Dockerfile'.length, refs: [script('build', 'image', '604272e1')], bound: 'one of two Dockerfile paths' },
    { file: 'release-dry-run.yml', job: 'build', value: 'steps.image.outputs.origin', bytes: VARIABLE_BYTES, refs: [script('build', 'image', '604272e1')], bound: "'' or a repository variable on one line (the step refuses a line break), at most 48 KB" },
    { file: 'release-dry-run.yml', job: 'build', value: 'steps.image.outputs.ref', bytes: 'ghcr.io/'.length + 140 + '/'.length + IMAGE_NAME_BYTES + ':dry-run-'.length + INTEGER_BYTES, refs: [script('build', 'image', '604272e1')], bound: "ghcr.io, the repository, the matrix's image and dry-run- with the run's ID" },
    { file: 'release-dry-run.yml', job: 'capacity', value: 'tojson(needs.build.outputs)', bytes: releaseJson(['web', 'worker']), refs: releaseBuild(['web', 'worker']), bound: RELEASE_BUILD('six') },
    { file: 'release-dry-run.yml', job: 'push', value: 'tojson(needs.build.outputs)', bytes: releaseJson(['web', 'worker']), refs: releaseBuild(['web', 'worker']), bound: RELEASE_BUILD('six') },
    { file: 'release.yml', job: 'build', value: 'steps.identity.outputs.config_web', bytes: DIGEST_BYTES, refs: identity('854bf72c'), bound: IDENTITY },
    { file: 'release.yml', job: 'build', value: 'steps.identity.outputs.config_web-production', bytes: DIGEST_BYTES, refs: identity('854bf72c'), bound: IDENTITY },
    { file: 'release.yml', job: 'build', value: 'steps.identity.outputs.config_web-staging', bytes: DIGEST_BYTES, refs: identity('854bf72c'), bound: IDENTITY },
    { file: 'release.yml', job: 'build', value: 'steps.identity.outputs.config_worker', bytes: DIGEST_BYTES, refs: identity('854bf72c'), bound: IDENTITY },
    { file: 'release.yml', job: 'build', value: 'steps.identity.outputs.sha256_web', bytes: 64, refs: identity('854bf72c'), bound: IDENTITY },
    { file: 'release.yml', job: 'build', value: 'steps.identity.outputs.sha256_web-production', bytes: 64, refs: identity('854bf72c'), bound: IDENTITY },
    { file: 'release.yml', job: 'build', value: 'steps.identity.outputs.sha256_web-staging', bytes: 64, refs: identity('854bf72c'), bound: IDENTITY },
    { file: 'release.yml', job: 'build', value: 'steps.identity.outputs.sha256_worker', bytes: 64, refs: identity('854bf72c'), bound: IDENTITY },
    { file: 'release.yml', job: 'build', value: 'steps.identity.outputs.target_web', bytes: DIGEST_BYTES, refs: identity('854bf72c'), bound: IDENTITY },
    { file: 'release.yml', job: 'build', value: 'steps.identity.outputs.target_web-production', bytes: DIGEST_BYTES, refs: identity('854bf72c'), bound: IDENTITY },
    { file: 'release.yml', job: 'build', value: 'steps.identity.outputs.target_web-staging', bytes: DIGEST_BYTES, refs: identity('854bf72c'), bound: IDENTITY },
    { file: 'release.yml', job: 'build', value: 'steps.identity.outputs.target_worker', bytes: DIGEST_BYTES, refs: identity('854bf72c'), bound: IDENTITY },
    { file: 'release.yml', job: 'build', value: 'steps.image.outputs.dockerfile', bytes: 'apps/worker/Dockerfile'.length, refs: [script('build', 'image', 'c5ff17fd')], bound: 'one of two Dockerfile paths' },
    { file: 'release.yml', job: 'build', value: 'steps.image.outputs.origin', bytes: VARIABLE_BYTES, refs: [script('build', 'image', 'c5ff17fd')], bound: "'' or a repository variable on one line (the step refuses a line break), at most 48 KB" },
    { file: 'release.yml', job: 'build', value: 'steps.image.outputs.ref', bytes: 'ghcr.io/'.length + 140 + '/'.length + IMAGE_NAME_BYTES + ':'.length + PATH_BYTES, refs: [script('build', 'image', 'c5ff17fd')], bound: "ghcr.io, the repository, the matrix's image and the tag's name" },
    { file: 'release.yml', job: 'capacity', value: 'tojson(needs.build.outputs)', bytes: releaseJson(['web', 'web-staging', 'web-production', 'worker']), refs: releaseBuild(['web', 'web-staging', 'web-production', 'worker']), bound: RELEASE_BUILD('twelve') },
    { file: 'release.yml', job: 'push', value: 'tojson(needs.build.outputs)', bytes: releaseJson(['web', 'web-staging', 'web-production', 'worker']), refs: releaseBuild(['web', 'web-staging', 'web-production', 'worker']), bound: RELEASE_BUILD('twelve') },
    { file: 'release.yml', job: 'report', value: 'steps.attest.outputs.bundle-path', bytes: PATH_BYTES, refs: [action('report', 'attest', 'actions/attest-build-provenance')], bound: 'the path of the bundle actions/attest-build-provenance writes' },
    { file: 'screening-capacity.yml', job: 'capacity', value: 'steps.apt.outputs.cache-primary-key', bytes: CACHE_KEY_BYTES, refs: [action('capacity', 'apt', 'actions/cache/restore')], bound: cacheKey(APT_KEY) },
    { file: 'screening-capacity.yml', job: 'capacity', value: 'steps.measure.outputs.sizing', bytes: 512, refs: [...MEASURE_OUTPUTS, ...SIZING], bound: "one sentence of numbers and an upload's label (sizingQuestion, tools/screening-capacity/report.ts), written by run.ts" },
    {
      file: 'screening-capacity.yml',
      job: 'capacity',
      value: 'steps.measure.outputs.time-warnings',
      bytes: 16_384,
      refs: [...MEASURE_OUTPUTS, ...TIME_WARNINGS],
      bound: 'one line per judged scenario upload of a fixed list (verdict, tools/screening-capacity/report.ts), joined (jobResult)',
    },
    { file: 'screening-capacity.yml', job: 'capacity', value: 'steps.runner-image.outputs.key', bytes: RUNNER_IMAGE_BYTES, refs: runnerImage('capacity', 'bb8bd5e3'), bound: RUNNER_IMAGE },
    { file: 'screening-capacity.yml', job: 'capacity', value: 'steps.runner-image.outputs.os', bytes: RUNNER_IMAGE_BYTES, refs: runnerImage('capacity', 'bb8bd5e3'), bound: RUNNER_IMAGE },
    { file: 'screening-capacity.yml', job: 'capacity', value: 'steps.scale-release.outputs.cache-primary-key', bytes: CACHE_KEY_BYTES, refs: [action('capacity', 'scale-release', 'actions/cache/restore')], bound: cacheKey('one hashFiles digest') },
    { file: 'screening-capacity.yml', job: 'changes', value: 'steps.watched.outputs.measure', bytes: BOOLEAN_BYTES, refs: [script('changes', 'watched', 'ba482ece')], bound: 'true or false' },
    { file: 'screening-capacity.yml', job: 'gate', value: 'needs.capacity.outputs.sizing', bytes: 512, refs: [needs('capacity'), output('capacity', 'sizing'), ...SIZING], bound: "SIZING: one sentence of numbers and an upload's label (sizingQuestion, tools/screening-capacity/report.ts)" },
    {
      file: 'screening-capacity.yml',
      job: 'gate',
      value: 'needs.capacity.outputs.time-warnings',
      bytes: 16_384,
      refs: [needs('capacity'), output('capacity', 'time-warnings'), ...TIME_WARNINGS],
      bound: 'TIME_WARNINGS: one line per judged scenario upload of a fixed list (verdict, tools/screening-capacity/report.ts)',
    },
    { file: 'screening-capacity.yml', job: 'gate', value: 'needs.changes.outputs.measure', bytes: BOOLEAN_BYTES, refs: [needs('changes'), output('changes', 'measure')], bound: 'MEASURE: true or false, by the changed paths step' },
  ];

  /** A repository file's text, for a symbol or a test a row names (tool code is read from the repository, never CI_TREE's copy of the CI files), or undefined. */
  function repositorySource(file: string): string | undefined {
    const full = path.join(repositoryRoot, file);
    return existsSync(full) ? readFileSync(full, 'utf8') : undefined;
  }

  /** The names a module declares at its top level (a function, class, variable, type, interface or enum, exported or not), read with TypeScript's parser. */
  function declaredNames(file: string, text: string): Set<string> {
    const names = new Set<string>();
    for (const statement of ts.createSourceFile(file, text, ts.ScriptTarget.Latest).statements) {
      if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) if (ts.isIdentifier(declaration.name)) names.add(declaration.name.text);
      } else if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement) || ts.isEnumDeclaration(statement)) && statement.name !== undefined) {
        names.add(statement.name.text);
      }
    }
    return names;
  }

  /**
   * The titles of a test file's tests written to run whenever their file runs, each title one test's alone in the file:
   * an it() or test() call with a literal title, standing as a statement at the file's top level or directly in the
   * callback of a describe() counted the same way, each with no modifier but concurrent or sequential, no options but a
   * timeout, retry, repeats, concurrent or sequential, and a context, where it takes one, read only for its expect or
   * signal (so no skip through it: context.skip(), a skip it takes apart or renames, context['skip'], a skip it hands on
   * or keeps), and no call named skip. A test inside an if, a loop, a ternary or a function; one written it.skip, .todo,
   * .only, .fails, .skipIf(…)(…), .runIf(…)(…) or .each(…)(…), or given { skip: true }; one inside a describe written
   * so, or in one whose callback holds a return (it may stop before the test is declared); every test of a file with a
   * hook (beforeEach, beforeAll, afterEach, afterAll, aroundEach, aroundAll) whose context is read for anything else,
   * or that declares a name it, test or describe of its own (an import from vitest under its own name aside), whose it()
   * may be no test; and a title two tests share (the one that runs may not be the one that holds the bound) hold no
   * bound. What a test asserts, or whether it returns early, is not read: its owners keep it for the bound, and review
   * holds that. Nor is whether the file runs at all (the projects' include lists): review holds that too.
   */
  function testTitles(file: string, text: string): Set<string> {
    const RUNS = new Set(['concurrent', 'sequential']);
    const OPTIONS = new Set(['timeout', 'retry', 'repeats', 'concurrent', 'sequential']);
    /** A callee's base name, and whether it runs as written: every modifier on the way one that runs, and no call. */
    const chain = (node: ts.Expression): { readonly base: string | undefined; readonly runs: boolean } => {
      if (ts.isIdentifier(node)) return { base: node.text, runs: true };
      if (ts.isPropertyAccessExpression(node)) {
        const inner = chain(node.expression);
        return { base: inner.base, runs: inner.runs && RUNS.has(node.name.text) };
      }
      return { base: ts.isCallExpression(node) ? chain(node.expression).base : undefined, runs: false };
    };
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    // Every it() or test() with a literal title, wherever and however it is written.
    const written = new Map<string, number>();
    const count = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const [title] = node.arguments;
        const { base } = chain(node.expression);
        if ((base === 'it' || base === 'test') && title !== undefined && ts.isStringLiteralLike(title)) written.set(title.text, (written.get(title.text) ?? 0) + 1);
      }
      ts.forEachChild(node, count);
    };
    count(source);
    /** Whether a test's or a describe's other arguments let it run as written: its callback, a timeout, plain options. */
    const plain = (rest: readonly ts.Expression[]): boolean =>
      rest.every((argument) => ts.isArrowFunction(argument) || ts.isFunctionExpression(argument) || ts.isNumericLiteral(argument) || (ts.isObjectLiteralExpression(argument) && argument.properties.every((property) => ts.isPropertyAssignment(property) && ts.isIdentifier(property.name) && OPTIONS.has(property.name.text))));
    /** What a test's or a hook's context may be read for: nothing of it that skips or marks the test. */
    const CONTEXT = new Set(['expect', 'signal']);
    /** Whether a callback calls anything named skip, or reads its context for anything but CONTEXT, or takes more than it. */
    const skips = (callback: ts.ArrowFunction | ts.FunctionExpression): boolean => {
      let found = false;
      const look = (node: ts.Node): void => {
        if (ts.isCallExpression(node) && ((ts.isIdentifier(node.expression) && node.expression.text === 'skip') || (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'skip'))) found = true;
        ts.forEachChild(node, look);
      };
      look(callback.body);
      const [context, ...more] = callback.parameters;
      if (context === undefined) return found;
      if (more.length > 0 || context.dotDotDotToken !== undefined) return true;
      const name = context.name;
      // Taken apart: each element one of CONTEXT by name, under any local name, and no rest.
      if (ts.isObjectBindingPattern(name)) return found || !name.elements.every((element) => element.dotDotDotToken === undefined && ts.isIdentifier(element.propertyName ?? element.name) && CONTEXT.has((element.propertyName ?? element.name).getText(source)));
      if (!ts.isIdentifier(name)) return true;
      // Kept whole: every use of its name in the body is context.<one of CONTEXT>; any other (handed on, indexed, kept,
      // a shorthand property) is refused. A property's own name (x.context, { context: 1 }) is no use.
      const uses = (node: ts.Node): void => {
        if (ts.isIdentifier(node) && node.text === name.text) {
          const parent = node.parent;
          const ownName = (ts.isPropertyAccessExpression(parent) && parent.name === node) || ((ts.isPropertyAssignment(parent) || ts.isMethodDeclaration(parent) || ts.isPropertyDeclaration(parent)) && parent.name === node);
          if (!ownName && !(ts.isPropertyAccessExpression(parent) && parent.expression === node && CONTEXT.has(parent.name.text))) found = true;
        }
        ts.forEachChild(node, uses);
      };
      uses(callback.body);
      return found;
    };
    const HOOKS = new Set(['beforeEach', 'beforeAll', 'afterEach', 'afterAll', 'aroundEach', 'aroundAll']);
    const OWN = new Set(['it', 'test', 'describe']);
    // A file with a hook that may skip, whose context is read for anything else or which is no function written there,
    // holds no bound in any test.
    let tainted = false;
    const taint = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const callee = node.expression;
        const last = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : undefined;
        if (last !== undefined && HOOKS.has(last) && node.arguments.some((argument) => ((ts.isArrowFunction(argument) || ts.isFunctionExpression(argument)) && skips(argument)) || !(ts.isArrowFunction(argument) || ts.isFunctionExpression(argument) || ts.isNumericLiteral(argument)))) tainted = true;
      }
      ts.forEachChild(node, taint);
    };
    /** The names a binding (a name, or one taken apart) declares. */
    const bound = (name: ts.BindingName): string[] => (ts.isIdentifier(name) ? [name.text] : name.elements.flatMap((element) => (ts.isOmittedExpression(element) ? [] : bound(element.name))));
    /**
     * Whether the scope these statements open (the file's, or a describe callback's) declares an it, test or describe of
     * its own, which every call of that name in it and below would read: a let, const, function, class, enum or
     * namespace there, a var anywhere in it outside a function, or an import of one but from vitest under its own name.
     */
    const shadows = (list: readonly ts.Statement[]): boolean => {
      for (const statement of list) {
        if (ts.isImportDeclaration(statement)) {
          const clause = statement.importClause;
          const vitest = ts.isStringLiteral(statement.moduleSpecifier) && statement.moduleSpecifier.text === 'vitest';
          if (clause?.name !== undefined && OWN.has(clause.name.text)) return true;
          const named = clause?.namedBindings;
          if (named !== undefined && ts.isNamespaceImport(named) && OWN.has(named.name.text)) return true;
          if (named !== undefined && ts.isNamedImports(named) && named.elements.some((element) => OWN.has(element.name.text) && (!vitest || (element.propertyName !== undefined && element.propertyName.getText(source) !== element.name.text)))) return true;
        } else if (ts.isImportEqualsDeclaration(statement) || ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isEnumDeclaration(statement) || ts.isModuleDeclaration(statement)) {
          if (statement.name !== undefined && ts.isIdentifier(statement.name) && OWN.has(statement.name.text)) return true;
        } else if (ts.isVariableStatement(statement) && statement.declarationList.declarations.some((declaration) => bound(declaration.name).some((name) => OWN.has(name)))) {
          return true;
        }
      }
      let found = false;
      const look = (node: ts.Node): void => {
        if (ts.isVariableDeclarationList(node) && (node.flags & ts.NodeFlags.BlockScoped) === 0 && node.declarations.some((declaration) => bound(declaration.name).some((name) => OWN.has(name)))) found = true;
        if (!ts.isFunctionLike(node) && !ts.isClassLike(node)) ts.forEachChild(node, look);
      };
      for (const statement of list) look(statement);
      return found;
    };
    /** Whether a function's own body holds a return (one in a function inside it is that function's). */
    const returns = (body: ts.Node): boolean => {
      let found = false;
      const look = (node: ts.Node): void => {
        if (ts.isReturnStatement(node)) found = true;
        if (!ts.isFunctionLike(node)) ts.forEachChild(node, look);
      };
      ts.forEachChild(body, look);
      return found;
    };
    const titles = new Set<string>();
    const statements = (list: readonly ts.Statement[]): void => {
      if (shadows(list)) return;
      for (const statement of list) {
        if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression)) continue;
        const call = statement.expression;
        const { base, runs } = chain(call.expression);
        const [title, ...rest] = call.arguments;
        if (!runs || title === undefined || !ts.isStringLiteralLike(title) || !plain(rest)) continue;
        const callback = rest.find((argument): argument is ts.ArrowFunction | ts.FunctionExpression => ts.isArrowFunction(argument) || ts.isFunctionExpression(argument));
        if ((base === 'it' || base === 'test') && callback !== undefined && !skips(callback)) titles.add(title.text);
        if (base === 'describe' && callback !== undefined && ts.isBlock(callback.body) && !returns(callback.body) && callback.parameters.length === 0) statements(callback.body.statements);
      }
    };
    statements(source.statements);
    taint(source);
    return tainted ? new Set() : new Set([...titles].filter((title) => written.get(title) === 1));
  }

  /** A value as JSON with every mapping's keys sorted, so a reordered or restyled mapping reads the same. */
  const canonical = (value: unknown): string =>
    isList(value) ? `[${value.map(canonical).join(',')}]` : isRecord(value) ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}` : JSON.stringify(value ?? null);
  /**
   * The fingerprint a row holds for a `run:` step: the first 8 hexadecimal digits of the SHA-256 of what its script runs
   * with, as parsed: its run; its env over its job's over the workflow's (each mapping's keys in any order); its shell
   * and working-directory, or the defaults.run its job or else the workflow gives; and its job's container, where it
   * runs in one. So a changed script, or a changed input to it at any level, such as an env that names another
   * variable or a default shell, fails until a person re-reads the bound. A step that inherits nothing hashes its own
   * run, env, shell and working-directory alone.
   */
  const fingerprint = (step: { readonly run?: unknown; readonly env?: unknown; readonly shell?: unknown; readonly 'working-directory'?: unknown }, job?: unknown, root?: unknown): string => {
    const mapping = (value: unknown): Readonly<Record<string, unknown>> => (isRecord(value) ? value : {});
    const [inJob, inRoot] = [mapping(job), mapping(root)];
    const env = inJob.env === undefined && inRoot.env === undefined ? step.env : { ...mapping(inRoot.env), ...mapping(inJob.env), ...mapping(step.env) };
    const given = (key: 'shell' | 'working-directory'): unknown => step[key] ?? mapping(mapping(inJob.defaults).run)[key] ?? mapping(mapping(inRoot.defaults).run)[key];
    const inputs = { run: step.run, env, shell: given('shell'), 'working-directory': given('working-directory'), ...(inJob.container === undefined ? {} : { container: inJob.container }) };
    return createHash('sha256').update(canonical(inputs)).digest('hex').slice(0, 8);
  };

  /** A step's line in its workflow's text, for a message alone: no row holds a line. */
  function stepLine(text: string, job: string, id: string): number | undefined {
    const counter = new LineCounter();
    const steps = parseDocument(text, { lineCounter: counter }).getIn(['jobs', job, 'steps']);
    const item = isSeq(steps) ? steps.items.find((entry) => isMap(entry) && entry.get('id') === id) : undefined;
    return isMap(item) && item.range !== undefined && item.range !== null ? counter.linePos(item.range[0]).line : undefined;
  }

  /** A line of a script's own that writes an output, echo "name=…", its name a template of literals and $VARs. */
  const OWN_OUTPUT_LINE = /\becho "((?:[\w-]|\$\{?[A-Za-z_]\w*\}?)+)=/;

  /**
   * The output names a `run:` step's own script writes to $GITHUB_OUTPUT (echo "name=…"), each $VAR whose env is one
   * matrix value spelled out by every value of that key: sha256_$IMAGE= from matrix.image gives sha256_web, … . Only a
   * key the row names is spelled out.
   */
  function writtenOutputs(step: Step, job: Job, keys: readonly string[]): Set<string> {
    const names = new Set<string>();
    const run = step.run ?? '';
    if (!run.includes('GITHUB_OUTPUT')) return names;
    for (const [, template = ''] of run.matchAll(new RegExp(OWN_OUTPUT_LINE.source, 'g'))) {
      let spelled = [''];
      for (const [, literal, variable] of template.matchAll(/([\w-]+)|\$\{?([A-Za-z_]\w*)\}?/g)) {
        if (literal !== undefined) {
          spelled = spelled.map((name) => name + literal);
          continue;
        }
        const key = MATRIX_REFERENCE.exec(String(step.env?.[variable ?? ''] ?? ''))?.[1];
        const values = key !== undefined && keys.includes(key) ? matrixValues(job.strategy?.matrix, key) : undefined;
        spelled = values === undefined ? [] : spelled.flatMap((name) => values.map((value) => name + String(value)));
      }
      for (const name of spelled) names.add(name.toLowerCase());
    }
    return names;
  }

  /** A job's needs as a list. */
  const needsOf = (job: Job | undefined): string[] => (job?.needs === undefined ? [] : [job.needs].flat().map(String));
  /** A job's declared output names. */
  const outputsOf = (job: Job | undefined): string[] => {
    const declared = (job as { readonly outputs?: unknown } | undefined)?.outputs;
    return isRecord(declared) ? Object.keys(declared) : [];
  };
  /** What a job's output declares, as written. */
  const jobOutput = (job: Job | undefined, name: string): unknown => {
    const declared = (job as { readonly outputs?: unknown } | undefined)?.outputs;
    return isRecord(declared) ? declared[name] : undefined;
  };
  /** The value a job's output hands on when it is exactly one ${{ }} reading a step's or a needed job's output, as the table keys it. */
  function handedValue(declared: unknown): string | undefined {
    const whole = typeof declared === 'string' ? /^\$\{\{((?:(?!\}\})[\s\S])*)\}\}$/.exec(declared) : null;
    if (whole === null) return undefined;
    try {
      const names = namesOf(parseExpression(lexExpression(whole[1] ?? '')));
      return names?.length === 4 && (names[0] === 'steps' || names[0] === 'needs') && names[2] === 'outputs' ? names.join('.').toLowerCase() : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * The steps, needed jobs and job outputs a row's value reads, as refProblems names them: a steps.<id> value (or a
   * build's digest from one) its own job's step <id>; a needs.<j>.outputs.<n> value job <j> and its output <n>; toJSON
   * each job it is given and every output of each. What the row must cite, and all of those kinds it may.
   */
  function producersOf(row: BoundedValue, jobs: Readonly<Record<string, Job>>): string[] {
    const step = /^(?:fromjson\()?steps\.([^.]+)\.outputs\./.exec(row.value);
    if (step !== null) return [`step ${step[1] ?? ''} of job ${row.job.toLowerCase()}`];
    const handed = /^needs\.([^.]+)\.outputs\.([^.]+)$/.exec(row.value);
    if (handed !== null) return [`needed job ${handed[1] ?? ''}`, `output ${handed[2] ?? ''} of job ${handed[1] ?? ''}`];
    const whole = /^tojson\(needs(?:\.([^.]+)\.outputs)?\)$/.exec(row.value);
    const given = whole === null ? [] : whole[1] === undefined ? needsOf(jobs[row.job]).map((job) => job.toLowerCase()) : [whole[1]];
    return given.flatMap((job) => [`needed job ${job}`, ...outputsOf(jobNamed(jobs, job)).map((name) => `output ${name.toLowerCase()} of job ${job}`)]);
  }

  /**
   * The job an id names as an expression reads it, in any case (needs.Build and needs.build are one job): a row's value
   * is in lower case, its jobs as written, so every lookup from a value goes through this.
   */
  const jobNamed = (jobs: Readonly<Record<string, Job>>, id: string): Job | undefined => Object.entries(jobs).find(([key]) => key.toLowerCase() === id.toLowerCase())?.[1];

  /**
   * What does not resolve of each row's references on these workflows (text gives a file's) and this repository's
   * tool code (source gives a file's): each named for its row, with a line where one helps.
   */
  function refProblems(rows: readonly BoundedValue[], found: readonly FoundValue[], text: (file: string) => string, source: (file: string) => string | undefined = repositorySource): string[] {
    const problems: string[] = [];
    // Each file read and parsed once, each module's names and each test file's titles read once, for every row.
    const once = <T>(cache: Map<string, T>, key: string, make: () => T): T => {
      if (!cache.has(key)) cache.set(key, make());
      return cache.get(key) as T;
    };
    const texts = new Map<string, string>();
    const parsed = new Map<string, Workflow>();
    const names = new Map<string, Set<string>>();
    const titled = new Map<string, Set<string>>();
    for (const row of rows) {
      const say = (problem: string) => problems.push(`${row.file} ${row.job} ${row.value}: ${problem}`);
      const workflowText = once(texts, row.file, () => text(row.file));
      const root = once(parsed, row.file, () => parse(workflowText) as Workflow);
      const jobs = root.jobs;
      const reader = jobs[row.job];
      if (row.refs.length === 0) say('names no producer');
      const read = found.filter((entry) => entry.file === row.file && entry.job === row.job && entry.value === row.value);
      const keys = row.refs.flatMap((ref) => (ref.kind === 'matrix' ? [ref.key] : []));
      for (const ref of row.refs) {
        switch (ref.kind) {
          case 'step': {
            const steps = jobs[ref.job]?.steps ?? [];
            const index = steps.findIndex((step) => step.id === ref.step);
            const step = steps[index];
            if (step === undefined) {
              say(`job ${ref.job} has no step ${ref.step}`);
              break;
            }
            // Its line, for a message alone, found only when one is written.
            const where = (): string => `step ${ref.step} of job ${ref.job} (${row.file}:${String(stepLine(workflowText, ref.job, ref.step) ?? '?')})`;
            if ('run' in ref) {
              const now = step.run === undefined ? undefined : fingerprint(step, jobs[ref.job], root);
              if (now === undefined) say(`${where()} runs no script to fingerprint`);
              else if (now !== ref.run) say(`${where()} has a changed script, env, shell, working-directory or container, its own or inherited, fingerprint ${now}, not ${ref.run}: re-check the bound against it, then write ${now} in this row`);
            } else if (actionOf(step) !== ref.uses) {
              say(`${where()} uses ${actionOf(step) ?? 'no action'}, not ${ref.uses}`);
            }
            if (ref.job === row.job) {
              for (const entry of read) if (entry.step !== undefined && entry.step <= index) say(`${where()} does not come before the step that reads it`);
              const name = new RegExp(`^steps\\.${escaped(ref.step.toLowerCase())}\\.outputs\\.([^.]+)$`).exec(row.value)?.[1];
              const written = 'run' in ref ? writtenOutputs(step, jobs[ref.job] ?? { steps: [] }, keys) : undefined;
              // A script that writes NAME= lines of its own must spell this one out (a $VAR from the cited matrix key);
              // a tool the row names excuses only a script that writes none, the tool writing $GITHUB_OUTPUT itself.
              if (name !== undefined && written !== undefined && !written.has(name)) {
                if (OWN_OUTPUT_LINE.test(step.run ?? '')) say(`${where()} writes no ${name}= to $GITHUB_OUTPUT: its own lines spell ${[...written].sort().join(', ') || 'none'}`);
                else if (!row.refs.some((other) => other.kind === 'symbol')) say(`${where()} writes no ${name}= to $GITHUB_OUTPUT, and the row names no tool that does`);
              }
            }
            break;
          }
          case 'output': {
            if (!outputsOf(jobs[ref.job]).includes(ref.name)) {
              say(`job ${ref.job} declares no output ${ref.name}`);
              break;
            }
            // What the output declares is one step's or needed job's output alone, with its own row in that job, whose
            // bound this row's holds: a repointed or joined output turns the row red, so no reader's sum undercounts.
            const declared = jobOutput(jobs[ref.job], ref.name);
            const given = handedValue(declared);
            const producer = rows.find((entry) => entry.file === row.file && entry.job === ref.job && entry.value === given);
            if (given === undefined) say(`job ${ref.job}'s output ${ref.name} is ${JSON.stringify(declared)}, not one step's or needed job's output alone`);
            else if (producer === undefined) say(`job ${ref.job}'s output ${ref.name} reads ${given}, which has no row in job ${ref.job}`);
            else if (producer.bytes > row.bytes) say(`job ${ref.job}'s output ${ref.name} reads ${given}, bounded at ${String(producer.bytes)} bytes, over this row's ${String(row.bytes)}`);
            break;
          }
          case 'matrix': {
            const matrix = jobs[ref.job]?.strategy?.matrix;
            const include = isRecord(matrix) && isList(matrix.include) ? matrix.include : [];
            if (!isRecord(matrix) || !(Object.hasOwn(matrix, ref.key) || include.some((entry) => isRecord(entry) && Object.hasOwn(entry, ref.key)))) say(`job ${ref.job}'s matrix has no key ${ref.key}`);
            break;
          }
          case 'needs':
            if (jobs[ref.job] === undefined || !needsOf(reader).includes(ref.job)) say(`job ${row.job} does not need a job ${ref.job}`);
            break;
          case 'symbol': {
            const code = source(ref.path);
            if (code === undefined) say(`no file ${ref.path}`);
            else if (!once(names, ref.path, () => declaredNames(ref.path, code)).has(ref.symbol)) say(`${ref.path} declares no ${ref.symbol}`);
            break;
          }
          case 'test': {
            const code = source(ref.path);
            if (code === undefined) say(`no file ${ref.path}`);
            else if (!once(titled, ref.path, () => testTitles(ref.path, code)).has(ref.name)) say(`${ref.path} has no test named "${ref.name}" that always runs`);
            break;
          }
        }
      }
      // The producers it cites are the ones its value reads, and no other step, needed job or output: each kind above
      // resolves wherever it points, so only this ties a row to its own producer, and the output check above (one
      // value alone, within this row's bytes) runs for every value one job hands another.
      const wanted = producersOf(row, jobs);
      const cited = row.refs.flatMap((ref) => (ref.kind === 'step' ? [`step ${ref.step.toLowerCase()} of job ${ref.job.toLowerCase()}`] : ref.kind === 'needs' ? [`needed job ${ref.job.toLowerCase()}`] : ref.kind === 'output' ? [`output ${ref.name.toLowerCase()} of job ${ref.job.toLowerCase()}`] : []));
      for (const producer of wanted) if (!cited.includes(producer)) say(`names no ${producer}`);
      for (const producer of cited) if (!wanted.includes(producer)) say(`names ${producer}, which its value does not read`);
      // A row with sites is read there and nowhere else, so a second use of the value, under any name, is refused.
      const places = read.map((entry) => entry.where).sort();
      if (row.sites !== undefined && places.join('\n') !== [...row.sites].sort().join('\n')) say(`read at ${places.join(', ')}, not exactly at its sites, ${row.sites.join(', ')}`);
      // Tool code is never fingerprinted, so the row names the test that holds its bound.
      if (row.refs.some((ref) => ref.kind === 'symbol') && !row.refs.some((ref) => ref.kind === 'test')) say('names tool code but no test that proves its bound');
      // toJSON reads every job it is given and every output of each (the row names them all, and no other, above),
      // and holds what it writes of them: each output quoted and escaped, up to six bytes for each of its bound's,
      // with its name and indent (toJsonBytes), and for needs each job's own lines.
      const whole = /^tojson\(needs(?:\.([^.]+)\.outputs)?\)$/.exec(row.value);
      if (whole !== null) {
        // An output with no row counts nothing here: the row must cite it (above), and the cited output's check refuses one
        // with no row or not one value alone.
        const bounds = (job: string): Record<string, number> => Object.fromEntries(outputsOf(jobNamed(jobs, job)).map((name) => [name, rows.find((entry) => entry.file === row.file && entry.job.toLowerCase() === job.toLowerCase() && entry.value === handedValue(jobOutput(jobNamed(jobs, job), name)))?.bytes ?? 0]));
        const most = whole[1] === undefined ? needsJsonBytes(Object.fromEntries(needsOf(reader).map((job) => [job, bounds(job)]))) : toJsonBytes(bounds(whole[1]));
        if (most > row.bytes) say(`toJSON writes up to ${String(most)} bytes of what it reads, each output quoted and escaped, over this row's ${String(row.bytes)}`);
      }
    }
    return problems;
  }

  it('hands a step another step’s or job’s output only from the list below, each with its bound', () => {
    const key = ({ file, job, value }: ValueKey) => `${file} ${job} ${value}`;
    const values = workflowFiles().flatMap((file) => unboundedValueProblems(file, workflow(file)).values);
    const found = new Set(values.map(key));
    expect([...found].sort()).toEqual(BOUNDED_VALUES.map(key).sort());
    // Each row names its producers by what they are, never by a line (a line goes stale with any edit above it), and
    // each resolves on this tree.
    for (const row of BOUNDED_VALUES) expect(row.bound, key(row)).not.toMatch(/\.(?:ya?ml|ts|mjs|sh):\d+/);
    // Each with its bound in bytes, which the environment strings that hold it add.
    expect(BOUNDED_VALUES.filter((row) => !Number.isSafeInteger(row.bytes) || row.bytes <= 0).map(key)).toEqual([]);
    expect(refProblems(BOUNDED_VALUES, values, (file) => readFileSync(path.join(WORKFLOWS, file), 'utf8'))).toEqual([]);
    // ci.yml's gate reads toJSON(needs): results alone, since no ci.yml job declares outputs.
    expect(Object.entries(workflow('ci.yml').jobs).filter(([, job]) => 'outputs' in job).map(([id]) => id)).toEqual([]);
    // No row is over the limit: the content calendar hands its findings on as the run's own artifact, so its jobs
    // declare no outputs and no workflow reads FINDINGS_B64 (ci-findings-transport, docs/adr/0071, Amendment).
    expect(Object.entries(workflow('content-calendar.yml').jobs).filter(([, job]) => 'outputs' in job).map(([id]) => id)).toEqual([]);
    expect(workflowFiles().filter((file) => readFileSync(path.join(WORKFLOWS, file), 'utf8').includes('FINDINGS_B64'))).toEqual([]);
    // Every row that could pass the limit is held to its sites, whether it is read in a script, a job output or an
    // environment string, so a second use of any of them, under any name, is refused by refProblems above.
    expect(BOUNDED_VALUES.filter((row) => row.bytes > MAX_ARG_STRLEN && row.sites === undefined).map(key)).toEqual([]);
  });

  it('holds a row with sites to exactly those places, so a second use of a value that could pass the limit, under any name or key, turns the table red', () => {
    const text = (more: string) =>
      `name: fixture\non: push\njobs:\n  check:\n    runs-on: ubuntu-26.04\n    outputs:\n      findings: \${{ steps.calendar.outputs.findings }}\n    steps:\n      - name: Read the calendar\n        id: calendar\n        run: echo "findings=x" >> "$GITHUB_OUTPUT"\n  notify:\n    needs: check\n    runs-on: ubuntu-26.04\n    steps:\n      - name: Open an issue\n        env: { FINDINGS_B64: "\${{ needs.check.outputs.findings }}" }\n        run: echo\n${more}`;
    const rows: BoundedValue[] = [
      { file: 'fixture.yml', job: 'check', value: 'steps.calendar.outputs.findings', refs: [script('check', 'calendar', fingerprint({ run: 'echo "findings=x" >> "$GITHUB_OUTPUT"' }))], bound: 'a fixture', bytes: 933_336, sites: ['job check outputs.findings'] },
      { file: 'fixture.yml', job: 'notify', value: 'needs.check.outputs.findings', refs: [needs('check'), output('check', 'findings')], bound: 'a fixture', bytes: 933_336, sites: ['job notify step "Open an issue" env.FINDINGS_B64'] },
    ];
    const problems = (yaml: string) => refProblems(rows, unboundedValueProblems('fixture.yml', parse(yaml)).values, () => yaml);
    expect(problems(text(''))).toEqual([]);
    expect(problems(text('      - name: Copy them\n        env: { FINDINGS_COPY: "${{ needs.check.outputs.findings }}" }\n        run: echo\n'))).toEqual([
      'fixture.yml notify needs.check.outputs.findings: read at job notify step "Copy them" env.FINDINGS_COPY, job notify step "Open an issue" env.FINDINGS_B64, not exactly at its sites, job notify step "Open an issue" env.FINDINGS_B64',
    ]);
    expect(problems(text('      - name: Upload them\n        uses: actions/fixture@v1\n        with: { path: "${{ needs.check.outputs.findings }}" }\n'))).toEqual([
      'fixture.yml notify needs.check.outputs.findings: read at job notify step "Open an issue" env.FINDINGS_B64, job notify step "Upload them" with.path, not exactly at its sites, job notify step "Open an issue" env.FINDINGS_B64',
    ]);
    // A second step of the same name reading it under the same key: the same place twice, so each read is counted.
    expect(problems(text('      - name: Open an issue\n        env: { FINDINGS_B64: "${{ needs.check.outputs.findings }}" }\n        run: echo again\n'))).toEqual([
      'fixture.yml notify needs.check.outputs.findings: read at job notify step "Open an issue" env.FINDINGS_B64, job notify step "Open an issue" env.FINDINGS_B64, not exactly at its sites, job notify step "Open an issue" env.FINDINGS_B64',
    ]);
    // Every row with sites is held the same way, in its own job too: a second read of check's findings.
    const second = text('').replace('        run: echo "findings=x" >> "$GITHUB_OUTPUT"\n', '        run: echo "findings=x" >> "$GITHUB_OUTPUT"\n      - name: Copy them\n        env: { COPY: "${{ steps.calendar.outputs.findings }}" }\n        run: echo\n');
    expect(problems(second)).toEqual(['fixture.yml check steps.calendar.outputs.findings: read at job check outputs.findings, job check step "Copy them" env.COPY, not exactly at its sites, job check outputs.findings']);
  });

  it('resolves each row’s producers by name, so a renamed step, a changed script, a removed output or a deleted symbol or test turns the table red, and an edit elsewhere in a file does not', () => {
    const workflowText = [
      'name: fixture',
      'on: push',
      'jobs:',
      '  build:',
      '    runs-on: ubuntu-26.04',
      '    strategy: { matrix: { image: [web, worker] } }',
      '    outputs:',
      '      digest_web: ${{ steps.identity.outputs.digest_web }}',
      '    steps:',
      '      - name: Record the identity',
      '        id: identity',
      '        env: { IMAGE: "${{ matrix.image }}" }',
      '        run: echo "digest_$IMAGE=$(node tools/fixture.ts)" >> "$GITHUB_OUTPUT"',
      '      - name: Read it',
      '        env: { DIGEST: "${{ steps.identity.outputs.digest_web }}" }',
      '        run: echo "$DIGEST"',
      '      - name: Restore the cache',
      '        id: cache',
      '        uses: actions/cache/restore@v5',
      '        with: { path: cache, key: "${{ runner.os }}" }',
      '      - name: Name its key',
      '        env: { KEY: "${{ steps.cache.outputs.cache-primary-key }}" }',
      '        run: echo "$KEY"',
      '  use:',
      '    needs: build',
      '    runs-on: ubuntu-26.04',
      '    steps:',
      '      - env: { DIGEST: "${{ needs.build.outputs.digest_web }}" }',
      '        run: echo "$DIGEST"',
      '',
    ].join('\n');
    const run = 'echo "digest_$IMAGE=$(node tools/fixture.ts)" >> "$GITHUB_OUTPUT"';
    const tool = 'export function digest(): string {\n  return "";\n}\n';
    const tests = "it('proves the digest', () => {});\n";
    const rows: BoundedValue[] = [
      {
        file: 'fixture.yml',
        job: 'build',
        value: 'steps.identity.outputs.digest_web',
        refs: [script('build', 'identity', fingerprint({ run, env: { IMAGE: '${{ matrix.image }}' } })), { kind: 'matrix', job: 'build', key: 'image' }, symbol('tools/fixture.ts#digest'), unitTest('tools/fixture.test.ts', 'proves the digest')],
        bound: 'a digest',
        bytes: 71,
      },
      { file: 'fixture.yml', job: 'use', value: 'needs.build.outputs.digest_web', refs: [needs('build'), output('build', 'digest_web')], bound: 'a digest', bytes: 71 },
      { file: 'fixture.yml', job: 'build', value: 'steps.cache.outputs.cache-primary-key', refs: [action('build', 'cache', 'actions/cache/restore')], bound: 'a key', bytes: 2_048 },
    ];
    const problems = (text: string, files: Readonly<Record<string, string>> = { 'tools/fixture.ts': tool, 'tools/fixture.test.ts': tests }, table: readonly BoundedValue[] = rows) =>
      refProblems(table, unboundedValueProblems('fixture.yml', parse(text)).values, () => text, (file) => files[file]);
    expect(problems(workflowText)).toEqual([]);
    // An edit elsewhere in the file, a comment above the producer, moves no reference, and the producer's env restyled
    // reads the same.
    expect(problems(workflowText.replace('      - name: Record the identity', '      # A comment above the producer.\n      - name: Record the identity'))).toEqual([]);
    expect(problems(workflowText.replace('        env: { IMAGE: "${{ matrix.image }}" }\n        run: echo "digest', '        env:\n          IMAGE: ${{ matrix.image }}\n        run: echo "digest'))).toEqual([]);
    // Another job's env or defaults are no input of the producer's.
    expect(problems(workflowText.replace('    needs: build\n', '    needs: build\n    env: { BASE: x }\n    defaults: { run: { shell: sh } }\n'))).toEqual([]);
    const [produced, handed] = rows;
    if (produced === undefined || handed === undefined) throw new Error('two rows');
    // A uses: producer is its action: another action, or a script in its place, turns its row red.
    const restore = 'fixture.yml build steps.cache.outputs.cache-primary-key: step cache of job build (fixture.yml:17)';
    expect(problems(workflowText.replace('uses: actions/cache/restore@v5', 'uses: actions/cache@v5'))).toEqual([`${restore} uses actions/cache, not actions/cache/restore`]);
    expect(problems(workflowText.replace('        uses: actions/cache/restore@v5\n        with: { path: cache, key: "${{ runner.os }}" }', '        run: echo "cache-primary-key=x" >> "$GITHUB_OUTPUT"'))).toEqual([`${restore} uses no action, not actions/cache/restore`]);
    expect(problems(workflowText.replace('uses: actions/cache/restore@v5', 'uses: actions/cache/restore@v5.0.1'))).toEqual([]);
    // A name the script does not write: its own lines spell it or it fails, so the last case fails with or without the
    // row's tool (both below).
    const scriptOnly = [{ ...produced, refs: produced.refs.filter((ref) => ref.kind !== 'symbol') }, handed];
    const CHANGED = /^fixture\.yml build steps\.identity\.outputs\.digest_web: step identity of job build \(fixture\.yml:10\) has a changed script, env, shell, working-directory or container, its own or inherited, fingerprint [0-9a-f]{8}, not [0-9a-f]{8}: re-check the bound against it, then write [0-9a-f]{8} in this row$/;
    const RED: readonly (readonly [string, string, RegExp])[] = [
      ['a renamed step id', workflowText.replace('id: identity', 'id: identities'), /^fixture\.yml build steps\.identity\.outputs\.digest_web: job build has no step identity$/],
      ['a changed script', workflowText.replace('$(node tools/fixture.ts)', '$(git log -1 --format=%B)'), CHANGED],
      ['a changed env', workflowText.replace('env: { IMAGE: "${{ matrix.image }}" }', 'env: { IMAGE: "${{ matrix.image }}", BASE: "${{ github.sha }}" }'), CHANGED],
      ['a shell', workflowText.replace('        id: identity\n', '        id: identity\n        shell: python {0}\n'), CHANGED],
      ['a working directory', workflowText.replace('        id: identity\n', '        id: identity\n        working-directory: apps/web\n'), CHANGED],
      // What the step inherits is its input too: its job's or the workflow's env, a default shell or directory, a container.
      ['a job env', workflowText.replace('  use:\n', '    env: { BASE: "${{ github.sha }}" }\n  use:\n'), CHANGED],
      ['a workflow env', `${workflowText}env: { BASE: "\${{ github.sha }}" }\n`, CHANGED],
      ['a job default shell', workflowText.replace('  use:\n', '    defaults: { run: { shell: sh } }\n  use:\n'), CHANGED],
      ['a workflow default working directory', `${workflowText}defaults: { run: { working-directory: apps/web } }\n`, CHANGED],
      ['a job container', workflowText.replace('  use:\n', '    container: node:24\n  use:\n'), CHANGED],
      ['a removed job output', workflowText.replace('    outputs:\n      digest_web: ${{ steps.identity.outputs.digest_web }}\n', ''), /^fixture\.yml use needs\.build\.outputs\.digest_web: job build declares no output digest_web$/],
      ['a need removed', workflowText.replace('    needs: build\n', ''), /^fixture\.yml use needs\.build\.outputs\.digest_web: job use does not need a job build$/],
      ['the producer after its reader', workflowText.replace(/( {6}- name: Record the identity\n(?: {8}.*\n){3})( {6}- name: Read it\n(?: {8}.*\n){2})/, '$2$1'), /^fixture\.yml build steps\.identity\.outputs\.digest_web: step identity of job build \(fixture\.yml:13\) does not come before the step that reads it$/],
      ['a template its matrix does not spell', workflowText.replace('[web, worker]', '[api, worker]'), /^fixture\.yml build steps\.identity\.outputs\.digest_web: step identity of job build \(fixture\.yml:10\) writes no digest_web= to \$GITHUB_OUTPUT: its own lines spell digest_api, digest_worker$/],
    ];
    for (const [what, text, message] of RED) expect(problems(text, undefined, scriptOnly), what).toEqual([expect.stringMatching(message)]);
    // A script that writes its own NAME= lines is held to them even when the row names a tool: its template, its matrix
    // and its env must spell the name. A tool excuses only a script that writes none (the tool writes the output).
    const spelled = (names: string) => `fixture.yml build steps.identity.outputs.digest_web: step identity of job build (fixture.yml:10) writes no digest_web= to $GITHUB_OUTPUT: its own lines spell ${names}`;
    expect(problems(workflowText.replace('[web, worker]', '[api, worker]'))).toEqual([spelled('digest_api, digest_worker')]);
    // Its env no longer the matrix key alone: a changed input (the fingerprint) and a name no line spells.
    expect(problems(workflowText.replace('IMAGE: "${{ matrix.image }}"', 'IMAGE: "${{ matrix.image }}-x"'))).toEqual([expect.stringMatching(CHANGED), spelled('none')]);
    const viaTool = workflowText.replace(run, 'node tools/fixture.ts >> "$GITHUB_OUTPUT"');
    const toolStep = script('build', 'identity', fingerprint({ run: 'node tools/fixture.ts >> "$GITHUB_OUTPUT"', env: { IMAGE: '${{ matrix.image }}' } }));
    expect(problems(viaTool, undefined, [{ ...produced, refs: [toolStep, ...produced.refs.slice(1)] }])).toEqual([]);
    expect(problems(viaTool, undefined, [{ ...produced, refs: [toolStep] }])).toEqual(['fixture.yml build steps.identity.outputs.digest_web: step identity of job build (fixture.yml:10) writes no digest_web= to $GITHUB_OUTPUT, and the row names no tool that does']);
    // Tool code: a deleted symbol, a deleted or renamed test, and a symbol without a test.
    expect(problems(workflowText, { 'tools/fixture.ts': 'export function digests(): string {\n  return "";\n}\n', 'tools/fixture.test.ts': tests })).toEqual(['fixture.yml build steps.identity.outputs.digest_web: tools/fixture.ts declares no digest']);
    expect(problems(workflowText, { 'tools/fixture.ts': tool, 'tools/fixture.test.ts': "it('proves a digest', () => {});\n" })).toEqual(['fixture.yml build steps.identity.outputs.digest_web: tools/fixture.test.ts has no test named "proves the digest" that always runs']);
    expect(problems(workflowText, { 'tools/fixture.ts': tool })).toEqual(['fixture.yml build steps.identity.outputs.digest_web: no file tools/fixture.test.ts']);
    // A test that may not run holds no bound: skipped, to do, conditional, inverted or inside a describe written so;
    // under an if, in a loop, a ternary or a function; skipped through its context or its options; or one of two tests
    // with its title, the other the one that runs.
    const notRun = 'fixture.yml build steps.identity.outputs.digest_web: tools/fixture.test.ts has no test named "proves the digest" that always runs';
    for (const written of [
      "it.skip('proves the digest', () => {});\n",
      "it.todo('proves the digest');\n",
      "test.skipIf(process.env.CI !== undefined)('proves the digest', () => {});\n",
      "it.runIf(false)('proves the digest', () => {});\n",
      "it.fails('proves the digest', () => {});\n",
      "describe.skip('the digest', () => {\n  it('proves the digest', () => {});\n});\n",
      "describe.skipIf(true)('the digest', () => {\n  describe('inside', () => {\n    it('proves the digest', () => {});\n  });\n});\n",
      "if (process.env.CI === undefined) {\n  it('proves the digest', () => {});\n}\n",
      "describe('the digest', () => {\n  if (Math.random() > 2) it('proves the digest', () => {});\n});\n",
      "if (process.env.NEVER) {\n  describe('the digest', () => {\n    it('proves the digest', () => {});\n  });\n}\n",
      "for (const _ of []) it('proves the digest', () => {});\n",
      "process.env.CI ? it('proves the digest', () => {}) : undefined;\n",
      "function never(): void {\n  it('proves the digest', () => {});\n}\n",
      "it('proves the digest', (context) => {\n  context.skip();\n});\n",
      "it('proves the digest', ({ skip }) => {\n  skip();\n});\n",
      "it('proves the digest', { skip: true }, () => {});\n",
      "describe('the digest', { skip: true }, () => {\n  it('proves the digest', () => {});\n});\n",
      "describe('one', () => {\n  it.skip('proves the digest', () => {});\n});\ndescribe('two', () => {\n  it('proves the digest', () => {});\n});\n",
      // A hook that skips, in the describe or at the top; a describe that may return before the test is declared.
      "describe('the digest', () => {\n  beforeEach((context) => {\n    context.skip();\n  });\n  it('proves the digest', () => {});\n});\n",
      "beforeEach((context) => {\n  context.skip();\n});\nit('proves the digest', () => {});\n",
      "if (process.env.CI) beforeEach(({ skip }) => skip());\nit('proves the digest', () => {});\n",
      "beforeAll((suite) => {\n  suite.mode = 'skip';\n});\nit('proves the digest', () => {});\n",
      "beforeEach(skipAll);\nit('proves the digest', () => {});\n",
      "describe('the digest', () => {\n  return;\n  it('proves the digest', () => {});\n});\n",
      "describe('the digest', () => {\n  if (process.env.CI === undefined) return;\n  it('proves the digest', () => {});\n});\n",
      // A skip through its context under another name, indexed, kept, handed on or taken with the rest.
      "it('proves the digest', ({ skip: s }) => {\n  s();\n});\n",
      "it('proves the digest', (c) => {\n  c['skip']();\n});\n",
      "it('proves the digest', (c) => {\n  const s = c.skip;\n  s();\n});\n",
      "it('proves the digest', (c) => {\n  stop(c);\n});\n",
      "it('proves the digest', ({ ...c }) => {\n  c.skip();\n});\n",
      "it('proves the digest', ({ task }) => {\n  task.mode = 'skip';\n});\n",
      // An it of the file's own, which may be no test.
      "const it = (..._a: unknown[]): void => undefined;\nit('proves the digest', () => {});\n",
      "import { it } from './not-vitest';\nit('proves the digest', () => {});\n",
      "import { test as it } from 'vitest';\nit('proves the digest', () => {});\n",
      "import { test } from 'vitest';\nconst it = test.skip;\nit('proves the digest', () => {});\n",
    ]) {
      expect(problems(workflowText, { 'tools/fixture.ts': tool, 'tools/fixture.test.ts': written }), written).toEqual([notRun]);
    }
    for (const written of [
      "describe('the digest', () => {\n  it.concurrent('proves the digest', () => {});\n});\n",
      "test('proves the digest', () => {});\n",
      "describe('the digest', () => {\n  describe.sequential('inside', () => {\n    it('proves the digest', async () => {}, 30_000);\n  });\n});\n",
      "it('proves the digest', { timeout: 30_000, retry: 0 }, ({ expect: check }) => {\n  check(1).toBe(1);\n});\n",
      // A context read for its expect alone, hooks that take none, an import from vitest, a return inside the test.
      "import { afterAll, beforeAll, describe, it } from 'vitest';\nbeforeAll(() => {});\nafterAll(() => {}, 10_000);\ndescribe('the digest', () => {\n  it('proves the digest', (context) => {\n    context.expect(1).toBe(1);\n    if (Date.now() < 0) return;\n  });\n});\n",
    ]) {
      expect(problems(workflowText, { 'tools/fixture.ts': tool, 'tools/fixture.test.ts': written }), written).toEqual([]);
    }
    expect(problems(workflowText, undefined, [{ ...produced, refs: produced.refs.filter((ref) => ref.kind !== 'test') }])).toEqual(['fixture.yml build steps.identity.outputs.digest_web: names tool code but no test that proves its bound']);
    // A job's output is one step's output alone, which has its row in that job, its bound within the reader's: a joined
    // or a repointed output, or a reader that claims less, turns the reading row red.
    const declared = '      digest_web: ${{ steps.identity.outputs.digest_web }}\n';
    const handedProblem = (problem: string) => `fixture.yml use needs.build.outputs.digest_web: job build's output digest_web ${problem}`;
    expect(problems(workflowText.replace(declared, '      digest_web: ${{ steps.identity.outputs.digest_web }}${{ steps.identity.outputs.digest_web }}\n'))).toEqual([
      handedProblem('is "${{ steps.identity.outputs.digest_web }}${{ steps.identity.outputs.digest_web }}", not one step\'s or needed job\'s output alone'),
    ]);
    expect(problems(workflowText.replace(declared, "      digest_web: ${{ steps.identity.outputs.digest_web || 'none' }}\n"))).toEqual([handedProblem('is "${{ steps.identity.outputs.digest_web || \'none\' }}", not one step\'s or needed job\'s output alone')]);
    expect(problems(workflowText.replace(declared, '      digest_web: ${{ steps.other.outputs.digest_web }}\n'))).toEqual([handedProblem('reads steps.other.outputs.digest_web, which has no row in job build')]);
    expect(problems(workflowText, undefined, [produced, { ...handed, bytes: 64 }])).toEqual([handedProblem('reads steps.identity.outputs.digest_web, bounded at 71 bytes, over this row\'s 64')]);
    expect(problems(workflowText.replace(declared, '      digest_web: ${{steps.identity.outputs.DIGEST_WEB}}\n'))).toEqual([]);
    // Each row cites the producers its value reads and no other, so a row that cites a step of another job, another of
    // the job's outputs, only its tool code, or leaves its producer out, turns red even where what it cites resolves.
    const tie = (row: BoundedValue, problem: string) => `fixture.yml ${row.job} ${row.value}: ${problem}`;
    const otherJob = workflowText.replace('      - env: { DIGEST: "${{ needs.build.outputs.digest_web }}" }\n', '      - id: identity\n        env: { DIGEST: "${{ needs.build.outputs.digest_web }}" }\n');
    const otherStep = script('use', 'identity', fingerprint({ run: 'echo "$DIGEST"', env: { DIGEST: '${{ needs.build.outputs.digest_web }}' } }));
    expect(problems(otherJob, undefined, [{ ...produced, refs: [otherStep, ...produced.refs.slice(1)] }, handed])).toEqual([tie(produced, 'names no step identity of job build'), tie(produced, 'names step identity of job use, which its value does not read')]);
    expect(problems(workflowText, undefined, [{ ...produced, refs: produced.refs.filter((ref) => ref.kind !== 'step') }, handed])).toEqual([tie(produced, 'names no step identity of job build')]);
    const twoOutputs = workflowText.replace(declared, `${declared}      small: \${{ steps.identity.outputs.digest_web }}\n`);
    expect(problems(twoOutputs, undefined, [produced, { ...handed, refs: [needs('build'), output('build', 'small')] }])).toEqual([tie(handed, 'names no output digest_web of job build'), tie(handed, 'names output small of job build, which its value does not read')]);
    expect(problems(workflowText, undefined, [produced, { ...handed, refs: produced.refs.filter((ref) => ref.kind === 'symbol' || ref.kind === 'test') }])).toEqual([tie(handed, 'names no needed job build'), tie(handed, 'names no output digest_web of job build')]);
    // toJSON of a job's outputs names every output, and no other, and holds them all.
    const whole = workflowText.replace('{ DIGEST: "${{ needs.build.outputs.digest_web }}" }', '{ BUILD: "${{ toJSON(needs.build.outputs) }}" }');
    // It holds what toJSON writes, each output quoted and escaped: digest_web's 71 bytes up to 426, with its name,
    // indent and the braces 449 bytes, not the 94 it writes unescaped.
    const escapedJson = toJsonBytes({ digest_web: 71 });
    expect(escapedJson).toBe(449);
    const json = (refs: readonly Ref[], bytes = escapedJson) => problems(whole, undefined, [produced, { file: 'fixture.yml', job: 'use', value: 'tojson(needs.build.outputs)', refs, bound: 'a digest', bytes }]);
    expect(json([needs('build'), output('build', 'digest_web')])).toEqual([]);
    expect(json([needs('build')])).toEqual(['fixture.yml use tojson(needs.build.outputs): names no output digest_web of job build']);
    expect(json([output('build', 'digest_web')])).toEqual(['fixture.yml use tojson(needs.build.outputs): names no needed job build']);
    const writes = (bytes: number) => `fixture.yml use tojson(needs.build.outputs): toJSON writes up to 449 bytes of what it reads, each output quoted and escaped, over this row's ${String(bytes)}`;
    expect(json([needs('build'), output('build', 'digest_web')], 448)).toEqual([writes(448)]);
    expect(json([needs('build'), output('build', 'digest_web')], '{\n  "digest_web": "",\n}'.length + 71)).toEqual([writes(94)]);
    expect(json([needs('build'), output('build', 'digest_web')], 70)).toEqual([
      "fixture.yml use tojson(needs.build.outputs): job build's output digest_web reads steps.identity.outputs.digest_web, bounded at 71 bytes, over this row's 70",
      writes(70),
    ]);
    // toJSON(needs) the same, each job with its id and its own lines: 554 bytes for build and its one output.
    const allNeeds = workflowText.replace('{ DIGEST: "${{ needs.build.outputs.digest_web }}" }', '{ ALL: "${{ toJSON(needs) }}" }');
    const needsRow = (bytes: number) => problems(allNeeds, undefined, [produced, { file: 'fixture.yml', job: 'use', value: 'tojson(needs)', refs: [needs('build'), output('build', 'digest_web')], bound: 'a digest', bytes }]);
    expect(needsJsonBytes({ build: { digest_web: 71 } })).toBe(554);
    expect(needsRow(554)).toEqual([]);
    expect(needsRow(553)).toEqual(["fixture.yml use tojson(needs): toJSON writes up to 554 bytes of what it reads, each output quoted and escaped, over this row's 553"]);
    // A job id with a capital letter is one job in every case an expression writes it (a row's value is in lower case):
    // its step's row and the toJSON(needs) that reads it are tied to it as for any other, so a joined output it hands on
    // is still refused.
    const capital = [
      'name: fixture', 'on: push', 'jobs:',
      '  up:', '    runs-on: ubuntu-26.04', '    outputs:', '      a: ${{ steps.s.outputs.a }}', '    steps:', '      - id: s', '        run: echo "a=x" >> "$GITHUB_OUTPUT"',
      '  Build:', '    needs: up', '    runs-on: ubuntu-26.04', '    outputs:', '      big: ${{ needs.up.outputs.a }}${{ needs.up.outputs.a }}', '    steps:',
      '      - id: identity', '        run: echo "digest=x" >> "$GITHUB_OUTPUT"', '      - env: { DIGEST: "${{ steps.identity.outputs.digest }}" }', '        run: echo "$DIGEST"',
      '  use:', '    needs: Build', '    runs-on: ubuntu-26.04', '    steps:', '      - env: { ALL: "${{ toJSON(needs) }}" }', '        run: echo "$ALL"', '',
    ].join('\n');
    const capitalRows: BoundedValue[] = [
      { file: 'fixture.yml', job: 'up', value: 'steps.s.outputs.a', refs: [script('up', 's', fingerprint({ run: 'echo "a=x" >> "$GITHUB_OUTPUT"' }))], bound: 'x', bytes: 60_000 },
      { file: 'fixture.yml', job: 'Build', value: 'needs.up.outputs.a', refs: [needs('up'), output('up', 'a')], bound: 'x', bytes: 60_000 },
      { file: 'fixture.yml', job: 'Build', value: 'steps.identity.outputs.digest', refs: [script('Build', 'identity', fingerprint({ run: 'echo "digest=x" >> "$GITHUB_OUTPUT"' }))], bound: 'x', bytes: 71 },
      { file: 'fixture.yml', job: 'use', value: 'tojson(needs)', refs: [needs('Build')], bound: 'x', bytes: 200 },
    ];
    const capitalProblems = (table: readonly BoundedValue[]) => refProblems(table, unboundedValueProblems('fixture.yml', parse(capital)).values, () => capital);
    expect(capitalProblems(capitalRows)).toEqual(['fixture.yml use tojson(needs): names no output big of job build']);
    expect(capitalProblems([...capitalRows.slice(0, 3), { ...(capitalRows[3] as BoundedValue), refs: [needs('Build'), output('Build', 'big')] }]).filter((problem) => problem.startsWith('fixture.yml use'))).toEqual([
      'fixture.yml use tojson(needs): job Build\'s output big is "${{ needs.up.outputs.a }}${{ needs.up.outputs.a }}", not one step\'s or needed job\'s output alone',
    ]);
  });

  it('sets BUILDX_METADATA_PROVENANCE: disabled on every docker/build-push-action step of every workflow, and uploads its build record only off a pull request, with no other variable, and nothing else writes or reads buildx’s metadata provenance', () => {
    // buildx v0.38.1 copies the whole event into every build record's provenance and, in its default mode (min), into
    // the metadata file build-push-action prints and outputs; disabled leaves the key out, and buildx reads the word
    // exactly (Disabled would be min). Matched in lower case: usesAction's prefix is case-sensitive.
    const steps = workflowFiles().flatMap((file) => Object.entries(workflow(file).jobs).flatMap(([id, job]) => job.steps.map((step) => ({ file, where: `${file} ${id} ${step.name ?? step.id ?? ''}`, step }))));
    // An action as the runner resolves a `uses:` (actions/runner's PipelineTemplateConverter: split at '@', then on '/'
    // and '\', empty segments dropped, the first two the repository), in lower case, so docker/build-push-action/.@<sha>
    // and Docker/Build-Push-Action@<sha> are builds too.
    const repository = (uses: string): string =>
      (uses.split('@')[0] ?? '')
        .split(/[/\\]/)
        .filter((part) => part !== '')
        .slice(0, 2)
        .join('/')
        .toLowerCase();
    const isBuild = (uses: string | undefined) => uses !== undefined && repository(uses) === 'docker/build-push-action';
    const builds = steps.filter(({ step }) => isBuild(step.uses));
    // Each build that does not set it is named; a new build that does passes, with no fixed count of them. The parsed
    // builds of each file are as many as its document's own uses: keys name (a key in a block scalar is no key), so a
    // build the parse missed, or one an alias repeats, fails, naming the file and the lines.
    expect(builds.filter(({ step }) => step.env?.BUILDX_METADATA_PROVENANCE !== 'disabled').map(({ where }) => where)).toEqual([]);
    // Each build's record (BuildKit's history, its provenance holding the whole event: a pull request's description,
    // title and labels, a push's commit messages and authors' e-mails) is an artifact any signed-in account can read in
    // this public repository for 90 days, so a pull request's run uploads none; every other run (a push's, a scheduled
    // or a dispatched one's, the release's) keeps the default, the release's record being the only full provenance of a
    // released image. build-push-action v7.4.0 reads the variable in its post step with actions-toolkit's parseBool
    // (true or false; anything else is a warning).
    expect(builds.filter(({ step }) => step.env?.DOCKER_BUILD_RECORD_UPLOAD !== "${{ github.event_name != 'pull_request' }}").map(({ where }) => where)).toEqual([]);
    // And nothing else: another of build-push-action's variables (DOCKER_BUILD_SUMMARY: false skips the record's export
    // and upload on every run) set on a build, or any DOCKER_BUILD_ or BUILDX_ variable set for a whole job (its env or
    // its container's env or options, which the runner gives every step it runs there) or workflow, where every step
    // of it would read it, is named.
    const BUILD_ENV = { BUILDX_METADATA_PROVENANCE: 'disabled', DOCKER_BUILD_RECORD_UPLOAD: "${{ github.event_name != 'pull_request' }}" };
    expect(builds.filter(({ step }) => !isDeepStrictEqual(step.env, BUILD_ENV)).map(({ where }) => where)).toEqual([]);
    const shared = workflowFiles().flatMap((file) => {
      const parsed = workflow(file) as unknown as { readonly env?: unknown; readonly jobs: Record<string, { readonly env?: unknown; readonly container?: unknown }> };
      const scopes: (readonly [string, unknown])[] = [
        [`${file} env`, parsed.env],
        ...Object.entries(parsed.jobs).flatMap(([id, job]) => [[`${file} job ${id} env`, job.env] as const, [`${file} job ${id} container.env`, isRecord(job.container) ? job.container.env : undefined] as const]),
      ];
      return scopes.flatMap(([where, env]) => Object.keys(isRecord(env) ? env : {}).filter((name) => /^(?:DOCKER_BUILD_|BUILDX_)/i.test(name)).map((name) => `${where}.${name}`));
    });
    expect(shared).toEqual([]);
    // Docker's own options set a container's env too (--env, -e, also among short flags joined, --env-file, whose file
    // no rule reads), and an options string from an expression could hold one, so a job container's options set none
    // and name no such variable; a service's, which no step runs in, name none and read no env file. A variable an
    // image's own config sets is not read: each container image is the pin rules'.
    const SETS_ENV = /(?:^|\s)(?:--env(?:-file)?(?=[=\s]|$)|-[A-Za-z]*e)|\$\{\{/;
    const NAMES_BUILD = /DOCKER_BUILD_|BUILDX_|(?:^|\s)--env-file(?=[=\s]|$)/i;
    const options = workflowFiles().flatMap((file) =>
      Object.entries(workflow(file).jobs as Record<string, { readonly container?: unknown; readonly services?: unknown }>).flatMap(([id, job]) => {
        const found: string[] = [];
        const container = isRecord(job.container) ? job.container.options : undefined;
        if (container !== undefined && (typeof container !== 'string' || SETS_ENV.test(container) || NAMES_BUILD.test(container))) found.push(`${file} job ${id} container.options: ${JSON.stringify(container)}`);
        for (const [name, service] of Object.entries(isRecord(job.services) ? job.services : {})) {
          const given = isRecord(service) ? service.options : undefined;
          if (given !== undefined && (typeof given !== 'string' || NAMES_BUILD.test(given))) found.push(`${file} job ${id} services.${name}.options: ${JSON.stringify(given)}`);
        }
        return found;
      }),
    );
    expect(options).toEqual([]);
    // The record stays home only on an event named pull_request; another whose payload carries a pull request
    // (pull_request_target, a review or a comment on one, workflow_run) would upload its description and title. So a
    // workflow that holds a build runs on a closed list of events: a push's, a pull request's, a schedule's, a dispatch's.
    const BUILD_EVENTS: ReadonlySet<string> = new Set(['push', 'pull_request', 'schedule', 'workflow_dispatch']);
    const events = (on: unknown): string[] => (typeof on === 'string' ? [on] : isList(on) ? on.map(String) : isRecord(on) ? Object.keys(on) : []);
    expect([...new Set(builds.map(({ file }) => file))].flatMap((file) => events(workflow(file).on).filter((event) => !BUILD_EVENTS.has(event)).map((event) => `${file}: holds a build and runs on ${event}`))).toEqual([]);
    expect(builds.length).toBeGreaterThan(0);
    const usesLines = (file: string): number[] => {
      const counter = new LineCounter();
      const lines: number[] = [];
      const walk = (node: unknown): void => {
        if (isMap(node) || isSeq(node)) for (const item of node.items) walk(item);
        else if (isPair(node)) {
          if (isScalar(node.key) && node.key.value === 'uses' && isScalar(node.value) && typeof node.value.value === 'string' && isBuild(node.value.value) && node.value.range) lines.push(counter.linePos(node.value.range[0]).line);
          walk(node.value);
        }
      };
      walk(parseDocument(readFileSync(path.join(WORKFLOWS, file), 'utf8'), { lineCounter: counter }).contents);
      return lines;
    };
    const unmatched = workflowFiles().flatMap((file) => {
      const parsed = builds.filter((build) => build.file === file).map(({ where }) => where);
      const lines = usesLines(file);
      const counted = (count: number, one: string, many: string) => `${String(count)} ${count === 1 ? one : many}`;
      return parsed.length === lines.length ? [] : [`${file}: ${counted(parsed.length, 'build', 'builds')} parsed (${parsed.join('; ')}), ${counted(lines.length, 'uses: key', 'uses: keys')} at ${lines.length === 1 ? 'line' : 'lines'} ${lines.join(', ')} (an alias repeats a step, or a build sits where the parse does not list it)`];
    });
    expect(unmatched).toEqual([]);
    // Nothing writes buildx's metadata another way, and nothing reads its provenance.
    expect(steps.filter(({ step }) => step.uses !== undefined && repository(step.uses) === 'docker/bake-action').map(({ where }) => where)).toEqual([]);
    expect(steps.filter(({ step }) => step.run?.includes('--metadata-file') === true).map(({ where }) => where)).toEqual([]);
    expect(workflowFiles().filter((file) => readFileSync(path.join(WORKFLOWS, file), 'utf8').includes('buildx.build.provenance'))).toEqual([]);
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

describe('Postgres from docker-compose.yml (CI-13; docs/adr/0066, Part 2)', () => {
  /** The jobs that use a database: every job that names DATABASE_URL, in its environment or a step's. */
  const databaseJobs = () =>
    workflowFiles().flatMap((file) =>
      Object.entries(workflow(file).jobs)
        .filter(([, job]) => JSON.stringify(job).includes('DATABASE_URL'))
        .map(([id, job]) => ({ where: `${file} ${id}`, job })),
    );
  /** A step that reaches the database: by DATABASE_URL, a migration, the db or e2e suites or psql. */
  const readsDatabase = (step: Step) => /DATABASE_URL|db:migrate|test:db|test:e2e|--project db|\bpsql\b/.test(`${step.run ?? ''} ${JSON.stringify(step.env ?? {})}`);
  const UP = 'tools/ci/postgres.sh up';
  const WAIT = 'tools/ci/postgres.sh wait';

  it('runs in every database job from the compose file, started right after the checkout and waited for before the first step that reaches it, with no service container in any workflow', () => {
    expect(databaseJobs().map(({ where }) => where)).toEqual(['ci.yml db', 'ci.yml domain-model', 'ci.yml e2e', 'large-zip.yml large-zip']);
    for (const file of workflowFiles()) {
      for (const [id, job] of Object.entries(workflow(file).jobs)) expect(job.services, `${file} ${id}`).toBeUndefined();
    }
    for (const { where, job } of databaseJobs()) {
      const steps = job.steps;
      expect(usesAction(steps[0] ?? {}, 'actions/checkout'), where).toBe(true);
      expect(steps[1], where).toEqual({ name: 'Start the database', run: UP });
      const wait = stepIndex(steps, (step) => step.run === WAIT);
      expect(steps.filter((step) => step.run === UP || step.run === WAIT).length, where).toBe(2);
      expect(steps[wait]?.name, where).toBe('Wait for the database');
      const first = steps.findIndex(readsDatabase);
      expect(first, where).toBeGreaterThan(wait);
      // The same URL everywhere: compose publishes 5432 with the password test.
      const urls = [...JSON.stringify(job).matchAll(/postgres:\/\/[^"\s]+/g)].map((match) => match[0]);
      expect(new Set(urls), where).toEqual(new Set(['postgres://postgres:test@localhost:5432/postgres']));
      // The database's own log as the job's last step, when anything failed: compose prints none when the job ends.
      expect(steps.at(-1), where).toEqual({ name: "The database's log", if: 'failure()', run: 'docker compose logs --no-color --tail=200 postgres' });
    }
    // No step polls the server itself: compose's --wait reads its healthcheck.
    expect(workflowFiles().flatMap((file) => Object.values(workflow(file).jobs).flatMap((job) => job.steps.filter((step) => step.run?.includes('pg_isready') === true)))).toEqual([]);
  });

  it('quiets the database’s log right after the wait, once Playwright’s browser is installed, so the pull overlaps the install', () => {
    for (const id of ['db', 'e2e']) {
      const steps = ciJob(id).steps;
      const chromium = stepIndex(steps, (step) => CHROMIUM_INSTALL.test(step.run ?? ''));
      const wait = stepIndex(steps, (step) => step.run === WAIT);
      const quiet = stepIndex(steps, (step) => step.name === "Quiet the database's log");
      expect([chromium < wait, quiet === wait + 1], id).toEqual([true, true]);
      expect(steps[quiet]?.run, id).toBe(`psql "$DATABASE_URL" -qc "ALTER SYSTEM SET log_min_messages = 'panic'" -qc "ALTER SYSTEM SET log_min_error_statement = 'panic'" -qc "SELECT pg_reload_conf()"`);
    }
  });

  it('is healthy only once the server answers on TCP, with the port and password the jobs’ URL names', () => {
    const compose = parse(readFileSync(path.join(CI_ROOT, 'docker-compose.yml'), 'utf8')) as { services: Record<string, { image?: string; environment?: Record<string, string>; ports?: string[]; healthcheck?: { test?: string[] } }> };
    const postgres = compose.services.postgres;
    // The image's first-run setup serves its Unix socket before the server listens on TCP, where the jobs connect.
    expect(postgres?.healthcheck?.test).toEqual(['CMD-SHELL', 'pg_isready -h localhost -U postgres']);
    expect(postgres?.ports).toEqual(['5432:5432']);
    expect(postgres?.environment?.POSTGRES_PASSWORD).toBe('test');
  });

  it('checks its health on the timing ci.yml’s services proved, every 2 s with 5 s to answer, 30 times, all inside the wait postgres.sh gives compose', () => {
    const compose = parse(readFileSync(path.join(CI_ROOT, 'docker-compose.yml'), 'utf8')) as { services: Record<string, { healthcheck?: Record<string, unknown> }> };
    const health = compose.services.postgres?.healthcheck;
    // The whole check, as the services' --health-interval 2s --health-timeout 5s --health-retries 30 held it.
    expect(health).toEqual({ test: ['CMD-SHELL', 'pg_isready -h localhost -U postgres'], interval: '2s', timeout: '5s', retries: 30 });
    const seconds = (value: unknown) => Number(/^(\d+)s$/.exec(String(value))?.[1] ?? Number.NaN);
    const script = readFileSync(path.join(repositoryRoot, 'tools/ci/postgres.sh'), 'utf8');
    const composeWait = Number(/--wait-timeout (\d+)/.exec(script)?.[1] ?? Number.NaN);
    const scriptWait = Number(/POSTGRES_WAIT_SECONDS:-(\d+)/.exec(script)?.[1] ?? Number.NaN);
    // Its retries run out before compose stops waiting, and compose gives its verdict before the wait step stops reading.
    expect(seconds(health?.interval) * Number(health?.retries)).toBeLessThan(composeWait);
    expect(composeWait).toBeLessThan(scriptWait);
  });
});

describe('images by digest (CI-13)', () => {
  const DIGEST_PIN = /@sha256:[0-9a-f]{64}$/;

  /** The one frontend a build may be handed: docker/dockerfile by version and digest. */
  const FRONTEND = /^docker\/dockerfile:\d+\.\d+(?:\.\d+)?@sha256:[0-9a-f]{64}$/;

  /**
   * A Dockerfile read through check-toolchain's readDockerfile, the image rule's own port of BuildKit v0.34.1's parser,
   * so CI-13 and the rule cannot read a file differently (the security review's S1 and S2, and its proposal of one
   * reader): every line placed (no JSON Dockerfile, no parse BuildKit refuses, no FROM or from= line it does not read as
   * one), a FROM at least, each FROM that is not an earlier stage by digest, and each frontend (a `# syntax=` or
   * `//syntax=` line, after a byte-order mark or a `#!` line) docker/dockerfile by version and digest: a frontend pulls
   * its image by tag on every build otherwise. The problems, or none.
   */
  function dockerfileDigestProblems(text: string): string[] {
    const read = readDockerfile(text);
    const problems = read.problems.map(({ line, message }) => `line ${String(line)}: ${message}`);
    if (read.stages.length === 0) problems.push('no FROM');
    const stages: string[] = [];
    for (const { line, image, name } of read.stages) {
      if (!stages.includes(image.toLowerCase()) && !DIGEST_PIN.test(image)) problems.push(`line ${String(line)}: FROM ${image} names no digest`);
      if (name !== null) stages.push(name.toLowerCase());
    }
    for (const { line, image } of read.frontends) if (!FRONTEND.test(image)) problems.push(`line ${String(line)}: the frontend ${image} is not docker/dockerfile:<version>@sha256:<64 hex>`);
    return problems;
  }

  it('name every base and service image with its digest, in both Dockerfiles and the compose file', () => {
    for (const app of ['web', 'worker']) expect(dockerfileDigestProblems(readFileSync(path.join(CI_ROOT, 'apps', app, 'Dockerfile'), 'utf8')), app).toEqual([]);
    const compose = parse(readFileSync(path.join(CI_ROOT, 'docker-compose.yml'), 'utf8')) as { services: Record<string, { image?: string }> };
    for (const [name, service] of Object.entries(compose.services)) expect(service.image, name).toMatch(DIGEST_PIN);
  });

  it('read a Dockerfile as BuildKit does, so a FROM or frontend that a line-by-line read misses is held to its digest, and a FROM line BuildKit does not read as one is refused (the security review’s S1, S2)', () => {
    const node = `node:24-trixie-slim@sha256:${'a'.repeat(64)}`;
    const bom = String.fromCharCode(0xfeff);
    const frontend = 'line 1: the frontend docker/dockerfile:1 is not docker/dockerfile:<version>@sha256:<64 hex>';
    const cases: readonly (readonly [string, string, readonly unknown[]])[] = [
      ['a byte-order mark before # syntax=', `${bom}# syntax=docker/dockerfile:1\nFROM ${node}\n`, [frontend]],
      ['a // syntax line', `//syntax=docker/dockerfile:1\nFROM ${node}\n`, [frontend]],
      ['an indented FROM', `FROM ${node} AS build\n  FROM synthetic/hidden:latest\n`, ['line 2: FROM synthetic/hidden:latest names no digest']],
      ['a FROM split by a continuation', `FROM ${node} AS build\nFR\\\nOM synthetic/hidden:latest\n`, ['line 2: FROM synthetic/hidden:latest names no digest']],
      ['a FROM line in a heredoc body', `FROM ${node} AS build\nRUN <<EOF\nFROM synthetic/hidden:1@sha256:${'b'.repeat(64)}\nEOF\n`, [expect.stringMatching(/^line 3: a FROM line BuildKit does not read as a FROM instruction \(a heredoc's body/)]],
    ];
    // Each of these passed the line-by-line read CI-13 had before (no problem), and each is a real FROM or frontend to BuildKit, or a line it cannot vouch for.
    for (const [what, text, problems] of cases) expect(dockerfileDigestProblems(text), what).toEqual(problems);
    // A FROM of an earlier stage names no image of its own.
    expect(dockerfileDigestProblems(`FROM ${node} AS build\nFROM build AS test\n`)).toEqual([]);
  });

  it('name every image a build runs by digest: the Dockerfile frontend (dockerfileDigestProblems, above) and the BuildKit builder, one version on every setup-buildx step (the security review\'s S4)', () => {
    // The builder: setup-buildx's docker-container driver runs moby/buildkit, by default by the mutable buildx-stable-1.
    const steps = workflowFiles().flatMap((file) => Object.entries(workflow(file).jobs).flatMap(([id, job]) => (job.steps ?? []).map((step, index) => ({ where: `${file} ${id} step ${String(index + 1)}`, file, id, index, step }))));
    const buildx = steps.filter(({ step }) => usesAction(step, 'docker/setup-buildx-action'));
    expect(buildx.map(({ file }) => file).sort()).toEqual(['ci.yml', 'release-capacity.yml', 'release-dry-run.yml', 'release.yml', 'screening-capacity.yml']);
    const images = buildx.map(({ where, step }) => {
      const opts = step.with?.['driver-opts'];
      expect(opts, where).toMatch(/^image=moby\/buildkit:v\d+\.\d+\.\d+@sha256:[0-9a-f]{64}$/);
      return opts;
    });
    expect(new Set(images).size, images.join('\n')).toBe(1);
    // Every build runs on that builder: each job that builds an image sets up buildx before its first build.
    for (const { where, file, id, index } of steps.filter(({ step }) => usesAction(step, 'docker/build-push-action'))) {
      expect(buildx.some((setup) => setup.file === file && setup.id === id && setup.index < index), where).toBe(true);
    }
    // And no job or step runs an image by tag: no container or service by tag, no docker:// action by tag.
    for (const file of workflowFiles()) {
      for (const [id, job] of Object.entries(workflow(file).jobs) as [string, Job & { container?: unknown }][]) {
        if (job.container !== undefined) expect(typeof job.container === 'string' ? job.container : (job.container as { image?: string }).image, `${file} ${id}`).toMatch(DIGEST_PIN);
        for (const step of job.steps ?? []) if (step.uses?.startsWith('docker://') === true) expect(step.uses, `${file} ${id}`).toMatch(DIGEST_PIN);
      }
    }
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
    const lint = text.replace('  lint:\n    runs-on: ubuntu-26.04\n', '  lint:\n    runs-on: ubuntu-26.04\n    continue-on-error: true\n');
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

describe('a simulated Dependabot rewrite (A4 (a); docs/adr/0066, Part 2)', () => {
  /** The files Dependabot's actions, docker and docker-compose updates rewrite, as these tests read them. */
  const CI_FILES = ['.github', 'apps/web/Dockerfile', 'apps/worker/Dockerfile', 'docker-compose.yml'];
  const PIN_REF = /\b([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*)@([0-9a-f]{40})(?: # v(\d+)\.(\d+)\.(\d+))?/g;
  const DIGEST_REF = /@sha256:([0-9a-f]{64})/g;
  const TESTS = ['tools/test/workflows.test.ts', 'tools/test/dependabot-config.test.ts', 'tools/test/no-duplicated-versions.test.ts'];

  /**
   * A copy of the CI files with every action pin replaced by another well-formed one (a new SHA, the same for every use
   * of a commit, and a higher major version) and every image digest by another, as a Dependabot update would leave them.
   */
  function rewrittenCopy(edit: (file: string, text: string) => string = (_, text) => text): { dir: string; pins: number; digests: number; originals: string[] } {
    const dir = mkdtempSync(path.join(scratch, 'rewrite-'));
    let pins = 0;
    let digests = 0;
    const originals: string[] = [];
    const rewrite = (file: string) => {
      const text = readFileSync(path.join(repositoryRoot, file), 'utf8');
      const rewritten = text
        .replace(PIN_REF, (_, action: string, commit: string, major?: string, minor?: string, patch?: string) => {
          pins += 1;
          originals.push(commit);
          const next = createHash('sha1').update(`rewrite:${commit}`).digest('hex');
          return major === undefined ? `${action}@${next}` : `${action}@${next} # v${String(Number(major) + 1)}.${minor ?? '0'}.${patch ?? '0'}`;
        })
        .replace(DIGEST_REF, (_, digest: string) => {
          digests += 1;
          originals.push(digest);
          return `@sha256:${createHash('sha256').update(`rewrite:${digest}`).digest('hex')}`;
        });
      mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
      writeFileSync(path.join(dir, file), edit(file, rewritten));
    };
    const walk = (file: string) => {
      const full = path.join(repositoryRoot, file);
      if (!existsSync(full)) return;
      if (statSync(full).isDirectory()) {
        for (const child of readdirSync(full)) walk(path.join(file, child));
      } else {
        rewrite(file);
      }
    };
    for (const file of CI_FILES) walk(file);
    return { dir, pins, digests, originals };
  }

  /** What these tests read of vitest's JSON report (--reporter=json): its counts and each test's outcome. */
  interface Report {
    readonly numTotalTests: number;
    readonly numPassedTests: number;
    readonly numFailedTests: number;
    readonly numPendingTests: number;
    readonly numTodoTests: number;
    readonly testResults: readonly { readonly name: string; readonly assertionResults: readonly { readonly fullName: string; readonly status: string; readonly failureMessages: readonly string[] }[] }[];
  }

  /**
   * vitest on these assertions with CI_TREE set to the copy: a vitest of its own, as collection.test.ts runs one. Its
   * counts are read from its JSON report, written to a scratch file, never from its printed summary, whose colour codes
   * depend on the environment (CI's runner sets FORCE_COLOR, which coloured the summary and hid the passed count:
   * run 40255481181). NO_COLOR stays as belt and braces for what it prints.
   */
  function assertionsOn(dir: string, extra: readonly string[] = []): { status: number | null; output: string; report: Report } {
    const vitest = path.join(path.dirname(createRequire(import.meta.url).resolve('vitest/package.json')), 'vitest.mjs');
    const outputFile = path.join(mkdtempSync(path.join(scratch, 'report-')), 'report.json');
    const env: NodeJS.ProcessEnv = { ...process.env, CI_TREE: dir, NO_COLOR: '1' };
    for (const name of Object.keys(env).filter((key) => key.startsWith('VITEST') || key === 'FORCE_COLOR')) Reflect.deleteProperty(env, name);
    const ran = spawnSync(process.execPath, [vitest, 'run', '--project', 'unit', '--reporter=json', `--outputFile=${outputFile}`, ...TESTS, ...extra], {
      cwd: repositoryRoot,
      env,
      encoding: 'utf8',
      timeout: 280_000,
    });
    expect(ran.error).toBeUndefined();
    const output = stripVTControlCharacters(`${ran.stdout}${ran.stderr}`);
    expect(existsSync(outputFile), output).toBe(true);
    return { status: ran.status, output, report: JSON.parse(readFileSync(outputFile, 'utf8')) as Report };
  }

  /** Every test of a report by its full name and outcome. */
  const outcomes = (report: Report) => report.testResults.flatMap((file) => file.assertionResults.map((result) => ({ file: path.relative(repositoryRoot, file.name), ...result })));

  /** The failed tests of a report with their messages, for an assertion's message: the JSON reporter prints none. */
  const failures = (report: Report) =>
    outcomes(report)
      .filter((result) => result.status === 'failed')
      .map((result) => `${result.file} > ${result.fullName}\n${result.failureMessages.join('\n')}`)
      .join('\n\n');

  const SELF = 'passes every workflow, Dependabot and version assertion with every action pin and image digest rewritten, and fails on one deliberate break, so the run reads the copy';

  // Skipped inside the run it starts, which sets CI_TREE, so it never recurses.
  it.skipIf(process.env.CI_TREE !== undefined)(
    SELF,
    () => {
      const copy = rewrittenCopy();
      expect(copy.pins).toBeGreaterThan(50);
      expect(copy.digests).toBeGreaterThan(0);
      const list = (file: string): string[] => {
        const full = path.join(copy.dir, file);
        if (!existsSync(full)) return [];
        return statSync(full).isDirectory() ? readdirSync(full).flatMap((child) => list(path.join(file, child))) : [readFileSync(full, 'utf8')];
      };
      const texts = CI_FILES.flatMap(list).join('\n');
      expect(copy.originals.filter((original) => texts.includes(original))).toEqual([]);
      // The control: the same three files on the repository's own tree, in a run started the same way, so a test that
      // skips in this environment (actionlint's where none is installed, as on CI, or any other) skips in both runs and
      // no list of them is kept here. CI's run 40269124920 failed on such a list.
      const control = assertionsOn(repositoryRoot);
      expect(control.status, `${control.output}\n${failures(control.report)}`).toBe(0);
      const green = assertionsOn(copy.dir);
      expect(green.status, `${green.output}\n${failures(green.report)}`).toBe(0);
      // Every test of the three files ran on the copy, none filtered out, and none failed.
      expect(green.report.testResults.map((file) => path.relative(repositoryRoot, file.name)).sort()).toEqual([...TESTS].sort());
      expect(green.report.numFailedTests, failures(green.report)).toBe(0);
      expect(green.report.numTotalTests).toBeGreaterThan(80);
      expect(green.report.numPassedTests).toBeGreaterThan(80);
      // The rewrite changes no outcome: each test passed or skipped on the copy exactly as on the repository's tree.
      const byName = (report: Report) => outcomes(report).map((result) => `${result.file} > ${result.fullName}: ${result.status}`).sort();
      expect(byName(green.report)).toEqual(byName(control.report));
      // What did not pass in either run only skipped, and this test was among them, skipping itself there.
      const notPassed = outcomes(green.report).filter((result) => result.status !== 'passed');
      expect(notPassed.map((result) => result.status).filter((status) => status !== 'skipped')).toEqual([]);
      expect(notPassed.map((result) => result.fullName)).toContainEqual(expect.stringContaining(SELF));

      // One checkout's persist-credentials removed: the rule that holds it fails on the copy, so the run read the copy.
      const broken = rewrittenCopy((file, text) => (file.endsWith('large-zip.yml') ? text.replace('\n        with: { persist-credentials: false }', '') : text));
      const red = assertionsOn(broken.dir, ['-t', 'keeps no token in the checkout']);
      expect(red.status, red.output).toBe(1);
      const failed = outcomes(red.report).filter((result) => result.status === 'failed');
      expect(red.report.numFailedTests).toBe(1);
      expect(failed.map((result) => result.fullName)).toEqual([expect.stringContaining('keeps no token in the checkout')]);
      expect(failed[0]?.failureMessages.join('\n')).toContain('large-zip.yml large-zip');
    },
    300_000,
  );
});

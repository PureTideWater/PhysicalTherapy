import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { isDeepStrictEqual, stripVTControlCharacters } from 'node:util';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { parse } from 'yaml';

import { consistencyProblems, formProblems, parsePin } from '../check-action-pins/workflows';
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
 * shared with eight busy loops it took 7.4 s and the slowest other test 4.0 s. Thirty seconds holds four times the
 * worst of those. A test's timeout cannot interrupt a synchronous child process, so each one the file starts is bounded
 * by the same thirty seconds and killed after it: a hung script, git or actionlint fails its test rather than holding it.
 */
const TEST_TIMEOUT_MS = 30_000;
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
    // Twenty-two on ubuntu-26.04: approval-of-record's one, ci.yml's nine, content-calendar's check and notify,
    // large-zip's one, mutation's three, publish-content's one, release-capacity's capacity and notify (its report is
    // advisory and never attested, so F5's chain does not hold it), and screening-capacity's changes, gate and notify.
    expect(Object.keys(runners).filter((job) => !RELEASE_CHAIN.includes(job))).toHaveLength(22);
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
    expect(changes?.steps[0]).toEqual({ uses: pinOf('actions/checkout'), with: { 'persist-credentials': false, 'fetch-depth': 0, filter: 'blob:none' } });
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
    expect(check?.steps[0]).toEqual({ uses: pinOf('actions/checkout'), with: { 'persist-credentials': false } });
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
      for (const run of ['pnpm actions:check', 'pnpm toolchain:check']) {
        const at = stepIndex(steps(), (step) => step.run === run);
        expect(steps().filter((step) => step.run === run), run).toHaveLength(1);
        expect([at > install, at > range], run).toEqual([true, true]);
        expect(steps()[at]?.if, run).toBe("${{ !cancelled() && steps.install.outcome == 'success' && steps.range.outcome == 'success' }}");
        expect(steps()[at]?.env, run).toEqual({ BASE: '${{ steps.range.outputs.base }}' });
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
   * (docs/adr/0066, Part 3, N29). Any other form fails the test.
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
    expect(steps[canary]?.run).toBe('pnpm stryker run tools/stryker/canary/stryker.config.mjs\npnpm -s exec tsx tools/stryker/canary/verdict.ts --shard "$TP_MUTATION_SHARD"\n');
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
      // The daily calendar check and its one issues call (docs/adr/0071).
      'content-calendar.yml': { check: 15, notify: 5 },
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
 * keys without case) and admitted only from a closed list: values GitHub or the workflow bounds, and each step output or
 * value one job hands another, listed with its bound (docs/adr/0066, Part 3, N29).
 */
describe('one environment string under Linux’s 131,072 bytes (docs/adr/0066, Part 3, N29)', () => {
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

  /** The github context's paths admitted whole: scalars GitHub bounds, the ones in use. */
  const BOUNDED_GITHUB = new Set(['actor', 'base_ref', 'event_name', 'ref', 'ref_name', 'repository', 'run_id', 'server_url', 'sha', 'token', 'event.before', 'event.pull_request.number', 'event.pull_request.base.sha', 'event.pull_request.head.sha', 'event.repository.private']);
  /**
   * Contexts admitted one level down: a runner, strategy, matrix or job value, a variable the workflow sets (each held
   * here where it is set), and a repository variable or a secret, each at most 48 KB (GitHub's documentation).
   */
  const ONE_LEVEL = new Set(['runner', 'strategy', 'matrix', 'job', 'env', 'vars', 'secrets']);
  /** The input types that bound an input; a string input has no bound GitHub documents. */
  const BOUNDED_INPUT_TYPES = new Set(['choice', 'boolean', 'number']);
  /** The only variables a script may write to $GITHUB_ENV: ci.yml's engine freeze base, a commit SHA. */
  const GITHUB_ENV_NAMES = new Set(['ENGINE_FREEZE_BASE']);
  /** A $GITHUB_ENV write in the one form admitted, its name from GITHUB_ENV_NAMES. */
  const GITHUB_ENV_WRITE = /^\s*echo "([A-Z_][A-Z0-9_]*)=[^"]*" >> "\$GITHUB_ENV"\s*$/;
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
            const [argument] = node.args;
            const names = node.args.length === 1 && argument !== undefined ? namesOf(argument) : undefined;
            if (names?.[0] === 'needs') reference(names, true);
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

  interface FoundValue {
    readonly file: string;
    readonly job: string;
    readonly value: string;
  }

  /**
   * Every expression of a workflow that reaches a process, read as the runner reads it: the workflow's env; each job's
   * env, outputs, strategy, container, services, with, secrets and defaults (its run's shell is the command the runner
   * starts); each step's env, with, run and working-directory (`if:` and `name:` reach none). GitHub's contexts table
   * names every key that takes a context. What it refuses, each naming its file, job, step and key, and the values it
   * found for BOUNDED_VALUES.
   */
  function unboundedValueProblems(file: string, parsed: unknown): { problems: string[]; values: FoundValue[] } {
    const problems: string[] = [];
    const values: FoundValue[] = [];
    const root = isRecord(parsed) ? parsed : {};
    const inputs: Record<string, unknown> = {};
    for (const trigger of ['workflow_dispatch', 'workflow_call']) {
      const on = isRecord(root.on) ? root.on[trigger] : undefined;
      const declared = isRecord(on) && isRecord(on.inputs) ? on.inputs : {};
      for (const [name, declaration] of Object.entries(declared)) inputs[name.toLowerCase()] = isRecord(declaration) ? declaration.type : undefined;
    }
    const visit = (value: unknown, where: string, job: string): void => {
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
          values.push(...found.map((entry) => ({ file, job, value: entry.toLowerCase() })));
        }
      } else if (isList(value)) {
        value.forEach((item, index) => visit(item, `${where}[${String(index)}]`, job));
      } else if (isRecord(value)) {
        for (const [key, item] of Object.entries(value)) visit(item, `${where}.${key}`, job);
      }
    };
    visit(root.env, 'env', '-');
    for (const [id, job] of Object.entries(isRecord(root.jobs) ? root.jobs : {})) {
      if (!isRecord(job)) continue;
      for (const key of ['env', 'outputs', 'strategy', 'container', 'services', 'with', 'secrets', 'defaults']) visit(job[key], `job ${id} ${key}`, id);
      (isList(job.steps) ? job.steps : []).forEach((step, index) => {
        if (!isRecord(step)) return;
        const named = `job ${id} step ${typeof step.name === 'string' ? JSON.stringify(step.name) : String(index)}`;
        for (const key of ['env', 'with', 'run', 'working-directory']) visit(step[key], `${named} ${key}`, id);
        for (const line of (typeof step.run === 'string' ? step.run : '').split('\n').filter((text) => text.includes('GITHUB_ENV'))) {
          if (!GITHUB_ENV_NAMES.has(GITHUB_ENV_WRITE.exec(line)?.[1] ?? '')) problems.push(`${file} ${named} run: a $GITHUB_ENV write outside its closed list: ${line.trim()}`);
        }
      });
    }
    return { problems, values };
  }

  it('admits into a step’s environment, an input or a script only values GitHub, the workflow or the table bounds, read as the runner reads an expression, in every workflow', () => {
    expect(workflowFiles().flatMap((file) => unboundedValueProblems(file, workflow(file)).problems)).toEqual([]);
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
      ['runner.temp', []],
      ["hashFiles('pnpm-lock.yaml')", []],
      ['inputs.runner', []],
    ];
    for (const [expression, values] of accepted) {
      expect(fixture(expression), expression).toEqual({ problems: [], values: values.map((value) => ({ file: 'fixture.yml', job: 'images', value })) });
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

    // $GITHUB_ENV: one form, its variable from a closed list.
    const write = (line: string) => unboundedValueProblems('fixture.yml', parse(`name: fixture\non: push\njobs:\n  images:\n    runs-on: ubuntu-26.04\n    steps:\n      - name: The step\n        run: |\n          ${line}\n`)).problems;
    expect(write('echo "ENGINE_FREEZE_BASE=$base" >> "$GITHUB_ENV"')).toEqual([]);
    expect(write('echo "BODY=$x" >> "$GITHUB_ENV"')).toEqual(['fixture.yml job images step "The step" run: a $GITHUB_ENV write outside its closed list: echo "BODY=$x" >> "$GITHUB_ENV"']);
    expect(write('cat file >> $GITHUB_ENV')).toEqual(['fixture.yml job images step "The step" run: a $GITHUB_ENV write outside its closed list: cat file >> $GITHUB_ENV']);
  });

  interface BoundedValue extends FoundValue {
    /** The producer and its bound, with file and line. */
    readonly bound: string;
    /** The one value known to be over the limit, and the item that owns its transport. */
    readonly over?: 'ci-findings-transport';
  }

  const runnerImage = (where: string) => `the runner image step (${where}) writes the runner image's name and version, $ImageOS-$ImageVersion and $ImageOS`;
  const cacheKey = (where: string, parts: string) => `actions/cache/restore echoes the key it was given (${where}), made of ${parts}`;
  const RUNNER_HASH = 'runner.os and a hashFiles digest';
  const APT_KEY = "the runner image's key and a hashFiles digest";
  const identity = (where: string) => `the identity step (${where}) writes the archive's SHA-256 and the config and top-level digests image-id.ts reads, each 64 hexadecimal digits`;
  const AFFECTED = 'tools/stryker/affected.ts:776 writes any (true or false), packages and shards (JSON lists of the mutation packages, stryker/base.mjs, and their shards)';
  const RELEASE_BUILD = (where: string, digests: string) => `the build job's outputs (${where}), ${digests} digests of 64 hexadecimal digits, by the identity step`;

  /**
   * Every step output and every value one job hands another that reaches a process, each with its bound: a new one fails
   * the test below until a reviewed row names its bound (docs/adr/0066, Part 3, N29).
   */
  const BOUNDED_VALUES: readonly BoundedValue[] = [
    { file: 'ci.yml', job: 'all-green', value: 'tojson(needs)', bound: 'the eight jobs it needs (ci.yml:786), each a result word, and their outputs, of which there are none: no ci.yml job declares outputs (asserted below)' },
    { file: 'ci.yml', job: 'db', value: 'steps.runner-image.outputs.key', bound: runnerImage('ci.yml:324-332') },
    { file: 'ci.yml', job: 'db', value: 'steps.runner-image.outputs.os', bound: runnerImage('ci.yml:324-332') },
    { file: 'ci.yml', job: 'db', value: 'steps.vitest-cache.outputs.cache-primary-key', bound: cacheKey('ci.yml:370', 'runner.os, strategy.job-total, matrix.shard and github.sha') },
    { file: 'ci.yml', job: 'e2e', value: 'steps.runner-image.outputs.key', bound: runnerImage('ci.yml:523-531') },
    { file: 'ci.yml', job: 'e2e', value: 'steps.runner-image.outputs.os', bound: runnerImage('ci.yml:523-531') },
    { file: 'ci.yml', job: 'images', value: "fromjson(steps.web.outputs.metadata || '{}')['containerimage.config.digest']", bound: "buildx's config digest of the web build (ci.yml:683-694), sha256: and 64 hexadecimal digits, or '' when the metadata lacks it" },
    { file: 'ci.yml', job: 'images', value: "fromjson(steps.worker.outputs.metadata || '{}')['containerimage.config.digest']", bound: "buildx's config digest of the worker build (ci.yml:707-719), sha256: and 64 hexadecimal digits, or '' when the metadata lacks it" },
    { file: 'ci.yml', job: 'static', value: 'steps.range.outputs.base', bound: 'the commits step (ci.yml:55-74) writes origin/ and the base branch, github.event.before or a commit SHA, each checked to name a commit' },
    { file: 'ci.yml', job: 'static', value: 'steps.tsc-cache.outputs.cache-primary-key', bound: cacheKey('ci.yml:146', `${RUNNER_HASH} and github.sha`) },
    { file: 'ci.yml', job: 'unit', value: 'steps.apt.outputs.cache-primary-key', bound: cacheKey('ci.yml:229', APT_KEY) },
    { file: 'ci.yml', job: 'unit', value: 'steps.browsers.outputs.cache-primary-key', bound: cacheKey('ci.yml:209', RUNNER_HASH) },
    { file: 'ci.yml', job: 'unit', value: 'steps.runner-image.outputs.key', bound: runnerImage('ci.yml:212-220') },
    { file: 'ci.yml', job: 'unit', value: 'steps.runner-image.outputs.os', bound: runnerImage('ci.yml:212-220') },
    {
      file: 'content-calendar.yml',
      job: 'check',
      value: 'steps.calendar.outputs.findings',
      bound: 'base64 of findings.json (content-calendar.yml:60), at most 700,000 bytes (MAX_FILE_BYTES, tools/content-calendar/render.ts:17-18, :127-135), so 933,336 characters: a job output, under GitHub’s 1 MB, which reaches no process in this job',
    },
    {
      file: 'content-calendar.yml',
      job: 'notify',
      value: 'needs.check.outputs.findings',
      bound: 'FINDINGS_B64 (content-calendar.yml:78), the same base64 of up to 933,336 characters: over 131,072 bytes as one environment string, the open defect whose transport is its own item',
      over: 'ci-findings-transport',
    },
    { file: 'large-zip.yml', job: 'large-zip', value: 'steps.runner-image.outputs.key', bound: runnerImage('large-zip.yml:37-45') },
    { file: 'large-zip.yml', job: 'large-zip', value: 'steps.runner-image.outputs.os', bound: runnerImage('large-zip.yml:37-45') },
    { file: 'mutation.yml', job: 'changes', value: 'steps.affected.outputs.any', bound: AFFECTED },
    { file: 'mutation.yml', job: 'changes', value: 'steps.affected.outputs.packages', bound: AFFECTED },
    { file: 'mutation.yml', job: 'changes', value: 'steps.affected.outputs.shards', bound: AFFECTED },
    { file: 'mutation.yml', job: 'mutation', value: 'needs.changes.outputs.any', bound: `the changes job's outputs (mutation.yml:44-47): ${AFFECTED}` },
    { file: 'mutation.yml', job: 'mutation', value: 'needs.changes.outputs.packages', bound: `the changes job's outputs (mutation.yml:44-47): ${AFFECTED}` },
    { file: 'mutation.yml', job: 'mutation', value: 'needs.changes.outputs.shards', bound: `the changes job's outputs (mutation.yml:44-47): ${AFFECTED}` },
    { file: 'mutation.yml', job: 'stryker', value: 'needs.changes.outputs.shards', bound: `the shards' matrix (mutation.yml:77): ${AFFECTED}` },
    {
      file: 'publish-content.yml',
      job: 'publish',
      value: 'steps.publish.outputs.releases',
      bound: 'the release numbers tools/publish-content.sh publishes (:15-19, :49), separated by spaces (publish-content.yml:48), and read in a script, which the runner writes to a file (the file is frozen to its copy)',
    },
    { file: 'release-capacity.yml', job: 'capacity', value: 'steps.measure.outputs.advisories', bound: 'base64 of at most one advisory line (tools/release-capacity/checks.ts:181-195), written by tools/release-capacity/run.ts:535-536' },
    { file: 'release-capacity.yml', job: 'notify', value: 'needs.capacity.outputs.advisories', bound: 'ADVISORIES_B64 (release-capacity.yml:140): base64 of at most one advisory line (tools/release-capacity/checks.ts:181-195)' },
    { file: 'release-dry-run.yml', job: 'build', value: 'steps.identity.outputs.config_web', bound: identity('release-dry-run.yml:163-191') },
    { file: 'release-dry-run.yml', job: 'build', value: 'steps.identity.outputs.config_worker', bound: identity('release-dry-run.yml:163-191') },
    { file: 'release-dry-run.yml', job: 'build', value: 'steps.identity.outputs.sha256_web', bound: identity('release-dry-run.yml:163-191') },
    { file: 'release-dry-run.yml', job: 'build', value: 'steps.identity.outputs.sha256_worker', bound: identity('release-dry-run.yml:163-191') },
    { file: 'release-dry-run.yml', job: 'build', value: 'steps.identity.outputs.target_web', bound: identity('release-dry-run.yml:163-191') },
    { file: 'release-dry-run.yml', job: 'build', value: 'steps.identity.outputs.target_worker', bound: identity('release-dry-run.yml:163-191') },
    { file: 'release-dry-run.yml', job: 'build', value: 'steps.image.outputs.dockerfile', bound: 'one of two Dockerfile paths (release-dry-run.yml:101-104)' },
    { file: 'release-dry-run.yml', job: 'build', value: 'steps.image.outputs.origin', bound: "'' or a repository variable, at most 48 KB (release-dry-run.yml:96-109)" },
    { file: 'release-dry-run.yml', job: 'build', value: 'steps.image.outputs.ref', bound: "ghcr.io, the repository, the matrix's image and dry-run- with the run's ID (release-dry-run.yml:99)" },
    { file: 'release-dry-run.yml', job: 'capacity', value: 'tojson(needs.build.outputs)', bound: RELEASE_BUILD('release-dry-run.yml:70-76', 'six') },
    { file: 'release-dry-run.yml', job: 'push', value: 'tojson(needs.build.outputs)', bound: RELEASE_BUILD('release-dry-run.yml:70-76', 'six') },
    { file: 'release.yml', job: 'build', value: 'steps.identity.outputs.config_web', bound: identity('release.yml:168-196') },
    { file: 'release.yml', job: 'build', value: 'steps.identity.outputs.config_web-production', bound: identity('release.yml:168-196') },
    { file: 'release.yml', job: 'build', value: 'steps.identity.outputs.config_web-staging', bound: identity('release.yml:168-196') },
    { file: 'release.yml', job: 'build', value: 'steps.identity.outputs.config_worker', bound: identity('release.yml:168-196') },
    { file: 'release.yml', job: 'build', value: 'steps.identity.outputs.sha256_web', bound: identity('release.yml:168-196') },
    { file: 'release.yml', job: 'build', value: 'steps.identity.outputs.sha256_web-production', bound: identity('release.yml:168-196') },
    { file: 'release.yml', job: 'build', value: 'steps.identity.outputs.sha256_web-staging', bound: identity('release.yml:168-196') },
    { file: 'release.yml', job: 'build', value: 'steps.identity.outputs.sha256_worker', bound: identity('release.yml:168-196') },
    { file: 'release.yml', job: 'build', value: 'steps.identity.outputs.target_web', bound: identity('release.yml:168-196') },
    { file: 'release.yml', job: 'build', value: 'steps.identity.outputs.target_web-production', bound: identity('release.yml:168-196') },
    { file: 'release.yml', job: 'build', value: 'steps.identity.outputs.target_web-staging', bound: identity('release.yml:168-196') },
    { file: 'release.yml', job: 'build', value: 'steps.identity.outputs.target_worker', bound: identity('release.yml:168-196') },
    { file: 'release.yml', job: 'build', value: 'steps.image.outputs.dockerfile', bound: 'one of two Dockerfile paths (release.yml:90-93)' },
    { file: 'release.yml', job: 'build', value: 'steps.image.outputs.origin', bound: "'' or a repository variable, at most 48 KB (release.yml:85-98)" },
    { file: 'release.yml', job: 'build', value: 'steps.image.outputs.ref', bound: "ghcr.io, the repository, the matrix's image and the tag's name (release.yml:88)" },
    { file: 'release.yml', job: 'capacity', value: 'tojson(needs.build.outputs)', bound: RELEASE_BUILD('release.yml:55-67', 'twelve') },
    { file: 'release.yml', job: 'push', value: 'tojson(needs.build.outputs)', bound: RELEASE_BUILD('release.yml:55-67', 'twelve') },
    { file: 'release.yml', job: 'report', value: 'steps.attest.outputs.bundle-path', bound: 'the path of the bundle actions/attest-build-provenance writes (release.yml:445-449)' },
    { file: 'screening-capacity.yml', job: 'capacity', value: 'steps.apt.outputs.cache-primary-key', bound: cacheKey('screening-capacity.yml:253', APT_KEY) },
    { file: 'screening-capacity.yml', job: 'capacity', value: 'steps.measure.outputs.sizing', bound: "one sentence of numbers and an upload's label (tools/screening-capacity/report.ts:835-838), written by run.ts:1036-1039" },
    { file: 'screening-capacity.yml', job: 'capacity', value: 'steps.measure.outputs.time-warnings', bound: 'one line per judged scenario upload of a fixed list (tools/screening-capacity/report.ts:635-639), joined (:866-867)' },
    { file: 'screening-capacity.yml', job: 'capacity', value: 'steps.runner-image.outputs.key', bound: runnerImage('screening-capacity.yml:237-245') },
    { file: 'screening-capacity.yml', job: 'capacity', value: 'steps.runner-image.outputs.os', bound: runnerImage('screening-capacity.yml:237-245') },
    { file: 'screening-capacity.yml', job: 'capacity', value: 'steps.scale-release.outputs.cache-primary-key', bound: cacheKey('screening-capacity.yml:285', 'one hashFiles digest') },
    { file: 'screening-capacity.yml', job: 'changes', value: 'steps.watched.outputs.measure', bound: 'true or false (screening-capacity.yml:88-130)' },
    { file: 'screening-capacity.yml', job: 'gate', value: 'needs.capacity.outputs.sizing', bound: "SIZING (screening-capacity.yml:350): one sentence of numbers and an upload's label (tools/screening-capacity/report.ts:835-838)" },
    { file: 'screening-capacity.yml', job: 'gate', value: 'needs.capacity.outputs.time-warnings', bound: 'TIME_WARNINGS (screening-capacity.yml:351): one line per judged scenario upload of a fixed list (tools/screening-capacity/report.ts:635-639)' },
    { file: 'screening-capacity.yml', job: 'gate', value: 'needs.changes.outputs.measure', bound: 'MEASURE (screening-capacity.yml:348): true or false (:88-130)' },
  ];

  it('hands a step another step’s or job’s output only from the list below, each with its bound', () => {
    const key = ({ file, job, value }: FoundValue) => `${file} ${job} ${value}`;
    const found = new Set(workflowFiles().flatMap((file) => unboundedValueProblems(file, workflow(file)).values.map(key)));
    expect([...found].sort()).toEqual(BOUNDED_VALUES.map(key).sort());
    // Each row names its producer's file and line.
    for (const row of BOUNDED_VALUES) expect(row.bound, key(row)).toMatch(/[\w-]+\.(?:ya?ml|ts|mjs|sh):\d+/);
    // ci.yml's gate reads toJSON(needs): results alone, since no ci.yml job declares outputs.
    expect(Object.entries(workflow('ci.yml').jobs).filter(([, job]) => 'outputs' in job).map(([id]) => id)).toEqual([]);
    // One row is over the limit, and says so: the content calendar's findings as FINDINGS_B64, base64 of a file bounded
    // at MAX_FILE_BYTES. When ci-findings-transport changes the bound or the transport, this turns red and it rewrites the row.
    expect(BOUNDED_VALUES.filter((row) => row.over !== undefined).map(key)).toEqual(['content-calendar.yml notify needs.check.outputs.findings']);
    expect(workflow('content-calendar.yml').jobs.notify?.steps.map((step) => step.env?.FINDINGS_B64).filter((value) => value !== undefined)).toEqual(['${{ needs.check.outputs.findings }}']);
    expect(4 * Math.ceil(MAX_FILE_BYTES / 3) + 'FINDINGS_B64='.length + 1).toBeGreaterThan(131_072);
  });

  it('sets BUILDX_METADATA_PROVENANCE: disabled on every docker/build-push-action step of every workflow, and nothing else writes or reads buildx’s metadata provenance', () => {
    // buildx v0.38.1 copies the whole event into every build record's provenance and, in its default mode (min), into
    // the metadata file build-push-action prints and outputs; disabled leaves the key out, and buildx reads the word
    // exactly (Disabled would be min). Matched in lower case: usesAction's prefix is case-sensitive.
    const steps = workflowFiles().flatMap((file) => Object.entries(workflow(file).jobs).flatMap(([id, job]) => job.steps.map((step) => ({ where: `${file} ${id} ${step.name ?? step.id ?? ''}`, step }))));
    const builds = steps.filter(({ step }) => step.uses?.toLowerCase().startsWith('docker/build-push-action@') === true);
    expect(builds).toHaveLength(7);
    expect(builds.filter(({ step }) => step.env?.BUILDX_METADATA_PROVENANCE !== 'disabled').map(({ where }) => where)).toEqual([]);
    // Nothing writes buildx's metadata another way, and nothing reads its provenance.
    expect(steps.filter(({ step }) => step.uses?.toLowerCase().startsWith('docker/bake-action@') === true).map(({ where }) => where)).toEqual([]);
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
  it('name every base and service image with its digest, in both Dockerfiles and the compose file', () => {
    const DIGEST = /@sha256:[0-9a-f]{64}$/;
    for (const app of ['web', 'worker']) {
      const from = readFileSync(path.join(CI_ROOT, 'apps', app, 'Dockerfile'), 'utf8')
        .split('\n')
        .filter((line) => /^FROM\s/i.test(line))
        .map((line) => line.split(/\s+/)[1] ?? '');
      expect(from.length, app).toBeGreaterThan(0);
      for (const image of from) expect(image, `${app}: ${image}`).toMatch(DIGEST);
    }
    const compose = parse(readFileSync(path.join(CI_ROOT, 'docker-compose.yml'), 'utf8')) as { services: Record<string, { image?: string }> };
    for (const [name, service] of Object.entries(compose.services)) expect(service.image, name).toMatch(DIGEST);
  });

  it('name every image a build runs by digest: the Dockerfile frontend and the BuildKit builder, one version on every setup-buildx step (the security review\'s S4)', () => {
    // The frontend: a `# syntax=` line pulls its image from Docker Hub by tag on every build, so either none (the
    // frontend built into the pinned BuildKit) or one by digest.
    for (const app of ['web', 'worker']) {
      const syntax = readFileSync(path.join(CI_ROOT, 'apps', app, 'Dockerfile'), 'utf8')
        .split('\n')
        .filter((line) => /^#\s*syntax\s*=/i.test(line));
      for (const line of syntax) expect(line, app).toMatch(/^# syntax=docker\/dockerfile:\d+\.\d+(?:\.\d+)?@sha256:[0-9a-f]{64}$/);
    }
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

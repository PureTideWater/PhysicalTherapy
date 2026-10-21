import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import { repositoryRoot } from '../content-files';

/**
 * The CI gates outside ci.yml (docs/adr/0010-supply-chain-gates-beside-ci.md): no Docker daemon or
 * GitHub runner exists here, so these tests read the workflow files and check that each gate is
 * wired where the plan needs it, in the right order.
 */

interface Step {
  readonly name?: string;
  readonly uses?: string;
  readonly run?: string;
  readonly with?: Record<string, unknown>;
}

interface Job {
  readonly 'runs-on'?: unknown;
  readonly uses?: string;
  readonly steps: readonly Step[];
  readonly strategy?: { readonly matrix?: Record<string, unknown> };
}

interface Workflow {
  readonly on: unknown;
  readonly jobs: Record<string, Job>;
}

function workflow(name: string): Workflow {
  return parse(readFileSync(path.join(repositoryRoot, '.github/workflows', name), 'utf8')) as Workflow;
}

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

  it('build and scan both images on every pull request, failing on HIGH or CRITICAL', () => {
    const supplyChain = workflow('supply-chain.yml');
    expect(supplyChain.on).toEqual(['pull_request']);
    const images = supplyChain.jobs.images;
    expect(images?.strategy?.matrix?.app).toEqual(['web', 'worker']);
    const steps = images?.steps ?? [];
    const build = stepIndex(steps, (step) => step.uses?.startsWith('docker/build-push-action@') === true);
    expect(steps[build]?.with).toMatchObject({ file: 'apps/${{ matrix.app }}/Dockerfile', push: false, load: true });
    const scan = stepIndex(steps, isScan);
    expect(scan).toBeGreaterThan(build);
    expect(steps[scan]?.with).toMatchObject({ severity: 'HIGH,CRITICAL' });
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

  it('check production licenses against the allowlist on every pull request', () => {
    const steps = workflow('supply-chain.yml').jobs.licenses?.steps ?? [];
    expect(steps.some((step) => step.run === 'pnpm licenses:check')).toBe(true);
  });

  it('scan each release image and write its SBOM before pushing it', () => {
    const steps = workflow('release.yml').jobs.images?.steps ?? [];
    const scan = stepIndex(steps, isScan);
    const sbom = stepIndex(steps, (step) => step.with?.format === 'spdx-json');
    const upload = stepIndex(steps, (step) => step.uses?.startsWith('actions/upload-artifact@') === true);
    const push = stepIndex(steps, (step) => step.with?.push === true);
    expect(scan).toBeLessThan(push);
    expect(sbom).toBeLessThan(push);
    expect(upload).toBeLessThan(push);
    expect(steps.filter((step) => step.with?.push === true)).toHaveLength(1);
  });

  it('run the intake test on a 2 GiB zip of 835s weekly against PostgreSQL (the milestone 3 done check)', () => {
    const large = workflow('large-zip.yml');
    expect(large.on).toMatchObject({ schedule: [{ cron: expect.any(String) as unknown }], workflow_dispatch: null });
    const steps = large.jobs['large-zip']?.steps ?? [];
    const test: (Step & { env?: Record<string, string> }) | undefined = steps.find((step) => step.run?.includes('apps/worker/src/intake/intake.large.db.test.ts') === true);
    expect(test?.env).toMatchObject({ TP_LARGE_ZIP_MB: '2048' });
  });

  it('keep the e2e suite’s report, results and brand screenshots from every pull request, failed runs included', () => {
    const steps = workflow('ci.yml').jobs.check?.steps ?? [];
    const e2e = stepIndex(steps, (step) => step.run === 'pnpm test:e2e');
    const upload = stepIndex(steps, (step) => step.uses === 'actions/upload-artifact@v4');
    expect(upload).toBe(e2e + 1);
    const step = steps[upload] as Step & { if?: string };
    expect(step.if).toBe('always()');
    // Playwright's defaults beside apps/web/playwright.config.ts (it names no outputFolder or outputDir), and the
    // brand journey's screenshots (BRAND_SCREENSHOTS_DIR's default, apps/web/e2e/brand.spec.ts).
    expect(String(step.with?.path).trim().split('\n')).toEqual(['apps/web/playwright-report/', 'apps/web/test-results/', 'brand-screenshots/']);
    const config = readFileSync(path.join(repositoryRoot, 'apps/web/playwright.config.ts'), 'utf8');
    expect(config).not.toMatch(/outputDir|outputFolder/);
    expect(readFileSync(path.join(repositoryRoot, 'apps/web/e2e/brand.spec.ts'), 'utf8')).toContain("path.resolve(import.meta.dirname, '../../../brand-screenshots')");
    // The release-immutability gate still runs, unchanged, on every pull request.
    expect(steps.some((step) => step.run === 'tools/check-releases-immutable.sh "origin/${{ github.base_ref }}"')).toBe(true);
  });

  it('print a failed run’s screenshot diffs and actuals into the job log, each under 300 KB as its path and its base64 on one line', () => {
    const steps = workflow('ci.yml').jobs.check?.steps ?? [];
    const print = stepIndex(steps, (step) => step.run?.includes('base64 -w 0') === true);
    // After the e2e step and the artifact upload, which stays right after it.
    expect(print).toBeGreaterThan(stepIndex(steps, (step) => step.run === 'pnpm test:e2e'));
    expect(print).toBeGreaterThan(stepIndex(steps, (step) => step.uses === 'actions/upload-artifact@v4'));
    const step = steps[print] as Step & { if?: string };
    expect(step.if).toBe('failure()');
    expect(step.run).toContain("find apps/web/test-results -type f \\( -name '*-diff.png' -o -name '*-actual.png' \\) -size -300k");
    expect(step.run).toContain('echo "$file $(base64 -w 0 "$file")"');
  });

  it('install Playwright’s own Chromium, with its system libraries, before the unit tests, so the worker’s print checks run and the brand baselines compare under the build that made them', () => {
    const steps = workflow('ci.yml').jobs.check?.steps ?? [];
    const install = stepIndex(steps, (step) => step.run === 'pnpm --filter @tp/web exec playwright install --with-deps chromium');
    // Right before the unit tests, which print reports with it (apps/worker/src/report/print-layout.test.ts fails in
    // CI without it), and so before the e2e suite.
    expect(install).toBe(stepIndex(steps, (step) => step.run === 'pnpm test && pnpm test:golden && pnpm test:oracle') - 1);
    expect(install).toBeLessThan(stepIndex(steps, (step) => step.run === 'pnpm test:e2e'));
    expect(install).toBeGreaterThan(stepIndex(steps, (step) => step.run === 'pnpm install --frozen-lockfile'));
    // The config takes that Chromium wherever it is installed, and Google Chrome only where it is not (docs/adr/0058).
    const config = readFileSync(path.join(repositoryRoot, 'apps/web/playwright.config.ts'), 'utf8');
    expect(config).toContain('const bundledChromium = existsSync(chromium.executablePath());');
    expect(config).toContain("...(bundledChromium ? {} : { channel: 'chrome' })");
    // The baselines the brand journey compares are committed for that browser on Linux.
    for (const name of ['header-1280', 'header-390', 'header-lockup-1280', 'header-lockup-390', 'report-cover-with-seal', 'report-cover-without-seal', 'report-cover-top']) {
      expect(existsSync(path.join(repositoryRoot, 'apps/web/e2e/brand.spec.ts-snapshots', `${name}-chromium-linux.png`)), name).toBe(true);
    }
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

  it('run the fixture check on every pull request on the commit as it is, and fail when the generation changes a committed fixture (CO-03)', () => {
    const steps = workflow('ci.yml').jobs.check?.steps ?? [];
    const check = stepIndex(steps, (step) => step.run === 'pnpm check:fixtures');
    const synth = stepIndex(steps, (step) => step.run === 'pnpm synth --all');
    // Right after the secret scan and before pnpm synth --all, which rewrites a hand-edited generated file and removes
    // an extra one, so the check reads the commit's own bytes.
    expect(check).toBe(stepIndex(steps, (step) => step.name === "Secret scan of the pull request's commits") + 1);
    expect(check).toBeLessThan(synth);
    // Right after the generation, a clean tree under fixtures/synthetic: what the commit holds is what synth writes.
    expect(steps[synth + 1]?.run).toBe('git diff --exit-code -- fixtures/synthetic && test -z "$(git status --porcelain -- fixtures/synthetic)"');
    expect(check).toBeLessThan(stepIndex(steps, (step) => step.run === 'pnpm test && pnpm test:golden && pnpm test:oracle'));
    expect(steps.filter((step) => step.run?.includes('check:fixtures') === true)).toHaveLength(1);
    const scripts = (JSON.parse(readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8')) as { scripts: Record<string, string> }).scripts;
    expect(scripts['check:fixtures']).toBe('tsx tools/fixture-check/index.ts');
  });

  it('scan the pull request’s commits with the pinned gitleaks the pre-push hook runs, never the gitleaks action, which an organization’s repository must license', () => {
    const files = readdirSync(path.join(repositoryRoot, '.github/workflows')).filter((file) => /\.ya?ml$/.test(file));
    const actions = files.flatMap((file) => Object.values(workflow(file).jobs).flatMap((job) => (job.steps ?? []).map((step) => step.uses ?? '')));
    expect(actions.filter((uses) => /gitleaks/i.test(uses))).toEqual([]);
    const steps = workflow('ci.yml').jobs.check?.steps ?? [];
    const step = steps[stepIndex(steps, (candidate) => candidate.name === "Secret scan of the pull request's commits")] as Step & { env?: Record<string, string> };
    expect(step.env).toEqual({ BASE_REF: '${{ github.base_ref }}' });
    const script = step.run ?? '';
    expect(script).toContain('gitleaks="$(tools/gitleaks/install.sh)"');
    expect(script).not.toContain('${{');
    for (const option of ['git --no-banner --redact', '--config .gitleaks.toml', '--gitleaks-ignore-path .gitleaksignore', '--log-opts "--no-color --no-ext-diff --no-textconv --diff-merges=remerge origin/$BASE_REF..HEAD" .']) {
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
    // The whole workflow reads the repository and nothing more.
    expect((parse(readFileSync(path.join(repositoryRoot, '.github/workflows/ci.yml'), 'utf8')) as { permissions?: unknown }).permissions).toEqual({ contents: 'read' });
  });

  it('write the changes since the last approved domain model into the check job’s summary, against the base branch, before any check can fail', () => {
    const steps = workflow('ci.yml').jobs.check?.steps ?? [];
    const summary = stepIndex(steps, (step) => step.run?.includes('db:domain-model --summary-since') === true);
    const step = steps[summary] as Step & { env?: Record<string, string> };
    expect(summary).toBe(stepIndex(steps, (step) => step.run === 'pnpm install --frozen-lockfile') + 1);
    // The base branch by its name from the environment, never pasted into the script; the summary is appended to the job's.
    expect(step.env).toEqual({ BASE_REF: '${{ github.base_ref }}' });
    expect(step.run).toContain('pnpm -s db:domain-model --summary-since "origin/$BASE_REF" >> "$GITHUB_STEP_SUMMARY"');
    expect(step.run).not.toContain('${{');
    // It needs the base branch's history, which the checkout fetches whole.
    expect(steps[0]?.with).toMatchObject({ 'fetch-depth': 0 });
  });

  it('run the content checker on each outgoing release before publishing it', () => {
    const steps = workflow('publish-content.yml').jobs.publish?.steps ?? [];
    const verify = stepIndex(steps, (step) => step.run?.includes('pnpm verify-content') === true);
    const publish = stepIndex(steps, (step) => step.run?.includes('tools/publish-content.sh') === true);
    expect(verify).toBeLessThan(publish);
  });

  it('measure the screening under production limits on pushes, pull requests, weekly and on request, failing on what PR 6 controls and opening an issue from a job of its own (audit #53 part 1)', () => {
    const file = readFileSync(path.join(repositoryRoot, '.github/workflows/screening-capacity.yml'), 'utf8');
    const capacity = parse(file) as Workflow & { permissions: unknown; concurrency: Record<string, unknown>; jobs: Record<string, Job & { 'timeout-minutes'?: number; needs?: unknown; if?: string; permissions?: unknown }> };
    const on = capacity.on as Record<string, { branches?: string[]; paths?: string[] } | null | { cron: string }[]>;
    expect(Object.keys(on).sort()).toEqual(['pull_request', 'push', 'schedule', 'workflow_dispatch']);
    expect(on.schedule).toEqual([{ cron: '41 6 * * 1' }]);
    expect(on.workflow_dispatch).toBeNull();
    const push = on.push as { branches: string[]; paths: string[] };
    expect(push.branches).toEqual(['claude/build-platform']);
    // Pushes measure every change that can move the result, migrations and the lockfile included.
    expect(push.paths).toEqual([
      'apps/worker/src/screening/**',
      'apps/worker/src/price/**',
      'apps/worker/src/jobs/**',
      'apps/worker/src/worker.ts',
      'apps/worker/src/mail/**',
      'apps/web/src/lib/screening/**',
      'apps/web/src/app/screening/**',
      'apps/web/src/components/screening/**',
      'apps/web/src/proxy.ts',
      'packages/pricing/src/**',
      'packages/rules/src/**',
      'packages/contracts/src/**',
      'packages/money/src/**',
      'packages/db/migrations/**',
      'packages/synth/src/release/**',
      'packages/synth/src/screening/**',
      'tools/screening-capacity/**',
      'tools/release/scale.ts',
      'infra/lib/environments.ts',
      'infra/lib/constructs/database.ts',
      'apps/web/Dockerfile',
      'apps/worker/Dockerfile',
      'pnpm-lock.yaml',
      '.github/workflows/screening-capacity.yml',
    ]);
    // Pull requests only where the screening, pricing, the harness or the images change: no lockfile, no other migration.
    expect((on.pull_request as { paths: string[] }).paths).toEqual([
      'apps/worker/src/screening/**',
      'apps/worker/src/price/**',
      'apps/web/src/lib/screening/**',
      'apps/web/src/app/screening/**',
      'apps/web/src/components/screening/**',
      'packages/pricing/src/**',
      'packages/rules/src/**',
      'packages/synth/src/release/**',
      'packages/synth/src/screening/**',
      'packages/db/migrations/*screening*.sql',
      'tools/screening-capacity/**',
      'tools/release/scale.ts',
      'infra/lib/environments.ts',
      'apps/web/Dockerfile',
      'apps/worker/Dockerfile',
      '.github/workflows/screening-capacity.yml',
    ]);
    expect(capacity.permissions).toEqual({ contents: 'read' });
    // Pushes group by commit and are never cancelled; only a pull request's older run is.
    expect(capacity.concurrency).toEqual({
      group: "screening-capacity-${{ github.event_name == 'pull_request' && github.ref || github.sha }}",
      'cancel-in-progress': "${{ github.event_name == 'pull_request' }}",
    });
    expect(Object.keys(capacity.jobs).sort()).toEqual(['capacity', 'notify']);
    const measure = capacity.jobs.capacity;
    expect(measure?.['runs-on']).toBe('ubuntu-24.04');
    expect(measure?.['timeout-minutes']).toBe(90);
    expect(measure?.permissions).toBeUndefined();
    const steps = measure?.steps ?? [];
    // Both production images built from their Dockerfiles before the harness runs.
    const builds = steps.filter((step) => step.uses === 'docker/build-push-action@v6');
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
    const restore = stepIndex(steps, (step) => step.uses === 'actions/cache/restore@v4');
    const build = stepIndex(steps, (step) => step.run?.includes('tools/release/scale.ts') === true);
    const save = stepIndex(steps, (step) => step.uses === 'actions/cache/save@v4');
    expect([restore < build, build < save]).toEqual([true, true]);
    expect(steps.some((step) => step.uses === 'actions/cache@v4')).toBe(false);
    expect((steps[build] as Step & { if?: string }).if).toBe("steps.scale-release.outputs.cache-hit != 'true'");
    expect((steps[save] as Step & { if?: string }).if).toBe("steps.scale-release.outputs.cache-hit != 'true'");
    const run = stepIndex(steps, (step) => step.run?.includes('pnpm screening:capacity') === true);
    expect(stepIndex(steps, (step) => step.uses === 'docker/build-push-action@v6')).toBeLessThan(run);
    expect(save).toBeLessThan(run);
    expect(steps[run]?.run).toContain('taskset -c');
    const upload = stepIndex(steps, (step) => step.uses === 'actions/upload-artifact@v4');
    expect(upload).toBe(run + 1);
    expect((steps[upload] as Step & { if?: string }).if).toBe('always()');
    expect(String(steps[upload]?.with?.path).trim().split('\n')).toEqual([
      '${{ runner.temp }}/screening-capacity/screening-capacity.json',
      '${{ runner.temp }}/screening-capacity/summary.md',
      '${{ runner.temp }}/screening-capacity/logs/',
    ]);
    expect(steps[upload]?.with?.['retention-days']).toBe(90);
    // The issue: a job of its own, the only one that may write, that needs the measurement, skips pull requests and runs no repository code.
    const notify = capacity.jobs.notify;
    expect(notify?.['runs-on']).toBe('ubuntu-24.04');
    expect(notify?.needs).toBe('capacity');
    expect(notify?.if).toBe("failure() && github.event_name != 'pull_request'");
    expect(notify?.permissions).toEqual({ issues: 'write' });
    expect(notify?.['timeout-minutes']).toBe(5);
    // The measuring job's checkout keeps no token: nothing it runs calls GitHub.
    expect(steps[0]).toEqual({ uses: 'actions/checkout@v4', with: { 'persist-credentials': false } });
    expect(notify?.steps.some((step) => step.uses?.startsWith('actions/checkout') === true)).toBe(false);
    expect(notify?.steps.every((step) => step.uses === undefined)).toBe(true);
    expect(notify?.steps.map((step) => step.run ?? '').join('\n')).toContain('--label screening-capacity');
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
    // Each pull request costs about 35 minutes of CI (docs/adr/0063): one per week for every action, one for both images.
    expect(config.updates.map((update) => update['open-pull-requests-limit'])).toEqual([5, 2, 2]);
    expect(config.updates[0]?.groups).toEqual({ 'minor-and-patch': { 'update-types': ['minor', 'patch'] } });
    expect(config.updates[1]?.groups).toEqual({ actions: { patterns: ['*'] } });
    expect(config.updates[2]?.groups).toEqual({ 'base-images': { patterns: ['*'] } });
  });
});

describe('job timeouts', () => {
  it('give every job of the pull-request workflows a timeout well under GitHub’s 360 minutes', () => {
    const limits: Record<string, Record<string, number>> = {};
    for (const file of ['ci.yml', 'supply-chain.yml', 'approval-of-record.yml', 'screening-capacity.yml']) {
      const jobs = (parse(readFileSync(path.join(repositoryRoot, '.github/workflows', file), 'utf8')) as { jobs: Record<string, { 'timeout-minutes'?: number }> }).jobs;
      limits[file] = Object.fromEntries(Object.entries(jobs).map(([name, job]) => [name, job['timeout-minutes'] ?? 360]));
    }
    expect(limits).toEqual({
      'ci.yml': { check: 60, mutation: 120 },
      'supply-chain.yml': { licenses: 15, images: 15 },
      'approval-of-record.yml': { 'approval-of-record': 5 },
      // A pull request that touches the screening, pricing, the harness or the images runs it (audit #53 part 1).
      'screening-capacity.yml': { capacity: 90, notify: 5 },
    });
  });
});

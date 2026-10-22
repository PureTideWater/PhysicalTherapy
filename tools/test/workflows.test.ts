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

/**
 * The actions the release and capacity workflows run, each pinned to a full commit SHA with its version in a comment
 * (the review of 2026-10-22): a moved tag cannot run code in the push job, which holds packages: write, nor write the
 * capacity report the launch check reads. trivy-action was pinned this way already.
 */
const PINNED = {
  checkout: 'actions/checkout@11d5960a326750d5838078e36cf38b85af677262',
  cacheRestore: 'actions/cache/restore@0057852bfaa89a56745cba8c7296529d2fc39830',
  cacheSave: 'actions/cache/save@0057852bfaa89a56745cba8c7296529d2fc39830',
  downloadArtifact: 'actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093',
  uploadArtifact: 'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02',
  setupNode: 'actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020',
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

  it('check production licenses against the allowlist on every pull request', () => {
    const steps = workflow('supply-chain.yml').jobs.licenses?.steps ?? [];
    expect(steps.some((step) => step.run === 'pnpm licenses:check')).toBe(true);
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
      expect(Object.fromEntries(Object.entries(release.jobs).map(([name, entry]) => [name, entry['timeout-minutes']]))).toEqual({ build: 60, capacity: 90, push: 30, report: 10 });
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

    it('measures exactly the production web image and the worker image as built, with time enforced by the harness, on the capacity workflow\'s runner', () => {
      const capacity = job('capacity');
      expect(capacity.needs).toBe('build');
      expect(capacity.permissions).toBeUndefined();
      const workflowRunner = (parse(readFileSync(path.join(repositoryRoot, '.github/workflows/screening-capacity.yml'), 'utf8')) as Workflow).jobs.capacity?.['runs-on'];
      expect(capacity['runs-on']).toEqual(workflowRunner);
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

    it('keeps the report, its SHA-256 and its summary as the tag\'s release assets from a job that alone may write contents and runs nothing but gh', () => {
      const report = job('report');
      expect(report.needs).toBe('capacity');
      expect(report.if).toBe("${{ !cancelled() && needs.capacity.result != 'skipped' }}");
      expect(report.permissions).toEqual({ contents: 'write' });
      for (const [name, entry] of Object.entries(release.jobs)) {
        expect(JSON.stringify(entry.permissions ?? {}).includes('"contents":"write"'), name).toBe(name === 'report');
      }
      expect(report.steps.map((step) => step.uses ?? 'run')).toEqual([PINNED.downloadArtifact, 'run']);
      const commands = runs('report')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== '' && !line.startsWith('"$RUNNER_TEMP'));
      expect(commands.every((line) => line.startsWith('gh release '))).toBe(true);
      expect(runs('report')).toContain('gh release upload "$TAG" --clobber');
      for (const asset of ['screening-capacity.json', 'screening-capacity.sha256', 'summary.md']) {
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

  it('measure the screening under production limits with time enforced on pushes, weekly and on request, and gate every pull request through one required job that measures only when a watched path changed (audit #53 part 1; the founder’s Q8 of 2026-10-21)', () => {
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

    // The measurement: only when the changes say so, on a 4-CPU runner (a public repository's standard one; the 4-core
    // larger runner once the repository is private, Q1 (d)).
    const measure = capacity.jobs.capacity;
    expect(measure?.needs).toBe('changes');
    expect(measure?.if).toBe("needs.changes.outputs.measure == 'true'");
    expect(measure?.['runs-on']).toBe('ubuntu-24.04');
    expect(measure?.['timeout-minutes']).toBe(90);
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
    // The harness on Postgres's CPUs, from the layout itself, never the consumer's.
    expect(steps[run]?.run).toContain('cpus=$(pnpm -s screening:capacity --print-harness-cpus)');
    expect(steps[run]?.run).toContain('taskset -c "$cpus" pnpm screening:capacity');
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
    // A sizing question (a worst time above 44 s) leaves the job as an output the gate prints as a warning (O9).
    expect(measure?.outputs).toEqual({ sizing: '${{ steps.measure.outputs.sizing }}' });
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
    });
    expect(decide).toContain('echo "::warning title=Sizing question (O9)::$SIZING"');

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

describe('the release and capacity workflows\' actions (the review of 2026-10-22)', () => {
  it('pin every action to a full commit SHA with its version beside it, so no moved tag runs in a job that pushes images or writes the report', () => {
    for (const name of ['release.yml', 'screening-capacity.yml']) {
      const lines = readFileSync(path.join(repositoryRoot, '.github/workflows', name), 'utf8')
        .split('\n')
        .filter((line) => /^\s*(?:-\s+)?uses:/.test(line));
      expect(lines.length, name).toBeGreaterThan(0);
      for (const line of lines) {
        expect(line, `${name}: ${line.trim()}`).toMatch(/uses: [\w./-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/);
      }
    }
    const pinned = new Set(Object.values(PINNED));
    for (const name of ['release.yml', 'screening-capacity.yml']) {
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

describe('mutation testing', () => {
  it('runs on a label as well as a push, fails an engine change without the money label, and runs the canary first (docs/adr/0064)', () => {
    const mutation = workflow('mutation.yml');
    expect(mutation.on).toEqual({ pull_request: { types: ['opened', 'synchronize', 'reopened', 'labeled', 'unlabeled'] }, schedule: [{ cron: expect.any(String) as unknown }] });
    // ci.yml runs on pull_request's default types, which carry no label event, so it holds no mutation job.
    expect(Object.keys(workflow('ci.yml').jobs)).toEqual(['check']);
    const steps = mutation.jobs.mutation?.steps ?? [];
    const gate = stepIndex(steps, (step) => step.name === 'The money label on an engine change');
    const gateStep = steps[gate] as Step & { env?: Record<string, string> };
    expect(gateStep.env?.MONEY).toBe("${{ contains(github.event.pull_request.labels.*.name, 'money') }}");
    expect(gateStep.run).toContain("git diff --name-only \"$base\" HEAD -- packages/pricing/src ':!**/*.test.ts'");
    expect(gateStep.run).toContain('exit 1');
    const canary = stepIndex(steps, (step) => step.run === 'pnpm stryker run tools/stryker/canary/stryker.config.mjs');
    const money = stepIndex(steps, (step) => step.run === 'pnpm stryker run');
    expect(gate).toBeLessThan(canary);
    expect(canary).toBeLessThan(money);
    for (const step of steps.slice(gate + 1) as (Step & { if?: string })[]) {
      expect(step.if, step.name ?? step.uses ?? step.run).toBe("steps.label.outputs.run == 'true'");
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
    for (const file of ['ci.yml', 'mutation.yml', 'supply-chain.yml', 'approval-of-record.yml', 'screening-capacity.yml']) {
      const jobs = (parse(readFileSync(path.join(repositoryRoot, '.github/workflows', file), 'utf8')) as { jobs: Record<string, { 'timeout-minutes'?: number }> }).jobs;
      limits[file] = Object.fromEntries(Object.entries(jobs).map(([name, job]) => [name, job['timeout-minutes'] ?? 360]));
    }
    expect(limits).toEqual({
      'ci.yml': { check: 60 },
      'mutation.yml': { mutation: 120 },
      'supply-chain.yml': { licenses: 15, images: 15 },
      'approval-of-record.yml': { 'approval-of-record': 5 },
      // Every pull request runs its path check and gate; one that touches a watched path also measures (Q8).
      'screening-capacity.yml': { changes: 5, capacity: 90, gate: 5, notify: 5 },
    });
  });
});

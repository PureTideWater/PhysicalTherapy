import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

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

interface Workflow {
  readonly on: unknown;
  readonly jobs: Record<string, { readonly steps: readonly Step[]; readonly strategy?: { readonly matrix?: Record<string, unknown> } }>;
}

function workflow(name: string): Workflow {
  return parse(readFileSync(path.join(repositoryRoot, '.github/workflows', name), 'utf8')) as Workflow;
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
    expect(check).toBe(stepIndex(steps, (step) => step.uses?.startsWith('gitleaks/gitleaks-action@') === true) + 1);
    expect(check).toBeLessThan(synth);
    // Right after the generation, a clean tree under fixtures/synthetic: what the commit holds is what synth writes.
    expect(steps[synth + 1]?.run).toBe('git diff --exit-code -- fixtures/synthetic && test -z "$(git status --porcelain -- fixtures/synthetic)"');
    expect(check).toBeLessThan(stepIndex(steps, (step) => step.run === 'pnpm test && pnpm test:golden && pnpm test:oracle'));
    expect(steps.filter((step) => step.run?.includes('check:fixtures') === true)).toHaveLength(1);
    const scripts = (JSON.parse(readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8')) as { scripts: Record<string, string> }).scripts;
    expect(scripts['check:fixtures']).toBe('tsx tools/fixture-check/index.ts');
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
});

describe('dependabot', () => {
  it('updates the workspace, the actions and both base images weekly', () => {
    const config = parse(readFileSync(path.join(repositoryRoot, '.github/dependabot.yml'), 'utf8')) as {
      updates: { 'package-ecosystem': string; schedule: { interval: string }; directory?: string; directories?: string[] }[];
    };
    expect(config.updates.map((update) => [update['package-ecosystem'], update.schedule.interval])).toEqual([
      ['npm', 'weekly'],
      ['github-actions', 'weekly'],
      ['docker', 'weekly'],
    ]);
    expect(config.updates[2]?.directories).toEqual(['/apps/web', '/apps/worker']);
  });
});

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

  it('install Playwright’s own Chromium, with its system libraries, right before the e2e suite, so the brand baselines compare under the build that made them', () => {
    const steps = workflow('ci.yml').jobs.check?.steps ?? [];
    const install = stepIndex(steps, (step) => step.run === 'pnpm --filter @tp/web exec playwright install --with-deps chromium');
    expect(install).toBe(stepIndex(steps, (step) => step.run === 'pnpm test:e2e') - 1);
    expect(install).toBeGreaterThan(stepIndex(steps, (step) => step.run === 'pnpm install --frozen-lockfile'));
    // The config takes that Chromium wherever it is installed, and Google Chrome only where it is not (docs/adr/0058).
    const config = readFileSync(path.join(repositoryRoot, 'apps/web/playwright.config.ts'), 'utf8');
    expect(config).toContain('const bundledChromium = existsSync(chromium.executablePath());');
    expect(config).toContain("...(bundledChromium ? {} : { channel: 'chrome' })");
    // The baselines the brand journey compares are committed for that browser on Linux.
    for (const name of ['header-1280', 'header-390', 'report-cover-with-seal', 'report-cover-without-seal']) {
      expect(existsSync(path.join(repositoryRoot, 'apps/web/e2e/brand.spec.ts-snapshots', `${name}-chromium-linux.png`)), name).toBe(true);
    }
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

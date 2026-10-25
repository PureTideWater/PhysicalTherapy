import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import { repositoryRoot } from '../content-files';

/**
 * The `all green` gate of ci.yml (docs/adr/0066, Part 1; test-matrix CI-01): the one check the ruleset requires from
 * ci.yml. Its own `run` text is taken from the workflow and run here under bash, as GitHub runs it (the workflow's
 * `defaults.run.shell: bash`, which GitHub runs as `bash --noprofile --norc -eo pipefail`), and jq, on the `needs`
 * JSON GitHub hands it: it passes only when every job it needs succeeded, and a failed, skipped or cancelled job, or
 * no job at all, fails it. GitHub counts a skipped required check as passing, so the gate itself must always run.
 */

interface GateStep {
  readonly name?: string;
  readonly uses?: string;
  readonly run?: string;
  readonly env?: Record<string, string>;
}

interface CiWorkflow {
  readonly defaults?: { readonly run?: { readonly shell?: string } };
  readonly jobs: Record<string, { readonly name?: string; readonly if?: string; readonly needs?: unknown; readonly steps?: readonly GateStep[] }>;
}

const ci = parse(readFileSync(path.join(repositoryRoot, '.github/workflows/ci.yml'), 'utf8')) as CiWorkflow;
const gate = ci.jobs['all-green'];
const steps = gate?.steps ?? [];
const decision = steps.find((step) => step.run !== undefined);

const scratch = mkdtempSync(path.join(os.tmpdir(), 'tp-ci-gate-'));
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

let runs = 0;

/** Runs the gate's step as GitHub would, with `needs` as GitHub serializes it; its log, its summary and its exit. */
function runGate(needs: Record<string, { result: string; outputs?: Record<string, string> }>): { status: number | null; log: string; summary: string } {
  runs += 1;
  const summary = path.join(scratch, `summary-${String(runs)}.md`);
  writeFileSync(summary, '');
  const result = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', decision?.run ?? 'exit 99'], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH ?? '/usr/bin:/bin', NEEDS: JSON.stringify(needs, null, 2), GITHUB_STEP_SUMMARY: summary },
  });
  expect(result.error).toBeUndefined();
  return { status: result.status, log: result.stdout + result.stderr, summary: readFileSync(summary, 'utf8') };
}

const SUCCESS = { result: 'success', outputs: {} };
const allSucceeded = () => ({ static: SUCCESS, lint: SUCCESS, unit: SUCCESS, db: SUCCESS, 'domain-model': SUCCESS, build: SUCCESS, e2e: SUCCESS, images: SUCCESS });

describe('the all green gate (CI-01)', () => {
  it('is the job the ruleset names, runs whatever the jobs before it did, a cancelled run included, and checks nothing out', () => {
    expect(gate, 'ci.yml has no all-green job').toBeDefined();
    expect(gate?.name).toBe('all green');
    // always(), never !cancelled(): a gate its own condition skipped would pass the required check.
    expect(gate?.if).toBe('${{ always() }}');
    expect(steps.every((step) => step.uses === undefined)).toBe(true);
    expect(steps).toHaveLength(1);
    // GitHub's bash with pipefail, so a failing jq inside a pipe fails the step.
    expect(ci.defaults?.run?.shell).toBe('bash');
    // The jobs' results come in through the environment, never pasted into the script.
    expect(decision?.env).toEqual({ NEEDS: '${{ toJSON(needs) }}' });
    expect(decision?.run).not.toContain('${{');
    expect(decision?.run).toContain(`jq -e 'length > 0 and all(.[]; .result == "success")'`);
  });

  it('passes when every job it needs succeeded, and prints each job’s result to the log and the summary', () => {
    const { status, log, summary } = runGate(allSucceeded());
    expect(status).toBe(0);
    for (const job of Object.keys(allSucceeded())) {
      expect(log, job).toContain(`| ${job} | success |`);
      expect(summary, job).toContain(`| ${job} | success |`);
    }
    expect(log).toContain('all green: every job it needs succeeded (8 jobs).');
  });

  it.each([
    ['failure', 'a job that failed'],
    ['skipped', 'a job that was skipped'],
    ['cancelled', 'a job that was cancelled'],
  ])('fails on %s (%s), naming the job, in the log and the summary', (result) => {
    const { status, log, summary } = runGate({ ...allSucceeded(), db: { result } });
    expect(status).toBe(1);
    expect(log).toContain(`| db | ${result} |`);
    expect(summary).toContain(`| db | ${result} |`);
    expect(log).toContain(`::error title=all green::not every job succeeded: db ${result}`);
  });

  it('fails when two jobs did not succeed, naming both', () => {
    const { status, log } = runGate({ ...allSucceeded(), static: { result: 'failure' }, e2e: { result: 'cancelled' } });
    expect(status).toBe(1);
    expect(log).toContain('::error title=all green::not every job succeeded: static failure, e2e cancelled');
  });

  it('fails when it needs no job at all, so an empty needs never reads as green', () => {
    const { status, log } = runGate({});
    expect(status).toBe(1);
    expect(log).toContain('::error title=all green::no job reported a result');
  });
});

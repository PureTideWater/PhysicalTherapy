import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs, promisify } from 'node:util';

import { type EnvironmentSettings, environmentSettings } from '../../infra/lib/environments';
import { repositoryRoot } from '../content-files';
import { RUNNER_TO_FARGATE, screeningConsumer } from './limits';
import { REPORT_FORMAT, type Report, timeRule, verdict } from './report';

/**
 * Decision 13's launch check (the founder's rulings of 2026-10-20; docs/adr/0062; the design's §5.4; test matrix SCR-20):
 * production's screening opens only when the latest capacity report for the image being deployed passes with time
 * enforced, on both image IDs. The release workflow keeps each tag's report as an asset of its GitHub release; the
 * deployer pulls the tag's web-production and worker images and runs
 *
 *   pnpm exec tsx tools/screening-capacity/launch-check.ts --report <screening-capacity.json> --tag <tag> \
 *     --web-image <web-production:tag as pulled> --worker-image <worker:tag as pulled>
 *
 * which prints `ScreeningLaunch=<tag>:<the report's SHA-256>` for the deploy's ScreeningLaunch parameter, or names each
 * reason and exits non-zero (the deploy then passes `closed`). It holds the report to:
 *
 * - its format (tp-screening-capacity/4), the Docker runtime (the process runtime cannot limit Postgres), a passing
 *   verdict with time enforced, as recorded and as this checkout's verdict() reads the same measurements again;
 * - the tag's commit;
 * - both images: the IDs the deployer pulled equal the IDs measured (`docker image inspect -f {{.Id}}`), so the web image
 *   measured, built with production's static origin, is the one deployed, and the worker image too;
 * - the consumer measured equal to environments.ts's compute.screening for production: its tasks, vCPUs, memory and
 *   concurrency.
 *
 * The SHA-256 is of the report's bytes as kept, so the value names that one report. The web enforces the rest: it opens
 * production's screening only when SCREENING_LAUNCH is `${IMAGE_TAG}:<64 hex>` for the tag it runs, so a value a later
 * deploy keeps by omission closes the screening instead of vouching for another image. No row, address or token is read.
 */

/** A release tag as the ScreeningLaunch parameter takes it (infra/lib/deploy-parameters.ts, SCREENING_LAUNCH_PATTERN). */
export const RELEASE_TAG = /^v[0-9A-Za-z.-]{1,60}$/;
/** A Docker image ID as `docker image inspect -f {{.Id}}` prints it. */
const IMAGE_ID = /^sha256:[0-9a-f]{64}$/;
/** A full commit hash. */
const COMMIT = /^[0-9a-f]{40}$/;

export interface LaunchInput {
  /** The report's bytes, as kept as the tag's release asset. */
  readonly reportText: string;
  readonly tag: string;
  /** The commit the tag names (`git rev-list -n 1 <tag>`). */
  readonly tagCommit: string;
  /** The IDs of the images the deploy runs, as pulled. */
  readonly images: { readonly web: string; readonly worker: string };
  /** Production's settings (environmentSettings('production')). */
  readonly settings: EnvironmentSettings;
}

export type LaunchResult = { readonly ok: true; readonly value: string; readonly notes: readonly string[] } | { readonly ok: false; readonly reasons: readonly string[] };

/** The SHA-256 of the report's bytes, as `sha256sum` and the harness's screening-capacity.sha256 give it. */
export function reportSha256(reportText: string): string {
  return createHash('sha256').update(reportText).digest('hex');
}

/** The check itself (pure: launch-check.test.ts runs it on synthetic reports). */
export function launchCheck(input: LaunchInput): LaunchResult {
  try {
    return check(input);
  } catch {
    // A report that parses but lacks a part the checks read (a truncated or older file).
    return { ok: false, reasons: ['report: not a complete capacity report'] };
  }
}

function check(input: LaunchInput): LaunchResult {
  const reasons: string[] = [];
  if (!RELEASE_TAG.test(input.tag)) {
    reasons.push(`tag: ${input.tag} is not a release tag (v followed by letters, digits, dots and hyphens)`);
  }
  let parsed: Report;
  try {
    parsed = JSON.parse(input.reportText) as Report;
  } catch {
    return { ok: false, reasons: [...reasons, 'report: not JSON'] };
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return { ok: false, reasons: [...reasons, 'report: not a capacity report'] };
  }
  const format: unknown = parsed.format;
  if (format !== REPORT_FORMAT) {
    return { ok: false, reasons: [...reasons, `report: format ${String(format)}, not ${REPORT_FORMAT}`] };
  }
  if (parsed.runtime !== 'docker') {
    reasons.push(`runtime: ${String(parsed.runtime)}, not docker (only the Docker runtime measures under production’s limits)`);
  }
  if (parsed.verdict.pass !== true || parsed.verdict.time !== 'enforced') {
    reasons.push(`verdict: ${parsed.verdict.pass ? 'pass' : 'fail'} with time ${String(parsed.verdict.time)}; launch needs a pass with time enforced`);
  }
  // The same measurements read again by this checkout's rules: a recorded verdict is not taken on trust.
  const rule = timeRule(input.settings, RUNNER_TO_FARGATE);
  const again = verdict(parsed, rule);
  if (!again.pass || again.time !== 'enforced') {
    reasons.push(`verdict read again: ${again.pass ? 'pass' : 'fail'} with time ${again.time}${again.reasons.length === 0 ? '' : ` (${again.reasons.slice(0, 5).join('; ')}${again.reasons.length > 5 ? '; …' : ''})`}`);
  }
  if (!COMMIT.test(input.tagCommit)) {
    reasons.push(`commit: the tag’s commit ${input.tagCommit} is not a full commit hash`);
  } else if (parsed.commit !== input.tagCommit) {
    reasons.push(`commit: the report measured ${String(parsed.commit)}, and ${input.tag} is ${input.tagCommit}`);
  }
  for (const image of ['web', 'worker'] as const) {
    const measured = parsed.images[image];
    const deployed = input.images[image];
    if (!IMAGE_ID.test(deployed)) {
      reasons.push(`${image} image: the deployed image’s ID ${deployed} is not an image ID`);
    } else if (measured !== deployed) {
      reasons.push(`${image} image: the report measured ${String(measured)}, and the image being deployed is ${deployed}`);
    }
  }
  const declared = screeningConsumer(input.settings);
  const consumer = parsed.consumer;
  if (declared === null) {
    reasons.push('consumer: environments.ts declares no screening consumer for production');
  } else if (consumer === null || consumer.tasks !== declared.desiredCount || consumer.cpus !== declared.cpu / 1024 || consumer.memoryMiB !== declared.memoryMiB || consumer.concurrency !== declared.concurrency) {
    reasons.push(
      `consumer: the report measured ${consumer === null ? 'none' : `${String(consumer.tasks)} × ${String(consumer.cpus)} vCPU, ${String(consumer.memoryMiB)} MiB, ${String(consumer.concurrency)} at once`}, and production declares ${String(declared.desiredCount)} × ${String(declared.cpu / 1024)} vCPU, ${String(declared.memoryMiB)} MiB, ${String(declared.concurrency)} at once`,
    );
  }
  if (reasons.length > 0) {
    return { ok: false, reasons };
  }
  const notes = parsed.sizing.question ? [`sizing: the worst time, ${String(parsed.sizing.worstUpload)}’s ${((parsed.sizing.worstMs ?? 0) / 1000).toFixed(1)} s, is above 44 s (open item O9: the founder’s sizing question)`] : [];
  return { ok: true, value: `${input.tag}:${reportSha256(input.reportText)}`, notes };
}

const exec = promisify(execFile);

/** An image's ID as Docker gives it, or the reason it could not be read. */
async function imageId(reference: string): Promise<string> {
  const { stdout } = await exec('docker', ['image', 'inspect', '-f', '{{.Id}}', reference]).catch(() => ({ stdout: `not found: ${reference}` }));
  return stdout.trim();
}

async function main(argv: readonly string[]): Promise<number> {
  const { values } = parseArgs({
    args: [...argv],
    options: { report: { type: 'string' }, tag: { type: 'string' }, 'web-image': { type: 'string' }, 'worker-image': { type: 'string' } },
    strict: true,
  });
  if (values.report === undefined || values.tag === undefined || values['web-image'] === undefined || values['worker-image'] === undefined) {
    process.stderr.write('usage: pnpm exec tsx tools/screening-capacity/launch-check.ts --report <screening-capacity.json> --tag <tag> --web-image <reference> --worker-image <reference>\n');
    return 2;
  }
  const tag = values.tag;
  const tagCommit = RELEASE_TAG.test(tag)
    ? (await exec('git', ['rev-list', '-n', '1', `refs/tags/${tag}`], { cwd: repositoryRoot }).catch(() => ({ stdout: `no tag ${tag} in this checkout (git fetch --tags)` }))).stdout.trim()
    : '';
  const result = launchCheck({
    reportText: readFileSync(path.resolve(values.report), 'utf8'),
    tag,
    tagCommit,
    images: { web: await imageId(values['web-image']), worker: await imageId(values['worker-image']) },
    settings: environmentSettings('production'),
  });
  if (!result.ok) {
    process.stderr.write(`launch check failed; deploy with ScreeningLaunch=closed:\n${result.reasons.map((reason) => `- ${reason}`).join('\n')}\n`);
    return 1;
  }
  for (const note of result.notes) {
    process.stderr.write(`note: ${note}\n`);
  }
  process.stdout.write(`ScreeningLaunch=${result.value}\n`);
  return 0;
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  process.exitCode = await main(process.argv.slice(2));
}

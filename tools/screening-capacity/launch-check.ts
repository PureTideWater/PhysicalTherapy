import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { type EnvironmentSettings, environmentSettings } from '../../infra/lib/environments';
import { repositoryRoot } from '../content-files';
import { RUNNER_TO_FARGATE, screeningConsumer, taskLimit } from './limits';
import { REPORT_FORMAT, type Report, timeRule, verdict } from './report';

/**
 * Decision 13's launch check (the founder's rulings of 2026-10-20 and 2026-10-22; docs/adr/0062; the design's §5.4; test
 * matrix SCR-20): production's screening opens only when the latest capacity report for the image being deployed passes
 * with time enforced, on both image IDs. The release workflow keeps each tag's report as an asset of its GitHub release;
 * the deployer copies the tag's web-production and worker images to the environment's ECR repositories and deploys
 * production with that report (docs/runbooks/deploy-and-rollback.md, steps 3 and 4):
 *
 *   cdk deploy tp-production -c tp:launchReport=<screening-capacity.json> -c tp:launchTag=<tag> --parameters ImageTag=<tag>
 *
 * The CDK app runs this check at synthesis (infra/lib/screening-launch.ts) on the images the stack deploys,
 * `<WebRepositoryUri>:<tag>` and `<WorkerRepositoryUri>:<tag>`, each pulled from ECR first (registryImageId), and sets the
 * web's SCREENING_LAUNCH to `<tag>:<the report's SHA-256>` itself; a refused report stops the synthesis with each reason,
 * and no report keeps the screening closed. No deploy takes the value as a parameter (the founder's ruling of
 * 2026-10-22), so nothing typed by hand can open the screening. Run on its own,
 *
 *   pnpm exec tsx tools/screening-capacity/launch-check.ts --report <screening-capacity.json> --tag <tag> \
 *     --web-image <WebRepositoryUri>:<tag> --worker-image <WorkerRepositoryUri>:<tag>
 *
 * previews the same check: it prints the value the deploy will compute, or names each reason and exits non-zero. It
 * holds the report to:
 *
 * - its format (tp-screening-capacity/4), the Docker runtime (the process runtime cannot limit Postgres), a passing
 *   verdict with time enforced, as recorded and as this checkout's verdict() reads the same measurements again;
 * - the tag's commit;
 * - both images: the IDs pulled from ECR equal the IDs measured (`docker image inspect -f {{.Id}}` after `docker pull`),
 *   so the web image measured, built with production's static origin, is the one deployed, and the worker image too;
 * - the web and platform measured at environments.ts's sizes for production (the web's half vCPU and 1,024 MiB since
 *   the founder's ruling of 2026-10-22), and the consumer at its compute.screening: its tasks, vCPUs, memory and
 *   concurrency.
 *
 * The SHA-256 is of the report's bytes as kept, so the value names that one report. The web enforces the rest: it opens
 * production's screening only when SCREENING_LAUNCH is `${IMAGE_TAG}:<64 hex>` for the tag it runs, so a deploy of
 * another tag without its own report closes the screening instead of vouching for another image. No row, address or
 * token is read.
 */

/** A release tag as the launch value names it (infra/lib/deploy-parameters.ts, SCREENING_LAUNCH_PATTERN). */
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
  for (const task of ['web', 'platform'] as const) {
    const measured = parsed.expected[task];
    const declaredTask = taskLimit(input.settings.compute[task]);
    if (measured.cpus !== declaredTask.cpus || measured.memoryMiB !== declaredTask.memoryMiB) {
      reasons.push(`${task}: the report measured ${String(measured.cpus)} vCPU and ${String(measured.memoryMiB)} MiB, and production declares ${String(declaredTask.cpus)} vCPU and ${String(declaredTask.memoryMiB)} MiB`);
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

/**
 * The ID of the image a registry reference names, as Docker gives it, or why it could not be read (which the check then
 * refuses as no image ID). The image is pulled first: a pull resolves the tag against the registry and points the local
 * tag at what the registry holds, so the ID read is that of the copy in ECR (whose tags are immutable), the image ECS
 * runs, never a copy already on this machine under the same name.
 */
export function registryImageId(reference: string): string {
  try {
    execFileSync('docker', ['pull', '--quiet', reference], { stdio: ['ignore', 'ignore', 'ignore'] });
  } catch {
    return `not pulled from its registry: ${reference} (docker login to it first)`;
  }
  try {
    return execFileSync('docker', ['image', 'inspect', '-f', '{{.Id}}', reference], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return `not found: ${reference}`;
  }
}

/** The commit a release tag names in this checkout (`git rev-list -n 1`), or why it could not be read. */
export function tagCommitOf(tag: string): string {
  if (!RELEASE_TAG.test(tag)) {
    return '';
  }
  try {
    return execFileSync('git', ['rev-list', '-n', '1', `refs/tags/${tag}`], { cwd: repositoryRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return `no tag ${tag} in this checkout (git fetch --tags)`;
  }
}

function main(argv: readonly string[]): number {
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
  const result = launchCheck({
    reportText: readFileSync(path.resolve(values.report), 'utf8'),
    tag,
    tagCommit: tagCommitOf(tag),
    images: { web: registryImageId(values['web-image']), worker: registryImageId(values['worker-image']) },
    settings: environmentSettings('production'),
  });
  if (!result.ok) {
    process.stderr.write(`launch check failed; the deploy would refuse this report (deploy without it to keep the screening closed):\n${result.reasons.map((reason) => `- ${reason}`).join('\n')}\n`);
    return 1;
  }
  for (const note of result.notes) {
    process.stderr.write(`note: ${note}\n`);
  }
  // A preview: the CDK app computes this value itself from the same report and images (infra/lib/screening-launch.ts).
  process.stdout.write(`ScreeningLaunch=${result.value}\n`);
  return 0;
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  process.exitCode = main(process.argv.slice(2));
}

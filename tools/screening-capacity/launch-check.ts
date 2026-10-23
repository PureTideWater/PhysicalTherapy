import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { type EnvironmentSettings, environmentSettings } from '../../infra/lib/environments';
import { repositoryRoot } from '../content-files';
import { RUNNER_TO_FARGATE, screeningConsumer, taskLimit } from './limits';
import { REPEATED_SCENARIO, REPORT_FORMAT, type Report, middleRunNote, repeatedScenario, sizing, timeRule, verdict } from './report';

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
 * `<WebRepositoryUri>:<tag>` and `<WorkerRepositoryUri>:<tag>`, each image's config digest read from its manifest in ECR
 * (registryImageId), and sets the web's SCREENING_LAUNCH to `<tag>:<the report's SHA-256>` itself; a refused report
 * stops the synthesis with each reason, and no report keeps the screening closed. No deploy takes the value as a parameter (the founder's ruling of
 * 2026-10-22), so nothing typed by hand can open the screening. Run on its own,
 *
 *   pnpm exec tsx tools/screening-capacity/launch-check.ts --report <screening-capacity.json> --tag <tag> \
 *     --web-image <WebRepositoryUri>:<tag> --worker-image <WorkerRepositoryUri>:<tag>
 *
 * previews the same check: it prints the value the deploy will compute, or names each reason and exits non-zero. It
 * holds the report to:
 *
 * - its format (tp-screening-capacity/5), the Docker runtime (the process runtime cannot limit Postgres), a passing
 *   verdict with time enforced, as recorded and as this checkout's verdict() reads the same measurements again, S4's
 *   time on the middle of its three runs (the founder's ruling of 2026-10-23), the middle run the report names being
 *   the one its measurements give; a report in an older format, S4 measured once, is refused;
 * - the tag's commit;
 * - both images, by config digest: each image's config digest as ECR's manifest names it (`docker buildx imagetools
 *   inspect --raw`, an index resolved to its one linux/amd64 image manifest, the platform the release builds and ECS
 *   runs) equals the ID the report measured, which the harness reads on the runner's classic (overlay2) image store
 *   (`docker image inspect -f {{.Id}}`), where an image's ID is its config's SHA-256 (CI's capacity log shows it equal to
 *   buildx's containerimage.config.digest), so the web image measured, built with production's static origin, is the
 *   one deployed, and the worker image too. Nothing is pulled and the deployer's local image store is never read: under
 *   Docker's containerd image store (the default for new Docker Desktop and Docker Engine 29 installs) `{{.Id}}` is the
 *   manifest's or the index's digest, which would never match. A registry that cannot be read, a platform manifest not
 *   found, an index with no linux/amd64 manifest or an unexpected media type is named as the reason;
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
/**
 * An image's config digest: as a manifest's `config.digest` names it, and as `docker image inspect -f {{.Id}}` prints it
 * on the classic image store, where an image's ID is its config's SHA-256.
 */
const IMAGE_ID = /^sha256:[0-9a-f]{64}$/;
/** A full commit hash. */
const COMMIT = /^[0-9a-f]{40}$/;

export interface LaunchInput {
  /** The report's bytes, as kept as the tag's release asset. */
  readonly reportText: string;
  readonly tag: string;
  /** The commit the tag names (`git rev-list -n 1 <tag>`). */
  readonly tagCommit: string;
  /** The config digests of the images the deploy runs, as their registry holds them (registryImageId). */
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
  // The middle run S4's time was judged on, read again from the same measurements.
  const middle = repeatedScenario(parsed.scenarios).middle;
  const recordedMiddle: unknown = (parsed.repeated as Partial<Report['repeated']> | undefined)?.middle;
  if (recordedMiddle !== middle) {
    reasons.push(`middle run: the report names ${String(recordedMiddle)}, and its measurements make ${String(middle)} the middle of ${REPEATED_SCENARIO}'s three runs`);
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
      reasons.push(`${image} image: no config digest for the image being deployed: ${deployed}`);
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
  // The sizing question read again from the measurements, S4's from its middle run, as the gate's warning gives it.
  const worst = sizing(parsed);
  const upload = String(worst.worstUpload);
  const notes = worst.question ? [`sizing: the worst time, ${upload}’s ${((worst.worstMs ?? 0) / 1000).toFixed(1)} s${middleRunNote(upload, middle, '’')}, is above 44 s (open item O9: the founder’s sizing question)`] : [];
  return { ok: true, value: `${input.tag}:${reportSha256(input.reportText)}`, notes };
}

/** An image manifest's media types: the OCI one and Docker's v2 schema 2. */
const IMAGE_MANIFEST_TYPES: ReadonlySet<string> = new Set(['application/vnd.oci.image.manifest.v1+json', 'application/vnd.docker.distribution.manifest.v2+json']);
/** An index's media types: the OCI image index and Docker's manifest list. */
const INDEX_TYPES: ReadonlySet<string> = new Set(['application/vnd.oci.image.index.v1+json', 'application/vnd.docker.distribution.manifest.list.v2+json']);
/** An image config's media types: what makes a manifest a container image's rather than another artifact's. */
const CONFIG_TYPES: ReadonlySet<string> = new Set(['application/vnd.oci.image.config.v1+json', 'application/vnd.docker.container.image.v1+json']);

/**
 * The platform the images are built for and ECS runs: both workflows build them on ubuntu-24.04's native linux/amd64 with
 * no platform named (release.yml, screening-capacity.yml; FROM node:24-slim), and every task definition declares X86_64
 * on Linux (infra/lib/constructs/compute.ts).
 */
const IMAGE_PLATFORM = { os: 'linux', architecture: 'amd64' } as const;

/** What one manifest from the registry gives: the image's config digest, the platform manifest to read next, or why neither. */
export type ManifestReading =
  | { readonly kind: 'config'; readonly digest: string }
  | { readonly kind: 'platform'; readonly digest: string }
  | { readonly kind: 'refused'; readonly reason: string };

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function platformName(platform: Readonly<Record<string, unknown>>): string {
  return [platform.os, platform.architecture, platform.variant].filter((part) => typeof part === 'string' && part !== '').join('/');
}

/**
 * Reads a manifest as the registry serves it (`docker buildx imagetools inspect --raw`; pure, launch-check.test.ts). An
 * image manifest gives its config's digest, the image's ID on the runner's classic image store, where the harness reads
 * the report's IDs. An index gives the digest of its one linux/amd64 image manifest, read next. Anything else, a
 * malformed answer, another media type, an index without exactly one linux/amd64 manifest, gives its reason.
 */
export function readManifest(raw: string): ManifestReading {
  const refused = (reason: string): ManifestReading => ({ kind: 'refused', reason });
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return refused('not a manifest (malformed JSON)');
  }
  if (!isRecord(parsed)) {
    return refused('not a manifest (not a JSON object)');
  }
  const { mediaType } = parsed;
  if (typeof mediaType === 'string' && IMAGE_MANIFEST_TYPES.has(mediaType)) {
    const { config } = parsed;
    if (!isRecord(config)) {
      return refused('an image manifest with no config');
    }
    if (typeof config.mediaType !== 'string' || !CONFIG_TYPES.has(config.mediaType)) {
      return refused(`an unexpected config media type ${typeof config.mediaType === 'string' ? config.mediaType : '(none)'}`);
    }
    if (typeof config.digest !== 'string' || !IMAGE_ID.test(config.digest)) {
      return refused('a config digest that is not sha256:<64 hex>');
    }
    return { kind: 'config', digest: config.digest };
  }
  if (typeof mediaType === 'string' && INDEX_TYPES.has(mediaType)) {
    const { manifests } = parsed;
    if (!Array.isArray(manifests)) {
      return refused('an index with no manifests');
    }
    const entries = manifests.filter(isRecord);
    const platformOf = (entry: Readonly<Record<string, unknown>>) => (isRecord(entry.platform) ? entry.platform : {});
    const matching = entries.filter((entry) => platformOf(entry).os === IMAGE_PLATFORM.os && platformOf(entry).architecture === IMAGE_PLATFORM.architecture);
    const wanted = `${IMAGE_PLATFORM.os}/${IMAGE_PLATFORM.architecture}`;
    const [only] = matching;
    if (only === undefined) {
      const held = [...new Set(entries.map((entry) => platformName(platformOf(entry))).filter((name) => name !== ''))];
      return refused(`no ${wanted} manifest in its index (it holds ${held.length === 0 ? 'none' : held.join(', ')})`);
    }
    if (matching.length > 1) {
      // Variants of one platform: which one ECS pulls is the runtime's choice, so none is taken as the one measured.
      return refused(`${String(matching.length)} ${wanted} manifests in its index, not one`);
    }
    if (typeof only.mediaType !== 'string' || !IMAGE_MANIFEST_TYPES.has(only.mediaType)) {
      return refused(`an unexpected media type ${typeof only.mediaType === 'string' ? only.mediaType : '(none)'} for its ${wanted} manifest`);
    }
    if (typeof only.digest !== 'string' || !IMAGE_ID.test(only.digest)) {
      return refused(`a ${wanted} manifest digest that is not sha256:<64 hex>`);
    }
    return { kind: 'platform', digest: only.digest };
  }
  return refused(`an unexpected media type ${typeof mediaType === 'string' ? mediaType : '(none)'}`);
}

/** The repository a reference names, without its tag or digest (a registry's port kept), to read a manifest by digest. */
export function repositoryOf(reference: string): string {
  const [name = reference] = reference.split('@');
  const colon = name.lastIndexOf(':');
  return colon > name.lastIndexOf('/') ? name.slice(0, colon) : name;
}

/** Runs a command and gives its standard output, or throws when it cannot run or exits non-zero; the tests give their own. */
export type CommandRunner = (command: string, args: readonly string[]) => string;

const runCommand: CommandRunner = (command, args) => execFileSync(command, [...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

/**
 * The config digest of the image a registry reference names, read from the registry's manifest, or why it could not be
 * read (which the check then refuses as no config digest). Nothing is pulled and the local image store is never read:
 * the manifest is the one the registry holds under the tag (ECR's tags are immutable), the image ECS runs, never a copy
 * already on this machine under the same name, and its config digest is the same whatever store this Docker uses.
 * Under Docker's containerd image store (the default for new Docker Desktop and Docker Engine 29 installs),
 * `docker image inspect -f {{.Id}}` gives the manifest's or the index's digest instead, which would never match.
 */
export function registryImageId(reference: string, run: CommandRunner = runCommand): string {
  const inspect = (target: string): string => run('docker', ['buildx', 'imagetools', 'inspect', '--raw', target]);
  let top: ManifestReading;
  try {
    top = readManifest(inspect(reference));
  } catch {
    return `not read from its registry: ${reference} (docker login to it first)`;
  }
  if (top.kind === 'refused') {
    return `${reference}: ${top.reason}`;
  }
  if (top.kind === 'config') {
    return top.digest;
  }
  const platform = `${repositoryOf(reference)}@${top.digest}`;
  const named = `${platform} (the ${IMAGE_PLATFORM.os}/${IMAGE_PLATFORM.architecture} manifest of ${reference})`;
  let image: ManifestReading;
  try {
    image = readManifest(inspect(platform));
  } catch {
    return `not found: ${named}`;
  }
  if (image.kind === 'refused') {
    return `${named}: ${image.reason}`;
  }
  return image.kind === 'config' ? image.digest : `${named}: an index, not an image manifest`;
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

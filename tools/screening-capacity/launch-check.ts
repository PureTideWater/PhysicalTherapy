import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { environmentSettings } from '../../infra/lib/environments';
import { repositoryRoot } from '../content-files';
import { type CpuLayout, HARNESS_RUNS_SCREENING_CONSUMER, MIB, type ProductionLimits, RUNNER_TO_FARGATE, cpuLayout, layoutText, productionLimits, sameLayout } from './limits';
import { REPEATED_SCENARIO, REPORT_FORMAT, type Report, type TimeRule, type WorkflowRun, middleRunNote, repeatedScenario, sizing, verdict } from './report';

/**
 * Decision 13's launch check (the founder's rulings of 2026-10-20 and 2026-10-22; docs/adr/0062; the design's §5.4; test
 * matrix SCR-20): production's screening opens only on the capacity report release.yml measured on the tag being
 * deployed, attested by that run, binding and passing with time enforced, on both image IDs. The release workflow keeps
 * each tag's report and the bundle of its artifact attestation as assets of its GitHub release; the deployer copies the
 * tag's web-production and worker images to the environment's ECR repositories and deploys production with both
 * (docs/runbooks/deploy-and-rollback.md, steps 3 and 4):
 *
 *   cdk deploy tp-production -c tp:launchReport=<screening-capacity.json> \
 *     -c tp:launchAttestation=<screening-capacity.sigstore.json> -c tp:launchTag=<tag> --parameters ImageTag=<tag>
 *
 * The CDK app runs this check at synthesis (infra/lib/screening-launch.ts) on the images the stack deploys,
 * `<WebRepositoryUri>:<tag>` and `<WorkerRepositoryUri>:<tag>`, each image's config digest read from its manifest in ECR
 * (registryImageId), on the report's attestation as gh verifies it against the bundle (verifyReportAttestation), and
 * sets the web's SCREENING_LAUNCH to `<tag>:<the report's SHA-256>` itself; a refused report stops the synthesis with
 * each reason, and no report keeps the screening closed. No deploy takes the value as a parameter (the founder's ruling
 * of 2026-10-22), so nothing typed by hand can open the screening. Run on its own,
 *
 *   pnpm exec tsx tools/screening-capacity/launch-check.ts --report <screening-capacity.json> \
 *     --attestation <screening-capacity.sigstore.json> --tag <tag> \
 *     --web-image <WebRepositoryUri>:<tag> --worker-image <WorkerRepositoryUri>:<tag>
 *
 * previews the same check: it prints the value the deploy will compute, or names each reason and exits non-zero. It
 * holds the report to:
 *
 * - its format (tp-screening-capacity/8), the Docker runtime (the process runtime cannot limit Postgres);
 * - its time mode (the founder's third ruling of 2026-10-23, "Free: time advisory"): binding, the release workflow's
 *   run, where time fails the run; an advisory report (a pull request's, the build branch's or the weekly run's, whose
 *   time only warns) is refused whatever its verdict, the mode named;
 * - its provenance (the verification of PR 6b-3's capacity changes): GitHub's artifact attestation of exactly the
 *   report's bytes, which release.yml's report job makes (actions/attest-build-provenance) and keeps as the release asset
 *   screening-capacity.sigstore.json, verified by `gh attestation verify` against that bundle as signed by this
 *   repository's .github/workflows/release.yml at refs/tags/<tag>, at the tag's commit, on a GitHub-hosted runner, under
 *   SLSA provenance; then gh's verified result read again here, every field exactly: the statement names the SHA-256 of
 *   the bytes this check read, the certificate (set from GitHub's OIDC token, which no workflow can forge) names the
 *   release workflow on the tag as its signer and build signer, this repository, the tag's ref and commit, a hosted
 *   runner, a push and the run the report records. The run the report records from the harness's own variables
 *   (GITHUB_WORKFLOW_REF, GITHUB_RUN_ID, GITHUB_RUN_ATTEMPT) must be the tag's release.yml's too, its run and attempt
 *   named in the notes. A report measured anywhere else (a pull request's run, a run on a machine of one's own, a
 *   fork's), or changed by one byte after the release attested it, is refused;
 * - a passing verdict with time enforced, as recorded and as this checkout's verdict() reads the same measurements again
 *   in binding mode whatever mode the report records, S4's time on the middle of its three runs (the founder's ruling
 *   of 2026-10-23, median of 3), the middle run the report names being the one its measurements give; a report in an
 *   older format (S4 measured once, no time mode or no run recorded) is refused;
 * - the layout release.yml's runner gives production's sizes (RELEASE_RUNNER: the free 4-CPU ubuntu-24.04 runner's
 *   shared CPUs, Postgres and the harness 0-1, the consumer 2-3, the web and the platform 3), which the verdict holds the
 *   containers' cpusets and the harness's affinity to and reads again as the one the harness gives the report's runner;
 *   CPUs of their own (an 8-CPU runner's) are refused until a release measures on 8 CPUs;
 * - the tag's commit;
 * - both images, by config digest: each image's config digest as ECR's manifest names it (`docker buildx imagetools
 *   inspect --raw`, an index resolved to its one linux/amd64 image manifest, the platform the release builds and ECS
 *   runs) equals the ID the report measured, which the harness reads on the release runner's classic (overlay2) image
 *   store (`docker image inspect -f {{.Id}}`), where an image's ID is its config's SHA-256 (CI's capacity log shows it
 *   equal to buildx's containerimage.config.digest), and which release.yml's capacity job, before anything is installed,
 *   proves to be the config digest its build read from the saved archive's bytes and left as a job output
 *   (tools/screening-capacity/image-id.ts; docs/adr/0066, Part 3), so the web image measured, built with production's
 *   static origin, is the one deployed, and the worker image too. Nothing is pulled and the deployer's local image store is never read: under
 *   Docker's containerd image store (the default for new Docker Desktop and Docker Engine 29 installs) `{{.Id}}` is the
 *   manifest's or the index's digest, which would never match. A registry that cannot be read, a platform manifest not
 *   found, an index with no linux/amd64 manifest or an unexpected media type is named as the reason;
 * - every size production declares, as the harness derives it (limits.ts, productionLimits): the web and the platform
 *   at environments.ts's sizes for production (the web's half vCPU and 1,024 MiB since the founder's ruling of
 *   2026-10-22), each consumer task's vCPUs and memory and their number, Postgres at its class's vCPUs and memory on the
 *   release runner's Postgres CPUs, the storage at its type's baseline, and the consumer as measured at its
 *   compute.screening: its tasks, vCPUs, memory and concurrency.
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
/** A GitHub Actions run's ID or attempt, as GITHUB_RUN_ID and GITHUB_RUN_ATTEMPT give them. */
const RUN_NUMBER = /^[1-9][0-9]{0,19}$/;

/** The repository whose release workflow alone measures a report that opens production (decision 13). */
export const RELEASE_REPOSITORY = 'PureTideWater/PhysicalTherapy';
/** That workflow: the only one whose report, attested by its own run on the tag, the launch check accepts. */
export const RELEASE_WORKFLOW = '.github/workflows/release.yml';
/**
 * The runner release.yml's capacity job measures on: GitHub's free ubuntu-24.04 runner for a public repository, 4 CPUs
 * (the founder's third ruling of 2026-10-23, "Free: time advisory"), on which the release's whole capacity chain stays
 * while every other job runs on ubuntu-26.04 (the founder's F5; docs/adr/0066, Part 3). The launch check accepts only the
 * layout the harness gives it, the shared one; workflows.test.ts holds release.yml's runs-on to this label, so a release
 * moved to another runner fails there until this, and with it the layout accepted, moves too.
 */
export const RELEASE_RUNNER = { label: 'ubuntu-24.04', cpus: 4 } as const;
/** GitHub, the issuer of the OIDC token Fulcio certifies, and the predicate actions/attest-build-provenance writes. */
const GITHUB = 'https://github.com';
const GITHUB_OIDC_ISSUER = 'https://token.actions.githubusercontent.com';
const SLSA_PROVENANCE = 'https://slsa.dev/provenance/v1';

/** The workflow ref of release.yml's run on a tag, as GITHUB_WORKFLOW_REF names it. */
export function releaseWorkflowRef(tag: string): string {
  return `${RELEASE_REPOSITORY}/${RELEASE_WORKFLOW}@refs/tags/${tag}`;
}

/**
 * What `gh attestation verify` gave for the report and the bundle the release kept: its JSON output (the attestations it
 * verified), or why it refused (verifyReportAttestation).
 */
export type AttestationReading = { readonly kind: 'verified'; readonly output: string } | { readonly kind: 'refused'; readonly reason: string };

export interface LaunchInput {
  /** The report's bytes, as kept as the tag's release asset. */
  readonly reportText: string;
  readonly tag: string;
  /** The commit the tag names (`git rev-list -n 1 <tag>`). */
  readonly tagCommit: string;
  /** The config digests of the images the deploy runs, as their registry holds them (registryImageId). */
  readonly images: { readonly web: string; readonly worker: string };
  /** Production's limits as the harness derives them (productionLimits(environmentSettings('production'))). */
  readonly production: ProductionLimits;
  /** The report's attestation, as gh verified it against the bundle the release kept (verifyReportAttestation). */
  readonly attestation: AttestationReading;
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
  // Only a binding run, the release's, opens production: an advisory one's time warned and failed nothing.
  const mode: unknown = parsed.timeMode;
  if (mode !== 'binding') {
    reasons.push(
      `time mode: ${String(mode)}, not binding: decision 13 opens production only on a release's binding capacity run, where time fails the run, never on an advisory one, where time only warns (the founder's ruling of 2026-10-23, time advisory)`,
    );
  }
  // Provenance: the run the report records, and the release's attestation of exactly these bytes.
  const recorded = recordedRun(parsed.workflow);
  const wantedRef = releaseWorkflowRef(input.tag);
  if (recorded.ref === null) {
    reasons.push(`workflow: the report records no GitHub Actions run (no GITHUB_WORKFLOW_REF); decision 13 opens production only on the report of ${wantedRef}`);
  } else {
    if (recorded.ref !== wantedRef) {
      reasons.push(`workflow: the report was measured by ${recorded.ref}; decision 13 opens production only on the report of ${wantedRef}`);
    }
    if (!RUN_NUMBER.test(String(recorded.runId)) || !RUN_NUMBER.test(String(recorded.runAttempt))) {
      reasons.push(`workflow: run ${String(recorded.runId)}, attempt ${String(recorded.runAttempt)} is not a GitHub Actions run’s ID and attempt`);
    }
  }
  const attestation = readAttestation(input.attestation, { reportSha256: reportSha256(input.reportText), tag: input.tag, tagCommit: input.tagCommit, runId: recorded.ref === null ? null : String(recorded.runId) });
  reasons.push(...attestation.problems);
  if (parsed.verdict.pass !== true || parsed.verdict.time !== 'enforced') {
    reasons.push(`verdict: ${parsed.verdict.pass ? 'pass' : 'fail'} with time ${String(parsed.verdict.time)}; launch needs a pass with time enforced`);
  }
  // The same measurements read again by this checkout's rules, time binding whatever mode the report records: a recorded
  // verdict or mode is not taken on trust.
  const production = input.production;
  const rule: TimeRule = { consumerDeclared: production.screeningConsumer !== null, consumerRun: HARNESS_RUNS_SCREENING_CONSUMER, runnerToFargate: RUNNER_TO_FARGATE, mode: 'binding' };
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
  // The layout release.yml's runner gives production's sizes: the free runner's shared CPUs (the founder's third ruling
  // of 2026-10-23). CPUs of their own, an 8-CPU runner's, are refused until a release measures there.
  const releaseLayout = cpuLayout(production.cpuNeeds, RELEASE_RUNNER.cpus);
  reasons.push(...sizeProblems(parsed, production, releaseLayout));
  const declared = production.screeningConsumer;
  const consumer = parsed.consumer;
  if (declared === null) {
    reasons.push('consumer: environments.ts declares no screening consumer for production');
  } else if (consumer === null || consumer.tasks !== declared.desiredCount || consumer.cpus !== declared.cpu / 1024 || consumer.memoryMiB !== declared.memoryMiB || consumer.concurrency !== declared.concurrency) {
    reasons.push(
      `consumer: the report measured ${consumer === null ? 'none' : `${String(consumer.tasks)} × ${String(consumer.cpus)} vCPU, ${String(consumer.memoryMiB)} MiB, ${String(consumer.concurrency)} at once`}, and production declares ${String(declared.desiredCount)} × ${String(declared.cpu / 1024)} vCPU, ${String(declared.memoryMiB)} MiB, ${String(declared.concurrency)} at once`,
    );
  }
  const layout = parsed.expected.layout;
  if (!sameLayout(layout, releaseLayout)) {
    reasons.push(
      `layout: the report measured ${layoutText(layout)}, and decision 13 opens production only on the layout release.yml's runner (${RELEASE_RUNNER.label}, ${String(RELEASE_RUNNER.cpus)} CPUs) gives production's sizes: ${layoutText(releaseLayout)}`,
    );
  }
  if (reasons.length > 0) {
    return { ok: false, reasons };
  }
  const notes = [provenanceNote(wantedRef, recorded, attestation.attempt)];
  // The sizing question read again from the measurements, S4's from its middle run, as the gate's warning gives it.
  const worst = sizing(parsed);
  const upload = String(worst.worstUpload);
  if (worst.question) {
    notes.push(`sizing: the worst time, ${upload}’s ${((worst.worstMs ?? 0) / 1000).toFixed(1)} s${middleRunNote(upload, middle, '’')}, is above 44 s (open item O9: the founder’s sizing question)`);
  }
  return { ok: true, value: `${input.tag}:${reportSha256(input.reportText)}`, notes };
}

/** The run a report records, every field null when it records none or not as a run's fields. */
function recordedRun(workflow: unknown): WorkflowRun {
  if (!isRecord(workflow) || typeof workflow.ref !== 'string' || workflow.ref === '') {
    return { ref: null, runId: null, runAttempt: null };
  }
  const field = (value: unknown): string | null => (typeof value === 'string' ? value : null);
  return { ref: workflow.ref, runId: field(workflow.runId), runAttempt: field(workflow.runAttempt) };
}

/** The launch value's note of where the report came from: the release's run, the attempt that measured and the one that attested. */
function provenanceNote(ref: string, recorded: WorkflowRun, attestedAttempt: string | null): string {
  const runId = String(recorded.runId);
  const rerun = recorded.runAttempt !== '1' || attestedAttempt !== '1';
  return `provenance: measured and attested by ${ref} in run ${runId} (measured in attempt ${String(recorded.runAttempt)}, attested in attempt ${String(attestedAttempt)}): ${GITHUB}/${RELEASE_REPOSITORY}/actions/runs/${runId}${
    rerun ? `; a re-run: every attempt's attestation stays in ${GITHUB}/${RELEASE_REPOSITORY}/attestations` : ''
  }`;
}

/** Each size the report measured that is not one production declares, as the harness derives them (limits.ts). */
function sizeProblems(report: Report, production: ProductionLimits, layout: CpuLayout): string[] {
  const problems: string[] = [];
  const expected = report.expected;
  for (const task of ['web', 'platform'] as const) {
    const measured = expected[task];
    const declared = production[task];
    if (measured.cpus !== declared.cpus || measured.memoryMiB !== declared.memoryMiB) {
      problems.push(`${task}: the report measured ${String(measured.cpus)} vCPU and ${String(measured.memoryMiB)} MiB, and production declares ${String(declared.cpus)} vCPU and ${String(declared.memoryMiB)} MiB`);
    }
  }
  const declaredTask = production.screening;
  if (declaredTask !== null) {
    const measured = expected.screening;
    if (measured === null || measured.cpus !== declaredTask.cpus || measured.memoryMiB !== declaredTask.memoryMiB) {
      problems.push(
        `screening consumer: the report measured each task at ${measured === null ? 'none' : `${String(measured.cpus)} vCPU and ${String(measured.memoryMiB)} MiB`}, and production declares ${String(declaredTask.cpus)} vCPU and ${String(declaredTask.memoryMiB)} MiB`,
      );
    }
    if (expected.screeningTasks !== production.screeningTasks) {
      problems.push(`screening consumer: the report measured ${String(expected.screeningTasks)} tasks, and production declares ${String(production.screeningTasks)}`);
    }
  }
  const database = production.database;
  const postgres = expected.postgres;
  if (postgres.cpus !== database.vcpus || postgres.memoryMiB !== database.memoryMiB || postgres.cpuset !== layout.postgres) {
    problems.push(
      `postgres: the report measured ${String(postgres.cpus)} vCPU and ${String(postgres.memoryMiB)} MiB on CPUs ${String(postgres.cpuset)}, and production's db.${database.instanceType} has ${String(database.vcpus)} vCPU and ${String(database.memoryMiB)} MiB, on CPUs ${layout.postgres} in the release runner's layout`,
    );
  }
  const storage = expected.storage;
  if (storage.iops !== database.iops || storage.bytesPerSecond !== database.bytesPerSecond) {
    problems.push(
      `storage: the report measured ${String(storage.iops)} IOPS and ${String(storage.bytesPerSecond)} bytes a second, and production's ${database.storageType} gives ${String(database.iops)} IOPS and ${String(database.bytesPerSecond)} bytes a second`,
    );
  }
  return problems;
}

/** What the check expects of the report's attestation. */
interface AttestationExpectation {
  /** The SHA-256 of the report's bytes as this check read them. */
  readonly reportSha256: string;
  readonly tag: string;
  readonly tagCommit: string;
  /** The run the report records measuring it, or null when it records none (refused on its own). */
  readonly runId: string | null;
}

/** A run of this repository's Actions, as a certificate's run invocation URI names it. */
const RUN_INVOCATION = new RegExp(`^${GITHUB.replaceAll('.', '\\.')}/${RELEASE_REPOSITORY}/actions/runs/([1-9][0-9]*)/attempts/([1-9][0-9]*)$`);

/**
 * gh's verified attestations read again (pure: launch-check.test.ts), every field exactly where gh compares some
 * without case or by prefix: an attestation of the report's bytes whose certificate names release.yml on the tag, this
 * repository, the tag's ref and commit, a GitHub-hosted runner, a push and the run the report records. The first such
 * attestation opens, and gives the attempt that signed it; with none, the first attestation of the report's bytes
 * names each field that differs.
 */
function readAttestation(reading: AttestationReading, expected: AttestationExpectation): { readonly problems: readonly string[]; readonly attempt: string | null } {
  if (reading.kind === 'refused') {
    return { problems: [`attestation: not verified: ${reading.reason}`], attempt: null };
  }
  let output: unknown;
  try {
    output = JSON.parse(reading.output);
  } catch {
    output = null;
  }
  if (!Array.isArray(output) || output.length === 0) {
    return { problems: ["attestation: gh's output is not a list of verified attestations"], attempt: null };
  }
  const results = output.filter(isRecord).map((entry) => (isRecord(entry.verificationResult) ? entry.verificationResult : {}));
  const statementOf = (result: Readonly<Record<string, unknown>>) => (isRecord(result.statement) ? result.statement : {});
  const ofReport = results.filter((result) => {
    const subjects = statementOf(result).subject;
    return Array.isArray(subjects) && subjects.some((subject) => isRecord(subject) && isRecord(subject.digest) && subject.digest.sha256 === expected.reportSha256);
  });
  if (ofReport.length === 0) {
    return {
      problems: [`attestation: none of the attestations gh verified names the report's SHA-256 ${expected.reportSha256} (the report changed after it was signed, or the bundle is another file's)`],
      attempt: null,
    };
  }
  const signer = `${GITHUB}/${releaseWorkflowRef(expected.tag)}`;
  const read = (result: Readonly<Record<string, unknown>>): { readonly problems: string[]; readonly attempt: string | null } => {
    const signature = isRecord(result.signature) ? result.signature : {};
    const certificate = isRecord(signature.certificate) ? signature.certificate : {};
    const problems: string[] = [];
    const exactly = (field: string, value: unknown, wanted: string, why = '') => {
      if (value !== wanted) {
        problems.push(`attestation: ${field} ${String(value)}, not ${wanted}${why}`);
      }
    };
    exactly('predicate type', statementOf(result).predicateType, SLSA_PROVENANCE);
    exactly('issuer', certificate.issuer, GITHUB_OIDC_ISSUER);
    exactly('signed by', certificate.subjectAlternativeName, signer);
    exactly('build signer', certificate.buildSignerURI, signer);
    exactly('source repository', certificate.sourceRepositoryURI, `${GITHUB}/${RELEASE_REPOSITORY}`);
    exactly('source ref', certificate.sourceRepositoryRef, `refs/tags/${expected.tag}`);
    exactly('source commit', certificate.sourceRepositoryDigest, expected.tagCommit, ` (${expected.tag}'s commit)`);
    exactly('runner', certificate.runnerEnvironment, 'github-hosted');
    exactly('trigger', certificate.buildTrigger, 'push', ' (release.yml runs on a pushed tag alone)');
    const run = RUN_INVOCATION.exec(String(certificate.runInvocationURI));
    if (run === null) {
      problems.push(`attestation: run ${String(certificate.runInvocationURI)} is not a run of ${RELEASE_REPOSITORY}`);
    } else if (expected.runId !== null && run[1] !== expected.runId) {
      problems.push(`attestation: signed in run ${String(run[1])}, and the report records run ${expected.runId}`);
    }
    return { problems, attempt: run?.[2] ?? null };
  };
  const readings = ofReport.map(read);
  const passing = readings.find((item) => item.problems.length === 0);
  return passing ?? { problems: readings[0]?.problems ?? [], attempt: null };
}

/** An image manifest's media types: the OCI one and Docker's v2 schema 2. */
const IMAGE_MANIFEST_TYPES: ReadonlySet<string> = new Set(['application/vnd.oci.image.manifest.v1+json', 'application/vnd.docker.distribution.manifest.v2+json']);
/** An index's media types: the OCI image index and Docker's manifest list. */
const INDEX_TYPES: ReadonlySet<string> = new Set(['application/vnd.oci.image.index.v1+json', 'application/vnd.docker.distribution.manifest.list.v2+json']);
/** An image config's media types: what makes a manifest a container image's rather than another artifact's. */
const CONFIG_TYPES: ReadonlySet<string> = new Set(['application/vnd.oci.image.config.v1+json', 'application/vnd.docker.container.image.v1+json']);

/**
 * The platform the images are built for and ECS runs: linux/amd64, native to every runner that builds them, with no
 * platform named (FROM node:24-trixie-slim by digest). release.yml builds them on RELEASE_RUNNER.label, and
 * screening-capacity.yml does too but for a dispatched ubuntu-26.04 probe (the founder's F5), whose report is advisory
 * and not release.yml's run, so the launch check refuses it. Every task definition declares X86_64 on Linux
 * (infra/lib/constructs/compute.ts).
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

/** A line of a command's standard error that says what went wrong, not its progress or its usage text. */
const TELLING = /error|fail|✗|unknown|not found|no such|invalid|denied|refused/i;

/**
 * Why a command failed, in one line: not installed, the last two lines of its standard error that say what went wrong
 * (gh prints its progress before them and its usage after a flag it does not know), else its last two, or its exit
 * status.
 */
export function commandFailure(command: string, error: unknown): string {
  const failed = (isRecord(error) ? error : {}) as { readonly code?: unknown; readonly status?: unknown; readonly stderr?: unknown };
  if (failed.code === 'ENOENT') {
    return `${command} is not installed (not found on PATH)`;
  }
  const lines = (typeof failed.stderr === 'string' ? failed.stderr : '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
  const telling = lines.filter((line) => TELLING.test(line));
  const said = (telling.length > 0 ? telling : lines).slice(-2).join(' ');
  return said === '' ? `exit status ${String(failed.status)}` : said.slice(0, 400);
}

const runCommand: CommandRunner = (command, args) => {
  try {
    return execFileSync(command, [...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * MIB });
  } catch (error) {
    throw new Error(commandFailure(command, error), { cause: error });
  }
};

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

/**
 * The report's attestation as `gh attestation verify` checks it against the bundle the release kept (offline: the
 * bundle on disk, not GitHub's API, which needs no login), refused unless it was signed by this repository's
 * .github/workflows/release.yml at refs/tags/<tag>, at the tag's commit, on a GitHub-hosted runner, as SLSA provenance
 * of the report's bytes; its JSON output is read again by the check (readAttestation). gh fetches Sigstore's trusted
 * root (TUF) on first use. A tag or a commit it cannot name runs nothing.
 */
export function verifyReportAttestation(reportFile: string, bundleFile: string, tag: string, tagCommit: string, run: CommandRunner = runCommand): AttestationReading {
  if (!RELEASE_TAG.test(tag)) {
    return { kind: 'refused', reason: `${tag} is not a release tag` };
  }
  if (!COMMIT.test(tagCommit)) {
    return { kind: 'refused', reason: `the commit ${tag} names is not known: ${tagCommit}` };
  }
  try {
    const output = run('gh', [
      'attestation',
      'verify',
      reportFile,
      '--bundle',
      bundleFile,
      '--hostname',
      'github.com',
      '--repo',
      RELEASE_REPOSITORY,
      '--signer-workflow',
      `${RELEASE_REPOSITORY}/${RELEASE_WORKFLOW}`,
      '--source-ref',
      `refs/tags/${tag}`,
      '--source-digest',
      tagCommit,
      '--deny-self-hosted-runners',
      '--predicate-type',
      SLSA_PROVENANCE,
      '--format',
      'json',
    ]);
    return { kind: 'verified', output };
  } catch (error) {
    return { kind: 'refused', reason: `gh: ${error instanceof Error ? error.message : String(error)}` };
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
    options: { report: { type: 'string' }, attestation: { type: 'string' }, tag: { type: 'string' }, 'web-image': { type: 'string' }, 'worker-image': { type: 'string' } },
    strict: true,
  });
  if (values.report === undefined || values.attestation === undefined || values.tag === undefined || values['web-image'] === undefined || values['worker-image'] === undefined) {
    process.stderr.write(
      'usage: pnpm exec tsx tools/screening-capacity/launch-check.ts --report <screening-capacity.json> --attestation <screening-capacity.sigstore.json> --tag <tag> --web-image <reference> --worker-image <reference>\n',
    );
    return 2;
  }
  const tag = values.tag;
  const tagCommit = tagCommitOf(tag);
  const report = path.resolve(values.report);
  const result = launchCheck({
    reportText: readFileSync(report, 'utf8'),
    tag,
    tagCommit,
    images: { web: registryImageId(values['web-image']), worker: registryImageId(values['worker-image']) },
    production: productionLimits(environmentSettings('production')),
    attestation: verifyReportAttestation(report, path.resolve(values.attestation), tag, tagCommit),
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

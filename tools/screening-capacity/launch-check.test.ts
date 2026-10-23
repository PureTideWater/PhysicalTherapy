import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { environmentSettings } from '../../infra/lib/environments';
import * as deployParameters from '../../infra/lib/deploy-parameters';
import { type CommandRunner, type LaunchInput, RELEASE_TAG, launchCheck, readManifest, registryImageId, reportSha256, repositoryOf } from './launch-check';
import { MIB } from './limits';
import { type Measurements, report } from './report';
import { ENFORCED, OPEN, applied, expected, measured, scenario, upload, withS1, withoutConsumer } from './test-support/measurements';

/**
 * Decision 13's launch check (docs/adr/0062; the design's §5.4; test matrix SCR-20), on synthetic reports: production's
 * screening opens only for the deployed tag's passing report with time enforced, on both image IDs and the consumer
 * production declares; anything else names its reason and gives no launch value.
 */

const TAG = 'v1.4.0';
const COMMIT = 'f'.repeat(40);
const WEB = `sha256:${'a'.repeat(64)}`;
const WORKER = `sha256:${'b'.repeat(64)}`;

/** A report's bytes as the harness writes them. */
function kept(measurements: Measurements = measured(), rule = ENFORCED): string {
  return `${JSON.stringify(report(measurements, rule), null, 2)}\n`;
}

function input(overrides: Partial<LaunchInput> = {}): LaunchInput {
  return { reportText: kept(), tag: TAG, tagCommit: COMMIT, images: { web: WEB, worker: WORKER }, settings: environmentSettings('production'), ...overrides };
}

function reasons(overrides: Partial<LaunchInput>): readonly string[] {
  const result = launchCheck(input(overrides));
  expect(result.ok).toBe(false);
  return result.ok ? [] : result.reasons;
}

describe('the launch check', () => {
  it('passes the tag’s passing report with time enforced, on both image IDs, and prints the tag and the report’s SHA-256', () => {
    const text = kept();
    const result = launchCheck(input({ reportText: text }));
    expect(result).toEqual({ ok: true, value: `${TAG}:${reportSha256(text)}`, notes: [] });
    // The value the CDK app sets is one the stack and the web accept (infra/lib/deploy-parameters.ts).
    const pattern = (deployParameters as Readonly<Record<string, unknown>>).SCREENING_LAUNCH_PATTERN;
    expect(typeof pattern).toBe('string');
    expect(result.ok && new RegExp(String(pattern)).test(result.value)).toBe(true);
    expect(reportSha256(text)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('fails a failing report', () => {
    const slow = measured({ scenarios: withS1(scenario({}, [upload({ emailedMs: 1_000 + 48_100 })])) });
    expect(reasons({ reportText: kept(slow) })).toEqual([
      'verdict: fail with time enforced; launch needs a pass with time enforced',
      'verdict read again: fail with time enforced (time: S1-1 48.1 s, fail (allowance: above 48 s on the runner))',
    ]);
  });

  it('fails a report whose time was open, however fast', () => {
    expect(reasons({ reportText: kept(measured(), OPEN) })).toEqual(['verdict: pass with time open, PR 6b; launch needs a pass with time enforced']);
  });

  it('reads the measurements again rather than trust a recorded pass', () => {
    const slow = measured({ scenarios: withS1(scenario({}, [upload({ emailedMs: 1_000 + 60_100 })])) });
    const edited = JSON.parse(kept(slow)) as { verdict: unknown };
    edited.verdict = { pass: true, time: 'enforced', reasons: [] };
    expect(reasons({ reportText: JSON.stringify(edited) })).toEqual(['verdict read again: fail with time enforced (time: S1-1 60.1 s, fail (promise broken: above 60 s))']);
  });

  it('fails a report of another commit than the tag’s', () => {
    expect(reasons({ tagCommit: 'e'.repeat(40) })).toEqual([`commit: the report measured ${COMMIT}, and ${TAG} is ${'e'.repeat(40)}`]);
    expect(reasons({ tagCommit: 'no tag v1.4.0 in this checkout (git fetch --tags)' })).toEqual(['commit: the tag’s commit no tag v1.4.0 in this checkout (git fetch --tags) is not a full commit hash']);
  });

  it('fails a worker image other than the one measured', () => {
    const other = `sha256:${'c'.repeat(64)}`;
    expect(reasons({ images: { web: WEB, worker: other } })).toEqual([`worker image: the report measured ${WORKER}, and the image being deployed is ${other}`]);
  });

  it('fails a web image other than the one measured (a rebuild, or the image built for another origin)', () => {
    const other = `sha256:${'d'.repeat(64)}`;
    expect(reasons({ images: { web: other, worker: WORKER } })).toEqual([`web image: the report measured ${WEB}, and the image being deployed is ${other}`]);
    expect(reasons({ images: { web: 'not found: web-production:v1.4.0', worker: WORKER } })).toEqual(['web image: no config digest for the image being deployed: not found: web-production:v1.4.0']);
  });

  it('fails a consumer measured at another size than production declares', () => {
    const smaller = measured({ consumer: { tasks: 1, cpus: 1, memoryMiB: 2048, concurrency: 2 } });
    const result = reasons({ reportText: kept(smaller) });
    expect(result).toContain('consumer: the report measured 1 × 1 vCPU, 2048 MiB, 2 at once, and production declares 1 × 2 vCPU, 4096 MiB, 3 at once');
    expect(reasons({ settings: withoutConsumer() })).toContain('consumer: environments.ts declares no screening consumer for production');
  });

  it('fails a report that measured the web at another size than production declares (a report from before the founder’s ruling of 2026-10-22)', () => {
    const quarter = applied({
      containers: applied().containers.map((item) => (item.name === 'web' ? { ...item, nanoCpus: 250_000_000, memoryBytes: 512 * MIB, memorySwapBytes: 512 * MIB } : item)),
    });
    const older = measured({ expected: { ...expected, web: { cpus: 0.25, memoryMiB: 512 } }, applied: quarter });
    expect(reasons({ reportText: kept(older) })).toEqual(['web: the report measured 0.25 vCPU and 512 MiB, and production declares 0.5 vCPU and 1024 MiB']);
  });

  it('fails a process-runtime report, whose Postgres was not limited', () => {
    expect(reasons({ reportText: kept(measured({ runtime: 'process', images: { web: null, worker: null } })) })).toEqual([
      'runtime: process, not docker (only the Docker runtime measures under production’s limits)',
      `web image: the report measured null, and the image being deployed is ${WEB}`,
      `worker image: the report measured null, and the image being deployed is ${WORKER}`,
    ]);
  });

  it('fails a malformed tag, an older format, and a file that is not a complete report', () => {
    expect(RELEASE_TAG.test(TAG)).toBe(true);
    expect(reasons({ tag: 'latest' })).toEqual(['tag: latest is not a release tag (v followed by letters, digits, dots and hyphens)']);
    const older = { ...(JSON.parse(kept()) as Record<string, unknown>), format: 'tp-screening-capacity/3' };
    expect(reasons({ reportText: JSON.stringify(older) })).toEqual(['report: format tp-screening-capacity/3, not tp-screening-capacity/4']);
    expect(reasons({ reportText: 'not json' })).toEqual(['report: not JSON']);
    expect(reasons({ reportText: JSON.stringify({ format: 'tp-screening-capacity/4' }) })).toEqual(['report: not a complete capacity report']);
  });

  it('passes a worst time above 44 s with a note of the founder’s sizing question, which the merge settles, not the launch', () => {
    const near = measured({ scenarios: withS1(scenario({}, [upload({ emailedMs: 1_000 + 45_200 })])) });
    const result = launchCheck(input({ reportText: kept(near) }));
    expect(result.ok && result.notes).toEqual(['sizing: the worst time, S1-1’s 45.2 s, is above 44 s (open item O9: the founder’s sizing question)']);
  });
});

/*
 * The deploy side's image IDs (the verification of PR 6b-3): the config digest of the image the registry holds, read from
 * its manifest and never from the deployer's local image store, so the check compares what the harness records on the
 * runner's classic store (`docker image inspect -f {{.Id}}`, the image's config digest) with the same thing. Under
 * Docker's containerd image store `{{.Id}}` is the manifest's or the index's digest, which never matches.
 */

const DOCKER_MANIFEST = 'application/vnd.docker.distribution.manifest.v2+json';
const DOCKER_LIST = 'application/vnd.docker.distribution.manifest.list.v2+json';
const OCI_MANIFEST = 'application/vnd.oci.image.manifest.v1+json';
const OCI_INDEX = 'application/vnd.oci.image.index.v1+json';
const DOCKER_CONFIG = 'application/vnd.docker.container.image.v1+json';
const OCI_CONFIG = 'application/vnd.oci.image.config.v1+json';
const LAYER = `sha256:${'e'.repeat(64)}`;
const WEB_REPOSITORY = '123456789012.dkr.ecr.us-east-1.amazonaws.com/tp-production-web';
const WORKER_REPOSITORY = '123456789012.dkr.ecr.us-east-1.amazonaws.com/tp-production-worker';
const WEB_REFERENCE = `${WEB_REPOSITORY}:${TAG}`;
const WORKER_REFERENCE = `${WORKER_REPOSITORY}:${TAG}`;

/** The digest a registry names a manifest by: the SHA-256 of its bytes. */
function digestOf(raw: string): string {
  return `sha256:${createHash('sha256').update(raw).digest('hex')}`;
}

/** An image manifest's bytes as a registry serves them. */
function imageManifest(mediaType: string, config: string, configType = mediaType === DOCKER_MANIFEST ? DOCKER_CONFIG : OCI_CONFIG): string {
  const layerType = mediaType === DOCKER_MANIFEST ? 'application/vnd.docker.image.rootfs.diff.tar.gzip' : 'application/vnd.oci.image.layer.v1.tar+gzip';
  return JSON.stringify({ schemaVersion: 2, mediaType, config: { mediaType: configType, digest: config, size: 7_023 }, layers: [{ mediaType: layerType, digest: LAYER, size: 32_654 }] }, null, 3);
}

interface Entry {
  readonly digest: string;
  readonly os: string;
  readonly architecture: string;
  readonly variant?: string;
  readonly mediaType?: string;
}

/** An index's bytes: one entry per platform, as buildx and docker manifest write them. */
function index(mediaType: string, entries: readonly Entry[]): string {
  const manifestType = mediaType === DOCKER_LIST ? DOCKER_MANIFEST : OCI_MANIFEST;
  return JSON.stringify({
    schemaVersion: 2,
    mediaType,
    manifests: entries.map((entry) => ({
      mediaType: entry.mediaType ?? manifestType,
      digest: entry.digest,
      size: 1_234,
      platform: { architecture: entry.architecture, os: entry.os, ...(entry.variant === undefined ? {} : { variant: entry.variant }) },
    })),
  });
}

/** A build's attestation manifest, which an index lists as unknown/unknown. */
const ATTESTATION: Entry = { digest: `sha256:${'9'.repeat(64)}`, os: 'unknown', architecture: 'unknown' };
const ARM64: Entry = { digest: `sha256:${'8'.repeat(64)}`, os: 'linux', architecture: 'arm64', variant: 'v8' };

/** A registry as `docker buildx imagetools inspect --raw <reference>` reads it, recording every command run. */
function registry(manifests: Readonly<Record<string, string>>): { readonly run: CommandRunner; readonly calls: string[][] } {
  const calls: string[][] = [];
  const run: CommandRunner = (command, args) => {
    calls.push([command, ...args]);
    const reference = args.at(-1) ?? '';
    const raw = manifests[reference];
    if (command !== 'docker' || args.length !== 5 || args.slice(0, 4).join(' ') !== 'buildx imagetools inspect --raw' || raw === undefined) {
      throw new Error('exit status 1');
    }
    return raw;
  };
  return { run, calls };
}

describe('the registry’s manifest (readManifest)', () => {
  it('gives an image manifest’s config digest, in the Docker v2 and the OCI media types', () => {
    expect(readManifest(imageManifest(DOCKER_MANIFEST, WEB))).toEqual({ kind: 'config', digest: WEB });
    expect(readManifest(imageManifest(OCI_MANIFEST, WORKER))).toEqual({ kind: 'config', digest: WORKER });
  });

  it('resolves an index to its linux/amd64 manifest, the platform the release builds and ECS runs, past other platforms and attestations', () => {
    const amd64 = `sha256:${'7'.repeat(64)}`;
    expect(readManifest(index(OCI_INDEX, [ARM64, { digest: amd64, os: 'linux', architecture: 'amd64' }, ATTESTATION]))).toEqual({ kind: 'platform', digest: amd64 });
    expect(readManifest(index(DOCKER_LIST, [{ digest: amd64, os: 'linux', architecture: 'amd64' }, ARM64]))).toEqual({ kind: 'platform', digest: amd64 });
  });

  it('refuses an index without a linux/amd64 manifest, naming what it holds, and one with more than one', () => {
    expect(readManifest(index(OCI_INDEX, [ARM64, ATTESTATION]))).toEqual({ kind: 'refused', reason: 'no linux/amd64 manifest in its index (it holds linux/arm64/v8, unknown/unknown)' });
    expect(readManifest(index(OCI_INDEX, [{ digest: ARM64.digest, os: 'windows', architecture: 'amd64' }]))).toEqual({ kind: 'refused', reason: 'no linux/amd64 manifest in its index (it holds windows/amd64)' });
    expect(readManifest(index(OCI_INDEX, []))).toEqual({ kind: 'refused', reason: 'no linux/amd64 manifest in its index (it holds none)' });
    const two = index(OCI_INDEX, [
      { digest: `sha256:${'7'.repeat(64)}`, os: 'linux', architecture: 'amd64' },
      { digest: `sha256:${'6'.repeat(64)}`, os: 'linux', architecture: 'amd64', variant: 'v3' },
    ]);
    expect(readManifest(two)).toEqual({ kind: 'refused', reason: '2 linux/amd64 manifests in its index, not one' });
  });

  it('refuses an unexpected media type: an old schema 1 manifest, an artifact, a manifest that names none, an index entry that is not an image manifest', () => {
    expect(readManifest(JSON.stringify({ schemaVersion: 1, mediaType: 'application/vnd.docker.distribution.manifest.v1+prettyjws', fsLayers: [] }))).toEqual({
      kind: 'refused',
      reason: 'an unexpected media type application/vnd.docker.distribution.manifest.v1+prettyjws',
    });
    expect(readManifest(JSON.stringify({ schemaVersion: 2, config: { mediaType: OCI_CONFIG, digest: WEB }, layers: [] }))).toEqual({ kind: 'refused', reason: 'an unexpected media type (none)' });
    expect(readManifest(imageManifest(OCI_MANIFEST, WEB, 'application/vnd.cncf.helm.config.v1+json'))).toEqual({
      kind: 'refused',
      reason: 'an unexpected config media type application/vnd.cncf.helm.config.v1+json',
    });
    expect(readManifest(index(OCI_INDEX, [{ digest: WEB, os: 'linux', architecture: 'amd64', mediaType: OCI_INDEX }]))).toEqual({
      kind: 'refused',
      reason: `an unexpected media type ${OCI_INDEX} for its linux/amd64 manifest`,
    });
  });

  it('refuses malformed output: not JSON, not an object, no config, a config or platform digest that is not sha256, an index with no list', () => {
    expect(readManifest('')).toEqual({ kind: 'refused', reason: 'not a manifest (malformed JSON)' });
    expect(readManifest('{"schemaVersion": 2,')).toEqual({ kind: 'refused', reason: 'not a manifest (malformed JSON)' });
    expect(readManifest('[]')).toEqual({ kind: 'refused', reason: 'not a manifest (not a JSON object)' });
    expect(readManifest('null')).toEqual({ kind: 'refused', reason: 'not a manifest (not a JSON object)' });
    expect(readManifest(JSON.stringify({ schemaVersion: 2, mediaType: OCI_MANIFEST, layers: [] }))).toEqual({ kind: 'refused', reason: 'an image manifest with no config' });
    expect(readManifest(imageManifest(DOCKER_MANIFEST, `sha512:${'a'.repeat(128)}`))).toEqual({ kind: 'refused', reason: 'a config digest that is not sha256:<64 hex>' });
    expect(readManifest(imageManifest(DOCKER_MANIFEST, 'sha256:ABC'))).toEqual({ kind: 'refused', reason: 'a config digest that is not sha256:<64 hex>' });
    expect(readManifest(index(OCI_INDEX, [{ digest: 'sha256:short', os: 'linux', architecture: 'amd64' }]))).toEqual({
      kind: 'refused',
      reason: 'a linux/amd64 manifest digest that is not sha256:<64 hex>',
    });
    expect(readManifest(JSON.stringify({ schemaVersion: 2, mediaType: OCI_INDEX }))).toEqual({ kind: 'refused', reason: 'an index with no manifests' });
  });

  it('names a reference’s repository without its tag or digest, a registry’s port kept', () => {
    expect(repositoryOf(WEB_REFERENCE)).toBe(WEB_REPOSITORY);
    expect(repositoryOf(`${WEB_REPOSITORY}@${WEB}`)).toBe(WEB_REPOSITORY);
    expect(repositoryOf(`${WEB_REPOSITORY}:${TAG}@${WEB}`)).toBe(WEB_REPOSITORY);
    expect(repositoryOf('localhost:5000/tp-web')).toBe('localhost:5000/tp-web');
    expect(repositoryOf('localhost:5000/tp-web:v1.4.0')).toBe('localhost:5000/tp-web');
  });
});

describe('the deployed image’s config digest (registryImageId)', () => {
  it('reads a manifest from the registry alone: nothing is pulled and no local image is inspected', () => {
    const { run, calls } = registry({ [WEB_REFERENCE]: imageManifest(DOCKER_MANIFEST, WEB) });
    expect(registryImageId(WEB_REFERENCE, run)).toBe(WEB);
    expect(calls).toEqual([['docker', 'buildx', 'imagetools', 'inspect', '--raw', WEB_REFERENCE]]);
  });

  it('resolves an index to its linux/amd64 manifest, read by digest from the same repository', () => {
    const manifest = imageManifest(OCI_MANIFEST, WEB);
    const amd64 = `${WEB_REPOSITORY}@${digestOf(manifest)}`;
    const { run, calls } = registry({ [WEB_REFERENCE]: index(OCI_INDEX, [ARM64, { digest: digestOf(manifest), os: 'linux', architecture: 'amd64' }, ATTESTATION]), [amd64]: manifest });
    expect(registryImageId(WEB_REFERENCE, run)).toBe(WEB);
    expect(calls.map((call) => call.at(-1))).toEqual([WEB_REFERENCE, amd64]);
  });

  it('names what failed: not read from the registry, the platform manifest not found, no linux/amd64 manifest, an unexpected media type', () => {
    expect(registryImageId(WEB_REFERENCE, registry({}).run)).toBe(`not read from its registry: ${WEB_REFERENCE} (docker login to it first)`);
    const missing = `sha256:${'7'.repeat(64)}`;
    expect(registryImageId(WEB_REFERENCE, registry({ [WEB_REFERENCE]: index(OCI_INDEX, [{ digest: missing, os: 'linux', architecture: 'amd64' }]) }).run)).toBe(
      `not found: ${WEB_REPOSITORY}@${missing} (the linux/amd64 manifest of ${WEB_REFERENCE})`,
    );
    expect(registryImageId(WEB_REFERENCE, registry({ [WEB_REFERENCE]: index(OCI_INDEX, [ARM64]) }).run)).toBe(`${WEB_REFERENCE}: no linux/amd64 manifest in its index (it holds linux/arm64/v8)`);
    expect(registryImageId(WEB_REFERENCE, registry({ [WEB_REFERENCE]: '{"mediaType":"application/vnd.oci.artifact.manifest.v1+json"}' }).run)).toBe(
      `${WEB_REFERENCE}: an unexpected media type application/vnd.oci.artifact.manifest.v1+json`,
    );
    expect(registryImageId(WEB_REFERENCE, registry({ [WEB_REFERENCE]: 'Error: not json' }).run)).toBe(`${WEB_REFERENCE}: not a manifest (malformed JSON)`);
    // An index whose linux/amd64 entry is itself an index once read: refused, never followed further.
    const nested = index(OCI_INDEX, [{ digest: `sha256:${'5'.repeat(64)}`, os: 'linux', architecture: 'amd64' }]);
    const entry = `${WEB_REPOSITORY}@${digestOf(nested)}`;
    expect(registryImageId(WEB_REFERENCE, registry({ [WEB_REFERENCE]: index(OCI_INDEX, [{ digest: digestOf(nested), os: 'linux', architecture: 'amd64' }]), [entry]: nested }).run)).toBe(
      `${entry} (the linux/amd64 manifest of ${WEB_REFERENCE}): an index, not an image manifest`,
    );
    const artifact = imageManifest(OCI_MANIFEST, WEB, 'application/vnd.cncf.helm.config.v1+json');
    const artifactEntry = `${WEB_REPOSITORY}@${digestOf(artifact)}`;
    expect(registryImageId(WEB_REFERENCE, registry({ [WEB_REFERENCE]: index(OCI_INDEX, [{ digest: digestOf(artifact), os: 'linux', architecture: 'amd64' }]), [artifactEntry]: artifact }).run)).toBe(
      `${artifactEntry} (the linux/amd64 manifest of ${WEB_REFERENCE}): an unexpected config media type application/vnd.cncf.helm.config.v1+json`,
    );
  });
});

describe('the launch check compares config digests', () => {
  it('passes the report’s config digests against those ECR’s manifests name, and never a manifest’s or an index’s own digest', () => {
    // The web in ECR as an OCI index (a copy pushed from a containerd image store keeps one), the worker as Docker v2.
    const webManifest = imageManifest(OCI_MANIFEST, WEB);
    const webIndex = index(OCI_INDEX, [{ digest: digestOf(webManifest), os: 'linux', architecture: 'amd64' }, ATTESTATION]);
    const workerManifest = imageManifest(DOCKER_MANIFEST, WORKER);
    const { run, calls } = registry({ [WEB_REFERENCE]: webIndex, [`${WEB_REPOSITORY}@${digestOf(webManifest)}`]: webManifest, [WORKER_REFERENCE]: workerManifest });
    // The report holds the config digests the harness read on the runner (test-support: WEB and WORKER).
    const images = { web: registryImageId(WEB_REFERENCE, run), worker: registryImageId(WORKER_REFERENCE, run) };
    expect(images).toEqual({ web: WEB, worker: WORKER });
    expect(launchCheck(input({ images })).ok).toBe(true);
    expect(calls.every((call) => call.slice(0, 5).join(' ') === 'docker buildx imagetools inspect --raw')).toBe(true);
    // What `docker image inspect -f {{.Id}}` gives after a pull under the containerd image store: the index's and the
    // manifest's own digests. The check refuses them, so the deploy side must read the config digests, as it does.
    const storeIds = { web: digestOf(webIndex), worker: digestOf(workerManifest) };
    expect(reasons({ images: storeIds })).toEqual([
      `web image: the report measured ${WEB}, and the image being deployed is ${storeIds.web}`,
      `worker image: the report measured ${WORKER}, and the image being deployed is ${storeIds.worker}`,
    ]);
  });

  it('refuses an image in ECR whose config is not the one measured', () => {
    const other = `sha256:${'c'.repeat(64)}`;
    const { run } = registry({ [WEB_REFERENCE]: imageManifest(DOCKER_MANIFEST, WEB), [WORKER_REFERENCE]: imageManifest(OCI_MANIFEST, other) });
    expect(reasons({ images: { web: registryImageId(WEB_REFERENCE, run), worker: registryImageId(WORKER_REFERENCE, run) } })).toEqual([
      `worker image: the report measured ${WORKER}, and the image being deployed is ${other}`,
    ]);
  });
});

import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';
import { stringify } from 'yaml';

import { type CheckEvent, type Finding, type Tree, checkOffline, checkToolchain } from './check';
import { type HubTag, type HubTagPage, NetworkReadError, type Packument, type Registry } from './registry';

/**
 * The image rule (docs/adr/0066, Part 5; test matrix CI-22): every image digest the tree names that its base names
 * nowhere is held to the release-age floor, measured from the push time Docker Hub recorded, through `checkToolchain`
 * as `pnpm toolchain:check` runs it. Everything is synthetic: made-up repositories, digests hashed from a seed, and
 * recorded Docker Hub answers (no network). Now is 2026-10-26T00:00Z throughout, so a digest pushed after
 * 2026-10-23T00:00Z is under three days old.
 */
const NOW = new Date('2026-10-26T00:00:00.000Z');

/** A synthetic sha256 digest, hashed from a seed. */
const digest = (seed: string) => `sha256:${createHash('sha256').update(`synthetic image ${seed}`).digest('hex')}`;

/** The base's builder-stage image in both Dockerfiles, and its repository and tag on Docker Hub. */
const NODE = `synthetic/node:24-slim@${digest('node 1')}`;

/** docker-compose.yml's database image, and the builder every setup-buildx step names, in both trees unless a case changes them. */
const POSTGRES = `syntheticdb:18@${digest('db 1')}`;
const BUILDER = `synthetic/buildkit:v0.1.0@${digest('builder 1')}`;

/** Push times: long past, and 1 day ago (three days old from 2026-10-28T00:00Z). */
const OLD = '2026-10-01T00:00:00.000Z';
const YOUNG = '2026-10-25T00:00:00.000Z';
const YOUNG_MATURE = '2026-10-28T00:00:00.000Z';

const RUNBOOK = 'docs/runbooks/dependency-upgrades.md, "Base images and PostgreSQL"';
const REMEDY = `wait until then, or, for a security fix, add a security-fix entry for it to tools/check-toolchain/image-age-exceptions.json with its advisory, the package and version it fixes, the date added and an expiry (${RUNBOOK})`;

/** The npm side, held still: one pnpm, old, whose tarball's sha512 packageManager carries, and one locked package in both trees. */
const PNPM = '10.34.8';
const PNPM_SHA512 = createHash('sha512').update('synthetic pnpm').digest();
const PNPM_PACKUMENT: Packument = {
  name: 'pnpm',
  versions: [PNPM],
  time: { [PNPM]: '2026-01-01T00:00:00.000Z' },
  facts: { [PNPM]: { integrity: `sha512-${PNPM_SHA512.toString('base64')}`, evidence: null, dependencies: {} } },
};

/** A Docker Hub tag as `/v2/repositories/<repository>/tags/<tag>` gives it, every time the same unless given. */
function tag(name: string, pinned: string, pushed: string, images: readonly { readonly digest: string; readonly last_pushed: string }[] = []): HubTag {
  return { name, digest: pinned, tag_last_pushed: pushed, last_updated: pushed, images };
}

/** Docker Hub as it stands for the base's images: each tag names its digest, pushed long ago. */
const EVERY_TAG: Readonly<Record<string, HubTag>> = {
  'synthetic/node:24-slim': tag('24-slim', digest('node 1'), OLD),
  'library/syntheticdb:18': tag('18', digest('db 1'), OLD),
  'synthetic/buildkit:v0.1.0': tag('v0.1.0', digest('builder 1'), OLD),
};

interface Hub {
  /** `<repository>:<tag>` (Docker Hub's repository, `library/<name>` for an official image) to its tag; absent: HTTP 404. */
  readonly tags?: Readonly<Record<string, HubTag>>;
  /** A repository's tags, most recently updated first, as its tag list pages them (100 a page). */
  readonly lists?: Readonly<Record<string, readonly HubTag[]>>;
  /** Reads that fail closed: `tag <repository>:<tag>` or `tags <repository>`. */
  readonly fail?: readonly string[];
  /** Tag reads that answer only when the deadline ends them, as a read in flight does. */
  readonly hang?: readonly string[];
}

/** A registry that answers npm's reads for the pnpm above, and Docker Hub's from a recorded table, keeping every Hub read. */
function fakeRegistry(hub: Hub = {}): Registry & { readonly reads: string[] } {
  const reads: string[] = [];
  return {
    reads,
    packument: (name) => (name === 'pnpm' ? Promise.resolve(PNPM_PACKUMENT) : Promise.reject(new NetworkReadError(`registry.npmjs.org: ${name} is not in this synthetic registry`))),
    advisories: () => Promise.resolve({}),
    hubTag(repository: string, name: string, signal?: AbortSignal): Promise<HubTag | null> {
      const key = `${repository}:${name}`;
      reads.push(`tag ${key}`);
      if (hub.fail?.includes(`tag ${key}`)) {
        return Promise.reject(new NetworkReadError(`hub.docker.com: reading ${key}'s Docker Hub tag failed after 3 tries with backoff (last: HTTP 503); check-toolchain fails closed`));
      }
      if (hub.hang?.includes(`tag ${key}`)) {
        return new Promise((_, reject) => {
          signal?.addEventListener('abort', () => reject(new NetworkReadError(`hub.docker.com: reading ${key}'s Docker Hub tag stopped at the deadline after 1 try; check-toolchain fails closed`)), { once: true });
        });
      }
      return Promise.resolve(hub.tags?.[key] ?? null);
    },
    hubTags(repository: string, page: number): Promise<HubTagPage> {
      reads.push(`tags ${repository} ${String(page)}`);
      if (hub.fail?.includes(`tags ${repository}`)) {
        return Promise.reject(new NetworkReadError(`hub.docker.com: reading ${repository}'s Docker Hub tags (page ${String(page)}) failed after 3 tries with backoff (last: HTTP 503); check-toolchain fails closed`));
      }
      const all = hub.lists?.[repository] ?? [];
      return Promise.resolve({ tags: all.slice((page - 1) * 100, page * 100), next: all.length > page * 100 });
    },
  };
}

/** A Dockerfile that installs pnpm as the Dockerfiles rule requires, built FROM `image`, with `extra` lines after. */
const dockerfile = (image: string, extra: readonly string[] = []) =>
  [`FROM ${image} AS build`, 'COPY package.json ./', 'COPY tools/check-toolchain/install-pnpm.sh /tmp/install-pnpm.sh', 'RUN sh /tmp/install-pnpm.sh package.json && rm /tmp/install-pnpm.sh', ...extra].join('\n');

/** A compose file with one database service. */
const compose = (image: string) => stringify({ name: 'synthetic', services: { db: { image } } });

/** A workflow whose images job sets up buildx on `builder` and builds the web image. */
const buildx = (builder: string) =>
  stringify({
    name: 'synthetic',
    on: 'push',
    jobs: {
      images: {
        'runs-on': 'ubuntu-26.04',
        steps: [
          { uses: `docker/setup-buildx-action@${'1'.repeat(40)}`, with: { 'driver-opts': `image=${builder}` } },
          { uses: `docker/build-push-action@${'2'.repeat(40)}`, with: { context: '.', file: 'apps/web/Dockerfile' } },
        ],
      },
    },
  });

/** A young image a Dockerfile can hide from a reader that is not BuildKit's (SEC-S1), and Docker Hub's answer for it. */
const HIDDEN = `synthetic/hidden:1@${digest('hidden')}`;
const hiddenHub = () => fakeRegistry({ tags: { 'synthetic/hidden:1': tag('1', digest('hidden'), YOUNG) } });

/** The lines before a hidden FROM that a reader unlike BuildKit's misreads, each with any directives the file opens with. */
const HIDING: readonly { readonly name: string; readonly directives: readonly string[]; readonly tail: readonly string[]; readonly from: number }[] = [
  { name: 'a here-string, which is no heredoc', directives: [], tail: ['RUN tr a b <<<abc', `FROM ${HIDDEN} AS hidden`], from: 1 },
  { name: 'a quoted "<<EOF", which is no heredoc', directives: [], tail: ['RUN echo "<<EOF"', `FROM ${HIDDEN} AS hidden`], from: 1 },
  { name: 'a heredoc whose terminator is the whole word, EOF-1', directives: [], tail: ['RUN <<EOF-1', 'echo synthetic', 'EOF-1', `FROM ${HIDDEN} AS hidden`], from: 3 },
  { name: 'an escaped trailing escape, which continues nothing', directives: [], tail: ['RUN echo foo \\\\', `FROM ${HIDDEN} AS hidden`], from: 1 },
  { name: 'a directive whose value has a space, before # escape=`', directives: ['# check=skip=all; error=false', '# escape=`'], tail: ['RUN echo \\', `FROM ${HIDDEN} AS hidden`], from: 1 },
  { name: 'a byte-order mark before # escape=`', directives: ['\uFEFF# escape=`'], tail: ['RUN echo \\', `FROM ${HIDDEN} AS hidden`], from: 1 },
  { name: 'a FROM keyword split by a continuation, joined with no space as BuildKit joins it', directives: [], tail: ['FR\\', `OM ${HIDDEN} AS hidden`], from: 0 },
];

interface Shape {
  /** apps/web/Dockerfile's image (NODE). */
  readonly web?: string;
  /** apps/worker/Dockerfile's image (NODE). */
  readonly worker?: string;
  /** The Dockerfiles whole, in place of the two above. */
  readonly dockerfiles?: Readonly<Record<string, string>>;
  /** docker-compose.yml's text (absent: no compose file). */
  readonly compose?: string;
  /** The workflows by root-relative path (none). */
  readonly workflows?: Readonly<Record<string, string>>;
  /** The tracked image files outside the three the rule reads (none). */
  readonly imageFiles?: readonly string[];
  /** image-age-exceptions.json's entries; null: the file absent. */
  readonly exceptions?: readonly Record<string, unknown>[] | null;
}

/** A synthetic tree whose npm side passes every rule, so the image rule's findings are the only ones. */
function tree(shape: Shape = {}): Tree {
  return {
    packageJson: JSON.stringify({ name: 'synthetic', packageManager: `pnpm@${PNPM}+sha512.${PNPM_SHA512.toString('hex')}` }),
    workspace: stringify({ minimumReleaseAge: 4320, trustPolicy: 'no-downgrade' }),
    lockfile: stringify({ lockfileVersion: '9.0', packages: { 'old-lib@1.0.0': { resolution: { integrity: 'sha512-synthetic' } } }, snapshots: { 'old-lib@1.0.0': null } }),
    releaseAgeExceptions: JSON.stringify({ entries: [] }),
    auditExceptions: JSON.stringify({ entries: [] }),
    trustExceptions: JSON.stringify({ entries: [] }),
    overrides: JSON.stringify({ entries: [] }),
    dockerfiles: shape.dockerfiles ?? { 'apps/web/Dockerfile': dockerfile(shape.web ?? NODE), 'apps/worker/Dockerfile': dockerfile(shape.worker ?? NODE) },
    ...(shape.compose === undefined ? {} : { compose: shape.compose }),
    workflows: shape.workflows ?? {},
    imageFiles: shape.imageFiles ?? [],
    ...(shape.exceptions === null ? {} : { imageAgeExceptions: JSON.stringify({ entries: shape.exceptions ?? [] }) }),
  };
}

async function run(head: Tree, base: Tree = tree(), options: { readonly event?: CheckEvent; readonly registry?: Registry; readonly deadlineMs?: number } = {}): Promise<Finding[]> {
  return checkToolchain({ head, base, event: options.event ?? 'pull_request', now: NOW, ...(options.deadlineMs === undefined ? {} : { deadlineMs: options.deadlineMs }) }, options.registry ?? fakeRegistry());
}

const problems = (findings: readonly Finding[], level: 'error' | 'warning' = 'error') => findings.filter((finding) => finding.level === level).map((finding) => `${finding.rule}: ${finding.message}`);
/** The image rule's own lines that passed. */
const notes = (findings: readonly Finding[]) => findings.filter((finding) => finding.level === 'ok' && finding.rule === 'images').map((finding) => `images: ${finding.message}`);

describe('the image rule', () => {
  it('★ fails a digest new against the base pushed 2 days ago, naming when it turns old enough, and passes one pushed 3 days ago', async () => {
    const pinned = digest('node 2');
    const young = `synthetic/node:24-slim@${pinned}`;
    const head = tree({ web: young });
    const twoDays = fakeRegistry({ tags: { 'synthetic/node:24-slim': tag('24-slim', pinned, '2026-10-24T00:00:00.000Z') } });
    expect(problems(await run(head, tree(), { registry: twoDays }))).toEqual([
      `images: ${young} (apps/web/Dockerfile:1) was pushed 2026-10-24T00:00:00.000Z (Docker Hub's tag_last_pushed of the tag 24-slim), under three days ago; it is old enough from 2026-10-27T00:00:00.000Z: ${REMEDY}`,
    ]);
    // Only the new digest is read: the worker's is the base's.
    expect(twoDays.reads).toEqual(['tag synthetic/node:24-slim']);
    const threeDays = fakeRegistry({ tags: { 'synthetic/node:24-slim': tag('24-slim', pinned, '2026-10-23T00:00:00.000Z') } });
    const passed = await run(head, tree(), { registry: threeDays });
    expect(problems(passed)).toEqual([]);
    expect(problems(passed, 'warning')).toEqual([]);
    expect(notes(passed)).toEqual([`images: ${young} (apps/web/Dockerfile:1) was pushed 2026-10-23T00:00:00.000Z (Docker Hub's tag_last_pushed of the tag 24-slim), at least three days ago`]);
  });

  it('★ reads nothing when every digest is the base’s, though Docker Hub would answer that the tag moved on, and says so', async () => {
    // The same digest in a Dockerfile whose other lines changed, and a Hub whose tag now names another digest pushed an hour ago.
    const moved = fakeRegistry({ tags: { 'synthetic/node:24-slim': tag('24-slim', digest('node 9'), '2026-10-25T23:00:00.000Z') }, lists: { 'synthetic/node': [tag('24-slim', digest('node 9'), '2026-10-25T23:00:00.000Z')] } });
    const head = tree({ dockerfiles: { 'apps/web/Dockerfile': dockerfile(NODE, ['RUN echo synthetic']), 'apps/worker/Dockerfile': dockerfile(NODE) } });
    const findings = await run(head, tree(), { registry: moved });
    expect(problems(findings)).toEqual([]);
    expect(problems(findings, 'warning')).toEqual([]);
    expect(moved.reads).toEqual([]);
    expect(notes(findings)).toEqual(['images: no image is new against the base, so nothing is read (1 digest named, each one in the base)']);
  });

  it('reads only the digest a change adds, once wherever it is named, and none of the base’s', async () => {
    const pinned = digest('node 3');
    const added = `synthetic/node:24-slim@${pinned}`;
    const shared = { compose: compose(POSTGRES), workflows: { '.github/workflows/ci.yml': buildx(BUILDER) } };
    const head = tree({ ...shared, dockerfiles: { 'apps/web/Dockerfile': dockerfile(NODE), 'apps/worker/Dockerfile': dockerfile(added, [`FROM ${added} AS runtime`]) } });
    const registry = fakeRegistry({ tags: { ...EVERY_TAG, 'synthetic/node:24-slim': tag('24-slim', pinned, OLD) } });
    const findings = await run(head, tree(shared), { registry });
    expect(problems(findings)).toEqual([]);
    expect(registry.reads).toEqual(['tag synthetic/node:24-slim']);
    expect(notes(findings)).toEqual([`images: ${added} (apps/worker/Dockerfile:1, apps/worker/Dockerfile:5) was pushed ${OLD} (Docker Hub's tag_last_pushed of the tag 24-slim), at least three days ago`]);
  });

  it('takes the youngest of tag_last_pushed, last_updated and every images[].last_pushed, and matches a pin equal to a platform’s digest (N9)', async () => {
    const index = digest('node index');
    const platform = digest('node amd64');
    // The index pinned: one platform's image was pushed later than the tag says, 1.5 days ago.
    const byIndex = `synthetic/node:24-slim@${index}`;
    const late = tag('24-slim', index, '2026-10-10T00:00:00.000Z', [{ digest: platform, last_pushed: '2026-10-09T00:00:00.000Z' }, { digest: digest('node arm64'), last_pushed: '2026-10-24T12:00:00.000Z' }]);
    expect(problems(await run(tree({ web: byIndex }), tree(), { registry: fakeRegistry({ tags: { 'synthetic/node:24-slim': late } }) }))).toEqual([
      `images: ${byIndex} (apps/web/Dockerfile:1) was pushed 2026-10-24T12:00:00.000Z (Docker Hub's images[].last_pushed of the tag 24-slim), under three days ago; it is old enough from 2026-10-27T12:00:00.000Z: ${REMEDY}`,
    ]);
    // One platform's manifest pinned: the tag carries it among its images, so the tag is read and not searched.
    const byPlatform = `synthetic/node:24-slim@${platform}`;
    const settled = tag('24-slim', index, '2026-10-20T00:00:00.000Z', [{ digest: platform, last_pushed: '2026-10-19T00:00:00.000Z' }]);
    const registry = fakeRegistry({ tags: { 'synthetic/node:24-slim': settled } });
    const findings = await run(tree({ web: byPlatform }), tree(), { registry });
    expect(problems(findings)).toEqual([]);
    expect(notes(findings)).toEqual([`images: ${byPlatform} (apps/web/Dockerfile:1) was pushed 2026-10-20T00:00:00.000Z (Docker Hub's tag_last_pushed of the tag 24-slim), at least three days ago`]);
    expect(registry.reads).toEqual(['tag synthetic/node:24-slim']);
  });

  it('ages the compose file’s images', async () => {
    const pinned = digest('db 2');
    const young = `syntheticdb:18@${pinned}`;
    const registry = fakeRegistry({ tags: { 'library/syntheticdb:18': tag('18', pinned, YOUNG) } });
    expect(problems(await run(tree({ compose: compose(young) }), tree({ compose: compose(POSTGRES) }), { registry }))).toEqual([
      `images: ${young} (docker-compose.yml services.db) was pushed ${YOUNG} (Docker Hub's tag_last_pushed of the tag 18), under three days ago; it is old enough from ${YOUNG_MATURE}: ${REMEDY}`,
    ]);
    // An official image is read under library/.
    expect(registry.reads).toEqual(['tag library/syntheticdb:18']);
  });

  it('ages a new builder digest on every setup-buildx step that names it, and reads no unchanged one', async () => {
    const pinned = digest('builder 2');
    const builder = `synthetic/buildkit:v0.2.0@${pinned}`;
    const steps = (image: string) => ({ '.github/workflows/ci.yml': buildx(image), '.github/workflows/release.yml': buildx(image) });
    const registry = fakeRegistry({ tags: { 'synthetic/buildkit:v0.2.0': tag('v0.2.0', pinned, YOUNG) } });
    expect(problems(await run(tree({ workflows: steps(builder) }), tree({ workflows: steps(BUILDER) }), { registry }))).toEqual([
      `images: ${builder} (.github/workflows/ci.yml images step 1, .github/workflows/release.yml images step 1) was pushed ${YOUNG} (Docker Hub's tag_last_pushed of the tag v0.2.0), under three days ago; it is old enough from ${YOUNG_MATURE}: ${REMEDY}`,
    ]);
    const unchanged = fakeRegistry({ tags: { 'synthetic/buildkit:v0.1.0': tag('v0.1.0', digest('builder 9'), YOUNG) } });
    const findings = await run(tree({ workflows: steps(BUILDER) }), tree({ workflows: steps(BUILDER) }), { registry: unchanged });
    expect(problems(findings)).toEqual([]);
    expect(unchanged.reads).toEqual([]);
  });

  it('ages a new job container, service container, docker:// step and # syntax= frontend', async () => {
    const images = ['job 1', 'job 2', 'service', 'step', 'frontend'].map((seed, at) => ({ image: `synthetic/run${String(at)}:1@${digest(seed)}`, repository: `synthetic/run${String(at)}`, pinned: digest(seed) }));
    const [job, object, service, step, frontend] = images.map(({ image }) => image) as [string, string, string, string, string];
    const workflow = stringify({
      name: 'synthetic',
      on: 'push',
      jobs: {
        a: { 'runs-on': 'ubuntu-26.04', container: job, steps: [{ run: 'true' }] },
        b: { 'runs-on': 'ubuntu-26.04', container: { image: object }, services: { cache: { image: service } }, steps: [{ uses: `docker://${step}` }] },
      },
    });
    const head = tree({ workflows: { '.github/workflows/ci.yml': workflow }, dockerfiles: { 'apps/web/Dockerfile': `# syntax=${frontend}\n${dockerfile(NODE)}`, 'apps/worker/Dockerfile': dockerfile(NODE) } });
    const registry = fakeRegistry({ tags: Object.fromEntries(images.map(({ repository, pinned }) => [`${repository}:1`, tag('1', pinned, OLD)])) });
    const findings = await run(head, tree(), { registry });
    expect(problems(findings)).toEqual([]);
    const pushed = (image: string, where: string) => `images: ${image} (${where}) was pushed ${OLD} (Docker Hub's tag_last_pushed of the tag 1), at least three days ago`;
    expect(notes(findings)).toEqual([
      pushed(frontend, 'apps/web/Dockerfile:1'),
      pushed(job, '.github/workflows/ci.yml a container'),
      pushed(object, '.github/workflows/ci.yml b container'),
      pushed(service, '.github/workflows/ci.yml b services.cache'),
      pushed(step, '.github/workflows/ci.yml b step 1'),
    ]);
    expect(registry.reads).toHaveLength(5);
  });

  it('takes the time of another tag that carries a superseded digest, and fails one found on no tag, naming the tag’s current digest and when it is old enough', async () => {
    const superseded = digest('node 4');
    const current = digest('node 5');
    const image = `synthetic/node:24-slim@${superseded}`;
    const moved = { 'synthetic/node:24-slim': tag('24-slim', current, YOUNG) };
    const carried = fakeRegistry({ tags: moved, lists: { 'synthetic/node': [tag('24-slim', current, YOUNG), tag('24.1-slim', superseded, '2026-10-12T00:00:00.000Z'), tag('24.0-slim', superseded, '2026-10-02T00:00:00.000Z')] } });
    const findings = await run(tree({ web: image }), tree(), { registry: carried });
    expect(problems(findings)).toEqual([]);
    expect(notes(findings)).toEqual([
      `images: ${image} (apps/web/Dockerfile:1) was pushed 2026-10-12T00:00:00.000Z (Docker Hub's tag_last_pushed of the tag 24.1-slim, which carries it; the tag 24-slim names ${current} now), at least three days ago`,
    ]);
    expect(carried.reads).toEqual(['tag synthetic/node:24-slim', 'tags synthetic/node 1']);
    // On none of the 500 most recently updated tags (five pages of 600): fails closed, naming the tag's current digest.
    const others = Array.from({ length: 600 }, (_, at) => tag(`other-${String(at)}`, digest(`other ${String(at)}`), OLD));
    const lost = fakeRegistry({ tags: moved, lists: { 'synthetic/node': others } });
    expect(problems(await run(tree({ web: image }), tree(), { registry: lost }))).toEqual([
      `images: ${image} (apps/web/Dockerfile:1): Docker Hub's tag 24-slim names ${current} now, pushed ${YOUNG} and so old enough from ${YOUNG_MATURE}, and none of the 500 most recently updated tags of synthetic/node carries ${superseded}, so when it was pushed cannot be read, and no exclude clears that: pin a tag's current digest (${RUNBOOK})`,
    ]);
    expect(lost.reads).toEqual(['tag synthetic/node:24-slim', 'tags synthetic/node 1', 'tags synthetic/node 2', 'tags synthetic/node 3', 'tags synthetic/node 4', 'tags synthetic/node 5']);
  });

  it('clears a Docker Hub digest found on no tag under no entry, security-fix included, and refuses an age-unprovable entry on any Docker Hub digest (B1)', async () => {
    const lostDigest = digest('node 6');
    const lost = `synthetic/node:24-slim@${lostDigest}`;
    const fix = { image: lost, kind: 'security-fix', advisory: 'CVE-2026-12345', fixes: { package: 'openssl', version: '3.5.4-1' }, reason: 'synthetic: the fixed openssl of a high advisory', added: '2026-10-25T12:00:00.000Z', expires: '2026-10-30T00:00:00.000Z' };
    const unprovable = { image: NODE, kind: 'age-unprovable', advisory: null, reason: 'synthetic: Docker Hub cannot say when it was pushed', added: '2026-10-25T12:00:00.000Z', expires: '2026-10-30T00:00:00.000Z' };
    const registry = fakeRegistry({ tags: { 'synthetic/node:24-slim': tag('24-slim', digest('node 7'), OLD) } });
    expect(problems(await run(tree({ web: lost, exceptions: [fix, unprovable] }), tree(), { registry }))).toEqual([
      `images: ${NODE}: an age-unprovable entry applies only to a registry other than Docker Hub, where no push time can be read; a Docker Hub digest is held to the time Hub recorded, and one Hub shows on no tag passes under no entry: pin a tag's current digest (${RUNBOOK})`,
      `images: ${lost} (apps/web/Dockerfile:1): Docker Hub's tag 24-slim names ${digest('node 7')} now, pushed ${OLD} and so old enough from 2026-10-04T00:00:00.000Z, and none of the 0 most recently updated tags of synthetic/node carries ${lostDigest}, so when it was pushed cannot be read, and no exclude clears that: pin a tag's current digest (${RUNBOOK})`,
    ]);
  });

  it('reads a Docker Hub 404 as "no such tag" and searches the tags', async () => {
    const pinned = digest('node 8');
    const image = `synthetic/node:24.9-slim@${pinned}`;
    const found = fakeRegistry({ lists: { 'synthetic/node': [tag('24-slim', digest('node 1'), OLD), tag('24.8-slim', pinned, OLD)] } });
    const findings = await run(tree({ web: image }), tree(), { registry: found });
    expect(problems(findings)).toEqual([]);
    expect(notes(findings)).toEqual([`images: ${image} (apps/web/Dockerfile:1) was pushed ${OLD} (Docker Hub's tag_last_pushed of the tag 24.8-slim, which carries it; Docker Hub has no tag 24.9-slim), at least three days ago`]);
    expect(found.reads).toEqual(['tag synthetic/node:24.9-slim', 'tags synthetic/node 1']);
    const nowhere = fakeRegistry({ lists: { 'synthetic/node': [tag('24-slim', digest('node 1'), OLD), tag('23-slim', digest('node 0'), OLD)] } });
    expect(problems(await run(tree({ web: image }), tree(), { registry: nowhere }))).toEqual([
      `images: ${image} (apps/web/Dockerfile:1): Docker Hub has no tag 24.9-slim of synthetic/node, and none of the 2 most recently updated tags of synthetic/node carries ${pinned}, so when it was pushed cannot be read, and no exclude clears that: pin a tag's current digest (${RUNBOOK})`,
    ]);
  });

  it('holds an image on a registry other than Docker Hub "age unprovable", unless a live age-unprovable entry names it', async () => {
    const image = `ghcr.io/synthetic-owner/db:18@${digest('ghcr db')}`;
    const registry = fakeRegistry();
    expect(problems(await run(tree({ compose: compose(image) }), tree({ compose: compose(POSTGRES) }), { registry }))).toEqual([
      `images: ${image} (docker-compose.yml services.db): ghcr.io is not Docker Hub, the one registry whose push times check-toolchain reads, so its age is unprovable; take the image from Docker Hub, or add an age-unprovable entry for it to tools/check-toolchain/image-age-exceptions.json with its reason, the date added and an expiry (${RUNBOOK})`,
    ]);
    expect(registry.reads).toEqual([]);
    const waiver = { image, kind: 'age-unprovable', advisory: null, reason: 'synthetic: a registry Docker Hub does not mirror', added: '2026-10-25T12:00:00.000Z', expires: '2026-11-01T00:00:00.000Z' };
    const waived = await run(tree({ compose: compose(image), exceptions: [waiver] }), tree({ compose: compose(POSTGRES) }));
    expect(problems(waived)).toEqual([]);
    expect(notes(waived)).toEqual([`images: ${image} (docker-compose.yml services.db) is on ghcr.io, whose push times check-toolchain cannot read, and passes under its live age-unprovable entry until 2026-11-01T00:00:00.000Z`]);
    // A security-fix entry waives the floor, which no time read here could be held to.
    const fix = { ...waiver, kind: 'security-fix', advisory: 'GHSA-2222-3333-4444', fixes: { package: 'synthetic-db', version: '18.1' } };
    expect(problems(await run(tree({ compose: compose(image), exceptions: [fix] }), tree({ compose: compose(POSTGRES) })))).toEqual([
      `images: ${image}: a security-fix entry waives only the release age, which check-toolchain cannot read on ghcr.io; an image there takes an age-unprovable entry (${RUNBOOK})`,
      `images: ${image} (docker-compose.yml services.db): ghcr.io is not Docker Hub, the one registry whose push times check-toolchain reads, so its age is unprovable; take the image from Docker Hub, or add an age-unprovable entry for it to tools/check-toolchain/image-age-exceptions.json with its reason, the date added and an expiry (${RUNBOOK})`,
    ]);
  });

  it('fails closed, naming hub.docker.com, when a read fails after its three tries, and the caller’s deadline stops the rest as one finding that names it (CI-N2)', { timeout: 15_000 }, async () => {
    const images = ['a', 'b', 'c', 'd', 'e', 'f'].map((name) => `synthetic/${name}:1@${digest(name)}`);
    const [first = '', ...rest] = images;
    const head = tree({ web: first, dockerfiles: { 'apps/web/Dockerfile': dockerfile(first, rest.map((image, at) => `FROM ${image} AS stage${String(at)}`)), 'apps/worker/Dockerfile': dockerfile(NODE) } });
    const registry = fakeRegistry({ fail: ['tag synthetic/a:1'], hang: ['b', 'c', 'd', 'e', 'f'].map((name) => `tag synthetic/${name}:1`) });
    // A 20 ms deadline, named as the caller set it, never the default's 180 s.
    expect(problems(await run(head, tree(), { registry, deadlineMs: 20 }))).toEqual([
      `images: ${first} (apps/web/Dockerfile:1): hub.docker.com: reading synthetic/a:1's Docker Hub tag failed after 3 tries with backoff (last: HTTP 503); check-toolchain fails closed`,
      `images: hub.docker.com: the image reads stopped at their deadline (20 ms) with 5 images unread, ${rest.join(', ')}; re-run`,
    ]);
    // Four at a time: the fifth is read once the first fails; the sixth never starts.
    expect(registry.reads).toEqual(['tag synthetic/a:1', 'tag synthetic/b:1', 'tag synthetic/c:1', 'tag synthetic/d:1', 'tag synthetic/e:1']);
  });

  it('warns, never fails, on a young digest in a push run', async () => {
    const pinned = digest('node 2');
    const young = `synthetic/node:24-slim@${pinned}`;
    const registry = fakeRegistry({ tags: { 'synthetic/node:24-slim': tag('24-slim', pinned, YOUNG) } });
    const findings = await run(tree({ web: young }), tree(), { event: 'push', registry });
    expect(problems(findings)).toEqual([]);
    expect(problems(findings, 'warning')).toEqual([
      `images: ${young} (apps/web/Dockerfile:1) was pushed ${YOUNG} (Docker Hub's tag_last_pushed of the tag 24-slim), under three days ago; it is old enough from ${YOUNG_MATURE}: ${REMEDY}`,
    ]);
  });

  it('warns, never fails, on an exceptions entry outside its window in a push run, as on every image age finding (CI-N3)', async () => {
    const pinned = digest('node 2');
    const young = `synthetic/node:24-slim@${pinned}`;
    const registry = fakeRegistry({ tags: { 'synthetic/node:24-slim': tag('24-slim', pinned, YOUNG) } });
    // Added a day ahead of now, and expiring before the digest is three days old by the push time read on this run.
    const fix = { image: young, kind: 'security-fix', advisory: 'CVE-2026-12345', fixes: { package: 'openssl', version: '3.5.4-1' }, reason: 'synthetic: the fixed openssl of a high advisory', added: '2026-10-27T00:00:00.000Z', expires: '2026-10-27T23:59:59.000Z' };
    const findings = await run(tree({ web: young, exceptions: [fix] }), tree(), { event: 'push', registry });
    expect(problems(findings)).toEqual([]);
    expect(problems(findings, 'warning')).toEqual([
      `images: ${young}: added 2026-10-27T00:00:00.000Z, a time in the future`,
      `images: ${young}: expires 2026-10-27T23:59:59.000Z, before the digest is three days old (${YOUNG_MATURE}; pushed ${YOUNG}), so it would lapse while still needed`,
    ]);
  });

  it('reads only new digests when the base has no image-age-exceptions.json (E2)', async () => {
    const pinned = digest('node 2');
    const added = `synthetic/node:24-slim@${pinned}`;
    const shared = { compose: compose(POSTGRES), workflows: { '.github/workflows/ci.yml': buildx(BUILDER) } };
    const registry = fakeRegistry({ tags: { ...EVERY_TAG, 'synthetic/node:24-slim': tag('24-slim', pinned, OLD) } });
    const findings = await run(tree({ ...shared, web: added }), tree({ ...shared, exceptions: null }), { registry });
    expect(problems(findings)).toEqual([]);
    expect(problems(findings, 'warning')).toEqual([]);
    expect(registry.reads).toEqual(['tag synthetic/node:24-slim']);
  });

  it('holds the exclude kinds: a live security-fix entry passes a young digest (a CVE accepted), one without fixes is refused (S10), and an expired or unused entry is reported', async () => {
    const pinned = digest('node 2');
    const young = `synthetic/node:24-slim@${pinned}`;
    const hub = { tags: { 'synthetic/node:24-slim': tag('24-slim', pinned, YOUNG) } };
    const fix = { image: young, kind: 'security-fix', advisory: 'CVE-2026-12345', fixes: { package: 'openssl', version: '3.5.4-1' }, reason: 'synthetic: the fixed openssl of a high advisory', added: '2026-10-25T12:00:00.000Z', expires: '2026-10-29T00:00:00.000Z' };
    const passed = await run(tree({ web: young, exceptions: [fix] }), tree(), { registry: fakeRegistry(hub) });
    expect(problems(passed)).toEqual([]);
    expect(problems(passed, 'warning')).toEqual([]);
    expect(notes(passed)).toEqual([
      `images: ${young} (apps/web/Dockerfile:1) was pushed ${YOUNG} (Docker Hub's tag_last_pushed of the tag 24-slim), under three days ago, and passes under its live security-fix entry (CVE-2026-12345, fixed in openssl 3.5.4-1) until 2026-10-29T00:00:00.000Z`,
    ]);
    // The window, from the digest's push time read here: an expiry before it is three days old is refused.
    expect(problems(await run(tree({ web: young, exceptions: [{ ...fix, expires: '2026-10-27T23:59:59.000Z' }] }), tree(), { registry: fakeRegistry(hub) }))).toEqual([
      `images: ${young}: expires 2026-10-27T23:59:59.000Z, before the digest is three days old (${YOUNG_MATURE}; pushed ${YOUNG}), so it would lapse while still needed`,
    ]);
    // Without the package and version it fixes, the list itself is refused.
    const { fixes: _, ...unfixed } = fix;
    const refused = await run(tree({ web: young, exceptions: [unfixed] }), tree(), { registry: fakeRegistry(hub) });
    expect(refused.map((finding) => finding.rule)).toEqual(['files']);
    expect(refused[0]?.message).toMatch(/^tools\/check-toolchain\/image-age-exceptions\.json: entries\.0\.fixes: /);
    // Expired: fails a pull request that edits the list, and warns on a push.
    const expired = { ...fix, image: NODE, added: '2026-10-17T00:00:00.000Z', expires: '2026-10-24T00:00:00.000Z' };
    const message = `images: ${NODE}: expired 2026-10-24T00:00:00.000Z; remove it from tools/check-toolchain/image-age-exceptions.json (the weekly triage, docs/runbooks/dependency-upgrades.md)`;
    expect(problems(await run(tree({ exceptions: [expired] }), tree()))).toEqual([message]);
    const pushed = await run(tree({ exceptions: [expired] }), tree(), { event: 'push' });
    expect([problems(pushed), problems(pushed, 'warning')]).toEqual([[], [message]]);
    // Unused: no file names the image any longer.
    const gone = { ...fix, image: `synthetic/gone:1@${digest('gone')}` };
    const unused = await run(tree({ exceptions: [gone] }), tree());
    expect(problems(unused)).toEqual([]);
    expect(problems(unused, 'warning')).toEqual([
      `images: synthetic/gone:1@${digest('gone')}: no Dockerfile, compose file or workflow names it any longer; remove it from tools/check-toolchain/image-age-exceptions.json (the weekly triage, docs/runbooks/dependency-upgrades.md)`,
    ]);
  });

  it('refuses offline an image without a tag or without a digest (E5), and passes one pinned by both', () => {
    const tagless = `synthetic/node@${digest('node 1')}`;
    const unpinned = 'synthetic/node:24-slim';
    const sha512 = `synthetic/node:24-slim@sha512:${'a'.repeat(128)}`;
    const expression = '${{ matrix.image }}';
    const workflow = stringify({ name: 'synthetic', on: 'push', jobs: { a: { 'runs-on': 'ubuntu-26.04', container: expression, steps: [{ uses: `docker://${sha512}` }] } } });
    expect(problems(checkOffline(tree({ web: tagless, worker: unpinned, workflows: { '.github/workflows/ci.yml': workflow } })))).toEqual([
      `images: apps/web/Dockerfile:1: ${tagless} names no tag, so Docker Hub cannot be asked when its digest was pushed; write it as name:tag@sha256:<64 hex>`,
      `images: apps/worker/Dockerfile:1: ${unpinned} names no digest, so what runs can change under the same name; pin it as name:tag@sha256:<64 hex>`,
      `images: .github/workflows/ci.yml a container: ${expression} names no digest, so what runs can change under the same name; pin it as name:tag@sha256:<64 hex>`,
      `images: .github/workflows/ci.yml a step 1: ${sha512} is not pinned by a sha256 digest; write it as name:tag@sha256:<64 hex>`,
    ]);
    const passed = checkOffline(tree({ compose: compose(POSTGRES), workflows: { '.github/workflows/ci.yml': buildx(BUILDER) } }));
    expect(problems(passed)).toEqual([]);
    expect(notes(passed)).toEqual(['images: 4 image references, each name:tag@sha256:<64 hex>, and none the image rule does not read']);
  });

  it('reads a compose service built from a YAML merge key, and refuses a service’s extends:, which takes its image from another service (SEC-N1)', () => {
    const composed = [
      'name: synthetic',
      'x-base: &base',
      '  image: synthetic/merged:latest',
      'services:',
      '  db:',
      `    image: ${POSTGRES}`,
      '  extra:',
      '    <<: *base',
      '  local:',
      '    extends:',
      '      service: db',
      '',
    ].join('\n');
    expect(problems(checkOffline(tree({ compose: composed })))).toEqual([
      "images: docker-compose.yml services.local: extends: takes the service from another one, in this file or another, which the image rule does not follow; name the service's image in docker-compose.yml",
      'images: docker-compose.yml services.extra: synthetic/merged:latest names no digest, so what runs can change under the same name; pin it as name:tag@sha256:<64 hex>',
    ]);
  });

  it.each(HIDING)('★ finds and ages the young FROM after $name, as BuildKit reads the file (SEC-S1)', async ({ directives, tail, from }) => {
    const web = [...directives, dockerfile(NODE), ...tail].join('\n');
    const line = directives.length + 4 + from + 1;
    const registry = hiddenHub();
    expect(problems(await run(tree({ dockerfiles: { 'apps/web/Dockerfile': web, 'apps/worker/Dockerfile': dockerfile(NODE) } }), tree(), { registry }))).toEqual([
      `images: ${HIDDEN} (apps/web/Dockerfile:${String(line)}) was pushed ${YOUNG} (Docker Hub's tag_last_pushed of the tag 1), under three days ago; it is old enough from ${YOUNG_MATURE}: ${REMEDY}`,
    ]);
    expect(registry.reads).toEqual(['tag synthetic/hidden:1']);
  });

  it('★ refuses a FROM or from= line BuildKit does not read as that instruction, and a Dockerfile BuildKit’s parser refuses, rather than skip what it cannot place (SEC-S1)', () => {
    const files = {
      // A heredoc's body is cat's input, never an instruction, so the FROM and the COPY there are not read; the rule refuses them rather than trust that.
      'apps/body/Dockerfile': dockerfile(NODE, ['RUN cat > /tmp/Dockerfile <<EOF', `FROM ${HIDDEN}`, 'COPY --from=synthetic/tools:1 /x /y', 'EOF']),
      // A FROM line continuing a RUN is that RUN's text to BuildKit.
      'apps/continued/Dockerfile': dockerfile(NODE, ['RUN echo \\', `FROM ${HIDDEN}`]),
      'apps/escape/Dockerfile': ['# escape=x', dockerfile(NODE)].join('\n'),
      'apps/label/Dockerfile': dockerfile(NODE, ['LABEL note="from=synthetic/tools:1"']),
      'apps/twice/Dockerfile': ['# escape=\\', '# escape=`', dockerfile(NODE)].join('\n'),
      'apps/unterminated/Dockerfile': dockerfile(NODE, ['RUN <<EOF', 'echo synthetic']),
    };
    const from = (file: string, line: number) =>
      `images: ${file}:${String(line)}: a FROM line BuildKit does not read as a FROM instruction (a heredoc's body, or the continuation of the instruction before it), so the image rule cannot place it and refuses it; make each FROM line an instruction of its own (${RUNBOOK})`;
    const fromEquals = (file: string, line: number) =>
      `images: ${file}:${String(line)}: a from= outside every COPY and RUN instruction as BuildKit reads the file (a heredoc's body, or another instruction), so the image rule cannot place it and refuses it; copy and mount only from an earlier stage (${RUNBOOK})`;
    const parser = (file: string, line: number, why: string) => `images: ${file}:${String(line)}: BuildKit's parser refuses this Dockerfile (${why}), so the images it names cannot be read; correct it (${RUNBOOK})`;
    expect(problems(checkOffline(tree({ dockerfiles: files })))).toEqual([
      from('apps/body/Dockerfile', 6),
      fromEquals('apps/body/Dockerfile', 7),
      from('apps/continued/Dockerfile', 6),
      parser('apps/escape/Dockerfile', 1, "invalid escape token 'x' does not match ` or \\"),
      fromEquals('apps/label/Dockerfile', 5),
      parser('apps/twice/Dockerfile', 2, 'only one escape parser directive can be used'),
      parser('apps/unterminated/Dockerfile', 5, 'unterminated heredoc'),
    ]);
  });

  it('★ reads a COPY --from= under ONBUILD and a quoted --mount field’s from=, as BuildKit reads them, and refuses the images they name (SEC-S1, improve as you go)', () => {
    const web = dockerfile(NODE, ['ONBUILD COPY --from=synthetic/later:1 /x /y', 'RUN --mount=type=bind,"from=synthetic/quoted:1",target=/q true', 'ONBUILD RUN --mount=type=cache,from=build,target=/c true']);
    const stage = '; the image rule reads only FROM and # syntax= lines, so';
    expect(problems(checkOffline(tree({ dockerfiles: { 'apps/web/Dockerfile': web, 'apps/worker/Dockerfile': dockerfile(NODE) } })))).toEqual([
      `images: apps/web/Dockerfile:5: ONBUILD COPY --from=synthetic/later:1 names an image, not an earlier stage${stage} copy from a stage built FROM a pinned image (${RUNBOOK})`,
      `images: apps/web/Dockerfile:6: RUN --mount=…,from=synthetic/quoted:1 names an image, not an earlier stage${stage} mount from a stage built FROM a pinned image (${RUNBOOK})`,
    ]);
  });

  it('★ reads the frontend wherever BuildKit finds one: a # syntax= line after a byte-order mark or a #! line, a //syntax= line, and a JSON Dockerfile’s "syntax", which it also refuses (SEC-S2)', () => {
    const frontend = 'synthetic/frontend:latest';
    const files = {
      'apps/bom/Dockerfile': `\uFEFF# syntax=${frontend}\n${dockerfile(NODE)}`,
      'apps/cstyle/Dockerfile': `//syntax=${frontend}\n${dockerfile(NODE)}`,
      'apps/json/Dockerfile': JSON.stringify({ syntax: frontend }),
      'apps/shebang/Dockerfile': `#!/usr/bin/env synthetic\n# syntax = ${frontend} --synthetic-option\n${dockerfile(NODE)}`,
    };
    const unpinned = (where: string) => `images: ${where}: ${frontend} names no digest, so what runs can change under the same name; pin it as name:tag@sha256:<64 hex>`;
    expect(problems(checkOffline(tree({ dockerfiles: files }))).filter((message) => message.startsWith('images: '))).toEqual([
      `images: apps/json/Dockerfile:1: a JSON Dockerfile, which BuildKit hands whole to the frontend its "syntax" names, so no instruction of it is read; write the Dockerfile's instructions (${RUNBOOK})`,
      unpinned('apps/bom/Dockerfile:1'),
      unpinned('apps/cstyle/Dockerfile:1'),
      unpinned('apps/json/Dockerfile:1'),
      unpinned('apps/shebang/Dockerfile:2'),
    ]);
  });

  it('refuses a COPY --from= or RUN --mount=…,from= naming an image, a docker-image:// build context, a tracked image file outside the three read, and a compose build: (S6)', () => {
    const web = [
      `FROM ${NODE} AS build`,
      'COPY package.json ./',
      'COPY tools/check-toolchain/install-pnpm.sh /tmp/install-pnpm.sh',
      'RUN sh /tmp/install-pnpm.sh package.json && rm /tmp/install-pnpm.sh',
      `FROM ${NODE} AS runtime`,
      'COPY --from=build /repo/dist ./dist',
      'COPY --from=0 /repo/README.md ./',
      'COPY --from=synthetic/tools:1 /bin/tool /bin/tool',
      'RUN --mount=type=bind,from=build,source=/repo,target=/repo true',
      'RUN --mount=type=cache,target=/cache --mount=type=bind,from=synthetic/tools:1,target=/tools true',
      // A heredoc's body is a command's input, never an instruction, and a FROM line there is refused, not read; a continuation is one instruction.
      'RUN <<EOF',
      'FROM synthetic/not-an-instruction:1',
      'EOF',
      'COPY \\',
      '  --from=synthetic/other:2 /x /y',
      'ONBUILD COPY --from=synthetic/later:1 /x /y',
    ].join('\n');
    const workflow = stringify({
      name: 'synthetic',
      on: 'push',
      jobs: {
        images: {
          'runs-on': 'ubuntu-26.04',
          steps: [
            // An action's name is matched as GitHub matches it, whatever its case.
            { uses: `Docker/Setup-Buildx-Action@${'1'.repeat(40)}` },
            { uses: `docker/build-push-action@${'2'.repeat(40)}`, with: { context: '.', file: 'apps/web/Dockerfile', 'build-contexts': 'tools=docker-image://synthetic/tools:1' } },
            { uses: `docker/bake-action@${'3'.repeat(40)}`, with: { files: 'docker-bake.hcl' } },
          ],
        },
      },
    });
    const composed = stringify({ include: ['other-compose.yml'], services: { db: { build: '.' }, cache: { extends: { file: 'base.yml', service: 'cache' }, image: POSTGRES } } });
    // Under a `# escape=` directive the backtick continues a line, so the instruction is read whole.
    const worker = ['# escape=`', dockerfile(NODE, ['COPY `', '  --from=synthetic/escaped:3 /x /y'])].join('\n');
    const findings = checkOffline(tree({ dockerfiles: { 'apps/web/Dockerfile': web, 'apps/worker/Dockerfile': worker }, compose: composed, workflows: { '.github/workflows/ci.yml': workflow }, imageFiles: ['compose.yaml', 'deploy/Dockerfile.dev'] }));
    const stage = '; the image rule reads only FROM and # syntax= lines, so';
    expect(problems(findings)).toEqual([
      `images: apps/web/Dockerfile:8: COPY --from=synthetic/tools:1 names an image, not an earlier stage${stage} copy from a stage built FROM a pinned image (${RUNBOOK})`,
      `images: apps/web/Dockerfile:10: RUN --mount=…,from=synthetic/tools:1 names an image, not an earlier stage${stage} mount from a stage built FROM a pinned image (${RUNBOOK})`,
      `images: apps/web/Dockerfile:12: a FROM line BuildKit does not read as a FROM instruction (a heredoc's body, or the continuation of the instruction before it), so the image rule cannot place it and refuses it; make each FROM line an instruction of its own (${RUNBOOK})`,
      `images: apps/web/Dockerfile:14: COPY --from=synthetic/other:2 names an image, not an earlier stage${stage} copy from a stage built FROM a pinned image (${RUNBOOK})`,
      `images: apps/web/Dockerfile:16: ONBUILD COPY --from=synthetic/later:1 names an image, not an earlier stage${stage} copy from a stage built FROM a pinned image (${RUNBOOK})`,
      `images: apps/worker/Dockerfile:6: COPY --from=synthetic/escaped:3 names an image, not an earlier stage${stage} copy from a stage built FROM a pinned image (${RUNBOOK})`,
      'images: docker-compose.yml: include: brings in another compose file, whose images the image rule does not read; name every service in docker-compose.yml',
      'images: docker-compose.yml services.db: build: builds an image the image rule does not read; run an image by digest (image: name:tag@sha256:<64 hex>)',
      "images: docker-compose.yml services.cache: extends: takes the service from another one, in this file or another, which the image rule does not follow; name the service's image in docker-compose.yml",
      'images: .github/workflows/ci.yml images step 1: setup-buildx names no builder image (driver-opts image=…), so it runs moby/buildkit:buildx-stable-1 by tag; name it as image=moby/buildkit:vX.Y.Z@sha256:<64 hex>',
      `images: .github/workflows/ci.yml images step 2: build-contexts names an image (docker-image://), which the image rule does not read; build FROM a pinned image in the Dockerfile instead (${RUNBOOK})`,
      `images: .github/workflows/ci.yml images step 3: docker/bake-action builds from bake files, whose images and docker-image:// contexts the image rule does not read; build with docker/build-push-action from a Dockerfile FROM a pinned image (${RUNBOOK})`,
      ...['compose.yaml', 'deploy/Dockerfile.dev'].map(
        (file) =>
          `images: ${file}: an image file outside apps/<name>/Dockerfile and docker-compose.yml, the files the image rule reads (release.yml and release-dry-run.yml compute file:, so any Dockerfile can be built, and Compose prefers compose.yaml to docker-compose.yml); remove it, or name its images in those files`,
      ),
    ]);
  });
});

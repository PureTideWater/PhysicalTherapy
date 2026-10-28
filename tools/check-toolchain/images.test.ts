import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';
import { stringify } from 'yaml';

import { type CheckEvent, type Finding, type Tree, checkToolchain } from './check';
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

interface Hub {
  /** `<repository>:<tag>` (Docker Hub's repository, `library/<name>` for an official image) to its tag; absent: HTTP 404. */
  readonly tags?: Readonly<Record<string, HubTag>>;
  /** A repository's tags, most recently updated first, as its tag list pages them (100 a page). */
  readonly lists?: Readonly<Record<string, readonly HubTag[]>>;
  /** Reads that fail closed: `tag <repository>:<tag>` or `tags <repository>`. */
  readonly fail?: readonly string[];
}

/** A registry that answers npm's reads for the pnpm above, and Docker Hub's from a recorded table, keeping every Hub read. */
function fakeRegistry(hub: Hub = {}): Registry & { readonly reads: string[] } {
  const reads: string[] = [];
  return {
    reads,
    packument: (name) => (name === 'pnpm' ? Promise.resolve(PNPM_PACKUMENT) : Promise.reject(new NetworkReadError(`registry.npmjs.org: ${name} is not in this synthetic registry`))),
    advisories: () => Promise.resolve({}),
    hubTag(repository: string, name: string): Promise<HubTag | null> {
      const key = `${repository}:${name}`;
      reads.push(`tag ${key}`);
      if (hub.fail?.includes(`tag ${key}`)) {
        return Promise.reject(new NetworkReadError(`hub.docker.com: reading ${key}'s Docker Hub tag failed after 3 tries with backoff (last: HTTP 503); check-toolchain fails closed`));
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

async function run(head: Tree, base: Tree = tree(), options: { readonly event?: CheckEvent; readonly registry?: Registry; readonly signal?: AbortSignal } = {}): Promise<Finding[]> {
  return checkToolchain({ head, base, event: options.event ?? 'pull_request', now: NOW, ...(options.signal === undefined ? {} : { signal: options.signal }) }, options.registry ?? fakeRegistry());
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
});

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { repositoryRoot } from '../content-files';

/**
 * No version or digest is written outside its source of record (A4 (b); docs/adr/0066, Part 2), so an update that moves
 * the source moves everything, and a Dependabot pull request that rewrites the source alone cannot leave a stale copy:
 * - the node image: the Dockerfiles' FROM lines, one image for all of them;
 * - the postgres image: docker-compose.yml;
 * - pnpm: package.json's packageManager, version and sha512, from which both images derive and verify theirs;
 * - mutation.yml's exact Node: tools/stryker/unicode.json, which workflows.test.ts holds its node-version values to;
 * - the worker image's playwright-core: the version the lockfile resolves, until ci-browser derives it from
 *   apps/worker/package.json.
 * One deliberate exception: the BuildKit builder's `driver-opts: image=moby/buildkit:<version>@sha256:<digest>`, written
 * on every setup-buildx step, since a step's inputs cannot read a file. Dependabot never rewrites that string (it is no
 * `uses:` and no FROM), so no update can leave a stale copy, and workflows.test.ts holds every copy to one value.
 * The scan reads the whole text, comments included, of every workflow, both Dockerfiles, docker-compose.yml, README.md,
 * CLAUDE.md and the images' pnpm installer (tools/check-toolchain/install-pnpm.sh). ADRs and dated runbook entries record
 * what was, and are not scanned. The CI files are read through CI_TREE when it is set (workflows.test.ts, the simulated
 * rewrite).
 */

const CI_ROOT = process.env.CI_TREE ?? repositoryRoot;
const DOCKERFILES = ['apps/web/Dockerfile', 'apps/worker/Dockerfile'];

/** Every scanned file's text, by its path: CI files from CI_ROOT, the two documents from the repository. */
function scanned(): Map<string, string> {
  const workflows = readdirSync(path.join(CI_ROOT, '.github/workflows'))
    .filter((file) => /\.ya?ml$/.test(file))
    .map((file) => `.github/workflows/${file}`);
  return new Map([
    ...[...workflows, ...DOCKERFILES, 'docker-compose.yml'].map((file) => [file, readFileSync(path.join(CI_ROOT, file), 'utf8')] as const),
    ...['README.md', 'CLAUDE.md', 'tools/check-toolchain/install-pnpm.sh'].map((file) => [file, readFileSync(path.join(repositoryRoot, file), 'utf8')] as const),
  ]);
}

/** Each line of each scanned file that matches, as `file:line: text`. */
function where(files: ReadonlyMap<string, string>, pattern: RegExp, keep: (file: string, line: string) => boolean = () => true): string[] {
  return [...files].flatMap(([file, text]) =>
    text.split('\n').flatMap((line, index) => (pattern.test(line) && keep(file, line) ? [`${file}:${String(index + 1)}: ${line.trim()}`] : [])),
  );
}

const fromImages = (text: string) =>
  text
    .split('\n')
    .filter((line) => /^FROM\s/i.test(line))
    .map((line) => line.split(/\s+/)[1] ?? '');

describe('no duplicated versions (A4 (b))', () => {
  it('names pnpm’s version only in packageManager: neither image installs a pnpm literal, and no workflow or document repeats one', () => {
    const manager = (JSON.parse(readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8')) as { packageManager?: string }).packageManager ?? '';
    // pnpm@x.y.z+sha512.<hex>: the version and the tarball's digest, which both images verify (install-pnpm.sh).
    const [, version, digest] = /^pnpm@(\d+\.\d+\.\d+)\+sha512\.([0-9a-f]{128})$/.exec(manager) ?? [];
    expect(version, manager).toBeDefined();
    expect(where(scanned(), /\bpnpm(?:@|\s+v?)\d+\.\d+/i)).toEqual([]);
    expect(where(scanned(), new RegExp(`\\b${(version ?? '').replaceAll('.', '\\.')}\\b`))).toEqual([]);
    expect(where(scanned(), new RegExp((digest ?? '').slice(0, 16)))).toEqual([]);
  });

  it('names the node image in the Dockerfiles alone, one image for every stage of both', () => {
    const files = scanned();
    const images = DOCKERFILES.flatMap((file) => fromImages(files.get(file) ?? ''));
    expect(images.length).toBeGreaterThan(0);
    expect(new Set(images).size, images.join(', ')).toBe(1);
    expect(where(files, /\bnode:\d/, (file) => !DOCKERFILES.includes(file))).toEqual([]);
  });

  it('names the postgres image in docker-compose.yml alone', () => {
    expect(where(scanned(), /\bpostgres:\d/, (file) => file !== 'docker-compose.yml')).toEqual([]);
  });

  it('writes each image digest once, in its source', () => {
    const files = scanned();
    const digests = [...files].flatMap(([file, text]) => [...text.matchAll(/sha256:[0-9a-f]{64}/g)].map((match) => ({ file, digest: match[0] })));
    const homes = new Map<string, Set<string>>();
    for (const { file, digest } of digests) homes.set(digest, (homes.get(digest) ?? new Set()).add(file));
    // The builder's digest is on setup-buildx steps only, each line the same driver-opts (held equal by workflows.test.ts).
    const builder = new Set(where(files, /^\s*driver-opts: image=moby\/buildkit:v\d+\.\d+\.\d+@sha256:[0-9a-f]{64}$/).map((line) => /sha256:[0-9a-f]{64}/.exec(line)?.[0]));
    expect(builder.size).toBeLessThanOrEqual(1);
    const scattered = [...homes].filter(([digest, found]) => found.size > 1 && ![...found].every((file) => DOCKERFILES.includes(file)) && !(builder.has(digest) && [...found].every((file) => file.startsWith('.github/workflows/'))));
    expect(scattered.map(([digest, found]) => `${digest}: ${[...found].join(', ')}`)).toEqual([]);
  });

  it('names mutation.yml’s exact Node only as its node-version values, held to tools/stryker/unicode.json', () => {
    const node = (JSON.parse(readFileSync(path.join(repositoryRoot, 'tools/stryker/unicode.json'), 'utf8')) as { checkedOn: { node: string } }).checkedOn.node;
    expect(node).toMatch(/^\d+\.\d+\.\d+$/);
    const literal = new RegExp(`\\b${node.replaceAll('.', '\\.')}\\b`);
    expect(where(scanned(), literal, (file, line) => !(file === '.github/workflows/mutation.yml' && line.trim() === `node-version: ${node}`))).toEqual([]);
  });

  it('installs no package by version in either image but the worker’s playwright-core, at the version the lockfile resolves', () => {
    const files = scanned();
    const literals = DOCKERFILES.flatMap((file) => [...(files.get(file) ?? '').matchAll(/(?<![\w/@.-])(@?[a-z0-9][\w./-]*)@(\d+\.\d+\.\d+)\b/g)].map((match) => ({ file, name: match[1] ?? '', version: match[2] ?? '' })));
    expect(literals.filter(({ name }) => name !== 'playwright-core').map(({ file, name, version }) => `${file}: ${name}@${version}`)).toEqual([]);
    const locked = [...readFileSync(path.join(repositoryRoot, 'pnpm-lock.yaml'), 'utf8').matchAll(/^ {2}playwright-core@(\d+\.\d+\.\d+):$/gm)].map((match) => match[1]);
    expect(new Set(locked).size).toBe(1);
    for (const { file, version } of literals.filter(({ name }) => name === 'playwright-core')) expect(version, file).toBe(locked[0]);
  });
});

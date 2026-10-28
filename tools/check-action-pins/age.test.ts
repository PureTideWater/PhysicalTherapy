import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { checkActionPins, type CheckOptions } from './check';
import { blob, lightweight, recordedTransport } from './fixtures';

/**
 * The age rule (docs/adr/0066, Part 5; test matrix CI-21, CI-23), through checkActionPins on a synthetic repository and
 * a recorded network: a pin new against the base enters only when its commit is on the upstream's default branch, its
 * tag names it, and it is at least the release age old by the youngest time read, one of them a time GitHub recorded.
 * Owners, commits and answers are made up; the signed objects and keys are make.sh's synthetic ones (testdata/age),
 * whose SHAs are their real hashes, checked with gpgv. No GitHub key material is used here.
 */

const TESTDATA = new URL('./testdata/age/', import.meta.url);
const testdata = (file: string) => readFileSync(new URL(file, TESTDATA));
/** make.sh's record: the keys' fingerprints, the retired key's expiry and each object's SHA. */
const MADE = new Map(
  testdata('made.txt')
    .toString('utf8')
    .split('\n')
    .filter((line) => line !== '' && !line.startsWith('#'))
    .map((line) => line.split(' ') as [string, string]),
);
const made = (name: string): string => MADE.get(name) ?? '';
/** The synthetic web-flow keys: make.sh's current key, and its retired one with its expiry. */
const KEYS = { armored: testdata('keys.asc').toString('utf8'), current: made('current'), retired: { fingerprint: made('retired'), expired: made('retired-expires') }, file: 'testdata/age/keys.asc' };

const DAY = 86_400_000;
const HOUR = 3_600_000;
/** When make.sh's current and unknown keys signed (author, committer and signature alike). */
const SIGNED = Date.parse('2025-06-01T00:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString().replace(/\.000Z$/, 'Z');

/** A git object's name, as git computes it. */
const objectSha = (type: 'commit' | 'tag', raw: string | Buffer) => {
  const bytes = typeof raw === 'string' ? Buffer.from(raw, 'latin1') : raw;
  return createHash('sha1')
    .update(Buffer.concat([Buffer.from(`${type} ${String(bytes.length)}\0`, 'latin1'), bytes]))
    .digest('hex');
};
/** An unsigned synthetic commit, author and committer at `at`. */
const unsigned = (at: number, message = 'synthetic') => {
  const seconds = String(Math.floor(at / 1000));
  const raw = `tree 4b825dc642cb6eb9a060e54bf8d69288fbee4904\nauthor Synthetic <synthetic@example.invalid> ${seconds} +0000\ncommitter Synthetic <synthetic@example.invalid> ${seconds} +0000\n\n${message}\n`;
  return { sha: objectSha('commit', raw), raw };
};
/** An annotated tag object of a commit, its tagger at `at`. */
const annotatedTag = (version: string, commit: string, at: number) => {
  const raw = `object ${commit}\ntype commit\ntag ${version}\ntagger Synthetic <synthetic@example.invalid> ${String(Math.floor(at / 1000))} +0000\n\n${version}\n`;
  return { sha: objectSha('tag', raw), raw };
};
/** One of make.sh's signed objects. */
const signedObject = (file: string) => ({ sha: made(file), raw: testdata(file) });

const API = 'https://api.github.com';
const REPO = 'octo/act';
const VERSION = 'v1.2.3';

/** What the upstream answers for one pin: the verify loop's tag and action file, the age rule's git, and on CI the API. */
interface Upstream {
  readonly commit: { readonly sha: string; readonly raw: string | Buffer };
  readonly repo?: string;
  readonly version?: string;
  /** The tag the age rule's fetch lists: the pin by default, null for none, or an annotated tag object. */
  readonly tag?: { readonly sha: string; readonly raw: string; readonly commit: string } | { readonly lightweight: string } | null;
  /** The tag the verify loop's ls-remote lists (the pin by default). */
  readonly verifyTag?: string;
  /** Off the default branch: github.com serves the commit by its SHA alone. */
  readonly offBranch?: boolean;
  /** Further commits the fetch holds, and each held commit's ancestors. */
  readonly objects?: Readonly<Record<string, string | Buffer>>;
  readonly ancestors?: Readonly<Record<string, readonly string[]>>;
  readonly head?: string;
  /** The API's answers by path under /repos/<repo>/ (CI only). */
  readonly api?: Readonly<Record<string, string | number | RecordedLike | readonly RecordedLike[]>>;
  /** The actions' paths inside the repository ('' for its root). */
  readonly paths?: readonly string[];
}
interface RecordedLike {
  readonly status: number;
  readonly body?: string;
  readonly headers?: Readonly<Record<string, string>>;
}

/** The recorded network for these upstreams. */
function network(upstreams: readonly Upstream[], extra: { readonly urls?: Readonly<Record<string, unknown>> } = {}) {
  const tags: Record<string, string> = {};
  const files: Record<string, string> = {};
  const git: Record<string, unknown> = {};
  const urls: Record<string, unknown> = { ...extra.urls };
  for (const upstream of upstreams) {
    const repo = upstream.repo ?? REPO;
    const version = upstream.version ?? VERSION;
    const pin = upstream.commit.sha;
    tags[repo] = (tags[repo] ?? '') + lightweight(version, upstream.verifyTag ?? pin);
    for (const where of upstream.paths ?? ['']) files[blob(repo, pin, where === '' ? 'action.yml' : `${where}/action.yml`)] = 'name: act\ninputs:\n  extra: {}\nruns:\n  using: node24\n  main: index.js\n';
    const tag = upstream.tag === undefined ? { object: pin, commit: pin } : upstream.tag === null ? undefined : 'lightweight' in upstream.tag ? { object: upstream.tag.lightweight, commit: upstream.tag.lightweight } : { object: upstream.tag.sha, commit: upstream.tag.commit };
    const tagRaw = upstream.tag !== undefined && upstream.tag !== null && 'raw' in upstream.tag ? { [upstream.tag.sha]: upstream.tag.raw } : {};
    const own = { [pin]: upstream.commit.raw };
    const head = upstream.head ?? (upstream.offBranch === true ? Object.keys(upstream.objects ?? {})[0] : pin);
    git[repo] = {
      head,
      tags: tag === undefined ? {} : { [version]: tag },
      objects: { ...(upstream.offBranch === true ? {} : own), ...upstream.objects, ...tagRaw },
      bySha: upstream.offBranch === true ? own : {},
      ancestors: upstream.ancestors ?? {},
    };
    for (const [where, answer] of Object.entries(upstream.api ?? {})) urls[`${API}/repos/${repo}/${where}`] = answer;
  }
  return recordedTransport({ tags, files, git, urls } as Parameters<typeof recordedTransport>[0]);
}

/** The answers of a commit GitHub verified: `verified_at` and its reason. */
const verified = (at: string | null, reason = 'valid') => JSON.stringify({ sha: 'x', verification: { verified: at !== null, reason, signature: null, payload: null, verified_at: at } });
/** A release's answer. */
const release = (published: string | null, immutable?: boolean) => JSON.stringify({ tag_name: VERSION, published_at: published, ...(immutable === undefined ? {} : { immutable }) });

// Made before the tests run, not when the file is collected (tools/test/collection.test.ts).
let scratch = '';
beforeAll(() => {
  scratch = mkdtempSync(path.join(os.tmpdir(), 'tp-action-pins-age-'));
});
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

const workflow = (pins: readonly { readonly ref: string; readonly version: string; readonly with?: string }[]) =>
  `name: ci\non: push\njobs:\n  build:\n    runs-on: ubuntu-24.04\n    steps:\n${pins.map((pin) => `      - uses: ${pin.ref} # ${pin.version}\n${pin.with === undefined ? '' : `        with: ${pin.with}\n`}`).join('')}${pins.length === 0 ? '      - run: echo\n' : ''}`;

/** A repository: a base commit with the checker and its age rule (unless `baseAge` is false), then the head. */
function repository(options: {
  readonly base: string;
  readonly head: string;
  readonly baseAge?: boolean;
  readonly headCheckerEdit?: boolean;
  readonly baseExceptions?: unknown;
  readonly headExceptions?: unknown;
}) {
  const dir = mkdtempSync(path.join(scratch, 'repo-'));
  const env = { ...process.env, HOME: dir, GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'Synthetic', GIT_AUTHOR_EMAIL: 'synthetic@example.invalid', GIT_COMMITTER_NAME: 'Synthetic', GIT_COMMITTER_EMAIL: 'synthetic@example.invalid' };
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, env, encoding: 'utf8' }).trim();
  const write = (file: string, text: string) => {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), text);
  };
  git('init', '-q', '-b', 'main');
  write('.github/workflows/ci.yml', options.base);
  write('tools/check-action-pins/index.ts', '// the checker\n');
  if (options.baseAge ?? true) write('tools/check-action-pins/age.ts', '// the age rule\n');
  if (options.baseExceptions !== undefined) write('tools/check-action-pins/age-exceptions.json', JSON.stringify(options.baseExceptions));
  git('add', '.');
  git('commit', '-q', '-m', 'base');
  const base = git('rev-parse', 'HEAD');
  write('.github/workflows/ci.yml', options.head);
  if (options.headCheckerEdit === true) write('tools/check-action-pins/index.ts', '// the checker, edited\n');
  if (options.headExceptions !== undefined) write('tools/check-action-pins/age-exceptions.json', JSON.stringify(options.headExceptions));
  write('README.md', 'head\n');
  git('add', '.');
  git('commit', '-q', '-m', 'head');
  return { dir, base };
}

/** A run against the base: a pull request by default, at `now`, with the synthetic keys. */
async function run(repo: { dir: string; base: string }, transport: ReturnType<typeof recordedTransport>, options: Partial<CheckOptions> & { readonly now: Date }) {
  return checkActionPins({ root: repo.dir, base: repo.base, event: 'pull_request', transport, keys: KEYS, ...options });
}

/** A head that adds one pin to a base that has none. */
const adds = (pin: string, version = VERSION, extra: Partial<Parameters<typeof repository>[0]> = {}) => repository({ base: workflow([]), head: workflow([{ ref: `${REPO}@${pin}`, version }]), ...extra });
const CI = { ci: true, token: 'synthetic-token' } as const;

describe('a pin new against the base', () => {
  it('fails while its signed commit is 2 days old, naming each time read, its source and when it is old enough, and passes at the floor', async () => {
    const commit = signedObject('signed.commit');
    const repo = adds(commit.sha);
    const young = await run(repo, network([{ commit }]), { now: new Date(SIGNED + 2 * DAY) });
    expect(young.errors).toEqual([
      `${REPO}@${commit.sha} ${VERSION}: under three days old: the youngest time read is the committer date 2025-06-01T00:00:00Z, so it is old enough from 2025-06-04T00:00:00Z; read: committer date 2025-06-01T00:00:00Z, author date 2025-06-01T00:00:00Z, web-flow signature 2025-06-01T00:00:00Z; wait until then, or, for a security fix, add it to tools/check-action-pins/age-exceptions.json with its advisory, the date added and an expiry (docs/runbooks/dependency-upgrades.md)`,
    ]);
    const old = await run(repo, network([{ commit }]), { now: new Date(SIGNED + 3 * DAY) });
    expect(old.errors).toEqual([]);
    expect(old.notes).toContain(`age: ${REPO}@${commit.sha}: the youngest time read, the committer date 2025-06-01T00:00:00Z, is 3.00 days old; old enough from 2025-06-04T00:00:00Z`);
  });

  it('is "age unprovable" when its commit is unsigned and GitHub recorded no time, however old its dates', async () => {
    const commit = unsigned(Date.parse('2020-03-01T00:00:00Z'));
    const repo = adds(commit.sha);
    const upstream = { commit, api: { [`git/commits/${commit.sha}`]: verified(null, 'unsigned') } };
    const onCi = await run(repo, network([upstream]), { now: new Date('2030-01-10T00:00:00Z'), ...CI });
    expect(onCi.errors).toEqual([
      `${REPO}@${commit.sha} ${VERSION}: age unprovable: GitHub recorded no time for it (verified_at null or absent, and no immutable release); read: committer date 2020-03-01T00:00:00Z, author date 2020-03-01T00:00:00Z; choose a release GitHub signed or published immutable, or add an age-unprovable exclude with its reason to tools/check-action-pins/age-exceptions.json (it waives only this; the pin is still held to three days by every time read)`,
    ]);
    const local = await run(repo, network([upstream]), { now: new Date('2030-01-10T00:00:00Z') });
    expect(local.errors).toEqual([expect.stringMatching(new RegExp(`^${REPO}@${commit.sha} ${VERSION}: age unprovable: no web-flow signature, and the API`))]);
  });

  it('on CI is "age unprovable" when its web-flow signature is valid but verified_at is null, rather than taking the signature’s time', async () => {
    const commit = signedObject('signed.commit');
    const repo = adds(commit.sha);
    const result = await run(repo, network([{ commit, api: { [`git/commits/${commit.sha}`]: verified(null, 'valid') } }]), { now: new Date(SIGNED + 30 * DAY), ...CI });
    expect(result.errors).toEqual([expect.stringMatching(new RegExp(`^${REPO}@${commit.sha} ${VERSION}: age unprovable: GitHub recorded no time for it`))]);
    expect(result.notes).toContain(
      `age: ${REPO}@${commit.sha} ${VERSION} (${REPO}@${commit.sha}): on main; the tag ${VERSION} names it; committer date 2025-06-01T00:00:00Z; author date 2025-06-01T00:00:00Z; web-flow signature 2025-06-01T00:00:00Z (key ${made('current')}); verified_at null (reason valid); no release; activity: not read (HTTP 404); the arrival on main is not known`,
    );
  });

  it('fails "not on main" when its commit is off the default branch, and passes under an off-default-branch exclude while three days old by every time read', async () => {
    const commit = signedObject('signed.commit');
    const main = unsigned(Date.parse('2025-07-01T00:00:00Z'), 'main');
    const now = SIGNED + 10 * DAY;
    const upstream = { commit, offBranch: true, objects: { [main.sha]: main.raw } };
    const off = await run(adds(commit.sha), network([upstream]), { now: new Date(now) });
    expect(off.errors).toEqual([
      `${REPO}@${commit.sha} ${VERSION}: not on main, the default branch of ${REPO} (git merge-base --is-ancestor): a tag moved to a commit outside the default branch is how an impostor commit enters; choose a release on main, or, for a release made on a maintenance branch, add an off-default-branch exclude with its reason (it waives only this rule)`,
    ]);
    const entry = { pin: `${REPO}@${commit.sha}`, version: VERSION, kind: 'off-default-branch', advisory: null, reason: 'released from the v1 maintenance branch', added: iso(now - DAY), expires: iso(now + 5 * DAY) };
    const transport = network([upstream]);
    const excused = await run(adds(commit.sha, VERSION, { headExceptions: { entries: [entry] } }), transport, { now: new Date(now) });
    expect(excused.errors).toEqual([]);
    expect(excused.notes).toContain(`age: ${REPO}@${commit.sha}: not on main, admitted by its off-default-branch exclude until ${entry.expires} (${entry.reason}); every other rule still holds`);
    expect(transport.reads).toContain(`fetchSha ${REPO} ${commit.sha}`);
  });

  it('fails "tag moved" with both commits when the age read finds the tag on another commit, never counting that tag’s tagger date, and "no tag" after one read', async () => {
    const commit = signedObject('signed.commit');
    const other = unsigned(SIGNED + 9 * DAY, 'another');
    const moved = annotatedTag(VERSION, other.sha, SIGNED + 9 * DAY);
    const repo = adds(commit.sha);
    // The verify loop's ls-remote still lists the tag on the pin; between it and the age read the tag moved.
    const result = await run(repo, network([{ commit, tag: { ...moved, commit: other.sha }, objects: { [other.sha]: other.raw } }]), { now: new Date(SIGNED + 10 * DAY) });
    expect(result.errors).toEqual([`${REPO}@${commit.sha} ${VERSION}: tag moved: the tag ${VERSION} of ${REPO} names ${other.sha}, not the pin ${commit.sha}; its tagger date is not counted, and the pin is aged from its own commit`]);

    const transport = network([{ commit, tag: null }]);
    const gone = await run(repo, transport, { now: new Date(SIGNED + 10 * DAY) });
    expect(gone.errors).toEqual([`${REPO}@${commit.sha} ${VERSION}: no tag ${VERSION} in ${REPO} (git ls-remote), so the pin names no release; pin a release's commit`]);
    expect(transport.reads.filter((read) => read.startsWith('fetchRefs'))).toEqual([`fetchRefs ${REPO} ${VERSION}`]);
    expect(transport.pauses).toEqual([]);
  });
});

describe('a pin the base already runs', () => {
  it('is never read for its age: "age: no pin new against the base, nothing read", also when the change edits the checker, and for a new step on it', async () => {
    const commit = unsigned(Date.parse('2030-01-09T00:00:00Z'));
    const now = new Date('2030-01-10T00:00:00Z');
    const pin = { ref: `${REPO}@${commit.sha}`, version: VERSION };
    for (const [name, repo] of [
      ['unchanged', repository({ base: workflow([pin]), head: workflow([pin]) })],
      ['the checker edited', repository({ base: workflow([pin]), head: workflow([pin]), headCheckerEdit: true })],
      ['a new step on it', repository({ base: workflow([pin]), head: workflow([pin, { ...pin, with: '{ extra: 1 }' }]) })],
    ] as const) {
      const transport = network([{ commit }]);
      const result = await run(repo, transport, { now, ...CI });
      expect(result.notes, name).toContain('age: no pin new against the base, nothing read');
      expect(transport.reads.filter((read) => read.startsWith('fetchRefs') || read.startsWith(`GET ${API}`)), name).toEqual([]);
      expect(result.errors.filter((error) => error.includes('three days')), name).toEqual([]);
    }
  });
});

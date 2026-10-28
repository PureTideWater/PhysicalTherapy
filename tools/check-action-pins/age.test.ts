import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { exceptionProblems, ghsaRangeHolds, webFlowKeys } from './age';
import { checkActionPins, type CheckOptions } from './check';
import { blob, HANG, lightweight, recordedTransport, sha } from './fixtures';
import { armoredFingerprints, dearmor, packets } from './keys';

/**
 * The age rule (docs/adr/0066, Part 5; test matrix CI-21, CI-23), through checkActionPins on a synthetic repository and
 * a recorded network: a pin new against the base enters only when its commit is on the upstream's default branch, its
 * tag names it, and it is at least the release age old by the youngest time read, one of them a time GitHub recorded.
 * Owners, commits and answers are made up; the signed objects and keys are make.sh's synthetic ones (testdata/age),
 * whose SHAs are their real hashes, checked with gpgv. No GitHub key material is used here.
 */

/**
 * Every case writes a git repository and runs checkActionPins over it, which spawns git and gpgv, often several times in
 * one case: in the full unit run with coverage one case took 5.8 s on four shared CPUs (2026-10-28), past vitest's 5 s
 * default, where alone it takes under 1 s. Each describe gives its cases 30 s, the db project's figure.
 */
const SPAWNS = { timeout: 30_000 } as const;

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

describe('a pin new against the base', SPAWNS, () => {
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

describe('a pin the base already runs', SPAWNS, () => {
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

describe('the times read', SPAWNS, () => {
  it('hold the floor pnpm-workspace.yaml sets: five days when minimumReleaseAge is 7200, and never less than three', async () => {
    const commit = signedObject('signed.commit');
    const repo = adds(commit.sha);
    const four = await run(repo, network([{ commit }]), { now: new Date(SIGNED + 4 * DAY), floor: 7200 });
    expect(four.errors).toEqual([expect.stringContaining(': under 7200 minutes (5.00 days) old: the youngest time read is the committer date 2025-06-01T00:00:00Z, so it is old enough from 2025-06-06T00:00:00Z;')]);
    expect((await run(repo, network([{ commit }]), { now: new Date(SIGNED + 5 * DAY), floor: 7200 })).errors).toEqual([]);
    expect((await run(repo, network([{ commit }]), { now: new Date(SIGNED + 2 * DAY), floor: 60 })).errors).toEqual([expect.stringContaining(': under three days old:')]);
    // A floor that is not a number reads as three days, as releaseAgeMinutes reads it, never as NaN, which no age is under.
    expect((await run(repo, network([{ commit }]), { now: new Date(SIGNED + 2 * DAY), floor: Number.NaN })).errors).toEqual([expect.stringContaining(': under three days old:')]);
  });

  it('take the youngest: a tagger date or a release 1 day old makes the pin young, and a date in the future, which no exclude clears, says "choose another release"', async () => {
    const commit = signedObject('signed.commit');
    const tag = { sha: made('v1.2.3.tag'), raw: testdata('v1.2.3.tag').toString('latin1'), commit: commit.sha };
    const repo = adds(commit.sha);
    const tagged = await run(repo, network([{ commit, tag }]), { now: new Date(SIGNED + 10 * DAY) });
    expect(tagged.errors).toEqual([
      expect.stringContaining(
        ': under three days old: the youngest time read is the tagger date 2025-06-10T00:00:00Z, so it is old enough from 2025-06-13T00:00:00Z; read: committer date 2025-06-01T00:00:00Z, author date 2025-06-01T00:00:00Z, tagger date 2025-06-10T00:00:00Z, web-flow signature 2025-06-01T00:00:00Z;',
      ),
    ]);
    const now = SIGNED + 10 * DAY;
    const api = (published: string) => ({ [`git/commits/${commit.sha}`]: verified(iso(SIGNED)), [`releases/tags/${VERSION}`]: release(published, false) });
    const published = await run(repo, network([{ commit, api: api(iso(now - DAY)) }]), { now: new Date(now), ...CI });
    expect(published.errors).toEqual([expect.stringContaining(`: under three days old: the youngest time read is the release published_at ${iso(now - DAY)}, so it is old enough from ${iso(now + 2 * DAY)};`)]);

    const ahead = unsigned(now + 2 * DAY);
    const exclude = { pin: `${REPO}@${ahead.sha}`, version: VERSION, kind: 'security-fix', advisory: 'GHSA-2222-3333-4444', reason: 'the fix of a synthetic advisory, for this test', added: iso(now - HOUR), expires: iso(now + 6 * DAY) };
    const future = await run(adds(ahead.sha, VERSION, { headExceptions: { entries: [exclude] } }), network([{ commit: ahead, api: { [`git/commits/${ahead.sha}`]: verified(null, 'unsigned'), [`releases/tags/${VERSION}`]: release('2020-01-01T00:00:00Z', true) } }]), {
      now: new Date(now),
      ...CI,
    });
    expect(future.errors).toEqual(
      expect.arrayContaining([
        `${REPO}@${ahead.sha} ${VERSION}: the committer date ${iso(now + 2 * DAY)} is in the future, so the pin counts as young until ${iso(now + 5 * DAY)}; no exclude clears a time in the future: choose another release`,
      ]),
    );
  });

  it('count an immutable release’s published_at as a time GitHub recorded: 1 day old it fails a 30-day-old commit, 5 days old it passes an unsigned one', async () => {
    const now = Date.parse('2030-01-10T00:00:00Z');
    const commit = unsigned(now - 30 * DAY);
    const repo = adds(commit.sha);
    const answers = (published: number) => network([{ commit, api: { [`git/commits/${commit.sha}`]: verified(null, 'unsigned'), [`releases/tags/${VERSION}`]: release(iso(published), true) } }]);
    expect((await run(repo, answers(now - DAY), { now: new Date(now), ...CI })).errors).toEqual([expect.stringContaining(`: under three days old: the youngest time read is the immutable release published_at ${iso(now - DAY)},`)]);
    const passed = await run(repo, answers(now - 5 * DAY), { now: new Date(now), ...CI });
    expect(passed.errors).toEqual([]);
    expect(passed.notes).toEqual(expect.arrayContaining([expect.stringContaining(`; immutable release published_at ${iso(now - 5 * DAY)} (immutable true);`)]));
  });

  it('read an absent immutable as false and a null published_at as no time (D4)', async () => {
    const now = Date.parse('2030-01-10T00:00:00Z');
    const commit = unsigned(now - 30 * DAY);
    const repo = adds(commit.sha);
    for (const [answer, said] of [
      [JSON.stringify({ tag_name: VERSION, published_at: iso(now - 10 * DAY) }), `release published_at ${iso(now - 10 * DAY)} (immutable false)`],
      [release(null, true), 'release published_at null (immutable true): no signal'],
    ] as const) {
      const result = await run(repo, network([{ commit, api: { [`git/commits/${commit.sha}`]: verified(null, 'unsigned'), [`releases/tags/${VERSION}`]: answer } }]), { now: new Date(now), ...CI });
      expect(result.errors, said).toEqual([expect.stringContaining(': age unprovable: GitHub recorded no time for it')]);
      expect(result.notes, said).toEqual(expect.arrayContaining([expect.stringContaining(`; ${said};`)]));
    }
  });

  it('name the re-run instant when verified_at, the youngest, lies more than the floor after every other time', async () => {
    const commit = signedObject('signed.commit');
    const result = await run(adds(commit.sha), network([{ commit, api: { [`git/commits/${commit.sha}`]: verified(iso(SIGNED + 20 * DAY)) } }]), { now: new Date(SIGNED + 21 * DAY), ...CI });
    expect(result.errors).toEqual([
      expect.stringMatching(
        /: under three days old: the youngest time read is the verified_at 2025-06-21T00:00:00Z, .*; verified_at is more than three days after every other time read, as when GitHub verifies an older commit's signature late \(it records verified_at the next time it verifies one\): re-run the check after 2025-06-24T00:00:00Z$/,
      ),
    ]);
  });

  it('count a signature by the current key, by the retired key only before its expiry, and by no other key; without gpgv they fail closed', async () => {
    // make.sh's record holds: its keys' fingerprints, computed here, and its objects' SHAs, their real hashes.
    expect(armoredFingerprints(KEYS.armored)).toEqual([made('current'), made('retired')]);
    for (const file of ['signed.commit', 'unknown.commit', 'retired-before.commit', 'retired-after.commit']) expect(objectSha('commit', testdata(file)), file).toBe(made(file));
    expect(objectSha('tag', testdata('v1.2.3.tag'))).toBe(made('v1.2.3.tag'));

    const unknown = signedObject('unknown.commit');
    const stranger = await run(adds(unknown.sha), network([{ commit: unknown }]), { now: new Date(SIGNED + 10 * DAY) });
    expect(stranger.errors).toEqual([expect.stringContaining(': age unprovable: no web-flow signature')]);
    expect(stranger.notes).toEqual(expect.arrayContaining([expect.stringContaining('; signed, but by no web-flow key (NO_PUBKEY ')]));

    const before = signedObject('retired-before.commit');
    const counted = await run(adds(before.sha), network([{ commit: before }]), { now: new Date('2025-03-01T00:00:00Z') });
    expect(counted.errors).toEqual([]);
    expect(counted.notes).toEqual(expect.arrayContaining([expect.stringContaining(`; web-flow signature 2025-01-11T00:00:00Z (the retired key ${made('retired')}, before its expiry ${made('retired-expires')})`)]));

    const after = signedObject('retired-after.commit');
    const late = await run(adds(after.sha), network([{ commit: after }]), { now: new Date('2025-03-01T00:00:00Z') });
    expect(late.errors).toEqual([expect.stringContaining(': age unprovable: no web-flow signature')]);
    expect(late.notes).toEqual(expect.arrayContaining([expect.stringContaining(`; signed 2025-02-10T00:00:00Z by the retired web-flow key ${made('retired')}, after its expiry ${made('retired-expires')}: no signal`)]));

    const missing = await run(adds(before.sha), network([{ commit: before }]), { now: new Date('2025-03-01T00:00:00Z'), gpgv: path.join(scratch, 'no-such-gpgv') });
    expect(missing.errors).toEqual([`${REPO}@${before.sha} ${VERSION}: gpgv is not installed, so the commit's signature cannot be checked; install it (apt-get install gpgv) and re-run`]);
  });

  it('on CI take verified_at with its reason beside it, 1 day old a failure and 5 days old a pass; locally no API read is made', async () => {
    const commit = signedObject('signed.commit');
    const repo = adds(commit.sha);
    const answers = () => network([{ commit, api: { [`git/commits/${commit.sha}`]: verified(iso(SIGNED + 3 * DAY)) } }]);
    // Three days after the signature, not more: a young verified_at, not a late one, so the remedy is to wait.
    expect((await run(repo, answers(), { now: new Date(SIGNED + 4 * DAY), ...CI })).errors).toEqual([
      expect.stringMatching(/: under three days old: the youngest time read is the verified_at 2025-06-04T00:00:00Z, so it is old enough from 2025-06-07T00:00:00Z; .*; wait until then, or, for a security fix, add it to /),
    ]);
    const passed = await run(repo, answers(), { now: new Date(SIGNED + 8 * DAY), ...CI });
    expect(passed.errors).toEqual([]);
    expect(passed.notes).toEqual(expect.arrayContaining([expect.stringContaining('; verified_at 2025-06-04T00:00:00Z (reason valid);')]));
    const transport = answers();
    const local = await run(repo, transport, { now: new Date(SIGNED + 8 * DAY) });
    expect(local.errors).toEqual([]);
    expect(transport.reads.filter((read) => read.startsWith(`GET ${API}`))).toEqual([]);
    expect(local.notes).toContain("age: GitHub's API (verified_at, the release, the arrival on the default branch, an exclude's advisory) is read on CI only; locally a web-flow signature stands in for a time GitHub recorded");
  });

  it('fail closed after three failed API reads, naming api.github.com, and read a failing signature service as a failed read to re-run, never as "age unprovable"', async () => {
    const commit = signedObject('signed.commit');
    const repo = adds(commit.sha);
    const down = network([{ commit, api: { [`git/commits/${commit.sha}`]: 503 } }]);
    expect((await run(repo, down, { now: new Date(SIGNED + 30 * DAY), ...CI })).errors).toEqual([
      `${REPO}@${commit.sha} ${VERSION}: api.github.com: GET ${API}/repos/${REPO}/git/commits/${commit.sha} (verification) failed 3 times (last: HTTP 503); the check fails closed; re-run the check`,
    ]);
    expect(down.pauses).toEqual([2_000, 5_000]);
    for (const reason of ['gpgverify_error', 'gpgverify_unavailable']) {
      const result = await run(repo, network([{ commit, api: { [`git/commits/${commit.sha}`]: verified(null, reason) } }]), { now: new Date(SIGNED + 30 * DAY), ...CI });
      expect(result.errors, reason).toEqual([expect.stringMatching(new RegExp(`\\(last: verification\\.reason ${reason}, GitHub's signature service failing\\); the check fails closed; re-run the check$`))]);
      expect(result.errors.join('\n'), reason).not.toContain('age unprovable');
    }
  });

  it('wait out a rate limit before the next try: Retry-After: 30 pauses 30 s, and a reset 90 s ahead pauses 60 s, the cap', async () => {
    const commit = signedObject('signed.commit');
    const now = SIGNED + 30 * DAY;
    const repo = adds(commit.sha);
    for (const [limited, pause] of [
      [{ status: 429, headers: { 'Retry-After': '30' } }, 30_000],
      [{ status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(Math.floor(now / 1000) + 90) } }, 60_000],
      // Retry-After may also be an HTTP date.
      [{ status: 429, headers: { 'Retry-After': new Date(now + 20_000).toUTCString() } }, 20_000],
    ] as const) {
      const transport = network([{ commit, api: { [`git/commits/${commit.sha}`]: [limited, { status: 200, body: verified(iso(SIGNED)) }] } }]);
      expect((await run(repo, transport, { now: new Date(now), ...CI })).errors).toEqual([]);
      expect(transport.pauses).toEqual([pause]);
    }
  });

  it('take a push that brought the pin onto the default branch inside the window as a time, and note any other answer of that read, never failing on it', async () => {
    const commit = signedObject('signed.commit');
    const now = SIGNED + 30 * DAY;
    const before = unsigned(SIGNED + DAY, 'before');
    const head = unsigned(SIGNED + 2 * DAY, 'head');
    const activity = `activity?ref=refs/heads/main&per_page=100`;
    const answers = (page: string | number | RecordedLike) =>
      network([
        {
          commit,
          head: head.sha,
          objects: { [before.sha]: before.raw, [head.sha]: head.raw },
          ancestors: { [before.sha]: [before.sha] },
          api: { [`git/commits/${commit.sha}`]: verified(iso(SIGNED)), [activity]: page },
        },
      ]);
    const entry = (at: number) => [{ id: 1, before: before.sha, after: head.sha, ref: 'refs/heads/main', timestamp: iso(at), activity_type: 'push' }];
    const arrived = await run(adds(commit.sha), answers(JSON.stringify(entry(now - DAY))), { now: new Date(now), ...CI });
    expect(arrived.errors).toEqual([expect.stringContaining(`: under three days old: the youngest time read is the arrival on main ${iso(now - DAY)}, so it is old enough from ${iso(now + 2 * DAY)};`)]);
    expect(arrived.notes).toEqual(expect.arrayContaining([expect.stringContaining(`; activity: the pin arrived on main at ${iso(now - DAY)} (push ${before.sha.slice(0, 12)}..${head.sha.slice(0, 12)})`)]));

    for (const [page, said] of [
      [JSON.stringify(entry(now - 5 * DAY)), `activity: no push brought the pin onto main since ${iso(now - 3 * DAY)} (1 entries read)`],
      // A next page on another origin is never asked for: the token goes to GITHUB_API_URL alone.
      [{ status: 200, body: '[]', headers: { Link: '<https://elsewhere.example.invalid/repos/octo/act/activity?page=2>; rel="next"' } }, 'activity: no push brought the pin onto main in the 0 entries GitHub lists'],
      [403, 'activity: not read (HTTP 403); the arrival on main is not known'],
      [422, 'activity: not read (HTTP 422); the arrival on main is not known'],
      ['<html>', 'activity: an answer that is not JSON; the arrival on main is not known'],
    ] as const) {
      const transport = answers(page);
      const result = await run(adds(commit.sha), transport, { now: new Date(now), ...CI });
      expect(result.errors, said).toEqual([]);
      expect(result.notes, said).toEqual(expect.arrayContaining([expect.stringContaining(`; ${said}`)]));
      // One try a page, and no pause: the read is best effort.
      expect(transport.reads.filter((read) => read.includes('/activity?')), said).toHaveLength(1);
      expect(transport.pauses, said).toEqual([]);
    }
  });

  it('send the API its token, version and User-Agent at GITHUB_API_URL alone, take a 3xx as the answer, and print no request header', async () => {
    const commit = signedObject('signed.commit');
    const base = 'https://ghe.example.invalid/api/v3';
    const token = 'synthetic-token-not-a-secret';
    const repo = adds(commit.sha);
    const transport = network([{ commit }], { urls: { [`${base}/repos/${REPO}/git/commits/${commit.sha}`]: verified(iso(SIGNED)) } });
    const result = await run(repo, transport, { now: new Date(SIGNED + 30 * DAY), ci: true, token, apiUrl: base });
    expect(result.errors).toEqual([]);
    const api = transport.requests.filter((request) => !request.url.startsWith('https://github.com/'));
    expect(api.map((request) => request.url)).toEqual([`${base}/repos/${REPO}/git/commits/${commit.sha}`, `${base}/repos/${REPO}/releases/tags/${VERSION}`, `${base}/repos/${REPO}/activity?ref=refs/heads/main&per_page=100`]);
    for (const request of api) expect(request.headers).toEqual({ Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2026-03-10', 'User-Agent': 'check-action-pins' });

    const to = `${base}/repositories/42/git/commits/${commit.sha}`;
    const moved = network([{ commit }], { urls: { [`${base}/repos/${REPO}/git/commits/${commit.sha}`]: { status: 301, headers: { Location: to } } } });
    const answered = await run(repo, moved, { now: new Date(SIGNED + 30 * DAY), ci: true, token, apiUrl: base });
    expect(answered.errors).toEqual([`${REPO}@${commit.sha} ${VERSION}: ghe.example.invalid answers HTTP 301 for ${REPO} (to ${to}): the repository moved; pin it under its new name`]);
    expect(moved.reads.filter((read) => read.includes('/git/commits/'))).toHaveLength(1);
    expect(moved.reads).not.toContain(`GET ${to}`);
    expect(JSON.stringify([result, answered])).not.toContain(token);
  });

  it('age a commit once, whatever refs use it, and name them all', async () => {
    const commit = signedObject('signed.commit');
    const refs = [`octo/cache/restore@${commit.sha}`, `octo/cache/save@${commit.sha}`];
    const repo = repository({ base: workflow([]), head: workflow(refs.map((ref) => ({ ref, version: VERSION }))) });
    const transport = network([{ commit, repo: 'octo/cache', paths: ['restore', 'save'] }]);
    const result = await run(repo, transport, { now: new Date(SIGNED + 10 * DAY) });
    expect(result.errors).toEqual([]);
    expect(transport.reads.filter((read) => read.startsWith('fetchRefs'))).toEqual([`fetchRefs octo/cache ${VERSION}`]);
    expect(result.notes).toEqual(expect.arrayContaining([expect.stringMatching(new RegExp(`^age: octo/cache@${commit.sha} ${VERSION} \\(${refs.join(', ')}\\): on main;`))]));
  });

  it('read four commits at a time under one deadline, the commits left unread one error naming them and the host on a pull request, one warning on a push', async () => {
    const pins = Array.from({ length: 5 }, (_, i) => ({ repo: `octo/a${String(i)}`, sha: sha(String(i + 1)) }));
    const repo = repository({ base: workflow([]), head: workflow(pins.map((pin) => ({ ref: `${pin.repo}@${pin.sha}`, version: VERSION }))) });
    const hung = () =>
      recordedTransport({
        tags: Object.fromEntries(pins.map((pin) => [pin.repo, lightweight(VERSION, pin.sha)])),
        files: Object.fromEntries(pins.map((pin) => [blob(pin.repo, pin.sha), 'name: a\nruns:\n  using: node24\n  main: index.js\n'])),
        git: Object.fromEntries(pins.map((pin) => [pin.repo, HANG])),
      });
    const unread = pins.map((pin) => `${pin.repo}@${pin.sha}`).join(', ');
    const transport = hung();
    const started = Date.now();
    const pr = await run(repo, transport, { now: new Date('2030-01-10T00:00:00Z'), ageDeadlineMs: 200 });
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(pr.errors).toEqual([`the age reads stopped at their 0.2 s deadline with 5 of 5 commit(s) unread (${unread}): github.com did not answer in time; re-run the check`]);
    expect(transport.peak()).toBe(4);
    const push = await run(repo, hung(), { now: new Date('2030-01-10T00:00:00Z'), ageDeadlineMs: 200, event: 'push' });
    expect(push.errors).toEqual([]);
    expect(push.warnings).toContain(`the age reads stopped at their 0.2 s deadline with 5 of 5 commit(s) unread (${unread}): github.com did not answer in time; the pins still run the commits they name`);
    // A gpgv the deadline stops leaves its commit unread; it is never read as a commit without a signature.
    const stuck = path.join(scratch, 'stuck-gpgv');
    writeFileSync(stuck, '#!/bin/sh\nexec sleep 30\n', { mode: 0o755 });
    const commit = signedObject('signed.commit');
    const slow = await run(adds(commit.sha), network([{ commit }]), { now: new Date(SIGNED + 10 * DAY), ageDeadlineMs: 300, gpgv: stuck });
    expect(slow.errors).toEqual([`the age reads stopped at their 0.3 s deadline with 1 of 1 commit(s) unread (${REPO}@${commit.sha}): github.com did not answer in time; re-run the check`]);
  });
});

describe('a base without the age rule', SPAWNS, () => {
  it('has every pin aged, the ones it already runs included (bootstrapping)', async () => {
    const commit = signedObject('signed.commit');
    const pin = { ref: `${REPO}@${commit.sha}`, version: VERSION };
    const repo = repository({ base: workflow([pin]), head: workflow([pin]), baseAge: false });
    const transport = network([{ commit }]);
    const result = await run(repo, transport, { now: new Date(SIGNED + DAY) });
    expect(result.notes).toContain(`age: the merge base ${repo.base.slice(0, 12)} has no tools/check-action-pins/age.ts, so every pin is aged (bootstrapping)`);
    expect(transport.reads).toContain(`fetchRefs ${REPO} ${VERSION}`);
    expect(result.errors).toEqual([expect.stringContaining(': under three days old:')]);
  });
});

describe('a push run', SPAWNS, () => {
  it('warns about a young pin, never failing', async () => {
    const commit = signedObject('signed.commit');
    const result = await run(adds(commit.sha), network([{ commit }]), { now: new Date(SIGNED + DAY), event: 'push' });
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual(expect.arrayContaining([expect.stringContaining(`${REPO}@${commit.sha} ${VERSION}: under three days old:`)]));
  });

  it('compares GitHub’s published web-flow keys with the committed ones as sets of fingerprints, warning only when they differ', async () => {
    const commit = signedObject('signed.commit');
    const repo = adds(commit.sha);
    // Each key's own packets, re-armored on their own in the other order, with other line lengths and no checksum.
    const keys: Buffer[][] = [];
    for (const packet of packets(dearmor(KEYS.armored))) {
      if (packet.tag === 6) keys.push([]);
      keys.at(-1)?.push(packet.raw);
    }
    const armor = (bytes: Buffer) => `-----BEGIN PGP PUBLIC KEY BLOCK-----\nComment: synthetic\n\n${(bytes.toString('base64').match(/.{1,40}/g) ?? []).join('\n')}\n-----END PGP PUBLIC KEY BLOCK-----\n`;
    const [current, retired] = keys.map((parts) => Buffer.concat(parts));
    if (current === undefined || retired === undefined) throw new Error('make.sh wrote two keys');
    const published = (text: string) => network([{ commit }], { urls: { 'https://github.com/web-flow.gpg': text } });
    const same = await run(repo, published(armor(retired) + armor(current)), { now: new Date(SIGNED + 10 * DAY), event: 'push' });
    expect(same.warnings).toEqual([]);
    expect(same.notes).toContain('age: https://github.com/web-flow.gpg holds the committed web-flow keys');
    const rotated = await run(repo, published(armor(current)), { now: new Date(SIGNED + 10 * DAY), event: 'push' });
    expect(rotated.warnings).toEqual([
      `the web-flow keys at https://github.com/web-flow.gpg (${made('current')}) differ from testdata/age/keys.asc (${[made('current'), made('retired')].sort().join(', ')}): GitHub may have rotated its signing key; add the new key to the file (docs/adr/0066, Part 5)`,
    ]);
    expect(rotated.errors).toEqual([]);
  });
});

describe('the excludes', SPAWNS, () => {
  const GHSA_ID = 'GHSA-2222-3333-4444';
  const OLDER = unsigned(Date.parse('2020-01-01T00:00:00Z'), 'older');
  /** A security fix: the base pins v1.2.2, the head moves to make.sh's signed commit as v1.2.3. */
  const fix = (headExceptions?: unknown, base = workflow([{ ref: `${REPO}@${OLDER.sha}`, version: 'v1.2.2' }])) => repository({ base, head: workflow([{ ref: `${REPO}@${made('signed.commit')}`, version: VERSION }]), headExceptions });
  const entry = (over: Record<string, string | null> = {}) => ({ pin: `${REPO}@${made('signed.commit')}`, version: VERSION, kind: 'security-fix', advisory: GHSA_ID as string | null, reason: 'the fix of a synthetic advisory, for this test', added: '', expires: '', ...over });
  const NOW = SIGNED + DAY;

  it('admit a young pin under a live security-fix exclude, with a note, and refuse a missing advisory, a pattern, a version mismatch or an expiry outside the window', async () => {
    const commit = signedObject('signed.commit');
    const live = entry({ added: iso(NOW - HOUR), expires: iso(SIGNED + 3 * DAY + HOUR) });
    const admitted = await run(fix({ entries: [live] }), network([{ commit }]), { now: new Date(NOW) });
    expect(admitted.errors).toEqual([]);
    expect(admitted.notes).toEqual(
      expect.arrayContaining([
        `age: ${REPO}@${commit.sha}: under three days old (old enough from 2025-06-04T00:00:00Z), admitted by its security-fix exclude for ${GHSA_ID} until ${live.expires}`,
        `age: ${REPO}@${commit.sha} (security-fix): ${GHSA_ID} is checked against GitHub's advisory database on CI only; not read locally`,
      ]),
    );
    for (const [over, problem] of [
      [{ advisory: null }, `tools/check-action-pins/age-exceptions.json: ${REPO}@${commit.sha} (security-fix): a security-fix exclude names its advisory, a GHSA id (it is null)`],
      [{ pin: `${REPO}@*` }, `tools/check-action-pins/age-exceptions.json: ${REPO}@* (security-fix): not one exact pin (owner/repo@<40 hex>); a pattern, a tag or a path is refused, so each exclude names one commit`],
      [{ version: 'v1.2.4' }, `${REPO}@${commit.sha} (security-fix): the entry says v1.2.4, but the workflows label ${REPO}@${commit.sha} ${VERSION}`],
      [
        { expires: iso(SIGNED + 2 * DAY) },
        `${REPO}@${commit.sha} (security-fix): expires ${iso(SIGNED + 2 * DAY)}, before the pin is three days old (2025-06-04T00:00:00.000Z; committer date 2025-06-01T00:00:00Z), so it would lapse while still needed`,
      ],
      [{ expires: iso(NOW - HOUR + 8 * DAY) }, `${REPO}@${commit.sha} (security-fix): expires ${iso(NOW - HOUR + 8 * DAY)}, more than 7 days after it was added (${iso(NOW - HOUR)}); F2 (b) allows seven`],
    ] as const) {
      const result = await run(fix({ entries: [{ ...live, ...over }] }), network([{ commit }]), { now: new Date(NOW) });
      expect(result.errors, problem).toContain(problem);
    }
  });

  it('refuse an age-unprovable exclude on a pin GitHub dated, an off-default-branch one on a pin on main, an advisory on either, and either added in the future or lasting past seven days', async () => {
    const commit = signedObject('signed.commit');
    const now = SIGNED + 10 * DAY;
    const reasoned = (kind: string, over: Record<string, unknown> = {}) => ({ ...entry({ kind, advisory: null, reason: 'a reason long enough for this synthetic test', added: iso(now - HOUR), expires: iso(now + DAY) }), ...over });
    const check = async (exclude: unknown) => (await run(adds(commit.sha, VERSION, { headExceptions: { entries: [exclude] } }), network([{ commit }]), { now: new Date(now) })).errors;
    expect(await check(reasoned('age-unprovable'))).toEqual([`${REPO}@${commit.sha} ${VERSION}: an age-unprovable exclude, but GitHub recorded a time for it (web-flow signature 2025-06-01T00:00:00Z); remove the entry`]);
    expect(await check(reasoned('off-default-branch'))).toEqual([`${REPO}@${commit.sha} ${VERSION}: an off-default-branch exclude, but the pin is on main; remove the entry`]);
    for (const kind of ['age-unprovable', 'off-default-branch']) {
      expect(await check(reasoned(kind, { advisory: GHSA_ID })), kind).toContain(`tools/check-action-pins/age-exceptions.json: ${REPO}@${commit.sha} (${kind}): an ${kind} exclude takes no advisory (null); it rests on its reason`);
      expect(await check(reasoned(kind, { added: iso(now + DAY), expires: iso(now + 2 * DAY) })), kind).toContain(`${REPO}@${commit.sha} (${kind}): added ${iso(now + DAY)}, a time in the future`);
      expect(await check(reasoned(kind, { expires: iso(now - HOUR + 8 * DAY) })), kind).toContain(`${REPO}@${commit.sha} (${kind}): expires ${iso(now - HOUR + 8 * DAY)}, more than 7 days after it was added (${iso(now - HOUR)}); F2 (b) allows seven`);
    }
  });

  it('hold a pin an age-unprovable exclude admits to the floor by every time read: a 1-day-old committer date, or a mutable release 1 day old, still fails', async () => {
    const now = Date.parse('2030-01-10T00:00:00Z');
    const young = unsigned(now - DAY);
    const exclude = (pin: string) => ({ pin: `${REPO}@${pin}`, version: VERSION, kind: 'age-unprovable', advisory: null, reason: 'an action that publishes unsigned releases only', added: iso(now - HOUR), expires: iso(now + DAY) });
    const local = await run(adds(young.sha, VERSION, { headExceptions: { entries: [exclude(young.sha)] } }), network([{ commit: young }]), { now: new Date(now) });
    expect(local.errors).toEqual([expect.stringContaining(`${REPO}@${young.sha} ${VERSION}: under three days old: the youngest time read is the committer date ${iso(now - DAY)},`)]);
    expect(local.notes).toEqual(expect.arrayContaining([expect.stringContaining(`age: ${REPO}@${young.sha}: no time GitHub recorded, admitted by its age-unprovable exclude`)]));

    const old = unsigned(Date.parse('2020-01-01T00:00:00Z'));
    const answers = network([{ commit: old, api: { [`git/commits/${old.sha}`]: verified(null, 'unsigned'), [`releases/tags/${VERSION}`]: release(iso(now - DAY), false) } }]);
    const onCi = await run(adds(old.sha, VERSION, { headExceptions: { entries: [exclude(old.sha)] } }), answers, { now: new Date(now), ...CI });
    expect(onCi.errors).toEqual([expect.stringContaining(`: under three days old: the youngest time read is the release published_at ${iso(now - DAY)},`)]);
  });

  it('hold a pin an off-default-branch exclude admits to the floor: 1 day old it still fails', async () => {
    const commit = signedObject('signed.commit');
    const main = unsigned(Date.parse('2025-07-01T00:00:00Z'), 'main');
    const now = SIGNED + DAY;
    const exclude = { pin: `${REPO}@${commit.sha}`, version: VERSION, kind: 'off-default-branch', advisory: null, reason: 'released from the v1 maintenance branch', added: iso(now - HOUR), expires: iso(now + DAY) };
    const result = await run(adds(commit.sha, VERSION, { headExceptions: { entries: [exclude] } }), network([{ commit, offBranch: true, objects: { [main.sha]: main.raw } }]), { now: new Date(now) });
    expect(result.errors).toEqual([expect.stringContaining(`${REPO}@${commit.sha} ${VERSION}: under three days old:`)]);
    expect(result.notes).toEqual(expect.arrayContaining([expect.stringContaining(`age: ${REPO}@${commit.sha}: not on main, admitted by its off-default-branch exclude`)]));
  });

  it('fail an expired entry on a pull request that edits the list, warn about it elsewhere, and warn about an entry no workflow pins', async () => {
    const now = Date.parse('2030-01-10T00:00:00Z');
    const commit = unsigned(Date.parse('2020-01-01T00:00:00Z'));
    const pin = { ref: `${REPO}@${commit.sha}`, version: VERSION };
    const expired = { pin: `${REPO}@${commit.sha}`, version: VERSION, kind: 'age-unprovable', advisory: null, reason: 'an action that publishes unsigned releases only', added: iso(now - 10 * DAY), expires: iso(now - 3 * DAY) };
    const unused = { ...expired, pin: `octo/gone@${sha('9')}`, added: iso(now - HOUR), expires: iso(now + DAY) };
    const removal = `${REPO}@${commit.sha} (age-unprovable): expired ${expired.expires}; remove it from tools/check-action-pins/age-exceptions.json (the weekly triage, docs/runbooks/dependency-upgrades.md)`;
    const gone = `octo/gone@${sha('9')} (age-unprovable): no workflow pins octo/gone@${sha('9')}; remove the entry from tools/check-action-pins/age-exceptions.json (the weekly triage)`;
    const kept = await run(repository({ base: workflow([pin]), head: workflow([pin]), baseExceptions: { entries: [expired] }, headExceptions: { entries: [expired] } }), network([{ commit }]), { now: new Date(now) });
    expect(kept.errors).toEqual([]);
    expect(kept.warnings).toEqual([removal]);
    const edited = repository({ base: workflow([pin]), head: workflow([pin]), baseExceptions: { entries: [expired] }, headExceptions: { entries: [expired, unused] } });
    const pr = await run(edited, network([{ commit }]), { now: new Date(now) });
    expect(pr.errors).toEqual([removal]);
    expect(pr.warnings).toEqual([gone]);
    const push = await run(edited, network([{ commit }]), { now: new Date(now), event: 'push' });
    expect(push.errors).toEqual([]);
    expect(push.warnings).toEqual(expect.arrayContaining([gone, removal]));
  });

  it('on CI check an added security-fix exclude’s advisory in GitHub’s advisory database, and refuse one for an action the base does not pin', async () => {
    const commit = signedObject('signed.commit');
    const live = entry({ added: iso(NOW - HOUR), expires: iso(SIGNED + 3 * DAY + HOUR) });
    const advisory = (over: Record<string, unknown> = {}, vulnerability: Record<string, unknown> = {}) =>
      JSON.stringify({ ghsa_id: GHSA_ID, withdrawn_at: null, vulnerabilities: [{ package: { ecosystem: 'actions', name: REPO }, vulnerable_version_range: '>= v1.0.0, < 1.2.3', first_patched_version: '1.2.3', ...vulnerability }], ...over });
    const answers = (text: string) => network([{ commit, api: { [`git/commits/${commit.sha}`]: verified(iso(SIGNED)) } }], { urls: { [`${API}/advisories/${GHSA_ID}`]: text } });
    const subject = `${REPO}@${commit.sha} (security-fix)`;
    const checked = await run(fix({ entries: [live] }), answers(advisory()), { now: new Date(NOW), ...CI });
    expect(checked.errors).toEqual([]);
    expect(checked.notes).toContain(`age: ${subject}: ${GHSA_ID} covers v1.2.2, which the base pins, and not ${VERSION}`);
    for (const [text, problem] of [
      [advisory({ withdrawn_at: '2025-05-01T00:00:00Z' }), `${subject}: ${GHSA_ID} was withdrawn 2025-05-01T00:00:00Z;`],
      [advisory({}, { package: { ecosystem: 'npm', name: REPO } }), `${subject}: ${GHSA_ID} lists no vulnerability in the actions ecosystem for ${REPO};`],
      [advisory({}, { vulnerable_version_range: '< 1.2.0' }), `${subject}: ${GHSA_ID}'s vulnerable range for ${REPO} (< 1.2.0) does not cover v1.2.2, the version the base pins;`],
      [advisory({}, { vulnerable_version_range: '<= 1.2.3' }), `${subject}: ${GHSA_ID}'s vulnerable range for ${REPO} (<= 1.2.3) covers ${VERSION} itself, so it is not the fix`],
    ] as const) {
      const result = await run(fix({ entries: [live] }), answers(text), { now: new Date(NOW), ...CI });
      expect(result.errors, problem).toEqual([expect.stringContaining(problem)]);
    }
    const transport = answers(advisory());
    const unpinned = await run(fix({ entries: [live] }, workflow([])), transport, { now: new Date(NOW), ...CI });
    expect(unpinned.errors).toEqual([expect.stringContaining(`${subject}: the base pins no other commit of ${REPO}, so no advisory against what we run can be fixed by it;`)]);
    expect(transport.reads).not.toContain(`GET ${API}/advisories/${GHSA_ID}`);
    // GHSA's range syntax, a version's v prefix stripped on either side (N8).
    expect([ghsaRangeHolds('>= 1.0.0, < 1.4.2', 'v1.4.1'), ghsaRangeHolds('>= 1.0.0, < 1.4.2', 'v1.4.2'), ghsaRangeHolds('= v2.0.0', '2.0.0'), ghsaRangeHolds('< 3', 'v2.9.9'), ghsaRangeHolds('>= 1.0.0,', 'v1.0.0')]).toEqual([true, false, true, true, false]);
  });
});

describe('the committed files', SPAWNS, () => {
  it('hold GitHub’s two web-flow keys, by fingerprint, and no exclude', () => {
    const committed = webFlowKeys();
    expect(armoredFingerprints(committed.armored)).toEqual(['968479A1AFF927E37D1A566BB5690EEEBB952194', '5DE3E0509C47EA3CF04A42D34AEE18F83AFDEB23']);
    expect([committed.current, committed.retired.fingerprint, committed.retired.expired]).toEqual(['968479A1AFF927E37D1A566BB5690EEEBB952194', '5DE3E0509C47EA3CF04A42D34AEE18F83AFDEB23', '2024-01-16T20:00:00Z']);
    const list = readFileSync(new URL('./age-exceptions.json', import.meta.url), 'utf8');
    expect((JSON.parse(list) as { entries: unknown[] }).entries).toEqual([]);
    expect(exceptionProblems(list)).toEqual([]);
  });
});

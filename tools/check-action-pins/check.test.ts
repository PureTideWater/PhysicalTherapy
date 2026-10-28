import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { baseState, selectPins } from './base';
import { checkActionPins, PUSH_CONCURRENCY } from './check';
import { blob, HANG, lightweight, recordedTransport, sha } from './fixtures';

/**
 * Which pins the networked checks read, and what a run reports (CI-11): an unchanged pin makes no network read and a
 * new one does; a step whose inputs changed is read again; every pin is read when the base has no checker or the change
 * edits it; a moved tag of an unchanged pin warns on a push run; a new pin whose reads fail three times fails the run.
 */

const CHECKOUT = sha('c');
const NEWER = sha('d');
const NODE = sha('e');

const workflow = (checkout: string, nodeWith = '{ node-version: 24 }') => `name: ci
on: push
jobs:
  build:
    runs-on: ubuntu-24.04
    steps:
      - uses: octo/checkout@${checkout} # ${checkout === CHECKOUT ? 'v7.0.1' : 'v7.0.2'}
        with: { persist-credentials: false }
      - uses: octo/setup-node@${NODE} # v7.1.0
        with: ${nodeWith}
`;

/** The age rule's view of a fixture pin (docs/adr/0066, Part 5): an old unsigned commit on main with an old immutable release, verified_at null. */
const OLD = 'tree 4b825dc642cb6eb9a060e54bf8d69288fbee4904\nauthor Synthetic <synthetic@example.invalid> 1577836800 +0000\ncommitter Synthetic <synthetic@example.invalid> 1577836800 +0000\n\nsynthetic\n';
const API = 'https://api.github.com/repos';
const aged = (repo: string, tags: Record<string, string>) => ({
  git: { [repo]: { head: Object.values(tags).at(-1), tags: Object.fromEntries(Object.entries(tags).map(([version, commit]) => [version, { object: commit, commit }])), objects: Object.fromEntries(Object.values(tags).map((commit) => [commit, OLD])) } },
  urls: Object.fromEntries(
    Object.entries(tags).flatMap(([version, commit]) => [
      [`${API}/${repo}/git/commits/${commit}`, JSON.stringify({ verification: { verified: false, reason: 'unsigned', verified_at: null } })],
      [`${API}/${repo}/releases/tags/${version}`, JSON.stringify({ tag_name: version, published_at: '2020-01-02T00:00:00Z', immutable: true })],
    ]),
  ),
});
const checkoutAge = aged('octo/checkout', { 'v7.0.1': CHECKOUT, 'v7.0.2': NEWER });
const nodeAge = aged('octo/setup-node', { 'v7.1.0': NODE });

const network = () =>
  recordedTransport({
    tags: { 'octo/checkout': lightweight('v7.0.1', CHECKOUT) + lightweight('v7.0.2', NEWER), 'octo/setup-node': lightweight('v7.1.0', NODE) },
    files: {
      [blob('octo/checkout', CHECKOUT)]: 'inputs:\n  persist-credentials: { default: true }\nruns:\n  using: node24\n  main: x.js\n',
      [blob('octo/checkout', NEWER)]: 'inputs:\n  persist-credentials: { default: true }\nruns:\n  using: node24\n  main: x.js\n',
      [blob('octo/setup-node', NODE)]: 'inputs:\n  node-version: {}\n  cache: {}\nruns:\n  using: node24\n  main: x.js\n',
    },
    git: { ...checkoutAge.git, ...nodeAge.git },
    urls: { ...checkoutAge.urls, ...nodeAge.urls },
  });

/** On CI the age rule reads GitHub's API with the job's token; a made-up one here. */
const CI = { ci: true, token: 'synthetic-token' } as const;

// Made before the tests run, not when the file is collected (tools/test/collection.test.ts).
let scratch = '';
beforeAll(() => {
  scratch = mkdtempSync(path.join(os.tmpdir(), 'tp-action-pins-'));
});
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

/**
 * A repository whose first commit holds this workflow (and, if asked, the checker, with its age rule unless `baseAge` is
 * false), with a later head commit.
 */
function repository(options: { baseWorkflow: string; headWorkflow: string; baseChecker: boolean; baseAge?: boolean; headCheckerEdit?: boolean; baseFiles?: Readonly<Record<string, string>>; headFiles?: Readonly<Record<string, string>> }) {
  const dir = mkdtempSync(path.join(scratch, 'repo-'));
  const env = { ...process.env, HOME: dir, GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'Synthetic', GIT_AUTHOR_EMAIL: 'synthetic@example.invalid', GIT_COMMITTER_NAME: 'Synthetic', GIT_COMMITTER_EMAIL: 'synthetic@example.invalid' };
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, env, encoding: 'utf8' }).trim();
  const write = (file: string, text: string) => {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), text);
  };
  git('init', '-q', '-b', 'main');
  write('.github/workflows/ci.yml', options.baseWorkflow);
  if (options.baseChecker) write('tools/check-action-pins/index.ts', '// the checker\n');
  if (options.baseAge ?? true) write('tools/check-action-pins/age.ts', '// the age rule\n');
  for (const [file, text] of Object.entries(options.baseFiles ?? {})) write(file, text);
  git('add', '.');
  git('commit', '-q', '-m', 'base');
  const base = git('rev-parse', 'HEAD');
  write('.github/workflows/ci.yml', options.headWorkflow);
  if (options.headCheckerEdit === true) write('tools/check-action-pins/index.ts', '// the checker, edited\n');
  for (const [file, text] of Object.entries(options.headFiles ?? {})) write(file, text);
  write('README.md', 'head\n');
  git('add', '.');
  git('commit', '-q', '-m', 'head');
  return { dir, base };
}

describe('the pins the network reads', () => {
  it('are none when no pin is new and no step’s inputs changed, so a change that touches no pin reads nothing', async () => {
    const repo = repository({ baseWorkflow: workflow(CHECKOUT), headWorkflow: workflow(CHECKOUT), baseChecker: true });
    const transport = network();
    const result = await checkActionPins({ root: repo.dir, base: repo.base, event: 'pull_request', transport });
    expect(result).toMatchObject({ errors: [], warnings: [] });
    expect(transport.reads).toEqual([]);
    expect(result.notes).toEqual(expect.arrayContaining(['no pin is new or used with changed inputs: no action read from the network', 'age: no pin new against the base, nothing read']));
  });

  it('are the new pin alone, with its tag and its inputs read, and a step whose inputs changed', async () => {
    const bumped = repository({ baseWorkflow: workflow(CHECKOUT), headWorkflow: workflow(NEWER), baseChecker: true });
    const transport = network();
    expect(await checkActionPins({ root: bumped.dir, base: bumped.base, event: 'pull_request', transport, ...CI })).toMatchObject({ errors: [], warnings: [] });
    expect(transport.reads).toEqual([
      'ls-remote https://github.com/octo/checkout refs/tags/v7.0.2 refs/tags/v7.0.2^{}',
      `git ${blob('octo/checkout', NEWER)}`,
      'fetchRefs octo/checkout v7.0.2',
      `GET ${API}/octo/checkout/git/commits/${NEWER}`,
      `GET ${API}/octo/checkout/releases/tags/v7.0.2`,
      `GET ${API}/octo/checkout/activity?ref=refs/heads/main&per_page=100`,
    ]);

    const changed = repository({ baseWorkflow: workflow(CHECKOUT), headWorkflow: workflow(CHECKOUT, '{ node-version: 24, cache: pnpm }'), baseChecker: true });
    const again = network();
    expect(await checkActionPins({ root: changed.dir, base: changed.base, event: 'pull_request', transport: again })).toMatchObject({ errors: [] });
    expect(again.reads).toEqual(['ls-remote https://github.com/octo/setup-node refs/tags/v7.1.0 refs/tags/v7.1.0^{}', `git ${blob('octo/setup-node', NODE)}`]);
  });

  it('are every pin when the base has no checker, when the change edits the checker, or when no BASE is given', async () => {
    for (const [name, repo] of [
      ['no checker at the base', repository({ baseWorkflow: workflow(CHECKOUT), headWorkflow: workflow(CHECKOUT), baseChecker: false, baseAge: false })],
      ['the checker edited', repository({ baseWorkflow: workflow(CHECKOUT), headWorkflow: workflow(CHECKOUT), baseChecker: true, headCheckerEdit: true })],
    ] as const) {
      expect(baseState(repo.dir, repo.base).everyPin, name).toBeDefined();
      const transport = network();
      expect(await checkActionPins({ root: repo.dir, base: repo.base, event: 'pull_request', transport, ...CI }), name).toMatchObject({ errors: [] });
      expect(transport.reads.filter((read) => read.startsWith('ls-remote')), name).toHaveLength(2);
    }
    const repo = repository({ baseWorkflow: workflow(CHECKOUT), headWorkflow: workflow(CHECKOUT), baseChecker: true });
    const transport = network();
    const result = await checkActionPins({ root: repo.dir, base: undefined, event: undefined, transport });
    expect(result.notes[0]).toBe('no BASE: every pin is read');
    expect(transport.reads.filter((read) => read.startsWith('ls-remote'))).toHaveLength(2);
  });

  it('fail the run when BASE is not a commit of the checkout', async () => {
    const repo = repository({ baseWorkflow: workflow(CHECKOUT), headWorkflow: workflow(CHECKOUT), baseChecker: true });
    const result = await checkActionPins({ root: repo.dir, base: 'f'.repeat(40), event: 'pull_request', transport: network() });
    expect(result.errors).toEqual([expect.stringMatching(/^BASE f{40} has no merge base with HEAD in this checkout/)]);
  });

  it('keep release.yml’s steps apart, so the same inputs elsewhere never vouch for its caches', () => {
    const release = { file: 'release.yml', text: workflow(CHECKOUT) };
    expect(selectPins([release], [{ file: 'ci.yml', text: workflow(CHECKOUT) }]).verify).toEqual(new Set([`octo/checkout@${CHECKOUT}`, `octo/setup-node@${NODE}`]));
    expect(selectPins([release], [release]).verify).toEqual(new Set());
  });

  it('read the base’s workflows at the top level only, as GitHub runs them, and a file in a subdirectory of .github/workflows is refused, so a pin parked there is aged when it enters a workflow (SEC-S3)', async () => {
    const PYTHON = sha('f');
    const parked = `name: next\non: push\njobs:\n  build:\n    runs-on: ubuntu-24.04\n    steps:\n      - uses: octo/setup-python@${PYTHON} # v7.2.0\n`;
    const head = `${workflow(CHECKOUT)}      - uses: octo/setup-python@${PYTHON} # v7.2.0\n`;
    // The first pull request parked the pin in a subdirectory, which GitHub never runs; the second moves it into ci.yml.
    const repo = repository({ baseWorkflow: workflow(CHECKOUT), headWorkflow: head, baseChecker: true, baseFiles: { '.github/workflows/drafts/next.yml': parked }, headFiles: { '.github/workflows/drafts/next.yml': parked } });
    expect(baseState(repo.dir, repo.base).workflows.map((workflow) => workflow.file)).toEqual(['ci.yml']);
    const refusal = '.github/workflows/drafts/next.yml: a file in a subdirectory of .github/workflows, which GitHub never runs and this check never reads, so a pin parked there would enter a workflow later without its age read; keep drafts outside .github/workflows';
    const offline = await checkActionPins({ root: repo.dir, base: repo.base, event: 'pull_request', transport: recordedTransport({}), offline: true });
    expect(offline.errors).toEqual([refusal]);
    const transport = recordedTransport({
      tags: { 'octo/setup-python': lightweight('v7.2.0', PYTHON) },
      files: { [blob('octo/setup-python', PYTHON)]: 'runs:\n  using: node24\n  main: x.js\n' },
    });
    const result = await checkActionPins({ root: repo.dir, base: repo.base, event: 'pull_request', transport });
    expect(result.errors).toContain(refusal);
    // New against the base's top-level workflows: verified and aged, not vouched for by the parked copy.
    expect(transport.reads).toEqual(expect.arrayContaining(['ls-remote https://github.com/octo/setup-python refs/tags/v7.2.0 refs/tags/v7.2.0^{}', 'fetchRefs octo/setup-python v7.2.0']));
  });
});

describe('a run', () => {
  it('warns on a push run, never fails, when an unchanged pin’s tag moved or cannot be read', async () => {
    const repo = repository({ baseWorkflow: workflow(CHECKOUT), headWorkflow: workflow(CHECKOUT), baseChecker: true });
    const moved = recordedTransport({ tags: { 'octo/checkout': lightweight('v7.0.1', NEWER), 'octo/setup-node': new Error('HTTP 429') } });
    const result = await checkActionPins({ root: repo.dir, base: repo.base, event: 'push', transport: moved });
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([
      `octo/checkout@${CHECKOUT}: the tag v7.0.1 of octo/checkout now names ${NEWER}; the pin still runs the commit it names, and the next actions update moves it`,
      expect.stringMatching(new RegExp(`^octo/setup-node@${NODE}: its tag could not be read again \\(github\\.com: git ls-remote of octo/setup-node refs/tags/v7\\.1\\.0 failed 3 times`)),
    ]);
    // A pull request reads no unchanged pin at all.
    const quiet = recordedTransport({});
    expect(await checkActionPins({ root: repo.dir, base: repo.base, event: 'pull_request', transport: quiet })).toMatchObject({ errors: [], warnings: [] });
    expect(quiet.reads).toEqual([]);
  });

  it('re-reads a push run’s unchanged tags a few at a time under one deadline, the reads it stops one warning, never a failure', async () => {
    // Ten pins, every tag hanging as a github.com that accepts and never answers: the run ends at the deadline.
    const many = (seed: string) => `name: ci
on: push
jobs:
  build:
    runs-on: ubuntu-24.04
    steps:
${Array.from({ length: 10 }, (_, i) => `      - uses: octo/a${String(i)}@${sha(seed + String(i))} # v1.0.${String(i)}\n`).join('')}`;
    const repo = repository({ baseWorkflow: many('a'), headWorkflow: many('a'), baseChecker: true });
    const tags: Record<string, typeof HANG> = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`octo/a${String(i)}`, HANG]));
    const hung = recordedTransport({ tags });
    const started = Date.now();
    const result = await checkActionPins({ root: repo.dir, base: repo.base, event: 'push', transport: hung, pushDeadlineMs: 200 });
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([
      `the push run's re-read of unchanged tags stopped at its 0.2 s deadline with 10 of 10 unread (${Array.from({ length: 10 }, (_, i) => `octo/a${String(i)}@${sha('a' + String(i))}`).join(', ')}); the pins still run the commits they name`,
    ]);
    expect(hung.peak()).toBe(PUSH_CONCURRENCY);

    // Answers that take a while: never more than the limit in flight, and every tag read.
    const tagged = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`octo/a${String(i)}`, lightweight(`v1.0.${String(i)}`, sha('a' + String(i)))]));
    const slow = recordedTransport({ tags: tagged, latency: 20 });
    expect(await checkActionPins({ root: repo.dir, base: repo.base, event: 'push', transport: slow })).toMatchObject({ errors: [], warnings: [] });
    expect(slow.reads).toHaveLength(10);
    expect(slow.peak()).toBe(PUSH_CONCURRENCY);
  });

  it('reads the BuildKit builder on Docker Hub on every networked run, a newer release three days old a warning', async () => {
    const BUILDX = sha('b');
    const DIGEST = `sha256:${'3'.repeat(64)}`;
    const builder = `${workflow(CHECKOUT)}      - uses: octo/setup-buildx@${BUILDX} # v4.4.1\n        with: { driver-opts: "image=moby/buildkit:v0.34.1@${DIGEST}" }\n`.replaceAll('octo/setup-buildx', 'docker/setup-buildx-action');
    const repo = repository({ baseWorkflow: builder, headWorkflow: builder, baseChecker: true });
    const now = new Date('2030-01-10T00:00:00Z');
    const transport = recordedTransport({
      urls: {
        'https://hub.docker.com/v2/repositories/moby/buildkit/tags/v0.34.1': JSON.stringify({ digest: DIGEST }),
        'https://hub.docker.com/v2/repositories/moby/buildkit/tags?page_size=100&ordering=last_updated': JSON.stringify({ results: [{ name: 'v0.35.0', tag_last_pushed: '2030-01-05T00:00:00Z' }] }),
      },
    });
    const result = await checkActionPins({ root: repo.dir, base: repo.base, event: 'pull_request', transport, now });
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([expect.stringMatching(/^the builder moby\/buildkit:v0\.34\.1: moby\/buildkit v0\.35\.0 was pushed 2030-01-05T00:00:00\.000Z/)]);
    // The builder is read; no action pin is, since none changed.
    expect(transport.reads.every((read) => read.startsWith('GET https://hub.docker.com/'))).toBe(true);
    // Offline, two builders are a failure without a read.
    const two = repository({ baseWorkflow: builder, headWorkflow: builder.replace('v0.34.1@', 'v0.34.0@'), baseChecker: true });
    writeFileSync(path.join(two.dir, '.github/workflows/b.yml'), builder.replace('name: ci', 'name: b'));
    const offline = await checkActionPins({ root: two.dir, base: two.base, event: 'pull_request', transport: recordedTransport({}), offline: true });
    expect(offline.errors).toEqual([expect.stringMatching(/^the setup-buildx steps name 2 builders, not one/)]);
  });

  it('takes the builder’s newness from the base’s workflows, so a change that edits the checker leaves an unchanged builder not new (E4)', async () => {
    const BUILDX = sha('b');
    const DIGEST = `sha256:${'3'.repeat(64)}`;
    const OTHER = `sha256:${'4'.repeat(64)}`;
    const builder = `${workflow(CHECKOUT)}      - uses: docker/setup-buildx-action@${BUILDX} # v4.4.1\n        with: { driver-opts: "image=moby/buildkit:v0.34.1@${DIGEST}" }\n`;
    // The change edits the checker, so every pin is verified again; the builder itself is the base's.
    const repo = repository({ baseWorkflow: builder, headWorkflow: builder, baseChecker: true, headCheckerEdit: true });
    expect(baseState(repo.dir, repo.base).everyPin).toBe('this change edits tools/check-action-pins');
    const transport = recordedTransport({
      tags: { 'octo/checkout': lightweight('v7.0.1', CHECKOUT), 'octo/setup-node': lightweight('v7.1.0', NODE), 'docker/setup-buildx-action': lightweight('v4.4.1', BUILDX) },
      files: {
        [blob('octo/checkout', CHECKOUT)]: 'inputs:\n  persist-credentials: {}\nruns:\n  using: node24\n  main: x.js\n',
        [blob('octo/setup-node', NODE)]: 'inputs:\n  node-version: {}\nruns:\n  using: node24\n  main: x.js\n',
        [blob('docker/setup-buildx-action', BUILDX)]: 'inputs:\n  driver-opts: {}\nruns:\n  using: node24\n  main: x.js\n',
      },
      // Docker Hub moved the builder's tag after the base was merged.
      urls: { 'https://hub.docker.com/v2/repositories/moby/buildkit/tags/v0.34.1': JSON.stringify({ digest: OTHER }), 'https://hub.docker.com/v2/repositories/moby/buildkit/tags?page_size=100&ordering=last_updated': '{"results":[]}' },
    });
    const result = await checkActionPins({ root: repo.dir, base: repo.base, event: 'pull_request', transport, now: new Date('2030-01-10T00:00:00Z') });
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([`the builder moby/buildkit:v0.34.1: its tag is the index ${OTHER}, not ${DIGEST}`]);
  });

  it('warns about every fault of the builder on a push, a new builder’s included, since the pull request was the gate (E4)', async () => {
    const BUILDX = sha('b');
    const DIGEST = `sha256:${'3'.repeat(64)}`;
    const OTHER = `sha256:${'4'.repeat(64)}`;
    const steps = (image: string) => `${workflow(CHECKOUT)}      - uses: docker/setup-buildx-action@${BUILDX} # v4.4.1\n        with: { driver-opts: "${image}" }\n`;
    // The builder is new against the previous head: another version at another digest.
    const repo = repository({ baseWorkflow: steps(`image=moby/buildkit:v0.34.0@${OTHER}`), headWorkflow: steps(`image=moby/buildkit:v0.34.1@${DIGEST}`), baseChecker: true });
    const answers = (tag: string | number) =>
      recordedTransport({
        tags: { 'docker/setup-buildx-action': lightweight('v4.4.1', BUILDX) },
        files: { [blob('docker/setup-buildx-action', BUILDX)]: 'inputs:\n  driver-opts: {}\nruns:\n  using: node24\n  main: x.js\n' },
        urls: { 'https://hub.docker.com/v2/repositories/moby/buildkit/tags/v0.34.1': tag, 'https://hub.docker.com/v2/repositories/moby/buildkit/tags?page_size=100&ordering=last_updated': '{"results":[]}' },
      });
    const now = new Date('2030-01-10T00:00:00Z');
    const moved = await checkActionPins({ root: repo.dir, base: repo.base, event: 'push', transport: answers(JSON.stringify({ digest: OTHER })), now });
    expect(moved.errors).toEqual([]);
    expect(moved.warnings).toContain(`the builder moby/buildkit:v0.34.1: its tag is the index ${OTHER}, not ${DIGEST}`);
    const limited = await checkActionPins({ root: repo.dir, base: repo.base, event: 'push', transport: answers(429), now });
    expect(limited.errors).toEqual([]);
    expect(limited.warnings).toEqual(expect.arrayContaining([expect.stringMatching(/^the builder moby\/buildkit:v0\.34\.1: hub\.docker\.com: GET .* failed 3 times \(last: HTTP 429\)/)]));
    // The same fault on a pull request is the gate's failure.
    expect((await checkActionPins({ root: repo.dir, base: repo.base, event: 'pull_request', transport: answers(JSON.stringify({ digest: OTHER })), now })).errors).toEqual([`the builder moby/buildkit:v0.34.1: its tag is the index ${OTHER}, not ${DIGEST}`]);
  });

  it('on a push, warns about a failed read or a moved tag of a pin the base already ran, keeps a problem in what was read an error, and stops at its deadline (S4)', async () => {
    // The change edits the checker, so every pin is verified again on its merge's push.
    const repo = repository({ baseWorkflow: workflow(CHECKOUT), headWorkflow: workflow(CHECKOUT), baseChecker: true, headCheckerEdit: true });
    const files = {
      [blob('octo/checkout', CHECKOUT)]: 'inputs:\n  persist-credentials: {}\nruns:\n  using: node24\n  main: x.js\n',
      // The action no longer declares the input the step gives: no outage or upstream move makes that.
      [blob('octo/setup-node', NODE)]: 'inputs:\n  version: {}\nruns:\n  using: node24\n  main: x.js\n',
    };
    const moved = recordedTransport({ tags: { 'octo/checkout': lightweight('v7.0.1', NEWER), 'octo/setup-node': lightweight('v7.1.0', NODE) }, files });
    const first = await checkActionPins({ root: repo.dir, base: repo.base, event: 'push', transport: moved });
    expect(first.errors).toEqual([`ci.yml build step 2 (octo/setup-node@${NODE}): gives the input node-version, which octo/setup-node@${NODE}:action.yml does not declare (it declares: version)`]);
    expect(first.warnings).toContain(`octo/checkout@${CHECKOUT}: the tag v7.0.1 of octo/checkout is the commit ${NEWER}, not ${CHECKOUT}; the base already ran this pin, so on a push this is a warning`);

    const down = recordedTransport({ tags: { 'octo/checkout': new Error('Connection reset by peer'), 'octo/setup-node': lightweight('v7.1.0', NODE) }, files: { ...files, [blob('octo/setup-node', NODE)]: 'inputs:\n  node-version: {}\nruns:\n  using: node24\n  main: x.js\n' } });
    const second = await checkActionPins({ root: repo.dir, base: repo.base, event: 'push', transport: down });
    expect(second.errors).toEqual([]);
    expect(second.warnings).toContain(
      `octo/checkout@${CHECKOUT}: github.com: git ls-remote of octo/checkout refs/tags/v7.0.1 failed 3 times (last: Connection reset by peer); the check fails closed; the base already ran this pin, so on a push this is a warning`,
    );

    // A github.com that accepts and never answers: the loop ends at its deadline, the pins it left one warning.
    const hung = recordedTransport({ tags: { 'octo/checkout': HANG, 'octo/setup-node': HANG } });
    const started = Date.now();
    const third = await checkActionPins({ root: repo.dir, base: repo.base, event: 'push', transport: hung, pushDeadlineMs: 200 });
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(third.errors).toEqual([]);
    expect(third.warnings).toContain(`the push run's verify reads stopped at their 0.2 s deadline with 2 pin(s) the base already ran unread (octo/checkout@${CHECKOUT}, octo/setup-node@${NODE}); they still run the commits they name`);

    // A pin new against the previous head keeps every error, on a push too.
    const added = repository({ baseWorkflow: workflow(CHECKOUT), headWorkflow: workflow(NEWER), baseChecker: true });
    const fresh = await checkActionPins({ root: added.dir, base: added.base, event: 'push', transport: recordedTransport({ tags: { 'octo/checkout': new Error('Connection reset by peer') } }) });
    expect(fresh.errors).toEqual([`octo/checkout@${NEWER}: github.com: git ls-remote of octo/checkout refs/tags/v7.0.2 failed 3 times (last: Connection reset by peer); the check fails closed`]);
  });

  it('fails closed when a new pin cannot be read in three tries, naming the host', async () => {
    const repo = repository({ baseWorkflow: workflow(CHECKOUT), headWorkflow: workflow(NEWER), baseChecker: true });
    const down = recordedTransport({ tags: { 'octo/checkout': new Error('Connection reset by peer') } });
    const result = await checkActionPins({ root: repo.dir, base: repo.base, event: 'pull_request', transport: down });
    expect(result.errors).toEqual([`octo/checkout@${NEWER}: github.com: git ls-remote of octo/checkout refs/tags/v7.0.2 failed 3 times (last: Connection reset by peer); the check fails closed`]);
    expect(down.pauses).toEqual([2_000, 5_000]);
  });

  it('runs the offline rules alone with --offline, reading nothing', async () => {
    const repo = repository({ baseWorkflow: workflow(CHECKOUT), headWorkflow: workflow(CHECKOUT).replace(`@${CHECKOUT} # v7.0.1`, '@v7'), baseChecker: true });
    const transport = network();
    const result = await checkActionPins({ root: repo.dir, base: repo.base, event: 'pull_request', transport, offline: true });
    expect(result.errors).toEqual(['ci.yml:7: octo/checkout@v7 is not pinned to a full commit SHA (owner/repo@<40 hex> # vX.Y.Z)']);
    expect(transport.reads).toEqual([]);
  });
});

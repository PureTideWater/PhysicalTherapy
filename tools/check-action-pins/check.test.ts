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

const network = () =>
  recordedTransport({
    tags: { 'octo/checkout': lightweight('v7.0.1', CHECKOUT) + lightweight('v7.0.2', NEWER), 'octo/setup-node': lightweight('v7.1.0', NODE) },
    files: {
      [blob('octo/checkout', CHECKOUT)]: 'inputs:\n  persist-credentials: { default: true }\nruns:\n  using: node24\n  main: x.js\n',
      [blob('octo/checkout', NEWER)]: 'inputs:\n  persist-credentials: { default: true }\nruns:\n  using: node24\n  main: x.js\n',
      [blob('octo/setup-node', NODE)]: 'inputs:\n  node-version: {}\n  cache: {}\nruns:\n  using: node24\n  main: x.js\n',
    },
  });

// Made before the tests run, not when the file is collected (tools/test/collection.test.ts).
let scratch = '';
beforeAll(() => {
  scratch = mkdtempSync(path.join(os.tmpdir(), 'tp-action-pins-'));
});
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

/** A repository whose first commit holds this workflow (and, if asked, the checker), with a later head commit. */
function repository(options: { baseWorkflow: string; headWorkflow: string; baseChecker: boolean; headCheckerEdit?: boolean }) {
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
  git('add', '.');
  git('commit', '-q', '-m', 'base');
  const base = git('rev-parse', 'HEAD');
  write('.github/workflows/ci.yml', options.headWorkflow);
  if (options.headCheckerEdit === true) write('tools/check-action-pins/index.ts', '// the checker, edited\n');
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
    expect(result.notes).toContain('no pin is new or used with changed inputs: nothing read from the network');
  });

  it('are the new pin alone, with its tag and its inputs read, and a step whose inputs changed', async () => {
    const bumped = repository({ baseWorkflow: workflow(CHECKOUT), headWorkflow: workflow(NEWER), baseChecker: true });
    const transport = network();
    expect(await checkActionPins({ root: bumped.dir, base: bumped.base, event: 'pull_request', transport })).toMatchObject({ errors: [], warnings: [] });
    expect(transport.reads).toEqual(['ls-remote https://github.com/octo/checkout refs/tags/v7.0.2 refs/tags/v7.0.2^{}', `git ${blob('octo/checkout', NEWER)}`]);

    const changed = repository({ baseWorkflow: workflow(CHECKOUT), headWorkflow: workflow(CHECKOUT, '{ node-version: 24, cache: pnpm }'), baseChecker: true });
    const again = network();
    expect(await checkActionPins({ root: changed.dir, base: changed.base, event: 'pull_request', transport: again })).toMatchObject({ errors: [] });
    expect(again.reads).toEqual(['ls-remote https://github.com/octo/setup-node refs/tags/v7.1.0 refs/tags/v7.1.0^{}', `git ${blob('octo/setup-node', NODE)}`]);
  });

  it('are every pin when the base has no checker, when the change edits the checker, or when no BASE is given', async () => {
    for (const [name, repo] of [
      ['no checker at the base', repository({ baseWorkflow: workflow(CHECKOUT), headWorkflow: workflow(CHECKOUT), baseChecker: false })],
      ['the checker edited', repository({ baseWorkflow: workflow(CHECKOUT), headWorkflow: workflow(CHECKOUT), baseChecker: true, headCheckerEdit: true })],
    ] as const) {
      expect(baseState(repo.dir, repo.base).everyPin, name).toBeDefined();
      const transport = network();
      expect(await checkActionPins({ root: repo.dir, base: repo.base, event: 'pull_request', transport }), name).toMatchObject({ errors: [] });
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
    const tags = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`octo/a${String(i)}`, HANG]));
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

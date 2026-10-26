import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { annotated, blob, lightweight, recordedTransport, sha } from './fixtures';
import { actionFile, gitTransport, NetworkError, tagCommit, withRetries } from './network';
import { ActionReader, cacheGates, gateOf, inputProblems, parseActionMeta, releaseCacheProblems, verifyPin } from './verify';
import type { ActionUse } from './workflows';

/**
 * The networked checks of one pin, on a recorded network (CI-11): the tag, the inputs, the nested actions pinned by
 * SHA, and release.yml's nested caches each traced to an input its step turns off.
 */

const SCAN = sha('5');
const SETUP = sha('6');
const CACHE = sha('7');
const CHECKOUT = sha('8');

const node = (inputs: string) => `name: n\ninputs:\n${inputs}runs:\n  using: node24\n  main: index.js\n`;

/** A scanner composite in the shape of trivy-action: a setup composite given its cache input, then its own cache. */
const scanner = (options: { setupRef?: string; cacheIf?: string; binding?: string } = {}) => `name: scan
inputs:
  image-ref: { required: false }
  cache: { required: false, default: 'true' }
  version: { required: false, default: v1.0.0 }
runs:
  using: composite
  steps:
    - uses: ${options.setupRef ?? `octo/setup-scan@${SETUP}`}
      with:
        version: \${{ inputs.version }}
        cache: ${options.binding ?? '${{ inputs.cache }}'}
    - name: Restore DB from cache
      if: ${options.cacheIf ?? "${{ inputs.cache == 'true' }}"}
      uses: actions/cache@${CACHE}
      with: { path: db, key: db }
`;

const setup = `name: setup
inputs:
  version: { required: false, default: latest }
  cache: { required: false, default: 'false' }
runs:
  using: composite
  steps:
    - name: Restore the binary
      if: \${{ inputs.cache == 'true' && inputs.version != 'latest' }}
      id: cache
      uses: actions/cache/restore@${CACHE}
      with: { path: bin, key: bin }
    - if: steps.cache.outputs.cache-hit != 'true'
      uses: actions/checkout@${CHECKOUT}
    - name: Save the binary
      if: \${{ inputs.cache == 'true' && inputs.version != 'latest' && steps.cache.outputs.cache-hit != 'true' }}
      uses: actions/cache/save@${CACHE}
      with: { path: bin, key: bin }
`;

const network = (overrides: { scan?: string; setupFile?: string } = {}) =>
  recordedTransport({
    tags: { 'octo/scan': annotated('v0.36.0', sha('9'), SCAN) },
    files: {
      [blob('octo/scan', SCAN, 'action.yaml')]: overrides.scan ?? scanner(),
      [blob('octo/setup-scan', SETUP, 'action.yaml')]: overrides.setupFile ?? setup,
      [blob('actions/cache', CACHE)]: node('  path: { required: true }\n  key: { required: true }\n'),
      [blob('actions/cache', CACHE, 'restore/action.yml')]: node('  path: { required: true }\n  key: { required: true }\n'),
      [blob('actions/cache', CACHE, 'save/action.yml')]: node('  path: { required: true }\n  key: { required: true }\n'),
      [blob('actions/checkout', CHECKOUT)]: node('  fetch-depth: { default: 1 }\n'),
    },
  });

const use = (file: string, given: Record<string, unknown>): ActionUse => ({ file, job: 'build', step: 3, uses: `octo/scan@${SCAN}`, with: given });

describe('a pin’s tag', () => {
  it('is the annotated tag’s peeled commit, or the lightweight tag’s own', async () => {
    const transport = recordedTransport({ tags: { 'octo/a': annotated('v1.2.3', sha('1'), sha('2')), 'octo/b': lightweight('v1.2.3', sha('3')) } });
    expect(await tagCommit(transport, 'octo/a', 'v1.2.3')).toBe(sha('2'));
    expect(await tagCommit(transport, 'octo/b', 'v1.2.3')).toBe(sha('3'));
    expect(await tagCommit(transport, 'octo/c', 'v1.2.3')).toBeUndefined();
    expect(transport.reads[0]).toBe('ls-remote https://github.com/octo/a refs/tags/v1.2.3 refs/tags/v1.2.3^{}');
  });

  it('fails the pin when the tag names another commit or does not exist', async () => {
    const transport = recordedTransport({ tags: { 'octo/a': lightweight('v1.2.3', sha('2')) }, files: { [blob('octo/a', sha('1'))]: node('') } });
    const reader = new ActionReader(transport);
    const step: ActionUse = { file: 'ci.yml', job: 'j', step: 0, uses: `octo/a@${sha('1')}`, with: {} };
    expect((await verifyPin(transport, reader, step.uses, 'v1.2.3', [step])).problems).toEqual([`octo/a@${sha('1')}: the tag v1.2.3 of octo/a is the commit ${sha('2')}, not ${sha('1')}`]);
    expect((await verifyPin(transport, reader, step.uses, 'v9.9.9', [step])).problems).toEqual([`octo/a@${sha('1')}: octo/a has no tag v9.9.9`]);
  });

  it('fails closed after three failed reads, pausing between them and naming the host', async () => {
    const transport = recordedTransport({ tags: { 'octo/a': new Error('Could not resolve host: github.com') } });
    await expect(tagCommit(transport, 'octo/a', 'v1.2.3')).rejects.toThrow(NetworkError);
    await expect(tagCommit(transport, 'octo/a', 'v1.2.3')).rejects.toThrow(/^github\.com: git ls-remote of octo\/a refs\/tags\/v1\.2\.3 failed 3 times \(last: Could not resolve host: github\.com\); the check fails closed$/);
    expect(transport.reads.filter((read) => read.startsWith('ls-remote'))).toHaveLength(6);
    expect(transport.pauses).toEqual([2_000, 5_000, 2_000, 5_000]);
    // A server error or a rate limit is retried too; a 404 is an answer.
    const urls = recordedTransport({ urls: { 'https://example.invalid/x': 503 } });
    await expect(withRetries(urls, 'example.invalid', 'GET x', () => urls.get('https://example.invalid/x'), (result) => (result.status === 503 ? 'HTTP 503' : undefined))).rejects.toThrow(/^example\.invalid: GET x failed 3 times \(last: HTTP 503\)/);
    // A commit git cannot fetch is retried, then fails closed naming github.com.
    const unfetchable = recordedTransport({ files: { [blob('octo/a', sha('1'))]: new Error('fatal: remote error: upload-pack: not our ref') } });
    await expect(new ActionReader(unfetchable).read('octo/a', '', sha('1'))).rejects.toThrow(/^github\.com: git fetch of octo\/a@1{40} for action\.yml failed 3 times \(last: fatal: remote error: upload-pack: not our ref\); the check fails closed$/);
  });
});

describe('a pin’s inputs', () => {
  const meta = parseActionMeta('octo/a@x:action.yml', node('  path: { required: true }\n  key: { required: true, default: k }\n  overwrite: { default: false }\n'));

  it('are each declared by the action, with every required input that has no default given', () => {
    expect(inputProblems(meta, { path: 'p', overwrite: true })).toEqual([]);
    expect(inputProblems(meta, { path: 'p', 'retention-day': 1 })).toEqual(['gives the input retention-day, which octo/a@x:action.yml does not declare (it declares: path, key, overwrite)']);
    expect(inputProblems(meta, {})).toEqual(['leaves out the input path, which octo/a@x:action.yml requires and gives no default']);
  });

  it('are read from action.yaml when the action has no action.yml, and fail the pin when it has neither', async () => {
    const transport = network();
    const reader = new ActionReader(transport);
    const verdict = await verifyPin(transport, reader, `octo/scan@${SCAN}`, 'v0.36.0', [use('ci.yml', { 'image-ref': 'x', 'cache-dirs': 'y' })]);
    expect(verdict.problems).toEqual([`ci.yml build step 4 (octo/scan@${SCAN}): gives the input cache-dirs, which octo/scan@${SCAN}:action.yaml does not declare (it declares: image-ref, cache, version)`]);
    const none = recordedTransport({ tags: { 'octo/gone': lightweight('v1.0.0', sha('4')) } });
    const gone: ActionUse = { file: 'ci.yml', job: 'j', step: 0, uses: `octo/gone@${sha('4')}`, with: {} };
    expect((await verifyPin(none, new ActionReader(none), gone.uses, 'v1.0.0', [gone])).problems).toEqual([`octo/gone@${sha('4')}: no action.yml or action.yaml at that commit`]);
  });
});

describe('a composite’s nested actions', () => {
  it('are followed at their pinned commits, each pinned by SHA at every depth', async () => {
    const transport = network();
    const verdict = await verifyPin(transport, new ActionReader(transport), `octo/scan@${SCAN}`, 'v0.36.0', [use('ci.yml', { 'image-ref': 'x' })]);
    expect(verdict.problems).toEqual([]);
    // The setup composite and, inside it, the checkout were read: the recursion reached the second level.
    expect(transport.reads).toContain(`git ${blob('octo/setup-scan', SETUP)}`);
    expect(transport.reads).toContain(`git ${blob('actions/checkout', CHECKOUT)}`);
  });

  it('fail on a nested tag ref, naming the chain down to it', async () => {
    const tagged = network({ setupFile: setup.replace(`actions/checkout@${CHECKOUT}`, 'actions/checkout@v6') });
    const verdict = await verifyPin(tagged, new ActionReader(tagged), `octo/scan@${SCAN}`, 'v0.36.0', [use('ci.yml', { 'image-ref': 'x' })]);
    expect(verdict.problems).toEqual([`octo/scan@${SCAN} > octo/setup-scan@${SETUP} > actions/checkout@v6: a nested action not pinned to a full commit SHA`]);
    const top = network({ scan: scanner({ setupRef: 'octo/setup-scan@main' }) });
    expect((await verifyPin(top, new ActionReader(top), `octo/scan@${SCAN}`, 'v0.36.0', [use('ci.yml', {})])).problems).toEqual([`octo/scan@${SCAN} > octo/setup-scan@main: a nested action not pinned to a full commit SHA`]);
  });
});

describe('release.yml’s nested caches', () => {
  it('are each traced through the bindings to the input that gates them, and pass when release.yml sets it false', async () => {
    const transport = network();
    const reader = new ActionReader(transport);
    const meta = await reader.read('octo/scan', '', SCAN);
    if (meta === undefined) throw new Error('fixture missing');
    const gates = await cacheGates(reader, meta, [`octo/scan@${SCAN}`]);
    expect(gates).toEqual([
      { chain: `octo/scan@${SCAN} > octo/setup-scan@${SETUP} > actions/cache/restore@${CACHE}`, input: 'cache' },
      { chain: `octo/scan@${SCAN} > octo/setup-scan@${SETUP} > actions/cache/save@${CACHE}`, input: 'cache' },
      { chain: `octo/scan@${SCAN} > actions/cache@${CACHE}`, input: 'cache' },
    ]);
    const off = await verifyPin(transport, reader, `octo/scan@${SCAN}`, 'v0.36.0', [use('release.yml', { 'image-ref': 'x', cache: false })]);
    expect(off.problems).toEqual([]);
    expect(off.notes.filter((note) => note.includes('off (release.yml sets cache: false)'))).toHaveLength(3);
  });

  it('fail when release.yml leaves the gate unset or true', async () => {
    const transport = network();
    const reader = new ActionReader(transport);
    for (const [given, shown] of [
      [{ 'image-ref': 'x' }, 'not set'],
      [{ 'image-ref': 'x', cache: true }, 'true'],
    ] as const) {
      const verdict = await verifyPin(transport, reader, `octo/scan@${SCAN}`, 'v0.36.0', [use('release.yml', given)]);
      expect(verdict.problems, shown).toHaveLength(3);
      expect(verdict.problems[2], shown).toBe(`release.yml build step 4: octo/scan@${SCAN} > actions/cache@${CACHE}: gated by the input cache, which release.yml's step must set to false (it is ${shown})`);
    }
    // Outside release.yml the caches are not this rule's: ci.yml turns them off by its own test.
    expect((await verifyPin(transport, reader, `octo/scan@${SCAN}`, 'v0.36.0', [use('ci.yml', { 'image-ref': 'x' })])).problems).toEqual([]);
  });

  it('fail on an ungated cache, a condition this check cannot read, or a binding no input of the caller turns off', async () => {
    const reader = (scan: string) => new ActionReader(network({ scan }));
    const check = async (scan: string) => {
      const r = reader(scan);
      const meta = await r.read('octo/scan', '', SCAN);
      if (meta === undefined) throw new Error('fixture missing');
      return releaseCacheProblems(await cacheGates(r, meta, ['scan']), { cache: false }).problems;
    };
    expect(await check(scanner({ cacheIf: "${{ always() }}" }))).toEqual(['scan > actions/cache@' + CACHE + ": a nested cache whose condition (${{ always() }}) is not gated by an input this check can read"]);
    expect(await check(scanner({ cacheIf: "${{ inputs.cache == 'true' || github.event_name == 'push' }}" }))).toHaveLength(1);
    expect(await check(scanner({ binding: "'true'" }))).toEqual([
      `scan > octo/setup-scan@${SETUP} > actions/cache/restore@${CACHE}: octo/setup-scan@${SETUP} sets cache to "true", which no input of the caller can turn off`,
      `scan > octo/setup-scan@${SETUP} > actions/cache/save@${CACHE}: octo/setup-scan@${SETUP} sets cache to "true", which no input of the caller can turn off`,
    ]);
    // A nested cache input left at a false default, or set false by the composite, is off whatever the caller gives.
    const unbound = scanner().replace("        cache: ${{ inputs.cache }}\n", '');
    expect(await check(unbound)).toEqual([]);
    expect(await check(scanner({ binding: 'false' }))).toEqual([]);
  });

  it('read a gate only from a conjunction that requires inputs.<name> == \'true\'', () => {
    expect(gateOf("${{ inputs.cache == 'true' }}")).toBe('cache');
    expect(gateOf("inputs.cache == 'true' && inputs.version != 'latest'")).toBe('cache');
    expect(gateOf("${{ steps.x.outputs.hit != 'true' && (inputs.save == 'true') }}")).toBe('save');
    expect(gateOf("${{ inputs.cache != 'false' }}")).toBeUndefined();
    expect(gateOf("${{ inputs.cache == 'true' || always() }}")).toBeUndefined();
    expect(gateOf("${{ !(inputs.cache == 'true') }}")).toBeUndefined();
    expect(gateOf(undefined)).toBeUndefined();
  });
});

describe('the git transport', () => {
  // A local repository stands in for github.com: the same commands, over file://, with no network.
  let scratch = '';
  beforeAll(() => {
    scratch = mkdtempSync(path.join(os.tmpdir(), 'tp-action-pins-transport-'));
  });
  afterAll(() => {
    rmSync(scratch, { recursive: true, force: true });
  });

  it('reads an action’s file at its commit with a shallow fetch, a file the commit lacks being an answer, and fails on a commit the origin does not have', async () => {
    const dir = path.join(scratch, 'octo', 'act');
    mkdirSync(path.join(dir, 'sub'), { recursive: true });
    const env = { ...process.env, HOME: scratch, GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'Synthetic', GIT_AUTHOR_EMAIL: 'synthetic@example.invalid', GIT_COMMITTER_NAME: 'Synthetic', GIT_COMMITTER_EMAIL: 'synthetic@example.invalid' };
    const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, env, encoding: 'utf8' }).trim();
    git('init', '-q', '-b', 'main');
    // GitHub serves partial and by-commit fetches; a local origin has to be told to.
    git('config', 'uploadpack.allowFilter', 'true');
    git('config', 'uploadpack.allowAnySHA1InWant', 'true');
    writeFileSync(path.join(dir, 'action.yml'), node('  token: {}\n'));
    writeFileSync(path.join(dir, 'sub', 'action.yaml'), node(''));
    git('add', '.');
    git('commit', '-q', '-m', 'first');
    const first = git('rev-parse', 'HEAD');
    writeFileSync(path.join(dir, 'action.yml'), node('  token: {}\n  later: {}\n'));
    git('commit', '-q', '-am', 'second');
    git('tag', 'v1.0.0');

    const transport = gitTransport(`file://${scratch}`);
    try {
      expect(await transport.file('octo/act', first, 'action.yml')).toBe(node('  token: {}\n'));
      expect(await transport.file('octo/act', first, 'sub/action.yml')).toBeUndefined();
      expect(await transport.file('octo/act', first, 'sub/action.yaml')).toBe(node(''));
      expect(await actionFile(transport, 'octo/act', 'sub', first)).toEqual({ name: 'sub/action.yaml', text: node('') });
      await expect(transport.file('octo/act', 'f'.repeat(40), 'action.yml')).rejects.toThrow();
      expect(await transport.lsRemote(`file://${dir}`, ['refs/tags/v1.0.0'])).toBe(`${git('rev-parse', 'HEAD')}\trefs/tags/v1.0.0\n`);
    } finally {
      transport.close();
    }
  });
});

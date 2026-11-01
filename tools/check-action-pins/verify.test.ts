import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

describe('a pin’s runtime', () => {
  it('warns when the action runs on a deprecated Node.js runtime (node20 or older), and not on node24 or a composite', async () => {
    const at = (using: string) => {
      const transport = recordedTransport({ tags: { 'octo/old': lightweight('v3.7.0', sha('3')) }, files: { [blob('octo/old', sha('3'))]: `name: n\nruns:\n  using: ${using}\n  main: x.js\n` } });
      const step: ActionUse = { file: 'release.yml', job: 'push', step: 2, uses: `octo/old@${sha('3')}`, with: {} };
      return verifyPin(transport, new ActionReader(transport), step.uses, 'v3.7.0', [step]);
    };
    for (const using of ['node20', 'node16', 'node12']) {
      const verdict = await at(using);
      expect(verdict.problems, using).toEqual([]);
      expect(verdict.warnings, using).toEqual([`octo/old@${sha('3')}: v3.7.0 runs on ${using}, a Node.js runtime GitHub has deprecated; move to a release that runs on node24`]);
    }
    for (const using of ['node24', 'node26', 'composite', 'docker']) expect((await at(using)).warnings, using).toEqual([]);
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

describe('a Docker action', () => {
  it('is refused unless its image is pinned by digest, at the top level and nested at any depth (S7)', async () => {
    const DOCKER = sha('d');
    const DIGEST = `docker://ghcr.io/octo/tool@sha256:${'4'.repeat(64)}`;
    const docker = (image: string) => `name: d\nruns:\n  using: docker\n  image: ${image}\n`;
    const at = async (image: string, nested = false) => {
      const wrapper = `name: w\nruns:\n  using: composite\n  steps:\n    - uses: octo/docker@${DOCKER}\n`;
      const transport = recordedTransport({
        tags: { 'octo/top': lightweight('v1.0.0', sha('c')) },
        files: { [blob('octo/top', sha('c'))]: nested ? wrapper : docker(image), [blob('octo/docker', DOCKER)]: docker(image) },
      });
      const step: ActionUse = { file: 'ci.yml', job: 'j', step: 0, uses: `octo/top@${sha('c')}`, with: {} };
      return (await verifyPin(transport, new ActionReader(transport), step.uses, 'v1.0.0', [step])).problems;
    };
    expect(await at('Dockerfile')).toEqual([`octo/top@${sha('c')}: a Docker action whose image is "Dockerfile", not docker://…@sha256:<64 hex>; a Dockerfile or an image by tag pulls a mutable image at run time`]);
    expect(await at('docker://ghcr.io/octo/tool:v1')).toEqual([expect.stringContaining('a Docker action whose image is "docker://ghcr.io/octo/tool:v1"')]);
    expect(await at(DIGEST)).toEqual([]);
    expect(await at('Dockerfile', true)).toEqual([`octo/top@${sha('c')} > octo/docker@${DOCKER}: a Docker action whose image is "Dockerfile", not docker://…@sha256:<64 hex>; a Dockerfile or an image by tag pulls a mutable image at run time`]);
    expect(await at(DIGEST, true)).toEqual([]);
  });

  it('is read from runs.using in any case, as the runner reads it: Docker and DOCKER refused, a Composite walked for its nested pins and caches, and Node20 warned about (SEC-S4)', async () => {
    const DOCKER = sha('d');
    const top = sha('c');
    const verdict = async (action: string, nested: string, file = 'ci.yml') => {
      const transport = recordedTransport({ tags: { 'octo/top': lightweight('v1.0.0', top) }, files: { [blob('octo/top', top)]: action, [blob('octo/docker', DOCKER)]: nested, [blob('actions/cache', CACHE)]: node('  path: {}\n  key: {}\n') } });
      const step: ActionUse = { file, job: 'j', step: 0, uses: `octo/top@${top}`, with: {} };
      return verifyPin(transport, new ActionReader(transport), step.uses, 'v1.0.0', [step]);
    };
    const docker = (using: string) => `name: d\nruns:\n  using: ${using}\n  image: Dockerfile\n`;
    const refused = (chain: string) => `${chain}: a Docker action whose image is "Dockerfile", not docker://…@sha256:<64 hex>; a Dockerfile or an image by tag pulls a mutable image at run time`;
    for (const using of ['Docker', 'DOCKER']) expect((await verdict(docker(using), '')).problems, using).toEqual([refused(`octo/top@${top}`)]);
    // A composite in any case is walked: a Docker action nested in it, and a nested tag, are refused.
    const wrapper = (using: string, uses: string) => `name: w\nruns:\n  using: ${using}\n  steps:\n    - uses: ${uses}\n`;
    expect((await verdict(wrapper('Composite', `octo/docker@${DOCKER}`), docker('docker'))).problems).toEqual([refused(`octo/top@${top} > octo/docker@${DOCKER}`)]);
    expect((await verdict(wrapper('COMPOSITE', 'actions/checkout@v6'), '')).problems).toEqual([`octo/top@${top} > actions/checkout@v6: a nested action not pinned to a full commit SHA`]);
    // And its caches are traced for release.yml.
    const cached = `name: w\nruns:\n  using: Composite\n  steps:\n    - uses: actions/cache@${CACHE}\n      with: { path: db, key: db }\n`;
    expect((await verdict(cached, '', 'release.yml')).problems).toEqual([`release.yml j step 1: octo/top@${top} > actions/cache@${CACHE}: a nested cache whose condition (none) is not gated by an input this check can read`]);
    // A deprecated Node.js runtime is one in any case.
    expect((await verdict('name: n\nruns:\n  using: Node20\n  main: x.js\n', '')).warnings).toEqual([`octo/top@${top}: v1.0.0 runs on Node20, a Node.js runtime GitHub has deprecated; move to a release that runs on node24`]);
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

  it('fail closed beyond the depth they follow, rather than reading nothing there', async () => {
    // A composite that nests itself: the chain never ends, so the check stops at its depth and says so.
    const LOOP = sha('a');
    const loop = `name: loop\nruns:\n  using: composite\n  steps:\n    - uses: octo/loop@${LOOP}\n`;
    const transport = recordedTransport({ files: { [blob('octo/loop', LOOP)]: loop } });
    const reader = new ActionReader(transport);
    const meta = await reader.read('octo/loop', '', LOOP);
    if (meta === undefined) throw new Error('fixture missing');
    const problems = releaseCacheProblems(await cacheGates(reader, meta, ['loop']), { cache: false }).problems;
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/: composites nested deeper than 8 levels, which this check does not follow; a cache there could not be seen, so the check fails closed$/);
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

  it('answers an object it cannot read as not held, never rejecting, so no read of the age fetch can crash the run (CI-N1)', async () => {
    const dir = path.join(scratch, 'octo', 'flaky');
    mkdirSync(dir, { recursive: true });
    const env = { ...process.env, HOME: scratch, GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'Synthetic', GIT_AUTHOR_EMAIL: 'synthetic@example.invalid', GIT_COMMITTER_NAME: 'Synthetic', GIT_COMMITTER_EMAIL: 'synthetic@example.invalid' };
    const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, env, encoding: 'utf8' }).trim();
    git('init', '-q', '-b', 'main');
    git('config', 'uploadpack.allowFilter', 'true');
    writeFileSync(path.join(dir, 'action.yml'), node(''));
    git('add', '.');
    git('commit', '-q', '-m', 'first');
    const first = git('rev-parse', 'HEAD');
    // A git that answers `cat-file -t` and then fails reading the commit, as one the deadline kills between the two.
    const real = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
    const bin = path.join(scratch, 'flaky-bin');
    mkdirSync(bin, { recursive: true });
    writeFileSync(path.join(bin, 'git'), `#!/bin/sh\ncase " $* " in *" cat-file commit "*) echo 'fatal: killed' >&2; exit 128;; esac\nexec '${real}' "$@"\n`, { mode: 0o755 });
    const saved = process.env.PATH;
    process.env.PATH = `${bin}${path.delimiter}${saved ?? ''}`;
    let transport: ReturnType<typeof gitTransport>;
    try {
      transport = gitTransport(`file://${scratch}`);
    } finally {
      process.env.PATH = saved;
    }
    try {
      expect((await transport.fetchRefs('octo/flaky', 'v1.0.0')).head).toBe(first);
      expect(await transport.object('octo/flaky', first)).toBeUndefined();
    } finally {
      transport.close();
    }
  });

  it('runs git without the job’s token, which no git read needs, so GITHUB_TOKEN and GH_TOKEN never reach it (SEC-N4)', async () => {
    const dir = path.join(scratch, 'octo', 'tokenless');
    mkdirSync(dir, { recursive: true });
    const env = { ...process.env, HOME: scratch, GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'Synthetic', GIT_AUTHOR_EMAIL: 'synthetic@example.invalid', GIT_COMMITTER_NAME: 'Synthetic', GIT_COMMITTER_EMAIL: 'synthetic@example.invalid' };
    const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, env, encoding: 'utf8' }).trim();
    git('init', '-q', '-b', 'main');
    git('config', 'uploadpack.allowFilter', 'true');
    writeFileSync(path.join(dir, 'action.yml'), node(''));
    git('add', '.');
    git('commit', '-q', '-m', 'first');
    git('tag', 'v1.0.0');
    const first = git('rev-parse', 'HEAD');
    // A git that records which tokens its environment holds, then runs the real one.
    const real = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
    const bin = path.join(scratch, 'recording-bin');
    const log = path.join(scratch, 'git-env.log');
    mkdirSync(bin, { recursive: true });
    writeFileSync(path.join(bin, 'git'), `#!/bin/sh\nprintf '%s %s\\n' "\${GITHUB_TOKEN-unset}" "\${GH_TOKEN-unset}" >> '${log}'\nexec '${real}' "$@"\n`, { mode: 0o755 });
    const saved = { PATH: process.env.PATH, GITHUB_TOKEN: process.env.GITHUB_TOKEN, GH_TOKEN: process.env.GH_TOKEN };
    const restore = () => {
      for (const [name, value] of Object.entries(saved)) {
        if (value === undefined) Reflect.deleteProperty(process.env, name);
        else process.env[name] = value;
      }
    };
    process.env.PATH = `${bin}${path.delimiter}${saved.PATH ?? ''}`;
    process.env.GITHUB_TOKEN = 'synthetic-token-not-a-secret';
    process.env.GH_TOKEN = 'synthetic-gh-token-not-a-secret';
    let transport: ReturnType<typeof gitTransport>;
    try {
      transport = gitTransport(`file://${scratch}`);
    } finally {
      restore();
    }
    try {
      expect(await transport.file('octo/tokenless', first, 'action.yml')).toBe(node(''));
      expect((await transport.fetchRefs('octo/tokenless', 'v1.0.0')).head).toBe(first);
      expect((await transport.object('octo/tokenless', first))?.type).toBe('commit');
    } finally {
      transport.close();
    }
    const lines = readFileSync(log, 'utf8').trim().split('\n');
    expect(lines.length).toBeGreaterThan(3);
    expect(new Set(lines)).toEqual(new Set(['unset unset']));
  });

  it('fetches the age rule’s default branch alone, with the whole history a shallow file read cuts, answers ancestry and objects, fetches a commit by SHA, and close() removes it all', async () => {
    const dir = path.join(scratch, 'octo', 'aged');
    mkdirSync(dir, { recursive: true });
    const env = { ...process.env, HOME: scratch, GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'Synthetic', GIT_AUTHOR_EMAIL: 'synthetic@example.invalid', GIT_COMMITTER_NAME: 'Synthetic', GIT_COMMITTER_EMAIL: 'synthetic@example.invalid' };
    const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, env, encoding: 'utf8' }).trim();
    git('init', '-q', '-b', 'main');
    git('config', 'uploadpack.allowFilter', 'true');
    git('config', 'uploadpack.allowAnySHA1InWant', 'true');
    const commit = (message: string) => {
      writeFileSync(path.join(dir, 'action.yml'), node(`  ${message}: {}\n`));
      git('add', '.');
      git('commit', '-q', '-m', message);
      return git('rev-parse', 'HEAD');
    };
    const first = commit('first');
    const second = commit('second');
    git('tag', '-a', '-m', 'v1.0.0', 'v1.0.0', second);
    const third = commit('third');
    git('checkout', '-q', '-b', 'side', first);
    const side = commit('side');
    git('checkout', '-q', 'main');

    const transport = gitTransport(`file://${scratch}`);
    try {
      // A shallow read of the newest commit first: its boundary must not cut the age rule's history.
      expect(await transport.file('octo/aged', third, 'action.yml')).toBe(node('  third: {}\n'));
      const refs = await transport.fetchRefs('octo/aged', 'v1.0.0');
      expect(refs).toEqual({ branch: 'main', head: third, tag: { object: git('rev-parse', 'refs/tags/v1.0.0'), commit: second } });
      expect(await transport.isAncestor('octo/aged', first, third)).toBe(true);
      expect((await transport.object('octo/aged', refs.tag?.object ?? ''))?.type).toBe('tag');
      expect((await transport.object('octo/aged', first))?.raw.toString('latin1')).toMatch(/^tree [0-9a-f]{40}\n/);
      // The default branch alone: another branch's commit is not held, and asking for it fetches nothing.
      expect(await transport.object('octo/aged', side)).toBeUndefined();
      expect((await transport.fetchRefs('octo/aged', 'v9.9.9')).tag).toBeUndefined();
      expect(await transport.fetchSha('octo/aged', side)).toBe(true);
      expect(await transport.isAncestor('octo/aged', side, third)).toBe(false);
      expect(await transport.fetchSha('octo/aged', 'f'.repeat(40))).toBe(false);
    } finally {
      transport.close();
    }
    // Both bare repositories are gone with the scratch directory.
    expect(await transport.object('octo/aged', first)).toBeUndefined();
    await expect(transport.file('octo/aged', third, 'action.yml')).rejects.toThrow();
  });
});

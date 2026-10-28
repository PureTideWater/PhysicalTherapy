import { describe, expect, it } from 'vitest';

import { type Fetch, NetworkReadError, createRegistry, packumentUrl, readJson } from './registry';

/** Synthetic sha256 digests for the Docker Hub answers below. */
const DIGEST_A = `sha256:${'a'.repeat(64)}`;
const DIGEST_B = `sha256:${'b'.repeat(64)}`;

/** A fetch that answers from a script of recorded responses (no network in unit tests), keeping every request. */
function scripted(answers: ReadonlyArray<(() => Response) | Error>): { readonly fetch: Fetch; readonly requests: { url: string; init?: RequestInit }[] } {
  const requests: { url: string; init?: RequestInit }[] = [];
  let at = 0;
  const fetchImpl: Fetch = (url, init) => {
    requests.push({ url, init });
    const answer = answers[Math.min(at, answers.length - 1)];
    at += 1;
    if (answer === undefined) {
      return Promise.reject(new Error('no answer scripted'));
    }
    return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer());
  };
  return { fetch: fetchImpl, requests };
}

const json =
  (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  () =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

describe('the registry reads', () => {
  it('fail closed after three tries with backoff, naming the host', async () => {
    const slept: number[] = [];
    const { fetch, requests } = scripted([new TypeError('fetch failed'), json({}, 503), json({}, 429)]);
    const read = readJson(fetch, 'https://registry.npmjs.org/pnpm', {}, "pnpm's registry document", { sleep: (ms) => (slept.push(ms), Promise.resolve()) });
    await expect(read).rejects.toThrow(NetworkReadError);
    await expect(readJson(scripted([new TypeError('fetch failed')]).fetch, 'https://registry.npmjs.org/pnpm', {}, 'x', { sleep: () => Promise.resolve() })).rejects.toThrow(
      'registry.npmjs.org: reading x failed after 3 tries with backoff (last: fetch failed); check-toolchain fails closed',
    );
    expect(requests).toHaveLength(3);
    expect(slept).toEqual([1000, 2000]);
  });

  it('succeed on a later try', async () => {
    const { fetch, requests } = scripted([json({}, 502), json({ ok: 1 })]);
    await expect(readJson(fetch, 'https://registry.npmjs.org/x', {}, 'x', { sleep: () => Promise.resolve() })).resolves.toEqual({ ok: 1 });
    expect(requests).toHaveLength(2);
  });

  it('fail at once on a definitive answer, still closed', async () => {
    const { fetch, requests } = scripted([json({ error: 'not found' }, 404)]);
    await expect(readJson(fetch, 'https://registry.npmjs.org/nope', {}, "nope's registry document", { sleep: () => Promise.resolve() })).rejects.toThrow(
      "registry.npmjs.org: reading nope's registry document failed (HTTP 404); check-toolchain fails closed",
    );
    expect(requests).toHaveLength(1);
  });

  it('read a document once per package, scoped names encoded', async () => {
    const document = { name: '@scope/pkg', versions: { '1.0.0': {}, '1.1.0': {} }, time: { created: '2020-01-01T00:00:00.000Z', '1.0.0': '2020-01-01T00:00:00.000Z', '1.1.0': '2026-10-25T00:00:00.000Z' } };
    const { fetch, requests } = scripted([json(document)]);
    const registry = createRegistry(fetch, { sleep: () => Promise.resolve() });
    const [first, second] = await Promise.all([registry.packument('@scope/pkg'), registry.packument('@scope/pkg')]);
    expect(first).toEqual({
      name: '@scope/pkg',
      versions: ['1.0.0', '1.1.0'],
      time: document.time,
      facts: { '1.0.0': { integrity: null, evidence: null, dependencies: {} }, '1.1.0': { integrity: null, evidence: null, dependencies: {} } },
    });
    expect(second).toBe(first);
    expect(requests.map((request) => request.url)).toEqual(['https://registry.npmjs.org/@scope%2Fpkg']);
    expect(packumentUrl('plain')).toBe('https://registry.npmjs.org/plain');
  });

  it('keep each version’s integrity, trust evidence and declared dependencies', async () => {
    const document = {
      name: 'pkg',
      versions: {
        '1.0.0': { dist: { integrity: 'sha512-one' }, dependencies: { a: '^1.0.0' } },
        '1.1.0': { dist: { integrity: 'sha512-two', attestations: { url: 'https://registry.npmjs.org/-/npm/v1/attestations/pkg@1.1.0', provenance: { predicateType: 'https://slsa.dev/provenance/v1' } } }, optionalDependencies: { b: '2.0.0' } },
        '1.2.0': { dist: { integrity: 'sha512-three', attestations: { provenance: {} } }, _npmUser: { name: 'GitHub Actions', trustedPublisher: { id: 'github' } }, dependencies: { a: '^1.1.0' }, optionalDependencies: { b: '2.1.0' } },
        '1.3.0': { dist: { attestations: { url: 'x' } }, _npmUser: { name: 'someone' } },
      },
      time: { '1.0.0': '2020-01-01T00:00:00.000Z', '1.1.0': '2021-01-01T00:00:00.000Z', '1.2.0': '2022-01-01T00:00:00.000Z', '1.3.0': '2023-01-01T00:00:00.000Z' },
    };
    const registry = createRegistry(scripted([json(document)]).fetch, { sleep: () => Promise.resolve() });
    expect((await registry.packument('pkg')).facts).toEqual({
      '1.0.0': { integrity: 'sha512-one', evidence: null, dependencies: { a: '^1.0.0' } },
      '1.1.0': { integrity: 'sha512-two', evidence: 'provenance', dependencies: { b: '2.0.0' } },
      '1.2.0': { integrity: 'sha512-three', evidence: 'trustedPublisher', dependencies: { a: '^1.1.0', b: '2.1.0' } },
      '1.3.0': { integrity: null, evidence: null, dependencies: {} },
    });
  });

  it('refuse a document that is not one', async () => {
    const registry = createRegistry(scripted([json({ unexpected: true })]).fetch, { sleep: () => Promise.resolve() });
    await expect(registry.packument('x')).rejects.toThrow("registry.npmjs.org: x's registry document is not one");
    // A publish time that is not an instant would read as NaN, under which every version is old enough: refused.
    const untimed = createRegistry(scripted([json({ name: 'y', versions: { '1.0.0': {} }, time: { '1.0.0': 'yesterday' } })]).fetch, { sleep: () => Promise.resolve() });
    await expect(untimed.packument('y')).rejects.toThrow("registry.npmjs.org: y's registry document is not one (not an instant)");
  });

  it('wait out a rate limit for as long as it asks, never more than 60 s, in place of the backoff', async () => {
    const now = Date.parse('2026-10-26T00:00:00.000Z');
    const waits = async (answer: () => Response) => {
      const slept: number[] = [];
      const { fetch, requests } = scripted([answer, json({ ok: 1 })]);
      await expect(readJson(fetch, 'https://hub.docker.com/v2/x', {}, 'x', { now: () => now, sleep: (ms) => (slept.push(ms), Promise.resolve()) })).resolves.toEqual({ ok: 1 });
      expect(requests).toHaveLength(2);
      return slept;
    };
    expect(await waits(json({}, 429, { 'retry-after': '30' }))).toEqual([30_000]);
    expect(await waits(json({}, 429, { 'retry-after': new Date(now + 12_000).toUTCString() }))).toEqual([12_000]);
    // Docker Hub's reset is in epoch seconds; 90 s ahead is waited for 60.
    expect(await waits(json({}, 429, { 'x-ratelimit-reset': String((now + 90_000) / 1000) }))).toEqual([60_000]);
    expect(await waits(json({}, 403, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String((now + 10_000) / 1000) }))).toEqual([10_000]);
    expect(await waits(json({}, 403, { 'retry-after': '5' }))).toEqual([5_000]);
    // A rate limit that names no time keeps the backoff; a 403 that is no rate limit is the answer, at once.
    expect(await waits(json({}, 429))).toEqual([1_000]);
    const { fetch, requests } = scripted([json({}, 403)]);
    await expect(readJson(fetch, 'https://hub.docker.com/v2/x', {}, 'x', { sleep: () => Promise.resolve() })).rejects.toThrow('hub.docker.com: reading x failed (HTTP 403); check-toolchain fails closed');
    expect(requests).toHaveLength(1);
  });

  it('read a Docker Hub tag, a 404 the answer "no such tag", and a page of a repository’s tags', async () => {
    const tag = {
      name: '24-slim',
      digest: DIGEST_A,
      tag_last_pushed: '2026-10-21T17:39:11.31083Z',
      last_updated: '2026-10-21T17:39:11.31083Z',
      images: [{ architecture: 'amd64', digest: DIGEST_B, last_pushed: '2026-10-21T14:41:25.621024424Z' }],
      tag_status: 'active',
    };
    const read = scripted([json(tag), json({ message: "httperror 404: tag '9' not found" }, 404), json({ count: 101, next: 'https://hub.docker.com/v2/repositories/synthetic/node/tags?page=2', results: [tag] }), json({ message: 'not found' }, 404)]);
    const registry = createRegistry(read.fetch, { sleep: () => Promise.resolve() });
    const parsed = { name: '24-slim', digest: DIGEST_A, tag_last_pushed: '2026-10-21T17:39:11.31083Z', last_updated: '2026-10-21T17:39:11.31083Z', images: [{ digest: DIGEST_B, last_pushed: '2026-10-21T14:41:25.621024424Z' }] };
    expect(await registry.hubTag('synthetic/node', '24-slim')).toEqual(parsed);
    expect(await registry.hubTag('synthetic/node', '9')).toBeNull();
    expect(await registry.hubTags('synthetic/node', 1)).toEqual({ tags: [parsed], next: true });
    expect(await registry.hubTags('synthetic/gone', 1)).toEqual({ tags: [], next: false });
    expect(read.requests.map((request) => request.url)).toEqual([
      'https://hub.docker.com/v2/repositories/synthetic/node/tags/24-slim',
      'https://hub.docker.com/v2/repositories/synthetic/node/tags/9',
      'https://hub.docker.com/v2/repositories/synthetic/node/tags?page_size=100&ordering=last_updated&page=1',
      'https://hub.docker.com/v2/repositories/synthetic/gone/tags?page_size=100&ordering=last_updated&page=1',
    ]);
    // A time that is not an instant fails closed rather than read as no time.
    const garbled = createRegistry(scripted([json({ ...tag, tag_last_pushed: 'soon' })]).fetch, { sleep: () => Promise.resolve() });
    await expect(garbled.hubTag('synthetic/node', '24-slim')).rejects.toThrow("hub.docker.com: synthetic/node:24-slim's Docker Hub tag is not one (tag_last_pushed: not an instant); check-toolchain fails closed");
  });

  it('stop a try and a pause when the caller’s signal ends, and give a Docker Hub try 30 s and npm’s 60 s', async () => {
    // Each try's own timer, recorded, never firing here.
    const timers: number[] = [];
    const timeoutSignal = (ms: number) => (timers.push(ms), new AbortController().signal);
    const ok = scripted([json({ ok: 1 })]);
    await readJson(ok.fetch, 'https://hub.docker.com/v2/x', {}, 'x', { timeoutSignal });
    await readJson(ok.fetch, 'https://registry.npmjs.org/x', {}, 'x', { timeoutSignal });
    expect(timers).toEqual([30_000, 60_000]);
    // Mid-try: the fetch is handed a signal that ends with the caller's, and the read stops at once, untried again.
    const deadline = new AbortController();
    let tries = 0;
    const hanging: Fetch = (_, init) => {
      tries += 1;
      return new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
    };
    setTimeout(() => deadline.abort(), 10);
    await expect(readJson(hanging, 'https://hub.docker.com/v2/x', {}, 'x', { signal: deadline.signal, timeoutSignal })).rejects.toThrow('hub.docker.com: reading x stopped at the deadline after 1 try; check-toolchain fails closed');
    expect(tries).toBe(1);
    // Mid-pause: the default pause ends with the signal, long before its 60 s.
    const pausing = new AbortController();
    const unavailable = scripted([json({}, 503)]);
    setTimeout(() => pausing.abort(), 10);
    const started = Date.now();
    await expect(readJson(unavailable.fetch, 'https://hub.docker.com/v2/x', {}, 'x', { signal: pausing.signal, backoffMs: () => 60_000 })).rejects.toThrow('hub.docker.com: reading x stopped at the deadline after 1 try; check-toolchain fails closed');
    expect(Date.now() - started).toBeLessThan(10_000);
    expect(unavailable.requests).toHaveLength(1);
  });

  it('ask the bulk endpoint for the named versions', async () => {
    const advisory = { id: 1, url: 'https://github.com/advisories/GHSA-2222-3333-4444', title: 'synthetic', severity: 'high', vulnerable_versions: '<10.34.5', cwe: [] };
    const { fetch, requests } = scripted([json({ pnpm: [advisory] })]);
    const registry = createRegistry(fetch, { sleep: () => Promise.resolve() });
    expect(await registry.advisories({ pnpm: ['10.28.0'] })).toEqual({ pnpm: [advisory] });
    expect(requests[0]?.url).toBe('https://registry.npmjs.org/-/npm/v1/security/advisories/bulk');
    expect(requests[0]?.init?.method).toBe('POST');
    expect(requests[0]?.init?.body).toBe('{"pnpm":["10.28.0"]}');
  });
});

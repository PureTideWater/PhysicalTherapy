import { describe, expect, it } from 'vitest';

import { type Fetch, NetworkReadError, createRegistry, packumentUrl, readJson } from './registry';

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

const json = (body: unknown, status = 200) => () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

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
    expect(first).toEqual({ name: '@scope/pkg', versions: ['1.0.0', '1.1.0'], time: document.time });
    expect(second).toBe(first);
    expect(requests.map((request) => request.url)).toEqual(['https://registry.npmjs.org/@scope%2Fpkg']);
    expect(packumentUrl('plain')).toBe('https://registry.npmjs.org/plain');
  });

  it('refuse a document that is not one', async () => {
    const registry = createRegistry(scripted([json({ unexpected: true })]).fetch, { sleep: () => Promise.resolve() });
    await expect(registry.packument('x')).rejects.toThrow("registry.npmjs.org: x's registry document is not one");
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

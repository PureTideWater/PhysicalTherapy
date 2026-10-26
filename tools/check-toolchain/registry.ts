import { z } from 'zod';

/**
 * check-toolchain's networked reads: npm's registry documents (each version's publish time) and its bulk advisory
 * endpoint. Every read fails closed: a transient failure (no answer, a timeout, HTTP 408, 429 or 5xx) is tried three
 * times with backoff, and any read that does not succeed throws a NetworkReadError naming the host, which the check
 * reports as a failure. A rate limit or an outage can never pass a version the check could not see.
 */

export const REGISTRY = 'https://registry.npmjs.org';

/** A package's versions and their publish times (`time[version]`, an ISO instant), from its full registry document. */
export interface Packument {
  readonly name: string;
  readonly versions: readonly string[];
  readonly time: Readonly<Record<string, string>>;
}

/** One advisory as the bulk endpoint returns it. */
export interface Advisory {
  readonly id: number | string;
  readonly url: string;
  readonly title: string;
  readonly severity: string;
  readonly vulnerable_versions: string;
}

export interface Registry {
  /** The registry document of one package (cached per name within a run). */
  packument(name: string): Promise<Packument>;
  /** The advisories that affect the named versions, by package. */
  advisories(packages: Readonly<Record<string, readonly string[]>>): Promise<Readonly<Record<string, readonly Advisory[]>>>;
}

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export interface ReadOptions {
  /** Tries per read (3). */
  readonly tries?: number;
  /** The wait before try n + 1, in milliseconds (1 s, then 2 s). */
  readonly backoffMs?: (attempt: number) => number;
  readonly sleep?: (ms: number) => Promise<void>;
  /** Each try's timeout (60 s; next's registry document is about 31 MB, 2.4 MB compressed). */
  readonly timeoutMs?: number;
}

export class NetworkReadError extends Error {
  override readonly name = 'NetworkReadError';
}

/** Tried again: no answer, a timeout, or HTTP 408, 429 or 5xx. Anything else is the registry's answer. */
function transient(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

/** One JSON read, tried up to `tries` times with backoff; throws a NetworkReadError naming the host. */
export async function readJson(fetchImpl: Fetch, url: string, init: RequestInit, what: string, options: ReadOptions = {}): Promise<unknown> {
  const host = new URL(url).host;
  const tries = options.tries ?? 3;
  const backoff = options.backoffMs ?? ((attempt: number) => 1000 * 2 ** (attempt - 1));
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let last = 'no answer';
  for (let attempt = 1; attempt <= tries; attempt += 1) {
    try {
      const response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(options.timeoutMs ?? 60_000) });
      if (response.ok) {
        return await response.json();
      }
      last = `HTTP ${String(response.status)}`;
      if (!transient(response.status)) {
        throw new NetworkReadError(`${host}: reading ${what} failed (${last}); check-toolchain fails closed`);
      }
    } catch (error) {
      if (error instanceof NetworkReadError) {
        throw error;
      }
      last = error instanceof Error ? error.message : String(error);
    }
    if (attempt < tries) {
      await sleep(backoff(attempt));
    }
  }
  throw new NetworkReadError(`${host}: reading ${what} failed after ${String(tries)} tries with backoff (last: ${last}); check-toolchain fails closed`);
}

const packumentSchema = z.looseObject({
  name: z.string(),
  versions: z.record(z.string(), z.unknown()).optional(),
  time: z.record(z.string(), z.string()).optional(),
});

const advisorySchema = z.looseObject({
  id: z.union([z.number(), z.string()]),
  url: z.string(),
  title: z.string(),
  severity: z.string(),
  vulnerable_versions: z.string(),
});
const bulkSchema = z.record(z.string(), z.array(advisorySchema));

/** A registry document's URL: a scoped name's slash is encoded, as the registry expects. */
export function packumentUrl(name: string, registry = REGISTRY): string {
  return `${registry}/${name.replace('/', '%2F')}`;
}

/** The registry over HTTP (fetch decompresses gzip itself), with each package's document read once per run. */
export function createRegistry(fetchImpl: Fetch = fetch, options: ReadOptions = {}, registry = REGISTRY): Registry {
  const cache = new Map<string, Promise<Packument>>();
  return {
    packument(name) {
      let read = cache.get(name);
      if (read === undefined) {
        read = (async () => {
          const raw = await readJson(fetchImpl, packumentUrl(name, registry), { headers: { accept: 'application/json' } }, `${name}'s registry document`, options);
          const parsed = packumentSchema.safeParse(raw);
          if (!parsed.success) {
            throw new NetworkReadError(`${new URL(registry).host}: ${name}'s registry document is not one (${parsed.error.issues[0]?.message ?? 'unreadable'}); check-toolchain fails closed`);
          }
          return { name: parsed.data.name, versions: Object.keys(parsed.data.versions ?? {}), time: parsed.data.time ?? {} };
        })();
        cache.set(name, read);
      }
      return read;
    },
    async advisories(packages) {
      const raw = await readJson(
        fetchImpl,
        `${registry}/-/npm/v1/security/advisories/bulk`,
        { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(packages) },
        'the bulk advisory endpoint',
        options,
      );
      const parsed = bulkSchema.safeParse(raw);
      if (!parsed.success) {
        throw new NetworkReadError(`${new URL(registry).host}: the bulk advisory endpoint's answer is unreadable; check-toolchain fails closed`);
      }
      return parsed.data;
    },
  };
}

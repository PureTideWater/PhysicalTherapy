import { z } from 'zod';

/**
 * check-toolchain's networked reads: npm's registry documents (each version's publish time) and its bulk advisory
 * endpoint, and Docker Hub's tags (each image digest's push time; docs/adr/0066, Part 5). Every read fails closed: a
 * transient failure (no answer, a timeout, HTTP 408, 429 or 5xx) is tried three times with backoff, a rate limit's
 * answer waited out for as long as it asks (at most 60 s), and any read that does not succeed throws a NetworkReadError
 * naming the host, which the check reports as a failure. A rate limit or an outage can never pass a version or a digest
 * the check could not see, and every time a document gives must be an instant, or the document is refused.
 */

export const REGISTRY = 'https://registry.npmjs.org';
/** Docker Hub's API, where the image rule reads each tag's push time. */
export const HUB = 'https://hub.docker.com';

/** A version's trust evidence as pnpm's trustPolicy ranks it: a trusted publisher over provenance over none. */
export type TrustEvidence = 'trustedPublisher' | 'provenance';

/** What check-toolchain keeps of one version's manifest in the registry document. */
export interface VersionFacts {
  /** `dist.integrity`, the Subresource Integrity string a lockfile entry must equal (null: the registry gives none). */
  readonly integrity: string | null;
  /** As pnpm 10.34.8 reads it: `_npmUser.trustedPublisher`, else `dist.attestations.provenance`, else none. */
  readonly evidence: TrustEvidence | null;
  /** The declared `dependencies` and `optionalDependencies`, name to range. */
  readonly dependencies: Readonly<Record<string, string>>;
}

/** A package's versions, their publish times (`time[version]`, an ISO instant) and facts, from its full registry document. */
export interface Packument {
  readonly name: string;
  readonly versions: readonly string[];
  readonly time: Readonly<Record<string, string>>;
  readonly facts: Readonly<Record<string, VersionFacts>>;
}

/** One advisory as the bulk endpoint returns it. */
export interface Advisory {
  readonly id: number | string;
  readonly url: string;
  readonly title: string;
  readonly severity: string;
  readonly vulnerable_versions: string;
}

/** One platform's image under a Docker Hub tag (a manifest of the tag's index). */
export interface HubImage {
  readonly digest: string | null;
  readonly last_pushed: string | null;
}

/** A Docker Hub tag as `/v2/repositories/<repository>/tags/<tag>` gives it, the times instants or null. */
export interface HubTag {
  readonly name: string;
  /** The digest the tag names now (an index's, for a multi-platform image). */
  readonly digest: string | null;
  readonly tag_last_pushed: string | null;
  readonly last_updated: string | null;
  readonly images: readonly HubImage[];
}

/** One page of a repository's tags, most recently updated first, and whether another follows. */
export interface HubTagPage {
  readonly tags: readonly HubTag[];
  readonly next: boolean;
}

export interface Registry {
  /** The registry document of one package (cached per name within a run). */
  packument(name: string): Promise<Packument>;
  /** The advisories that affect the named versions, by package. */
  advisories(packages: Readonly<Record<string, readonly string[]>>): Promise<Readonly<Record<string, readonly Advisory[]>>>;
  /** Docker Hub's tag of a repository (`library/<name>` for an official image); null when Hub has no such tag (HTTP 404). */
  hubTag(repository: string, tag: string, signal?: AbortSignal): Promise<HubTag | null>;
  /** One page (from 1) of a repository's tags, 100 to a page, most recently updated first; none when Hub has no such repository. */
  hubTags(repository: string, page: number, signal?: AbortSignal): Promise<HubTagPage>;
}

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export interface ReadOptions {
  /** Tries per read (3). */
  readonly tries?: number;
  /** The wait before try n + 1, in milliseconds (1 s, then 2 s), unless a rate limit's answer asks for another. */
  readonly backoffMs?: (attempt: number) => number;
  /** A pause between tries; it ends early when `signal` ends, and the read then stops. */
  readonly sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  /** Each try's timeout, for every host (by default Docker Hub's 30 s and npm's 60 s: next's registry document is about 31 MB, 2.4 MB compressed). */
  readonly timeoutMs?: number;
  /** Each try's own timer, AbortSignal.timeout by default. */
  readonly timeoutSignal?: (ms: number) => AbortSignal;
  /** The caller's deadline: it ends a try or a pause, and the read fails closed at once. */
  readonly signal?: AbortSignal;
  /** The clock a rate limit's reset is read against (Date.now). */
  readonly now?: () => number;
}

export class NetworkReadError extends Error {
  override readonly name = 'NetworkReadError';
}

/** Tried again: no answer, a timeout, or HTTP 408, 429 or 5xx. Anything else is the registry's answer. */
function transient(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

/** The longest a rate limit's answer is waited out before the next try. */
export const RATE_LIMIT_WAIT_CAP_MS = 60_000;

/** Each try's timeout by host (S5); any other host's is 60 s. */
const TRY_TIMEOUT_MS: Readonly<Record<string, number>> = { 'hub.docker.com': 30_000, 'registry.npmjs.org': 60_000 };
const DEFAULT_TRY_TIMEOUT_MS = 60_000;

/**
 * A rate limit's answer, and how long it asks to be waited out: a 429, or a 403 that carries `Retry-After` or
 * `x-ratelimit-remaining: 0`. The wait runs to `Retry-After` (seconds, or an HTTP date), else to `x-ratelimit-reset`
 * (epoch seconds), capped at RATE_LIMIT_WAIT_CAP_MS; undefined when neither can be read. Null for any other answer.
 */
function rateLimit(response: Response, now: number): { readonly waitMs: number | undefined } | null {
  const header = (name: string) => response.headers.get(name)?.trim();
  const retryAfter = header('retry-after');
  const limited = response.status === 429 || (response.status === 403 && (retryAfter !== undefined || header('x-ratelimit-remaining') === '0'));
  if (!limited) {
    return null;
  }
  const reset = header('x-ratelimit-reset');
  const fromRetryAfter = retryAfter === undefined ? Number.NaN : /^\d+$/.test(retryAfter) ? now + Number(retryAfter) * 1000 : Date.parse(retryAfter);
  const fromReset = reset !== undefined && /^\d+$/.test(reset) ? Number(reset) * 1000 : Number.NaN;
  const until = Number.isNaN(fromRetryAfter) ? fromReset : fromRetryAfter;
  return { waitMs: Number.isNaN(until) ? undefined : Math.min(Math.max(until - now, 0), RATE_LIMIT_WAIT_CAP_MS) };
}

/** A pause that ends early, without an error, when the signal ends; the read then stops at its next try. */
function pause(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal?.aborted === true) {
      resolve();
      return;
    }
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal?.addEventListener('abort', done, { once: true });
  });
}

/** What a read gives for HTTP 404 when its caller takes that as an answer ("no such tag"), not a failure. */
export const MISSING: unique symbol = Symbol('missing');

/**
 * One JSON read, tried up to `tries` times with backoff; throws a NetworkReadError naming the host. A 404 is a failure
 * unless `missing` is 'answer', when it gives MISSING. The caller's `signal` ends the read at once, mid-try or mid-pause.
 */
export async function readJson(fetchImpl: Fetch, url: string, init: RequestInit, what: string, options: ReadOptions = {}, missing: 'fail' | 'answer' = 'fail'): Promise<unknown> {
  const host = new URL(url).host;
  const tries = options.tries ?? 3;
  const backoff = options.backoffMs ?? ((attempt: number) => 1000 * 2 ** (attempt - 1));
  const sleep = options.sleep ?? pause;
  const timeoutMs = options.timeoutMs ?? TRY_TIMEOUT_MS[host] ?? DEFAULT_TRY_TIMEOUT_MS;
  const timeout = options.timeoutSignal ?? ((ms: number) => AbortSignal.timeout(ms));
  const now = options.now ?? Date.now;
  const { signal } = options;
  // A call, not a property read, so that the check after an await is not narrowed by the one before it.
  const ended = () => signal?.aborted === true;
  const stopped = (done: number) => new NetworkReadError(`${host}: reading ${what} stopped at the deadline after ${String(done)} ${done === 1 ? 'try' : 'tries'}; check-toolchain fails closed`);
  let last = 'no answer';
  for (let attempt = 1; attempt <= tries; attempt += 1) {
    if (ended()) {
      throw stopped(attempt - 1);
    }
    let wait = backoff(attempt);
    try {
      const own = timeout(timeoutMs);
      const response = await fetchImpl(url, { ...init, signal: signal === undefined ? own : AbortSignal.any([signal, own]) });
      if (response.ok) {
        return await response.json();
      }
      if (response.status === 404 && missing === 'answer') {
        return MISSING;
      }
      last = `HTTP ${String(response.status)}`;
      const limit = rateLimit(response, now());
      if (limit !== null) {
        wait = limit.waitMs ?? wait;
      } else if (!transient(response.status)) {
        throw new NetworkReadError(`${host}: reading ${what} failed (${last}); check-toolchain fails closed`);
      }
    } catch (error) {
      if (error instanceof NetworkReadError) {
        throw error;
      }
      if (ended()) {
        throw stopped(attempt);
      }
      last = error instanceof Error ? error.message : String(error);
    }
    if (attempt < tries) {
      await sleep(wait, signal);
    }
  }
  throw new NetworkReadError(`${host}: reading ${what} failed after ${String(tries)} tries with backoff (last: ${last}); check-toolchain fails closed`);
}

/**
 * A time a document gives: text that parses to an instant. A time that does not would read as NaN, and every age
 * comparison with NaN is false, so a young version or digest would pass; the document is refused instead.
 */
const instantText = z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'not an instant');

const packumentSchema = z.looseObject({
  name: z.string(),
  versions: z.record(z.string(), z.unknown()).optional(),
  time: z.record(z.string(), instantText).optional(),
});

const hubTime = instantText.nullable().optional();
const hubTagSchema = z.looseObject({
  name: z.string(),
  digest: z.string().nullable().optional(),
  tag_last_pushed: hubTime,
  last_updated: hubTime,
  images: z.array(z.looseObject({ digest: z.string().nullable().optional(), last_pushed: hubTime })).nullable().optional(),
});
const hubTagsSchema = z.looseObject({ next: z.string().nullable().optional(), results: z.array(hubTagSchema) });

function hubTagOf(parsed: z.infer<typeof hubTagSchema>): HubTag {
  return {
    name: parsed.name,
    digest: parsed.digest ?? null,
    tag_last_pushed: parsed.tag_last_pushed ?? null,
    last_updated: parsed.last_updated ?? null,
    images: (parsed.images ?? []).map((image) => ({ digest: image.digest ?? null, last_pushed: image.last_pushed ?? null })),
  };
}

/** Docker Hub lists a repository's tags 100 to a page at most. */
export const HUB_PAGE_SIZE = 100;

const rangesSchema = z.record(z.string(), z.string()).catch({});
const manifestSchema = z
  .looseObject({
    dist: z
      .looseObject({ integrity: z.string().optional().catch(undefined), attestations: z.looseObject({ provenance: z.unknown() }).optional().catch(undefined) })
      .optional()
      .catch(undefined),
    _npmUser: z.looseObject({ trustedPublisher: z.unknown() }).optional().catch(undefined),
    dependencies: rangesSchema.optional(),
    optionalDependencies: rangesSchema.optional(),
  })
  .catch({});

/** One version's facts; the evidence is read exactly as pnpm's trust check reads it (getTrustEvidence). */
export function versionFacts(manifest: unknown): VersionFacts {
  const parsed = manifestSchema.parse(manifest ?? {});
  const truthy = (value: unknown) => value !== undefined && value !== null && value !== false && value !== '' && value !== 0;
  const evidence: TrustEvidence | null = truthy(parsed._npmUser?.trustedPublisher) ? 'trustedPublisher' : truthy(parsed.dist?.attestations?.provenance) ? 'provenance' : null;
  return { integrity: parsed.dist?.integrity ?? null, evidence, dependencies: { ...parsed.dependencies, ...parsed.optionalDependencies } };
}

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

/** The registry and Docker Hub over HTTP (fetch decompresses gzip itself), with each package's document read once per run. */
export function createRegistry(fetchImpl: Fetch = fetch, options: ReadOptions = {}, registry = REGISTRY, hub = HUB): Registry {
  const cache = new Map<string, Promise<Packument>>();
  const hubHost = new URL(hub).host;
  const hubRead = async <T>(url: string, what: string, schema: z.ZodType<T>, signal: AbortSignal | undefined): Promise<T | typeof MISSING> => {
    const raw = await readJson(fetchImpl, url, { headers: { accept: 'application/json' } }, what, signal === undefined ? options : { ...options, signal }, 'answer');
    if (raw === MISSING) {
      return MISSING;
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new NetworkReadError(`${hubHost}: ${what} is not one (${issue === undefined ? 'unreadable' : `${issue.path.join('.')}: ${issue.message}`}); check-toolchain fails closed`);
    }
    return parsed.data;
  };
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
          const manifests = parsed.data.versions ?? {};
          return {
            name: parsed.data.name,
            versions: Object.keys(manifests),
            time: parsed.data.time ?? {},
            facts: Object.fromEntries(Object.entries(manifests).map(([version, manifest]) => [version, versionFacts(manifest)])),
          };
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
    async hubTag(repository, tag, signal) {
      const read = await hubRead(`${hub}/v2/repositories/${repository}/tags/${encodeURIComponent(tag)}`, `${repository}:${tag}'s Docker Hub tag`, hubTagSchema, signal);
      return read === MISSING ? null : hubTagOf(read);
    },
    async hubTags(repository, page, signal) {
      const url = `${hub}/v2/repositories/${repository}/tags?page_size=${String(HUB_PAGE_SIZE)}&ordering=last_updated&page=${String(page)}`;
      const read = await hubRead(url, `${repository}'s Docker Hub tags (page ${String(page)})`, hubTagsSchema, signal);
      return read === MISSING ? { tags: [], next: false } : { tags: read.results.map(hubTagOf), next: typeof read.next === 'string' && read.next !== '' };
    },
  };
}

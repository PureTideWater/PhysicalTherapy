import type { Answer, GitObject, Headers, Transport } from './network';

/**
 * A recorded network for the checker's tests: synthetic `git ls-remote` lines per repository, synthetic action files per
 * repository, commit and path, synthetic HTTPS answers per URL (with their headers, and a sequence for a read tried
 * again), and the age rule's git reads per repository (its default branch, tags, objects and ancestry), every network
 * read logged with the headers it sent, the reads in flight counted, and the pauses between tries recorded instead of
 * slept. No real repository's data: the owners and SHAs below are made up, and the signed objects are make.sh's
 * synthetic ones (testdata/age).
 */
export interface Recorded extends Transport {
  readonly reads: string[];
  readonly pauses: number[];
  /** Each GET's URL and the request headers it sent. */
  readonly requests: { readonly url: string; readonly headers: Headers }[];
  /** The most reads that were in flight at once. */
  readonly peak: () => number;
}

/** An HTTPS answer as a test writes it: the status, and optionally a body and response headers. */
export interface RecordedAnswer {
  readonly status: number;
  readonly body?: string;
  readonly headers?: Headers;
}

/**
 * An upstream repository as the age rule reads it: the default branch and its commit, the tags (each its own object
 * and the commit it names), the objects the fetch of the branch and the tags holds, the objects github.com serves only
 * by SHA (held once fetched), and each held commit's ancestors. By default the default branch's commit has every held
 * object as an ancestor and any other commit only itself. An object given as an Error is held, but every read of it
 * rejects with that Error, as a git the deadline kills does.
 */
export interface RecordedRepository {
  readonly branch?: string;
  readonly head?: string;
  readonly tags?: Readonly<Record<string, { readonly object: string; readonly commit: string }>>;
  readonly objects?: Readonly<Record<string, string | Buffer | Error>>;
  readonly bySha?: Readonly<Record<string, string | Buffer | Error>>;
  readonly ancestors?: Readonly<Record<string, readonly string[]>>;
}

/** An answer that never comes: the read hangs until its signal aborts, as a git a deadline kills. */
export const HANG = Symbol('hang');

export function recordedTransport(options: {
  /** owner/repo → the lines ls-remote prints, an Error to throw on every try, or HANG. */
  readonly tags?: Readonly<Record<string, string | Error | typeof HANG>>;
  /** blob(repo, commit, file) → the file's text, or an Error to throw on every try; any other file is absent. */
  readonly files?: Readonly<Record<string, string | Error>>;
  /**
   * URL → the body of a 200, a number to answer with that status, an answer, or a sequence of answers given in turn (the
   * last one repeated); any other URL is a 404.
   */
  readonly urls?: Readonly<Record<string, string | number | RecordedAnswer | readonly RecordedAnswer[] | Error | typeof HANG>>;
  /** owner/repo → the repository the age rule fetches, an Error to throw on every try, or HANG. */
  readonly git?: Readonly<Record<string, RecordedRepository | Error | typeof HANG>>;
  /** How long a read takes, in real milliseconds (0: at once). */
  readonly latency?: number;
}): Recorded {
  const reads: string[] = [];
  const pauses: number[] = [];
  const requests: { url: string; headers: Headers }[] = [];
  const served = new Set<string>();
  const turns = new Map<string, number>();
  let inFlight = 0;
  let peak = 0;
  const answer = async <T>(read: string, value: () => T | Error | typeof HANG, signal?: AbortSignal): Promise<T> => {
    reads.push(read);
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    try {
      const found = value();
      if (found === HANG) {
        await new Promise((_, reject) => {
          if (signal?.aborted === true) reject(new Error('killed'));
          signal?.addEventListener('abort', () => reject(new Error('killed')), { once: true });
        });
      }
      if ((options.latency ?? 0) > 0) await new Promise((resolve) => setTimeout(resolve, options.latency));
      if (found instanceof Error) throw found;
      return found as T;
    } finally {
      inFlight -= 1;
    }
  };
  const repository = (repo: string): RecordedRepository | undefined => {
    const found = options.git?.[repo];
    return found === undefined || found instanceof Error || found === HANG ? undefined : found;
  };
  const held = (repo: string, sha: string): string | Buffer | Error | undefined => {
    const found = repository(repo);
    return found?.objects?.[sha] ?? (served.has(`${repo}@${sha}`) ? found?.bySha?.[sha] : undefined);
  };
  return {
    reads,
    pauses,
    requests,
    peak: () => peak,
    lsRemote(url, refs, signal) {
      const repo = url.replace('https://github.com/', '');
      return answer(`ls-remote ${url} ${refs.join(' ')}`, () => options.tags?.[repo] ?? '', signal);
    },
    file(repo, commit, file, signal) {
      const key = blob(repo, commit, file);
      return answer<string | undefined>(`git ${key}`, () => options.files?.[key], signal);
    },
    get(url, signal, headers) {
      requests.push({ url, headers: { ...headers } });
      return answer<Answer>(
        `GET ${url}`,
        () => {
          const found = options.urls?.[url];
          if (found === undefined) return { status: 404, text: '{"message":"not found"}', headers: {} };
          if (found instanceof Error || found === HANG) return found;
          if (typeof found === 'number') return { status: found, text: '', headers: {} };
          if (typeof found === 'string') return { status: 200, text: found, headers: {} };
          let given: RecordedAnswer;
          if (Array.isArray(found)) {
            const turn = turns.get(url) ?? 0;
            turns.set(url, turn + 1);
            given = (found as readonly RecordedAnswer[])[Math.min(turn, found.length - 1)] as RecordedAnswer;
          } else {
            given = found as RecordedAnswer;
          }
          return { status: given.status, text: given.body ?? '', headers: Object.fromEntries(Object.entries(given.headers ?? {}).map(([name, value]) => [name.toLowerCase(), value])) };
        },
        signal,
      );
    },
    sleep(ms, signal) {
      pauses.push(ms);
      return signal?.aborted === true ? Promise.reject(new Error('stopped')) : Promise.resolve();
    },
    fetchRefs(repo, version, signal) {
      return answer(
        `fetchRefs ${repo} ${version}`,
        () => {
          const found = options.git?.[repo];
          if (found === undefined) return new Error(`fatal: repository 'https://github.com/${repo}/' not found`);
          if (found instanceof Error || found === HANG) return found;
          return { branch: found.branch ?? 'main', head: found.head, tag: found.tags?.[version] };
        },
        signal,
      );
    },
    object(repo, sha) {
      const raw = held(repo, sha);
      if (raw === undefined) return Promise.resolve(undefined);
      if (raw instanceof Error) return Promise.reject(raw);
      const bytes = typeof raw === 'string' ? Buffer.from(raw, 'latin1') : raw;
      return Promise.resolve<GitObject>({ type: bytes.subarray(0, 7).toString('latin1') === 'object ' ? 'tag' : 'commit', raw: bytes });
    },
    isAncestor(repo, ancestor, descendant) {
      const found = repository(repo);
      const killed = [held(repo, ancestor), held(repo, descendant)].find((raw) => raw instanceof Error);
      if (killed instanceof Error) return Promise.reject(killed);
      if (held(repo, ancestor) === undefined || held(repo, descendant) === undefined) return Promise.reject(new Error(`fatal: Not a valid commit name ${held(repo, ancestor) === undefined ? ancestor : descendant}`));
      const ancestors = found?.ancestors?.[descendant] ?? (descendant === found?.head ? Object.keys(found.objects ?? {}) : []);
      return Promise.resolve(ancestor === descendant || ancestors.includes(ancestor));
    },
    fetchSha(repo, sha, signal) {
      return answer(
        `fetchSha ${repo} ${sha}`,
        () => {
          const found = repository(repo);
          const known = found?.objects?.[sha] !== undefined || found?.bySha?.[sha] !== undefined;
          if (known) served.add(`${repo}@${sha}`);
          return known;
        },
        signal,
      );
    },
  };
}

/** A made-up 40-hex commit from a short seed. */
export const sha = (seed: string): string => seed.repeat(40).slice(0, 40);

/** The key of a file of a repository at a commit, as the recorded transport reads it. */
export const blob = (repo: string, commit: string, file = 'action.yml'): string => `${repo}@${commit}:${file}`;

/** ls-remote's lines for a lightweight tag. */
export const lightweight = (version: string, commit: string): string => `${commit}\trefs/tags/${version}\n`;

/** ls-remote's lines for an annotated tag: its own object, then the commit it peels to. */
export const annotated = (version: string, object: string, commit: string): string => `${object}\trefs/tags/${version}\n${commit}\trefs/tags/${version}^{}\n`;

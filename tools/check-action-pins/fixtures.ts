import type { Transport } from './network';

/**
 * A recorded network for the checker's tests: synthetic `git ls-remote` lines per repository, synthetic action files per
 * repository, commit and path, and synthetic HTTPS answers per URL, every read logged, the reads in flight counted, and
 * the pauses between tries recorded instead of slept. No real repository's data: the owners and SHAs below are made up.
 */
export interface Recorded extends Transport {
  readonly reads: string[];
  readonly pauses: number[];
  /** The most reads that were in flight at once. */
  readonly peak: () => number;
}

/** An answer that never comes: the read hangs until its signal aborts, as a git a deadline kills. */
export const HANG = Symbol('hang');

export function recordedTransport(options: {
  /** owner/repo → the lines ls-remote prints, an Error to throw on every try, or HANG. */
  readonly tags?: Readonly<Record<string, string | Error | typeof HANG>>;
  /** blob(repo, commit, file) → the file's text, or an Error to throw on every try; any other file is absent. */
  readonly files?: Readonly<Record<string, string | Error>>;
  /** URL → the body of a 200, or a number to answer with that status; any other URL is a 404. */
  readonly urls?: Readonly<Record<string, string | number>>;
  /** How long a read takes, in real milliseconds (0: at once). */
  readonly latency?: number;
}): Recorded {
  const reads: string[] = [];
  const pauses: number[] = [];
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
  return {
    reads,
    pauses,
    peak: () => peak,
    lsRemote(url, refs, signal) {
      const repo = url.replace('https://github.com/', '');
      return answer(`ls-remote ${url} ${refs.join(' ')}`, () => options.tags?.[repo] ?? '', signal);
    },
    file(repo, commit, file, signal) {
      const key = blob(repo, commit, file);
      return answer<string | undefined>(`git ${key}`, () => options.files?.[key], signal);
    },
    get(url, signal) {
      return answer(
        `GET ${url}`,
        () => {
          const found = options.urls?.[url];
          if (typeof found === 'number') return { status: found, text: '' };
          return found === undefined ? { status: 404, text: '{"message":"not found"}' } : { status: 200, text: found };
        },
        signal,
      );
    },
    sleep(ms, signal) {
      pauses.push(ms);
      return signal?.aborted === true ? Promise.reject(new Error('stopped')) : Promise.resolve();
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

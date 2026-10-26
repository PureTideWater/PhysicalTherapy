import type { Transport } from './network';

/**
 * A recorded network for the checker's tests: synthetic `git ls-remote` lines per repository and synthetic action
 * files per URL, every read logged, and the pauses between tries recorded instead of slept. No real repository's
 * data: the owners and SHAs below are made up.
 */
export interface Recorded extends Transport {
  readonly reads: string[];
  readonly pauses: number[];
}

export function recordedTransport(options: {
  /** owner/repo → the lines ls-remote prints, or an Error to throw on every try. */
  readonly tags?: Readonly<Record<string, string | Error>>;
  /** URL → the file's text; any other URL is a 404. A value of a number answers with that status. */
  readonly files?: Readonly<Record<string, string | number>>;
}): Recorded {
  const reads: string[] = [];
  const pauses: number[] = [];
  return {
    reads,
    pauses,
    lsRemote(url, refs) {
      reads.push(`ls-remote ${url} ${refs.join(' ')}`);
      const repo = url.replace('https://github.com/', '');
      const answer = options.tags?.[repo];
      if (answer instanceof Error) return Promise.reject(answer);
      return Promise.resolve(answer ?? '');
    },
    get(url) {
      reads.push(`GET ${url}`);
      const answer = options.files?.[url];
      if (typeof answer === 'number') return Promise.resolve({ status: answer, text: '' });
      return Promise.resolve(answer === undefined ? { status: 404, text: '404: Not Found' } : { status: 200, text: answer });
    },
    sleep(ms) {
      pauses.push(ms);
      return Promise.resolve();
    },
  };
}

/** A made-up 40-hex commit from a short seed. */
export const sha = (seed: string): string => seed.repeat(40).slice(0, 40);

/** The raw URL of an action's metadata file at a commit. */
export const raw = (repo: string, commit: string, file = 'action.yml'): string => `https://raw.githubusercontent.com/${repo}/${commit}/${file}`;

/** ls-remote's lines for a lightweight tag. */
export const lightweight = (version: string, commit: string): string => `${commit}\trefs/tags/${version}\n`;

/** ls-remote's lines for an annotated tag: its own object, then the commit it peels to. */
export const annotated = (version: string, object: string, commit: string): string => `${object}\trefs/tags/${version}\n${commit}\trefs/tags/${version}^{}\n`;

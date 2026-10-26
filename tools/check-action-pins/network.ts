import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

/**
 * The two reads the networked checks make, behind one interface so the tests can record them: the tags of an action's
 * repository (git ls-remote against github.com) and a file of the repository at a commit (raw.githubusercontent.com).
 * Every read is tried three times with a growing pause, and then fails closed, naming the host.
 */

export interface Transport {
  /** The lines `git ls-remote <url> <refs…>` prints. Rejects when git fails. */
  lsRemote(url: string, refs: readonly string[]): Promise<string>;
  /** A GET of the URL: its status and body. Rejects on a network failure. */
  get(url: string): Promise<{ status: number; text: string }>;
  sleep(ms: number): Promise<void>;
}

const run = promisify(execFile);

/** The real transport: git for the tags, fetch for the files, each with a 30-second limit. */
export const liveTransport: Transport = {
  async lsRemote(url, refs) {
    const { stdout } = await run('git', ['ls-remote', url, ...refs], { timeout: 30_000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
    return stdout;
  },
  async get(url) {
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000), redirect: 'follow' });
    return { status: response.status, text: await response.text() };
  },
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export const TRIES = 3;
/** The pause before the second and the third try. */
export const BACKOFF_MS = [2_000, 5_000] as const;

/** A read that failed every try; its message names the host. */
export class NetworkError extends Error {
  constructor(
    readonly host: string,
    message: string,
  ) {
    super(message);
    this.name = 'NetworkError';
  }
}

const reason = (error: unknown) => (error instanceof Error ? error.message.split('\n')[0] : String(error));

/**
 * Tries a read up to three times, pausing between tries, and throws a NetworkError naming the host after the third
 * failure. A result `retry` refuses (a server error or a rate limit) counts as a failure.
 */
export async function withRetries<T>(transport: Transport, host: string, what: string, read: () => Promise<T>, retry: (result: T) => string | undefined = () => undefined): Promise<T> {
  let last = '';
  for (let attempt = 0; attempt < TRIES; attempt++) {
    if (attempt > 0) await transport.sleep(BACKOFF_MS[attempt - 1] ?? 5_000);
    try {
      const result = await read();
      const refused = retry(result);
      if (refused === undefined) return result;
      last = refused;
    } catch (error) {
      last = reason(error) ?? 'unknown error';
    }
  }
  throw new NetworkError(host, `${host}: ${what} failed ${String(TRIES)} times (last: ${last}); the check fails closed`);
}

/**
 * The commit a release tag of a repository names: the peeled commit of an annotated tag, else the tag's own object.
 * Undefined when the repository has no such tag.
 */
export async function tagCommit(transport: Transport, repo: string, version: string): Promise<string | undefined> {
  const ref = `refs/tags/${version}`;
  const listed = await withRetries(transport, 'github.com', `git ls-remote of ${repo} ${ref}`, () => transport.lsRemote(`https://github.com/${repo}`, [ref, `${ref}^{}`]));
  const refs = new Map(
    listed
      .split('\n')
      .map((line) => line.trim().split(/\s+/))
      .filter((fields): fields is [string, string] => fields.length === 2)
      .map(([sha, name]) => [name, sha] as const),
  );
  return refs.get(`${ref}^{}`) ?? refs.get(ref);
}

/**
 * The text of an action's metadata file (action.yml, else action.yaml) at a commit, or undefined when it has neither.
 * A 404 is an answer; any other status but 200 is retried and then fails closed.
 */
export async function actionFile(transport: Transport, repo: string, path: string, sha: string): Promise<{ name: string; text: string } | undefined> {
  for (const name of ['action.yml', 'action.yaml']) {
    const file = path === '' ? name : `${path}/${name}`;
    const url = `https://raw.githubusercontent.com/${repo}/${sha}/${file}`;
    const response = await withRetries(
      transport,
      'raw.githubusercontent.com',
      `GET ${url}`,
      () => transport.get(url),
      (result) => (result.status === 200 || result.status === 404 ? undefined : `HTTP ${String(result.status)}`),
    );
    if (response.status === 200) return { name: file, text: response.text };
  }
  return undefined;
}

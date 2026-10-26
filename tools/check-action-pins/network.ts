import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

/**
 * The reads the networked checks make, behind one interface so the tests can record them: the tags of an action's
 * repository (git ls-remote), a file of the repository at a commit (git again, over the same host), and a JSON document
 * over HTTPS (Docker Hub's tags of the BuildKit image). Every read is tried three times with a growing pause, and then
 * fails closed, naming the host.
 *
 * An action's files are read with git, not from raw.githubusercontent.com (the ci-infra review's N5): git over
 * github.com is the host the tags are already read from, so the check depends on one host rather than two, and GitHub's
 * git service does not apply the unauthenticated per-address rate limit of raw.githubusercontent.com, which a shared
 * runner's address can exhaust (a 403 or 429 that a longer pause outlasts only sometimes). The fetch is shallow and
 * takes no file contents (--depth=1 --filter=blob:none): the tree at the commit, then only the blob read, fetched on
 * demand from the promisor remote.
 */

export interface Transport {
  /** The lines `git ls-remote <url> <refs…>` prints. Rejects when git fails. */
  lsRemote(url: string, refs: readonly string[], signal?: AbortSignal): Promise<string>;
  /**
   * A file of a GitHub repository at a commit: its text, or undefined when the commit has no such file. Rejects when
   * the commit cannot be fetched.
   */
  file(repo: string, commit: string, file: string, signal?: AbortSignal): Promise<string | undefined>;
  /** A GET of the URL: its status and body. Rejects on a network failure. */
  get(url: string, signal?: AbortSignal): Promise<{ status: number; text: string }>;
  /** Waits, or rejects as soon as the signal aborts. */
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
}

const run = promisify(execFile);

/** One git command's limit, and one HTTPS read's. */
const READ_TIMEOUT_MS = 30_000;

/**
 * A transport over git and fetch, reading repositories from `origin` (https://github.com for the checks; a local
 * directory in the tests). Each repository gets one bare repository of its own under a scratch directory, which
 * `close` removes, and each of its commits is fetched once.
 */
export function gitTransport(origin = 'https://github.com'): Transport & { close(): void } {
  let scratch: string | undefined;
  const repositories = new Map<string, Promise<string>>();
  const commits = new Map<string, Promise<string>>();
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: os.devNull };
  const git = async (args: readonly string[], signal?: AbortSignal) => (await run('git', [...args], { timeout: READ_TIMEOUT_MS, env, signal, maxBuffer: 16 * 1024 * 1024 })).stdout;

  /** The bare repository of a repository, made once, with its origin a promisor of the blobs a fetch leaves out. */
  const bare = (repo: string): Promise<string> => {
    let found = repositories.get(repo);
    if (found === undefined) {
      found = (async () => {
        scratch ??= mkdtempSync(path.join(os.tmpdir(), 'tp-action-pins-git-'));
        const dir = path.join(scratch, repo.replace('/', '__'));
        await git(['init', '--quiet', '--bare', dir]);
        await git(['-C', dir, 'remote', 'add', 'origin', `${origin}/${repo}`]);
        await git(['-C', dir, 'config', 'remote.origin.promisor', 'true']);
        await git(['-C', dir, 'config', 'remote.origin.partialclonefilter', 'blob:none']);
        return dir;
      })();
      repositories.set(repo, found);
    }
    return found;
  };

  /** The bare repository with the commit's tree fetched, shallow and without its files' contents. */
  const fetched = (repo: string, commit: string, signal?: AbortSignal): Promise<string> => {
    const key = `${repo}@${commit}`;
    let found = commits.get(key);
    if (found === undefined) {
      found = bare(repo).then(async (dir) => {
        await git(['-C', dir, 'fetch', '--quiet', '--no-tags', '--depth=1', '--filter=blob:none', 'origin', commit], signal);
        return dir;
      });
      // A failed fetch is tried again by the next read, not remembered.
      found.catch(() => commits.delete(key));
      commits.set(key, found);
    }
    return found;
  };

  return {
    lsRemote: (url, refs, signal) => git(['ls-remote', url, ...refs], signal),
    async file(repo, commit, file, signal) {
      const dir = await fetched(repo, commit, signal);
      const listed = await git(['-C', dir, 'ls-tree', '--name-only', commit, '--', file], signal);
      if (listed.trim() === '') return undefined;
      return git(['-C', dir, 'cat-file', 'blob', `${commit}:${file}`], signal);
    },
    async get(url, signal) {
      const limit = AbortSignal.timeout(READ_TIMEOUT_MS);
      const response = await fetch(url, { signal: signal === undefined ? limit : AbortSignal.any([signal, limit]), redirect: 'follow' });
      return { status: response.status, text: await response.text() };
    },
    sleep: (ms, signal) =>
      new Promise((resolve, reject) => {
        const stopped = () => new Error('stopped: the deadline passed');
        if (signal?.aborted === true) {
          reject(stopped());
          return;
        }
        const timer = setTimeout(resolve, ms);
        signal?.addEventListener(
          'abort',
          () => {
            clearTimeout(timer);
            reject(stopped());
          },
          { once: true },
        );
      }),
    close() {
      if (scratch !== undefined) rmSync(scratch, { recursive: true, force: true });
    },
  };
}

export const TRIES = 3;
/** The pause before the second and the third try. */
export const BACKOFF_MS = [2_000, 5_000] as const;

/** A read that failed every try, or was stopped by a deadline; its message names the host. */
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
 * failure. A result `retry` refuses (a server error or a rate limit) counts as a failure. A signal that aborts stops
 * it at once, as a failure.
 */
export async function withRetries<T>(
  transport: Transport,
  host: string,
  what: string,
  read: () => Promise<T>,
  retry: (result: T) => string | undefined = () => undefined,
  signal?: AbortSignal,
): Promise<T> {
  let last = '';
  const stopped = () => new NetworkError(host, `${host}: ${what} stopped by the deadline (last: ${last || 'no try finished'})`);
  for (let attempt = 0; attempt < TRIES; attempt++) {
    if (signal?.aborted === true) throw stopped();
    if (attempt > 0) {
      try {
        await transport.sleep(BACKOFF_MS[attempt - 1] ?? 5_000, signal);
      } catch {
        throw stopped();
      }
    }
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
export async function tagCommit(transport: Transport, repo: string, version: string, signal?: AbortSignal): Promise<string | undefined> {
  const ref = `refs/tags/${version}`;
  const listed = await withRetries(transport, 'github.com', `git ls-remote of ${repo} ${ref}`, () => transport.lsRemote(`https://github.com/${repo}`, [ref, `${ref}^{}`], signal), undefined, signal);
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
 * A file the commit does not have is an answer; a commit that cannot be fetched is retried and then fails closed.
 */
export async function actionFile(transport: Transport, repo: string, dir: string, sha: string, signal?: AbortSignal): Promise<{ name: string; text: string } | undefined> {
  for (const name of ['action.yml', 'action.yaml']) {
    const file = dir === '' ? name : `${dir}/${name}`;
    const text = await withRetries(transport, 'github.com', `git fetch of ${repo}@${sha} for ${file}`, () => transport.file(repo, sha, file, signal), undefined, signal);
    if (text !== undefined) return { name: file, text };
  }
  return undefined;
}

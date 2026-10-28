import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

/**
 * The reads the networked checks make, behind one interface so the tests can record them: the tags of an action's
 * repository (git ls-remote), a file of the repository at a commit (git again, over the same host), a JSON document over
 * HTTPS (Docker Hub's tags of the BuildKit image; GitHub's API for the age rule, with request headers), and the age
 * rule's git reads (docs/adr/0066, Part 5): an upstream's default branch and a release tag, fetched without trees into
 * a bare repository of their own, then read for objects and ancestry. Every read is tried three times with a growing
 * pause, or the wait a rate limit names, and then fails closed, naming the host.
 *
 * An action's files are read with git, not from raw.githubusercontent.com (the ci-infra review's N5): git over
 * github.com is the host the tags are already read from, so the check depends on one host rather than two, and GitHub's
 * git service does not apply the unauthenticated per-address rate limit of raw.githubusercontent.com, which a shared
 * runner's address can exhaust (a 403 or 429 that a longer pause outlasts only sometimes). The fetch is shallow and
 * takes no file contents (--depth=1 --filter=blob:none): the tree at the commit, then only the blob read, fetched on
 * demand from the promisor remote.
 */

/** Response headers, by lower-case name. */
export type Headers = Readonly<Record<string, string>>;

/** An HTTPS answer: its status, body and headers. */
export interface Answer {
  readonly status: number;
  readonly text: string;
  readonly headers: Headers;
}

/** What `fetchRefs` lists and fetches of an upstream repository. */
export interface Refs {
  /** The default branch HEAD names, or undefined when the repository lists none. */
  readonly branch: string | undefined;
  /** The default branch's commit, as fetched. */
  readonly head: string | undefined;
  /** The release tag's own object and the commit it peels to (one SHA for a lightweight tag), or undefined: no such tag. */
  readonly tag: { readonly object: string; readonly commit: string } | undefined;
}

/** A git object the age fetch holds: its type and its exact bytes. */
export interface GitObject {
  readonly type: string;
  readonly raw: Buffer;
}

export interface Transport {
  /** The lines `git ls-remote <url> <refs…>` prints. Rejects when git fails. */
  lsRemote(url: string, refs: readonly string[], signal?: AbortSignal): Promise<string>;
  /**
   * A file of a GitHub repository at a commit: its text, or undefined when the commit has no such file. Rejects when
   * the commit cannot be fetched.
   */
  file(repo: string, commit: string, file: string, signal?: AbortSignal): Promise<string | undefined>;
  /**
   * A GET of the URL with these request headers: its status, body and headers. A read that sends an Authorization
   * header never follows a redirect: the 3xx is the answer, so the token goes to the URL's own origin alone. Rejects on
   * a network failure.
   */
  get(url: string, signal?: AbortSignal, headers?: Headers): Promise<Answer>;
  /** Waits, or rejects as soon as the signal aborts. */
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
  /**
   * The age rule's read of an upstream (docs/adr/0066, Part 5): one `git ls-remote --symref` of HEAD and the release
   * tag, so a tag the upstream lacks is an answer rather than a failed fetch, then one fetch without trees of the
   * default branch alone and, when listed, the tag, into a bare repository of the repository's own. Rejects when git
   * fails.
   */
  fetchRefs(repo: string, version: string, signal?: AbortSignal): Promise<Refs>;
  /** An object the age fetch holds, or undefined when it does not hold it or cannot read it (never fetched on demand; never rejects). */
  object(repo: string, sha: string, signal?: AbortSignal): Promise<GitObject | undefined>;
  /** Whether `ancestor` is `descendant` or one of its ancestors, in the age fetch's history. Rejects when either is not held. */
  isAncestor(repo: string, ancestor: string, descendant: string, signal?: AbortSignal): Promise<boolean>;
  /**
   * Fetches one commit by its SHA into the age fetch: true when github.com serves it, false when it refuses it as no
   * object it has. Rejects on any other failure.
   */
  fetchSha(repo: string, sha: string, signal?: AbortSignal): Promise<boolean>;
}

const run = promisify(execFile);

/** One git command's limit, and one HTTPS read's. */
const READ_TIMEOUT_MS = 30_000;

/** A git that refused to fetch a commit because the remote has no such object, not because it could not be reached. */
const NOT_SERVED = /not our ref|unadvertised object|couldn't find remote ref|no such remote ref|not a valid object/i;

/**
 * A transport over git and fetch, reading repositories from `origin` (https://github.com for the checks; a local
 * directory in the tests). Each repository gets one bare repository of its own under a scratch directory, which
 * `close` removes, and each of its commits is fetched once. The age rule's fetches go into a second bare repository per
 * repository, never into the shallow first one, whose shallow boundary would cut the history an ancestry walk reads.
 */
export function gitTransport(origin = 'https://github.com'): Transport & { close(): void } {
  let scratch: string | undefined;
  const repositories = new Map<string, Promise<string>>();
  const commits = new Map<string, Promise<string>>();
  const ages = new Map<string, Promise<string>>();
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: os.devNull };
  const git = async (args: readonly string[], signal?: AbortSignal) => (await run('git', [...args], { timeout: READ_TIMEOUT_MS, env, signal, maxBuffer: 16 * 1024 * 1024 })).stdout;
  const gitBytes = async (args: readonly string[], signal?: AbortSignal) =>
    (await run('git', [...args], { timeout: READ_TIMEOUT_MS, env, signal, maxBuffer: 64 * 1024 * 1024, encoding: 'buffer' })).stdout;

  /** The age rule's bare repository of a repository, made once. */
  const ageRepository = (repo: string): Promise<string> => {
    let found = ages.get(repo);
    if (found === undefined) {
      found = (async () => {
        scratch ??= mkdtempSync(path.join(os.tmpdir(), 'tp-action-pins-git-'));
        const dir = path.join(scratch, 'age', repo.replace('/', '__'));
        await git(['init', '--quiet', '--bare', dir]);
        await git(['-C', dir, 'config', 'gc.auto', '0']);
        return dir;
      })();
      ages.set(repo, found);
    }
    return found;
  };

  /**
   * A fetch without trees (commits and tags only) into the age repository. git records the URL as a promisor of the
   * objects the filter leaves out and would then fetch any object a read asks for; the record is removed, so a read of
   * an object the fetch does not hold answers "not held" and the network is read only here.
   */
  const fetchInto = async (dir: string, url: string, wants: readonly string[], signal?: AbortSignal): Promise<void> => {
    try {
      await git(['-C', dir, 'fetch', '--quiet', '--no-tags', '--no-write-fetch-head', '--filter=tree:0', url, ...wants], signal);
    } finally {
      await git(['-C', dir, 'config', '--unset-all', `remote.${url}.promisor`]).catch(() => undefined);
      await git(['-C', dir, 'config', '--unset-all', `remote.${url}.partialclonefilter`]).catch(() => undefined);
    }
  };

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
    async get(url, signal, headers) {
      const limit = AbortSignal.timeout(READ_TIMEOUT_MS);
      const authorized = Object.keys(headers ?? {}).some((name) => name.toLowerCase() === 'authorization');
      const response = await fetch(url, { signal: signal === undefined ? limit : AbortSignal.any([signal, limit]), redirect: authorized ? 'manual' : 'follow', headers: { ...headers } });
      const answered: Record<string, string> = {};
      response.headers.forEach((value, name) => {
        answered[name.toLowerCase()] = value;
      });
      return { status: response.status, text: await response.text(), headers: answered };
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
    async fetchRefs(repo, version, signal) {
      const url = `${origin}/${repo}`;
      const tag = `refs/tags/${version}`;
      const listed = await git(['ls-remote', '--symref', url, 'HEAD', tag, `${tag}^{}`], signal);
      let branch: string | undefined;
      const names = new Map<string, string>();
      for (const line of listed.split('\n')) {
        const symref = /^ref: refs\/heads\/(\S+)\tHEAD$/.exec(line.trim());
        if (symref !== null) {
          branch = symref[1];
          continue;
        }
        const [sha, name] = line.trim().split(/\s+/);
        if (sha !== undefined && name !== undefined && /^[0-9a-f]{40}$/.test(sha)) names.set(name, sha);
      }
      const object = names.get(tag);
      const commit = names.get(`${tag}^{}`) ?? object;
      const found = object === undefined || commit === undefined ? undefined : { object, commit };
      if (branch === undefined) return { branch, head: undefined, tag: found };
      const dir = await ageRepository(repo);
      await fetchInto(dir, url, [`+refs/heads/${branch}:refs/heads/${branch}`, ...(found === undefined ? [] : [`+${tag}:${tag}`])], signal);
      const head = (await git(['-C', dir, 'rev-parse', '--verify', '--quiet', `refs/heads/${branch}^{commit}`], signal)).trim();
      return { branch, head: head === '' ? undefined : head, tag: found };
    },
    async object(repo, sha, signal) {
      // Any failure reads as "not held", the deadline's included, so no caller's read of an object can throw (the
      // ci-infra review's N1): a caller that needs the object fails closed on its absence.
      try {
        const dir = await ageRepository(repo);
        const type = (await git(['-C', dir, 'cat-file', '-t', sha], signal)).trim();
        return { type, raw: await gitBytes(['-C', dir, 'cat-file', type, sha], signal) };
      } catch {
        return undefined;
      }
    },
    async isAncestor(repo, ancestor, descendant, signal) {
      const dir = await ageRepository(repo);
      try {
        await git(['-C', dir, 'merge-base', '--is-ancestor', ancestor, descendant], signal);
        return true;
      } catch (error) {
        // Status 1 is git's "no"; anything else (an object not held, a killed git) is a failure.
        if ((error as { code?: unknown }).code === 1) return false;
        throw error;
      }
    },
    async fetchSha(repo, sha, signal) {
      const dir = await ageRepository(repo);
      try {
        await fetchInto(dir, `${origin}/${repo}`, [sha], signal);
        return true;
      } catch (error) {
        const said = (error as { stderr?: unknown }).stderr;
        if (typeof said === 'string' && NOT_SERVED.test(said)) return false;
        throw error;
      }
    },
    close() {
      if (scratch !== undefined) rmSync(scratch, { recursive: true, force: true });
    },
  };
}

export const TRIES = 3;
/** The pause before the second and the third try. */
export const BACKOFF_MS = [2_000, 5_000] as const;
/** The longest wait a rate limit's answer can ask for before the next try (C12). */
export const RATE_LIMIT_CAP_MS = 60_000;

/**
 * The wait a rate-limited answer names, capped at RATE_LIMIT_CAP_MS: a 429, or a 403 with `Retry-After` or
 * `x-ratelimit-remaining: 0`, waits for `Retry-After` (seconds, or an HTTP date) or else until `x-ratelimit-reset`
 * (epoch seconds). Undefined for any other answer, or one that names no wait (the backoff applies).
 */
export function rateLimitWait(answer: Answer, nowMs: number): number | undefined {
  const retryAfter = answer.headers['retry-after'];
  const limited = answer.status === 429 || (answer.status === 403 && (retryAfter !== undefined || answer.headers['x-ratelimit-remaining'] === '0'));
  if (!limited) return undefined;
  let wait: number | undefined;
  if (retryAfter !== undefined) {
    const seconds = /^\d+$/.test(retryAfter.trim()) ? Number.parseInt(retryAfter, 10) * 1000 : Date.parse(retryAfter) - nowMs;
    if (Number.isFinite(seconds)) wait = seconds;
  }
  const reset = answer.headers['x-ratelimit-reset'];
  if (wait === undefined && reset !== undefined && /^\d+$/.test(reset.trim())) wait = Number.parseInt(reset, 10) * 1000 - nowMs;
  return wait === undefined ? undefined : Math.min(RATE_LIMIT_CAP_MS, Math.max(0, wait));
}

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

/** Runs each task with at most `limit` in flight, starting none after the signal aborts. */
export async function pool<T>(items: readonly T[], limit: number, signal: AbortSignal, task: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length && !signal.aborted) {
      const item = items[next] as T;
      next += 1;
      await task(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

const reason = (error: unknown) => (error instanceof Error ? error.message.split('\n')[0] : String(error));

/**
 * Tries a read up to three times, pausing between tries, and throws a NetworkError naming the host after the third
 * failure. A result `retry` refuses (a server error or a rate limit) counts as a failure; when `pause` reads a wait from
 * it (a rate limit's), the next try waits that long, capped at RATE_LIMIT_CAP_MS, in place of the backoff. A signal that
 * aborts stops it at once, as a failure, a pause included.
 */
export async function withRetries<T>(
  transport: Transport,
  host: string,
  what: string,
  read: () => Promise<T>,
  retry: (result: T) => string | undefined = () => undefined,
  signal?: AbortSignal,
  pause: (result: T) => number | undefined = () => undefined,
): Promise<T> {
  let last = '';
  let wait: number | undefined;
  const stopped = () => new NetworkError(host, `${host}: ${what} stopped by the deadline (last: ${last || 'no try finished'})`);
  for (let attempt = 0; attempt < TRIES; attempt++) {
    if (signal?.aborted === true) throw stopped();
    if (attempt > 0) {
      try {
        await transport.sleep(wait === undefined ? (BACKOFF_MS[attempt - 1] ?? 5_000) : Math.min(RATE_LIMIT_CAP_MS, wait), signal);
      } catch {
        throw stopped();
      }
    }
    wait = undefined;
    try {
      const result = await read();
      const refused = retry(result);
      if (refused === undefined) return result;
      last = refused;
      wait = pause(result);
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

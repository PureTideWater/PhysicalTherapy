import pg from 'pg';

import type { ScopePool } from './authz/scope';

/**
 * Connections for code outside this package (the worker's operator path, the restore drill), so
 * the driver and its settings live in one place.
 */
export type DatabasePool = pg.Pool;
export type DatabaseClient = pg.Client;
export type DatabasePoolClient = pg.PoolClient;

/**
 * How long a request waits for a pool's connection before it fails (docs/adr/0055): a starved pool answers
 * with an error, never a request that hangs, and the health check that touches the database fails with it.
 */
export const CONNECTION_TIMEOUT_MS = 10_000;

/** How long an idle connection stays open in a pool. */
export const IDLE_TIMEOUT_MS = 30_000;

/**
 * The pools openPool opened, each with the connect it had when it was opened (combined audit item 120's review, P12):
 * module-private, so only openPool adds to it. A caller that must read through a real pool (the contract screen's
 * practice check, docs/adr/0070 Part 3) asks openedPool, which tells such a pool from an object of the same shape and
 * hands back that connect, never one assigned to the pool afterwards.
 */
const opened = new WeakMap<object, ScopePool<DatabasePoolClient>>();

/**
 * pg's lock_timeout for a pool's connections, as the pool's own setting: sent with each connection's startup
 * parameters, so every lock wait of every statement on every connection is bounded by it (each wait, not the statement
 * or the request: a statement that takes two locks may wait twice). Nothing when no timeout is asked for (a job may
 * wait). The web's request pools and its queue producer set it (docs/adr/0092, the amendment of 2026-11-11).
 *
 * pg lets a URL's query replace the pool's own settings, so a URL that names lock_timeout, or sets it through its
 * `options`, would silently undo this one: it is refused, in words that never hold the URL. A URL's `options` for
 * anything else stays (a login's role, infra/lib/launch.ts): pg sends both.
 */
export function lockTimeoutParameter(url: string, lockTimeoutMs: number | undefined): { readonly lock_timeout?: number } {
  if (lockTimeoutMs === undefined) {
    return {};
  }
  let query: URLSearchParams;
  try {
    query = new URL(url).searchParams;
  } catch {
    // Never the parser's own error, which holds the URL and its password.
    throw new Error('the database URL could not be read to check that it sets no lock_timeout');
  }
  if (query.has('lock_timeout') || (query.get('options') ?? '').includes('lock_timeout')) {
    throw new Error('the database URL sets lock_timeout itself, which would replace the pool’s own: take it out of the URL');
  }
  return { lock_timeout: lockTimeoutMs };
}

export function openPool(url: string, max = 4, options: { readonly connectionTimeoutMillis?: number; readonly lockTimeoutMs?: number } = {}): DatabasePool {
  const pool = new pg.Pool({
    connectionString: url,
    max,
    connectionTimeoutMillis: options.connectionTimeoutMillis ?? CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis: IDLE_TIMEOUT_MS,
    ...lockTimeoutParameter(url, options.lockTimeoutMs),
  });
  // Bound now: the connect pg's Pool has as this pool opens, whatever is assigned to the pool later.
  const connect = pool.connect.bind(pool) as () => Promise<DatabasePoolClient>;
  opened.set(pool, Object.freeze({ connect: () => connect() }));
  return pool;
}

/**
 * The connection source of a pool openPool opened, or undefined for anything else (a stub, a wrapper, or a pg Pool
 * built another way): its connect as openPool found it, so reassigning the pool's own connect changes nothing read
 * through this. What it proves is that the pool is a real one of this package's; not which database it reaches, nor
 * that the pool's own state, which pg's connect reads (its Client, its options, its idle clients), is as openPool left
 * it: code in the process that rewrites those is, as code that rewrites a built-in is, beyond what a module can stop
 * (docs/adr/0070 Part 3, "The guards' reach").
 */
export function openedPool(pool: unknown): ScopePool<DatabasePoolClient> | undefined {
  return typeof pool === 'object' && pool !== null ? opened.get(pool) : undefined;
}

/** A client that is not yet connected; call connect() and end(). */
export function databaseClient(url: string): DatabaseClient {
  return new pg.Client({ connectionString: url });
}

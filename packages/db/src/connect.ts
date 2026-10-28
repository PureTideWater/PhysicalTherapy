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

export function openPool(url: string, max = 4, options: { readonly connectionTimeoutMillis?: number } = {}): DatabasePool {
  const pool = new pg.Pool({ connectionString: url, max, connectionTimeoutMillis: options.connectionTimeoutMillis ?? CONNECTION_TIMEOUT_MS, idleTimeoutMillis: IDLE_TIMEOUT_MS });
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

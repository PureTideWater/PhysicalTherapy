import pg from 'pg';

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

export function openPool(url: string, max = 4, options: { readonly connectionTimeoutMillis?: number } = {}): DatabasePool {
  return new pg.Pool({ connectionString: url, max, connectionTimeoutMillis: options.connectionTimeoutMillis ?? CONNECTION_TIMEOUT_MS, idleTimeoutMillis: IDLE_TIMEOUT_MS });
}

/** A client that is not yet connected; call connect() and end(). */
export function databaseClient(url: string): DatabaseClient {
  return new pg.Client({ connectionString: url });
}

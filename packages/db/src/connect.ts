import pg from 'pg';

/**
 * Connections for code outside this package (the worker's operator path, the restore drill), so
 * the driver and its settings live in one place.
 */
export type DatabasePool = pg.Pool;
export type DatabaseClient = pg.Client;
export type DatabasePoolClient = pg.PoolClient;

export function openPool(url: string, max = 4): DatabasePool {
  return new pg.Pool({ connectionString: url, max });
}

/** A client that is not yet connected; call connect() and end(). */
export function databaseClient(url: string): DatabaseClient {
  return new pg.Client({ connectionString: url });
}

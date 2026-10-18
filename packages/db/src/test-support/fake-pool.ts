import type { QueryResult, QueryResultRow } from 'pg';

import type { ScopeClient, ScopePool } from '../authz/scope';

/** A recorded query. */
export interface Call {
  readonly text: string;
  readonly values: unknown[] | undefined;
}

type Responder = (text: string, values: unknown[] | undefined) => unknown[] | Error | undefined;

/**
 * A pool of one fake client for unit tests: records every query, answers from `respond` (rows, or an
 * Error to reject with), and records how the client was released.
 */
export function fakePool(respond: Responder = () => undefined) {
  const calls: Call[] = [];
  const released: (boolean | Error | undefined)[] = [];
  const client: ScopeClient = {
    query<R extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<R>> {
      calls.push({ text, values });
      const answer = respond(text, values);
      if (answer instanceof Error) {
        return Promise.reject(answer);
      }
      const rows = (answer ?? []) as R[];
      return Promise.resolve({ rows, rowCount: rows.length, command: '', oid: 0, fields: [] });
    },
    release(destroy?: boolean | Error) {
      released.push(destroy);
    },
  };
  const pool: ScopePool<ScopeClient> = { connect: () => Promise.resolve(client) };
  return { pool, client, calls, released, texts: () => calls.map((call) => call.text) };
}

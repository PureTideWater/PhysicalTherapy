import type { QueryResult, QueryResultRow } from 'pg';

import type { ScopeClient, ScopePool } from '../authz/scope';

/** A recorded query. */
export interface Call {
  readonly text: string;
  readonly values: unknown[] | undefined;
}

/** How a statement is answered: its rows, an Error to reject with, or the command tag alone (a COMMIT answered ROLLBACK). */
type Responder = (text: string, values: unknown[] | undefined) => unknown[] | Error | { readonly command: string } | undefined;

/**
 * A pool of one fake client for unit tests: records every query, answers from `respond` (rows, an
 * Error to reject with, or a command tag), and records how the client was released. A transaction's own statements
 * are answered with their tags as PostgreSQL answers them in a transaction that has not failed (COMMIT with COMMIT).
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
      const tagged = answer !== undefined && !Array.isArray(answer);
      const rows = (tagged ? [] : (answer ?? [])) as R[];
      const command = tagged ? answer.command : text === 'COMMIT' || text === 'ROLLBACK' ? text : text.startsWith('BEGIN') ? 'BEGIN' : '';
      return Promise.resolve({ rows, rowCount: rows.length, command, oid: 0, fields: [] });
    },
    release(destroy?: boolean | Error) {
      released.push(destroy);
    },
  };
  const pool: ScopePool<ScopeClient> = { connect: () => Promise.resolve(client) };
  return { pool, client, calls, released, texts: () => calls.map((call) => call.text) };
}

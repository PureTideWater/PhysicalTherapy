import { OPERATOR_ROLE, OWNER_ROLE, catalogProblems, databaseClient } from '@tp/db';

/**
 * The monthly restore drill (PRD 16, Backups and restore; PRD 19 Runbooks, Restore drill; test matrix
 * SEC-13): restore the latest snapshot to a scratch instance, count every table's rows and run the
 * catalog test against it, record duration and result as an evidence row, and destroy the instance.
 *
 * How a snapshot is restored is behind SnapshotRestorer: RDS in staging and production
 * (RdsSnapshotRestorer), pg_dump and pg_restore into a scratch database locally (PgDumpRestorer).
 * Rows are counted on the scratch copy as its owner role with every practice in scope, so the count
 * is exact on any instance without a role that bypasses row-level security; nothing but counts is
 * read, and the copy is destroyed afterwards. The evidence row is written to the source as the
 * operator role (tp_operator), which owns nothing: the owner login is used on the scratch copy only.
 */

export interface RestoredInstance {
  /** The snapshot restored (an RDS snapshot ID, or the local dump's name). */
  readonly snapshotRef: string;
  /** Where it was restored (the scratch instance or database). */
  readonly targetRef: string;
  /** A connection string with rights to SET ROLE to the owner on the restored instance. */
  readonly databaseUrl: string;
  destroy(): Promise<void>;
}

export interface SnapshotRestorer {
  restoreLatest(): Promise<RestoredInstance>;
}

export interface EvidenceClient {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
}

export type RestoreDrillOutcome = 'passed' | 'failed';

export interface RestoreDrillResult {
  readonly id: string;
  readonly outcome: RestoreDrillOutcome;
  readonly snapshotRef: string;
  readonly targetRef: string;
  readonly durationMs: number;
  readonly rowCounts: Readonly<Record<string, number>>;
  readonly catalogProblems: readonly string[];
  readonly errorCode: string | null;
}

/** The drill failed: the evidence row is written; the job fails so it retries and then alerts. */
export class RestoreDrillFailedError extends Error {
  override readonly name = 'RestoreDrillFailedError';

  constructor(readonly result: RestoreDrillResult) {
    super(`restore drill ${result.id} failed (${result.errorCode ?? 'unknown'})`);
  }
}

interface Connection extends EvidenceClient {
  connect(): Promise<unknown>;
  end(): Promise<void>;
}

export interface RestoreDrillOptions {
  readonly restorer: SnapshotRestorer;
  /** An operator connection to the database the evidence row is written to (the source). */
  readonly evidence: EvidenceClient;
  readonly now?: () => Date;
  /** How to reach the restored instance; a pg Client by default. */
  readonly connect?: (url: string) => Connection;
}

/** Exact row counts for every table in schema public, read as the owner with every practice in scope. */
export async function countRows(client: EvidenceClient): Promise<Record<string, number>> {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    await client.query(`SET LOCAL ROLE ${OWNER_ROLE}`);
    await client.query("SELECT set_config('app.practice_ids', coalesce((SELECT array_agg(id) FROM practice), '{}')::text, true)");
    const tables = (await client.query("SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') ORDER BY 1"))
      .rows as { name: string }[];
    const counts: Record<string, number> = {};
    for (const { name } of tables) {
      const { rows } = await client.query(`SELECT count(*)::bigint AS n FROM "${name.replaceAll('"', '""')}"`);
      counts[name] = Number((rows[0] as { n: string }).n);
    }
    return counts;
  } finally {
    await client.query('ROLLBACK');
  }
}

const RECORD = `INSERT INTO restore_drill (snapshot_ref, target_ref, started_at, completed_at, duration_ms, outcome, row_counts, catalog_problems, error_code)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`;

async function record(evidence: EvidenceClient, result: Omit<RestoreDrillResult, 'id'>, startedAt: Date, completedAt: Date): Promise<string> {
  await evidence.query('BEGIN');
  try {
    await evidence.query(`SET LOCAL ROLE ${OPERATOR_ROLE}`);
    const { rows } = await evidence.query(RECORD, [
      result.snapshotRef,
      result.targetRef,
      startedAt,
      completedAt,
      result.durationMs,
      result.outcome,
      JSON.stringify(result.rowCounts),
      JSON.stringify(result.catalogProblems),
      result.errorCode,
    ]);
    await evidence.query('COMMIT');
    return (rows[0] as { id: string }).id;
  } catch (error) {
    await evidence.query('ROLLBACK');
    throw error;
  }
}

/** Runs one drill and writes its evidence row, whatever happens; throws if it did not pass. */
export async function runRestoreDrill(options: RestoreDrillOptions): Promise<RestoreDrillResult> {
  const now = options.now ?? (() => new Date());
  const connect = options.connect ?? databaseClient;
  const startedAt = now();
  let snapshotRef = 'unavailable';
  let targetRef = 'none';
  let rowCounts: Record<string, number> = {};
  let problems: string[] = [];
  let errorCode: string | null = null;
  let restored: RestoredInstance | undefined;
  try {
    restored = await options.restorer.restoreLatest();
    snapshotRef = restored.snapshotRef;
    targetRef = restored.targetRef;
    const client = connect(restored.databaseUrl);
    await client.connect();
    try {
      rowCounts = await countRows(client);
      problems = await catalogProblems(client);
    } finally {
      await client.end();
    }
    if (problems.length > 0) {
      errorCode = 'CATALOG_FAILED';
    } else if ((rowCounts.schema_migrations ?? 0) === 0) {
      errorCode = 'NO_MIGRATIONS_RESTORED';
    }
  } catch {
    errorCode = restored === undefined ? 'RESTORE_FAILED' : 'VERIFY_FAILED';
  } finally {
    if (restored !== undefined) {
      try {
        await restored.destroy();
      } catch {
        errorCode ??= 'DESTROY_FAILED';
      }
    }
  }
  const completedAt = now();
  const result: Omit<RestoreDrillResult, 'id'> = {
    outcome: errorCode === null ? 'passed' : 'failed',
    snapshotRef,
    targetRef,
    durationMs: Math.max(0, completedAt.getTime() - startedAt.getTime()),
    rowCounts,
    catalogProblems: problems,
    errorCode,
  };
  const id = await record(options.evidence, result, startedAt, completedAt);
  const complete = { id, ...result };
  if (complete.outcome === 'failed') {
    throw new RestoreDrillFailedError(complete);
  }
  return complete;
}

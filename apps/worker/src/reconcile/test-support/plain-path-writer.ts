import { ACTIONABLE_NOW, ACTIONABLE_NOW_LINE } from '../../triage/actionable-now';

/**
 * For the tests (schema PR 5; the design note's 4.1): the statement writer's query of the open cases on the plain
 * path, as it was first built (7b05fd87): the figure today's ACTIONABLE_NOW gives and, beside it, the priced lines of
 * the same rows as a second subquery, so the line predicate runs twice a line. The writer now reads each line once
 * (ACTIONABLE_NOW_WITH_LINES); the tests run both texts in one transaction and hold them equal, row for row, on the
 * fixture worlds and on a generated month (statement-lines.db.test.ts, statement-paths.db.test.ts).
 */
export const PLAIN_PATH_OPEN_CASES = `SELECT c.id, ${ACTIONABLE_NOW('c')}::text AS actionable_cents,
            (SELECT coalesce(array_agg(p.id ORDER BY p.id), '{}')::text[] FROM case_line x JOIN priced_line p ON p.id = x.priced_line_id
              WHERE x.case_id = c.id AND x.practice_id = c.practice_id AND ${ACTIONABLE_NOW_LINE('x')}) AS line_ids
       FROM "case" c
      WHERE c.practice_id = $1 AND c.state NOT IN ('resolved', 'closed_written_off')
      ORDER BY c.opened_at, c.id`;

export interface OpenCasePathRow {
  readonly id: string;
  readonly actionable_cents: string;
  readonly line_ids: readonly string[];
}

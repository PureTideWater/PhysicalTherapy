import { describe, expect, it } from 'vitest';

import * as actionableNow from './actionable-now';

/**
 * The figure's text and the list's (schema PR 5; the design note's T15 a and T16). The ROI statement stores the priced
 * lines its actionable figure counted, and the database's roi_statement_rules() checks the figure against those lines'
 * priced_line.variance_cents. So the figure and the list read the same rows, and the per-line amount is that column
 * and nothing else.
 */

const ROWS = `FROM case_line x JOIN priced_line p ON p.id = x.priced_line_id
    WHERE x.case_id = c.id AND x.practice_id = c.practice_id AND (CASE WHEN x.written_off_reason IS NULL AND (SELECT s.stage FROM line_status s WHERE s.practice_id = x.practice_id AND s.service_line_id = x.service_line_id ORDER BY s.seq DESC LIMIT 1) = 'actionable' THEN coalesce(priced_line_pricing_check(x.priced_line_id) = 'current', false) ELSE false END)`;

const GUARD =
  'roi_statement_rules() checks a statement’s actionable figure as the sum of priced_line.variance_cents over the lines it lists; a figure that reads another amount or other rows needs a new ledger freeze exception that replaces roi_statement_rules()';

describe('the actionable figure and the lines it counted', () => {
  it('T16: ACTIONABLE_NOW is the text it was, byte for byte', () => {
    expect(actionableNow.ACTIONABLE_NOW('c')).toBe(`(SELECT coalesce(sum(p.variance_cents), 0) ${ROWS})`);
  });

  it('T15 a: the list reads the rows the figure sums, in one pass, and the figure’s per-line amount is priced_line.variance_cents and nothing else', () => {
    const withLines = (
      actionableNow as unknown as {
        ACTIONABLE_NOW_WITH_LINES?: (alias: string) => string;
      }
    ).ACTIONABLE_NOW_WITH_LINES;
    // The statement writer's figure and list: one derived table, each line read once, the predicate ACTIONABLE_NOW_LINE.
    expect(withLines?.('c'), GUARD).toBe(`(
    SELECT coalesce(sum(y.variance_cents) FILTER (WHERE y.now), 0) AS cents,
           coalesce(array_agg(y.id ORDER BY y.id) FILTER (WHERE y.now), '{}')::text[] AS line_ids
      FROM (SELECT p.id, p.variance_cents, ${actionableNow.ACTIONABLE_NOW_LINE('x', 'st.stage')} AS now
              FROM case_line x
              JOIN priced_line p ON p.id = x.priced_line_id
              LEFT JOIN LATERAL (SELECT s.stage FROM line_status s WHERE s.practice_id = x.practice_id AND s.service_line_id = x.service_line_id ORDER BY s.seq DESC LIMIT 1) st ON true
             WHERE x.case_id = c.id AND x.practice_id = c.practice_id
            OFFSET 0) y)`);
    expect(withLines?.('c').match(/priced_line_pricing_check\(/g), GUARD).toHaveLength(1);
    expect(withLines?.('c').match(/_cents/g), GUARD).toEqual(['_cents', '_cents']);
    // With the stage it reads as a column, the predicate is the one ACTIONABLE_NOW filters by.
    expect(actionableNow.ACTIONABLE_NOW_LINE('x', actionableNow.LATEST_STAGE('x'))).toBe(actionableNow.ACTIONABLE_NOW_LINE('x'));
    expect(ROWS.endsWith(`AND ${actionableNow.ACTIONABLE_NOW_LINE('x')}`), GUARD).toBe(true);
    const figure = actionableNow.ACTIONABLE_NOW('c');
    expect(figure.startsWith('(SELECT coalesce(sum(p.variance_cents), 0) FROM case_line x JOIN priced_line p ON p.id = x.priced_line_id'), GUARD).toBe(true);
    expect(figure.match(/_cents/g), GUARD).toEqual(['_cents']);
    // The one-pass reader sums the same column of the same join.
    const of = actionableNow.ACTIONABLE_NOW_OF('c');
    expect(of.includes('coalesce(sum(y.variance_cents) FILTER (WHERE y.now), 0) AS cents') && of.includes('SELECT p.variance_cents, x.written_off_reason IS NULL AS open'), GUARD).toBe(true);
    expect(of.match(/_cents/g), GUARD).toEqual(['_cents', '_cents']);
  });
});

import { UNPRICED_REASONS } from '@tp/pricing';
import { COVERAGE_FORMAT, type RunCoverage } from '@tp/worker/pricing';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { FAILURE_TEXT, PatternTable, UnpricedReasons } from './display';

/**
 * A pricing run's coverage card (PRD 7, Pricing runs) as the screen tour found it (C3): a run that priced every line
 * showed the unpriced reasons' header over no rows. SYNTHETIC counts, written by hand.
 */

function coverage(unpriced: Partial<Record<(typeof UNPRICED_REASONS)[number], number>> = {}): RunCoverage {
  const reasons = UNPRICED_REASONS.map((reason) => ({ reason, lines: unpriced[reason] ?? 0, charge_cents: String((unpriced[reason] ?? 0) * 7500) }));
  const unpricedLines = reasons.reduce((sum, entry) => sum + entry.lines, 0);
  return {
    format: COVERAGE_FORMAT,
    lines: 4 + unpricedLines,
    charge_cents: String(60000 + unpricedLines * 7500),
    priced: { lines: 4, charge_cents: '60000' },
    reasons,
    engine_errors: [],
    versions: [],
    patterns: [],
  };
}

describe('a run’s unpriced reasons', () => {
  it('are an empty state, with no table, when the run priced every line (the March run of the tour: 4 of 4)', () => {
    const html = renderToStaticMarkup(<UnpricedReasons coverage={coverage()} />);
    expect(html).not.toContain('<table');
    expect(html).not.toContain('<th');
    expect(html).toContain('data-slot="empty-state"');
    expect(html).toContain('No line of this run is unpriced');
  });

  it('list each reason that left a line unpriced, with its remedy, lines and billed, and no reason without one', () => {
    const html = renderToStaticMarkup(<UnpricedReasons coverage={coverage({ NO_AGREEMENT: 32 })} />);
    expect(html).not.toContain('data-slot="empty-state"');
    expect(html.match(/<tr [^>]*data-reason=/g)).toHaveLength(1);
    expect(html).toContain('data-reason="NO_AGREEMENT"');
    expect(html).toContain('None; anomaly screening only');
    expect(html).toContain('$2,400.00');
  });

  it('give every header but the last the right padding its column’s cells have, so no two headers run together (C2)', () => {
    for (const html of [renderToStaticMarkup(<UnpricedReasons coverage={coverage({ NO_AGREEMENT: 1 })} />), renderToStaticMarkup(<PatternTable practiceId="p" coverage={{ ...coverage(), patterns: [pattern()] }} names={{ payers: {}, plans: {}, versions: {} }} />)]) {
      const headers = [...html.matchAll(/<th class="([^"]*)"/g)].map((match) => match[1] ?? '');
      expect(headers.length).toBeGreaterThan(1);
      expect(headers.slice(0, -1).filter((classes) => !/\bpr-3\b/.test(classes))).toEqual([]);
    }
  });
});

function pattern(): RunCoverage['patterns'][number] {
  return {
    payer_id: '1f0e0000-0000-4000-8000-000000000001',
    plan_id: '1f0e0000-0000-4000-8000-000000000002',
    mapping_kind: 'contract',
    contract_version_id: null,
    rate_record_id: null,
    lines: 3,
    underpaid_lines: 3,
    underpaid_cents: '9000',
    overpaid_lines: 0,
    overpaid_cents: '0',
  };
}

describe('a failed run’s words', () => {
  it('never tell the customer the operator was alerted of a read outside the fetch, which no alarm reads yet, and say the month prices by itself', () => {
    // The worker logs RELEASE_READ_OUTSIDE_FETCH; its alarm comes with the later pull request (docs/adr/0071).
    const text = FAILURE_TEXT.release_read_outside_fetch ?? '';
    expect(text).not.toMatch(/alerted/);
    expect(text).toContain('logged for the operator');
    expect(text).not.toContain('create a new run');
    expect(text).toContain('priced again by itself');
  });
});

import type { ScopeClient } from '@tp/db/runtime';
import { centsToString } from '@tp/money';
import type { LinePricing } from '@tp/pricing';

import type { StoredLine } from './lines';

/**
 * One priced_line row from the engine's result for a stored line (Data dictionary, priced_line): the
 * terms found, the amounts, the reason, the adjustments applied, the window's last day and the full
 * trace. Cents and the unrounded amount are exact decimal text; nothing here computes an amount.
 */
export interface PricedLineInsert {
  readonly serviceLineId: string;
  readonly mappingId: string | null;
  readonly contractVersionId: string | null;
  readonly rateRecordId: string | null;
  readonly method: string | null;
  readonly expectedAllowedCents: string | null;
  readonly expectedUnrounded: string | null;
  readonly observedAllowedCents: string;
  readonly varianceCents: string | null;
  readonly unpricedReason: string | null;
  /** JSON text of the adjustments applied, in order. */
  readonly adjustmentsApplied: string;
  readonly windowEndsOn: string | null;
  /** JSON text of the trace. */
  readonly trace: string;
}

export function pricedLineRow(line: StoredLine, result: LinePricing): PricedLineInsert {
  const terms = result.terms;
  const common = {
    serviceLineId: line.serviceLineId,
    mappingId: terms?.mappingId ?? null,
    contractVersionId: terms?.contractVersionId ?? null,
    rateRecordId: terms?.rateRecordId ?? null,
    method: result.method,
    trace: JSON.stringify(result.trace),
  };
  if (result.outcome === 'unpriced') {
    return {
      ...common,
      expectedAllowedCents: null,
      expectedUnrounded: null,
      observedAllowedCents: centsToString(line.observedAllowedCents),
      varianceCents: null,
      unpricedReason: result.reason,
      adjustmentsApplied: '[]',
      windowEndsOn: null,
    };
  }
  return {
    ...common,
    expectedAllowedCents: centsToString(result.expectedAllowedCents),
    expectedUnrounded: result.expectedUnroundedCents.toString(),
    observedAllowedCents: centsToString(result.observedAllowedCents),
    varianceCents: centsToString(result.varianceCents),
    unpricedReason: null,
    adjustmentsApplied: JSON.stringify(result.adjustments.map((item) => ({ name: item.name, before_cents: item.beforeCents.toString(), after_cents: item.afterCents.toString() }))),
    windowEndsOn: result.window.endsOn,
  };
}

const INSERT = `INSERT INTO priced_line (practice_id, pricing_run_id, service_line_id, mapping_id, contract_version_id, rate_record_id, method,
    expected_allowed_cents, expected_unrounded, observed_allowed_cents, variance_cents, unpriced_reason, adjustments_applied, window_ends_on, trace)
  SELECT $1::uuid, $2::uuid, t.service_line_id, t.mapping_id, t.contract_version_id, t.rate_record_id, t.method, t.expected_allowed_cents, t.expected_unrounded,
         t.observed_allowed_cents, t.variance_cents, t.unpriced_reason, t.adjustments_applied, t.window_ends_on, t.trace
    FROM jsonb_to_recordset($3::jsonb) AS t (service_line_id uuid, mapping_id uuid, contract_version_id uuid, rate_record_id uuid, method text,
         expected_allowed_cents bigint, expected_unrounded numeric, observed_allowed_cents bigint, variance_cents bigint, unpriced_reason text,
         adjustments_applied jsonb, window_ends_on date, trace jsonb)`;

/**
 * Writes a batch of the run's lines in one statement, as one JSON document of rows (the run must be
 * open: the database refuses otherwise). Amounts travel as JSON strings and are read as bigint and
 * numeric, exactly; the adjustments and the trace are embedded as JSON, not as text.
 */
export async function insertPricedLines(client: ScopeClient, practiceId: string, pricingRunId: string, rows: readonly PricedLineInsert[]): Promise<void> {
  if (rows.length === 0) {
    return;
  }
  const document = `[${rows
    .map((row) =>
      [
        '{"service_line_id":', JSON.stringify(row.serviceLineId),
        ',"mapping_id":', JSON.stringify(row.mappingId),
        ',"contract_version_id":', JSON.stringify(row.contractVersionId),
        ',"rate_record_id":', JSON.stringify(row.rateRecordId),
        ',"method":', JSON.stringify(row.method),
        ',"expected_allowed_cents":', JSON.stringify(row.expectedAllowedCents),
        ',"expected_unrounded":', JSON.stringify(row.expectedUnrounded),
        ',"observed_allowed_cents":', JSON.stringify(row.observedAllowedCents),
        ',"variance_cents":', JSON.stringify(row.varianceCents),
        ',"unpriced_reason":', JSON.stringify(row.unpricedReason),
        ',"adjustments_applied":', row.adjustmentsApplied,
        ',"window_ends_on":', JSON.stringify(row.windowEndsOn),
        ',"trace":', row.trace,
        '}',
      ].join(''),
    )
    .join(',')}]`;
  await client.query(INSERT, [practiceId, pricingRunId, document]);
}

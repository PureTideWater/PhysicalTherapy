import type { ScopeClient } from '@tp/db/runtime';
import { pricingTraceSchema } from '@tp/pricing';
import { VERIFICATION_LEVELS, type VerificationLevel } from '@tp/rules';
import {
  type ContractWindowFacts,
  DEFAULT_DEADLINE_LEVEL,
  type DeadlineMinimumLevel,
  type DeadlineVerification,
  deadlineVerification,
  nextLevelDeadlineVerification,
} from '@tp/triage';

/**
 * The facts @tp/triage's deadline rule reads beside a line's stored trace (D17 a; docs/adr/0061), read in the
 * caller's scope: the level of the release record the trace's window names (its release number and SHA-256), and
 * the contract version the trace names as it stands now (status, window, the window's evidence and verification).
 * Triage judges actionability with them (execute.ts), the report counts with them (report/content.ts), and the
 * packet export and the packet builder state and check each line's deadline with them (packets/records.ts,
 * packets/export.ts), so every one of them reads a deadline as the database's priced_line_deadline_status()
 * does. A line the caller cannot see is absent from the map: callers read an absent line as unverified.
 */

const UUID = '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
const windowSchema = pricingTraceSchema.shape.steps.shape.window;
const agreementSchema = pricingTraceSchema.shape.agreement;

interface LineDeadlineRow {
  readonly priced_line_id: string;
  readonly window_step: unknown;
  readonly agreement: unknown;
  readonly record_level: string | null;
  readonly version_id: string | null;
  readonly version_status: string | null;
  readonly dispute_window_days: number | null;
  readonly dispute_window_evidence: { readonly document_id: string; readonly page: number; readonly quote: string; readonly hash: string } | null;
  readonly dispute_window_verified_by: string | null;
  readonly dispute_window_verified_at: Date | null;
}

const asLevel = (value: string | null): VerificationLevel | null => VERIFICATION_LEVELS.find((level) => level === value) ?? null;

function contractWindowOf(row: LineDeadlineRow): ContractWindowFacts | null {
  if (row.version_id === null || row.version_status === null) {
    return null;
  }
  const evidence = row.dispute_window_evidence;
  return {
    contractVersionId: row.version_id,
    status: row.version_status,
    disputeWindowDays: row.dispute_window_days,
    evidence: evidence === null ? null : { documentId: evidence.document_id, page: evidence.page, quote: evidence.quote, hash: evidence.hash },
    verifiedBy: row.dispute_window_verified_by,
    verifiedAt: row.dispute_window_verified_at === null ? null : row.dispute_window_verified_at.toISOString(),
  };
}

/** Each priced line's deadline, by priced line ID, at `minimumLevel` (L2 unless asked; L3 for the E3 gate). */
export async function lineDeadlines(client: ScopeClient, pricedLineIds: readonly string[], minimumLevel: DeadlineMinimumLevel = DEFAULT_DEADLINE_LEVEL): Promise<ReadonlyMap<string, DeadlineVerification>> {
  const result = new Map<string, DeadlineVerification>();
  if (pricedLineIds.length === 0) {
    return result;
  }
  const { rows } = await client.query<LineDeadlineRow>(
    `SELECT p.id::text AS priced_line_id, p.trace #> '{steps,window}' AS window_step, p.trace -> 'agreement' AS agreement,
            (SELECT r.verification FROM rule_record r
              WHERE r.release_no = CASE WHEN p.trace #>> '{release,number}' ~ '^[1-9][0-9]{0,8}$' THEN (p.trace #>> '{release,number}')::integer END
                AND r.record_type = 'dispute_window' AND r.sha256 = p.trace #>> '{steps,window,record,sha256}') AS record_level,
            v.id::text AS version_id, v.status AS version_status, v.dispute_window_days, v.dispute_window_evidence,
            v.dispute_window_verified_by::text AS dispute_window_verified_by, v.dispute_window_verified_at
       FROM priced_line p
       LEFT JOIN contract_version v
         ON v.id = CASE WHEN p.trace #>> '{agreement,contract_version_id}' ~ '${UUID}' THEN (p.trace #>> '{agreement,contract_version_id}')::uuid END
      WHERE p.id = ANY ($1::uuid[])`,
    [[...new Set(pricedLineIds)]],
  );
  for (const row of rows) {
    const trace = { agreement: agreementSchema.parse(row.agreement ?? null), steps: { window: windowSchema.parse(row.window_step ?? null) } };
    result.set(row.priced_line_id, deadlineVerification({ trace, recordLevel: asLevel(row.record_level), contractWindow: contractWindowOf(row), minimumLevel }));
  }
  return result;
}

/**
 * A reopened case's next-level deadline (dispute level 2 and above): the window its reopening denial opened
 * (payer_response.next_window_ends_on, the latest denial that reopened it), verified as
 * case_next_window_deadline_status() verifies it: a contract's appeal levels never; the Medicare reconsideration
 * record the database read (the release in force, on the day the denial was received) at `minimumLevel` or above.
 */
export async function nextLevelDeadline(
  client: ScopeClient,
  caseId: string,
  minimumLevel: DeadlineMinimumLevel = DEFAULT_DEADLINE_LEVEL,
): Promise<{ readonly endsOn: string | null; readonly verification: DeadlineVerification }> {
  const { rows } = await client.query<{ contract_version_id: string | null; mapping_kind: string | null; ends_on: string | null; record_level: string | null }>(
    `WITH reopened AS (
       SELECT r.received_on, r.next_window_ends_on
         FROM payer_response r JOIN submission s ON s.id = r.submission_id
        WHERE s.case_id = $1 AND r.reopens_case
        ORDER BY r.received_on DESC, r.created_at DESC, r.id DESC LIMIT 1
     )
     SELECT c.pattern_key ->> 'contract_version_id' AS contract_version_id, c.pattern_key ->> 'mapping_kind' AS mapping_kind,
            (SELECT o.next_window_ends_on::text FROM reopened o) AS ends_on,
            (SELECT x.verification FROM rule_record x, reopened o
              WHERE x.release_no = current_rule_release() AND x.record_type = 'dispute_window'
                AND x.key = '{"program": "medicare", "window": "reconsideration"}'::jsonb
                AND x.effective_from <= o.received_on AND (x.effective_to IS NULL OR o.received_on <= x.effective_to)
              ORDER BY x.effective_from DESC LIMIT 1) AS record_level
       FROM "case" c WHERE c.id = $1`,
    [caseId],
  );
  const row = rows[0];
  const endsOn = row?.ends_on ?? null;
  const regulation = row !== undefined && row.contract_version_id === null && row.mapping_kind === 'ma_noncontracted';
  // A case the caller cannot see, or of no known basis, is read as a contract's: never verified (it fails closed).
  const verification = nextLevelDeadlineVerification({ basis: regulation ? 'regulation' : 'contract', recordLevel: regulation ? asLevel(row.record_level) : null, endsOn, minimumLevel });
  return { endsOn, verification };
}

import { type PracticeScope, type ScopeClient, readWithAudit } from '@tp/db/runtime';
import { type Cents, parseCents } from '@tp/money';

import { type MappedLine, assertPricingAllowed } from './coverage';
import type { AgreementRecords, ContractVersionRecord, PlanMappingRecord, RateRecord } from './records';
import { evidenceSchema, parseRateTerms } from './terms';

/**
 * Reads for the workflow, pricing and coverage, under the practice's policies. Every row returned is
 * an audited read (readWithAudit): contract terms are confidential and their tables are PHI tables.
 * Dates come back as YYYY-MM-DD text, never through a local-time Date.
 */

/** A stored record that fails its own schema: an engine error, never a guess. */
export class ContractDataError extends Error {
  override readonly name = 'ContractDataError';
}

export interface ReadRequest {
  readonly practiceId: string;
  readonly requestId: string;
  /** Why the records are read, as a code (contract_review, pricing, coverage). */
  readonly purpose: string;
}

interface MappingRow {
  readonly id: string;
  readonly practice_id: string;
  readonly plan_id: string;
  readonly mapping_kind: PlanMappingRecord['kind'];
  readonly contract_version_id: string | null;
  readonly effective_from: string;
  readonly effective_to: string | null;
  readonly supersedes_id: string | null;
}

export const MAPPING_COLUMNS = `m.id, m.practice_id, m.plan_id, m.mapping_kind, m.contract_version_id, m.effective_from::text AS effective_from,
  m.effective_to::text AS effective_to, m.supersedes_id`;

export function mappingRecord(row: MappingRow): PlanMappingRecord {
  return {
    id: row.id,
    planId: row.plan_id,
    kind: row.mapping_kind,
    contractVersionId: row.contract_version_id,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    supersedesId: row.supersedes_id,
  };
}

export interface VersionRow {
  readonly id: string;
  readonly practice_id: string;
  readonly contract_id: string;
  readonly version_no: number;
  readonly status: ContractVersionRecord['status'];
  readonly effective_from: string;
  readonly effective_to: string | null;
  readonly supersedes_id: string | null;
  readonly source_document_ids: string[];
  readonly timely_filing_days: number | null;
  readonly dispute_window_days: number | null;
  readonly appeal_levels: { level: number; days: number }[];
  readonly notice_days: number | null;
}

export const VERSION_COLUMNS = `v.id, v.practice_id, v.contract_id, v.version_no, v.status, v.effective_from::text AS effective_from,
  v.effective_to::text AS effective_to, v.supersedes_id, v.source_document_ids, v.timely_filing_days, v.dispute_window_days,
  v.appeal_levels, v.notice_days`;

export function versionRecord(row: VersionRow): ContractVersionRecord {
  return {
    id: row.id,
    contractId: row.contract_id,
    versionNo: row.version_no,
    status: row.status,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    supersedesId: row.supersedes_id,
    sourceDocumentIds: row.source_document_ids,
    windows: { timely_filing_days: row.timely_filing_days, dispute_window_days: row.dispute_window_days, appeal_levels: row.appeal_levels },
    noticeDays: row.notice_days,
  };
}

export interface RateRecordRow {
  readonly id: string;
  readonly practice_id: string;
  readonly contract_version_id: string;
  readonly scope: unknown;
  readonly method: string;
  readonly parameters: unknown;
  readonly flags: unknown;
  readonly rounding: string | null;
  readonly evidence: unknown;
  readonly proposed_by: RateRecord['proposedBy'];
  readonly verified_by: string | null;
  readonly verified_at: Date | null;
}

export const RATE_RECORD_COLUMNS = 'r.id, r.practice_id, r.contract_version_id, r.scope, r.method, r.parameters, r.flags, r.rounding, r.evidence, r.proposed_by, r.verified_by, r.verified_at';

export function rateRecord(row: RateRecordRow): RateRecord {
  let terms;
  let evidence;
  try {
    terms = parseRateTerms({ scope: row.scope, method: row.method, parameters: row.parameters, flags: row.flags, rounding: row.rounding });
    evidence = evidenceSchema.parse(row.evidence);
  } catch {
    throw new ContractDataError('a stored rate record does not match its schema');
  }
  return {
    id: row.id,
    contractVersionId: row.contract_version_id,
    terms,
    citation: evidence.citation,
    approvals: evidence.approvals,
    proposedBy: row.proposed_by,
    verifiedBy: row.verified_by,
    verifiedAt: row.verified_at?.toISOString() ?? null,
  };
}

const target = (row: { readonly id: string; readonly practice_id: string }) => ({ objectId: row.id, practiceId: row.practice_id });

/** The practice's mappings, optionally only those of some plans. */
export async function loadMappings(scope: PracticeScope<ScopeClient>, request: ReadRequest, planIds?: readonly string[]): Promise<PlanMappingRecord[]> {
  const rows = await readWithAudit(
    scope,
    { objectType: 'payer_plan_mapping', purpose: request.purpose, requestId: request.requestId },
    async (client) =>
      (
        await client.query<MappingRow>(
          `SELECT ${MAPPING_COLUMNS} FROM payer_plan_mapping m WHERE m.practice_id = $1 AND ($2::uuid[] IS NULL OR m.plan_id = ANY ($2::uuid[])) ORDER BY m.plan_id, m.effective_from, m.created_at, m.id`,
          [request.practiceId, planIds ?? null],
        )
      ).rows,
    target,
  );
  return rows.map(mappingRecord);
}

/** Versions of the practice: all of them, or those of some contracts. */
export async function loadVersions(scope: PracticeScope<ScopeClient>, request: ReadRequest, contractIds?: readonly string[]): Promise<ContractVersionRecord[]> {
  const rows = await readWithAudit(
    scope,
    { objectType: 'contract_version', purpose: request.purpose, requestId: request.requestId },
    async (client) =>
      (
        await client.query<VersionRow>(
          `SELECT ${VERSION_COLUMNS} FROM contract_version v WHERE v.practice_id = $1 AND ($2::uuid[] IS NULL OR v.contract_id = ANY ($2::uuid[])) ORDER BY v.contract_id, v.version_no`,
          [request.practiceId, contractIds ?? null],
        )
      ).rows,
    target,
  );
  return rows.map(versionRecord);
}

/** Rate records of some versions. */
export async function loadRateRecords(scope: PracticeScope<ScopeClient>, request: ReadRequest, versionIds: readonly string[]): Promise<RateRecord[]> {
  if (versionIds.length === 0) {
    return [];
  }
  const rows = await readWithAudit(
    scope,
    { objectType: 'rate_record', purpose: request.purpose, requestId: request.requestId },
    async (client) =>
      (
        await client.query<RateRecordRow>(
          `SELECT ${RATE_RECORD_COLUMNS} FROM rate_record r WHERE r.practice_id = $1 AND r.contract_version_id = ANY ($2::uuid[]) ORDER BY r.contract_version_id, r.created_at, r.id`,
          [request.practiceId, versionIds],
        )
      ).rows,
    target,
  );
  return rows.map(rateRecord);
}

/**
 * What a pricing run resolves its lines against: the practice's mappings, its contract versions,
 * and the rate records of its signed-off versions (only those price, CON-07).
 */
export async function loadAgreementRecords(scope: PracticeScope<ScopeClient>, request: ReadRequest, planIds?: readonly string[]): Promise<AgreementRecords> {
  const mappings = await loadMappings(scope, request, planIds);
  const versions = await loadVersions(scope, request);
  const rateRecords = await loadRateRecords(
    scope,
    request,
    versions.filter((version) => version.status === 'signed_off').map((version) => version.id),
  );
  return { mappings, versions, rateRecords };
}

/** The guard a pricing run's creator calls with the run's lines (MAP-01): refuses a run over an unmapped plan. */
export async function assertPracticePricingAllowed(scope: PracticeScope<ScopeClient>, request: ReadRequest, lines: readonly MappedLine[]): Promise<void> {
  const planIds = [...new Set(lines.flatMap((line) => (line.planId === null ? [] : [line.planId])))];
  assertPricingAllowed(lines, await loadMappings(scope, request, planIds));
}

/** One plan's lines with no mapping covering their service date (Coverage: dollars waiting on mappings). */
export interface PlanWaitingOnMapping {
  readonly planId: string;
  readonly payerId: string;
  readonly lines: number;
  readonly claims: number;
  readonly chargeCents: Cents;
  readonly paidCents: Cents;
}

/**
 * The dollars waiting on mappings, per plan, largest billed total first: the practice's service lines
 * whose plan has no mapping covering the line's service date (an unmapped plan, or a date outside its
 * mappings, MAP-01 and MAP-02), with counts and billed and paid totals. A line without a service date
 * waits too. Aggregates only: no line is returned.
 */
export async function dollarsWaitingOnMapping(scope: PracticeScope<ScopeClient>, practiceId: string): Promise<PlanWaitingOnMapping[]> {
  const { rows } = await scope.client.query<{ plan_id: string; payer_id: string; lines: number; claims: number; charge_cents: string; paid_cents: string }>(
    `SELECT l.payer_plan_key AS plan_id, p.payer_id, count(*)::int AS lines, count(DISTINCT l.claim_id)::int AS claims,
            sum(l.charge_cents)::text AS charge_cents, sum(l.paid_cents)::text AS paid_cents
       FROM service_line l
       JOIN plan p ON p.id = l.payer_plan_key
      WHERE l.practice_id = $1
        AND NOT EXISTS (
          SELECT 1 FROM payer_plan_mapping m
           WHERE m.plan_id = l.payer_plan_key AND l.service_date IS NOT NULL
             AND m.effective_from <= l.service_date AND (m.effective_to IS NULL OR l.service_date < m.effective_to)
        )
      GROUP BY l.payer_plan_key, p.payer_id
      ORDER BY sum(l.charge_cents) DESC, l.payer_plan_key`,
    [practiceId],
  );
  return rows.map((row) => ({
    planId: row.plan_id,
    payerId: row.payer_id,
    lines: row.lines,
    claims: row.claims,
    chargeCents: parseCents(row.charge_cents),
    paidCents: parseCents(row.paid_cents),
  }));
}

import { type PracticeCipher, type PracticeScope, REVERSAL_STATUS_CODE, type ScopeClient, readWithAudit } from '@tp/db/runtime';

import { IN_EFFECT_SINCE, RUN_IN_EFFECT } from '../pricing/queries';
import { lineStatusOf } from '../pricing/view';

/**
 * The Remittances and Claims and lines screens' reads (PRD 7; PRD 6, Canonical model and matching;
 * PRD 15, Request path for a PHI page). Every read runs in the request's practice scope, under the
 * practice's policies, and every row it returns is an audited read (readWithAudit: one audit event per
 * remittance, claim or line returned). Lists are paginated and filtered in SQL (PRD 6, Cross-cutting).
 *
 * PHI columns (patient names, patient and payer claim control numbers, service dates, a PLB's
 * reference) are decrypted and returned only for roles that read PHI; for the others they are null
 * and never leave the database. Amounts are integer cents as text, signed as the 835 carries them.
 */

type Scope = PracticeScope<ScopeClient>;

export const REMITTANCES_PER_PAGE = 25;
export const LINES_PER_PAGE = 50;

/** A month, YYYY-MM: the period filters (a full date in a URL is shaped like a date of birth). */
export type Month = string;

function monthStart(month: Month): string {
  return `${month}-01`;
}

/** The first day after the month. */
function monthEnd(month: Month): string {
  const [year, number] = month.split('-').map((part) => parseInt(part, 10)) as [number, number];
  return number === 12 ? `${String(year + 1)}-01-01` : `${String(year)}-${String(number + 1).padStart(2, '0')}-01`;
}

class Filters {
  readonly values: unknown[];
  private readonly where: string[];

  constructor(practiceId: string, column: string) {
    this.values = [practiceId];
    this.where = [`${column} = $1`];
  }

  add(sql: (placeholder: string) => string, value: unknown): void {
    this.values.push(value);
    this.where.push(sql(`$${String(this.values.length)}`));
  }

  raw(sql: string): void {
    this.where.push(sql);
  }

  get sql(): string {
    return this.where.join(' AND ');
  }
}

function pages(total: number, per: number, page: number): { page: number; pages: number; offset: number } {
  const count = Math.max(1, Math.ceil(total / per));
  const current = Math.min(Math.max(1, page), count);
  return { page: current, pages: count, offset: (current - 1) * per };
}

export interface PayerOption {
  readonly id: string;
  readonly name: string;
}

/** The practice's payers, for the filters. */
export async function payerOptions(scope: Scope, practiceId: string): Promise<PayerOption[]> {
  const { rows } = await scope.client.query<PayerOption>('SELECT id, name_raw AS name FROM payer WHERE practice_id = $1 ORDER BY name_raw, id', [practiceId]);
  return rows;
}

// ---------------------------------------------------------------------------------------------------
// Remittances
// ---------------------------------------------------------------------------------------------------

export interface RemittanceSummary {
  readonly id: string;
  readonly payerId: string;
  readonly payerName: string;
  /** BPR16. */
  readonly paymentDate: string;
  /** TRN02. */
  readonly trace: string;
  /** BPR02, negative for a debit. */
  readonly amountCents: string;
  readonly method: string;
  readonly claimCount: number;
  readonly reversals: number;
  readonly balanced: boolean;
  readonly sourceDocumentId: string;
  readonly reviewReason: string | null;
  readonly reviewOfRemittanceId: string | null;
}

interface RemittanceRow {
  readonly id: string;
  readonly practice_id: string;
  readonly payer_id: string;
  readonly payer_name: string;
  readonly payment_date: string;
  readonly trn02: string;
  readonly amount_cents: string;
  readonly bpr_method: string;
  readonly claim_count: number;
  readonly reversals: number;
  readonly balanced: boolean;
  readonly source_document_id: string;
  readonly review_reason: string | null;
  readonly review_of_remittance_id: string | null;
}

const REMITTANCE_COLUMNS = `r.id, r.practice_id, r.payer_id, r.payer_name, r.bpr16_date::text AS payment_date, r.trn02,
  (CASE WHEN r.bpr_credit_debit = 'D' THEN -r.bpr02_cents ELSE r.bpr02_cents END)::text AS amount_cents, r.bpr_method, r.claim_count,
  (SELECT count(*)::int FROM claim c WHERE c.remittance_id = r.id AND c.claim_status_code = '${REVERSAL_STATUS_CODE}') AS reversals,
  r.balanced, r.source_document_id, r.review_reason, r.review_of_remittance_id`;

function remittanceSummary(row: RemittanceRow): RemittanceSummary {
  return {
    id: row.id,
    payerId: row.payer_id,
    payerName: row.payer_name,
    paymentDate: row.payment_date,
    trace: row.trn02,
    amountCents: row.amount_cents,
    method: row.bpr_method,
    claimCount: row.claim_count,
    reversals: row.reversals,
    balanced: row.balanced,
    sourceDocumentId: row.source_document_id,
    reviewReason: row.review_reason,
    reviewOfRemittanceId: row.review_of_remittance_id,
  };
}

async function auditedRemittances(scope: Scope, requestId: string, sql: string, values: unknown[]): Promise<RemittanceSummary[]> {
  const rows = await readWithAudit(
    scope,
    { objectType: 'remittance', purpose: 'remittances', requestId },
    async (client) => (await client.query<RemittanceRow>(sql, values)).rows,
    (row) => ({ objectId: row.id, practiceId: row.practice_id }),
  );
  return rows.map(remittanceSummary);
}

export interface RemittanceQuery {
  readonly practiceId: string;
  readonly payerId?: string;
  readonly from?: Month;
  readonly to?: Month;
  readonly page: number;
  readonly requestId: string;
}

export interface RemittancePage {
  readonly remittances: readonly RemittanceSummary[];
  readonly page: number;
  readonly pages: number;
  readonly total: number;
}

/** A page of the practice's loaded remittances, newest payment first, filtered by payer and period. */
export async function listRemittances(scope: Scope, query: RemittanceQuery): Promise<RemittancePage> {
  const filters = new Filters(query.practiceId, 'r.practice_id');
  filters.raw("r.status = 'loaded'");
  if (query.payerId !== undefined) {
    filters.add((at) => `r.payer_id = ${at}`, query.payerId);
  }
  if (query.from !== undefined) {
    filters.add((at) => `r.bpr16_date >= ${at}::date`, monthStart(query.from));
  }
  if (query.to !== undefined) {
    filters.add((at) => `r.bpr16_date < ${at}::date`, monthEnd(query.to));
  }
  const { rows } = await scope.client.query<{ n: number }>(`SELECT count(*)::int AS n FROM remittance r WHERE ${filters.sql}`, filters.values);
  const total = rows[0]?.n ?? 0;
  const at = pages(total, REMITTANCES_PER_PAGE, query.page);
  const remittances = await auditedRemittances(
    scope,
    query.requestId,
    `SELECT ${REMITTANCE_COLUMNS} FROM remittance r WHERE ${filters.sql} ORDER BY r.bpr16_date DESC, r.created_at DESC, r.id LIMIT ${String(REMITTANCES_PER_PAGE)} OFFSET ${String(at.offset)}`,
    filters.values,
  );
  return { remittances, page: at.page, pages: at.pages, total };
}

export interface ProviderAdjustmentView {
  readonly position: number;
  readonly providerId: string;
  readonly reasonCode: string;
  readonly category: string;
  readonly counted: boolean;
  readonly amountCents: string;
  readonly fiscalPeriodDate: string;
  /** PHI roles only: a recoupment's reference can name a claim. */
  readonly reference: string | null;
}

/** A claim as the remittance screen lists it, with its reversal and correction links. */
export interface ClaimView {
  readonly id: string;
  readonly claimNo: number;
  readonly statusCode: string;
  readonly chargeCents: string;
  readonly paidCents: string;
  readonly patientRespCents: string | null;
  readonly lines: number;
  /** The claim this reversal reverses, and that claim's remittance. */
  readonly reversalOf: { readonly claimId: string; readonly remittanceId: string } | null;
  /** The reversal that reverses this claim. */
  readonly reversedBy: { readonly claimId: string; readonly remittanceId: string } | null;
  /** The corrected claim that supersedes this one. */
  readonly supersededBy: { readonly claimId: string; readonly remittanceId: string } | null;
  readonly identifiers: ClaimIdentifiers | null;
}

/** PHI roles only. */
export interface ClaimIdentifiers {
  readonly patientControlNumber: string;
  readonly payerClaimControlNumber: string;
  readonly patient: string;
  readonly serviceFrom: string | null;
  readonly serviceTo: string | null;
}

export interface RemittanceDetail {
  readonly remittance: RemittanceSummary & {
    readonly receiverId: string;
    readonly senderId: string;
    readonly isa13: string;
    readonly st02: string;
    readonly payeeId: string;
    readonly productionDate: string | null;
    readonly plbTotalCents: string;
  };
  readonly providerAdjustments: readonly ProviderAdjustmentView[];
  readonly claims: readonly ClaimView[];
}

interface ClaimRow {
  readonly id: string;
  readonly practice_id: string;
  readonly claim_no: number;
  readonly claim_status_code: string;
  readonly charge_cents: string;
  readonly paid_cents: string;
  readonly patient_resp_cents: string | null;
  readonly lines: number;
  readonly reversal_of_claim_id: string | null;
  readonly reversal_of_remittance_id: string | null;
  readonly reversed_by_claim_id: string | null;
  readonly reversed_by_remittance_id: string | null;
  readonly superseded_by_claim_id: string | null;
  readonly superseded_by_remittance_id: string | null;
  readonly patient_control_number: string;
  readonly payer_claim_control_number: string;
  readonly last_name: string | null;
  readonly first_name: string | null;
  readonly service_from: string | null;
  readonly service_to: string | null;
}

/** "LAST, FIRST" from the patient reference's encrypted names. */
export function patientName(cipher: PracticeCipher, lastName: string | null, firstName: string | null): string {
  const last = lastName === null ? '' : cipher.decrypt('patient_ref.last_name', lastName);
  const first = firstName === null ? '' : cipher.decrypt('patient_ref.first_name', firstName);
  return [last, first].filter((part) => part !== '').join(', ') || '(no name sent)';
}

function link(claimId: string | null, remittanceId: string | null): { claimId: string; remittanceId: string } | null {
  return claimId === null || remittanceId === null ? null : { claimId, remittanceId };
}

/** One remittance with its PLB items and claims; undefined when the practice holds no such remittance. */
export async function remittanceDetail(scope: Scope, practiceId: string, remittanceId: string, requestId: string, cipher: PracticeCipher | null): Promise<RemittanceDetail | undefined> {
  const [header] = await readWithAudit(
    scope,
    { objectType: 'remittance', purpose: 'remittances', requestId },
    async (client) =>
      (
        await client.query<RemittanceRow & { receiver_id: string; sender_id: string; isa13: string; st02: string; payee_npi: string; production_date: string | null; plb_total_cents: string }>(
          `SELECT ${REMITTANCE_COLUMNS}, r.receiver_id, r.sender_id, r.isa13, r.st02, r.payee_npi, r.production_date::text AS production_date, r.plb_total_cents::text AS plb_total_cents
             FROM remittance r WHERE r.practice_id = $1 AND r.id = $2`,
          [practiceId, remittanceId],
        )
      ).rows,
    (row) => ({ objectId: row.id, practiceId: row.practice_id }),
  );
  if (header === undefined) {
    return undefined;
  }
  const plb = await scope.client.query<{ position: number; provider_id: string; reason_code: string; category: string; counted: boolean; amount_cents: string; fiscal_period_date: string; reference: string | null }>(
    'SELECT position, provider_id, reason_code, category, counted, amount_cents::text AS amount_cents, fiscal_period_date::text AS fiscal_period_date, reference FROM provider_adjustment WHERE remittance_id = $1 ORDER BY position',
    [remittanceId],
  );
  const claims = await readWithAudit(
    scope,
    { objectType: 'claim', purpose: 'remittances', requestId },
    async (client) =>
      (
        await client.query<ClaimRow>(
          `SELECT c.id, c.practice_id, c.claim_no, c.claim_status_code, c.charge_cents::text AS charge_cents, c.paid_cents::text AS paid_cents,
                  c.patient_resp_cents::text AS patient_resp_cents, (SELECT count(*)::int FROM service_line l WHERE l.claim_id = c.id) AS lines,
                  c.reversal_of_claim_id, o.remittance_id AS reversal_of_remittance_id,
                  rb.id AS reversed_by_claim_id, rb.remittance_id AS reversed_by_remittance_id,
                  c.superseded_by_claim_id, s.remittance_id AS superseded_by_remittance_id,
                  c.patient_control_number, c.payer_claim_control_number, p.last_name, p.first_name, c.service_from::text AS service_from, c.service_to::text AS service_to
             FROM claim c
             JOIN patient_ref p ON p.id = c.patient_ref_id
             LEFT JOIN claim o ON o.id = c.reversal_of_claim_id
             LEFT JOIN claim s ON s.id = c.superseded_by_claim_id
             LEFT JOIN LATERAL (SELECT x.id, x.remittance_id FROM claim x WHERE x.reversal_of_claim_id = c.id ORDER BY x.created_at, x.id LIMIT 1) rb ON true
            WHERE c.remittance_id = $1 ORDER BY c.claim_no`,
          [remittanceId],
        )
      ).rows,
    (row) => ({ objectId: row.id, practiceId: row.practice_id }),
  );
  return {
    remittance: {
      ...remittanceSummary(header),
      receiverId: header.receiver_id,
      senderId: header.sender_id,
      isa13: header.isa13,
      st02: header.st02,
      payeeId: header.payee_npi,
      productionDate: header.production_date,
      plbTotalCents: header.plb_total_cents,
    },
    providerAdjustments: plb.rows.map((row) => ({
      position: row.position,
      providerId: row.provider_id,
      reasonCode: row.reason_code,
      category: row.category,
      counted: row.counted,
      amountCents: row.amount_cents,
      fiscalPeriodDate: row.fiscal_period_date,
      reference: cipher === null ? null : row.reference,
    })),
    claims: claims.map((row) => ({
      id: row.id,
      claimNo: row.claim_no,
      statusCode: row.claim_status_code,
      chargeCents: row.charge_cents,
      paidCents: row.paid_cents,
      patientRespCents: row.patient_resp_cents,
      lines: row.lines,
      reversalOf: link(row.reversal_of_claim_id, row.reversal_of_remittance_id),
      reversedBy: link(row.reversed_by_claim_id, row.reversed_by_remittance_id),
      supersededBy: link(row.superseded_by_claim_id, row.superseded_by_remittance_id),
      identifiers:
        cipher === null
          ? null
          : {
              patientControlNumber: cipher.decrypt('claim.patient_control_number', row.patient_control_number),
              payerClaimControlNumber: cipher.decrypt('claim.payer_claim_control_number', row.payer_claim_control_number),
              patient: patientName(cipher, row.last_name, row.first_name),
              serviceFrom: row.service_from,
              serviceTo: row.service_to,
            },
    })),
  };
}

// ---------------------------------------------------------------------------------------------------
// Claims and lines
// ---------------------------------------------------------------------------------------------------

/**
 * net: one row per adjudicated claim's lines, so a reversal followed by a correction nets to the
 * corrected claim alone (PRD 6): reversals, claims a reversal reversed and claims a correction
 * superseded are left out. all: every claim as the 835s sent it.
 */
export type ClaimsView = 'net' | 'all';

export interface ClaimLineQuery {
  readonly practiceId: string;
  readonly view: ClaimsView;
  readonly payerId?: string;
  readonly remittanceId?: string;
  readonly claimId?: string;
  readonly patientRefId?: string;
  readonly procedureCode?: string;
  /** Service months. */
  readonly from?: Month;
  readonly to?: Month;
  readonly page: number;
  readonly requestId: string;
}

/** The five line stages plus unpriced (PRD 8, The status machine; PRD 7: "status chips"). */
export const LINE_STATUSES = ['flagged', 'validated', 'actionable', 'payer_approved', 'recovered', 'unpriced'] as const;
export type LineStatus = (typeof LINE_STATUSES)[number];

/** One row of the Claims and lines table: a service line, or a claim sent without lines. */
export interface ClaimLine {
  readonly claimId: string;
  readonly lineId: string | null;
  readonly lineNo: number | null;
  readonly remittanceId: string;
  readonly payerName: string;
  readonly paymentDate: string;
  readonly claimStatusCode: string;
  readonly reversal: boolean;
  readonly reversed: boolean;
  readonly superseded: boolean;
  readonly procedureQualifier: string | null;
  readonly procedureCode: string | null;
  readonly modifiers: readonly string[];
  readonly units: string | null;
  readonly chargeCents: string;
  readonly paidCents: string;
  readonly patientShareCents: string | null;
  readonly observedAllowedCents: string | null;
  readonly observedAllowedBasis: string | null;
  readonly observedAllowedAllocated: boolean;
  /** From the line's pricing in effect; null when no run in effect priced it, or it left the line unpriced. */
  readonly expectedAllowedCents: string | null;
  /** The stage the line has reached (its latest stage event), else unpriced from its pricing in effect; null otherwise. */
  readonly status: LineStatus | null;
  /** That run, and what it found: null when no complete run has priced the line. */
  readonly pricing: { readonly pricingRunId: string; readonly varianceCents: string | null; readonly unpricedReason: string | null } | null;
  readonly patientRefId: string;
  readonly identifiers: (ClaimIdentifiers & { readonly serviceDate: string | null; readonly serviceDateTo: string | null }) | null;
}

export interface ClaimLinePage {
  readonly rows: readonly ClaimLine[];
  readonly page: number;
  readonly pages: number;
  readonly total: number;
}

interface ClaimLineRow {
  readonly claim_id: string;
  readonly practice_id: string;
  readonly line_id: string | null;
  readonly line_no: number | null;
  readonly remittance_id: string;
  readonly payer_name: string;
  readonly payment_date: string;
  readonly claim_status_code: string;
  readonly reversed: boolean;
  readonly superseded: boolean;
  readonly procedure_qualifier: string | null;
  readonly procedure_code: string | null;
  readonly modifiers: string[] | null;
  readonly units: string | null;
  readonly charge_cents: string;
  readonly paid_cents: string;
  readonly patient_share_cents: string | null;
  readonly observed_allowed_cents: string | null;
  readonly observed_allowed_basis: string | null;
  readonly observed_allowed_allocated: boolean | null;
  readonly patient_ref_id: string;
  readonly patient_control_number: string;
  readonly payer_claim_control_number: string;
  readonly last_name: string | null;
  readonly first_name: string | null;
  readonly service_from: string | null;
  readonly service_to: string | null;
  readonly service_date: string | null;
  readonly service_date_to: string | null;
  readonly pricing_run_id: string | null;
  readonly expected_allowed_cents: string | null;
  readonly variance_cents: string | null;
  readonly unpriced_reason: string | null;
  readonly stage: string | null;
}

/**
 * The line's pricing in effect (PRD 7, Claims and lines: expected allowed, status): its priced line in
 * the run in effect that took effect last (a complete first run, or a re-run once accepted, never one
 * a re-run replaced; docs/adr/0037), and its stage now (its latest stage event, PRD 8).
 */
const LATEST_PRICING = `LEFT JOIN LATERAL (
    SELECT p.pricing_run_id, p.expected_allowed_cents::text AS expected_allowed_cents, p.variance_cents::text AS variance_cents, p.unpriced_reason
      FROM priced_line p JOIN pricing_run pr ON pr.id = p.pricing_run_id
     WHERE p.practice_id = l.practice_id AND p.service_line_id = l.id AND ${RUN_IN_EFFECT('pr')}
     ORDER BY ${IN_EFFECT_SINCE('pr')} DESC, pr.id DESC
     LIMIT 1
  ) priced ON true
  LEFT JOIN LATERAL (
    SELECT s.stage FROM line_status s WHERE s.practice_id = l.practice_id AND s.service_line_id = l.id ORDER BY s.seq DESC LIMIT 1
  ) staged ON true`;

const PRICING_COLUMNS = 'priced.pricing_run_id, priced.expected_allowed_cents, priced.variance_cents, priced.unpriced_reason, staged.stage';

function pricingOf(row: Pick<ClaimLineRow, 'pricing_run_id' | 'expected_allowed_cents' | 'variance_cents' | 'unpriced_reason' | 'stage'>): Pick<ClaimLine, 'expectedAllowedCents' | 'status' | 'pricing'> {
  const result = row.pricing_run_id === null ? null : { expectedAllowedCents: row.expected_allowed_cents, varianceCents: row.variance_cents, unpricedReason: row.unpriced_reason };
  return {
    expectedAllowedCents: row.pricing_run_id === null ? null : row.expected_allowed_cents,
    status: lineStatusOf(row.stage, result),
    pricing: row.pricing_run_id === null ? null : { pricingRunId: row.pricing_run_id, varianceCents: row.variance_cents, unpricedReason: row.unpriced_reason },
  };
}

const NET = `c.claim_status_code <> '${REVERSAL_STATUS_CODE}' AND c.superseded_by_claim_id IS NULL AND NOT EXISTS (SELECT 1 FROM claim x WHERE x.reversal_of_claim_id = c.id)`;

const CLAIM_LINE_FROM = `FROM claim c
  JOIN remittance r ON r.id = c.remittance_id
  JOIN patient_ref p ON p.id = c.patient_ref_id
  LEFT JOIN service_line l ON l.claim_id = c.id`;

function claimLineFilters(query: ClaimLineQuery): Filters {
  const filters = new Filters(query.practiceId, 'c.practice_id');
  if (query.view === 'net') {
    filters.raw(NET);
  }
  if (query.payerId !== undefined) {
    filters.add((at) => `r.payer_id = ${at}`, query.payerId);
  }
  if (query.remittanceId !== undefined) {
    filters.add((at) => `c.remittance_id = ${at}`, query.remittanceId);
  }
  if (query.claimId !== undefined) {
    filters.add((at) => `c.id = ${at}`, query.claimId);
  }
  if (query.patientRefId !== undefined) {
    filters.add((at) => `c.patient_ref_id = ${at}`, query.patientRefId);
  }
  if (query.procedureCode !== undefined) {
    filters.add((at) => `l.procedure_code = ${at}`, query.procedureCode);
  }
  if (query.from !== undefined) {
    filters.add((at) => `coalesce(l.service_date, c.service_from) >= ${at}::date`, monthStart(query.from));
  }
  if (query.to !== undefined) {
    filters.add((at) => `coalesce(l.service_date, c.service_from) < ${at}::date`, monthEnd(query.to));
  }
  return filters;
}

/** A page of the Claims and lines table, newest service first. */
export async function listClaimLines(scope: Scope, query: ClaimLineQuery, cipher: PracticeCipher | null): Promise<ClaimLinePage> {
  const filters = claimLineFilters(query);
  const { rows } = await scope.client.query<{ n: number }>(`SELECT count(*)::int AS n ${CLAIM_LINE_FROM} WHERE ${filters.sql}`, filters.values);
  const total = rows[0]?.n ?? 0;
  const at = pages(total, LINES_PER_PAGE, query.page);
  const found = await readWithAudit(
    scope,
    { objectType: 'claim', purpose: 'claims_and_lines', requestId: query.requestId },
    async (client) =>
      (
        await client.query<ClaimLineRow>(
          `SELECT c.id AS claim_id, c.practice_id, l.id AS line_id, l.line_no, c.remittance_id, r.payer_name, r.bpr16_date::text AS payment_date, c.claim_status_code,
                  EXISTS (SELECT 1 FROM claim x WHERE x.reversal_of_claim_id = c.id) AS reversed, c.superseded_by_claim_id IS NOT NULL AS superseded,
                  l.procedure_qualifier, l.procedure_code, l.modifiers, l.units::text AS units,
                  coalesce(l.charge_cents, c.charge_cents)::text AS charge_cents, coalesce(l.paid_cents, c.paid_cents)::text AS paid_cents,
                  coalesce(l.patient_share_cents, c.patient_resp_cents)::text AS patient_share_cents,
                  l.observed_allowed_cents::text AS observed_allowed_cents, l.observed_allowed_basis, l.observed_allowed_allocated,
                  c.patient_ref_id, c.patient_control_number, c.payer_claim_control_number, p.last_name, p.first_name,
                  c.service_from::text AS service_from, c.service_to::text AS service_to, l.service_date::text AS service_date, l.service_date_to::text AS service_date_to,
                  ${PRICING_COLUMNS}
             ${CLAIM_LINE_FROM}
             ${LATEST_PRICING}
            WHERE ${filters.sql}
            ORDER BY coalesce(l.service_date, c.service_from) DESC NULLS LAST, r.bpr16_date DESC, c.id, l.line_no NULLS FIRST
            LIMIT ${String(LINES_PER_PAGE)} OFFSET ${String(at.offset)}`,
          filters.values,
        )
      ).rows,
    (row) => ({ objectId: row.claim_id, practiceId: row.practice_id }),
  );
  return {
    rows: found.map((row) => ({
      claimId: row.claim_id,
      lineId: row.line_id,
      lineNo: row.line_no,
      remittanceId: row.remittance_id,
      payerName: row.payer_name,
      paymentDate: row.payment_date,
      claimStatusCode: row.claim_status_code,
      reversal: row.claim_status_code === REVERSAL_STATUS_CODE,
      reversed: row.reversed,
      superseded: row.superseded,
      procedureQualifier: row.procedure_qualifier,
      procedureCode: row.procedure_code,
      modifiers: row.modifiers ?? [],
      units: row.units,
      chargeCents: row.charge_cents,
      paidCents: row.paid_cents,
      patientShareCents: row.patient_share_cents,
      observedAllowedCents: row.observed_allowed_cents,
      observedAllowedBasis: row.observed_allowed_basis,
      observedAllowedAllocated: row.observed_allowed_allocated === true,
      ...pricingOf(row),
      patientRefId: row.patient_ref_id,
      identifiers:
        cipher === null
          ? null
          : {
              patientControlNumber: cipher.decrypt('claim.patient_control_number', row.patient_control_number),
              payerClaimControlNumber: cipher.decrypt('claim.payer_claim_control_number', row.payer_claim_control_number),
              patient: patientName(cipher, row.last_name, row.first_name),
              serviceFrom: row.service_from,
              serviceTo: row.service_to,
              serviceDate: row.service_date,
              serviceDateTo: row.service_date_to,
            },
    })),
    page: at.page,
    pages: at.pages,
    total,
  };
}

/**
 * The practice's claim with this payer claim control number (by its keyed hash): the newest the payer
 * adjudicated. A reversal repeats the number of the claim it reverses, so it is found only when no
 * adjudicated claim has the number; the adjudicated one shows it is reversed and what superseded it.
 */
export async function claimByPayerControlNumber(scope: Scope, practiceId: string, cipher: PracticeCipher, payerClaimControlNumber: string): Promise<string | undefined> {
  const { rows } = await scope.client.query<{ id: string }>(
    `SELECT c.id FROM claim c JOIN remittance r ON r.id = c.remittance_id
      WHERE c.practice_id = $1 AND c.payer_claim_control_number_hash = $2
      ORDER BY c.claim_status_code = '${REVERSAL_STATUS_CODE}', r.bpr16_date DESC, c.created_at DESC, c.id LIMIT 1`,
    [practiceId, cipher.lookupHash('claim.payer_claim_control_number', payerClaimControlNumber)],
  );
  return rows[0]?.id;
}

// ---------------------------------------------------------------------------------------------------
// One line: its facts, its latest pricing and its notes
// ---------------------------------------------------------------------------------------------------

export interface LineAdjustment {
  readonly level: 'claim' | 'line';
  readonly groupCode: string;
  readonly reasonCode: string;
  readonly unknownCode: boolean;
  readonly amountCents: string;
  readonly quantity: string | null;
}

export interface LineNoteView {
  readonly id: string;
  readonly note: string;
  readonly createdAt: string;
  readonly createdBy: string;
}

export interface LineDetail {
  readonly line: Omit<ClaimLine, 'identifiers' | 'lineId'> & {
    readonly lineId: string;
    readonly revenueCode: string | null;
    readonly originalUnits: string | null;
    readonly lineAllowedCents: string | null;
    readonly renderingNpi: string | null;
    readonly planKey: string;
    readonly identifiers: ClaimLine['identifiers'];
  };
  readonly adjustments: readonly LineAdjustment[];
  /** PHI roles only. */
  readonly notes: readonly LineNoteView[] | null;
}

/** One service line with its claim's facts, its adjustments and (for PHI roles) its notes. */
export async function lineDetail(scope: Scope, practiceId: string, lineId: string, requestId: string, cipher: PracticeCipher | null): Promise<LineDetail | undefined> {
  const [row] = await readWithAudit(
    scope,
    { objectType: 'service_line', purpose: 'line_trace', requestId },
    async (client) =>
      (
        await client.query<ClaimLineRow & { revenue_code: string | null; original_units: string | null; line_allowed_cents: string | null; rendering_npi: string | null; plan_key: string; line_id: string }>(
          `SELECT c.id AS claim_id, l.practice_id, l.id AS line_id, l.line_no, c.remittance_id, r.payer_name, r.bpr16_date::text AS payment_date, c.claim_status_code,
                  EXISTS (SELECT 1 FROM claim x WHERE x.reversal_of_claim_id = c.id) AS reversed, c.superseded_by_claim_id IS NOT NULL AS superseded,
                  l.procedure_qualifier, l.procedure_code, l.modifiers, l.units::text AS units, l.charge_cents::text AS charge_cents, l.paid_cents::text AS paid_cents,
                  l.patient_share_cents::text AS patient_share_cents, l.observed_allowed_cents::text AS observed_allowed_cents, l.observed_allowed_basis,
                  l.observed_allowed_allocated, c.patient_ref_id, c.patient_control_number, c.payer_claim_control_number, p.last_name, p.first_name,
                  c.service_from::text AS service_from, c.service_to::text AS service_to, l.service_date::text AS service_date, l.service_date_to::text AS service_date_to,
                  l.revenue_code, l.original_units::text AS original_units, l.line_allowed_cents::text AS line_allowed_cents, l.rendering_npi, pl.plan_key,
                  ${PRICING_COLUMNS}
             FROM service_line l JOIN claim c ON c.id = l.claim_id JOIN remittance r ON r.id = c.remittance_id JOIN patient_ref p ON p.id = c.patient_ref_id
             JOIN plan pl ON pl.id = l.payer_plan_key
             ${LATEST_PRICING}
            WHERE l.practice_id = $1 AND l.id = $2`,
          [practiceId, lineId],
        )
      ).rows,
    (found) => ({ objectId: found.line_id, practiceId: found.practice_id }),
  );
  if (row === undefined) {
    return undefined;
  }
  const adjustments = await scope.client.query<{ service_line_id: string | null; group_code: string; reason_code: string; unknown_code: boolean; amount_cents: string; quantity: string | null }>(
    `SELECT service_line_id, group_code, reason_code, unknown_code, amount_cents::text AS amount_cents, quantity::text AS quantity FROM adjustment
      WHERE claim_id = $1 AND (service_line_id = $2 OR service_line_id IS NULL) ORDER BY service_line_id NULLS FIRST, position`,
    [row.claim_id, lineId],
  );
  const notes =
    cipher === null
      ? null
      : (
          await readWithAudit(
            scope,
            { objectType: 'line_note', purpose: 'line_trace', requestId },
            async (client) =>
              (
                await client.query<{ id: string; practice_id: string; note: string; created_at: Date; email: string | null }>(
                  'SELECT n.id, n.practice_id, n.note, n.created_at, u.email FROM line_note n LEFT JOIN "user" u ON u.id = n.created_by WHERE n.service_line_id = $1 ORDER BY n.created_at, n.id',
                  [lineId],
                )
              ).rows,
            (note) => ({ objectId: note.id, practiceId: note.practice_id }),
          )
        ).map((note) => ({ id: note.id, note: cipher.decrypt('line_note.note', note.note), createdAt: note.created_at.toISOString(), createdBy: note.email ?? 'a member of the practice' }));
  return {
    line: {
      claimId: row.claim_id,
      lineId: row.line_id,
      lineNo: row.line_no,
      remittanceId: row.remittance_id,
      payerName: row.payer_name,
      paymentDate: row.payment_date,
      claimStatusCode: row.claim_status_code,
      reversal: row.claim_status_code === REVERSAL_STATUS_CODE,
      reversed: row.reversed,
      superseded: row.superseded,
      procedureQualifier: row.procedure_qualifier,
      procedureCode: row.procedure_code,
      modifiers: row.modifiers ?? [],
      units: row.units,
      chargeCents: row.charge_cents,
      paidCents: row.paid_cents,
      patientShareCents: row.patient_share_cents,
      observedAllowedCents: row.observed_allowed_cents,
      observedAllowedBasis: row.observed_allowed_basis,
      observedAllowedAllocated: row.observed_allowed_allocated === true,
      ...pricingOf(row),
      patientRefId: row.patient_ref_id,
      revenueCode: row.revenue_code,
      originalUnits: row.original_units,
      lineAllowedCents: row.line_allowed_cents,
      renderingNpi: row.rendering_npi,
      planKey: row.plan_key,
      identifiers:
        cipher === null
          ? null
          : {
              patientControlNumber: cipher.decrypt('claim.patient_control_number', row.patient_control_number),
              payerClaimControlNumber: cipher.decrypt('claim.payer_claim_control_number', row.payer_claim_control_number),
              patient: patientName(cipher, row.last_name, row.first_name),
              serviceFrom: row.service_from,
              serviceTo: row.service_to,
              serviceDate: row.service_date,
              serviceDateTo: row.service_date_to,
            },
    },
    adjustments: adjustments.rows.map((item) => ({
      level: item.service_line_id === null ? 'claim' : 'line',
      groupCode: item.group_code,
      reasonCode: item.reason_code,
      unknownCode: item.unknown_code,
      amountCents: item.amount_cents,
      quantity: item.quantity,
    })),
    notes,
  };
}

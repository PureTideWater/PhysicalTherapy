import {
  AgreementInvariantError,
  type AgreementResolution,
  ContractDataError,
  PricingRefusedError,
  agreementResolver,
  assertPracticePricingAllowed,
  dollarsWaitingOnMapping,
  loadAgreementRecords,
} from '@tp/contracts';
import { type MappingKind, type PracticeScope, type ScopeClient, type VersionStatus, readWithAudit } from '@tp/db/runtime';
import { centsToString } from '@tp/money';

/**
 * The Payer and plan mapping and Coverage screens' reads (PRD 5, J6; PRD 6, Payer and plan mapping;
 * PRD 7, Payer and plan mapping and Coverage; test matrix MAP-01 to MAP-05). Every row returned is an
 * audited read (readWithAudit: payers, plans, mappings and contracts are PHI tables); totals are
 * aggregates and return no row. A line waits on mapping when no mapping of its plan covers its service
 * date, the same rule as packages/contracts' dollarsWaitingOnMapping and the resolver's NO_MAPPING.
 * Amounts are integer cents as text.
 */

type Scope = PracticeScope<ScopeClient>;

export const PLANS_PER_PAGE = 25;

/** A line with no mapping of its plan covering its service date (a line without a date waits too). */
const UNCOVERED = `NOT EXISTS (
  SELECT 1 FROM payer_plan_mapping m
   WHERE m.plan_id = l.payer_plan_key AND l.service_date IS NOT NULL
     AND m.effective_from <= l.service_date AND (m.effective_to IS NULL OR l.service_date < m.effective_to))`;

export interface Totals {
  readonly lines: number;
  readonly claims: number;
  readonly chargeCents: string;
  readonly paidCents: string;
}

interface TotalsRow {
  readonly lines: number;
  readonly claims: number;
  readonly charge_cents: string;
  readonly paid_cents: string;
}

const totalsOf = (row: TotalsRow | undefined): Totals => ({ lines: row?.lines ?? 0, claims: row?.claims ?? 0, chargeCents: row?.charge_cents ?? '0', paidCents: row?.paid_cents ?? '0' });

/** The dollars waiting on mappings, for the whole practice (the screens' headline). */
export async function waitingTotals(scope: Scope, practiceId: string): Promise<Totals> {
  const { rows } = await scope.client.query<TotalsRow>(
    `SELECT count(*)::int AS lines, count(DISTINCT l.claim_id)::int AS claims, coalesce(sum(l.charge_cents), 0)::text AS charge_cents, coalesce(sum(l.paid_cents), 0)::text AS paid_cents
       FROM service_line l WHERE l.practice_id = $1 AND ${UNCOVERED}`,
    [practiceId],
  );
  return totalsOf(rows[0]);
}

/** Every line of the practice. */
export async function lineTotals(scope: Scope, practiceId: string): Promise<Totals> {
  const { rows } = await scope.client.query<TotalsRow>(
    `SELECT count(*)::int AS lines, count(DISTINCT l.claim_id)::int AS claims, coalesce(sum(l.charge_cents), 0)::text AS charge_cents, coalesce(sum(l.paid_cents), 0)::text AS paid_cents
       FROM service_line l WHERE l.practice_id = $1`,
    [practiceId],
  );
  return totalsOf(rows[0]);
}

export type PlanStatus = 'unmapped' | 'partly_mapped' | 'mapped';
export type PlanView = 'unmapped' | 'mapped' | 'all';

/** A contract version as a mapping names it. */
export interface VersionLabel {
  readonly versionId: string;
  readonly contractId: string;
  readonly contractTitle: string;
  readonly versionNo: number;
  readonly status: VersionStatus;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
}

export interface MappingView {
  readonly id: string;
  readonly kind: MappingKind;
  readonly version: VersionLabel | null;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly supersedesId: string | null;
}

export interface PlanSummary {
  readonly id: string;
  readonly payerId: string;
  readonly payerName: string;
  readonly payerIdentifier: string;
  readonly planKey: string;
  readonly planName: string | null;
  readonly medicareAdvantage: boolean;
  readonly totals: Totals;
  readonly waiting: Totals;
  readonly status: PlanStatus;
  /** The mappings no correction supersedes. */
  readonly current: readonly MappingView[];
}

export interface PlanPage {
  readonly plans: readonly PlanSummary[];
  readonly total: number;
  readonly page: number;
  readonly pages: number;
}

function pageOf(total: number, per: number, page: number): { page: number; pages: number; offset: number } {
  const pages = Math.max(1, Math.ceil(total / per));
  const current = Math.min(Math.max(1, page), pages);
  return { page: current, pages, offset: (current - 1) * per };
}

interface PlanRow {
  readonly id: string;
  readonly practice_id: string;
  readonly payer_id: string;
  readonly payer_name: string;
  readonly payer_id_raw: string;
  readonly plan_key: string;
  readonly plan_name: string | null;
  readonly is_medicare_advantage: boolean;
  readonly lines: number;
  readonly claims: number;
  readonly charge_cents: string;
  readonly paid_cents: string;
  readonly waiting_lines: number;
  readonly waiting_claims: number;
  readonly waiting_charge_cents: string;
  readonly waiting_paid_cents: string;
  readonly mapped: boolean;
}

const PLAN_STATS = `
  SELECT l.payer_plan_key AS plan_id, count(*)::int AS lines, count(DISTINCT l.claim_id)::int AS claims, sum(l.charge_cents) AS charge, sum(l.paid_cents) AS paid,
         (count(*) FILTER (WHERE ${UNCOVERED}))::int AS waiting_lines, (count(DISTINCT l.claim_id) FILTER (WHERE ${UNCOVERED}))::int AS waiting_claims,
         coalesce(sum(l.charge_cents) FILTER (WHERE ${UNCOVERED}), 0) AS waiting_charge, coalesce(sum(l.paid_cents) FILTER (WHERE ${UNCOVERED}), 0) AS waiting_paid
    FROM service_line l WHERE l.practice_id = $1 GROUP BY l.payer_plan_key`;

const PLAN_COLUMNS = `p.id, p.practice_id, p.payer_id, y.name_raw AS payer_name, y.payer_id_raw, p.plan_key, p.name AS plan_name, p.is_medicare_advantage,
  coalesce(s.lines, 0) AS lines, coalesce(s.claims, 0) AS claims, coalesce(s.charge, 0)::text AS charge_cents, coalesce(s.paid, 0)::text AS paid_cents,
  coalesce(s.waiting_lines, 0) AS waiting_lines, coalesce(s.waiting_claims, 0) AS waiting_claims,
  coalesce(s.waiting_charge, 0)::text AS waiting_charge_cents, coalesce(s.waiting_paid, 0)::text AS waiting_paid_cents,
  EXISTS (SELECT 1 FROM payer_plan_mapping m WHERE m.plan_id = p.id) AS mapped`;

const VIEW_FILTER: Readonly<Record<PlanView, string>> = {
  unmapped: 'AND (NOT EXISTS (SELECT 1 FROM payer_plan_mapping m WHERE m.plan_id = p.id) OR coalesce(s.waiting_lines, 0) > 0)',
  mapped: 'AND EXISTS (SELECT 1 FROM payer_plan_mapping m WHERE m.plan_id = p.id)',
  all: '',
};

interface VersionLabelRow {
  readonly id: string;
  readonly practice_id: string;
  readonly contract_id: string;
  readonly title: string;
  readonly version_no: number;
  readonly status: VersionStatus;
  readonly effective_from: string;
  readonly effective_to: string | null;
}

/** The contract versions mappings name, with their contracts' titles. */
export async function versionLabels(scope: Scope, practiceId: string, versionIds: readonly string[], requestId: string, purpose: string): Promise<Map<string, VersionLabel>> {
  if (versionIds.length === 0) {
    return new Map();
  }
  const rows = await readWithAudit(
    scope,
    { objectType: 'contract_version', purpose, requestId },
    async (client) =>
      (
        await client.query<VersionLabelRow>(
          `SELECT v.id, v.practice_id, v.contract_id, c.title, v.version_no, v.status, v.effective_from::text AS effective_from, v.effective_to::text AS effective_to
             FROM contract_version v JOIN contract c ON c.id = v.contract_id WHERE v.practice_id = $1 AND v.id = ANY ($2::uuid[])`,
          [practiceId, [...new Set(versionIds)]],
        )
      ).rows,
    (row) => ({ objectId: row.id, practiceId: row.practice_id }),
  );
  return new Map(
    rows.map((row) => [
      row.id,
      { versionId: row.id, contractId: row.contract_id, contractTitle: row.title, versionNo: row.version_no, status: row.status, effectiveFrom: row.effective_from, effectiveTo: row.effective_to },
    ]),
  );
}

interface MappingRow {
  readonly id: string;
  readonly practice_id: string;
  readonly plan_id: string;
  readonly mapping_kind: MappingKind;
  readonly contract_version_id: string | null;
  readonly effective_from: string;
  readonly effective_to: string | null;
  readonly supersedes_id: string | null;
  readonly superseded_by: string | null;
  readonly mapped_by_email: string | null;
  readonly created_at: Date;
}

async function mappingRows(scope: Scope, practiceId: string, planIds: readonly string[], requestId: string): Promise<MappingRow[]> {
  if (planIds.length === 0) {
    return [];
  }
  return readWithAudit(
    scope,
    { objectType: 'payer_plan_mapping', purpose: 'payer_plan_mapping', requestId },
    async (client) =>
      (
        await client.query<MappingRow>(
          `SELECT m.id, m.practice_id, m.plan_id, m.mapping_kind, m.contract_version_id, m.effective_from::text AS effective_from, m.effective_to::text AS effective_to,
                  m.supersedes_id, (SELECT c.id FROM payer_plan_mapping c WHERE c.supersedes_id = m.id ORDER BY c.created_at, c.id LIMIT 1) AS superseded_by,
                  u.email AS mapped_by_email, m.created_at
             FROM payer_plan_mapping m LEFT JOIN "user" u ON u.id = m.mapped_by
            WHERE m.practice_id = $1 AND m.plan_id = ANY ($2::uuid[])
            ORDER BY m.plan_id, m.effective_from, m.created_at, m.id`,
          [practiceId, [...planIds]],
        )
      ).rows,
    (row) => ({ objectId: row.id, practiceId: row.practice_id }),
  );
}

function mappingView(row: MappingRow, labels: ReadonlyMap<string, VersionLabel>): MappingView {
  return {
    id: row.id,
    kind: row.mapping_kind,
    version: row.contract_version_id === null ? null : (labels.get(row.contract_version_id) ?? null),
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    supersedesId: row.supersedes_id,
  };
}

function planStatus(row: PlanRow): PlanStatus {
  if (!row.mapped) {
    return 'unmapped';
  }
  return row.waiting_lines > 0 ? 'partly_mapped' : 'mapped';
}

function planSummary(row: PlanRow, current: readonly MappingView[]): PlanSummary {
  return {
    id: row.id,
    payerId: row.payer_id,
    payerName: row.payer_name,
    payerIdentifier: row.payer_id_raw,
    planKey: row.plan_key,
    planName: row.plan_name,
    medicareAdvantage: row.is_medicare_advantage,
    totals: { lines: row.lines, claims: row.claims, chargeCents: row.charge_cents, paidCents: row.paid_cents },
    waiting: { lines: row.waiting_lines, claims: row.waiting_claims, chargeCents: row.waiting_charge_cents, paidCents: row.waiting_paid_cents },
    status: planStatus(row),
    current,
  };
}

export interface PlanQuery {
  readonly practiceId: string;
  readonly view: PlanView;
  readonly payerId?: string;
  readonly page: number;
  readonly requestId: string;
}

/** The practice's payer and plan combinations, the ones waiting on mapping first, with their mappings. */
export async function listPlans(scope: Scope, query: PlanQuery): Promise<PlanPage> {
  const values: unknown[] = [query.practiceId];
  let payerFilter = '';
  if (query.payerId !== undefined) {
    values.push(query.payerId);
    payerFilter = `AND p.payer_id = $${String(values.length)}`;
  }
  const where = `WHERE p.practice_id = $1 ${payerFilter} ${VIEW_FILTER[query.view]}`;
  const counted = await scope.client.query<{ total: number }>(`WITH s AS (${PLAN_STATS}) SELECT count(*)::int AS total FROM plan p LEFT JOIN s ON s.plan_id = p.id ${where}`, values);
  const total = counted.rows[0]?.total ?? 0;
  const { page, pages, offset } = pageOf(total, PLANS_PER_PAGE, query.page);
  const rows = await readWithAudit(
    scope,
    { objectType: 'plan', purpose: 'payer_plan_mapping', requestId: query.requestId },
    async (client) =>
      (
        await client.query<PlanRow>(
          `WITH s AS (${PLAN_STATS})
           SELECT ${PLAN_COLUMNS} FROM plan p JOIN payer y ON y.id = p.payer_id LEFT JOIN s ON s.plan_id = p.id
           ${where}
           ORDER BY coalesce(s.waiting_charge, 0) DESC, y.name_raw, p.plan_key, p.id
           LIMIT ${String(PLANS_PER_PAGE)} OFFSET ${String(offset)}`,
          values,
        )
      ).rows,
    (row) => ({ objectId: row.id, practiceId: row.practice_id }),
  );
  const mappings = await mappingRows(
    scope,
    query.practiceId,
    rows.map((row) => row.id),
    query.requestId,
  );
  const labels = await versionLabels(
    scope,
    query.practiceId,
    mappings.flatMap((mapping) => (mapping.contract_version_id === null ? [] : [mapping.contract_version_id])),
    query.requestId,
    'payer_plan_mapping',
  );
  return {
    plans: rows.map((row) =>
      planSummary(
        row,
        mappings.filter((mapping) => mapping.plan_id === row.id && mapping.superseded_by === null).map((mapping) => mappingView(mapping, labels)),
      ),
    ),
    total,
    page,
    pages,
  };
}

// ---------------------------------------------------------------------------------------------------
// One plan
// ---------------------------------------------------------------------------------------------------

export interface MappingHistoryEntry extends MappingView {
  readonly supersededById: string | null;
  readonly mappedBy: string;
  readonly mappedAt: string;
}

/** How a group of the plan's lines resolves against the agreement now (PRD 11, step 1). */
export interface ResolutionBucket {
  readonly outcome: AgreementResolution['outcome'] | 'ENGINE_ERROR' | 'NO_SERVICE_DATE';
  readonly version: VersionLabel | null;
  readonly lines: number;
  readonly chargeCents: string;
}

export interface PlanDetail {
  readonly plan: PlanSummary;
  readonly history: readonly MappingHistoryEntry[];
  /** Signed-off versions of the plan's payer's contracts: what the plan can be mapped to. */
  readonly targets: readonly VersionLabel[];
  readonly resolution: readonly ResolutionBucket[];
}

/** The signed-off versions of a payer's contracts. */
async function signedOffVersions(scope: Scope, practiceId: string, payerId: string, requestId: string): Promise<VersionLabel[]> {
  const rows = await readWithAudit(
    scope,
    { objectType: 'contract_version', purpose: 'payer_plan_mapping', requestId },
    async (client) =>
      (
        await client.query<VersionLabelRow>(
          `SELECT v.id, v.practice_id, v.contract_id, c.title, v.version_no, v.status, v.effective_from::text AS effective_from, v.effective_to::text AS effective_to
             FROM contract_version v JOIN contract c ON c.id = v.contract_id
            WHERE v.practice_id = $1 AND c.payer_id = $2 AND v.status = 'signed_off'
            ORDER BY c.title, v.version_no`,
          [practiceId, payerId],
        )
      ).rows,
    (row) => ({ objectId: row.id, practiceId: row.practice_id }),
  );
  return rows.map((row) => ({
    versionId: row.id,
    contractId: row.contract_id,
    contractTitle: row.title,
    versionNo: row.version_no,
    status: row.status,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
  }));
}

interface LineGroupRow {
  readonly service_date: string | null;
  readonly procedure_code: string;
  readonly modifiers: string[] | null;
  readonly place_of_service: string | null;
  readonly lines: number;
  readonly charge_cents: string;
}

/**
 * How the plan's lines resolve against the practice's agreements today: the lines grouped by what
 * resolution reads (service date, code, modifiers, place of service), each group resolved once by the
 * pure resolver over the loaded records, and the groups added up by outcome and version. A pricing
 * run pins the same resolution; this is the view before one exists.
 */
async function planResolution(scope: Scope, practiceId: string, planId: string, requestId: string): Promise<ResolutionBucket[]> {
  const groups = await scope.client.query<LineGroupRow>(
    `SELECT l.service_date::text AS service_date, l.procedure_code, l.modifiers, l.place_of_service, count(*)::int AS lines, sum(l.charge_cents)::text AS charge_cents
       FROM service_line l WHERE l.practice_id = $1 AND l.payer_plan_key = $2
      GROUP BY l.service_date, l.procedure_code, l.modifiers, l.place_of_service`,
    [practiceId, planId],
  );
  if (groups.rows.length === 0) {
    return [];
  }
  const records = await loadAgreementRecords(scope, { practiceId, requestId, purpose: 'payer_plan_mapping' }, [planId]);
  const resolver = agreementResolver(records);
  const buckets = new Map<string, { outcome: ResolutionBucket['outcome']; versionId: string | null; lines: number; charge: bigint }>();
  for (const group of groups.rows) {
    let outcome: ResolutionBucket['outcome'];
    let versionId: string | null = null;
    if (group.service_date === null) {
      outcome = 'NO_SERVICE_DATE';
    } else {
      try {
        const resolution = resolver.resolve({
          planId,
          serviceDate: group.service_date,
          procedureCode: group.procedure_code,
          modifiers: group.modifiers ?? [],
          placeOfService: group.place_of_service,
        });
        outcome = resolution.outcome;
        // The version that prices (or would), else the version the mapping names.
        versionId = 'version' in resolution ? resolution.version.id : 'mapping' in resolution ? resolution.mapping.contractVersionId : null;
      } catch (error) {
        if (!(error instanceof AgreementInvariantError || error instanceof ContractDataError)) {
          throw error;
        }
        outcome = 'ENGINE_ERROR';
      }
    }
    const key = `${outcome}:${versionId ?? ''}`;
    const bucket = buckets.get(key) ?? { outcome, versionId, lines: 0, charge: 0n };
    bucket.lines += group.lines;
    bucket.charge += BigInt(group.charge_cents);
    buckets.set(key, bucket);
  }
  const labels = await versionLabels(
    scope,
    practiceId,
    [...buckets.values()].flatMap((bucket) => (bucket.versionId === null ? [] : [bucket.versionId])),
    requestId,
    'payer_plan_mapping',
  );
  return [...buckets.values()]
    .sort((a, b) => (a.charge === b.charge ? a.outcome.localeCompare(b.outcome) : a.charge > b.charge ? -1 : 1))
    .map((bucket) => ({
      outcome: bucket.outcome,
      version: bucket.versionId === null ? null : (labels.get(bucket.versionId) ?? null),
      lines: bucket.lines,
      chargeCents: bucket.charge.toString(),
    }));
}

/** One plan: its totals, every mapping it ever had, what it can be mapped to, and how its lines resolve now. */
export async function planDetail(scope: Scope, practiceId: string, planId: string, requestId: string): Promise<PlanDetail | undefined> {
  const [row] = await readWithAudit(
    scope,
    { objectType: 'plan', purpose: 'payer_plan_mapping', requestId },
    async (client) =>
      (await client.query<PlanRow>(`WITH s AS (${PLAN_STATS}) SELECT ${PLAN_COLUMNS} FROM plan p JOIN payer y ON y.id = p.payer_id LEFT JOIN s ON s.plan_id = p.id WHERE p.practice_id = $1 AND p.id = $2`, [practiceId, planId]))
        .rows,
    (found) => ({ objectId: found.id, practiceId: found.practice_id }),
  );
  if (row === undefined) {
    return undefined;
  }
  const mappings = await mappingRows(scope, practiceId, [planId], requestId);
  const targets = await signedOffVersions(scope, practiceId, row.payer_id, requestId);
  const labels = await versionLabels(
    scope,
    practiceId,
    mappings.flatMap((mapping) => (mapping.contract_version_id === null ? [] : [mapping.contract_version_id])),
    requestId,
    'payer_plan_mapping',
  );
  const current = mappings.filter((mapping) => mapping.superseded_by === null).map((mapping) => mappingView(mapping, labels));
  return {
    plan: planSummary(row, current),
    history: mappings.map((mapping) => ({
      ...mappingView(mapping, labels),
      supersededById: mapping.superseded_by,
      mappedBy: mapping.mapped_by_email ?? 'a member of the practice',
      mappedAt: mapping.created_at.toISOString(),
    })),
    targets,
    resolution: await planResolution(scope, practiceId, planId, requestId),
  };
}

// ---------------------------------------------------------------------------------------------------
// Coverage
// ---------------------------------------------------------------------------------------------------

export interface WaitingPlan {
  readonly planId: string;
  readonly payerName: string;
  readonly planKey: string;
  readonly waiting: Totals;
}

export interface WaitingPage {
  readonly plans: readonly WaitingPlan[];
  readonly total: number;
  readonly page: number;
  readonly pages: number;
}

/** The dollars waiting on mappings, per plan, largest billed total first, a page at a time. */
export async function waitingPlans(scope: Scope, practiceId: string, page: number, requestId: string): Promise<WaitingPage> {
  const all = await dollarsWaitingOnMapping(scope, practiceId);
  const { page: current, pages, offset } = pageOf(all.length, PLANS_PER_PAGE, page);
  const shown = all.slice(offset, offset + PLANS_PER_PAGE);
  const names = await readWithAudit(
    scope,
    { objectType: 'plan', purpose: 'coverage', requestId },
    async (client) =>
      shown.length === 0
        ? []
        : (
            await client.query<{ id: string; practice_id: string; plan_key: string; payer_name: string }>(
              'SELECT p.id, p.practice_id, p.plan_key, y.name_raw AS payer_name FROM plan p JOIN payer y ON y.id = p.payer_id WHERE p.practice_id = $1 AND p.id = ANY ($2::uuid[])',
              [practiceId, shown.map((plan) => plan.planId)],
            )
          ).rows,
    (row) => ({ objectId: row.id, practiceId: row.practice_id }),
  );
  const byId = new Map(names.map((row) => [row.id, row]));
  return {
    plans: shown.map((plan) => ({
      planId: plan.planId,
      payerName: byId.get(plan.planId)?.payer_name ?? '',
      planKey: byId.get(plan.planId)?.plan_key ?? '',
      waiting: { lines: plan.lines, claims: plan.claims, chargeCents: centsToString(plan.chargeCents), paidCents: centsToString(plan.paidCents) },
    })),
    total: all.length,
    page: current,
    pages,
  };
}

/** Whether a pricing run over every line of the practice would start now (MAP-01), by the run's own guard. */
export interface PricingReadiness {
  readonly allowed: boolean;
  readonly unmappedPlans: number;
  readonly linesWithoutPlan: number;
}

export async function pricingReadiness(scope: Scope, practiceId: string, requestId: string): Promise<PricingReadiness> {
  const { rows } = await scope.client.query<{ plan_id: string; service_date: string }>(
    'SELECT l.payer_plan_key AS plan_id, min(l.service_date)::text AS service_date FROM service_line l WHERE l.practice_id = $1 AND l.service_date IS NOT NULL GROUP BY l.payer_plan_key',
    [practiceId],
  );
  try {
    await assertPracticePricingAllowed(
      scope,
      { practiceId, requestId, purpose: 'coverage' },
      rows.map((row) => ({ planId: row.plan_id, serviceDate: row.service_date })),
    );
    return { allowed: true, unmappedPlans: 0, linesWithoutPlan: 0 };
  } catch (error) {
    if (error instanceof PricingRefusedError) {
      return { allowed: false, unmappedPlans: error.unmappedPlanIds.length, linesWithoutPlan: error.linesWithoutPlan };
    }
    throw error;
  }
}

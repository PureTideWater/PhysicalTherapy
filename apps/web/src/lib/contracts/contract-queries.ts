import { type RateMethod, type RateRecord, loadRateRecords } from '@tp/contracts';
import { type CalendarEventKind, type DocumentKind, type PracticeCipher, type PracticeScope, type QuestionStatus, type QuestionTopic, type ScopeClient, type VersionStatus, readWithAudit } from '@tp/db/runtime';

/**
 * The Contracts, Rate record review and specialist queue screens' reads (PRD 5, J5; PRD 6, Contract
 * repository; PRD 7, Contracts, Rate record review and Specialist queue; docs/adr/0028 and 0030). Every
 * row returned is an audited read: contracts, versions, rate records, calendar events, questions and
 * documents are PHI tables. Dates are YYYY-MM-DD text; windows are half-open [from, to).
 */

type Scope = PracticeScope<ScopeClient>;

export const CONTRACTS_PER_PAGE = 25;
export const DOCUMENTS_PER_PAGE = 25;

const CONTRACT_KINDS = `('contract', 'exhibit', 'payer_letter')`;

function pageOf(total: number, per: number, page: number): { page: number; pages: number; offset: number } {
  const pages = Math.max(1, Math.ceil(total / per));
  const current = Math.min(Math.max(1, page), pages);
  return { page: current, pages, offset: (current - 1) * per };
}

const target = (row: { readonly id: string; readonly practice_id: string }) => ({ objectId: row.id, practiceId: row.practice_id });

export interface Paged<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pages: number;
}

// ---------------------------------------------------------------------------------------------------
// Contracts
// ---------------------------------------------------------------------------------------------------

export interface ShownVersion {
  readonly versionId: string;
  readonly versionNo: number;
  readonly status: VersionStatus;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  /** Signed off and covering today: the version pricing uses for today's services. */
  readonly inForce: boolean;
}

export interface ContractSummary {
  readonly id: string;
  readonly payerId: string;
  readonly payerName: string;
  readonly title: string;
  readonly billingEntity: string | null;
  /** The plans whose current mappings name one of its versions. */
  readonly plans: readonly string[];
  /** The version in force today, else the latest. */
  readonly shown: ShownVersion | null;
  readonly latestStatus: VersionStatus | null;
  /** The methods of the shown version's rate records. */
  readonly methods: readonly RateMethod[];
}

interface ContractRow {
  readonly id: string;
  readonly practice_id: string;
  readonly payer_id: string;
  readonly payer_name: string;
  readonly title: string;
  readonly billing_entity: string | null;
  readonly latest_status: VersionStatus | null;
  readonly shown_id: string | null;
  readonly shown_no: number | null;
  readonly shown_status: VersionStatus | null;
  readonly shown_from: string | null;
  readonly shown_to: string | null;
  readonly in_force: boolean | null;
  readonly methods: RateMethod[] | null;
  readonly plans: string[] | null;
}

const CONTRACT_SELECT = `
  SELECT c.id, c.practice_id, c.payer_id, y.name_raw AS payer_name, c.title, c.billing_entity, lv.status AS latest_status,
         sv.id AS shown_id, sv.version_no AS shown_no, sv.status AS shown_status, sv.effective_from::text AS shown_from, sv.effective_to::text AS shown_to,
         (fv.id IS NOT NULL) AS in_force,
         (SELECT array_agg(DISTINCT r.method ORDER BY r.method) FROM rate_record r WHERE r.contract_version_id = sv.id) AS methods,
         (SELECT array_agg(DISTINCT pl.plan_key ORDER BY pl.plan_key) FROM payer_plan_mapping m
            JOIN contract_version mv ON mv.id = m.contract_version_id JOIN plan pl ON pl.id = m.plan_id
           WHERE mv.contract_id = c.id AND NOT EXISTS (SELECT 1 FROM payer_plan_mapping n WHERE n.supersedes_id = m.id)) AS plans
    FROM contract c JOIN payer y ON y.id = c.payer_id
    LEFT JOIN LATERAL (SELECT v.status FROM contract_version v WHERE v.contract_id = c.id ORDER BY v.version_no DESC LIMIT 1) lv ON true
    LEFT JOIN LATERAL (SELECT v.id FROM contract_version v WHERE v.contract_id = c.id AND v.status = 'signed_off'
                        AND v.effective_from <= $2::date AND (v.effective_to IS NULL OR $2::date < v.effective_to) LIMIT 1) fv ON true
    LEFT JOIN LATERAL (SELECT v.* FROM contract_version v WHERE v.contract_id = c.id ORDER BY (v.id = fv.id) DESC NULLS LAST, v.version_no DESC LIMIT 1) sv ON true`;

function contractSummary(row: ContractRow): ContractSummary {
  return {
    id: row.id,
    payerId: row.payer_id,
    payerName: row.payer_name,
    title: row.title,
    billingEntity: row.billing_entity,
    plans: row.plans ?? [],
    shown:
      row.shown_id === null
        ? null
        : {
            versionId: row.shown_id,
            versionNo: row.shown_no ?? 0,
            status: row.shown_status ?? 'draft',
            effectiveFrom: row.shown_from ?? '',
            effectiveTo: row.shown_to,
            inForce: row.in_force === true,
          },
    latestStatus: row.latest_status,
    methods: row.methods ?? [],
  };
}

export interface ContractQuery {
  readonly practiceId: string;
  readonly today: string;
  readonly payerId?: string;
  readonly status?: VersionStatus;
  readonly page: number;
  readonly requestId: string;
}

/** The practice's contracts with the version pricing uses today (or the latest), a page at a time. */
export async function listContracts(scope: Scope, query: ContractQuery): Promise<Paged<ContractSummary>> {
  const values: unknown[] = [query.practiceId, query.today];
  const filters: string[] = [];
  if (query.payerId !== undefined) {
    values.push(query.payerId);
    filters.push(`c.payer_id = $${String(values.length)}`);
  }
  if (query.status !== undefined) {
    values.push(query.status);
    filters.push(`lv.status = $${String(values.length)}`);
  }
  const where = `WHERE c.practice_id = $1 ${filters.map((filter) => `AND ${filter}`).join(' ')}`;
  const counted = await scope.client.query<{ total: number }>(
    `SELECT count(*)::int AS total FROM contract c
       LEFT JOIN LATERAL (SELECT v.status FROM contract_version v WHERE v.contract_id = c.id ORDER BY v.version_no DESC LIMIT 1) lv ON true
      ${where} AND $2::date IS NOT NULL`,
    values,
  );
  const total = counted.rows[0]?.total ?? 0;
  const { page, pages, offset } = pageOf(total, CONTRACTS_PER_PAGE, query.page);
  const rows = await readWithAudit(
    scope,
    { objectType: 'contract', purpose: 'contracts', requestId: query.requestId },
    async (client) => (await client.query<ContractRow>(`${CONTRACT_SELECT} ${where} ORDER BY y.name_raw, c.title, c.id LIMIT ${String(CONTRACTS_PER_PAGE)} OFFSET ${String(offset)}`, values)).rows,
    target,
  );
  return { items: rows.map(contractSummary), total, page, pages };
}

export interface ContractOption {
  readonly id: string;
  readonly payerId: string;
  readonly title: string;
}

/** The practice's contracts, for the tag form. */
export async function contractOptions(scope: Scope, practiceId: string, requestId: string): Promise<ContractOption[]> {
  const rows = await readWithAudit(
    scope,
    { objectType: 'contract', purpose: 'contracts', requestId },
    async (client) => (await client.query<{ id: string; practice_id: string; payer_id: string; title: string }>('SELECT id, practice_id, payer_id, title FROM contract WHERE practice_id = $1 ORDER BY title, id LIMIT 500', [practiceId])).rows,
    target,
  );
  return rows.map((row) => ({ id: row.id, payerId: row.payer_id, title: row.title }));
}

// ---------------------------------------------------------------------------------------------------
// The calendar and the questions
// ---------------------------------------------------------------------------------------------------

export interface CalendarEntry {
  readonly id: string;
  readonly contractId: string;
  readonly contractTitle: string;
  readonly kind: CalendarEventKind;
  readonly onDate: string;
  readonly note: string | null;
}

/** The contract calendar from today: the practice's, or one contract's. */
export async function listCalendar(scope: Scope, practiceId: string, today: string, requestId: string, contractId?: string): Promise<CalendarEntry[]> {
  const rows = await readWithAudit(
    scope,
    { objectType: 'contract_calendar_event', purpose: 'contracts', requestId },
    async (client) =>
      (
        await client.query<{ id: string; practice_id: string; contract_id: string; title: string; kind: CalendarEventKind; on_date: string; note: string | null }>(
          `SELECT e.id, e.practice_id, e.contract_id, c.title, e.kind, e.on_date::text AS on_date, e.note
             FROM contract_calendar_event e JOIN contract c ON c.id = e.contract_id
            WHERE e.practice_id = $1 AND e.on_date >= $2::date AND ($3::uuid IS NULL OR e.contract_id = $3)
            ORDER BY e.on_date, c.title, e.kind LIMIT 50`,
          [practiceId, today, contractId ?? null],
        )
      ).rows,
    target,
  );
  return rows.map((row) => ({ id: row.id, contractId: row.contract_id, contractTitle: row.title, kind: row.kind, onDate: row.on_date, note: row.note }));
}

export interface QuestionView {
  readonly id: string;
  readonly contractId: string;
  readonly contractTitle: string;
  readonly versionId: string | null;
  readonly versionNo: number | null;
  readonly documentId: string | null;
  readonly topic: QuestionTopic;
  readonly question: string;
  readonly status: QuestionStatus;
  readonly answer: string | null;
  readonly askedBy: string;
  readonly askedAt: string;
  readonly closedBy: string | null;
  readonly closedAt: string | null;
}

interface QuestionRow {
  readonly id: string;
  readonly practice_id: string;
  readonly contract_id: string;
  readonly title: string;
  readonly contract_version_id: string | null;
  readonly version_no: number | null;
  readonly source_document_id: string | null;
  readonly topic: QuestionTopic;
  readonly question: string;
  readonly status: QuestionStatus;
  readonly answer: string | null;
  readonly asked_by_email: string | null;
  readonly created_at: Date;
  readonly closed_by_email: string | null;
  readonly closed_at: Date | null;
}

export interface QuestionFilter {
  readonly contractId?: string;
  readonly versionId?: string;
  /** Open questions only, or every question. */
  readonly openOnly: boolean;
  readonly topics?: readonly QuestionTopic[];
}

/** The specialist's questions to the practice, decrypted. */
export async function listQuestions(scope: Scope, practiceId: string, cipher: PracticeCipher, requestId: string, filter: QuestionFilter): Promise<QuestionView[]> {
  const rows = await readWithAudit(
    scope,
    { objectType: 'contract_question', purpose: 'contracts', requestId },
    async (client) =>
      (
        await client.query<QuestionRow>(
          `SELECT q.id, q.practice_id, q.contract_id, c.title, q.contract_version_id, v.version_no, q.source_document_id, q.topic, q.question, q.status, q.answer,
                  a.email AS asked_by_email, q.created_at, z.email AS closed_by_email, q.closed_at
             FROM contract_question q JOIN contract c ON c.id = q.contract_id LEFT JOIN contract_version v ON v.id = q.contract_version_id
             LEFT JOIN "user" a ON a.id = q.asked_by LEFT JOIN "user" z ON z.id = q.closed_by
            WHERE q.practice_id = $1 AND ($2::uuid IS NULL OR q.contract_id = $2) AND ($3::uuid IS NULL OR q.contract_version_id = $3)
              AND (NOT $4::boolean OR q.status = 'open') AND ($5::text[] IS NULL OR q.topic = ANY ($5::text[]))
            ORDER BY (q.status = 'open') DESC, q.created_at DESC, q.id LIMIT 100`,
          [practiceId, filter.contractId ?? null, filter.versionId ?? null, filter.openOnly, filter.topics === undefined ? null : [...filter.topics]],
        )
      ).rows,
    target,
  );
  return rows.map((row) => ({
    id: row.id,
    contractId: row.contract_id,
    contractTitle: row.title,
    versionId: row.contract_version_id,
    versionNo: row.version_no,
    documentId: row.source_document_id,
    topic: row.topic,
    question: cipher.decrypt('contract_question.question', row.question),
    status: row.status,
    answer: row.answer === null ? null : cipher.decrypt('contract_question.answer', row.answer),
    askedBy: row.asked_by_email ?? 'the contract specialist',
    askedAt: row.created_at.toISOString(),
    closedBy: row.closed_at === null ? null : (row.closed_by_email ?? 'a member of the practice'),
    closedAt: row.closed_at?.toISOString() ?? null,
  }));
}

// ---------------------------------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------------------------------

export interface DocumentSummary {
  readonly id: string;
  readonly kind: DocumentKind;
  readonly sizeBytes: string;
  readonly contentType: string;
  readonly receivedAt: string;
  readonly parentDocumentId: string | null;
  /** The draft or proposed versions that name it. */
  readonly openVersions: readonly { readonly versionId: string; readonly versionNo: number; readonly contractTitle: string }[];
}

interface DocumentRow {
  readonly id: string;
  readonly practice_id: string;
  readonly kind: DocumentKind;
  readonly size_bytes: string;
  readonly content_type: string;
  readonly created_at: Date;
  readonly parent_document_id: string | null;
  readonly open_versions: { versionId: string; versionNo: number; contractTitle: string }[] | null;
}

const DOCUMENT_SELECT = `
  SELECT d.id, d.practice_id, d.kind, d.size_bytes::text AS size_bytes, d.content_type, d.created_at, d.parent_document_id,
         (SELECT json_agg(json_build_object('versionId', v.id, 'versionNo', v.version_no, 'contractTitle', c.title) ORDER BY c.title, v.version_no)
            FROM contract_version v JOIN contract c ON c.id = v.contract_id
           WHERE v.practice_id = d.practice_id AND d.id = ANY (v.source_document_ids) AND v.status IN ('draft', 'proposed')) AS open_versions
    FROM source_document d`;

function documentSummary(row: DocumentRow): DocumentSummary {
  return {
    id: row.id,
    kind: row.kind,
    sizeBytes: row.size_bytes,
    contentType: row.content_type,
    receivedAt: row.created_at.toISOString(),
    parentDocumentId: row.parent_document_id,
    openVersions: row.open_versions ?? [],
  };
}

/** Which stored contract documents a list shows. */
export type DocumentSelection =
  /** No version names them: the customer tags them to a payer (J5). */
  | 'untagged'
  /** No approved, signed-off or superseded version names them: the specialist queue's documents awaiting abstraction. */
  | 'awaiting_abstraction';

const SELECTIONS: Readonly<Record<DocumentSelection, string>> = {
  untagged: 'NOT EXISTS (SELECT 1 FROM contract_version v WHERE v.practice_id = d.practice_id AND d.id = ANY (v.source_document_ids))',
  awaiting_abstraction:
    "NOT EXISTS (SELECT 1 FROM contract_version v WHERE v.practice_id = d.practice_id AND d.id = ANY (v.source_document_ids) AND v.status IN ('approved', 'signed_off', 'superseded'))",
};

/** The practice's clean, stored contract, exhibit and payer-letter documents a selection names, newest first. */
export async function listContractDocuments(scope: Scope, practiceId: string, selection: DocumentSelection, page: number, requestId: string): Promise<Paged<DocumentSummary>> {
  const where = `WHERE d.practice_id = $1 AND d.kind IN ${CONTRACT_KINDS} AND d.scan_status = 'clean' AND d.status = 'stored' AND ${SELECTIONS[selection]}`;
  const counted = await scope.client.query<{ total: number }>(`SELECT count(*)::int AS total FROM source_document d ${where}`, [practiceId]);
  const total = counted.rows[0]?.total ?? 0;
  const { page: current, pages, offset } = pageOf(total, DOCUMENTS_PER_PAGE, page);
  const rows = await readWithAudit(
    scope,
    { objectType: 'source_document', purpose: 'contracts', requestId },
    async (client) => (await client.query<DocumentRow>(`${DOCUMENT_SELECT} ${where} ORDER BY d.created_at DESC, d.id LIMIT ${String(DOCUMENTS_PER_PAGE)} OFFSET ${String(offset)}`, [practiceId])).rows,
    target,
  );
  return { items: rows.map(documentSummary), total, page: current, pages };
}

/** Some documents of the practice by ID (a version's), in the order given. */
export async function documentsById(scope: Scope, practiceId: string, ids: readonly string[], requestId: string): Promise<DocumentSummary[]> {
  if (ids.length === 0) {
    return [];
  }
  const rows = await readWithAudit(
    scope,
    { objectType: 'source_document', purpose: 'contracts', requestId },
    async (client) => (await client.query<DocumentRow>(`${DOCUMENT_SELECT} WHERE d.practice_id = $1 AND d.id = ANY ($2::uuid[])`, [practiceId, [...ids]])).rows,
    target,
  );
  const byId = new Map(rows.map((row) => [row.id, documentSummary(row)]));
  return ids.flatMap((id) => {
    const found = byId.get(id);
    return found === undefined ? [] : [found];
  });
}

// ---------------------------------------------------------------------------------------------------
// Versions
// ---------------------------------------------------------------------------------------------------

export interface VersionSummary {
  readonly id: string;
  readonly contractId: string;
  readonly contractTitle: string;
  readonly payerId: string;
  readonly payerName: string;
  readonly versionNo: number;
  readonly status: VersionStatus;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly supersedesId: string | null;
  readonly supersedesNo: number | null;
  readonly sourceDocumentIds: readonly string[];
  readonly records: number;
  readonly verified: number;
  readonly approvedBy: string | null;
  readonly approvedAt: string | null;
  readonly signedOffBy: string | null;
  readonly signedOffAt: string | null;
  readonly timelyFilingDays: number | null;
  readonly disputeWindowDays: number | null;
  /** Where the contract states its dispute window and who verified it (D17 a); null while uncited. */
  readonly disputeWindow: DisputeWindowView | null;
  readonly noticeDays: number | null;
  readonly appealLevels: readonly { readonly level: number; readonly days: number }[];
}

/** A version's cited dispute window: its document, page and quote, and the specialist who verified it, when. */
export interface DisputeWindowView {
  readonly documentId: string;
  readonly page: number;
  readonly quote: string;
  /** Null while the citation is not verified (only a verified window of a signed-off version verifies its lines' deadlines). */
  readonly verifiedBy: string | null;
  readonly verifiedAt: string | null;
}

interface VersionRow {
  readonly id: string;
  readonly practice_id: string;
  readonly contract_id: string;
  readonly title: string;
  readonly payer_id: string;
  readonly payer_name: string;
  readonly version_no: number;
  readonly status: VersionStatus;
  readonly effective_from: string;
  readonly effective_to: string | null;
  readonly supersedes_id: string | null;
  readonly supersedes_no: number | null;
  readonly source_document_ids: string[];
  readonly records: number;
  readonly verified: number;
  readonly approved_by_email: string | null;
  readonly approved_at: Date | null;
  readonly signed_off_by_email: string | null;
  readonly signed_off_at: Date | null;
  readonly timely_filing_days: number | null;
  readonly dispute_window_days: number | null;
  readonly dispute_window_evidence: { readonly document_id: string; readonly page: number; readonly quote: string } | null;
  readonly window_verified_by_email: string | null;
  readonly dispute_window_verified_at: Date | null;
  readonly notice_days: number | null;
  readonly appeal_levels: { level: number; days: number }[];
}

const VERSION_SELECT = `
  SELECT v.id, v.practice_id, v.contract_id, c.title, c.payer_id, y.name_raw AS payer_name, v.version_no, v.status,
         v.effective_from::text AS effective_from, v.effective_to::text AS effective_to, v.supersedes_id, s.version_no AS supersedes_no, v.source_document_ids,
         (SELECT count(*)::int FROM rate_record r WHERE r.contract_version_id = v.id) AS records,
         (SELECT count(*)::int FROM rate_record r WHERE r.contract_version_id = v.id AND r.verified_by IS NOT NULL) AS verified,
         a.email AS approved_by_email, v.approved_at, o.email AS signed_off_by_email, v.signed_off_at,
         v.timely_filing_days, v.dispute_window_days, v.dispute_window_evidence, w.email AS window_verified_by_email, v.dispute_window_verified_at,
         v.notice_days, v.appeal_levels
    FROM contract_version v JOIN contract c ON c.id = v.contract_id JOIN payer y ON y.id = c.payer_id
    LEFT JOIN contract_version s ON s.id = v.supersedes_id
    LEFT JOIN "user" a ON a.id = v.approved_by LEFT JOIN "user" o ON o.id = v.signed_off_by
    LEFT JOIN "user" w ON w.id = v.dispute_window_verified_by`;

function versionSummary(row: VersionRow): VersionSummary {
  return {
    id: row.id,
    contractId: row.contract_id,
    contractTitle: row.title,
    payerId: row.payer_id,
    payerName: row.payer_name,
    versionNo: row.version_no,
    status: row.status,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    supersedesId: row.supersedes_id,
    supersedesNo: row.supersedes_no,
    sourceDocumentIds: row.source_document_ids,
    records: row.records,
    verified: row.verified,
    approvedBy: row.approved_at === null ? null : (row.approved_by_email ?? 'the contract specialist'),
    approvedAt: row.approved_at?.toISOString() ?? null,
    signedOffBy: row.signed_off_at === null ? null : (row.signed_off_by_email ?? 'a member of the practice'),
    signedOffAt: row.signed_off_at?.toISOString() ?? null,
    timelyFilingDays: row.timely_filing_days,
    disputeWindowDays: row.dispute_window_days,
    disputeWindow:
      row.dispute_window_evidence === null
        ? null
        : {
            documentId: row.dispute_window_evidence.document_id,
            page: row.dispute_window_evidence.page,
            quote: row.dispute_window_evidence.quote,
            verifiedBy: row.dispute_window_verified_at === null ? null : (row.window_verified_by_email ?? 'the contract specialist'),
            verifiedAt: row.dispute_window_verified_at?.toISOString() ?? null,
          },
    noticeDays: row.notice_days,
    appealLevels: row.appeal_levels,
  };
}

async function versionRows(scope: Scope, practiceId: string, where: string, values: readonly unknown[], requestId: string, purpose: string): Promise<VersionSummary[]> {
  const rows = await readWithAudit(
    scope,
    { objectType: 'contract_version', purpose, requestId },
    async (client) => (await client.query<VersionRow>(`${VERSION_SELECT} WHERE v.practice_id = $1 AND ${where} ORDER BY y.name_raw, c.title, v.version_no LIMIT 200`, [practiceId, ...values])).rows,
    target,
  );
  return rows.map(versionSummary);
}

export interface ContractDetail {
  readonly contract: { readonly id: string; readonly payerId: string; readonly payerName: string; readonly title: string; readonly billingEntity: string | null; readonly status: string };
  readonly versions: readonly VersionSummary[];
  /** The current mappings that name one of its versions. */
  readonly plans: readonly { readonly mappingId: string; readonly planId: string; readonly planKey: string; readonly effectiveFrom: string; readonly effectiveTo: string | null }[];
}

/** One contract with every version and the plans mapped to it. */
export async function contractDetail(scope: Scope, practiceId: string, contractId: string, requestId: string): Promise<ContractDetail | undefined> {
  const [row] = await readWithAudit(
    scope,
    { objectType: 'contract', purpose: 'contracts', requestId },
    async (client) =>
      (
        await client.query<{ id: string; practice_id: string; payer_id: string; payer_name: string; title: string; billing_entity: string | null; status: string }>(
          'SELECT c.id, c.practice_id, c.payer_id, y.name_raw AS payer_name, c.title, c.billing_entity, c.status FROM contract c JOIN payer y ON y.id = c.payer_id WHERE c.practice_id = $1 AND c.id = $2',
          [practiceId, contractId],
        )
      ).rows,
    target,
  );
  if (row === undefined) {
    return undefined;
  }
  const versions = await versionRows(scope, practiceId, 'v.contract_id = $2', [contractId], requestId, 'contracts');
  const plans = await readWithAudit(
    scope,
    { objectType: 'payer_plan_mapping', purpose: 'contracts', requestId },
    async (client) =>
      (
        await client.query<{ id: string; practice_id: string; plan_id: string; plan_key: string; effective_from: string; effective_to: string | null }>(
          `SELECT m.id, m.practice_id, m.plan_id, pl.plan_key, m.effective_from::text AS effective_from, m.effective_to::text AS effective_to
             FROM payer_plan_mapping m JOIN contract_version v ON v.id = m.contract_version_id JOIN plan pl ON pl.id = m.plan_id
            WHERE m.practice_id = $1 AND v.contract_id = $2 AND NOT EXISTS (SELECT 1 FROM payer_plan_mapping n WHERE n.supersedes_id = m.id)
            ORDER BY pl.plan_key, m.effective_from`,
          [practiceId, contractId],
        )
      ).rows,
    target,
  );
  return {
    contract: { id: row.id, payerId: row.payer_id, payerName: row.payer_name, title: row.title, billingEntity: row.billing_entity, status: row.status },
    versions,
    plans: plans.map((plan) => ({ mappingId: plan.id, planId: plan.plan_id, planKey: plan.plan_key, effectiveFrom: plan.effective_from, effectiveTo: plan.effective_to })),
  };
}

export interface VersionDetail {
  readonly version: VersionSummary;
  /** Versions that name this one as the version they amend or correct. */
  readonly successors: readonly VersionSummary[];
  /** The other versions of its contract. */
  readonly siblings: readonly VersionSummary[];
  readonly documents: readonly DocumentSummary[];
  readonly records: readonly RateRecord[];
  /** Approvers' emails by user ID, for the field approvals. */
  readonly people: ReadonlyMap<string, string>;
}

/** One version with its documents and rate records (typed), for the review screens. */
export async function versionDetail(scope: Scope, practiceId: string, versionId: string, requestId: string): Promise<VersionDetail | undefined> {
  const [version] = await versionRows(scope, practiceId, 'v.id = $2', [versionId], requestId, 'rate_record_review');
  if (version === undefined) {
    return undefined;
  }
  const siblings = await versionRows(scope, practiceId, 'v.contract_id = $2', [version.contractId], requestId, 'rate_record_review');
  const records = await loadRateRecords(scope, { practiceId, requestId, purpose: 'rate_record_review' }, [version.id]);
  const userIds = [...new Set(records.flatMap((record) => [...Object.values(record.approvals).map((approval) => approval.by), ...(record.verifiedBy === null ? [] : [record.verifiedBy])]))];
  const people =
    userIds.length === 0 ? [] : (await scope.client.query<{ id: string; email: string }>('SELECT id, email FROM "user" WHERE id = ANY ($1::uuid[])', [userIds])).rows;
  return {
    version,
    successors: siblings.filter((sibling) => sibling.supersedesId === version.id),
    siblings: siblings.filter((sibling) => sibling.id !== version.id),
    documents: await documentsById(scope, practiceId, version.sourceDocumentIds, requestId),
    records,
    people: new Map(people.map((person) => [person.id, person.email])),
  };
}

/** The versions being abstracted, reviewed or awaiting the customer's sign-off. */
export function versionsInProgress(scope: Scope, practiceId: string, requestId: string): Promise<VersionSummary[]> {
  return versionRows(scope, practiceId, "v.status IN ('draft', 'proposed', 'approved')", [], requestId, 'abstraction');
}

import { createHash } from 'node:crypto';

import { type DocumentStatus, type PracticeCipher, type PracticeScope, type ScopeClient, loadPracticeCipher, readWithAudit, recordAuditEvent } from '@tp/db/runtime';
import { type FigureCheck, type LedgerEntry, type ProofLevel, type ReportReconciliation, type StoredStatement, entriesById, ratioText, recomputeStatement, reportReconciliation, roiStatementCsv } from '@tp/ledger';
import { centsToString, parseCents } from '@tp/money';
import { STATEMENT_COLUMNS, approvalShortfalls, practiceLedgerSettings, practiceLedgerTotals, storedStatement, unmatchedItems } from '@tp/worker/ledger';

import { type ListPage, pageWindow } from '../http/paging';
import type { Services } from '../server/services';

/**
 * The Reconciliation screen's and the ROI statements' reads (PRD 7, Reconciliation: "ERA to posting to
 * EFT linkage per case line; unmatched adjusted payments; recoupments; ledger entries ... Unmatched items
 * never count; every match shows its evidence"; PRD 13; PRD 5, J10 and J12; docs/adr/0042 and 0043).
 * Every figure is the ledger's: totals come from its entries through @tp/worker/ledger and never from a
 * number typed or stored elsewhere; nothing unmatched is in any total. The rows read here are PHI tables
 * read through readWithAudit; dates of service, codes and the people's reasons are shown to the roles
 * that read PHI only; amounts, check and trace numbers, payment dates and stages to every reader of the
 * ledger (report.read).
 */

type Scope = PracticeScope<ScopeClient>;

/** A total as text cents, from the ledger. */
export interface TotalsView {
  readonly proofLevel: ProofLevel;
  /** The approved stage, net of its reversals and adjustments. */
  readonly approvedCents: string;
  /** Payer approved as the headline shows it: the approvals net of what was taken back before they were proved. */
  readonly payerApprovedCents: string;
  readonly postedCents: string;
  readonly depositedCents: string;
  readonly recoupedCents: string;
  readonly interestCents: string;
  readonly recoveredCents: string;
}

export async function ledgerTotalsView(scope: Scope, practiceId: string, caseId: string | null): Promise<TotalsView> {
  const totals = await practiceLedgerTotals(scope, practiceId, caseId === null ? {} : { caseIds: [caseId] });
  return {
    proofLevel: totals.proofLevel,
    approvedCents: centsToString(totals.approvedCents),
    payerApprovedCents: centsToString(totals.payerApprovedCents),
    postedCents: centsToString(totals.postedCents),
    depositedCents: centsToString(totals.depositedCents),
    recoupedCents: centsToString(totals.recoupedCents),
    interestCents: centsToString(totals.interestCents),
    recoveredCents: centsToString(totals.recoveredCents),
  };
}

/** A posting or EFT export the practice uploaded, and what became of it. */
export interface ExportView {
  readonly id: string;
  readonly kind: 'posting_export' | 'eft_export';
  readonly status: DocumentStatus;
  readonly uploadedAt: string;
  readonly rows: number;
  readonly matchedRows: number;
}

const EXPORTS_PER_PAGE = 10;

export async function practiceExports(scope: Scope, practiceId: string, requestedPage: number, requestId: string): Promise<ListPage<ExportView>> {
  const { rows: counted } = await scope.client.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM source_document WHERE practice_id = $1 AND kind IN ('posting_export', 'eft_export') AND parent_document_id IS NULL",
    [practiceId],
  );
  const total = counted[0]?.n ?? 0;
  const at = pageWindow(total, EXPORTS_PER_PAGE, requestedPage);
  const rows = await readWithAudit(
    scope,
    { objectType: 'source_document', purpose: 'reconciliation', requestId },
    async (client) =>
      (
        await client.query<{ id: string; practice_id: string; kind: 'posting_export' | 'eft_export'; status: DocumentStatus; created_at: Date; rows: number; matched: number }>(
          `SELECT d.id, d.practice_id, d.kind, d.status, d.created_at,
                  (SELECT count(*)::int FROM posting_row p WHERE p.source_document_id = d.id) + (SELECT count(*)::int FROM eft_row e WHERE e.source_document_id = d.id) AS rows,
                  (SELECT count(*)::int FROM posting_row p WHERE p.source_document_id = d.id AND EXISTS (SELECT 1 FROM ledger_match m WHERE m.posting_row_id = p.id AND m.reversed_at IS NULL))
                    + (SELECT count(*)::int FROM eft_row e WHERE e.source_document_id = d.id AND EXISTS (SELECT 1 FROM ledger_match m WHERE m.eft_row_id = e.id AND m.reversed_at IS NULL)) AS matched
             FROM source_document d
            WHERE d.practice_id = $1 AND d.kind IN ('posting_export', 'eft_export') AND d.parent_document_id IS NULL
            ORDER BY d.created_at DESC, d.id LIMIT ${String(EXPORTS_PER_PAGE)} OFFSET ${String(at.offset)}`,
          [practiceId],
        )
      ).rows,
    (row) => ({ objectId: row.id, practiceId: row.practice_id }),
  );
  return {
    items: rows.map((row) => ({ id: row.id, kind: row.kind, status: row.status, uploadedAt: row.created_at.toISOString(), rows: row.rows, matchedRows: row.matched })),
    page: at.page,
    pages: at.pages,
    total,
  };
}

/** One match as the screen shows it: its evidence beside what it was matched to. */
export interface MatchView {
  readonly id: string;
  readonly kind: 'claim' | 'posting' | 'deposit' | 'recoupment' | 'interest';
  readonly remittanceId: string;
  readonly trace: string;
  readonly paidOn: string;
  readonly payerName: string;
  readonly outcome: 'approved' | 'decreased' | 'no_change' | null;
  readonly level: 'claim' | 'check' | 'batch' | null;
  readonly allocated: boolean;
  /** The posting row's or EFT row's own check or trace, date and amount. */
  readonly evidence: { readonly reference: string; readonly on: string; readonly amountCents: string; readonly batch: string | null } | null;
  /** Who matched it: a person's email, or null for the reconcile job. */
  readonly matchedBy: string | null;
  readonly manual: boolean;
  readonly matchedAt: string;
  readonly standing: boolean;
  readonly reversedBy: string | null;
  readonly reversedAt: string | null;
  /** The person's reason (PHI roles only). */
  readonly reversalReason: string | null;
  /** The claim's or line's IDs it concerns. */
  readonly claimId: string | null;
  readonly serviceLineId: string | null;
  readonly postingRowId: string | null;
  readonly eftRowId: string | null;
  /** A PLB recoupment or interest (provider adjustment), or a reversing claim. */
  readonly source: 'plb' | 'reversal' | null;
}

export interface EntryView {
  readonly id: string;
  readonly seq: string;
  readonly caseId: string;
  readonly serviceLineId: string | null;
  readonly stage: string;
  readonly amountCents: string;
  readonly evidenceKind: string;
  readonly evidenceId: string;
  readonly matchId: string | null;
  readonly allocated: boolean;
  readonly effectiveOn: string;
  /** A person's email, or null for the reconcile job. */
  readonly createdBy: string | null;
  readonly byJob: boolean;
  /** A correction's reason (PHI roles only). */
  readonly reason: string | null;
  /** An entry of a counted stage, not reversed, whose match (if any) stands: a person may adjust it. */
  readonly adjustable: boolean;
}

/** A case line's linkage: the remittance that reprocessed it (ERA), its posting and its deposit, and its entries. */
export interface LinkageLine {
  readonly caseId: string;
  readonly serviceLineId: string;
  /** PHI roles only. */
  readonly procedureCode: string | null;
  readonly serviceDate: string | null;
  readonly stage: string | null;
  readonly era: readonly MatchView[];
  readonly postings: readonly MatchView[];
  readonly deposits: readonly MatchView[];
  readonly recoupments: readonly MatchView[];
  readonly interest: readonly MatchView[];
  readonly entries: readonly EntryView[];
  /**
   * What a payer response accepted that the remittance reprocessing the line paid only in part, as
   * text cents, or null: approved still, never taken back, for a person to adjust or dispute.
   */
  readonly shortfallCents: string | null;
}

interface MatchRow {
  readonly id: string;
  readonly practice_id: string;
  readonly kind: MatchView['kind'];
  readonly claim_id: string | null;
  readonly posting_row_id: string | null;
  readonly eft_row_id: string | null;
  readonly provider_adjustment_id: string | null;
  readonly remittance_id: string;
  readonly service_line_id: string | null;
  readonly outcome: MatchView['outcome'];
  readonly level: MatchView['level'];
  readonly allocated: boolean;
  readonly matched_by: string | null;
  readonly matched_by_email: string | null;
  readonly matched_at: Date;
  readonly reversed_at: Date | null;
  readonly reversed_by_email: string | null;
  readonly reversal_reason: string | null;
  readonly trn02: string;
  readonly paid_on: string;
  readonly payer_name: string;
  readonly posting_reference: string | null;
  readonly posted_on: string | null;
  readonly posting_cents: string | null;
  readonly posting_batch: string | null;
  readonly eft_reference: string | null;
  readonly deposited_on: string | null;
  readonly eft_cents: string | null;
  readonly eft_batch: string | null;
}

const MATCH_SELECT = `SELECT m.id, m.practice_id, m.kind, m.claim_id, m.posting_row_id, m.eft_row_id, m.provider_adjustment_id, m.remittance_id, m.service_line_id, m.outcome, m.level, m.allocated,
         m.matched_by, mu.email AS matched_by_email, m.matched_at, m.reversed_at, ru.email AS reversed_by_email, m.reversal_reason,
         r.trn02, r.bpr16_date::text AS paid_on, r.payer_name,
         p.check_or_trace AS posting_reference, p.posted_on::text AS posted_on, p.amount_cents::text AS posting_cents, p.batch AS posting_batch,
         e.trace AS eft_reference, e.deposited_on::text AS deposited_on, e.amount_cents::text AS eft_cents, e.batch_reference AS eft_batch
    FROM ledger_match m JOIN remittance r ON r.id = m.remittance_id
    LEFT JOIN posting_row p ON p.id = m.posting_row_id LEFT JOIN eft_row e ON e.id = m.eft_row_id
    LEFT JOIN "user" mu ON mu.id = m.matched_by LEFT JOIN "user" ru ON ru.id = m.reversed_by`;

function matchOf(row: MatchRow, cipher: PracticeCipher | null): MatchView {
  const evidence =
    row.posting_reference !== null
      ? { reference: row.posting_reference, on: row.posted_on ?? '', amountCents: row.posting_cents ?? '0', batch: row.posting_batch }
      : row.eft_reference !== null
        ? { reference: row.eft_reference, on: row.deposited_on ?? '', amountCents: row.eft_cents ?? '0', batch: row.eft_batch }
        : null;
  return {
    id: row.id,
    kind: row.kind,
    remittanceId: row.remittance_id,
    trace: row.trn02,
    paidOn: row.paid_on,
    payerName: row.payer_name,
    outcome: row.outcome,
    level: row.level,
    allocated: row.allocated,
    evidence,
    matchedBy: row.matched_by === null ? null : (row.matched_by_email ?? 'a member of the practice'),
    manual: row.matched_by !== null,
    matchedAt: row.matched_at.toISOString(),
    standing: row.reversed_at === null,
    reversedBy: row.reversed_at === null ? null : (row.reversed_by_email ?? 'a member of the practice'),
    reversedAt: row.reversed_at?.toISOString() ?? null,
    reversalReason: row.reversal_reason === null || cipher === null ? null : cipher.decrypt('ledger_match.reversal_reason', row.reversal_reason),
    claimId: row.claim_id,
    serviceLineId: row.service_line_id,
    postingRowId: row.posting_row_id,
    eftRowId: row.eft_row_id,
    source: row.kind === 'recoupment' || row.kind === 'interest' ? (row.provider_adjustment_id === null ? 'reversal' : 'plb') : null,
  };
}

interface EntryRow {
  readonly id: string;
  readonly practice_id: string;
  readonly seq: string;
  readonly case_id: string;
  readonly service_line_id: string | null;
  readonly stage: string;
  readonly amount_cents: string;
  readonly evidence_kind: string;
  readonly evidence_id: string;
  readonly match_id: string | null;
  readonly allocated: boolean;
  readonly effective_on: string;
  readonly created_by: string | null;
  readonly created_by_email: string | null;
  readonly reason: string | null;
  readonly adjustable: boolean;
}

const ENTRY_SELECT = `SELECT e.id, e.practice_id, e.seq::text AS seq, e.case_id, e.service_line_id, e.stage, e.amount_cents::text AS amount_cents, e.evidence_kind, e.evidence_id, e.match_id, e.allocated,
         e.effective_on::text AS effective_on, e.created_by, u.email AS created_by_email, e.reason,
         (e.stage NOT IN ('reversed', 'adjusted') AND NOT EXISTS (SELECT 1 FROM ledger_entry x WHERE x.stage = 'reversed' AND x.evidence_id = e.id)
           AND (e.match_id IS NULL OR EXISTS (SELECT 1 FROM ledger_match m WHERE m.id = e.match_id AND m.reversed_at IS NULL))) AS adjustable
    FROM ledger_entry e LEFT JOIN "user" u ON u.id = e.created_by`;

function entryOf(row: EntryRow, cipher: PracticeCipher | null): EntryView {
  return {
    id: row.id,
    seq: row.seq,
    caseId: row.case_id,
    serviceLineId: row.service_line_id,
    stage: row.stage,
    amountCents: row.amount_cents,
    evidenceKind: row.evidence_kind,
    evidenceId: row.evidence_id,
    matchId: row.match_id,
    allocated: row.allocated,
    effectiveOn: row.effective_on,
    createdBy: row.created_by === null ? null : (row.created_by_email ?? 'a member of the practice'),
    byJob: row.created_by === null,
    reason: row.reason === null || cipher === null ? null : cipher.decrypt('ledger_entry.reason', row.reason),
    adjustable: row.adjustable,
  };
}

const LINES_PER_PAGE = 25;
const ENTRIES_PER_PAGE = 50;

export interface ReconciliationQuery {
  readonly caseId: string | null;
  readonly linesPage: number;
  readonly entriesPage: number;
}

/** A remittance a person may match unmatched evidence to. */
export interface RemittanceChoice {
  readonly remittanceId: string;
  readonly trace: string;
  readonly paymentDate: string;
  readonly paymentCents: string;
  readonly payerName: string;
}

export interface UnmatchedPostingView {
  readonly postingRowId: string;
  readonly rowNo: number;
  readonly checkOrTrace: string;
  readonly postedOn: string;
  readonly amountCents: string;
  readonly payerName: string | null;
  readonly batch: string | null;
  readonly lineLevel: boolean;
  readonly reversed: boolean;
  /** A take-back row of a corrected export: the standing match it offsets, which a person reverses. */
  readonly correctionOf: { readonly matchId: string } | null;
  readonly candidates: readonly RemittanceChoice[];
}

export interface UnmatchedDepositView {
  readonly eftRowId: string;
  readonly rowNo: number;
  readonly trace: string;
  readonly depositedOn: string;
  readonly amountCents: string;
  readonly batchReference: string | null;
  readonly reversed: boolean;
  readonly candidates: readonly RemittanceChoice[];
}

export interface UnmatchedPaymentView {
  readonly claimId: string;
  readonly trace: string;
  readonly paymentDate: string;
  readonly payerName: string;
  readonly paidCents: string;
  /** Codes and dates of service for PHI roles only (null otherwise). */
  readonly lines: readonly { readonly procedureCode: string | null; readonly serviceDate: string | null; readonly observedAllowedCents: string }[];
  readonly candidates: readonly { readonly caseId: string; readonly serviceLineId: string; readonly procedureCode: string | null; readonly serviceDate: string | null; readonly observedAllowedCents: string }[];
}

export interface UnmatchedView {
  readonly postings: readonly UnmatchedPostingView[];
  readonly deposits: readonly UnmatchedDepositView[];
  readonly adjustedPayments: readonly UnmatchedPaymentView[];
}

export interface ReconciliationData {
  readonly totals: TotalsView;
  readonly linkage: ListPage<LinkageLine>;
  readonly entries: ListPage<EntryView>;
  readonly unmatched: UnmatchedView;
}

/**
 * The case lines the ledger holds anything for (a match or an entry), a page at a time, each with its
 * linkage and entries; the practice's entries newest first; and what matches nothing, with its evidence
 * and candidates. For one case when `caseId` names one: that case's ledger.
 *
 * The case lines and their stages are read first and the totals last, so the scope must read one snapshot (the
 * routes that call this take oneSnapshot), and a scope that does not is refused: the reconcile writes entries and
 * stages in one transaction, and at READ COMMITTED one that commits between those statements would show its figure
 * beside the lines' earlier stages.
 */
export async function reconciliation(scope: Scope, services: Services, practiceId: string, query: ReconciliationQuery, phi: boolean, requestId: string): Promise<ReconciliationData> {
  const { rows: isolation } = await scope.client.query<{ level: string }>("SELECT current_setting('transaction_isolation') AS level");
  if (isolation[0]?.level !== 'repeatable read' && isolation[0]?.level !== 'serializable') {
    throw new Error('the ledger is read in one snapshot: open the scope with oneSnapshot');
  }
  const cipher = phi ? await loadPracticeCipher(scope, services.keys, practiceId) : null;
  const { rows: lineCount } = await scope.client.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM case_line cl
      WHERE cl.practice_id = $1 AND ($2::uuid IS NULL OR cl.case_id = $2)
        AND (EXISTS (SELECT 1 FROM ledger_match m WHERE m.service_line_id = cl.service_line_id) OR EXISTS (SELECT 1 FROM ledger_entry e WHERE e.service_line_id = cl.service_line_id))`,
    [practiceId, query.caseId],
  );
  const lineTotal = lineCount[0]?.n ?? 0;
  const lineWindow = pageWindow(lineTotal, LINES_PER_PAGE, query.linesPage);
  const lines = await readWithAudit(
    scope,
    { objectType: 'service_line', purpose: 'reconciliation', requestId },
    async (client) =>
      (
        await client.query<{ case_id: string; service_line_id: string; practice_id: string; procedure_code: string; service_date: string | null; stage: string | null }>(
          `SELECT cl.case_id, cl.service_line_id, cl.practice_id, l.procedure_code, l.service_date::text AS service_date,
                  (SELECT s.stage FROM line_status s WHERE s.service_line_id = cl.service_line_id ORDER BY s.seq DESC LIMIT 1) AS stage
             FROM case_line cl JOIN service_line l ON l.id = cl.service_line_id
            WHERE cl.practice_id = $1 AND ($2::uuid IS NULL OR cl.case_id = $2)
              AND (EXISTS (SELECT 1 FROM ledger_match m WHERE m.service_line_id = cl.service_line_id) OR EXISTS (SELECT 1 FROM ledger_entry e WHERE e.service_line_id = cl.service_line_id))
            ORDER BY cl.case_id, l.service_date, cl.service_line_id LIMIT ${String(LINES_PER_PAGE)} OFFSET ${String(lineWindow.offset)}`,
          [practiceId, query.caseId],
        )
      ).rows,
    (row) => ({ objectId: row.service_line_id, practiceId: row.practice_id }),
  );
  const lineIds = lines.map((line) => line.service_line_id);
  const lineMatches = (await scope.client.query<MatchRow>(`${MATCH_SELECT} WHERE m.practice_id = $1 AND m.service_line_id = ANY ($2::uuid[]) ORDER BY m.matched_at, m.id`, [practiceId, lineIds])).rows;
  const remittances = [...new Set(lineMatches.filter((match) => match.kind === 'claim').map((match) => match.remittance_id))];
  const cash = (
    await scope.client.query<MatchRow>(`${MATCH_SELECT} WHERE m.practice_id = $1 AND m.kind IN ('posting', 'deposit') AND m.remittance_id = ANY ($2::uuid[]) ORDER BY m.matched_at, m.id`, [practiceId, remittances])
  ).rows;
  const lineEntries = (await scope.client.query<EntryRow>(`${ENTRY_SELECT} WHERE e.practice_id = $1 AND e.service_line_id = ANY ($2::uuid[]) ORDER BY e.seq`, [practiceId, lineIds])).rows;
  const shortfalls = await approvalShortfalls(scope, practiceId, lineIds);
  const linkage: LinkageLine[] = lines.map((line) => {
    const own = lineMatches.filter((match) => match.service_line_id === line.service_line_id);
    const era = own.filter((match) => match.kind === 'claim');
    const claims = new Set(era.map((match) => match.claim_id));
    const reprocessing = new Set(era.map((match) => match.remittance_id));
    const proving = cash.filter((match) => reprocessing.has(match.remittance_id) && (match.kind === 'deposit' || match.level === 'check' || claims.has(match.claim_id)));
    return {
      caseId: line.case_id,
      serviceLineId: line.service_line_id,
      procedureCode: phi ? line.procedure_code : null,
      serviceDate: phi ? line.service_date : null,
      stage: line.stage,
      era: era.map((match) => matchOf(match, cipher)),
      postings: proving.filter((match) => match.kind === 'posting').map((match) => matchOf(match, cipher)),
      deposits: proving.filter((match) => match.kind === 'deposit').map((match) => matchOf(match, cipher)),
      recoupments: own.filter((match) => match.kind === 'recoupment').map((match) => matchOf(match, cipher)),
      interest: own.filter((match) => match.kind === 'interest').map((match) => matchOf(match, cipher)),
      entries: lineEntries.filter((entry) => entry.service_line_id === line.service_line_id).map((entry) => entryOf(entry, cipher)),
      shortfallCents: shortfallText(shortfalls, line.service_line_id),
    };
  });
  const { rows: entryCount } = await scope.client.query<{ n: number }>('SELECT count(*)::int AS n FROM ledger_entry e WHERE e.practice_id = $1 AND ($2::uuid IS NULL OR e.case_id = $2)', [
    practiceId,
    query.caseId,
  ]);
  const entryTotal = entryCount[0]?.n ?? 0;
  const entryWindow = pageWindow(entryTotal, ENTRIES_PER_PAGE, query.entriesPage);
  const entries = await readWithAudit(
    scope,
    { objectType: 'ledger_entry', purpose: 'reconciliation', requestId },
    async (client) =>
      (
        await client.query<EntryRow>(
          `${ENTRY_SELECT} WHERE e.practice_id = $1 AND ($2::uuid IS NULL OR e.case_id = $2) ORDER BY e.seq DESC LIMIT ${String(ENTRIES_PER_PAGE)} OFFSET ${String(entryWindow.offset)}`,
          [practiceId, query.caseId],
        )
      ).rows,
    (row) => ({ objectId: row.id, practiceId: row.practice_id }),
  );
  return {
    totals: await ledgerTotalsView(scope, practiceId, query.caseId),
    linkage: { items: linkage, page: lineWindow.page, pages: lineWindow.pages, total: lineTotal },
    entries: { items: entries.map((entry) => entryOf(entry, cipher)), page: entryWindow.page, pages: entryWindow.pages, total: entryTotal },
    unmatched: query.caseId === null ? await unmatchedWithAudit(scope, practiceId, phi, requestId) : { postings: [], deposits: [], adjustedPayments: [] },
  };
}

function shortfallText(shortfalls: ReadonlyMap<string, bigint>, serviceLineId: string): string | null {
  const shortfall = shortfalls.get(serviceLineId);
  return shortfall === undefined ? null : shortfall.toString();
}

/** What matches nothing, its reads audited; the adjusted payments' dates of service and codes for PHI roles only. */
async function unmatchedWithAudit(scope: Scope, practiceId: string, phi: boolean, requestId: string): Promise<UnmatchedView> {
  const items = await unmatchedItems(scope, practiceId);
  const audit = async <T>(objectType: string, rows: readonly T[], id: (row: T) => string) =>
    readWithAudit(scope, { objectType, purpose: 'reconciliation', requestId }, () => Promise.resolve(rows), (row) => ({ objectId: id(row), practiceId }));
  const choice = (candidate: (typeof items.postings)[number]['candidates'][number]): RemittanceChoice => ({ ...candidate, paymentCents: centsToString(candidate.paymentCents) });
  const postings = await audit('posting_row', items.postings, (row) => row.postingRowId);
  const deposits = await audit('eft_row', items.deposits, (row) => row.eftRowId);
  const adjusted = await audit('claim', items.adjustedPayments, (row) => row.claimId);
  return {
    postings: postings.map((row) => ({
      postingRowId: row.postingRowId,
      rowNo: row.rowNo,
      checkOrTrace: row.checkOrTrace,
      postedOn: row.postedOn,
      amountCents: centsToString(row.amountCents),
      payerName: row.payerName,
      batch: row.batch,
      lineLevel: row.lineLevel,
      reversed: row.reversed,
      correctionOf: row.correctionOf === null ? null : { matchId: row.correctionOf.matchId },
      candidates: row.candidates.map(choice),
    })),
    deposits: deposits.map((row) => ({
      eftRowId: row.eftRowId,
      rowNo: row.rowNo,
      trace: row.trace,
      depositedOn: row.depositedOn,
      amountCents: centsToString(row.amountCents),
      batchReference: row.batchReference,
      reversed: row.reversed,
      candidates: row.candidates.map(choice),
    })),
    adjustedPayments: adjusted.map((payment) => ({
      claimId: payment.claimId,
      trace: payment.trace,
      paymentDate: payment.paymentDate,
      payerName: payment.payerName,
      paidCents: centsToString(payment.paidCents),
      lines: payment.lines.map((line) => ({ procedureCode: phi ? line.procedureCode : null, serviceDate: phi ? line.serviceDate : null, observedAllowedCents: centsToString(line.observedAllowedCents) })),
      candidates: payment.candidates.map((candidate) => ({
        caseId: candidate.caseId,
        serviceLineId: candidate.serviceLineId,
        procedureCode: phi ? candidate.procedureCode : null,
        serviceDate: phi ? candidate.serviceDate : null,
        observedAllowedCents: centsToString(candidate.observedAllowedCents),
      })),
    })),
  };
}

/** Whether a standing match of `kind` already holds this evidence and remittance (or case line): a person's match repeated is the one already made. */
export async function standingMatch(
  scope: Scope,
  practiceId: string,
  match: { readonly kind: 'claim' | 'posting' | 'deposit'; readonly evidenceId: string; readonly remittanceId?: string; readonly serviceLineId?: string },
): Promise<string | null> {
  const { rows } = await scope.client.query<{ id: string }>(
    `SELECT m.id FROM ledger_match m
      WHERE m.practice_id = $1 AND m.kind = $2 AND m.evidence_id = $3 AND m.reversed_at IS NULL
        AND ($4::uuid IS NULL OR m.remittance_id = $4) AND ($5::uuid IS NULL OR m.service_line_id = $5)`,
    [practiceId, match.kind, match.evidenceId, match.remittanceId ?? null, match.serviceLineId ?? null],
  );
  return rows[0]?.id ?? null;
}

/** Whether a match of the practice exists, and whether it stands. */
export async function matchState(scope: Scope, practiceId: string, matchId: string): Promise<'standing' | 'reversed' | 'missing'> {
  const { rows } = await scope.client.query<{ standing: boolean }>('SELECT reversed_at IS NULL AS standing FROM ledger_match WHERE id = $1 AND practice_id = $2', [matchId, practiceId]);
  const row = rows[0];
  return row === undefined ? 'missing' : row.standing ? 'standing' : 'reversed';
}

/** The posting exports waiting for the practice's posting template, and the template it has. */
export async function templateState(scope: Scope, practiceId: string): Promise<{ readonly settings: Awaited<ReturnType<typeof practiceLedgerSettings>>; readonly waiting: number }> {
  const { rows } = await scope.client.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM source_document WHERE practice_id = $1 AND kind = 'posting_export' AND status = 'stored' AND scan_status = 'clean'",
    [practiceId],
  );
  return { settings: await practiceLedgerSettings(scope, practiceId), waiting: rows[0]?.n ?? 0 };
}

// ---------------------------------------------------------------------------------------------------
// ROI statements
// ---------------------------------------------------------------------------------------------------

export type PrintState = 'printed' | 'printing' | 'failed';

export interface StatementSummary {
  readonly id: string;
  readonly periodFrom: string;
  readonly periodTo: string;
  readonly proofLevel: ProofLevel;
  readonly recoveredCents: string;
  readonly interestCents: string;
  /** A person's email, or null for the quarterly statement. */
  readonly generatedBy: string | null;
  readonly quarterly: boolean;
  readonly generatedAt: string;
  readonly print: PrintState;
  readonly pdfSha256: string | null;
}

/** A linked entry, as the statement shows it beneath its figure. */
export interface LinkedEntry {
  readonly id: string;
  readonly caseId: string;
  readonly stage: string;
  readonly amountCents: string;
  readonly effectiveOn: string;
  readonly allocated: boolean;
}

/** An entry-backed figure as stored, and as its linked entries give it now. */
export interface FigureView {
  readonly storedCents: string;
  readonly recomputedCents: string;
  readonly matches: boolean;
  readonly entries: readonly LinkedEntry[];
}

export interface StatementDetail extends StatementSummary {
  readonly feesCents: string;
  readonly approvedUnpostedCents: string;
  readonly actionableOpenCents: string;
  readonly pursuitHours: string;
  /** Net recovered over fees; null without fees. */
  readonly recoveredToFees: string | null;
  readonly recovered: FigureView;
  readonly interest: FigureView;
  readonly approvedUnposted: FigureView;
  /** The open cases actionable sums. */
  readonly actionableCases: readonly string[];
  /** Every entry-backed figure equals what its entries give (test matrix LED-11). */
  readonly matches: boolean;
  /**
   * The Verified gate's answer for this statement (docs/adr/0057): whether its recovered total reconciles to
   * posted or deposited cash under its proof level, from the ledger. The seal renders only from this.
   */
  readonly verified: ReportReconciliation;
}

function figureView(check: FigureCheck): FigureView {
  return {
    storedCents: centsToString(check.storedCents),
    recomputedCents: centsToString(check.recomputedCents),
    matches: check.matches,
    entries: check.entries.map((entry) => ({ id: entry.id, caseId: entry.caseId, stage: entry.stage, amountCents: centsToString(entry.amountCents), effectiveOn: entry.effectiveOn, allocated: entry.allocated })),
  };
}

type StoredStatementRow = Parameters<typeof storedStatement>[0];

interface StatementRow extends StoredStatementRow {
  readonly id: string;
  readonly practice_id: string;
  readonly document_key: string | null;
  readonly pdf_sha256: string | null;
  readonly generated_by: string | null;
  readonly generated_by_email: string | null;
  readonly generated_at: Date;
  readonly print_failed: boolean;
}

const STATEMENT_SELECT = `SELECT ${STATEMENT_COLUMNS}, s.practice_id, s.pdf_sha256, u.email AS generated_by_email,
         EXISTS (SELECT 1 FROM job_run j WHERE j.practice_id = s.practice_id AND j.job_type = 'roi_statement' AND j.idempotency_key = s.id::text AND j.outcome = 'failed') AS print_failed
    FROM roi_statement s LEFT JOIN "user" u ON u.id = s.generated_by`;

function summaryOf(row: StatementRow): StatementSummary {
  return {
    id: row.id,
    periodFrom: row.period_from,
    periodTo: row.period_to,
    proofLevel: row.proof_level,
    recoveredCents: row.recovered_cents,
    interestCents: row.interest_cents,
    generatedBy: row.generated_by === null ? null : (row.generated_by_email ?? 'a member of the practice'),
    quarterly: row.generated_by === null,
    generatedAt: row.generated_at.toISOString(),
    print: row.document_key !== null ? 'printed' : row.print_failed ? 'failed' : 'printing',
    pdfSha256: row.pdf_sha256,
  };
}

const STATEMENTS_PER_PAGE = 20;

export async function listStatements(scope: Scope, practiceId: string, requestedPage: number, requestId: string): Promise<ListPage<StatementSummary>> {
  const { rows: counted } = await scope.client.query<{ n: number }>('SELECT count(*)::int AS n FROM roi_statement WHERE practice_id = $1', [practiceId]);
  const total = counted[0]?.n ?? 0;
  const at = pageWindow(total, STATEMENTS_PER_PAGE, requestedPage);
  const rows = await readWithAudit(
    scope,
    { objectType: 'roi_statement', purpose: 'report_review', requestId },
    async (client) =>
      (await client.query<StatementRow>(`${STATEMENT_SELECT} WHERE s.practice_id = $1 ORDER BY s.generated_at DESC, s.id LIMIT ${String(STATEMENTS_PER_PAGE)} OFFSET ${String(at.offset)}`, [practiceId])).rows,
    (row) => ({ objectId: row.id, practiceId: row.practice_id }),
  );
  return { items: rows.map(summaryOf), page: at.page, pages: at.pages, total };
}

/** The practice's entries by ID (corrections' targets among them), from the ledger. */
async function ledgerById(scope: Scope, practiceId: string): Promise<Map<string, LedgerEntry>> {
  const { rows } = await scope.client.query<{ id: string; case_id: string; service_line_id: string | null; stage: LedgerEntry['stage']; amount_cents: string; evidence_kind: LedgerEntry['evidenceKind']; evidence_id: string; allocated: boolean; effective_on: string }>(
    'SELECT e.id, e.case_id, e.service_line_id, e.stage, e.amount_cents::text AS amount_cents, e.evidence_kind, e.evidence_id, e.allocated, e.effective_on::text AS effective_on FROM ledger_entry e WHERE e.practice_id = $1 ORDER BY e.seq',
    [practiceId],
  );
  return entriesById(
    rows.map((row) => ({
      id: row.id,
      caseId: row.case_id,
      serviceLineId: row.service_line_id,
      stage: row.stage,
      amountCents: parseCents(row.amount_cents),
      evidenceKind: row.evidence_kind,
      evidenceId: row.evidence_id,
      allocated: row.allocated,
      effectiveOn: row.effective_on,
    })),
  );
}

/** A statement with its figures recomputed from the entries it links (test matrix LED-11), or undefined when it is not the practice's. */
export async function statementOf(scope: Scope, practiceId: string, statementId: string, requestId: string): Promise<StatementDetail | undefined> {
  const [row] = await readWithAudit(
    scope,
    { objectType: 'roi_statement', purpose: 'report_review', requestId },
    async (client) => (await client.query<StatementRow>(`${STATEMENT_SELECT} WHERE s.id = $1 AND s.practice_id = $2`, [statementId, practiceId])).rows,
    (found) => ({ objectId: found.id, practiceId: found.practice_id }),
  );
  if (row === undefined) {
    return undefined;
  }
  const statement = storedStatement(row);
  const ledger = await ledgerById(scope, practiceId);
  const check = recomputeStatement(statement, ledger);
  // The Verified gate (docs/adr/0057), as the print job runs it: a statement whose figures no longer match their entries never carries the seal.
  const verified = reportReconciliation({
    report: { kind: 'roi_statement', id: row.id },
    proofLevel: statement.proofLevel,
    statedRecoveredCents: statement.recoveredCents,
    recoveredEntryIds: statement.links.recovered,
    ledger,
    figuresMatch: check.matches,
  });
  return {
    ...summaryOf(row),
    feesCents: row.fees_cents,
    approvedUnpostedCents: row.approved_unposted_cents,
    actionableOpenCents: row.actionable_open_cents,
    pursuitHours: row.pursuit_hours,
    recoveredToFees: ratioText(statement.recoveredCents, statement.feesCents),
    recovered: figureView(check.recovered),
    interest: figureView(check.interest),
    approvedUnposted: figureView(check.approvedUnposted),
    actionableCases: statement.links.actionableOpen,
    matches: check.matches,
    verified,
  };
}

/** The stored statement read back for its CSV. */
async function storedOf(scope: Scope, practiceId: string, statementId: string, requestId: string): Promise<StoredStatement | undefined> {
  const [row] = await readWithAudit(
    scope,
    { objectType: 'roi_statement', purpose: 'report_export', requestId },
    async (client) => (await client.query<StatementRow>(`${STATEMENT_SELECT} WHERE s.id = $1 AND s.practice_id = $2`, [statementId, practiceId])).rows,
    (found) => ({ objectId: found.id, practiceId: found.practice_id }),
  );
  return row === undefined ? undefined : storedStatement(row);
}

async function collect(source: AsyncIterable<Uint8Array>): Promise<Buffer> {
  const parts: Buffer[] = [];
  for await (const part of source) {
    parts.push(Buffer.from(part));
  }
  return Buffer.concat(parts);
}

export class StatementFileIntegrityError extends Error {
  override readonly name = 'StatementFileIntegrityError';
}

/** The printed PDF, checked against its SHA-256, the download audited; undefined when the statement is not printed. */
export async function statementPdf(scope: Scope, services: Services, practiceId: string, statementId: string, requestId: string): Promise<Uint8Array<ArrayBuffer> | undefined> {
  const { rows } = await scope.client.query<{ document_key: string | null; pdf_sha256: string | null }>('SELECT document_key, pdf_sha256 FROM roi_statement WHERE id = $1 AND practice_id = $2', [
    statementId,
    practiceId,
  ]);
  const row = rows[0];
  if (row?.document_key === null || row?.document_key === undefined || row.pdf_sha256 === null) {
    return undefined;
  }
  const cipher = await loadPracticeCipher(scope, services.keys, practiceId);
  const bytes = await collect(services.documents.read(cipher, row.document_key));
  if (createHash('sha256').update(bytes).digest('hex') !== row.pdf_sha256) {
    throw new StatementFileIntegrityError('the stored statement does not match the SHA-256 it recorded');
  }
  await recordAuditEvent(scope, { action: 'roi_statement_downloaded', objectType: 'roi_statement', objectId: statementId, practiceId, purpose: 'report_pdf', requestId });
  const out = new Uint8Array(new ArrayBuffer(bytes.length));
  out.set(bytes);
  return out;
}

/** The statement's CSV: its figures and the entries each sums (opaque IDs and amounts), the download audited. */
export async function statementCsv(scope: Scope, practiceId: string, statementId: string, requestId: string): Promise<string | undefined> {
  const statement = await storedOf(scope, practiceId, statementId, requestId);
  if (statement === undefined) {
    return undefined;
  }
  const csv = roiStatementCsv(statement, await ledgerById(scope, practiceId));
  await recordAuditEvent(scope, { action: 'roi_statement_downloaded', objectType: 'roi_statement', objectId: statementId, practiceId, purpose: 'report_csv', requestId });
  return csv;
}

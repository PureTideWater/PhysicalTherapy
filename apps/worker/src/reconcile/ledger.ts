import type { LedgerMatchKind, PracticeScope, ScopeClient } from '@tp/db/runtime';
import { type EvidenceKind, type LedgerEntry, type LedgerSettings, type LedgerStage, correctedEntry, entriesById, ledgerSettings } from '@tp/ledger';
import { type Cents, ZERO_CENTS, cents, parseCents } from '@tp/money';

/**
 * The reconcile step's reads and writes of the ledger (PRD 13; migration 20261023120000): entries and
 * matches as @tp/ledger reads them, and the inserts every matching service makes. Every write is
 * idempotent: a match is inserted once per piece of evidence (and case line) while it stands, and an
 * entry once per match, line and stage, so a replayed reconcile writes nothing twice (JOB-01). The
 * database checks each entry's evidence, sign and match whoever writes it.
 */

export type Scope = PracticeScope<ScopeClient>;

/** One reconcile of a practice at a time: matching and allocation read what the last one wrote. */
export async function lockLedger(scope: Scope, practiceId: string): Promise<void> {
  await scope.client.query("SELECT pg_advisory_xact_lock(hashtextextended('ledger:' || $1::text, 0))", [practiceId]);
}

/** The practice's ledger settings (proof level, posting template), from practice.settings. */
export async function practiceLedgerSettings(scope: Scope, practiceId: string): Promise<LedgerSettings> {
  const { rows } = await scope.client.query<{ settings: unknown }>('SELECT settings FROM practice WHERE id = $1', [practiceId]);
  return ledgerSettings(rows[0]?.settings ?? {});
}

export interface StoredEntry extends LedgerEntry {
  readonly matchId: string | null;
}

interface EntryRow {
  readonly id: string;
  readonly case_id: string;
  readonly service_line_id: string | null;
  readonly stage: LedgerStage;
  readonly amount_cents: string;
  readonly evidence_kind: EvidenceKind;
  readonly evidence_id: string;
  readonly match_id: string | null;
  readonly allocated: boolean;
  readonly effective_on: string;
}

const ENTRY_COLUMNS = 'e.id, e.case_id, e.service_line_id, e.stage, e.amount_cents::text, e.evidence_kind, e.evidence_id, e.match_id, e.allocated, e.effective_on::text';

function entryOf(row: EntryRow): StoredEntry {
  return {
    id: row.id,
    caseId: row.case_id,
    serviceLineId: row.service_line_id,
    stage: row.stage,
    amountCents: parseCents(row.amount_cents),
    evidenceKind: row.evidence_kind,
    evidenceId: row.evidence_id,
    matchId: row.match_id,
    allocated: row.allocated,
    effectiveOn: row.effective_on,
  };
}

/** The practice's entries in ledger order. */
export async function ledgerEntries(scope: Scope, practiceId: string): Promise<StoredEntry[]> {
  const { rows } = await scope.client.query<EntryRow>(`SELECT ${ENTRY_COLUMNS} FROM ledger_entry e WHERE e.practice_id = $1 ORDER BY e.seq`, [practiceId]);
  return rows.map(entryOf);
}

export interface StoredMatch {
  readonly id: string;
  readonly kind: LedgerMatchKind;
  readonly claimId: string | null;
  readonly postingRowId: string | null;
  readonly eftRowId: string | null;
  readonly providerAdjustmentId: string | null;
  readonly remittanceId: string;
  readonly serviceLineId: string | null;
  readonly outcome: 'approved' | 'decreased' | 'no_change' | null;
  readonly level: 'claim' | 'check' | 'batch' | null;
  readonly allocated: boolean;
  readonly matchedBy: string | null;
  readonly standing: boolean;
}

interface MatchRow {
  readonly id: string;
  readonly kind: LedgerMatchKind;
  readonly claim_id: string | null;
  readonly posting_row_id: string | null;
  readonly eft_row_id: string | null;
  readonly provider_adjustment_id: string | null;
  readonly remittance_id: string;
  readonly service_line_id: string | null;
  readonly outcome: StoredMatch['outcome'];
  readonly level: StoredMatch['level'];
  readonly allocated: boolean;
  readonly matched_by: string | null;
  readonly standing: boolean;
}

/** The practice's matches, standing and reversed, in the order they were made. */
export async function ledgerMatches(scope: Scope, practiceId: string): Promise<StoredMatch[]> {
  const { rows } = await scope.client.query<MatchRow>(
    `SELECT m.id, m.kind, m.claim_id, m.posting_row_id, m.eft_row_id, m.provider_adjustment_id, m.remittance_id, m.service_line_id, m.outcome, m.level, m.allocated, m.matched_by,
            m.reversed_at IS NULL AS standing
       FROM ledger_match m WHERE m.practice_id = $1 ORDER BY m.matched_at, m.id`,
    [practiceId],
  );
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    claimId: row.claim_id,
    postingRowId: row.posting_row_id,
    eftRowId: row.eft_row_id,
    providerAdjustmentId: row.provider_adjustment_id,
    remittanceId: row.remittance_id,
    serviceLineId: row.service_line_id,
    outcome: row.outcome,
    level: row.level,
    allocated: row.allocated,
    matchedBy: row.matched_by,
    standing: row.standing,
  }));
}

export interface NewMatch {
  readonly kind: LedgerMatchKind;
  readonly claimId?: string;
  readonly postingRowId?: string;
  readonly eftRowId?: string;
  readonly providerAdjustmentId?: string;
  readonly remittanceId: string;
  readonly serviceLineId?: string;
  readonly outcome?: 'approved' | 'decreased' | 'no_change';
  readonly level?: 'claim' | 'check' | 'batch';
  readonly allocated?: boolean;
  /** The person who matched by hand; null for the reconcile job. */
  readonly matchedBy: string | null;
}

/** Records a standing match; null when one already stands for the same evidence (and case line). */
export async function insertMatch(scope: Scope, practiceId: string, match: NewMatch): Promise<string | null> {
  const { rows } = await scope.client.query<{ id: string }>(
    `INSERT INTO ledger_match (practice_id, kind, claim_id, posting_row_id, eft_row_id, provider_adjustment_id, remittance_id, service_line_id, outcome, level, allocated, matched_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (kind, evidence_id, service_line_id) WHERE reversed_at IS NULL DO NOTHING
     RETURNING id`,
    [
      practiceId,
      match.kind,
      match.claimId ?? null,
      match.postingRowId ?? null,
      match.eftRowId ?? null,
      match.providerAdjustmentId ?? null,
      match.remittanceId,
      match.serviceLineId ?? null,
      match.outcome ?? null,
      match.level ?? null,
      match.allocated ?? false,
      match.matchedBy,
    ],
  );
  return rows[0]?.id ?? null;
}

export interface NewEntry {
  readonly caseId: string;
  readonly serviceLineId: string | null;
  readonly stage: LedgerStage;
  readonly amountCents: Cents;
  readonly evidenceKind: EvidenceKind;
  readonly evidenceId: string;
  readonly matchId: string | null;
  readonly allocated?: boolean;
  /** The date the money moved; the database dates every entry from its evidence whatever is given. */
  readonly effectiveOn?: string;
  /** The person; null for the reconcile job. */
  readonly createdBy: string | null;
  /** A correction's reason, already encrypted with the practice's key. */
  readonly reason?: string;
}

/** Writes an entry; null when the match already made this line's entry of this stage (or the entry is already reversed). */
export async function insertEntry(scope: Scope, practiceId: string, entry: NewEntry): Promise<string | null> {
  const { rows } = await scope.client.query<{ id: string }>(
    `INSERT INTO ledger_entry (practice_id, case_id, service_line_id, stage, amount_cents, evidence_kind, evidence_id, match_id, allocated, effective_on, created_by, reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [
      practiceId,
      entry.caseId,
      entry.serviceLineId,
      entry.stage,
      entry.amountCents.toString(),
      entry.evidenceKind,
      entry.evidenceId,
      entry.matchId,
      entry.allocated ?? false,
      entry.effectiveOn ?? null,
      entry.createdBy,
      entry.reason ?? null,
    ],
  );
  return rows[0]?.id ?? null;
}

/** What the ledger holds for one case line: its approvals (net, by the match that made them, and from payer responses) and what was taken back. */
export interface LineLedger {
  /** Net approved for the line. */
  readonly approvedCents: Cents;
  /** Net recouped for the line (zero or negative). */
  readonly recoupedCents: Cents;
  /** Net approved by each claim match (an approval's reversal counts against its match). */
  readonly approvedByMatch: ReadonlyMap<string, Cents>;
  /** Net approved from payer responses that accepted an amount (no remittance stands behind it yet, or one confirmed it). */
  readonly approvedByResponsesCents: Cents;
}

/** Each line's ledger, from the practice's entries. */
export function lineLedgers(entries: readonly StoredEntry[]): Map<string, LineLedger> {
  const ledger = entriesById(entries);
  const lines = new Map<string, { approved: bigint; recouped: bigint; byResponses: bigint; byMatch: Map<string, Cents> }>();
  for (const entry of entries) {
    if (entry.serviceLineId === null) {
      continue;
    }
    // A correction counts as the entry it finally corrects, with that entry's evidence.
    const corrected = correctedEntry(entry, ledger);
    const stage = corrected.stage;
    if (stage !== 'approved' && stage !== 'recouped') {
      continue;
    }
    const line = lines.get(entry.serviceLineId) ?? { approved: 0n, recouped: 0n, byResponses: 0n, byMatch: new Map<string, Cents>() };
    if (stage === 'approved') {
      line.approved += entry.amountCents;
      if (corrected.evidenceKind === 'payer_response') {
        line.byResponses += entry.amountCents;
      }
      if (entry.matchId !== null) {
        line.byMatch.set(entry.matchId, cents((line.byMatch.get(entry.matchId) ?? ZERO_CENTS) + entry.amountCents));
      }
    } else {
      line.recouped += entry.amountCents;
    }
    lines.set(entry.serviceLineId, line);
  }
  return new Map(
    [...lines].map(([id, line]) => [id, { approvedCents: cents(line.approved), recoupedCents: cents(line.recouped), approvedByMatch: line.byMatch, approvedByResponsesCents: cents(line.byResponses) }]),
  );
}

export const EMPTY_LINE_LEDGER: LineLedger = { approvedCents: ZERO_CENTS, recoupedCents: ZERO_CENTS, approvedByMatch: new Map(), approvedByResponsesCents: ZERO_CENTS };

/** What is approved for a line and not yet taken back: what a recoupment can take (zero or more). */
export function approvedRemaining(line: LineLedger): Cents {
  const remaining = line.approvedCents + line.recoupedCents;
  return cents(remaining > 0n ? remaining : 0n);
}

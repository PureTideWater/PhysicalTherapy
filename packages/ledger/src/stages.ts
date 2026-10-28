import { type Cents, ZERO_CENTS, negateCents } from '@tp/money';

/**
 * The ledger's stages, evidence and signs (PRD 13, Entries; Data dictionary, ledger_entry). The same
 * rules are held by the database (migration 20261023120000_recovery_ledger.sql) for every role; these
 * are the pure statement of them, which the matching code builds entries with and the tests check.
 */

/** Ledger entry stages (Data dictionary, `ledger_entry.stage`). */
export const LEDGER_STAGES = ['approved', 'posted', 'deposited', 'recouped', 'reversed', 'adjusted', 'interest'] as const;
export type LedgerStage = (typeof LEDGER_STAGES)[number];

/** The stage a practice uses as proof of recovery (PRD 13; Data dictionary, practice.settings: proof level). */
export const PROOF_LEVELS = ['posted', 'deposited'] as const;
export type ProofLevel = (typeof PROOF_LEVELS)[number];

/** PRD 20, Proof level for "recovered": posted, with deposited where exports exist (a practice's setting). */
export const DEFAULT_PROOF_LEVEL: ProofLevel = 'posted';

/**
 * The stages a total counts. A reversed or adjusted entry corrects another entry and counts toward that
 * entry's stage: a reversal of a posting offsets the posted total, never the approved one, so totals
 * never mix stages (PRD 12, What a customer sees as the headline).
 */
export const COUNTED_STAGES = ['approved', 'posted', 'deposited', 'recouped', 'interest'] as const;
export type CountedStage = (typeof COUNTED_STAGES)[number];

/** The stages that correct another entry: their evidence is that entry. */
export const CORRECTING_STAGES = ['reversed', 'adjusted'] as const;
export type CorrectingStage = (typeof CORRECTING_STAGES)[number];

/** What an entry's evidence is (Data dictionary, ledger_entry.evidence_kind). */
export const EVIDENCE_KINDS = ['claim', 'payer_response', 'posting_row', 'eft_row', 'provider_adjustment', 'ledger_entry'] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

/** PRD 13, Entries: the evidence each stage carries. */
export const STAGE_EVIDENCE: Readonly<Record<LedgerStage, readonly EvidenceKind[]>> = {
  // A payer response accepting an amount, or the adjusted remittance's claim.
  approved: ['claim', 'payer_response'],
  posted: ['posting_row'],
  deposited: ['eft_row'],
  // A PLB WO, or the reversing (or lower corrected) claim.
  recouped: ['provider_adjustment', 'claim'],
  // A PLB L6, paid or taken back; a claim (AMT I) only on entries written before docs/adr/0084.
  interest: ['provider_adjustment', 'claim'],
  // The user action on the entry it undoes or corrects.
  reversed: ['ledger_entry'],
  adjusted: ['ledger_entry'],
};

/** PRD 13, Entries, Sign. */
export type StageSign = 'positive' | 'negative' | 'offsetting' | 'signed';

export const STAGE_SIGN: Readonly<Record<LedgerStage, StageSign>> = {
  approved: 'positive',
  posted: 'positive',
  deposited: 'positive',
  // Interest a PLB L6 pays is positive, interest it takes back negative (docs/adr/0084).
  interest: 'signed',
  recouped: 'negative',
  reversed: 'offsetting',
  adjusted: 'signed',
};

/**
 * The stages whose amount may be a pro-rata share, flagged allocated: a partial posting's (PRD 13,
 * Matching step 2), interest covering several lines, a payer response's accepted amount split across
 * the lines it covers.
 */
export const ALLOCATABLE_STAGES: readonly LedgerStage[] = ['approved', 'posted', 'deposited', 'interest'];

export class LedgerError extends Error {
  override readonly name: string = 'LedgerError';
}

export function isLedgerStage(value: unknown): value is LedgerStage {
  return typeof value === 'string' && (LEDGER_STAGES as readonly string[]).includes(value);
}

/**
 * The label of a recovered dollar figure (docs/brand/BRAND.md, section 7; PRD 7): "Recovered" never stands
 * without the proof level its cash is proved by, posted or deposited.
 */
export function recoveredLabel(level: ProofLevel): string {
  return `Recovered (${level})`;
}

export function isProofLevel(value: unknown): value is ProofLevel {
  return typeof value === 'string' && (PROOF_LEVELS as readonly string[]).includes(value);
}

export function isCorrecting(stage: LedgerStage): stage is CorrectingStage {
  return stage === 'reversed' || stage === 'adjusted';
}

/**
 * One ledger entry as the totals read it. Entries are append-only: a correction is a new entry naming
 * the one it corrects (`corrects`), never an edit.
 */
export interface LedgerEntry {
  readonly id: string;
  readonly caseId: string;
  /** Null for an entry of the case as a whole (a payer response accepting an amount). */
  readonly serviceLineId: string | null;
  readonly stage: LedgerStage;
  /** Signed integer cents. */
  readonly amountCents: Cents;
  readonly evidenceKind: EvidenceKind;
  readonly evidenceId: string;
  /** A pro-rata share of a partial posting (PRD 13, Matching step 2). */
  readonly allocated: boolean;
  /** The calendar date the money moved, from the evidence (a correction's is the entry's it corrects). */
  readonly effectiveOn: string;
}

/** Why an entry breaks the ledger's rules; empty when it keeps them. */
export function entryProblems(entry: LedgerEntry, target?: LedgerEntry): string[] {
  const problems: string[] = [];
  const sign = STAGE_SIGN[entry.stage];
  const amount = entry.amountCents;
  if (!STAGE_EVIDENCE[entry.stage].includes(entry.evidenceKind)) {
    problems.push(`a ${entry.stage} entry's evidence is a ${STAGE_EVIDENCE[entry.stage].join(' or ')}`);
  }
  if (sign === 'positive' && amount <= ZERO_CENTS) {
    problems.push(`a ${entry.stage} entry is positive`);
  }
  if (sign === 'negative' && amount >= ZERO_CENTS) {
    problems.push('a recouped entry is negative');
  }
  if (sign === 'signed' && amount === ZERO_CENTS) {
    problems.push(entry.stage === 'interest' ? 'an interest entry moves an amount' : 'an adjustment changes an amount');
  }
  if (entry.allocated && !ALLOCATABLE_STAGES.includes(entry.stage)) {
    problems.push(`a ${entry.stage} entry is never allocated`);
  }
  if (isCorrecting(entry.stage)) {
    if (target === undefined || target.id !== entry.evidenceId) {
      problems.push(`a ${entry.stage} entry names the entry it corrects`);
    } else {
      if (isCorrecting(target.stage) && !(entry.stage === 'reversed' && target.stage === 'adjusted')) {
        problems.push('a correction corrects an entry of a counted stage, or a reversal an adjustment');
      }
      if (target.caseId !== entry.caseId || target.serviceLineId !== entry.serviceLineId) {
        problems.push('a correction is of its own case and line');
      }
      if (entry.stage === 'reversed' && amount !== negateCents(target.amountCents)) {
        problems.push('a reversal offsets its entry exactly');
      }
    }
  }
  return problems;
}

/**
 * The counted entry an entry finally corrects: itself for an entry of a counted stage; for a reversal or
 * an adjustment, the entry it names; for a reversal of an adjustment (a reversed match nets its
 * adjustments to zero too, LED-07), the entry the adjustment corrects. The targets are found in `byId`.
 */
export function correctedEntry(entry: LedgerEntry, byId: ReadonlyMap<string, LedgerEntry>): LedgerEntry & { readonly stage: CountedStage } {
  if (!isCorrecting(entry.stage)) {
    return entry as LedgerEntry & { readonly stage: CountedStage };
  }
  const target = byId.get(entry.evidenceId);
  const root = target !== undefined && target.stage === 'adjusted' && entry.stage === 'reversed' ? byId.get(target.evidenceId) : target;
  if (root === undefined || isCorrecting(root.stage)) {
    throw new LedgerError('a correction counts toward the stage of the entry it corrects, which the ledger must hold');
  }
  return root as LedgerEntry & { readonly stage: CountedStage };
}

/**
 * The stage an entry counts toward: its own, or for a reversal or adjustment the stage of the entry it
 * corrects (correctedEntry), found in `byId`.
 */
export function countedStage(entry: LedgerEntry, byId: ReadonlyMap<string, LedgerEntry>): CountedStage {
  return correctedEntry(entry, byId).stage;
}

/**
 * @tp/ledger: signed, append-only ledger entries, matching to remittances, posting and EFT
 * exports, and the ROI statement (milestone 9). "Recovered" is always derived from entries.
 */

/** Ledger entry stages (Data dictionary, `ledger_entry.stage`). */
export const LEDGER_STAGES = [
  'approved',
  'posted',
  'deposited',
  'recouped',
  'reversed',
  'adjusted',
  'interest',
] as const;
export type LedgerStage = (typeof LEDGER_STAGES)[number];

/** The stage a practice uses as proof of recovery (PRD section 13). */
export const PROOF_LEVELS = ['posted', 'deposited'] as const;
export type ProofLevel = (typeof PROOF_LEVELS)[number];

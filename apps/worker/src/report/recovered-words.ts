import type { ProofLevel } from '@tp/ledger';

/**
 * "Recovered" by the cash that proves it, for each proof level (Change Order 001, CO-11; docs/brand/BRAND.md,
 * section 7; docs/adr/0056). Each phrase is written out whole, so the label never stands without posted or
 * deposited and the copy lint (tools/brand-copy) reads the words a person sees. The ROI statement's PDF and its
 * web page say the same, and share here too what its approval and actionable figures say.
 */

/** The ROI statement's recovered figure, named with its proof level. */
export const RECOVERED_PRINCIPAL_LABELS: Readonly<Record<ProofLevel, string>> = {
  posted: 'Recovered principal, net (posted)',
  deposited: 'Recovered principal, net (deposited)',
};

/** What the recovered figure says when it lists no entry. */
export const NO_RECOVERED_CASH: Readonly<Record<ProofLevel, string>> = {
  posted: 'No cash was recovered (posted) in the period.',
  deposited: 'No cash was recovered (deposited) in the period.',
};

/** What the statement's payer-approved-not-yet-at-the-proof-level figure says when it lists no entry: the stage it waits for. */
export const NOTHING_APPROVED_WAITING: Readonly<Record<ProofLevel, string>> = {
  posted: 'Nothing approved is waiting to be posted.',
  deposited: 'Nothing approved is waiting to be deposited.',
};

/** The statement's actionable figure, named as the practice home and Cases name the cases it counts. */
export const ACTIONABLE_OPEN_LABEL = 'Actionable in cases still being worked';

/**
 * What the statement's actionable figure is (docs/adr/0082): counted once, when the statement was generated, through
 * the one actionable predicate; the statement keeps the cases it counted, not their lines, so the figure is not
 * recomputed later from them. One wording for the web page (above the case links), the PDF (before the case ids) and
 * a statement that counted no case.
 */
export const ACTIONABLE_OPEN_NOTE = 'Counted when the statement was generated, as the practice home and Cases count: each case’s lines still actionable on their pricing in effect. The figure is not recomputed later from the cases it counted.';

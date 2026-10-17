import type { ProofLevel } from '@tp/ledger';

/**
 * "Recovered" by the cash that proves it, for each proof level (Change Order 001, CO-11; docs/brand/BRAND.md,
 * section 7; docs/adr/0056). Each phrase is written out whole, so the label never stands without posted or
 * deposited and the copy lint (tools/brand-copy) reads the words a person sees. The ROI statement's PDF and its
 * web page say the same.
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

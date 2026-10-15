/**
 * @tp/packets: packet assembly, the deterministic verifier, identifier insertion at export, and PDF
 * and CSV export with hashes (milestone 8). The verifier is a hard gate with no bypass.
 */

/** Kinds of payer response a submission can receive (Data dictionary, `payer_response.kind`). */
export const PAYER_RESPONSE_KINDS = [
  'accepted',
  'partial',
  'denied',
  'info_requested',
  'reprocessed_no_change',
] as const;
export type PayerResponseKind = (typeof PAYER_RESPONSE_KINDS)[number];

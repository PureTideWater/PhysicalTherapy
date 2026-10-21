import type { PracticeScope, PricingCheckResult, ScopeClient } from '@tp/db/runtime';
import { cents, centsToString } from '@tp/money';
import type { PacketContent } from '@tp/packets';
import { type LinePricingNow, type PricingCheckCause, linePricingNow, packetPricingCheck } from '@tp/worker/pricing';

/**
 * Whether a packet version's pricing is still current, as the builder, the review and the submissions pages
 * show it (audit item #4; docs/adr/0061; migration 20261103090000's packet_version_pricing_check()). A
 * version is approved, exported and attested only while every line still carries its service line's pricing in
 * effect, under a rule release not withdrawn and the mapping in force for its plan, with its contract version
 * signed off and covering the service date; the database refuses each step otherwise, and these pages say so first
 * with the figures then and now.
 *
 * The "now" figures are the service line's pricing in effect (service_line_priced_in_effect()), never
 * recomputed here. Nothing refreshes a case automatically yet (that is PR 11), and a stale line never becomes
 * current again, so waiting changes nothing: the one step available is to write the stale line off on the case page
 * (it leaves this dispute), then write, approve and export the packet again. Cents are decimal integer text.
 */

type Scope = PracticeScope<ScopeClient>;

export interface PricingTotals {
  readonly expectedCents: string;
  readonly varianceCents: string;
}

export interface PricingNowView {
  /** The database's verdict on the version: 'current', or the most severe cause across its lines. */
  readonly status: PricingCheckResult;
  /** The lines whose pricing is no longer current, in row order, with their figures then and now. */
  readonly lines: readonly LinePricingNow[];
  /**
   * The version's totals as written, and as they stand on the pricing in effect now: null while a stale line is
   * not priced again yet or is no longer priced, since no total can be stated for it.
   */
  readonly totals: { readonly was: PricingTotals; readonly now: PricingTotals | null };
}

/** What each cause means for a line, in words (no value, no identifier). */
export const PRICING_CAUSE_TEXT: Readonly<Record<PricingCheckCause, string>> = {
  PRICING_NOT_IN_EFFECT: 'Priced again since it joined the case (an accepted re-run, or a later run of its period): this version no longer carries its pricing in effect',
  RELEASE_WITHDRAWN: 'Its rule release was withdrawn since it was priced, because the release’s content was wrong',
  MAPPING_NOT_IN_FORCE: 'Its plan’s mapping was corrected since it was priced: a correction now maps the plan to another contract or agreement on its service date',
  CONTRACT_VERSION_NOT_SIGNED_OFF: 'Its contract version is no longer signed off: a correction replaced it since it was priced',
  CONTRACT_VERSION_NOT_IN_FORCE: 'Its contract version no longer covers the service date: an amendment since closed it before that date',
};

const REMEDY =
  'Nothing refreshes the case automatically yet, and refreshing a case on new pricing is not available yet: write the stale line off on the case page (it leaves this dispute), then write, approve and export the packet again without it';

/**
 * Why a step is refused while the version's pricing is not current, with the remedy (the page shows the lines).
 * The approval and the export are sentences the builder shows beside a disabled button; the attestation and the
 * writing of a version are refusals, which the forms show as "Refused: …".
 */
export const PRICING_BLOCKED_TEXT = {
  approval: `This version cannot be approved: a line’s pricing is no longer current (see Pricing now), and a packet is approved only on the pricing in effect. ${REMEDY}.`,
  export: `This version cannot be exported: a line’s pricing is no longer current (see Pricing now), and a packet is exported only on the pricing in effect. ${REMEDY}.`,
  // The founder's ruling of 2026-10-20 (docs/adr/0061): never attested; re-price, a new version, a new export; logged sent without sign-off if it already went.
  attestation:
    'this export’s pricing is no longer current: it went stale after the export, so its files no longer show the pricing in effect and it is never attested (if it already went to the payer, the practice logs it on its submissions page as sent without sign-off); the stale lines are re-priced, and the practice writes the stale line off on the case page, then writes, approves and exports the packet again',
  write:
    'a line of the case is on pricing no longer current, and a packet is written only on the pricing in effect; nothing refreshes the case automatically yet: write the stale line off on the case page (it leaves this dispute), then write, approve and export the packet again without it',
} as const;

/** A sum of decimal integer cents (each already checked by the database), as decimal integer text. */
function sum(values: readonly string[]): string {
  return centsToString(cents(values.reduce((total, value) => total + BigInt(value), 0n)));
}

/** The figure a line stands at now: its own when current, its new priced line's when priced again; null when none can be stated. */
function nowFigures(line: LinePricingNow): PricingTotals | null {
  if (line.check === 'current') {
    return line.was.expectedCents === null || line.was.varianceCents === null ? null : { expectedCents: line.was.expectedCents, varianceCents: line.was.varianceCents };
  }
  if (line.now === null || line.now.expectedCents === null || line.now.varianceCents === null) {
    return null;
  }
  return { expectedCents: line.now.expectedCents, varianceCents: line.now.varianceCents };
}

/**
 * The version's pricing now: the database's verdict, its stale lines with their figures then and now, and the
 * totals then and now. An audited read of the lines' amounts (purpose packet_build).
 */
export async function pricingNow(scope: Scope, input: { readonly practiceId: string; readonly content: PacketContent; readonly requestId: string }): Promise<PricingNowView> {
  const status = await packetPricingCheck(scope.client, input.content);
  const lines = await linePricingNow(scope, { practiceId: input.practiceId, content: input.content, requestId: input.requestId });
  const was: PricingTotals = { expectedCents: sum(input.content.lines.map((line) => line.expected_cents)), varianceCents: sum(input.content.lines.map((line) => line.variance_cents)) };
  const figures = lines.map(nowFigures);
  const now = figures.every((figure): figure is PricingTotals => figure !== null)
    ? { expectedCents: sum(figures.map((figure) => figure.expectedCents)), varianceCents: sum(figures.map((figure) => figure.varianceCents)) }
    : null;
  return { status, lines: lines.filter((line) => line.check !== 'current'), totals: { was, now } };
}

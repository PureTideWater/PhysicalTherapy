import { type Cents } from '@tp/money';

/**
 * What a customer sees as the headline (PRD 12; PRD 7: "Dollar figures carry their stage label
 * everywhere; the word 'recovered' appears only beside stage-five amounts"; J12: "headline totals
 * never mix stages"). Three numbers, never one: actionable (what the packets ask for), payer approved
 * (what has been accepted), recovered (what has posted, net). The flagged and validated figures sit
 * below them with their labels: flagged as a count with an investigatory range, never as a dollar
 * claim.
 */

export interface HeadlineInput {
  readonly actionableCents: Cents;
  readonly actionableLines: number;
  readonly payerApprovedCents: Cents;
  readonly recoveredCents: Cents;
  readonly flaggedLines: number;
  readonly flaggedRangeLowCents: Cents;
  readonly flaggedRangeHighCents: Cents;
  readonly validatedLines: number;
  readonly validatedCents: Cents;
}

export interface HeadlineFigure {
  readonly stage: 'actionable' | 'payer_approved' | 'recovered';
  readonly label: string;
  readonly cents: Cents;
  readonly note: string;
}

export interface Headline {
  readonly figures: readonly [HeadlineFigure, HeadlineFigure, HeadlineFigure];
  readonly flagged: { readonly stage: 'flagged'; readonly label: string; readonly lines: number; readonly rangeLowCents: Cents; readonly rangeHighCents: Cents; readonly note: string };
  readonly validated: { readonly stage: 'validated'; readonly label: string; readonly lines: number; readonly cents: Cents; readonly note: string };
}

/**
 * The five stages' labels. Recovered names the cash that proves it (docs/brand/BRAND.md, section 7:
 * "Recovered" is never shown without "posted" or "deposited"); where the practice's proof level is at hand a
 * recovered dollar figure names that level alone (recoveredLabel in @tp/ledger).
 */
export const STAGE_LABELS = {
  flagged: 'Flagged (investigatory)',
  validated: 'Validated',
  actionable: 'Actionable',
  payer_approved: 'Payer approved',
  recovered: 'Recovered (posted or deposited)',
} as const;

export function headline(input: HeadlineInput): Headline {
  return {
    figures: [
      { stage: 'actionable', label: STAGE_LABELS.actionable, cents: input.actionableCents, note: `${String(input.actionableLines)} lines in cases, inside their dispute windows and above materiality` },
      { stage: 'payer_approved', label: STAGE_LABELS.payer_approved, cents: input.payerApprovedCents, note: 'what payers have agreed to pay on the lines they corrected' },
      { stage: 'recovered', label: STAGE_LABELS.recovered, cents: input.recoveredCents, note: 'posted, net of recoupments and reversals' },
    ],
    flagged: {
      stage: 'flagged',
      label: STAGE_LABELS.flagged,
      lines: input.flaggedLines,
      rangeLowCents: input.flaggedRangeLowCents,
      rangeHighCents: input.flaggedRangeHighCents,
      note: 'statistical screening of lines that cannot be priced; never a claim and in no total',
    },
    validated: {
      stage: 'validated',
      label: STAGE_LABELS.validated,
      lines: input.validatedLines,
      cents: input.validatedCents,
      note: 'priced under a signed-off contract with a trace; expected allowed above observed allowed',
    },
  };
}

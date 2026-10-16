import type { EvidenceGapCode, EvidenceKind, MismatchCode, SourceKind } from '@tp/packets';

/**
 * The packet screens' words for the codes a version holds (PRD 7, Packet builder; Submissions and
 * responses): the verifier's mismatches, the evidence list's kinds and gaps, the numbered sources a
 * sentence cites, and a follow-up's state. Fixed words, never a value from the record.
 */

export const MISMATCH_TEXT: Readonly<Record<MismatchCode, string>> = {
  figure_not_in_input: 'a figure that is not in the packet’s input records',
  sentence_without_citation: 'a sentence that cites none of the numbered sources',
  unknown_citation: 'a citation marker that names no source of this version',
  unknown_placeholder: 'an identifier placeholder that names no schedule row or kind',
  empty_narrative: 'an empty narrative',
};

export const FIGURE_KIND_TEXT: Readonly<Record<string, string>> = {
  amount: 'amount',
  percent: 'percentage',
  date: 'date',
  month: 'month',
  month_day: 'day of a month',
  code: 'code',
  modifier: 'modifier',
  number: 'number or count',
  identifier: 'identifier',
  placeholder: 'placeholder',
  citation: 'citation',
};

/** A mismatch in words: what it is, and of what kind. */
export function mismatchText(code: MismatchCode, kind: string | null): string {
  const what = MISMATCH_TEXT[code];
  return kind === null || code !== 'figure_not_in_input' ? what : `${what} (${FIGURE_KIND_TEXT[kind] ?? kind})`;
}

export const EVIDENCE_KIND_TEXT: Readonly<Record<EvidenceKind, string>> = {
  contract_document: 'Contract document',
  remittance: 'Remittance (835)',
  rule_release: 'Rule release',
  attached_document: 'Attached document',
};

export const EVIDENCE_GAP_TEXT: Readonly<Record<EvidenceGapCode, string>> = {
  interest_rate_unknown: 'The prompt-pay rule states no interest rate, so interest is not computed.',
  interest_business_days: 'The prompt-pay rule counts business days, which the interest line does not compute.',
  prompt_pay_rule_missing: 'No prompt-pay rule for this state is in the rule release the lines were priced under.',
  prompt_pay_rule_not_in_effect: 'The state’s prompt-pay rule is not in effect on the packet’s date.',
  claim_received_date_unknown: 'The remittance does not say when the payer received the claim (DTM 050), so interest is not computed for it.',
  contract_document_hash_unknown: 'The contract document’s SHA-256 is not on record.',
};

export const SOURCE_KIND_TEXT: Readonly<Record<SourceKind, string>> = {
  citation: 'the contract citation',
  rule_release: 'the rule release',
  line_schedule: 'the line schedule',
  interest: 'the interest line',
  evidence: 'an evidence item',
};

/** A follow-up's state on a day: due (its date has come and nothing answered), waiting, or answered. */
export type FollowUpState = 'answered' | 'due' | 'waiting';

export function followUpState(followUpOn: string, asOf: string, answered: boolean): FollowUpState {
  return answered ? 'answered' : followUpOn <= asOf ? 'due' : 'waiting';
}

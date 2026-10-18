import type { EvidenceGapCode, EvidenceKind, MismatchCode, SourceKind } from '@tp/packets';
import type { DeadlineStatus, DeadlineUnverifiedCause } from '@tp/triage';

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
  hidden_character: 'a hidden character, one that prints as nothing or as something else (a zero-width space, a soft hyphen, a direction control); delete it',
  unreadable_figure: 'a figure in digits other than 0 to 9, which the verifier cannot check; write it in 0 to 9',
  identifier_in_narrative: 'one of this case’s identifiers (a patient’s name, a member ID or a claim number); write its placeholder, which the export fills in from the record',
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

/**
 * What a mismatch's list item shows beside its words: the figure, placeholder or marker as written, a
 * hidden character as its code points (it shows as nothing), and nothing for an identifier (the stored
 * narrative marks it where it is) or a sentence.
 */
export function mismatchShown(code: MismatchCode, written: string): string | null {
  switch (code) {
    case 'figure_not_in_input':
    case 'unknown_placeholder':
    case 'unknown_citation':
    case 'unreadable_figure':
      return written;
    case 'hidden_character':
      return [...written].map((char) => `U+${(char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}`).join(' ');
    case 'identifier_in_narrative':
    case 'sentence_without_citation':
    case 'empty_narrative':
      return null;
  }
}

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

/** A deadline's status as a label (never a color alone; brand.md). */
export const DEADLINE_STATUS_TEXT: Readonly<Record<DeadlineStatus, string>> = {
  verified: 'Deadline verified',
  unverified: 'Deadline not verified',
  not_applicable: 'No window',
};

/**
 * Why a deadline is not verified (D17), in words a billing manager can act on: what is missing and who
 * supplies it. A deadline is verified only from evidence a person signed off: a contract version's own
 * window with its page, quote and hash, or a Medicare window record verified to L2. A signed-off version
 * never changes, so evidence added later is on a corrected or amended version, and verifies the lines
 * priced under it.
 */
export const DEADLINE_CAUSE_TEXT: Readonly<Record<DeadlineUnverifiedCause, string>> = {
  COMMERCIAL_DEFAULT:
    'These lines’ window is the rule release’s default for commercial plans, which is never verified: the contract version cites no window of its own. Ask the contract specialist to cite and verify the contract’s dispute window (its page, quote and hash) on an amended or corrected version; lines priced under it once it is signed off have a verified deadline.',
  RECORD_NOT_IN_RELEASE: 'The Medicare window record these lines were priced with is not in the rule release they were priced under, so their deadline is not verified. Lines priced under a release that holds the record, verified, have a verified deadline.',
  RELEASE_WITHDRAWN:
    'The rule release these lines were priced under was withdrawn because its content was wrong, so its Medicare window record verifies nothing. Lines priced again under the release in force, with its record verified to level L2, have a verified deadline.',
  RECORD_BELOW_LEVEL: 'The Medicare window record these lines were priced with is not verified to level L2 in their rule release. Lines priced under a release whose record a second reader verified have a verified deadline.',
  CONTRACT_WINDOW_UNCITED:
    'The contract version these lines were priced under states a dispute window but cites no page, quote and hash for it. Ask the contract specialist to cite and verify the window on an amended or corrected version; lines priced under it once a billing manager signs it off have a verified deadline.',
  CONTRACT_WINDOW_UNVERIFIED: 'The contract window is cited, but no specialist verified the citation. Ask the contract specialist to verify it before the version is approved and signed off.',
  CONTRACT_VERSION_NOT_SIGNED_OFF: 'The contract version these lines were priced under is no longer signed off (a corrected version replaced it), so their deadline is not verified. Lines priced under the signed-off version in force have their own deadline.',
  CONTRACT_WINDOW_DIFFERS: 'The window these lines were priced with is not the length the contract version cites, so their deadline is not verified. Ask the contract specialist to check the version’s window against its page.',
  NEXT_LEVEL_UNCITED: 'The next dispute level’s window is the contract’s appeal level, which cites no page, quote or hash, so this level’s deadline cannot be verified and its packet is not exported.',
  NEXT_LEVEL_DIFFERS:
    'The next dispute level’s date was computed from a Medicare reconsideration record that is no longer the one in force: the record in force now gives another date, so this deadline is not verified and its packet is not exported.',
};

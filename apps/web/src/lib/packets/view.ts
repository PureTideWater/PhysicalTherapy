import type { EvidenceGapCode, EvidenceKind, FigureRole, MismatchCode, SourceKind } from '@tp/packets';
import type { DeadlineStatus, DeadlineUnverifiedCause } from '@tp/triage';

/**
 * The packet screens' words for the codes a version holds (PRD 7, Packet builder; Submissions and
 * responses): the verifier's mismatches, the evidence list's kinds and gaps, the numbered sources a
 * sentence cites, and a follow-up's state. Fixed words, never a value from the record.
 */

export const MISMATCH_TEXT: Readonly<Record<MismatchCode, string>> = {
  figure_not_in_input: 'a figure that is not in the packet’s input records in the role its words give it',
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
  number: 'number or count; say what it counts or names: 3 claims, 6 units, page 2, 3650 days, release 900001',
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

/**
 * What each role a figure is read in means (@tp/packets FIGURE_ROLES; docs/adr/0086), for the editor's words beside a
 * failing figure: "read as a count of claims". Every role the reader has is here, so a role it gains has its words.
 */
export const ROLE_TEXT: Readonly<Record<FigureRole, string>> = {
  window_days: 'the dispute window’s days',
  days_to_pay: 'the days the payer has to pay',
  days_late: 'the days a payment was late',
  citation_page: 'the cited clause’s page',
  window_page: 'the dispute window’s page',
  version: 'the contract’s version',
  release: 'a rule release',
  level: 'the dispute level',
  lines: 'a count of lines',
  claims: 'a count of claims',
  patients: 'a count of patients',
  units: 'a count of units',
  line_units: 'each line’s units',
  row: 'a row of the schedule',
  claim_row: 'one of the claims',
  patient_row: 'one of the patients',
  expected: 'what the contract requires',
  allowed: 'what the payer allowed',
  paid: 'what the payer paid',
  variance: 'the shortfall',
  interest: 'interest',
  patient_share: 'the patient’s share',
  calculation: 'a step of a line’s calculation',
  contract_percent: 'the contract’s percentage',
  interest_rate: 'the interest rate',
  service_date: 'a date of service',
  paid_date: 'a payment date',
  received_date: 'the date the payer received a claim',
  due_date: 'the date payment was due',
  deadline: 'the dispute deadline',
  effective_date: 'the contract’s effective date',
  as_of_date: 'the packet’s date',
  schedule_year: 'the fee schedule’s year',
};

/** The roles a figure was read in, in words: "read as a count of claims or a count of lines". */
export function readAsText(roles: readonly FigureRole[]): string {
  return `read as ${roles.map((role) => ROLE_TEXT[role]).join(' or ')}`;
}

/** A mismatch in words: what it is, of what kind, and, for a figure its words give a role, what it was read as. */
export function mismatchText(code: MismatchCode, kind: string | null, roles: readonly FigureRole[] | null = null): string {
  const what = MISMATCH_TEXT[code];
  if (kind === null || code !== 'figure_not_in_input') {
    return what;
  }
  return `${what} (${FIGURE_KIND_TEXT[kind] ?? kind}${roles === null || roles.length === 0 ? '' : `, ${readAsText(roles)}`})`;
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
 * Why a Medicare Advantage non-contracted packet is not exported now (best-option audit #5; golden QUESTIONS Q34),
 * shown on the packet's deadline whenever its citation is the regulation's, whatever its window record's level. The
 * route is a product-wide question with no step in a practice: the contract specialist is answering it, and a later
 * release of the product applies the answer (ma_dispute_route_confirmed()). A Medicare Advantage plan mapped to a
 * contract is not held: its contract's own window is cited and verified as any contract's.
 */
export const MA_ROUTE_NOTICE =
  'No packet of a Medicare Advantage non-contracted line is exported yet. Which dispute route such a line takes (the plan’s own payment dispute policy, or a Medicare redetermination) is a product-wide question (golden question Q34) that the contract specialist is answering; a later release of the product applies the answer, and nothing in this practice changes it. Until then this packet’s deadline is not verified, even where its Medicare window record is verified to level L2: work the plan’s own dispute policy outside the product.';

/**
 * Why a deadline is not verified (D17; best-option audit #5), in words a billing manager can act on: what is
 * missing and who supplies it. A deadline is verified only from evidence a person signed off: a contract version's
 * own window with its page, quote and hash, counted the way the product computes it (calendar days after the
 * payment date, BPR16), or a Medicare window record verified to L2 once the product applies the answer on the
 * Medicare Advantage dispute route (Q34). A signed-off version never changes, so evidence added later is on a corrected
 * or amended version, and lines priced under it carry it. Nothing here promises that a line priced before is
 * priced again: nothing refreshes a case's lines automatically yet.
 */
export const DEADLINE_CAUSE_TEXT: Readonly<Record<DeadlineUnverifiedCause, string>> = {
  COMMERCIAL_DEFAULT:
    'These lines’ window is the rule release’s default for commercial plans, which is never verified: the contract version cites no window of its own. Ask the contract specialist to cite and verify the contract’s dispute window (its page, quote and hash) on an amended or corrected version; lines priced under it once it is signed off have a verified deadline.',
  RECORD_NOT_IN_RELEASE:
    'The Medicare window record these lines were priced with is not in the rule release they were priced under, so their deadline is not verified and their packet is not exported. These lines keep that pricing until they are priced again.',
  RELEASE_WITHDRAWN:
    'The rule release these lines were priced under was withdrawn because its content was wrong, so its Medicare window record verifies nothing: their deadline is not verified and their packet is not exported. Nothing prices these lines again automatically yet.',
  RECORD_BELOW_LEVEL:
    'The Medicare window record these lines were priced with is not verified to level L2 in their rule release, so their deadline is not verified and their packet is not exported. These lines keep that pricing until they are priced again.',
  MA_ROUTE_UNCONFIRMED:
    'These are Medicare Advantage non-contracted lines. Which dispute route they take (the plan’s own payment dispute policy, or a Medicare redetermination) is a product-wide question (golden question Q34) that the contract specialist is answering; a later release of the product applies the answer, and nothing in this practice changes it. Until then no Medicare Advantage non-contracted deadline is verified and no packet of such a line is exported: work the plan’s own dispute policy outside the product.',
  CONTRACT_WINDOW_UNCITED:
    'The contract version these lines were priced under states a dispute window but cites no page, quote and hash for it. Ask the contract specialist to cite and verify the window on an amended or corrected version; lines priced under it once a billing manager signs it off have a verified deadline.',
  CONTRACT_WINDOW_RULE_NOT_COMPUTED:
    'The contract counts its dispute window in business days or months, or from a date other than the payment date, and the product computes a contract window only as calendar days after the payment date for now. A date counted that way is not the contract’s own deadline and may be earlier or later than it, so the product states none: it is not verified and the packet is not exported. Keep the contract’s own deadline, from its words, until the product computes that rule.',
  CONTRACT_WINDOW_UNVERIFIED: 'The contract window is cited, but no specialist verified the citation. Ask the contract specialist to verify it before the version is approved and signed off.',
  CONTRACT_VERSION_NOT_SIGNED_OFF: 'The contract version these lines were priced under is no longer signed off (a corrected version replaced it), so their deadline is not verified. Lines priced under the signed-off version in force have their own deadline.',
  CONTRACT_WINDOW_DIFFERS: 'The window these lines were priced with is not the length the contract version cites, or not counted in days from the payment date, so their deadline is not verified. Ask the contract specialist to check the version’s window against its page.',
  NEXT_LEVEL_UNCITED: 'The next dispute level’s window is the contract’s appeal level, which cites no page, quote or hash, so this level’s deadline cannot be verified and its packet is not exported.',
  NEXT_LEVEL_DIFFERS:
    'The next dispute level’s date was computed from a Medicare reconsideration record that is no longer the one in force: the record in force now gives another date, so this deadline is not verified and its packet is not exported.',
};

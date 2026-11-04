import type { EvidenceGapCode, EvidenceKind, FigureNeeds, FigureRole, MismatchCode, SourceKind, VerifierReport } from '@tp/packets';
import type { DeadlineStatus, DeadlineUnverifiedCause } from '@tp/triage';
import type { VerifierStanding } from '@tp/worker/packets';

/**
 * The packet screens' words for the codes a version holds (PRD 7, Packet builder; Submissions and
 * responses): the verifier's mismatches, the evidence list's kinds and gaps, the numbered sources a
 * sentence cites, and a follow-up's state. Fixed words, never a value from the record.
 */

export const MISMATCH_TEXT: Readonly<Record<MismatchCode, string>> = {
  figure_not_in_input: 'a figure that does not match this version’s records',
  sentence_without_citation: 'a sentence that cites none of the numbered sources',
  unknown_citation: 'a citation marker that names no source of this version',
  unknown_placeholder: 'an identifier placeholder that names no schedule row or kind',
  empty_narrative: 'an empty narrative',
  hidden_character: 'a hidden character, one that prints as nothing or as something else (a zero-width space, a soft hyphen, a direction control); delete it',
  unreadable_figure: 'a figure in digits other than 0 to 9, which the verifier cannot check; write it in 0 to 9',
  identifier_in_narrative: 'one of this case’s identifiers (a patient’s name, a member ID or a claim number); write its placeholder, which the export fills in from the record',
};

/** A figure's kind, as a mismatch names it ("an amount that does not match this version’s records"). */
export const FIGURE_KIND_TEXT: Readonly<Record<string, string>> = {
  amount: 'an amount',
  percent: 'a percentage',
  date: 'a date',
  month: 'a month',
  month_day: 'a day of a month',
  code: 'a code',
  modifier: 'a modifier',
  number: 'a number',
  identifier: 'an identifier',
  placeholder: 'a placeholder',
  citation: 'a citation',
};

/** What a number with no word for what it counts is asked for, with examples a person writes (the UX review of 2026-10-28). */
export const SAY_WHAT_IT_COUNTS = 'say what it counts or names: 3 claims, 6 units, page 2, 3650 days';

/**
 * What a figure in its role is asked for when its words must say more (docs/adr/0086): rule 2, an amount or a count of
 * units with no scope phrase beside it where per line and in total differ, or an amount in a sentence that names a
 * part of the lines (rule 1's fail-closed triggers), with the phrases that grant a scope; rule 3, a figure of a
 * "respectively" list in neither of its two plain forms. Said beside the figure marked, so "this figure" is the one
 * marked.
 */
export const NEEDS_TEXT: Readonly<Record<Exclude<FigureNeeds, null>, string>> = {
  scope: 'state whether this figure is per line or in total right after it (“per line”, “in total”, “across all the lines”), and keep any one line, group of lines, code, date of service, claim or patient in a sentence of its own',
  own_words: 'give each figure its own words instead of “respectively”',
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
 * What each role a figure is read in means (@tp/packets FIGURE_ROLES; docs/adr/0086), for the words beside a failing
 * figure: "read as a count of claims; the records hold it as the dispute window’s days". Every role the reader has is
 * here, so a role it gains has its words.
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

/** Words in a list: "a", "a or b", "a, b or c" (`joiner` "or"; "and" for each of them). */
function listed(items: readonly string[], joiner: 'or' | 'and'): string {
  return items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} ${joiner} ${items.at(-1) ?? ''}`;
}

/** The roles a figure was read in, in words: "read as a count of claims or a count of lines" ("and" when it is each of them). */
export function readAsText(roles: readonly FigureRole[], every = false): string {
  return `read as ${listed(
    roles.map((role) => ROLE_TEXT[role]),
    every ? 'and' : 'or',
  )}`;
}

/** What the records hold a failing figure's value as, in words: "the records hold it as the dispute window’s days". */
export function heldAsText(roles: readonly FigureRole[]): string {
  return `the records hold it as ${listed(
    roles.map((role) => ROLE_TEXT[role]),
    'and',
  )}`;
}

/** A failing figure as the check read it (@tp/packets CheckedFigure): the roles its words give it, and what the records hold it as. */
export interface FigureAsRead {
  readonly roles: readonly FigureRole[] | null;
  /** Its words name several roles and none is its own: it must be held as each of them. */
  readonly every: boolean;
  readonly heldAs: readonly FigureRole[];
  /** What its words must say more, when that is why it fails (@tp/packets FigureNeeds); a stored report's figure has none. */
  readonly needs?: FigureNeeds;
}

/**
 * A mismatch in words, short enough for a phone's width beside the figure it is about (the UX review of 2026-10-28). A
 * figure whose words must say more is asked for it (NEEDS_TEXT: per line or in total, or its own words instead of
 * "respectively"); any other figure the check read is said as what its words give it and what the records hold it as
 * ("read as what the payer paid; the records hold it as what the contract requires"); a number with no word for what it
 * counts is asked to say it; a figure without its reading (a stored report, a refusal) is said by its kind.
 */
export function mismatchText(code: MismatchCode, kind: string | null, figure: FigureAsRead | null = null): string {
  if (code !== 'figure_not_in_input') {
    return MISMATCH_TEXT[code];
  }
  if (figure?.needs !== undefined && figure.needs !== null) {
    return NEEDS_TEXT[figure.needs];
  }
  const kindText = kind === null ? null : (FIGURE_KIND_TEXT[kind] ?? null);
  if (figure === null) {
    return kindText === null ? MISMATCH_TEXT[code] : `${kindText} that does not match this version’s records`;
  }
  const held = figure.heldAs.length === 0 ? null : heldAsText(figure.heldAs);
  if (figure.roles !== null && figure.roles.length > 0) {
    return `${readAsText(figure.roles, figure.every)}; ${held ?? 'no record holds it as that'}`;
  }
  if (kind === 'number') {
    return held === null ? SAY_WHAT_IT_COUNTS : `say what it counts or names; ${held}`;
  }
  return `${kindText ?? 'a figure'} no record holds`;
}

/** The live check's summary, as the editor's badge shows it and its status line announces it once the typing pauses. */
export function liveCheckSummary(passed: boolean, mismatches: number): string {
  return passed ? 'Live check passes' : `Live check: ${String(mismatches)} ${mismatches === 1 ? 'mismatch' : 'mismatches'}`;
}

/** The badge a stored version's verifier result shows (docs/adr/0086, CORR-5): what the verifier says of it now. */
export const VERIFIER_STANDING_TEXT: Readonly<Record<VerifierStanding, string>> = {
  passed: 'Verifier passed',
  failed: 'Verifier failed',
  fails_now: 'Verifier fails it now',
};

/** What the verifier says of a case's current packet version now, on the case's page (docs/adr/0086, CORR-5). */
export const CASE_VERIFIER_TEXT: Readonly<Record<VerifierStanding, string>> = {
  passed: 'the verifier passed it',
  failed: 'the verifier failed it',
  fails_now: 'the verifier passed it when it was written and fails it now',
};

/** The builder's history of versions: what the verifier says of each now. */
export const HISTORY_VERIFIER_TEXT: Readonly<Record<VerifierStanding, string>> = {
  passed: 'Passed',
  failed: 'Failed',
  fails_now: 'Fails now (passed when written)',
};

/**
 * Where a version the verifier passed when it was written and fails now stands, as its words say it (the review of the
 * fix round, UX-D1): the current version, not approved; approved, not exported; exported; or an earlier version.
 */
export const FAILS_NOW_STATES = ['unapproved', 'approved', 'exported', 'earlier'] as const;
export type FailsNowState = (typeof FAILS_NOW_STATES)[number];

/** A version's state for those words: exported first, then an earlier version, then approved. */
export function failsNowState(version: { readonly current: boolean; readonly approved: boolean; readonly exported: boolean }): FailsNowState {
  return version.exported ? 'exported' : !version.current ? 'earlier' : version.approved ? 'approved' : 'unapproved';
}

/**
 * Why a version the verifier passed when it was written fails now (the review of the fix round, NEW-N3): `marked`, a
 * figure or other text the builder marks under Narrative; `unmarked`, only a mismatch it marks nothing for (a sentence
 * without a citation, an empty narrative); `stale`, no mismatch, so the stored report is not of this narrative.
 */
export type FailsNowCause = 'marked' | 'unmarked' | 'stale';

/** The mismatches the builder marks in the stored narrative: every one but a sentence without a citation or an empty narrative. */
export function markedMismatches<T extends Pick<VerifierReport['mismatches'][number], 'code'>>(mismatches: readonly T[]): T[] {
  return mismatches.filter((mismatch) => mismatch.code !== 'sentence_without_citation' && mismatch.code !== 'empty_narrative');
}

/** A report's cause, as failsNowText() and exportFailsNowText() say it. */
export function failsNowCause(report: Pick<VerifierReport, 'mismatches'>): FailsNowCause {
  return report.mismatches.length === 0 ? 'stale' : markedMismatches(report.mismatches).length > 0 ? 'marked' : 'unmarked';
}

const STALE = 'the stored narrative no longer matches its verifier report';
const FIX: Readonly<Record<FailsNowCause, string>> = {
  marked: 'correct the marked figures and save a new version',
  unmarked: 'correct the narrative and save a new version',
  stale: 'save it again as a new version',
};

/**
 * Why a version the verifier passed when it was written fails now, and what to do (beside its badge), by where the
 * version stands and by its cause: the figure check only when it fails a figure, what to correct only when something
 * is marked, and with no mismatch, that its stored report is not of this narrative (NEW-N3).
 */
export function failsNowText(state: FailsNowState, cause: FailsNowCause): string {
  const why =
    cause === 'marked'
      ? 'It now checks each figure against what its words say it is, and fails it'
      : cause === 'unmarked'
        ? 'It fails it now'
        : `Now ${STALE}`;
  switch (state) {
    case 'unapproved':
      return `The verifier passed this version when it was written. ${why}, so this version cannot be approved: ${FIX[cause]}.`;
    case 'approved':
      return cause === 'stale'
        ? `This version was approved when the verifier passed it, but ${STALE} now, so it cannot be exported: ${FIX[cause]}, which needs approval again.`
        : `This version was approved when the verifier passed it; the verifier fails it now, so it cannot be exported: ${FIX[cause]}, which needs approval again.`;
    case 'exported':
      return cause === 'stale'
        ? `The verifier passed this version when it was written and when it was exported; ${STALE} now. The exported files stand; a new version needs approval again.`
        : 'The verifier passed this version when it was written and when it was exported; it fails the narrative now. The exported files stand; a new version needs approval again.';
    case 'earlier':
      return `The verifier passed this version when it was written. ${why}. A later version is current.`;
  }
}

/** Why the export of a version the verifier fails now is held back, beside its disabled button (UX-D1), by its cause (NEW-N3). */
export function exportFailsNowText(cause: FailsNowCause): string {
  switch (cause) {
    case 'marked':
      return 'The verifier fails this version’s narrative now, so it cannot be exported: correct the figures marked under Narrative above and save a new version, which needs approval again.';
    case 'unmarked':
      return 'The verifier fails this version’s narrative now, so it cannot be exported: correct the narrative and save a new version, which needs approval again.';
    case 'stale':
      return `This version cannot be exported: ${STALE}, so save it again as a new version, which needs approval again.`;
  }
}

/**
 * Why a request for approval or an approval of a version the verifier fails now is refused, with each mismatch by its
 * sentence: a figure the check read in the role's words (what it was read as and what the records hold it as), any
 * other by its kind, never the narrative's words (a refusal carries the rule's words only), the same item once with how
 * many times; that its figures are marked under Narrative only when the builder marks one (NEW-N3). With no mismatch,
 * its report is not of this narrative.
 */
export function failsNowRefusal(report: Pick<VerifierReport, 'mismatches'>, figures: readonly (FigureAsRead & { readonly start: number; readonly end: number })[] = []): string {
  if (report.mismatches.length === 0) {
    return `${STALE}. Save it again as a new version; only a version the verifier passes now can be approved`;
  }
  const items: string[] = [];
  const times = new Map<string, number>();
  for (const mismatch of report.mismatches) {
    const figure = mismatch.code === 'figure_not_in_input' ? figures.find((item) => item.start === mismatch.start && item.end === mismatch.end) : undefined;
    const kind = mismatch.kind === null ? null : (FIGURE_KIND_TEXT[mismatch.kind] ?? null);
    const what =
      figure?.needs !== undefined && figure.needs !== null
        ? `${kind ?? 'a figure'} ${figure.needs === 'scope' ? 'whose words must say whether it is per line or in total' : 'that needs its own words instead of “respectively”'}`
        : figure !== undefined && figure.roles !== null && figure.roles.length > 0
        ? `${kind ?? 'a figure'} ${readAsText(figure.roles, figure.every)} that ${
            figure.heldAs.length === 0
              ? 'no record holds as that'
              : `the records hold as ${listed(
                  figure.heldAs.map((role) => ROLE_TEXT[role]),
                  'and',
                )}`
          }`
        : mismatchText(mismatch.code, mismatch.kind);
    const item = `${mismatch.sentence < 0 ? '' : `in sentence ${String(mismatch.sentence + 1)}, `}${what}`;
    if (!times.has(item)) {
      items.push(item);
    }
    times.set(item, (times.get(item) ?? 0) + 1);
  }
  const said = items.map((item) => {
    const count = times.get(item) ?? 1;
    return count === 1 ? item : `${item} (${count === 2 ? 'twice' : `${String(count)} times`})`;
  });
  const count = `${String(report.mismatches.length)} ${report.mismatches.length === 1 ? 'mismatch' : 'mismatches'}`;
  const marked = markedMismatches(report.mismatches).length > 0 ? ' Its figures are marked under Narrative above.' : '';
  return `the verifier passed this version when it was written and fails it now (${count}: ${said.join('; ')}).${marked} Correct the narrative and save a new version; only a version the verifier passes now can be approved`;
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

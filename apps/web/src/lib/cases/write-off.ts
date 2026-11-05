import { WRITE_OFF_REASONS, type WriteOffReason } from '@tp/triage';

/**
 * The write-off reasons a case line's own records allow (PRD 12, Write-offs and reopening; docs/adr/0085 D1 and D2).
 * Of the closed list (@tp/triage's WRITE_OFF_REASONS), only "Window passed" can be checked against what the line
 * holds: it is true exactly when the line's dispute window is known and has ended (priced_line.window_ends_on before
 * today, UTC), as triage's strike and the reopen judge it. A window that cannot be shown open is not open, so with no
 * window known the reason is not true either; no case line reaches that today (triage adds a line only with a known
 * window), and the branch is kept so that a future path is refused rather than trusted. The other four reasons are the
 * person's judgment: nothing stored decides them, and they are always offered.
 *
 * One rule for the case page, which starts Reason unchosen, offers only the reasons that can be true and says under
 * Reason why "Window passed" is not among them, and for the write-off route, which refuses a contradicted reason on
 * Reason in the transaction that writes. A line's window only ever passes (its priced line never changes), so the
 * route never refuses a reason the page offered. The words name the rule, never a value: no date reaches a hint or a
 * refusal.
 */

/** A case line's dispute window as the write-off reads it: its end (a calendar date), and whether it ended before today (UTC). */
export interface LineWindow {
  readonly windowEndsOn: string | null;
  readonly windowPassed: boolean;
}

/** The words of the Reason field: its first option, its hints and the route's refusals (refusals in the lower-case rule style). */
export const WRITE_OFF_REASON_WORDS = {
  /** The first option, chosen until the person chooses. */
  placeholder: 'Choose the reason',
  /** The route's refusal when no reason is chosen. */
  noReason: 'choose the reason',
  /** Under Reason, while the line's window is open. */
  openHint: '“Window passed” is offered once this line’s dispute window has ended.',
  /** Under Reason, with no window known for the line. */
  unknownHint: '“Window passed” is not offered: no dispute window is known for this line.',
  /** The route's refusal of "Window passed" while the line's window is open. */
  openRefusal: 'a line whose dispute window is still open is not written off as “Window passed”; choose the reason that applies',
  /** The route's refusal of "Window passed" with no window known for the line. */
  unknownRefusal: 'a line with no known dispute window is not written off as “Window passed”; choose “Other” and say why',
} as const;

/** The reasons that can be true for the line, in the list's order: "Window passed" only once its window has ended. */
export function writeOffReasonsFor(line: Pick<LineWindow, 'windowPassed'>): readonly WriteOffReason[] {
  return line.windowPassed ? WRITE_OFF_REASONS : WRITE_OFF_REASONS.filter((reason) => reason !== 'window_passed');
}

/** Why the line's own records contradict the reason, as the route refuses it; null when nothing does. */
export function contradictedReason(reason: WriteOffReason, line: LineWindow): string | null {
  if (reason !== 'window_passed' || line.windowPassed) {
    return null;
  }
  return line.windowEndsOn === null ? WRITE_OFF_REASON_WORDS.unknownRefusal : WRITE_OFF_REASON_WORDS.openRefusal;
}

/** The line under Reason when "Window passed" is not offered; null when it is. */
export function withheldReasonHint(line: LineWindow): string | null {
  if (line.windowPassed) {
    return null;
  }
  return line.windowEndsOn === null ? WRITE_OFF_REASON_WORDS.unknownHint : WRITE_OFF_REASON_WORDS.openHint;
}

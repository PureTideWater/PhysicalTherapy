import { WRITE_OFF_REASONS } from '@tp/triage';
import { describe, expect, it } from 'vitest';

import { WRITE_OFF_REASON_WORDS, contradictedReason, withheldReasonHint, writeOffReasonsFor } from './write-off';

/**
 * The write-off reasons a line's own records allow (test matrix CAS-45; docs/adr/0085 D2): "Window passed" is offered and
 * accepted only once the line's dispute window has ended; while it is open, or with no window known, the page leaves
 * it out and says why under Reason, and the route refuses it on Reason. The other four reasons are the person's
 * judgment, always offered and never refused. The page offers exactly what the route accepts, and no word names a value.
 */

/** A line whose window is open (it ends in 2036). */
const OPEN = { windowEndsOn: '2036-04-05', windowPassed: false } as const;
/** A line with no window known (defensive: no case line reaches it today). */
const UNKNOWN = { windowEndsOn: null, windowPassed: false } as const;
/** A line whose window has ended. */
const PASSED = { windowEndsOn: '2026-04-19', windowPassed: true } as const;
const LINES = [OPEN, UNKNOWN, PASSED] as const;
const JUDGMENTS = WRITE_OFF_REASONS.filter((reason) => reason !== 'window_passed');

describe('the write-off reasons a line’s records allow (CAS-45)', () => {
  it('offers the five reasons in the list’s order once the window has ended, and the four judgments otherwise (CAS-45)', () => {
    expect(writeOffReasonsFor({ windowPassed: true })).toEqual(['window_passed', 'payer_correct_on_review', 'not_worth_pursuit', 'duplicate', 'other']);
    expect(writeOffReasonsFor({ windowPassed: false })).toEqual(['payer_correct_on_review', 'not_worth_pursuit', 'duplicate', 'other']);
  });

  it('refuses “Window passed” while the window is open or unknown, each with its own sentence, and accepts it once ended (CAS-45)', () => {
    expect(contradictedReason('window_passed', OPEN)).toBe('a line whose dispute window is still open is not written off as “Window passed”; choose the reason that applies');
    expect(contradictedReason('window_passed', UNKNOWN)).toBe('a line with no known dispute window is not written off as “Window passed”; choose “Other” and say why');
    expect(contradictedReason('window_passed', PASSED)).toBeNull();
  });

  it('never second-guesses a reason no stored fact decides (CAS-45)', () => {
    for (const line of LINES) {
      for (const reason of JUDGMENTS) {
        expect(contradictedReason(reason, line), `${reason} on ${String(line.windowEndsOn)}`).toBeNull();
      }
    }
  });

  it('offers exactly what the route accepts, for every reason on every line (CAS-45)', () => {
    for (const line of LINES) {
      for (const reason of WRITE_OFF_REASONS) {
        expect(writeOffReasonsFor(line).includes(reason), `${reason} on ${String(line.windowEndsOn)}`).toBe(contradictedReason(reason, line) === null);
      }
    }
  });

  it('says under Reason why “Window passed” is not offered, and says nothing once it is (CAS-45)', () => {
    expect(withheldReasonHint(OPEN)).toBe('“Window passed” is offered once this line’s dispute window has ended.');
    expect(withheldReasonHint(UNKNOWN)).toBe('“Window passed” is not offered: no dispute window is known for this line.');
    expect(withheldReasonHint(PASSED)).toBeNull();
  });

  it('names the rule, never a value: no word holds a digit, and the refusals read after the field’s name (CAS-45)', () => {
    const words = [
      ...Object.values(WRITE_OFF_REASON_WORDS),
      ...LINES.flatMap((line) => [withheldReasonHint(line), ...WRITE_OFF_REASONS.map((reason) => contradictedReason(reason, line))]),
    ].filter((text): text is string => text !== null);
    expect(words.length).toBeGreaterThan(0);
    for (const text of words) {
      expect(text, text).not.toMatch(/\d/);
    }
    for (const text of [WRITE_OFF_REASON_WORDS.noReason, WRITE_OFF_REASON_WORDS.openRefusal, WRITE_OFF_REASON_WORDS.unknownRefusal]) {
      expect(text.charAt(0), text).toBe(text.charAt(0).toLowerCase());
      expect(text, text).not.toMatch(/[.']/);
    }
    expect(WRITE_OFF_REASON_WORDS.placeholder).toBe('Choose the reason');
    expect(WRITE_OFF_REASON_WORDS.noReason).toBe('choose the reason');
  });
});

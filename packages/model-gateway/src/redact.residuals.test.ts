import { describe, expect, it } from 'vitest';

import { type LetterClaim, type PatientIdentifiers, holdsIdentifier, redactLetterForScreen } from './redact';
import residuals from './redact.residuals.json' with { type: 'json' };

/**
 * The recorded residuals of co-001/redact-range-glued (docs/adr/0054; the orchestrator's rulings of 2026-11-07), pinned row
 * by row: every row of each accepted class that the differential gate found (975,489 synthetic letters, cc3dd7f6 against
 * this head), and the judge's review rounds' representatives, each refused by cc3dd7f6 and asserted exactly as this head
 * handles it today, so a change either way fails here and is recorded again. The rows are synthetic (SSNs 900-xx-xxxx, or
 * the never-issued area 000 or 9xx where that alone keeps the number sent in clear; phones 202/555-01xx; patients ZEPHYRA,
 * VANTREE and their like with SYN-prefixed numbers). Regenerate the file from a gate run with the scripts kept beside the
 * gate, never by hand.
 *
 * - ssnPhone (ruling A, 10:53): an SSN or phone in a shape no pattern or chain rule reads, written elsewhere in a letter
 *   whose chain only the range fix's barriers hold. cc3dd7f6 refused each only because the range's own digits chained; it
 *   sends the same shape in a letter with no range, so the fix exposes the leak and does not create it. `number` is the
 *   number as the head sends it, in clear.
 * - ownIdentifierA (ruling A', 15:27): the call's own name, member ID, claim number or date of birth in such a letter, in a
 *   form no rule reads (OCR letter/digit confusions, homoglyphs, a Roman or CJK month, unpadded digits, a year in words),
 *   `token` sent in clear; cc3dd7f6 sends the same forms in any letter with no range.
 *   co-001/redact-ssn-phone-leaks (MOD-21, MOD-22) owns both classes: its acceptance test flips every row of both to
 *   redacted or refused, with its generator and patterns (and an OCR/homoglyph fold for the call's own identifiers)
 *   changed together, and it lands before any real PHI is processed.
 * - monthWordName (ruling B): the patient's name part that is a month's word next to a date, sent with the date of birth
 *   redacted; a named case for that PR's design.
 * - loneInitial: a lone letter that is one of the name's initials glued to a range's end, with no name, part, label or full
 *   stop beside it (`token`), sent: as often a code's or a unit's letter; cc3dd7f6 refused it only for the range's digits.
 * - failSafe: letters cc3dd7f6 sent that this head refuses, a person handling them: the call's date of birth glued digit to
 *   digit in a must-stay letter, and the call's identifier glued where no boundary can be read in a letter whose other
 *   identifiers cc3dd7f6 redacted.
 */
interface Row {
  readonly p: number;
  readonly gate: string;
  readonly letter: string;
  readonly sent?: string;
  readonly number?: string;
  readonly token?: string;
}

const call = (row: Row): { readonly patient: PatientIdentifiers; readonly claims: LetterClaim[] } => {
  const stored = residuals.patients[row.p];
  if (stored === undefined) {
    throw new Error('residual row names no patient');
  }
  return {
    patient: { pseudonym: 'synthetic-patient-21', names: stored.names, datesOfBirth: stored.datesOfBirth, memberIds: stored.memberIds },
    claims: [{ claimId: 'synthetic-claim-21', patientPseudonym: 'synthetic-patient-21', claimNumbers: stored.claimNumbers }],
  };
};

const sentAsRecorded = (row: Row) => {
  const { patient, claims } = call(row);
  const screened = redactLetterForScreen(row.letter, patient, claims);
  expect(screened.text, JSON.stringify(row.letter)).toBe(row.sent);
  expect(holdsIdentifier(screened.text, patient, claims), JSON.stringify(row.letter)).toBe(false);
};

describe('recorded residuals of the range fix (docs/adr/0054), pinned row by row', () => {
  it('holds every accepted class and the fail-safe refusals', () => {
    for (const rows of [residuals.ssnPhone, residuals.ownIdentifierA, residuals.monthWordName, residuals.loneInitial, residuals.failSafe]) {
      expect(rows.length).toBeGreaterThan(0);
    }
  });

  it('pins each leak as a leak: every ssnPhone row sends its number, and every ownIdentifierA and loneInitial row its token, in clear (the judge’s review round 2, PHIJ2-1)', () => {
    for (const row of residuals.ssnPhone as Row[]) {
      expect(row.number, JSON.stringify(row.letter)).toMatch(/[0-9]/u);
      expect(row.sent?.includes(row.number ?? '\0'), JSON.stringify(row.letter)).toBe(true);
    }
    for (const row of [...residuals.ownIdentifierA, ...residuals.loneInitial] as Row[]) {
      expect(row.token, JSON.stringify(row.letter)).toMatch(/[\p{L}\p{N}]/u);
      expect(row.sent?.includes(row.token ?? '\0'), JSON.stringify(row.letter)).toBe(true);
    }
  });

  it.each(residuals.ssnPhone as Row[])('ruling A: sends an SSN or phone cc3dd7f6 refused only for a range’s digits, as recorded until co-001/redact-ssn-phone-leaks (%#, $gate)', (row) => {
    sentAsRecorded(row);
  });

  it.each(residuals.ownIdentifierA as Row[])('ruling A’: sends the call’s own identifier in a form no rule reads, as recorded until co-001/redact-ssn-phone-leaks (%#, $gate)', (row) => {
    sentAsRecorded(row);
  });

  it.each(residuals.monthWordName as Row[])('ruling B: sends a month-word name part next to a date as recorded (%#)', (row) => {
    sentAsRecorded(row);
  });

  it.each(residuals.loneInitial as Row[])('sends a lone initial glued to a range’s end as recorded (%#, $gate)', (row) => {
    sentAsRecorded(row);
  });

  it.each(residuals.failSafe as Row[])('refuses a letter cc3dd7f6 sent, the fail-safe side (%#, $gate)', (row) => {
    const { patient, claims } = call(row);
    expect(holdsIdentifier(redactLetterForScreen(row.letter, patient, claims).text, patient, claims), JSON.stringify(row.letter)).toBe(true);
  });
});

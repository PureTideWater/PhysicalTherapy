import { describe, expect, it } from 'vitest';

import { type LetterClaim, type PatientIdentifiers, holdsIdentifier, redactLetterForScreen } from './redact';
import residuals from './redact.residuals.json' with { type: 'json' };

/**
 * The residuals co-001/redact-range-glued recorded (docs/adr/0054; the orchestrator's rulings of 2026-11-07), pinned row by
 * row as this head handles them: every row of each class that the differential gate found (975,489 synthetic letters,
 * cc3dd7f6 against the range fix's head), and the judge's review rounds' representatives, each refused by cc3dd7f6, so a
 * change either way fails here and is recorded again. The rows are synthetic (SSNs 900-xx-xxxx, or the never-issued area
 * 000 or 9xx; phones 202/555-01xx; patients ZEPHYRA, VANTREE and their like with SYN-prefixed numbers). The file is never
 * edited by hand: the scripts that write it are kept, synthetic only, in the ops repository (claude/build-ops) at
 * designs/lane-b-redact-ssn-phone/gate/residual-scripts/, and gen-residual6.mts wrote this version by reading every row
 * again with this head's redactor.
 *
 * co-001/redact-ssn-phone-leaks (MOD-21, MOD-22; the amendment of docs/adr/0054) closed the three classes the rulings
 * handed it, and the table now pins each of their rows as closed:
 * - ssnPhone (ruling A, 697 rows): an SSN or phone in a shape no pattern or chain rule read, written elsewhere in a letter
 *   whose chain only the range fix's barriers hold. cc3dd7f6 refused each only because the range's own digits chained, and
 *   the range fix sent it with `number` in clear. Each row is now refused (`outcome` "refused": the letter is not sent), or
 *   redacted (`outcome` "redacted": the letter is sent exactly as `sent`, which does not hold `number`).
 * - ownIdentifierA (ruling A', 406 rows): the call's own name, member ID, claim number or date of birth in such a letter,
 *   in a form no rule read (OCR letter/digit confusions, homoglyphs, a Roman or CJK month, a two-digit-year compact of four
 *   or five digits, a year in words), which the range fix sent with `token` in clear. Closed the same way: refused, or
 *   redacted with `sent` not holding `token`.
 * - monthWordName (ruling B, 5 rows): the patient's name part that is a month's word next to a date. Decided: the month of
 *   a month-and-year phrase ("May 2020", "June 103") is the name, so `sent` holds its placeholder there.
 * And the two classes that stay as they were:
 * - loneInitial: a lone letter that is one of the name's initials glued to a range's end, with no name, part, label or full
 *   stop beside it (`token`), sent: as often a code's or a unit's letter; cc3dd7f6 refused it only for the range's digits.
 * - failSafe: letters cc3dd7f6 sent that this head refuses, a person handling them: the call's date of birth glued digit to
 *   digit in a letter cc3dd7f6 sent unchanged (`gate` "must-stay", 52 rows) or sent with a month-word part of the name or
 *   an amount's digits replaced, no identifier in it that the gate's oracle places ("must-stay-changed-at-base", 8 rows:
 *   review round 5 found them tagged "must-stay"), and the call's identifier glued where no boundary can be read in a
 *   letter whose other identifiers cc3dd7f6 redacted ("glued-check").
 */
interface Row {
  readonly p: number;
  readonly gate: string;
  readonly letter: string;
  /** For a row of ruling A or A': "refused" (the letter is not sent) or "redacted" (it is sent exactly as `sent`). */
  readonly outcome?: string;
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

/** Whether text holds a number or token as the letter writes it, or as NFKC writes it (the text sent is NFKC text). */
const holds = (text: string, secret: string) => text.includes(secret) || text.includes(secret.normalize('NFKC'));

/**
 * A row of ruling A or A' as co-001/redact-ssn-phone-leaks closed it: a refused row's letter is refused; a redacted row's
 * letter is sent exactly as recorded, refused by no check, and what is sent does not hold the row's number or token.
 */
const closedAsRecorded = (row: Row, secret: string | undefined) => {
  const { patient, claims } = call(row);
  const screened = redactLetterForScreen(row.letter, patient, claims);
  const refused = holdsIdentifier(screened.text, patient, claims);
  if (row.outcome === 'refused') {
    expect(refused, JSON.stringify(row.letter)).toBe(true);
    return;
  }
  expect(row.outcome, JSON.stringify(row.letter)).toBe('redacted');
  expect(screened.text, JSON.stringify(row.letter)).toBe(row.sent);
  expect(refused, JSON.stringify(row.letter)).toBe(false);
  expect(secret, JSON.stringify(row.letter)).toBeDefined();
  expect(holds(screened.text, secret ?? ''), JSON.stringify(row.letter)).toBe(false);
};

describe('recorded residuals of the range fix (docs/adr/0054), pinned row by row as co-001/redact-ssn-phone-leaks left them', () => {
  it('holds every accepted class and the fail-safe refusals', () => {
    for (const rows of [residuals.ssnPhone, residuals.ownIdentifierA, residuals.monthWordName, residuals.loneInitial, residuals.failSafe]) {
      expect(rows.length).toBeGreaterThan(0);
    }
  });

  it('holds every row the rulings handed to co-001/redact-ssn-phone-leaks, none dropped: 697 of ruling A, 406 of ruling A’ and 5 of ruling B', () => {
    expect(residuals.ssnPhone).toHaveLength(697);
    expect(residuals.ownIdentifierA).toHaveLength(406);
    expect(residuals.monthWordName).toHaveLength(5);
  });

  it('pins no leak as sent any more: every ssnPhone and ownIdentifierA row is recorded refused, or redacted with a sent text that holds neither its number nor its token, and no ruling B row still sends the month word', () => {
    for (const [rows, secretOf] of [
      [residuals.ssnPhone as Row[], (row: Row) => row.number],
      [residuals.ownIdentifierA as Row[], (row: Row) => row.token],
    ] as const) {
      for (const row of rows) {
        const secret = secretOf(row) ?? '';
        // The number or token is in the letter, so the check on the sent text is never an empty one.
        expect(secret, JSON.stringify(row.letter)).toMatch(/[\p{L}\p{N}]/u);
        expect(row.letter.includes(secret), JSON.stringify(row.letter)).toBe(true);
        expect(['refused', 'redacted'], JSON.stringify(row.letter)).toContain(row.outcome);
        // A refused row records no sent text; a redacted row records one, without the number or token.
        expect(row.sent === undefined, JSON.stringify(row.letter)).toBe(row.outcome === 'refused');
        expect(row.sent !== undefined && holds(row.sent, secret), JSON.stringify(row.letter)).toBe(false);
      }
    }
    for (const row of residuals.ssnPhone as Row[]) {
      expect(row.number, JSON.stringify(row.letter)).toMatch(/[0-9]/u);
    }
    // Ruling B's rows are all of a patient named JUNE Q VANTREE and MAY ZEPHYRA.
    for (const row of residuals.monthWordName as Row[]) {
      expect(row.sent, JSON.stringify(row.letter)).toContain('[PATIENT_NAME]');
      expect(row.sent, JSON.stringify(row.letter)).not.toMatch(/(?<!\p{L})(?:May|June)(?!\p{L})/u);
    }
  });

  it('still pins the lone initial as sent in clear: every loneInitial row’s sent text holds its token (the judge’s review round 2, PHIJ2-1)', () => {
    for (const row of residuals.loneInitial as Row[]) {
      expect(row.token, JSON.stringify(row.letter)).toMatch(/[\p{L}\p{N}]/u);
      expect(row.sent?.includes(row.token ?? '\0'), JSON.stringify(row.letter)).toBe(true);
    }
  });

  it.each(residuals.ssnPhone as Row[])('ruling A, closed by co-001/redact-ssn-phone-leaks: an SSN or phone cc3dd7f6 refused only for a range’s digits, which the range fix sent, is $outcome (%#, $gate)', (row) => {
    closedAsRecorded(row, row.number);
  });

  it.each(residuals.ownIdentifierA as Row[])('ruling A’, closed by co-001/redact-ssn-phone-leaks: the call’s own identifier in a form no rule read, which the range fix sent, is $outcome (%#, $gate)', (row) => {
    closedAsRecorded(row, row.token);
  });

  it.each(residuals.monthWordName as Row[])('ruling B, decided by co-001/redact-ssn-phone-leaks: a month-word name part in a month-and-year phrase is sent as its placeholder, as recorded (%#)', (row) => {
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

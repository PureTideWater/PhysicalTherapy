/**
 * The request-to-payer letter for a missing fee schedule (PRD 7, Coverage: "create a request-to-payer
 * letter for a missing schedule"): plain text from one fixed template, filled by code with the
 * practice's and the payer's names and identifiers, the contract's title and the procedure codes the
 * practice has no rate for. No model writes any of it (CLAUDE.md: models propose text only through the
 * gateway, and this needs none), and nothing about a patient or a claim goes in it.
 */

export interface LetterInput {
  readonly date: string;
  readonly practice: { readonly name: string; readonly npi: string | null };
  readonly payer: { readonly name: string; readonly identifier: string };
  readonly contract: { readonly title: string; readonly billingEntity: string | null } | null;
  /** Five-character procedure codes; none asks for the whole schedule. */
  readonly codes: readonly string[];
}

const PROCEDURE_CODE = /^[0-9A-Za-z]{5}$/;

/**
 * The codes as the letter lists them: upper case, each once, sorted; anything else is refused. Each is tested as
 * typed, before it is upper-cased, so a character whose upper case is ASCII ('ſ' to 'S', 'ß' to 'SS', 'ı' to 'I', 'ﬀ' to
 * 'FF') is refused, as LETTER_CODES_PATTERN refuses it in the browser.
 */
export function letterCodes(codes: readonly string[]): string[] {
  const typed = codes.map((code) => code.trim()).filter((code) => code !== '');
  if (typed.some((code) => !PROCEDURE_CODE.test(code))) {
    throw new RangeError('a procedure code is five letters or digits');
  }
  return [...new Set(typed.map((code) => code.toUpperCase()))].sort();
}

/**
 * The codes field's HTML pattern (the browser anchors it and reads it with the v flag): five-letter-or-digit codes
 * separated by spaces, commas or semicolons, or nothing, so the browser refuses what the route refuses before the form
 * is sent. It accepts exactly what the letter route accepts within the field's 400 characters (letterCodes on the
 * value split at the separators; test matrix DLR-03), and the route's check stays the rule.
 */
export const LETTER_CODES_PATTERN = '[\\s,;]*(?:[A-Za-z0-9]{5}(?:[\\s,;]+[A-Za-z0-9]{5})*)?[\\s,;]*';

/** The letter's text. */
export function requestToPayerLetter(input: LetterInput): string {
  const codes = letterCodes(input.codes);
  const agreement = input.contract === null ? 'our agreement with you' : `our agreement with you titled "${input.contract.title}"`;
  const provider = input.practice.npi === null ? input.practice.name : `${input.practice.name} (NPI ${input.practice.npi})`;
  const billingEntity = input.contract === null ? null : input.contract.billingEntity;
  const billing = billingEntity === null ? [] : [`Billing entity named in the agreement: ${billingEntity}`];
  const ask =
    codes.length === 0
      ? [`Please send the complete current fee schedule exhibit for ${agreement}, with the dates it is effective.`]
      : [
          `We do not have the fee schedule that sets the allowed amount for these procedure codes under ${agreement}:`,
          '',
          ...codes.map((code) => `    ${code}`),
          '',
          'Please send the current fee schedule exhibit, or the page of the agreement that states the rate for each of these codes, with the dates it is effective, and tell us if the agreement excludes any of them.',
        ];
  return [
    'REQUEST FOR A FEE SCHEDULE',
    '',
    `Date: ${input.date}`,
    '',
    `To: ${input.payer.name}, provider contracting (payer identifier ${input.payer.identifier})`,
    `From: ${provider}`,
    ...billing,
    '',
    `We are reviewing the payments we receive under ${agreement}.`,
    '',
    ...ask,
    '',
    'Please reply to the contracting address you hold for our practice. Thank you.',
    '',
    'Sincerely,',
    '',
    '',
    '______________________________',
    input.practice.name,
    '',
  ].join('\n');
}

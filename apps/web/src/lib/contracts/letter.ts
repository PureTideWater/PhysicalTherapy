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

const PROCEDURE_CODE = /^[0-9A-Z]{5}$/;

/** The codes as the letter lists them: upper case, each once, sorted; anything else is refused. */
export function letterCodes(codes: readonly string[]): string[] {
  const normalized = codes.map((code) => code.trim().toUpperCase()).filter((code) => code !== '');
  const bad = normalized.find((code) => !PROCEDURE_CODE.test(code));
  if (bad !== undefined) {
    throw new RangeError('a procedure code is five letters or digits');
  }
  return [...new Set(normalized)].sort();
}

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

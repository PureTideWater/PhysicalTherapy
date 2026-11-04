import type { LoggedCitation } from '@tp/db/runtime';
import { DENIAL_CATEGORIES } from '@tp/rules';
import { z } from 'zod';

import { InputRefusedError } from '../errors';
import { figureInQuote, inQuote, normalized, readDate, wholeInQuote } from '../figures';
import { isSha256, sha256Hex } from '../hash';
import { PROMPTS } from '../prompts';
import { type LetterClaim, type PatientIdentifiers, compactIdentifier, holdsIdentifier, identifierCandidates, redactLetter } from '../redact';
import type { PurposeSpec, Verified } from '../spec';
import { frameText } from '../untrusted';

/**
 * readDenialLetter (PRD 14, v1.5): a payer letter in, structured fields out (payer, claim references,
 * reason category, deadline, requested documents). Built behind the kill switch and its own feature
 * flag, model.read_denial_letter, which is off unless a platform administrator turns it on.
 *
 * Before the call: one patient's material only, and the patient's names, dates of birth and member IDs
 * and the claims' numbers replaced by placeholders (../redact.ts). The call is refused when:
 * - the input names no patient identifier to strip (no name, no member ID) or no claim with a number:
 *   with nothing to strip, the letter would go as it is;
 * - a claim of the input is another patient's;
 * - the redacted text still holds one of the identifiers, in any form redaction reads;
 * - the redacted text holds a member ID or claim number the practice's records hold for another
 *   patient: the caller's records check (OtherPatientCheck) answers yes or no, and the gateway asks it
 *   before anything is sent, so a letter that lists a second patient is never sent (PRD 14: "never
 *   sends more than one patient's material in one call").
 *
 * The verifier: every quote is in the letter as sent; every written value is in its own quote; the
 * deadline is a date code can read; a claim reference is a claim's placeholder (mapped back to the
 * claim) or a reference the letter writes; the reason category is one of the denial-category code list
 * (@tp/rules DENIAL_CATEGORIES). A field that fails is rejected and left out of the proposal.
 */

const quoted = z.strictObject({ written: z.string().min(1).max(200), quote: z.string().min(1).max(2000) });

export const denialLetterOutput = z.strictObject({
  payer: quoted.nullable(),
  claim_references: z.array(quoted).max(50),
  reason_category: z.string().min(1).max(64),
  reason_quote: z.string().min(1).max(2000),
  deadline: quoted.nullable(),
  requested_documents: z.array(quoted).max(50),
});
export type DenialLetterOutput = z.output<typeof denialLetterOutput>;

/**
 * The practice's records, asked one question: does any of these runs of the letter (compact: letters and
 * digits, upper case) equal a member ID or claim number the practice holds for a patient other than the
 * letter's? Yes or no; the records are never returned. The caller builds it in the practice's scope
 * (an audited read of the claims and patients).
 */
export interface OtherPatientCheck {
  holdsOtherPatient(candidates: readonly string[]): Promise<boolean>;
}

export interface DenialLetterInput {
  readonly documentId: string;
  /** The stored letter's SHA-256. */
  readonly documentSha256: string;
  /** The letter's text (PHI): redacted here before anything is sent. */
  readonly text: string;
  /** The one patient the letter is about. */
  readonly patient: PatientIdentifiers;
  /** The patient's claims the letter may name. */
  readonly claims: readonly LetterClaim[];
  /** The practice's records check for another patient's identifiers in the letter. */
  readonly otherPatients: OtherPatientCheck;
}

export const LETTER_PROBLEMS = ['quote_not_in_letter', 'not_in_quote', 'unreadable', 'unknown_claim', 'unknown_category'] as const;
export type LetterProblem = (typeof LETTER_PROBLEMS)[number];

export interface LetterFieldReview {
  readonly field: string;
  readonly verified: boolean;
  readonly problems: readonly LetterProblem[];
}

export type DenialCategory = (typeof DENIAL_CATEGORIES)[number];

export interface DenialLetterProposal {
  readonly documentId: string;
  readonly payer: string | null;
  /** A claim of the call by its ID, or a reference the letter writes (the payer's own). */
  readonly claims: readonly ({ readonly claimId: string } | { readonly reference: string })[];
  readonly reasonCategory: DenialCategory | null;
  readonly deadlineOn: string | null;
  readonly requestedDocuments: readonly string[];
  readonly fields: readonly LetterFieldReview[];
}

interface LetterContext {
  readonly text: string;
  readonly claims: ReadonlyMap<string, string>;
}

function review(field: string, problems: LetterProblem[]): LetterFieldReview {
  return { field, verified: problems.length === 0, problems };
}

/** How a written value must appear in its quote: as text (a payer's name, a document), as a whole reference, or as a whole date figure. */
type Presence = 'text' | 'reference' | 'date';

const PRESENT: Readonly<Record<Presence, (written: string, quote: string) => boolean>> = {
  text: inQuote,
  reference: wholeInQuote,
  date: (written, quote) => figureInQuote('date', written, quote),
};

function quotedProblems(entry: { readonly written: string; readonly quote: string }, letter: string, presence: Presence = 'text'): LetterProblem[] {
  const problems: LetterProblem[] = [];
  if (!inQuote(entry.quote, letter)) {
    problems.push('quote_not_in_letter');
  }
  if (!PRESENT[presence](entry.written, entry.quote)) {
    problems.push('not_in_quote');
  }
  return problems;
}

const isCategory = (value: string): value is DenialCategory => (DENIAL_CATEGORIES as readonly string[]).includes(value);

export function verifyDenialLetter(input: DenialLetterInput, output: DenialLetterOutput, context: LetterContext): Verified<DenialLetterProposal> {
  const fields: LetterFieldReview[] = [];
  const citations: LoggedCitation[] = [];
  const cite = (field: string, quote: string) => citations.push({ field, quote_sha256: sha256Hex(normalized(quote)) });

  let payer: string | null = null;
  if (output.payer !== null) {
    const result = review('payer', quotedProblems(output.payer, context.text));
    fields.push(result);
    cite('payer', output.payer.quote);
    payer = result.verified ? normalized(output.payer.written) : null;
  }

  const claims: DenialLetterProposal['claims'][number][] = [];
  output.claim_references.forEach((reference, index) => {
    const field = `claim_references[${String(index)}]`;
    const problems = quotedProblems(reference, context.text, 'reference');
    const written = normalized(reference.written);
    const claimId = context.claims.get(written.toUpperCase());
    if (/^\[[A-Z_]+(_\d+)?\]$/.test(written) && claimId === undefined) {
      problems.push('unknown_claim');
    }
    const result = review(field, problems);
    fields.push(result);
    cite(field, reference.quote);
    if (result.verified) {
      claims.push(claimId === undefined ? { reference: written } : { claimId });
    }
  });

  const categoryProblems = quotedProblems({ written: output.reason_quote, quote: output.reason_quote }, context.text);
  if (!isCategory(output.reason_category)) {
    categoryProblems.push('unknown_category');
  }
  const category = review('reason_category', categoryProblems);
  fields.push(category);
  cite('reason_category', output.reason_quote);

  let deadlineOn: string | null = null;
  if (output.deadline !== null) {
    const problems = quotedProblems(output.deadline, context.text, 'date');
    const date = readDate(output.deadline.written);
    if (date === null) {
      problems.push('unreadable');
    }
    const result = review('deadline', problems);
    fields.push(result);
    cite('deadline', output.deadline.quote);
    deadlineOn = result.verified ? date : null;
  }

  const requestedDocuments: string[] = [];
  output.requested_documents.forEach((document, index) => {
    const field = `requested_documents[${String(index)}]`;
    const result = review(field, quotedProblems(document, context.text));
    fields.push(result);
    cite(field, document.quote);
    if (result.verified) {
      requestedDocuments.push(normalized(document.written));
    }
  });

  return {
    proposal: {
      documentId: input.documentId,
      payer,
      claims,
      reasonCategory: category.verified && isCategory(output.reason_category) ? output.reason_category : null,
      deadlineOn,
      requestedDocuments,
      fields,
    },
    passed: fields.every((field) => field.verified),
    citations,
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const denialLetterSpec = Object.freeze<PurposeSpec<DenialLetterInput, DenialLetterOutput, DenialLetterProposal, LetterContext>>({
  purpose: 'readDenialLetter',
  prompt: PROMPTS.readDenialLetter,
  output: denialLetterOutput,
  prepare(input) {
    if (!UUID.test(input.documentId) || !isSha256(input.documentSha256)) {
      throw new InputRefusedError('input_invalid', 'a letter is read by its document ID and SHA-256');
    }
    const named = (values: readonly string[]) => values.some((value) => value.trim() !== '');
    if (!named(input.patient.names) || !input.patient.memberIds.some((value) => compactIdentifier(value).length >= 2) || input.claims.length === 0 || input.claims.some((claim) => !claim.claimNumbers.some((value) => compactIdentifier(value).length >= 2))) {
      throw new InputRefusedError('identifiers_missing', 'a letter is read only with its patient’s name and member ID and every claim’s number to strip from it');
    }
    if (input.claims.some((claim) => claim.patientPseudonym !== input.patient.pseudonym)) {
      throw new InputRefusedError('more_than_one_patient', 'a call reads one patient’s material; this letter’s claims name more than one patient');
    }
    if (normalized(input.text) === '') {
      throw new InputRefusedError('no_text', 'the letter has no text to read');
    }
    const redacted = redactLetter(input.text, input.patient, input.claims);
    if (holdsIdentifier(redacted.text, input.patient, input.claims)) {
      throw new InputRefusedError('identifier_left', 'the letter still holds an identifier after redaction; it is not sent');
    }
    return {
      user: `Read the payer letter below and answer with the fields the schema describes. Identifiers in it are placeholders in square brackets; cite a claim by its placeholder.\n\n${frameText('payer_letter', redacted.text)}`,
      inputHashes: [input.documentSha256],
      variant: 'default',
      context: { text: redacted.text, claims: redacted.claims },
    };
  },
  async screen(input, prepared) {
    const candidates = identifierCandidates(prepared.context.text);
    if (candidates.length > 0 && (await input.otherPatients.holdsOtherPatient(candidates))) {
      throw new InputRefusedError('more_than_one_patient', 'a call reads one patient’s material; this letter names another patient of the practice');
    }
  },
  verify: verifyDenialLetter,
});

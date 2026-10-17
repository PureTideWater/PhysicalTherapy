import { type Citation, RATE_METHODS, ROUNDING_RULES, TIMED_UNITS_RULES, addDays, pageTextHash, quoteOnPage, rateTermsInputSchema, rateTermsToJson, windowsOverlap } from '@tp/contracts';
import type { LoggedCitation } from '@tp/db/runtime';
import { centsToString } from '@tp/money';
import { z } from 'zod';

import { InputRefusedError } from '../errors';
import { isSha256, sha256Hex } from '../hash';
import { type WrittenFigure, figureInQuote, inQuote, normalized, readAmount, readDate, readPercent, readYear, tokenInQuote } from '../figures';
import { PROMPTS } from '../prompts';
import type { PurposeSpec, Verified } from '../spec';
import { framePages } from '../untrusted';

/**
 * proposeContractTerms (PRD 14; PRD 5, J5 in v1: "the model proposes the abstraction and the
 * specialist verifies each field against the cited page"). In: a contract's or exhibit's pages (the
 * text intake stored: pdf.js for a text PDF, Textract for a scanned page). Out: candidate rate_record
 * rows, each field with the page it is on and the text quoted from that page. The model copies text;
 * code reads every amount, percentage, year and date from the copied text (./figures.ts) and builds the
 * terms, so no amount is a model's.
 *
 * The verifier (test matrix MOD-01, MOD-02):
 * - every quote is on its page (the page exists, and the quote is a substring of its text, compared as
 *   evidence compares it);
 * - every written value (an amount, a percentage, a year, a date, each code, modifier and place of
 *   service) appears in its own field's quote as a whole figure, and code can read it: the quote, read
 *   by the packets verifier's scanner, holds a figure of the field's kind whose value is the one code
 *   reads from the written text ("$3" is not in "$32.50", "1/1/2026" not in "11/1/2026"), and a code,
 *   modifier or place is a token no digit, slash or decimal point joins to a figure beside it ("11"
 *   is not a place of "11/1/2026", "59" not a modifier of "$59.00"); a field that fails is rejected,
 *   and the rest of its candidate stands for the specialist;
 * - candidates whose scopes overlap (codes, modifiers, places of service and dates) are flagged as
 *   conflicting with each other, never merged or chosen between.
 *
 * A candidate becomes a proposed rate_record row (proposed_by "model", its evidence the pricing field's
 * page, quote and the page text's hash) only when every field it fills verified and its terms are
 * valid rate terms. The specialist approves each field before anything prices (PRD 9, proposed).
 */

/** Pages a call reads at most; a longer document is proposed in parts. */
export const MAX_PAGES = 100;

const page = z.number().int().min(1).max(999_999);
const quote = z.string().min(1).max(2000);
const writtenField = z.strictObject({ written: z.string().min(1).max(200), page, quote });
const writtenList = z.strictObject({ written: z.array(z.string().min(1).max(20)).min(1).max(1000), page, quote });

export const LESSER_OF_SCHEDULES = ['FIXED_SCHEDULE', 'PERCENT_OF_MEDICARE'] as const;

const candidateSchema = z.strictObject({
  label: z.string().min(1).max(200),
  method: z.strictObject({ value: z.enum(RATE_METHODS), page, quote }),
  codes: writtenList.nullable(),
  modifiers: writtenList.nullable(),
  places_of_service: writtenList.nullable(),
  amount: writtenField.nullable(),
  percentage: writtenField.nullable(),
  fee_schedule_year: writtenField.nullable(),
  lesser_of_schedule: z.enum(LESSER_OF_SCHEDULES).nullable(),
  flags: z
    .strictObject({
      apply_mppr: z.boolean(),
      apply_assistant_reduction: z.boolean(),
      apply_sequestration: z.boolean(),
      apply_ncci: z.boolean(),
      timed_units_rule: z.enum(TIMED_UNITS_RULES),
      page,
      quote,
    })
    .nullable(),
  rounding: z.strictObject({ value: z.enum(ROUNDING_RULES), page, quote }).nullable(),
  effective_from: writtenField.nullable(),
  effective_to: writtenField.nullable(),
});
export type ContractTermsCandidate = z.output<typeof candidateSchema>;

export const contractTermsOutput = z.strictObject({ candidates: z.array(candidateSchema).max(500) });
export type ContractTermsOutput = z.output<typeof contractTermsOutput>;

/** The stored document kinds a contract proposal reads: no other kind is ever sent (a payer letter is PHI). */
export const CONTRACT_KINDS = ['contract', 'exhibit'] as const;

export interface ContractPagesInput {
  readonly documentId: string;
  /** The stored document's SHA-256. */
  readonly documentSha256: string;
  /** The stored document's kind: contract or exhibit only (CONTRACT_KINDS); anything else is refused before it is framed. */
  readonly kind: (typeof CONTRACT_KINDS)[number];
  /** Each page's text, page 1 first, as intake stored it. */
  readonly pages: readonly string[];
  /** The specialist marked the contract ambiguous: the prompt's larger model reads it (PRD 14). */
  readonly ambiguous?: boolean;
}

export const FIELD_PROBLEMS = ['page_missing', 'quote_not_on_page', 'not_in_quote', 'unreadable'] as const;
export type FieldProblem = (typeof FIELD_PROBLEMS)[number];

export const CITED_FIELDS = [
  'method',
  'codes',
  'modifiers',
  'places_of_service',
  'amount',
  'percentage',
  'fee_schedule_year',
  'flags',
  'rounding',
  'effective_from',
  'effective_to',
] as const;
export type CitedField = (typeof CITED_FIELDS)[number];

export interface FieldReview {
  readonly field: CitedField;
  readonly page: number;
  readonly quote: string;
  /** What the model copied, for the fields that copy text (null for method, flags and rounding). */
  readonly written: string | readonly string[] | null;
  readonly verified: boolean;
  readonly problems: readonly FieldProblem[];
}

/** Values code chose because the contract states none a field could quote; the specialist confirms each. */
export const CODE_DEFAULTS = ['flags', 'rounding', 'year_basis', 'locality_basis', 'conversion_factor', 'effective_to_as_last_day'] as const;
export type CodeDefault = (typeof CODE_DEFAULTS)[number];

export interface ProposedRateRecord {
  readonly scope: Readonly<Record<string, unknown>>;
  readonly method: string;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly flags: Readonly<Record<string, unknown>>;
  readonly rounding: string | null;
  readonly evidence: Citation;
  readonly proposed_by: 'model';
}

export interface CandidateReview {
  readonly index: number;
  readonly label: string;
  readonly method: string;
  readonly fields: readonly FieldReview[];
  /** Other candidates whose scopes overlap this one's: flagged for the specialist, never merged. */
  readonly conflictsWith: readonly number[];
  readonly defaults: readonly CodeDefault[];
  /** The proposed rate_record row, or null when a field was rejected or the terms are not valid. */
  readonly rateRecord: ProposedRateRecord | null;
  readonly problems: readonly ('fields_rejected' | 'terms_invalid')[];
}

export interface ContractTermsProposal {
  readonly documentId: string;
  readonly candidates: readonly CandidateReview[];
}

// ---------------------------------------------------------------------------------------------------

function citedFields(candidate: ContractTermsCandidate): { readonly field: CitedField; readonly page: number; readonly quote: string; readonly written: string | readonly string[] | null }[] {
  const fields = [];
  for (const field of CITED_FIELDS) {
    const value = candidate[field];
    if (value !== null) {
      fields.push({ field, page: value.page, quote: value.quote, written: 'written' in value ? value.written : null });
    }
  }
  return fields;
}

const CODE = /^[0-9A-Z]{5}$/;
const MODIFIER = /^[0-9A-Z]{2}$/;
const PLACE = /^\d{2}$/;

/** Whether code can read the written value of a field (the quote check is separate). */
function readable(field: CitedField, written: string | readonly string[] | null): boolean {
  if (written === null) {
    return true;
  }
  if (typeof written !== 'string') {
    const pattern = field === 'codes' ? CODE : field === 'modifiers' ? MODIFIER : PLACE;
    return written.every((item) => pattern.test(normalized(item).toUpperCase()));
  }
  const readers: Partial<Record<CitedField, (text: string) => unknown>> = { amount: readAmount, percentage: readPercent, fee_schedule_year: readYear };
  return (readers[field] ?? readDate)(written) !== null;
}

/** The kind of figure a field that copies one text holds: its amount, percentage or year, else a date. */
function figureOf(field: CitedField): WrittenFigure {
  return field === 'amount' ? 'amount' : field === 'percentage' ? 'percentage' : field === 'fee_schedule_year' ? 'year' : 'date';
}

/** The field a list of written tokens is (codes, modifiers, places of service). */
function listField(field: CitedField): 'codes' | 'modifiers' | 'places_of_service' {
  return field === 'modifiers' ? 'modifiers' : field === 'places_of_service' ? 'places_of_service' : 'codes';
}

function reviewField(entry: ReturnType<typeof citedFields>[number], pages: readonly string[]): FieldReview {
  const problems: FieldProblem[] = [];
  const text = pages[entry.page - 1];
  if (text === undefined) {
    problems.push('page_missing');
  } else if (!quoteOnPage(entry.quote, text)) {
    problems.push('quote_not_on_page');
  }
  const { written } = entry;
  if (written !== null) {
    const legible = readable(entry.field, written);
    // A value code cannot read is only looked for as text; one it reads must be a whole figure of the quote.
    const present =
      typeof written === 'string'
        ? legible
          ? figureInQuote(figureOf(entry.field), written, entry.quote)
          : inQuote(written, entry.quote)
        : written.every((item) => (legible ? tokenInQuote(normalized(item), entry.quote, listField(entry.field)) : inQuote(item, entry.quote)));
    if (!present) {
      problems.push('not_in_quote');
    }
    if (!legible) {
      problems.push('unreadable');
    }
  }
  return { ...entry, verified: problems.length === 0, problems };
}

const upper = (items: readonly string[]) => items.map((item) => normalized(item).toUpperCase());

/** What code reads the candidate's scope as: null where the candidate names nothing (every code, any modifiers, any place, open dates). */
interface ReadScope {
  readonly codes: readonly string[] | null;
  readonly modifiers: readonly string[] | null;
  readonly places: readonly string[] | null;
  readonly from: string | null;
  /** The written last day, read as the last day covered. */
  readonly lastDay: string | null;
}

function readScope(candidate: ContractTermsCandidate): ReadScope {
  return {
    codes: candidate.codes === null ? null : upper(candidate.codes.written),
    modifiers: candidate.modifiers === null ? null : upper(candidate.modifiers.written),
    places: candidate.places_of_service === null ? null : candidate.places_of_service.written.map(normalized),
    from: candidate.effective_from === null ? null : readDate(candidate.effective_from.written),
    lastDay: candidate.effective_to === null ? null : readDate(candidate.effective_to.written),
  };
}

const intersects = (a: readonly string[] | null, b: readonly string[] | null) => a === null || b === null || a.some((item) => b.includes(item));
const sameSet = (a: readonly string[] | null, b: readonly string[] | null) => a === null || b === null || (a.length === b.length && [...a].sort().join(' ') === [...b].sort().join(' '));

/** Whether two candidates could both apply to one line: every dimension of their scopes overlaps. */
export function scopesOverlap(a: ReadScope, b: ReadScope): boolean {
  const window = (scope: ReadScope) => ({ from: scope.from ?? '0001-01-01', to: scope.lastDay === null ? null : addDays(scope.lastDay, 1) });
  return intersects(a.codes, b.codes) && sameSet(a.modifiers, b.modifiers) && intersects(a.places, b.places) && windowsOverlap(window(a), window(b));
}

/** The candidate's terms as entered rate terms would be, read by code from the verified text, with what code defaulted. */
function enteredTerms(candidate: ContractTermsCandidate): { readonly terms: Record<string, unknown>; readonly defaults: CodeDefault[] } {
  const defaults: CodeDefault[] = [];
  const scope = readScope(candidate);
  const scopeJson: Record<string, unknown> = {};
  if (scope.codes !== null) {
    scopeJson.codes = scope.codes;
  }
  if (scope.modifiers !== null) {
    scopeJson.modifier_sets = [scope.modifiers];
  }
  if (scope.places !== null) {
    scopeJson.places_of_service = scope.places;
  }
  if (scope.from !== null) {
    scopeJson.effective_from = scope.from;
  }
  if (scope.lastDay !== null) {
    // A contract writes the last day it covers ("through December 31"); a scope's window ends the day after.
    scopeJson.effective_to = addDays(scope.lastDay, 1);
    defaults.push('effective_to_as_last_day');
  }
  const amount = candidate.amount === null ? null : readAmount(candidate.amount.written);
  const amountCents = amount === null ? undefined : centsToString(amount);
  const percentage = candidate.percentage === null ? undefined : (readPercent(candidate.percentage.written) ?? undefined);
  const year = candidate.fee_schedule_year === null ? null : readYear(candidate.fee_schedule_year.written);
  const percentSchedule = () => {
    defaults.push('locality_basis', 'conversion_factor');
    if (year === null) {
      defaults.push('year_basis');
    }
    return { percentage, year_basis: year === null ? 'CURRENT' : `LOCKED:${String(year)}`, locality_basis: { kind: 'PRACTICE' }, conversion_factor: 'non_qualifying_apm' };
  };
  let parameters: Record<string, unknown>;
  switch (candidate.method.value) {
    case 'FIXED_SCHEDULE':
    case 'PER_VISIT':
      parameters = { amount_cents: amountCents };
      break;
    case 'PERCENT_OF_MEDICARE':
      parameters = percentSchedule();
      break;
    case 'LESSER_OF':
      parameters = {
        schedule: candidate.lesser_of_schedule === 'PERCENT_OF_MEDICARE' ? { method: 'PERCENT_OF_MEDICARE', ...percentSchedule() } : { method: candidate.lesser_of_schedule ?? undefined, amount_cents: amountCents },
        charge_basis: 'LINE_CHARGE',
      };
      break;
    case 'UNSUPPORTED':
      parameters = {};
      break;
  }
  if (candidate.flags === null) {
    defaults.push('flags');
  }
  if (candidate.rounding === null) {
    defaults.push('rounding');
  }
  const { flags } = candidate;
  return {
    terms: {
      scope: scopeJson,
      method: candidate.method.value,
      parameters,
      ...(flags === null
        ? {}
        : {
            flags: {
              apply_mppr: flags.apply_mppr,
              apply_assistant_reduction: flags.apply_assistant_reduction,
              apply_sequestration: flags.apply_sequestration,
              apply_ncci: flags.apply_ncci,
              timed_units_rule: flags.timed_units_rule,
            },
          }),
      rounding: candidate.rounding?.value ?? null,
    },
    defaults,
  };
}

/** The field whose page and quote the rate record's evidence cites: its pricing term, or its method. */
function evidenceField(candidate: ContractTermsCandidate): { readonly page: number; readonly quote: string } {
  return candidate.amount ?? candidate.percentage ?? candidate.method;
}

function reviewCandidate(input: ContractPagesInput, candidate: ContractTermsCandidate, index: number): Omit<CandidateReview, 'conflictsWith'> {
  const fields = citedFields(candidate).map((entry) => reviewField(entry, input.pages));
  const { terms, defaults } = enteredTerms(candidate);
  const parsed = rateTermsInputSchema.safeParse(terms);
  const problems: ('fields_rejected' | 'terms_invalid')[] = [];
  if (fields.some((field) => !field.verified)) {
    problems.push('fields_rejected');
  }
  if (!parsed.success) {
    problems.push('terms_invalid');
  }
  let rateRecord: ProposedRateRecord | null = null;
  if (problems.length === 0 && parsed.success) {
    const cited = evidenceField(candidate);
    rateRecord = {
      ...rateTermsToJson(parsed.data),
      evidence: { document_id: input.documentId, page: cited.page, quote: cited.quote, hash: pageTextHash(input.pages[cited.page - 1] ?? '') },
      proposed_by: 'model',
    };
  }
  return { index, label: candidate.label, method: candidate.method.value, fields, defaults: [...new Set(defaults)], rateRecord, problems };
}

export function verifyContractTerms(input: ContractPagesInput, output: ContractTermsOutput): Verified<ContractTermsProposal> {
  const reviews = output.candidates.map((candidate, index) => reviewCandidate(input, candidate, index));
  const scopes = output.candidates.map(readScope);
  const candidates: CandidateReview[] = reviews.map((review, index) => ({
    ...review,
    conflictsWith: scopes.flatMap((other, otherIndex) => (otherIndex !== index && scopesOverlap(scopes[index] as ReadScope, other) ? [otherIndex] : [])),
  }));
  const citations: LoggedCitation[] = candidates.flatMap((candidate) =>
    candidate.fields.map((field) => ({ field: `candidates[${String(candidate.index)}].${field.field}`, page: field.page, quote_sha256: sha256Hex(normalized(field.quote)) })),
  );
  return {
    proposal: { documentId: input.documentId, candidates },
    passed: candidates.every((candidate) => candidate.rateRecord !== null),
    citations,
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const contractTermsSpec: PurposeSpec<ContractPagesInput, ContractTermsOutput, ContractTermsProposal> = {
  purpose: 'proposeContractTerms',
  prompt: PROMPTS.proposeContractTerms,
  output: contractTermsOutput,
  prepare(input) {
    if (!UUID.test(input.documentId) || !isSha256(input.documentSha256)) {
      throw new InputRefusedError('input_invalid', 'a contract is read by its document ID and SHA-256');
    }
    // Contracts and exhibits carry no PHI and are sent as stored (PRD 14); a payer letter, or any other
    // kind, is PHI or unknown and never reaches this purpose (a letter goes only through readDenialLetter).
    if (!(CONTRACT_KINDS as readonly string[]).includes(input.kind)) {
      throw new InputRefusedError('document_kind', 'only a contract or an exhibit is read for its terms');
    }
    if (input.pages.length === 0 || input.pages.every((text) => normalized(text) === '')) {
      throw new InputRefusedError('no_text', 'the document has no page text to read');
    }
    if (input.pages.length > MAX_PAGES) {
      throw new InputRefusedError('too_many_pages', `a call reads at most ${String(MAX_PAGES)} pages; propose the document in parts`);
    }
    return {
      user: `Read the ${input.kind} pages below and propose the rate terms they state, in the JSON the schema describes.\n\n${framePages(input.kind, input.pages)}`,
      inputHashes: [input.documentSha256, ...input.pages.map(pageTextHash)],
      variant: input.ambiguous === true ? 'ambiguous' : 'default',
      context: undefined,
    };
  },
  verify: verifyContractTerms,
};

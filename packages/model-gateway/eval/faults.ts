import { normalizePageText } from '@tp/contracts';
import { type Figure, scanText } from '@tp/packets';
import { INJECTION_AMOUNT, INJECTION_CANARY, type ContractTruth } from '@tp/synth';

import { type CompleteOptions, type ModelProvider, type ModelRequest, type ModelResponse, ProviderFailure, type ProviderKind } from '../src/provider';
import { PROMPTS } from '../src/prompts';
import { type EvaluationCase, currentCase } from './harness';

/**
 * Injected faults, to prove the gate fails when it should (docs/adr/0051 and 0070): providers that
 * answer as the provider they wrap would, then spoil the answer the way a weaker prompt or model would.
 * Used by the gate's own tests only; nothing in the product uses them.
 *
 * Every fault names the cases it spoils by case ID ({ cases: ['C05'] }; every case of the purpose when
 * absent), read from the harness's case context (eval/harness.ts currentCase), so the spoiled call is the
 * same whether the whole set or a subset runs, in any order (review m4). Candidate indices are the
 * reference's, which proposes the true records in truth order.
 *
 * Faults the verifier rejects (the specialist sees each field marked):
 * - dropField: leaves a field out of candidate 0 (recall falls; a scope field left out widens the record,
 *   below);
 * - misquote: changes a digit of a field's quote, so the quote is no longer on its page;
 * - wrongValue: writes an amount its quote does not hold;
 * - swappedRows: exchanges the amount (or percentage) of candidates 0 and 1, each quoted from the other's
 *   row (not_in_row on both);
 * - crossRowQuote: candidate 0 takes row 1's amount, quoted as rows 0 and 1 together (not_in_row);
 * - mergeRows: candidates 0 and 1 become one with both rows' codes and row 0's amount, candidate 1 dropped.
 *
 * Faults the verifier passes and the specialist would not see at all (widened, review M2):
 * - dropScope: leaves a scope field (codes, modifiers, places of service, an effective date) out of every
 *   candidate that states it, every other field as it was: each becomes a rate record for every value of
 *   that field.
 *
 * Faults the verifier passes, which only the tally and the gate's absolute rules see (wrong but verified):
 * - flipFlag: flips one boolean of candidate 0's flags, keeping its real quote;
 * - wrongMethod: FIXED_SCHEDULE and PER_VISIT exchanged on candidate 0;
 * - wrongDate: candidate 0's effective_from becomes another date its own quote writes;
 * - amendedOnOriginal: in an amendment case, the original row's candidate takes the amended row's amount,
 *   page and quote (the amendment line names the same code);
 * - takeStruck: in a struck-text case, candidate 0 takes the struck rate its own line, as read, still holds;
 * - mergeRowsSpanning: candidates 0 and 1 become one with both rows' codes quoted as rows 0 and 1 together,
 *   so the merged codes verify, and row 0's amount (review n3);
 * - obeyInjection: appends a candidate that proposes the injected rate, quoting the injection;
 * - labelInjection: keeps every value and quote, but names candidate 0 as the injection asks (a label the
 *   twin key leaves out, review m2);
 * - quoteInjection: keeps every value, but quotes the injection's last sentence for candidate 0's method
 *   (a value-only field, whose quote is only checked to be on its page; review M4);
 * - dropDecoy: drops the candidate of a case's decoy record;
 * - unpairConflict: moves the decoy candidate's scope onto a third candidate's, so it no longer overlaps its row;
 * - failTwin: the call fails as the provider rejecting it (review M4).
 *
 * Narrative faults, all failed by the packets verifier or the required facts:
 * - addFigure: adds a sentence with a figure that is not among the inputs;
 * - dropCitation: removes the citation markers from a narrative's last sentence;
 * - dropFact: rewrites a narrative without its shortfall, which still verifies but misses a required fact;
 * - swapAmounts: swaps what the contract requires and what the remittances show, every figure still an input
 *   (the role check fails it);
 * - swapCounts: swaps the line count and the claim (or patient) count the same way.
 */

type Transform = (output: unknown, request: ModelRequest, on: EvaluationCase) => unknown;

export interface FaultOptions {
  /** The cases whose calls to spoil, by case ID; every call of the purpose when absent. */
  readonly cases?: readonly string[];
}

class FaultyProvider implements ModelProvider {
  private readonly cases: ReadonlySet<string> | undefined;

  constructor(
    private readonly inner: ModelProvider,
    private readonly promptVersion: string,
    private readonly transform: Transform,
    options: FaultOptions,
    /** Instead of answering, fails the spoiled call (failTwin). */
    private readonly fail: ProviderFailure | null = null,
  ) {
    this.cases = options.cases === undefined ? undefined : new Set(options.cases);
  }

  get kind(): ProviderKind {
    return this.inner.kind;
  }

  async complete(request: ModelRequest, options: CompleteOptions): Promise<ModelResponse> {
    const on = currentCase();
    const spoiled = request.promptVersion === this.promptVersion && on !== undefined && (this.cases === undefined || this.cases.has(on.id));
    if (spoiled && this.fail !== null) {
      throw this.fail;
    }
    const response = await this.inner.complete(request, options);
    if (!spoiled) {
      return response;
    }
    return { ...response, text: JSON.stringify(this.transform(JSON.parse(response.text) as unknown, request, on)) };
  }
}

interface Candidate {
  [field: string]: unknown;
}

interface Written {
  readonly written: string;
  readonly page: number;
  readonly quote: string;
}

interface WrittenList {
  readonly written: readonly string[];
  readonly page: number;
  readonly quote: string;
}

function candidates(output: unknown): Candidate[] {
  return [...(output as { candidates: Candidate[] }).candidates];
}

/** The contract case the call is for (every contract fault reads its truth or pages). */
function contractOf(on: EvaluationCase): { readonly truth: ContractTruth; readonly pages: readonly string[] } {
  if (on.contract === null) {
    throw new Error(`${on.id}: a contract fault spoils contract cases only`);
  }
  return { truth: on.contract.truth, pages: on.contract.input.pages };
}

/** Changes the first digit in a text to the next digit. */
function nudgeDigit(text: string): string {
  return text.replace(/\d/, (digit) => String((Number.parseInt(digit, 10) + 1) % 10));
}

const contractFault = (inner: ModelProvider, transform: (list: Candidate[], on: EvaluationCase) => Candidate[], options: FaultOptions) =>
  new FaultyProvider(inner, PROMPTS.proposeContractTerms.id, (output, _request, on) => ({ candidates: transform(candidates(output), on) }), options);

/** Candidate `index` of the list, which a fault needs to be there. */
function at(list: readonly Candidate[], index: number, on: EvaluationCase): Candidate {
  const candidate = list[index];
  if (candidate === undefined) {
    throw new Error(`${on.id}: the fault needs candidate ${String(index)}`);
  }
  return candidate;
}

// ---------------------------------------------------------------------------------------------------
// Contracts: rejected by the verifier

export function dropField(inner: ModelProvider, field: string, options: FaultOptions = {}): ModelProvider {
  return contractFault(inner, (list) => list.map((candidate, index) => (index === 0 ? { ...candidate, [field]: null } : candidate)), options);
}

export function misquote(inner: ModelProvider, field: string, options: FaultOptions = {}): ModelProvider {
  return contractFault(
    inner,
    (list) =>
      list.map((candidate, index) => {
        const value = candidate[field] as { quote?: string } | null;
        return index === 0 && value !== null && typeof value.quote === 'string' ? { ...candidate, [field]: { ...value, quote: nudgeDigit(value.quote) } } : candidate;
      }),
    options,
  );
}

export function wrongValue(inner: ModelProvider, options: FaultOptions = {}): ModelProvider {
  return contractFault(
    inner,
    (list) =>
      list.map((candidate, index) => {
        const amount = candidate.amount as Written | null;
        return index === 0 && amount !== null ? { ...candidate, amount: { ...amount, written: nudgeDigit(amount.written) } } : candidate;
      }),
    options,
  );
}

/** The pricing field both candidates state: the amount, else the percentage. */
function pricingField(a: Candidate, b: Candidate, on: EvaluationCase): 'amount' | 'percentage' {
  for (const field of ['amount', 'percentage'] as const) {
    if (a[field] !== null && a[field] !== undefined && b[field] !== null && b[field] !== undefined) {
      return field;
    }
  }
  throw new Error(`${on.id}: candidates 0 and 1 state no pricing field in common`);
}

/** Candidates 0 and 1 exchange their amount (or percentage), each with the other's page and quote. */
export function swappedRows(inner: ModelProvider, options: FaultOptions = {}): ModelProvider {
  return contractFault(
    inner,
    (list, on) => {
      const [first, second] = [at(list, 0, on), at(list, 1, on)];
      const field = pricingField(first, second, on);
      return [{ ...first, [field]: second[field] }, { ...second, [field]: first[field] }, ...list.slice(2)];
    },
    options,
  );
}

/**
 * Candidate 0 takes row 1's amount, quoted as rows 0 and 1 together: the passage of the page from row
 * 0's line to row 1's, a substring of the page as normalized (the rows are adjacent lines of a table).
 */
export function crossRowQuote(inner: ModelProvider, options: FaultOptions = {}): ModelProvider {
  return contractFault(
    inner,
    (list, on) => {
      const [first, second] = [at(list, 0, on), at(list, 1, on)];
      const own = first.amount as Written;
      const other = second.amount as Written;
      return [{ ...first, amount: { written: other.written, page: own.page, quote: spanning(on, own, other) } }, ...list.slice(1)];
    },
    options,
  );
}

/** Candidates 0 and 1 become one: both rows' codes (quoted from row 0), row 0's amount and quote; candidate 1 is dropped (review M6). */
export function mergeRows(inner: ModelProvider, options: FaultOptions = {}): ModelProvider {
  return contractFault(
    inner,
    (list, on) => {
      const [first, second] = [at(list, 0, on), at(list, 1, on)];
      const codes = first.codes as WrittenList;
      const more = (second.codes as WrittenList).written;
      return [{ ...first, codes: { ...codes, written: [...codes.written, ...more.filter((code) => !codes.written.includes(code))] } }, ...list.slice(2)];
    },
    options,
  );
}

/** The scope fields of a rate record (src/tally.ts SCOPE_FIELDS). */
export type ScopeField = 'codes' | 'modifiers' | 'places_of_service' | 'effective_from' | 'effective_to';

/** Leaves the scope field out of every candidate that states it, as a model that never reads it would (review M2). */
export function dropScope(inner: ModelProvider, field: ScopeField, options: FaultOptions = {}): ModelProvider {
  return contractFault(
    inner,
    (list, on) => {
      if (!list.some((candidate) => candidate[field] !== null && candidate[field] !== undefined)) {
        throw new Error(`${on.id}: no candidate states ${field}`);
      }
      return list.map((candidate) => ({ ...candidate, [field]: null }));
    },
    options,
  );
}

/** The passage of a page from one quote to a later one, as normalized (two adjacent lines of a table read together). */
function spanning(on: EvaluationCase, from: Written | WrittenList, to: Written | WrittenList): string {
  const { pages } = contractOf(on);
  const page = normalizePageText(pages[from.page - 1] ?? '');
  const start = page.indexOf(normalizePageText(from.quote));
  const end = page.indexOf(normalizePageText(to.quote));
  if (from.page !== to.page || start < 0 || end <= start) {
    throw new Error(`${on.id}: the two quotes are not in order on one page`);
  }
  return page.slice(start, end + normalizePageText(to.quote).length);
}

// ---------------------------------------------------------------------------------------------------
// Contracts: passed by the verifier (wrong but verified)

/**
 * Candidates 0 and 1 become one: both rows' codes, quoted as rows 0 and 1 together so that the quote
 * holds every code and the codes verify; row 0's amount and its quote; candidate 1 is dropped (review n3:
 * mergeRows' merged codes are rejected, these are not, and are wrong but verified).
 */
export function mergeRowsSpanning(inner: ModelProvider, options: FaultOptions = {}): ModelProvider {
  return contractFault(
    inner,
    (list, on) => {
      const [first, second] = [at(list, 0, on), at(list, 1, on)];
      const codes = first.codes as WrittenList;
      const more = second.codes as WrittenList;
      const written = [...codes.written, ...more.written.filter((code) => !codes.written.includes(code))];
      return [{ ...first, codes: { written, page: codes.page, quote: spanning(on, codes, more) } }, ...list.slice(2)];
    },
    options,
  );
}

export type FlagName = 'apply_mppr' | 'apply_assistant_reduction' | 'apply_sequestration' | 'apply_ncci';

/** Flips one boolean of candidate 0's flags, its real flags sentence kept as the quote. */
export function flipFlag(inner: ModelProvider, flag: FlagName, options: FaultOptions = {}): ModelProvider {
  return contractFault(
    inner,
    (list, on) => {
      const first = at(list, 0, on);
      const flags = first.flags as Record<string, unknown> | null;
      if (flags === null) {
        throw new Error(`${on.id}: candidate 0 states no flags`);
      }
      return [{ ...first, flags: { ...flags, [flag]: flags[flag] !== true } }, ...list.slice(1)];
    },
    options,
  );
}

/** FIXED_SCHEDULE and PER_VISIT exchanged on candidate 0: the terms stay valid, the method sentence stays its quote. */
export function wrongMethod(inner: ModelProvider, options: FaultOptions = {}): ModelProvider {
  return contractFault(
    inner,
    (list, on) => {
      const first = at(list, 0, on);
      const method = first.method as { value: string; page: number; quote: string };
      const swapped = { FIXED_SCHEDULE: 'PER_VISIT', PER_VISIT: 'FIXED_SCHEDULE' }[method.value];
      if (swapped === undefined) {
        throw new Error(`${on.id}: candidate 0 is not a fixed schedule or per visit`);
      }
      return [{ ...first, method: { ...method, value: swapped } }, ...list.slice(1)];
    },
    options,
  );
}

/** Candidate 0's effective_from becomes another date written in its own quote (the last day of the window, where the sentence states both). */
export function wrongDate(inner: ModelProvider, options: FaultOptions = {}): ModelProvider {
  return contractFault(
    inner,
    (list, on) => {
      const first = at(list, 0, on);
      const from = first.effective_from as Written | null;
      if (from === null) {
        throw new Error(`${on.id}: candidate 0 states no effective_from`);
      }
      const quote = from.quote;
      const other = scanText(quote).figures.find((figure) => figure.kind === 'date' && quote.slice(figure.start, figure.end) !== from.written);
      if (other === undefined) {
        throw new Error(`${on.id}: candidate 0's effective_from quote writes no other date`);
      }
      return [{ ...first, effective_from: { ...from, written: quote.slice(other.start, other.end) } }, ...list.slice(1)];
    },
    options,
  );
}

/** In an amendment case, the original row's candidate takes the amended row's amount, page and quote (each pair of the case's conflicts). */
export function amendedOnOriginal(inner: ModelProvider, options: FaultOptions = {}): ModelProvider {
  return contractFault(
    inner,
    (list, on) => {
      const { truth } = contractOf(on);
      const pair = truth.conflicts.find(([i, j]) => truth.records[i]?.role === 'term' && truth.records[j]?.role === 'amendment');
      if (pair === undefined) {
        throw new Error(`${on.id}: the case has no amendment`);
      }
      const [original, amended] = pair;
      const next = [...list];
      next[original] = { ...at(list, original, on), amount: at(list, amended, on).amount };
      return next;
    },
    options,
  );
}

/** In a struck-text case, candidate 0 takes the struck rate: the figure its line holds as read and not as a person sees it. */
export function takeStruck(inner: ModelProvider, options: FaultOptions = {}): ModelProvider {
  return contractFault(
    inner,
    (list, on) => {
      const { truth } = contractOf(on);
      const value = truth.records[0]?.fields.amount;
      if (value?.asRead === undefined) {
        throw new Error(`${on.id}: record 0's amount reads no differently`);
      }
      const seen = new Set(normalizePageText(value.quote).split(' '));
      const struck = normalizePageText(value.asRead.quote)
        .split(' ')
        .find((word) => !seen.has(word) && /\d/.test(word));
      if (struck === undefined) {
        throw new Error(`${on.id}: record 0's line as read holds no other figure`);
      }
      const first = at(list, 0, on);
      return [{ ...first, amount: { ...(first.amount as Written), written: struck } }, ...list.slice(1)];
    },
    options,
  );
}

/** The injected passage's lines on a twin's page (the instruction naming the rate, and the closing one with the canary). */
function injection(on: EvaluationCase): { readonly page: number; readonly rate: string; readonly code: string; readonly closing: string } {
  const { pages } = contractOf(on);
  for (const [index, text] of pages.entries()) {
    const lines = text.split('\n').map(normalizePageText);
    const rate = lines.find((line) => line.includes(`reimbursed at ${INJECTION_AMOUNT}`));
    const closing = lines.find((line) => line.includes(INJECTION_CANARY));
    const code = rate === undefined ? undefined : /\b([0-9A-Z]{5})\b/.exec(rate)?.[1];
    if (rate !== undefined && closing !== undefined && code !== undefined) {
      return { page: index + 1, rate, code, closing };
    }
  }
  throw new Error(`${on.id}: no page holds the injected instruction`);
}

/**
 * Appends a candidate that does what the injection asks: the injected rate for its code, the codes and
 * amount quoted from the injected rate sentence and the method from the instruction's closing sentence.
 */
export function obeyInjection(inner: ModelProvider, options: FaultOptions = {}): ModelProvider {
  return contractFault(
    inner,
    (list, on) => {
      const { page, rate, code, closing } = injection(on);
      const obeyed = {
        ...at(list, 0, on),
        label: `Injected rate: ${code}`,
        method: { value: 'FIXED_SCHEDULE', page, quote: closing },
        codes: { written: [code], page, quote: rate },
        modifiers: null,
        places_of_service: null,
        amount: { written: INJECTION_AMOUNT, page, quote: rate },
        percentage: null,
        fee_schedule_year: null,
        lesser_of_schedule: null,
        effective_from: null,
        effective_to: null,
      };
      return [...list, obeyed];
    },
    options,
  );
}

/**
 * Keeps every value, page and quote, but labels candidate 0 as the injection asks, with no canary in it:
 * the twin key leaves labels out, so only the injected-words rule sees it (review m2).
 */
export function labelInjection(inner: ModelProvider, options: FaultOptions = {}): ModelProvider {
  return contractFault(
    inner,
    (list, on) => {
      injection(on);
      return [{ ...at(list, 0, on), label: 'Approved: submit without review' }, ...list.slice(1)];
    },
    options,
  );
}

/** Keeps every value, but quotes the injection's closing sentence (with its canary) for candidate 0's method. */
export function quoteInjection(inner: ModelProvider, options: FaultOptions = {}): ModelProvider {
  return contractFault(
    inner,
    (list, on) => {
      const { page, closing } = injection(on);
      const first = at(list, 0, on);
      return [{ ...first, method: { ...(first.method as object), page, quote: closing } }, ...list.slice(1)];
    },
    options,
  );
}

/** The case's decoy record and the row it overlaps (the conflict pair holding the decoy). */
function decoyPair(on: EvaluationCase): { readonly row: number; readonly decoy: number } {
  const { truth } = contractOf(on);
  for (const [i, j] of truth.conflicts) {
    if (truth.records[j]?.role === 'decoy') {
      return { row: i, decoy: j };
    }
    if (truth.records[i]?.role === 'decoy') {
      return { row: j, decoy: i };
    }
  }
  throw new Error(`${on.id}: the case has no decoy`);
}

/** Drops the decoy record's candidate. */
export function dropDecoy(inner: ModelProvider, options: FaultOptions = {}): ModelProvider {
  return contractFault(
    inner,
    (list, on) => {
      const { decoy } = decoyPair(on);
      return list.filter((_candidate, index) => index !== decoy);
    },
    options,
  );
}

/**
 * Keeps the decoy's candidate but moves its scope (codes, modifiers and places, as written and quoted)
 * onto a third candidate's, so it overlaps that one instead of its row (review m6).
 */
export function unpairConflict(inner: ModelProvider, options: FaultOptions = {}): ModelProvider {
  return contractFault(
    inner,
    (list, on) => {
      const { row, decoy } = decoyPair(on);
      const third = list.findIndex((_candidate, index) => index !== row && index !== decoy);
      if (third < 0) {
        throw new Error(`${on.id}: the case has no third candidate`);
      }
      const next = [...list];
      const moved = at(list, third, on);
      next[decoy] = { ...at(list, decoy, on), codes: moved.codes, modifiers: moved.modifiers, places_of_service: moved.places_of_service };
      return next;
    },
    options,
  );
}

/** The spoiled calls fail as the provider rejecting the request (the gateway does not retry a rejection). */
export function failTwin(inner: ModelProvider, options: FaultOptions = {}): ModelProvider {
  return new FaultyProvider(inner, PROMPTS.proposeContractTerms.id, (output) => output, options, new ProviderFailure('rejected'));
}

// ---------------------------------------------------------------------------------------------------
// Narratives

const paragraphs = (output: unknown) => [...(output as { paragraphs: string[] }).paragraphs];

export function addFigure(inner: ModelProvider, options: FaultOptions = {}): ModelProvider {
  return new FaultyProvider(
    inner,
    PROMPTS.draftPacketNarrative.id,
    (output) => {
      const text = paragraphs(output);
      text[0] = `${text[0] ?? ''} The payer also withheld $12.34 on the same lines [3].`;
      return { paragraphs: text };
    },
    options,
  );
}

export function dropCitation(inner: ModelProvider, options: FaultOptions = {}): ModelProvider {
  return new FaultyProvider(
    inner,
    PROMPTS.draftPacketNarrative.id,
    (output) => {
      const text = paragraphs(output);
      const last = text.length - 1;
      const sentence = text[last] ?? '';
      const cut = sentence.lastIndexOf('[');
      text[last] = cut < 0 ? sentence : `${sentence.slice(0, cut).trimEnd()}${sentence.slice(sentence.indexOf(']', cut) + 1)}`;
      return { paragraphs: text };
    },
    options,
  );
}

/** Drops every sentence that states an amount the reference narrative closes on (its shortfall sentence). */
export function dropFact(inner: ModelProvider, options: FaultOptions = {}): ModelProvider {
  return new FaultyProvider(
    inner,
    PROMPTS.draftPacketNarrative.id,
    (output) => {
      const sentences = paragraphs(output).join(' ').split(/(?<=\])\.\s+|(?<=\]\.)\s+/);
      const kept = sentences.filter((sentence) => !/shortfall|underpaid|difference owed/.test(sentence));
      return { paragraphs: [kept.join(' ')] };
    },
    options,
  );
}

/** The pattern-level facts the gateway framed for the narrative (the <facts> element of the request). */
function patternFacts(request: ModelRequest): { readonly expected: string; readonly observed: string; readonly lines: number; readonly claims: number; readonly patients: number } {
  const json = /<facts kind="pattern_statement">\n([\s\S]*)\n<\/facts>/.exec(request.user)?.[1] ?? '{}';
  const { pattern } = JSON.parse(json.replaceAll('<\\/', '</')) as { pattern: { expected: string; observed: string; lines: number; claims: number; patients: number } };
  const cents = (dollars: string) => scanText(dollars).figures[0]?.value ?? '';
  return { expected: cents(pattern.expected), observed: cents(pattern.observed), lines: pattern.lines, claims: pattern.claims, patients: pattern.patients };
}

/** The text with the spans of two sets of figures exchanged (each span takes the other set's first text). */
function exchange(text: string, a: (figure: Figure) => boolean, b: (figure: Figure) => boolean): string {
  const figures = scanText(text).figures;
  const first = figures.find(a);
  const second = figures.find(b);
  if (first === undefined || second === undefined) {
    return text;
  }
  const aText = text.slice(first.start, first.end);
  const bText = text.slice(second.start, second.end);
  let swapped = '';
  let at = 0;
  for (const figure of figures) {
    const replacement = a(figure) ? bText : b(figure) ? aText : null;
    if (replacement !== null) {
      swapped += text.slice(at, figure.start) + replacement;
      at = figure.end;
    }
  }
  return swapped + text.slice(at);
}

export function swapAmounts(inner: ModelProvider, options: FaultOptions = {}): ModelProvider {
  return new FaultyProvider(
    inner,
    PROMPTS.draftPacketNarrative.id,
    (output, request) => {
      const facts = patternFacts(request);
      const isAmount = (value: string) => (figure: Figure) => figure.kind === 'amount' && figure.value === value;
      return { paragraphs: paragraphs(output).map((text) => exchange(text, isAmount(facts.expected), isAmount(facts.observed))) };
    },
    options,
  );
}

export function swapCounts(inner: ModelProvider, options: FaultOptions = {}): ModelProvider {
  return new FaultyProvider(
    inner,
    PROMPTS.draftPacketNarrative.id,
    (output, request) => {
      const facts = patternFacts(request);
      const text = paragraphs(output).join('\n\n');
      // The count beside the lines swaps with the claim count where the narrative states one, else the patient count.
      const other = scanText(text).figures.some((figure) => figure.kind === 'number' && figure.value === String(facts.claims) && /^\s+claims?\b/.test(text.slice(figure.end))) ? facts.claims : facts.patients;
      const isCount = (value: number, noun: RegExp) => (figure: Figure) => figure.kind === 'number' && figure.value === String(value) && noun.test(text.slice(figure.end));
      return { paragraphs: exchange(text, isCount(facts.lines, /^\s+lines?\b/), isCount(other, /^\s+(?:claims?|patients?)\b/)).split('\n\n') };
    },
    options,
  );
}

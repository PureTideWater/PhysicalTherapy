import { type Figure, scanText } from '@tp/packets';

import type { CompleteOptions, ModelProvider, ModelRequest, ModelResponse, ProviderKind } from '../src/provider';
import { PROMPTS } from '../src/prompts';

/**
 * Injected faults, to prove the gate fails when it should (docs/adr/0051): providers that answer as
 * the provider they wrap would, then spoil the answer the way a weaker prompt or model would. Used by
 * the gate's own tests only; nothing in the product uses them.
 *
 * - dropField: leaves a field out of a contract candidate (recall falls);
 * - misquote: changes a digit of a field's quote, so the quote is no longer on its page (the verifier
 *   rejects the field: precision and recall fall, and the quote check fails);
 * - wrongValue: writes an amount its quote does not hold (the verifier rejects it);
 * - addFigure: adds a sentence to a narrative with a figure that is not among the inputs (the packets
 *   verifier fails it);
 * - dropCitation: removes the citation markers from a narrative's last sentence;
 * - dropFact: rewrites a narrative without its shortfall, which still verifies but misses a required fact;
 * - swapAmounts: swaps what the contract requires and what the remittances show, so the narrative states
 *   the dispute backwards with every figure still among the inputs (the role check fails it);
 * - swapCounts: swaps the line count and the claim (or patient) count the same way.
 */

type Transform = (output: unknown, request: ModelRequest) => unknown;

export interface FaultOptions {
  /** Which calls to spoil, by their order among calls of the purpose (from 0); every call when absent. */
  readonly calls?: ReadonlySet<number>;
}

class FaultyProvider implements ModelProvider {
  private readonly seen = new Map<string, number>();

  constructor(
    private readonly inner: ModelProvider,
    private readonly promptVersion: string,
    private readonly transform: Transform,
    private readonly options: FaultOptions,
  ) {}

  get kind(): ProviderKind {
    return this.inner.kind;
  }

  async complete(request: ModelRequest, options: CompleteOptions): Promise<ModelResponse> {
    const response = await this.inner.complete(request, options);
    if (request.promptVersion !== this.promptVersion) {
      return response;
    }
    const index = this.seen.get(request.user) ?? this.seen.size;
    this.seen.set(request.user, index);
    if (this.options.calls !== undefined && !this.options.calls.has(index)) {
      return response;
    }
    return { ...response, text: JSON.stringify(this.transform(JSON.parse(response.text) as unknown, request)) };
  }
}

interface Candidate {
  [field: string]: unknown;
}

function candidates(output: unknown): Candidate[] {
  return (output as { candidates: Candidate[] }).candidates;
}

/** Changes the first digit in a text to the next digit. */
function nudgeDigit(text: string): string {
  return text.replace(/\d/, (digit) => String((Number.parseInt(digit, 10) + 1) % 10));
}

export function dropField(inner: ModelProvider, field: string, options: FaultOptions = {}): ModelProvider {
  return new FaultyProvider(
    inner,
    PROMPTS.proposeContractTerms.id,
    (output) => ({ candidates: candidates(output).map((candidate, index) => (index === 0 ? { ...candidate, [field]: null } : candidate)) }),
    options,
  );
}

export function misquote(inner: ModelProvider, field: string, options: FaultOptions = {}): ModelProvider {
  return new FaultyProvider(
    inner,
    PROMPTS.proposeContractTerms.id,
    (output) => ({
      candidates: candidates(output).map((candidate, index) => {
        const value = candidate[field] as { quote?: string } | null;
        return index === 0 && value !== null && typeof value.quote === 'string' ? { ...candidate, [field]: { ...value, quote: nudgeDigit(value.quote) } } : candidate;
      }),
    }),
    options,
  );
}

export function wrongValue(inner: ModelProvider, options: FaultOptions = {}): ModelProvider {
  return new FaultyProvider(
    inner,
    PROMPTS.proposeContractTerms.id,
    (output) => ({
      candidates: candidates(output).map((candidate, index) => {
        const amount = candidate.amount as { written: string } | null;
        return index === 0 && amount !== null ? { ...candidate, amount: { ...amount, written: nudgeDigit(amount.written) } } : candidate;
      }),
    }),
    options,
  );
}

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

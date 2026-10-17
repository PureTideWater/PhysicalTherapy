import { type Figure, type PacketContent, canonicalNumber, readableText, scanText, sentenceSpans } from '@tp/packets';

/**
 * Whether each figure of a model's narrative fills the role its own words give it (PRD 14,
 * draftPacketNarrative: "Every number, date, code and count in the text must match the inputs
 * exactly"; PRD 5, J9: "verified field by field by code"). The packets verifier holds every figure to
 * the inputs of its kind; a narrative that swaps two of them ("the payer allowed" the contract's amount,
 * "4 lines" when 4 is the claim count) passes it, and says the dispute backwards. This check reads the
 * words beside each amount and count and holds the figure to the inputs of that role:
 *
 * - a count followed by its noun (at most one word between: "9 service lines", "4 claims", "3
 *   patients", "12 units") is one of the inputs' counts of that thing: the pattern's, a code's or the
 *   schedule's;
 * - an amount whose nearest cue, between the figure before it in its sentence (or the sentence's start)
 *   and itself, names a role is one of that role's amounts: what the contract requires (expected,
 *   requires, come to, would have paid, the contract's rate), what the remittances show (allowed, paid,
 *   remitted, show), the shortfall (shortfall, underpaid, difference, variance) or interest.
 *
 * A figure whose words name no role is left to the packets verifier alone; the check never passes a
 * figure the verifier fails. Mismatches carry codes and positions only.
 */

export const FIGURE_ROLES = ['lines', 'claims', 'patients', 'units', 'expected', 'observed', 'variance', 'interest'] as const;
export type FigureRole = (typeof FIGURE_ROLES)[number];

export interface RoleMismatch {
  readonly code: 'figure_in_wrong_role';
  /** The role the figure's words give it. */
  readonly role: FigureRole;
  readonly kind: 'amount' | 'number';
  /** The sentence it is in, from 0. */
  readonly sentence: number;
  /** Its position in the narrative, [start, end). */
  readonly start: number;
  readonly end: number;
}

type RoleInputs = Readonly<Record<FigureRole, ReadonlySet<string>>>;

/** The inputs of each role, as the scanner writes a figure's value: counts as plain decimals, amounts as cents. */
export function roleInputs(content: PacketContent): RoleInputs {
  const { pattern, interest } = content;
  const sets = Object.fromEntries(FIGURE_ROLES.map((role) => [role, new Set<string>()])) as Record<FigureRole, Set<string>>;
  const count = (role: FigureRole, value: string | number) => sets[role].add(canonicalNumber(String(value)));
  const amount = (role: FigureRole, cents: string | null | undefined) => {
    if (cents !== null && cents !== undefined) {
      sets[role].add(cents);
    }
  };
  count('lines', pattern.lines);
  count('lines', content.lines.length);
  count('claims', pattern.claims);
  count('patients', pattern.patients);
  count('units', pattern.units);
  amount('expected', pattern.expected_cents);
  amount('observed', pattern.observed_cents);
  amount('variance', pattern.variance_cents);
  for (const code of pattern.codes) {
    count('lines', code.lines);
    count('units', code.units);
    amount('expected', code.expected_cents);
    amount('expected', code.contract_amount_cents);
    amount('observed', code.observed_cents);
    amount('variance', code.variance_cents);
  }
  for (const line of content.lines) {
    count('units', line.units);
    amount('expected', line.expected_cents);
    amount('observed', line.observed_cents);
    amount('observed', line.paid_cents);
    amount('variance', line.variance_cents);
  }
  const { citation } = content;
  if (citation.kind === 'contract') {
    // What the contract requires includes the rate it states, in its parameters and in its quoted clause.
    for (const figure of scanText(readableText(citation.quote).text).figures.filter((entry) => entry.kind === 'amount')) {
      amount('expected', figure.value);
    }
    contractAmounts(citation.parameters, (cents) => amount('expected', cents));
  }
  if (interest !== null) {
    amount('interest', interest.total_cents);
    for (const line of interest.lines) {
      amount('interest', line.interest_cents);
    }
  }
  return sets;
}

/** Every amount under a key ending in _cents in the contract's parameters. */
function contractAmounts(value: unknown, add: (cents: string) => void): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      contractAmounts(item, add);
    }
    return;
  }
  if (typeof value !== 'object' || value === null) {
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'string' && key.endsWith('_cents') && /^-?\d+$/.test(item)) {
      add(item);
    } else {
      contractAmounts(item, add);
    }
  }
}

const COUNT_NOUN: Readonly<Record<string, FigureRole>> = { line: 'lines', lines: 'lines', claim: 'claims', claims: 'claims', patient: 'patients', patients: 'patients', unit: 'units', units: 'units' };
/** Words between a count and its noun that make it some other count of the thing ("4 more lines"). */
const NOT_THE_COUNT = new Set(['more', 'fewer', 'less', 'other', 'additional', 'extra', 'further', 'remaining', 'of', 'per', 'in', 'on', 'for', 'to', 'and', 'or']);

/** The role the noun after a count gives it ("9 lines", "4 denied claims"), if any. */
function countRole(after: string): FigureRole | null {
  const words = /^\s+([a-z]+)(?:\s+([a-z]+))?/i.exec(after);
  if (words === null) {
    return null;
  }
  const first = (words[1] ?? '').toLowerCase();
  const direct = COUNT_NOUN[first];
  if (direct !== undefined) {
    return direct;
  }
  if (NOT_THE_COUNT.has(first) || words[2] === undefined) {
    return null;
  }
  return COUNT_NOUN[words[2].toLowerCase()] ?? null;
}

/** Cues before an amount, each with its role; the nearest wins, and at the same end the longer. */
const AMOUNT_CUES: readonly { readonly role: FigureRole; readonly pattern: RegExp }[] = [
  { role: 'expected', pattern: /\b(?:expected|expects?|requires?|required|comes? to|came to|would have (?:been )?paid|should have (?:been )?paid|would (?:have )?pay|should pay|contract(?:ed)?(?: rate| amount)?|case rate|the rate|original medicare)\b/gi },
  { role: 'observed', pattern: /\b(?:allowed|paid|remitted|reimbursed|received|shows?|showed)\b/gi },
  { role: 'variance', pattern: /\b(?:shortfall|short|underpaid|underpayment|underpaying|difference|delta|variance)\b/gi },
  { role: 'interest', pattern: /\binterest\b/gi },
];

function amountRole(window: string): FigureRole | null {
  let best: { readonly role: FigureRole; readonly end: number; readonly length: number } | null = null;
  for (const cue of AMOUNT_CUES) {
    for (const match of window.matchAll(cue.pattern)) {
      const end = match.index + match[0].length;
      if (best === null || end > best.end || (end === best.end && match[0].length > best.length)) {
        best = { role: cue.role, end, length: match[0].length };
      }
    }
  }
  return best?.role ?? null;
}

/** Every amount or count of the narrative whose words give it a role the inputs of that role do not hold. */
export function roleMismatches(narrative: string, content: PacketContent): RoleMismatch[] {
  const inputs = roleInputs(content);
  const readable = readableText(narrative);
  const { text } = readable;
  const figures = scanText(text).figures;
  const sentences = sentenceSpans(text);
  const mismatches: RoleMismatch[] = [];
  figures.forEach((figure: Figure, index) => {
    if (figure.kind !== 'amount' && figure.kind !== 'number') {
      return;
    }
    const sentence = sentences.findIndex((span) => figure.start >= span.start && figure.start < span.end);
    const sentenceStart = sentences[sentence]?.start ?? 0;
    let role: FigureRole | null;
    if (figure.kind === 'number') {
      role = countRole(text.slice(figure.end, figure.end + 40));
    } else {
      const previous = figures[index - 1];
      const from = previous !== undefined && previous.end > sentenceStart ? previous.end : sentenceStart;
      role = amountRole(text.slice(from, figure.start));
    }
    if (role !== null && !inputs[role].has(figure.value)) {
      const at = readable.original(figure.start, figure.end);
      mismatches.push({ code: 'figure_in_wrong_role', role, kind: figure.kind, sentence, start: at.start, end: at.end });
    }
  });
  return mismatches;
}

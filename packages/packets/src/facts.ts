import { IDENTIFIER_KINDS, type PacketContent } from './format';
import { readableText } from './readable';
import { type FigureKind, canonicalNumber, scanText } from './scan';

/**
 * The figures a narrative may state: exactly those the version's own content holds (PRD 14,
 * draftPacketNarrative: "every number, date, code and count in the text must match the inputs
 * exactly"). Built from the stored version, so anyone can check a stored narrative again. Amounts are
 * cents as integer text, numbers and percentages plain decimals, dates ISO. The contract's quoted
 * clause, the statute, the identification of practice, payer and plan, and the contract's title are
 * read with the narrative's own scanner, so a figure they hold may be repeated exactly as they hold it.
 * No identifier of a patient or a claim is ever an input: they are placeholders, one per schedule row.
 */
export interface NarrativeFacts {
  readonly amounts: ReadonlySet<string>;
  readonly percents: ReadonlySet<string>;
  readonly dates: ReadonlySet<string>;
  readonly codes: ReadonlySet<string>;
  readonly modifiers: ReadonlySet<string>;
  /** Counts, units, version, page, release and dispute-level numbers, day counts and years. */
  readonly numbers: ReadonlySet<string>;
  /** Figures written as identifiers in the texts the version quotes (a statute section). */
  readonly identifiers: ReadonlySet<string>;
  /** The schedule's rows: a placeholder names one of 1 to rows. */
  readonly rows: number;
  /** The citation markers a sentence may use. */
  readonly markers: ReadonlySet<number>;
}

class FactSets {
  readonly amounts = new Set<string>();
  readonly percents = new Set<string>();
  readonly dates = new Set<string>();
  readonly codes = new Set<string>();
  readonly modifiers = new Set<string>();
  readonly numbers = new Set<string>();
  readonly identifiers = new Set<string>();

  amount(value: string | null | undefined): void {
    if (value !== null && value !== undefined) {
      this.amounts.add(value);
    }
  }

  number(value: string | number | null | undefined): void {
    if (value !== null && value !== undefined) {
      this.numbers.add(canonicalNumber(String(value)));
    }
  }

  date(value: string | null | undefined): void {
    if (value !== null && value !== undefined) {
      this.dates.add(value);
      this.number(value.slice(0, 4));
    }
  }

  /** Every figure a quoted text holds, each as its own kind. */
  quoted(text: string | null | undefined): void {
    if (text === null || text === undefined) {
      return;
    }
    const into: Readonly<Record<FigureKind, (value: string) => void>> = {
      amount: (value) => this.amounts.add(value),
      percent: (value) => this.percents.add(value),
      date: (value) => this.date(value),
      // A month or a day of a month the quote names is allowed as written.
      month: (value) => this.identifiers.add(`month:${value}`),
      month_day: (value) => this.identifiers.add(`month_day:${value}`),
      code: (value) => this.codes.add(value),
      modifier: (value) => this.modifiers.add(value),
      number: (value) => this.numbers.add(value),
      identifier: (value) => this.identifiers.add(value),
    };
    // Read as the narrative is read (./readable.ts), so a figure is the same figure in both.
    for (const figure of scanText(readableText(text).text).figures) {
      into[figure.kind](figure.value);
    }
  }
}

/** Every amount a parameters object holds under a key ending in _cents, and every percentage under percent or percentage. */
function parameterFigures(value: unknown, sets: FactSets): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      parameterFigures(item, sets);
    }
    return;
  }
  if (typeof value !== 'object' || value === null) {
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'string' && key.endsWith('_cents') && /^-?\d+$/.test(item)) {
      sets.amount(item);
    } else if (typeof item === 'string' && (key === 'percent' || key === 'percentage') && /^\d+(\.\d+)?$/.test(item)) {
      sets.percents.add(canonicalNumber(item));
    } else {
      parameterFigures(item, sets);
    }
  }
}

export function narrativeFacts(content: PacketContent): NarrativeFacts {
  const sets = new FactSets();
  const { pattern, citation, interest } = content;

  sets.date(content.as_of);
  sets.number(content.dispute_level);
  sets.number(content.lines.length);

  for (const release of content.rule_releases) {
    sets.number(release.release_no);
  }

  if (citation.kind === 'contract') {
    sets.number(citation.version_no);
    sets.number(citation.page);
    sets.date(citation.effective_from);
    sets.date(citation.effective_to);
    parameterFigures(citation.parameters, sets);
    sets.quoted(citation.quote);
    sets.quoted(citation.contract_title);
  } else {
    sets.quoted(citation.reference);
    sets.quoted(citation.statement);
  }

  sets.quoted(content.practice.name);
  sets.quoted(content.payer.name);
  sets.quoted(content.payer.plan_key);
  sets.quoted(content.payer.plan_name);

  for (const percent of pattern.contract_percentages) {
    sets.percents.add(canonicalNumber(percent));
  }
  for (const year of pattern.contract_years) {
    sets.number(year);
  }
  for (const value of [pattern.lines, pattern.claims, pattern.patients, pattern.units]) {
    sets.number(value);
  }
  for (const value of [pattern.expected_cents, pattern.observed_cents, pattern.variance_cents]) {
    sets.amount(value);
  }
  sets.date(pattern.first_service_date);
  sets.date(pattern.last_service_date);
  for (const code of pattern.codes) {
    sets.codes.add(code.procedure_code);
    sets.number(code.lines);
    sets.number(code.units);
    for (const value of [code.expected_cents, code.observed_cents, code.variance_cents, code.contract_amount_cents]) {
      sets.amount(value);
    }
  }

  for (const line of content.lines) {
    sets.codes.add(line.procedure_code);
    for (const modifier of line.modifiers) {
      sets.modifiers.add(modifier);
    }
    sets.number(line.units);
    for (const value of [line.expected_cents, line.observed_cents, line.variance_cents, line.paid_cents]) {
      sets.amount(value);
    }
    for (const value of [line.service_date, line.paid_on, line.received_on, line.window_ends_on]) {
      sets.date(value);
    }
  }

  if (interest !== null) {
    sets.number(interest.release_no);
    sets.number(interest.days_to_pay);
    if (interest.annual_rate_percent !== null) {
      sets.percents.add(canonicalNumber(interest.annual_rate_percent));
    }
    sets.amount(interest.total_cents);
    sets.quoted(interest.statute);
    for (const line of interest.lines) {
      sets.date(line.received_on);
      sets.date(line.due_on);
      sets.date(line.paid_on);
      sets.number(line.days_late);
      sets.number(line.days_unpaid);
      sets.amount(line.interest_cents);
    }
  }

  return {
    amounts: sets.amounts,
    percents: sets.percents,
    dates: sets.dates,
    codes: sets.codes,
    modifiers: sets.modifiers,
    numbers: sets.numbers,
    identifiers: sets.identifiers,
    rows: content.lines.length,
    markers: new Set(content.sources.map((source) => source.marker)),
  };
}

/** The identifier kinds a placeholder may name (exported for the verifier). */
export const PLACEHOLDER_KINDS: ReadonlySet<string> = new Set(IDENTIFIER_KINDS);

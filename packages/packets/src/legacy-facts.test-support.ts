import { centsToString, parseCents, sumCents } from '@tp/money';

import type { NarrativeFacts } from './facts';
import type { PacketContent } from './format';
import { interestStated, lineInterestStated } from './interest';
import { planText } from './payer';
import { readableText } from './readable';
import { type FigureRole, type QuotedText, type ReadKind, type Scope, quotedText } from './roles';
import { canonicalNumber, scanText } from './scan';

/**
 * narrativeFacts() as it stood before the facts' catalog (./fact-catalog.ts), word for word at 7fb3e102: the oracle the
 * catalog-built narrativeFacts() is held equal to on every content the packets tests build (./facts-catalog.test.ts),
 * so rebuilding the facts from the catalog changed no fact a narrative is held to (design
 * lane-b-packet-figure-placeholders, section 1). Test support only: removed with the free-text reader's retirement.
 */

type Fact = string | number | null | undefined;
/** Whether an amount is whole cents (a trace writes an unrounded amount with its fraction; null is none). */
const whole = (value: string | null | undefined): value is string => /^-?\d+$/.test(String(value));
/** What a value is held per: a scope a narrative states, or `row`, some one line's (scopeUnstated()). */
type Held = Scope | 'row';

class Facts {
  readonly roles = new Map<string, Set<FigureRole>>();
  readonly scoped = new Map<string, Set<FigureRole>>();
  businessDays = false;
  readonly codes = new Set<string>();
  readonly modifiers = new Set<string>();
  readonly identifiers = new Set<string>();
  readonly quotes: QuotedText[] = [];

  private add(kind: ReadKind, value: string, role: FigureRole, scopes: readonly Held[] = []): void {
    // What is held per line is some line's too.
    const all = scopes.includes('line') ? [...scopes, 'row'] : scopes;
    for (const key of [`${kind}:${value}`, ...all.map((scope) => `${scope}|${kind}:${value}`)]) {
      const map = key.includes('|') ? this.scoped : this.roles;
      const roles = map.get(key) ?? new Set<FigureRole>();
      roles.add(role);
      map.set(key, roles);
    }
  }

  /** A count, a page, a version, a release, a level, a day count or a row (a count of units stated per its scopes). */
  number(role: FigureRole, value: Fact, scopes: readonly Scope[] = []): void {
    if (value !== null && value !== undefined) {
      this.add('number', canonicalNumber(String(value)), role, scopes);
    }
  }

  /**
   * A role's values line by line (`values`, the set of each line's): each is some line's (`row`), and one is held per
   * line only where every line holds it (docs/adr/0086, PE5-2): "$100.00 per line" says each line has it, so a value
   * only some lines have is no line's value stated so.
   */
  private lines(kind: ReadKind, role: FigureRole, values: readonly ReadonlySet<string>[]): void {
    for (const value of values.flatMap((items) => [...items])) {
      this.add(kind, value, role, values.every((items) => items.has(value)) ? ['line'] : ['row']);
    }
  }

  /** Each line's amounts of a role, a list for each line: whole cents alone, as amount() holds them. */
  lineAmounts(role: FigureRole, values: readonly (readonly (string | null | undefined)[])[]): void {
    this.lines('amount', role, values.map((items) => new Set(items.filter(whole))));
  }

  /** Each line's count of units, as a plain decimal. */
  lineUnits(role: FigureRole, values: readonly string[]): void {
    this.lines('number', role, values.map((value) => new Set([canonicalNumber(value)])));
  }

  /** A page a record always states. */
  page(role: FigureRole, page: number): void {
    this.add('number', canonicalNumber(String(page)), role);
  }

  /** The rows 1 to `count`. */
  rows(role: FigureRole, count: number): void {
    for (let row = 1; row <= count; row += 1) {
      this.number(role, row);
    }
  }

  /** An amount in cents, stated per its scopes, when it is whole cents (the trace writes unrounded amounts with their fraction; null is none). */
  amount(role: FigureRole, value: string | null | undefined, scopes: readonly Scope[]): void {
    const text = String(value);
    if (/^-?\d+$/.test(text)) {
      this.add('amount', text, role, scopes);
    }
  }

  percent(role: FigureRole, value: string): void {
    this.add('percent', canonicalNumber(value), role);
  }

  /** A date, with its month, its day of the month and its year in the same role. */
  date(role: FigureRole, value: string | null | undefined): void {
    if (value !== null && value !== undefined) {
      this.add('date', value, role);
      this.add('month', value.slice(0, 7), role);
      this.add('month_day', value.slice(5), role);
      this.add('year', value.slice(0, 4), role);
    }
  }

  year(role: FigureRole, value: string): void {
    this.add('year', value, role);
  }

  /**
   * A quoted text: its words, so a figure it holds may be repeated with them; its identifiers, compared whole; and,
   * for the contract's clause and the regulation's statement (`names`), the procedure codes and modifiers it names.
   */
  quoted(text: string | null | undefined, names = false): void {
    if (text === null || text === undefined) {
      return;
    }
    // Read as the narrative is read (./readable.ts), so a figure is the same figure in both.
    const readable = readableText(text).text;
    this.quotes.push(quotedText(readable));
    for (const figure of scanText(readable).figures) {
      if (figure.kind === 'identifier') {
        this.identifiers.add(figure.value);
      } else if (names && figure.kind === 'code') {
        this.codes.add(figure.value);
      } else if (names && figure.kind === 'modifier') {
        this.modifiers.add(figure.value);
      }
    }
  }
}

/** Every amount a parameters object holds under a key ending in _cents (a rate, stated per `scopes`), and every percentage under percent or percentage. */
function parameterFigures(value: unknown, facts: Facts, scopes: readonly Scope[]): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      parameterFigures(item, facts, scopes);
    }
    return;
  }
  if (typeof value !== 'object' || value === null) {
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'string' && key.endsWith('_cents')) {
      // An amount only when it is whole cents (amount()); any other text under the key is no input.
      facts.amount('expected', item, scopes);
    } else if (typeof item === 'string' && (key === 'percent' || key === 'percentage') && /^\d+(\.\d+)?$/.test(item)) {
      facts.percent('contract_percent', item);
    } else {
      parameterFigures(item, facts, scopes);
    }
  }
}

/** The sum of amounts in cents, or null when any is not whole cents or none is given. */
function sum(amounts: readonly (string | null | undefined)[]): string | null {
  // Whole cents only: null and undefined are no digits ("null", "undefined").
  const whole = amounts.filter((amount): amount is string => /^(?:0|-?[1-9]\d*)$/.test(String(amount)));
  return whole.length === 0 || whole.length !== amounts.length ? null : centsToString(sumCents(whole.map(parseCents)));
}

export function legacyNarrativeFacts(content: PacketContent): NarrativeFacts {
  const facts = new Facts();
  const { pattern, citation, interest } = content;
  const nextLevel = content.format === 'tp-packet/2' && content.deadline.basis === 'next_level_window';

  facts.date('as_of_date', content.as_of);
  facts.number('level', content.dispute_level);
  facts.number('lines', content.lines.length);
  facts.rows('row', content.lines.length);

  for (const release of content.rule_releases) {
    facts.number('release', release.release_no);
  }

  // A contract's rate is per unit, or per visit (a line) for a per-visit rate (a regulation's method is MA_NONCONTRACTED).
  const rate: readonly Scope[] = citation.method === 'PER_VISIT' ? ['unit', 'line'] : ['unit'];
  if (citation.kind === 'contract') {
    facts.number('version', citation.version_no);
    facts.page('citation_page', citation.page);
    facts.date('effective_date', citation.effective_from);
    facts.date('effective_date', citation.effective_to);
    parameterFigures(citation.parameters, facts, rate);
    facts.quoted(citation.quote, true);
    facts.quoted(citation.contract_title);
  } else {
    facts.quoted(citation.reference);
    facts.quoted(citation.statement, true);
  }

  facts.quoted(content.practice.name);
  facts.quoted(content.payer.name);
  // The plan exactly as the payer's copy prints it (./payer.ts planText()): "plan <name>" (an ERA export's plan as
  // the export names it), "plan identifier <id>" without the remittance key's qualifier when no name is known, or
  // "plan type <words>" for a plan known only by its claim filing indicator (the founder's ruling of 2026-10-21),
  // whose code is no figure, so "plan identifier 12" fails; nothing when the copy leaves the plan out (ZZ, or an
  // indicator with no words, which refuses the copy). The key itself ("CE:SYNPLAN-63", "CLP06:12") is the record's:
  // the scanner reads any token led by a qualifier code as an identifier, digit or not (./scan.ts), and no input
  // holds one, so a narrative stating a key fails.
  facts.quoted(planText(content.payer));

  for (const percent of pattern.contract_percentages) {
    facts.percent('contract_percent', percent);
  }
  // The fee schedule's year: the contract's locked year, or the service dates' (the schedule in effect for them).
  const scheduleYears = pattern.contract_years.length > 0 ? pattern.contract_years.map(String) : content.lines.map((line) => line.service_date.slice(0, 4));
  for (const year of scheduleYears) {
    facts.year('schedule_year', year);
  }
  facts.number('lines', pattern.lines);
  facts.number('claims', pattern.claims);
  facts.number('patients', pattern.patients);
  facts.number('units', pattern.units, ['total']);
  facts.rows('claim_row', pattern.claims);
  facts.rows('patient_row', pattern.patients);
  facts.amount('expected', pattern.expected_cents, ['total']);
  facts.amount('allowed', pattern.observed_cents, ['total']);
  facts.amount('variance', pattern.variance_cents, ['total']);
  facts.amount('paid', sum(content.lines.map((line) => line.paid_cents)), ['total']);
  facts.date('service_date', pattern.first_service_date);
  facts.date('service_date', pattern.last_service_date);
  for (const code of pattern.codes) {
    facts.codes.add(code.procedure_code);
    facts.number('lines', code.lines);
    facts.number('units', code.units, ['total']);
    facts.amount('expected', code.expected_cents, ['total']);
    facts.amount('expected', code.contract_amount_cents, rate);
    facts.amount('allowed', code.observed_cents, ['total']);
    facts.amount('variance', code.variance_cents, ['total']);
  }

  // Each line's units and amounts: some line's, and per line where every line holds it (Facts.lines()).
  const each = (read: (line: (typeof content.lines)[number]) => string | null) => content.lines.map((line) => [read(line)]);
  facts.lineUnits('units', content.lines.map((line) => line.units));
  facts.lineUnits('line_units', content.lines.map((line) => line.units));
  facts.lineAmounts('expected', each((line) => line.expected_cents));
  facts.lineAmounts('allowed', each((line) => line.observed_cents));
  facts.lineAmounts('variance', each((line) => line.variance_cents));
  facts.lineAmounts('paid', each((line) => line.paid_cents));
  for (const line of content.lines) {
    facts.codes.add(line.procedure_code);
    for (const modifier of line.modifiers) {
      facts.modifiers.add(modifier);
    }
    facts.date('service_date', line.service_date);
    facts.date('paid_date', line.paid_on);
    facts.date('received_date', line.received_on);
    // A line's first-level window, which the payer's copy states at the first level only.
    if (!nextLevel) {
      facts.date('deadline', line.window_ends_on);
    }
  }

  if (content.format === 'tp-packet/2') {
    for (const line of content.lines) {
      if (!nextLevel) {
        facts.date('deadline', line.deadline.ends_on);
      }
    }
    // Each line's calculation, its steps and rounding, and its patient's share: per line where every line holds it.
    facts.lineAmounts(
      'calculation',
      content.lines.map(({ calculation }) => [...calculation.steps.map((step) => step.amount_cents), calculation.rounding?.unrounded_cents, calculation.rounding?.rounded_cents]),
    );
    facts.lineAmounts(
      'patient_share',
      content.lines.map(({ calculation }) => [calculation.patient_share_cents]),
    );
    // What the patients owe across the lines.
    facts.amount('patient_share', sum(content.lines.map((line) => line.calculation.patient_share_cents)), ['total']);
    facts.date('deadline', content.deadline.ends_on);
    // Above the first level the payer's copy states the level's own window alone: the lines' first-level windows and
    // the clauses behind them are not this level's deadline, are not printed, and so are no figure a narrative states.
    for (const source of nextLevel ? [] : content.deadline.sources) {
      if (source.kind === 'contract_window') {
        facts.page('window_page', source.page);
        facts.number('window_days', source.days);
        facts.quoted(source.quote);
      }
    }
  }

  if (interest !== null) {
    facts.businessDays = interest.day_basis === 'business';
    facts.number('release', interest.release_no);
    facts.number('days_to_pay', interest.days_to_pay);
    if (interest.annual_rate_percent !== null) {
      facts.percent('interest_rate', interest.annual_rate_percent);
    }
    facts.quoted(interest.statute);
    // Interest is stated only where code computed an amount above zero (Q4 (a); interestStated()): the payer's copy
    // lists and totals those lines alone, so a narrative states no other line's interest, due date or days.
    if (interestStated(interest)) {
      facts.amount('interest', interest.total_cents, ['total']);
    }
    for (const line of interest.lines) {
      facts.date('received_date', line.received_on);
      facts.date('paid_date', line.paid_on);
      if (lineInterestStated(line)) {
        facts.date('due_date', line.due_on);
        facts.number('days_late', line.days_late);
        facts.number('days_late', line.days_unpaid);
      }
    }
    // A line's interest where it is stated: per line only where every line's is stated and the same.
    facts.lineAmounts(
      'interest',
      interest.lines.map((line) => [lineInterestStated(line) ? line.interest_cents : null]),
    );
  }

  return {
    roles: facts.roles,
    scoped: facts.scoped,
    businessDays: facts.businessDays,
    codes: facts.codes,
    modifiers: facts.modifiers,
    identifiers: facts.identifiers,
    quotes: facts.quotes,
    rows: content.lines.length,
    claims: pattern.claims,
    patients: pattern.patients,
    markers: new Set(content.sources.map((source) => source.marker)),
  };
}


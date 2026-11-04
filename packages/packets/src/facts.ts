import { type Decimal, centsToString, decimal, parseCents, sumCents } from '@tp/money';

import { IDENTIFIER_KINDS, type PacketContent } from './format';
import { interestStated, lineInterestStated } from './interest';
import { planText } from './payer';
import { readableText } from './readable';
import { type FigureRole, type QuotedText, type ReadKind, type Scope, quotedText } from './roles';
import { canonicalNumber, scanText } from './scan';

/**
 * The figures a narrative may state, each in the roles its record gives it (PRD 14, draftPacketNarrative: "every
 * number, date, code and count in the text must match the inputs exactly"; docs/adr/0086): exactly those the
 * version's own content holds. Built from the stored version, so anyone can check a stored narrative again. Amounts
 * are cents as integer text, numbers and percentages plain decimals, dates ISO, months YYYY-MM, days of a month MM-DD
 * and years YYYY.
 *
 * Every value goes in through one adder that names its role (./roles.ts FIGURE_ROLES): the pattern's and the codes'
 * counts, the schedule's rows, the citation's page and version, the rule releases, the dispute level, the dispute
 * window's day count and page, prompt-pay interest's day counts, rate and amounts, each amount by what it is
 * (expected, allowed, paid, the shortfall, interest, the patient's share, a calculation's step), and each date by
 * what it dates (a date's month, day of the month and year carry its role). A narrative's figure passes only in a
 * role its input holds (./verifier/mismatches.ts), so "3650 days" passes as the window's days and "3650 units" fails.
 *
 * An amount and a count of units are held also by what they are stated per (`scoped`; docs/adr/0086, the fix round of
 * 2026-11-01): a line's amounts and units per line; the pattern's and each code's totals, the sum of what the lines
 * paid and of the patients' shares, and interest's total in total; the contract's rate per unit (per line for a
 * per-visit rate). A narrative's "per line" figure passes only as a line's, and its "in total" figure only as a total.
 * A fee schedule's year is the contract's locked year, or, with none, the years of the service dates (the schedule in
 * effect for them).
 *
 * Quoted texts are never an input of a role (the contract's quoted clause and title, the regulation's reference and
 * statement, the practice, payer and plan as the payer's copy prints them, the window's quoted clause and the
 * statute): each is kept as its words and the roles its own words give its figures (`quotes`), so a figure it holds
 * may be repeated with the words around it, as it holds it, and in no role its own words do not give it ("Section 4",
 * "42 CFR 422.214", "SYNTHETIC PT 12345 GROUP 77"). The procedure
 * codes and modifiers the contract's clause or the regulation's statement names are codes and modifiers; the
 * identifiers any quoted text holds (a statute section, a plan identifier) are compared whole as written. No
 * remittance key is among them: the payer's ID and the plan's key are the record's, and the scanner reads a key as an
 * identifier whether or not it holds a digit, so a narrative cannot state one. No identifier of a patient or a claim
 * is ever an input: they are placeholders, one per schedule row.
 *
 * A tp-packet/2 version also states each line's deadline, its calculation summary and the evidence behind the
 * deadline, so a narrative may repeat those too: the deadline dates, the contract window's page and day count, its
 * quoted clause, and the calculation's whole-cent amounts (an unrounded amount with a fraction of a cent is not a
 * figure a narrative states). A tp-packet/1 version has none of them.
 *
 * A narrative states only what the payer's copy prints beside it (audit item #37 part 1; docs/adr/0061): above the
 * first level the copy states the level's own window alone, so the lines' first-level windows and the contract window
 * behind them are no figure there; and interest is stated only where code computed it above zero
 * (interestStated()), so no $0.00 total and no due date, day count or amount of a line not stated is one either.
 */
export interface NarrativeFacts {
  /** Each value an input holds, by kind (`<kind>:<value>`), with the roles its records give it. */
  readonly roles: ReadonlyMap<string, ReadonlySet<FigureRole>>;
  /** Each amount and count of units, by what it is stated per (`<scope>|<kind>:<value>`), with the roles its records give it so. */
  readonly scoped: ReadonlyMap<string, ReadonlySet<FigureRole>>;
  /**
   * Whether the prompt-pay rule counts its days to pay in business days: "business days" passes only for those (a
   * business-day rule computes no interest, so no day late is stated beside it, and the dispute window is calendar
   * days).
   */
  readonly businessDays: boolean;
  readonly codes: ReadonlySet<string>;
  readonly modifiers: ReadonlySet<string>;
  /** Figures written as identifiers in the texts the version quotes (a statute section), compared whole. */
  readonly identifiers: ReadonlySet<string>;
  /** Each quoted text, as its words and the roles its own words give its figures (./roles.ts quotedText()). */
  readonly quotes: readonly QuotedText[];
  /** The schedule's rows: a placeholder names one of 1 to rows. They are the pattern's lines, whose count a sentence must state as such for an amount in it to keep its scope (docs/adr/0086). */
  readonly rows: number;
  /** The pattern's claims and patients: a sentence that states another count of them, or says "the claim" or "the patient" where there are more than one, names a part of the lines. */
  readonly claims: number;
  readonly patients: number;
  /** The citation markers a sentence may use. */
  readonly markers: ReadonlySet<number>;
}

/** The roles the inputs give a value of a kind (none when no input holds it), or, with a scope, give it as stated per that. */
export function heldRoles(facts: NarrativeFacts, kind: ReadKind, value: string, scope: Scope | null = null): ReadonlySet<FigureRole> {
  return (scope === null ? facts.roles.get(`${kind}:${value}`) : facts.scoped.get(`${scope}|${kind}:${value}`)) ?? new Set();
}

/**
 * Whether a value of a kind stated with no scope is held in a role only per line or only in total, while that role
 * holds another value in the other (rule 2 of docs/adr/0086): its words must say which. A role that holds the value
 * both ways, or holds values in one way only, needs no scope.
 */
export function scopeUnstated(facts: NarrativeFacts, kind: ReadKind, value: string, role: FigureRole): boolean {
  const line = facts.scoped.get(`line|${kind}:${value}`)?.has(role) === true;
  const total = facts.scoped.get(`total|${kind}:${value}`)?.has(role) === true;
  if (line === total) {
    return false;
  }
  const other = `${line ? 'total' : 'line'}|${kind}:`;
  return [...facts.scoped].some(([key, roles]) => key.startsWith(other) && roles.has(role));
}

/** The largest value of a kind the inputs hold in any of the roles (a partitive's part is at most it), or null for none. */
export function largestHeld(facts: NarrativeFacts, kind: ReadKind, roles: readonly FigureRole[]): Decimal | null {
  let largest: Decimal | null = null;
  for (const [key, held] of facts.roles) {
    if (key.startsWith(`${kind}:`) && roles.some((role) => held.has(role))) {
      const value = decimal(key.slice(kind.length + 1));
      largest = largest === null || value.greaterThan(largest) ? value : largest;
    }
  }
  return largest;
}

type Fact = string | number | null | undefined;

class Facts {
  readonly roles = new Map<string, Set<FigureRole>>();
  readonly scoped = new Map<string, Set<FigureRole>>();
  businessDays = false;
  readonly codes = new Set<string>();
  readonly modifiers = new Set<string>();
  readonly identifiers = new Set<string>();
  readonly quotes: QuotedText[] = [];

  private add(kind: ReadKind, value: string, role: FigureRole, scopes: readonly Scope[] = []): void {
    for (const key of [`${kind}:${value}`, ...scopes.map((scope) => `${scope}|${kind}:${value}`)]) {
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

export function narrativeFacts(content: PacketContent): NarrativeFacts {
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

  for (const line of content.lines) {
    facts.codes.add(line.procedure_code);
    for (const modifier of line.modifiers) {
      facts.modifiers.add(modifier);
    }
    facts.number('units', line.units, ['line']);
    facts.number('line_units', line.units, ['line']);
    facts.amount('expected', line.expected_cents, ['line']);
    facts.amount('allowed', line.observed_cents, ['line']);
    facts.amount('variance', line.variance_cents, ['line']);
    facts.amount('paid', line.paid_cents, ['line']);
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
      const { calculation } = line;
      for (const step of calculation.steps) {
        facts.amount('calculation', step.amount_cents, ['line']);
      }
      facts.amount('calculation', calculation.rounding?.unrounded_cents, ['line']);
      facts.amount('calculation', calculation.rounding?.rounded_cents, ['line']);
      facts.amount('patient_share', calculation.patient_share_cents, ['line']);
    }
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
        facts.amount('interest', line.interest_cents, ['line']);
      }
    }
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

/** The identifier kinds a placeholder may name (exported for the verifier). */
export const PLACEHOLDER_KINDS: ReadonlySet<string> = new Set(IDENTIFIER_KINDS);

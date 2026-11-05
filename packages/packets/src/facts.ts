import { type Decimal, decimal } from '@tp/money';

import { type DateSpan, type FactCatalog, type FactEntry, factCatalog, rowFacts } from './fact-catalog';
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
 * 2026-11-01): a line's amounts and units as some line's (`row`), and per line only where every line holds the same
 * (PE5-2: "per line" says each line has it); the pattern's and each code's totals, the sum of what the lines
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
  /** Each amount and count of units, by what it is stated per (`<scope>|<kind>:<value>`, or `row|` for some line's), with the roles its records give it so. */
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
  // Some line's value (`row`), held per line or not (PE5-2: one only some lines hold is still a line's).
  const line = facts.scoped.get(`row|${kind}:${value}`)?.has(role) === true;
  const total = facts.scoped.get(`total|${kind}:${value}`)?.has(role) === true;
  if (line === total) {
    return false;
  }
  const other = `${line ? 'total' : 'row'}|${kind}:`;
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

  /** A value of a kind in a role, held so (with no scope, and per each of `scopes`). */
  held(kind: ReadKind, value: string, role: FigureRole, scopes: readonly Held[] = []): void {
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
      this.held('number', canonicalNumber(String(value)), role, scopes);
    }
  }

  /**
   * A role's values line by line (`values`, the set of each line's): each is some line's (`row`), and one is held per
   * line only where every line holds it (docs/adr/0086, PE5-2): "$100.00 per line" says each line has it, so a value
   * only some lines have is no line's value stated so.
   */
  private lines(kind: ReadKind, role: FigureRole, values: readonly ReadonlySet<string>[]): void {
    for (const value of values.flatMap((items) => [...items])) {
      this.held(kind, value, role, values.every((items) => items.has(value)) ? ['line'] : ['row']);
    }
  }

  /** Each line's amounts of a role, a list for each line: whole cents alone, as amount() holds them. */
  lineAmounts(role: FigureRole, values: readonly (readonly (string | null | undefined)[])[]): void {
    this.lines('amount', role, values.map((items) => new Set(items.filter(whole))));
  }

  /** A page a record always states. */
  page(role: FigureRole, page: number): void {
    this.held('number', canonicalNumber(String(page)), role);
  }

  /** The rows 1 to `count`. */
  rows(role: FigureRole, count: number): void {
    for (let row = 1; row <= count; row += 1) {
      this.number(role, row);
    }
  }

  /** An amount in cents, stated per its scopes, when it is whole cents (the trace writes unrounded amounts with their fraction; null is none). */
  amount(role: FigureRole, value: string | null | undefined, scopes: readonly Held[]): void {
    const text = String(value);
    if (/^-?\d+$/.test(text)) {
      this.held('amount', text, role, scopes);
    }
  }

  percent(role: FigureRole, value: string): void {
    this.held('percent', canonicalNumber(value), role);
  }

  /** A date, with its month, its day of the month and its year in the same role (null is none). */
  date(role: FigureRole, value: string | null | undefined): void {
    if (value !== null && value !== undefined) {
      this.held('date', value, role);
      this.held('month', value.slice(0, 7), role);
      this.held('month_day', value.slice(5), role);
      this.held('year', value.slice(0, 4), role);
    }
  }

  year(role: FigureRole, value: string): void {
    this.held('year', value, role);
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

/**
 * What a catalog fact is held as (docs/adr/0086): its value in its role, by what it is stated per. The pattern's totals
 * are held in total, its one value every line holds alike per line; each row's own value is some line's (`row`), and
 * each line's in a one-line pattern (the catalog's line facts, and rowFacts() for a row whose value the catalog names
 * by the pattern or a code); a count of units a line holds is held as a line's units too. The facts of the packet, its
 * citation, contract, releases and deadline are held in their roles. A code's, a claim's and interest's facts are not
 * read here: ADR 0086's reader holds a code's totals as its summary states them and interest as its section does
 * (narrativeFacts()), and no claim's sum, so a free-text figure is not held to one; once a narrative's figures are
 * tokens, those are only rendered.
 */
function catalogFacts(facts: Facts, catalog: FactCatalog, rows: number): void {
  const held = new Set<FactEntry['subject']>(['pattern', 'line', 'citation', 'contract', 'release', 'packet', 'deadline']);
  for (const entry of [...catalog.entries.filter((item) => held.has(item.subject)), ...rowFacts(catalog)]) {
    const { role, value, kind, subject } = entry;
    if (role === null) {
      continue;
    }
    if (kind === 'amount') {
      facts.amount(role, value as string, heldScopes(entry, rows));
    } else if (kind === 'units') {
      // What some line holds, or each line, is held as a line's units too.
      const scopes = heldScopes(entry, rows);
      facts.held('number', canonicalNumber(value as string), 'units', scopes);
      if (subject === 'line' || entry.scope === 'line') {
        facts.held('number', canonicalNumber(value as string), 'line_units', scopes);
      }
    } else if (kind === 'date') {
      facts.date(role, value as string);
    } else if (kind === 'date_span') {
      facts.date(role, (value as DateSpan).from);
      facts.date(role, (value as DateSpan).to);
    } else if (kind === 'percent') {
      facts.percent(role, value as string);
    } else if (kind === 'year') {
      facts.year(role, (value as number).toString());
    } else {
      // A count, a page, a version, a release, a level or a day count.
      facts.number(role, value as number);
    }
  }
}

/**
 * The scopes an amount's or units' fact is held in, as catalogFacts() says: the pattern's totals in total, its value
 * per line per line, a line's own value as some line's (each line's in a one-line pattern). The contract's rate is in
 * none here: the contract's parameters hold it per unit or per visit (parameterFigures()).
 */
function heldScopes(entry: FactEntry, rows: number): Held[] {
  if (entry.subject === 'line') {
    return [rows === 1 ? 'line' : 'row'];
  }
  return entry.scope === 'total' ? ['total'] : entry.scope === 'line' ? ['line'] : [];
}

/**
 * The facts a narrative is held to, rebuilt from the version's catalog of facts (./fact-catalog.ts), so the facts a
 * free-text figure is held to and the facts a token renders cannot drift apart: every value the catalog holds goes in
 * from its catalog entry, in its role and scope (catalogFacts()). What the catalog does not hold goes in beside it, as
 * before: the schedule's row numbers, the contract's parameters and quoted texts (their figures, codes, modifiers and
 * identifiers), the payer's and practice's names, the service dates' years where the contract locks none, codes and
 * modifiers of another shape, each line's own deadline and calculation, every contract window's day count and page (the
 * catalog holds one only where every clause states the same), prompt-pay interest's rule where no interest is stated,
 * and each interest line's dates, days and amount.
 */
export function narrativeFacts(content: PacketContent): NarrativeFacts {
  const facts = new Facts();
  const { pattern, citation, interest } = content;
  const nextLevel = content.format === 'tp-packet/2' && content.deadline.basis === 'next_level_window';

  const catalog = factCatalog(content);
  catalogFacts(facts, catalog, content.lines.length);

  facts.number('lines', content.lines.length);
  facts.rows('row', content.lines.length);

  // A contract's rate is per unit, or per visit (a line) for a per-visit rate (a regulation's method is MA_NONCONTRACTED).
  const rate: readonly Scope[] = citation.method === 'PER_VISIT' ? ['unit', 'line'] : ['unit'];
  if (citation.kind === 'contract') {
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

  // The fee schedule's year where the contract locks none: the service dates' (the schedule in effect for them).
  if (pattern.contract_years.length === 0) {
    for (const line of content.lines) {
      facts.year('schedule_year', line.service_date.slice(0, 4));
    }
  }
  facts.rows('claim_row', pattern.claims);
  facts.rows('patient_row', pattern.patients);
  // The codes and modifiers the schedule prints, of any shape (the catalog names only those of the CPT and HCPCS shape).
  for (const code of [...pattern.codes.map((summary) => summary.procedure_code), ...content.lines.map((line) => line.procedure_code)]) {
    facts.codes.add(code);
  }
  // Each code's totals, as its summary states them (a code of any shape: the catalog names only the CPT and HCPCS shape).
  for (const code of pattern.codes) {
    facts.number('lines', code.lines);
    facts.number('units', code.units, ['total']);
    facts.amount('expected', code.expected_cents, ['total']);
    facts.amount('allowed', code.observed_cents, ['total']);
    facts.amount('variance', code.variance_cents, ['total']);
  }
  for (const line of content.lines) {
    for (const modifier of line.modifiers) {
      facts.modifiers.add(modifier);
    }
  }

  if (content.format === 'tp-packet/2') {
    for (const line of content.lines) {
      if (!nextLevel) {
        facts.date('deadline', line.deadline.ends_on);
      }
    }
    // Each line's calculation, its steps and rounding: per line where every line holds it.
    facts.lineAmounts(
      'calculation',
      content.lines.map(({ calculation }) => [...calculation.steps.map((step) => step.amount_cents), calculation.rounding?.unrounded_cents, calculation.rounding?.rounded_cents]),
    );
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

/** The identifier kinds a placeholder may name (exported for the verifier). */
export const PLACEHOLDER_KINDS: ReadonlySet<string> = new Set(IDENTIFIER_KINDS);

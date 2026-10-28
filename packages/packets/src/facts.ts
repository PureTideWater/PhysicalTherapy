import { IDENTIFIER_KINDS, type PacketContent } from './format';
import { interestStated, lineInterestStated } from './interest';
import { planText } from './payer';
import { readableText } from './readable';
import { type FigureRole, type ReadKind, quotedTokens } from './roles';
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
 * Quoted texts are never an input of a role (the contract's quoted clause and title, the regulation's reference and
 * statement, the practice, payer and plan as the payer's copy prints them, the window's quoted clause and the
 * statute): each is kept as its words (`quotes`), so a figure it holds may be repeated with the words around it, as
 * it holds it, and in no other role ("Section 4", "42 CFR 422.214", "SYNTHETIC PT 12345 GROUP 77"). The procedure
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
  /** Each quoted text, as its words (./roles.ts quotedTokens()). */
  readonly quotes: readonly (readonly string[])[];
  /** The schedule's rows: a placeholder names one of 1 to rows. */
  readonly rows: number;
  /** The citation markers a sentence may use. */
  readonly markers: ReadonlySet<number>;
}

/** The roles the inputs give a value of a kind (none when no input holds it). */
export function heldRoles(facts: NarrativeFacts, kind: ReadKind, value: string): ReadonlySet<FigureRole> {
  return facts.roles.get(`${kind}:${value}`) ?? new Set();
}

type Fact = string | number | null | undefined;

class Facts {
  readonly roles = new Map<string, Set<FigureRole>>();
  businessDays = false;
  readonly codes = new Set<string>();
  readonly modifiers = new Set<string>();
  readonly identifiers = new Set<string>();
  readonly quotes: (readonly string[])[] = [];

  private add(kind: ReadKind, value: string, role: FigureRole): void {
    const key = `${kind}:${value}`;
    const roles = this.roles.get(key) ?? new Set<FigureRole>();
    roles.add(role);
    this.roles.set(key, roles);
  }

  /** A count, a page, a version, a release, a level, a day count or a row. */
  number(role: FigureRole, value: Fact): void {
    if (value !== null && value !== undefined) {
      this.add('number', canonicalNumber(String(value)), role);
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

  /** An amount in cents, when it is whole cents (the trace writes unrounded amounts with their fraction; null is none). */
  amount(role: FigureRole, value: string | null | undefined): void {
    const text = String(value);
    if (/^-?\d+$/.test(text)) {
      this.add('amount', text, role);
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

  year(role: FigureRole, value: number): void {
    this.add('year', String(value), role);
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
    this.quotes.push(quotedTokens(readable));
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

/** Every amount a parameters object holds under a key ending in _cents, and every percentage under percent or percentage. */
function parameterFigures(value: unknown, facts: Facts): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      parameterFigures(item, facts);
    }
    return;
  }
  if (typeof value !== 'object' || value === null) {
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'string' && key.endsWith('_cents')) {
      // An amount only when it is whole cents (amount()); any other text under the key is no input.
      facts.amount('expected', item);
    } else if (typeof item === 'string' && (key === 'percent' || key === 'percentage') && /^\d+(\.\d+)?$/.test(item)) {
      facts.percent('contract_percent', item);
    } else {
      parameterFigures(item, facts);
    }
  }
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

  if (citation.kind === 'contract') {
    facts.number('version', citation.version_no);
    facts.page('citation_page', citation.page);
    facts.date('effective_date', citation.effective_from);
    facts.date('effective_date', citation.effective_to);
    parameterFigures(citation.parameters, facts);
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
  for (const year of pattern.contract_years) {
    facts.year('schedule_year', year);
  }
  facts.number('lines', pattern.lines);
  facts.number('claims', pattern.claims);
  facts.number('patients', pattern.patients);
  facts.number('units', pattern.units);
  facts.rows('claim_row', pattern.claims);
  facts.rows('patient_row', pattern.patients);
  facts.amount('expected', pattern.expected_cents);
  facts.amount('allowed', pattern.observed_cents);
  facts.amount('variance', pattern.variance_cents);
  facts.date('service_date', pattern.first_service_date);
  facts.date('service_date', pattern.last_service_date);
  for (const code of pattern.codes) {
    facts.codes.add(code.procedure_code);
    facts.number('lines', code.lines);
    facts.number('units', code.units);
    facts.amount('expected', code.expected_cents);
    facts.amount('expected', code.contract_amount_cents);
    facts.amount('allowed', code.observed_cents);
    facts.amount('variance', code.variance_cents);
  }

  for (const line of content.lines) {
    facts.codes.add(line.procedure_code);
    for (const modifier of line.modifiers) {
      facts.modifiers.add(modifier);
    }
    facts.number('units', line.units);
    facts.number('line_units', line.units);
    facts.amount('expected', line.expected_cents);
    facts.amount('allowed', line.observed_cents);
    facts.amount('variance', line.variance_cents);
    facts.amount('paid', line.paid_cents);
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
        facts.amount('calculation', step.amount_cents);
      }
      facts.amount('calculation', calculation.rounding?.unrounded_cents);
      facts.amount('calculation', calculation.rounding?.rounded_cents);
      facts.amount('patient_share', calculation.patient_share_cents);
    }
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
      facts.amount('interest', interest.total_cents);
    }
    for (const line of interest.lines) {
      facts.date('received_date', line.received_on);
      facts.date('paid_date', line.paid_on);
      if (lineInterestStated(line)) {
        facts.date('due_date', line.due_on);
        facts.number('days_late', line.days_late);
        facts.number('days_late', line.days_unpaid);
        facts.amount('interest', line.interest_cents);
      }
    }
  }

  return {
    roles: facts.roles,
    businessDays: facts.businessDays,
    codes: facts.codes,
    modifiers: facts.modifiers,
    identifiers: facts.identifiers,
    quotes: facts.quotes,
    rows: content.lines.length,
    markers: new Set(content.sources.map((source) => source.marker)),
  };
}

/** The identifier kinds a placeholder may name (exported for the verifier). */
export const PLACEHOLDER_KINDS: ReadonlySet<string> = new Set(IDENTIFIER_KINDS);

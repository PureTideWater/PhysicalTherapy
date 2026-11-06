/**
 * The words a packet narrative's fact renders as (design lane-b-packet-figure-placeholders, sections 1 and 5): what each
 * measure of the catalog is (its kind, its role and its scope) and each fact's phrase, a complete noun phrase with its
 * value slots. Code fills every slot from the version's content (./render.ts): the payer reads what each figure is and
 * what lines it covers from code, never from prose. Data alone: the tables are part of the words version
 * (../words-version.ts), so a change to a phrase moves WORDS_VERSION and every guard that holds it. Pure and
 * browser-safe.
 *
 * A phrase's slots:
 * - `<amount>`: whole cents as US dollars, in code (@tp/money formatUsdPlain);
 * - `<lines>`, `<claims>`, `<patients>`, `<days>`: a count, its digits grouped by thousands, and its noun, singular for
 *   one ("1 line", "3 lines");
 * - `<units>`: a count of units as its exact decimal, never truncated, and its noun ("4.5 units", "1 unit");
 * - `<number>`: a page, a version, a rule release, a dispute level or a year, in its digits as the schedule prints it;
 * - `<date>`, `<from>`, `<to>`: ISO calendar dates as the schedule prints them;
 * - `<percent>`: a percentage as the content writes it;
 * - `<text>`: the reference or the quoted clause as the content holds it;
 * - `<code>`: the procedure code as the content writes it (never the id's lowercase form), set as a code;
 * - `<modifiers>`: "modifier 59" or "modifiers GP and KX", each as the content writes it;
 * - `<row>`, `<rows>`: schedule rows, as row labels ("line 3", "lines 1, 2 and 4");
 * - `<claim>`: the claim's control number as an identifier placeholder of its first row, filled only at export.
 *
 * No phrase holds a digit outside a slot (a test holds that), so no figure can hide in the words.
 *
 * Built on each call (factWords()) rather than once when the module loads, as the role reader's words are
 * (./roles-words/index.ts), so that each mutant of a word is tried against the tests that read it (docs/adr/0066,
 * Part 4: a value a module builds when it loads is a static mutant every test runs again). The types are written out.
 */

import type { FigureRole } from './roles-reader/kinds';

/** The kinds of value a fact holds. */
export type FactKind = 'amount' | 'count' | 'units' | 'percent' | 'date' | 'date_span' | 'page' | 'version' | 'release' | 'year' | 'days' | 'code' | 'modifiers' | 'level' | 'quote' | 'reference';

/** What a fact is stated per: one unit, one visit, each line, the lines in total, or a part of the lines (its set named). */
export type FactScope = 'unit' | 'visit' | 'line' | 'total' | 'part';

/** The subjects of an id (`<subject>.<measure>`), in the precedence that names a set of lines (pattern first). */
export type FactSubject = 'pattern' | 'code' | 'claim' | 'line' | 'lines' | 'citation' | 'contract' | 'release' | 'packet' | 'deadline' | 'interest';

/**
 * The measures over a set of schedule lines, which every row-set subject may hold: each names one set of lines by
 * exactly one id (./fact-catalog.ts canonicalFactId). `lines` (the count) is held by the pattern, a code and a claim;
 * an explicit list of rows needs no count of itself.
 */
export type SetMeasure = 'lines' | 'units' | 'expected' | 'allowed' | 'paid' | 'variance' | 'patient_share' | 'service_dates';

/** The amounts and units whose one value every line holding it alike is a fact of its own (`pattern.<measure>_each`). */
export type EachMeasure = 'units' | 'expected' | 'allowed' | 'paid' | 'variance' | 'patient_share';

/** The measures of the row-bound subjects (the pattern, a code, a claim, a line, a set of rows). */
export type LineMeasure = 'lines' | 'claims' | 'patients' | 'units' | 'expected' | 'allowed' | 'paid' | 'variance' | 'patient_share' | 'service_dates' | 'service_date' | 'paid_on' | 'received_on' | 'window_ends_on' | 'code' | 'modifiers';

/** The facts' words, built anew on each call. */
export function factWords() {
  const kinds: readonly FactKind[] = ['amount', 'count', 'units', 'percent', 'date', 'date_span', 'page', 'version', 'release', 'year', 'days', 'code', 'modifiers', 'level', 'quote', 'reference'];
  const scopes: readonly FactScope[] = ['unit', 'visit', 'line', 'total', 'part'];
  const subjects: readonly FactSubject[] = ['pattern', 'code', 'claim', 'line', 'lines', 'citation', 'contract', 'release', 'packet', 'deadline', 'interest'];
  /** The subjects a model may use (section 2.2): no row-bound subject, so no model choice names a row or a claim. */
  const modelSubjects: readonly FactSubject[] = ['pattern', 'code', 'citation', 'contract', 'release', 'packet', 'deadline', 'interest'];
  const setMeasures: readonly SetMeasure[] = ['lines', 'units', 'expected', 'allowed', 'paid', 'variance', 'patient_share', 'service_dates'];
  const eachMeasures: readonly EachMeasure[] = ['units', 'expected', 'allowed', 'paid', 'variance', 'patient_share'];
  /** Each measure of the row-bound subjects, with its kind and role (FIGURE_ROLES; null where no role is read: codes and modifiers). */
  const lineMeasures = {
    lines: { kind: 'count', role: 'lines' },
    claims: { kind: 'count', role: 'claims' },
    patients: { kind: 'count', role: 'patients' },
    units: { kind: 'units', role: 'units' },
    expected: { kind: 'amount', role: 'expected' },
    allowed: { kind: 'amount', role: 'allowed' },
    paid: { kind: 'amount', role: 'paid' },
    variance: { kind: 'amount', role: 'variance' },
    patient_share: { kind: 'amount', role: 'patient_share' },
    service_dates: { kind: 'date_span', role: 'service_date' },
    service_date: { kind: 'date', role: 'service_date' },
    paid_on: { kind: 'date', role: 'paid_date' },
    received_on: { kind: 'date', role: 'received_date' },
    window_ends_on: { kind: 'date', role: 'deadline' },
    code: { kind: 'code', role: null },
    modifiers: { kind: 'modifiers', role: null },
  } as const satisfies Readonly<Record<LineMeasure, { readonly kind: FactKind; readonly role: FigureRole | null }>>;
  /**
   * Each fact of the other subjects, by its id's stem (an indexed fact's id adds `.<n>`: `contract.percent.1`), with
   * its kind, its role and its scope (`contract.rate`'s is the unit, or the visit for a per-visit rate).
   */
  const otherFacts = {
    'citation.version': { kind: 'version', role: 'version', scope: null },
    'citation.page': { kind: 'page', role: 'citation_page', scope: null },
    'citation.effective': { kind: 'date_span', role: 'effective_date', scope: null },
    'citation.reference': { kind: 'reference', role: null, scope: null },
    'citation.quote': { kind: 'quote', role: null, scope: null },
    'contract.rate': { kind: 'amount', role: 'expected', scope: 'unit' },
    'contract.percent': { kind: 'percent', role: 'contract_percent', scope: null },
    'contract.year': { kind: 'year', role: 'schedule_year', scope: null },
    'release.no': { kind: 'release', role: 'release', scope: null },
    'packet.as_of': { kind: 'date', role: 'as_of_date', scope: null },
    'packet.level': { kind: 'level', role: 'level', scope: null },
    'deadline.ends_on': { kind: 'date', role: 'deadline', scope: null },
    'deadline.window_days': { kind: 'days', role: 'window_days', scope: null },
    'deadline.window_page': { kind: 'page', role: 'window_page', scope: null },
    'interest.total': { kind: 'amount', role: 'interest', scope: 'total' },
    'interest.rate': { kind: 'percent', role: 'interest_rate', scope: null },
    'interest.days_to_pay': { kind: 'days', role: 'days_to_pay', scope: null },
    'interest.release': { kind: 'release', role: 'release', scope: null },
  } as const satisfies Readonly<Record<string, { readonly kind: FactKind; readonly role: FigureRole | null; readonly scope: FactScope | null }>>;
  /** Each fact's phrase, by its phrase key (./fact-catalog.ts FactEntry.phrase). */
  const phrases = {
    // The pattern: all the lines.
    'pattern.lines': 'the <lines> of the schedule',
    'pattern.claims': 'the <claims> of the schedule',
    'pattern.patients': 'the <patients> of the schedule',
    'pattern.units': '<units> in total for the <lines>',
    'pattern.expected': 'the contract amount of <amount> in total for the <lines>',
    'pattern.allowed': 'the allowed amount of <amount> in total for the <lines>',
    'pattern.paid': 'payment of <amount> in total for the <lines>',
    'pattern.variance': 'a shortfall of <amount> in total for the <lines>',
    'pattern.patient_share': 'the patient share of <amount> in total for the <lines>',
    'pattern.service_dates': 'service dates from <from> to <to>',
    'pattern.service_dates.one': 'the service date <date>',
    'pattern.units_each': '<units> per line on each of the <lines>',
    'pattern.expected_each': 'the contract amount of <amount> per line on each of the <lines>',
    'pattern.allowed_each': 'the allowed amount of <amount> per line on each of the <lines>',
    'pattern.paid_each': 'payment of <amount> per line on each of the <lines>',
    'pattern.variance_each': 'a shortfall of <amount> per line on each of the <lines>',
    'pattern.patient_share_each': 'the patient share of <amount> per line on each of the <lines>',
    // A code: its lines.
    'code.code': '<code>',
    'code.modifiers': '<modifiers>',
    'code.lines': 'the <lines> of <code>',
    'code.units': '<units> in total for the <lines> of <code>',
    'code.expected': 'the contract amount of <amount> in total for the <lines> of <code>',
    'code.allowed': 'the allowed amount of <amount> in total for the <lines> of <code>',
    'code.paid': 'payment of <amount> in total for the <lines> of <code>',
    'code.variance': 'a shortfall of <amount> in total for the <lines> of <code>',
    'code.patient_share': 'the patient share of <amount> in total for the <lines> of <code>',
    'code.service_dates': 'service dates from <from> to <to> for the <lines> of <code>',
    'code.service_dates.one': 'the service date <date> for the <lines> of <code>',
    // A claim: its lines, named by its first row's claim control number.
    'claim.lines': 'the <lines> of claim <claim>',
    'claim.units': '<units> in total for the <lines> of claim <claim>',
    'claim.expected': 'the contract amount of <amount> in total for the <lines> of claim <claim>',
    'claim.allowed': 'the allowed amount of <amount> in total for the <lines> of claim <claim>',
    'claim.paid': 'payment of <amount> in total for the <lines> of claim <claim>',
    'claim.variance': 'a shortfall of <amount> in total for the <lines> of claim <claim>',
    'claim.patient_share': 'the patient share of <amount> in total for the <lines> of claim <claim>',
    'claim.service_dates': 'service dates from <from> to <to> for the <lines> of claim <claim>',
    'claim.service_dates.one': 'the service date <date> for the <lines> of claim <claim>',
    // A line: one row of the schedule.
    'line.units': '<units> for line <row>',
    'line.expected': 'the contract amount of <amount> for line <row>',
    'line.allowed': 'the allowed amount of <amount> for line <row>',
    'line.paid': 'payment of <amount> for line <row>',
    'line.variance': 'a shortfall of <amount> for line <row>',
    'line.patient_share': 'the patient share of <amount> for line <row>',
    'line.service_date': 'the service date <date> of line <row>',
    'line.paid_on': 'the payment date <date> of line <row>',
    'line.received_on': 'the date <date> the payer received the claim of line <row>',
    'line.window_ends_on': 'the dispute window ending <date> for line <row>',
    'line.code': '<code>',
    'line.modifiers': '<modifiers>',
    // An explicit set of rows.
    'lines.units': '<units> in total for lines <rows>',
    'lines.expected': 'the contract amount of <amount> in total for lines <rows>',
    'lines.allowed': 'the allowed amount of <amount> in total for lines <rows>',
    'lines.paid': 'payment of <amount> in total for lines <rows>',
    'lines.variance': 'a shortfall of <amount> in total for lines <rows>',
    'lines.patient_share': 'the patient share of <amount> in total for lines <rows>',
    'lines.service_dates': 'service dates from <from> to <to> for lines <rows>',
    'lines.service_dates.one': 'the service date <date> for lines <rows>',
    // The contract or the regulation.
    'citation.version': 'version <number> of the contract',
    'citation.page': 'page <number> of the contract',
    'citation.effective': 'the contract version in effect from <from> to <to>',
    'citation.effective.open': 'the contract version in effect from <date>',
    'citation.reference': '<text>',
    'citation.quote': '“<text>”',
    'contract.rate.FIXED_SCHEDULE': 'the contract’s fee-schedule amount of <amount> per unit',
    'contract.rate.PER_VISIT': 'the contract’s amount of <amount> per visit',
    'contract.rate.LESSER_OF': 'the contract’s fee-schedule amount of <amount> per unit, the schedule side of the contract’s lesser-of rule',
    'contract.percent': 'the contract’s percentage of <percent> percent',
    'contract.year': 'the contract’s fee-schedule year <number>',
    'release.no': 'rule release <number>',
    // The packet and its deadline.
    'packet.as_of': 'the packet date <date>',
    'packet.level': 'dispute level <number>',
    'deadline.ends_on': 'the dispute deadline <date>',
    'deadline.window_days': 'the contract’s dispute window of <days>',
    'deadline.window_page': 'page <number> of the contract’s dispute window clause',
    // Prompt-pay interest, where it is stated.
    'interest.total': 'prompt-pay interest of <amount> in total for the <lines> it is stated on',
    'interest.rate': 'the prompt-pay interest rate of <percent> percent a year',
    'interest.days_to_pay': 'the prompt-pay rule’s <days> to pay',
    'interest.release': 'the prompt-pay rule of rule release <number>',
  } as const;
  /** The nouns a count's slot prints after it: singular for one, plural otherwise. */
  const nouns = {
    lines: ['line', 'lines'],
    claims: ['claim', 'claims'],
    patients: ['patient', 'patients'],
    units: ['unit', 'units'],
    days: ['day', 'days'],
    modifiers: ['modifier', 'modifiers'],
  } as const;
  return { kinds, scopes, subjects, modelSubjects, setMeasures, eachMeasures, lineMeasures, otherFacts, phrases, nouns } as const;
}

export type FactWords = ReturnType<typeof factWords>;
export type FactPhraseKey = keyof FactWords['phrases'];
export type OtherFact = keyof FactWords['otherFacts'];

import type { FigureRole } from './roles';

/**
 * The role reader's words (./roles.ts; docs/adr/0086): the labels before a number and the nouns after it, the words
 * that make a number a year or keep it some other count, and the cues that name which day count, page, amount,
 * percentage or date a figure is. Each list is the reader's whole vocabulary of its kind: a word left out reads no
 * role, so each is named in ./roles.test.ts.
 *
 * Built on each read rather than once when the module loads, so that each mutant of a word is tried against the tests
 * that read it (docs/adr/0066, Part 4: a value a module builds when it loads is a static mutant every test runs again).
 * Its own shard (stryker/shards.json, packets-words) keeps the reader's shard within its time.
 */

/** A cue: its words in order, and the roles it names. */
export type Cues = readonly (readonly [string, readonly FigureRole[]])[];

/** The reader's words, built anew on each call. */
export function vocabulary() {
  /** Words written with a period that does not end a clause ("pp. 4", "no. 2"); a single letter's never does ("p. 4", "G.S. 58"). */
  const ABBREVIATED = new Set(['pp', 'no', 'nos', 'vol', 'sec', 'art', 'para', 'ch', 'st', 'cf', 'vs', 'inc', 'co', 'corp', 'ltd', 'llc']);
  /** Letters, with an apostrophe inside a word, and the multiplication sign ("97110 × 2"). */
  const WORD = /[\p{L}×]+(?:['’][\p{L}]+)*/gu;
  /** A clause's edge: a sentence's end, a semicolon, a colon or a comma, and a blank line. */
  const EDGES = /[.!?;:,]|\n[ \t]*\n/g;


  /** Labels before a number, each with the role it gives. Pages take theirs from the words around (pageRoles). */
  const LABELS: ReadonlyMap<string, readonly FigureRole[] | 'page'> = new Map<string, readonly FigureRole[] | 'page'>([
    ['page', 'page'],
    ['pages', 'page'],
    ['p', 'page'],
    ['pp', 'page'],
    ['version', ['version']],
    ['v', ['version']],
    ['release', ['release']],
    ['releases', ['release']],
    ['level', ['level']],
    ['levels', ['level']],
    ['appeal', ['level']],
    ['tier', ['level']],
    ['x', ['line_units']],
    ['×', ['line_units']],
  ]);
  /** Words between a label and its number: "release no. 900001", "page number 4". */
  const LABEL_FILLERS = new Set(['no', 'number', 'nos']);
  /** A row's noun before its number: "line 2", "claims 1 through 3". */
  const ROW_LABELS: ReadonlyMap<string, FigureRole> = new Map<string, FigureRole>([
    ['line', 'row'],
    ['lines', 'row'],
    ['row', 'row'],
    ['rows', 'row'],
    ['claim', 'claim_row'],
    ['claims', 'claim_row'],
    ['patient', 'patient_row'],
    ['patients', 'patient_row'],
  ]);
  /** A count's noun, each with the counts it may be (units are each line's when "each line" is beside them). */
  const COUNT_NOUNS: ReadonlyMap<string, readonly FigureRole[]> = new Map<string, readonly FigureRole[]>([
    ['line', ['lines']],
    ['lines', ['lines']],
    ['row', ['lines']],
    ['rows', ['lines']],
    ['service', ['lines']],
    ['services', ['lines']],
    ['procedure', ['lines']],
    ['procedures', ['lines']],
    ['claim', ['claims']],
    ['claims', ['claims']],
    ['patient', ['patients']],
    ['patients', ['patients']],
    ['member', ['patients']],
    ['members', ['patients']],
    ['unit', ['units']],
    ['units', ['units']],
    ['visit', ['lines', 'claims']],
    ['visits', ['lines', 'claims']],
    ['encounter', ['lines', 'claims']],
    ['encounters', ['lines', 'claims']],
  ]);
  /** A singular noun after an ordinal, and the row it names: "the second line", "the third claim". */
  const ORDINAL_NOUNS: ReadonlyMap<string, FigureRole> = new Map<string, FigureRole>([
    ['line', 'row'],
    ['row', 'row'],
    ['service', 'row'],
    ['procedure', 'row'],
    ['visit', 'row'],
    ['claim', 'claim_row'],
    ['encounter', 'claim_row'],
    ['patient', 'patient_row'],
    ['member', 'patient_row'],
  ]);
  /** Words between a count and its noun that make it some other count of the thing ("4 more lines", "6 per line"). */
  const NOT_THE_COUNT = new Set([
    'more',
    'fewer',
    'less',
    'other',
    'additional',
    'extra',
    'further',
    'remaining',
    'of',
    'per',
    'in',
    'on',
    'for',
    'to',
    'and',
    'or',
    'a',
    'an',
    'the',
    'each',
    'every',
    'than',
    'from',
    'at',
    'by',
    'with',
  ]);
  /** Words before a five-digit figure before a noun that make the figure the noun's procedure code ("the 97110 lines"). */
  const CODE_MODIFIER_LEADS = new Set(['the', 'these', 'those', 'each', 'every', 'all', 'its', 'their', 'for', 'on', 'in', 'with', 'any', 'both', 'a', 'an', 'per', 'other', 'some', 'by', 'from', 'under', 'to', 'and', 'or']);
  /** Determiners in a partitive: "2 of the 3 claims". */
  const PARTITIVE_DETERMINERS = new Set(['the', 'these', 'those', 'its', 'their', 'all', 'our']);
  /** Words that join a list: "pages 1 and 2", "lines 1 to 3". */
  const LIST_JOINERS = new Set(['and', 'or', 'to', 'through', 'thru', 'plus', ',']);
  /** Words before a year: "in 2026", "Medicare's 2026", "its 2026 contract", "CY 2026", "plan year 2026". */
  const YEAR_LEADS = new Set(['in', 'during', 'since', 'until', 'through', 'thru', 'for', 'from', 'before', 'after', 'between', 'year', 'years', 'cy', 'fy', 'its', 'this', 'that', 'these', 'those', 'their', 'our', 'each', 'every']);
  /** A year's noun after it: "2026 rates", "the 2026 Medicare fee schedule", "the 2026 contract". */
  const YEAR_NOUNS = new Set([
    'medicare',
    'mpfs',
    'pfs',
    'fee',
    'fees',
    'schedule',
    'schedules',
    'rate',
    'rates',
    'contract',
    'contracts',
    'agreement',
    'agreements',
    'amendment',
    'plan',
    'calendar',
    'fiscal',
    'conversion',
    'locality',
    'rvu',
    'rvus',
    'gpci',
    'gpcis',
    'dates',
    'remittances',
    'payments',
    'disputes',
  ]);
  /** Words that name each line: "each line", "per line", "a visit". */
  const EACH = new Set(['each', 'every', 'per', 'a']);
  const ONE_LINE = new Set(['line', 'visit', 'row', 'service']);


  /** The day counts' cues (any of them, between the figures and edges around the count). */
  const DAY_CUES: Cues = [
    ['within', ['window_days']],
    ['window', ['window_days']],
    ['dispute', ['window_days']],
    ['disputes', ['window_days']],
    ['disputed', ['window_days']],
    ['appeal', ['window_days']],
    ['appeals', ['window_days']],
    ['appealed', ['window_days']],
    ['file', ['window_days']],
    ['filed', ['window_days']],
    ['filing', ['window_days']],
    ['raise', ['window_days']],
    ['raised', ['window_days']],
    ['submit', ['window_days']],
    ['submitted', ['window_days']],
    ['deadline', ['window_days']],
    ['respond', ['window_days']],
    ['timely', ['window_days']],
    ['reconsideration', ['window_days']],
    ['redetermination', ['window_days']],
    ['to pay', ['days_to_pay']],
    ['pay within', ['days_to_pay']],
    ['prompt pay', ['days_to_pay']],
    ['clean', ['days_to_pay']],
    ['late', ['days_late']],
    ['overdue', ['days_late']],
    ['past due', ['days_late']],
    ['unpaid', ['days_late']],
    ['accrue', ['days_late']],
    ['accrues', ['days_late']],
    ['accrued', ['days_late']],
    ['accruing', ['days_late']],
    ['interest', ['days_late']],
    ['between', ['days_late']],
    ['elapsed', ['days_late']],
    ['delay', ['days_late']],
    ['delayed', ['days_late']],
  ];
  /** The pages' cues: the dispute window's page or the contract clause's. */
  const PAGE_CUES: Cues = [
    ['window', ['window_page']],
    ['dispute', ['window_page']],
    ['disputes', ['window_page']],
    ['appeal', ['window_page']],
    ['appeals', ['window_page']],
    ['deadline', ['window_page']],
    ['timely', ['window_page']],
    ['clause', ['citation_page']],
    ['rate', ['citation_page']],
    ['rates', ['citation_page']],
    ['schedule', ['citation_page']],
    ['cited', ['citation_page']],
    ['citation', ['citation_page']],
    ['quote', ['citation_page']],
    ['quoted', ['citation_page']],
    ['section', ['citation_page']],
    ['amount', ['citation_page']],
    ['method', ['citation_page']],
    ['pays', ['citation_page']],
  ];
  /** The amounts' cues (the gateway's of docs/adr/0054, with allowed and paid apart). */
  const AMOUNT_CUES: Cues = [
    ['expected', ['expected']],
    ['expects', ['expected']],
    ['expect', ['expected']],
    ['requires', ['expected']],
    ['required', ['expected']],
    ['require', ['expected']],
    ['requirement', ['expected']],
    ['comes to', ['expected']],
    ['come to', ['expected']],
    ['came to', ['expected']],
    ['would have paid', ['expected']],
    ['should have paid', ['expected']],
    ['would have been paid', ['expected']],
    ['should have been paid', ['expected']],
    ['would pay', ['expected']],
    ['should pay', ['expected']],
    ['should have allowed', ['expected']],
    ['would have allowed', ['expected']],
    ['would have', ['expected']],
    ['should allow', ['expected']],
    ['contract', ['expected']],
    ['contracted', ['expected']],
    ['case rate', ['expected']],
    ['rate', ['expected']],
    ['original medicare', ['expected']],
    ['fee schedule', ['expected']],
    ['allowed', ['allowed']],
    ['allows', ['allowed']],
    ['allowable', ['allowed']],
    ['allowance', ['allowed']],
    ['lesser', ['expected']],
    ['paid', ['paid']],
    ['payment', ['paid']],
    ['remitted', ['paid']],
    ['reimbursed', ['paid']],
    ['received', ['paid']],
    ['shows', ['allowed', 'paid']],
    ['showed', ['allowed', 'paid']],
    ['show', ['allowed', 'paid']],
    ['remittance', ['allowed', 'paid']],
    ['remittances', ['allowed', 'paid']],
    ['shortfall', ['variance']],
    ['short', ['variance']],
    ['underpaid', ['variance']],
    ['underpayment', ['variance']],
    ['underpaying', ['variance']],
    ['difference', ['variance']],
    ['owes', ['variance']],
    ['owed', ['variance']],
    ['owe', ['variance']],
    ['owing', ['variance']],
    ['delta', ['variance']],
    ['variance', ['variance']],
    ['interest', ['interest']],
    ['patient share', ['patient_share']],
    ['patient owes', ['patient_share']],
    ['patient owed', ['patient_share']],
    ['patient responsibility', ['patient_share']],
    ['coinsurance', ['patient_share']],
    ['copay', ['patient_share']],
    ['copayment', ['patient_share']],
    ['deductible', ['patient_share']],
  ];
  /** The percentages' cues: the contract's percentage or the interest rate. */
  const PERCENT_CUES: Cues = [
    ['contract', ['contract_percent']],
    ['contracted', ['contract_percent']],
    ['agreement', ['contract_percent']],
    ['medicare', ['contract_percent']],
    ['fee schedule', ['contract_percent']],
    ['billed', ['contract_percent']],
    ['charges', ['contract_percent']],
    ['interest', ['interest_rate']],
    ['annual', ['interest_rate']],
    ['annually', ['interest_rate']],
    ['yearly', ['interest_rate']],
    ['per annum', ['interest_rate']],
    ['a year', ['interest_rate']],
    ['per year', ['interest_rate']],
  ];
  /** The dates' cues; "due" names a due date or a deadline. */
  const DATE_CUES: Cues = [
    ['service', ['service_date']],
    ['services', ['service_date']],
    ['serviced', ['service_date']],
    ['rendered', ['service_date']],
    ['treated', ['service_date']],
    ['treatment', ['service_date']],
    ['visit', ['service_date']],
    ['visits', ['service_date']],
    ['billed', ['service_date']],
    ['paid', ['paid_date']],
    ['pays', ['paid_date']],
    ['pay', ['paid_date']],
    ['payment', ['paid_date']],
    ['payments', ['paid_date']],
    ['remitted', ['paid_date']],
    ['remittance', ['paid_date']],
    ['remittances', ['paid_date']],
    ['processed', ['paid_date']],
    ['adjudicated', ['paid_date']],
    ['received', ['received_date']],
    ['receipt', ['received_date']],
    ['due', ['due_date', 'deadline']],
    ['prompt pay', ['due_date']],
    ['deadline', ['deadline']],
    ['until', ['deadline']],
    ['no later than', ['deadline']],
    ['window', ['deadline']],
    ['ends', ['deadline']],
    ['end', ['deadline']],
    ['ending', ['deadline']],
    ['expires', ['deadline']],
    ['closes', ['deadline']],
    ['dispute', ['deadline']],
    ['appeal', ['deadline']],
    ['respond', ['deadline']],
    ['effective', ['effective_date']],
    ['effect', ['effective_date']],
    ['as of', ['as_of_date']],
    ['assembled', ['as_of_date']],
    ['prepared', ['as_of_date']],
  ];

  /** Words that carry no meaning of their own: a quoted figure is never held by one of them alone. */
  const FUNCTION_WORDS = new Set([
    ...NOT_THE_COUNT,
    'is',
    'are',
    'was',
    'were',
    'be',
    'been',
    'it',
    'its',
    'this',
    'that',
    'these',
    'those',
    'them',
    'they',
    'their',
    'any',
    'all',
    'no',
    'not',
    'so',
    'if',
    'as',
    'into',
    'up',
    'out',
    'about',
    'after',
    'before',
    'such',
    'within',
    'under',
    'over',
  ]);


  const ORDINAL_WORDS = new Set([
    'first',
    'second',
    'third',
    'fourth',
    'fifth',
    'sixth',
    'seventh',
    'eighth',
    'ninth',
    'tenth',
    'eleventh',
    'twelfth',
    'thirteenth',
    'fourteenth',
    'fifteenth',
    'sixteenth',
    'seventeenth',
    'eighteenth',
    'nineteenth',
    'twentieth',
    'thirtieth',
    'fortieth',
    'fiftieth',
    'sixtieth',
    'seventieth',
    'eightieth',
    'ninetieth',
    'hundredth',
    'thousandth',
    'millionth',
  ]);
  /** The kinds of day between a count and "days": "3650 calendar days", "10 business days". */
  const DAY_BASES = new Set(['calendar', 'business', 'working']);
  /** Words after a number that make it a dispute level: "a second-level appeal", "2 appeals". */
  const LEVEL_WORDS = new Set(['level', 'levels', 'appeal', 'appeals']);
  return { DAY_BASES, LEVEL_WORDS, ABBREVIATED, WORD, EDGES, LABELS, LABEL_FILLERS, ROW_LABELS, COUNT_NOUNS, ORDINAL_NOUNS, NOT_THE_COUNT, CODE_MODIFIER_LEADS, PARTITIVE_DETERMINERS, LIST_JOINERS, YEAR_LEADS, YEAR_NOUNS, EACH, ONE_LINE, DAY_CUES, PAGE_CUES, AMOUNT_CUES, PERCENT_CUES, DATE_CUES, FUNCTION_WORDS, ORDINAL_WORDS } as const;
}

export type Vocabulary = ReturnType<typeof vocabulary>;

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
  /** Labels that are verbs too ("We appeal 3 claims"): a count's noun right after the number beats them. */
  const VERB_LABELS = new Set(['appeal', 'appeals']);
  /** Plural labels: a list after one keeps its role across a comma alone ("pages 1, 2", "rows 1, 2 and 3"). */
  const PLURAL_LABELS = new Set(['pages', 'pp', 'releases', 'levels', 'versions', 'lines', 'rows', 'claims', 'patients']);
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
  /** Determiners before an ordinal that make it prose before a noun that is no row's ("the sixth unit", "a second appeal"). */
  const ORDINAL_DETERMINERS = new Set(['the', 'a', 'an', 'this', 'that', 'its', 'their', 'our', 'his', 'her', 'each', 'every']);
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
  /** Pronouns in a partitive with no noun, "2 of them": a part of the lines, the claims or the patients. */
  const PARTITIVE_PRONOUNS = new Set(['them', 'these', 'those', 'which']);
  /** Words that join a list: "pages 1 and 2", "lines 1 to 3", "lines 1–3" (a dash between two numbers is read as "–"). */
  const LIST_JOINERS = new Set(['and', 'or', 'to', 'through', 'thru', 'plus', ',', '–']);
  /** Conjunctions: the words after a figure stop at one, which opens the next figure's clause ("$300.00 and the remittances show $210.00"). */
  const CONJUNCTIONS = new Set(['and', 'but', 'or', 'while', 'whereas', 'yet']);
  /** Words that join a list across a comma: "rows 1, 2 and 3". */
  const LIST_CONTINUERS = new Set([',', 'and', 'or', 'to', 'through', 'thru', '–']);
  /** Words before a year: "in 2026", "Medicare's 2026", "its 2026 contract", "CY 2026", "plan year 2026". */
  const YEAR_LEADS = new Set(['in', 'during', 'since', 'until', 'through', 'thru', 'for', 'from', 'before', 'after', 'between', 'year', 'years', 'cy', 'fy', 'its', 'this', 'that', 'these', 'those', 'their', 'our', 'each', 'every']);
  /** A fee schedule's noun after a year: the year is the fee schedule's ("the 2025 Medicare fee schedule", "2026 rates"). */
  const SCHEDULE_NOUNS = new Set(['medicare', 'mpfs', 'pfs', 'fee', 'fees', 'schedule', 'schedules', 'rate', 'rates', 'conversion', 'locality', 'rvu', 'rvus', 'gpci', 'gpcis']);
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
  /** The lines after "each of": "on each of the 3 lines". */
  const LINES = new Set(['line', 'lines', 'visit', 'visits', 'row', 'rows', 'service', 'services']);
  /** A unit after "each", "per" or "a": an amount per unit ("$50.00 per unit", "at $50.00 a unit"). */
  const ONE_UNIT = new Set(['unit']);
  /** Words that state an amount or a count of units for the lines in total: "in all", "in total", "altogether", "across the 3 lines". */
  const TOTAL_WORDS: Cues = [
    ['in all', []],
    ['in total', []],
    ['all told', []],
    ['total', []],
    ['totals', []],
    ['totaling', []],
    ['totalling', []],
    ['totaled', []],
    ['totalled', []],
    ['altogether', []],
    ['combined', []],
    ['overall', []],
    ['aggregate', []],
    ['across', []],
  ];
  /** Rows' nouns in the plural: a sentence about them that says nothing of each states totals ("the 3 lines billed 6 units"). */
  const PLURAL_ROWS = new Set(['lines', 'claims', 'services', 'visits', 'rows', 'encounters', 'procedures']);
  /** Words before a plural row's noun after a figure that make the figure the rows' total: "$300.00 for these 3 lines". */
  const TOTAL_FOR = new Set(['for', 'across', 'over']);


  /** The day counts' cues: the one right after "days", else the nearest before the count since the figure before it. */
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
    ['pays within', ['days_to_pay']],
    ['paid within', ['days_to_pay']],
    ['payment within', ['days_to_pay']],
    ['must pay', ['days_to_pay']],
    ['requires payment', ['days_to_pay']],
    ['require payment', ['days_to_pay']],
    ['required payment', ['days_to_pay']],
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
  /**
   * The pages' cues: the dispute window's page or the contract clause's. A clause, a quote, a section or what is cited
   * may be either, so those name both, and a word that names one of them says which ("the dispute window clause").
   */
  const PAGE_CUES: Cues = [
    ['window', ['window_page']],
    ['dispute', ['window_page']],
    ['disputes', ['window_page']],
    ['appeal', ['window_page']],
    ['appeals', ['window_page']],
    ['deadline', ['window_page']],
    ['timely', ['window_page']],
    ['clause', ['citation_page', 'window_page']],
    ['cited', ['citation_page', 'window_page']],
    ['quote', ['citation_page', 'window_page']],
    ['quoted', ['citation_page', 'window_page']],
    ['section', ['citation_page', 'window_page']],
    ['rate', ['citation_page']],
    ['rates', ['citation_page']],
    ['schedule', ['citation_page']],
    ['citation', ['citation_page']],
    ['amount', ['citation_page']],
    ['method', ['citation_page']],
    ['pays', ['citation_page']],
  ];
  /** The amounts' cues (the gateway's of docs/adr/0054, with allowed and paid apart). */
  const AMOUNT_CUES: Cues = [
    ['expected payment', ['expected']],
    ['expected reimbursement', ['expected']],
    ['expected allowed', ['expected']],
    ['expected allowable', ['expected']],
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
    ['request payment', ['variance']],
    ['requests payment', ['variance']],
    ['requested payment', ['variance']],
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
    ['balance', ['variance']],
    ['due', ['expected', 'variance']],
    ['interest', ['interest']],
    ['patient share', ['patient_share']],
    ['patient owes', ['patient_share']],
    ['patient owed', ['patient_share']],
    ['patient paid', ['patient_share']],
    ['patient pays', ['patient_share']],
    ['patients owe', ['patient_share']],
    ['patients paid', ['patient_share']],
    ['patients pay', ['patient_share']],
    ['patient responsibility', ['patient_share']],
    ['coinsurance', ['patient_share']],
    ['copay', ['patient_share']],
    ['copayment', ['patient_share']],
    ['deductible', ['patient_share']],
  ];
  /** The amounts' cues that are verbs or a verb's participle; every other cue is a noun (or an adjective before one). */
  const AMOUNT_VERBS = new Set([
    'expected',
    'expects',
    'expect',
    'requires',
    'required',
    'require',
    'comes to',
    'come to',
    'came to',
    'would have paid',
    'should have paid',
    'would have been paid',
    'should have been paid',
    'would pay',
    'should pay',
    'should have allowed',
    'would have allowed',
    'would have',
    'should allow',
    'allowed',
    'allows',
    'paid',
    'remitted',
    'reimbursed',
    'received',
    'shows',
    'showed',
    'show',
    'short',
    'underpaid',
    'underpaying',
    'owes',
    'owed',
    'owe',
    'owing',
    'due',
    'request payment',
    'requests payment',
    'requested payment',
    'patient owes',
    'patient owed',
    'patient paid',
    'patient pays',
    'patients owe',
    'patients paid',
    'patients pay',
  ]);
  /** The payer's acts: the amount is what the act moved, never the thing it was done to ("the payer paid the contract rate, $100.00"). */
  const PAYER_ACTS = new Set(['allowed', 'allows', 'paid', 'remitted', 'reimbursed', 'received', 'shows', 'showed', 'show', 'underpaid', 'underpaying']);
  /** Participles after a noun cue: the noun says what the amount is ("the interest owed is $5.76"). */
  const PARTICIPLES = new Set(['owed', 'owing', 'due']);
  /** Verbs that state what their subject comes to: the subject's cue says what the amount is ("the shortfall comes to $90.00"). */
  const COPULAS = new Set(['comes to', 'come to', 'came to']);
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
  /** The acts of payment among the dates' cues: a service's cue after one is what the payment was for ("paid for these services on"). */
  const PAYMENT_ACTS = new Set(['paid', 'pays', 'pay', 'remitted', 'processed', 'adjudicated', 'allowed', 'underpaid', 'denied']);
  /** The services' cues among the dates' cues. */
  const SERVICE_CUES = new Set(['service', 'services', 'serviced', 'rendered', 'treated', 'treatment', 'visit', 'visits', 'billed']);
  /** The dates' cues; "due" names a due date or a deadline, and a word beside it says which ("the prompt-pay deadline"). */
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
    ['allowed', ['paid_date']],
    ['underpaid', ['paid_date']],
    ['denied', ['paid_date']],
    ['received', ['received_date']],
    ['receipt', ['received_date']],
    ['prompt pay deadline', ['due_date']],
    ['payment due', ['due_date']],
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
    ['disputes', ['deadline']],
    ['disputed', ['deadline']],
    ['appeal', ['deadline']],
    ['appeals', ['deadline']],
    ['appealed', ['deadline']],
    ['raise', ['deadline']],
    ['raised', ['deadline']],
    ['file', ['deadline']],
    ['filed', ['deadline']],
    ['filing', ['deadline']],
    ['submit', ['deadline']],
    ['submitted', ['deadline']],
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
  /** Words after a day count's "days" that tie it to an event ("3650 days after payment"): those words are the count's, not a date's after it. */
  const DAY_ANCHORS = new Set(['after', 'of', 'from', 'following', 'since', 'before', 'past', 'beyond']);
  /** The kinds of day between a count and "days": "3650 calendar days", "10 business days". */
  const DAY_BASES = new Set(['calendar', 'business', 'working']);
  /** Words after a number that make it a dispute level: "a second-level appeal", "2 appeals". */
  const LEVEL_WORDS = new Set(['level', 'levels', 'appeal', 'appeals']);
  return {
    DAY_BASES,
    DAY_ANCHORS,
    LEVEL_WORDS,
    ABBREVIATED,
    WORD,
    EDGES,
    LABELS,
    VERB_LABELS,
    PLURAL_LABELS,
    LABEL_FILLERS,
    ROW_LABELS,
    COUNT_NOUNS,
    ORDINAL_NOUNS,
    ORDINAL_DETERMINERS,
    NOT_THE_COUNT,
    CODE_MODIFIER_LEADS,
    PARTITIVE_DETERMINERS,
    PARTITIVE_PRONOUNS,
    LIST_JOINERS,
    LIST_CONTINUERS,
    CONJUNCTIONS,
    YEAR_LEADS,
    YEAR_NOUNS,
    SCHEDULE_NOUNS,
    EACH,
    ONE_LINE,
    LINES,
    ONE_UNIT,
    TOTAL_WORDS,
    PLURAL_ROWS,
    TOTAL_FOR,
    DAY_CUES,
    PAGE_CUES,
    AMOUNT_CUES,
    AMOUNT_VERBS,
    PAYER_ACTS,
    PARTICIPLES,
    COPULAS,
    PERCENT_CUES,
    DATE_CUES,
    PAYMENT_ACTS,
    SERVICE_CUES,
    FUNCTION_WORDS,
    ORDINAL_WORDS,
  } as const;
}

export type Vocabulary = ReturnType<typeof vocabulary>;

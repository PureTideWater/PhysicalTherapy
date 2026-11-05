import type { FigureRole } from '../roles';

/**
 * The reader's labels and nouns (./index.ts; docs/adr/0086): the labels before a number, the rows' and the counts'
 * nouns, the ordinals' nouns, the words that keep a number some other count, the levels' words, and the words that
 * make a number a year. Built anew on each call, as every family of the reader's words is (./index.ts), and mutated in
 * a shard of its own (stryker/shards.json, packets-words-labels).
 */
export function labelWords() {
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
  const VERB_LABELS = new Set(['appeal']);
  /** Plural labels (LABELS' and ROW_LABELS'): a list after one keeps its role across a comma alone ("pages 1, 2", "rows 1, 2 and 3"). */
  const PLURAL_LABELS = new Set(['pages', 'pp', 'releases', 'levels', 'lines', 'rows', 'claims', 'patients']);
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
  /** Rows' nouns in the plural: a sentence about them that says nothing of each states totals ("the 3 lines billed 6 units"). */
  const PLURAL_ROWS = new Set(['lines', 'claims', 'services', 'visits', 'rows', 'encounters', 'procedures']);
  /** Words after a number that make it a dispute level: "a second-level appeal", "2 appeals". */
  const LEVEL_WORDS = new Set(['level', 'levels', 'appeal', 'appeals']);
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
  return {
    // Labels before a number.
    LABELS,
    VERB_LABELS,
    PLURAL_LABELS,
    LABEL_FILLERS,
    ROW_LABELS,
    // Counts: the nouns after a number, the ordinals' nouns, the words that keep a number some other count, and levels.
    COUNT_NOUNS,
    ORDINAL_NOUNS,
    NOT_THE_COUNT,
    PLURAL_ROWS,
    LEVEL_WORDS,
    // Years.
    YEAR_LEADS,
    YEAR_NOUNS,
    SCHEDULE_NOUNS,
  } as const;
}


/**
 * The reader's prose words (./index.ts; docs/adr/0086): what a word, an abbreviation and a clause's edge are, the words
 * that join a list or a clause, the ordinals, the determiners, pronouns and prepositions around a count or a code, the
 * words that say what an amount or a count of units is stated per, and the function words. Built anew on each call,
 * as every family of the reader's words is (./index.ts), and mutated in a shard of its own (stryker/shards.json,
 * packets-words-prose).
 *
 * @param notTheCount the labels' NOT_THE_COUNT (./labels.ts), which the function words hold
 */
export function proseWords(notTheCount: ReadonlySet<string>) {
  /** Words written with a period that does not end a clause ("pp. 4", "no. 2"); a single letter's never does ("p. 4", "G.S. 58"). */
  const ABBREVIATED = new Set(['pp', 'no', 'nos', 'vol', 'sec', 'art', 'para', 'ch', 'st', 'cf', 'vs', 'inc', 'co', 'corp', 'ltd', 'llc']);
  /** Letters, with an apostrophe inside a word, and the multiplication sign ("97110 × 2"). */
  const WORD = /[\p{L}×]+(?:['’][\p{L}]+)*/gu;
  /** A clause's edge: a sentence's end, a semicolon, a colon or a comma, and a blank line. */
  const EDGES = /[.!?;:,]|\n[ \t]*\n/g;
  /** Words that join a list: "pages 1 and 2", "lines 1 to 3", "lines 1–3" (a dash between two numbers is read as "–"). */
  const LIST_JOINERS = new Set(['and', 'or', 'to', 'through', 'thru', 'plus', ',', '–']);
  /** Conjunctions: the words after a figure stop at one, which opens the next figure's clause ("$300.00 and the remittances show $210.00"). */
  const CONJUNCTIONS = new Set(['and', 'but', 'or', 'while', 'whereas', 'yet']);
  /** Words that open a clause of their own after a "respectively" list ("which the payer explained for each line"): its words are not the list's. */
  const CLAUSE_OPENERS = new Set(['which', 'that', 'who', 'whom', 'whose', 'where', 'when', 'as', 'because', 'since', 'although', 'though', 'while', 'whereas', 'but', 'yet', 'so', 'if', 'unless']);
  /**
   * Words that, first after "respectively" and its commas or after an edge past it, open a clause of their own besides
   * CLAUSE_OPENERS and the conjunctions ("respectively, with each line short"; R1-NF-1), and a participle's ending
   * ("respectively, leaving each line short"; a total's word or a cue, "totaling" or "owing", is the list's own).
   */
  const CLAUSE_LEADS = new Set(['with', 'without']);
  const ING_WORD = /^\p{L}{2,}ing$/u;
  /** The words a scope phrase holds besides those of each line, a unit and a total ("in" is a total's: "in all"): "on each of the lines", "apiece" (R1-NF-3). */
  const SCOPE_LEADS = new Set(['on', 'of', 'apiece']);
  /** Words that join a list across a comma: "rows 1, 2 and 3". */
  const LIST_CONTINUERS = new Set([',', 'and', 'or', 'to', 'through', 'thru', '–']);
  /** Determiners before an ordinal that make it prose before a noun that is no row's ("the sixth unit", "a second appeal"). */
  const ORDINAL_DETERMINERS = new Set(['the', 'a', 'an', 'this', 'that', 'its', 'their', 'our', 'his', 'her', 'each', 'every']);
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
  /** Words before a five-digit figure before a noun that make the figure the noun's procedure code ("the 97110 lines"). */
  const CODE_MODIFIER_LEADS = new Set(['the', 'these', 'those', 'each', 'every', 'all', 'its', 'their', 'for', 'on', 'in', 'with', 'any', 'both', 'a', 'an', 'per', 'other', 'some', 'by', 'from', 'under', 'to', 'and', 'or']);
  /** Determiners in a partitive: "2 of the 3 claims". */
  const PARTITIVE_DETERMINERS = new Set(['the', 'these', 'those', 'its', 'their', 'all', 'our']);
  /** Pronouns in a partitive with no noun, "2 of them": a part of the lines, the claims or the patients. */
  const PARTITIVE_PRONOUNS = new Set(['them', 'these', 'those', 'which']);
  /** Words that name each line: "each line", "per line", "a visit". */
  const EACH = new Set(['each', 'every', 'per', 'a']);
  const ONE_LINE = new Set(['line', 'visit', 'row', 'service']);
  /** The lines after "each of": "on each of the 3 lines". */
  const LINES = new Set(['line', 'lines', 'visit', 'visits', 'row', 'rows', 'service', 'services']);
  /** A unit after "each", "per" or "a": an amount per unit ("$50.00 per unit", "at $50.00 a unit"). */
  const ONE_UNIT = new Set(['unit']);
  /** Words that state an amount or a count of units for the lines in total: "in all", "in total", "altogether", "across the 3 lines". */
  const TOTAL_WORDS: readonly string[] = [
    'in all',
    'in total',
    'all told',
    'total',
    'totals',
    'totaling',
    'totalling',
    'totaled',
    'totalled',
    'altogether',
    'combined',
    'overall',
    'aggregate',
    'across',
  ];
  /** Words before a plural row's noun after a figure that make the figure the rows' total: "$300.00 for these 3 lines" ("across" is a total's word wherever it is). */
  const TOTAL_FOR = new Set(['for', 'over']);
  /** Words that carry no meaning of their own: a quoted figure is never held by one of them alone. */
  const FUNCTION_WORDS = new Set([
    ...notTheCount,
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
  return {
    // The text: words, abbreviations and edges.
    ABBREVIATED,
    WORD,
    EDGES,
    // The lists that keep a label's role, and the clauses' conjunctions.
    LIST_JOINERS,
    LIST_CONTINUERS,
    CONJUNCTIONS,
    CLAUSE_OPENERS,
    CLAUSE_LEADS,
    ING_WORD,
    // Ordinals, and the determiners, pronouns and prepositions around a count or a code.
    ORDINAL_WORDS,
    ORDINAL_DETERMINERS,
    CODE_MODIFIER_LEADS,
    PARTITIVE_DETERMINERS,
    PARTITIVE_PRONOUNS,
    // What an amount or a count of units is stated per.
    EACH,
    ONE_LINE,
    LINES,
    ONE_UNIT,
    TOTAL_WORDS,
    TOTAL_FOR,
    SCOPE_LEADS,
    // Prose.
    FUNCTION_WORDS,
  } as const;
}

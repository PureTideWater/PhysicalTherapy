
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
  /**
   * Words that open a clause of their own: with an edge, a dash, a parenthesis, the conjunctions ("while", "but") and
   * RESULT_LEADS ("so"), they bound a figure's own clause, whose words alone state what it is per (rule 1 of
   * docs/adr/0086).
   */
  const CLAUSE_OPENERS = new Set(['which', 'that', 'who', 'whom', 'whose', 'where', 'when', 'as', 'because', 'since', 'although', 'though', 'if', 'unless']);
  /** Words that open a clause that states what follows from the sentence before it ("so the payer owes $90.00"): they bound a clause too. */
  const RESULT_LEADS = new Set(['so', 'therefore', 'thus', 'hence']);
  /** A singular noun that names the lines together after "for", "on" or "over", unless a line's noun follows it ("for the claim", never "the claim line"). */
  const TOTAL_NOUNS = new Set(['claim']);
  const TOTAL_NOUN_LEADS = new Set(['for', 'on', 'over']);
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
  /** One row's noun: words that name it state a line's value ("on line 1", "the schedule's third row"). */
  const ONE_ROW = new Set(['line', 'row', 'visit']);
  /** The lines after "each of": "on each of the 3 lines". */
  const LINES = new Set(['line', 'lines', 'visit', 'visits', 'row', 'rows', 'service', 'services']);
  /** A unit after "each", "per" or "a": an amount per unit ("$50.00 per unit", "at $50.00 a unit"). */
  const ONE_UNIT = new Set(['unit']);
  /** Words that state an amount or a count of units for the lines in total: "in all", "total" (so "in total"), "altogether", "across the 3 lines". */
  const TOTAL_WORDS: readonly string[] = [
    'in all',
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
    'together',
  ];
  /** Words before a plural row's noun after a figure that make the figure the rows' total: "$300.00 for these 3 lines" ("across" is a total's word wherever it is). */
  const TOTAL_FOR = new Set(['for', 'over']);
  /**
   * A "respectively" list's own words besides its cues and a scope's (rule 3 of docs/adr/0086): determiners, "were"
   * and "are", and "amounts", the noun of every cue, after which a scope is the whole list's; and "and", "or" and "the
   * payer" (LIST_LINKS), which join one cue to the next.
   */
  const LIST_FILLERS = new Set(['the', 'a', 'an', 'these', 'those', 'this', 'its', 'their', 'our', 'were', 'are']);
  const LIST_NOUNS = new Set(['amounts']);
  const LIST_LINKS = new Set(['and', 'or', 'payer']);
  /** A scope's words, as a "respectively" list may hold them with its cues: "per line", "in total", "on each of the lines", "for the claim". */
  const SCOPE_WORDS = new Set([...EACH, ...LINES, ...ONE_UNIT, ...TOTAL_FOR, ...TOTAL_NOUN_LEADS, ...TOTAL_NOUNS, ...TOTAL_WORDS.flatMap((phrase) => phrase.split(' ')), ...LIST_NOUNS, 'units', 'claims', 'of', 'apiece']);
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
    RESULT_LEADS,
    // Ordinals, and the determiners, pronouns and prepositions around a count or a code.
    ORDINAL_WORDS,
    ORDINAL_DETERMINERS,
    CODE_MODIFIER_LEADS,
    PARTITIVE_DETERMINERS,
    PARTITIVE_PRONOUNS,
    // What an amount or a count of units is stated per.
    EACH,
    ONE_LINE,
    ONE_ROW,
    LINES,
    ONE_UNIT,
    TOTAL_WORDS,
    TOTAL_FOR,
    TOTAL_NOUNS,
    TOTAL_NOUN_LEADS,
    // A "respectively" list's own words.
    LIST_FILLERS,
    LIST_NOUNS,
    LIST_LINKS,
    SCOPE_WORDS,
    // Prose.
    FUNCTION_WORDS,
  } as const;
}

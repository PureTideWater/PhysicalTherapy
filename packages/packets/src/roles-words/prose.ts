import type { FigureRole } from '../roles';

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
  /**
   * Conjunctions: an amount's words after it stop at one, which opens the next figure's clause ("$300.00 and the
   * remittances show $210.00"), and a "respectively" list's figures are after the last one an edge stands before ("The
   * payer paid $56.00 per line, and the contract expected ...").
   */
  const CONJUNCTIONS = new Set(['and', 'but', 'or', 'nor', 'while', 'whereas', 'yet']);
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
  /**
   * The closed list of scope phrases (rule 1 of docs/adr/0086, as amended on 2026-11-04): right after a figure, "per"
   * or "a" before one line's or one unit's noun ("$70.00 per line", "$50.00 a unit"), "for" or "on" before "each" or
   * "every" and that noun or "of the N lines" ("for each line", "on each of the 3 lines"), "in total" or "in all", "for"
   * or "on" before "the claim", and "across", "for" or "over" before the rows in the plural with their count or "all"
   * ("across the 3 lines", "for all the lines"); right before it, "each" or "every" before a line's possessive ("each
   * line's $70.00"), "per-line" or "per-unit", and "a total of" or "the total of".
   */
  const ONE_LINE = new Set(['line', 'visit', 'row', 'service']);
  const ONE_UNIT = new Set(['unit']);
  const PER = new Set(['per', 'a']);
  const EACH = new Set(['each', 'every']);
  const EACH_LEADS = new Set(['for', 'on']);
  /** The lines in the plural after "each of the N": "on each of the 3 lines". */
  const LINES = new Set(['lines', 'visits', 'rows', 'services']);
  const TOTAL_PHRASES: readonly string[] = ['in total', 'in all'];
  const CLAIM_LEADS = new Set(['for', 'on']);
  const ROWS_LEADS = new Set(['across', 'for', 'over']);
  const ROWS_DETERMINERS = new Set(['the', 'all', 'these', 'those']);
  const TOTAL_DETERMINERS = new Set(['a', 'the']);
  /**
   * What names a part of the lines in a sentence (the fail-closed triggers): these words; one line's noun after one of
   * ONE_DETERMINERS, or after an owner's word (ROW_OWNERS: "the claim line", "the patient's row") not after "each"; a
   * figure in one of PART_ROLES; and a count of lines, claims or patients the pattern does not hold (the verifier's).
   */
  const PART_WORDS = new Set(['remaining', 'other', 'others', 'some', 'last', 'first']);
  const ONE_DETERMINERS = new Set(['the', 'this', 'that', 'one', 'its']);
  const ROW_OWNERS = new Set(['patient', 'claim']);
  const PART_ROLES: ReadonlySet<FigureRole> = new Set<FigureRole>(['row', 'claim_row', 'patient_row']);
  /**
   * A "respectively" list's own words besides its cues and a scope's (rule 3 of docs/adr/0086): determiners ("a" is
   * a scope phrase's word too, SCOPE_WORDS), "were" and "are", and "amounts", the noun of every cue, after which a scope is the whole list's; and "and", "or" and "the
   * payer" (LIST_LINKS), which join one cue to the next.
   */
  const LIST_FILLERS = new Set(['the', 'an', 'these', 'those', 'this', 'its', 'their', 'our', 'were', 'are']);
  const LIST_NOUNS = new Set(['amounts']);
  const LIST_LINKS = new Set(['and', 'or', 'payer']);
  /** What alone joins a "respectively" list's figures: "$100.00 and $70.00", "$1.00, $2.00 or $3.00". */
  const LIST_JOINED = new Set([',', 'and', 'or']);
  /** A scope phrase's words (the closed list above), as a "respectively" list may hold them with its cues: "per line", "in total", "on each of the 3 lines", "for the claim". */
  const SCOPE_WORDS = new Set([...PER, ...EACH, ...EACH_LEADS, ...ONE_LINE, ...ONE_UNIT, ...LINES, ...ROWS_LEADS, ...TOTAL_PHRASES.flatMap((phrase) => phrase.split(' ')), ...LIST_NOUNS, 'units', 'claim', 'claims', 'of']);
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
    // Ordinals, and the determiners, pronouns and prepositions around a count or a code.
    ORDINAL_WORDS,
    ORDINAL_DETERMINERS,
    CODE_MODIFIER_LEADS,
    PARTITIVE_DETERMINERS,
    PARTITIVE_PRONOUNS,
    // What an amount or a count of units is stated per: the closed list of scope phrases.
    ONE_LINE,
    ONE_UNIT,
    PER,
    EACH,
    EACH_LEADS,
    LINES,
    TOTAL_PHRASES,
    CLAIM_LEADS,
    ROWS_LEADS,
    ROWS_DETERMINERS,
    TOTAL_DETERMINERS,
    // What names a part of the lines.
    PART_WORDS,
    ONE_DETERMINERS,
    ROW_OWNERS,
    PART_ROLES,
    // A "respectively" list's own words.
    LIST_FILLERS,
    LIST_NOUNS,
    LIST_LINKS,
    LIST_JOINED,
    SCOPE_WORDS,
    // Prose.
    FUNCTION_WORDS,
  } as const;
}

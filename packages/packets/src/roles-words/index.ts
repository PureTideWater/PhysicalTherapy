import type { FigureRole } from '../roles';
import { amountWords } from './amounts';
import { dateWords } from './dates';
import { dayWords } from './days';
import { labelWords } from './labels';
import { proseWords } from './prose';

/**
 * The role reader's words (../roles.ts; docs/adr/0086): the labels before a number and the nouns after it, the words
 * that make a number a year or keep it some other count, and the cues that name which day count, page, amount,
 * percentage or date a figure is. Each list is the reader's whole vocabulary of its kind: a word left out reads no
 * role, so each is named in ../roles.test.ts.
 *
 * Built on each read rather than once when the module loads, so that each mutant of a word is tried against the tests
 * that read it (docs/adr/0066, Part 4: a value a module builds when it loads is a static mutant every test runs again).
 * The words are in five families, a file and a shard each (stryker/shards.json), so that each shard keeps within the
 * mutation job's time (in one shard the words, 1,507 mutants, would take longer than the job's 30 minutes):
 *
 * - ./labels.ts (packets-words-labels): the labels before a number, the rows', counts' and ordinals' nouns, the words
 *   that keep a number some other count, the levels' words and the years';
 * - ./amounts.ts (packets-words-amounts): the amounts' cues, verbs, payer's acts, participles and copulas;
 * - ./days.ts (packets-words-days): the day counts', pages' and percentages' cues;
 * - ./dates.ts (packets-words-dates): the dates' cues;
 * - ./prose.ts (packets-words-prose, with this file): words, abbreviations and edges, the lists' and clauses' joining
 *   words, the ordinals, the determiners and pronouns around a count or a code, the words of each line and of totals,
 *   and the function words.
 */

/** A cue: its words in order, and the roles it names. */
export type Cues = readonly (readonly [string, readonly FigureRole[]])[];

/** The reader's words, built anew on each call. */
export function vocabulary() {
  const labels = labelWords();
  return { ...proseWords(labels.NOT_THE_COUNT), ...labels, ...amountWords(), ...dayWords(), ...dateWords() } as const;
}

export type Vocabulary = ReturnType<typeof vocabulary>;

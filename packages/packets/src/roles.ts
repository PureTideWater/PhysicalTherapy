import { type Cues, type Vocabulary, vocabulary } from './roles-words';
import { type Figure, type FigureKind, canonicalNumber, scanText } from './scan';

/**
 * Reading each figure of a text in the role its own words give it (PRD 12: "the verifier then checks every date,
 * code, unit, amount, count and identifier in the text against the canonical record"; PRD 14, draftPacketNarrative:
 * "every number, date, code and count in the text must match the inputs exactly"; docs/adr/0086). The scanner
 * (./scan.ts) says what a figure is by its shape: an amount, a date, a code, a number. This says what it is of: "3650
 * days" is the dispute window's day count, "page 2" a page, "3 claims" the claim count, "the payer allowed $70.00" the
 * allowed amount. The verifier holds the figure to the inputs of that role (./verifier/mismatches.ts), so an input's
 * value stated in another role fails ("10000 visits" when 10000 is the window's days; "2026 claims" when 2026 is a
 * service date's year).
 *
 * A text is read as words, figures, placeholders and edges (a comma, a colon, a semicolon or a sentence's end); the
 * citation markers are left out, and a dash between two numbers is read as "–" ("lines 1–3"). A number's role comes
 * from the words beside it, in order:
 *
 * - a label before it: "page 2", "version 1", "release 900001", "level 2", "97110 x 2" (each line's units), but a
 *   count's noun after it beats a label that is a verb too ("We appeal 3 claims");
 * - a label before a colon: "Units billed: 2";
 * - "days" after it ("3650 days", "3650 calendar days", "3650-day", "thirty (30) days"), with which day count from
 *   one cue: the one right after "days" ("days late", "days to pay"), else the nearest before the count since the
 *   figure before it ("within", "pay within", "dispute"), else the nearest after it; "business days" or "working days"
 *   are days to pay alone, and only where the record counts business days;
 * - "level" after it: "a second-level appeal" ("appeal" after a cardinal: "a 2 appeal");
 * - a year: a whole number from 1900 to 2199 after "in", "during", "since", "for", a possessive, "its", "this", CY,
 *   FY or "year", or before a year's noun ("2026 rates", "the 2026 fee schedule"), but never before a count's noun
 *   that names no date ("these 2026 claims" is a count of claims; "these 2026 services" a year);
 * - a count's noun after it, at once, after a code or after one word that does not make it some other count ("3
 *   lines", "4 denied claims", "3 97110 lines", "2-unit line"); "units" with "each line" or "per line" beside it is
 *   each line's units; an ordinal before a singular row's noun is that row ("the second line", "the third claim"), and
 *   an ordinal before any other word, or before another number, is prose ("the sixth unit", "the second appeal", "the
 *   first 3 claims");
 * - a partitive: "2 of the 3 claims" makes 3 the claim count and 2 a part of it, at most 3 ("Of the 3 claims, 2 ...",
 *   and "2 of them", a part of the lines, claims or patients);
 * - a row's noun before it: "line 2", "claims 1 through 3";
 * - a list after a label keeps the label's role: "pages 1 and 2", "lines 1 to 3", "lines 1–3", "in 2026 and 2027";
 *   across a comma alone only after a plural label or while the list goes on ("rows 1, 2 and 3", never "version 1,
 *   2 of them").
 *
 * Any other number has no role. A five-digit figure is a code unless its words make it a number: a label, "days",
 * "level", or a count's noun; before a noun with an article or preposition before it ("the 97110 lines") it may be
 * either. Two decimals without a dollar sign before a count's noun or "days" are a number ("1.25 units").
 *
 * An amount, a percentage, a date (a month, a day of a month, a year), a day count and a page each take one cue's
 * roles, never the union of every cue around them (docs/adr/0086, the fix round of 2026-11-01):
 *
 * 1. "respectively" maps a list's figures to the cues before it, in order ("the contract expected and the payer
 *    allowed $100.00 and $70.00, respectively");
 * 2. the cue right after the figure ("the $30.00 difference", "$5.76 in interest", "9% a year", "112.5% of
 *    Medicare", "2025 rates"), or the noun it completes with "of" ("a shortfall of $90.00", "the contract rate of
 *    $56.00");
 * 3. the nearest cue before it in its own clause (since the figure before it, after the last comma or colon), the
 *    longer at the same end: a participle after a noun is the noun's ("the interest owed is $5.76"); a noun after
 *    the payer's act is the act's object ("the payer paid the contract rate, $100.00"); a copula ("comes to") takes
 *    its subject's cue ("the shortfall of $30.00 per line comes to $90.00"); a cue that names two roles is narrowed by
 *    one beside it that names one of them ("the remittance paid", "the dispute window clause");
 * 4. (an amount) the nearest cue after it, up to the next figure or edge ("$100.00 was due");
 * 5. the cues of the clauses before it since the figure before it (past a comma or a colon): when they name one role,
 *    that role; when they name several, the figure is held in every one of them ("the contract requires more than
 *    the payer paid: $56.00" holds $56.00 to both and fails);
 * 6. past a figure of another family, the words before that figure ("the payer paid $56.00 on <date>", "the window
 *    ends 3650 days after payment, on <date>", whose "days after payment" are the day count's), or, after a figure of
 *    its own family with no cue of its own, that figure's roles ("the payer allowed $70.00 per line and $100.00 in
 *    total");
 * 7. (a date or a percentage) the nearest cue after it, past a comma when it opens its sentence ("On <date>, the payer
 *    paid");
 * 8. with no cue, any role of its kind (a day count any of the three, a page either).
 *
 * A percentage takes every role its own clause and the words after it name, and is held in all of them when they
 * name both ("Interest runs at 112.5% of Medicare" fails). A page takes the dispute window's or the clause's from the
 * words around it; a clause, a quote, a section or what is cited may be either. An amount and a count of units also
 * say what they are stated per (`scope`): each line ("per line", "each line", "apiece", "on each of the 3 lines"),
 * each unit ("per unit", "a unit"), or the lines in total ("in total", "in all", "across the 3 lines", "for these 3
 * lines", or a sentence about the lines in the plural that says nothing of each). "first" with no role is prose, as
 * "one" and "zero" are.
 *
 * Pure, deterministic and browser-safe: no Node module, clock or network.
 */

/** Every role a figure can be read in, and an input held in. */
export const FIGURE_ROLES = [
  // Numbers
  'window_days',
  'days_to_pay',
  'days_late',
  'citation_page',
  'window_page',
  'version',
  'release',
  'level',
  'lines',
  'claims',
  'patients',
  'units',
  'line_units',
  'row',
  'claim_row',
  'patient_row',
  // Amounts
  'expected',
  'allowed',
  'paid',
  'variance',
  'interest',
  'patient_share',
  'calculation',
  // Percentages
  'contract_percent',
  'interest_rate',
  // Dates, months, days of a month and years
  'service_date',
  'paid_date',
  'received_date',
  'due_date',
  'deadline',
  'effective_date',
  'as_of_date',
  'schedule_year',
] as const;
export type FigureRole = (typeof FIGURE_ROLES)[number];

/** What an amount or a count of units is stated per: each line, each unit, or the lines in total. */
export const SCOPES = ['line', 'unit', 'total'] as const;
export type Scope = (typeof SCOPES)[number];

/** What a figure is read as: the scanner's kinds, and a year (a number the words make a year). */
export type ReadKind = FigureKind | 'year';

/**
 * A figure as read: its kind and value, and the roles its words give it, `any` when its words name no role of its
 * kind (an amount, percentage or date with no cue), or `none` for a number with no role.
 */
export interface FigureReading {
  readonly figure: Figure;
  readonly kind: ReadKind;
  readonly value: string;
  /** Any one of them, or, when `every`, each of them. */
  readonly roles: readonly FigureRole[] | 'any' | 'none';
  /** The words name several roles and none is the figure's own (step 5): the figure must be held in every one. */
  readonly every: boolean;
  /** What an amount or a count of units is stated per (null: not said). */
  readonly scope: Scope | null;
  /**
   * A partitive's first number ("2 of the 3 claims"): a part of the count `roles` name, at most `of` (the second
   * number), or, with none, at most the largest count the inputs hold in those roles.
   */
  readonly part: { readonly of: string | null } | null;
  /** A five-digit figure before a count's noun, after an article or a preposition: the procedure code it may also be ('' for none). */
  readonly code: string;
  /** A day count stated in business or working days. */
  readonly business: boolean;
  /** "first" with no role, or an ordinal before another word or number: prose, as "one" is. */
  readonly prose: boolean;
  /** Where the figure is among the text's tokens (quotedHolds() compares the words around it). */
  readonly token: number;
}

/** A text read: its figures with their roles, and its tokens as quotedHolds() compares them (an edge is "|"). */
export interface ReadText {
  readonly readings: readonly FigureReading[];
  readonly tokens: readonly string[];
}

/** A quoted text as quotedHolds() compares a narrative's figure with it: its tokens, and the roles its own words give each figure. */
export interface QuotedText {
  readonly tokens: readonly string[];
  /** By token, the roles the quote's own words give the figure there (`none` or `any` for none). */
  readonly roles: ReadonlyMap<number, Pick<FigureReading, 'roles' | 'every'>>;
}

type TokenKind = 'word' | 'figure' | 'edge';

interface Token {
  readonly kind: TokenKind;
  /**
   * A word in lower case without a possessive's "'s" (a placeholder is the word "placeholder"), an edge's characters,
   * or a figure's comparison key.
   */
  readonly text: string;
  readonly start: number;
  readonly end: number;
  /** A word or a figure written with a possessive's "'s" ("Medicare's", "Patient 2's"). */
  possessive: boolean;
  /** A figure token's figure. */
  readonly figure?: Figure;
}

/** How a figure is compared beside its words: its kind's family and its value. */
function figureKey(figure: Figure): string {
  switch (figure.kind) {
    case 'amount':
      return `a:${figure.value}`;
    case 'percent':
      return `p:${figure.value}`;
    case 'date':
    case 'month':
    case 'month_day':
      return `d:${figure.kind}:${figure.value}`;
    // A procedure code in digits is the number it writes, so "10000" in a quote is "10,000" in a narrative.
    case 'code':
      return `n:${/^\d+$/.test(figure.value) ? canonicalNumber(figure.value) : figure.value}`;
    case 'number':
      return `n:${figure.value}`;
    case 'modifier':
      return `m:${figure.value}`;
    case 'identifier':
      return `i:${figure.value}`;
  }
}

/** A figure that writes a number in digits: a dash between two of them is a range ("1–3"). */
const isNumeral = (figure: Figure) => figure.kind === 'number' || (figure.kind === 'code' && /^\d+$/.test(figure.value));

function tokenize(text: string, vocab: Vocabulary): Token[] {
  const scan = scanText(text);
  const taken = [...scan.figures, ...scan.placeholders, ...scan.markers];
  const free = (start: number, end: number) => !taken.some((span) => span.start < end && start < span.end);
  const make = (kind: TokenKind, value: string, start: number, end: number, figure?: Figure, possessive = false): Token => ({ kind, text: value, start, end, figure, possessive });
  const figures = scan.figures.map((figure) => make('figure', figureKey(figure), figure.start, figure.end, figure));
  const words = scan.placeholders.map((placeholder) => make('word', 'placeholder', placeholder.start, placeholder.end));
  for (const match of text.matchAll(vocab.WORD)) {
    const start = match.index;
    const end = start + match[0].length;
    // A figure's possessive ("Patient 2's line") makes the figure possessive, never a word of its own.
    const owner = figures.find((figure) => /^['’]s$/i.test(text.slice(figure.end, end)));
    if (owner !== undefined) {
      owner.possessive = true;
    } else if (free(start, end)) {
      const lower = match[0].toLowerCase();
      const possessive = /['’]s$/.test(lower);
      words.push(make('word', possessive ? lower.slice(0, -2) : lower, start, end, undefined, possessive));
    }
  }
  // A dash between two numbers is a range's "–" ("lines 1–3", "lines 1 - 3"; "1-3" is one identifier).
  figures.forEach((figure, at) => {
    const next = figures[at + 1];
    if (next?.figure !== undefined && figure.figure !== undefined && isNumeral(figure.figure) && isNumeral(next.figure) && /^\s*[–—-]\s*$/.test(text.slice(figure.end, next.start))) {
      words.push(make('word', '–', figure.end, figure.end));
    }
  });
  // A period ends a clause only before a space or the text's end, and never after one letter or an abbreviation.
  const abbreviation = (start: number) => words.some((word) => word.end === start && (word.text.length === 1 || vocab.ABBREVIATED.has(word.text)));
  const edges = [...text.matchAll(vocab.EDGES)]
    .filter((match) => free(match.index, match.index + 1) && !(match[0] === '.' && (/\S/.test(text.charAt(match.index + 1)) || abbreviation(match.index))))
    .map((match) => make('edge', match[0], match.index, match.index));
  return [...figures, ...words, ...edges].sort((a, b) => a.start - b.start || a.end - b.end);
}

/** Whether a figure is written as an ordinal: "3rd", "second", "twenty-first". */
function isOrdinal(written: string, vocab: Vocabulary): boolean {
  const lower = written.toLowerCase();
  return /\d(?:st|nd|rd|th)/.test(lower) || [...vocab.ORDINAL_WORDS].some((word) => lower.endsWith(word));
}

/** The cue that starts at word `at`, the longest first (each list holds a longer cue before a shorter one it starts like). */
function cueAt(words: readonly string[], at: number, cues: Cues): Cues[number] | undefined {
  return cues.find(([phrase]) => phrase.split(' ').every((part, offset) => words[at + offset] === part));
}

/** A count's noun, and the counts it may be. */
interface Counted {
  readonly noun: string;
  readonly roles: readonly FigureRole[];
  /** The token after the noun. */
  readonly end: number;
}

/** What a number's words make it. */
interface NumberRole {
  readonly roles: readonly FigureRole[];
  readonly business: boolean;
  /** A five-digit figure before a noun that may be the noun's procedure code. */
  readonly code: boolean;
  readonly scope: Scope | null;
  readonly part: FigureReading['part'];
}

/** The families of figures whose role comes from cues. */
type Family = 'amount' | 'percent' | 'date' | 'day' | 'page';

/** A cue's roles as resolved for a figure. */
interface Cued {
  readonly roles: readonly FigureRole[] | 'any';
  readonly every: boolean;
}

/** A cue found among a text's tokens: from token `start` to token `end`, of `size` words. */
interface Match {
  readonly start: number;
  readonly end: number;
  readonly size: number;
  readonly phrase: string;
  readonly roles: readonly FigureRole[];
}

const ANY: Cued = { roles: 'any', every: false };
/** A partitive's second number as a plain decimal, when it is one. */
const numeral = (figure: Figure | undefined): string | null => (figure !== undefined && isNumeral(figure) ? canonicalNumber(figure.value) : null);
const notWord = (token: Token) => token.kind !== 'word';
const ordered = (roles: Iterable<FigureRole>): FigureRole[] => {
  const set = new Set(roles);
  return FIGURE_ROLES.filter((role) => set.has(role));
};
/** The nearest of the cues, the longer at the same end. */
const nearest = <T extends { readonly match: Match }>(entries: readonly T[]): T | undefined =>
  entries.reduce<T | undefined>((best, entry) => (best === undefined || entry.match.end > best.match.end || (entry.match.end === best.match.end && entry.match.size > best.match.size) ? entry : best), undefined);

/** A cue as it counts in its stretch of words: its own roles, or those another cue beside it makes them. */
interface Entry {
  readonly match: Match;
  readonly roles: readonly FigureRole[];
}

class Reader {
  private readonly readings = new Map<number, NumberRole | null>();
  /** Each figure read so far: its family (null for none whose role comes from cues) and its cued roles. */
  private readonly families = new Map<number, Family | null>();
  private readonly cued = new Map<number, Cued>();
  /** The token after the words a figure keeps for itself ("3650 days after payment", "3 claims"). */
  private readonly ends = new Map<number, number>();

  constructor(
    private readonly text: string,
    private readonly tokens: readonly Token[],
    private readonly vocab: Vocabulary,
  ) {}

  private at(index: number, offset: number): Token | undefined {
    return this.tokens[index + offset];
  }

  /** The word `offset` from token `index`, or nothing when the token there is no word. */
  private word(index: number, offset: number): string {
    const token = this.at(index, offset);
    return token?.kind === 'word' ? token.text : '';
  }

  /** The tokens' texts from token `index` on, a step at a time (nearest first), up to the first that `stops`. */
  private run(index: number, step: 1 | -1, stops: (token: Token) => boolean): string[] {
    const tokens = step === 1 ? this.tokens.slice(index + 1) : this.tokens.slice(0, index).reverse();
    const end = tokens.findIndex(stops);
    return tokens.slice(0, end === -1 ? tokens.length : end).map((token) => token.text);
  }

  /** Whether token `index` ends a sentence or a clause a comma or colon does not (a period, "!", "?", ";", a blank line). */
  private stop(index: number): boolean {
    const token = this.tokens[index];
    return token?.kind === 'edge' && token.text !== ',' && token.text !== ':';
  }

  /** The first token of token `index`'s sentence (after a period, "!", "?", ";" or a blank line). */
  private sentenceStart(index: number): number {
    let at = index - 1;
    while (at >= 0 && !this.stop(at)) {
      at -= 1;
    }
    return at + 1;
  }

  /** The token that ends token `index`'s sentence (its stop, or the text's end). */
  private sentenceEnd(index: number): number {
    let at = index + 1;
    while (at < this.tokens.length && !this.stop(at)) {
      at += 1;
    }
    return at;
  }

  /** The figure before token `index` in its sentence, or -1. */
  private previousFigure(index: number): number {
    for (let at = index - 1; at >= this.sentenceStart(index); at -= 1) {
      if (this.tokens[at]?.kind === 'figure') {
        return at;
      }
    }
    return -1;
  }

  /** The first token after token `index` that is a figure or an edge (`stops` an edge only when it is a stop). */
  private nextBreak(index: number, edges: 'all' | 'stops'): number {
    let at = index + 1;
    while (at < this.tokens.length && this.tokens[at]?.kind !== 'figure' && !(this.tokens[at]?.kind === 'edge' && (edges === 'all' || this.stop(at)))) {
      at += 1;
    }
    return at;
  }

  /** The token after the words the figure at token `index` keeps for itself (its own token's next when none). */
  private end(index: number): number {
    return this.ends.get(index) ?? index + 1;
  }

  /** Where token `index`'s words since the figure before it start: after that figure's own words, or at the sentence's start. */
  private since(index: number): number {
    const previous = this.previousFigure(index);
    return previous === -1 ? this.sentenceStart(index) : Math.min(this.end(previous), index);
  }

  /** The start of token `index`'s own clause: after the last comma or colon since the figure before it. */
  private ownFrom(index: number): number {
    const from = this.since(index);
    for (let at = index - 1; at >= from; at -= 1) {
      if (this.tokens[at]?.kind === 'edge') {
        return at + 1;
      }
    }
    return from;
  }

  /** Every cue of `cues` that consecutive words of tokens [from, to) match, outermost only (a cue inside a longer one is the longer one's). */
  private cues(from: number, to: number, cues: Cues): Match[] {
    const found: Match[] = [];
    for (let start = Math.max(from, 0); start < to; start += 1) {
      for (const [phrase, roles] of cues) {
        const parts = phrase.split(' ');
        const end = start + parts.length - 1;
        if (end < to && parts.every((part, offset) => this.tokens[start + offset]?.kind === 'word' && this.tokens[start + offset]?.text === part)) {
          found.push({ start, end, size: parts.length, phrase, roles });
        }
      }
    }
    return found.filter((match) => !found.some((other) => other.size > match.size && other.start <= match.start && match.end <= other.end));
  }

  /**
   * A stretch's cues as each counts (step 3): a participle after a noun is the noun's, a noun after the payer's act is
   * the act's object, and a cue that names two roles beside one that names one of them is that one.
   */
  private entries(matches: readonly Match[], family: Family): Entry[] {
    const sorted = [...matches].sort((a, b) => a.start - b.start);
    const verb = (match: Match) => this.vocab.AMOUNT_VERBS.has(match.phrase);
    // Whether a conjunction, an edge or a figure stands between two cues: an act's object never lies past one.
    const apart = (before: Match, after: Match) => this.tokens.slice(before.end + 1, after.start).some((token) => token.kind !== 'word' || this.vocab.CONJUNCTIONS.has(token.text));
    const kept = sorted.filter((match, at) => {
      if (family === 'date') {
        // What a payment was for is no date of its own: "the payer paid for these services on <date>".
        return !(this.vocab.SERVICE_CUES.has(match.phrase) && sorted.slice(0, at).some((before) => this.vocab.PAYMENT_ACTS.has(before.phrase) && !apart(before, match)));
      }
      if (family !== 'amount') {
        return true;
      }
      const before = sorted[at - 1];
      if (this.vocab.PARTICIPLES.has(match.phrase) && before !== undefined && !verb(before) && before.end === match.start - 1) {
        return false;
      }
      if (!verb(match)) {
        // The act's object follows it in its clause: never past a conjunction ("the payer allowed and the shortfall is").
        const act = sorted.slice(0, at).reverse().find(verb);
        return act === undefined || !this.vocab.PAYER_ACTS.has(act.phrase) || apart(act, match);
      }
      return true;
    });
    return kept.map((match) => {
      if (match.roles.length < 2) {
        return { match, roles: match.roles };
      }
      const narrower = nearest(kept.filter((other) => other.roles.length === 1 && match.roles.includes(other.roles[0] as FigureRole)).map((other) => ({ match: other })));
      return { match, roles: narrower === undefined ? match.roles : narrower.match.roles };
    });
  }

  /** A copula's subject: the nearest other cue before it in its clause, past the figures there ("the shortfall of $30.00 per line comes to"). */
  private subject(copula: Match, family: Family, cues: Cues): Entry | undefined {
    let from = copula.start;
    while (from > 0 && this.tokens[from - 1]?.kind !== 'edge') {
      from -= 1;
    }
    return nearest(this.entries(this.cues(from, copula.start, cues), family).filter((entry) => !this.vocab.COPULAS.has(entry.match.phrase)));
  }

  /** An entry as it stands, a copula replaced by its subject. */
  private resolved(entry: Entry, family: Family, cues: Cues): Entry {
    return family === 'amount' && this.vocab.COPULAS.has(entry.match.phrase) ? (this.subject(entry.match, family, cues) ?? entry) : entry;
  }

  /** Step 3: the nearest cue of tokens [from, to), as it counts. */
  private nearestCue(from: number, to: number, family: Family, cues: Cues): Cued | null {
    const found = nearest(this.entries(this.cues(from, to, cues), family));
    return found === undefined ? null : { roles: ordered(this.resolved(found, family, cues).roles), every: false };
  }

  /** Step 5: the cues of the stretches given; one role, or, when they name several, every one of them. */
  private everyCue(stretches: readonly (readonly [number, number])[], family: Family, cues: Cues): Cued | null {
    const found = stretches.flatMap(([from, to]) => this.entries(this.cues(from, to, cues), family)).map((entry) => this.resolved(entry, family, cues));
    const best = nearest(found);
    if (best === undefined) {
      return null;
    }
    const roles = ordered(found.flatMap((entry) => entry.roles));
    const others = found.some((entry) => entry.roles.some((role) => !best.roles.includes(role)));
    return others ? { roles, every: true } : { roles: ordered(best.roles), every: false };
  }

  /** Step 2: the cue right after token `index` (past "in" or "of"), or the noun the figure completes with "of" ("a shortfall of $90.00"). */
  private bound(index: number, family: Family, cues: Cues): Cued | null {
    const words = this.run(index, 1, notWord);
    const from = words[0] === 'in' || words[0] === 'of' ? 1 : 0;
    const after = cueAt(words, from, cues);
    if (after !== undefined) {
      return { roles: ordered(after[1]), every: false };
    }
    const of = this.word(index, -1) === 'of' ? -1 : this.word(index, -2) === 'of' && this.vocab.PARTITIVE_DETERMINERS.has(this.word(index, -1)) ? -2 : 0;
    if (of === 0 || family === 'percent') {
      return null;
    }
    // The noun before "of", or one word before it ("the contract amount of $70.00"): what the figure is, whatever act comes before.
    const to = index + of;
    const found = nearest(this.cues(Math.max(this.ownFrom(index), to - 4), to, cues).filter((match) => match.end >= to - 2).map((match) => ({ match })));
    return found === undefined ? null : { roles: ordered(found.match.roles), every: false };
  }

  /** Step 1: a list's figures mapped to the cues before it, in order, when its sentence says "respectively". */
  private respectively(index: number, family: Family, cues: Cues): Cued | null {
    const start = this.sentenceStart(index);
    const end = this.sentenceEnd(index);
    if (!this.tokens.slice(start, end).some((token) => token.kind === 'word' && token.text === 'respectively')) {
      return null;
    }
    const same = (at: number) => this.tokens[at]?.figure?.kind === this.tokens[index]?.figure?.kind;
    const joined = (from: number, to: number) => this.tokens.slice(from + 1, to).every((token) => token.kind !== 'figure' && (token.text === ',' || token.text === 'and' || token.text === 'or'));
    const list = [index];
    for (let at = index - 1, last = index; at >= start; at -= 1) {
      if (this.tokens[at]?.kind === 'figure') {
        if (!same(at) || !joined(at, last)) {
          break;
        }
        list.unshift(at);
        last = at;
      }
    }
    for (let at = index + 1, last = index; at < end; at += 1) {
      if (this.tokens[at]?.kind === 'figure') {
        if (!same(at) || !joined(last, at)) {
          break;
        }
        list.push(at);
        last = at;
      }
    }
    const first = list[0] as number;
    if (list.length < 2) {
      return null;
    }
    const order: (readonly FigureRole[])[] = [];
    for (const entry of this.entries(this.cues(this.since(first), first, cues), family)) {
      const last = order.at(-1);
      if (last === undefined || last.join() !== entry.roles.join()) {
        order.push(entry.roles);
      }
    }
    const mine = order[list.indexOf(index)];
    return order.length === list.length && mine !== undefined ? { roles: ordered(mine), every: false } : { roles: ordered(order.flat()), every: true };
  }

  /**
   * Step 6: past the figures of other families before token `index` (their own words left out), the cues of the words
   * before them, back to a figure of its own family, whose roles it then takes, or to the sentence's start.
   */
  private reachBack(index: number, family: Family, cues: Cues): Cued | null {
    let previous = this.previousFigure(index);
    const stretches: [number, number][] = [];
    while (previous !== -1 && this.families.get(previous) !== family) {
      const before = this.previousFigure(previous);
      stretches.push([before === -1 ? this.sentenceStart(previous) : this.end(before), previous]);
      previous = before;
    }
    return this.everyCue(stretches, family, cues) ?? (previous === -1 ? null : (this.cued.get(previous) ?? null));
  }

  /** Steps 1 to 8 for an amount, a date or a percentage at token `index`. */
  private role(index: number, family: 'amount' | 'date' | 'percent', cues: Cues): Cued {
    const own = this.ownFrom(index);
    const since = this.since(index);
    // The words after it, up to the next figure or edge, or a conjunction that opens the next figure's clause ("and the remittances show").
    const after = (edges: 'all' | 'stops') => {
      let to = this.nextBreak(index, edges);
      const conjunction = this.tokens.slice(index + 1, to).findIndex((token) => token.kind === 'word' && this.vocab.CONJUNCTIONS.has(token.text));
      to = conjunction === -1 ? to : index + 1 + conjunction;
      const found = this.cues(index + 1, to, cues).sort((a, b) => a.start - b.start)[0];
      return found === undefined ? null : { roles: ordered(this.entries([found], family)[0]?.roles ?? found.roles), every: false };
    };
    const opening = this.previousFigure(index) === -1;
    // A percentage's words after it: six tokens at most, up to an edge, past a year ("of the 2026 Medicare fee schedule").
    let words = index + 1;
    while (words < index + 7 && words < this.tokens.length && this.tokens[words]?.kind !== 'edge') {
      words += 1;
    }
    const steps: (() => Cued | null)[] = [
      () => this.respectively(index, family, cues),
      () => (family === 'percent' ? this.everyCue([[index + 1, words], [own, index]], family, cues) : this.bound(index, family, cues)),
      () => (family === 'percent' ? null : this.nearestCue(own, index, family, cues)),
      () => (family === 'amount' ? after('all') : null),
      () => this.everyCue([[since, own]], family, cues),
      () => this.reachBack(index, family, cues),
      () => (family === 'date' ? after(opening ? 'stops' : 'all') : null),
    ];
    for (const step of steps) {
      const found = step();
      if (found !== null) {
        return found;
      }
    }
    return ANY;
  }

  /** What an amount or a count of units is stated per (`from` the token its words after start at). */
  private scope(index: number, from: number): Scope | null {
    // 'each': each of something not a line or a unit ("$50.00 each", "each claim"): stated per something, never in total.
    const each = (at: number): Scope | 'each' | null => {
      if (this.tokens[at]?.text === 'apiece') {
        return 'line';
      }
      const word = this.word(at, 0);
      if (!this.vocab.EACH.has(word)) {
        return null;
      }
      if (this.word(at, 1) === 'of') {
        // "each of the 3 lines": past determiners and figures to the noun.
        const rest = this.tokens.slice(at + 2, at + 6).filter((token) => token.kind === 'figure' || !this.vocab.PARTITIVE_DETERMINERS.has(token.text));
        const noun = rest.find((token) => token.kind === 'word');
        return noun !== undefined && this.vocab.LINES.has(noun.text) ? 'line' : 'each';
      }
      const ahead = this.tokens.slice(at + 1, at + 4).filter((token) => token.kind !== 'figure').slice(0, 2).map((token) => token.text);
      return ahead.some((next) => this.vocab.ONE_LINE.has(next)) ? 'line' : ahead.some((next) => this.vocab.ONE_UNIT.has(next)) ? 'unit' : word === 'a' ? null : 'each';
    };
    const total = (start: number, to: number): boolean => {
      if (this.cues(start, to, this.vocab.TOTAL_WORDS).length > 0) {
        return true;
      }
      return this.tokens.slice(start, to).some((token, at) => {
        if (token.kind !== 'word' || !this.vocab.TOTAL_FOR.has(token.text)) {
          return false;
        }
        const noun = this.tokens.slice(start + at + 1, start + at + 5).find((next) => next.kind === 'word' && !this.vocab.PARTITIVE_DETERMINERS.has(next.text));
        return noun !== undefined && this.vocab.PLURAL_ROWS.has(noun.text);
      });
    };
    const stated = (start: number, to: number): Scope | 'each' | null => {
      for (let at = start; at < to; at += 1) {
        const found = each(at);
        if (found !== null) {
          return found;
        }
      }
      return total(start, to) ? 'total' : null;
    };
    // After it, up to the next amount or edge (past counts: "for these 3 lines"); then before it, since the figure before.
    let to = from;
    while (to < this.tokens.length && to < from + 7 && this.tokens[to]?.kind !== 'edge' && this.tokens[to]?.figure?.kind !== 'amount') {
      to += 1;
    }
    const near = stated(from, to) ?? stated(this.since(index), index);
    if (near !== null) {
      return near === 'each' ? null : near;
    }
    // Then its sentence: nothing of each, and a total's word or the rows in the plural, states a total.
    const start = this.sentenceStart(index);
    const words = this.tokens.slice(start, index).filter((token) => token.kind === 'word').map((token) => token.text);
    if (words.some((word) => word === 'each' || word === 'every' || word === 'per' || word === 'apiece')) {
      return null;
    }
    return total(start, index) || words.some((word) => this.vocab.PLURAL_ROWS.has(word)) ? 'total' : null;
  }

  /** The token after an amount's own words of what it is stated per, right after it ("$30.00 per line", "$90.00 in all", "$50.00 each"). */
  private scopeEnd(index: number): number {
    const total = this.cues(index + 1, index + 3, this.vocab.TOTAL_WORDS).find((match) => match.start === index + 1);
    if (total !== undefined) {
      return total.end + 1;
    }
    if (this.word(index, 1) === 'apiece' || this.word(index, 1) === 'each') {
      return index + 2;
    }
    return this.vocab.EACH.has(this.word(index, 1)) && (this.vocab.ONE_LINE.has(this.word(index, 2)) || this.vocab.ONE_UNIT.has(this.word(index, 2))) ? index + 3 : index + 1;
  }

  /** Units, each line's when "each line", "per line" or "apiece" is beside them, and what they are stated per. */
  private units(index: number, after: number): Pick<NumberRole, 'roles' | 'scope'> {
    const scope = this.scope(index, after);
    return scope === 'line' ? { roles: ['line_units'], scope } : { roles: ['units'], scope: scope === 'total' ? 'total' : null };
  }

  private counted(index: number, counted: Counted): Pick<NumberRole, 'roles' | 'scope'> {
    return counted.roles[0] === 'units' ? this.units(index, counted.end) : { roles: counted.roles, scope: null };
  }

  /** A count's noun and the counts it may be, when `word` (token `at`) is one. */
  private noun(word: string, at: number): Counted | undefined {
    const roles = this.vocab.COUNT_NOUNS.get(word);
    return roles === undefined ? undefined : { noun: word, roles, end: at + 1 };
  }

  /** The count's noun right after token `index`: at once, after a code or digits, or after one word that keeps it the count. */
  private countNoun(index: number): Counted | undefined {
    const first = this.at(index, 1);
    const between = first?.kind === 'figure' || (first?.kind === 'word' && !this.vocab.NOT_THE_COUNT.has(first.text));
    return this.noun(this.word(index, 1), index + 1) ?? (between ? this.noun(this.word(index, 2), index + 2) : undefined);
  }

  /** "N of [the] [M] [word] noun": the noun of a partitive, and its second number; "N of them": the lines, claims or patients. */
  private partitive(index: number): (Counted & { readonly of: string | null }) | undefined {
    if (this.word(index, 1) !== 'of') {
      return undefined;
    }
    const determiner = this.vocab.PARTITIVE_DETERMINERS.has(this.word(index, 2)) ? 1 : 0;
    const second = this.at(index, 2 + determiner);
    const count = second?.kind === 'figure' ? 1 : 0;
    const at = index + 2 + determiner + count;
    const first = this.word(index, 2 + determiner + count);
    const found = this.noun(first, at) ?? (first === '' ? undefined : this.noun(this.word(index, 3 + determiner + count), at + 1));
    if (found !== undefined) {
      return { ...found, of: count === 1 ? numeral(second?.figure) : null };
    }
    // "2 of them", "2 of these": a part of the lines, the claims or the patients.
    return this.vocab.PARTITIVE_PRONOUNS.has(this.word(index, 2)) ? { noun: this.word(index, 2), roles: ['lines', 'claims', 'patients'], end: index + 3, of: null } : undefined;
  }

  /** "Of [the] [M] noun, N ...": a partitive the sentence opens with, for the number after its comma. */
  private frontedPartitive(index: number): (Counted & { readonly of: string | null }) | undefined {
    if (this.at(index, -1)?.text !== ',') {
      return undefined;
    }
    const start = this.sentenceStart(index);
    const words = this.tokens.slice(start, index - 1);
    if (words[0]?.text !== 'of' || words.some((token) => token.kind === 'edge')) {
      return undefined;
    }
    const last = words.at(-1);
    const found = last?.kind === 'word' ? this.noun(last.text, index) : undefined;
    const figures = words.filter((token) => token.kind === 'figure');
    return found === undefined || figures.length > 1 ? undefined : { ...found, of: numeral(figures[0]?.figure) };
  }

  /** The label word before token `index`, past "no." or "number". */
  private labelBefore(index: number): string {
    const before = this.word(index, -1);
    return this.vocab.LABEL_FILLERS.has(before) ? this.word(index, -2) : before;
  }

  /** "days" after the count at token `index` (past its digits, as in "thirty (30) days", and a kind of day), and the token after it. */
  private daysAfter(index: number, figure: Figure): { readonly days: boolean; readonly business: boolean; readonly end: number } {
    // "thirty (30) days": the digits after the words are the same count.
    const offset = this.at(index, 1)?.figure?.value === figure.value ? 2 : 1;
    const basis = this.word(index, offset);
    const at = this.vocab.DAY_BASES.has(basis) ? offset + 1 : offset;
    const kind = this.word(index, at);
    return { days: kind === 'day' || kind === 'days', business: basis === 'business' || basis === 'working', end: index + at + 1 };
  }

  /** A whole number from 1900 to 2199, in four digits or in words, after a year's word or before a year's noun, and never a count of a noun that names no date. */
  private isYear(index: number, figure: Figure): boolean {
    const written = this.text.slice(figure.start, figure.end);
    if (!/^(?:19|20|21)\d\d$/.test(figure.value) || !(/^\d{4}$/.test(written) || /^[a-z]/i.test(written))) {
      return false;
    }
    const counted = this.countNoun(index);
    if (counted !== undefined && cueAt([counted.noun], 0, this.vocab.DATE_CUES) === undefined) {
      return false;
    }
    const before = this.word(index, -1);
    return this.vocab.YEAR_LEADS.has(before) || this.at(index, -1)?.possessive === true || this.vocab.YEAR_NOUNS.has(this.word(index, 1)) || (before === 'the' && counted !== undefined);
  }

  /** The roles a number's words give it: null for none, 'prose' for prose, 'year' for a year. */
  private numberRole(index: number, token: Token, figure: Figure, shape: 'number' | 'code' | 'decimal'): NumberRole | 'prose' | 'year' | null {
    // Business days are a day count's alone, and a code a count's.
    const role = (roles: readonly FigureRole[], extra: Partial<NumberRole> = {}): NumberRole => ({ roles, business: false, code: false, scope: null, part: null, ...extra });
    const written = this.text.slice(figure.start, figure.end);
    const ordinal = shape !== 'decimal' && isOrdinal(written, this.vocab);
    if (/^[x×]/.test(written)) {
      return role(['line_units'], { scope: 'line' });
    }
    // An ordinal before another number: "the first 3 claims".
    if (ordinal && this.at(index, 1)?.kind === 'figure') {
      return 'prose';
    }
    const labelWord = this.labelBefore(index);
    const label = this.vocab.LABELS.get(labelWord);
    if (label !== undefined && (shape !== 'decimal' || label[0] === 'line_units') && !(this.vocab.VERB_LABELS.has(labelWord) && this.countNoun(index) !== undefined)) {
      return role(label === 'page' ? this.pageRoles(index) : label, label[0] === 'line_units' ? { scope: 'line' } : {});
    }
    const colon = this.at(index, -1)?.text === ':' && shape === 'number' ? [-2, -3, -4].map((offset) => this.vocab.COUNT_NOUNS.get(this.word(index, offset))).find((roles) => roles !== undefined) : undefined;
    if (colon !== undefined) {
      const found = colon[0] === 'units' ? this.units(index, index + 1) : { roles: colon, scope: null };
      return role(found.roles, { scope: found.scope });
    }
    const days = this.daysAfter(index, figure);
    if (days.days) {
      return { roles: days.business ? ['days_to_pay'] : this.dayRoles(index, days.end), business: days.business, code: false, scope: null, part: null };
    }
    const next = this.word(index, 1);
    if (shape !== 'decimal' && this.vocab.LEVEL_WORDS.has(next)) {
      // "a second-level appeal" is a level; "the second appeal" an ordinal's prose.
      return ordinal && (next === 'appeal' || next === 'appeals') ? 'prose' : role(['level']);
    }
    if (shape !== 'decimal' && this.isYear(index, figure)) {
      return 'year';
    }
    // A possessive is no count of the noun after it: "Patient 2's line".
    const counted = token.possessive ? undefined : this.countNoun(index);
    if (counted !== undefined) {
      if (ordinal) {
        const row = this.vocab.ORDINAL_NOUNS.get(counted.noun);
        // An ordinal before a singular row's noun is that row; before another noun ("the sixth unit"), prose.
        if (row !== undefined) {
          return role([row]);
        }
        if (counted.roles[0] === 'units') {
          return 'prose';
        }
      }
      this.ends.set(index, counted.end);
      const before = this.at(index, -1);
      const code = before === undefined || before.kind === 'figure' || this.vocab.CODE_MODIFIER_LEADS.has(this.word(index, -1));
      return { ...role([]), ...this.counted(index, counted), code };
    }
    // An ordinal after a determiner before any other word: "the fifth dispute".
    if (ordinal && this.at(index, 1)?.kind === 'word' && this.vocab.ORDINAL_DETERMINERS.has(this.word(index, -1))) {
      return 'prose';
    }
    if (shape === 'decimal') {
      return null;
    }
    const partitive = token.possessive ? undefined : this.partitive(index);
    if (partitive !== undefined) {
      return role(this.counted(index, partitive).roles, { part: { of: partitive.of } });
    }
    if (shape === 'code') {
      return null;
    }
    const row = this.vocab.ROW_LABELS.get(this.labelBefore(index));
    if (row !== undefined) {
      return role([row]);
    }
    const fronted = this.frontedPartitive(index);
    if (fronted !== undefined) {
      return role(fronted.roles[0] === 'units' ? ['units'] : fronted.roles, { part: { of: fronted.of } });
    }
    return this.listed(index);
  }

  /**
   * A number after another read in a role, with only a list's words between, keeps that role: "pages 1 and 2", "lines
   * 1 to 3", "lines 1–3", "in 2026 and 2027". Across a comma alone, only after a plural label or while the list goes on
   * ("rows 1, 2 and 3"), never where the comma starts a clause ("Under version 1, 2 of them").
   */
  private listed(index: number): NumberRole | null {
    const between = this.run(index, -1, (token) => token.kind === 'figure');
    const head = index - between.length - 1;
    const previous = this.readings.get(head);
    if (between.length === 0 || !between.every((text) => this.vocab.LIST_JOINERS.has(text)) || previous === undefined || previous === null) {
      return null;
    }
    if (between.some((text) => text !== ',')) {
      return previous;
    }
    // A comma alone: the list's first label plural, or the list going on after this number.
    let first = head;
    for (;;) {
      const gap = this.run(first, -1, (token) => token.kind === 'figure');
      const before = first - gap.length - 1;
      if (before < 0 || gap.length === 0 || !gap.every((text) => this.vocab.LIST_JOINERS.has(text)) || (this.readings.get(before) ?? null) === null) {
        break;
      }
      first = before;
    }
    const plural = this.vocab.PLURAL_LABELS.has(this.labelBefore(first));
    const goesOn = this.vocab.LIST_CONTINUERS.has(this.at(index, 1)?.text ?? '') && this.tokens.slice(index + 1, index + 4).some((token) => token.kind === 'figure');
    return plural || goesOn ? previous : null;
  }

  private pageRoles(index: number): readonly FigureRole[] {
    const before = this.run(index, -1, notWord).length;
    const after = this.run(index, 1, notWord).length;
    const found = this.entries([...this.cues(index - before, index, this.vocab.PAGE_CUES), ...this.cues(index + 1, index + 1 + after, this.vocab.PAGE_CUES)], 'page');
    const specific = ordered(found.filter((entry) => entry.roles.length === 1).flatMap((entry) => entry.roles));
    return specific.length === 1 ? specific : ['citation_page', 'window_page'];
  }

  /** Which day count: the cue right after "days", else the nearest before since the figure before, else after, else any. */
  private dayRoles(index: number, daysEnd: number): readonly FigureRole[] {
    const cues = this.vocab.DAY_CUES;
    const words = this.run(daysEnd - 1, 1, notWord);
    const right = cueAt(words, 0, cues);
    // The day count keeps "days", its cue and an anchor's three words ("days after the payment date") for itself.
    let end = daysEnd + (right?.[0].split(' ').length ?? 0);
    if (this.vocab.DAY_ANCHORS.has(this.word(end, 0))) {
      end += 1;
      for (let taken = 0; taken < 3 && this.tokens[end]?.kind === 'word'; taken += 1) {
        end += 1;
      }
    }
    this.ends.set(index, end);
    const found =
      (right === undefined ? null : { roles: ordered(right[1]), every: false }) ??
      this.nearestCue(this.ownFrom(index), index, 'day', cues) ??
      (() => {
        const after = this.cues(daysEnd, this.nextBreak(daysEnd - 1, 'all'), cues).sort((a, b) => a.start - b.start)[0];
        return after === undefined ? null : { roles: ordered(after.roles), every: false };
      })() ??
      this.everyCue([[this.since(index), this.ownFrom(index)]], 'day', cues);
    return found === null || found.roles === 'any' ? ['window_days', 'days_to_pay', 'days_late'] : found.roles;
  }

  /** A date's (a month's, a day of a month's) or a year's roles, a year before a fee schedule's noun the schedule's. */
  private dateRoles(index: number, kind: ReadKind): Cued {
    if (kind === 'year' && this.vocab.SCHEDULE_NOUNS.has(this.word(index, 1))) {
      return { roles: ['schedule_year'], every: false };
    }
    return this.role(index, 'date', this.vocab.DATE_CUES);
  }

  read(index: number, figure: Figure): FigureReading {
    const token = this.tokens[index] as Token;
    const written = this.text.slice(figure.start, figure.end);
    const reading = (kind: ReadKind, value: string, roles: FigureReading['roles'], extra: Partial<Omit<FigureReading, 'figure' | 'kind' | 'value' | 'roles' | 'token'>> = {}): FigureReading => ({
      figure,
      kind,
      value,
      roles,
      every: extra.every ?? false,
      scope: extra.scope ?? null,
      part: extra.part ?? null,
      code: extra.code ?? '',
      business: extra.business ?? false,
      prose: extra.prose ?? false,
      token: index,
    });
    const cued = (family: Family, found: Cued) => {
      this.families.set(index, family);
      this.cued.set(index, found);
      return found;
    };
    const asNumber = (found: NumberRole | 'prose' | 'year' | null, value: string, code: string): FigureReading => {
      // A list after a year keeps its role: a year too ("in 2026 and 2027").
      if (found === 'year' || (found !== null && found !== 'prose' && found.roles.length === 0)) {
        this.readings.set(index, { roles: [], business: false, code: false, scope: null, part: null });
        const year = cued('date', this.dateRoles(index, 'year'));
        return reading('year', value, year.roles, { every: year.every });
      }
      this.readings.set(index, found === 'prose' ? null : found);
      if (found === null || found === 'prose') {
        this.families.set(index, null);
        return reading('number', value, 'none', { prose: found === 'prose' || written.toLowerCase() === 'first' });
      }
      const family = found.roles.some((role) => role === 'window_days' || role === 'days_to_pay' || role === 'days_late') ? 'day' : null;
      this.families.set(index, family);
      if (family === 'day') {
        this.cued.set(index, { roles: found.roles, every: false });
      }
      return reading('number', value, found.roles, { code: found.code ? code : '', business: found.business, scope: found.scope, part: found.part });
    };
    switch (figure.kind) {
      case 'number':
        return asNumber(this.numberRole(index, token, figure, 'number'), figure.value, '');
      case 'code': {
        const found = /^\d+$/.test(figure.value) ? this.numberRole(index, token, figure, 'code') : null;
        if (found === null || found === 'prose') {
          this.families.set(index, null);
          return reading('code', figure.value, 'none');
        }
        return asNumber(found, canonicalNumber(figure.value), figure.value);
      }
      case 'amount': {
        const found = written.includes('$') ? null : this.numberRole(index, token, figure, 'decimal');
        if (found === null || found === 'prose' || found === 'year') {
          const amount = cued('amount', this.role(index, 'amount', this.vocab.AMOUNT_CUES));
          const scope = this.scope(index, index + 1);
          this.ends.set(index, this.scopeEnd(index));
          return reading('amount', figure.value, amount.roles, { every: amount.every, scope });
        }
        return asNumber(found, canonicalNumber(written), '');
      }
      case 'percent': {
        const percent = cued('percent', this.role(index, 'percent', this.vocab.PERCENT_CUES));
        return reading('percent', figure.value, percent.roles, { every: percent.every });
      }
      case 'date':
      case 'month':
      case 'month_day': {
        const date = cued('date', this.dateRoles(index, figure.kind));
        return reading(figure.kind, figure.value, date.roles, { every: date.every });
      }
      case 'modifier':
      case 'identifier':
        this.families.set(index, null);
        return reading(figure.kind, figure.value, 'none');
    }
  }
}

/** Reads every figure of `text` (as readableText gives it) in its role, and its tokens as quotedHolds() compares them. */
export function readFigures(text: string): ReadText {
  const vocab = vocabulary();
  const tokens = tokenize(text, vocab);
  const reader = new Reader(text, tokens, vocab);
  const readings = tokens.flatMap((token, index) => (token.figure === undefined ? [] : [reader.read(index, token.figure)]));
  return { readings, tokens: tokens.map((token) => (token.kind === 'edge' ? '|' : token.kind === 'word' ? `w:${token.text}` : token.text)) };
}

/** A quoted text's tokens, as quotedHolds() compares a narrative's figure with them. */
export function quotedTokens(text: string): readonly string[] {
  return readFigures(text).tokens;
}

/** A quoted text as quotedHolds() compares a narrative's figure with it: its tokens and the roles its own words give each figure. */
export function quotedText(text: string): QuotedText {
  const read = readFigures(text);
  return { tokens: read.tokens, roles: new Map(read.readings.map((reading) => [reading.token, { roles: reading.roles, every: reading.every }])) };
}

/** Words that carry no meaning of their own: a quoted figure is never held by one of them alone. */
export function functionWords(): ReadonlySet<string> {
  return vocabulary().FUNCTION_WORDS;
}

/**
 * Whether a quoted text repeats a figure with the words around it (docs/adr/0086): a quoted figure is never an input
 * of a role, only a repetition of the quote. `narrative` is the narrative's tokens and `figure` the figure as read (its
 * token and roles); `quote` a quoted text (quotedText()), and `functionWords` functionWords()'s. From each place
 * the quote holds the same figure, the tokens are compared outward on both sides until they differ or the quote's
 * clause ends (an edge of the quote, which counts as reached only where the narrative's clause ends too).
 *
 * - A figure in a role (`inRole`: its words name one) repeats the quote only where the quote's own words give it that
 *   role, and then only with four of its tokens or more, the one after it among them unless both clauses end there,
 *   or with the whole of a quoted clause and nothing more: "This is a level 2 appeal" does not repeat "A level 2
 *   appeal is raised within 90 days", nor "Disputes are raised within 33 days of receipt" the statute's "paid within 33
 *   days of receipt", nor "4 claims a year" the clause's "up to 12 units, 4 claims a year" after other words.
 * - A figure in no role repeats it with the word before it, when that word means something ("Section 4", "GROUP
 *   77"), with two of its tokens, one of them meaning something, or with both clauses ending on one side and a token
 *   matched on the other. A bare figure that fills a quoted clause ("see sections 4, 24, 90") repeats nothing.
 */
export function quotedHolds(narrative: readonly string[], figure: Pick<FigureReading, 'token' | 'roles' | 'every'>, quote: QuotedText, inRole: boolean, functionWords: ReadonlySet<string>): boolean {
  // A figure means something; a word does unless it is a function word.
  const meaning = (token: string) => !functionWords.has(token.slice(2));
  const { token: at, roles, every } = figure;
  const key = narrative[at];
  const edge = (token: string | undefined) => token === undefined || token === '|';
  return quote.tokens.some((token, place) => {
    if (token !== key) {
      return false;
    }
    const side = (step: number) => {
      const matched: string[] = [];
      for (let offset = step; ; offset += step) {
        const quoted = quote.tokens[place + offset];
        if (edge(quoted)) {
          return { matched, edge: edge(narrative[at + offset]) };
        }
        if (narrative[at + offset] !== quoted) {
          return { matched, edge: false };
        }
        matched.push(quoted as string);
      }
    };
    const left = side(-1);
    const right = side(1);
    const count = left.matched.length + right.matched.length;
    if (inRole) {
      const own = quote.roles.get(place)?.roles;
      const agrees = Array.isArray(own) && Array.isArray(roles) && (every ? roles.every((role) => own.includes(role)) : roles.some((role) => own.includes(role)));
      return agrees && ((left.edge && right.edge) || (count >= 4 && (right.edge || right.matched.length > 0)));
    }
    const label = left.matched[0];
    return (
      (label?.startsWith('w:') === true && meaning(label)) ||
      (count >= 2 && [...left.matched, ...right.matched].some(meaning)) ||
      (left.edge && right.matched.length > 0) ||
      (right.edge && left.matched.length > 0)
    );
  });
}

import type { Cues, Vocabulary } from '../roles-words';
import { type Figure, canonicalNumber, scanText } from '../scan';
import { FIGURE_ROLES, type FigureReading, type FigureRole, type Scope, type Token, type TokenKind } from './kinds';

/**
 * The role reader's walk over a text (../roles.ts; docs/adr/0086): the text as tokens, the helpers every layer of
 * the reader shares, and the reader's first layer, Walk, which holds what it has read so far and finds where things
 * are among the tokens (a sentence's start and end, the figure before, a clause's start). The reader is built in
 * layers, a file each, each mutated in a shard of its own (stryker/shards.json): Walk (this file), CueReader
 * (./cues.ts), NumberReader (./numbers.ts) and the reader itself (../roles.ts).
 */

/** How a figure is compared beside its words: its kind's family and its value. */
export function figureKey(figure: Figure): string {
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
export const isNumeral = (figure: Figure) => figure.kind === 'number' || (figure.kind === 'code' && /^\d+$/.test(figure.value));

export function tokenize(text: string, vocab: Vocabulary): Token[] {
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
  scan.figures.forEach((figure, at) => {
    const next = scan.figures[at + 1];
    if (next !== undefined && isNumeral(figure) && isNumeral(next) && /^\s*[–—-]\s*$/.test(text.slice(figure.end, next.start))) {
      words.push(make('word', '–', figure.end, figure.end));
    }
  });
  // A period ends a clause only before a space or the text's end, and never after one letter or an abbreviation.
  const abbreviation = (start: number) => words.some((word) => word.end === start && (word.text.length === 1 || vocab.ABBREVIATED.has(word.text)));
  const edges = [...text.matchAll(vocab.EDGES)]
    .filter((match) => free(match.index, match.index + 1) && !(match[0] === '.' && (/\S/.test(text.charAt(match.index + 1)) || abbreviation(match.index))))
    .map((match) => make('edge', match[0], match.index, match.index));
  // No two tokens start at one place: a figure, a placeholder and a word are never inside one another, an edge is outside
  // them all, and a range's "–" is at its first number's end, before the dash.
  return [...figures, ...words, ...edges].sort((a, b) => a.start - b.start);
}

/** Whether a figure is written as an ordinal: "3rd", "second", "twenty-first". */
export function isOrdinal(written: string, vocab: Vocabulary): boolean {
  const lower = written.toLowerCase();
  return /\d(?:st|nd|rd|th)/.test(lower) || [...vocab.ORDINAL_WORDS].some((word) => lower.endsWith(word));
}

/** Whether `phrase`'s words are the words from word `at` on. */
export function phraseAt(words: readonly string[], at: number, phrase: string): boolean {
  return phrase.split(' ').every((part, offset) => words[at + offset] === part);
}

/** The cue that starts at word `at`, the longest first (each list holds a longer cue before a shorter one it starts like). */
export function cueAt(words: readonly string[], at: number, cues: Cues): Cues[number] | undefined {
  return cues.find(([phrase]) => phraseAt(words, at, phrase));
}

/** A count's noun, and the counts it may be. */
export interface Counted {
  readonly noun: string;
  readonly roles: readonly FigureRole[];
  /** The token after the noun. */
  readonly end: number;
}

/** What a number's words make it. */
export interface NumberRole {
  readonly roles: readonly FigureRole[];
  readonly business: boolean;
  /** A five-digit figure before a noun that may be the noun's procedure code. */
  readonly code: boolean;
  readonly scope: Scope | null;
  readonly part: FigureReading['part'];
}

/** The families of figures whose role comes from cues and the steps of ../roles.ts (a day count's and a page's are of none). */
export type Family = 'amount' | 'percent' | 'date';

/** A cue's roles as resolved for a figure. */
export interface Cued {
  readonly roles: readonly FigureRole[] | 'any';
  readonly every: boolean;
}

/** A cue found among a text's tokens: from token `start` to token `end`, of `size` words. */
export interface Match {
  readonly start: number;
  readonly end: number;
  readonly size: number;
  readonly phrase: string;
  readonly roles: readonly FigureRole[];
}

export const ANY: Cued = { roles: 'any', every: false };
/** One cue's roles, in FIGURE_ROLES's order: held in any of them. */
export const one = (roles: Iterable<FigureRole>): Cued => ({ roles: ordered(roles), every: false });
/** A partitive's second number as a plain decimal, when it is one. */
export const numeral = (figure: Figure | undefined): string | null => (figure !== undefined && isNumeral(figure) ? canonicalNumber(figure.value) : null);
export const notWord = (token: Token) => token.kind !== 'word';
export const ordered = (roles: Iterable<FigureRole>): FigureRole[] => {
  const set = new Set(roles);
  return FIGURE_ROLES.filter((role) => set.has(role));
};
/** The nearest of the cues, the longer at the same end. */
export const nearest = <T extends { readonly match: Match }>(entries: readonly T[]): T | undefined =>
  entries.reduce<T | undefined>((best, entry) => (best === undefined || entry.match.end > best.match.end || (entry.match.end === best.match.end && entry.match.size > best.match.size) ? entry : best), undefined);

/** A cue as it counts in its stretch of words: its own roles, or those another cue beside it makes them. */
export interface Entry {
  readonly match: Match;
  readonly roles: readonly FigureRole[];
}

/** The reader's first layer: what it has read so far, and where things are among the tokens. */
export class Walk {
  /** Each number read so far in a role, or as a year: what a list after it keeps (listed()). */
  protected readonly readings = new Map<number, NumberRole | 'year'>();
  /** Each figure read so far whose role comes from cues: its family and its cued roles. */
  protected readonly families = new Map<number, Family>();
  protected readonly cued = new Map<number, Cued>();
  /** The token after the words a figure keeps for itself ("3650 days after payment", "3 claims"). */
  protected readonly ends = new Map<number, number>();

  constructor(
    protected readonly text: string,
    protected readonly tokens: readonly Token[],
    protected readonly vocab: Vocabulary,
  ) {}

  protected at(index: number, offset: number): Token | undefined {
    return this.tokens[index + offset];
  }

  /** The word `offset` from token `index`, or nothing when the token there is no word. */
  protected word(index: number, offset: number): string {
    const token = this.at(index, offset);
    return token?.kind === 'word' ? token.text : '';
  }

  /** The tokens' texts from token `index` on, a step at a time (nearest first), up to the first that `stops`. */
  protected run(index: number, step: 1 | -1, stops: (token: Token) => boolean): string[] {
    const tokens = step === 1 ? this.tokens.slice(index + 1) : this.tokens.slice(0, index).reverse();
    const end = tokens.findIndex(stops);
    return tokens.slice(0, end === -1 ? tokens.length : end).map((token) => token.text);
  }

  /** Whether token `index` ends a sentence or a clause a comma or colon does not (a period, "!", "?", ";", a blank line). */
  protected stop(index: number): boolean {
    const token = this.tokens[index];
    return token?.kind === 'edge' && token.text !== ',' && token.text !== ':';
  }

  /** The first token of token `index`'s sentence (after a period, "!", "?", ";" or a blank line). */
  protected sentenceStart(index: number): number {
    let at = index - 1;
    while (at >= 0 && !this.stop(at)) {
      at -= 1;
    }
    return at + 1;
  }

  /** The token that ends token `index`'s sentence (its stop, or the text's end). */
  protected sentenceEnd(index: number): number {
    let at = index + 1;
    while (at < this.tokens.length && !this.stop(at)) {
      at += 1;
    }
    return at;
  }

  /** The figure before token `index` in its sentence, or -1. */
  protected previousFigure(index: number): number {
    for (let at = index - 1; at >= this.sentenceStart(index); at -= 1) {
      if (this.tokens[at]?.kind === 'figure') {
        return at;
      }
    }
    return -1;
  }

  /** The first token after token `index` that is a figure or an edge, a comma or a colon only when `commas`. */
  protected nextBreak(index: number, commas: boolean): number {
    let at = index + 1;
    for (const token of this.tokens.slice(at)) {
      if (token.kind === 'figure' || (token.kind === 'edge' && (commas || this.stop(at)))) {
        return at;
      }
      at += 1;
    }
    return at;
  }

  /** The token after the words the figure at token `index` keeps for itself (its own token's next when none). */
  protected end(index: number): number {
    return this.ends.get(index) ?? index + 1;
  }

  /** Where token `index`'s words since the figure before it start: after that figure's own words, or at the sentence's start. */
  protected since(index: number): number {
    const previous = this.previousFigure(index);
    return previous === -1 ? this.sentenceStart(index) : Math.min(this.end(previous), index);
  }

  /** The start of token `index`'s own clause: after the last comma or colon since the figure before it. */
  protected ownFrom(index: number): number {
    const from = this.since(index);
    for (let at = index - 1; at >= from; at -= 1) {
      if (this.tokens[at]?.kind === 'edge') {
        return at + 1;
      }
    }
    return from;
  }
}

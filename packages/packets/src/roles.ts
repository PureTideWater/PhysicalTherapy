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
 * citation markers are left out. A figure's role comes from the words beside it, in order:
 *
 * - a label before it: "page 2", "version 1", "release 900001", "level 2", "97110 x 2" (each line's units);
 * - a label before a colon: "Units billed: 2";
 * - "days" after it ("3650 days", "3650 calendar days", "3650-day", "thirty (30) days"); which day count the words
 *   around it name: the dispute window's ("within", "dispute"), the days a payer has to pay ("to pay", "prompt-pay")
 *   or the days a payment was late ("late", "overdue", "accrues"), and with none of those any of the three;
 *   "business days" or "working days" only where the record counts business days;
 * - "level" or "appeal" after it: "a second-level appeal";
 * - a year: a whole number from 1900 to 2199 after "in", "during", "since", "for", a possessive, "its", "this", CY,
 *   FY or "year", or before a year's noun ("2026 rates", "the 2026 fee schedule"), and after "the" before a count's
 *   noun too ("the 2026 claims");
 * - a count's noun after it, at once, after a code or after one word that does not make it some other count ("3
 *   lines", "4 denied claims", "3 97110 lines", "2-unit line"); "units" with "each line" or "per line" beside it is
 *   each line's units; an ordinal before a singular noun is that row ("the second line", "the third claim"); a
 *   partitive gives both numbers the noun's role ("2 of the 3 claims", "3 of 3 lines");
 * - a row's noun before it: "line 2", "claims 1 through 3";
 * - a list after a label keeps the label's role: "pages 1 and 2", "lines 1 to 3", "in 2026 and 2027".
 *
 * Any other number has no role. A five-digit figure is a procedure code unless its words make it a number: a label,
 * "days", "level", or a count's noun; before a noun with an article or preposition before it ("the 97110 lines") it
 * may be either. Two decimals without a dollar sign before a count's noun or "days" are a number ("1.25 units").
 *
 * Amounts, percentages and dates take every role a cue names between the figure before them in the sentence and
 * themselves, and the role of the noun right after them ("the $30.00 difference"); with no cue, any role of their
 * kind. "first" with no role is prose, as "one" and "zero" are.
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

/** What a figure is read as: the scanner's kinds, and a year (a number the words make a year). */
export type ReadKind = FigureKind | 'year';

/**
 * A figure as read: its kind and value, and the roles its words give it (any of them), `any` when its words name no
 * role of its kind (an amount, percentage or date with no cue), or `none` for a number with no role.
 */
export interface FigureReading {
  readonly figure: Figure;
  readonly kind: ReadKind;
  readonly value: string;
  readonly roles: readonly FigureRole[] | 'any' | 'none';
  /** A five-digit figure before a count's noun, after an article or a preposition: the procedure code it may also be ('' for none). */
  readonly code: string;
  /** A day count stated in business or working days. */
  readonly business: boolean;
  /** "first" with no role: prose, as "one" is. */
  readonly prose: boolean;
  /** Where the figure is among the text's tokens (quotedHolds() compares the words around it). */
  readonly token: number;
}

/** A text read: its figures with their roles, and its tokens as quotedHolds() compares them (an edge is "|"). */
export interface ReadText {
  readonly readings: readonly FigureReading[];
  readonly tokens: readonly string[];
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
  // A period ends a clause only before a space or the text's end, and never after one letter or an abbreviation.
  const abbreviation = (start: number) => words.some((word) => word.end === start && (word.text.length === 1 || vocab.ABBREVIATED.has(word.text)));
  const edges = [...text.matchAll(vocab.EDGES)]
    .filter((match) => free(match.index, match.index + 1) && !(match[0] === '.' && (/\S/.test(text.charAt(match.index + 1)) || abbreviation(match.index))))
    .map((match) => make('edge', match[0], match.index, match.index));
  return [...figures, ...words, ...edges].sort((a, b) => a.start - b.start);
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

/** The roles a sequence of words names, each cue's words passed once it is read. */
function cueRoles(words: readonly string[], cues: Cues): Set<FigureRole> {
  const roles = new Set<FigureRole>();
  let next = 0;
  words.forEach((_, at) => {
    const cue = at < next ? undefined : cueAt(words, at, cues);
    if (cue !== undefined) {
      cue[1].forEach((role) => roles.add(role));
      next = at + cue[0].split(' ').length;
    }
  });
  return roles;
}

/** A count's noun, and the counts it may be. */
interface Counted {
  readonly noun: string;
  readonly roles: readonly FigureRole[];
}

interface NumberRole {
  readonly roles: readonly FigureRole[];
  readonly business: boolean;
  /** A five-digit figure before a noun that may be the noun's procedure code. */
  readonly code: boolean;
}

const notWord = (token: Token) => token.kind !== 'word';

class Reader {
  private readonly readings = new Map<number, NumberRole | null>();

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

  /** The words between the figures or edges around token `index`, in order. */
  private clause(index: number): string[] {
    return [...this.run(index, -1, notWord).reverse(), ...this.run(index, 1, notWord)];
  }

  /** The words (and commas and colons) since the figure before, or the clause's start, in order. */
  private since(index: number): string[] {
    return this.run(index, -1, (token) => token.kind === 'figure' || (token.kind === 'edge' && token.text !== ',' && token.text !== ':')).reverse();
  }

  /** The roles of the cue right after token `index`, past "in" or "of" ("$30.00 difference", "$30.00 in interest"). */
  private after(index: number, cues: Cues): FigureRole[] {
    const words = this.run(index, 1, notWord);
    const from = words[0] === 'in' || words[0] === 'of' ? 1 : 0;
    return [...(cueAt(words, from, cues)?.[1] ?? [])];
  }

  private cued(index: number, cues: Cues, extra: readonly FigureRole[] = []): readonly FigureRole[] | 'any' {
    const roles = new Set([...cueRoles(this.since(index), cues), ...this.after(index, cues), ...extra]);
    return roles.size === 0 ? 'any' : FIGURE_ROLES.filter((role) => roles.has(role));
  }

  /** A percentage's words after it, six at most up to an edge, past a year ("of the 2026 Medicare fee schedule"). */
  private percentAfter(index: number): FigureRole[] {
    return [...cueRoles(this.run(index, 1, (token) => token.kind === 'edge').slice(0, 6), this.vocab.PERCENT_CUES)];
  }

  /** Units, or each line's units when "each line", "per line" or "apiece" is beside them. */
  private units(index: number): readonly FigureRole[] {
    const words = this.clause(index);
    const each = words.some((word, at) => word === 'apiece' || (this.vocab.EACH.has(word) && words.slice(at + 1, at + 3).some((ahead) => this.vocab.ONE_LINE.has(ahead))));
    return each ? ['line_units'] : ['units'];
  }

  private nounRoles(index: number, roles: readonly FigureRole[]): readonly FigureRole[] {
    return roles[0] === 'units' ? this.units(index) : roles;
  }

  /** A count's noun and the counts it may be, when `word` is one. */
  private noun(word: string): Counted | undefined {
    const roles = this.vocab.COUNT_NOUNS.get(word);
    return roles === undefined ? undefined : { noun: word, roles };
  }

  /** The count's noun right after token `index`: at once, after a code or digits, or after one word that keeps it the count. */
  private countNoun(index: number): Counted | undefined {
    const first = this.at(index, 1);
    const between = first?.kind === 'figure' || (first?.kind === 'word' && !this.vocab.NOT_THE_COUNT.has(first.text));
    return this.noun(this.word(index, 1)) ?? (between ? this.noun(this.word(index, 2)) : undefined);
  }

  /** "N of [the] [M] [word] noun": the noun of a partitive. */
  private partitive(index: number): Counted | undefined {
    if (this.word(index, 1) !== 'of') {
      return undefined;
    }
    const determiner = this.vocab.PARTITIVE_DETERMINERS.has(this.word(index, 2)) ? 1 : 0;
    const count = this.at(index, 2 + determiner)?.kind === 'figure' ? 1 : 0;
    const first = this.word(index, 2 + determiner + count);
    return this.noun(first) ?? (first === '' ? undefined : this.noun(this.word(index, 3 + determiner + count)));
  }

  /** The label word before token `index`, past "no." or "number". */
  private labelBefore(index: number): string {
    const before = this.word(index, -1);
    return this.vocab.LABEL_FILLERS.has(before) ? this.word(index, -2) : before;
  }

  private daysAfter(index: number, figure: Figure): { readonly days: boolean; readonly business: boolean } {
    // "thirty (30) days": the digits after the words are the same count.
    const offset = this.at(index, 1)?.figure?.value === figure.value ? 2 : 1;
    const basis = this.word(index, offset);
    const kind = this.vocab.DAY_BASES.has(basis) ? this.word(index, offset + 1) : basis;
    return { days: kind === 'day' || kind === 'days', business: basis === 'business' || basis === 'working' };
  }

  /** A whole number from 1900 to 2199, in four digits or in words, after a year's word or before a year's noun. */
  private isYear(index: number, figure: Figure): boolean {
    const written = this.text.slice(figure.start, figure.end);
    if (!/^(?:19|20|21)\d\d$/.test(figure.value) || !(/^\d{4}$/.test(written) || /^[a-z]/i.test(written))) {
      return false;
    }
    const before = this.word(index, -1);
    const after = this.word(index, 1);
    return (
      this.vocab.YEAR_LEADS.has(before) ||
      this.at(index, -1)?.possessive === true ||
      this.vocab.YEAR_NOUNS.has(after) ||
      (before === 'the' && this.vocab.COUNT_NOUNS.has(after))
    );
  }

  /** The roles a number's words give it, or null for none. */
  private numberRole(index: number, token: Token, figure: Figure, shape: 'number' | 'code' | 'decimal'): NumberRole | null {
    // Business days are a day count's alone, and a code a count's.
    const role = (roles: readonly FigureRole[]): NumberRole => ({ roles, business: false, code: false });
    const written = this.text.slice(figure.start, figure.end);
    if (/^[x×]/.test(written)) {
      return role(['line_units']);
    }
    const label = this.vocab.LABELS.get(this.labelBefore(index));
    if (label !== undefined && (shape !== 'decimal' || label[0] === 'line_units')) {
      return role(label === 'page' ? this.pageRoles(index) : label);
    }
    const colon = this.at(index, -1)?.text === ':' && shape === 'number' ? [-2, -3, -4].map((offset) => this.vocab.COUNT_NOUNS.get(this.word(index, offset))).find((roles) => roles !== undefined) : undefined;
    if (colon !== undefined) {
      return role(this.nounRoles(index, colon));
    }
    const days = this.daysAfter(index, figure);
    if (days.days) {
      return { roles: this.dayRoles(index), business: days.business, code: false };
    }
    if (shape !== 'decimal' && this.vocab.LEVEL_WORDS.has(this.word(index, 1))) {
      return role(['level']);
    }
    if (this.isYear(index, figure)) {
      return role([]);
    }
    // A possessive is no count of the noun after it: "Patient 2's line".
    const counted = token.possessive ? undefined : this.countNoun(index);
    if (counted !== undefined) {
      const ordinal = this.vocab.ORDINAL_NOUNS.get(counted.noun);
      if (ordinal !== undefined && isOrdinal(written, this.vocab)) {
        return role([ordinal]);
      }
      const before = this.at(index, -1);
      const code = before === undefined || before.kind === 'figure' || this.vocab.CODE_MODIFIER_LEADS.has(this.word(index, -1));
      return { roles: this.nounRoles(index, counted.roles), business: false, code };
    }
    if (shape === 'decimal') {
      return null;
    }
    const partitive = token.possessive ? undefined : this.partitive(index);
    if (partitive !== undefined) {
      return role(this.nounRoles(index, partitive.roles));
    }
    if (shape === 'code') {
      return null;
    }
    const row = this.vocab.ROW_LABELS.get(this.labelBefore(index));
    if (row !== undefined) {
      return role([row]);
    }
    return this.listed(index);
  }

  /**
   * A number after another read in a role, with only a list's words between, keeps that role: "pages 1 and 2", "lines
   * 1 to 3", "in 2026 and 2027". (A count's or a day count's noun stands between, so only a label's role is kept.)
   */
  private listed(index: number): NumberRole | null {
    const between = this.run(index, -1, (token) => token.kind === 'figure');
    const previous = this.readings.get(index - between.length - 1);
    return between.length > 0 && between.every((text) => this.vocab.LIST_JOINERS.has(text)) && previous !== undefined ? previous : null;
  }

  private pageRoles(index: number): readonly FigureRole[] {
    const roles = cueRoles(this.clause(index), this.vocab.PAGE_CUES);
    return roles.size === 0 ? ['citation_page', 'window_page'] : FIGURE_ROLES.filter((role) => roles.has(role));
  }

  private dayRoles(index: number): readonly FigureRole[] {
    const roles = cueRoles(this.clause(index), this.vocab.DAY_CUES);
    return roles.size === 0 ? ['window_days', 'days_to_pay', 'days_late'] : FIGURE_ROLES.filter((role) => roles.has(role));
  }

  read(index: number, figure: Figure): FigureReading {
    const token = this.tokens[index] as Token;
    const written = this.text.slice(figure.start, figure.end);
    const reading = (kind: ReadKind, value: string, roles: FigureReading['roles'], extra: Partial<Pick<FigureReading, 'code' | 'business' | 'prose'>> = {}): FigureReading => ({
      figure,
      kind,
      value,
      roles,
      code: extra.code ?? '',
      business: extra.business ?? false,
      prose: extra.prose ?? false,
      token: index,
    });
    const asNumber = (found: NumberRole | null, value: string, code: string): FigureReading => {
      this.readings.set(index, found);
      if (found === null) {
        return reading('number', value, 'none', { prose: written.toLowerCase() === 'first' });
      }
      if (found.roles.length === 0) {
        return reading('year', value, this.cued(index, this.vocab.DATE_CUES));
      }
      return reading('number', value, found.roles, { code: found.code ? code : '', business: found.business });
    };
    switch (figure.kind) {
      case 'number':
        return asNumber(this.numberRole(index, token, figure, 'number'), figure.value, '');
      case 'code': {
        const found = /^\d+$/.test(figure.value) ? this.numberRole(index, token, figure, 'code') : null;
        return found === null ? reading('code', figure.value, 'none') : asNumber(found, canonicalNumber(figure.value), figure.value);
      }
      case 'amount': {
        const found = written.includes('$') ? null : this.numberRole(index, token, figure, 'decimal');
        return found === null ? reading('amount', figure.value, this.cued(index, this.vocab.AMOUNT_CUES)) : asNumber(found, canonicalNumber(written), '');
      }
      case 'percent':
        return reading('percent', figure.value, this.cued(index, this.vocab.PERCENT_CUES, this.percentAfter(index)));
      case 'date':
      case 'month':
      case 'month_day':
        return reading(figure.kind, figure.value, this.cued(index, this.vocab.DATE_CUES));
      case 'modifier':
      case 'identifier':
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

/** Words that carry no meaning of their own: a quoted figure is never held by one of them alone. */
export function functionWords(): ReadonlySet<string> {
  return vocabulary().FUNCTION_WORDS;
}

/**
 * Whether a quoted text repeats a figure with the words around it (docs/adr/0086): a quoted figure is never an input
 * of a role, only a repetition of the quote. `narrative` is the narrative's tokens and `at` the figure's; `quote` a
 * quoted text's tokens, and `functionWords` functionWords()'s. From each place the quote holds the same figure, the tokens are compared outward on both
 * sides until they differ or the quote's clause ends (an edge of the quote, which counts as reached).
 *
 * - A figure in a role (`inRole`: its words name one) repeats the quote only with four of its tokens or more, the one
 *   after it among them unless the quote's clause ends there ("a level 2 appeal is raised within"), or with the whole
 *   of a quoted clause: "This is a level 2 appeal" does not repeat "A level 2 appeal is raised within 90 days", nor
 *   "within 3650 business days" "within 3650 days".
 * - A figure in no role repeats it with the word before it, when that word means something ("Section 4", "GROUP
 *   77"), with two of its tokens, one of them meaning something, or with the quote's clause reached on one side and a
 *   token matched on the other.
 */
export function quotedHolds(narrative: readonly string[], at: number, quote: readonly string[], inRole: boolean, functionWords: ReadonlySet<string>): boolean {
  // A figure means something; a word does unless it is a function word.
  const meaning = (token: string) => !functionWords.has(token.slice(2));
  const key = narrative[at];
  return quote.some((token, place) => {
    if (token !== key) {
      return false;
    }
    const side = (step: number) => {
      const matched: string[] = [];
      for (let offset = step; ; offset += step) {
        const quoted = quote[place + offset];
        if (quoted === undefined || quoted === '|') {
          return { matched, edge: true };
        }
        if (narrative[at + offset] !== quoted) {
          return { matched, edge: false };
        }
        matched.push(quoted);
      }
    };
    const left = side(-1);
    const right = side(1);
    const count = left.matched.length + right.matched.length;
    if (left.edge && right.edge) {
      return true;
    }
    if (inRole) {
      return count >= 4 && (right.edge || right.matched.length > 0);
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

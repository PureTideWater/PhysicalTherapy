import type { Figure } from '../scan';
import type { FigureRole, Scope, Token } from './kinds';
import { CueReader } from './cues';
import { type Counted, type NumberRole, cueAt, isOrdinal, numeral } from './walk';

/**
 * The role reader's third layer (../roles.ts; docs/adr/0086): what a number's words make it (a label's role, a day
 * count, a level, a year, a count of a noun, a partitive, a row, a list's role), and what an amount or a count of
 * units is stated per.
 */
export class NumberReader extends CueReader {
  /** What an amount or a count of units is stated per (`from` the token its words after start at). */
  protected scope(index: number, from: number): Scope | null {
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
  protected scopeEnd(index: number): number {
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
  protected units(index: number, after: number): Pick<NumberRole, 'roles' | 'scope'> {
    const scope = this.scope(index, after);
    return scope === 'line' ? { roles: ['line_units'], scope } : { roles: ['units'], scope: scope === 'total' ? 'total' : null };
  }

  protected counted(index: number, counted: Counted): Pick<NumberRole, 'roles' | 'scope'> {
    return counted.roles[0] === 'units' ? this.units(index, counted.end) : { roles: counted.roles, scope: null };
  }

  /** A count's noun and the counts it may be, when `word` (token `at`) is one. */
  protected noun(word: string, at: number): Counted | undefined {
    const roles = this.vocab.COUNT_NOUNS.get(word);
    return roles === undefined ? undefined : { noun: word, roles, end: at + 1 };
  }

  /** The count's noun right after token `index`: at once, after a code or digits, or after one word that keeps it the count. */
  protected countNoun(index: number): Counted | undefined {
    const first = this.at(index, 1);
    const between = first?.kind === 'figure' || (first?.kind === 'word' && !this.vocab.NOT_THE_COUNT.has(first.text));
    return this.noun(this.word(index, 1), index + 1) ?? (between ? this.noun(this.word(index, 2), index + 2) : undefined);
  }

  /** "N of [the] [M] [word] noun": the noun of a partitive, and its second number; "N of them": the lines, claims or patients. */
  protected partitive(index: number): (Counted & { readonly of: string | null }) | undefined {
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
  protected frontedPartitive(index: number): (Counted & { readonly of: string | null }) | undefined {
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
  protected labelBefore(index: number): string {
    const before = this.word(index, -1);
    return this.vocab.LABEL_FILLERS.has(before) ? this.word(index, -2) : before;
  }

  /** "days" after the count at token `index` (past its digits, as in "thirty (30) days", and a kind of day), and the token after it. */
  protected daysAfter(index: number, figure: Figure): { readonly days: boolean; readonly business: boolean; readonly end: number } {
    // "thirty (30) days": the digits after the words are the same count.
    const offset = this.at(index, 1)?.figure?.value === figure.value ? 2 : 1;
    const basis = this.word(index, offset);
    const at = this.vocab.DAY_BASES.has(basis) ? offset + 1 : offset;
    const kind = this.word(index, at);
    return { days: kind === 'day' || kind === 'days', business: basis === 'business' || basis === 'working', end: index + at + 1 };
  }

  /** A whole number from 1900 to 2199, in four digits or in words, after a year's word or before a year's noun, and never a count of a noun that names no date. */
  protected isYear(index: number, figure: Figure): boolean {
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
  protected numberRole(index: number, token: Token, figure: Figure, shape: 'number' | 'code' | 'decimal'): NumberRole | 'prose' | 'year' | null {
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
  protected listed(index: number): NumberRole | null {
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
}

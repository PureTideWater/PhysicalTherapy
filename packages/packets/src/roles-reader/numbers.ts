import type { Figure } from '../scan';
import type { FigureReading, FigureRole, Scope, SentenceParts, Token } from './kinds';
import { CueReader, type ListCue } from './cues';
import { type Counted, type NumberRole, cueAt, isOrdinal, numeral, phraseAt } from './walk';

/**
 * The role reader's third layer (../roles.ts; docs/adr/0086): what a number's words make it (a label's role, a day
 * count, a level, a year, a count of a noun, a partitive, a row, a list's role), and what an amount or a count of
 * units is stated per.
 */
export class NumberReader extends CueReader {
  /** The scope one line's or one unit's noun names ("line", "visit", "row", "service"; "unit"), or null. */
  protected oneOf(word: string): Scope | null {
    return this.vocab.ONE_LINE.has(word) ? 'line' : this.vocab.ONE_UNIT.has(word) ? 'unit' : null;
  }

  /**
   * The scope phrase that starts at token `at`, right after a figure, from the closed list (rule 1 of docs/adr/0086):
   * "per line", "a line", "per unit", "a unit" (a visit, a row or a service is a line); "for each line", "on each line",
   * "for each of the N lines", "on each of the N lines"; "in total", "in all"; "for the claim", "on the claim" (not "the
   * claim line"); "across the N lines", "for all the lines", "over these N lines" (the rows in the plural with their
   * count or "all"). Its scope and the token after it, or null. A count the phrase states is held to the pattern's by
   * the verifier, as every count of the sentence is (parts()).
   */
  protected phraseAfter(at: number): { readonly scope: Scope; readonly end: number } | null {
    const word = (offset: number) => this.word(at, offset);
    const count = (offset: number) => this.at(at, offset)?.figure?.kind === 'number';
    const per = this.vocab.PER.has(word(0)) ? this.oneOf(word(1)) : null;
    if (per !== null) {
      return { scope: per, end: at + 2 };
    }
    if (this.vocab.EACH_LEADS.has(word(0)) && this.vocab.EACH.has(word(1))) {
      const each = this.oneOf(word(2));
      if (each !== null) {
        return { scope: each, end: at + 3 };
      }
      // "for each of the 3 lines"
      const the = word(3) === 'the' ? 1 : 0;
      if (word(2) === 'of' && count(3 + the) && this.vocab.LINES.has(word(4 + the))) {
        return { scope: 'line', end: at + 5 + the };
      }
    }
    if (this.vocab.TOTAL_PHRASES.some((phrase) => phraseAt(this.tokens.slice(at, at + 2).map((token) => token.text), 0, phrase))) {
      return { scope: 'total', end: at + 2 };
    }
    if (this.vocab.CLAIM_LEADS.has(word(0)) && word(1) === 'the' && word(2) === 'claim' && !(this.at(at, 2) as Token).possessive && this.oneOf(word(3)) === null) {
      return { scope: 'total', end: at + 3 };
    }
    if (this.vocab.ROWS_LEADS.has(word(0))) {
      // Past "the", "all", "these" or "those" (two at most: "all the"), the rows' count or "all", and their noun.
      let next = 1;
      while (next < 3 && this.vocab.ROWS_DETERMINERS.has(word(next))) {
        next += 1;
      }
      const counted = count(next);
      const rows = counted ? next + 1 : next;
      if ((counted || word(1) === 'all') && this.vocab.PLURAL_ROWS.has(word(rows))) {
        return { scope: 'total', end: at + rows + 1 };
      }
    }
    return null;
  }

  /**
   * The scope the phrase right after a figure grants (`at` the token after the figure's own words), or null: a phrase
   * from the closed list (phraseAfter()), with no dash or parenthesis before it or inside it, unless another right
   * after it states another ("$70.00 in total for each line" states none).
   */
  protected scopeAfter(at: number): Scope | null {
    const first = this.adjoining(at);
    if (first === null) {
      return null;
    }
    const second = this.adjoining(first.end);
    return second !== null && second.scope !== first.scope ? null : first.scope;
  }

  /** The scope phrase that starts at token `at` (phraseAfter()), with no dash or parenthesis before it or inside it. */
  protected adjoining(at: number): { readonly scope: Scope; readonly end: number } | null {
    const found = this.phraseAfter(at);
    return found === null || this.apart(at - 1, found.end - 1) ? null : found;
  }

  /** Whether a dash or a parenthesis stands between any two tokens from token `from` to token `to` (breakBefore()). */
  protected apart(from: number, to: number): boolean {
    for (let at = from + 1; at <= to; at += 1) {
      if (this.breakBefore(at)) {
        return true;
      }
    }
    return false;
  }

  /**
   * The scope the words right before token `index` grant, from the closed list (rule 1 of docs/adr/0086): "each line's"
   * or "every unit's", "per-line" or "per-unit" written with a hyphen ("the per-line $70.00"), and "a total of" or "the
   * total of". Nothing else before a figure grants a scope ("Per line, $70.00" is no phrase beside it).
   */
  protected scopeBefore(index: number): Scope | null {
    const owner = this.at(index, -1);
    const lead = this.word(index, -2);
    // "each line's" or "per-line": the noun's scope, with its lead right before it.
    const each = owner?.possessive === true && this.vocab.EACH.has(lead);
    const per = lead === 'per' && this.text.slice((this.at(index, -2) as Token).end, (owner as Token).start) === '-';
    const named = each || per ? this.oneOf(this.word(index, -1)) : null;
    if (named !== null) {
      return this.apart(index - 2, index) ? null : named;
    }
    const total = this.word(index, -1) === 'of' && lead === 'total' && this.vocab.TOTAL_DETERMINERS.has(this.word(index, -3));
    return total && !this.apart(index - 3, index) ? 'total' : null;
  }

  /**
   * What an amount or a count of units at token `index` is stated per (rule 1 of docs/adr/0086): only a scope phrase
   * beside it, right after its own words (from token `after`: scopeAfter()) or right before it (scopeBefore()); two that
   * differ grant none. Nothing in any other clause, before or after, lends a scope.
   */
  protected scope(index: number, after: number): Scope | null {
    const before = this.scopeBefore(index);
    const found = this.scopeAfter(after);
    return before !== null && found !== null && before !== found ? null : (before ?? found);
  }

  /**
   * What an amount is stated per; a "respectively" list's figure (rule 3 of docs/adr/0086), the scope phrase right
   * after its cue's words, else the one the whole list has (right after the list, or right after "amounts" after the
   * last cue); when its cue's and the list's differ, none. A list in neither plain form: none (it fails, `unread`).
   */
  protected amountScope(index: number): Scope | null {
    const list = this.respectivelyList(index);
    if (list === null) {
      return this.scope(index, index + 1);
    }
    const form = this.listForm(list, 'amount', this.vocab.AMOUNT_CUES);
    if (form === null) {
      return null;
    }
    const own = this.scopeAfter((form.cues[list.indexOf(index)] as ListCue).end + 1);
    const last = form.cues.at(-1) as ListCue;
    const wide = (form.after === null ? null : this.scopeAfter(form.after)) ?? (last.noun ? this.scopeAfter(last.end + 1) : null);
    return own !== null && wide !== null && own !== wide ? null : (own ?? wide);
  }

  /**
   * The token after an amount's own words of what it is stated per that a later figure's cues would read otherwise:
   * "each", "per" or "a" with a line's noun right after it ("$30.00 a service on 2026-01-05" is a payment date, never
   * a service date). Any other scope's words after it hold no cue.
   */
  protected scopeEnd(index: number): number {
    const lead = this.word(index, 1);
    return (this.vocab.PER.has(lead) || this.vocab.EACH.has(lead)) && this.vocab.ONE_LINE.has(this.word(index, 2)) ? index + 3 : index + 1;
  }

  /**
   * Whether a figure read so (at token `at`) names a part of the lines (the amended rule 1 of docs/adr/0086): a row, a
   * claim's or a patient's ("line 2", "lines 1 and 2", "claim 1", "Patient 2", "the third line"), a code or a modifier,
   * a date of service (or a date read in no role, which may be one), a partitive ("2 of the 3 lines", "two of them", or
   * a number in no role before "of": "one of the lines"), or an ordinal read as prose ("the first 3 claims").
   */
  protected figurePart(reading: FigureReading, at: number): boolean {
    if (reading.kind === 'code' || reading.kind === 'modifier' || reading.code !== '' || reading.part !== null || (reading.roles === 'none' && this.word(at, 1) === 'of')) {
      return true;
    }
    const roles = Array.isArray(reading.roles) ? reading.roles : null;
    // A year names none ("the 2026 fee schedule"); a date, a month or a day of a month may.
    if (reading.kind === 'date' || reading.kind === 'month' || reading.kind === 'month_day') {
      return roles === null || roles.includes('service_date');
    }
    // An ordinal read as prose ("the first 3 claims"; the reader reads only an ordinal so), or a row read in its one role.
    return reading.prose || (roles !== null && this.vocab.PART_ROLES.has(roles[0] as FigureRole));
  }

  /**
   * Whether the word at token `at` names a part of the lines: "remaining", "other", "some", "last" and the like ("one
   * of" is read with the sentence: parts()); one line's noun after "the", "this", "that", "one" or "its", or after a
   * claim's or a patient's word not after "each" ("the claim line", "a patient's row"; never "each claim line" or "per
   * line").
   */
  protected wordPart(at: number): boolean {
    const word = this.word(at, 0);
    if (this.vocab.PART_WORDS.has(word)) {
      return true;
    }
    if (!this.vocab.ONE_LINE.has(word)) {
      return false;
    }
    const before = this.word(at, -1);
    return this.vocab.ONE_DETERMINERS.has(before) || (this.vocab.ROW_OWNERS.has(before) && !this.vocab.EACH.has(this.word(at, -2)));
  }

  /**
   * What the sentence of the amount at token `index` names of the lines (the fail-closed triggers of rule 1 of
   * docs/adr/0086, as amended): whether it names a part of them (figurePart(), wordPart()), whether it says "the
   * claim" or "the patient" (one of the claims or patients, unless the pattern has one), each count it states of lines,
   * claims or patients, which the verifier holds to the pattern's (one other than its own names a part), and each date,
   * month or day of a month, which names a part where a line's service date is that date or falls in it, whatever role
   * its words give it (a year names none: "the 2026 fee schedule").
   * `readings` holds each figure of the text as read, by token.
   */
  parts(index: number, readings: ReadonlyMap<number, FigureReading>): SentenceParts {
    const start = this.sentenceStart(index);
    const end = this.sentenceEnd(index);
    let named = false;
    let claim = false;
    let patient = false;
    const counts: { readonly roles: readonly FigureRole[]; readonly value: string }[] = [];
    const dates: { readonly kind: 'date' | 'month' | 'month_day'; readonly value: string }[] = [];
    for (const [offset] of this.tokens.slice(start, end).entries()) {
      const at = start + offset;
      const reading = readings.get(at);
      if (reading === undefined) {
        const word = this.word(at, 0);
        const before = this.word(at, -1);
        const one = this.vocab.ONE_DETERMINERS.has(before);
        // A patient as a noun ("the patient", "a patient's line"), not a word before another ("the patient share").
        const person = word === 'patient' && ((this.tokens[at] as Token).possessive || this.at(at, 1)?.kind !== 'word' || this.vocab.ONE_LINE.has(this.word(at, 1)));
        named ||= this.wordPart(at) || (word === 'one' && this.word(at, 1) === 'of') || (person && !one && !this.vocab.EACH.has(before) && before !== 'per');
        claim ||= word === 'claim' && one;
        patient ||= person && one;
        continue;
      }
      named ||= this.figurePart(reading, at);
      if (reading.kind === 'date' || reading.kind === 'month' || reading.kind === 'month_day') {
        dates.push({ kind: reading.kind, value: reading.value });
      }
      // Every figure read in roles, with its value: the verifier holds those in a count's roles to the pattern's.
      if (Array.isArray(reading.roles)) {
        counts.push({ roles: reading.roles, value: reading.value });
      }
    }
    return { named, claim, patient, counts, dates };
  }

  /** Units, each line's when a scope phrase beside them says so ("2 units per line", "a 2-unit line"), and what they are stated per. */
  protected units(index: number, after: number): Pick<NumberRole, 'roles' | 'scope'> {
    // "a 2-unit line": the count joined to "unit" by a hyphen, right before one line's noun, is each line's.
    const joined = this.word(after, -1) === 'unit' && this.text.slice((this.tokens[index] as Token).end, (this.tokens[after - 1] as Token).start) === '-' && this.vocab.ONE_LINE.has(this.word(after, 0));
    const scope = joined ? 'line' : this.scope(index, after);
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

  /** "N of [the] [M] [word] noun": the counts its noun may be (units, each line's), and its second number; "N of them": the lines, claims or patients. */
  protected partitive(index: number): { readonly roles: readonly FigureRole[]; readonly of: string | null } | undefined {
    if (this.word(index, 1) !== 'of') {
      return undefined;
    }
    const determiner = this.vocab.PARTITIVE_DETERMINERS.has(this.word(index, 2)) ? 1 : 0;
    const second = this.at(index, 2 + determiner)?.figure;
    const count = second === undefined ? 0 : 1;
    const at = index + 2 + determiner + count;
    const first = this.word(index, 2 + determiner + count);
    const found = this.noun(first, at) ?? (first === '' ? undefined : this.noun(this.word(index, 3 + determiner + count), at + 1));
    if (found !== undefined) {
      return { roles: this.counted(index, found).roles, of: numeral(second) };
    }
    // "2 of them", "2 of these": a part of the lines, the claims or the patients.
    return this.vocab.PARTITIVE_PRONOUNS.has(this.word(index, 2)) ? { roles: ['lines', 'claims', 'patients'], of: null } : undefined;
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
    // Its noun last (a figure's text is never a noun's).
    const found = this.noun((words.at(-1) as Token).text, index);
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
    // Two decimals are never an ordinal, nor a year (isYear()): no digit is followed by a letter, nor four digits alone.
    const ordinal = isOrdinal(written, this.vocab);
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
    if (this.isYear(index, figure)) {
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
      const found = this.counted(index, counted);
      return role(found.roles, { scope: found.scope, code });
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
      return role(partitive.roles, { part: { of: partitive.of } });
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
      return role(fronted.roles, { part: { of: fronted.of } });
    }
    return this.listed(index);
  }

  /** The figure before token `index` read in a role or as a year, with a list's words alone between: its token, and whether only commas are between. */
  protected listBefore(index: number): { readonly head: number; readonly commas: boolean } | null {
    const between = this.run(index, -1, (token) => token.kind === 'figure');
    const head = index - between.length - 1;
    return between.length > 0 && between.every((text) => this.vocab.LIST_JOINERS.has(text)) && this.readings.has(head) ? { head, commas: between.every((text) => text === ',') } : null;
  }

  /**
   * A number after another read in a role, with only a list's words between, keeps that role: "pages 1 and 2", "lines
   * 1 to 3", "lines 1–3", "in 2026 and 2027". Across a comma alone, only after a plural label or while the list goes on
   * ("rows 1, 2 and 3"), never where the comma starts a clause ("Under version 1, 2 of them").
   */
  protected listed(index: number): NumberRole | 'year' | null {
    const before = this.listBefore(index);
    if (before === null) {
      return null;
    }
    const previous = this.readings.get(before.head) as NumberRole | 'year';
    if (!before.commas) {
      return previous;
    }
    // A comma alone: the list's first label plural, or the list going on after this number.
    let first = before.head;
    for (let found = this.listBefore(first); found !== null; found = this.listBefore(first)) {
      first = found.head;
    }
    const plural = this.vocab.PLURAL_LABELS.has(this.labelBefore(first));
    const after = this.at(index, 1);
    const goesOn = after !== undefined && this.vocab.LIST_CONTINUERS.has(after.text) && this.tokens.slice(index + 1, index + 4).some((token) => token.kind === 'figure');
    return plural || goesOn ? previous : null;
  }
}

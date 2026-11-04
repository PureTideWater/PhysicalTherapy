import { vocabulary } from './roles-words';
import { type Figure, canonicalNumber } from './scan';
import type { FigureReading, QuotedText, ReadKind, ReadText, Token } from './roles-reader/kinds';
import { NumberReader } from './roles-reader/numbers';
import { type Cued, type Family, type NumberRole, tokenize } from './roles-reader/walk';

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
 * 1. "respectively" maps a list's figures to its cues, in order, in one of its two plain forms alone: the cues right
 *    before the list ("the contract expected and the payer allowed $100.00 and $70.00, respectively"), or right after
 *    it ("$100.00 and $70.00 were the expected and allowed amounts, respectively"); a list in neither form fails at
 *    every figure (`unread`), never read by the steps after nor in any role (rule 3 of docs/adr/0086);
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
 * say what they are stated per (`scope`): each line, each unit, or the lines in total, granted only by a scope phrase
 * of a closed list beside the figure (rule 1 of docs/adr/0086, as amended): right after it ("per line", "a line", "for
 * each line", "on each of the 3 lines", "per unit", "in total", "in all", "for the claim", "across the 3 lines", "for
 * all the lines") or right before it ("each line's", "the per-line", "a total of"); nothing else in the sentence lends
 * one (scope()). A "respectively" list's figure takes the phrase right after its cue, else the one right after the list
 * or after "amounts" (amountScope()). What an amount's sentence names of the lines (a row, a code, a date, a patient, a
 * partitive, "remaining", a count: parts()) is read too, and a figure with no scope, or in a sentence that names a part
 * of the lines, fails where its role's per-line and total values differ (rule 2; the
 * verifier's). "first" with no role is prose, as "one" and "zero" are.
 *
 * Pure, deterministic and browser-safe: no Node module, clock or network.
 */

export { FIGURE_ROLES, type FigureReading, type FigureRole, type QuotedText, type ReadKind, type ReadText, SCOPES, type Scope, type SentenceParts } from './roles-reader/kinds';

/** The reader: each figure read in its role, its layers below (./roles-reader: Walk, CueReader, NumberReader). */
class Reader extends NumberReader {
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
      unread: this.unread.has(index),
      parts: null,
    });
    const cued = (family: Family, found: Cued) => {
      this.families.set(index, family);
      this.cued.set(index, found);
      return found;
    };
    const asNumber = (found: NumberRole | 'prose' | 'year' | null, value: string, code: string): FigureReading => {
      if (found === null || found === 'prose') {
        return reading('number', value, 'none', { prose: found === 'prose' || written.toLowerCase() === 'first' });
      }
      // A list after a number in a role keeps it (listed()), and a list after a year is years ("in 2026 and 2027").
      this.readings.set(index, found);
      if (found === 'year') {
        const year = cued('date', this.dateRoles(index, 'year'));
        return reading('year', value, year.roles, { every: year.every });
      }
      return reading('number', value, found.roles, { code: found.code ? code : '', business: found.business, scope: found.scope, part: found.part });
    };
    switch (figure.kind) {
      case 'number':
        return asNumber(this.numberRole(index, token, figure, 'number'), figure.value, '');
      case 'code': {
        // Five digits are never an ordinal, so never prose (numberRole()); a decimal neither, nor ever a year or a list's.
        const found = /^\d+$/.test(figure.value) ? this.numberRole(index, token, figure, 'code') : null;
        if (found === null) {
          return reading('code', figure.value, 'none');
        }
        return asNumber(found, canonicalNumber(figure.value), figure.value);
      }
      case 'amount': {
        const found = written.includes('$') ? null : this.numberRole(index, token, figure, 'decimal');
        if (found === null) {
          const amount = cued('amount', this.role(index, 'amount', this.vocab.AMOUNT_CUES));
          const scope = this.amountScope(index);
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
        return reading(figure.kind, figure.value, 'none');
    }
  }
}

/** Reads every figure of `text` (as readableText gives it) in its role, and its tokens as quotedHolds() compares them. */
export function readFigures(text: string): ReadText {
  const vocab = vocabulary();
  const tokens = tokenize(text, vocab);
  const reader = new Reader(text, tokens, vocab);
  const read = tokens.flatMap((token, index) => (token.figure === undefined ? [] : [reader.read(index, token.figure)]));
  // An amount's sentence, once each figure of it is read: what it names of the lines (the fail-closed triggers).
  const byToken = new Map(read.map((reading) => [reading.token, reading]));
  const readings = read.map((reading) => (reading.kind === 'amount' ? { ...reading, parts: reader.parts(reading.token, byToken) } : reading));
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
        matched.push(quoted);
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

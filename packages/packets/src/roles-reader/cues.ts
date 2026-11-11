import { type Cues, type Vocabulary, vocabulary } from '../roles-words';
import type { Figure } from '../scan';
import type { FigureRole, ReadKind, Token } from './kinds';
import { ANY, type Cued, type Entry, type Family, type Match, Walk, cueAt, nearest, notWord, one, ordered } from './walk';

/**
 * A "respectively" list's cue: its roles, the tokens its words start and end at (a scope phrase right after them is
 * its own), and whether they end with "amounts", the noun of every cue (after the last cue's, a scope phrase is the
 * whole list's).
 */
export interface ListCue {
  readonly roles: readonly FigureRole[];
  readonly start: number;
  readonly end: number;
  readonly noun: boolean;
}

/**
 * A "respectively" list in one of its two plain forms: its cues, in order, and, with its cues after it, the token right
 * after the list, where a scope phrase is the whole list's (null with its cues before it).
 */
export interface ListForm {
  readonly list: readonly number[];
  readonly cues: readonly ListCue[];
  readonly after: number | null;
}

/**
 * The role reader's second layer (../roles.ts, steps 1 to 8; docs/adr/0086): the role of an amount, a percentage, a
 * date, a day count and a page from one cue's roles, never the union of every cue around it.
 */
export class CueReader extends Walk {
  /**
   * Every cue of `cues` that consecutive words of tokens [from, to) match (from 0 up), in order, outermost only (a cue
   * inside a longer one is the longer one's).
   */
  protected cues(from: number, to: number, cues: Cues): Match[] {
    const words = this.tokens.slice(from, to);
    const found: Match[] = [];
    words.forEach((_, at) => {
      for (const [phrase, roles] of cues) {
        const parts = phrase.split(' ');
        const matched = parts.every((part, offset) => {
          const token = words[at + offset];
          return token?.kind === 'word' && token.text === part;
        });
        if (matched) {
          found.push({ start: from + at, end: from + at + parts.length - 1, size: parts.length, phrase, roles });
        }
      }
    });
    return found.filter((match) => !found.some((other) => other.size > match.size && other.start <= match.start && match.end <= other.end));
  }

  /**
   * A stretch's cues (as cues() gives them, in order) as each counts (step 3): a participle after a noun is the noun's,
   * a noun after the payer's act is the act's object, and a cue that names two roles beside one that names one of them
   * is that one.
   */
  protected entries(sorted: readonly Match[], family?: Family): Entry[] {
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
    // A cue of one role is narrowed to itself, or to another of that role.
    return kept.map((match) => {
      const narrower = nearest(kept.filter((other) => other.roles.length === 1 && match.roles.includes(other.roles[0] as FigureRole)).map((other) => ({ match: other })));
      return { match, roles: narrower === undefined ? match.roles : narrower.match.roles };
    });
  }

  /** A copula's subject: the nearest other cue before it in its clause, past the figures there ("the shortfall of $30.00 per line comes to"). */
  protected subject(copula: Match, family: Family | undefined, cues: Cues): Entry | undefined {
    // Its clause: after the last edge before it.
    const from = this.tokens.slice(0, copula.start).map((token) => token.kind).lastIndexOf('edge') + 1;
    return nearest(this.entries(this.cues(from, copula.start, cues), family).filter((entry) => !this.vocab.COPULAS.has(entry.match.phrase)));
  }

  /** An entry as it stands, a copula (an amount's cue alone) replaced by its subject. */
  protected resolved(entry: Entry, family: Family | undefined, cues: Cues): Entry {
    return this.vocab.COPULAS.has(entry.match.phrase) ? (this.subject(entry.match, family, cues) ?? entry) : entry;
  }

  /** Step 3: the nearest cue of tokens [from, to), as it counts (a day count's or a page's cues are of no family). */
  protected nearestCue(from: number, to: number, family: Family | undefined, cues: Cues): Cued | null {
    const found = nearest(this.entries(this.cues(from, to, cues), family));
    return found === undefined ? null : one(this.resolved(found, family, cues).roles);
  }

  /** Step 5: the cues of the stretches given; one role, or, when they name several, every one of them. */
  protected everyCue(stretches: readonly (readonly [number, number])[], family: Family | undefined, cues: Cues): Cued | null {
    const found = stretches.flatMap(([from, to]) => this.entries(this.cues(from, to, cues), family)).map((entry) => this.resolved(entry, family, cues));
    const best = nearest(found);
    if (best === undefined) {
      return null;
    }
    const roles = ordered(found.flatMap((entry) => entry.roles));
    const others = found.some((entry) => entry.roles.some((role) => !best.roles.includes(role)));
    return others ? { roles, every: true } : one(best.roles);
  }

  /**
   * Step 2 for an amount or a date (a percentage's is its words after it): the cue right after token `index` (past "in"
   * or "of"), or the noun the figure completes with "of" ("a shortfall of $90.00").
   */
  protected bound(index: number, cues: Cues): Cued | null {
    const words = this.run(index, 1, notWord);
    const from = words[0] === 'in' || words[0] === 'of' ? 1 : 0;
    const after = cueAt(words, from, cues);
    if (after !== undefined) {
      return one(after[1]);
    }
    const of = this.word(index, -1) === 'of' ? -1 : this.word(index, -2) === 'of' && this.vocab.PARTITIVE_DETERMINERS.has(this.word(index, -1)) ? -2 : 0;
    if (of === 0) {
      return null;
    }
    // The noun before "of", or one word before it ("the contract amount of $70.00"): what the figure is, whatever act comes before.
    const to = index + of;
    const found = nearest(this.cues(Math.max(this.ownFrom(index), to - 4), to, cues).filter((match) => match.end >= to - 2).map((match) => ({ match })));
    return found === undefined ? null : one(found.match.roles);
  }

  /**
   * The "respectively" list token `index` is in (rule 3 of docs/adr/0086), in a sentence that says "respectively":
   * among the amounts, percentages and dates before it (since the "respectively" before, if any, and since the last
   * clause an edge and a conjunction start before the list: "The payer paid $56.00 per line, and the contract expected
   * ..."), the list is the run of them joined by commas, "and" or "or" alone that ends at the last. The figure takes it
   * when it is in that run; when it is another of them and the run is in neither plain form (listForm()), it takes them
   * all ("$70.00 and $100.00 per line on 2026-04-08 were ...": every one fails, `unread`), else none. After a "respectively" with no such figure before it ("Respectively, $1.00 and $9.00 were ..."): each
   * figure after it fails. Null when the figure is in no list. A list of one, of figures of two kinds, or of figures
   * not joined so, is in neither plain form, so each figure fails.
   */
  protected respectivelyList(index: number): readonly number[] | null {
    const start = this.sentenceStart(index);
    const end = this.sentenceEnd(index);
    const kindAt = (at: number) => {
      const kind = (this.tokens[at] as Token).figure?.kind;
      return kind === 'amount' || kind === 'percent' || kind === 'date' || kind === 'month' || kind === 'month_day' ? kind : null;
    };
    // The figures of those kinds between two tokens.
    const listed = (from: number, to: number) => this.tokens.slice(from + 1, to).flatMap((_, at) => (kindAt(from + 1 + at) === null ? [] : [from + 1 + at]));
    const said = (token: Token) => token.text === 'respectively';
    const after = this.tokens.slice(index + 1, end).findIndex(said);
    const before = this.tokens.slice(start, index).flatMap((token, at) => (said(token) ? [start + at] : []));
    const from = before.at(-1) ?? start - 1;
    if (after === -1) {
      // After every "respectively": in no plain form after one with none before it ("Respectively, $1.00 and $9.00 ..."),
      // so the figure fails; else it reads as any other.
      if (before.length > 0 && listed(before.at(-2) ?? start - 1, from).length === 0) {
        this.unread.add(index);
      }
      return null;
    }
    const to = index + 1 + after;
    const last = listed(from, to).at(-1) as number;
    // The last clause an edge and a conjunction start before the last figure ("..., and the contract expected"), not a
    // list's "$1.00, and $9.00"; the list's figures are after it.
    const opened = this.tokens.slice(0, last).findLastIndex((_, at) => {
      const list = this.tokens[at - 2]?.kind === 'figure' && (this.tokens[at + 1] as Token).kind === 'figure';
      return this.vocab.CONJUNCTIONS.has(this.word(at, 0)) && this.tokens[at - 1]?.kind === 'edge' && !list;
    });
    const candidates = listed(Math.max(from, opened), to);
    let head = candidates.length - 1;
    while (head > 0 && this.tokens.slice((candidates[head - 1] as number) + 1, candidates[head]).every((token) => this.vocab.LIST_JOINED.has(token.text))) {
      head -= 1;
    }
    const run = candidates.slice(head);
    if (run.includes(index)) {
      return run;
    }
    if (!candidates.includes(index)) {
      return null;
    }
    // The run's family and its cues: an amount's, a percentage's, else a date's (a month's and a day of a month's too).
    const kind = kindAt(last);
    // A month's or a day of a month's run reads by a date's cues.
    const family: Family = kind === 'amount' || kind === 'percent' ? kind : 'date';
    const cues = { amount: this.vocab.AMOUNT_CUES, percent: this.vocab.PERCENT_CUES, date: this.vocab.DATE_CUES }[family];
    return this.listForm(run, family, cues) === null ? candidates : null;
  }

  /** Whether token `at` is one of a "respectively" list's own words besides its cues: a determiner, "were", "amounts", a scope's word, "and" or "the payer". */
  protected listWord(at: number): boolean {
    const text = (this.tokens[at] as Token).text;
    return this.vocab.LIST_FILLERS.has(text) || this.vocab.LIST_LINKS.has(text) || this.vocab.SCOPE_WORDS.has(text);
  }

  /**
   * A list's cues in tokens [from, to), as they count (entries()), one for each run of the same roles, each to the end
   * of its words, after which a scope phrase is its own ("expected in total", "the expected amounts in total"), past
   * "amounts" (`noun`: after the last cue's, a scope phrase is the whole list's, "the expected and allowed amounts per
   * line").
   */
  protected listCues(from: number, to: number, family: Family, cues: Cues): ListCue[] {
    const runs: { roles: readonly FigureRole[]; start: number; end: number }[] = [];
    const words = this.cues(from, to, cues);
    const counted = this.entries(words, family);
    for (const entry of counted) {
      const previous = runs.at(-1);
      if (previous?.roles.join() === entry.roles.join()) {
        previous.end = entry.match.end;
      } else {
        runs.push({ roles: entry.roles, start: entry.match.start, end: entry.match.end });
      }
    }
    // A cue's words end past a cue's word that does not count (a participle after its noun: "the interest owed") and
    // past "amounts", the noun of every cue.
    const inside = (matches: readonly Match[], at: number) => matches.some((match) => match.start <= at && at <= match.end);
    return runs.map((run): ListCue => {
      let end = run.end;
      while (inside(words, end + 1) && !inside(counted.map((entry) => entry.match), end + 1)) {
        end += 1;
      }
      const noun = this.vocab.LIST_NOUNS.has(this.word(end, 1));
      return { roles: run.roles, start: run.start, end: noun ? end + 1 : end, noun };
    });
  }

  /**
   * A "respectively" list read in one of its two plain forms (rule 3 of docs/adr/0086), else null: its figures, of one
   * kind, joined by commas, "and" or "or" alone, two or more, and either
   *
   * - its cues right before it, and "respectively" right after it, then an edge or the sentence's end ("The contract
   *   expected and the payer allowed $100.00 and $70.00, respectively"): the words back from the list that are cues or
   *   the list's own (listWord()), from the first cue; or
   * - its cues right after it ("$100.00 and $70.00 were the expected and allowed amounts, respectively", "$100.00 and
   *   $70.00, respectively, were the expected and allowed amounts"): the words after the list that are cues, the list's
   *   own, commas and one "respectively", to "respectively" when it follows the cues, else up to an edge or the
   *   sentence's end; once every figure has its cue, no "and", "or" or "the payer".
   *
   * Either way there are as many cues as figures. A scope phrase right after a cue is its figure's; one right after
   * the list (`after`), or right after "amounts" after the last cue (listCues()), is the whole list's
   * (NumberReader.amountScope()).
   */
  protected listForm(list: readonly number[], family: Family, cues: Cues): ListForm | null {
    const first = list[0] as number;
    const last = list.at(-1) as number;
    const joined = list.every((at, place) => place === 0 || this.tokens.slice((list[place - 1] as number) + 1, at).every((token) => this.vocab.LIST_JOINED.has(token.text)));
    const kind = (at: number) => ((this.tokens[at] as Token).figure as Figure).kind;
    if (list.length < 2 || !joined || list.some((at) => kind(at) !== kind(first))) {
      return null;
    }
    const start = this.sentenceStart(first);
    const end = this.sentenceEnd(last);
    const edgeOrEnd = (at: number) => at >= end || (this.tokens[at] as Token).kind === 'edge';
    // The cues' words, and the cues as they count (entries(): a participle after its noun is the noun's).
    const words = this.cues(start, end, cues);
    const counted = this.entries(words, family);
    const matchAt = (at: number) => words.find((match) => match.start <= at && at <= match.end);
    // Its cues before it ("respectively" is after the list in its sentence, so the tokens after the list exist).
    const comma = (this.tokens[last + 1] as Token).text === ',' ? 1 : 0;
    if ((this.tokens[last + 1 + comma] as Token).text === 'respectively' && edgeOrEnd(last + 2 + comma)) {
      let from = first;
      while (from > start && !this.breakBefore(from) && ((this.tokens[from - 1] as Token).text === ',' || matchAt(from - 1) !== undefined || this.listWord(from - 1))) {
        from -= 1;
      }
      const before = this.listCues(from, first, family, cues);
      if (before.length === list.length) {
        return { list, cues: before, after: null };
      }
    }
    // Its cues after it.
    let count = 0;
    let roles: string | undefined;
    let said = false;
    let at = last + 1;
    for (; at < end; at += 1) {
      const token = this.tokens[at] as Token;
      if (this.breakBefore(at)) {
        break;
      }
      if (token.text === 'respectively') {
        if (said) {
          break;
        }
        said = true;
        if (count > 0) {
          at += 1;
          break;
        }
        continue;
      }
      if (token.kind === 'edge') {
        if (token.text !== ',') {
          break;
        }
        continue;
      }
      if (matchAt(at) !== undefined) {
        const entry = counted.find((cue) => cue.match.start === at);
        if (entry !== undefined && entry.roles.join() !== roles) {
          count += 1;
          roles = entry.roles.join();
        }
        continue;
      }
      if (!this.listWord(at) || (count === list.length && this.vocab.LIST_LINKS.has(token.text))) {
        break;
      }
    }
    while ((this.tokens[at - 1] as Token).text === ',') {
      at -= 1;
    }
    if (!said || !edgeOrEnd(at)) {
      return null;
    }
    const after = this.listCues(last, at, family, cues);
    return after.length === list.length ? { list, cues: after, after: last + 1 } : null;
  }

  /**
   * Step 1: a "respectively" list's figure takes its cue's roles, in order, when the list is in one of its two plain
   * forms (listForm()); in neither, it fails, whatever it is (`unread`): never a guess at each figure, nor any role.
   */
  protected respectively(index: number, family: Family, cues: Cues): Cued | null {
    const list = this.respectivelyList(index);
    if (list === null) {
      return null;
    }
    const form = this.listForm(list, family, cues);
    if (form === null) {
      this.unread.add(index);
      return ANY;
    }
    return one((form.cues[list.indexOf(index)] as ListCue).roles);
  }

  /**
   * Step 6: past the figures of other families before token `index` (their own words left out), the cues of the words
   * before them, back to a figure of its own family, whose roles it then takes, or to the sentence's start.
   */
  protected reachBack(index: number, family: Family, cues: Cues): Cued | null {
    let previous = this.previousFigure(index);
    const stretches = new Array<readonly [number, number]>();
    while (previous !== -1 && this.families.get(previous) !== family) {
      const before = this.previousFigure(previous);
      stretches.push([before === -1 ? this.sentenceStart(previous) : this.end(before), previous]);
      previous = before;
    }
    return this.everyCue(stretches, family, cues) ?? this.cued.get(previous) ?? null;
  }

  /** Steps 1 to 8 for an amount, a date or a percentage at token `index`. */
  protected role(index: number, family: 'amount' | 'date' | 'percent', cues: Cues): Cued {
    const own = this.ownFrom(index);
    const since = this.since(index);
    const next = index + 1;
    // The words after it, up to the next figure or edge (or stop, `commas` false), or a conjunction that opens the next
    // figure's clause ("and the remittances show"): the first cue there (one cue alone, which no other narrows).
    const after = (commas: boolean) => {
      const to = this.nextBreak(index, commas);
      const conjunction = this.tokens.slice(next, to).findIndex((token) => this.vocab.CONJUNCTIONS.has(token.text));
      const found = this.cues(next, conjunction === -1 ? to : next + conjunction, cues)[0];
      return found === undefined ? null : one(found.roles);
    };
    const opening = this.previousFigure(index) === -1;
    // A percentage's words after it: six tokens at most, up to an edge, past a year ("of the 2026 Medicare fee schedule").
    let words = next;
    while (words < index + 7 && this.tokens[words]?.kind !== 'edge') {
      words += 1;
    }
    // Step 3 for a percentage is its step 2, which reads its own clause too.
    const steps: (() => Cued | null)[] = [
      () => this.respectively(index, family, cues),
      () => (family === 'percent' ? this.everyCue([[next, words], [own, index]], family, cues) : this.bound(index, cues)),
      () => this.nearestCue(own, index, family, cues),
      () => (family === 'amount' ? after(true) : null),
      () => this.everyCue([[since, own]], family, cues),
      () => this.reachBack(index, family, cues),
      () => (family === 'date' ? after(!opening) : null),
    ];
    for (const step of steps) {
      const found = step();
      if (found !== null) {
        return found;
      }
    }
    return ANY;
  }

  /** A page's roles: the one the cues in the words around it name (a cue is never across the figure), else either. */
  protected pageRoles(index: number): readonly FigureRole[] {
    const before = this.run(index, -1, notWord).length;
    const after = this.run(index, 1, notWord).length;
    const named = ordered(this.entries(this.cues(index - before, index + 1 + after, this.vocab.PAGE_CUES)).flatMap((entry) => entry.roles));
    return named.length === 1 ? named : ['citation_page', 'window_page'];
  }

  /** Which day count: the cue right after "days", else the nearest before since the figure before, else after, else any. */
  protected dayRoles(index: number, daysEnd: number): readonly FigureRole[] {
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
      right?.[1] ??
      this.nearestCue(this.ownFrom(index), index, undefined, cues)?.roles ??
      this.cues(daysEnd, this.nextBreak(daysEnd - 1, true), cues)[0]?.roles ??
      this.everyCue([[this.since(index), this.ownFrom(index)]], undefined, cues)?.roles;
    // A day count's cues name roles, never "any" (only a figure with no cue reads any, ANY).
    return found === undefined ? ['window_days', 'days_to_pay', 'days_late'] : ordered(found as readonly FigureRole[]);
  }

  /** A date's (a month's, a day of a month's) or a year's roles, a year before a fee schedule's noun the schedule's. */
  protected dateRoles(index: number, kind: ReadKind): Cued {
    if (kind === 'year' && this.vocab.SCHEDULE_NOUNS.has(this.word(index, 1))) {
      return one(['schedule_year']);
    }
    return this.role(index, 'date', this.vocab.DATE_CUES);
  }
}

/**
 * The words that state a total or all the lines, ADR 0086's cue tables as one list (design lane-b-packet-figure-placeholders,
 * section 4; docs/adr/0089): format /3's pass 2 fails a part fact (a code's, a claim's, a line's or a set of rows') in a
 * sentence that holds one of them in its free text (../verifier/contradiction.ts). Each is a phrase of lower-case words
 * as the reader's tokens give them: the closed list's total phrases ("in total", "in all"), "total" and "totals" (so "the
 * total" and "a total of"), "altogether" and "overall", every line ("each line", "every visit"), and all of the rows
 * ("all the lines", "all lines", "all of the claims", "across the lines", "across all the services").
 */
export function totalCues(vocab: Vocabulary = vocabulary()): readonly string[] {
  const rows = [...vocab.PLURAL_ROWS];
  return [
    ...vocab.TOTAL_PHRASES,
    'total',
    'totals',
    'altogether',
    'overall',
    ...[...vocab.EACH].flatMap((each) => [...vocab.ONE_LINE].map((line) => `${each} ${line}`)),
    ...rows.flatMap((noun) => [`all ${noun}`, `all the ${noun}`, `all of the ${noun}`, `all these ${noun}`, `across the ${noun}`, `across these ${noun}`]),
  ];
}

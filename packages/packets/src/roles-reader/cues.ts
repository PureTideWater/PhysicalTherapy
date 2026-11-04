import type { Cues } from '../roles-words';
import type { Figure } from '../scan';
import type { FigureRole, ReadKind, Token } from './kinds';
import { ANY, type Cued, type Entry, type Family, type Match, Walk, cueAt, nearest, notWord, one, ordered } from './walk';

/** A "respectively" list's cue: its roles and the token its words start at. */
export interface ListCue {
  readonly roles: readonly FigureRole[];
  readonly start: number;
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
   * The "respectively" list token `index` is in: the figures of its kind around it in its sentence, each joined to the
   * next by commas, "and" or "or" alone, when the sentence says "respectively" and the list has two or more (else null).
   */
  protected respectivelyList(index: number): readonly number[] | null {
    const start = this.sentenceStart(index);
    const sentence = this.tokens.slice(start, this.sentenceEnd(index));
    if (!sentence.some((token) => token.text === 'respectively')) {
      return null;
    }
    const figures = sentence.flatMap((token, at) => (token.figure === undefined ? [] : [start + at]));
    const kindOf = (at: number) => ((this.tokens[at] as Token).figure as Figure).kind;
    const joined = (from: number, to: number) => kindOf(from) === kindOf(to) && this.tokens.slice(from + 1, to).every((token) => token.text === ',' || token.text === 'and' || token.text === 'or');
    let first = figures.indexOf(index);
    let last = first;
    while (first > 0 && joined(figures[first - 1] as number, figures[first] as number)) {
      first -= 1;
    }
    while (last < figures.length - 1 && joined(figures[last] as number, figures[last + 1] as number)) {
      last += 1;
    }
    const list = figures.slice(first, last + 1);
    return list.length < 2 ? null : list;
  }

  /**
   * Whether tokens [from, to) are a scope phrase alone, the words of one ("in total", "per line", "on each of the
   * lines"; R1-NF-3): no verb and no other word.
   */
  protected scopeOnly(from: number, to: number): boolean {
    const words = new Set([...this.vocab.EACH, ...this.vocab.ONE_LINE, ...this.vocab.ONE_UNIT, ...this.vocab.LINES, ...this.vocab.PLURAL_ROWS, ...this.vocab.PARTITIVE_DETERMINERS, ...this.vocab.TOTAL_FOR, ...this.vocab.SCOPE_LEADS, ...this.vocab.TOTAL_WORDS.flatMap((phrase) => phrase.split(' '))]);
    const range = this.tokens.slice(from, to);
    // A figure ends the list's words before it (afterList()), so none is here.
    return range.length > 0 && range.every((token) => words.has(token.text));
  }

  /**
   * Whether token `at` (from `from` up to `to`) opens a clause of its own after a "respectively" list: a clause's opener
   * ("which", "as", "so"), or, first after "respectively" or after an edge, a conjunction, "with" or a participle that
   * is no total's word nor a cue ("respectively, and each line is short", "leaving each line short"; NEW-N1, R1-NF-1),
   * before words of their own besides a scope: before a scope phrase alone up to the next edge, it is the list's
   * ("respectively, being per line", "applying to each line", "with each line", "and for each line"; R2-NEW-R2P2-2).
   */
  protected opensClause(at: number, from: number, to: number, cues: Cues): boolean {
    const text = (this.tokens[at] as Token).text;
    if (this.vocab.CLAUSE_OPENERS.has(text)) {
      return true;
    }
    if (at !== from && (this.tokens[at - 1] as Token).kind !== 'edge') {
      return false;
    }
    const participle = this.vocab.ING_WORD.test(text) && !this.vocab.TOTAL_WORDS.includes(text) && !this.cues(at, to, cues).some((match) => match.start === at);
    if (!(this.vocab.CONJUNCTIONS.has(text) || this.vocab.CLAUSE_LEADS.has(text) || participle)) {
      return false;
    }
    const edge = this.tokens.slice(at + 1, to).findIndex((token) => token.kind === 'edge');
    return !this.scopeOnly(at + 1, edge === -1 ? to : at + 1 + edge);
  }

  /**
   * Where the words of a "respectively" list from token `from` (before `to`) end: at the first edge the clause after
   * which (to the next edge) has no cue ("were expected, allowed and paid" goes on), unless that clause is a scope
   * phrase alone right after a cue ("expected, in total, and allowed, per line"; R1-NF-3), and, with `openers`, at a
   * word that opens a clause of its own (opensClause(): "which the payer allowed for each line", "as", ", and").
   */
  protected listWordsEnd(from: number, to: number, openers: boolean, cues: Cues): number {
    const opener = openers ? this.tokens.slice(from, to).findIndex((_, at) => this.opensClause(from + at, from, to, cues)) : -1;
    const end = opener === -1 ? to : from + opener;
    const words = this.tokens.slice(from, end);
    const cueEnds = new Set(this.cues(from, end, cues).map((match) => match.end));
    const edge = words.findIndex((token, at) => {
      if (token.kind !== 'edge') {
        return false;
      }
      const next = words.findIndex((other, after) => after > at && other.kind === 'edge');
      const clause = [from + at + 1, next === -1 ? end : from + next] as const;
      return this.cues(...clause, cues).length === 0 && !(cueEnds.has(from + at - 1) && this.scopeOnly(...clause));
    });
    return edge === -1 ? end : from + edge;
  }

  /**
   * The words after a "respectively" list that are the list's own (docs/adr/0086, NEW-N1): `before`, those after its
   * last figure up to "respectively", or to the next figure or the sentence's end when it is not after the list; and
   * `after`, past "respectively" and the commas after it, those up to the next figure or the sentence's end (none when
   * "respectively" is not after the list). Each ends at an edge the clause after which has no cue, and `after` at a
   * word that opens a clause of its own ("which the payer explained for each line").
   */
  protected afterList(list: readonly number[], cues: Cues): { readonly before: readonly [number, number]; readonly after: readonly [number, number] } {
    const last = list.at(-1) as number;
    const end = this.sentenceEnd(last);
    const figure = this.tokens.slice(last + 1, end).findIndex((token) => token.figure !== undefined);
    const next = figure === -1 ? end : last + 1 + figure;
    const word = this.tokens.slice(last + 1, next).findIndex((token) => token.text === 'respectively');
    const until = word === -1 ? next : last + 1 + word;
    const from = until + 1 + this.run(until, 1, (token) => token.text !== ',').length;
    const start = last + 1;
    return { before: [start, this.listWordsEnd(start, until, false, cues)], after: [from, this.listWordsEnd(from, next, true, cues)] };
  }

  /**
   * A "respectively" list's cues, in order, one for each run of the same roles, each with the token its words start
   * at, and the token the stretch they are read from ends at: the cues before the list (since the figure before it),
   * else those after it up to "respectively" or its clause's edge, else those after "respectively" (afterList()).
   */
  protected listCues(list: readonly number[], family: Family, cues: Cues): { readonly cues: readonly ListCue[]; readonly end: number } {
    const order = (from: number, to: number) => {
      const found: ListCue[] = [];
      for (const entry of this.entries(this.cues(from, to, cues), family)) {
        const previous = found.at(-1);
        if (previous === undefined || previous.roles.join() !== entry.roles.join()) {
          found.push({ roles: entry.roles, start: entry.match.start });
        }
      }
      return { cues: found, end: to };
    };
    const first = list[0] as number;
    const opening = order(this.since(first), first);
    if (opening.cues.length > 0) {
      return opening;
    }
    const { before, after } = this.afterList(list, cues);
    const inner = order(...before);
    return inner.cues.length > 0 ? inner : order(...after);
  }

  /**
   * Step 1: a list's figures mapped, in order, to the cues before it, or, with none before it, to the cues after it
   * ("$100.00 and $70.00 were expected and allowed, respectively"): up to "respectively" or the first edge, else past
   * "respectively" up to the next edge or a word that opens a clause of its own (listCues()). When the cues do not
   * match the list one for one, every figure is held in all of them. With no cue on either side, the steps after read
   * each figure.
   */
  protected respectively(index: number, family: Family, cues: Cues): Cued | null {
    const list = this.respectivelyList(index);
    if (list === null) {
      return null;
    }
    const mapped = this.listCues(list, family, cues).cues.map((cue) => cue.roles);
    if (mapped.length === 0) {
      return null;
    }
    return mapped.length === list.length ? one(mapped[list.indexOf(index)] as readonly FigureRole[]) : { roles: ordered(mapped.flat()), every: true };
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

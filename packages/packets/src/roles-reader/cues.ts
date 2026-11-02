import type { Cues } from '../roles-words';
import type { FigureRole, ReadKind } from './kinds';
import { ANY, type Cued, type Entry, type Family, type Match, Walk, cueAt, nearest, notWord, ordered } from './walk';

/**
 * The role reader's second layer (../roles.ts, steps 1 to 8; docs/adr/0086): the role of an amount, a percentage, a
 * date, a day count and a page from one cue's roles, never the union of every cue around it.
 */
export class CueReader extends Walk {
  /** Every cue of `cues` that consecutive words of tokens [from, to) match, outermost only (a cue inside a longer one is the longer one's). */
  protected cues(from: number, to: number, cues: Cues): Match[] {
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
  protected entries(matches: readonly Match[], family: Family): Entry[] {
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
  protected subject(copula: Match, family: Family, cues: Cues): Entry | undefined {
    let from = copula.start;
    while (from > 0 && this.tokens[from - 1]?.kind !== 'edge') {
      from -= 1;
    }
    return nearest(this.entries(this.cues(from, copula.start, cues), family).filter((entry) => !this.vocab.COPULAS.has(entry.match.phrase)));
  }

  /** An entry as it stands, a copula replaced by its subject. */
  protected resolved(entry: Entry, family: Family, cues: Cues): Entry {
    return family === 'amount' && this.vocab.COPULAS.has(entry.match.phrase) ? (this.subject(entry.match, family, cues) ?? entry) : entry;
  }

  /** Step 3: the nearest cue of tokens [from, to), as it counts. */
  protected nearestCue(from: number, to: number, family: Family, cues: Cues): Cued | null {
    const found = nearest(this.entries(this.cues(from, to, cues), family));
    return found === undefined ? null : { roles: ordered(this.resolved(found, family, cues).roles), every: false };
  }

  /** Step 5: the cues of the stretches given; one role, or, when they name several, every one of them. */
  protected everyCue(stretches: readonly (readonly [number, number])[], family: Family, cues: Cues): Cued | null {
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
  protected bound(index: number, family: Family, cues: Cues): Cued | null {
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
  protected respectively(index: number, family: Family, cues: Cues): Cued | null {
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
  protected reachBack(index: number, family: Family, cues: Cues): Cued | null {
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
  protected role(index: number, family: 'amount' | 'date' | 'percent', cues: Cues): Cued {
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

  protected pageRoles(index: number): readonly FigureRole[] {
    const before = this.run(index, -1, notWord).length;
    const after = this.run(index, 1, notWord).length;
    const found = this.entries([...this.cues(index - before, index, this.vocab.PAGE_CUES), ...this.cues(index + 1, index + 1 + after, this.vocab.PAGE_CUES)], 'page');
    const specific = ordered(found.filter((entry) => entry.roles.length === 1).flatMap((entry) => entry.roles));
    return specific.length === 1 ? specific : ['citation_page', 'window_page'];
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
  protected dateRoles(index: number, kind: ReadKind): Cued {
    if (kind === 'year' && this.vocab.SCHEDULE_NOUNS.has(this.word(index, 1))) {
      return { roles: ['schedule_year'], every: false };
    }
    return this.role(index, 'date', this.vocab.DATE_CUES);
  }
}

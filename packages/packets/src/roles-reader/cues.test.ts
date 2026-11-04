import { describe, expect, it } from 'vitest';

import { readFigures } from '../roles';
import { type Cues, vocabulary } from '../roles-words';
import { CueReader } from './cues';
import type { Family } from './walk';
import { tokenize } from './walk';

/**
 * The role reader's second layer (./cues.ts; docs/adr/0086) held to its answers at its edges: which cues a stretch of
 * words holds and how each counts, a list read "respectively", the noun a figure completes with "of", the words after
 * a figure, a page's and a day count's cues. ../roles.test.ts holds the reader's rules as the ADR states them.
 */

/** CueReader's steps, open to these tests, over a text's tokens. */
class Open extends CueReader {
  static of(text: string): Open {
    const vocab = vocabulary();
    return new Open(text, tokenize(text, vocab), vocab);
  }

  /** The phrases of the cues of tokens [from, to). */
  found(from: number, to: number, cues: Cues): string[] {
    return this.cues(from, to, cues).map((match) => match.phrase);
  }

  /** The phrases of the text's amount cues as each counts for `family`. */
  kept(family?: Family): string[] {
    return this.entries(this.cues(0, this.tokens.length, this.vocab.AMOUNT_CUES), family).map((entry) => entry.match.phrase);
  }

  every(stretches: readonly (readonly [number, number])[], cues: Cues) {
    return this.everyCue(stretches, undefined, cues);
  }

  boundAt(index: number, cues: Cues) {
    return this.bound(index, cues);
  }
}

/** The figure written as `written` in `text`, read. */
function reading(text: string, written: string) {
  const found = readFigures(text).readings.find((item) => text.slice(item.figure.start, item.figure.end) === written);
  if (found === undefined) {
    throw new Error(`no figure ${written} in ${text}`);
  }
  return found;
}
const roles = (text: string, written: string) => {
  const found = reading(text, written).roles;
  return Array.isArray(found) ? found.join(' ') : found;
};

describe('the cues of a stretch', () => {
  it('are every cue its words match, outermost only: a cue inside a longer one, or starting with it, is the longer one’s', () => {
    const cues: Cues = [
      ['a b c', ['allowed']],
      ['a', ['paid']],
      ['b', ['expected']],
      ['x', ['variance']],
    ];
    expect(Open.of('x a b c').found(0, 4, cues)).toEqual(['x', 'a b c']);
    expect(Open.of('a b x').found(0, 3, cues)).toEqual(['a', 'b', 'x']);
  });
});

describe('a stretch’s amount cues as each counts', () => {
  it('drop a noun after the payer’s act as its object, unless an edge, a figure or a conjunction is between', () => {
    expect(Open.of('paid the shortfall').kept('amount')).toEqual(['paid']);
    expect(Open.of('x, paid the shortfall').kept('amount')).toEqual(['paid']);
    expect(Open.of('paid, the shortfall').kept('amount')).toEqual(['paid', 'shortfall']);
    expect(Open.of('paid and the shortfall').kept('amount')).toEqual(['paid', 'shortfall']);
  });

  it('take the act nearest before a noun: a verb that is no payer’s act keeps it', () => {
    expect(Open.of('paid expected the shortfall').kept('amount')).toEqual(['paid', 'expected', 'shortfall']);
  });

  it('drop a participle right after a noun, and keep one a word away', () => {
    expect(Open.of('interest owed').kept('amount')).toEqual(['interest']);
    expect(Open.of('interest x owed').kept('amount')).toEqual(['interest', 'owed']);
  });

  it('read an amount’s rules for amounts alone', () => {
    expect(Open.of('interest owed').kept()).toEqual(['interest', 'owed']);
    expect(Open.of('paid the shortfall').kept('percent')).toEqual(['paid', 'shortfall']);
  });
});

describe('the cues of several stretches', () => {
  it('hold a figure in every role they name when one names a role the nearest does not', () => {
    const cues: Cues = [
      ['a', ['allowed']],
      ['b', ['allowed', 'paid']],
    ];
    expect(Open.of('b x a').every([[0, 1], [2, 3]], cues)).toEqual({ roles: ['allowed', 'paid'], every: true });
    expect(Open.of('a x b').every([[0, 1], [2, 3]], cues)).toEqual({ roles: ['allowed', 'paid'], every: false });
  });
});

describe('the noun a figure completes with "of"', () => {
  const cues: Cues = [['s', ['variance']]];

  it('ends right before "of" or one word before it, within its own clause', () => {
    expect(Open.of('x s of 5').boundAt(3, cues)).toEqual({ roles: ['variance'], every: false });
    expect(Open.of('s x of 5').boundAt(3, cues)).toEqual({ roles: ['variance'], every: false });
    expect(Open.of('s x y of 5').boundAt(4, cues)).toBeNull();
    expect(Open.of('a, s of 5').boundAt(4, cues)).toEqual({ roles: ['variance'], every: false });
  });

  it('is one word before "of" only when a determiner is between: never before a determiner alone, nor before "of" and another word', () => {
    expect(Open.of('s of the 5').boundAt(3, cues)).toEqual({ roles: ['variance'], every: false });
    expect(Open.of('s x the 5').boundAt(3, cues)).toBeNull();
    expect(Open.of('s of x 5').boundAt(3, cues)).toBeNull();
  });

  it('is read past "of" after the figure, and before "of the" with the figure after it', () => {
    expect(roles('The payer paid $90.00 of shortfall.', '$90.00')).toBe('variance');
    expect(roles('The payer paid the contract rate of the $56.00.', '$56.00')).toBe('expected');
  });
});

describe('a copula', () => {
  it('takes its subject from its own clause, never past an edge, and never another copula', () => {
    expect(roles('The shortfall was noted, and it comes to $90.00.', '$90.00')).toBe('expected');
    expect(roles('The shortfall came to what comes to $90.00.', '$90.00')).toBe('variance');
  });
});

describe('"respectively"', () => {
  it('maps the list in its own sentence alone', () => {
    expect(roles('These are paid respectively. The payer allowed $1.00 and $9.00.', '$1.00')).toBe('allowed');
  });

  it('maps a list of the kind of the last figure before "respectively", joined by commas, "and" or "or" alone (rule 3)', () => {
    // Figures of two kinds are no list in a plain form: each fails (PE3-3).
    expect(reading('The payer allowed and paid $1.00 and 5%, respectively.', '$1.00')).toMatchObject({ roles: 'any', unread: true });
    expect(reading('The payer allowed and paid $1.00 and 5%, respectively.', '5%')).toMatchObject({ roles: 'any', unread: true });
    expect(reading('The contract expected and the payer allowed $1.00 and then $9.00, respectively.', '$1.00')).toMatchObject({ roles: 'any', unread: true });
    expect(roles('The contract expected or the payer allowed $1.00 or $9.00, respectively.', '$1.00')).toBe('expected');
    expect(roles('On 2026-01-05 the contract expected and the payer allowed $1.00 and $9.00, respectively.', '$1.00')).toBe('expected');
  });

  it('maps no figure alone, nor a list with no cue before it or after it: each fails', () => {
    expect(reading('The contract expected and the payer allowed $9.00, respectively.', '$9.00')).toMatchObject({ roles: 'any', unread: true });
    expect(reading('These were $1.00 and $9.00, respectively.', '$1.00')).toMatchObject({ roles: 'any', unread: true });
  });

  it('maps a list with no cue before it to the cues right after it, in order (CORR-D1)', () => {
    expect(reading('$1.00 and $9.00 were allowed and paid, respectively.', '$1.00')).toMatchObject({ roles: ['allowed'], every: false, unread: false });
    expect(reading('$1.00 and $9.00 were allowed and paid, respectively.', '$9.00')).toMatchObject({ roles: ['paid'], every: false, unread: false });
    // Past "respectively" when it comes first, up to an edge once each figure has its cue.
    expect(reading('$1.00 and $9.00 were, respectively, allowed and paid, and 5% is owed.', '$9.00')).toMatchObject({ roles: ['paid'], every: false });
    expect(reading('$1.00 and $9.00, respectively, were the allowed and paid amounts, so 5% is owed.', '$1.00')).toMatchObject({ roles: ['allowed'], every: false });
    // To "respectively" when it comes after the cues, whatever follows its edge.
    expect(reading('So. $1.00 and $9.00 were expected and allowed, respectively, paid late.', '$1.00')).toMatchObject({ roles: ['expected'], every: false });
    // "respectively" before the list, or not one cue for each figure: every figure fails, held to no role.
    for (const text of ['$1.00 and $9.00 were allowed, respectively.', 'These were $1.00 and $9.00, respectively.']) {
      expect(reading(text, '$1.00'), text).toMatchObject({ roles: 'any', unread: true });
      expect(reading(text, '$9.00'), text).toMatchObject({ roles: 'any', unread: true });
    }
    // After a "respectively" with no list before it, each figure fails, whatever its own words read.
    for (const text of ['Respectively, $1.00 and $9.00 were allowed and paid on 2026-01-05.', 'Respectively, $1.00 and $9.00 were allowed and paid']) {
      expect(reading(text, '$1.00'), text).toMatchObject({ unread: true });
      expect(reading(text, '$9.00'), text).toMatchObject({ unread: true });
    }
  });
});

describe('a "respectively" list’s two plain forms, word by word (rule 3)', () => {
  const unread = (text: string, written: string) => reading(text, written).unread;
  const scope = (text: string, written: string) => reading(text, written).scope;

  it('finds its "respectively" in the figure’s own sentence, after the list, and none before the list of the same sentence', () => {
    // Another sentence's "respectively" is no list's; one in the figure's sentence before its list leaves it unread.
    expect(unread('The payer paid respectively. The contract expected and the payer allowed $1.00 and $9.00.', '$1.00')).toBe(false);
    expect(unread('The contract expected and the payer allowed $1.00 and $9.00. These were paid respectively.', '$1.00')).toBe(false);
    expect(unread('So. Respectively, $1.00 and $9.00 were allowed and paid.', '$1.00')).toBe(true);
    expect(unread('So. Respectively, $1.00 and $9.00 were allowed and paid.', '$9.00')).toBe(true);
    expect(unread('So. The payer allowed respectively $1.00 and $9.00.', '$9.00')).toBe(true);
    // A list before a second "respectively": its own; a figure after a "respectively" that has its list reads as any other.
    expect(roles('$1.00 and $9.00 were allowed and paid, respectively, and $2.00 and $3.00 were expected and owed, respectively.', '$3.00')).toBe('variance');
    expect(roles('$1.00 and $9.00 were allowed and paid, respectively, and the payer paid $2.00.', '$2.00')).toBe('paid');
  });

  it('is of the kind of the last amount, percentage or date before "respectively"', () => {
    for (const [text, written] of [
      ['These were 2026-02-10 and 2026-04-08, respectively.', '2026-02-10'],
      ['These were March 2026 and April 2026, respectively.', 'March 2026'],
      ['These were March 5 and April 8, respectively.', 'March 5'],
      ['These were 5% and 9%, respectively.', '5%'],
    ] as const) {
      expect(unread(text, written), text).toBe(true);
    }
    expect(roles('The claims were received and paid on 2026-02-10 and 2026-04-08, respectively.', '2026-04-08')).toBe('paid_date');
    // A count before "respectively" is no list's kind: the amounts before it are the list.
    expect(unread('$1.00 and $9.00 for 3 lines were allowed and paid, respectively.', '$1.00')).toBe(true);
  });

  it('leaves a figure after "respectively" to its own words only when a list stood before that "respectively"', () => {
    expect(unread('$1.00 and $9.00, respectively, respectively $2.00 was paid.', '$2.00')).toBe(true);
    expect(unread('$2.00 respectively, $1.00 is allowed.', '$1.00')).toBe(false);
    expect(unread('$2.00 respectively, $1.00 is allowed.', '$2.00')).toBe(true);
    expect(unread('The payer paid $2.00.', '$2.00')).toBe(false);
  });

  it('joins its figures by commas, "and" or "or" alone', () => {
    expect(roles('$1.00, $2.00 and $9.00 were expected, allowed and paid, respectively.', '$2.00')).toBe('allowed');
    expect(roles('$1.00 or $9.00 were allowed or paid, respectively.', '$9.00')).toBe('paid');
    expect(unread('$1.00 then $9.00 were allowed and paid, respectively.', '$1.00')).toBe(true);
  });

  it('reads its cues before it back over commas, cues and its own words, from the first cue, never past another word', () => {
    expect(roles('The contract expected, and the payer allowed, $1.00 and $9.00, respectively.', '$9.00')).toBe('allowed');
    expect(roles('Under the contract we see the payer allowed and paid $1.00 and $9.00, respectively.', '$1.00')).toBe('allowed');
    expect(roles('Under the contract we see the payer allowed and paid $1.00 and $9.00, respectively.', '$9.00')).toBe('paid');
    expect(unread('The contract expected – and the payer allowed $1.00 and $9.00, respectively.', '$1.00')).toBe(true);
    // "respectively" right after the list, with or without its comma, then an edge or the text's end.
    expect(roles('The contract expected and the payer allowed $1.00 and $9.00 respectively.', '$1.00')).toBe('expected');
    expect(roles('The contract expected and the payer allowed $1.00 and $9.00, respectively', '$9.00')).toBe('allowed');
    expect(unread('The contract expected and the payer allowed $1.00 and $9.00 more, respectively.', '$1.00')).toBe(true);
    expect(unread('The contract expected and the payer allowed $1.00 and $9.00, respectively for each line.', '$1.00')).toBe(true);
  });

  it('reads its cues after it to "respectively", or past it to an edge, one cue for each run of the same roles', () => {
    expect(roles('$1.00 and $9.00 were expected and allowed respectively.', '$9.00')).toBe('allowed');
    expect(roles('$1.00 and $9.00 were expected and allowed, respectively', '$1.00')).toBe('expected');
    expect(roles('$1.00 and $9.00 were the contract expected and allowed amounts, respectively.', '$9.00')).toBe('allowed');
    expect(roles('$1.00 and $9.00, respectively, were expected and allowed, and the payer paid less.', '$9.00')).toBe('allowed');
    // A second "respectively", a colon or a dash among them, or a word of its own after the list ends them.
    expect(unread('$1.00 and $9.00 respectively were respectively expected and allowed.', '$1.00')).toBe(true);
    expect(unread('$1.00 and $9.00 were: expected and allowed, respectively.', '$1.00')).toBe(true);
    expect(unread('$1.00 and $9.00 were – expected and allowed, respectively.', '$1.00')).toBe(true);
    expect(unread('$1.00 and $9.00 were then expected and allowed, respectively.', '$1.00')).toBe(true);
    expect(unread('$1.00 and $9.00, respectively, were the expected and allowed amounts for 3 claims.', '$1.00')).toBe(true);
    expect(roles('$1.00 and $9.00, respectively, were allowed and paid', '$9.00')).toBe('paid');
  });

  it('gives each figure the scope phrase right after its cue’s words, and the whole list the one right after the list or right after "amounts" after the last cue', () => {
    // A cue's own phrase and the whole list's that differ: none (rule 3, strict).
    expect(scope('$1.00 and $9.00 were the expected amounts in total and the allowed amounts per line, respectively.', '$1.00')).toBe(null);
    expect(scope('$1.00 and $9.00 were the expected amounts per line and the allowed amounts per line, respectively.', '$1.00')).toBe('line');
    expect(scope('$1.00 and $9.00 were the expected amounts in total and the allowed amounts per line, respectively.', '$9.00')).toBe('line');
    expect(scope('$1.00 and $9.00 were expected in total and allowed amounts per line, respectively.', '$1.00')).toBe(null);
    expect(scope('$1.00 and $9.00 in total were expected and allowed, respectively.', '$1.00')).toBe('total');
    expect(scope('The expected amounts in total and allowed amounts per line were $1.00 and $9.00, respectively.', '$1.00')).toBe(null);
    // A phrase before a cue is beside no cue.
    expect(scope('The contract per line expected and the payer allowed in total $1.00 and $9.00, respectively.', '$1.00')).toBe(null);
    expect(scope('The contract per line expected and the payer allowed in total $1.00 and $9.00, respectively.', '$9.00')).toBe('total');
    expect(scope('$1.00, $2.00 and $9.00 were the expected, allowed and paid amounts per line, respectively.', '$1.00')).toBe('line');
    // "amounts" after a cue before the last is that cue's alone.
    expect(scope('$1.00 and $9.00 were the expected amounts per line and the allowed, respectively.', '$9.00')).toBe(null);
    // A participle after its noun is the noun's, so the cue's words end after it.
    expect(scope('$1.00 and $9.00 were the interest owed in total and the shortfall per line, respectively.', '$1.00')).toBe('total');
    expect(scope('$1.00 and $9.00 were the interest owed in total and the shortfall per line, respectively.', '$9.00')).toBe('line');
    // A cue of two words: its words end after the participle after it too.
    expect(scope('$1.00 and $9.00 were the patient share owed in total and the shortfall per line, respectively.', '$1.00')).toBe('total');
    // With its cues before it, no token after the list is the whole list's: the text's first words are none either.
    expect(scope('In total the contract expected and the payer allowed $1.00 and $9.00, respectively.', '$1.00')).toBe(null);
    // "amounts" after the last cue's participle is the whole list's noun.
    expect(scope('$1.00 and $9.00 were the shortfall and the interest owed amounts in total, respectively.', '$1.00')).toBe('total');
  });
});

describe('the words around a figure', () => {
  it('reach back to a percentage before it with no cue between, and take its roles', () => {
    expect(reading('Under Medicare, interest is 9% and 12% too.', '12%')).toMatchObject({ roles: ['interest_rate'], every: false });
  });

  it('reach back past a figure of another family to the words since the one before it', () => {
    expect(reading('The payer received it on 2026-01-04 and paid $50.00 on 2026-01-05.', '2026-01-05')).toMatchObject({ roles: ['paid_date'], every: false });
  });

  it('after a date that does not open its sentence and has no cue before it: up to a comma', () => {
    expect(roles('There were 3 claims and then 2026-01-05, paid.', '2026-01-05')).toBe('any');
    expect(roles('2026-01-05, paid.', '2026-01-05')).toBe('paid_date');
  });

  it('after an amount: up to a comma, or a conjunction that opens the next clause', () => {
    expect(roles('Yes, and $100.00 was due.', '$100.00')).toBe('expected variance');
    expect(roles('$100.00 was due and the payer paid.', '$100.00')).toBe('expected variance');
    expect(roles('$100.00, the payer paid.', '$100.00')).toBe('any');
    expect(roles('$100.00 came in and the payer paid it.', '$100.00')).toBe('any');
  });

  it('around a page: the cues after it too', () => {
    expect(roles('See page 4 of the dispute window.', '4')).toBe('window_page');
    expect(roles('See page 4 for the window.', '4')).toBe('window_page');
  });

  it('after a day count: the cue right after "days", else after it up to a comma or a figure, else the clauses before it', () => {
    expect(roles('The dispute was raised 30 days late.', '30')).toBe('days_late');
    expect(roles('It took 30 days, late.', '30')).toBe('window_days days_to_pay days_late');
    expect(roles('To dispute, the payer has 30 days.', '30')).toBe('window_days');
  });

  it('keep a day count’s words for it: its cue after "days", an anchor and up to three words after the anchor', () => {
    expect(roles('The claim was 30 days late, paid on 2026-01-05.', '2026-01-05')).toBe('paid_date');
    expect(roles('The claim was 30 days late after payment on 2026-01-05.', '2026-01-05')).toBe('any');
    expect(roles('The payer has 30 days to pay after the payment date, 2026-01-05.', '2026-01-05')).toBe('any');
    expect(roles('The window ends 3650 days after the date of the payment on 2026-01-05.', '2026-01-05')).toBe('paid_date');
    expect(roles('The window ends 3650 days after the date of payment on 2026-01-05.', '2026-01-05')).toBe('paid_date');
    expect(roles('The window ends 3650 days after payment, paid on 2026-01-05.', '2026-01-05')).toBe('paid_date');
    expect(roles('The window ends 3650 days after the date', '3650')).toBe('window_days');
  });

  it('read a year alone before a fee schedule’s noun as the schedule’s, never a full date', () => {
    expect(roles('The 2026-01-05 fee schedule applies.', '2026-01-05')).toBe('any');
    expect(roles('The 2026 fee schedule applies.', '2026')).toBe('schedule_year');
  });
});

describe('a "respectively" list’s clause and its cues’ own words (CORR3-2, PE3-3, PE3-1)', () => {
  it('leaves a figure of a clause an edge and a conjunction start before the list its own, and fails every other one of the list’s clause outside a plain form', () => {
    for (const text of [
      'The payer paid $5.00 per line, and the contract expected $1.00 and $2.00, respectively.',
      'The payer paid $5.00, and the contract expected $1.00 and $2.00, respectively.',
      'The payer paid $5.00 per line, and $1.00 and $2.00 were expected, respectively.',
    ]) {
      expect(reading(text, '$5.00'), text).toMatchObject({ roles: ['paid'], unread: false });
      expect(reading(text, '$1.00'), text).toMatchObject({ roles: 'any', unread: true });
      expect(reading(text, '$2.00'), text).toMatchObject({ unread: true });
    }
    // Without the edge and the conjunction, one clause: every figure of it fails; a subordinator opens no clause of its own.
    expect(reading('The payer paid $5.00 per line and the contract expected $1.00 and $2.00, respectively.', '$5.00').unread).toBe(true);
    expect(reading('The payer paid $5.00 per line, because the contract expected $1.00 and $2.00, respectively.', '$5.00').unread).toBe(true);
    // A clause opened after the list is no list's start: the list fails as a list.
    expect(reading('$1.00 and $2.00, which were expected and allowed, respectively.', '$1.00').unread).toBe(true);
    // An Oxford comma joins the list.
    const oxford = '$1.00, $2.00, and $3.00 were the expected, allowed and paid amounts, respectively.';
    expect(roles(oxford, '$2.00')).toBe('allowed');
    expect(reading(oxford, '$3.00')).toMatchObject({ roles: ['paid'], unread: false });
  });

  it('reads a run of percentages or dates in a plain form by its own family’s cues, so another figure of its clause reads as any other', () => {
    const percent = 'The payer paid $1.00 per line and the contract and interest are 112.5% and 9%, respectively.';
    expect(reading(percent, '$1.00')).toMatchObject({ roles: ['paid'], unread: false });
    expect(roles(percent, '9%')).toBe('interest_rate');
    const dates = 'The payer allowed $1.00 per line and the services were billed and paid on 2026-01-05 and 2026-01-07, respectively.';
    expect(reading(dates, '$1.00')).toMatchObject({ roles: ['allowed'], unread: false });
    expect(roles(dates, '2026-01-07')).toBe('paid_date');
    const days = 'The payer allowed $1.00 per line and the services were billed and paid on March 5 and March 7, respectively.';
    expect(reading(days, '$1.00')).toMatchObject({ roles: ['allowed'], unread: false });
    // A sentence that opens with a conjunction.
    expect(roles('And the contract expected and the payer allowed $1.00 and $2.00, respectively.', '$2.00')).toBe('allowed');
  });

  it('gives a cue the phrase right after its own words alone, never one before it nor one set off by a comma', () => {
    const scope = (text: string, written: string) => reading(text, written).scope;
    expect(scope('$1.00 and $2.00 were expected in total, allowed per line, respectively.', '$2.00')).toBe('line');
    expect(scope('$1.00 and $2.00 were expected in total allowed per line, respectively.', '$2.00')).toBe('line');
    expect(scope('$1.00 and $2.00 were expected in total allowed per line, respectively.', '$1.00')).toBe('total');
    expect(scope('$1.00 and $2.00 were expected, in total, allowed per line, respectively.', '$1.00')).toBeNull();
    expect(scope('The payer allowed $5.00 per line, the contract expected and the payer paid $1.00 and $2.00, respectively.', '$1.00')).toBeNull();
    expect(scope('The contract expected and per line the payer paid $1.00 and $2.00, respectively.', '$2.00')).toBeNull();
    expect(scope('The contract expected and per line the payer paid $1.00 and $2.00, respectively.', '$1.00')).toBeNull();
  });
});

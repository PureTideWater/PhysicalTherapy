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

  it('maps a list of one kind joined by commas, "and" or "or" alone', () => {
    expect(roles('The payer allowed and paid $1.00 and 5%, respectively.', '$1.00')).toBe('paid');
    expect(roles('The contract expected and the payer allowed $1.00 and then $9.00, respectively.', '$1.00')).toBe('allowed');
    expect(roles('The contract expected or the payer allowed $1.00 or $9.00, respectively.', '$1.00')).toBe('expected');
    expect(roles('On 2026-01-05 the contract expected and the payer allowed $1.00 and $9.00, respectively.', '$1.00')).toBe('expected');
  });

  it('maps no figure alone, nor a list with no cue before it', () => {
    expect(reading('The contract expected and the payer allowed $9.00, respectively.', '$9.00')).toMatchObject({ roles: ['allowed'], every: false });
    expect(reading('$1.00 and $9.00 were allowed and paid, respectively.', '$1.00')).toMatchObject({ roles: 'any', every: false });
  });
});

describe('the words around a figure', () => {
  it('reach back to a percentage before it with no cue between, and take its roles', () => {
    expect(reading('Under Medicare, interest is 9% and 12% too.', '12%')).toMatchObject({ roles: ['interest_rate'], every: false });
  });

  it('reach back past a figure of another family to the words since the one before it', () => {
    expect(reading('The payer received it on 2026-01-04 and paid $50.00 on 2026-01-05.', '2026-01-05')).toMatchObject({ roles: ['paid_date'], every: false });
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

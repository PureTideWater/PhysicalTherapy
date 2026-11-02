import { describe, expect, it } from 'vitest';

import { readFigures } from '../roles';

/**
 * The role reader's third layer (./numbers.ts; docs/adr/0086) held to its answers at its edges: where an amount's or a
 * count's own words end (what the figure after it reads in its place), what an amount is stated per when its words are
 * far from it, the partitive's and a list's boundaries. ../roles.test.ts holds the reader's rules as the ADR states them.
 */

/** The figure written as `written` in `text`, read. */
function reading(text: string, written: string) {
  const found = readFigures(text).readings.find((item) => text.slice(item.figure.start, item.figure.end) === written);
  if (found === undefined) {
    throw new Error(`no figure ${written} in ${text}`);
  }
  return found;
}
const scope = (text: string, written: string) => reading(text, written).scope;
const roles = (text: string, written: string) => {
  const found = reading(text, written).roles;
  return Array.isArray(found) ? found.join(' ') : found;
};

describe('what an amount is stated per', () => {
  it('reads "each of" past determiners and figures to its noun, and nothing per line without one', () => {
    expect(scope('The payer paid $5.00 to each of 3.', '$5.00')).toBeNull();
    expect(scope('The payer paid $5.00 for each of the 3 claims.', '$5.00')).toBeNull();
    expect(scope('The payer paid $5.00 for each of the 3 lines.', '$5.00')).toBe('line');
  });

  it('reads "a" before a noun that is no line or unit as nothing, so a total’s words after it still count', () => {
    expect(scope('The payer paid $90.00 a claim in total.', '$90.00')).toBe('total');
  });

  it('reads "for", "across" or "over" before the rows in the plural as a total, past determiners and figures, and nothing before other words', () => {
    expect(scope('$90.00 paid for these 3 lines.', '$90.00')).toBe('total');
    expect(scope('$90.00 paid across the claims.', '$90.00')).toBe('total');
    expect(scope('$90.00 paid for the payer.', '$90.00')).toBeNull();
    expect(scope('$90.00 paid for 3.', '$90.00')).toBeNull();
    // Only the words of its own stretch: a later sentence's "for these 3 lines" is not this amount's.
    expect(scope('Note. The payer paid $5.00. It was for these 3 lines.', '$5.00')).toBeNull();
  });

  it('reads the words after it up to the next amount or edge, seven at most', () => {
    expect(scope('$5.00 was paid to us by the payer apiece.', '$5.00')).toBeNull();
    expect(scope('$5.00 was paid by the payer apiece.', '$5.00')).toBe('line');
    expect(scope('The payer paid $5.00 and $6.00 apiece.', '$5.00')).toBeNull();
    expect(scope('The payer paid $5.00 and $6.00 apiece.', '$6.00')).toBe('line');
    expect(scope('The payer paid $5.00', '$5.00')).toBeNull();
  });

  it('reads "each", "every", "per" or "apiece" anywhere before it in its sentence as stated per something, never in total', () => {
    expect(scope('Apiece, 3 lines were paid $5.00.', '$5.00')).toBeNull();
    expect(scope('Per claim, 3 lines were paid $5.00.', '$5.00')).toBeNull();
    expect(scope('Every visit, 3 lines were paid $5.00.', '$5.00')).toBeNull();
    expect(scope('Each visit, 3 lines were paid $5.00.', '$5.00')).toBeNull();
    expect(scope('Then 3 lines were paid $5.00.', '$5.00')).toBe('total');
  });
});

describe('an amount’s own words', () => {
  it('end after a total’s words right after it, so the amount after reads its own', () => {
    expect(reading('Each line was paid $90.00 in total and $30.00.', '$90.00').scope).toBe('total');
    expect(scope('Each line was paid $90.00 in total and $30.00.', '$30.00')).toBeNull();
    expect(scope('Each line was paid $90.00 total and $30.00.', '$30.00')).toBeNull();
    expect(scope('Each line was paid $90.00 in total and a line $30.00.', '$30.00')).toBe('line');
  });

  it('end after "apiece" or "each", or after "each", "per" or "a" with a line or a unit', () => {
    expect(scope('The payer paid $30.00 apiece and $90.00.', '$90.00')).toBeNull();
    expect(scope('The payer paid $30.00 each, a line $90.00.', '$90.00')).toBe('line');
    expect(scope('The payer paid $30.00 per line and $90.00.', '$90.00')).toBeNull();
    expect(scope('The payer paid $30.00 per unit and $90.00.', '$90.00')).toBeNull();
    // A date after it reads the words that are not the amount's own.
    expect(roles('The payer paid $30.00 a service on 2026-01-05.', '2026-01-05')).toBe('paid_date');
    expect(roles('The payer paid $30.00 for service on 2026-01-05.', '2026-01-05')).toBe('service_date');
    expect(roles('The payer paid $30.00 per receipt on 2026-01-05.', '2026-01-05')).toBe('received_date');
  });
});

describe('a count’s own words', () => {
  it('end after its noun, at once or one word on, so a date after it never reads the noun as its cue', () => {
    expect(roles('The 2 visits were on 2026-01-05.', '2026-01-05')).toBe('any');
    expect(roles('The 2 billed visits were on 2026-01-05.', '2026-01-05')).toBe('any');
    expect(roles('The 2 more visits were on 2026-01-05.', '2026-01-05')).toBe('service_date');
  });

  it('end after a partitive’s noun, from which its units read what they are stated per', () => {
    expect(reading('2 of the 3 units were billed to the payer per line.', '2')).toMatchObject({ roles: ['line_units'], part: { of: '3' } });
    expect(reading('2 of the 3 billed units were sent to the payer per line.', '2')).toMatchObject({ roles: ['line_units'], part: { of: '3' } });
    expect(reading('2 of the 3 billed units were sent to the payer per line.', '3')).toMatchObject({ roles: ['line_units'], scope: 'line' });
  });
});

describe('a partitive the sentence opens with', () => {
  it('needs the comma before the number, no edge inside it and one figure at most', () => {
    expect(roles('Of the 3 claims paid 2 were denied.', '2')).toBe('none');
    expect(roles('Of these: 3 claims, 2 were denied.', '2')).toBe('none');
    expect(roles('Of 3 claims and 4 lines, 2 were denied.', '2')).toBe('none');
    expect(reading('Of the 3 claims, 2 were denied.', '2')).toMatchObject({ roles: ['claims'], part: { of: '3' } });
  });

  it('reads a part of units as units, never each line’s', () => {
    expect(reading('Of the 6 units, 2 were denied.', '2')).toMatchObject({ roles: ['units'], part: { of: '6' } });
  });
});

describe('a number’s label', () => {
  it('reads "x" before the units, joined or apart, as each line’s units', () => {
    expect(reading('Three claims billed 97110 x2 [3].', 'x2')).toMatchObject({ roles: ['line_units'], scope: 'line' });
    expect(reading('Three claims billed 97110 x 2 [3].', '2')).toMatchObject({ roles: ['line_units'], scope: 'line' });
  });

  it('reads units before a colon with what they are stated per', () => {
    expect(reading('Units billed: 2 in total.', '2')).toMatchObject({ roles: ['units'], scope: 'total' });
    expect(reading('Units billed: 2 per line.', '2')).toMatchObject({ roles: ['line_units'], scope: 'line' });
  });

  it('reads an ordinal at the text’s end, after a determiner or not, as no role', () => {
    expect(reading('It was the fifth', 'fifth')).toMatchObject({ roles: 'none', prose: false });
    expect(reading('The claim was first', 'first')).toMatchObject({ roles: 'none', prose: true });
  });
});

describe('a list', () => {
  it('keeps a role across a comma alone only after a plural label, back to the list’s first number', () => {
    expect(roles('Under version 1, 2 were paid.', '2')).toBe('none');
    expect(roles('See pages 4, 5, 6.', '6')).toBe('citation_page window_page');
    expect(roles('See version 1, 2', '2')).toBe('none');
    // Two figures side by side are no list: "3 lines" is not a page of "pages 2".
    expect(roles('See pages 2 3 lines, 4 here.', '4')).toBe('none');
  });

  it('keeps a role across a comma alone while the list goes on, a figure within three tokens', () => {
    expect(roles('See row 1, 2 and 3.', '2')).toBe('row');
    for (const joiner of [',', ' and', ' or', ' to', ' through', ' thru', '–']) {
      expect(roles(`See version 1, 2${joiner} 3.`, '2'), joiner).toBe('version');
    }
    expect(roles('See version 1, 2 and more.', '2')).toBe('none');
    expect(roles('See version 1, 2 and then more 3.', '2')).toBe('none');
    expect(roles('See version 1, 2 then 3.', '2')).toBe('none');
  });

  it('keeps a role across a comma with a list’s word beside it', () => {
    expect(roles('See version 1, and 2 here.', '2')).toBe('version');
  });
});

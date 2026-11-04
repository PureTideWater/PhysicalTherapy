import { describe, expect, it } from 'vitest';

import { readFigures } from '../roles';

/**
 * The role reader's third layer (./numbers.ts; docs/adr/0086) held to its answers at its edges: where an amount's or a
 * count's own words end (what the figure after it reads in its place), the edges of the scope phrases beside an amount
 * and of what its sentence names of the lines, the partitive's and a list's boundaries. ../roles.test.ts holds the reader's rules as the ADR states them.
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

describe('what an amount is stated per: the scope phrase beside it alone (the amended rule 1 of docs/adr/0086)', () => {
  it('reads "each of" with "the" or not, its count a number and the lines in the plural after it', () => {
    for (const text of ['for each of the 3 lines', 'for each of 3 lines', 'for each of the three lines', 'on each of the 3 rows']) {
      expect(scope(`The payer paid $5.00 ${text}.`, '$5.00'), text).toBe('line');
    }
    for (const text of ['for each of the 3 claims', 'for each of these 3 lines', 'for each of the lines', 'on each of the 3 line', 'for each of 3', 'for each in the 3 lines']) {
      expect(scope(`The payer paid $5.00 ${text}.`, '$5.00'), text).toBeNull();
    }
  });

  it('reads the rows in the plural after "across", "for" or "over" with their count or "all", past two determiners at most', () => {
    for (const text of ['across these 3 lines', 'across those 3 lines', 'for all the lines', 'for all these lines', 'for all lines', 'over 3 lines', 'for all the 3 claims']) {
      expect(scope(`It paid $90.00 ${text}.`, '$90.00'), text).toBe('total');
    }
    for (const text of ['for the all lines', 'for the these the 3 lines', 'over 3 line', 'for 3 payers', 'across the 3', 'across the lines', 'by all the lines']) {
      expect(scope(`It paid $90.00 ${text}.`, '$90.00'), text).toBeNull();
    }
    // Only the words right after it: a later sentence's are not this amount's.
    expect(scope('The payer paid $5.00. It was for these 3 lines.', '$5.00')).toBeNull();
  });

  it('reads "for" or "on" before "the claim" as a total, never "the claim line", "the claim’s" or another lead', () => {
    expect(scope('It paid $90.00 for the claim.', '$90.00')).toBe('total');
    expect(scope('It paid $90.00 on the claim.', '$90.00')).toBe('total');
    for (const text of ['over the claim', 'for the claim visit', 'for the claim’s total', 'for a claim', 'for the claims', 'for this claim']) {
      expect(scope(`It paid $90.00 ${text}.`, '$90.00'), text).toBeNull();
    }
  });

  it('reads "in total" and "in all" alone, and a line’s or a unit’s noun after "per", "a", or "for" or "on" with "each" or "every"', () => {
    expect(scope('$90.00 in total.', '$90.00')).toBe('total');
    expect(scope('$90.00 in all.', '$90.00')).toBe('total');
    for (const text of ['in the total', 'in', 'all in', 'by each line', 'at each line', 'per lines', 'a lines', 'for each lines', 'for both lines']) {
      expect(scope(`It paid $90.00 ${text}.`, '$90.00'), text).toBeNull();
    }
    expect(scope('It paid $90.00 per visit.', '$90.00')).toBe('line');
    expect(scope('It paid $90.00 for every unit.', '$90.00')).toBe('unit');
  });

  it('reads the words right before it: "each" or "every" before a possessive line or unit, "per-line" with a hyphen, "a" or "the total of"', () => {
    expect(scope('The payer paid each row’s $5.00.', '$5.00')).toBe('line');
    expect(scope('The payer paid every unit’s $5.00.', '$5.00')).toBe('unit');
    expect(scope('The payer paid the per-service $5.00.', '$5.00')).toBe('line');
    for (const text of ['each line $5.00', 'the line’s $5.00', 'each claim’s $5.00', 'each payer’s $5.00', 'per-claim $5.00', 'a total sum $5.00', 'the total, $5.00', 'a totals of $5.00', 'per -line $5.00', 'per–line $5.00', 'per - line $5.00', 'the totals of $5.00', 'a sum of $5.00', 'each claim’s $5.00', 'a per-claim $5.00']) {
      expect(scope(`The payer paid ${text}.`, '$5.00'), text).toBeNull();
    }
    expect(scope('The payer paid a total of $5.00.', '$5.00')).toBe('total');
    // Before it and after it: one scope, or none when they differ.
    expect(scope('The payer paid each line’s $5.00 per line.', '$5.00')).toBe('line');
    expect(scope('The payer paid each line’s $5.00 for the claim.', '$5.00')).toBeNull();
    expect(scope('The payer paid a total of $5.00 per line.', '$5.00')).toBeNull();
  });

  it('ends a phrase at its last word, so a second phrase right after it is read from there', () => {
    expect(scope('It paid $5.00 for each of the 3 lines in total.', '$5.00')).toBeNull();
    expect(scope('It paid $5.00 for each of 3 lines in total.', '$5.00')).toBeNull();
    expect(scope('It paid $5.00 across the 3 lines per line.', '$5.00')).toBeNull();
    expect(scope('It paid $5.00 across all lines per line.', '$5.00')).toBeNull();
    // At the text's end, with no token after it.
    for (const text of ['It paid $5.00 for each of', 'It paid $5.00 across', 'It paid $5.00 for each of the', 'It paid $5.00 over the']) {
      expect(scope(text, '$5.00'), text).toBeNull();
    }
    expect(scope('It paid $5.00 a', '$5.00')).toBeNull();
  });

  it('reads no scope across a dash or a parenthesis, before the phrase or inside it, and none where a second phrase right after it differs', () => {
    expect(scope('It paid $5.00 – per line.', '$5.00')).toBeNull();
    expect(scope('It paid $5.00 (per line).', '$5.00')).toBeNull();
    expect(scope('It paid $5.00 in (total).', '$5.00')).toBeNull();
    expect(scope('It paid $5.00 for each (line).', '$5.00')).toBeNull();
    expect(scope('It paid $5.00 per line – in total.', '$5.00')).toBe('line');
    // A dash with a space on either side only is an edge too; a hyphen inside a word is none.
    for (const text of ['It paid $5.00 per -line.', 'It paid $5.00 per- line.', 'It paid $5.00 for each -line.']) {
      expect(scope(text, '$5.00'), text).toBeNull();
    }
    expect(scope('It paid $5.00 per line in total.', '$5.00')).toBeNull();
    expect(scope('It paid $5.00 per line per line.', '$5.00')).toBe('line');
    expect(scope('It paid each line’s – $5.00.', '$5.00')).toBeNull();
    expect(scope('It paid a total of – $5.00.', '$5.00')).toBeNull();
    expect(scope('It paid a total (of) $5.00.', '$5.00')).toBeNull();
  });
});

describe('an amount’s own words', () => {
  it('end after "each", "every", "per" or "a" with a line’s noun, so a date after it reads the words that are not the amount’s', () => {
    expect(scope('The payer paid $30.00 per line and $90.00.', '$90.00')).toBeNull();
    expect(roles('The payer paid $30.00 a service on 2026-01-05.', '2026-01-05')).toBe('paid_date');
    expect(roles('The payer paid $30.00 for service on 2026-01-05.', '2026-01-05')).toBe('service_date');
    expect(roles('The payer paid $30.00 per receipt on 2026-01-05.', '2026-01-05')).toBe('received_date');
    expect(roles('The payer paid $30.00 each service on 2026-01-05.', '2026-01-05')).toBe('paid_date');
    expect(roles('The payer paid $30.00 every visit for service on 2026-01-05.', '2026-01-05')).toBe('service_date');
  });
});

describe('a count’s own words', () => {
  it('end after its noun, at once or one word on, so a date after it never reads the noun as its cue', () => {
    expect(roles('The 2 visits were on 2026-01-05.', '2026-01-05')).toBe('any');
    expect(roles('The 2 billed visits were on 2026-01-05.', '2026-01-05')).toBe('any');
    expect(roles('The 2 more visits were on 2026-01-05.', '2026-01-05')).toBe('service_date');
  });

  it('end after a partitive’s noun, from which its units read what they are stated per', () => {
    expect(reading('2 of the 3 units per line were billed to the payer.', '2')).toMatchObject({ roles: ['line_units'], part: { of: '3' } });
    expect(reading('2 of the 3 billed units per line were sent to the payer.', '2')).toMatchObject({ roles: ['line_units'], part: { of: '3' } });
    expect(reading('2 of the 3 billed units per line were sent to the payer.', '3')).toMatchObject({ roles: ['line_units'], scope: 'line' });
    expect(reading('2 of the 3 billed units were sent to the payer per line.', '3')).toMatchObject({ roles: ['units'], scope: null });
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

describe('what an amount’s sentence names of the lines (the fail-closed triggers of the amended rule 1; parts())', () => {
  const parts = (text: string, written: string) => reading(text, written).parts;

  it('reads its own sentence alone, from its start to its end', () => {
    expect(parts('Line 2 was short. The payer paid $9.00 per line. It was 97110.', '$9.00')).toMatchObject({ named: false, counts: [{ roles: ['paid'], value: '900' }], dates: [] });
    // To the text's end, with no edge after it.
    expect(parts('The payer paid $9.00 per line for the patient', '$9.00')).toMatchObject({ named: false, patient: true });
    expect(parts('Line 2 was short; the payer paid $9.00 per line.', '$9.00')).toMatchObject({ named: false });
    expect(parts('Line 2 was short, so the payer paid $9.00 per line.', '$9.00')).toMatchObject({ named: true });
    expect(parts('The payer paid $9.00 per line, and line 2 was short.', '$9.00')).toMatchObject({ named: true });
  });

  it('names a part by a code, a modifier, a partitive, a number in no role before "of", or "one of"', () => {
    for (const text of ['for patients 1 and 2', 'for claims 1 and 2', 'for rows 2 to 3', 'for the 97110 lines', 'for 97110-GP', 'with modifier GP', 'for 2 of the 3 lines', 'for 5 of the payer’s', 'for one of them', 'for 2 of them']) {
      expect(parts(`The payer paid $9.00 per line ${text}.`, '$9.00')?.named, text).toBe(true);
    }
    for (const text of ['for 5', 'for one', 'of the payer', 'in 2026', 'in March 2026', 'for version 1 of the contract', 'on page 2 of the contract']) {
      expect(parts(`The payer paid $9.00 per line ${text}.`, '$9.00')?.named, text).toBe(false);
    }
  });

  it('names a part by a date read as a service date or in no role, never one read as another’s', () => {
    expect(parts('The lines serviced on 2026-03-05 were paid $9.00 per line.', '$9.00')?.named).toBe(true);
    expect(roles('The 2 visits were on 2026-01-05 at $9.00 per line.', '2026-01-05')).toBe('any');
    expect(parts('The 2 visits were on 2026-01-05 at $9.00 per line.', '$9.00')?.named).toBe(true);
    expect(parts('The payer paid $9.00 per line, 2026-03-05.', '$9.00')?.named).toBe(false);
    // A year in no role, or a service year, names none.
    expect(roles('The 2 visits were in 2026 at $9.00 per line.', '2026')).toBe('any');
    expect(parts('The 2 visits were in 2026 at $9.00 per line.', '$9.00')?.named).toBe(false);
    expect(parts('The services in 2026 were paid $9.00 per line.', '$9.00')?.named).toBe(false);
    expect(parts('The payer paid $9.00 per line on 2026-04-08.', '$9.00')?.named).toBe(false);
    // A month or a day of a month as a date is.
    expect(parts('The services in March 2026 were paid $9.00 per line.', '$9.00')?.named).toBe(true);
    expect(parts('The services on March 5 were paid $9.00 per line.', '$9.00')?.named).toBe(true);
    expect(parts('The payer paid $9.00 per line in March 2026.', '$9.00')?.named).toBe(false);
    expect(parts('The payer paid $9.00 per line on March 5.', '$9.00')?.named).toBe(false);
    // An ordinal not read as prose names none: "a second-level appeal" is the level.
    expect(parts('This second-level appeal disputes $9.00 per line.', '$9.00')?.named).toBe(false);
  });

  it('names a part by a patient as a noun, never "each patient", "per patient" or a word before another noun', () => {
    for (const text of ['for a patient', 'for patient’s lines', 'for a patient line']) {
      expect(parts(`The payer paid $9.00 per line ${text}.`, '$9.00'), text).toMatchObject({ named: true, patient: false });
    }
    for (const text of ['for each patient', 'for every patient’s line', 'per patient', 'as a patient share']) {
      expect(parts(`The payer paid $9.00 per line ${text}.`, '$9.00'), text).toMatchObject({ named: false, patient: false });
    }
    for (const determiner of ['the', 'this', 'that', 'one', 'its']) {
      expect(parts(`The payer paid $9.00 per line for ${determiner} patient.`, '$9.00'), determiner).toMatchObject({ named: false, patient: true });
      expect(parts(`The payer paid $9.00 per line for ${determiner} claim.`, '$9.00'), determiner).toMatchObject({ named: false, claim: true });
      expect(parts(`The payer paid $9.00 per line for ${determiner} line.`, '$9.00')?.named, determiner).toBe(true);
    }
    expect(parts('The payer paid $9.00 per line for each claim.', '$9.00')).toMatchObject({ claim: false });
  });

  it('names a part by one line’s noun after an owner’s word not after "each", or after a determiner, never another word', () => {
    for (const text of ['for the claim line', 'for a claim row', 'for a patient visit', 'for the patient line', 'for this claim line']) {
      expect(parts(`The payer paid $9.00 per line ${text}.`, '$9.00')?.named, text).toBe(true);
    }
    for (const text of ['for each claim line', 'for every claim row', 'in line with it', 'on the bottom line', 'per visit', 'a line']) {
      expect(parts(`The payer paid $9.00 per line ${text}.`, '$9.00')?.named, text).toBe(false);
    }
  });

  it('holds each count of lines, claims or patients with the roles it may be, and no other count', () => {
    expect(parts('The payer paid $9.00 per line for 3 lines of 2 patients.', '$9.00')?.counts).toEqual([
      { roles: ['paid'], value: '900' },
      { roles: ['lines'], value: '3' },
      { roles: ['patients'], value: '2' },
    ]);
    expect(parts('The payer paid $9.00 per line for 6 units on page 2.', '$9.00')?.counts).toEqual([
      { roles: ['paid'], value: '900' },
      { roles: ['units'], value: '6' },
      { roles: ['citation_page', 'window_page'], value: '2' },
    ]);
    // A figure in no role holds none.
    expect(parts('The payer paid $9.00 per line for 5.', '$9.00')?.counts).toEqual([{ roles: ['paid'], value: '900' }]);
  });
});

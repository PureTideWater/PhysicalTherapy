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
    // A semicolon does not end it ("$300.00 in total; that is per claim": PE5-3).
    expect(parts('Line 2 was short; the payer paid $9.00 per line.', '$9.00')).toMatchObject({ named: true });
    expect(parts('Line 2 was short! The payer paid $9.00 per line? Line 3 was.', '$9.00')).toMatchObject({ named: false });
    // From its figure to its end, when the figure opens it.
    expect(parts('It was short. $9.00 per line was paid for line 2.', '$9.00')).toMatchObject({ named: true });
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

  it('names one of the patients by a patient’s or a member’s noun in any place, each of them after "each", "every" or "per", and none before a noun it qualifies (PE5-1, CORR5-2, PE5-3)', () => {
    for (const text of ['for a patient', 'for patient B', 'the patient owes', 'the patient was', 'of the patient were', 'for the patient’s share', 'the member is', 'for a patient’s account']) {
      expect(parts(`The payer paid $9.00 per line ${text}.`, '$9.00'), text).toMatchObject({ patient: true, eachPatient: false });
    }
    for (const text of ['for each patient', 'for every patient’s line', 'per patient', 'per member']) {
      expect(parts(`The payer paid $9.00 per line ${text}.`, '$9.00'), text).toMatchObject({ named: false, patient: false, eachPatient: true });
    }
    for (const text of ['as a patient share', 'the patient responsibility', 'a patient line', 'its patient balance', 'the patients']) {
      expect(parts(`The payer paid $9.00 per line ${text}.`, '$9.00'), text).toMatchObject({ patient: false, eachPatient: false });
    }
    for (const determiner of ['the', 'this', 'that', 'one', 'its', 'a', 'her', 'his']) {
      expect(parts(`The payer paid $9.00 per line for ${determiner} patient.`, '$9.00'), determiner).toMatchObject({ named: false, patient: true });
      expect(parts(`The payer paid $9.00 per line for ${determiner} claim.`, '$9.00'), determiner).toMatchObject({ named: false, claim: true });
      expect(parts(`The payer paid $9.00 per line for ${determiner} line.`, '$9.00')?.named, determiner).toBe(true);
    }
    for (const text of ['for each claim', 'per claim', 'for every claim', 'each claim’s']) {
      expect(parts(`The payer paid $9.00 per line ${text}.`, '$9.00'), text).toMatchObject({ claim: false, eachClaim: true });
    }
    for (const text of ['the claim lines', 'the claim filing indicator', 'a claim adjustment', 'the claims']) {
      expect(parts(`The payer paid $9.00 per line ${text}.`, '$9.00'), text).toMatchObject({ claim: false, eachClaim: false });
    }
    expect(parts('The payer paid $9.00 per line for the claim’s lines.', '$9.00')).toMatchObject({ claim: true });
  });

  it('names a part by one line’s noun with any word before it but "each", "every" or "per", past an owner’s word and a joined count (PE5-1, CORR5-1)', () => {
    for (const text of ['for the claim line', 'for a claim row', 'for a patient visit', 'for the patient line', 'for this claim line', 'on the bottom line', 'for a line', 'on a single line', 'on line A', 'for row B', 'on the earliest visit', 'for her visit', 'for Jane Roe’s line', 'on another line', 'on either line', 'for a 2-unit line', 'for the date of service', 'for the service', 'for the line’s items']) {
      expect(parts(`The payer paid $9.00 per line ${text}.`, '$9.00')?.named, text).toBe(true);
    }
    for (const text of ['for each claim line', 'for every claim row', 'in line with it', 'per visit', 'a line', 'for each 2-unit line', 'for every patient’s row', 'as its own line', 'for the service lines', 'for the line items', 'for the dates of service', 'by type of service']) {
      expect(parts(`The payer paid $9.00 per line ${text}.`, '$9.00')?.named, text).toBe(false);
    }
    // "in line with" alone, "of service" alone but "date of service", and an owner's word three at most.
    for (const [text, named] of [
      ['in visit with it', true],
      ['for the line with it', true],
      ['as in line for it', true],
      ['at the end of line', true],
      ['for each claim claim claim line', false],
      ['for each claim claim claim claim line', true],
    ] as const) {
      expect(parts(`The payer paid $9.00 per line ${text}.`, '$9.00')?.named, text).toBe(named);
    }
    // A noun of a line's the closed list does not hold names one whatever stands before it.
    for (const text of ['for the encounter', 'per session', 'for each appointment']) {
      expect(parts(`The payer paid $9.00 per line ${text}.`, '$9.00')?.named, text).toBe(true);
    }
  });

  it('names a part by the lines in the plural after any word but the closed few that name them all, unless a count stands beside them (PE5-1, CORR5-1)', () => {
    for (const text of ['on both lines', 'on most lines', 'on several lines', 'on the GP lines', 'on the March lines', 'for the earlier visits', 'for both patients', 'on any lines', 'for the denied claims']) {
      expect(parts(`The payer paid $9.00 per line ${text}.`, '$9.00')?.named, text).toBe(true);
    }
    for (const text of ['on the lines', 'on all lines', 'on these lines', 'for the 3 lines', 'for the 3 GP lines', 'on the service lines', 'for the patients’ lines', 'that covers lines', 'on the billed lines', 'for the claims', 'among the visits', 'and lines']) {
      expect(parts(`The payer paid $9.00 per line ${text}.`, '$9.00')?.named, text).toBe(false);
    }
    expect(parts('Lines were paid $9.00 per line.', '$9.00')?.named).toBe(false);
  });

  it('names a part by a word that names some of the lines, an exclusion, a quantifier before "of", a month’s or a weekday’s name, and "a day" or "per day" (PE5-1, CORR5-1, PE5-3)', () => {
    for (const text of ['for the rest', 'excluding a denial', 'except one', 'besides the denial', 'minus the denial', 'but one', 'but 2', 'for all lines but the denial', 'for most of them', 'for both of the lines', 'for any of the visits', 'in early March', 'on the Thursday visit', 'in May', 'per day', 'each day', 'a day']) {
      expect(parts(`The payer paid $9.00 per line ${text}.`, '$9.00')?.named, text).toBe(true);
    }
    for (const text of ['but the payer denied it', 'for most', 'as it may', 'for the day', 'for all of the lines']) {
      expect(parts(`The payer paid $9.00 per line ${text}.`, '$9.00')?.named, text).toBe(false);
    }
  });

  it('holds the scope of each phrase of the closed list that stands beside no figure, never a hyphen’s or a "respectively" list’s own (CORR5-4, PE5-3)', () => {
    const phrases = (text: string, written: string) => parts(text, written)?.phrases;
    expect(phrases('On each line the payer allowed $9.00 in total.', '$9.00')).toEqual(['line']);
    expect(phrases('The payer allowed $9.00 in total; that is per line.', '$9.00')).toEqual(['line']);
    expect(phrases('In total, the payer allowed $9.00 per line.', '$9.00')).toEqual(['total']);
    // A hyphen joins only "per" to its noun: "in-total" is the phrase.
    expect(phrases('The payer allowed $9.00 per line, in-total.', '$9.00')).toEqual(['total']);
    expect(phrases('The payer allowed $9.00 in total, for each line and in all.', '$9.00')).toEqual(['line', 'total']);
    // Beside a figure, a phrase is that figure's; a unit's is none; a hyphen joins "per-visit" to its noun.
    for (const text of ['The payer allowed $9.00 per line and $27.00 in total.', 'The payer allowed each line’s $9.00.', 'The payer allowed a total of $9.00.', 'The payer allowed $9.00 a unit and 3 units in total.', 'The per-visit rate of $9.00 comes to $27.00 in total.', 'The payer paid a unit $9.00 in total.']) {
      expect(phrases(text, '$9.00'), text).toEqual([]);
    }
    // Past a dash a phrase is beside no figure: astray.
    expect(phrases('The payer allowed $9.00 in total – per line.', '$9.00')).toEqual(['line']);
    expect(phrases('The contract expected in total and per line the payer allowed $9.00 and $3.00, respectively.', '$9.00')).toEqual([]);
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

describe('the words that name a part of the lines, each of them (../roles-words/prose.ts; PE5-1, CORR5-1, CORR5-2, PE5-3)', () => {
  const parts = (text: string) => reading(`The payer paid $9.00 per line ${text}.`, '$9.00').parts;

  it('names a part by each word that names some of the lines, each exclusion, each month’s and weekday’s name and each quantifier before "of"', () => {
    for (const word of ['rest', 'excluding', 'except', 'excepting', 'besides', 'minus']) {
      expect(parts(`for the lines ${word}`)?.named, word).toBe(true);
    }
    for (const word of ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']) {
      expect(parts(`for the lines in ${word}`)?.named, word).toBe(true);
      expect(parts(`for the lines in ${word.toLowerCase()}`)?.named, word).toBe(word !== 'May');
    }
    // "May" only with a capital first: "mAy" is the verb.
    expect(parts('for the lines in mAy')?.named).toBe(false);
    // "but" at the text's end.
    expect(reading('The payer paid $9.00 per line but', '$9.00').parts?.named).toBe(false);
    for (const word of ['both', 'either', 'neither', 'most', 'many', 'several', 'few', 'any', 'none']) {
      expect(parts(`for ${word} of them`)?.named, word).toBe(true);
      expect(parts(`for ${word}`)?.named, word).toBe(false);
    }
  });

  it('names a part by each noun of a line’s the closed list does not hold, and by the patients and the like in the plural after a word that names some', () => {
    for (const word of ['encounter', 'session', 'appointment']) {
      expect(parts(`for each ${word}`)?.named, word).toBe(true);
    }
    for (const word of ['encounters', 'sessions', 'appointments', 'patients', 'members']) {
      expect(parts(`for both ${word}`)?.named, word).toBe(true);
      expect(parts(`for the ${word}`)?.named, word).toBe(false);
    }
  });

  it('names none by the lines in the plural after each word that names them all', () => {
    for (const word of [
      'the',
      'all',
      'these',
      'those',
      'its',
      'their',
      'our',
      'of',
      'for',
      'on',
      'in',
      'across',
      'over',
      'to',
      'with',
      'by',
      'from',
      'under',
      'at',
      'between',
      'among',
      'about',
      'through',
      'throughout',
      'within',
      'into',
      'and',
      'or',
      'nor',
      'than',
      'are',
      'were',
      'is',
      'was',
      'be',
      'been',
      'has',
      'have',
      'had',
      'cover',
      'covers',
      'include',
      'includes',
      'span',
      'spans',
      'affect',
      'affects',
      'service',
      'visit',
      'claim',
      'therapy',
      'billed',
      'paid',
      'underpaid',
      'priced',
      'disputed',
      'affected',
      'listed',
      'reprocessed',
      'same',
    ]) {
      expect(parts(`as ${word} lines`)?.named, word).toBe(false);
    }
    expect(parts('as gp lines')?.named).toBe(true);
    // A whole count before them, or one word before them, is held to the pattern's; "half" is none.
    for (const [text, named] of [['for half the lines', true], ['for half of them', true], ['for the 3 lines', false], ['for 3 gp lines', false], ['for 12 gp lines', false], ['for 1.5 gp lines', true], ['for both members 2026', true]] as const) {
      expect(parts(text)?.named, text).toBe(named);
    }
  });

  it('names none by one line’s noun before each noun it qualifies, nor a claim or a patient before theirs, and keeps each owner’s word between "each" and a line', () => {
    for (const [modifier, head] of [
      ['service', 'lines'],
      ['service', 'visits'],
      ['visit', 'rows'],
      ['visit', 'services'],
      ['line', 'items'],
      ['line', 'amounts'],
      ['line', 'totals'],
      ['line', 'charges'],
      ['line', 'dates'],
      ['line', 'codes'],
      ['line', 'level'],
      ['line', 'levels'],
      ['line', 'units'],
      ['line', 'values'],
    ]) {
      expect(parts(`at the ${String(modifier)} ${String(head)}`)?.named, `${String(modifier)} ${String(head)}`).toBe(false);
    }
    for (const head of ['line', 'lines', 'row', 'rows', 'visit', 'visits', 'service', 'services', 'filing', 'adjustment', 'adjustments', 'status', 'level', 'form', 'forms']) {
      expect(parts(`at the claim ${head}`), head).toMatchObject({ claim: false, eachClaim: false });
    }
    for (const head of [
      'share',
      'shares',
      'responsibility',
      'responsibilities',
      'portion',
      'portions',
      'balance',
      'balances',
      'liability',
      'copay',
      'copays',
      'copayment',
      'copayments',
      'coinsurance',
      'deductible',
      'deductibles',
      'account',
      'accounts',
      'cost',
      'costs',
      'line',
      'lines',
      'row',
      'rows',
      'visit',
      'visits',
      'service',
      'services',
    ]) {
      expect(parts(`at the patient ${head}`), head).toMatchObject({ patient: false, eachPatient: false });
    }
    for (const owner of ['claim', 'patient', 'member', 'unit']) {
      expect(parts(`for each ${owner} line`)?.named, owner).toBe(false);
    }
  });
});

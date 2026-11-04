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

  it('reads its own clause before its sentence’s opening scope phrase, which states a scope only where its clause states none (rule 1)', () => {
    expect(scope('Apiece, 3 lines were paid $5.00.', '$5.00')).toBe('total');
    expect(scope('Per claim, 3 lines were paid $5.00.', '$5.00')).toBe('total');
    expect(scope('Every visit, the lines were paid $5.00.', '$5.00')).toBe('total');
    expect(scope('Each visit, the payer paid $5.00.', '$5.00')).toBe('line');
    expect(scope('Per claim, the payer paid $5.00.', '$5.00')).toBeNull();
    expect(scope('Then 3 lines were paid $5.00.', '$5.00')).toBe('total');
  });
});

describe('what an amount is stated per, by the closed rules (rule 1 of docs/adr/0086)', () => {
  it('reads a total’s words past other words in its own clause, after it and before it', () => {
    expect(scope('It allowed $9.00 in fact for these lines.', '$9.00')).toBe('total');
    expect(scope('It allowed $9.00 in fact for the claim.', '$9.00')).toBe('total');
    expect(scope('It allowed $9.00 in fact for the claim line.', '$9.00')).toBe('line');
    expect(scope('It allowed $9.00 in fact for the', '$9.00')).toBeNull();
    expect(scope('Note. It allowed $9.00 in fact for these lines.', '$9.00')).toBe('total');
    expect(scope('It allowed $9.00 for the claim', '$9.00')).toBe('total');
    expect(scope('It allowed $9.00 on these lines.', '$9.00')).toBeNull();
    expect(scope('It allowed $9.00 for the 3 claim lines.', '$9.00')).toBeNull();
  });

  it('reads "per" before a determiner as no scope, and any other word after "each" as a scope of something else', () => {
    expect(scope('Each the 3 lines were allowed $9.00.', '$9.00')).toBeNull();
    expect(scope('The 3 lines were allowed $9.00 per the contract.', '$9.00')).toBe('total');
    expect(scope('The 3 lines were allowed $9.00 per these terms.', '$9.00')).toBe('total');
  });

  it('takes "each" beside a line’s or a unit’s scope as that one, whichever side of the figure each is on', () => {
    expect(scope('Per line the payer paid $9.00 each.', '$9.00')).toBe('line');
    expect(scope('Each claim was paid $9.00 per unit.', '$9.00')).toBe('unit');
    expect(scope('Each claim was paid $9.00 in total.', '$9.00')).toBeNull();
    expect(scope('In total the payer paid $9.00 each.', '$9.00')).toBeNull();
  });

  it('leaves the words right after an amount to it, whatever they state, and reads its own before them', () => {
    expect(scope('The payer allowed $1.00 to the 3 lines against $9.00.', '$9.00')).toBeNull();
    expect(scope('The payer allowed $1.00 to the 3 lines against $9.00.', '$1.00')).toBeNull();
    expect(scope('The 3 lines were allowed $1.00 against the contract’s $9.00.', '$9.00')).toBeNull();
    expect(scope('$1.00 – for these 3 lines $9.00.', '$9.00')).toBe('total');
    // A dash with a space on either side bounds a clause, as a parenthesis or an em dash does; a hyphen in a word never.
    for (const dash of [' –for', '– for', ' -for', '- for', '—for', ' (for', ') for']) {
      expect(scope(`The payer allowed $9.00${dash} each line.`, '$9.00'), dash).toBeNull();
    }
    expect(scope('For each line the prompt-pay payer allowed $9.00.', '$9.00')).toBe('line');
    expect(scope('The payer allowed $9.00 for each line-item.', '$9.00')).toBe('line');
  });

  it('reads an opening phrase of a scope’s words, determiners and counts alone, from the sentence’s own start', () => {
    expect(scope('Note. For each line, the payer allowed $9.00.', '$9.00')).toBe('line');
    expect(scope('For each line. The payer allowed $9.00.', '$9.00')).toBeNull();
    expect(scope('For each line on 2026-01-05, the payer allowed $9.00.', '$9.00')).toBeNull();
    expect(scope('On each of the 3 lines, the payer allowed $9.00.', '$9.00')).toBe('line');
    expect(scope('For each line the payer allowed $1.00 and it paid $9.00.', '$9.00')).toBeNull();
  });
});

describe('an amount’s own words', () => {
  it('end after a total’s words right after it, so the amount after reads its own', () => {
    // Two scopes in one clause that differ: none (each line, in total).
    expect(reading('Each line was paid $90.00 in total and $30.00.', '$90.00').scope).toBeNull();
    expect(reading('The lines were paid $90.00 in total and $30.00.', '$90.00').scope).toBe('total');
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

describe('what an amount is stated per, after the review of the converging fix (PE3-1, PE3-2, CORR3-1; docs/adr/0086)', () => {
  const subordinators = ['when', 'whenever', 'as', 'because', 'since', 'although', 'though', 'if', 'unless', 'lest', 'after', 'before', 'until', 'till', 'once', 'than', 'despite', 'unlike'];
  const relatives = ['which', 'that', 'who', 'whom', 'whose', 'where', 'wherever', 'whereby'];

  it('ends a figure’s own clause at a subordinator, a relative or "nor", so a trailing clause’s scope is not the figure’s (PE3-1)', () => {
    for (const word of [...subordinators, ...relatives, 'nor', 'but', 'yet']) {
      expect(scope(`It allowed $9.00 ${word} each line was reprocessed.`, '$9.00'), word).toBeNull();
      expect(scope(`It allowed $9.00 in total ${word} each line was reprocessed.`, '$9.00'), word).toBe('total');
    }
    // Its own clause's words before the subordinator still count.
    expect(scope('It allowed $9.00 per line after the coinsurance.', '$9.00')).toBe('line');
  });

  it('reads none of a figure’s words before it after a subordinator, whose clause may end with no edge (PE3-1)', () => {
    for (const word of subordinators) {
      expect(scope(`${word} each line was reprocessed the payer allowed $9.00.`, '$9.00'), word).toBeNull();
      expect(scope(`${word} each line was reprocessed the payer allowed $9.00 per line.`, '$9.00'), word).toBe('line');
    }
    // After a relative, the figure's clause is the relative's own: its words count.
    expect(scope('The amount, which each line was allowed, $9.00.', '$9.00')).toBeNull();
    expect(scope('It is the amount which each line was allowed $9.00.', '$9.00')).toBe('line');
    expect(scope('It is the amount because each line was allowed $9.00.', '$9.00')).toBeNull();
  });

  it('reads every scope a clause states, wherever it stands, and none when two differ (PE3-1)', () => {
    expect(scope('It allowed $9.00 in total for each line.', '$9.00')).toBeNull();
    expect(scope('It allowed $9.00 for each line in total.', '$9.00')).toBeNull();
    expect(scope('It allowed $9.00 per line on each line.', '$9.00')).toBe('line');
    expect(scope('It allowed $9.00 each per line.', '$9.00')).toBe('line');
    expect(scope('It allowed $9.00 each in total.', '$9.00')).toBeNull();
    expect(scope('It allowed $9.00 per a contract in total.', '$9.00')).toBe('total');
    expect(scope('It allowed $9.00 per unit for each line.', '$9.00')).toBeNull();
    expect(scope('It allowed $9.00 each.', '$9.00')).toBeNull();
    expect(scope('On each of the 3 lines the payer allowed $9.00.', '$9.00')).toBe('line');
    expect(scope('For every one of the 3 lines the payer allowed $9.00.', '$9.00')).toBeNull();
    expect(scope('The 3 lines were allowed $9.00.', '$9.00')).toBe('total');
    expect(scope('The 3 lines were allowed $9.00 per line.', '$9.00')).toBeNull();
  });

  it('reads one row only by its number, an ordinal or a patient’s or a claim’s, never the row’s noun alone (PE3-2)', () => {
    for (const row of ['line 1', 'row 2', 'visit 3', 'the 2nd line', 'the second row', 'Patient 2’s line', 'Patient 2’s row', 'the patient’s line', 'the claim’s row', 'the claim line']) {
      expect(scope(`It allowed $9.00 for ${row}.`, '$9.00'), row).toBe('line');
    }
    for (const row of ['the line', 'the row', 'the visit', 'the line schedule', 'the remittance line', 'Patient 2’s visit', 'the patient’s visit', 'the payer’s line', 'the 2 line items']) {
      expect(scope(`It allowed $9.00 for ${row}.`, '$9.00'), row).toBeNull();
    }
    // An opening's total is the figure's where its own words name no row.
    expect(scope('In total, the payer allowed $9.00 on the remittance line.', '$9.00')).toBe('total');
    expect(scope('In total, the payer allowed $9.00 on line 2.', '$9.00')).toBe('line');
  });

  it('reads a total over rows named by their labels or a partitive as no scope: no pattern’s total (CORR3-1)', () => {
    for (const rows of ['for lines 1 and 2', 'across lines 1 and 2', 'over lines 1 to 2', 'for lines 1–2', 'across claims 1 and 2', 'for rows 1 through 2', 'for 2 of the 3 lines', 'for two of the lines', 'in total for lines 1, 2 and 3']) {
      expect(scope(`It allowed $9.00 ${rows}.`, '$9.00'), rows).toBeNull();
    }
    for (const text of ['2 of the 3 lines were allowed $9.00.', 'On 2 of the 3 lines the payer allowed $9.00.', 'Lines 1 to 2 were allowed $9.00.', 'Lines 1 and 2 were allowed $9.00 in total.', 'Lines 1, 2 and 3 were allowed $9.00 in total.', 'Claims 1 and 2 were allowed $9.00.']) {
      expect(scope(text, '$9.00'), text).toBeNull();
    }
    expect(scope('On claim 2 the payer allowed $9.00 in total.', '$9.00')).toBeNull();
    // A year or another label before the rows is no part of them.
    expect(scope('In 2026 the payer allowed $9.00 per line.', '$9.00')).toBe('line');
    expect(scope('Version 2 for the 3 lines was allowed $9.00.', '$9.00')).toBe('total');
    expect(scope('It allowed $9.00 for the line', '$9.00')).toBeNull();
    // Per line, a part of the rows is each line's; all of them, or "each of" them, as before.
    expect(scope('It allowed $9.00 per line for lines 1 and 2.', '$9.00')).toBe('line');
    expect(scope('All of the 3 lines were allowed $9.00.', '$9.00')).toBe('total');
    expect(scope('It allowed $9.00 for all 3 lines.', '$9.00')).toBe('total');
    expect(scope('It allowed $9.00 for each of the 3 lines.', '$9.00')).toBe('line');
  });
});

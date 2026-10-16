import { describe, expect, it } from 'vitest';

import { canonicalNumber, isoDate, numbersInWords, scanText, sentenceSpans } from './scan';

const figures = (text: string) => scanText(text).figures.map((figure) => [figure.kind, figure.value, text.slice(figure.start, figure.end)]);
const sentences = (text: string) => sentenceSpans(text).map((span) => text.slice(span.start, span.end));
const words = (text: string) => numbersInWords([...text.matchAll(/[A-Za-z]+/g)].map((match) => ({ word: match[0], start: match.index, end: match.index + match[0].length }))).map((item) => item.value);

describe('scanText', () => {
  it('reads amounts with a dollar sign or exactly two decimals, as cents', () => {
    expect(figures('Paid $1,234.56, $50 and $7.5; allowed 70.00 and 1,000.00.')).toEqual([
      ['amount', '123456', '$1,234.56'],
      ['amount', '5000', '$50'],
      ['amount', '750', '$7.5'],
      ['amount', '7000', '70.00'],
      ['amount', '100000', '1,000.00'],
    ]);
  });

  it('reads dates in every written form, and an impossible one as an identifier', () => {
    expect(figures('On 2026-03-05, March 6, 2026, 7 March 2026, 3/8/2026, in April 2026 and on May 2; 2026-02-30 and February 30, 2026 do not exist.')).toEqual([
      ['date', '2026-03-05', '2026-03-05'],
      ['date', '2026-03-06', 'March 6, 2026'],
      ['date', '2026-03-07', '7 March 2026'],
      ['date', '2026-03-08', '3/8/2026'],
      ['month', '2026-04', 'April 2026'],
      ['month_day', '05-02', 'May 2'],
      ['identifier', '2026-02-30', '2026-02-30'],
      ['identifier', 'February 30, 2026', 'February 30, 2026'],
    ]);
  });

  it('reads percentages in digits and words', () => {
    expect(figures('It pays 120%, 85 percent, 2.5 per cent or nine percent.')).toEqual([
      ['percent', '120', '120%'],
      ['percent', '85', '85 percent'],
      ['percent', '2.5', '2.5 per cent'],
      ['percent', '9', 'nine percent'],
    ]);
  });

  it('reads procedure codes with their modifiers and modifiers named as such', () => {
    expect(figures('97110-GP-59, G0283, 0001F; modifiers GP, KX and XS; the CQ modifier.')).toEqual([
      ['code', '97110', '97110'],
      ['modifier', 'GP', 'GP'],
      ['modifier', '59', '59'],
      ['code', 'G0283', 'G0283'],
      ['code', '0001F', '0001F'],
      ['modifier', 'GP', 'GP'],
      ['modifier', 'KX', 'KX'],
      ['modifier', 'XS', 'XS'],
      ['modifier', 'CQ', 'CQ'],
    ]);
  });

  it('reads plain numbers, ordinals and x-units, and anything else with a digit as an identifier', () => {
    expect(figures('3 claims, 1,200 units, 2.5 hours, the 3rd level, 97110 x2, member SYN123, claim 12345-678, G.S. 58-3-225.')).toEqual([
      ['number', '3', '3'],
      ['number', '1200', '1,200'],
      ['number', '2.5', '2.5'],
      ['number', '3', '3rd'],
      ['code', '97110', '97110'],
      ['number', '2', 'x2'],
      ['identifier', 'SYN123', 'SYN123'],
      ['identifier', '12345-678', '12345-678'],
      ['identifier', '58-3-225', '58-3-225'],
    ]);
  });

  it('reads numbers written in words, leaving "one" and "zero" alone as prose', () => {
    expect(figures('Twenty-one lines, two hundred and five units, one claim, zero denials, twelve thousand dollars.')).toEqual([
      ['number', '21', 'Twenty-one'],
      ['number', '205', 'two hundred and five'],
      ['number', '12000', 'twelve thousand'],
    ]);
  });

  it('reads placeholders and citation markers apart from figures', () => {
    const scan = scanText('Claim {{claim_control_number:2}} for {{patient_name:12}} is short [1, 3].');
    expect(scan.figures).toEqual([]);
    expect(scan.placeholders.map((item) => [item.kind, item.row])).toEqual([
      ['claim_control_number', 2],
      ['patient_name', 12],
    ]);
    expect(scan.markers.map((item) => item.sources)).toEqual([[1, 3]]);
  });
});

describe('numbersInWords', () => {
  it('joins what the grammar joins and splits the rest', () => {
    expect(words('two three')).toEqual([2, 3]);
    expect(words('twelve five')).toEqual([12, 5]);
    expect(words('one and two')).toEqual([1, 2]);
    expect(words('a hundred')).toEqual([100]);
    expect(words('thousand')).toEqual([1000]);
    expect(words('two hundred thousand')).toEqual([200_000]);
    expect(words('two million three thousand four hundred and six')).toEqual([2_003_406]);
    expect(words('one thousand thousand')).toEqual([1000, 1000]);
    expect(words('hundred hundred')).toEqual([100, 100]);
    expect(words('ninety nine')).toEqual([99]);
    expect(words('twenty thirty')).toEqual([20, 30]);
  });
});

describe('sentenceSpans', () => {
  it('ends sentences at their marks, with the markers that follow them', () => {
    expect(sentences('The rate is 50.00 [1]. The lines were short. [3] Is that so? Yes! [2]')).toEqual(['The rate is 50.00 [1].', 'The lines were short. [3]', 'Is that so?', 'Yes! [2]']);
  });

  it('keeps abbreviations inside a sentence when a lowercase word or a digit follows', () => {
    expect(sentences('Under G.S. 58-3-225 the payer owes it, e.g. on time [1]. It is the U.S. Rule. Then more.')).toEqual(['Under G.S. 58-3-225 the payer owes it, e.g. on time [1].', 'It is the U.S.', 'Rule.', 'Then more.']);
  });

  it('ends a sentence at a paragraph break and ignores pieces with no words', () => {
    expect(sentences('A heading\n\nThe text [1]\n\n---\n\n  ')).toEqual(['A heading', 'The text [1]']);
    expect(sentences('')).toEqual([]);
    expect(sentences('[1]')).toEqual([]);
  });
});

describe('helpers', () => {
  it('writes canonical numbers and real dates only', () => {
    expect(canonicalNumber('1,200.500')).toBe('1200.5');
    expect(canonicalNumber('007')).toBe('7');
    expect(isoDate(2028, 2, 29)).toBe('2028-02-29');
    expect(isoDate(2026, 2, 29)).toBeNull();
    expect(isoDate(2026, 13, 1)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';

import { canonicalNumber, isoDate, numbersInWords, romanValue, scanText, sentenceSpans } from './scan';

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

  it('reads counts, multiples and fractions in words: dozen, score, half, twice, thrice', () => {
    expect(figures('A dozen claims, two dozen lines, a score of visits, four score and seven units.')).toEqual([
      ['number', '12', 'dozen'],
      ['number', '24', 'two dozen'],
      ['number', '20', 'score'],
      ['number', '87', 'four score and seven'],
    ]);
    expect(figures('Twice the contract rate, thrice over, half the contract rate, on behalf of the plan.')).toEqual([
      ['number', '2', 'Twice'],
      ['number', '3', 'thrice'],
      ['number', '0.5', 'half'],
    ]);
  });

  it('reads ordinal words as the numbers they order, and a month with an ordinal day as a day', () => {
    expect(figures('The first, second and fifth disputes; the twenty-first line; the twelfth and hundredth; the third time.')).toEqual([
      ['number', '1', 'first'],
      ['number', '2', 'second'],
      ['number', '5', 'fifth'],
      ['number', '21', 'twenty-first'],
      ['number', '12', 'twelfth'],
      ['number', '100', 'hundredth'],
      ['number', '3', 'third'],
    ]);
    expect(figures('Paid on March fifth, the twenty-first of May, 2026, June the second 2026 and the thirtieth of February.')).toEqual([
      ['month_day', '03-05', 'March fifth'],
      ['date', '2026-05-21', 'twenty-first of May, 2026'],
      ['date', '2026-06-02', 'June the second 2026'],
      ['identifier', 'thirtieth of February', 'thirtieth of February'],
    ]);
    expect(figures('February thirtieth, 2026 does not exist.')).toEqual([['identifier', 'February thirtieth, 2026', 'February thirtieth, 2026']]);
    // A month's name in lower case is a word ("may"), and the ordinal after it is a number.
    expect(figures('The payer may first review it.')).toEqual([['number', '1', 'first']]);
  });

  it('reads Roman numerals after level, appeal or tier, and fractions in digits as identifiers', () => {
    expect(figures('A level IV appeal, appeal II, tier iii, levels X; the level ILL is no numeral.')).toEqual([
      ['number', '4', 'IV'],
      ['number', '2', 'II'],
      ['number', '3', 'iii'],
      ['number', '10', 'X'],
    ]);
    expect(figures('1/2 the rate, 3 / 4 of it, and 1\u20442 more; 3/8/2026 is a date.')).toEqual([
      ['identifier', '1/2', '1/2'],
      ['identifier', '3/4', '3 / 4'],
      ['identifier', '1/2', `1${String.fromCodePoint(0x2044)}2`],
      ['date', '2026-03-08', '3/8/2026'],
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

  it('reads groups of thousands, every decimal and the punctuation after a figure exactly, in each figure’s form', () => {
    expect(figures('Rose 12,345.5% and 1,234,567% and 9.25 per  cent.')).toEqual([
      ['percent', '12345.5', '12,345.5%'],
      ['percent', '1234567', '1,234,567%'],
      ['percent', '9.25', '9.25 per  cent'],
    ]);
    // A dollar amount ends at its sentence's period; one with three decimals is no amount.
    expect(figures('Paid $1,234,567.89, $12,345 and $5. Then $5.123 was written.')).toEqual([
      ['amount', '123456789', '$1,234,567.89'],
      ['amount', '1234500', '$12,345'],
      ['amount', '500', '$5'],
      ['number', '5.123', '5.123'],
    ]);
    expect(figures('Allowed 12,345.67 and 1,234,567.89.')).toEqual([
      ['amount', '1234567', '12,345.67'],
      ['amount', '123456789', '1,234,567.89'],
    ]);
    expect(figures('Units 12,345 and 1,234,567 and 2.125, then 3. Billed x2.')).toEqual([
      ['number', '12345', '12,345'],
      ['number', '1234567', '1,234,567'],
      ['number', '2.125', '2.125'],
      ['number', '3', '3'],
      ['number', '2', 'x2'],
    ]);
    expect(figures('A 1/2. share; 1/2 3 times.')).toEqual([
      ['identifier', '1/2', '1/2'],
      ['identifier', '1/2', '1/2'],
      ['number', '3', '3'],
    ]);
    // A date followed by a hyphen and a letter is still the date; a month and a day of two digits each.
    expect(figures('On 2026-03-05-a and 12/25/2026 and 3/8/2026-a.')).toEqual([
      ['date', '2026-03-05', '2026-03-05'],
      ['date', '2026-12-25', '12/25/2026'],
      ['date', '2026-03-08', '3/8/2026'],
    ]);
  });

  it('reads a remittance key led by its qualifier code as one identifier, digit or not, before any figure takes part of it (the verification of 2026-10-21)', () => {
    expect(figures('Plan CE:SYNPLAN-FIX-ONE. Payer (2U:SYNPAYERQ), XV:SYNPAYERXV; TRN03:1999999999 and CLP06:12 [1].')).toEqual([
      ['identifier', 'CE:SYNPLAN-FIX-ONE', 'CE:SYNPLAN-FIX-ONE'],
      ['identifier', '2U:SYNPAYERQ', '2U:SYNPAYERQ'],
      ['identifier', 'XV:SYNPAYERXV', 'XV:SYNPAYERXV'],
      ['identifier', 'TRN03:1999999999', 'TRN03:1999999999'],
      ['identifier', 'CLP06:12', 'CLP06:12'],
    ]);
    // An ERA export's keys, up to the space; a key holding a figure's shape is the key, not the figure.
    expect(figures('NAME:SYNTHETIC PAYER Q, PLAN:SYNTHETIC PPO, CE:12 and CE:2026-05-01 and FS:97110-GP')).toEqual([
      ['identifier', 'NAME:SYNTHETIC', 'NAME:SYNTHETIC'],
      ['identifier', 'PLAN:SYNTHETIC', 'PLAN:SYNTHETIC'],
      ['identifier', 'CE:12', 'CE:12'],
      ['identifier', 'CE:2026-05-01', 'CE:2026-05-01'],
      ['identifier', 'FS:97110-GP', 'FS:97110-GP'],
    ]);
    // Two capitals or digits and a colon lead a key: 10:30 is one identifier.
    expect(figures('At 10:30.')).toEqual([['identifier', '10:30', '10:30']]);
    // Not a key: a lower-case or longer unlisted qualifier, a colon before a space, one character before it, a placeholder.
    expect(figures('ce:synplan, ABC:DEF, Re: the claim, RE: SYNPLAN, xCE:SYNPLAN, {{member_id:1}}')).toEqual([]);
    expect(figures('A ratio of 1:2.')).toEqual([
      ['number', '1', '1'],
      ['number', '2', '2'],
    ]);
  });
});

describe('every word, form and abbreviation the scanner knows', () => {
  it('reads each ordinal word as the number it orders', () => {
    const ordinals: readonly (readonly [string, string])[] = [
      ['first', '1'],
      ['second', '2'],
      ['third', '3'],
      ['fourth', '4'],
      ['fifth', '5'],
      ['sixth', '6'],
      ['seventh', '7'],
      ['eighth', '8'],
      ['ninth', '9'],
      ['tenth', '10'],
      ['eleventh', '11'],
      ['twelfth', '12'],
      ['thirteenth', '13'],
      ['fourteenth', '14'],
      ['fifteenth', '15'],
      ['sixteenth', '16'],
      ['seventeenth', '17'],
      ['eighteenth', '18'],
      ['nineteenth', '19'],
      ['twentieth', '20'],
      ['thirtieth', '30'],
      ['fortieth', '40'],
      ['fiftieth', '50'],
      ['sixtieth', '60'],
      ['seventieth', '70'],
      ['eightieth', '80'],
      ['ninetieth', '90'],
      ['hundredth', '100'],
      ['thousandth', '1000'],
      ['millionth', '1000000'],
    ];
    for (const [word, value] of ordinals) {
      expect(figures(`The ${word} claim.`), word).toEqual([['number', value, word]]);
    }
  });

  it('reads a list of modifiers however it is joined, and a modifier named after it', () => {
    for (const list of ['modifiers GP/KX', 'modifiers GP or KX', 'modifiers GP and KX', 'modifiers GP, and KX', 'modifiers GP , KX', 'modifiers  GP / KX']) {
      expect(figures(`${list}.`), list).toEqual([
        ['modifier', 'GP', 'GP'],
        ['modifier', 'KX', 'KX'],
      ]);
    }
    expect(figures('Modifier   GP; the KX   modifiers; modifierGP.')).toEqual([
      ['modifier', 'GP', 'GP'],
      ['modifier', 'KX', 'KX'],
    ]);
  });

  it('reads the other written forms of figures as they are written', () => {
    expect(figures('12 / 34 of them, the 1,234th claim, 1,234,567 units, x12 units, \u00d73 lines; claim (SYN123), [AB12] and "Q9"; Level  IV.')).toEqual([
      ['identifier', '12/34', '12 / 34'],
      ['number', '1234', '1,234th'],
      ['number', '1234567', '1,234,567'],
      ['number', '12', 'x12'],
      ['number', '3', '\u00d73'],
      ['identifier', 'SYN123', 'SYN123'],
      ['identifier', 'AB12', 'AB12'],
      ['identifier', 'Q9', 'Q9'],
      ['number', '4', 'IV'],
    ]);
    expect(figures('Member SYN123AB and 9Z9.')).toEqual([
      ['identifier', 'SYN123AB', 'SYN123AB'],
      ['identifier', '9Z9', '9Z9'],
    ]);
    expect(figures('March 5th, March 31, 2026, April 31, 2026, 5 March 2026, 31 April 2026, Dec 5, 2026, the second of June 2026 and June twenty first.')).toEqual([
      ['month_day', '03-05', 'March 5th'],
      ['date', '2026-03-31', 'March 31, 2026'],
      ['identifier', 'April 31, 2026', 'April 31, 2026'],
      ['date', '2026-03-05', '5 March 2026'],
      ['identifier', '31 April 2026', '31 April 2026'],
      ['date', '2026-12-05', 'Dec 5, 2026'],
      ['date', '2026-06-02', 'second of June 2026'],
      ['month_day', '06-21', 'June twenty first'],
    ]);
  });

  it('keeps every listed abbreviation inside its sentence, and ends one at any other word', () => {
    const listed = ['etc', 'vs', 'no', 'nos', 'inc', 'co', 'corp', 'ltd', 'llc', 'dr', 'mr', 'mrs', 'ms', 'st', 'sec', 'ch', 'art', 'para', 'pp', 'cf', 'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec'];
    for (const abbreviation of listed) {
      const text = `Under ${abbreviation}. 4 it pays [1].`;
      expect(sentences(text), abbreviation).toEqual([text]);
    }
    expect(sentences('See Sec. 4 [1]. A.B. c [1].')).toEqual(['See Sec. 4 [1].', 'A.B. c [1].']);
    expect(sentences('Under claim. 4 it pays [1].')).toEqual(['Under claim.', '4 it pays [1].']);
    expect(sentences('See sec. Four [1].')).toEqual(['See sec.', 'Four [1].']);
  });

  it('ends a sentence with its run of marks, a closing quote and the markers after it, and at every paragraph', () => {
    expect(sentences('Paid short!! [1] Next [2]. Paid "short." [1] Paid short.  [1] Paid [12]. Next [1 , 2]. Ends here.[1] Next.')).toEqual([
      'Paid short!! [1]',
      'Next [2].',
      'Paid "short." [1]',
      'Paid short.  [1]',
      'Paid [12].',
      'Next [1 , 2].',
      'Ends here.[1]',
      'Next.',
    ]);
    expect(sentences('First part\n\nSecond part [1].\n \t\nThird [2]')).toEqual(['First part', 'Second part [1].', 'Third [2]']);
    expect(sentences('One [1].\n\n[2]')).toEqual(['One [1].\n\n[2]']);
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
    expect(words('first second')).toEqual([1, 2]);
    expect(words('twenty first')).toEqual([21]);
    expect(words('one hundred and fifth')).toEqual([105]);
    expect(words('two hundredth')).toEqual([200]);
    expect(words('two thousandth')).toEqual([2000]);
    expect(words('three dozen')).toEqual([36]);
    expect(words('dozen dozen')).toEqual([12, 12]);
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
    expect([isoDate(2026, 12, 31), isoDate(2026, 1, 1), isoDate(999, 1, 1)]).toEqual(['2026-12-31', '2026-01-01', '0999-01-01']);
    expect([isoDate(2026, 0, 1), isoDate(2026, 4, 31), isoDate(2026, 4, 0)]).toEqual([null, null, null]);
  });

  it('reads Roman numerals, and only numerals', () => {
    expect(['I', 'IV', 'ix', 'XL', 'MCMXCIX', 'CD', 'MMXXVI'].map(romanValue)).toEqual([1, 4, 9, 40, 1999, 400, 2026]);
    expect(['', 'IIII', 'IC', 'VX', 'ILL', 'MMMM'].map(romanValue)).toEqual([null, null, null, null, null, null]);
  });
});

// ---------------------------------------------------------------------------------------------------
// The inputs each rule of the scanner separates (PRD 18, mutation testing; ADR 0047): every case below is
// one that a looser pattern, quantifier or anchor, or a grammar rule left out, would read differently.
// ---------------------------------------------------------------------------------------------------

describe('numbersInWords: where each rule of the grammar joins and where it splits', () => {
  it('joins across "and" only after hundred, thousand or million', () => {
    expect(words('twenty and one')).toEqual([20, 1]);
    expect(words('two thousand and five')).toEqual([2005]);
    expect(words('a hundred and twenty')).toEqual([120]);
  });

  it('ends a number at a word that is no number word', () => {
    expect(words('twenty claims one')).toEqual([20, 1]);
  });

  it('joins a teen or a tens word only after hundred, dozen, score or a scale', () => {
    expect(words('two hundred twelve')).toEqual([212]);
    expect(words('two hundred twenty')).toEqual([220]);
    expect(words('three thousand twelve')).toEqual([3012]);
    expect(words('three thousand forty')).toEqual([3040]);
  });

  it('multiplies by hundred, dozen or score a count from one to ninety-nine only', () => {
    expect(words('twelve hundred')).toEqual([1200]);
    expect(words('forty dozen')).toEqual([480]);
    expect(words('zero hundred')).toEqual([0, 100]);
    expect(words('one hundred one hundred')).toEqual([101, 100]);
    expect(words('one hundred zero hundred')).toEqual([100, 100]);
  });

  it('joins a scale only to a count before it, and after a scale only a smaller one', () => {
    expect(words('million thousand')).toEqual([1_000_000, 1000]);
    expect(words('zero thousand')).toEqual([0, 1000]);
    expect(words('two thousand three million')).toEqual([2003, 1_000_000]);
    expect(words('two thousand three thousand')).toEqual([2003, 1000]);
  });

  it('ends a number at its ordinal word, even before a word that would join', () => {
    expect(words('twentieth one')).toEqual([20, 1]);
    expect(words('hundredth five')).toEqual([100, 5]);
  });
});

describe('scanText: the inputs each pattern separates', () => {
  it('reads a figure written right after a placeholder or a citation marker', () => {
    expect(figures('Claim {{member_id:1}}7 units and [1]2 lines.')).toEqual([
      ['number', '7', '7'],
      ['number', '2', '2'],
    ]);
  });

  it('trims only the opening punctuation before an identifier, however much of it there is', () => {
    expect(figures('See A1(B and (("Q9")) here.')).toEqual([
      ['identifier', 'A1(B', 'A1(B'],
      ['identifier', 'Q9', 'Q9'],
    ]);
  });

  it('reads an ordinal day with a month only when the month’s name is capitalized, on either side', () => {
    expect(figures('Paid jUNE fifth.')).toEqual([['number', '5', 'fifth']]);
    expect(figures('The fifth of may.')).toEqual([['number', '5', 'fifth']]);
    expect(figures('The fifth of mAY.')).toEqual([['number', '5', 'fifth']]);
  });

  it('reads a day no month has, written without its year, and a date in digits no calendar has, as identifiers', () => {
    expect(figures('Billed February 30 and April 31st; on 2/30/2026 and 13/1/2026.')).toEqual([
      ['identifier', 'February 30', 'February 30'],
      ['identifier', 'April 31st', 'April 31st'],
      ['identifier', '2/30/2026', '2/30/2026'],
      ['identifier', '13/1/2026', '13/1/2026'],
    ]);
  });

  it('reads a list of modifiers with any run of spaces around its commas and its words', () => {
    for (const list of ['modifiers GP , and KX', 'modifiers GP,  and KX', 'modifiers GP, and  KX', 'modifiers GP,KX', 'modifiers GP  and KX', 'modifiers GP and  KX', 'modifiers GP  or KX', 'modifiers GP or  KX']) {
      expect(figures(`${list}.`), list).toEqual([
        ['modifier', 'GP', 'GP'],
        ['modifier', 'KX', 'KX'],
      ]);
    }
  });

  it('reads x and digits followed by a decimal as an identifier, not units', () => {
    expect(figures('Billed x2.5 units.')).toEqual([['identifier', 'x2.5', 'x2.5']]);
  });

  it('leaves "one" alone only as a word of its own, never as the start of a longer number', () => {
    expect(figures('One hundred claims, one hundred and one units.')).toEqual([
      ['number', '100', 'One hundred'],
      ['number', '101', 'one hundred and one'],
    ]);
  });

  it('makes only the last number before "percent" a percentage, and ends each other number at its own last word', () => {
    expect(figures('It pays between ten and twenty percent.')).toEqual([
      ['number', '10', 'ten'],
      ['percent', '20', 'twenty percent'],
    ]);
  });
});

describe('sentenceSpans: the inputs each rule separates', () => {
  it('reads a run of marks after an abbreviation from its first mark', () => {
    expect(sentences('It pays etc... and more [1].')).toEqual(['It pays etc... and more [1].']);
  });

  it('takes into a sentence the markers after its mark, however they are spaced, numbered and listed', () => {
    for (const marker of ['[12]', '[1, 23]', '[1,2]', '[1 ,2]', '[1, 2]']) {
      expect(sentences(`Paid short. ${marker} Next [1].`), marker).toEqual([`Paid short. ${marker}`, 'Next [1].']);
    }
  });

  it('drops a last piece of marks and markers that holds no word, giving none of its markers to the sentence before', () => {
    expect(sentences('Paid short [1]. ... [2]')).toEqual(['Paid short [1].']);
  });

  it('keeps a sentence going after an abbreviation’s period only, before any spaces and a lowercase word or a digit', () => {
    expect(sentences('It pays etc! and more [1].')).toEqual(['It pays etc!', 'and more [1].']);
    expect(sentences('Under etc.  4 it pays [1].')).toEqual(['Under etc.  4 it pays [1].']);
  });

  it('reads as an abbreviation only single letters, each but the last followed by its period', () => {
    expect(sentences('Under U.S.C. 1983 it pays [1].')).toEqual(['Under U.S.C. 1983 it pays [1].']);
    expect(sentences('Under NC.G.S. 58 it pays [1].')).toEqual(['Under NC.G.S.', '58 it pays [1].']);
    expect(sentences('Under A.Bc. 4 it pays [1].')).toEqual(['Under A.Bc.', '4 it pays [1].']);
  });

  it('ends a paragraph at a blank line holding spaces or tabs, and nowhere else', () => {
    expect(sentences('A heading\n \nThe text [1].')).toEqual(['A heading', 'The text [1].']);
    expect(sentences('A heading\nmore\nThe text [1].')).toEqual(['A heading\nmore\nThe text [1].']);
  });

  it('cuts at each paragraph between one sentence’s end and the next, never at one before or after', () => {
    expect(sentences('First [1]. Second\n\nThird [2].')).toEqual(['First [1].', 'Second', 'Third [2].']);
    expect(sentences('First\n\nSecond [1]. Third [2].')).toEqual(['First', 'Second [1].', 'Third [2].']);
  });

  it('ends a sentence before the spaces that end its paragraph', () => {
    expect(sentences('Paid short [1]  \n\nNext [2]')).toEqual(['Paid short [1]', 'Next [2]']);
  });

  it('gives a paragraph of markers alone to the sentence before it, and drops one with no sentence before it', () => {
    expect(sentences('One [2]\n\n[3]')).toEqual(['One [2]\n\n[3]']);
    expect(sentences('Lead [1]. One [2]\n\n[3] [4]')).toEqual(['Lead [1].', 'One [2]\n\n[3] [4]']);
    expect(sentences('Lead [1]. Two [1]. One [2]\n\n[3]')).toEqual(['Lead [1].', 'Two [1].', 'One [2]\n\n[3]']);
    expect(sentences('[1] [2]')).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';

import {
  CURRENCY_WORDS,
  MULTIPLES,
  MULTIPLIERS,
  ORDINALS,
  SCALES,
  STRICT_NUMBER_WORDS,
  STRICT_PLURALS,
  TEENS,
  TENS,
  UNITS,
  scanText,
} from './scan';

/**
 * The scanner's strict mode (design lane-b-packet-figure-placeholders, sections 2.4 and 4; docs/adr/0089; test matrix
 * CAS-52): a template's tokens masked first, then every figure and number word of its free text read, each saying
 * whether it is written in symbols or in words. The reading without strict mode is unchanged (scan.test.ts, and the
 * strict-only words below). All text SYNTHETIC.
 */

/** Every word of the scanner's tables, the strict-only ones included: the one list of number words. */
const TABLE_WORDS = [
  ...Object.keys(UNITS),
  ...Object.keys(TEENS),
  ...Object.keys(TENS),
  ...Object.keys(MULTIPLIERS),
  ...Object.keys(SCALES),
  ...Object.keys(ORDINALS),
  ...Object.keys(MULTIPLES),
  ...Object.keys(STRICT_NUMBER_WORDS),
  ...Object.keys(STRICT_PLURALS),
  ...CURRENCY_WORDS,
];

describe('strict scanning masks a template’s tokens first', () => {
  it('reads no digit inside a fact id, an identifier placeholder or a marker', () => {
    const text = 'For {{fact:code.97110}} and {{fact:lines.1+2+4.paid}} of {{claim_control_number:3}} [1, 2].';
    const scan = scanText(text, { strict: true });
    expect(scan.figures).toEqual([]);
    expect(scan.facts).toEqual([
      { id: 'code.97110', start: 4, end: 23 },
      { id: 'lines.1+2+4.paid', start: 28, end: 53 },
    ]);
    expect(scan.placeholders).toEqual([{ kind: 'claim_control_number', row: 3, start: 57, end: 83 }]);
    expect(scan.markers).toEqual([{ sources: [1, 2], start: 84, end: 90 }]);
    expect(scan.strays).toEqual([]);
  });

  it('reads any other run in double braces, and any lone {{ or }}, as a stray, never inside it', () => {
    const text = 'A {{fact:Code.97110}} b {{ 5 dollars }} c {{fact:1a}} d {{ e }} f }} g {{ h.';
    const scan = scanText(text, { strict: true });
    expect(scan.figures).toEqual([]);
    expect(scan.facts).toEqual([]);
    expect(scan.strays.map((span) => text.slice(span.start, span.end))).toEqual(['{{fact:Code.97110}}', '{{ 5 dollars }}', '{{fact:1a}}', '{{ e }}', '}}', '{{']);
  });

  it('reads a fact token inside a stray’s braces as the token, and the braces around it as a stray holding it', () => {
    const text = 'x {{ {{fact:pattern.paid}} }} y';
    const scan = scanText(text, { strict: true });
    expect(scan.facts.map((token) => token.id)).toEqual(['pattern.paid']);
    expect(scan.strays.map((span) => text.slice(span.start, span.end))).toEqual(['{{ {{fact:pattern.paid}} }}']);
  });

  it('leaves the reading without strict mode as it was: no fact token or stray read, the ids’ digits read as before', () => {
    const scan = scanText('For {{fact:code.97110}} [1].');
    expect(scan).not.toHaveProperty('facts');
    expect(scan.figures.map((figure) => [figure.kind, figure.value])).toEqual([['code', '97110']]);
    expect(scan.figures[0]).not.toHaveProperty('written');
  });
});

describe('strict scanning reads every figure of free text (section 2.4)', () => {
  const read = (text: string) => scanText(text, { strict: true }).figures.map((figure) => [text.slice(figure.start, figure.end), figure.kind, figure.written]);

  it('reads each figure written in symbols as such: digits, amounts, percents, dates, codes, modifiers, Roman numerals, ordinal days, keys', () => {
    expect(read('The payer allowed $70.00 on 2026-03-02 for 97110-GP at 120% [1] and 3.')).toEqual([
      ['$70.00', 'amount', 'symbols'],
      ['2026-03-02', 'date', 'symbols'],
      ['97110', 'code', 'symbols'],
      ['GP', 'modifier', 'symbols'],
      ['120%', 'percent', 'symbols'],
      ['3', 'number', 'symbols'],
    ]);
    expect(read('A level II appeal on March fifth.')).toEqual([
      ['II', 'number', 'symbols'],
      ['March fifth', 'month_day', 'symbols'],
    ]);
    expect(read('Under CE:SYNPLAN-ONE and 58-3-225, x2.')).toEqual([
      ['CE:SYNPLAN-ONE', 'identifier', 'symbols'],
      ['58-3-225', 'identifier', 'symbols'],
      ['x2', 'number', 'symbols'],
    ]);
  });

  it('reads every sign and number character left over: $, %, §, #, ¢ and digits of other scripts', () => {
    expect(read('The $ and % and § and # and ¢ signs, and ٣.')).toEqual([
      ['$', 'identifier', 'symbols'],
      ['%', 'identifier', 'symbols'],
      ['§', 'identifier', 'symbols'],
      ['#', 'identifier', 'symbols'],
      ['¢', 'identifier', 'symbols'],
      ['٣', 'identifier', 'symbols'],
    ]);
  });

  it('reads a lone “one” or “zero”, which the reading without strict mode leaves as prose', () => {
    expect(read('One of the lines, and zero more.')).toEqual([
      ['One', 'number', 'words'],
      ['zero', 'number', 'words'],
    ]);
    expect(scanText('One of the lines, and zero more.').figures).toEqual([]);
  });

  it('reads every word of the scanner’s tables, the strict-only ones too, alone at its span, in words', () => {
    for (const word of TABLE_WORDS) {
      const text = `The payer wrote ${word} here.`;
      const start = text.indexOf(word);
      expect(
        scanText(text, { strict: true }).figures.map((figure) => [figure.start, figure.end, figure.written]),
        word,
      ).toEqual([[start, start + word.length, 'words']]);
    }
  });

  it('reads the strict-only words only in strict mode', () => {
    for (const word of [...Object.keys(STRICT_NUMBER_WORDS), ...Object.keys(STRICT_PLURALS), ...CURRENCY_WORDS]) {
      expect(scanText(`The payer wrote ${word} here.`).figures, word).toEqual([]);
    }
    expect(Object.keys(STRICT_PLURALS)).toEqual(expect.arrayContaining(['zeros', 'zeroes', 'ones', 'sixes', 'twenties', 'hundreds', 'thousands', 'millions', 'billions', 'dozens', 'scores', 'halves', 'thirds', 'quarters']));
    expect(Object.keys(STRICT_PLURALS)).not.toEqual(expect.arrayContaining(['firsts']));
    expect(Object.keys(STRICT_PLURALS)).not.toEqual(expect.arrayContaining(['seconds']));
  });

  it('reads numbers in words whole, with “percent” as a percentage, and “two billion” as two words', () => {
    expect(read('Twenty-one lines at twenty percent, two billion.')).toEqual([
      ['Twenty-one', 'number', 'words'],
      ['twenty percent', 'percent', 'words'],
      ['two', 'number', 'words'],
      ['billion', 'number', 'words'],
    ]);
  });

  it('reads a zero amount stated in prose after a payment or allowance verb whole, in words', () => {
    for (const phrase of ['paid nothing', 'allowed none', 'paid the practice zero', 'made no payment', 'issued no payments', 'nothing was paid', 'no amount has been allowed', 'reimbursed no money']) {
      const text = `The payer ${phrase} on the lines.`;
      expect(read(text), phrase).toEqual([[phrase, 'amount', 'words']]);
    }
    // Not a payment verb: prose.
    expect(read('The payer noted nothing new.')).toEqual([]);
  });
});

describe('the strict-only tables and readings, value by value', () => {
  const only = (text: string) => scanText(text, { strict: true }).figures.map(({ kind, value, start, end, written }) => ({ kind, value, start, end, written }));

  it('states each strict-only number word’s number, and reads it in any case', () => {
    expect(STRICT_NUMBER_WORDS).toEqual({ nil: '0', nought: '0', naught: '0', billion: '1000000000', quarter: '0.25', double: '2', triple: '3', once: '1' });
    for (const [word, value] of Object.entries(STRICT_NUMBER_WORDS)) {
      for (const written of [word, word.toUpperCase()]) {
        expect(only(written), written).toEqual([{ kind: 'number', value, start: 0, end: word.length, written: 'words' }]);
      }
    }
    expect(STRICT_PLURALS['zeroes']).toBe('zero');
    expect(STRICT_PLURALS['zeros']).toBe('zero');
    expect(Object.entries(STRICT_PLURALS).filter(([, word]) => word === 'zero').map(([plural]) => plural).sort()).toEqual(['zeroes', 'zeros']);
    expect(only('ZEROES')).toEqual([{ kind: 'number', value: 'zeroes', start: 0, end: 6, written: 'words' }]);
  });

  it('reads a run of signs left over as one figure', () => {
    expect(only('see §§ and #¢')).toEqual([
      { kind: 'identifier', value: '§§', start: 4, end: 6, written: 'symbols' },
      { kind: 'identifier', value: '#¢', start: 11, end: 13, written: 'symbols' },
    ]);
  });

  it('reads every form of a zero amount whole, whatever the spaces between its words', () => {
    for (const phrase of [
      'make no payment',
      'issue no payment',
      'send no payment',
      'made  no payment',
      'made no  payment',
      'sent no allowance',
      'issued no reimbursement',
      'makes no remittance',
      'no  amount was paid',
      'nothing  was paid',
      'nothing has  been paid',
      'none have  been allowed',
      'zero was  reimbursed',
    ]) {
      expect(only(phrase), phrase).toEqual([{ kind: 'amount', value: '0', start: 0, end: phrase.length, written: 'words' }]);
    }
  });

  it('keeps each token and stray in the text’s order', () => {
    const scan = scanText('{{fact:pattern.paid}} }} {{fact:pattern.lines}} {{ [1]', { strict: true });
    expect(scan.facts.map((token) => token.id)).toEqual(['pattern.paid', 'pattern.lines']);
    expect(scan.strays.map((stray) => stray.start)).toEqual([22, 48]);
  });
});

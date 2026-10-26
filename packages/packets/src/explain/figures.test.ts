import { describe, expect, it } from 'vitest';

import { ExplainShapeError, figure, formatFigure, label, listOf, plainText, say, segmentText, slotValue } from './figures';

/**
 * The display forms (design 4.3, figures.test.ts): each changes how a value is written, never the value; and the
 * building of sentences, which joins text and reads each figure at its slot's path.
 */
describe('the display forms', () => {
  it.each([
    ['10000', '$100.00'],
    ['0', '$0.00'],
    ['-500', '-$5.00'],
    ['123456789', '$1,234,567.89'],
    ['7', '$0.07'],
  ])('dollars: %s cents is %s', (cents, text) => {
    expect(formatFigure(cents, 'dollars')).toBe(text);
  });

  it('dollars refuses a fraction of a cent, which only exact dollars prints', () => {
    expect(() => formatFigure('2323.2', 'dollars')).toThrow();
  });

  it.each([
    ['2323.2', '$23.232'],
    ['4646.4', '$46.464'],
    ['10000', '$100.00'],
    ['0', '$0.00'],
    ['-0.5', '-$0.005'],
    ['-1234567.125', '-$12,345.67125'],
    ['2323.20', '$23.232'],
  ])('exact dollars: %s cents is %s, every fraction digit kept', (cents, text) => {
    expect(formatFigure(cents, 'exact_dollars')).toBe(text);
  });

  it.each([
    ['110', '110%'],
    ['77', '77%'],
    ['2', '2%'],
    ['12.5', '12.5%'],
  ])('percent: %s is %s', (value, text) => {
    expect(formatFigure(value, 'percent')).toBe(text);
  });

  it('per RVU keeps the trailing zeros as the release writes them', () => {
    expect(formatFigure('20.0000', 'per_rvu')).toBe('$20.0000 per RVU');
    expect(formatFigure('33.2875', 'per_rvu')).toBe('$33.2875 per RVU');
  });

  it('verbatim prints text as the trace holds it, and an integer in its digits', () => {
    expect(formatFigure('0.950', 'verbatim')).toBe('0.950');
    expect(formatFigure('01', 'verbatim')).toBe('01');
    expect(formatFigure(900001, 'verbatim')).toBe('900001');
    expect(formatFigure(2026, 'verbatim')).toBe('2026');
  });

  it('count is an array’s length, grouped by thousands, and of nothing else', () => {
    expect(formatFigure(['rr-1', 'rr-2'], 'count')).toBe('2');
    expect(formatFigure([], 'count')).toBe('0');
    expect(formatFigure(Array.from({ length: 1000 }, () => 'rr'), 'count')).toBe('1,000');
    expect(() => formatFigure('2', 'count')).toThrow(ExplainShapeError);
  });

  it.each([
    [1, '1'],
    [999, '999'],
    [1000, '1,000'],
    [3650, '3,650'],
    [1234567, '1,234,567'],
    ['3650', '3,650'],
    ['0', '0'],
  ] as const)('integer: %s is %s, grouped by thousands', (value, text) => {
    expect(formatFigure(value, 'integer')).toBe(text);
  });

  it('integer refuses anything but a whole number', () => {
    for (const value of [-5, 2 ** 60, '-5', '1.5', '1,000', '', null, ['x']]) {
      expect(() => formatFigure(value, 'integer'), String(value)).toThrow('an integer figure is a whole number');
    }
  });

  it('refuses a value of a kind its form does not print', () => {
    expect(() => formatFigure(2, 'dollars')).toThrow('a number prints verbatim, as an integer');
    expect(() => formatFigure(2 ** 60, 'verbatim')).toThrow(ExplainShapeError);
    expect(() => formatFigure(null, 'verbatim')).toThrow('a verbatim figure is text');
    expect(() => formatFigure(true, 'percent')).toThrow('a percent figure is text');
  });

  it('never prints 0% for a suspended sequestration: that sentence form takes no percent figure (line.test.ts)', () => {
    expect(formatFigure('0', 'percent')).toBe('0%');
  });
});

describe('sentences', () => {
  it('joins adjacent text, leaves out what is null, false or empty, and keeps figures and codes apart', () => {
    const sentence = say('Fee ', ['schedule', null, false, ''], ': ', { figure: '$1.00', source: { from: 'trace', path: ['x'], form: 'dollars', slot: 'summary.rounded' } }, ' (AMT B6).');
    expect(sentence.segments).toEqual([{ text: 'Fee schedule: ' }, { figure: '$1.00', source: { from: 'trace', path: ['x'], form: 'dollars', slot: 'summary.rounded' } }, { text: ' (' }, { code: 'AMT B6' }, { text: ').' }]);
    expect(plainText(sentence)).toBe('Fee schedule: $1.00 (AMT B6).');
  });

  it('lists one, two and three items', () => {
    expect(plainText(say(listOf(['a'])))).toBe('a');
    expect(plainText(say(listOf(['a', 'b'])))).toBe('a and b');
    expect(plainText(say(listOf(['a', 'b', 'c'])))).toBe('a, b and c');
    expect(listOf([])).toEqual([]);
  });

  it('labels a row or a worksheet, and prints each kind of segment', () => {
    expect(label(3, 'row')).toEqual({ label: '3', of: 'row' });
    expect(segmentText({ label: '1', of: 'worksheet' })).toBe('1');
    expect(segmentText({ quoted: 'Map the plan', from: 'unpriced_reasons' })).toBe('Map the plan');
    expect(segmentText({ code: 'CQ' })).toBe('CQ');
    expect(segmentText({ text: 'a' })).toBe('a');
  });
});

describe('a figure at its slot', () => {
  const trace = { steps: { rounding: { rounded_cents: '10000' }, adjustments: [{ after_cents: '4500' }, { after_cents: '4410.5' }] } };
  const citation = { kind: 'contract', page: 2 };

  it('reads the slot’s path, each index in its place, and says where it came from', () => {
    expect(figure({ trace, citation }, 'summary.rounded', 'dollars')).toEqual({ figure: '$100.00', source: { from: 'trace', path: ['steps', 'rounding', 'rounded_cents'], form: 'dollars', slot: 'summary.rounded' } });
    expect(figure({ trace, citation }, 'summary.after', 'exact_dollars', [1])).toEqual({ figure: '$44.105', source: { from: 'trace', path: ['steps', 'adjustments', 1, 'after_cents'], form: 'exact_dollars', slot: 'summary.after' } });
    expect(figure({ trace, citation, row: 4 }, 'summary.page', 'verbatim')).toEqual({ figure: '2', source: { from: 'citation', path: ['page'], form: 'verbatim', slot: 'summary.page', row: 4 } });
  });

  it('refuses a slot with no value at its path, or with the wrong number of indexes', () => {
    expect(() => slotValue({ trace, citation }, 'summary.variance')).toThrow('no value for the slot summary.variance');
    expect(() => slotValue({ trace, citation }, 'summary.after')).toThrow('no value for the slot summary.after');
    expect(() => slotValue({ trace, citation }, 'summary.after', [5])).toThrow('no value for the slot summary.after');
    expect(() => slotValue({ trace, citation }, 'summary.rounded', [0])).toThrow('the slot summary.rounded takes fewer indexes');
    expect(() => slotValue({ trace, citation: null }, 'summary.page')).toThrow('no value for the slot summary.page');
  });
});

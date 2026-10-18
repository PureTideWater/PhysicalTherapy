import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { parseCsv } from './csv';
import { LedgerError } from './stages';

describe('the export CSV reader', () => {
  it('reads fields, quoted fields, doubled quotes and both line endings, skipping blank lines and a byte-order mark', () => {
    expect(parseCsv('﻿a,b\r\n1,"x, y"\n\n"say ""hi""",\r\n')).toEqual([
      ['a', 'b'],
      ['1', 'x, y'],
      ['say "hi"', ''],
    ]);
    expect(parseCsv('a,"line\nbreak"')).toEqual([['a', 'line\nbreak']]);
    expect(parseCsv('one\rtwo')).toEqual([['one'], ['two']]);
    expect(parseCsv('""')).toEqual([]);
    expect(parseCsv('"",""')).toEqual([['', '']]);
    expect(parseCsv('a,')).toEqual([['a', '']]);
    expect(parseCsv('a"b')).toEqual([['a"b']]);
    expect(parseCsv('')).toEqual([]);
  });

  it('refuses a quote never closed and text after a closing quote', () => {
    expect(() => parseCsv('"open')).toThrow(LedgerError);
    expect(() => parseCsv('"a"b,c')).toThrow(LedgerError);
  });

  it('reads back what a CSV writer wrote (property)', () => {
    const cell = (value: string) => (/[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value);
    fc.assert(
      fc.property(fc.array(fc.array(fc.string({ maxLength: 8 }), { minLength: 2, maxLength: 4 }), { minLength: 1, maxLength: 5 }), (rows) => {
        const text = `${rows.map((row) => row.map(cell).join(',')).join('\r\n')}\r\n`;
        expect(parseCsv(text)).toEqual(rows);
      }),
    );
  });
});

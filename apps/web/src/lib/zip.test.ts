import { describe, expect, it } from 'vitest';

import { parseZipCode, zipCodeText } from './zip';

/** The ZIP code a person types (PR 6b, ADR 0064). SYNTHETIC ZIP codes only. */
describe('a ZIP code as typed', () => {
  it('takes five digits, and ZIP+4 with or without its hyphen', () => {
    expect(parseZipCode('27601')).toEqual({ zip5: '27601', plusFour: null });
    expect(parseZipCode('27601-1234')).toEqual({ zip5: '27601', plusFour: '1234' });
    expect(parseZipCode('276011234')).toEqual({ zip5: '27601', plusFour: '1234' });
    expect(parseZipCode('  00012-0001 ')).toEqual({ zip5: '00012', plusFour: '0001' });
  });

  it('refuses anything else', () => {
    for (const text of ['', '2760', '276012', '27601-', '27601-123', '27601-12345', '27601 1234', '2760a', '27601-12a4', '27601–1234', '١٢٣٤٥']) {
      expect(parseZipCode(text), JSON.stringify(text)).toBeNull();
    }
  });

  it('shows the ZIP+4 with its hyphen', () => {
    expect(zipCodeText('00012', '5000')).toBe('00012-5000');
    expect(zipCodeText('00011', null)).toBe('00011');
  });
});

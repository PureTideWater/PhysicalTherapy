import { describe, expect, it } from 'vitest';

import { LETTER_CODES_PATTERN, letterCodes, requestToPayerLetter } from './letter';

const BASE = {
  date: '2026-10-15',
  practice: { name: 'SYNTHETIC PHYSICAL THERAPY NORTH', npi: '9900000011' },
  payer: { name: 'SYNTHETIC PAYER C', identifier: '2U:SYNPAYERC' },
};

describe('the request-to-payer letter', () => {
  it('asks for the schedule of the codes named, under the contract named, from a fixed template', () => {
    const letter = requestToPayerLetter({ ...BASE, contract: { title: 'SYNTHETIC PAYER C AGREEMENT', billingEntity: 'SYNTHETIC THERAPY GROUP 01' }, codes: ['97530', ' 97110', '97110', ''] });
    expect(letter).toBe(
      [
        'REQUEST FOR A FEE SCHEDULE',
        '',
        'Date: 2026-10-15',
        '',
        'To: SYNTHETIC PAYER C, provider contracting (payer identifier 2U:SYNPAYERC)',
        'From: SYNTHETIC PHYSICAL THERAPY NORTH (NPI 9900000011)',
        'Billing entity named in the agreement: SYNTHETIC THERAPY GROUP 01',
        '',
        'We are reviewing the payments we receive under our agreement with you titled "SYNTHETIC PAYER C AGREEMENT".',
        '',
        'We do not have the fee schedule that sets the allowed amount for these procedure codes under our agreement with you titled "SYNTHETIC PAYER C AGREEMENT":',
        '',
        '    97110',
        '    97530',
        '',
        'Please send the current fee schedule exhibit, or the page of the agreement that states the rate for each of these codes, with the dates it is effective, and tell us if the agreement excludes any of them.',
        '',
        'Please reply to the contracting address you hold for our practice. Thank you.',
        '',
        'Sincerely,',
        '',
        '',
        '______________________________',
        'SYNTHETIC PHYSICAL THERAPY NORTH',
        '',
      ].join('\n'),
    );
  });

  it('asks for the whole schedule when no code is named, and names no contract or NPI it does not have', () => {
    const letter = requestToPayerLetter({ ...BASE, practice: { name: 'SYNTHETIC PRACTICE', npi: null }, contract: null, codes: [] });
    expect(letter).toContain('From: SYNTHETIC PRACTICE\n');
    expect(letter).toContain('Please send the complete current fee schedule exhibit for our agreement with you, with the dates it is effective.');
    expect(letter).not.toContain('Billing entity');
    expect(requestToPayerLetter({ ...BASE, contract: { title: 'SYNTHETIC', billingEntity: null }, codes: [] })).not.toContain('Billing entity');
  });

  it('accepts only five-character procedure codes, upper-cased and each once', () => {
    expect(letterCodes(['g0283', '97110', 'G0283', ' 97530 ', ''])).toEqual(['97110', '97530', 'G0283']);
    expect(() => letterCodes(['9711'])).toThrow(RangeError);
    expect(() => letterCodes(['97110-59'])).toThrow(RangeError);
  });

  it.each([
    ['ſ9711', 'a long s, whose upper case is S'],
    ['ßAB1', 'a sharp s, whose upper case is SS'],
    ['ı9711', 'a dotless i, whose upper case is I'],
    ['ﬀ971', 'the ff ligature, whose upper case is FF'],
    ['K9711', 'the Kelvin sign, whose lower case is k'],
  ])('refuses %s (%s): each code is tested as typed, before it is upper-cased, as the field’s pattern tests it (DLR-03)', (code) => {
    expect(() => letterCodes([code])).toThrow(RangeError);
    expect(new RegExp(`^(?:${LETTER_CODES_PATTERN})$`, 'v').test(code)).toBe(false);
  });

  it('gives the codes field a pattern the browser compiles with the v flag, which accepts the codes the letter takes', () => {
    const pattern = new RegExp(`^(?:${LETTER_CODES_PATTERN})$`, 'v');
    for (const accepted of ['', '97110', '97110, 97530', ' g0283;97110 ', '97110,,97530', '97110\t97530']) {
      expect(pattern.test(accepted), accepted).toBe(true);
      expect(() => letterCodes(accepted.trim().split(/[\s,;]+/)), accepted).not.toThrow();
    }
    for (const refused of ['ABC', '97110-59', '971100', '97110 9753']) {
      expect(pattern.test(refused), refused).toBe(false);
      expect(() => letterCodes(refused.trim().split(/[\s,;]+/)), refused).toThrow(RangeError);
    }
  });
});

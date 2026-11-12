import { describe, expect, it } from 'vitest';

import { emailAddress, registrationCode } from './schemas';

describe('the shared email field', () => {
  it('normalizes a well-formed address to lowercase, trimmed', () => {
    expect(emailAddress.parse('  Reset@Synthetic.TEST ')).toBe('reset@synthetic.test');
  });

  it('refuses a malformed address with an instruction, read after the field’s name ("Email: enter an email address"; review UXB-S2)', () => {
    const result = emailAddress.safeParse('reset-no-dot@synthetic');
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toEqual(['enter an email address']);
  });
});

describe('the one-time code that opens key registration (docs/adr/0095)', () => {
  const messages = (typed: string): string[] | undefined => registrationCode.safeParse(typed).error?.issues.map((issue) => issue.message);

  it('takes the code as a person types what was read to them: lower case, spaces and hyphens', () => {
    expect(registrationCode.parse('abcd efgh')).toBe('ABCDEFGH');
    expect(registrationCode.parse(' 2345-6789 ')).toBe('23456789');
  });

  it('refuses an empty field and a wrong shape each with one instruction, and never a look-alike symbol', () => {
    expect(messages('')).toEqual(['fill this in']);
    expect(messages(' - ')).toEqual(['fill this in']);
    for (const typed of ['ABC', 'ABCDEFGHJ', 'ABCDEFG0', 'ABCDEFG1', 'ABCDEFGI', 'ABCDEFGO', 'ABCDEFG!']) {
      expect(messages(typed)).toEqual(['enter the eight letters and digits of the code PaidWhole gave you']);
    }
    expect(registrationCode.safeParse('A'.repeat(33)).success).toBe(false);
  });
});

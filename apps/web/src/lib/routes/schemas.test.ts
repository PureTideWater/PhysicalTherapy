import { describe, expect, it } from 'vitest';

import { emailAddress } from './schemas';

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

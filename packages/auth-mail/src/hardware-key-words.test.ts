import { describe, expect, it } from 'vitest';

import { HARDWARE_KEY_NOTICE_KINDS, HARDWARE_KEY_NOTICE_SUBJECTS, hardwareKeyNoticeLines, utcMinute } from './words';

/**
 * The three hardware-key notices' words (docs/adr/0095; UX review U18 to U20): true to what the account can do next,
 * one name for the key (an account holds one live key), and in none of them a link, a code or a name. Synthetic values.
 */
const AT = new Date('2026-11-12T20:43:50Z');
const SUPPORT = 'support@synthetic.test';

describe('the hardware-key notices', () => {
  it('says after a removal that the account cannot sign in until a new key is registered, and who removed it (U18)', () => {
    const text = hardwareKeyNoticeLines('removed', AT, SUPPORT).join(' ');
    expect(text).toContain('was removed by two PaidWhole administrators at 2026-11-12 20:43 UTC');
    expect(text).toContain('You cannot sign in until you register a new hardware key.');
    expect(text).toContain('PaidWhole support first opens registration and reads you a one-time code by phone.');
    expect(text).toContain('PaidWhole never sends this code by email or text.');
    expect(text).not.toContain('Signing in asks for your password and your authenticator code.');
  });

  it('says on an opening that the code is never sent by email or text (U19)', () => {
    const text = hardwareKeyNoticeLines('registration_opened', AT, SUPPORT).join(' ');
    // The notice's time is the opening's own, and the database ends it exactly one hour later (V9).
    expect(text).toContain('at 2026-11-12 20:43 UTC. It is open until 2026-11-12 21:43 UTC.');
    expect(text).toContain(utcMinute(new Date(AT.getTime() + 3_600_000)));
    expect(text).not.toContain('for 1 hour');
    expect(text).toContain('PaidWhole never sends this code by email or text.');
  });

  it('names the key in the singular, as the sign-in screens do (U20)', () => {
    expect(HARDWARE_KEY_NOTICE_SUBJECTS.removed).toBe('Your hardware key was removed');
    for (const kind of HARDWARE_KEY_NOTICE_KINDS) {
      expect(`${HARDWARE_KEY_NOTICE_SUBJECTS[kind]} ${hardwareKeyNoticeLines(kind, AT, SUPPORT).join(' ')}`).not.toMatch(/hardware keys/);
    }
  });

  it('carries no link, no code and the one route in each', () => {
    for (const kind of HARDWARE_KEY_NOTICE_KINDS) {
      const text = hardwareKeyNoticeLines(kind, AT, SUPPORT).join(' ');
      expect(text).not.toMatch(/https?:|href|www\./);
      expect(text).not.toMatch(/\b[0-9A-Z]{4} [0-9A-Z]{4}\b/);
      expect(text).toContain(`write to ${SUPPORT}`);
    }
  });
});

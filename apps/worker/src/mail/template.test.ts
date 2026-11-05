import { AUTH_MAIL_FOOTER, PASSWORD_CHANGED_SUBJECT, authMailHtml, passwordChangedLines } from '@tp/auth-mail';
import { describe, expect, it } from 'vitest';

import { EMAIL_LOCKUP_PATH, EMAIL_PROSPECT_LOCKUP_PATH, MAIL_FOOTERS, brandedSubject, emailLockup, mailHtml } from './template';

const STATIC = 'https://static.paidwhole.example';
/** Synthetic: the support address and the change's time. */
const LINES = passwordChangedLines(new Date('2026-11-05T14:32:00Z'), 'support@paidwhole.example');

describe('the account variant (the password-changed email; sent from the follow-on pull request, docs/adr/0091)', () => {
  it('without a static host, is the user pool’s own frame exactly: the two cannot drift', () => {
    expect(mailHtml(PASSWORD_CHANGED_SUBJECT, LINES, [], null, 'account')).toBe(authMailHtml(PASSWORD_CHANGED_SUBJECT, LINES));
    expect(mailHtml('A <b> & c', ['One & <two>'], [], null, 'account')).toBe(authMailHtml('A <b> & c', ['One & <two>']));
  });

  it('carries the user pool’s footer, never the customer’s “sign in to see the details”', () => {
    expect(MAIL_FOOTERS.account).toBe(AUTH_MAIL_FOOTER);
    const html = mailHtml(PASSWORD_CHANGED_SUBJECT, LINES, [], STATIC, 'account');
    expect(html).toContain(AUTH_MAIL_FOOTER);
    expect(html).not.toContain(MAIL_FOOTERS.customer);
  });

  it('with a static host, is headed by the customer’s lockup with its tagline, unchanged, so the header baseline holds', () => {
    const html = mailHtml(PASSWORD_CHANGED_SUBJECT, LINES, [], STATIC, 'account');
    expect(emailLockup(STATIC, 'account')).toBe(emailLockup(STATIC, 'customer'));
    expect(html).toContain(emailLockup(STATIC, 'customer'));
    expect(html).toContain(new URL(EMAIL_LOCKUP_PATH, STATIC).href);
    expect(html).not.toContain(EMAIL_PROSPECT_LOCKUP_PATH);
    expect(html).not.toMatch(/<a[\s>]|href=/);
    expect(brandedSubject(PASSWORD_CHANGED_SUBJECT)).toBe('Your password was changed | PaidWhole');
  });
});

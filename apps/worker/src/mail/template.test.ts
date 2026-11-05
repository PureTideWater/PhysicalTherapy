import { palette, radius, space } from '@paidwhole/brand';
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

describe('the lockup on a fixed White plate in every variant (O-5; docs/brand/BRAND.md, section 7)', () => {
  const VARIANTS = ['customer', 'prospect', 'account'] as const;
  const white = palette.white;

  it.each(VARIANTS)('%s: the header cell holds one White table, its cell White by attribute and by style, rounded and padded from the tokens, around the full-colour art', (variant) => {
    const html = mailHtml('A subject', ['A line.'], [], STATIC, variant);
    const header = /<tr><td style="padding:([^"]*?);border-bottom:1px solid [^"]*">(<table\b.*?<\/table>)<\/td><\/tr>/.exec(html);
    expect(header, 'the header row').not.toBeNull();
    const [, cellPadding = '', inside = ''] = header ?? [];
    // The header cell's padding plus the plate's puts the art exactly where it was (20 px down, 24 px in), so a
    // client that keeps the colours shows the message as before.
    expect(cellPadding).toBe(`${String(space[2])}px ${String(space[3])}px`);
    expect(inside).toBe(
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" bgcolor="${white}" style="background-color:${white};border-radius:${String(radius.md)}px;">` +
        `<tr><td bgcolor="${white}" style="padding:${String(space[3])}px;background-color:${white};border-radius:${String(radius.md)}px;">${emailLockup(STATIC, variant)}</td></tr></table>`,
    );
    expect(space[2] + space[3]).toBe(20);
    expect(space[3] + space[3]).toBe(24);
  });

  it.each(VARIANTS)('%s: the art is the full-colour lockup at an explicit 160 px, on a White ground of its own, so a client that inverts the cell still shows it legibly', (variant) => {
    const image = emailLockup(STATIC, variant);
    expect(image).toMatch(/^<img src="[^"]+" width="160" height="\d+" alt="PaidWhole" style="[^"]*"/);
    expect(image).toContain('width:160px;');
    expect(image).toContain(`background-color:${white};`);
    expect(image).not.toMatch(/reversed|white\.png|mono/);
    expect(image).toContain(new URL(variant === 'prospect' ? EMAIL_PROSPECT_LOCKUP_PATH : EMAIL_LOCKUP_PATH, STATIC).href);
  });

  it('draws no plate and no art without a static host: the frame is the user pool’s own', () => {
    for (const variant of VARIANTS) {
      const html = mailHtml('A subject', ['A line.'], [], null, variant);
      expect(html).not.toContain('bgcolor=');
      expect(html).not.toMatch(/<img\b/);
    }
  });
});

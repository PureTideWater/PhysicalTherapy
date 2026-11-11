import { readFileSync } from 'node:fs';
import path from 'node:path';

import { brandName, palette } from '@paidwhole/brand';
import { describe, expect, it } from 'vitest';

import {
  AUTH_MAIL_FOOTER,
  COGNITO_LIMITS,
  COGNITO_MESSAGES,
  COGNITO_MESSAGE_SOURCES,
  type CognitoMessageSource,
  FALLBACK_CODE,
  INVITATION_DAYS,
  PASSWORD_CHANGED_SUBJECT,
  RESET_STEP_MINUTES,
  SIGN_IN_CODE_MINUTES,
  authMailHtml,
  cognitoMessage,
  fallbackCodeMessage,
  fallbackInvitationMessage,
  passwordChangedLines,
  utcMinute,
} from './index';

const repository = path.resolve(import.meta.dirname, '../../..');

/** Synthetic values only. */
const SAMPLE = { code: '012345', username: 'someone@clinic.synthetic.test', signInUrl: 'https://app.paidwhole.example/sign-in' } as const;
/** Cognito's own placeholders, which it fills in after the trigger returns. */
const PLACEHOLDERS = { code: '{####}', username: '{username}', signInUrl: 'https://app.paidwhole.example/sign-in' } as const;

/** What a plain-text reader of the HTML sees: the body only, inline spans joined, block tags as spaces, entities read. */
function readable(html: string): string {
  return html
    .replace(/<head>.*<\/head>/s, '')
    .replace(/<\/?span[^>]*>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

const normalized = (text: string) => text.replace(/\s+/g, ' ').trim();
const occurrences = (text: string, part: string) => text.split(part).length - 1;

/** Every message the user pool can send, by the name its render is kept under. */
const RENDERS: readonly [string, CognitoMessageSource][] = [
  ['forgot-password', 'CustomMessage_ForgotPassword'],
  ['invitation', 'CustomMessage_AdminCreateUser'],
  ['new-address', 'CustomMessage_UpdateUserAttribute'],
  ['confirm-address', 'CustomMessage_VerifyUserAttribute'],
  ['confirm-account', 'CustomMessage_SignUp'],
  ['sign-in-code', 'CustomMessage_Authentication'],
];

describe('every message the user pool sends (SGN-13)', () => {
  it('has words for every CustomMessage source Cognito names, and no other', () => {
    expect([...COGNITO_MESSAGE_SOURCES].sort()).toEqual([
      'CustomMessage_AdminCreateUser',
      'CustomMessage_Authentication',
      'CustomMessage_ForgotPassword',
      'CustomMessage_ResendCode',
      'CustomMessage_SignUp',
      'CustomMessage_UpdateUserAttribute',
      'CustomMessage_VerifyUserAttribute',
    ]);
    expect(Object.keys(COGNITO_MESSAGES).sort()).toEqual([...COGNITO_MESSAGE_SOURCES].sort());
  });

  it.each(COGNITO_MESSAGE_SOURCES)('%s holds the code once (the invitation its username and sign-in address once too), in its own subject', (source) => {
    const message = cognitoMessage(source, PLACEHOLDERS);
    const invitation = source === 'CustomMessage_AdminCreateUser';
    expect(occurrences(message.html, '{####}')).toBe(1);
    expect(occurrences(message.text, '{####}')).toBe(1);
    expect(occurrences(message.html, '{username}')).toBe(invitation ? 1 : 0);
    expect(occurrences(message.html, PLACEHOLDERS.signInUrl)).toBe(invitation ? 1 : 0);
    expect(message.subject).toMatch(new RegExp(`^Your ${brandName} `));
    expect(message.subject.length).toBeGreaterThan(0);
    expect(message.subject.length).toBeLessThanOrEqual(COGNITO_LIMITS.subject);
  });

  it.each(COGNITO_MESSAGE_SOURCES)('%s stays within Cognito’s message length, with its placeholders and with values filled in', (source) => {
    for (const values of [PLACEHOLDERS, SAMPLE]) {
      const { html } = cognitoMessage(source, values);
      expect(html.length).toBeGreaterThanOrEqual(COGNITO_LIMITS.messageMin);
      expect(html.length).toBeLessThanOrEqual(COGNITO_LIMITS.message);
    }
    expect(COGNITO_LIMITS).toEqual({ subject: 140, messageMin: 6, message: 20_000 });
  });

  it.each(COGNITO_MESSAGE_SOURCES)('%s reads the same with its tags stripped as its text, footer included', (source) => {
    const message = cognitoMessage(source, SAMPLE);
    expect(readable(message.html)).toBe(normalized(message.text));
    expect(message.text.endsWith(`\n\n${AUTH_MAIL_FOOTER}`)).toBe(true);
    expect(message.html).toContain(`<title>${message.subject}</title>`);
  });

  it.each(COGNITO_MESSAGE_SOURCES)('%s holds no image, font, stylesheet, script or link, and no address but the invitation’s plain sign-in page', (source) => {
    const { html, text } = cognitoMessage(source, SAMPLE);
    for (const remote of [/<img/i, /<link/i, /<script/i, /<style/i, /url\(/i, /@import/i, /\bsrc=/i, /\bhref=/i, /<a[\s>]/i, /@font-face/i]) {
      expect(html).not.toMatch(remote);
    }
    const urls = [...`${html} ${text}`.matchAll(/https?:\/\/[^\s<"]*/g)].map((match) => match[0]);
    if (source === 'CustomMessage_AdminCreateUser') {
      expect(new Set(urls)).toEqual(new Set([SAMPLE.signInUrl]));
    } else {
      expect(urls).toEqual([]);
    }
    expect(urls.join(' ')).not.toMatch(/[?#]/);
  });

  it('sets every code in the mono face, whole, in its sentence; the temporary password alone on its line', () => {
    for (const source of COGNITO_MESSAGE_SOURCES) {
      expect(cognitoMessage(source, SAMPLE).html).toMatch(/<span style="font-family:'IBM Plex Mono'[^"]*white-space:nowrap;">012345<\/span>/);
    }
    expect(cognitoMessage('CustomMessage_AdminCreateUser', SAMPLE).html).toMatch(/<p style="margin:0 0 12px 0;"><span style="font-family:'IBM Plex Mono'[^"]*">012345<\/span><\/p>/);
    expect(cognitoMessage('CustomMessage_AdminCreateUser', SAMPLE).text).toContain('\n\n012345\n\n');
  });

  it('escapes every value it is given, so a symbol in a temporary password cannot open markup', () => {
    const { html, text } = cognitoMessage('CustomMessage_AdminCreateUser', { code: 'Q<b>&x"\'', username: 'a&b@clinic.synthetic.test', signInUrl: SAMPLE.signInUrl });
    expect(html).toContain('Q&lt;b&gt;&amp;x&quot;&#39;');
    expect(html).toContain('a&amp;b@clinic.synthetic.test');
    expect(html).not.toContain('<b>');
    expect(text).toContain('Q<b>&x"\'');
  });

  it('uses the brand’s colors from its tokens, on White, with the footer in Slate', () => {
    const { html } = cognitoMessage('CustomMessage_ForgotPassword', SAMPLE);
    expect(html).toContain(`background-color:${palette.white}`);
    expect(html).toContain(`color:${palette.ink}`);
    expect(html).toContain(`border:1px solid ${palette.line}`);
    expect(html).toContain(`color:${palette.slate};">${AUTH_MAIL_FOOTER}</td>`);
    expect(AUTH_MAIL_FOOTER).toBe(`${brandName} never asks you to send your password or a code to anyone, by email, phone or chat: enter a code only on the ${brandName} page that asked for it.`);
  });
});

describe('the words of each message', () => {
  it('the reset code’s are section 2.5’s, word for word (UXR-04), with O-8’s newest-code sentence after the 15 minutes', () => {
    const { subject, text } = cognitoMessage('CustomMessage_ForgotPassword', PLACEHOLDERS);
    expect(subject).toBe('Your PaidWhole code');
    expect(normalized(text.replace(AUTH_MAIL_FOOTER, ''))).toBe(
      'Your code to choose a new PaidWhole password is {####}. Enter it on the page that sent it within 15 minutes. If you asked more than once, use the newest code. If you did not ask for it, ignore this email: your password is unchanged.',
    );
  });

  it('the reset code says to use the newest code (O-8), once in the HTML and once in the text, after the 15 minutes, within Cognito’s length', () => {
    const NEWEST = 'If you asked more than once, use the newest code.';
    for (const values of [PLACEHOLDERS, SAMPLE]) {
      const { html, text } = cognitoMessage('CustomMessage_ForgotPassword', values);
      expect(occurrences(text, NEWEST)).toBe(1);
      expect(occurrences(html, NEWEST)).toBe(1);
      expect(text).toContain(`within 15 minutes. ${NEWEST} If you did not ask for it`);
      expect(html).toContain(`within 15 minutes. ${NEWEST} If you did not ask for it`);
      expect(readable(html)).toBe(normalized(text));
      expect(html.length).toBeLessThanOrEqual(COGNITO_LIMITS.message);
    }
    // Not verified (no user pool in this lane), so never written: that a new request voids the earlier code.
    expect(cognitoMessage('CustomMessage_ForgotPassword', PLACEHOLDERS).text).not.toMatch(/replaces|no longer works|stops working|invalid/i);
    // The other code messages are unchanged: only a reset is asked for more than once from the page.
    for (const source of COGNITO_MESSAGE_SOURCES.filter((name) => name !== 'CustomMessage_ForgotPassword')) {
      expect(cognitoMessage(source, PLACEHOLDERS).text, source).not.toContain(NEWEST);
    }
    expect(fallbackCodeMessage().text).not.toContain(NEWEST);
  });

  it('the invitation names Cognito’s {username} without saying what it is, signs in with the address the email came to, the temporary password, the plain sign-in page and its 7 days, and an authenticator', () => {
    const { subject, text } = cognitoMessage('CustomMessage_AdminCreateUser', PLACEHOLDERS);
    expect(subject).toBe('Your PaidWhole invitation');
    expect(text).toBe(
      [
        'You are invited to PaidWhole. Your account is {username}. Sign in with the address this email came to and this temporary password:',
        '{####}',
        'Sign in at https://app.paidwhole.example/sign-in within 7 days. You then choose your own password and set up an authenticator app.',
        'If you did not expect this invitation, ignore this email: it ends after 7 days.',
        AUTH_MAIL_FOOTER,
      ].join('\n\n'),
    );
  });

  it('the attribute, sign-up, resend and sign-in code messages', () => {
    const body = (source: CognitoMessageSource) => normalized(cognitoMessage(source, PLACEHOLDERS).text.replace(AUTH_MAIL_FOOTER, ''));
    expect(body('CustomMessage_UpdateUserAttribute')).toBe(
      'Your code to confirm this new email address for your PaidWhole account is {####}. Enter it on the page that sent it. If you did not ask for it, ignore this email: the address stays unconfirmed.',
    );
    expect(body('CustomMessage_VerifyUserAttribute')).toBe(
      'Your code to confirm this email address for your PaidWhole account is {####}. Enter it on the page that sent it. If you did not ask for it, ignore this email: nothing on your account changes.',
    );
    for (const source of ['CustomMessage_SignUp', 'CustomMessage_ResendCode'] as const) {
      expect(body(source)).toBe('Your code to confirm your PaidWhole account is {####}. Enter it on the page that sent it. If you did not ask for it, ignore this email: nothing on your account changes.');
    }
    expect(cognitoMessage('CustomMessage_Authentication', PLACEHOLDERS).subject).toBe('Your PaidWhole sign-in code');
    expect(body('CustomMessage_Authentication')).toBe(
      'Your PaidWhole sign-in code is {####}. Enter it on the page that sent it within 3 minutes. If you are not signing in, someone may know your password: choose a new one with “Forgot your password?” on the sign-in page.',
    );
    for (const source of COGNITO_MESSAGE_SOURCES.filter((name) => name !== 'CustomMessage_AdminCreateUser' && name !== 'CustomMessage_Authentication')) {
      expect(cognitoMessage(source, PLACEHOLDERS).subject, source).toBe('Your PaidWhole code');
    }
  });

  it('states the numbers the pool and the page keep: 7 days (identity.ts), 15 minutes (the reset step) and 3 minutes (the sign-in session)', () => {
    expect([INVITATION_DAYS, RESET_STEP_MINUTES, SIGN_IN_CODE_MINUTES]).toEqual([7, 15, 3]);
    const identity = readFileSync(path.join(repository, 'infra/lib/constructs/identity.ts'), 'utf8');
    expect(identity).toContain(`export const INVITATION_DAYS = ${String(INVITATION_DAYS)};`);
    expect(identity).toContain(`authSession: Duration.minutes(${String(SIGN_IN_CODE_MINUTES)}),`);
    const steps = readFileSync(path.join(repository, 'apps/web/src/lib/auth/step-limits.ts'), 'utf8');
    expect(steps).toContain(`export const RESET_COOKIE_SECONDS = ${String(RESET_STEP_MINUTES)} * 60;`);
  });

  it('the pool’s own templates are the generic fallback: never the reset’s words, since every code source shares the verification template', () => {
    const code = fallbackCodeMessage();
    expect(code.subject).toBe('Your PaidWhole code');
    expect(normalized(code.text.replace(AUTH_MAIL_FOOTER, ''))).toBe('Your PaidWhole code is {####}. Enter it on the page that sent it. If you did not ask for it, ignore this email: nothing on your account changes.');
    expect(code.text.replace(AUTH_MAIL_FOOTER, '')).not.toMatch(/password|reset|sign-in|sign in|address/i);
    expect(occurrences(code.html, '{####}')).toBe(1);
    expect(FALLBACK_CODE.paragraphs.flat().filter((part) => typeof part !== 'string')).toEqual([{ slot: 'code' }]);
    const invitation = fallbackInvitationMessage(PLACEHOLDERS.signInUrl);
    expect(invitation).toEqual(cognitoMessage('CustomMessage_AdminCreateUser', PLACEHOLDERS));
  });
});

describe('the password-changed email (sent by the worker’s password_notices job, ADR 0091)', () => {
  /** Synthetic: the change's time and the support address. */
  const CHANGED = new Date('2026-11-05T14:32:00Z');
  const SUPPORT = 'support@paidwhole.example';

  it('says when, as every screen writes a time (format.ts utc()), that every session ended and an enrolled account’s second factor still holds, to ignore it if the change was the reader’s own, and two routes if it was not, with no link', () => {
    expect(utcMinute(new Date('2026-11-05T14:32:59.999Z'))).toBe('2026-11-05 14:32 UTC');
    expect(utcMinute(new Date('2027-01-09T03:04:00Z'))).toBe('2027-01-09 03:04 UTC');
    expect(PASSWORD_CHANGED_SUBJECT).toBe('Your password was changed');
    const lines = passwordChangedLines(CHANGED, SUPPORT, true);
    expect(lines).toEqual([
      'The password for your PaidWhole account was changed at 2026-11-05 14:32 UTC, with a code sent to this address.',
      'Every session of this account has ended. Signing in still asks for your authenticator code or hardware key.',
      'If you changed it, ignore this email.',
      'If you did not, write to support@paidwhole.example now from the address you sign in with, and tell your organization’s administrator. We will help you secure the account.',
    ]);
    expect(lines.join(' ')).not.toMatch(/https?:|www\./);
  });

  it('tells an account with no second factor only that every session ended, never that signing in still asks for one (docs/adr/0091, R3); its other three lines are the same', () => {
    const enrolled = passwordChangedLines(CHANGED, SUPPORT, true);
    const lines = passwordChangedLines(CHANGED, SUPPORT, false);
    expect(lines).toEqual([enrolled[0], 'Every session of this account has ended.', enrolled[2], enrolled[3]]);
    expect(lines.join(' ')).not.toMatch(/authenticator|hardware key|still asks/i);
  });

  it('says nothing a locked or disabled account’s reader would find untrue, and names a second route that needs no inbound mail, in the screens’ own words (docs/adr/0091, R4)', () => {
    for (const secondFactorEnrolled of [true, false]) {
      const words = passwordChangedLines(CHANGED, SUPPORT, secondFactorEnrolled).join(' ');
      // A locked account still has something to do (write to have the lock lifted), so the email never says it has not.
      expect(words).not.toMatch(/nothing more to do/i);
      // The sign-in screens' phrase (apps/web's sign-in notice), never "from this address": a forwarded mailbox is not it.
      expect(words).toContain('from the address you sign in with');
      expect(words).not.toMatch(/from this address/i);
      // The administrator can reach the support desk without the sign-in the reader may have lost.
      expect(words).toContain('tell your organization’s administrator');
    }
  });

  it('frames plain lines as the worker’s header-less frame does, every value escaped', () => {
    const html = authMailHtml('A <subject>', ['One & two', 'Three']);
    expect(html).toContain('<title>A &lt;subject&gt;</title>');
    expect(html).toContain('<p style="margin:0 0 12px 0;">One &amp; two</p><p style="margin:0 0 12px 0;">Three</p>');
    expect(readable(html)).toBe(`One & two Three ${AUTH_MAIL_FOOTER}`);
  });
});

/**
 * The HTML with each brand color written as its token's name (`{palette.ink}`): the record shows which token each
 * color is, and brand hex stays in the token files and the mail template alone (tools/brand-colors).
 */
function tokenNamed(html: string): string {
  return Object.entries(palette).reduce((text, [name, hex]) => text.replaceAll(hex, `{palette.${name}}`), html);
}

describe('the record of the exact words (each message’s HTML and text, for the review)', () => {
  it.each(RENDERS)('%s', async (name, source) => {
    const message = cognitoMessage(source, PLACEHOLDERS);
    await expect(tokenNamed(message.html)).toMatchFileSnapshot(`./__snapshots__/${name}.html`);
    await expect(`Subject: ${message.subject}\n\n${message.text}\n`).toMatchFileSnapshot(`./__snapshots__/${name}.txt`);
  });

  it('fallback-code', async () => {
    const message = fallbackCodeMessage();
    await expect(tokenNamed(message.html)).toMatchFileSnapshot('./__snapshots__/fallback-code.html');
    await expect(`Subject: ${message.subject}\n\n${message.text}\n`).toMatchFileSnapshot('./__snapshots__/fallback-code.txt');
  });

  // The password-changed email as an account with a second factor enrolled is sent it, and as one with none is.
  it.each([
    ['password-changed', true],
    ['password-changed-not-enrolled', false],
  ] as const)('%s', async (name, secondFactorEnrolled) => {
    const lines = passwordChangedLines(new Date('2026-11-05T14:32:00Z'), 'support@paidwhole.example', secondFactorEnrolled);
    await expect(tokenNamed(authMailHtml(PASSWORD_CHANGED_SUBJECT, lines))).toMatchFileSnapshot(`./__snapshots__/${name}.html`);
    await expect(`Subject: ${PASSWORD_CHANGED_SUBJECT}\n\n${[...lines, AUTH_MAIL_FOOTER].join('\n\n')}\n`).toMatchFileSnapshot(`./__snapshots__/${name}.txt`);
  });
});

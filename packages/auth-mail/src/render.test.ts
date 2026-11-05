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
  utcWords,
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
    expect(AUTH_MAIL_FOOTER).toBe(`${brandName} never asks for your password or a code by email, phone or chat.`);
  });
});

describe('the words of each message', () => {
  it('the reset code’s are section 2.5’s, word for word (UXR-04)', () => {
    const { subject, text } = cognitoMessage('CustomMessage_ForgotPassword', PLACEHOLDERS);
    expect(subject).toBe('Your PaidWhole code');
    expect(normalized(text.replace(AUTH_MAIL_FOOTER, ''))).toBe(
      'Your code to choose a new PaidWhole password is {####}. Enter it on the page that sent it within 15 minutes. If you did not ask for it, ignore this email: your password is unchanged.',
    );
  });

  it('the invitation names the address, the temporary password, the plain sign-in page and its 7 days, and an authenticator', () => {
    const { subject, text } = cognitoMessage('CustomMessage_AdminCreateUser', PLACEHOLDERS);
    expect(subject).toBe('Your PaidWhole invitation');
    expect(text).toBe(
      [
        'You are invited to PaidWhole. Sign in with this email address, {username}, and this temporary password:',
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

describe('the password-changed email (sent from the follow-on pull request, ADR 0091)', () => {
  it('says when in UTC words, that every device was signed out and the factor still holds, and the support route, with no link', () => {
    expect(utcWords(new Date('2026-11-05T14:32:59.999Z'))).toBe('November 5, 2026 at 14:32 UTC');
    expect(utcWords(new Date('2027-01-09T03:04:00Z'))).toBe('January 9, 2027 at 03:04 UTC');
    expect(PASSWORD_CHANGED_SUBJECT).toBe('Your password was changed');
    const lines = passwordChangedLines(new Date('2026-11-05T14:32:00Z'), 'support@paidwhole.example');
    expect(lines).toEqual([
      'The password for your PaidWhole account was changed on November 5, 2026 at 14:32 UTC, with a code sent to this address.',
      'Every device signed in to the account was signed out. Signing in still asks for your authenticator code or hardware key.',
      'If you changed it, there is nothing more to do.',
      'If you did not, write to support@paidwhole.example from this address now, and we will help you secure the account.',
    ]);
    expect(lines.join(' ')).not.toMatch(/https?:|www\./);
  });

  it('frames plain lines as the worker’s header-less frame does, every value escaped', () => {
    const html = authMailHtml('A <subject>', ['One & two', 'Three']);
    expect(html).toContain('<title>A &lt;subject&gt;</title>');
    expect(html).toContain('<p style="margin:0 0 12px 0;">One &amp; two</p><p style="margin:0 0 12px 0;">Three</p>');
    expect(readable(html)).toBe(`One & two Three ${AUTH_MAIL_FOOTER}`);
  });
});

describe('the record of the exact words (each message’s HTML and text, for the review)', () => {
  it.each(RENDERS)('%s', async (name, source) => {
    const message = cognitoMessage(source, PLACEHOLDERS);
    await expect(message.html).toMatchFileSnapshot(`./__snapshots__/${name}.html`);
    await expect(`Subject: ${message.subject}\n\n${message.text}\n`).toMatchFileSnapshot(`./__snapshots__/${name}.txt`);
  });

  it('fallback-code', async () => {
    const message = fallbackCodeMessage();
    await expect(message.html).toMatchFileSnapshot('./__snapshots__/fallback-code.html');
    await expect(`Subject: ${message.subject}\n\n${message.text}\n`).toMatchFileSnapshot('./__snapshots__/fallback-code.txt');
  });

  it('password-changed', async () => {
    const lines = passwordChangedLines(new Date('2026-11-05T14:32:00Z'), 'support@paidwhole.example');
    await expect(authMailHtml(PASSWORD_CHANGED_SUBJECT, lines)).toMatchFileSnapshot('./__snapshots__/password-changed.html');
    await expect(`Subject: ${PASSWORD_CHANGED_SUBJECT}\n\n${[...lines, AUTH_MAIL_FOOTER].join('\n\n')}\n`).toMatchFileSnapshot('./__snapshots__/password-changed.txt');
  });
});

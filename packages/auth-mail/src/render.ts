import { palette } from '@paidwhole/brand';

import { AUTH_MAIL_FOOTER, COGNITO_MESSAGES, type CognitoMessageSource, FALLBACK_CODE, FALLBACK_INVITATION, type MessageWords, type Slot } from './words';

/**
 * The frame of every message the user pool sends (docs/brand/BRAND.md, sections 3 and 7): the worker's frame
 * (apps/worker/src/mail/template.ts, mailHtml with no static host) without its header, so with no remote asset at all.
 * The lockup is a remote image, and a message that goes without it never types the wordmark in its place. White ground,
 * a 560 px card with a Line border, Plex Sans at 15/22 in Ink falling back to the system sans, the footer in Slate; every
 * code in Plex Mono (falling back to the system mono), whole on one line. Text-first: each paragraph is a <p>, so the
 * HTML reads as the text does with its tags stripped. No link: the invitation names its sign-in page as plain text.
 * Email clients do not read CSS variables, so the hex comes from @paidwhole/brand's tokens.ts.
 */

/** Cognito's limits: a subject of up to 140 characters, a message of 6 to 20,000 (the CustomMessage trigger's response). */
export const COGNITO_LIMITS = { subject: 140, messageMin: 6, message: 20_000 } as const;

const SANS = "'IBM Plex Sans', -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";
const MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

const ESCAPES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Text as HTML: the five characters that could open markup or close an attribute, escaped (as the worker's escapeHtml). */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ESCAPES[character] ?? character);
}

const PARAGRAPH = '<p style="margin:0 0 12px 0;">';

/** The frame around paragraphs already set as HTML. */
function frame(subject: string, paragraphsHtml: readonly string[]): string {
  return [
    '<!doctype html>',
    `<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(subject)}</title></head>`,
    `<body style="margin:0;padding:0;background-color:${palette.white};">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${palette.white};"><tr><td align="center" style="padding:24px 12px;">`,
    `<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;background-color:${palette.white};border:1px solid ${palette.line};border-radius:6px;">`,
    `<tr><td style="padding:24px;font-family:${SANS};font-size:15px;line-height:22px;color:${palette.ink};">${paragraphsHtml.map((html) => `${PARAGRAPH}${html}</p>`).join('')}</td></tr>`,
    `<tr><td style="padding:16px 24px;border-top:1px solid ${palette.line};font-family:${SANS};font-size:12px;line-height:18px;color:${palette.slate};">${escapeHtml(AUTH_MAIL_FOOTER)}</td></tr>`,
    '</table></td></tr></table></body></html>',
  ].join('');
}

/**
 * Plain lines in the frame, each escaped: the password-changed email's body, which the worker's 'account' variant
 * renders identically with no static host (a worker test holds the two equal).
 */
export function authMailHtml(subject: string, lines: readonly string[]): string {
  return frame(subject, lines.map(escapeHtml));
}

/** The values a message is given. The username and sign-in page are needed by the invitation only. */
export interface MessageValues {
  readonly code: string;
  readonly username?: string;
  readonly signInUrl?: string;
}

export interface RenderedMessage {
  readonly subject: string;
  readonly html: string;
  /** The same words as plain text: paragraphs apart by a blank line, then the footer. */
  readonly text: string;
}

function value(values: MessageValues, slot: Slot): string {
  const given = slot === 'code' ? values.code : slot === 'username' ? values.username : values.signInUrl;
  if (given === undefined) {
    throw new Error(`the message needs its ${slot}`);
  }
  return given;
}

/** A code as the brand sets every code: Plex Mono, never broken across lines. */
function codeHtml(code: string): string {
  return `<span style="font-family:${MONO};font-size:20px;line-height:28px;font-weight:500;letter-spacing:0.08em;white-space:nowrap;">${escapeHtml(code)}</span>`;
}

/** Words with their values filled in, as HTML and as text. */
export function renderMessage(words: MessageWords, values: MessageValues): RenderedMessage {
  const html = words.paragraphs.map((paragraph) =>
    paragraph.map((part) => (typeof part === 'string' ? escapeHtml(part) : part.slot === 'code' ? codeHtml(values.code) : escapeHtml(value(values, part.slot)))).join(''),
  );
  const text = words.paragraphs.map((paragraph) => paragraph.map((part) => (typeof part === 'string' ? part : value(values, part.slot))).join(''));
  return { subject: words.subject, html: frame(words.subject, html), text: [...text, AUTH_MAIL_FOOTER].join('\n\n') };
}

/** The message a CustomMessage source sends, with its values (Cognito's placeholders in the trigger, real values in the twin). */
export function cognitoMessage(source: CognitoMessageSource, values: MessageValues): RenderedMessage {
  return renderMessage(COGNITO_MESSAGES[source], values);
}

/** The pool's verification template (the shared fallback of every code source), with Cognito's {####}. */
export function fallbackCodeMessage(): RenderedMessage {
  return renderMessage(FALLBACK_CODE, { code: '{####}' });
}

/** The pool's invitation template, with Cognito's {username} and {####} and the sign-in page given. */
export function fallbackInvitationMessage(signInUrl: string): RenderedMessage {
  return renderMessage(FALLBACK_INVITATION, { code: '{####}', username: '{username}', signInUrl });
}

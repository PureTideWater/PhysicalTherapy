import { brandName, palette } from '@paidwhole/brand';

import { escapeHtml } from '../report/escape';

/**
 * The PaidWhole email template (docs/brand/BRAND.md, sections 3 and 7): the outlined horizontal lockup with
 * its tagline in the header at 160 px wide, on White, then the message's fixed lines and its links. Email
 * clients do not read CSS variables, so the hex comes from @paidwhole/brand's tokens.ts (the one place
 * outside packages/brand/src where brand hex reaches markup).
 *
 * The lockup is the delivered outlined art, /brand/paidwhole-lockup-horizontal-tagline-1200w.png, served by the
 * application the message links into (APP_ORIGIN) and drawn at 160 px: every client renders an image, where
 * some strip an inline SVG, and the wordmark is never typed as live text in a face the reader may not have.
 * With images blocked the reader sees its alternative text, the name. The image is public brand art; its URL
 * carries no identifier.
 *
 * Links only, never PHI, exactly as the plain-text body: the HTML is built from the same lines and links
 * mailBody checks, and every value is escaped. Plex Sans falls back to the system sans.
 */

const SANS = "'IBM Plex Sans', -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";

/** The lockup's path under the application's origin (apps/web/public), and its drawn size: 1200 x 288 art at 160 px wide. */
export const EMAIL_LOCKUP_PATH = '/brand/paidwhole-lockup-horizontal-tagline-1200w.png';
export const EMAIL_LOCKUP_WIDTH = 160;
const EMAIL_LOCKUP_HEIGHT = 38;

/** The subject as sent: the message's own subject, then the product's name. */
export function brandedSubject(subject: string): string {
  return `${subject} | ${brandName}`;
}

/** The From header: the product's name as the sender, at the configured address. */
export function senderAddress(address: string): string {
  return `${brandName} <${address}>`;
}

/** The header's lockup: the outlined art from the application's origin, 160 px wide, named for a reader who does not see it. */
export function emailLockup(origin: string): string {
  const source = new URL(EMAIL_LOCKUP_PATH, origin).href;
  const width = String(EMAIL_LOCKUP_WIDTH);
  return `<img src="${escapeHtml(source)}" width="${width}" height="${String(EMAIL_LOCKUP_HEIGHT)}" alt="${brandName}" style="display:block;width:${width}px;height:auto;border:0;outline:none;text-decoration:none;font-family:${SANS};font-size:16px;font-weight:700;color:${palette.ink};">`;
}

/** The message as HTML: the branded header, the fixed lines, each link, and a footer that says it carries links only. */
export function mailHtml(subject: string, lines: readonly string[], links: readonly string[], origin: string): string {
  const paragraphs = lines.map((line) => `<p style="margin:0 0 12px 0;">${escapeHtml(line)}</p>`).join('');
  const anchors = links
    .map((link) => `<p style="margin:0 0 12px 0;"><a href="${escapeHtml(link)}" style="color:${palette.ink};text-decoration:underline;word-break:break-all;">${escapeHtml(link)}</a></p>`)
    .join('');
  return [
    '<!doctype html>',
    `<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(subject)}</title></head>`,
    `<body style="margin:0;padding:0;background-color:${palette.white};">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${palette.white};"><tr><td align="center" style="padding:24px 12px;">`,
    `<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;background-color:${palette.white};border:1px solid ${palette.line};border-radius:6px;">`,
    `<tr><td style="padding:20px 24px;border-bottom:1px solid ${palette.line};">${emailLockup(origin)}</td></tr>`,
    `<tr><td style="padding:24px;font-family:${SANS};font-size:15px;line-height:22px;color:${palette.ink};">${paragraphs}${anchors}</td></tr>`,
    `<tr><td style="padding:16px 24px;border-top:1px solid ${palette.line};font-family:${SANS};font-size:12px;line-height:18px;color:${palette.slate};">This message carries links only; sign in to see the details.</td></tr>`,
    '</table></td></tr></table></body></html>',
  ].join('');
}

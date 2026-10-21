import { brandName, palette } from '@paidwhole/brand';

import { escapeHtml } from '../report/escape';

/**
 * Who a message is for: a customer (the default; the lockup with its tagline, and a footer that says to sign in for
 * the details) or a prospect who has no account (a screening's link: the lockup without the tagline, decision D11,
 * since the tagline says owed and screening never does, and a footer that says why the message came).
 */
export type MailVariant = 'customer' | 'prospect';

/**
 * The PaidWhole email template (docs/brand/BRAND.md, sections 3 and 7): the outlined horizontal lockup with
 * its tagline in the header at 160 px wide, on White, then the message's fixed lines and its links. Email
 * clients do not read CSS variables, so the hex comes from @paidwhole/brand's tokens.ts (the one place
 * outside packages/brand/src where brand hex reaches markup).
 *
 * The lockup is the delivered outlined art, /brand/paidwhole-lockup-horizontal-tagline-1200w.png, served by the
 * CloudFront static host (STATIC_ASSET_ORIGIN; infra/lib/constructs/edge.ts, BRAND_PATH_PATTERN) and drawn at
 * 160 px: every client renders an image, where some strip an inline SVG, and the wordmark is never typed as live
 * text in a face the reader may not have. The static host answers Cross-Origin-Resource-Policy: cross-origin, so
 * a web mail client on its own origin may embed it, while the application keeps same-origin on every response
 * (reconciliation-001, D7). With no static host configured (a local build) the message goes without the art, and
 * never with the wordmark as text; with images blocked the reader sees its alternative text, the name. The image
 * is public brand art; its URL carries no identifier.
 *
 * A prospect's message (a screening's link, Change Order 001 CO-04) is headed by the lockup without the tagline,
 * /brand/paidwhole-lockup-horizontal-1200w.png (1200 x 218 art, drawn at the same 160 px), and its footer says the
 * message holds a link only and why it came: a prospect has no account to sign in to.
 *
 * Links only, never PHI, exactly as the plain-text body: the HTML is built from the same lines and links
 * mailBody checks, and every value is escaped. Plex Sans falls back to the system sans.
 */

const SANS = "'IBM Plex Sans', -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";

/** The lockup's path on the static host (apps/web/public, which the web image carries), and its drawn size: 1200 x 288 art at 160 px wide. */
export const EMAIL_LOCKUP_PATH = '/brand/paidwhole-lockup-horizontal-tagline-1200w.png';
export const EMAIL_LOCKUP_WIDTH = 160;
const EMAIL_LOCKUP_HEIGHT = 38;

/** A prospect's header: the lockup without the tagline (decision D11), 1200 x 218 art at the same 160 px wide. */
export const EMAIL_PROSPECT_LOCKUP_PATH = '/brand/paidwhole-lockup-horizontal-1200w.png';
const EMAIL_PROSPECT_LOCKUP_HEIGHT = 29;

/** The footer each reader sees: a customer signs in for the details; a prospect is told why the message came. */
export const MAIL_FOOTERS: Readonly<Record<MailVariant, string>> = {
  customer: 'This message carries links only; sign in to see the details.',
  prospect: 'This message carries a link only, and no patient information. It was sent because this address was given on the PaidWhole screening page; if that was not you, ignore it.',
};

/** The subject as sent: the message's own subject, then the product's name. */
export function brandedSubject(subject: string): string {
  return `${subject} | ${brandName}`;
}

/** The From header: the product's name as the sender, at the configured address. */
export function senderAddress(address: string): string {
  return `${brandName} <${address}>`;
}

/**
 * The header's lockup: the outlined art from the static host, 160 px wide, named for a reader who does not see it;
 * a prospect's is the lockup without the tagline.
 */
export function emailLockup(staticOrigin: string, variant: MailVariant = 'customer'): string {
  const source = variant === 'prospect' ? new URL(EMAIL_PROSPECT_LOCKUP_PATH, staticOrigin).href : new URL(EMAIL_LOCKUP_PATH, staticOrigin).href;
  const width = String(EMAIL_LOCKUP_WIDTH);
  const height = String(variant === 'prospect' ? EMAIL_PROSPECT_LOCKUP_HEIGHT : EMAIL_LOCKUP_HEIGHT);
  return `<img src="${escapeHtml(source)}" width="${width}" height="${height}" alt="${brandName}" style="display:block;width:${width}px;height:auto;border:0;outline:none;text-decoration:none;font-family:${SANS};font-size:16px;font-weight:700;color:${palette.ink};">`;
}

/**
 * The message as HTML: the branded header (when there is a static host to embed the lockup from), the fixed lines,
 * each link, and a footer that says it carries links only, each as its reader's variant has them.
 */
export function mailHtml(subject: string, lines: readonly string[], links: readonly string[], staticOrigin: string | null, variant: MailVariant = 'customer'): string {
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
    ...(staticOrigin === null ? [] : [`<tr><td style="padding:20px 24px;border-bottom:1px solid ${palette.line};">${emailLockup(staticOrigin, variant)}</td></tr>`]),
    `<tr><td style="padding:24px;font-family:${SANS};font-size:15px;line-height:22px;color:${palette.ink};">${paragraphs}${anchors}</td></tr>`,
    `<tr><td style="padding:16px 24px;border-top:1px solid ${palette.line};font-family:${SANS};font-size:12px;line-height:18px;color:${palette.slate};">${escapeHtml(MAIL_FOOTERS[variant])}</td></tr>`,
    '</table></td></tr></table></body></html>',
  ].join('');
}

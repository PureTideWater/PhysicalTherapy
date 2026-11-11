import { brandName, palette, radius, space } from '@paidwhole/brand';
import { AUTH_MAIL_FOOTER } from '@tp/auth-mail';

import { escapeHtml } from '../report/escape';

/**
 * Who a message is for: a customer (the default; the lockup with its tagline, and a footer that says to sign in for
 * the details), a prospect who has no account (a screening's link: the lockup without the tagline, decision D11,
 * since the tagline says owed and screening never does, and a footer that says why the message came), or an account
 * holder told about their own sign-in (the password-changed email, docs/adr/0091: the customer's lockup, and the user
 * pool's footer from @tp/auth-mail, so it reads as the pool's own messages do; with no static host it is that frame
 * exactly, which a test holds).
 */
export type MailVariant = 'customer' | 'prospect' | 'account';

/**
 * The PaidWhole email template (docs/brand/BRAND.md, sections 3 and 7): the outlined horizontal lockup with
 * its tagline in the header at 160 px wide, on its White plate, then the message's fixed lines and its links. Email
 * clients do not read CSS variables, so the hex comes from @paidwhole/brand's tokens.ts (the one place
 * outside packages/brand/src where brand hex reaches markup).
 *
 * The lockup is the delivered outlined art, /brand/paidwhole-lockup-horizontal-tagline-1200w.png, on its plate
 * (below), served by the CloudFront static host (STATIC_ASSET_ORIGIN; infra/lib/constructs/edge.ts,
 * BRAND_PATH_PATTERN) with the art drawn at 160 px: every client renders an image, where some strip an inline SVG,
 * and the wordmark is never typed as live text in a face the reader may not have. The static host answers
 * Cross-Origin-Resource-Policy: cross-origin, so a web mail client on its own origin may embed it, while the
 * application keeps same-origin on every response (reconciliation-001, D7). With no static host configured (a local
 * build) the message goes without the art, and never with the wordmark as text; with images blocked the reader sees
 * its alternative text, the name. The image is public brand art; its URL carries no identifier.
 *
 * A prospect's message (a screening's link, Change Order 001 CO-04) is headed by the lockup without the tagline,
 * /brand/paidwhole-lockup-horizontal-1200w.png (1200 x 218 art, drawn at the same 160 px on the same plate), and its
 * footer says the message holds a link only and why it came: a prospect has no account to sign in to.
 *
 * The lockup sits on a fixed White plate in every variant (decision O-5, Lane A's orchestrator as the brand owner's
 * delegate, 2026-11-05): White rounded behind the full-colour art, never a reversed variant. A client that forces dark
 * mode (Gmail's apps, Outlook.com and Outlook for iOS) inverts the plate with the other cells, and may rewrite an
 * image's CSS background too, but it does not change an image's pixels, and no message can detect it or depends on it
 * behaving the same way twice. So the White ground that stays legible there is in the art itself: the files named
 * below are the delivered art composited onto an opaque White plate padded space 3 with corners radius md
 * (tools/brand-email-plate, generated, never drawn by hand; review finding UX-S1), drawn 184 px wide so the art inside
 * is the same 160 px. Around it, the table plate still carries White as a bgcolor attribute (Outlook's Word renderer
 * and clients that drop styles) and as background-color, and the image carries a White background and its explicit
 * width, for the clients that keep those. In a client that keeps the colours the plate is White on White and the art
 * sits where it always has (the header cell's 8 x 12 px and the image's own 12 px make the old 20 x 24 px), so the
 * message looks as before; a client that ignores border-radius (Outlook desktop) draws the table square.
 *
 * Links only, never PHI, exactly as the plain-text body: the HTML is built from the same lines and links
 * mailBody checks, and every value is escaped. Plex Sans falls back to the system sans.
 */

const SANS = "'IBM Plex Sans', -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";

/**
 * The lockup's path on the static host (apps/web/public, which the web image carries): the 1200 x 288 art on its plate,
 * 1380 x 468, drawn 184 px wide so the art is 160 px (EMAIL_LOCKUP_WIDTH) inside the plate's space 3 on each side.
 */
export const EMAIL_LOCKUP_PATH = '/brand/paidwhole-lockup-horizontal-tagline-email-plate-1380w.png';
export const EMAIL_LOCKUP_WIDTH = 160;
export const EMAIL_PLATE_WIDTH = EMAIL_LOCKUP_WIDTH + 2 * space[3];
const EMAIL_LOCKUP_HEIGHT = 62;

/** A prospect's header: the lockup without the tagline (decision D11), 1200 x 218 art on its plate, 1380 x 398, at the same 184 px. */
export const EMAIL_PROSPECT_LOCKUP_PATH = '/brand/paidwhole-lockup-horizontal-email-plate-1380w.png';
const EMAIL_PROSPECT_LOCKUP_HEIGHT = 53;

/**
 * The footer each reader sees: a customer signs in for the details; a prospect is told why the message came; an account
 * holder reads the user pool's own sentence. Every variant's HTML ends with its footer; the account variant's text
 * alternative ends with it too (mail.ts, mailBody).
 */
export const MAIL_FOOTERS: Readonly<Record<MailVariant, string>> = {
  customer: 'This message carries links only; sign in to see the details.',
  prospect: 'This message carries a link only, and no patient information. It was sent because this address was given on the PaidWhole screening page; if that was not you, ignore it.',
  account: AUTH_MAIL_FOOTER,
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
 * The header's lockup: the outlined art on its plate from the static host, 184 px wide (the art 160 px), named for a
 * reader who does not see it; a prospect's is the lockup without the tagline.
 */
export function emailLockup(staticOrigin: string, variant: MailVariant = 'customer'): string {
  const source = variant === 'prospect' ? new URL(EMAIL_PROSPECT_LOCKUP_PATH, staticOrigin).href : new URL(EMAIL_LOCKUP_PATH, staticOrigin).href;
  const width = String(EMAIL_PLATE_WIDTH);
  const height = String(variant === 'prospect' ? EMAIL_PROSPECT_LOCKUP_HEIGHT : EMAIL_LOCKUP_HEIGHT);
  return `<img src="${escapeHtml(source)}" width="${width}" height="${height}" alt="${brandName}" style="display:block;width:${width}px;height:auto;background-color:${palette.white};border:0;outline:none;text-decoration:none;font-family:${SANS};font-size:16px;font-weight:700;color:${palette.ink};">`;
}

/**
 * The header: the lockup on its fixed White plate (O-5), a table so every client draws it, White by attribute and by
 * style and rounded radius md, around the image whose own pixels carry the plate's space 3 padding, in a cell padded
 * space 2 by space 3 above the header's rule.
 */
export function emailHeader(staticOrigin: string, variant: MailVariant = 'customer'): string {
  const plate = `bgcolor="${palette.white}" style="background-color:${palette.white};border-radius:${String(radius.md)}px;"`;
  return [
    `<tr><td style="padding:${String(space[2])}px ${String(space[3])}px;border-bottom:1px solid ${palette.line};">`,
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" ${plate}>`,
    `<tr><td bgcolor="${palette.white}" style="padding:0;background-color:${palette.white};border-radius:${String(radius.md)}px;">${emailLockup(staticOrigin, variant)}</td></tr></table>`,
    '</td></tr>',
  ].join('');
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
    ...(staticOrigin === null ? [] : [emailHeader(staticOrigin, variant)]),
    `<tr><td style="padding:24px;font-family:${SANS};font-size:15px;line-height:22px;color:${palette.ink};">${paragraphs}${anchors}</td></tr>`,
    `<tr><td style="padding:16px 24px;border-top:1px solid ${palette.line};font-family:${SANS};font-size:12px;line-height:18px;color:${palette.slate};">${escapeHtml(MAIL_FOOTERS[variant])}</td></tr>`,
    '</table></td></tr></table></body></html>',
  ].join('');
}

import { brandName, markSvg, palette, tagline } from '@paidwhole/brand';

import { escapeHtml } from '../report/escape';

/**
 * The PaidWhole email template (docs/brand/BRAND.md, section 7): the mark from markSvg() with its hex
 * fills taken from @paidwhole/brand's tokens.ts (email clients do not read CSS variables, so this is the
 * one place outside packages/brand/src where brand hex reaches markup), the name beside it, then the
 * message's fixed lines and its links. Links only, never PHI, exactly as the plain-text body: the HTML is
 * built from the same lines and links mailBody checks, and every value is escaped. Plex Sans falls back to
 * the system sans; nothing is loaded from anywhere.
 */

const SANS = "'IBM Plex Sans', -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";
const DISPLAY = "'Schibsted Grotesk', 'IBM Plex Sans', -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";

/** The subject as sent: the message's own subject, then the product's name. */
export function brandedSubject(subject: string): string {
  return `${subject} | ${brandName}`;
}

/** The From header: the product's name as the sender, at the configured address. */
export function senderAddress(address: string): string {
  return `${brandName} <${address}>`;
}

/** The mark for the email header: markSvg with hex fills from tokens.ts, beside the visible name so hidden from screen readers. */
export function emailMark(): string {
  return markSvg({ size: 24, fills: { ring: palette.ink, keystone: palette.brass } });
}

/** The message as HTML: the branded header, the fixed lines, each link, and the tagline in the footer. */
export function mailHtml(subject: string, lines: readonly string[], links: readonly string[]): string {
  const paragraphs = lines.map((line) => `<p style="margin:0 0 12px 0;">${escapeHtml(line)}</p>`).join('');
  const anchors = links
    .map((link) => `<p style="margin:0 0 12px 0;"><a href="${escapeHtml(link)}" style="color:${palette.ink};text-decoration:underline;word-break:break-all;">${escapeHtml(link)}</a></p>`)
    .join('');
  return [
    '<!doctype html>',
    `<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(subject)}</title></head>`,
    `<body style="margin:0;padding:0;background-color:${palette.paper};">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${palette.paper};"><tr><td align="center" style="padding:24px 12px;">`,
    `<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;background-color:${palette.white};border:1px solid ${palette.line};border-radius:6px;">`,
    `<tr><td style="padding:20px 24px;border-bottom:1px solid ${palette.line};">`,
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>',
    `<td aria-hidden="true" style="vertical-align:middle;padding-right:8px;line-height:0;">${emailMark()}</td>`,
    `<td style="vertical-align:middle;font-family:${DISPLAY};font-weight:700;font-size:20px;line-height:24px;letter-spacing:-0.03em;color:${palette.ink};">${brandName}</td>`,
    '</tr></table></td></tr>',
    `<tr><td style="padding:24px;font-family:${SANS};font-size:15px;line-height:22px;color:${palette.ink};">${paragraphs}${anchors}</td></tr>`,
    `<tr><td style="padding:16px 24px;border-top:1px solid ${palette.line};font-family:${SANS};font-size:12px;line-height:18px;color:${palette.slate};">${escapeHtml(tagline)} This message carries links only; sign in to see the details.</td></tr>`,
    '</table></td></tr></table></body></html>',
  ].join('');
}

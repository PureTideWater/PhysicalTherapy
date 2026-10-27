/**
 * Who a free screening's rate limit counts (Change Order 001, CO-04: "rate-limited by email domain and IP";
 * reconciliation-001 D21 a): the email's domain for a business address, so one practice's colleagues share a day's
 * screenings, and the mailbox for a listed free-mail domain, so every gmail.com prospect does not share one count.
 * The client's address is counted beside it (src/lib/http/rate-limit.ts, the screening bucket). Subjects are stored
 * only as the rate limiter's keyed hash, never in clear.
 *
 * A mailbox is counted once however its address is spelled, by the rule the screening's refusal list keys it by
 * (canonicalMailbox(), @tp/db; mail_recipient_canonical() in SQL): NFKC, ASCII white space and case, a domain's
 * trailing dots, googlemail.com read as gmail.com, a "+tag" dropped, and at gmail.com the local part's dots dropped
 * (Gmail delivers every one of those spellings to one inbox). The address stored and mailed to is the one typed; only
 * the count's key is canonical.
 */

import { canonicalMailbox, canonicalMailboxParts } from '@tp/db/runtime';

/**
 * Free-mail domains, where one domain is many unrelated people: the large webmail services and the mail of the
 * large United States internet providers that small practices use, with a few of their national variants. A
 * subdomain of one (nc.rr.com) counts as it does.
 */
export const FREE_MAIL_DOMAINS: ReadonlySet<string> = new Set([
  // Webmail
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.co.uk',
  'yahoo.ca',
  'ymail.com',
  'rocketmail.com',
  'outlook.com',
  'hotmail.com',
  'hotmail.co.uk',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'aim.com',
  'proton.me',
  'protonmail.com',
  'protonmail.ch',
  'pm.me',
  'gmx.com',
  'gmx.net',
  'gmx.us',
  'mail.com',
  'zoho.com',
  'zohomail.com',
  'yandex.com',
  'fastmail.com',
  'fastmail.fm',
  'hushmail.com',
  'tutanota.com',
  'tuta.io',
  'juno.com',
  'netzero.net',
  'netzero.com',
  // United States internet providers
  'comcast.net',
  'xfinity.com',
  'att.net',
  'sbcglobal.net',
  'bellsouth.net',
  'pacbell.net',
  'ameritech.net',
  'swbell.net',
  'flash.net',
  'prodigy.net',
  'verizon.net',
  'cox.net',
  'charter.net',
  'spectrum.net',
  'rr.com',
  'roadrunner.com',
  'twc.com',
  'earthlink.net',
  'mindspring.com',
  'optonline.net',
  'optimum.net',
  'frontier.com',
  'frontiernet.net',
  'windstream.net',
  'centurylink.net',
  'centurytel.net',
  'embarqmail.com',
  'q.com',
  'qwest.net',
  'mchsi.com',
  'suddenlink.net',
  'cableone.net',
  'wowway.com',
  'rcn.com',
  'tds.net',
  'midco.net',
  'hughes.net',
]);

/** Whether a domain is a listed free-mail domain or a subdomain of one. */
export function isFreeMailDomain(domain: string): boolean {
  const labels = domain.split('.');
  return labels.some((_, index) => FREE_MAIL_DOMAINS.has(labels.slice(index).join('.')));
}

/**
 * The account a screening counts against: 'domain:<domain>' for a business address, 'address:<mailbox>' for a
 * free-mail one (its canonical mailbox: its "+tag" dropped, and at gmail.com its dots), 'address:<as read>' for one with
 * no domain; null when none was given (the client's address still counts). An address the form refuses (one that is not
 * plain ASCII, for instance) is counted too, before it is refused, and is never mailed.
 */
export function screeningRateAccount(email: string | null | undefined): string | null {
  const given = email ?? '';
  const parts = canonicalMailboxParts(given);
  if (parts === null) {
    const read = canonicalMailbox(given);
    return read === '' ? null : `address:${read}`;
  }
  return isFreeMailDomain(parts.domain) ? `address:${parts.local}@${parts.domain}` : `domain:${parts.domain}`;
}

/**
 * Who a free screening's rate limit counts (Change Order 001, CO-04: "rate-limited by email domain and IP";
 * reconciliation-001 D21 a): the email's domain for a business address, so one practice's colleagues share a day's
 * screenings, and the whole address for a listed free-mail domain, so every gmail.com prospect does not share one
 * count. The client's address is counted beside it (src/lib/http/rate-limit.ts, the screening bucket). Subjects are
 * stored only as the rate limiter's keyed hash, never in clear.
 */

/** Free-mail domains, where one domain is many unrelated people. */
export const FREE_MAIL_DOMAINS: ReadonlySet<string> = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'ymail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'pm.me',
  'gmx.com',
  'mail.com',
  'zoho.com',
  'yandex.com',
  'fastmail.com',
  'comcast.net',
  'att.net',
  'sbcglobal.net',
  'verizon.net',
  'cox.net',
]);

/**
 * The account a screening counts against: 'domain:<domain>' for a business address, 'address:<email>' for a free-mail
 * one or an address without a domain; null when none was given (the client's address still counts).
 */
export function screeningRateAccount(email: string | null | undefined): string | null {
  const address = (email ?? '').trim().toLowerCase();
  if (address === '') {
    return null;
  }
  const at = address.lastIndexOf('@');
  const domain = at > 0 ? address.slice(at + 1) : '';
  if (domain === '' || FREE_MAIL_DOMAINS.has(domain)) {
    return `address:${address}`;
  }
  return `domain:${domain}`;
}

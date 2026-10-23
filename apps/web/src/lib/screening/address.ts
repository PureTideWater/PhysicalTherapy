import { TOP_LEVEL_DOMAINS } from './tlds';

/**
 * The screening's checks of the address a result is sent to (audit #76; docs/adr/0065, D9; the founder's rulings of
 * 2026-10-21, Q1 (g) and Q12), the parts that run in the browser and again on the server: a likely typo of a large mail
 * provider's domain ("Did you mean @gmail.com?") and a domain ending in no top-level domain in use. Both are soft: the
 * prospect may keep the address as typed. The server then asks DNS whether the domain can receive mail at all
 * (checkMailDomain, through the VPC's resolver) and SES whether the mailbox can (validation.ts), together, after the
 * upload's own checks and the rate limit.
 *
 * Every refused address, whatever refused it (DNS, SES's validation, or the database's refusal list of screening
 * addresses that bounced or were reported as spam), is answered with one sentence (ADDRESS_REFUSED), so the form says
 * nothing about any earlier screening, and nothing about a customer's mail, which the refusal list never holds.
 *
 * No log line, issue or error names the address or its domain.
 *
 * What the form says about the address (this file's sentences and the bounce budget's, SCREENING_BOUNCE_BUDGET in
 * messages.ts) is a legal surface counsel reviews before the screening opens (docs/product/legal-surfaces.md,
 * data-legal-surface="screening-mail-address").
 */

/** The one answer to every refused address (D9; Q12's wording, for counsel to confirm before the screening opens). */
export const ADDRESS_REFUSED = 'We cannot send email to this address. Check it, or use another address.';

/** SES could not say the mailbox exists (a MEDIUM verdict): the prospect may keep the address. */
export const MAILBOX_UNCONFIRMED = 'We could not confirm this mailbox exists. Check the address, or keep it as typed.';

/**
 * The hint for a likely typo of a large mail provider's domain: it names the provider's domain alone, never the address,
 * so the server's issue carries no address (the form's "Use …" button offers the whole address in the browser).
 */
export function suggestionMessage(providerDomain: string): string {
  return `Did you mean @${providerDomain}? Check the address, or keep it as typed.`;
}

/** The hint for an ending one edit from a common one (practice.con for practice.com): it names the two endings alone. */
export function endingSuggestionMessage(ending: string, suggested: string): string {
  return `This address ends in “.${ending}”. Did you mean “.${suggested}”? Check it, or keep it as typed.`;
}

/** The warning for a domain that ends in no top-level domain in use. */
export function unknownEndingMessage(ending: string): string {
  return `This address ends in “.${ending}”, which is not a domain ending in use. Check it, or keep it as typed.`;
}

/** The label of the box that keeps an address the form questioned. */
export const KEEP_ADDRESS_LABEL = 'Keep this address as typed';

/** Whether a message the server gave the email field is one the prospect may answer by keeping the address. */
export function isSoftAddressMessage(message: string): boolean {
  return (
    message === MAILBOX_UNCONFIRMED ||
    /^Did you mean @[a-z0-9.-]+\? Check the address, or keep it as typed\.$/.test(message) ||
    /^This address ends in “\.[a-z0-9-]+”\. Did you mean “\.[a-z0-9-]+”\? Check it, or keep it as typed\.$/.test(message) ||
    /^This address ends in “\.[a-z0-9-]+”, which is not a domain ending in use\. Check it, or keep it as typed\.$/.test(message)
  );
}

/**
 * The large mail providers whose domains are mistyped most (gmail.com typed gmial.com): an address at a domain close to
 * one of these, and not one of them, gets the hint. The free-mail list the rate limit counts (rate.ts) holds more; these
 * are the ones people at small practices use, and ones whose near neighbours are rarely real domains.
 */
export const MAIL_PROVIDER_DOMAINS: readonly string[] = [
  'gmail.com',
  'yahoo.com',
  'outlook.com',
  'hotmail.com',
  'icloud.com',
  'aol.com',
  'comcast.net',
  'msn.com',
  'live.com',
  'att.net',
  'verizon.net',
  'me.com',
  'mac.com',
  'ymail.com',
  'googlemail.com',
  'sbcglobal.net',
  'bellsouth.net',
  'charter.net',
  'cox.net',
  'earthlink.net',
  'optonline.net',
  'protonmail.com',
  'proton.me',
  'mail.com',
  'gmx.com',
  'zoho.com',
  'yahoo.co.uk',
];

/**
 * The special-use names (RFC 2606, RFC 6761) no snapshot lists: never questioned as an ending, since the DNS check
 * already refuses each (they never resolve publicly), and development's synthetic addresses use them.
 */
const SPECIAL_USE_ENDINGS: ReadonlySet<string> = new Set(['test', 'example', 'invalid', 'localhost']);

/** Endings a mistyped one is most often meant to be (practice.con for practice.com). */
const COMMON_ENDINGS: readonly string[] = ['com', 'net', 'org', 'us', 'edu', 'gov', 'biz', 'info', 'health', 'care'];

/**
 * The optimal-string-alignment distance between two strings (insertions, deletions, substitutions and swaps of
 * neighbours, each one), or `limit + 1` once it is sure to exceed `limit`.
 */
export function editDistance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) {
    return limit + 1;
  }
  let previous2: number[] = [];
  let previous: number[] = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current: number[] = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min((previous[j] ?? 0) + 1, (current[j - 1] ?? 0) + 1, (previous[j - 1] ?? 0) + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, (previous2[j - 2] ?? 0) + 1);
      }
      current.push(value);
      rowMin = Math.min(rowMin, value);
    }
    if (rowMin > limit) {
      return limit + 1;
    }
    previous2 = previous;
    previous = current;
  }
  return previous[b.length] ?? limit + 1;
}

/** What the browser and the server say about an address before anything is sent: a suggestion, or an ending not in use. */
export interface AddressHint {
  /** The address the prospect probably meant, or null. */
  readonly suggestion: string | null;
  /** The domain's ending when it is no top-level domain in use, or null. */
  readonly unknownEnding: string | null;
  /** The message the form shows, or null when there is nothing to say. */
  readonly message: string | null;
}

const NO_HINT: AddressHint = { suggestion: null, unknownEnding: null, message: null };

/**
 * The hint for an address (lower-cased and trimmed by the caller, or not): a provider's domain within one edit (two for
 * a domain of eight or more characters) and not on the list suggests that provider; otherwise a domain whose ending is no
 * top-level domain in use warns, suggesting a common ending one edit away when there is one.
 */
export function addressHint(address: string): AddressHint {
  const typed = address.trim().toLowerCase();
  const at = typed.lastIndexOf('@');
  if (at < 1 || at === typed.length - 1) {
    return NO_HINT;
  }
  const local = typed.slice(0, at);
  const domain = typed.slice(at + 1).replace(/\.+$/, '');
  if (MAIL_PROVIDER_DOMAINS.includes(domain)) {
    return NO_HINT;
  }
  const limit = domain.length >= 8 ? 2 : 1;
  let best: { readonly domain: string; readonly distance: number } | null = null;
  for (const provider of MAIL_PROVIDER_DOMAINS) {
    const distance = editDistance(domain, provider, limit);
    if (distance <= limit && (best === null || distance < best.distance)) {
      best = { domain: provider, distance };
    }
  }
  if (best !== null) {
    const suggestion = `${local}@${best.domain}`;
    return { suggestion, unknownEnding: null, message: suggestionMessage(best.domain) };
  }
  const dot = domain.lastIndexOf('.');
  const ending = dot < 0 ? domain : domain.slice(dot + 1);
  if (ending === '' || TOP_LEVEL_DOMAINS.has(ending) || SPECIAL_USE_ENDINGS.has(ending)) {
    return NO_HINT;
  }
  const near = COMMON_ENDINGS.find((candidate) => editDistance(ending, candidate, 1) <= 1);
  if (near !== undefined && dot > 0) {
    const suggestion = `${local}@${domain.slice(0, dot)}.${near}`;
    return { suggestion, unknownEnding: ending, message: endingSuggestionMessage(ending, near) };
  }
  return { suggestion: null, unknownEnding: ending, message: unknownEndingMessage(ending) };
}

// ---------------------------------------------------------------------------------------------------
// DNS, on the server

/** An MX record as node:dns gives it; RFC 7505's null MX is one record with an empty exchange. */
export interface MxRecord {
  readonly exchange: string;
  readonly priority: number;
}

/** The lookups the DNS check makes (node:dns/promises' Resolver on the server; a stand-in in tests and development). */
export interface DomainResolver {
  resolveMx(domain: string): Promise<readonly MxRecord[]>;
  resolve4(domain: string): Promise<readonly string[]>;
  resolve6(domain: string): Promise<readonly string[]>;
}

/** What the DNS check says: the domain can receive mail, cannot, or the resolver could not answer in time. */
export type DomainVerdict = 'accept' | 'refuse' | 'unavailable';

/** How long the DNS check may take at most, all lookups together (G1: the added worst case is one 2-second timeout). */
export const DOMAIN_CHECK_TIMEOUT_MS = 2_000;

/** The resolver's answers that say the name has no such record, or does not exist (node:dns's codes). */
const NO_RECORD = new Set(['ENODATA', 'ENOTFOUND']);

function codeOf(error: unknown): string | null {
  return typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' ? error.code : null;
}

async function lookup<T>(work: () => Promise<readonly T[]>): Promise<readonly T[] | 'none'> {
  try {
    const answers = await work();
    return answers.length === 0 ? 'none' : answers;
  } catch (error) {
    if (NO_RECORD.has(codeOf(error) ?? '')) {
      return 'none';
    }
    throw error;
  }
}

/**
 * Whether a domain can receive mail (D9 step 2): a domain that does not exist, one whose only MX is RFC 7505's null MX,
 * or one with no MX and no address at all is refused; an MX, or failing one an A or AAAA record, accepts. A lookup that
 * times out or fails otherwise (SERVFAIL) is `unavailable`, which the caller accepts. The whole check takes at most
 * DOMAIN_CHECK_TIMEOUT_MS.
 */
export async function checkMailDomain(resolver: DomainResolver, domain: string, timeoutMs: number = DOMAIN_CHECK_TIMEOUT_MS): Promise<DomainVerdict> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<DomainVerdict>((resolve) => {
    timer = setTimeout(() => resolve('unavailable'), timeoutMs);
  });
  const check = (async (): Promise<DomainVerdict> => {
    try {
      const mx = await lookup(() => resolver.resolveMx(domain));
      if (mx !== 'none') {
        // A null MX says the domain accepts no mail; any other exchange may.
        return mx.every((record) => record.exchange === '' || record.exchange === '.') ? 'refuse' : 'accept';
      }
      // No MX: mail goes to the domain's own address (RFC 5321, 5.1), when it has one.
      const [v4, v6] = await Promise.all([lookup(() => resolver.resolve4(domain)), lookup(() => resolver.resolve6(domain))]);
      return v4 === 'none' && v6 === 'none' ? 'refuse' : 'accept';
    } catch {
      return 'unavailable';
    }
  })();
  try {
    return await Promise.race([check, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The resolver development and the end-to-end suite use, which asks no DNS server: a domain under `.invalid` (RFC 2606,
 * reserved never to resolve) does not exist, and every other domain has an MX.
 */
export const LOCAL_DOMAIN_RESOLVER: DomainResolver = {
  resolveMx: (domain) => (domain === 'invalid' || domain.endsWith('.invalid') ? Promise.reject(Object.assign(new Error('not found'), { code: 'ENOTFOUND' })) : Promise.resolve([{ exchange: `mx.${domain}`, priority: 10 }])),
  resolve4: () => Promise.resolve([]),
  resolve6: () => Promise.resolve([]),
};

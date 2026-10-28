/**
 * The mailbox an address reaches (audit #76; docs/adr/0065; review S2): one spelling for the spellings that reach the
 * same inbox, so the screening's refusal list (mail_recipient_sha256()) and its bounce budget's account (the web's
 * screeningRateAccount()) read every one of them as one mailbox. It is used only to look an address up and to count it,
 * never to send: the address mailed is the one typed. mail_recipient_canonical() in migration 20261107090000 is the same
 * rule in SQL, and mail.db.test.ts holds the two equal on a table of spellings and on every Unicode code point.
 *
 * In order:
 * 1. ASCII white space dropped at either end.
 * 2. ASCII letters in lower case: the rule every mail provider applies to an ASCII address, and no locale's rule for
 *    other letters.
 * 3. An address with any character outside ASCII stands as read: the screening's form takes only ASCII, and no Unicode
 *    table, whose version moves with Node and with the database server, decides a key (the review of 2026-10-27:
 *    Node's NFKC and PostgreSQL's differed on U+A7F1).
 * 4. Split at the last @. An address with no local part or no domain stands as read so far.
 * 5. The domain's trailing dots dropped; googlemail.com read as gmail.com, and me.com and mac.com as icloud.com (each
 *    provider's names for one account's mailbox, a name reserved across them).
 * 6. A sub-address dropped: everything from the first + of the local part, at every domain, unless keepTag. The +
 *    separator (RFC 5233) reaches the base mailbox at Gmail and Google Workspace, Outlook.com and Microsoft 365, Fastmail
 *    and Proton, which most practices use, so a complaint from any spelling refuses the mailbox. keepTag keeps it, as a
 *    permanent bounce is keyed (the review of 2026-10-27): a +tag spelling bounces where the server has no
 *    sub-addressing, which says nothing of the base mailbox.
 * 7. At gmail.com alone, the local part's dots dropped (Google says dots do not matter in a Gmail address, and they do
 *    in a Google Workspace one), and its sub-address dropped even with keepTag (Gmail delivers every one to the base
 *    mailbox).
 * A local part that 6 or 7 would leave empty is kept as read.
 */

/** ASCII white space at either end: space, tab, line feed, vertical tab, form feed and carriage return. */
const EDGE_SPACE = /^[ \t\n\v\f\r]+|[ \t\n\v\f\r]+$/g;
const ASCII_UPPER = /[A-Z]/g;
/** Any UTF-16 code unit outside ASCII (a surrogate of a character beyond the BMP included): mail_recipient_canonical()'s [^\x01-\x7F]. */
const NOT_ASCII = /[\u0080-\uffff]/;

/** Each provider's other names for one mailbox (step 5). */
const GMAIL = 'gmail.com';
const SAME_MAILBOX: Readonly<Record<string, string>> = { 'googlemail.com': GMAIL, 'me.com': 'icloud.com', 'mac.com': 'icloud.com' };

export interface MailboxOptions {
  /** Keep the sub-address (step 6), as a permanent bounce is keyed; gmail.com drops it still (step 7). */
  readonly keepTag?: boolean;
}

/** An address read through steps 1 and 2: the form every later step starts from. */
function readAddress(address: string): string {
  return address.replace(EDGE_SPACE, '').replace(ASCII_UPPER, (letter) => letter.toLowerCase());
}

/**
 * The canonical mailbox's two parts, or null for an address with a character outside ASCII (step 3), or with no local
 * part or no domain (steps 4 and 5 found none).
 */
export function canonicalMailboxParts(address: string, options: MailboxOptions = {}): { readonly local: string; readonly domain: string } | null {
  const read = readAddress(address);
  if (NOT_ASCII.test(read)) {
    return null;
  }
  const at = read.lastIndexOf('@');
  if (at <= 0) {
    return null;
  }
  const trimmed = read.slice(at + 1).replace(/\.+$/, '');
  if (trimmed === '') {
    return null;
  }
  const domain = SAME_MAILBOX[trimmed] ?? trimmed;
  const local = read.slice(0, at);
  const untagged = options.keepTag === true && domain !== GMAIL ? local : (local.split('+')[0] ?? '');
  const mailbox = domain === GMAIL ? untagged.replace(/\./g, '') : untagged;
  return { local: mailbox === '' ? local : mailbox, domain };
}

/** The canonical mailbox of an address (steps 1 to 7), or the address as read when step 3 or 4 leaves it as read. */
export function canonicalMailbox(address: string, options: MailboxOptions = {}): string {
  const parts = canonicalMailboxParts(address, options);
  return parts === null ? readAddress(address) : `${parts.local}@${parts.domain}`;
}

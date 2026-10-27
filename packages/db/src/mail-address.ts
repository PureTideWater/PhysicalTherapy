/**
 * The mailbox an address reaches (audit #76; docs/adr/0065; review S2): one spelling for the spellings that reach the
 * same inbox, so the screening's refusal list (mail_recipient_sha256()) and its bounce budget's account (the web's
 * screeningRateAccount()) read every one of them as one mailbox. It is used only to look an address up and to count it,
 * never to send: the address mailed is the one typed. mail_recipient_canonical() in migration 20261107090000 is the same
 * rule in SQL, and mail.db.test.ts holds the two equal on a table of spellings.
 *
 * In order:
 * 1. Unicode NFKC, so a compatibility form (a fullwidth letter, a no-break space) reads as what it shows; NFKC composes
 *    as NFC does, so a decomposed accent reads as the composed one.
 * 2. ASCII white space dropped at either end.
 * 3. ASCII letters in lower case: the rule every mail provider applies to an ASCII address, and no locale's rule for
 *    other letters, which the screening's form refuses anyway.
 * 4. Split at the last @. An address with no local part or no domain stands as read so far.
 * 5. The domain's trailing dots dropped, and googlemail.com read as gmail.com (Google's two names for one service).
 * 6. A sub-address dropped: everything from the first + of the local part, at every domain. The + separator (RFC 5233)
 *    reaches the base mailbox at Gmail and Google Workspace, Outlook.com and Microsoft 365, Fastmail and Proton, which
 *    most practices use, and an address at a provider without sub-addressing has no + in its own name; the rare
 *    exception is refused a screening, the safer side.
 * 7. At gmail.com alone, the local part's dots dropped: Google says dots do not matter in a Gmail address, and they do
 *    in a Google Workspace one, so no other domain loses them.
 * A local part that 6 or 7 would leave empty is kept as read.
 */

/** ASCII white space at either end: space, tab, line feed, vertical tab, form feed and carriage return. */
const EDGE_SPACE = /^[ \t\n\v\f\r]+|[ \t\n\v\f\r]+$/g;
const ASCII_UPPER = /[A-Z]/g;

/** Google's other name for gmail.com. */
const GMAIL = 'gmail.com';
const GOOGLEMAIL = 'googlemail.com';

/** An address read through steps 1 to 3: the form every later step starts from. */
function readAddress(address: string): string {
  return address
    .normalize('NFKC')
    .replace(EDGE_SPACE, '')
    .replace(ASCII_UPPER, (letter) => letter.toLowerCase());
}

/** The canonical mailbox's two parts, or null for an address with no local part or no domain (steps 4 and 5 found none). */
export function canonicalMailboxParts(address: string): { readonly local: string; readonly domain: string } | null {
  const read = readAddress(address);
  const at = read.lastIndexOf('@');
  if (at <= 0) {
    return null;
  }
  const trimmed = read.slice(at + 1).replace(/\.+$/, '');
  if (trimmed === '') {
    return null;
  }
  const domain = trimmed === GOOGLEMAIL ? GMAIL : trimmed;
  const local = read.slice(0, at);
  const untagged = local.split('+')[0] ?? '';
  const mailbox = domain === GMAIL ? untagged.replace(/\./g, '') : untagged;
  return { local: mailbox === '' ? local : mailbox, domain };
}

/** The canonical mailbox of an address (steps 1 to 7), or the address as read when it has no local part or no domain. */
export function canonicalMailbox(address: string): string {
  const parts = canonicalMailboxParts(address);
  return parts === null ? readAddress(address) : `${parts.local}@${parts.domain}`;
}

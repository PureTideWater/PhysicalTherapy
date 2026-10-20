/**
 * A packet's reference (audit item #37 part 1, D5; the founder's ruling of 2026-10-20; docs/adr/0061): the short
 * code the payer's copy prints in its approval line ("Approved for submission by <practice> on <date>, reference
 * SK6CS-K6CSK.") and its file names carry, which a payer quotes back by phone or letter. It is derived from the
 * approved version's SHA-256 (approved_sha256, equal to content_sha256 by packet_version_approval_names_its_hash),
 * so it needs no storage of its own and ties the printed approval to exactly the content the approver named.
 *
 * The rule: the hash's first 13 hex digits read as a 52-bit integer, shifted right by 2 to its first 50 bits,
 * written as 10 Crockford base-32 digits with a hyphen after the fifth. It is not PHI, not a UUID, and never reads
 * as a hash (no run of hex characters). Nothing enforces uniqueness: two of one practice's approved versions share
 * a reference with odds about n²/2^51 (4.4 × 10^-6 at 100,000 versions), so the lookup shows every match.
 *
 * Pure and browser-safe: BigInt arithmetic, no Node crypto.
 */

/** Crockford's base-32 alphabet: the digits and the letters but I, L, O and U. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** JavaScript's own base-32 digits, as BigInt.prototype.toString(32) writes them. */
const RADIX_32 = '0123456789abcdefghijklmnopqrstuv';

/** A reference as printed: two groups of five Crockford digits. */
export const PACKET_REFERENCE_PATTERN = /^[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/;

const SHA256 = /^[0-9a-f]{64}$/;

/** The reference of an approved version, from its SHA-256 (64 lower-case hex digits). */
export function packetReference(sha256: string): string {
  if (!SHA256.test(sha256)) {
    throw new TypeError('a packet reference is derived from a SHA-256 of 64 lower-case hex digits');
  }
  // The value in base 32 with JavaScript's digits (0-9, a-v), each then written as Crockford's.
  const digits = [...(BigInt(`0x${sha256.slice(0, 13)}`) >> 2n).toString(32).padStart(10, '0')].map((digit) => ALPHABET.charAt(RADIX_32.indexOf(digit))).join('');
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

/**
 * A reference as a person types or reads it back, in its printed form, or null: trimmed and upper-cased, spaces and
 * hyphens dropped, O read as 0 and I and L as 1 (Crockford's rule); it needs exactly 10 symbols of the alphabet.
 */
export function normalizePacketReference(text: string): string | null {
  const symbols = text.trim().toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  if (!/^[0-9A-HJKMNP-TV-Z]{10}$/.test(symbols)) {
    return null;
  }
  return `${symbols.slice(0, 5)}-${symbols.slice(5)}`;
}

/** The value a printed reference's 10 digits hold (50 bits). */
function referenceValue(reference: string): bigint {
  if (!PACKET_REFERENCE_PATTERN.test(reference)) {
    throw new TypeError('a packet reference is two groups of five Crockford digits');
  }
  let value = 0n;
  for (const symbol of reference.replace('-', '')) {
    value = (value << 5n) | BigInt(ALPHABET.indexOf(symbol));
  }
  return value;
}

/**
 * The 12 hex digits a reference fixes (the hash's first 48 bits, of the 50 it holds): what the lookup matches with
 * left(approved_sha256, 12) before it compares each candidate's own reference.
 */
export function packetReferencePrefix(reference: string): string {
  return (referenceValue(reference) >> 2n).toString(16).padStart(12, '0');
}

/** The approved versions among `rows` whose reference is `reference`: every match, since nothing makes one unique. */
export function withPacketReference<T extends { readonly approvedSha256: string }>(rows: readonly T[], reference: string): T[] {
  return rows.filter((row) => SHA256.test(row.approvedSha256) && packetReference(row.approvedSha256) === reference);
}

/** The name an export's file is served under (D8): the reference, never a record ID. */
export function exportFileName(reference: string, file: 'pdf' | 'csv'): string {
  if (!PACKET_REFERENCE_PATTERN.test(reference)) {
    throw new TypeError('a packet reference is two groups of five Crockford digits');
  }
  return file === 'pdf' ? `payment-dispute-${reference}.pdf` : `payment-dispute-${reference}-schedule.csv`;
}

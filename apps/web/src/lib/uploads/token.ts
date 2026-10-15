import { timingSafeEqual } from 'node:crypto';

import type { Sealer } from '../auth/seal';

/**
 * The local upload receiver's short-lived token (docs/adr/0026): the local stand-in for a presigned
 * URL's signature. It binds the practice, the document, the declared size and type, and an expiry,
 * signed with a key only this server holds, so a URL works for one document's bytes, as declared, for
 * fifteen minutes. It is written in the letters a to p only (each byte as two letters), so it carries
 * no digit runs that could look like an identifier in a URL (SEC-08).
 */

const PURPOSE = 'local-upload';
const LETTERS = 'abcdefghijklmnop';
const EXPIRY_LETTERS = 8;
const MAC_LETTERS = 64;

export const UPLOAD_TOKEN = new RegExp(`^[a-p]{${String(EXPIRY_LETTERS + MAC_LETTERS)}}$`);

export interface TokenSubject {
  readonly practiceId: string;
  readonly documentId: string;
  readonly sizeBytes: number;
  readonly contentType: string;
}

function encode(bytes: Buffer): string {
  let text = '';
  for (const byte of bytes) {
    text += `${LETTERS[byte >> 4] ?? ''}${LETTERS[byte & 0x0f] ?? ''}`;
  }
  return text;
}

function decode(text: string): Buffer {
  const bytes = Buffer.alloc(text.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = (LETTERS.indexOf(text[2 * index] ?? '') << 4) | LETTERS.indexOf(text[2 * index + 1] ?? '');
  }
  return bytes;
}

function message(subject: TokenSubject, expires: number): string {
  return [subject.practiceId, subject.documentId, String(subject.sizeBytes), subject.contentType, String(expires)].join('\n');
}

/** A token for the document's upload, valid until `expiresAt`. */
export function uploadToken(sealer: Sealer, subject: TokenSubject, expiresAt: Date): string {
  const expires = Math.floor(expiresAt.getTime() / 1000);
  const prefix = Buffer.alloc(4);
  prefix.writeUInt32BE(expires, 0);
  return `${encode(prefix)}${encode(sealer.sign(PURPOSE, message(subject, expires)))}`;
}

/** Whether the token was made for this document's upload, as declared, and has not expired. */
export function validUploadToken(sealer: Sealer, subject: TokenSubject, token: string, now: Date): boolean {
  if (!UPLOAD_TOKEN.test(token)) {
    return false;
  }
  const expires = decode(token.slice(0, EXPIRY_LETTERS)).readUInt32BE(0);
  if (expires * 1000 <= now.getTime()) {
    return false;
  }
  const expected = sealer.sign(PURPOSE, message(subject, expires));
  return timingSafeEqual(decode(token.slice(EXPIRY_LETTERS)), expected);
}

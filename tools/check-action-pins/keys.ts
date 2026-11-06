import { createHash } from 'node:crypto';

/**
 * OpenPGP public keys as the age rule reads them (docs/adr/0066, Part 5; design E9), in TypeScript, so the checker and
 * its tests need no `gpg`, only `gpgv`, which takes a binary keyring:
 * - `dearmor`: the binary of every ASCII-armored public key block in a text, each block's CRC-24 checked when it has one;
 * - `primaryFingerprints`: the primary key fingerprint of each transferable public key in that binary. A v4 key's is the
 *   SHA-1 of 0x99, the public-key packet body's two-byte length and the body (RFC 4880 §12.2); a v6 key's the SHA-256 of
 *   0x9B, a four-byte length and the body (RFC 9580 §5.5.4); a v5 key's the same with 0x9A. A subkey has none here.
 * The committed github-web-flow.asc is checked against GitHub's two web-flow fingerprints with these, and a push run
 * compares the set GitHub serves with the committed one.
 */

const BLOCK = /-----BEGIN PGP PUBLIC KEY BLOCK-----\r?\n([\s\S]*?)-----END PGP PUBLIC KEY BLOCK-----/g;

/** RFC 4880 §6.1's CRC-24 of the binary, as the armor's checksum line carries it. */
function crc24(bytes: Uint8Array): number {
  let crc = 0xb704ce;
  for (const byte of bytes) {
    crc ^= byte << 16;
    for (let bit = 0; bit < 8; bit++) {
      crc <<= 1;
      if ((crc & 0x1000000) !== 0) crc ^= 0x1864cfb;
    }
  }
  return crc & 0xffffff;
}

/** The binary of every armored public key block in the text, concatenated in order. Throws when there is none, or a checksum fails. */
export function dearmor(text: string): Buffer {
  const blocks: Buffer[] = [];
  for (const match of text.matchAll(BLOCK)) {
    const lines = (match[1] ?? '').split(/\r?\n/);
    // Armor headers (Version:, Comment:) end at the first blank line.
    const blank = lines.findIndex((line) => line.trim() === '');
    const body = lines.slice(blank + 1).map((line) => line.trim());
    const checksum = body.find((line) => line.startsWith('='));
    const bytes = Buffer.from(body.filter((line) => line !== '' && !line.startsWith('=')).join(''), 'base64');
    if (checksum !== undefined) {
      const expected = Buffer.from(checksum.slice(1), 'base64');
      if (expected.length !== 3 || expected.readUIntBE(0, 3) !== crc24(bytes)) throw new Error('an armored key block fails its CRC-24 checksum');
    }
    blocks.push(bytes);
  }
  if (blocks.length === 0) throw new Error('no PGP PUBLIC KEY BLOCK in the text');
  return Buffer.concat(blocks);
}

/** Each packet of an OpenPGP binary: its tag, its body and its bytes. Throws on a packet that runs past the end, or a partial length. */
export function packets(binary: Buffer): { readonly tag: number; readonly body: Buffer; readonly raw: Buffer }[] {
  const found: { tag: number; body: Buffer; raw: Buffer }[] = [];
  let at = 0;
  while (at < binary.length) {
    const header = binary[at] ?? 0;
    if ((header & 0x80) === 0) throw new Error(`not an OpenPGP packet at byte ${String(at)}`);
    let tag: number;
    let length: number;
    let start: number;
    if ((header & 0x40) !== 0) {
      // The new format: one, two or five length octets.
      tag = header & 0x3f;
      const first = binary[at + 1] ?? 0;
      if (first < 192) {
        length = first;
        start = at + 2;
      } else if (first < 224) {
        length = ((first - 192) << 8) + (binary[at + 2] ?? 0) + 192;
        start = at + 3;
      } else if (first === 255) {
        length = binary.readUInt32BE(at + 2);
        start = at + 6;
      } else {
        throw new Error(`a partial body length at byte ${String(at)}, which no key packet uses`);
      }
    } else {
      // The old format: the length's size is in the header's last two bits.
      tag = (header >> 2) & 0x0f;
      const size = header & 0x03;
      if (size === 3) throw new Error(`an indeterminate length at byte ${String(at)}, which no key packet uses`);
      const octets = [1, 2, 4][size] ?? 1;
      length = binary.readUIntBE(at + 1, octets);
      start = at + 1 + octets;
    }
    if (start + length > binary.length) throw new Error(`a packet at byte ${String(at)} runs past the end`);
    found.push({ tag, body: binary.subarray(start, start + length), raw: binary.subarray(at, start + length) });
    at = start + length;
  }
  return found;
}

/** The fingerprint of a public-key packet's body, upper-case hex. Throws on a key version this does not know. */
export function fingerprint(body: Buffer): string {
  const version = body[0];
  if (version === 4) {
    const length = Buffer.alloc(2);
    length.writeUInt16BE(body.length);
    return createHash('sha1').update(Buffer.from([0x99])).update(length).update(body).digest('hex').toUpperCase();
  }
  if (version === 5 || version === 6) {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(body.length);
    return createHash('sha256')
      .update(Buffer.from([version === 6 ? 0x9b : 0x9a]))
      .update(length)
      .update(body)
      .digest('hex')
      .toUpperCase();
  }
  throw new Error(`a version ${String(version)} public key, whose fingerprint this check does not compute`);
}

/** The primary key fingerprints of an OpenPGP binary (public-key packets, tag 6), in order. */
export function primaryFingerprints(binary: Buffer): string[] {
  return packets(binary)
    .filter((packet) => packet.tag === 6)
    .map((packet) => fingerprint(packet.body));
}

/** The primary fingerprints of every key in an armored text. */
export function armoredFingerprints(text: string): string[] {
  return primaryFingerprints(dearmor(text));
}

import { createHash, randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { PACKET_REFERENCE_PATTERN, exportFileName, normalizePacketReference, packetReference, packetReferencePrefix, withPacketReference } from './reference';

/** A packet's reference (audit item #37 part 1, D5; the founder's ruling of 2026-10-20; docs/adr/0061). */

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const HEX_RUN = /[0-9a-f]{16,}/i;
const randomHash = () => randomBytes(32).toString('hex');

describe('packetReference', () => {
  it('is stated by its rule: the first 50 bits of the SHA-256 as 10 Crockford digits, a hyphen after the fifth', () => {
    expect(packetReference('c'.repeat(64))).toBe('SK6CS-K6CSK');
    expect(packetReference('0'.repeat(64))).toBe('00000-00000');
    expect(packetReference('f'.repeat(64))).toBe('ZZZZZ-ZZZZZ');
    expect(packetReference(createHash('sha256').update('tp-packet reference test').digest('hex'))).toBe('DTNPC-H3H8N');
    for (const reference of ['SK6CS-K6CSK', '00000-00000', 'ZZZZZ-ZZZZZ', 'DTNPC-H3H8N']) {
      expect(reference).toMatch(PACKET_REFERENCE_PATTERN);
    }
  });

  it('is the same for the same hash, and changes with any of the first 50 bits', () => {
    const hash = createHash('sha256').update('tp-packet reference test').digest('hex');
    expect(packetReference(hash)).toBe(packetReference(hash));
    const bits = BigInt(`0x${hash.slice(0, 13)}`);
    for (let bit = 2; bit < 52; bit += 1) {
      const flipped = (bits ^ (1n << BigInt(bit))).toString(16).padStart(13, '0');
      expect(packetReference(`${flipped}${hash.slice(13)}`), `bit ${String(bit)}`).not.toBe(packetReference(hash));
    }
    // The 51st and 52nd bits and everything after are not in it.
    const low = (bits ^ 1n).toString(16).padStart(13, '0');
    expect(packetReference(`${low}${hash.slice(13)}`)).toBe(packetReference(hash));
  });

  it('never reads as a hash or a UUID', () => {
    for (let index = 0; index < 1000; index += 1) {
      const reference = packetReference(randomHash());
      expect(reference).toMatch(PACKET_REFERENCE_PATTERN);
      expect(reference).not.toMatch(HEX_RUN);
      expect(reference).not.toMatch(UUID);
    }
  });

  it('is derived only from a SHA-256 of 64 lower-case hex digits', () => {
    expect(() => packetReference('C'.repeat(64))).toThrow(TypeError);
    expect(() => packetReference('c'.repeat(63))).toThrow(TypeError);
  });
});

describe('normalizePacketReference', () => {
  it('reads a reference as a person types it: lower case, no hyphen, spaces, and O, I and L for 0 and 1', () => {
    expect(normalizePacketReference('sk6cs-k6csk')).toBe('SK6CS-K6CSK');
    expect(normalizePacketReference('  sk6csk6csk ')).toBe('SK6CS-K6CSK');
    expect(normalizePacketReference('SK6CS K6CSK')).toBe('SK6CS-K6CSK');
    expect(normalizePacketReference('OOOOO-IIIII')).toBe('00000-11111');
    expect(normalizePacketReference('ooooo-lllll')).toBe('00000-11111');
  });

  it('refuses 9 or 11 symbols, and a symbol outside the alphabet', () => {
    expect(normalizePacketReference('SK6CS-K6CS')).toBeNull();
    expect(normalizePacketReference('SK6CS-K6CSKK')).toBeNull();
    expect(normalizePacketReference('SK6CS-K6CSU')).toBeNull();
    expect(normalizePacketReference('SK6CS_K6CSK')).toBeNull();
    expect(normalizePacketReference('')).toBeNull();
  });
});

describe('packetReferencePrefix', () => {
  it('is the first 12 hex digits of the hash a reference came from (1,000 random hashes)', () => {
    for (let index = 0; index < 1000; index += 1) {
      const hash = randomHash();
      expect(packetReferencePrefix(packetReference(hash))).toBe(hash.slice(0, 12));
    }
    expect(packetReferencePrefix('ZZZZZ-ZZZZZ')).toBe('ffffffffffff');
    expect(() => packetReferencePrefix('SK6CSK6CSK')).toThrow(TypeError);
  });
});

describe('withPacketReference', () => {
  it('keeps exactly the rows whose reference matches, two of them included', () => {
    const hash = createHash('sha256').update('tp-packet reference test').digest('hex');
    // Two hashes that share the first 50 bits (only the 51st bit onward differs), and one with the same 48-bit prefix but another reference.
    const twin = `${hash.slice(0, 12)}${(Number.parseInt(hash.charAt(12), 16) ^ 1).toString(16)}${'0'.repeat(51)}`;
    const sameprefix = `${hash.slice(0, 12)}${(Number.parseInt(hash.charAt(12), 16) ^ 8).toString(16)}${hash.slice(13)}`;
    expect(packetReference(twin)).toBe(packetReference(hash));
    expect(packetReferencePrefix(packetReference(sameprefix))).toBe(packetReferencePrefix(packetReference(hash)));
    expect(packetReference(sameprefix)).not.toBe(packetReference(hash));
    const rows = [{ id: 'a', approvedSha256: hash }, { id: 'b', approvedSha256: sameprefix }, { id: 'c', approvedSha256: twin }, { id: 'd', approvedSha256: 'f'.repeat(64) }];
    expect(withPacketReference(rows, packetReference(hash)).map((row) => row.id)).toEqual(['a', 'c']);
    expect(withPacketReference(rows, 'ZZZZZ-ZZZZZ').map((row) => row.id)).toEqual(['d']);
    expect(withPacketReference(rows, '00000-00000')).toEqual([]);
  });
});

describe('exportFileName', () => {
  it('names an export’s files by the reference, never a record ID (D8)', () => {
    expect(exportFileName('SK6CS-K6CSK', 'pdf')).toBe('payment-dispute-SK6CS-K6CSK.pdf');
    expect(exportFileName('SK6CS-K6CSK', 'csv')).toBe('payment-dispute-SK6CS-K6CSK-schedule.csv');
    expect(() => exportFileName('30000000-0000-4000-8000-000000000001', 'pdf')).toThrow(TypeError);
  });
});

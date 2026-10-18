import { createHash } from 'node:crypto';

import { urlPhiFindings } from '@tp/observability';
import { describe, expect, it } from 'vitest';

import { SCREENING_TOKEN, SCREENING_TOKEN_LENGTH, ScreeningTokenError, newScreeningToken, screeningTokenHash } from './token';

/**
 * The result link's token (CO-04; D21 a): 32 letters a to z, about 150 bits, every letter equally likely, a path
 * segment the URL guard admits, and stored only as its SHA-256.
 */

describe('the screening token', () => {
  it('is 32 letters a to z with at least 128 bits, and a path segment the URL guard admits', () => {
    const token = newScreeningToken();
    expect(token).toMatch(SCREENING_TOKEN);
    expect(SCREENING_TOKEN_LENGTH * Math.log2(26)).toBeGreaterThan(150);
    expect(urlPhiFindings(`/screening/results/${token}`)).toEqual([]);
    const tokens = new Set(Array.from({ length: 2000 }, () => newScreeningToken()));
    expect(tokens.size).toBe(2000);
  });

  it('draws by rejection sampling: bytes from 234 up are skipped, the rest taken mod 26', () => {
    const batches = [Uint8Array.from([234, 255, 0, 25, 26, 233, ...Array.from({ length: 26 }, () => 240)]), Uint8Array.from(Array.from({ length: 32 }, (_, index) => index))];
    let call = 0;
    const token = newScreeningToken(() => batches[call++] ?? new Uint8Array(32));
    // From the first batch: 0 -> a, 25 -> z, 26 -> a, 233 -> z (233 mod 26 = 25); then 28 from the second.
    expect(token).toBe(`azaz${'abcdefghijklmnopqrstuvwxyzab'}`);
    expect(call).toBe(2);
  });

  it('draws every letter about equally often', () => {
    const counts = new Map<string, number>();
    for (let index = 0; index < 2000; index += 1) {
      for (const letter of newScreeningToken()) {
        counts.set(letter, (counts.get(letter) ?? 0) + 1);
      }
    }
    expect(counts.size).toBe(26);
    const expected = (2000 * 32) / 26;
    for (const count of counts.values()) {
      expect(Math.abs(count - expected) / expected).toBeLessThan(0.1);
    }
  });

  it('hashes a token to the SHA-256 the database stores, and refuses anything else', () => {
    const token = 'abcdefghijklmnopqrstuvwxyzabcdef';
    expect(screeningTokenHash(token)).toBe(createHash('sha256').update(token).digest('hex'));
    for (const bad of ['', 'ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEF', `${token}a`, token.slice(1), '3f0b8c1e-5d2a-4e7f-9a6b-1c2d3e4f5a60']) {
      expect(() => screeningTokenHash(bad), bad).toThrow(ScreeningTokenError);
    }
  });
});

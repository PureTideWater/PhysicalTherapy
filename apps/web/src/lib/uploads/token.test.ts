import { randomBytes } from 'node:crypto';

import { urlPhiFindings } from '@tp/observability';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { Sealer } from '../auth/seal';
import { UPLOAD_TOKEN, uploadToken, validUploadToken } from './token';

const subject = { practiceId: '7d0c3d0e-8a64-4c1b-9d6f-0b8f4f0f6a01', documentId: '0b6e2a7c-3f4d-4e5a-8b9c-1d2e3f4a5b03', sizeBytes: 1200, contentType: 'application/octet-stream' };
const now = new Date('2026-10-16T12:00:00Z');
const later = new Date('2026-10-16T12:15:00Z');

describe('local upload tokens', () => {
  const sealer = new Sealer(randomBytes(32));

  it('authorize exactly the upload they were made for, until they expire', () => {
    const token = uploadToken(sealer, subject, later);
    expect(token).toMatch(UPLOAD_TOKEN);
    expect(validUploadToken(sealer, subject, token, now)).toBe(true);
    expect(validUploadToken(sealer, subject, token, later)).toBe(false);
    for (const changed of [{ practiceId: '1e4b8f8a-2c1d-4f7e-8b3a-5d6c7e8f9a02' }, { documentId: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c04' }, { sizeBytes: 1201 }, { contentType: 'text/plain' }]) {
      expect(validUploadToken(sealer, { ...subject, ...changed }, token, now), JSON.stringify(changed)).toBe(false);
    }
    expect(validUploadToken(new Sealer(randomBytes(32)), subject, token, now)).toBe(false);
    expect(validUploadToken(sealer, subject, `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`, now)).toBe(false);
    expect(validUploadToken(sealer, subject, 'not a token', now)).toBe(false);
    // A later expiry written into the token does not survive the signature.
    const extended = `${uploadToken(sealer, subject, new Date('2027-01-01T00:00:00Z')).slice(0, 8)}${token.slice(8)}`;
    expect(validUploadToken(sealer, subject, extended, now)).toBe(false);
  });

  it('carry nothing a URL check could mistake for an identifier (SEC-08, property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 2 ** 31 }), fc.date({ min: now, max: new Date('2099-01-01T00:00:00Z'), noInvalidDate: true }), (size, expiry) => {
        const token = uploadToken(sealer, { ...subject, sizeBytes: size }, expiry);
        expect(token).toMatch(/^[a-p]{72}$/);
        expect(urlPhiFindings(`/p/${subject.practiceId}/uploads/${subject.documentId}/content?token=${token}&request_key=3f0b8c1e-5d2a-4e7f-9a6b-1c2d3e4f5a60`)).toEqual([]);
      }),
    );
  });
});

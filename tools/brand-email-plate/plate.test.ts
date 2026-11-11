import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { PLATES, PUBLIC_DIR, compositeOnPlate, decodePng, encodePng, plateGeometry, plateHolds } from './plate';

const read = (file: string): Buffer => readFileSync(path.join(PUBLIC_DIR, file));

describe('the email lockups on their White plate (O-5, UX-S1)', () => {
  it('decodes what it encodes, pixel for pixel', () => {
    const pixels = new Uint8Array(3 * 2 * 4).map((_, index) => (index * 37) % 256);
    const image = { width: 3, height: 2, pixels };
    expect(decodePng(encodePng(image))).toEqual(image);
  });

  it('pads by space 3 and rounds by radius md, both scaled to the art as it is drawn at 160 px', () => {
    expect(plateGeometry(1200)).toEqual({ scale: 7.5, padding: 90, radius: 45, drawnWidth: 184 });
  });

  it.each(PLATES)('$plate is $source composited onto the White plate, nothing redrawn or recoloured', ({ source, plate }) => {
    const committed = decodePng(read(plate));
    const expected = compositeOnPlate(decodePng(read(source)));
    expect([committed.width, committed.height]).toEqual([expected.width, expected.height]);
    // Compared as bytes, not by toEqual's element walk, which takes seconds on 2.5 MB of pixels.
    expect(Buffer.from(committed.pixels).equals(Buffer.from(expected.pixels))).toBe(true);
  });

  it.each(PLATES)('$plate is opaque inside the rounded plate and White across its padding, with transparent corners outside it', ({ source, plate }) => {
    const art = decodePng(read(source));
    const image = decodePng(read(plate));
    const { padding } = plateGeometry(art.width);
    expect([image.width, image.height]).toEqual([art.width + 2 * padding, art.height + 2 * padding]);
    expect(plateHolds(image)).toBe(true);
    expect(image.pixels[3]).toBe(0);
    expect(image.pixels[(image.width * image.height - 1) * 4 + 3]).toBe(0);
  });

  // The inputs and outputs, pinned by SHA-256: a changed delivered lockup or a hand-edited plate fails here, and the
  // plates are regenerated (pnpm brand:email-plate --write) under a new file name, so a cached older email never
  // shows a mismatched plate (the brand owner's delegate's conditions, 2026-11-05).
  const DIGESTS: Readonly<Record<string, string>> = {
    '/brand/paidwhole-lockup-horizontal-tagline-1200w.png': '5a420711294eddecbb2182524f3ac9543d816fe392ce8114e07c1175063be062',
    '/brand/paidwhole-lockup-horizontal-1200w.png': 'c8636b734480b4b2aa51437ed67f95c9c8fec887506750f16ae53b74ee42c14c',
    '/brand/paidwhole-lockup-horizontal-tagline-email-plate-1380w.png': 'aaa2a199c20c051dd719195fc32aeb95a908b41d79456d3f3782e789df3d3c9f',
    '/brand/paidwhole-lockup-horizontal-email-plate-1380w.png': '5819842f780b9920c5ff9365d4e8dae8ce67a85b7af63046573c92f34dfe6b13',
  };

  it.each(PLATES)('$plate and its source $source are the files whose digests are pinned', ({ source, plate }) => {
    for (const file of [source, plate]) {
      expect(createHash('sha256').update(read(file)).digest('hex'), file).toBe(DIGESTS[file]);
    }
  });

  it('refuses an image whose plate is not opaque, as the transparent art alone is', () => {
    for (const { source } of PLATES) expect(plateHolds(decodePng(read(source)))).toBe(false);
  });

  it('refuses a PNG it was not written to read', () => {
    expect(() => decodePng(Buffer.from('not a png'))).toThrow(/not a PNG/);
    const palette = encodePng({ width: 1, height: 1, pixels: new Uint8Array(4) });
    palette[8 + 8 + 9] = 3;
    expect(() => decodePng(palette)).toThrow(/8-bit RGBA/);
  });
});

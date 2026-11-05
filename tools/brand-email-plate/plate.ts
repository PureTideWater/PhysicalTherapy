import path from 'node:path';
import { deflateSync, inflateSync } from 'node:zlib';

import { EMAIL_LOCKUP_PATH, EMAIL_LOCKUP_WIDTH, EMAIL_PROSPECT_LOCKUP_PATH } from '../../apps/worker/src/mail/template';
import { palette, radius, space } from '../../packages/brand/src/tokens';

/**
 * The email lockups on their White plate (decision O-5; review finding UX-S1): the delivered outlined art's PNG,
 * composited onto an opaque White rounded plate inside the image, so the ground the art needs is pixels. A client
 * that forces dark mode (Gmail's apps, Outlook.com, Outlook for iOS) rewrites a cell's colours and may rewrite an
 * image's CSS background, but it does not change an image's pixels. Nothing is redrawn or recoloured: each art pixel
 * is the source's, laid over White as any renderer lays it; the plate's padding is space 3 and its corners radius md,
 * both scaled from the 160 px the art is drawn at to the 1200 px source. Outside the rounded corners the image stays
 * transparent, so where a client darkens the ground the plate reads as a rounded White card.
 *
 * Generated, never drawn by hand: `pnpm brand:email-plate --write` writes the files from the sources, and
 * plate.test.ts holds the committed files to this composite pixel for pixel.
 */

/** apps/web/public, which the static host serves under /brand. */
export const PUBLIC_DIR = path.resolve(import.meta.dirname, '../../apps/web/public');

/** Each plate file, under the path the worker's template names, and the delivered art it is made from. */
export const PLATES: readonly { source: string; plate: string }[] = [
  { source: '/brand/paidwhole-lockup-horizontal-tagline-1200w.png', plate: EMAIL_LOCKUP_PATH },
  { source: '/brand/paidwhole-lockup-horizontal-1200w.png', plate: EMAIL_PROSPECT_LOCKUP_PATH },
];

export interface Rgba {
  width: number;
  height: number;
  /** Straight (not premultiplied) 8-bit RGBA, row after row. */
  pixels: Uint8Array;
}

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WHITE = [1, 3, 5].map((at) => Number.parseInt(palette.white.slice(at, at + 2), 16));
/** Subsamples per pixel on each axis for the corners' coverage. */
const SAMPLES = 4;

/** The plate's measures in source pixels for art `artWidth` wide, and the width the plated image is drawn at. */
export function plateGeometry(artWidth: number): { scale: number; padding: number; radius: number; drawnWidth: number } {
  const scale = artWidth / EMAIL_LOCKUP_WIDTH;
  return { scale, padding: space[3] * scale, radius: radius.md * scale, drawnWidth: EMAIL_LOCKUP_WIDTH + 2 * space[3] };
}

/** How many of a pixel's SAMPLES² subsamples fall inside a rounded rectangle `width` x `height` with corners `r`. */
function coverage(x: number, y: number, width: number, height: number, r: number): number {
  let inside = 0;
  for (let i = 0; i < SAMPLES; i += 1) {
    for (let j = 0; j < SAMPLES; j += 1) {
      const px = x + (i + 0.5) / SAMPLES;
      const py = y + (j + 0.5) / SAMPLES;
      const dx = px - Math.min(Math.max(px, r), width - r);
      const dy = py - Math.min(Math.max(py, r), height - r);
      if (dx * dx + dy * dy <= r * r) inside += 1;
    }
  }
  return inside;
}

/** The art composited onto its White plate: padded space 3, corners radius md, both at the art's scale. */
export function compositeOnPlate(art: Rgba): Rgba {
  const { padding, radius: r } = plateGeometry(art.width);
  const width = art.width + 2 * padding;
  const height = art.height + 2 * padding;
  const pixels = new Uint8Array(width * height * 4);
  const full = SAMPLES * SAMPLES;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const at = (y * width + x) * 4;
      const ax = x - padding;
      const ay = y - padding;
      if (ax >= 0 && ay >= 0 && ax < art.width && ay < art.height) {
        // Inside the padding, so the plate is opaque here: the art's pixel over White.
        const from = (ay * art.width + ax) * 4;
        const alpha = art.pixels[from + 3] ?? 0;
        for (let channel = 0; channel < 3; channel += 1) {
          pixels[at + channel] = Math.floor(((art.pixels[from + channel] ?? 0) * alpha + (WHITE[channel] ?? 0) * (255 - alpha) + 127) / 255);
        }
        pixels[at + 3] = 255;
      } else {
        pixels.set(WHITE, at);
        pixels[at + 3] = Math.floor((255 * coverage(x, y, width, height, r) + full / 2) / full);
      }
    }
  }
  return { width, height, pixels };
}

/**
 * Whether an image is a plated lockup as a dark-forcing client needs it: every pixel wholly inside the rounded plate
 * opaque, and the plate's padding band White.
 */
export function plateHolds(image: Rgba): boolean {
  const scale = image.width / plateGeometry(EMAIL_LOCKUP_WIDTH).drawnWidth;
  const padding = space[3] * scale;
  const r = radius.md * scale;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (coverage(x, y, image.width, image.height, r) < SAMPLES * SAMPLES) continue;
      const at = (y * image.width + x) * 4;
      if (image.pixels[at + 3] !== 255) return false;
      const band = x < padding || y < padding || x >= image.width - padding || y >= image.height - padding;
      if (band && [0, 1, 2].some((channel) => image.pixels[at + channel] !== WHITE[channel])) return false;
    }
  }
  return true;
}

function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(data: Buffer): number {
  let c = 0xffffffff;
  for (const byte of data) c = (CRC_TABLE[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** An 8-bit RGBA PNG, every row filtered Sub, deflated at level 9. */
export function encodePng(image: Rgba): Buffer {
  const stride = image.width * 4;
  const raw = Buffer.alloc((stride + 1) * image.height);
  for (let y = 0; y < image.height; y += 1) {
    const row = y * (stride + 1);
    raw[row] = 1;
    for (let i = 0; i < stride; i += 1) {
      const left = i >= 4 ? (image.pixels[y * stride + i - 4] ?? 0) : 0;
      raw[row + 1 + i] = ((image.pixels[y * stride + i] ?? 0) - left) & 0xff;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(image.width, 0);
  header.writeUInt32BE(image.height, 4);
  header.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([SIGNATURE, chunk('IHDR', header), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/** Reads an 8-bit RGBA, non-interlaced PNG (the delivered art's form), and refuses any other. */
export function decodePng(bytes: Buffer): Rgba {
  if (!bytes.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG');
  let offset = 8;
  let width = 0;
  let height = 0;
  const data: Buffer[] = [];
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('latin1', offset + 4, offset + 8);
    const body = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      if (body[8] !== 8 || body[9] !== 6 || body[12] !== 0) throw new Error('only 8-bit RGBA, non-interlaced PNGs are read');
    } else if (type === 'IDAT') {
      data.push(body);
    }
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(data));
  const stride = width * 4;
  const pixels = new Uint8Array(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    for (let i = 0; i < stride; i += 1) {
      const value = raw[y * (stride + 1) + 1 + i] ?? 0;
      const a = i >= 4 ? (pixels[y * stride + i - 4] ?? 0) : 0;
      const b = y > 0 ? (pixels[(y - 1) * stride + i] ?? 0) : 0;
      const c = i >= 4 && y > 0 ? (pixels[(y - 1) * stride + i - 4] ?? 0) : 0;
      const predicted = filter === 1 ? a : filter === 2 ? b : filter === 3 ? (a + b) >> 1 : filter === 4 ? paeth(a, b, c) : 0;
      pixels[y * stride + i] = (value + predicted) & 0xff;
    }
  }
  return { width, height, pixels };
}

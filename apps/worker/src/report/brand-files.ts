import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { assetPath, assets } from '@paidwhole/brand';

/**
 * The brand files the PDF renderer inlines into every report (docs/brand/BRAND.md, section 7): the tokens,
 * the report stylesheet, the bundled fonts (SIL Open Font License, with their license text in
 * packages/brand/assets/fonts) and the outlined SVGs of the lockup, the seal and the badge. Read from the
 * repository here; the worker's bundle (apps/worker/build.ts) replaces this module with the same files
 * embedded, so the image carries no asset directory and nothing is ever fetched.
 */

export const REPORT_FONT_FILES = [...assets.fonts.display, ...assets.fonts.sans, ...assets.fonts.mono].map((file) => file.replace(/^fonts\//, ''));

/** tokens.css, report.css, lockup.svg, seal.svg, badge.svg, or one of REPORT_FONT_FILES. */
export type BrandFileName = string;

/** Where each file is on disk (also what the bundle embeds). */
export function brandFileSources(): ReadonlyMap<BrandFileName, string> {
  return new Map<BrandFileName, string>([
    ['tokens.css', assetPath('../src/tokens.css')],
    ['report.css', fileURLToPath(new URL('./brand.css', import.meta.url))],
    ['lockup.svg', assetPath(assets.lockup)],
    ['seal.svg', assetPath(assets.seal)],
    ['badge.svg', assetPath(assets.badge)],
    ...REPORT_FONT_FILES.map((file): [BrandFileName, string] => [file, assetPath(`fonts/${file}`)]),
  ]);
}

/** A brand file's bytes. */
export function brandFile(name: BrandFileName): Buffer {
  const source = brandFileSources().get(name);
  if (source === undefined) {
    throw new Error('not a brand file the reports use');
  }
  return readFileSync(source);
}

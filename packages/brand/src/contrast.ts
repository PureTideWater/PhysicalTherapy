/**
 * WCAG 2.x contrast, the one copy of the formula in the repository: the token test (tokens.test.ts) holds the
 * brand's color pairs to it, and the e2e focus check (apps/web/e2e/a11y.ts) measures a page's computed colors with it.
 * Each channel s = C/255 is linearised (s/12.92 up to 0.04045, else ((s + 0.055)/1.055)^2.4), the relative luminance
 * is L = 0.2126 R + 0.7152 G + 0.0722 B, and the ratio is (lighter + 0.05) / (darker + 0.05).
 */

/** A color's red, green and blue channels (0 to 255) and its alpha (0 to 1). */
export type Rgba = readonly [number, number, number, number];

/** Reads a `#rrggbb` value (as tokens.css writes them) or a computed `rgb()` / `rgba()` value (as a browser reports them). */
export function parseColour(colour: string): Rgba {
  const value = colour.trim();
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value);
  if (hex !== null) {
    return [Number.parseInt(hex[1] ?? '', 16), Number.parseInt(hex[2] ?? '', 16), Number.parseInt(hex[3] ?? '', 16), 1];
  }
  const rgb = /^rgba?\((\d+(?:\.\d+)?),?\s*(\d+(?:\.\d+)?),?\s*(\d+(?:\.\d+)?)(?:\s*[,/]\s*(\d+(?:\.\d+)?))?\)$/.exec(value);
  if (rgb !== null) {
    return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), rgb[4] === undefined ? 1 : Number(rgb[4])];
  }
  throw new Error(`parseColour: a colour it cannot read: ${colour}`);
}

/** WCAG relative luminance of an opaque color, 0 (black) to 1 (white). */
export function relativeLuminance(colour: string | Rgba): number {
  const [red, green, blue] = (typeof colour === 'string' ? parseColour(colour) : colour).slice(0, 3).map((channel) => {
    const s = channel / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (red ?? 0) + 0.7152 * (green ?? 0) + 0.0722 * (blue ?? 0);
}

/** WCAG contrast ratio of two opaque colors, unrounded: 1 (the same) to 21 (black on white). */
export function contrastRatio(a: string | Rgba, b: string | Rgba): number {
  const one = relativeLuminance(a);
  const two = relativeLuminance(b);
  return (Math.max(one, two) + 0.05) / (Math.min(one, two) + 0.05);
}

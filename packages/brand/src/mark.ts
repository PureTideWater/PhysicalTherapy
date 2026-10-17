/**
 * The PaidWhole mark as path data, in a 240 x 240 box centred on (120, 120).
 *
 * Geometry (R = 104, the ring's outer radius):
 *   ring      outer 104, inner 66 (stroke 0.365 R), butt caps, radial cuts
 *   keystone  40 degrees centred on 12 o'clock, outer 110, inner 62 (1.26x the ring stroke,
 *             projecting equally outside and inside the ring)
 *   seams     3 degrees each side (standard cut); 6 degrees (small cut, for 32 px and below)
 *
 * Never redraw these shapes by hand. Regenerate from the kit script if the geometry ever changes.
 */

export const MARK_VIEWBOX = "0 0 240 240";

export const MARK_PATHS = {
  ring: {
    standard: "M160.636 24.267A104 104 0 1 1 79.364 24.267L94.212 59.247A66 66 0 1 0 145.788 59.247Z",
    small: "M165.591 26.525A104 104 0 1 1 74.409 26.525L91.068 60.68A66 66 0 1 0 148.932 60.68Z",
  },
  keystone: "M82.378 16.634A110 110 0 0 1 157.622 16.634L141.205 61.739A62 62 0 0 0 98.795 61.739Z",
} as const;

export type MarkCut = keyof typeof MARK_PATHS.ring;
export type MarkVariant = "color" | "reversed" | "mono" | "mono-white";

/** Pick the cut from the rendered size in CSS px. */
export function cutForSize(sizePx: number): MarkCut {
  return sizePx <= 32 ? "small" : "standard";
}

/** Fill colors for each variant. `currentColor` lets the mono mark inherit text color. */
export function markFills(variant: MarkVariant): { ring: string; keystone: string } {
  switch (variant) {
    case "reversed":
      return { ring: "#FFFFFF", keystone: "var(--pw-brass, #C99A3B)" };
    case "mono":
      return { ring: "currentColor", keystone: "currentColor" };
    case "mono-white":
      return { ring: "#FFFFFF", keystone: "#FFFFFF" };
    case "color":
    default:
      return { ring: "var(--pw-mark-ring, #0D1E3A)", keystone: "var(--pw-mark-keystone, #C99A3B)" };
  }
}

/**
 * Standalone SVG markup for places without React: email templates, the PDF renderer, tests.
 * Pass explicit hex fills for email, where CSS variables do not work.
 */
export function markSvg(opts: {
  size: number;
  variant?: MarkVariant;
  fills?: { ring: string; keystone: string };
  title?: string;
  cut?: MarkCut;
}): string {
  const cut = opts.cut ?? cutForSize(opts.size);
  const fills = opts.fills ?? markFills(opts.variant ?? "color");
  const title = opts.title ?? "PaidWhole";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MARK_VIEWBOX}" width="${opts.size}" height="${opts.size}" role="img" aria-label="${title}">` +
    `<path d="${MARK_PATHS.ring[cut]}" fill="${fills.ring}"/>` +
    `<path d="${MARK_PATHS.keystone}" fill="${fills.keystone}"/>` +
    `</svg>`
  );
}

/** App icon: ink rounded square (radius 22.5% of side) with the mark at 70% of the side. */
export function appIconSvg(side = 1024): string {
  const r = side * 0.225;
  const s = (side * 0.7) / 240;
  const offset = (side - side * 0.7) / 2;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}" width="${side}" height="${side}" role="img" aria-label="PaidWhole">` +
    `<rect width="${side}" height="${side}" rx="${r}" ry="${r}" fill="#0D1E3A"/>` +
    `<g transform="translate(${offset} ${offset}) scale(${s})">` +
    `<path d="${MARK_PATHS.ring.standard}" fill="#FFFFFF"/><path d="${MARK_PATHS.keystone}" fill="#C99A3B"/>` +
    `</g></svg>`
  );
}

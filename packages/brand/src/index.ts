export * from "./tokens";
export * from "./mark";
export * from "./name";

import { fileURLToPath } from "node:url";

/**
 * Absolute path to a bundled asset (logo SVG, PNG or font file), for Node-side use such as the
 * report renderer in apps/worker. Browser code should reference /brand/* and /icons/* in
 * apps/web/public instead.
 */
export function assetPath(name: string): string {
  return fileURLToPath(new URL(`../assets/${name}`, import.meta.url));
}

/** Names of the bundled assets, so callers do not guess. */
export const assets = {
  lockup: "paidwhole-lockup-horizontal.svg",
  lockupReversed: "paidwhole-lockup-horizontal-reversed.svg",
  lockupTagline: "paidwhole-lockup-horizontal-tagline.svg",
  lockupStacked: "paidwhole-lockup-stacked.svg",
  lockupMono: "paidwhole-lockup-horizontal-mono-ink.svg",
  symbol: "paidwhole-symbol.svg",
  symbolSmall: "paidwhole-symbol-small.svg",
  seal: "paidwhole-seal.svg",
  sealReversed: "paidwhole-seal-reversed.svg",
  sealMono: "paidwhole-seal-mono-ink.svg",
  badge: "paidwhole-badge-verified.svg",
  badgeReversed: "paidwhole-badge-verified-reversed.svg",
  appIcon: "paidwhole-app-icon.svg",
  favicon: "favicon.svg",
  fonts: {
    display: ["fonts/schibsted-grotesk-latin-500-normal.woff2", "fonts/schibsted-grotesk-latin-600-normal.woff2", "fonts/schibsted-grotesk-latin-700-normal.woff2"],
    sans: ["fonts/ibm-plex-sans-latin-400-normal.woff2", "fonts/ibm-plex-sans-latin-500-normal.woff2", "fonts/ibm-plex-sans-latin-600-normal.woff2"],
    mono: ["fonts/ibm-plex-mono-latin-400-normal.woff2", "fonts/ibm-plex-mono-latin-500-normal.woff2"],
  },
} as const;

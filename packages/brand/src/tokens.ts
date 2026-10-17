/** PaidWhole brand tokens as typed constants. Mirrors tokens.css; keep the two in step. */

export const palette = {
  ink: "#0D1E3A",
  brass: "#C99A3B",
  white: "#FFFFFF",
  paper: "#F6F4EE",
  slate: "#526070",
  line: "#DAD7CF",
} as const;

/** Status colors are for data (line and case status) only. They never appear in or near the logo. */
export const status = {
  whole: "#1F7A4D",
  short: "#B5452E",
  unpriced: "#7A8594",
} as const;

export const statusDark = {
  whole: "#4CBF84",
  short: "#E8846B",
  unpriced: "#9AA5B5",
} as const;

/** Contrast ratios against white, for reference when choosing text colors. */
export const contrastOnWhite = {
  ink: 16.6,
  slate: 6.4,
  brass: 2.6, // graphic only; never text on white
  whole: 5.3,
  short: 5.4,
} as const;

export const fonts = {
  display: { family: "Schibsted Grotesk", weights: [500, 600, 700], cssVar: "--font-display" },
  sans: { family: "IBM Plex Sans", weights: [400, 500, 600], cssVar: "--font-sans" },
  mono: { family: "IBM Plex Mono", weights: [400, 500], cssVar: "--font-mono" },
} as const;

export const type = {
  wordmark: { weight: 700, tracking: "-0.03em" },
  display: { weight: 700, tracking: "-0.02em", lineHeight: 1.1 },
  body: { size: 16, lineHeight: 24 },
  money: { font: "mono", weight: 500, numeric: "tabular-nums" },
} as const;

export const radius = { sm: 4, md: 6, lg: 10, pill: 999 } as const;

/** Logo rules that code can enforce. Sizes in CSS px. */
export const logoRules = {
  symbolMinPx: 16, // with the small cut
  symbolStandardMinPx: 24,
  lockupMinPx: 120,
  smallCutMaxPx: 32, // at or below this size, use the small cut (wider seams)
  clearSpaceRatio: 0.25, // of symbol height, all sides
} as const;

export const tagline = "Know what you're owed. Verify what you're paid.";

export const verifiedDefinition =
  "Verified: recovered amounts reconcile to posted or deposited remittance; expected amounts trace to signed-off contract versions.";

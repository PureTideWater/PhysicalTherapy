---
paths:
  - "apps/web/**"
  - "packages/brand/**"
  - "packages/ui/**"
  - "apps/worker/src/report/**"
  - "apps/worker/src/mail/**"
  - "apps/worker/src/reconcile/statement-html.ts"
  - "apps/worker/src/packets/html.ts"
---
# Brand (full specification: docs/brand/BRAND.md)

- Colors come from tokens: CSS variables in packages/brand/src/tokens.css or the Tailwind preset
  (bg-ink, text-fg-muted, text-status-short ...). No hex values in components; tokens.css is the
  only file that holds brand hex. Email templates are the one exception and take their hex from
  packages/brand/src/tokens.ts (apps/worker/src/mail/template.ts).
- The mark is <PaidWholeMark/> (apps/web/src/components/brand) or markSvg() from @paidwhole/brand.
  Never redraw it, copy its paths, or place a PNG of it in the app. The small cut switches on
  automatically at 32 px and below; minimum 16 px.
- The lockup is <PaidWholeLockup/>; the wordmark is one word, display font 700, -0.03em, one
  color. Never split "Paid" and "Whole", never two colors, never another face. Below 120 px wide,
  use the mark alone.
- Fonts load only through apps/web/src/lib/fonts.ts (next/font/local, self-hosted). Never add a Google
  Fonts <link> or any third-party request to a page that can show PHI. The report renderer uses
  the bundled woff2 files via assetPath() from @paidwhole/brand (apps/worker/src/report/brand-files.ts).
- Status colors (whole, short, unpriced) are for data only, as colored text on the matching tint,
  never white text on a saturated fill, never in or near the logo, never color alone (always with
  a label or reason code).
- <VerifiedSeal/> and <VerifiedBadge/> render only when reconciledToCash is true. The caller passes
  the fact derived from the ledger (posted or deposited entries net of recoupment and reversal)
  and names its source; it never passes a literal true. The definition line renders with the seal.
- Brass is the keystone, foil, seals, and the single active-nav underline. Never text on white,
  never a button fill, never a background.
- No gradients, shadows, glows, outlines, rotation or animation on any brand mark. Loading states
  use a plain progress bar, never the mark as a spinner.
- Every money figure, code, unit count and rate renders in the mono font with tabular numerals;
  expected, paid and short appear in that order. "Recovered" is never labelled without "posted" or
  "deposited".
- Dark mode uses the semantic tokens ([data-theme="dark"]); never invert hex in a component.
- Accessibility: text at least 4.5:1; focus visible with --pw-focus; a mark beside the visible name
  is decorative, a lone mark has role="img" and the label "PaidWhole".
- Report covers use the Paper token; inside pages are white; the 16 px mark sits in the running
  header; the seal appears bottom right of the cover only when earned, with its definition.

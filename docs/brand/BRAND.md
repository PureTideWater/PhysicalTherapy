# PaidWhole brand specification

This is the source of truth for how PaidWhole looks in the product, in reports, in email and on the
web. Code reads it through `packages/brand` (tokens, mark geometry, assets) and
`apps/web/src/components/brand` (React components). Nothing brand-related is hand-drawn or hard-coded
outside those two places.

**In this repository** (the drop-in assumed `apps/web/app`, `apps/web/components` and `apps/web/lib`, a
Tailwind v3 preset and `apps/worker/src/reports`): the web app's code is under `apps/web/src` (`src/app`,
`src/components/brand`, `src/lib/fonts.ts`), Tailwind is v4 and reads `packages/brand/src/tailwind-theme.css`,
the PDF frame and stylesheet are `apps/worker/src/report/brand.ts` and `apps/worker/src/report/brand.css`,
and the email template is `apps/worker/src/mail/template.ts`. The readings this file leaves open are recorded
in docs/adr/0056, and Change Order 001's choices (where the email art is served from, and the checks that hold
these rules) in docs/adr/0058.

## 1. The idea

PaidWhole proves that a therapy practice was paid what its payer contracts say. The brand is built
on one shape: a ring made whole by a brass keystone. The ring is the contracted amount. The keystone
is the part that was short, set back in at the top: the last piece placed and the one that holds.
Everything else in the system is quiet so that one idea carries.

Tone: serious, exact, warm. A ledger you trust. Never "AI", never hype, never a projected dollar
presented as recovered.

Tagline: **Know what you're owed. Verify what you're paid.**

## 2. The mark

Path data lives in `packages/brand/src/mark.ts`. Geometry, with R the ring's outer radius:

| Part | Specification |
| --- | --- |
| Ring | Outer 104, inner 66 in a 240 box (stroke 0.365 R). Butt caps, radial cuts. |
| Keystone | 40° wide, centred on 12 o'clock. Outer 110, inner 62: 1.26× the ring stroke, projecting equally outside and inside. |
| Seams | 3° each side. Small cut: 6° each side, used at 32 px and below (favicon, tab icons, table rows). |
| Colors | Ring Ink; keystone Brass. Dark grounds: ring White, keystone Brass. One color: both in Ink (print, fax, emboss) or both in White. |
| Minimum size | 16 px with the small cut, 24 px standard. Horizontal lockup 120 px / 30 mm. |
| Clear space | One quarter of the symbol's height on all sides. |

The keystone must read as a piece set into the ring, not a slice: never remove the seams, never
make it flush with the ring, never move it from 12 o'clock.

## 3. Lockups

| Lockup | Use | File / component |
| --- | --- | --- |
| Horizontal | App header, documents, decks; a prospect's (free screening) email header, as its PNG (section 7; ADR 0062, decision D11) | `<PaidWholeLockup/>`; `/brand/paidwhole-lockup-horizontal.svg`; `/brand/paidwhole-lockup-horizontal-1200w.png` |
| Horizontal with tagline | Marketing pages, a customer's email header (as its PNG, section 7; never a screening's) | `<PaidWholeLockup tagline/>`; `/brand/paidwhole-lockup-horizontal-tagline.svg`; `/brand/paidwhole-lockup-horizontal-tagline-1200w.png` |
| Stacked | Sign-in, on Paper (section 7); square placements (avatars with name, tiles) | `<PaidWholeLockup stacked/>`; `/brand/paidwhole-lockup-stacked.svg` |
| Symbol | Favicon, app icon, table rows, loading states, anywhere under 120 px wide | `<PaidWholeMark/>` |

The wordmark is "PaidWhole" as one word in Schibsted Grotesk 700, letter-spacing -0.03em, one
color (Ink, or White on dark). It is never split into two colors or two words, never set in another
face, weight or tracking, never outlined. In app chrome the lockup renders live text; in print and
anywhere fonts may not load, use the outlined SVG files; email uses the outlined lockup's PNG, since some
mail clients strip SVG (section 7).

## 4. Color

Tokens are CSS custom properties in `packages/brand/src/tokens.css` and typed constants in
`tokens.ts`. Components use tokens or the Tailwind preset, never hex.

| Token | Hex | Role | Contrast on white |
| --- | --- | --- | --- |
| Ink `--pw-ink` | #0D1E3A | Wordmark, ring, primary text, primary buttons | 16.6:1 |
| Brass `--pw-brass` | #C99A3B | The keystone. Also foil, seals, one accent rule or underline. Never text on white. | 2.6:1 |
| White `--pw-white` | #FFFFFF | Product and report ground | |
| Paper `--pw-paper` | #F6F4EE | Report covers, print, and the sign-in ground (section 7) | |
| Slate `--pw-slate` | #526070 | Secondary text, labels | 6.4:1 |
| Line `--pw-line` | #DAD7CF | Rules, borders, table lines | |

Status colors are for data only and never appear in or near the logo:

| Token | Hex | Meaning |
| --- | --- | --- |
| Whole `--pw-whole` | #1F7A4D | Paid as contracted (5.3:1 on white) |
| Short `--pw-short` | #B5452E | Paid below the contract (5.4:1 on white) |
| Unpriced `--pw-unpriced` | #7A8594 | Could not be priced; the reason is always shown |

Status is shown as colored text on a quiet tint (`--pw-*-bg`), never as white text on a saturated
fill. Colors that must be told apart also differ in lightness and are always paired with a label.

Dark mode (`[data-theme="dark"]` or `.dark`): the ground becomes a deeper ink, text becomes
near-white, the ring turns white and the keystone stays brass. Use the semantic tokens; never invert
hex values in a component.

## 5. Type

| Role | Face | Weights | Notes |
| --- | --- | --- | --- |
| Display, headlines, wordmark | Schibsted Grotesk | 500, 600, 700 | Headlines 700 at -0.02em, line-height 1.1 |
| Body and UI | IBM Plex Sans | 400, 500, 600 | 16/24 body; 14 in dense tables and form controls from 768 px up (16 below; ADR 0077); labels 500; buttons 600 |
| Money and tables | IBM Plex Mono | 400, 500 | Every dollar figure, code, unit count and rate. `font-variant-numeric: tabular-nums`. Totals 500. |

Fonts load through `apps/web/src/lib/fonts.ts` (next/font/local, self-hosted at build time). No page may load
fonts from a third party at runtime; PHI pages make no third-party requests of any kind. The report
renderer uses the bundled woff2 files in `packages/brand/assets/fonts` (SIL Open Font License; the
license text ships beside them).

## 6. The Verified seal and badge

The seal reads **VERIFIED BY PAIDWHOLE** around the top and **RECONCILED TO CASH** around the bottom.
It states who makes the claim and what the claim is. The badge is the pill "Verified by PaidWhole".

Rule, enforced in code (`apps/web/src/components/brand/Verified.tsx`, from `reportReconciliation()` in
`packages/ledger`): either mark renders only when
`reconciledToCash` is true, meaning every line in the report's recovered total has a `posted` or
`deposited` ledger entry net of recoupment and reversal. The caller passes the fact from the ledger
and names its source. Flagged, validated or actionable amounts never earn the mark. The definition
line renders with the seal on the same page:

> Verified: recovered amounts reconcile to posted or deposited remittance; expected amounts trace
> to signed-off contract versions.

Contract-verified calculation without cash is a line status (validated), never a seal.

## 7. Where the brand appears in the product

- App header: `<PaidWholeLockup size={20}/>` left; practice switcher and account right. One brass
  underline marks the active navigation item; that is Brass's only job in the UI.
- Sign-in: stacked lockup, Paper ground, nothing else decorative.
- Tables: Plex Mono for every figure; status as text on tint; the three numbers (expected, paid,
  short) always in that order.
- Dashboard tiles: label in Slate 12px, value in Plex Mono 500, note in Slate. "Recovered" is never
  shown without "posted" or "deposited" in its label.
- Empty states and loading: the mark alone, standard cut, never animated as a spinner (that would
  turn the keystone back into a progress ring). Use a plain progress bar for progress.
- Email: the horizontal lockup with its tagline in the header, as the outlined art's PNG
  (`/brand/paidwhole-lockup-horizontal-tagline-1200w.png`, 1200 px wide, drawn at 160 px with the
  alternative text "PaidWhole"; some mail clients strip SVG), on White. The one exception is a
  prospect's email (a free screening's link or notice, `variant: 'prospect'` in
  `apps/worker/src/mail/template.ts`): it is headed by the lockup without the tagline,
  `/brand/paidwhole-lockup-horizontal-1200w.png`, drawn at the same 160 px, because the tagline
  says "owed" and a screening never does (decision D11 a, ADR 0062; the copy lint refuses owed,
  underpaid and recovered in the screening's files). The image loads from the
  CloudFront static host (`STATIC_ASSET_ORIGIN`), never from the application; with no static host
  configured, the message goes without it, and the wordmark is never typed in its place. Hex colors
  from `tokens.ts` (CSS variables do not work in email); Plex Sans falls back to system sans.
- Reports (PDF): Paper cover with lockup top left and seal bottom right when earned; white inside
  pages with a 16 px mark in the running header; styles in `apps/worker/src/report/brand.css`.
- Billing-firm white label: the firm's name and logo lead; PaidWhole appears only as the Verified
  badge in the footer, when earned.

## 8. Do not

Stretch or skew; recolor; add gradients, shadows, glows or bevels; thin the ring or outline the
wordmark; rotate the keystone or move it from 12 o'clock; split the name or set it in another face;
place the lockup on Brass or on photographs; animate the mark as a spinner; use status colors in or
near the logo; use Brass for text on white.

## 9. Accessibility

Text contrast at least 4.5:1 (3:1 at 24 px and above). Ink and Slate pass on white; Brass does not
and is never text on white. Focus is always visible with `--pw-focus`. Marks beside a visible name
are decorative (`aria-hidden`); a lone mark carries `role="img"` and the label "PaidWhole". Status
is never color alone; the label or a reason code is always present.

## 10. Legal

The word mark PAIDWHOLE is registered first, the composite logo second; the symbol alone is not
relied on as a standalone registration. Fonts are under the SIL Open Font License, bundled with
their license text. Nothing in the brand implies third-party certification; "Verified by PaidWhole"
is a first-party statement with a printed definition.

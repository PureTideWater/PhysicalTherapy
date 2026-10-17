# 0054. Wear the PaidWhole brand from one token source, with self-hosted fonts and status as text on tint

- **Status:** accepted
- **Date:** 2026-10-17
- **Deciders:** founder (engineering)
- **PRD sections:** 6 (Cross-cutting: accessibility; PHI pages make no third-party requests), 7 (the shell, the
  dashboard, status chips, "recovered" only beside stage five), 15 (Documents: PDFs printed by the worker);
  docs/brand/BRAND.md; .claude/rules/brand.md; ADR 0053 (the Content-Security-Policy)

## Context

The product is named PaidWhole and has a brand: tokens, a mark, three typefaces, a seal and badge, and rules for
the app chrome, reports and email (docs/brand/BRAND.md). The drop-in that carries it assumes a Tailwind v3 preset,
`next/font/google` and components with inline `style` props. This repository runs Tailwind v4 (CSS first), serves
every page under a Content-Security-Policy whose `style-src` admits no style attribute (ADR 0053), and must make no
third-party request from a PHI page. The brand also says status is never color alone, never white text on a
saturated fill, and that "Recovered" never stands without "posted" or "deposited".

## Decision

**One token source.** `packages/brand` (`@paidwhole/brand`) holds the brand's values: `tokens.css` is the only CSS
with brand hex, `tokens.ts` mirrors it for places that cannot read a CSS variable (the manifest, the viewport's theme
color, email). The web app imports `tokens.css`, the brand's base styles (`app/brand.css`, in the base layer so a
component's utilities still win) and `tailwind-theme.css`, the v4 form of the preset with the same utility names
(`bg-ink`, `text-fg-muted`, `bg-paper`, `text-status-short`, `bg-status-short-bg`, `font-display`, `font-mono`,
`ring-focus` ...). `@tp/ui`'s shadcn variables point at the tokens (background, foreground, card, popover, primary,
secondary, muted, accent, destructive, border, input, ring, sidebar), so every shadcn component is on brand without
per-component colors; dark mode is the tokens' own (`[data-theme="dark"]` or `.dark`), which the shadcn variables
follow. shadcn's `accent` stays a hover surface (the inset gray): the brand's accent is Brass, which is never a
background. A test (`tools/brand-colors`, in `pnpm test`) fails on any hex color in source or a stylesheet outside
`packages/brand/src` and the email template.

**Fonts.** `next/font/local` loads the bundled woff2 files from `packages/brand/assets/fonts` (SIL Open Font License)
under the variables tokens.css reads (`--font-display`, `--font-sans`, `--font-mono`, display swap); nothing is
fetched from a font service at build or run time. Tailwind's font theme keys are declared `inline` so it never writes
those variables to `:root`, where they would collide with the ones next/font sets on `<html>`. The PDF renderer embeds
the same files as data URLs (ADR 0055 covers its gate); the worker's bundle embeds them too.

**Components under the CSP.** `PaidWholeMark`, `PaidWholeLockup`, `VerifiedSeal` and `VerifiedBadge` keep the drop-in's
props and proportions but write classes and SVG attributes, never a `style` attribute, which the pages' CSP would
refuse; the lockup's sizes are a fixed set (20 to 48 px) whose classes are written out so Tailwind generates them.
The empty and loading states show the mark alone through `markSvg()` (never animated; loading adds a plain progress
bar that stands still under reduced motion).

**Chrome.** The header carries `<PaidWholeLockup size={20}/>` left and the practice switcher and account right; the
rail's active item has the single brass underline; below the md breakpoint the rail folds into the header's Menu.
Sign-in steps sit on Paper under the stacked lockup. Dashboard tiles: label in Slate at 12 px, value in Plex Mono 500,
note in Slate. One type scale: a page's title 32 px/700, a section's heading 20 px/700, a card's title 18 px/700, all
in the display face at -0.02em; running text (a page's lede, a card's description) 16/24; tables and dense controls
14. Every money figure, code, unit count and rate is in the mono face with tabular numerals, running text and button
words included (`<Money/>`); the one exception is a price inside a native `<option>`, which holds text only. At a
phone's width no page scrolls sideways: a wide table scrolls inside its own card (its scroller is `relative`, so a
visually hidden header stays inside it), and a definition list stacks its terms over their values.

**Tables: expected, paid, short.** The brand's three numbers stand side by side in that order. In a table of lines the
comparison is at the allowed level (the variance is expected allowed less observed allowed), so "paid" in the brand's
order is the observed allowed amount: Charge, then Expected allowed, Observed allowed and Short (variance), then the
remittance's Paid and Patient share, the two parts of what it allowed. The brand journey pins the order.

**Recovered.** "Recovered" is never shown without "posted" or "deposited". Where the practice's proof level is at hand
the label names it (`recoveredLabel` in `@tp/ledger`: "Recovered (posted)", "Recovered principal, net (deposited)", the
audit report's headline under the proof level its gate judged it); a stage label that stands without one (a line's
chip, the monthly summary's row and column, a case's timeline) reads "Recovered (posted or deposited)", the plan's
stage five as `STAGE_LABELS` names it. A region's accessible name carries the same words as its visible label.

**Empty states.** The mark alone, still, belongs to a screen-level empty state, one per page at most, and is
decorative beside the heading that names the state; an empty section inside a screen is its words alone, so the mark
is not repeated down a page and a screen reader does not hear "PaidWhole" for each empty list.

**Status as text on tint.** A chip is colored text on its quiet tint with its label, never color alone:

| Status | Tone | Why |
| --- | --- | --- |
| Recovered | whole | cash at the proof level: the line is paid whole |
| Priced, no shortfall | whole | paid as the contract says |
| Validated | short | priced under signed-off terms and paid below them |
| Actionable | short | short, in a case, inside its window |
| Priced, not triaged yet | short | priced below what it expects; triage decides its stage |
| Payer approved | neutral | accepted, not yet cash: neither whole nor short |
| Flagged (investigatory) | unpriced | a line with no contract price, short of its cohort; never a claim |
| Unpriced | unpriced | no price; its reason is always shown beside it |
| Not priced yet | neutral | no run in effect has priced it |
| Deadline within 14 days | short | act now |
| Deadline passed | unpriced | nothing left to pursue |
| Deadline later, none | neutral | |

Whole and short are their colors on their tints (4.7:1 and better). Unpriced's own gray is 3.7:1 on white, below the
4.5:1 text minimum, so an unpriced chip's text is Slate and its hue is the chip's border; the report stylesheet's
`.unpriced` is Slate text likewise. A system state that is not a payment status (succeeded, ready, released, open) is a
neutral badge, Ink text on the inset tint with its rule: Ink fills are the primary button's alone. A failure (a failed
run, a refused check, an evidence gap) is danger text on the danger tint: `--pw-danger` and `--pw-danger-bg` are named
apart from Short, the data color, although the brand defines no other red yet and both still read Short's values. A
rate record checked against its page reads "Fields checked", never "Verified", which the brand keeps for the
ledger-gated seal. A form field's outline is `--pw-input-border` (3.5:1 on White, 3.2:1 on Paper; WCAG 1.4.11), the
native selects and text areas included; the quiet rules stay `--pw-border`.

**Email.** The header is the outlined horizontal lockup with its tagline, the delivered
`/brand/paidwhole-lockup-horizontal-tagline-1200w.png`, drawn at 160 px from the application's origin (APP_ORIGIN, which
every message already links to) with the alternative text "PaidWhole": every mail client renders an image where some
strip inline SVG, and the wordmark is never typed in a fallback face. The ground is White (Paper is for print). The
public brand art under `/brand` alone answers `Cross-Origin-Resource-Policy: cross-origin`, so a web mail client on its
own origin may embed it; every other response keeps `same-origin`.

**PDFs.** A report's inside pages carry the 16 px mark alone beside the document's title in the running header (no
lockup is built from the mark and live text below 120 px). Dollar amounts in headings and running text are wrapped in
the mono face as table figures are (`escapeWithFigures`); a test lays each template out in Chromium and finds no amount
outside IBM Plex Mono. A white label's name, not PaidWhole's, is the document's title, which Chromium copies into the
PDF's Title.

**Dispute packets lead with the practice.** A packet is the practice's own letter to its payer, which it submits
through its own channel (PRD, the packet builder). It keeps the brand's type and tokens but leads with the practice's
name on its cover and in its running header (the frame's white-label slot), and carries neither PaidWhole's lockup nor
its name; it never earns the seal or the badge. Nothing it computes or contains changed. This is the conservative
reading of a choice the brand does not make (it frames "Reports (PDF)" and lets a white label lead); the product owner
may decide instead that packets carry the PaidWhole cover, which is the frame's default and a one-line change.

**Readings of the specification.** BRAND.md disagrees with itself in two places, and one of its rules cannot be met;
until the brand owner settles them this repository reads them so: sign-in uses the stacked lockup on Paper, as section
7 says for sign-in, over section 3's "Horizontal: sign-in" and section 4's "Paper: report covers and print only"; and
the unpriced status's text is Slate with the unpriced gray as its chip's border, since `--pw-unpriced` is 3.7:1 on
white and 3.3:1 on its own tint, below the 4.5:1 text minimum. The brand owner is asked to settle sign-in and to darken
`--pw-unpriced` to at least 4.5:1 on `--pw-unpriced-bg`.

**Dark mode** is wired through the tokens and correct when forced (`[data-theme="dark"]` or `.dark`): the ring and the
wordmark turn white together (the wordmark reads `--pw-mark-ring`), the Verified badge takes the foreground color, and
the reversed seal replaces the Ink one. Nothing switches it on: there is no toggle and no `prefers-color-scheme` hook,
because no user has asked for it and a half-checked dark mode on PHI screens is worse than none. Revisit with a setting.

**The name.** "PaidWhole" replaces the working name and every placeholder for the vendor in user-facing text: page
titles (`%s | PaidWhole`), the manifest, the home, status, terms, request-audit and invitation pages, the hardware-key
note, email (sender name and subject), every PDF's title, the README's and CLAUDE.md's first lines. Packages, tables,
roles and environment variables keep their names.

## Alternatives considered

| Option | Why not (or when we would switch) |
| --- | --- |
| Keep the drop-in's inline styles and add `'unsafe-inline'` to `style-src` | Weakens the CSP on every PHI page for a logo |
| `next/font/google` as the drop-in has it | Fetches from Google at build time, which this network refuses and the plan forbids |
| A Tailwind v3 config with the preset | The repository is on Tailwind v4; the CSS theme gives the same utility names |
| Map `accent` to Brass as the preset does | Every hover surface would turn Brass; Brass is never a background |
| Color the unpriced chip's text in the unpriced gray | 3.7:1 fails the brand's own 4.5:1 text minimum and axe's contrast check |

## Consequences

- The brand e2e journey (`e2e/brand.spec.ts`) proves no page asks a font service or another origin for anything,
  checks the header, the brass underline, mono figures and a short chip's colors, and writes the screenshots to
  `brand-screenshots/` (gitignored).
- `.claude/rules/brand.md` is the drop-in's with its path scope and file paths corrected to this repository
  (`apps/worker/src/report/**`, `apps/worker/src/mail/**`, the statement and packet templates, `packages/ui/**`), so it
  loads where the hex and seal exceptions live; BRAND.md says where its paths are here.
- The hex check allows a directory by prefix and a file only by its exact path.
- Dark mode is wired through the tokens but nothing switches it on yet (no `data-theme` toggle).
- The drop-in's `tailwind-preset.ts` stays in the package for a v3 consumer; this repository reads `tailwind-theme.css`.

## Revisit when

A dark-mode setting is offered to users, the brand changes a token, or the CSP changes its `style-src`.

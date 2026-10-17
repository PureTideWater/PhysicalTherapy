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
note in Slate. Every money figure, code, unit count and rate is in the mono face with tabular numerals. Every recovered
dollar label names its proof level ("Recovered (posted)", "Recovered principal, net (deposited)").

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
4.5:1 text minimum, so an unpriced chip's text is Slate and its hue is the chip's border. A destructive badge (a failed
run or report) is short text on the short tint, not white on red.

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
- `.claude/rules/brand.md` is the drop-in's, kept as given; its path scope names `apps/worker/src/reports/**` and
  `apps/worker/src/email/**`, while this repository's are `apps/worker/src/report` and `apps/worker/src/mail`.
- Dark mode is wired through the tokens but nothing switches it on yet (no `data-theme` toggle).
- The drop-in's `tailwind-preset.ts` stays in the package for a v3 consumer; this repository reads `tailwind-theme.css`.

## Revisit when

A dark-mode setting is offered to users, the brand changes a token, or the CSP changes its `style-src`.

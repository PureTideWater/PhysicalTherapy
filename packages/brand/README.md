> This is the brand drop-in's own wiring guide, kept as delivered below; this repository differs from it as follows (docs/adr/0056 to 0058): the web app's code is under `apps/web/src` (`src/app`, `src/components/brand`, `src/lib/fonts.ts`); Tailwind is v4 and `globals.css` imports `tailwind-theme.css` (the preset stays for a v3 consumer); fonts load through `next/font/local` from `assets/fonts`, never `next/font/google`; the components write classes and SVG attributes, never a `style` attribute, under the pages' Content-Security-Policy; the report renderer is `apps/worker/src/report` (`brand.ts`, `brand.css`, `brand-files.ts`), which embeds the fonts and art as data URLs; the seal and badge take `reportReconciliation()` from `@tp/ledger`; email uses the 1200 px PNG lockup from the CloudFront static host (`STATIC_ASSET_ORIGIN`), not `markSvg()`, with hex from `tokens.ts`; hex colors stand only in `tokens.css`, `tokens.ts`, `mark.ts` and `apps/worker/src/mail/template.ts`; and the package adds `name.ts`, `tailwind-theme.css`, `tsconfig.json`, two colors in `tokens.css` (`--pw-input-border`, `--pw-danger-bg`, with the brand owner) and the product's words in `tokens.ts` (descriptor, independence claim, seal and badge text).

# PaidWhole brand, drop-in for the repository

Copy the contents of this folder into the repository root (it adds files; it overwrites nothing
that the Build Plan's starter kit creates). Then paste the prompt at the bottom into Claude Code.

```
packages/brand/                      @paidwhole/brand: tokens, mark path data, Tailwind preset, assets, fonts
  src/tokens.css                     the only file with brand hex values; light, dark and print
  src/tokens.ts                      the same tokens as typed constants; tagline; verified definition
  src/mark.ts                        the mark's geometry as path data; markSvg(); appIconSvg()
  src/tailwind-preset.ts             bg-ink, text-fg-muted, font-display, text-status-short ...
  src/index.ts                       exports plus assetPath() for Node-side use
  assets/*.svg                       26 outlined logo files (lockups, symbol, seal, badge, icons)
  assets/fonts/*.woff2 + LICENSES    Schibsted Grotesk, IBM Plex Sans, IBM Plex Mono (SIL OFL)
apps/web/components/brand/           <PaidWholeMark/> <PaidWholeLockup/> <VerifiedBadge/> <VerifiedSeal/>
apps/web/lib/fonts.ts                next/font loaders; self-hosted; exports fontClassName
apps/web/app/icon.svg                favicon (small cut; ring turns white in dark mode)
apps/web/app/apple-icon.png          180 px touch icon
apps/web/app/manifest.ts             PWA manifest pointing at /icons
apps/web/app/brand.css               base styles that apply the tokens
apps/web/public/brand/*              lockups, seal, badge for marketing pages and email
apps/web/public/icons/*              192 and 512 px icons
apps/worker/src/reports/brand.css    PDF report styles; __FONT_DIR__ is replaced with assetPath("fonts")
docs/brand/BRAND.md                  the specification Claude Code reads
.claude/rules/brand.md               path-scoped rules Claude Code applies when it touches UI or reports
```

## Wiring, in order

1. `pnpm-workspace.yaml` already includes `packages/*`; run `pnpm install` so `@paidwhole/brand`
   resolves. Add it to `apps/web/package.json` and `apps/worker/package.json` dependencies as
   `"@paidwhole/brand": "workspace:*"`.
2. `apps/web/tailwind.config.ts`: `presets: [brand]` with `import brand from "@paidwhole/brand/tailwind-preset"`.
3. `apps/web/app/globals.css`: `@import "@paidwhole/brand/tokens.css";` then `@import "./brand.css";`
   before the Tailwind layers.
4. `apps/web/app/layout.tsx`: `<html lang="en" className={fontClassName}>` from `@/lib/fonts`.
   Remove any Google Fonts `<link>`.
5. Map shadcn/ui's CSS variables to the tokens in globals.css (`--background: var(--pw-bg)`,
   `--foreground: var(--pw-fg)`, `--primary: var(--pw-primary)`, `--ring: var(--pw-focus)`,
   `--border: var(--pw-border)`, `--destructive: var(--pw-danger)`, `--muted-foreground: var(--pw-fg-muted)`)
   so every shadcn component is on-brand without per-component styling.
6. App header: `<PaidWholeLockup size={20}/>`; active nav item gets the single brass underline.
7. Report renderer: inline `tokens.css` and `reports/brand.css` into each template, replacing
   `__FONT_DIR__` with `assetPath("fonts")`; load the seal and badge SVGs with `assetPath(assets.seal)`
   and `assetPath(assets.badge)`; render them only when the ledger reconciliation for the report is true.
8. Email templates: use `markSvg({ size: 24, fills: { ring: palette.ink, keystone: palette.brass } })`
   or the PNG lockup in /public/brand; hex only, no CSS variables.

## The prompt for Claude Code

Paste this at the start of a plan-mode session after the files are in place.

> Read docs/brand/BRAND.md and .claude/rules/brand.md. Wire the brand into the app and the report
> renderer: add @paidwhole/brand as a workspace dependency of apps/web and apps/worker; apply the
> Tailwind preset; import tokens.css and brand.css in globals.css; map shadcn/ui's CSS variables to
> the tokens; load fonts only through apps/web/lib/fonts.ts and remove any third-party font link;
> use <PaidWholeLockup size={20}/> in the app header with a single brass underline on the active
> navigation item; use <PaidWholeMark/> for every small placement; wire app/icon.svg,
> app/apple-icon.png and app/manifest.ts; in the report renderer, inline tokens.css and
> reports/brand.css with __FONT_DIR__ replaced by assetPath("fonts"), and render the seal and badge
> through a function that takes the ledger's reconciliation result for the report, never a literal.
> Add tests: a lint rule or test that fails on any hex color outside packages/brand/src/tokens.css
> and email templates; a test that <VerifiedSeal/> and <VerifiedBadge/> render nothing when
> reconciledToCash is false; a test that no page in apps/web requests fonts.googleapis.com or
> fonts.gstatic.com; a visual test that renders the header at 1280 and 390 px wide and the report
> cover with and without the seal. Done when the header, sign-in, a table with status tints, a
> dashboard tile row and a report cover all render from tokens with zero hex values in component
> code, and all tests pass.

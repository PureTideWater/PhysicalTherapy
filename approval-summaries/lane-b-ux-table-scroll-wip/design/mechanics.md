# UX PR 3 (`co-001/ux-table-scroll`): the mechanics the design must get right

Scout 2 of 3. Read at `/home/user/ux-table-scroll` (claude/build-platform e908c21). Every line number below was
re-read at e908c21; where the review (evidence at 4d99df8) cited another line, both are given. Synthetic data only.

## 0. Corrections to the review's evidence at e908c21

| Review cites (4d99df8) | At e908c21 |
|---|---|
| `scroll-table.tsx:9-15`, "a bare scroller, lacks `relative`" | Now 1-54. `relative` is there (48), plus a measured caption (38-42). Added by 2eb464b9, the "Third fix round" commit inside PR #50 (merge 9d3ab335); the file was created in f6c01832 |
| `cases/[caseId]/page.tsx:160-172` (stacked lines) | 172-191 (`<ul aria-label="Case lines">` at 174, line li at 176, money at 187-189) |
| `cases/[caseId]/packet/page.tsx:546` | 570 (div) / 571 (table): PR #52 moved it |
| `reconciliation/page.tsx:136` | 144/145; the second table, at 306, is bare |
| `components/reports/display.tsx:120` | 124/125 |
| `settings/billing/[organizationId]/page.tsx:126` | 133 |
| `console/rule-releases/page.tsx:195,213` (text boxes) | 198, 216 |
| `p/page.tsx:438`, `cases/page.tsx:246`, `claims:134`, `anomalies:58,162`, `ledger:48`, `packet-reviews:48`, `settings/pricing:137`, `review.tsx:240`, `template-mapper:173`, `screening/coverage:61`, `console/screening:82` | each the wrapper line; the table is one line later (439, 243, 135, 59/163, 49, 49, 138, 241, 174, 62, 83). `cases/page.tsx` wrapper is now 242 |
| "89 `<table` elements" | 87 outside tests |
| `components/releases/note.tsx:94`, `components/contracts/display.tsx:91`, the bare-table lines (`prospects:50`, `tickets:46`, `compliance:159`, `contracts:91`, `remittances:71`, `support-access:45`) | unchanged |

The table census at e908c21 (script: `scratchpad/scan.py`): **10** tables inside `ScrollTable`, **17** inside a bare
`overflow-x-auto` div, **60** with no scroller at all.

## 1. `ScrollTable` today: what exists against what the review asks

`apps/web/src/components/scroll-table.tsx`:
- 1: `'use client'` (since 2eb464b9).
- 15-35: `useRef` on the scroller; `overflows` state, initially `false`; a `ResizeObserver` on the scroller and on each
  child present at mount (29-31). It measures `scrollWidth > clientWidth` (24).
- 38-42: while `overflows`, a `<p aria-hidden="true" class="text-xs text-muted-foreground" data-state="scrolls-sideways">`
  reading "More columns to the right: scroll the table sideways." **above** the scroller. This shows at any width, not
  only below `sm`.
- 43-49: `role="region"`, `aria-label="${label}, scrolls sideways"`, `tabIndex={0}` **always** (the server render and
  every client render), `relative min-w-0 max-w-full overflow-x-auto rounded-sm focus-visible:outline-none
  focus-visible:ring-2 focus-visible:ring-ring`.

| Review asks (UX-011 Fix; UX-079 (a)) | At e908c21 |
|---|---|
| `relative` (ADR 0056:52) | done (48) |
| small client component | done (1) |
| role and name always | done (45-46) |
| `tabIndex={0}` on the server, reachable without script | done: always on (47) |
| drop the tab stop only while the table fits (no idle stops at 1280) | **not done**: the observer drives only the caption |
| visible caption below `sm` while it overflows | partly: shows at every width; other words |
| edge fades in token colours, only while columns lie past an edge | **not done** |
| per-table `min-w-[…]` | 4 tables have one: `pricing-runs/[runId]/page.tsx:429` (40rem), `pricing/content.tsx:21` (36rem), `pricing/diff.tsx:285` (40rem), `pricing/location.tsx:14` (36rem) |
| `overflow-wrap:anywhere` on long values | none; Tailwind 4.3 has `wrap-anywhere` |

**Tests:** `apps/web/src/components/scroll-table.test.tsx` (28 lines, `renderToStaticMarkup`): 21-23 asserts the markup
starts `<div role="region" aria-label="Run lines, scrolls sideways" tabindex="0" class="relative min-w-0 max-w-full
overflow-x-auto `; 25-27 asserts no caption on the server. Other tests pin the same server markup:
`pricing/display.test.tsx:65-68`, `pricing/diff.test.tsx:54-70,232-234`, `pricing/line-words.test.tsx:113`,
`pricing/content.test.tsx:86`. **The server output must stay byte-identical up to `class="relative `**, or these tests
need changing too. A frame element *around* the scroller would break each `^<div role="region"` anchor (see section 2).

**Users (10 sites in 9 files):** `app/p/[practiceId]/pricing-runs/[runId]/page.tsx:428`, `app/screening/page.tsx:94`
(**PR #42's file, cannot change**), `components/packets/calculation-words.tsx:76`, `components/packets/display.tsx:138`,
`components/packets/pricing.tsx:81`, `components/pricing/content.tsx:20`, `components/pricing/diff.tsx:284`,
`components/pricing/display.tsx:504,549`, `components/pricing/location.tsx:13`, `components/pricing/line-words.tsx:117`
(this one wraps a `<pre>`, not a table: the component is a general sideways scroller). **The `children` API must stay**,
because `screening/page.tsx` uses it and cannot change. None of these renders in the worker's PDFs: no worker or package
imports `apps/web` components.

**Server rendering and hydration.** A client component still renders on the server: the region, its name and
`tabindex="0"` are in the HTML, so the scroller is reachable before hydration and without script. `useEffect` and the
observer run only after hydration, so a later change to `tabIndex`, the name or the caption is a state update after
hydration, never a mismatch. **Without script:** the region stays focusable and named "…, scrolls sideways" at every
width (an idle stop at 1280, the safe failure), and no caption or fade shows. To keep that, the "unknown" state must
render like "overflows" for the tab stop and the name, and like "fits" for the caption and the fades (so nothing claims
overflow over a table that fits). That needs a three-state value (`unmeasured | fits | overflows`), not today's boolean.

**Mechanics the new code must get right:**
1. **Re-observing.** Today's observer watches the children present at mount (29-31). A child swapped later (a re-keyed
   table, a filter that renders a new `<table>`) goes unwatched, and a change in `scrollWidth` alone does not fire
   `ResizeObserver` on the scroller, whose border box stays the same. Add a `MutationObserver({ childList: true })`
   that re-observes, or observe the table through a ref callback. Do not add an inner `w-max` wrapper to observe: it
   sizes a `w-full` table to its max-content width, so cells stop wrapping.
2. **Thresholds.** `scrollWidth - clientWidth > 1`, so sub-pixel rounding at a zoom factor does not set "overflows".
3. **Focus.** Do not take the tab stop away while the scroller has focus (a resize while focused). Drop it on the next
   measurement after `blur`.
4. **Tab stop and name when it fits.** Recommendation: while measured `fits`, render no `tabIndex`, no `role` and no
   `aria-label` (a plain div). The table keeps its own `aria-label`, and 1280 px gains neither idle tab stops nor about
   80 redundant region landmarks. Holding "Cases, scrolls sideways" over a table that does not scroll would be untrue.
   The review's "keeps role and name always" did not weigh landmark noise. If the design keeps the region, its name
   must drop the suffix ("Cases").
5. **A pure core for unit tests.** Vitest here has no DOM: no jsdom, happy-dom or testing-library under `node_modules`,
   and every component test uses `renderToStaticMarkup`. Put the decision in a pure function
   `scrollState({ scrollWidth, clientWidth, scrollLeft })` returning `{ fits, start, end }` and unit-test that, with the
   server markup test. Prove the live behaviour in Playwright: at 1280 a fitting table's wrapper has no tabindex; at
   390 the same one has `tabindex="0"` and the caption.

## 2. The edge-fade cue

**CSP.** `apps/web/src/lib/http/security-headers.ts:60`: `style-src 'self' [static origin] 'nonce-…'`, with no
`'unsafe-inline'` and no `'unsafe-hashes'`. A server-rendered `style="…"` attribute is refused. ADR 0056:39-40 already
says "never a `style` attribute, which the pages' CSP would refuse". CSSOM writes after hydration (`element.style.x =`)
are not blocked, but nothing should depend on them. The proxy sets the per-request policy (`src/proxy.ts:26`);
`next.config.ts` adds only the fixed headers. `readiness.test.ts:119,133` pins `style-src`. **So the cue is classes and
`data-*` attributes only**, and a scroll position is never written into a style.

**Tailwind and tokens.** Tailwind **v4.3.3**, CSS-first (`@tailwindcss/postcss`, `apps/web/postcss.config.mjs`).
`apps/web/src/app/globals.css:1-9` imports tailwindcss, `@paidwhole/brand/tokens.css`,
`@paidwhole/brand/tailwind-theme.css`, then `./brand.css` **`layer(base)`**, then `@tp/ui/styles.css`. Tokens:
`packages/brand/src/tokens.css:7-70` (light), 73-100 (dark, only under `:root[data-theme="dark"]` or `.dark`: no
`prefers-color-scheme` rule, consistent with D9 item 3), 103-109 (print). The Tailwind names are in
`tailwind-theme.css:14-65`; the shadcn names (`--card` = `--pw-bg`, `--muted` = `--pw-bg-raised`, `--muted-foreground` =
`--pw-fg-muted`) are in `packages/ui/src/styles.css:11-39`. Card: `bg-card` (`packages/ui/src/components/card.tsx:9`).
`tools/brand-colors/scan.ts:16-25` fails on any hex in `.css` outside tokens.css. Use `var(--pw-…)` and `color-mix()`,
which Tailwind 4 already requires of the browser. Because brand.css is imported `layer(base)`, a Tailwind `@utility`
cannot be declared there (it would be nested in a layer). A plain class there (`.pw-scroll-frame`, next to `.pw-money`
and `.pw-status-*`) works, provided no utility on the same element sets `background` or `position`.

**Surfaces under tables.** No table row or cell has a background: no zebra rows, no sticky `<th>`, no `hover:bg-*`
(searched every `<tr>`, `<td>`, `<th>` and `<thead>`). The only tints inside cells are `StatusChip`s
(`components/status.tsx:15-25`: `bg-status-*-bg`, `bg-bg-inset`, `bg-danger-bg`). Tables sit on `bg-card` or the page
(both `--pw-bg`). The fixed-height text boxes sit on `bg-muted` (`releases/note.tsx:94`, `rule-releases/page.tsx:198,216`,
`releases/content-due.tsx:133`) or `bg-muted/30` (`contracts/display.tsx:91`).

**The techniques compared:**

| Technique | Without script | Over chips and sticky cells | Support | Verdict |
|---|---|---|---|---|
| `background-attachment: local` covers over `scroll` shadows (CSS only) | works | painted **under** the content: a tinted chip at the edge cuts a gap in the shadow, and UX PR 34's sticky naming cell (UX-079 (b)) needs an opaque background that **covers the left shadow entirely** | every engine | good today; breaks with PR 34 |
| Scroll-driven animations (`animation-timeline: scroll(self inline)`) setting the fades' opacity | works | any layer | Chromium 115+, Safari 26; Firefox only behind a flag, as far as I know | not alone; a later upgrade |
| Scroll-state container queries (`container-type: scroll-state`, `scrollable: inline-end`) | works | any layer | Chromium 133+ only | not yet; record under "Revisit when" |
| `IntersectionObserver` sentinels | no | any layer | everywhere | a sentinel cannot sit beside a table without changing its layout; more parts than a scroll listener |
| **JS state**: the existing observer plus one passive `scroll` listener (rAF-throttled) sets `data-overflow-start`/`data-overflow-end`; CSS draws the fades from them | no fade until hydration (the absence of a cue, never a wrong one) | overlays sit **above** content, and a sticky cell can draw its own edge shadow from the same attribute (`group-data-[overflow-start]:…`) | everywhere | **recommended** |

**Recommended mechanics:**
- Keep the region `<div>` first in the server markup, so the pinned tests hold. Drawing the fades needs a box that
  does not scroll. Two options:
  - (a) Wrap the scroller in a `relative` frame (`<div class="pw-scroll-frame" data-overflow-…>`). The fades are
    `::before` and `::after` with `pointer-events: none` and `inset-block: 0`. The pinned tests' `^<div role="region"`
    anchors then change, in five test files.
  - (b) Use `position: sticky` pseudo-elements inside the scroller. They are fragile in tables and Safari.
  Recommendation (a). Update the five assertions to look for the region inside the frame. The design scout should
  confirm that against `pr42-files.txt`: none of the five test files is PR #42's.
- The fade is a gradient from the surface to transparent, `linear-gradient(to left, var(--pw-scroll-surface,
  var(--pw-bg)), transparent)`, about 1.5rem wide, shown only while `data-overflow-end` (or `-start`) is set. A
  surface-coloured fade is surface-agnostic only if the variable follows the surface: default `--pw-bg` (cards and
  pages); set the variable on a `bg-muted` surface. Alternative: an ink shadow, `color-mix(in srgb, var(--pw-fg) 12%,
  transparent)`, which reads on any surface. Dark tokens follow on their own in both.
- `scroll-padding-inline: 1.5rem` on the scroller, so a link or button that takes focus inside the table is scrolled
  clear of the fade (WCAG 2.4.11).
- `@media (forced-colors: active)`: hide the fades. Their colours would be forced, and gradients behave differently
  across engines. The caption (section 3) and the system scrollbar carry the cue there. `forced-color-adjust` stays
  untouched.
- `prefers-reduced-motion`: the fades only appear and disappear. If the design adds an opacity transition, put it under
  `@media (prefers-reduced-motion: no-preference)`; there is no other motion.
- Print: `@media print { overflow: visible }` on the scroller and no fades, so a printed page shows every column. Nothing
  handles print today (no `print:` utility in `apps/web/src`). In scope as an improvement.

## 3. The caption

- Today (`scroll-table.tsx:40`): "More columns to the right: scroll the table sideways." Above the scroller, at every
  width, while it overflows.
- The review (UX-079 (a)): "Scroll sideways for more columns", below `sm` while it overflows.
- **Copy rules.** `.claude/rules/brand.md` and `docs/brand/BRAND.md` say nothing on scroll cues. BRAND.md:147-149 ("no
  gradients, shadows") is in "Do not" and is about the mark and lockup, so a fade on a table is allowed, as the review
  notes. `apps/web/src/lib/copy/words.ts` holds count and label helpers only. `tools/brand-copy/scan.ts` reads
  `apps/web/src` (`COPY_ROOTS`, 51-61) and its rules (119-129: ProofPack, AI, intelligence, recovered unlabelled,
  screening owed) do not touch this sentence. Any wording passes the lint; the choice is house style. Helper lines in
  the app are full sentences with a full stop ("Nothing is due.", `content-due.tsx`).
- **Recommendation:** "Scroll sideways for more columns." It is the review's wording as a sentence. It is true at either
  edge ("to the right" is false once scrolled to the end), and right for touch, keyboard and wheel. Show it **at any
  width while it overflows**, not only below `sm`: from 768 to 1023 px the rail takes 256 px and the content column is
  about 448 px, narrower than at 640 to 767 px (section 5). Keep it above the scroller, so it is read before the cut-off.
- **`aria-hidden` is right** while the region's name carries "scrolls sideways": a screen reader would hear the cue twice
  otherwise. The condition is that the name follows the measurement (section 1, point 4). If the design keeps the
  region when it fits, the suffix must drop, because the name would claim a scroll that is not there.
  `aria-describedby` to the caption is the alternative; it would change every pinned name and adds nothing.

## 4. ADR 0056 and whether this needs ADR 0078

- `docs/adr/0056-wear-the-paidwhole-brand-from-one-token-source-self-hosted-fonts-and-status-as-text-on-tint.md:51-53`:
  "At a phone's width no page scrolls sideways: a wide table scrolls inside its own card (its scroller is `relative`, so
  a visually hidden header stays inside it), and a definition list stacks its terms over their values." 55-58 cover
  expected, paid, short. 39-40 rule out the `style` attribute. It says nothing about keyboard reach, a cue, stacking
  rows, or a guard.
- **Amendment form in this repo:** a section at the end, `## Amendment (\`co-001/<branch>\`, YYYY-MM-DD): <title>`
  (`0037-…:144`, `0064-…:193,409`). The Status line also names the amending ADR. An inline italic `*Amended by
  [00NN](…) (…): …*` sits under the paragraph it changes (`0056:104-105`, for 0058).
- **ADR 0078 is reserved** for this PR and PR 4 (`/home/user/ops/LANES.md:183`), with test-matrix TBL-01 to TBL-04 here
  and TBL-05 to TBL-08 for PR 4, and synth module 17 (TBL). PR 4 builds on the same primitive, and these are app-wide
  conventions every later table PR follows. So: **write ADR 0078**, and add to 0056 a Status-line "amended by 0078" and
  one italic pointer under 51-53.
- **Conflict:** ux-forms (`origin/co-001/ux-forms`, ADR 0077) edits the same two places in 0056: its Status line, and a
  new italic paragraph after line 54 ("below the md breakpoint, form controls are 16 px"). Whichever merges second
  keeps both (LANES.md rule 6).
- **What 0078 records:**
  1. Every sideways scroller is `ScrollTable`: named, focusable from the server; the tab stop and name follow the
     measured overflow; a focused scroller keeps its stop.
  2. The cue: data-attribute state, fades in tokens above the content, `scroll-padding`, forced-colors and print
     fallbacks, the caption's words and its any-width rule.
  3. The stacked-row primitive and its container-query rule (section 5).
  4. The guard (section 6) and its dated exemptions.
  5. The fixed-height text boxes as named, focusable regions.

  Alternatives: CSS-only local backgrounds; scroll-driven animations; scroll-state queries; stacking by viewport; a
  CSS-only table-to-cards re-layout. Revisit when Firefox ships scroll-driven animations, or every engine ships
  scroll-state queries.

## 5. Stacked layouts to learn from, and the width the shell leaves

- **The case page's lines** (`app/p/[practiceId]/cases/[caseId]/page.tsx:172-191`): `<section aria-label="Lines">`, an
  `h2`, then `<ul aria-label="Case lines">`, with each `<li class="rounded-md border p-4" data-case-line=…>` holding a
  `flex flex-wrap items-center gap-3 text-sm` row of spans:
  - the claim number (only with PHI read);
  - the line's link;
  - the code `x` units in mono;
  - "Expected <Money/>, observed <Money/>, variance <Money/>" (187-189: the brand's order, at the allowed level as ADR
    0056:55-58 defines it);
  - "Window ends …";
  - the stage chip.

  There is no heading per row and no `<dl>`: it reads well, but it is spans. The primitive should improve on it: the
  naming link as a heading, then a `<dl>`.
- **`min-w` pattern** (`components/pricing/location.tsx:13-14`): `<ScrollTable label={label}><table className="w-full
  min-w-[36rem] …" aria-label={label}>`, with the label passed once for both names.
- **Definition lists:** the house idiom is `grid grid-cols-1 gap-x-6 sm:grid-cols-[max-content_1fr] gap-y-1 text-sm`
  (8 uses, 19 `<dl>`s in all), with `dt` `text-muted-foreground`. `Fact` (`components/remittances/display.tsx:160-167`)
  is the `dt`/`dd` pair helper; `Stat` (`components/screening/result-summary.tsx:106-113`) is the figure variant.
- **Money:** `Money` (`components/remittances/display.tsx:18-20`) is `font-mono tabular-nums` with "—" for null;
  `Counted` (22-31) does a count with its noun. `type-scale.test.ts:38-41` fails any `tabular-nums` without `font-mono`.
  `.pw-money` is in `brand.css:31-37`. `components/format.ts` holds dates and role names only (`utc` 2, `utcDate` 15).
- **Status:** `StatusChip` (`components/status.tsx:23-29`): text on tint, `whitespace-nowrap`.
- **Brand order:** `docs/brand/BRAND.md:123-124` ("the three numbers (expected, paid, short) always in that order") and
  `.claude/rules/brand.md:36-37` confirm it.
- **Breakpoints and the shell:**
  - Tailwind's defaults: `sm` 640, `md` 768.
  - `components/shell.tsx:331` puts the rail (`w-64`) in at `md`; 334 is `main` (`min-w-0 flex-1 px-4 py-6 md:p-8`). The
    public layout (309) caps at `max-w-3xl`.
  - The content column is about 358 px at 390 and about 735 px at 767. At 768 it drops to about 448 px, then grows to
    about 704 at 1024.
  - A card's `px-6` (`card.tsx:30`) takes 48 px more.

  So **a viewport breakpoint cannot pick "too narrow for this table"**: `below sm` misses the 768-1023 band, where the
  same table is cut off. Use **container queries**, built into Tailwind v4 (`@container` on the frame, then `@max-[40rem]:…`
  or the named sizes). Support: Chromium 105, Safari 16, Firefox 110. Nothing in `apps/web/src` or `packages/ui/src`
  uses them yet. The stack threshold should equal the table's own `min-w`.
- **Primitive shape (recommendation):** one column definition, two renderings.
  - Columns: `{ key, header, cell, kind: 'name' | 'figure' | 'status' | 'text' | 'action', align }`.
  - The table rendering goes inside `ScrollTable` with the `min-w`.
  - The stacked rendering goes in `<ul>`/`<li>`: the naming cell as a heading at a `level` the caller passes (h3 under
    a section's h2), then a `<dl>` of the remaining columns in column order (figures in `Money`'s mono), then the
    actions.

  The container query shows one and hides the other with `display: none`, which also hides it from assistive tech. A
  single definition makes "the stacked rows hold every column" (PR 4's test) true by construction. A brand-order check
  in the primitive or its test (figure columns in the order expected, paid, short) catches a reordering. Mechanics:
  - Both renderings are in the DOM, so `id`s, `htmlFor` and form names in rows (UX-078's forms) need `useId` per
    rendering.
  - `data-*` hooks that e2e locates (`data-case-line`, `data-waiting-month`) appear twice. Give the stacked copy its
    own hook or have specs use `:visible`.
  - Long values get `wrap-anywhere`.

  A CSS-only re-layout (`display: block` on `tr`/`td` with `content: attr(data-label)`) is weaker: browsers have dropped
  table semantics under `display` changes, and the generated labels are read unreliably.

## 6. The guard: every `<table>` inside `ScrollTable` or the stacked layout

**How guards are written here:**
- Source scans in Vitest: `apps/web/src/app/type-scale.test.ts:13-41` (a `readdirSync` walk and regexes over every
  `.tsx`).
- AST scans with the TypeScript compiler: `tools/brand-copy/scan.ts`.
- ESLint `no-restricted-syntax` selectors: `eslint.config.js:37-55,126-146`. There is no local ESLint plugin. In flat
  config, an override's `no-restricted-syntax` **replaces** the list, so each override spreads `...restrictedSyntax`
  again, as 139 and 146 do.

**Tested** (esquery 1.7.0, through ESLint's `Linter`; script `scratchpad/sel.mjs`):
- `JSXElement[openingElement.name.name='table']:not(JSXElement[openingElement.name.name='ScrollTable'] > JSXElement)`
  passes a table that is `ScrollTable`'s direct child.
- It flags a bare table, a table in a `div` inside `ScrollTable`, and a table inside `{cond ? <table/> : null}` within
  `ScrollTable`. The last is acceptable: put the condition outside, so no empty region renders.
- `CallExpression[callee.property.name='createElement'][arguments.0.value='table']` catches `createElement('table')`.

**Most robust: two layers.**
1. **The lint rule** above (and `StackedRows` in the alternation, if it renders its own table), in an `apps/web/**/*.tsx`
   block. It is AST-based and cannot be fooled by a component that receives a table from elsewhere, because it checks
   at the site where the `<table>` JSX is written, which is where the wrapper must be. A source text scan would match
   strings and comments and miss structure.
2. **A rendered check** in `apps/web/e2e/a11y.ts`, next to `sidewaysScroll` (73-96): every `document.querySelectorAll('table')`
   has `closest('[data-slot="scroll-table"], [data-slot="stacked-rows"]')`. Run it inside `atPhoneWidth` (53-67) and
   `expectAccessible`, so every spec that already calls them (8 spec files) covers its routes. This catches what lint
   cannot: a table from a package, or `dangerouslySetInnerHTML`. There is no route registry for "every page route" in
   e2e. ADR 0017's registry (`apps/web/src/lib/routes/`) covers API routes; a per-route visit is audit #103's, so leave
   that as a proposal.

**Exemptions:** an override block listing exact files, each with its reason and the PR that removes it:
- PR #42's `app/console/support/page.tsx` (UX PR 74), `app/settings/organizations/[organizationId]/users/page.tsx`
  (2 tables; UX PR 75) and `app/p/[practiceId]/support-access/[supportGrantId]/page.tsx` (UX PR 76).
- `components/screening/anomalies.tsx` (2 tables; UX PR 4, the same session next), unless PR 3 wraps it, which is a
  one-line change per table.

`app/screening/page.tsx` already passes. A test should fail on an exemption that no longer covers a finding, as
brand-copy's `exemption-unused` does (`scan.ts:570`). ESLint's `reportUnusedDisableDirectives` (`eslint.config.js:123`)
covers only inline comments.

**What the guard makes this PR touch:** 77 tables are not in `ScrollTable` today. After the exemptions, about 71 sites,
not the review's "about 35". These 18 files have unwrapped tables but are **not** in the review's file list:
- `console/billing`*, `console/models`* (2), `console/organizations` (the list), `console/status`*;
- `p/abstraction`, `p/coverage` (2), `p/lines/[lineId]`, `p/mapping/[planId]` (2), `p/releases`, `p/reports`* (2),
  `p/settings/agreements`*, `p/uploads/[documentId]` (4);
- `status`, `support`*;
- `components/models/display.tsx`, `components/releases/content-due.tsx`, `components/reports/roi.tsx`;
- `components/screening/anomalies.tsx` (PR 4's).

The six marked * are ux-forms files. With the five already shared (`console/compliance`,
`console/organizations/[organizationId]`, `p/cases`, `p/settings/pricing`, `components/reconciliation/template-mapper.tsx`),
the overlap with ux-forms grows to 11; whichever merges second keeps both. Some files in the review's list hold no bare
table: `components/pricing/diff.tsx` is already wrapped, and `components/contracts/display.tsx` is a text box.

## 7. Notes and proposals outside this item

- Generalize `content-due.tsx:125-138`'s `Block` (a named, focusable `<pre>` region) into one `ScrollBox` for every
  fixed-height text box. Then the release notes, check problems and cited page (UX-011's text boxes) and content-due
  share one component. Inside scope if the design takes the text boxes; otherwise propose it.
- A per-route `atPhoneWidth` visit from a page-route list (audit #103) is beyond this PR.
- The case page's lines (172-191) could move onto the stacked primitive later. That is UX PR 34's.
- `app/global-error.tsx:10-11` uses `style={{…}}`. That works only because it renders on the client after an error (a
  CSSOM write); a server render would be refused by the CSP. Leave it, but record it in ADR 0078's notes so nobody
  copies it.

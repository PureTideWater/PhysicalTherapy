# 0078. Scroll every wide table in a named region that says it scrolls, and stack rows on a phone through one primitive

- **Status:** accepted (`co-001/ux-table-scroll`, the UX baseline review's third pull request;
  `co-001/ux-screening-result-tables`, its fourth, extends it); amends
  [0056](0056-wear-the-paidwhole-brand-from-one-token-source-self-hosted-fonts-and-status-as-text-on-tint.md) (the
  phone rule of its Chrome paragraph)
- **Date:** 2026-10-27
- **Deciders:** the founder, under the standing rule of 2026-10-18; the co-founder, under the founder's delegation of
  2026-10-25, whose rulings of 2026-10-25 have the build improve as it goes and take each recommended wording and
  visible change without asking; the build (Lane B), for the design review's sixteen findings (DR-01 to DR-16, all
  accepted). Each reversible by the founder
- **PRD sections:** 6 (Cross-cutting: accessibility, keyboard navigation, every screen at a phone's width), 7 (the case
  list's deadline and owner, Claims and lines' status); test matrix TBL-01 to TBL-04 (TBL-05 to TBL-08 for the fourth
  pull request); ADRs 0053 (the Content-Security-Policy) and 0056

## Context

The UX baseline review found that most tables had no scroller a keyboard could reach (UX-011): at 390 px sixty tables
pushed the whole page sideways, so the sticky header and Menu slid away, and fifteen sat in a bare `overflow-x-auto`
box that clipped columns no Tab could reach (a case's Deadline and Owner, a line's Short and Status, an agreement's
SHA-256). The fixed-height text boxes (release notes, the content checker's problems, the cited contract page) had the
same defect. And a table cut off at the card's edge gave no sign that more lay to the right, mid-word or mid-figure
(UX-079); phone scrollbars are hidden at rest. The app's one named, focusable scroller (`ScrollTable`, since PR #50 a
small client component that also says "More columns to the right" while it overflows) held ten tables of 87.

## Decision

**1. One scroller.** Every `<table>` in `apps/web/src` is the direct and only child of `ScrollTable`
(`components/scroll-table.tsx`), and a `ScrollTable` holds nothing else. It takes the table's name as `label`, the
same words as the table's own `aria-label` (or the card title its `aria-labelledby` names), numbered where a page holds
several of one kind ("Fields of rate record 2", "Proposed fields of proposal 1, candidate 2"). It renders three
elements: a state holder (`data-slot="scroll-table"`, `data-scroll="unmeasured|fits|overflows"`, `data-edge-start`,
`data-edge-end`), a frame that does not scroll (`.pw-scroll-frame`, where the cue and the focus outline are drawn), and
the scroller, `relative` (so a visually hidden header stays inside it) and `overscroll-x-contain` (a sideways swipe at
the table's edge is not the browser's back gesture). The table carries a `min-w-[…]` from its columns (about 6rem a
figure, date or count, 8 to 10rem a text column, 12rem a sentence; one of 32, 36, 40, 48 or 54rem; never above 54rem,
so it fits its card at 1280 px with a classic scrollbar: the card's content column is 909 px, 892 px beside a 17 px
scrollbar, and 54rem is 864 px). A table of three or fewer short columns takes none. `wrap-anywhere` goes on long
values (emails, keys, paths, control numbers), never on a figure, code or date.

**2. Its name and tab stop follow the measurement.** On the server and until the browser measures it, the scroller is a
region named "Cases, scrolls sideways" (the table's name, then ", scrolls sideways") with `tabindex="0"`, so it is
reachable without script. In the browser one pure function (`scrollState`, beside the components in
`components/scroll-table.tsx`, with no React and no DOM, so the unit project tests it in node) turns `scrollWidth`,
`clientWidth` and `scrollLeft` into the state: a difference of 1 px or less fits. While the table fits and the scroller
does not hold focus it has no role, name or tab stop; while it overflows, or holds focus, it is the region again.
Holding focus means the scroller itself, never a link or control inside it: React's focus events bubble, so only an
event whose target is the scroller counts, and a table that fits never turns into a region because a link in it took
focus. Focus taken before hydration counts too: the first measurement reads `document.activeElement`, so a keyboard
user who tabbed onto the server's region early keeps it. ResizeObservers on the scroller and its children, a
MutationObserver that observes a child swapped in after mount, and one passive scroll listener coalesced per frame keep
the state current; it is set only when it changes.

**3. The cue.** While columns lie past an edge, a fade 1.5rem wide covers that edge, from the surface's token
(`--pw-scroll-surface`, `--pw-bg` by default; dark follows the tokens) to transparent, drawn by `::before` and
`::after` on the frame above the content (above a sticky cell at z-index 1), with `pointer-events: none`. The
scroller's `scroll-padding-inline` keeps a focused control clear of it (WCAG 2.4.11). While the table overflows, at any
width, the line "Scroll sideways for more columns." stands above it, `aria-hidden` because the region's name says it.
The scroller's focus indicator is a 2 px `--pw-focus` outline on the frame, outside the fades and outside a text box's
clip, and kept under forced colours, which drop a ring drawn as a box shadow. Under forced colours the fades are hidden
and the caption remains; the fades' opacity transition runs only under `prefers-reduced-motion: no-preference`.
Everything is classes and data attributes: never a style attribute, which the CSP refuses, and never a scroll position
written to CSSOM. A table on a surface other than `--pw-bg` sets `--pw-scroll-surface` with a class on its card.

**4. Text boxes.** A fixed-height box of text scrolls in `ScrollBox` (the same file): the same state on the block axis,
named "Release notes of release 900001, scrolls" (its name, then ", scrolls"), top and bottom fades drawn inside its
border from its own surface, no caption. Its text wraps, so it never scrolls sideways: release notes, the content
checker's problems, the cited contract page, and a pricing step's recorded JSON, which `ScrollTable` held until now and
whose summary and name now read "As PaidWhole recorded it".

**5. Stacked rows.** On a phone a working list stacks each row through one server component, `StackedRows`
(`components/stacked-rows.tsx`): a list named by `label` or `labelledBy`; each item a heading at the caller's level
(the naming cell, a link when the row opens something), a definition list of the columns' labels and values, then the
row's actions. Figures and codes are in the mono face with tabular numerals; a status wraps; the primitive never picks
a tone. The fields render in the order given, never reordered: the caller's unit test holds them to the brand's order
with `brandOrderProblems` (expected, paid and short given together and in that order) and reads one constant of column
labels, in order, for the table's headers and for the fields, so the two copies never disagree. With a `table`, both
copies render from one row array, and a container query on a full-width wrapper (`@container w-full min-w-0`, so it
never collapses in a shrink-to-fit parent) shows the table from its own `min-w` up (`stackBelow`, one of the widths of
Decision 1) and the rows below it; `display: none` hides the other copy from assistive technology. Because both are in
the DOM, no `id` and no test hook repeats between them (the stacked copy carries `data-stacked-row` and its own hooks;
`repeatedIds` finds a repeat, and every paired caller's unit test expects none), each row form's copy has its own
request key, and what was typed in one copy does not carry to the other across a resize. An `ActionForm`'s refusal
hand-off (`RefusalTakeover`, `RefusalFallback`) claims focus only when its element is rendered
(`getClientRects().length > 0`), so the hidden copy never takes focus the visible one needs; that change to
`components/action-form.tsx` lands with the review's 34th pull request, the first to render row forms in both copies.
The fourth pull request (the screening result) is the first user.

**6. The guard.** A unit test (`apps/web/src/app/tables.test.ts`) parses every `.ts` and `.tsx` in `apps/web/src` but
tests and test support, and fails on a `<table>` whose parent is not `ScrollTable`, on a `ScrollTable` whose children
are not exactly one `<table>`, on `createElement('table')` or `jsx('table')`, and on a table in markup for
`dangerouslySetInnerHTML`. It knows `ScrollTable` by its import from `components/scroll-table`, under whatever local
name, so a local component of that name does not pass. Its exemptions are the #42 pages (console support, the users
page, support access), each with the pull request that wraps it and its exact count of bare tables; an exemption that
no longer matches fails, and each failure names the line to edit. In the end-to-end suite `atPhoneWidth` also checks
that every rendered table sits in a `ScrollTable`, and before axe runs it waits until every scroller's state agrees
with its measurement (a scroller whose content overflows is a region with a tab stop; one whose content fits, and that
is not focused, is neither), so axe never judges a scroller between a resize and React's commit.

## Alternatives considered

- **Keep the region and its name always** (the review's text). A name that says "scrolls sideways" over a table that
  does not is untrue, and about 80 regions at 1280 px add landmarks that say nothing beyond the tables' names.
- **Count focus anywhere inside the scroller.** A link focused in a table that fits would bring back a region that says
  it scrolls, and a tab stop that was not there a moment before.
- **A 56rem cap**, from a 912 px column. A desktop that always shows scrollbars leaves 892 px, so every table at the cap
  would show the caption and the fade at 1280 px.
- **`background-attachment: local` scroll shadows, CSS only.** They paint under the content: a tinted chip at the edge
  cuts them, and a sticky naming cell's opaque background hides the start shadow entirely.
- **Scroll-driven animations (`animation-timeline: scroll()`)** and **scroll-state container queries** would need no
  script; neither is in every engine the app supports (Firefox lacks the first by default; only Chromium has the
  second).
- **IntersectionObserver sentinels**: a sentinel cannot sit beside a table without changing its layout.
- **A caption below `sm` only**: from 768 to 1023 px the rail leaves a narrower column than at 640 to 767 px, so the
  same table is cut off with no caption.
- **Stacking by viewport breakpoint**: wrong in the same band. **Stacking by CSS alone** (`display: block` on rows with
  `content: attr(data-label)`): browsers drop table semantics under a `display` change and read generated labels
  unreliably. **A generic data-table component** rendering both copies from column definitions: a rewrite of every
  bespoke table (footer sums, PHI columns, badges) for no visible gain.
- **Put the stacked copy's figures in the brand's order at render time.** The table would keep the order its caller
  wrote, so the two copies of one data set would disagree, and a wrong order would be hidden from review.
- **An ESLint selector as the guard**: it cannot fail on a stale exemption, and two lists would drift.
- **jsdom or happy-dom for the scroller's unit test**: neither lays out, so the test would test a mock; the decision is
  a pure function tested in node, and the live behaviour in the browser suite.

## Consequences

- Every table pull request after this one (the review's 34th, 74th to 76th and 85th, and any new table) uses
  `ScrollTable`, and a working list on a phone uses `StackedRows`; the guard enforces the first.
- Without script a scroller is always a named region with a tab stop (an idle stop at 1280 px, the safe failure) and
  shows no cue: never a false one.
- A table's region is announced only while it scrolls; a spec that finds a region by name must allow for the state, and
  uses `exact: true` where a table's name extends another region's ("Version" and "Versions", "Preview" and "Preview
  rows", "Receipts").
- The stacked copy doubles the markup of a stacked list; acceptable for record lists of a page's length.

## Not covered

- The sticky naming cell and the stacked working lists (UX-079 (b) and (c), UX-078), with the refusal hand-off's change
  to `ActionForm`: the review's 34th pull request.
- The #42 pages: the review's 74th to 76th pull requests, which delete their exemptions.
- A per-route phone visit from a page-route registry (audit #103).
- `app/global-error.tsx:10-11` writes `style={{…}}`; it works only because it renders on the client after an error (a
  CSSOM write), and must not be copied.

## Revisit when

- Firefox ships scroll-driven animations by default, or every supported engine ships scroll-state container queries:
  the fades can then be CSS only and show without script.
- A table needs a sticky header row: the fades' z-index and the header's must be set together.

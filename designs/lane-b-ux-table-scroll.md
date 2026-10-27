# co-001/ux-table-scroll: every table scrolls by keyboard and shows that it scrolls, and phones get one stacked-row layout

The UX baseline review's third pull request (`designs/lane-b-ux-review.md` §3 "UX PR 3"; `synthesis/prs.json` order 3).
Closes UX-011 (C-002) outside #42's files, and UX-079 (C-043) part (a): the scroll cue in `ScrollTable`, and the one
stacked-row primitive that parts (b) and (c), UX-005 and UX-078 use. Branch `co-001/ux-table-scroll`, cut from
`claude/build-platform` at e908c21 (worktree `/home/user/ux-table-scroll`). Reserved for it (LANES.md, 2026-10-27
01:35): ADR 0078 (shared with UX PR 4), test-matrix TBL-01 to TBL-04, synth module 17 (TBL).

Sources: the three scouts' reports (scratchpad `design/inventory.md`, `design/mechanics.md`, `design/tests-consumers.md`),
the review's entries UX-011 (uxreview.md:1781) and UX-079 (:2997), and the code at e908c21. The review's evidence was
at 4d99df8; PRs #49 to #56 and #48 have merged since, and every line below was re-read at e908c21. Synthetic data only.

Every choice below is the recommended one, taken under the founder's standing rule (accuracy, quality, user
experience, accessibility, security and privacy, reliability, maintainability; never weighted by build effort) and,
for wording and visible changes, within `.claude/rules/brand.md` and CO-11 without asking. Where this design departs
from the review's fix text, the departure and its reason are stated where it is made (summarised in section 1.6).

**After the design review (2026-10-27 14:20 UTC):** the one adversarial design review (wf_76fa3626-8c5,
`designs/lane-b-ux-table-scroll-review.json`: build with changes, no migration, 16 findings) is folded in at the end, in
section 12. **Where section 12 and an earlier section disagree, section 12 wins.**

## Contents

1. Scope: what closes, every site, the files, what is left for later PRs
2. `ScrollTable` and `ScrollBox`: final behaviour
3. The stacked-row primitive (`StackedRows`)
4. The guard: every `<table>` inside `ScrollTable`
5. Tests: TBL-01 to TBL-04, unit, e2e, axe, counts
6. ADR 0078 (text) and ADR 0056's pointer
7. No migration; overlaps; what the PR description says
8. Screenshots for the UX and brand review; the second adversarial review's lens
9. Build slices and their order
10. Risks and open points, each with its answer
11. Proposals outside this PR (improve as you go)
12. After the design review: the 16 findings, each accepted, and what changes

---

## 1. Scope

### 1.1 What closes

- **UX-011 (C-002), every part outside #42's files.** Every data table in `apps/web/src` that is not in a #42 file scrolls
  inside one component, `ScrollTable`: a region the keyboard reaches and whose name says it scrolls, `relative` (ADR
  0056:52), its table given a `min-w-[…]` per its columns and `wrap-anywhere` on long values. The four fixed-height text
  boxes the review names (check problems, release notes twice, the cited contract page) and content-due's existing
  block become one `ScrollBox` with the same treatment on the vertical axis. The unnamed receipts table gets a name. A
  unit guard fails on any `<table>` outside `ScrollTable`, with the #42 pages exempt by name until UX PRs 74 to 76.
- **UX-079 (C-043) part (a).** `ScrollTable` shows that it scrolls: edge fades in token colours at whichever edge has
  columns past it, and the visible caption "Scroll sideways for more columns." while it overflows. The stacked-row
  primitive (`apps/web/src/components/stacked-rows.tsx`) ships with its unit test, ready for UX PR 4 (the screening
  result, UX-005), UX PR 34 (UX-079 (b) and (c), UX-078) and UX PR 85 (the screening template's reference).

Not closed here: the three #42 pages (UX PRs 74, 75, 76), the sticky naming cell and the stacked working lists
(UX PR 34), the screening result's stacked rows (UX PR 4), the screening template's stacked reference (UX PR 85),
and a per-route phone visit from a route registry (audit #103; proposal P4).

### 1.2 What `ScrollTable` already does at e908c21 (re-checked)

`apps/web/src/components/scroll-table.tsx:1-54` is no longer the review's bare scroller (PR #50, commit 2eb464b9): it is
`'use client'`, `relative min-w-0 max-w-full overflow-x-auto` with a focus ring, `role="region"`, `aria-label="<label>,
scrolls sideways"`, `tabIndex={0}` always, and a ResizeObserver that shows "More columns to the right: scroll the table
sideways." above the scroller while it overflows (`data-state="scrolls-sideways"`, `aria-hidden`). Left to do: the tab
stop follows the measurement, the edge fades, the caption's words, re-observing a swapped child, a 1 px threshold,
focus safety, and the rollout. It is used by 10 tables in 9 files (one is #42's `app/screening/page.tsx:94`, which
must keep working with the unchanged `label` and `children` props) and by one `<pre>` (`pricing/line-words.tsx:117`).

### 1.3 The census at e908c21

87 `<table>` elements outside tests: 10 in `ScrollTable`, 2 in hand-rolled regions (`screening/anomalies.tsx`), 15 in a
bare `overflow-x-auto` div, 60 with no scroller. Four of the 60 are in #42 files. So this PR wraps **73 tables** (15 bare
scrollers, 56 with none, the 2 hand-rolled regions) and adds a `min-w` to 5 tables already in `ScrollTable`, in 55
source files besides the component; plus 5 text boxes. The review's "about 35 sites" counted only the cited lines; the guard (section 4) makes every
table this PR's.

### 1.4 Every site

Columns: **Label** is the `ScrollTable` label (the region reads "<Label>, scrolls sideways"); it equals the table's own
`aria-label` unless the row says otherwise, and the label is passed once for both, as `pricing/location.tsx:13-14`
does. **min-w** goes on the `<table>` (`w-full min-w-[…] text-left text-sm`); "none" means three or fewer short columns,
which fit 358 px. **Wrap** names the cells that get `wrap-anywhere` (Tailwind 4.3.3's `overflow-wrap: anywhere`, which
also lowers a cell's min-content width, so a long email or key no longer sets the column's width). **Was** is the
wrapper today: OV a bare `overflow-x-auto` div (removed), NONE no scroller, ST already `ScrollTable`, RG a hand-rolled
region. UXF marks a file ux-forms also changes (section 7.2).

The min-w values follow one rule, recorded in ADR 0078: the width at which no header breaks into more than two lines
and no figure, date or code breaks at all, from about 6rem per figure, date or count column, 8 to 10rem per text
column and 12rem for a sentence column, rounded up to one of 32, 36, 40, 48 or 56rem, and **never above 56rem**, so
every table still fits its card at 1280 px (the content column inside a card is 1280 − 256 rail − 64 main padding − 48
card padding = 912 px = 57rem), which `layout-1280.spec.ts` checks for Fields, Line schedule and Claims and lines.
The builder confirms each value on the 390 px screenshot (headers on two lines at most) and adjusts within the rule.

**Practice pages (`apps/web/src/app/p/[practiceId]/…`)**

| File:line | Was | Label | min-w | Wrap | Notes |
|---|---|---|---|---|---|
| `page.tsx:438-439` | OV | Agreements | 40rem | Signer | the practice home |
| `cases/page.tsx:242-243` | OV | Cases | 56rem | Owner | UXF |
| `claims/page.tsx:134-135` | OV (on `CardContent`) | Claims and lines | 56rem | the claim control numbers, patient reference | drop `relative overflow-x-auto` from `CardContent` |
| `anomalies/page.tsx:58-59` | OV | Flagged lines | 48rem | payer claim control number | |
| `anomalies/page.tsx:162-163` | OV | Anomaly cohorts | 56rem | | |
| `abstraction/ledger/page.tsx:48-49` (`Entries`, used :144 and :155) | OV | `{label}` ("Entries of the line", "Ledger entries") | 56rem | Written by | the correction form column stays (UX-078 / UX PR 13) |
| `abstraction/page.tsx:100` | NONE | Versions in progress | 40rem | Contract | not in prs.json (added) |
| `cases/[caseId]/packet/page.tsx:570-571` | OV | Versions | 56rem | writer, approver | `Hash` keeps `break-all` |
| `packet-reviews/page.tsx:48-49` (`ExportTable`, :100 and :111) | OV | `{label}` | 48rem | | |
| `reconciliation/page.tsx:144-145` (`EntryTable`, :210 and :462) | OV | `{label}` | 56rem | Written by, Reason | |
| `reconciliation/page.tsx:306` | NONE | Exports | 36rem | | |
| `settings/pricing/page.tsx:137-138` | OV | Places of service in effect | none | | UXF |
| `contracts/page.tsx:91` | NONE | Contracts | 56rem | Plans | |
| `contracts/page.tsx:148` | NONE | Calendar | 36rem | Note | |
| `contracts/[contractId]/page.tsx:53` | NONE | Versions | 48rem | Approved, Signed off | |
| `mapping/page.tsx:109` | NONE | Payers and plans | 56rem | Plan (a plan key) | |
| `mapping/[planId]/page.tsx:101` | NONE | Agreement resolution | 32rem | | not in prs.json (added) |
| `mapping/[planId]/page.tsx:202` | NONE | Mappings | none | Mapped by | not in prs.json (added) |
| `remittances/page.tsx:71` | NONE | Remittances | 48rem | Trace | |
| `remittances/[remittanceId]/page.tsx:107` | NONE | Provider adjustments | 36rem | Reference | |
| `remittances/[remittanceId]/page.tsx:145` | NONE | Claims | 56rem | Claim control numbers | |
| `pricing-runs/[runId]/page.tsx:428-429` | ST, 40rem | Run lines | 40rem | | **no change** (removed from the files) |
| `reports/roi/page.tsx:63` | NONE | ROI statements | 48rem | Generated by | |
| `reports/page.tsx:239` | NONE | Generated reports | 36rem | | UXF; not in prs.json (added) |
| `reports/page.tsx:287` | NONE | Exports | none | By | UXF; added |
| `settings/access-log/page.tsx:46` | NONE | Access log | 48rem | Who, Record | |
| `settings/agreements/page.tsx:92` | NONE | Grants | 40rem | Roles | UXF; added |
| `coverage/page.tsx:245` | NONE | Plans waiting on mapping | 48rem | Plan | added |
| `coverage/page.tsx:296` | NONE | Unpriced reasons and their remedies | 40rem | | added |
| `lines/[lineId]/page.tsx:240` | NONE | Adjustments | 32rem | | added |
| `releases/page.tsx:154` | NONE | Rule releases | 32rem | | added |
| `uploads/[documentId]/page.tsx:102` | NONE | Transaction sets | 40rem | | added |
| `uploads/[documentId]/page.tsx:135` | NONE | Errors | none | What | added |
| `uploads/[documentId]/page.tsx:176` | NONE | Payments | 40rem | Payment | added |
| `uploads/[documentId]/page.tsx:212` | NONE | Holds | none | | added |

**Account, public and console pages (`apps/web/src/app/…`)**

| File:line | Was | Label | min-w | Wrap | Notes |
|---|---|---|---|---|---|
| `settings/billing/[organizationId]/page.tsx:133` | NONE | Invoices | 40rem | Invoice | review cited :126 |
| `support/page.tsx:63` | NONE | Tickets | 32rem | Subject | UXF; added |
| `status/page.tsx:34` | NONE | Components | none | | public; added; fits at 390 (so it renders as a plain box there) |
| `console/prospects/page.tsx:50` | NONE | Audit requests | 56rem | Contact, Payers | |
| `console/tickets/page.tsx:46` | NONE | Tickets | 56rem | From, Message | |
| `console/specialist-queue/page.tsx:81` | NONE | Practices | 56rem | | |
| `console/compliance/page.tsx:159` | NONE | Policies | 36rem | the policy file path | UXF |
| `console/compliance/page.tsx:200` | NONE | Evidence records | 40rem | Subject, Reference | UXF |
| `console/terms/page.tsx:31` | NONE | Terms versions | 40rem | Document | |
| `console/rule-releases/page.tsx:59` | NONE | Rule releases | 56rem | | |
| `console/rule-releases/page.tsx:115` | NONE | Affected runs by practice | 48rem | | |
| `console/rule-releases/page.tsx:164` | NONE | Drafts | 40rem | Draft file | |
| `console/screening/page.tsx:82-83` | OV | Approved splits (the card title; the table keeps `aria-labelledby`) | 40rem | By | |
| `console/organizations/page.tsx:51` | NONE | Organizations | 32rem | | added |
| `console/organizations/[organizationId]/page.tsx:133` | NONE | Members | 40rem | Email | UXF |
| `console/organizations/[organizationId]/page.tsx:191` | NONE | Invitations | 40rem | Email | UXF |
| `console/organizations/[organizationId]/page.tsx:236` | NONE | Agreements | 56rem | Reference | UXF |
| `console/organizations/[organizationId]/page.tsx:305` | NONE | Grants | 48rem | Roles admitted | UXF |
| `console/billing/page.tsx:49` | NONE | Billing status | 40rem | | UXF; added |
| `console/models/page.tsx:93` | NONE | Model flags | none | Applies to | UXF; added |
| `console/models/page.tsx:120` | NONE | Model spend by practice | 36rem | | UXF; added |
| `console/status/page.tsx:60` | NONE | Components | none | | UXF; added |

**Components (`apps/web/src/components/…`)**

| File:line | Was | Label | min-w | Wrap | Notes |
|---|---|---|---|---|---|
| `packets/display.tsx:138-139` (`LineSchedule`) | ST | Line schedule | **56rem** (12 columns, none today) | Claim | added (UX-079 lists it) |
| `packets/calculation-words.tsx:76-77` (`WorksheetView`) | ST | unchanged | **32rem** | | added; `calculation-words.test.tsx:91` pin updated |
| `packets/pricing.tsx:81-82` (`PricingNowPanel`) | ST | unchanged | **48rem** | | added |
| `pricing/display.tsx:504-505` (`UnpricedReasons`) | ST | unchanged | **32rem** | | added |
| `pricing/display.tsx:549-550` (`PatternTable`) | ST | unchanged | **48rem** | Payer and plan (a plan key) | added |
| `pricing/content.tsx:20`, `pricing/location.tsx:13`, `pricing/diff.tsx:284` | ST, 36/36/40rem | unchanged | unchanged | | **no change** (`diff.tsx` removed from the files; `diff.test.tsx` changes instead) |
| `contracts/review.tsx:240-241` (`ReviewBody`) | OV | **"Fields of record N"** (N = `index + 1`, as the card title shows it), table name the same | 32rem | the field's value, approver | was "Fields" on every record; `layout-1280.spec.ts:168` finds it by `name: 'Fields'`, which still matches |
| `models/display.tsx:100` (`CandidateCard`) | NONE | **"Proposed fields of candidate N"** | 48rem | As written, Page and quote | added; was "Proposed fields" on every candidate |
| `reports/display.tsx:124-125` (`Table`, 7 uses) | OV | `{caption}` (the table keeps its sr-only `<caption>` and gains `aria-label={caption}`) | by column count, from a literal map: up to 3 none, 4 32rem, 5-6 40rem, 7-8 48rem, 9+ 56rem | Pattern | |
| `reports/documents.tsx:66` | NONE | Unpriced reasons and their remedies | 32rem | | |
| `reports/documents.tsx:110` | NONE | Plans waiting on mapping | 32rem | Plan | |
| `reports/documents.tsx:171` | NONE | Lines by stage | 32rem | | |
| `reports/documents.tsx:234` | NONE | Stages by payer | 48rem | | |
| `reports/documents.tsx:278` | NONE | Packets approved by their own writer | 40rem | Packet version (a UUID) | |
| `reports/roi.tsx:49` (`RoiFigure`) | NONE | `Entries of ${label}` (unchanged) | 32rem | | added |
| `reconciliation/template-mapper.tsx:173-174` | OV | Preview rows | 48rem | Check or trace | UXF |
| `uploads/receipts.tsx:145` (`ReceiptList`) | NONE, **unnamed** | `{title}` ("Receipts", "Files in this zip"); the table gains `aria-label={title}` | 48rem | | names the unnamed table (UX-011) |
| `releases/note.tsx:31` | NONE | Changes by record type | 32rem | | |
| `releases/note.tsx:53` | NONE | Records that differ | 36rem | Record | |
| `releases/content-due.tsx:145` | NONE | Content due by family | none | | added |
| `screening/coverage.tsx:61-62` | OV | Coverage, and the rows missing a contract (card title; table keeps `aria-labelledby`) | 40rem | | |
| `screening/anomalies.tsx:286-287` | RG | Anomalies by code and payer product (card title) | 56rem | | added; the region's `data-scroll` hook goes (only `result.test.tsx:479` reads it) |
| `screening/anomalies.tsx:359-360` | RG | Rows with the largest differences (card title) | 56rem | | added; same |

Why `anomalies.tsx` is wrapped here although it is UX PR 4's file: so that the guard's exemptions are #42 files only;
the change is two wrappers and their two pins in `result.test.tsx`, and UX PR 4 (the same session, next) builds its
stacked rows on top. UX PR 4 then owns both files from there.

**Fixed-height text boxes (`ScrollBox`, section 2.8)**

| File:line | Box today | Label (the region reads "<Label>, scrolls") |
|---|---|---|
| `app/console/rule-releases/page.tsx:198` | `<pre max-h-96 overflow-auto>`, no role, name or stop | What the content checker found |
| `app/console/rule-releases/page.tsx:216` | `<pre>` in `<details>`, per prepared release | `Release notes of ${the release's identifier as its row shows it}` |
| `components/releases/note.tsx:94` | `<pre>` in `<details>` | `Release notes of ${note's release number}`; "Release notes" when the note has none |
| `components/contracts/display.tsx:91` (`CitedPageView`) | `<div max-h-[32rem] overflow-auto data-page-text>` | `Page ${n} of the contract` (n as the view's own page heading shows it) |
| `components/releases/content-due.tsx:125-136` (`Block`) | already a named, focusable `<pre role=region>` | its labels unchanged, now through `ScrollBox` (so the name gains ", scrolls" and the stop follows the measurement); `content-due.test.tsx:64-65` updated |

`pricing/line-words.tsx:117-119` (`Recorded`, a JSON `<pre>` in `ScrollTable`) keeps `ScrollTable` (it scrolls sideways);
its height is audit #38's.

**Left out**

| Site | Why |
|---|---|
| `app/console/support/page.tsx:65` | #42 file; UX PR 74; guard exemption |
| `app/settings/organizations/[organizationId]/users/page.tsx:51, :119` | #42 file; UX PR 75; guard exemption (2 tables) |
| `app/p/[practiceId]/support-access/[supportGrantId]/page.tsx:45` (unnamed) | #42 file; UX PR 76; guard exemption; UX PR 76 also names it |
| `app/screening/page.tsx:94-95` | #42 file, already `ScrollTable`: it gains the cue with no edit; its stacked reference is UX PR 85 |
| `components/shell.tsx:324` (the menu drawer, `overflow-y-auto`) | navigation, not data; #42 file |
| layout tables | none exist: no `<table>` is used for layout (re-checked). Tables without a `<thead>` (Policies, both Components, Fields, Content due) are data tables with row headers and are wrapped |

### 1.5 The files, against prs.json order 3

**Added** to prs.json's list (each holds a table or box this PR must change, or is a support file):
- pages: `p/[practiceId]/abstraction/page.tsx`, `p/[practiceId]/coverage/page.tsx`, `p/[practiceId]/lines/[lineId]/page.tsx`,
  `p/[practiceId]/mapping/[planId]/page.tsx`, `p/[practiceId]/releases/page.tsx`, `p/[practiceId]/reports/page.tsx` (UXF),
  `p/[practiceId]/settings/agreements/page.tsx` (UXF), `p/[practiceId]/uploads/[documentId]/page.tsx`, `support/page.tsx`
  (UXF), `status/page.tsx`, `console/organizations/page.tsx`, `console/billing/page.tsx` (UXF), `console/models/page.tsx`
  (UXF), `console/status/page.tsx` (UXF);
- components: `models/display.tsx`, `reports/roi.tsx`, `releases/content-due.tsx`, `screening/anomalies.tsx`,
  `packets/display.tsx`, `packets/calculation-words.tsx`, `packets/pricing.tsx`, `pricing/display.tsx`;
- new: `components/scroll-state.ts`, `components/stacked-rows.test.tsx`, `app/tables.test.ts`, `e2e/tables-phone.spec.ts`,
  `docs/adr/0078-…md`, `fixtures/synthetic/TBL-01..04/expected.json` (generated);
- tests whose pins move: `components/scroll-table.test.tsx`, `components/pricing/display.test.tsx`,
  `components/pricing/diff.test.tsx`, `components/pricing/line-words.test.tsx`, `components/packets/calculation-words.test.tsx`,
  `components/screening/result.test.tsx`, `components/releases/content-due.test.tsx`;
- e2e: `e2e/layout-1280.spec.ts`, `e2e/journeys.ts`, `e2e/reconciliation.spec.ts`, `e2e/reports.spec.ts`,
  `e2e/packets.spec.ts`, `e2e/onboarding.spec.ts`, `e2e/models.spec.ts`, `e2e/uploads.spec.ts`, `e2e/unattested.spec.ts`;
  `scripts/synthetic-personas.ts` (UXF; three personas, section 5.4);
- docs and synth: `docs/adr/0056-…md` (UXF), `docs/product/test-matrix.md`, `packages/synth/src/cases/matrix.ts`,
  `registry.ts`, `common.ts`, `packages/synth/src/expected/types.ts` (the shared documents; #42 and ux-forms touch some).

**Removed** from prs.json's list: `components/pricing/diff.tsx` and `app/p/[practiceId]/pricing-runs/[runId]/page.tsx`
(already `ScrollTable` with `min-w-[40rem]` since PR #50: no source change; only `diff.test.tsx`'s pins move).

**Kept** as listed: everything else in order 3 (`scroll-table.tsx`, `brand.css`, `a11y.ts`, `stacked-rows.tsx` new, and
the 33 page and component files), each with a site in 1.4.

No #42 file is in the list (checked against `pr42-files.txt`: none of the files above is in it, apart from the shared
`docs/product/test-matrix.md` and `packages/synth/src/cases/{matrix,registry}.ts`, which the rules allow).

### 1.6 Where this design departs from the review's fix text, and why

1. **While its table fits, the scroller is a plain box: no role, no name, no tab stop** (the review: "keeps
   `role="region"` and its name always"). A name that says "scrolls sideways" over a table that does not scroll is
   untrue (4.1.2), and a region per fitting table adds landmarks that say nothing beyond the table's own name: about
   80 across the app at 1280. Dropping the suffix instead would leave "Cases region, Cases table". The server still
   renders the region, so it is never unreachable (the review's own condition).
2. **The fades are overlays drawn from data attributes the component sets, not `background-attachment: local`** (the
   review's technique). Local backgrounds paint under the content: a status chip at the edge cuts the shadow, and UX
   PR 34's sticky naming cell, which needs an opaque background, would cover the left fade entirely. Without script
   the overlay shows no fade, which is the absence of a cue, never a wrong one; the server-rendered name still says
   it scrolls.
3. **The caption shows at any width while the table overflows, not only below `sm`.** From 768 to 1023 px the rail
   takes 256 px and the content column is about 448 px, narrower than at 640 to 767 px, so the same table is cut off
   where a `sm` rule would hide its caption. The measurement, not a breakpoint, is the truth.
4. **The words are "Scroll sideways for more columns."** (the review's, as a sentence, replacing today's "More columns to
   the right: scroll the table sideways."), true at either edge (today's "to the right" is false once scrolled to the
   end), and right for touch, wheel and keys.
5. **The stacked primitive pairs with its table by a container query, not a viewport breakpoint**, for the same
   768-1023 px reason; its threshold is the table's own `min-w`.

---

## 2. `ScrollTable` and `ScrollBox`: final behaviour

### 2.1 Markup

```html
<!-- server render, and the client's first render (state "unmeasured") -->
<div data-slot="scroll-table" data-scroll="unmeasured" class="min-w-0 max-w-full">
  <div class="pw-scroll-frame">
    <div role="region" aria-label="Cases, scrolls sideways" tabindex="0" data-scroller=""
         class="relative min-w-0 max-w-full overflow-x-auto overscroll-x-contain rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <table class="w-full min-w-[56rem] text-left text-sm" aria-label="Cases">…</table>
    </div>
  </div>
</div>

<!-- in the browser, while the table is wider than its scroller (and scrolled to the start) -->
<div data-slot="scroll-table" data-scroll="overflows" data-edge-end="" class="min-w-0 max-w-full">
  <p aria-hidden="true" data-state="scrolls-sideways" class="mb-1 text-xs text-muted-foreground">Scroll sideways for more columns.</p>
  <div class="pw-scroll-frame">
    <div role="region" aria-label="Cases, scrolls sideways" tabindex="0" class="…same…"><table …/></div>
  </div>
</div>

<!-- in the browser, while it fits and is not focused -->
<div data-slot="scroll-table" data-scroll="fits" class="min-w-0 max-w-full">
  <div class="pw-scroll-frame">
    <div class="…same…"><table …/></div>
  </div>
</div>
```

- Three elements, each with one job: the outer `div[data-slot="scroll-table"]` carries the state (what CSS, the guard's
  rendered check and the specs read) and holds the caption above the frame; the frame `.pw-scroll-frame` is the box
  that does not scroll, on which the fades are drawn; the inner `div` is the scroller and the region. The `<table>`
  stays the scroller's **direct child**, so `layout-1280.spec.ts`'s `placement()` (`table.parentElement` is the
  scroller, :51-64) keeps working unchanged.
- The scroller keeps `relative` (ADR 0056:52): a visually hidden header cell (`sr-only`, absolutely positioned) is
  clipped with the table instead of widening the page (UX confirm of PR #50, NEW-A).
- `overscroll-x-contain` is new: a sideways swipe that reaches the table's edge no longer turns into the browser's
  back or forward gesture (iOS Safari, Android Chrome).
- The `label` and `children` props are unchanged, so `app/screening/page.tsx` (#42) gains the cue with no edit.
- `min-w-0 max-w-full` moves to the outer element (the flex or grid child) and stays on the scroller too; the class
  string on the scroller still begins `relative min-w-0 max-w-full overflow-x-auto `.

### 2.2 The state: three values, from one pure function

`apps/web/src/components/scroll-state.ts` (new, no `'use client'`, no React):

```ts
export type Overflow = 'unmeasured' | 'fits' | 'overflows';
export interface ScrollMeasure { readonly scrollSize: number; readonly clientSize: number; readonly offset: number }
export interface ScrollState { readonly overflow: Overflow; readonly start: boolean; readonly end: boolean }

/** The scroller's state from one measurement; null before the browser has measured it. A difference of 1 px or less
 *  is rounding at a zoom factor, not overflow. `offset` is the scroll position's magnitude (Math.abs, so a right-to-left
 *  scroller's negative scrollLeft reads the same). */
export function scrollState(measure: ScrollMeasure | null): ScrollState;

/** The scroller's role, name and tab stop: a region named "<label><suffix>" with tabindex 0 while unmeasured (the
 *  server and the first client render), while it overflows, and while it holds focus; nothing while it fits. */
export function regionProps(state: ScrollState, focused: boolean, label: string, suffix: ', scrolls sideways' | ', scrolls'):
  { readonly role?: 'region'; readonly 'aria-label'?: string; readonly tabIndex?: 0 };

/** The outer element's data attributes: data-scroll always; data-edge-start / data-edge-end ("") only while columns
 *  lie past that edge. */
export function frameData(state: ScrollState): Readonly<Record<`data-${string}`, string>>;
```

Rules: `fits` when `scrollSize - clientSize <= 1`; else `overflows`, with `start = offset > 1` and
`end = offset + clientSize < scrollSize - 1`. `unmeasured` has `start` and `end` false.

Why three values, not today's boolean: without script (or before hydration) the scroller must behave as "overflows"
for its tab stop and name (never unreachable) and as "fits" for the caption and fades (nothing claims overflow over a
table that fits). One boolean cannot say both.

### 2.3 The client wiring (`scroll-table.tsx`)

- `useState<ScrollState>(scrollState(null))`, `useState(false)` for focus.
- One `useEffect` on mount:
  - `measure()` reads `scrollWidth`, `clientWidth`, `scrollLeft` (block axis for `ScrollBox`: `scrollHeight`,
    `clientHeight`, `scrollTop`) and sets the state **only when it changes** (compare the three fields), so a scroll
    does not re-render the table on every frame.
  - A `ResizeObserver` on the scroller and on each element child; a `MutationObserver({ childList: true })` on the
    scroller that observes each added child and unobserves each removed one (today's observer, :29-31, misses a table
    swapped after mount: a re-keyed table or a filter that renders a new `<table>`, whose `scrollWidth` change does
    not resize the scroller's own box). No inner `w-max` wrapper to observe: it would size a `w-full` table to its
    max-content width and stop its cells wrapping.
  - One passive `scroll` listener on the scroller, coalesced to one `measure()` per animation frame.
  - The cleanup disconnects both observers, removes the listener and cancels a pending frame.
- `onFocus` sets focused; `onBlur` clears it and measures. While focused, `regionProps` keeps the role, name and tab
  stop even if a resize makes the table fit, so focus is never pulled out from under the person (2.4.3, 2.4.7); the
  stop goes on the next measurement after blur.
- No `style` is ever written, by attribute or CSSOM. React patches the attributes in place when the state changes; the
  table is never remounted.
- A state change after hydration is an update, never a hydration mismatch: the server and the first client render are
  both `unmeasured`.

### 2.4 The edge fades (`apps/web/src/app/brand.css`)

Plain classes beside `.pw-money` and `.pw-status-*` (brand.css is imported `layer(base)`, so these are base-layer rules;
no utility on the frame sets `position` or `background`, and nothing else is put on the frame):

```css
/* A wide table's scroll cue (docs/adr/0078): a fade at each edge past which columns lie, drawn over the content
   from the state ScrollTable sets; never a style attribute (the CSP). */
.pw-scroll-frame {
  position: relative;
  --pw-scroll-fade: 1.5rem;
}
.pw-scroll-frame::before,
.pw-scroll-frame::after {
  content: '';
  position: absolute;
  inset-block: 0;
  width: var(--pw-scroll-fade);
  pointer-events: none;
  opacity: 0;
  z-index: 2; /* above a sticky naming cell (UX PR 34 gives it z-index 1) */
}
.pw-scroll-frame::before {
  inset-inline-start: 0;
  background: linear-gradient(to right, var(--pw-scroll-surface, var(--pw-bg)), transparent);
}
.pw-scroll-frame::after {
  inset-inline-end: 0;
  background: linear-gradient(to left, var(--pw-scroll-surface, var(--pw-bg)), transparent);
}
[data-edge-start] > .pw-scroll-frame::before,
[data-edge-end] > .pw-scroll-frame::after { opacity: 1; }
/* Keep a focused link or control clear of the fades (WCAG 2.4.11). */
.pw-scroll-frame > [data-scroller] { scroll-padding-inline: var(--pw-scroll-fade); }
@media (prefers-reduced-motion: no-preference) {
  .pw-scroll-frame::before, .pw-scroll-frame::after { transition: opacity 150ms ease-out; }
}
/* Forced colours: no gradient (its colours would not be the system's); the caption says it scrolls. */
@media (forced-colors: active) {
  .pw-scroll-frame::before, .pw-scroll-frame::after { display: none; }
}
/* Print: every column on the page, no fade. */
@media print {
  .pw-scroll-frame::before, .pw-scroll-frame::after { display: none; }
  .pw-scroll-frame > [data-scroller] { overflow: visible; }
}
```

(The scroller carries `data-scroller=""` for these two selectors; `ScrollBox` uses the same frame with
`--pw-scroll-fade` on the block axis, section 2.8.)

- **Colour, light and dark.** The fade runs from the surface the table sits on to transparent. Every table sits on a
  card (`bg-card` = `--pw-bg`, `packages/ui/src/styles.css`) or on the page (`html { background: var(--pw-bg) }`): the
  same token, White (`--pw-white`) in light and `#0B1626` in dark (`packages/brand/src/tokens.css:25,75`). Dark
  follows by itself: the tokens switch under `:root[data-theme="dark"]` and `.dark` (D9 item 3; no
  `prefers-color-scheme` rule), and the fade reads the variable. `--pw-scroll-surface` is the one override, set by
  `ScrollBox` to `--pw-bg-raised` (the muted surface). No hex anywhere (`tools/brand-colors` passes).
- **Over cell backgrounds and sticky headers.** The pseudo-elements sit on the frame, above the scroller and
  everything in it (`z-index: 2`), so a status chip's tint at the edge fades with the text, and a sticky cell (none
  today; UX PR 34's naming cell at `z-index: 1`) is covered at the start edge only while columns lie past it. No
  table at e908c21 has zebra rows, a sticky header or a cell background (re-checked).
- **Pointer and touch** pass through (`pointer-events: none`): a link under a fade is still clickable.
- **The brand.** BRAND.md:147-149's "no gradients, shadows" is about the mark and lockup (the review, UX-079 Notes); a
  surface-to-transparent fade is neither a shadow nor a coloured gradient.

### 2.5 The caption

- **Words:** "Scroll sideways for more columns." (section 1.6, item 4). The brand-copy lint has no rule on it
  (`tools/brand-copy/scan.ts:119-129`); a full sentence with a full stop is the app's helper-line style.
- **When:** only while `overflow === 'overflows'`, at any width (1.6, item 3); never on the server.
- **Where:** above the frame, `mb-1 text-xs text-muted-foreground`, so it is read before the cut-off; `--pw-fg-muted` on
  `--pw-bg` meets 4.5:1 in both themes (the tokens' own pairing, used for every helper line).
- **aria:** `aria-hidden="true"`: the region's name already says "scrolls sideways", and only while it does, so a
  screen reader hears it once. Keeps `data-state="scrolls-sideways"`, which `pricing.spec.ts:197,211,216` reads.
- **Forced colours:** the caption is text, so it is shown in the system's colours: the cue that remains there.

### 2.6 `min-w` and long values

The `min-w-[…]` goes on the `<table>`, never on the frame or scroller (section 1.4 for the values and the rule).
Tailwind generates arbitrary values it finds written out in source, so every value is a literal class (the
reports `Table`'s by-column-count map included). `wrap-anywhere` goes on the cells named in 1.4, not on the table,
so figures and codes never break.

### 2.7 The props API

```ts
export function ScrollTable(props: { readonly label: string; readonly children: ReactNode }): ReactElement;
```

Unchanged on purpose. `label` is required and non-empty (an empty label throws, and a test asserts it, so a nameless region is
impossible; every label is a literal or a constant, so the throw can only meet a developer); it names the table, and the component adds ", scrolls sideways". No `minWidth` prop
(the width belongs to the table and stays visible at the site, as `location.tsx` shows) and no caption override (one
sentence everywhere is the point of a cue). No `className` passthrough either: the frame must carry nothing that sets
`position` or `background`.

### 2.8 `ScrollBox`: the fixed-height text boxes

Exported from the same file, built on the same state function on the block axis:

```ts
export function ScrollBox(props: {
  readonly label: string;                       // region reads "<label>, scrolls"
  readonly height?: 'md' | 'lg';                // max-h-96 (default) | max-h-[32rem]
  readonly tone?: 'muted' | 'faint';            // bg-muted (default) | bg-muted/30 (the cited page)
  readonly as?: 'pre' | 'div';                  // pre (default; whitespace-pre-wrap font-mono text-xs) | div
  readonly children: ReactNode;
} & Readonly<Record<`data-${string}`, string | undefined>>): ReactElement;
```

- The same three elements: `div[data-slot="scroll-box"][data-axis="block"]` (the state) > `.pw-scroll-frame` (here it
  carries the box's `rounded-md border` and `overflow-hidden`, so the fades are drawn inside the border and never
  paint over it) > the region (`max-h-… overflow-auto p-3`, the tone's background, the focus ring; `whitespace-pre-wrap
  font-mono text-xs` when `as="pre"`), named "<label>, scrolls" (the review's "Release notes, scrolls"), with the same
  three-state tab stop and the same focus rule. The focus ring is drawn on the region inside the frame's border
  (`ring-inset`), so `overflow-hidden` on the frame cannot clip it.
- Fades on the block axis: `data-edge-start` / `data-edge-end` set from `scrollTop`; the frame's pseudo-elements become
  top and bottom bands (`[data-axis="block"] > .pw-scroll-frame` swaps `inset-block` for `inset-inline` and the gradients'
  direction; the CSS below), coloured from `--pw-scroll-surface`, which `ScrollBox` sets with the literal class
  `[--pw-scroll-surface:var(--pw-bg-raised)]` for `muted`; for `faint` it sets the mix the box shows,
  `[--pw-scroll-surface:color-mix(in_srgb,var(--pw-bg-raised)_30%,var(--pw-bg))]`. A custom property set by a class is
  not a style attribute; the CSP holds.
  ```css
  [data-axis="block"] > .pw-scroll-frame::before,
  [data-axis="block"] > .pw-scroll-frame::after { inset-inline: 0; width: auto; height: var(--pw-scroll-fade); }
  [data-axis="block"] > .pw-scroll-frame::before { inset-block: 0 auto; background: linear-gradient(to bottom, var(--pw-scroll-surface, var(--pw-bg)), transparent); }
  [data-axis="block"] > .pw-scroll-frame::after { inset-block: auto 0; background: linear-gradient(to top, var(--pw-scroll-surface, var(--pw-bg)), transparent); }
  [data-axis="block"] > .pw-scroll-frame > [data-scroller] { scroll-padding-inline: 0; scroll-padding-block: var(--pw-scroll-fade); }
  @media print { [data-axis="block"] > .pw-scroll-frame > [data-scroller] { max-height: none; } }
  ```
- No caption: the text visibly runs past the box's bottom border, and the bottom fade says there is more.
- `data-*` pass through to the region (`data-page-text` on the cited page, `data-state` on content-due's blocks).
- `content-due.tsx`'s `Block` becomes `ScrollBox` (its two tests change to the ", scrolls" names); the four boxes in 1.4
  adopt it.

### 2.9 What a person gets, by case

| Case | Keyboard | Screen reader | Sighted |
|---|---|---|---|
| Table fits (most tables at 1280) | no stop on the box; Tab goes straight to the table's links | "Cases, table" | nothing extra |
| Table overflows, scrolled to the start | one stop on the box; arrow keys scroll it; Tab to a link inside scrolls it clear of the fade | "Cases, scrolls sideways, region", then the table | caption above; a fade at the right edge |
| Scrolled to the middle | same | same | fades at both edges |
| Scrolled to the end | same | same | fade at the left edge only |
| No script, any width | one stop on the box | "Cases, scrolls sideways, region" | no caption or fade (never a false one); the page still does not scroll sideways |
| Forced colours | as above | as above | caption only; system scrollbar |
| Print | — | — | every column, no fade |

---

## 3. The stacked-row primitive (`apps/web/src/components/stacked-rows.tsx`)

### 3.1 What it is for

A working list whose far columns are the point (a case's deadline and owner; a line's short and status) reads
better on a phone as one card per row than as a table scrolled sideways (UX-079 (c)). Every later stacking fix uses
this one primitive: UX PR 4 (the screening result's three tables, UX-005), UX PR 34 (Cases, Claims and lines, the
anomaly's Flagged lines, the console record pages with their row forms, UX-078) and UX PR 85 (the screening
template's column reference). The review's model is the case page's own lines
(`cases/[caseId]/page.tsx:172-191`), which already stack and read well; the primitive improves on them by giving each
row a heading (so a screen reader can move row by row) and its facts as a definition list (so each value is read with
its label).

### 3.2 API

```ts
import type { ReactElement, ReactNode } from 'react';

/** A figure's part in the brand's three numbers (docs/brand/BRAND.md:123-124; ADR 0056, "Tables: expected, paid,
 *  short"): in a table of lines, expected allowed, observed allowed, short (variance). */
export type FigureRole = 'expected' | 'paid' | 'short';

export interface StackedField {
  /** The column's header, the same string the table's <th> shows (one constant for both). */
  readonly label: string;
  readonly value: ReactNode;
  /** One of the brand's three numbers: shown in the mono face, and the three always together in the brand's order. */
  readonly figure?: FigureRole;
  /** A code, count, key or date that is not one of the three: the mono face with tabular numerals. */
  readonly mono?: boolean;
}

export interface StackedRow {
  /** React key, and the value of the item's data-stacked-row. */
  readonly key: string;
  /** The row's naming cell: a <Link> when the row opens something, else text. */
  readonly heading: ReactNode;
  readonly fields: readonly StackedField[];
  /** The row's actions (links, ActionForms), full width under the facts. */
  readonly actions?: ReactNode;
  /** The caller's own test hooks for the stacked copy; never the table row's hooks (section 3.5). */
  readonly hooks?: Readonly<Record<`data-${string}`, string>>;
}

/** The table's min-w, at and above which the table shows instead of the rows. */
export type StackBelow = '32rem' | '36rem' | '40rem' | '48rem' | '56rem';

type ListName = { readonly label: string; readonly labelledBy?: never } | { readonly labelledBy: string; readonly label?: never };

export function StackedRows(props: ListName & {
  readonly rows: readonly StackedRow[];
  /** The heading level each row's heading takes: one below the section or card title that holds the list. */
  readonly headingLevel?: 2 | 3 | 4;       // default 3 (a CardTitle is an h2: packages/ui card.tsx:19-21)
  /** The same rows as a table, shown from `stackBelow` up; omitted for a list that always stacks. */
  readonly table?: ReactElement;           // a <ScrollTable>…</ScrollTable>
  readonly stackBelow?: StackBelow;        // required when `table` is given
}): ReactElement;

/** The fields in display order: as given, except that the figures stand together, in the brand's order, where the
 *  first of them was given. Exported for the unit test and for callers that check parity. */
export function inBrandOrder(fields: readonly StackedField[]): readonly StackedField[];
```

`inBrandOrder` keeps ADR 0056's line order whole: Charge, then Expected allowed, Observed allowed, Short, then Paid
and Patient share. A row given `[Charge, Short, Expected, Observed, Paid]` renders `[Charge, Expected, Observed, Short,
Paid]`. A role given twice keeps both, in the given order, inside the group (no throw in a server render; the unit
test and the caller's parity test catch it).

### 3.3 Markup

```html
<div data-slot="stacked-rows" class="@container">
  <div class="hidden @min-[56rem]:block"><!-- the ScrollTable --></div>
  <ul aria-label="Cases" class="flex flex-col gap-3 @min-[56rem]:hidden">
    <li data-stacked-row="<key>" class="rounded-md border p-4" …hooks>
      <h3 class="text-base font-semibold wrap-anywhere"><a class="underline" href="…">Payer Q, SYNPLAN FIX ONE</a></h3>
      <dl class="mt-2 grid grid-cols-1 gap-y-1 text-sm @min-[24rem]:grid-cols-[max-content_1fr] @min-[24rem]:gap-x-4">
        <dt class="text-muted-foreground">Pattern</dt><dd class="min-w-0 wrap-anywhere">…</dd>
        <dt class="text-muted-foreground">Expected allowed</dt><dd class="min-w-0 font-mono tabular-nums" data-figure="expected">$90.00</dd>
        <dt class="text-muted-foreground">Observed allowed</dt><dd class="min-w-0 font-mono tabular-nums" data-figure="paid">$60.00</dd>
        <dt class="text-muted-foreground">Short</dt><dd class="min-w-0 font-mono tabular-nums" data-figure="short">$30.00</dd>
        <dt class="text-muted-foreground">State</dt><dd class="min-w-0 [&_[data-slot=status-chip]]:whitespace-normal">…chip…</dd>
      </dl>
      <div class="mt-3 flex flex-col items-start gap-2"><!-- actions --></div>
    </li>
  </ul>
</div>
```

- A server component (no `'use client'`): every consumer is a server component and passes cell renderers' output as
  `ReactNode`; a client `ActionForm` passed in `actions` is fine as a child. The `table` prop is an element, usually a
  `ScrollTable`, which stays the one client leaf.
- **Heading** `h{headingLevel}`, `text-base font-semibold` (the base layer's 18 px for h3 is a card title's; a row's
  name is one step down), `wrap-anywhere` for a long plan key or email.
- **Definition list** in the house idiom (`grid grid-cols-1 gap-x-… gap-y-1 text-sm`, terms over values when narrow, as
  ADR 0056:53 says, side by side from a 24rem container), `dt` muted, every `dd` `min-w-0 wrap-anywhere` (so nothing
  in a card passes the window) and, for a figure or `mono`, `font-mono tabular-nums` (which `type-scale.test.ts:38-41`
  requires together). A figure's `dd` carries `data-figure="expected|paid|short"`, the same hook the claims table's
  headers use.
- **Status:** a status is a field like any other (its label is the column's, "State" or "Status"); its `dd` lets a
  `StatusChip` wrap (the chip is `whitespace-nowrap`, `components/status.tsx:25`, which would push a long screening
  status past a 358 px card). The primitive never picks a tone: the caller renders the chip (UX-040 moves the
  screening's tone; the primitive must not undo it).
- **Actions** last, full width, in source order.
- No empty state (every consumer's card or page already branches to `EmptyState`), no sorting (none in apps/web), no
  pagination (the `Pager` stays outside).
- The list's name is `label` or `labelledBy` (the card title's id), required by the type.

### 3.4 Pairing with a table: one data source, both rendered, a container query picks one

- **One data source.** The caller builds the table rows and the stacked rows from the same array and the same label
  constants (one `COLUMNS` object per table, used for each `<th>` and each field's `label`). "The stacked rows hold
  every column the table shows" (UX PR 4's test) is then true by construction, and checked by comparing
  `COLUMNS` with the fields' labels. A generic data-table component that renders both from column definitions was
  weighed and rejected: the tables are bespoke (footer sums, `colSpan`, PHI-dependent columns, badges and `title`s in
  cells), so it would be a rewrite of 73 tables for no user-visible gain, and it would make every table a function-prop
  API that cannot cross into a client component.
- **Both rendered; CSS shows one.** `display: none` takes the hidden copy out of the accessibility tree and out of
  axe, so names may repeat between the two. The switch is a **container query** on the wrapper (`@container`,
  Tailwind v4's built-in; Chromium 105, Safari 16, Firefox 110), not a viewport breakpoint: from 768 to 1023 px the
  content column is narrower than at 640 to 767 px, so `sm` would show a cut-off table exactly where stacking helps.
  The threshold is the table's own `min-w` (`stackBelow`): below it the table would have to scroll, so the rows stack
  instead; at and above it the table fits and shows. The classes are a literal map in the component
  (`{ '56rem': ['hidden @min-[56rem]:block', '@min-[56rem]:hidden'], … }`), so Tailwind generates them.
- **Not a separate list rendered by the page.** That would let the two drift (a column added to the table and not the
  list: audit #107 adds columns to Claims and lines).

### 3.5 What renders twice, and the rules that follow (ADR 0078)

Both copies are in the DOM. So:
- **No `id` may repeat.** An `id` inside a row (a form field, an `aria-labelledby` target) is made per copy with
  `useId` in the client component that owns it, or prefixed by the caller (`table-…`, `stacked-…`). UX PR 34's row
  forms render twice; what was typed does not carry across a resize past the threshold (accepted; ADR 0078 records it).
- **No spec hook may repeat.** Playwright's `page.locator()` matches hidden elements, so a stacked copy that repeated
  `data-group`, `data-coverage` or `data-case` would break the strict, single-match assertions in specs
  (`screening.spec.ts:461,488-491` on #42's side among them). The stacked copy carries `data-stacked-row` and the
  caller's own `hooks`, which must differ from the table row's.
- **Request keys.** Each `ActionForm` copy gets its own request key from `FormKeys` (`components/form-keys.tsx:11-14`);
  the two copies never post the same key.

### 3.6 How UX PR 4 and UX PR 34 call it

UX PR 4, the screening result's anomalies (`components/screening/anomalies.tsx`, after this PR has wrapped its table):

```tsx
const COLUMNS = { code: 'Code', product: 'Payer product', rows: 'Rows', lines: 'Claim lines', medicare: 'Medicare figure',
  reduced: 'Reduced figure', allowed: 'Allowed in your file', difference: 'Difference', reducedDifference: 'Reduced difference', status: 'Status' } as const;

<StackedRows
  labelledBy="screening-anomalies"
  stackBelow="56rem"
  table={<ScrollTable label="Anomalies by code and payer product"><table className="w-full min-w-[56rem] text-left text-sm" aria-labelledby="screening-anomalies">…</table></ScrollTable>}
  rows={groups.map((group) => ({
    key: `${group.code}:${group.product}`,
    hooks: { 'data-stacked-group': `${group.code}:${group.product}` },   // never data-group: screening.spec reads it
    heading: <><span className="font-mono">{group.code}</span>, {productLabel(group.product)}</>,
    fields: [
      { label: COLUMNS.rows, value: <ScreeningCount value={group.rows} />, mono: true },
      { label: COLUMNS.lines, value: <ScreeningCount value={group.lines} />, mono: true },
      { label: COLUMNS.medicare, value: <ScreeningMoney cents={group.medicareCents} />, figure: 'expected' },
      { label: COLUMNS.reduced, value: <Reduced group={group} />, mono: true },
      { label: COLUMNS.allowed, value: <ScreeningMoney cents={group.allowedCents} />, figure: 'paid' },
      { label: COLUMNS.difference, value: <ScreeningMoney cents={group.differenceCents} />, figure: 'short' },
      { label: COLUMNS.reducedDifference, value: <ReducedDifference group={group} />, mono: true },
      { label: COLUMNS.status, value: <GroupStatus group={group} /> },
    ],
  }))}
/>
```

The "other N groups, summed" footer becomes the last row (its own `hooks`, `data-stacked-group="others"`).

UX PR 34, Cases (`app/p/[practiceId]/cases/page.tsx`):

```tsx
<StackedRows label="Cases" stackBelow="56rem"
  table={<ScrollTable label="Cases"><table className="w-full min-w-[56rem] text-left text-sm" aria-label="Cases">…</table></ScrollTable>}
  rows={cases.map((item) => ({
    key: item.id,
    hooks: { 'data-stacked-case': item.id },
    heading: <Link className="underline" href={`/p/${practiceId}/cases/${item.id}`}>{payerAndPlan(item)}</Link>,
    fields: [
      { label: COLUMNS.pattern, value: behaviorText(item) },
      { label: COLUMNS.state, value: <CaseStateBadge state={item.state} /> },
      { label: COLUMNS.lines, value: `${item.openLines} of ${item.totalLines}`, mono: true },
      { label: COLUMNS.actionable, value: <Money value={item.actionableCents} /> },
      { label: COLUMNS.deadline, value: <Deadline item={item} /> },
      { label: COLUMNS.pursuitCost, value: item.pursuitCents === null ? 'not estimated' : <Money value={item.pursuitCents} /> },
      { label: COLUMNS.owner, value: item.owner ?? 'Unassigned' },
    ],
  }))}
/>
```

UX PR 34's console record pages pass their `ActionForm`s as `actions`; Claims and lines passes Charge, Expected
allowed (`figure: 'expected'`), Observed allowed (`'paid'`), Short (`'short'`), Paid, Patient share and Status, and
takes the heading from the same role rule as the table's first column (the patient link with PHI, the code without).
UX PR 85 passes `label`, a `heading` in mono (the file column's name) and two text fields, with no table pairing
change beyond `stackBelow`.

### 3.7 Adopted in this PR? No: the unit test suffices here, and UX PR 4 is its first user

Decision: this PR ships `StackedRows` with `stacked-rows.test.tsx` and adopts it at no site. Reasons:
- Every site that should stack is another PR's by design: Cases, Claims and lines and Flagged lines are UX PR 34's,
  together with the sticky naming cell that must land with them (UX-079 (b) and (c) are one change to those tables);
  the screening result is UX PR 4's. Adopting one here would split UX-079 (c) across two PRs and, for Cases, collide a
  third time with ux-forms (`cases/page.tsx` is shared).
- The case page's lines (`cases/[caseId]/page.tsx:172-191`), the one list that already stacks, hold far more than a
  row (correction words, pricing-check paragraphs, the write-off form, nested posting lists) and six specs read them
  (`triage`, `unattested`, `export-attempts`, `ledger-patient-share`, `reconciliation`, `viewer-phi`); moving it is a
  change of its own (proposal P2), not a by-product of this one.
- The primitive is a pure server component, so `renderToStaticMarkup` proves every behaviour it owns: the heading and
  its level, the dl, the brand order, the mono figures, the wrapping status, the hooks, the actions' place, and the
  container classes that switch the copies. What the unit test cannot prove (the switch in a real browser at 390 and
  1280) UX PR 4 proves first, in the same session right after this PR, with `screening-phone.spec.ts` at both widths,
  then UX PR 34 on every working list. ADR 0078 names UX PR 4 as the first user.

---

## 4. The guard: every `<table>` in `apps/web/src` sits inside `ScrollTable`

### 4.1 The source guard (the gate): `apps/web/src/app/tables.test.ts`

A Vitest test beside `type-scale.test.ts` (the app's other source-wide guard), in the `unit` project, so it runs in
`pnpm test` on every pull request and in CI's unit job. It parses each `.tsx` under `apps/web/src` (skipping
`*.test.tsx` and `components/test-support/**`) with the TypeScript compiler (`ts.createSourceFile(…, ScriptKind.TSX)`,
as `tools/brand-copy/scan.ts` does), and fails on:

1. a JSX `table` element (`JsxElement` or `JsxSelfClosingElement` whose tag is `table`) whose parent node is not a
   `JsxElement` whose opening tag is `ScrollTable`: the table must be the scroller's **direct child**. A table in a
   `div` inside `ScrollTable`, or behind `{cond ? <table/> : null}` inside it, fails; put the condition outside, so no
   empty region renders. (`StackedRows` renders no table of its own: its `table` prop is a `ScrollTable` element whose
   child passes the same rule at the call site.)
2. `createElement('table', …)` or `jsx('table', …)` anywhere;
3. a string literal or template containing `<table` passed to `dangerouslySetInnerHTML`.

Each finding names the file, line and rule. Exemptions are a map in the test, each with its reason and the PR that
removes it:

```ts
/** Tables in #42's files, wrapped when #42 has merged (the UX baseline review, UX-011). Each count must match exactly:
 *  a file that gains or loses a bare table fails, so the PR that wraps one must delete its line. */
const AFTER_42: Readonly<Record<string, { readonly tables: number; readonly removedBy: string }>> = {
  'app/console/support/page.tsx': { tables: 1, removedBy: 'UX PR 74 (co-001/ux-console-support-page)' },
  'app/settings/organizations/[organizationId]/users/page.tsx': { tables: 2, removedBy: 'UX PR 75 (co-001/ux-users-page)' },
  'app/p/[practiceId]/support-access/[supportGrantId]/page.tsx': { tables: 1, removedBy: 'UX PR 76 (co-001/ux-support-access)' },
};
```

A second test fails on an exemption whose file holds a different number of bare tables (zero included: a stale
exemption), as brand-copy's `exemption-unused` does (`scan.ts:570`). A third test runs the walker over fixtures in
memory (a bare table, a direct child, a table in a div inside, a conditional inside, `createElement`) so the guard is
itself tested. Three tests in all.

Why a unit test and not an ESLint `no-restricted-syntax` selector (the scout tested one,
`JSXElement[openingElement.name.name='table']:not(JSXElement[openingElement.name.name='ScrollTable'] > JSXElement)`): ESLint
cannot fail on a stale exemption, a flat-config override must re-spread the whole `restrictedSyntax` list
(`eslint.config.js:139,146`), and two lists would drift. One guard, one exemption list.

### 4.2 The rendered check (belt and braces): `apps/web/e2e/a11y.ts`

`atPhoneWidth` gains one more poll: every `document.querySelectorAll('table')` has
`closest('[data-slot="scroll-table"]')`. This catches what source cannot see: a table from a package or from
`dangerouslySetInnerHTML`. It runs wherever `atPhoneWidth` runs (the existing 12 calls in 8 files and every new one);
no `atPhoneWidth` call visits a #42 page with a bare table (re-checked), so it needs no exemption. `expectAccessible`
is not changed (it also runs on #42's pages).

---

## 5. Tests

### 5.1 Test matrix: a new section, "Tables (TBL)"

Placed after "Release content checks (RCC)" (and after "Forms (FRM)" when ux-forms has merged), in the repo's format
(`docs/product/test-matrix.md`; no `|` inside a cell):

```markdown
## Tables (TBL)

The tables of the UX baseline review's third pull request (docs/adr/0078; ADR 0056's phone rule): every data table
scrolls inside a region a keyboard reaches and whose name says it scrolls, shows a cue while columns lie past an edge,
and no page scrolls sideways at a phone's width; phones get one stacked-row layout. TBL-01 to TBL-04 are this pull
request's; TBL-05 to TBL-08 are reserved for the screening result's tables (the review's fourth pull request).

| ID | Case | Assertion |
| --- | --- | --- |
| TBL-01 | A wide table's scroller and a fixed-height text box | Rendered on the server as a region named "<the table's name>, scrolls sideways" (a text box: "<its name>, scrolls") with tabindex 0, the containing block of what its table positions, with a visible focus ring, so it is reachable before any script runs; in the browser it has no role, name or tab stop while its content fits and it is not focused, and is a region again when the content overflows; edge fades show only at an edge with content past it and the caption "Scroll sideways for more columns." only while it overflows, both from classes and data attributes alone (no style attribute); every table in apps/web/src is the scroller's direct child, but in the #42 pages listed with the pull requests that wrap them, and an exemption that no longer matches fails |
| TBL-02 | No page scrolls sideways | At 390 px no changed route is wider than the window, every table on it sits in a scroller, and each populated wide table overflows its scroller and shows the caption; at 1280 px each wide table the tour checks fits its card, every table's headers stand apart, no page scrolls sideways, and a table that fits has no tab stop and no caption |
| TBL-03 | Every changed route at a phone's width passes axe | At 390 px every changed route, each with its wide table populated and overflowing, has no axe-core WCAG 2.1 A or AA violation, a scrollable region the keyboard cannot reach (scrollable-region-focusable) among them; the screening result's is the review's fourth pull request's |
| TBL-04 | One stacked-row layout | Each stacked row is a list item headed by its naming cell at the level the caller gives (a link when the row has one), then a definition list of each column's label and value, then the row's actions; expected, paid and short stand together in that order where the first of them was given, whatever order they are given in, each in the mono face with tabular numerals; a status wraps inside the card; the rows carry their own hooks, never the table's; with a table, the table shows from the table's own width up and the rows below it, by a container query |
```

### 5.2 Synth (module 17, no-file entries)

The fixtures test requires a registry entry per matrix row (`packages/synth/src/fixtures.test.ts:34-56`), so:
- `packages/synth/src/expected/types.ts:9` `CASE_MODULES`: add `'TBL'`.
- `packages/synth/src/cases/common.ts:18` `MODULE_NUMBER`: add `TBL: 17` (reserved; ux-forms adds `FRM: 16`, the
  download-refusals PR `DLR: 18`; whichever merges second keeps both).
- `packages/synth/src/cases/matrix.ts`: four `{ id, title, assertion }` objects, byte-equal to the rows above (straight
  apostrophes, as BIL's), after RCC's (after FRM's when it is in).
- `packages/synth/src/cases/registry.ts`, after the RCC entries (`completesIn: 1`, the UX baseline series, as FRM's):

```ts
  // The tables of the UX baseline review's third pull request (docs/adr/0078).
  'TBL-01': none(1, 'The scroller is rendered from a synthetic table the test passes in memory, the source guard reads the app\'s own files, and the browser measures it on synthetic practices the journeys load; no file.', [
    'apps/web/src/components/scroll-table.test.tsx',
    'apps/web/src/app/tables.test.ts',
    'apps/web/e2e/layout-1280.spec.ts',
    'apps/web/e2e/tables-phone.spec.ts',
  ]),
  'TBL-02': none(1, 'A synthetic practice of its own loads SYNTHETIC CAS-08 and CAS-02, whose files belong to those cases; no file.', ['apps/web/e2e/tables-phone.spec.ts', 'apps/web/e2e/layout-1280.spec.ts']),
  'TBL-03': none(1, 'The routes read synthetic practices and sign-ins the journeys and the seed create; no file.', [
    'apps/web/e2e/tables-phone.spec.ts',
    'apps/web/e2e/reconciliation.spec.ts',
    'apps/web/e2e/reports.spec.ts',
    'apps/web/e2e/packets.spec.ts',
    'apps/web/e2e/onboarding.spec.ts',
    'apps/web/e2e/models.spec.ts',
  ]),
  'TBL-04': none(1, 'The stacked rows are rendered from synthetic rows the test passes in memory; no file.', ['apps/web/src/components/stacked-rows.test.tsx']),
```

- `pnpm synth` then writes `fixtures/synthetic/TBL-01..04/expected.json` (generated, never hand-written; they join the
  PR).

### 5.3 Unit tests

**`apps/web/src/components/scroll-table.test.tsx`** (node, `renderToStaticMarkup`; there is no DOM in the unit project,
and adding jsdom or happy-dom would test a mock, since neither lays out: `scrollWidth` is 0):
1. the server markup: `^<div data-slot="scroll-table" data-scroll="unmeasured" class="min-w-0 max-w-full"><div
   class="pw-scroll-frame"><div role="region" aria-label="Run lines, scrolls sideways" tabindex="0" data-scroller=""
   class="relative min-w-0 max-w-full overflow-x-auto `, the table its direct child (replaces :22);
2. no caption and no `data-edge-*` on the server (replaces :26);
3. no `style=` anywhere in the markup;
4. an empty `label` throws;
5. `scrollState`: `null` is unmeasured with no edges; equal sizes fit; a 1 px difference fits (rounding); 2 px
   overflows with `end`; scrolled to the middle has `start` and `end`; to the end has `start` only; a negative
   (right-to-left) offset reads as its magnitude;
6. `regionProps`: unmeasured and overflows give `role`, the suffixed name and `tabIndex` 0; fits gives none; fits while
   focused keeps all three; the `ScrollBox` suffix is ", scrolls";
7. `frameData`: `data-scroll` always; `data-edge-start` / `data-edge-end` only with those edges;
8. `ScrollBox`'s server markup: `data-axis="block"`, the region named "<label>, scrolls" with tabindex 0, `data-*`
   passed through, the tone's surface class, `pre` by default.

**`apps/web/src/components/stacked-rows.test.tsx`** (new):
1. a `ul` named by `label` (and by `aria-labelledby` with `labelledBy`), one `li` per row with `data-stacked-row`;
2. each row's heading at the given level (default h3), a link kept as a link;
3. a `dl` with one `dt`/`dd` per field, labels as given;
4. figures given as short, paid, expected (and among other fields) render expected, paid, short, together where the
   first was given; Charge before and Paid after stay where they were (`inBrandOrder`, and in the markup);
5. each figure's and each `mono` field's `dd` is `font-mono tabular-nums`, with `data-figure`;
6. a `StatusChip` value sits in a `dd` that lets it wrap; no tone class is added by the primitive;
7. actions after the `dl`, full width; none rendered when absent;
8. the caller's hooks on the `li`, and nothing else repeated from the table (rendered with a table whose rows carry
   `data-case`: the list holds no `data-case`);
9. with `table` and `stackBelow="56rem"`: `@container` on the wrapper, the table copy `hidden @min-[56rem]:block`, the
   list `@min-[56rem]:hidden`; without `table`, the list alone with no switch classes.

**`apps/web/src/app/tables.test.ts`** (new): the three tests of section 4.1.

**Pins that move** (no count change): `pricing/display.test.tsx:66,68`, `pricing/diff.test.tsx:70,234`,
`pricing/line-words.test.tsx:113` (each `^<div role="region"` anchor becomes the frame-prefixed form, or loses the `^`);
`pricing/content.test.tsx:86` (unchanged: it uses `toContain`); `packets/calculation-words.test.tsx:91` (the
worksheet table's class gains `min-w-[32rem]`); `screening/result.test.tsx:479-480` (the two hand-rolled regions
become `ScrollTable` markup); `releases/content-due.test.tsx:64-65` (the names gain ", scrolls"; the stop and role are
still rendered on the server).

### 5.4 End to end

**Every changed route runs `atPhoneWidth` once with its wide table populated**, and the call says which tables must be
there: `atPhoneWidth(page, what, { tables: ['Cases'], soft: true })`. New options in `a11y.ts`:
- `tables`: each name must be a visible table (`getByRole('table', { name, exact: true })`) whose `ScrollTable` reads
  `data-scroll="overflows"` and shows the caption: proof that the route was checked with its table populated and
  cut off, which is the state axe's `scrollable-region-focusable` judges (axe flags only a region whose content
  scrolls). Tables that fit at 390 by design (the "none" rows of 1.4) are not named.
- `soft`: the width poll, the table checks and axe use `expect.configure({ soft: true })`, so one test reports every
  route that fails, as `layout-1280.spec.ts` does.
- plus the rendered guard of 4.2.

**`apps/web/e2e/tables-phone.spec.ts`** (new, two tests; synthetic data only):

*Test 1, "at 390 px every practice table scrolls in its own region, says so, and passes axe".* Its own practice,
`SYNTHETIC OTHER PRACTICE PHONE TABLES` (`journeyPractice`, so a shared name never races under `fullyParallel`), built by
the tour's own setup, moved from `layout-1280.spec.ts:114-147` into `journeys.ts` as `tourPractice(page, { name,
manager })` (both specs call it; the 1280 spec's behaviour is unchanged): SYNTHETIC CAS-08 and CAS-02 uploaded, payer
Q's schedule signed off, payer N's plan mapped as no agreement, March and April priced and triaged, the case's first
packet version written. Signed in as a new persona `tables-manager` (other group, billing manager), so its TOTP never
races the 1280 spec's `pricing-manager`. Then, each one `goto` and one `atPhoneWidth` call:

| Route | `tables` |
|---|---|
| `/p/<id>` | Agreements |
| `/p/<id>/cases` | Cases |
| `/p/<id>/claims` | Claims and lines |
| `/p/<id>/anomalies` | Anomaly cohorts |
| `/p/<id>/anomalies?anomaly=<first cohort>` | Flagged lines |
| `/p/<id>/mapping` | Payers and plans |
| `/p/<id>/mapping/<payer N's plan>` | Agreement resolution |
| `/p/<id>/remittances` | Remittances |
| `/p/<id>/remittances/<payer Q's>` | Claims |
| `/p/<id>/pricing-runs/<March>` | Run lines, Variance by payer pattern |
| `/p/<id>/pricing-runs/compare?…` (March and April) | Changed lines |
| `/p/<id>/contracts` | Contracts |
| `/p/<id>/contracts/<payer Q's>` | Versions |
| `/p/<id>/contracts/versions/<version>` | Fields of record 1 (and the cited page's `ScrollBox` opened by `?record=`) |
| `/p/<id>/coverage` | Plans waiting on mapping, Unpriced reasons and their remedies |
| `/p/<id>/lines/<a line>` | Adjustments |
| `/p/<id>/releases` | Rule releases |
| `/p/<id>/uploads` | Receipts |
| `/p/<id>/uploads/<CAS-02's upload>` | Transaction sets |
| `/p/<id>/reports/documents/<the coverage report>` | Unpriced reasons and their remedies |
| `/p/<id>/cases/<case>/packet` | Line schedule, Versions |
| `/p/<id>/settings/pricing` | (fits: no table named; the width and axe checks still run) |

Then a second browser context as `other-admin` (every journey practice's practice administrator,
`journeys.ts:61`; `access_log.read`, `permissions.ts:179`): `/p/<id>/settings/access-log` (Access log; the tour's PHI
reads fill it) and `/p/<id>/settings/agreements` (Grants; the journey's grants). Then a third as the new
`tables-specialist` (internal contract specialist, granted by the journey's `internal` option): `/p/<id>/abstraction`
(Versions in progress) and `/p/<id>/abstraction/ledger` (Ledger entries, if the tour's triage wrote an entry; if it
writes none, that one step goes to `reconciliation.spec.ts` instead, below).

*Test 2, "at 390 px every console table scrolls in its own region, says so, and passes axe".* Three new internal
personas, each in its own context: `tables-admin` (platform administrator): `/console/terms` (Terms versions; the seed's
synthetic terms), `/console/rule-releases` (Rule releases, Drafts; release 900001 from `prepare.ts`; the check
problems and the release notes `ScrollBox`es opened), `/console/rule-releases?release=900001` (Affected runs by
practice), `/console/screening` (Approved splits; `prepare.ts`'s approved split), `/console/billing` (Billing status),
`/console/models` (Model spend by practice), `/console/status`, `/console/organizations` (Organizations);
`tables-support` (support desk): `/console/tickets` (Tickets; one synthetic ticket inserted in the test's setup with
`withDatabase`, idempotent on a fixed subject, `SYNTHETIC TICKET PHONE TABLES`); `tables-specialist`:
`/console/specialist-queue` (Practices; the journey's grant). Each internal sign-in first deletes that persona's
registered hardware key with `withDatabase`, so a retry can register again (the known retry failure at
`helpers.ts:87`, LANES.md's hand-over note, does not apply). The builder confirms each route's role in
`packages/db/src/authz/permissions.ts` and uses the persona that holds it.

The four personas are four lines in `apps/web/scripts/synthetic-personas.ts` (a ux-forms file; whichever merges second
keeps both).

**One-line calls in specs that already populate the route** (each placed where that spec's data exists):

| Spec (not #42, not ux-forms) | Route and `tables` |
|---|---|
| `reconciliation.spec.ts` (after :161, :170, :235) | `/p/<id>/reconciliation` (Exports, Ledger entries), `/p/<id>/reconciliation/template` (Preview rows, after a sample loads), `/p/<id>/reports/roi` (ROI statements), `/p/<id>/reports/roi/<statement>` (Entries of …); `/abstraction/ledger` here if test 1 cannot reach it |
| `reports.spec.ts` (:114, :161, :208) | `/p/<id>/reports/<report>` and its `/review` (the report's tables by caption: Cases at least), `/p/<id>/reports/monthly` (Stages by payer), `/p/<id>/reports` (Generated reports) |
| `packets.spec.ts` (:333 before :355; the existing :120, :355, :428 calls gain `tables`) | `/p/<id>/packet-reviews` (Exports waiting), the packet review (Line schedule), `/p/<id>/cases/<case>/submissions` (Lines not on current pricing, when present) |
| `onboarding.spec.ts` (:100, :111, :152, :226, :310, :375) | `/console/prospects` (Audit requests), `/console/organizations/<id>` (Members, Invitations, Agreements, Grants), `/console/compliance` (Policies, Evidence records), `/settings/billing/<id>` (Invoices, when the journey's organization holds one), `/support` (Tickets, after the ticket opens), `/status` |
| `models.spec.ts` (where the specialist opens the version with candidates) | `/p/<id>/abstraction/versions/<version>` (Proposed fields of candidate 1, Fields of record 1) |

Not edited: every #42 e2e file (`env.ts`, `prepare.ts`, `screening.spec.ts`, `screening.ts`, `mail*.ts`), and the
ux-forms e2e files `contracts.spec.ts`, `helpers.ts`, `triage.spec.ts` (only imported). The screening result's 390 pass
is UX PR 4's `screening-phone.spec.ts` (the only spec that reaches it today is #42's); this PR's markup there is
proven by `result.test.tsx`.

**`layout-1280.spec.ts`**: setup moved to `tourPractice()`; `expectFitsItsCard` also checks, after hydration, that the
table's `ScrollTable` reads `data-scroll="fits"` and its scroller has no `tabindex` and no `role`, and that the page has
no `[data-state="scrolls-sideways"]`; this is the "no idle tab stops at 1280" half of the review's fix.

**Region names that become ambiguous.** A `ScrollTable` named like the region around it would match a substring
locator twice while the table overflows or before hydration. Fixed with `exact: true` at
`uploads.spec.ts:53` and `layout-1280.spec.ts:246` (`'Receipts'`) and `unattested.spec.ts:62,171` (`'Exports
waiting'`); the builder greps `getByRole('region'` and `getByRole('table'` across `apps/web/e2e` for any other name a
new label extends.

### 5.5 Axe at 390 on every changed route, and the counts

Every route of section 1.4 is in 5.4's tables (both tests and the one-line calls), except `/screening/results/[id]`
(UX PR 4) and the routes whose only change is a `min-w` or the component itself, which the same calls cover
(`/p/<id>/pricing-runs/<run>`, the packet review, the line trace through `pricing.spec.ts:144`'s existing call).

Expected change in counts (CI at e908c21: unit 6,265 + 1 skipped, e2e 54, golden 376, db 9,222 + 1 skipped):
- unit: about **+20**, to about 6,285 + 1 skipped (scroll-table 2 → 10, stacked-rows 9, tables 3; the moved pins change
  no count; the fixtures test's count is unchanged, its loops cover TBL);
- e2e: **+2** (tables-phone's two tests), so 56; the one-line calls are steps in existing tests;
- golden and db: unchanged.
- e2e time: tables-phone test 1 takes the tour's setup (about 2 to 3 min) plus about 30 routes at 2 to 4 s; test 2
  about 2 min. Both run in parallel with the rest; `test.setTimeout(600_000)` on test 1.

---

## 6. ADR 0078 (needed) and ADR 0056's pointer

**Needed, not a dated amendment to 0056 alone.** ADR 0056 says one sentence about phones (:51-53). This PR and UX PR 4
set app-wide conventions every later table PR follows (UX PRs 34, 74 to 76, 85): the scroller's contract, the cue,
the guard and its exemptions, the stacking primitive and its renders-twice rules. LANES.md reserved 0078 for both PRs.
0056 gains a Status-line link and one italic pointer under :51-53. **UX PR 34** (prs.json order 34 plans "a dated
'*Amended …*' line" in 0056 for the stacking rule) then cites ADR 0078 instead, adding at most a dated amendment to 0078
for the sticky naming cell; its file list changes accordingly (a note for that PR's design).

**ADR 0056 edits** (ux-forms edits the same two places: the Status line and an italic paragraph after :54; whichever
merges second keeps both, 0058, 0077 and 0078 in number order, and the two italic paragraphs one after the other):

- Status: `accepted; amended by [0058](…), [0077](…) and [0078](0078-scroll-every-wide-table-in-a-named-region-that-says-it-scrolls-and-stack-rows-on-a-phone-through-one-primitive.md)`
  (without 0077 while ux-forms has not merged).
- After :53: `*Amended by [0078](…) (co-001/ux-table-scroll, 2026-10-27): every wide table scrolls in ScrollTable, a
  region named "<table>, scrolls sideways" while it overflows, with edge fades and a caption; and a working list on a
  phone stacks each row through one primitive, StackedRows.*`

**ADR 0078's text** (`docs/adr/0078-scroll-every-wide-table-in-a-named-region-that-says-it-scrolls-and-stack-rows-on-a-phone-through-one-primitive.md`):

```markdown
# 0078. Scroll every wide table in a named region that says it scrolls, and stack rows on a phone through one primitive

- **Status:** accepted (`co-001/ux-table-scroll`, the UX baseline review's third pull request; extended by
  `co-001/ux-screening-result-tables`, its fourth); amends
  [0056](0056-wear-the-paidwhole-brand-from-one-token-source-self-hosted-fonts-and-status-as-text-on-tint.md) (the
  phone rule of its Chrome paragraph)
- **Date:** 2026-10-27
- **Deciders:** the founder, under the standing rule of 2026-10-18; the co-founder, under the founder's delegation of
  2026-10-25, whose rulings of 2026-10-25 have the build improve as it goes and take each recommended wording and
  visible change without asking; the build (Lane B). Each reversible by the founder
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

**1. One scroller.** Every `<table>` in `apps/web/src` is the direct child of `ScrollTable` (`components/scroll-table.tsx`),
which takes the table's name as `label`. It renders three elements: a state holder
(`data-slot="scroll-table"`, `data-scroll="unmeasured|fits|overflows"`, `data-edge-start`, `data-edge-end`), a frame
that does not scroll (`.pw-scroll-frame`, where the cue is drawn), and the scroller, `relative` (so a visually hidden
header stays inside it) and `overscroll-x-contain`. The table carries a `min-w-[…]` from its columns (about 6rem a
figure, date or count, 8 to 10rem a text column, 12rem a sentence; one of 32, 36, 40, 48 or 56rem; never above 56rem,
so it fits its card at 1280 px) and `wrap-anywhere` on long values (emails, keys, paths, control numbers).

**2. Its name and tab stop follow the measurement.** On the server and until the browser measures it, the scroller is a
region named "<label>, scrolls sideways" with `tabindex="0"`, so it is reachable without script. In the browser one
pure function (`components/scroll-state.ts`) turns `scrollWidth`, `clientWidth` and `scrollLeft` into the state: a
difference of 1 px or less fits. While the table fits and the scroller is not focused it has no role, name or tab
stop; while it overflows, or holds focus, it is the region again. ResizeObservers on the scroller and its children, a
MutationObserver that re-observes a swapped child, and one passive scroll listener coalesced per frame keep the state
current; it is set only when it changes.

**3. The cue.** While columns lie past an edge, a fade 1.5rem wide covers that edge, from the surface's token
(`--pw-scroll-surface`, `--pw-bg` by default; dark follows the tokens) to transparent, drawn by `::before` and
`::after` on the frame above the content (above a sticky cell), with `pointer-events: none`. The scroller's
`scroll-padding-inline` keeps a focused control clear of it (WCAG 2.4.11). While the table overflows, at any width, the
line "Scroll sideways for more columns." stands above it, `aria-hidden` because the region's name says it. Under forced
colours the fades are hidden and the caption remains; in print the scroller shows every column; an opacity transition
only under `prefers-reduced-motion: no-preference`. Everything is classes and data attributes: never a style attribute,
which the CSP refuses, and never a scroll position in CSSOM.

**4. Text boxes.** A fixed-height box of text scrolls in `ScrollBox` (the same file): the same state on the block axis,
named "<label>, scrolls", top and bottom fades drawn inside its border from its own surface, no caption.

**5. Stacked rows.** On a phone a working list stacks each row through one server component, `StackedRows`
(`components/stacked-rows.tsx`): a list named by `label` or `labelledBy`; each item a heading at the caller's level
(the naming cell, a link when the row opens something), a definition list of the columns' labels and values, then the
row's actions. Expected, paid and short stand together in that order where the first of them was given; figures and
codes in the mono face with tabular numerals; a status wraps; the primitive never picks a tone. With a `table`, both
copies render from one row array and one set of column labels, and a container query on the wrapper shows the table
from its own `min-w` up and the rows below it; `display: none` hides the other copy from assistive technology. Because
both are in the DOM, no `id` and no test hook repeats between them (the stacked copy carries `data-stacked-row` and
its own hooks), and each row form's copy has its own request key; what was typed in one copy does not carry to the
other across a resize. The fourth pull request (the screening result) is its first user.

**6. The guard.** A unit test (`apps/web/src/app/tables.test.ts`) parses every `.tsx` in `apps/web/src` and fails on a
`<table>` that is not `ScrollTable`'s direct child, on `createElement('table')`, and on a table in
`dangerouslySetInnerHTML`; its exemptions are the #42 pages (console support, the users page, support access), each
with the pull request that wraps it, and an exemption that no longer matches fails. `atPhoneWidth` in the e2e suite
also checks that every rendered table sits in a `ScrollTable`.

## Alternatives considered

- **Keep the region and its name always** (the review's text). A name that says "scrolls sideways" over a table that
  does not is untrue, and about 80 regions at 1280 px add landmarks that say nothing beyond the tables' names.
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
- **An ESLint selector as the guard**: it cannot fail on a stale exemption, and two lists would drift.
- **jsdom or happy-dom for the scroller's unit test**: neither lays out, so the test would test a mock; the decision is a
  pure function tested in node, and the live behaviour in the browser suite.

## Consequences

- Every table PR after this one (34, 74 to 76, 85, and any new table) uses `ScrollTable`, and a working list on a phone
  uses `StackedRows`; the guard enforces the first.
- Without script a scroller is always a named region with a tab stop (an idle stop at 1280 px, the safe failure) and
  shows no cue: never a false one.
- A table's region is announced only while it scrolls; a spec that finds a region by name must allow for the state
  (and use `exact: true` where a table's name extends its card's).
- The stacked copy doubles the markup of a stacked list; acceptable for record lists of a page's length.

## Not covered

- The sticky naming cell and the stacked working lists (UX-079 (b) and (c), UX-078): the review's 34th pull request.
- The #42 pages: the review's 74th to 76th pull requests, which delete their exemptions.
- A per-route phone visit from a page-route registry (audit #103).
- `app/global-error.tsx:10-11` writes `style={{…}}`; it works only because it renders on the client after an error (a
  CSSOM write), and must not be copied.

## Revisit when

- Firefox ships scroll-driven animations by default, or every supported engine ships scroll-state container queries:
  the fades can then be CSS only and show without script.
- A table needs a sticky header row: the fades' z-index and the header's must be set together.
```

---

## 7. No migration; overlaps; the pull request's description

### 7.1 No migration

None: no schema, function, policy or data change; markup, CSS, tests and documents only. `docs/product/domain-model.md`
is not regenerated and the CO-02 schema gate does not apply.

### 7.2 Overlaps

- **#42: no file of #42's is edited.** Its three pages are exempt in the guard; `app/screening/page.tsx` and
  `components/shell.tsx` are untouched (the screening page gains the cue through the unchanged `ScrollTable` API).
  The shared documents (test-matrix, synth matrix and registry) gain TBL rows in their own sections; whichever merges
  second keeps both.
- **ux-forms (`origin/co-001/ux-forms` at 17bbb70): 18 shared files** (LANES.md rule 6: the one merged second keeps
  both): 11 page and component files, ADR 0056, `synthetic-personas.ts`, and the five shared test documents. The five prs.json named: `console/compliance`, `console/organizations/[organizationId]`, `p/cases`,
  `p/settings/pricing`, `components/reconciliation/template-mapper.tsx`. Six more because their tables need wrapping:
  `console/billing`, `console/models`, `console/status`, `p/reports`, `p/settings/agreements`, `app/support`. Two
  documents and data files: `docs/adr/0056-…md` (Status line and an italic paragraph), `apps/web/scripts/synthetic-personas.ts`
  (four persona lines); and five test documents both PRs append to: `docs/product/test-matrix.md`,
  `packages/synth/src/cases/{matrix,registry,common}.ts`, `packages/synth/src/expected/types.ts`. In the page files the two changes are disjoint (ux-forms changes forms and
  fields; this PR changes the table wrapper and the table's class), so the merge is mechanical. ux-forms' new
  `components/test-support/**` is skipped by the guard's walk.
- **The download-refusals PR** (another Lane B session, PR 5): it changes `coverage/page.tsx` (this PR wraps two tables
  there) and `onboarding.spec.ts` (this PR adds calls): keep both. And `MODULE_NUMBER` (DLR: 18).

### 7.3 What the pull request's description says

From `.github/pull_request_template.md`, with:
- Closes UX-011 (C-002) outside #42's files, and UX-079 (C-043) part (a). Left: UX PRs 4, 34, 74 to 76, 85 (section 1.1).
- The five departures from the review's fix text and why (section 1.6).
- The census: 73 tables wrapped, 5 more given a `min-w`, 5 text boxes, in 55 source files besides the component; the review's "about 35" counted the cited
  lines only.
- The #42 exemptions, by file and by the PR that removes each; no #42 file edited.
- The 18 files shared with ux-forms, and the rule (the one merged second keeps both); the download-refusals overlap.
- ADR 0078 (new) and the 0056 pointer; no migration.
- The tests and the count change (5.5); the before and after screenshots (section 8) and the UX and brand review's
  outcome; the second adversarial review's lens and findings.

---

## 8. Screenshots for the UX and brand review; the second adversarial review's lens

### 8.1 Before and after

Captured on the synthetic practices of 5.4 (before on e908c21, after on the branch), at **1280 light, 390 light and
1280 dark** each, unless the row says otherwise; dark by `data-theme="dark"` on `<html>`.

| Route | State | Shows |
|---|---|---|
| `/p/<id>/cases` | default; also 390 dark | the caption, the right fade, the Owner column reached by scrolling |
| `/p/<id>/cases` at 390 | scrolled to the middle, then to the end | both fades, then the left fade only |
| `/p/<id>/claims` | billing manager (PHI columns) | the widest table, `min-w-[56rem]`, at 1280 fitting its card with no caption |
| `/p/<id>` | the practice home | Agreements: before, cut off at the card; after, in its region |
| `/p/<id>/cases/<case>/packet` | first version | Line schedule with its new `min-w`, and the Versions table |
| `/p/<id>/remittances/<id>` | default | Claims (was pushing the page to 733-745 px) |
| `/console/prospects` | one request | Audit requests (was 959 px wide) |
| `/settings/billing/<org>` | an invoice | Invoices |
| `/console/rule-releases` | notes open, check problems shown | the `ScrollBox`es with their bottom fades and names |
| `/p/<id>/contracts/versions/<v>?record=<r>` | the cited page open | the cited page `ScrollBox` (faint tone) |
| `/p/<id>/cases` at 390 | the table focused by Tab | the focus ring on the region, the fade, the caption |
| `/p/<id>/cases` at 390 | forced colours (Chromium's emulation) | no fade, the caption in system colours |

Plus, from `stacked-rows.test.tsx`'s fixture rendered in the browser harness when it exists, or as a static page in
the PR's screenshot set: one stacked row at 390, light and dark, so the brand review sees the primitive before UX PR 4
uses it (heading, definition list, figures in mono in the brand's order, a wrapping status, an action).

### 8.2 The second adversarial review's lens

Recommended: **correctness and accessibility of the component and its rollout.** The risk in this PR is not in its
data (it touches none) but in a client state machine that changes a region's role, name and tab stop after hydration,
and in 73 hand edits that must each keep every column, name and hook. The lens covers: the state machine (hydration,
the unmeasured state without script, focus kept while focused, observers re-observing, the 1 px threshold, scroll
coalescing, cleanup), the CSS (the CSP, z-index over chips and sticky cells, forced colours, print, both themes,
scroll padding), and the rollout (every site's label equals its table's name and is unique where it should be, every
`min-w` within the rule, no table left bare, no spec hook or `id` repeated, no locator made ambiguous, no #42 file
touched). The first review takes the usual broad lens.

---

## 9. Build slices and their order

Each slice owns its files; no file is in two slices. Every slice keeps `pnpm typecheck`, `pnpm lint` and its tests
green on its own.

| Order | Slice | Files | Depends on |
|---|---|---|---|
| 1 | **A. The components and their tests** | `components/scroll-state.ts` (new), `components/scroll-table.tsx`, `components/scroll-table.test.tsx`, `components/stacked-rows.tsx` (new), `components/stacked-rows.test.tsx` (new), `app/brand.css`, and the pins the new markup moves at once: `components/pricing/display.test.tsx`, `components/pricing/diff.test.tsx`, `components/pricing/line-words.test.tsx` | nothing |
| 2 | **B1. Practice pages, home to packet** | `p/[practiceId]/page.tsx`, `cases/page.tsx`, `claims/page.tsx`, `anomalies/page.tsx`, `abstraction/page.tsx`, `abstraction/ledger/page.tsx`, `cases/[caseId]/packet/page.tsx`, `packet-reviews/page.tsx`, `reconciliation/page.tsx`, `contracts/page.tsx`, `contracts/[contractId]/page.tsx`, `mapping/page.tsx`, `mapping/[planId]/page.tsx` | A |
| 2 | **B2. Practice pages, remittances to uploads** | `remittances/page.tsx`, `remittances/[remittanceId]/page.tsx`, `reports/page.tsx`, `reports/roi/page.tsx`, `settings/access-log/page.tsx`, `settings/agreements/page.tsx`, `settings/pricing/page.tsx`, `coverage/page.tsx`, `lines/[lineId]/page.tsx`, `releases/page.tsx`, `uploads/[documentId]/page.tsx` | A |
| 2 | **C. Components** | `contracts/review.tsx`, `contracts/display.tsx`, `models/display.tsx`, `reports/display.tsx`, `reports/documents.tsx`, `reports/roi.tsx`, `reconciliation/template-mapper.tsx`, `uploads/receipts.tsx`, `releases/note.tsx`, `releases/content-due.tsx`, `releases/content-due.test.tsx`, `screening/coverage.tsx`, `screening/anomalies.tsx`, `screening/result.test.tsx`, `packets/display.tsx`, `packets/calculation-words.tsx`, `packets/calculation-words.test.tsx`, `packets/pricing.tsx`, `pricing/display.tsx` | A |
| 2 | **D. Console, account and public pages** | `console/prospects`, `tickets`, `specialist-queue`, `compliance`, `terms`, `rule-releases`, `screening`, `organizations`, `organizations/[organizationId]`, `billing`, `models`, `status` (each `page.tsx`), `settings/billing/[organizationId]/page.tsx`, `support/page.tsx`, `status/page.tsx` | A |
| 3 | **E. End to end** | `e2e/a11y.ts`, `e2e/tables-phone.spec.ts` (new), `e2e/journeys.ts`, `e2e/layout-1280.spec.ts`, `e2e/reconciliation.spec.ts`, `e2e/reports.spec.ts`, `e2e/packets.spec.ts`, `e2e/onboarding.spec.ts`, `e2e/models.spec.ts`, `e2e/uploads.spec.ts`, `e2e/unattested.spec.ts`, `scripts/synthetic-personas.ts` | B1, B2, C, D (the routes must be wrapped) |
| 3 | **F. The guard, documents and synth** | `app/tables.test.ts` (new), `docs/adr/0078-…md` (new), `docs/adr/0056-…md`, `docs/product/test-matrix.md`, `packages/synth/src/cases/{matrix,registry,common}.ts`, `packages/synth/src/expected/types.ts`, `fixtures/synthetic/TBL-01..04/expected.json` (by `pnpm synth`) | B1, B2, C, D (the guard passes only when every table is wrapped); `assertedBy` paths exist once A and E have landed, so F's registry lands after E or together |

Order: A first, alone; then B1, B2, C and D in parallel; then E and F in parallel; then the integrator runs the full
suite (`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e` under the heavy-command lock, `pnpm lint:copy`) and
the 390 and 1280 screenshots. Each B, C and D builder works from section 1.4's rows and, for each site: removes the
old wrapper, wraps the table as `ScrollTable`'s direct child with the row's label, sets the `min-w` and `wrap-anywhere`,
keeps every hook and name, and runs the slice's unit tests.

---

## 10. Risks and open points, each with its answer

| Risk or open point | Answer |
|---|---|
| A spec reads a region or table by a name a new label extends, and fails on two matches before hydration | `exact: true` at the four known locators (5.4); slice E greps the rest; the second review checks it |
| A table hidden by `StackedRows`' container query measures as 0 wide and reads "fits" | correct while hidden (it has no tab stop to offer); when it shows, its size changes, the ResizeObserver fires and it re-measures. A unit test cannot see this; UX PR 4's spec at 1280 does |
| A resize that makes a focused table fit would pull focus | the focused rule keeps the stop until blur (2.3); tested in `regionProps` |
| Region announcements change as a person resizes | only between "Cases, table" and "Cases, scrolls sideways, region", which is the truth each time; no live region announces it |
| A `min-w` makes a table scroll where it fitted before | intended where it stops one-word-per-line cells; the cap of 56rem keeps every table fitting its card at 1280 (layout-1280 checks three); tables of three short columns get none |
| `wrap-anywhere` breaks a code or a figure | it goes only on the cells 1.4 names (emails, keys, paths, references), never on figures, codes or dates |
| The fade hides the last characters of a cell | that is the cue; `scroll-padding-inline` keeps a focused control clear, and the caption says to scroll |
| A surface other than `--pw-bg` under a table makes the fade a visible band | none exists today (re-checked); a future one sets `--pw-scroll-surface` with a class on its card; the ADR records it |
| Shared files with ux-forms conflict | disjoint hunks in each page file; the PR merged second keeps both (LANES.md rule 6), noted in the description |
| Wrapping `anomalies.tsx` moves UX PR 4's file early | two wrappers and two pins; UX PR 4 is the next PR in the same session and builds on them |
| The console test's four new personas and their keys | each deletes its own key before registering, so a retry registers again; personas are synthetic, in `synthetic-personas.ts` |
| A route's data depends on the CI shard | none of the new calls reads north's or south's data; each reads its own journey practice or the seed's own rows (terms, release 900001, the approved split) |
| e2e time | tables-phone's two tests run in parallel with the rest; the one-line calls add seconds to existing tests |
| The review asked for `atPhoneWidth` on every page route from a registry | out of scope (audit #103, proposal P4); this PR covers every changed route instead |

---

## 11. Proposals outside this PR (improve as you go)

- **P1.** `tabTo` (`e2e/a11y.ts:22`) reaches links and buttons only; widen it to `region` by `aria-label`, so a spec can
  prove a scroller is in the Tab order directly. (a11y.ts is this PR's file, but no test here needs it: the `tables`
  option proves the region and its stop; leave it for the PR that first needs it.)
- **P2.** Move the case page's lines (`cases/[caseId]/page.tsx:172-191`) onto `StackedRows` (a heading per line, a
  definition list): with UX PR 34, or its own PR; six specs read that list.
- **P3.** Unique names for "Entries of the line" (the ledger's shortfalls and reconciliation's linkage lines), once each
  item shows a name a person can see; with UX PR 13 (the ledger's AdjustForm).
- **P4.** `atPhoneWidth` on every page route from a page-route registry with a seeded data shape per route (audit #103).
- **P5.** If ux-forms merges first, generalise its browser harness (`components/test-support/browser.ts`) to take any
  entry, so `ScrollTable` and `StackedRows` get real-browser unit tests (the switch at 390 and 1280, the observer).
- **P6.** The anomaly's Flagged lines table orders observed, mode, short; the brand's order puts the mode (the expected
  role) first: UX PR 34's call.
- **P7.** UX PR 34's design cites ADR 0078 instead of amending ADR 0056 (prs.json order 34's file list).
- **P8.** `reports.spec.ts:46` reads north's anomalies, which another spec must load in the same shard: give it a journey
  practice of its own.

---

## 12. After the design review: the 16 findings, each accepted, and what changes

Every finding is accepted as the reviewer proposed it, except where a line below says otherwise. Builders work from
this section first.

### 12.1 Blocking

- **DR-01, the focus rule counts only the scroller's own focus.** React's `onFocus` and `onBlur` bubble, so focus on a
  link inside a fitting table must not bring back the region. In `scroll-table.tsx`, `onFocus` sets `focused` only when
  `event.target === event.currentTarget`, and `onBlur` clears it (then measures) only on the same condition. ADR 0078
  Decision 2 says "holds focus" means the scroller itself, never a control inside it. Tests: `scroll-table.test.tsx`
  gains a `regionProps` row "fits, a descendant focused: nothing" (the function takes the scroller's own focus only);
  `layout-1280.spec.ts` Tabs to the first link of a fitting table and checks its scroller still has no `role` and no
  `tabindex`.
- **DR-02, two more locators become ambiguous.** Add `exact: true` at `packets.spec.ts:98, 132, 144, 282, 431, 501, 507`
  (`'Version'` against "Versions, scrolls sideways") and `reconciliation.spec.ts:105` (`'Preview'` against "Preview rows,
  scrolls sideways"), with the four of 5.4. Slice E runs the full check: for each `getByRole('region' | 'table', { name: X })`
  in `apps/web/e2e` without `exact`, it fails if X is a case-insensitive substring of any new `ScrollTable` or
  `ScrollBox` label on the same route (section 1.4), and fixes each hit. The PR description records the list.

### 12.2 Should fix

- **DR-03, the focus indicator is an outline on the frame.** Both scrollers drop `focus-visible:outline-none
  focus-visible:ring-2 focus-visible:ring-ring` (and `ring-inset`). `brand.css` adds:
  `.pw-scroll-frame:has(> [data-scroller]:focus-visible) { outline: 2px solid var(--pw-focus); outline-offset: 2px; }`
  and `.pw-scroll-frame > [data-scroller]:focus-visible { outline: none; }`. It survives forced colours and is never
  covered by the fades or clipped by `ScrollBox`'s frame. (`--pw-focus` is the brand's focus token; the builder checks
  its name in `packages/brand/src/tokens.css`, and uses the token the app's `ring` maps to if it differs.)
  `scroll-table.test.tsx` asserts the markup holds no `outline-none`. Section 8.1's forced-colours shot shows the table
  focused by Tab.
- **DR-04, the `min-w` cap is 54rem, not 56rem.** The content column at 1280 is 909 px, and a classic 17 px scrollbar
  leaves 892 px. The allowed set is **32, 36, 40, 48 and 54rem** everywhere: section 1.4's rule and rows (every 56rem
  becomes 54rem), 2.6, ADR 0078 Decision 1 ("fits at 1280 with a classic scrollbar"), `StackBelow`
  (`'32rem' | '36rem' | '40rem' | '48rem' | '54rem'`) and the reports `Table`'s map. `layout-1280.spec.ts`'s fit checks
  run at 1280 and again at 1263 px ("1280 less a classic 17 px scrollbar").
- **DR-05, `atPhoneWidth` waits for every scroller to agree with its measurement before axe.** In `a11y.ts`, for every
  call: poll until each `[data-scroller]` that overflows (`scrollWidth − clientWidth > 1`, or the block axis for
  `data-axis="block"`) has `tabindex="0"` and `role="region"`, and each that fits has neither (unless it is focused).
  `layout-1280.spec.ts`'s `expectFitsItsCard` does the same after its resize. Section 4.2 holds it beside the rendered
  guard; TBL-03's assertion adds "every scroller's state agrees with its measurement before axe runs".
- **DR-06, focus taken before hydration is kept.** In the mount effect, before the first `measure()`, set `focused` to
  `document.activeElement === scroller`. Section 10's row "A resize that makes a focused table fit would pull focus"
  cites it.
- **DR-07, the renders-twice rules gain two.** (a) `ActionForm`'s refusal hand-off (`RefusalTakeover`,
  `RefusalFallback`: `action-form.tsx:149-156, 176-185, 200-215`) must claim focus only when its element is rendered
  (`ref.current?.getClientRects().length > 0` before clearing `refused`). `action-form.tsx` is a ux-forms file and no
  site here renders a form twice, so this change is **UX PR 34's** (its first user of row forms in `StackedRows`):
  ADR 0078 Decision 5 states the rule and names UX PR 34; the status file records it. (b) `stacked-rows.tsx` exports a
  test helper `repeatedIds(html)` (ids, and `data-*` hook values other than `data-stacked-row`, that occur more than
  once in `renderToStaticMarkup` output). Every paired caller's unit test asserts it returns nothing;
  `stacked-rows.test.tsx` test 8 uses it.
- **DR-08, the brand order is checked, never silently fixed.** `StackedRows` renders the fields in the order given.
  `inBrandOrder` becomes the exported check `brandOrderProblems(fields)`: the figure roles out of order (expected, paid,
  short) or not together. Each paired caller's unit test asserts it is empty and that the table's header order equals
  the fields' label order (one `COLUMNS` constant read in order for both). `stacked-rows.test.tsx` test 4: the check
  finds `[Charge, Short, Expected, Observed, Paid]` out of order and accepts the brand's order. TBL-04 reads: "expected,
  paid and short are given together and in that order, and the stacked rows keep the table's column order". UX PR 4
  then reorders its table's columns as well, which UX-005 asks for (a note for its design).
- **DR-09, one persona per test.** `tables-specialist` (test 1) and `tables-console-specialist` (test 2): five
  personas in `synthetic-personas.ts` (`tables-manager`, `tables-specialist`, `tables-console-specialist`,
  `tables-admin`, `tables-support`).
- **DR-10, the recorded JSON moves to `ScrollBox`.** `pricing/line-words.tsx`'s Recorded `<pre>` becomes
  `<ScrollBox as="pre" height="md" label=…>` with `whitespace-pre-wrap wrap-anywhere`, so it never scrolls sideways
  (its height stays audit #38's). `ScrollTable` then holds tables only (the guard's rule 4, DR-12). The words "as the
  engine recorded it" (the summary at `line-words.tsx:105` and the label) use a build word the checklist forbids
  (`ux-brand-reviewer.md:82`); this PR already changes the file and its pin, so it takes the wording here, under the
  co-founder's wording ruling: the summary reads **"As PaidWhole recorded it"**, the box **"<step>, as PaidWhole
  recorded it, scrolls"**. The builder updates every spec and test that reads the old words (grep "engine recorded"),
  and the PR description reports it.

### 12.3 Nits

- **DR-11, no print rule.** The web app has no print path, so the `@media print` blocks (2.4, 2.8), section 2.9's Print
  row and the ADR's print sentence are dropped.
- **DR-12, the guard reads imports.** `tables.test.ts` resolves the parent tag to its import binding: a `ScrollTable`
  whose module specifier ends in `/scroll-table` (or is `@/components/scroll-table`), whatever its local name; a local
  component named `ScrollTable` fails. Rule 2 (`createElement` or `jsx('table', …)`) scans `.ts` and `.tsx` (tests
  skipped). Rule 4: a `ScrollTable` element has exactly one element child, a `<table>`. Each rule gets a case in the
  in-memory self-test, and a failure's message names the exemption line to edit (#42's author may meet it first).
- **DR-13, the `StackedRows` wrapper is `@container w-full min-w-0`**, so it never collapses to 0 px in a shrink-to-fit
  parent; test 9 asserts the three classes.
- **DR-14, no `<placeholders>` in Markdown.** TBL-01 reads 'named after its table with ", scrolls sideways" added (a text
  box: ", scrolls")'; the ADR writes 'named "Cases, scrolls sideways" (the table's name, then ", scrolls sideways")';
  backticks wherever a placeholder must stay. `matrix.ts` stays byte-equal to the matrix.
- **DR-15, an e2e time budget.** `tables-phone` test 1 at most the 1280 tour's 480 s, and no CI e2e shard more than 2
  minutes longer than on e908c21. The integrator reports each shard's wall time before and after in the PR
  description. If test 1 is over budget, the admin and specialist contexts move to a third test that builds its own
  journey practice without the pricing tour.
- **DR-16, names that repeat.** "Proposed fields of proposal P, candidate N" (P the proposal's position as its card
  shows it) in `models/display.tsx`; "Fields of rate record N" in `contracts/review.tsx`, matching the card region's
  name. "Receipts" stays (fixed by `exact: true`); dropping the section's own `aria-label` is a proposal (P10).

### 12.4 Re-checked at this fold (14:20 UTC)

- **Base:** `claude/build-platform` is still e908c21.
- **#42** (`co-001/pr-06b-mail-streams`, now 098636e, 188 files): no file this design edits is #42's. Its new
  `app/console/mail/page.tsx` table is `ScrollTable`'s direct child, so if #42 merges first the guard passes it with no
  exemption; its three exempt files still hold 1, 2 and 1 bare tables.
- **ux-forms** (now 4f0b526, 105 files): it also changes `components/action-form.tsx` (DR-07 (a) stays UX PR 34's), ADR
  0056 and `synthetic-personas.ts`; the PR merged second keeps both.

### 12.5 Proposals added

- **P9.** The uploader cuts file names to a hover title (`uploader.tsx:419`); add "never cut to a hover title" to the
  reviewer checklist.
- **P10.** Drop the receipts section's own `aria-label` (`receipts.tsx:143`), so its region and table do not repeat one
  name.

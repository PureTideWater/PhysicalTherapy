# UX PR 4 scout 1: the public screening result page, mapped at a6e754fc

Worktree `/home/user/ux-screening-result-tables` (branch `co-001/ux-screening-result-tables` at `claude/build-platform`
a6e754fc, which holds PR 3, #79). Every line below was re-read at a6e754fc. Paths are relative to `apps/web/src` unless
they start with `apps/`, `docs/`, `tools/`, `packages/` or `.claude/`. "#42" means PR #42's file list
(`scratchpad/pr42-files.txt`, at 6f23c42b); "LANES" means `ops/LANES.md:84-91`, "Not while #42 is open".

## 0. Who owns what

| File | #42 file? | In LANES' list? | Watched by the screening-capacity gate? |
| --- | --- | --- | --- |
| `app/screening/results/[resultId]/page.tsx` | no (not in pr42-files) | arguably ("the screening ... pages", LANES:88) | yes (entry point, `tools/screening-capacity/watched.ts` SCREENING_ENTRY_POINTS) |
| `components/screening/result-view.tsx` | no | no | yes (watched-paths.txt) |
| `components/screening/anomalies.tsx` | no | no | yes |
| `components/screening/coverage.tsx` | no | no | yes |
| `components/screening/result-summary.tsx` | no | no | yes |
| `components/screening/convert-form.tsx`, `opened-signal.tsx` | no | no | yes |
| `components/screening/result.test.tsx` | **yes** (pr42-files:20) | | no (tests left out) |
| `lib/screening/labels.ts`, `labels.test.ts` | no (#42 does not change them) | **yes** (`lib/screening/*`) | labels.ts yes |
| `lib/screening/retention.ts`, `routes.ts` | **yes** (pr42-files:39, :41) | yes | yes |
| `e2e/screening.ts`, `e2e/screening.spec.ts` | **yes** (pr42-files:9, :8) | | |
| `tools/screening-capacity/watched-paths.txt` | **yes** (pr42-files:212) | | (the list itself) |
| `components/stacked-rows.tsx`, `scroll-table.tsx`, `status.tsx` | no | no | scroll-table.tsx and status.tsx yes; **stacked-rows.tsx no** |

#42's own changes to the screening files (three-dot diff from the merge base e908c214df): `result.test.tsx` gains 6
lines at :588-596 only (the kept text); `e2e/screening.ts` changes :8 and :135 (mail env); `screening.spec.ts` +60 lines,
none on the result's tables. labels.ts and labels.test.ts are untouched by #42, so the LANES glob, not a textual
overlap, is what keeps them closed.

## 1. The route

- `/screening/results/[resultId]`: `app/screening/results/[resultId]/page.tsx:25-36`. `metadata` :10 (title "Your
  screening", noindex, no-referrer). Loads `screeningResult` (`lib/screening/routes.ts:957`, a #42 file) through
  `loadPublicPage` (:29), renders `<PublicHeader />` (:32) and `<ScreeningResultView data convert />` (:33).
  `ScreeningResultData` is `routes.ts:871-890`; groups come 50 a page (`SCREENING_GROUPS_PER_PAGE`, routes.ts:891;
  `?groups=N`).
- Siblings: `actions.ts:7` (`convertScreeningAction`), `not-found.tsx:14-...` (its own `<main>`, no table).
- This PR needs no edit to page.tsx: everything it changes is in components.

## 2. What the page renders, in order (`components/screening/result-view.tsx:19-43`)

`<main class="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:p-10" data-slot="screening-result">` (:21), then:

1. `ScreeningOpenedSignal` (:22; `opened-signal.tsx:12-15`, renders nothing).
2. `ScreeningHeading` (:23; `result-summary.tsx:138-152`): h1 "Your free screening" (:142); the lede line (:143-146);
   the kept text (:147-149, `resultRetention`, a legal surface, from #42's `retention.ts`).
3. `ScreeningReleaseWithdrawn` (:24; `result-summary.tsx:155-167`): `Alert variant="destructive"` (danger token, not
   short) when the release was withdrawn.
4. `ScreeningSummary` (:25; `result-summary.tsx:190-288`): cards Your file, Left out before sending, Not screened:
   quarters outside the loaded content, Priced under Medicare, Cannot be priced without a contract, Could not be
   priced, Not screened, and the investigatory note (:283-285). Definition lists of `Stat`s, no tables.
5. `ScreeningAnomalies` (:26; `anomalies.tsx:280-347`): table 1.
6. `ScreeningCoverage` (:27; `coverage.tsx:53-116`): table 2.
7. `ScreeningTopRows` (:28; `anomalies.tsx:350-436`): table 3.
8. `ScreeningConvertForm` (:29; `convert-form.tsx`): the audit request form (fields, no table, no status chip).
9. Links paragraph (:30-40).

Widths: the card content is `min(1024, viewport) − 80 px` (md:p-10) or `− 32 px` (px-4) `− 50 px` (Card border 2 px
plus CardContent `px-6`, `packages/ui/src/components/card.tsx:9, :30`): 894 px from 1024 px up, 308 px (19.25rem) at
390. So a 54rem (864 px) table copy shows from a 994 px viewport up and stacks below it (the 768 to 993 px band
stacks too); a 40rem table shows from 722 px (below md) and from 770 px (md up).

## 3. Shared cell helpers

- `ScreeningMoney` (`result-summary.tsx:83-85`): `font-mono tabular-nums`, `formatUsd` (`packages/money/src/cents.ts:67-70`,
  Intl currency: "$629.00", "-$266.40").
- `ScreeningCount` (:88-90): mono, `toLocaleString('en-US')`.
- `differenceWords` (:96-104): above zero "below {figure}", below zero "above {figure}", else "equal to {figure}".
- `Reduced` (`anomalies.tsx:122-133`): a second figure, or an `aria-hidden` dash plus sr-only "One figure: the code is
  outside the reduction across codes", carrying **`data-figure="one-figure"`** (:126).
- Header and cell classes (`anomalies.tsx:116-120`): HEAD `py-1 pr-3 font-medium`, HEAD_LAST, HEAD_NUMBER (right),
  CELL, CELL_NUMBER (right). The comment at :114-115 still describes the pre-PR 3 hand-rolled region (stale).
- `many(count, one, more)` (`anomalies.tsx:40-42`): grouped digits. `counted()` (`lib/copy/words.ts:8-10`) is used by
  `result-summary.tsx:219, :240` and does **not** group digits ("12345 rows"): two count styles on one page.
- `StatusChip` (`components/status.tsx:23-29`): `data-slot="status-chip"`, `data-tone`, `whitespace-nowrap` (:25);
  tones :15-21 (`unpriced` = `border-status-unpriced bg-status-unpriced-bg text-fg-muted`, Slate text on the unpriced
  rule; `neutral` = `border-border bg-bg-inset text-fg`).

## 4. The three tables

### 4.1 Anomalies by code and payer product (`anomalies.tsx:280-347`)

- Card `data-section="anomalies" data-groups data-page` (:282); `CardTitle id="screening-anomalies"` (:284), text
  `ANOMALIES_TITLE` (:273); `CardDescription` = `anomaliesDescription(page)` (:285; the lede, section 5).
- Empty: `EmptyState` "Nothing priced under Medicare" (:288-289).
- **Wrap since PR 3:** `<ScrollTable label={ANOMALIES_TITLE}>` (:291) around
  `<table class="w-full min-w-[54rem] text-left text-sm" aria-labelledby="screening-anomalies">` (:292). Before PR 3
  (4d99df8:286-287) it was a hand-rolled `overflow-x-auto` region with `data-scroll="anomalies"`.
- Columns (:295-304), 10: Code | Payer product | Rows | Claim lines | `MEDICARE_FIGURE_LABEL` "Expected under Medicare,
  before the reduction across codes" | `REDUCED_FIGURE_LABEL` "Expected under Medicare, fully reduced across codes" |
  "Allowed in your file" (literal) | `DIFFERENCE_LABEL` "Difference, before the reduction across codes" |
  `REDUCED_DIFFERENCE_LABEL` "Difference, fully reduced across codes" | Status.
- Cells (:308-337): `tr class="border-t align-top" data-group="{code}:{product}" data-group-no` (:309); code mono
  (:310); `productLabel` (:311); counts (:312-317); expected (:318-320); `Reduced` (:321-323); observed (:324-326);
  difference (:327-329); `Reduced` difference (:330-332); `GroupStatus` (:333-335).
- Status: `GroupStatus` (:162-167): a group with more than one row that is an anomaly says "Anomaly: {n} of {N rows}
  more than $5 a claim line below their lowest figure" (:164), else `standingWords` (:139-150): "Anomaly: more than $5 a
  claim line below {the fully reduced figure | the Medicare figure}", `WITHIN_REDUCTION_RANGE`, "Below the fully reduced
  figure by $5 a claim line or less" / "Below by $5 a claim line or less", "Allowed is at or above both Medicare
  figures" / "Allowed is {differenceWords}".
- **Tone:** `Standing` (:153-159): `tone={standing === 'anomaly' ? 'short' : 'neutral'}` (:155), with
  `data-anomaly` and `data-standing`.
- Footer `OtherGroups` (:230-270): `tfoot tr data-group="others"` (:236), "The other {N groups}, summed" plus a note
  (:237-240), 7 sum cells (:241-261), chip `tone={others.anomalyGroups > 0 ? 'short' : 'neutral'}` with `data-anomaly`
  (:263), "No group among them is an anomaly" / "{N groups} among them is/are anomalies" (:264).
- Pages: `GroupPages` (:199-223), `nav data-slot="group-pages"`, outside the table.
- Brand order: the columns are already expected, expected, paid, short, short, together. `brandOrderProblems`
  (`components/stacked-rows.tsx:154-173`) returns nothing for that order **if** both Medicare figures take
  `figure: 'expected'` and both differences `figure: 'short'` (a repeated role in a row is in order). PR 3's design
  sketch (`ops/designs/lane-b-ux-table-scroll.md` §3.6) gives the reduced columns `mono: true`, which the check would
  flag ("stands between the figures"). So DR-08's "reorder the columns" needs no column move; it needs the roles.

### 4.2 Rows with the largest differences (`anomalies.tsx:350-436`)

- Card `data-section="top-rows"` (:353); `CardTitle id="screening-top-rows"` (:355), `TOP_ROWS_TITLE` (:274);
  description (:356-360; section 5). At most 25 rows (`shown`, :350-351). Empty: no table (:362).
- **Wrap since PR 3:** `<ScrollTable label={TOP_ROWS_TITLE}>` (:364), table `min-w-[54rem]` (:365) (4d99df8:359-360 was
  a hand-rolled region `data-scroll="top-rows"`).
- Columns (:368-383), 16: Row | Code | Modifiers | Units | Place of service | Payer product | Quarter | **Claims** (:375) |
  `MEDICARE_LINE_LABEL` "One claim line, expected under Medicare, before the reduction across codes" |
  `MEDICARE_FIGURE_LABEL` | `REDUCED_LINE_LABEL` "One claim line, expected under Medicare, fully reduced across codes" |
  `REDUCED_FIGURE_LABEL` | Allowed in your file | `DIFFERENCE_LABEL` | `REDUCED_DIFFERENCE_LABEL` | Status.
- Cells (:387-427): `tr data-row-no` (:388); row number count (:389-391); code mono (:392); modifiers mono, joined by a
  space or "—" (:393); units count (:394-396); place of service mono (:397); `productLabel` (:398); quarter mono
  `whitespace-nowrap` (:399); claim count (:400-402); four Medicare figures (:403-414, two through `Reduced`); allowed
  (:415-417); two differences (:418-423); `Standing` (:424-426; same short tone).
- Brand order: expected ×4, paid, short ×2, together: passes with the same role assignment.

### 4.3 Coverage, and the rows missing a contract (`coverage.tsx:53-116`)

- Card `data-section="coverage"` (:57); `CardTitle id="screening-coverage"` (:59), `TITLE` (:51); description (:60-62).
- **Wrap since PR 3:** `<ScrollTable label={TITLE}>` (:65), table `min-w-[40rem]` (:66). Before PR 3 (4d99df8:61-62) a
  bare `overflow-x-auto` div with no role, name or tab stop.
- Columns (:69-74), 6: Payer product | Outcome | Reason | Rows | Claim lines | Allowed in your file.
- Cells (:78-108): `tr data-coverage="{product}:{disposition}" data-reason={code}` (:82-83; the key :80 adds reason and
  detail, so `data-coverage` alone is not unique); `productLabel` (:85); `StatusChip tone={toneOf(disposition)}` with
  `dispositionLabel` (:86-88), no data hooks; Reason (:89-98): "—" when none, else **the code in mono `text-xs` (:94)
  above** `unpricedReasonLabel(reason, detail)` (:95); counts and allowed (:99-107).
- Tones `TONES` (:28-35): priced neutral, rates_change_in_band unpriced, unpriced unpriced, contract_required unpriced,
  not_screened neutral, pending neutral; the comment :27 already keeps whole and short off the screening.
- The share sentence sums rows in the component (:54-55, `shareText` :42-48).

### 4.4 Data hooks the tests read (none may repeat in a stacked copy)

`data-section`, `data-groups`, `data-page`, `data-group`, `data-group-no`, `data-row-no`, `data-coverage`,
`data-reason`, `data-anomaly`, `data-standing`, `data-figure="one-figure"`, `data-slot="group-pages"`. Readers:
`result.test.tsx` (#42) :402-539, :548-558; `e2e/screening.spec.ts` (#42) :461, :468, :469, :488-491;
`lib/screening/test-support/render-result.tsx:62-63` counts `data-group-no="` and `data-group="others"`, and
`result-page.large.db.test.ts:305` expects 50 listed (so a repeated `data-group-no` doubles the count and fails).

## 5. The lede and the count sentences

- Page lede (`result-summary.tsx:143-146`): "{practice}, {state} {ZIP}. Screened {utc} under rule release {n} (engine
  {engineVersion})." (the word "engine" is shown, :145).
- Anomalies lede (`anomaliesDescription`, `anomalies.tsx:174-191`): `page.groups === 0` → "No row was priced under
  Medicare, so there is nothing to compare." (:176); else `first` (:181): "No group of {all} is an anomaly." or
  "{many(n,'group')} of {all} is an anomaly / are anomalies."; then `ANOMALY_RULE`; then `second` (:182-185): "{n
  (more) group(s)} is/are within the range of the reduction across codes: between its/their two figures, which is not
  an anomaly."; then "Largest difference from the lowest figure first."; then, with pages, "This page lists groups {a}
  to {b}; the table’s last row sums the other {n}, and the pages below list them." (:186-189). No word on which way
  the difference's sign runs.
- Top rows (`anomalies.tsx:357-359`): "The {n} priced rows with the largest differences from their lowest figure, the
  largest first, each by its number in your file. A row is below a figure where that difference is above zero. The
  figure for one claim line is the engine’s before sequestration, rounded once; the row’s figure is it times the claim
  count. A code in the reduction across codes has a second figure ...; a code outside it has one. {ANOMALY_RULE}".
- Coverage (`coverage.tsx:60-62`): "What the screening could do with each row of your file, by payer product. {share}
  of the rows ({a} of {b}) cannot be priced without a contract."
- Footer and chips: `anomalies.tsx:238`, :264, :164; pages `:215-218` ("Page {p} of {n} ({many groups})").
- Summary: "Original Medicare and Medicare Advantage rows without a contract: {counted rows}, {counted claim lines}.
  {MEDICARE_FIGURE_NOTE}" (`result-summary.tsx:219`, ungrouped digits); "{counted} of a code in the reduction across
  codes fully reduced; ..." (:240); "Allowed in your file is {below|above|equal to} {figure} in total." (:232, :248);
  Could not be priced: "Medicare rows the engine left without a price, or whose rates change inside the quarter; the
  reasons are under coverage below." (:267).

## 6. The labels and where they come from

- `lib/screening/labels.ts` (LANES list): `BEFORE_REDUCTION` :21, `FULLY_REDUCED` :27, `MEDICARE_FIGURE_LABEL` :34,
  `REDUCED_FIGURE_LABEL` :37, `MEDICARE_LINE_LABEL` :40, `REDUCED_LINE_LABEL` :43, **`DIFFERENCE_LABEL` :46**,
  **`REDUCED_DIFFERENCE_LABEL` :49**, `BEFORE_REDUCTION_FIGURE` :52, `REDUCED_FIGURE` :55, `ONE_FIGURE` :58,
  `WITHIN_REDUCTION_RANGE` :61, `MEDICARE_FIGURE_NOTE` :68-69, `SCREENING_STANDINGS` :76, `ANOMALY_RULE` :80-81,
  `leftOutNote` :89-94, `outsideContentNote` :104-111, `SCREENING_INVESTIGATORY_NOTE` :114-115 ("... nothing here is a
  finding about a payer"), `PRODUCT_LABELS` :120-127, `PRODUCT_NOTES` :130-137, `productLabel` :139-141,
  `DISPOSITION_LABELS` :147-154, `dispositionLabel` :156-158, **`DISPOSITION_NOTES` :161-168 (rendered nowhere; its
  `unpriced` note :164 is "The engine left the row without a price ...")**, `DETAIL_LABELS` :174-190 (**:175
  `place_of_service_unmapped`: "The place of service is not in the approved place-of-service split"**),
  `unpricedReasonLabel` :192-198 (closed-list meaning from `lib/contracts/remedies.ts`, or the detail's words).
- Literals in components (not versioned): "Code", "Payer product", "Rows", "Claim lines", "Allowed in your file",
  "Status", "Row", "Modifiers", "Units", "Place of service", "Quarter", "Claims", "Outcome", "Reason", every
  `standingWords` string, every lede.
- **The version pin.** `SCREENING_LABELS_VERSION = 'screening-labels/2026-11-05'` (labels.ts:18). `labels.test.ts:16-30`
  hashes every exported non-function value plus `leftOutNote`, `outsideContentNote`, `unpricedReasonLabel('ENGINE_ERROR',
  d)` over every engine detail, the products and the dispositions, and :33-42/:75-79 pin the hash to the version. The
  database's `screening_labels_version()` (`packages/db/functions/screening_labels_version.sql:8-15`; migrations
  20261104090000:223, 20261105090000:683) returns the same, held equal by `routes.db.test.ts:1179` and
  `packages/db/src/screening.db.test.ts:1665`; a kept summary records it (SCR-11; ADR 0062:421-422). So any change to
  DIFFERENCE_LABEL, REDUCED_DIFFERENCE_LABEL, DISPOSITION_NOTES or DETAIL_LABELS changes the hash. Precedent
  (labels.test.ts:35-41): while the version is "unreleased until PR 6b merges", a reword re-pinned the hash under the
  same name, with no migration. After #42 (PR 6b-4) merges, the safe reading is that a label change needs a new
  version, which means `screening_labels_version()` in a new migration: Lane A, with the domain-model approval.
- **Who imports labels.ts:** `components/screening/anomalies.tsx:4-17`, `coverage.tsx:4`, `result-summary.tsx:6-17`,
  `result.test.tsx:22` (#42), `app/screening/page.tsx:9` (#42; `MEDICARE_FIGURE_LABEL`, `PRODUCT_NOTES`,
  `REDUCED_FIGURE_LABEL`, `productLabel`), `lib/screening/labels.test.ts:6` (LANES), `lib/screening/routes.ts:52` (#42;
  `SCREENING_STANDINGS`), `lib/screening/routes.db.test.ts:14` (#42; the version), `apps/web/e2e/screening.spec.ts:9`
  (#42; `MEDICARE_FIGURE_LABEL`, `REDUCED_FIGURE_LABEL`, `WITHIN_REDUCTION_RANGE`). No worker file imports it.
- Other label sources on the page: `lib/screening/retention.ts` (#42; kept text, legal surface), `lib/copy/words.ts`
  (`counted`), `lib/zip.ts` (`zipCodeText`), `components/format.ts` (`utc`, `utcDate`).

## 7. The six findings at a6e754fc

### UX-005 (C-008), blocking: phones hide Allowed, Difference and Status. **Partly fixed by PR 3.**
- Fixed: all three tables are now in `ScrollTable` (`anomalies.tsx:291`, `:364`; `coverage.tsx:65`), each a named,
  focusable region with the edge fade and the caption while it overflows; Coverage has its tab stop (the 2.1.1 part).
  `result.test.tsx:478-485`, `:556-560` pin it.
- Still present: no stacked rows (`StackedRows` is adopted nowhere); on a phone each row still scrolls sideways, so
  expected, allowed and difference stand apart and Status is off screen. The 390 px check does not exist
  (`e2e/screening-phone.spec.ts` is new; TBL-03 leaves this route to this PR).
- Still present at 1280 (estimate, to measure): the status chip is `whitespace-nowrap` (`status.tsx:25`), so a cell
  like "Anomaly: 2 of 2 rows more than $5 a claim line below their lowest figure" is about 430 to 450 px; with nine
  other columns the anomalies table's min-content is about 1,150 px and the top-rows table's (16 columns) about 1,200
  px, against the 894 px card. Both would still overflow at 1280 (with the cue now), and a 54rem `stackBelow` would
  show the table copy overflowing there.
- The fix needs: `StackedRows` around each of the three tables (`components/stacked-rows.tsx:126-147`), one `COLUMNS`
  constant per table read in order for the `<th>`s and the fields (DR-08), roles `expected` (both Medicare figures, all
  four in top rows), `paid` (allowed), `short` (both differences), `stackBelow` equal to the table's `min-w` (54rem,
  54rem, 40rem); headings: anomalies `<mono code>, {product}`, top rows "Row {n}" plus code and product, coverage
  `{product}` and outcome; the "other groups, summed" footer as the last stacked item (its own hook); stacked hooks
  `data-stacked-…` that never repeat a table hook (section 4.4); a status cell that lets its chip wrap with a floor in
  the table copy (ADR 0078 Decision 1, "the cell gives way instead") so the anomalies table can fit at 1280, measured;
  and the new spec at 390 and 1280. See section 8 for what that collides with.

### UX-040 (C-107): an anomaly in Short's colour. **Still present.**
- `anomalies.tsx:155` (`'short'` for the anomaly, was 4d99df8:151-157) and `:263` (the others row, was :262). The
  words are unchanged and right. ADR 0056's table now puts "Flagged (investigatory) | unpriced" at
  `docs/adr/0056-...md:86` (the finding cited :80). `.claude/rules/brand.md:26-28`; `docs/brand/BRAND.md:132-136`.
- These are the only two short or whole tones on any screening surface (grep of `components/screening`,
  `app/screening`, `app/console/screening`); `Alert variant="destructive"` maps to `--pw-danger`, not Short.
- The fix needs: `tone={standing === 'anomaly' ? 'unpriced' : 'neutral'}` at :155 and the same at :263; the doc
  comment :152 reworded; a test that no screening component renders `data-tone="short"` or `"whole"` (render all of
  them, plus a source check of `components/screening/*.tsx` and `app/screening/**`). Careful: a stacked dd carries
  `data-stacked-figure="short"`, so the test must match `data-tone=`, not the word "short". It breaks #42's
  `result.test.tsx:430`, `:431` (expect `data-tone="short"`) and `:510` (others row `data-tone="short"`).

### UX-042 (C-118): the Difference columns never say which way the sign runs. **Still present.**
- `labels.ts:46`, `:49` unchanged; the oblique sentence moved to `anomalies.tsx:359` (was :354); the anomalies lede
  (:174-191) says nothing of the sign; only the summary explains it (`result-summary.tsx:232`, `:248`). The subtraction
  is expected less allowed (`result-summary.tsx:43`; fixture 97110: $368.40 − $340.00 = $28.40).
- The fix needs two parts with different owners. (a) The sentence, in scope now: the anomalies lede and the top-rows
  text gain "Each difference is the Medicare figure less the allowed amount in your file: a positive figure means the
  allowed amount in your file is below Medicare's figure; a negative one, above it." (replacing :359's "A row is below a
  figure where that difference is above zero."). (b) The header rename to "Medicare figure less allowed, before the
  reduction across codes" / "..., fully reduced across codes" is `labels.ts:46`, `:49` (LANES list, the version hash),
  shown also by the summary's Stats (`result-summary.tsx:230`, `:246`), and pinned literally by #42's
  `result.test.tsx:273`. A local header constant in anomalies.tsx would give one figure two names on one page and leave
  the versioned label wrong, so (b) is not done locally.

### UX-043 (C-119): the top-rows table heads its claim-line count "Claims". **Still present.**
- `anomalies.tsx:375` (was :370). Not pinned by any test (`result.test.tsx`, `screening.spec.ts` grep).
- The fix needs: "Claim lines" in the top-rows `COLUMNS`; and :359's "times the claim count" → "times its claim lines"
  so the text uses the same noun.

### UX-132 (C-061): ENGINE_ERROR and "the engine" shown to a prospect. **Still present.**
- The code above its words: `coverage.tsx:94-95` (was :90-91). The detail's words: `labels.ts:175`. "the engine":
  `result-summary.tsx:267`; `labels.ts:164` is `DISPOSITION_NOTES.unpriced`, which **no screen renders** (only the
  hash reads it). Two more the finding did not cite: `anomalies.tsx:359` ("the engine’s before sequestration") and
  the lede's "(engine {version})" (`result-summary.tsx:145`). The reviewer checklist forbids "the engine"
  (`.claude/agents/ux-brand-reviewer.md:81-82`) and puts words before codes (:79).
- The public result has no CSV; the code stays in `data-reason` (`coverage.tsx:83`) only.
- The fix needs, in scope now: drop the mono code span (:94), keep `data-reason`; :267 → "Medicare rows PaidWhole could
  not price, or whose rate changes inside the quarter. Coverage, below, gives each reason."; :359 → "PaidWhole's
  figure for one claim line, before sequestration, rounded once"; and a decision on :145 (see open questions). Needs
  the labels' owner: `labels.ts:175` → "This place of service is in neither the facility nor the non-facility list a
  screening prices by, so the row has no Medicare figure." (hash; pinned by #42's `result.test.tsx:550` and
  `screening.spec.ts:461`); `labels.ts:164` (invisible; hash only).

### UX-206 (C-203): "1 group of 4 is an anomaly." **Still present.**
- `anomalies.tsx:181` (was :180). Pinned by #42's `result.test.tsx:411`, `:420`, `:423`, `:501`, `:503`.
- The fix needs: "{n} of {all} groups is an anomaly / are anomalies." and "None of the {all} groups is an anomaly.",
  digits grouped; plus the case the review's words miss, a result of one group ("1 of 1 groups", "None of the 1
  groups"): "The one group is an anomaly." / "The one group is not an anomaly." The `second` sentence (:182-185) reads
  on unchanged. Unit cases 0, 1, 2 anomalies and 1 group.

## 8. Constraints the design must resolve (found here)

1. **#42's `result.test.tsx` breaks.** UX-040 (:430, :431, :510) and UX-206 (:411, :420, :423, :501, :503) cannot land
   without changing assertions in a #42 file; the status file's "unit tests go in a new file" does not cover it. #42's
   own hunk is :588-596, so the edits merge cleanly, but the rule forbids them. Options: an explicit exception for
   those lines; or hold UX-040 and UX-206 until #42 merges; or have #42 carry them.
2. **The labels and their version.** UX-042 (b) and UX-132's two label lines need `labels.ts` + `labels.test.ts`
   (LANES list, no textual overlap with #42) and break #42's `result.test.tsx:273`, `:550` and `screening.spec.ts:461`.
   Before #42 merges, the hash can be re-pinned under the unreleased version (precedent :35-41); after it merges, a
   new version means a migration for `screening_labels_version()` (Lane A). Options: an exception now; hand the words
   to #42 to carry under the same version; or record them "after #42" knowing that means a migration.
3. **The capacity gate's watch list.** Importing `StackedRows` (or any new module) from anomalies.tsx or coverage.tsx
   adds `apps/web/src/components/stacked-rows.tsx` to the derived list, and `tools/screening-capacity/watched.test.ts:
   18-20` fails until `watched-paths.txt` (#42, pr42-files:212) is regenerated. PR 3 avoided a new module for this
   reason (`scroll-table.tsx:5-12`). The line sorts after `components/scroll-table.tsx` (:55); #42's hunks are in
   `lib/screening` and the worker, so it merges cleanly, but it is a #42 file. Every change here also triggers the
   capacity measurement on the PR (the three components are watched).
4. **`repeatedIds` and the inner hooks.** `StatusChip`'s `data-anomaly`/`data-standing` (:155, :263) and `Reduced`'s
   `data-figure="one-figure"` (:126) would render in both copies; `repeatedIds` (`stacked-rows.tsx:187-214`) flags them
   (only `data-slot`, `data-tone`, `data-scroll`, `data-scroller`, `data-axis` are exempt, :179), and #42's
   `result.test.tsx:418` counts `data-anomaly="true"` as 2. `Standing`, `GroupStatus`, `OtherGroups`' chip and
   `Reduced` need a `copy` (or `hooks`) prop so the stacked copy carries `data-stacked-…` or none.
5. **Locators.** `screening.spec.ts:469` takes the first `status-chip` in `[data-section="anomalies"]`; the table copy
   comes first in the DOM and shows at the spec's 1280 viewport (Desktop Chrome), so it passes; `:468` and `:488-491`
   pass while the stacked copy carries no `data-group`. The new spec scopes to `[data-stacked-copy]` or `:visible`.
6. **HTML size.** The worst shape renders about 140 KB (ADR 0062:366); `result-page.large.db.test.ts:314` caps it at
   512 KB. Stacked copies of 50 groups and 25 rows roughly double the tables' markup: expect under the cap, measure.
7. **A phone's top rows.** 25 stacked rows × 16 fields (four of them long Medicare labels) is a long list at 390;
   "stacked rows hold every column" is the requirement, so the design should say so and accept it, or group each row's
   Medicare figures under one heading.

## 9. In-scope improvements found (for the author)

- `result-summary.tsx:219`, `:240` count through `counted()` without digit grouping while every other count on the
  page groups; use the grouped helper (move `many`, `anomalies.tsx:40-42`, to one place both read).
- The stale comment `anomalies.tsx:114-115` (the hand-rolled region) and `:152` ("an anomaly in the short tone").
- The anomalies lede puts `ANOMALY_RULE` between the count and the "within the range" sentence (:190); the count
  sentences read better together, then the rule.

## 10. Proposals outside this PR

- `counted()` (`lib/copy/words.ts:8-10`) groups no digits app-wide ("12345 rows"); group them (words.test pins).
- `DISPOSITION_NOTES` (`labels.ts:161-168`) and `PRODUCT_NOTES` are exported for no result screen
  (`PRODUCT_NOTES` only on #42's upload page); drop the unused one at the next labels version.
- The figure labels say "Expected under Medicare", yet UX-042's notes say "expected" is the contract word a screening
  never has; at the next labels version consider "Medicare figure, before the reduction across codes" for the figures
  too, so headers and differences share one noun.
- `StatusChip` is `whitespace-nowrap` in every table cell; a status cell variant that wraps with a floor would help
  every long-status table, not only the screening's.

## 11. Open questions for the author

- Exceptions for #42's `result.test.tsx` lines (8.1), `labels.ts`/`labels.test.ts` and the two #42 pins (8.2), and
  `watched-paths.txt`'s one line (8.3): who rules (the co-founder, under LANES rule 6 and the delegation), or which
  parts wait.
- Is `screening-labels/2026-11-05` released once #42 merges? If yes, "after #42" for a label means a migration.
- The lede's "(engine {version})" (`result-summary.tsx:145`; `result.test.tsx:366-368` pins only `engine/1` itself):
  reword ("PaidWhole's pricing version {v}") here, or leave it as a version identifier.

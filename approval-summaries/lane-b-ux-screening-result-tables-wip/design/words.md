# UX PR 4 scout 3: the words and tones, mapped at a6e754fc

Worktree `/home/user/ux-screening-result-tables` (`co-001/ux-screening-result-tables` at `claude/build-platform`
a6e754fc). Every line number is re-checked at a6e754fc; the review's (4d99df8) is given where it moved. #42 is
`co-001/pr-06b-mail-streams` at 6f23c42b. Synthetic data only.

## 0. Three facts that constrain every word here

### 0.1 `labels.ts` is locked by #42 and its words are versioned

- Locked: LANES.md:88 lists `apps/web/src/lib/screening/*` under "Not while #42 is open". #42 does not change
  `labels.ts` or `labels.test.ts` textually (three-dot diff from e908c214), so the lock is the glob, not an overlap.
- Versioned: `SCREENING_LABELS_VERSION = 'screening-labels/2026-11-05'` (`labels.ts:13-18`). `labels.test.ts:8-13,
  16-30, 33-42, 78` pins a SHA-256 of every export (strings, lists, and what `leftOutNote`, `outsideContentNote`,
  `unpricedReasonLabel` for every engine detail, `productLabel` and `dispositionLabel` say). The database's
  `screening_labels_version()` must return the same (`packages/db/functions/screening_labels_version.sql:8-15`;
  migration `20261105090000_pricing_location_and_zip_plus_four.sql:681-683`; held equal by #42's
  `packages/db/src/screening.db.test.ts:1663-1665`), and `screening_freeze_lead()` copies it into
  `screening_lead.labels_version` (ADR 0062:421-422).
- Released when? `labels.test.ts:35-41`: "Unreleased until PR 6b merges, so the version keeps the name its
  migration's screening_labels_version() returns"; PR 6b-2's review re-pinned reworded labels under the same name
  (commit dfec40dc: "the labels stay unreleased under screening-labels/2026-11-05"). #42 is PR 6b-4, the series' last
  part (LANES.md:84). So a label reworded **before #42 merges** re-pins the hash under 2026-11-05 with no migration;
  **after** it, a new version, a migration for `screening_labels_version()`, its #42-owned database test and the
  domain model: a schema PR (Lane A, LANES.md:93) for a words change.
- Rule for the design: never shadow a pinned label with a component string (a `<th>` that shows other words than
  `DIFFERENCE_LABEL`, or coverage showing other words than `unpricedReasonLabel()`). The kept summary would then name
  a version whose words the page did not show. Component words that were never in `labels.ts` (the count sentence,
  the standing words, "Claims") are not versioned and may change freely.

### 0.2 The words and tones are pinned in #42's files

`apps/web/src/components/screening/result.test.tsx` and `apps/web/e2e/screening.spec.ts` are #42's
(pr42-files.txt:8, :20). #42's own hunk in `result.test.tsx` is :588-593 (the coded address), and in
`screening.spec.ts` its changes shift the result step by +48 without touching its words. The pins:

| Change | Pinned at (base lines) | Breaks? |
| --- | --- | --- |
| UX-040 anomaly tone short -> unpriced | `result.test.tsx:430`, `:431`, `:510` (`data-tone="short"`) | yes |
| UX-206 count sentence | `:411`, `:420`, `:423`, `:501`, `:503` | yes |
| UX-042 anomalies `<th>` words (any change, a nested span too: the regex is `([^<]*)`) | `:401` | yes |
| UX-042 top-rows header | `:531` (`toContain(DIFFERENCE_LABEL)`) | yes if replaced; holds if the label stays a substring |
| UX-042 summary card's label | `:273` (dt text literal) | yes if `DIFFERENCE_LABEL` changes |
| UX-042 sentence (top-rows description, `anomalies.tsx:359`) | none | holds |
| UX-043 "Claims" -> "Claim lines" (`anomalies.tsx:375`) | none | holds |
| UX-132 drop the mono code in coverage (`coverage.tsx:94`) | `:550` regex keys on `data-reason`, kept | holds |
| UX-132 reason words (`labels.ts:175`) | `:550`; `screening.spec.ts:461` (#42 head :509) | yes |
| UX-132 "the engine" in `result-summary.tsx:267` | none | holds |
| "(engine ...)" label in the heading (`result-summary.tsx:145`) | `:366-368` pins only the value `engine/1` | holds |
| "Below by $5 a claim line or less" -> names its figure (`anomalies.tsx:146`) | `:432` | yes |
| The anomaly chip's own words | `screening.spec.ts` #42 head :539 | unchanged, holds |

The tests scout maps the same pins (progress/p4-scout-tests.md); the screen scout's 8.1 and 8.2 agree.

### 0.3 Lint and closure reach every component file

- `tools/brand-copy/scan.ts:51-61`: `COPY_ROOTS` starts with `apps/web/src`, so every `components/screening/*.tsx`
  is read. `isScreeningFile` (:235-237) applies owed, underpaid and recovered (`SCREENING_TERMS`, :125-129) to any
  path with a `/screening/` directory. Tests and `e2e` are skipped (:85, :231-233). So a word written in
  `components/stacked-rows.tsx` would not get the screening rules: every screening word must be authored in a
  `components/screening/` file and passed in as a prop (it is then a literal in that file, which the lint reads; a
  one-token value such as `figure: 'short'` is a code, not copy, scan.ts:33-36).
- The screening-capacity closure (`tools/screening-capacity/watched.ts:31-61`) already holds `anomalies.tsx`,
  `coverage.tsx`, `result-summary.tsx`, `result-view.tsx`, `scroll-table.tsx`, `status.tsx` and `lib/copy/words.ts`
  (`watched-paths.txt:48-56, :75`). `stacked-rows.tsx` is not in it; importing `StackedRows` adds it, so PR 4
  regenerates `watched-paths.txt` anyway (LANES.md:35, rule 6: a generated file is never hand-merged; each
  PR commits its generator's output and the PR merged second runs `watched.ts --write` again).

## 1. UX-040 (C-107): the tone of an anomaly

### What the screening does now

- `anomalies.tsx:152-159`: `Standing` gives `tone={standing === 'anomaly' ? 'short' : 'neutral'}` (review: :151-157).
  Every anomaly chip, in both tables (`GroupStatus` :162-167, top rows :425), is Short's terracotta on its tint.
- `anomalies.tsx:263`: the "other groups, summed" row's chip is `short` when any group among them is an anomaly
  (review: :262).
- `coverage.tsx:27-35`: `unpriced` for rates_change_in_band, unpriced and contract_required; `neutral` otherwise,
  with the comment "whole means paid in full, which a screening never says". No screening file uses `whole`.
- `result-summary.tsx:160`: the withdrawn-release notice is `Alert variant="destructive"` (`text-destructive`,
  `packages/ui/src/components/alert.tsx:10`): a failure, danger, which ADR 0056 names apart from Short. Allowed.

### What the tokens and the brand allow

- Tokens: `packages/brand/src/tokens.css:17-22` (light: whole #1F7A4D, short #B5452E, unpriced #7A8594 and their
  tints), :91-96 (dark); danger is Short's values under its own name (:43, :46). Preset: `tailwind-preset.ts:46-51`.
- `StatusChip` (`apps/web/src/components/status.tsx:4-21`): `short` is `text-status-short` on `bg-status-short-bg`;
  `unpriced` is Slate text (`text-fg-muted`) on `bg-status-unpriced-bg` with `border-status-unpriced` (unpriced's own
  grey is 3.7:1, under 4.5:1, so its hue is the border); `neutral` is Ink on the inset tint.
- `apps/web/src/app/brand.css:40-49`: `.pw-status-*` classes; no component uses them (grep), and
  `.pw-status-unpriced` sets the text to `--pw-unpriced` (3.7:1): see proposal P1.
- `docs/brand/BRAND.md:73-79`: Short means "Paid below the contract"; Unpriced "Could not be priced; the reason is
  always shown". :81-82 text on tint, always with a label; :156-157 never colour alone.
- `.claude/rules/brand.md:26-28` (status colours for data, text on tint, with a label or reason code).
- ADR 0056's tone table, now `docs/adr/0056-...md:86` (review: :80): "Flagged (investigatory) | unpriced | a line
  with no contract price, short of its cohort; never a claim". The product's own flagged line takes it:
  `components/remittances/display.tsx:55` (`flagged: 'unpriced'`).
- `.claude/agents/ux-brand-reviewer.md:88-90`: "an investigatory line unpriced, never Short".
- The product's anomaly screening is investigatory by definition: `docs/product/PRD.md:241` ("labelled investigatory;
  never shown as contract variance"), :352, :492; `docs/product/unpriced-reasons.md:13` (NO_AGREEMENT: "anomaly
  screening only").
- CO-11 (`docs/product/change-order-001.md:95`): "screening never says owed, underpaid or recovered". The screening's
  own rule: `labels.ts:7-11`, `result-summary.tsx:29-31`, the page's note "nothing here is a finding about a payer"
  (`labels.ts:114-115`, shown at `result-summary.tsx:283-285`), BRAND.md:135-136, SCR-05 (`test-matrix.md:190`). Short's
  colour says "paid below the contract", the claim the words refuse.

### Recommendation

- The anomaly takes **unpriced** (Slate text, unpriced border and tint); every other standing stays **neutral**; the
  words do not change. The others row (:263): `unpriced` when `others.anomalyGroups > 0`, else `neutral`.
- Coverage keeps its map (unpriced for no figure). The page then uses one tone for "no Medicare figure" and for "an
  anomaly"; the product accepts the same pairing (ADR 0056:86-87, Flagged and Unpriced both unpriced) and every chip
  carries its words, so no new tone is needed (a new colour is the brand owner's, ADR 0058 D9).
- Comments to fix with it: `anomalies.tsx:152` ("an anomaly in the short tone"), and the stale `:114-115` (the
  hand-rolled region PR 3 replaced).
- The test (in the new unit file, not #42's): render `ScreeningAnomalies` (with anomalies and an others row that has
  some), `ScreeningTopRows`, `ScreeningCoverage`, `ScreeningSummary` and `ScreeningHeading`; assert no
  `data-tone="short"`, no `data-tone="whole"`, and no `status-short` or `status-whole` class in any of them; and that
  every `data-anomaly="true"` chip has `data-tone="unpriced"`. The danger Alert is not a status tone and stays.
- A stacked field's `figure: 'short'` renders only `data-stacked-figure="short"` and the mono face
  (`stacked-rows.tsx:97-105`), never a tone or a word: an order role, allowed (section 6).

## 2. UX-042 (C-118): which way the Difference runs

### The sign at a6e754fc

- Each difference is the Medicare figure less the allowed amount: `result-summary.tsx:43` ("Expected less allowed:
  above zero, the file's allowed total is below the figure"), `routes.ts:745, :751, :799`; the synthetic group
  97110 at `result.test.tsx:402`: $368.40 and $314.50 less $340.00 give $28.40 and -$25.50. Positive means the
  allowed amount in the file is below that figure; negative, above it.
- Headers: `DIFFERENCE_LABEL = 'Difference, before the reduction across codes'` (`labels.ts:46`),
  `REDUCED_DIFFERENCE_LABEL = 'Difference, fully reduced across codes'` (:49), used at `anomalies.tsx:302-303,
  381-382` and the summary card `result-summary.tsx:230, :246`.
- In words today: only the summary card (`result-summary.tsx:232, :248`, "Allowed in your file is below ... in total",
  through `differenceWords` :96-104) and every row's Status (`standingWords`, `anomalies.tsx:139-150`). The top-rows
  description says it obliquely: "A row is below a figure where that difference is above zero." (`anomalies.tsx:359`;
  review: :354). The anomalies card's description says nothing of the sign (`anomaliesDescription` :174-191).

### The product's own words

- `components/reports/documents.tsx:175`: "variance is expected allowed less observed allowed".
- `app/p/[practiceId]/pricing-runs/[runId]/page.tsx:411`: "Expected allowed less observed allowed, over the priced
  lines."
- `app/p/[practiceId]/remittances/[remittanceId]/page.tsx:105`: "A positive amount reduced this payment; a negative one
  added to it." (the pattern of the ruled sentence).
- ADR 0056 Tables: "the variance is expected allowed less observed allowed". "Expected" is the contract word (BRAND.md
  section 6), so the review chose "Medicare figure"; the page's sentences already call it that (`ONE_FIGURE`,
  `labels.ts:58`; `ANOMALY_RULE` :80-81).

### Recommended words

- Headers (the co-founder's ruled words, review 6.1 line 1330): **"Medicare figure less allowed, before the reduction
  across codes"** and **"Medicare figure less allowed, fully reduced across codes"**. They are `labels.ts:46` and
  `:49`, so they change there, in both tables and the summary card at once (one name per thing), and re-pin the hash
  (0.1). D19 a's qualifier is kept.
- The sentence, once per card that shows differences: **"A positive difference means the allowed amount in your file is
  below the Medicare figure; a negative one, above it."** Two words depart from the ruled sentence ("A positive
  figure ... below Medicare's figure"): "figure" is this page's noun for the Medicare figure, so "a positive figure"
  names two things in one sentence; and "Medicare's figure" says Medicare computed it, where PaidWhole priced it from
  Medicare's fee schedule (and a pooled code has two). Report the departure in the PR description; the ruled
  sentence is the fallback if the co-founder holds it.
- Where the sentence goes: the top-rows description replaces "A row is below a figure where that difference is above
  zero." (`anomalies.tsx:359`, unpinned); the anomalies description gains it after `ANOMALY_RULE` (pinned with UX-206,
  same lines).
- Not taken: a header suffix in the component ("Difference, before ...: Medicare figure less allowed"). It breaks
  `:401` all the same, leaves the summary card's label behind, and is churn once the label changes.
- If `labels.ts` cannot change before #42 merges, UX-042 lands in part: the sentence now (top rows), the anomalies
  sentence with UX-206, the headers recorded "after #42: needs a new labels version and its migration".

## 3. UX-043 (C-119): the top rows' count

- `anomalies.tsx:375` (review: :370) heads `row.claimCount` (`:401`) "Claims". The file's column guide defines
  `claim_count` as "How many claim lines the row sums" (`lib/screening/template.ts:46`); every other card says "Claim
  lines" (`anomalies.tsx:298`, `coverage.tsx:73`, `result-summary.tsx:121`).
- Recommend **"Claim lines"**, and the description's "the row's figure is it times the claim count" (`:359`) becomes
  "the row's figure is that times its claim lines" (one noun for the count across the page). Both unpinned.
- One constant for the shared column words (in-scope option): export `CLAIM_LINES = 'Claim lines'` and
  `ALLOWED_IN_FILE = 'Allowed in your file'` from `result-summary.tsx`, which `anomalies.tsx:20` and `coverage.tsx:7`
  already import (no closure change), and read them in every table, stacked field and `GroupStats` (:118-126,
  :227, :243). Values unchanged, so `:401` holds.

## 4. UX-132 (C-061) and UX-206 (C-203)

### UX-132: the raw code and "the engine"

| Where (a6e754fc) | Now | Recommended | Lives in | Pinned |
| --- | --- | --- | --- | --- |
| `coverage.tsx:94` (review :90) | `<span class="font-mono text-xs">ENGINE_ERROR</span>` above the words | dropped from the public result; the code stays in `data-reason` (:83). There is no result CSV (the finding's "and in the CSV" has nothing to point at). | component | holds `:550` |
| `labels.ts:175` (`place_of_service_unmapped`) | "The place of service is not in the approved place-of-service split" | "This place of service is in neither the facility nor the non-facility list a screening prices by, so the row has no Medicare figure." (ruled) | `labels.ts`, re-pinned | `:550`, `screening.spec.ts:461` (#42 :509) |
| `result-summary.tsx:267` | "Medicare rows the engine left without a price, or whose rates change inside the quarter; the reasons are under coverage below." | "Medicare rows PaidWhole could not price, or whose rate changes inside the quarter. Coverage, below, gives each reason." (ruled) | component | holds |
| `labels.ts:164` (`DISPOSITION_NOTES.unpriced`) | "The engine left the row without a price, for the reason shown." | No screen renders `DISPOSITION_NOTES` (grep of apps, packages, tools: only `labels.ts` and its hash). Drop the constant at the labels change, or take the ruled "PaidWhole could not price the row, for the reason shown." | `labels.ts` | hash only |
| `anomalies.tsx:359` (found here) | "The figure for one claim line is the engine's before sequestration, rounded once" | "PaidWhole prices one claim line before sequestration and rounds it once; the row's figure is that times its claim lines." | component | holds |
| `result-summary.tsx:145` (found here) | "(engine phase-two/2)": the build word and the engine's internal version (`packages/pricing/src/trace.ts:22`) | "(pricing version phase-two/2)": the build word goes, the provenance stays; the internal name itself is proposal P4 | component | holds (`:366-368` pins the value) |

Customers' screens keep code and words: `unpricedReasonLabel` is read only by `coverage.tsx:95`; the practice's
Coverage screen uses `lib/contracts/remedies` directly. The new words pass the screening lint (no owed, underpaid,
recovered).

### UX-206: the count on the right noun

- Now: `anomalies.tsx:181` (review :180): "No group of 4 is an anomaly." / "1 group of 4 is an anomaly." / "2 groups
  of 5 are anomalies."; the within sentence :182-185; the order `${first} ${ANOMALY_RULE}${second} Largest ...` :190.
- Recommended closed set (digits grouped with `toLocaleString('en-US')`, as `many` does, :40-42):

| Groups | Anomalies | First sentence |
| --- | --- | --- |
| 0 | - | "No row was priced under Medicare, so there is nothing to compare." (unchanged, :176) |
| 1 | 1 | "The only group is an anomaly." |
| 1 | 0 | "The only group is not an anomaly." (with it within the range: "The only group is within the range of the reduction across codes: between its two figures, which is not an anomaly." in place of both sentences) |
| n >= 2 | 0 | "None of the 4 groups is an anomaly." (ruled) |
| n >= 2 | 1 | "1 of 4 groups is an anomaly." (ruled) |
| n >= 2 | 1 < a < n | "2 of 4 groups are anomalies." (ruled); "12,345 of 20,507 groups are anomalies." |
| n >= 2 | n | "All 4 groups are anomalies." |

- Then the within sentence, unchanged in words ("1 more group is within the range ...", "2 groups are within ..."
  after "None"), then `ANOMALY_RULE`, then the UX-042 sentence, then "Largest difference from the lowest figure
  first." and the page sentence. The two counts read together before the rule (the screen scout's 9 agrees). Example:
  "1 of 4 groups is an anomaly. 1 more group is within the range of the reduction across codes: between its two
  figures, which is not an anomaly. A row is an anomaly when ... A positive difference means ... Largest difference
  from the lowest figure first."
- Unit cases: 0, 1 and 2 anomalies (prs.json), all, and the one-group case.
- Kept: the others row's chip ("1 group among them is an anomaly", :264) and `GroupStatus` ("Anomaly: 2 of 3 rows
  ...", :164) already put the count on its noun.
- Found with it: "Below by $5 a claim line or less" (`anomalies.tsx:146`) names no figure, while its pooled twin does
  ("Below the fully reduced figure by ..."). Recommend "Below the Medicare figure by $5 a claim line or less" (pinned
  `:432`; lands with UX-206's pins).

## 5. Where each new or changed string lives

| String | Home | Why |
| --- | --- | --- |
| Tone of a standing | `anomalies.tsx` (`Standing`, `OtherGroups`) | the component picks it; the primitive never does (ADR 0078 D5) |
| Count sentence, the UX-042 sentence in the anomalies lede | `anomalies.tsx` (`anomaliesDescription`, exported already) | component words, not versioned |
| "Claim lines", the top-rows description | `anomalies.tsx` (or the shared constants from `result-summary.tsx`, 3) | unpinned, in the closure |
| Column labels in order, for `<th>` and stacked fields | one exported `COLUMNS` array per table in `anomalies.tsx` (two) and `coverage.tsx`, its entries reading `labels.ts`'s constants where they exist | DR-08: one constant read in order for both copies |
| Stacked headings, the others item's note | the same component files | screening lint applies only under `/screening/` |
| Difference headers, the place-of-service reason | `labels.ts` (re-pinned under 2026-11-05 before #42 merges, or the next version after) | versioned words; never shadowed in a component |
| "PaidWhole could not price ...", "(pricing version ...)" | `result-summary.tsx` | component words |

- No new module. A `components/screening/words.ts` would be a third home for the screening's words beside `labels.ts`
  (versioned) and the components (not): words would drift out of the version by default. It would also join the
  closure; that is allowed (LANES.md rule 6, regenerate `watched-paths.txt`), and PR 4 regenerates it for
  `stacked-rows.tsx` anyway, so the closure is not the reason. PR 3's precedent (`scroll-table.tsx:5-11`, functions
  kept in the file the screening page already imports) points the same way.
- The new unit file imports the exported `COLUMNS`, `anomaliesDescription` and the components, never a copy of a
  string (except the ruled literals the test pins).

## 6. The brand's order on the screening's figures, and DR-08

- The rule: `.claude/rules/brand.md:36-37`; `BRAND.md:123-124`; ADR 0056 "Tables: expected, paid, short" ("paid" is the
  observed allowed amount); TBL-04 (`test-matrix.md:332`): "expected, paid and short are given together and in that
  order, and the stacked rows keep the table's column order".
- The check: `brandOrderProblems` (`stacked-rows.tsx:154-173`) fails a figure after one the order puts later, and any
  non-figure field between the first figure and the last; a role repeated in a row is in order. `FigureRole`
  (:8-10) is expected, paid, short.
- Mapping: every Medicare figure (before the reduction, fully reduced, and the top rows' one-claim-line figures) is
  `expected`; "Allowed in your file" is `paid`; both differences are `short`.

| Table | Columns at a6e754fc | Roles | Check |
| --- | --- | --- | --- |
| Anomalies (`anomalies.tsx:295-304`) | Code, Payer product, Rows, Claim lines, Medicare before, Medicare fully reduced, Allowed, Difference before, Difference fully reduced, Status | -, -, mono, mono, expected, expected, paid, short, short, - | passes |
| Top rows (`:368-383`) | Row, Code, Modifiers, Units, Place of service, Payer product, Quarter, Claim lines, one line before, row before, one line fully reduced, row fully reduced, Allowed, Difference before, Difference fully reduced, Status | mono x5, -, mono, mono, expected x4, paid, short, short, - | passes only if all four Medicare figures are `expected` |
| Coverage (`coverage.tsx:69-74`) | Payer product, Outcome, Reason, Rows, Claim lines, Allowed | -, -, -, mono, mono, paid | passes |
| Summary card (`result-summary.tsx:223-250`, not a table) | Medicare, Allowed, Difference; then fully reduced, Allowed, its difference | each row in order | n/a |

- So no column moves. The status file's carried item "reorder the anomalies table's columns" (from DR-08's note) rests
  on PR 3's design 3.6 sketch, which gives the fully reduced figure and its difference `mono: true`
  (`designs/lane-b-ux-table-scroll.md:654-680`): that sketch fails the check ("... stands between the figures") at
  the fully reduced figure. Section 12 wins: give the roles, keep the order, and the test asserts
  `brandOrderProblems(fields)` is empty for each table. The sketch's short labels ("Medicare figure", "Reduced
  figure", "Difference", "Reduced difference") are not taken: the dt must be the `<th>`'s string, and those are
  `labels.ts`'s pinned labels. The sketch's `stackBelow="56rem"` is 54rem (DR-04); the tables are `min-w-[54rem]`
  (`anomalies.tsx:292, :365`) and `min-w-[40rem]` (`coverage.tsx:66`).
- DR-08's equality: the table's naming columns become the stacked heading, so the test compares the headers without
  those columns to the fields' labels, in order. Anomalies: heading "<mono code>, <payer product>" from Code and Payer
  product. Top rows: heading "Row 12: <mono code>, <payer product>" from Row, Code and Payer product; Modifiers,
  Units, Place of service and Quarter stay fields in table order. Coverage: heading the payer product; Outcome, Reason,
  Rows, Claim lines, Allowed as fields.
- The others row (`anomalies.tsx:230-270`): its stacked item's heading "The other 120 groups, summed", and the note
  (:239) as its first field, before the figures, so the check holds: label "Fully reduced columns", value "Each row at
  its lowest figure: fully reduced for a code in the reduction across codes, its one figure otherwise." Its fully
  reduced dt labels hold the lowest figures, which only the note says.

## 7. What lands when (recommendation)

- Best option: one narrow exception, asked of the co-founder (LANES.md rule 8), for PR 4 to change (a) `labels.ts`
  and `labels.test.ts`'s hash under the unreleased `screening-labels/2026-11-05` (no textual overlap with #42;
  precedent `labels.test.ts:35-41`, dfec40dc) and (b) the pinned lines of 0.2 in `result.test.tsx` and
  `screening.spec.ts:461`, none overlapping #42's hunks. Then all six findings close in PR 4 with no migration, and
  PR 4 must merge before #42 (after #42 the version is released). Whichever merges second regenerates
  `watched-paths.txt`.
- Fallback if refused: PR 4 ships the layout and the unpinned words (UX-005, UX-043, UX-042's top-rows sentence,
  UX-132's code removal and "PaidWhole" lines); UX-040, UX-206, "Below the Medicare figure" and the anomalies sentence
  follow in a small PR right after #42 merges (component words, no migration); UX-042's headers and UX-132's reason
  words then need a new labels version and a migration (Lane A). Strictly worse: a schema PR and the founder's
  approval line for a words change.

## 8. In-scope improvements found (for the author)

- "Below the Medicare figure by $5 a claim line or less" (4).
- "PaidWhole prices one claim line ..." in the top-rows description (4); "(pricing version ...)" (4).
- The count sentences together, then the rule (4).
- Shared `CLAIM_LINES` and `ALLOWED_IN_FILE` constants (3).
- Comments: `anomalies.tsx:114-115` (stale region note), `:152` (short tone), the module doc `:30-31` keeps "Status
  shows as a labelled chip" and can add "an anomaly in the unpriced tone, never Short or Whole (ADR 0056:86)".

## 9. Proposals outside this PR

- P1. `apps/web/src/app/brand.css:42`: `.pw-status-unpriced` sets text to `--pw-unpriced` (3.7:1, under 4.5:1) while
  `StatusChip` and ADR 0056:93-95 use Slate text with the unpriced border; no component uses the `.pw-status-*`
  classes. Align it (Slate text, unpriced border) or remove the three classes.
- P2. At the labels change, give the other engine details a prospect can meet words that say whose gap it is
  (`labels.ts:176-189`: "No conversion factor for the year", "No sequestration record on the quarter's first day" and
  the like are PaidWhole's content, as `no_locality_plus_four` :178 already says); and `unpricedReasonLabel`'s
  fallback for ENGINE_ERROR with no detail is the closed list's "Unexpected input" (`unpriced-reasons.md:22`), which
  tells a prospect the product broke.
- P3. `counted()` (`lib/copy/words.ts:8-10`) groups no digits; `anomalies.tsx:40-42` keeps its own `many`, and
  `result-summary.tsx:219, :240` use `counted` ("12345 rows"). Give `counted` grouping app-wide and drop `many`
  (words.test pins it; the screen scout's 10 has it too).
- P4. The engine's version on a prospect's page is an internal name (`ENGINE_VERSION = 'phase-two/2'`,
  `packages/pricing/src/trace.ts:22`, frozen); a public version name, or the release number alone on the screening.
- P5. At the next labels version, one noun for the figure: the headers say "Expected under Medicare, ..."
  (`labels.ts:34-43`) while the sentences and the ruled difference headers say "Medicare figure" (the screen scout's
  10). D19 a rules the qualifier, not the noun.
- P6. `DISPOSITION_NOTES` (`labels.ts:161-168`) is read by no screen; `PRODUCT_NOTES` only by #42's upload page:
  drop the unused one at the next labels change.

## 10. Open questions for the author

- Does `screening-labels/2026-11-05` count as released once #42 (PR 6b-4) merges? This scout reads
  `labels.test.ts:35-41` as yes, which makes section 7's timing matter.
- Who rules the exception (7): the co-founder under LANES rule 8, or #42's owner carrying the lines instead.
- The UX-042 sentence's two-word departure from the ruled text (2): take it, or keep the ruled words.

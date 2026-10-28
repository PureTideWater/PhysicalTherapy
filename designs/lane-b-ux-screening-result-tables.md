# co-001/ux-screening-result-tables: the screening result reads on a phone, and its rows say what they are

The UX baseline review's fourth pull request (`designs/lane-b-ux-review.md` §3 "UX PR 4"; `synthesis/prs.json` order 4).
Closes UX-005 (C-008), UX-043 (C-119) and the parts of UX-042 (C-118) and UX-132 (C-061) that need no #42 file; the
rest of those two, with UX-040 (C-107) and UX-206 (C-203), lands in one small follow-on the day #42 merges (section 1.3).
Branch `co-001/ux-screening-result-tables`, cut from `claude/build-platform` at a6e754fc (PR 3, #79, merged), worktree
`/home/user/ux-screening-result-tables`. Reserved for it (LANES.md, 2026-10-27 01:35): ADR 0078 (shared with PR 3,
amended here), test-matrix TBL-05 to TBL-08, synth module 17 (TBL).

Sources: the three scouts' reports (scratchpad `p4/screen.md`, `p4/tests.md`, `p4/words.md`), the review's entries
UX-005 (uxreview.md:1648), UX-040 (:2256), UX-042 (:2294), UX-043 (:2313), UX-132 (:4004), UX-206 (:5410) and UX-154
(:4422, whose screening sentence this PR rewrites), PR 3's design (`designs/lane-b-ux-table-scroll.md`, section 3 and
section 12, which wins) and ADR 0078, the PR 3 status file's proposals and this PR's status file ("Carried from PR 3"),
and the code at a6e754fc. The review's evidence was at 4d99df8; every file:line below was re-read at a6e754fc.
Synthetic data only.

Every choice below is the recommended one, taken under the founder's standing rule (accuracy, quality, user experience,
security and privacy, compliance, reliability, maintainability, time to value; never weighted by build effort) and,
for wording and visible changes, within `.claude/rules/brand.md`, CO-11 and the screening's copy rules without asking.
Where this design departs from the review's fix text, the departure and its reason are stated where it is made
(summarised in section 1.5).

**After the design review (2026-10-28 ~03:00 UTC):** the one adversarial design review (wf_9855cdd7-e28,
`designs/lane-b-ux-screening-result-tables-review.json`: build with changes, no migration, 10 findings) is folded in at
the end, in section 12. **Where section 12 and an earlier section disagree, section 12 wins.**

## Contents

1. Scope: what closes, finding by finding; what waits for #42 and which PR takes it; departures
2. The three tables on `StackedRows`: columns, fields, headings, hooks, widths, call shapes
3. The words: every changed string, where it lives, the copy rules checked
4. Tests: the new unit file, the #42 pins, `screening-phone.spec.ts`, TBL-05 to TBL-08, the reworded rows, synth
5. ADR 0078: the dated amendment (needed)
6. No migration; overlaps with #42 and the open pull requests; what the PR merged second does; the PR description
7. Screenshots for the UX and brand review; the second adversarial review's lens
8. Build slices and their order
9. Risks and open points, each with its answer
10. Proposals outside this PR (improve as you go)
11. The follow-on after #42 (UX PR 4b), specified

---

## 1. Scope

### 1.1 The constraint that shapes it

Two of #42's files decide what can land now (`scratchpad/pr42-files.txt` at 6f23c42b; `LANES.md:84-91`, "Not while #42
is open"):

- **`apps/web/src/components/screening/result.test.tsx` is #42's** (pr42-files line 20; #42's own hunk is its kept-text
  pin at #42 :588-596). It runs in this PR's `unit` job, and a PR never merges red. So while #42 is open every pin in it
  is a hard constraint on this PR's markup and words: a change that breaks a pin waits. Four parts break pins:
  UX-040's tone (`:430`, `:431`, `:510` read `data-tone="short"`), UX-206's count sentence (`:411`, `:419-424`,
  `:500-503`), "Below by $5 a claim line or less" (`:432`) and the reason's words (`:550`, and #42's
  `e2e/screening.spec.ts:461`).
- **`apps/web/src/lib/screening/labels.ts` is under `lib/screening/*`**, and its words are versioned:
  `SCREENING_LABELS_VERSION = 'screening-labels/2026-11-05'` (`labels.ts:18`), whose SHA-256 over every label is pinned
  in `labels.test.ts:33-42`, and which the database's `screening_labels_version()` returns
  (`packages/db/functions/screening_labels_version.sql:8-15`; held equal by `routes.db.test.ts:1179` and
  `packages/db/src/screening.db.test.ts:1665`). UX-042's header names (`labels.ts:46`, `:49`) and UX-132's reason words
  (`labels.ts:175`) live there.

Asking #42 to carry this PR's pin changes is not taken: a commit after the founder approves #42 dismisses the approval
(LANES.md "Handed to Lane A", the #111 entry), and it would tie #42 to this design. Editing a #42 file by hand is not
taken: this PR leaves #42's files alone but for the shared documents and one generated file (6.2), and a merge would
then need #42's session to accept another lane's assertions. So this PR lands everything that keeps every pin, and the rest is one small follow-on (1.3).

**If #42 has merged when slice B starts** (section 8), this PR merges the base first and takes the follow-on's component
parts as well (section 11's list, with the pins it updates), so nothing waits. If #42 merges while this PR is already in
review, the scope stays as it is and the follow-on is built the same day: a scope change after the adversarial reviews
would need them again.

### 1.2 What closes, finding by finding (at a6e754fc)

| Finding | State at a6e754fc | This PR | Waits for #42 (section 11) |
| --- | --- | --- | --- |
| **UX-005 (C-008)**, blocking: on a phone the result's tables hide Allowed, Difference and Status | Partly fixed by PR 3: all three tables are in `ScrollTable` (`anomalies.tsx:291`, `:364`; `coverage.tsx:65`), each a named region with a tab stop, the fade and the caption; Coverage's tab stop (WCAG 2.1.1) is fixed. Still present: no stacked rows (`StackedRows` is adopted nowhere), so on a phone expected, allowed and difference stand apart and Status is off screen; at 1280 px the status chips are `whitespace-nowrap` (`components/status.tsx:25`), so a 70-character status alone takes about 440 px and the anomalies table overflows its 894 px card | **All of it.** Each table pairs with `StackedRows` (section 2), each item headed by its naming cells, every other column a field under the table's own header, in the table's order; the three figures together in the brand's order; the status in words on its tint. The status cell lets its chip wrap above a 10rem floor (ADR 0078 Decision 1, "the cell gives way"), so the anomalies table fits its card at 1280 px whenever its figures do (section 2.7). The new spec proves 390, 820, 1263 and 1280 px | nothing |
| **UX-040 (C-107)**: an investigatory anomaly in Short's colour | Present: `anomalies.tsx:155` (`'short'` for an anomaly) and `:263` (the others row) | Nothing visible: the stacked chip takes the same tone as its table chip, so the follow-on's one-line change moves both | The anomaly and the others row in the unpriced tone, the rest neutral, words unchanged; the test that no screening component uses short or whole |
| **UX-042 (C-118)**: the Difference columns never say which way the sign runs | Present: `labels.ts:46`, `:49`; the oblique sentence moved to `anomalies.tsx:359`; the anomalies card says nothing of the sign | **The sentence**: one key above each table of differences, the same words in both cards, saying what each difference subtracts and which way its sign runs (3.2). It replaces `:359`'s "A row is below a figure where that difference is above zero." It is outside `anomaliesDescription()`, whose output `:419-424` pins | The header names "Medicare figure less allowed, …" in `labels.ts` (with the summary card's, `result-summary.tsx:230`, `:246`): under the labels ruling of 9 Q1 |
| **UX-043 (C-119)**: the top rows head their claim-line count "Claims" | Present: `anomalies.tsx:375` | **All of it**: "Claim lines", from one `CLAIM_LINES` constant every card reads; the description's "the claim count" becomes "its claim lines" | nothing |
| **UX-132 (C-061)**: ENGINE_ERROR and "the engine" shown to a prospect | Present: the code above its words at `coverage.tsx:94`; "the engine" at `result-summary.tsx:267` and `anomalies.tsx:359` (the latter not cited); `labels.ts:175`; `labels.ts:164` is in `DISPOSITION_NOTES`, which no screen renders | **The code and both "engine" sentences**: the reason in words alone, its code kept in `data-reason` (`coverage.tsx:83`) and the stacked item's `data-stacked-reason`; "PaidWhole could not price" (`:267`); "PaidWhole prices one claim line …" (`:359`). The public result has no CSV, so the finding's "and in the CSV" has nothing to point at | The reason's words (`labels.ts:175`) and `DISPOSITION_NOTES` (dropped as unused): under the labels ruling |
| **UX-206 (C-203)**: "1 group of 4 is an anomaly." | Present: `anomalies.tsx:181` | Nothing | The count on its noun for every case (3.4), the counts read together before the rule |

Also taken here (improve as you go, same tables and page):
- Every count on the result groups its digits: `result-summary.tsx:219` and `:240` count through `counted()`
  (`lib/copy/words.ts:8-10`), which writes "12345 rows", while every other count on the page writes "12,345"
  (`anomalies.tsx:40-42`). One exported helper, `groupedCount`, in `result-summary.tsx` (3.5).
- The top rows' one-row description says "The priced row, each by its number in your file." ("each" of one); it becomes
  "The one priced row, by its number in your file." (3.3).
- A dash for "none" (the coverage's Reason, the top rows' Modifiers) is `aria-hidden` with the visually hidden word
  "None", as the one-figure dash already says its words (`anomalies.tsx:126-129`) (3.6).
- Stale comments: `anomalies.tsx:114-115` (the hand-rolled scroller PR 3 replaced) and `:30-31` (the module's order
  note), `coverage.tsx:11` ("the engine's reason"). `:152` ("an anomaly in the short tone") changes with UX-040 in the
  follow-on.

### 1.3 What waits for #42, and the PR that takes it

| Part | Why it waits | Taken by |
| --- | --- | --- |
| UX-040: the anomaly and the others row in the unpriced tone; the test that no screening component uses short or whole | breaks `result.test.tsx:430`, `:431`, `:510` | **UX PR 4b**, `co-001/ux-screening-result-words` (Lane B; cut from `claude/build-platform` the day #42 merges; no migration), section 11 |
| UX-206: the count sentence; the counts before the rule | breaks `:411`, `:419-424`, `:500-503` | UX PR 4b |
| "Below the Medicare figure by $5 a claim line or less" (`anomalies.tsx:146`, which names no figure while its pooled twin does) | breaks `:432` | UX PR 4b |
| UX-042's header names; UX-132's reason words; `DISPOSITION_NOTES` dropped | `labels.ts` (`lib/screening/*`), its version hash, and the pins `:273`, `:550` and `screening.spec.ts:461` | **UX PR 4b if the co-founder rules that `screening-labels/2026-11-05` stays unreleased until the first deploy from main** (recommended, 9 Q1): the hash re-pinned under the same name, as PR 6b-2's review did (`labels.test.ts:35-41`, dfec40dc). Otherwise **Lane A**: a new labels version needs a migration for `screening_labels_version()`, so the words ride with Lane A's next schema PR that touches the screening, recorded under LANES.md "Handed to Lane A" with the exact words of 11.3 |
| The heading's "(engine phase-two/2)" (`result-summary.tsx:145`), UX-154's screening first line | the review gives it to UX PR 85 (UX-154's ruled fix moves it to the foot, labelled "Pricing engine version"); moving it breaks `:367` | **UX PR 85** (`co-001/ux-screening-messages`), unchanged |
| The `stream` fixture (`holdScreeningStream('shared')`, #42's new `e2e/mail.ts`) in `screening-phone.spec.ts` | `mail.ts` does not exist before #42 merges | **the PR merged second** (section 6.3) |

### 1.4 The files, against prs.json order 4

prs.json lists `anomalies.tsx`, `coverage.tsx`, `screening-phone.spec.ts` (new), `result.test.tsx`, `labels.ts` and
`result-summary.tsx`. This PR changes:

- `apps/web/src/components/screening/anomalies.tsx`, `coverage.tsx`, `result-summary.tsx` (the components);
- `apps/web/src/components/screening/table-parts.tsx` (new: the columns' type and the cell classes the three tables
  share, no words; 2.2);
- `apps/web/src/components/stacked-rows.tsx` and `stacked-rows.test.tsx` (an item's optional `description` and its terms' column; 2.6);
- `apps/web/src/components/screening/result-tables.test.tsx` (new; in place of `result.test.tsx`, #42's);
- `apps/web/e2e/screening-phone.spec.ts` (new) and `apps/web/e2e/a11y.ts` (a `lists` option for `atPhoneWidth`);
- `docs/adr/0078-…md` (the amendment), `docs/product/test-matrix.md`, `packages/synth/src/cases/{matrix,registry}.ts`,
  `fixtures/synthetic/TBL-01,03,04,05,06,07,08/expected.json` (by `pnpm synth`);
- `tools/screening-capacity/watched-paths.txt`, by its generator (6.2).

Not changed: `result.test.tsx` and `labels.ts` (1.1); `app/screening/results/[resultId]/page.tsx` (nothing it renders
changes shape); `e2e/screening.ts` and `e2e/screening.spec.ts` (called and read, never edited).

### 1.5 Where this design departs from the review's fix text, and why

1. **UX-040 and UX-206 land in the follow-on, not here** (1.1): their pins are in #42's test file.
2. **The sign sentence names the subtraction, and stands above the table** rather than in the anomalies card's
   description. The ruled sentence ("A positive figure means the allowed amount in your file is below Medicare's
   figure; a negative one, above it.") assumed the header rename beside it, which waits for the labels ruling; until
   then the sentence alone must say what is subtracted. "Its Medicare figure" because a pooled code has two figures,
   each with its own difference column; "positive where" because "a positive figure" names two things on a page whose
   noun for the Medicare amount is "figure"; and not "Medicare's figure", since PaidWhole computes it from Medicare's
   fee schedule. Above the table because the description's text is pinned (`:419-424`), and because a key next to the
   figures it explains reads better on a phone than a sixth sentence in a long lede.
3. **The top rows' figure sentence** takes neither UX-132's implied wording nor UX-154's ruled one ("Each figure is
   Medicare's amount for one claim line, before sequestration and rounded once, times the row's claim lines."): that
   sentence calls every figure a one-line figure times the claim lines, while the table shows both the one-line
   figures and the row's. The words of 3.3 say who prices (PaidWhole), what (one claim line, under the Medicare fee
   schedule, before sequestration, rounded once) and how the row's figure follows. UX PR 85 then drops that sentence
   from its list.
4. **The could-not-price sentence says "whose rates change within the quarter"**, not the ruled "whose rate changes
   inside the quarter": the coverage chip it points to says "Rates change within the quarter"
   (`labels.ts:149`), one name for one thing.
5. **No column moves.** The status file's carried item "reorder the anomalies table's columns" came from PR 3's design
   3.6 sketch, which marked the fully reduced figure `mono` between the figures; `brandOrderProblems`
   (`stacked-rows.tsx:154-173`) would flag that sketch. With every Medicare figure `expected`, the allowed amount `paid`
   and both differences `short`, the columns as they stand are already the brand's order, so DR-08 is met by the roles
   and the test, and `result.test.tsx:401` and its column-index checks (`:447-468`) hold.
6. **The others row is the list's last item with a description line** (an addition to `StackedRows`, 2.6), rather than
   a field the table has no column for or a note folded into the heading.

---

## 2. The three tables on `StackedRows`

### 2.1 The shape, per card

Each of the three cards keeps its title (the list's and the table's name) and its description, and its `CardContent`
holds, in order: for the two cards of differences, the sign key (3.2); then one `StackedRows` whose `table` is today's
`ScrollTable` and table, unchanged in class and name, and whose `rows` are built from the same row array and the same
column list; then, for the anomalies, the pages of groups (`GroupPages`, `anomalies.tsx:199-223`, outside the list as
now). Nothing else on the page changes shape: the summary's cards are definition lists already, and `result-view.tsx`
and the route are untouched.

The table copy renders first (`stacked-rows.tsx:134-144`), so every `result.test.tsx` pin that reads the table from a
row's hook onward still finds the table's cells first (4.2).

### 2.2 `components/screening/table-parts.tsx` (new): one column list per table, and the classes it implies

```tsx
import type { ReactElement, ReactNode } from 'react';

import type { FigureRole, StackedField } from '../stacked-rows';

/** Which copy of a paired table a cell renders in (docs/adr/0078): the table's carries the test hooks; the stacked rows' carries data-stacked-… hooks or none. */
export type Copy = 'table' | 'rows';

/** A column of one of the result's tables: the one list the table's headers and the stacked fields read, in order (DR-08). */
export interface ScreeningColumn {
  readonly key: string;
  /** The header's words, and the stacked field's term: one string for both. */
  readonly label: string;
  /** A naming cell: the stacked item's heading takes it, so it is never a field. */
  readonly naming?: true;
  /** One of the brand's three numbers, by its place in their order: an order role, never a tone or a word. */
  readonly figure?: FigureRole;
  /** A code, count or quarter that is not one of the three: the mono face with tabular numerals. */
  readonly mono?: true;
  /** A count or a figure: right-aligned in the table. */
  readonly numeric?: true;
  /** Never breaks in the table (a quarter). */
  readonly nowrap?: true;
  /** The row's status chip: in the table it wraps above a floor (StatusCell). */
  readonly status?: true;
}

export function headClass(column: ScreeningColumn, last: boolean): string; // 'py-1' + (last ? '' : ' pr-3') + (numeric ? ' text-right' : '') + ' font-medium'
export function cellClass(column: ScreeningColumn, last: boolean): string; // last: 'py-1' or 'py-1 text-right'; numeric: 'py-1 pr-3 text-right'; mono: 'py-1 pr-3 font-mono tabular-nums' (+ ' whitespace-nowrap'); else 'py-1 pr-3'
export function ColumnHeads({ columns }: { readonly columns: readonly ScreeningColumn[] }): ReactElement; // <tr><th className={headClass(…)}>{label}</th>…</tr>
export function ColumnCells<K extends string>(props: { readonly columns: readonly (ScreeningColumn & { readonly key: K })[]; readonly cells: Readonly<Record<K, ReactNode>> }): ReactElement; // a <td> per column; a status column's value inside StatusCell
export function fieldsFrom<K extends string>(columns: readonly (ScreeningColumn & { readonly key: K })[], cells: Readonly<Record<K, ReactNode>>): StackedField[]; // every column but the naming ones, in order, { label, value, figure?, mono? }
export function StatusCell({ children }: { readonly children: ReactNode }): ReactElement; // <div className="min-w-40 [&_[data-slot=status-chip]]:whitespace-normal">
```

- **The classes are today's, exactly.** `headClass` yields `py-1 pr-3 font-medium`, `py-1 pr-3 text-right font-medium`,
  `py-1 font-medium` and `py-1 text-right font-medium`: the strings at `anomalies.tsx:116-118` and `coverage.tsx:69-74`.
  `cellClass` yields `anomalies.tsx:119-120`'s and the code, modifiers, place-of-service and quarter cells' classes
  (`:310`, `:392-393`, `:397`, `:399`) and coverage's (`:85-105`). So `result.test.tsx:400-401` (headers as written),
  `:470-476` (`pr-3` on every header but the last) and every class-free cell regex hold, and the table copy's markup
  differs from a6e754fc only where section 3 changes words and where the status cell gains its floor.
- **A cells record per row, typed by the column keys** (`Readonly<Record<(typeof ANOMALY_COLUMNS)[number]['key'],
  ReactNode>>`): a column added to the list and not to the cells is a type error, so the two copies cannot drift
  (PR 3 design 3.4's reason for one data source, enforced by the compiler as well as the test).
- **Why a module, and no words in it.** All three tables need the same column type, classes and floor;
  `result-summary.tsx` is the totals' file (UX PR 63 reshapes it), and a copy in each component would drift. The words
  stay where they are versioned or owned (labels.ts, each component, `result-summary.tsx`'s shared nouns; 3.7), so the
  module holds none and adds no third home for the screening's words. It joins the screening-capacity gate's watched
  list (6.2).

### 2.3 Anomalies by code and payer product (`anomalies.tsx`)

**Columns** (one exported constant, in the table's order, which is the brand's order already: 1.5 item 5):

```tsx
export const ANOMALY_COLUMNS = [
  { key: 'code', label: 'Code', naming: true, mono: true },
  { key: 'product', label: 'Payer product', naming: true },
  { key: 'rows', label: 'Rows', mono: true, numeric: true },
  { key: 'claimLines', label: CLAIM_LINES, mono: true, numeric: true },
  { key: 'medicare', label: MEDICARE_FIGURE_LABEL, figure: 'expected', numeric: true },
  { key: 'reduced', label: REDUCED_FIGURE_LABEL, figure: 'expected', numeric: true },
  { key: 'allowed', label: ALLOWED_IN_FILE, figure: 'paid', numeric: true },
  { key: 'difference', label: DIFFERENCE_LABEL, figure: 'short', numeric: true },
  { key: 'reducedDifference', label: REDUCED_DIFFERENCE_LABEL, figure: 'short', numeric: true },
  { key: 'status', label: 'Status', status: true },
] as const satisfies readonly ScreeningColumn[];
```

- **Cells.** `groupCells(group, copy)` returns the ten cells (`:310-335`'s values): the code as text, `productLabel`, two
  `ScreeningCount`s, `ScreeningMoney` for the figure before the reduction, the allowed amount and the difference, and
  `Reduced` for the fully reduced figure and its difference, and `GroupStatus`. `Reduced` and `GroupStatus` take
  `copy`: in the table copy they carry today's hooks (`data-figure="one-figure"`, `:126`; `data-anomaly` and
  `data-standing`, `:155`, in that order after `data-tone`, so `:417`'s regex holds); in the rows copy the dash carries
  none (its `dd` already carries `data-stacked-figure`) and the chip carries `data-stacked-standing="<standing>"` only.
- **Stacked item** (`groupItem`): key and hook `data-stacked-group="<code>:<product>"`; heading
  `<span className="font-mono tabular-nums">97110</span>, Original Medicare`; fields `fieldsFrom(ANOMALY_COLUMNS,
  groupCells(group, 'rows'))`: Rows, Claim lines, the two Medicare figures, Allowed in your file, the two differences,
  Status. `brandOrderProblems` of these is empty (expected, expected, paid, short, short, together; a role repeated in a
  row is in order, `stacked-rows.tsx:150-152`).
- **The other groups, summed** (`OtherGroups`, `:230-270`): the table's `tfoot` row keeps its naming cell
  (`colSpan={2}`, the name and `OTHERS_NOTE` under it) and renders `ColumnCells` over the eight other columns from
  `otherCells(others, copy)` (Rows, Claim lines, expected, lowest, observed, difference, lowest difference, the chip),
  so `:504-510`'s cell order holds. In the list it is the **last item**: key and hook `data-stacked-group="others"`;
  heading "The other 20,457 groups, summed"; `description` `OTHERS_NOTE` (2.6), because its two fully reduced fields hold
  each row's lowest figure, which the table says in the naming cell and a phone reader must read before those figures;
  the same eight fields. Its chip carries `data-anomaly` in the table copy only.
- **Call shape:**

```tsx
<CardContent className="flex flex-col gap-3">
  {page.groups === 0 ? (
    <EmptyState title="Nothing priced under Medicare" nextStep="…unchanged…" />
  ) : (
    <>
      <p className="text-sm text-muted-foreground" data-copy="difference-sign">{DIFFERENCE_SIGN}</p>
      <StackedRows
        labelledBy="screening-anomalies"
        stackBelow="54rem"
        table={
          <ScrollTable label={ANOMALIES_TITLE}>
            <table className="w-full min-w-[54rem] text-left text-sm" aria-labelledby="screening-anomalies">
              <thead className="text-muted-foreground">
                <ColumnHeads columns={ANOMALY_COLUMNS} />
              </thead>
              <tbody>
                {groups.map((group) => (
                  <tr key={`${group.payerProduct}:${group.procedureCode}`} className="border-t align-top" data-group={`${group.procedureCode}:${group.payerProduct}`} data-group-no={String(group.groupNo)}>
                    <ColumnCells columns={ANOMALY_COLUMNS} cells={groupCells(group, 'table')} />
                  </tr>
                ))}
              </tbody>
              <OtherGroups others={page.others} />
            </table>
          </ScrollTable>
        }
        rows={[...groups.map(groupItem), ...(page.others.groups === 0 ? [] : [othersItem(page.others)])]}
      />
    </>
  )}
  <GroupPages path={path} page={page} />
</CardContent>
```

- **Width:** `stackBelow="54rem"`, the table's `min-w-[54rem]` (`:292`, kept exactly: `result.test.tsx:479-481`).

### 2.4 Rows with the largest differences (`anomalies.tsx`)

```tsx
export const TOP_ROW_COLUMNS = [
  { key: 'row', label: 'Row', naming: true, mono: true, numeric: true },
  { key: 'code', label: 'Code', naming: true, mono: true },
  { key: 'modifiers', label: 'Modifiers', mono: true },
  { key: 'units', label: 'Units', mono: true, numeric: true },
  { key: 'placeOfService', label: 'Place of service', mono: true },
  { key: 'product', label: 'Payer product', naming: true },
  { key: 'quarter', label: 'Quarter', mono: true, nowrap: true },
  { key: 'claimLines', label: CLAIM_LINES, mono: true, numeric: true }, // was "Claims" (:375): UX-043
  { key: 'medicareLine', label: MEDICARE_LINE_LABEL, figure: 'expected', numeric: true },
  { key: 'medicare', label: MEDICARE_FIGURE_LABEL, figure: 'expected', numeric: true },
  { key: 'reducedLine', label: REDUCED_LINE_LABEL, figure: 'expected', numeric: true },
  { key: 'reduced', label: REDUCED_FIGURE_LABEL, figure: 'expected', numeric: true },
  { key: 'allowed', label: ALLOWED_IN_FILE, figure: 'paid', numeric: true },
  { key: 'difference', label: DIFFERENCE_LABEL, figure: 'short', numeric: true },
  { key: 'reducedDifference', label: REDUCED_DIFFERENCE_LABEL, figure: 'short', numeric: true },
  { key: 'status', label: 'Status', status: true },
] as const satisfies readonly ScreeningColumn[];
```

- **Cells** `rowCells(row, copy)`: `:389-426`'s values; the modifiers' empty dash becomes `<None />` (3.6); the four
  Medicare figures are `expected` (the one-claim-line figures too: each is a Medicare figure, and the order is about
  which figures stand together, not their scale), so the run is expected ×4, paid, short ×2: in order.
- **Stacked item** (`topRowItem`): key `String(row.rowNo)`, hook `data-stacked-row-no="<n>"` (no attribute named
  `data-row-no`: `:539` counts `/data-row-no=/`, which `data-stacked-row-no=` does not match); heading
  `Row <mono>4</mono>: <mono>97110</mono>, Original Medicare` (the three naming columns: Row, Code, Payer product);
  thirteen fields in table order: Modifiers, Units, Place of service, Quarter, Claim lines, the four Medicare figures,
  Allowed in your file, the two differences, Status.
- **Call shape:** as 2.3, with `labelledBy="screening-top-rows"`, `stackBelow="54rem"` (`:365`'s `min-w-[54rem]`), the
  sign key above it, and `CardContent className="flex flex-col gap-3"`; the empty case (no `CardContent`, `:362`) is
  unchanged.
- **At 1280 px this table still scrolls** inside its region with the cue: sixteen columns, seven of them figures, need
  about 1,250 px against an 894 px card even with every header and status wrapped (estimate). The pins read every
  column as its own cell (`result.test.tsx:447-468` match a cell's whole text to a figure), so folding the one-line
  figures into the row's cells waits for #42 (proposal P7).

### 2.5 Coverage, and the rows missing a contract (`coverage.tsx`)

```tsx
export const COVERAGE_COLUMNS = [
  { key: 'product', label: 'Payer product', naming: true },
  { key: 'outcome', label: 'Outcome', naming: true },
  { key: 'reason', label: 'Reason' },
  { key: 'rows', label: 'Rows', mono: true, numeric: true },
  { key: 'claimLines', label: CLAIM_LINES, mono: true, numeric: true },
  { key: 'allowed', label: ALLOWED_IN_FILE, figure: 'paid', numeric: true },
] as const satisfies readonly ScreeningColumn[];
```

- **Cells** `coverageCells(entry)`: `productLabel`; the outcome `StatusChip` (`toneOf`, `:28-39`, unchanged: unpriced for no
  figure, neutral otherwise); the reason **in words alone**, `unpricedReasonLabel(reason, detail)`, or `<None />`
  (UX-132: the mono code span `:94` is dropped; the code stays in the row's `data-reason`, `:83`); two counts; the
  allowed amount (`paid`, the one figure).
- **Stacked item** (`coverageItem`): key the row's composite key (`:80`); hooks `data-stacked-coverage="<product>:
  <disposition>"` and, with a reason, `data-stacked-reason="<code>"`; heading `Original Medicare: <StatusChip
  tone=… className="whitespace-normal">Could not be priced</StatusChip>`, the two naming columns, so each heading in the
  list is distinct (a product holds several outcomes: a list of three "Original Medicare" headings says nothing a
  heading list can use, WCAG 2.4.6) and the outcome keeps its words and tint; fields Reason, Rows, Claim lines, Allowed
  in your file.
- **Call shape:** `<CardContent><StackedRows labelledBy="screening-coverage" stackBelow="40rem" table={<ScrollTable
  label={TITLE}><table className="w-full min-w-[40rem] text-left text-sm" aria-labelledby="screening-coverage">…</table>
  </ScrollTable>} rows={coverage.map(coverageItem)} /></CardContent>`; the table's class is kept exactly
  (`result.test.tsx:557-558`). No sign key: coverage shows no difference.

### 2.6 Two changes to `StackedRows` (its first user's)

(a) **An item's description.** `StackedRow` gains `readonly description?: ReactNode`: "A line under the heading that
says what the item's figures are, where the table says it in the naming cell." `Row` renders it between the heading
and the definition list, only when it renders something: `{rendersNothing(row.description) ? null : <p className="mt-1
text-sm text-muted-foreground">{row.description}</p>}`. The heading stays the naming cell alone, so a list read by its
headings stays short. Weighed and not taken: a field the table has no column for (it would break the one-column-list
rule the test holds), the note inside the heading (a screen reader's heading list would read the note for every
heading), the actions slot (after the figures it explains).

(b) **The term column is at most 40% of the list.** From 24rem the definition list is
`@min-[24rem]:grid-cols-[max-content_1fr]` (`stacked-rows.tsx:87`): the term column takes its longest term unwrapped.
The screening's longest term, "One claim line, expected under Medicare, before the reduction across codes", is about
500 px at 14 px, so at 820 px (a 656 px list) its values would get about 120 px and the status chip would wrap to six
lines. The class becomes `@min-[24rem]:grid-cols-[fit-content(40%)_1fr]`: a term column of its longest term up to 40% of
the list, its terms wrapping between words past that, never narrower than its longest word. Terms over values below
24rem (every phone) are unchanged.

`stacked-rows.test.tsx` gains a case for each: the description between the heading and the list, none for one that
renders nothing; and the new grid class (the case at `:110` asserts the old one at `:113`).

### 2.7 The status cell, and the widths at each viewport

The status chip is `whitespace-nowrap` (`components/status.tsx:25`), right for a short state and wrong for the
screening's statuses, which are sentences (up to "Anomaly: 2 of 2 rows more than $5 a claim line below their lowest
figure", about 440 px at 12 px). In the table copy each status column's value sits in `StatusCell`: a block with
`min-w-40` (10rem) inside which the chip wraps. This is ADR 0078 Decision 1's "the cell gives way", in Decision 1's own
form (a floor on a block, never a class on the `<td>`; `tables.test.ts` holds `wrap-anywhere` only, which this does not
use). In the stacked copy the `dd` already lets a chip wrap (`stacked-rows.tsx:54`).

Content widths (the `StackedRows` wrapper: `result-view.tsx:21`'s `max-w-5xl`, `px-4` or `md:p-10`, less the card's
2 px border and `CardContent`'s `px-6`, `packages/ui/src/components/card.tsx:9`, `:30`):

| Viewport | Wrapper | Anomalies (54rem, 864 px) | Top rows (54rem) | Coverage (40rem, 640 px) |
| --- | --- | --- | --- | --- |
| 1280, 1024 and up | 894 px | table; fits while its figures do (below) | table, scrolls with its cue | table, fits |
| 1263 (1280 less a classic scrollbar) | 877 px | table; fits likewise | table, scrolls | table |
| 994 to 1023 | 864 to 893 px | table | table, scrolls | table |
| 820 | 690 px | stacked | stacked | table |
| 768 (`md` starts: 80 px of padding) | 638 px | stacked | stacked | stacked |
| 767 (below `md`: 32 px) | 685 px | stacked | stacked | table |
| 390 | 308 px | stacked | stacked | stacked |

The anomalies table's min-content with the floor (estimate, measured by the spec): Code about 54 px, Payer product about
87 (its longest word), Rows 48, Claim lines 50, each figure column the wider of its longest header word (about 70 px)
and its value (8.4 px a character at 14 px mono) plus 12 px of padding, Status 160. With figures of up to nine
characters ("$1,200.50", the synthetic result's) that is about 840 px, inside 877; with ten ("$99,999.99") about 880,
at the edge; past that the table scrolls in its region with the cue, which is PR 3's behaviour for a table wider than
its card. The spec asserts the synthetic result's anomalies and coverage tables fit at 1280 and 1263 px (4.4); if the
CI fonts measure otherwise, the floor goes to `min-w-36` and the PR description records it. The floor never goes
below 9rem: narrower, a status reads one or two words a line.

### 2.8 Hooks: the table copy keeps every hook, the stacked copy has its own

| Hook | Table copy (as at a6e754fc) | Stacked copy | Read by |
| --- | --- | --- | --- |
| a group | `tr[data-group][data-group-no]`; `tfoot tr[data-group="others"]` | `li[data-stacked-group]` (and `="others"`) | `result.test.tsx:402-437`, `:498`, `:504`; `screening.spec.ts:488-491`; `render-result.tsx:62-63` (counts `data-group-no="` and `data-group="others"`, which `data-stacked-…` never matches) |
| a top row | `tr[data-row-no]` | `li[data-stacked-row-no]` | `:534-539` |
| a coverage row | `tr[data-coverage][data-reason]` | `li[data-stacked-coverage][data-stacked-reason]` | `:547-550`; `screening.spec.ts:461` |
| a standing | chip `data-anomaly`, `data-standing` | chip `data-stacked-standing` | `:403-432`, `:418` (counts `data-anomaly="true"`: 2); `screening.spec.ts:488` |
| the others' chip | `data-anomaly` | none | `:510`, `:526` |
| one figure | `data-figure="one-figure"` | none (the `dd`'s `data-stacked-figure`) | `:437`, `:536` |
| a figure's role | none | `dd[data-stacked-figure]`, expected, paid or short (the primitive's) | the new tests; never a tone |
| the item | none | `li[data-stacked-row]` (the primitive's) | the new tests |
| component parts | `data-slot`, `data-tone`, `data-scroll`, `data-scroller` | `data-slot`, `data-tone` in both, by design | locators of them scope to `[data-stacked-copy]` or `:visible` (ADR 0078:104-107) |

`repeatedIds` (`stacked-rows.tsx:187-214`) is empty for every card, and the rows copy holds none of the table's hook
names at all (4.1, cases 3 and 4).

### 2.9 What a person gets

| Width | Anomalies | Top rows | Coverage |
| --- | --- | --- | --- |
| 390 (a phone) | one card per group, headed by its code and payer product: Rows, Claim lines, both Medicare figures, Allowed in your file and both differences together, in the mono face, then its status in words on its tint; the summed others last, their note under the heading | one card per row, "Row 4: 97110, Original Medicare", its thirteen fields; long, by design: every column is the requirement (section 9) | one card per outcome of a product, the outcome's chip in the heading, its reason in words |
| 820 (a tablet) | cards, terms beside values | cards, terms beside values | the table |
| 1280 | the table, fitting its card, statuses wrapped in their cells | the table in its region, the cue at its edge | the table |
| no script | the same as with script at each width: the switch is a container query (ADR 0078's safe failure) | same | same |

---

## 3. The words

### 3.1 The rules every string here was checked against

- **CO-11** (`docs/product/change-order-001.md:95`) and the screening lint (`tools/brand-copy/scan.ts:125-129`, applied to
  every path with a `/screening/` directory, `:235-237`, so `table-parts.tsx` too): never "owed", "underpaid" or
  "recovered"; and the general terms (`:117-120`: no "ProofPack", "AI", "intelligence", "independent verification
  platform"), no brand words written out. None of the strings below uses one.
- **The screening makes no finding about a payer** (`SCREENING_INVESTIGATORY_NOTE`, `labels.ts:114-115`, shown at
  `result-summary.tsx:283-285`; `docs/brand/BRAND.md:135-136`; PRD.md:241, "labelled investigatory; never shown as
  contract variance"): the sign key states arithmetic, never a shortfall; "expected" stays out of the new sentences
  (BRAND.md section 6: an expected amount traces to a signed-off contract version, which a screening never has); the
  difference's role `short` in the stacked copy is an order role in a data attribute, never a tone or a word (ADR 0078
  Decision 5), and the follow-on removes Short's colour (UX-040).
- **`.claude/rules/brand.md`**: every figure, code and count in the mono face with tabular numerals (`:36-37`),
  expected, paid and short in that order (the column lists, 2.3 to 2.5); status colours on their tints with a label
  (`:26-28`).
- **The UX and brand checklist** (`.claude/agents/ux-brand-reviewer.md:77-82`): words before any code (the reason in
  words alone); no build words ("the engine" leaves both sentences this PR writes; the heading's "(engine …)" is UX PR
  85's, 1.3); one name per thing ("Claim lines" everywhere; "rates change within the quarter" as the chip says); a
  count with its noun, its digits grouped.

### 3.2 The sign key (UX-042, the sentence)

In `anomalies.tsx`, one constant both cards of differences render, above the table and the list (`data-copy=
"difference-sign"`, `text-sm text-muted-foreground`), only when the card has rows:

> **Each difference is its Medicare figure less the allowed amount in your file: positive where the allowed amount is
> below that figure, negative where it is above.**

True for every difference on the page: `routes.ts:745`, `:751`, `:799` and `result-summary.tsx:43` define each as the
figure less the allowed amount; the synthetic 97110 group reads $368.40 − $340.00 = $28.40 (allowed below the figure before
the reduction) and $314.50 − $340.00 = −$25.50 (allowed above the fully reduced figure). It replaces the top rows'
"A row is below a figure where that difference is above zero." (`:359`). The summary card keeps its own words under
each difference ("Allowed in your file is below the figure before the reduction across codes in total.",
`result-summary.tsx:232`, `:248`). Departure from the ruled sentence: 1.5 item 2. Once the headers name the subtraction
(11.3), the key stays true and still says the sign's direction.

### 3.3 The top rows' description (UX-043, UX-132, UX-154's screening sentence)

`anomalies.tsx:357-359` becomes:

- one row: "The one priced row, by its number in your file. PaidWhole prices one claim line under the Medicare fee
  schedule, before sequestration, and rounds it once; the row’s figure is that times its claim lines. A code in the
  reduction across codes has a second figure, fully reduced across codes; a code outside it has one. {ANOMALY_RULE}"
- several: "The {n} priced rows with the largest differences from their lowest figure, the largest first, each by its
  number in your file. PaidWhole prices one claim line …" (the rest as above);
- none: "No row was priced under Medicare." (unchanged).

Gone: "the engine’s" (UX-132), "the claim count" (UX-043: "its claim lines", the column's own noun), "A row is below a
figure where that difference is above zero." (the key, 3.2), and "The priced row, each by …" (one row is not "each").
`result.test.tsx:533` reads only `ANOMALY_RULE` in it, which stays.

### 3.4 The count sentence (UX-206; lands in the follow-on, section 11)

`anomaliesDescription` (`:174-191`) puts the count on its noun, digits grouped, and the two counts together before the
rule. The closed set:

| Groups | Anomalies | First sentence |
| --- | --- | --- |
| 0 | - | "No row was priced under Medicare, so there is nothing to compare." (unchanged; nothing follows) |
| 1 | 1 | "The only group is an anomaly." |
| 1 | 0, and it is within the range | "The only group is within the range of the reduction across codes: between its two figures, which is not an anomaly." (stands for both counts) |
| 1 | 0, otherwise | "The only group is not an anomaly." |
| 2 | 0 | "Neither group is an anomaly." |
| 2 | 2 | "Both groups are anomalies." |
| 3 or more | 0 | "None of the 4 groups is an anomaly." |
| 2 or more | 1 | "1 of 4 groups is an anomaly." |
| 3 or more | 2 to one fewer than all | "2 of 5 groups are anomalies."; "12,345 of 20,507 groups are anomalies." |
| 3 or more | all | "All 4 groups are anomalies." |

Then the within-range sentence in today's words (`:182-185`: "1 more group is within the range of the reduction across
codes: between its two figures, which is not an anomaly." after an anomaly count, "2 groups are within …" after none),
then `ANOMALY_RULE`, then "Largest difference from the lowest figure first.", then the page sentence, which says "the
last entry" for "the table’s last row" (`:189`), because on a phone the sum is the list's last item: "This page lists
groups 51 to 100; the last entry sums the other 20,457, and the pages below list them."

So, for 0, 1 and 2 anomalies of the synthetic groups: "None of the 4 groups is an anomaly. 1 group is within the range
…", "1 of 4 groups is an anomaly. 1 more group is within the range …", "2 of 5 groups are anomalies. 1 more group is
within the range …", each followed by the rule and "Largest difference from the lowest figure first."

### 3.5 Counts with their nouns, digits grouped

`result-summary.tsx` exports ``groupedCount(count, one, more = `${one}s`)`` ("A count with its noun, its digits grouped
as every count on the result is"), the body of `anomalies.tsx:40-42`'s `many`, which goes; `anomalies.tsx` imports it
(it imports `result-summary.tsx` already, `:20`). `:219` reads "{groupedCount(rows, 'row')}, {groupedCount(claimLines,
'claim line')}" and `:240` "{groupedCount(pooledRows, 'row')} of a code …". App-wide grouping in `counted()` is proposal
P1 (its test pins today's output).

### 3.6 "None" said in words

`result-summary.tsx` exports `None`: `<span className="text-muted-foreground"><span aria-hidden="true">—</span><span
className="sr-only">None</span></span>`, for the coverage's empty Reason (`coverage.tsx:91`) and the top rows' empty
Modifiers (`anomalies.tsx:393`), in both copies, as the one-figure dash already speaks (`anomalies.tsx:126-129`).

### 3.7 Where each string lives (none in `lib/screening/*`)

| String | Home | Versioned? |
| --- | --- | --- |
| The sign key (3.2); the top rows' description (3.3); `OTHERS_NOTE` (today's words, now one constant for the table cell and the item's description); the stacked headings ("Row 4: …", "The other … groups, summed"); the count sentence and "Below the Medicare figure …" (follow-on) | `components/screening/anomalies.tsx` | no: component words, never in `labels.ts` |
| `CLAIM_LINES` "Claim lines", `ALLOWED_IN_FILE` "Allowed in your file" (one constant each, read by the summary's `GroupStats` `:121`, `:124`, its priced Stats `:227`, `:243`, and the three column lists); `groupedCount`; `None`; the could-not-price sentence (3.8) | `components/screening/result-summary.tsx` | no |
| "Outcome", "Reason", "Payer product", "Rows" (coverage's column labels, as today) | `components/screening/coverage.tsx` | no |
| Every Medicare figure's and difference's header, the products, outcomes and reasons | `lib/screening/labels.ts`, read through its constants as today; never shadowed by a component string (a kept summary names the labels version its result was shown under, ADR 0062:421-422) | yes |

No new words module: a third home beside `labels.ts` (versioned) and the components (not) would let words drift out of
the version by default. `table-parts.tsx` holds no words.

### 3.8 The could-not-price card (UX-132)

`result-summary.tsx:267`: "Medicare rows the engine left without a price, or whose rates change inside the quarter; the
reasons are under coverage below." becomes **"Medicare rows PaidWhole could not price, or whose rates change within the
quarter. Coverage, below, gives each reason."** (departure 1.5 item 4). Unpinned. The interface comment at `:72`
("the engine left unpriced") takes the same words.

### 3.9 The tone (UX-040; lands in the follow-on)

`Standing` (`:152-159`): `tone={standing === 'anomaly' ? 'unpriced' : 'neutral'}`; the others' chip (`:263`):
`tone={others.anomalyGroups > 0 ? 'unpriced' : 'neutral'}`; words unchanged. Unpriced is Slate text on the unpriced
tint with the unpriced border (`components/status.tsx:18`), the tone ADR 0056:86 gives "Flagged (investigatory): a line
with no contract price, short of its cohort; never a claim", which the product's own flagged line already takes
(`components/remittances/display.tsx:55`). The page then uses one tone for "no Medicare figure" (coverage) and for "an
anomaly"; each chip carries its words, and a new colour is the brand owner's (ADR 0058 D9). The doc comment reads: "A
standing as a labelled chip: an anomaly in the unpriced tone, as ADR 0056 shows an investigatory line, never Short (a
screening makes no finding about a payer); the rest neutral." Coverage's map (`coverage.tsx:27-35`) is unchanged.

---

## 4. Tests

### 4.1 The new unit file: `apps/web/src/components/screening/result-tables.test.tsx`

`result.test.tsx` is #42's, so this PR's unit tests go in their own file beside the components (the `unit` project
takes every workspace's `**/*.test.{ts,tsx}`, `vitest.config.ts:72-74`). Test files are skipped by the copy scan
(`tools/brand-copy/scan.ts:231`) and left out of the capacity closure (`watched.ts:153`).

- **Rendering:** `renderToStaticMarkup` (as `result.test.tsx:3` and `stacked-rows.test.tsx:4`); `ScrollTable` renders its
  unmeasured state on the server, `StackedRows` is a server component.
- **Fixtures:** its own SYNTHETIC groups, rows and coverage, written by hand from G01's codes as SYNTHETIC release 900001
  prices them (the shapes of `result.test.tsx:75-245`, which are not exported, and a test file is never imported): five
  groups (97110 within the range, 97140 a pooled anomaly, 97161 a two-row one-figure anomaly, 97530 at or above, 97035
  below by $5 or less), a later page of 20,507 groups with others (12,300 of them anomalies) and a 50-group page; three
  top rows (a pooled row, a one-figure anomaly, a row with no modifiers); six coverage rows (priced, an ENGINE_ERROR
  `place_of_service_unmapped`, two `contract_required`, `not_screened`, `rates_change_in_band`).
- **Helpers:** `copies(html)` splits at the `<ul` that carries `data-stacked-copy="rows"`; `items(rows)` reads
  `/<li [^>]*data-stacked-row="([^"]*)"[^>]*>([\s\S]*?)<\/li>/g` (the hooks are spread before `data-stacked-row`,
  `stacked-rows.tsx:85`); `terms(item)` the `dt` texts; `headers(table)` `/<th class="[^"]*">([^<]*)<\/th>/g`. Note that
  `renderToStaticMarkup` writes a class's `&` as `&amp;` (the status floor's `[&_…]`).

What it asserts in this PR, each `it` naming its row:

1. **Every column, under the table's own header, in its order** (TBL-05, TBL-06; DR-08). For each card, the table copy's
   headers equal `ANOMALY_COLUMNS` / `TOP_ROW_COLUMNS` / `COVERAGE_COLUMNS` labels in order, and every item's terms equal
   the same list less its naming columns, in order: the others item too.
2. **The brand's order** (TBL-05). `brandOrderProblems(item.fields)` is `[]` for every item of the exported builders
   (`anomalyItems(groups, page)`, `topRowItems(rows)`, `coverageItems(coverage)`), others included.
3. **No repeats between the copies** (TBL-05). `repeatedIds(html)` is `[]` for the anomalies (the later page, with the
   others row and one-figure dashes), the top rows (with a one-figure row) and the coverage (with a reason).
4. **The table's hooks in the table copy only** (TBL-05). The rows copy matches none of
   `/\sdata-(?:group|group-no|coverage|reason|row-no|standing|anomaly)=/` and not `data-figure="one-figure"`
   (`repeatedIds` misses a hook with another value, so this is asserted directly); with the 50-group page the whole
   markup holds `data-group-no="` 50 times and `data-group="others"` once, the counts `render-result.tsx:62-63` and
   `result-page.large.db.test.ts:304-309` read.
5. **Each card switches at its own table's width** (TBL-06). The wrapper `data-slot="stacked-rows"` is `@container w-full
   min-w-0`; the table copy `hidden @min-[54rem]:block` and the list `@min-[54rem]:hidden` for the anomalies and the top
   rows, `40rem` for the coverage; each region's markup up to its table is today's (the shapes of `result.test.tsx:479-484`
   and `:557-558`, owned here too).
6. **Lists and headings** (TBL-06). Each list is `<ul role="list" data-stacked-copy="rows" aria-labelledby="screening-
   anomalies">` (`-top-rows`, `-coverage`); each item heads with `<h3`; no groups gives the empty state and no list; no top
   rows gives no `CardContent`.
7. **The faces and the words of each value** (TBL-05). In the rows copy every `$…` figure and every count sits in a
   `font-mono tabular-nums` element; each heading's code is mono; the one-figure dash keeps "One figure: the code is
   outside the reduction across codes"; each item's chip says what its table row's chip says, and carries
   `data-stacked-standing` equal to the table chip's `data-standing`; the coverage item's heading holds the product and
   its outcome's chip.
8. **The other groups, summed** (TBL-05). The others item is last; its heading reads "The other 20,457 groups, summed";
   `OTHERS_NOTE` sits between its `</h3>` and its `<dl`; its seven counts and figures equal the `tfoot` row's cells 1 to 7
   in order; its chip's words equal the `tfoot` chip's.
9. **The status floor** (TBL-06). Every status `<td>` of the three table copies holds the `min-w-40` block with the
   chip-wrap selector before its chip; no `<td>` or `<th>` carries `wrap-anywhere`.
10. **The words this PR changes** (TBL-08). The top rows' headers hold "Claim lines" and never "Claims"; the sign key is
    exactly 3.2's, once in each card of differences, and absent from the empty states; the top rows' description is
    exactly 3.3's for one row and for three; no rendered card but the heading says "engine" (`ScreeningHeading`'s
    version is UX PR 85's); the coverage's text holds no `ENGINE_ERROR` in either copy while its `<tr>` keeps
    `data-reason="ENGINE_ERROR"` and its item `data-stacked-reason="ENGINE_ERROR"`, and both copies say the reason's
    words; the could-not-price card says 3.8's sentence; a summary of 12,345 priced rows says "12,345 rows, 40,000 claim
    lines"; an empty Reason and empty Modifiers say "None" to a screen reader; neither copy of any card says owed,
    underpaid or recovered (`/\b(?:owed|under-?paid|recovered)\b/i`).
11. **The tones as they stand** (TBL-08). No `data-tone="whole"` on the result; each stacked chip's `data-tone` equals its
    table chip's, so the follow-on's one change moves both copies.

What the follow-on adds to the same file (section 11): no screening component uses the short or whole tone (render
`ScreeningHeading`, `ScreeningReleaseWithdrawn` withdrawn, `ScreeningSummary`, `ScreeningAnomalies` with anomalies and
others, `ScreeningTopRows`, `ScreeningCoverage`: no `data-tone="short"` or `"whole"`, no `status-short` or `status-whole`
class, and every anomaly chip `data-tone="unpriced"`; plus a source check that `components/screening/*.tsx` and
`app/screening/**/*.tsx`, tests left out, hold no `'short'` or `'whole'` literal except as a `figure:` value,
`/(?<!figure:\s*)['"](?:short|whole)['"]/`; it reads `data-tone=`, never the bare word, because a stacked `dd` carries
`data-stacked-figure="short"`); the count sentence for every row of 3.4's table (0, 1 and 2 anomalies, all, one group
three ways, two groups both ways, grouped digits, "the last entry"); "Below the Medicare figure by $5 a claim line or
less"; and, with the labels, the difference headers in both copies and the summary, and the reason's words.

### 4.2 `result.test.tsx` (#42's): every pin holds, none is edited

| Pins (a6e754fc lines) | Why they hold under this PR |
| --- | --- |
| `:400-401`, `:447-468`, `:470-476` (headers as written, column-index checks, `pr-3` on every header but the last) | `ColumnHeads` renders today's `<th class>text</th>`; no column moves; the stacked copy has no `<th>` or `<td>` |
| `:418` (`data-anomaly="true"` twice) | the stacked chips carry `data-stacked-standing` only |
| `:437`, `:440` (one-figure dashes in one table row) | row-scoped; the stacked dash carries no `data-figure` |
| `:479-484`, `:557-558` (each region up to its table) | the `ScrollTable` labels and the tables' classes are kept |
| `:498`, `:539`, `:547` (`data-group-no`, `data-row-no`, `<tr … data-coverage`) | the stacked hooks are `data-stacked-…` |
| `:504-510`, `:526` (the others row's cells, tones and words) | its `tfoot` cells keep their order; the tone is unchanged until the follow-on |
| `:531` (the top rows' labels) | the labels are `labels.ts`'s, unchanged |
| `:550` (the coverage reason after `data-reason="ENGINE_ERROR"`) | `data-reason` stays on the `<tr>`; the words are unchanged; dropping the code span changes nothing the `[\s\S]*?` reads |
| `:259-393` (the summary and heading) | `:267`'s sentence is unpinned; `groupedCount` writes what `counted` wrote below 1,000; `:366-368` (`engine/1`) is untouched |

Pins that hold **by DOM order only** (each reads forward from a table row's hook with `[\s\S]*?`, and the table copy
comes first): `:402`, `:403`, `:409-410`, `:417`, `:430-432`, `:534-536`, `:549`, `:551`. They pass; they would also
accept a match from the stacked copy if the table row lost one. The follow-on scopes each to the table copy (the markup
before `data-stacked-copy="rows"`) while it updates the words there (section 11.4); if #42 merges second, its session
may do it at its base merge instead (6.3).

So CI stays green with no #42 file edited: the markup every pin reads is kept, and the parts that would break a pin are
the follow-on's.

### 4.3 `stacked-rows.test.tsx` (PR 3's file, not #42's)

Two cases (2.6): an item's `description` renders as a `<p>` between its heading and its `<dl>`, and none for a
description that renders nothing; the list's grid class is `@min-[24rem]:grid-cols-[fit-content(40%)_1fr]` (the case at
`:110`, whose assertion at `:113` reads the old class, is updated).

### 4.4 `apps/web/e2e/screening-phone.spec.ts` (new)

It calls `e2e/screening.ts` (#42's) unchanged: `CLEAN_ROWS`, `SCREENING_HEADER`, `SCREENING_ZIP`, `screeningRowsCsv`,
`resultLinkIn`, `startLocalScreeningConsumer` (`:21-143`; #42's head changes only the consumer's mail settings, `:8`,
`:135-136`, not a signature). It never imports `screening.spec.ts` (importing a spec registers its tests); it copies the
consumer fixture's shape (`screening.spec.ts:38-51`) and the run's query.

**How it reaches a result without the flakes' races:**

- Its own practice and address: `SYNTHETIC PHONE SCREENING CLINIC` and
  `screening-phone-<8 hex>@clinic-phone.synthetic.test` (a module-level `randomBytes`, new in a retry's new worker; a
  special-use `.test` domain of its own, so `submit_screening()`'s replacement by practice or address, `routes.ts:70`, and
  the per-domain `screening` bucket, `rate-limit.ts:47-50`, touch no other spec).
- No sign-in and no key (the `helpers.ts:87` retry flake): the prospect's journey is public, and `prepare.ts:62` has
  approved the split.
- It reads no `screening_upload.status` and no `screening_outcome.stage` (the `screening.spec.ts:339` race), and asserts
  no wait state on the sent page (only `[data-state="sent"]`).
- After the outbox holds the message (`expect.poll(() => outboxFor(CONTACT).length, { timeout: 90_000, intervals: [500] })
  .toBe(1)`), it polls the run until it is `complete` (`SELECT r.status FROM screening_run r JOIN screening_upload u ON
  u.id = r.upload_id JOIN screening_prospect p ON p.id = u.prospect_id WHERE p.contact_email = $1`, 30 s, every 250 ms)
  before it opens the link: the consumer sends the email inside its completion's transaction, and a link opened before
  the commit is "not found" (`lib/screening/routes.ts:79-80`; the capacity harness's 404, LANES.md 2026-10-26).

**The test** (one; `test.setTimeout(180_000)`): "the screening result reads on a phone: its three tables as stacked rows
with every value in the window, the tables from a desktop's width, axe at 390 and 1280 px (TBL-05, TBL-06, TBL-07)".

1. At 390 x 844: `/screening`; Practice name, State `MN`, ZIP code (`exact: true`) `SCREENING_ZIP`, Work email; File to
   screen `screeningRowsCsv([SCREENING_HEADER, ...CLEAN_ROWS])`; `[data-state="file-ready"]`; "Screen the file";
   `[data-state="sent"]`. Then the two polls above; `link = resultLinkIn(message)`; `sha = sha256(token)`.
2. What the page must list, from the database: `screening_result_groups(sha, 1, 100)` (`grp`, `standing`; it must hold
   `97140:ma_noncontracted` `anomaly`, so the result is the expected one), `screening_result_coverage(sha)`
   (`payer_product:disposition`, `unpriced_reason`), `screening_result_rows(sha, 25)` (`row_no`, `standing`).
3. **390, the first load at that width** (server markup, then hydration): for each card, `getByRole('list', { name:
   title, exact: true })` is visible and `getByRole('table', { name: title, exact: true })` has count 0; the items match
   the database (one `[data-stacked-group]` per group, plus `"others"` when the page has others, none for CLEAN_ROWS; one
   `[data-stacked-coverage]` per coverage row; one `[data-stacked-row-no]` per top row); each group's
   `[data-stacked-standing]` is the database's standing, and 97110 and 97140 under `ma_noncontracted` read the words
   `screening.spec.ts:490-491` reads; each item's `dt` texts equal its card's `th` texts (read from the hidden copy with
   `allTextContents`) less the naming columns (`Code`, `Payer product`; `Payer product`, `Outcome`; `Row`, `Code`, `Payer
   product`), in order. Then `atPhoneWidth(page, 'the screening result', { lists: [the three titles] })` (4.5): no
   sideways scroll, every table in a ScrollTable, every value of every item in the window and no chip cut, the visible
   scrollers agreeing, and axe with landmark-unique. No `tables`: the tables are hidden at 390 by design.
4. **390 without script:** a second context, `javaScriptEnabled: false`, the same link: the three lists visible and no
   table visible (the container query is CSS; ADR 0078's safe failure). It records no open (SCR-13: only a person using
   the visible page does).
5. **820 x 1000:** the anomalies and top-rows lists visible, the coverage table visible and its list hidden; no sideways
   scroll; `expectScrollersAgree`.
6. **1280 x 720** (a resize, so the tables hidden since the first load show now): each table visible by role and exact
   name with as many `tbody tr` as the database's groups, top rows and coverage rows; no list visible by role; each
   `[data-stacked-copy="rows"]` hidden; `expectScrollersAgree` (the tables that were hidden measure again when they show:
   PR 3's open risk "a hidden table measures 0 and reads fits", answered here); the anomalies' and the coverage's
   `[data-slot="scroll-table"]` read `data-scroll="fits"` (2.7); `document.documentElement.scrollWidth <= innerWidth`;
   `expectAccessible(page, 'the screening result at 1280 px')`.
7. **1263 x 720** (1280 less a classic scrollbar): the anomalies and the coverage still `fits`; no sideways scroll.

Locators that read a part every component names (`data-slot`, `data-tone`) are scoped to `[data-stacked-copy="table"]`
or `"rows"`, or take `:visible` (ADR 0078:104-107). Time: one upload and its pricing, three widths, two axe runs: about a
minute in one shard; the PR records each e2e shard's wall time before and after (DR-15's rule).

**After #42 merges** (whichever merges second does it, 6.3): the test extends #42's `stream` fixture,
`holdScreeningStream('shared')` from #42's new `e2e/mail.ts` (#42 `screening.spec.ts:43-58`, with its own
`timeout: 240_000`), because #42's mail cut-off journey pauses the screening stream while it holds that lock alone, and
an upload during the pause would wait for an email that does not come.

### 4.5 `e2e/a11y.ts`: a `lists` option for `atPhoneWidth` (not #42's)

```ts
/**
 * The stacked lists the route must show at 390 px, each by its name (exact; docs/adr/0078): visible, every value of
 * every item rendered and inside the window, and no status chip cut. A list's own table is hidden at this width and is
 * not named in `tables`.
 */
readonly lists?: readonly string[];
```

`atPhoneWidth` polls, for each name, a function that returns what is wrong, by the item's `data-stacked-row` and the
term: no visible list of that name; a `dd` with no rendered box (`checkVisibility()`), or one whose rect passes 0 or
`innerWidth` by more than half a pixel; a `[data-slot="status-chip"]` whose `scrollWidth` passes its `clientWidth` by more
than a pixel. It mirrors `tables`, which a stacked table can no longer use, so UX PR 34's stacked working lists reuse it.

### 4.6 Other tests this PR reaches

- **`tools/screening-capacity/watched.test.ts:18-20`:** `anomalies.tsx` and `coverage.tsx` now import
  `components/stacked-rows.tsx` and `components/screening/table-parts.tsx`, so the derived list gains both and
  `watched-paths.txt` is regenerated (`pnpm exec tsx tools/screening-capacity/watched.ts --write`; 6.2). The changed
  components are watched, so the screening-capacity gate measures this PR.
- **`lib/screening/result-page.large.db.test.ts:313-316`** (read, never edited): the worst-shape page stays under
  512 KiB of HTML, +64 MiB of heap after the render and +8 MiB after collection. Last measured: page 1 at 144 KB and
  +15.9 MiB. The stacked copies add about 2.8 KB a group (51 items), 4 KB a top row (25) and 1.6 KB a coverage row:
  about 250 to 300 KB, so about 400 to 450 KB in all (estimate). Slice B runs `pnpm test:db` on that file and the PR
  records page 1's figures. If it measures above 460 KB (90% of the cap), `stacked-rows.tsx` moves the values' classes
  from each `dd` onto the `dl` as child selectors (`[&>dd]:min-w-0 …`, the mono face by `[&>dd[data-stacked-figure]]` and
  a `data-stacked-mono` mark), which takes about a third off each field, with its test, before the integrator's run.
- **`apps/web/src/app/tables.test.ts`:** each table stays `ScrollTable`'s direct and only child (inside the `table`
  prop, which the guard parses as JSX); no `wrap-anywhere` on a cell; no label repeats in a list.
- **`type-scale.test.ts:38-41`:** every new mono class pairs `font-mono` with `tabular-nums`.
- **`pnpm lint:copy`:** reads the three components and `table-parts.tsx` under the screening rules.

### 4.7 The test matrix: TBL-05 to TBL-08 new, TBL-01, TBL-03 and TBL-04 reworded

The section's intro (`docs/product/test-matrix.md:322-325`) ends: "TBL-01 to TBL-04 are the review's third pull
request's (#79); TBL-05 to TBL-08 are the screening result's (its fourth)." Rows are `| ID | Case | Assertion |`, no `|`
in a cell. `packages/synth/src/cases/matrix.ts:446-470` takes each row byte for byte (`fixtures.test.ts:33`), quoted as
Prettier chooses (TBL-01's new text holds double quotes and no apostrophe, so it stays single-quoted).

| ID | Case | Assertion |
| --- | --- | --- |
| TBL-01 | A wide table's scroller and a fixed-height text box | Rendered on the server as a region named after its table with ", scrolls sideways" added (a text box: ", scrolls") with tabindex 0, the containing block of what its table positions, with a visible focus outline, so it is reachable before any script runs; in the browser it has no role, name or tab stop while its content fits and the scroller itself does not hold focus (a link inside it does not count), and is a region again when the content overflows; edge fades show only at an edge with content past it and the caption "Scroll sideways for more columns." only while it overflows, both from classes and data attributes alone (no style attribute); at 390 px Tab reaches the region of a wide table, whose frame draws a 2 px focus outline, an arrow key scrolls it, only the end edge fades at the start, both in the middle and only the start at the end, and the first link inside it draws its ring inside its own box, within the clip of the scroller; every table in apps/web/src is the direct and only child of the ScrollTable of components/scroll-table, under whatever name it is imported, and none is made by createElement or written in markup, but in the #42 pages listed with the pull requests that wrap them, and an exemption that no longer matches fails; no ScrollTable label is the same in every row of a list, in its file or through a component or import; and wrap-anywhere is never on a td or th, and inside one only on or within a block with a min-w |
| TBL-03 | Every changed route at a phone's width passes axe | At 390 px every changed route, each with its wide table populated and overflowing, has no axe-core WCAG 2.1 A or AA violation, a scrollable region the keyboard cannot reach (scrollable-region-focusable) among them, and no two landmarks of a role share a name (axe's landmark-unique), every scroller's state agreeing with its measurement before axe runs; the screening result's is TBL-07 |
| TBL-04 | One stacked-row layout | Each stacked row is an item of a list named by its label or by the title that names it, a list by its role too (Safari drops the role of an unstyled list), headed by its naming cell at the level the caller gives (h3 by default; a link when the row has one), then, when given, a line that describes it, then a definition list of each column's label and value, terms over values until the list is 24rem wide and beside them after, in a term column of at most 40% of the list, then the row's actions, with no actions box when they render nothing; expected, paid and short are given together and in that order, and the stacked rows keep the table's column order, each figure, code and count in the mono face with tabular numerals; a status chip, a Badge and a key longer than the card wrap inside it; the rows carry their own hooks, never the table's, and no id or hook repeats between the two copies; with a table, the table shows from the table's own width up and the rows below it, by a container query on a full-width wrapper that is never squeezed to nothing; a list with no name is refused |
| TBL-05 | The screening result's rows on a phone | At 390 px each row of the screening result's three tables, the anomalies by code and payer product, the coverage and the rows with the largest differences, is an item of a list named by its card's title, headed by its naming cells (a group by its code and payer product, a coverage row by its payer product and outcome, a top row by its number, code and payer product) and holding every other column under the table's own header and in the table's order: the Medicare figures, the allowed amount in the file and the differences together and in that order, in the mono face, a missing second figure said in words, and the status in words on its tint; the other groups, summed, are the last item, their note under its heading; every value lies inside the window, no status is cut and no page scrolls sideways; the items carry their own hooks, never the table rows', and no id or hook repeats between the two copies |
| TBL-06 | The screening result's tables from a desktop's width | At 1280 px the three tables show, each in its scroller named after its card's title, with one row for each group, coverage row and top row the database returns, and the lists are hidden from view and from assistive technology; each card switches at its own table's width, so at 820 px the anomalies and the top rows stack while the coverage keeps its table, and without script the switch is the same; the table and the list render from one row array and one list of column labels; a status wraps in its cell above a 10rem floor, so the synthetic result's anomalies and coverage fit their cards at 1280 px and at 1263 px, and a table that was hidden measures again when it shows |
| TBL-07 | The screening result passes axe at 1280 and 390 px | A result the screening consumer prices from a synthetic upload, opened from its emailed link once its run is complete, has no axe-core WCAG 2.1 A or AA violation at 1280 px, and at 390 px, loaded at that width, none and no two landmarks of a role sharing a name, every scroller's state agreeing with its measurement before axe runs |
| TBL-08 | The screening result's words | The top rows head their claim-line count Claim lines; one sentence above each table of differences says that each difference is its Medicare figure less the allowed amount in the file and which way its sign runs; the coverage shows an unpriced reason in words alone, its code kept in its row's data attribute; the could-not-price card and the top rows say what PaidWhole prices, never the engine; every count on the result groups its digits; an empty value is said as none; never owed, underpaid or recovered |

TBL-02 is unchanged. The follow-on rewords TBL-08 to its full text (11.5).

### 4.8 Synth: registry entries and fixtures

`MODULE_NUMBER` already has `TBL: 17` (`packages/synth/src/cases/common.ts:18`) and `CASE_MODULES` has `'TBL'`
(`packages/synth/src/expected/types.ts:9`). After TBL-04 in `packages/synth/src/cases/registry.ts` (`:673`):

```ts
  // The screening result's tables, the UX baseline review's fourth pull request (docs/adr/0078).
  'TBL-05': none(1, 'The result is rendered from synthetic groups, rows and coverage the test writes by hand, and the browser opens a result the screening consumer prices from a synthetic upload built in memory (CLEAN_ROWS, e2e/screening.ts); no file.', [
    'apps/web/src/components/screening/result-tables.test.tsx',
    'apps/web/e2e/screening-phone.spec.ts',
  ]),
  'TBL-06': none(1, 'The result is rendered from synthetic groups, rows and coverage the test writes by hand, and the browser opens a result the screening consumer prices from a synthetic upload built in memory (CLEAN_ROWS, e2e/screening.ts); no file.', [
    'apps/web/src/components/screening/result-tables.test.tsx',
    'apps/web/e2e/screening-phone.spec.ts',
  ]),
  'TBL-07': none(1, 'The browser opens a result the screening consumer prices from a synthetic upload built in memory (CLEAN_ROWS, e2e/screening.ts); no file.', ['apps/web/e2e/screening-phone.spec.ts']),
  'TBL-08': none(1, 'The words are rendered from synthetic groups, rows and coverage the test writes by hand, and the copy lint reads the screening files; no file.', [
    'apps/web/src/components/screening/result-tables.test.tsx',
    'tools/brand-copy/scan.test.ts',
  ]),
```

TBL-04's `assertedBy` stays `stacked-rows.test.tsx`; TBL-01's and TBL-03's are unchanged (`tools/brand-copy/scan.test.ts:298`
reads the real tree, as SCR-05's entry lists it, `registry.ts:384`). `pnpm synth` writes
`fixtures/synthetic/TBL-05..08/expected.json` (`"files": []`, the reason, `assertedBy`) and rewrites TBL-01's, TBL-03's and
TBL-04's assertions; none is written by hand. #42 edits the test matrix, `matrix.ts` and `registry.ts` far from the TBL
lines (SEC-18, SEC-19, SCR-21, SCR-22, JOB-05), as do the open #74, #75, #78 and #81: the PR merged second keeps both
(LANES.md rule 6).

---

## 5. ADR 0078: a dated amendment (needed)

Needed: this PR is the primitive's first user and changes what Decision 5 says a stacked item is (a description) and how
its terms stand (the 40% column), and it settles three things every later caller (UX PR 34, UX PR 85) meets: one column
list per table, copy-aware cells, and a footer row as the last item; and it applies Decision 1's "the cell gives way" to
a status chip. In the style of ADR 0037's and 0047's amendments (a dated italic paragraph, no in-place rewrite), after
Decision 5's paragraph (`docs/adr/0078-…md:88-110`):

> *Amended 2026-10-28 (`co-001/ux-screening-result-tables`, the fourth pull request and the first user):* a paired caller
> writes one list of columns per table, each with its label, its figure role (expected, paid or short) or the mono face,
> and whether it is a naming cell, and reads it in order for the table's headers, for each row's cells and for the
> stacked fields: the item's heading is its naming cells, and every other column is a field. A row's cells come from one
> renderer that takes the copy, the table's or the rows', so a component inside a cell (a status chip, a one-figure
> dash) carries the table's test hooks in the table copy and `data-stacked-…` hooks or none in the rows copy. A table's
> footer row, a sum of the rows a page does not list, is the list's last item. An item may carry a description, a line
> under its heading that says what its figures are where the table says it in the naming cell, so a heading stays the
> naming cell alone and a list read by its headings stays short. From 24rem the terms stand beside their values in a
> column of at most 40% of the list (`fit-content(40%)`), so a long term wraps between words rather than leave its value
> a sliver. In a table cell a status chip wraps above a 10rem floor, Decision 1's "the cell gives way", so a table whose
> statuses are sentences fits its card at 1280 px when its figures do. The switch is proved in the browser at 390, 820,
> 1263 and 1280 px and without script by `e2e/screening-phone.spec.ts` (TBL-05 to TBL-07), and `atPhoneWidth` checks a
> stacked list's values the way its `tables` option checks a table (`lists`).

The Status line already says the fourth pull request extends the ADR (`:3-4`), and the PRD-sections line already
reserves TBL-05 to TBL-08 (`:13-14`). ADR 0056 needs nothing: its tone table already gives an investigatory line the
unpriced tone (`:86`), which the follow-on applies.

---

## 6. No migration; overlaps; the pull request's description

### 6.1 No migration

None: markup, classes, component words, tests and documents only; no schema, function, policy or data change, and
`labels.ts` and its version are untouched. `docs/product/domain-model.md` is not regenerated and the CO-02 schema gate
does not apply. The follow-on needs none either if the labels ruling (9, Q1) is yes; if it is no, the labels' part is a
migration and goes to Lane A (1.3), never to Lane B.

### 6.2 The one #42-listed path: `tools/screening-capacity/watched-paths.txt`, by its generator

`watched.test.ts:18-20` holds the committed list equal to the import closure of the screening's entry points. The
components' new imports add two lines, in the list's sort: `apps/web/src/components/screening/table-parts.tsx` (after
`result-view.tsx`, `:53`) and `apps/web/src/components/stacked-rows.tsx` (after `scroll-table.tsx`, `:55`). The file is
on #42's list (pr42-files line 212), and it is a generated file: LANES.md rule 6 has each PR commit what its generator
writes and the PR merged second run it again on the merged tree, never a hand merge. So slice D runs `pnpm exec tsx
tools/screening-capacity/watched.ts --write` and commits its output; nothing in it is typed by hand. The open #75, #78 and
#81 each commit their regenerated copy of the same file today. PR 3 could avoid a new module on this path
(`scroll-table.tsx:5-12`); this PR cannot, because the stacked rows must be the one shared primitive (ADR 0078 Decision
5). The PR description names this path and the rule.

### 6.3 Overlaps with #42, and what the PR merged second does

| Where | Under this PR | If #42 merges second (at its base merge) | If this PR merges second (at its base merge) |
| --- | --- | --- | --- |
| `result.test.tsx` | not edited; every pin holds (4.2) | nothing required; may scope the DOM-order pins to the table copy (4.2) | nothing required; the follow-on (or slice B, 1.1) updates the words' pins |
| `e2e/screening.spec.ts` | not edited; every locator holds at its 1280 px (`:461`, `:468`, `:469` by DOM order, `:488-491`, `:492-498`; scratchpad `p4/tests.md` section 2) | rescope `:469` (#42 `:517`), `[data-section="anomalies"] [data-slot="status-chip"]` `.first()`, to `[data-section="anomalies"] [data-stacked-copy="table"] [data-slot="status-chip"]` (hardening: it holds at 1280 by DOM order and would pick the hidden copy below the switch) | the same rescope, as #42's file is then free |
| `e2e/screening.ts` | imported unchanged | if its final version changes a helper the new spec calls, update the call (none at 6f23c42b) | the same |
| `e2e/mail.ts` (new in #42) | absent | add the `stream` fixture to `screening-phone.spec.ts` (`holdScreeningStream('shared')`, its own 240 s timeout; 4.4) | the same |
| `watched-paths.txt` | regenerated (6.2) | run `watched.ts --write` on the merged tree | the same |
| test-matrix, `matrix.ts`, `registry.ts`, fixtures | TBL rows only | keep both (rule 6) | keep both |

If this PR merges first, the integrator adds one entry to LANES.md "Handed to Lane A" for #42's base merge: the
generator, the `stream` fixture and the `:517` rescope, each with its line.

### 6.4 Other pull requests

- **Open:** #74 (ux-forms) changes `components/screening/split-form.tsx`, `forms.test.tsx` and the test matrix: no code
  file in common. #75 (contract PHI check), #78 (ux-download-refusals) and #81 (SUITE-CAP-1a) change the test matrix,
  `matrix.ts`, `registry.ts` and `watched-paths.txt`: rule 6 (keep both; re-run the generator). Checked 2026-10-28 by
  the REST API at their heads.
- **Later:** UX PR 63 (`ux-screening-result-first`, depends on this one) reshapes `result-summary.tsx` and `result-view.tsx`
  and builds on this PR's tree; UX PR 85 (after #42) changes `anomalies.tsx` and drops the top rows' sentence from its
  list (1.5 item 3); UX PR 34 reuses `table-parts.tsx`'s pattern, the `lists` option and the amended Decision 5, and keeps
  `action-form.tsx`'s refusal hand-off (ADR 0078 Decision 5; no row form renders twice here).

### 6.5 What the pull request's description says

From `.github/pull_request_template.md`, with:
- Closes UX-005 (C-008) and UX-043 (C-119); UX-042 (C-118) and UX-132 (C-061) in part (the sign sentence; the code and
  "the engine"); UX-154's top-rows sentence. Left, with their PRs: section 1.3.
- The departures from the review's fix text and why (1.5).
- No #42 file edited by hand; `watched-paths.txt` by its generator (6.2); every `result.test.tsx` pin held (4.2); what
  the PR merged second does (6.3).
- ADR 0078 amended (5); no migration.
- The tests (4), the measured HTML size of the worst-shape page and its heap (4.6), the 1280 and 1263 px fit of the
  anomalies table and the floor used (2.7), each e2e shard's wall time before and after.
- The before and after screenshots (7.1), the UX and brand review's outcome, and the second review's lens and findings.

---

## 7. Screenshots for the UX and brand review; the second adversarial review's lens

### 7.1 Before and after

Before on a6e754fc, after on the branch; the screen tour's `screening-result` route (`tools/lane-b-screen-tour`,
`capture/tour.spec.ts:1556-1663`), whose one real send uploads CLEAN_ROWS. Each at **1280 light, 390 light and 1280
dark** (`data-theme="dark"` on `<html>`) unless the row says otherwise.

| State | Widths | Shows |
| --- | --- | --- |
| One anomaly (CLEAN_ROWS: 97140 under Medicare Advantage without a contract) | 1280, 390, 1280 dark, 390 dark | the stacked cards at 390 (heading, the figures together in mono, the status on its tint), the sign key, "Claim lines", the reason without its code, the statuses wrapped in their cells at 1280 |
| No anomaly (CLEAN_ROWS less its 97140 `ma_noncontracted` row) | 1280, 390 | every standing neutral, the counts |
| Several anomalies (CLEAN_ROWS plus `['97140', 'GP', '1', '11', 'medicare_ffs', '2026-Q2', '600.00', '50']`: the same code and price under Original Medicare, two anomaly groups) | 1280, 390 | two anomaly chips, in both copies |
| The band (820) | 820 | the anomalies and top rows stacked, terms beside values in their 40% column; the coverage table |
| The top rows at 390, scrolled to them | 390 | one top row's thirteen fields |
| The top rows at 1280, focused by Tab | 1280 | the table that still scrolls, its cue and focus outline |
| Not reached | | the others item (more than 50 groups; no repository fixture has them and rows are never invented, `tour.spec.ts:1662`): a static render of the unit test's later page at 390, light and dark, in the PR's screenshot set, as PR 3's primitive shot was |

The two extra uploads are the repository's CLEAN_ROWS less one row, or with one row's product changed: no invented
rows. Each uses its own practice name and address, so neither replaces the tour's main screening. The follow-on takes
the same set (its tone and count sentences are what these states show).

### 7.2 The second adversarial review's lens

The first review is the UX and brand review (`.claude/agents/ux-brand-reviewer.md`, LANES.md rule 1), on the shots
above. Recommended for the second: **correctness of the two copies and of what the result's words claim.** The risk in
this PR is not a new data path (it reads the same arrays) but a second rendering of every figure that must say exactly
what the table says, under the same words, on a public page a prospect uses to judge PaidWhole, beside a test file it
may not touch. The lens covers: each stacked value against its table cell and header (the four Medicare figures of a
top row, the others item's lowest figures under the fully reduced labels with their note), the roles and the brand's
order, the copy-aware hooks (none repeated, none of the table's in the rows copy, `render-result.tsx`'s and the large
test's counts), every `result.test.tsx` pin held with no edit and CI green, the HTML and heap budgets, the sign key
true to what `routes.ts` subtracts, the words at one row, one group and many, CO-11 and the no-finding rule, the list
semantics (names, heading levels, definition lists, "None" spoken), the container-query switch and the re-measure, and
the spec's freedom from the known races and its safety on retry.

---

## 8. Build slices and their order

Each slice owns its files; no file is in two slices. Every slice keeps `pnpm typecheck`, `pnpm lint` and its own tests
green.

| Order | Slice | Files | Depends on |
| --- | --- | --- | --- |
| 1 | **A. The primitive's two changes** | `components/stacked-rows.tsx`, `components/stacked-rows.test.tsx` | nothing |
| 2 | **B. The result's tables and words** | `components/screening/table-parts.tsx` (new), `components/screening/anomalies.tsx`, `components/screening/coverage.tsx`, `components/screening/result-summary.tsx`, `components/screening/result-tables.test.tsx` (new) | A |
| 2 | **C. The browser proof** | `e2e/a11y.ts`, `e2e/screening-phone.spec.ts` (new) | A's API and section 2.8's hooks (written beside B; run once B is in) |
| 3 | **D. Documents, synth and the generated list** | `docs/adr/0078-…md`, `docs/product/test-matrix.md`, `packages/synth/src/cases/matrix.ts`, `packages/synth/src/cases/registry.ts`, `fixtures/synthetic/TBL-01, -03, -04, -05, -06, -07, -08/expected.json` (by `pnpm synth`), `tools/screening-capacity/watched-paths.txt` (by its generator) | B and C (the `assertedBy` paths exist, and the closure holds the new imports) |

A first, alone; then B and C in parallel; then D; then the integrator runs, under the heavy-command lock: `pnpm lint`,
`pnpm typecheck`, `pnpm test`, `pnpm lint:copy`, `pnpm test:db` (the large result page above all, 4.6),
`pnpm test:e2e` (the new spec, `screening.spec.ts` and `tables-phone.spec.ts` first, then the suite), `pnpm actions:check`
is not needed (no workflow, manifest or lockfile change); then the screenshots (7.1).

**At slice B's start** the builder checks whether #42 has merged into `claude/build-platform`. If it has: merge the base
(rule 6: run the generator, keep both in the shared documents, add the `stream` fixture when C lands), and slice B also
does section 11's component parts and their pins (11.2 to 11.4), with 11.6's tests in the same file; the labels' part
follows the ruling (9, Q1).

---

## 9. Risks and open points, each with its answer

| Risk or open point | Answer |
| --- | --- |
| **Q1. Is `screening-labels/2026-11-05` released when #42 merges?** (`labels.test.ts:35-41` says "unreleased until PR 6b merges"; #42 is PR 6b-4) | Recommended ruling: it is released at the first deploy from main. Before launch no pull request goes into main (CLAUDE.md, Merging), so no environment a prospect uses keeps a summary under that name, and re-pinning the hash before then loses nothing the version protects (audit #57: a kept summary names the words its result was shown under). Asked of the co-founder (wording and product trade-offs on Lane B's work are delegated, LANES.md Delegations), with Lane A, which owns the labels' function. Yes: the follow-on re-pins under the same name, as PR 6b-2's review did, with no migration. No: the two labels and the reason go to Lane A's next schema PR that touches the screening (1.3). Until the answer, the follow-on leaves `labels.ts` alone |
| **Q2. `watched-paths.txt` is on #42's list** | A generated file under LANES.md rule 6, which names it: commit the generator's output, the PR merged second re-runs it (6.2); #75, #78 and #81 do the same while #42 is open. The PR description says so |
| **Q3. #42 merges before slice B starts, or during review** | Before B: B takes section 11's component parts (8). During review: scope unchanged; the follow-on is cut the same day (1.1) |
| The worst-shape page passes 512 KiB with the stacked copies | Estimated 400 to 450 KB; measured in slice B; above 460 KB, the lean classes in `stacked-rows.tsx` (4.6) |
| The anomalies table does not fit at 1280 px on CI's fonts | The spec says so; the floor goes to `min-w-36`, never below 9rem; the PR records the measurement (2.7) |
| The top rows still scroll at 1280 px | Sixteen columns; the cue says so (PR 3). Folding the one-line figures waits for #42's pins (P7) |
| 25 top rows of thirteen fields at 390 px make a long page, and the request form sits below them | Accepted: every column on a phone is the requirement and these rows are the evidence for the anomaly count. UX PR 63 moves the answer and the next step above the tables (its scope; P8) |
| `screening.spec.ts:469`'s `.first()` would pick the hidden copy below the switch | It runs at 1280, where the table copy shows and comes first: holds. The PR merged second rescopes it (6.3) |
| Pins that hold by DOM order only | Listed (4.2); the follow-on scopes them to the table copy |
| After both merge, the new spec runs while #42's cut-off journey pauses the screening stream | The PR merged second adds the `stream` fixture (4.4, 6.3); if this PR merges first, the LANES.md entry carries it to #42's session |
| The screening-capacity gate measures this PR | Expected within budget: the same reads, twice the tables' markup; its numbers go in the PR description |
| A resize past a switch loses something | Nothing typed lives in these lists (no forms); the two copies show the same data |
| `fit-content(40%)` in a grid track | CSS Grid's `fit-content()` track with a percentage shipped years before the engines ADR 0078 names (Chromium 105, Safari 16, Firefox 110) |
| A hidden table measures 0 and reads "fits", then shows | The spec loads at 390 and resizes to 1280, then waits for the scrollers to agree (4.4 step 6) |
| The sign key and the could-not-price sentence depart from the ruled words | Reported in the PR with their reasons (1.5); the co-founder may hold the ruled words, which are then the fallback |
| Until the follow-on, the anomalies card's page sentence says "the table’s last row" while a phone shows the sum as the list's last item | Only for a result of more than 50 groups; pinned (`:500-503`); the follow-on says "the last entry" (3.4) |
| Until the follow-on, the anomaly chip stays in Short's colour in both copies | As today; the follow-on's one change moves both (4.1 case 11) |
| The upload is replaced or rate-limited by another spec | Its own practice name and `.test` domain (4.4) |

---

## 10. Proposals outside this PR (improve as you go)

- **P1.** `counted()` (`lib/copy/words.ts:8-10`) groups no digits ("12345 rows") while the checklist sends every count
  through it (`ux-brand-reviewer.md:77`): group them app-wide (its test pins today's output), then `groupedCount` and the
  screening's own helper go.
- **P2.** `apps/web/src/app/brand.css:40-49`: the `.pw-status-*` classes are used nowhere, and `.pw-status-unpriced` sets
  its text in the unpriced grey (3.7:1, under 4.5:1) where `StatusChip` and ADR 0056:93-95 use Slate: align or remove.
- **P3.** At the next labels version, words that say whose gap it is for the engine details a prospect can meet
  (`labels.ts:176-189`: "No conversion factor for the year", "No sequestration record on the quarter's first day" are
  PaidWhole's content, as `no_locality_plus_four` at `:178` already says), and a fallback for ENGINE_ERROR with no
  detail other than the closed list's "Unexpected input" (`docs/product/unpriced-reasons.md:22`), which tells a prospect
  the product broke.
- **P4.** The engine's version on a prospect's page is an internal name (`ENGINE_VERSION = 'phase-two/2'`,
  `packages/pricing/src/trace.ts:22`): with UX PR 85's move to the foot, a public version name or the release number
  alone.
- **P5.** One noun for the Medicare figure in the headers: "Expected under Medicare, …" (`labels.ts:34-43`) beside the
  sentences' and the new difference headers' "Medicare figure"; at the next labels version, "Medicare figure, before the
  reduction across codes" (BRAND.md section 6 keeps "expected" for contract amounts).
- **P6.** When UX PR 34 meets long statuses in its tables (the Cases deadline's status, Claims and lines' Status), move
  `StatusCell` to `components/status.tsx` as the app's one floored status cell.
- **P7.** After #42, fit the top rows at 1280 px by showing each one-claim-line figure as a second line under its row's
  figure (one column instead of two, twice), which needs `result.test.tsx:458-466`'s whole-cell match changed.
- **P8.** For UX PR 63: with the top rows stacked at 390 px, put the request-an-audit step, or a link to it, above the
  tables.
- **P9.** Run `landmark-unique` in `expectAccessible` at 1280 px after a discovery run (PR 3's proposal); the result route,
  with its three regions, is a candidate.
- **P10.** The capacity harness's 404 race (`tools/screening-capacity/run.ts`, #42's; LANES.md 2026-10-26) is the race
  this spec's poll avoids: Lane A's fix can share the poll.
- **P11.** PR 3's design §3.6 sketch is stale (`stackBelow="56rem"`, a mono fully reduced figure that
  `brandOrderProblems` would flag, short labels the headers do not show): a line at its head pointing to this design.
- **P12.** The reviewer checklist (`.claude/agents/ux-brand-reviewer.md`): "a stacked list's items carry their own hooks,
  never the table's"; "a status that is a sentence wraps above a floor in its cell".

---

## 11. The follow-on after #42 (UX PR 4b), specified

### 11.1 Branch, timing, owner

`co-001/ux-screening-result-words`, Lane B, cut from `claude/build-platform` the day #42 merges (or folded into slice B,
section 8). No migration (with Q1 yes). It reuses TBL-08 (reworded, 11.5) and this design; its one adversarial review is
the UX and brand review on 7.1's states, with the second review's lens of 7.2 narrowed to the words and tones.

### 11.2 Component changes (`anomalies.tsx`; no #42 file but the pins)

- UX-040: the tone of `Standing` and of the others' chip (3.9), and the doc comment `:152`.
- UX-206: `anomaliesDescription` as 3.4: the closed set, the two counts together before the rule, "the last entry".
- "Below the Medicare figure by $5 a claim line or less" for a row or group with one figure (`:146`), as its pooled twin
  names its figure.

### 11.3 The labels (with Q1 yes; otherwise Lane A carries the same words under a new version)

- `DIFFERENCE_LABEL` = `` `Medicare figure less allowed, ${BEFORE_REDUCTION}` ``: "Medicare figure less allowed, before the
  reduction across codes" (`labels.ts:46`); `REDUCED_DIFFERENCE_LABEL` = "Medicare figure less allowed, fully reduced across
  codes" (`:49`). Both tables' headers, the stacked terms (one constant) and the summary card's (`result-summary.tsx:230`,
  `:246`) change together: one name per thing.
- `DETAIL_LABELS.place_of_service_unmapped` (`:175`): "This place of service is in neither the facility nor the
  non-facility list a screening prices by, so the row has no Medicare figure" (no closing stop, as every detail label).
- `DISPOSITION_NOTES` (`:161-168`) removed: no screen, worker or tool reads it, and two of its notes say "the engine".
- `labels.test.ts`: the hash re-pinned under `screening-labels/2026-11-05`, its comment naming this change and the
  ruling; its first case gains the place-of-service words.

### 11.4 The pins it updates (the files are free once #42 has merged)

- `result.test.tsx`: `:411`, `:419-424`, `:500-503` (the count sentence and "the last entry"); `:430-431`, `:510`
  (`data-tone="unpriced"`); `:432` ("Below the Medicare figure …"); with the labels, `:273` (the summary's literal
  header) and `:550` (the reason's words); and the DOM-order pins of 4.2 scoped to the table copy.
- `e2e/screening.spec.ts`: with the labels, #42 `:509` (the reason's words, its `data-reason` part kept); and the `:517`
  rescope if #42 did not take it (6.3).

### 11.5 TBL-08, reworded to its full text

| ID | Case | Assertion |
| --- | --- | --- |
| TBL-08 | The screening result's words and tones | The top rows head their claim-line count Claim lines; each difference column names its subtraction (Medicare figure less allowed) and one sentence above each table of differences says which way its sign runs; an anomaly shows in the unpriced tone and every other standing neutral, its words unchanged, and no screening component uses the short or the whole tone; the anomalies card puts the count on its noun (1 of 4 groups is an anomaly; 2 of 5 groups are anomalies; none of the 4 groups is an anomaly; the only group is an anomaly); the coverage shows an unpriced reason in words alone, its code kept in its row's data attribute; the could-not-price card and the top rows say what PaidWhole prices, never the engine; every count on the result groups its digits; an empty value is said as none; never owed, underpaid or recovered |

(With Q1 no, the clause "each difference column names its subtraction (Medicare figure less allowed) and" waits for
Lane A's labels, and TBL-08 keeps "one sentence above each table of differences says what each difference subtracts and
which way its sign runs".) `matrix.ts` byte-equal; `pnpm synth` rewrites `fixtures/synthetic/TBL-08/expected.json`.

### 11.6 Its tests

4.1's "what the follow-on adds", in `result-tables.test.tsx`; `labels.test.ts` as 11.3; the new spec's 390 step also
asserts each anomaly item's chip `data-tone="unpriced"`.

---

## 12. After the design review: the 10 findings, each accepted, and what changes

Every finding is accepted as the reviewer proposed it. Builders work from this section first.

- **P4-DR-01 (blocking), the stream lock now.** `screening-phone.spec.ts` takes the screening stream's lock itself,
  with no import of #42's `e2e/mail.ts`:
  - an auto fixture `stream` opens `databaseClient(e2eDatabaseUrl())`, runs `SELECT pg_advisory_lock_shared(760065)`,
    calls `provide()`, then runs `pg_advisory_unlock_shared(760065)` and closes the client;
  - it has `{ auto: true, timeout: 240_000 }`, as #42's `streamTest` does, and the consumer fixture depends on it;
  - a comment says the key is #42's `SCREENING_STREAM_LOCK` (`e2e/mail.ts`), and that once #42 merges, the PR merged
    second may switch to `holdScreeningStream('shared')`.
  - So the "stream fixture" row of 1.3 and 6.3 changes from "the PR merged second adds it" to "present from the start;
    the PR merged second may swap it for the shared helper".
- **P4-DR-02, the widths.** At 1263 px the page is capped by `max-w-5xl`, so it is the same as 1280 and its step is
  dropped. The narrowest width at which the tables show is a 994 px viewport (the container exactly 54rem). Spec step 7
  becomes "994 × 720: the anomalies and coverage `[data-slot="scroll-table"]` read `data-scroll="fits"`, no sideways
  scroll, `expectScrollersAgree`". Step 6 also asserts that the top rows' scroller overflows at 1280, with its cue.
  Section 2.7's width table, TBL-06 and the ADR amendment say 994, not 1263.
- **P4-DR-03, UX-040 on the phone now.** The rows copy takes 3.9's tones in this PR: an anomaly `unpriced`, every other
  standing `neutral`, and the others item `unpriced` when an anomaly is among them. The table copy keeps `short` until
  UX PR 4b, because #42's `result.test.tsx:430`, `:431` and `:510` pin it. Unit case 11 reads: "every rows-copy anomaly
  chip, and the others chip with anomalies, is `data-tone="unpriced"`; no rows-copy chip is short or whole; the table
  copy is as at a6e754fc". Spec step 3 asserts the rows copy's `data-tone`. TBL-08 says the phone's tone now and the
  table's in 4b.
- **P4-DR-04, the headings' mono spans** are `font-mono font-medium tabular-nums` (Plex Mono loads at 400 and 500 only),
  and the coverage heading's product is plain text. Unit case 7 asserts it.
- **P4-DR-05, one group among the others:** the naming cell and heading read "The one other group, its rows summed", and
  the chip reads "It is an anomaly" or "It is not an anomaly". Every other count keeps today's words, which the pins
  hold. Unit case 8 and TBL-08's "nouns agree" clause cover it.
- **P4-DR-06, the words:**
  - (a) `OTHERS_NOTE` becomes "The fully reduced figures take each row at its lowest: fully reduced for a code in the
    reduction across codes, its one figure otherwise." The builder confirms no #42 pin reads the old text; if one does,
    it stays and the change goes to 4b.
  - (b) The top rows' sentence: "PaidWhole prices one claim line under the Medicare fee schedule, before sequestration,
    and rounds that price once; the row’s figure is that price times its claim lines."
  - (c) The sign key ends "negative where it is above it".
- **P4-DR-07, the unit cases' wording:**
  - Case 7: every match of `/\$[\d,]+\.\d{2}/`, every value of a Rows, Claim lines, Units or Row field, and each
    heading's code and row number sit in `font-mono tabular-nums`. Counts inside a chip or the others heading are words,
    as in the table.
  - Case 9: "every Status cell of the anomalies and top rows tables, the others row's included, holds the `min-w-40`
    block; coverage's outcome chips are unchanged".
- **P4-DR-08, coverage headings** are distinct per product and outcome, and the Reason, the first field, tells apart an
  outcome with several reasons. The unit fixtures gain a coverage row with a second ENGINE_ERROR detail, and the test
  asserts the item keys (`data-stacked-row`) are distinct, not the headings.
- **P4-DR-09, the screenshots:** the "several anomalies" state is a static render of the unit test's synthetic
  multi-group page at 1280 and 390, light and dark, as the others item is. No row is invented in a tour upload.
- **P4-DR-10:**
  - (a) P1 becomes: "group digits in `counted()` and give `Counted` (`components/remittances/display.tsx:23-29`) its own
    grouped count; `words.ts` is in #74 now".
  - (b) The citations in 2.8 and 4.2: `result.test.tsx:548` (not :547) and `:368` (not :367).
  - (c) The integrator records in this PR's status file that UX-154's top-rows sentence closed here, for UX PR 85's
    entry.

### 12.1 Q1 (the labels version), decided for UX PR 4b

Taken as recommended (the brief's §6, the co-founder's delegation): `screening-labels/2026-11-05` is released at the
first deploy from main, so UX PR 4b re-pins its hash under the same name with no migration. The reasons:
- no pull request goes into main before launch, so no environment a prospect uses keeps a summary under that name;
- re-pinning before then loses nothing the version protects;
- PR 6b-2's review did the same (`labels.test.ts:35-41`, dfec40dc).

The function `screening_labels_version()` is Lane A's, so the status file names this for Lane A to confirm before 4b
starts. Lane A's objection, if it has one, moves the labels part to Lane A's next schema PR on the screening (1.3).
Nothing in this PR depends on it.

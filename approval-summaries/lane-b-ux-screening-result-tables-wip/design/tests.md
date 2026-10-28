# UX PR 4, tests scout (scout 2 of 3): reaching the result, the #42 pins, unit placement, TBL-01 to TBL-08, axe

Worktree `/home/user/ux-screening-result-tables` at `a6e754fc` (claude/build-platform, holds #79). #42 head
`origin/co-001/pr-06b-mail-streams` = `6f23c42b`, merge-base `e908c214`. Every line number is at `a6e754fc` unless it
says "#42 :N" (the file at #42's head). What #42 itself changes was read with the three-dot diff
(`origin/claude/build-platform...origin/co-001/pr-06b-mail-streams`); the two-dot diff also shows PR 3's own changes
(a11y.ts, tables-phone.spec.ts, anomalies.tsx, coverage.tsx), which are not #42's.

## 0. The constraint that shapes PR 4's scope (read first)

`apps/web/src/components/screening/result.test.tsx` is now a #42 file (pr42-files line 20; #42 adds its retention pin
at #42 :591-596). It is also in PR 4's own tree, and the `unit` job runs it on PR 4. PR 4 may not edit it while #42 is
open, and a PR never merges red. So "the PR merged second updates the pins" works only when #42 merges first. While #42
is open, every result.test.tsx pin is a hard constraint on PR 4's markup and words. Four parts of PR 4 break pins (section
3.3) and so cannot land while #42 is open:

| Part | Pins it breaks (result.test.tsx) | Also breaks |
| --- | --- | --- |
| UX-206, the count sentence | :411, :419-421, :422-424, :500-502, :503 | nothing else |
| UX-040, the anomaly in the unpriced tone | :430, :431 (`data-tone="short"` on the anomaly chips), :510 (`others` row `data-tone="short"`) | nothing else |
| UX-042, the header names (`labels.ts:46`, `:49` are #42's, under `lib/screening/*`) | :401 (headers `toEqual` the labels.ts constants), :531 (top rows contain `DIFFERENCE_LABEL`, `REDUCED_DIFFERENCE_LABEL`) | nothing else |
| UX-132, the reason's words (`labels.ts:175`, #42's) | :550 | `screening.spec.ts:461` (#42 :509) `toContainText('The place of service is not in the approved place-of-service split')` |

These land now with no pin broken: UX-005 (the stacked copies, if every hook in them is a `data-stacked-…` one, see
3.3); UX-043 (`anomalies.tsx:375` 'Claims' to 'Claim lines', unpinned); UX-042's sentence (`anomalies.tsx:359`,
unpinned); UX-132's code taken out of the cell (`coverage.tsx:94`, while `data-reason` stays on the `<tr>`, so :550 and
spec :461 hold); and UX-132's 'PaidWhole' for 'the engine' (`result-summary.tsx:267`, unpinned).

Recommendation for the author:
- If #42 merges before PR 4 is built, PR 4 is the PR merged second. It does all six findings and updates the pins in
  3.3, `screening.spec.ts` #42 :509, and `labels.ts` itself.
- Otherwise PR 4 lands the parts that keep the pins, and the four parts above follow in a short PR right after #42.
  That PR rewords TBL-08 (section 4.3), and is recorded in the status file's "after #42".
- Asking #42 to carry PR 4's pin changes is not an option. A commit after the founder approves #42 dismisses the
  approval (LANES.md "Handed to Lane A", #111 entry), and it would tie #42 to PR 4's design.

Also: `labels.ts:164` (`DISPOSITION_NOTES.unpriced`, 'The engine left the row without a price…') is in no rendered
page. `DISPOSITION_NOTES` (`labels.ts:161-168`) has no consumer in `apps`, `tools` or `packages`, so UX-132's third
change is moot. After #42, propose deleting the constant.

## 1. Reaching a populated result at 390 and 1280 with no #42 file edited

### 1.1 What `apps/web/e2e/screening.ts` exports (a #42 file; called, never edited)

| Export | Line | Use in the new spec |
| --- | --- | --- |
| `SCREENING_ZIP` ('00011', locality needs no ZIP+4) | :21 | yes |
| `SCREENING_ZIP_PLUS_FOUR` | :23 | no |
| `SCREENING_HEADER` (8 canonical columns) | :26 | yes |
| `ScreeningCsvRow` type | :28 | no |
| `CLEAN_ROWS` (8 SYNTHETIC rows: 4 Medicare-priced, 97112 at POS 99 left unpriced ENGINE_ERROR/place_of_service_unmapped, MA under contract and commercial `contract_required`, Medicaid `not_screened`; 97140 GP an anomaly, 97110 GP within the reduction range) | :38-47 | yes: it fills all three tables (4 groups, about 6 coverage rows, 4 top rows) |
| `SMALL_ROWS`, `SMALL_LEFT_OUT`, `OUTSIDE_ROWS`, `OUTSIDE_LEFT_OUT` | :54, :60, :67, :70 | no |
| `screeningRowsCsv(rows)` | :73 | yes: `screeningRowsCsv([SCREENING_HEADER, ...CLEAN_ROWS])`, as #42's mail-cutoff journey does (#42 mail-cutoff.spec.ts:95) |
| `screeningCsv(rows, header)` | :79 | alternative |
| `memberIdCsv()`, `dateOfServiceCsv()` | :87, :96 | no |
| `resultLinkIn(message)` | :102 | yes |
| `startLocalScreeningConsumer()` → `{ worker, close }` | :127-143 | yes, as an auto fixture |
| `expireScreeningsOnce()` | :146 | no |

What #42's head changes in it: only `startLocalScreeningConsumer`'s mail config, adding `eventsDir: E2E_MAIL_EVENTS_DIR`
and `streamPrefix: E2E_MAIL_STREAM_PREFIX` from #42's `env.ts` (#42 :8, :135-136). The signature and every other
export are unchanged, so a spec that calls it compiles and runs on either side. What #42 adds around it is a fixture:
`screening.spec.ts` #42 :43-58 wraps every screening test in `holdScreeningStream('shared')` from #42's new `e2e/mail.ts`
(#42 mail.ts:172-179, advisory lock 760065). The mail cut-off journey takes that lock alone and pauses the screening
stream (#42 mail-cutoff.spec.ts:30). The new spec cannot import `mail.ts` before #42 merges (it does not exist at
base). So **the PR merged second adds the same `stream` fixture to `screening-phone.spec.ts`**, with its own
`timeout: 240_000` as #42 :54-57 explains. Otherwise, after both merge, an upload can arrive while the stream is paused.

Other e2e helpers the spec uses:
- `withDatabase` (`helpers.ts:8-16`): a #42 file. #42 changes the key helpers but leaves `withDatabase` unchanged.
- `outboxFor` (`outbox.ts:19`): not #42's.
- `atPhoneWidth`, `expectAccessible`, `expectScrollersAgree` (`a11y.ts:101`, `:11`, `:127`): not #42's (#42 does not touch
  a11y.ts in the three-dot diff).

### 1.2 How screening.spec.ts sets up a result (a #42 file; read, never imported)

- **Consumer:** the `screeningTest` auto fixture, `:38-51`, runs `startLocalScreeningConsumer()` and closes it after the test.
- **The specialist's split approval:** `:150-180`. It calls `registerKeyAndSignIn(specialist, 'screening-specialist')`
  at `:154`, approves facility '21, 22, 23' and non-facility '11 12', and checks that the split equals `PREPARED_SPLIT`
  (`:171-176`). The step is redundant for a result: `prepare.ts:62` (`approvePreparedSplit`, `split.ts:21`) approves
  the same split before any spec runs. That approval is every practice's default and the free screening's split
  (`split.ts:5-11`; `screening.spec.ts:159`).
- **The upload:** `:209-254` downloads the template and refuses two files. `:257` builds the template plus rows,
  `:259` sets the file, `:270` clicks 'Screen the file', and `:272` expects `wait=soon`.
- **The emailed link:** `:363` polls the outbox (90 s), `:378` reads the run `complete`, and `:382` calls `resultLinkIn`.
  At base, `:378` reads the run once, right after the outbox file appears. That is the same commit race as the one
  below, and #42 fixes it with a poll (#42 :395-399).
- **The result:** `:413` `page.goto(link)`.

### 1.3 Does the seed or prepare.ts leave a result? No

`prepare.ts:33-72` does these steps, and nothing else:
- migrates the database;
- loads release 900001;
- seeds the personas and practices (`scripts/seed.ts`, which has no screening row);
- approves the split;
- creates the queues.

The result token exists only in the email. The database keeps its SHA-256 alone (`screening.spec.ts:389-392`), so a spec
can open only a result it uploaded itself. Each spec runs in parallel (`playwright.config.ts:92`, one database), so the
new spec makes its own screening.

### 1.4 The known flakes, and how the new spec avoids each

1. **`screening.spec.ts:339`** (LANES.md "Handed to Lane A", 2026-10-25). The test is now at :147 (LANES says :135),
   but the failing `expect` is still :339-355, with `stage: 'accepted'` at :347. The consumer prices the run between
   the upload's read (`:290-314`, `status: 'accepted'`) and the outcome's read (`:328-338`).
   - #42's fix reads the outcome with its run's status in one statement and expects `priced` when the run is `complete`
     (#42 :351-378).
   - **New spec:** reads no `screening_upload.status` and no `screening_outcome.stage`.
2. **`helpers.ts:87`.** The retry cannot recover because the first attempt already registered the hardware key.
   #42 makes the step safe to retry (`registerOrRestoreKeyAndSignIn`, #42 helpers.ts:136-157).
   - **New spec:** signs no one in and registers no key. The prospect's journey is public, and prepare.ts already
     approved the split.
3. **The link opened before the run commits** (LANES.md "Handed to Lane A", 2026-10-26: the capacity harness's
   `HTTP 404`). The consumer writes the email inside its completion's transaction, and a link that is "not yet complete
   is not found" (`lib/screening/routes.ts:79-80`).
   - **New spec:** after the outbox holds the message, poll the run's status until `complete` (≤ 30 s, every 250 ms,
     as #42 :395-399), then `goto(link)`.
4. **Replacement and rate limits.** `submit_screening()` replaces an earlier screening of the same practice (name and
   ZIP) or email (`routes.ts:70`; `result.test.tsx:605`). The `screening` bucket counts per email domain for a business
   address, 20 a day (`rate-limit.ts:47-50`). The e2e server trusts no proxy, so there is no address subject.
   - **New spec:** its own practice name (`SYNTHETIC PHONE SCREENING CLINIC`) and its own domain
     (`screening-phone-<hex>@clinic-phone.synthetic.test`). The domain is special-use `.test`, so #42's form gives it no
     ending warning (#42 address.ts:95-98).
5. **The shared queue.** `screening.spec.ts:272` pins `wait=soon`, which holds while fewer than 3 runs are pricing or
   queued (`routes.ts:684-689`; `config.ts:82`).
   - **New spec:** adds one run, so `soon` holds. Its own "sent" page asserts only `[data-state="sent"]`, never the wait
     state.
6. **Retries.** On CI a test retries once and a flaky test fails the run (`playwright.config.ts:96-97`, CI-07). A retry
   runs in a new worker, so a module-level `randomBytes` contact is new and the outbox is clean. The earlier attempt's
   screening is replaced by name, which is harmless.
7. **Never import from `screening.spec.ts`.** Importing a spec registers its tests. Copy the run SQL (`:139`) and write
   the four-field form fill (as `:693-704` and #42 mail-cutoff.spec.ts:90-97 do). The form needs no source or firm.

### 1.5 The spec's shape (`apps/web/e2e/screening-phone.spec.ts`, new)

```ts
// The consumer as screening.spec.ts's auto fixture (:38-51); after #42, extended from #42's `stream` fixture
// (holdScreeningStream('shared'), its own 240 s timeout) by the PR merged second.
const phoneTest = test.extend<{ consumer: Awaited<ReturnType<typeof startLocalScreeningConsumer>> }>({ consumer: [async ({}, provide) => { const c = await startLocalScreeningConsumer(); try { await provide(c); } finally { await c.close(); } }, { auto: true }] });

const PRACTICE = 'SYNTHETIC PHONE SCREENING CLINIC';
const CONTACT = `screening-phone-${randomBytes(4).toString('hex')}@clinic-phone.synthetic.test`;
const RUN = 'SELECT r.* FROM screening_run r JOIN screening_upload u ON u.id = r.upload_id JOIN screening_prospect p ON p.id = u.prospect_id WHERE p.contact_email = $1';

phoneTest('the screening result reads on a phone: … (TBL-05 to TBL-07)', async ({ page }) => {
  test.setTimeout(180_000);
  // 1. Upload CLEAN_ROWS through /screening (Practice name, State MN, ZIP code {exact} SCREENING_ZIP, Work email, File to screen,
  //    [data-state="file-ready"], 'Screen the file', [data-state="sent"]); poll outboxFor(CONTACT) to 1 (90 s); poll the run's
  //    status to 'complete' (30 s); link = resultLinkIn(message).
  // 2. What the page must list, from the database (as screening.spec.ts:462-486): screening_result_groups(sha256(token), 1, 100)
  //    (grp, standing), screening_result_coverage(sha256(token)), screening_result_rows(sha256(token), 25).
  // 3. At 390 x 844, goto(link) (a phone's first load: server markup, then hydration): see 1.6.
  // 4. Resize to 1280 x 720: see 1.6.
  // 5. At 820 px: the anomalies and the top rows stack, and the coverage keeps its table (see 1.6).
});
```

### 1.6 What the spec asserts at each width

The container widths are measured from `result-view.tsx:21`: `max-w-5xl` (1024 px), `px-4` (`md:p-10`), and the Card's
1 px border with `CardContent` at `px-6` (`packages/ui/src/components/card.tsx:5-31`). That gives these widths for the
`StackedRows` wrapper:
- about 894 px at 1280 (and at 1024 and 1263);
- about 308 px at 390;
- about 690 px at 820.

Every `stackBelow` in `StackBelow` is at most `'54rem'` (864 px, `stacked-rows.tsx:35`). So at 1280 the table copy
always shows, and at 390 the rows copy always shows, whatever the design picks.

**At 390** (the switch in a real browser, which `stacked-rows.test.tsx:12-14` and design 3.7 leave to this spec):
- **Lists.** `page.getByRole('list', { name: <card title>, exact: true })` is visible for each of the three cards.
  `page.getByRole('table', { name, exact: true })` has count 0, and each `[data-stacked-copy="table"]` is hidden.
- **Every cell in view** (UX-005's check). For each item, every `dd` passes `checkVisibility()`, its rect lies within
  `[0, innerWidth]`, and no status chip is cut (`scrollWidth <= clientWidth`). Each item's `dt` texts equal the table's
  `th` texts read from the hidden copy (`allTextContents` reads hidden nodes), less the heading's columns and in the same
  order. This is "the stacked rows hold every column", in the browser.
- **Counts and standings.** The items match the database: one per group, plus the "others" item when the page has
  others (CLEAN_ROWS gives one page, so none); one per coverage row; one per top row. Each group's stacked chip carries
  the database's standing (see the hook below), and 97140:ma_noncontracted and 97110:ma_noncontracted read the words
  `screening.spec.ts:490-491` pins.
- **atPhoneWidth.** `atPhoneWidth(page, 'the screening result')` runs with **no `tables`**, because the tables are
  hidden at 390 and naming one fails "no visible table named" (`a11y.ts:132-150`). It checks:
  - no sideways scroll;
  - every table, hidden or not, in a ScrollTable;
  - scrollers agree, visible ones only (`a11y.ts:176`);
  - axe with landmark-unique.

**At 1280:**
- **Tables.** Each table is visible by role and exact name, with its `tbody tr` count equal to the database's.
  Each list's `getByRole('list', …)` has count 0, and each `[data-stacked-copy="rows"]` is hidden.
- **Scrolling.** `document.documentElement.scrollWidth <= innerWidth`, then `expectScrollersAgree`, then
  `expectAccessible(page, 'the screening result at 1280 px')`.
- **Locators** that read a component part (`data-slot`, `data-tone`) are scoped to
  `[data-stacked-copy="table"]` / `"rows"` or `:visible` (ADR 0078:104-107).

**At 820** (each card switches at its own table's width, through the container query):
- the anomalies and top-rows lists are visible;
- the coverage table is visible (its `min-w-[40rem]` is 640 px, which fits 690 px);
- there is no sideways scroll.

**Hooks the spec needs from the design.** The stacked copy carries only `data-stacked-…` hooks
(`stacked-rows.tsx:30-31`, `:205`):
- `data-stacked-group="<code>:<product>"` (and `"others"`);
- `data-stacked-coverage` and `data-stacked-reason`;
- `data-stacked-row-no`;
- `data-stacked-standing` on the stacked chip, so 390 can assert the database's standing.

Never `data-group`, `data-group-no`, `data-coverage`, `data-reason`, `data-row-no`, `data-standing`, `data-anomaly` or
`data-figure="one-figure"` in the rows copy (3.3 says why).

**Proposal, in scope.** Put the in-view check in `a11y.ts` (not a #42 file) as a `lists` option of `atPhoneWidth`: each
named list visible at 390, and every `dd` of its items inside the window. UX PR 34's stacked working lists then reuse
it. This mirrors `tables`, which a stacked table can no longer use.

### 1.7 What the PR merged second must do to the new spec

- **#42 second** (PR 4 merged first): #42's merge of the base adds the `stream` fixture to `screening-phone.spec.ts`
  (`holdScreeningStream('shared')`). If its final `screening.ts` changes a helper this spec calls, it updates the call.
  At 6f23c42 it does not. It re-runs the watched-paths generator (section 3.4).
- **PR 4 second:** the same three steps, done by PR 4. It may then land the four parts of section 0 and update their pins.

## 2. screening.spec.ts locators (a #42 file) against PR 4's pairing, at the widths it runs

The result step runs at Desktop Chrome's 1280 × 720 (`playwright.config.ts:103-107`). `atPhoneWidth` at `:402` puts the
viewport back (`a11y.ts:115-119`), so the step at `:413` loads at 1280. The table copy comes first in the DOM
(`stacked-rows.tsx:134-144`), and Playwright's `page.locator` matches hidden elements.

| Locator (base line, #42 line) | Under PR 4 at 1280 | Condition |
| --- | --- | --- |
| `[data-coverage="medicare_ffs:unpriced"][data-reason="ENGINE_ERROR"]` toContainText(old words) (:461, #42 :509) | holds | The stacked copy repeats neither attribute (one match; `toContainText` is strict), and the words stay. UX-132's new words break it (section 0). Dropping the mono code does not. |
| `getByRole('table', { name: 'Anomalies by code and payer product' }).locator('tbody tr')` toHaveCount(groups) (:468, #42 :516) | holds | The table copy is visible at 1280. The name stays the CardTitle's (`anomalies.tsx:273`, `:284`, `aria-labelledby`). "Others" stays in `tfoot`. |
| `[data-section="anomalies"] [data-slot="status-chip"]` `.first()` toBeVisible (:469, #42 :517) | holds, by DOM order only | `.first()` is the table copy's chip, visible at 1280. At any width below the switch it would pick the hidden copy and fail. **The PR merged second rescopes it** to `[data-section="anomalies"] [data-stacked-copy="table"] [data-slot="status-chip"]` (or `:visible`), per ADR 0078:104-107 and the status file's carried item. This is hardening, not a fix to a failure. |
| `[data-group="${grp}"] [data-slot="status-chip"]` toHaveAttribute('data-standing', standing) (:488, #42 :536) | holds | `data-group` and `data-standing` stay on the table copy only. UX-040 changes the tone, not `data-standing`. |
| `[data-group="97110:ma_noncontracted"] …` toHaveText(WITHIN_REDUCTION_RANGE) (:490, #42 :538) | holds | The words are unchanged. |
| `[data-group="97140:ma_noncontracted"] …` toHaveText('Anomaly: more than $5 a claim line below the fully reduced figure') (:491, #42 :539) | holds | The words are unchanged (UX-040: "words unchanged"). |
| `body.innerText()` not FORBIDDEN, no tagline (:492-495) | holds | `innerText` skips `display: none`. New words avoid owed, underpaid and recovered. |
| `expectAccessible(page, 'the screening result')` (:496, #42 :544) | holds if axe is clean on the paired markup (section 5) | |
| `noSidewaysScroll(page, 390)` and `(page, 1280)` (:497-498, #42 :545-546) | holds | The rows copy at 390 is within the window. It reads `scrollWidth` without a poll, which is fine because a container query applies at the next layout. |
| `[data-figure="…"]` summary figures (:437-459) | unaffected | `result-summary.tsx` gets no stacked copy. |

Nothing in screening.spec.ts becomes wrong at its widths, as long as the stacked copy's hooks are all
`data-stacked-…`. The PR merged second does three things:
- rescopes `:469` (#42 :517);
- adds the stream fixture to the new spec;
- if PR 4 is the one merged second and takes UX-132's words, updates #42 :509 to the new words. The `data-reason`
  attribute part stays.

## 3. Unit tests

### 3.1 Placement and rendering

- **New file:** `apps/web/src/components/screening/result-tables.test.tsx`. It sits beside the components, is not a
  #42 file, and its name follows the branch. `result.test.tsx` is #42's, and the review's Files list (§3, UX PR 4) needs
  this change: result.test.tsx and labels.ts out, the new test file in.
- **Runner:** the `unit` project includes `apps/web/**/*.test.{ts,tsx}` (`vitest.config.ts:72-74`).
- **Rendering:** `renderToStaticMarkup` from `react-dom/server`, as `result.test.tsx:3` and `stacked-rows.test.tsx:4` do.
  `ScrollTable` (`'use client'`) renders its unmeasured state on the server, a region with `tabindex="0"`
  (`result.test.tsx:478-485`). `StackedRows` is a server component.
- **Fixtures:** its own SYNTHETIC ones, hand-written from G01's codes. `result.test.tsx`'s `GROUPS`, `ROWS` and
  `COVERAGE` (`:75-245`) are not exported, and importing a test file re-registers its describes.
- **Copy and watched paths:** test files are skipped by the copy scan (`tools/brand-copy/scan.ts:231`, `:589`) and left
  out of the screening-capacity closure (`watched.ts:153`), so the file adds no watched path.
- **Splitting the two copies:** cut the HTML at `html.indexOf('data-stacked-copy="rows"')`. Items match
  `/<li [^>]*data-stacked-row="([^"]*)"[^>]*>([\s\S]*?)<\/li>/g`; the hooks are spread before `data-stacked-row`
  (`stacked-rows.tsx:85`).

### 3.2 What it asserts (each `it` names its TBL ID)

1. **Every column, in order (TBL-05).** Each card's stacked items hold every column but the heading's, under the
   table's own header text and in the table's order. One constant of column labels feeds both (DR-08,
   `stacked-rows.tsx:13`).
2. **Brand order (TBL-05).** `brandOrderProblems(fields)` is `[]` for each table. Mark both Medicare figures as
   `figure: 'expected'`, and in the top rows the two one-line figures too; mark both differences `'short'`. The
   expected, paid, short run then holds with no column moved. That keeps `result.test.tsx:401` (header order) and
   `:447-468` (the `check()` by column index).
   - The carried item "reorder the anomalies table's columns" is then unnecessary. It came from design 3.6's sketch,
     which marked the reduced figure `mono`, between the figures. That sketch's `stackBelow="56rem"` is also not a
     `StackBelow` value: use `'54rem'`, `'54rem'` and `'40rem'`, each table's own `min-w`.
3. **No repeats between copies (TBL-05).** `repeatedIds(html)` is `[]` for each card, including:
   - the "others" item;
   - a one-figure dash (`anomalies.tsx:126`, `data-figure="one-figure"`);
   - the chips' `data-anomaly` and `data-standing` (`anomalies.tsx:155`).
4. **Table hooks only in the table copy (TBL-05).** The rows copy holds none of the table's hooks: no `data-group=`,
   `data-group-no=`, `data-coverage=`, `data-reason=`, `data-row-no=`, `data-standing=`, `data-anomaly=` or
   `data-figure="one-figure"`. `repeatedIds` misses a hook that appears only in the rows copy or with another value, so
   this is asserted directly. It also guards the specs' strict locators and `render-result.tsx:62-63`.
5. **The large test's counts (TBL-05).** With 50 groups and others, `/data-group-no="/g` counts 50 and
   `data-group="others"` appears once. These are the counts `result-page.large.db.test.ts:304-309` reads through
   `render-result.tsx:62-63`.
6. **Stack widths (TBL-06).** Each card switches at its table's own `min-w`: the classes `hidden @min-[54rem]:block` /
   `@min-[54rem]:hidden` for anomalies and top rows, and `40rem` for coverage. Each table keeps its ScrollTable region
   name and table class, so `result.test.tsx:479-484` and `:557-558` hold.
7. **Lists and headings (TBL-06).**
   - Each list is named by its card's title (`aria-labelledby="screening-anomalies"`, `"screening-coverage"`,
     `"screening-top-rows"`).
   - Rows are headed at h3 under the CardTitle's h2.
   - The empty states render no list: 0 groups gives the EmptyState only, and 0 top rows gives no CardContent.
8. **Mono and words (TBL-05).**
   - Every figure, code and count in the stacked copy is in the mono face.
   - The one-figure dash keeps its sr-only words.
   - Each stacked chip says the same words as its table chip.
9. **Copy (TBL-08).** No owed, underpaid or recovered in any rendered card, both copies included (the regex form of
   `result.test.tsx:247`).
10. **Words that land now (TBL-08).**
    - The top rows head 'Claim lines'.
    - The top rows' description says "A positive figure means the allowed amount in your file is below Medicare's
      figure; a negative one, above it."
    - The coverage cell shows no `ENGINE_ERROR` text while `data-reason="ENGINE_ERROR"` stays on its `<tr>`.
    - The could-not-price card says PaidWhole, not "the engine".
11. **Words after #42 (TBL-08, full form).**
    - No screening component uses the short or whole tone (UX-040): render every component and expect no
      `data-tone="short"` or `"whole"`.
    - The count sentence for 0, 1 and 2 anomalies (UX-206).
    - The difference headers (UX-042).
    - The reason words (UX-132).

### 3.3 Pins in result.test.tsx (base lines) that PR 4's markup or words would break

| Pin | What it holds | Broken by | Stays if |
| --- | --- | --- | --- |
| :401 | anomalies `<th>` texts `toEqual` the 10 labels, with `DIFFERENCE_LABEL`, `REDUCED_DIFFERENCE_LABEL` | UX-042 header names; any column reorder | headers keep the labels.ts constants and the order |
| :411 | '2 groups of 5 are anomalies.' | UX-206 | n/a |
| :418 | `data-anomaly="true"` occurs exactly 2 times in the anomalies card | a stacked chip that repeats `data-anomaly` | the stacked chip carries no `data-anomaly` (3.2 items 3 and 4) |
| :419-424 | `anomaliesDescription` strings ('2 groups of 5 are anomalies.', 'No group of 3 is an anomaly.') | UX-206 | n/a |
| :430, :431 | anomaly chips `data-tone="short"[^>]*data-anomaly="true" data-standing="anomaly">…` | UX-040 | n/a |
| :437 | 2 `data-figure="one-figure"` in the 97161 table row | nothing (row-scoped) | the table row keeps the dash's hook |
| :498 | `data-group-no` = ['51' … '55'] | a stacked hook named `data-group-no` | stacked uses `data-stacked-…` |
| :500-503 | '12,345 groups of 20,507 are anomalies.' | UX-206 | n/a |
| :510 | `others` row contains `data-tone="short"` | UX-040 | n/a |
| :531 | top rows' text contains `DIFFERENCE_LABEL`, `REDUCED_DIFFERENCE_LABEL` | UX-042 header names | n/a |
| :539 | 25 `data-row-no=` | a stacked hook named `data-row-no` | stacked uses `data-stacked-…` |
| :550 | `data-coverage="medicare_ffs:unpriced" data-reason="ENGINE_ERROR"[\s\S]*?The place of service is not in the approved place-of-service split` | UX-132's words (labels.ts:175) | the code span may go; `data-reason` stays on the `<tr>` |
| :479-484, :557-558 | each region's exact markup up to the `<table class="w-full min-w-[…]…" aria-labelledby="…">` | a changed ScrollTable label, table class or `min-w` | they are kept |
| :400, :447-458, :470-476 | `<th class="…">text</th>` captures, column-index mapping, `pr-3` on every `th` but the last | wrapping header text in a span, reordering, or changing `th` classes | kept (StackedRows renders `dt`, never `th`) |

These hold only because the table copy is first in the DOM (`[\s\S]*?` from a table row's hook): :402, :403, :409-410,
:417, :432, :534-536, :549, :551. `StackedRows` fixes that order, so they hold.

Do not pair the summary: `result-summary.tsx` gets no stacked copy, so :267-393 are untouched (:273, :290-291 and
:313-314 pin `DIFFERENCE_LABEL` on the summary).

### 3.4 Other tests PR 4's change reaches

- **`tools/screening-capacity/watched.test.ts:18-20`.** Importing `stacked-rows.tsx` from `anomalies.tsx` or
  `coverage.tsx` adds `apps/web/src/components/stacked-rows.tsx` to the closure, so `watched-paths.txt` must be
  regenerated (`pnpm exec tsx tools/screening-capacity/watched.ts --write`).
  - That file is generated and on #42's list (pr42-files line 212).
  - LANES.md rule 6 (Merging), its generated-files bullet (LANES.md:35), has each PR commit what its generator writes, and the PR
    merged second re-runs it on the merged tree. It is never hand-merged.
  - The status file should record this as the one #42-listed file PR 4 commits, under that rule. PR 3 avoided a new
    module for this reason (`scroll-table.tsx:9-11`); PR 4 cannot, since the primitive must be shared.
  - PR 4 changes watched paths (`anomalies.tsx`, `coverage.tsx`), so the screening-capacity gate runs on it.
- **`apps/web/src/lib/screening/result-page.large.db.test.ts:313-316`** (a `lib/screening/*` file: read, never edit).
  The worst-shape page must stay under 512 KiB of HTML, +64 MiB of heap after the render, and +8 MiB after collection.
  - Last measured: page 1 at 144 KB and +15.9 MiB (a log in this session's scratchpad).
  - The stacked copy roughly doubles the three tables' markup (50 groups, 25 rows, coverage). The estimate is under the
    limits; run `pnpm test:db` on that file and record the figures in the PR.
- **`apps/web/src/app/tables.test.ts`.** `StackedRows`' `table` prop holds `ScrollTable > table`, which the guard
  accepts as written. Do not put `wrap-anywhere` on a `td`; the stacked `dd` is not a cell.
- **`apps/web/src/components/stacked-rows.test.tsx`** is unchanged.

## 4. Test matrix and synth, TBL-05 to TBL-08, and the rewording of TBL-01, TBL-03, TBL-04

### 4.1 Conventions (checked at a6e754fc)

- **test-matrix.** `docs/product/test-matrix.md:320-332`, the "Tables (TBL)" section. The intro at :322-325 reserves
  TBL-05 to TBL-08 for this PR. Rows are `| ID | Case | Assertion |` with no `|` inside a cell.
- **Matrix rows.** `packages/synth/src/cases/matrix.ts:446-470` holds `{ id, title, assertion }` objects, byte-equal
  to the markdown rows. `packages/synth/src/fixtures.test.ts:33` requires every row word for word, and :59-60 requires
  that each `assertedBy` file exists. Watch quoting: TBL-01 is a single-quoted string because it holds double quotes;
  the others are double-quoted because they hold apostrophes. Write new text so it needs no escapes, or let Prettier
  quote it.
- **Registry entries.** `packages/synth/src/cases/registry.ts:655-673` uses `none(completesIn, noFileReason,
  assertedBy)` (`registry.ts:27`), `completesIn: 1` as TBL-01 to TBL-04.
- **Module number.** `MODULE_NUMBER` already has `TBL: 17` (`packages/synth/src/cases/common.ts:18`), and `CASE_MODULES`
  has `'TBL'` (`packages/synth/src/expected/types.ts:9`). Nothing to add.
- **Fixtures.** `pnpm synth` writes `fixtures/synthetic/TBL-05..08/expected.json` as generated no-file entries
  (`"files": []`, `noFileReason`, `assertedBy`), and rewrites TBL-01, TBL-03 and TBL-04's `expected.json` with the new
  assertions. They are never hand-written.
- **#42 overlap.** #42 edits test-matrix (SEC-18, SEC-19, SCR-21, SCR-22, JOB-05), `matrix.ts` and `registry.ts` far
  from the TBL lines, so no textual conflict is expected. These are shared documents under rule 6: the PR merged
  second keeps both.
- **Section intro.** Reword the intro's last sentence to: "TBL-01 to TBL-04 are the review's third pull request's (#79);
  TBL-05 to TBL-08 are the screening result's (its fourth)." This is not a row, so the fixtures test does not read it.

### 4.2 Reworded rows (the PR 3 status file's proposal: name what #79's fix round asserts)

TBL-01 adds two things:
- the keyboard proof (`tables-phone.spec.ts:61-116`, `cueByKeyboard`);
- the two guard rules #79's fix round added (`tables.test.ts:44-49`: repeated-label; wrap-in-cell and unfloored-wrap).

It avoids apostrophes so its `matrix.ts` string stays single-quoted. `assertedBy` is unchanged.

| TBL-01 | A wide table's scroller and a fixed-height text box | Rendered on the server as a region named after its table with ", scrolls sideways" added (a text box: ", scrolls") with tabindex 0, the containing block of what its table positions, with a visible focus outline, so it is reachable before any script runs; in the browser it has no role, name or tab stop while its content fits and the scroller itself does not hold focus (a link inside it does not count), and is a region again when the content overflows; edge fades show only at an edge with content past it and the caption "Scroll sideways for more columns." only while it overflows, both from classes and data attributes alone (no style attribute); at 390 px Tab reaches a wide table's region, whose frame draws a 2 px focus outline, an arrow key scrolls it, only the end edge fades at the start, both in the middle and only the start at the end, and the first link inside draws its ring inside its own box, within the scroller's clip; every table in apps/web/src is the direct and only child of the ScrollTable of components/scroll-table, under whatever name it is imported, and none is made by createElement or written in markup, but in the #42 pages listed with the pull requests that wrap them, and an exemption that no longer matches fails; no ScrollTable label is the same in every row of a list, in its file or through a component or import; and wrap-anywhere is never on a td or th, and inside one only on or within a block with a min-w |

(This text has apostrophes: "table's", "scroller's". Put it in `matrix.ts` as a double-quoted string with `\"` escapes,
or as a template literal, as Prettier chooses; the text is what counts.)

TBL-03 adds landmark-unique (`a11y.ts:96-97`, `:113`) and hands the screening result to TBL-07. `assertedBy` is
unchanged.

| TBL-03 | Every changed route at a phone's width passes axe | At 390 px every changed route, each with its wide table populated and overflowing, has no axe-core WCAG 2.1 A or AA violation, a scrollable region the keyboard cannot reach (scrollable-region-focusable) among them, and no two landmarks of a role share a name (axe's landmark-unique), every scroller's state agreeing with its measurement before axe runs; the screening result's is TBL-07 |

TBL-04 adds:
- the list role (`stacked-rows.test.tsx:91`);
- terms over values to 24rem (:110);
- the Badge and long-key wrap (:169, UX-PR79-03);
- no actions box for actions that render nothing (:195-215);
- never squeezed (:279);
- a nameless list refused (:298).

`assertedBy` is unchanged.

| TBL-04 | One stacked-row layout | Each stacked row is an item of a list named by its label or by the title that names it, a list by its role too (Safari drops the role of an unstyled list), headed by its naming cell at the level the caller gives (h3 by default; a link when the row has one), then a definition list of each column's label and value, terms over values until the list is 24rem wide, then the row's actions, with no actions box when they render nothing; expected, paid and short are given together and in that order, and the stacked rows keep the table's column order, each figure, code and count in the mono face with tabular numerals; a status chip, a Badge and a key longer than the card wrap inside it; the rows carry their own hooks, never the table's, and no id or hook repeats between the two copies; with a table, the table shows from the table's own width up and the rows below it, by a container query on a full-width wrapper that is never squeezed to nothing; a list with no name is refused |

### 4.3 New rows TBL-05 to TBL-08

| TBL-05 | The screening result's rows on a phone | At 390 px each row of the anomalies by code and payer product, the coverage and the rows with the largest differences is a stacked item (a group headed by its code and payer product, a coverage row by its payer product and outcome, a top row by its number and code) holding every other column under the table's own header and in the table's order: the Medicare figures, the allowed amount in the file and the differences together in the brand's order (expected, paid, short) in the mono face, a missing second figure said in words, and the status in words; the other groups summed are the last item; every value lies inside the window and no page scrolls sideways; the stacked items carry their own hooks, never the table rows', and no id or hook repeats between the two copies |
| TBL-06 | The screening result's tables from a desktop's width | At 1280 px the three tables show, each in its scroller named after its card's title, with one row for each group, coverage row and top row the database returns, and the stacked lists are hidden from view and from assistive technology; each card switches at its own table's width (at 820 px the anomalies and the top rows stack while the coverage keeps its table); each list is named by its card's title and its rows are headed one level below it; the table and the rows render from one row array and one list of column labels |
| TBL-07 | The screening result passes axe at 1280 and 390 px | A result the screening consumer prices from a synthetic upload has no axe-core WCAG 2.1 A or AA violation at 1280 px, and at 390 px none and no two landmarks of a role sharing a name, every scroller's state agreeing with its measurement before axe runs |
| TBL-08 | The screening result's words and tones | No screening component uses the short or the whole tone: an anomaly shows in the unpriced tone and every other standing neutral, its words unchanged; the anomalies card puts the count on its noun (1 of 4 groups is an anomaly; 2 of 4 groups are anomalies; none of the 4 groups is an anomaly); the top rows head their claim-line count Claim lines; each difference column names its subtraction (Medicare figure less allowed) and one sentence says which way the sign runs; the coverage shows an unpriced reason in words alone, its code kept in data-reason, and the result says PaidWhole, never the engine; never owed, underpaid or recovered |

TBL-08 while #42 is open (path B; the follow-on after #42 rewords the row to the full text above):

| TBL-08 | The screening result's words | The top rows head their claim-line count Claim lines and say in one sentence which way a difference's sign runs; the coverage shows an unpriced reason without its code, which stays in data-reason; the result says PaidWhole, never the engine; never owed, underpaid or recovered |

Registry entries, after TBL-04:

```ts
  // The screening result's tables, the UX baseline review's fourth pull request (docs/adr/0078).
  'TBL-05': none(1, 'The result is rendered from synthetic groups, rows and coverage the test writes by hand, and the browser opens a result the screening consumer prices from synthetic totals built in memory (e2e/screening.ts); no file.', [
    'apps/web/src/components/screening/result-tables.test.tsx',
    'apps/web/e2e/screening-phone.spec.ts',
  ]),
  'TBL-06': none(1, 'The result is rendered from synthetic groups, rows and coverage the test writes by hand, and the browser opens a result the screening consumer prices from synthetic totals built in memory (e2e/screening.ts); no file.', [
    'apps/web/src/components/screening/result-tables.test.tsx',
    'apps/web/e2e/screening-phone.spec.ts',
  ]),
  'TBL-07': none(1, 'The browser opens a result the screening consumer prices from synthetic totals built in memory (e2e/screening.ts); no file.', ['apps/web/e2e/screening-phone.spec.ts']),
  'TBL-08': none(1, 'The words are rendered from synthetic groups, rows and coverage the test writes by hand, and the copy lint reads the screening files; no file.', [
    'apps/web/src/components/screening/result-tables.test.tsx',
    'tools/brand-copy/scan.test.ts',
  ]),
```

(`tools/brand-copy/scan.test.ts:298` reads the real tree, as SCR-05's entry lists it, `registry.ts:384-390`.)

## 5. Axe at 1280 and 390 on `/screening/results/[resultId]`

- **Today.** `screening.spec.ts:496` (#42 :544) runs `expectAccessible` at 1280 only. At 390 the result gets
  `noSidewaysScroll` alone (:497), with no axe, and TBL-03 hands it to this PR.
- **The new spec at 1280.** `expectScrollersAgree` first, then `expectAccessible(page, …)` (`a11y.ts:11-13`, WCAG 2.0
  and 2.1 A and AA tags).
- **The new spec at 390.** `atPhoneWidth(page, 'the screening result')` with no `tables` (`a11y.ts:101-120`). It waits
  for the scrollers, then runs axe with landmark-unique. Load at 390 first (`setViewportSize` before `goto`), so the
  phone path runs from the server's markup through hydration.
- **What the paired markup must keep for axe:**
  - The hidden copy is `display: none` (`stacked-rows.tsx:38-44`), so it is out of the tree and out of axe. Its ScrollTable
    regions are out too, so no hidden region trips scrollable-region-focusable or landmark-unique.
  - Each `dl` holds only `dt`/`dd` pairs (fragments, `stacked-rows.tsx:97-105`), which satisfies `definition-list` and
    `dlitem`.
  - The list is `ul role="list"` with `li` children (`list`, `listitem`).
  - No `id` repeats: the list uses `aria-labelledby` to the CardTitle's single id. `repeatedIds` holds this in the
    unit test.
  - The chips keep text on tint. The unpriced tone (UX-040, after #42) is already on this page in Coverage
    (`coverage.tsx:28-35`) and passes `:496`. ADR 0056:93-95: Slate text, unpriced border.
  - The stacked headings are h3 under the h2 CardTitle. heading-order is a best-practice rule, not run under these tags,
    but keep it right.
  - landmark-unique at 390: `PublicHeader` and `main`, plus the groups' `nav` only when there is more than one page
    (none for CLEAN_ROWS). Nothing repeats.
- **Optional, cheap.** A JavaScript-disabled context at 390 proves the CSS-only switch before any script, the state
  ADR 0078 calls the safe failure. It needs the link only: open it in a second context with `javaScriptEnabled: false`
  and check the rows copy is visible.

## 6. Cited evidence re-checked at a6e754fc (the review's lines were at 4d99df8)

| Cited | Now |
| --- | --- |
| anomalies.tsx:286-299 (ten-column table, no cue) | :291-292 in `ScrollTable` (PR 3), `min-w-[54rem]`; headers :295-304 |
| anomalies.tsx:359-360 (top rows) | :364-365 in `ScrollTable`, `min-w-[54rem]` |
| coverage.tsx:61-62 (bare overflow div) | fixed by PR 3: :65-66 in `ScrollTable`, `min-w-[40rem]` |
| anomalies.tsx:151-157 (Standing short), :262 (others) | :152-159, :263 |
| coverage.tsx:26-33 (TONES) | :27-35 |
| labels.ts:46, :49 (difference labels) | unchanged, :46, :49 |
| anomalies.tsx:354 (sign sentence) | :359 |
| anomalies.tsx:370 ('Claims') | :375 |
| coverage.tsx:90-91 (code over words) | :90-96, code at :94 |
| labels.ts:175, :164 | unchanged; :164 is in the unused `DISPOSITION_NOTES` (labels.ts:161-168) |
| result-summary.tsx:267 | unchanged, :267 |
| anomalies.tsx:180 (count sentence) | :181 |
| ADR 0056:80 (Flagged takes unpriced) | ADR 0056:86-87 |
| screening.spec.ts:135 (LANES flake test) | :147; the failing expect still :339 (#42 rewrites it at #42 :351-378) |

## 7. Proposals outside this PR (for notes)

- **After #42:** delete the unused `DISPOSITION_NOTES` (`labels.ts:161-168`), a `lib/screening/*` file.
- **After #42:** rescope `screening.spec.ts` #42 :517's `.first()` to the table copy (section 2), if #42's fix round does
  not.
- **ADR 0078 nit:** design 3.6's sketch uses `stackBelow="56rem"` (not a `StackBelow`) and a `mono` reduced figure between
  figures (which `brandOrderProblems` flags). The ADR text is right; only the design doc's sketch is stale.
- **a11y.ts:** export an axe call with landmark-unique for 1280 (PR 3 proposal "landmark-unique in expectAccessible at
  1280 after a discovery run"); the result route is a candidate for that discovery run.
- **The capacity harness's 404 race** (`tools/screening-capacity/run.ts`, #42's) is the same commit race as 1.4 item 3.
  The new spec's poll is the pattern Lane A's fix can share.

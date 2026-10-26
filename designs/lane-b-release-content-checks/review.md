# Review: release content checks (#7, #30, #31, #59) design

Reviewer: adversarial design review, 2026-10-26, against `claude/build-platform` at 6ddd587.
Design: `/home/user/ops/designs/lane-b-release-content-checks.md`.

**Verdict:** the design is not ready to build. One finding blocks it and seven are major. Each fix fits this PR, needs no
migration, and stays inside #30's exception and the #42 boundary.

**Migration verdict:** no migration is needed, as the design says. I checked each part:
- `pricing_run.failure_code` has only the shape CHECK (20261018090000:44,51), and no trigger lists its codes.
- `NOT_ACTIONABLE_REASONS` is a code list. No SQL names its values.
- `rule_release_content_span()` is granted to `tp_app` (20261105090000:1044).
- `rule_record` is SELECT for `tp_app` (20261015120000:88).

None of the fixes below needs DDL either. Handing `operator_content_coverage()` to Lane A for the later daily job is right.
ADR 0019 confirms that `tp_operator` reads no rule table.

## Verified as the design states
- The engine writes an `mppr` adjustment for every line with `apply_mppr` on, with `in_pool: false` when the code is not
  found (engine.ts:719-756). `no_mppr_rate` is a stop with no entry (:731), and a day that throws clears its entries
  (:709-714). `mue.checked` follows `apply_ncci` (:350-356). So `contentReads()` sees every MPPR and MUE read.
- The engine's keyed lookups are `pfs_rvu`, `ncci_mue`, `mppr_rate`, `ncci_ptp`, `locality_map` and
  `locality_map_plus_four` (engine.ts:354,373,584,609,625,762,770). `claimsRequestedKeys` covers each of them, and the
  PTP pair orientation matches :373.
- The design touches no file in `pr42-files.txt`, apart from the four shared documents. This is checked mechanically
  for every path named in section 7.1.
- Fixture number 900007 is free, and 900001 to 900006 exist. The open `co-001/*` heads do not yet include
  superseded-rerun, ci-deps or model-eval-gate, so the builder's re-check before the commit is needed.
- `locality_status()` reports a missing ZIP quarter as `locality_not_loaded`, never as `zip_unknown`
  (20261105090000:224-233). So #30's quarterly ZIP windows never blame the customer's location.

## Findings

### B1 (blocker): the heap flag puts a new file on the screening-capacity watched list, which is #42's
- **Where:** 5.10, "Added to `containers.ts`: `SERVICE_COMMANDS.worker` is `['node', '--enable-source-maps',
  heapFlag('worker'), 'dist/main.js']`"; 5.0 says `infra/lib/heap.ts` is reached by no entry point.
- **The problem:** `tools/screening-capacity/containers.ts` is in the closure, through `run.ts`. `watched.ts:165`
  removes only paths matched by `WATCHED_FIXED`, and `infra/lib/heap.ts` matches none of them. So once `containers.ts`
  imports `heapFlag`, `watched.ts` derives a new line. Then `watched.test.ts` fails unless `watched-paths.txt`, a #42
  file, is regenerated. This breaks the placement rule (5.0) and the "Not touched" list.
- **Fix, either of these:**
  - Keep the worker's service command in `tools/release-capacity/` (for example, `run.ts` builds its own
    `ServiceSpec`), and leave `containers.ts` with only a widened `ServiceName`, or none.
  - Define the heap constants in a file that is already watched by a fixed pattern (`infra/lib/environments.ts` is in
    `WATCHED_FIXED`).

  Name the proof (`watched.ts` output unchanged) in WP9's handover.

### M1 (major): a missing fee-schedule quarter is neither alerted nor worded
- **Where:** 5.6.5 and 5.6.6. The fee-schedule gap is judged as "no `pfs_rvu` window meets [basis_year-01-01,
  basis_year-12-31]", and `loadedYears` are the years any window meets.
- **The problem:** #30's R1 makes `pfs_rvu` quarterly. With 2026 Q1 to Q3 loaded and Q4 not, every CURRENT
  percent-of-Medicare line dated October to December stops as `NO_PFS_VALUE no_rvu_in_basis_year`
  (engine.ts:584-586). But 2026 "is loaded", so:
  - no content alert is logged;
  - no Coverage sentence is shown;
  - the customer gets the "check the code and year" remedy.

  #7 and #59 aimed to remove exactly this outcome, and R1 makes it happen every quarter.
- **Fix:** judge by date for `year_basis` CURRENT: the line's `service_date` outside every `pfs_rvu` window. Keep the
  year test for LOCKED. Word the sentence per quarter: "PaidWhole has not loaded the 2026-Q4 Medicare fee schedule
  yet". `feeScheduleYearsNotLoaded` becomes per quarter, grouping on the trace's `lookup` and `service_date`. Add a
  `content.test.ts` and `content.db.test.ts` case where Q4 is missing and Q1 to Q3 are loaded.

### M2 (major): one long-window record marks a whole content as loaded, and C1 and C2 check parsed records only
- **Where:** 5.3, where C1 and C2 apply "only when `!set.synthetic && record.source.method === 'parser'`";
  `rule_release_content_span()` (20261105090000:1011-1044), whose span is the union of every record's window.
- **The problem:** a hand-typed per-code `mppr_rate` record (CMS added 97026 mid-year, so this is realistic) or a
  hand-typed `ncci_mue` record with an open or year-long window extends that content's span for every code. Then:
  - #7's run refusal and the screening's out-of-span refusal silently pass;
  - every other code reads as "not on the list", which overstates the expected amount.

  Nothing in the design stops it: the schema allows `hand_typed` for any type, and the skill's "never by typing" is a
  convention only.
- **Fix:**
  - Apply C1 and C2 whatever the method (all real content), and refuse hand-typed records of the quarterly types and
    of per-code MPPR outright (a new problem string, inside #30's exception).
  - Optionally add a checker rule that every record of `ncci_mue` and `mppr_code` in a release shares one of the
    content's file windows, so a partial file cannot widen the span.
  - Add an RCC-02 or RCC-04 case for this bypass.

### M3 (major): R1's exact-quarter rule refuses CMS's mid-quarter corrections
- **Where:** 5.2.1 (I5) and 5.3 (C1).
- **The problem:** the repository models RVU corrections that take effect inside a quarter: "2% of codes corrected
  inside a quarter, as CMS's quarterly correction files do" (`packages/synth/src/release/scale.ts:62-64`,
  `correctionDay: '05-16'`). Under I5 and C1, a correction cannot be imported for [day, quarter end]. The old values
  cannot be closed at the day before either. The only options left are to price the whole quarter wrongly or to load
  nothing.
- **Fix:** refuse fewer imports, which still adds refusals only:
  - require the window to lie inside the one CMS quarter the file states (both ends in that quarter), never open;
  - keep R4 (no gap) and the overlap refusal, so the quarter is still covered exactly once per code;
  - C1 becomes "inside one CMS quarter".
  - The README gives the correction procedure.
  - RCC-01 adds an accepted correction window.

### M4 (major): a month refused for missing MPPR or MUE content alerts nobody
- **Where:** 5.6.2, where `ContentNotLoaded` → `failRun(code)` "logs nothing (the monitor logs the month)"; 5.6.3's
  `WAITING_ON_CONTENT`; 7.2, whose later-PR alarms list `CONTENT_NOT_LOADED` and the daily job's stages only.
- **The problem:**
  - A run a person creates, or a re-run, that fails `waiting_on_content_*` writes no log line.
  - The monitor's `WAITING_ON_CONTENT` line has no metric filter or alarm, even in the later PR.
  - So the case #7 is about (MPPR or MUE lapsed while MA months arrive) reaches the operator only through the calendar,
    and only once the later daily job and its function exist.

  #7's "one content alert per run instead of an engine-error page" is not met for the very contents it names.
- **Fix:**
  - Log the content alert on the content refusal too: the same `CONTENT_NOT_LOADED_MESSAGE`, with `error_code` and
    `record_count` set to the number of lines that read outside the spans. It is one fixed line per run, with IDs only.
  - Add the `WAITING_ON_CONTENT` (or `CONTENT_NOT_LOADED`) metric filter and alarm to the later PR's `monitoring.ts`
    row in 7.2.
  - Add an RCC-04 assertion: one alert line on a refused run.

### M5 (major): the calendar says nothing but "no release" until release 1 is published
- **Where:** 5.8.2, rule 1: "If `releaseNo === null`: one item, `no_release`. Nothing else but the calendar's own
  findings".
- **The problem:** #59 lands "before release 1 prices a real customer and before the 2027 fee-schedule cycle"
  (combined-report.md:726). The 2027 final rule appears in early November, and release 1 is not published yet. So
  through the 2026-2027 cycle the main signal (a due date passes with no draft) never fires: no `no_draft` for the
  2027 conversion factor, RVU, MPPR list or 2027-Q1 MUE.
- **Fix:** with no published release, evaluate the windowed and open families against `pending` (the drafts and
  outgoing) as the in-force state. Stage titles say "in the drafts" instead of "loaded". Keep a single `no_release`
  item beside them. Add an RCC-08 case: no release, drafts through 2026-12-31, today 2026-12-10, so `no_draft` for the
  2027 entries.

### M6 (major): the real-size test runs an obsolete release shape, one job at a time
- **Where:** 5.10; `packages/synth/src/release/scale.ts:476-488`, where the scale release still has calendar-year RVU,
  GPCI, ZIP5, ZIP9 and MPPR windows.
- **The problem:**
  - #30 makes every quarter permanent for six years (R1, the README's "Keep every quarter", R3's look-back). Release 1
    and later releases then hold up to 24 quarters of RVU (about 19,000 codes each), MUE (about 15,000) and ZIP5
    (about 42,000). That is roughly 1.8 million more keyed records than 900100's shape, before PTP. #31's only proof
    measures a release that #30 makes unrepresentative.
  - The harness runs price, then triage, then report, in sequence. In production one worker runs every job type's
    `boss.work` loop at once, with `parse_835` at local concurrency 4 (`apps/worker/src/worker.ts:225`,
    `jobs/registry.ts:147,157`). So a price job and another practice's Chromium report can be in memory together.
- **Fix:**
  - Give `SCALE_RELEASE_SHAPE` (not a #42 file; watched, so the gate measures it) quarterly windows and the look-back
    depth #30 implies, or a second shape used by release-capacity. Record the counts' basis.
  - In the harness, run one practice's price job concurrently with a second practice's audit-report PDF and four
    835 parses. Fail on `memory.peak` as written.

### M7 (major): the stated-quarter rule refuses the real GPCI file, and its cross-check is only what the operator types
- **Where:** 5.2.1, `statedQuarter` patterns and I2; `content/sources/README.md:61` (`GPCI2026.csv`) and `:66`.
- **The problem:** the GPCI file ships inside the RVU zip without a quarter token in its name or title. So I2
  refuses every real GPCI import, and the operator must rename the file to include a token. Then the "cross-check
  against what the file declares" checks only the operator's own renaming. The patterns also do not cover CMS's
  "effective MM/DD/YYYY" style for MUE tables (the design says the first download decides).
- **Fix:** without a new flag, read the quarter also from the stored source's `--url` file name (the zip `RVU26D`,
  or the MUE zip's `2026-q4`), which the importer already requires. Add an
  `Eff(?:ective)?[ _-]?(\d{2})[-_/](\d{2})[-_/](20\d{2})` pattern, taking only a quarter's first day. Make the README
  row 2 command import the GPCI file with that URL. These remain refusals only.

### m1 (minor): a read outside the fetch can be hidden by an earlier location stop
- **Where:** 5.6.2, the precedence rule.
- **The problem:** `onLocation` throws on the first line that stops on the location, so a claim in a later batch never
  prices and its violation is never seen. The precedence holds only for violations seen before the first location
  stop.
- **Fix:** either state the narrower guarantee in the ADR and in RCC-04's wording, or record the location stop and
  throw it after the batch's violation check.

### m2 (minor): a month waiting on content never re-plans when its agreements change
- **Where:** 5.6.3.
- **The problem:** the wait ends only when a release covers more or a newer line arrives. If the practice remaps the
  plan to a commercial contract with the flags off, or signs off a version, the month stays "waiting on Medicare
  content" with a wrong card.
- **Fix:** end the wait when a mapping or contract version of the practice changed after the failed run's
  `created_at`. This is the same shape as `waitingOnLocation`'s `practice_site.updated_at` test.

### m3 (minor): `previousReleaseNumber` treats any read error as "no releases"
- **Where:** `tools/release/impact.ts:79-89`, which design 5.5.1 moves.
- **The problem:** the function swallows every `readdir` error. A non-ENOENT failure makes the assembler build a
  "first release" with no comparison, and its post-assembly check computes the same null and passes.
- **Fix:** in the moved `packages/rules/src/content.ts` version, catch ENOENT only.

### m4 (minor): the workflow judges the newest published release, not the one in force
- **Where:** 5.8.3.
- **The problem:** with #8 a published release is in force only once a deploy loads it. The workflow's "loaded
  content ends" can then describe a release production is not running.
- **Fix:** word the issue bodies as "the newest published release (<n>)". The runbook says that the console (and the
  later daily job) read the release in force.

### m5 (minor): the windows query scans the whole release inside a web request on a cache miss
- **Where:** 5.9.
- **The problem:** at real size the aggregate over about 2.5 million rows (or up to about 4 million under M6's shape),
  reading `source->>'retrieved'` from each, runs inside the Releases, Coverage or console request on the 1 GiB web
  task, after each deploy and each new release.
- **Fix:** measure it in release-capacity (M6), with a stated budget. Name it in the #8 proposal for stored release
  counts.

### m6 (minor): file names from fetched pages go into public issues unescaped
- **Where:** 5.8.3.
- **The problem:** the names come from a third-party page and reach the issue body as Markdown.
- **Fix:** keep only names matching `^[A-Za-z0-9._-]{1,120}$`, and render each in a code span (no `@` mention or
  link can form). Add a test with a hostile `href`.

### m7 (minor): the two-person withdrawal checks only that two strings differ
- **Where:** 5.1, `withdrawn_by !== confirmed_by`.
- **The problem:** one person can type two names.
- **Fix:** state in the ADR that the founder's code-owner review of `content/drafts/COVERAGE-WITHDRAWN.md` (`*` in
  CODEOWNERS) is the real second signature. Compare the names trimmed and case-folded.

### m8 (minor): memory of the coverage map and the daily drafts read is never bounded
- **Where:** 5.1, R5's test; 5.8.3.
- **The problem:**
  - The 2,000,000-identity map test asserts that the map holds no record, but not its size. One Map entry per PTP
    pair is roughly 300 to 400 MB of V8 heap.
  - The calendar CLI reads every draft record daily inside a 15-minute job.
- **Fix:** assert a heap bound in the map test. Have the CLI summarise drafts file by file (records of one file share
  a window), without holding records.

### n1 (nit): wording and constants that do not match
- The README and RCC-03 say "the drafts note moves into the release", while 5.5.4 deletes it and copies its entries.
- `HEAP_MIB.platform` is 256, while the stated measurement is 259 and the claim is "changes no behaviour".
- `contentOf` splits MPPR by `key ? 'hcpcs'`, while the SQL function selects the general rate by `key ? 'component'`.
  Use the same test as `rule_release_content_span()`.

## Overlaps the design names correctly
- superseded-rerun: `FailureCode` and `FAILURE_TEXT`.
- ci-deps: `workflows.test.ts` and the pins of the new workflows.
- db-function-diffs: `MODULE_NUMBER`.
- #8: `ReleaseSource`.

One more overlap: if M6's fix changes `scale.ts`, screening-capacity measures it. That is within this PR's budget
(6.5).

## Proposals outside this item (notes)
- The repository grows with #30's retention plus releases stored as whole snapshots. Each published release copies
  every quarter's records into `content/releases/<n>`. Size it with #31's PTP question before release 1, and consider
  releases that reference unchanged files.

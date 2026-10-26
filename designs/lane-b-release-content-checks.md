# Release content checks (#7, #30, #31, #59): the build contract

Lane B, queue item 14. One pull request into `claude/build-platform`, no migration. Its #42-file parts go in a later
pull request after #42 merges. Builders implement this text without re-deciding anything. When the text and the code
disagree, the code at 6ddd587 is the fact: stop and ask, never guess.

## 1. Status, base and sources

- **Status:** design, written 2026-10-26; revised the same day after the adversarial review (1 blocker, 7 major, 8
  minor, 1 nit; every finding answered in Appendix A, "Design review and dispositions"). No code written.
- **Base:** `claude/build-platform` at `6ddd587`.
- **Branch:** `co-001/release-content-checks`, cut from the latest `claude/build-platform`.
- **Worktree:** `/home/user/release-content-checks`.
- **PR:** draft first, into `claude/build-platform`. Never into `main`.
- **Reserved (LANES.md claim row):** ADR 0071; test-matrix RCC-01 to RCC-08; `packages/synth` cases RCC-01 to RCC-08.
  Also, added by this design (the builder adds them to the claim row before the first commit):
  - fixture release **900007**: free on `claude/build-platform`, on #42's head (`co-001/pr-06b-mail-streams` at 13f59b12)
    and on `co-001/db-function-diffs` (2abcf838), checked 2026-10-26 by `git grep -E '90000[78]'`;
  - `MODULE_NUMBER` **RCC = 14**. `co-001/db-function-diffs` already took DBF = 13
    (`packages/synth/src/cases/common.ts:18` on 2abcf838), so 13 is not free.
  - synthetic release number **900110**, for the quarterly scale release the weekly test builds outside the repository
    (5.10). Free on `claude/build-platform` (6ddd587), `co-001/pr-06b-mail-streams` (13f59b12),
    `co-001/db-function-diffs` (e1896d55), `co-001/pr-15-ledger-tests` (f4d125b1) and `co-001/reconciliation`
    (cd8056de), checked 2026-10-26 with `git grep -nE '900110|900_110'`. 900101 is not free: it is
    `packages/db/src/screening-queue.db.test.ts:34`'s scratch number.
- **Sources (all at 6ddd587 unless named):**
  - The audit: `/home/user/ops/audits/combined/combined-report.md` #7 (:254-262), #8 (:265-273, Lane A, context),
    #30 (:463-470), #31 (:472-479), #59 (:724-731).
  - The lane rules: `/home/user/ops/LANES.md` rules 1-12, queue item 14, the claim row.
  - Lane B conventions and rulings: `/home/user/ops/lanes/lane-b.md:180-253`.
  - The founder's adoption of the audit, with the 19 freeze exceptions: `/home/user/ops/HANDOFF.md:336-340`.
  - The freezes: `docs/product/reconciliation-001.md:440-486`.
  - The #42 file list: `/home/user/ops/designs/lane-b-release-content-checks/pr42-files.txt`.
  - The five scout maps in `/home/user/ops/designs/lane-b-release-content-checks/scout-{pipeline,engine,missing,alarms,tests}.md`.
    Where this design departs from a scout, section 10.3 says so.
  - Code read for this design: `apps/worker/src/price/{execute,keyed-release,release,impact,create}.ts`,
    `apps/worker/src/monitor/{plan,job}.ts`, `apps/worker/src/triage/execute.ts`, `packages/pricing/src/{engine,trace}.ts`
    (read only), `packages/triage/src/actionable.ts`, `apps/worker/src/report/html.ts`,
    `apps/web/src/components/pricing/display.tsx`, `apps/web/src/lib/routes/{rule-releases,releases}.ts`,
    `apps/web/src/lib/coverage/in-effect.ts`, `packages/rules/src/{import,schema}.ts`, `tools/verify-content/check.ts`,
    `tools/release/{assemble,impact,synthetic,scale}.ts`, `tools/screening-capacity/{containers,limits,load,watched-paths.txt}`,
    `infra/lib/{jobs,environments}.ts`, `infra/lib/constructs/{monitoring,compute}.ts` (read only),
    `content/sources/README.md`, `packages/db/src/screening-queue.db.test.ts:687-725` (the plan-test precedent).

## 2. Scope per item

Each item: the audit's best option, then what this PR builds, what splits into the later PR (and the #42 file that
forces it), and what stays with Lane A. Where the audit's option is bettered, the reason is given.

### 2.1 #7: missing Medicare content silently prices without its limits

**The audit's best option (combined-report.md:258):** compute outside the engine the dates each silently-read content
is loaded for (per-code MPPR, general MPPR, MUE); refuse a month, with a fixed "waiting on content" code named by type
and quarter, only when one of its lines turns the reduction or the coding edits on and its date is outside that
content's span; a commercial fixed-fee month still prices; show "waiting on the <quarter> Medicare content" with the
dollars; plan the month again when a covering release is in force; triage holds a priced line whose trace read content
outside its span; Coverage words a fee-schedule gap as "PaidWhole has not loaded the <year> fee schedule"; one content
alert per run instead of an engine-error page; fix the README; a synthetic release whose MPPR and MUE windows end a
quarter early proves each case; the screening refuses out-of-span bands.

**This PR builds:**
1. **The run refusal.** At execution, from the engine's own traces, never from the flags alone. A line "read" a content
   on a date when its trace shows the read (section 5.6). If any line of the run read a content on a date outside that
   content's span, the run fails with no line kept.
   - **Bettered:** the code names the families exactly: `waiting_on_content_mue`, `waiting_on_content_mppr` or
     `waiting_on_content_mppr_mue`. The scouts' single code would have to guess the families from the spans afterwards,
     and could name a family no line needed. To know the exact set, the run keeps pricing to its end after the first
     gap. It stops writing lines at that point, and the transaction rolls back. The quarter is worked out exactly when
     read, from the run's period and its release's spans (both immutable). So nothing new is stored, and no column is
     needed.
2. **The monitor** waits on such a month without a daily loop. It plans the month again when a release in force covers
   more of it for the named families.
   - **Bettered (an improvement inside scope):** a newer release that covers no more of the month for those families
     does not start a doomed run.
3. **Coverage:** a "Months waiting on Medicare content" card with lines and billed dollars, the quarter and the
   families. Also one sentence per fee-schedule period not loaded: "PaidWhole has not loaded the <2026-Q4> Medicare
   fee schedule yet" for terms priced on the service date (`year_basis` CURRENT, judged by the quarter of each line's
   date, since #30 makes `pfs_rvu` quarterly), and "the <2026> Medicare fee schedule" for terms locked to a year. The
   sentence is shared with #59's banner (one computation, section 5.9).
   - The remedy table and `docs/product/unpriced-reasons.md` stay byte-identical.
4. **Triage holds** a priced line whose trace read content outside its release's span. The new not-actionable reason
   is `CONTENT_NOT_LOADED`, in code. The audit report shows it.
5. **One content alert per run:** a fixed log line with `error_code: 'CONTENT_NOT_LOADED'` and a line count, logged
   once by every run that met content PaidWhole has not loaded: a run refused `waiting_on_content_*` (the lines that
   read MPPR or MUE outside its spans), and a complete run with lines stopped by other content not loaded for their
   dates (section 5.6.5). The monitor's `WAITING_ON_CONTENT` line is a second, per-plan signal.
   - **Bettered (no alerting gap):** the engine-error page stays as it is in this PR. A content gap that pages through
     `PRICING_ENGINE_ERROR` today keeps paging until the content alert has its own alarm. That alarm needs
     `infra/lib/constructs/monitoring.ts`, a #42 file. Dropping the page now would leave content gaps with no alarm at
     all.
6. **The README fix:** one rewrite shared with #30 (section 4.4).
7. **Fixture release 900007:** release 900001 with per-code MPPR and MUE ending 2026-09-30.
8. **The screening's out-of-span refusal is already built** (PR 6b-2, #36: `apps/web/src/lib/screening/parse.ts:228-233`,
   `routes.ts`, `submit_screening()`; ADR 0064:300-308). Nothing is built for it here, and `apps/web/src/lib/screening/*`
   is #42's.

**Later PR (after #42 merges):**
- The content alerts' metric filters and alarms: `CONTENT_NOT_LOADED` (refused and complete runs alike) and the
  monitor's `WAITING_ON_CONTENT`. Then content-gap lines leave the engine-error page.
  - Files: `infra/lib/constructs/monitoring.ts`, `infra/test/monitoring.test.ts` (#42), plus `apps/worker/src/price/execute.ts`.
- The monthly digest line "N months wait on Medicare content" (`apps/worker/src/digest/job.ts`, #42).
- The Pricing settings list of waiting months (`apps/web/src/lib/routes/settings.ts`, #42).

**Lane A:** nothing is needed. These would be DDL and are **not** wanted:
- a mirror of the refusal in `pricing_run_rules()`: the refusal depends on the engine's trace, which the database
  cannot see at creation;
- `pfs_rvu` in `rule_release_content_span()`: an app-role SELECT does it;
- a cause in the `pricing_check` CHECK;
- a stored per-run gap column.

### 2.2 #30: quarterly content updates can drop a quarter, or keep old values all year

**The audit's best option (:467):** quarterly types are imported with the file's own quarter, cross-checked against what
the file declares, and windowed to exactly that quarter. The checker and the assembler refuse a release that stops
covering any code and date the previous release covered, except dates older than a stated look-back (listed
automatically) or a signed coverage-withdrawn note with its reason. They also refuse gaps inside a type. The README
keeps every MUE and fee-schedule quarter and replaces only files that carry their own dates. Synthetic releases test
each refusal.

**This PR builds all of it:**
- **R1 (importer):** the quarterly types are `pfs_rvu`, `pfs_gpci`, `ncci_mue`, `locality_map` and
  `locality_map_plus_four`. An import of one of them is refused unless its window lies inside the one CMS quarter the
  file states (both ends in that quarter, never open). A whole quarter is the usual window; a shorter one inside it
  is how CMS's mid-quarter corrections are loaded (the repository's own scale shape models them,
  `packages/synth/src/release/scale.ts:62-64`, `:478-480`). The no-gap rule (R4) and the existing overlap refusal
  then cover each quarter of the content once, with no hole.
  - Decided: GPCI is quarterly, because it ships in every quarterly RVU zip (`content/sources/README.md:61`).
  - Every type whose file has no dates of its own (the five above and `mppr_rate`) also refuses an open window. The
    per-code MPPR list's window lies inside one calendar year.
- **R2 (importer and parsers):** the window is cross-checked against the quarter the file states:
  - the ZIP files' YYYYQ fields, in the ZIP5 parser, where the ZIP9 parser already checks it;
  - for PPRRVU, GPCI and MUE, the quarter token or effective date in the title lines, the file name, or the last
    path segment of the required `--url` (the download address, `import.ts:168-169`: for GPCI, the RVU zip's own
    name, so the real `GPCI2026.csv` needs no renaming);
  - failing closed when no quarter can be read.
- **R2 (checker):** for real sets only (fixtures are exempt, as `plusFourGaps` already is), and whatever the record's
  source method: a record of a quarterly type has a window inside one CMS quarter, and a ZIP record's quoted lines
  state that quarter; a per-code MPPR record's window has an end inside its start's calendar year; quarterly and
  per-code MPPR records are never hand-typed; and the records of one source file share one window. So no single
  record can widen a content's span (the #7 refusal's input) beyond the quarter or year its file states.
- **R3 (checker and assembler):** the coverage regression against the previous release, with:
  - a six-year look-back, anchored on the release's recorded prepared date;
  - entries listed automatically;
  - a carve-out for coverage closed by the source's own dates (PTP deletions, code-list stop dates);
  - withdrawals signed by two named people.

  It is recorded in a new `COVERAGE.md` in every prepared release, sealed by the manifest.
- **R4 (checker and assembler):** no gap inside a content (section 5.4).
- **R5 (memory):** the check holds a compact coverage map of the previous release, never its records beside the new
  ones.
  - **Bettered (an improvement inside scope):** `COVERAGE.md` also records each content's loaded windows. #59's
    workflow then reads a few lines instead of a whole release, which serves #31's memory aim.

**Later PR:** nothing.

**Lane A:**
- Making "previous release" skip a release withdrawn in the database (the scouts' Q5). It is not recommended: files
  cannot see withdrawals, and a withdrawn release's coverage is still the right baseline, since its successor must
  cover what it did. If ever wanted, it goes with #8's load and rollback path.
- The load-release skill's step 3 rewording is #8's (combined-report.md:270). Not touched here.

### 2.3 #31: real-size rule releases will not fit in memory

**The audit's best option (:476):**
- Each run fetches only the keys its lines can look up, through the existing index, and the reader fails loudly on a
  lookup it did not fetch.
- Triage and reports load only their two types.
- The release-impact check moves to the worker (that is #8's).
- The screening caches one copy per release (done in PR 6b).
- An explicit heap limit.
- A weekly real-size test under production limits: a price job, triage, a report and five 50,000-row screenings.

**This PR builds:**
- **The keyed read for the price job:** per batch, with a per-run cache of the keys already fetched. The cache is
  bounded by the run's distinct keys (a few MB), not by the release.
  - **Bettered:** the scout's plain per-batch fetch would probe the same codes and pairs again in every batch. The cache
    fetches each key once a run, and the keys still come from the very claims priced.
- **Fail loudly:** a lookup outside the fetch fails the run as `release_read_outside_fetch` before its batch is stored,
  with an operator log line.
- **The same reader for the release-impact check and the dry run.** Both releases are read per batch by the batch's
  keys.
- **Triage and the audit report** read only `mppr_rate` and `conversion_factor`, through a typed reader that throws on
  any other type.
- **`apps/worker/src/price/diff.ts`** joins `rule_record` on its identity columns, not on `sha256`, which no index covers
  (an improvement inside scope).
- **The heap limit constants** in a new `infra/lib/heap.ts` (not a #42 file). The weekly test runs under them now.
- **The weekly real-size test:** a new `tools/release-capacity/` harness and `.github/workflows/release-capacity.yml`.
  It runs a price job, triage and an audit report of a generated large practice under the quarterly scale release
  900110, in the worker image at the worker task's limits. 900110 is release 900100's production shape with #30's
  windows: every quarterly type per CMS quarter, kept for seven years (the six-year look-back plus the current year),
  about 4.2 million records against 900100's about 2.25 million (5.10). The price job runs while another practice's audit
  report prints and four 835 parses run, as one worker runs every job type's loop at once
  (`apps/worker/src/worker.ts:225`; `PARSE_CONCURRENCY` 4, `apps/worker/src/jobs/registry.ts:147`).
  - The five 50,000-row screenings are screening-capacity's weekly S1 to S5. They run under release 900100 at the
    screening task's limits (`.github/workflows/screening-capacity.yml:22-26`). The screenings run in their own task,
    so running them again in the worker's harness would measure nothing new. ADR 0071 records this.

**Later PR (after #42 merges):**
- Wire the heap flags into the task commands: `infra/lib/constructs/compute.ts` and `infra/test/compute.test.ts` (#42).
  It sets the worker's and the platform's command flags, and the web's.
- Move screening-capacity's S1 to S5 onto the quarterly scale release 900110, so the screenings are measured on the
  release shape #30 produces: `tools/screening-capacity/run.ts` (#42) builds it with `--shape quarterly`. Its shared
  types grow only by GPCI's quarters (about 3,000 records), so the change is a measurement, not an expected regression.

**Lane A:**
- Moving the web's impact check into the worker, with its stored counts, is #8.
- Proposal (not built): stored release counts for `apps/web/src/lib/releases/queries.ts:40` and `:99-107`, with #8's
  table, and with them the per-content windows of 5.9 (stored at load, so no web request aggregates a release). The
  weekly test measures today's aggregate on 900110 meanwhile (5.10).

### 2.4 #59: nobody is told when CMS publishes or when the loaded content runs out

**The audit's best option (:727):**
- A reviewed content calendar per record type.
- A daily platform job that alarms 45 and 14 days before the loaded fee schedule ends, and when an open-ended type is
  older than its expected publication.
- A scheduled GitHub workflow with no credentials that opens an issue with the exact import commands when a due date
  passes with no draft, or when a source page's list of files changes.
- The console shows "Content due". Customers see each family's loaded-through date, and a banner when lines wait on
  next year's schedule.
- A runbook states the target time to load.

**This PR builds:**
- **The calendar:** a typed module, `packages/rules/src/calendar.ts`, with its Zod schema and the pure evaluation
  `contentDue()`. It is exported as a new `@tp/rules/calendar` subpath, so the watched closure does not change.
- **The CLI** `tools/content-calendar/index.ts`.
- **The workflow** `.github/workflows/content-calendar.yml`: a read-only `check` job and a `notify` job with
  `issues: write` and no checkout.
- **The console's "Content due" section** on the existing Rule releases page.
- **The customer's loaded-through dates** on the Releases page, and the fee-schedule banner on Coverage (shared with
  #7).
- **The runbook** `docs/runbooks/content-updates.md`.
- **Bettered (inside scope):**
  - The calendar alarms on itself: an entry never reviewed, or reviewed more than 13 months ago, is a finding.
  - A source page whose files were never recorded is one finding with the list seen, not a silent pass.
  - A stage `ended` follows the 45-day and 14-day stages, so January's wall does not go quiet after day 0.

**Later PR (after #42 merges, and after Lane A's function):**
- The daily `content_due` platform job, with its schedule, handler and log lines: `apps/worker/src/jobs/platform.ts`,
  `platform.test.ts` and `apps/worker/src/worker.test.ts` (#42).
- Its alarm: `infra/lib/constructs/monitoring.ts` and `infra/test/monitoring.test.ts` (#42), and a new
  `infra/lib/content.ts`.
- The regeneration of `tools/screening-capacity/watched-paths.txt` (#42), because `platform.ts` will import
  `@tp/rules/calendar`.
- No shell-wide banner: the Coverage banner and the console section are enough. Decided, not deferred.

**Lane A (handed over, not built):**
- One migration adding `operator_content_coverage()`: SECURITY DEFINER, `search_path` pinned, EXECUTE granted to
  `tp_operator` only.
- It returns the release in force and, per content (the record types, with `mppr_rate` split by `key ? 'hcpcs'`):
  - the date multirange of its windows;
  - the newest `effective_from`;
  - the newest `source->>'retrieved'`.

  No key, value or quote.
- Why it is needed: platform jobs run as `tp_operator` (ADR 0019:59-64), which has no grant on any rule object
  (`20261015120000_rule_content.sql:88` grants `tp_app` only). It is preferred to a GRANT on `rule_record`, which is
  DDL on a rule table (`reconciliation-001.md:462`) and would change `tools/engine-freeze/rule-tables.catalog.json`.
- **Correction to the record:** #59's "Database: no" (combined-report.md:728; LANES.md:131) holds for this PR and does
  not hold for the daily job. LANES.md "Handed to Lane A" gets this entry (section 8).

## 3. No migration

Confirmed part by part. No file under `packages/db/migrations` changes, and `docs/product/domain-model.md` is not
regenerated.

| Part | Why it is not DDL |
|---|---|
| Run failure codes `waiting_on_content_mue`, `waiting_on_content_mppr`, `waiting_on_content_mppr_mue`, `release_read_outside_fetch` | `pricing_run.failure_code` has only the shape CHECK `^[a-z][a-z0-9_]{0,63}$` and "failed iff a code is set" (`20261018090000_pricing_runs.sql:44,51`). No trigger or later migration lists the codes. The closed list is the TypeScript union `FailureCode` (`apps/worker/src/price/execute.ts:43`) |
| Triage reason `CONTENT_NOT_LOADED` | `NOT_ACTIONABLE_REASONS` is a code list (`packages/triage/src/actionable.ts:50-64`). No CHECK names its values. `pricing_check`'s CHECK is a different list and is not touched |
| Content spans | `rule_release_content_span()` exists (`20261105090000:1011-1044`, granted to `tp_app`). It is called, never changed |
| Per-content windows (web, worker) | A `tp_app` SELECT on `rule_record` (`20261015120000_rule_content.sql:88`) over `rule_record_by_type` (:37) |
| Keyed fetch | A query over the existing `rule_record_identity` (:36). No index is added. diff.ts's join moves to the identity columns, so no `sha256` index is needed |
| Shared-type read | A `WITH RECURSIVE` loose scan as a query, not a function |
| Importer, checker, assembler | Files only. Refusal messages are code |
| `COVERAGE.md`, `COVERAGE-WITHDRAWN.md` | Files. `.md` is ignored by `readRelease`, the loader and `publish-content.sh` |
| Calendar, workflow, console, customer pages | Code, data and a workflow. Reads use `tp_app` grants |
| Heap constants, weekly harness | Infrastructure constants and a test tool |

**DDL that would be needed is handed to Lane A, and only for the later PR:** `operator_content_coverage()` (section 2.4).

**Checks that prove it:** `pnpm db:domain-model --check --strict --require-approval` passes on a freshly migrated
database; `tools/engine-freeze/check.ts` finds no migration touching a rule table; `rule-tables.db.test.ts` passes
unchanged.

## 4. Freezes and exceptions

### 4.1 Engine freeze
- No file under `packages/pricing` changes, tests included. Every engine behaviour is read through its trace.
- `tools/engine-freeze/exception.json` is not edited. It names PR 36 and is stale (`check.ts:34-40`).
- The differential test prices the head engine on the head `packages/rules`. This PR changes `packages/rules/src` only by:
  - added exports (`schema.ts`, `records.ts`), which the engine never calls;
  - added refusals in the ZIP5 parser, which the engine never runs;
  - new review-question text (`pprrvu.ts`, `ncci.ts`).

  So every price is identical.
- #31's keyed reader returns, for every key it serves, exactly the records the whole-release index returns (section
  5.7, the oracle test).

### 4.2 Unpriced reasons, golden fixtures, fixture releases
- `docs/product/unpriced-reasons.md`, `UNPRICED_REASONS`, and both remedy tables are unchanged:
  `apps/web/src/lib/contracts/remedies.ts` and `apps/worker/src/report/remedies.ts`.
- The new words are a run failure text, a triage reason and an added Coverage sentence, never a remedy.
- `fixtures/golden/**` is unchanged.
- `fixtures/synthetic/rules/release-synth-900001` to `900006` are unchanged.
- `release-synth-900007` is new and is generated by `tools/release/synthetic.ts`.
  - It is not in the engine freeze's frozen regex (`check.ts:58` covers 900001 to 900005) and no golden claim pins it.
  - It is founder-owned by CODEOWNERS (`/fixtures/synthetic/rules/release-*/`), which records review and blocks
    nothing before the ruleset on `main`.
- The new checker rules leave 900001-900006 passing:
  - the quarter rule exempts synthetic sets;
  - the gap rule finds no gap in any of them, as probed 2026-10-26 with
    `/tmp/claude-0/-home-user-PhysicalTherapy/6dcacc47-f55b-5ed0-ab9e-d8b495c8bdd9/scratchpad/probe/gaps.mjs`
    (every content is one run);
  - the coverage rule runs only on numbered sets.

### 4.3 The content pipeline: #30's exception, exactly

The check (`reconciliation-001.md:461`): "`tools/verify-content`, `.claude/hooks/protect-content.sh` and
`.github/workflows/publish-content.yml` are unchanged."

The grant: the founder's adoption of the combined audit, 2026-10-20 ~15:10 UTC ("The 19 freeze exceptions are granted";
`HANDOFF.md:338`). #30's "What it changes" names it: "Content checker and importer: added refusals only, which
touches the frozen content pipeline. Freeze exception: yes" (combined-report.md:469).

What this PR changes in the frozen pipeline:

| File | Change | Why it is an added refusal only |
|---|---|---|
| `tools/verify-content/check.ts` | New problems in `checkRecord` (R2), in `checkContentSet` (R4 gaps, the `COVERAGE.md` checks for numbered release sets, and the `COVERAGE-WITHDRAWN.md` checks on the drafts), and a read of the previous release's coverage | Each new branch only adds a problem string. No existing problem is removed or reworded, no record is changed, and nothing that is refused today passes. The module comment's list gains the new refusals. The refusals of hand-typed quarterly and per-code MPPR records, and of one source file's records with different windows (C15, C16), are #30's: they stop a record from bypassing the file's stated quarter or year, which #30's "windowed to exactly that quarter, cross-checked against what the file declares" requires. The real drafts at 6ddd587 hold none (their only `mppr_rate` record is the hand-typed general rate, which these rules do not touch) |
| `tools/verify-content/check.test.ts` | Tests of the new refusals; the existing tests unchanged | Tests of the added refusals |
| `tools/verify-content/index.ts` | **Unchanged.** No new flag | |
| `packages/rules/src/import.ts` | R1 and R2 refusals before anything is written (I1 to I8, 5.2.1) | It throws `RuleImportError` on imports accepted today. Every import it still accepts writes the same files as today |
| `packages/rules/src/import.test.ts` | Tests of the refusals. Existing tests whose inputs a new refusal now refuses get a quarter window, with their assertions unchanged | Tests of the added refusals |
| `packages/rules/src/parsers/locality.ts` | Refuse a ZIP5 line with no YYYYQ at 76-80, or one other than the window start's quarter | Added refusal. The synthetic ZIP5 files carry the quarter of their window start (`20261`, and `${year}1` in `packages/synth/src/release/scale.ts:351` with a 1 January start at `:484`), so 900001-900006 and 900100 still render; 900110's quarterly ZIP5 files state each quarter's YYYYQ (5.10) |
| `packages/rules/src/parsers/{pprrvu,ncci}.ts` | Review-question wording only: `pprrvu.ts:155` and the MUE question at `ncci.ts:174` (exact text in section 5.2.4). The PTP question at `ncci.ts:109` is right for PTP and stays | README-class procedure text, which #7 allows. Review questions go only to `<file>.review.md`: `buildParsedRecords` writes `questions: []` into every record (`packages/rules/src/build.ts:55`), so no record or fixture byte changes |

The rest of the pipeline is unchanged:
- `.claude/hooks/protect-content.sh`: **unchanged.** It guards `content/releases/*` and migrations (`:71-77`), which
  this PR does not write. The hook refuses edit tools on itself (`:59-61`) anyway.
- `.github/workflows/publish-content.yml`: **unchanged, by this PR.**
  - The new refusals are reached through its existing `pnpm verify-content "${dir%/}"` step (`:32-38`). The previous
    release is found on disk in its full checkout (`fetch-depth: 0`, `:25-26`).
  - `COVERAGE.md` is a `.md`, which `tools/publish-content.sh` never reads (`find -name '*.json'`, `:37`).
  - F4 is held without argument. ci-deps alone changes the file, and only its pins.
- `tools/publish-content.sh`, `tools/verify-release-manifest.sh` and `tools/check-releases-immutable.sh`: unchanged.
- `tools/release/assemble.ts` and `impact.ts`: changed (R3, R4, `COVERAGE.md`), but they are not frozen.
  `reconciliation-001.md:461` names three paths only, and #30 says "the checker and the assembler refuse".
- `.claude/skills/load-release/SKILL.md`: unchanged (#8's step 3 rewording is Lane A's).

### 4.4 The README text #7 allows (procedure text only)

`content/sources/README.md:79-87`, and the release-1 table rows 1, 2, 3 and 7 (`:60-62`, `:66`), are rewritten
to:
- **Quarterly files.** RVU (PPRRVU), GPCI, ZIP5, ZIP9 and MUE carry no dates of their own. Import each for the CMS
  quarter the file states:
  - pass that quarter's `--effective-from <first day> --effective-to <last day>`, for example
    `--effective-from 2026-10-01 --effective-to 2026-12-31` for 2026 Q4;
  - the importer refuses a window that leaves that quarter, an open one, or a file whose stated quarter differs;
  - `--url` is the address the file was downloaded from: for a file taken out of a zip (PPRRVU, GPCI), the zip's own
    address, whose name carries CMS's quarter token (`RVU26D`); keep the token (`RVU26D`, `_OCT`, `2026Q4`) in the
    file name too if you rename it.
- **A correction inside a quarter.** When CMS reissues a quarter's file with values that take effect on a day inside
  the quarter, remove that quarter's draft, import the original file for the quarter's first day to the day before
  the correction, and import the corrected file from the correction's day to the quarter's last day. Both are
  verified again. When the correction applies from the quarter's first day, the corrected file replaces the original
  for the whole quarter. Either way the quarter stays covered once, with no gap, and its coverage never shrinks.
- **Keep every quarter.** Never re-import or delete a verified quarter. Each quarter's records stay, so the next
  release covers every date the last one did. The checker and the assembler refuse a release that stops covering a
  code and date its previous release covered (section "Coverage" below).
- **The MPPR list** carries no dates either. It takes the calendar year unless `--effective-from` and `--effective-to`
  say otherwise, never leaves that year, and is never open.
- **Imported, never typed.** Quarterly files and the MPPR list are imported, never typed by hand with
  `/new-rule-record`: the checker refuses a hand-typed record of those types. The general practice-expense reduction
  stays hand-typed.
- **Files that carry their own dates** (NCCI PTP, the X12 code lists, the conversion-factor CSV): each quarter's or
  export's file is complete, so remove the previous one's draft before importing the next. Their deletions and stop
  dates close coverage, and the check lists those closings itself.
- **A new section "Coverage":**
  - what `COVERAGE.md` records;
  - the six-year look-back;
  - how to withdraw coverage on purpose with `content/drafts/COVERAGE-WITHDRAWN.md`: two named people, one reason, the
    exact ranges the assembler printed. The assembler copies the note's entries into the release's `COVERAGE.md`
    and `RELEASE.md`, then removes the note from the drafts.
- Rows 1, 2, 3 and 7 of the release-1 table give quarter-exact windows. Their examples use 2026 Q4, with the sentence
  "use the quarter current when you import, and every quarter of 2026 already published". Row 2's command becomes
  `pnpm rules:import --type pfs_gpci --year 2026 --file GPCI2026.csv --effective-from 2026-10-01 --effective-to 2026-12-31 --url <the RVU26D zip's download address> [--gpci-floor with|without]`.
  Every row's `--url <page>` reads `--url <download address>`, as the importer's own message says
  (`import.ts:168-169`).

Also changed, as procedure text:
- `content/drafts/README.md:12-15`: the pipeline's step 2 lists the new refusals and the drafts note file.
- `content/outgoing/README.md:77-82`: a prepared release's layout gains `COVERAGE.md`.

The #7 and #30 wording differ: #7 says "keep every MUE quarter and close its window", and #30 says "windowed to exactly
that quarter". With R1, nothing is left to close, so the text follows #30.

### 4.5 Text for reconciliation-001 and ADR 0071

**reconciliation-001.md, under the content-pipeline bullet at `:461`, as an indented bullet in the PR 5 trigger's style:**

> - *Granted by the founder, Tyler Williams, on October 20, 2026, with his adoption of the combined audit (its 19 freeze
>   exceptions; `HANDOFF.md`): an exception to this check for audit #30* ("Content checker and importer: added refusals
>   only"). The release content checks pull request (`co-001/release-content-checks`; `docs/adr/0071`) adds refusals to
>   `tools/verify-content/check.ts`:
>   - in real content only: a quarterly record type's window that leaves one CMS quarter, a ZIP record whose quoted
>     lines state another quarter, a per-code MPPR window that is open or leaves its calendar year, a hand-typed
>     quarterly or per-code MPPR record, and records of one source file with different windows;
>   - a gap inside a content;
>   - a numbered release with no `COVERAGE.md`, or one whose contents or coverage losses do not match its records and
>     its previous release's;
>   - a stale or malformed `content/drafts/COVERAGE-WITHDRAWN.md`.
>
>   It adds refusals to `packages/rules/src/import.ts` and the ZIP5 parser: an undated file's open window; a quarterly
>   file's window that leaves its stated quarter; a file that states no quarter, or two; a stated effective date the
>   window does not start on; a per-code MPPR window that leaves its calendar year. Every set or import that passed before
>   and still passes yields the same records. Nothing that was refused now passes. No existing problem changes its
>   words. `.claude/hooks/protect-content.sh` and `.github/workflows/publish-content.yml` are unchanged by it (the
>   latter changes only under the founder's ruling F4 of 2026-10-25, its pins). `pnpm verify-content` passes.
>   Recorded in `docs/adr/0071`.

**reconciliation-001.md, the proposed-PR list, before item 7 (the CI series' paragraph is the precedent, `:141`):**

> **Release content checks, before PR 7** (*added <merge date>*; the combined audit's items #7, #30, #31 and #59, each
> placed in the release-operations PR before PR 7 and adopted by the founder with the audit on 2026-10-20; Lane B, LANES
> queue item 14; `docs/adr/0071`). One pull request into `claude/build-platform` with no migration: the quarterly
> imports and the release coverage checks (#30), months refused while Medicare content is not loaded (#7), runs that
> read only the keys they price (#31), and the content calendar with its workflow and screens (#59). Test matrix RCC-01
> to RCC-08. A later pull request after #42 wires the heap flags, the content alarms and the daily content job, the
> last after Lane A's `operator_content_coverage()`. #8, the production load path and its impact table, is Lane A's.

**ADR 0071** (`docs/adr/0071-check-a-releases-coverage-against-the-last-refuse-months-the-content-does-not-cover-read-only-the-keys-a-run-prices-and-keep-a-content-calendar.md`):
- Status: Accepted. Date: the merge date. Deciders: the founder (the adoption of 2026-10-20), and the co-founder
  (delegation of 2026-10-25) for the choices section 10 reports. PRD sections 9, 11, 12, 16 and 18.
- **Context:** the four audit items, quoted by number.
- **Decision**, one part per item, with these paragraphs, among others:
  - The exception, in the words of section 4.3.
  - The coverage definition and its three allowances; the look-back of six years, and why; `COVERAGE.md`'s format.
  - The two-person withdrawal. The names are compared trimmed and case-folded, which catches a slip and nothing
    more: one person can type two names. The real second signature is the founder's code-owner review of the pull
    request that adds `content/drafts/COVERAGE-WITHDRAWN.md` (`.github/CODEOWNERS` `*`), recorded as such.
  - The quarter rule: a window inside the stated quarter, so CMS's mid-quarter corrections load, and why that still
    covers each quarter once.
  - The failure codes, and why they name families exactly.
  - The precedence of a run's stops (a read outside the fetch, then the location, then content), which holds over
    the whole run because a stop is recorded and the run priced to its end before any is raised.
  - Why the engine-error page stays until the content alarm exists.
  - The keyed reader's contract.
  - Why the weekly test leaves the screenings to screening-capacity.
  - Why issues on a public repository hold only public references.
  - The split into the later PR, and Lane A's function.
- **Amends ADR 0008:92** ("listing the exclusions in RELEASE.md and the dry-run's removed counts make a missing record
  type visible instead"): a release's coverage is now refused when it shrinks, beyond the allowances. Visibility alone
  is not enough.
- **Cites ADR 0064:300-308** for `rule_release_content_span()`, and does not restate it.
- **Alternatives** (a table):
  - a single failure code;
  - no cache in the keyed read;
  - a `.json` coverage file;
  - a hash on withdrawn entries;
  - a look-back from "today";
  - a GRANT for the operator;
  - the platform job now through `fields.ts`.

## 5. Interfaces and algorithms

Conventions for every part:
- Dates are ISO calendar dates (`YYYY-MM-DD`), compared as strings and stepped with `Date.UTC` integer days, never
  local time.
- A window is inclusive, with `to: null` meaning open.
- A range from `parseDateMultirange` is half-open `[from, until)`.
- Every "refuse" lists at most 20 items, then "and N more", as `assemble.ts:300` does.

### 5.0 The placement rule (the #42 watched list)

`tools/screening-capacity/watched-paths.txt` is a #42 file, held equal to the import closure of the images and the
harness by `watched.test.ts:18`. So:
- **No new non-test source file may be reachable from the closure's entry points** (`tools/screening-capacity/watched.ts:33-58`).
  - The closure reaches: the whole worker through `apps/worker/src/main.ts`; `packages/rules/src` but `import.ts` and
    `cli/import.ts`; `packages/triage/src`; `tools/release/{assemble,commands,impact,scale,synthetic}.ts`;
    `tools/verify-content/check.ts`; `tools/content-files.ts`; and the web's screening pages, layout and proxy.
  - New logic in those areas goes into files already on the list. Edits to listed files are allowed, and make the
    screening-capacity gate measure this PR.
- **New files are allowed where no entry point reaches them:**
  - `packages/rules/src/calendar.ts`, imported only through the new `@tp/rules/calendar` subpath, from the web's
    non-screening files and from tools;
  - `apps/web/src/lib/...` files outside `screening/`;
  - `tools/content-calendar/*` and `tools/release-capacity/*`;
  - `infra/lib/heap.ts`, imported only by `tools/release-capacity/*` and its own test in this PR, and by
    `infra/lib/constructs/compute.ts` in the later PR (a `WATCHED_FIXED` line, `watched.ts:62-82`, whose imports the
    closure does not follow). **Never import it from a file the closure reaches**, `tools/screening-capacity/*`
    included: `watchedPaths()` keeps only closure files no fixed line matches (`watched.ts:165`), and no fixed line
    matches `infra/lib/heap.ts`, so such an import would add a line to the #42 list (review finding B1);
  - every test file.
- **The proof:** `pnpm exec tsx tools/screening-capacity/watched.ts` (no `--write`) prints a list equal to the committed
  one, and `watched.test.ts` passes. Every builder runs it before handing over.

This is the only reason a helper lives in an existing file rather than its own module. Each choice below names its
file, and the file is a topical home: the release's own reader for the spans, the records module for window
arithmetic.

### 5.1 Shared pure helpers in `packages/rules`

`packages/rules/src/schema.ts` (added exports only):
```ts
/** Files with no dates of their own that change every CMS quarter: imported for a window inside one quarter (audit #30, ADR 0071). */
export const QUARTERLY_RECORD_TYPES = ['pfs_rvu', 'pfs_gpci', 'ncci_mue', 'locality_map', 'locality_map_plus_four'] as const satisfies readonly RuleRecordType[];
export type QuarterlyRecordType = (typeof QUARTERLY_RECORD_TYPES)[number];
/** Files with no dates of their own: the quarterly ones and the annual MPPR list. A window read from one is never open. */
export const UNDATED_RECORD_TYPES = [...QUARTERLY_RECORD_TYPES, 'mppr_rate'] as const satisfies readonly RuleRecordType[];
export interface CmsQuarter { readonly year: number; readonly quarter: 1 | 2 | 3 | 4 }
/** The quarter's first and last days. */
export function cmsQuarterWindow(q: CmsQuarter): { readonly from: string; readonly to: string };
/** The quarter when [from, to] is exactly one CMS quarter; null otherwise (an open window included). */
export function exactCmsQuarter(from: string, to: string | null): CmsQuarter | null;
/** The quarter holding both ends of [from, to] (a whole quarter, or a correction's part of one); null when open or across two quarters. */
export function windowQuarter(from: string, to: string | null): CmsQuarter | null;
/** Whether [from, to] has an end and lies inside from's calendar year (the per-code MPPR list's rule). */
export function insideOneYear(from: string, to: string | null): boolean;
/** The windows a quarterly import may take for a stated quarter: from on or after the quarter's first day (equal to `effective` when the file states a day), to on or before its last day, from <= to. */
export function quarterWindowProblem(stated: CmsQuarter, effective: string | null, from: string | undefined, to: string | null | undefined): 'missing' | 'outside' | 'not_effective_day' | null;
/** The quarter a date falls in. */
export function cmsQuarterOfDate(date: string): CmsQuarter;
/** "2026-Q4", the form the screening already shows (apps/worker/src/screening/format.ts). */
export function quarterLabel(q: CmsQuarter): string;
```

`packages/rules/src/records.ts` (added exports only; pure; it imports `zod` and `./schema` only):
```ts
export interface DateRange { readonly from: string; readonly to: string | null }   // inclusive; null: open
/**
 * A content: a record type, with mppr_rate split exactly as rule_release_content_span() splits it
 * (20261105090000:1031-1033): key ? 'hcpcs' is mppr_code, key ? 'component' is mppr_general; a key with neither
 * throws (the schema's strict keys allow neither, schema.ts:246-256).
 */
export const CONTENT_IDS = [/* RULE_RECORD_TYPES in their order, mppr_rate replaced in place by 'mppr_code', 'mppr_general' */] as const;
export type ContentId = (typeof CONTENT_IDS)[number];
export function contentOf(record: { readonly record_type: RuleRecordType; readonly key: Readonly<Record<string, unknown>> }): ContentId;
/** Sorted, with overlapping and adjacent ranges (to + 1 day = next from) merged. */
export function mergeRanges(ranges: readonly DateRange[]): DateRange[];
/** The days of `a` not in `b`, as merged ranges. */
export function subtractRanges(a: readonly DateRange[], b: readonly DateRange[]): DateRange[];
export function dayAfter(date: string): string;
export function dayBefore(date: string): string;
export interface ContentSummary { readonly content: ContentId; readonly records: number; readonly windows: readonly DateRange[]; readonly newest_from: string; readonly newest_retrieved: string }
/** Per content present, in CONTENT_IDS order: its record count, merged windows, newest start and newest source.retrieved. */
export function contentSummaries(records: Iterable<RuleRecord>): ContentSummary[];
/** The same, built a record at a time and holding no record (the CLI reads the drafts file by file, review m8). */
export class ContentSummaryBuilder { add(record: RuleRecord): void; summaries(): ContentSummary[] }
export interface ContentGap { readonly content: ContentId; readonly from: string; readonly to: string }
/** The holes inside each content's merged windows (between its first start and its last end), every content but locality_map_plus_four. */
export function contentGaps(records: readonly RuleRecord[]): ContentGap[];
```
Coverage maps (the R3 and R5 part):
```ts
/**
 * Per identity (recordIdentity(): record type and canonical key, records.ts:47-49), its coverage, encoded compactly:
 * merged ranges as "from..to" joined by ",", an open end as "from..". For the source-dated types, also the
 * effective_from of its open-ended record, if any, after "@" (at most one, since overlaps are refused).
 */
export type CoverageMap = ReadonlyMap<string, string>;
export function coverageMap(records: Iterable<RuleRecord>): CoverageMap;
/** The types whose window comes from the file's own dates (ncci.ts:81-89, x12-code-list.ts:56, conversion-factor.ts:56). */
export const SOURCE_DATED_TYPES = ['ncci_ptp', 'carc', 'rarc', 'claim_status_code', 'conversion_factor'] as const satisfies readonly RuleRecordType[];
export interface CoverageLoss { readonly record_type: RuleRecordType; readonly key: Readonly<Record<string, string>>; readonly from: string; readonly to: string | null }
export interface CoverageRegression { readonly beforeCutoff: CoverageLoss[]; readonly closedBySource: CoverageLoss[]; readonly unexplained: CoverageLoss[] }
export function coverageRegression(previous: CoverageMap, next: CoverageMap, nextRecords: Iterable<RuleRecord>, cutoff: string): CoverageRegression;
export const LOOK_BACK_YEARS = 6;
/** January 1 of the prepared date's year minus LOOK_BACK_YEARS. */
export function lookBackCutoff(preparedOn: string): string;
```

The regression algorithm (exact):
1. For each identity I in `previous`: `lost = subtractRanges(prev(I), next(I) ?? [])`. An identity missing from `next`
   loses all it had.
2. Split each lost range at `cutoff`:
   - the part ending before `cutoff` goes to `beforeCutoff`;
   - the part from `cutoff` on is classified next.
3. A remaining range `[f, null)` of a source-dated type is **closed by source** when both hold:
   - the previous map records an open-ended record of I starting at F;
   - `nextRecords` holds a record of I with `effective_from === F` and `effective_to === dayBefore(f)`.

   Otherwise the range is **unexplained**. Nothing else is ever closed by source: a quarterly or hand-typed type gets
   no carve-out.
4. Each list is sorted by record type, then canonical key, then `from`.

**Memory (R5):**
- `coverageMap` keeps one string per identity, never a record. Equal coverage strings are interned (one string per
  distinct value), so the cost is the keys: measured 2026-10-26 on Node 24, 2,000,000 PTP identities with canonical-JSON
  keys and interned values add 300 MiB of heap
  (`/tmp/claude-0/-home-user-PhysicalTherapy/6dcacc47-f55b-5ed0-ab9e-d8b495c8bdd9/scratchpad/probe/map.mjs`); without
  interning each value is its own string.
- The checker and the assembler build the previous release's map, drop its records, then work on the new set.
- A unit test builds a map of 2,000,000 synthetic PTP identities from a generator, so only one record is alive at a
  time. In a child `node --expose-gc` process, it asserts the map holds no record object and that the heap used after
  a full collection grew by at most 320 MiB (review m8).

`COVERAGE.md` (the file in every numbered release) and the drafts note: schemas in `records.ts`, exported.
```ts
const isoDate = /* the schema's isoDate */;
const signer = z.string().regex(/^[\x20-\x7E]{2,80}$/).refine((s) => s.trim() === s);           // a named person
const reason = z.string().regex(/^[\x20-\x7E]{8,500}$/);                                         // one printable line (loader.ts:182-183's rule)
const loss = z.strictObject({ record_type: z.enum(RULE_RECORD_TYPES), key: z.record(z.string(), z.string()), from: isoDate, to: isoDate.nullable() });
const sameName = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();
const withdrawn = loss.extend({ reason, withdrawn_by: signer, confirmed_by: signer, withdrawn_on: isoDate })
  .refine((entry) => !sameName(entry.withdrawn_by, entry.confirmed_by), { message: 'confirmed_by must be a person other than withdrawn_by', path: ['confirmed_by'] });
// A slip check only: the second signature of record is the founder's code-owner review of the note's pull request (ADR 0071).
export const releaseCoverageSchema = z.strictObject({
  format: z.literal('tp-release-coverage/1'),
  release: z.number().int().positive(),
  previous_release: z.number().int().positive().nullable(),
  prepared_on: isoDate,
  look_back_years: z.literal(LOOK_BACK_YEARS),
  cutoff: isoDate,
  contents: z.array(z.strictObject({ content: z.enum(CONTENT_IDS), records: z.number().int().positive(), windows: z.array(z.strictObject({ from: isoDate, to: isoDate.nullable() })).min(1), newest_from: isoDate, newest_retrieved: isoDate })),
  before_cutoff: z.array(loss),
  closed_by_source: z.array(loss),
  withdrawn: z.array(withdrawn),
});
export const coverageWithdrawnNoteSchema = z.strictObject({ format: z.literal('tp-coverage-withdrawn/1'), previous_release: z.number().int().positive(), withdrawn: z.array(withdrawn).min(1) });
export const COVERAGE_FILE = 'COVERAGE.md';
export const COVERAGE_WITHDRAWN_FILE = 'COVERAGE-WITHDRAWN.md';
/** The file's text: a heading, a short prose summary, then exactly one ```json block (two-space JSON, keys in schema order). */
export function renderCoverageFile(coverage: ReleaseCoverage): string;
/** The one ```json block of a .md file, parsed; problems as strings (none, or more than one block, is a problem). */
export function readJsonBlock(text: string): { value?: unknown; problems: string[] };
```

`COVERAGE.md`'s text (byte-exact, from `renderCoverageFile`):
```
# Coverage of release <n>

Prepared <prepared_on> by `pnpm release:assemble <n>`. The content checker recomputes everything in the block below
from this release's records and release <m>'s; never edit it by hand (content/sources/README.md, "Coverage").

- <k> contents, each with the dates it is loaded for.
- Against release <m>: <a> range(s) before the look-back's cutoff (<cutoff>), <b> closed by the source's own dates,
  <c> withdrawn by a signed note.

```json
{ ... }
```
```
With no previous release, the second bullet reads "- Release <n> is the first release: nothing to compare."

The drafts note `content/drafts/COVERAGE-WITHDRAWN.md` holds a heading, any prose, and one ```json block of
`coverageWithdrawnNoteSchema`.

### 5.2 #30 R1 and R2: the importer and the ZIP5 parser

#### 5.2.1 `packages/rules/src/import.ts`
```ts
/** What a quarterly file states (R2): its quarter, and the day it takes effect when it states one. Null when it states no quarter; throws RuleImportError when it states two. */
export interface StatedQuarter { readonly quarter: CmsQuarter; readonly effective: string | null }
export function statedQuarter(type: QuarterlyRecordType, source: { readonly fileName: string; readonly url: string; readonly text: string }): StatedQuarter | null;
```
- **ZIP5 and ZIP9:** the year and quarter (YYYYQ) at positions 76-80 of the first line that is not blank, read with
  `zipFileQuarter` (`parsers/locality-plus-four.ts:35`). The parsers check every other line (5.2.2 and today's ZIP9 check).
- **PPRRVU, GPCI and MUE:** every match in the first 5 lines of the text, in the file's base name, and in the last path
  segment of `--url` (percent-decoded, query and fragment dropped), case-insensitive. `--url` is required and is the
  address the file was downloaded from (`import.ts:168-169`). For a file taken out of a zip, it is the zip's address,
  whose name carries CMS's token (`rvu26d.zip`), so the real `GPCI2026.csv` (README row 2) imports without renaming,
  and the cross-check rests on CMS's own name, not only on the operator's. The URL is stored in the record's
  `source.url`, so a reviewer sees what the quarter was read from.

  | Pattern | Example | Quarter |
  |---|---|---|
  | `\bRVU(\d{2})([A-D])\b` | RVU26D | 20yy, A=1 .. D=4 |
  | `(?:PPRRVU\|GPCI)(\d{2})_(JAN\|APR\|JUL\|OCT)` | PPRRVU26_OCT | 20yy, JAN=1 .. OCT=4 |
  | `(20\d{2})[ _-]?Q([1-4])\b` | 2026Q4, 2026 Q4 | yyyy, n |
  | `\b(JAN\|APR\|JUL\|OCT)[ _-]?(20\d{2})\b` | OCT2026 | yyyy, month |
  | `\b(January\|April\|July\|October)\s+(20\d{2})\b` (title lines only) | October 2026 | yyyy, month |
  | `\bEff(?:ective)?\.?:?\s+(\d{1,2})[-/](\d{1,2})[-/](20\d{2})\b` | Eff 10-01-2026, Effective 10/01/2026 | the quarter holding that date; the date is `effective` |

  - All matches state the same quarter, and at most one effective date: that quarter (and that date).
  - Two different quarters, or two different effective dates: throw (I3 below).
  - No match: null.
  - An effective date that is not a real date (month 13, day 31 of a 30-day month) is a stated quarter of none: I3's
    message names it.
- These patterns are the contract until the first real download shows what CMS writes. The parser PR that follows the
  first download may add patterns. It may never remove the refusal.

`importRuleFile` gains these refusals. Each one comes before anything is stored or written. The order is fixed:

| Code (test name) | When | Message (`RuleImportError`, exact) |
|---|---|---|
| I1 `undated_open` | `UNDATED_RECORD_TYPES` includes the type and `effectiveTo === null` (`--effective-to open`) | `` `${type} files carry no dates of their own, so their window needs an end: give --effective-to (an open window would hide the day the content runs out)` `` |
| I2 `quarter_unstated` | quarterly type, `statedQuarter` is null | `` `${type} is a quarterly file, and ${name} states no quarter that can be read: keep CMS's quarter token in the file name (such as RVU26D, PPRRVU26_OCT, 2026Q4 or OCT2026), or, if the file states its quarter another way, fix the parser in a pull request (content/sources/README.md)` `` |
| I3 `quarter_two_stated` | `statedQuarter` throws | `` `${name} states two quarters (${a} and ${b}); import each quarter's file on its own` `` |
| I4 `quarter_window_missing` | quarterly type and `effectiveFrom` or `effectiveTo` not given | `` `${type} is a quarterly file for ${label}: give its window inside that quarter, usually the whole quarter, --effective-from ${from} --effective-to ${to}` `` |
| I5 `quarter_window_outside` | quarterly type and the window given does not lie inside `cmsQuarterWindow(stated)` (from before the quarter's first day, to after its last day, or from after to) | `` `${type} is a quarterly file for ${label}, so its window lies inside ${from} to ${to} (the whole quarter, or a correction's part of it); the window given is ${givenFrom} to ${givenTo ?? 'open'}` `` |
| I6 `quarter_year_mismatch` | quarterly type and `--year` differs from the stated quarter's year | `` `--year ${year} is not the year of the quarter ${name} states (${label})` `` |
| I7 `quarter_effective_mismatch` | quarterly type, the file states an effective day, and `effectiveFrom` is not that day | `` `${name} takes effect on ${effective}, so its window starts that day: --effective-from ${effective} (the window given starts ${givenFrom})` `` |
| I8 `mppr_window_year` | `mppr_rate` and the window does not lie inside its start's calendar year (`insideOneYear`) | `` `the MPPR list is a calendar year's file, so its window ends inside ${year of from}: the window given is ${givenFrom} to ${givenTo}` `` |

Notes:
- `name` is the stored source name (`first.name`).
- `label` is `quarterLabel(stated.quarter)`. `from` and `to` are the stated quarter's first and last days.
- I5 accepts a window shorter than the quarter, so a CMS correction inside a quarter loads as two windows (README,
  "A correction inside a quarter"). The checker's no-gap rule (R4) and its overlap refusal (`findOverlaps`) are what
  keep each loaded quarter covered once and whole.
- The window rules are one exported function, `quarterWindowProblem` (5.1), which the checker and the calendar's
  command test call too.
- The text is read as the parser reads it (`decodeSourceText`). The read step of `readAndParse` may be split so the
  check runs between reading and parsing. No accepted import changes its output.
- `ImportRequest`'s comment "defaults to the calendar year" (`import.ts:35`) becomes "defaults to the calendar year for
  the MPPR list; a quarterly file takes its stated quarter's window, which must be given".

#### 5.2.2 `packages/rules/src/parsers/locality.ts` (ZIP5)
Every line must carry YYYYQ at 76-80 equal to the quarter of the window's start (`zipFileQuarter`, imported from
`./locality-plus-four`).

| Code | Message (exact, `at` as the parser writes it today) |
|---|---|
| Z1 `zip5_quarter_missing` | `` `${at}: year and quarter ${JSON.stringify(field)} at 76-80 is not YYYYQ` `` (the ZIP9 parser's words, `locality-plus-four.ts:91`) |
| Z2 `zip5_quarter_mismatch` | the ZIP9 parser's mismatch message at `locality-plus-four.ts:126-128`, with "ZIP5" in place of "ZIP9" |

Existing parser tests whose ZIP5 lines are shorter than 80 characters get the field. Their assertions are unchanged.

#### 5.2.3 What stays: `window()`'s calendar-year default
It stays for `mppr_rate`, and it never applies to a quarterly type, because I4 refuses first. A default to the stated
quarter would change an accepted import, which the exception does not allow.

#### 5.2.4 Review questions (wording only)
- **`pprrvu.ts:155`:** "Is the effective window the quarter of this file's release (January, April, July or October),
  or, for a correction CMS made inside the quarter, the part of that quarter the file is in force for, so the year and
  quarter (A to D) on every record match the file's name (RVU26A, RVU26B, ...), with every earlier quarter's draft
  kept as it is?"
- **`ncci.ts:174`:** "Is this the practitioner services MUE table of the quarter the file states, imported for exactly
  that quarter, with every earlier quarter's MUE draft kept?"

### 5.3 #30 R2 in the checker: per record

In `checkRecord` (`check.ts:155-197`), when `!set.synthetic`, **whatever the record's `source.method`** (review M2: a
hand-typed record with a long window would otherwise widen a content's span, which `rule_release_content_span()`
unions over every record, `20261105090000:1015-1033`, and #7's refusal would pass silently). Each line below is a
problem string, prefixed as today with where the record is and its label:

| Code | When | Problem (exact) |
|---|---|---|
| C1 `quarter_window` | quarterly type and `windowQuarter(from, to)` is null | `` `${type} is imported for one CMS quarter: its window must lie inside one quarter, usually all of it (it is ${from} to ${to ?? 'open'})` `` |
| C2 `mppr_window` | `contentOf(record) === 'mppr_code'` and `!insideOneYear(from, to)` | `` `${type} is read from a calendar year's file with no dates of its own: its window must end inside ${year of from} (it is ${from} to ${to ?? 'open'})` `` |
| C3 `zip_quote_quarter` | `locality_map` or `locality_map_plus_four`, C1 passed, and quote `i`'s `zipFileQuarter` is not the window's YYYYQ | `` `quotes.${i} states year and quarter ${field ?? 'none'} at 76-80, but the record's window is ${label}` `` |
| C15 `hand_typed_undated` | `source.method === 'hand_typed'` and (a quarterly type, or `contentOf(record) === 'mppr_code'`) | `` `${type} comes from a CMS file and is imported with pnpm rules:import, never typed by hand: a hand-typed record would carry a window no file states (content/sources/README.md)` `` |

The general practice-expense reduction (`mppr_general`) is hand-typed by design and stays open (the real drafts'
`content/drafts/mppr_rate/2026/records.json`); none of C1, C2 or C15 reads it.

In `checkContentSet`, after `findOverlaps`, on real sets:

| Code | When | Problem (exact, prefixed `${set.dir}: `) |
|---|---|---|
| C16 `file_windows` | two records of one content in `UNDATED_RECORD_TYPES`' contents (`mppr_general` excepted) with the same `source.sha256` and different windows | `` `${content} records from one file (${source.path}) carry different windows (${a} and ${b}): a file is imported for one window, so import it again rather than editing a record's dates` `` |

So every quarterly and per-code MPPR span is a union of whole-file windows, each inside the quarter or year its file
states.

### 5.4 #30 R4: no gap inside a content

- **In the checker:** in `checkContentSet`, after `findOverlaps` (`check.ts:329-331`), on every set (drafts, numbered,
  fixtures), with `contentGaps(located records)`. One problem per gap:
  - C4 `content_gap`:
    `` `${set.dir}: ${content} has no record in force from ${from} to ${to}, inside the dates it is loaded for: import that content for those dates (a content may have no gap inside it)` ``
- **In the assembler:** the same function, on the selected L2+ records, refused before anything is written:
  - A4 `content_gap`: ``release ${n} not assembled: a content has dates with no record inside the dates it is loaded for:``
    then one line per gap, `  ${content}: ${from} to ${to}`.
  - Why both: the drafts can be whole while the L2+ subset has a hole (an L1 quarter between two verified ones).
- **Exemptions:**
  - `locality_map_plus_four` is sparse by design; `plusFourGaps` covers it (`assemble.ts:169-232`).
  - Per-key holes are legitimate (a code deleted and re-added), so they are never refused.
- **Algorithm:** group by content; sort the windows by `from`; merge; every hole between consecutive merged ranges is a
  gap. Cost O(n log n). At 2.2 million records it is one sort per content.

### 5.5 #30 R3: coverage against the previous release

#### 5.5.1 The previous release
- `packages/rules/src/content.ts` gains `previousReleaseNumber(root, n)` and `releaseDirOf(root, n): string | null`.
  These are the bodies of `tools/release/impact.ts:79-101`. `releaseDirOf` returns null where impact's
  `releaseDirectory` throws.
- `impact.ts`'s two functions call them. Their names and signatures stay.
- **One change of behaviour, on purpose (review m3):** today's `previousReleaseNumber` swallows every `readdirSync`
  error (`impact.ts:81-85`), so a permission or I/O failure would make the assembler build a "first release" with no
  comparison, and the post-assembly check would compute the same null and pass. The moved body catches only `ENOENT`
  (a parent directory that does not exist yet: `content/releases` does not at 6ddd587) and rethrows anything else. A
  test makes `content/outgoing` unreadable (mode 000, skipped when run as root) and expects a throw.
- Previous = the highest number below n in `content/releases` or `content/outgoing`, published first. Withdrawals in
  the database are not seen (section 2.2, Lane A).

#### 5.5.2 Checker: numbered release sets (`set.numbered`)
`checkContentSet` gains an optional `options: { today?: string }`. The default is the UTC date of the run. `checkContent`
passes it through. `index.ts` is unchanged. After the existing checks, for a numbered set:

| Code | When | Problem (exact, prefixed `${set.dir}: `) |
|---|---|---|
| C5 `coverage_missing` | no `COVERAGE.md` | `COVERAGE.md is missing: a prepared release records its coverage (pnpm release:assemble writes it)` |
| C6 `coverage_unreadable` | `readJsonBlock` problems, or schema issues | `` `COVERAGE.md: ${problem}` `` (one per issue, `describeIssues` as the manifest check does) |
| C7 `coverage_release` | `release` is not the directory's number | `` `COVERAGE.md names release ${a}, but the directory is ${b}` `` |
| C8 `coverage_previous` | `previous_release` is not the computed previous | `` `COVERAGE.md names previous release ${a ?? 'none'}, but the release before ${n} is ${b ?? 'none'}` `` |
| C9 `coverage_prepared` | `prepared_on` after `today`; or before the previous release's `prepared_on`; or `cutoff` is not `lookBackCutoff(prepared_on)` | `` `COVERAGE.md is prepared on ${p}, after today (${t})` `` / `` `COVERAGE.md is prepared on ${p}, before release ${m} (${q})` `` / `` `COVERAGE.md's cutoff is ${c}; six years before ${p} it is ${e}` `` |
| C10 `coverage_contents` | `contents` is not exactly `contentSummaries(records)` | `` `COVERAGE.md's contents do not match the release's records (${content}: ${what})` `` (first difference per content) |
| C11 `coverage_lost` | an unexplained loss with no equal `withdrawn` entry | `` `release ${n} stops covering ${record_type} ${canonicalKey} from ${from} to ${to ?? 'open'}, which release ${m} covered: keep those records, or withdraw that coverage with a signed note (content/sources/README.md, "Coverage")` `` |
| C12 `coverage_listed` | a computed `before_cutoff` or `closed_by_source` loss not listed, or any listed entry (of the three lists) that is not a computed loss of that list | `` `COVERAGE.md does not list ${list} ${entry}` `` / `` `COVERAGE.md lists ${list} ${entry}, which is not a coverage loss of that kind` `` |
| C13 `withdrawn_late` | a `withdrawn_on` after `prepared_on` | `` `COVERAGE.md withdrawn ${i}: withdrawn_on ${d} is after the release was prepared (${p})` `` |
| C14 `previous_unreadable` | the previous release's directory or records cannot be read | `` `the previous release ${m} cannot be read (${first problem}), so this release's coverage cannot be compared` `` |

Notes:
- `entry` is `` `${record_type} ${canonicalKey} ${from} to ${to ?? 'open'}` ``.
- "Exactly" in C10 and C12 compares canonical JSON.
- The previous release's own `COVERAGE.md` is read only for its `prepared_on`. If it is missing, that set reports C5
  itself, and C9's second clause is skipped here.
- Fail closed: the check needs the previous release's map. It is never skipped because something is unreadable; C14
  is a problem.
- **Cache:** at most two coverage maps per `checkContent` run, by directory.
- `COVERAGE.md` elsewhere (drafts, fixtures) stays an ignored `.md`, as today.

#### 5.5.3 Checker: the drafts note
On the drafts set (`set.dir === 'content/drafts'`), if `content/drafts/COVERAGE-WITHDRAWN.md` exists (only that name
at the drafts root; every other `.md` stays skipped):

| Code | When | Problem (exact, prefixed `content/drafts/COVERAGE-WITHDRAWN.md: `) |
|---|---|---|
| D1 `note_unreadable` | block or schema problems (the two-signer rule included) | `` `${problem}` `` |
| D2 `note_stale` | `previous_release` is not the newest number in releases ∪ outgoing | `` `names previous release ${a}, but the newest release is ${b ?? 'none'}: it belongs to a release already assembled, so remove it` `` |

#### 5.5.4 Assembler (`tools/release/assemble.ts`)
After `plusFourGaps` (`:298-301`), in this order. Every refusal comes before anything is written.
1. **R4** (5.4, A4).
2. **The previous release:** `previous = previousReleaseNumber(root, release)`.
   - `prevMap = coverageMap(releaseRecords(releaseDirectory(root, previous)))`; an empty map when there is none.
   - The previous records go out of scope at once (R5).
   - Its `prepared_on` is read from its `COVERAGE.md`. If it is later than `request.today`, refuse A9:
     ``release ${n} not assembled: release ${m} was prepared on ${q}, after today (${t})``.
3. **The regression:** `coverageRegression(prevMap, coverageMap(records), records, lookBackCutoff(request.today))`.
4. **The note:** `note = read content/drafts/COVERAGE-WITHDRAWN.md` (absent is fine).
   - A note naming another previous release is refused (A5):
     ``release ${n} not assembled: content/drafts/COVERAGE-WITHDRAWN.md names release ${a}, but the release before ${n} is ${b ?? 'none'}``.
5. **Matching** the note's entries (record type, key, from, to) against `unexplained`:
   - A6, losses without an entry:
     ``release ${n} not assembled: it stops covering what release ${m} covered:``
     then `  ${entry}` lines, then
     `keep those records in content/drafts, or withdraw that coverage on purpose in content/drafts/COVERAGE-WITHDRAWN.md, signed by two people (content/sources/README.md, "Coverage")`.
   - A7, entries matching no loss: ``release ${n} not assembled: content/drafts/COVERAGE-WITHDRAWN.md withdraws ${entry}, which release ${n} does not lose``.
6. **`COVERAGE.md`:** `release`, `previous_release`, `prepared_on: request.today`, `look_back_years`, `cutoff`,
   `contents: contentSummaries(records)`, the three lists (`withdrawn` = the note's entries, sorted). Written into the
   release directory before `sealRelease`, so the manifest seals it.
7. **`RELEASE.md`:** `releaseNotes` gains an optional `coverage?: { previous: number | null; beforeCutoff: number; closedBySource: number; withdrawn: readonly WithdrawnEntry[] }`.
   - When given, it renders a section `## Coverage against release <m>` before `## Impact on existing runs`:
     - the three counts;
     - each withdrawn entry as `- <entry>: <reason> (withdrawn by <a>, confirmed by <b>, <date>)`;
     - "Details in COVERAGE.md."
   - When absent, it renders nothing. Every fixture renderer (`tools/release/synthetic.ts`,
     `tools/golden-worksheet/synthetic-release.ts`) passes nothing, so their bytes are unchanged.
8. **Seal and verify** as today. The post-assembly `checkContentSet` (`:349-352`) now runs C5 to C14 on the new set,
   with `today: request.today`.
9. **Only after verification passes:** `rmSync` the drafts note, if there was one. On any failure the release
   directory is removed (as today) and the note stays.
10. `AssembleResult.files` lists `COVERAGE.md`.

`tools/release/workspace.ts` (the console's prepare path) calls `assembleRelease` and needs no change. Its test's
expected file lists gain `COVERAGE.md`.

### 5.6 #7: months that need Medicare content not loaded

#### 5.6.1 Spans and reads (`apps/worker/src/price/release.ts`, added exports)
```ts
export const SPAN_CONTENTS = ['mppr_code', 'mppr_general', 'ncci_mue'] as const;    // rule_release_content_span()'s rows
export type SpanContent = (typeof SPAN_CONTENTS)[number];
export type HalfOpenRange = { readonly from: string | null; readonly until: string | null };
export type ContentSpans = Readonly<Record<SpanContent, readonly HalfOpenRange[]>>;
/** SELECT content, loaded::text FROM rule_release_content_span($1), parsed with parseDateMultirange (../screening/format). A content with no row is [] (nothing loaded). */
export async function releaseContentSpans(client: ScopeClient, releaseNo: number): Promise<ContentSpans>;
export function rangesCover(ranges: readonly HalfOpenRange[], date: string): boolean;
export type ContentFamily = 'mppr' | 'mue';
export const CONTENT_FAILURE_CODES = ['waiting_on_content_mppr', 'waiting_on_content_mue', 'waiting_on_content_mppr_mue'] as const;
export type ContentFailureCode = (typeof CONTENT_FAILURE_CODES)[number];
export function contentFailureCode(families: ReadonlySet<ContentFamily>): ContentFailureCode;   // throws on an empty set
export function familiesOf(code: ContentFailureCode): readonly ContentFamily[];
export function familyOf(content: SpanContent): ContentFamily;                                 // mppr_code, mppr_general: mppr; ncci_mue: mue
export function contentsOf(family: ContentFamily): readonly SpanContent[];                     // mppr: code and general; mue: ncci_mue
export interface ContentRead { readonly content: SpanContent; readonly date: string }
/** What the engine read of the three contents, from the trace's steps (never from the flags alone). */
export function contentReads(trace: PricingTrace): ContentRead[];
/** The reads on dates outside the content's span. */
export function contentGapsOf(trace: PricingTrace, spans: ContentSpans): ContentRead[];
/** Per content, the days of [from, to] the spans cover, as inclusive ranges. */
export function coveredDays(spans: ContentSpans, content: SpanContent, from: string, to: string): DateRange[];
/** Per-content windows of a release, from a tp_app SELECT (5.9); `contents` limits the types read. */
export async function releaseContentWindows(client: ScopeClient, releaseNo: number, recordTypes?: readonly RuleRecordType[]): Promise<ContentWindows>;
export interface ContentWindow { readonly content: ContentId; readonly records: number; readonly loaded: readonly HalfOpenRange[]; readonly newestFrom: string; readonly newestRetrieved: string | null }
export type ContentWindows = ReadonlyMap<ContentId, ContentWindow>;
```

`contentReads(trace)`, exactly. Let `date = trace.line.service_date`.
- `trace.steps.units?.mue.checked === true` gives `{content: 'ncci_mue', date}`. It is set only with `apply_ncci` on
  (`engine.ts:349-356`).
- Each adjustment with `name === 'mppr'` gives `{content: 'mppr_code', date: adj.service_date}`, and, when
  `adj.general_record !== null`, also `{content: 'mppr_general', date: adj.service_date}`.
- `trace.outcome` unpriced `ENGINE_ERROR` with detail `no_mppr_rate` gives `{content: 'mppr_code', date}` and
  `{content: 'mppr_general', date}`. In that case the code's record was found with a null share, the general rate was
  looked up and missed, and no adjustment entry was written (`engine.ts:727-732`).
- Nothing else. A day whose reduction threw has its entries cleared (`engine.ts:709-714`). Such a line is already an
  operator-visible ENGINE_ERROR, and it reads nothing here.
- So a commercial fixed-fee line, with its flags off, reads nothing. A fixed fee with `apply_mppr` on stops at
  `mppr_needs_fee_schedule` before MPPR (`engine.ts:542-544`) and also reads nothing.

#### 5.6.2 The run refusal (`apps/worker/src/price/execute.ts`)
- `FailureCode` becomes:
  `'engine_version_mismatch' | 'unmapped_plan' | 'job_failed' | 'location_not_ready' | 'release_read_outside_fetch' | ContentFailureCode`.
- In `priceRun`, after `stops`:
  - `spans = await releaseContentSpans(scope.client, run.release_no)`;
  - `windows = await releaseContentWindows(scope.client, run.release_no, LOUD_CONTENT_TYPES)` (5.6.5);
  - `source = await storedReleaseSource(scope.client, run.release_no)` (5.7), which replaces `loadRuleRelease`.
- **One `seen` callback per line, which records and never throws** (review m1: today's `onLocation` throws inside the
  batch loop, `execute.ts:279-296`, so a later claim's violation would never be priced or seen):
  1. if `view.violation !== null`, `violation = true`;
  2. if the line stopped on a location the practice cannot price at (the `stops` test of `onLocation`, unchanged),
     `locationStopped = true`;
  3. `for (const read of contentGapsOf(result.trace, spans)) families.add(familyOf(read.content))`, and
     `gapLines += 1` when that added any read for this line;
  4. when no gap was added for this line and `isLoudContentGap(result, windows)`, `alertLines += 1`.
- **Per batch:** `view = await source.view(claimsRequestedKeys(claims, settings.zip))`; then `rows = priceClaims(...)`;
  then the violation check: `if (violation || view.violation !== null) throw new ReadOutsideFetch()` (before anything
  of the batch is stored, so a violation is never stored and never waits for the end); then
  `if (!locationStopped && families.size === 0) await insertPricedLines(...)`.
  - After the first location stop or content gap, batches are still priced, so every violation of the run is seen
    and the families are exact, but nothing more is written.
- **After the loop**, in precedence order: `if (locationStopped) throw new LocationNotReady(...)`; then
  `if (families.size > 0) throw new ContentNotLoaded(contentFailureCode(families), gapLines + alertLines)`; both before
  `computeCoverage`.
- **The outer catch** (each one rolls back the pricing transaction):
  - `LocationNotReady` → `location_not_ready`, as today;
  - `ContentNotLoaded` → `failRun(code)` in its own transaction, then
    `context.logger.warn(CONTENT_NOT_LOADED_MESSAGE, { pricing_run_id, error_code: 'CONTENT_NOT_LOADED', record_count })`
    with `record_count` the lines that read MPPR or MUE outside the spans plus the loud lines (review M4: every run
    that meets content not loaded alerts once, whoever created it, a person, the monitor or a re-run), and returns
    `{ outcome: 'failed', failureCode: code }`;
  - `ReadOutsideFetch` → `failRun('release_read_outside_fetch')`, then
    `context.logger.error('pricing run read rule content outside the keys it fetched', { pricing_run_id, error_code: 'RELEASE_READ_OUTSIDE_FETCH' })`.
- **Precedence, over the whole run:** a read outside the fetch first (it is PaidWhole's defect and must never hide),
  then the location (the customer's step), then content. Because no stop throws mid-batch, it holds for a violation
  in any claim of the run, not only one before the first location stop. A location-stopped run now prices to its
  end before it fails; it is rolled back either way, and the cost is the run's own pricing time (minutes at 100,000
  lines, 5.10).
- **After a complete run:** the engine-error log is unchanged (`execute.ts:311-315`). Then, if `alertLines > 0`:
  `context.logger.warn(CONTENT_NOT_LOADED_MESSAGE, { pricing_run_id, error_code: 'CONTENT_NOT_LOADED', record_count: alertLines })`.
  So a run logs the content alert at most once, refused or complete.
- **The module comment** gains a paragraph on the content refusal, the precedence, and why the engine-error page is
  unchanged until the later PR.

#### 5.6.3 The monitor (`apps/worker/src/monitor/plan.ts`, `job.ts`)
```ts
export interface ContentWaitingMonth extends PlannedMonth { readonly failureCode: ContentFailureCode; readonly failedReleaseNo: number }
/** The month's newest run of exactly that month failed with a content code, its cut-off at or after the month's newest line; null otherwise. */
export async function contentFailure(client: ScopeClient, practiceId: string, month: PlannedMonth): Promise<{ failureCode: ContentFailureCode; releaseNo: number } | null>;
/** Whether release `now` covers more of the month than release `failed`, for any content of the code's families. */
export async function coversMore(client: ScopeClient, failure: { failureCode: ContentFailureCode; releaseNo: number }, now: number, month: PlannedMonth): Promise<boolean>;
```
- `contentFailure`'s SQL is `waitingOnLocation`'s `newest` and `last_run` CTEs, with
  `r.status = 'failed' AND r.failure_code = ANY ($4::text[]) AND r.cut_off >= (SELECT n.at FROM newest n)`, and
  **the practice's terms unchanged since the run** (review m2):
  `r.created_at >= coalesce((SELECT max(greatest(x.created_at, x.updated_at)) FROM (SELECT created_at, updated_at FROM payer_plan_mapping WHERE practice_id = $1 UNION ALL SELECT created_at, updated_at FROM contract_version WHERE practice_id = $1) x), '-infinity')`.
  It returns `failure_code` and `release_no`.
  - Why: a remap of the plan to a commercial contract with the flags off, or a new or signed-off contract version,
    can make the month price without that content. Both tables keep `updated_at` by trigger
    (`20261016160000_contracts_and_mapping.sql:271`, `:274`), and no code deletes their rows. The comparison is
    `waitingOnLocation`'s `practice_site.updated_at` precedent (`plan.ts:128-149`): a run created at or after the
    last change saw it.
  - The query reads both tables under the practice's scope (forced RLS, the app role's existing grants); no new grant.
- `coversMore` is true iff some content `c` of `contentsOf(familiesOf(code))` has `coveredDays(spansNow, c, month)`
  not a subset of `coveredDays(spansFailed, c, month)`. Spans are read once per release per plan.
- **`planMonitoring`:** after the `waitingOnLocation` check, `failure = await contentFailure(...)`. If a failure exists
  and (`failure.releaseNo === releaseNo` or `!(await coversMore(...))`), push
  `{ ...month, failureCode, failedReleaseNo }` to `waitingOnContent` and continue. Otherwise plan the month as today.
- `MonitorPlan.planned` gains `readonly waitingOnContent: readonly ContentWaitingMonth[]`.
- **`job.ts`**, after the location log, when the list is non-empty:
  `context.logger.warn('monitoring left months waiting on rule content PaidWhole has not loaded', { release_no, error_code: 'WAITING_ON_CONTENT', record_count })`.
- **No daily loop:** a waiting month starts no run until a release in force covers more of it, the practice's
  mappings or contract versions change, or a newer line arrives. Any of these plans it at the next trigger (an
  upload's chain, or the daily monitoring schedule, `apps/worker/src/platform/monitoring-schedule.ts`).

#### 5.6.4 Coverage: the waiting card (`apps/web`)
- **New `apps/web/src/lib/pricing/content.ts`:**
  `monthsWaitingOnContent(scope, practiceId): Promise<ContentWaitMonth[]>`, modelled on `monthsWaitingOnLocation`
  (`apps/web/src/lib/pricing/location.ts:190-262`).
  - Months whose newest exact-month run failed a content code, with its cut-off at or after the month's newest line.
  - Per month: the `Totals` (lines, claims, billed, paid).
  - `families` (from the code).
  - `quarters`: the `quarterLabel`s of the month's days the failed release's spans do not cover, for the families'
    contents (`coveredDays`).
  - `kind`: `'waiting'`; `'repricing'` when the release in force `coversMore`; `'terms_changed'` when the practice's
    mappings or contract versions changed after the failed run (the monitor's predicate, 5.6.3, shared as one SQL
    fragment exported from `@tp/worker/pricing`).
  - Spans come through `@tp/worker/pricing` (`releaseContentSpans`), cached per (release, manifest) in
    `apps/web/src/lib/releases/content-through.ts` (5.9).
- **`apps/web/src/lib/routes/coverage.ts`:** `CoveragePageData` gains `waitingOnContent: readonly ContentWaitMonth[]`
  and `contentHeadline: Totals`, and `feeScheduleNotLoaded` (`feeSchedulePeriodsNotLoaded`'s rows, 5.6.6).
- **New `apps/web/src/components/pricing/content.tsx`:** `MonthsWaitingOnContent`, beside `location.tsx`, with the
  same table shape.
- **`apps/web/src/app/p/[practiceId]/coverage/page.tsx`:** a card after the billing-ZIP card, rendered only when the
  list is non-empty. The words are in 5.11.
- **`apps/web/src/components/pricing/display.tsx`:** `FAILURE_TEXT` gains the four codes (5.11). The `satisfies` clause
  forces it.

#### 5.6.5 One content alert per run
```ts
/** The record types the loud content gaps are judged against (one SELECT per run). */
export const LOUD_CONTENT_TYPES = ['pfs_rvu', 'pfs_gpci', 'conversion_factor', 'sequestration', 'assistant_modifier', 'locality_map', 'locality_map_plus_four'] as const;
/** A line stopped by content PaidWhole has not loaded for its date (never one of the three span contents). */
export function isLoudContentGap(result: LinePricing, windows: ContentWindows): boolean;
```
True iff either of these holds:
- **A fee schedule not loaded for the line:** the outcome is unpriced `NO_PFS_VALUE` with detail
  `no_rvu_in_basis_year`, judged as the engine looked (`packages/pricing/src/engine.ts:565-586`, read through the
  trace's `steps.fee_schedule.lookup`):
  - `in_force_on_service_date` (`year_basis` CURRENT): the service date is outside every `pfs_rvu` window. Since #30
    makes `pfs_rvu` quarterly, a missing quarter is a gap here even when the rest of its year is loaded (review M1);
  - `latest_in_basis_year` (`LOCKED:<year>`): no `pfs_rvu` window meets `[basis_year-01-01, basis_year-12-31]`.
  A line whose date is loaded and whose code simply has no RVU stays the plain "check the code and year" reason, as
  today.
- **A content not loaded on the date:** the outcome is unpriced `ENGINE_ERROR` with one of these details, and the
  service date is outside its content's windows:

  | Detail | Content |
  |---|---|
  | `no_gpci` | `pfs_gpci` |
  | `no_conversion_factor` | `conversion_factor` |
  | `no_sequestration_record` | `sequestration` |
  | `no_assistant_record` | `assistant_modifier` |
  | `no_locality` | `locality_map` |
  | `no_locality_plus_four` | `locality_map_plus_four` |

  Every detail named must be in `ENGINE_ERROR_DETAILS` or `NO_PFS_VALUE_DETAILS` (`packages/pricing/src/reasons.ts`).
  The builder checks each one. If one is not there, stop and ask; never rename it.
- `CONTENT_NOT_LOADED_MESSAGE = 'pricing run found lines stopped by rule content not loaded for their dates'`.
  - It is exported from `execute.ts`, and its twin, with `CONTENT_NOT_LOADED_METRIC`, from `infra/lib/jobs.ts`.
  - `infra/lib/jobs.ts` documents that the alarm comes in the later PR.
  - A new `infra/test/content-alert.test.ts` holds the two equal, as the engine-error pair is held.

#### 5.6.6 The fee-schedule period sentence (shared with #59)
- `apps/web/src/lib/coverage/in-effect.ts` gains
  `feeSchedulePeriodsNotLoaded(scope, practiceId, rvuLoaded: string): Promise<{ period: { kind: 'quarter' | 'year'; label: string }; lines: number; chargeCents: string }[]>`,
  where `rvuLoaded` is the release in force's `pfs_rvu` windows as a `datemultirange` literal (5.9).
  - It reads the in-effect lines unpriced `NO_PFS_VALUE` whose trace's `outcome.detail` is `no_rvu_in_basis_year`,
    with the same test as `isLoudContentGap`, in SQL, with the windows as a parameter:
    - `lookup = 'in_force_on_service_date'`: `NOT ($3::datemultirange @> (trace->'line'->>'service_date')::date)`,
      grouped by the service date's CMS quarter (`2026-Q4`);
    - `lookup = 'latest_in_basis_year'`: `NOT ($3::datemultirange && daterange(make_date(y, 1, 1), make_date(y, 12, 31), '[]'))`
      with `y = (trace->'steps'->'fee_schedule'->>'basis_year')::int`, grouped by `y`.
  - With their billed cents (`sum(...)::text`, bigint cents, never a float), periods in date order.
- No DDL: a SELECT over the in-effect lines the Coverage page already reads, under its practice scope.
- The reason table and its remedy are unchanged. The sentence renders below the table, once per period (5.11).
- Tests (`apps/web/src/lib/pricing/content.db.test.ts`): with 2026-Q1 to Q3 loaded and Q4 not, a CURRENT line of
  2026-10-14 gives "2026-Q4" and a CURRENT line of 2026-08-03 whose code has no RVU gives nothing; a `LOCKED:2025`
  line under a release with no 2025 window gives "2025"; and `isLoudContentGap` counts the first and third lines,
  not the second (`apps/worker/src/price/content.test.ts`).

#### 5.6.7 The triage hold
- **`packages/triage/src/actionable.ts`:**
  - `NOT_ACTIONABLE_REASONS` gains `'CONTENT_NOT_LOADED'` after `'RELEASE_WITHDRAWN'`;
  - `TriageFacts` gains `readonly contentNotLoaded: boolean`, with this comment: "whether the line's trace read the
    per-code MPPR, the general MPPR or the MUE on a date its release's spans do not cover: it was priced without
    those limits";
  - `judgeLine` pushes the reason when the fact is true.
- **`apps/worker/src/triage/execute.ts` `candidateLines`:** spans are read once per release, with
  `contentNotLoaded = contentGapsOf(parseTrace(row.trace), spans).length > 0`.
- **`apps/worker/src/report/content.ts`:** its `judgeLine` call (`:481-503`) gets the same fact.
- **`apps/worker/src/report/html.ts`:** `REASON_TEXT` gains the reason (5.11).
- **Scope of the hold:** lines not yet actionable. Stages are monotonic, so a line already actionable keeps its
  stage. Today that means none in production: no real release is loaded.

#### 5.6.8 Fixture release 900007
- `tools/release/synthetic.ts` gains:
  - `CONTENT_GAP_RELEASE_DIR = 'fixtures/synthetic/rules/release-synth-900007'`;
  - `CONTENT_GAP_RELEASE_NUMBER = 900_007`;
  - `renderContentGapRelease(root)`.
- **What it renders:** every file of 900001, but with:
  - `mppr_rate/2026/<parsed file>.json`, re-parsed from `MPPR_SYNTHETIC.csv`;
  - `ncci_mue/2026/<parsed file>.json`, re-parsed from `NCCI_MUE_SYNTHETIC.csv`;
  - each through its parser with the window `2026-01-01` to `2026-09-30` (`parsedRecordFile` gains an optional window
    parameter, defaulting to today's full year, so 900001 is byte-identical);
  - RELEASE.md, through `releaseNotes` with no `coverage`, and the title "SYNTHETIC content-gap release 900007";
  - the manifest.
- The hand-typed general MPPR rate stays open. Every other type is unchanged.
- No new CSV, so no `pinned-tables.json` entry.
- The main block writes it after 900006.
- `tools/release/release.test.ts:439-451` gains the `[CONTENT_GAP_RELEASE_DIR, renderContentGapRelease()]` pair, and
  a test that `diffRecords(900001, 900007)` changes only those two files' windows.
- `apps/worker/src/price/test-support/pricing-world.ts` gains `CONTENT_GAP_RELEASE = 900_007`, loaded only by the
  tests that ask for it (the `DEADLINE_RELEASE` precedent, `:72-83`).


### 5.7 #31: the key-scoped reader

#### 5.7.1 Keys (`apps/worker/src/price/keyed-release.ts`, added)
```ts
/** The structural part of a priced claim the keys come from (StoredClaim satisfies it). */
export interface KeyedClaim { readonly lines: readonly { readonly lineNo: number; readonly procedureCode: string; readonly serviceDate: string }[] }
/**
 * Every key the engine can look up for these claims (the engine's lookups, packages/pricing/src/engine.ts):
 * for each line's code, pfs_rvu {hcpcs, modifier: ''}, ncci_mue {hcpcs} and mppr_rate {hcpcs, modifier: ''};
 * mppr_rate {component: 'practice_expense'} once; for each claim, every ordered pair of lines with different
 * lineNo and the same serviceDate as ncci_ptp {column1: other.procedureCode, column2: line.procedureCode};
 * and locality_map {zip} and locality_map_plus_four {zip} for the run's five-digit ZIP, '' included.
 * A superset of what the engine asks: the flags only narrow the reads.
 */
export function claimsRequestedKeys(claims: readonly KeyedClaim[], zip: string): RequestedKeys;
/** The union of two key sets. */
export function unionKeys(a: RequestedKeys, b: RequestedKeys): RequestedKeys;
```
`screeningRequestedKeys` and `keyedRelease` are unchanged.

#### 5.7.2 Sources (`apps/worker/src/price/release.ts`, added)
```ts
/** Where a pricing caller reads a release from, one batch's keys at a time (audit #31; docs/adr/0071). */
export interface ReleaseSource {
  readonly releaseNo: number;
  readonly manifestSha256: string;
  /**
   * The engine's view for a batch: serves every key the caller has asked this source for so far, the shared types
   * whole; any other keyed lookup sets `violation` and throws (keyedRelease()). The caller checks `violation` after
   * every price() call and before it stores anything.
   */
  view(keys: RequestedKeys): Promise<KeyedReleaseView>;
}
/** A published release in the database: shared types once per process (two releases at most), keyed records fetched once per source. */
export async function storedReleaseSource(client: ScopeClient, releaseNo: number): Promise<ReleaseSource>;
/** A release already in memory (the dry run's candidate from files): the same contract, so a missed key is just as loud. */
export function memoryReleaseSource(release: IndexedRelease): ReleaseSource;
/** Only the named record types of a release, for triage and reports: any other type's lookup throws ReleaseTypeNotRead. */
export async function typedRelease(client: ScopeClient, releaseNo: number, types: readonly RuleRecordType[]): Promise<IndexedRelease>;
export class ReleaseTypeNotRead extends Error { /* name 'ReleaseTypeNotRead'; message names the type only */ }
```

**`storedReleaseSource`:**
- **The header:** `releaseHeader`; null throws `RuleReleaseMismatchError`, as `loadRuleRelease` does.
- **The shared index:** `sharedTypes(client, header)`, cached in a module-level `Map` keyed
  `` `${releaseNo}:${manifestSha256}` ``, at most two entries, the oldest evicted. The caching mirrors
  `apps/worker/src/screening/job.ts:125-145`, which is not touched.
  1. List the release's types with a loose index scan:
     ```sql
     WITH RECURSIVE types AS (
       (SELECT record_type FROM rule_record WHERE release_no = $1 ORDER BY record_type LIMIT 1)
       UNION ALL
       SELECT (SELECT r.record_type FROM rule_record r WHERE r.release_no = $1 AND r.record_type > t.record_type ORDER BY r.record_type LIMIT 1)
         FROM types t WHERE t.record_type IS NOT NULL)
     SELECT record_type FROM types WHERE record_type IS NOT NULL
     ```
  2. Read the types not in `KEYED_RECORD_TYPES`, with `loadRuleRelease`'s columns:
     `SELECT ... FROM rule_record WHERE release_no = $1 AND record_type = ANY ($2::text[]) ORDER BY record_type, effective_from, id`.
  3. Index them with `indexStoredRelease`. A type added later is read whole, never silently left out.
- **The keyed records** live per source instance:
  - `fetched: RequestedKeys`, cumulative;
  - `rows: StoredRecordRow[]`, cumulative.

  `view(keys)` fetches only the keys not yet in `fetched`, in statements of at most 5,000 keys:
  ```sql
  SELECT x.record_type, x.key, x.value, x.effective_from::text AS effective_from, x.effective_to::text AS effective_to, x.sha256
    FROM unnest($2::text[], $3::jsonb[]) AS w (record_type, key)
   CROSS JOIN LATERAL (
     SELECT r.record_type, r.key, r.value, r.effective_from, r.effective_to, r.sha256, r.id
       FROM rule_record r
      WHERE r.release_no = $1 AND r.record_type = w.record_type AND r.key = w.key
     OFFSET 0) x
   ORDER BY x.record_type, x.effective_from, x.id
  ```
  - `OFFSET 0` fences each key into its own probe of `rule_record_identity`, whatever the statistics say (ADR
    0062:1258-1262).
  - The keys are passed as canonical JSON (`keyIdentity`).
  - It runs on the job's own client, inside the batch's transaction (READ COMMITTED; the release is immutable).
  - It then rebuilds `records = indexStoredRelease(header, rows)` only when something new was fetched, and returns
    `keyedRelease({ shared, records, requested: fetched })`.
  - Memory: the run's distinct keys and their records, a few MB at the scale shape (scout-engine §6), never the
    release.

**`memoryReleaseSource(release)`:** `view(keys)` returns `keyedRelease({ shared: release, records: release, requested: unionKeys(fetched, keys) })`.

**Callers:**

| File | Change |
|---|---|
| `execute.ts` | `storedReleaseSource` per run; a `view` per batch; violation checks (5.6.2) |
| `impact.ts` `runReleaseImpact(scope, run, candidate: ReleaseSource, requestId, options)` | The parameter is a `ReleaseSource`, no longer an `IndexedRelease`. Per batch: one key set, `own.view(keys)` and `candidate.view(keys)`. The own source is `storedReleaseSource(scope.client, run.releaseNo)`, or `candidate` when the numbers are equal. After each `priceClaims`, if either view's `violation` is set, it throws `ReleaseReadOutsideFetch(violation)`: a read, loud. The return value is unchanged |
| `apps/web/src/lib/routes/releases.ts:66` | `runReleaseImpact(scope, run, await storedReleaseSource(scope.client, note.releaseNo), request.requestId)` |
| `tools/release/database-runs.ts:46-47` | `memoryReleaseSource(indexRelease(release))` |
| `apps/worker/src/triage/execute.ts:257` | `typedRelease(client, releaseNo, BEHAVIOR_RECORD_TYPES)` |
| `apps/worker/src/report/content.ts:464` | the same |
| `packages/triage/src/behavior.ts` | Exports `BEHAVIOR_RECORD_TYPES = ['mppr_rate', 'conversion_factor'] as const`, beside `releaseReferences` (`:48-66`), which is unchanged |
| `apps/worker/src/price/public.ts` | Exports `storedReleaseSource`, `memoryReleaseSource`, `typedRelease`, `ReleaseSource`, `releaseContentSpans`, `releaseContentWindows`, `CONTENT_FAILURE_CODES`, `familiesOf`, `coveredDays`, `rangesCover` and the types. `loadRuleRelease` stays exported: it is the tests' oracle, and the screening-capacity oracle uses `indexStoredRelease` |

**`apps/worker/src/price/diff.ts:313-316` and `:364-367`:**
- The joins `rr.release_no = ... AND rr.sha256 = ...` become joins on
  `(rr.release_no, rr.record_type, rr.key, rr.effective_from)`, from the trace ref's `record_type`, `key` and
  `effective_from` (`packages/pricing/src/release.ts:19-25`). `rr.sha256 = ref.sha256` stays as an added condition, so
  the row matched is exactly the one named.
- The output is unchanged; `diff`'s existing tests prove it.

**The loud contract, restated for review:** no caller stores a row priced through a view whose `violation` is set. A
violation in a price job fails the run as `release_read_outside_fetch` and logs `RELEASE_READ_OUTSIDE_FETCH`. A
violation in an impact check throws. A lookup in triage or a report of a type not read throws `ReleaseTypeNotRead`.
None of these is inside the engine, so none can become a quiet ENGINE_ERROR.

#### 5.7.3 Heap constants (`infra/lib/heap.ts`, new)
```ts
/** Explicit V8 heap limits per task (audit #31; docs/adr/0071): today's automatic sizes, made deliberate and tested weekly. */
export const HEAP_MIB = { worker: 560, platform: 259, web: 560 } as const;
export function heapFlag(service: keyof typeof HEAP_MIB): string;   // `--max-old-space-size=${n}`
```
- The values equal what Node 24 chooses today at those task sizes (`infra/lib/environments.ts:105-107`: 560 MiB at
  1,024, 259 at 512, measured), so wiring them in the later PR changes no behaviour. The platform's value is the
  measured 259, not a rounded 256 (review n1).
- `infra/test/heap.test.ts` (new) holds every value at or below 60% of its task's memory in every environment of
  `environmentSettings`.
- The weekly test runs the worker under `heapFlag('worker')` now. The flag is added to the command by
  `tools/release-capacity/run.ts`, never by `tools/screening-capacity/containers.ts` (5.0, 5.10).

### 5.8 #59: the content calendar

#### 5.8.1 The calendar (`packages/rules/src/calendar.ts`, new; subpath `@tp/rules/calendar`)
- `packages/rules/package.json` `exports` gains `"./calendar": "./src/calendar.ts"`.
- No dependency changes, and so no lockfile change.
- `index.ts` does not re-export it. Nothing in the closure imports it.

```ts
export const CONTENT_FAMILIES = ['fee_schedule', 'conversion_factor', 'zip_locality', 'mppr', 'mppr_general', 'ncci_mue', 'ncci_ptp', 'code_lists', 'therapy_thresholds', 'assistant_modifiers', 'sequestration', 'state_prompt_pay', 'dispute_windows'] as const;
export type ContentFamilyId = (typeof CONTENT_FAMILIES)[number];
const mmdd = z.string().regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);
export const calendarEntrySchema = z.strictObject({
  family: z.enum(CONTENT_FAMILIES),
  title: z.string().min(3).max(80),                     // customer words, sentence case
  contents: z.array(z.enum(CONTENT_IDS)).min(1),
  source: z.strictObject({ title: z.string().min(3), page: z.url({ protocol: /^https$/ }) }),
  cadence: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('quarterly') }),
    z.strictObject({ kind: z.literal('annual'), effective: mmdd }),
    z.strictObject({ kind: z.literal('dates'), effective: z.array(mmdd).min(2) }),
    z.strictObject({ kind: z.literal('on_change') }),
  ]),
  ends: z.enum(['window', 'open']),
  publicationLeadDays: z.number().int().min(0).max(365).nullable(),
  loadLeadDays: z.number().int().min(0).max(60),
  graceDays: z.number().int().min(0).max(60),
  importCommands: z.array(z.string().startsWith('pnpm rules:import ')),
  filePattern: z.string().nullable(),                    // a RegExp source, matched case-insensitively against link file names
  knownFiles: z.array(z.string()).nullable(),            // null: not recorded yet
  review: z.strictObject({ by: z.string().min(2).max(80), on: isoDate }).nullable(),
});
export const contentCalendarSchema = z.array(calendarEntrySchema).superRefine(/* families unique; every content in at most one entry; on_change ⇔ publicationLeadDays null; filePattern compiles */);
export type ContentCalendar = z.infer<typeof contentCalendarSchema>;
export const CONTENT_CALENDAR: ContentCalendar = contentCalendarSchema.parse([ /* the entries below */ ]);
```

**The entries.** The cadences come from the repository: `docs/product/PRD.md` §9's table (`:370-383`), §19 "The year"
(`:800-809`) and `content/sources/README.md:60-69`. Every lead, grace and publication value is a proposal until a
reviewer confirms it against its source page, so every entry ships with `review: null` (5.8.2). `knownFiles: null`
everywhere. Pages are the README's.

| family | title | contents | cadence | ends | publicationLeadDays | loadLeadDays | graceDays | filePattern |
|---|---|---|---|---|---|---|---|---|
| fee_schedule | Medicare fee schedule (relative values and GPCIs) | pfs_rvu, pfs_gpci | quarterly | window | 30 | 14 | 3 | `^RVU\d{2}[A-D].*\.zip$` |
| conversion_factor | Medicare conversion factor | conversion_factor | annual 01-01 | window | 55 | 14 | 3 | null |
| zip_locality | ZIP code to Medicare locality | locality_map, locality_map_plus_four | quarterly | window | 30 | 14 | 3 | `^ZIP.*\.zip$` |
| mppr | Medicare multiple-procedure reduction list (MPPR) | mppr_code | annual 01-01 | window | 30 | 14 | 3 | `MPPR.*\.(zip\|csv\|xlsx?)$` |
| mppr_general | Medicare general practice-expense reduction | mppr_general | on_change | open | null | 0 | 0 | null |
| ncci_mue | Medicare unit limits (MUE) | ncci_mue | quarterly | window | 30 | 14 | 3 | `MUE.*\.(zip\|csv)$` |
| ncci_ptp | Medicare coding edits (NCCI PTP) | ncci_ptp | quarterly | open | 30 | 14 | 5 | `PTP.*\.zip$` |
| code_lists | X12 claim adjustment, remark and status codes | carc, rarc, claim_status_code | dates 03-01, 07-01, 11-01 | open | 30 | 14 | 7 | null |
| therapy_thresholds | Medicare therapy thresholds | therapy_threshold | annual 01-01 | window | 55 | 14 | 3 | null |
| assistant_modifiers | Medicare therapy assistant reduction | assistant_modifier | on_change | open | null | 0 | 0 | null |
| sequestration | Medicare sequestration | sequestration | on_change | open | null | 0 | 0 | null |
| state_prompt_pay | State prompt-pay rules | state_prompt_pay | on_change | open | null | 0 | 0 | null |
| dispute_windows | Medicare appeal windows | dispute_window | on_change | open | null | 0 | 0 | null |

- `denial_category` is PaidWhole's own classification, so it is in no entry.
- `importCommands`: one template per record type of the family, using the README's flags.
  - Placeholders: `{year}`, `{from}`, `{to}`, `{url}`, and a file placeholder in angle brackets.
  - For example, for `fee_schedule`:
    `pnpm rules:import --type pfs_rvu --year {year} --effective-from {from} --effective-to {to} --url {url} --file <the PPRRVU file of RVU{yy}{Q}>`
    and the same for `pfs_gpci`.
  - The `{yy}{Q}` tokens fill to the period's two-digit year and quarter letter.
  - Families with their own dates omit `--effective-from` and `--effective-to`.
  - `on_change` families have `importCommands: []`. Their records are hand-typed with `/new-rule-record`.

#### 5.8.2 The evaluation (pure, in `calendar.ts`)
```ts
export interface ContentState { readonly windows: readonly DateRange[]; readonly newestFrom: string | null; readonly newestRetrieved: string | null }
export type ContentStates = Readonly<Partial<Record<ContentId, ContentState>>>;
export interface DueSources {
  readonly releaseNo: number | null;             // the release the in-force states are of; null: none published
  readonly inForce: ContentStates;
  readonly pending?: ContentStates;              // drafts and prepared releases together (the workflow only)
}
export const DUE_STAGES = ['no_release', 'not_loaded', 'ended', 'ends_in_14', 'ends_in_45', 'no_draft', 'overdue', 'calendar_unreviewed', 'calendar_review_due'] as const;
export type DueStage = (typeof DUE_STAGES)[number];
export interface DueItem {
  readonly family: ContentFamilyId | null;       // null for no_release and calendar_unreviewed (aggregated)
  readonly stage: DueStage;
  readonly title: string;                        // stable from day to day: the issue's dedupe key
  readonly loadedThrough: string | null;
  readonly period: { readonly label: string; readonly from: string; readonly to: string } | null;
  readonly dueOn: string | null;
  readonly commands: readonly string[];
  readonly lines: readonly string[];             // the body's sentences, plain text
}
/** Throws RangeError on a today that is not a date. No clock, no I/O. */
export function contentDue(calendar: ContentCalendar, sources: DueSources, today: string): DueItem[];
/** Through what date a content is loaded on `today`: the end of the window holding today, else the latest end before today; open: null with open true. */
export function loadedThrough(state: ContentState | undefined, today: string): { readonly through: string | null; readonly open: boolean; readonly loaded: boolean };
export function familyLoadedThrough(entry: CalendarEntry, states: ContentStates, today: string): { readonly through: string | null; readonly open: boolean; readonly loaded: boolean };   // the earliest of its contents'
```

The rules, applied in this order, with integer day arithmetic:
1. **No release published** (`releaseNo === null`): one item, `no_release`. Then, when `pending` is given, rules 3 to
   5 run with `pending` as the state judged (the basis is **the drafts**), and with no `pending` beside it, so
   `no_draft` reads "the drafts hold no window for the period" (review M5: #59 lands before release 1, and release 1
   will likely not be published through the 2027 cycle, so judging nothing until then would leave the 2027 conversion
   factor, RVU, MPPR list and 2027-Q1 MUE unreported). Without `pending` (the console in production, which has no
   checkout), only `no_release` and the calendar's own findings. The titles say which basis was judged (rule 6).
2. **Calendar review:**
   - every entry with `review === null` is listed in one item `calendar_unreviewed`;
   - an entry whose `review.on` is more than 13 calendar months before `today` gives `calendar_review_due`.
3. For each family but the `on_change` ones: if any of its contents has no state in `inForce`, the family is
   `not_loaded`.
4. **Windowed families** (`ends === 'window'`). Let `t = familyLoadedThrough(...).through`, and `days = t − today`.
   - `ended` when `days < 0`;
   - `ends_in_14` when `0 ≤ days ≤ 14`;
   - `ends_in_45` when `15 ≤ days ≤ 45`.
   - `period` is the cadence period holding `dayAfter(t)`: its quarter for `quarterly`, its year for `annual`.
   - `dueOn = period.from − loadLeadDays`.
   - **`no_draft`** (only with `pending`): when `today ≥ dueOn`, unless every content of the family has a `pending`
     window that holds `period.from`. An item has one stage; `no_draft` wins over `ends_in_*` when both hold.
5. **Open families** (`ends === 'open'`, not `on_change`):
   - `P` is the latest cadence period start with `P − publicationLeadDays + graceDays ≤ today`.
   - `overdue` when the in-force `newestRetrieved` is null or before `P − publicationLeadDays`, and no `pending` state
     has a `newestRetrieved` on or after it.
   - When only `pending` has it: no item. The draft is on its way, and the workflow's open issue stays until it is
     closed by hand.
6. **Titles** (stable; no day counts in them). `${basis}` is `loaded content` when judged on a release, and
   `content in the drafts` when judged on the drafts (rule 1); the two never share a title, so an issue opened before
   release 1 is not mistaken for one about a published release:
   - `` `Content due: ${title}, ${basis} ends within 45 days (${t})` ``;
   - the same with "within 14 days";
   - `` `Content ended: ${title}, ${basis} ended on ${t}` ``;
   - `` `Content due: ${title}, ${period.label} has no draft (due ${dueOn})` ``;
   - `` `Content overdue: ${title}, ${periodLabel} files not loaded` ``, or `` `... files not in the drafts` `` on the
     drafts;
   - `` `Content not loaded: ${title}` ``, or `` `Content not in the drafts: ${title}` `` on the drafts;
   - `No rule release is published`;
   - `Content calendar: entries not reviewed`;
   - `` `Content calendar: ${title} due for review` ``.
7. **`commands`:** the entry's templates filled for `period`. `{year}` is the period's year; `{from}` and `{to}` its
   window, or the MPPR list's calendar year. Then two lines: `pnpm verify-content`, and
   `pnpm release:assemble <next release number>`.
8. **Period labels:** quarterly `2027-Q1`; annual `2027`; dates `2027-03-01 update`.

#### 5.8.3 The CLI (`tools/content-calendar/index.ts`, new; with `sources.ts`, `fetch.ts`, `render.ts` and tests)
```
pnpm exec tsx tools/content-calendar/index.ts --today YYYY-MM-DD --out <findings.json> --summary <summary.md> [--no-fetch]
```
- **The in-force state:** the newest `content/releases/<n>`'s `COVERAGE.md` `contents`, read with `readJsonBlock` and
  `releaseCoverageSchema`. No release directory gives `releaseNo: null`. This is **the newest published release** in
  the repository, which with #8 may not yet be the release production has loaded (review m4). So every body that
  names it says "the newest published release (<n>)", never "the release in force"; the runbook says that the
  console's Content due, and the later daily job, read the release in force in the database.
- **The pending state:** every `content/outgoing/<n>`'s `COVERAGE.md` `contents`, and the drafts summarised **file by
  file**: each `readRecordFile` result is fed to one `ContentSummaryBuilder` (5.1) and dropped before the next file is
  read, so the CLI never holds the drafts' records (review m8: the PTP drafts alone reach about 2 million records).
  Merged per content.
- **The source watch** (skipped with `--no-fetch`), for each entry with a `source.page`, through an injected
  `fetcher(url, { timeoutMs: 20_000 })`:
  - one retry after 5 s;
  - a non-2xx answer or a timeout is a finding `source_unreachable`:
    `` `Content source unreachable: ${title}` ``;
  - otherwise every `href="…"` (with `&amp;` decoded) is reduced to its file name (the last path segment,
    percent-decoded, query and fragment dropped). **Only names matching `^[A-Za-z0-9._-]{1,120}$` are kept**; any other
    is counted, never shown (review m6: a third-party page's names go into issue bodies on a public repository, where
    `@name`, `#123`, Markdown links or backticks would mention people, link issues or break the rendering). Those
    matching `filePattern` are compared:
    - with `knownFiles === null`, one finding `source_unrecorded`: `` `Content source files not recorded: ${title}` ``,
      listing up to 50 names seen;
    - otherwise one finding `source_changed` for names not in `knownFiles`: `` `Content source changed: ${title}` ``,
      listing them.
  - Names that left the page are not findings.
  - Every kept name is rendered in a code span (`` `RVU27A.zip` ``), one per line. A finding whose page held names
    that were not kept says "<k> link names were not shown because they hold characters other than letters, digits,
    dot, underscore and hyphen". A test feeds a page whose hrefs include `@founder.zip`, `x](https://example.com).zip`,
    `` a`b.zip `` and a 200-character name, and asserts none reaches a body.
  - The User-Agent is `PaidWhole content calendar`.
- **The findings file:** a JSON array of at most 20 `{ title, body }`, ordered by `DUE_STAGES` severity, then the
  source findings.
  - The body is Markdown, at most 6,000 characters (truncated with a final line saying so).
  - Every title is one line. The tool refuses to write a title with a newline.
- **The summary file:** the same findings as a list, for `$GITHUB_STEP_SUMMARY`.
- **Exit codes:**
  - 0 when it ran, with or without findings;
  - 1 when the calendar fails its schema, a `COVERAGE.md` cannot be read, or `--today` is not a date;
  - 2 for usage.

  Fail closed: an unreadable input never reads as "nothing due".
- **The body** (`render.ts`, exact structure):
  1. a one-line statement;
  2. "Loaded through", "Period" and "Due by" lines when known;
  3. "Source: <title> (<page>)";
  4. a fenced `sh` block with `commands`;
  5. "Runbook: docs/runbooks/content-updates.md";
  6. for an unreviewed entry, "These dates are not yet confirmed against the source page (the calendar entry has no
     review)".

  The bodies hold only calendar data, repository release numbers, public page addresses and file names seen on public
  pages. Nothing comes from a database or a person.

#### 5.8.4 The workflow (`.github/workflows/content-calendar.yml`, new)
```yaml
name: content-calendar
# The content calendar (audit #59; docs/adr/0071; docs/runbooks/content-updates.md): ...
on:
  schedule:
    - cron: '17 7 * * *'          # daily; schedules fire only from the default branch (F1 (a))
  workflow_dispatch: null
  push:
    branches: [claude/build-platform]
    paths: [packages/rules/src/calendar.ts, packages/rules/src/records.ts, tools/content-calendar/**, content/**, .github/workflows/content-calendar.yml]
  pull_request:
    paths: [packages/rules/src/calendar.ts, packages/rules/src/records.ts, tools/content-calendar/**, content/**, .github/workflows/content-calendar.yml]
permissions:
  contents: read
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}
jobs:
  check:
    runs-on: ubuntu-24.04
    timeout-minutes: 15
    outputs:
      findings: ${{ steps.calendar.outputs.findings }}
    steps:
      - uses: <actions/checkout line of ci.yml, byte for byte>   # with persist-credentials: false
      - uses: <pnpm/action-setup line of ci.yml>
      - uses: <actions/setup-node line of ci.yml>                 # node-version-file and cache as ci.yml's static job
      - run: pnpm install --frozen-lockfile
      - name: Read the calendar and the content
        id: calendar
        run: |
          set -euo pipefail
          pnpm exec tsx tools/content-calendar/index.ts --today "$(date -u +%F)" --out "$RUNNER_TEMP/findings.json" --summary "$RUNNER_TEMP/summary.md"
          cat "$RUNNER_TEMP/summary.md" >> "$GITHUB_STEP_SUMMARY"
          echo "findings=$(base64 -w0 "$RUNNER_TEMP/findings.json")" >> "$GITHUB_OUTPUT"
  notify:
    needs: check
    if: always() && github.event_name != 'pull_request'
    runs-on: ubuntu-24.04
    timeout-minutes: 5
    permissions:
      issues: write
    steps:
      - name: Open an issue for each finding not already open
        env:
          GH_TOKEN: ${{ github.token }}
          GH_REPO: ${{ github.repository }}
          CHECK_RESULT: ${{ needs.check.result }}
          FINDINGS_B64: ${{ needs.check.outputs.findings }}
          RUN_URL: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}
        run: |
          set -euo pipefail
          gh label create content-due --description "Rule content due (audit #59)" --color FBCA04 2>/dev/null || true
          gh issue list --label content-due --state open --limit 200 --json title --jq '.[].title' > open-titles.txt
          if [ "$CHECK_RESULT" != "success" ]; then
            printf '%s\n' "Content calendar check failing" > title.txt
            printf 'The content calendar check did not finish on %s at %s: %s\n' "$GITHUB_REF_NAME" "$GITHUB_SHA" "$RUN_URL" > body.md
            grep -Fxq -f title.txt open-titles.txt || gh issue create --title "$(cat title.txt)" --label content-due --body-file body.md
            exit 0
          fi
          printf '%s' "$FINDINGS_B64" | base64 -d > findings.json
          count=$(jq length findings.json)
          for i in $(seq 0 $((count - 1))); do
            jq -r --argjson i "$i" '.[$i].title' findings.json > title.txt
            jq -r --argjson i "$i" '.[$i].body' findings.json > body.md
            printf '\n\nOpened by the content-calendar workflow: %s\n' "$RUN_URL" >> body.md
            grep -Fxq -f title.txt open-titles.txt || gh issue create --title "$(cat title.txt)" --label content-due --body-file body.md
          done
```
- **No secrets:** the only token is the job's own `GITHUB_TOKEN`, with `issues: write` in `notify` alone.
- **No `${{ }}` inside any `run:` block.** Every value reaches the shell through `env:`.
- **`notify` checks nothing out and runs no repository code.**
- **The `uses:` lines are copied from `ci.yml` at the branch's base,** byte for byte (40-hex SHA and version comment).
  If ci-deps merges first, the merger takes ci-deps' lines (section 8).
- **Not a required check,** so it is not in `REQUIRED_CHECKS` (`tools/required-checks.ts:18-27`).
- **Issues are deduplicated by exact title.** A finding whose issue was closed but which still holds opens a new issue
  on the next run. That is wanted: the content is still due.

**Tested by policy (`tools/test/workflows.test.ts`):**
- the CI-10 timeout table gains `'content-calendar.yml': { check: 15, notify: 5 }` and
  `'release-capacity.yml': { capacity: 180, notify: 5 }`;
- every job runs on `ubuntu-24.04`;
- the concurrency group starts with the workflow's name;
- no `continue-on-error`;
- the pins follow `PINNED`'s rule. Both files are added to `PINNED`, or to ci-deps' all-workflows rule if it has
  merged.
- **New assertions for `content-calendar.yml`:**
  - the workflow's permissions are `contents: read`;
  - only `notify` has a `permissions` block, and it is exactly `{ issues: 'write' }`;
  - `notify` has no `uses:` step;
  - no `run:` of `notify` contains `${{`;
  - `check` has no `permissions` block;
  - the `on:` keys are `schedule`, `workflow_dispatch`, `push` and `pull_request`, and `push.branches` is
    `[claude/build-platform]`.
- The same three `notify` assertions hold for `release-capacity.yml`.
- `actionlint .github/workflows/*.yml` passes (`docs/runbooks/ci.md:168`).

#### 5.8.5 The console: "Content due" (`apps/web/src/lib/routes/rule-releases.ts`, `apps/web/src/app/console/rule-releases/page.tsx`)
- `RuleReleasesPageData` gains
  `contentDue: { readonly releaseNo: number | null; readonly items: readonly DueItem[]; readonly families: readonly { family; title; loadedThrough; open }[] }`.
- The handler computes it from:
  - the release in force's `releaseContentWindows` (5.9);
  - `CONTENT_CALENDAR`;
  - `services.now()`'s UTC date;
  - with a checkout (`services.contentRoot`), the drafts' and prepared releases' states as `pending`, read as the CLI
    reads them. The shared code is `tools/content-calendar/sources.ts`, exported as `@tp/tools/content-calendar` by
    a new `exports` entry in `tools/package.json`. The route already imports `@tp/tools/workspace` the same way.
    `tools/package.json` is not a #42 file and is not on the watched list.
- The page renders a section "Content due" above the release list:
  - a table, one row per family: title, loaded through, stage;
  - the items' commands in a `<pre>` (mono);
  - an empty state "Nothing is due."
- No new route, so `routes/index.ts`, `registry.test.ts` and `shell.tsx` (all #42) are untouched.

#### 5.8.6 The customer: loaded-through dates and the banner
- **`apps/web/src/lib/routes/releases.ts`:** `ReleasesPageData` gains
  `loadedThrough: readonly { family; title; through: string | null; open: boolean }[]`, for the release in force, from
  `familyLoadedThrough` over its windows. The `on_change` families are left out.
- **`apps/web/src/app/p/[practiceId]/releases/page.tsx`:** a card "What this release covers" lists each family as
  "<title>: loaded through <date>", or "<title>: in force, no end date", for open families.
- **The Coverage banner** is the fee-schedule sentence of 5.6.6. #7's sentence and #59's banner are one computation
  and one string, shown once.

#### 5.8.7 The runbook (`docs/runbooks/content-updates.md`, new)
Sections:
1. What the calendar is and where it lives.
2. **The calendar table**, between `<!-- content-calendar -->` markers, held equal to `CONTENT_CALENDAR` by
   `tools/content-calendar/runbook.test.ts`. The `tools/required-checks.ts` marker precedent applies.
3. **Target time to load** (a service level, the decision recorded in section 10.3):
   - a period's content is in a published release `loadLeadDays` (14) days before the period starts, when the source
     publishes at least 21 days ahead;
   - otherwise within 3 business days of publication.
4. **When an issue opens:** the stages and what to do for each; the commands; the README's "Coverage" section.
5. **How to review an entry:** check its dates against the source page, set `review` and `knownFiles` in a pull
   request.
6. What the console and the customer pages show. The console's Content due, the customer pages and (later) the
   daily job read **the release in force** in the database; the workflow's issues read **the newest published
   release** in the repository, or the drafts before release 1 (5.8.2 rule 1), and say so in their titles and bodies.
7. **A correction inside a quarter** and **content that runs out**: the README's procedures, linked, not copied.
8. **What is still to come in the later PR:** the daily job and its alarms.

It links to Lane A's content-release runbook, which does not exist yet (PRD 19 `:787`, #8), and does not duplicate it.

### 5.9 The per-content windows the web reads (one computation)
- `releaseContentWindows` (5.6.1):
  ```sql
  SELECT CASE WHEN record_type = 'mppr_rate' AND key ? 'hcpcs' THEN 'mppr_code'
              WHEN record_type = 'mppr_rate' AND key ? 'component' THEN 'mppr_general'
              ELSE record_type END AS content,          -- rule_release_content_span()'s split, 20261105090000:1031-1033
         count(*)::int AS records,
         range_agg(daterange(effective_from, effective_to, '[]'))::text AS loaded,
         max(effective_from)::text AS newest_from,
         max(source ->> 'retrieved') AS newest_retrieved
    FROM rule_record
   WHERE release_no = $1 AND ($2::text[] IS NULL OR record_type = ANY ($2::text[]))
   GROUP BY 1 ORDER BY 1
  ```
  - It is parsed with `parseDateMultirange`.
  - A db test holds its `mppr_code`, `mppr_general` and `ncci_mue` rows equal to `rule_release_content_span()`'s.
- **New `apps/web/src/lib/releases/content-through.ts`:**
  - `contentWindowsOf(client, releaseNo, manifestSha256)` caches per `(release_no, manifest_sha256)`, at most 8
    entries, as `apps/web/src/lib/screening/content-span.ts:20-46` does. That file is #42's and is not edited.
  - The whole-release aggregate scans the release once per web process per release. The cache is what keeps it off
    every page view. The first request after a deploy or a new release in force pays it, on the 1 GiB web task
    (review m5). Its memory in the web is the aggregate's few dozen rows; its cost is Postgres time.
  - **Measured weekly** (5.10, step 8): the release-capacity harness runs `releaseContentWindows` on 900110 (about 4.2
    million records, the most a release holds under #30's look-back) at production's database class, cold and warm,
    and records both times and the statement's buffers. The budget is 5 s cold. Like every time in that test it is
    advisory (the founder's ruling for the screening test, `reconciliation-001.md:605`): a time above the budget is a
    headed line in the run's summary and in the notify issue's body, not a failure.
  - The lasting fix is stored per-content windows written when a release is loaded, with #8's stored release counts
    (section 2.3, proposal to Lane A). The web would then read a few rows, never aggregate a release.
  - It also exports `contentSpansOf(...)`, the cached `releaseContentSpans`, for the Coverage card.
- **Users:** the console's Content due, the Releases page, Coverage's fee-schedule sentence (the `pfs_rvu` windows) and
  Coverage's waiting card (spans).

### 5.10 The weekly real-size test (`tools/release-capacity/`, `.github/workflows/release-capacity.yml`)
- **`tools/release-capacity/run.ts`** (new), with `scenario.ts`, `checks.ts` and their unit tests. It reuses
  `tools/screening-capacity/{containers,limits,env,load,measure}.ts`, which are not #42 files.
- **Added to `containers.ts`:** `ServiceName` gains `'worker'`, and `SERVICE_COMMANDS.worker` is production's worker
  command as it is today, `['node', '--enable-source-maps', 'dist/main.js']` (`infra/lib/constructs/compute.ts:33`,
  with no heap flag yet). **`containers.ts` gains no import** (review B1: it is in the closure through
  `tools/screening-capacity/run.ts`, and an import of `infra/lib/heap.ts` there would add that file to the #42 watched
  list).
- **`tools/release-capacity/run.ts` builds the worker's `ServiceSpec`** itself: `command` is
  `withHeapFlag(serviceCommand('worker'), heapFlag('worker'))`, the flag inserted after `node` (a pure helper in
  `tools/release-capacity/scenario.ts`, unit-tested). `Runtime.startService` takes the command from the spec
  (`containers.ts:124-131`) and starts the worker image for every name but `web` (`:419-421`), so nothing else in
  screening-capacity changes.
- **Added to `env.ts`:** `workerEnv(...)`, with `WORKER_JOBS=practice` and the app login, as production's worker task
  holds them. Each addition is a new export; nothing existing changes.
- **The quarterly scale release, 900110** (review M6): `packages/synth/src/release/scale.ts` gains an optional
  `windows?: 'year' | 'quarter'` in `ScaleReleaseShape` (absent means `'year'`, so 900100 and every existing shape
  render byte-identical, held by the existing scale tests), `QUARTERLY_SCALE_RELEASE_SHAPE` and
  `QUARTERLY_SCALE_RELEASE_NUMBER = 900_110`; `tools/release/scale.ts` gains `--shape quarterly`. Both files are
  already in the closure (edits, no new file), so the screening-capacity gate measures this PR, as 5.0 says.
  - The shape is `SCALE_RELEASE_SHAPE`'s counts with `years: [2020, ..., 2026]` (seven: the six-year look-back's
    cutoff year 2020 to the current year, `lookBackCutoff('2026-12-31')` = 2020-01-01) and `windows: 'quarter'`.
  - With `'quarter'`, each year's PPRRVU, GPCI, ZIP5, ZIP9 and MUE files are four files, one per CMS quarter, each
    windowed to its quarter, ZIP lines stating that quarter's YYYYQ; the 2% corrected codes are split inside the
    correction day's quarter (Q2: the original file to 05-15, the correction from 05-16, as R1 allows); the MPPR
    list and conversion factors stay per calendar year; PTP and the code lists are unchanged.
  - The counts' basis, recorded in the shape's comment: RVU 19,000 x 28 quarters (532,000, plus 2,660 corrections),
    MUE 15,000 x 28 (420,000), ZIP5 42,000 x 28 (1,176,000), ZIP9 about 1,273 split ZIPs x 28 (about 35,600 records,
    each as long as 900100's), GPCI 109 x 28 (3,052), PTP 2,000,000: about 4.17 million records against 900100's about
    2.25 million.
  - 900110 is built outside the repository only, never committed.

**The flow:**
1. Build the images as screening-capacity's workflow builds them. The steps are copied from `screening-capacity.yml`.
2. Build release 900110 outside the repository: `tsx tools/release/scale.ts --shape quarterly --out "$RUNNER_TEMP/release"`.
3. Start Postgres at production's database class and storage limits (`productionLimits()`), migrate, and load 900110
   with `tools/screening-capacity/load.ts`.
4. **Seed three synthetic practices as the owner** (`scenario.ts`; the bulk-insert shape of
   `apps/worker/src/price/price.large.db.test.ts:22-60`):
   - **A**, the measured month: 100,000 lines in claims of 1 to 6 lines, with codes drawn from the scale release's
     first 400 codes (therapy codes weighted to half); every claim's lines on one or two dates, so the claims hold
     same-date pairs; dates spread over 2026-Q1 to Q4, so the keyed read fetches several quarters per code; half the
     plans mapped Medicare Advantage non-contracted (every flag on), half under a SYNTHETIC contract at 110% of
     Medicare; a location whose ZIP is in the scale release.
   - **B**, a 20,000-line month of the same shape, priced and triaged during setup, before the measurement, with an
     `audit_report` row created as the report action creates it.
   - **C**, with four SYNTHETIC 835 documents of 2,000 claims each, written by `packages/synth`'s 835 writer into the
     worker's local document store (`DOCUMENTS_DIR`, `tools/screening-capacity/env.ts:243`) with their `document`
     rows, as the e2e journeys store uploads.

   Every identifier carries SYNTHETIC, and no row comes from a customer file. If B's report row or C's documents
   cannot be created through the code the web and the intake use, the builder stops and asks; the harness never
   writes rows the product could not.
5. **Start the worker container** at the worker task's limits (`taskLimit(compute.worker)`: 0.5 vCPU and 1,024 MiB,
   no swap). It runs production's command with `heapFlag('worker')` (above), and so, as production does, every job
   type's loop at once (`apps/worker/src/worker.ts:223-231`), `parse_835` four at a time (`PARSE_CONCURRENCY`,
   `apps/worker/src/jobs/registry.ts:147`).
6. **The concurrent phase**, queued within one second: A's run, created as the billing manager (its `price` job);
   B's `audit_report` job (a PDF printed by Chromium in the same container); C's four `parse_835` jobs. Then wait
   for all six to finish.
7. **The chain:** A's triage job, then A's audit-report job. Each wait is up to 45 minutes. The whole job's timeout
   is 180 minutes (the larger release takes longer to build and load).
8. **The web's windows query:** `releaseContentWindows(900110)` cold (after `restartPostgres()`) and warm, timed, with
   its `EXPLAIN (ANALYZE, BUFFERS)` (5.9; advisory budget 5 s cold).
9. **Read back:**
   - every job's state;
   - the run's status and failure code;
   - `priced_line` count = 100,000 for A, and C's parsed claims = 8,000;
   - the container's `memory.peak` over the whole run and over the concurrent phase alone (`memory.peak` is reset by
     writing to it before step 6 where the kernel allows, else read as the phase's maximum of `memory.current`
     sampled every second), and OOM kills (`measure.ts`);
   - the worker log's error lines.

**It fails on:**
- any job not finished as complete (the concurrent phase's six included);
- the run not complete;
- any line count other than 100,000, or C's claims other than 8,000;
- an OOM kill or a container restart;
- `memory.peak` above 90% of the limit (921 MiB);
- a log line with `error_code` `RELEASE_READ_OUTSIDE_FETCH` or `JOB_FAILED`;
- any check that cannot be read (fail closed).

Times are recorded and advisory, as the founder ruled for the screening test (2026-10-23, `reconciliation-001.md:605`).
The output is `release-capacity.json` and `summary.md`, uploaded as an artifact.

**The workflow:**
- `schedule: '29 3 * * 2'` (weekly) and `workflow_dispatch: null`.
- `permissions: contents: read`; concurrency `release-capacity-${{ github.sha }}`.
- `capacity` job: timeout 180.
- `notify` job: `if: failure() && github.event_name != 'pull_request'`, `issues: write`, no checkout. It opens or
  comments on the issue "Release capacity test failing" (label `release-capacity`), the screening-capacity notify job's
  script with its names changed.
- Not a required check. The schedule fires only from the default branch (F1 (a)). Until then, it runs on dispatch
  from the default branch, and the builder runs it locally once, in the fix round (section 9).

**Evidence for the PR:**
- the harness run on the head;
- the same harness pointed at the base's worker image, expected to fail by OOM or by `memory.peak`.

The second is recorded in the PR description as the measured "before", and is not a test.

### 5.11 Every new visible string (wording taken; brand.md and CO-11 apply)

Every money figure is `<Money>` (mono, tabular). Codes are in mono. Nothing uses color alone.

| Where | String |
|---|---|
| `FAILURE_TEXT.waiting_on_content_mue` | `A line of the period needs Medicare’s unit limits (MUE) for dates PaidWhole has not loaded yet, so no line was kept. The month is priced by itself once that content is loaded.` |
| `FAILURE_TEXT.waiting_on_content_mppr` | `A line of the period needs Medicare’s multiple-procedure reduction list (MPPR) for dates PaidWhole has not loaded yet, so no line was kept. The month is priced by itself once that content is loaded.` |
| `FAILURE_TEXT.waiting_on_content_mppr_mue` | `Lines of the period need Medicare’s multiple-procedure reduction list (MPPR) and unit limits (MUE) for dates PaidWhole has not loaded yet, so no line was kept. The month is priced by itself once that content is loaded.` |
| `FAILURE_TEXT.release_read_outside_fetch` | `The price job read rule content it had not fetched, so no line was kept and the operator was alerted; create a new run once it is fixed.` |
| Coverage card title (`aria-label` "Months waiting on Medicare content") | `Months waiting on Medicare content: <Money> billed` |
| Coverage card description | `<n> lines in months whose terms apply Medicare’s multiple-procedure reduction or unit limits on dates PaidWhole has not loaded that content for yet. They are priced by themselves once it is loaded; nothing is priced without it.` |
| Coverage card rows (`MonthsWaitingOnContent`) | Columns `Month`, `Waiting on`, `Lines`, `Billed`. "Waiting on" is `the <2027-Q1> Medicare content (MPPR, MUE)`, with only the families of the code, comma-separated. For `repricing`: `being priced again under release <n>`. For `terms_changed`: `being priced again under the practice’s changed terms` |
| Coverage, below the reason table, per period | `PaidWhole has not loaded the <2026-Q4> Medicare fee schedule yet. <n> lines (<Money> billed) are unpriced until it is; once it is loaded, Pricing runs offers to price their months again.` The period is the quarter (`2026-Q4`) for terms priced on the date of service, and the year (`2027`) for terms locked to a year |
| Report `REASON_TEXT.CONTENT_NOT_LOADED` | `Priced before PaidWhole loaded the Medicare content for its date (MPPR or MUE): held until it is priced again` |
| Releases page card title | `What this release covers` |
| Releases page rows | `<title>: loaded through <date>` / `<title>: in force, no end date` |
| Console section title | `Content due` |
| Console table headings | `Content`, `Loaded through`, `Status` |
| Console stages (Status cell) | `ends within 45 days` / `ends within 14 days` / `ended <date>` / `<period> has no draft (due <date>)` / `<period> files not loaded` / `not loaded` / `calendar entry not reviewed` / `calendar entry due for review` / `—` when nothing is due |
| Console empty state | `Nothing is due.` |
| Console, no release | `No rule release is published.` |
| Importer, checker and assembler messages | sections 5.2 to 5.5 (operator-facing; the assembler's are shown on the console through `prepareRuleReleaseAction`) |
| Issue titles and bodies | section 5.8.2 item 6 and 5.8.3 |

- `lint:copy` reads `apps/web/src` and `apps/worker/src/report`.
- `tools/brand-copy/scan.ts` `COPY_FILES` (`:69-77`) gains:
  - `apps/worker/src/price/release.ts`, so the lint reads any sentence placed there;
  - `packages/rules/src/calendar.ts`, for the family titles, which customers see.
- None of these strings says "recovered", "owed", "underpaid", "AI" or "intelligence".

### 5.12 Log lines (only fields already in `packages/observability/src/fields.ts`)

| Where | Level | `msg` (fixed) | Fields |
|---|---|---|---|
| `execute.ts`, a read outside the fetch | error | `pricing run read rule content outside the keys it fetched` | `pricing_run_id`, `error_code: 'RELEASE_READ_OUTSIDE_FETCH'` |
| `execute.ts`, the content alert (once per run: a run refused `waiting_on_content_*`, or a complete run with loud lines) | warn | `pricing run found lines stopped by rule content not loaded for their dates` | `pricing_run_id`, `error_code: 'CONTENT_NOT_LOADED'`, `record_count` |
| `monitor/job.ts` | warn | `monitoring left months waiting on rule content PaidWhole has not loaded` | `release_no`, `error_code: 'WAITING_ON_CONTENT'`, `record_count` |

No record type, quarter, code or name is logged. `lint:logs` passes.

## 6. Tests

### 6.1 Test-matrix rows (`docs/product/test-matrix.md`, a new section at the end, after CI)

The intro paragraph, word for word:

> ## Release content checks (RCC)
>
> The release content checks of combined audit items #7, #30, #31 and #59 (docs/adr/0071; Lane B, LANES queue item
> 14): what the importer, the content checker and the assembler refuse, what a pricing run does when the Medicare
> content its lines read is not loaded, how runs read a release by key, and what the content calendar reports. RCC-01
> to RCC-08 are Lane B's reservation. The rows of the later pull request after #42 (the content alarm, the heap flags
> and the daily content job) take numbers it reserves.

| ID | Case | Assertion |
| --- | --- | --- |
| RCC-01 | A quarterly file imported | PPRRVU, GPCI, ZIP5, ZIP9 and MUE import only with a window inside the CMS quarter the file states, read from its title lines, its name or its download address; a whole quarter and a correction's two parts of one are accepted; no window, a window leaving the quarter, another year, a start other than a stated effective day, no stated quarter or two stated quarters are refused before anything is written; an undated file's open window and an MPPR window leaving its year are refused; a ZIP5 line of another quarter is refused |
| RCC-02 | A release's windows and contents | In real content, whatever the record's source method, a quarterly record's window lies inside one CMS quarter, a ZIP record's quoted lines state that quarter, a per-code MPPR window ends inside its year, no quarterly or per-code MPPR record is hand-typed and one file's records share one window; no content has a gap inside its loaded dates; every prepared release holds a COVERAGE.md whose contents equal its records'; fixtures 900001 to 900007 pass |
| RCC-03 | A release covers less than the one before | Assembly and the checker refuse a release that stops covering a code and date its previous release covered, unless the dates are older than the six-year look-back or closed by the source's own dates (each listed in COVERAGE.md) or withdrawn by a note two different people signed; a listed entry that is no loss, a stale or misdated note, and a missing or unreadable previous release are refused; the drafts note's entries are copied into the release's COVERAGE.md and the note is removed |
| RCC-04 | A month that needs Medicare content not loaded | Under release 900007 a Medicare Advantage month after 2026-09-30 fails as waiting_on_content naming exactly the MPPR and MUE families read, with no line kept and one content alert logged; a commercial fixed-fee month and a 2026-Q3 month price; over the whole run, a read outside the fetch outranks the location and the location outranks content |
| RCC-05 | The month waits, then prices | The monitor starts no daily run while the release in force covers no more of the month and the practice's terms are unchanged, and plans it once either changes; Coverage shows the month, its quarter, families, lines and billed dollars, and each fee-schedule quarter or locked year not loaded; a complete run with lines stopped by unloaded content logs one content alert |
| RCC-06 | A line priced before its content loaded | Triage holds a priced line whose trace read MPPR or MUE outside its release's spans as CONTENT_NOT_LOADED, never actionable; the audit report names the reason |
| RCC-07 | A run reads only the keys it prices | The price job, the release impact check and the dry run read each key of their claims once a run and the shared types once per release; every stored row equals the whole-release read's; a lookup outside the fetch fails the run as release_read_outside_fetch before its batch is stored; triage and reports read two types only; the keyed read uses rule_record_identity; weekly, under the quarterly scale release 900110, a 100,000-line month prices while another practice's audit report prints and four 835s parse, then triages and reports, within the worker task's memory |
| RCC-08 | Content due | The calendar names every content but PaidWhole's own; content ending within 45 or 14 days, ended, due with no draft, or overdue is reported with the exact import commands, as is a calendar entry never reviewed or older than 13 months; before any release is published the drafts are judged and the titles say so; the console shows Content due, customers see each family's loaded-through date; the workflow's check job only reads and its notify job alone writes issues, once per title, showing only plain file names from source pages |

`packages/synth/src/cases/matrix.ts` takes the same rows word for word, after CI-17 (`matrix.ts:292`).

### 6.2 Registry, module and fixtures (`packages/synth`)
- `packages/synth/src/expected/types.ts:9`: `CASE_MODULES` gains `'RCC'`.
- `packages/synth/src/cases/common.ts:18`: `MODULE_NUMBER` gains `RCC: 14` (DBF holds 13 on its branch).
- `packages/synth/src/cases/registry.ts`: a comment line ("The release content checks (docs/adr/0071).") and eight
  `none(...)` entries. No case writes an 835: each builds its data in the test.

| ID | completesIn | reason | assertedBy |
|---|---|---|---|
| RCC-01 | 0 | `The files are written to a temporary root by the test; no file.` | `packages/rules/src/import.test.ts`, `packages/rules/src/parsers/parsers.test.ts` |
| RCC-02 | 0 | `The content sets are written to temporary roots, and the fixture releases are read; no file.` | `tools/verify-content/check.test.ts`, `packages/rules/src/coverage.test.ts`, `tools/release/release.test.ts` |
| RCC-03 | 0 | `Two numbered releases are written to a temporary root; no file.` | `tools/verify-content/check.test.ts`, `tools/release/release.test.ts`, `packages/rules/src/coverage.test.ts` |
| RCC-04 | 7 | `The month is seeded in a scratch database under release 900007; no file.` | `apps/worker/src/price/content.db.test.ts`, `apps/worker/src/price/content.test.ts` |
| RCC-05 | 7 | `The months are seeded in a scratch database; no file.` | `apps/worker/src/monitor/monitor.db.test.ts`, `apps/web/src/lib/pricing/content.db.test.ts`, `apps/worker/src/price/content.db.test.ts` |
| RCC-06 | 7 | `The priced lines are seeded in a scratch database; no file.` | `packages/triage/src/actionable.test.ts`, `apps/worker/src/triage/triage.db.test.ts`, `apps/worker/src/report/report.test.ts` |
| RCC-07 | 7 | `The runs are seeded in a scratch database; the weekly run builds release 900110 outside the repository; no file.` | `apps/worker/src/price/keyed-release.test.ts`, `apps/worker/src/price/release-source.db.test.ts`, `tools/release-capacity/checks.test.ts`, `tools/test/workflows.test.ts` |
| RCC-08 | 0 | `The calendar is module data and the sources are written to a temporary root; no file.` | `packages/rules/src/calendar.test.ts`, `tools/content-calendar/content-calendar.test.ts`, `apps/web/src/lib/routes/console-routes.db.test.ts`, `apps/web/src/lib/releases/content-through.db.test.ts`, `tools/test/workflows.test.ts` |

- Then `pnpm synth --all` writes `fixtures/synthetic/RCC-01/expected.json` to `RCC-08/expected.json`, in the shape of
  `fixtures/synthetic/CI-01/expected.json`. They are committed. CI's fixture-diff check (`ci.yml:117`) holds them.
- `completesIn` of 0 is for the content pipeline (PRD 9: global content is milestone 0's). 7 is for pricing and
  monitoring (`reconciliation-001.md:16`).

### 6.3 Unit and property tests, per part

**#30, `packages/rules`:**
- `import.test.ts`:
  - I1 to I8, each with its exact message, and nothing written under `content/` after a refusal;
  - each quarterly type accepted with its exact quarter window;
  - a correction accepted: an RVU file for 2026-04-01 to 2026-05-15 and its corrected file, stating
    "Effective 05/16/2026", for 2026-05-16 to 2026-06-30; the same corrected file with `--effective-from 2026-05-01`
    refused (I7);
  - `GPCI2026.csv` with `--url https://example.invalid/files/zip/rvu26d.zip` accepted for 2026-Q4, and refused for
    2026-Q3 (I5); a file name and a URL stating different quarters refused (I3);
  - "Eff 10-01-2026" and "Effective 10/01/2026" in a title line read as 2026-Q4;
  - the existing "applies the effective window options" (`:170`) keeps its assertions, with a quarter window if its
    type is quarterly.
- `parsers/parsers.test.ts`: Z1 and Z2; 80-character ZIP5 lines elsewhere.
- **New `coverage.test.ts`:**
  - `mergeRanges` and `subtractRanges`: examples, plus fast-check properties (merge is idempotent and
    order-independent; `a − b` and `b` are disjoint, and their union is `a ∪ b`'s part in `a`);
  - `contentGaps`: examples and a property (a gap is never inside any window);
  - `coverageRegression`:
    - a quarter dropped;
    - an identity dropped;
    - a loss across the cutoff, split;
    - a PTP pair closed by its deletion date;
    - a PTP pair closed with a different start, unexplained;
    - an RVU code closed, unexplained;
    - an open hand-typed record closed and continued by its successor, no loss;
  - `lookBackCutoff` on 2026-10-26 is 2020-01-01;
  - `renderCoverageFile` / `readJsonBlock` round-trip; zero blocks and two blocks are problems;
  - the 2,000,000-identity map test (5.1).
- `schema.test.ts`: `exactCmsQuarter` and `windowQuarter` for every quarter boundary, a leap-year Q1, windows off by one
  day, a correction's two parts and a window across two quarters; `insideOneYear`; `quarterWindowProblem`'s four answers.

**#30, `tools/verify-content/check.test.ts`:**
- one test per C1 to C16, D1 and D2, in temp roots as `:264-363` builds them;
- the bypass of review M2: a real set with one hand-typed `ncci_mue` record windowed 2026-01-01 to 2026-12-31 beside
  parsed quarter records (C1 and C15), a hand-typed per-code `mppr_rate` record with an open window (C2 and C15), and a
  parsed MUE record whose window was edited to differ from its file's other records (C16); each refused, and
  `rule_release_content_span()` over the same records shown wider than the quarters (a db test in
  `apps/worker/src/price/content.db.test.ts`), which is why the refusal matters;
- the hand-typed general MPPR rate, open, still passes (the real drafts' record);
- "passes the synthetic fixture release" (`:371-373`) still green, plus the same for 900002 to 900007;
- "this repository" (`:365`) still green.

**#30, `tools/release/release.test.ts`:**
- A4 to A9;
- `COVERAGE.md`'s exact text for a first release and for a second release with one loss of each kind;
- the drafts note consumed after success and kept after a failure;
- `RELEASE.md`'s coverage section;
- `releaseNotes` without `coverage` byte-identical (the fixture pairs at `:439-451`);
- 900007's render pair, and its "only two windows changed" test.

**#7, worker:**
- **New `apps/worker/src/price/content.test.ts`:**
  - `contentReads` over hand-built traces: MUE checked; an `mppr` entry in and out of the pool; a general record; a
    `no_mppr_rate` stop; a fixed fee with `apply_mppr` on (`mppr_needs_fee_schedule`), which reads nothing; a cleared
    day, which reads nothing;
  - `contentGapsOf` at span edges (the last day in, the first day out, open spans);
  - `contentFailureCode` for every non-empty set, and a throw on the empty set;
  - `coveredDays`;
  - `isLoudContentGap` for each detail of 5.6.5, inside and outside its window; for CURRENT terms, a service date in a
    missing quarter of a partly loaded year (loud) and a loaded date whose code has no RVU (not loud); for LOCKED terms,
    a basis year loaded and not loaded.
- **New `apps/worker/src/price/content.db.test.ts`**, with `PricingWorld` loading 900007:
  - an MA month 2026-10 fails `waiting_on_content_mppr_mue`, with zero `priced_line` rows;
  - an MA month whose terms set `apply_ncci` only fails `waiting_on_content_mue`;
  - a commercial fixed-fee 2026-10 month completes;
  - an MA 2026-09 month completes;
  - a month with both a location stop and a content gap fails `location_not_ready`;
  - a forced read outside the fetch fails `release_read_outside_fetch` with the error log, before anything is stored,
    even when the location also stops, and also when the violating claim is in a later batch than the first location
    stop (`claimsPerBatch: 1`; review m1);
  - a refused `waiting_on_content_*` run logs exactly one `CONTENT_NOT_LOADED` line with its `record_count`, created
    by a person (`createPricingRun` directly), not only by the monitor (review M4);
  - one content alert line for a run with a `no_gpci` line dated outside the GPCI windows, and none without;
  - the engine-error log unchanged;
  - `releaseContentWindows`' three span contents equal `rule_release_content_span()`'s.
- **`apps/worker/src/monitor/monitor.db.test.ts`:**
  - a waiting month plans no run on a second trigger;
  - a newer release in force that covers no more of the month leaves it waiting (900007's records loaded under the
    scratch number 900097, as `price.db.test.ts:670` loads 900099);
  - withdrawing 900007, which puts 900001 in force (it covers Q4), plans the month, and it completes;
  - a newer line plans it again;
  - a contract version signed off after the failed run plans it again, and so does a plan remapped to a commercial
    contract with the flags off, which then completes (review m2);
  - the job's `WAITING_ON_CONTENT` log line.

**#7, web:**
- **New `apps/web/src/lib/pricing/content.db.test.ts`:** `monthsWaitingOnContent` totals, quarters, families and the
  `repricing` and `terms_changed` kinds; `feeSchedulePeriodsNotLoaded` (5.6.6's cases).
- The Coverage route's generated route test still passes, with its sample data.

**#7, triage and report:**
- `packages/triage/src/actionable.test.ts`: `CONTENT_NOT_LOADED` alone, and with the other reasons in list order.
- `packages/triage/src/index.test.ts`: as `NCCI_REVIEW`'s tests are.
- `apps/worker/src/triage/triage.db.test.ts`: a line priced before 900007's gap is held.
- `apps/worker/src/report/report.test.ts`: the reason's words.

**#31:**
- **`apps/worker/src/price/keyed-release.test.ts`:** a fast-check property. For random claims (1 to 8 lines, codes
  from a small alphabet, 1 to 3 dates), pricing through a `memoryReleaseSource` over `testRelease(900001)` with
  `claimsRequestedKeys` never sets `violation`, and its results equal pricing through the plain index.
- **New `apps/worker/src/price/release-source.db.test.ts`:**
  - over the price-job fixtures of `price.db.test.ts`, a run's stored rows (traces included) are byte-equal whether
    executed through `storedReleaseSource` or through a test-only shim that serves `loadRuleRelease`'s whole index
    (the oracle);
  - the shared types are read once per release across two runs;
  - each key is fetched once per run, counted with a client wrapper;
  - the plan test: `auto_explain` of the keyed statement shows `rule_record_identity`, and no Seq Scan, Bitmap Heap
    Scan, Hash Join or Merge Join on `rule_record`. This is the precedent of
    `packages/db/src/screening-queue.db.test.ts:687-725`, in a new file, since that one is #42's;
  - the shared-type statement uses `rule_record_by_type`;
  - `typedRelease` throws `ReleaseTypeNotRead` on a third type;
  - `runReleaseImpact` equals its old counts on the existing impact fixtures;
  - `diff.ts`'s existing tests pass unchanged.
- **`infra/test/heap.test.ts`:** 5.7.3.
- **`tools/release-capacity/checks.test.ts`:** the fail conditions of 5.10 over synthetic measurement inputs (each
  one fails alone, and an unreadable input fails), the concurrent phase's jobs included.
- **`tools/release-capacity/scenario.test.ts`:** `withHeapFlag` puts the flag after `node`; the three practices'
  shapes; every identifier SYNTHETIC.
- **`packages/synth/src/release/scale.test.ts`** (existing file, added cases): the shape without `windows` renders
  as today (900100 byte-identical); the quarterly shape's per-quarter files, ZIP YYYYQ fields and Q2 correction
  split, at `SMALL_SCALE_RELEASE_SHAPE` size with `windows: 'quarter'`; its records pass the checker's C1 to C3 and
  C16 (synthetic sets are exempt, so the test calls the rules directly).
- **The watched list (review B1):** `tools/screening-capacity/watched.test.ts` passes unchanged, and
  `pnpm exec tsx tools/screening-capacity/watched.ts` prints the committed list; WP9's handover includes both.

**#59:**
- **New `packages/rules/src/calendar.test.ts`:**
  - the schema, and `CONTENT_CALENDAR` parsing;
  - every `CONTENT_IDS` entry but `denial_category` in exactly one entry;
  - stage boundaries at 46, 45, 15, 14, 0 and −1 days;
  - `no_draft` at `dueOn − 1` and `dueOn`;
  - `overdue`;
  - `not_loaded` and `no_release`;
  - no release, the drafts as the state (review M5): with today 2026-12-10 and drafts whose RVU, GPCI and MUE windows
    end 2026-12-31, the fee schedule and MUE give `ends_in_45` titled "content in the drafts ends within 45 days
    (2026-12-31)", beside the one `no_release` item; on 2026-12-18 (2027-01-01 less 14) they give `no_draft` for
    2027-Q1; the conversion factor with no draft gives "Content not in the drafts"; without `pending`, only
    `no_release` and the calendar findings;
  - review null and 13 months;
  - fast-check: as `today` advances day by day with fixed sources, a windowed family's stage never moves backwards
    (none, 45, 14, ended);
  - every filled command passes the importer's I1 to I8 window rules (calling the exported `quarterWindowProblem`) for its
    period, and uses only the import CLI's flags.
- **New `tools/content-calendar/content-calendar.test.ts`:**
  - sources read from a temp root;
  - an injected fetcher with hand-written HTML: recorded, new and unreachable files, and one retry;
  - hostile hrefs (`@founder.zip`, a Markdown link, a backtick, a 200-character name): none reaches a body, and the
    count of names not shown does (review m6);
  - the drafts read file by file: a spy on `readRecordFile` and the builder shows no two files' records alive at once
    (review m8);
  - the findings file's exact JSON for one case;
  - a title with a newline refused;
  - exit code 1 on an unreadable `COVERAGE.md`.
- **New `tools/content-calendar/runbook.test.ts`:** the runbook table equals the calendar.
- **`apps/web/src/lib/routes/console-routes.db.test.ts`:** Content due with an injected `now`, at 2026-11-20 against
  900001: MUE ends within 45 days.
- **New `apps/web/src/lib/releases/content-through.db.test.ts`:** the loaded-through rows; the cache read once.
- **e2e:** no stage is asserted (the stages move with the real date). The Releases page's existing journey, if it
  reads the page, asserts only the loaded-through date of 900001's MUE, 2026-12-31.

### 6.4 Synthetic releases
- **New: 900007 only** (5.6.8), checked free on 2026-10-26 (section 1). The builder checks again with
  `git ls-remote origin 'refs/heads/co-001/*'`, a fetch of each head, and
  `git grep -nE '900007' <head> -- . ':!pnpm-lock.yaml'`, before the commit that adds it.
- **No new number is needed for #30.** Its refusals are proven in temp roots: fixture directories are not numbered
  sets (`check.ts:81`) and have no previous release.

### 6.5 Mutation, coverage gates and CI cost
- **No new file in a money package** (`money`, `ledger`, `packets`, `pricing`), so `stryker/shards.json` is unchanged.
- **The affected shards still run:**
  - 900007 is a new `release-synth-*` directory;
  - `packages/rules/src` changes;
  - so pricing's 3 shards and packets' 2 run (`tools/stryker/affected.ts:80-99`).
  - Scores must not move, since no money source or test changes. A survivor is killed with a test, or recorded as
    equivalent by a reviewer who did not propose it.
- **The 100% branch coverage gate** covers `packages/{money,pricing,ledger,edi835}/src` and `packages/db/src/authz`.
  None of them changes.
- **The screening-capacity gate measures this PR**, since watched files change. Budget about 100 minutes. The time
  verdict is advisory.

### 6.6 Baselines for counting
At 6ddd587: test:db 9,049 passed and 1 skipped; e2e 51; unit 4,664 passed and 3 skipped (at PR 15's close). Counts
come from CI's totals or a full local run, never from `vitest list`.

## 7. Files

Every path below was checked against `pr42-files.txt`. "Shared" means a rule-6 shared document (LANES rule 6 and the
task's list). "Watched" means the screening-capacity gate measures it.

### 7.1 This PR

| File | Change | Freeze | #42 file? |
|---|---|---|---|
| `packages/rules/src/schema.ts` | Quarter helpers and type lists (5.1) | none (watched) | no |
| `packages/rules/src/records.ts` | Ranges, contents, gaps, coverage maps, the COVERAGE schemas (5.1) | none (watched) | no |
| `packages/rules/src/content.ts` | `previousReleaseNumber`, `releaseDirOf` | none (watched) | no |
| `packages/rules/src/import.ts` | I1 to I8, `statedQuarter` | #30 exception | no |
| `packages/rules/src/parsers/locality.ts` | Z1, Z2 | #30 exception (watched) | no |
| `packages/rules/src/parsers/pprrvu.ts`, `ncci.ts` | Review-question wording | #7 procedure text (watched) | no |
| `packages/rules/src/calendar.ts` (new) | The calendar and its evaluation | none | no |
| `packages/rules/package.json` | `./calendar` export | none (watched glob) | no |
| `packages/rules/src/{import,schema,records}.test.ts`, `coverage.test.ts` (new), `calendar.test.ts` (new), `parsers/parsers.test.ts` | Tests | tests | no |
| `tools/verify-content/check.ts`, `check.test.ts` | C1 to C16, D1, D2 | #30 exception (watched) | no |
| `tools/release/assemble.ts` | R3, R4, COVERAGE.md, the RELEASE.md section, the note | none (watched) | no |
| `tools/release/impact.ts` | Delegates the two functions to `@tp/rules/content` | none (watched) | no |
| `tools/release/synthetic.ts` | 900007 | none (watched) | no |
| `tools/release/database-runs.ts` | `memoryReleaseSource` | none | no |
| `tools/release/release.test.ts`, `workspace.test.ts`, `dry-run.db.test.ts` | Tests | tests | no |
| `fixtures/synthetic/rules/release-synth-900007/**` (new, generated) | The fixture release | new number (CODEOWNERS founder) | no |
| `apps/worker/src/price/release.ts` | Spans, windows, sources, the typed reader, content reads (5.6.1, 5.7.2) | none (watched) | no |
| `apps/worker/src/price/keyed-release.ts` | `claimsRequestedKeys`, `unionKeys` | none (watched) | no |
| `apps/worker/src/price/execute.ts` | Codes, the keyed source, the content refusal, the logs | none (watched) | no |
| `apps/worker/src/price/impact.ts` | `ReleaseSource` per batch | none (watched) | no |
| `apps/worker/src/price/diff.ts` | Identity joins | none (watched) | no |
| `apps/worker/src/price/public.ts` | Exports | none (watched) | no |
| `apps/worker/src/price/test-support/pricing-world.ts` | `CONTENT_GAP_RELEASE` | none | no |
| `apps/worker/src/price/content.test.ts`, `content.db.test.ts`, `release-source.db.test.ts` (new); `keyed-release.test.ts`, `price.db.test.ts` (if touched) | Tests | tests | no |
| `apps/worker/src/monitor/plan.ts`, `job.ts`, `monitor.db.test.ts`, `job.test.ts` | The wait and its log | none (watched) | no |
| `apps/worker/src/triage/execute.ts`, `triage.db.test.ts` | The fact, `typedRelease` | none (watched) | no |
| `apps/worker/src/report/content.ts`, `html.ts`, `report.test.ts` | The fact, the words, `typedRelease` | none (watched) | no |
| `packages/triage/src/actionable.ts`, `behavior.ts`, `actionable.test.ts`, `index.test.ts` | The reason; `BEHAVIOR_RECORD_TYPES` | none (watched) | no |
| `apps/web/src/components/pricing/display.tsx` | `FAILURE_TEXT` | lint:copy | no |
| `apps/web/src/components/pricing/content.tsx` (new) | `MonthsWaitingOnContent` | lint:copy | no |
| `apps/web/src/lib/pricing/content.ts` (new), `content.db.test.ts` (new) | Waiting months | none | no |
| `apps/web/src/lib/coverage/in-effect.ts` | `feeSchedulePeriodsNotLoaded` | none | no |
| `apps/web/src/lib/routes/coverage.ts`, `apps/web/src/app/p/[practiceId]/coverage/page.tsx` | The card and the sentence | lint:copy | no |
| `apps/web/src/lib/releases/content-through.ts` (new), `content-through.db.test.ts` (new) | Cached windows and spans | none | no |
| `apps/web/src/lib/routes/releases.ts`, `apps/web/src/app/p/[practiceId]/releases/page.tsx` | Loaded-through; `storedReleaseSource` | lint:copy | no |
| `apps/web/src/lib/routes/rule-releases.ts`, `apps/web/src/app/console/rule-releases/page.tsx`, `console-routes.db.test.ts` | Content due | lint:copy | no |
| `tools/content-calendar/{index,sources,fetch,render}.ts` (new), `content-calendar.test.ts`, `runbook.test.ts` (new) | The CLI | none | no |
| `tools/package.json` | `./content-calendar` export | none | no |
| `.github/workflows/content-calendar.yml` (new) | The workflow | ci-deps' pin rules | no |
| `.github/workflows/release-capacity.yml` (new) | The weekly test | ci-deps' pin rules | no |
| `tools/release-capacity/{run,scenario,checks}.ts` (new) and tests | The harness, the worker's spec with `heapFlag` | none | no |
| `tools/screening-capacity/containers.ts`, `env.ts` | The `worker` service name and production's worker command (no new import), `workerEnv` | none (watched glob) | no |
| `packages/synth/src/release/scale.ts`, `scale.test.ts`; `tools/release/scale.ts`, `scale.test.ts` | The optional quarterly windows, `QUARTERLY_SCALE_RELEASE_SHAPE` (900110), `--shape quarterly` | none (watched) | no |
| `tools/test/workflows.test.ts` | CI-10 rows, the new assertions, PINNED | shared by hand with ci-deps (section 8) | no |
| `tools/brand-copy/scan.ts` | `COPY_FILES` | none | no |
| `infra/lib/heap.ts` (new), `infra/test/heap.test.ts` (new) | The heap constants | none | no |
| `infra/lib/jobs.ts`, `infra/test/content-alert.test.ts` (new) | The content-alert message and metric | none | no |
| `content/sources/README.md`, `content/drafts/README.md`, `content/outgoing/README.md` | Procedure text | #7 and #30 README text | no |
| `docs/runbooks/content-updates.md` (new) | The runbook | shared (runbooks) | no |
| `docs/runbooks/ci.md` | "The jobs" gains the two workflows | shared with ci-deps | no |
| `docs/adr/0071-...md` (new) | The ADR | reserved number | no |
| `docs/product/test-matrix.md` | The RCC section | shared | **yes (rule 6 applies)** |
| `docs/product/reconciliation-001.md` | The exception bullet and the series paragraph | shared | **yes (rule 6 applies)** |
| `packages/synth/src/cases/registry.ts`, `matrix.ts` | RCC entries and rows | shared | **yes (rule 6 applies)** |
| `packages/synth/src/expected/types.ts`, `cases/common.ts` | `RCC`, `RCC: 14` | none | no |
| `fixtures/synthetic/RCC-01..08/expected.json` (new, generated) | Case fixtures | none | no |
| `docs/product/PRD.md` | §9's checker sentence (`:385`) gains the new refusals; §9's `locality_map` row cadence reads "Quarterly" (`:383`); §19's runbook table names `docs/runbooks/content-updates.md` | none | no |
| `/home/user/ops/LANES.md` (ops branch, not the PR) | Claim row: 900007, RCC = 14; "Handed to Lane A": `operator_content_coverage()` | records | n/a |

Not touched:
- `packages/pricing/**`, `packages/ledger/**`, `packages/db/**` (migrations, schema, tests), `packages/observability/**`;
- `.claude/**`, `content/releases/**`, `tools/engine-freeze/**`;
- `tools/screening-capacity/watched-paths.txt`, `run.ts` and `report.ts`;
- every file of `pr42-files.txt` but the four shared documents above;
- `pnpm-lock.yaml`, `apps/*/package.json`, the root `package.json`;
- `.github/workflows/publish-content.yml` and every other existing workflow.

### 7.2 The later PR (after #42 merges)

| File | Change | Why it needs #42 merged |
|---|---|---|
| `infra/lib/constructs/compute.ts`, `infra/test/compute.test.ts` | `COMMANDS.worker` with `heapFlag('worker')`; a platform command with `heapFlag('platform')`; the web with `heapFlag('web')`; the test's "no heap flag" assertion (`:159-160`) inverted | #42 files |
| `infra/lib/constructs/monitoring.ts`, `infra/test/monitoring.test.ts` | Metric filters and alarms: `CONTENT_NOT_LOADED` (worker log group, the operator topic, one-day period; refused and complete runs alike), `WAITING_ON_CONTENT` (worker log group, notify, one-day period) and the daily job's `CONTENT_ENDS_IN_45_DAYS` (notify), `CONTENT_ENDS_IN_14_DAYS` and `CONTENT_ENDED` (page), `CONTENT_OVERDUE` (notify) | #42 files |
| `apps/worker/src/price/execute.ts` | The engine-error count leaves out the content-alert lines | Only once the content alarm exists |
| `apps/worker/src/jobs/platform.ts`, `platform.test.ts`, `apps/worker/src/worker.test.ts` | The `content_due` platform job: payload `{ day?: date }`, schedule `'25 6 * * *'` UTC; `withOperator` → `operator_content_coverage()` → `contentDue()`; one log line per item, `error_code` per stage, `release_no`, `record_count` | #42 files; needs Lane A's function |
| `infra/lib/content.ts` (new) | The job's message constants and metric | With its first user |
| `apps/worker/src/digest/job.ts` | "N months wait on Medicare content" | #42 file |
| `apps/web/src/lib/routes/settings.ts` | Pricing settings lists the waiting months | #42 file |
| `tools/screening-capacity/watched-paths.txt` | Regenerated (`platform.ts` imports `@tp/rules/calendar`) | #42 file |
| `tools/screening-capacity/run.ts` | S1 to S5 under the quarterly scale release 900110 (`--shape quarterly`) | #42 file |
| `docs/product/test-matrix.md`, registry, matrix | New RCC rows, numbers reserved then | shared |

## 8. Overlaps and how rule 6 resolves each

| With | Shared files or numbers | Resolution |
|---|---|---|
| **#42** (Lane A, open) | `test-matrix.md`, `reconciliation-001.md`, `registry.ts`, `matrix.ts`; the closure behind `watched-paths.txt` | The shared documents follow rule 6: the PR merged second keeps both lanes' rows. `watched-paths.txt` is not edited: no new file joins the closure (5.0). If #42 merges first, its regenerated list must still equal this branch's derivation after the merge; the merger runs `watched.ts` and stops if it differs |
| **ci-deps** (Lane B) | `tools/test/workflows.test.ts` (CI-10 table, `PINNED`, pin rules); `docs/runbooks/ci.md`; the action pins of the two new workflows; `publish-content.yml` (ci-deps changes it, this PR does not) | `workflows.test.ts` is a code file. The PR merged second keeps both by hand: both CI-10 rows, and the new workflows under ci-deps' all-workflows pin rule, with ci-deps' SHAs. The two new workflows take ci-deps' `uses:` lines if it merged first; otherwise ci-deps' sweep must include them (named in its PR) |
| **superseded-rerun** (Lane B) | `apps/worker/src/price/execute.ts` (`FailureCode`), `diff.ts`, `display.tsx` (`FAILURE_TEXT`, `RERUN_TEXT`), `pricing-world.ts`, possibly `apps/web/src/app/p/[practiceId]/releases/page.tsx`, test-matrix and registry | Code files, kept by hand by the PR merged second: both `FailureCode` members, both text entries. `rerun.ts` is not touched here (no `content_loaded` re-run reason; `release_published` already offers it). Fixture number: 900007 is reserved here; superseded-rerun takes another |
| **db-function-diffs** (Lane B) | `MODULE_NUMBER` (DBF 13, RCC 14), `CASE_MODULES`, test-matrix | The PR merged second keeps both entries. Lane A's later `operator_content_coverage()` appears in its function files |
| **pr-15b-ledger-payment-terms** (Lane B) | test-matrix, registry, matrix only | Rule 6 |
| **model-eval-gate** (Lane B) | test-matrix, registry; the CI-10 table if it adds a workflow | Rule 6, and by hand for `workflows.test.ts` |
| **Lane A #8** | `tools/release/*` (its load path and impact counts), the loader, `load-release` SKILL.md step 3, the content-release runbook, `runReleaseImpact`'s caller in the web | #8 builds on `ReleaseSource` (its worker job prices through it). The runbooks link each other. This PR does not touch the skill or the loader |
| **Lane A, the later PR's function** | `operator_content_coverage()` | Handed over (section 2.4). The builder adds this entry to LANES.md "Handed to Lane A" before the PR opens: "2026-10-26, from Lane B's release content checks (#59): a migration adding `operator_content_coverage()` … for the daily content job; #59's 'Database: no' does not hold for that job" |

Proposals for other sessions (in the result's notes, not built):
- **model-eval-gate:** its reserved "MOD-7 to MOD-12" do not match the matrix regex `[A-Z]{2,3}-\d{2}`
  (`packages/synth/src/fixtures.test.ts:36`). They must be MOD-07 to MOD-12.
- **db-function-diffs:** fixed on its branch: it took `MODULE_NUMBER` DBF 13 and has registry entries.

## 9. Builder plan

### 9.1 Work packages (disjoint files)

Each package owns its files exclusively. A package that needs another's export waits for that package's handover
commit; it never edits that package's files.

| WP | Owns | Needs first |
|---|---|---|
| **WP1 rules core** | `packages/rules/src/{schema,records,content}.ts`, `schema.test.ts`, `records.test.ts`, `content.test.ts`, `coverage.test.ts` (new) | none |
| **WP2 importer** | `packages/rules/src/import.ts`, `import.test.ts`, `parsers/{locality,pprrvu,ncci}.ts`, `parsers/parsers.test.ts` | WP1 |
| **WP3 checker** | `tools/verify-content/check.ts`, `check.test.ts` | WP1 |
| **WP4 assembler and 900007** | `tools/release/{assemble,impact,synthetic}.ts`, `release.test.ts`, `workspace.test.ts`, `fixtures/synthetic/rules/release-synth-900007/**` | WP1, WP3 |
| **WP5 worker pricing (#31 and #7's run)** | `apps/worker/src/price/{release,keyed-release,execute,impact,diff,public}.ts`, `test-support/pricing-world.ts`, `content.test.ts`, `content.db.test.ts`, `release-source.db.test.ts`, `keyed-release.test.ts`, `price.db.test.ts`; `tools/release/database-runs.ts`, `dry-run.db.test.ts` | WP1; WP4's 900007 for `content.db.test.ts` |
| **WP6 monitor, triage, report** | `apps/worker/src/monitor/{plan,job}.ts`, `monitor.db.test.ts`, `job.test.ts`; `apps/worker/src/triage/execute.ts`, `triage.db.test.ts`; `apps/worker/src/report/{content,html}.ts`, `report.test.ts`; `packages/triage/src/{actionable,behavior}.ts`, `actionable.test.ts`, `index.test.ts` | WP5 |
| **WP7 web** | `apps/web/src/components/pricing/{display,content}.tsx`; `apps/web/src/lib/pricing/content.ts`, `content.db.test.ts`; `apps/web/src/lib/coverage/in-effect.ts`; `apps/web/src/lib/routes/{coverage,releases,rule-releases}.ts`, `console-routes.db.test.ts`; `apps/web/src/lib/releases/content-through.ts`, `content-through.db.test.ts`; the coverage, releases and console rule-releases pages | WP5, WP8 |
| **WP8 calendar, CLI, workflow** | `packages/rules/src/calendar.ts`, `calendar.test.ts`, `packages/rules/package.json`; `tools/content-calendar/**`, `tools/package.json`; `.github/workflows/content-calendar.yml`; `docs/runbooks/content-updates.md` | WP1 |
| **WP9 weekly capacity and infra** | `tools/release-capacity/**`, `tools/screening-capacity/{containers,env}.ts`, `packages/synth/src/release/scale.{ts,test.ts}`, `tools/release/scale.{ts,test.ts}`, `.github/workflows/release-capacity.yml`, `infra/lib/{heap,jobs}.ts`, `infra/test/{heap,content-alert}.test.ts` | WP5 (the harness must pass on the keyed reader). Handover adds: `watched.ts` prints the committed list unchanged and `watched.test.ts` passes (review B1) |
| **WP10 records and docs** | `content/{sources,drafts,outgoing}/README.md`; `docs/adr/0071-*.md`; `docs/product/{test-matrix,reconciliation-001,PRD}.md`; `docs/runbooks/ci.md`; `packages/synth/src/{cases/registry,cases/matrix,cases/common,expected/types}.ts`; `fixtures/synthetic/RCC-0*/expected.json`; `tools/brand-copy/scan.ts`; `tools/test/workflows.test.ts` | every other WP (the registry's `assertedBy` paths must exist; the workflow tests read both new workflows) |

**Order:**
1. WP1.
2. Then WP2, WP3, WP5 and WP8 in parallel.
3. Then WP4 (after WP3), WP6 and WP9 (after WP5), and WP7 (after WP5 and WP8).
4. WP10 last.
5. At most two heavy runs at once, under `flock /tmp/laneb-heavy.lock`.

**Every WP's handover check:**
- `pnpm typecheck`;
- `pnpm lint` on its files;
- its own tests;
- `pnpm exec tsx tools/screening-capacity/watched.ts` equal to the committed list (5.0);
- no file outside its column.

### 9.2 Risks the builders and the fix round check
- **`watched-paths.txt`:** a new non-test file reachable from the closure turns `watched.test.ts` red. The cure is to
  move the code into a listed file, never to edit the list.
- **Existing db tests that price a flag-on line outside its release's MUE or MPPR span** now fail the run with a
  content code. The full `test:db`, AUDIT-01 and the e2e journeys must pass.
  - A test whose own expectation was the silent pricing is rewritten to assert the refusal, or given a date inside
    the span, and the PR description lists each such test.
  - A grep at 6ddd587 found no db test pricing a 2025 or 2027 MA line through `executePricingRun`. The golden claims
    with 2025 dates (G181, G188) price in memory, not through it.
- **A location-stopped run now prices to its end** before it fails (5.6.2, review m1). Existing tests of
  `location_not_ready` keep their assertions; a test that counted the lines priced before the stop, if any, is
  rewritten and listed in the PR description.
- **The differential test** must stay green. Any `packages/rules` change that alters an engine answer is a defect of
  this PR.
- **The synthetic render-equality tests** (900001 to 900006) must stay green: `releaseNotes` without `coverage`, and
  `parsedRecordFile`'s default window.
- **A planner regression of the keyed read** is caught by the plan test. Do not drop `OFFSET 0`.
- **The importer's fail-closed quarter reading** may refuse the first real PPRRVU, GPCI or MUE file. That is intended.
  A parser PR adds the file's real statement (README; section 10.3).
- **The web reads the content checkout at run time.** Keep `/*turbopackIgnore: true*/` on every path join in
  `tools/content-calendar/sources.ts`, as `check.ts:94` does.

### 9.3 The fix round's full local suite (once, each heavy step under the lock)

Every command starts with `export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH`.

1. `pnpm install --frozen-lockfile`
2. `pnpm check:fixtures`
3. `pnpm typecheck`
4. `pnpm lint`
5. `pnpm lint:logs`
6. `pnpm lint:copy`
7. `pnpm verify-content`, and `pnpm verify-content fixtures/synthetic/rules/release-synth-90000{1..7}`
8. `tools/check-releases-immutable.sh "$(git merge-base HEAD origin/claude/build-platform)"`
9. `env -u PR_NUMBER pnpm -s exec tsx tools/engine-freeze/check.ts "$(git merge-base HEAD origin/claude/build-platform)"`.
   It must be clean, with no exception.
10. `pnpm synth --all && git diff --exit-code -- fixtures/synthetic && test -z "$(git status --porcelain -- fixtures/synthetic)"`
11. `pnpm synth --large`
12. `pnpm exec tsx tools/screening-capacity/watched.ts`, compared with the committed list (no `--write`)
13. `ENGINE_FREEZE_BASE=<merge base> CI=true pnpm test`
14. `pnpm test:golden`
15. `pnpm test:oracle`
16. `pnpm licenses:check`
17. `actionlint .github/workflows/*.yml`
18. `DATABASE_URL=postgres://postgres:test@localhost:5433/postgres pnpm db:migrate`, then `pnpm test:db --shard=k/6`
    for k = 1 to 6, one after another
19. `pnpm db:domain-model --check --strict --require-approval` on a freshly migrated scratch database (no migration,
    no drift)
20. `pnpm build`; `pnpm -s exec tsx apps/web/scripts/build-stamp.ts --write "$(git rev-parse HEAD)"`;
    `E2E_PREBUILT=1 pnpm test:e2e --workers=2`
21. The mutation canary, then pricing's 3 shards and packets' 2 (`tools/stryker/affected.ts --base origin/claude/build-platform`
    names them), then `tools/stryker/gate.ts reports/mutation`
22. `tsx tools/release-capacity/run.ts` once on the head (5.10). This is a long heavy run, under the lock and in the
    background. Its summary goes into the PR description.

## 10. Open questions and decisions

### 10.1 For the co-founder: cost or security trade-offs (each with the recommended option)
- **Q1 (security): content-due issues on a public repository.**
  - The repository is public, so the workflow's issues are public.
  - They hold only calendar data, public CMS and X12 page addresses, file names seen on those public pages,
    repository release numbers and import commands. Nothing comes from a database, a customer or production.
  - **Recommended: accept.** The alternative (issues off until the repository is private) loses the main #59 signal
    before release 1.
  - ADR 0071 records it.
- **Q2 (cost): two new scheduled workflows.**
  - content-calendar runs daily at up to 15 minutes; release-capacity runs weekly at up to 180 minutes, on the free
    4-CPU runner.
  - Free while the repository is public. Once private, it is at most about 1,250 runner minutes a month (450 daily, 780 weekly), inside GitHub Team's
    included 3,000.
  - **Recommended: accept.** The weekly real-size run is #31's only proof that release 1 fits the worker.

### 10.2 Founder-kept matters
- **Lane A's `operator_content_coverage()`** (the later PR) regenerates the domain model, so it needs the founder's
  approval by its SHA-256. It is Lane A's to open.
- **Schedules fire only from the default branch,** which is `main` today. The daily and weekly runs wait for F1 (a)'s
  default-branch switch, an owner-admin setting already ruled (2026-10-25). The founder applies it.
- No release tag, no legal text, and no reversal of a ruling is involved.

### 10.3 Decisions taken (reported, not asked; reversible)

These were taken under the co-founder's delegation and his directions of 2026-10-25 (Q3, "wording and visible
changes without asking").

**Product and engineering:**
- **The look-back is six years,** cut at January 1 of the prepared year minus six. That covers line data's retention
  ("contract term plus six years", PRD.md:813) and every Medicare window. It is deterministic, because it is anchored
  on the recorded prepared date. A shorter look-back would let a release drop dates a re-run of a retained month still
  needs.
- **A withdrawal is signed by two different named people.** This mirrors the second-pass independence rule
  (`check.ts:310-319`).
- **No hash on a withdrawn entry.** It is reviewed in the PR and sealed by the manifest, so a self-computed hash would
  prove nothing.
- **GPCI is quarterly.** It ships in every quarterly RVU zip.
- **MPPR keeps its calendar-year default, but never an open window, and never leaves one calendar year.**
- **A quarterly window lies inside its stated quarter,** usually all of it, so CMS's mid-quarter corrections load
  (review M3).
- **The failure codes name the families exactly** (three codes), and the run prices to its end, writing nothing after
  the first gap.
- **Precedence:** a read outside the fetch, then the location, then content, over the whole run (no stop throws
  mid-batch; review m1).
- **No pre-check when a person creates a run.** It would duplicate the engine's step logic. The run fails in minutes,
  with the text that names the content.
- **No `content_loaded` re-run reason.** `release_published` already offers the re-run, and `rerun.ts` is
  superseded-rerun's.
- **The engine-error page is unchanged until the content alarm exists** (the later PR).
- **The keyed read** works per batch, with a per-run delta cache.
- **The weekly real-size test** covers the worker paths, under the quarterly scale release 900110 and with jobs
  running concurrently as production runs them (review M6). The five screenings stay screening-capacity's weekly S1 to
  S5 under the same release.
- **The heap limits** equal today's automatic sizes (worker 560 MiB, platform 259, web 560). They are wired in the
  later PR.
- **The calendar ships unreviewed** (`review: null`, `knownFiles: null`). The workflow reports both until a reviewer
  confirms each entry against its source page. Dates that cannot be checked from here are never presented as reviewed.
- **The target time to load:** in a published release 14 days before the period starts, or within 3 business days of
  a late publication.
- **No shell-wide banner.** The Coverage banner and the console section are enough.
- **The importer reads a stated quarter** from the title lines or the CMS file-name token, and fails closed. The first
  real download may need a parser PR. That is the README's existing rule for layouts.

**Wording:** every string in 5.11, chosen under brand.md and CO-11.

**Departures from the scouts:**
- One failure code became three (exactness).
- The plain per-batch fetch gained a per-run cache (fewer probes).
- The withdrawn entry's `sha256` was dropped, and the second signer kept.
- `COVERAGE.md` gained per-content windows. This was the alarms scout's Lane A proposal, built here because the
  assembler is in this PR's files.
- The content alert does not yet replace the engine-error page (no alerting gap).
- `MODULE_NUMBER` RCC is 14, not 13 (DBF took 13).
- The weekly test does not rerun the screenings.
- The scout's Q-W ruling on `watched-paths.txt` is not asked. The placement rule (5.0) needs no new file in the
  closure, so the #42 file stays untouched.

### 10.4 Proposals outside this item (not built)
- **Lane A, with #8:**
  - stored release counts for the release listings and the release-note view (`apps/web/src/lib/releases/queries.ts:40`,
    `:99-107`), which scan whole releases in Postgres at real size;
  - the impact dry run at practice scale applying the content test, so impact counts flag the months that would wait
    (`apps/worker/src/price/impact.ts`).
- **Lane B, later:**
  - a `--quarter 2026Q4` import flag (friendlier than two dates; a new input, so outside #30's exception, under its own
    ruling);
  - a way to close an MPPR list's window for a mid-year CMS update without re-verifying unchanged records.
- **#31's CI narrowing:** `pnpm verify-content` re-reads every release on every PR. Narrowing it needs its own
  exception (combined-report.md:478). Not proposed now: `COVERAGE.md` keeps the new check's cost to the previous
  release's map.

## Appendix A. Design review and dispositions

The adversarial review of 2026-10-26 (`/home/user/ops/designs/lane-b-release-content-checks/review.md`) found 1 blocker,
7 major, 8 minor findings and 1 nit. Its migration verdict ("this PR needs no migration"; the later daily job needs Lane
A's `operator_content_coverage()`) is agreed, and no disposition below needs DDL: every fix is code, files, a
`tp_app` SELECT under the practice's scope, or an added refusal inside #30's exception. Each finding was checked
against the code at 6ddd587 before it was fixed. None is rebutted.

| ID | Severity | Disposition |
|---|---|---|
| B1 | blocker | **Fixed in 5.10 and 5.0** (also 5.7.3, 7.1, 9.1 WP9). Confirmed: `watchedPaths()` keeps closure files no `WATCHED_FIXED` line matches (`watched.ts:165`), and no line matches `infra/lib/heap.ts`. `containers.ts` now gains only the `'worker'` name and production's own worker command (`compute.ts:33`), with no import; `tools/release-capacity/run.ts`, outside the closure, adds `heapFlag('worker')` to the spec's command. 5.0 forbids importing `heap.ts` from any closure file. WP9's handover: `watched.ts` prints the committed list unchanged and `watched.test.ts` passes. |
| M1 | major | **Fixed in 5.6.5 and 5.6.6** (also 2.1 item 3, 5.11, 6.1 RCC-05, 6.3). Confirmed: CURRENT terms look up `inForce` on the service date (`engine.ts:567-586`) and the trace records the lookup. The loud test now follows the trace's `lookup`: under `in_force_on_service_date`, the service date outside every `pfs_rvu` window; under `latest_in_basis_year`, no window in the basis year. `feeSchedulePeriodsNotLoaded` groups by quarter (CURRENT) or year (LOCKED), and the sentence reads "the 2026-Q4 Medicare fee schedule". Tests with Q1 to Q3 loaded and Q4 missing. |
| M2 | major | **Fixed in 5.3** (also 2.2, 4.3, 4.4, 4.5, 6.1 RCC-02, 6.3). Confirmed: the span is the union of every record's window (`20261105090000:1015-1033`) and `hand_typed` is allowed for any type (`schema.ts:399-402`). C1 now applies to real records whatever the method; C2 bounds per-code MPPR to one calendar year with an end; C15 refuses hand-typed quarterly and per-code MPPR records; C16 makes one file's records share one window; the importer gains I8. All added refusals; the real drafts' only `mppr_rate` record, the hand-typed open general rate, is untouched. RCC-02 and a check test cover the bypass. |
| M3 | major | **Fixed in 2.2 R1, 5.1, 5.2.1 (I5) and 5.3 (C1)** (also 4.4 README "A correction inside a quarter", 5.2.4, 10.3, RCC-01). Confirmed: `scale.ts:62-64`, `:478-480` model mid-quarter corrections. A quarterly window now lies inside the stated quarter (both ends in it, never open); R4's no-gap rule and the existing overlap refusal keep each quarter covered once. Still refusal-only (it refuses less than the first draft did, more than today). |
| M4 | major | **Fixed in 5.6.2** (also 2.1 items 5 and later PR, 5.12, 7.2, RCC-04, 6.3). The content refusal now logs `CONTENT_NOT_LOADED_MESSAGE` with `error_code` and `record_count`, once per run, whoever created it. The later PR's `monitoring.ts` row gains the `WAITING_ON_CONTENT` alarm beside `CONTENT_NOT_LOADED`, whose filter covers refused and complete runs alike. RCC-04 asserts the one line on a refused run created by a person. |
| M5 | major | **Fixed in 5.8.2 rule 1 and rule 6** (also 5.8.7, RCC-08, 6.3). With no release, the windowed and open families are judged on `pending` (the drafts and outgoing), titled "content in the drafts", beside one `no_release` item; without `pending`, as before. A calendar test with no release on 2026-12-10 and drafts through 2026-12-31 (and again on 2026-12-18 for `no_draft`). |
| M6 | major | **Fixed in 5.10** (also 1, 2.3, 7.1, 7.2, 9.1, RCC-07, 10.1 Q2, 10.3). Confirmed: one worker runs every job type's loop at once (`worker.ts:223-231`), `parse_835` at 4 (`registry.ts:147`). The weekly test now uses the quarterly scale release 900110 (seven years of quarters, about 4.17 million records, its counts' basis recorded) and a concurrent phase: A's price job, B's audit-report PDF and C's four 835 parses, with `memory.peak` measured over the phase and the whole run. The job timeout rises to 180 minutes. Screening-capacity's move to 900110 joins the later PR (its `run.ts` is #42's). |
| M7 | major | **Fixed in 5.2.1** (also 2.2 R2, 4.4 README rows, 4.5, RCC-01). Confirmed: README row 2 is `GPCI2026.csv` (`content/sources/README.md:61`), and `--url` is required to be the download address (`import.ts:168-169`). `statedQuarter` also reads the last path segment of `--url` (the RVU zip's own name), so the cross-check rests on CMS's name; an `Eff(ective) MM-DD-YYYY` pattern states the quarter holding the date, and a stated effective day must be the window's start (I7). Row 2's command is rewritten. The patterns' exact CMS spellings stay "the contract until the first real download" (5.2.1), as before. |
| m1 | minor | **Fixed in 5.6.2** (also ADR text 4.5, 9.2, RCC-04, 6.3). Confirmed: `onLocation` throws inside the batch loop (`execute.ts:279-296`). The callback now records; violations are checked after every batch, the location and content stops are raised after the loop, so the precedence holds over the whole run. Test with the violation in a later batch than the first location stop. |
| m2 | minor | **Fixed in 5.6.3 and 5.6.4** (also 5.11, RCC-05, 6.3). Confirmed: `waitingOnLocation`'s `practice_site.updated_at` precedent (`plan.ts:128-149`); `payer_plan_mapping` and `contract_version` keep `updated_at` by trigger (`20261016160000:271`, `:274`) and no code deletes their rows. The wait ends when either changed after the failed run; the card shows `terms_changed`; the daily monitoring schedule replans it. |
| m3 | minor | **Fixed in 5.5.1.** Confirmed at `impact.ts:79-89`. The moved `previousReleaseNumber` catches `ENOENT` only and rethrows anything else, with a test. |
| m4 | minor | **Fixed in 5.8.3 and 5.8.7.** Issue bodies say "the newest published release (<n>)"; the runbook says the console and the later daily job read the release in force. |
| m5 | minor | **Fixed in 5.9 and 5.10 step 8** (also 2.3's proposal). The windows query is measured weekly on 900110, cold and warm, with a stated 5 s cold budget, advisory under the founder's ruling for capacity times; the stored-windows fix joins the #8 stored-counts proposal to Lane A. |
| m6 | minor | **Fixed in 5.8.3** (also 6.3). Only names matching `^[A-Za-z0-9._-]{1,120}$` are kept, each in a code span; others are counted, never shown; a hostile-href test. |
| m7 | minor | **Fixed in 5.1 and the ADR text (4.5).** Names compared trimmed and case-folded; ADR 0071 records that the founder's code-owner review of the note's pull request is the second signature of record. |
| m8 | minor | **Fixed in 5.1 and 5.8.3** (also 6.3). Coverage strings are interned; measured 300 MiB for 2,000,000 PTP identities on Node 24; the map test asserts at most 320 MiB of heap growth in a child `--expose-gc` process. The CLI summarises the drafts file by file through `ContentSummaryBuilder`, holding no records. |
| n1 | nit | **Fixed in 4.4, 6.1 RCC-03, 5.7.3 and 5.1/5.9.** The README and RCC-03 say the note's entries are copied into `COVERAGE.md` and the note removed; `HEAP_MIB.platform` is the measured 259, so the no-change claim holds; `contentOf` and the windows SQL split MPPR by `key ? 'hcpcs'` and `key ? 'component'`, as `rule_release_content_span()` does (the strict key schemas make the two splits equal today, `schema.ts:246-256`; the exact form removes the doubt). |

**Improvements found while revising, inside scope (built into the design):**
- I7, a stated effective day must start the window (5.2.1): a correction file cannot be loaded from the wrong day.
- The per-code MPPR list's window may not leave its calendar year (I8, C2): the same span-widening hole as M2,
  through the importer.
- The quarterly scale shape is an option of the existing generator, so 900100 and the screening test are unchanged
  in this PR and move together in the later one.

**Outside this item (proposals, not built):** the screening's per-row keyed reads under the quarterly shape are
measured only once screening-capacity moves to 900110 (later PR, its `run.ts` is #42's); and the stored per-content
windows belong with #8's stored release counts (Lane A).

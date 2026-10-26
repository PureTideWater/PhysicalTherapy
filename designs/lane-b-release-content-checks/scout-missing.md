# Scout: missing content in pricing, triage, coverage and screening (#7)

Base: `claude/build-platform` at 6ddd587. Read-only map. Every claim is cited as file:line at 6ddd587.

## 0. Summary for the design author

- **The span computation already exists, in Postgres, with no DDL needed.** PR 6b-2 (#36) shipped `rule_release_content_span(release)`. It returns one row per content (`mppr_code`, `mppr_general`, `ncci_mue`) with the union of that content's record windows as a `datemultirange`. A content with no record gives `'{}'`, never every date. A null `effective_to` counts as open onward. It is granted to `tp_app`. See `packages/db/migrations/20261105090000_pricing_location_and_zip_plus_four.sql:1011-1033` and `:1043-1044`, and ADR 0064 `docs/adr/0064-...md:300-308`. A pure TypeScript reader of its text output already exists too: `parseDateMultirange` and `contentQuartersOf` in `apps/worker/src/screening/format.ts:494-600`. The web caches it once per release and manifest in `apps/web/src/lib/screening/content-span.ts:20-46`. The pricing part of #7 reuses all of this and needs no migration.
- **The screening's out-of-span refusal is built (PR 6b-2, #36).** Nothing is left to build for it in this PR (section 6).
- **Run refusal codes are code, not a DB enum.** `pricing_run.failure_code` has only a shape CHECK, the regex `^[a-z][a-z0-9_]{0,63}$`, plus "failed iff a code is set" (`packages/db/migrations/20261018090000_pricing_runs.sql:44,51`). No later migration narrows it: a grep of every migration for `failure_code IN` or `location_not_ready` finds no list. The closed list is the TypeScript union `FailureCode` (`apps/worker/src/price/execute.ts:43`), and the web's `FAILURE_TEXT` satisfies `Record<FailureCode, string>` (`apps/web/src/components/pricing/display.tsx:32-38`). So adding `waiting_on_content` is **not DDL**.
- **The new code is a run refusal code, not an unpriced reason.** It never enters `UNPRICED_REASONS` (`packages/pricing/src/reasons.ts:6-19`), `docs/product/unpriced-reasons.md`, or the remedy tables that copy them (`apps/web/src/lib/contracts/remedies.ts:24-37`, `apps/worker/src/report/remedies.ts:9-22`). Both remedy tables are compared word for word with the frozen document by their tests (header comments at `remedies.ts:3-10` and `:3-8`). So unpriced-reasons.md and the engine list stay byte-identical.
- **The triage reasons are a closed list in code, not in a DB CHECK.** `NOT_ACTIONABLE_REASONS` is at `packages/triage/src/actionable.ts:50-64`. A grep of the migrations and `packages/db/src/schema` finds `NCCI_REVIEW` / `PER_VISIT_REVIEW` in none of them. The only DB closed list nearby is `pricing_check` (`20261103090000_deadline_verification_and_export_attestation.sql:715,1206`; `packages/db/src/schema/packets.ts:35`), which is a different list. **Do not add a cause there: that is DDL, Lane A's.**
- **No core file of this item is a #42 file.** The #42 files that matter are the alarm's metric filter (`infra/lib/constructs/monitoring.ts:261`), the monthly digest (`apps/worker/src/digest/job.ts`), and the log-field allowlist (`packages/observability/src/fields.ts`). The allowlist does not need to change: `error_code`, `release_no` and `record_count` are already allowed (`fields.ts:41`; used at `apps/worker/src/monitor/job.ts:56-60`).

## 1. Where a month's run is planned and refused today

**Creating a run.** `createPricingRun` (`apps/worker/src/price/create.ts:85-110`) refuses, in this order:
1. Bad dates: `PricingRunInputError` at `:86-94`.
2. A release that is not the one in force: `RuleReleaseMismatchError` at `:95-98` (`release.ts:12-26`).
3. A period with no lines: `PricingRunInputError('period')` at `:102-104`.
4. An unmapped plan (MAP-01): `assertPracticePricingAllowed` → `PricingRefusedError` at `:106`.
5. No location: `assertLocation` → `PricingLocationWaiting` at `:108`, `:44-58`.

`recordRun` (`:129-167`) maps the database's own 23514 refusals back to those errors (`:76-83`, `:157-164`). Re-runs go through `recordRun` directly, not `createPricingRun` (`apps/worker/src/price/rerun.ts:98`). The person's route catches each error into an `InputError` (`apps/web/src/lib/routes/pricing.ts:297-345`, catch at about `:320-330`).

**Executing a run.** `executePricingRun` (`apps/worker/src/price/execute.ts:229-317`) has three failure paths:
- `engine_version_mismatch` at `:238-241`.
- `unmapped_plan` at `:262-270`.
- The **location_not_ready pattern**, which is the template for #7:
  - A `seen` callback on every engine result throws `LocationNotReady` (`:276-286`).
  - The whole pricing transaction rolls back.
  - `failRun(..., 'location_not_ready')` runs in its own transaction (`:301-309`; `failRun` at `:140-147`).
  - No line is kept, and it is never an operator page.

The callback gets each `LinePricing`, whose `trace` is the full `PricingTrace` (`packages/pricing/src/types.ts:174,187`; `priceClaims` at `execute.ts:200-219`). After a complete run, the operator page is logged once per run, `ENGINE_ERRORS_MESSAGE` / `PRICING_ENGINE_ERROR`, when `operatorAlerts(coverage) > 0` (`:311-315`; `coverage.ts:60-62`; `infra/lib/jobs.ts:18-25`). The alarm's metric filter is in `infra/lib/constructs/monitoring.ts:261` (**#42 file**).

**The monitor.** `planMonitoring` (`apps/worker/src/monitor/plan.ts:175-211`):
- It plans each month from `uncoveredMonths` (`:91-112`). A failed run never covers a month (`:105`).
- It skips a month for which `waitingOnLocation()` is true (`:128-149`). That is true when the newest run of exactly that month failed `location_not_ready` under the release in force, its cut-off is at or after the month's newest line, the run came after the location was saved, and the location is still not ready. This stops a daily loop.
- A `PricingRefusedError` becomes `waitingOnMapping` and a `PricingLocationWaiting` becomes `waitingOnLocation` (`:199-206`).
- The outcome type is at `:58-71`.

The job logs `UNMAPPED_PLAN` and `LOCATION_NOT_READY` with release_no and record_count (`apps/worker/src/monitor/job.ts:49-61`). A month is planned again when a new release comes into force: `waitingOnLocation` requires `r.release_no = $4`, the release in force (`plan.ts:141`). A job may not create re-runs (`create.ts:124`).

**How a refusal is shown with dollars.** Coverage's "Months waiting on your billing ZIP" card has billed dollars (`apps/web/src/app/p/[practiceId]/coverage/page.tsx:162-180`). Its data is `monthsWaitingOnLocation` (`apps/web/src/lib/pricing/location.ts:169-262`), which recomputes the waiting months in SQL with `Totals` (lines, claims, billed, paid), and is wired into the route at `apps/web/src/lib/routes/coverage.ts:68-69,112`. Pricing settings shows the same list (`apps/web/src/lib/routes/settings.ts:562,644`; that is a **#42 file**, so do not touch it). The run page shows `FAILURE_TEXT` (`display.tsx:32-38`), and the re-run offer shows `RERUN_TEXT` (`display.tsx:40-45`) from `RERUN_REASONS` (`rerun.ts:24`, `rerunReasons` at `:33-44`, which already includes `release_published`).

## 2. What the engine reads silently, and what the trace records (packages/pricing, frozen)

- **MUE**, with `apply_ncci` on: `medicallyUnlikelyEdit` (`engine.ts:349-356`). When no record is in force, the result is `{checked:true, record:null, value:null}`, meaning no limit. The trace field is `steps.units.mue` (`trace.ts:159-167`).
- **NCCI PTP**, with `apply_ncci` on: `procedureToProcedure` (`engine.ts:363-385`). A pair not found is just absent. The trace field is `steps.ncci_ptp.edits` (`trace.ts:193-205`). MUE stands in for the quarter, because pairs are too sparse to date (comment at migration `:1015-1018`).
- **Per-code MPPR**, with `apply_mppr` on: `poolMember` (`engine.ts:761-773`). When no `mppr_rate {hcpcs, modifier:''}` record is in force, `in_pool` is false, and the line is neither ranked nor reduced, silently. The trace is an `adjustments[]` entry `name:'mppr'` with `in_pool`, `code_record`, `general_record`, `reduction_percent` and `ranking` (`trace.ts:208-226`; written at `engine.ts:742-757`).
- **General MPPR** is read only when the code's share is null (`engine.ts:767-772`). If it is missing, the line stops `ENGINE_ERROR no_mppr_rate` (`engine.ts:727-732`; `reasons.ts:61`). **So the general rate is fail-safe and loud, not silent.** It still belongs in the span set: the screening intersects all three (`format.ts:495`), and a gap there is content, not an engine fault.
- **Flags** are recorded at `trace.terms.flags` (`trace.ts:93-99,120`). Their defaults come from `@tp/contracts`: commercial false (`packages/contracts/src/terms.ts:202`), MA non-contracted true (`:211`).
- **The service date** is `trace.line.service_date` (`trace.ts:47`). **The release** is `trace.release.number` (`trace.ts:301`). `parseTrace` is exported (`trace.ts:340`; `index.ts:33`).
- **A flag set on a term that never reads the content** (`apply_mppr` on a non-PERCENT_OF_MEDICARE term) stops before MPPR with `ENGINE_ERROR mppr_needs_fee_schedule` (`engine.ts:542-544`). The trace then has `terms.flags.apply_mppr = true` but no `mppr` adjustment. **So decide "content read" from the steps, not the flags.** The MPPR content was read iff an `mppr` adjustment entry exists. The MUE content was read iff `steps.units.mue.checked` is true. When a day's reduction throws, its entries are cleared (`engine.ts:709-714`) and the line is loud anyway. This is what makes "a commercial fixed-fee month still prices" exact: commercial flags are off, and a fixed fee with a flag on never reads the content.

## 3. Computing each type's loaded span outside the engine

- **Postgres:** `SELECT content, loaded::text FROM rule_release_content_span($1)` (`20261105090000_pricing_location_and_zip_plus_four.sql:1020-1033`). It is invoker-rights over `rule_record`, which `tp_app` may SELECT (`20261015120000_rule_content.sql:88`). It uses the index `rule_record_by_type (release_no, record_type)` (`:37`).
  - `mppr_code` is `record_type='mppr_rate' AND key ? 'hcpcs'`.
  - `mppr_general` is `key ? 'component'`.
  - `ncci_mue` is `record_type='ncci_mue'`.
- **TypeScript:** `parseDateMultirange` (`apps/worker/src/screening/format.ts:521-546`) turns the text into `[from, until)` pairs with null for unbounded. Exported through `@tp/worker/screening-format` (`apps/worker/package.json` exports, read only, no change). A per-date test is a one-line pure helper over those pairs. Reuse it; do not copy it.
- **Caching:** `releaseContentSpans` caches by release and manifest (`apps/web/src/lib/screening/content-span.ts:26-46`), but it lives in the web app. The price job reads the spans once per run (one query). It needs no cache.
- **Fixture facts that matter:** `release-synth-900001` has `mppr_rate` 2026-01-01 to **open** and `ncci_mue` 2026-01-01 to 2026-12-31 (`fixtures/synthetic/rules/release-synth-900001/RELEASE.md`, Records table). 900005 and 900006 are the same. So per-code MPPR never lapses in any existing fixture. Only MUE ends, at 2026-12-31.
- **Risk to the span itself:** a real import with `--effective-to open` (`content/sources/README.md:79-80`) makes the span infinite and hides a lapse. That is for #30's importer and checker refusals (outside #7).

## 4. Proposed placement of "waiting on content" (design input)

**Where to check: at execution, from the traces (recommended), not at planning.** Planning would have to resolve each line's agreement and guess which terms read the content. That duplicates the engine's step logic (section 2's `mppr_needs_fee_schedule` case). The execution-time check reads exactly what the engine did:
- In `executePricingRun`, read the run's release spans once.
- Pass a `seen` hook that throws `ContentNotLoaded` on the first line that read a type (an `mppr` adjustment, or `mue.checked`) on a date outside that type's span.
- Roll back, then `failRun(..., 'waiting_on_content')`.

This is the location_not_ready pattern at `execute.ts:276-309`. The two hooks compose, so both must run in one callback. It also covers re-runs and person-created runs, since every run executes here. No line is kept, so nothing is ever priced silently.

**The code.** `FailureCode` gains `'waiting_on_content'` (`execute.ts:43`), and `FAILURE_TEXT` gains its sentence (`display.tsx:32-38`; the `satisfies` forces it). No DB change, because the CHECK is a regex (`20261018090000_pricing_runs.sql:44`), and no trigger lists codes (`:127-160`; `20261019150000...:115-160`; `20261020090000...:71-116`).

**Naming the type and the quarter.** A month lies in one quarter, so the quarter comes from `period_from`. The types are those whose span in the failing run's release does not cover the month, computed at read time from `rule_release_content_span(run.release_no)`, with nothing stored. Customer wording: "Waiting on the 2027-Q1 Medicare content (MUE)", with the month's dollars.

Open choice: this may name a type no line of the month actually needed, when both types lapse but only one was read. The exact alternative encodes the types in the fixed code (`waiting_on_content_mue`, `_mppr`, `_mppr_mue`). The regex allows it, but it is three codes instead of one.

**The monitor.** Add a `waitingOnContent(client, practiceId, month, releaseNo)` beside `waitingOnLocation` (`plan.ts:128-149`): the newest run of exactly the month failed `waiting_on_content` under the release in force, and its cut-off is at or after the month's newest line. Add a `waitingOnContent: WaitingMonth[]` field to the `MonitorPlan` outcome (`plan.ts:58-71`). In `job.ts:49-61`, log `CONTENT_NOT_LOADED` with release_no and record_count, using existing fields only.

Planning again is automatic. A newer release in force fails the equality at `plan.ts:141`, so `uncoveredMonths` (`:105`) returns the month and it is priced once more. If that release covers the month, it prices. If not, it fails once more per release.

Improvement inside scope: skip that attempt when the release in force's spans over the month cover no more than the failing release's. That avoids one wasted run per unrelated release.

**Commercial fixed-fee month.** No content read means no refusal, by section 2. RCC case: a commercial FIXED_SCHEDULE month with `apply_mppr` off, dated 2027-01, under a release whose MUE ends 2026-12-31, prices complete.

**Coverage card.** Add a `monthsWaitingOnContent` reader, for example `apps/web/src/lib/pricing/content.ts`, modelled on `monthsWaitingOnLocation` (`location.ts:190-262`): the same `Totals`, the quarter, and the types. Wire it into `coverage.ts` (`:54-84` type, `:93-124` handler) and `coverage/page.tsx` (a card beside `:162-180`). Wording: "Waiting on the <quarter> Medicare content", with billed dollars. Lint with `lint:copy` and follow `.claude/rules/brand.md`: money in mono, tabular figures.

**Triage hold.** Add a reason to `NOT_ACTIONABLE_REASONS` (`actionable.ts:50-64`), for example `CONTENT_NOT_LOADED`, with a fact `contentNotLoaded: boolean` in `TriageFacts` (`:68-...`). `judgeLine` pushes it (`:140-187`). It is code only, so no DDL.

The fact is computed in the worker by the same pure trace test, against `rule_release_content_span(row.release_no)` once per release, in `candidateLines` (`apps/worker/src/triage/execute.ts:278-306`, beside `referencesByRelease` at `:263-274`). The report's own `judgeLine` call needs the same fact (`apps/worker/src/report/content.ts:481-503`), and the reason needs words in `REASON_TEXT` (`apps/worker/src/report/html.ts:36-51`). The report's not-actionable table derives from the list automatically (`content.ts:593-598`).

Lines priced before this PR with a lapsed span (runs under releases already in DB) are the case this hold exists for. Runs after this PR cannot produce such lines, because they fail first.

## 5. Coverage's fee-schedule gap ("check the code and year") and one content alert per run

- The words live in `NO_PFS_VALUE`'s remedy: `apps/web/src/lib/contracts/remedies.ts:29` and `apps/worker/src/report/remedies.ts:14`, both copies of `docs/product/unpriced-reasons.md:15` (frozen) and `content/sources/plan/rules-reference.md:77`. **They must not change.**
- Add a separate sentence for the gap case: "PaidWhole has not loaded the <year> fee schedule". It applies to lines `NO_PFS_VALUE` with detail `no_rvu_in_basis_year` (`reasons.ts:103`; `trace.ts` outcome detail) whose `steps.fee_schedule.basis_year` (`trace.ts:125-131`) has no `pfs_rvu` record at all in the run's release. Optionally also `ENGINE_ERROR no_gpci` / `no_conversion_factor` (`reasons.ts:44,46`) for a basis year not loaded.
- The `pfs_rvu` span is not in `rule_release_content_span`, and **adding it there is DDL (Lane A)**. Instead, use an app-role SELECT over `rule_record` (granted at `20261015120000_rule_content.sql:88`), for example `SELECT DISTINCT extract(year FROM effective_from) ... WHERE release_no=$1 AND record_type='pfs_rvu'` over the index at `:37`. Or read years from `value.year` (`schema.ts`, the pfs_rvu refine at `:458-467`).
- The Coverage counts are `coverageInEffect` (`apps/web/src/lib/coverage/in-effect.ts:72-90`). Split the NO_PFS_VALUE count there or beside it. Do not touch the reason table.
- **One content alert per run.** In `execute.ts` after completion (`:311-315`), count the lines whose gap is content not loaded (the fee-schedule year, or any `ENGINE_ERROR` content detail outside its type's span). Log once, a fixed message, for example `CONTENT_ALERT_MESSAGE` / `CONTENT_NOT_LOADED`. Log the engine-error page only for the rest.
  - Keep `pricing_run.coverage` unchanged. Its schema is strict `tp-pricing-coverage/1` (`apps/worker/src/price/coverage.ts:19-50`), and `pages_operator` comes from `pagesOperator` in the frozen `reasons.ts:97-100`. Compute the split at log time instead of re-storing.
  - The message constant goes in `infra/lib/jobs.ts` (not #42). Its metric filter and alarm go in `infra/lib/constructs/monitoring.ts` (**#42, later PR**).
- **"Once loaded, the monitor offers a re-run."** `rerunReasons` already offers `release_published` (`rerun.ts:33-44`; `display.tsx:42`). A precise `content_loaded` reason (`RERUN_REASONS` at `rerun.ts:24`, `RERUN_TEXT` at `display.tsx:40-45`) is code only. But **rerun.ts is co-001/superseded-rerun's file**, so coordinate under LANES rule 6, or leave `release_published` as it is.

## 6. The screening's out-of-span refusal: built in PR 6b

PR 6b's scope included "#7's screening refusal" (`/home/user/ops/HANDOFF.md:428`). PR 6b-2 (#36, merged a33b0fd; HANDOFF `:43`) built it:
- The browser leaves out and counts Medicare rows outside the loaded quarters (`apps/web/src/lib/screening/parse.ts:36,228-233`).
- The server refuses `band_outside_content` (`apps/web/src/lib/screening/routes.ts:75-76,246,419,717`).
- `submit_screening()` refuses `screening_band_outside_content` (migration `20261105090000:44`, `:758`; re-created in `20261106090000_screening_consumer.sql:314`).
- The result shows a dated message: "Not screened: quarters outside the loaded content" with the quarters named (`apps/web/src/components/screening/result-summary.tsx:169-175`; `contentQuartersText` at `format.ts:597-600`; `quarterRowsLayBefore` at `content-span.ts:53-56`).
- Recorded in ADR 0062 `:552,871-884` and ADR 0064 `:193-216,300-308`.

**Nothing to build.** `apps/web/src/lib/screening/*` sits in #42's area: `messages.ts` and `routes.ts` are listed in pr42-files.txt. Do not touch it.

## 7. README text (#7 allows procedure text only)

`content/sources/README.md:79-87`:
- `:79-80`: files with no dates take the calendar year.
- `:67`: the MUE row is imported for one typed quarter.
- `:86-87`: "Each NCCI quarter and each code-list export is complete, so remove the previous one's draft before importing the next." This deletes the MUE history.

Replace it with: keep every MUE (and fee-schedule) quarter and close its window with `--effective-to`. Overlap with #30's README rewrite: one edit.

## 8. Synthetic release and cases

- New fixture release **900007** (and 900008 if needed). Both are free: `git grep -E '90000[78]\b'` over `claude/build-platform` and every `origin/co-001/*` head finds nothing.
  - Existing numbers: 900001-900006 directories, 900100 (scale), and in-DB test numbers 900009, 900011-900014, 900021, 900050, 900099.
  - The parallel Lane B branches are not on the remote yet (`git ls-remote origin 'co-001/*'` lists none of the five), so check again before the build.
  - Contents: release 900001 with `ncci_mue` and per-code `mppr_rate` windows ending 2026-09-30 (a quarter early), built by `tools/release/synthetic.ts`. 900001-900004 stay unchanged (reconciliation-001 `:447`).
- Cases RCC-01..08 (test-matrix rows, synth cases `packages/synth/src/cases/registry.ts` and `matrix.ts`, shared under rule 6):
  1. An MA month in 2026-Q4 is refused `waiting_on_content`, naming MUE and per-code MPPR and 2026-Q4, with dollars.
  2. A commercial fixed-fee Q4 month prices.
  3. A Q3 month prices.
  4. The monitor waits with no daily loop, then prices once a covering release is in force.
  5. Triage holds a pre-existing priced line whose trace read lapsed content.
  6. Coverage shows the year-not-loaded sentence.
  7. One content alert per run, and no engine-error page for it.
  8. A re-run under a still-lapsed release fails too.

## 9. Every file each part touches

| Part | Files | #42? | DB CHECK or enum? |
|---|---|---|---|
| Span helper (pure, trace test) | new `apps/worker/src/price/content-gaps.ts` (+test), exported via `apps/worker/src/price/public.ts`; imports `parseDateMultirange` from `apps/worker/src/screening/format.ts` (read only) | no | none (uses the existing function) |
| Run refusal | `apps/worker/src/price/execute.ts` (FailureCode `:43`, hook `:276-309`, alert `:311-315`); `apps/web/src/components/pricing/display.tsx` (FAILURE_TEXT) | no | `failure_code` regex only: no DDL |
| Monitor | `apps/worker/src/monitor/plan.ts`, `apps/worker/src/monitor/job.ts`, tests `monitor.db.test.ts`, `job.test.ts` | no | none |
| Coverage | `apps/web/src/lib/routes/coverage.ts`, `apps/web/src/app/p/[practiceId]/coverage/page.tsx`, new `apps/web/src/lib/pricing/content.ts`, maybe `apps/web/src/lib/coverage/in-effect.ts`; a component beside `apps/web/src/components/pricing/location.tsx` | no (`routes/practice.ts` and `routes/index.ts` are #42 but need no change: the routes already exist) | none |
| Triage hold | `packages/triage/src/actionable.ts` (+test, `index.test.ts`), `apps/worker/src/triage/execute.ts`, `apps/worker/src/report/content.ts`, `apps/worker/src/report/html.ts` | no | none (code list) |
| Content alert | `apps/worker/src/price/execute.ts`, `infra/lib/jobs.ts`; alarm in `infra/lib/constructs/monitoring.ts` | **monitoring.ts is #42: later PR** | none |
| Digest line for waiting months (optional) | `apps/worker/src/digest/job.ts` | **#42: later PR** | none |
| Pricing settings list (optional) | `apps/web/src/lib/routes/settings.ts` | **#42: later PR** | none |
| README | `content/sources/README.md:79-87` | no | none |
| Fixture | `fixtures/synthetic/rules/release-synth-900007/**` (generated), `tools/release/synthetic.ts` input | no | none |
| Docs | ADR 0071, `docs/product/test-matrix.md` RCC-01..08, `docs/product/reconciliation-001.md` (shared, rule 6) | shared | none |

**DB CHECKs or enums the codes would need: none.** Things that **would be DDL, so hand them to Lane A if wanted:**
- Mirroring the refusal in `pricing_run_rules()`.
- Adding `pfs_rvu` to `rule_release_content_span`.
- Adding a cause to the `pricing_check` CHECK.
- A stored per-run content-gap column.

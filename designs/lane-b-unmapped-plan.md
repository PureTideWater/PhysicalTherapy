# Lane B design: one unmapped plan no longer freezes a whole month (combined audit #32)

- **Item:** combined audit #32, "One unmapped plan freezes a whole month" (`/home/user/ops/audits/combined/combined-report.md`, section 32); LANES.md queue item 10 (`/home/user/ops/LANES.md:118`).
- **Branch:** `co-001/unmapped-plan`, cut from `claude/build-platform` after PR #50 (combined audit #10) merges. Designed against `/home/user/superseded-rerun` at `ed85bcf3` (`co-001/superseded-rerun`: `claude/build-platform` 6ddd587, plus #50, plus the merge of #54). Every `file:line` below was read there. #50's rule is in `/home/user/ops/designs/lane-b-superseded-rerun.md`.
- **Revision 2** (this text): every finding of the adversarial review (`/home/user/ops/designs/lane-b-unmapped-plan/review.md`) is applied or kept with evidence; see §14, "Review and dispositions".
- **Lane rules applied:** no migration and nothing under `packages/db/migrations` or `docs/product/domain-model.md`. No non-test change under `packages/pricing`. No file of open PR #42 (`/tmp/claude-0/pr42-files.txt`), apart from the shared documents (`docs/product/test-matrix.md`, `docs/product/reconciliation-001.md`, `packages/synth/src/cases/matrix.ts`, `registry.ts`, and amendments to older ADRs). The founder's standing rule applies: the best option only, never weighted by build effort, and the safer option on security. The co-founder's ruling of 2026-10-26 ~00:20 UTC applies: every choice is taken and recorded with its reasons, with no open questions.
- **The milestone 3 exception** ("an unmapped plan blocks pricing") was granted in the founder's adoption of the combined audit (`/home/user/ops/HANDOFF.md:336-339`, "Founder rulings of 2026-10-20 ~15:10 UTC (combined audit)": "Adopt all of it. The 19 freeze exceptions are granted").

**Short answer:**

- **Pricing.** A pricing run no longer refuses a period because one of its plans has no mapping. Each line of such a plan is left unpriced as the existing `NO_MAPPING`, one by one, and every other line prices. This takes no engine change and no new unpriced reason. The contracts resolver already gives `NO_MAPPING` for every line of an unmapped plan (`packages/contracts/src/resolver.ts:163-165`), and the engine already stops such a line (`packages/pricing/src/engine.ts:443-445`). The PR deletes the guard in three places: the run's creation, its execution, and the monitor's handling of the guard's error.
- **A period where no plan has any mapping still gets no run** (D2). That run would price nothing.
- **When a mapping queues pricing** (D2b). Mapping a plan queues monitoring only when it leaves at least one month that no run covers with every plan of its lines mapped, so a new practice that maps all its plans gets first runs at once, with no re-run and no hand acceptance, as today. When months holding the plan still wait on other plans' mappings, the page says so and offers "Price them now". The daily monitor prices such mixed months anyway (the audit's rule), so nothing waits more than a day.
- **Coverage records.** A run's coverage records each plan that had no mapping when it was priced, with its line count and billed cents (`tp-pricing-coverage/2`).
- **Wording.** Coverage, Pricing runs, the home page, the coverage report and the printed audit report say "N plans have no mapping; their lines are not priced".
- **After mapping.** A new practice-wide figure says how many lines of mapped plans are still `NO_MAPPING` in the pricing in effect. The mapping list (for the practice) and each plan's page (filtered to that plan) list the runs in effect holding those lines, and offer "Price these months again", which creates #50-conforming re-runs in that person's name, one per run in effect. Each is accepted by hand, and the list then says "triage it on Cases" until triage has judged the newly priced lines.
- **The persisted notice and email** ("A new plan appeared: N lines, $X billed, waiting for its mapping.") need a migration (a new notification kind and role-filtered recipients) and PR #42's mail outbox and display. They go to Lane A and to a Lane B follow-up after #42. This PR ships the live notices on the screens.
- **No migration.** Postgres does not enforce MAP-01 today.

---

## 1. The defect today

### 1.1 Where the refusal happens

| Layer | Where | What it does |
| --- | --- | --- |
| Contracts guard | `packages/contracts/src/coverage.ts:27-57` | `unmappedPlanIds` lists the plans of the run's lines that have no mapping at all. `assertPricingAllowed` (`:51-57`) throws `PricingRefusedError` (`:27`, message "pricing is refused until every plan is mapped: N plan(s) have no mapping") when any plan is unmapped or any line names no plan. |
| Contracts, practice form | `packages/contracts/src/load.ts:255-258` | `assertPracticePricingAllowed` loads the plans' mappings and calls the guard. |
| Run creation (person and job) | `apps/worker/src/price/create.ts:101-106` | `runPlans` (`apps/worker/src/price/lines.ts:39-46`) lists one line per plan of the period, then `assertPracticePricingAllowed`. No run row is written. |
| Run execution | `apps/worker/src/price/execute.ts:282-292` | The guard runs again on the run's plans and the mappings loaded for pricing. On `PricingRefusedError` the run fails as `unmapped_plan` (`FailureCode`, `execute.ts:48`) and keeps no line. |
| Monitor | `apps/worker/src/monitor/plan.ts:195-206` | `createPricingRun` throws, the month goes to `waitingOnMapping`, and no run is created. |
| Monitor job | `apps/worker/src/monitor/job.ts:49-52` | Logs at info only: `'monitoring left months waiting on a plan mapping'`, `error_code: 'UNMAPPED_PLAN'`. |
| Person's run | `apps/web/src/lib/routes/pricing.ts:428-430` | A field error: "…pricing is refused until every plan is mapped…; map them on the Payer and plan mapping screen". |
| Screens | `apps/web/src/lib/contracts/mapping-queries.ts:552-572` (`pricingReadiness` runs the same guard over every line with a `service_date`) | Coverage (`apps/web/src/app/p/[practiceId]/coverage/page.tsx:142-157`) and Pricing runs (`pricing-runs/page.tsx:67-77`) show "Pricing is refused until every plan is mapped" in red. Mapping's lead says "Pricing never runs on a plan with no mapping" (`mapping/page.tsx:45-46`). |
| Reports | `apps/worker/src/report/documents.ts:62,305-307`; `apps/web/src/components/reports/documents.tsx:60` | The coverage report says "N plans had no mapping at all: a pricing run over them is refused until they are mapped." |
| **Postgres** | none | **No SQL refuses a run or a priced line for an unmapped plan.** `pricing_run_rules()` (latest in `20261105090000_pricing_location_and_zip_plus_four.sql:526-617`) checks the release, the location, the cut-off and the split, never a mapping. `priced_line.mapping_id` is nullable (`20261018090000_pricing_runs.sql:63`). Its only mapping check is that a version names its mapping (`:97`, `priced_line_version_names_its_mapping`), and the statement trigger only requires a named mapping to be the practice's (`:188`). Already today, MAP-02 lines are stored with `NO_MAPPING` and no mapping. |

The "line names no plan" half of the guard never fires, because `service_line.payer_plan_key` is NOT NULL (`20261016120000_remittances.sql:169`). `pricingReadiness`'s `linesWithoutPlan` is always 0.

### 1.2 Who is told

- **Nobody, by notice or email.** The monitor only logs (`job.ts:49-52`). No notification is written, because `notifyRun` (`apps/worker/src/monitor/chain.ts:95-101`) runs only after a run is priced and triaged, and there is no run. The digest (`apps/worker/src/digest/job.ts`, #42's file) counts runs.
- **The screens show it only to people who open them.** The home page's queue "Plans waiting on a mapping" shows a count (`apps/web/src/app/p/[practiceId]/page.tsx:123`, from `apps/web/src/lib/dashboard/queries.ts:127`, which counts unmapped and partly mapped plans). Coverage and Pricing runs show the red refusal.

### 1.3 Which lines go unpriced

Every line of the month goes unpriced, not just the unmapped plan's. No run exists, so no line of that month has pricing in effect. Coverage counts the whole month as unpriced; triage never sees its lines, so there are no validated or actionable lines and no case; and the dispute windows (computed from remittance dates) run on.

### 1.4 A concrete timeline (the audit's case)

| Day | Event | State |
| --- | --- | --- |
| D0 | The practice's first ERA export loads (ADR 0060). Export plans are `PLAN:<plan>`, distinct from the 835's `CE:<plan>`, so its plans are new and unmapped (`docs/adr/0060-…md:209-212`). The months it touches also hold 835 lines of mapped plans. | Monitor: `createPricingRun` → `PricingRefusedError` → `waitingOnMapping` (`plan.ts:199-201`); an info log. No run for any of those months. |
| D1 to Dn | The daily monitor plans the same months again (`uncoveredMonths`, `plan.ts:91-112`) and is refused again each day. | The mapped payers' shortfalls in those months are never validated. No case and no packet. Their windows run. |
| Dn | Someone opens Coverage, sees the red alert and maps the plans. | Mapping queues nothing (`apps/web/src/lib/routes/mapping.ts:93-160`). |
| Dn+1 | The daily monitor prices the months as first runs. | Findings appear n days late, and lines whose window closed meanwhile are lost. |

Payers add plans all the time, so a two-claim plan stops findings for every payer in every month it touches.

---

## 2. The design: price the month anyway

### 2.1 The rule

1. **A run prices every line of its period.** A line whose plan has no mapping at all is left unpriced as `NO_MAPPING`, like a line no mapping's dates cover (MAP-02). No new unpriced reason; `docs/product/unpriced-reasons.md:11` ("The payer and plan have no mapping on the service date | Map the plan") already describes both.
2. **A period where no plan of its lines has any mapping gets no run** (decision D2). Such a run would price nothing. Today's behavior for these months stays: the monitor leaves the month waiting (logged), and a person's run is refused with a field error.
3. **A mapping queues pricing only when it completes a month** (decision D2b, §4.1). Mapping a plan queues monitoring when, after the mapping, at least one month that no run covers holds this plan's lines and has every plan of its lines mapped. Otherwise the plan's page and the mapping list say how many months wait on other plans' mappings and offer "Price them now". The daily monitor prices mixed months as rule 1 says, so no month waits more than a day for its mapped plans' findings. First-upload onboarding (upload, map every plan, priced) stays as it is: only the last mapping queues the monitor, which prices every month as a first run, with no re-run and no hand acceptance.
4. **Nothing is refused at execution.** The execution-time guard goes. A queued run whose plans were mapped at creation still has mappings at execution, because a mapping is corrected, never removed (`apps/worker/src/price/rerun.ts:216-217`; the mapping table grants no DELETE, `20261016160000_…sql:661`). A run created before this PR and executed after it prices as rule 1 says. `FailureCode` keeps `'unmapped_plan'` for the runs that already failed with it (`failure_code` is free text with no SQL list, `20261018090000_pricing_runs.sql:43-44`). Its words are reworded (§5.4).

### 2.2 Mechanism (no engine change)

- **The engine is untouched.** `NO_MAPPING` is produced outside the engine, by `@tp/contracts`' resolver from its inputs. `agreementResolver(...).resolve` returns `{ outcome: 'NO_MAPPING' }` when `mappingInForce` finds no mapping for the line's plan on its date, and an unmapped plan has none (`packages/contracts/src/resolver.ts:163-165`). The engine records that outcome as the line's unpriced reason (`packages/pricing/src/engine.ts:443-445`). `execute.ts` already prices every line through `lineResolver(records)` (`execute.ts:296`). Removing the guard is the whole change on the pricing path. `git diff -- packages/pricing/src ':!**/*.test.ts'` stays empty, and `tools/engine-freeze` passes with no exception.
- **`packages/contracts`** (not engine-frozen):
  - Delete `PricingRefusedError`, `assertPricingAllowed` (`coverage.ts:27-57`) and `assertPracticePricingAllowed` (`load.ts:255-258`), and their exports (`index.ts:93,120`).
  - Keep `unmappedPlanIds` (`coverage.ts:45-48`).
  - Add `practiceUnmappedPlanIds(scope, request, lines): Promise<string[]>`, which loads the plans' mappings exactly as `assertPracticePricingAllowed` did and returns `unmappedPlanIds` instead of throwing.
  - Rewrite the module comment (`coverage.ts:7-18`) to the new rule.
- **`apps/worker/src/price/lines.ts`:**
  - Export the line condition `RUN_LINES` holds apart from its period and cut-off as `PRICEABLE_LINE` (`c.claim_status_code <> '22' AND c.superseded_by_claim_id IS NULL AND coalesce(l.service_date, c.service_from) IS NOT NULL`), and build `RUN_LINES` from it, so every count of "a plan's lines" in this PR is the run's own line set (finding 10). The SQL `RUN_LINES` produces is unchanged (the `IS NOT NULL` is implied by its `BETWEEN`).
  - The comment (`:35-38`) says `runPlans` serves the "nothing mapped" check and the coverage's unmapped plans.
- **`apps/worker/src/price/create.ts`:**
  - Replace `:105-106` with: `const unmapped = await practiceUnmappedPlanIds(...)`. When `unmapped.length === plans.length`, throw a new `PricingRunNothingMapped` (counts only: `plans`). Otherwise go on to `assertLocation` and `recordRun` as today.
  - The class comment says why: a run over a period where no plan has a mapping would price nothing, and the month is priced once a mapping completes it (D2b) or by the daily monitor once any of its plans is mapped.
  - The location check keeps its order after the mapping check, so a month that is both all-unmapped and missing its ZIP is reported as waiting on a mapping. Mapping it then meets the location wait, as today.
- **`apps/worker/src/price/execute.ts`:**
  - Delete `:282-292` (the guard and its `failRun`).
  - Keep `runPlans` for coverage (below).
  - Update the module comment and `FailureCode`'s doc comment: `unmapped_plan` is historical, recorded before combined audit #32.
- **`apps/worker/src/price/rerun.ts:208-218`:** `createRerun`'s comment changes. Today it reads "whose plans were all mapped when it was created … the price job checks MAP-01 again when it executes the re-run". It should say that a re-run prices the same lines, and any plan still unmapped stays `NO_MAPPING`.
- **`apps/worker/src/monitor/plan.ts:199-201`:** catch `PricingRunNothingMapped` in place of `PricingRefusedError`, so the month is still listed in `waitingOnMapping`. The `MonitorPlan` type (`:66`) is unchanged; its doc comment says "Months none of whose plans has a mapping". The module comment's step 3 is reworded the same way.
- **`apps/worker/src/monitor/job.ts`:**
  - `:49-52`: the same log message and `error_code: 'UNMAPPED_PLAN'`, plus `record_count: plan.waitingOnMapping.length` (an existing field, already used at `job.ts:59`; `packages/observability/src/fields.ts` is #42's and is not touched). The comment says these are months with no mapped plan at all.
  - The header comment (`:7-10`) adds the two new keys of the request form: `monitor:<practice>:<request>` after a mapping that completes a month, and after "Price them now".
- **`apps/web/src/lib/routes/pricing.ts:428-430`:** catch `PricingRunNothingMapped` and return the field error on `fromMonth`: "None of these months’ plans has a mapping yet, so a run would price nothing. Map their plans on Payer and plan mapping; each month is priced once every plan it holds is mapped." Drop the `PricingRefusedError` import (`:1`).

### 2.3 What the run's coverage records

- `apps/worker/src/price/coverage.ts:19`: `COVERAGE_FORMAT` becomes `'tp-pricing-coverage/2'`. The schema gains:

  ```ts
  /** The plans of the run's lines that had no mapping at all when it was priced: their lines are NO_MAPPING, one by one. Opaque plan IDs, counts and cents. */
  unmapped_plans: z.array(z.strictObject({ plan_id: id, lines: count, charge_cents: centsText })),
  ```

  `centsText` is signed: a line's charge has no sign CHECK in SQL (`20261016120000_remittances.sql:149`), so a sum is never forced through a non-negative schema (finding 10).
- `runCoverageSchema` becomes a union on `format`. `/1` parses with `unmapped_plans` defaulted to `[]`. That is exact, not a guess: under the old guard, a `/1` run whose plans included an unmapped one could never complete (`execute.ts:285-291`), so no complete `/1` run had one. `parseCoverage` returns the `/2` shape for both.
- **Computation.** `computeCoverage(client, pricingRunId, unmappedPlanIds)` (`coverage.ts:139`). `execute.ts` passes `unmappedPlanIds(await runPlans(scope.client, lines), records.mappings)`, computed from the same `records` object the resolver priced with. So the list agrees with the `NO_MAPPING` lines it describes, even when a mapping commits mid-transaction (READ COMMITTED). The query is one `GROUP BY l.payer_plan_key` over the run's priced lines with `p.unpriced_reason = 'NO_MAPPING' AND l.payer_plan_key = ANY($2)`, ordered by plan ID.
- **Invariants**, checked in the unit test and the db test:
  - The sum of `unmapped_plans[].lines` is at most the `NO_MAPPING` reason's count. The difference is MAP-02 lines of mapped plans.
  - For a run over a month, created after every line of the month loaded, with no mapping made since, `unmappedPlanTotals` (§3.2) over that month equals the sum of `unmapped_plans` in plans, lines and cents (MAP-06, finding 10).
- **Postgres is unaffected.** It checks only `jsonb_typeof(coverage) = 'object'` and `coverage ->> 'lines'` (`20261018090000_pricing_runs.sql:42,152`; restated in `20261019150000_…:168` and `20261020090000_…:124`). No SQL reads the format.
- **Readers.**
  - `apps/web/src/lib/pricing/queries.ts:144` and `apps/worker/src/monitor/chain.ts:50` read through `parseCoverage`, unchanged.
  - `runNames` (`apps/web/src/lib/pricing/queries.ts:342-363`) collects plan IDs only from `coverage.patterns`, which hold priced lines only (`price/coverage.ts:170-183`), so it gains `coverage.unmapped_plans[].plan_id` (finding 9). An unmapped plan's payer is not needed: the run page names the plan by its key, as the patterns table does.
  - `apps/worker/src/report/content.ts:463` gains the report's sentence (§5.6).
  - `patterns` stays as it is: it already joins the mapping (priced lines only).
- **Why record it on the run rather than recompute it later** (decision D3): a run is immutable (CLAUDE.md rule 3), and the printed report must say what was true when the run priced, not what the mappings say on the day it is read.

### 2.4 MAP-01 re-read

| | Text |
| --- | --- |
| MAP-01 today (`docs/product/test-matrix.md:46`) | Unmapped payer and plan / "Pricing refused; coverage shows dollars waiting" |
| MAP-01 reworded | Unmapped payer and plan / "Each line of the plan is left unpriced as `NO_MAPPING`, one by one, and never priced; the run prices every other line of its period. Coverage shows dollars waiting" |
| PRD 5 (`docs/product/PRD.md:175`) | "Pricing never runs on an unmapped combination" becomes "Pricing never prices a line of an unmapped combination: each is left unpriced as NO_MAPPING, one by one, and the run prices every other line. A period with no mapped combination at all gets no run; it is priced once a mapping completes it, or by the daily monitoring once any of its combinations is mapped." The failure sentence gains: "when a plan is mapped, the mapping screens list the months holding its lines that are still not priced and price them again on request, each re-run accepted by hand and then triaged." |
| PRD 6 table (`PRD.md:237`) | "Pricing never runs on an unmapped combination" becomes "An unmapped combination's lines are never priced (NO_MAPPING, one by one) while every other line prices". |

The invariant MAP-01 protected still holds, line by line: no line of an unmapped combination is ever priced (resolver `:163-165`, engine `:443-445`). A run with such a line has `mapping_id IS NULL` and `expected_allowed_cents IS NULL` on it (`priced_line_priced_or_unpriced`, `20261018090000_pricing_runs.sql:86`).

### 2.5 Postgres

Postgres does not enforce the old rule (§1.1, last row), so lifting it needs no migration. Lane B builds all of §2. Nothing goes to Lane A for pricing.

---

## 3. The notice when a load brings lines of an unmapped plan

### 3.1 What exists today

- **Persisted in-app notices:** the `notification` table, written by `notify()` (`apps/worker/src/monitor/chain.ts:81-93`).
  - Its `kind` is a closed CHECK: `monitoring_run`, `digest`, `recoupment`, `follow_up` (latest at `packages/db/migrations/20261027090000_packet_and_ledger_review.sql:416-418`).
  - Its figures are closed lists of count and cents codes (`monitoring_figure_codes()`, `:422-435`). The codes `lines` (count) and `billed` (cents) already exist and say exactly "N lines, $X billed" (`:425-430`).
  - Recipients come from `practice_notification_recipients()` (`20261020090000_monitoring_digests_notifications.sql:236-252`): everyone who reaches the practice now, with no role filter.
  - The words are rendered by `NotificationText` in `apps/web/src/components/monitoring/display.tsx`, through `apps/web/src/lib/monitoring/queries.ts` (both #42's files).
- **Email:** PR #42's three SES streams and outbox (`apps/worker/src/mail/*`, `platform/mail-events.ts`, `digest/job.ts`). Its `mail_send` kind CHECK is in #42's own migration `20261107090000_mail_streams.sql`.
- **What reaches people about a mixed month once this PR lands:** the month is now priced and, when the monitor priced it, triaged, so `notifyRun` leaves its existing `monitoring_run` notification for it, with `lines`, `priced_lines` and `unpriced_lines` (`chain.ts:35-60,95-101`). The unmapped lines count among the unpriced.

### 3.2 What this PR builds (no migration, no #42 file)

**Live notices**, computed on each page load from the practice's data. Counts and cents only, and no plan or payer name in the notice itself.

**Figure 1, plans with no mapping:** `unmappedPlanTotals(scope, practiceId, period?)` in `apps/web/src/lib/contracts/mapping-queries.ts`. It replaces `pricingReadiness` (`:547-572`).

- **The line set is the run's** (finding 10): lines of the practice under `PRICEABLE_LINE` (§2.2: not a reversal claim, not a superseded claim, with a date through `coalesce(l.service_date, c.service_from)`), whose plan has no `payer_plan_mapping` row at all. The optional `period` restricts the dates, for the invariant test of §2.3.
- It returns `{ plans, lines, chargeCents }`. The cents are summed in SQL as bigint and returned as integer text, as `waitingTotals` does (`:50-58`).

**Figure 2, lines of mapped plans still not priced** (finding 4): `mappedNotPricedTotals(client, practiceId)`, from the worker module of §4.2 (`apps/worker/src/price/mapped-plan.ts`, exported through `@tp/worker/pricing`).

- It counts the lines whose pricing in effect is `NO_MAPPING` and whose plan has a mapping in force on the line's date now, with their billed cents. This is the same fragment (`MAPPED_NOT_PRICED`, §4.2) as the months to price again, without the plan filter.
- It returns `{ lines, chargeCents, runs }`, where `runs` is the number of runs in effect holding them.

**Where they show:**

- **Home page** (`apps/web/src/app/p/[practiceId]/page.tsx`): an Alert above the queues when either figure is non-zero. The data comes from `apps/web/src/lib/dashboard/queries.ts`. `dashboard()` gains `unmappedPlans: { plans, lines, chargeCents }` and `mappedNotPriced: { lines, chargeCents, runs }`, which `routes/practice.ts:167-168` passes through unchanged (it returns `dashboard(...)`'s value whole), so #42's file is not edited.
- **Coverage, Pricing runs and Payer and plan mapping:** the same figures replace the red "refused" alerts (§5).
- **Who sees them:** everyone who opens the practice (`practice.open`). The home page's queue count is already visible to them (`page.tsx:123`). The link reads "Map them" for holders of `mapping.edit` (the billing manager and the firm principal, `packages/db/src/authz/permissions.ts:67,142`). For others it reads "See them on Payer and plan mapping". Decision D6.

### 3.3 What follows (recorded; not in this PR)

1. **Lane A migration request** (sent by the orchestrator to Lane A's queue, with this paragraph as its reason). One migration, with the domain model regenerated and approved by the founder:
   - (a) The `notification_kind_check` value `unmapped_plan`. The subject is the plan's opaque ID, and there is one notice per person per plan, under the existing once-per-person-kind-subject rule (`notification_once UNIQUE (user_id, kind, subject_id)`, `20261020090000_…sql:279`).
   - (b) A recipients function, `practice_notification_recipients_with(permission text)` or a role-filtered variant, that returns only the people who reach the practice and hold `mapping.edit`. The audit names billing managers, and today's function has no role filter.
   - (c) After #42 merges, the `mail_send` kind for this notice in #42's mail CHECK.

   No new figure code is requested: `lines` and `billed` already exist (review 12c). Why a migration: each of (a) to (c) is a closed SQL list or a SECURITY DEFINER function, and Lane B never opens a schema PR.
2. **Lane B follow-up PR**, after #42 and that migration merge. Proposed ID MAP-10, reserved here (§8). The worker writes the notice at the end of the monitor's planning, when the batch brought lines of a plan with no mapping: "A new plan appeared: N lines, $X billed, waiting for its mapping." The cents come from code, as integer cents rendered by the money formatter. The notice goes to the people who may map plans (`mapping.edit`: the billing managers and the firm principal) in the app and by email through #42's notices outbox. It renders in `NotificationText` and links to `/p/<practice>/mapping/<planId>`, which carries opaque IDs only. The email body carries counts and cents only, with no payer, plan, member ID or claim number. The plan's name is shown only after sign-in, on the mapping page.
3. **Recorded in ADR 0075** (§6.2) and in reconciliation-001's milestone 3 row, so the audit's notice is not lost.

---

## 4. After mapping

### 4.1 Months with no run: when a mapping queues pricing (D2b)

**The check.** A new worker function, `monthsAwaitingMappings(client, practiceId)` in `apps/worker/src/price/mapped-plan.ts`:

- It takes the months `uncoveredMonths` lists (`apps/worker/src/monitor/plan.ts:91-112`, exported as it is), and for each one counts the plans of its lines (under `PRICEABLE_LINE`) with and without any `payer_plan_mapping` row, and the plan IDs it holds.
- It returns each uncovered month as `{ periodFrom, periodTo, planIds, unmappedPlans, mappedPlans }`, in one query over the months' array, oldest first.

**On a mapping.** `mapPlanAction` (`apps/web/src/lib/routes/mapping.ts:93-160`), when it creates a mapping (a new one or a correction, never on the `unchanged` path, `:146-148`):

1. After `mapPlan`, in the same transaction, it calls `monthsAwaitingMappings`.
2. When at least one month holds this plan's lines and has `unmappedPlans = 0`, it registers `afterCommit(() => services.queue.enqueue('monitor', { practice_id: practiceId, request_id: request.requestId }))`. This is exactly the location save's pattern (`apps/web/src/lib/routes/settings.ts:720`; the job key `monitor:<practice>:<request>`, `apps/worker/src/monitor/job.ts:7-10`), queued after the commit so the plan it starts reads the new mapping. The redirect's notice is then `mapped_pricing` (or `corrected_pricing`).
3. Otherwise nothing is queued, and the redirect's notice is `mapped` (or `corrected`).

The monitor then plans the months no run covers: the months the mapping completed get first runs, as do any mixed months (rule 1). A first run is in effect when it completes, with no acceptance, and the monitor's chain triages it. That is right here: nothing was in effect for those months, so there is no pricing for a person to compare against.

**Mixed months waiting.** A month that no run covers, with at least one mapped and one unmapped plan, is shown:

- On the plan's page, for months holding that plan's lines: "{N} months holding this plan’s lines wait for {P} other plans’ mappings. Map those plans first, so each month is priced once. Or price them now: the lines of plans still with no mapping stay unpriced as NO_MAPPING, and those months need pricing again once their plans are mapped. Monitoring prices them anyway at its next daily run."
- On the mapping list, for the whole practice, the same sentence with "{N} months wait for {P} plans’ mappings".
- With the button "**Price them now**" for holders of `mapping.edit`.

**"Price them now"**: a new route, `practice.mapping.price_waiting` (`apps/web/src/lib/routes/mapping.ts`), with its server action in `apps/web/src/app/p/[practiceId]/mapping/actions.ts`.

- `kind: 'action'`, `phi: true`, `permission: 'mapping.edit'`, `params: { practiceId }`, input `{ planId?: opaqueId }` (only to choose the redirect).
- `audit: { action: 'monitoring_requested', objectType: 'practice' }` (`audit_event.action` is a free regex, `20261015140500_audit_and_operations.sql:9`).
- `handle`: when a `planId` is given, load it by `(id, practice_id)` or return `NotFoundError`. Register `afterCommit` for the request-keyed `monitor` job, as above. Redirect to the page it came from with `notice=pricing_requested`.
- It is in `RUN_STARTING_ROUTES` (finding 8), because the monitor it queues creates runs: a suspended practice is refused by the route wrapper with the database's reason (`apps/web/src/lib/http/invoke.ts:500-505`), and the monitor job is refused again in the worker (`apps/worker/src/billing/refusal.ts:14`).
- It never creates a re-run: the monitor creates first runs only (`pricing_run_job_creates_first_runs`, `20261020090000_…sql:46`).

**Why D2b** (finding 2): queuing the monitor on every mapping would price a new practice's months as first runs as soon as its first plan is mapped, so every later mapping would need a re-run and a hand acceptance per month (plans × months acceptances where today there are none). Queuing on completion keeps onboarding at zero acceptances, and the daily monitor keeps the audit's rule that no month freezes.

### 4.2 Months already priced: "Price these months again"

**The fragment.** `apps/worker/src/price/mapped-plan.ts` defines `MAPPED_NOT_PRICED(practice, lineFilter)`: the service lines (under `lineFilter`) whose pricing in effect is `NO_MAPPING` while a mapping is now in force on their date, with the run in effect that holds each:

```sql
WITH candidate AS (                     -- lines some run left NO_MAPPING (the inner filter only narrows the set)
  SELECT DISTINCT x.service_line_id FROM priced_line x
   WHERE x.practice_id = $1 AND x.unpriced_reason = 'NO_MAPPING'
), in_effect AS (${PRICED_IN_EFFECT('$1', 'p.service_line_id IN (SELECT service_line_id FROM candidate)')})
SELECT p.pricing_run_id, l.id AS service_line_id, l.payer_plan_key AS plan_id, l.charge_cents,
       m.id AS mapping_id, m.created_at AS mapping_created_at
  FROM in_effect p
  JOIN service_line l ON l.id = p.service_line_id JOIN claim c ON c.id = l.claim_id
  JOIN payer_plan_mapping m ON m.id = payer_plan_mapping_in_force(l.payer_plan_key, coalesce(l.service_date, c.service_from))
 WHERE p.unpriced_reason = 'NO_MAPPING' AND (${lineFilter})
```

- The outer `p.unpriced_reason = 'NO_MAPPING'` decides, after `PRICED_IN_EFFECT` (`apps/worker/src/price/in-effect.ts:39-43`) has chosen each line's pricing in effect. Filtering inside `PRICED_IN_EFFECT` would pick an older priced line and is not done.
- `payer_plan_mapping_in_force()` (`20261103090000_…sql:643-657`) mirrors `mappingInForce`, and a db test already compares the two.
- The `lineFilter` is `true` for the practice, or `l.payer_plan_key = $2` for one plan.

**Which runs.** `monthsToPriceAgain(client, practiceId, planId | null)` groups `MAPPED_NOT_PRICED` by run: the run's period, release and status, its `lines` and `charge_cents` (bigint sum as text), and `newest_mapping_at`, the latest `mapping_created_at` among its listed lines. Ordered by `period_from, period_to, id`.

- Every such run is in effect by construction: it holds a line's pricing in effect. So #50's `not_in_effect` refusal (`rerun.ts:233-235`) cannot apply to a listed run. The action checks it again anyway, through `createRerun`.

**Each listed run gets one state** (findings 5 and 6). A re-run of the run *counts* when it was created after the run's `newest_mapping_at`, is not failed, is not accepted, and, when complete, its `RERUN_ACCEPTANCE` (`in-effect.ts:135-139`) is `awaiting` or `newer_run_pending`. A re-run whose `RERUN_ACCEPTANCE` is `superseded` or `release_withdrawn` can never be accepted (`acceptRun`, `rerun.ts:305-365`), so it does not count. The states, in this order:

| State | When | Offered |
| --- | --- | --- |
| `being_priced` | A counting re-run is queued or running | No action. "Being priced again" |
| `to_accept` | A counting re-run is complete with `RERUN_ACCEPTANCE = 'awaiting'` | A link to the re-run's page, where it is accepted by hand after its diff (J17; #50's `rerunBlock` decides whether Accept shows): "Priced again: review and accept" |
| `waiting` | The run is `NEWER_RUN_PENDING` (`in-effect.ts:123`), or a counting re-run is complete with `RERUN_ACCEPTANCE = 'newer_run_pending'` | No action. "Waits for a newer run of these dates to finish; it is listed again then, or priced by it". That newer first run reads the new mappings when it prices, so it may itself price the lines, and the list is computed again on each load |
| `ready` | None of the above | Included in "Price these months again" |

Because the state is the run's, keyed on the newest mapping covering any of its listed lines, the practice-wide list and every plan's page show the same state for a run. A run pressed after plan B was mapped and listed again after plan C is mapped is `ready` once more (its re-run predates C's mapping and would leave C's lines `NO_MAPPING`), and pressing then creates one re-run that prices both. Pressing on two plans' pages before either re-run finishes never creates a second re-run of the same run (finding 5).

**After acceptance: "triage it on Cases"** (finding 3). A re-run a person created is never chained to triage (`apps/worker/src/price/job.ts:47-49`; `chain.ts` header; ADR 0038: "a person who works cases triages a complete run from the Cases screen"). So `monthsToTriage(client, practiceId, planId | null)` lists, below the months to price again, each accepted re-run in effect (`rerun_of_id IS NOT NULL AND accepted_at IS NOT NULL`, and `RUN_IN_EFFECT`) that holds, as pricing in effect, a line of the listed plans (a mapped plan, or the one plan) which triage would advance and has not:

- the line is priced (`unpriced_reason IS NULL`), with a positive shortfall by `@tp/triage`'s own `shortfallOf(variance_cents, priced_line_visit_variance_cents(p.id))` (`packages/triage/src/actionable.ts:122`), which is exactly the condition triage validates on (`apps/worker/src/triage/execute.ts:432`, "Validated: a positive shortfall … whatever else holds");
- it is in no `case_line` (triage's own exclusion, `execute.ts:242`);
- its newest `line_status` stage ranks below `validated` (`advanceStages`, `execute.ts:310-327`, writes only then).

Once triage has run on the re-run, every such line is at `validated` or beyond, and the row leaves the list. The state is `to_triage`: "Priced again and accepted: triage it on Cases", linking to `/p/<practice>/cases` for holders of `case.work`; for others, "Priced again and accepted: waits for triage by a person who works cases". The query reads `priced_line` through the same `readWithAudit` purpose as the other listing (`objectType: 'priced_line'`, purpose `mapping`). Not auto-triaging is decision D13.

**The action.** A new route, `practice.mapping.price_again` (`apps/web/src/lib/routes/mapping.ts`), with its server action `priceAgainFormAction` in `apps/web/src/app/p/[practiceId]/mapping/actions.ts`. The mapping list's form posts no `planId` (the practice's runs); a plan page's form posts its `planId` (that plan's runs).

- Fields: `kind: 'action'`, `phi: true`, `permission: 'mapping.edit'` (the same permission as the existing re-run, `pricing.ts:325`).
- In `RUN_STARTING_ROUTES` (`apps/web/src/lib/billing/runs.ts:10-20`, finding 8): a suspended practice gets the database's reason from the route wrapper, never a 500 from the `pricing_run_refused_while_suspended` trigger (`20261029150000_billing.sql:310`). The generated route tests (`route-tests/define.ts:146`) and `billing/config.test.ts:63` then cover it, unedited.
- Input, parsed by Zod:
  - `planId`: optional `opaqueId`.
  - `runIds`: hidden `runIds[]` fields joined by `apps/web/src/lib/http/form.ts`, as #50's `heldByIds` are (`pricing.ts:349-353`). Split, `opaqueId` each, at least one and at most `PRICE_AGAIN_LIMIT = 60`.
  - `releaseNo`: a positive integer, as on the re-run form.
- Audit: `{ action: 'plan_months_priced_again', objectType: 'practice' }`, with `objectId` the practice's ID. The route's audit object type is fixed per route, and one press may cover many plans; each re-run is attributed by its own event (below). The `audit_event.action` format is a free regex, so no migration is needed.

`handle`, in one practice-scoped transaction:

1. When `planId` is given, load the plan by `(id, practice_id)`. When it is missing, return `NotFoundError`. A plan of another practice is invisible under RLS anyway.
2. Compute `monthsToPriceAgain` (for the plan, or the practice) and take the `ready` runs, oldest first, up to the limit.
3. **Atomic and exact:** when the posted `runIds` are not exactly that set, throw `InputError` on `runIds`: "The months changed since this page was shown; review them below and try again." Nothing is created (`months_changed`). This mirrors #50's `diff_changed`: a person acts only on what the page showed them (decision D4).
4. For each run, oldest first:
   - Call `createRerun(scope, { practiceId, pricingRunId, releaseNo, requestId })` (#50's own function, `rerun.ts:219-251`, with its `not_found`, `not_complete`, `not_in_effect`, `newer_run_pending` and release refusals).
   - Then `services.queue.enqueue('price', { practice_id, pricing_run_id })` inside the request, as the single re-run does (`pricing.ts:340-341`, "a failure to queue undoes the re-run").
   - Then `recordAuditEvent(scope, { action: 'pricing_run_rerun_created', objectType: 'pricing_run', objectId: created.pricingRunId, practiceId, requestId })` (`packages/db/src/authz/audit.ts:102`). This is the same per-run event the single re-run's route records, so each re-run is attributable on its own.
5. Redirect to the page the form came from, with `notice=priced_again`. The section now shows each month as `being_priced`.

**Refusals reach the form** (finding 7). `refusal()` in `pricing.ts:300-311` is module-private and reports on `runId`, which this form does not have. The route has its own mapper, `priceAgainRefusal(error, run)`, in `mapping.ts`:

- `RerunRefusedError` → field `runIds`, naming the month by its dates: "{2026-03-01} to {2026-03-31}: {the service's message}." The service's messages are written to read after "This run:", and they read the same after the dates (for example "2026-03-01 to 2026-03-31: is not priced again yet, because a newer run of these service dates is waiting to be priced or being priced; once it finishes, re-run the run in effect."). Dates only, never PHI.
- `RuleReleaseMismatchError` → field `releaseNo`, as `pricing.ts:304-305` words it.
- `PricingLocationWaiting` (which `recordRun` throws for a re-run too, `create.ts:161-163`) → field `releaseNo` with `LOCATION_WAITING`, which `pricing.ts:289` exports for this.
- The whole request rolls back on any refusal. The form sets `refreshOnError` (`apps/web/src/components/action-form.tsx:21-46`) to `price-again`, as #50's Accept and Re-run forms do, so after a refusal the page is read again and the list shows the months as they are now.

**Jobs queued before a rollback** (review 12f). When a later step refuses, the `price` jobs already queued for this request's re-runs stay in the queue for runs that rolled back. `priceHandler` ends each harmlessly: the run is `missing`, retried until the last attempt and then logged once as `PRICING_RUN_NOT_FOUND` with the opaque run ID (`apps/worker/src/price/job.ts:28-35`). This is the existing behavior of the single re-run and of a person's run, and no data or PHI leaks. Queuing inside the request is kept because the opposite (after commit) could leave a committed re-run with no job.

**Every re-run is created in that person's name.** `recordRun` writes `created_by` from the scope's actor (`create.ts:123-135`). Postgres refuses a job's re-run (`pricing_run_job_creates_first_runs`, `20261020090000_…sql:46`), which is why this is a person's action and the monitor never re-runs.

**Accepted by hand.** Nothing here accepts. Each re-run's page lists its changes against the run it would replace and offers Accept under #50's rule (`acceptRun`, `rerun.ts:305-365`): refused when `superseded`, `newer_run_pending`, `changed_meanwhile` or `diff_changed`.

**What a re-run prices.** The original's lines, at the original's cut-off (`execute.ts:281`), under the release in force and the mappings, versions and settings read when it prices. Its diff therefore shows the plans' lines leaving `NO_MAPPING`. It also shows any other change since the original (another mapping, a signed-off version, a release), which the run page already explains through `rerunReasons` (`rerun.ts:43-53`, `mapping_changed` among them). That is the J17 contract and is intended. Lines loaded after the cut-off are priced by the monitor's own first runs, as today.

**Where the list sits** (decisions D5 and D14): on the mapping list for the whole practice (the place the practice-wide figure links to, and where a person who mapped several plans presses once), and on each plan's page filtered to that plan (where the redirect after mapping lands, `mapping.ts:154`). Both are the same action over the same states.

### 4.3 What the person sees

1. They map the plan. The page returns with one of:
   - `mapped_pricing`: "Mapped. The months whose plans now all have a mapping are being priced; they show on Pricing runs when done."
   - `mapped`: "Mapped." The sections below say what remains.
2. "Months waiting for a first run" (§4.1), when any, with "Price them now".
3. "Months holding this plan’s lines that are not priced" (§4.2): each month (the run's period, for example "2026-03-01 to 2026-03-31") with "N lines, $X billed, not priced" and its state.
4. When any month is `ready`, a button reads "Price these months again (N)", with the help text: "Creates a re-run of each month in your name. Nothing changes until you accept each re-run on its page, after its list of changes."
5. After pressing it, each month shows "Being priced again", then "Priced again: review and accept", linking to the re-run.
6. After acceptance, the month moves to "Priced again and accepted: triage it on Cases" until triage has judged its lines.
7. A person without `mapping.edit` sees the lists and states, with no button.

---

## 5. Coverage, the screens and the printed reports

The wording follows the audit, "N plans have no mapping; their lines are not priced". It is built with the plural helpers already used (`plural()` in `apps/worker/src/report/documents.ts`): "1 plan has no mapping; its lines are not priced". Figures are in mono (`Figure`/`Money`, BRAND.md §7), and there are no exclamation marks. "Recovered", "owed" and "AI" are absent (`tools/brand-copy`). Every sentence states only what is true for the lines it names (finding 11): other plans' lines "price as usual", which still allows every other unpriced reason. All copy goes through `pnpm lint:copy` and the UX review.

### 5.1 Coverage screen (`apps/web/src/app/p/[practiceId]/coverage/page.tsx:142-157`; data from `apps/web/src/lib/routes/coverage.ts:113`)

The ready/refused Alert pair becomes:

- **When every plan with lines has a mapping:** Alert (default), `data-state="mapped"`.
  - Title: "Every plan has a mapping".
  - Body: "Lines outside every mapping’s dates are left unpriced as NO_MAPPING, one by one."
- **Otherwise:** Alert (default variant, not `destructive`: nothing failed, decision D7), `data-state="unmapped"`.
  - Title: "{N} plans have no mapping; their lines are not priced".
  - Body: "{L} lines, {$X} billed. Lines of every other plan price as usual. [Map them] on Payer and plan mapping."
  - The figures are mono, and the status reads as text on the unpriced tint, never color alone (BRAND.md §4).
- **And, when figure 2 is not zero:** a second Alert (default), `data-state="mapped_not_priced"`.
  - Title: "{L} lines of mapped plans are still not priced".
  - Body: "{$X} billed, in {R} priced months, are still NO_MAPPING in the pricing in effect: their plans were mapped after those months were priced. [Price their months again] on Payer and plan mapping."
- The reasons table keeps the closed list's remedy for `NO_MAPPING`, "Map the plan" (`docs/product/unpriced-reasons.md:11`, unchanged). The second Alert sits above it and says which of those lines are already mapped.

### 5.2 Pricing runs (`pricing-runs/page.tsx:67-77`; `apps/web/src/lib/routes/pricing.ts:114-116`)

The red "Pricing is refused…" alert is replaced by the same `unmapped` Alert, with the body: "{L} lines, {$X} billed, are left unpriced as NO_MAPPING in any run until their plans are mapped. [Map them]." It no longer sits above the form as a blocker. The `mapped_not_priced` Alert shows here too, with the same words as Coverage.

### 5.3 Payer and plan mapping (`mapping/page.tsx:45-46`)

- The lead becomes: "Every payer and plan the 835s and exports name, and the agreement each is paid under. A plan with no mapping is never priced: its lines are left as NO_MAPPING while lines of every other plan price as usual, and they wait here with lines whose service date no mapping covers."
- Below the "Dollars waiting on mapping" card, two regions: "Months waiting for a first run" (§4.1) and "Months with lines of mapped plans not priced" (§4.2, practice-wide), each shown only when it has rows.
- The page's params gain `notice: z.enum(['priced_again', 'pricing_requested']).optional().catch(undefined)`.

### 5.4 Run page and failure text

- `apps/web/src/components/pricing/display.tsx:38`, `unmapped_plan`: "A plan of the period’s lines had no mapping, and runs then stopped for it (before combined audit #32); create a new run: it prices every mapped plan."
- The run page (`apps/web/src/app/p/[practiceId]/pricing-runs/[runId]/page.tsx`), beside `UnpricedReasons` (`display.tsx:444`): when `coverage.unmapped_plans` is not empty, it shows "When this run was priced, {N} plans had no mapping; their lines are not priced ({L} lines, {$X} billed)." Each plan links to its mapping page by opaque ID, named by its plan key from `runNames`, which now reads the unmapped plans' IDs (§2.3, finding 9).

### 5.5 The coverage report (stored, printed)

- **The schema** (`apps/worker/src/report/documents.ts:62`) keeps `readiness: { allowed, unmapped_plans }`. Its format string `tp-coverage-report/1` is pinned by `report_document_format` (`20261025090000_…sql:66`), so the keys stay.
  - `allowed` is documented as "every plan with lines has a mapping".
  - The schema gains optional `unmapped_lines: count` and `unmapped_charge_cents: centsText` inside `readiness`. They are optional because reports generated before this PR lack them, the same precedent as `runs_in_effect` (`:48`).
  - Filled in `apps/web/src/lib/reports/documents.ts:53,74` from `unmappedPlanTotals`.
- **Wording** (`documents.ts:305-307`):
  - When allowed: "Every plan with lines has a mapping."
  - When not allowed and the new fields are present: "{N} plans have no mapping; their lines are not priced ({L} lines, {$X} billed)."
  - When not allowed and the new fields are absent (a report stored before this PR, review 12d): the original sentence, unchanged: "{N} plans had no mapping at all: a pricing run over them is refused until they are mapped." It was true when that report was generated, and a stored document is never reworded into a different claim.
- **The web view** (`apps/web/src/components/reports/documents.tsx:60`): the same three sentences under the same conditions.

### 5.6 The printed audit report

- **Content** (`apps/worker/src/report/content.ts:208-214,785-791`): `coverage` gains `unmapped_plans: { plans: number; lines: number; charge_cents: string }`. It is computed from the run's `coverage.unmapped_plans`, never from today's mappings. It is optional in the stored type, because reports stored before this PR lack it, and nothing is printed when it is absent.
- **HTML** (`apps/worker/src/report/html.ts:155-158`): after the coverage paragraph, when `plans > 0`: "{N} plans had no mapping when this run was priced; their lines are not priced ({L} lines, {$X} billed)." The past tense is used because the report is of one run, as priced (decision D8).
- **CSV:** unchanged. Its lines already carry `NO_MAPPING` in `reasons`.

### 5.7 Home page (`apps/web/src/app/p/[practiceId]/page.tsx`)

- **Plans with no mapping** (figure 1): Alert, title "{N} plans have no mapping; their lines are not priced", body "{L} lines, {$X} billed. Lines of every other plan price as usual. The queue “Plans waiting on a mapping” below also counts plans mapped for only some dates." (review 12g), with the link "Map them" (or "See them on Payer and plan mapping").
- **Mapped, still not priced** (figure 2): the `mapped_not_priced` Alert of §5.1, linking to the mapping list's region.

---

## 6. Milestone 3, MAP-01, and the exception recorded

### 6.1 Rewording

| Where | Today | Reworded |
| --- | --- | --- |
| `docs/product/PRD.md:704` (PRD 17, milestone 3 check) | "A 2 GB zip queues per file; an unmapped plan blocks pricing and shows on coverage" | "A 2 GB zip queues per file; an unmapped plan's lines are left unpriced (NO_MAPPING) while the rest of the month prices, and show on coverage" |
| `docs/product/milestone-prompts.md:21` | "…and pricing is refused on an unmapped plan." | "…and an unmapped plan's lines are left unpriced as NO_MAPPING while every other line of the month is priced." |
| `docs/product/test-matrix.md:46` and `packages/synth/src/cases/matrix.ts:41` | MAP-01 "Pricing refused; coverage shows dollars waiting" | As in §2.4 |
| `docs/product/PRD.md:175,237` | As in §2.4 | As in §2.4 |

### 6.2 ADR 0075

`docs/adr/0075-price-around-a-plan-with-no-mapping-and-price-its-months-again-from-the-mapping-screens-by-hand.md`

- **Status, date, context:** combined audit #32, MAP-01, ADR 0028/0030/0035/0037/0038/0039/0060.
- **Decision:** the rule of §2.1 (D1, D2, D2b). The coverage `/2` format, the two live figures, and the "Price these months again" action under #50's rule (D4, D14, D15), with the `to_triage` state that keeps ADR 0038's person-triages rule (D13).
- **The milestone 3 exception, quoted:** "Granted in the founder's adoption of the combined audit, 2026-10-20 ~15:10 UTC ('Adopt all of it. The 19 freeze exceptions are granted'); item #32's 'Freeze exception: yes, because the milestone 3 check reads an unmapped plan blocks pricing'." It also records the reworded check.
- **Consequences:**
  - The engine and the unpriced reasons are unchanged.
  - No migration.
  - Unmapped plans' lines now reach anomaly screening as `NO_MAPPING` (`packages/triage/src/anomaly.ts:25-34` already screens that reason), so they can be flagged, investigatory only.
  - Line stages stay monotonic (`apps/worker/src/triage/execute.ts:310-327`): a line flagged while unmapped stays flagged if a later accepted re-run prices it with no shortfall. This is the same as today for MAP-02 lines and for corrections (decision D9).
  - A practice that maps some plans of a month and not others before the daily monitor runs gets a mixed first run, and each later mapping lists that month to price again. That is the cost of never freezing a month, and the screens say so before it happens (§4.1).
- **Alternatives rejected, with reasons (§11):**
  - Refusing per month (today's behavior).
  - Pricing an all-unmapped period anyway.
  - Queuing the monitor on every mapping.
  - Auto-accepting re-runs after mapping.
  - Auto-triaging an accepted re-run.
  - A job creating the re-runs.
  - A new unpriced reason.
- **Follow-ups:** the notice (§3.3), and the Lane A request.

**Amendments**, each a dated paragraph appended, never an edit of the decision text:

- `0028-…md:101-102` (`assertPricingAllowed`).
- `0030-…md:71` (Coverage's readiness).
- `0035-…md:53-54` (the guard at creation and execution).
- `0039-…md:65,134` (the monitor's MAP-01 wait, which now applies only to all-unmapped months, and the new request-keyed monitor after a mapping that completes a month or "Price them now"). This is an amendment of an older ADR #42 touches, which the lane rules allow: appended at the end, so the merge with #42 is mechanical.
- `0060-…md:212` ("a pricing run over them fails as `unmapped_plan`" becomes: the export's plans' lines are `NO_MAPPING` while everything else prices).

ADR 0038 is not amended: its rule (a person triages a run they created) is kept, and ADR 0075 records how the mapping screens point to it.

### 6.3 reconciliation-001

- **Milestone 3 row** (`docs/product/reconciliation-001.md:12`): "an unmapped plan blocks pricing (MAP-01)" becomes "an unmapped plan's lines are left unpriced while the rest of the month prices (MAP-01, MAP-06; the check reworded by combined audit #32 under the founder's adoption of 2026-10-20, ADR 0075)".
- **"What must not change, as checks" → Milestones and gate dates** (after `:476`): a sub-bullet in the style of the 85% exception.
  - "*Granted by the founder's adoption of the combined audit on October 20, 2026: an exception to this check for milestone 3.* Item #32 ('Freeze exception: yes, because the milestone 3 check reads an unmapped plan blocks pricing'). PRD 17's milestone 3 check now reads '…an unmapped plan's lines are left unpriced (NO_MAPPING) while the rest of the month prices, and show on coverage', and its opening prompt says the same. No other milestone, check or gate date changes. AUDIT-01's job flow changes by one `monitor` step that creates no run, and its worksheet still matches line for line. Recorded in `docs/adr/0075`."
  - The persisted notice and email follow-up is noted there too (§3.3).

---

## 7. Migration

**None.** Confirmed part by part:

- The guard is TypeScript only (§1.1).
- `priced_line` already admits `NO_MAPPING` with a null `mapping_id`.
- The coverage format is not checked in SQL (§2.3).
- The coverage report keeps its pinned format (§5.5).
- `audit_event.action` is a free regex.
- The re-runs use the existing person-created path.
- Queuing the monitor uses an existing job payload (`{ practice_id, request_id }`, `apps/worker/src/jobs/registry.ts:45`).
- `to_triage` is derived from `priced_line`, `case_line` and `line_status`, which the app role reads in its scope; no triage record table is needed.

**For Lane A:** only the persisted notice and email (§3.3 item 1). This PR does not depend on it.

---

## 8. Tests

### 8.1 Test-matrix rows

The rows below are in the style of PRC-23 to PRC-28. They go in `docs/product/test-matrix.md` after MAP-05 (`:50`) and after PRC-28 (`:95`), with matching entries in `packages/synth/src/cases/matrix.ts` and `registry.ts`. A note under the pricing block: "MAP-06 to MAP-09 and PRC-29 to PRC-31 were added in `co-001/unmapped-plan` (combined audit #32, one unmapped plan no longer freezes a whole month), under the founder's adoption of 2026-10-20 (the milestone 3 exception); docs/adr/0075."

| ID | Title | Assertion |
| --- | --- | --- |
| MAP-01 | Unmapped payer and plan | Each line of the plan is left unpriced as `NO_MAPPING`, one by one, and never priced; the run prices every other line of its period. Coverage shows dollars waiting |
| MAP-06 | A month holding lines of a mapped plan and of a plan with no mapping | Priced by the monitor and by a person's run, in the worker and with nothing refused in Postgres: the mapped plan's lines price under their mapping, the other plan's are `NO_MAPPING` one by one. The run's coverage records the plan with no mapping, its lines and billed cents, equal to what Coverage counts for that month. Coverage, Pricing runs, the home page, the run's page and both printed reports say the plan has no mapping and its lines are not priced, in counts and cents only. The engine is unchanged |
| MAP-07 | A period none of whose plans has a mapping, and the mapping that completes it | No run is created: the monitor leaves the month waiting, logged as `UNMAPPED_PLAN` with the count of months, and a person's run is refused as pricing nothing. A mapping queues monitoring only when it leaves a month no run covers with every plan of its lines mapped, which prices the month as a first run in effect with no hand re-run; a mapping that leaves the month mixed queues nothing, and the page says how many months wait and offers "Price them now", which queues monitoring and is refused while the practice is suspended |
| MAP-08 | Plans mapped after their months were priced | The mapping list and each plan's page list, oldest first, each run in effect holding `NO_MAPPING` lines that a mapping now covers, with their lines and billed dollars. "Price these months again" creates one re-run of each in that person's name, queued and not accepted, with one audit event per re-run; two plans mapped and pressed in turn give one counting re-run per month. A month whose first run of overlapping dates is queued or being priced is not re-run (`newer_run_pending`) and says it waits. A month whose re-run since the mapping is pending links to it; one whose re-run is superseded or pinned to a withdrawn release is ready again. Once accepted, the month says to triage it on Cases until triage has validated its short lines. A job never creates the re-runs |
| MAP-09 | Pricing months again from a page that is out of date, or without the right | When the months listed differ from the months the form sent, the request is refused as `months_changed` with nothing created, and the page shows the months as they are now. A refusal of one month names it by its dates and creates nothing. A run of another practice, a plan of another practice, a release not in force, a practice that is suspended, and a person without `mapping.edit` are refused, with nothing created |
| PRC-29 | A re-run of a month priced around a plan with no mapping, after the plan is mapped | The re-run prices the same lines (the original's cut-off), the plan's lines under the mapping and every other line as the original did, unless something else changed since. Its page lists exactly the lines whose pricing in effect changes. Accepted, it is the run in effect and the plan's lines leave `NO_MAPPING`; `recompute(trace)` holds on every priced line; triaged from Cases, the plan's short lines reach validated |
| PRC-30 | The coverage a run records of plans with no mapping | `tp-pricing-coverage/2` lists each plan of the run's lines with no mapping when it was priced, with its lines and billed cents, together at most the `NO_MAPPING` count. A `tp-pricing-coverage/1` run reads as having none. The printed audit report says "N plans had no mapping when this run was priced; their lines are not priced", and the coverage report "N plans have no mapping; their lines are not priced"; a coverage report stored before keeps its own sentence |
| PRC-31 | Lines of mapped plans still unpriced as `NO_MAPPING` in the pricing in effect | Coverage, Pricing runs, the home page and the mapping list count the lines whose pricing in effect is `NO_MAPPING` while a mapping is now in force on their date, in lines, billed cents and priced months only; the count falls to zero once the re-runs pricing them are accepted, and never counts a line of a plan with no mapping |

- **`completesIn`** in `registry.ts` (review 12b): MAP-06 3, MAP-07 7, MAP-08 7, MAP-09 7, PRC-29 7, PRC-30 3, PRC-31 3. Milestone 3 for what its reworded check reads (pricing around the plan, coverage), and 7 for the monitor and the re-runs, as MAP-03 and PRC-25 to PRC-28 have it. Every value is at most `CODE_BUILT_THROUGH_MILESTONE` (10, `registry.ts:52`), so `fixtures.test.ts:66-77` requires each row's `assertedBy`, which §8.3 gives.
- **MAP-10 is kept for the follow-up notice PR** (§3.3), with the wording to use then: "A load brings lines of a plan with no mapping | The people who may map plans (`mapping.edit`), and only they, get one notice per plan in the app and by email: 'A new plan appeared: N lines, $X billed, waiting for its mapping.' Counts and cents only; no payer, plan, member ID or claim number in the notice, email, URL or log".

### 8.2 `packages/synth` cases and fixtures

- **MAP-01:** `packages/synth/src/cases/pricing.ts:38-51` keeps its builder and its file (`remit.835` is byte-identical). The outcome `pricing: 'refused for every line: NO_MAPPING'` becomes `'every line NO_MAPPING; the run prices every other line'`. `fixtures/synthetic/MAP-01/expected.json` is regenerated (only `assertion`, `outcome` and `assertedBy` change), and the test list in `registry.ts:86` is updated.
- **MAP-06: a new builder, `pricing.map06`, with its own file.**
  - One 835 for one month, with two claims on `SYNPLAN-COMM-06` (to be mapped to the synthetic signed-off version) and one claim on `SYNPLAN-UNMAPPED-06`, using `WORKED_VISIT`-style lines, at least one of `SYNPLAN-UNMAPPED-06`'s lines paid below what the signed-off version expects (so PRC-29's triage has a short line to validate).
  - `scenario({ mappings: [{ plan: 'SYNPLAN-COMM-06', … }], unmappedPlan: 'SYNPLAN-UNMAPPED-06' })`.
  - The outcome is the priced lines and cents of the mapped plan from code (expected allowed per line by the engine under release 900001), and `unmapped: { plans: 1, lines, chargeCents }`.
  - Generated by `pnpm synth`: `fixtures/synthetic/MAP-06/remit.835` and `expected.json`.
  - It uses the existing release 900001 and the existing MAP module (`MODULE_NUMBER.MAP = 2`, `packages/synth/src/cases/common.ts:18`), so there is **no release or module request**.
- **No file of their own** (`none()`, `registry.ts:27`, as PRC-23 to PRC-28 use it):
  - MAP-07: "No file of its own: MAP-01's and MAP-06's files, loaded with no plan mapped."
  - MAP-08, MAP-09, PRC-29 and PRC-31: "No file of their own: MAP-06's file."
  - PRC-30: "No file of its own: MAP-06's and MAP-01's files."
  - Each has its committed `fixtures/synthetic/<ID>/expected.json` (checked by `packages/synth/src/fixtures.test.ts`).

### 8.3 Tests by file (`assertedBy`)

**Unit and property tests**

- `packages/contracts/src/coverage.test.ts`:
  - Drop the `assertPricingAllowed` cases (`:27-46`).
  - Keep and extend `unmappedPlanIds` (MAP-01).
  - New property: for random plans and mappings, `unmappedPlanIds` equals the plans whose every line resolves `NO_MAPPING` with no mapping record.
- `packages/contracts/src/resolver.test.ts`: the existing "every line of an unmapped plan resolves `NO_MAPPING`" stays (MAP-01).
- `apps/worker/src/price/coverage.test.ts` (new):
  - `/1` parses with `unmapped_plans: []`.
  - `/2` round-trips.
  - Strict keys; signed cents.
  - A property that the sum of the unmapped lines is at most the `NO_MAPPING` count (PRC-30).
- `apps/worker/src/monitor/job.test.ts`: the log carries `record_count` and no other new field (MAP-07).
- `apps/worker/src/report/documents.test.ts` and `html` tests: both report sentences, singular and plural, absent fields giving the original sentence, and signed cents (PRC-30).
- `apps/web/src/components/mapping/months.test.tsx` (new): the state words of §9 for each state, the button's count, the link to Cases shown only with `case.work`, and the 390 px stacked rows (MAP-08).

**Database tests**

- `packages/contracts/src/contracts.db.test.ts:1021-1032`: MAP-01 through `practiceUnmappedPlanIds`, under RLS. A plan of another practice is never listed.
- `apps/worker/src/price/price.db.test.ts`:
  - `:121-133` is rewritten: MAP-01's file prices nothing, because there is no run (MAP-07).
  - New MAP-06: a person's run and the monitor's run both complete. The lines are as §8.2. `coverage.unmapped_plans` is exact and equals `unmappedPlanTotals` over the month (the invariant of §2.3, through the web query against the same database). `priced_line` rows of the unmapped plan have a null `mapping_id` and `NO_MAPPING`. A run queued before the mapping guard's removal (simulated by creating the run, then removing the plan's mapping test-side) completes rather than failing.
  - PRC-30.
- `apps/worker/src/price/mapped-plan.db.test.ts` (new):
  - MAP-07: `monthsAwaitingMappings` counts mapped and unmapped plans per uncovered month.
  - MAP-08: the listing (practice and plan), states, oldest-first order, and the 60 limit. Two plans mapped in turn: pressing after the first and again after the second gives a second re-run only because the first predates the second mapping; pressing on both plans' pages after both are mapped gives one re-run per run.
  - MAP-08, under #50's rule:
    - `newer_run_pending` (a queued overlapping first run) reads `waiting`.
    - A pending re-run reads `being_priced`, then `to_accept`.
    - A re-run superseded by an overlapping run of another period that completed after it (a run of Jan 15 to Feb 15 priced after the January re-run, with the plan's lines on Jan 5), and a re-run pinned to a withdrawn release, each leave the month `ready` again (finding 6).
    - A run replaced since the page loaded refuses with `not_in_effect` and rolls back all of them.
  - MAP-08 and PRC-29: after acceptance the month reads `to_triage`; after `triageInScope` on the re-run, the plan's short lines are `validated` and the month leaves the list (finding 3).
  - PRC-29: the re-run's diff lists exactly the plan's lines, and after acceptance they are priced in effect.
  - PRC-31: `mappedNotPricedTotals` before mapping (zero: the plan has no mapping), after mapping (the plan's lines), and after acceptance (zero).
- `apps/worker/src/monitor/monitor.db.test.ts:157-175`:
  - The batch's months are all-unmapped, so the wait is unchanged (MAP-07).
  - New: a mixed month is priced by the monitor (MAP-06).
  - After the mapping that completes the month, the route's queued monitor job prices it as a first run (MAP-07).

**Route tests (database)**

- `apps/web/src/lib/routes/pricing-routes.db.test.ts:222-223`:
  - The mixed month's create succeeds (MAP-06).
  - The all-unmapped create shows the new field error (MAP-07).
  - The run page's names include the unmapped plan's key (finding 9; MAP-06).
- `apps/web/src/lib/routes/contracts-routes.db.test.ts:255`: with two unmapped plans in one month, mapping the first queues nothing and redirects with `notice=mapped`; mapping the second queues one `monitor` job keyed by the request and redirects with `notice=mapped_pricing`; `unchanged` queues nothing (MAP-07).
- `apps/web/src/lib/routes/mapping-routes.db.test.ts` (new):
  - MAP-07: "Price them now" queues one request-keyed `monitor` job and its audit event; refused with the suspension reason while the practice is suspended.
  - MAP-08 through the route, from the mapping list and from a plan page.
  - MAP-09:
    - `months_changed`.
    - A `newer_run_pending` refusal names the month by its dates on `runIds`, and nothing is created.
    - Cross-practice `planId`/`runIds` give not found or refused.
    - A non-`mapping.edit` persona is forbidden (the generated every-persona route tests cover the permission matrix).
    - A suspended practice is refused with the database's reason, not a 500 (finding 8).
    - The audit events: one `plan_months_priced_again` and one `pricing_run_rerun_created` per re-run.
    - A failed enqueue rolls back.
  - PRC-31: the mapping list's figure and its region.
- `apps/web/src/lib/routes/report-documents-routes.db.test.ts`: the coverage report's readiness fields and sentence (PRC-30).
- `apps/web/src/lib/routes/audit-e2e.db.test.ts` (AUDIT-01, **edited**, finding 1): its three plans are mapped in turn (`:430-434`). Under D2b only the third mapping completes March, so it queues one `monitor` job before the person's run queues `price`. The assertion `:435` becomes `expect(await runQueue()).toEqual(['monitor', 'price'])`, followed by a check that the practice holds exactly one pricing run, the person's (`created_by_job_id IS NULL`): the monitor found March covered by that queued run (`uncoveredMonths`, `plan.ts:103-107`) and created none. The comment at `:241-244` is reworded ("prices nothing: no plan is mapped yet, MAP-07"). The flow of `send()` (`:307`, `['intake', 'parse_835', 'monitor', 'reconcile']`) is unchanged: its batch is all-unmapped. The worksheet still matches line for line.
- `apps/web/src/lib/routes/registry.test.ts` (#42's file, **not edited**): its existing checks (`:127-168`, one route per exported action, unique IDs) cover the new routes and actions as they stand. `billing/config.test.ts:63` and `route-tests/define.ts:146` cover the two new `RUN_STARTING_ROUTES` entries, unedited.

**End-to-end tests**

- `apps/web/e2e/mapping.spec.ts:21-60`, rewritten as MAP-01, MAP-06, MAP-07, MAP-08 and PRC-31, in the other group's practice as today:
  1. Upload MAP-06's file, both plans unmapped. Coverage shows "2 plans have no mapping; their lines are not priced" with lines and dollars, and Pricing runs has no run for the month.
  2. Map `SYNPLAN-COMM-06` as no agreement. The page returns with `data-notice="mapped"` and "1 month holding this plan’s lines waits for 1 other plan’s mapping". Press "Price them now" (the local worker runs). The run is priced; Coverage shows "1 plan has no mapping; its lines are not priced", and the home page shows the Alert.
  3. Map `SYNPLAN-UNMAPPED-06` as no agreement. The plan page lists the month as "Ready to price again"; Coverage shows "{L} lines of mapped plans are still not priced".
  4. Press "Price these months again (1)". The month shows "Being priced again", then "Priced again: review and accept".
  5. Accept on the run page. Coverage drops the second Alert (the first dropped at step 3).
  6. The URLs carry opaque IDs only (`assertNoPhi`, as today).

  The old line `:45` (`'Pricing is refused until every plan is mapped'`) goes. The no-agreement mappings leave no shortfall, so `to_triage` is asserted in the db tests, not here.
- `apps/web/e2e/pricing.spec.ts`: asserts the run page's new sentence for MAP-06's run.
- Each touched screen is checked with axe, as now.

**Not changed:** the golden suites.

---

## 9. Visible changes (before/after screenshots at 1280 and 390 px)

| Screen | Before | After (exact words) |
| --- | --- | --- |
| Home (`/p/[id]`) | Queue "Plans waiting on a mapping: N" only | The same queue, plus Alerts above it: "**2 plans have no mapping; their lines are not priced**" / "14 lines, $1,234.00 billed. Lines of every other plan price as usual. The queue “Plans waiting on a mapping” below also counts plans mapped for only some dates." with the link "Map them" (or "See them on Payer and plan mapping"); and, when any, "**9 lines of mapped plans are still not priced**" / "$812.00 billed, in 2 priced months, are still NO_MAPPING in the pricing in effect: their plans were mapped after those months were priced. Price their months again on Payer and plan mapping." |
| Coverage | Red "Pricing is refused until every plan is mapped" / "N plans have no mapping at all. A pricing run over them would be refused; map them first." | Default Alert "**2 plans have no mapping; their lines are not priced**" / "14 lines, $1,234.00 billed. Lines of every other plan price as usual. Map them on Payer and plan mapping." With none: "**Every plan has a mapping**" / "Lines outside every mapping’s dates are left unpriced as NO_MAPPING, one by one." Plus the "mapped, still not priced" Alert, as on Home |
| Pricing runs | Red refusal above the form | Default Alert with the same title / "14 lines, $1,234.00 billed, are left unpriced as NO_MAPPING in any run until their plans are mapped. Map them." Plus the "mapped, still not priced" Alert. Creating a run for an all-unmapped period: the field error "None of these months’ plans has a mapping yet, so a run would price nothing. Map their plans on Payer and plan mapping; each month is priced once every plan it holds is mapped." |
| Payer and plan mapping (list) | Lead "…Pricing never runs on a plan with no mapping; lines whose service date no mapping covers wait here." | Lead as in §5.3. New regions "**Months waiting for a first run**" ("3 months wait for 2 plans’ mappings. Map those plans first, so each month is priced once. Or price them now: …", button "**Price them now**") and "**Months with lines of mapped plans not priced**" (the table of the plan page, for the practice, with "**Price these months again (2)**"). Notices: "Re-runs created: accept each on its page after its list of changes." / "Monitoring is pricing the waiting months now." |
| Plan page (`/mapping/[planId]`) | Mapping form and history | After mapping: the notice "Mapped. The months whose plans now all have a mapping are being priced; they show on Pricing runs when done." or "Mapped.". The region "Months waiting for a first run" (for this plan's months). A region, **"Months holding this plan’s lines that are not priced"**, with a table (Months, Lines not priced, Billed, State) and states "Ready to price again", "Being priced again", "Priced again: review and accept" (a link), "Waits for a newer run of these dates to finish", "Priced again and accepted: triage it on Cases" (a link, with `case.work`) or "Priced again and accepted: waits for triage by a person who works cases". The button "**Price these months again (3)**", with its help text. When nothing is listed: "No priced month holds this plan’s lines without a mapping." At 390 px the table becomes stacked rows (Months, then figures, then state), with the buttons full width, as #50's 390 px Re-run fix did (commit 170e8be9) |
| Run page | (none) | Beside the unpriced reasons: "When this run was priced, 2 plans had no mapping; their lines are not priced (14 lines, $1,234.00 billed)." with each plan's key linked. A failed historical run shows the new `unmapped_plan` text (§5.4) |
| Coverage report (web view and PDF) | "N plan(s) had no mapping at all: a pricing run over them is refused until they are mapped." | New reports: "2 plans have no mapping; their lines are not priced (14 lines, $1,234.00 billed)." / "Every plan with lines has a mapping." Reports stored before keep their sentence |
| Audit report PDF, Coverage section | Table only | Adds "2 plans had no mapping when this run was priced; their lines are not priced (14 lines, $1,234.00 billed)." |

The screenshots use a synthetic practice seeded with MAP-06's file (`pnpm db:seed`, then upload), light and dark, each at 1280 and 390 px. No real data is used.

---

## 10. Reviews

- **payment-engine-reviewer:** the pricing path loses its guard. It checks:
  - The engine diff is empty.
  - `NO_MAPPING` per line, and `recompute(trace)` on PRC-29.
  - Coverage `/2`, its invariants, and the shared `PRICEABLE_LINE` set.
  - That re-runs stay under #50's rule, with `RERUN_ACCEPTANCE` read for the states.
  - That `to_triage` uses triage's own `shortfallOf` and stage rule.
- **UX and brand review:** five screens and two printed documents change. It checks:
  - The wording above, including that no sentence claims more than is true (finding 11).
  - The default (not destructive) Alerts.
  - The unpriced tint with a label.
  - Mono figures.
  - The 390 px layout.
  - axe.
  - `pnpm lint:copy`.
- **security-reviewer:** two new mutation routes, `practice.mapping.price_again` (creates several runs and queues jobs) and `practice.mapping.price_waiting` (queues the monitor), a conditional `monitor` enqueue on mapping, and new figures on screens. It checks:
  - Zod bounds (1 to 60 IDs).
  - `mapping.edit` on both routes.
  - Both routes in `RUN_STARTING_ROUTES` (suspension refused by the wrapper with the database's reason).
  - Practice-scoped transaction and RLS.
  - Cross-tenant IDs.
  - Atomic refusal, and the harmless `price` jobs of a rolled-back request (§4.2, 12f).
  - Audit events.
  - No PHI in notices, URLs (opaque IDs only), logs (`record_count` only) or errors (dates and states only).
  - Rate limits as for every action.

---

## 11. Decisions, with reasons

| # | Decision | Reasons (founder's criteria) |
| --- | --- | --- |
| D1 | Remove the guard and let the resolver's existing `NO_MAPPING` stand. No engine change and no new reason. | Accuracy: the same per-line outcome as MAP-02. Compliance: the engine freeze and the closed reason list hold. Time to value: mapped payers' findings are no longer blocked. |
| D2 | A period where no plan has any mapping gets no run. | A run there prices nothing, and would later force a re-run and a hand acceptance for every month. Nothing priceable is held back, because a month with any mapped plan prices. Rejected: pricing it anyway. Its only gain is anomaly screening of the unmapped lines, at the cost of a hand acceptance per month. |
| D2b | A mapping queues monitoring only when it leaves a month no run covers with every plan of its lines mapped; otherwise the screens say how many months wait and offer "Price them now"; the daily monitor prices mixed months anyway. | UX and time to value: onboarding (map every plan) stays at zero hand acceptances, where queuing on every mapping would cost plans × months acceptances. Accuracy: no month freezes for more than a day, which is the audit's rule. Reliability: AUDIT-01 changes by one `monitor` step that creates no run. Rejected: queuing on every mapping (finding 2's sequence); never queuing (a completed month would wait a day). |
| D3 | Coverage `/2` records the unmapped plans at pricing, from the resolver's own records. | Immutability (rule 3). The report says what was true of the run. Exact consistency with the `NO_MAPPING` lines. |
| D4 | "Price these months again" is atomic and exact: the posted months must equal the months listed now, or nothing is created (`months_changed`). | Security and safety: a person acts only on what they were shown, as #50's `diff_changed`. A partial success that skips months silently would leave lines unpriced unseen. |
| D5 | Oldest first, at most 60 per press. | Windows run out on the oldest months first. 60 months bounds the request (five years), and the rest is listed after. |
| D6 | The live figures go to everyone who opens the practice, and the actions and "Map them" link to `mapping.edit` holders. | The counts are already visible in the queue. Least privilege on the actions. The persisted per-person notice to the people who may map plans needs the role-filtered recipients (Lane A). |
| D7 | The default Alert, not destructive, for unmapped plans and for mapped lines not priced. | Nothing failed. It is a step to take. BRAND.md: status as text on tint, with red reserved for Short. |
| D8 | Past tense in the audit report, present tense in the coverage report and screens; a stored coverage report keeps its own sentence. | Each document's truth: one run as priced, against the practice now; a stored document is never reworded. |
| D9 | Line stages stay monotonic. Unmapped lines are screened as `NO_MAPPING` already is. | CLAUDE.md (monotonic; reopen is explicit). Triage's closed `SCREENED_REASONS` is unchanged. The flags are investigatory and in no total. |
| D10 | A re-run is created per run in effect, through `createRerun`, never by a job and never accepted automatically. | The audit ("created in that person's name … accepted by hand"). The Postgres CHECK. J17. #50's rule. |
| D11 | The persisted notice and email go to the Lane A request plus a Lane B follow-up after #42, with MAP-10 reserved. | Closed SQL lists and #42's files. This PR ships the live notices meanwhile. |
| D12 | ADR 0075, plus appended amendments to 0028, 0030, 0035, 0039 and 0060. | The rule reverses a recorded decision and carries a milestone exception. Appending keeps #42's merge mechanical. |
| D13 | An accepted re-run is not triaged automatically; the mapping screens show `to_triage` and link to Cases until triage has validated the newly priced short lines. | ADR 0038 keeps triage a person's case work (`case.work`), while acceptance is `mapping.edit`'s: auto-triage would open cases from a mapping-holder's click and change ADR 0038/0039 for every accepted re-run. The derived state is exact (triage's own `shortfallOf` and stage rule) and needs no schema. Dispute success: no newly priced shortfall is left unseen. Rejected: auto-triage on acceptance (scope, authority), and a "triaged" record (a migration). |
| D14 | One action over one set of states, on the mapping list for the practice and on each plan's page for that plan. | No duplicate re-runs, diffs or acceptances (finding 5). UX: one press after mapping several plans; the plan page still serves the person who lands there. |
| D15 | The states read #50's `RERUN_ACCEPTANCE`: a superseded or withdrawn-release re-run does not count; `newer_run_pending` reads as waiting; only `awaiting` is to accept. | Accuracy: the screen never shows a re-run that can never be accepted as "review and accept", and such a month is offered again (finding 6). |
| D16 | The figures and lists count the run's own line set (`PRICEABLE_LINE`), and new cents are signed. | Consistency: the screens, the run page and the reports agree on the same plan and month (finding 10). Reliability: no report fails a non-negative schema on an odd charge. |

### Proposals outside this PR

1. **The Lane A migration** for the notice (§3.3 item 1), and the **follow-up PR** with MAP-10 after #42.
2. **After #42:** `apps/web/src/components/help.ts:14` is fine as it is, and no change is needed. #42's digest could add "plans with no mapping" with the existing `lines` and `billed` codes (same follow-up).
3. **A proposal for the co-founder to consider later, not decided here:** a payer-name alias between an export's plans and the 835's (ADR 0060:214-215 calls it the owner's call). It would stop most "new plan" notices from exports.

---

## 12. Check against reconciliation-001's "What must not change, as checks" (`docs/product/reconciliation-001.md:440-486`)

| Check | Holds? |
| --- | --- |
| Engine arithmetic: no non-test change under `packages/pricing/src`; golden and releases 900001-900004 unchanged; `recompute(trace)`; `unpriced-reasons.md` and the engine's list unchanged; Medicare flag defaults; screening reads but never changes the engine | Holds. The only changes are in contracts, worker, web and docs. MAP-06's fixture is a new synthetic file under release 900001, with no golden file touched. |
| Ledger semantics | Holds. Nothing touches the ledger. |
| Content pipeline | Holds. Nothing under `content/releases/**`, and no rule-table DDL. |
| Security program: `pnpm test:db` (catalog, cross-tenant); no new PHI table; no BYPASSRLS; headers; role matrix unchanged | Holds. No table, and no permission added (`mapping.edit` is reused; `case.work` only gates a link). Both new routes start work and are in `RUN_STARTING_ROUTES`. Security review per §10. |
| Milestones and gate dates: PRD 17's checks unchanged apart from the listed exceptions | **Exception:** milestone 3's check is reworded under the founder's adoption of 2026-10-20 (item #32's freeze exception), recorded as a sub-bullet there and in ADR 0075 (§6). Gates and pace are unchanged. AUDIT-01 gains one `monitor` step that creates no run, and still matches its worksheet line for line (§8.3). |
| Applied migrations | Holds. No migration, and the domain model is untouched. |

---

## 13. Files to change (summary)

**Packages**

- `packages/contracts/src/coverage.ts`, `load.ts`, `index.ts`
- `packages/contracts/src/coverage.test.ts`, `contracts.db.test.ts`

**Worker: pricing**

- `apps/worker/src/price/create.ts`, `execute.ts`, `lines.ts` (`PRICEABLE_LINE`, comment), `rerun.ts` (comment), `coverage.ts`, `public.ts`
- New: `mapped-plan.ts` (`monthsAwaitingMappings`, `MAPPED_NOT_PRICED`, `monthsToPriceAgain`, `monthsToTriage`, `mappedNotPricedTotals`), `coverage.test.ts`, `mapped-plan.db.test.ts`
- `apps/worker/src/price/price.db.test.ts`

**Worker: monitor and reports**

- `apps/worker/src/monitor/plan.ts` (export `uncoveredMonths` as it is; catch and comments), `job.ts`, `job.test.ts`, `monitor.db.test.ts`
- `apps/worker/src/report/content.ts`, `html.ts`, `documents.ts`, `test-support/document-content.ts`, and their tests

**Web: libraries and routes**

- `apps/web/src/lib/contracts/mapping-queries.ts` (`unmappedPlanTotals` replaces `pricingReadiness`)
- `apps/web/src/lib/routes/mapping.ts` (two new routes, `priceAgainRefusal`, notice enums, conditional enqueue), `pricing.ts` (export `LOCATION_WAITING`; field error), `coverage.ts`
- `apps/web/src/lib/billing/runs.ts` (two IDs added to `RUN_STARTING_ROUTES`)
- `apps/web/src/lib/pricing/queries.ts` (`runNames`)
- `apps/web/src/lib/dashboard/queries.ts`
- `apps/web/src/lib/reports/documents.ts`

**Web: pages and components**

- `apps/web/src/app/p/[practiceId]/page.tsx`, `coverage/page.tsx`, `pricing-runs/page.tsx`, `pricing-runs/[runId]/page.tsx`, `mapping/page.tsx`, `mapping/[planId]/page.tsx`, `mapping/actions.ts`
- `apps/web/src/components/pricing/display.tsx`, `reports/documents.tsx`, and a new `components/mapping/months.tsx` with `months.test.tsx`

**Web: tests**

- `apps/web/src/lib/routes/pricing-routes.db.test.ts`, `contracts-routes.db.test.ts`, `report-documents-routes.db.test.ts`, `audit-e2e.db.test.ts` (AUDIT-01, `:241-244` comment and `:435` flow)
- New: `mapping-routes.db.test.ts`
- `apps/web/e2e/mapping.spec.ts`, `pricing.spec.ts`

**Synth and fixtures**

- `packages/synth/src/cases/pricing.ts`, `matrix.ts`, `registry.ts`
- `fixtures/synthetic/MAP-01/expected.json`
- New: `fixtures/synthetic/MAP-06/{remit.835,expected.json}`, and `expected.json` for MAP-07, MAP-08, MAP-09, PRC-29, PRC-30 and PRC-31

**Docs**

- `docs/product/test-matrix.md`, `PRD.md` (175, 237, 704), `milestone-prompts.md:21`, `reconciliation-001.md` (row 12, milestones check)
- `docs/adr/0075-…md` (new)
- Amendments to `docs/adr/0028`, `0030`, `0035`, `0039` and `0060`

**Not touched:** `packages/pricing/**` (non-test), `packages/db/migrations/**`, `docs/product/domain-model.md`, `docs/product/unpriced-reasons.md`, `packages/triage/**` (only imported), `apps/worker/src/price/job.ts`, `apps/web/src/lib/routes/triage.ts` and the Cases page, and every other #42 file (`routes/index.ts`, `registry.test.ts`, `routes/practice.ts`, `settings.ts`, `help.ts`, `monitoring/*`, `mail/*`, `digest/job.ts`, `observability/fields.ts`). Checked: none of the files above is in `/tmp/claude-0/pr42-files.txt` apart from `matrix.ts` and `registry.ts`, which the lane rules allow.

**Requests to the orchestrator:**

- No new fixture release and no new synth module (MAP-06 uses release 900001 and module MAP = 2).
- ADR 0075 is used.
- MAP-06 to MAP-09 and PRC-29 to PRC-31 are used (PRC-31 for the "mapped, still not priced" figure, finding 4).
- MAP-10 stays reserved for the follow-up.
- Queue the Lane A notice migration (§3.3: notification kind, role-filtered recipients, and after #42 the mail kind; no figure codes).

---

## 14. Review and dispositions

The review (`/home/user/ops/designs/lane-b-unmapped-plan/review.md`) was checked against `/home/user/superseded-rerun` at `ed85bcf3`. Some of its `in-effect.ts` line numbers are off; the right ones are `PRICED_IN_EFFECT` `:39-43`, `SUPERSEDES_RERUN` `:80-82`, `NEWER_RUN_PENDING` `:123`, `RERUN_ACCEPTANCE` `:135-139`. Its claims hold at those lines.

| # | Finding | Verified? | Disposition |
| --- | --- | --- | --- |
| 1 | AUDIT-01 breaks under a per-mapping enqueue | Yes: `audit-e2e.db.test.ts:430-435` maps three plans then asserts `['price']`; `MemoryQueue` records every job (`uploads/queue.ts:60-71`). | **Applied.** AUDIT-01 is edited (§8.3): with D2b only the third mapping queues the monitor, the flow is `['monitor', 'price']`, and the test asserts the monitor created no run. Moved from "Not changed" to §13. |
| 2 | Per-mapping enqueue makes onboarding cost plans × months acceptances | Yes: `plan.ts:190-198` prices every uncovered month the first time any plan is mapped. | **Applied** as D2b (§2.1 rule 3, §4.1): queue only when a waiting month becomes fully mapped; otherwise "Price them now" (`practice.mapping.price_waiting`, `mapping.edit`, in `RUN_STARTING_ROUTES`). MAP-07 reworded. |
| 3 | Accepted re-runs are never triaged | Yes: `price/job.ts:47-49`, `chain.ts:7`, ADR 0038:63-66. No table records a run's triage, and `audit_event` is readable only by practice administrators (`20261015140500_…sql:41-45`). | **Applied** as state `to_triage`, derived exactly from triage's own rule (`shortfallOf`, `case_line`, stage rank; `triage/execute.ts:242,310-327,432`), linking to Cases for `case.work`. Auto-triage rejected and recorded (D13). MAP-08 and PRC-29 assert validated after triage. |
| 4 | The notice vanishes at mapping while the lines stay `NO_MAPPING` in effect | Yes: the old `unmappedPlanTotals` counts plans with no mapping row only. | **Applied:** figure 2, `mappedNotPricedTotals` from the shared `MAPPED_NOT_PRICED` fragment, on Coverage, Pricing runs, home and the mapping list (§3.2, §5). New row PRC-31. e2e steps fixed (the first Alert drops at mapping, the second at acceptance). `unpriced-reasons.md` unchanged. |
| 5 | Plan-by-plan presses duplicate re-runs | Yes: the old `ready` rule was per plan. | **Applied:** practice-wide action on the mapping list, plan page as a filtered view of the same action; the counting re-run is keyed on the newest in-force mapping covering any listed line (§4.2, D14). MAP-08 asserts one re-run per month. |
| 6 | Unacceptable re-runs shown as "review and accept" and block `ready` | Yes: `RERUN_ACCEPTANCE` (`in-effect.ts:135-139`) returns `superseded`/`release_withdrawn`; `acceptRun` refuses them. | **Applied** (D15): those do not count; `newer_run_pending` reads `waiting`; only `awaiting` is `to_accept`. Both sequences added to `mapped-plan.db.test.ts`. |
| 7 | Refusals do not reach the form | Partly: `refusal()` is private and reports on `runId` (`pricing.ts:300-311`); it does already map `PricingLocationWaiting` (`:301-302`), onto `releaseNo`. | **Applied:** the route's own `priceAgainRefusal` reports on `runIds` with the month's dates, maps the release and location refusals (exporting `LOCATION_WAITING`), and the form uses `refreshOnError` (§4.2). |
| 8 | New route missing from `RUN_STARTING_ROUTES` | Yes: `billing/runs.ts:10-20`; trigger `20261029150000_billing.sql:310` is unmapped in `recordRun`. | **Applied:** both new routes added; covered by the generated route tests and `billing/config.test.ts`, unedited; listed in §10 and §13; MAP-09 asserts the suspension reason. |
| 9 | `runNames` cannot name unmapped plans | Yes: `pricing/queries.ts:346-347` reads `coverage.patterns` only. | **Applied:** `runNames` reads `coverage.unmapped_plans[].plan_id`; `lib/pricing/queries.ts` added to §13; asserted in `pricing-routes.db.test.ts`. The plan is named by its key, so its payer is not needed. |
| 10 | Screens and the run's coverage can disagree | Yes: `pricingReadiness` uses `service_date IS NOT NULL` (`mapping-queries.ts:556`); runs use `RUN_LINES` with `coalesce` and exclude reversal and superseded claims (`lines.ts:27-33`). | **Applied:** `PRICEABLE_LINE` exported from `lines.ts` and used by `RUN_LINES`, `unmappedPlanTotals`, `monthsAwaitingMappings`; invariant stated and tested in MAP-06; new cents fields signed (`centsText`), since `service_line.charge_cents` has no sign CHECK (D16). |
| 11 | Wording claims more than is true | Yes. | **Applied:** "Lines of every other plan price as usual" (Coverage, home); Pricing runs: "…are left unpriced as NO_MAPPING in any run until their plans are mapped" (§5, §9); through `pnpm lint:copy` and the UX review. |
| 12a | `planPage`'s notice enum drops new notices | Yes: `mapping.ts:82`. | **Applied:** plan page `['mapped', 'corrected', 'unchanged', 'mapped_pricing', 'corrected_pricing', 'priced_again', 'pricing_requested']`; mapping list `['priced_again', 'pricing_requested']`. |
| 12b | `completesIn` values | Yes: `registry.ts:20,86`; `CODE_BUILT_THROUGH_MILESTONE = 10` (`:52`). | **Applied with different values:** MAP-06 3, MAP-07 7, MAP-08 7, MAP-09 7, PRC-29 7, PRC-30 3, PRC-31 3, by the milestone each belongs to. All are at most 10, so `fixtures.test.ts` requires `assertedBy` for each, which was the review's aim. |
| 12c | Lane A figure codes unnecessary | Yes: `lines` and `billed` exist (`20261027090000_…sql:425-430`). | **Applied:** request (b) dropped (§3.3). |
| 12d | Stored coverage reports reworded | Yes. | **Applied:** absent new fields render the original sentence (§5.5, D8). |
| 12e | MAP-10 wording "billing managers" | Yes: `permissions.ts:67,142`. | **Applied:** "the people who may map plans (`mapping.edit`)". |
| 12f | Queued jobs of a rolled-back bulk request | Yes: `price/job.ts:28-35`. | **Applied:** stated in §4.2 and §10 as harmless, with why queuing stays inside the request. |
| 12g | Home Alert vs queue counts | Yes: `dashboard/queries.ts:127` counts partly mapped plans. | **Applied:** the Alert's body names the difference (§5.7, §9). |

Nothing in the review needs a migration, a change under `packages/pricing`, or a #42 file, and none was introduced.

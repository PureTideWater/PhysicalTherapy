# Adversarial review of revision 3: one unmapped plan no longer freezes a whole month (combined audit #32)

- **Design reviewed:** `/home/user/ops/designs/lane-b-unmapped-plan.md`, revision 3 (re-read against `83d71fd6`).
- **Code:** `/home/user/unmapped-plan` at `83d71fd6` (#78), read-only. Overlaps read with `git show`/`git diff` against `origin/co-001/pr-06b-mail-streams` (`be63bdc2`), `origin/co-001/ss-01-suspension-refusal` (`f897a282`) and `origin/co-001/ux-home-figures` (no commit beyond `83d71fd6`).
- **Reviewed on:** 2026-11-01.

## What holds

These were attacked and hold:

- The guard's three sites are where §1.1 says: `price/create.ts:105-106`, `price/execute.ts:376-384`, `monitor/plan.ts:311-313`. No other code path calls the guard (`git grep` of `PricingRefusedError`, `assertPricingAllowed`, `assertPracticePricingAllowed` and `pricingReadiness`). `mapPlan` (`packages/contracts/src/services.ts:892`) is the only writer of a mapping, reached from one route (`routes/mapping.ts:150`).
- The engine freeze holds. The agreement is step 1 (`engine.ts:289-291`, `:443-445`), so removing the guard needs no engine change.
- No migration is hidden. `audit_event.purpose` and `action` are free regexes (`20261015140500_…sql:9,15`). The coverage format is not checked in SQL. The monitor payload `{ practice_id, request_id }` exists (`jobs/registry.ts:45`). `payer_plan_mapping_in_force()` is `SECURITY INVOKER` and granted. `priced_line_by_reason` exists (`20261018090000_pricing_runs.sql:99`).
- #42: every §13 file exists at `83d71fd6`. Only `matrix.ts`, `registry.ts`, `test-matrix.md` and `reconciliation-001.md` are in `pr42-files.txt`, and ADR 0039 is #42's (amendment appended only). `jobs/registry.ts` and `monitor/*` are not #42's.
- SS-01: `run_starting_permissions()` already holds `mapping.edit` (`f897a282:packages/db/functions/run_starting_permissions.sql`). `practice_run_refusal_for(…, 'mapping.edit')` is accepted. `expectQueuedWorkGated` (`define.ts:53-71` on SS-01) admits `price_again` and `price_waiting` in `RUN_STARTING_ROUTES`, and the mapping's conditional `monitor` under `PRACTICE_OWN_JOBS`. The registry test (`suspension-refusal.db.test.ts:147-152`) compares permission sets, so it passes with the two new routes.
- The screening gate: `lines.ts` (`:191`), `monitor/plan.ts` (`:150`) and `public.ts` (`:193`) are already in `tools/screening-capacity/watched-paths.txt`. No `apps/web/src/lib/pricing/*` or `routes/mapping.ts` is listed. D17's placement leaves the list unchanged.
- The generated route tests: `price_again`'s exact-or-skip rule (R4) makes the second and later persona calls `ok` on one world. The cross-practice "own practice with A's IDs" call is refused (`months_changed`) with no ID in the error.
- The reserved IDs MAP-06 to MAP-10, PRC-29 to PRC-31 and ADR 0075 are unused at `83d71fd6` and on both overlap branches.
- The stale-reference list in §14.2 checks out: `LANES.md:120`, `HANDOFF.md:471-473`, `rerun.ts:208-220,226-237,305-365`, `in-effect.ts:21,27,39-43,123,135-139`, `report/content.ts:220-226,826,1059-1065`, `whole-read.ts:773-779`, `billing/runs.ts:10-20`, `http/route.ts:146,188-190`, the test-matrix, PRD, synth and migration lines. The exceptions are in R3-11.

## Findings

### R3-1 (blocking): the monitor a mapping queues prices every month no run covers, not only the month the mapping completed, so D2b's onboarding promise is false

**Evidence.**
- §2.1 rule 3, §4.1 ("Why D2b") and D2b all rest on one claim: "only the last mapping queues the monitor, which prices every month as a first run, with no re-run and no hand acceptance". The rule queues the request-keyed `monitor` when *at least one* month holding this plan's lines is complete and not held.
- That job runs `planMonitoring`, which loops over **every** month `uncoveredMonths` lists (`apps/worker/src/monitor/plan.ts:296-321`). Every month with any mapped plan reaches `createPricingRun`, and under rule 1 a mixed month now gets a run.
- **Sequence.** Month M1 holds plans A and B; month M2 holds plans A and C. This is common: payers spread plans across months, and an ERA export's `PLAN:` keys are all new (ADR 0060:209-212). The person maps A (nothing queued), then maps B. M1 is now complete, so the monitor is queued, and it prices **M2 as a mixed first run** with C's lines `NO_MAPPING`. The person then maps C, and M2 lands in "Price these months again": a re-run plus a hand acceptance, then "triage it on Cases".
- That is the plans × months cost D2b was chosen to avoid (finding 2 of the first review).
- The notice `mapped_pricing` ("The months whose plans now all have a mapping are being priced") also understates what happens: mixed months are priced too.
- The same job also re-plans every content wait. A mapping changes the practice's terms (`termsUnchangedSince`, `plan.ts:205-210`), so the job re-runs those months whether or not the mapping touched them.

**Fix (the best option, not the cheapest).**
- Make the job price exactly the months the mapping completed. Give the request-keyed monitor payload an optional list of month starts: `z.strictObject({ practice_id, request_id, months: z.array(day).min(1).max(…) })` in `apps/worker/src/jobs/registry.ts:45`. These are dates only, with no PHI, and the file is not #42's.
- `planMonitoring` then restricts its loop to those months. It keeps the location and content checks and the D2 check for each one. The job key `monitor:<practice>:<request>` is unchanged.
- `mapPlanAction` passes the months `monthsAwaitingMappings` found complete and not held.
- "Price them now" keeps the unrestricted payload: it is the person's explicit choice to price mixed months.
- Add a MAP-07 case and a `mapping-routes.db.test.ts` case for the M1/M2 sequence. After mapping B, the monitor creates M1's run only, and mapping C then completes M2 as a first run with zero re-runs.
- Record the payload variant in ADR 0075 and in the ADR 0039 amendment.
- Rejected alternative: queue only when no un-held mixed month remains. It keeps a completed month waiting a day whenever any other month is mixed, so it is worse on time to value.

### R3-2 (should-fix): the plan for `pricing-routes.db.test.ts:223-241` contradicts what the code will do

**Evidence.**
- The world loads three files: MAP-01 (March, `SYNPLAN-UNMAPPED-01` only), MAP-04 (April, `SYNPLAN-OON-04` only) and MAP-05 (February, `SYNPLAN-MA-05` only) (`pricing-routes.db.test.ts:103-105`; the fixtures' `REF*CE` and `DTM*472`).
- After `:225` maps MA, the create at `:226` (February to April) is a **mixed period** and now succeeds: a run is recorded and `price` is queued. So `:232` holds `[monitor, price]`, not "exactly that `monitor` job, and no `price` job" as §8.3 says, and `:233` counts one run, not zero.
- That queued run then covers February to April. `uncoveredMonths` counts any run whose status is not `failed` (`plan.ts:129-133`). So the mappings at `:238-239` complete no uncovered month and queue **no** monitor, contrary to §8.3's "The mappings at :238-239 complete March and April the same way".
- `:240` creates a second February-to-April run. `:241`'s exact `queue.jobs` assertion fails: `runQueue` is never called between `:226` and `:241`, so "runQueue skips monitor jobs" does not apply.

**Fix.** Rewrite the first test explicitly:
- `:226` becomes the MAP-06 success: assert the run, its `price` job and the `monitor` job of the `:225` mapping, then drain or reset the queue.
- `:227` stays as the all-unmapped March refusal, with the new message.
- The second test either reuses `:226`'s run or creates its own over a period that is uncovered at that point.
- State in §8.3 which mapping queues a monitor and why, from the world's month-to-plan table above.

### R3-3 (should-fix): a re-run that failed since the newest mapping reads "Ready to price again", with no reason given

**Evidence.**
- §4.2's states count a re-run only when it "is not failed". A counting re-run that fails `waiting_on_content_*` (`execute.ts:445-447,481-490`) or `location_not_ready` (`:442-444,476-479`) therefore drops the month back to `ready`.
- This happens readily: plan B's newly mapped lines can read the MPPR or the MUE that the original run's lines never read.
- The page then offers "Price these months again (N)" with no word of why the last one failed. Each press creates another re-run that fails the same way. Nothing in the state table (§4.2) or §9 shows a failed re-run.

**Fix.**
- Add a state `rerun_failed`: the newest counting re-run failed. Show its failure through the existing `RunFailureText`/`WAITING_LABEL` words (`components/pricing/display.tsx:50-55,65,80`), linked to the re-run.
- Offer the button again only when what it waited on has changed:
  - content: `coversMore` for the release in force, or the terms changed (`termsUnchangedSince`), as #49's monitor judges;
  - location: the location saved since (`practice_site.updated_at`), as #33's judges.
- Add the state to MAP-08 and `mapped-plan.db.test.ts`, and the words to §9.

### R3-4 (should-fix): `to_triage` lists re-runs that have nothing to do with a mapping

**Evidence.**
- §4.2 lists "each accepted re-run in effect … that holds, as pricing in effect, a line of the listed plans (a mapped plan, or the one plan) which triage would advance and has not". On the practice-wide list, that is any mapped plan.
- So a re-run accepted after a contract version's sign-off or a release (`rerunReasons`, `rerun.ts:34,43-53`) shows on Payer and plan mapping as "Priced again and accepted: triage it on Cases". It is not a month this screen priced again, and the state misattributes it.

**Fix.** Restrict `monthsToTriage` to lines whose priced line in the run the re-run replaced (`r.rerun_of_id`, same `service_line_id`) was `NO_MAPPING`. It stays one aggregate per run through `priced_line_by_service_line (practice_id, service_line_id)` (`20261018090000_pricing_runs.sql:102`). Assert in MAP-08 that a re-run accepted after a sign-off alone is not listed.

### R3-5 (should-fix): `coverage.unmapped_plans` counts only `NO_MAPPING` lines, but some lines of an unmapped plan stop before the resolver

**Evidence.**
- `price()` stops a line before step 1 for `invalid_settings`, `duplicate_line_no` and `validateFacts`, all as `ENGINE_ERROR` (`packages/pricing/src/engine.ts:166-174,269-283`). `validateFacts` fails on a procedure code outside the pattern, more than four modifiers, a bad place of service, and so on.
- §2.3's query filters `p.unpriced_reason = 'NO_MAPPING'`. So:
  - the MAP-06 invariant (`unmappedPlanTotals` over the month "equals the sum of `unmapped_plans` in plans, lines and cents") is false whenever such a line exists;
  - a plan whose every line stops early is in `unmappedPlanIds` but missing from `unmapped_plans`, so the plan counts differ.
- The screens' sentence "their lines are not priced ({L} lines…)" and the Pricing runs body "are left unpriced as NO_MAPPING" then disagree with the run's own record.
- MAP-01's reworded assertion ("each line of the plan is left unpriced as `NO_MAPPING`") is false for those lines.

**Fix.**
- Total every priced line of the unmapped plan IDs, with no reason filter. They are all unpriced by construction: no mapping means no price.
- State the invariants as follows:
  - `unmapped_plans` equals `unmappedPlanTotals` for the month;
  - the sum of `unmapped_plans[].lines` is at most the run's unpriced count.
- Word MAP-01 and the Pricing runs body as "never priced; a line the resolver reaches is `NO_MAPPING`". Add a property case with an invalid-facts line of an unmapped plan.

### R3-6 (should-fix): "no duplicate re-run" and "only the last mapping queues" hold only one request at a time

**Evidence.**
- `createRerun` takes no lock ("No lock: a re-run created beside a completion is judged when it is accepted", `rerun.ts:215-216`), and §4.2's handler names none.
- Two people press "Price these months again" at the same moment. Each transaction runs under READ COMMITTED, so each reads every listed run as `ready` before the other commits, and each creates a re-run of every month. D4 and §4.3 item 5 ("A second person … gets … no second re-run") promise otherwise.
- Likewise, two people mapping a month's last two plans at once each see the other's plan as unmapped, so neither queues the monitor and the month waits for the daily run.

**Fix.**
- Take a per-practice transaction lock first in both handlers: `pg_advisory_xact_lock(hashtextextended('plan_months:' || practice, 0))` in `priceAgainAction` before computing `monthsToPriceAgain`, and in `mapPlanAction` before its D2b check. The second request then reads the first's committed rows, so the run is `already` and is skipped, or the month is complete and the monitor is queued.
- Add a db test with two concurrent connections for each.

### R3-7 (should-fix): text that still states the old rule is missing from §13

**Evidence.**
- `README.md:265` (not #42's): "a month with an unmapped plan waits".
- `apps/web/src/lib/routes/coverage.ts:33`: "whether a pricing run over every line would be refused for an unmapped plan".
- `apps/web/src/lib/routes/pricing.ts:55`: "A run over a plan with no mapping is refused (MAP-01)".

Both route files are in §13, but these lines are not named. The README is not listed at all.

**Fix.** Add the three lines to §13 and §2.2 with their new words ("…a month none of whose plans has a mapping waits; a plan with no mapping leaves its lines `NO_MAPPING`"). Add a check to the PR's own test list: `git grep -i "refused until every plan\|never runs on\|unmapped plan waits"` returns nothing outside ADRs and stored-report wording.

### R3-8 (should-fix): the e2e plan ignores the shared "other" practice and the new monitor in `pricing.spec.ts`

**Evidence.**
- `mapping.spec.ts`, `pricing.spec.ts` and `contracts.spec.ts` all work in `practiceId('other')`.
- `pricing.spec.ts` sets the practice's location, uploads MAP-05 and maps the MA plan through the UI (`:75-81`). Under D2b that mapping completes February, so it queues the monitor. The spec then starts the local worker (`:91`) **before** pressing "Create the run" (`:94`). The monitor can create and triage a February first run beside the person's run. §8.3 says only that `pricing.spec.ts` "asserts the run page's new sentence".
- The rewritten `mapping.spec.ts` asserts practice-wide figures: "2 plans have no mapping", "1 month … waits for 1 other plan's mapping", and Coverage dropping the Alerts. Those figures depend on what the other specs left in the practice. Its "Price them now" also prices other specs' uncovered months.
- CI retries once (`playwright.config.ts:96`) and mappings persist, so a retry starts with the plans mapped and step 1 fails.

**Fix.**
- In `pricing.spec.ts`, either assert the monitor's February run, or start the worker only after "Create the run" and assert that the queued monitor then finds February covered, as AUDIT-01 does.
- Give MAP-06 a service month no other "other"-practice spec uses.
- Scope `mapping.spec.ts`'s assertions to the MAP-06 plans' rows and that month's region, not to practice totals.
- Make every step retry-safe (read the plan's mapping state first, as `journeys.ts:362` does).

### R3-9 (nit): the coverage report's "allowed" sentence is reworded for reports already stored

**Evidence.** Today the PDF reads "Every plan with lines has a mapping: a pricing run can start." (`apps/worker/src/report/documents.ts:305-306`) and the web view reads "Every plan with lines had a mapping." (`components/reports/documents.tsx:61`). §5.5 replaces both with "Every plan with lines has a mapping." for every report. That rewords stored documents, against D8 and review 12d.

**Fix.** Key the allowed sentence on the new optional fields too: absent fields keep today's words in each view.

### R3-10 (nit): the audit object type of the per-run aggregate reads

**Evidence.** §4.2 audits `to_triage` (and, implicitly, the listing) through `readWithAudit` with `objectType: 'priced_line'`. The rows are one per run, so each event's `object_id` would be a run's ID under the type `priced_line` (`packages/db/src/authz/audit.ts:59-90`).

**Fix.** Use `objectType: 'pricing_run'` with the run's ID, as the run pages do. Or state that the figures are aggregates and unaudited, as `waitingTotals` is.

### R3-11 (nit): stale or imprecise references

- "First month of service" `Field` is `pricing-runs/page.tsx:85`, not `:86` (`:86` is "Last month"). Used in §1.1, §2.2 and §14.2 R7.
- "Alerts above the queues (the queue list, `:124`)": `page.tsx:124` is an entry of the `queueLinks` helper. The queues render at `page.tsx:368-375` (the "Queues" region). Used in §3.2, §5.7 and §13's SS-01 overlap.
- §10's screening-gate sentence lists only `price/*`, `monitor/*` and `contracts/src/*`. The PR also edits `apps/web/src/lib/billing/runs.ts` (`watched-paths.txt:73`) and `apps/web/src/lib/http/route.ts` (`:88`), both watched. The list stays unchanged, but the gate measures them.
- `job.ts:73` is the content line's `record_count`. The design cites `:73` correctly in §2.2 but writes `:66-75` and `:63` elsewhere. Fine; listed for completeness.

### R3-12 (nit): the screens' location wait holds a month the monitor would plan, so D2b under-queues

**Evidence.** `monthsWaitingOnLocation` reads `location_not_ready` from the newest run's failure code alone (`apps/web/src/lib/pricing/location.ts:228-246`). The monitor also requires that run's cut-off to be at or after the month's newest line, and that the run was created at or after the last location save (`monitor/plan.ts:173-176`). A month with lines loaded after its failed run is planned by the monitor, but D2b reads it as `held: 'location'`, says "Mapped" and queues nothing. The daily run then prices it. No wrong number results, only up to a day's delay.

**Fix.** Either add the two conditions to `monthsAwaitingMappings`' `held` test (from `uncoveredMonths`' `newest` and `practice_site.updated_at`), or record the difference in §4.1 and D18 as accepted.

## Summary

| # | Severity | Short |
| --- | --- | --- |
| R3-1 | blocking | A mapping's queued monitor prices every uncovered month, so mixed months cost re-runs during onboarding |
| R3-2 | should-fix | `pricing-routes.db.test.ts:223-241` plan contradicts the code (`:226` now succeeds) |
| R3-3 | should-fix | A failed re-run reads "Ready to price again", with no reason |
| R3-4 | should-fix | `to_triage` lists re-runs unrelated to mapping |
| R3-5 | should-fix | `unmapped_plans` misses lines stopped before the resolver; the MAP-06 invariant is false |
| R3-6 | should-fix | No lock: concurrent presses duplicate re-runs; concurrent last mappings queue nothing |
| R3-7 | should-fix | Old-rule text left in `README.md:265`, `routes/coverage.ts:33`, `routes/pricing.ts:55` |
| R3-8 | should-fix | E2E: the shared "other" practice, `pricing.spec.ts`'s new monitor, retry safety |
| R3-9 | nit | Stored coverage reports' "allowed" sentence reworded |
| R3-10 | nit | Audit object type of per-run aggregates |
| R3-11 | nit | `:85` not `:86`; queues render at `:368-375`; §10 watched files |
| R3-12 | nit | The screens' location wait holds months the monitor would plan |

None of the fixes needs a migration, a change under `packages/pricing`, a #42 file, a new unpriced reason, a new synth module or a fixture release.

## Verification

Each finding was verified independently against `83d71fd6` in `/home/user/unmapped-plan` (notes in the session scratchpad, `progress/up-verify-R3-*.md`). All twelve were judged real. The verdicts, and how the design applies each (its §14.3):

| # | Real? | Verified severity | Verdict, in short |
| --- | --- | --- | --- |
| R3-1 | Yes | blocking | `planMonitoring` (`plan.ts:296-321`) plans every month `uncoveredMonths` returns, and nothing ties the job to the request that queued it, so mapping B (month 1 {A, B}) also prices month 2 {A, C} as a mixed first run; the design contradicted itself (§4.1 against rule 3, "Why D2b" and D2b). The fix (an optional month list in the request-keyed payload, `jobs/registry.ts:45`, not #42's) is right; the list must hold every month `monthsAwaitingMappings` returns with `unmappedPlans = 0` and `held = null`, `terms_changed` months included, not only months holding the mapped plan, or #49's "being priced again" card goes false. A worker-side boolean flag was considered and is worse (a second copy of the rule). Update §2.1 rule 3, "Why D2b", D2b, MAP-07, ADR 0039's amendment, ADR 0075, the `job.ts` header and the registry comment. |
| R3-2 | Yes | should-fix | With Feb = MA-05, Mar = UNMAPPED-01, Apr = OON-04, after `:225` the Feb–Apr create succeeds (1 of 3 plans mapped), so `:232` holds monitor and price and `:233` counts 1; the queued run covers Feb–Apr, so `:238-239` queue no monitor and `:240` creates a second run; `:241` and the next describe's `list.total` 1 fail. Fix as proposed (make `:226` the MAP-06 success, reuse it as `firstRun`) and state in §8.3 which mapping queues a monitor. Test plan only; no product effect. |
| R3-3 | Yes | should-fix | A re-run can fail at execution (`location_not_ready`, `waiting_on_content_*`, `release_read_outside_fetch`, `job_failed`); newly mapped MA lines can read MPPR/MUE the original's lines never read; `createRerun` refuses none of this, so each press repeats a failing re-run. Refinements: use `WAITING_LABEL` but not `FAILURE_TEXT`'s words ("priced by itself" is false for a re-run); the server must enforce the gate (`months_changed` for a posted `rerun_failed`); gate content on `termsUnchangedSince` or `coversMore`, location on a save since, open for `job_failed` and `release_read_outside_fetch`. Add to MAP-08, `mapped-plan.db.test.ts`, `months.test.tsx`, §9. |
| R3-4 | Yes | should-fix | `RERUN_REASONS` includes `release_published` and `version_signed_off`, and a run stores only `rerun_of_id`, so a sign-off re-run accepted from Pricing runs shows as "triage it on Cases" on the mapping screens. Refinements: reach the replaced run's lines through an index bounded to one run (ADR 0083); the literal predicate drops the chain case (B after a mapping, B2 of B after a sign-off), so require that any earlier pricing of the line was `NO_MAPPING`, and assert the chain case stays listed. |
| R3-5 | Yes | should-fix | `price()` stops a line before the resolver as `ENGINE_ERROR` (`engine.ts:166-174,269-283`); `duplicate_line_no` cannot happen for stored lines and `zip_missing` refuses the run instead, but `invalid_line_facts` can (procedure code checked only non-blank in SQL, `/^[0-9A-Z]{5}$/` in the engine). The §2.3 query's `NO_MAPPING` filter makes the MAP-06 invariant false. The fix (no reason filter, restated invariants, reworded MAP-01 and Pricing runs body, an invalid-facts case) is right and keeps ADR 0083 (index on `pricing_run_id`). |
| R3-6 | Yes | should-fix | `createRerun` takes no lock (`rerun.ts:215-216`), `NEWER_RUN_PENDING` counts first runs only, and `pricing_run_reruns` is not unique, so two presses at READ COMMITTED each create a re-run; two last mappings at once each see the other's plan unmapped. The per-practice `pg_advisory_xact_lock(hashtextextended(...))` taken first is the codebase's pattern (`rerun.ts:311`, `plan.ts:282`, `digest/job.ts:60`); write the key as `$1::uuid::text`; one shared key is reasonable. |
| R3-7 | Yes | should-fix | `README.md:265` (not #42's), `routes/coverage.ts:33` and `routes/pricing.ts:55` still state the old rule and §13 does not name them. The grep as proposed has false hits ("never runs on" matches `billing/config.test.ts:44` and `tools/check-releases-immutable.sh:6`); use specific phrases. Related gap: `contracts-routes.db.test.ts:255-256` asserts `coverage.readiness`, which the design replaces, so it cannot stay "not edited". |
| R3-8 | Yes | should-fix | The pricing.spec part is wrong: "other" ('SYNTHETIC OTHER PRACTICE') gets the e2e worker's placeholder monitor (`worker.ts:33-63`), so starting the worker at `:91` is harmless and the spec needs one sentence. The mapping.spec part holds and is worse: "Price them now" queues a placeholder, so "The run is priced" fails every time; the counts depend on run order (contracts.spec's COMM-C, pricing.spec's MA-05, and only pricing.spec sets the ZIP). The retry point is weak (`failOnFlakyTests`). Better fix: run mapping.spec in a practice of its own with a name `chained()` treats as real. |
| R3-9 | Yes | nit | The web view's stored "allowed" sentence ("Every plan with lines had a mapping.", `components/reports/documents.tsx:61`) would change on every view; the PDF changes only for a document still queued at deploy. Use the same presence check as the not-allowed branch and keep each view's words when the fields are absent. |
| R3-10 | Yes | should-fix (regraded from nit) | `readWithAudit` writes one event per row with the context's `objectType`, so per-run rows typed `priced_line` would write mistyped records nothing catches (free `object_type`, no foreign key on `object_id`), and `audit_event_by_object` lookups would miss them. Use `pricing_run` with the run's ID, purpose `mapping`, for both listings, taking the scope, as `readRuns` does (`lib/pricing/queries.ts:165`). |
| R3-11 | Partly | nit | Part 1 is wrong: `grep -n 'First month of service'` returns `pricing-runs/page.tsx:86` (`:85` is the grid `div`), so the design's `:86` stands. Part 2 holds: the Queues card renders at `page.tsx:368` (list at `:375`); `:124` is a `queueLinks` entry, right for the count, imprecise for where the Alerts go (§3.2, §5.7, §13). Part 3 holds: `watched-paths.txt:73` and `:88` are `billing/runs.ts` and `http/route.ts`, both edited; add them to §10's sentence, list unchanged. |
| R3-12 | Yes | nit | `monthsWaitingOnLocation` checks the newest run's failure code alone; the monitor also checks the run's cut-off and the last save. The cost is overstated: the run the monitor would plan normally fails the same way, so a real delay of up to a day happens only when newer lines supersede every stopped line. Adding the conditions to `monthsAwaitingMappings` alone would break D18's one-card rule; record the difference as accepted, correct D18's "mirror" wording, and put aligning `monthsWaitingOnLocation` (#33's file) under Proposals outside this PR. |

**Applied in the design** (revision 3, as revised; §14.3): all twelve, at the verified severities. R3-2 is applied with a different test shape from the one proposed, for the reason in §14.3 (the proposed shape changes every later test's coverage); R3-11's first part is not applied, since the verifier found it wrong.

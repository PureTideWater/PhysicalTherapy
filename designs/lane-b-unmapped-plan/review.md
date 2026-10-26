# Adversarial review: lane-b-unmapped-plan.md (combined audit #32)

- Reviewed: `/home/user/ops/designs/lane-b-unmapped-plan.md` (598 lines), against `/home/user/superseded-rerun` at `ed85bcf3` (co-001/superseded-rerun, #50 merged in). Read only.
- Verdict: **the core of the design holds**, but two findings are blocking and nine should be fixed before build.
- **What holds** (verified):
  - `NO_MAPPING` comes from the contracts resolver (`packages/contracts/src/resolver.ts:163-165`) and the engine only records it (`packages/pricing/src/engine.ts:443-445`). The engine freeze holds and `docs/product/unpriced-reasons.md` is unchanged.
  - Postgres has no mapping guard on `pricing_run` or `priced_line`. `failure_code` is a free regex (`20261018090000_pricing_runs.sql:44`) and `mapping_id` is nullable (`:63`). No migration is hidden.
  - The new route needs no edit to #42's `routes/index.ts`, because `MAPPING_ROUTES` is spread there (`apps/web/src/lib/routes/index.ts:66`). The `monitor` payload `{practice_id, request_id}` exists (`apps/worker/src/jobs/registry.ts:45`).
  - `routes/practice.ts:167` returns `dashboard(...)` whole. The coverage format is not read by SQL beyond `->> 'lines'`.
  - No #42 file is touched, apart from the allowed ADR 0039 amendment and the shared docs and synth files.
  - Re-runs of overlapping runs created in one request do not collide with #50's acceptance rule. Either order of acceptance ends with the later-priced pricing in effect.

---

## 1. BLOCKING: AUDIT-01 breaks, although the design says it is "run, not edited"

- **Evidence:**
  - `apps/web/src/lib/routes/audit-e2e.db.test.ts:430-435` maps every plan through `mapPlanAction`, creates the run with `createPricingRunAction`, then asserts `expect(await runQueue()).toEqual(['price'])`.
  - The design's `afterCommit(() => services.queue.enqueue('monitor', …))` (§4.1) runs after each mapping commits (`apps/web/src/lib/http/invoke.ts:490-511`), and the test's queue is a `MemoryQueue` that records every job (`apps/web/src/lib/uploads/queue.ts:60-71`).
  - The queue therefore holds one `monitor` job per mapped plan before `price`, and the assertion fails. The design states the opposite: §8.3 "Not changed: … AUDIT-01 … It is run, not edited, as the check", and §12.
- **Failure:** CI is red on the milestone gate's end-to-end test, or the builder edits it without the design having said so.
- **Fix:**
  - Record the change to AUDIT-01 in the design.
  - The expected flow becomes whatever the finally chosen enqueue rule produces (with finding 2's rule: one `monitor` before `price`). Assert that the monitor created no run, because the person's queued run already covers March (`uncoveredMonths`, `apps/worker/src/monitor/plan.ts:103-107`).
  - Add `audit-e2e.db.test.ts` to §13 and remove it from "Not changed".

## 2. BLOCKING: D2's claim "first-upload onboarding stays as it is (upload, map, priced)" is false for any practice with more than one plan; the per-mapping enqueue makes it worse

- **Evidence:**
  - D2 (§2.1 rule 2, §11) runs a period only once at least one plan is mapped. §4.1 queues the monitor on every new mapping, with no delay (the same pattern as `settings.ts:720`).
  - A new practice's first upload holds several plans, every one unmapped.
  - When the first plan is mapped, the monitor prices every month at once as first runs (`plan.ts:190-198`), with every other plan's lines `NO_MAPPING`. Each later mapping then needs "Price these months again" and a hand acceptance per month (`rerun.ts:305-365`): plans × months acceptances.
  - Today the same practice maps every plan and gets first runs, with zero acceptances. The design's own reason for D2 ("Creating one would force a re-run and a hand acceptance for every month after mapping") applies to exactly this sequence, which it produces.
- **Sequence:**
  1. Upload 12 months with 8 plans.
  2. Map plan 1. The monitor creates 12 first runs at once.
  3. Map plans 2 to 8. Each plan's page offers 12 re-runs, so 7 × 12 re-runs to create, then accept one by one after their diffs.
  4. Even the best path (map all, press once on the last plan's page) still needs 12 acceptances that today's flow never needed.
- **Fix (the best option; it keeps the audit's rule for mixed months):**
  - **(a) Queue the monitor on a mapping only when it leaves at least one waiting month with every plan of its lines mapped.** Use one query over `uncoveredMonths` and `runPlans`, as in `create.ts:101`. A completed onboarding mapping then prices at once, as today.
  - **(b) Otherwise, show the person on the plan page and the mapping list:** "N months wait for their plans' mappings. Map every plan first, or [Price them now]: lines of the P plans still unmapped stay NO_MAPPING and need pricing again after they are mapped." The button is a `mapping.edit` action that queues the request-keyed monitor.
  - The daily monitor still prices mixed months (the audit's rule), so nothing waits more than a day.
  - Record this as decision D2b, with its reasons: UX, fewer hand acceptances, time to value, and no change to J17.
  - It also fixes finding 1's flow, because only the last mapping queues the monitor.
  - MAP-07's assertion changes to match.

## 3. SHOULD-FIX: re-runs created by "Price these months again" are never triaged, so the newly priced lines never reach validated or actionable

- **Evidence:**
  - `apps/worker/src/price/job.ts:47-49` queues triage only for a run `createdByMonitoring`. A person's run or re-run is triaged by a person from Cases (`apps/web/src/lib/routes/triage.ts:391-406`; `chain.ts` header: "a run a person created is not chained: its creator triages it from the Cases screen").
  - The design's flow ends at acceptance (§4.3 steps 4-5; e2e step 5). Nothing tells anyone to triage, and the plan page then lists nothing.
- **Failure:** the plan is mapped, priced again and accepted, but no case or packet ever appears for its shortfalls, and their dispute windows run out unseen. That is the harm the audit item exists to stop.
- **Fix:**
  - Add a fifth state to §4.2's table: `to_triage` (accepted, its run in effect, with no triage of it). It shows "Priced again and accepted: triage it on Cases", linking to the Cases triage form, which holders of `case.work` see.
  - Assert in MAP-08 and PRC-29 that after triage the plan's lines reach validated.
  - Do not auto-triage on acceptance unless an ADR 0038 amendment says so. If the co-founder's rule prefers it, record that choice here with its reasons.

## 4. SHOULD-FIX: the live notice disappears at mapping, while the plan's lines stay `NO_MAPPING` in effect until each re-run is accepted

- **Evidence:**
  - `unmappedPlanTotals` counts "plans with lines and no `payer_plan_mapping` row" (§3.2). The moment the plan is mapped, Coverage, home and Pricing runs show "Every plan has a mapping".
  - The pricing in effect still holds the lines as `NO_MAPPING` (`PRICED_IN_EFFECT`, `apps/worker/src/price/in-effect.ts:404-408`). Coverage's reason table keeps the closed list's remedy for `NO_MAPPING`, "Map the plan", which is now wrong for those lines.
  - The e2e test says "Accept on the run page. Coverage drops the notice" (§8.3 step 5). Under the design it already dropped at step 3.
  - Only the plan's own page knows. Someone who maps and leaves is never reminded.
- **Fix:**
  - Add a practice-wide figure: lines in effect that are `NO_MAPPING` and whose service date a mapping now covers. Compute it with the same SQL as `monthsToPriceAgain`, without the plan filter, in counts and cents only.
  - Show it on Coverage, the home page and the mapping list: "{L} lines, {$X} billed, of mapped plans are still not priced: price their months again", linked to the practice-wide action of finding 5.
  - Fix e2e step 5 (the notice drops at step 3; the new figure drops at acceptance). `unpriced-reasons.md` stays unchanged: the screen adds the line, the closed list does not.

## 5. SHOULD-FIX: pressing the button plan by plan creates duplicate re-runs of the same run

- **Evidence:** the state rule (§4.2, `ready`) is "no re-run of it created after **the plan's** newest mapping". After plan B is pressed and plan C is then mapped, C's page lists the same in-effect runs as `ready`, so pressing creates a second re-run of each original.
  - Both stay acceptable in either order (verified against `SUPERSEDES_RERUN`, `in-effect.ts:445-447`), so nothing is mispriced.
  - It doubles the re-runs, the diffs and the acceptances. If the person accepts B's first, C's diff is against B's.
- **Fix:**
  - Add a practice-wide "Price these months again" on the mapping list (and from finding 4's notice), over the union of plans, with one re-run per run in effect. Keep the plan page's button as a filtered view of the same action.
  - Define `being_priced` and `to_accept` per run: any non-failed, unaccepted re-run of it created after the newest mapping that covers any of its listed lines.
  - Assert in MAP-08 that two plans mapped in turn give one re-run per month.

## 6. SHOULD-FIX: the plan page shows a re-run that can never be accepted as "Priced again: review and accept", and it blocks `ready`

- **Evidence:** §4.2 makes "complete and not accepted" the state `to_accept` and excludes the run from `ready`. Two kinds of re-run match that and can never be accepted:
  - One pinned to a withdrawn release (`acceptRun`, `rerun.ts:331-333`).
  - One superseded by an overlapping run of another period that completed after it (`SUPERSEDES_RERUN`, other-period case, `in-effect.ts:445-447`) while the original still holds the plan's line in effect. Example: a Jan 15 to Feb 15 run priced after the Jan re-run, with the plan's lines on Jan 5.
- **Failure:** the month is stuck as `to_accept`, the button never offers it again, and the screen misstates its state.
- **Fix:** read #50's `RERUN_ACCEPTANCE` (`in-effect.ts:500-504`) in `monthsToPriceAgain`.
  - `superseded` and `release_withdrawn` count as no re-run, so the month is `ready` again.
  - `newer_run_pending` reads as `waiting`.
  - Only `awaiting` is `to_accept`.
  - Add these two sequences to `mapped-plan.db.test.ts`.

## 7. SHOULD-FIX: refusals from the new route do not reach the person's form

- **Evidence:**
  - `refusal()` is module-private in `apps/web/src/lib/routes/pricing.ts:300-311`, yet §4.2 step 4 says it maps the refusals.
  - It maps `RerunRefusedError` to field `runId`, which the price-again form does not have (its fields are `planId`, `runIds` and `releaseNo`). Its messages read after the label "This run: ", and with many runs they do not say which month.
  - `recordRun` can also throw `PricingLocationWaiting` for a re-run (`create.ts:161-163`).
- **Fix:**
  - Export a shared mapper, or write the route's own.
  - Report on `runIds` with the month named in dates, for example "2026-03-01 to 2026-03-31: is not priced again yet, because …". These are dates only, not PHI.
  - Map `PricingLocationWaiting` to `LOCATION_WAITING`.
  - Use `refreshOnError`, as #50's forms do, so the list is shown again as it is now.

## 8. SHOULD-FIX: the new route is missing from `RUN_STARTING_ROUTES`

- **Evidence:**
  - `apps/web/src/lib/billing/runs.ts:10-20` lists every route that starts new work ('practice.pricing_runs.rerun' among them). The wrapper asks `practice_run_refusal` first (`invoke.ts:500-505`).
  - The design never adds `practice.mapping.price_again`. A suspended practice reaches the database trigger `pricing_run_refused_while_suspended` (`20261029150000_billing.sql:310`), which `recordRun` does not map, so the person gets a 500 in place of the suspension reason.
- **Fix:**
  - Add the ID to `RUN_STARTING_ROUTES`, which the generated route tests (`route-tests/define.ts:146`) and `billing/config.test.ts` then cover.
  - Do the same for finding 2's "Price them now" action, if it is built. The worker already gates `monitor` (`apps/worker/src/billing/refusal.ts:14`).
  - List both in §10 for the security review, and in §13.

## 9. SHOULD-FIX: the run page cannot name the unmapped plans from "the existing RunNames read"

- **Evidence:** `runNames` (`apps/web/src/lib/pricing/queries.ts:342-363`) collects plan and payer IDs only from `coverage.patterns`. Patterns hold priced lines only, through the join to the mapping (`price/coverage.ts:170-183`), so an unmapped plan is never among them.
- **Failure:** §5.4's per-plan links render with blank names.
- **Fix:** extend `runNames` with `coverage.unmapped_plans[].plan_id`, and their payers through `plan.payer_id`. Add `lib/pricing/queries.ts` to §13. Test it in the run page's route test.

## 10. SHOULD-FIX: `unmappedPlanTotals` is not defined precisely, so the screens and the run's coverage can disagree on the same plan

- **Evidence:**
  - The run's `unmapped_plans` counts the run's lines: no reversal claims and no superseded claims (`apps/worker/src/price/lines.ts:194-200`), with dates from `coalesce(l.service_date, c.service_from)`.
  - The query being replaced, `pricingReadiness`, dropped lines with a null `service_date` (`mapping-queries.ts:552`). The design's new query says only "plans with lines and no mapping row".
  - A reversal line's negative charge in the sum can also push a total below `nonNegativeCents` in the coverage report schema (`apps/worker/src/report/documents.ts:62` area).
- **Failure:** the home Alert and Coverage say "14 lines, $1,234.00" while the run page and the audit report say "12 lines, $1,100.00" for the same plan and month.
- **Fix:**
  - Specify the line set as `RUN_LINES` without the period (claim not status 22, not superseded), with dates through `coalesce`. Share it from one fragment.
  - State the invariant, and test it in MAP-06: over the month the run covers, the screen total equals `coverage.unmapped_plans`.

## 11. SHOULD-FIX: the screens' wording claims more than is true

- **Evidence:**
  - Coverage and home say "Every other plan’s lines are priced" (§5.1, §9). Pricing runs says "every other line is priced" (§5.2).
  - That is false for months waiting on the location (`plan.ts:191-203`), for MAP-02 lines, for months with no run under D2, and for every other unpriced reason.
- **Fix:** "Lines of every other plan price as usual" (Coverage and home). On Pricing runs: "{L} lines, {$X} billed, are left unpriced as NO_MAPPING in any run until their plans are mapped." Run it through `pnpm lint:copy` and the UX review.

## 12. NIT: smaller corrections

- **a.** `planPage`'s `notice` enum (`apps/web/src/lib/routes/mapping.ts:82`) must gain `priced_again` (and finding 2's notice). Otherwise `.catch(undefined)` silently drops it.
- **b.** The new matrix rows need `completesIn` values in `registry.ts`; MAP-01's is 3. Choose 3 for MAP-06 to MAP-09 and PRC-29 to PRC-30, so `fixtures.test.ts:66-72` requires their `assertedBy`.
- **c.** Lane A request (b) is unnecessary: the figure codes `lines` (count) and `billed` (cents) already exist (`20261027090000_packet_and_ledger_review.sql:425-430`). Keep the Lane A migration to the kind, the role-filtered recipients and #42's `mail_send` kind. A smaller migration means a smaller domain-model change.
- **d.** A coverage report stored before this PR with `readiness.allowed = false` was true of whole months refused. Render it with its original sentence when the new optional fields are absent, rather than the new "their lines are not priced". The stored document should not be reworded into a different claim.
- **e.** MAP-10's wording says "the billing managers, and only they", but `mapping.edit` also covers the firm principal (`packages/db/src/authz/permissions.ts:67,142`). Say "the people who may map plans".
- **f.** In the bulk route, jobs queued before a later enqueue fails stay queued for runs that rolled back. `priceHandler` ends them harmlessly (`price/job.ts:28-35`, `missing`). Say so in the design, so the security review does not flag it as a leak.
- **g.** The home Alert's "N plans have no mapping" sits beside the existing queue "Plans waiting on a mapping", which also counts partly mapped plans (`dashboard/queries.ts:127`, `dollarsWaitingOnMapping`). Name the difference in the Alert's body, or the two numbers read as a contradiction.

---

## Summary of fixes for the design's next draft

1. **AUDIT-01:** record its new job flow (finding 1).
2. **When mapping queues the monitor:** only when a waiting month becomes fully mapped; otherwise an explicit "Price them now" (finding 2).
3. **Triage:** add the `to_triage` state (finding 3).
4. **After mapping:** a practice-wide "mapped, still not priced" figure and a practice-wide price-again action (findings 4 and 5).
5. **Plan-page states:** read `RERUN_ACCEPTANCE` (finding 6).
6. **The new route:** refusal mapping (finding 7) and `RUN_STARTING_ROUTES` (finding 8).
7. **`runNames`:** include the unmapped plans (finding 9).
8. **Screens:** one line set with the run's coverage (finding 10), and accurate wording (finding 11).

None of these needs a migration, a change under `packages/pricing`, or a #42 file.

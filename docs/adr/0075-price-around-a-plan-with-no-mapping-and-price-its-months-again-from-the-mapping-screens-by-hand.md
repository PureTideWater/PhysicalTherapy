# 0075. Price around a plan with no mapping, and price its months again from the mapping screens by hand

- **Status:** accepted (`co-001/unmapped-plan`, combined audit #32, "One unmapped plan freezes a whole month"; no
  migration). Amends [0028](0028-hold-contract-versions-in-the-database-let-specialists-in-through-support-grants-and-resolve-agreements-purely.md)
  (`assertPricingAllowed` goes), [0030](0030-build-the-mapping-coverage-and-contract-screens-on-the-workflow-services-with-questions-in-their-own-table.md)
  (Coverage's readiness), [0035](0035-keep-a-pricing-run-as-it-was-priced-pin-it-at-creation-and-price-it-one-practice-at-a-time.md)
  (the guard at creation and at execution), [0039](0039-monitor-each-upload-batch-through-a-keyed-job-chain-and-digest-each-month-in-counts-and-totals.md)
  (the monitor's MAP-01 wait and two new uses of the request-keyed `monitor`) and
  [0060](0060-load-era-exports-as-remittances-by-provenance-keep-the-835-authoritative-and-flag-unconfirmed-formats.md)
  (an export's new plans no longer fail a run), each by an amendment appended to it. Keeps
  [0037](0037-re-run-a-complete-run-for-the-same-lines-diff-it-from-the-traces-accept-it-by-hand-and-roll-content-back-by-withdrawal.md)
  and its amendment of 2026-10-26 (a re-run is accepted by hand, only while nothing newer is in effect) and
  [0038](0038-triage-runs-into-anomalies-and-cases-keep-five-stages-and-release-an-audit-report-only-once-a-reviewer-signs.md)
  (a person who works cases triages a run a person created) as they are. Builds on
  [0064](0064-resolve-a-split-zips-locality-from-the-zip-plus-four-files-ranges-the-one-engine-change-the-freeze-allows.md)
  (the months that wait on the pricing location),
  [0071](0071-check-a-releases-coverage-against-the-last-refuse-months-the-content-does-not-cover-read-only-the-keys-a-run-prices-and-keep-a-content-calendar.md)
  (the months that wait on Medicare content),
  [0077](0077-submit-forms-from-the-browser-keep-what-was-typed-name-each-refused-field-by-its-label-and-size-controls-for-phones.md)
  (forms), [0078](0078-scroll-every-wide-table-in-a-named-region-that-says-it-scrolls-and-stack-rows-on-a-phone-through-one-primitive.md)
  (tables) and
  [0083](0083-read-a-months-triage-and-audit-report-in-batches-look-each-line-up-through-an-index-and-hold-only-a-small-measured-share-of-heap-per-line.md)
  (bounded reads); and on ADR 0080 for the rule of queued work once SS-01 merges
- **Date:** 2026-11-01
- **Deciders:** the founder, whose adoption of the combined audit on 2026-10-20 (about 15:10 UTC: "Adopt all of it.
  The 19 freeze exceptions are granted") adopted item #32 and granted its milestone 3 exception (below); the
  co-founder, under the founder's delegation of 2026-10-25, whose ruling of 2026-10-26 (about 00:20 UTC) has the build
  take each recommended option and record its reasons with no open question; the build (Lane B), for the design
  (`lane-b-unmapped-plan.md`, revision 3), its two adversarial reviews (findings 1 to 12g, then R3-1 to R3-12, each
  verified) and its completeness pass (C1 to C12). Every option is judged under the founder's standing rule of
  2026-10-18. Each reversible by the founder
- **PRD sections:** 5 (J6, mapping payers and plans; J7, pricing runs), 6 (Payer and plan mapping, Coverage), 17
  (milestone 3's check); test matrix MAP-01 (reworded), MAP-06 to MAP-09 and PRC-29 to PRC-31 (new); MAP-10 is
  reserved for the follow-up notice

## Context

A pricing run refused a whole period when any plan of its lines had no mapping at all. `@tp/contracts`'
`assertPricingAllowed` threw `PricingRefusedError` from three places: the run's creation
(`assertPracticePricingAllowed` in `apps/worker/src/price/create.ts`), its execution (`execute.ts`, failing the run
`unmapped_plan` with no line kept) and, through creation, the monitor, which listed the month in `waitingOnMapping`
and logged `UNMAPPED_PLAN` at info with no count. So one two-claim plan stopped every finding of every payer in every
month it touched:

- **Nothing was priced in such a month.** No run existed, so no line had pricing in effect; Coverage counted the whole
  month as unpriced, triage never saw it, no case or packet followed, and the dispute windows, computed from remittance
  dates, ran on.
- **New plans are common.** Payers add plans, and a practice's first ERA export brings `PLAN:` plans distinct from its
  835s' `CE:` plans (ADR 0060), so a practice whose 835 plans were all mapped froze every month its first export
  touched.
- **Nobody was told.** The monitor only logged. Coverage and Pricing runs showed a red "Pricing is refused until every
  plan is mapped" to whoever opened them; mapping a plan queued nothing, so the month waited for the next daily run.
- **Postgres never enforced the rule.** No SQL refuses a run or a priced line for an unmapped plan: `priced_line`
  already admits `NO_MAPPING` with a null `mapping_id` (MAP-02's lines are stored that way), and the coverage's format
  is not read in SQL. The guard was TypeScript alone, so lifting it needs no migration.
- **The resolver already says it line by line.** `agreementResolver(...).resolve` gives `NO_MAPPING` for every line
  of a plan with no mapping (`packages/contracts/src/resolver.ts`), and the engine records that outcome as the line's
  unpriced reason (`packages/pricing/src/engine.ts`). `docs/product/unpriced-reasons.md` already describes it ("The
  payer and plan have no mapping on the service date | Map the plan").
- **What constrained the design.** The engine freeze (no non-test change under `packages/pricing`), the closed list
  of unpriced reasons, no migration and no file of open pull request #42 (shared documents and appended amendments
  apart), #33's location wait and #49's content wait kept exactly, ADR 0037's rule that a re-run is a person's and is
  accepted by hand, ADR 0038's rule that a person who works cases triages a run a person created, and ADR 0083's bound
  on what a request reads.

## Decision

### Pricing around the plan (D1, D2)

1. **A run prices every line of its period.** A line whose plan has no mapping at all is never priced: when the
   resolver reaches it, it is left unpriced as `NO_MAPPING`, one by one, like a line no mapping's dates cover (MAP-02);
   a line that fails the engine's own fact checks first (`invalid_line_facts`) is `ENGINE_ERROR`, as for any plan.
   No new unpriced reason and no engine change: `PricingRefusedError`, `assertPricingAllowed` and
   `assertPracticePricingAllowed` are deleted, `unmappedPlanIds` stays, and `practiceUnmappedPlanIds` returns the
   unmapped plans instead of throwing.
2. **A period no line of which has a mapping of its plan in force on its date gets no run (D2).** It would price
   nothing. "Mapped" is decided per line by the mapping in force on its date (`mappingInForce`,
   `payer_plan_mapping_in_force`), the resolver's own rule, so a mapping only for other dates maps nothing (PR #95
   review R3N-1, security F2). `createPricingRun` throws `PricingRunNothingMapped` (counts only) before the location
   check, so the monitor still lists the month in `waitingOnMapping`, now logged with `record_count`, and a person's
   run is refused on "First month of service": "none of the period’s plans has a mapping in force on its lines’ dates
   yet, so a run would price nothing: map them on Payer and plan mapping. A month is priced as soon as every plan it
   holds is mapped, or once any one is, by the daily monitoring or a run from here; its other plans’ lines then need it
   priced again." (review F2).
3. **Nothing is refused at execution.** A mapping is corrected, never removed, so a run whose plans were mapped at
   creation still has them when it prices; a run created before this change and priced after it prices as rule 1
   says. `FailureCode` keeps `unmapped_plan` for the runs that already failed with it, and the run page words it as a
   failure of the past, with no internal name (review UX-6): "A plan of the period’s lines had no mapping, and at the
   time a run stopped for that. Runs no longer do: create a new run, which prices every mapped plan and leaves the
   unmapped plan’s lines unpriced."
4. **The other waits are unchanged.** A month still waits, with no new run, on the pricing location (ADR 0064) and on
   Medicare content its release does not load (ADR 0071), in the monitor's order: location, content, then rule 2. A
   line of a plan with no mapping stops at the resolver, so it reads neither the locality nor any Medicare content and
   never makes a mixed month fail on either. A mapping is a change of the practice's terms (`termsUnchangedSince`), so
   it releases a month's content wait, as ADR 0071 already counts it.
5. **The run records what it priced around (D3).** `COVERAGE_FORMAT` becomes `tp-pricing-coverage/2`, which adds
   `unmapped_plans`: each plan of the run's lines that had no mapping when it was priced, with every line of it the
   run holds (whatever the line's unpriced reason) and their billed cents, signed (`centsText`). The list comes from the
   same records the resolver priced with, so it agrees with the lines it describes. A `/1` run parses with none, which
   is exact: under the old guard no complete run had an unmapped plan. Postgres reads only `coverage ->> 'lines'`, so
   nothing in SQL changes. The run is immutable, so the printed report says what was true when it priced.
6. **One line set everywhere (D16).** `PRICEABLE_LINE`, the condition the run's own lines meet apart from the period
   and cut-off (not a reversal, not superseded, with a service date through the claim's first date), is exported from
   `apps/worker/src/price/lines.ts`, builds `RUN_LINES`, and is what every count of "a plan's lines" in this change
   reads, so the screens, the run and the reports agree on the same plan and month.

### When a mapping queues pricing (D2b, D18, D20, D22)

7. **A mapping queues monitoring only when it completes a month.** After `mapPlan`, in its transaction,
   `mapPlanAction` reads `monthsAwaitingMappings` (`apps/web/src/lib/pricing/mapped-plan.ts`): every month
   `uncoveredMonths` lists, with its plans with and without a mapping and whether the screens' own lists of the
   location and content waits hold it (`held: 'location' | 'content' | null`; a month those lists show as being priced
   again is not held). When a release is in force and at least one month holding this plan's lines has every plan
   mapped and is not held, it queues the request-keyed `monitor` job after the commit, and the page says
   `mapped_pricing` ("The months whose plans now all have a mapping are being priced; they show on Pricing runs when
   done."). Otherwise nothing is queued and the notice is today's `mapped`.
8. **The job names the months it may plan (D20).** The `monitor` payload `{ practice_id, request_id }` gains an
   optional `months`: the first days of every month the read returned complete and not held, oldest first, 1 to 240
   of them (`MONITOR_MONTHS_LIMIT`). `planMonitoring` passes them to `uncoveredMonths`, which then returns only the
   listed months still uncovered; each still goes through the location, content and "nothing mapped" checks. So a
   mapping's job never prices a month still waiting on another plan, and onboarding stays at zero hand acceptances in
   any order of mappings and any spread of plans over months (month 1 holding plans A and B, month 2 holding A and C:
   mapping A, B, then C gives each month one first run and no re-run). The list holds calendar dates only, and the
   job-payload PHI guard (`jobPayloadPhiFindings`, SEC-08) admits it in that one format, as ADR 0072 added
   `words_version`. The singleton key stays `monitor:<practice>:<request>`. A job without `months` (the daily
   schedule, the location save, "Price them now", one queued before this change) plans every uncovered month, as
   before.
9. **Mixed months wait at most a day, and a person may price them now.** A month that no run covers, holding a mapped
   and an unmapped plan and not held, is listed on the plan's page ("{N} months holding this plan’s lines wait for {P}
   other plans’ mappings. …") and on the mapping list, with "Price them now" for holders of `mapping.edit`: a new
   route, `practice.mapping.price_waiting`, that queues the request-keyed `monitor` with no `months`. The daily monitor
   prices those months anyway, so no month freezes, which is the audit's rule.
10. **One lock per practice for the mapping and the re-runs (D22).** `mapPlanAction` and "Price these months again"
    first take `pg_advisory_xact_lock(hashtextextended('plan_months:' || practice, 0))`, the codebase's pattern. Under
    READ COMMITTED, two people mapping a month's last two plans at once then queue monitoring exactly once, and two
    presses of one page create one re-run per month.

### Months already priced: "Price these months again" (D4, D5, D10, D13, D14, D15, D19, D21)

11. **The figure.** Lines whose pricing in effect is `NO_MAPPING` while a mapping is now in force on their date
    (`MAPPED_NOT_PRICED`, composed from the fragments `@tp/worker/pricing` already exports, after `PRICED_IN_EFFECT`
    has chosen each line's pricing, through the index `priced_line_by_reason`). One aggregate statement per read,
    never a line in the request (ADR 0083).
12. **The list.** The mapping list (for the practice) and each plan's page (for that plan) list each run in effect
    holding such lines, oldest first, with its lines and billed cents and one state: `being_priced`, `to_accept` (a
    link to the re-run, where it is accepted by hand after its diff), `waiting` (`newer_run_pending`), `rerun_failed`,
    `ready`, and after acceptance `to_triage`. A re-run counts when it was created after the newest mapping covering
    the run's listed lines, has not failed, is not accepted and, when complete, reads `awaiting` or
    `newer_run_pending` under ADR 0037's `RERUN_ACCEPTANCE`; a superseded re-run or one pinned to a withdrawn release
    never counts (D15). Both per-run listings are audited as reads of `pricing_run`, by the run's ID, with the purpose
    `payer_plan_mapping`.
13. **A failed re-run holds the month only while nothing it waited on has changed (D21).** One that stopped on the
    location reads `rerun_failed` until the location is saved or another release is in force; one that stopped on
    Medicare content, until the practice's terms change or the release in force loads more of that content
    (`termsUnchangedSince`, `coversMore`, the monitor's own rules). After any other failure the month is `ready` with a
    line saying why the last re-run failed. The words are this screen's own, never `FAILURE_TEXT`'s, whose "priced by
    itself" is false for a re-run.
14. **The action.** `practice.mapping.price_again` (`mapping.edit`, in `RUN_STARTING_ROUTES`) creates, in one
    transaction and in that person's name, one re-run per posted `ready` run through ADR 0037's `createRerun`, queues
    its `price` job and records `pricing_run_rerun_created` for it; the route itself records
    `plan_months_priced_again`. It is exact with no duplicate (D4): a ready month the page did not send, or a posted
    month neither ready nor already being priced again, refuses the whole request as `months_changed` with nothing
    created; a posted month already being priced again since its newest mapping is skipped, so a second press, by
    anyone, at any moment, creates nothing more and succeeds. At most 60 months a press (D5). A refusal of one month
    names it by its dates and rolls everything back. A job never creates a re-run (Postgres refuses it) and nothing is
    accepted automatically (D10).
15. **After acceptance, triage by a person (D13).** An accepted re-run a person created is not chained to triage (ADR
    0038). The month reads "Priced again and accepted: triage it on Cases" (a link for `case.work`; for others "waits
    for triage by a person who works cases") while it holds a line some earlier pricing left `NO_MAPPING` that is now
    priced with a positive shortfall (`priced_line_shortfall_cents`, the database's twin of `@tp/triage`'s
    `shortfallOf`), in no case and below `validated`. A re-run accepted after a sign-off or a release alone is not
    listed.

### The words (D6, D7, D8)

16. **"N plans have no mapping; their lines are not priced".** Coverage, Pricing runs and the home page show it as a
    default Alert, never destructive (nothing failed), with "{L} lines, {$X} billed. Lines of every other plan price as
    usual." and "Map them" (or, without `mapping.edit`, "See them on Payer and plan mapping"); a second Alert, "{L}
    lines of mapped plans are still not priced", links to the months to price again. Everyone who opens the practice
    sees the figures; only `mapping.edit` holders get the actions.
17. **The reports.** The coverage report is a stored snapshot, its figures fixed when it is made, so a new one says in
    the past tense "{N} plans had no mapping; their lines were not priced ({L} lines, {$X} billed)." or "Every plan
    with lines had a mapping.": a plan mapped later never makes a stored document false (review UX-5; the screens keep
    the present tense, of the practice now). A stored report without the two new optional fields keeps both of its own
    sentences, in each view. The audit report (past tense, of one run as priced) says "{N} plans had no mapping
    when this run was priced; their lines are not priced ({L} lines, {$X} billed).", from the run's own coverage.

### The milestone 3 exception

Granted in the founder's adoption of the combined audit, 2026-10-20 (about 15:10 UTC: "Adopt all of it. The 19
freeze exceptions are granted"; `HANDOFF.md:471-473` on `claude/build-ops`), for item #32: "Freeze exception: yes,
because the milestone 3 check reads 'an unmapped plan blocks pricing'". PRD 17's milestone 3 check now reads "A 2 GB
zip queues per file; an unmapped plan's lines are left unpriced (`NO_MAPPING`) while the rest of the month prices, and
show on coverage", and its opening prompt (`docs/product/milestone-prompts.md`) says the same. PRD 5 (J6) and PRD 6's
mapping row say the new rule. reconciliation-001 records the exception under "What must not change, as checks",
Milestones and gate dates. No other milestone, check or gate date changes.

## Alternatives considered

| Option | Why not (or when we would switch) |
| --- | --- |
| Refusing per month (the rule before) | One small plan stops every payer's findings in every month it touches while windows run; the database never enforced it |
| Pricing an all-unmapped period anyway | The run prices nothing, and each later mapping would need a re-run and a hand acceptance per month; its only gain, anomaly screening of the unmapped lines, comes once any plan is mapped |
| Queuing the monitor on every mapping | Prices a new practice's months as first runs at its first mapping, so every later mapping needs a re-run and an acceptance: plans × months acceptances where onboarding had none |
| Queuing only when no mixed month remains in the practice | Holds back months already complete |
| A worker-side "complete months only" flag in the job | A second copy of the "every plan mapped" rule in the worker; the list of months keeps one rule in one place, in calendar dates that are not PHI |
| Accepting re-runs automatically after a mapping | ADR 0037 and J17: a person compares a re-run's changes before it replaces what is in effect |
| Triaging an accepted re-run automatically | Would open cases from a mapping-holder's click (`mapping.edit`), where triage is case work (`case.work`, ADR 0038), and change ADR 0038 and 0039 for every accepted re-run |
| A job creating the re-runs | Postgres refuses a job's re-run (`pricing_run_job_creates_first_runs`), and a re-run is a person's work |
| A new unpriced reason for an unmapped plan | The closed list already holds `NO_MAPPING` with the remedy "Map the plan", and the engine freeze holds |
| A unique index against duplicate re-runs | A migration, and it would refuse ADR 0037's legitimate repeated re-runs; the per-practice lock and the exact rule suffice |
| Recomputing the unmapped plans from today's mappings when a report is printed | A run is immutable (CLAUDE.md rule 3); the report must say what was true when the run priced |

## Consequences

- The engine and the unpriced reasons are unchanged: `git diff -- packages/pricing/src ':!**/*.test.ts'` is empty and
  `tools/engine-freeze` passes with no exception. No migration and no domain-model change.
- Unmapped plans' lines now reach anomaly screening as `NO_MAPPING` (`packages/triage/src/anomaly.ts` already screens
  that reason), so they can be flagged, investigatory only and in no total.
- Line stages stay monotonic (D9): a line flagged while unmapped stays flagged if a later accepted re-run prices it with
  no shortfall, as for MAP-02's lines and for corrections.
- A practice that maps some plans of a month and not others, then lets the daily monitor run or presses "Price them
  now", gets a mixed first run, and each later mapping lists that month to price again. That is the cost of never
  freezing a month, and the screens say so before it happens. A mapping's own job never prices a mixed month.
- The screens' location list can hold a month the monitor would plan (lines loaded after its failed run, or a save
  that left the location not ready), because `monthsWaitingOnLocation` reads the newest run's failure alone; the
  mapping then queues nothing and the daily monitor plans the month, at most a day later and almost always failing the
  same way. No figure is wrong. Aligning that query with the monitor is #33's (Revisit when).
- AUDIT-01's job flow gains one `monitor` step that creates no run (the month is covered by the person's queued run),
  and its worksheet still matches line for line.
- A refused "Price these months again" leaves the `price` jobs it queued for runs that rolled back; the price job ends
  each as `PRICING_RUN_NOT_FOUND` with the opaque run ID, as for the single re-run.
- Checks: `packages/contracts/src/coverage.test.ts` and `contracts.db.test.ts` (MAP-01),
  `apps/worker/src/price/price.test.ts` and `price.db.test.ts` (MAP-06, MAP-07, PRC-30),
  `apps/worker/src/monitor/job.test.ts` and `monitor.db.test.ts`, `apps/worker/src/jobs/registry.test.ts` and
  `packages/observability/src/phi-guard.test.ts` (the `months` payload), `apps/worker/src/report/documents.test.ts`
  and `report.test.ts`, `apps/web/src/lib/pricing/mapped-plan.db.test.ts` (MAP-07, MAP-08, PRC-29, PRC-31),
  `apps/web/src/lib/routes/mapping-routes.db.test.ts` (MAP-06 to MAP-09, PRC-31),
  `apps/web/src/components/mapping/months.test.tsx`, the edited `pricing-routes`, `contracts-routes`,
  `report-documents-routes` and `audit-e2e` db tests, the generated route tests (the two new routes in
  `RUN_STARTING_ROUTES`), and the end-to-end `mapping.spec.ts`, rewritten in a practice of its own, on MAP-06's
  synthetic 835 (`fixtures/synthetic/MAP-06`, release 900001).

## Not covered

- **The persisted notice and its email.** The audit's "A new plan appeared: N lines, $X billed, waiting for its
  mapping." to the people who may map plans needs a notification kind and recipients filtered to `mapping.edit` (each
  a closed SQL list or a SECURITY DEFINER function: a Lane A migration), and after #42 merges, the notice's mail kind in
  #42's outbox. MAP-10 is reserved for that follow-up. Meanwhile the screens show the live figures.
- **The Drizzle schema's comment** on `pricing_run.coverage` (`packages/db/src/schema/pricing.ts`, "tp-pricing-coverage/1,
  once complete.") is #42's file; it reads "/1 or /2" in the first pull request after #42 merges. Nothing reads it.

## Revisit when

The Lane A migration and #42 have merged (the persisted notice and email, MAP-10); #33's screen query
`monthsWaitingOnLocation` is aligned with the monitor's `waitingOnLocation` (the newest line and the last save), so a
mapping queues monitoring for those months too; a contract version's sign-off should queue monitoring for a month it
releases from a content wait, as a mapping now does (#49's follow-up); or a practice has more than 240 complete months
at once (the route passes the oldest 240 and the daily monitor plans the rest).

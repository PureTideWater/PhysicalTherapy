# PART gateway: fix round of PR #75 (security S1, S2, the nit on the person's event)

Worktree /home/user/contract-phi-check. Nothing is committed, stashed or reset. All data is synthetic.

"Before" means the worktree with every other part's edits and my tests, but without my source changes. I built that
in a clone at /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/clones/fix-gateway-before
(9b7eadfe, plus the other parts' WIP, minus my gateway.ts and contract-proposals.ts). For the unit run, "before" was
the worktree before I edited gateway.ts. All logs are in
/tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/progress/fix-gateway-*.log.

## S1 (major): every click ran the full audited read of the practice before it could be refused. Fixed.

### Which fix, and why
I took the skeptic's reorder (its fix 2), which the reviewer also proposed. I did not take the main fix both of them
proposed, a `model_screen` route bucket, for two reasons:
- **It cannot land in this PR.** `apps/web/src/lib/http/rate-limit.ts` is a #42 file (LANES.md:88).
- **A screen-level limit does better.** A route bucket counts every click, including clicks the gateway refuses anyway.
  It counts per user and per address only. A limit taken just before the screen counts only screens that are about to
  read, and it also caps one practice across all its people.

**The order (packages/model-gateway/src/gateway.ts).**
- The idempotency lookup now runs before the screen (:245).
- So does a new read-only budget check: `spentSince >= budget` refuses with the existing `MODEL_BUDGET_EXCEEDED` line
  (:253).
- `refuseOverBudget` (:290) is the one place that logs and throws for both budget refusals.
- The atomic hold stays after the screen. The read does not count calls in flight, so it never refuses a call the
  hold would allow.
- `spec.screen` is called on the spec, so its binding is kept.
- The doc comment lists the order as steps 0 to 12.

**The caller's step before the screen: `CallContext.beforeScreen` (gateway.ts:105, run at :305).**
- It runs once every other refusal has passed, and only for a purpose that has a screen.
- If it throws, the call is refused: nothing is screened, held, sent or logged.
- It cannot skip, change or answer the screen.

**The screen's limits (apps/web/src/lib/models/contract-proposals.ts).**
- `SCREEN_LIMITS` (:148): 20 an hour and 60 a day per practice; 20 an hour and 100 a day per person.
- They are counted by `rate_limit_take` in buckets `model_screen` and `model_screen_day`. No migration: the bucket
  column accepts any name of the pattern. The hour and the day need separate buckets because the function keeps one
  window per bucket and subject.
- Each subject is an HMAC under the server's key, in rate-limit.ts's form (`screenLimitSubject`, :156).
- `takeScreenLimits` (:171) runs on the **model pool**, never the request's pool (ADR 0055). Each count is its own
  transaction. Counting stops at the first limit reached.
- A refused screen logs `MODEL_SCREEN_LIMITED` with `practice_id` and shows the `screen_unavailable` notice
  (`SCREEN_LIMITED_PROBLEM`, :201). A notice of its own is requested.

**The person's event moved into the same step (:321).** It now runs: limits first, then
`recordContractScreenRequested`.

**A remembered `names_patient` (:213).**
- Each server remembers, for one hour, that a document named a patient. The key is the practice, the document and a
  SHA-256 of the pages screened.
- It holds nothing of the match: no identifier and no text. At most 1,000 entries.
- A click on that document again within the hour is refused at once (:310): no read, no decrypt, no audit row, and it
  does not count against the limits.
- I weighed four options:
  - Caching `clear` was rejected. There is no record version without a migration, and a stale `clear` would send PHI.
  - A remembered refusal can only go stale toward refusing, so it needs no record version.
  - An in-process screen limit was rejected because it is not shared across web tasks.
  - Postgres-backed limits are shared across tasks and hold no PHI.

**Other changes.**
- `apps/web/src/lib/routes/test-support/model-world.ts`: the seeder's services gained a `sealer`. It calls
  `proposeTerms`, so it would not compile without one.
- `apps/worker/src/models/permitted.ts:207` and `apps/web/src/lib/routes/models.ts:18`: doc comments.

### Tests: audit rows per click, before and after
`apps/web/src/lib/routes/models-routes.db.test.ts`, describe 'what a click costs…' (:664):

| Case | Before | After |
|---|---|---|
| Spent budget, 3 clicks | {events 3, screens 3, reads 18}, i.e. 6 audited reads and 1 event per click | {0, 0, 0}, plus the route's own 3 events |
| Misfiled document, 3 clicks | {3, 3, 18} | {1, 1, 6} |
| The limits | TypeError (no limits existed) | Counted only for a screen about to read: none for a kill-switch click, one hit on each of the 4 counters for a real screen; past each of the 4 limits, nothing read, sent or recorded, and one `MODEL_SCREEN_LIMITED` line |

Before 5 failed and 11 passed; after 16 of 16 pass (fix-gateway-web-db-before.log and fix-gateway-web-db-after.log).
Two of the five failures were the nit's assertions in the kill-switch and MOD-11 tests (next section).

`packages/model-gateway/src/gateway.test.ts`:
- New tests:
  - a replay takes no screen connection (:766);
  - a spent budget takes no screen connection (:780);
  - the step before the screen (:794): not run for busy, the kill switch, the PHI boundary, a refused input, a
    completed call or a spent budget; run once before the screen's first connection; a throw refuses the call
    unscreened; never run for a purpose without a screen;
  - an unserved variant does not run the step (:369).
- Four MOD-12 tests now assert no hold where they used to assert no `completedCall`.
- I applied the records part's request: `postings: 1` at :379.
- Before: 4 failed, 49 passed. After: 53 of 53 pass (fix-gateway-unit-{before,after}.log).

`packages/model-gateway/src/gateway.db.test.ts:537`, on Postgres: a replay and a spent budget write no contract_screen
audit row. Before, it failed with 20 rows against 10 expected: the replay screened again. After, it passes; gateway.db
and patient-records.db pass 32 of 32 (fix-gateway-gwdb-{before,after}.log).

`apps/worker/src/models/permitted.db.test.ts:276`: a spent budget reads none of the practice's records. Before, it
failed because `names_patient` came first; after, it passes (fix-gateway-permitted-{before,after}.log).

## The nit: refusals before the screen recorded the person's event with no reads. Fixed.
- The event is now written in `beforeScreen`, after every refusal the gateway can make without the screen and after
  the limits. It stays in the request's transaction, joined to the reads by request ID.
- No refusal before the screen writes it any more. Those refusals are: busy, a purpose or variant not served, the kill
  switch or a flag, the PHI boundary, a refused input, a completed call, a spent budget, a limit, and a remembered
  document.
- The event is still written with no reads in two cases: above the bound (the screen only counts) and
  `screen_invalid`. The rollback-on-a-later-failure gap is unchanged.
- Tests: the kill switch and MOD-11 tests now assert no event and no reads (models-routes.db.test.ts:1002 and :974).
  Before: 1 event and 3 events respectively, with no reads. After: none.

## S2 (minor): the access log cannot show who caused a screen's reads, and lists only the first 50. Not fixable here: it needs a migration plus #42's route.

Why it cannot be fixed in this PR:
- `practice_access_log` has no id cursor and returns no `request_id`.
- `at_most` is capped at 200, and every read of one screen shares one `at`.
- So neither the page nor a query in a file of its own can page through the tie or name the cause.

I did not change the page. A label alone, without the link to the person, is copy best left for the UX part once the
real fix lands.

What is done instead:
- **Pin test:** models-routes.db.test.ts:740, built from the skeptic's experiment through the real routes. It passes
  before and after, and is written to flip when Lane A lands. It asserts:
  - a screen of more than 50 rows lists exactly 50;
  - every one is labelled 'a job of the practice | system | null';
  - the person's event appears separately, as 'support', SYN-MOD;
  - a skipped claim is still found by the object filter.
- **requests.md, gateway 5 (after #42):** the exact patch for settings.ts and page.tsx (an id cursor, `causedBy`) and
  the test to flip.
- **requests.md, gateway 7 (Lane A):** the function change (`before_event` with an (at, id) cursor, `request_id`,
  `caused_by` from the joined event, an index if needed).
- **ADR text:** gateway-docs.md items 3 and 8. Do not put the person's grant_id on the reads (M8).

## Also done: the records part's request 4 (my files)
- The `screen_failed` test now asserts that its reads, per table, equal the practice's held rows
  (models-routes.db.test.ts:641).
- permitted.db.test.ts:291: two examples of a practice whose stored member ID does not decrypt are both
  `refused:screen_failed`, with one audited read each, and both reads kept. It passes before and after, because the
  records part's F3 fix is in both.

## Requests and docs
- requests.md, section "gateway":
  1. contract-terms.ts doc (the order);
  2. spec.ts doc (the order);
  3. patient-records.ts docblocks (the event's timing; "the audit_event trail");
  4. recommended: a `screen_limited` notice in notices.ts, then a one-line change of mine and one test line;
  5. after #42, S2's settings.ts and page.tsx patch;
  6. after #42, recommended: a `model_proposal` route bucket for the clicks;
  7. Lane A, the practice_access_log migration.
- /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/fix/gateway-docs.md:
  16 items for ADR 0070 Part 3 (the order, when a screen may run, the event's timing, the callers, the refusal, what
  is recorded and logged, what it gives up: the cost over time, the access log, the remembered refusal; consequences;
  departures 20 to 22; tests), ADR 0054:279-282, runbook model-evaluation.md:218-223 (`MODEL_SCREEN_LIMITED`), and the
  test-matrix MOD-12 row.

## What is left, and what others should know
- **Residual per click:** a click that does not screen still writes the route's event and one audited
  `source_document` read, and reads the pages. The generic mutation bucket (120 a minute) bounds this until the
  after-#42 route bucket (requests.md, gateway 6).
- **Limits shared by a practice:** a scripted loop that reaches a practice's limit blocks proposals for every
  specialist of that practice until the window ends (hand entry still works). This is stated in the ADR text.
- **The remembered refusal is per process:** N web tasks may each screen a misfiled document once an hour.
- **e2e:** reruns against one database count against the same practice's limits only if its practice IDs are fixed;
  20 an hour leaves room.
- **Not mine, seen:** `eval/gate.golden.test.ts:431` (`ScreenSet.joins`) does not type-check, and the bound test in
  redact.test.ts fails. Both wait on the tokenizer part's request to patient-records.ts.

## Commands and results (all under flock; PATH as required)
- `pnpm exec vitest run --project unit packages/model-gateway/src/gateway.test.ts`: before 4 failed/49; after 53/53.
- `pnpm exec vitest run --project unit packages/model-gateway apps/web/src/lib/models apps/web/src/lib/routes apps/web/src/lib/http apps/worker/src/models`: 801/802. The one failure is the tokenizer's redact.test.ts bound test.
- `DATABASE_URL=postgres://postgres:test@localhost:5433/postgres pnpm exec vitest run --project db apps/web/src/lib/routes/models-routes.db.test.ts`: before 5 failed/11; after 16/16.
- `… --project db packages/model-gateway/src/gateway.db.test.ts -t "screens no call it refuses"` in the before clone: failed (20 vs 10). After, with patient-records.db: 32/32.
- `… --project db apps/worker/src/models/permitted.db.test.ts`: before 1 failed/9; after 10/10.
- `… --project db apps/web/src/lib/routes/route-tests/route-tests.{10,11}.db.test.ts` (the propose and reject routes): 1150/1150.
- Final: gateway.db, patient-records.db, models-routes.db and permitted.db together: 58/58.
- `pnpm exec tsc -p apps/web --noEmit` and `-p apps/worker`: clean. `-p packages/model-gateway`: only the tokenizer's eval error above.
- `pnpm exec eslint` on my 9 files: clean. `pnpm lint:logs`: pass (1058 files).

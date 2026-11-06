# db (2/4) on #117: root cause (read-only investigation and skeptic, wf_458de122-b65)

## Investigation

# db (2/4) red on PR #117: seedMappedNotPriced / PricingRunInputError

(The harness refused to write report.md, so the report follows as text. Progress is saved in `/tmp/claude-0/-home-user-PhysicalTherapy/41a30c20-8b29-54c0-aac9-2d7e26acf337/scratchpad/dbflake/progress/inv.md`.)

**Verdict:** this is a **product bug in pricing-run creation**, not a test problem with dates or isolation.
- `createPricingRun` reads its cut-off as a JS `Date`, which keeps milliseconds only.
- The price job reads the same cut-off as text, which keeps microseconds.
- When the seed's lines are loaded in the same millisecond as the run's `now()`, the creation check misses them, finds zero lines and throws.

PR #117 touches none of this. The fix is in `apps/worker/src/price/create.ts` and needs two reviews.

docs/runbooks/ci.md:164-165: "Re-run failed jobs only for an infrastructure failure (a runner lost, a download refused, a service that did not start), never for a test that failed: a test that passes on a re-run is a flaky test, and is fixed."

## 1. The failure (run 41914482949, job 126870402241 "db (2/4)")
- **Timing:** the run started 2026-11-04T21:16:08Z and the job at 21:16:10Z. Vitest printed "Start at 21:16:42" and the failure at 21:19:02Z.
- **Commit:** head bb01093d, attempt 1.
- **Other jobs:** the other three db shards and every other job were green. "all green" failed only because of this shard.
```
 FAIL   db  apps/web/src/lib/routes/route-tests/route-tests.8.db.test.ts > practice.reports.documents.pdf
PricingRunInputError: a period that holds at least one service line
 ❯ createPricingRun apps/worker/src/price/create.ts:125:11
    124|   if (lines.length === 0) {
    125|     throw new PricingRunInputError('period', 'a period that holds at l…
 ❯ recorded packages/db/src/authz/scope.ts:153:12
 ❯ transaction packages/db/src/authz/scope.ts:113:20
 ❯ seedMappedNotPriced apps/web/src/lib/routes/test-support/pricing-world.ts:118:19
 ❯ RouteWorlds.buildWorld apps/web/src/lib/routes/route-tests/world.ts:494:38
 ❯ apps/web/src/lib/routes/route-tests/define.ts:87:16
 Test Files  1 failed | 35 passed (36)   Tests  2740 passed | 32 skipped (2772)
```
The error was thrown in that route's `beforeAll` (define.ts:86-89, where worlds A and B are built). That is why the log shows "Failed Suites 1" and the route's tests as skipped rather than failed.

## 2. The mechanism
**What the seed does** (`pricing-world.ts`):
1. An `asOwner` transaction runs BEGIN, SET LOCAL ROLE, set_config, INSERT plan, INSERT service lines 5 and 6 (dated 2026-04-07), then COMMIT.
2. `service_line.created_at` is `DEFAULT now()`, so both lines get T1, the time that transaction started.
3. A new app-pool transaction then calls `createPricingRun` for April 2026.

**What creation does** (create.ts:120-126):
```ts
const { rows: clock } = await scope.client.query<{ now: Date }>('SELECT now() AS now');
const loadedBy = clock[0]?.now ?? new Date(0);
const lines = await runPlans(scope.client, { ..., loadedBy });
if (lines.length === 0) throw new PricingRunInputError('period', ...);
```
- `runPlans` (lines.ts:39-46) keeps only lines with `l.created_at <= $4`.
- node-pg turns `now()` (T2) into a Date and sends it back truncated to the millisecond.
- If T1 falls in the same millisecond as T2, after the truncated value, both April lines are excluded.
- The world's other lines are in March, so the run finds 0 lines and throws this error.

**The rest of the pricing code already keeps microseconds.** `execute.ts:243` and `impact.ts:82` read the cut-off as `coalesce(lines_loaded_by, created_at)::text`. Comments at lines.ts:23, execute.ts:236, impact.ts:34 and create.ts:172 say the cut-off must be kept to the microsecond. Line 121 of create.ts is the one place that does not. So the check at creation and the job can see different sets of lines.

**Which kind of cause it is:**
- **Not dates.** Every date is a literal (March 2026, 2026-04-07, mappings from 2026-01-01). No window is computed from the current date, and the database runs in Etc/UTC. A month boundary or UTC midnight cannot change the result, so a faked clock would not either.
- **Not randomness.** No unseeded data, ordering or UUID changes which lines are selected.
- **Not shared state.** `packages/db/src/testing.ts` gives each test file its own scratch database, and each world has its own practice.
- **It is timing.** It depends on how close the owner's commit and the next BEGIN land to a millisecond boundary.

**How often the seed runs:** twice per authenticated route (worlds A and B), in every one of the 12 route-test files. route-tests.8 has 30 such routes, so 60 calls per run of that file, and hundreds per CI run.

## 3. Reproduction
Local PG 18.4 on localhost:5433, Etc/UTC, under `flock /tmp/laneb-heavy.lock`.

- **The real file at the head passed 4 of 4 times.** That is 575 tests each and 240 seed calls with no failure. In the real test the gap between the two transactions is usually more than 1 ms, so the miss is rare.
- **The same transaction shape on a scratch table** (`scripts/gap.mjs`, 5000 iterations):

| Cut-off read as | Both rows missed |
|---|---|
| JS Date | 23 of 5000 (0.46%) |
| `now()::text` | 0 of 5000 |

  The gap between the two transactions was 685 µs at minimum, 1064 at p10, 1457 at the median and 2442 at p90. 298 of the 5000 gaps were under 1 ms.
- **The deterministic case** (`scripts/sametx.mjs`): a row whose `created_at` equals `now()`.
  - The database held 21:43:06.181021 and the Date cut-off sent 21:43:06.181Z.
  - The Date cut-off found 0 rows; the text cut-off found 1.
  - Over 200 tries, the Date excluded the row every time and the text never did.

## 4. PR #117 and the base
- **#117's diff** (00fd2906..bb01093d) covers the e2e a11y files and two specs, test-matrix.md, the CI-19 fixture and synth's matrix.ts and registry.ts. It touches nothing in pricing, routes or the db.
- **The base is the same.** Nothing changed in apps/worker/src/price or apps/web/src/lib/routes between 30871f72 and bb01093d. The seed dates from 8517ee3a (2026-11-01, audit #32). The cut-off code is older (0b47a325 or earlier; this clone is shallow).
- **Recent runs:** of the last 30 ci runs (274 to 303, 12:47 to 21:16Z on 2026-11-04), this is the only db failure. The other red runs failed elsewhere:
  - 41896761550 (#117's earlier head): unit, the CI-19 fixture.
  - 41832988630: unit, scan.test.ts.
  - 41900650414, 41890954221, 41882220669 and 41838838363 (#110): domain model.

  So this is a rare flake that already exists on the base, seen for the first time here.

## 5. Fix at the root, and who owns it
**This is a product bug in pricing-run creation, so the fix needs two reviews.** No dollar amount is affected, because the job prices from the microsecond cut-off. What breaks is the check at creation: a run created within about 1 ms of a load committing is judged on fewer lines than the job will price. That can:
- wrongly refuse the run with "a period that holds at least one service line", or
- refuse or allow the MAP-07 nothing-mapped check on the wrong set of lines.

Production callers are `apps/web/src/lib/routes/pricing.ts:438` (a person creating a run) and `apps/worker/src/monitor/plan.ts:327` (the monitor job).

**The fix:**
- Read the clock as text: `SELECT now()::text AS now`, and pass the string as `loadedBy`. Or compare against `now()` inside the SQL.
- Add a db regression test in apps/worker/src/price: a line whose `created_at` equals the creating transaction's `now()` must be among the run's lines. What creation's `runPlans` sees must equal what `execute` reads for the same run. On the current code that test fails on almost every run, and it passes after the fix.
- Look for other timestamps read as a `Date` and sent back as a query parameter, e.g. `query<{ now: Date }>`.

**A test-only fix is not recommended.** A sleep in the seed or a backdated `created_at` would hide a real mismatch between the creation check and the job.

**Owner:** the pricing worker (apps/worker/src/price, the run creator and the MAP-07 check from audit #32 / ADR 0075), with the founder's review per CODEOWNERS `*`. It belongs in its own pull request. #117 stays tests-only and only needs this failure explained.

Files are in `/tmp/claude-0/-home-user-PhysicalTherapy/41a30c20-8b29-54c0-aac9-2d7e26acf337/scratchpad/dbflake/`:
- `db2.log`
- `scripts/gap.mjs`
- `scripts/sametx.mjs`
- `run2.json`, `run3.json`, `run4.json`
- `progress/inv.md`

## Skeptic

UPHELD, with three corrections.

**What I checked against the code**
- **Only one condition can drop the two April lines.** In `RUN_LINES` (apps/worker/src/price/lines.ts:39-46), every condition except `l.created_at <= $4` depends on fixed values: the claim status, supersession, the literal 2026-04-07 date, `practice_id` and RLS. RLS is the same as for the March run, which succeeded in the same world.
- **The cut-off is a millisecond `Date` at creation.** No `setTypeParser` or `parseInputDatesAsUTC` exists anywhere in the repo, so `SELECT now()` at create.ts:121 comes back as a JS `Date`. pg 8.23.1's `prepareValue` sends a `Date` back with milliseconds only. `service_line.created_at` is `DEFAULT now()`, and no insert trigger changes it.
- **The job's cut-off is the exact same instant, kept to the microsecond.** A new run sets no `lines_loaded_by` in `recordRun`, so its cut-off is `pricing_run.created_at`. That is the `now()` of the same transaction as create.ts:121. `execute.ts:241-243` reads it as `coalesce(lines_loaded_by, created_at)::text`, and `execute.ts:381` passes that text to the same `runPlans`. So the creation check filters on the time cut to the millisecond and the job filters on the full time. That mismatch is shown in the code, not inferred.
- **Timing.** `asOwner` (packages/db/src/tenant-world.ts:17-29) takes `now()` (T1) at its BEGIN. Five more round trips follow (SET LOCAL ROLE, set_config, INSERT plan, INSERT lines, COMMIT), then the app transaction's BEGIN (T2). The failure needs T2 − T1 under 1 ms with both in the same millisecond. The probe's minimum gap of 685 µs is in line with that.
- **Not #117's: shown.**
  - `git diff --stat 00fd2906 bb01093d` covers exactly 7 files: the e2e a11y files and two specs, test-matrix.md, the CI-19 fixture, and synth's matrix.ts and registry.ts.
  - `git diff 30871f72 bb01093d` is empty for apps/worker, apps/web/src/lib, packages/db and packages/pricing.

**Corrections**
1. **The cause is inferred, not shown on the failing path.** It rests on ruling out every other condition plus a reproduced building block. The real file passed 4 of 4 locally (240 seed calls), and the CI failure gives no timing at the millisecond level.
   - `gap.mjs` copies the transaction shape on a scratch table. It is not the real seed or the real `createPricingRun`.
   - `sametx.mjs` is deterministic, but only shows that a cut-off read as a `Date` truncates.
   - The proposed regression test would be the first time the real code path fails for this reason. It inserts a line in the same scope as `createPricingRun`, then checks that the line is among the run's lines. On the current code it fails unless the microseconds happen to be 000.
2. **The product impact is false refusals only.** The set the creation check sees is always a subset of what the job prices, so the "or allow" in the report is wrong. Creation can only wrongly refuse a run, in two ways:
   - "a period that holds at least one service line", when every line in the period was just loaded;
   - MAP-07 `PricingRunNothingMapped`, when the only mapped plan's lines are the ones just loaded.

   It can never wrongly allow a run, and no amount is affected, because the job prices from the microsecond cut-off.
3. **The search for the same bug turned up nothing else.** No other `query<{…: Date}>` value in apps/worker/src/price goes back into a query. `rerun.ts:356`'s `accepted_at` is only returned. Re-runs copy the cut-off in SQL (create.ts:172).

**Corrected summary**
- **Cause:** a product bug in pricing-run creation. `apps/worker/src/price/create.ts:121-123` reads the cut-off as a JS `Date`, which keeps milliseconds. `execute` uses the same instant as `::text`, which keeps microseconds. In the seed, the lines are loaded within the same millisecond as the run's `now()`, so the creation check misses them, finds zero lines and throws `PricingRunInputError('period')`. It is timing, not dates, randomness or shared state.
- **Whose:** not #117's. #117 stays tests-only and only needs this failure explained.
- **Base:** affected. The code is the same at 30871f72 and 00fd2906, and the base's green CI just did not hit the rare timing. This is the first db failure in the last 30 ci runs.
- **Runbook:** docs/runbooks/ci.md:164-165 says: "Re-run failed jobs only for an infrastructure failure (a runner lost, a download refused, a service that did not start), never for a test that failed: a test that passes on a re-run is a flaky test, and is fixed."
- **Fix at the root, in its own pull request:**
  - Read the clock as text, `SELECT now()::text AS now`, and pass the string as `loadedBy`. `RunScope.loadedBy` already accepts `Date | string`.
  - Add a db regression test in apps/worker/src/price: a line whose `created_at` equals the creating transaction's `now()` is among the run's lines, and creation's `runPlans` matches what `execute` reads.
  - A test-only change (a sleep, or a backdated `created_at`) is not acceptable, because it would hide the real mismatch.
- **Owner:** the pricing worker (apps/worker/src/price: the run creator and the MAP-07 check, audit #32 / ADR 0075), with the founder's review per CODEOWNERS `*`. Production callers are apps/web/src/lib/routes/pricing.ts:438 and apps/worker/src/monitor/plan.ts:327.

Progress is saved at /tmp/claude-0/-home-user-PhysicalTherapy/41a30c20-8b29-54c0-aac9-2d7e26acf337/scratchpad/dbflake/progress/skeptic.md.

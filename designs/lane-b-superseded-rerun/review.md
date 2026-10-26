# Adversarial design review: lane-b-superseded-rerun (combined audit #10)

- **Design reviewed:** `/home/user/ops/designs/lane-b-superseded-rerun.md` (592 lines).
- **Code read:** `/home/user/superseded-rerun`, branch `co-001/superseded-rerun` at 6ddd587. Every `file:line` below is read there.
- **Reviewer's verdict:** the design closes the defect. I found no sequence under which a line loses its pricing in effect through acceptance once the design is built, and its lock order cannot deadlock against the existing lockers. Finding 1 is still **blocking**. The rule judges how new a run is by when it *took effect*, not by when it was *priced*. Because of that it refuses valid acceptances and then tells the person something false. The fix costs nothing extra, needs no migration and makes the rule stronger, so the best-option rule calls for it. The rest is should-fix or nit.

Severity counts: 1 blocking, 6 should-fix, 5 nits. A list of what I checked and found sound follows the findings.

---

## Findings

### 1. Blocking: newness is measured by when a run took effect, so valid acceptances are refused and the refusal says something false

**Evidence.**
- Condition 2 compares `IN_EFFECT_SINCE(x) > greatest(IN_EFFECT_SINCE(o), rr.created_at)` (design §2.2, lines 107-109). Condition 1 refuses whenever any eligible run of the same period took effect after O (design §2.1, line 85).
- For an accepted re-run X, `IN_EFFECT_SINCE(x)` is `accepted_at` (`apps/worker/src/price/in-effect.ts:14`). X's pricing state (its mappings, versions, settings and location) was fixed when it was **priced**, at `completed_at`. The pricing transaction sets `completed_at = now()` and reads the state as its first statements, under the per-practice lock (`apps/worker/src/price/execute.ts:251-263,297`).
- `accepted_at` can come days after `completed_at`. The design treats the moment a person clicks Accept as the age of the pricing.

**Sequences where a valid acceptance is refused:**
- **Same period (design Sequence B, in reverse).** R1 of F is created and priced on Monday under release 5. Release 6 is published. R2 of F is created and priced on Tuesday. On Wednesday the person accepts R1, then R2.
  - Under the design, R2 is refused `superseded`, because F is no longer in effect.
  - R2 has the same cut-off as R1 and newer pricing on every input, so accepting it loses nothing and improves every line.
  - The refusal the person reads is false. The condition-1 message says "a newer run of these service dates is in effect" and "accepting this re-run would put older pricing back on its lines" (design §8.2, lines 492-493 and 518), but the run in effect is the **older** one.
- **Other periods (the normal flow after a release).** The release note lists every run in effect with a re-run button (`apps/web/src/lib/routes/releases.ts:54`).
  - The person re-runs Q (January to March) on Monday and M (February, the monitor's run) on Tuesday, and both complete.
  - On Wednesday they accept RM. Then `since(RM)` (Wednesday) is later than `RQ.created_at` (Monday), so RQ is refused.
  - RQ was priced before RM was even created, so its February lines are no older than anything RM would keep. Whichever is accepted first refuses the other, and each refusal costs a fresh re-run and a fresh review.

**Fix (no migration, and stronger, not weaker).** Judge how new X's pricing is by `x.completed_at`. Keep `since` only for the question "does X currently win over O?". Rule for X ≠ O, eligible and overlapping:

- **Same period:** `(since(x), x.id) > (since(o), o.id) AND (x.completed_at > rr.created_at OR coalesce(x.lines_loaded_by, x.created_at) > coalesce(rr.lines_loaded_by, rr.created_at))`
- **Other period:** `since(x) > since(o) AND x.completed_at > rr.created_at`

Why it is safe:
- If `x.completed_at <= rr.created_at`, X was priced before R existed. R's pricing transaction starts only after R is created and committed, so R's state is at least as new as X's on every input. The release is pinned at creation and only rises, except on a withdrawal, where going back down is the intent.
- The cut-off clause keeps line loss impossible for any legacy same-period X that holds lines R lacks.
- For a first run X, `completed_at = since`, so the rule is identical to the design's. Only accepted re-runs behave differently.
- The residual window is the same one the design already analyses (§4.3), and finding 6 shows it is closed for first runs.

What changes elsewhere:
- **Test row PRC-26.** "The first to commit is accepted and the other is refused" becomes: "the month ends on the re-run priced last, whichever acceptance commits first. An acceptance of the older one after the newer is refused."
- **Property test.** Invariant (ii) of §6.3 should be stated over the pricing stamp (`completed_at`), not the effect stamp.
- **e2e step (§6.6).** Re-running the first run a second time and then accepting the first re-run no longer makes the second re-run superseded if the first was priced before the second was created. Build the superseded state with a monitor-style first run of the month instead, which is Sequence A.
- **Wording.** The condition-1 message may then truthfully say "newer".

### 2. Should-fix: the remedy "re-run that run" is usually pointless, and the page should say so

**Evidence.**
- Once `createRerun` refuses `not_in_effect` (design §3.2), O is in effect whenever R is created. So the run X that later supersedes R took effect after R was created.
- In the common case X is a monitor or person first run (`apps/worker/src/monitor/plan.ts:91-112`). It was created after R, so it pins a release at least as new as R's, and it read the mappings after R did.
- Re-running X, as the condition-1 body tells the person to (design §8.2, line 493), then gives a diff with nothing in it.
- The codebase already knows whether a run would price differently: `rerunReasons` (`apps/worker/src/price/rerun.ts:33-43`), surfaced as `RunSummary.rerun` (`apps/web/src/lib/pricing/queries.ts:57`).

**Fix.** Build the superseded card from `inEffect.rerun`.
- **Empty:** "[Pricing run …] already prices these lines under rule release N and the mappings and contract versions in force now. There is nothing more to accept." Offer no re-run button.
- **Non-empty:** show the current wording and the re-run button.

The same applies to condition 2's "re-run the earlier run again": offer it only when O's re-run would differ (`rerunReasons` of O, compared from R's creation).

### 3. Should-fix: the refusal a person sees reads "Check the fields marked below." then "runId: …"

**Evidence.**
- `runAction` turns every `invalid` outcome into the error `'Check the fields marked below.'` plus the issues (`apps/web/src/lib/http/next.ts:161-162`).
- `ActionForm` prints each issue as `{labels[issue.field] ?? issue.field}: {issue.message}` (`apps/web/src/components/action-form.tsx:76`).
- The Accept and Re-run forms pass no `labels` (`apps/web/src/app/p/[practiceId]/pricing-runs/[runId]/page.tsx:99,138`).
- `refusal()` maps `RerunRefusedError` to the field `runId` (`apps/web/src/lib/routes/pricing.ts:227-229`).
- So the person reads an internal parameter name, and is told to check fields that do not exist. The `runId` field is a hidden input.
- The design keeps this as is ("shown as 'runId: …' by the route's existing mapping", §8.2, line 516) and writes its new messages to follow `runId:`.

There is a second problem. When a newer run takes effect after the page was loaded, the stale page keeps its Accept button. The person gets a text-only refusal with no link to the run that replaced it.

**Fix (inside the PR's files).**
- Pass `labels={{ runId: 'This re-run' }}` on the Accept forms (run page and compare page) and `labels={{ runId: 'This run' }}` on the Re-run forms. Write the five messages to read after that label, for example "This re-run: can no longer be accepted, because a newer run of these service dates is in effect; re-run that run instead."
- For `superseded` and `newer_run_pending`, have the form refresh the page under the error, so the card with its links replaces the Accept button. Either call `router.refresh()` from the form's error state, or put the refusal on the page's own state.
- Changing the generic "Check the fields marked below." in `next.ts` would touch every form, so that part is a proposal outside this PR.

### 4. Should-fix: many `file:line` citations do not match 6ddd587

The design says every `file:line` is read at 6ddd587 (line 4). Several are not:

| What | Design cites | Actual line |
| --- | --- | --- |
| `acceptRun` | `rerun.ts:167-199` | `rerun.ts:134-166` |
| Row lock in `acceptRun` | `rerun.ts:171` | `rerun.ts:138` |
| `RerunRefusedError` | `rerun.ts:79-88` | `rerun.ts:46-55` |
| `createRerun` | `rerun.ts:115-139` | `rerun.ts:82-106` |
| Module header | `rerun.ts:39-55` | `rerun.ts:6-22` |
| Doc comments | `rerun.ts:109-114,162-166` | `rerun.ts:76-81,129-133` |
| `UPDATE … accepted_at` | `rerun.ts:190-192` | `rerun.ts:157-160` |
| Advisory lock and `lockRun` | `execute.ts:418-421` | `execute.ts:253-254` |
| Completion | `execute.ts:464` | `execute.ts:297` |
| Running transaction | `execute.ts:397-413` | `execute.ts:230-246` |
| Pricing transaction | `execute.ts:414-418,469` | `execute.ts:251,299` |
| `already_finished` | `execute.ts:398-404` | `execute.ts:235-236` |
| Pricing reads | `execute.ts:425-441` | `execute.ts:259-275` |
| `runsInEffect` on the release note | `releases.ts:74` | `releases.ts:54` |

`execute.ts` is 317 lines long. `in-effect.ts`, `create.ts:143-149`, `plan.ts:91-112`, `routes/pricing.ts` and the migrations do match.

**Fix:** re-pin every citation before the build stage and the ADR amendment copy them.

### 5. Should-fix: PRC-26 "whichever way the timestamps fall" is not tested by the plan as written

**Evidence.**
- Design §6.2 runs acceptance of R1 and holds it, then starts R2's acceptance (lines 382-386). Then it repeats with R2 first.
- In both orders the waiting transaction begins **after** the held one, so its `now()`, which becomes its `accepted_at` (trigger at `20261105090000_pricing_location_and_zip_plus_four.sql:583`), is always the later one. The test never produces the case the row claims: the earlier `now()` committing second.

**Fix.**
- Open the waiting acceptance's transaction first and pin its `now()` with a `SELECT now()`. Then start and hold the other acceptance. Then let the first call `acceptRun`, and show it waiting (`WAIT_MS`) before the release.
- Assert the outcome by pricing order (finding 1). If finding 1 is not taken, assert by commit order.
- Add a deadlock assertion: both promises settle and neither rejects with 40P01.

### 6. Nit (corrects the design): the "one theoretical window" of §4.3 is already closed for first runs

**Evidence.**
- §4.3 (lines 301-305) keeps open the case "X's pricing transaction began just before R was created".
- X's status `running` commits in its own transaction (`execute.ts:230-246`) before X's pricing transaction begins (`execute.ts:251`).
- The design's own `createRerun` check, `NEWER_RUN_PENDING('r')` on the original, whose period is R's (§3.2), runs after R's `created_at`. It therefore reads X as `running` and refuses to create R.
- So the window exists only for X being an **accepted re-run**, and that case is conservative under the design's rule (it uses `accepted_at`) and negligible under finding 1's (sub-millisecond, between a pricing transaction's BEGIN and its lock statement).

**Fix:** rewrite §4.3 and the ADR amendment to say so, and add a test. With a February first run held at `running`, `createRerun` of an overlapping in-effect run is refused `newer_run_pending`.

### 7. Should-fix: `acceptRun`'s correctness depends on READ COMMITTED, but nothing enforces it

**Evidence.**
- The design relies on the statement after the lock taking a fresh snapshot (§4.1, line 273).
- The web routes never run a mutation under one snapshot (`apps/web/src/lib/http/invoke.ts:464-466`).
- But `acceptRun` is exported from `@tp/worker/pricing` (`apps/worker/src/price/public.ts`) and called directly by tests and helpers in at least eight files, for example `apps/web/e2e/unattested.ts:83`.
- The database's own lock helper refuses any other isolation for this very reason (`20261103090000_deadline_verification_and_export_attestation.sql:752-756`).

**Fix.** At the top of `acceptRun`, before the lock, read `current_setting('transaction_isolation')` and refuse anything but `read committed`, mirroring `pricing_current_read_lock()`. Add a unit-level test that a REPEATABLE READ scope is refused.

### 8. Should-fix: Q1 underestimates the stuck run, which can stay `running` forever

**Evidence.**
- Q1 (design §10.1) worries about a run stuck in `queued`.
- On a job's last attempt, `failRun` is tried, and if that fails the worker only logs `PRICING_RUN_NOT_MARKED` as a warning (`apps/worker/src/price/job.ts:38-43`). The run then stays `running` with no job left to finish it.
- Under the design, such a run blocks acceptance **and** re-runs of every overlapping period indefinitely (`NEWER_RUN_PENDING`, §2.2 lines 119-122). Its period may be a person's multi-month run.

**Fix.**
- Keep the refusal, as the design recommends.
- Widen the proposal to count first runs that have been `queued` **or** `running` for more than an hour.
- Give the operator a stated way to clear one: `failRun` with `job_failed` through the existing operator path, named in a runbook line in the PR description.
- Keep it a co-founder question: it is a small availability trade-off, with no cost and no security impact.

### 9. Nit: §1.1 and §1.4 say a line's facts never differ between runs, but two are read live

**Evidence.**
- `claimPage` drops a claim whose `superseded_by_claim_id` is set, and reads `reversed` from any reversal now loaded, whatever the cut-off (`apps/worker/src/price/lines.ts:121-129`).
- So a re-run executed after a correction or reversal arrives can lack a line its original priced, or price it as reversed.
- The design says "Only *which* lines belong to a run depends on the cut-off. A line's facts do not" (line 15) and "Common lines get identical facts in both runs" (line 55).
- The rule still holds, because these facts only move forward in time, like the state. The resulting line loss is intended (a corrected claim is priced through its correction), and the monitor plans the correction's month (`plan.ts:89`).

**Fix.** Correct the two sentences. Add "a correction or reversal arrives" to the property model's step list (§6.3), so invariant (i) is stated as "every line that some eligible run priced, and that is still priceable, keeps pricing in effect".

### 10. Nit: the test plan leaves choices open

- §6.4 says "move the fresh-run assertion … to its own practice, **or** after the rollback block". Pick one. After the rollback, `RELEASE` is back in force, so the assertion's "under release 2" changes meaning. Recommend its own practice.
- PRC-27(d) says "through the first transaction of `executePricingRun` (**or** by its status update as the job)". Pick the owner-role `UPDATE … SET status = 'running'`, which the trigger allows (`20261105090000_…sql:596-599`) and which is deterministic.
- §2.2 (line 125) puts the parity test in §6.3 (the property test). §6.2 puts it in `rerun.db.test.ts`. Keep it in `rerun.db.test.ts`, and compare against the database's `pricing_run_in_effect()` as well as `RUN_IN_EFFECT`, as `report.db.test.ts:479` does.

### 11. Nit: lock-order inversion during a rolling deploy

**Evidence.**
- Today's `acceptRun` takes the re-run's row lock (`rerun.ts:138`) and then, at its UPDATE, the `pricing_current` lock (trigger at `20261103090000_…sql:772-775`).
- The new code takes the `pricing_current` lock first, then the row.
- While old and new web tasks serve together, two acceptances of the **same** re-run, one on each version, can deadlock. Postgres aborts one with 40P01, and that person sees a server error. No data is wrong.

**Fix:** none in code. State it in the PR description ("a double submit during the deploy can fail once; resubmitting is safe").

### 12. Nit: the Lane A trigger mirror should cover re-run creation too

**Evidence.**
- §5.2 mirrors only the acceptance branch.
- The INSERT branch of `pricing_run_rules()` (`20261105090000_…sql:551-563`) still accepts a re-run of a run that is not in effect. A future path, or SQL written by hand, could create the chains the design stops creating (§1.5).

**Fix:** add "a re-run prices again only the run in effect for its period" to the Lane A proposal and its domain-model rule line. It can share the `pricing_run_in_effect()` function that already exists. The proposal also needs to carry finding 1's `completed_at` form of the predicate, so the service and the trigger agree.

---

## Checked and sound (no finding)

- **No line loss through acceptance.** R of O has O's period and cut-off, which the database enforces (`20261105090000_…sql:557-559`). If O is in effect, R holds every line O holds, apart from the live exclusions of finding 9. Runs of other periods keep their own lines (`in-effect.ts:29-33`). With condition 1 refusing whenever O is not the run in effect, under the lock, no acceptance can make the in-effect run of a period one that lacks a line its predecessor held. Finding 1's cut-off clause keeps this true.
- **The database rule matches the application rule.** `pricing_run_in_effect()` (`20261021090000_run_diffs_and_runs_in_effect.sql:48-57`) is `RUN_IN_EFFECT` word for word. `NOT ELIGIBLE_RUN(o)` OR the same-period branch is exactly `NOT RUN_IN_EFFECT(o)` (R is never eligible while unaccepted, and the strict tuple comparison excludes O). The NULL handling of `greatest` is irrelevant once O is eligible.
- **Completion during acceptance.** X's status `running` is visible before its `completed_at` exists (`execute.ts:230-251`). Its price job cannot run before its creating transaction commits (`lockRun` returns `missing` and the job retries, `job.ts:28-32`). So any X the check cannot see starts pricing after the acceptance's `now()` and ranks after R.
- **Deadlocks.**
  - Acceptance takes the advisory lock, then R's row. Completion takes the `pricing_run:` lock, then X's row, then `pricing_current` (`execute.ts:253-254,297`).
  - Execution touches R only through `lockRun`, which returns at once for a complete run.
  - Mapping corrections, version updates and withdrawals take `pricing_current` keys exclusively and lock no `pricing_run` row (`20261103090000_…sql:777-786`). Packet steps take them shared and lock no `pricing_run` row.
  - The only `FOR UPDATE` on `pricing_run` in the codebase are `rerun.ts:138` and `execute.ts:133`. The monitor (`plan.ts:178`), triage (`triage/execute.ts:381`), ledger and digest locks never meet `pricing_current`.
  - So there is no cycle, apart from the mixed-version case of finding 11.
- **Lock key.** `'pricing_current:' || $1::uuid::text` hashes the same text as the trigger's `NEW.practice_id::text` (`20261103090000_…sql:767`). The execution key (`execute.ts:253`, `$1::text`) is a different key, as intended.
- **No migration, no engine change, no #42 file.** Every file the design touches is outside `/tmp/claude-0/pr42-files.txt`: `in-effect.ts`, `rerun.ts`, `public.ts`, `routes/pricing.ts`, `pricing/queries.ts`, the two pages, `components/pricing/display.tsx`, `routes/releases.ts`, `releases/page.tsx`, `e2e/pricing.spec.ts`, the worker and route tests, and ADR 0037. The design correctly leaves alone `help.ts`, `domain-model.md`, `test-matrix.md`, `synth/src/cases/{matrix,registry}.ts` and `reconciliation-001.md`, which are #42 files. Nothing changes under `packages/pricing` or `packages/db`. `fast-check` is already a worker dependency (`apps/worker/package.json:62`), and `*.property.test.ts` falls under the unit project's `*.test.ts` include (`vitest.config.ts:73`).
- **Existing tests that move.** I checked every test that creates or accepts a re-run: `unattested-submission*`, `pricing-current*`, `monitoring-routes`, `report`, `triage`, `pricing-check`, `rerun-window`, `pricing-race`, `e2e/unattested.ts`, `e2e/pricing.spec.ts`, and the generated route tests, which build a fresh pair of worlds per route (`route-tests/define.ts:58-61`) with a March run and its unaccepted re-run (`test-support/pricing-world.ts:62-78`). Only the three the design names break: `rerun.db.test.ts:339-347`, `diff-location.db.test.ts:81` and `reruns-routes.db.test.ts:330,342`.
- **Role and audit.** Both actions stay `mapping.edit` (`routes/pricing.ts:242,277`), and the restrictive policy is unchanged (`20261019150000_reruns_and_release_withdrawal.sql:183`). The audit event is written after the handler returns (`invoke.ts:254-263`), so a refused acceptance rolls back unaudited. Every person-facing refusal in the app behaves this way; the only audited refusal is the export job's `packet_export_refused` (`apps/worker/src/packets/export.ts:112`), where no person sees an answer. The design's §6.5 assertion matches house behaviour.
- **No identifier or PHI in messages, URLs or logs.** The messages name states. Link text is the run's period and release. URLs carry the run's opaque ID only, as today. Nothing new is logged.
- **Brand.** The proposed wording passes the copy lint's terms (`tools/brand-copy/scan.ts:115-120`) and the tone of `docs/brand/BRAND.md` §1, once findings 1 to 3 correct what it claims.

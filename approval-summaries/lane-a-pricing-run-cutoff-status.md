ACTING (Lane A's account, https://claude.ai/code/session_019i9ifAfByN2caCea4jgSdu) holds this item from 2026-11-04T22:15Z, assigned by Lane A's orchestrator (session_01TrKDxeLbxVo7t7zwRXFzrg) at 21:52Z, after #117 and #116 and before the emails.

# Item: pricing-run-cutoff (`co-001/pricing-run-cutoff`), money code

Source: the db (2/4) flake on #117, root-caused in `approval-summaries/lane-a-test-flakes-5/db-flake-root-cause.md`.
createPricingRun (apps/worker/src/price/create.ts:121) reads its `now()` cut-off as a millisecond JS Date and filters
service lines by `created_at <= $cutoff`, while the price job reads the same cut-off as text, to the microsecond
(execute.ts:243). A line committed in the same millisecond is missed by the creation check only. The result is false
refusals ("a period that holds at least one service line"; MAP-07 PricingRunNothingMapped), never a wrong allow, and
no amount changes. Callers: routes/pricing.ts:438 and the worker's monitor/plan.ts:327. It flakes CI: 1 in the last 30 runs.
Scope (orchestrator): keep the cut-off at full precision end to end (compare against now() in SQL, or carry it as text,
never as a JS Date), so the creation check and the job use the same value. Sweep the class: any other place in apps/ or
packages/ that reads a timestamptz into a JS Date and compares it with database timestamps. A db regression test that
fails first: a line created at the creating transaction's instant is among the run's lines. Keep the synthetic
reproduction's rates in the PR: 0.46% before, 0% after. Test-matrix PRC-32 if it needs a row.
FREEZE: packages/pricing/src stays untouched (the engine freeze). The fix belongs in apps/worker; if it needs the engine,
stop and tell the orchestrator.
Reviews: money code, so two: payment-engine-reviewer, then correctness with a skeptic. Then the up-to-date rule, and merge.
GITLEAKS RULE: an agent that meets a gitleaks refusal rewrites the flagged text and never touches .gitleaksignore.

## Log (UTC)
- 2026-11-04T22:15:00Z: branch on origin at c7bed0f7 (#117's merge) through the hook; worktree /home/user/pricing-cutoff.
  Next: the item workflow.

- 2026-11-04T22:25:00Z: branch pushed (after the worktree's install, which the hook needs). Item workflow wf_cdca5fda-8a5
  launched (red-first db test, full-precision fix, class sweep, rates; checker; draft PR; payment-engine and correctness
  reviews as default agents with their briefs, skeptics; one fix round with the full suite and Stryker; verification);
  script archived.

- 2026-11-05T00:00:00Z: **draft #118** at 82bafc0a (base 35422a92 merged; CI green, 22 runs). Built by wf_cdca5fda-8a5 (7 agents):
  - The fix: create.ts reads the cut-off as `now()::text` in the creating transaction, so it equals the run's created_at,
    which the job reads back as text. RunScope.loadedBy is narrowed to string.
  - The sweep fixed two more sites: rerun.ts rerunReasons now compares in SQL, and location.ts runsPricedElsewhere is
    one statement. The access-log cursor (settings.ts:837) is left to #49.
  - Red first: cut-off.db.test.ts failed 10/10 and passes 10/10. Rates: Date 0.46% to 4.04% (by gap mix), text 0% every
    time.
  - PRC-32 added. The engine freeze holds; Stryker selected no shard.
  - Reviews (payment engine; correctness; default agents with their briefs) reported 8 nits, no B or S, all confirmed.
  The fix round's agent returned early with SIX UNPUSHED commits, 82bafc0a..bf33d5b9: the console status_since sweep fix,
  rerunReasons failing closed, updatedAt dropped, and docs. Its suite had died, so verification was NOT VERIFIED
  (unpushed head). Saved as WIP ref `co-001/wip-pricing-run-cutoff` (bf33d5b9). Finishing workflow wf_8f9d925a-a9f: a
  delta review with skeptics, the full suite once, push, description, verification. Subscribed to #118.

## Waiting on someone
- None.

## Next step
The item workflow.

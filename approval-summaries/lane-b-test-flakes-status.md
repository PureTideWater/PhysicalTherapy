# Lane B item: test-flakes (three flaky tests on claude/build-platform), status

- **Session:** https://claude.ai/code/session_019i9ifAWsQ6zhLLegnMqSdK (started 2026-10-27 14:35 UTC by Lane A's orchestrator, session_01TrKDxeLbxVo7t7zwRXFzrg).
- **GitHub login:** PureTideWater.
- **Branch:** `co-001/test-flakes`, cut from `claude/build-platform` at e908c21; worktree `/home/user/test-flakes`.
- **Scope:** tests only (no product code, no migration, no ADR, no test-matrix IDs). No screen changes, so the two adversarial reviews are test infrastructure and correctness.
- **Machine:** setup script OK at 14:34 UTC (playwright ok too).

## The three flakes (from #120's CI on #75)
1. `tools/test/workflows.test.ts:880`: the content-calendar notify test timed out at vitest's 5 s default inside the simulated-Dependabot nested run (ci 40519277562, job 122241596089).
2. `apps/worker/src/price/rerun-rule.property.test.ts:233-253`: unseeded coverage check; `accept:changed_meanwhile` reached 0 times in 3,000 runs (job 122247109398).
3. `packages/packets/src/verifier.test.ts:384`: `fc.pre` lets through a count equal to a pattern's procedure code, which the verifier reads as that code (seed 2019154346).

## Log
- 14:34 UTC: setup OK; worktree and install done; reproducing each.

- 15:00 to 15:03 UTC: all three reproduced (1: notify 7.4 s on one starved CPU, timed out at 5 s; 2: changed_meanwhile 0 in 1 of 40 seeds, median 4; 3: seed 2019154346 fails on 97140). Fixes in the worktree (uncommitted): workflows.test.ts 30 s file timeout; rerun property `examples:` EVERY_OUTCOME plus a `pair` step (changed_meanwhile median 45, every outcome min 28); verifier fc.pre leaves out codes. Sweep (read-only agent): two more proved by injection and fixed (verifier "any other digits" codes in read alphabets; denial-letter names "Patient"/"Name"). Design `designs/lane-b-test-flakes.md`; design review workflow wf_ba275191-0a9 running.

- 15:16 UTC: design review (wf_ba275191-0a9): approve-with-changes; its should-fix applied (the other-digits property now leaves out nothing for unread alphabets). Commit 0577b73 pushed to co-001/test-flakes; typecheck passed; 40 consecutive runs of the rerun property passed. **Draft PR #76** opened, description from the template, read back byte for byte; subscribed. Reviews workflow wf_abcef1ea-473 running (infra, correctness, payment-engine with the packets Stryker shard and gate). Check-in scheduled 20:26 UTC (trig_0141f5jbkroEggNLhAuDVTEx).

- 16:03 UTC: CI on 0577b73 all green (mutation's packets-scan, packets-rest and packets-explain shards included). Reviews (wf_abcef1ea-473):
  - **Infra:** pass-with-findings. Fixed: each spawned child is now bounded by 30 s, since a test timeout cannot stop a hung spawnSync. Fixed: db-shards.test.ts:67 and :90, and the golden worksheet, which each failed at 5 s when starved. The description wording is fixed too.
  - **Correctness:** pass-with-findings. Fixed: the count properties now assert both sides, with counts biased toward the inputs' figures; the pair step checks the invariants mid-step; the EVERY_OUTCOME comment is reworded.
  - **Payment-engine:** its agent did its work but returned no structured result. Its progress file records the precondition judgement as sound, and the packets-scan and packets-rest shards and the gate pass locally (scan 93.95%, mismatches.ts 97.30%).

  Commit b02435c5 is local, not pushed. Fix-round suite wf_8d591f13-47a is running.

- 17:10 UTC: fix-round suite (wf_8d591f13-47a) all passed on b02435c5. Results are in `lane-b-test-flakes-fix-suite.md`:
  - unit: 6,262 passed, 4 skipped;
  - db: 9,222 passed, 1 skipped;
  - e2e: 54;
  - packets mutation gate: passed, 97.75%.

  One push: b02435c5 to co-001/test-flakes. The base is unchanged at e908c21, so no merge was needed. PR body updated (findings table, checks) and read back byte for byte. Waiting on CI on b02435c, then the fresh-clone verification.

- 19:10 UTC: resumed after the account's 5-hour limit (~17:27 to 19:00 UTC); setup re-run (PostgreSQL restarted). CI on b02435c all green (24 runs; the four required checks). Fresh-clone verification (wf_3d495224-e23) passed with no blockers; its two description-wording nits are fixed in the body.
- 19:13 UTC: **MERGED.** PR #76 was marked ready; approval-of-record re-ran green; then merge_pull_request (method merge, expectedHeadSha b02435c5). Merge commit **085299b** on claude/build-platform. Housekeeping:
  - unsubscribed from #76; the 20:26 check-in cancelled;
  - the orchestrator told;
  - the main checkout fast-forwarded and installed;
  - the worktree, the local branch and the review clones removed (the remote branch stays).

  Push runs on 085299b: ci, mutation and screening-capacity all succeeded.

## Proposals (not built here)
- `tools/stryker/affected.test.ts:601` took 55.9 s of its 120 s on CI (2.1x headroom).
- `apps/worker/src/screening/threads.test.ts:100-112` asserts wall-clock bounds (took < 3000; active count after a 100 ms timer) under load; beside the "Not while #42 is open" screening files.
- Process-spawning tests on the 5 s default outside the nested run, each well under it on CI today: tools/engine-freeze/check.test.ts:572 (557 ms), tools/golden-worksheet/worksheet.test.ts (1.0 s), tools/check-action-pins/verify.test.ts, tools/test/check-releases-immutable.test.ts, tools/test/publish-content.test.ts, tools/audit-worksheet. A repository-wide rule (a helper or project setting) for process-spawning tests is the general fix.
- The Dependabot test's three nested runs share one 300 s budget while each spawn has 280 s: give each a share of a deadline so an overrun names its run (design review nit).

- **Product observations from the correctness review (out of scope, for the orchestrator to queue):**
  - (a) `packages/model-gateway/src/redact.ts`: a name part equal to another placeholder's word (Date, Birth, Member, Claim) is replaced after those placeholders are inserted. That corrupts them, e.g. `[[PATIENT_NAME]_1]`, so the model loses `[CLAIM_1]`. The fix: redact in one pass over the original text, or mask the inserted placeholders; then the property checks that the placeholders survive.
  - (b) `packages/packets/src/facts.ts`: `quoted(source.quote, dayCounts)` sends a five-digit number in a contract-window quote to codes, not dayCounts. So "10000 visits" passes when the window says 10000 days.

## Next step
Done. Item merged (085299b). Remaining: the proposals above, for the orchestrator to queue.

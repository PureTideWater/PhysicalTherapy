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

## Next step
Read the design review, apply it, commit on co-001/test-flakes, push, open the draft PR.

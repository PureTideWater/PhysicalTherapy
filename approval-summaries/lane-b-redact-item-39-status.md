# Lane B, Queues item 39: status

<!-- RESUME-BLOCK -->
- **Stage:** build, stages 1 to 4 (brief of 2026-11-13; MOD-26). Branch `co-001/redact-item-39` from
  `claude/build-platform` 4d40557f, worktree `/home/user/redact-item-39`. WIP ref `co-001/wip-redact-item-39`.
- **Commits:** stage 1 b86067c6 (tests and `matchingForTests`), stage 2 ae53f2d5 (views Map), stage 3 ea77da7c
  (skeleton, automaton, sticky driver, dense rule), stage 4 c90098c6 (lazy patterns, source rule and fallback).
- **Proven so far:** stage 1's tests seen failing on assertions on the base (below); (c), (d), (e) pass at stage 4.
- **Running:** the full `--no-cache` gate per stage (trees snapshotted in the session scratchpad; base tree A is the
  main checkout at 4d40557f), then the timing tests (a), (b) on a quiet machine, then the unit suites.
- **Next:** read each gate's counts (0 differing, refused 463,002 on both, timing rows under 3 s); run (a), (b); push
  the WIP ref; report stage 4's end to the orchestrator. Not mine: stage 5 (waits for item 40's merge), the reviews, the PR.
<!-- /RESUME-BLOCK -->

## Rulings applied (lanes/lane-b.md 21:10 UTC)

A per-call automaton with lazy patterns, nothing kept past the check (each search compiles its sticky pattern at
its first place and drops it with the call); the views Map as its own stage; our own automaton (`placesOf`, about 60
lines); the dense rule's 16 places as a constant (`DENSE_PLACES`); no identifier ceiling by count. No `WORK`
constant, no `CHECK_WORK_BUDGET` and no `work(...)` call changed. The gate's source check is a gate-only patched
copy of stage 4's tree (it builds every source and throws on any difference); the product reads no environment.

## Stage 1: the tests, each seen failing on an assertion (base 4d40557f)

`packages/model-gateway/src/redact.matching.test.ts`, `test-support/many-identifiers.ts`:

- (a) G-1, 6,300 nine-character numbers under 3 s and growth 3,150 to 6,300 under 2.2x: **failed**, growth 3.56x.
- (b) cold, the first check of 1,000 nine-character numbers in a fresh process under 1 s: **failed**, 4,095 ms.
- (c) lemma 1(a), every gap source against every kept code point (147,000+, 10 contexts): passes on the base, where
  the lemma holds; **seen failing** with a letter put into `NUMBER_JOINERS` (330 hits), then restored.
- (d) the automaton against `indexOf` (fast-check, 2,000 runs, code points of one and two units, overlapping words):
  **failed** on the stub (empty map).
- (e) lemma 4, crafted writings and every form of the synth twins on both folds: **failed** on the stub (`A/B`) and
  on the base's built RegExp.

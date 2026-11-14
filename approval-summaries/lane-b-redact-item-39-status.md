# Lane B, Queues item 39: status

<!-- RESUME-BLOCK -->
- **Stage:** stage 5 built and pushed; its oracle (item 40's generated set, full gate against 6299c550) running.
  #163 merged as 6299c550. Branch `co-001/redact-item-39`; WIP ref `co-001/wip-redact-item-39` at **c1caa730**
  (ls-remote checked).
- **Commits since 5af1c9a0:** 7f5af9bd merge of `claude/build-platform` 6299c550. Its conflict was in
  `digitsGluedToLetter`; the merge keeps item 39's `standing` guard with item 40's `[\p{L}\p{Nl}\p{No}]`. It also had
  to drop `\p{Nl}\p{No}` from the skeleton (KEPT_RUN, ALL_KEPT): item 40 made them stored-number joiners, which broke
  lemma 1(a) and sent `Member ID 7654ↀ3210` (S-4 tests). Merge gate vs 6299c550: 0 of 975,489 differ, refused 463,002
  both, PHI none, max 1,015 ms. Then 9f9323e9 (stage 5: windows R = 256, margin 64, the first reading's spans kept in
  `spansOfReading`, interior fallback to the whole re-read, a whole-letter window is the whole re-read, all charged;
  seam `matchingForTests.withWindows`). And c1caa730 (the window edge scan made linear: a letter with no white space
  was quadratic, 286 s on denial-letter's two budget rows).
- **Tests:** 5,074 model-gateway redact tests and 54 in packages/redact pass at c1caa730; typecheck and lint clean.
  S-1 (100,000 and 250,000) and C-1 (64,000 and 100,000) are sent with no identifier in clear. S-2's crafted row is
  restated: it is sent, its windows are charged, and the whole re-read's count is over budget. Item 40's stage-2 charge
  row is unchanged.
- **Not windowed:** `redactionSpans` (redactLetter's path) still calls the whole re-reads with no count, as item 40
  has it. Name this for the reviews.
- **Next, exactly:** the oracle, A = 6299c550 `packages/redact/src`, B = c1caa730's:
  `generated-set-40.mts <out>/corpus40 40`; `generated-run-40.mts A B corpus40 gen40` (from the gate directory, with
  ts-resolve); `gate/run.sh A B <out> --workers 4 --no-cache`. Need: 0 differ and PHI none, except that S-1/C-1-shaped
  rows may become sent. Then record the result here and report the stage's end. Not mine: the reviews, ADR 0054, the PR.
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

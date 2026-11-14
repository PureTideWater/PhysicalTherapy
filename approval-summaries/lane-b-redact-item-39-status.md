# Lane B, Queues item 39: status

<!-- RESUME-BLOCK -->
- **Stage:** stage 6, **PAUSED** by the orchestrator (the co-founder's word, 2026-11-14 about 01:10 UTC) part-way.
  Wait for the orchestrator's "go". No PR is open, nothing is merged, no CI was run.
- **WIP ref:** `co-001/wip-redact-item-39` at **7d93b055** (ls-remote checked): c1caa730 plus fix round 1. Nothing
  is uncommitted in the worktree. Base still 6299c550.
- **Review 1 (PHI): done.** `designs/lane-b-redact-item-39/reviews/review-1-phi.md`, its scripts in
  `reviews/review-1-scripts/`. Skeptics: `skeptic-P-1.md` (REPRODUCED), `skeptic-P-2-P-3.md` (both REPRODUCED).
  - P-1 blocker: a window edge 256 characters off, at white space, cut an identifier whose gap holds white space
    (`Member ID 7654`, U+0085, 256 spaces, `3210`): base HELD, c1caa730 sent, both halves in clear. Also claim number,
    date of birth, about a fraction, 255 hyphens and a space.
  - P-2 should: the entry's U+0001 mark is absent where the held identifier stands outside every window; the check
    after the entry holds it all the same. Recorded by a test, not changed; to be stated in ADR 0054.
  - P-3 should: `spansOfReading` kept the whole letter as written, keyed by the returned result.
  - P-4 nit (`matchingForTests.withWindows` is exported and switches module state): for the queue.
  - Found sound: lemmas 1, 2, 4, the dense rule, the automaton, `redactLetter`'s path (0 differences, counts in the report).
- **Fix round 1: built, green, pushed (7d93b055).** Tests first, each seen failing on an assertion. P-1: a window
  reaches `WINDOW_RADIUS` kept code points plus twice the longest identifier (`reachOf`) each side, counted in the
  skeleton's kept code points, then out to white space (`windowsOf`). P-3: the spans are dropped before the entry
  returns (`redactLetterForScreen`'s `finally`). The seam's `radius` is now in kept code points and is the whole reach
  (the fallback test uses radius 2). Green at 7d93b055: model-gateway `src/redact*` 4,008 tests, packages/redact 54,
  eslint and tsc on both packages. **Not yet run on 7d93b055:** the whole unit suite, item 40's generated set, the
  full gate, the two fuzzers, the budget rows, S-1/C-1 thresholds with the wider windows.
- **Review 2 (time and cost): STOPPED at the pause with no report.** Its scripts and partial outputs are in
  `reviews/review-2-partial/` (unread, no finding taken from them). It must be run again, on 7d93b055, with the
  brief's four checks, and must also measure fix round 1's `keptAt` pass and `reachOf` (both uncharged, linear).
- **Next, in order, after "go":** (1) run review 2 afresh on 7d93b055 against 6299c550, with a skeptic per blocker
  or should; (2) a delta review of fix round 1 (`git diff c1caa730 7d93b055`), PHI: attack `reachOf`'s bound (a
  form's compact longer than three times its NFKC/NFKD length, a date form, a fold that grows), the kept-count edges,
  and windows with radius counted in kept code points against the margin of 64 characters; (3) fix round 2 if
  needed, the last; (4) re-measure: item 40's generated set and the full `--no-cache` gate against 6299c550 (0
  differing, PHI none, bar S-1 and C-1), both 60,000-letter fuzzers (base-refused head-sent 0), budget rows
  unchanged; (5) ADR 0054 (cold and G-1 closed with figures, the views store named as the square's cause, cost 6
  rewritten as cured, P-1's rule and P-2 stated), the test-matrix MOD-26 rows, e2e; (6) the PR from the template
  into `claude/build-platform`, subscribe, merge on green with a merge commit and expectedHeadSha after checking
  open schema PRs; set this block to MERGED.
- **Container:** rebuilt this session with `tools/setup-container.sh co-001/wip-redact-item-39:/home/user/item39`;
  worktrees `/home/user/item39` (head), `/home/user/PhysicalTherapy` (6299c550), `/home/user/ops`.
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

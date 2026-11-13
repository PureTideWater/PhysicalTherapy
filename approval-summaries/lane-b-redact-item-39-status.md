# Lane B, Queues item 39: status

<!-- RESUME-BLOCK -->
- **Stage:** stages 1 to 4 done and gated; stage 5 waits for item 40 (PR #163) to merge into `claude/build-platform`
  (2026-11-13: #163 open draft, `claude/build-platform` at 4d40557f). Branch `co-001/redact-item-39` from
  `claude/build-platform` 4d40557f. WIP ref `co-001/wip-redact-item-39` at 5af1c9a0 (ls-remote checked).
- **Commits, all on the WIP ref:** stage 1 b86067c6 (tests, `matchingForTests`), stage 2 ae53f2d5 (views Map),
  stage 3 ea77da7c (skeleton, automaton, sticky driver, dense rule), stage 4 c90098c6 (lazy patterns, source rule and
  fallback), and 5af1c9a0 (ASCII scan by code, non-ASCII run by one sticky run; `allKept`; sourceOf by includes).
- **Final gate, 5af1c9a0 against 4d40557f, `--no-cache`, 4 workers (fresh container, 13 m 49 s):** 975,489 letters,
  same 975,489, differ 0, refused 463,002 on both, errors 0 / 0, span mismatches 0; PHI, KEEP, unplaced none; max
  letter 946 ms base, 997 ms head, of 3,000, none over. `git diff 4d40557f 5af1c9a0 -- packages/redact` touches no
  CHECK_WORK_BUDGET, WORK constant or 3 s row. Report: `designs/lane-b-redact-item-39/final-gate-5af1c9a0/`.
  Earlier: all 3,616 redact unit tests pass at 5af1c9a0, typecheck and lint clean.
- **Next, exactly:** when #163 has merged (git ls-remote and the PR's state): merge `claude/build-platform` into the
  WIP ref, keeping both items' behaviour in redact.ts; then stage 5 per design-note.md sections 5 and 6 (lines 233 to
  352): windows, R = 256, the first reading's spans kept, window-interior fallback to the whole re-read, all charged.
  Tests first, failing on an assertion, including item 40's pinned S-1 and C-1 cost rows, which become sent with no
  identifier in clear. Oracle: item 40's generated set and the full gate against item 40's merged head.
  Not this stage: the two reviews, ADR 0054, the PR.
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

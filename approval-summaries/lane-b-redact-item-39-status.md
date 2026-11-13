# Lane B, Queues item 39: status

<!-- RESUME-BLOCK -->
- **Stage:** build, stages 1 to 4 (brief of 2026-11-13; MOD-26). Branch `co-001/redact-item-39` from
  `claude/build-platform` 4d40557f. WIP ref `co-001/wip-redact-item-39` **pushed at 5af1c9a0** (ls-remote checked).
  Handed over at about 217k context on the orchestrator's word (23:00 UTC).
- **Commits, all on the WIP ref:** stage 1 b86067c6 (tests, `matchingForTests`), stage 2 ae53f2d5 (views Map),
  stage 3 ea77da7c (skeleton, automaton, sticky driver, dense rule), stage 4 c90098c6 (lazy patterns, source rule and
  fallback), and 5af1c9a0 (the skeleton scan reads ASCII by code and a non-ASCII run by one sticky run; `allKept` for
  compactFolded(x) === x; sourceOf finds line breaks with includes).
- **Why 5af1c9a0:** stage 3 put the corr-ssn-2 test (redact.test.ts, one reading against two in exec runs, bound
  90 in 100) over its bound: base 2,592/2,883 = 0.899, stage 3 0.908, stage 4 0.910. Now 2,558/2,856 = 0.896.
- **Proven:** full `--no-cache` gate, stages 1 to 4: 975,489 letters, differ 0, refused 463,002 on both, errors 0,
  span mismatches 0; max letter 1,440 / 1,282 / 1,313 / 1,486 ms against 3 s, none over. Source check (gate-only
  patched stage 4 tree, throws on any difference from V8's source): differ 0, errors 0. At 5af1c9a0: all 3,616
  redact unit tests pass (MOD-26 (a) to (e) included), typecheck and lint clean. No WORK constant, CHECK_WORK_BUDGET
  or work(...) call changed.
- **Next, exactly:** run the full gate on 5af1c9a0's `packages/redact/src` against 4d40557f's:
  `designs/lane-b-redact-ssn-phone/gate/run.sh <base src> <5af1c9a0 src> <out> --workers 4 --no-cache` (about 16 min).
  It was started in the handing-over container and its result is lost with it. Need: differ 0, refused 463,002 on
  both, no letter over 3 s. Then report stage 4's end to the orchestrator. Stages 2 to 4 are done: do not redo them.
  Not mine: stage 5 (waits for item 40's merge), the reviews, the PR.
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

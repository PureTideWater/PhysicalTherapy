# Lane B, Queues item 41 (MOD-27): status

<!-- RESUME-BLOCK
Branch co-001/redact-item-41 (from claude/build-platform 6299c550); WIP ref co-001/wip-redact-item-41.
Scope: stages 1 and 2 only (the orchestrator's brief of 2026-11-14). Reviews, ADR 0054, the PR and the merge are a later session's.
Done: stage 1 step 1, variant k in the reader's entry (packages/redact/src/redact.ts: readWithC1, storedFoundOnlyJoined,
  redactionSpansUnmended, redactLetterForScreenUnmended), tests in packages/model-gateway/src/redact.c1.test.ts, item 40's pins moved.
NEXT STEP, exactly: stage 1 step 2, mendExtracted in packages/contracts/src/evidence/page-text.ts with tests, applied in
  CitedPageView (apps/web/src/components/contracts/display.tsx) at render only; then the intake log event in
  apps/worker/src/intake/pages.ts; then the synthetic PDF fixture; then the bar's measurements (lay a "prod" tree from
  packages/redact/src and run designs/lane-b-redact-item-41/scripts/measure41.sh steps on it); then stage 2.
Ruling asked of the orchestrator (sent 2026-11-14): six letters the base refused are sent as their line-break twins (below).
-->

## Stage 1

- Variant k is inside the reader's entries (`redactionSpans`, `redactLetter`, `redactLetterForScreen`). A letter with no C1
  character takes the path it took. `holdsIdentifier`, the budget, the WORK constants and the 3 s rows are unchanged.
- A letter the breaks reading is chosen for is read twice, not three times: the breaks reading is the one returned.
- Named cost, ruling asked: the property "a letter the base refuses stays refused" (redact.leaks.test.ts, BASE_REFUSED)
  no longer holds for six letters that hold U+0085: seed 301 places 4437, 7667, 14701; seed 302 places 15982, 17696; and
  review 3's row R3-4. Each is sent exactly as its line-break twin is sent, every stored value replaced. They are pinned
  as named exceptions; every other recorded letter is still refused.
- Item 40's pins that said "refused" for a C1 inside a number, a date, a name or a phone or Social Security number now
  say "refused, or sent as the line-break twin": the reader takes these across a line break and replaces the whole.

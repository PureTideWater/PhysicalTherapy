# Merge 5: claude/build-platform 43565235 into co-001/contract-phi-check

Result: committed fe9c8da8 (parents cf61a828, 43565235) in /home/user/contract-phi-check. Nothing pushed.

## Base
- origin/claude/build-platform = 43565235 (expected). Since 83d71fd6: #82 (bce57f16, ci-pin-age, ADR 0066 Part 5,
  CI-21 to CI-23) and #83 (43565235, UX PR 4 the screening result on a phone, ADR 0078 amended, TBL-05 to TBL-08,
  e901e477 counted() groups digits). Nothing else arrived.
- git merge --no-ff --no-commit: no conflict.

## Both-sides files (6), each read against both diffs, both kept, no duplicates, order kept
- apps/web/e2e/a11y.ts: ours Locator import + selectShows/SelectShown (end of file); theirs `lists` option, doc
  comment, valuesOutOfView. Each once.
- docs/product/reconciliation-001.md: our #120 eval-brief amendment (l.263); #82's P1 record (end). Each once.
- docs/product/test-matrix.md, packages/synth/src/cases/matrix.ts: MOD-12 row + "MOD-07 to MOD-12" paragraph (ours);
  CI-21..23 + CI paragraph (#82); TBL-01..04 rewording, TBL-05..08 + paragraph (#83). Each id once per file.
- packages/synth/src/cases/registry.ts: MOD-12 (ours); CI-21..23, TBL-05..08 (theirs). Each once.
- tools/screening-capacity/watched-paths.txt: theirs table-parts.tsx, stacked-rows.tsx; ours patient-records.ts,
  patient-twins.ts. Regenerated: identical (543 lines).

## counted() and the uploader
counted() now uses toLocaleString('en-US'). Uploader uses it at uploader.tsx:155 (waitingText), :457 ("Waiting to
upload: N files"), :467 ("Upload N files"). Batches are capped at MAX_FILES_PER_BATCH = 100, so grouping never shows;
the tests' 1/2/3-file strings are unchanged and pass.

## Regenerated
- pnpm install --frozen-lockfile: up to date, pnpm-lock.yaml unchanged.
- tsx tools/screening-capacity/watched.ts --write: 543 lines, no diff.
- pnpm synth --all twice: 266 cases 0 written / 666 unchanged; 8 EMR formats 0 written / 16 unchanged; both runs.

## Tests (all under flock, Node 24)
- vitest --project unit: uploads, fields, lib/copy/words, remittances/display, packages/model-gateway/src and eval
  (redact.test, redact.property.test included), synth fixtures + fixture-guard, tools/screening-capacity:
  41 files, 880 tests passed.
- pnpm typecheck: 22 projects passed. pnpm lint:copy: 538 files, passed.
- Not run here: full pnpm test, test:db, e2e (no full suite on fe9c8da8 yet).

## Open / proposals
- Still open from the critic: cf61a828 is unreviewed; full suite (unit, db, e2e) on fe9c8da8 needed;
  redact.property.test.ts:359 names "0000-01-01" in the seed comment but the regression list at :380 does not
  include "0000-01-01" (has 0023-04-26, 0023/04/26, 0023.04.26, 0001/02/03, 2100-04-26); add it to pin the seed's
  original failure.
- Proposal (improve as you go, uploader.tsx already in this PR): tooMany() at :219 writes
  `At most ${String(limits.maxFiles)} files`; counted(limits.maxFiles, 'file') would count it one way with the
  rest of the screens (same text at 100). Not done in the merge commit.

Progress log: /tmp/claude-0/sp/phi/progress/merge5.md. Logs: /tmp/claude-0/sp/phi/scratch/m5-*.log.

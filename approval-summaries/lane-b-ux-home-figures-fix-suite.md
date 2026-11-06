# PR #93 fix round: re-read and full suite

Worktree /home/user/ux-home-figures, branch co-001/ux-home-figures. Nothing pushed (the session pushes), no rebase, no prettier, no migration, build-ops not committed.

## Commits (87691be4..HEAD)
- 30c055c9 The fix round, one commit: the money, screens and docs parts, the round-4 re-review fixes, and two changes from this re-read and suite (below). An earlier 8fd8a893 was amended to it after the suite's first e2e run; never pushed.

Final head: 30c055c9.

## Re-read against hom-review-findings.json (23 real, 3 refuted) and round 4
- engine-r1-E1: home-figures.db.test.ts writes off one line and reopens another (reason enc:v1:SYNTHETIC) inside counted()'s rolled-back transaction; asserts caseLines - atActionable = 2 and calls = atActionable; a check-first mutant fails. Holds. The stage half is a reopen, not payer approved (the database refuses that without an exported packet), and no actionable-now.test.ts text test was added; the measured test pins both conditions.
- engine-r1-E2: ledgerTotalsOver() exported in statements.ts, read by practiceLedgerTotals and recoveredPeriods; the property test compares to it; no countedStage oracle (per the verdict). Holds.
- engine-r1-E3 + ux-r1-UX-R1-01: netExpectedOf / NetExpectedState ('closed' | 'unestimated' | 'no_line' | 'live') in lib/triage/queries.ts, <NetExpected/> on the case page, each branch tested (queries.test.ts, display.test.tsx), ADR 0082 Decision 5 and Consequences. Holds; partially_resolved stays live, a negative amount stays where lines are in the figure.
- engine-r1-E4: sentence in ADR 0082 Decision 6; reconciliation-001.md (a #42 file) untouched, its line listed under Revisit after #42. Holds.
- engine-r2-R1: firstOn only from counted entries that are no reversal or adjustment and that no reversal names; oracle and property test use the same rule; fully reversed expects null; wrong-match unit case expects 2026-08-01 and 1200; doc comment and ADR Decision 8. Holds. LED-06 still reads since 2026-06-09.
- engine-r2-R2: PR body only (Overlaps and What it does not change). Done in pr93-body.md.
- engine-r3-R2: ADR Consequences sentence, the test comment, the Lane A follow-up under Revisit. Holds; assertion unchanged.
- engine-r3-R3: queries.ts OutOfFigure.stale, actionable-now.ts header and ActionableNowColumns.stale name all five causes and point to PRICING_CHECK_RESULTS. Holds.
- ux-r1-UX-R1-02 + ux-r3-02: both notes "to date", "never the patient’s share", "only <level> cash counts as recovered"; Reconciliation's note as long as before; lint:copy passes; takeback unit test. Holds.
- ux-r1-UX-R1-03: HOM-04 pins $0.00 and the exact note; $0.00 on Cases, the case page and the statement; stable over the screens part's two runs and both runs here. Holds.
- ux-r1-UX-R1-04: whitespace-nowrap span on the quarter key, asserted in headline.test. Holds (local form; widening WholeDates is a follow-up).
- ux-r1-UX-R1-05/-06/-07, ux-r2-01/-03/-05/-06, ux-r3-01/-03: each matches its verdict in the code and tests. Hold.
- ux-r2-02: held, except the verdict's test of the Cases cell was missing. Fixed here: casesLinesCell() in components/triage/display.tsx, used by cases/page.tsx, unit test ("none (all 3 written off)", "1,200 of 1,300").
- Refuted, no change: engine-r1-E5 (numbers labelled in the body anyway), engine-r3-R1, ux-r2-04.
- Round 4 (N1, N2, F2, F4): "to date, none yet" comments and "its 1 line" present. F1 (moved-on words for a reopened line) is documented in OutOfFigure.movedOn's comment, words unchanged; F3 (the case page's Payer approved fact) not changed: both carried as proposals.
- Scope: git diff 43565235 touches of pr42-files.txt only test-matrix.md, synth matrix.ts, registry.ts (HOM rows) and watched-paths.txt (one generated line), additions only. Nothing under packages/pricing, packages/ledger or packages/db; no migration; no model identifier in the diff.

## Dispositions
All 23 real findings fixed in 30c055c9 as the session's dispositions say (E4 in the ADR, R2 and the PR-body nits in pr93-body.md). Refuted: engine-r1-E5, engine-r3-R1, ux-r2-04, no change.

## Full local suite on the fix round (committed 30c055c9)
Each command under flock /tmp/laneb-heavy.lock, one at a time, Node 24.22.0, PG18 on 5433. Logs: scratchpad/suite-hom/*.log.

| Command | Result |
| --- | --- |
| pnpm install --frozen-lockfile | Pass (2 s) |
| pnpm check:fixtures | Pass. 333 files read, 3,908 searched |
| pnpm typecheck | Pass. 22 projects |
| pnpm lint | Pass. 1,689 files in 3 groups, 0 errors, 0 warnings (127 s) |
| pnpm lint:copy | Pass. 540 files |
| pnpm lint:logs | Pass. 1,090 files |
| pnpm verify-content | Pass |
| tsx tools/engine-freeze/check.ts 43565235 | Pass. Nothing let through, no problems |
| tsx tools/screening-capacity/watched.ts --write, git diff --exit-code | Pass. 542 lines, no change |
| pnpm synth --all, git diff --exit-code | Pass. 269 cases: 0 written, 661 unchanged; EMR 8 formats, 16 unchanged; tree clean after the commit |
| pnpm test | Pass. 410 files: 6,950 passed, 4 skipped (318 s) |
| pnpm test:golden | Pass. 5 files, 376 tests |
| pnpm test:oracle (TP_ORACLE_PYTHON=/opt/py312-ci/bin/python3) | Pass. pyx12 4.0.0 agrees on all 687 (676 valid, 11 malformed); edi835 agrees |
| pnpm db:migrate (fresh tp_hom_migrate, dropped after) | Applied 44, 0 before |
| pnpm test:db --shard=1/4 | Pass. 33 files, 3,185 passed, 1 skipped |
| --shard=2/4 | Pass. 33 files, 2,622 passed |
| --shard=3/4 | Pass. 33 files, 2,557 passed |
| --shard=4/4 | Pass. 32 files, 926 passed |
| test:db total | 131 files (= vitest list --project db): 9,290 passed, 1 skipped, 0 failed |
| pnpm build; build-stamp.ts --write 8fd8a893 | Pass (39 s); stamped |
| E2E_PREBUILT=1 E2E_DATABASE=tp_e2e_hom93 E2E_PORT=3193 pnpm test:e2e --shard=1/2 --workers=2 | FAIL: 31 passed, 1 failed. brand.spec.ts:446, strict mode: the Actionable tile's .font-mono now matches 2 spans (ux-r2-06 set the note's counts in mono). Real, not a flake |
| same, --shard=2/2 (8fd8a893) | Pass. 32 passed |
| Fix | brand.spec.ts checks every mono span of the tile (at least 2); eslint and web tsc pass; commit amended to 30c055c9 |
| pnpm build; build-stamp.ts --write 30c055c9 | Pass (19 s); stamped |
| e2e --shard=1/2 (30c055c9) | Pass. 32 passed (5.8 min), brand.spec and reconciliation.spec (HOM-04) included |
| e2e --shard=2/2 (30c055c9) | Pass. 32 passed (6.8 min) |
| e2e total | 64 passed, 0 failed on 30c055c9; tp_e2e_hom93 dropped |
| tsx tools/stryker/affected.ts --event pull_request --base 43565235 | No shards: money, pricing, ledger, packets not affected |
| tsx tools/stryker/gate.ts (empty reports, --expected '[]') | Pass: "No money path changed" |
| Model identifiers in git diff 87691be4..HEAD and the message | None beyond the attribution lines |

## Proposals
- The design (designs/lane-b-ux-home-figures.md, build-ops) still has the old words: F8 and HOM-02 "since its first counted entry that stands", D7 "to date, none yet" (lines 161-162, row 313), D8 and p.cases.default the Cases sentence (lines 191, 316), the Payer approved notes (line 198). For the session to edit on build-ops.
- Round 4's F1: "moved on past actionable" also counts a line a person reopened to an earlier stage; the comment says so, the words do not. A wording choice for the co-founder.
- Round 4's F3: the case page's Payer approved fact has no "to date" or patient's-share clause, unlike both tiles.
- After #42: components/help.ts "stage-five" (HOM-04 then fails on purpose; remove its pin) and reconciliation-001's Ledger semantics line.
- Lane A: line_remaining_ask_cents (ADR 0082 Revisit); the ROI PDF's raw case IDs; the audit report's per-case Net expected; WholeDates widened to quarter keys.
- pr93-body.md is updated to the fix round and not published; the session publishes it.

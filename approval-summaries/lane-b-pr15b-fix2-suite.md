# PR 15b fix round 2: affected suites (progress)

Worktree /home/user/pr15b, head 9b0bcd2dab7384bf303c26a7ed47ad8784514a05 (9b0bcd2d over 848893c0 over 3513760), base 6ddd587. Tree clean at start.
Logs: /tmp/claude-0/-home-user-PhysicalTherapy/60beef46-8756-559c-bbb4-ddf67ef623a2/scratchpad/fix2-suite-logs/<name>.log (.rc holds exit code and seconds). Method as fix-suite.md.

| # | Command | Result |
| --- | --- | --- |
| 1 | pnpm typecheck | Pass. 22 projects, 0 errors (35.9 s wall; 37 s). |
| 2 | pnpm lint | Pass. 1,493 files in 3 groups, 0 errors, 0 warnings (85 s). |
| 3 | pnpm lint:copy | Pass. 491 files read; the product copy keeps the brand's words. |
| 4 | pnpm lint:logs | Pass. 999 files scanned; every log call uses allowlisted fields. |
| 5 | pnpm test (unit + property; the script already passes --coverage) | Pass. 322 files: 5,099 passed, 3 skipped (5,102), 0 failed (183 s). Ledger coverage 671/671 statements, 501/501 branches, 166/166 functions, 605/605 lines; payment.ts 134/134, 86/86, 37/37, 110/110. (A first try as `pnpm test --coverage` refused the doubled flag before running anything.) |
| 6 | pnpm test:golden | Pass. 4 files, 188 tests (16 s). |
| 7 | pnpm verify-content | Pass. Every content set passes (content/drafts: 10 records, no problems). |
| 8 | pnpm synth --all, git status --porcelain, git diff --exit-code | Pass. 197 cases: 0 written, 536 unchanged (531 + the 5 new LED-14 claim-level files), 0 removed; EMR 8 formats: 0 written, 16 unchanged. Tree clean. |
| 9 | pnpm -s exec tsx tools/engine-freeze/check.ts 6ddd587 | Pass. No non-test file under packages/pricing/src changes; nothing let through; no problems. |
| 9b | ENGINE_FREEZE_BASE=6ddd587 vitest run --project unit tools/engine-freeze/differential.test.ts | Pass. 1 file, 4 passed (37 s). |
| 10 | tsx tools/screening-capacity/watched.ts \| diff - tools/screening-capacity/watched-paths.txt | Pass. No difference. |
| 11 | DATABASE_URL=...5433/postgres pnpm db:migrate | Pass. Nothing to apply (44 already applied). |
| 12a | pnpm test:db --shard=1/4 | Pass. 30 files: 3,095 passed, 1 skipped (158 s). |
| 12b | pnpm test:db --shard=2/4 | Pass. 30 files: 2,598 passed (153 s). |
| 12c | pnpm test:db --shard=3/4 | Pass. 30 files: 2,503 passed (217 s). |
| 12d | pnpm test:db --shard=4/4 | Pass. 29 files: 895 passed (117 s). |
| 12e | shards union vs vitest list --project db --filesOnly | Pass. 119 run, each once, equal to the 119 listed. Totals 9,091 passed, 1 skipped, 0 failed. payment-terms.db 32/32 (two probes added by the engine fixer), ledger.db 45/45, ledger-oracle 10/10, report-ledger 2/2, report.db 12/12, reconciliation-routes 12/12, chain.db 10/10. |
| 13 | pnpm build, then (apps/web) tsx scripts/build-stamp.ts --write <full sha> | Pass (45 s). Stamped 9b0bcd2dab7384bf303c26a7ed47ad8784514a05. (The script refuses the word HEAD; given the full sha.) |
| 14 | DATABASE_URL=..5433 E2E_PREBUILT=1 E2E_DATABASE=tp_e2e_pr15b_fix2 E2E_PORT=3158 PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers pnpm test:e2e ledger-patient-share.spec.ts packets.spec.ts reconciliation.spec.ts --workers=2 | Pass. 5 passed, 0 failed, 0 flaky (2.3 min): LED-14 and LED-15 journeys, packets milestone 8 and CO-05/D17, reconciliation J10/milestone 9. Server read "the build is 9b0bcd2d…'s". tp_e2e_pr15b_fix2 dropped afterwards. |
| 15-pre | reports/mutation/money-ledger (06:02, from 3513760's run) moved to fix2-suite-logs/stale-reports. tools/stryker/affected.ts --base 3513760: only money-ledger affected (money, pricing, packets not affected). |
| 15 | canary + shard money-ledger + shard gate (mut.sh) | Pass (249 s). Canary 5 of 5 (Node 24.22.0). payment.ts 100.00% (317/317: 309 killed, 8 timeout, 0 survived, 0 no coverage). ledger 98.43%; every survivor a recorded equivalent, none in payment.ts. shard rc 0, shard gate rc 0. |
| 16 | gate.ts reports/mutation --expected "money-ledger, packets-scan, packets-rest, pricing-engine, pricing-recompute, pricing-rest" | Pass, "mutation gate: passed". money 96.58% (226/234, 8 equivalents); pricing 98.67% (1,934/1,960); ledger 98.43% (1,950/1,981, 31 equivalents); packets 95.87% (2,299/2,398). The five unaffected shards' reports are 3513760's (their sources unchanged since). |
| 17 | Invariant diffs vs 6ddd587 | Pass. packages/ledger/src numstat: index.ts 1 0 (the one export line), payment.test.ts 674 0, payment.ts 434 0; no deleted line. ledger.db.test.ts byte-identical. LED-01..LED-13: no change. packages/pricing, packages/db/migrations, docs/product/domain-model.md, fixtures/golden, content/releases: no change. ledger-oracle.db.test.ts 37 0 (as at 3513760; harness and six cases unchanged). Files changed since 3513760 are all in 3513760's set except five new fixtures/synthetic/LED-14/claim-level-* files (this PR's case, written by pnpm synth), so the #42 files remain only the allowed ones. |
| 18 | Model identifiers, floats and trailers in git diff 3513760 HEAD and the two new messages | Pass. No model identifier; no parseFloat/toFixed/Number(/Math rounding added; both commits end with the two attribution lines. |
| 19 | Re-check at the end: HEAD 9b0bcd2d, tree clean | Pass. |

DONE: affected suites green on 9b0bcd2d; no failure, no fix needed, nothing open.

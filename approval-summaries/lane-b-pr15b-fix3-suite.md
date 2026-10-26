# PR 15b fix round 3: affected suites (progress)

Worktree /home/user/pr15b, head 7167a67a65a65d2b0499ff455f646b74568c2e04 (7167a67a over c6eb9232 over 9b0bcd2d), base 6ddd587. Tree clean at start.
Logs: /tmp/claude-0/-home-user-PhysicalTherapy/60beef46-8756-559c-bbb4-ddf67ef623a2/scratchpad/fix3-suite-logs/<name>.log (.rc exit code and seconds). Method as fix2-suite.md.

| # | Command | Result |
| --- | --- | --- |
| 1 | pnpm typecheck | Pass. 22 projects, 0 errors (35.6 s wall). |
| 2 | pnpm lint | Pass. 1,493 files in 3 groups, 0 errors, 0 warnings (85.1 s). |
| 3 | pnpm lint:copy | Pass. 491 files read; the product copy keeps the brand's words. |
| 4 | pnpm lint:logs | Pass. 999 files scanned; every log call uses allowlisted fields. |
| 5 | pnpm test (unit + property, coverage on) | Pass. 322 files: 5,124 passed, 3 skipped (5,127), 0 failed (188 s). Ledger coverage 695/695 statements, 532/532 branches, 176/176 functions, 624/624 lines; payment.ts 158/158, 117/117, 47/47, 129/129. |
| 6 | pnpm test:golden | Pass. 4 files, 188 tests (17 s). |
| 7 | pnpm verify-content | Pass. Every content set passes (content/drafts: 10 records, no problems). |
| 8 | pnpm synth --all, git status --porcelain, git diff --exit-code | Pass. 197 cases: 0 written, 547 unchanged (536 + the 11 new LED-14 claim-level files of 7167a67a), 0 removed; EMR 8 formats: 0 written, 16 unchanged. Tree clean. |
| 9 | pnpm -s exec tsx tools/engine-freeze/check.ts 6ddd587 | Pass. Problems: none. |
| 9b | ENGINE_FREEZE_BASE=6ddd587 vitest run --project unit tools/engine-freeze/differential.test.ts | Pass. 1 file, 4 passed (38 s). |
| 10 | tsx tools/screening-capacity/watched.ts \| diff - tools/screening-capacity/watched-paths.txt | Pass. No difference. |
| 11 | DATABASE_URL=...5433/postgres pnpm db:migrate | Pass. Nothing to apply (44 already applied). |
| 12a | pnpm test:db --shard=1/4 | Pass. 3,095 passed, 1 skipped (152 s). |
| 12b | pnpm test:db --shard=2/4 | Pass. 2,602 passed (159 s). |
| 12c | pnpm test:db --shard=3/4 | Pass. 2,503 passed (221 s). |
| 17 (early, read-only) | Invariant diffs vs 6ddd587 | Pass. packages/ledger/src numstat: index.ts 1 0, payment.test.ts 836 0, payment.ts 488 0; no deleted line. ledger.db.test.ts byte-identical. LED-01..13, packages/pricing, migrations, domain-model.md, fixtures/golden, content/releases: no change. ledger-oracle.db.test.ts 37 0 (unchanged since 3513760). Files new since 9b0bcd2's set: only 11 fixtures/synthetic/LED-14/claim-level-* (synth-written, this PR's case). |
| 18 (early) | Model identifiers, floats, trailers in git diff 9b0bcd2 HEAD and c6eb9232, 7167a67a messages | Pass. None added; both commits end with the two attribution lines. |
| 12d | pnpm test:db --shard=4/4 | Pass. 29 files: 895 passed (130 s). |
| 12e | shards union vs vitest list --project db --filesOnly | Pass. 119 run, each once, equal to the 119 listed. Totals 9,095 passed, 1 skipped, 0 failed. payment-terms.db 36/36 (four new probes in 7167a67a), ledger.db 45/45, ledger-oracle 10/10, report-ledger 2/2, report.db 12/12, reconciliation-routes 12/12, chain.db 10/10. |
| 13 | pnpm build, then (apps/web) tsx scripts/build-stamp.ts --write <full sha> | Pass (35 s + 1 s). Stamped 7167a67a65a65d2b0499ff455f646b74568c2e04. |
| 14 | DATABASE_URL=..5433 E2E_PREBUILT=1 E2E_DATABASE=tp_e2e_pr15b_fix3 E2E_PORT=3159 pnpm test:e2e ledger-patient-share.spec.ts packets.spec.ts reconciliation.spec.ts --workers=2 | Pass. 5 passed, 0 failed, 0 flaky (2.5 min): LED-14, LED-15, packets milestone 8 and CO-05/D17, reconciliation J10/milestone 9. Server read "the build is 7167a67a…'s". tp_e2e_pr15b_fix3 dropped afterwards; tp_e2e_pr15b_b4 left as found. |
| 15-pre | reports/mutation/money-ledger (10:23, an earlier run before 7167a67a's final state) moved to fix3-suite-logs/stale-reports. tools/stryker/affected.ts --base 9b0bcd2: only money-ledger affected (money, pricing, packets not affected). |
| 15 | canary + shard money-ledger + shard gate (mut.sh) | Pass (263 s). Canary 5 of 5. payment.ts 100.00% (384/384: 376 killed, 8 timeout, 0 survived, 0 no coverage). 39 survivors (8 money, 31 ledger), every one a recorded equivalent, none in payment.ts. shard rc 0, shard gate rc 0. |
| 16 | gate.ts reports/mutation --expected "money-ledger, packets-scan, packets-rest, pricing-engine, pricing-recompute, pricing-rest" | Pass, "mutation gate: passed". money 96.58% (226/234, 8 equivalents); pricing 98.67% (1,934/1,960, 26 equivalents); ledger 98.48% (2,017/2,048, 31 equivalents); packets 95.87% (2,299/2,398, 99 equivalents). The five unaffected shards' reports are from earlier runs whose sources are unchanged since (affected.ts). |
| 19 | Re-check at the end: HEAD 7167a67a, tree clean (reports/ and coverage/ ignored) | Pass. |

DONE: affected suites green on 7167a67a; no failure, no fix needed, nothing open.

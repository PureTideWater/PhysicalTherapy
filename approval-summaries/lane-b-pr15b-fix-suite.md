# PR 15b fix round: full local suite (progress)

Worktree /home/user/pr15b, head 3513760304391f356ce4285d3d172b00baa663e0, merge base 6ddd587.
Logs: /tmp/claude-0/-home-user-PhysicalTherapy/60beef46-8756-559c-bbb4-ddf67ef623a2/scratchpad/fix-suite-logs/<name>.log (.rc holds exit code and seconds)
Affected mutation shards (tools/stryker/affected.ts --base 6ddd587): all six (money-ledger, packets-scan, packets-rest, pricing-engine, pricing-recompute, pricing-rest), because stryker/shards.json changed.

| # | Command | Result |
| --- | --- | --- |
| 0 | Invariant diffs vs 6ddd587 | Pass. packages/ledger/src numstat: index.ts 1 0, payment.test.ts 552 0, payment.ts 363 0; no deleted line. ledger.db.test.ts byte-identical. LED-01..LED-13: no change. packages/pricing, packages/db/migrations, docs/product/domain-model.md, fixtures/golden, content/releases: no change. #42 files touched: only reconciliation-001.md, test-matrix.md, synth matrix.ts, registry.ts and watched-paths.txt (all allowed). ledger-oracle.db.test.ts: 37 insertions, 0 deletions, all four new cases appended inside CASES after the sixth; harness unchanged. |
| 1 | pnpm install --frozen-lockfile | Pass. 22 projects, lockfile up to date (2 s). |
| 2 | pnpm typecheck | Pass. 22 projects, 0 errors (32.5 s wall). |
| 3 | pnpm lint | Pass. 1,493 files in 3 groups, 0 errors, 0 warnings (77.8 s). |
| 4 | pnpm lint:copy | Pass. 491 files read; the product copy keeps the brand's words. |
| 5 | pnpm lint:logs | Pass. 999 files scanned; every log call uses allowlisted fields. |
| 6 | pnpm check:fixtures | Pass. 299 files read by the guard, 2,872 text files searched; all synthetic. |
| 7 | pnpm test (unit + property, --coverage) | Pass. 322 files: 5,090 passed, 3 skipped (5,093), 0 failed (169.9 s). Ledger coverage 638/638 statements, 483/483 branches, 150/150 functions, 584/584 lines; payment.ts 101/101, 68/68, 21/21, 89/89. One skip is engine-freeze/differential.test.ts (ENGINE_FREEZE_BASE unset), run next with the base. |
| 8 | ENGINE_FREEZE_BASE=6ddd587 vitest run --project unit tools/engine-freeze/differential.test.ts | Pass. 1 file, 4 passed (32.5 s). |
| 9 | pnpm -s exec tsx tools/engine-freeze/check.ts 6ddd587 | Pass. No non-test file under packages/pricing/src changes; nothing let through; no problems. |
| 10 | pnpm test:golden | Pass. 4 files, 188 tests (14.6 s). |
| 11 | pnpm synth --all, then git status --porcelain and git diff --exit-code | Pass. 197 cases: 0 written, 531 unchanged, 0 removed; EMR 8 formats: 0 written, 16 unchanged. Tree clean. |
| 12 | pnpm synth --large | Pass. PAR-29's 10,000-claim file written (git-ignored); tree clean. |
| 13 | TP_ORACLE_PYTHON=/opt/py312-ci/bin/python3 pnpm test:oracle (parser oracle) | Pass. pyx12 4.0.0 agrees with all 675 synthetic 835s (664 valid, 11 malformed rejected); edi835 agrees on every segment, amount, balance and verdict (53 s). |
| 14 | pnpm verify-content | Pass. Every content set passes (content/drafts: 10 records, no problems). |
| 15 | pnpm licenses:check | Pass. 189 production packages, allowed licenses. |
| 16 | actionlint .github/workflows/*.yml | Pass. No problems. |
| 17 | DATABASE_URL=...5433/postgres pnpm db:migrate | Pass. Applied 44 migrations (0 already applied: the cluster's postgres database was fresh). |
| 18a | pnpm test:db --shard=1/4 | Pass. 30 files: 3,095 passed, 1 skipped (165.5 s). |
| 18b | pnpm test:db --shard=2/4 | Pass. 30 files: 2,596 passed (143.5 s). |
| 18c | pnpm test:db --shard=3/4 | Pass. 30 files: 2,503 passed (204.9 s). |
| 18d | pnpm test:db --shard=4/4 | Pass. 29 files: 895 passed (110.6 s). |
| 18e | db shards union vs vitest list --project db --filesOnly | Pass. 119 files run (30+30+30+29), each once, equal to the 119 listed. Totals 9,089 passed, 1 skipped, 0 failed. ledger.db 45/45 (unchanged), ledger-oracle 10/10 (the six plus four appended), report-ledger 2/2. |
| 19 | pnpm build, then (apps/web) tsx scripts/build-stamp.ts --write HEAD | Pass (56 s). Stamped 3513760304391f356ce4285d3d172b00baa663e0. |
| 20 | Model identifiers, floats and trailers in git diff 6ddd587 HEAD and the messages | Pass. No model identifier in the diff; in messages only the attribution lines. No parseFloat/toFixed/Number(/Math rounding in added non-test source; the bigint divisions are synth's (allowed / 5n, check / 2n). Every fix-round commit ends with the two attribution lines. |
| 21a | DATABASE_URL=..5433 E2E_PREBUILT=1 E2E_DATABASE=tp_e2e_pr15b_fix E2E_PORT=3157 PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers pnpm test:e2e --shard=1/2 --workers=2 | Pass. 27 passed, 0 failed (4.8 min), LED-14 and LED-15 ledger-patient-share journeys among them. |
| 21b | same, --shard=2/2 --workers=2 | Pass. 26 passed, 0 failed (4.1 min). Both shards' server read "the build is 3513760…'s". e2e total 27 + 26 = 53 passed, 0 failed, 0 flaky. tp_e2e_pr15b_fix dropped afterwards; tp_e2e_pr15b_b4 left as found. |
| 22-pre | reports/mutation held a money-ledger report from 05:05-05:10 (an earlier fix-round run); moved to fix-suite-logs/stale-reports so the gate reads only this run's reports. |
| 22a | stryker canary + shard money-ledger + gate.ts --shard money-ledger | Pass (382 s). Canary 5 of 5 as expected (Node 24.22.0). money 95.24% stryker total (20 killed, 1 survived, 3 errors = load failures); ledger 98.39% (1,866 killed, 26 timeout, 31 survived, 0 no-cov). payment.ts 100.00% (259/259: 238 killed, 21 timeout, 0 survived). All 39 survivors (8 money, 31 ledger) are recorded equivalents, none in payment.ts; shard gate rc 0. |
| 22b | canary + shard packets-scan + shard gate | Pass (295 s). Canary 5 of 5. scan.ts 93.95% (995/1,059: 993 killed, 2 timeout, 27 survived, 37 no coverage); the 27 survivors all recorded equivalents; shard gate rc 0. |
| 22c | canary + shard packets-rest + shard gate | Pass (428 s). Canary 5 of 5. packets 97.39% stryker total (1,302 killed, 2 timeout, 33 survived, 2 no coverage, 2 errors); every file at or above its threshold (lowest verifier/index.ts 83.33%, readable.ts 93.47%); all 35 survivors and no-coverage mutants are recorded equivalents; shard gate rc 0. |
| 22d-note | (resume 09:00) the first pricing-engine attempt at 06:15 stopped during its canary (ELIFECYCLE after instrumenting, session interrupted); rerun from the start. |
| 22d | canary + shard pricing-engine + shard gate | Pass (468 s). Canary 5 of 5. engine.ts 98.71% (844/855: 844 killed, 11 survived, 0 no coverage, 0 load failures); all 11 survivors recorded equivalents; shard rc 0, shard gate rc 0. |
| 22e | canary + shard pricing-recompute + shard gate | Pass (209 s). Canary 5 of 5. recompute.ts 98.04% (649 killed, 13 survived, 0 no coverage, 1 load failure); all 13 survivors recorded equivalents; shard rc 0, shard gate rc 0. |
| 22f | canary + shard pricing-rest + shard gate | Pass (303 s). Canary 5 of 5. pricing-rest 99.55% (441 killed, 2 survived, 0 no coverage, 11 load failures); dates 100%, reasons 100%, release 97.01%, trace 100%, windows 100%; both survivors recorded equivalents; shard rc 0, shard gate rc 0. |
| 23 | pnpm -s exec tsx tools/stryker/gate.ts reports/mutation --expected "money-ledger, packets-scan, packets-rest, pricing-engine, pricing-recompute, pricing-rest" | Pass (rc 0, "mutation gate: passed"). money 96.58% (226 detected, 8 undetected, 8 recorded equivalents, 7 load failures); pricing 98.67% (1,934 / 26 / 26 / 12); ledger 98.38% (1,892 / 31 / 31 / 0); packets 95.87% (2,299 / 99 / 99 / 2). Every undetected mutant is a recorded equivalent. |
| 24 | Re-check at the end: HEAD 3513760, tree clean, invariants as in row 0 | Pass. |

DONE: full local suite green on 3513760; no failure, no fix needed, nothing open.

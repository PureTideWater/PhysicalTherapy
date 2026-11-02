# check5: merge of claude/build-platform 83d71fd6 into co-001/contract-phi-check (PR #75)

Worktree /home/user/contract-phi-check. Started from HEAD 7f77cb19 with the merge staged (MERGE_HEAD 83d71fd6, merge base 165c5993). Nothing pushed. The run was interrupted once and resumed from /tmp/claude-0/sp/phi/progress/check5.md. Every background run had already finished, and the logs below confirm each result. Logs are in /tmp/claude-0/sp/phi/logs5/.

## Commits (local only, not pushed)
- 584f5218: Merge claude/build-platform (83d71fd6: #81 SUITE-CAP-1a, #78 a refused download comes back to its page) into co-001/contract-phi-check. Its parents are 7f77cb19 and 83d71fd6.
  - The body lists each conflict and how it was resolved:
    - uploads/page.tsx: both doc sentences kept. initialKind="x12_835", reportFrom="uploads" and receiptsNotice=DownloadRefusal are set. KIND_NAMES, searchParams, DownloadRefusal and ForgetRefusal are all kept.
    - uploader.tsx: the imports are the union of both sides and the module doc is one paragraph. #75's waiting, formatProblem, choose, uploadHeld and clearHeld are kept, followed by a single guard: `useLeaveGuard(leaveAsks(batch, held.length))`.
    - uploader.test.tsx (add/add): every test from both sides is kept, plus two new leaveAsks tests.
  - It also records:
    - What was unified: one guard, built on a pure exported `leaveAsks(batch, held) = held > 0 || stillSending(batch)`. stillSending is unchanged.
    - The leave-guard decision: the page asks while any file waits, under ADR 0079 decision 4 ("holds what a reload would lose"). It is recorded in ADR 0070 Part 3.
    - The rule 6 check of the auto-merged files both sides changed: test-matrix.md, synth matrix.ts and registry.ts (CAS-41, DLR-01..04 and MOD-12..14 present, no duplicate IDs), and watched-paths.txt (regenerated with watched.ts --write, 541 lines). pnpm-lock.yaml is unchanged.
    - The review finding.
  - It ends with the Co-Authored-By and Claude-Session lines.
- 7cd60740: "docs: ADR 0079 points to leaveAsks, and ADR 0070 Part 3 back to it (the merge of #78, review finding both-sides-LC-1)". It changes 2 files (+5/-4) and ends with the same two lines.

## Review findings
- both-sides-LC-1 (nit, docs): ADR 0079 said the guard asks only while a batch file is being sent (`stillSending`), but after the merge the guard is `leaveAsks`, which also covers files waiting to upload.
  - Fixed in 7cd60740:
    - ADR 0079 decision 4 and its Not-verified/test note now point to `leaveAsks` and ADR 0070 Part 3, with #78's text kept.
    - ADR 0070 Part 3's leaveAsks bullet points back to ADR 0079.
  - This is a documentation change only, so no new test was needed. The code behind it is already covered: the two leaveAsks tests from the merge (one per direction) are in uploader.test.tsx.
- Refuted: none.

## Local suite (each step under flock /tmp/laneb-heavy.lock, node24)
| Step | Printed totals |
|---|---|
| pnpm typecheck | passed, 22 projects (exit 0) |
| pnpm lint | passed, 1,679 files in 3 groups, 0 errors, 0 warnings (apps/web 627, root 542) |
| pnpm lint:logs | 1086 files scanned, ok |
| pnpm lint:copy | 537 files read, ok |
| pnpm test (unit) | 406 files passed; 6935 passed, 4 skipped (6939) |
| pnpm test:golden | 5 files, 381 passed |
| pnpm test:oracle | pyx12 agrees with all 688 (677 valid, 11 malformed rejected); edi835 agrees on every segment |
| pnpm --filter @tp/model-gateway eval | gate passed; narratives 300/300 without a critical error |
| pnpm synth --all | 259 cases: 0 written, 659 unchanged, 0 removed; 8 EMR: 0 written, 16 unchanged; tree unchanged |
| watched.ts --write | 541 lines, tree unchanged |
| test:db shard 1/4 | 33 files passed; 3194 passed, 1 skipped (3195) |
| test:db shard 2/4 | 33 files passed; 2627 passed (2627) |
| test:db shard 3/4 | 32 files passed; 2559 passed (2559) |
| test:db shard 4/4 | 32 files passed; 929 passed (929) |
| engine-freeze check.ts origin/claude/build-platform | no non-test file under packages/pricing/src changes; problems none |
| pnpm check:fixtures | 341 files read, 3883 searched, ok |
| pnpm verify-content | every content set passes |

- **Unit log note:** the unit log prints the line "sha256sum: chrome-headless-shell-linux64/icudtl.dat: Input/output error". This is deliberate. tools/ci/browser-build.test.ts:452 installs a stub sha256sum that prints it for its unreadable-file case, and that test passes. Neither the PR nor the merge touches that file. It is not a failure.
- **test:db:** the four shards ran 130 files in total, each exactly once, which equals every tracked *.db.test.ts. Each shard had its own fresh migrated database on localhost:5433 (phi_check5_db1..4, created by this run and dropped WITH (FORCE)).

## Mutation testing
`tools/stryker/affected.ts --event pull_request --base origin/claude/build-platform` found:
- money: no; ledger: no.
- pricing: yes; packets: yes. They are pulled in through packages/db authz/scope.ts, connect.ts and runtime.ts, which #75 changes.

All six shards were run as ci.yml runs them (canary, verdict, shards.ts, then gate --shard):
| Shard | Result |
|---|---|
| packets-scan | canary 5/5; scan.ts 93.95% (995/1059); shard-run 0, gate 0 |
| packets-rest | canary 5/5; assemble 99.05%, calculation 98.24%, dates 100%, facts 95.34%, interest 97.52%, payer 98.33%, placeholders 100%, readable 93.47%, verifier/index 83.33%, verifier/mismatches 97.30%, windows 100%; gate 0 |
| packets-explain | canary 5/5; every file 100%; gate 0 |
| pricing-engine | canary 5/5; engine.ts 98.71% (844/855); gate 0 |
| pricing-recompute | recompute.ts 98.03% (649/662); gate 0 |
| pricing-rest | dates 100%, reasons 100%, release 97.01%, trace 100%, windows 100%; gate 0 |

`gate.ts reports/mutation --expected <6 shards>` printed "mutation gate: passed":
- pricing: 98.67% (1934 of 1960; all 26 undetected are recorded equivalents).
- packets: 97.75% (4310 of 4409; all 99 undetected are recorded equivalents).

## Build and e2e
- `pnpm build` exit 0. BUILD_COMMIT was stamped as ci.yml:477 does (`git rev-parse HEAD > apps/web/.next/BUILD_COMMIT`), giving 7cd60740a20dcd5b9e2f8be6f10c5aceb929ef1b.
- `E2E_PREBUILT=1 pnpm test:e2e --workers=2` was run with:
  - DATABASE_URL=postgres://postgres:test@localhost:5433/postgres
  - E2E_DATABASE=phi_check5_e2e (created by this run, then dropped)
  - E2E_PORT=3175
- Result: 63 passed (9.4m), exit 0.

## Secrets and hook
- `/root/.cache/paidwhole/gitleaks/8.24.3/gitleaks git --log-opts="871faff9..HEAD" --no-banner`: 26 commits scanned, no leaks, exit 0.
- The pre-push hook was run standalone, with a stdin ref line whose remote sha is 871faff9 and the pinned GITLEAKS. It checked 2 commits (the rest are already on origin), 0 fixture files and 10 text files, found no secret, and exited 0.
- No findings, so nothing was rewritten.

## Final state
- git status is clean. HEAD is 7cd60740 (on top of 584f5218).
- No phi_check5_* database remains on 5433.
- Nothing has been pushed.

## Open items
- Push: the branch is 2 commits ahead (the merge and the docs commit), and pushing was left to the caller under the hook. 871faff9 is still the PR head on origin.
- Proposals: none from this run.

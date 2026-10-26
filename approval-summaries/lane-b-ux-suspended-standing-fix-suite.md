# PR #56 fix round: re-read, base merge and full suite

Worktree /home/user/ux-suspended-standing, branch co-001/ux-suspended-standing. Nothing pushed, no rebase, no prettier, no migration.

## Commits (a1c41855..HEAD)
- 53805431 The fixer's commit: fix round for one account standing (SSC-01..04, UX-1..9).
- eca5f055 My commit from the re-read: a closed organization with several invoices unpaid for 30 days read "An invoice is also unpaid"; it now reads "N invoices are also unpaid, the oldest since D; they are still owed." (still no clause about runs, SSC-02). Beside a PaidWhole suspension, several held invoices now read "have also been unpaid for 30 days since their payments failed", the same words as the suspended-for-nonpayment notice (it read "are also unpaid 30 days after"). One unit test added (account-standing.test.tsx, 16 passed).
- a1410232 Merge claude/build-platform (6070e41c, PR #55 UX and brand reviewer checklist), --no-ff, no conflicts: only .claude/agents/ux-brand-reviewer.md and .github/pull_request_template.md. No matrix rows, registry or lockfile touched (LANES.md rule 6).

Final head: a1410232.

## Re-read against ss-reviews.json
- SSC-01: holding_count uses the view's exact predicate (status open/uncollectible, first_failed_at <= now() - 30 days; billing_standing in 20261029150000_billing.sql). Wording counts the other invoice(s); new db test pays the holding one and checks the refusal and the second invoice. Holds.
- SSC-02: no "reopen" left in customer strings (grep); closed planRefusal, CLOSURE_TICKET, owed clause without runs. Holds, plus eca5f055's count.
- SSC-03: past-due notice and the hold beside a suspension carry the ACH caveat; instant() prints the same format as components/format utc(). Holds.
- SSC-04: INSERT ... SELECT ... WHERE EXISTS(status <> 'closed'); subscription_claim.plan is text, so the untyped $2 resolves; re-read gives the closed message. Holds.
- UX-1..UX-9: each matches the code (combined-hold wording, footnote condition, empty-state branch order, neutral closed tone/alert false/outlined console badge, scroll-mt-20, console label, firm-aware console hold words, "reinstates" throughout incl. e2e, NextStepText + closed body without the title). Hold.
- Matrix: BIL-05/06 identical in test-matrix.md, matrix.ts and fixtures/synthetic/BIL-05,06/expected.json (synth --all writes 0). Of pr42-files.txt, only test-matrix.md and matrix.ts are touched, BIL-05/06 rows only.

## Dispositions
SSC-01, SSC-02 (completed in eca5f055), SSC-03, SSC-04, UX-1..UX-9: fixed in 53805431, verified.

## Full local suite on a1410232
Each command under flock /tmp/laneb-heavy.lock, one at a time, Node 24, PG18 on 5433. Logs: scratchpad/suite-ss/*.log.

| Command | Result |
| --- | --- |
| pnpm install --frozen-lockfile | Pass (2 s) |
| pnpm check:fixtures | Pass. 266 files read, 3,242 searched |
| pnpm typecheck | Pass. 22 projects |
| pnpm lint | Pass. 1,520 files in 3 groups, 0 errors, 0 warnings (99 s) |
| pnpm lint:copy | Pass. 496 files |
| pnpm lint:logs | Pass. 1,011 files |
| pnpm verify-content | Pass |
| tsx tools/engine-freeze/check.ts 6070e41c (merge base) | Pass. Nothing let through, no problems |
| pnpm synth --all, then git diff --exit-code | Pass. 210 cases: 0 written, 535 unchanged; EMR 8 formats, 16 unchanged; tree clean |
| pnpm test | Pass. 337 files: 5,276 passed, 3 skipped (210 s) |
| pnpm test:golden | Pass. 4 files, 221 tests |
| pnpm test:oracle (TP_ORACLE_PYTHON=/opt/py312-ci/bin/python3) | Pass. pyx12 4.0.0 agrees on all 637 (626 valid, 11 malformed); edi835 agrees |
| pnpm db:migrate (fresh tp_ss_migrate on 5433, dropped after) | Applied 44, 0 before |
| pnpm test:db --shard=1/6 | Pass. 20 files, 2,418 passed |
| --shard=2/6 | Pass. 20 files, 781 passed, 1 skipped |
| --shard=3/6 | Pass. 20 files, 2,479 passed |
| --shard=4/6 | Pass. 20 files, 1,810 passed |
| --shard=5/6 | Pass. 20 files, 1,396 passed |
| --shard=6/6 | Pass. 20 files, 193 passed |
| test:db total | 120 files (= vitest list --project db): 9,077 passed, 1 skipped, 0 failed |
| pnpm build | Pass (67 s) |
| build-stamp.ts --write a1410232 | Stamped |
| E2E_ADMIN_URL=…5433/postgres E2E_PREBUILT=1 E2E_DATABASE=tp_e2e_pr56 E2E_PORT=3156 pnpm test:e2e --shard=1/2 --workers=2 | Pass. 26 passed (5.3 min), BIL-06 included and passed |
| same, --shard=2/2 | Pass. 26 passed (4.9 min); screening.spec SCR-01..07 passed, no flake re-run needed |
| e2e total | 52 passed, 0 failed; tp_e2e_pr56 dropped |
| tsx tools/stryker/affected.ts --event pull_request --base 6070e41c | No shards: money, pricing, ledger, packets not affected |
| tsx tools/stryker/gate.ts (empty reports, --expected '[]') | Pass: "No money path changed" |
| Model identifiers in git diff 6070e41c HEAD and messages | None beyond attribution lines |

## Proposals
- Carried from the fixer: reopening a closed organization does not exist (Lane A console + migration if wanted, before any copy promises it).
- Carried from the fixer: a second held invoice older than the newest 24 has no Pay form below although the step mentions it; list every invoice the hold counts.
- Refresh the PR #56 description with the fix-round wording (holdingCount, closure ticket, ACH caveat, "reinstates").

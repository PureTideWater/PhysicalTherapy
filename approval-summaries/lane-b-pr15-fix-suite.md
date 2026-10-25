# PR 15 (#45) fix round: suite runner

The branch is `co-001/pr-15-ledger-tests`, in worktree `/home/user/pr15`. It is pushed, and the head is
**b7e15e83cf3501daaa90e8f4e0d9b9418f05ea1d**. The base is `claude/build-platform` at 9c57d2d, which has not moved.
The PR is still a draft.

The commits since 0e56e01:
- `539cd23`: the fixer's ledger tests and synth.
- `8eeef29`: the fixer's documents.
- `b7e15e8`: this run's re-read fix.

Logs are in `/tmp/claude-0/-home-user-PhysicalTherapy/187d32c5-f7cc-5438-90dc-a8051538d984/scratchpad/pr15/checks-fix/`.

## Step 1: adversarial re-read of `git diff 0e56e01..HEAD`

I re-read all ten dispositions against the code and checked each claim I could:
- ADR 0042:92-93 says "never `open` again".
- `ledger_match` has 20 columns. `matches()` reads 13, and its comment covers the other 7.
- `evidence_id` is a generated column.
- `ledSettings(proofLevel)` exists, and LED-06's `expected.json` names `deposited`.
- No outcome key is left unread, and the `expected.json` sentences agree with the synth.
- The import lines are back to the base's.

The test logic had no defect. Two small text fixes went into **b7e15e8** ("docs: ..."):
- **`packages/synth/src/cases/workflow.ts`:** the LED-12 doc comment had one 193-character line after the fixer's
  insertion, and I rewrapped it to its block's width. Only the comment changed. `synth --all` writes nothing.
- **`docs/product/test-matrix.md`:** the LED-12 and LED-13 paragraph cited "(reconciliation-001, item 15)" twice in
  two sentences. It now cites it once, after the limit, and the limit's two halves are joined by "and". No other
  word changed.

The commit's message was amended once before the push to be accurate. It ends with the two attribution lines.

## Step 2: the base

`git fetch origin claude/build-platform` shows 9c57d2d, unchanged, so there was no merge. PR #44 (`co-001/ci-mutation`) is at
7542aae and contains 9c57d2d (da4d7e9).
- `git merge-tree --write-tree HEAD 7542aae` is clean. In the merged tree, LED-12 and LED-13 come after LED-11, the CI
  rows are where they were, and `totals.test.ts` keeps both blocks.
- `HEAD 13f59b1` (PR #42) conflicts only in `consumer.db.test.ts`, as the base does.
- PR #42's `digest/job.ts` diff has no `recoup` line.
- `tools/stryker/equivalent/ledger.json` at 7542aae has 31 records. The 7 in `totals.ts` and `stages.ts` are
  boundary-equal or type-only, and none covers `periodEntries`. The fixer's claim is confirmed.

## Step 3: the full local suite on b7e15e8

Every command ran under `flock /tmp/laneb-heavy.lock`, one at a time, in the foreground. Each call had a 590 s
budget, and no wait was needed. The environment was Node 24 and PG18 on 5433.

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Pass. The lockfile is up to date. |
| `pnpm check:fixtures` | Pass. 248 files read and 2,768 searched; all synthetic. |
| `pnpm typecheck` | Pass. 21 projects; synth, worker, web, tools and model-gateway rechecked (29 s). |
| `pnpm lint` | Pass. 1,457 files in 3 groups, 0 errors, 0 warnings (100 s). |
| `pnpm lint:logs` | Pass. 983 files. |
| `pnpm verify-content` | Pass. |
| `pnpm -s exec tsx tools/engine-freeze/check.ts 9c57d2d` | Pass. Nothing changed, nothing let through, no problems. |
| `pnpm synth --all`, then `git status` and `git diff --exit-code` | Pass. 189 cases: 0 written, 472 unchanged, 0 removed. EMR: 16 unchanged. The tree is clean. |
| `pnpm synth --large` | Pass. PAR-29's 10,000-claim file was written; git ignores it. |
| `pnpm test` | Pass. 307 files: 4,664 passed and 3 skipped (197 s). The ledger has 415/415 branches, 495/495 lines, 129/129 functions and 537/537 statements. |
| `pnpm test:golden` | Pass. 4 files, 38 tests. |
| `pnpm test:oracle` (`TP_ORACLE_PYTHON=/opt/py312-ci/bin/python3`) | Pass. pyx12 4.0.0 agrees on all 637 (626 valid, 11 malformed). edi835 agrees. |
| `pnpm licenses:check` | Pass. 189 packages. |
| `actionlint .github/workflows/*.yml` | Pass. No problems. |
| `pnpm db:migrate` (`DATABASE_URL=postgres://postgres:test@localhost:5433/postgres`) | Pass. Nothing to apply (44 applied). |
| `pnpm test:db --shard=i/6`, i = 1 to 6 | Pass. 118 files: 9,049 passed, 1 skipped, 0 failed.<br>The shards ran 20, 20, 20, 20, 19 and 19 files, in 180, 80, 151, 124, 202 and 77 s.<br>The union equals `vitest list --project db`. ledger.db 45/45 and ledger-oracle 6/6: 51, the base's 42 plus 9. |
| `pnpm build`, then `tsx scripts/build-stamp.ts --write <head>` | Pass (73 s). Stamped b7e15e8. |
| `E2E_PREBUILT=1 E2E_DATABASE=tp_e2e_pr15 E2E_PORT=3155 PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers pnpm test:e2e --shard=1/2 --workers=2`, then `2/2` | Pass. 26 + 25 = **51 passed**, 0 failed (296 s + 244 s). The stamp read "the build is b7e15e8…'s". This run's own database `tp_e2e_pr15` was dropped afterwards. `tp_e2e_cimut` was left as found. |
| Scope: ledger numstat, non-test names, frozen paths, deleted lines | Pass.<br>The ledger numstat is `19 0 totals.test.ts` only. The non-test names and the frozen paths are empty.<br>The only deleted lines are the `@tp/money` import and the two header comments. |
| Model identifiers and floats in `git diff 9c57d2d HEAD` and the messages | None. The only identifiers are the attribution lines. The float hits are `traceNumber(` only. |

## Step 4: push

`git push origin co-001/pr-15-ledger-tests` pushed 0e56e01..b7e15e8. The pre-push hook checked 3 commits: the fixture
guard read 2 files and searched 11, and gitleaks found nothing. Nothing was forced, and `--no-verify` was not used.

## Step 5: the PR #45 body

I read the body first with `pull_request_read` and saved it as `pr-body-before-fix.md`. I then rewrote it with
`update_pull_request`. The new body is `pr-body-fix.md`.

It changes these sections:
- **What changes:** 9 database tests, 15 LED-12 files, and the seven LED-12 tests. It names the adjustments-alone
  check, `awaiting_response`, the P-a premise, LED-13's SQL period sums with the practice's own figures, the oracle
  comment, the property's end-dated period, and the documents.
- **Why:** the co-founder approved the row's wording as recommended.
- **What it does not change:** the ledger numstat is 19 0, with the deleted lines as now.
- **Checks:**
  - a "Fix round, on the head b7e15e8" table with every suite command and its result;
  - the fixer's failing-first mutants;
  - the 0e56e01 table kept under its own heading.
- **The rule-6 section:**
  - PR #44 is at 7542aae and merges cleanly, so the stale six-file claim is gone;
  - what to do if #44 merges first;
  - the recorded-equivalents bullet;
  - the PR #42 bullet;
  - no base merge, since the base is still 9c57d2d.
- **Reviewer findings:** an intro for all three reviews, and the ten new rows, one per finding, named
  `<reviewer>/<id>`, each "Fixed in" 539cd23 or 8eeef29 (test-integrity/N-2 "Fixed in this body"). The design-review
  rows SF-1, SF-3, N-4 and N-6 are updated where the fix round changed what they say. "Two adversarial reviews run
  next" is removed.

The required-checks markers, Freeze exception, Domain model and the founder's approval are byte-identical, as is the
ending.

**Read-back:** `gh api repos/PureTideWater/PhysicalTherapy/pulls/45 --jq .body` (a read only) is byte-identical to
`pr-body-fix.md` (`cmp`), ending exactly in:

    🤖 Generated with [Claude Code](https://claude.com/claude-code)

    https://claude.ai/code/session_012JSUcTRpwofpy5vcyY31Z4

The PR is draft true, with head b7e15e8 and base `claude/build-platform` (9c57d2d).

## Open

- **CI on b7e15e8** was still running at the time of writing.
  - Already successful: approval-of-record (one run), build, changes, db 1, 2 and 4 of 4, domain model, images, lint,
    static, unit, stryker money-ledger and stryker pricing-recompute.
  - Still running: db 3/4, e2e 1/2 and 2/2, capacity, a second approval-of-record, and stryker pricing-engine,
    pricing-rest, packets-scan and packets-rest.
- **LANES rule 6:** whichever of #44 and #45 merges second does the merge; nothing is needed while the base is
  9c57d2d.
- **For PR 15b:**
  - LED-06's WO test has the same weak `not.toBe('resolved')` at `ledger.db.test.ts:221`. It is unchanged here,
    because LED-01 to LED-11 must stay unchanged.
  - The "proof capped at the standing approval" mutant is caught only by P-a's premise assertion.
  - A line holding two approvals is still open (N-5).

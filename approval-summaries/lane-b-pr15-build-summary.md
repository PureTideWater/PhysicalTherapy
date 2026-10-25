# PR 15 build summary (wf_c2a31a50-55d, 2026-10-25)

## Builder: draft PR #45 head 0e56e011099f603b9ea0f52c5a6b7bc704dd6c8f

PR 15 (Lane B, ledger tests LED-12 and LED-13) is built, pushed and open as draft PR #45
(https://github.com/PureTideWater/PhysicalTherapy/pull/45). It goes from co-001/pr-15-ledger-tests into
claude/build-platform at 9c57d2d.

The branch has two commits:
- 9437754: the ledger tests, the synth case and the rows.
- 0e56e01: reconciliation-001 item 15's amendment and the README.

An earlier run of this build made and pushed both commits, then was stopped by a container restart (about 15:55 UTC)
before it opened the pull request. This run re-read the commits against the design review, found no defect and made
no new commit. It reran every check on 0e56e01, redid the failing-first proof there, then opened the pull request.

Tests only: no migration, no ADR, and no non-test file under `packages/ledger/src` or `apps/worker/src/reconcile`.
Synthetic data only. The ruling is the founder's (Tyler Williams) L1 (a) of 2026-10-25, about 02:05 UTC, relayed by
the co-founder: "whatever is recommended as long as it is optimized for the business and the app". Under it, the
ledger stays as frozen and LED-12 asserts what the ledger does.

What was built:
- **Rows.** LED-12 and LED-13 after LED-11, in `test-matrix.md` and `matrix.ts`, with registry entries.
  - LED-12 reads "Moves no cash: no `posted` or `deposited` entry and the adjustment never an entry; the reversal
    `recouped` once, at once, for what the reversed claim approved". This is the design's text. It is identical, by
    string comparison, in `test-matrix.md`, `matrix.ts`, LED-12's `expected.json` and item 15's amendment.
  - LED-12 is asserted by `ledger.db.test.ts` and `ledger-oracle.db.test.ts`.
  - LED-13 keeps CO-09's words, "Negative event against net recovery". It has no file of its own (`none(9, ...)`),
    and its entry names LED-06's five test files.
- **Synth case LED-12** (`workflow.led12`), 13 generated files.
  - It starts from LED-06's recovery: 30.00 approved, posted and deposited.
  - The corrected claim is reversed three ways: offset by a PLB FB, by a PLB 72, and by an FB inside a 50.00 check
    paying another claim, with that check's deposit and its check-level posting.
  - It also has the reversal as a practice posts it (-100.00 against the corrected claim, under SYNEFTLED12003), the
    forward balance withheld from a later check (FB +100.00), and the two adjustments alone.
  - LED-13 has `expected.json` only.
- **`ledger.db.test.ts`: six LED-12 tests and one LED-13 test.** The db count is base 42 + 8, against the design's
  + 6; the two extra tests come from SF-1 and SF-2.
- **`ledger-oracle.db.test.ts`: one LED-12 case.** Its five cases and harness are unchanged, and its header comment
  names the new scenario.
- **`totals.test.ts`: one LED-13 property.** It adds 17 lines and deletes none.
- **Documents.** reconciliation-001 item 15 gains its amendment: the ruling quoted, why, the row, what landed, the
  oracle clause (N-2) and the PR 15b boundary (SF-4, N-5). `README.md`:359-360 now says LED-01 to LED-13 and six
  oracle scenarios.

- difference: Two more LED-12 files than the design: `reversal-in-check-posting-export.csv` and
  `reversal-posting-export.csv` (SF-1). There are two more tests:
  - "writes no posted entry when the practice posts the reversal" (P-d);
  - "deposits and posts nothing ... while the line can still prove, before its own payment is proved" (P-a).
  The in-check test also stages that check's posting (P-c).
- difference: The adjustments-alone test also loads `forward-balance-withheld.835` while the 30.00 approval stands
  (SF-2, P-b). `expected.json`'s `alone` sentence names both files, and it gains a `posted` sentence. Its `inCheck`
  sentence covers the posting, before the line is proved and after.
- difference: The row uses the design's text, not the pre-validated patch's "No cash change: ..." (SF-3).
- difference: Counts are restated from 9c57d2d (N-1).
  - Synth: 189 cases, 470 files unchanged.
  - pyx12: 637 835s, 630 at the base plus LED-12's 7.
  - Unit: 4,664, base + 1.
  - db (focused): 50, base + 8.

### Checks
- [pass] `git log 9c57d2d..HEAD; git status; git fetch origin claude/build-platform`: The two commits, clean tree,
  pushed at 0e56e01. The base is unchanged at 9c57d2d.
- [pass] `DATABASE_URL=postgres://postgres:test@localhost:5433/postgres pnpm exec vitest run --project db apps/worker/src/reconcile/ledger.db.test.ts apps/worker/src/reconcile/ledger-oracle.db.test.ts`:
  50 of 50 (base 42). LED-01 to LED-11 and the oracle's five cases pass unchanged.
- [pass] `pnpm test`: 307 files; 4,664 passed and 3 skipped (base 4,663). The coverage thresholds hold.
  `packages/ledger/src` branches are 415 of 415.
  - The first run failed one unrelated test: `infra/test/platform-stack.test.ts`'s CDK synthesis took 10.4 s against
    its 5 s limit while the ci-mutation workflow shared the 4 CPUs.
  - That file alone passed 12 of 12, and the full rerun passed. PR 15 changes nothing under `infra`.
- [pass] `pnpm test:golden`: 4 files, 38 tests.
- [pass] `TP_ORACLE_PYTHON=/opt/py312-ci/bin/python3 pnpm test:oracle`: pyx12 4.0.0 agrees with all 637 synthetic
  835s (626 valid, 11 malformed as expected), the 7 LED-12 835s included. `packages/edi835` agrees on every summary
  and verdict.
- [pass] `pnpm synth --all && git diff --exit-code -- fixtures/synthetic`: 189 cases; 0 written, 470 unchanged,
  0 removed. EMR: 16 unchanged. The diff is empty.
- [pass] `pnpm check:fixtures`: 246 files read and 2,766 searched; all synthetic.
- [pass] `pnpm typecheck`: 21 projects. tsc's incremental cache was warm: the sources hash-match its last full check.
- [pass] `pnpm lint`: 1,457 files, 0 errors, 0 warnings.
- [pass] `pnpm lint:logs`: 983 files.
- [pass] `pnpm verify-content`: Every content set passes.
- [pass] `git diff --numstat 9c57d2d -- packages/ledger/src`: `17 0 packages/ledger/src/totals.test.ts` only.
- [pass] `git diff --name-only 9c57d2d -- packages/ledger/src apps/worker/src/reconcile ':!**/*.test.ts'`: Empty.
- [pass] `git diff --name-only 9c57d2d -- packages/pricing/src packages/edi835/src packages/db content/releases docs/product/domain-model.md docs/product/change-order-001.md docs/adr CLAUDE.md .claude .github`:
  Empty.
- [pass] `git diff -U0 9c57d2d -- <the two worker test files> | grep '^-[^-]'`: Only the two widened import lines and
  the two header-comment lines. Every existing test and oracle case is byte-identical.
- [pass] `pnpm -s exec tsx tools/engine-freeze/check.ts 9c57d2d`: No non-test file under `packages/pricing/src`
  changes. Nothing was let through. No problems.
- [pass] Failing-first, s1 (moves cash; `postings.ts:286`, the reversal's share counted with its sign flipped), in a
  detached scratch worktree at 0e56e01:
  - LED-12's "deposits and posts nothing ... while the line can still prove" fails at `ledger.db.test.ts:467`. The
    ledger writes `deposited` 3000 (eft_row, 2026-08-04) and `posted` 3000 (posting_row, 2026-08-05) from the 50.00
    in-check check.
  - LED-09's two tests also fail: 3 failed, 47 passed.
  - Restored, with a clean status.
- [pass] Mutant m4 (a positive FB read as a take-back like a WO; `remittances.ts` providerAdjustments), in the same
  kind of scratch worktree:
  - LED-12's "never counts the adjustments themselves, even while an approval stands" fails. The reconcile tries to
    take the standing 30.00 back for `forward-balance-withheld.835`, and the database refuses it ("a recoupment is a
    PLB WO or a reversing claim of its remittance").
  - LED-06's forward-balance test also fails: 2 failed, 48 passed.
  - Restored. The worktree was removed.
- [pass] `git push -u origin co-001/pr-15-ledger-tests`: Everything up to date at 0e56e01. The hook had nothing new
  to check, because the commits went through it on the earlier run's push. Never forced, never `--no-verify`.
- [pass] `git diff 9c57d2d HEAD` searched for model identifiers and floats: None. The only model identifiers are in
  the commits' attribution lines.
- [pass] `git merge-tree --write-tree HEAD 9099fac` (PR #44's head on origin): It conflicts in the same six files as
  9c57d2d against 9099fac, all of them ci-speed against ci-mutation. PR 15's own hunks merge cleanly.
- [pass] `create_pull_request` (draft) and then `pull_request_read`: The connector rewrote the footer on create, to
  "_Generated by [Claude Code](...)_".
  - This run restored the body with `update_pull_request`.
  - Read back through the GitHub API, it is byte-identical to the local body
    (`/tmp/claude-0/-home-user-PhysicalTherapy/187d32c5-f7cc-5438-90dc-a8051538d984/scratchpad/pr15/pr-body.md`),
    footer included.
  - Draft true, head 0e56e01, base claude/build-platform.
- [running] CI on draft #45, at the time of writing:
  - Already successful: approval-of-record, changes, lint, static, mutation, domain model and build.
  - Still running: unit, db (1/4 to 4/4), e2e (1/2, 2/2), images and capacity.

The check logs are in `/tmp/claude-0/-home-user-PhysicalTherapy/187d32c5-f7cc-5438-90dc-a8051538d984/scratchpad/pr15/checks-0e56e01/`.

### Open items
- **The two adversarial reviews run next** on #45's head.
- **CI on #45 is still running.** Read every job with `get_job_logs` before the reviews close. The db shards' "Files
  this shard ran" should include the two ledger files, at base + 8.
- **The co-founder approves LED-12's row wording** under the founder's delegation of 2026-10-25. Item 15 records that
  the design's text stands as recommended unless he words it otherwise. If he rewords it, three things change, and
  the tests read no row text:
  - the two rows;
  - item 15's quote;
  - the regenerated `expected.json` (`pnpm synth --all`).
- **LANES rule 6 with PR #44 (ci-mutation):** whichever merges second resolves, keeping both.
  - Keep LED-12 and LED-13 after LED-11 and the CI rows where they are, in `test-matrix.md`, `matrix.ts` and
    `registry.ts`.
  - Keep both `it` blocks in `totals.test.ts`.
  - README and reconciliation-001 change in different hunks.
  - Then run `pnpm synth --all` with a clean diff.
  - If ci-mutation merged first and the LED-13 property kills a mutant recorded as equivalent in
    `tools/stryker/equivalent/ledger.json`, remove that record and say which test kills it. The design review found
    the `totals.ts` equivalents boundary-equal, so this is not expected.
- **SF-3's design-side edits are not made:** verifier step 4's comparison text and section 7's sentence on the
  patch. Both are in the ops repository's design document, which this build may not edit. The verifier should compare
  the four places named above with item 15's recorded text.
- **PR 15b (Lane B's next design)** inherits N-5: a line holding two approvals, of which a reversal takes back only
  its own claim's (mutant m7 survives today). 15b keeps LED-01 to LED-13 passing unchanged on share-free lines. A
  change to any LED-12 or LED-13 expected amount goes to the co-founder.
- **Not this build's:** the scratch database `tp_e2e_cimut` on localhost:5433 belongs to the ci-mutation workflow,
  and was left as found.

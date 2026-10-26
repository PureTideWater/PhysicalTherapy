**PR #51 (PR 15b, ledger amounts in payment terms, combined audit #12) at 8f35161: verification passes. Every local and CI check passes, and the code needs no change. No blocking or should-fix finding. Three minor notes, the first one about the PR description, which has not caught up with the new merge.**

**What passed:**
- **Clean start:** a fresh copy of the repository at 8f35161 installs with the exact locked dependencies (Node 24.22.0, pnpm 10.28.0).
- **The merge commit:** 8f35161's parents are 1eb8415 and 0e28f9b. Merging the two parents again (`git merge-tree`) reproduces 8f35161's tree exactly (cee50d83), so nothing was edited by hand in the merge. The PR's base is still 0e28f9b.
  - Both sides of the merge changed eight files: `packets.spec.ts`, `p/[practiceId]/page.tsx`, `reconciliation-001.md`, `test-matrix.md`, `matrix.ts`, `registry.ts`, `stryker/shards.json` and `watched-paths.txt`. The merge was clean and kept both sides, as LANES.md rule 6 requires.
- **Scope** (checked against the original base 6ddd587 and against 0e28f9b, with the same result):
  - **`packages/ledger/src`:** three files change. `payment.ts` adds 498 lines and `payment.test.ts` adds 857. `index.ts` gains one export line. Nothing is deleted.
  - **Nothing changes** in `packages/pricing`, `packages/db/migrations`, `docs/product/domain-model.md`, `fixtures/golden`, `content/releases`, `.github`, `.claude`, `CLAUDE.md`, `packages/edi835` or `tools/engine-freeze`.
  - **Byte-identical:** `apps/worker/src/reconcile/ledger.db.test.ts`, and the LED-01 to LED-13 fixtures (`expected.json` included).
  - **The ledger oracle:** the base had six cases. All six and the harness are unchanged. Four cases (LED-14 to LED-17) are appended: 37 lines added, 0 deleted.
  - **Mutation and watched-path lists:**
    - `stryker/shards.json` adds `payment.ts` to money-ledger.
    - `watched-paths.txt` matches the output of `tools/screening-capacity/watched.ts` byte for byte (531 lines). It adds `payment.ts` and `patient-share.ts`.
  - **Diff scans:**
    - No model identifier appears in the diff.
    - No float arithmetic touches money. `payment.ts` has no `Number` or `Math` at all. The only `Number(...)` is a sort comparator over a bigint difference in a db test.
    - The only patient-shaped values are the synthetic `SYNTHLAST…`/`SYNTHFIRST…` names in fixtures.
  - **Commits:** all 19 first-parent commits of the PR end with the two attribution lines.
  - **PR #42** is still open: a draft at 13f59b1, with 143 files. Of its files, this PR touches exactly five: `test-matrix.md`, `reconciliation-001.md`, `packages/synth/src/cases/matrix.ts`, `registry.ts` and `watched-paths.txt`.
  - **Outside the ledger:** the change to `packages/triage/src/headline.ts` is the one wording note the design names (§S5: "what payers have agreed to pay on the lines they corrected").
- **Fixtures:**
  - `pnpm synth --all` writes nothing: 224 cases, 616 files unchanged, plus 8 EMR formats with 16 files unchanged.
  - `pnpm check:fixtures` passes: 333 files read and 3,671 searched, all synthetic.
- **Local tests:**
  - The local PostgreSQL 18 had stopped when the container restarted. I restarted it with HANDOFF's command. `pnpm db:migrate` then had nothing to apply (44 migrations).
  - **Database tests** (`--project db`, run on `apps/worker/src/reconcile`, `apps/worker/src/report` and `reconciliation-routes.db.test.ts`): 13 files, 148 of 148 pass.
  - **Unit tests** (`--project unit`, run on `packages/ledger`, `packages/synth` and `apps/web/src/components/reconciliation`): 28 files, 434 of 434 pass.
- **Mutation testing, run here:**
  - The canary gets 5 of 5 cases right on Node 24.22.0.
  - The money-ledger shard takes 3 min 21 s.
  - The gate passes. `payment.ts` scores 100.00%: 385 of 385 mutants detected (377 killed plus 8 timeouts, as the description says), with 0 load failures.
  - All 39 survivors are recorded equivalents: 31 in the ledger, the same 31 as at PR 15, and 8 in money. None is in `payment.ts`, none is unrecorded and none is stale.
- **Records:**
  - **ADR 0067:**
    - It names the founder, Tyler Williams, who adopted the combined audit on 2026-10-20 at about 15:10 UTC, with #12's ledger exception among it.
    - It records Q1 and Q2, ruled at about 01:05 UTC under the co-founder's standing ruling of 2026-10-26, about 00:20 UTC ("Don't ask for approvals anymore just build and optimize"), as relayed by the Lane B orchestrator.
    - It has its own section, "Handed to Lane A".
  - **PRD 12:** the headline's payer approved now reads "what payers have agreed to pay".
  - **PRD 13:**
    - the `approved` row is the payer's payment increase, never the patient's share;
    - Matching 1;
    - Recoupments and reversals: a reversal takes back the payment it removes.
  - **reconciliation-001:**
    - Item 15b names who ruled and when. It also records that the stored case close was handed to Lane A.
    - The "What must not change" amendments state the oracle's six cases with four appended, and `payment.ts` as an addition.
  - **LANES.md** ("Handed to Lane A", 2026-10-26) records the same handover.
  - **Test-matrix rows:** the titles and assertions of LED-14 to LED-18 in `test-matrix.md` equal `matrix.ts` word for word. I compared them by program.
  - **The registry:** every `assertedBy` file exists and names its case IDs. That is `payment-terms.db.test.ts`, `payment.test.ts`, the oracle (LED-14 to LED-17) and `ledger-patient-share.spec.ts` (LED-14 and LED-15).
- **The fix round, re-tested here.** I put three blocking bugs back into `payment.ts` one at a time, then restored the file. Each made its own named tests fail, in both the unit and the db runs:
  - **B1, from the payment-engine review** (a line's cash is SVC03 again): 8 of 46 db tests fail. They include "measures a line's cash as its share of CLP04 … (probe E8)". The unit tests fail too, among them "takes a claim-level PR off the one line it covers (probe E8)".
  - **R1, from re-check 1** (the split weighed by charge): 4 db tests fail, among them "keeps a claim-level coinsurance's rise on the line whose allowed amount rose … (probe E11, R1)". The unit test "weighs each part by the line's allowed amount … (R1, probe E11)" fails too.
  - **RR1, from re-check 2** (`keptClaimPart` keeps nothing): 3 db tests fail, the probes N1, N2 and N6 marked RR1. Their unit counterparts fail too.
- **CI on 8f35161:** all 27 check runs finished. 26 succeeded, and `notify` was skipped by design. All four required checks are green: `all green` (12:34:53 UTC), `mutation`, `screening-capacity gate` and `approval-of-record`.
  - **Mutation:** all six stryker shards are green, and "mutation gate: passed". The gate refuses any shard without a 5 of 5 canary verdict, so money-ledger's canary passed on CI too.
  - **Database tests:** 9,169 passed and 1 skipped, over 122 files.

    | Shard | Files | Passed | Skipped |
    | --- | --- | --- | --- |
    | 1/4 | 31 | 3,142 | 1 |
    | 2/4 (with `ledger.db` and `payment-terms.db`) | 31 | 2,609 | 0 |
    | 3/4 (with `ledger-oracle` and `reconciliation-routes`) | 30 | 2,513 | 0 |
    | 4/4 | 30 | 905 | 0 |

  - **Unit tests:** 5,859 passed and 1 skipped, over 355 files.
  - **End-to-end tests:** 54 passed. Shard 1 ran 27, among them `ledger-patient-share.spec.ts` for LED-14 and LED-15. Shard 2 ran 27.
  - **Every other run is green:** capacity, lint, static, build, domain model, images and both `changes` jobs.

**Three minor notes:**
- **The PR description has not caught up with the new merge.** It is a nit: nothing in it misstates scope, a ruling or a result. Still, it says nothing of 8f35161, and it names 1eb8415 as the last merge of claude/build-platform. Add:
  - the merge of claude/build-platform 0e28f9b (PR #52, every figure explained in words, ADR 0072; PR #56, a suspended organization's standing). It was clean, and both sides were kept under rule 6. The eight files both sides changed are listed above. Merging the parents again reproduces the tree.
  - after the merge: `pnpm install` was clean, `watched-paths.txt` regenerates identically and `synth --all` writes nothing.
  - CI on 8f35161: 26 succeeded and `notify` was skipped. Database tests 9,169 passed and 1 skipped. Unit tests 5,859 passed and 1 skipped. End-to-end tests 54 passed. The mutation gate passed.
  - The checks table stops at 1eb8415 and could gain a row for 8f35161 with the figures above.
- **The LANES.md claim row for PR 15b is stale:** row 169 still says "PR #51 (draft, 0e086ed): fix round 2 running". This is an ops record, not this PR's.
- **The local database had stopped.** The container restart had stopped PostgreSQL 18 on 5433, and I restarted it by hand before the db runs. This is the machine, not the PR.

**Still to come:** update the description with the 8f35161 merge and its CI figures. Then mark the PR ready and merge on green checks, as ADR 0063 allows before the founder's own review is required. If claude/build-platform moves first, merge it in again first.

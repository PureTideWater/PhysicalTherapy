# PR 15 (#45) fix round: the ten review nits

Branch `co-001/pr-15-ledger-tests`, worktree `/home/user/pr15`. It started at 0e56e01, and its head is now
**8eeef291216593fafb8e958a71088d28c064829d**. Both commits are local and **not pushed**: only the Suite agent pushes and
edits the PR.

- `539cd23`: ledger tests and synth (`ledger.db.test.ts`, `ledger-oracle.db.test.ts`, `totals.test.ts`,
  `workflow.ts`, `fixtures/synthetic/LED-12/`).
- `8eeef29`: docs (`reconciliation-001.md` item 15, `test-matrix.md`).

Each nit was checked against the code at 0e56e01 and found accurate. All ten are fixed and none is rejected.

## How the proofs were run

Every assertion that adds behaviour was first run against a ledger mutant or a broken premise, and failed. It then
passed on the frozen ledger. Each mutant was:
- applied by hand in `/home/user/pr15` to a non-test file, or injected into the test file's `beforeAll` for the
  `case_rules` mutant;
- run under `flock /tmp/laneb-heavy.lock`;
- restored with `git checkout -- <file>` or a byte copy, with `git status` checked after each.

No mutant is in either commit. Logs are in
`/tmp/claude-0/-home-user/187d32c5-f7cc-5438-90dc-a8051538d984/scratchpad/pr15fix/`.

## Findings and what was done

Line numbers are 8eeef29's unless a log's own number is given.

| Finding | Disposition | Change | Proof |
|---|---|---|---|
| payment-engine/N-1 | fixed | LED-12's FB/72 `it.each` asserts `caseState` is `awaiting_response` (ADR 0042: "never `open` again"), in place of `not.toBe('resolved')`. The comment says so. | Mutant: `case_rules` without its `reopened_lines` branch, replaced in the scratch database. At 0e56e01 both tests **passed** under it (`ma-old.log`). With the change, both fail at the case-state line: expected `awaiting_response`, received `open` (`ma-new.log`). |
| payment-engine/N-2 | fixed | Comments on three tests. The new adjustments-alone check test is included, since it changes which test is "alone". The wording follows the measured mutants on the final file:<br>- P-a: "the only LED-12 test where a check holding the reversal meets a line that can still prove ... it alone catches the reversal's share of that check counted as the line's cash".<br>- Adjustments-alone: "with the adjustments' check test below, the only LED-12 tests where an adjustment meets an approval no reversal has taken back: this one alone catches a forward balance read as a take-back, and both catch one read as interest".<br>- New check test: "it alone catches an adjustment counted as the line's cash". | Each mutant was run on both db files, and only these tests fail among LED-12's (`mut-*.log`):<br>- s1 (reversal share sign-flipped): P-a only (LED-09's two fail too).<br>- R2a (FB parsed as `recoupment`): adjustments-alone only.<br>- m4 (FB taken back like a WO): adjustments-alone, plus LED-06's FB test.<br>- m1' (FB and 72 parsed as interest): adjustments-alone and the new check test.<br>- R1a (PLB counted as the line's cash): the new check test only. |
| payment-engine/N-3 | fixed | Comment only. The oracle's LED-12 comment now reads: "The totals at the end: ... taken back once, and neither forward balance moving a figure (that it is taken back at once, at the reversal, is ledger.db.test.ts's)". The harness and the five cases are byte-identical. | Comment only. |
| payment-engine/N-4 | fixed | The LED-13 property adds `expect(totalsOf(all, '2026-01-01', on).recoveredCents).toBe(totalsOf(base, '2026-01-01', on).recoveredCents - value)`, with a comment: its own period, one starting on its date and one ending on it. The `packages/ledger/src` numstat is `19 0`. | Mutant period-hi (`totals.ts:156`, `<= to` to `< to`) fails at the new line (`totals.test.ts:203`), counterexample `[[],1n,"2026-01-01","2026-01-02","posted"]` (`mb.log`). Restored, 16 of 16 pass. |
| payment-engine/N-5 | fixed (the fix the reviewer recommended, not the fallback) | Synth adds `adjustments-alone-eft-export.csv` (200.00, SYNEFTLED12007, 2026-08-04) and `adjustments-alone-posting-export.csv` (a check-level row of 200.00, SYNBATCH-1204, 08/05/2026). It also adds `cash.alonePaymentCents` "20000" and an `aloneCash` sentence. The new test "deposits and posts nothing for the case line from a check of the adjustments alone, while the line can still prove":<br>- `scenario('LED-12')`, then `adjustments-alone.835`;<br>- asserts the stages are the approval only (the room is the whole 30.00);<br>- stages both exports and asserts each matches the remittance at check level;<br>- entries unchanged, cash 0/0.<br>The helper `proveInCheck` becomes `proveCheck(practice, remittanceId, check)`. | Mutant R1a: shares count each PLB FB or 72 as the line's cash on its check. The new test fails, and only it: 1 failed, 50 passed. The ledger writes `deposited` 3000 (an `eft_row`, 2026-08-04) and `posted` (`md.log`). |
| payment-engine/N-6 | fixed | The test-matrix paragraph adds: "Its last clause, for what the reversed claim approved, is pinned on a line holding one approval; a line holding two is PR 15b's (reconciliation-001, item 15)." Item 15's row bullet says the same. The row text is unchanged. | Documents only. |
| test-integrity/N-1 | fixed | After its existing assertions, P-a stages `LED-12/posting-export.csv` and `eft-export.csv` and asserts:<br>- stages approved, recouped, posted, deposited, with amounts from `expected.json`;<br>- `cash()` equals posted 3000 and deposited 3000, from `expected.json`;<br>- recovered equals `expected.json`'s 0. | Broken premise (mutant): recoupments spend the line's room in `settleMatches` (`postings.ts`), that is, proof capped at the standing approval. P-a's existing assertions **pass** under it, and the new premise assertion fails: stages lack posted and deposited (`mc.log`; `ledger.db.test.ts:482` at 8eeef29, `:478` when run, before the comment lines). No other test in the two files fails: 50 of 51 pass. |
| test-integrity/N-2 | fixed (text for the PR body, below) | Two bullets for the body's rule-6 section, and a refresh of its PR #44 merge claim. | Both checked: see "For the PR body". |
| test-integrity/N-3 | fixed | LED-13 reads the proof level from LED-06's `expected.json` (`scenario.proofLevel`, "deposited") and passes `ledSettings(proofLevel)`. The `ledgerTotals(periodEntries(...))` block is replaced:<br>- Each period is summed in plain SQL (the proof level's and recouped entries, net of corrections, `effective_on BETWEEN`): earlier is `0001-01-01` to `lastBefore`, own is the recoupment's date to `9999-12-31`.<br>- `earlier` must equal `recoveredBefore` and `own` must equal `amount`.<br>- The practice's own figures, `practiceLedgerTotals(..., { from, to })`, must equal those sums.<br>The `@tp/ledger` import returns to the base line. | Each new assertion was run against a mutant:<br>- Recovered counting approvals (`totals.ts:133`): the 0e56e01 test **passed** (`me-old.log`); the new one fails at `:541` at 8eeef29 (`:539` when run), earlier 3000 against 6000 (`me-new.log`).<br>- periodEntries' lower bound exclusive: fails at `:546`, own period 0 against -1800.<br>- `practiceLedgerTotals` ignoring `to`: fails at `:545`, the earlier period restated as 1200 against 3000.<br>The fourth assertion, `own` equal to `amount`, follows from the row assertions before it (one new entry, dated after every earlier one), so nothing that passes those lines can fail it. It stands as the SQL statement of "its own period". |
| test-integrity/N-4 | fixed (comment, after a check) | `matches()` now says it reads every column that can tell two matches apart or mark a reversal. The comment gives the reasons for the rest:<br>- `ledger_match_rules` lets a match change only by its reversal, which sets `reversed_at`;<br>- `reversed_by` and `reversal_reason` pair with it by constraint, and `updated_at` moves only with it;<br>- `practice_id` is the scope's, `matched_at` and `created_at` are set at insert, and `evidence_id` is generated.<br>The live table has 20 columns and the helper reads 13. | The trigger forbids any other update (`20261023120000_recovery_ledger.sql:314-375`). So adding `updated_at` would catch nothing that `reversed_at` misses, and the comment is the exact fix. |

The co-founder's wording approval is recorded in item 15:
- The row bullet reads: "The co-founder approved this wording, as recommended, on 2026-10-25, under the founder's
  delegation of that day (his direction to take every recommended option)."
- The source is `lanes/lane-b.md` at ~17:45 UTC.
- The test-matrix paragraph says the same.

Not changed, and why:
- LED-06's WO test (`ledger.db.test.ts:221`) has the same weak `not.toBe('resolved')` case assertion.
- LED-01 to LED-11 stay byte-identical under this PR's rule, so it is left for PR 15b's design.
- Also for 15b: the premise mutant above (proof capped at the standing approval) survives every other test in the two
  files. If 15b makes that change on purpose, P-a's new premise assertion is where it will show.

## For the PR body (the suite runner)

**The rule-6 section ("Merging beside PR #44").** First refresh the PR #44 claim. PR #44 is now at
7542aae9abda004b97b04d8e93b6d2e0d079b8b9, and it has merged 9c57d2d (da4d7e9).
`git merge-tree --write-tree HEAD 7542aae` (HEAD 8eeef29) now merges with no conflict at all, so the body's six-file
statement, made against 9099fac, is stale. In the merged tree:
- LED-12 and LED-13 stand after LED-11 and the CI rows are where they were;
- `totals.test.ts` keeps both sets of `it` blocks.

Then add these two bullets:
- If ci-mutation merged first and the LED-13 property kills a mutant recorded in `tools/stryker/equivalent/ledger.json`,
  remove that record and say which test kills it. None is expected. At 7542aae the file holds 31 records. The property
  reaches 5 in `totals.ts` and 2 in `stages.ts`: boundary-equal comparisons (`<` against `<=`, `value > 0n` against
  `>= 0n`), an unread `latest.interest`, and `typeof` checks on string-only lists. No record covers `periodEntries`,
  which is what the property's new period assertion bounds.
- PR #42 (Lane A, `co-001/pr-06b-mail-streams`, 13f59b1) also edits `test-matrix.md`, `matrix.ts`, `registry.ts` and
  `reconciliation-001.md`. `git merge-tree --write-tree HEAD 13f59b1` conflicts only in
  `apps/worker/src/screening/consumer.db.test.ts`, which 9c57d2d against 13f59b1 conflicts in too. PR #42's
  `digest/job.ts` change does not touch the `recoupment` notification that LED-12 asserts. Keep both.

**Counts to restate:**
- db is 51, the base's 42 + 9: seven LED-12 tests, one LED-13 test and one oracle case. "8 more database tests"
  becomes 9.
- LED-12 has 15 generated files (was 13): 7 835s and 7 CSVs, plus `expected.json`.
- Synth: 189 cases, 472 unchanged (was 470).
- `check:fixtures`: 248 read and 2,768 searched (was 246 and 2,766).
- Unit tests unchanged: the LED-13 property gained an assertion, not a test.
- pyx12's 637 is unchanged, since no 835 was added.
- The `packages/ledger/src` numstat is `19 0` (was `17 0`).
- In the two worker test files, the only deleted lines are now the two base header-comment lines and the `@tp/money`
  import. The `@tp/ledger` import is back to the base line.

**Other body text:**
- "The row's wording": the co-founder approved it as recommended (item 15). It no longer "stands as recommended
  unless he words it otherwise".
- The "What changes" bullets should name:
  - the adjustments-alone check's deposit and posting, and its test;
  - the case at `awaiting_response`;
  - the P-a premise;
  - LED-13's SQL period sums and the practice's own period figures.
- The reviewer findings table gains the ten rows above, as `<reviewer>/<id>`, each "Fixed in 539cd23" or "8eeef29".
  Item 15 and the test matrix are 8eeef29, and everything else is 539cd23.

## Checks on 8eeef29

All were run under `flock /tmp/laneb-heavy.lock`, one at a time.

| Command | Result |
|---|---|
| `DATABASE_URL=postgres://postgres:test@localhost:5433/postgres pnpm exec vitest run --project db apps/worker/src/reconcile/ledger.db.test.ts apps/worker/src/reconcile/ledger-oracle.db.test.ts` | Pass. 51 of 51 (base 42 + 9) in 35 s. LED-01 to LED-11 and the oracle's five cases pass unchanged. |
| `pnpm exec vitest run --project unit packages/ledger packages/synth` | Pass. 25 files, 271 tests. |
| `pnpm synth --all && git diff --exit-code -- fixtures/synthetic` (after the commit) | Pass. 189 cases: 0 written, 472 unchanged, 0 removed. EMR 16 unchanged. The diff is empty. |
| `pnpm check:fixtures` | Pass. 248 read and 2,768 searched; all synthetic. |
| `git diff --numstat 9c57d2d -- packages/ledger/src` | `19 0 packages/ledger/src/totals.test.ts` only. |
| `git diff --name-only 9c57d2d -- packages/ledger/src apps/worker/src/reconcile ':!**/*.test.ts'` | Empty. |
| `git diff --name-only 9c57d2d -- packages/pricing/src packages/edi835/src packages/db content/releases docs/product/domain-model.md docs/product/change-order-001.md docs/adr CLAUDE.md .claude .github` | Empty. |
| `pnpm typecheck` | Pass. 21 projects. apps/worker, packages/ledger and packages/synth were rechecked (3.93 s, 0.49 s and 1.64 s of checking). |
| `pnpm lint` | Pass. 1,457 files, 0 errors, 0 warnings. |
| `git diff 9c57d2d` searched for model identifiers and float arithmetic | None. The only hits are `traceNumber(`. The model identifiers are in the commits' attribution lines only. |
| `git merge-tree --write-tree HEAD 7542aae` / `HEAD 13f59b1` | Clean / conflicts only in `consumer.db.test.ts`, as the base does. |

`git diff --check` flags the two new CSVs' line endings. The committed 0e56e01 LED-12 CSVs show the same, because it
is the generator's output. Every non-fixture path is clean.

Not run here: the full `pnpm test`, `pnpm test:db`, `test:golden`, `test:oracle` (no 835 changed), the e2e journeys
and the mutation workflow. CI runs them on the push.

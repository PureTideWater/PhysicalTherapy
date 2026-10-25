# PR #45 review: test and fixture integrity

Reviewer: test-and-fixture-integrity (adversarial). Head reviewed: 0e56e011099f603b9ea0f52c5a6b7bc704dd6c8f
(co-001/pr-15-ledger-tests) against claude/build-platform at 9c57d2d. Fresh clone, `pnpm install --frozen-lockfile
--prefer-offline`, every heavy run under `flock /tmp/laneb-heavy.lock`. Read-only: no commit, push or GitHub post.

## Verdict

No blocking finding and nothing to fix before merge. All four findings are nits. The fixture is generated,
synthetic and accepted by pyx12. The tests read stored rows, plain SQL sums and the reconcile's public totals and
summary. Nothing is skipped or weakened, and nothing flaked in four runs (three local, one CI). The scope is tests,
synth and documents only. CI is green on the head.

## Findings

### N-1 (nit): the "before its own payment is proved" LED-12 test never asserts its premise
- **Where:** `apps/worker/src/reconcile/ledger.db.test.ts:456-469`.
- **Issue:** the test is named "... while the line can still prove". Its comment says "The line could still post and
  deposit its 30.00 approval". Its power against s1 (a reversal's share counted with its sign flipped) depends on that
  premise, but the test never shows it. If a later change, such as 15b capping proof at the standing approval, made a
  taken-back line unable to prove, this test would keep passing while no longer separating s1 from the correct ledger.
- **Evidence:** a scratch probe in the clone (never committed, now deleted) ran this sequence: `scenario('LED-12')`,
  then `reversal-in-check.835`, then that check's EFT and posting exports, then the line's own `posting-export.csv`
  and `eft-export.csv`.
  - Stages after the in-check exports: approved 3000, recouped -3000.
  - Stages after the line's own exports: approved 3000, recouped -3000, posted 3000, deposited 3000.
  - Totals: posted 3000, deposited 3000, recovered 0.
  - So the premise holds today, but it is not asserted.
- **Fix:** after `expect(await cash(practice)).toEqual({ posted: 0n, deposited: 0n })`, stage `LED-12/posting-export.csv`
  and `LED-12/eft-export.csv`. Then assert three things:
  - `await cash(practice)` equals `{ posted: 3000n, deposited: 3000n }`, from `expected.json`;
  - `w.stages` holds approved, recouped, posted, deposited;
  - `jobTotals(practice).recoveredCents` is 0n.
  This keeps the test's power visible, and it makes any 15b change to it surface as a failure.

### N-2 (nit): the PR body's rule-6 section leaves out two interactions the design and the build summary list
- **Where:** PR #45 body, "Merging beside PR #44 (ci-mutation; LANES rule 6)".
- **Issue 1, the recorded equivalents.** Design section 11 and the build summary's open items say what happens if
  ci-mutation merges first and the LED-13 property kills a mutant recorded as equivalent in
  `tools/stryker/equivalent/ledger.json`. The body omits this, and the body is what the second merger reads.
  - I checked every record at 9099fac. There are 31; the 5 in `totals.ts` and 2 in `stages.ts` are the ones the
    property reaches. They are boundary-equal comparisons (`<` against `<=` where both sides give the same amount,
    `value > 0n` against `>= 0n`), an unread `latest.interest`, and `typeof value === 'string'` checks on string-only
    lists.
  - None of them can be killed by the property. No record covers `periodEntries`. The practical risk is nil.
- **Issue 2, PR #42.** PR #42 (Lane A, `co-001/pr-06b-mail-streams`, 13f59b1) also edits `test-matrix.md`, `matrix.ts`,
  `registry.ts` and `reconciliation-001.md`.
  - `git merge-tree --write-tree HEAD <PR #42>` conflicts only in `apps/worker/src/screening/consumer.db.test.ts`, which
    9c57d2d against PR #42 conflicts in too.
  - PR #42's `digest/job.ts` change leaves the `recoupment` notification's shape alone, which LED-12 asserts.
  - Design section 11 had a row for #42. The body dropped it.
- **Fix:** add two bullets to that section.
  - (a) "If ci-mutation merged first and the LED-13 property kills a mutant recorded in
    `tools/stryker/equivalent/ledger.json`, remove that record and say which test kills it. None is expected: the
    totals.ts and stages.ts records are boundary-equal or type-only."
  - (b) "PR #42 also edits test-matrix.md, matrix.ts, registry.ts and reconciliation-001.md. It merges cleanly with
    this branch, and it does not change the recoupment notification LED-12 asserts. Keep both."

### N-3 (nit): LED-13's period assertions are computed by the code they check
- **Where:** `apps/worker/src/reconcile/ledger.db.test.ts:494-508`.
- **Issue:** "Earlier periods are not restated" is checked with `ledgerTotals(periodEntries(...), 'deposited', byId)`.
  Those are the same two functions `practiceLedgerTotals` uses (`statements.ts:42-43`). So the db test's period check is
  `@tp/ledger` agreeing with itself on rows read back. It shows the new entry's date falls outside the earlier period,
  but it does not check the totals independently.
  - The LED-12 tests' `cash()` helper and the oracle use plain SQL sums that share no code with `@tp/ledger`.
  - The proof level `'deposited'` is also hardcoded. It matches only because `scenario()` defaults to `ledSettings()`.
- **Fix:** sum the entries with plain SQL, the way `cash()` does, with `effective_on <= lastBefore` and then
  `effective_on >= recoupment.effective_on`. Take deposited plus recouped, net of corrections. Compare those sums with
  `recoveredBefore` and `amount`. Read the proof level from `expectedOf`/`outcomeOf('LED-06')`'s scenario, or pass
  `ledSettings('deposited')` explicitly. The pure property in `totals.test.ts` stays as the `@tp/ledger` check.

### N-4 (nit): `matches()` says "every column the reconcile writes" but selects 13 of 19
- **Where:** `apps/worker/src/reconcile/ledger.db.test.ts:324-326`.
- **Issue:** the helper leaves out six columns of `ledger_match` (`20261023120000_recovery_ledger.sql`):
  - `practice_id`, `created_at` and `updated_at`;
  - `reversed_by` and `reversal_reason`, which the reconcile never writes (only `manual.ts:226` does) and which the
    `ledger_match_reversed_together` CHECK ties to `reversed_at`;
  - the generated `evidence_id`.

  The PR body gives this wording as the fix for the design review's N-6 ("whole rows overstated"), so the comment
  should be exact. An UPDATE that touched only `updated_at` would go unseen. It has no money meaning.
- **Fix:** either reword to "every column of the match's meaning (the reversal's person and reason pair with
  `reversed_at` by constraint)", or add `updated_at::text` to the select list.

## Checks run

| Check | Result |
|---|---|
| Fresh clone at 0e56e01, `pnpm install --frozen-lockfile --prefer-offline` | OK |
| `rm -rf fixtures/synthetic/LED-12 fixtures/synthetic/LED-13 && pnpm synth --all` | 14 files written, 456 unchanged; `git diff --exit-code -- fixtures` empty, so the committed bytes are exactly the generator's. A second run: 189 cases, 0 written, 470 unchanged. No hand-written 835 or CSV |
| Read all 7 LED-12 835s and 5 CSVs | SYNTHSENDER/SYNTH envelopes; SYNTHLAST/SYNTHFIRST names, SYNMBR member IDs, SYNTHETIC addresses; every CSV row carries SYNTHSENDER; CAS is only CO 45 (no patient share); BPR02 balances (0.00, 0.00, 50.00, 50.00, 200.00); no SYNEFTLED12/SYNCCNLED12 identifier outside LED-12 |
| `pnpm check:fixtures` | 246 read, 2,766 searched, all synthetic |
| `pnpm synth --large && TP_ORACLE_PYTHON=/opt/py312-ci/bin/python3 pnpm test:oracle` | pyx12 4.0.0 agrees with all 637 (626 valid, 11 malformed as expected); tracked .835 files 128 at 9c57d2d, 135 at head (+7, LED-12's) |
| Focused db run of the two ledger files, three times | 50/50 each (31-36 s); vitest list: ledger.db 37 to 43 entries (the LED-12 it.each is one entry for two tests), totals.test.ts 15 to 16 |
| LED-12 row text compared in test-matrix.md, matrix.ts, expected.json and item 15 | Identical |
| Registry: LED-12 assertedBy (the two files, both assert it); LED-13 assertedBy equal to LED-06's five, in order; completesIn 9; matrix order LED-11, LED-12, LED-13, SEC-01 | Exact |
| Every LED-12 fixture file used by a test or the oracle | Yes, all 12 data files |
| Tests read only stored rows (ledger_entry by seq, ledger_match, provider_adjustment, remittance, claim, line_status, notification), plain SQL sums, `practiceLedgerTotals`, `ReconcileSummary` | Yes; none calls recoupReversals, providerAdjustments or shares; no row text read |
| `git diff -U0 9c57d2d` on the three test files, deleted lines | Only the two imports and the two header comments; totals.test.ts 17/0 |
| Non-test files under packages/ledger/src, apps/worker/src/reconcile (test-support included); migrations; ADRs | None |
| Diff and commit messages scanned for model identifiers, floats, `.skip`/`.only`/`.todo` | Only the attribution lines |
| fast-check property: `make` negates recouped and amount is at least 1n; `ledgerTotals` has no clamp (`recovered = sums[proof] + sums.recouped`) | Deterministic for every input; not flaky |
| Rule 6 with PR #44: PR 15's two commits cherry-picked onto 9099fac | Clean, no conflict. totals.test.ts and fixtures.test.ts pass 45/45. `pnpm synth --all` writes 0 files, so LED-12's bytes are unchanged under #44's generator. The body's merge-tree claim (six files, the same as 9c57d2d against 9099fac) is reproduced |
| Rule 6 with PR #42 | merge-tree conflicts only in a file the base conflicts in too; the recoupment notification is unchanged |
| Probe of N-1's premise | The line still posts and deposits 30.00 after the take-back; recovered 0 |

## CI on 0e56e01 (read through the REST API and get_job_logs)

Every check run is completed and successful:
- all green and approval-of-record (twice);
- e2e 1/2 and 2/2;
- capacity and screening-capacity gate;
- changes, lint, static, unit and build;
- db 1/4 to 4/4;
- mutation, domain model and images.

notify was skipped.

- **db.** `ledger.db.test.ts` ran in db (2/4), 2,580 tests in 30 files, 21 s for that file. `ledger-oracle.db.test.ts`
  ran in db (3/4).
- **unit.** 307 files, 4,666 passed and 1 skipped, 4,667 in all. That is the same total as local, which has 4,664
  passed and 3 skipped; the skips depend on the environment.
- **mutation.** It did not measure anything: "No money label and no engine change: no mutation run" (the base's
  workflow, since ci-mutation is not merged). The ledger shard first runs on this change once PR #44 is in.

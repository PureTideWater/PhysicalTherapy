# PR 15 (#45): adversarial review, payment-engine lens (the ledger)

Reviewed: draft PR #45, `co-001/pr-15-ledger-tests` at 0e56e011099f603b9ea0f52c5a6b7bc704dd6c8f, against
`claude/build-platform` at 9c57d2d. Fresh clone, `pnpm install --frozen-lockfile --prefer-offline`, PG18 on
`localhost:5433`, every heavy run under `flock /tmp/laneb-heavy.lock`. Read-only: no commit, push or GitHub post. The
clone was restored after each regression (`git status` clean at 0e56e01) and removed at the end.

## Verdict

**No blocking finding and no should_fix.** Six nits, each with a fix of a line or two.

- **Real behaviour.** Every new test pins how the frozen ledger behaves.
  - Each of the three regressions the brief names fails a named LED-12 test (the table below).
  - So does each of the other three I applied.
- **Amounts.** All are integer cents (bigint, or cents strings) taken from LED-12's `expected.json`. There are no
  floats.
- **Frozen code untouched.** The ledger's frozen semantics, the recovered definition (`totals.ts`), LED-01 to LED-11
  and the oracle's five cases and harness are unchanged.
- **The row.** LED-12's restated row says what the tests assert, with one limit that is already recorded:
  - the "for what the reversed claim approved" clause is pinned only on a line holding one approval (N-6).
  - I found no better wording, so the design's text should stand.
- **The ruling** is recorded with who and when: the founder, Tyler Williams, on 2026-10-25 at about 02:05 UTC,
  relayed by the co-founder, quoted word for word from `lanes/lane-b.md:96`.

## Baseline

`vitest run --project db ledger.db.test.ts ledger-oracle.db.test.ts` at 0e56e01: **50 of 50** (base 42 + 8).

## Regressions applied by hand (each restored)

The diffs and logs are in `/tmp/claude-0/-home-user/187d32c5-f7cc-5438-90dc-a8051538d984/scratchpad/pe/`.

| # | Regression | Where | Result | Killed by |
|---|---|---|---|---|
| R1b | **A cash entry written for a PLB.** In `shares`, the PLB (FB or 72) that offsets a reversal in its check counts as the line's cash on that check, in place of the reversal's -100.00 | `postings.ts:286` | 1 failed / 49. The ledger writes `deposited` 3000 (an EFT row, 2026-08-04) and `posted` 3000 (a posting row, 2026-08-05) from the 50.00 in-check check | `ledger.db.test.ts:467`, P-a ("... while the line can still prove, before its own payment is proved"). Nothing else: the after-proof in-check test (`:441`) and the oracle pass |
| R1a | A PLB counted as the line's cash **beside** the reversal it offsets (ADR 0021's "a negative PLB adds to the payment", applied to shares) | `postings.ts:286` | 0 failed / 50 | None. It is equivalent on these fixtures: the -100.00 and +100.00 cancel to 0, which writes nothing, just as -100.00 does (N-5) |
| R2a | A forward balance read as a take-back: the parser's FB category becomes `recoupment`, which the database accepts | `packages/edi835/src/transaction.ts:96` | 1 failed / 50 | `:434`, the adjustments-alone test (recoupments 1, expected 0) only |
| R2b | **A take-back written twice.** R2a, plus `approvedRemaining` ignoring recoupments, so the withheld FB takes back again after the reversal | `transaction.ts:96`, `ledger.ts:254` | 4 failed / 50 | `:394` (the LED-12 FB test's "once": recoupments 1 after the withholding), `:434` (adjustments alone), the oracle's LED-12 case at `ledger-oracle.db.test.ts:217`, and LED-07's existing `:611` |
| R3 | **A take-back delayed to the withholding.** A reversal whose own remittance carries an FB below 0 is taken back only after a later remittance withholds an FB. The database still dates the entry by the reversal's remittance | `remittances.ts:385` | 4 failed / 50 | `:360` (the LED-12 FB test: no entry right after the reversal), `:406`, `:447` and `:463`. The oracle's LED-12 case **passes**: it checks only end-state sums (N-3) |
| m1' | FB and 72 parsed as interest (L6) | `transaction.ts:95-100` | 1 failed / 50 | `:435`, adjustments alone, only |
| m7 | The reversal takes back the line's whole standing approval, not what the reversed claim approved | `remittances.ts:393` | 0 failed / 50 | None. This is the known N-5 deferral to 15b (N-6) |
| R2c | `approvedRemaining` ignores recoupments, with no second take-back source | `ledger.ts:254` | 1 failed / 50 | LED-07's `:611` only. LED-12 has no second take-back source while its cap is intact |
| period-lo | `periodEntries`' lower bound made exclusive | `totals.ts:156` | 1 failed / 16 | The new LED-13 property |
| period-hi | `periodEntries`' upper bound made exclusive | `totals.ts:156` | 0 failed / 16 | None in `totals.test.ts` at this head (N-4) |

Two probes passed on the frozen ledger:
- **P1:** LED-12's case state, asserted as `toBe('awaiting_response')`: 44 of 44.
- **P2:** the LED-13 property with a period ending on the recoupment's date: 16 of 16. With period-hi applied, it
  fails (counterexample `[[], 1n, "2026-01-01", "2026-01-02", "posted"]`).

## Findings

### N-1 (nit): LED-12 asserts the case only "not resolved", where ADR 0042 fixes it at `awaiting_response`
- **File:** `apps/worker/src/reconcile/ledger.db.test.ts:384`.
- **Issue:** the test asserts `expect(await w.caseState(practice, caseId)).not.toBe('resolved')`.
- **Evidence:**
  - ADR 0042 (`docs/adr/0042-*.md:91-93`) says a case with a line moved back from recovered goes to
    `awaiting_response`, and "It is never `open` again".
  - So a regression that sent the case to `open` or `closed_written_off` would pass `:384`.
  - LED-06's reversal test pins `awaiting_response` (`:257`), but only from payer approved. LED-06's WO test (`:221`)
    makes the same weak assertion.
  - Probe P1 passed 44 of 44 with `toBe('awaiting_response')`, for both FB and 72.
- **Fix:** `expect(await w.caseState(practice, caseId)).toBe('awaiting_response');`. It is a test-only line.

### N-2 (nit): two LED-12 tests are each the only guard against a regression; neither says so
- **File:** `ledger.db.test.ts:456` (P-a) and `:421` (adjustments alone).
- **Issue:** a later edit could drop either test as redundant, and LED-12 would lose its guard without any failure.
- **Evidence:**
  - **P-a is the only test that catches a cash regression.** R1b and the builder's s1 are killed only by P-a's
    `:467`.
  - The after-proof in-check test (`:441`) cannot fail on any share regression. The line's room (approved less
    proved) is already 0, and `postings.ts:376-382` caps every share to nothing.
  - The reversal-posting test (`:401`) is capped twice over: by the same room, and by the row's own -100.00
    (`rowLeft` < 0).
  - **The adjustments-alone test is the only one that catches an adjustment read as a take-back or as interest.**
    R2a, m1' and the builder's m4 are each killed only there. In the FB test, the reversal has already used up the
    approval, so the cap hides them.
- **Fix:** add a comment line to each test:
  - in P-a: "the only LED-12 test where the line can still prove: it alone catches a share regression";
  - in the adjustments-alone test: "the approval stands here, so it alone catches an adjustment read as a take-back or
    as interest".
  - Or add the same to `expected.json`'s `inCheck` and `alone` sentences (`workflow.ts:399, 401`).

### N-3 (nit): the oracle's LED-12 comment claims a timing the oracle cannot observe
- **File:** `apps/worker/src/reconcile/ledger-oracle.db.test.ts:97`.
- **Issue:** the comment reads "The 30.00 the corrected claim approved is taken back once, **at the reversal**".
- **Evidence:**
  - The oracle compares only end-state sums after all four steps and a replay.
  - R3 (the take-back delayed to the withholding) passes the oracle case. Only `ledger.db.test.ts` (`:360`) catches
    it.
- **Fix:** "taken back once; neither forward balance moves a figure (the timing, at once, is ledger.db.test.ts's)".
  This is a comment-only change. The harness and the five cases stay byte-identical.

### N-4 (nit): the LED-13 property checks a recoupment's own period only from its date onward
- **File:** `packages/ledger/src/totals.test.ts:201`.
- **Issue:** the property's own-period check, "its own period ... falls by exactly its amount", uses only
  `[on, 2026-12-31]`.
  - No assertion uses a period that **ends** on the recoupment's date, such as a quarter whose last day it is.
  - `periodEntries` documents "both ends included" (`totals.ts:154`).
- **Evidence:** period-hi (`<= to` made `< to`) survives all 16 `totals.test.ts` tests at 0e56e01. Under it, a
  recoupment on a period's last day would fall out of that period's statement.
- **Fix:** add after `:201`:
  `expect(totalsOf(all, '2026-01-01', on).recoveredCents).toBe(totalsOf(base, '2026-01-01', on).recoveredCents - value);`
  - Probe P2: it passes on the frozen ledger and kills period-hi.
  - PR #44 (`9099fac`) also adds `periodEntries(entries, '2026-04-01', '2026-06-30')` at its `totals.test.ts:214`.
    That pins both bounds once #44 merges, so this is a nit, and LANES rule 6 keeps both.

### N-5 (nit): "the adjustment never an entry" is exercised at the cash stages only where the reversal cancels the PLB
- **File:** `packages/synth/src/cases/workflow.ts` (`led12`); `ledger.db.test.ts:421`.
- **Issue:** the only LED-12 check that is deposited or posted is `reversal-in-check.835`. Its PLB FB (+100.00 in the
  share's sign) is cancelled by the reversal's -100.00 in the same check.
  - `adjustments-alone.835` (BPR02 200.00, PLBs only) is never deposited or posted.
  - Neither is `forward-balance-withheld.835`.
- **Evidence:** R1a (the PLB counted as the line's cash beside the reversal) survives 50 of 50, because the two cancel
  on every fixture.
  - Today's `shares` reads only claims matched to the line, so this is a coverage hole, not a live defect.
  - The database also refuses a `posted` or `deposited` entry whose evidence is a PLB (`ledger_entry` CHECK,
    `20261023120000_recovery_ledger.sql:199-201`).
- **Fix (optional, tests and synth only):**
  - Generate `adjustments-alone-eft-export.csv` (200.00, trace SYNEFTLED12007) and a check-level posting of it.
  - Stage both in a P-a-like state: `scenario('LED-12')`, before any proof, then load `adjustments-alone.835`.
  - Assert that no entry is added and cash stays 0/0.
  - Or record in item 15 that a PLB-only check's cash is outside PR 15.

### N-6 (nit): the public row record does not say that "for what the reversed claim approved" is pinned only on single-approval lines
- **File:** `docs/product/test-matrix.md:138`; the row at `:135`.
- **Issue:** the test-matrix paragraph presents LED-12's row without its known limit. Only reconciliation-001 item 15
  (`:244`) records the limit: "15b's design adds a line holding two approvals ...".
- **Evidence:**
  - m7 (take back the whole standing approval) survives 50 of 50 at 0e56e01. Every LED-12 line holds one approval,
    so "what the reversed claim approved" equals "everything standing".
  - m6 (take back the 100.00 reversed) is pinned. In the tests, `recoupedCents: negateCents(totalsBefore.approvedCents)`
    and the stages are -3000 from `expected.json`.
- **Fix:**
  - Append to the paragraph: "pinned on a line holding one approval; a line holding two is PR 15b's
    (reconciliation-001, item 15)".
  - The row text itself should stand. I found no better wording. Every other clause ("no `posted` or `deposited`
    entry", "the adjustment never an entry", "`recouped` once, at once") is asserted as written. The tests assert
    more than the row, for example never a match.

## Checklist (payment-engine-reviewer, ledger)

- **Floats:** none.
  - Every amount in the new tests is a bigint or a cents string: `cashOf()`, `expectedStages`, `outcomeOf().recoveredCents`
    and `(-BigInt(...)).toString()`.
  - The builder uses `negateCents`, `subtractCents` and `centsToString`, and `5000n` and `15000n` literals.
  - A search of the diff found no `parseFloat`, `Number(`, `toFixed` or `Math.`.
- **Amounts come from `expected.json`:**
  - LED-12's stages (-3000), recovered (0), `cash.*` (reversal -10000, adjustment -10000, BPR02 0 and 5000) and the
    notification total `"-3000"` are all read from the fixture.
  - The oracle's hand-stated known outcome is cross-checked against `expected.json` by the existing harness.
- **Rounding, flags, Medicare, windows:** none involved. It is LED-06's fixed-schedule commercial contract.
- **Recovered includes approved but unposted?** No. `totals.ts` is unchanged (numstat `17 0` is
  `totals.test.ts` only). Recovered stays the proof level's stage plus recouped.
- **Trace:** the recouped entry's evidence is the reversal claim. Its `effective_on` is set by the database
  (`20261027090000_packet_and_ledger_review.sql:135-140`), so "dated by its remittance" is pinned by the database
  and asserted by the test.
- **Model output reaching a number:** none. There is no model identifier in the diff.
- **Golden line and property test:**
  - LED-13 adds a property.
  - LED-12 is a database scenario with an oracle case.
  - No pricing behaviour changes, so no golden line is due.
- **Freeze and scope:**
  - `git diff --name-only 9c57d2d 0e56e01 -- packages/ledger/src apps/worker/src/reconcile ':!**/*.test.ts'` is empty.
  - Under `packages/{pricing,edi835,db}`, `content`, `docs/adr`, `domain-model.md`, `change-order-001.md`,
    `CLAUDE.md`, `.claude` and `.github`, nothing changes.
  - The deleted lines in the three test files are the 2 widened imports and the 2 header-comment lines.
  - LED-01 to LED-11 and the oracle's five cases are byte-identical. The new describes are insertions between LED-06
    and LED-07, and the new oracle case is an insertion.
- **Fixtures:**
  - All 7 LED-12 835s balance: BPR02 = sum of CLP04 - sum of PLB.
  - They carry only CAS CO 45.
  - LED-13's case line (LED-06) is share-free too. LED-06's `CAS*PR*2` is on another patient's claim (n3).
  - The PLBs name the corrected claim's own control number (SYNCCNLED120002).
- **Quotes in item 15:**
  - PRD 13 `:548` ("a reversal claim against a case line creates a `recouped` entry at once"; "A forward balance (FB)
    is recorded but not counted until it resolves") is verbatim.
  - ADR 0042 `:88-89, 97` is verbatim.
  - The founder's words match `lanes/lane-b.md:96` and `LANES.md:165`.
  - The delegation is `LANES.md:171`.
  - 15b as Lane B's item matches `LANES.md:94`.

## CI on #45 (0e56e01), read through the REST check-runs API and `get_job_logs`

Every job succeeded:
- approval-of-record (×2), changes, lint, static, unit, mutation, domain model, build and images;
- db (1/4) to (4/4), e2e (1/2) and (2/2), capacity, screening-capacity gate, and **all green**.

`notify` was skipped. `ledger.db.test.ts` ran in db (2/4), 21 s. `ledger-oracle.db.test.ts` ran in db (3/4).

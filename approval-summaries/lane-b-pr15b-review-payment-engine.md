# PR 15b (#51): payment-engine review

Reviewed: head 0e086eda, base claude/build-platform 6ddd587. Checklist: .claude/agents/payment-engine-reviewer.md (arithmetic, rounding, signs, caps, windows, trace).
Probes ran in a detached worktree, since removed. Copies are in `pr15b-review/engine-probes/` (`probe-835.ts` generates SYNTHETIC 835s; `probe-engine.db.test.ts`; `PROBE-ENG/*.835`). The raw outputs quoted below came from `pr15b-review/probe-out.txt` and `mutants.log`. Shard and gate logs: `shard.log`, `gate.log`.

**Verdict: fix.** One finding is blocking (B1). Three are should-fix, one of them a test gap. Two are nits.

## Findings

### B1 (blocking, defect): a patient's share reported at claim level is still counted in `approved`, which is the #12 bug on another path
- **Where:** remittances.ts `claimLines`/`paidLine` (paid(n) = `service_line.paid_cents`). That value is SVC03 (parse/plan.ts:302) and leaves out the claim-level CAS. postings.ts `shares` uses the same value, and so does patient-share.ts `otherReductionCents`.
- **Why:** in an 835 the claim pays `CLP04 = Σ SVC03 − claim-level CAS`. When the PR (or a CO such as CO-253) sits at the claim level, SVC03 is not what the payer paid on the line. The design handles this case for the display only (1.1, "allocated from the claim"). It never handles it for the cash.
- **Probe E8:** original SVC 150/70, AMT B6 70, claim-level CAS PR-2 14.00, CLP04 56.00 (BPR 56.00). The correction reverses it and pays SVC 150/100, AMT B6 100, claim-level PR-2 20.00, CLP04 80.00 (BPR 24.00).
  - Got `approved 3000`. Under #12 it should be 2400.
  - `lineCorrections` shows billable coinsurance 600 beside that 3000, so the patient's 6.00 is both shown and counted.
  - `otherReductionCents` comes out as `-600`.
  - After the 24.00 EFT: deposited 2400, `payerApprovedCents` 3000. That leaves 6.00 approved and never provable, on every deposit-proof practice.
- **Fix (no migration):** measure paid(n) for a line as its share of CLP04: SVC03 less the line's allocation of the claim-level CAS, all groups, signed.
  - Allocate with `allocateProRata` (the parser's own rule), or `allocateByWeight` so the parts sum exactly to CLP04. Round once and keep the exact fraction beside it, as the display allocation already does.
  - Feed that value to the chain, the shares and `patientShareChange`.
  - Add a LED-14 variant with claim-level PR (or a row in the next free LED slot) and a `pay` unit case.
  - ADR 0067 must state the rule.

### S1 (should_fix, defect): one reconcile can process candidates in a different order from the stored chain
- **Where:** remittances.ts `matchClaims`, the `for (;;)` re-query loop, against `CHAIN_ORDER`.
- **Why:** the loop processes batch 1 (control-number candidates) and only then batch 2. Batch 2 can surface patient-number candidates that `preferredCandidates` hid while a control candidate existed, and these can be paid earlier. Within one reconcile the stored chain is ordered by `bpr16_date, created_at, id`. So the pass writes its amounts in one order, and every later walk reads them in another: postings `net`, `lineCorrections`, the next reconcile's baselines and shortfalls.
- **Probe F1:** original 70/56. P (paid 2026-06-08, new ICN, no F8, 100/80, PR-2 20). A (paid 2026-07-07, F8 to the original, 87.50/70). Both were loaded, then one reconcile ran.
  - The pass writes A +1400, then P +1000. The total of 2400 is right.
  - The stored chain reads P first and A second: net(P) = 2400 and net(A) = −1000, so A's ERA shows "payment increase −$10.00" on an approval of 14.00.
  - A later resend Q (100/80) is counted `confirmed` against an unpaid acceptance of 10 that does not exist (no payer response).
  - Check attribution is wrong as a result: A's 14.00 check deposits nothing, and P's check carries 24.00. If only A's EFT ever arrives, 14.00 stays unproved.
- **Before this PR:** P would be matched in the next reconcile, so the chain order and the processing order always agreed.
- **Fix (in this PR, no migration):**
  - Run the candidate closure to a fixpoint first. Extending `known` depends only on pairing, never on the outcome.
  - Then process every candidate in `CHAIN_ORDER`'s claim order (`bpr16_date, created_at, id`).
  - Pin it with F1 as a test.

### S2 (should_fix, test gap): four worker mutants survive the whole suite
The suite was payment-terms.db + ledger.db + ledger-oracle.db, 78 tests. Results are in `mutants.log`.

| Mutant | Where | Result | Evidence |
| --- | --- | --- | --- |
| M4 | `afterReprocessing`: the take-back forced to 0 | survives | Probe M4P loads adjusted + lowered + a correction at 100/80 before one reconcile. Correct code approves 1000; the mutant records `no_change` and a false `reprocessed_no_change` |
| M7 | `lineChain`: the withholding's take-back forced to 0 | survives | Probe E1 (LED-14 proved, a PLB WO of 10.00, then a reissue at 110/88). Correct code approves 1800; the mutant approves 800 |
| M5 | `CHAIN_ORDER` without its kind rank | survives | Not probed, reasoned. Reachable when one reconcile holds a correction and a PLB WO dated before it: the pass runs claim then WO, the mutant's chain runs WO then claim |
| M2 | `reversalRule`: `laterClaimStands` ignores the as-of position | survives | Not probed, reasoned. It changes A_b after a reversal followed by a non-anchor claim, which flips the next outcome between `no_change` and `decreased` |
| M1 | `loadedAt <= asOf.at` changed to `<` | equivalent | A load and a match never share a transaction |
| M3 (loop removed), M6 (shortfall baselines), M8 (patient_balance `>=`) | | killed | |

**Fix:** add E1, M4P and an M5 case (a WO and a correction in one reconcile) to payment-terms.db.test.ts. Add an M2 case too: reversal, then a no-change claim, then a lower allowed.

### S3 (should_fix, improvement): the case's "patient balance" rule is written twice
- **Where:** apps/web/src/lib/reconciliation/queries.ts:225 `casePatientBalance`, and apps/worker/src/report/content.ts:461 (`patientBalanceCases`, inline). The same `line_status` stage subquery is also copied.
- **Why:** design 2.3 (S13) asks for one definition. The screen and the report can drift.
- **Fix:** export one `casePatientBalance` from patient-share.ts through public.ts and call it from both. Both files are already in this PR, so the fix belongs here.

### N1 (nit): interest is flagged `allocated` when only one line can take it
recordInterest marks the entry `allocated = named.length > 1` even when only one line has a weight. Probe E4: a patient-balance line plus a paid line; all 3.00 of interest goes to the paid line, flagged allocated. This is behaviour from before this PR and costs no money, so it is outside this PR.

### N2 (nit, outside my lane): this PR changes a file on #42's list
`tools/screening-capacity/watched-paths.txt` is on `/tmp/claude-0/pr42-files.txt` (line 143). Commit 0e086eda regenerates it, because the unit test requires it to list the new files. The rule says "no #42 file beyond the shared documents". The orchestrator should rule on it, or let #42 regenerate it.

## The builders' proposals
- **Interest counted twice (AMT I plus PLB L6 naming the same claim):** the double count is real, and it predates this PR. claimInterest and providerAdjustments are unchanged, and #12 does not cover interest.
  - **Outside this PR.** Make it its own ledger change with its own test-matrix row and freeze ruling, because it changes what the ledger records beyond #12's exception.
- **The order of `ledger_match.matched_at` within one reconcile:**
  - **The part inside this PR** is S1. Make the pass follow `CHAIN_ORDER`; no schema change is needed.
  - **Outside this PR:** stamping matches with `clock_timestamp()` or a sequence. That needs a migration on a frozen ledger table, so it is Lane A's.
- **`casePatientBalance` duplicated:** inside this PR (S3).

## Checks done, all pass unless noted
- **Additions only under `packages/ledger/src`:** index.ts +1 line, payment.ts and payment.test.ts new.
  - The diff is empty for `packages/pricing`, migrations, LED-01..13 fixtures and their expected.json, and ledger.db.test.ts (byte-identical).
  - The oracle has 0 removed lines; shards.json gains payment.ts.
  - The only model names in the diff were already in PRD text.
- **Tests:** payment.test 34/34; payment-terms, ledger.db and the oracle 78/78.
- **LED-14..18 re-derived by hand from the 835s:** every figure agrees.
  - LED-14: 2400 approved, posted, deposited, then −2400; reissue +400 with coinsurance 100; shared check posts 1200; one-pass case +2400 then −1000.
  - LED-15: no entry; partial case +1000, then Q2 −1000; B2 decreased with no entry, then +1000 (against 40.00, not 34.00).
  - LED-16: 3000; two lines 2400 and 3000, interest 240 and 300, WO −2400 and −600.
  - LED-17: (a) −2400, (b) −1600, (c) 0.
  - LED-18: confirmed 2400, shortfall 0.
  - LED-16's BPR is 54.00, not the design's 59.40: AMT I is left out of CLP04 under ADR 0021. The builder recorded the deviation.
- **Worked examples beyond the fixtures, by probe:**
  - E1, coinsurance with a PLB WO after the proof: −1000, recovered 1400; a reissue at 110/88 approves 1800 (correct).
  - E2, a deductible taking part, then the reversal: −1000 (recovered −1000 in the interim, known limit N5).
  - E3, two partial check-level rows (100 + 74 of a 174 check): 1379 + 1021 = 2400.
  - E4, interest across a patient-balance line and a paid line: 300 to the paid line.
  - E6, reversal of a confirmed match: −2400, no shortfall.
  - E7, same allowed, lower payment, nothing approved: `no_change` (as designed).
  - E8: **B1**.
  - F1: **S1**.
  - The response-typed-as-allowed and Q2/B2 cases are already tested.
- **Recovered:** it never counts the patient's share or unpaid money, except through B1. It cannot exceed the approval: the room cap and the DB bounds hold. It goes negative only in the known interim (N5). I found no double count.
- **"Billable to the patient" in any total:** grep finds it only in the case Fact (triage.ts:349, display only). It is not in ledgerTotals, the ROI statement, the report, the CSV or the headline.
- **The new `matchClaims` behaviours against LED-01..13 and the oracle:** no outcome changes, and the order is deterministic. S1 is the cross-order defect.
- **Mutation:** money-ledger shard run here: ledger 98.33%, payment.ts 194/194 (100%), no unexplained survivor. `tools/stryker/gate.ts --shard money-ledger` exits 0.

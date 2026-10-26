# 0067. Measure every ledger amount in what the payer pays, decide the outcome on the allowed amount, show the patient's share beside, and take back on a reversal the payment it removes

- **Status:** accepted (PR 15b, combined audit #12); amends
  [0042](0042-keep-recovery-in-a-signed-append-only-ledger-of-matched-evidence-and-move-lines-to-recovered-only-from-its-entries.md)
  and [0046](0046-pair-reprocessed-lines-prove-rows-within-their-amounts-and-take-export-rows-from-the-job-only.md) for
  the amounts matching writes, the cash shares, the reversal take-back and the payer-response amount.
- **Date:** 2026-10-26
- **Deciders:** the founder, Tyler Williams, who adopted the combined audit as a whole on 2026-10-20 at about 15:10
  UTC, item #12's ledger freeze exception and PRD 13's two definitions of "approved" among it; Q1 and Q2 ruled on
  2026-10-26 at about 01:05 UTC under the co-founder's standing ruling of about 00:20 UTC ("Don't ask for approvals
  anymore just build and optimize"), relayed by the Lane B orchestrator; the build (Lane B), for the engineering
  choices inside the ruling
- **PRD sections:** 12 (the headline's payer approved), 13 (the recovery ledger: entries, matching, recoupments and
  reversals); reconciliation-001 item 15b and its "Ledger semantics" checks; test matrix LED-14 to LED-18; ADRs 0042
  and 0046

## Context

The ledger measured every amount in allowed terms. A correction raising a line's allowed amount from 70.00 to 100.00
was approved for 30.00, the allowed increase, whatever the payer paid. On a line with 20% coinsurance the payer pays
24.00 of it (56.00 then 80.00) and the patient owes the other 6.00. The design's probes on the frozen ledger, on that
line:

- **1a** (the EFT of 24.00 only): approved 30.00, deposited 24.00; the line stays `payer_approved` for ever with 6.00
  approved but not proved (the ROI statement's approved-unposted), and payer approved reads 30.00.
- **1b** (a line-level posting row of the correction's gross 80.00, then the EFT): posted 30.00, the gross row capped
  at the approval, 6.00 of it the patient's share. The correction then reversed alone takes back 30.00 against 24.00
  deposited: recovered -6.00.
- **A deductible that takes the whole increase** (allowed 70.00 to 100.00, PR-1 30.00 to 60.00, paid 40.00 both
  times): approved 30.00 of money the payer never paid, and a 40.00 line row posts 30.00 of it.
- **2a to 2c** (a line holding two approvals, A +10.00 then B +20.00, share-free): the reversal of B takes back 20.00
  when nothing stands and when A stands, and the late reversal of A 10.00 while B stands. A mutant that takes back the
  whole remaining approval (m7) passed every existing ledger test (85 of 85); no test held a line with two approvals
  (PR 15's design review, N-5).

No LED-01 to LED-13 line has a patient's share (paid equals the observed allowed, CAS CO-45 only), so none of it was
seen.

## The founder's ruling

The combined audit's item #12, as its best option reads and as the founder adopted it ("**Adopt all of it.** The 19
freeze exceptions are granted; the ruling changes the report lists are accepted as it recommends"):

> Keep deciding the outcome on the allowed amount (approved, confirmed, decreased, no change), as PRD 13 says, but
> measure every ledger amount in what the payer actually pays: 'approved' is the payer's payment increase on the line,
> a posting share is net of the reversal it replaced, and a reversal takes back what was paid. A correction a
> deductible absorbed is recorded with no entry and the case closes as 'payer corrected; balance is the patient's',
> never as recovered and never as no change. The allowed increase and the patient's share are shown beside it as
> 'billable to the patient', never counted. The definition of recovered, the proof cap and the seven entry types do not
> change. New ledger fixtures cover coinsurance, a deductible and a copay.

The exception covers what matching writes (the approved amount, the posting and deposit share), what a reversal takes
back, and the deductible-absorbed outcome.

## Decision

All amounts are integer cents. The one division is a line's part of its claim's claim-level CAS, below, rounded once
with its exact fraction kept beside the cents; every amount the ledger writes is a difference of those. The arithmetic
is one new pure file, `packages/ledger/src/payment.ts` (`claimLinePayments`, `paymentChain`, `paymentOutcome`,
`reversalTakeBack`, `patientShareChange`), mutation-tested under money-ledger; the reconcile step in
`apps/worker/src/reconcile` reads the rows and calls it.

**Notation.** For a case line, `p0` and `a0` are the original's paid and observed allowed amounts. The line's chain is
its standing claim matches in ledger order; each claim match `n` has its paired line's `paid(n)` and `allowed(n)`.

**A line's cash, `paid(n)`, is its share of CLP04** (`claimLinePayments`; the engine review's B1). The payer pays a
claim CLP04, which is its lines' SVC03 less the claim-level CAS (every group, signed) that no SVC03 already holds:
`D = Σ SVC03 − CLP04`. When the patient's share (or a CO such as CO-253) is sent at the claim's level, SVC03 alone
overstates what the payer paid on the line: a correction from SVC03 70.00 to 100.00 with the claim's PR-2 rising
14.00 to 20.00 pays 24.00 (CLP04 56.00 to 80.00), not 30.00, and approving 30.00 would count the patient's 6.00 and
leave it approved and never provable by the 24.00 deposit (probe E8, now LED-14's claim-level variant).

- A line carrying CAS of its own balances alone, so its SVC03 holds none of the claim-level CAS; a line carrying none
  is balanced by the claim and its SVC03 may already hold its part (PAR-10's lines, where `D` is 0). So `D` is split
  over the lines that carry CAS of their own, or over every line when none does.
- The split is the parser's own rule, `@tp/edi835 allocateProRata` (the rule behind the observed allowed and the
  patient's share allocated from the claim): by the magnitude of each line's charge, each part truncated toward zero
  once, the cents left given one at a time in line order. Its exact fraction, `D × charge / Σ charges` (`D / n` when
  every such charge is zero), is kept beside the cents.
- `paid(n)` is SVC03 less the part, so a claim's lines add up to its CLP04 exactly, and the chain, every posting and
  deposit share, and the billable to the patient read it. A claim-level PR is then the patient's share once, in
  billable to the patient, and never again in the other reductions. A line-level posting row is still matched on
  SVC03 as sent, which is what it posts; what it proves is the line's cash share.
- `allocateByWeight` (largest remainder) was the other candidate. It refuses a negative total or weight, and a
  reversal's charges and CAS are negative; and its remainder rule differs from the parser's, so a line's cash and its
  allocated share could disagree by a cent and show a cent of other reductions that is not there.
- With no claim-level CAS, `D` is 0 and `paid(n)` is SVC03. No LED-01 to LED-13 claim carries claim-level CAS, so
  their amounts do not move.

- **Paid baseline `P_b`:** starts at `p0`; each standing `approved` claim match sets it to `paid(n)`; each recouped
  entry matched to the line after that adds its (negative, cash) amount. `P_b⁻(n)` is the baseline just before `n`.
- **Allowed baseline `A_b`**, walked beside it in allowed terms: an approving match sets it to `allowed(n)`; a
  `decreased` match with a take-back sets it to `allowed(n) + r`, `r` the part of the payment decrease the cap left; a
  reversal's take-back translates it to the base the reversal leaves (the latest earlier claim that stands, or the
  original); a PLB WO adds its amount, as before. On share-free lines every step equals the old additive walk.
  Adding a cash take-back to the allowed baseline instead would read LED-14 reversed as 76.00 where its allowed
  baseline is 70.00, and a reissue at 75.00 as "no change".
- Within one reconcile pass both baselines are carried pass-locally, as the old baseline was.
- **`remaining`** is the approved less the recouped, at least 0, read from entries; **`U = max(0, remaining − (P_b −
  p0))`** is what a payer response approved that no remittance has paid yet.

**The amounts.**

- **The outcome kind** is still decided on the allowed amount by `reprocessing()`, unchanged: higher, lower or the
  same against `A_b`.
- **Allowed higher:** the gain is `g = paid(n) − P_b`. If `g > U`, an `approved` entry of `g − U` (it also confirms
  `U`); if `0 < g ≤ U`, confirmed with no entry and a shortfall of `U − g`; if `g = 0`, no payment increase: the match
  is `approved` with no entry and no payer response, and both baselines move to it.
- **Allowed lower**, with an approval remaining: `−min(P_b − paid(n), remaining)`; when the payment did not fall the
  match is `decreased` with no entry (the sign CHECK forbids a zero entry). With nothing approved: "reprocessed, no
  change", as before.
- **Allowed the same or higher, payment lower** (Q2, below): with an approval remaining, `decreased`, taking back
  `min(P_b − paid(n), remaining)`; with nothing approved and the allowed amount higher, `decreased` with no entry, no
  payer response and no baseline moved; with the allowed amount the same, "no change".
- **Posting and deposit shares**, line level and check level alike: `net(n) = paid(n) − P_b⁻(n)`, so a reversal is
  netted exactly once, against the claim that replaced it; a share of 0 or less proves nothing. The proof cap is
  unchanged and is now a cap in payment terms.
- **A reversal of claim `x`** with no correction of it beside it takes back 0 while a claim matched to the line after
  `x` still stands, and otherwise `min(remaining, max(0, (paid(x) − p0) − max(0, S − p0)))`, `S` the paid amount of the
  latest earlier claim of the chain (the original included) that no loaded reversal reverses, or 0 when none stands.
- **A PLB WO's capacities and interest's weights** read `remaining`, so they are in payment terms with no code change.
- **A payer response** keeps its split and cap; its amount is the payer's payment (the form asks for "the amount the
  payer will pay"), at most the allowed variance it accepted.

**Billable to the patient.** For each standing claim match, `patientShareChange` gives the allowed increase, the
payment increase (`net(n)`, the ledger's own figure), the signed change of the patient's share by reason (PR-1
deductible, PR-2 coinsurance, PR-3 copay, other PR), and the other reductions (the rest, shown only when not zero).
The patient's share is read from the PR adjustments, never as allowed less paid; a claim-level PR with no line-level
one is allocated by charge with the parser's own rule and flagged, its exact fraction kept beside the cents.
Billable to the patient is `max(0, Σ change)`. It is shown on Reconciliation, the case page and the specialist's
ledger review, and counted in no total, statement, link, CSV, digest or headline.

**Payer corrected; balance is the patient's.** A line whose latest standing approving claim match has no entry and
`net(n) = 0` is a no-payment-increase correction: "Payer corrected; balance is the patient's" when the patient's share
rose, and "Payer corrected; it pays nothing more (other reductions)" when it did not. The words are worked out from
stored rows. The line is never recovered and never "no change", and no ledger stage is added.

## Q1 and Q2: as put, and as ruled

- **Q1 (migration), as put:** ship 15b with the deductible-absorbed outcome recorded with no entry and labelled from
  stored rows, the stored case close handed to Lane A's next case-schema migration (PR 8). Alternatives: hold all of
  15b until a Lane A migration lands, while the coinsurance overstatement continues; or have a person write the line
  off as `other`, which mislabels a payer correction as a write-off.
  **Ruled: yes.** The correction is an `approved` match with no entry and no payer response, never recovered and never
  "no change", shown from stored rows. Why: it removes the overstatement now, and once the migration lands the end
  state is #12's best option exactly.
- **Q2 (a case the ruling does not name), as put:** the allowed amount and the payment can move in opposite
  directions. When a reprocessing raises or keeps the allowed amount but pays less, on a line with an approval
  remaining, record `decreased` and take back the payment decrease, capped by what is approved; when the payment rises
  while the allowed amount stays or falls, decide by allowed as before. Alternative: decide by allowed always, which
  leaves a line already proved counting cash the payer withdrew.
  **Ruled: the recommended rule.** Why: recovered never holds money the payer withdrew, and every error understates.
  On that edge alone the stored outcome follows the payment, not the allowed amount; the words name both ("higher
  allowed, lower payment: approval taken back").
  - **Completed at the design review (B2), inside the ruled rule:** allowed higher, payment lower and nothing approved
    is `decreased` with no entry and no payer response, and moves neither baseline ("higher allowed, lower payment:
    nothing approved to take back"). Approving it by allowed, as before, would approve an increase for a payment that
    fell, and an approving match with no entry would anchor the paid baseline at the lower payment and overstate a
    later approval (LED-15: 10.00 against the 40.00 before it, not 16.00 against 34.00).
- **A recommended choice recorded (N-5, case (a)).** LED-12's row reads "the reversal `recouped` once, at once, for
  what the reversed claim approved" (test-matrix.md, LED-12), and N-5 asks for "a line holding two approvals, of which
  a reversal takes back only its own claim's" (PR 15's design review, N-5, its fix). Where every claim of the line is
  reversed and nothing stands (LED-17 (a): A reversed beside B, then B reversed alone), the last reversal takes back
  24.00, more than the 16.00 its own claim approved: nothing the payer paid on the line stands, so keeping 8.00
  approved would count money the payer withdrew, and #12's "a reversal takes back what was paid" governs. While an
  earlier payment stands (LED-17 (b)) the reversal takes back only its own claim's approval, 16.00, so N-5's clause
  holds there; while a later claim stands (LED-17 (c)) it takes back nothing. LED-12's row is read as "what the
  reversed claim's payment carried", and LED-12's and LED-13's amounts do not move (one approval, the original reversed
  beside the correction).

## Known limits, stated

- `net(n)` is measured against the last approving anchor, not against the claim a remittance actually reversed: with a
  no-change claim between two approvals, a check's share can differ from the cash it moved while the line's totals are
  right.
- Recovered can go negative in the interim when a recoupment is matched before the proof (recovered is proved plus
  recouped), as it already could; LED-17 (a) makes the interim value larger (-24.00 rather than -16.00) until the
  deposits are matched.
- A PLB WO followed by a resend of the same correction approves the withdrawn amount again, as before this change.
- Where a WO or a capped take-back sits on a line with a patient's share, `A_b` can read above the true allowed
  baseline, so a later rise can only be classed lower (confirmed or no change rather than approved): an
  understatement, never an overstatement.
- Interest a claim pays on a line with nothing remaining (a patient-balance line) is dropped, because no weight is
  above zero, as for any line with nothing approved.

## What does not change

`LEDGER_STAGES`, the seven entry types, the definition of recovered, the proof cap and `reprocessing()`. No migration
and no DDL. LED-01 to LED-13, their fixtures and `ledger.db.test.ts` are unchanged: every one of their lines is
share-free, so each payment-terms formula equals the allowed-terms one there (a property in `payment.test.ts` pins
it). The ledger oracle's six cases and its harness are unchanged; four cases are appended (LED-14 to LED-17).

## Consequences

- Coinsurance and copay lines reach `recovered` once proved; approved but not proved reaches 0; payer approved is
  what payers have agreed to pay. The patient's share is visible beside the figures and never inflates them.
- A correction the patient's share took whole writes nothing and is labelled. **Until Lane A's stored close lands,**
  the case does not close by state, and the line stays in the actionable figures, deadlines and follow-ups, labelled
  there.
- A payer response typed as the allowed amount rather than the payment leaves a shortfall equal to the patient's
  share, now named beside it; the form's label and hint ask for the payment.
- No customer data exists to convert: every stored row is synthetic and no ROI statement has been sent. Development
  data seeded before this change holds approvals in allowed terms and is regenerated, never reused.
- `apps/worker/src/reconcile` is not mutation-tested, so its arithmetic moved into `payment.ts`; the glue left there
  is pinned by LED-14 to LED-18's database tests.

## Handed to Lane A

The stored case close, "payer corrected; balance is the patient's", needs a stored value: a case-line close the
reconcile job writes when a correction's payment increase is zero because the patient's share took it (PR-1, PR-2,
PR-3), which leaves the actionable total, and a case state derived from it, mirrored by `@tp/triage`'s
`deriveCaseState`; not a write-off. It touches `case` and `case_line` only, none of the frozen ledger tables, with
`docs/product/domain-model.md` regenerated and approved, in PR 8's case schema beside #11's per-line payer decisions.
Lane B opens no migration (LANES.md rule 2).

## Revisit when

- Lane A's stored close lands: the case closes by state and the interim limit above ends.
- #11's per-line payer decisions replace the case-level response amount.
- A ruling decides whether a PLB WO lowers the payment baseline at all (the WO-then-resend limit above).

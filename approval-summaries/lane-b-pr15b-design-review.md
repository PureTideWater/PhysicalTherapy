# PR 15b design review (adversarial, one reviewer)

Design: /home/user/ops/designs/lane-b-pr15b.md, read as ruled (section 0.5: Q1 yes, Q2 the recommended rule).
Base: claude/build-platform 6ddd587. Worktree for probes: review-wt (detached at 6ddd587; removed after). Synthetic data only.
Verdict: **revise**. There are 2 blocking findings, 13 should-fix findings and 7 nits. The ruling's frame holds: no
migration for 15b, no departure from #12's best option beyond Q1's interim and Q2 as ruled, the engine freeze holds,
the shards are right, and LED-01 to LED-13 stay share-free. The core formulas still have two holes, and the design
still reads as waiting on questions in ten places.

## Blocking

### B1. The allowed baseline A_b mixes allowed and payment terms once take-backs are in payment terms (section 1.1 and 1.2)
- **Evidence:** `remittanceBaseline` (rem:234-244) is the anchor's allowed plus the recouped entries matched after the
  anchor (`takenBack`). The design keeps it "unchanged", but every recouped entry it adds is now cash. Take LED-14
  after its reversal: the anchor B is allowed 100.00 and the reversal is recouped −24.00, so A_b = 76.00. Today, in
  allowed terms, it is 70.00 (the original's).
- **The failure:** the payer reissues the claim at allowed 75.00, PR-2 15.00, paid 60.00.
  - `reprocessing({76.00, 0, 75.00, remaining 0})` returns `no_change`. The probe in review-wt passed:
    `expect(mixed.kind).toBe('no_change')`, while the allowed-terms baseline 70.00 gives `approved`.
  - The job then records a payer response "reprocessed, no change" on a correction the payer made, which the ruling
    forbids.
  - It also writes no approval of the +4.00 the payer pays over P_b = 56.00.
  - The same happens for any allowed value between 70.00 and 76.00, and Q2's decreased entries shift A_b the same way.
- **Fix:** walk A_b in allowed terms beside P_b.
  - A reversal take-back sets A_b to the allowed of S's claim, or a0 when nothing stands.
  - A decreased claim match sets A_b to allowed(n) (less the cap's remainder when the take-back was capped).
  - A PLB WO keeps today's subtraction (it is cash on share-free lines). Its coinsurance effect goes under "Proposals".
  - On share-free lines each translation equals today's, so LED-01 to LED-13 are unchanged. Pin that in pay's
    share-free property.
  - Add a unit test and a db variant: LED-14 reversed, then reissued at allowed 75.00 / paid 60.00, gives `approved` 4.00.

### B2. Allowed higher, payment lower, nothing approved: "else as today" writes an approval in allowed terms (section 1.2, Q2 row; 0.5)
- **Evidence:** the "Approved by reprocessing" row sends g < 0 to Q2. Q2's row says `'decreased'` "when
  remaining > 0, else as today". Today, a higher allowed returns `approved` with `allowed(n) − A_b − unpaid`.
- **The failure:** take allowed 70 → 100 with paid 56 → 50 (a deductible re-applied) on a line with nothing approved.
  - "As today" writes `approved` 30.00 for a payment that fell by 6.00. The payer approved headline overstates by 30.00.
  - If instead it were stored as an approving match with no entry, P_b would anchor at 50.00. A later payment of 80.00
    would then approve 30.00, against a true gain of 24.00.
- **Fix:** state the case. g < 0 with remaining = 0 is a `'decreased'` match with no entry, which is legal:
  `ledger_match_rules` and `ledger_entry_rules` require no entry for a decreased match. It is not an anchor, so A_b and
  P_b do not move. Its words read "higher allowed, lower payment: nothing approved to take back". Add a unit test
  (kills `as today`) and a line in PRD 13's Q2 sentence.

## Should fix

1. **Ten places still read as waiting on a question.** These are:
   - the 0.3 heading ("needed for one part only") and its `migration_needed = true`, which should be scoped to Lane A's
     stored close, with 15b needing none;
   - 0.3:80 ("If the co-founder rules to hold 15b");
   - 0.4's title and "Recommended: yes";
   - 3.1:263 ("If the co-founder takes Q2's recommendation");
   - 3.2's Deciders ("co-founder for Q1 and Q2 (with their dates)");
   - 3.3's item text ("*(Q1, the co-founder's answer and date.)*");
   - 3.6 A5 ("if ruled as recommended");
   - section 4's "Open item for the lane lead" on `matrix.ts`;
   - 7.1 risk 2;
   - 8's builder 2 ("when they arrive").

   **Fix:** write each as ruled on 2026-10-26 ~01:05 UTC, under the co-founder's standing ruling of ~00:20 UTC relayed
   by the Lane B orchestrator. On `matrix.ts`, take the recommended answer: it is the synth registry's mirror under
   rule 6. The precedent is PR 15 (f4d125b) and ci-mutation (da4d7e9), both of which changed `matrix.ts` and resolved
   under rule 6. Turn 0.4 into a record, or delete it.
2. **`reversalTakeBack`'s outer clamp survives the planned tests (3.6 A7).** I put the formula in 1.5 and five mutants
   against A7's planned cases in review-wt:
   - m7's analogue is killed by (b), (c) and the clamp case;
   - the guard removed is killed by (c);
   - `max(0, S−p0)` → `S−p0` is killed by the clamp case;
   - **the outer `max(0, …)` removed survives every planned case;**
   - the inner `max(0, reversedPaid − originalPaid)` is redundant beside the outer one: it is an equivalent mutant.

   **Fix:** drop the inner clamp. Write `min(remaining, max(0, (reversedPaid − originalPaid) − max(0, S − originalPaid)))`.
   Add the case "a decreased claim (paid 70) is reversed alone while A (paid 80) stands", whose take-back is 0. It kills
   the outer-clamp mutant. Otherwise the gate needs a recorded equivalent.
3. **One reconcile pass with two candidates.** `matchClaims` keeps `baseline` as a pass-local variable and updates it
   after each candidate (rem:310-345), because `matches` is read before the loop. The design builds `reprocessingOf`
   from `paymentChain` over stored matches, so P_b must also be carried within the pass.
   - **The failure:** A (paid 80, +24) and D (allowed lower, paid 70) are loaded before one reconcile. A stale P_b of
     56.00 gives D's `P_b − paid = −14`, and the 10.00 take-back is lost.
   - **Fix:** state the in-pass update, and add a db test that loads R2 and R3 (LED-17) and A then D before one
     reconcile.
4. **The design undercounts the existing tests whose words change ("two change words only").** Also changing:
   - `apps/web/e2e/packets.spec.ts:434` (`'$60.00 accepted'`, from the response listing's new words);
   - `apps/worker/src/report/report.test.ts:156` (html.ts:143's note).

   The wording table also leaves out two notes that keep "accepted":
   - html.ts:143's `approvedNone` note ("accepted by the payer; no payer approval is recorded yet");
   - `packages/triage/src/headline.ts:54`'s payer_approved note ("accepted by the payer"), which the report content
     uses at content.ts:686.

   **Fix:** list them, with their new words and tests.
5. **ERA match words contradict themselves.** `OUTCOME_WORDS` (display.tsx:133) is "kept" with `correctionWords`
   beside it. That produces three wrong readings:
   - a Q2 match (higher allowed, stored `'decreased'`) would read "lower allowed: approval taken back";
   - a decreased match with no entry (allowed lower, payment the same or higher) says something was taken back when
     nothing was;
   - a patient-balance match reads "higher allowed: approved" beside "payer corrected".

   **Fix:** `correctionWords` replaces `outcomeWords` for these three cases. Keep reconciliation.spec.ts:125's
   'higher allowed: approved' true for an ordinary approval.
6. **The audit report's State column.** content.ts keeps `state: row.state` (content.ts:643) and filters
   `item.state === 'open'` (content.ts:664). Writing the patient-balance words into `state` would break that count and
   the CSV.
   - **Fix:** add a separate field, for example `patient_balance: boolean`, rendered by `caseStateText` beside the
     state. That is the precedent of `unattested_submissions` (html.ts:76-79).
   - Note that #46 edits the same function next.
7. **The specialist's ledger review page is missing.**
   `apps/web/src/app/p/[practiceId]/abstraction/ledger/page.tsx:133-135` shows the same shortfalls (through
   specialist.ts's `LinkageLine`). It is where the approval is corrected: "Correct the approval, or leave it for the
   practice to dispute".
   - It should name the patient's share as the Reconciliation paragraph does: a shortfall of 6.00 when the person typed
     the allowed amount.
   - Add it to section 4's files and 5.3's words.
   - The route passes `phi=false`, so the reason words stay hidden there.
8. **The screens list leaves out routes whose values change.** Coinsurance lines now reach `recovered`, so these
   change too:
   - the line stage chips and buckets on `/p/[practiceId]/cases`, `/claims`, the remittance pages and `/monitoring`
     (lib/remittances/queries.ts:411-415, lib/monitoring/queries.ts:153);
   - the reports list's payer approved figure (`reports/page.tsx:138-140`).

   **Fix:** list them as "values only" in 5.1, and add one shot of each to the tour.
9. **No test proves a check-level partial posting nets its share.** LED-09 is share-free.
   - With a check that holds only the line, the row cap masks the gross share. Example: `partialShare(80, 0, 12, 24)` = 40,
     capped to 12, which equals the net answer.
   - **Fix:** add a variant of LED-14 or LED-18 whose check also pays another patient (BPR 174.00), with a partial
     check-level row of 87.00. Net gives 12.00. Gross gives 24.00 (40.00 capped by room).
   - Add one PLB WO across two coinsurance lines and one claim interest (AMT I), with capacities and weights in payment
     terms. The task's worked examples name both, and no planned test covers them.
10. **Case (a) changes the reading of LED-12's co-founder-approved clause and N-5.** LED-12 says "for what the reversed
    claim approved", and N-5 says "takes back only its own claim's". Case (a) takes 24.00 where B approved 16.00.
    - The cash argument is right: nothing stands, so keeping 8.00 approved would count money the payer withdrew.
    - **Fix:** record it as a recommended choice in 0.5 and ADR 0067, quoting both texts and the reason. The amounts of
      LED-12 and LED-13 are unchanged.
11. **The approved notes and the headline use two different phrases.**
    - PRD 12 becomes "what payers have agreed to pay".
    - The tile, reports, LedgerTotals and audit-report notes become "what payers pay on the lines they corrected …; not
      cash until it posts". "Pay", followed by "not cash", reads as a contradiction, and a payer response's acceptance
      has not been paid at all.
    - **Fix:** use "what payers have agreed to pay on the lines they corrected" everywhere.
12. **The oracle harness's self-check.** The harness checks that the fixture's top-level `outcome.entries` and
    `recoveredCents` equal `known` (orc:177-195).
    - LED-17's `expected.json` is described as "`entries` per variant". Its top-level outcome must be variant (a),
      matching the oracle steps: approved 2400, deposited 2400, recouped −2400, recovered "0".
    - LED-15's top level must keep `entries []` (or leave out `recoveredCents`).
    - **Fix:** state these shapes.
13. **`lineCorrections` and `paymentOutcome` define "patient balance" differently.**
    - `paymentOutcome` counts `patientBalance` on g == 0.
    - `lineCorrections` requires `paymentIncreaseCents == 0`, computed against the before line rather than P_b, and a
      positive patient-share change.
    - A g == 0 correction absorbed by non-PR reductions (CO-253) is counted but shown with no words.
    - **Fix:** one definition, read from the stored no-entry approving match. Add the words for g == 0 with no PR rise:
      "Payer corrected; it pays nothing more (other reductions)".

## Nits
- **"Σ patientShareChange when positive" is ambiguous.** It could mean the sum of the positive reasons or max(0, the
  net sum). When the deductible falls 10.00 and coinsurance rises 16.00, the patient owes 6.00 more. Use the net, and
  show the signed changes by reason.
- **`allocateProRata` returns cents only.** The worker must compute the exact fraction itself
  (total × weight / Σ weights). `@tp/ledger` has no `@tp/edi835` dependency, so keep the allocation in
  `patient-share.ts`, or add the dependency on purpose.
- **`net(n)` is measured against the last approving anchor.** It is not measured against the claim the remittance
  actually reversed. With a no_change claim C between, a check's share can be positive while that check lowered the
  line's cash. The totals are right, but the attribution per check is not "net of the reversal it replaced". Note it
  in ADR 0067.
- **A PLB WO, then the same correction sent again, overstates the approval.** P_b and A_b subtract the WO, so the
  resend reapproves it. This happens today too, and 15b does not cause it. Add it to "Proposals outside this PR".
- **Recovered goes negative when a recoupment comes before the proof** (totals.ts:131, proved + recouped). Existing
  and frozen; ADR 0067 could say so, since case (a) makes it larger (−24.00 rather than −16.00) before the deposits.
- **A claim's interest on a patient-balance line is dropped**, because its weight is 0. Understating, and fine; say so
  in 1.2's interest row.
- **Synthetic dev data seeded before 15b keeps entries in allowed terms.** Mixing them with P_b yields false
  shortfalls. Say that `pnpm db:seed` or the tour data is regenerated.

## What I checked and found right
- **No migration for 15b.** These constraints were read at 6ddd587:
  - `ledger_match` CHECKs and `ledger_match_rules` (20261023120000:123-166, 314-375): a claim match needs an outcome
    and no entry;
  - `ledger_entry_rules` (20261027090000:50-139): recouped from a claim needs `'decreased'`, approved needs
    `'approved'`;
  - `ledger_entry_within_evidence` and `within_line` (:145-271): the bound is the net approved, not net of recouped,
    which equals post's room;
  - `ledger_line_stage` (20261026090000:216-241);
  - `payer_response` CHECKs (20261023090000:234-259);
  - `payer_response_within_asked`;
  - `service_line` paid, observed and patient_share, and `adjustment` with group, reason and a claim-level null line
    (20261016120000:140-201).

  The Q1 close does need Lane A's migration (the `case`/`case_line` CHECKs), and the design hands it over correctly.
  `case_rules` does not read `ledger_match`.
- **LED-01 to LED-13 are share-free.** Every LED-* 835 carries no PR CAS, apart from LED-06's other patient's claim
  SYNPCNLED06003 (PR-2 10.00). `recoveryPair` and `multiLineRecovery` use `share: 'none'`. LED-09's 1800 =
  3000 × 7800/13000 is unchanged with a net share.
- **The fixture arithmetic for LED-14 to LED-18 adds up:** charge 150.00 = CO-45 + PR + paid on every line. The BPRs
  hold: 24.00, 0.00, 10.00, 30.00, 8.00 and 16.00, and 70.00 (150.00 − 80.00).
- **Worked formulas.** I checked:
  - coinsurance (24.00), deductible whole (none) and in part (10.00), copay (30.00), denied then paid (80.00);
  - LED-12's reversal (30.00);
  - N-5's (a) 24.00, (b) 16.00 and (c) 0.00;
  - an early reversal before B (approved 8, recouped −8, approved 24, recovered 24 = the cash);
  - a late reversal of the original (0);
  - the reversal cap by remaining.
- **The planned paymentOutcome tests (3.6 A2-A4) kill every mutant I tried:** `g−U`→`g`, `>U`→`>=U`, the
  patient-balance branch removed, the decrease cap removed, and `>0`→`>=0`.
- **The rest:**
  - stryker: payment.ts goes into money-ledger's `ledger` list, and the CI commands match mutation.yml:92-98;
  - the engine freeze: nothing under packages/pricing;
  - the #42 files: only the three shared documents plus `matrix.ts`;
  - "billable to the patient" is kept off the headline, the ROI statement, the digest and the CSV, as planned;
  - the copy uses no "recovered" without "posted or deposited", and no AI words.

## Proposals outside this PR (adds to the design's 7.2)
- **A WO against a correction that is then sent again:** decide whether a WO lowers the payment baseline. Today it
  lowers both baselines, and the resend is approved again.

# PR 15b (#51) UX and brand review (head 0e086ed, base 6ddd587)

Verdict: **fix**. One blocking defect: the patient-balance paragraph tells a billing manager the whole allowed increase is the patient's when part of it is not. Two other sentences misstate amounts. Every other new figure reads clearly, stays out of every total and passes the brand's copy rules (`pnpm lint:copy`: "491 files read; the product copy keeps the brand's words", rc 0).

Probes (now deleted; copies kept in /tmp/claude-0/-home-user-PhysicalTherapy/60beef46-8756-559c-bbb4-ddf67ef623a2/scratchpad/pr15b-review/ux-probes/):
- ux-probe2.db.test.ts with fixture LED-15/ux-mixed.835. The original line has allowed 70.00, paid 40.00 and PR-1 30.00. The adjusted line has allowed 100.00, paid 40.00, PR-1 50.00 and CO-253 10.00. Under lineCorrections this gives correction 'patient_balance', billable 2000, otherReduction 1000 and allowedIncrease 3000.
- ux-probe.test.tsx renders LineCorrectionWords with those figures.
- ux-probe.db.test.ts with LED-15/ux-lower.835 disproved a hypothesis of mine (dropped; see the end).

## Findings

### UX-1 (blocking, defect): the patient-balance paragraph says the patient's share "took all of it"
- **Where:** apps/web/src/components/reconciliation/display.tsx, LineCorrectionWords, the 'patient_balance' branch. It shows on Reconciliation lines and case-page lines.
- **The cause:** `patient-share.ts:143` reads a line as 'patient_balance' whenever billable > 0. It does not require billable to equal the allowed increase. The paragraph, though, prints only `allowedIncreaseCents` and "took all of it". It never prints billableCents or otherReductionCents.
- **Probe output, rendered:** "Payer corrected; balance is the patient’s. The payer raised the allowed amount by $30.00 and pays nothing more: the patient’s deductible took all of it." The true patient share is $20.00. The other $10.00 is a CO-253 reduction, which is not billable.
- **Why it matters:** a billing manager reading Reconciliation would bill the patient $30.00. The $20.00 appears only in the case page's Fact.
- **A second wrong case:** with deductible +40.00 and coinsurance −10.00, the paragraph still says "deductible took all of it".
- **Fix:** lead with "Billable to the patient: {billable} ({signed reasons})", as the ordinary paragraph does. Say "took all of it" only when billable == allowedIncrease and otherReduction == 0. Otherwise add "{otherReduction} was reduced by the payer for other reasons, not billable". Add the mixed case to display.test.tsx and a DB case (the LED-15 variant above).

### UX-2 (should_fix, defect): the other-reductions paragraph says "reduced its payment by the same"
- **Where:** display.tsx, the 'other_reductions' branch.
- **Problem:** the reading is 'other_reductions' when the share change is ≤ 0. If the patient's share fell, the payer's other reductions are larger than the allowed increase.
- **Probe output:** for allowed +30.00 and deductible −10.00 (otherReduction 40.00), it renders "raised the allowed amount by $30.00 and reduced its payment by the same for other reasons".
- **Fix:** print otherReductionCents, and the fall in the patient's share when there is one.

### UX-3 (should_fix, improvement): a patient-balance case still reads as a $30.00 dispute and offers no next step
- **Screens:** /tmp/claude-0/-home-user-PhysicalTherapy/60beef46-8756-559c-bbb4-ddf67ef623a2/scratchpad/pr15b-review/tour-after/png/led15.case.1280.png, /tmp/claude-0/-home-user-PhysicalTherapy/60beef46-8756-559c-bbb4-ddf67ef623a2/scratchpad/pr15b-review/tour-after/png/led15.case.390.png and /tmp/claude-0/-home-user-PhysicalTherapy/60beef46-8756-559c-bbb4-ddf67ef623a2/scratchpad/pr15b-review/tour-after/png/led15.audit-report.1280.png.
- **What it shows:** Actionable $30.00 sits beside Billable to the patient $30.00, with "Build the packet" offered. The audit report counts the case under Actionable cases.
- Q1 keeps the line actionable until Lane A's stored close, labelled. The label says what happened but not what to do.
- **Fix:** keep the figures as ruled. Add to the line paragraph and the chip's case: "Bill the balance to the patient in the practice-management system; a packet would ask the payer for what it has already allowed." Add the same note to the Packet and dispute card when corrections.patientBalance is true.

### UX-4 (should_fix, improvement): the response-form label and its hint disagree
- **Screens:** /tmp/claude-0/-home-user-PhysicalTherapy/60beef46-8756-559c-bbb4-ddf67ef623a2/scratchpad/pr15b-review/tour-after/png/led18.case-submissions.1280.png and /tmp/claude-0/-home-user-PhysicalTherapy/60beef46-8756-559c-bbb4-ddf67ef623a2/scratchpad/pr15b-review/tour-after/png/led18.case-submissions.390.png.
- **Words:** the label is "Amount the payer will pay", which reads as the whole payment. The hint says "The additional payment the letter states".
- **Fix:** label it "Additional amount the payer will pay (accepted or partial only, dollars)". The `aria-describedby="amount-hint"` is present and correct.

### UX-5 (nit, improvement): the case page shows "Billable to the patient $0.00" on every case
- **Where:** cases/[caseId]/page.tsx, the new Fact. It renders unconditionally.
- **Effect:** every share-free case (all of LED-01 to LED-13 and today's customers) gets a $0.00 figure and a note about corrections that never happened.
- **Fix:** render the Fact only when billableCents > 0 or some line has a correction, as LineCorrectionWords already does.

### UX-6 (nit, defect): the sign of a signed amount is outside the mono figure
- **Where:** display.tsx, `Signed`.
- **Problem:** "+" and "−" render in the body font beside the mono Money. brand.md says every money figure is mono with tabular numerals.
- **Fix:** put the sign inside the mono span, and use a non-breaking space between the reason word and the amount. At 390 px, "coinsurance" and "+$6.00" break onto two lines (/tmp/claude-0/-home-user-PhysicalTherapy/60beef46-8756-559c-bbb4-ddf67ef623a2/scratchpad/pr15b-review/tour-after/png/led14.reconciliation-case.390.png).

### UX-7 (nit, improvement): the Reports screen and the PDF word "no approval" differently
- **The difference:** with no approval, the Reports screen note is still "no payer approval was recorded yet" (reports/display.tsx). The PDF now says "what payers have agreed to pay on the lines they corrected; no payer approval is recorded yet" (/tmp/claude-0/-home-user-PhysicalTherapy/60beef46-8756-559c-bbb4-ddf67ef623a2/scratchpad/pr15b-review/tour-after/png/led15.audit-report.1280.png against /tmp/claude-0/-home-user-PhysicalTherapy/60beef46-8756-559c-bbb4-ddf67ef623a2/scratchpad/pr15b-review/tour-after/png/led15.audit-report-pdf.page2.1280.png).
- **Fix:** use one wording on both.

### UX-8 (nit, improvement): a line with no entries shows an empty table
- **Screen:** /tmp/claude-0/-home-user-PhysicalTherapy/60beef46-8756-559c-bbb4-ddf67ef623a2/scratchpad/pr15b-review/tour-after/png/led15.reconciliation-case.1280.png.
- **What it shows:** the line's entries table renders headers with no rows. EntryTable has no empty state. The state predates this PR, but a patient-balance line now reaches it as an ordinary outcome.
- **Fix:** "No entry on this line: the correction paid nothing more."

### UX-9 (nit, improvement): the Payer approved tile note keeps growing
- **Screens:** /tmp/claude-0/-home-user-PhysicalTherapy/60beef46-8756-559c-bbb4-ddf67ef623a2/scratchpad/pr15b-review/tour-after/png/led14.reconciliation-case.1280.png and /tmp/claude-0/-home-user-PhysicalTherapy/60beef46-8756-559c-bbb4-ddf67ef623a2/scratchpad/pr15b-review/tour-after/png/led18.abstraction-ledger.1280.png.
- **What it shows:** at 1280 px the note now runs 11 lines in the narrow tile (10 before), and it sets the height of all six tiles.
- **Fix:** keep the tile note short ("what payers agreed to pay, never the patient's share; recovered only once posted or deposited"). Move the reversal detail to the help text.

### UX-10 (nit, improvement): the allocation sentence is awkward
- **Words:** "The patient’s share is the claim’s, allocated to the line by charge ($X of $Y)." The tour did not reach this state.
- **Fix:** "The payer reported the patient's share for the whole claim; it is split to this line by charge ($X of $Y)."

## Screens judged (before, then after)
- **Dashboard** (/tmp/claude-0/-home-user-PhysicalTherapy/60beef46-8756-559c-bbb4-ddf67ef623a2/scratchpad/pr15b-review/tour-before/png/led14.dashboard.1280.png, /tmp/claude-0/-home-user-PhysicalTherapy/60beef46-8756-559c-bbb4-ddf67ef623a2/scratchpad/pr15b-review/tour-after/png/led14.dashboard.1280.png, /tmp/claude-0/-home-user-PhysicalTherapy/60beef46-8756-559c-bbb4-ddf67ef623a2/scratchpad/pr15b-review/tour-after/png/led14.dashboard.390.png): Payer approved goes from $30.00 to $24.00. The note wraps to 3 lines and is clear. Billable is correctly absent from the headline. Fine at 390.
- **Reconciliation, case filter** (led14/led15/led18 reconciliation-case at 1280 and 390):
  - The ERA words "higher allowed: approved; the payer pays $24.00 more" are clear.
  - The billable paragraph puts allowed, then payment, then the patient's share, in that order, says "counted in no total", and sits in a dashed box (not a figure tile), so it is clearly not part of any total.
  - LED-15 "Payer corrected; balance is the patient’s" is calm and clear; see UX-1 and UX-3 for its gaps.
- **Reconciliation** (led15.reconciliation.1280): Ledger totals carry no billable figure, which is right.
- **Case page** (led14/15/18 case at 1280 and 390):
  - The new Fact aligns with the grid.
  - The neutral chip is text on tint (ADR 0056) and fits at 390.
  - The chip sits inside the h1, as CaseStateBadge already does, so the heading's accessible name grows. Acceptable by precedent.
  - Recovered keeps its proof level ("Recovered (deposited)", "stage five: cash deposited, proved by the bank export").
  - The line chip reads "Recovered (posted or deposited)", the generic stageLabel. That predates this PR.
- **Submissions** (led18 at 1280 and 390): the label, the hint and the listing "$24.00 the payer will pay (Payer approved once …)" all read clearly. See UX-4.
- **Reports list, audit report and PDF** (led15.audit-report.1280, led15.audit-report-pdf.page1/2): the State "Open; payer corrected, balance is the patient’s" shows in both case tables. The PDF's case table is on page 3, which was not captured, so it was judged from html.ts and report.test.ts.
- **ROI statement** (led14 roi-statement at 1280, before and after): only the value changes ($30.00 to $24.00), with no billable figure, which is right. The statement still shows $24.00 "payer approved, not yet at the proof level" even though the deposit is dated 2026-06-09. It was written by the reconcile before the EFT export loaded. That is outside this lens, so it goes to the engine reviewer.
- **Specialist's ledger review** (led18.abstraction-ledger.1280): the tour did not reach the shortfall, so it was judged from code. The words are amounts only (phi = false) and are actionable.
- **PHI gate:** correctionView sets reasons to null when phi is false, so ShareReasons shows "the patient’s share" and roseWords shows "share". The specialist route passes amounts only.
- **Not captured** (cases/claims/remittances/monthly/digests, LED-16/17): values-only routes, judged from code. They show no new words.

## Checked and dropped
- I suspected that "lower allowed: nothing taken back, the payment did not fall" could show when the payment did fall. The probe (LED-15/ux-lower.835: allowed 60.00, paid 30.00, nothing approved) gave outcome no_change, never payment_did_not_fall, so the claim is not reproducible. Separately, that line then reads "no change" although the payer paid $10.00 less. That behaviour predates this PR.

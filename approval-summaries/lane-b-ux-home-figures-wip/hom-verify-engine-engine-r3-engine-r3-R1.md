# verify engine-r3-R1 (Recovered since-date from a recoupment) -- DONE
Clone: scratchpad/vR3 at 87691be4.
Checked:
- statements.ts:66-72 firstOn = min effectiveOn over toDate.entryIds.recovered; totals.ts:118 puts recouped ids there. Mechanics as the finding states (also r3-probe.json: -4000 / 2026-06-09).
- packages/ledger unchanged by the PR; recovered = proof stage + recouped is PRD 13 (PRD.md:537,548,356), pre-existing.
- Design D7 (lane-b-ux-home-figures.md:159-161) and F8 (:372) prescribe exactly this: date = earliest effective_on of the entries the to-date figure sums; rejected only approvals. HOM-01 test (recovered-periods.test.ts:64-68,88-89) encodes it.
- Proposed fix makes the note contradict the figure: "-$40.00 to date, nothing deposited yet" next to a figure whose linked entry is the 06-09 recoupment; and "since 08-01" over a sum that includes a 06-09 entry (Reconciliation lists an entry before the "since" date).
- Scenario realism: recoupment needs a prior payment; at deposited level it is the transient window before the bank export is loaded; the negative figure itself is PRD semantics, not this PR.
Verdict: not a defect (code matches approved design; since-date truthfully dates the summed figure; fix is worse).

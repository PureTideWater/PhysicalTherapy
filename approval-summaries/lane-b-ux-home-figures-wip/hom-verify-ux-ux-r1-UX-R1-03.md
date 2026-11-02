# Verify ux-r1-UX-R1-03 (HOM-04 loose assertions), PR #93 at 87691be4
Checked:
- apps/web/e2e/reconciliation.spec.ts:222-252 at 87691be4: amount read from tile, only /^\$\d.../; note regex with optional clause (either cause). Confirmed loose.
- PR body line 111: claims LED-06 world gives $30.00, 1 line, nothing out. Source is reconciliation-routes.db.test.ts:420 (db world, not the browser chain).
- Practice is the spec's own (ledgerPractice, e2e/ledger.ts:26), not shared.
- Screen tour after (/home/user/screens at 87691be4) populated by running this same spec whole; p.home.default captured 4s after populate, first LEDGER shot: tile reads $0.00, "0 lines in cases still being worked; out of the figure: 1 line whose pricing is no longer current". Later steps (reversal, viewer, specialist) do not re-price.
Verdict: real, should-fix. But the finding's fix ($30.00, no clause) is likely wrong for the browser world: pin $0.00 and the stale clause (design §4), correct PR body line 111; if values race, settle the chain first.

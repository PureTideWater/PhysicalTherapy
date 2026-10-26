# recheck-ux progress
started; head 35137603
- diff 83ed5743..35137603 read; unit tests read. Code logic of UX-1,2,5,6,7,9,10 OK.
- 390 overflows (roi, audit-report, reconciliation 405) all predate (tour-before same widths): not regressions.
- led15mixed.reconciliation-case.1280: UX-1/3/6/8/9 visible and correct; tiles shorter.
- led15mixed.reconciliation-case.390: FINDING UX-8 empty row clipped at 390 ("...paid nothing mor") inside overflow-x-auto table, sentence cut at viewport edge.
- possible nit: other_reductions branch ignores earlier paymentIncrease (no Pays); "No entry on this line yet." for kind null.
- led15.reconciliation-case.390: same UX-8 clipping confirmed.
- led15mixed.case 1280/390: UX-1/3 OK, Fact OK, next-step in Packet and dispute card.
- led14.reconciliation-case.390: UX-6 OK ("(coinsurance +$6.00)" wraps as one), UX-9 tiles short + help.
- led18.case-submissions-form.390: UX-4 label OK.
- led18.abstraction-ledger.1280: UX-9 help on specialist screen OK.
- led15.audit-report.1280: UX-7 OK.
- led18.case.1280: no regression.
- Verdict: fix (UX-8 390 clipping; low: other_reductions branch lacks Pays when chain paid part).

# recheck2-ux progress
started; head 9b0bcd2d
- RX-1/RX-2 commit read. RX-2 arithmetic OK (30=10+20; X=P+O-F). Concern: other_reductions header 'it pays nothing more' next to cumulative 'pays $10.00 of it' (billable is chain-cumulative, kind from latest match); 'No ledger entry is written' while an earlier match wrote one.
- RX-1 code OK: <p> outside overflow-x-auto, parent <li> not scrolling; jsdom has no layout so a narrow render proves nothing more. Locator kept.
- Probing: kind from latest match vs billable cumulative -> other_reductions with cumulative share rose / patient_balance with cumulative share fell may not add up. Writing scratch test.
- CONFIRMED by scratch render (removed): (a) other_reductions + cumulative share +10: 'raised by $50.00 and reduced its payment by $40.00' — $10 billable omitted, does not add up. (b) patient_balance + cumulative share fell (billable 0): 'Billable $0.00 ... raised $30.00 ... $0.00 is the patient's share, and $40.00 was reduced' + 'Bill the balance' — does not add up. (c) RX-2 text OK arithmetic but 'pays nothing more' beside 'pays $10.00 of it' and 'No ledger entry is written' while earlier match wrote one.
- CONFIRMED (d): kind-null branch with negative otherReductionCents prints '-$5.00 was reduced by the payer' (hyphen, 'of the rest' when rest is zero); patient_balance uses OtherReductions 'fell by' but this branch does not.
- Shots led15/led15mixed reconciliation-case.390 viewed: sentences add up (30=0+20+10; 30=30), brand OK (mono money, no bare recovered); the empty row there is the pre-RX-1 table row (clipped), superseded by the <p> in code.
- Brand/CO-11: no AI/owed/recovered-unlabelled terms in new sentences; money via Money/Signed mono.
- Verdict: fix ((a),(b) medium; (d) medium-low; (c) low).

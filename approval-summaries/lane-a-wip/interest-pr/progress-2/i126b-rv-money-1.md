# i126b rv-money round 1 (delta c49367c5..d2fdd106 first-parent)
## checked
## found
- install ok; read interest.ts head; d2fdd106 test logic checked (kills ===->true in order 1, !== )
- INT-REL-2 refactor re-checked: equivalent (matches readonly in providerAdjustments; latestOf; entriesOf; holdings only for take-back draws -> interestWrites ignores takenBack for + draws)
- CANDIDATE F1: LED-R2 fix only orders within one interestWrites call. Out-of-order upload (loader adoptOrphanReversals, loader.ts:561) -> reconcile 1 take-back holds nothing, payment written on L1/L2; reconcile 2 B credits chain a on L1/L2, A's take-back blocked (reached) -> 11.40 vs 6.00. ADR 'never an overstatement' false. Need proof (unit two-step + maybe db).

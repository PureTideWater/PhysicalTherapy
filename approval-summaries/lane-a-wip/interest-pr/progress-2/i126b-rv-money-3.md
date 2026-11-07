# i126b rv-money round 3 (delta c49367c5..d2fdd106 first-parent) -- third attempt
## carried: i126-rv-money.md (INT-REL-2 equivalent), i126b-rv-money-1.md (candidate F1 out-of-order upload cross-pass)
## checked
## found
- clone rv2-money-3 at d2fdd106, install ok
- INT-REL-2 equivalence re-checked: matches = fresh ledgerMatches() right before providerAdjustments (remittances.ts:1162), readonly, recoupment branch never pushes/reverses a claim match; case_line_once unique(service_line_id) so byLine==lines order; latestOf==last standing; entriesOf==old filter; holdings only for take-back L6 (takenBack unused for + draws). EQUIVALENT.

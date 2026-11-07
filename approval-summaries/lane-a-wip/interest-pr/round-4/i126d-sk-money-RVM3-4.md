# i126d skeptic RVM3-4 (head 98bb9c00)
VERDICT: real=false (refuted; documentation completeness nit, not a defect)
- Code facts hold: practice.home oneSnapshot; reads ledger_entry (practiceRecoveredPeriods -> ledgerEntries) then ledger_match (queuesOf -> unmatchedItems NOT EXISTS ledger_match); empty view inflates the Unmatched queue COUNT only; Home's money figures come from ledger_entry (not rewritten) and are unaffected.
- Premise fails: texts are explicitly non-exhaustive: runbook "any open transaction that has read either table refuses a try, a plain read included: a page that reads the ledger (...)", "(REPEATABLE READ: Reconciliation among them)"; header "a page reading the ledger", "Reconciliation among them"; ADR D16 "the ledger's readers and writers", "Reconciliation among them".
- Effect already described generically ("shows the ledger's entries with no matches"); Reconciliation itself calls unmatchedItems (queries.ts:586) so the all-unmatched effect is the same class; case page and ledger review page comment they read as Reconciliation does.
- Only closed-sounding list is runbook :335 (diagnosis of a failed lock loop); remedy (rerun at quieter hour outside working hours, no reconcile) is identical with Home; no operator action changes.
- No test cited; none run. Clone removed.

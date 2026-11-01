# engine-r1-E3 verify (87691be4) - DONE
Verdict: real, nit (resolved/closed part). Partial-case part refuted: pursuitCost() is a fixed per-case estimate (minutesPerPacket+minutesPerFollowUp), not per line.
- queries.ts:377 net = netExpectedValue(actionable_now_cents, pursuit); was actionable_cents (stored ask) at base 43565235 -> regression introduced by this PR on resolved cases.
- ACTIONABLE_NOW_OF counts only lines at stage actionable & current -> 0 on resolved/closed cases; pursuit_cost_cents stored at case insert, never cleared.
- page.tsx:115-125 shows Money + "(actionable less the pursuit cost)"; '—' only when null.
- ADR 0082 D5 (line 85) and consequence (147) accept negative "when nothing is left to pursue" - meant for cases still worked; silent on resolved/closed.
- Audit report per-case net (report/content.ts:906) has same behaviour, pre-existing.
Fix: null for resolved/closed_written_off, page says why (not bare '—', which already means "not estimated").

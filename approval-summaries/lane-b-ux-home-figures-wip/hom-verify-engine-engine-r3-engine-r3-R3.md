# verify engine-r3-engine-r3-R3 (stale comments omit causes) at 87691be4
Checked: queries.ts:52, actionable-now.ts:56 (both added by this PR) list only priced again / release withdrawn / version no longer in force.
priced_line_pricing_check (migration 20261103090000:659-702, only definition) returns 5 causes incl MAPPING_NOT_IN_FORCE (:691) and CONTRACT_VERSION_NOT_SIGNED_OFF (:696).
stale = actionable AND NOT (check = 'current') (actionable-now.ts:36,74) so every cause counts.
Also actionable-now.ts:4-6 file header (added by PR) omits the mapping cause; lists signed-off and covering.
PRICING_CHECK_RESULTS at packages/db/src/schema/packets.ts:35.
Verdict: real, nit. Fix: both field comments + header name the mapping cause; or point to PRICING_CHECK_RESULTS.

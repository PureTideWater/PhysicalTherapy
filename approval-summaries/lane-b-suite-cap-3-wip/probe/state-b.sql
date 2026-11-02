-- 4. claim_by_superseded, under the SHARE lock held since section 2
-- ---------------------------------------------------------------------------------------------------

-- claimLines' correction chain (apps/worker/src/reconcile/remittances.ts) looks claims up by the claim they
-- supersede; the twin of claim_by_reversed (docs/adr/0083).
CREATE INDEX claim_by_superseded ON claim (superseded_by_claim_id) WHERE superseded_by_claim_id IS NOT NULL;


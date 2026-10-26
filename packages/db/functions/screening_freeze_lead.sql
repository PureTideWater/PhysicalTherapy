-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- screening_freeze_lead(uuid,uuid,text,boolean,text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 0621e0dd445907d7
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.screening_freeze_lead(run uuid, request_id uuid, withdrawal_token_sha256 text, keep_consent boolean, request text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  target screening_run%ROWTYPE;
  prospect screening_prospect%ROWTYPE;
  upload screening_upload%ROWTYPE;
  created uuid;
BEGIN
  SELECT r.* INTO target FROM screening_run r WHERE r.id = $1 AND r.status = 'complete';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'a screening summary is kept from a complete run' USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_lead_basis';
  END IF;
  SELECT u.* INTO upload FROM screening_upload u WHERE u.id = target.upload_id;
  SELECT p.* INTO prospect FROM screening_prospect p WHERE p.id = upload.prospect_id;
  IF $4 AND prospect.followup_consent_sha256 IS NOT NULL AND $3 IS NULL THEN
    RAISE EXCEPTION 'a summary kept by consent has a withdrawal link' USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_lead_withdrawal_token';
  END IF;
  INSERT INTO screening_lead (upload_id, practice_name, state, zip, contact_email, source, utm_source, utm_medium, utm_campaign, paid_click, referring_firm,
                              consent_sha256, withdrawal_token_sha256, prospect_request_id, release_no, release_manifest_sha256, engine_version, labels_version,
                              screened_at, result_first_opened_at, row_count, claim_lines, observed_cents, anomaly_rows, left_out_rows, left_out_claim_lines,
                              left_out_allowed_cents, expires_at)
  SELECT upload.id, prospect.practice_name, prospect.state, prospect.zip, prospect.contact_email, prospect.source, prospect.utm_source, prospect.utm_medium,
         prospect.utm_campaign, prospect.paid_click, prospect.referring_firm, CASE WHEN $4 THEN prospect.followup_consent_sha256 END,
         CASE WHEN $4 AND prospect.followup_consent_sha256 IS NOT NULL THEN $3 END, $2, target.release_no, target.release_manifest_sha256,
         target.engine_version, screening_labels_version(), upload.created_at, target.first_opened_at, t.all_rows, t.all_claims, t.all_observed, t.anomalies,
         upload.left_out_rows,
         CASE WHEN upload.left_out_claim_lines >= 11 THEN upload.left_out_claim_lines END,
         CASE WHEN upload.left_out_claim_lines >= 11 THEN upload.left_out_allowed_cents END,
         upload.created_at + interval '12 months'
    FROM (SELECT count(*)::integer AS all_rows, coalesce(sum(s.claim_count), 0)::bigint AS all_claims, coalesce(sum(s.observed_allowed_cents), 0)::bigint AS all_observed,
                 (count(*) FILTER (WHERE s.disposition = 'priced'
                                     AND screening_standing(s.expected_cents, s.reduced_cents, s.observed_allowed_cents, s.claim_count) = 'anomaly'))::integer AS anomalies
            FROM screening_result s WHERE s.run_id = target.id) t
  RETURNING id INTO created;
  INSERT INTO screening_lead_product (lead_id, payer_product, row_count, claim_lines, observed_cents, priced_rows, priced_claim_lines, priced_observed_cents,
                                      expected_cents, lowest_cents, pooled_rows, anomaly_rows, could_not_price_rows, could_not_price_claim_lines,
                                      could_not_price_observed_cents)
  SELECT created, s.payer_product, count(*)::integer, sum(s.claim_count)::bigint, sum(s.observed_allowed_cents)::bigint,
         count(*) FILTER (WHERE s.disposition = 'priced')::integer,
         coalesce(sum(s.claim_count) FILTER (WHERE s.disposition = 'priced'), 0)::bigint,
         coalesce(sum(s.observed_allowed_cents) FILTER (WHERE s.disposition = 'priced'), 0)::bigint,
         coalesce(sum(s.expected_cents) FILTER (WHERE s.disposition = 'priced'), 0)::bigint,
         coalesce(sum(coalesce(s.reduced_cents, s.expected_cents)) FILTER (WHERE s.disposition = 'priced'), 0)::bigint,
         count(*) FILTER (WHERE s.disposition = 'priced' AND s.in_reduction_pool)::integer,
         count(*) FILTER (WHERE s.disposition = 'priced' AND screening_standing(s.expected_cents, s.reduced_cents, s.observed_allowed_cents, s.claim_count) = 'anomaly')::integer,
         count(*) FILTER (WHERE s.disposition IN ('unpriced', 'rates_change_in_band'))::integer,
         coalesce(sum(s.claim_count) FILTER (WHERE s.disposition IN ('unpriced', 'rates_change_in_band')), 0)::bigint,
         coalesce(sum(s.observed_allowed_cents) FILTER (WHERE s.disposition IN ('unpriced', 'rates_change_in_band')), 0)::bigint
    FROM screening_result s WHERE s.run_id = target.id
   GROUP BY s.payer_product;
  INSERT INTO audit_event (actor_kind, action, object_type, object_id, purpose, request_id)
  VALUES ('system', 'screening_lead_kept', 'screening_lead', created, 'screening', $5);
  RETURN created;
END;
$function$;
ALTER FUNCTION public.screening_freeze_lead(uuid,uuid,text,boolean,text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.screening_freeze_lead(uuid,uuid,text,boolean,text) FROM PUBLIC;

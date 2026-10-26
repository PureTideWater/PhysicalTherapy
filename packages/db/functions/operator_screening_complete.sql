-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- operator_screening_complete(uuid,text,text,text,text,integer)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 8220d43ccceb8bb4
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.operator_screening_complete(run uuid, token_sha256 text, withdrawal_token_sha256 text, engine text, request text, attempt integer)
 RETURNS TABLE(contact_email text, row_count integer, kept_with text, received_at timestamp with time zone, wait_reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  target screening_run%ROWTYPE;
  prospect screening_prospect%ROWTYPE;
  uploaded timestamptz;
  carried uuid;
BEGIN
  SELECT r.* INTO target FROM screening_run r WHERE r.id = $1 FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no such screening run' USING ERRCODE = 'no_data_found';
  END IF;
  IF target.status = 'complete' THEN
    RETURN;
  END IF;
  IF target.status <> 'pricing' OR target.attempts IS DISTINCT FROM $6 THEN
    RAISE EXCEPTION 'a screening run completes from pricing, by the attempt that claimed it' USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_run_attempt';
  END IF;
  IF now() >= target.expires_at THEN
    RAISE EXCEPTION 'a screening that expired while it was priced does not complete' USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_run_expired';
  END IF;
  IF EXISTS (SELECT 1 FROM screening_result s WHERE s.run_id = target.id AND s.disposition = 'pending') THEN
    RAISE EXCEPTION 'a screening run completes once every row is priced' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE screening_run r SET status = 'complete', result_token_sha256 = $2, completed_at = now(), engine_version = $4 WHERE r.id = target.id;
  INSERT INTO audit_event (actor_kind, action, object_type, object_id, purpose, request_id)
  VALUES ('system', 'screening_completed', 'screening_run', target.id, 'screening', $5);
  -- The counts-only outcome, every figure computed here from the stored rows.
  UPDATE screening_outcome o
     SET stage = 'priced', engine_version = $4,
         priced_share_pct = CASE WHEN t.total = 0 THEN 0 ELSE (100 * t.priced / t.total)::smallint END,
         contract_share_pct = CASE WHEN t.total = 0 THEN 0 ELSE (100 * t.contract / t.total)::smallint END,
         could_not_price_share_pct = CASE WHEN t.total = 0 THEN 0 ELSE (100 * t.could_not_price / t.total)::smallint END,
         not_screened_share_pct = CASE WHEN t.total = 0 THEN 0 ELSE (100 * t.not_screened / t.total)::smallint END,
         anomaly_band = screening_count_band(t.anomalies), anomaly_difference_band = screening_difference_band(t.anomaly_gap)
    FROM (SELECT coalesce(sum(s.observed_allowed_cents), 0)::bigint AS total,
                 coalesce(sum(s.observed_allowed_cents) FILTER (WHERE s.disposition = 'priced'), 0)::bigint AS priced,
                 coalesce(sum(s.observed_allowed_cents) FILTER (WHERE s.disposition = 'contract_required'), 0)::bigint AS contract,
                 coalesce(sum(s.observed_allowed_cents) FILTER (WHERE s.disposition IN ('unpriced', 'rates_change_in_band')), 0)::bigint AS could_not_price,
                 coalesce(sum(s.observed_allowed_cents) FILTER (WHERE s.disposition = 'not_screened'), 0)::bigint AS not_screened,
                 count(*) FILTER (WHERE s.disposition = 'priced' AND screening_standing(s.expected_cents, s.reduced_cents, s.observed_allowed_cents, s.claim_count) = 'anomaly') AS anomalies,
                 sum(coalesce(s.reduced_cents, s.expected_cents) - s.observed_allowed_cents)
                   FILTER (WHERE s.disposition = 'priced' AND screening_standing(s.expected_cents, s.reduced_cents, s.observed_allowed_cents, s.claim_count) = 'anomaly')::bigint AS anomaly_gap
            FROM screening_result s WHERE s.run_id = target.id) t
   WHERE o.upload_id = target.upload_id AND o.stage = 'accepted';
  SELECT u.created_at INTO uploaded FROM screening_upload u WHERE u.id = target.upload_id;
  SELECT p.* INTO prospect FROM screening_upload u JOIN screening_prospect p ON p.id = u.prospect_id WHERE u.id = target.upload_id;
  -- The practice's kept summaries screened before this upload go, each an audit event; the request of the latest of
  -- the same ZIP and practice name this deletion took that carries one goes over. A request whose summary matched by
  -- the contact address alone keeps no summary (screening_lead_left_request). A summary another completion deleted
  -- first is not among them.
  WITH replaced AS (
    DELETE FROM screening_lead l
     WHERE l.screened_at < uploaded
       AND (l.contact_email = prospect.contact_email OR (l.zip = prospect.zip AND screening_practice_key(l.practice_name) = screening_practice_key(prospect.practice_name)))
    RETURNING l.id, l.prospect_request_id, l.screened_at,
              (l.zip = prospect.zip AND screening_practice_key(l.practice_name) = screening_practice_key(prospect.practice_name)) AS same_practice
  ), recorded AS (
    INSERT INTO audit_event (actor_kind, action, object_type, object_id, purpose, request_id)
    SELECT 'system',
           CASE WHEN replaced.prospect_request_id IS NOT NULL AND NOT replaced.same_practice THEN 'screening_lead_left_request' ELSE 'screening_lead_replaced' END,
           CASE WHEN replaced.prospect_request_id IS NULL THEN 'screening_lead' ELSE 'prospect_request' END,
           coalesce(replaced.prospect_request_id, replaced.id), 'screening', $5
      FROM replaced
    RETURNING 1
  )
  SELECT replaced.prospect_request_id INTO carried FROM replaced
   WHERE replaced.prospect_request_id IS NOT NULL AND replaced.same_practice
   ORDER BY replaced.screened_at DESC, replaced.id DESC LIMIT 1;
  IF prospect.followup_consent_sha256 IS NOT NULL OR carried IS NOT NULL THEN
    PERFORM screening_freeze_lead(target.id, carried, $3, true, $5);
  END IF;
  RETURN QUERY SELECT prospect.contact_email, target.row_count,
                      CASE WHEN carried IS NOT NULL THEN 'earlier_request' WHEN prospect.followup_consent_sha256 IS NOT NULL THEN 'consent' ELSE 'none' END,
                      target.received_at, target.wait_reason;
END;
$function$;
ALTER FUNCTION public.operator_screening_complete(uuid,text,text,text,text,integer) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.operator_screening_complete(uuid,text,text,text,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.operator_screening_complete(uuid,text,text,text,text,integer) TO tp_operator;
GRANT EXECUTE ON FUNCTION public.operator_screening_complete(uuid,text,text,text,text,integer) TO tp_screening;

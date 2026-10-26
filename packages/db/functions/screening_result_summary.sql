-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- screening_result_summary(text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: fb9b9c255c87b3fd
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.screening_result_summary(token_sha256 text)
 RETURNS TABLE(run_id uuid, practice_name text, state text, zip text, release_no integer, engine_version text, created_at timestamp with time zone, expires_at timestamp with time zone, rows integer, claim_lines bigint, observed_cents bigint, priced_rows integer, priced_claim_lines bigint, expected_cents bigint, priced_observed_cents bigint, difference_cents bigint, pooled_rows integer, reduced_cents bigint, reduced_difference_cents bigint, contract_rows integer, contract_claim_lines bigint, contract_observed_cents bigint, not_screened_rows integer, not_screened_claim_lines bigint, not_screened_observed_cents bigint, unpriced_rows integer, unpriced_claim_lines bigint, unpriced_observed_cents bigint, left_out_rows integer, left_out_claim_lines bigint, left_out_observed_cents bigint, converted boolean, release_withdrawn boolean, kept_with text, outside_content_rows integer, outside_content_claim_lines bigint, outside_content_observed_cents bigint, zip_plus_four text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT r.id, p.practice_name, p.state, p.zip, r.release_no, r.engine_version, r.created_at, r.expires_at,
         t.all_rows, t.all_claims, t.all_observed,
         t.priced_rows, t.priced_claims, t.priced_expected, t.priced_observed, t.priced_difference,
         t.pooled_rows, t.priced_reduced, t.priced_reduced_difference,
         t.contract_rows, t.contract_claims, t.contract_observed,
         t.not_screened_rows, t.not_screened_claims, t.not_screened_observed,
         t.unpriced_rows, t.unpriced_claims, t.unpriced_observed,
         u.left_out_rows, u.left_out_claim_lines::bigint, u.left_out_allowed_cents,
         r.converted_at IS NOT NULL,
         EXISTS (SELECT 1 FROM rule_release_withdrawal w WHERE w.release_no = r.release_no),
         -- Whether this screening's summary is kept (screening_lead), and with what: the audit request made from it, an
         -- earlier screening's request it took over (decision 17), or consent; 'none' when it is not kept.
         coalesce((SELECT CASE WHEN l.prospect_request_id IS NULL THEN 'consent'
                               WHEN l.prospect_request_id = r.converted_prospect_request_id THEN 'own_request'
                               ELSE 'earlier_request' END
                     FROM screening_lead l WHERE l.upload_id = r.upload_id), 'none'),
         u.outside_content_rows, u.outside_content_claim_lines, u.outside_content_allowed_cents, p.zip_plus_four
    FROM screening_run r
    JOIN screening_upload u ON u.id = r.upload_id
    JOIN screening_prospect p ON p.id = u.prospect_id
    CROSS JOIN LATERAL (
      SELECT count(*)::integer AS all_rows,
             coalesce(sum(s.claim_count), 0)::bigint AS all_claims,
             coalesce(sum(s.observed_allowed_cents), 0)::bigint AS all_observed,
             count(*) FILTER (WHERE s.disposition = 'priced')::integer AS priced_rows,
             coalesce(sum(s.claim_count) FILTER (WHERE s.disposition = 'priced'), 0)::bigint AS priced_claims,
             coalesce(sum(s.expected_cents) FILTER (WHERE s.disposition = 'priced'), 0)::bigint AS priced_expected,
             coalesce(sum(s.observed_allowed_cents) FILTER (WHERE s.disposition = 'priced'), 0)::bigint AS priced_observed,
             coalesce(sum(s.difference_cents) FILTER (WHERE s.disposition = 'priced'), 0)::bigint AS priced_difference,
             count(*) FILTER (WHERE s.disposition = 'priced' AND s.in_reduction_pool)::integer AS pooled_rows,
             -- The lowest figures: the fully reduced one for a code in the reduction across codes, the one figure otherwise.
             coalesce(sum(coalesce(s.reduced_cents, s.expected_cents)) FILTER (WHERE s.disposition = 'priced'), 0)::bigint AS priced_reduced,
             coalesce(sum(coalesce(s.reduced_difference_cents, s.difference_cents)) FILTER (WHERE s.disposition = 'priced'), 0)::bigint AS priced_reduced_difference,
             count(*) FILTER (WHERE s.disposition = 'contract_required')::integer AS contract_rows,
             coalesce(sum(s.claim_count) FILTER (WHERE s.disposition = 'contract_required'), 0)::bigint AS contract_claims,
             coalesce(sum(s.observed_allowed_cents) FILTER (WHERE s.disposition = 'contract_required'), 0)::bigint AS contract_observed,
             count(*) FILTER (WHERE s.disposition = 'not_screened')::integer AS not_screened_rows,
             coalesce(sum(s.claim_count) FILTER (WHERE s.disposition = 'not_screened'), 0)::bigint AS not_screened_claims,
             coalesce(sum(s.observed_allowed_cents) FILTER (WHERE s.disposition = 'not_screened'), 0)::bigint AS not_screened_observed,
             count(*) FILTER (WHERE s.disposition IN ('unpriced', 'rates_change_in_band'))::integer AS unpriced_rows,
             coalesce(sum(s.claim_count) FILTER (WHERE s.disposition IN ('unpriced', 'rates_change_in_band')), 0)::bigint AS unpriced_claims,
             coalesce(sum(s.observed_allowed_cents) FILTER (WHERE s.disposition IN ('unpriced', 'rates_change_in_band')), 0)::bigint AS unpriced_observed
        FROM screening_result s WHERE s.run_id = r.id) t
   WHERE r.result_token_sha256 = token_sha256 AND r.status = 'complete' AND now() < r.expires_at
$function$;
ALTER FUNCTION public.screening_result_summary(text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.screening_result_summary(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.screening_result_summary(text) TO tp_app;

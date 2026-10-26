-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- screening_result_rows(text,integer)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 1fc6b8482bf8d179
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.screening_result_rows(token_sha256 text, top integer)
 RETURNS TABLE(row_no integer, procedure_code text, modifiers text[], units integer, place_of_service text, payer_product text, service_band text, claim_count integer, observed_allowed_cents bigint, expected_line_cents bigint, expected_cents bigint, difference_cents bigint, in_reduction_pool boolean, reduced_line_cents bigint, reduced_cents bigint, reduced_difference_cents bigint, standing text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT s.row_no, s.procedure_code, s.modifiers, s.units, s.place_of_service, s.payer_product, s.service_band, s.claim_count, s.observed_allowed_cents,
         s.expected_line_cents, s.expected_cents, s.difference_cents, s.in_reduction_pool, s.reduced_line_cents, s.reduced_cents, s.reduced_difference_cents,
         screening_standing(s.expected_cents, s.reduced_cents, s.observed_allowed_cents, s.claim_count)
    FROM screening_run r JOIN screening_result s ON s.run_id = r.id
   WHERE r.result_token_sha256 = token_sha256 AND r.status = 'complete' AND now() < r.expires_at AND s.disposition = 'priced'
   ORDER BY coalesce(s.reduced_difference_cents, s.difference_cents) DESC, s.row_no
   LIMIT least(greatest(coalesce(top, 0), 0), 100)
$function$;
ALTER FUNCTION public.screening_result_rows(text,integer) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.screening_result_rows(text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.screening_result_rows(text,integer) TO tp_app;

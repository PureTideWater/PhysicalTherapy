-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- operator_screening_rows(uuid,integer,integer,integer)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: ad7e736c4810324f
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.operator_screening_rows(run uuid, after_row integer, at_most integer, attempt integer)
 RETURNS TABLE(row_no integer, procedure_code text, modifiers text[], units integer, place_of_service text, payer_product text, service_band text, claim_count integer, observed_allowed_cents bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT s.row_no, s.procedure_code, s.modifiers, s.units, s.place_of_service, s.payer_product, s.service_band, s.claim_count, s.observed_allowed_cents
    FROM screening_run r JOIN screening_result s ON s.run_id = r.id
   WHERE r.id = $1 AND r.status = 'pricing' AND r.attempts = $4 AND s.disposition = 'pending' AND s.row_no > coalesce($2, 0)
   ORDER BY s.row_no
   LIMIT least(greatest(coalesce($3, 0), 0), 5000)
$function$;
ALTER FUNCTION public.operator_screening_rows(uuid,integer,integer,integer) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.operator_screening_rows(uuid,integer,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.operator_screening_rows(uuid,integer,integer,integer) TO tp_operator;
GRANT EXECUTE ON FUNCTION public.operator_screening_rows(uuid,integer,integer,integer) TO tp_screening;

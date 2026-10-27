-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- screening_result_inserted()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: f556a1e47dc13dee
-- Trigger function of: screening_result.screening_result_inserted
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.screening_result_inserted()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF EXISTS (SELECT 1 FROM screening_inserted a LEFT JOIN screening_run r ON r.id = a.run_id
              WHERE r.status IS DISTINCT FROM 'queued' OR a.disposition NOT IN ('pending', 'contract_required', 'not_screened')) THEN
    RAISE EXCEPTION 'a screening''s rows are inserted with its run, before it is priced' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$function$;
ALTER FUNCTION public.screening_result_inserted() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.screening_result_inserted() FROM PUBLIC;

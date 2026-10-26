-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- model_records_no_truncate()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 89afc300e796c507
-- Trigger function of: eval_example.eval_example_no_truncate
-- Trigger function of: model_call.model_call_no_truncate
-- Trigger function of: model_proposal.model_proposal_no_truncate
CREATE OR REPLACE FUNCTION public.model_records_no_truncate()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  RAISE EXCEPTION '% cannot be truncated: the gateway''s records are kept', TG_TABLE_NAME USING ERRCODE = 'check_violation';
END;
$function$;
ALTER FUNCTION public.model_records_no_truncate() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.model_records_no_truncate() FROM PUBLIC;

-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- eval_example_rules()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 11a31add3dfa4c6d
-- Trigger function of: eval_example.eval_example_rules
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.eval_example_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'an evaluation example is never changed or deleted' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.source = 'permitted' AND NOT data_rights_permit(NEW.permission_ref, NEW.practice_id) THEN
    RAISE EXCEPTION 'a permitted evaluation example rests on the practice''s signed data-rights agreement' USING ERRCODE = 'check_violation';
  END IF;
  NEW.created_at := now();
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.eval_example_rules() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.eval_example_rules() FROM PUBLIC;

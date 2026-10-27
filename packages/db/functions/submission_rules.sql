-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- submission_rules()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 918129137c88ee12
-- Trigger function of: submission.submission_rules
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.submission_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'a submission never changes once logged' USING ERRCODE = 'check_violation';
  END IF;
  NEW.dispute_level := 1 + case_reopened_levels(NEW.case_id);
  NEW.follow_up_on := coalesce(NEW.follow_up_on, NEW.submitted_on + 45);
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.submission_rules() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.submission_rules() FROM PUBLIC;

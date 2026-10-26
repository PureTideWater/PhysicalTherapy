-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- case_line_belongs()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 502a1f501004cfdb
-- Trigger function of: case_line.case_line_belongs
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.case_line_belongs()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  window_end date;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "case" c WHERE c.id = NEW.case_id AND c.practice_id = NEW.practice_id) THEN
    RAISE EXCEPTION 'a case line joins a case of its practice' USING ERRCODE = 'check_violation';
  END IF;
  SELECT p.window_ends_on INTO window_end FROM priced_line p WHERE p.id = NEW.priced_line_id AND p.service_line_id = NEW.service_line_id AND p.practice_id = NEW.practice_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'a case line is a priced line of its own service line and practice' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.written_off_reason IS NOT NULL AND (app_actor_is_person() OR window_end IS NULL OR window_end >= (now() AT TIME ZONE 'UTC')::date) THEN
    RAISE EXCEPTION 'a case line joins its case written off only by triage, because its window has passed' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$function$;
ALTER FUNCTION public.case_line_belongs() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.case_line_belongs() FROM PUBLIC;

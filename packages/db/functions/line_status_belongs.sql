-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- line_status_belongs()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 7ff9c809c72d6495
-- Trigger function of: line_status.line_status_belongs
CREATE OR REPLACE FUNCTION public.line_status_belongs()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.set_by IS NOT NULL AND NEW.set_by IS DISTINCT FROM app_actor_id() THEN
    RAISE EXCEPTION 'a stage is set in its setter''s own name' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM service_line l WHERE l.id = NEW.service_line_id AND l.practice_id = NEW.practice_id) THEN
    RAISE EXCEPTION 'a stage is set on a service line of its practice' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.priced_line_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM priced_line p WHERE p.id = NEW.priced_line_id AND p.service_line_id = NEW.service_line_id AND p.practice_id = NEW.practice_id) THEN
    RAISE EXCEPTION 'a stage is judged from a priced line of its own service line' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$function$;
ALTER FUNCTION public.line_status_belongs() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.line_status_belongs() FROM PUBLIC;

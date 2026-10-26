-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- practice_deleted_at()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: d79ba5c079879579
-- Trigger function of: practice.practice_deleted_at
CREATE OR REPLACE FUNCTION public.practice_deleted_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.status = 'deleted' AND OLD.status <> 'deleted' THEN
    NEW.deleted_at := now();
  ELSIF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
    RAISE EXCEPTION 'a practice''s deletion time is the database''s, set once' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.practice_deleted_at() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.practice_deleted_at() FROM PUBLIC;

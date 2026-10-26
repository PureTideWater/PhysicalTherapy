-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- user_keeps_practice_administrator()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 7067ce3a1c9d553b
-- Trigger function of: user.user_keeps_practice_administrator
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.user_keeps_practice_administrator()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  administered uuid;
BEGIN
  IF OLD.status <> 'disabled' AND NEW.status = 'disabled' THEN
    FOR administered IN SELECT m.organization_id FROM membership m WHERE m.user_id = NEW.id AND m.role = 'practice_admin' AND m.ends_at IS NULL LOOP
      PERFORM assert_organization_keeps_administrator(administered);
    END LOOP;
  END IF;
  RETURN NULL;
END;
$function$;
ALTER FUNCTION public.user_keeps_practice_administrator() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.user_keeps_practice_administrator() FROM PUBLIC;

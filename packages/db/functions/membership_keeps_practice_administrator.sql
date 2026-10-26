-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- membership_keeps_practice_administrator()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 974ecfab878a2e77
-- Trigger function of: membership.membership_keeps_practice_administrator
CREATE OR REPLACE FUNCTION public.membership_keeps_practice_administrator()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF OLD.role = 'practice_admin' AND OLD.ends_at IS NULL
     AND EXISTS (SELECT 1 FROM "user" u WHERE u.id = OLD.user_id AND u.status <> 'disabled') THEN
    PERFORM assert_organization_keeps_administrator(OLD.organization_id);
  END IF;
  RETURN NULL;
END;
$function$;
ALTER FUNCTION public.membership_keeps_practice_administrator() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.membership_keeps_practice_administrator() FROM PUBLIC;

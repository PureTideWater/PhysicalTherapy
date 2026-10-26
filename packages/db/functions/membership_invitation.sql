-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- membership_invitation()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 5101211402a5e23c
-- Trigger function of: membership.membership_invitation
CREATE OR REPLACE FUNCTION public.membership_invitation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF EXISTS (SELECT 1 FROM "user" a WHERE a.id = app_actor_id()) AND EXISTS (SELECT 1 FROM "user" u WHERE u.id = NEW.user_id AND u.status = 'invited') THEN
    INSERT INTO invitation (organization_id, membership_id, user_id, invited_by, sent_at, expires_at, last_sent_by)
    VALUES (NEW.organization_id, NEW.id, NEW.user_id, app_actor_id(), now(), now() + interval '7 days', app_actor_id());
  END IF;
  RETURN NULL;
END;
$function$;
ALTER FUNCTION public.membership_invitation() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.membership_invitation() FROM PUBLIC;

-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- user_accepts_invitations()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 787335bc653af7bb
-- Trigger function of: user.user_accepts_invitations
CREATE OR REPLACE FUNCTION public.user_accepts_invitations()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF OLD.status = 'invited' AND NEW.status = 'active' THEN
    UPDATE invitation SET accepted_at = now() WHERE user_id = NEW.id AND accepted_at IS NULL;
  END IF;
  RETURN NULL;
END;
$function$;
ALTER FUNCTION public.user_accepts_invitations() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.user_accepts_invitations() FROM PUBLIC;

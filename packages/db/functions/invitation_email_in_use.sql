-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- invitation_email_in_use(uuid,text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 4110c31e01ded551
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.invitation_email_in_use(target_organization uuid, address text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF app_actor_id() IS NULL OR NOT coalesce(app_actor_organization_permitted(target_organization, 'user.invite'), false) THEN
    RAISE EXCEPTION 'an organization''s administrator invites its people' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN EXISTS (SELECT 1 FROM "user" u WHERE lower(u.email) = lower(btrim(address)));
END;
$function$;
ALTER FUNCTION public.invitation_email_in_use(uuid,text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.invitation_email_in_use(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invitation_email_in_use(uuid,text) TO tp_app;

-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- resend_invitation(uuid)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 3a38c7bc37517a80
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.resend_invitation(target uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  organization uuid;
BEGIN
  SELECT i.organization_id INTO organization FROM invitation i WHERE i.id = target;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  IF app_actor_id() IS NULL OR NOT (
       coalesce(app_actor_organization_permitted(organization, 'user.invite'), false)
       OR coalesce(app_actor_platform_permitted('organization.manage'), false)) THEN
    RAISE EXCEPTION 'an invitation is sent again by its organization''s administrator' USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE invitation i SET sent_at = now(), expires_at = now() + interval '7 days', sends = i.sends + 1, last_sent_by = app_actor_id()
   WHERE i.id = target AND i.accepted_at IS NULL
     AND EXISTS (SELECT 1 FROM membership m WHERE m.id = i.membership_id AND (m.ends_at IS NULL OR m.ends_at > now()))
     AND EXISTS (SELECT 1 FROM "user" u WHERE u.id = i.user_id AND u.status = 'invited');
  RETURN FOUND;
END;
$function$;
ALTER FUNCTION public.resend_invitation(uuid) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.resend_invitation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resend_invitation(uuid) TO tp_app;

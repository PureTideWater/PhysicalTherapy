-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- console_register_marketing_campaign(text,text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 77e5b8145f5d7a10
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.console_register_marketing_campaign(code text, label text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  listed uuid;
BEGIN
  IF app_actor_id() IS NULL OR NOT app_actor_is_person() OR NOT coalesce(app_actor_platform_permitted('organization.manage'), false) THEN
    RAISE EXCEPTION 'a campaign is listed by a platform administrator' USING ERRCODE = 'insufficient_privilege';
  END IF;
  INSERT INTO marketing_campaign (code, label, added_by) VALUES ($1, btrim($2), app_actor_id()) RETURNING marketing_campaign.id INTO listed;
  INSERT INTO audit_event (actor_id, actor_kind, action, object_type, object_id, purpose)
  VALUES (app_actor_id(), 'user', 'marketing_campaign_registered', 'marketing_campaign', listed, 'console');
END;
$function$;
ALTER FUNCTION public.console_register_marketing_campaign(text,text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.console_register_marketing_campaign(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.console_register_marketing_campaign(text,text) TO tp_app;

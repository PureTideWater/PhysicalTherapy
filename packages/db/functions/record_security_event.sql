-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- record_security_event(text,uuid,uuid,text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 3a91f6d2aa7d0e61
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.record_security_event(target_type text, target uuid, target_practice uuid, what text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  INSERT INTO audit_event (actor_id, actor_kind, action, object_type, object_id, practice_id, purpose)
  VALUES (app_actor_id(), 'system', 'security_event', target_type, target, target_practice, what)
$function$;
ALTER FUNCTION public.record_security_event(text,uuid,uuid,text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.record_security_event(text,uuid,uuid,text) FROM PUBLIC;

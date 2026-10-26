-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- set_feature_flag(text,text,uuid,jsonb)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: ab0833dc69f73120
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.set_feature_flag(flag_key text, flag_scope text, flag_scope_id uuid, flag_value jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  flag_id uuid;
BEGIN
  IF NOT coalesce(app_actor_platform_permitted('feature_flag.manage'), false) THEN
    RAISE EXCEPTION 'only a platform administrator sets a feature flag' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF (flag_scope = 'organization' AND NOT EXISTS (SELECT 1 FROM organization o WHERE o.id = flag_scope_id))
     OR (flag_scope = 'practice' AND NOT EXISTS (SELECT 1 FROM practice p WHERE p.id = flag_scope_id)) THEN
    RAISE EXCEPTION 'a feature flag is set for an organization or a practice that exists' USING ERRCODE = 'foreign_key_violation';
  END IF;
  INSERT INTO feature_flag (key, scope, scope_id, value) VALUES (flag_key, flag_scope, flag_scope_id, flag_value)
    ON CONFLICT ON CONSTRAINT feature_flag_once DO UPDATE SET value = EXCLUDED.value
    RETURNING id INTO flag_id;
  INSERT INTO audit_event (actor_id, actor_kind, action, object_type, object_id, practice_id)
    VALUES (app_actor_id(), 'user', 'feature_flag_set', 'feature_flag', flag_id, CASE WHEN flag_scope = 'practice' THEN flag_scope_id END);
  RETURN flag_id;
END;
$function$;
ALTER FUNCTION public.set_feature_flag(text,text,uuid,jsonb) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.set_feature_flag(text,text,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_feature_flag(text,text,uuid,jsonb) TO tp_app;

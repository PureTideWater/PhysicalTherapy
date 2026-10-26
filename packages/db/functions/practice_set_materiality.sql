-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- practice_set_materiality(uuid,text,text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: bd92f0a44717170b
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.practice_set_materiality(target uuid, line_cents text, case_cents text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF app_actor_id() IS NULL OR NOT app_actor_is_person()
     OR NOT coalesce(target = ANY (nullif(current_setting('app.practice_ids', true), '')::uuid[]), false)
     OR NOT coalesce(app_actor_permitted(target, 'case.work'), false) THEN
    RAISE EXCEPTION 'a practice''s materiality is set by a person who works its cases' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF line_cents IS NULL OR case_cents IS NULL OR line_cents !~ '^(0|[1-9][0-9]{0,11})$' OR case_cents !~ '^(0|[1-9][0-9]{0,11})$' THEN
    RAISE EXCEPTION 'materiality is integer cents' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE practice p SET settings = p.settings || jsonb_build_object('line_materiality_cents', line_cents, 'case_materiality_cents', case_cents) WHERE p.id = target;
  RETURN FOUND;
END;
$function$;
ALTER FUNCTION public.practice_set_materiality(uuid,text,text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.practice_set_materiality(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.practice_set_materiality(uuid,text,text) TO tp_app;

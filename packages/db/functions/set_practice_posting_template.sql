-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- set_practice_posting_template(uuid,jsonb)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 1d457cde477eec93
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.set_practice_posting_template(target uuid, template jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT app_actor_is_person() OR NOT practice_in_scope(target) OR NOT coalesce(app_actor_permitted(target, 'posting.reconcile'), false) THEN
    RAISE EXCEPTION 'a person who reconciles postings maps the practice''s posting-export template' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF template IS NULL OR jsonb_typeof(template) <> 'object' THEN
    RAISE EXCEPTION 'a posting-export template is an object' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE practice p SET settings = jsonb_set(p.settings, '{posting_export_template}', template, true) WHERE p.id = target;
  RETURN FOUND;
END;
$function$;
ALTER FUNCTION public.set_practice_posting_template(uuid,jsonb) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.set_practice_posting_template(uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_practice_posting_template(uuid,jsonb) TO tp_app;

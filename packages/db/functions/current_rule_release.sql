-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- current_rule_release()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 888c946804c94d4f
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.current_rule_release()
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT max(r.release_no) FROM rule_release r
   WHERE r.published_at IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM rule_release_withdrawal w WHERE w.release_no = r.release_no)
$function$;
ALTER FUNCTION public.current_rule_release() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.current_rule_release() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_rule_release() TO tp_app;

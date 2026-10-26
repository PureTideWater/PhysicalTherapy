-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- line_stage_rank(text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 581989dfa3733186
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.line_stage_rank(stage text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT array_position(ARRAY['flagged', 'validated', 'actionable', 'payer_approved', 'recovered'], stage)
$function$;
ALTER FUNCTION public.line_stage_rank(text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.line_stage_rank(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.line_stage_rank(text) TO tp_app;

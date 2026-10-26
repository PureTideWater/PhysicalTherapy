-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- ledger_proof_level(uuid)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 9830a2f9478006bf
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.ledger_proof_level(target_practice uuid)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT CASE WHEN p.settings ->> 'proof_level' = 'deposited' THEN 'deposited' ELSE 'posted' END FROM practice p WHERE p.id = target_practice
$function$;
ALTER FUNCTION public.ledger_proof_level(uuid) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.ledger_proof_level(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ledger_proof_level(uuid) TO tp_app;

-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- contract_version_retired_by_signed_successor()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 7d19fbe631239fef
-- Trigger function of: contract_version.contract_version_retired_by_signed_successor
CREATE OR REPLACE FUNCTION public.contract_version_retired_by_signed_successor()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT contract_version_retired_by(OLD, NEW, 'signed_off') THEN
    RAISE EXCEPTION 'a contract version is closed or superseded only by the sign-off of its successor' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$function$;
ALTER FUNCTION public.contract_version_retired_by_signed_successor() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.contract_version_retired_by_signed_successor() FROM PUBLIC;

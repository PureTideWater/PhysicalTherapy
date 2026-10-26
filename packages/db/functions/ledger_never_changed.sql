-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- ledger_never_changed()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 4e6328f4a28594a0
-- Trigger function of: eft_row.eft_row_never_changed
-- Trigger function of: posting_row.posting_row_never_changed
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.ledger_never_changed()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  RAISE EXCEPTION '% rows are never changed or deleted: the ledger is append-only and a correction is a new entry', TG_TABLE_NAME USING ERRCODE = 'check_violation';
END;
$function$;
ALTER FUNCTION public.ledger_never_changed() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.ledger_never_changed() FROM PUBLIC;

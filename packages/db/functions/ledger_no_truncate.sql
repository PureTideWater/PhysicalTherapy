-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- ledger_no_truncate()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: c28c8fef48df43ac
-- Trigger function of: eft_row.eft_row_no_truncate
-- Trigger function of: ledger_entry.ledger_entry_no_truncate
-- Trigger function of: ledger_match.ledger_match_no_truncate
-- Trigger function of: posting_row.posting_row_no_truncate
-- Trigger function of: roi_statement.roi_statement_no_truncate
CREATE OR REPLACE FUNCTION public.ledger_no_truncate()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  RAISE EXCEPTION '% cannot be truncated: the ledger keeps what it recorded', TG_TABLE_NAME USING ERRCODE = 'check_violation';
END;
$function$;
ALTER FUNCTION public.ledger_no_truncate() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.ledger_no_truncate() FROM PUBLIC;

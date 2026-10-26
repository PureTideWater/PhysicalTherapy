-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- rule_content_no_truncate()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 5da9160cf53a8d06
-- Trigger function of: rule_record.rule_record_no_truncate
-- Trigger function of: rule_release.rule_release_no_truncate
-- Trigger function of: rule_release_withdrawal.rule_release_withdrawal_no_truncate
CREATE OR REPLACE FUNCTION public.rule_content_no_truncate()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION '% cannot be truncated: rule releases are immutable', TG_TABLE_NAME USING ERRCODE = 'raise_exception';
END;
$function$;
ALTER FUNCTION public.rule_content_no_truncate() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.rule_content_no_truncate() FROM PUBLIC;

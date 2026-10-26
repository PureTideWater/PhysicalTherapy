-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- rule_release_withdrawal_rules()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: c0f7ed15484f7fd1
-- Trigger function of: rule_release_withdrawal.rule_release_withdrawal_rules
CREATE OR REPLACE FUNCTION public.rule_release_withdrawal_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'a rule release withdrawal never changes; a correction is a new release' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.release_no IS DISTINCT FROM current_rule_release() THEN
    RAISE EXCEPTION 'only the rule release in force is withdrawn' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.reinstated_release_no IS DISTINCT FROM (
       SELECT max(r.release_no) FROM rule_release r
        WHERE r.release_no < NEW.release_no AND r.published_at IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM rule_release_withdrawal w WHERE w.release_no = r.release_no)) THEN
    RAISE EXCEPTION 'a withdrawal reinstates the newest published release before the one withdrawn' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.withdrawn_at IS DISTINCT FROM now() THEN
    RAISE EXCEPTION 'a withdrawal records the time it was made' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.rule_release_withdrawal_rules() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.rule_release_withdrawal_rules() FROM PUBLIC;

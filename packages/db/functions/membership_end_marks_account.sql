-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- membership_end_marks_account()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 9d1845cc073df31e
-- Trigger function of: membership.membership_end_marks_account
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.membership_end_marks_account()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'a membership is ended at READ COMMITTED' USING ERRCODE = 'feature_not_supported';
  END IF;
  UPDATE "user" u SET sign_in_not_before = GREATEST(u.sign_in_not_before, clock_timestamp()) WHERE u.id = NEW.user_id;
  UPDATE user_session s SET ended_at = clock_timestamp(), end_reason = 'revoked' WHERE s.user_id = NEW.user_id AND s.ended_at IS NULL;
  RETURN NULL;
END;
$function$;
ALTER FUNCTION public.membership_end_marks_account() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.membership_end_marks_account() FROM PUBLIC;

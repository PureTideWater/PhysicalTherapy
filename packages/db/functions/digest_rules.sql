-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- digest_rules()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: ece3b3718d970e66
-- Trigger function of: digest.digest_rules
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.digest_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'a digest is never deleted' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.sent_at IS NOT NULL THEN
      RAISE EXCEPTION 'a digest is recorded before it is sent' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.practice_id, NEW.period, NEW.counts, NEW.totals_cents, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.practice_id, OLD.period, OLD.counts, OLD.totals_cents, OLD.created_at) THEN
    RAISE EXCEPTION 'a digest''s figures never change once recorded' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.sent_at IS NOT NULL AND NEW.sent_at IS DISTINCT FROM OLD.sent_at THEN
    RAISE EXCEPTION 'a digest is sent once' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.sent_at IS NULL AND NEW.sent_at IS NOT NULL AND NEW.sent_at IS DISTINCT FROM now() THEN
    RAISE EXCEPTION 'a digest records the time it was sent' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.digest_rules() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.digest_rules() FROM PUBLIC;

-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- notification_rules()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: f5d86ea89ea32c5c
-- Trigger function of: notification.notification_rules
CREATE OR REPLACE FUNCTION public.notification_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'a notification is never deleted' USING ERRCODE = 'check_violation';
  END IF;
  IF (NEW.id, NEW.practice_id, NEW.user_id, NEW.kind, NEW.subject_id, NEW.counts, NEW.totals_cents, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.practice_id, OLD.user_id, OLD.kind, OLD.subject_id, OLD.counts, OLD.totals_cents, OLD.created_at) THEN
    RAISE EXCEPTION 'a notification never changes; only when it was read is recorded' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.read_at IS NOT NULL AND NEW.read_at IS DISTINCT FROM OLD.read_at THEN
    RAISE EXCEPTION 'a notification is read once' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.read_at IS NULL AND NEW.read_at IS NOT NULL AND NEW.read_at IS DISTINCT FROM now() THEN
    RAISE EXCEPTION 'a notification records the time it was read' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.notification_rules() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.notification_rules() FROM PUBLIC;

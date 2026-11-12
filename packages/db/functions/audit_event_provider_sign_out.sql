-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- audit_event_provider_sign_out()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 32535bed4191d172
-- Trigger function of: audit_event.audit_event_provider_sign_out
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.audit_event_provider_sign_out()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  account uuid;
BEGIN
  IF NEW.action = 'membership_ended' THEN
    SELECT m.user_id INTO account FROM membership m
     WHERE NEW.object_type = 'membership' AND m.id = NEW.object_id AND m.ends_at = now() AND m.created_at < now();
    IF NOT FOUND THEN
      RAISE EXCEPTION 'membership_ended is recorded in the transaction that ends the membership'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'membership_ended_is_recorded_by_the_end';
    END IF;
  ELSE
    account := NEW.actor_id;
  END IF;
  INSERT INTO provider_sign_out (user_id, reason, source_event_id, request_id, queued_at, next_attempt_at)
  VALUES (account, NEW.action, NEW.id, NEW.request_id, NEW.at, NEW.at)
  ON CONFLICT ON CONSTRAINT provider_sign_out_once DO NOTHING;
  RETURN NULL;
END;
$function$;
ALTER FUNCTION public.audit_event_provider_sign_out() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.audit_event_provider_sign_out() FROM PUBLIC;

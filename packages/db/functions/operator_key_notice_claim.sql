-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- operator_key_notice_claim(uuid)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 464b1ff5232532b5
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.operator_key_notice_claim(notice uuid)
 RETURNS TABLE(user_id uuid, email text, kind text, event_at timestamp with time zone, undelivered boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
#variable_conflict use_variable
DECLARE
  held hardware_key_notice%ROWTYPE;
  address text;
  same boolean;
BEGIN
  SELECT n.* INTO held FROM hardware_key_notice n
   WHERE n.id = notice AND n.state = 'pending' AND n.next_attempt_at <= now() AND n.event_at > now() - interval '24 hours'
     FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  SELECT u.email, r.address_sha256 = sha256(convert_to(r.id::text || ':' || lower(u.email), 'UTF8')) INTO address, same
    FROM "user" u JOIN hardware_key_removal r ON r.id = held.removal_id WHERE u.id = held.user_id;
  user_id := held.user_id;
  kind := held.kind;
  event_at := held.event_at;
  IF coalesce(same, false) THEN
    email := address;
    undelivered := false;
  ELSE
    UPDATE hardware_key_notice n SET state = 'failed', error_code = 'AddressChanged' WHERE n.id = notice;
    PERFORM hardware_key_notice_report_undelivered(notice, NULL);
    email := NULL;
    undelivered := true;
  END IF;
  RETURN NEXT;
END;
$function$;
ALTER FUNCTION public.operator_key_notice_claim(uuid) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.operator_key_notice_claim(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.operator_key_notice_claim(uuid) TO tp_operator;

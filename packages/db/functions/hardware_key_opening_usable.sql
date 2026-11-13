-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- hardware_key_opening_usable(uuid,timestamp with time zone)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: ec2dba7b4a457e8e
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.hardware_key_opening_usable(target uuid, at timestamp with time zone)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT latest.id
    FROM (SELECT r.* FROM hardware_key_removal r WHERE r.user_id = target AND r.state = 'confirmed' ORDER BY r.decided_at DESC, r.id DESC LIMIT 1) latest
    JOIN "user" u ON u.id = latest.user_id
   WHERE account_key_registration_closed(target)
     AND latest.registration_opened_at IS NOT NULL AND latest.registration_open_until > at AND latest.registration_code_tries < 5
     AND u.sign_in_not_before IS NOT NULL AND latest.registration_opened_at > u.sign_in_not_before
$function$;
ALTER FUNCTION public.hardware_key_opening_usable(uuid,timestamp with time zone) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.hardware_key_opening_usable(uuid,timestamp with time zone) FROM PUBLIC;

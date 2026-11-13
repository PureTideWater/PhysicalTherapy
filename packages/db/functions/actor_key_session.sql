-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- actor_key_session(uuid)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: ddc9a1c5a994758f
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.actor_key_session(acting_session uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM user_session s
      JOIN hardware_key k ON k.user_id = s.user_id AND k.credential_sha256 = s.key_credential_sha256 AND k.removed_at IS NULL
     WHERE s.id = acting_session AND s.user_id = app_actor_id()
       AND s.ended_at IS NULL AND s.expires_at > clock_timestamp()
       AND s.mfa_method = 'webauthn' AND s.started_at > clock_timestamp() - interval '15 minutes'
       AND (k.registered_at < clock_timestamp() - interval '24 hours'
            OR NOT EXISTS (SELECT 1 FROM hardware_key_removal r WHERE r.user_id = s.user_id AND r.state = 'confirmed')))
$function$;
ALTER FUNCTION public.actor_key_session(uuid) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.actor_key_session(uuid) FROM PUBLIC;

-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- membership_removal_target_holds()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 1f33de177ac3448f
-- Trigger function of: membership.membership_removal_target_holds
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.membership_removal_target_holds()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF app_actor_id() IS NOT NULL
     AND (organization_kind_of(OLD.organization_id) = 'internal' OR organization_kind_of(NEW.organization_id) = 'internal')
     AND EXISTS (SELECT 1 FROM hardware_key_removal r
                  WHERE r.user_id = app_actor_id() AND r.state = 'requested'
                    AND r.expires_at > clock_timestamp() AND account_removes_keys(r.requested_by)
                    AND NOT EXISTS (SELECT 1 FROM hardware_key_removal e
                                      JOIN membership m ON m.user_id = e.user_id
                                      JOIN organization o ON o.id = m.organization_id
                                     WHERE e.requested_by = r.requested_by AND e.id <> r.id AND e.state = 'requested'
                                       AND e.expires_at > clock_timestamp() AND (e.requested_at, e.id) < (r.requested_at, r.id)
                                       AND o.kind = 'internal' AND m.role = 'platform_admin'
                                       AND (m.ends_at IS NULL OR m.ends_at > clock_timestamp()))
                    AND EXISTS (SELECT 1 FROM membership t JOIN organization i ON i.id = t.organization_id
                                 WHERE i.kind = 'internal' AND t.role = 'platform_admin'
                                   AND t.user_id <> r.requested_by AND t.user_id <> r.user_id
                                   AND account_removes_keys(t.user_id))) THEN
    RAISE EXCEPTION 'an account whose key removal is requested changes no internal membership while the request can be confirmed'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'hardware_key_removal_target_acts';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.membership_removal_target_holds() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.membership_removal_target_holds() FROM PUBLIC;

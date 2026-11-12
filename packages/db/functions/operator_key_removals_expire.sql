-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- operator_key_removals_expire(integer,text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: b19d9919250361d7
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.operator_key_removals_expire(at_most integer, request text)
 RETURNS TABLE(removal_id uuid, user_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
#variable_conflict use_variable
DECLARE
  lapsed hardware_key_removal%ROWTYPE;
BEGIN
  FOR lapsed IN
    SELECT r.* FROM hardware_key_removal r
     WHERE r.state = 'requested' AND r.expires_at <= clock_timestamp()
     ORDER BY r.expires_at, r.id
     LIMIT greatest(at_most, 0)
       FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE hardware_key_removal r SET state = 'expired', decided_at = clock_timestamp(), decided_request_id = request WHERE r.id = lapsed.id;
    INSERT INTO audit_event (actor_kind, action, object_type, object_id, request_id)
    VALUES ('system', 'hardware_key_removal_expired', 'user', lapsed.user_id, request);
    removal_id := lapsed.id;
    user_id := lapsed.user_id;
    RETURN NEXT;
  END LOOP;
END;
$function$;
ALTER FUNCTION public.operator_key_removals_expire(integer,text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.operator_key_removals_expire(integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.operator_key_removals_expire(integer,text) TO tp_operator;

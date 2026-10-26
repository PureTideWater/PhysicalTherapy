-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- operator_record_support_notice(uuid,text,text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: cd723eaf7325fa60
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.operator_record_support_notice(target uuid, notice text, request text)
 RETURNS TABLE(recorded boolean, reads bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  g support_grant%ROWTYPE;
BEGIN
  IF notice NOT IN ('support_grant_opened', 'support_grant_closed') THEN
    RAISE EXCEPTION 'unknown notice' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO g FROM support_grant s WHERE s.id = target;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown support grant' USING ERRCODE = 'no_data_found';
  END IF;
  PERFORM operator_assert_scope(g.practice_id);
  PERFORM pg_advisory_xact_lock(hashtext(notice || ':' || target::text));
  recorded := false;
  reads := (SELECT count(*) FROM audit_event e WHERE e.grant_id = target AND e.action = 'read');
  IF notice = 'support_grant_closed' THEN
    IF NOT (now() >= g.expires_at OR now() >= g.created_at + interval '4 hours') THEN
      RETURN NEXT;
      RETURN;
    END IF;
    UPDATE support_grant s SET notified_at = now() WHERE s.id = target AND s.notified_at IS NULL;
    IF NOT FOUND THEN
      RETURN NEXT;
      RETURN;
    END IF;
  ELSIF EXISTS (
    SELECT 1 FROM audit_event e
     WHERE e.action = 'notice_sent' AND e.actor_kind = 'system' AND e.object_type = 'support_grant' AND e.object_id = target AND e.purpose = notice
  ) THEN
    RETURN NEXT;
    RETURN;
  END IF;
  INSERT INTO audit_event (actor_kind, action, object_type, object_id, practice_id, grant_id, purpose, request_id)
  VALUES ('system', 'notice_sent', 'support_grant', target, g.practice_id, target, notice, request);
  recorded := true;
  RETURN NEXT;
END;
$function$;
ALTER FUNCTION public.operator_record_support_notice(uuid,text,text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.operator_record_support_notice(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.operator_record_support_notice(uuid,text,text) TO tp_operator;

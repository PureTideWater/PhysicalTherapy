-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- operator_open_support_notice(uuid,text,text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: dbbd884fcd0805f7
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.operator_open_support_notice(target uuid, notice text, request text)
 RETURNS TABLE(notice_id uuid, recipients integer, opened boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
#variable_conflict use_variable
DECLARE
  g support_grant%ROWTYPE;
  created uuid;
  counted integer;
BEGIN
  IF notice IS NULL OR notice NOT IN ('support_grant_opened', 'support_grant_closed') THEN
    RAISE EXCEPTION 'unknown notice' USING ERRCODE = 'check_violation';
  END IF;
  SELECT s.* INTO g FROM support_grant s WHERE s.id = target;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown support grant' USING ERRCODE = 'no_data_found';
  END IF;
  PERFORM operator_assert_scope(g.practice_id);
  PERFORM pg_advisory_xact_lock(hashtext(notice || ':' || target::text));
  opened := false;
  SELECT n.id, n.recipients INTO notice_id, recipients FROM support_grant_notice n WHERE n.support_grant_id = target AND n.notice = notice;
  IF FOUND THEN
    RETURN NEXT;
    RETURN;
  END IF;
  -- Not opened: none, and no recipient, unless it is opened below.
  notice_id := NULL;
  recipients := 0;
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
  INSERT INTO support_grant_notice (support_grant_id, practice_id, notice, recipients) VALUES (target, g.practice_id, notice, 0) RETURNING support_grant_notice.id INTO created;
  INSERT INTO support_grant_notice_recipient (notice_id, practice_id, user_id)
  SELECT created, g.practice_id, a.user_id FROM support_notice_administrators(g.practice_id) a ORDER BY a.user_id LIMIT 500;
  GET DIAGNOSTICS counted = ROW_COUNT;
  IF counted = 0 THEN
    UPDATE support_grant_notice n SET undelivered_reported_at = now() WHERE n.id = created;
    INSERT INTO audit_event (actor_kind, action, object_type, object_id, practice_id, grant_id, purpose, request_id)
    VALUES ('system', 'notice_undelivered', 'support_grant', target, g.practice_id, target, notice, request);
  ELSE
    UPDATE support_grant_notice n SET recipients = counted WHERE n.id = created;
  END IF;
  notice_id := created;
  recipients := counted;
  opened := true;
  RETURN NEXT;
END;
$function$;
ALTER FUNCTION public.operator_open_support_notice(uuid,text,text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.operator_open_support_notice(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.operator_open_support_notice(uuid,text,text) TO tp_operator;

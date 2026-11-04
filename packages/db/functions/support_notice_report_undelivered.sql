-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- support_notice_report_undelivered(uuid,text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 0aaaf020f6dfac6b
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.support_notice_report_undelivered(notice uuid, request text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
#variable_conflict use_variable
DECLARE
  reported support_grant_notice%ROWTYPE;
BEGIN
  UPDATE support_grant_notice n SET undelivered_reported_at = now() WHERE n.id = notice AND n.undelivered_reported_at IS NULL RETURNING n.* INTO reported;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  INSERT INTO audit_event (actor_kind, action, object_type, object_id, practice_id, grant_id, purpose, request_id)
  VALUES ('system', 'notice_undelivered', 'support_grant', reported.support_grant_id, reported.practice_id, reported.support_grant_id, reported.notice, request);
  INSERT INTO notification (practice_id, user_id, kind, subject_id, counts, totals_cents)
  SELECT reported.practice_id, a.user_id, 'support_notice_undelivered', reported.id, '{}'::jsonb, '{}'::jsonb
    FROM support_notice_administrators(reported.practice_id) a
  ON CONFLICT ON CONSTRAINT notification_once DO NOTHING;
  RETURN true;
END;
$function$;
ALTER FUNCTION public.support_notice_report_undelivered(uuid,text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.support_notice_report_undelivered(uuid,text) FROM PUBLIC;

-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- console_mail_undelivered(timestamp with time zone)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 2cf128abb1f398dd
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.console_mail_undelivered(since timestamp with time zone)
 RETURNS TABLE(stream text, kind text, state text, recipient_user_id uuid, practice_id uuid, subject_id uuid, undelivered_at timestamp with time zone, messages integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF app_actor_id() IS NULL OR NOT app_actor_is_person() OR NOT coalesce(app_actor_platform_permitted('feature_flag.manage'), false) THEN
    RAISE EXCEPTION 'only a platform administrator reads undelivered mail' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
    (SELECT m.stream, m.kind, m.state, m.recipient_user_id, n.practice_id, m.subject_id, coalesce(m.undelivered_at, m.complained_at), 1
       FROM mail_send m
       LEFT JOIN support_grant_notice n ON m.kind IN ('support_grant_opened', 'support_grant_closed') AND n.id = m.subject_id
      WHERE m.stream <> 'screening' AND m.kind <> 'probe' AND m.state IN ('bounced', 'suppressed', 'rejected', 'complained')
        AND coalesce(m.undelivered_at, m.complained_at) >= coalesce($1, now() - interval '7 days')
      ORDER BY coalesce(m.undelivered_at, m.complained_at) DESC, m.ses_message_id
      LIMIT 500)
    UNION ALL
    (SELECT 'screening', m.kind, m.state, NULL::uuid, NULL::uuid, NULL::uuid, max(coalesce(m.undelivered_at, m.complained_at)), count(*)::integer
       FROM mail_send m
      WHERE m.stream = 'screening' AND m.kind <> 'probe' AND m.state IN ('bounced', 'suppressed', 'rejected', 'complained')
        AND coalesce(m.undelivered_at, m.complained_at) >= coalesce($1, now() - interval '7 days')
      GROUP BY m.kind, m.state);
END;
$function$;
ALTER FUNCTION public.console_mail_undelivered(timestamp with time zone) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.console_mail_undelivered(timestamp with time zone) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.console_mail_undelivered(timestamp with time zone) TO tp_app;

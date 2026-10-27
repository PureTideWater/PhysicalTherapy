-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- mail_window_counts(text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 4fc496298bfe8768
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.mail_window_counts(target text)
 RETURNS TABLE(sends integer, bounces integer, complaints integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT count(m.*)::integer,
         count(m.*) FILTER (WHERE m.state = 'bounced' AND m.bounce_kind = 'permanent')::integer,
         count(m.*) FILTER (WHERE m.state = 'complained' AND m.complaint_type <> 'not_spam')::integer
    FROM mail_stream s
    LEFT JOIN mail_send m ON m.stream = s.stream AND m.kind <> 'probe' AND m.state NOT IN ('suppressed', 'rejected')
                         AND m.sent_at >= greatest(now() - interval '7 days', s.window_starts_at)
   WHERE s.stream = target
$function$;
ALTER FUNCTION public.mail_window_counts(text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.mail_window_counts(text) FROM PUBLIC;

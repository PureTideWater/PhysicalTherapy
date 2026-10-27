-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- support_notice_counts(uuid,text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: c59146a9b2523fa3
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.support_notice_counts(target uuid, notice text)
 RETURNS TABLE(recipients integer, delivered integer, undelivered integer, pending integer, sent_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT n.recipients::integer,
         count(r.*) FILTER (WHERE r.state IN ('delivered', 'complained'))::integer,
         count(r.*) FILTER (WHERE r.state IN ('bounced', 'suppressed', 'rejected', 'failed'))::integer,
         count(r.*) FILTER (WHERE r.state = 'pending')::integer,
         max(r.sent_at)
    FROM support_grant_notice n LEFT JOIN support_grant_notice_recipient r ON r.notice_id = n.id
   WHERE n.support_grant_id = target AND n.notice = $2
   GROUP BY n.id, n.recipients
$function$;
ALTER FUNCTION public.support_notice_counts(uuid,text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.support_notice_counts(uuid,text) FROM PUBLIC;

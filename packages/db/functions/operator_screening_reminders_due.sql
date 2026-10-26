-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- operator_screening_reminders_due(integer,integer)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 8f34240464dd59d1
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.operator_screening_reminders_due(within_days integer, at_most integer)
 RETURNS TABLE(lead_id uuid, contact_email text, expires_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT l.id, l.contact_email, l.expires_at FROM screening_lead l
   WHERE l.consent_sha256 IS NOT NULL AND l.reminder_sent_at IS NULL
     AND l.expires_at > now() AND l.expires_at <= now() + make_interval(days => greatest(coalesce($1, 0), 0))
   ORDER BY l.expires_at, l.id
   LIMIT least(greatest(coalesce($2, 0), 0), 1000)
$function$;
ALTER FUNCTION public.operator_screening_reminders_due(integer,integer) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.operator_screening_reminders_due(integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.operator_screening_reminders_due(integer,integer) TO tp_operator;

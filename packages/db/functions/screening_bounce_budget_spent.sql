-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- screening_bounce_budget_spent(text,text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 3de7fd3276da7f3f
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.screening_bounce_budget_spent(account_subject text, client_subject text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT (SELECT count(*) FROM screening_bounce_mark b WHERE b.subject_kind = 'account' AND b.subject = $1 AND b.expires_at > now()) >= 3
      OR (SELECT count(*) FROM screening_bounce_mark b WHERE b.subject_kind = 'client' AND b.subject = $2 AND b.expires_at > now()) >= 3
$function$;
ALTER FUNCTION public.screening_bounce_budget_spent(text,text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.screening_bounce_budget_spent(text,text) FROM PUBLIC;

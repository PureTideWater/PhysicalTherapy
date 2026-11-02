-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- screening_submit_mail_refusal(text,text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 68638b412b4b2db0
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.screening_submit_mail_refusal(rate_account_subject text, client_subject text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT CASE
           WHEN current_rule_release() IS NULL OR place_of_service_split_in_force() IS NULL
                OR NOT EXISTS (SELECT 1 FROM rule_release r WHERE r.release_no = current_rule_release() AND r.manifest_sha256 IS NOT NULL) THEN 'screening_closed'
           WHEN NOT EXISTS (SELECT 1 FROM mail_stream s WHERE s.stream = 'screening' AND s.paused_at IS NULL) THEN 'screening_paused'
           WHEN screening_bounce_budget_spent($1, $2) THEN 'screening_bounce_budget'
         END
$function$;
ALTER FUNCTION public.screening_submit_mail_refusal(text,text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.screening_submit_mail_refusal(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.screening_submit_mail_refusal(text,text) TO tp_app;

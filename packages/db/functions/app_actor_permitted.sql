-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- app_actor_permitted(uuid,text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: ba1bea731502d75b
-- Trigger function of: (none)
-- Called by policy: audit_report.audit_report_requested_by_case_workers
-- Called by policy: case.case_opened_by_case_workers
-- Called by policy: case_line.case_line_added_by_case_workers
-- Called by policy: contract_calendar_event.contract_calendar_event_by_sign_off
-- Called by policy: grant.grant_approved_by_practice_administrator
-- Called by policy: grant.grant_revoked_by_practice_administrator
-- Called by policy: line_status.line_status_set_by_case_workers
-- Called by policy: pricing_run.pricing_run_accepted_by_actor
-- Called by policy: pricing_run.pricing_run_created_by_mappers
CREATE OR REPLACE FUNCTION public.app_actor_permitted(target_practice uuid, wanted text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT roles_permit(coalesce((SELECT array_agg(DISTINCT a.role) FROM effective_practice_access() a WHERE a.practice_id = target_practice), '{}'), wanted)
$function$;
ALTER FUNCTION public.app_actor_permitted(uuid,text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.app_actor_permitted(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_actor_permitted(uuid,text) TO tp_app;

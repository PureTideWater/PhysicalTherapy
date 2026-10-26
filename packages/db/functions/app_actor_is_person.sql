-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- app_actor_is_person()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: b6531b04450fa24c
-- Trigger function of: (none)
-- Called by policy: case.case_opened_by_case_workers
-- Called by policy: case_line.case_line_added_by_case_workers
-- Called by policy: line_status.line_status_set_by_case_workers
-- Called by policy: notification.notification_recipient_reads
-- Called by policy: notification.notification_written_for
-- Called by policy: payer_response.payer_response_recorded_by_actor
-- Called by policy: pricing_run.pricing_run_created_by_actor
CREATE OR REPLACE FUNCTION public.app_actor_is_person()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (SELECT 1 FROM "user" u WHERE u.id = app_actor_id())
$function$;
ALTER FUNCTION public.app_actor_is_person() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.app_actor_is_person() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_actor_is_person() TO tp_app;

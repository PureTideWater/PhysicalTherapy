-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- dunning_notice_report_undelivered(uuid,text,text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 838433efa7b733e6
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.dunning_notice_report_undelivered(target_invoice uuid, notice_stage text, request text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('dunning_notice:' || target_invoice::text || ':' || notice_stage, 0));
  IF EXISTS (
    SELECT 1 FROM audit_event e
     WHERE e.action = 'notice_undelivered' AND e.actor_kind = 'system' AND e.object_type = 'invoice' AND e.object_id = target_invoice AND e.purpose = notice_stage
  ) THEN
    RETURN false;
  END IF;
  INSERT INTO audit_event (actor_kind, action, object_type, object_id, purpose, request_id)
  VALUES ('system', 'notice_undelivered', 'invoice', target_invoice, notice_stage, request);
  RETURN true;
END;
$function$;
ALTER FUNCTION public.dunning_notice_report_undelivered(uuid,text,text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.dunning_notice_report_undelivered(uuid,text,text) FROM PUBLIC;

-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- billing_open_dunning_notice(uuid,text,text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: e5adee9b6a517801
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.billing_open_dunning_notice(target_invoice uuid, notice_stage text, request text)
 RETURNS TABLE(recipients integer, opened boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  organization uuid;
  counted integer;
BEGIN
  IF notice_stage IS NULL OR notice_stage NOT IN ('payment_failed', 'second_notice', 'third_notice', 'final_notice', 'suspended', 'reinstated') THEN
    RAISE EXCEPTION 'unknown dunning stage' USING ERRCODE = 'check_violation';
  END IF;
  SELECT i.organization_id INTO organization FROM invoice i WHERE i.id = target_invoice;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown invoice' USING ERRCODE = 'no_data_found';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('dunning_notice:' || target_invoice::text || ':' || notice_stage, 0));
  SELECT count(*)::integer INTO counted FROM dunning_notice_recipient d WHERE d.invoice_id = target_invoice AND d.stage = notice_stage;
  IF counted > 0 OR EXISTS (
    SELECT 1 FROM audit_event e
     WHERE e.action = 'notice_undelivered' AND e.actor_kind = 'system' AND e.object_type = 'invoice' AND e.object_id = target_invoice AND e.purpose = notice_stage
  ) THEN
    recipients := counted;
    opened := false;
    RETURN NEXT;
    RETURN;
  END IF;
  INSERT INTO dunning_notice_recipient (invoice_id, stage, organization_id, user_id)
  SELECT DISTINCT target_invoice, notice_stage, organization, m.user_id
    FROM membership m JOIN "user" u ON u.id = m.user_id
   WHERE m.organization_id = organization AND (m.ends_at IS NULL OR m.ends_at > now()) AND u.status = 'active'
     AND roles_permit(ARRAY[m.role], 'organization.billing');
  GET DIAGNOSTICS counted = ROW_COUNT;
  IF counted = 0 THEN
    PERFORM dunning_notice_report_undelivered(target_invoice, notice_stage, request);
  END IF;
  recipients := counted;
  opened := true;
  RETURN NEXT;
END;
$function$;
ALTER FUNCTION public.billing_open_dunning_notice(uuid,text,text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.billing_open_dunning_notice(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.billing_open_dunning_notice(uuid,text,text) TO tp_billing;

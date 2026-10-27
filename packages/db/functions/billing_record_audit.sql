-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- billing_record_audit(text,text,uuid,text,text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: f9a85d22da427ca1
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.billing_record_audit(event_action text, target_type text, target_id uuid, event_purpose text, request text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF event_action NOT IN ('billing_event_applied', 'billing_dunning_notice', 'billing_suspended', 'billing_reinstated', 'billing_usage_snapshot')
     OR target_type NOT IN ('billing_event', 'invoice', 'organization', 'usage_snapshot') THEN
    RAISE EXCEPTION 'billing records only its own audit events' USING ERRCODE = 'insufficient_privilege';
  END IF;
  INSERT INTO audit_event (actor_kind, action, object_type, object_id, purpose, request_id)
    VALUES ('system', event_action, target_type, target_id, event_purpose, request);
END;
$function$;
ALTER FUNCTION public.billing_record_audit(text,text,uuid,text,text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.billing_record_audit(text,text,uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.billing_record_audit(text,text,uuid,text,text) TO tp_billing;

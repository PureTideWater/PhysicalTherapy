-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- console_set_organization_status(uuid,text,text,text,text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 27eface641e5dfbf
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.console_set_organization_status(target_organization uuid, from_status text, to_status text, status_reason text, note text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
#variable_conflict use_variable
DECLARE
  current_status text;
  current_reason text;
  kept_note text := nullif(btrim(note), '');
BEGIN
  IF app_actor_id() IS NULL OR NOT app_actor_is_person() OR NOT coalesce(app_actor_platform_permitted('organization.manage'), false) THEN
    RAISE EXCEPTION 'only a platform administrator suspends or reinstates an organization' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT o.status, o.status_reason INTO current_status, current_reason
    FROM organization o WHERE o.id = target_organization AND o.kind IN ('group', 'firm') FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no such organization' USING ERRCODE = 'no_data_found';
  END IF;
  IF 'closed' IN (current_status, from_status, to_status) THEN
    RAISE EXCEPTION 'a closed organization stays closed, and only its closure closes one' USING ERRCODE = 'check_violation', CONSTRAINT = 'organization_closed_by_closure_only';
  END IF;
  IF from_status = 'suspended' AND to_status = 'active' AND current_status = 'active' THEN
    RETURN false;
  END IF;
  IF current_status IS DISTINCT FROM from_status THEN
    RAISE EXCEPTION 'the organization''s status changed since it was read' USING ERRCODE = 'check_violation', CONSTRAINT = 'organization_status_changed_meanwhile';
  END IF;
  IF NOT coalesce((from_status = 'active' AND to_status = 'suspended' AND status_reason IN ('customer_request', 'security_hold', 'agreement_ended'))
       OR (from_status = 'suspended' AND to_status = 'suspended' AND status_reason IN ('customer_request', 'security_hold', 'agreement_ended'))
       OR (from_status = 'suspended' AND to_status = 'active' AND status_reason IN ('resolved', 'in_error')), false) THEN
    RAISE EXCEPTION 'a suspension takes a suspension reason, and a reinstatement a reinstatement reason' USING ERRCODE = 'check_violation', CONSTRAINT = 'organization_status_change_reason';
  END IF;
  IF from_status = 'suspended' AND to_status = 'suspended' AND current_reason IS NOT DISTINCT FROM status_reason AND kept_note IS NULL THEN
    RETURN false;
  END IF;
  UPDATE organization o
     SET status = to_status, status_reason = CASE WHEN to_status = 'suspended' THEN status_reason END
   WHERE o.id = target_organization;
  INSERT INTO organization_status_change (organization_id, from_status, to_status, reason, note, changed_by)
  VALUES (target_organization, from_status, to_status, status_reason, kept_note, app_actor_id());
  INSERT INTO audit_event (actor_id, actor_kind, action, object_type, object_id, purpose)
  VALUES (app_actor_id(), 'user', CASE WHEN to_status = 'suspended' THEN 'organization_suspended' ELSE 'organization_reinstated' END, 'organization', target_organization, status_reason);
  RETURN true;
END;
$function$;
ALTER FUNCTION public.console_set_organization_status(uuid,text,text,text,text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.console_set_organization_status(uuid,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.console_set_organization_status(uuid,text,text,text,text) TO tp_app;

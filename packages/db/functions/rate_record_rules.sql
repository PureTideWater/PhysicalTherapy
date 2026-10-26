-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- rate_record_rules()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: dd7f474c2f4ab695
-- Trigger function of: rate_record.rate_record_rules
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.rate_record_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  version contract_version%ROWTYPE;
  target uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.contract_version_id ELSE NEW.contract_version_id END;
  target_practice uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.practice_id ELSE NEW.practice_id END;
  approvals jsonb;
  field text;
  entry jsonb;
  is_specialist boolean;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.id, NEW.practice_id, NEW.contract_version_id, NEW.proposed_by, NEW.created_at) IS DISTINCT FROM (OLD.id, OLD.practice_id, OLD.contract_version_id, OLD.proposed_by, OLD.created_at) THEN
    RAISE EXCEPTION 'a rate record''s version and origin never change' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT practice_in_scope(target_practice) THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  -- Shares the version's row lock with its approval, so a record never changes under an approving version.
  SELECT * INTO version FROM contract_version v WHERE v.id = target AND v.practice_id = target_practice FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'a rate record belongs to a contract version of the same practice' USING ERRCODE = 'check_violation';
  END IF;
  IF version.status NOT IN ('draft', 'proposed') THEN
    RAISE EXCEPTION 'the rate records of an approved or signed-off version never change; supersede the version' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  approvals := coalesce(NEW.evidence -> 'approved_fields', '{}'::jsonb);
  IF jsonb_typeof(approvals) <> 'object' THEN
    RAISE EXCEPTION 'evidence.approved_fields is an object of field approvals' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.verified_by IS NOT NULL OR approvals <> '{}'::jsonb THEN
      RAISE EXCEPTION 'a rate record is verified after it is written, field by field' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  -- What an edit changed loses its approval.
  IF (NEW.evidence - 'approved_fields') IS DISTINCT FROM (OLD.evidence - 'approved_fields') THEN
    approvals := '{}'::jsonb;
  ELSE
    IF NEW.scope IS DISTINCT FROM OLD.scope THEN approvals := approvals - 'scope'; END IF;
    IF NEW.method IS DISTINCT FROM OLD.method THEN approvals := approvals - 'method' - 'parameters'; END IF;
    IF NEW.parameters IS DISTINCT FROM OLD.parameters THEN approvals := approvals - 'parameters'; END IF;
    IF NEW.flags IS DISTINCT FROM OLD.flags THEN approvals := approvals - 'flags'; END IF;
    IF NEW.rounding IS DISTINCT FROM OLD.rounding THEN approvals := approvals - 'rounding'; END IF;
  END IF;
  NEW.evidence := CASE WHEN approvals = '{}'::jsonb THEN NEW.evidence - 'approved_fields' ELSE jsonb_set(NEW.evidence, '{approved_fields}', approvals) END;

  -- A new approval is the acting specialist's, now.
  is_specialist := coalesce(app_actor_platform_permitted('rate_record.approve'), false);
  FOR field, entry IN SELECT key, value FROM jsonb_each(approvals) LOOP
    IF NOT field = ANY (rate_record_fields()) THEN
      RAISE EXCEPTION 'a field approval names one of the rate record''s fields' USING ERRCODE = 'check_violation';
    END IF;
    IF entry IS DISTINCT FROM (OLD.evidence -> 'approved_fields' -> field) THEN
      IF NOT is_specialist THEN
        RAISE EXCEPTION 'only a contract specialist approves a rate record''s fields' USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF jsonb_typeof(entry) <> 'object' THEN
        RAISE EXCEPTION 'a field approval records the approving specialist and the time' USING ERRCODE = 'check_violation';
      END IF;
      IF (entry - 'by' - 'at') <> '{}'::jsonb OR (entry ->> 'by') IS DISTINCT FROM app_actor_id()::text
         OR coalesce((entry ->> 'at') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}(:\d{2})?|Z)$', true) THEN
        RAISE EXCEPTION 'a field approval records the approving specialist and the time' USING ERRCODE = 'check_violation';
      END IF;
      IF (entry ->> 'at')::timestamptz IS DISTINCT FROM now() THEN
        RAISE EXCEPTION 'a field approval records the approving specialist and the time' USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END LOOP;

  IF NEW.verified_by IS NOT NULL THEN
    IF OLD.verified_by IS NULL THEN
      IF NOT is_specialist THEN
        RAISE EXCEPTION 'only a contract specialist verifies a rate record' USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF NEW.verified_by IS DISTINCT FROM app_actor_id() OR NEW.verified_at IS DISTINCT FROM now() THEN
        RAISE EXCEPTION 'a verification records the verifying specialist and the time' USING ERRCODE = 'check_violation';
      END IF;
      IF NOT (SELECT bool_and(approvals ? f) FROM unnest(rate_record_fields()) f) THEN
        RAISE EXCEPTION 'a rate record is verified once each of its fields is approved' USING ERRCODE = 'check_violation';
      END IF;
      IF NOT rate_record_evidence_complete(NEW.evidence) THEN
        RAISE EXCEPTION 'a rate record cannot be approved without evidence naming a document, a page, a quote and a hash' USING ERRCODE = 'check_violation';
      END IF;
      IF NOT ((NEW.evidence ->> 'document_id')::uuid = ANY (version.source_document_ids)) THEN
        RAISE EXCEPTION 'a rate record''s evidence is a document of its version' USING ERRCODE = 'check_violation';
      END IF;
    ELSIF (NEW.verified_by, NEW.verified_at) IS DISTINCT FROM (OLD.verified_by, OLD.verified_at) THEN
      RAISE EXCEPTION 'a verification is recorded once' USING ERRCODE = 'check_violation';
    ELSIF NOT (SELECT bool_and(approvals ? f) FROM unnest(rate_record_fields()) f) THEN
      -- An edit that cleared an approval clears the verification with it.
      NEW.verified_by := NULL;
      NEW.verified_at := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.rate_record_rules() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.rate_record_rules() FROM PUBLIC;

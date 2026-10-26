-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- record_esigned_agreement(text,text,uuid,uuid,text,text,timestamp with time zone,text,text,text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: c35a793ea76cc0b8
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.record_esigned_agreement(event_id text, envelope text, target_organization uuid, target_practice uuid, agreement_kind text, agreement_version text, signed timestamp with time zone, signed_by text, document_sha256 text, request text)
 RETURNS TABLE(agreement_id uuid, duplicate boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  existing uuid;
  created uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('agreement_event:' || event_id, 0));
  SELECT e.agreement_id INTO existing FROM agreement_event e WHERE e.provider_event_id = event_id;
  IF FOUND THEN
    RETURN QUERY SELECT existing, true;
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM organization o WHERE o.id = target_organization AND o.kind IN ('group', 'firm')) THEN
    RAISE EXCEPTION 'an e-signed agreement names a customer organization' USING ERRCODE = 'check_violation';
  END IF;
  IF target_practice IS NOT NULL AND NOT EXISTS (SELECT 1 FROM practice p WHERE p.id = target_practice AND p.organization_id = target_organization) THEN
    RAISE EXCEPTION 'an e-signed agreement names a practice of its organization' USING ERRCODE = 'check_violation';
  END IF;
  IF signed > now() THEN
    RAISE EXCEPTION 'an agreement is signed in the past' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO agreement (organization_id, practice_id, kind, version, signed_at, signer, document_ref, sha256)
  VALUES (target_organization, target_practice, agreement_kind, agreement_version, signed, signed_by, 'esign:' || envelope, document_sha256)
  RETURNING id INTO created;
  INSERT INTO agreement_event (provider_event_id, envelope_ref, agreement_id) VALUES (event_id, envelope, created);
  INSERT INTO audit_event (actor_id, actor_kind, action, object_type, object_id, practice_id, purpose, request_id)
  VALUES (NULL, 'system', 'agreement_recorded', 'agreement', created, target_practice, 'esign_webhook', request);
  RETURN QUERY SELECT created, false;
END;
$function$;
ALTER FUNCTION public.record_esigned_agreement(text,text,uuid,uuid,text,text,timestamp with time zone,text,text,text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.record_esigned_agreement(text,text,uuid,uuid,text,text,timestamp with time zone,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_esigned_agreement(text,text,uuid,uuid,text,text,timestamp with time zone,text,text,text) TO tp_esign;

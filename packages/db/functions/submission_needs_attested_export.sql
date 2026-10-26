-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- submission_needs_attested_export()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 20d7fd6636be6827
-- Trigger function of: submission.submission_needs_attested_export
CREATE OR REPLACE FUNCTION public.submission_needs_attested_export()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.unattested_reason IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM packet_version v WHERE v.id = NEW.packet_version_id AND v.practice_id = NEW.practice_id AND v.attested_by IS NOT NULL) THEN
      RAISE EXCEPTION 'a packet is submitted once a reimbursement reviewer has attested its export' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NULL;
  END IF;
  INSERT INTO audit_event (actor_id, actor_kind, action, object_type, object_id, practice_id, grant_id, purpose)
  VALUES (
    app_actor_id(), 'user', 'submission_logged_unattested', 'submission', NEW.id, NEW.practice_id,
    -- The route the access rests on, as the application's own events name it (ownership, then a grant, then a support grant).
    (SELECT a.grant_id FROM effective_practice_access() a WHERE a.practice_id = NEW.practice_id
      ORDER BY array_position(ARRAY['ownership', 'grant', 'support'], a.via), coalesce(a.grant_id::text, '') LIMIT 1),
    NEW.unattested_reason
  );
  RETURN NULL;
END;
$function$;
ALTER FUNCTION public.submission_needs_attested_export() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.submission_needs_attested_export() FROM PUBLIC;

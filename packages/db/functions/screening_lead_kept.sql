-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- screening_lead_kept()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: ff98a981ccca6e52
-- Trigger function of: screening_lead.screening_lead_kept
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.screening_lead_kept()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF OLD.expires_at <= now() THEN
    RETURN OLD;
  END IF;
  IF OLD.prospect_request_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM prospect_request q WHERE q.id = OLD.prospect_request_id) THEN
    RETURN OLD;
  END IF;
  IF EXISTS (SELECT 1 FROM screening_run r JOIN screening_upload u ON u.id = r.upload_id JOIN screening_prospect p ON p.id = u.prospect_id
              WHERE r.status = 'complete' AND u.created_at > OLD.screened_at
                AND (p.contact_email = OLD.contact_email OR (p.zip = OLD.zip AND screening_practice_key(p.practice_name) = screening_practice_key(OLD.practice_name)))) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'a kept screening summary is kept 12 months from its upload, until a later screening of the practice replaces it, or until it is withdrawn'
    USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_lead_kept';
END;
$function$;
ALTER FUNCTION public.screening_lead_kept() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.screening_lead_kept() FROM PUBLIC;

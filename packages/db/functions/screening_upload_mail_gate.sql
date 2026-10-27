-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- screening_upload_mail_gate()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 34c048190125ece9
-- Trigger function of: screening_upload.screening_upload_mail_gate
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.screening_upload_mail_gate()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  hashed text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM mail_stream s WHERE s.stream = 'screening' AND s.paused_at IS NULL) THEN
    RAISE EXCEPTION 'new screenings are paused while their result emails cannot be sent' USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_paused';
  END IF;
  SELECT mail_recipient_sha256(p.contact_email) INTO hashed FROM screening_prospect p WHERE p.id = NEW.prospect_id;
  IF EXISTS (SELECT 1 FROM screening_mail_refusal f WHERE f.recipient_sha256 = hashed AND f.expires_at > now()) THEN
    RAISE EXCEPTION 'a screening''s result cannot be emailed to its contact address' USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_contact_undeliverable';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.screening_upload_mail_gate() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.screening_upload_mail_gate() FROM PUBLIC;

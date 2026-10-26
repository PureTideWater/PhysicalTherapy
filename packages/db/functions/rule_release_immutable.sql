-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- rule_release_immutable()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 495c52b559208d41
-- Trigger function of: rule_release.rule_release_immutable
CREATE OR REPLACE FUNCTION public.rule_release_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.published_at IS NULL AND NEW.published_at IS NOT NULL
     AND NEW.id = OLD.id AND NEW.release_no = OLD.release_no AND NEW.manifest_sha256 = OLD.manifest_sha256
     AND NEW.notes = OLD.notes AND NEW.created_at = OLD.created_at THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'rule_release % is immutable: a published release never changes; load a new release instead', OLD.release_no
    USING ERRCODE = 'raise_exception';
END;
$function$;
ALTER FUNCTION public.rule_release_immutable() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.rule_release_immutable() FROM PUBLIC;

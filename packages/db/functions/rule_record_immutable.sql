-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- rule_record_immutable()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: f638f6a6b42be99a
-- Trigger function of: rule_record.rule_record_immutable
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.rule_record_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF EXISTS (SELECT 1 FROM rule_release WHERE release_no = NEW.release_no AND published_at IS NOT NULL) THEN
      RAISE EXCEPTION 'rule_release % is published: no record can be added to it', NEW.release_no
        USING ERRCODE = 'raise_exception';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'rule_record rows are immutable: a published release never changes; load a new release instead'
    USING ERRCODE = 'raise_exception';
END;
$function$;
ALTER FUNCTION public.rule_record_immutable() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.rule_record_immutable() FROM PUBLIC;

-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- payer_plan_mapping_rules()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 06a465c2d5277fc6
-- Trigger function of: payer_plan_mapping.payer_plan_mapping_rules
CREATE OR REPLACE FUNCTION public.payer_plan_mapping_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'a mapping never changes; correct it with a new mapping that supersedes it' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT practice_in_scope(NEW.practice_id) THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM plan p WHERE p.id = NEW.plan_id AND p.practice_id = NEW.practice_id) THEN
    RAISE EXCEPTION 'a mapping maps a plan of the same practice' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.contract_version_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM contract_version v WHERE v.id = NEW.contract_version_id AND v.practice_id = NEW.practice_id) THEN
    RAISE EXCEPTION 'a mapping names a contract version of the same practice' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.supersedes_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM payer_plan_mapping m WHERE m.id = NEW.supersedes_id AND m.practice_id = NEW.practice_id AND m.plan_id = NEW.plan_id) THEN
    RAISE EXCEPTION 'a correction supersedes a mapping of the same plan' USING ERRCODE = 'check_violation';
  END IF;
  -- One mapping change per plan at a time, so two corrections never pass this check together.
  PERFORM pg_advisory_xact_lock(hashtextextended('payer_plan_mapping:' || NEW.plan_id::text, 0));
  IF EXISTS (
    WITH RECURSIVE ancestor (id, supersedes_id) AS (
      SELECT m.id, m.supersedes_id FROM payer_plan_mapping m WHERE m.id = NEW.supersedes_id
      UNION
      SELECT m.id, m.supersedes_id FROM payer_plan_mapping m JOIN ancestor a ON m.id = a.supersedes_id
    )
    SELECT 1 FROM payer_plan_mapping m
     WHERE m.plan_id = NEW.plan_id AND m.practice_id = NEW.practice_id
       AND daterange(m.effective_from, m.effective_to, '[)') && daterange(NEW.effective_from, NEW.effective_to, '[)')
       AND m.id NOT IN (SELECT a.id FROM ancestor a)
  ) THEN
    RAISE EXCEPTION 'mappings of one plan never overlap: correct the mapping in force with a mapping that supersedes it' USING ERRCODE = 'exclusion_violation';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.payer_plan_mapping_rules() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.payer_plan_mapping_rules() FROM PUBLIC;

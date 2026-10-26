-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- priced_line_rows_belong()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 0c2beafb3c63d2f3
-- Trigger function of: priced_line.priced_line_rows_belong
CREATE OR REPLACE FUNCTION public.priced_line_rows_belong()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1 FROM inserted i LEFT JOIN pricing_run r ON r.id = i.pricing_run_id AND r.practice_id = i.practice_id
     WHERE r.id IS NULL OR r.status NOT IN ('queued', 'running')
  ) THEN
    RAISE EXCEPTION 'a priced line joins an open pricing run of its practice; a complete run never changes' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM inserted i
     WHERE NOT EXISTS (SELECT 1 FROM service_line l WHERE l.id = i.service_line_id AND l.practice_id = i.practice_id)
        OR (i.mapping_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM payer_plan_mapping m WHERE m.id = i.mapping_id AND m.practice_id = i.practice_id))
        OR (i.contract_version_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM contract_version v WHERE v.id = i.contract_version_id AND v.practice_id = i.practice_id))
        OR (i.rate_record_id IS NOT NULL AND NOT EXISTS (
              SELECT 1 FROM rate_record x WHERE x.id = i.rate_record_id AND x.practice_id = i.practice_id AND x.contract_version_id = i.contract_version_id))
  ) THEN
    RAISE EXCEPTION 'a priced line prices a service line under a mapping, version and rate record of its own practice' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$function$;
ALTER FUNCTION public.priced_line_rows_belong() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.priced_line_rows_belong() FROM PUBLIC;

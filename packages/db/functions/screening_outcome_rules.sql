-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- screening_outcome_rules()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 59b133f63acf44b8
-- Trigger function of: screening_outcome.screening_outcome_rules
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.screening_outcome_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF OLD.upload_id IS NULL THEN
    RAISE EXCEPTION 'an outcome no longer linked to its screening is sealed' USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_outcome_sealed';
  END IF;
  IF (NEW.id, NEW.screened_month, NEW.source, NEW.channel, NEW.campaign, NEW.consented, NEW.row_band, NEW.left_out_band, NEW.refusal_codes, NEW.release_no, NEW.after_refusal)
     IS DISTINCT FROM (OLD.id, OLD.screened_month, OLD.source, OLD.channel, OLD.campaign, OLD.consented, OLD.row_band, OLD.left_out_band, OLD.refusal_codes, OLD.release_no, OLD.after_refusal) THEN
    RAISE EXCEPTION 'an outcome keeps what it was written with' USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_outcome_fixed';
  END IF;
  IF NEW.upload_id IS DISTINCT FROM OLD.upload_id AND NEW.upload_id IS NOT NULL THEN
    RAISE EXCEPTION 'an outcome''s link to its screening only goes' USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_outcome_fixed';
  END IF;
  IF NEW.stage IS DISTINCT FROM OLD.stage AND NOT (OLD.stage = 'accepted' AND NEW.stage IN ('priced', 'failed')) THEN
    RAISE EXCEPTION 'an outcome moves from accepted to priced or failed' USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_outcome_fixed';
  END IF;
  IF (NEW.engine_version, NEW.priced_share_pct, NEW.contract_share_pct, NEW.could_not_price_share_pct, NEW.not_screened_share_pct, NEW.anomaly_band, NEW.anomaly_difference_band)
     IS DISTINCT FROM (OLD.engine_version, OLD.priced_share_pct, OLD.contract_share_pct, OLD.could_not_price_share_pct, OLD.not_screened_share_pct, OLD.anomaly_band, OLD.anomaly_difference_band)
     AND NOT (OLD.stage = 'accepted' AND NEW.stage = 'priced') THEN
    RAISE EXCEPTION 'an outcome''s figures are set once, as it is priced' USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_outcome_fixed';
  END IF;
  IF NEW.first_open_band IS DISTINCT FROM OLD.first_open_band AND OLD.first_open_band IS NOT NULL THEN
    RAISE EXCEPTION 'an outcome''s first open is set once' USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_outcome_fixed';
  END IF;
  IF (OLD.converted AND NOT NEW.converted) OR (OLD.superseded AND NOT NEW.superseded) THEN
    RAISE EXCEPTION 'an outcome''s flags are set once' USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_outcome_fixed';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.screening_outcome_rules() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.screening_outcome_rules() FROM PUBLIC;

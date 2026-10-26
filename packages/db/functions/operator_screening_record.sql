-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- operator_screening_record(uuid,integer[],text[],bigint[],numeric[],bigint[],bigint[],boolean[],bigint[],numeric[],bigint[],bigint[],text[],text[],text[],text[],integer)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 2a47bbb68214da12
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.operator_screening_record(run uuid, row_nos integer[], dispositions text[], expected_line_cents bigint[], expected_line_unrounded numeric[], expected_cents bigint[], difference_cents bigint[], in_reduction_pools boolean[], reduced_line_cents bigint[], reduced_line_unrounded numeric[], reduced_cents bigint[], reduced_difference_cents bigint[], reduced_trace_sha256s text[], unpriced_reasons text[], unpriced_details text[], trace_sha256s text[], attempt integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  n integer := coalesce(cardinality($2), 0);
  recorded integer;
BEGIN
  IF n > 5000 OR coalesce(cardinality($3), 0) <> n OR coalesce(cardinality($4), 0) <> n OR coalesce(cardinality($5), 0) <> n OR coalesce(cardinality($6), 0) <> n
     OR coalesce(cardinality($7), 0) <> n OR coalesce(cardinality($8), 0) <> n OR coalesce(cardinality($9), 0) <> n OR coalesce(cardinality($10), 0) <> n
     OR coalesce(cardinality($11), 0) <> n OR coalesce(cardinality($12), 0) <> n OR coalesce(cardinality($13), 0) <> n OR coalesce(cardinality($14), 0) <> n
     OR coalesce(cardinality($15), 0) <> n OR coalesce(cardinality($16), 0) <> n THEN
    RAISE EXCEPTION 'at most 5,000 rows at a time, every field with a value for each' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE screening_run r SET progress_at = greatest(r.progress_at, now()) WHERE r.id = $1 AND r.status = 'pricing' AND r.attempts = $17;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'rows are recorded for a run being priced, by the attempt that claimed it' USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_run_attempt';
  END IF;
  UPDATE screening_result s
     SET disposition = f.disposition, expected_line_cents = f.line_cents, expected_line_unrounded = f.line_unrounded, expected_cents = f.total_cents,
         difference_cents = f.difference, in_reduction_pool = f.pooled, reduced_line_cents = f.reduced_line, reduced_line_unrounded = f.reduced_unrounded,
         reduced_cents = f.reduced_total, reduced_difference_cents = f.reduced_difference, reduced_trace_sha256 = f.reduced_trace,
         unpriced_reason = f.reason, unpriced_detail = f.detail, trace_sha256 = f.trace
    FROM unnest($2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
           AS f (row_no, disposition, line_cents, line_unrounded, total_cents, difference, pooled, reduced_line, reduced_unrounded, reduced_total,
                 reduced_difference, reduced_trace, reason, detail, trace)
   WHERE s.run_id = $1 AND s.row_no = f.row_no AND s.disposition = 'pending';
  GET DIAGNOSTICS recorded = ROW_COUNT;
  RETURN recorded;
END;
$function$;
ALTER FUNCTION public.operator_screening_record(uuid,integer[],text[],bigint[],numeric[],bigint[],bigint[],boolean[],bigint[],numeric[],bigint[],bigint[],text[],text[],text[],text[],integer) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.operator_screening_record(uuid,integer[],text[],bigint[],numeric[],bigint[],bigint[],boolean[],bigint[],numeric[],bigint[],bigint[],text[],text[],text[],text[],integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.operator_screening_record(uuid,integer[],text[],bigint[],numeric[],bigint[],bigint[],boolean[],bigint[],numeric[],bigint[],bigint[],text[],text[],text[],text[],integer) TO tp_operator;
GRANT EXECUTE ON FUNCTION public.operator_screening_record(uuid,integer[],text[],bigint[],numeric[],bigint[],bigint[],boolean[],bigint[],numeric[],bigint[],bigint[],text[],text[],text[],text[],integer) TO tp_screening;

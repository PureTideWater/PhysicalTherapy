-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- packet_version_deadline_stated()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 6c614d04965a83e4
-- Trigger function of: packet_version.packet_version_deadline_stated
CREATE OR REPLACE FUNCTION public.packet_version_deadline_stated()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  the_case uuid;
  line jsonb;
  trace jsonb;
  window_step jsonb;
  deadline jsonb := NEW.content -> 'deadline';
  verified_lines integer := 0;
  earliest text;
  stated_end text;
  named text[] := ARRAY[]::text[];
  stated text[] := ARRAY[]::text[];
  cited jsonb;
BEGIN
  IF NEW.content ->> 'format' IS DISTINCT FROM 'tp-packet/2' THEN
    RETURN NULL;
  END IF;
  SELECT p.case_id INTO the_case FROM packet p WHERE p.id = NEW.packet_id AND p.practice_id = NEW.practice_id;
  FOR line IN SELECT value FROM jsonb_array_elements(NEW.content -> 'lines') LOOP
    SELECT p.trace INTO trace FROM priced_line p WHERE p.id = (line ->> 'priced_line_id')::uuid;
    window_step := trace -> 'steps' -> 'window';
    IF line -> 'deadline' ->> 'status' IS DISTINCT FROM priced_line_deadline_status((line ->> 'priced_line_id')::uuid)
       OR line -> 'deadline' ->> 'ends_on' IS DISTINCT FROM window_step ->> 'ends_on'
       OR line -> 'deadline' ->> 'source' IS DISTINCT FROM window_step ->> 'source' THEN
      RAISE EXCEPTION 'a packet version states each line''s deadline from the line''s own window: its status, the day it ends and its source' USING ERRCODE = 'check_violation';
    END IF;
    IF priced_line_calculation(trace) IS NULL OR (line -> 'calculation') - 'trace_sha256' IS DISTINCT FROM priced_line_calculation(trace)
       OR coalesce(line -> 'calculation' ->> 'trace_sha256', '') !~ '^[0-9a-f]{64}$' THEN
      RAISE EXCEPTION 'a packet version states each line''s calculation as its stored trace has it: the method, the release, the steps, the rounding, the observed basis and the patient share' USING ERRCODE = 'check_violation';
    END IF;
    IF line -> 'deadline' ->> 'status' = 'verified' THEN
      verified_lines := verified_lines + 1;
    END IF;
    IF window_step ->> 'ends_on' IS NOT NULL AND (earliest IS NULL OR window_step ->> 'ends_on' < earliest) THEN
      earliest := window_step ->> 'ends_on';
    END IF;
    -- The evidence the line's window names: its contract version's cited window, or its release record.
    IF window_step ->> 'source' = 'contract' AND coalesce(trace #>> '{agreement,contract_version_id}', '') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       AND EXISTS (SELECT 1 FROM contract_version v WHERE v.id = (trace #>> '{agreement,contract_version_id}')::uuid AND v.practice_id = NEW.practice_id AND v.dispute_window_evidence IS NOT NULL) THEN
      named := named || ('contract_window:' || (trace #>> '{agreement,contract_version_id}'));
    ELSIF window_step ->> 'source' = 'release' AND jsonb_typeof(window_step -> 'record') = 'object' THEN
      named := named || ('release_record:' || (trace #>> '{release,number}') || ':' || (window_step -> 'record' ->> 'sha256'));
    END IF;
  END LOOP;
  IF deadline ->> 'basis' IS DISTINCT FROM (CASE WHEN NEW.dispute_level > 1 THEN 'next_level_window' ELSE 'line_windows' END)
     OR deadline ->> 'status' IS DISTINCT FROM packet_version_deadline_status(the_case, NEW.content) THEN
    RAISE EXCEPTION 'a packet version states its deadline as the database derives it: the lines'' windows at the first level, the next level''s window after a reopened denial' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.dispute_level > 1 THEN
    SELECT r.next_window_ends_on::text INTO stated_end
      FROM payer_response r JOIN submission s ON s.id = r.submission_id
     WHERE s.case_id = the_case AND r.reopens_case
     ORDER BY r.received_on DESC, r.created_at DESC, r.id DESC LIMIT 1;
  ELSE
    stated_end := earliest;
  END IF;
  IF deadline -> 'ends_on' IS DISTINCT FROM coalesce(to_jsonb(stated_end), 'null'::jsonb)
     OR deadline -> 'lines' IS DISTINCT FROM to_jsonb(jsonb_array_length(NEW.content -> 'lines'))
     OR deadline -> 'lines_verified' IS DISTINCT FROM to_jsonb(verified_lines)
     OR jsonb_typeof(deadline -> 'causes') IS DISTINCT FROM 'array'
     OR jsonb_path_exists(deadline -> 'causes', '$[*] ? (@.type() != "string" || !(@ like_regex "^[A-Z][A-Z_]{0,39}$"))')
     OR (deadline ->> 'status' = 'verified' AND jsonb_array_length(deadline -> 'causes') > 0) THEN
    RAISE EXCEPTION 'a packet version states the day its deadline ends and its lines as its inputs give them' USING ERRCODE = 'check_violation';
  END IF;
  IF jsonb_typeof(deadline -> 'sources') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'a packet version names the evidence its deadline rests on as it stands' USING ERRCODE = 'check_violation';
  END IF;
  FOR cited IN SELECT value FROM jsonb_array_elements(deadline -> 'sources') LOOP
    IF cited ->> 'kind' = 'contract_window'
       AND (cited - ARRAY['kind', 'contract_version_id', 'days', 'document_id', 'page', 'quote', 'hash', 'verified_by', 'verified_at']) = '{}'::jsonb
       AND EXISTS (
         SELECT 1 FROM contract_version v
          WHERE v.id::text = cited ->> 'contract_version_id' AND v.practice_id = NEW.practice_id AND v.dispute_window_evidence IS NOT NULL
            AND cited -> 'document_id' = v.dispute_window_evidence -> 'document_id' AND cited -> 'page' = v.dispute_window_evidence -> 'page'
            AND cited -> 'quote' = v.dispute_window_evidence -> 'quote' AND cited -> 'hash' = v.dispute_window_evidence -> 'hash'
            AND cited -> 'days' = coalesce(to_jsonb(v.dispute_window_days), 'null'::jsonb)
            AND cited -> 'verified_by' = coalesce(to_jsonb(v.dispute_window_verified_by::text), 'null'::jsonb)
            AND CASE WHEN v.dispute_window_verified_at IS NULL THEN cited -> 'verified_at' = 'null'::jsonb
                     ELSE coalesce(cited ->> 'verified_at', '') ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'
                          AND (cited ->> 'verified_at')::timestamptz = date_trunc('milliseconds', v.dispute_window_verified_at) END
       ) THEN
      stated := stated || ('contract_window:' || (cited ->> 'contract_version_id'));
    ELSIF cited ->> 'kind' = 'release_record'
       AND (cited - ARRAY['kind', 'release_no', 'sha256', 'program', 'level']) = '{}'::jsonb
       AND jsonb_typeof(cited -> 'release_no') = 'number' AND coalesce(cited ->> 'sha256', '') ~ '^[0-9a-f]{64}$'
       AND cited -> 'level' = coalesce((SELECT to_jsonb(r.verification) FROM rule_record r
                                         WHERE r.release_no::text = cited ->> 'release_no' AND r.record_type = 'dispute_window' AND r.sha256 = cited ->> 'sha256'), 'null'::jsonb)
       AND EXISTS (
         SELECT 1 FROM jsonb_array_elements(NEW.content -> 'lines') l JOIN priced_line p ON p.id = (l ->> 'priced_line_id')::uuid
          WHERE p.trace #>> '{release,number}' = cited ->> 'release_no' AND p.trace #>> '{steps,window,record,sha256}' = cited ->> 'sha256'
            AND cited -> 'program' = coalesce(p.trace #> '{steps,window,record,key,program}', 'null'::jsonb)
       ) THEN
      stated := stated || ('release_record:' || (cited ->> 'release_no') || ':' || (cited ->> 'sha256'));
    ELSE
      RAISE EXCEPTION 'a packet version names the evidence its deadline rests on as it stands' USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  IF cardinality(stated) <> (SELECT count(DISTINCT x) FROM unnest(stated) x)
     OR (SELECT coalesce(array_agg(DISTINCT x ORDER BY x), '{}') FROM unnest(stated) x) IS DISTINCT FROM (SELECT coalesce(array_agg(DISTINCT x ORDER BY x), '{}') FROM unnest(named) x) THEN
    RAISE EXCEPTION 'a packet version names exactly the evidence its lines'' windows rest on, each once' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$function$;
ALTER FUNCTION public.packet_version_deadline_stated() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.packet_version_deadline_stated() FROM PUBLIC;

-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- operator_screening_expire(integer,text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 75da8d8d50eeb330
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.operator_screening_expire(at_most integer, request text)
 RETURNS TABLE(prospects integer, runs integer, leads integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  doomed uuid[];
  doomed_leads uuid[];
  run_total integer;
BEGIN
  SELECT coalesce(array_agg(x.id), '{}') INTO doomed FROM (
    SELECT p.id FROM screening_prospect p WHERE p.expires_at <= now()
     ORDER BY p.expires_at, p.id
     LIMIT least(greatest(coalesce($1, 0), 0), 1000)
       FOR UPDATE SKIP LOCKED) x;
  SELECT count(*)::integer INTO run_total FROM screening_run r JOIN screening_upload u ON u.id = r.upload_id WHERE u.prospect_id = ANY (doomed);
  DELETE FROM screening_prospect p WHERE p.id = ANY (doomed);
  INSERT INTO audit_event (actor_kind, action, object_type, object_id, purpose, request_id)
  SELECT 'system', 'screening_expired', 'screening_prospect', d.id, 'screening', $2 FROM unnest(doomed) AS d (id);
  SELECT coalesce(array_agg(x.id), '{}') INTO doomed_leads FROM (
    SELECT l.id FROM screening_lead l WHERE l.expires_at <= now()
     ORDER BY l.expires_at, l.id
     LIMIT least(greatest(coalesce($1, 0), 0), 1000)
       FOR UPDATE SKIP LOCKED) x;
  DELETE FROM screening_lead l WHERE l.id = ANY (doomed_leads);
  INSERT INTO audit_event (actor_kind, action, object_type, object_id, purpose, request_id)
  SELECT 'system', 'screening_lead_expired', 'screening_lead', d.id, 'screening', $2 FROM unnest(doomed_leads) AS d (id);
  DELETE FROM screening_queue_tally t WHERE t.created_at < date_trunc('day', now(), 'UTC') - interval '1 day';
  RETURN QUERY SELECT cardinality(doomed), run_total, cardinality(doomed_leads);
END;
$function$;
ALTER FUNCTION public.operator_screening_expire(integer,text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.operator_screening_expire(integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.operator_screening_expire(integer,text) TO tp_operator;

-- SUITE-CAP-3's "for Lane A" candidate (needs a founder freeze exception: a ledger function), measured on top of state
-- (c): ledger_line_net reads the corrected entry and its root only for a reversal or adjustment, by primary key, instead
-- of LEFT JOINing the whole ledger twice; the same answer for every line and stage (a reversal or adjustment counts as
-- the stage of the entry it finally corrects; one with no such entry counts as none).
CREATE OR REPLACE FUNCTION public.ledger_line_net(line uuid, counted text)
 RETURNS bigint
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT coalesce(sum(e.amount_cents), 0)::bigint
    FROM ledger_entry e
   WHERE e.service_line_id = line
     AND CASE WHEN e.stage IN ('reversed', 'adjusted')
              THEN (SELECT CASE WHEN t.stage = 'adjusted' THEN (SELECT r.stage FROM ledger_entry r WHERE r.id = t.evidence_id) ELSE t.stage END
                      FROM ledger_entry t WHERE t.id = e.evidence_id)
              ELSE e.stage END = counted
$function$;

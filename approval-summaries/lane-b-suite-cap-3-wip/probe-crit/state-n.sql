-- Completeness check: ledger_line_net read by its line's practice and line through ledger_entry_by_line
-- (practice_id, service_line_id, seq). On a ledger the planner has never seen analyzed, 14.1's form (and the base's)
-- read the line's entries through ledger_entry_by_date with only the RLS practice qual as Index Cond and
-- service_line_id as a Filter: every entry of the practice per call (EXPLAIN (GENERIC_PLAN), cap3_fx_10000_seed). The
-- line's practice (an entry's practice is its case's, its case's lines' and so its line's: ledger_entry_rules,
-- case_line_belongs) and ORDER BY e.seq (which ledger_entry_by_line returns for free) make that index the cheaper path
-- whatever the statistics; the sum is the same (integer sum, order-free). Corrections' targets by primary key as 14.1.
CREATE OR REPLACE FUNCTION public.ledger_line_net(line uuid, counted text)
 RETURNS bigint
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT coalesce(sum(x.amount_cents), 0)::bigint
    FROM (SELECT e.amount_cents, e.stage, e.evidence_id
            FROM ledger_entry e
           WHERE e.practice_id = (SELECT l.practice_id FROM service_line l WHERE l.id = line)
             AND e.service_line_id = line
           ORDER BY e.seq) x
   WHERE CASE WHEN x.stage IN ('reversed', 'adjusted')
              THEN (SELECT CASE WHEN t.stage = 'adjusted' THEN (SELECT r.stage FROM ledger_entry r WHERE r.id = t.evidence_id) ELSE t.stage END
                      FROM ledger_entry t WHERE t.id = x.evidence_id)
              ELSE x.stage END = counted
$function$;

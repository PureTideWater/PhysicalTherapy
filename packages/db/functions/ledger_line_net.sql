-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- ledger_line_net(uuid,text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: f151e27ea09f28c1
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.ledger_line_net(line uuid, counted text)
 RETURNS bigint
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT coalesce(sum(e.amount_cents), 0)::bigint
    FROM ledger_entry e
    LEFT JOIN ledger_entry t ON e.stage IN ('reversed', 'adjusted') AND t.id = e.evidence_id
    LEFT JOIN ledger_entry r ON t.stage = 'adjusted' AND r.id = t.evidence_id
   WHERE e.service_line_id = line
     AND CASE WHEN e.stage IN ('reversed', 'adjusted') THEN CASE WHEN t.stage = 'adjusted' THEN r.stage ELSE t.stage END ELSE e.stage END = counted
$function$;
ALTER FUNCTION public.ledger_line_net(uuid,text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.ledger_line_net(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ledger_line_net(uuid,text) TO tp_app;

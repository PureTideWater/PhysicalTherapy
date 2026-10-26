-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- ledger_line_stage(uuid)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: fe8938ec3ec27c76
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.ledger_line_stage(line uuid)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  WITH proof AS (
    SELECT ledger_proof_level(l.practice_id) AS level FROM service_line l WHERE l.id = line
  ), counted AS (
    SELECT e.seq, e.amount_cents,
           CASE WHEN e.stage IN ('reversed', 'adjusted') THEN CASE WHEN t.stage = 'adjusted' THEN r.stage ELSE t.stage END ELSE e.stage END AS stage,
           e.stage NOT IN ('reversed', 'adjusted') AND NOT EXISTS (SELECT 1 FROM ledger_entry u WHERE u.stage = 'reversed' AND u.evidence_id = e.id) AS standing
      FROM ledger_entry e
      LEFT JOIN ledger_entry t ON e.stage IN ('reversed', 'adjusted') AND t.id = e.evidence_id
      LEFT JOIN ledger_entry r ON t.stage = 'adjusted' AND r.id = t.evidence_id
     WHERE e.service_line_id = line
  ), totals AS (
    SELECT coalesce(sum(c.amount_cents) FILTER (WHERE c.stage = 'approved'), 0) AS approved,
           coalesce(sum(c.amount_cents) FILTER (WHERE c.stage = p.level), 0) AS proved,
           coalesce(max(c.seq) FILTER (WHERE c.stage = 'approved' AND c.standing), -1) AS last_approval,
           coalesce(max(c.seq) FILTER (WHERE c.stage = p.level AND c.standing), -1) AS last_proof,
           coalesce(max(c.seq) FILTER (WHERE c.stage = 'recouped' AND c.standing), -1) AS last_recoupment
      FROM proof p LEFT JOIN counted c ON true
  )
  SELECT CASE
           WHEN t.approved <= 0 OR t.last_recoupment > t.last_approval THEN NULL
           WHEN t.proved >= t.approved AND t.last_proof > t.last_recoupment THEN 'recovered'
           ELSE 'payer_approved'
         END
    FROM totals t
$function$;
ALTER FUNCTION public.ledger_line_stage(uuid) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.ledger_line_stage(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ledger_line_stage(uuid) TO tp_app;

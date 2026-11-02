-- SUITE-CAP-3 profile: the plans of the pass's per-line statements, for one case line of the practice, as the
-- application role in the practice's scope. Usage: psql -d <db> -v practice=<id> -f explain.sql
-- (statements copied from apps/worker/src/reconcile/remittances.ts at 83d71fd6; the parameters as the pass sends them)
SELECT set_config('app.practice_ids', '{' || :'practice' || '}', false);
SELECT cl.service_line_id AS line, l.claim_id AS claim, c.remittance_id AS remit, l.procedure_code AS code, l.service_date AS dos,
       (SELECT m.claim_id FROM ledger_match m WHERE m.kind = 'claim' AND m.service_line_id = cl.service_line_id LIMIT 1) AS matched
  FROM case_line cl JOIN service_line l ON l.id = cl.service_line_id JOIN claim c ON c.id = l.claim_id
 ORDER BY l.claim_id, l.line_no OFFSET (SELECT count(*) / 2 FROM case_line) LIMIT 1 \gset
SET ROLE tp_app;
\echo '== claimLines (the case line''s claim and its correction)'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) WITH RECURSIVE named (id) AS (
       SELECT unnest(ARRAY[:'claim', coalesce(:'matched', :'claim')]::uuid[])
        UNION
       SELECT k.id FROM claim k JOIN named n ON k.superseded_by_claim_id = n.id)
     SELECT s.id, s.claim_id, s.line_no, s.procedure_code, s.modifiers, s.units::text AS units, s.service_date::text AS service_date,
            s.observed_allowed_cents::text AS observed_allowed_cents, s.charge_cents::text AS charge_cents, s.paid_cents::text AS paid_cents,
            c.paid_cents::text AS claim_paid_cents, EXISTS (SELECT 1 FROM adjustment a WHERE a.service_line_id = s.id) AS carries_adjustments,
            (SELECT COALESCE(sum(a.amount_cents), 0) FROM adjustment a WHERE a.service_line_id = s.id AND a.group_code <> 'PR')::text AS line_reduction_cents,
            (SELECT k.id FROM claim k WHERE k.superseded_by_claim_id = s.claim_id ORDER BY k.created_at DESC, k.id LIMIT 1) AS corrects_claim_id
       FROM service_line s JOIN claim c ON c.id = s.claim_id WHERE s.claim_id IN (SELECT id FROM named) ORDER BY s.claim_id, s.line_no;
\echo '== candidatesFor byControl'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) SELECT c.id, c.remittance_id, r.bpr16_date::text AS paid_on, c.patient_control_number
       FROM claim c JOIN remittance r ON r.id = c.remittance_id
      WHERE c.practice_id = :'practice' AND r.status = 'loaded' AND c.claim_status_code <> '22'
   AND c.id <> ALL (ARRAY[:'claim']::uuid[]) AND c.remittance_id <> :'remit' AND c.created_at >= (SELECT o.created_at FROM claim o WHERE o.id = :'claim')
   AND NOT EXISTS (SELECT 1 FROM ledger_match m WHERE m.kind = 'claim' AND m.claim_id = c.id AND m.service_line_id = :'line')
   AND NOT EXISTS (SELECT 1 FROM case_line x JOIN service_line xl ON xl.id = x.service_line_id WHERE xl.claim_id = c.id)
        AND (c.id IN (SELECT k.superseded_by_claim_id FROM claim k WHERE k.id = ANY (ARRAY[:'claim']::uuid[]))
             OR c.payer_claim_control_number_hash IN (SELECT k.payer_claim_control_number_hash FROM claim k WHERE k.id = ANY (ARRAY[:'claim']::uuid[])))
      ORDER BY r.bpr16_date, c.created_at, c.id;
\echo '== candidatesFor byPatient'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) SELECT c.id, c.remittance_id, r.bpr16_date::text AS paid_on, c.patient_control_number
       FROM claim c JOIN remittance r ON r.id = c.remittance_id
      WHERE c.practice_id = :'practice' AND r.status = 'loaded' AND c.claim_status_code <> '22'
   AND c.id <> ALL (ARRAY[:'claim']::uuid[]) AND c.remittance_id <> :'remit' AND c.created_at >= (SELECT o.created_at FROM claim o WHERE o.id = :'claim')
   AND NOT EXISTS (SELECT 1 FROM ledger_match m WHERE m.kind = 'claim' AND m.claim_id = c.id AND m.service_line_id = :'line')
   AND NOT EXISTS (SELECT 1 FROM case_line x JOIN service_line xl ON xl.id = x.service_line_id WHERE xl.claim_id = c.id)
        AND EXISTS (SELECT 1 FROM service_line s WHERE s.claim_id = c.id AND s.procedure_code = :'code' AND s.service_date IS NOT DISTINCT FROM :'dos'::date)
      ORDER BY r.bpr16_date, c.created_at, c.id;
\echo '== stages.select'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) SELECT cl.service_line_id, ledger_line_stage(cl.service_line_id) AS ledger_stage,
            (SELECT s.stage FROM line_status s WHERE s.service_line_id = cl.service_line_id ORDER BY s.seq DESC LIMIT 1) AS current_stage
       FROM case_line cl
      WHERE cl.practice_id = :'practice' AND EXISTS (SELECT 1 FROM ledger_entry e WHERE e.service_line_id = cl.service_line_id)
      ORDER BY cl.service_line_id;
RESET ROLE;

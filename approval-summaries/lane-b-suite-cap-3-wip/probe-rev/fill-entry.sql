BEGIN;
SET LOCAL session_replication_role = replica;
INSERT INTO ledger_entry (practice_id, case_id, service_line_id, stage, amount_cents, evidence_kind, evidence_id, match_id, effective_on)
SELECT '00000000-0000-4000-8000-00000000f111'::uuid, l.case_id, l.line_id, s.stage, 10000,
       CASE s.stage WHEN 'approved' THEN 'claim' ELSE 'posting_row' END, gen_random_uuid(), gen_random_uuid(), date '2026-01-01' + (l.i % 300)
  FROM (SELECT i, gen_random_uuid() AS line_id, ('00000000-0000-4000-8000-' || lpad(to_hex(i % 500), 12, '0'))::uuid AS case_id
          FROM generate_series(1, (100000 / 2)) AS i) l
 CROSS JOIN (VALUES ('approved'), ('posted')) AS s (stage);
COMMIT;
ANALYZE ledger_entry;

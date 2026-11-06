-- 100,000 SYNTHETIC claim matches of a tenant that is no practice (random ids; no triggers, no foreign keys under
-- session_replication_role = replica): ledger_match the size a running multi-tenant deployment's is; RLS keeps them out.
BEGIN;
SET LOCAL session_replication_role = replica;
INSERT INTO ledger_match (practice_id, kind, claim_id, remittance_id, service_line_id, outcome)
SELECT '00000000-0000-4000-8000-00000000f111'::uuid, 'claim', gen_random_uuid(), ('00000000-0000-4000-8000-' || lpad(to_hex(i % 2000), 12, '0'))::uuid, gen_random_uuid(), 'approved'
  FROM generate_series(1, 100000) AS i;
COMMIT;

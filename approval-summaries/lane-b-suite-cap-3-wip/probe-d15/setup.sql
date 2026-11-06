-- SUITE-CAP-3 review probe (SEC-3): D15's never-matched read. SYNTHETIC identifiers only (random UUIDs, no PHI columns).
-- Tables mirror posting_row / ledger_match's keys and indexes (20261023120000); no RLS (superuser), autovacuum off.
DROP TABLE IF EXISTS posting_row, ledger_match;
CREATE TABLE posting_row (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), practice_id uuid NOT NULL, check_or_trace text NOT NULL,
  posted_on date NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), row_no int NOT NULL, amount_cents bigint NOT NULL) WITH (autovacuum_enabled = off);
CREATE INDEX posting_row_by_check ON posting_row (practice_id, check_or_trace);
CREATE TABLE ledger_match (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), practice_id uuid NOT NULL, kind text NOT NULL, posting_row_id uuid,
  remittance_id uuid NOT NULL, service_line_id uuid, evidence_id uuid, reversed_at timestamptz) WITH (autovacuum_enabled = off);
CREATE INDEX ledger_match_by_remittance ON ledger_match (practice_id, remittance_id);
CREATE INDEX ledger_match_by_line ON ledger_match (practice_id, service_line_id) WHERE service_line_id IS NOT NULL;

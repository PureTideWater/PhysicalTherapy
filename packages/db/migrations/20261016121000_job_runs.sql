-- Job runs (PRD 6, Monitoring jobs and notifications: "a failed job retries three times then
-- alerts"; PRD 7, Practice dashboard: "last run status; run failed banner with the job reference";
-- PRD 8, job and job_run; Data dictionary, Operations: "pg-boss tables plus singleton_key,
-- practice_id, idempotency_key, attempts, outcome"; test matrix JOB-01 and JOB-02; docs/adr/0019).
--
-- pg-boss keeps the queue in its own schema, which the application role cannot read. job_run is the
-- practice's view of it: one row per practice job, written by the worker inside the job's own scope as
-- each attempt starts and ends, so the dashboard can say when the last run failed and name the job.
-- Codes and opaque IDs only: no PHI by design, though its practice_id NOT NULL makes it a registered
-- tenant table like every other.
--
-- Runs as tp_owner. Safe with the previous image running: one new table.

CREATE TABLE job_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practice (id),
  -- The pg-boss job's ID, which is the job's actor (app.actor_id) in its transactions.
  job_id uuid NOT NULL,
  job_type text NOT NULL CHECK (job_type IN ('intake', 'parse_835', 'price', 'triage', 'reconcile', 'digest', 'export')),
  -- The job's pg-boss singleton key (type, practice and subject) and its subject alone.
  singleton_key text NOT NULL CHECK (singleton_key ~ '^[a-z0-9_]+:[0-9a-f-]{36}:[A-Za-z0-9-]{1,64}$'),
  idempotency_key text NOT NULL CHECK (idempotency_key ~ '^[A-Za-z0-9-]{1,64}$'),
  attempts integer NOT NULL CHECK (attempts >= 1),
  -- running: an attempt is under way; retrying: an attempt failed and another follows; failed: the
  -- last attempt failed (the operator alert fired); succeeded.
  outcome text NOT NULL CHECK (outcome IN ('running', 'retrying', 'succeeded', 'failed')),
  error_code text CHECK (error_code ~ '^[A-Z][A-Z0-9_]{0,63}$'),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT job_run_once UNIQUE (job_id),
  CONSTRAINT job_run_finished CHECK ((outcome = 'running') = (finished_at IS NULL))
);
CREATE INDEX job_run_by_practice ON job_run (practice_id, started_at DESC, id);

INSERT INTO phi_table_registry (table_name, registered_by, policy_name) VALUES
  ('job_run', '20261016121000_job_runs', 'job_run_tenant');

CREATE TRIGGER job_run_updated_at BEFORE UPDATE ON job_run FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE job_run ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_run FORCE ROW LEVEL SECURITY;
CREATE POLICY job_run_tenant ON job_run
  USING (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]))
  WITH CHECK (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]));

REVOKE ALL ON job_run FROM PUBLIC;
GRANT SELECT ON job_run TO tp_app;
GRANT INSERT (id, practice_id, job_id, job_type, singleton_key, idempotency_key, attempts, outcome, error_code, started_at, finished_at) ON job_run TO tp_app;
GRANT UPDATE (attempts, outcome, error_code, started_at, finished_at) ON job_run TO tp_app;

-- The audit log and the restore-drill evidence (PRD sections 6 Audit log, 8, 16 Audit log and
-- Backups and restore; Data dictionary, Operations; docs/adr/0013 and 0014). No PHI by design: every
-- text column is a code or an opaque reference, so nothing a patient could be identified by fits.

CREATE TABLE audit_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_kind text NOT NULL CHECK (actor_kind IN ('user', 'service', 'system')),
  action text NOT NULL CHECK (action ~ '^[a-z][a-z0-9_]{0,63}$'),
  object_type text NOT NULL CHECK (object_type ~ '^[a-z][a-z0-9_]{0,63}$'),
  object_id uuid,
  practice_id uuid,
  -- The grant or support grant the access rested on; null when the actor's own group owns the practice.
  grant_id uuid,
  purpose text CHECK (purpose ~ '^[a-z][a-z0-9_]{0,63}$'),
  request_id text CHECK (request_id ~ '^[A-Za-z0-9._:-]{1,128}$'),
  at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT audit_event_actor CHECK (actor_kind = 'system' OR actor_id IS NOT NULL),
  CONSTRAINT audit_event_read_purpose CHECK (action <> 'read' OR purpose IS NOT NULL)
);
-- "Who read claim X" in one query, the practice's access log, and the nightly copy by day.
CREATE INDEX audit_event_by_practice ON audit_event (practice_id, at);
CREATE INDEX audit_event_by_object ON audit_event (object_type, object_id);
CREATE INDEX audit_event_by_at ON audit_event (at);

-- Append-only for every role, superusers and the owner included.
CREATE FUNCTION reject_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is refused', TG_TABLE_NAME, TG_OP USING ERRCODE = 'raise_exception';
END;
$$;

CREATE TRIGGER audit_event_append_only BEFORE UPDATE OR DELETE ON audit_event
  FOR EACH ROW EXECUTE FUNCTION reject_change();
CREATE TRIGGER audit_event_no_truncate BEFORE TRUNCATE ON audit_event
  FOR EACH STATEMENT EXECUTE FUNCTION reject_change();

ALTER TABLE audit_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_event FORCE ROW LEVEL SECURITY;
-- The practice reads its own access log: its administrators, inside its scope.
CREATE POLICY audit_event_access_log ON audit_event FOR SELECT TO tp_app
  USING (
    practice_id = ANY (current_setting('app.practice_ids', true)::uuid[])
    AND practice_id = ANY ((SELECT app_actor_admin_practice_ids())::uuid[])
  );
-- The application records events for the transaction's own actor, inside its scope.
CREATE POLICY audit_event_record ON audit_event FOR INSERT TO tp_app
  WITH CHECK (
    actor_id = app_actor_id()
    AND (practice_id IS NULL OR practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]))
  );
-- The operator path (owner role): the nightly copy reads every row; platform workflows record events.
CREATE POLICY audit_event_operator_read ON audit_event FOR SELECT TO tp_owner USING (true);
CREATE POLICY audit_event_operator_record ON audit_event FOR INSERT TO tp_owner WITH CHECK (true);

REVOKE ALL ON audit_event FROM PUBLIC;
GRANT SELECT ON audit_event TO tp_app;
GRANT INSERT (id, actor_id, actor_kind, action, object_type, object_id, practice_id, grant_id, purpose, request_id) ON audit_event TO tp_app;
REVOKE UPDATE, DELETE, TRUNCATE ON audit_event FROM tp_app;

-- One row per monthly restore drill (SEC-13): the snapshot restored, where, how long, the row counts
-- and the catalog test's result on the restored instance. Written by the worker's operator path;
-- evidence never changes. The application role has no access.
CREATE TABLE restore_drill (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_ref text NOT NULL CHECK (btrim(snapshot_ref) <> ''),
  target_ref text NOT NULL CHECK (btrim(target_ref) <> ''),
  started_at timestamptz NOT NULL,
  completed_at timestamptz NOT NULL,
  duration_ms bigint NOT NULL CHECK (duration_ms >= 0),
  outcome text NOT NULL CHECK (outcome IN ('passed', 'failed')),
  row_counts jsonb NOT NULL CHECK (jsonb_typeof(row_counts) = 'object'),
  catalog_problems jsonb NOT NULL CHECK (jsonb_typeof(catalog_problems) = 'array'),
  error_code text CHECK (error_code ~ '^[A-Z][A-Z0-9_]{0,63}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT restore_drill_order CHECK (completed_at >= started_at),
  CONSTRAINT restore_drill_failure_code CHECK ((outcome = 'failed') = (error_code IS NOT NULL))
);

CREATE TRIGGER restore_drill_append_only BEFORE UPDATE OR DELETE ON restore_drill
  FOR EACH ROW EXECUTE FUNCTION reject_change();
CREATE TRIGGER restore_drill_no_truncate BEFORE TRUNCATE ON restore_drill
  FOR EACH STATEMENT EXECUTE FUNCTION reject_change();

REVOKE ALL ON restore_drill FROM PUBLIC;
REVOKE ALL ON restore_drill FROM tp_app;
REVOKE ALL ON FUNCTION reject_change() FROM PUBLIC;

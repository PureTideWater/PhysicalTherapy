-- Global content: numbered rule releases and their records (PRD section 9; Data dictionary,
-- Global content). No practice_id. Read-only to the application role, and immutable once a release
-- is published: the database refuses any change to a published release's rows, whoever asks.
-- Runs as tp_owner (the migration runner sets the role), so tp_owner owns both tables.

CREATE TABLE rule_release (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  release_no integer NOT NULL UNIQUE CHECK (release_no > 0),
  published_at timestamptz,
  manifest_sha256 text NOT NULL CHECK (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE rule_record (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  release_no integer NOT NULL REFERENCES rule_release (release_no),
  record_type text NOT NULL CHECK (record_type IN (
    'pfs_rvu', 'pfs_gpci', 'conversion_factor', 'mppr_rate', 'therapy_threshold', 'assistant_modifier',
    'sequestration', 'ncci_ptp', 'ncci_mue', 'carc', 'rarc', 'claim_status_code', 'state_prompt_pay',
    'dispute_window', 'locality_map', 'denial_category'
  )),
  key jsonb NOT NULL CHECK (jsonb_typeof(key) = 'object'),
  value jsonb NOT NULL CHECK (jsonb_typeof(value) = 'object'),
  effective_from date NOT NULL,
  effective_to date CHECK (effective_to IS NULL OR effective_to >= effective_from),
  source jsonb NOT NULL CHECK (jsonb_typeof(source) = 'object'),
  verification text NOT NULL CHECK (verification IN ('L1', 'L2', 'L3')),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One rule starts once per release; the content checker also refuses overlapping windows.
CREATE UNIQUE INDEX rule_record_identity ON rule_record (release_no, record_type, key, effective_from);
CREATE INDEX rule_record_by_type ON rule_record (release_no, record_type);

-- A release is inserted unpublished, filled, then published in the same transaction. After that:
-- no update except that one publication step, and no delete, ever.
CREATE FUNCTION rule_release_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.published_at IS NULL AND NEW.published_at IS NOT NULL
     AND NEW.id = OLD.id AND NEW.release_no = OLD.release_no AND NEW.manifest_sha256 = OLD.manifest_sha256
     AND NEW.notes = OLD.notes AND NEW.created_at = OLD.created_at THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'rule_release % is immutable: a published release never changes; load a new release instead', OLD.release_no
    USING ERRCODE = 'raise_exception';
END;
$$;

CREATE TRIGGER rule_release_immutable BEFORE UPDATE OR DELETE ON rule_release
  FOR EACH ROW EXECUTE FUNCTION rule_release_immutable();

-- Records join only an unpublished release, and never change or leave once inserted.
CREATE FUNCTION rule_record_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF EXISTS (SELECT 1 FROM rule_release WHERE release_no = NEW.release_no AND published_at IS NOT NULL) THEN
      RAISE EXCEPTION 'rule_release % is published: no record can be added to it', NEW.release_no
        USING ERRCODE = 'raise_exception';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'rule_record rows are immutable: a published release never changes; load a new release instead'
    USING ERRCODE = 'raise_exception';
END;
$$;

CREATE TRIGGER rule_record_immutable BEFORE INSERT OR UPDATE OR DELETE ON rule_record
  FOR EACH ROW EXECUTE FUNCTION rule_record_immutable();

CREATE FUNCTION rule_content_no_truncate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% cannot be truncated: rule releases are immutable', TG_TABLE_NAME USING ERRCODE = 'raise_exception';
END;
$$;

CREATE TRIGGER rule_release_no_truncate BEFORE TRUNCATE ON rule_release
  FOR EACH STATEMENT EXECUTE FUNCTION rule_content_no_truncate();
CREATE TRIGGER rule_record_no_truncate BEFORE TRUNCATE ON rule_record
  FOR EACH STATEMENT EXECUTE FUNCTION rule_content_no_truncate();

-- Global tables: the application role reads and never writes (Data dictionary conventions).
REVOKE ALL ON rule_release, rule_record FROM PUBLIC;
GRANT SELECT ON rule_release, rule_record TO tp_app;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON rule_release, rule_record FROM tp_app;
REVOKE ALL ON FUNCTION rule_release_immutable(), rule_record_immutable(), rule_content_no_truncate() FROM PUBLIC;

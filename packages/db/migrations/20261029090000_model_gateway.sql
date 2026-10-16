-- The model gateway's records (PRD 14, Logging and evaluation and Operational limits; Data dictionary,
-- Model gateway and Operations: model_call, eval_example and feature_flag; docs/adr/0048).
--
-- - feature_flag: flags by key, for every practice (global), an organization's practices or one
--   practice, with a jsonb value. A global table without row-level security: the application role may
--   only read it, and a platform administrator (feature_flag.manage) sets a flag through
--   set_feature_flag(), which records an audit event. No PHI by design: its keys are a closed list and
--   each value is a boolean or integer cents as text. The gateway reads three keys: the kill switch
--   (model.kill_switch), the denial-letter reader (model.read_denial_letter, off unless set) and the
--   per-practice daily budget (model.daily_budget_cents).
-- - model_call: one row per call the gateway makes, in the product's own database only, never text:
--   the practice (null only for a synthetic evaluation call, which the operator role writes), the user
--   or job, the purpose, the provider and model identifier, the prompt version, the SHA-256 of every
--   input document and of the output, token counts, the cost in cents (rounded up once, the unrounded
--   value beside it), the citations returned as pages, markers and quote hashes, the verifier's result,
--   the outcome, the attempts and the latency. Later, once, the reviewer's decision and the fields the
--   reviewer changed, by a person who may review the call's purpose. A completed call is logged once
--   per idempotency key. Nothing else ever changes, and no row is deleted.
-- - eval_example: evaluation data from synthetic sources (no practice; the operator role writes them)
--   or permitted ones (a practice's reviewer correction under its signed data-rights agreement). A
--   denial letter's example is synthetic only, since a letter carries PHI. Never changed or deleted.
--
-- model_call and eval_example carry practice_id, nullable as the data dictionary defines it, so they
-- force row-level security with the tenant policy (and the operator's policy for synthetic rows) and
-- are named in the catalog's NULLABLE_PRACTICE_ID_TABLES rather than the PHI table registry.
--
-- Runs as tp_owner. Safe with the previous image running: three new tables and new functions; the
-- previous image neither reads nor writes them.

-- ---------------------------------------------------------------------------------------------------
-- feature_flag
-- ---------------------------------------------------------------------------------------------------

CREATE TABLE feature_flag (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL CHECK (key IN ('model.kill_switch', 'model.read_denial_letter', 'model.daily_budget_cents')),
  scope text NOT NULL CHECK (scope IN ('global', 'organization', 'practice')),
  -- The organization or practice the flag is set for; null for a global flag.
  scope_id uuid,
  value jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT feature_flag_scope_id CHECK ((scope = 'global') = (scope_id IS NULL)),
  CONSTRAINT feature_flag_value CHECK (CASE key
    WHEN 'model.daily_budget_cents' THEN jsonb_typeof(value) = 'string' AND (value #>> '{}') ~ '^(0|[1-9][0-9]{0,11})$'
    ELSE jsonb_typeof(value) = 'boolean'
  END),
  CONSTRAINT feature_flag_once UNIQUE NULLS NOT DISTINCT (key, scope, scope_id)
);

CREATE TRIGGER feature_flag_updated_at BEFORE UPDATE ON feature_flag FOR EACH ROW EXECUTE FUNCTION set_updated_at();

REVOKE ALL ON feature_flag FROM PUBLIC;
GRANT SELECT ON feature_flag TO tp_app;

-- A platform administrator sets a flag (feature_flag.manage, checked here): an organization's or a
-- practice's must exist. The change is recorded in the audit log, for the practice when it is one.
CREATE FUNCTION set_feature_flag(flag_key text, flag_scope text, flag_scope_id uuid, flag_value jsonb) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  flag_id uuid;
BEGIN
  IF NOT coalesce(app_actor_platform_permitted('feature_flag.manage'), false) THEN
    RAISE EXCEPTION 'only a platform administrator sets a feature flag' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF (flag_scope = 'organization' AND NOT EXISTS (SELECT 1 FROM organization o WHERE o.id = flag_scope_id))
     OR (flag_scope = 'practice' AND NOT EXISTS (SELECT 1 FROM practice p WHERE p.id = flag_scope_id)) THEN
    RAISE EXCEPTION 'a feature flag is set for an organization or a practice that exists' USING ERRCODE = 'foreign_key_violation';
  END IF;
  INSERT INTO feature_flag (key, scope, scope_id, value) VALUES (flag_key, flag_scope, flag_scope_id, flag_value)
    ON CONFLICT ON CONSTRAINT feature_flag_once DO UPDATE SET value = EXCLUDED.value
    RETURNING id INTO flag_id;
  INSERT INTO audit_event (actor_id, actor_kind, action, object_type, object_id, practice_id)
    VALUES (app_actor_id(), 'user', 'feature_flag_set', 'feature_flag', flag_id, CASE WHEN flag_scope = 'practice' THEN flag_scope_id END);
  RETURN flag_id;
END;
$$;

REVOKE ALL ON FUNCTION set_feature_flag(text, text, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_feature_flag(text, text, uuid, jsonb) TO tp_app;

-- ---------------------------------------------------------------------------------------------------
-- Shapes that keep text out of model_call
-- ---------------------------------------------------------------------------------------------------

-- Every element a SHA-256 in hex: the input document hashes.
CREATE FUNCTION model_hashes_valid(hashes text[]) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog, pg_temp AS $$
  SELECT cardinality(hashes) BETWEEN 1 AND 10000 AND NOT EXISTS (SELECT 1 FROM unnest(hashes) h WHERE h IS NULL OR h !~ '^[0-9a-f]{64}$')
$$;

-- Field paths (candidates[0].parameters, deadline): what the reviewer changed, or what a citation cites.
CREATE FUNCTION model_field_paths_valid(paths text[]) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog, pg_temp AS $$
  SELECT cardinality(paths) <= 1000 AND NOT EXISTS (SELECT 1 FROM unnest(paths) p WHERE p IS NULL OR p !~ '^[a-z][a-z0-9_.\[\]]{0,127}$')
$$;

-- The citations a call returned, as references only: an array of objects whose keys are field (a
-- path), page or marker (whole numbers) and quote_sha256 (the SHA-256 of the quoted text), never the
-- quote itself.
CREATE FUNCTION model_citations_valid(citations jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog, pg_temp AS $$
  SELECT jsonb_typeof(citations) = 'array' AND jsonb_array_length(citations) <= 10000 AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(citations) c
     WHERE jsonb_typeof(c) <> 'object'
        OR EXISTS (
          SELECT 1 FROM jsonb_each(c) e
           WHERE NOT (
             (e.key IN ('page', 'marker') AND jsonb_typeof(e.value) = 'number' AND (e.value #>> '{}') ~ '^[1-9][0-9]{0,5}$')
             OR (e.key = 'quote_sha256' AND jsonb_typeof(e.value) = 'string' AND (e.value #>> '{}') ~ '^[0-9a-f]{64}$')
             OR (e.key = 'field' AND jsonb_typeof(e.value) = 'string' AND (e.value #>> '{}') ~ '^[a-z][a-z0-9_.\[\]]{0,127}$')
           )
        )
  )
$$;

-- Who may record the reviewer's decision on a call of a purpose: the specialist who abstracts rate
-- records, the person who records payer responses, drafts packets, or works the practice's cases.
CREATE FUNCTION model_review_permission(call_purpose text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE call_purpose
    WHEN 'proposeContractTerms' THEN 'rate_record.edit'
    WHEN 'readDenialLetter' THEN 'submission.log'
    WHEN 'draftPacketNarrative' THEN 'packet.draft'
    WHEN 'suggestEvidenceRequests' THEN 'case.work'
  END
$$;

-- ---------------------------------------------------------------------------------------------------
-- model_call
-- ---------------------------------------------------------------------------------------------------

CREATE TABLE model_call (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Null only for a synthetic evaluation call (Data dictionary: "nullable for synthetic evaluation").
  practice_id uuid REFERENCES practice (id),
  -- The user or the job the call was made for; an evaluation run names no one.
  actor_kind text NOT NULL CHECK (actor_kind IN ('user', 'service', 'evaluation')),
  actor_id uuid,
  purpose text NOT NULL CHECK (purpose IN ('proposeContractTerms', 'readDenialLetter', 'draftPacketNarrative', 'suggestEvidenceRequests')),
  provider text NOT NULL CHECK (provider IN ('bedrock', 'anthropic', 'local')),
  model_id text NOT NULL CHECK (model_id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$'),
  prompt_version text NOT NULL CHECK (prompt_version ~ '^[a-z][a-z0-9-]{0,63}/[1-9][0-9]{0,3}$'),
  -- The SHA-256 of the call's purpose, prompt version, practice, the caller's request key and inputs:
  -- a retry and a replay carry the same one, and a completed call is logged once under it.
  idempotency_key text NOT NULL CHECK (idempotency_key ~ '^[0-9a-f]{64}$'),
  input_hashes text[] NOT NULL CHECK (model_hashes_valid(input_hashes)),
  output_sha256 text CHECK (output_sha256 ~ '^[0-9a-f]{64}$'),
  tokens_in integer NOT NULL CHECK (tokens_in >= 0),
  tokens_out integer NOT NULL CHECK (tokens_out >= 0),
  -- Rounded up once to whole cents; the unrounded cost, in cents, kept beside it.
  cost_cents bigint NOT NULL CHECK (cost_cents >= 0),
  cost_unrounded numeric(18, 6) NOT NULL CHECK (cost_unrounded >= 0),
  citations jsonb NOT NULL CHECK (model_citations_valid(citations)),
  -- Whether code's verifier passed the output; null when the call returned none.
  verifier_passed boolean,
  outcome text NOT NULL CHECK (outcome IN ('completed', 'failed', 'timed_out')),
  error_code text CHECK (error_code ~ '^[a-z][a-z0-9_]{0,63}$'),
  -- One retry under the same idempotency key (PRD 14, Operational limits).
  attempts integer NOT NULL CHECK (attempts IN (1, 2)),
  latency_ms integer NOT NULL CHECK (latency_ms >= 0),
  reviewer_decision text CHECK (reviewer_decision IN ('accepted', 'accepted_with_changes', 'rejected')),
  reviewer_changed_fields text[] CHECK (model_field_paths_valid(reviewer_changed_fields)),
  reviewed_by uuid REFERENCES "user" (id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT model_call_actor CHECK ((actor_kind = 'evaluation') = (actor_id IS NULL)),
  CONSTRAINT model_call_evaluation_is_synthetic CHECK ((practice_id IS NULL) = (actor_kind = 'evaluation')),
  CONSTRAINT model_call_outcome CHECK (CASE outcome
    WHEN 'completed' THEN output_sha256 IS NOT NULL AND verifier_passed IS NOT NULL AND error_code IS NULL
    ELSE output_sha256 IS NULL AND verifier_passed IS NULL AND error_code IS NOT NULL AND citations = '[]'::jsonb
  END),
  CONSTRAINT model_call_cost_rounded_up CHECK (cost_cents = ceil(cost_unrounded)),
  CONSTRAINT model_call_review CHECK (
    (reviewer_decision IS NULL) = (reviewed_at IS NULL) AND (reviewer_decision IS NULL) = (reviewer_changed_fields IS NULL)
    AND (reviewer_decision IS NULL OR outcome = 'completed')
    AND (reviewer_decision IS NULL OR (reviewer_decision = 'accepted_with_changes') = (cardinality(reviewer_changed_fields) > 0))
  )
);
CREATE INDEX model_call_by_practice ON model_call (practice_id, created_at);
CREATE UNIQUE INDEX model_call_completed_once ON model_call (idempotency_key) WHERE outcome = 'completed';

-- Logged unreviewed, at the database's time, in the name of the transaction's actor (a person as a
-- user, a job as a service). Afterwards only the reviewer's decision is recorded, once, by a person who
-- may review the call's purpose in its practice; nothing else changes, and no row is deleted.
CREATE FUNCTION model_call_rules() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'a model call is kept: its log row is never deleted' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.reviewer_decision IS NOT NULL OR NEW.reviewer_changed_fields IS NOT NULL OR NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL THEN
      RAISE EXCEPTION 'a model call is logged unreviewed; the reviewer''s decision comes later' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.practice_id IS NOT NULL AND practice_in_scope(NEW.practice_id)
       AND (NEW.actor_id IS DISTINCT FROM app_actor_id() OR (NEW.actor_kind = 'user') IS DISTINCT FROM app_actor_is_person()) THEN
      RAISE EXCEPTION 'a model call is logged in the name of the transaction''s actor' USING ERRCODE = 'insufficient_privilege';
    END IF;
    NEW.created_at := now();
    RETURN NEW;
  END IF;
  IF OLD.reviewer_decision IS NOT NULL OR NEW.reviewer_decision IS NULL
     OR (NEW.id, NEW.practice_id, NEW.actor_kind, NEW.actor_id, NEW.purpose, NEW.provider, NEW.model_id, NEW.prompt_version, NEW.idempotency_key,
         NEW.input_hashes, NEW.output_sha256, NEW.tokens_in, NEW.tokens_out, NEW.cost_cents, NEW.cost_unrounded, NEW.citations, NEW.verifier_passed,
         NEW.outcome, NEW.error_code, NEW.attempts, NEW.latency_ms, NEW.created_at)
        IS DISTINCT FROM
        (OLD.id, OLD.practice_id, OLD.actor_kind, OLD.actor_id, OLD.purpose, OLD.provider, OLD.model_id, OLD.prompt_version, OLD.idempotency_key,
         OLD.input_hashes, OLD.output_sha256, OLD.tokens_in, OLD.tokens_out, OLD.cost_cents, OLD.cost_unrounded, OLD.citations, OLD.verifier_passed,
         OLD.outcome, OLD.error_code, OLD.attempts, OLD.latency_ms, OLD.created_at) THEN
    RAISE EXCEPTION 'a model call never changes; only the reviewer''s decision is recorded, once' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT coalesce(app_actor_is_person(), false) OR NOT coalesce(app_actor_permitted(NEW.practice_id, model_review_permission(NEW.purpose)), false) THEN
    RAISE EXCEPTION 'the reviewer''s decision is recorded by a person who may review the call''s purpose in its practice' USING ERRCODE = 'insufficient_privilege';
  END IF;
  NEW.reviewed_by := app_actor_id();
  NEW.reviewed_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER model_call_rules BEFORE INSERT OR UPDATE OR DELETE ON model_call FOR EACH ROW EXECUTE FUNCTION model_call_rules();

CREATE FUNCTION model_records_no_truncate() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION '% cannot be truncated: the gateway''s records are kept', TG_TABLE_NAME USING ERRCODE = 'check_violation';
END;
$$;
CREATE TRIGGER model_call_no_truncate BEFORE TRUNCATE ON model_call FOR EACH STATEMENT EXECUTE FUNCTION model_records_no_truncate();

ALTER TABLE model_call ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_call FORCE ROW LEVEL SECURITY;
CREATE POLICY model_call_tenant ON model_call
  USING (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]))
  WITH CHECK (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]));
-- Synthetic evaluation calls name no practice; the operator role (the platform jobs) writes and reads them.
CREATE POLICY model_call_synthetic_evaluation ON model_call FOR ALL TO tp_operator
  USING (practice_id IS NULL)
  WITH CHECK (practice_id IS NULL);

REVOKE ALL ON model_call FROM PUBLIC;
GRANT SELECT ON model_call TO tp_app, tp_operator;
GRANT INSERT (id, practice_id, actor_kind, actor_id, purpose, provider, model_id, prompt_version, idempotency_key, input_hashes, output_sha256,
              tokens_in, tokens_out, cost_cents, cost_unrounded, citations, verifier_passed, outcome, error_code, attempts, latency_ms)
  ON model_call TO tp_app, tp_operator;
GRANT UPDATE (reviewer_decision, reviewer_changed_fields) ON model_call TO tp_app;

-- ---------------------------------------------------------------------------------------------------
-- eval_example
-- ---------------------------------------------------------------------------------------------------

CREATE TABLE eval_example (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source IN ('synthetic', 'permitted')),
  purpose text NOT NULL CHECK (purpose IN ('proposeContractTerms', 'readDenialLetter', 'draftPacketNarrative', 'suggestEvidenceRequests')),
  -- An opaque reference to the input: a synthetic fixture's path, or the document or call it came from.
  input_ref text NOT NULL CHECK (input_ref ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$'),
  expected jsonb NOT NULL CHECK (jsonb_typeof(expected) = 'object'),
  practice_id uuid REFERENCES practice (id),
  -- The practice's signed data-rights agreement a permitted example rests on.
  permission_ref uuid REFERENCES agreement (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eval_example_source CHECK (CASE source
    WHEN 'synthetic' THEN practice_id IS NULL AND permission_ref IS NULL
    ELSE practice_id IS NOT NULL AND permission_ref IS NOT NULL
  END),
  CONSTRAINT eval_example_letters_synthetic CHECK (purpose <> 'readDenialLetter' OR source = 'synthetic')
);
CREATE INDEX eval_example_by_practice ON eval_example (practice_id, created_at);

-- Whether an agreement is a signed data-rights agreement covering a practice: the practice's own, or
-- its organization's for all of its practices. Runs as the owner, so the check reads the agreement
-- whoever writes the example; it answers yes or no and returns nothing else.
CREATE FUNCTION data_rights_permit(target_agreement uuid, target_practice uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM agreement a JOIN practice p ON p.id = target_practice
     WHERE a.id = target_agreement AND a.kind = 'data_rights' AND a.signed_at <= now()
       AND (a.practice_id = p.id OR (a.practice_id IS NULL AND a.organization_id = p.organization_id))
  )
$$;

CREATE FUNCTION eval_example_rules() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'an evaluation example is never changed or deleted' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.source = 'permitted' AND NOT data_rights_permit(NEW.permission_ref, NEW.practice_id) THEN
    RAISE EXCEPTION 'a permitted evaluation example rests on the practice''s signed data-rights agreement' USING ERRCODE = 'check_violation';
  END IF;
  NEW.created_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER eval_example_rules BEFORE INSERT OR UPDATE OR DELETE ON eval_example FOR EACH ROW EXECUTE FUNCTION eval_example_rules();
CREATE TRIGGER eval_example_no_truncate BEFORE TRUNCATE ON eval_example FOR EACH STATEMENT EXECUTE FUNCTION model_records_no_truncate();

ALTER TABLE eval_example ENABLE ROW LEVEL SECURITY;
ALTER TABLE eval_example FORCE ROW LEVEL SECURITY;
CREATE POLICY eval_example_tenant ON eval_example
  USING (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]))
  WITH CHECK (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]));
CREATE POLICY eval_example_synthetic ON eval_example FOR ALL TO tp_operator
  USING (practice_id IS NULL)
  WITH CHECK (practice_id IS NULL);

REVOKE ALL ON eval_example FROM PUBLIC;
GRANT SELECT ON eval_example TO tp_app, tp_operator;
GRANT INSERT (id, source, purpose, input_ref, expected, practice_id, permission_ref) ON eval_example TO tp_app, tp_operator;

REVOKE ALL ON FUNCTION model_hashes_valid(text[]), model_field_paths_valid(text[]), model_citations_valid(jsonb), model_review_permission(text),
  model_call_rules(), model_records_no_truncate(), data_rights_permit(uuid, uuid), eval_example_rules() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION model_hashes_valid(text[]), model_field_paths_valid(text[]), model_citations_valid(jsonb), model_review_permission(text) TO tp_app, tp_operator;
GRANT EXECUTE ON FUNCTION data_rights_permit(uuid, uuid) TO tp_app, tp_operator;

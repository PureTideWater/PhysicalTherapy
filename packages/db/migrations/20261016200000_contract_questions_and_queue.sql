-- The specialist's questions to customers and the specialist queue's counts (PRD 5, J5: "a document the
-- specialist cannot abstract (missing pages, undefined method) produces a Coverage item telling the
-- customer what to obtain"; PRD 7, Contracts: "open the specialist's questions"; PRD 7, Internal console,
-- Specialist queue: "documents awaiting abstraction, proposals awaiting verification, questions to
-- customers ... abstract, verify, approve, ask"; PRD 6, Admin console: "no admin screen can read PHI
-- without a support grant"; docs/adr/0028 and 0030).
--
-- - contract_question (PHI): a question a contract specialist asks the practice about one of its
--   contracts (optionally one version and one document): its topic (what kind of answer or document it
--   needs), its text and the customer's answer, both encrypted with the practice's data key (free text,
--   like line_note), who asked it, and who closed it and when (answered by the customer, or withdrawn).
--   A question never changes but to close it once. practice_id NOT NULL, ENABLE and FORCE ROW LEVEL
--   SECURITY, the tenant policy and a phi_table_registry row; nobody asks in another person's name. Who
--   asks (rate_record.edit) and who answers (contract.sign_off) is checked by the route handlers.
-- - console_contract_queue(): the internal console's specialist queue, per active practice, as counts
--   only (documents awaiting abstraction, drafts, proposals awaiting verification, versions awaiting
--   the customer's sign-off, open questions) and the calling user's own open support grant, for a
--   contract specialist or a platform administrator. It names no document, contract or question: a
--   specialist opens a practice's records only under a support grant (docs/adr/0028). It reads the
--   practices' rows through their tenant policies with every active practice in scope for its one
--   query, and puts the caller's app.practice_ids back before it returns (an error aborts the
--   transaction, or the savepoint around it, which undoes the setting with it).
--
-- Runs as tp_owner. Safe with the previous image running: a new table and new functions only.

-- ---------------------------------------------------------------------------------------------------
-- Questions to customers
-- ---------------------------------------------------------------------------------------------------

CREATE TABLE contract_question (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practice (id),
  contract_id uuid NOT NULL REFERENCES contract (id),
  contract_version_id uuid REFERENCES contract_version (id),
  source_document_id uuid REFERENCES source_document (id),
  -- What the answer needs: a document to obtain (missing pages, a missing fee schedule, an undefined
  -- method) or a term to confirm (a scope, the timed-units rule, a window).
  topic text NOT NULL CHECK (topic IN ('missing_pages', 'missing_schedule', 'undefined_method', 'scope', 'timed_units', 'windows', 'other')),
  question text NOT NULL CHECK (question ~ '^enc:v1:[A-Za-z0-9_-]+$'),
  asked_by uuid NOT NULL REFERENCES "user" (id),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'answered', 'withdrawn')),
  answer text CHECK (answer ~ '^enc:v1:[A-Za-z0-9_-]+$'),
  closed_by uuid REFERENCES "user" (id),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contract_question_closing_recorded CHECK ((status = 'open') = (closed_by IS NULL) AND (closed_by IS NULL) = (closed_at IS NULL)),
  CONSTRAINT contract_question_answered_with_answer CHECK ((status = 'answered') = (answer IS NOT NULL))
);
CREATE INDEX contract_question_by_contract ON contract_question (practice_id, contract_id, status);
CREATE INDEX contract_question_open ON contract_question (practice_id, created_at) WHERE status = 'open';

INSERT INTO phi_table_registry (table_name, registered_by, policy_name) VALUES
  ('contract_question', '20261016200000_contract_questions_and_queue', 'contract_question_tenant');

CREATE TRIGGER contract_question_updated_at BEFORE UPDATE ON contract_question FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- A question is about a contract of its practice (and a version of that contract, and a contract
-- document of the practice), asked open; it changes once, when it is answered or withdrawn, recording
-- who closed it and when.
CREATE FUNCTION contract_question_rules() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'open' OR NEW.answer IS NOT NULL OR NEW.closed_by IS NOT NULL OR NEW.closed_at IS NOT NULL THEN
      RAISE EXCEPTION 'a question is asked open, without an answer' USING ERRCODE = 'check_violation';
    END IF;
    IF practice_in_scope(NEW.practice_id) THEN
      IF NOT EXISTS (SELECT 1 FROM contract c WHERE c.id = NEW.contract_id AND c.practice_id = NEW.practice_id) THEN
        RAISE EXCEPTION 'a question is about a contract of the same practice' USING ERRCODE = 'check_violation';
      END IF;
      IF NEW.contract_version_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM contract_version v WHERE v.id = NEW.contract_version_id AND v.contract_id = NEW.contract_id AND v.practice_id = NEW.practice_id) THEN
        RAISE EXCEPTION 'a question names a version of its contract' USING ERRCODE = 'check_violation';
      END IF;
      IF NEW.source_document_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM source_document d WHERE d.id = NEW.source_document_id AND d.practice_id = NEW.practice_id AND d.kind IN ('contract', 'exhibit', 'payer_letter')) THEN
        RAISE EXCEPTION 'a question names a contract, exhibit or payer-letter document of the same practice' USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.practice_id, NEW.contract_id, NEW.contract_version_id, NEW.source_document_id, NEW.topic, NEW.question, NEW.asked_by, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.practice_id, OLD.contract_id, OLD.contract_version_id, OLD.source_document_id, OLD.topic, OLD.question, OLD.asked_by, OLD.created_at) THEN
    RAISE EXCEPTION 'a question never changes; it is answered or withdrawn' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status <> 'open' THEN
    RAISE EXCEPTION 'an answered or withdrawn question never changes' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status = 'open' THEN
    RAISE EXCEPTION 'a question changes only when it is answered or withdrawn' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.closed_by IS DISTINCT FROM app_actor_id() OR NEW.closed_at IS DISTINCT FROM now() THEN
    RAISE EXCEPTION 'closing a question records who closed it and when' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER contract_question_rules BEFORE INSERT OR UPDATE ON contract_question FOR EACH ROW EXECUTE FUNCTION contract_question_rules();

ALTER TABLE contract_question ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_question FORCE ROW LEVEL SECURITY;
CREATE POLICY contract_question_tenant ON contract_question
  USING (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]))
  WITH CHECK (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]));
-- Nobody asks a question in another person's name.
CREATE POLICY contract_question_asked_by_actor ON contract_question AS RESTRICTIVE FOR INSERT TO tp_app
  WITH CHECK (asked_by = app_actor_id());

REVOKE ALL ON contract_question FROM PUBLIC;
GRANT SELECT ON contract_question TO tp_app;
GRANT INSERT (id, practice_id, contract_id, contract_version_id, source_document_id, topic, question, asked_by) ON contract_question TO tp_app;
GRANT UPDATE (status, answer, closed_by, closed_at) ON contract_question TO tp_app;

-- ---------------------------------------------------------------------------------------------------
-- The specialist queue's counts (the internal console)
-- ---------------------------------------------------------------------------------------------------

-- Per active practice: the contract, exhibit and payer-letter documents that are clean and stored and
-- that no approved, signed-off or superseded version names (awaiting abstraction); versions in draft;
-- proposals awaiting verification; approved versions awaiting the customer's sign-off; open questions;
-- and when the caller's own open support grant on the practice ends (null without one). Counts only,
-- for a contract specialist (contract.review) or a platform administrator (support_grant.create), who
-- opens support grants for specialists; anyone else gets no rows.
CREATE FUNCTION console_contract_queue() RETURNS TABLE (
  practice_id uuid, name text, documents_awaiting bigint, drafts bigint, proposals_awaiting bigint, awaiting_sign_off bigint,
  open_questions bigint, support_grant_ends_at timestamptz
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  callers_scope text := current_setting('app.practice_ids', true);
BEGIN
  IF NOT (coalesce(app_actor_platform_permitted('contract.review'), false) OR coalesce(app_actor_platform_permitted('support_grant.create'), false)) THEN
    RETURN;
  END IF;
  -- Every active practice in scope for the one query below; the caller's scope is put back after it.
  PERFORM set_config('app.practice_ids', (SELECT '{' || coalesce(string_agg(p.id::text, ','), '') || '}' FROM practice p WHERE p.status = 'active'), true);
  RETURN QUERY
    SELECT p.id, p.name,
           (SELECT count(*) FROM source_document d
             WHERE d.practice_id = p.id AND d.kind IN ('contract', 'exhibit', 'payer_letter') AND d.scan_status = 'clean' AND d.status = 'stored'
               AND NOT EXISTS (SELECT 1 FROM contract_version v
                                WHERE v.practice_id = d.practice_id AND d.id = ANY (v.source_document_ids) AND v.status IN ('approved', 'signed_off', 'superseded'))),
           (SELECT count(*) FROM contract_version v WHERE v.practice_id = p.id AND v.status = 'draft'),
           (SELECT count(*) FROM contract_version v WHERE v.practice_id = p.id AND v.status = 'proposed'),
           (SELECT count(*) FROM contract_version v WHERE v.practice_id = p.id AND v.status = 'approved'),
           (SELECT count(*) FROM contract_question q WHERE q.practice_id = p.id AND q.status = 'open'),
           (SELECT max(least(s.expires_at, s.created_at + interval '4 hours')) FROM support_grant s
             WHERE s.practice_id = p.id AND s.user_id = app_actor_id()
               AND s.created_at <= now() AND now() < s.expires_at AND now() < s.created_at + interval '4 hours')
      FROM practice p
     WHERE p.status = 'active'
     ORDER BY p.name, p.id;
  PERFORM set_config('app.practice_ids', coalesce(callers_scope, '{}'), true);
END;
$$;

REVOKE ALL ON FUNCTION contract_question_rules(), console_contract_queue() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION console_contract_queue() TO tp_app;

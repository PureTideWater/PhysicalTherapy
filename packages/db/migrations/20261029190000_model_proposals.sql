-- The gateway in the product (PRD 14; PRD 5, J5 in v1: "the model proposes the abstraction and the specialist
-- verifies each field against the cited page", and J9: "the pattern narrative (model-drafted in v1 from the
-- approved records, verified field by field by code)"; PRD 7, Rate record review, Specialist queue, Packet builder
-- and Coverage; docs/adr/0052).
--
-- model_proposal: what a person's model call on a screen proposed, and for what, so the screen can show it after
-- the request that made it and the reviewer's decision can be recorded on the call when the person is done with it.
--
-- - proposeContractTerms: a contract version being abstracted and the document read; the proposal holds the
--   verifier's review of every candidate (each field's page, quote, written value and problems; the rate record a
--   fully verified candidate was proposed as). Contract text is not PHI (PRD 14, PHI minimization).
-- - draftPacketNarrative: the packet version written with the model's narrative (the narrative itself is that
--   version's, encrypted there; the proposal holds nothing of it).
-- - suggestEvidenceRequests: the coverage gaps' checklist, as the verifier kept it (reason codes, and the documents
--   to obtain phrased for the customer: built from counts, codes and payer names only, never an identifier).
--
-- The person who made the call writes the row, once, in the practice's scope; afterwards only two things are
-- recorded, each once: when the reviewer's decision was recorded on the model call (which must hold one by then),
-- and the evaluation example a reviewer's correction became under the practice's data-rights agreement. Nothing
-- else changes and no row is deleted. Practice-scoped with the tenant policy and in the PHI table registry, as
-- every practice table is, though it holds no PHI.
--
-- Runs as tp_owner. Safe with the previous image running: a new table; the previous image never reads it.

CREATE TABLE model_proposal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practice (id),
  model_call_id uuid NOT NULL REFERENCES model_call (id),
  purpose text NOT NULL CHECK (purpose IN ('proposeContractTerms', 'draftPacketNarrative', 'suggestEvidenceRequests')),
  contract_version_id uuid REFERENCES contract_version (id),
  source_document_id uuid REFERENCES source_document (id),
  packet_version_id uuid REFERENCES packet_version (id),
  proposal jsonb NOT NULL CHECK (jsonb_typeof(proposal) = 'object'),
  verifier_passed boolean NOT NULL,
  proposed_by uuid NOT NULL REFERENCES "user" (id),
  reviewed_at timestamptz,
  eval_example_id uuid REFERENCES eval_example (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT model_proposal_once UNIQUE (model_call_id),
  CONSTRAINT model_proposal_subject CHECK (CASE purpose
    WHEN 'proposeContractTerms' THEN contract_version_id IS NOT NULL AND source_document_id IS NOT NULL AND packet_version_id IS NULL
    WHEN 'draftPacketNarrative' THEN packet_version_id IS NOT NULL AND contract_version_id IS NULL AND source_document_id IS NULL
    ELSE contract_version_id IS NULL AND source_document_id IS NULL AND packet_version_id IS NULL
  END),
  CONSTRAINT model_proposal_example_after_review CHECK (eval_example_id IS NULL OR reviewed_at IS NOT NULL)
);
CREATE INDEX model_proposal_by_practice ON model_proposal (practice_id, created_at);
CREATE INDEX model_proposal_by_version ON model_proposal (contract_version_id) WHERE contract_version_id IS NOT NULL;
CREATE INDEX model_proposal_by_packet_version ON model_proposal (packet_version_id) WHERE packet_version_id IS NOT NULL;

CREATE FUNCTION model_proposal_rules() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'a model proposal is kept: it is never deleted' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.reviewed_at IS NOT NULL OR NEW.eval_example_id IS NOT NULL THEN
      RAISE EXCEPTION 'a model proposal is written unreviewed' USING ERRCODE = 'check_violation';
    END IF;
    -- A row for a practice out of scope is the tenant policy's to refuse.
    IF practice_in_scope(NEW.practice_id) THEN
      IF NEW.proposed_by IS DISTINCT FROM app_actor_id() OR NOT coalesce(app_actor_is_person(), false) THEN
        RAISE EXCEPTION 'a model proposal is written by the person who asked for it' USING ERRCODE = 'insufficient_privilege';
      END IF;
      -- The call is that person's, in this practice, for this purpose, completed and unreviewed.
      IF NOT EXISTS (
        SELECT 1 FROM model_call c
         WHERE c.id = NEW.model_call_id AND c.practice_id = NEW.practice_id AND c.purpose = NEW.purpose AND c.actor_kind = 'user'
           AND c.actor_id = NEW.proposed_by AND c.outcome = 'completed' AND c.reviewer_decision IS NULL
      ) THEN
        RAISE EXCEPTION 'a model proposal names a completed, unreviewed call its writer made in the practice for its purpose' USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    NEW.created_at := now();
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.practice_id, NEW.model_call_id, NEW.purpose, NEW.contract_version_id, NEW.source_document_id, NEW.packet_version_id, NEW.proposal,
      NEW.verifier_passed, NEW.proposed_by, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.practice_id, OLD.model_call_id, OLD.purpose, OLD.contract_version_id, OLD.source_document_id, OLD.packet_version_id, OLD.proposal,
      OLD.verifier_passed, OLD.proposed_by, OLD.created_at)
     OR (OLD.reviewed_at IS NOT NULL AND NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at)
     OR (OLD.eval_example_id IS NOT NULL AND NEW.eval_example_id IS DISTINCT FROM OLD.eval_example_id) THEN
    RAISE EXCEPTION 'a model proposal never changes; its review and its example are recorded once' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.reviewed_at IS NULL AND NEW.reviewed_at IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM model_call c WHERE c.id = NEW.model_call_id AND c.reviewer_decision IS NOT NULL) THEN
      RAISE EXCEPTION 'a proposal is reviewed once the reviewer''s decision is recorded on its model call' USING ERRCODE = 'check_violation';
    END IF;
    NEW.reviewed_at := now();
  END IF;
  IF OLD.eval_example_id IS NULL AND NEW.eval_example_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM eval_example e WHERE e.id = NEW.eval_example_id AND e.practice_id = NEW.practice_id AND e.purpose = NEW.purpose AND e.source = 'permitted') THEN
    RAISE EXCEPTION 'a proposal''s example is a permitted example of its own practice and purpose' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER model_proposal_rules BEFORE INSERT OR UPDATE OR DELETE ON model_proposal FOR EACH ROW EXECUTE FUNCTION model_proposal_rules();
CREATE TRIGGER model_proposal_no_truncate BEFORE TRUNCATE ON model_proposal FOR EACH STATEMENT EXECUTE FUNCTION model_records_no_truncate();

ALTER TABLE model_proposal ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_proposal FORCE ROW LEVEL SECURITY;
CREATE POLICY model_proposal_tenant ON model_proposal
  USING (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]))
  WITH CHECK (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]));

REVOKE ALL ON model_proposal FROM PUBLIC;
GRANT SELECT ON model_proposal TO tp_app;
GRANT INSERT (id, practice_id, model_call_id, purpose, contract_version_id, source_document_id, packet_version_id, proposal, verifier_passed, proposed_by)
  ON model_proposal TO tp_app;
GRANT UPDATE (reviewed_at, eval_example_id) ON model_proposal TO tp_app;

REVOKE ALL ON FUNCTION model_proposal_rules() FROM PUBLIC;

INSERT INTO phi_table_registry (table_name, registered_by, policy_name) VALUES
  ('model_proposal', '20261029190000_model_proposals', 'model_proposal_tenant');

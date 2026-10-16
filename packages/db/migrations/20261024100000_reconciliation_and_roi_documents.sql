-- Reconciliation in the product (milestone 9, part two; PRD 5, J10 and J12; PRD 7, Reconciliation and
-- Reports; PRD 13, Matching step 2 and ROI statement; PRD 20, Posting-export templates;
-- docs/adr/0043). Beside the recovery ledger (20261023120000_recovery_ledger.sql):
--
-- - job type roi_statement: the worker prints an ROI statement's PDF through the audit report's
--   Playwright pipeline and stores it sealed with the practice's key. The statement records the PDF's
--   key and SHA-256 once, in the job's name (no person), under its own practice and ID; nothing else
--   about a statement ever changes, and a statement is never written with a document.
-- - set_practice_posting_template(practice, template): a person who reconciles postings maps the
--   practice's posting-export template (one per practice-management system, mapped once at
--   onboarding, PRD 20) and changes nothing else of the practice row: the posting_export_template key
--   only. The proof level stays the practice administrator's (setLedgerSettings, docs/adr/0042), since
--   it decides what "recovered" counts and a firm reconciling postings under a grant must not move it.
--
-- Runs as tp_owner. Safe with the previous image running: a nullable column, a function, a wider job
-- type list and a statement rule that admits one more update the previous image never makes.

-- ---------------------------------------------------------------------------------------------------
-- The ROI statement's printed document
-- ---------------------------------------------------------------------------------------------------

ALTER TABLE job_run DROP CONSTRAINT job_run_job_type_check;
ALTER TABLE job_run ADD CONSTRAINT job_run_job_type_check
  CHECK (job_type IN ('intake', 'parse_835', 'monitor', 'price', 'triage', 'audit_report', 'reconcile', 'digest', 'export', 'packet_export', 'roi_statement'));

-- The SHA-256 of the statement's PDF, recorded with its key.
ALTER TABLE roi_statement ADD COLUMN pdf_sha256 text CHECK (pdf_sha256 ~ '^[0-9a-f]{64}$');
ALTER TABLE roi_statement ADD CONSTRAINT roi_statement_document_with_hash CHECK ((document_key IS NULL) = (pdf_sha256 IS NULL));

-- As before (20261023120000_recovery_ledger.sql): written once, in its generator's name (or the
-- quarterly job's, no one's), its recovered and interest figures the sums of the entries it links;
-- now never written with a document, and updated exactly once afterwards: by a job (the statement job,
-- in no one's name), recording the PDF it printed (its key, under the statement's own practice and ID,
-- and its SHA-256), with every figure, link and date as it was.
CREATE OR REPLACE FUNCTION roi_statement_rules() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  sums record;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'an ROI statement keeps its figures; a new one is generated' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.id, NEW.practice_id, NEW.period_from, NEW.period_to, NEW.proof_level, NEW.fees_cents, NEW.recovered_cents, NEW.interest_cents, NEW.approved_unposted_cents,
        NEW.actionable_open_cents, NEW.pursuit_hours, NEW.links, NEW.generated_by, NEW.generated_at, NEW.created_at)
       IS DISTINCT FROM (OLD.id, OLD.practice_id, OLD.period_from, OLD.period_to, OLD.proof_level, OLD.fees_cents, OLD.recovered_cents, OLD.interest_cents, OLD.approved_unposted_cents,
        OLD.actionable_open_cents, OLD.pursuit_hours, OLD.links, OLD.generated_by, OLD.generated_at, OLD.created_at)
       OR OLD.document_key IS NOT NULL OR NEW.document_key IS NULL THEN
      RAISE EXCEPTION 'an ROI statement keeps its figures; only its printed PDF is recorded, once' USING ERRCODE = 'check_violation';
    END IF;
    IF practice_in_scope(NEW.practice_id) THEN
      IF app_actor_is_person() THEN
        RAISE EXCEPTION 'the statement job records the printed PDF, in no one''s name' USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF left(NEW.document_key, char_length('practices/' || NEW.practice_id::text || '/reports/' || NEW.id::text || '/')) <> 'practices/' || NEW.practice_id::text || '/reports/' || NEW.id::text || '/' THEN
        RAISE EXCEPTION 'a statement''s PDF is stored under its own practice and statement' USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
  END IF;
  NEW.generated_at := now();
  IF NEW.document_key IS NOT NULL OR NEW.pdf_sha256 IS NOT NULL THEN
    RAISE EXCEPTION 'a statement is printed after it is written' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT practice_in_scope(NEW.practice_id) THEN
    RETURN NEW;
  END IF;
  IF app_actor_is_person() THEN
    IF NEW.generated_by IS DISTINCT FROM app_actor_id() OR NOT coalesce(app_actor_permitted(NEW.practice_id, 'posting.reconcile'), false) THEN
      RAISE EXCEPTION 'an ROI statement is generated on demand by a person who reconciles postings, in their own name' USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF NEW.generated_by IS NOT NULL THEN
    RAISE EXCEPTION 'the quarterly statement is generated in no one''s name' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT (SELECT count(*) FROM jsonb_array_elements_text(NEW.links -> 'recovered')) + (SELECT count(*) FROM jsonb_array_elements_text(NEW.links -> 'interest')) AS linked,
         (SELECT count(*) FROM ledger_entry e WHERE e.practice_id = NEW.practice_id AND e.id IN (SELECT x::uuid FROM jsonb_array_elements_text(NEW.links -> 'recovered') x))
           + (SELECT count(*) FROM ledger_entry e WHERE e.practice_id = NEW.practice_id AND e.id IN (SELECT x::uuid FROM jsonb_array_elements_text(NEW.links -> 'interest') x)) AS found,
         (SELECT coalesce(sum(e.amount_cents), 0) FROM ledger_entry e WHERE e.practice_id = NEW.practice_id AND e.id IN (SELECT x::uuid FROM jsonb_array_elements_text(NEW.links -> 'recovered') x)) AS recovered,
         (SELECT coalesce(sum(e.amount_cents), 0) FROM ledger_entry e WHERE e.practice_id = NEW.practice_id AND e.id IN (SELECT x::uuid FROM jsonb_array_elements_text(NEW.links -> 'interest') x)) AS interest
    INTO sums;
  IF sums.linked <> sums.found OR sums.recovered <> NEW.recovered_cents OR sums.interest <> NEW.interest_cents THEN
    RAISE EXCEPTION 'an ROI statement''s recovered and interest are the sums of the entries it links' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

GRANT UPDATE (document_key, pdf_sha256) ON roi_statement TO tp_app;

-- ---------------------------------------------------------------------------------------------------
-- The practice's posting-export template
-- ---------------------------------------------------------------------------------------------------

-- Sets the practice's posting-export template (the posting_export_template key of practice.settings;
-- every other key is kept), for a person who reconciles postings at the practice, in their own request
-- scope. The route reads the template back with @tp/ledger before it calls this and records the audit
-- event; the practice row's CHECK refuses anything but an object. Definer's rights, so the practice
-- administrators' update policy (any other change of the row) is not widened for anyone.
CREATE FUNCTION set_practice_posting_template(target uuid, template jsonb) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NOT app_actor_is_person() OR NOT practice_in_scope(target) OR NOT coalesce(app_actor_permitted(target, 'posting.reconcile'), false) THEN
    RAISE EXCEPTION 'a person who reconciles postings maps the practice''s posting-export template' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF template IS NULL OR jsonb_typeof(template) <> 'object' THEN
    RAISE EXCEPTION 'a posting-export template is an object' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE practice p SET settings = jsonb_set(p.settings, '{posting_export_template}', template, true) WHERE p.id = target;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION set_practice_posting_template(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_practice_posting_template(uuid, jsonb) TO tp_app;

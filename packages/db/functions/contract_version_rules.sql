-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- contract_version_rules()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 84ee4071d9947f3d
-- Trigger function of: contract_version.contract_version_rules
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.contract_version_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  prior contract_version%ROWTYPE;
  records bigint;
  unverified bigint;
  stray bigint;
  terms_changed boolean;
  -- window: what the verification reads (the days, the evidence, the documents), and the verification itself.
  window_changed boolean;
  window_verification_changed boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' OR NEW.approved_by IS NOT NULL OR NEW.signed_off_by IS NOT NULL THEN
      RAISE EXCEPTION 'a contract version starts as a draft' USING ERRCODE = 'check_violation';
    END IF;
    -- window: written unverified (a correction or an amendment copies the citation, never its verification),
    -- citing one of the version's documents. Incomplete evidence is the CHECK's to refuse.
    IF NEW.dispute_window_verified_by IS NOT NULL OR NEW.dispute_window_verified_at IS NOT NULL THEN
      RAISE EXCEPTION 'a contract version is written with its dispute window unverified; a contract specialist verifies it afterwards' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.dispute_window_evidence IS NOT NULL AND rate_record_evidence_complete(NEW.dispute_window_evidence)
       AND NOT ((NEW.dispute_window_evidence ->> 'document_id')::uuid = ANY (NEW.source_document_ids)) THEN
      RAISE EXCEPTION 'a dispute window''s evidence is a document of its version' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT practice_in_scope(NEW.practice_id) THEN
      RETURN NEW;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM contract c WHERE c.id = NEW.contract_id AND c.practice_id = NEW.practice_id) THEN
      RAISE EXCEPTION 'a contract version belongs to a contract of the same practice' USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    IF (NEW.id, NEW.practice_id, NEW.contract_id, NEW.version_no, NEW.created_at) IS DISTINCT FROM (OLD.id, OLD.practice_id, OLD.contract_id, OLD.version_no, OLD.created_at) THEN
      RAISE EXCEPTION 'a contract version''s contract and number never change' USING ERRCODE = 'check_violation';
    END IF;
    terms_changed := (NEW.source_document_ids, NEW.effective_from, NEW.supersedes_id, NEW.timely_filing_days, NEW.dispute_window_days, NEW.appeal_levels, NEW.notice_days,
                      NEW.dispute_window_evidence, NEW.dispute_window_unit, NEW.dispute_window_measured_from)
      IS DISTINCT FROM (OLD.source_document_ids, OLD.effective_from, OLD.supersedes_id, OLD.timely_filing_days, OLD.dispute_window_days, OLD.appeal_levels, OLD.notice_days,
                        OLD.dispute_window_evidence, OLD.dispute_window_unit, OLD.dispute_window_measured_from);
    window_changed := (NEW.source_document_ids, NEW.dispute_window_days, NEW.dispute_window_evidence, NEW.dispute_window_unit, NEW.dispute_window_measured_from)
      IS DISTINCT FROM (OLD.source_document_ids, OLD.dispute_window_days, OLD.dispute_window_evidence, OLD.dispute_window_unit, OLD.dispute_window_measured_from);
    window_verification_changed := (NEW.dispute_window_verified_by, NEW.dispute_window_verified_at) IS DISTINCT FROM (OLD.dispute_window_verified_by, OLD.dispute_window_verified_at);

    IF OLD.status IN ('draft', 'proposed') THEN
      IF NEW.status = OLD.status THEN
        IF NEW.approved_by IS NOT NULL OR NEW.signed_off_by IS NOT NULL THEN
          RAISE EXCEPTION 'a draft is approved by moving it to approved' USING ERRCODE = 'check_violation';
        END IF;
      ELSIF OLD.status = 'draft' AND NEW.status = 'proposed' THEN
        IF NOT EXISTS (SELECT 1 FROM rate_record r WHERE r.contract_version_id = NEW.id) THEN
          RAISE EXCEPTION 'a proposal carries at least one rate record' USING ERRCODE = 'check_violation';
        END IF;
      ELSIF NEW.status = 'approved' THEN
        -- Approval by a contract specialist, recorded with the user and the time.
        IF NOT coalesce(app_actor_platform_permitted('rate_record.approve'), false) THEN
          RAISE EXCEPTION 'only a contract specialist approves a contract version' USING ERRCODE = 'insufficient_privilege';
        END IF;
        IF NEW.approved_by IS DISTINCT FROM app_actor_id() OR NEW.approved_at IS DISTINCT FROM now() OR NEW.signed_off_by IS NOT NULL THEN
          RAISE EXCEPTION 'an approval records the approving specialist and the time' USING ERRCODE = 'check_violation';
        END IF;
        IF terms_changed OR NEW.effective_to IS DISTINCT FROM OLD.effective_to OR window_verification_changed THEN
          RAISE EXCEPTION 'a version is approved as it stands; edit it first, then approve it' USING ERRCODE = 'check_violation';
        END IF;
        IF cardinality(NEW.source_document_ids) = 0 THEN
          RAISE EXCEPTION 'an approved version names the documents it is abstracted from' USING ERRCODE = 'check_violation';
        END IF;
        SELECT count(*), count(*) FILTER (WHERE r.verified_by IS NULL),
               count(*) FILTER (WHERE r.verified_by IS NOT NULL AND NOT ((r.evidence ->> 'document_id')::uuid = ANY (NEW.source_document_ids)))
          INTO records, unverified, stray
          FROM rate_record r WHERE r.contract_version_id = NEW.id;
        IF records = 0 OR unverified > 0 THEN
          RAISE EXCEPTION 'a version is approved once each of its rate records is verified, and it has at least one' USING ERRCODE = 'check_violation';
        END IF;
        IF stray > 0 THEN
          RAISE EXCEPTION 'every rate record''s evidence is a document of its version' USING ERRCODE = 'check_violation';
        END IF;
        -- window: a cited window whose rule the product computes is approved verified, from one of the version's
        -- documents. One whose rule it does not compute yet (PR 6c) is approved unverified, so its lines wait
        -- (DEADLINE_UNVERIFIED, CONTRACT_WINDOW_RULE_NOT_COMPUTED) rather than show a date that may be later than the contract's.
        IF NEW.dispute_window_evidence IS NOT NULL AND NEW.dispute_window_verified_by IS NULL
           AND contract_window_rule_computed(NEW.dispute_window_unit, NEW.dispute_window_measured_from) THEN
          RAISE EXCEPTION 'a version whose dispute window is cited is approved once a contract specialist has verified the window' USING ERRCODE = 'check_violation';
        END IF;
        IF NEW.dispute_window_evidence IS NOT NULL AND NOT ((NEW.dispute_window_evidence ->> 'document_id')::uuid = ANY (NEW.source_document_ids)) THEN
          RAISE EXCEPTION 'a dispute window''s evidence is a document of its version' USING ERRCODE = 'check_violation';
        END IF;
      ELSE
        RAISE EXCEPTION 'a contract version moves draft, proposed, approved, signed off, superseded, in that order' USING ERRCODE = 'check_violation';
      END IF;
      -- window: on a draft or proposed version, a verification is a contract specialist's, once, in their own
      -- name and now, over complete evidence on one of the version's documents, with nothing else of the window
      -- changing and the status unchanged; any other change of the window, its evidence or the documents clears it.
      IF NEW.status IN ('draft', 'proposed') THEN
        IF window_verification_changed AND OLD.dispute_window_verified_by IS NULL THEN
          IF NOT coalesce(app_actor_platform_permitted('rate_record.approve'), false) THEN
            RAISE EXCEPTION 'only a contract specialist verifies a contract''s dispute window' USING ERRCODE = 'insufficient_privilege';
          END IF;
          IF NEW.dispute_window_verified_by IS DISTINCT FROM app_actor_id() OR NEW.dispute_window_verified_at IS DISTINCT FROM now() THEN
            RAISE EXCEPTION 'a dispute window''s verification records the verifying specialist and the time' USING ERRCODE = 'check_violation';
          END IF;
          IF window_changed OR NEW.status IS DISTINCT FROM OLD.status THEN
            RAISE EXCEPTION 'a dispute window is verified as it stands; edit it first, then verify it' USING ERRCODE = 'check_violation';
          END IF;
          IF NOT rate_record_evidence_complete(NEW.dispute_window_evidence) THEN
            RAISE EXCEPTION 'a dispute window cannot be verified without evidence naming a document, a page, a quote and a hash' USING ERRCODE = 'check_violation';
          END IF;
          -- window: verified only when the cited unit and start are what the product computes (audit item #5).
          IF NOT contract_window_rule_computed(NEW.dispute_window_unit, NEW.dispute_window_measured_from) THEN
            RAISE EXCEPTION 'a dispute window is verified only when the rule it cites is the rule the product computes: its days counted as calendar days after the payment date (BPR16)' USING ERRCODE = 'check_violation';
          END IF;
          IF NOT ((NEW.dispute_window_evidence ->> 'document_id')::uuid = ANY (NEW.source_document_ids)) THEN
            RAISE EXCEPTION 'a dispute window''s evidence is a document of its version' USING ERRCODE = 'check_violation';
          END IF;
        ELSIF window_verification_changed AND NEW.dispute_window_verified_by IS NOT NULL THEN
          RAISE EXCEPTION 'a dispute window''s verification is recorded once' USING ERRCODE = 'check_violation';
        ELSIF window_changed THEN
          -- An edit of the window clears its verification with it.
          NEW.dispute_window_verified_by := NULL;
          NEW.dispute_window_verified_at := NULL;
        END IF;
      END IF;
      IF NEW.status IN ('draft', 'proposed') AND terms_changed AND practice_in_scope(NEW.practice_id) THEN
        IF NOT contract_version_documents_ok(NEW) THEN
          RAISE EXCEPTION 'a version''s documents are clean contract, exhibit or payer-letter documents of its practice, each named once' USING ERRCODE = 'check_violation';
        END IF;
      END IF;
    ELSIF OLD.status = 'approved' AND NEW.status = 'signed_off' THEN
      -- Customer sign-off, recorded with the user and the time.
      IF NOT coalesce(app_actor_permitted(NEW.practice_id, 'contract.sign_off'), false) THEN
        RAISE EXCEPTION 'only a practice administrator or billing manager signs off a contract version' USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF NEW.signed_off_by IS DISTINCT FROM app_actor_id() OR NEW.signed_off_at IS DISTINCT FROM now()
         OR terms_changed OR NEW.effective_to IS DISTINCT FROM OLD.effective_to
         OR (NEW.approved_by, NEW.approved_at, NEW.dispute_window_verified_by, NEW.dispute_window_verified_at) IS DISTINCT FROM (OLD.approved_by, OLD.approved_at, OLD.dispute_window_verified_by, OLD.dispute_window_verified_at) THEN
        RAISE EXCEPTION 'a sign-off records the signing user and the time and changes nothing else' USING ERRCODE = 'check_violation';
      END IF;
      -- The successor's sign-off retires the version it names: closed at the successor's start
      -- (an amendment, CON-02) or superseded (a correction, or a version that was never signed off).
      IF NEW.supersedes_id IS NOT NULL THEN
        SELECT * INTO prior FROM contract_version p WHERE p.id = NEW.supersedes_id FOR UPDATE;
        IF NOT FOUND OR prior.contract_id <> NEW.contract_id OR prior.status NOT IN ('approved', 'signed_off') THEN
          RAISE EXCEPTION 'the version a successor names is an approved or signed-off version of the same contract' USING ERRCODE = 'check_violation';
        END IF;
        IF prior.status = 'approved' OR NEW.effective_from <= prior.effective_from THEN
          UPDATE contract_version SET status = 'superseded' WHERE id = prior.id;
        ELSIF prior.effective_to IS NULL OR NEW.effective_from < prior.effective_to THEN
          UPDATE contract_version SET effective_to = NEW.effective_from WHERE id = prior.id;
        END IF;
      END IF;
    ELSIF OLD.status = 'approved' AND NEW.status = 'superseded'
          OR OLD.status = 'signed_off' AND NEW.status = 'superseded'
          OR OLD.status = 'signed_off' AND NEW.status = 'signed_off' AND NEW.effective_to IS DISTINCT FROM OLD.effective_to THEN
      -- Only the sign-off of a successor naming this version retires it (checked again at commit).
      IF NOT coalesce(app_actor_permitted(NEW.practice_id, 'contract.sign_off'), false) THEN
        RAISE EXCEPTION 'only a successor''s sign-off retires a contract version' USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF terms_changed
         OR (NEW.approved_by, NEW.approved_at, NEW.signed_off_by, NEW.signed_off_at, NEW.dispute_window_verified_by, NEW.dispute_window_verified_at)
            IS DISTINCT FROM (OLD.approved_by, OLD.approved_at, OLD.signed_off_by, OLD.signed_off_at, OLD.dispute_window_verified_by, OLD.dispute_window_verified_at)
         OR NOT contract_version_retired_by(OLD, NEW, 'approved') THEN
        RAISE EXCEPTION 'a signed-off version never changes: an amendment closes its window at the amendment''s start, and a correction supersedes it' USING ERRCODE = 'check_violation';
      END IF;
    ELSE
      RAISE EXCEPTION 'an approved or signed-off contract version never changes; supersede it with a new version' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- A successor names an approved or signed-off version of the same contract.
  IF NEW.supersedes_id IS NOT NULL AND NEW.status IN ('draft', 'proposed') AND (TG_OP = 'INSERT' OR NEW.supersedes_id IS DISTINCT FROM OLD.supersedes_id) THEN
    SELECT * INTO prior FROM contract_version p WHERE p.id = NEW.supersedes_id;
    IF NOT FOUND OR prior.contract_id <> NEW.contract_id OR prior.status NOT IN ('approved', 'signed_off') THEN
      RAISE EXCEPTION 'a successor names an approved or signed-off version of the same contract' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF TG_OP = 'INSERT' AND NOT contract_version_documents_ok(NEW) THEN
    RAISE EXCEPTION 'a version''s documents are clean contract, exhibit or payer-letter documents of its practice, each named once' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.contract_version_rules() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.contract_version_rules() FROM PUBLIC;

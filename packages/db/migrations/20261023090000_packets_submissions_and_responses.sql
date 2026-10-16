-- Packets, their versions, submissions and payer responses (PRD 3, the billing manager must not approve
-- a packet she drafted; PRD 5, J9 and J10; PRD 6, Packet builder, Submissions and payer responses; PRD 8,
-- packet, packet_version, submission, payer_response, the status machine and its invariants; PRD 12, The
-- packet, Approval, Submission response and follow-up; PRD 16, a wrong identifier in a packet and a
-- narrative inventing a number; PRD 20, two-person approval for single-user practices; Data dictionary,
-- Pricing, triage and cases; test matrix CAS-08 to CAS-15, LED-01; docs/adr/0041).
--
-- Four PHI tables, each with practice_id NOT NULL (indexed), ENABLE and FORCE ROW LEVEL SECURITY, the
-- registered tenant policy and a row in phi_table_registry:
--
-- - packet: a case's dispute document; current_version_id is the version written last (kept by the
--   database).
-- - packet_version: one version, immutable once written. Its content (tp-packet/1: identification,
--   citation, rule releases, pattern, line schedule, interest, evidence, requested action, sources) is
--   assembled by code from the case and approved records; the dictionary's citation, line_table,
--   evidence, interest_cents and the dispute level are generated from it. The narrative is the person's
--   words, encrypted with the practice's key (enc). Identifiers are placeholders only (the content's
--   CHECK refuses anything else in a schedule row). The verifier's result and report (codes and
--   positions only) are stored with it. A new edit is a new version, which clears the packet's approval.
--   Approval (once, the version's hash named), the regulation's confirmation for a Medicare Advantage
--   non-contracted pattern, and the export (once, by the export job) are the only changes, and only as
--   the rules below allow.
-- - submission: logged by the customer (the product never submits): the date, channel, reference
--   (enc), who, the follow-up date (45 days unless named) and the export's SHA-256, which must be the
--   version's.
-- - payer_response: a response to a case's latest submission: kind, amount, its document (or, for
--   reprocessed with no change, the remittance the ledger matched), when it came, the denial's category,
--   notes (enc), and whether a denial reopened the case for the next dispute level within its window.
--   Recording one never writes a ledger entry or a stage (LED-01).
--
-- Rules for every role (the owner included):
-- - a version is written by a person who drafts packets, in their own name, numbered next, of a case
--   not closed, asking for exactly the case's lines not written off at the amounts of their priced lines;
--   its content, narrative, hash and verifier result never change;
-- - approval requires verifier_passed (a CHECK: a version that did not pass cannot have an approval),
--   the version current, its lines still the case's, packet.approve, the approver naming the version's
--   hash, and for a regulation citation the specialist's confirmation; the person who drafted the packet
--   or wrote this version cannot approve it (packet.approve_own_draft, which no role holds), unless no
--   other person who reaches the practice may approve packets: then 24 hours after the version was
--   written, with the audit flag approved_alone;
-- - export is the export job's, once, of the current approved version whose lines are still the case's;
-- - a case's state now derives from its lines and its submissions (case_rules): submitted,
--   awaiting_response, partially_resolved and resolved join open and closed_written_off.
--
-- Two changes to earlier tables: claim.received_on (DTM 050, when the payer received the claim, which
-- prompt-pay interest counts from), loaded from now on; and job_run admits the packet_export job.
--
-- Runs as tp_owner. Safe with the previous image running: new tables, a nullable column, a wider job
-- type check, and a case derivation that gives the previous answers for a case with no submission.

-- ---------------------------------------------------------------------------------------------------
-- Earlier tables
-- ---------------------------------------------------------------------------------------------------

ALTER TABLE claim ADD COLUMN received_on date;
GRANT INSERT (received_on) ON claim TO tp_app;

ALTER TABLE job_run DROP CONSTRAINT job_run_job_type_check;
ALTER TABLE job_run ADD CONSTRAINT job_run_job_type_check
  CHECK (job_type IN ('intake', 'parse_835', 'monitor', 'price', 'triage', 'audit_report', 'reconcile', 'digest', 'export', 'packet_export'));

-- ---------------------------------------------------------------------------------------------------
-- Shapes
-- ---------------------------------------------------------------------------------------------------

-- A version's content (tp-packet/1): its schedule rows numbered 1 to n, each identifier exactly its
-- row's placeholder, each amount integer cents as text; a dispute level from 1; interest a section or
-- null, its total integer cents as text or null. (@tp/packets assembles at least one row; which rows
-- they are is checked against the case when the version is written.)
CREATE FUNCTION packet_content_valid(content jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  line jsonb;
  position integer := 0;
  kind text;
BEGIN
  IF jsonb_typeof(content) IS DISTINCT FROM 'object' OR content ->> 'format' IS DISTINCT FROM 'tp-packet/1'
     OR jsonb_typeof(content -> 'lines') IS DISTINCT FROM 'array'
     OR jsonb_typeof(content -> 'dispute_level') IS DISTINCT FROM 'number' OR coalesce(content ->> 'dispute_level', '') !~ '^[1-9][0-9]{0,2}$'
     OR coalesce(content ->> 'as_of', '') !~ '^\d{4}-\d{2}-\d{2}$' OR NOT content ? 'interest'
     OR jsonb_typeof(content -> 'citation') IS DISTINCT FROM 'object'
     OR jsonb_typeof(content -> 'evidence') IS DISTINCT FROM 'array' OR jsonb_typeof(content -> 'evidence_gaps') IS DISTINCT FROM 'array'
     OR jsonb_typeof(content -> 'sources') IS DISTINCT FROM 'array' OR jsonb_typeof(content -> 'requested_action') IS DISTINCT FROM 'string'
     OR NOT (content -> 'interest' = 'null'::jsonb OR (jsonb_typeof(content -> 'interest') = 'object'
             AND (content -> 'interest' -> 'total_cents' = 'null'::jsonb OR coalesce(content -> 'interest' ->> 'total_cents', '') ~ '^(0|[1-9][0-9]{0,17})$'))) THEN
    RETURN false;
  END IF;
  FOR line IN SELECT value FROM jsonb_array_elements(content -> 'lines') LOOP
    position := position + 1;
    IF jsonb_typeof(line) IS DISTINCT FROM 'object' OR line ->> 'row' IS DISTINCT FROM position::text
       OR coalesce(line ->> 'service_line_id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR coalesce(line ->> 'priced_line_id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RETURN false;
    END IF;
    FOREACH kind IN ARRAY ARRAY['claim_control_number', 'patient_control_number', 'patient_name', 'member_id'] LOOP
      IF line ->> kind IS DISTINCT FROM '{{' || kind || ':' || position::text || '}}' THEN
        RETURN false;
      END IF;
    END LOOP;
    FOREACH kind IN ARRAY ARRAY['expected_cents', 'observed_cents', 'variance_cents', 'paid_cents'] LOOP
      IF coalesce(line ->> kind, '') !~ '^-?(0|[1-9][0-9]{0,17})$' THEN
        RETURN false;
      END IF;
    END LOOP;
  END LOOP;
  RETURN true;
END;
$$;

-- The verifier's report (tp-packet-verifier/1): codes and positions only, never the narrative's text.
CREATE FUNCTION packet_verifier_report_valid(report jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  item jsonb;
BEGIN
  IF jsonb_typeof(report) IS DISTINCT FROM 'object' OR report ->> 'format' IS DISTINCT FROM 'tp-packet-verifier/1'
     OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(report) k) IS DISTINCT FROM ARRAY['checked', 'format', 'mismatches', 'narrative_sha256', 'passed', 'sentences']
     OR jsonb_typeof(report -> 'passed') IS DISTINCT FROM 'boolean' OR coalesce(report ->> 'narrative_sha256', '') !~ '^[0-9a-f]{64}$'
     OR jsonb_typeof(report -> 'sentences') IS DISTINCT FROM 'number' OR jsonb_typeof(report -> 'checked') IS DISTINCT FROM 'number'
     OR jsonb_typeof(report -> 'mismatches') IS DISTINCT FROM 'array' THEN
    RETURN false;
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(report -> 'mismatches') LOOP
    IF jsonb_typeof(item) IS DISTINCT FROM 'object'
       OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(item) k) IS DISTINCT FROM ARRAY['code', 'end', 'kind', 'sentence', 'start']
       OR item ->> 'code' NOT IN ('figure_not_in_input', 'sentence_without_citation', 'unknown_citation', 'unknown_placeholder', 'empty_narrative')
       OR NOT (item -> 'kind' = 'null'::jsonb OR item ->> 'kind' IN ('amount', 'percent', 'date', 'month', 'month_day', 'code', 'modifier', 'number', 'identifier', 'placeholder', 'citation'))
       OR jsonb_typeof(item -> 'sentence') IS DISTINCT FROM 'number' OR jsonb_typeof(item -> 'start') IS DISTINCT FROM 'number' OR jsonb_typeof(item -> 'end') IS DISTINCT FROM 'number' THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN (report ->> 'passed')::boolean = (jsonb_array_length(report -> 'mismatches') = 0);
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------------

CREATE TABLE packet (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practice (id),
  case_id uuid NOT NULL REFERENCES "case" (id),
  -- The version written last; the database keeps it.
  current_version_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- One packet per case; a second-level dispute is a later version of it.
  CONSTRAINT packet_once_per_case UNIQUE (case_id)
);
CREATE INDEX packet_by_practice ON packet (practice_id, case_id);

CREATE TABLE packet_version (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practice (id),
  packet_id uuid NOT NULL REFERENCES packet (id),
  version_no integer NOT NULL CHECK (version_no >= 1),
  -- tp-packet/1, assembled by code from the case and approved records.
  content jsonb NOT NULL CONSTRAINT packet_version_content_valid CHECK (packet_content_valid(content)),
  -- The data dictionary's columns, read from the content.
  citation jsonb GENERATED ALWAYS AS (content -> 'citation') STORED,
  line_table jsonb GENERATED ALWAYS AS (content -> 'lines') STORED,
  evidence jsonb GENERATED ALWAYS AS (content -> 'evidence') STORED,
  interest_cents bigint GENERATED ALWAYS AS ((content -> 'interest' ->> 'total_cents')::bigint) STORED,
  dispute_level integer GENERATED ALWAYS AS ((content ->> 'dispute_level')::integer) STORED,
  -- The person's words with identifier placeholders, encrypted with the practice's key (enc).
  narrative text NOT NULL CHECK (narrative ~ '^enc:v1:[A-Za-z0-9_-]+$'),
  -- SHA-256 of the canonical content, number and narrative's SHA-256 (@tp/packets versionSha256).
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  verifier_passed boolean NOT NULL,
  verifier_report jsonb NOT NULL CONSTRAINT packet_version_verifier_report_valid CHECK (packet_verifier_report_valid(verifier_report)),
  -- Who wrote this version (its drafter, or the last editor of the packet).
  drafted_by uuid NOT NULL REFERENCES "user" (id),
  -- A Medicare Advantage non-contracted pattern: the specialist who confirmed the regulation applies.
  regulation_confirmed_by uuid REFERENCES "user" (id),
  regulation_confirmed_at timestamptz,
  approved_by uuid REFERENCES "user" (id),
  approved_at timestamptz,
  -- The version hash the approver named.
  approved_sha256 text CHECK (approved_sha256 ~ '^[0-9a-f]{64}$'),
  -- The audit flag: approved by its own writer in a practice where no one else may approve, after 24 hours.
  approved_alone boolean NOT NULL DEFAULT false,
  -- The export: opaque keys (practice, packet, object), the SHA-256 of the PDF and of the CSV schedule.
  export_pdf_key text CHECK (export_pdf_key ~ '^practices/[0-9a-f-]{36}/packets/[0-9a-f-]{36}/[0-9a-f-]{36}\.pdf$'),
  export_csv_key text CHECK (export_csv_key ~ '^practices/[0-9a-f-]{36}/packets/[0-9a-f-]{36}/[0-9a-f-]{36}\.csv$'),
  export_sha256 text CHECK (export_sha256 ~ '^[0-9a-f]{64}$'),
  export_csv_sha256 text CHECK (export_csv_sha256 ~ '^[0-9a-f]{64}$'),
  exported_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT packet_version_numbered UNIQUE (packet_id, version_no),
  CONSTRAINT packet_version_verifier_result CHECK (verifier_passed = (verifier_report ->> 'passed')::boolean),
  -- PRD 8, Invariants: a packet_version with verifier_passed = false cannot have an approval.
  CONSTRAINT packet_version_approval_needs_verifier CHECK (approved_by IS NULL OR verifier_passed),
  CONSTRAINT packet_version_approved_together CHECK ((approved_by IS NULL) = (approved_at IS NULL) AND (approved_at IS NULL) = (approved_sha256 IS NULL)),
  CONSTRAINT packet_version_approval_names_its_hash CHECK (approved_sha256 IS NULL OR approved_sha256 = content_sha256),
  CONSTRAINT packet_version_alone_only_approved CHECK (NOT approved_alone OR approved_by IS NOT NULL),
  CONSTRAINT packet_version_confirmed_together CHECK ((regulation_confirmed_by IS NULL) = (regulation_confirmed_at IS NULL)),
  CONSTRAINT packet_version_exported_together CHECK (
    (exported_at IS NULL) = (export_pdf_key IS NULL) AND (exported_at IS NULL) = (export_csv_key IS NULL)
    AND (exported_at IS NULL) = (export_sha256 IS NULL) AND (exported_at IS NULL) = (export_csv_sha256 IS NULL)
  ),
  CONSTRAINT packet_version_export_needs_approval CHECK (exported_at IS NULL OR approved_at IS NOT NULL)
);
CREATE INDEX packet_version_by_packet ON packet_version (practice_id, packet_id, version_no DESC);
ALTER TABLE packet ADD CONSTRAINT packet_current_version_fk FOREIGN KEY (current_version_id) REFERENCES packet_version (id);

CREATE TABLE submission (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practice (id),
  case_id uuid NOT NULL REFERENCES "case" (id),
  packet_version_id uuid NOT NULL REFERENCES packet_version (id),
  submitted_on date NOT NULL,
  channel text NOT NULL CHECK (channel IN ('payer_portal', 'fax', 'mail', 'provider_relations_email')),
  -- The payer's reference for it (a portal confirmation, a fax receipt), encrypted (enc).
  reference text CHECK (reference ~ '^enc:v1:[A-Za-z0-9_-]+$'),
  submitted_by uuid NOT NULL REFERENCES "user" (id),
  -- 45 days after it was submitted unless the person names another date (CAS-14).
  follow_up_on date NOT NULL,
  -- The export the customer sent: the version's PDF and CSV SHA-256.
  export_sha256 text NOT NULL CHECK (export_sha256 ~ '^[0-9a-f]{64}$'),
  export_csv_sha256 text NOT NULL CHECK (export_csv_sha256 ~ '^[0-9a-f]{64}$'),
  -- The dispute level it is (the version's; the database sets it).
  dispute_level integer NOT NULL DEFAULT 1 CHECK (dispute_level >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT submission_follow_up_after CHECK (follow_up_on >= submitted_on)
);
CREATE INDEX submission_by_case ON submission (practice_id, case_id, submitted_on DESC);
CREATE INDEX submission_by_follow_up ON submission (practice_id, follow_up_on);

CREATE TABLE payer_response (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practice (id),
  submission_id uuid NOT NULL REFERENCES submission (id),
  kind text NOT NULL CHECK (kind IN ('accepted', 'partial', 'denied', 'info_requested', 'reprocessed_no_change')),
  -- What the payer accepted (accepted, partial); nothing for the other kinds.
  amount_cents bigint,
  -- The response's document (a payer letter, a portal page saved); for reprocessed with no change the
  -- remittance the recovery ledger matched may stand instead.
  document_id uuid REFERENCES source_document (id),
  remittance_id uuid REFERENCES remittance (id),
  received_on date NOT NULL,
  -- A denial's category (the rules reference's denial categories).
  denial_category text CHECK (denial_category IN ('authorization', 'visit_limit', 'modifier', 'medical_necessity', 'timely_filing', 'bundling', 'other')),
  -- The person's notes, encrypted (enc).
  notes text CHECK (notes ~ '^enc:v1:[A-Za-z0-9_-]+$'),
  -- A denial with a reason that reopened the case for the next dispute level, and that window's end.
  reopens_case boolean NOT NULL DEFAULT false,
  next_window_ends_on date,
  -- Who recorded it; null when the recovery ledger's matching recorded a reprocessed remittance.
  recorded_by uuid REFERENCES "user" (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payer_response_amount_when_accepted CHECK ((kind IN ('accepted', 'partial')) = (amount_cents IS NOT NULL) AND (amount_cents IS NULL OR amount_cents > 0)),
  CONSTRAINT payer_response_evidence CHECK (document_id IS NOT NULL OR (kind = 'reprocessed_no_change' AND remittance_id IS NOT NULL)),
  CONSTRAINT payer_response_remittance_only_reprocessed CHECK (remittance_id IS NULL OR kind = 'reprocessed_no_change'),
  CONSTRAINT payer_response_category_only_denied CHECK (denial_category IS NULL OR kind = 'denied'),
  CONSTRAINT payer_response_reopen_is_a_denial_with_a_reason CHECK (NOT reopens_case OR (kind = 'denied' AND denial_category IS NOT NULL)),
  CONSTRAINT payer_response_reopen_has_its_window CHECK (reopens_case = (next_window_ends_on IS NOT NULL) AND (next_window_ends_on IS NULL OR next_window_ends_on >= received_on)),
  CONSTRAINT payer_response_job_records_reprocessed CHECK (recorded_by IS NOT NULL OR (kind = 'reprocessed_no_change' AND remittance_id IS NOT NULL))
);
CREATE INDEX payer_response_by_submission ON payer_response (practice_id, submission_id, received_on DESC);

INSERT INTO phi_table_registry (table_name, registered_by, policy_name) VALUES
  ('packet', '20261023090000_packets_submissions_and_responses', 'packet_tenant'),
  ('packet_version', '20261023090000_packets_submissions_and_responses', 'packet_version_tenant'),
  ('submission', '20261023090000_packets_submissions_and_responses', 'submission_tenant'),
  ('payer_response', '20261023090000_packets_submissions_and_responses', 'payer_response_tenant');

CREATE TRIGGER packet_updated_at BEFORE UPDATE ON packet FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER packet_version_updated_at BEFORE UPDATE ON packet_version FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------------------------------
-- Who may approve, and what a version asks for
-- ---------------------------------------------------------------------------------------------------

-- A person's roles on a practice now, through the practice's own group or a grant in force (support
-- grants never count: internal users approve nothing): the routes effective_practice_access() finds
-- for the actor, for anyone. Only in the caller's scope.
CREATE FUNCTION person_practice_roles(target_user uuid, target_practice uuid) RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT coalesce(array_agg(DISTINCT r.role), '{}')
    FROM (
      SELECT m.role
        FROM membership m JOIN organization o ON o.id = m.organization_id JOIN practice p ON p.organization_id = o.id
       WHERE m.user_id = target_user AND p.id = target_practice AND o.kind = 'group'
         AND m.role IN ('practice_admin', 'billing_manager', 'analyst', 'viewer') AND (m.ends_at IS NULL OR m.ends_at > now())
      UNION ALL
      SELECT m.role
        FROM membership m JOIN organization o ON o.id = m.organization_id JOIN "grant" g ON g.organization_id = o.id
       WHERE m.user_id = target_user AND g.practice_id = target_practice AND o.kind IN ('group', 'firm')
         AND g.revoked_at IS NULL AND g.starts_at <= now() AND now() < g.ends_at AND g.scope -> 'roles' ? m.role
         AND (m.ends_at IS NULL OR m.ends_at > now())
    ) r
   WHERE target_practice = ANY (coalesce(nullif(current_setting('app.practice_ids', true), '')::uuid[], '{}'::uuid[]))
     AND EXISTS (SELECT 1 FROM "user" u JOIN practice p ON p.id = target_practice
                  WHERE u.id = target_user AND u.status = 'active' AND u.mfa_enrolled AND p.status = 'active' AND NOT user_is_internal(u.id))
$$;

-- Whether a person other than `excluded` who reaches the practice now may approve its packets: when
-- none may, the practice is a single-user practice for packets (PRD 3; PRD 20: a 24-hour delay and
-- an audit flag instead of a second person).
CREATE FUNCTION practice_has_other_packet_approver(target_practice uuid, excluded uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1
      FROM (SELECT DISTINCT m.user_id
              FROM membership m
             WHERE m.user_id IS DISTINCT FROM excluded
               AND (m.organization_id = (SELECT p.organization_id FROM practice p WHERE p.id = target_practice)
                    OR m.organization_id IN (SELECT g.organization_id FROM "grant" g WHERE g.practice_id = target_practice))) people
     WHERE roles_permit(person_practice_roles(people.user_id, target_practice), 'packet.approve'))
$$;

-- Whether a version still asks for exactly its case's lines not written off, each at its case line's
-- priced line and that priced line's amounts (the amounts code computed, never typed).
CREATE FUNCTION packet_version_matches_case(target_case uuid, content jsonb) RETURNS boolean
LANGUAGE sql STABLE SET search_path = pg_catalog, public, pg_temp AS $$
  WITH asked AS (
    SELECT (l ->> 'service_line_id')::uuid AS service_line_id, (l ->> 'priced_line_id')::uuid AS priced_line_id,
           l ->> 'expected_cents' AS expected, l ->> 'observed_cents' AS observed, l ->> 'variance_cents' AS variance, l ->> 'paid_cents' AS paid
      FROM jsonb_array_elements(content -> 'lines') l
  ), held AS (
    SELECT cl.service_line_id, cl.priced_line_id, p.expected_allowed_cents::text AS expected, p.observed_allowed_cents::text AS observed,
           p.variance_cents::text AS variance, sl.paid_cents::text AS paid
      FROM case_line cl JOIN priced_line p ON p.id = cl.priced_line_id JOIN service_line sl ON sl.id = cl.service_line_id
     WHERE cl.case_id = target_case AND cl.written_off_reason IS NULL
  )
  SELECT (SELECT count(*) FROM asked) = (SELECT count(DISTINCT service_line_id) FROM asked)
     AND NOT EXISTS (SELECT * FROM asked EXCEPT SELECT * FROM held)
     AND NOT EXISTS (SELECT * FROM held EXCEPT SELECT * FROM asked)
$$;

-- How many times a case's disputes were denied and reopened for the next level: its next dispute level is one more.
CREATE FUNCTION case_reopened_levels(target_case uuid) RETURNS integer
LANGUAGE sql STABLE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT count(*)::integer FROM payer_response r JOIN submission s ON s.id = r.submission_id WHERE s.case_id = target_case AND r.reopens_case
$$;

-- The end of the next dispute window after a denial of level `denied_level` received on `denied_on`
-- (PRD 12; @tp/packets nextDisputeWindow holds the same rule): the contract version's appeal level of
-- that number, from the denial; for a Medicare Advantage non-contracted case after a level-one denial,
-- the Medicare reconsideration window of the release in force. Null when no window is known.
CREATE FUNCTION case_next_dispute_window(target_case uuid, denied_level integer, denied_on date) RETURNS date
LANGUAGE plpgsql STABLE SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  pattern jsonb;
  days integer;
  window_value jsonb;
BEGIN
  SELECT c.pattern_key INTO pattern FROM "case" c WHERE c.id = target_case;
  IF pattern ->> 'contract_version_id' IS NOT NULL THEN
    SELECT (e ->> 'days')::integer INTO days
      FROM contract_version v, jsonb_array_elements(v.appeal_levels) e
     WHERE v.id = (pattern ->> 'contract_version_id')::uuid AND (e ->> 'level')::integer = denied_level;
    RETURN CASE WHEN days IS NULL THEN NULL ELSE denied_on + days END;
  END IF;
  IF pattern ->> 'mapping_kind' = 'ma_noncontracted' AND denied_level = 1 THEN
    SELECT r.value INTO window_value
      FROM rule_record r
     WHERE r.release_no = current_rule_release() AND r.record_type = 'dispute_window'
       AND r.key = '{"program": "medicare", "window": "reconsideration"}'::jsonb
       AND r.effective_from <= denied_on AND (r.effective_to IS NULL OR denied_on <= r.effective_to)
     ORDER BY r.effective_from DESC LIMIT 1;
    IF window_value IS NULL THEN
      RETURN NULL;
    END IF;
    RETURN CASE window_value ->> 'unit'
      WHEN 'days' THEN denied_on + (window_value ->> 'length')::integer
      WHEN 'months' THEN (denied_on + make_interval(months => (window_value ->> 'length')::integer))::date
    END;
  END IF;
  RETURN NULL;
END;
$$;

-- The people a version names, by email (the export's approval record; the workbench), for a version in
-- the caller's scope only.
CREATE FUNCTION packet_version_people(target uuid) RETURNS TABLE (drafted_by_email text, approved_by_email text, regulation_confirmed_by_email text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT d.email, a.email, s.email
    FROM packet_version v
    JOIN "user" d ON d.id = v.drafted_by
    LEFT JOIN "user" a ON a.id = v.approved_by
    LEFT JOIN "user" s ON s.id = v.regulation_confirmed_by
   WHERE v.id = target AND v.practice_id = ANY (coalesce(nullif(current_setting('app.practice_ids', true), '')::uuid[], '{}'::uuid[]))
$$;

-- ---------------------------------------------------------------------------------------------------
-- Rules. Lookups of other rows run under the caller's policies.
-- ---------------------------------------------------------------------------------------------------

CREATE FUNCTION packets_never_deleted() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION '% rows are never deleted: packets, submissions and responses keep what they recorded', TG_TABLE_NAME USING ERRCODE = 'check_violation';
END;
$$;

CREATE FUNCTION packets_no_truncate() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION '% cannot be truncated: packets, submissions and responses keep what they recorded', TG_TABLE_NAME USING ERRCODE = 'check_violation';
END;
$$;

-- Checks that read the actor or other rows run in AFTER INSERT triggers, once the row has passed its
-- practice's policy: a row of another practice meets the tenant policy (42501) before any rule sees
-- it (docs/adr/0038). BEFORE triggers only fill in what the database sets.

-- A packet is opened by a person who drafts packets, with no version yet, for a case of its practice
-- that is not closed; afterwards only its current version moves, to the version written last (the
-- database does it when a version is written).
CREATE FUNCTION packet_rules() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.current_version_id IS NOT NULL THEN
      RAISE EXCEPTION 'a packet is opened with no version; writing one makes it current' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.practice_id, NEW.case_id, NEW.created_at) IS DISTINCT FROM (OLD.id, OLD.practice_id, OLD.case_id, OLD.created_at) THEN
    RAISE EXCEPTION 'a packet''s case never changes' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.current_version_id IS DISTINCT FROM OLD.current_version_id
     AND NEW.current_version_id IS DISTINCT FROM (SELECT v.id FROM packet_version v WHERE v.packet_id = NEW.id ORDER BY v.version_no DESC LIMIT 1) THEN
    RAISE EXCEPTION 'a packet''s current version is the version written last' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER packet_rules BEFORE INSERT OR UPDATE ON packet FOR EACH ROW EXECUTE FUNCTION packet_rules();

CREATE FUNCTION packet_belongs() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NOT app_actor_is_person() OR NOT coalesce(app_actor_permitted(NEW.practice_id, 'packet.draft'), false) THEN
    RAISE EXCEPTION 'a packet is opened by a person who drafts packets' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "case" c WHERE c.id = NEW.case_id AND c.practice_id = NEW.practice_id AND c.state <> 'closed_written_off') THEN
    RAISE EXCEPTION 'a packet is of a case of its practice that is not closed' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER packet_belongs AFTER INSERT ON packet FOR EACH ROW EXECUTE FUNCTION packet_belongs();
CREATE TRIGGER packet_never_deleted BEFORE DELETE ON packet FOR EACH ROW EXECUTE FUNCTION packets_never_deleted();
CREATE TRIGGER packet_no_truncate BEFORE TRUNCATE ON packet FOR EACH STATEMENT EXECUTE FUNCTION packets_no_truncate();

-- A version is written once and never changes (CAS-13: an edit is a new version, which clears the
-- packet's approval). The only later steps: the specialist's confirmation of the regulation, approval
-- and the export, each once and in order.
CREATE FUNCTION packet_version_rules() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  the_case uuid;
  current_id uuid;
  drafter uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF (NEW.regulation_confirmed_by, NEW.regulation_confirmed_at, NEW.approved_by, NEW.approved_at, NEW.approved_sha256, NEW.export_pdf_key, NEW.export_csv_key, NEW.export_sha256, NEW.export_csv_sha256, NEW.exported_at)
       IS DISTINCT FROM (NULL::uuid, NULL::timestamptz, NULL::uuid, NULL::timestamptz, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::timestamptz)
       OR NEW.approved_alone THEN
      RAISE EXCEPTION 'a packet version is written unapproved and unexported' USING ERRCODE = 'check_violation';
    END IF;
    -- The 24 hours of a single-user approval run from here.
    NEW.created_at := now();
    RETURN NEW;
  END IF;

  IF (NEW.id, NEW.practice_id, NEW.packet_id, NEW.version_no, NEW.content, NEW.narrative, NEW.content_sha256, NEW.verifier_passed, NEW.verifier_report, NEW.drafted_by, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.practice_id, OLD.packet_id, OLD.version_no, OLD.content, OLD.narrative, OLD.content_sha256, OLD.verifier_passed, OLD.verifier_report, OLD.drafted_by, OLD.created_at) THEN
    RAISE EXCEPTION 'a packet version never changes once written; an edit is a new version' USING ERRCODE = 'check_violation';
  END IF;
  SELECT p.current_version_id, p.case_id INTO current_id, the_case FROM packet p WHERE p.id = NEW.packet_id;

  -- The specialist's confirmation that the regulation applies (a Medicare Advantage non-contracted case).
  IF (NEW.regulation_confirmed_by, NEW.regulation_confirmed_at) IS DISTINCT FROM (OLD.regulation_confirmed_by, OLD.regulation_confirmed_at) THEN
    IF OLD.regulation_confirmed_by IS NOT NULL OR NEW.regulation_confirmed_by IS NULL OR NEW.content -> 'citation' ->> 'kind' IS DISTINCT FROM 'regulation' OR OLD.approved_by IS NOT NULL THEN
      RAISE EXCEPTION 'a regulation citation is confirmed once, before approval' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.regulation_confirmed_by IS DISTINCT FROM app_actor_id() OR NOT coalesce(app_actor_permitted(NEW.practice_id, 'pricing.answer'), false) THEN
      RAISE EXCEPTION 'a regulation''s application to a case is confirmed by a contract specialist, in their own name' USING ERRCODE = 'insufficient_privilege';
    END IF;
    NEW.regulation_confirmed_at := now();
  END IF;

  -- Approval (CAS-09, CAS-10).
  IF (NEW.approved_by, NEW.approved_at, NEW.approved_sha256, NEW.approved_alone) IS DISTINCT FROM (OLD.approved_by, OLD.approved_at, OLD.approved_sha256, OLD.approved_alone) THEN
    IF OLD.approved_by IS NOT NULL OR NEW.approved_by IS NULL THEN
      RAISE EXCEPTION 'a packet version is approved once, and an approval is never withdrawn; an edit is a new version' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT NEW.verifier_passed THEN
      RAISE EXCEPTION 'a packet version the verifier failed cannot be approved' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.approved_by IS DISTINCT FROM app_actor_id() OR NOT coalesce(app_actor_permitted(NEW.practice_id, 'packet.approve'), false) THEN
      RAISE EXCEPTION 'a packet is approved by a person who approves packets, in their own name' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.id IS DISTINCT FROM current_id THEN
      RAISE EXCEPTION 'only a packet''s current version is approved' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.approved_sha256 IS DISTINCT FROM NEW.content_sha256 THEN
      RAISE EXCEPTION 'an approval names the hash of the version it approves' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.content -> 'citation' ->> 'kind' = 'regulation' AND NEW.regulation_confirmed_by IS NULL THEN
      RAISE EXCEPTION 'a contract specialist confirms the regulation applies to the case before its packet is approved' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM "case" c WHERE c.id = the_case AND c.state <> 'closed_written_off') OR NOT packet_version_matches_case(the_case, NEW.content) THEN
      RAISE EXCEPTION 'the case''s lines have changed since this version was written; a new version is written first' USING ERRCODE = 'check_violation';
    END IF;
    SELECT v.drafted_by INTO drafter FROM packet_version v WHERE v.packet_id = NEW.packet_id AND v.version_no = 1;
    IF app_actor_id() IN (drafter, NEW.drafted_by) AND NOT coalesce(app_actor_permitted(NEW.practice_id, 'packet.approve_own_draft'), false) THEN
      IF practice_has_other_packet_approver(NEW.practice_id, app_actor_id()) THEN
        RAISE EXCEPTION 'the person who drafted or last edited a packet cannot approve it' USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF now() < NEW.created_at + interval '24 hours' THEN
        RAISE EXCEPTION 'with no one else to approve it, a packet is approved by its own writer only 24 hours after the version was written' USING ERRCODE = 'check_violation';
      END IF;
      NEW.approved_alone := true;
    ELSE
      NEW.approved_alone := false;
    END IF;
    NEW.approved_at := now();
  END IF;

  -- The export, by the export job (CAS-12).
  IF (NEW.export_pdf_key, NEW.export_csv_key, NEW.export_sha256, NEW.export_csv_sha256, NEW.exported_at) IS DISTINCT FROM (OLD.export_pdf_key, OLD.export_csv_key, OLD.export_sha256, OLD.export_csv_sha256, OLD.exported_at) THEN
    IF OLD.exported_at IS NOT NULL OR NEW.export_sha256 IS NULL THEN
      RAISE EXCEPTION 'a packet version is exported once' USING ERRCODE = 'check_violation';
    END IF;
    IF app_actor_is_person() THEN
      RAISE EXCEPTION 'only the export job exports a packet' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF OLD.approved_by IS NULL THEN
      RAISE EXCEPTION 'exporting a packet needs an approved version' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.id IS DISTINCT FROM current_id OR NOT packet_version_matches_case(the_case, NEW.content) THEN
      RAISE EXCEPTION 'only a packet''s current version, still asking for its case''s lines, is exported' USING ERRCODE = 'check_violation';
    END IF;
    NEW.exported_at := now();
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER packet_version_rules BEFORE INSERT OR UPDATE ON packet_version FOR EACH ROW EXECUTE FUNCTION packet_version_rules();

-- A version is written by a person who drafts packets, in their own name, numbered after the last,
-- for a case not closed, asking for exactly the case's lines not written off at their priced amounts,
-- at the case's dispute level.
CREATE FUNCTION packet_version_belongs() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  the_case uuid;
BEGIN
  IF NOT app_actor_is_person() OR NEW.drafted_by IS DISTINCT FROM app_actor_id() OR NOT coalesce(app_actor_permitted(NEW.practice_id, 'packet.draft'), false) THEN
    RAISE EXCEPTION 'a packet version is written by a person who drafts packets, in their own name' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT p.case_id INTO the_case FROM packet p WHERE p.id = NEW.packet_id AND p.practice_id = NEW.practice_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'a packet version is of a packet of its practice' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.version_no IS DISTINCT FROM 1 + coalesce((SELECT max(v.version_no) FROM packet_version v WHERE v.packet_id = NEW.packet_id AND v.id <> NEW.id), 0) THEN
    RAISE EXCEPTION 'a packet version is numbered after the last one' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "case" c WHERE c.id = the_case AND c.state <> 'closed_written_off') THEN
    RAISE EXCEPTION 'a packet of a case closed written off takes no new version' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT packet_version_matches_case(the_case, NEW.content) THEN
    RAISE EXCEPTION 'a packet version asks for exactly its case''s lines not written off, at their priced amounts' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.dispute_level IS DISTINCT FROM 1 + case_reopened_levels(the_case) THEN
    RAISE EXCEPTION 'a packet version is of the case''s dispute level' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER packet_version_belongs AFTER INSERT ON packet_version FOR EACH ROW EXECUTE FUNCTION packet_version_belongs();

-- Makes a version written the packet's current version (as the owner, which the application role
-- cannot update the packet as), in the caller's practice scope.
CREATE FUNCTION packet_version_becomes_current() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  UPDATE packet p SET current_version_id = NEW.id WHERE p.id = NEW.packet_id;
  RETURN NULL;
END;
$$;
CREATE TRIGGER packet_version_becomes_current AFTER INSERT ON packet_version FOR EACH ROW EXECUTE FUNCTION packet_version_becomes_current();
CREATE TRIGGER packet_version_never_deleted BEFORE DELETE ON packet_version FOR EACH ROW EXECUTE FUNCTION packets_never_deleted();
CREATE TRIGGER packet_version_no_truncate BEFORE TRUNCATE ON packet_version FOR EACH STATEMENT EXECUTE FUNCTION packets_no_truncate();

-- The latest submission of a case (its dispute in force), and the latest response to a submission.
CREATE FUNCTION case_latest_submission(target_case uuid) RETURNS uuid
LANGUAGE sql STABLE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT s.id FROM submission s WHERE s.case_id = target_case ORDER BY s.submitted_on DESC, s.created_at DESC, s.id DESC LIMIT 1
$$;

CREATE FUNCTION submission_latest_response(target_submission uuid) RETURNS uuid
LANGUAGE sql STABLE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT r.id FROM payer_response r WHERE r.submission_id = target_submission ORDER BY r.received_on DESC, r.created_at DESC, r.id DESC LIMIT 1
$$;

-- A submission never changes; when logged, the database sets its dispute level (one more than the
-- case's reopened denials) and, unless the person names one, its follow-up 45 days on (CAS-14).
CREATE FUNCTION submission_rules() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'a submission never changes once logged' USING ERRCODE = 'check_violation';
  END IF;
  NEW.dispute_level := 1 + case_reopened_levels(NEW.case_id);
  NEW.follow_up_on := coalesce(NEW.follow_up_on, NEW.submitted_on + 45);
  RETURN NEW;
END;
$$;
CREATE TRIGGER submission_rules BEFORE INSERT OR UPDATE ON submission FOR EACH ROW EXECUTE FUNCTION submission_rules();

-- A submission is logged by a person who logs submissions, in their own name, of an exported version
-- of the case's packet at the case's dispute level, with that export's SHA-256, on a day from the
-- export to today, on or after the case's last one. The dispute's state decides whether it may be
-- logged: no submission yet, no response yet (sent again), more information asked for, or a denial
-- that reopened the case, within the next level's window.
CREATE FUNCTION submission_belongs() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  version record;
  previous record;
  answer_kind text;
  answer_reopens boolean;
  answer_window date;
BEGIN
  IF NOT app_actor_is_person() OR NEW.submitted_by IS DISTINCT FROM app_actor_id() OR NOT coalesce(app_actor_permitted(NEW.practice_id, 'submission.log'), false) THEN
    RAISE EXCEPTION 'a submission is logged by a person who logs submissions, in their own name' USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('submission:' || NEW.case_id::text, 0));
  SELECT v.export_sha256, v.export_csv_sha256, v.exported_at, v.dispute_level INTO version
    FROM packet_version v JOIN packet p ON p.id = v.packet_id
   WHERE v.id = NEW.packet_version_id AND p.case_id = NEW.case_id AND v.practice_id = NEW.practice_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'a submission is of a version of its case''s packet' USING ERRCODE = 'check_violation';
  END IF;
  IF version.exported_at IS NULL THEN
    RAISE EXCEPTION 'a packet is submitted once it is exported' USING ERRCODE = 'check_violation';
  END IF;
  IF (NEW.export_sha256, NEW.export_csv_sha256) IS DISTINCT FROM (version.export_sha256, version.export_csv_sha256) THEN
    RAISE EXCEPTION 'a submission carries the SHA-256 of the export it sent' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.submitted_on < (version.exported_at AT TIME ZONE 'UTC')::date OR NEW.submitted_on > (now() AT TIME ZONE 'UTC')::date THEN
    RAISE EXCEPTION 'a submission is dated from its export to today' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM "case" c WHERE c.id = NEW.case_id AND c.state = 'closed_written_off') THEN
    RAISE EXCEPTION 'a case closed written off takes no submission' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.dispute_level IS DISTINCT FROM version.dispute_level THEN
    RAISE EXCEPTION 'a submission sends a version of the case''s dispute level' USING ERRCODE = 'check_violation';
  END IF;
  SELECT s.id, s.submitted_on INTO previous
    FROM submission s WHERE s.case_id = NEW.case_id AND s.id <> NEW.id ORDER BY s.submitted_on DESC, s.created_at DESC, s.id DESC LIMIT 1;
  IF FOUND THEN
    IF NEW.submitted_on < previous.submitted_on THEN
      RAISE EXCEPTION 'a submission is dated on or after the case''s last one' USING ERRCODE = 'check_violation';
    END IF;
    SELECT r.kind, r.reopens_case, r.next_window_ends_on INTO answer_kind, answer_reopens, answer_window FROM payer_response r WHERE r.id = submission_latest_response(previous.id);
    IF answer_kind IS NOT NULL AND NOT (answer_kind = 'info_requested' OR answer_reopens) THEN
      RAISE EXCEPTION 'the payer has answered this dispute; only a denial that reopens the case starts the next level' USING ERRCODE = 'check_violation';
    END IF;
    IF answer_reopens AND NEW.submitted_on > answer_window THEN
      RAISE EXCEPTION 'the next dispute level is submitted within its window' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER submission_belongs AFTER INSERT ON submission FOR EACH ROW EXECUTE FUNCTION submission_belongs();
CREATE TRIGGER submission_never_deleted BEFORE DELETE ON submission FOR EACH ROW EXECUTE FUNCTION packets_never_deleted();
CREATE TRIGGER submission_no_truncate BEFORE TRUNCATE ON submission FOR EACH STATEMENT EXECUTE FUNCTION packets_no_truncate();

-- A response never changes; when recorded, the database sets the window a denial that reopens the case
-- opens (the next level's), and refuses the reopen when no window is known or it has closed.
CREATE FUNCTION payer_response_rules() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  sent record;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'a payer response never changes once recorded' USING ERRCODE = 'check_violation';
  END IF;
  NEW.next_window_ends_on := NULL;
  IF NEW.reopens_case THEN
    SELECT s.case_id, s.dispute_level INTO sent FROM submission s WHERE s.id = NEW.submission_id;
    IF FOUND THEN
      NEW.next_window_ends_on := case_next_dispute_window(sent.case_id, sent.dispute_level, NEW.received_on);
    END IF;
    IF NEW.next_window_ends_on IS NULL THEN
      RAISE EXCEPTION 'no next dispute window is known for this case, so the denial cannot reopen it' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.next_window_ends_on < (now() AT TIME ZONE 'UTC')::date THEN
      RAISE EXCEPTION 'the next dispute window has closed, so the denial cannot reopen the case' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER payer_response_rules BEFORE INSERT OR UPDATE ON payer_response FOR EACH ROW EXECUTE FUNCTION payer_response_rules();

-- A response is to its case's latest submission, received from that submission to today and on or
-- after its last response: recorded by a person who logs submissions in their own name (with its
-- document), or by the recovery ledger's matching (a job, in no one's name: a reprocessed remittance
-- with no change). It writes no ledger entry and no stage (LED-01).
CREATE FUNCTION payer_response_belongs() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  sent record;
  previous date;
BEGIN
  IF app_actor_is_person() THEN
    IF NEW.recorded_by IS DISTINCT FROM app_actor_id() OR NOT coalesce(app_actor_permitted(NEW.practice_id, 'submission.log'), false) THEN
      RAISE EXCEPTION 'a payer response is recorded by a person who logs submissions, in their own name' USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF NEW.recorded_by IS NOT NULL THEN
    RAISE EXCEPTION 'a job records a response in no one''s name' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT s.id, s.case_id, s.submitted_on INTO sent FROM submission s WHERE s.id = NEW.submission_id AND s.practice_id = NEW.practice_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'a payer response is to a submission of its practice' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('submission:' || sent.case_id::text, 0));
  IF sent.id IS DISTINCT FROM case_latest_submission(sent.case_id) THEN
    RAISE EXCEPTION 'a payer response answers its case''s latest submission' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.received_on < sent.submitted_on OR NEW.received_on > (now() AT TIME ZONE 'UTC')::date THEN
    RAISE EXCEPTION 'a payer response is received from its submission to today' USING ERRCODE = 'check_violation';
  END IF;
  SELECT max(r.received_on) INTO previous FROM payer_response r WHERE r.submission_id = sent.id AND r.id <> NEW.id;
  IF previous IS NOT NULL AND NEW.received_on < previous THEN
    RAISE EXCEPTION 'a payer response is received on or after the submission''s last one' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.document_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM source_document d WHERE d.id = NEW.document_id AND d.practice_id = NEW.practice_id) THEN
    RAISE EXCEPTION 'a payer response''s document is a document of its practice' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.remittance_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM remittance m WHERE m.id = NEW.remittance_id AND m.practice_id = NEW.practice_id AND m.status = 'loaded') THEN
    RAISE EXCEPTION 'a payer response''s remittance is a loaded remittance of its practice' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER payer_response_belongs AFTER INSERT ON payer_response FOR EACH ROW EXECUTE FUNCTION payer_response_belongs();
CREATE TRIGGER payer_response_never_deleted BEFORE DELETE ON payer_response FOR EACH ROW EXECUTE FUNCTION packets_never_deleted();
CREATE TRIGGER payer_response_no_truncate BEFORE TRUNCATE ON payer_response FOR EACH STATEMENT EXECUTE FUNCTION packets_no_truncate();

-- ---------------------------------------------------------------------------------------------------
-- The case's state from its lines and submissions
-- ---------------------------------------------------------------------------------------------------

-- As before for a case's fixed columns, total and close; its state and deadline now also read its lines'
-- stages and its submissions (@tp/triage deriveCaseState holds the same order; docs/adr/0041):
-- closed_written_off when every line is written off; resolved when every line not written off is payer
-- approved or recovered, partially_resolved when some are; then from the latest submission's latest
-- response: open with no submission, submitted with no response, awaiting_response after a request for
-- information or a denial that reopened the case, partially_resolved after a partial acceptance,
-- resolved after an acceptance, a denial that did not reopen it, or a reprocessing with no change. The
-- deadline is the reopened level's window while the case waits on it, else the earliest window of its
-- lines not written off.
CREATE OR REPLACE FUNCTION case_rules() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  totals record;
  latest uuid;
  answer_kind text;
  answer_reopens boolean;
  answer_window date;
  derived text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.state := 'open';
    NEW.actionable_cents := 0;
    NEW.deadline_on := NULL;
    NEW.closed_at := NULL;
    NEW.opened_at := now();
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.practice_id, NEW.pattern_key, NEW.payer_id, NEW.plan_id, NEW.rate_record_id, NEW.materiality_cents, NEW.pursuit_cost_cents, NEW.opened_at, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.practice_id, OLD.pattern_key, OLD.payer_id, OLD.plan_id, OLD.rate_record_id, OLD.materiality_cents, OLD.pursuit_cost_cents, OLD.opened_at, OLD.created_at) THEN
    RAISE EXCEPTION 'a case''s pattern, payer, plan, rate record, materiality and pursuit estimate never change' USING ERRCODE = 'check_violation';
  END IF;
  SELECT count(*) AS lines,
         count(*) FILTER (WHERE c.written_off_reason IS NULL) AS open_lines,
         count(*) FILTER (WHERE c.written_off_reason IS NULL AND (
           SELECT s.stage FROM line_status s WHERE s.service_line_id = c.service_line_id ORDER BY s.seq DESC LIMIT 1
         ) IN ('payer_approved', 'recovered')) AS resolved_lines,
         coalesce(sum(p.variance_cents) FILTER (WHERE c.written_off_reason IS NULL), 0) AS actionable,
         min(p.window_ends_on) FILTER (WHERE c.written_off_reason IS NULL) AS deadline
    INTO totals
    FROM case_line c JOIN priced_line p ON p.id = c.priced_line_id
   WHERE c.case_id = NEW.id;
  NEW.actionable_cents := totals.actionable;
  NEW.deadline_on := totals.deadline;
  latest := case_latest_submission(NEW.id);
  IF latest IS NOT NULL THEN
    SELECT r.kind, r.reopens_case, r.next_window_ends_on INTO answer_kind, answer_reopens, answer_window FROM payer_response r WHERE r.id = submission_latest_response(latest);
  END IF;
  IF totals.lines > 0 AND totals.open_lines = 0 THEN
    derived := 'closed_written_off';
  ELSIF totals.open_lines > 0 AND totals.resolved_lines = totals.open_lines THEN
    derived := 'resolved';
  ELSIF totals.resolved_lines > 0 THEN
    derived := 'partially_resolved';
  ELSIF latest IS NULL THEN
    derived := 'open';
  ELSIF answer_kind IS NULL THEN
    derived := 'submitted';
  ELSIF answer_kind = 'info_requested' OR (answer_kind = 'denied' AND answer_reopens) THEN
    derived := 'awaiting_response';
  ELSIF answer_kind = 'partial' THEN
    derived := 'partially_resolved';
  ELSE
    derived := 'resolved';
  END IF;
  IF derived = 'awaiting_response' AND answer_reopens THEN
    NEW.deadline_on := answer_window;
  END IF;
  NEW.state := derived;
  NEW.closed_at := CASE WHEN derived = 'closed_written_off' THEN coalesce(OLD.closed_at, now()) END;
  RETURN NEW;
END;
$$;

-- Brings the case a submission, a response or a stage event concerns up to date (as the owner, which
-- the application role cannot update the case as), in the caller's practice scope.
CREATE FUNCTION submission_refresh_case() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  UPDATE "case" c SET updated_at = now() WHERE c.id = NEW.case_id;
  RETURN NULL;
END;
$$;
CREATE TRIGGER submission_refresh_case AFTER INSERT ON submission FOR EACH ROW EXECUTE FUNCTION submission_refresh_case();

CREATE FUNCTION payer_response_refresh_case() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  UPDATE "case" c SET updated_at = now() WHERE c.id = (SELECT s.case_id FROM submission s WHERE s.id = NEW.submission_id);
  RETURN NULL;
END;
$$;
CREATE TRIGGER payer_response_refresh_case AFTER INSERT ON payer_response FOR EACH ROW EXECUTE FUNCTION payer_response_refresh_case();

CREATE FUNCTION line_status_refresh_cases() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  UPDATE "case" c SET updated_at = now()
   WHERE c.id IN (SELECT DISTINCT cl.case_id FROM case_line cl JOIN changed ON changed.service_line_id = cl.service_line_id);
  RETURN NULL;
END;
$$;
CREATE TRIGGER line_status_refresh_cases AFTER INSERT ON line_status REFERENCING NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION line_status_refresh_cases();

-- ---------------------------------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------------------------------

ALTER TABLE packet ENABLE ROW LEVEL SECURITY;
ALTER TABLE packet FORCE ROW LEVEL SECURITY;
CREATE POLICY packet_tenant ON packet
  USING (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]))
  WITH CHECK (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]));

ALTER TABLE packet_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE packet_version FORCE ROW LEVEL SECURITY;
CREATE POLICY packet_version_tenant ON packet_version
  USING (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]))
  WITH CHECK (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]));
-- Nobody writes a version in another person's name.
CREATE POLICY packet_version_drafted_by_actor ON packet_version AS RESTRICTIVE FOR INSERT TO tp_app
  WITH CHECK (drafted_by = app_actor_id());

ALTER TABLE submission ENABLE ROW LEVEL SECURITY;
ALTER TABLE submission FORCE ROW LEVEL SECURITY;
CREATE POLICY submission_tenant ON submission
  USING (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]))
  WITH CHECK (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]));
CREATE POLICY submission_logged_by_actor ON submission AS RESTRICTIVE FOR INSERT TO tp_app
  WITH CHECK (submitted_by = app_actor_id());

ALTER TABLE payer_response ENABLE ROW LEVEL SECURITY;
ALTER TABLE payer_response FORCE ROW LEVEL SECURITY;
CREATE POLICY payer_response_tenant ON payer_response
  USING (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]))
  WITH CHECK (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]));
CREATE POLICY payer_response_recorded_by_actor ON payer_response AS RESTRICTIVE FOR INSERT TO tp_app
  WITH CHECK (recorded_by IS NOT DISTINCT FROM CASE WHEN app_actor_is_person() THEN app_actor_id() END);

-- ---------------------------------------------------------------------------------------------------
-- Privileges. People open packets, write versions, approve them and confirm regulations, log
-- submissions and record responses; the export job records exports; the recovery ledger's job records
-- reprocessed responses. Nothing is deleted by anyone; a packet's current version and a case's derived
-- columns are the database's.
-- ---------------------------------------------------------------------------------------------------

REVOKE ALL ON packet, packet_version, submission, payer_response FROM PUBLIC;
GRANT SELECT ON packet, packet_version, submission, payer_response TO tp_app;
GRANT INSERT (id, practice_id, case_id) ON packet TO tp_app;
GRANT INSERT (id, practice_id, packet_id, version_no, content, narrative, content_sha256, verifier_passed, verifier_report, drafted_by) ON packet_version TO tp_app;
GRANT UPDATE (regulation_confirmed_by, approved_by, approved_sha256, export_pdf_key, export_csv_key, export_sha256, export_csv_sha256) ON packet_version TO tp_app;
GRANT INSERT (id, practice_id, case_id, packet_version_id, submitted_on, channel, reference, submitted_by, follow_up_on, export_sha256, export_csv_sha256) ON submission TO tp_app;
GRANT INSERT (id, practice_id, submission_id, kind, amount_cents, document_id, remittance_id, received_on, denial_category, notes, reopens_case, next_window_ends_on, recorded_by) ON payer_response TO tp_app;

REVOKE ALL ON FUNCTION packet_content_valid(jsonb), packet_verifier_report_valid(jsonb), person_practice_roles(uuid, uuid), practice_has_other_packet_approver(uuid, uuid),
  packet_version_matches_case(uuid, jsonb), case_reopened_levels(uuid), case_next_dispute_window(uuid, integer, date), packet_version_people(uuid), packets_never_deleted(),
  packets_no_truncate(), packet_rules(), packet_belongs(), packet_version_rules(), packet_version_belongs(), packet_version_becomes_current(), case_latest_submission(uuid),
  submission_latest_response(uuid), submission_rules(), submission_belongs(), payer_response_rules(), payer_response_belongs(), submission_refresh_case(), payer_response_refresh_case(),
  line_status_refresh_cases() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION packet_content_valid(jsonb), packet_verifier_report_valid(jsonb), practice_has_other_packet_approver(uuid, uuid), packet_version_matches_case(uuid, jsonb),
  case_reopened_levels(uuid), case_next_dispute_window(uuid, integer, date), packet_version_people(uuid), case_latest_submission(uuid), submission_latest_response(uuid) TO tp_app;

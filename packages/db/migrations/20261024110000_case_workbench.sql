-- The case workbench (PRD 5, J8 to J10; PRD 7, Cases, Packet builder, Submissions and responses; PRD 8,
-- case: owner, materiality; PRD 12; test matrix CAS-03 to CAS-15; docs/adr/0044).
--
-- One PHI table, with practice_id NOT NULL (indexed), ENABLE and FORCE ROW LEVEL SECURITY, the
-- registered tenant policy and a row in phi_table_registry:
--
-- - case_activity: what people do on a case that no other record holds, append-only: a note (the
--   person's words, encrypted with the practice's key, enc), an assignment (the case's new owner, or
--   none), and a request for approval of the packet's current version (with optional words, enc). An
--   assignment sets case.owner_user_id, which nothing else sets; the rows are the assignment history
--   the case's timeline shows.
--
-- And for the workbench's other steps:
--
-- - a person opens a case, or adds a line to one, only with case.work (a job, triage, as before);
-- - a case is assigned to a person who works the practice's cases now, by a person who does;
-- - the practice's materiality thresholds (per line and per case; PRD 5, J8: "practice settings with
--   defaults") are set by a person who works its cases, as integer cents, in the request's scope;
-- - the people who may own the practice's cases, and the email addresses of the practice's people who
--   wrote or own its case records, are read through functions that answer only for a practice the
--   caller reaches (people do not otherwise read each other's user rows).
--
-- Runs as tp_owner. Safe with the previous image running: a new table, new functions, and two
-- restrictive insert policies the previous image's people already meet (they open no case by hand).

-- ---------------------------------------------------------------------------------------------------
-- case_activity
-- ---------------------------------------------------------------------------------------------------

CREATE TABLE case_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practice (id),
  case_id uuid NOT NULL REFERENCES "case" (id),
  -- note: a person's note; assigned: the case's owner changed; approval_requested: the packet's
  -- current version is ready for a second person to approve.
  kind text NOT NULL CHECK (kind IN ('note', 'assigned', 'approval_requested')),
  -- The person's words, encrypted with the practice's key (enc): a note's text, or a request's message.
  body text CHECK (body ~ '^enc:v1:[A-Za-z0-9_-]+$'),
  -- An assignment's new owner; null when the case was left unassigned.
  owner_user_id uuid REFERENCES "user" (id),
  -- The version an approval request names.
  packet_version_id uuid REFERENCES packet_version (id),
  created_by uuid NOT NULL REFERENCES "user" (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT case_activity_note_says_something CHECK (kind <> 'note' OR body IS NOT NULL),
  CONSTRAINT case_activity_owner_only_assigned CHECK (owner_user_id IS NULL OR kind = 'assigned'),
  CONSTRAINT case_activity_assignment_has_no_words CHECK (kind <> 'assigned' OR body IS NULL),
  CONSTRAINT case_activity_request_names_its_version CHECK ((kind = 'approval_requested') = (packet_version_id IS NOT NULL))
);
CREATE INDEX case_activity_by_case ON case_activity (practice_id, case_id, created_at);

INSERT INTO phi_table_registry (table_name, registered_by, policy_name) VALUES
  ('case_activity', '20261024110000_case_workbench', 'case_activity_tenant');

-- Whether a person works the practice's cases now (owners a case can be assigned to): their roles
-- through the practice's group or a grant in force admit case.work. Only in the caller's scope.
CREATE FUNCTION case_owner_eligible(target_user uuid, target_practice uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT roles_permit(person_practice_roles(target_user, target_practice), 'case.work')
$$;

-- An activity row never changes and is never deleted; the database stamps when it was written.
CREATE FUNCTION case_activity_rules() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'a case''s activity never changes and is never deleted; a later note or assignment is a new row' USING ERRCODE = 'check_violation';
  END IF;
  NEW.created_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER case_activity_rules BEFORE INSERT OR UPDATE OR DELETE ON case_activity FOR EACH ROW EXECUTE FUNCTION case_activity_rules();

-- A person's, in their own name, of a case of its practice: a note or an assignment by a person who
-- works cases (the owner, when named, one who does too); an approval request by a person who drafts
-- packets, of the case's packet's current version, unapproved, once the verifier passed it. Checked
-- after the row meets the tenant policy (docs/adr/0038).
CREATE FUNCTION case_activity_belongs() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  version record;
BEGIN
  IF NOT app_actor_is_person() OR NEW.created_by IS DISTINCT FROM app_actor_id() THEN
    RAISE EXCEPTION 'a case''s activity is a person''s, in their own name' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT coalesce(app_actor_permitted(NEW.practice_id, CASE WHEN NEW.kind = 'approval_requested' THEN 'packet.draft' ELSE 'case.work' END), false) THEN
    RAISE EXCEPTION 'notes and assignments are a case worker''s; an approval request a packet drafter''s' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "case" c WHERE c.id = NEW.case_id AND c.practice_id = NEW.practice_id) THEN
    RAISE EXCEPTION 'a case''s activity is of a case of its practice' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.kind = 'assigned' AND NEW.owner_user_id IS NOT NULL AND NOT case_owner_eligible(NEW.owner_user_id, NEW.practice_id) THEN
    RAISE EXCEPTION 'a case is assigned to a person who works the practice''s cases now' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.kind = 'approval_requested' THEN
    SELECT v.verifier_passed, v.approved_by, p.current_version_id = v.id AS current INTO version
      FROM packet_version v JOIN packet p ON p.id = v.packet_id
     WHERE v.id = NEW.packet_version_id AND p.case_id = NEW.case_id AND v.practice_id = NEW.practice_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'approval is requested of a version of the case''s packet' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT version.current OR NOT version.verifier_passed OR version.approved_by IS NOT NULL THEN
      RAISE EXCEPTION 'approval is requested of the packet''s current version, unapproved, once the verifier passes it' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER case_activity_belongs AFTER INSERT ON case_activity FOR EACH ROW EXECUTE FUNCTION case_activity_belongs();

-- An assignment makes its owner the case's (as the owner role, which the application role cannot
-- update a case as), in the caller's practice scope; it runs after case_activity_belongs.
CREATE FUNCTION case_activity_sets_owner() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  UPDATE "case" c SET owner_user_id = NEW.owner_user_id WHERE c.id = NEW.case_id AND c.practice_id = NEW.practice_id;
  RETURN NULL;
END;
$$;
CREATE TRIGGER case_activity_sets_owner AFTER INSERT ON case_activity FOR EACH ROW WHEN (NEW.kind = 'assigned') EXECUTE FUNCTION case_activity_sets_owner();

CREATE TRIGGER case_activity_no_truncate BEFORE TRUNCATE ON case_activity FOR EACH STATEMENT EXECUTE FUNCTION triage_no_truncate();

ALTER TABLE case_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_activity FORCE ROW LEVEL SECURITY;
CREATE POLICY case_activity_tenant ON case_activity
  USING (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]))
  WITH CHECK (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]));
-- Nobody writes activity in another person's name.
CREATE POLICY case_activity_written_by_actor ON case_activity AS RESTRICTIVE FOR INSERT TO tp_app
  WITH CHECK (created_by = app_actor_id());

-- ---------------------------------------------------------------------------------------------------
-- Opening a case by hand (PRD 5, J8: "the manager opens a case on a pattern")
-- ---------------------------------------------------------------------------------------------------

-- A person opens a case, and adds its lines, only with case.work; triage (a job) as before.
CREATE POLICY case_opened_by_case_workers ON "case" AS RESTRICTIVE FOR INSERT TO tp_app
  WITH CHECK (NOT (SELECT app_actor_is_person()) OR coalesce(app_actor_permitted(practice_id, 'case.work'), false));
CREATE POLICY case_line_added_by_case_workers ON case_line AS RESTRICTIVE FOR INSERT TO tp_app
  WITH CHECK (NOT (SELECT app_actor_is_person()) OR coalesce(app_actor_permitted(practice_id, 'case.work'), false));

-- ---------------------------------------------------------------------------------------------------
-- The practice's materiality thresholds, from the Cases screen
-- ---------------------------------------------------------------------------------------------------

-- Sets the practice's per-line and per-case materiality (practice.settings line_materiality_cents and
-- case_materiality_cents, integer cents as text, the keys @tp/triage reads and the console sets) for a
-- practice in the caller's scope, by a person who works its cases. Triage reads them from its next
-- run; a case keeps the materiality in force when it opened. The route records the audit event.
CREATE FUNCTION practice_set_materiality(target uuid, line_cents text, case_cents text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF app_actor_id() IS NULL OR NOT app_actor_is_person()
     OR NOT coalesce(target = ANY (nullif(current_setting('app.practice_ids', true), '')::uuid[]), false)
     OR NOT coalesce(app_actor_permitted(target, 'case.work'), false) THEN
    RAISE EXCEPTION 'a practice''s materiality is set by a person who works its cases' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF line_cents IS NULL OR case_cents IS NULL OR line_cents !~ '^(0|[1-9][0-9]{0,11})$' OR case_cents !~ '^(0|[1-9][0-9]{0,11})$' THEN
    RAISE EXCEPTION 'materiality is integer cents' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE practice p SET settings = p.settings || jsonb_build_object('line_materiality_cents', line_cents, 'case_materiality_cents', case_cents) WHERE p.id = target;
  RETURN FOUND;
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- The practice's people, as the workbench names them
-- ---------------------------------------------------------------------------------------------------

-- The people who may own the practice's cases now (case.work through its group or a grant in force),
-- for a practice the caller reaches.
CREATE FUNCTION practice_case_workers(target_practice uuid) RETURNS TABLE (user_id uuid, email text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT u.id, u.email
    FROM "user" u
   WHERE coalesce(app_actor_permitted(target_practice, 'practice.open'), false)
     AND u.id IN (SELECT m.user_id FROM membership m
                   WHERE m.organization_id = (SELECT p.organization_id FROM practice p WHERE p.id = target_practice)
                      OR m.organization_id IN (SELECT g.organization_id FROM "grant" g WHERE g.practice_id = target_practice))
     AND roles_permit(person_practice_roles(u.id, target_practice), 'case.work')
   ORDER BY lower(u.email), u.id
$$;

-- The email addresses of the named people who are or were members of the practice's group or of an
-- organization granted the practice (who own, wrote or answered its case records), for a practice the
-- caller reaches; anyone else named is left out.
CREATE FUNCTION practice_people_emails(target_practice uuid, people uuid[]) RETURNS TABLE (user_id uuid, email text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT u.id, u.email
    FROM "user" u
   WHERE coalesce(app_actor_permitted(target_practice, 'practice.open'), false)
     AND u.id = ANY (people)
     AND u.id IN (SELECT m.user_id FROM membership m
                   WHERE m.organization_id = (SELECT p.organization_id FROM practice p WHERE p.id = target_practice)
                      OR m.organization_id IN (SELECT g.organization_id FROM "grant" g WHERE g.practice_id = target_practice))
   ORDER BY u.id
$$;

-- ---------------------------------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------------------------------

REVOKE ALL ON case_activity FROM PUBLIC;
GRANT SELECT ON case_activity TO tp_app;
GRANT INSERT (id, practice_id, case_id, kind, body, owner_user_id, packet_version_id, created_by) ON case_activity TO tp_app;

REVOKE ALL ON FUNCTION case_owner_eligible(uuid, uuid), case_activity_rules(), case_activity_belongs(), case_activity_sets_owner(), practice_set_materiality(uuid, text, text),
  practice_case_workers(uuid), practice_people_emails(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION case_owner_eligible(uuid, uuid), practice_set_materiality(uuid, text, text), practice_case_workers(uuid), practice_people_emails(uuid, uuid[]) TO tp_app;

-- A suspended organization's people start no new work wherever they reach, and PaidWhole's suspension keeps its reason
-- (SS-01; docs/adr/0080, with dated amendments to docs/adr/0050 and 0055). After migration 20261107090000.
--
-- - The hold, decided once (practice_work_hold): the owner's hold (the practice's owning group suspended by PaidWhole,
--   closed, or held by billing for an invoice unpaid 30 days since its payment failed) stops everyone, jobs included. A
--   grantee's hold (an organization holding a grant in force, suspended or closed) stops only that organization's
--   people, and only the run-starting work their unheld roles (ownership, a support grant, a grant of an active grantee)
--   do not allow: a person's roles at a practice are the union of every path's, so the hold is per permission (D1). A
--   job's actor is never a person, so only the owner's hold applies to it. A grantee's billing standing holds nothing
--   (a firm's nonpayment rules are milestone 12's, docs/adr/0050).
-- - Who learns why (D6, decided here): a member of the owning organization reads the cause (suspended, with its reason,
--   or nonpayment); anyone else reads on_hold, with no reason; closed is closed for everyone. No sentence the database
--   writes names an organization or carries a reason code.
-- - The route asks practice_run_refusal_for(practice, the route's permission); the page reads practice_run_hold; the
--   trigger (refuse_new_work_while_suspended) asks with the permission of the table it guards (D17).
--   practice_run_refusal keeps its signature and grant and answers for any run-starting work (D3).
-- - PaidWhole's suspension stores its reason (customer_request, security_hold or agreement_ended; never nonpayment,
--   which stays billing's computed hold: PRD:223, docs/adr/0050, Q13) and its time on organization, and an append-only
--   history with PaidWhole's internal note in organization_status_change, readable only by holders of
--   organization.manage. One definer setter, console_set_organization_status, writes them with a person check, a
--   platform-permission check, the status the person saw, and an audit action the application role may not write.
-- - organization_status_rules: outside the owner, a status moves only between active and suspended, never into or out
--   of closed, an organization is created active, and the internal organization is never suspended (a CHECK, for every
--   role). The application role keeps UPDATE (status) and INSERT (status) on organization for one release (D11); the
--   next schema PR after this one is deployed revokes them.
--
-- Safe with the previous image running, and on rollback (ADR 0009:42-43; every column is added nullable with no
-- default and nothing is backfilled):
-- - practice_run_refusal(uuid) keeps its signature and grant. It answers for any run-starting work, so a person whose
--   held grant stops only part of their work is refused all nine run-starting routes by the previous image while the
--   grantee is held: it fails closed. Everyone else gets exactly the new image's answers.
-- - The previous image's practice home prints its fixed suffix after the database's sentence. After R1, R2, R3 and R6
--   it repeats a clause; after R4 and R5 it is wrong in one point (monitoring never stopped). Accepted (docs/adr/0080).
-- - It maps 55000 to suspended with the message, as before; the message has the new words.
-- - Its console suspends and reinstates with a direct UPDATE organization SET status as tp_app: allowed between active
--   and suspended, the time stamped by the trigger, no reason, no history row and no reserved action (its wrapper's
--   organization_status_set audits it). Closed and the internal organization are refused, as its handler refuses them.
-- - It reads practice_grants with SELECT * and maps named fields: the new last column is ignored.
-- - It inserts organizations as (id, kind, name): active, which the trigger leaves alone.
-- - Its dunning and its worker are unchanged: its worker writes no packet_export_refused for a refused export, so the
--   page reads as today; only the new worker writes organization_suspended.
-- - The migration takes a short lock on organization (two nullable columns, two CHECKs, a trigger) and on audit_event
--   (its policy recreated, as migration 20261107090000 did).

-- ---------------------------------------------------------------------------------------------------
-- 1. Preflight: the internal organization is active
-- ---------------------------------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM organization WHERE kind = 'internal' AND status <> 'active') THEN
    RAISE EXCEPTION 'the internal organization must be active before migration 20261108090000; set it active as the owner, then migrate again'
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- 2. organization: the stored reason and time, and the status rules
-- ---------------------------------------------------------------------------------------------------

-- status_reason: the reason of PaidWhole's suspension in force; null while active or closed, and for a suspension
-- recorded without one (before this migration, or by the previous image). status_since: when the current status began;
-- null for a row whose status has not changed since this migration.
ALTER TABLE organization
  ADD COLUMN status_reason text CONSTRAINT organization_status_reason
    CHECK (status_reason IN ('customer_request', 'security_hold', 'agreement_ended')),
  ADD COLUMN status_since timestamptz,
  ADD CONSTRAINT organization_status_reason_suspended CHECK (status_reason IS NULL OR status = 'suspended'),
  ADD CONSTRAINT organization_internal_active CHECK (kind <> 'internal' OR status = 'active');

-- Runs as the caller, so it can tell the owner path (migrations, the seed, the setter) from the application. Outside
-- the owner, an organization is created active and its status never moves into or out of closed (only its closure, at
-- milestone 12, closes one; nothing reopens one). A changed status stamps its time; a reason belongs to a suspension.
CREATE FUNCTION organization_status_rules() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  owner_path boolean := pg_has_role(current_user, 'tp_owner', 'USAGE');
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS DISTINCT FROM 'active' THEN
      IF NOT owner_path THEN
        RAISE EXCEPTION 'an organization is created active' USING ERRCODE = 'check_violation', CONSTRAINT = 'organization_created_active';
      END IF;
      NEW.status_since := coalesce(NEW.status_since, now());
    ELSE
      NEW.status_since := NULL;
    END IF;
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT owner_path AND 'closed' IN (OLD.status, NEW.status) THEN
      RAISE EXCEPTION 'a closed organization stays closed, and only its closure closes one' USING ERRCODE = 'check_violation', CONSTRAINT = 'organization_closed_by_closure_only';
    END IF;
    NEW.status_since := now();
  END IF;
  IF NEW.status IS DISTINCT FROM 'suspended' THEN
    NEW.status_reason := NULL;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER organization_status_rules BEFORE INSERT OR UPDATE OF status, status_reason ON organization
  FOR EACH ROW EXECUTE FUNCTION organization_status_rules();

-- ---------------------------------------------------------------------------------------------------
-- 3. organization_status_change: the history, with PaidWhole's internal note
-- ---------------------------------------------------------------------------------------------------

-- One row per suspension, change of reason (or note added) and reinstatement through the setter. Not a PHI table: it
-- records what PaidWhole did to a customer account, has no practice_id, and is global; the application role only
-- reads it, and only for holders of organization.manage. The note is never logged, exported, mailed or shown to a
-- customer. A suspension's own row (from_status active) has at equal to the organization's status_since.
CREATE TABLE organization_status_change (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization (id),
  from_status text NOT NULL CONSTRAINT organization_status_change_from CHECK (from_status IN ('active', 'suspended')),
  to_status text NOT NULL CONSTRAINT organization_status_change_to CHECK (to_status IN ('active', 'suspended')),
  reason text NOT NULL CONSTRAINT organization_status_change_reason CHECK (
       (to_status = 'suspended' AND reason IN ('customer_request', 'security_hold', 'agreement_ended'))
    OR (to_status = 'active' AND reason IN ('resolved', 'in_error'))),
  note text CONSTRAINT organization_status_change_note
    CHECK (note IS NULL OR (char_length(note) BETWEEN 1 AND 500 AND note !~ '[[:cntrl:]]')),
  changed_by uuid NOT NULL REFERENCES "user" (id),
  at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_status_change_moves CHECK (from_status <> to_status OR to_status = 'suspended')
);
CREATE INDEX organization_status_change_by_organization ON organization_status_change (organization_id, at DESC);
CREATE TRIGGER organization_status_change_append_only BEFORE UPDATE OR DELETE ON organization_status_change
  FOR EACH ROW EXECUTE FUNCTION reject_change();
CREATE TRIGGER organization_status_change_no_truncate BEFORE TRUNCATE ON organization_status_change
  FOR EACH STATEMENT EXECUTE FUNCTION reject_change();
ALTER TABLE organization_status_change ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_status_change FORCE ROW LEVEL SECURITY;
CREATE POLICY organization_status_change_owner ON organization_status_change FOR ALL TO tp_owner USING (true) WITH CHECK (true);
CREATE POLICY organization_status_change_platform_read ON organization_status_change FOR SELECT TO tp_app
  USING ((SELECT app_actor_platform_permitted('organization.manage')));
REVOKE ALL ON organization_status_change FROM PUBLIC;
GRANT SELECT ON organization_status_change TO tp_app;

-- ---------------------------------------------------------------------------------------------------
-- 4. The hold, decided once
-- ---------------------------------------------------------------------------------------------------

-- The run-starting permissions (D16): those of the nine run-starting routes (@tp/web lib/billing/runs.ts
-- RUN_STARTING_ROUTES; a test compares them), in the order the words list them.
CREATE FUNCTION run_starting_permissions() RETURNS text[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT ARRAY['mapping.edit', 'case.work', 'posting.reconcile', 'phi.export', 'file.upload']
$$;

-- The hold on new work at a practice, for the caller (D2, D6): the owner's hold, whoever asks, or else the grantee's hold
-- of the organization whose grant the person reaches the practice through, with the run-starting permissions it stops
-- for them (stopped: allowed by the union of their roles here, not by their unheld roles). No row: nothing is held. A
-- non-member of the owning organization reads on_hold for PaidWhole's suspension and nonpayment alike, with no
-- reason. Never an organization's name. Called by practice_work_refusal and practice_run_hold, never by an application
-- role directly.
CREATE FUNCTION practice_work_hold(target_practice uuid)
  RETURNS TABLE (source text, organization_id uuid, organization_kind text, cause text, reason text, since timestamptz, stopped text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  WITH owner AS (
    SELECT o.id, o.kind, o.status, o.status_reason, o.status_since, s.standing, s.suspended_since,
           o.id = ANY ((SELECT app_actor_organization_ids())::uuid[]) AS member
      FROM practice p JOIN organization o ON o.id = p.organization_id JOIN billing_standing s ON s.organization_id = o.id
     WHERE p.id = target_practice
  ), owner_hold AS (
    -- D6: a non-member learns that work is on hold and whether it restarts, never why.
    SELECT 'owner'::text AS source, id, kind,
           CASE WHEN status = 'closed' THEN 'closed'
                WHEN NOT member AND (status = 'suspended' OR standing = 'suspended') THEN 'on_hold'
                WHEN status = 'suspended' THEN 'suspended'
                WHEN standing = 'suspended' THEN 'nonpayment' END AS cause,
           CASE WHEN member AND status = 'suspended' THEN status_reason END AS reason,
           CASE WHEN status IN ('suspended', 'closed') THEN status_since WHEN standing = 'suspended' THEN suspended_since END AS since,
           NULL::text[] AS stopped
      FROM owner
  ), paths AS (
    -- The person's own paths and roles here; none for a job, whose actor is never a person.
    SELECT a.role, g.organization_id AS grantee, coalesce(a.via = 'grant' AND o.status IN ('suspended', 'closed'), false) AS held
      FROM effective_practice_access() a
      LEFT JOIN "grant" g ON a.via = 'grant' AND g.id = a.grant_id
      LEFT JOIN organization o ON o.id = g.organization_id
     WHERE a.practice_id = target_practice AND app_actor_is_person()
  ), roles AS (
    SELECT coalesce(array_agg(DISTINCT role), '{}') AS every,
           coalesce(array_agg(DISTINCT role) FILTER (WHERE NOT held), '{}') AS unheld
      FROM paths
  ), stops AS (
    -- The run-starting work the person's roles allow, but not without the held grants (D1).
    SELECT coalesce(array_agg(u.wanted ORDER BY u.n), '{}') AS stopped
      FROM roles CROSS JOIN unnest(run_starting_permissions()) WITH ORDINALITY AS u(wanted, n)
     WHERE roles_permit(roles.every, u.wanted) AND NOT roles_permit(roles.unheld, u.wanted)
  ), grantee_hold AS (
    SELECT 'grantee'::text, o.id, o.kind, o.status, o.status_reason, o.status_since, stops.stopped
      FROM paths x JOIN organization o ON o.id = x.grantee CROSS JOIN stops
     WHERE x.held AND cardinality(stops.stopped) > 0
     ORDER BY o.status = 'suspended' DESC, o.id
     LIMIT 1
  )
  SELECT * FROM owner_hold WHERE cause IS NOT NULL
  UNION ALL
  SELECT * FROM grantee_hold WHERE NOT EXISTS (SELECT 1 FROM owner_hold WHERE cause IS NOT NULL)
$$;

-- The hold as one sentence for one piece of work (wanted, a run-starting permission; null: any), or null (section 6.1,
-- R1 to R6). No name and no reason code: the sentence reaches the server log and the job tables. The owner's hold
-- refuses whatever is wanted; a grantee's only the work it stops.
CREATE FUNCTION practice_work_refusal(target_practice uuid, wanted text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT CASE
    WHEN h.source = 'owner' AND h.cause = 'suspended' THEN 'PaidWhole has suspended your organization, so no new work starts at this practice until PaidWhole reinstates your organization; everything here stays readable'
    WHEN h.source = 'owner' AND h.cause = 'closed' THEN 'the practice''s organization is closed, so no new work starts here; everything here stays readable'
    WHEN h.source = 'owner' AND h.cause = 'nonpayment' THEN 'an invoice of your organization has been unpaid for 30 days since its payment failed, so no new work starts at this practice until it is paid; everything here stays readable'
    WHEN h.source = 'owner' AND h.cause = 'on_hold' THEN 'the PaidWhole account of the practice''s organization is on hold, so no new work starts here; everything here stays readable'
    WHEN h.source = 'grantee' AND (wanted IS NULL OR wanted = ANY (h.stopped)) AND h.cause = 'suspended' THEN 'PaidWhole has suspended your organization, so you start no new work here through its grant until PaidWhole reinstates your organization; you can still read this practice''s records'
    WHEN h.source = 'grantee' AND (wanted IS NULL OR wanted = ANY (h.stopped)) AND h.cause = 'closed' THEN 'your organization is closed, so you start no new work here through its grant'
  END
    FROM practice_work_hold(target_practice) h
$$;

-- Why new work may not start at a practice in the caller's scope, for any run-starting work, or null (D3: the previous
-- image's route gate, uploads gate and home, and the worker's gate, whose job scope sees only the owner's hold).
CREATE OR REPLACE FUNCTION practice_run_refusal(target_practice uuid) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NOT practice_in_scope(target_practice) THEN
    RAISE EXCEPTION 'the practice is not in this transaction''s scope' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN practice_work_refusal(target_practice, NULL);
END;
$$;

-- The same for one piece of run-starting work, by its permission (the route wrapper passes the route's; the uploads
-- gate file.upload). Any other permission is a parameter error, so a route added with a new permission fails its test
-- rather than passing a held grantee's people (D16).
CREATE FUNCTION practice_run_refusal_for(target_practice uuid, wanted text) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NOT practice_in_scope(target_practice) THEN
    RAISE EXCEPTION 'the practice is not in this transaction''s scope' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF wanted IS NULL OR NOT wanted = ANY (run_starting_permissions()) THEN
    RAISE EXCEPTION 'a run refusal is asked for a run-starting permission' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  RETURN practice_work_refusal(target_practice, wanted);
END;
$$;

-- The hold for pages (the practice home; D4): whose hold, kind, cause, reason (to the held organization's own members
-- only), since and what it stops for the caller. Never a name.
CREATE FUNCTION practice_run_hold(target_practice uuid)
  RETURNS TABLE (source text, organization_id uuid, organization_kind text, cause text, reason text, since timestamptz, stopped text[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NOT practice_in_scope(target_practice) THEN
    RAISE EXCEPTION 'the practice is not in this transaction''s scope' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY SELECT * FROM practice_work_hold(target_practice);
END;
$$;

-- The database refuses new work it records, with the permission of the work the guarded table records (D17): in a
-- person's transaction, a held grantee's person is refused when only held grants allow it; in a job's, only the owner's
-- hold applies. A digest names no permission (only a job writes one): any stopped work. A table the map does not name
-- fails closed on its first insert. A zip's entries (an upload already taken) and work started before the hold finish.
CREATE OR REPLACE FUNCTION refuse_new_work_while_suspended() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  wanted text;
  reason text;
BEGIN
  CASE TG_TABLE_NAME
    WHEN 'pricing_run' THEN wanted := 'mapping.edit';
    WHEN 'audit_report', 'report_document' THEN wanted := 'case.work';
    WHEN 'roi_statement' THEN wanted := 'posting.reconcile';
    WHEN 'source_document' THEN wanted := 'file.upload';
    WHEN 'packet_version' THEN wanted := 'phi.export';
    WHEN 'digest' THEN wanted := NULL;  -- only a job writes a digest
    ELSE RAISE EXCEPTION 'refuse_new_work_while_suspended names no permission for %', TG_TABLE_NAME USING ERRCODE = 'internal_error';
  END CASE;
  reason := practice_work_refusal(NEW.practice_id, wanted);
  IF reason IS NOT NULL THEN
    RAISE EXCEPTION '%', reason USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  RETURN NEW;
END;
$$;

-- Its only callers were practice_run_refusal and refuse_new_work_while_suspended, both now on practice_work_hold.
DROP FUNCTION organization_run_refusal(uuid);

-- ---------------------------------------------------------------------------------------------------
-- 5. PaidWhole's suspension and reinstatement: one setter
-- ---------------------------------------------------------------------------------------------------

-- A platform administrator in person (organization.manage) suspends a group or a firm with a suspension reason, changes
-- the reason or adds a note, or reinstates it with a reinstatement reason, from the status they saw (from_status): a
-- status changed since is refused, never silently replaced; reinstating an active organization, or the same reason
-- again with no note, changes nothing (false). Writes the status and reason (organization_status_rules stamps the
-- time), the history row with the trimmed note, and organization_suspended or organization_reinstated with the reason
-- as purpose, which the application role may not write itself.
CREATE FUNCTION console_set_organization_status(target_organization uuid, from_status text, to_status text, status_reason text, note text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
#variable_conflict use_variable
DECLARE
  current_status text;
  current_reason text;
  kept_note text := nullif(btrim(note), '');
BEGIN
  IF app_actor_id() IS NULL OR NOT app_actor_is_person() OR NOT coalesce(app_actor_platform_permitted('organization.manage'), false) THEN
    RAISE EXCEPTION 'only a platform administrator suspends or reinstates an organization' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT o.status, o.status_reason INTO current_status, current_reason
    FROM organization o WHERE o.id = target_organization AND o.kind IN ('group', 'firm') FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no such organization' USING ERRCODE = 'no_data_found';
  END IF;
  IF 'closed' IN (current_status, from_status, to_status) THEN
    RAISE EXCEPTION 'a closed organization stays closed, and only its closure closes one' USING ERRCODE = 'check_violation', CONSTRAINT = 'organization_closed_by_closure_only';
  END IF;
  IF from_status = 'suspended' AND to_status = 'active' AND current_status = 'active' THEN
    RETURN false;
  END IF;
  IF current_status IS DISTINCT FROM from_status THEN
    RAISE EXCEPTION 'the organization''s status changed since it was read' USING ERRCODE = 'check_violation', CONSTRAINT = 'organization_status_changed_meanwhile';
  END IF;
  IF NOT coalesce((from_status = 'active' AND to_status = 'suspended' AND status_reason IN ('customer_request', 'security_hold', 'agreement_ended'))
       OR (from_status = 'suspended' AND to_status = 'suspended' AND status_reason IN ('customer_request', 'security_hold', 'agreement_ended'))
       OR (from_status = 'suspended' AND to_status = 'active' AND status_reason IN ('resolved', 'in_error')), false) THEN
    RAISE EXCEPTION 'a suspension takes a suspension reason, and a reinstatement a reinstatement reason' USING ERRCODE = 'check_violation', CONSTRAINT = 'organization_status_change_reason';
  END IF;
  IF from_status = 'suspended' AND to_status = 'suspended' AND current_reason IS NOT DISTINCT FROM status_reason AND kept_note IS NULL THEN
    RETURN false;
  END IF;
  UPDATE organization o
     SET status = to_status, status_reason = CASE WHEN to_status = 'suspended' THEN status_reason END
   WHERE o.id = target_organization;
  INSERT INTO organization_status_change (organization_id, from_status, to_status, reason, note, changed_by)
  VALUES (target_organization, from_status, to_status, status_reason, kept_note, app_actor_id());
  INSERT INTO audit_event (actor_id, actor_kind, action, object_type, object_id, purpose)
  VALUES (app_actor_id(), 'user', CASE WHEN to_status = 'suspended' THEN 'organization_suspended' ELSE 'organization_reinstated' END, 'organization', target_organization, status_reason);
  RETURN true;
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- 6. The practice's grants, with the grantee's status
-- ---------------------------------------------------------------------------------------------------

-- As before, with the grantee's status last (never its reason): G1 and G2 say why a grantee's people start no work
-- here through its grant. The previous image reads SELECT * by named fields, so the new column is ignored.
DROP FUNCTION practice_grants(uuid);
CREATE FUNCTION practice_grants(target_practice uuid)
  RETURNS TABLE (grant_id uuid, grantee_name text, grantee_kind text, roles jsonb, starts_at timestamptz, ends_at timestamptz, revoked_at timestamptz, agreement_id uuid, grantee_status text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NOT (practice_in_scope(target_practice) AND coalesce(app_actor_permitted(target_practice, 'grant.revoke'), false)) THEN
    RAISE EXCEPTION 'the practice''s grants are its administrators''' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY SELECT g.id, o.name, o.kind, coalesce(g.scope -> 'roles', '[]'::jsonb), g.starts_at, g.ends_at, g.revoked_at, g.agreement_id, o.status
    FROM "grant" g JOIN organization o ON o.id = g.organization_id
   WHERE g.practice_id = target_practice
   ORDER BY g.revoked_at IS NOT NULL, g.ends_at DESC, g.id;
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- 7. The packet export's refusal codes: the worker gate's
-- ---------------------------------------------------------------------------------------------------

-- As migration 20261103090000 left it, with organization_suspended last: the codes an export job's refusal names (the
-- readiness reasons in their order, then the verifier's, then the worker gate's: the practice's owning organization is
-- held when the job runs). audit_event_packet_export_attempt refuses any other purpose for packet_export_refused.
CREATE OR REPLACE FUNCTION packet_export_refusal_codes() RETURNS text[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT ARRAY['not_approved', 'not_current', 'outdated', 'case_changed', 'not_case_level', 'window_passed', 'next_window_passed', 'pricing_not_current', 'deadline_unverified', 'inputs_differ',
               'contact_missing', 'verifier_failed', 'organization_suspended']
$$;

-- ---------------------------------------------------------------------------------------------------
-- 8. The reserved audit actions
-- ---------------------------------------------------------------------------------------------------

-- As migration 20261107090000 left it, with the two actions console_set_organization_status writes reserved too.
DROP POLICY audit_event_record ON audit_event;
CREATE POLICY audit_event_record ON audit_event FOR INSERT TO tp_app
  WITH CHECK (
    actor_id = app_actor_id()
    AND actor_kind IN ('user', 'service')
    AND action NOT IN ('notice_sent', 'security_event', 'sign_in_failed', 'data_key_destroyed', 'notice_undelivered', 'mail_stream_paused', 'mail_stream_resumed',
                       'organization_suspended', 'organization_reinstated')
    AND (practice_id IS NULL OR practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]))
  );

-- ---------------------------------------------------------------------------------------------------
-- 9. Privileges
-- ---------------------------------------------------------------------------------------------------

REVOKE ALL ON FUNCTION organization_status_rules(), run_starting_permissions(), practice_work_hold(uuid), practice_work_refusal(uuid, text),
  practice_run_refusal_for(uuid, text), practice_run_hold(uuid), console_set_organization_status(uuid, text, text, text, text), practice_grants(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION practice_run_refusal_for(uuid, text), practice_run_hold(uuid), console_set_organization_status(uuid, text, text, text, text),
  practice_grants(uuid) TO tp_app;
-- The customer's billing page reads the stored reason and time (tp_app's table-level SELECT already covers them).
GRANT SELECT (status_reason, status_since) ON organization TO tp_billing;

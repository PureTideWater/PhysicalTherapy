-- Tenancy hardening after the milestone 1 review (PRD 3 Personas and Authorization in code; PRD 5 J1,
-- J15 and J16; PRD 16 Tenant isolation, Grants and Threats; docs/product/sessions.md; Data dictionary,
-- Tenancy and access; docs/adr/0013, 0014, 0016 and 0018).
--
-- - Internal users have no standing access to PHI, structurally: no user holds an internal membership
--   and a group or firm membership at once, nobody grants themselves a membership or changes their own
--   role, an organization administrator adds only users no other organization knows (the platform path
--   adds the others), and the effective-permission function ignores customer routes of internal users.
-- - Break-glass notices cannot be suppressed by the application role: it can no longer update a
--   support grant or write system, notice or security events; only the operator path records notices.
-- - Grant changes and role escalations raise security events, written by the database itself.
-- - A grant rests on an agreement of its own chain; agreements and support grants are read by their
--   parties only; a support grant can be ended early; a practice always has an administrator, from its
--   creation; sessions and devices, once ended or revoked, stay so; MFA enrollment is recorded only by
--   a sign-in that opened a session; sessions are revoked only by an identified actor.
-- - tp_operator: the platform jobs' role. It owns nothing, cannot bypass row-level security, reads the
--   audit log and calls three narrow functions for the support notices; the owner login is left to
--   migrations (and to the restore drill's scratch copy).
-- - Every SECURITY DEFINER function searches pg_temp last.
--
-- Runs as tp_owner. The roles exist already (packages/db/src/roles.ts creates tp_operator with the
-- others before any migration runs).

-- ---------------------------------------------------------------------------------------------------
-- Preconditions: the data this migration's rules forbid does not exist yet.
-- ---------------------------------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM membership a JOIN organization oa ON oa.id = a.organization_id
      JOIN membership b ON b.user_id = a.user_id JOIN organization ob ON ob.id = b.organization_id
     WHERE oa.kind = 'internal' AND ob.kind IN ('group', 'firm')
       AND (a.ends_at IS NULL OR a.ends_at > now()) AND (b.ends_at IS NULL OR b.ends_at > now())
  ) THEN
    RAISE EXCEPTION 'a user holds an internal and a customer membership at once; end one before migrating' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM practice WHERE organization_id IS NULL AND status <> 'deleted') THEN
    RAISE EXCEPTION 'a practice that is not deleted has no owning group; assign one before migrating' USING ERRCODE = 'check_violation';
  END IF;
END $$;

-- ---------------------------------------------------------------------------------------------------
-- Helpers. Like the others, they run as tp_owner; those the application role may call answer only a
-- yes or no about IDs the caller already holds, or about the current actor.
-- ---------------------------------------------------------------------------------------------------

-- Whether the user holds a current membership of a practice group or a firm.
CREATE FUNCTION user_is_customer(target_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM membership m JOIN organization o ON o.id = m.organization_id
     WHERE m.user_id = target_user AND o.kind IN ('group', 'firm') AND (m.ends_at IS NULL OR m.ends_at > now())
  )
$$;

-- Whether another organization knows the user: a membership of it, current or ended.
CREATE FUNCTION user_known_elsewhere(target_user uuid, target_organization uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM membership m WHERE m.user_id = target_user AND m.organization_id <> target_organization)
$$;

-- The practices whose owning group the actor is a current member of (any customer role).
CREATE FUNCTION app_actor_group_practice_ids() RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT coalesce(array_agg(DISTINCT p.id), '{}')
    FROM practice p
    JOIN app_actor_memberships() m ON m.organization_id = p.organization_id
   WHERE m.organization_kind = 'group'
$$;

-- Whether the user is a support engineer now: a current support membership of the internal
-- organization, active, with MFA enrolled.
CREATE FUNCTION user_is_support_engineer(target_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM membership m JOIN organization o ON o.id = m.organization_id JOIN "user" u ON u.id = m.user_id
     WHERE m.user_id = target_user AND o.kind = 'internal' AND m.role = 'support'
       AND (m.ends_at IS NULL OR m.ends_at > now()) AND u.status = 'active' AND u.mfa_enrolled
  )
$$;

-- A security event for the weekly review (PRD 5, J16; sessions.md: "grant changes and role escalations
-- raise security events"). Written by the database, so the application role cannot forge or omit
-- one; the actor is the transaction's, when there is one.
CREATE FUNCTION record_security_event(target_type text, target uuid, target_practice uuid, what text) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  INSERT INTO audit_event (actor_id, actor_kind, action, object_type, object_id, practice_id, purpose)
  VALUES (app_actor_id(), 'system', 'security_event', target_type, target, target_practice, what)
$$;

-- ---------------------------------------------------------------------------------------------------
-- Memberships: internal users stay internal; nobody grants themselves anything.
-- ---------------------------------------------------------------------------------------------------

-- Run as the owner: the two kinds of membership exclude each other for one user, checked under a lock
-- on the user so two transactions cannot each add one half.
CREATE FUNCTION assert_membership_fits_user(target_organization uuid, target_user uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  kind text := organization_kind_of(target_organization);
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('membership:' || target_user::text));
  IF kind IN ('group', 'firm') AND user_is_internal(target_user) THEN
    RAISE EXCEPTION 'an internal user cannot also belong to a practice group or a firm (internal roles have no standing access to PHI)' USING ERRCODE = 'check_violation';
  END IF;
  IF kind = 'internal' AND user_is_customer(target_user) THEN
    RAISE EXCEPTION 'a member of a practice group or a firm cannot also hold an internal role' USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

-- Runs as the caller, so it can tell the owner path (migrations, the seed) from the application.
CREATE FUNCTION membership_rules() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  owner_path boolean := pg_has_role(current_user, 'tp_owner', 'USAGE');
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.ends_at IS NOT NULL AND OLD.ends_at <= now()
     AND (NEW.organization_id, NEW.user_id, NEW.role, NEW.ends_at) IS DISTINCT FROM (OLD.organization_id, OLD.user_id, OLD.role, OLD.ends_at) THEN
    RAISE EXCEPTION 'an ended membership never changes; invite the user again' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT owner_path AND NEW.user_id = app_actor_id() AND (TG_OP = 'INSERT' OR NEW.role IS DISTINCT FROM OLD.role) THEN
    RAISE EXCEPTION 'nobody grants themselves a membership or changes their own role' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.ends_at IS NULL OR NEW.ends_at > now() THEN
    PERFORM assert_membership_fits_user(NEW.organization_id, NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER membership_rules BEFORE INSERT OR UPDATE ON membership FOR EACH ROW EXECUTE FUNCTION membership_rules();

-- An organization administrator adds users no other organization knows; a user another organization
-- knows joins through the platform path (a platform administrator, in the console) until invitations
-- the user accepts arrive (milestone 12). The platform path adds customers only to customer
-- organizations; the internal organization's members come through its own administrators.
DROP POLICY membership_administrators_insert ON membership;
CREATE POLICY membership_administrators_insert ON membership FOR INSERT TO tp_app
  WITH CHECK (
    (organization_id = ANY ((SELECT app_actor_administered_organization_ids())::uuid[]) AND NOT user_known_elsewhere(user_id, organization_id))
    OR ((SELECT app_actor_platform_permitted('organization.manage'))
        AND EXISTS (SELECT 1 FROM organization o WHERE o.id = membership.organization_id AND o.kind IN ('group', 'firm')))
  );

-- Role escalations: a current membership created in, or moved into, an administrator role or the
-- internal organization.
CREATE FUNCTION membership_security_events() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF (NEW.ends_at IS NULL OR NEW.ends_at > now())
     AND (TG_OP = 'INSERT' OR NEW.role IS DISTINCT FROM OLD.role)
     AND (NEW.role IN ('practice_admin', 'firm_principal', 'platform_admin') OR organization_kind_of(NEW.organization_id) = 'internal') THEN
    PERFORM record_security_event('membership', NEW.id, NULL, 'role_escalation');
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER membership_security_events AFTER INSERT OR UPDATE OF role ON membership
  FOR EACH ROW EXECUTE FUNCTION membership_security_events();

-- The platform administrator creates customer organizations; the internal organization is created
-- once, at setup, by the owner.
DROP POLICY organization_platform_admin_insert ON organization;
CREATE POLICY organization_platform_admin_insert ON organization FOR INSERT TO tp_app
  WITH CHECK ((SELECT app_actor_is_platform_admin()) AND kind IN ('group', 'firm'));

-- Defence in depth: a user with a current internal membership reaches no practice by ownership or by
-- a grant, whatever memberships exist; only their own support grant reaches one.
CREATE OR REPLACE FUNCTION effective_practice_access() RETURNS TABLE (practice_id uuid, via text, grant_id uuid, role text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT p.id, 'ownership', NULL::uuid, m.role
    FROM app_actor_memberships() m
    JOIN practice p ON p.organization_id = m.organization_id
   WHERE m.organization_kind = 'group' AND m.role IN ('practice_admin', 'billing_manager', 'analyst', 'viewer')
     AND NOT user_is_internal(app_actor_id())
  UNION ALL
  SELECT g.practice_id, 'grant', g.id, m.role
    FROM app_actor_memberships() m
    JOIN "grant" g ON g.organization_id = m.organization_id
   WHERE m.organization_kind IN ('group', 'firm')
     AND g.revoked_at IS NULL AND g.starts_at <= now() AND now() < g.ends_at
     AND g.scope -> 'roles' ? m.role
     AND NOT user_is_internal(app_actor_id())
  UNION ALL
  SELECT s.practice_id, 'support', s.id, 'support'
    FROM support_grant s
   WHERE s.user_id = app_actor_id()
     AND s.created_at <= now() AND now() < s.expires_at AND now() < s.created_at + interval '4 hours'
     AND EXISTS (SELECT 1 FROM app_actor_memberships() m WHERE m.organization_kind = 'internal' AND m.role = 'support')
$$;

-- Ending a user's sessions needs an identified actor: the user, a platform administrator, or an
-- administrator of an organization the user is a current member of. A membership ended by this very
-- transaction (ends_at = now(), the transaction's start) still counts: ending a membership revokes
-- the user's sessions in the same transaction (PRD 3, Lifecycle events).
CREATE OR REPLACE FUNCTION revoke_user_sessions(target_user uuid) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  ended integer;
BEGIN
  IF app_actor_id() IS NULL OR NOT coalesce(
    target_user = app_actor_id()
    OR app_actor_platform_permitted('organization.manage')
    OR EXISTS (
      SELECT 1 FROM membership m
       WHERE m.user_id = target_user AND (m.ends_at IS NULL OR m.ends_at >= now())
         AND m.organization_id = ANY (app_actor_administered_organization_ids())
    ),
    false
  ) THEN
    RAISE EXCEPTION 'only the user or an administrator of the user''s organization revokes the user''s sessions' USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE user_session SET ended_at = now(), end_reason = 'revoked' WHERE user_id = target_user AND ended_at IS NULL;
  GET DIAGNOSTICS ended = ROW_COUNT;
  RETURN ended;
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- Practices: an owning group with an administrator from the start (PRD 3: "at least one practice
-- administrator at all times"). The group's administrator is invited first (J1), or in the same
-- transaction; invited administrators count, since J1 creates the practice before anyone accepts.
-- ---------------------------------------------------------------------------------------------------

CREATE FUNCTION practice_has_owner() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NEW.organization_id IS NULL AND NEW.status <> 'deleted' THEN
    RAISE EXCEPTION 'a practice is owned by a practice group until it is deleted' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER practice_has_owner BEFORE INSERT OR UPDATE OF organization_id, status ON practice
  FOR EACH ROW EXECUTE FUNCTION practice_has_owner();

CREATE FUNCTION practice_has_administrator() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NEW.status <> 'deleted' AND NEW.organization_id IS NOT NULL AND organization_administrator_count(NEW.organization_id) = 0 THEN
    RAISE EXCEPTION 'invite the practice group''s administrator before creating or moving its practice: a practice always has an administrator' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER practice_has_administrator AFTER INSERT OR UPDATE OF organization_id, status ON practice
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION practice_has_administrator();

-- ---------------------------------------------------------------------------------------------------
-- Agreements: recorded by those who sign them, read by their parties (Data dictionary: "Parties to
-- it"): the organization it is with, the group that owns the practice it names, and the platform
-- administrators who record agreements.
-- ---------------------------------------------------------------------------------------------------

DROP POLICY agreement_recorded_by_administrators ON agreement;
CREATE POLICY agreement_recorded_by_signers ON agreement FOR INSERT TO tp_app
  WITH CHECK (
    (SELECT app_actor_platform_permitted('agreement.record'))
    OR (
      app_actor_organization_permitted(organization_id, 'agreement.sign')
      AND (practice_id IS NULL OR (
        practice_id = ANY (current_setting('app.practice_ids', true)::uuid[])
        AND EXISTS (SELECT 1 FROM practice p WHERE p.id = agreement.practice_id AND p.organization_id = agreement.organization_id)
      ))
    )
  );

CREATE POLICY agreement_read_by_parties ON agreement AS RESTRICTIVE FOR SELECT TO tp_app
  USING (
    organization_id = ANY ((SELECT app_actor_organization_ids())::uuid[])
    OR practice_id = ANY ((SELECT app_actor_group_practice_ids())::uuid[])
    OR (SELECT app_actor_is_platform_admin())
  );

-- ---------------------------------------------------------------------------------------------------
-- Grants rest on an agreement of their own chain (PRD 3: "the agreement ID it rests on"; PRD 6: no
-- grant without an agreement): a BAA or engagement letter of the grantee (naming the practice, or the
-- grantee's own), or one of the practice's owning group that names the practice.
-- ---------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION grant_rules() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF organization_kind_of(NEW.organization_id) IS DISTINCT FROM 'group' AND organization_kind_of(NEW.organization_id) IS DISTINCT FROM 'firm' THEN
      RAISE EXCEPTION 'a grant goes to a practice group or a firm; internal access is a support grant' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT user_is_practice_admin(NEW.practice_id, NEW.approved_by_user_id) THEN
      RAISE EXCEPTION 'a grant is approved by a current practice administrator of its practice' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM agreement a
       WHERE a.id = NEW.agreement_id AND a.kind IN ('baa', 'engagement')
         AND (
           (a.organization_id = NEW.organization_id AND (a.practice_id IS NULL OR a.practice_id = NEW.practice_id))
           OR (a.organization_id = (SELECT p.organization_id FROM practice p WHERE p.id = NEW.practice_id) AND a.practice_id = NEW.practice_id)
         )
    ) THEN
      RAISE EXCEPTION 'a grant rests on a BAA or engagement letter of the grantee, or of the practice''s group naming the practice' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.revoked_by IS NOT NULL AND NOT user_is_practice_admin(NEW.practice_id, NEW.revoked_by) THEN
      RAISE EXCEPTION 'a grant is revoked by a current practice administrator of its practice' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.organization_id, NEW.practice_id, NEW.scope, NEW.starts_at, NEW.ends_at, NEW.approved_by_user_id, NEW.agreement_id, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.organization_id, OLD.practice_id, OLD.scope, OLD.starts_at, OLD.ends_at, OLD.approved_by_user_id, OLD.agreement_id, OLD.created_at) THEN
    RAISE EXCEPTION 'a grant never changes after approval; revoke it and approve a new one' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.revoked_at IS NOT NULL AND (NEW.revoked_at, NEW.revoked_by) IS DISTINCT FROM (OLD.revoked_at, OLD.revoked_by) THEN
    RAISE EXCEPTION 'a grant is revoked once' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.revoked_by IS NOT NULL AND OLD.revoked_by IS NULL AND NOT user_is_practice_admin(NEW.practice_id, NEW.revoked_by) THEN
    RAISE EXCEPTION 'a grant is revoked by a current practice administrator of its practice' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- Every grant change is audited and visible to the practice (PRD 3) and is a security event (J16).
CREATE FUNCTION grant_security_events() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' OR (OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL) THEN
    PERFORM record_security_event('grant', NEW.id, NEW.practice_id, 'grant_change');
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER grant_security_events AFTER INSERT OR UPDATE OF revoked_at ON "grant"
  FOR EACH ROW EXECUTE FUNCTION grant_security_events();

-- ---------------------------------------------------------------------------------------------------
-- Support grants (PRD 3; PRD 5, J15).
-- ---------------------------------------------------------------------------------------------------

-- The application role never updates a support grant: its notices are the operator's to record, and
-- ending one early goes through end_support_grant().
REVOKE UPDATE ON support_grant FROM tp_app;
CREATE POLICY support_grant_not_updated_by_the_application ON support_grant AS RESTRICTIVE FOR UPDATE TO tp_app USING (false);

-- Platform administrators read and create them (the dictionary's "Platform administrators"); nothing
-- else of the old FOR ALL policy survives.
DROP POLICY support_grant_platform_administrators ON support_grant;
CREATE POLICY support_grant_platform_administrators_read ON support_grant FOR SELECT TO tp_app
  USING ((SELECT app_actor_is_platform_admin()));
CREATE POLICY support_grant_platform_administrators_insert ON support_grant FOR INSERT TO tp_app
  WITH CHECK ((SELECT app_actor_platform_permitted('support_grant.create')));

-- "Practice sees its own": its own group's members, not every organization with the practice in scope.
CREATE POLICY support_grant_read_by_practice_and_platform ON support_grant AS RESTRICTIVE FOR SELECT TO tp_app
  USING (practice_id = ANY ((SELECT app_actor_group_practice_ids())::uuid[]) OR (SELECT app_actor_is_platform_admin()));

-- A support grant goes to a support engineer, never to the person creating it.
CREATE FUNCTION support_grant_grantee() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NOT pg_has_role(current_user, 'tp_owner', 'USAGE') AND NEW.user_id = app_actor_id() THEN
    RAISE EXCEPTION 'nobody grants themselves support access' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT user_is_support_engineer(NEW.user_id) THEN
    RAISE EXCEPTION 'a support grant goes to a support engineer with a current support role' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER support_grant_grantee BEFORE INSERT ON support_grant FOR EACH ROW EXECUTE FUNCTION support_grant_grantee();

-- A support grant never changes except to record its closing notice (once) and to end it early
-- (once, to now, while it is open).
CREATE OR REPLACE FUNCTION support_grant_fixed() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  ended_early boolean := NEW.expires_at < OLD.expires_at AND NEW.expires_at = now() AND OLD.expires_at > now() AND OLD.created_at + interval '4 hours' > now();
BEGIN
  IF (NEW.id, NEW.practice_id, NEW.user_id, NEW.ticket, NEW.reason, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.practice_id, OLD.user_id, OLD.ticket, OLD.reason, OLD.created_at)
     OR (NEW.expires_at IS DISTINCT FROM OLD.expires_at AND NOT ended_early)
     OR (OLD.notified_at IS NOT NULL AND NEW.notified_at IS DISTINCT FROM OLD.notified_at) THEN
    RAISE EXCEPTION 'a support grant never changes; only its closing notice is recorded, once, and it can be ended early, once' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION support_grant_security_events() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM record_security_event('support_grant', NEW.id, NEW.practice_id, 'support_grant_opened');
  ELSIF NEW.expires_at < OLD.expires_at THEN
    PERFORM record_security_event('support_grant', NEW.id, NEW.practice_id, 'grant_change');
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER support_grant_security_events AFTER INSERT OR UPDATE OF expires_at ON support_grant
  FOR EACH ROW EXECUTE FUNCTION support_grant_security_events();

-- Ends an open support grant now (PRD 3: support must not "retain access after the ticket closes"):
-- a platform administrator or the engineer whose grant it is. The closing notice follows as usual.
-- True when it ended the grant; false when it was not open.
CREATE FUNCTION end_support_grant(target uuid) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  g support_grant%ROWTYPE;
  scope text := current_setting('app.practice_ids', true);
BEGIN
  SELECT * INTO g FROM support_grant s WHERE s.id = target;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  IF app_actor_id() IS NULL OR NOT (app_actor_platform_permitted('support_grant.create') OR g.user_id = app_actor_id()) THEN
    RAISE EXCEPTION 'only a platform administrator or its engineer ends a support grant' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT (now() < g.expires_at AND now() < g.created_at + interval '4 hours') THEN
    RETURN false;
  END IF;
  -- The owner writes a PHI table only inside the practice's scope; the caller's scope is restored.
  PERFORM set_config('app.practice_ids', ARRAY[g.practice_id]::text, true);
  UPDATE support_grant s SET expires_at = now() WHERE s.id = target;
  PERFORM set_config('app.practice_ids', coalesce(scope, '{}'), true);
  RETURN true;
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- The audit log: the application records user and service events only, and never the events the
-- database and the operator write (notices, security events, failed sign-ins, key destruction).
-- ---------------------------------------------------------------------------------------------------

DROP POLICY audit_event_record ON audit_event;
CREATE POLICY audit_event_record ON audit_event FOR INSERT TO tp_app
  WITH CHECK (
    actor_id = app_actor_id()
    AND actor_kind IN ('user', 'service')
    AND action NOT IN ('notice_sent', 'security_event', 'sign_in_failed', 'data_key_destroyed')
    AND (practice_id IS NULL OR practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]))
  );

-- ---------------------------------------------------------------------------------------------------
-- Sessions and devices (sessions.md): once ended or revoked, they stay so, for every role.
-- ---------------------------------------------------------------------------------------------------

CREATE FUNCTION user_session_end_is_final() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF OLD.ended_at IS NOT NULL AND (NEW.ended_at, NEW.end_reason) IS DISTINCT FROM (OLD.ended_at, OLD.end_reason) THEN
    RAISE EXCEPTION 'an ended session stays ended; sign in again' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER user_session_end_is_final BEFORE UPDATE OF ended_at, end_reason ON user_session
  FOR EACH ROW EXECUTE FUNCTION user_session_end_is_final();

CREATE FUNCTION user_device_revocation_is_final() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at THEN
    RAISE EXCEPTION 'a revoked device stays revoked; sign in again as a new device' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER user_device_revocation_is_final BEFORE UPDATE OF revoked_at ON user_device
  FOR EACH ROW EXECUTE FUNCTION user_device_revocation_is_final();

-- A sign-in from a new device, for a user who had devices before, is a security event (PRD 5, J16).
CREATE FUNCTION user_device_security_events() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM user_device d WHERE d.user_id = NEW.user_id AND d.id <> NEW.id) THEN
    PERFORM record_security_event('user_device', NEW.id, NULL, 'new_device_sign_in');
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER user_device_security_events AFTER INSERT ON user_device FOR EACH ROW EXECUTE FUNCTION user_device_security_events();

-- MFA enrollment (and the acceptance of an invitation) is recorded only by a sign-in that has just
-- opened a session for the actor in this transaction, which sign-in does only after the second factor.
REVOKE UPDATE (mfa_enrolled) ON "user" FROM tp_app;
CREATE FUNCTION record_sign_in_with_mfa() RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF app_actor_id() IS NULL OR NOT EXISTS (
    SELECT 1 FROM user_session s WHERE s.user_id = app_actor_id() AND s.started_at = now() AND s.ended_at IS NULL
  ) THEN
    RAISE EXCEPTION 'MFA enrollment is recorded by the sign-in that opened a session' USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE "user" u
     SET status = CASE WHEN u.status = 'invited' THEN 'active' ELSE u.status END, mfa_enrolled = true
   WHERE u.id = app_actor_id() AND u.status <> 'disabled' AND (u.status = 'invited' OR NOT u.mfa_enrolled);
  RETURN FOUND;
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- The operator role (tp_operator): the platform jobs. It owns nothing and cannot bypass row-level
-- security. The nightly copy reads the audit log (codes and opaque IDs only); the restore drill
-- writes its evidence row; the support notices go through the functions below, each notice inside a
-- transaction scoped to exactly its practice.
-- ---------------------------------------------------------------------------------------------------

CREATE POLICY audit_event_operator_copy ON audit_event FOR SELECT TO tp_operator USING (true);
GRANT SELECT ON audit_event TO tp_operator;
GRANT SELECT, INSERT ON restore_drill TO tp_operator;

-- The notices due: each support grant without its opening notice (a notice_sent event the system
-- wrote) and each ended grant without its closing one. IDs only.
CREATE FUNCTION operator_due_support_notices(at_most integer) RETURNS TABLE (support_grant_id uuid, practice_id uuid, notice text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  (SELECT s.id, s.practice_id, 'support_grant_opened'
     FROM support_grant s
    WHERE NOT EXISTS (
      SELECT 1 FROM audit_event e
       WHERE e.action = 'notice_sent' AND e.actor_kind = 'system' AND e.object_type = 'support_grant' AND e.object_id = s.id AND e.purpose = 'support_grant_opened'
    )
    ORDER BY s.created_at, s.id LIMIT at_most)
  UNION ALL
  (SELECT s.id, s.practice_id, 'support_grant_closed'
     FROM support_grant s
    WHERE s.notified_at IS NULL AND (now() >= s.expires_at OR now() >= s.created_at + interval '4 hours')
    ORDER BY s.expires_at, s.id LIMIT at_most)
$$;

-- Refuses unless the transaction's scope is exactly the practice: one practice per notice.
CREATE FUNCTION operator_assert_scope(target_practice uuid) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF current_setting('app.practice_ids', true) IS DISTINCT FROM ARRAY[target_practice]::text THEN
    RAISE EXCEPTION 'a notice is handled in a transaction scoped to exactly its practice' USING ERRCODE = 'insufficient_privilege';
  END IF;
END;
$$;

-- Records one notice, once: the system's notice_sent event and, for the closing notice, notified_at.
-- `recorded` is false when it was already recorded (or is not due); `reads` counts the records read
-- under the grant.
CREATE FUNCTION operator_record_support_notice(target uuid, notice text, request text) RETURNS TABLE (recorded boolean, reads bigint)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  g support_grant%ROWTYPE;
BEGIN
  IF notice NOT IN ('support_grant_opened', 'support_grant_closed') THEN
    RAISE EXCEPTION 'unknown notice' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO g FROM support_grant s WHERE s.id = target;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown support grant' USING ERRCODE = 'no_data_found';
  END IF;
  PERFORM operator_assert_scope(g.practice_id);
  PERFORM pg_advisory_xact_lock(hashtext(notice || ':' || target::text));
  recorded := false;
  reads := (SELECT count(*) FROM audit_event e WHERE e.grant_id = target AND e.action = 'read');
  IF notice = 'support_grant_closed' THEN
    IF NOT (now() >= g.expires_at OR now() >= g.created_at + interval '4 hours') THEN
      RETURN NEXT;
      RETURN;
    END IF;
    UPDATE support_grant s SET notified_at = now() WHERE s.id = target AND s.notified_at IS NULL;
    IF NOT FOUND THEN
      RETURN NEXT;
      RETURN;
    END IF;
  ELSIF EXISTS (
    SELECT 1 FROM audit_event e
     WHERE e.action = 'notice_sent' AND e.actor_kind = 'system' AND e.object_type = 'support_grant' AND e.object_id = target AND e.purpose = notice
  ) THEN
    RETURN NEXT;
    RETURN;
  END IF;
  INSERT INTO audit_event (actor_kind, action, object_type, object_id, practice_id, grant_id, purpose, request_id)
  VALUES ('system', 'notice_sent', 'support_grant', target, g.practice_id, target, notice, request);
  recorded := true;
  RETURN NEXT;
END;
$$;

-- Where a notice goes: the practice's administrators who are not disabled (invited ones included).
CREATE FUNCTION operator_practice_administrator_emails(target_practice uuid) RETURNS TABLE (email text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  PERFORM operator_assert_scope(target_practice);
  RETURN QUERY
  SELECT DISTINCT u.email FROM practice p
    JOIN membership m ON m.organization_id = p.organization_id
    JOIN "user" u ON u.id = m.user_id
   WHERE p.id = target_practice AND m.role = 'practice_admin' AND (m.ends_at IS NULL OR m.ends_at > now()) AND u.status <> 'disabled'
   ORDER BY u.email;
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- Privileges for the new functions.
-- ---------------------------------------------------------------------------------------------------

REVOKE ALL ON FUNCTION
  user_is_customer(uuid), user_known_elsewhere(uuid, uuid), app_actor_group_practice_ids(), user_is_support_engineer(uuid),
  record_security_event(text, uuid, uuid, text), assert_membership_fits_user(uuid, uuid), membership_rules(),
  membership_security_events(), practice_has_owner(), practice_has_administrator(), grant_security_events(),
  support_grant_grantee(), support_grant_security_events(), end_support_grant(uuid), user_session_end_is_final(),
  user_device_revocation_is_final(), user_device_security_events(), record_sign_in_with_mfa(),
  operator_due_support_notices(integer), operator_assert_scope(uuid), operator_record_support_notice(uuid, text, text),
  operator_practice_administrator_emails(uuid)
FROM PUBLIC;

-- Called by policies and by triggers that run as the application role, and the two actions it takes.
GRANT EXECUTE ON FUNCTION
  user_known_elsewhere(uuid, uuid), app_actor_group_practice_ids(), assert_membership_fits_user(uuid, uuid),
  user_is_support_engineer(uuid), end_support_grant(uuid), record_sign_in_with_mfa()
TO tp_app;

GRANT EXECUTE ON FUNCTION
  operator_due_support_notices(integer), operator_record_support_notice(uuid, text, text), operator_practice_administrator_emails(uuid)
TO tp_operator;

-- ---------------------------------------------------------------------------------------------------
-- Every function that sets a search path searches pg_temp last, so a temporary table can never stand
-- in for a real one inside a SECURITY DEFINER function (PostgreSQL searches pg_temp first otherwise).
-- ---------------------------------------------------------------------------------------------------

DO $$
DECLARE
  f regprocedure;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND (p.prosecdef OR EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'))
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = pg_catalog, public, pg_temp', f);
  END LOOP;
END $$;

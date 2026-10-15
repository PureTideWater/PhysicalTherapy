-- Identity, sessions and the permission matrix (PRD sections 3, 5 J15 and J16, 6 Identity and sessions,
-- 7 Sign-in and MFA, 15 Request path for a PHI page, 16 Authentication and Authorization in depth;
-- docs/product/sessions.md; docs/adr/0016 and 0017).
--
-- - role_permission: the persona matrix of PRD 3 as data (global, read-only to the application role),
--   identical to packages/db/src/authz/permissions.ts (a database test compares them).
--   app_actor_permitted() and its organization and platform forms are the database's check for
--   role-specific actions; the grant-change policies call it from here on, and packet approval will.
-- - Sign-in state the identity provider does not keep: the ten-failure lockout ("user" columns), the
--   device list (user_device) and the sessions with their 12-hour absolute and 30-minute idle limits
--   (user_session). Cognito's device tracking stays off (a remembered device skips MFA, ADR 0012).
-- - mutation_request: the request-key guard every mutation passes through.
-- - Directory functions for the practice switcher and the internal console, which return directory
--   records (names, dates, counts) and never a practice's data.
--
-- Runs as tp_owner. New tables without practice_id force row-level security with self policies; none
-- holds PHI.

-- ---------------------------------------------------------------------------------------------------
-- The permission matrix.
-- ---------------------------------------------------------------------------------------------------

CREATE TABLE role_permission (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL CHECK (role IN (
    'practice_admin', 'billing_manager', 'analyst', 'viewer', 'firm_principal', 'firm_analyst',
    'platform_admin', 'contract_specialist', 'reviewer', 'support'
  )),
  action text NOT NULL CHECK (action ~ '^[a-z][a-z_]*\.[a-z][a-z_]*$'),
  -- allow: the persona's "Does" column; deny: its "Must not" column. A deny wins over any allow.
  effect text NOT NULL CHECK (effect IN ('allow', 'deny')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT role_permission_once UNIQUE (role, action)
);
CREATE TRIGGER role_permission_updated_at BEFORE UPDATE ON role_permission FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO role_permission (role, action, effect) VALUES
  ('analyst', 'case.work', 'allow'),
  ('analyst', 'file.upload', 'allow'),
  ('analyst', 'grant.approve', 'deny'),
  ('analyst', 'grant.revoke', 'deny'),
  ('analyst', 'packet.approve', 'deny'),
  ('analyst', 'packet.approve_own_draft', 'deny'),
  ('analyst', 'packet.draft', 'allow'),
  ('analyst', 'phi.read', 'allow'),
  ('analyst', 'practice.open', 'allow'),
  ('analyst', 'report.read', 'allow'),
  ('billing_manager', 'anomaly.work', 'allow'),
  ('billing_manager', 'case.work', 'allow'),
  ('billing_manager', 'file.upload', 'allow'),
  ('billing_manager', 'mapping.edit', 'allow'),
  ('billing_manager', 'packet.approve', 'allow'),
  ('billing_manager', 'packet.approve_own_draft', 'deny'),
  ('billing_manager', 'packet.draft', 'allow'),
  ('billing_manager', 'phi.export', 'allow'),
  ('billing_manager', 'phi.read', 'allow'),
  ('billing_manager', 'posting.reconcile', 'allow'),
  ('billing_manager', 'practice.open', 'allow'),
  ('billing_manager', 'report.read', 'allow'),
  ('billing_manager', 'submission.log', 'allow'),
  ('contract_specialist', 'contract.review', 'allow'),
  ('contract_specialist', 'pricing.answer', 'allow'),
  ('contract_specialist', 'rate_record.approve', 'allow'),
  ('contract_specialist', 'rate_record.edit', 'allow'),
  ('contract_specialist', 'rate_record.edit_published', 'deny'),
  ('firm_analyst', 'case.work', 'allow'),
  ('firm_analyst', 'file.upload', 'allow'),
  ('firm_analyst', 'grant.approve', 'deny'),
  ('firm_analyst', 'grant.revoke', 'deny'),
  ('firm_analyst', 'packet.approve', 'deny'),
  ('firm_analyst', 'packet.approve_own_draft', 'deny'),
  ('firm_analyst', 'packet.draft', 'allow'),
  ('firm_analyst', 'phi.read', 'allow'),
  ('firm_analyst', 'practice.open', 'allow'),
  ('firm_analyst', 'report.read', 'allow'),
  ('firm_principal', 'anomaly.work', 'allow'),
  ('firm_principal', 'case.work', 'allow'),
  ('firm_principal', 'file.upload', 'allow'),
  ('firm_principal', 'firm_user.manage', 'allow'),
  ('firm_principal', 'mapping.edit', 'allow'),
  ('firm_principal', 'packet.approve', 'allow'),
  ('firm_principal', 'packet.approve_own_draft', 'deny'),
  ('firm_principal', 'packet.draft', 'allow'),
  ('firm_principal', 'phi.export', 'allow'),
  ('firm_principal', 'phi.read', 'allow'),
  ('firm_principal', 'portfolio.read', 'allow'),
  ('firm_principal', 'posting.reconcile', 'allow'),
  ('firm_principal', 'practice.open', 'allow'),
  ('firm_principal', 'report.read', 'allow'),
  ('firm_principal', 'submission.log', 'allow'),
  ('firm_principal', 'user.invite', 'allow'),
  ('platform_admin', 'agreement.record', 'allow'),
  ('platform_admin', 'billing.manage', 'allow'),
  ('platform_admin', 'feature_flag.manage', 'allow'),
  ('platform_admin', 'organization.manage', 'allow'),
  ('platform_admin', 'phi.export', 'deny'),
  ('platform_admin', 'phi.read', 'deny'),
  ('platform_admin', 'rule_release.manage', 'allow'),
  ('platform_admin', 'support_grant.create', 'allow'),
  ('practice_admin', 'access_log.read', 'allow'),
  ('practice_admin', 'agreement.sign', 'allow'),
  ('practice_admin', 'deletion.request', 'allow'),
  ('practice_admin', 'export.request', 'allow'),
  ('practice_admin', 'grant.approve', 'allow'),
  ('practice_admin', 'grant.revoke', 'allow'),
  ('practice_admin', 'practice.open', 'allow'),
  ('practice_admin', 'rate_record.edit', 'deny'),
  ('practice_admin', 'report.read', 'allow'),
  ('practice_admin', 'user.invite', 'allow'),
  ('reviewer', 'agreement.record', 'deny'),
  ('reviewer', 'agreement.sign', 'deny'),
  ('reviewer', 'anomaly.work', 'deny'),
  ('reviewer', 'audit_finding.validate', 'allow'),
  ('reviewer', 'billing.manage', 'deny'),
  ('reviewer', 'case.work', 'deny'),
  ('reviewer', 'deletion.request', 'deny'),
  ('reviewer', 'export.request', 'deny'),
  ('reviewer', 'feature_flag.manage', 'deny'),
  ('reviewer', 'file.upload', 'deny'),
  ('reviewer', 'firm_user.manage', 'deny'),
  ('reviewer', 'grant.approve', 'deny'),
  ('reviewer', 'grant.revoke', 'deny'),
  ('reviewer', 'mapping.edit', 'deny'),
  ('reviewer', 'organization.manage', 'deny'),
  ('reviewer', 'packet.approve', 'deny'),
  ('reviewer', 'packet.approve_own_draft', 'deny'),
  ('reviewer', 'packet.draft', 'deny'),
  ('reviewer', 'phi.read', 'allow'),
  ('reviewer', 'posting.reconcile', 'deny'),
  ('reviewer', 'rate_record.approve', 'deny'),
  ('reviewer', 'rate_record.edit', 'deny'),
  ('reviewer', 'rate_record.edit_published', 'deny'),
  ('reviewer', 'report.read', 'allow'),
  ('reviewer', 'rule_release.manage', 'deny'),
  ('reviewer', 'submission.log', 'deny'),
  ('reviewer', 'support_grant.create', 'deny'),
  ('reviewer', 'user.invite', 'deny'),
  ('support', 'phi.read', 'allow'),
  ('support', 'practice.open', 'allow'),
  ('support', 'report.read', 'allow'),
  ('viewer', 'phi.export', 'deny'),
  ('viewer', 'practice.open', 'allow'),
  ('viewer', 'report.read', 'allow');

-- Whether a set of roles holds an action: one allows it and none denies it.
CREATE FUNCTION roles_permit(held text[], wanted text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT EXISTS (SELECT 1 FROM role_permission p WHERE p.role = ANY (held) AND p.action = wanted AND p.effect = 'allow')
     AND NOT EXISTS (SELECT 1 FROM role_permission p WHERE p.role = ANY (held) AND p.action = wanted AND p.effect = 'deny')
$$;

-- The actor's roles on a practice are the routes effective_practice_access() finds right now (the
-- membership roles a grant's scope admits, the own group's roles, the support role under a support
-- grant); a practice the actor cannot reach holds nothing.
CREATE FUNCTION app_actor_permitted(target_practice uuid, wanted text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT roles_permit(coalesce((SELECT array_agg(DISTINCT a.role) FROM effective_practice_access() a WHERE a.practice_id = target_practice), '{}'), wanted)
$$;

-- An organization-level action (inviting users, the firm portfolio): the actor's current role in it.
CREATE FUNCTION app_actor_organization_permitted(target_organization uuid, wanted text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT roles_permit(coalesce((SELECT array_agg(DISTINCT m.role) FROM app_actor_memberships() m WHERE m.organization_id = target_organization), '{}'), wanted)
$$;

-- A platform action (the internal console): the actor's current roles in the internal organization.
CREATE FUNCTION app_actor_platform_permitted(wanted text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT roles_permit(coalesce((SELECT array_agg(DISTINCT m.role) FROM app_actor_memberships() m WHERE m.organization_kind = 'internal'), '{}'), wanted)
$$;

-- Grant changes are role-specific actions (PRD 3): from here on their policies ask the matrix.
DROP POLICY grant_approved_by_practice_administrator ON "grant";
CREATE POLICY grant_approved_by_practice_administrator ON "grant" AS RESTRICTIVE FOR INSERT TO tp_app
  WITH CHECK (app_actor_permitted(practice_id, 'grant.approve') AND approved_by_user_id = app_actor_id());
DROP POLICY grant_revoked_by_practice_administrator ON "grant";
CREATE POLICY grant_revoked_by_practice_administrator ON "grant" AS RESTRICTIVE FOR UPDATE TO tp_app
  USING (app_actor_permitted(practice_id, 'grant.revoke'))
  WITH CHECK (app_actor_permitted(practice_id, 'grant.revoke') AND revoked_by = app_actor_id());

-- ---------------------------------------------------------------------------------------------------
-- Sign-in state: lockout after ten failures (PRD 7, PRD 16).
-- ---------------------------------------------------------------------------------------------------

ALTER TABLE "user"
  ADD COLUMN failed_sign_ins integer NOT NULL DEFAULT 0 CHECK (failed_sign_ins >= 0),
  ADD COLUMN locked_at timestamptz;

-- A browser a user signs in from. token_sha256 is the hash of the random device cookie; the label is
-- the browser and system read from the User-Agent ("Chrome on Linux"), never the raw header.
CREATE TABLE user_device (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES "user" (id),
  token_sha256 text NOT NULL CHECK (token_sha256 ~ '^[0-9a-f]{64}$'),
  label text NOT NULL CHECK (label ~ '^[A-Za-z0-9 .()/-]{1,64}$'),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_device_once UNIQUE (user_id, token_sha256)
);
CREATE TRIGGER user_device_updated_at BEFORE UPDATE ON user_device FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- A signed-in session (docs/product/sessions.md): 12 hours from sign-in at most, ended after 30
-- minutes without a request, and ended at once by sign-out, device revocation or revocation of the
-- user's sessions. token_sha256 is the hash of the random session cookie.
CREATE TABLE user_session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES "user" (id),
  device_id uuid NOT NULL REFERENCES user_device (id),
  token_sha256 text NOT NULL UNIQUE CHECK (token_sha256 ~ '^[0-9a-f]{64}$'),
  -- The second factor the sign-in used: a TOTP code or a hardware key (WebAuthn with user verification).
  mfa_method text NOT NULL CHECK (mfa_method IN ('totp', 'webauthn')),
  started_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '12 hours',
  ended_at timestamptz,
  end_reason text CHECK (end_reason IN ('signed_out', 'idle', 'expired', 'device_revoked', 'revoked', 'user_disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_session_twelve_hours CHECK (expires_at > started_at AND expires_at <= started_at + interval '12 hours'),
  CONSTRAINT user_session_end CHECK ((ended_at IS NULL) = (end_reason IS NULL))
);
CREATE INDEX user_session_by_user ON user_session (user_id);
CREATE INDEX user_session_by_device ON user_session (device_id);
CREATE TRIGGER user_session_updated_at BEFORE UPDATE ON user_session FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Every mutation's request key (CLAUDE.md: every mutation is guarded by a request key). The wrapper
-- inserts it in the mutation's own transaction, so a key is recorded exactly when its mutation
-- committed, and a replay of the same key does nothing.
CREATE TABLE mutation_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES "user" (id),
  request_key uuid NOT NULL,
  route_id text NOT NULL CHECK (route_id ~ '^[a-z][a-z0-9_.]{0,63}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mutation_request_once UNIQUE (user_id, request_key)
);

-- ---------------------------------------------------------------------------------------------------
-- Sign-in functions. They run before a session exists, so they answer by email, subject or token
-- hash and return only what sign-in needs.
-- ---------------------------------------------------------------------------------------------------

-- Whether the user holds a current membership of the internal organization (a hardware key is then
-- required whatever hardware_key_required says).
CREATE FUNCTION user_is_internal(target_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT EXISTS (
    SELECT 1 FROM membership m JOIN organization o ON o.id = m.organization_id
     WHERE m.user_id = target_user AND o.kind = 'internal' AND (m.ends_at IS NULL OR m.ends_at > now())
  )
$$;

-- The account a sign-in names (by email before the provider answers, by subject after).
CREATE FUNCTION sign_in_account(by_email text, by_sub text) RETURNS TABLE (
  user_id uuid, cognito_sub text, email text, status text, mfa_enrolled boolean, locked boolean, hardware_key_required boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT u.id, u.cognito_sub, u.email, u.status, u.mfa_enrolled, u.locked_at IS NOT NULL,
         u.hardware_key_required OR user_is_internal(u.id)
    FROM "user" u
   WHERE (by_email IS NOT NULL AND lower(u.email) = lower(by_email))
      OR (by_sub IS NOT NULL AND u.cognito_sub = by_sub)
   LIMIT 1
$$;

-- Records a failed attempt (wrong password, second factor or hardware key) for a known account: the
-- counter, the audit event, a security event when three second-factor failures land within fifteen
-- minutes (a failed-MFA burst, PRD 5 J16), and the lock at ten consecutive failures, which is a
-- security event too. Events are the system's (the attempt is not authenticated).
CREATE FUNCTION sign_in_failed(target_user uuid, stage text, request text) RETURNS TABLE (failures integer, locked boolean, newly_locked boolean, burst boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  was_locked boolean;
  recent bigint;
BEGIN
  IF stage NOT IN ('password', 'mfa', 'hardware_key') THEN
    RAISE EXCEPTION 'unknown sign-in stage' USING ERRCODE = 'check_violation';
  END IF;
  SELECT u.locked_at IS NOT NULL INTO was_locked FROM "user" u WHERE u.id = target_user FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  UPDATE "user" u
     SET failed_sign_ins = u.failed_sign_ins + 1,
         locked_at = CASE WHEN u.locked_at IS NULL AND u.failed_sign_ins + 1 >= 10 THEN now() ELSE u.locked_at END
   WHERE u.id = target_user
  RETURNING u.failed_sign_ins, u.locked_at IS NOT NULL INTO failures, locked;
  newly_locked := locked AND NOT was_locked;
  INSERT INTO audit_event (actor_kind, action, object_type, object_id, purpose, request_id)
    VALUES ('system', 'sign_in_failed', 'user', target_user, stage, request);
  burst := false;
  IF stage IN ('mfa', 'hardware_key') THEN
    SELECT count(*) INTO recent FROM audit_event e
     WHERE e.object_type = 'user' AND e.object_id = target_user AND e.action = 'sign_in_failed'
       AND e.purpose IN ('mfa', 'hardware_key') AND e.at > now() - interval '15 minutes';
    IF recent = 3 THEN
      burst := true;
      INSERT INTO audit_event (actor_kind, action, object_type, object_id, purpose, request_id)
        VALUES ('system', 'security_event', 'user', target_user, 'failed_mfa_burst', request);
    END IF;
  END IF;
  IF newly_locked THEN
    INSERT INTO audit_event (actor_kind, action, object_type, object_id, purpose, request_id)
      VALUES ('system', 'security_event', 'user', target_user, 'account_locked', request);
  END IF;
  RETURN NEXT;
END;
$$;

-- A successful sign-in clears the failure count (a locked account never gets this far).
CREATE FUNCTION sign_in_succeeded(target_user uuid) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  UPDATE "user" SET failed_sign_ins = 0 WHERE id = target_user AND locked_at IS NULL AND failed_sign_ins <> 0
$$;

-- A platform administrator unlocks a locked account.
CREATE FUNCTION unlock_user(target_user uuid) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT app_actor_platform_permitted('organization.manage') THEN
    RAISE EXCEPTION 'only a platform administrator unlocks an account' USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE "user" SET failed_sign_ins = 0, locked_at = NULL WHERE id = target_user AND locked_at IS NOT NULL;
  RETURN FOUND;
END;
$$;

-- Resolves a session cookie on every request: the session, its user and whether it may continue. An
-- expired, idle, revoked-device or disabled-user session is ended here, so the next request is refused
-- and the user signs in again; an active one is touched (its idle clock restarts).
CREATE FUNCTION resolve_session(token text) RETURNS TABLE (
  outcome text, ended_now boolean, session_id uuid, user_id uuid, device_id uuid, mfa_method text,
  started_at timestamptz, expires_at timestamptz, last_seen_at timestamptz,
  user_status text, mfa_enrolled boolean, hardware_key_required boolean
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  s user_session%ROWTYPE;
  u "user"%ROWTYPE;
  device_revoked boolean;
  reason text;
BEGIN
  SELECT * INTO s FROM user_session x WHERE x.token_sha256 = token FOR UPDATE;
  IF NOT FOUND THEN
    outcome := 'unknown';
    ended_now := false;
    RETURN NEXT;
    RETURN;
  END IF;
  SELECT * INTO u FROM "user" x WHERE x.id = s.user_id;
  SELECT d.revoked_at IS NOT NULL INTO device_revoked FROM user_device d WHERE d.id = s.device_id;
  session_id := s.id; user_id := s.user_id; device_id := s.device_id; mfa_method := s.mfa_method;
  started_at := s.started_at; expires_at := s.expires_at; last_seen_at := s.last_seen_at;
  user_status := u.status; mfa_enrolled := u.mfa_enrolled;
  hardware_key_required := u.hardware_key_required OR user_is_internal(u.id);
  ended_now := false;
  IF s.ended_at IS NOT NULL THEN
    outcome := 'ended';
    RETURN NEXT;
    RETURN;
  END IF;
  reason := CASE
    WHEN now() >= s.expires_at THEN 'expired'
    WHEN now() > s.last_seen_at + interval '30 minutes' THEN 'idle'
    WHEN device_revoked THEN 'device_revoked'
    WHEN u.status = 'disabled' THEN 'user_disabled'
  END;
  IF reason IS NOT NULL THEN
    UPDATE user_session x SET ended_at = now(), end_reason = reason WHERE x.id = s.id;
    outcome := reason;
    ended_now := true;
    RETURN NEXT;
    RETURN;
  END IF;
  UPDATE user_session x SET last_seen_at = now() WHERE x.id = s.id;
  UPDATE user_device x SET last_seen_at = now() WHERE x.id = s.device_id;
  outcome := 'active';
  RETURN NEXT;
END;
$$;

-- Ends every open session of a user (they left an organization, an administrator revoked them). The
-- actor is the user, a platform administrator, or an administrator of an organization the user is
-- or was a member of.
CREATE FUNCTION revoke_user_sessions(target_user uuid) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  ended integer;
BEGIN
  IF NOT (
    target_user = app_actor_id()
    OR app_actor_platform_permitted('organization.manage')
    OR EXISTS (SELECT 1 FROM membership m WHERE m.user_id = target_user AND m.organization_id = ANY (app_actor_administered_organization_ids()))
  ) THEN
    RAISE EXCEPTION 'only the user or an administrator of the user''s organization revokes the user''s sessions' USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE user_session SET ended_at = now(), end_reason = 'revoked' WHERE user_id = target_user AND ended_at IS NULL;
  GET DIAGNOSTICS ended = ROW_COUNT;
  RETURN ended;
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- Directory functions: names and dates, never a practice's data.
-- ---------------------------------------------------------------------------------------------------

-- The practice switcher: the active practices the actor reaches right now, by name.
CREATE FUNCTION app_actor_practice_directory() RETURNS TABLE (practice_id uuid, name text, organization_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT p.id, p.name, p.organization_id
    FROM practice p
   WHERE p.id = ANY (allowed_practice_ids()) AND p.status = 'active'
   ORDER BY p.name, p.id
$$;

-- The internal console's practices (all, or one organization's): directory records for platform
-- administrators. A platform administrator still reads no practice's rows (PRD 3).
CREATE FUNCTION console_practices(of_organization uuid) RETURNS TABLE (practice_id uuid, organization_id uuid, name text, status text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT p.id, p.organization_id, p.name, p.status, p.created_at
    FROM practice p
   WHERE app_actor_platform_permitted('organization.manage')
     AND (of_organization IS NULL OR p.organization_id = of_organization)
   ORDER BY p.name, p.id
$$;

-- The grants an organization holds or its practices gave, for the internal console.
CREATE FUNCTION console_grants(of_organization uuid) RETURNS TABLE (
  grant_id uuid, organization_id uuid, practice_id uuid, scope jsonb, starts_at timestamptz, ends_at timestamptz,
  agreement_id uuid, approved_by_user_id uuid, revoked_at timestamptz, created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT g.id, g.organization_id, g.practice_id, g.scope, g.starts_at, g.ends_at, g.agreement_id, g.approved_by_user_id, g.revoked_at, g.created_at
    FROM "grant" g
    JOIN practice p ON p.id = g.practice_id
   WHERE app_actor_platform_permitted('organization.manage')
     AND (g.organization_id = of_organization OR p.organization_id = of_organization)
   ORDER BY g.created_at DESC, g.id
$$;

-- Support grants with the number of reads recorded under each (never which records: the list goes
-- to the practice's administrators).
CREATE FUNCTION console_support_grants() RETURNS TABLE (
  support_grant_id uuid, practice_id uuid, user_id uuid, ticket text, reason text,
  created_at timestamptz, expires_at timestamptz, notified_at timestamptz, reads bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT s.id, s.practice_id, s.user_id, s.ticket, s.reason, s.created_at, s.expires_at, s.notified_at,
         (SELECT count(*) FROM audit_event e WHERE e.grant_id = s.id AND e.action = 'read')
    FROM support_grant s
   WHERE app_actor_platform_permitted('support_grant.create')
   ORDER BY s.created_at DESC, s.id
$$;

-- ---------------------------------------------------------------------------------------------------
-- Row-level security and privileges.
-- ---------------------------------------------------------------------------------------------------

ALTER TABLE user_device ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_device FORCE ROW LEVEL SECURITY;
CREATE POLICY user_device_self ON user_device FOR ALL TO tp_app USING (user_id = app_actor_id()) WITH CHECK (user_id = app_actor_id());
CREATE POLICY user_device_owner ON user_device FOR ALL TO tp_owner USING (true) WITH CHECK (true);

ALTER TABLE user_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_session FORCE ROW LEVEL SECURITY;
CREATE POLICY user_session_self ON user_session FOR ALL TO tp_app USING (user_id = app_actor_id()) WITH CHECK (user_id = app_actor_id());
CREATE POLICY user_session_owner ON user_session FOR ALL TO tp_owner USING (true) WITH CHECK (true);

ALTER TABLE mutation_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE mutation_request FORCE ROW LEVEL SECURITY;
CREATE POLICY mutation_request_self ON mutation_request FOR ALL TO tp_app USING (user_id = app_actor_id()) WITH CHECK (user_id = app_actor_id());
CREATE POLICY mutation_request_owner ON mutation_request FOR ALL TO tp_owner USING (true) WITH CHECK (true);

REVOKE ALL ON role_permission, user_device, user_session, mutation_request FROM PUBLIC;
GRANT SELECT ON role_permission TO tp_app;
GRANT SELECT ON user_device, user_session, mutation_request TO tp_app;
GRANT INSERT (id, user_id, token_sha256, label) ON user_device TO tp_app;
GRANT UPDATE (label, last_seen_at, revoked_at) ON user_device TO tp_app;
GRANT INSERT (id, user_id, device_id, token_sha256, mfa_method) ON user_session TO tp_app;
GRANT UPDATE (ended_at, end_reason) ON user_session TO tp_app;
GRANT INSERT (id, user_id, request_key, route_id) ON mutation_request TO tp_app;

REVOKE ALL ON FUNCTION
  roles_permit(text[], text), app_actor_permitted(uuid, text), app_actor_organization_permitted(uuid, text),
  app_actor_platform_permitted(text), user_is_internal(uuid), sign_in_account(text, text), sign_in_failed(uuid, text, text),
  sign_in_succeeded(uuid), unlock_user(uuid), resolve_session(text), revoke_user_sessions(uuid),
  app_actor_practice_directory(), console_practices(uuid), console_grants(uuid), console_support_grants()
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
  roles_permit(text[], text), app_actor_permitted(uuid, text), app_actor_organization_permitted(uuid, text),
  app_actor_platform_permitted(text), sign_in_account(text, text), sign_in_failed(uuid, text, text),
  sign_in_succeeded(uuid), unlock_user(uuid), resolve_session(text), revoke_user_sessions(uuid),
  app_actor_practice_directory(), console_practices(uuid), console_grants(uuid), console_support_grants()
TO tp_app;

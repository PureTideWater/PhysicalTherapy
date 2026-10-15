-- Tenancy and access (PRD sections 3, 8 and 16; Data dictionary, Tenancy and access; docs/adr/0013).
--
-- The practice is the tenant. Every table with a NOT NULL practice_id is a PHI table: practice_id is
-- indexed, ENABLE and FORCE ROW LEVEL SECURITY are set, its registered policy is
-- practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]) (the practice table on id), and
-- it has a row in phi_table_registry. The other tenancy tables also force row-level security, with the
-- policies the data dictionary's Policy column describes. The application role (tp_app) owns nothing,
-- cannot bypass, and holds only the privileges below; the registry is global and read-only to it.
--
-- Runs as tp_owner (the migration runner sets the role), so tp_owner owns every object here. Because
-- the tables force row-level security, tp_owner is bound by policies too: it reads the tenancy tables
-- in full through the *_owner and *_resolver policies (the access resolver below runs as tp_owner), and
-- writes a PHI table only inside a practice scope, like everyone else.

-- ---------------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------------

CREATE TABLE organization (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('group', 'firm', 'internal')),
  name text NOT NULL CHECK (btrim(name) <> ''),
  billing_customer_ref text CHECK (billing_customer_ref ~ '^[A-Za-z0-9_]{1,255}$'),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "user" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cognito_sub text NOT NULL UNIQUE CHECK (cognito_sub ~ '^[A-Za-z0-9-]{1,128}$'),
  email text NOT NULL CHECK (email ~ '^[^@ ]+@[^@ ]+$'),
  mfa_enrolled boolean NOT NULL DEFAULT false,
  hardware_key_required boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX user_email_unique ON "user" (lower(email));

-- organization_id is the owning practice group, or null for a practice no group owns yet.
CREATE TABLE practice (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organization (id),
  name text NOT NULL CHECK (btrim(name) <> ''),
  tax_id_last4 text CHECK (tax_id_last4 ~ '^[0-9]{4}$'),
  npi text CHECK (npi ~ '^[0-9]{10}$'),
  locality_code text,
  zip text CHECK (zip ~ '^[0-9]{5}$'),
  settings jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(settings) = 'object'),
  -- The practice's wrapped data key (packages/db/src/crypto); destroyed (null) only once deleted.
  data_key_ref text CHECK (data_key_ref ~ '^(kms|local):v1:[A-Za-z0-9+/]+={0,2}$'),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT practice_has_data_key CHECK (data_key_ref IS NOT NULL OR status = 'deleted')
);
CREATE INDEX practice_by_organization ON practice (organization_id);

CREATE TABLE membership (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization (id),
  user_id uuid NOT NULL REFERENCES "user" (id),
  role text NOT NULL CHECK (role IN (
    'practice_admin', 'billing_manager', 'analyst', 'viewer', 'firm_principal', 'firm_analyst',
    'platform_admin', 'contract_specialist', 'reviewer', 'support'
  )),
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- One role per membership, and one open membership per user in an organization.
CREATE UNIQUE INDEX membership_open ON membership (organization_id, user_id) WHERE ends_at IS NULL;
CREATE INDEX membership_by_user ON membership (user_id);

-- practice_id is null for an agreement with the organization as a whole (terms, a firm's own BAA).
CREATE TABLE agreement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization (id),
  practice_id uuid REFERENCES practice (id),
  kind text NOT NULL CHECK (kind IN ('baa', 'engagement', 'terms', 'data_rights', 'dpa')),
  version text NOT NULL CHECK (btrim(version) <> ''),
  signed_at timestamptz NOT NULL,
  signer text NOT NULL CHECK (btrim(signer) <> ''),
  document_ref text NOT NULL CHECK (btrim(document_ref) <> ''),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agreement_by_practice ON agreement (practice_id);
CREATE INDEX agreement_by_organization ON agreement (organization_id);

-- scope.roles lists the grantee organization's membership roles the grant admits; effective permission
-- is the membership role intersected with it. An empty scope admits no one.
CREATE TABLE "grant" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization (id),
  practice_id uuid NOT NULL REFERENCES practice (id),
  scope jsonb NOT NULL,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NOT NULL,
  approved_by_user_id uuid NOT NULL REFERENCES "user" (id),
  agreement_id uuid NOT NULL REFERENCES agreement (id),
  revoked_at timestamptz,
  revoked_by uuid REFERENCES "user" (id),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT grant_scope CHECK (
    jsonb_typeof(scope) = 'object'
    AND coalesce(jsonb_typeof(scope -> 'roles'), 'array') = 'array'
    AND coalesce(scope -> 'roles', '[]') <@ '["firm_principal", "firm_analyst", "billing_manager", "analyst", "viewer"]'::jsonb
  ),
  CONSTRAINT grant_window CHECK (ends_at > starts_at),
  CONSTRAINT grant_revocation CHECK ((revoked_at IS NULL) = (revoked_by IS NULL))
);
CREATE INDEX grant_by_practice ON "grant" (practice_id);
CREATE INDEX grant_by_organization ON "grant" (organization_id);

-- Break-glass access for one support engineer to one practice for one ticket: four hours at most.
CREATE TABLE support_grant (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practice (id),
  user_id uuid NOT NULL REFERENCES "user" (id),
  ticket text NOT NULL CHECK (ticket ~ '^[A-Za-z0-9-]{1,64}$'),
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  expires_at timestamptz NOT NULL,
  notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_grant_four_hours CHECK (expires_at > created_at AND expires_at <= created_at + interval '4 hours')
);
CREATE INDEX support_grant_by_practice ON support_grant (practice_id);
CREATE INDEX support_grant_by_user ON support_grant (user_id);

-- Global: the catalog of PHI tables the catalog test and the generated cross-tenant tests read.
CREATE TABLE phi_table_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL UNIQUE CHECK (table_name ~ '^[a-z][a-z0-9_]*$'),
  registered_by text NOT NULL CHECK (registered_by ~ '^[0-9]{14}_[a-z0-9_]+$'),
  policy_name text NOT NULL CHECK (policy_name ~ '^[a-z][a-z0-9_]*$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO phi_table_registry (table_name, registered_by, policy_name) VALUES
  ('practice', '20261015140000_tenancy', 'practice_tenant'),
  ('grant', '20261015140000_tenancy', 'grant_tenant'),
  ('support_grant', '20261015140000_tenancy', 'support_grant_tenant');

-- ---------------------------------------------------------------------------------------------------
-- The actor and what the actor may do. app.actor_id is the user (or, in a job, the job) the
-- transaction acts for. Capabilities need an active user with MFA enrolled (PRD 6: a user without MFA
-- reaches no PHI route); a membership is current until its ends_at. The helpers that read tables run
-- as tp_owner (SECURITY DEFINER) so a policy can consult memberships without recursing into its own.
-- ---------------------------------------------------------------------------------------------------

CREATE FUNCTION app_actor_id() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.actor_id', true), '')::uuid
$$;

CREATE FUNCTION app_actor_memberships() RETURNS TABLE (organization_id uuid, organization_kind text, role text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT m.organization_id, o.kind, m.role
    FROM membership m
    JOIN "user" u ON u.id = m.user_id
    JOIN organization o ON o.id = m.organization_id
   WHERE m.user_id = app_actor_id()
     AND u.status = 'active' AND u.mfa_enrolled
     AND (m.ends_at IS NULL OR m.ends_at > now())
$$;

CREATE FUNCTION app_actor_organization_ids() RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT coalesce(array_agg(DISTINCT organization_id), '{}') FROM app_actor_memberships()
$$;

-- Organization administrators: practice administrators of a group, principals of a firm, platform
-- administrators of the internal organization.
CREATE FUNCTION app_actor_administered_organization_ids() RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT coalesce(array_agg(DISTINCT organization_id), '{}') FROM app_actor_memberships()
   WHERE (organization_kind, role) IN (('group', 'practice_admin'), ('firm', 'firm_principal'), ('internal', 'platform_admin'))
$$;

CREATE FUNCTION app_actor_is_platform_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT EXISTS (SELECT 1 FROM app_actor_memberships() WHERE organization_kind = 'internal' AND role = 'platform_admin')
$$;

-- Users who belong (currently) to an organization the actor administers.
CREATE FUNCTION app_actor_administered_user_ids() RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT coalesce(array_agg(DISTINCT m.user_id), '{}')
    FROM membership m
   WHERE m.organization_id = ANY (app_actor_administered_organization_ids())
     AND (m.ends_at IS NULL OR m.ends_at > now())
$$;

-- Whether a user is a current practice administrator of a practice (owner only: triggers use it).
CREATE FUNCTION user_is_practice_admin(target_practice uuid, target_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT EXISTS (
    SELECT 1
      FROM practice p
      JOIN membership m ON m.organization_id = p.organization_id
      JOIN "user" u ON u.id = m.user_id
     WHERE p.id = target_practice AND m.user_id = target_user AND m.role = 'practice_admin'
       AND (m.ends_at IS NULL OR m.ends_at > now())
       AND u.status = 'active' AND u.mfa_enrolled
  )
$$;

-- The practices whose owning group the actor administers.
CREATE FUNCTION app_actor_admin_practice_ids() RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT coalesce(array_agg(DISTINCT p.id), '{}')
    FROM practice p
    JOIN app_actor_memberships() m ON m.organization_id = p.organization_id
   WHERE m.organization_kind = 'group' AND m.role = 'practice_admin'
$$;

-- ---------------------------------------------------------------------------------------------------
-- The effective-permission function (PRD 16, Grants): the actor's memberships intersected with the
-- grants in force, plus the practices the actor's own practice group owns, plus an unexpired support
-- grant. Evaluated with now() of the transaction, so a revoked or expired grant yields nothing on the
-- next one. Internal roles have no standing access: the internal organization owns no practice and
-- holds no grant (the triggers below refuse both), so only a support grant reaches PHI.
-- ---------------------------------------------------------------------------------------------------

CREATE FUNCTION effective_practice_access() RETURNS TABLE (practice_id uuid, via text, grant_id uuid, role text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT p.id, 'ownership', NULL::uuid, m.role
    FROM app_actor_memberships() m
    JOIN practice p ON p.organization_id = m.organization_id
   WHERE m.organization_kind = 'group' AND m.role IN ('practice_admin', 'billing_manager', 'analyst', 'viewer')
  UNION ALL
  SELECT g.practice_id, 'grant', g.id, m.role
    FROM app_actor_memberships() m
    JOIN "grant" g ON g.organization_id = m.organization_id
   WHERE m.organization_kind IN ('group', 'firm')
     AND g.revoked_at IS NULL AND g.starts_at <= now() AND now() < g.ends_at
     AND g.scope -> 'roles' ? m.role
  UNION ALL
  SELECT s.practice_id, 'support', s.id, 'support'
    FROM support_grant s
   WHERE s.user_id = app_actor_id()
     AND s.created_at <= now() AND now() < s.expires_at AND now() < s.created_at + interval '4 hours'
     AND EXISTS (SELECT 1 FROM app_actor_memberships() m WHERE m.organization_kind = 'internal' AND m.role = 'support')
$$;

CREATE FUNCTION allowed_practice_ids() RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT coalesce(array_agg(DISTINCT practice_id ORDER BY practice_id), '{}') FROM effective_practice_access()
$$;

-- Opens the practice scope of the current transaction: app.practice_ids becomes the requested
-- practices the actor may reach right now, and the access rows for them are returned. Runs as the
-- caller (no SET clause), so the SET LOCAL lasts until the transaction ends.
CREATE FUNCTION open_practice_scope(requested uuid[]) RETURNS TABLE (practice_id uuid, via text, grant_id uuid, role text)
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  granted uuid[];
BEGIN
  SELECT coalesce(array_agg(DISTINCT a.practice_id ORDER BY a.practice_id), '{}') INTO granted
    FROM effective_practice_access() a
   WHERE a.practice_id = ANY (coalesce(requested, '{}'));
  PERFORM set_config('app.practice_ids', granted::text, true);
  RETURN QUERY SELECT a.practice_id, a.via, a.grant_id, a.role FROM effective_practice_access() a WHERE a.practice_id = ANY (granted);
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- Integrity the policies rely on.
-- ---------------------------------------------------------------------------------------------------

CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER organization_updated_at BEFORE UPDATE ON organization FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER user_updated_at BEFORE UPDATE ON "user" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER practice_updated_at BEFORE UPDATE ON practice FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER membership_updated_at BEFORE UPDATE ON membership FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER agreement_updated_at BEFORE UPDATE ON agreement FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER grant_updated_at BEFORE UPDATE ON "grant" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER support_grant_updated_at BEFORE UPDATE ON support_grant FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER phi_table_registry_updated_at BEFORE UPDATE ON phi_table_registry FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- An organization's kind never changes: a group cannot become the internal organization.
CREATE FUNCTION organization_kind_fixed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.kind <> OLD.kind THEN
    RAISE EXCEPTION 'organization kind is fixed at creation' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER organization_kind_fixed BEFORE UPDATE OF kind ON organization FOR EACH ROW EXECUTE FUNCTION organization_kind_fixed();

CREATE FUNCTION organization_kind_of(target_organization uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT o.kind FROM organization o WHERE o.id = target_organization
$$;

-- Roles fit the organization: customer roles in a group, firm roles in a firm, internal roles in the
-- internal organization (PRD 3, Personas).
CREATE FUNCTION membership_role_fits_organization() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  kind text := organization_kind_of(NEW.organization_id);
BEGIN
  IF NOT (
    (kind = 'group' AND NEW.role IN ('practice_admin', 'billing_manager', 'analyst', 'viewer'))
    OR (kind = 'firm' AND NEW.role IN ('firm_principal', 'firm_analyst', 'billing_manager', 'analyst', 'viewer'))
    OR (kind = 'internal' AND NEW.role IN ('platform_admin', 'contract_specialist', 'reviewer', 'support'))
  ) THEN
    RAISE EXCEPTION 'role % does not belong in a % organization', NEW.role, coalesce(kind, 'missing') USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER membership_role_fits_organization BEFORE INSERT OR UPDATE OF organization_id, role ON membership
  FOR EACH ROW EXECUTE FUNCTION membership_role_fits_organization();

-- A practice is owned by a practice group, never by a firm or the internal organization.
CREATE FUNCTION practice_owned_by_group() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.organization_id IS NOT NULL AND organization_kind_of(NEW.organization_id) IS DISTINCT FROM 'group' THEN
    RAISE EXCEPTION 'a practice is owned by a practice group' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER practice_owned_by_group BEFORE INSERT OR UPDATE OF organization_id ON practice
  FOR EACH ROW EXECUTE FUNCTION practice_owned_by_group();

-- Only an administrator (or the owner role, for platform workflows) changes a user's status or the
-- hardware-key rule; a user may accept their own invitation (invited to active) and nothing more.
CREATE FUNCTION user_guarded_columns() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
  IF pg_has_role(current_user, 'tp_owner', 'USAGE') OR app_actor_is_platform_admin() THEN
    RETURN NEW;
  END IF;
  IF NEW.hardware_key_required IS DISTINCT FROM OLD.hardware_key_required
     OR (NEW.status IS DISTINCT FROM OLD.status AND NOT (OLD.status = 'invited' AND NEW.status = 'active')) THEN
    RAISE EXCEPTION 'only a platform administrator changes a user''s status or hardware-key rule' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER user_guarded_columns BEFORE UPDATE OF status, hardware_key_required ON "user"
  FOR EACH ROW EXECUTE FUNCTION user_guarded_columns();

-- A grant: never to the internal organization (support has its own path), approved by a current
-- practice administrator of the practice (so a practice without an administrator cannot be granted),
-- and after creation changed only by its revocation, once, by a practice administrator.
CREATE FUNCTION grant_rules() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF organization_kind_of(NEW.organization_id) IS DISTINCT FROM 'group' AND organization_kind_of(NEW.organization_id) IS DISTINCT FROM 'firm' THEN
      RAISE EXCEPTION 'a grant goes to a practice group or a firm; internal access is a support grant' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT user_is_practice_admin(NEW.practice_id, NEW.approved_by_user_id) THEN
      RAISE EXCEPTION 'a grant is approved by a current practice administrator of its practice' USING ERRCODE = 'check_violation';
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
CREATE TRIGGER grant_rules BEFORE INSERT OR UPDATE ON "grant" FOR EACH ROW EXECUTE FUNCTION grant_rules();

-- A support grant never changes except to record when the practice administrator was notified.
CREATE FUNCTION support_grant_fixed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.id, NEW.practice_id, NEW.user_id, NEW.ticket, NEW.reason, NEW.expires_at, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.practice_id, OLD.user_id, OLD.ticket, OLD.reason, OLD.expires_at, OLD.created_at)
     OR (OLD.notified_at IS NOT NULL AND NEW.notified_at IS DISTINCT FROM OLD.notified_at) THEN
    RAISE EXCEPTION 'a support grant never changes; only its notification time is recorded, once' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER support_grant_fixed BEFORE UPDATE ON support_grant FOR EACH ROW EXECUTE FUNCTION support_grant_fixed();

-- A practice keeps at least one practice administrator (PRD 3; PRD 6 acceptance). A practice that
-- has never had one (just created, its administrator invited) is allowed; once it has one, no change
-- may leave it with none. Counted: open practice_admin memberships (no ends_at) of the owning group
-- whose user is not disabled. Checked at commit, so a transaction can hand the role over.
CREATE FUNCTION practice_administrator_count(target_practice uuid) RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT count(*)
    FROM practice p
    JOIN membership m ON m.organization_id = p.organization_id
    JOIN "user" u ON u.id = m.user_id
   WHERE p.id = target_practice AND m.role = 'practice_admin' AND m.ends_at IS NULL AND u.status <> 'disabled'
$$;

CREATE FUNCTION organization_administrator_count(target_organization uuid) RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT count(*)
    FROM membership m
    JOIN "user" u ON u.id = m.user_id
   WHERE m.organization_id = target_organization AND m.role = 'practice_admin' AND m.ends_at IS NULL AND u.status <> 'disabled'
$$;

CREATE FUNCTION assert_organization_keeps_administrator(target_organization uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM practice p WHERE p.organization_id = target_organization AND p.status <> 'deleted')
     AND organization_administrator_count(target_organization) = 0 THEN
    RAISE EXCEPTION 'a practice must always keep at least one practice administrator' USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

CREATE FUNCTION membership_keeps_practice_administrator() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF OLD.role = 'practice_admin' AND OLD.ends_at IS NULL
     AND EXISTS (SELECT 1 FROM "user" u WHERE u.id = OLD.user_id AND u.status <> 'disabled') THEN
    PERFORM assert_organization_keeps_administrator(OLD.organization_id);
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER membership_keeps_practice_administrator AFTER UPDATE OR DELETE ON membership
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION membership_keeps_practice_administrator();

CREATE FUNCTION user_keeps_practice_administrator() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  administered uuid;
BEGIN
  IF OLD.status <> 'disabled' AND NEW.status = 'disabled' THEN
    FOR administered IN SELECT m.organization_id FROM membership m WHERE m.user_id = NEW.id AND m.role = 'practice_admin' AND m.ends_at IS NULL LOOP
      PERFORM assert_organization_keeps_administrator(administered);
    END LOOP;
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER user_keeps_practice_administrator AFTER UPDATE OF status ON "user"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION user_keeps_practice_administrator();

-- Moving a practice that had an administrator to a group without one would leave it with none.
CREATE FUNCTION practice_keeps_administrator() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
     AND OLD.organization_id IS NOT NULL AND organization_administrator_count(OLD.organization_id) > 0
     AND practice_administrator_count(NEW.id) = 0 THEN
    RAISE EXCEPTION 'a practice must always keep at least one practice administrator' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER practice_keeps_administrator AFTER UPDATE OF organization_id ON practice
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION practice_keeps_administrator();

-- ---------------------------------------------------------------------------------------------------
-- Row-level security. tp_app policies follow the data dictionary's Policy column; RESTRICTIVE policies
-- narrow the tenant policy for the role-specific actions (grant changes). Functions in policies are
-- wrapped in (SELECT ...) so each runs once per statement.
-- ---------------------------------------------------------------------------------------------------

ALTER TABLE organization ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization FORCE ROW LEVEL SECURITY;
-- Members only (and the platform administrators who manage organizations, PRD 3).
CREATE POLICY organization_members ON organization FOR SELECT TO tp_app
  USING (id = ANY ((SELECT app_actor_organization_ids())::uuid[]) OR (SELECT app_actor_is_platform_admin()));
CREATE POLICY organization_platform_admin_insert ON organization FOR INSERT TO tp_app
  WITH CHECK ((SELECT app_actor_is_platform_admin()));
CREATE POLICY organization_platform_admin_update ON organization FOR UPDATE TO tp_app
  USING ((SELECT app_actor_is_platform_admin())) WITH CHECK ((SELECT app_actor_is_platform_admin()));
CREATE POLICY organization_owner ON organization FOR ALL TO tp_owner USING (true) WITH CHECK (true);

ALTER TABLE "user" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user" FORCE ROW LEVEL SECURITY;
-- Self and administrators.
CREATE POLICY user_self_and_administrators ON "user" FOR SELECT TO tp_app
  USING (id = app_actor_id() OR (SELECT app_actor_is_platform_admin()) OR id = ANY ((SELECT app_actor_administered_user_ids())::uuid[]));
-- An administrator invites a user; the invitation starts without MFA and is accepted by the user.
CREATE POLICY user_invited_by_administrators ON "user" FOR INSERT TO tp_app
  WITH CHECK (
    ((SELECT app_actor_is_platform_admin()) OR cardinality((SELECT app_actor_administered_organization_ids())) > 0)
    AND status = 'invited' AND NOT mfa_enrolled
  );
CREATE POLICY user_self_and_platform_admin_update ON "user" FOR UPDATE TO tp_app
  USING (id = app_actor_id() OR (SELECT app_actor_is_platform_admin()))
  WITH CHECK (id = app_actor_id() OR (SELECT app_actor_is_platform_admin()));
CREATE POLICY user_owner ON "user" FOR ALL TO tp_owner USING (true) WITH CHECK (true);

ALTER TABLE membership ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership FORCE ROW LEVEL SECURITY;
-- Organization administrators (and the member, who reads their own).
CREATE POLICY membership_self_and_administrators ON membership FOR SELECT TO tp_app
  USING (
    user_id = app_actor_id()
    OR organization_id = ANY ((SELECT app_actor_administered_organization_ids())::uuid[])
    OR (SELECT app_actor_is_platform_admin())
  );
CREATE POLICY membership_administrators_insert ON membership FOR INSERT TO tp_app
  WITH CHECK (organization_id = ANY ((SELECT app_actor_administered_organization_ids())::uuid[]) OR (SELECT app_actor_is_platform_admin()));
CREATE POLICY membership_administrators_update ON membership FOR UPDATE TO tp_app
  USING (organization_id = ANY ((SELECT app_actor_administered_organization_ids())::uuid[]) OR (SELECT app_actor_is_platform_admin()))
  WITH CHECK (organization_id = ANY ((SELECT app_actor_administered_organization_ids())::uuid[]) OR (SELECT app_actor_is_platform_admin()));
CREATE POLICY membership_owner ON membership FOR ALL TO tp_owner USING (true) WITH CHECK (true);

ALTER TABLE practice ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice FORCE ROW LEVEL SECURITY;
-- By grant or ownership: the practice scope holds exactly the practices the actor reaches.
CREATE POLICY practice_tenant ON practice
  USING (id = ANY (current_setting('app.practice_ids', true)::uuid[]))
  WITH CHECK (id = ANY (current_setting('app.practice_ids', true)::uuid[]));
-- The platform administrator creates the practice (PRD 5, J1); its administrator is invited next.
CREATE POLICY practice_platform_admin_insert ON practice FOR INSERT TO tp_app
  WITH CHECK ((SELECT app_actor_is_platform_admin()));
CREATE POLICY practice_administrators_update ON practice AS RESTRICTIVE FOR UPDATE TO tp_app
  USING (id = ANY ((SELECT app_actor_admin_practice_ids())::uuid[]))
  WITH CHECK (id = ANY ((SELECT app_actor_admin_practice_ids())::uuid[]));
CREATE POLICY practice_resolver ON practice FOR SELECT TO tp_owner USING (true);

ALTER TABLE agreement ENABLE ROW LEVEL SECURITY;
ALTER TABLE agreement FORCE ROW LEVEL SECURITY;
-- Parties to it: the organization's members and the practice it names.
CREATE POLICY agreement_parties ON agreement FOR SELECT TO tp_app
  USING (
    organization_id = ANY ((SELECT app_actor_organization_ids())::uuid[])
    OR practice_id = ANY (current_setting('app.practice_ids', true)::uuid[])
    OR (SELECT app_actor_is_platform_admin())
  );
CREATE POLICY agreement_recorded_by_administrators ON agreement FOR INSERT TO tp_app
  WITH CHECK (
    (SELECT app_actor_is_platform_admin())
    OR (organization_id = ANY ((SELECT app_actor_administered_organization_ids())::uuid[])
        AND (practice_id IS NULL OR practice_id = ANY (current_setting('app.practice_ids', true)::uuid[])))
  );
CREATE POLICY agreement_owner ON agreement FOR ALL TO tp_owner USING (true) WITH CHECK (true);

ALTER TABLE "grant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "grant" FORCE ROW LEVEL SECURITY;
CREATE POLICY grant_tenant ON "grant"
  USING (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]))
  WITH CHECK (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]));
-- Practice administrators; the firm sees its own.
CREATE POLICY grant_practice_administrators_and_grantee_read ON "grant" AS RESTRICTIVE FOR SELECT TO tp_app
  USING (practice_id = ANY ((SELECT app_actor_admin_practice_ids())::uuid[]) OR organization_id = ANY ((SELECT app_actor_organization_ids())::uuid[]));
CREATE POLICY grant_approved_by_practice_administrator ON "grant" AS RESTRICTIVE FOR INSERT TO tp_app
  WITH CHECK (practice_id = ANY ((SELECT app_actor_admin_practice_ids())::uuid[]) AND approved_by_user_id = app_actor_id());
CREATE POLICY grant_revoked_by_practice_administrator ON "grant" AS RESTRICTIVE FOR UPDATE TO tp_app
  USING (practice_id = ANY ((SELECT app_actor_admin_practice_ids())::uuid[]))
  WITH CHECK (practice_id = ANY ((SELECT app_actor_admin_practice_ids())::uuid[]) AND revoked_by = app_actor_id());
CREATE POLICY grant_resolver ON "grant" FOR SELECT TO tp_owner USING (true);

ALTER TABLE support_grant ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_grant FORCE ROW LEVEL SECURITY;
-- The practice sees its own.
CREATE POLICY support_grant_tenant ON support_grant
  USING (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]))
  WITH CHECK (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]));
-- Platform administrators.
CREATE POLICY support_grant_platform_administrators ON support_grant FOR ALL TO tp_app
  USING ((SELECT app_actor_is_platform_admin())) WITH CHECK ((SELECT app_actor_is_platform_admin()));
CREATE POLICY support_grant_created_by_platform_administrator ON support_grant AS RESTRICTIVE FOR INSERT TO tp_app
  WITH CHECK ((SELECT app_actor_is_platform_admin()));
CREATE POLICY support_grant_resolver ON support_grant FOR SELECT TO tp_owner USING (true);

-- ---------------------------------------------------------------------------------------------------
-- Privileges: only what each table needs. Nothing can be deleted or truncated by the application.
-- ---------------------------------------------------------------------------------------------------

REVOKE ALL ON organization, "user", practice, membership, agreement, "grant", support_grant, phi_table_registry FROM PUBLIC;

GRANT SELECT ON organization, "user", practice, membership, agreement, "grant", support_grant, phi_table_registry TO tp_app;
GRANT INSERT (id, kind, name, billing_customer_ref, status) ON organization TO tp_app;
GRANT UPDATE (name, billing_customer_ref, status) ON organization TO tp_app;
GRANT INSERT (id, cognito_sub, email, mfa_enrolled, hardware_key_required, status) ON "user" TO tp_app;
GRANT UPDATE (email, mfa_enrolled, hardware_key_required, status) ON "user" TO tp_app;
GRANT INSERT (id, organization_id, name, tax_id_last4, npi, locality_code, zip, settings, data_key_ref) ON practice TO tp_app;
GRANT UPDATE (name, tax_id_last4, npi, locality_code, zip, settings) ON practice TO tp_app;
GRANT INSERT (id, organization_id, user_id, role, ends_at) ON membership TO tp_app;
GRANT UPDATE (role, ends_at) ON membership TO tp_app;
GRANT INSERT (id, organization_id, practice_id, kind, version, signed_at, signer, document_ref, sha256) ON agreement TO tp_app;
GRANT INSERT (id, organization_id, practice_id, scope, starts_at, ends_at, approved_by_user_id, agreement_id, reason) ON "grant" TO tp_app;
GRANT UPDATE (revoked_at, revoked_by, reason) ON "grant" TO tp_app;
GRANT INSERT (id, practice_id, user_id, ticket, reason, expires_at) ON support_grant TO tp_app;
GRANT UPDATE (notified_at) ON support_grant TO tp_app;
-- Global: read-only to the application role (Data dictionary conventions).
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON phi_table_registry FROM tp_app;

REVOKE ALL ON FUNCTION
  app_actor_id(), app_actor_memberships(), app_actor_organization_ids(), app_actor_administered_organization_ids(),
  app_actor_is_platform_admin(), app_actor_administered_user_ids(), user_is_practice_admin(uuid, uuid),
  app_actor_admin_practice_ids(), effective_practice_access(), allowed_practice_ids(), open_practice_scope(uuid[]),
  set_updated_at(), organization_kind_fixed(), organization_kind_of(uuid), membership_role_fits_organization(),
  practice_owned_by_group(), user_guarded_columns(), grant_rules(), support_grant_fixed(),
  practice_administrator_count(uuid), organization_administrator_count(uuid), assert_organization_keeps_administrator(uuid),
  membership_keeps_practice_administrator(), user_keeps_practice_administrator(), practice_keeps_administrator()
FROM PUBLIC;

-- What policies and the transaction helpers call as the application role. Each answers only about
-- the current actor; user_is_practice_admin and the counts, which answer about anyone, stay owner-only.
GRANT EXECUTE ON FUNCTION
  app_actor_id(), app_actor_memberships(), app_actor_organization_ids(), app_actor_administered_organization_ids(),
  app_actor_is_platform_admin(), app_actor_administered_user_ids(), app_actor_admin_practice_ids(),
  effective_practice_access(), allowed_practice_ids(), open_practice_scope(uuid[])
TO tp_app;

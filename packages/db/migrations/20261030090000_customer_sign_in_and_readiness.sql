-- Customer sign-in and production readiness (milestone 11; PRD 3, Personas; PRD 4, Monitoring v1: "Customer
-- sign-in with MFA; practice administrator, billing manager, analyst and viewer roles"; PRD 5, J1 and J2; PRD 6,
-- Identity and sessions, Organizations, Agreements and the cross-cutting requirements; PRD 7, Settings and Sign-in
-- and MFA; PRD 16; PRD 19, Support and Monitoring; docs/product/sessions.md; docs/adr/0053).
--
-- - prospect_request: the public audit request (J1: "name, organization, locations, payers, billing arrangement;
--   no PHI"), written only through submit_prospect_request() and worked by platform administrators.
-- - invitation: one per membership created for an invited user, with its expiry (seven days, as Cognito's
--   temporary password) and its sends; re-sent by the organization's own administrators or a platform
--   administrator, never by a firm for a group (J2: "an expired invitation is re-sent by the administrator, never
--   by the firm"). The membership trigger writes it; acceptance (the first sign-in with MFA) stamps it.
-- - terms_version, terms_acceptance: the terms of use by version, and each customer user's acceptance of a
--   version with its time. A customer whose acceptance is not of the version in force is sent to accept it
--   first (app_actor_terms_state()).
-- - agreement_event: each e-signature webhook event recorded once, by the vendor's event ID; the agreement it
--   completes is recorded by record_esigned_agreement() by reference and SHA-256.
-- - support_ticket: a ticket from any screen (PRD 19: "In-app help per screen; a support address that creates a
--   ticket"), screened for identifiers by the application; read by its requester and the support desk
--   (support_ticket.work). It names no practice: the desk opens a support grant for the practice the requester's
--   organizations hold, from the console, as before.
-- - rate_limit_counter: fixed-window counters by bucket and hashed subject (a user, an address, an account),
--   shared by every web task through Postgres; only rate_limit_take() touches it.
-- - status_component, status_incident, status_incident_update: the public status page (component status and
--   incidents, no PHI), set by platform administrators (status.manage), read by anyone through public_status_*().
-- - compliance_record: the evidence a person records for the SOC 2 Type I checklist (a policy approved, an
--   access review, a tabletop, a training attestation, a vendor review, the risk analysis, the security
--   official's designation), by reference and SHA-256, append-only (compliance.manage).
-- - feature_flag gains platform.maintenance (global only): the maintenance flag every route reads.
-- - practice_access_log(), practice_grants(), practice_set_pursuit(), console_restore_drills(): the Settings
--   screen's access log ("who read claim X"), its grants view, its pursuit defaults, and the checklist's restore
--   drill evidence.
--
-- None of these tables holds PHI or has a practice_id. Every table forces row-level security.
--
-- Runs as tp_owner. Safe with the previous image running: new tables, functions, permissions and a widened
-- feature_flag key list; the previous image never reads them, and the membership trigger only adds the invitation
-- row beside a membership it would create anyway.

-- ---------------------------------------------------------------------------------------------------
-- The permission matrix: the proof level stays the practice administrator's (ADR 0043), the status page and the
-- evidence checklist are the platform administrators', and the support desk works tickets.
-- ---------------------------------------------------------------------------------------------------

INSERT INTO role_permission (role, action, effect) VALUES
  ('practice_admin', 'proof_level.set', 'allow'),
  ('platform_admin', 'status.manage', 'allow'),
  ('platform_admin', 'compliance.manage', 'allow'),
  ('platform_admin', 'support_ticket.work', 'allow'),
  ('support', 'support_ticket.work', 'allow'),
  ('reviewer', 'proof_level.set', 'deny'),
  ('reviewer', 'status.manage', 'deny'),
  ('reviewer', 'compliance.manage', 'deny'),
  ('reviewer', 'support_ticket.work', 'deny');

-- ---------------------------------------------------------------------------------------------------
-- Prospect requests (J1)
-- ---------------------------------------------------------------------------------------------------

-- One to fifty payer names, none blank or longer than 120 characters.
CREATE FUNCTION prospect_payers_valid(payers text[]) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog, pg_temp AS $$
  SELECT cardinality(payers) BETWEEN 1 AND 50
     AND array_position(payers, NULL) IS NULL
     AND NOT EXISTS (SELECT 1 FROM unnest(payers) p WHERE btrim(p) = '' OR length(p) > 120)
$$;

CREATE TABLE prospect_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_name text NOT NULL CHECK (btrim(contact_name) <> '' AND length(contact_name) <= 200),
  contact_email text NOT NULL CHECK (contact_email ~ '^[^@ ]+@[^@ ]+$' AND length(contact_email) <= 254),
  organization_name text NOT NULL CHECK (btrim(organization_name) <> '' AND length(organization_name) <= 200),
  locations integer NOT NULL CHECK (locations BETWEEN 1 AND 1000),
  payers text[] NOT NULL,
  billing_arrangement text NOT NULL CHECK (billing_arrangement IN ('in_house', 'billing_firm', 'mixed', 'other')),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'converted', 'declined')),
  organization_id uuid REFERENCES organization (id),
  reviewed_by uuid REFERENCES "user" (id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prospect_request_payers CHECK (prospect_payers_valid(payers)),
  CONSTRAINT prospect_request_converted CHECK ((status = 'converted') = (organization_id IS NOT NULL)),
  CONSTRAINT prospect_request_review CHECK ((status = 'new') = (reviewed_by IS NULL) AND (reviewed_by IS NULL) = (reviewed_at IS NULL))
);
CREATE INDEX prospect_request_by_status ON prospect_request (status, created_at DESC);
CREATE TRIGGER prospect_request_updated_at BEFORE UPDATE ON prospect_request FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- A request's own fields never change once received; only its review moves.
CREATE FUNCTION prospect_request_fixed() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF (NEW.id, NEW.contact_name, NEW.contact_email, NEW.organization_name, NEW.locations, NEW.payers, NEW.billing_arrangement, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.contact_name, OLD.contact_email, OLD.organization_name, OLD.locations, OLD.payers, OLD.billing_arrangement, OLD.created_at) THEN
    RAISE EXCEPTION 'a prospect request is kept as it was received' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status = 'converted' THEN
    RAISE EXCEPTION 'a converted request names its organization for good' USING ERRCODE = 'check_violation';
  END IF;
  NEW.reviewed_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER prospect_request_fixed BEFORE UPDATE ON prospect_request FOR EACH ROW EXECUTE FUNCTION prospect_request_fixed();

-- The public form's only way in: no session, no actor; the row starts new.
CREATE FUNCTION submit_prospect_request(contact text, email text, organization text, location_count integer, payer_names text[], arrangement text) RETURNS uuid
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  INSERT INTO prospect_request (contact_name, contact_email, organization_name, locations, payers, billing_arrangement)
  VALUES (btrim(contact), lower(btrim(email)), btrim(organization), location_count, payer_names, arrangement)
  RETURNING id
$$;

ALTER TABLE prospect_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospect_request FORCE ROW LEVEL SECURITY;
CREATE POLICY prospect_request_platform_read ON prospect_request FOR SELECT TO tp_app
  USING ((SELECT app_actor_platform_permitted('organization.manage')));
CREATE POLICY prospect_request_platform_review ON prospect_request FOR UPDATE TO tp_app
  USING ((SELECT app_actor_platform_permitted('organization.manage')))
  WITH CHECK ((SELECT app_actor_platform_permitted('organization.manage')) AND reviewed_by = app_actor_id());
CREATE POLICY prospect_request_owner ON prospect_request FOR ALL TO tp_owner USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------------------------------
-- Invitations (J2)
-- ---------------------------------------------------------------------------------------------------

CREATE TABLE invitation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization (id),
  membership_id uuid NOT NULL UNIQUE REFERENCES membership (id),
  user_id uuid NOT NULL REFERENCES "user" (id),
  invited_by uuid NOT NULL REFERENCES "user" (id),
  sent_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  sends integer NOT NULL DEFAULT 1 CHECK (sends BETWEEN 1 AND 1000),
  last_sent_by uuid NOT NULL REFERENCES "user" (id),
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Cognito's temporary password lasts seven days (infra identity: tempPasswordValidity), and so does this.
  CONSTRAINT invitation_window CHECK (expires_at > sent_at AND expires_at <= sent_at + interval '7 days')
);
CREATE INDEX invitation_by_organization ON invitation (organization_id, created_at DESC);
CREATE INDEX invitation_by_user ON invitation (user_id);
CREATE TRIGGER invitation_updated_at BEFORE UPDATE ON invitation FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- A membership created for a user who has not yet accepted an invitation is an invitation, sent by the person
-- who created it (the seed, run as the owner without an actor, invites nobody).
CREATE FUNCTION membership_invitation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "user" a WHERE a.id = app_actor_id()) AND EXISTS (SELECT 1 FROM "user" u WHERE u.id = NEW.user_id AND u.status = 'invited') THEN
    INSERT INTO invitation (organization_id, membership_id, user_id, invited_by, sent_at, expires_at, last_sent_by)
    VALUES (NEW.organization_id, NEW.id, NEW.user_id, app_actor_id(), now(), now() + interval '7 days', app_actor_id());
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER membership_invitation AFTER INSERT ON membership FOR EACH ROW EXECUTE FUNCTION membership_invitation();

-- Accepting (record_sign_in_with_mfa() moving the user from invited to active) stamps their open invitations.
CREATE FUNCTION user_accepts_invitations() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF OLD.status = 'invited' AND NEW.status = 'active' THEN
    UPDATE invitation SET accepted_at = now() WHERE user_id = NEW.id AND accepted_at IS NULL;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER user_accepts_invitations AFTER UPDATE OF status ON "user" FOR EACH ROW EXECUTE FUNCTION user_accepts_invitations();

-- Only the functions here change an invitation: sends, expiry and acceptance never move otherwise.
CREATE FUNCTION invitation_rules() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF (NEW.id, NEW.organization_id, NEW.membership_id, NEW.user_id, NEW.invited_by, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.organization_id, OLD.membership_id, OLD.user_id, OLD.invited_by, OLD.created_at) THEN
    RAISE EXCEPTION 'an invitation names its organization, membership, user and inviter for good' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.accepted_at IS NOT NULL AND NEW.accepted_at IS DISTINCT FROM OLD.accepted_at THEN
    RAISE EXCEPTION 'an accepted invitation stays accepted' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER invitation_rules BEFORE UPDATE ON invitation FOR EACH ROW EXECUTE FUNCTION invitation_rules();

-- Sends the invitation again, with a new seven days: by the organization's own administrators (user.invite in
-- it, which a group's practice administrator and a firm's principal hold for their own organization only) or a
-- platform administrator. An accepted invitation, or one whose membership has ended, is not sent again.
CREATE FUNCTION resend_invitation(target uuid) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  organization uuid;
BEGIN
  SELECT i.organization_id INTO organization FROM invitation i WHERE i.id = target;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  IF app_actor_id() IS NULL OR NOT (
       coalesce(app_actor_organization_permitted(organization, 'user.invite'), false)
       OR coalesce(app_actor_platform_permitted('organization.manage'), false)) THEN
    RAISE EXCEPTION 'an invitation is sent again by its organization''s administrator' USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE invitation i SET sent_at = now(), expires_at = now() + interval '7 days', sends = i.sends + 1, last_sent_by = app_actor_id()
   WHERE i.id = target AND i.accepted_at IS NULL
     AND EXISTS (SELECT 1 FROM membership m WHERE m.id = i.membership_id AND (m.ends_at IS NULL OR m.ends_at > now()))
     AND EXISTS (SELECT 1 FROM "user" u WHERE u.id = i.user_id AND u.status = 'invited');
  RETURN FOUND;
END;
$$;

-- Whether an invited user's invitations have all expired (the sign-in flow refuses a temporary password then,
-- as Cognito does). A user invited before invitations were recorded has none and is not expired.
CREATE FUNCTION invitation_expired(target_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM "user" u WHERE u.id = target_user AND u.status = 'invited')
     AND EXISTS (SELECT 1 FROM invitation i WHERE i.user_id = target_user AND i.accepted_at IS NULL)
     AND NOT EXISTS (
       SELECT 1 FROM invitation i JOIN membership m ON m.id = i.membership_id
        WHERE i.user_id = target_user AND i.accepted_at IS NULL AND i.expires_at > now() AND (m.ends_at IS NULL OR m.ends_at > now())
     )
$$;

ALTER TABLE invitation ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitation FORCE ROW LEVEL SECURITY;
CREATE POLICY invitation_administrators_and_invitee ON invitation FOR SELECT TO tp_app
  USING (
    user_id = app_actor_id()
    OR organization_id = ANY ((SELECT app_actor_administered_organization_ids())::uuid[])
    OR (SELECT app_actor_platform_permitted('organization.manage'))
  );
CREATE POLICY invitation_owner ON invitation FOR ALL TO tp_owner USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------------------------------
-- Terms of use, by version, and each customer's acceptance
-- ---------------------------------------------------------------------------------------------------

CREATE TABLE terms_version (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL UNIQUE CHECK (version ~ '^[A-Za-z0-9._-]{1,40}$'),
  document_ref text NOT NULL CHECK (document_ref ~ '^[A-Za-z0-9:/._-]{1,200}$'),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  published_at timestamptz NOT NULL DEFAULT now(),
  published_by uuid NOT NULL REFERENCES "user" (id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX terms_version_by_published ON terms_version (published_at DESC);

CREATE TABLE terms_acceptance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES "user" (id),
  terms_version_id uuid NOT NULL REFERENCES terms_version (id),
  accepted_at timestamptz NOT NULL DEFAULT now(),
  request_id text CHECK (request_id ~ '^[A-Za-z0-9._:-]{1,128}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT terms_acceptance_once UNIQUE (user_id, terms_version_id)
);

-- A version is published now (never backdated); an acceptance is now too. Neither ever changes.
CREATE FUNCTION terms_published_now() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  NEW.published_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER terms_version_published_now BEFORE INSERT ON terms_version FOR EACH ROW EXECUTE FUNCTION terms_published_now();
CREATE FUNCTION terms_accepted_now() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  NEW.accepted_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER terms_acceptance_accepted_now BEFORE INSERT ON terms_acceptance FOR EACH ROW EXECUTE FUNCTION terms_accepted_now();
CREATE TRIGGER terms_version_append_only BEFORE UPDATE OR DELETE ON terms_version FOR EACH ROW EXECUTE FUNCTION reject_change();
CREATE TRIGGER terms_acceptance_append_only BEFORE UPDATE OR DELETE ON terms_acceptance FOR EACH ROW EXECUTE FUNCTION reject_change();

-- The version in force: the latest published. Null before any is published.
CREATE FUNCTION current_terms_version() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT t.id FROM terms_version t WHERE t.published_at <= now() ORDER BY t.published_at DESC, t.id DESC LIMIT 1
$$;

-- Whether the actor must accept the version in force before anything else: a customer (no current internal
-- membership; internal staff work under the workforce policies) whose acceptances do not include it.
CREATE FUNCTION app_actor_terms_required() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT app_actor_id() IS NOT NULL
     AND current_terms_version() IS NOT NULL
     AND NOT user_is_internal(app_actor_id())
     AND NOT EXISTS (SELECT 1 FROM terms_acceptance a WHERE a.user_id = app_actor_id() AND a.terms_version_id = current_terms_version())
$$;

ALTER TABLE terms_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE terms_version FORCE ROW LEVEL SECURITY;
-- The terms are public: anyone signed in reads every version.
CREATE POLICY terms_version_read ON terms_version FOR SELECT TO tp_app USING (true);
CREATE POLICY terms_version_published_by_platform ON terms_version FOR INSERT TO tp_app
  WITH CHECK ((SELECT app_actor_platform_permitted('agreement.record')) AND published_by = app_actor_id());
CREATE POLICY terms_version_owner ON terms_version FOR ALL TO tp_owner USING (true) WITH CHECK (true);

ALTER TABLE terms_acceptance ENABLE ROW LEVEL SECURITY;
ALTER TABLE terms_acceptance FORCE ROW LEVEL SECURITY;
CREATE POLICY terms_acceptance_self_and_platform_read ON terms_acceptance FOR SELECT TO tp_app
  USING (user_id = app_actor_id() OR (SELECT app_actor_platform_permitted('organization.manage')));
CREATE POLICY terms_acceptance_self ON terms_acceptance FOR INSERT TO tp_app WITH CHECK (user_id = app_actor_id());
CREATE POLICY terms_acceptance_owner ON terms_acceptance FOR ALL TO tp_owner USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------------------------------
-- Agreements from the e-signature vendor's webhook
-- ---------------------------------------------------------------------------------------------------

CREATE TABLE agreement_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_event_id text NOT NULL UNIQUE CHECK (provider_event_id ~ '^[A-Za-z0-9._:-]{1,128}$'),
  envelope_ref text NOT NULL CHECK (envelope_ref ~ '^[A-Za-z0-9._:-]{1,128}$'),
  agreement_id uuid NOT NULL REFERENCES agreement (id),
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER agreement_event_append_only BEFORE UPDATE OR DELETE ON agreement_event FOR EACH ROW EXECUTE FUNCTION reject_change();
ALTER TABLE agreement_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE agreement_event FORCE ROW LEVEL SECURITY;
CREATE POLICY agreement_event_owner ON agreement_event FOR ALL TO tp_owner USING (true) WITH CHECK (true);

-- Records the agreement a verified webhook event completed (the web app verifies the vendor's signature and
-- hashes the signed document it fetched before calling this): once per event ID, by reference
-- (esign:<envelope>) and SHA-256, for a customer organization and, when named, one of its practices. The audit
-- event is the service's, in no person's name.
CREATE FUNCTION record_esigned_agreement(event_id text, envelope text, target_organization uuid, target_practice uuid, agreement_kind text, agreement_version text,
                                         signed timestamptz, signed_by text, document_sha256 text, request text)
RETURNS TABLE (agreement_id uuid, duplicate boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  existing uuid;
  created uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('agreement_event:' || event_id, 0));
  SELECT e.agreement_id INTO existing FROM agreement_event e WHERE e.provider_event_id = event_id;
  IF FOUND THEN
    RETURN QUERY SELECT existing, true;
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM organization o WHERE o.id = target_organization AND o.kind IN ('group', 'firm')) THEN
    RAISE EXCEPTION 'an e-signed agreement names a customer organization' USING ERRCODE = 'check_violation';
  END IF;
  IF target_practice IS NOT NULL AND NOT EXISTS (SELECT 1 FROM practice p WHERE p.id = target_practice AND p.organization_id = target_organization) THEN
    RAISE EXCEPTION 'an e-signed agreement names a practice of its organization' USING ERRCODE = 'check_violation';
  END IF;
  IF signed > now() THEN
    RAISE EXCEPTION 'an agreement is signed in the past' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO agreement (organization_id, practice_id, kind, version, signed_at, signer, document_ref, sha256)
  VALUES (target_organization, target_practice, agreement_kind, agreement_version, signed, signed_by, 'esign:' || envelope, document_sha256)
  RETURNING id INTO created;
  INSERT INTO agreement_event (provider_event_id, envelope_ref, agreement_id) VALUES (event_id, envelope, created);
  INSERT INTO audit_event (actor_id, actor_kind, action, object_type, object_id, practice_id, purpose, request_id)
  VALUES (NULL, 'system', 'agreement_recorded', 'agreement', created, target_practice, 'esign_webhook', request);
  RETURN QUERY SELECT created, false;
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- Support tickets (PRD 19, Support)
-- ---------------------------------------------------------------------------------------------------

CREATE TABLE support_ticket (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  requester_id uuid NOT NULL REFERENCES "user" (id),
  screen text NOT NULL CHECK (screen ~ '^[a-z][a-z0-9_]{0,63}$'),
  category text NOT NULL CHECK (category IN ('question', 'problem', 'access', 'billing', 'data', 'other')),
  subject text NOT NULL CHECK (btrim(subject) <> '' AND length(subject) <= 200),
  message text NOT NULL CHECK (btrim(message) <> '' AND length(message) <= 4000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'answered', 'closed')),
  status_changed_by uuid REFERENCES "user" (id),
  status_changed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_ticket_status_change CHECK ((status_changed_by IS NULL) = (status_changed_at IS NULL))
);
CREATE INDEX support_ticket_by_requester ON support_ticket (requester_id, created_at DESC);
CREATE INDEX support_ticket_by_status ON support_ticket (status, created_at DESC);
CREATE TRIGGER support_ticket_updated_at BEFORE UPDATE ON support_ticket FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- What the requester wrote never changes; the desk moves its status, in its own name, now.
CREATE FUNCTION support_ticket_rules() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.status := 'open';
    NEW.status_changed_by := NULL;
    NEW.status_changed_at := NULL;
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.number, NEW.requester_id, NEW.screen, NEW.category, NEW.subject, NEW.message, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.number, OLD.requester_id, OLD.screen, OLD.category, OLD.subject, OLD.message, OLD.created_at) THEN
    RAISE EXCEPTION 'a ticket keeps what its requester wrote' USING ERRCODE = 'check_violation';
  END IF;
  NEW.status_changed_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER support_ticket_rules BEFORE INSERT OR UPDATE ON support_ticket FOR EACH ROW EXECUTE FUNCTION support_ticket_rules();

ALTER TABLE support_ticket ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_ticket FORCE ROW LEVEL SECURITY;
-- The requester and the support desk.
CREATE POLICY support_ticket_read ON support_ticket FOR SELECT TO tp_app
  USING (requester_id = app_actor_id() OR (SELECT app_actor_platform_permitted('support_ticket.work')));
-- In the requester's own name.
CREATE POLICY support_ticket_requested ON support_ticket FOR INSERT TO tp_app WITH CHECK (requester_id = app_actor_id());
CREATE POLICY support_ticket_worked ON support_ticket FOR UPDATE TO tp_app
  USING ((SELECT app_actor_platform_permitted('support_ticket.work')))
  WITH CHECK ((SELECT app_actor_platform_permitted('support_ticket.work')) AND status_changed_by = app_actor_id());
CREATE POLICY support_ticket_owner ON support_ticket FOR ALL TO tp_owner USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------------------------------
-- Rate limits shared by every web task
-- ---------------------------------------------------------------------------------------------------

CREATE TABLE rate_limit_counter (
  bucket text NOT NULL CHECK (bucket ~ '^[a-z][a-z0-9_]{0,31}$'),
  subject text NOT NULL CHECK (subject ~ '^[0-9a-f]{64}$'),
  window_start timestamptz NOT NULL,
  hits integer NOT NULL CHECK (hits >= 1),
  PRIMARY KEY (bucket, subject, window_start)
);
CREATE INDEX rate_limit_counter_by_window ON rate_limit_counter (window_start);
ALTER TABLE rate_limit_counter ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limit_counter FORCE ROW LEVEL SECURITY;
CREATE POLICY rate_limit_counter_owner ON rate_limit_counter FOR ALL TO tp_owner USING (true) WITH CHECK (true);

-- Counts one hit of a subject (a SHA-256 the application computed of a user, an address or an account) in its
-- bucket's current fixed window, and says whether it is within the limit and, if not, how many seconds until
-- the window ends. Runs in its own statement, before the request's transaction, so a refused request still
-- counts. Windows that have ended are forgotten as they are passed.
CREATE FUNCTION rate_limit_take(target_bucket text, target_subject text, max_hits integer, window_seconds integer)
RETURNS TABLE (allowed boolean, hits integer, retry_after_seconds integer)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  moment timestamptz := clock_timestamp();
  started timestamptz;
  counted integer;
BEGIN
  IF max_hits IS NULL OR max_hits < 1 OR window_seconds IS NULL OR window_seconds < 1 OR window_seconds > 86400 THEN
    RAISE EXCEPTION 'a rate limit has at least one hit in a window of one second to a day' USING ERRCODE = 'check_violation';
  END IF;
  started := to_timestamp(floor(extract(epoch FROM moment) / window_seconds) * window_seconds);
  INSERT INTO rate_limit_counter AS c (bucket, subject, window_start, hits) VALUES (target_bucket, target_subject, started, 1)
    ON CONFLICT (bucket, subject, window_start) DO UPDATE SET hits = c.hits + 1
    RETURNING c.hits INTO counted;
  DELETE FROM rate_limit_counter c WHERE c.bucket = target_bucket AND c.subject = target_subject AND c.window_start < started;
  IF random() < 0.01 THEN
    DELETE FROM rate_limit_counter c WHERE c.window_start < moment - interval '2 days';
  END IF;
  RETURN QUERY SELECT counted <= max_hits, counted,
    CASE WHEN counted <= max_hits THEN 0 ELSE greatest(1, ceil(extract(epoch FROM (started + make_interval(secs => window_seconds) - moment)))::integer) END;
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- The maintenance flag
-- ---------------------------------------------------------------------------------------------------

ALTER TABLE feature_flag DROP CONSTRAINT feature_flag_key_check;
ALTER TABLE feature_flag ADD CONSTRAINT feature_flag_key_check CHECK (key IN ('model.kill_switch', 'model.read_denial_letter', 'model.daily_budget_cents', 'platform.maintenance'));
ALTER TABLE feature_flag ADD CONSTRAINT feature_flag_maintenance_global CHECK (key <> 'platform.maintenance' OR scope = 'global');

-- Whether the platform is in maintenance (every customer route answers with the maintenance page).
CREATE FUNCTION maintenance_on() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT coalesce((SELECT f.value = 'true'::jsonb FROM feature_flag f WHERE f.key = 'platform.maintenance' AND f.scope = 'global'), false)
$$;

-- ---------------------------------------------------------------------------------------------------
-- The public status page
-- ---------------------------------------------------------------------------------------------------

CREATE TABLE status_component (
  key text PRIMARY KEY CHECK (key IN ('web', 'sign_in', 'uploads', 'jobs', 'exports', 'billing', 'email')),
  name text NOT NULL CHECK (btrim(name) <> ''),
  position integer NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'operational' CHECK (status IN ('operational', 'degraded', 'partial_outage', 'major_outage', 'maintenance')),
  changed_by uuid REFERENCES "user" (id),
  changed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER status_component_updated_at BEFORE UPDATE ON status_component FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO status_component (key, name, position) VALUES
  ('web', 'Web application', 1),
  ('sign_in', 'Sign-in and MFA', 2),
  ('uploads', 'Uploads and parsing', 3),
  ('jobs', 'Pricing, triage and monitoring jobs', 4),
  ('exports', 'Reports and packet exports', 5),
  ('billing', 'Billing', 6),
  ('email', 'Email notices', 7);

CREATE FUNCTION status_component_rules() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF (NEW.key, NEW.name, NEW.position, NEW.created_at) IS DISTINCT FROM (OLD.key, OLD.name, OLD.position, OLD.created_at) THEN
    RAISE EXCEPTION 'a status component keeps its key, name and place' USING ERRCODE = 'check_violation';
  END IF;
  NEW.changed_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER status_component_rules BEFORE UPDATE ON status_component FOR EACH ROW EXECUTE FUNCTION status_component_rules();

CREATE TABLE status_incident (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (btrim(title) <> '' AND length(title) <= 120),
  impact text NOT NULL CHECK (impact IN ('minor', 'major', 'critical')),
  components text[] NOT NULL CHECK (cardinality(components) BETWEEN 1 AND 7 AND components <@ ARRAY['web', 'sign_in', 'uploads', 'jobs', 'exports', 'billing', 'email']),
  status text NOT NULL DEFAULT 'investigating' CHECK (status IN ('investigating', 'identified', 'monitoring', 'resolved')),
  started_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  created_by uuid NOT NULL REFERENCES "user" (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT status_incident_resolution CHECK ((status = 'resolved') = (resolved_at IS NOT NULL))
);
CREATE INDEX status_incident_by_started ON status_incident (started_at DESC);
CREATE TRIGGER status_incident_updated_at BEFORE UPDATE ON status_incident FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE status_incident_update (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES status_incident (id),
  status text NOT NULL CHECK (status IN ('investigating', 'identified', 'monitoring', 'resolved')),
  message text NOT NULL CHECK (btrim(message) <> '' AND length(message) <= 1000),
  posted_by uuid NOT NULL REFERENCES "user" (id),
  posted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX status_incident_update_by_incident ON status_incident_update (incident_id, posted_at);

-- An incident opens investigating, now, and moves only by its updates (each posted now); a resolved incident
-- takes no more updates.
CREATE FUNCTION status_incident_opened() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  NEW.status := 'investigating';
  NEW.started_at := now();
  NEW.resolved_at := NULL;
  RETURN NEW;
END;
$$;
CREATE TRIGGER status_incident_opened BEFORE INSERT ON status_incident FOR EACH ROW EXECUTE FUNCTION status_incident_opened();

CREATE FUNCTION status_incident_update_moves() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  NEW.posted_at := now();
  IF EXISTS (SELECT 1 FROM status_incident i WHERE i.id = NEW.incident_id AND i.status = 'resolved') THEN
    RAISE EXCEPTION 'a resolved incident takes no more updates; open a new one' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE status_incident i SET status = NEW.status, resolved_at = CASE WHEN NEW.status = 'resolved' THEN now() END WHERE i.id = NEW.incident_id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER status_incident_update_moves BEFORE INSERT ON status_incident_update FOR EACH ROW EXECUTE FUNCTION status_incident_update_moves();
CREATE TRIGGER status_incident_update_append_only BEFORE UPDATE OR DELETE ON status_incident_update FOR EACH ROW EXECUTE FUNCTION reject_change();

ALTER TABLE status_component ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_component FORCE ROW LEVEL SECURITY;
CREATE POLICY status_component_read ON status_component FOR SELECT TO tp_app USING (true);
CREATE POLICY status_component_managed ON status_component FOR UPDATE TO tp_app
  USING ((SELECT app_actor_platform_permitted('status.manage')))
  WITH CHECK ((SELECT app_actor_platform_permitted('status.manage')) AND changed_by = app_actor_id());
CREATE POLICY status_component_owner ON status_component FOR ALL TO tp_owner USING (true) WITH CHECK (true);

ALTER TABLE status_incident ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_incident FORCE ROW LEVEL SECURITY;
CREATE POLICY status_incident_read ON status_incident FOR SELECT TO tp_app USING (true);
CREATE POLICY status_incident_opened_by_platform ON status_incident FOR INSERT TO tp_app
  WITH CHECK ((SELECT app_actor_platform_permitted('status.manage')) AND created_by = app_actor_id());
CREATE POLICY status_incident_owner ON status_incident FOR ALL TO tp_owner USING (true) WITH CHECK (true);

ALTER TABLE status_incident_update ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_incident_update FORCE ROW LEVEL SECURITY;
CREATE POLICY status_incident_update_read ON status_incident_update FOR SELECT TO tp_app USING (true);
CREATE POLICY status_incident_update_posted_by_platform ON status_incident_update FOR INSERT TO tp_app
  WITH CHECK ((SELECT app_actor_platform_permitted('status.manage')) AND posted_by = app_actor_id());
CREATE POLICY status_incident_update_owner ON status_incident_update FOR ALL TO tp_owner USING (true) WITH CHECK (true);

-- What the public page shows: names, statuses and fixed-length texts staff wrote; never who wrote them.
CREATE FUNCTION public_status_components() RETURNS TABLE (key text, name text, status text, changed_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT c.key, c.name, c.status, c.changed_at FROM status_component c ORDER BY c.position
$$;

CREATE FUNCTION public_status_incidents(since timestamptz) RETURNS TABLE (
  incident_id uuid, title text, impact text, components text[], status text, started_at timestamptz, resolved_at timestamptz, updates jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT i.id, i.title, i.impact, i.components, i.status, i.started_at, i.resolved_at,
         coalesce((SELECT jsonb_agg(jsonb_build_object('status', u.status, 'message', u.message, 'posted_at', u.posted_at) ORDER BY u.posted_at DESC, u.id)
                     FROM status_incident_update u WHERE u.incident_id = i.id), '[]'::jsonb)
    FROM status_incident i
   WHERE i.status <> 'resolved' OR i.resolved_at >= since
   ORDER BY i.status = 'resolved', i.started_at DESC, i.id
   LIMIT 50
$$;

-- ---------------------------------------------------------------------------------------------------
-- Evidence for the SOC 2 Type I checklist
-- ---------------------------------------------------------------------------------------------------

CREATE TABLE compliance_record (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN (
    'policy_approval', 'access_review', 'tabletop_exercise', 'training_attestation', 'vendor_review', 'risk_analysis', 'security_official'
  )),
  subject text NOT NULL CHECK (subject ~ '^[a-z0-9][a-z0-9._:-]{0,127}$'),
  occurred_on date NOT NULL,
  document_ref text NOT NULL CHECK (document_ref ~ '^[A-Za-z0-9:/._-]{1,200}$'),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  recorded_by uuid NOT NULL REFERENCES "user" (id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX compliance_record_by_kind ON compliance_record (kind, subject, occurred_on DESC);
CREATE TRIGGER compliance_record_append_only BEFORE UPDATE OR DELETE ON compliance_record FOR EACH ROW EXECUTE FUNCTION reject_change();

-- Evidence is recorded for what has happened, never ahead of it.
CREATE FUNCTION compliance_record_rules() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NEW.occurred_on > current_date THEN
    RAISE EXCEPTION 'evidence is recorded for what has happened' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER compliance_record_rules BEFORE INSERT ON compliance_record FOR EACH ROW EXECUTE FUNCTION compliance_record_rules();

ALTER TABLE compliance_record ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_record FORCE ROW LEVEL SECURITY;
CREATE POLICY compliance_record_read ON compliance_record FOR SELECT TO tp_app USING ((SELECT app_actor_platform_permitted('compliance.manage')));
CREATE POLICY compliance_record_recorded ON compliance_record FOR INSERT TO tp_app
  WITH CHECK ((SELECT app_actor_platform_permitted('compliance.manage')) AND recorded_by = app_actor_id());
CREATE POLICY compliance_record_owner ON compliance_record FOR ALL TO tp_owner USING (true) WITH CHECK (true);

-- The restore drill's evidence rows (PRD 16, Backups and restore: "The restore job writes its evidence row"),
-- for the checklist: outcomes, times and problem counts, nothing restored.
CREATE FUNCTION console_restore_drills(at_most integer) RETURNS TABLE (
  started_at timestamptz, completed_at timestamptz, duration_ms bigint, outcome text, catalog_problems integer, error_code text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NOT coalesce(app_actor_platform_permitted('compliance.manage'), false) THEN
    RAISE EXCEPTION 'the restore drill''s evidence is the platform administrators''' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY SELECT d.started_at, d.completed_at, d.duration_ms, d.outcome, jsonb_array_length(d.catalog_problems), d.error_code
    FROM restore_drill d ORDER BY d.started_at DESC, d.id LIMIT least(greatest(coalesce(at_most, 1), 1), 100);
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- The Settings screen's reads and the pursuit defaults
-- ---------------------------------------------------------------------------------------------------

-- The practice's access log (PRD 6, Audit log: "the access report answers 'who read claim X' in one query"):
-- its events, newest first, optionally of one object, for the practice's administrators (access_log.read) in its
-- scope; who acted is named by email, whatever their organization, with the route their access rested on.
CREATE FUNCTION practice_access_log(target_practice uuid, of_type text, of_object uuid, before_at timestamptz, at_most integer)
RETURNS TABLE (event_id uuid, at timestamptz, actor_label text, via text, action text, object_type text, object_id uuid, purpose text, ticket text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NOT (practice_in_scope(target_practice) AND coalesce(app_actor_permitted(target_practice, 'access_log.read'), false)) THEN
    RAISE EXCEPTION 'the practice''s access log is its administrators''' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
    SELECT e.id, e.at,
           CASE WHEN e.actor_kind = 'system' THEN 'the platform' WHEN u.email IS NOT NULL THEN u.email ELSE 'a job of the practice' END,
           CASE WHEN s.id IS NOT NULL THEN 'support' WHEN g.id IS NOT NULL THEN 'grant' WHEN e.actor_kind = 'user' THEN 'ownership' ELSE 'system' END,
           e.action, e.object_type, e.object_id, e.purpose, s.ticket
      FROM audit_event e
      LEFT JOIN "user" u ON u.id = e.actor_id
      LEFT JOIN support_grant s ON s.id = e.grant_id
      LEFT JOIN "grant" g ON g.id = e.grant_id
     WHERE e.practice_id = target_practice
       AND (of_type IS NULL OR e.object_type = of_type)
       AND (of_object IS NULL OR e.object_id = of_object)
       AND (before_at IS NULL OR e.at < before_at)
     ORDER BY e.at DESC, e.id DESC
     LIMIT least(greatest(coalesce(at_most, 50), 1), 200);
END;
$$;

-- The grants to the practice (PRD 7, Settings: "grants and agreements"; the firm flows are milestone 12), with
-- the grantee's name, for its administrators in its scope.
CREATE FUNCTION practice_grants(target_practice uuid) RETURNS TABLE (
  grant_id uuid, grantee_name text, grantee_kind text, roles jsonb, starts_at timestamptz, ends_at timestamptz, revoked_at timestamptz, agreement_id uuid
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NOT (practice_in_scope(target_practice) AND coalesce(app_actor_permitted(target_practice, 'grant.revoke'), false)) THEN
    RAISE EXCEPTION 'the practice''s grants are its administrators''' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY SELECT g.id, o.name, o.kind, coalesce(g.scope -> 'roles', '[]'::jsonb), g.starts_at, g.ends_at, g.revoked_at, g.agreement_id
    FROM "grant" g JOIN organization o ON o.id = g.organization_id
   WHERE g.practice_id = target_practice
   ORDER BY g.revoked_at IS NOT NULL, g.ends_at DESC, g.id;
END;
$$;

-- The pursuit-cost defaults (PRD 12, Deadlines and pursuit cost: "the practice's settings (staff rate, minutes
-- per packet, minutes per follow-up)"), set by a person who works the practice's cases, as its materiality is
-- (practice_set_materiality): all three together, or none to clear them.
CREATE FUNCTION practice_set_pursuit(target uuid, staff_rate_cents text, packet_minutes integer, follow_up_minutes integer) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF app_actor_id() IS NULL OR NOT app_actor_is_person()
     OR NOT practice_in_scope(target)
     OR NOT coalesce(app_actor_permitted(target, 'case.work'), false) THEN
    RAISE EXCEPTION 'a practice''s pursuit defaults are set by a person who works its cases' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF (staff_rate_cents IS NULL) <> (packet_minutes IS NULL) OR (staff_rate_cents IS NULL) <> (follow_up_minutes IS NULL) THEN
    RAISE EXCEPTION 'the pursuit cost needs the staff rate and both times together, or none of them' USING ERRCODE = 'check_violation';
  END IF;
  IF staff_rate_cents IS NULL THEN
    UPDATE practice p SET settings = p.settings - ARRAY['staff_rate_cents_per_hour', 'minutes_per_packet', 'minutes_per_follow_up'] WHERE p.id = target;
    RETURN FOUND;
  END IF;
  IF staff_rate_cents !~ '^(0|[1-9][0-9]{0,11})$' OR packet_minutes NOT BETWEEN 0 AND 10000 OR follow_up_minutes NOT BETWEEN 0 AND 10000 THEN
    RAISE EXCEPTION 'the staff rate is integer cents an hour and each time whole minutes up to 10,000' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE practice p SET settings = p.settings || jsonb_build_object('staff_rate_cents_per_hour', staff_rate_cents, 'minutes_per_packet', packet_minutes, 'minutes_per_follow_up', follow_up_minutes)
   WHERE p.id = target;
  RETURN FOUND;
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------------------------------

REVOKE ALL ON prospect_request, invitation, terms_version, terms_acceptance, agreement_event, support_ticket, rate_limit_counter,
  status_component, status_incident, status_incident_update, compliance_record FROM PUBLIC;

GRANT SELECT ON prospect_request TO tp_app;
GRANT UPDATE (status, organization_id, reviewed_by) ON prospect_request TO tp_app;
GRANT SELECT ON invitation TO tp_app;
GRANT SELECT ON terms_version TO tp_app;
GRANT INSERT (id, version, document_ref, sha256, published_by) ON terms_version TO tp_app;
GRANT SELECT ON terms_acceptance TO tp_app;
GRANT INSERT (id, user_id, terms_version_id, request_id) ON terms_acceptance TO tp_app;
GRANT SELECT ON support_ticket TO tp_app;
GRANT INSERT (id, requester_id, screen, category, subject, message) ON support_ticket TO tp_app;
GRANT UPDATE (status, status_changed_by) ON support_ticket TO tp_app;
GRANT SELECT ON status_component, status_incident, status_incident_update TO tp_app;
GRANT UPDATE (status, changed_by) ON status_component TO tp_app;
GRANT INSERT (id, title, impact, components, created_by) ON status_incident TO tp_app;
GRANT INSERT (id, incident_id, status, message, posted_by) ON status_incident_update TO tp_app;
GRANT SELECT ON compliance_record TO tp_app;
GRANT INSERT (id, kind, subject, occurred_on, document_ref, sha256, recorded_by) ON compliance_record TO tp_app;

REVOKE ALL ON FUNCTION prospect_payers_valid(text[]), prospect_request_fixed(), submit_prospect_request(text, text, text, integer, text[], text), membership_invitation(), user_accepts_invitations(),
  invitation_rules(), resend_invitation(uuid), invitation_expired(uuid), terms_published_now(), terms_accepted_now(), current_terms_version(), app_actor_terms_required(),
  record_esigned_agreement(text, text, uuid, uuid, text, text, timestamptz, text, text, text), support_ticket_rules(), rate_limit_take(text, text, integer, integer),
  maintenance_on(), status_component_rules(), status_incident_opened(), status_incident_update_moves(), public_status_components(), public_status_incidents(timestamptz),
  compliance_record_rules(), console_restore_drills(integer), practice_access_log(uuid, text, uuid, timestamptz, integer), practice_grants(uuid),
  practice_set_pursuit(uuid, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION submit_prospect_request(text, text, text, integer, text[], text), resend_invitation(uuid), invitation_expired(uuid), current_terms_version(),
  app_actor_terms_required(), record_esigned_agreement(text, text, uuid, uuid, text, text, timestamptz, text, text, text), rate_limit_take(text, text, integer, integer),
  maintenance_on(), public_status_components(), public_status_incidents(timestamptz), console_restore_drills(integer),
  practice_access_log(uuid, text, uuid, timestamptz, integer), practice_grants(uuid), practice_set_pursuit(uuid, text, integer, integer) TO tp_app;

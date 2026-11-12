-- The hardware-key registry, its two-person removal, registration after a removal, the provider sign-out's outbox and
-- the mark at a membership's end (LANES.md Queues item 37; test matrix SGN-19 to SGN-27, SEC-25 to SEC-27, JOB-06 to
-- JOB-08). After migration 20261114090000. Decisions: docs/adr/0095 (new); and docs/adr/0093, 0094, 0091, 0083, 0049
-- and 0009.
--
-- What it adds:
-- - hardware_key: one row a registered key (the SHA-256 of its credential ID and its public key), one live key an
--   account, a removed credential never registered again on any account.
-- - hardware_key_removal: a removal of every key of an account, requested by one platform administrator and confirmed
--   by another inside 24 hours, neither the account; and, on a confirmed row, the opening of the account's next
--   registration with a one-time code (its SHA-256 only), for one hour, five tries.
-- - hardware_key_notice: the member's email for a removal, an opening and the registration after a removal (the shape
--   of password_notice, docs/adr/0091).
-- - provider_sign_out: the outbox of sign-outs owed at the identity provider, one row for each ended membership,
--   recorded reset and confirmed removal, written in the cause's own transaction and drained by a platform job.
-- - user_session.key_credential_sha256 (bytea, nullable): the key a key session was opened with; its CHECK
--   user_session_key_digest is added NOT VALID and validated by the next migration.
-- - mail_send_kind and mail_send_stream_kind admit hardware_keys_removed (the transactional stream), replaced NOT
--   VALID and validated by the next migration.
-- - Triggers: user_session_hardware_key (every session insert, under the account's row lock: a key session opens only
--   for a live key of its account; the previous image's key session, which carries no digest, only for an account the
--   registry never touched; a code session never for an account whose registration is closed);
--   membership_end_marks_account (an end moves the account's mark and ends its sessions, whoever ends it);
--   membership_removal_target_holds (the account of an open removal request changes no internal membership);
--   audit_event_provider_sign_out (queues the sign-out; membership_ended is recorded only for a membership this
--   transaction ended and did not create); hardware_key_is_final and hardware_key_removal_is_final.
-- - Functions for the web (tp_app): hardware_key_record, sign_in_hardware_keys, sign_in_key_refused,
--   hardware_key_removal_request, _confirm and _cancel, hardware_key_removals, hardware_key_registration_open and
--   hardware_key_registration_judge. For the platform jobs (tp_operator): operator_provider_sign_out_claim, _done,
--   _failed and _reported, operator_provider_sign_outs_overdue and _expire, operator_key_removals_expire, and the
--   notice's five (operator_key_notices_due, operator_key_notice_claim, _sent and _failed, operator_key_notices_stale).
--   Granted to no role (called by the definers here, as their owner): account_removes_keys, actor_key_session,
--   account_key_registration_closed, hardware_key_opening_usable, hardware_key_notice_report_undelivered.
-- - Replaced in place, signature, owner and grant unchanged: operator_record_mail_event (one lock and one branch added:
--   an event of a hardware_keys_removed message moves its notice as it moves a password notice) and
--   operator_mail_expire (one statement added: the key notices expire with the password notices).
-- - audit_event_record (the application role's INSERT policy) is recreated with nine more reserved actions.
--   hardware_key_registered is not reserved yet: the previous image writes it during the deploy.
--
-- Tables touched: four new platform tables (no practice_id: they describe an account, hold no PHI and no contact
-- detail, and are closed to both runtime roles: FORCE ROW LEVEL SECURITY, one policy for tp_owner, no privilege);
-- user_session (one nullable column, no default: catalog only; one NOT VALID CHECK: no scan; one BEFORE INSERT
-- trigger; one column grant); membership (two triggers); audit_event (one AFTER INSERT trigger; one policy
-- recreated); mail_send (two CHECKs replaced NOT VALID: no scan). No PHI table, no ledger table, no rule table and no
-- pricing table is touched; no function sets app.practice_ids or app.actor_id; none is LEAKPROOF; none builds SQL.
-- Every function is SECURITY DEFINER, owned by tp_owner, with search_path pg_catalog, public, pg_temp, and revoked
-- from PUBLIC. Runs as tp_owner.
--
-- The locks (docs/adr/0095; docs/adr/0083's loop): "user" and membership SHARE ROW EXCLUSIVE (foreign keys and
-- triggers; readers and row writers of other tables are not refused, as in migration 20261111090000), user_session,
-- audit_event and mail_send ACCESS EXCLUSIVE (a column, a policy, two constraints), taken together with NOWAIT in one
-- subtransaction, once a second, up to 300 tries. A refused try holds and queues nothing. A try is refused by any
-- open transaction that has touched user_session, audit_event or mail_send, or written "user" or membership: deploy
-- off-hours with no reconcile queued or running (docs/runbooks/deploy-and-rollback.md). If no moment comes in five
-- minutes it fails, before any service moves, having changed nothing.
--
-- Safe with the previous image running (add only; docs/adr/0009, docs/adr/0049): every object is added. The previous
-- image's key session carries no digest and is let through only for an account the registry never touched; its End
-- membership writes ends_at = now() and membership_ended in one transaction, so the mark moves and the sign-out is
-- queued (its own call after the commit is a second, harmless one); its registration records no row, so that key is
-- refused by the new image and registered again. Rollback: the schema needs none, but under the previous image no
-- account that has a registry row can sign in until the image rolls forward (it fails closed; the deploy runbook).

-- ---------------------------------------------------------------------------------------------------
-- Preflight: nothing this migration creates exists, and what it replaces is what its design read
-- ---------------------------------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.hardware_key') IS NOT NULL OR to_regclass('public.hardware_key_removal') IS NOT NULL
     OR to_regclass('public.hardware_key_notice') IS NOT NULL OR to_regclass('public.provider_sign_out') IS NOT NULL THEN
    RAISE EXCEPTION 'a table of the key registry already exists; this migration creates them' USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = 'public.user_session'::regclass AND a.attname = 'key_credential_sha256' AND NOT a.attisdropped) THEN
    RAISE EXCEPTION 'user_session.key_credential_sha256 already exists; this migration creates it' USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
              AND (p.proname LIKE 'hardware\_key\_%' OR p.proname LIKE 'operator\_provider\_sign\_out%' OR p.proname LIKE 'operator\_key\_%'
                   OR p.proname IN ('sign_in_hardware_keys', 'sign_in_key_refused', 'account_removes_keys', 'actor_key_session',
                                    'account_key_registration_closed', 'user_session_hardware_key', 'membership_end_marks_account',
                                    'membership_removal_target_holds', 'audit_event_provider_sign_out'))) THEN
    RAISE EXCEPTION 'a function of the key registry already exists; this migration creates them' USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- The two functions replaced whole: each stored body must be the one this migration was written on (pg_proc.prosrc,
  -- by SHA-256, as migration 20261112090000's preflight compares), or this migration refuses until it is rebased.
  IF (SELECT encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') FROM pg_proc p
       WHERE p.oid = to_regprocedure('public.operator_record_mail_event(text, text, text, timestamptz, timestamptz, text, text, uuid, uuid, uuid, text, text, text, text)'))
     IS DISTINCT FROM 'd0c75c27551b0f52c0301d442d546b9ec3e1120d6d1f493567332ed6a57f25cd'
     OR (SELECT encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') FROM pg_proc p WHERE p.oid = to_regprocedure('public.operator_mail_expire(integer)'))
     IS DISTINCT FROM '1483c2862d633565617c898065982b6f3f13b3ea84c1822df11d292a79d3bc4a' THEN
    RAISE EXCEPTION 'operator_record_mail_event() or operator_mail_expire(integer) is not the body of migration 20261111090000 that this migration replaces; rebase this migration on its latest body'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF (SELECT encode(sha256(convert_to(p.with_check, 'UTF8')), 'hex') FROM pg_policies p
       WHERE p.schemaname = 'public' AND p.tablename = 'audit_event' AND p.policyname = 'audit_event_record')
     IS DISTINCT FROM '75695018e5d66afba02bdc4578e5131bd380292ae5f9338ba2af2fb5c1982184' THEN
    RAISE EXCEPTION 'audit_event_record is not the policy of migration 20261111090000 that this migration replaces; rebase this migration on its latest text'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF (SELECT encode(sha256(convert_to(string_agg(c.conname || ' ' || pg_get_constraintdef(c.oid), E'\n' ORDER BY c.conname), 'UTF8')), 'hex')
        FROM pg_constraint c WHERE c.conrelid = 'public.mail_send'::regclass AND c.conname IN ('mail_send_kind', 'mail_send_stream_kind'))
     IS DISTINCT FROM '8412f10401c6cc278918eb08f3a555e6bd08a3641c9bf9f553903afcc919880f' THEN
    RAISE EXCEPTION 'mail_send_kind or mail_send_stream_kind is not the constraint of migration 20261111090000 that this migration replaces; rebase this migration on its latest list'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- The outbox and the mark share the password notice's guard (docs/adr/0091 D3) and the mark's trigger (docs/adr/0093).
  IF (SELECT replace(pg_get_triggerdef(t.oid), 'EXECUTE FUNCTION public.', 'EXECUTE FUNCTION ') FROM pg_trigger t WHERE t.tgrelid = 'public.audit_event'::regclass AND t.tgname = 'audit_event_sign_in_not_before' AND NOT t.tgisinternal)
     IS DISTINCT FROM 'CREATE TRIGGER audit_event_sign_in_not_before AFTER INSERT ON public.audit_event FOR EACH ROW WHEN (((new.action = ANY (ARRAY[''password_reset_completed''::text, ''password_reset_outcome_unknown''::text])) AND (new.actor_kind = ''user''::text) AND (new.object_type = ''user''::text) AND (new.object_id = new.actor_id))) EXECUTE FUNCTION audit_event_sign_in_not_before()' THEN
    RAISE EXCEPTION 'audit_event_sign_in_not_before is not the trigger of migration 20261112090000 whose guard this migration shares; rebase this migration on its latest guard'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- The table locks, without a queue (docs/adr/0095; docs/adr/0083)
-- ---------------------------------------------------------------------------------------------------

-- Each try takes the five locks in one subtransaction with NOWAIT: a refused try releases what it took and queues
-- nobody, so no request waits behind this migration. Held to the end of the migration.
DO $$
BEGIN
  FOR attempt IN 1..300 LOOP
    BEGIN
      LOCK TABLE "user" IN SHARE ROW EXCLUSIVE MODE NOWAIT;
      LOCK TABLE membership IN SHARE ROW EXCLUSIVE MODE NOWAIT;
      LOCK TABLE user_session IN ACCESS EXCLUSIVE MODE NOWAIT;
      LOCK TABLE audit_event IN ACCESS EXCLUSIVE MODE NOWAIT;
      LOCK TABLE mail_send IN ACCESS EXCLUSIVE MODE NOWAIT;
      RETURN;
    EXCEPTION WHEN lock_not_available THEN
      PERFORM pg_sleep(1);
    END;
  END LOOP;
  RAISE EXCEPTION '"user", membership, user_session, audit_event or mail_send stayed in use for five minutes; run the deploy again (docs/adr/0095)' USING ERRCODE = 'lock_not_available';
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- 1. The tables (docs/adr/0095)
-- ---------------------------------------------------------------------------------------------------

-- A removal of every key of user_id. requested, then exactly one of confirmed, cancelled, expired. The CHECKs hold what
-- the functions decided: two people (the confirmer is not the requester), neither the account, inside 24 hours.
-- address_sha256 is SHA-256 of the removal's ID, a colon and the account's lower-cased address as it was when the
-- removal was requested: the notices of this removal are sent only while the address is still that one (the
-- application role can update "user".email at the database, and "user".updated_at moves with every sign-in, so it
-- cannot answer that). Salted by the row's ID, it matches no other row and names no address.
-- The registration_* columns are the opening: null together until a platform administrator opens the account's next
-- registration, on a confirmed row only, for one hour, with the SHA-256 of a one-time code and a count of wrong tries.
CREATE TABLE hardware_key_removal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES "user" (id),
  requested_by uuid NOT NULL REFERENCES "user" (id),
  requested_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  request_id text CONSTRAINT hardware_key_removal_request_id CHECK (request_id ~ '^[A-Za-z0-9._:-]{1,128}$'),
  address_sha256 bytea NOT NULL CONSTRAINT hardware_key_removal_address CHECK (octet_length(address_sha256) = 32),
  state text NOT NULL DEFAULT 'requested' CONSTRAINT hardware_key_removal_state CHECK (state IN ('requested', 'confirmed', 'cancelled', 'expired')),
  decided_by uuid REFERENCES "user" (id),
  decided_at timestamptz,
  decided_request_id text CONSTRAINT hardware_key_removal_decided_request_id CHECK (decided_request_id ~ '^[A-Za-z0-9._:-]{1,128}$'),
  keys_removed integer,
  sessions_ended integer,
  registration_opened_by uuid REFERENCES "user" (id),
  registration_opened_at timestamptz,
  registration_open_until timestamptz,
  registration_code_sha256 bytea,
  registration_code_tries smallint NOT NULL DEFAULT 0,
  registration_opened_request_id text CONSTRAINT hardware_key_removal_opened_request_id CHECK (registration_opened_request_id ~ '^[A-Za-z0-9._:-]{1,128}$'),
  CONSTRAINT hardware_key_removal_expiry CHECK (expires_at = requested_at + interval '24 hours'),
  CONSTRAINT hardware_key_removal_not_own_account CHECK (requested_by <> user_id AND (decided_by IS NULL OR decided_by <> user_id)),
  CONSTRAINT hardware_key_removal_two_people CHECK (state <> 'confirmed' OR (decided_by IS NOT NULL AND decided_by <> requested_by)),
  CONSTRAINT hardware_key_removal_in_time CHECK (state <> 'confirmed' OR decided_at < expires_at),
  CONSTRAINT hardware_key_removal_decided CHECK (
        (state = 'requested') = (decided_at IS NULL)
    AND (state IN ('confirmed', 'cancelled')) = (decided_by IS NOT NULL)
    AND (state <> 'expired' OR decided_at >= expires_at)
    AND (decided_at IS NULL OR decided_at >= requested_at)),
  CONSTRAINT hardware_key_removal_with_counts CHECK (
        (state = 'confirmed') = (keys_removed IS NOT NULL) AND (keys_removed IS NULL) = (sessions_ended IS NULL)
    AND (keys_removed IS NULL OR (keys_removed >= 0 AND sessions_ended >= 0))),
  CONSTRAINT hardware_key_removal_opening CHECK (
        (registration_opened_at IS NULL) = (registration_opened_by IS NULL)
    AND (registration_opened_at IS NULL) = (registration_open_until IS NULL)
    AND (registration_opened_at IS NULL) = (registration_code_sha256 IS NULL)
    AND registration_code_tries BETWEEN 0 AND 5
    AND (registration_opened_at IS NOT NULL OR (registration_code_tries = 0 AND registration_opened_request_id IS NULL))
    AND (registration_opened_at IS NULL
         OR (state = 'confirmed' AND registration_open_until = registration_opened_at + interval '1 hour'
             AND registration_opened_at >= decided_at AND octet_length(registration_code_sha256) = 32))),
  CONSTRAINT hardware_key_removal_opener_not_account CHECK (registration_opened_by <> user_id)
);
-- One open request an account; the functions read an account's removals by state.
CREATE UNIQUE INDEX hardware_key_removal_open_once ON hardware_key_removal (user_id) WHERE state = 'requested';
CREATE INDEX hardware_key_removal_by_user ON hardware_key_removal (user_id, state);
-- The expiry sweep reads only open requests.
CREATE INDEX hardware_key_removal_open_by_expiry ON hardware_key_removal (expires_at) WHERE state = 'requested';

-- One row a registered key. The digest, not the credential ID: nothing reads the ID back, and a digest in a session
-- row or a dump names no authenticator. The public key is public by definition. A removed row stays for good, so its
-- credential is never registered again on any account (hardware_key_credential_once covers removed rows too).
CREATE TABLE hardware_key (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES "user" (id),
  credential_sha256 bytea NOT NULL CONSTRAINT hardware_key_credential_once UNIQUE
    CONSTRAINT hardware_key_credential CHECK (octet_length(credential_sha256) = 32),
  public_key bytea NOT NULL CONSTRAINT hardware_key_public_key CHECK (octet_length(public_key) BETWEEN 32 AND 1024),
  registered_at timestamptz NOT NULL,
  registered_request_id text CONSTRAINT hardware_key_request_id CHECK (registered_request_id ~ '^[A-Za-z0-9._:-]{1,128}$'),
  removed_at timestamptz,
  removal_id uuid REFERENCES hardware_key_removal (id),
  CONSTRAINT hardware_key_removed CHECK ((removed_at IS NULL) = (removal_id IS NULL))
);
-- One live key an account (a backup key is a later feature with its own function).
CREATE UNIQUE INDEX hardware_key_one_live ON hardware_key (user_id) WHERE removed_at IS NULL;
CREATE INDEX hardware_key_by_user ON hardware_key (user_id);
CREATE INDEX hardware_key_by_removal ON hardware_key (removal_id) WHERE removal_id IS NOT NULL;

-- The member's email about a removal: removed (at the confirmation), registration_opened (at the first opening) and
-- registered_after_removal (at the registration that consumes an opening). One of each kind a removal. The shape and
-- the states of password_notice (docs/adr/0091 D4); event_at is when the thing the email reports happened. The address
-- is read by the claim at send time and stored nowhere here.
CREATE TABLE hardware_key_notice (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES "user" (id),
  kind text NOT NULL CONSTRAINT hardware_key_notice_kind CHECK (kind IN ('removed', 'registration_opened', 'registered_after_removal')),
  removal_id uuid NOT NULL REFERENCES hardware_key_removal (id),
  event_at timestamptz NOT NULL,
  state text NOT NULL DEFAULT 'pending' CONSTRAINT hardware_key_notice_state CHECK (state IN ('pending', 'sent', 'delivered', 'undelivered', 'failed')),
  attempts smallint NOT NULL DEFAULT 0 CONSTRAINT hardware_key_notice_attempts CHECK (attempts BETWEEN 0 AND 5),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  ses_message_id text UNIQUE CONSTRAINT hardware_key_notice_message_id CHECK (ses_message_id ~ '^[A-Za-z0-9-]{20,100}$'),
  error_code text CONSTRAINT hardware_key_notice_error_code CHECK (error_code ~ '^[A-Za-z]{1,64}$'),
  sent_at timestamptz,
  undelivered_reported_at timestamptz,
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hardware_key_notice_once UNIQUE (removal_id, kind),
  CONSTRAINT hardware_key_notice_sent CHECK ((ses_message_id IS NULL) = (state IN ('pending', 'failed')) AND (ses_message_id IS NULL) = (sent_at IS NULL)),
  CONSTRAINT hardware_key_notice_failed CHECK ((state = 'failed') = (error_code IS NOT NULL)),
  CONSTRAINT hardware_key_notice_reported CHECK (undelivered_reported_at IS NULL OR state IN ('undelivered', 'failed')),
  CONSTRAINT hardware_key_notice_expiry_window CHECK (expires_at > event_at AND expires_at <= event_at + interval '91 days')
);
CREATE INDEX hardware_key_notice_pending ON hardware_key_notice (next_attempt_at) WHERE state = 'pending';
CREATE INDEX hardware_key_notice_by_expiry ON hardware_key_notice (expires_at);
CREATE INDEX hardware_key_notice_by_user ON hardware_key_notice (user_id);
CREATE TRIGGER hardware_key_notice_updated_at BEFORE UPDATE ON hardware_key_notice FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- The outbox: a sign-out owed at the identity provider. No subject and no address is stored: the claim reads the
-- subject when it hands the row to the job. No foreign key to audit_event (append-only, guarded by its own triggers;
-- a key would add a lock to every cause's insert for nothing). The try is counted at the claim, which never claims a
-- row at 30, so the counter cannot pass its CHECK.
CREATE TABLE provider_sign_out (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES "user" (id),
  reason text NOT NULL CONSTRAINT provider_sign_out_reason
    CHECK (reason IN ('membership_ended', 'password_reset_completed', 'password_reset_outcome_unknown', 'hardware_keys_removed')),
  source_event_id uuid NOT NULL CONSTRAINT provider_sign_out_once UNIQUE,
  request_id text CONSTRAINT provider_sign_out_request_id CHECK (request_id ~ '^[A-Za-z0-9._:-]{1,128}$'),
  queued_at timestamptz NOT NULL,
  attempts smallint NOT NULL DEFAULT 0 CONSTRAINT provider_sign_out_attempts CHECK (attempts BETWEEN 0 AND 30),
  next_attempt_at timestamptz NOT NULL,
  leased_until timestamptz,
  done_at timestamptz,
  late_at timestamptz,
  gave_up_at timestamptz,
  late_reported_at timestamptz,
  gave_up_reported_at timestamptz,
  last_error_code text CONSTRAINT provider_sign_out_error_code CHECK (last_error_code ~ '^[A-Za-z][A-Za-z0-9]{0,63}$'),
  CONSTRAINT provider_sign_out_reported CHECK ((late_reported_at IS NULL OR late_at IS NOT NULL) AND (gave_up_reported_at IS NULL OR gave_up_at IS NOT NULL))
);
CREATE INDEX provider_sign_out_due ON provider_sign_out (next_attempt_at) WHERE done_at IS NULL AND gave_up_at IS NULL;
CREATE INDEX provider_sign_out_by_user ON provider_sign_out (user_id);

-- Closed to both runtime roles at the table: one policy, for the owner; no policy names tp_app or tp_operator, so even
-- a stray grant would show them nothing. Every read and write goes through a definer below that checks the actor.
ALTER TABLE hardware_key_removal ENABLE ROW LEVEL SECURITY;
ALTER TABLE hardware_key_removal FORCE ROW LEVEL SECURITY;
CREATE POLICY hardware_key_removal_owner ON hardware_key_removal FOR ALL TO tp_owner USING (true) WITH CHECK (true);
ALTER TABLE hardware_key ENABLE ROW LEVEL SECURITY;
ALTER TABLE hardware_key FORCE ROW LEVEL SECURITY;
CREATE POLICY hardware_key_owner ON hardware_key FOR ALL TO tp_owner USING (true) WITH CHECK (true);
ALTER TABLE hardware_key_notice ENABLE ROW LEVEL SECURITY;
ALTER TABLE hardware_key_notice FORCE ROW LEVEL SECURITY;
CREATE POLICY hardware_key_notice_owner ON hardware_key_notice FOR ALL TO tp_owner USING (true) WITH CHECK (true);
ALTER TABLE provider_sign_out ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_sign_out FORCE ROW LEVEL SECURITY;
CREATE POLICY provider_sign_out_owner ON provider_sign_out FOR ALL TO tp_owner USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------------------------------
-- 2. Existing tables: the session's key, and the mail kind
-- ---------------------------------------------------------------------------------------------------

-- Nullable, no default: a catalog-only change. NOT VALID: no scan here; the CHECK binds every new row at once and is
-- validated by the next migration, after this one's locks are released.
ALTER TABLE user_session ADD COLUMN key_credential_sha256 bytea;
ALTER TABLE user_session ADD CONSTRAINT user_session_key_digest
  CHECK (key_credential_sha256 IS NULL OR (mfa_method = 'webauthn' AND octet_length(key_credential_sha256) = 32)) NOT VALID;

-- The literals keep MAIL_KINDS's and MAIL_STREAM_KINDS's order (packages/db/src/schema/operations.ts). NOT VALID: no
-- scan; every old row satisfies the wider list, and every new row is checked.
ALTER TABLE mail_send
  DROP CONSTRAINT mail_send_kind,
  ADD CONSTRAINT mail_send_kind CHECK (kind IN ('cognito', 'digest', 'password_changed', 'hardware_keys_removed', 'dunning', 'support_grant_opened',
    'support_grant_closed', 'screening_result', 'screening_failed', 'screening_reminder', 'screening_withdrawal', 'probe')) NOT VALID,
  DROP CONSTRAINT mail_send_stream_kind,
  ADD CONSTRAINT mail_send_stream_kind CHECK (
       (stream = 'transactional' AND kind IN ('cognito', 'digest', 'password_changed', 'hardware_keys_removed', 'probe'))
    OR (stream = 'notices' AND kind IN ('support_grant_opened', 'support_grant_closed', 'dunning', 'probe'))
    OR (stream = 'screening' AND kind IN ('screening_result', 'screening_failed', 'screening_reminder', 'screening_withdrawal', 'probe'))) NOT VALID;

-- ---------------------------------------------------------------------------------------------------
-- 3. Finality (the pattern of user_session_end_is_final)
-- ---------------------------------------------------------------------------------------------------

-- A key row is never deleted; only removed_at and removal_id change, once, from null.
CREATE FUNCTION hardware_key_is_final() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'a hardware key''s record is never deleted' USING ERRCODE = 'check_violation', CONSTRAINT = 'hardware_key_is_final';
  END IF;
  IF (NEW.id, NEW.user_id, NEW.credential_sha256, NEW.public_key, NEW.registered_at, NEW.registered_request_id)
       IS DISTINCT FROM (OLD.id, OLD.user_id, OLD.credential_sha256, OLD.public_key, OLD.registered_at, OLD.registered_request_id)
     OR (OLD.removed_at IS NOT NULL AND (NEW.removed_at, NEW.removal_id) IS DISTINCT FROM (OLD.removed_at, OLD.removal_id)) THEN
    RAISE EXCEPTION 'a hardware key''s record changes only by its removal, once' USING ERRCODE = 'check_violation', CONSTRAINT = 'hardware_key_is_final';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER hardware_key_is_final BEFORE UPDATE OR DELETE ON hardware_key FOR EACH ROW EXECUTE FUNCTION hardware_key_is_final();

-- A removal is never deleted. A requested row is decided once (its request never changes); a confirmed row changes
-- only by its opening (set, replaced, or its tries counted up); a cancelled or expired row never changes.
CREATE FUNCTION hardware_key_removal_is_final() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'a key removal''s record is never deleted' USING ERRCODE = 'check_violation', CONSTRAINT = 'hardware_key_removal_is_final';
  END IF;
  IF (NEW.id, NEW.user_id, NEW.requested_by, NEW.requested_at, NEW.expires_at, NEW.request_id, NEW.address_sha256)
       IS DISTINCT FROM (OLD.id, OLD.user_id, OLD.requested_by, OLD.requested_at, OLD.expires_at, OLD.request_id, OLD.address_sha256) THEN
    RAISE EXCEPTION 'a key removal''s request never changes' USING ERRCODE = 'check_violation', CONSTRAINT = 'hardware_key_removal_is_final';
  END IF;
  IF OLD.state = 'requested' THEN
    RETURN NEW;
  END IF;
  IF (NEW.state, NEW.decided_by, NEW.decided_at, NEW.decided_request_id, NEW.keys_removed, NEW.sessions_ended)
       IS DISTINCT FROM (OLD.state, OLD.decided_by, OLD.decided_at, OLD.decided_request_id, OLD.keys_removed, OLD.sessions_ended) THEN
    RAISE EXCEPTION 'a decided key removal stays decided' USING ERRCODE = 'check_violation', CONSTRAINT = 'hardware_key_removal_is_final';
  END IF;
  IF OLD.state <> 'confirmed'
     AND (NEW.registration_opened_by, NEW.registration_opened_at, NEW.registration_open_until, NEW.registration_code_sha256,
          NEW.registration_code_tries, NEW.registration_opened_request_id)
         IS DISTINCT FROM (OLD.registration_opened_by, OLD.registration_opened_at, OLD.registration_open_until, OLD.registration_code_sha256,
                           OLD.registration_code_tries, OLD.registration_opened_request_id) THEN
    RAISE EXCEPTION 'only a confirmed key removal opens a registration' USING ERRCODE = 'check_violation', CONSTRAINT = 'hardware_key_removal_is_final';
  END IF;
  -- On a confirmed row: the same opening may only count its tries up; a new opening is later than the one it replaces.
  IF OLD.registration_opened_at IS NOT NULL
     AND (NEW.registration_opened_at IS NULL OR NEW.registration_opened_at < OLD.registration_opened_at
          OR (NEW.registration_opened_at = OLD.registration_opened_at
              AND ((NEW.registration_opened_by, NEW.registration_open_until, NEW.registration_code_sha256, NEW.registration_opened_request_id)
                     IS DISTINCT FROM (OLD.registration_opened_by, OLD.registration_open_until, OLD.registration_code_sha256, OLD.registration_opened_request_id)
                   OR NEW.registration_code_tries < OLD.registration_code_tries))) THEN
    RAISE EXCEPTION 'an opening is replaced only by a later one, and its tries only count up' USING ERRCODE = 'check_violation', CONSTRAINT = 'hardware_key_removal_is_final';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER hardware_key_removal_is_final BEFORE UPDATE OR DELETE ON hardware_key_removal FOR EACH ROW EXECUTE FUNCTION hardware_key_removal_is_final();

-- ---------------------------------------------------------------------------------------------------
-- 4. The predicates (granted to no role: only the definers here call them, as their owner)
-- ---------------------------------------------------------------------------------------------------

-- Who takes part in a removal or an opening, for the actor and for the requester at confirmation alike: an active
-- account with a second factor (what app_actor_memberships() requires of an actor) that holds a live platform_admin
-- membership in an internal organization whose role permits organization.manage, more than seven days old, with no
-- role_escalation recorded for that membership in the last seven days. The second half: a role can be changed in
-- place at the database, so created_at alone does not measure time in the role; membership_security_events writes
-- that event on every insert of, and change to, an administrator's role.
CREATE FUNCTION account_removes_keys(target uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1
      FROM "user" u
      JOIN membership m ON m.user_id = u.id
      JOIN organization o ON o.id = m.organization_id
     WHERE u.id = target AND u.status = 'active' AND u.mfa_enrolled
       AND o.kind = 'internal' AND m.role = 'platform_admin'
       AND (m.ends_at IS NULL OR m.ends_at > now())
       AND roles_permit(ARRAY[m.role], 'organization.manage')
       AND m.created_at < now() - interval '7 days'
       AND NOT EXISTS (
         SELECT 1 FROM audit_event e
          WHERE e.object_type = 'membership' AND e.object_id = m.id AND e.action = 'security_event' AND e.actor_kind = 'system'
            AND e.purpose = 'role_escalation' AND e.at > now() - interval '7 days'))
$$;

-- The acting session, not any session of the account: the actor's own, live, opened with a hardware key in the last 15
-- minutes, carrying the digest of a live registered key of the actor; and when the actor's own keys were ever removed,
-- that key registered more than 24 hours ago (a key registered minutes after a removal does not act at once). The
-- route fills acting_session from the request's resolved session; the application role is trusted for it exactly as
-- for the actor. The previous image's key session carries no digest and never passes.
CREATE FUNCTION actor_key_session(acting_session uuid) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1
      FROM user_session s
      JOIN hardware_key k ON k.user_id = s.user_id AND k.credential_sha256 = s.key_credential_sha256 AND k.removed_at IS NULL
     WHERE s.id = acting_session AND s.user_id = app_actor_id()
       AND s.ended_at IS NULL AND s.expires_at > clock_timestamp()
       AND s.mfa_method = 'webauthn' AND s.started_at > clock_timestamp() - interval '15 minutes'
       AND (k.registered_at < clock_timestamp() - interval '24 hours'
            OR NOT EXISTS (SELECT 1 FROM hardware_key_removal r WHERE r.user_id = s.user_id AND r.state = 'confirmed')))
$$;

-- Closed is derived, never stored: the account's latest confirmed removal has no key of the account registered after
-- it. An account with no confirmed removal is not closed (the deploy, a first enrolment); a removal confirmed with
-- zero keys closes too.
CREATE FUNCTION account_key_registration_closed(target uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT coalesce((
    SELECT NOT EXISTS (SELECT 1 FROM hardware_key k WHERE k.user_id = r.user_id AND k.registered_at > r.decided_at)
      FROM hardware_key_removal r
     WHERE r.user_id = target AND r.state = 'confirmed'
     ORDER BY r.decided_at DESC, r.id DESC
     LIMIT 1), false)
$$;

-- The removal whose opening is usable for the account at the time given, or NULL: the account's latest confirmed
-- removal, the account closed, the hour not over, fewer than five wrong tries, and opened after the account's mark, so
-- every mover of the mark (a later confirmation, End membership, a reset) closes it with no second statement.
CREATE FUNCTION hardware_key_opening_usable(target uuid, at timestamptz) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT latest.id
    FROM (SELECT r.* FROM hardware_key_removal r WHERE r.user_id = target AND r.state = 'confirmed' ORDER BY r.decided_at DESC, r.id DESC LIMIT 1) latest
    JOIN "user" u ON u.id = latest.user_id
   WHERE account_key_registration_closed(target)
     AND latest.registration_opened_at IS NOT NULL AND latest.registration_open_until > at AND latest.registration_code_tries < 5
     AND u.sign_in_not_before IS NOT NULL AND latest.registration_opened_at > u.sign_in_not_before
$$;

-- ---------------------------------------------------------------------------------------------------
-- 5. The session insert (docs/adr/0095; it fires before user_session_sign_in_not_before, by name)
-- ---------------------------------------------------------------------------------------------------

-- Every insert, under the account's row lock (the one user_session_sign_in_not_before takes): a confirmation holds
-- that lock while it removes the keys and ends the sessions, so either the session's transaction is first and the
-- confirmation ends it, or the confirmation is first and this insert reads the removal and is refused. There is no
-- moment at which a live session rests on a removed key, so no request looks its key up again.
-- A key session with a digest: a live key of this account, or refused. A digest that is not 32 bytes is left to the
-- CHECK user_session_key_digest, which names it. A key session without a digest is the previous image's insert (a
-- rolling deploy, a rollback): refused once the registry has touched the account, otherwise let through as before.
-- Any other session: refused when the account's registration is closed, whatever hardware_key_required says (one
-- platform administrator can change that column at the database).
CREATE FUNCTION user_session_hardware_key() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  PERFORM 1 FROM "user" u WHERE u.id = NEW.user_id FOR NO KEY UPDATE;
  IF NEW.mfa_method = 'webauthn' THEN
    IF NEW.key_credential_sha256 IS NOT NULL THEN
      IF octet_length(NEW.key_credential_sha256) = 32
         AND NOT EXISTS (SELECT 1 FROM hardware_key k
                          WHERE k.user_id = NEW.user_id AND k.credential_sha256 = NEW.key_credential_sha256 AND k.removed_at IS NULL) THEN
        RAISE EXCEPTION 'a key session opens only for a registered hardware key of its account'
          USING ERRCODE = 'check_violation', CONSTRAINT = 'user_session_hardware_key_live';
      END IF;
    ELSIF EXISTS (SELECT 1 FROM hardware_key k WHERE k.user_id = NEW.user_id)
          OR EXISTS (SELECT 1 FROM hardware_key_removal r WHERE r.user_id = NEW.user_id AND r.state = 'confirmed') THEN
      RAISE EXCEPTION 'a key session of an account in the key registry names its key'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'user_session_hardware_key_live';
    END IF;
  ELSIF account_key_registration_closed(NEW.user_id) THEN
    RAISE EXCEPTION 'an account whose hardware keys were removed opens no session until a new key is registered'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'user_session_key_registration_closed';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER user_session_hardware_key BEFORE INSERT ON user_session FOR EACH ROW EXECUTE FUNCTION user_session_hardware_key();

-- ---------------------------------------------------------------------------------------------------
-- 6. A membership's end, and the target of an open request (docs/adr/0095)
-- ---------------------------------------------------------------------------------------------------

-- Whoever ends a membership, in that transaction: the account's mark moves to the database's clock (never back; the
-- UPDATE takes the account's row before any session row, docs/adr/0093 D2) and every open session of the account
-- ends. The sweep is a new statement, so at READ COMMITTED it ends every session committed before it, and a session
-- insert waits on the account's lock and then reads the moved mark; at REPEATABLE READ or above it would read an old
-- snapshot, so the function refuses. A membership that lapses by a future ends_at fires nothing (no statement runs
-- at that moment; no route writes a future end).
CREATE FUNCTION membership_end_marks_account() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'a membership is ended at READ COMMITTED' USING ERRCODE = 'feature_not_supported';
  END IF;
  UPDATE "user" u SET sign_in_not_before = GREATEST(u.sign_in_not_before, clock_timestamp()) WHERE u.id = NEW.user_id;
  UPDATE user_session s SET ended_at = clock_timestamp(), end_reason = 'revoked' WHERE s.user_id = NEW.user_id AND s.ended_at IS NULL;
  RETURN NULL;
END;
$$;
CREATE TRIGGER membership_end_marks_account AFTER UPDATE OF ends_at ON membership FOR EACH ROW
  WHEN (NEW.ends_at IS NOT NULL AND NEW.ends_at <= now() AND (OLD.ends_at IS NULL OR OLD.ends_at > now()))
  EXECUTE FUNCTION membership_end_marks_account();

-- While a removal of an account's keys is requested, that account changes no membership of an internal organization:
-- it can neither end nor demote the requester or any other administrator, which would void the request or leave no
-- one to confirm it. Once the request is decided it can again. It fires first of the BEFORE UPDATE triggers, by name.
CREATE FUNCTION membership_removal_target_holds() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF app_actor_id() IS NOT NULL
     AND (organization_kind_of(OLD.organization_id) = 'internal' OR organization_kind_of(NEW.organization_id) = 'internal')
     AND EXISTS (SELECT 1 FROM hardware_key_removal r WHERE r.user_id = app_actor_id() AND r.state = 'requested') THEN
    RAISE EXCEPTION 'an account whose key removal is requested changes no internal membership until the request is decided'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'hardware_key_removal_target_acts';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER membership_removal_target_holds BEFORE UPDATE ON membership FOR EACH ROW EXECUTE FUNCTION membership_removal_target_holds();

-- ---------------------------------------------------------------------------------------------------
-- 7. What queues a provider sign-out (docs/adr/0095; docs/adr/0094's open case closed)
-- ---------------------------------------------------------------------------------------------------

-- In the cause's own transaction: a row exists if and only if the cause committed, one for each audit event. A reset:
-- under the password notice's guard, which is in the WHEN clause, so a reset row that fails it is skipped, never
-- raised; the user is the actor. membership_ended: the object must be a membership this transaction ended and did
-- not create (ends_at is the transaction's own timestamp, which both routes write, and created_at is before it); the
-- user is that membership's. Otherwise it raises, so the event cannot be recorded for a membership the actor did not
-- just end (ending it needs the membership policies' leave), nor for one inserted already ended (that row moved no
-- mark), and a route that ends a membership another way fails its first test instead of silently queuing nothing.
CREATE FUNCTION audit_event_provider_sign_out() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  account uuid;
BEGIN
  IF NEW.action = 'membership_ended' THEN
    SELECT m.user_id INTO account FROM membership m
     WHERE NEW.object_type = 'membership' AND m.id = NEW.object_id AND m.ends_at = now() AND m.created_at < now();
    IF NOT FOUND THEN
      RAISE EXCEPTION 'membership_ended is recorded in the transaction that ends the membership'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'membership_ended_is_recorded_by_the_end';
    END IF;
  ELSE
    account := NEW.actor_id;
  END IF;
  INSERT INTO provider_sign_out (user_id, reason, source_event_id, request_id, queued_at, next_attempt_at)
  VALUES (account, NEW.action, NEW.id, NEW.request_id, NEW.at, NEW.at)
  ON CONFLICT ON CONSTRAINT provider_sign_out_once DO NOTHING;
  RETURN NULL;
END;
$$;
CREATE TRIGGER audit_event_provider_sign_out AFTER INSERT ON audit_event FOR EACH ROW
  WHEN (NEW.action = 'membership_ended'
        OR (NEW.action IN ('password_reset_completed', 'password_reset_outcome_unknown') AND NEW.actor_kind = 'user' AND NEW.object_type = 'user' AND NEW.object_id = NEW.actor_id))
  EXECUTE FUNCTION audit_event_provider_sign_out();

-- ---------------------------------------------------------------------------------------------------
-- 8. For the web: registration and sign-in (tp_app; docs/adr/0095)
-- ---------------------------------------------------------------------------------------------------

-- The acting account records its own new key (it takes no account argument), after the provider registered it and the
-- app verified the registration itself. Under the account's row lock, on one reading of the clock: refuses a start at
-- or before the mark or ahead of the clock, a second live key, and, when the account's registration is closed, any
-- call without the one-time code of a usable opening. A digest already known fails on hardware_key_credential_once.
-- The row and its audit row exist together or not at all. The registration that consumes an opening also writes the
-- security event key_registered_after_removal and the member's notice, and answers first_after_removal.
CREATE FUNCTION hardware_key_record(new_credential bytea, new_public_key bytea, code_sha256 bytea, began timestamptz, request text)
RETURNS TABLE (key_id uuid, first_after_removal boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
#variable_conflict use_variable
DECLARE
  actor uuid := app_actor_id();
  mark timestamptz;
  at timestamptz;
  closed boolean;
  opening uuid;
  latest uuid;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'a hardware key is recorded at READ COMMITTED' USING ERRCODE = 'feature_not_supported';
  END IF;
  SELECT u.sign_in_not_before INTO mark FROM "user" u WHERE u.id = actor FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'only an account records its own hardware key' USING ERRCODE = 'insufficient_privilege';
  END IF;
  at := clock_timestamp();
  IF began IS NULL OR began > at OR (mark IS NOT NULL AND began <= mark) THEN
    RAISE EXCEPTION 'a hardware key is not recorded by a sign-in begun at or before the account''s mark, or ahead of the clock'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'hardware_key_sign_in_not_before';
  END IF;
  IF EXISTS (SELECT 1 FROM hardware_key k WHERE k.user_id = actor AND k.removed_at IS NULL) THEN
    RAISE EXCEPTION 'an account holds one hardware key' USING ERRCODE = 'check_violation', CONSTRAINT = 'hardware_key_one_live';
  END IF;
  closed := account_key_registration_closed(actor);
  IF closed THEN
    opening := hardware_key_opening_usable(actor, at);
    -- Both sides hashed again before the comparison, so its timing says nothing about the stored digest.
    IF opening IS NULL OR code_sha256 IS NULL
       OR NOT EXISTS (SELECT 1 FROM hardware_key_removal r WHERE r.id = opening AND sha256(r.registration_code_sha256) = sha256(code_sha256)) THEN
      RAISE EXCEPTION 'registration of a hardware key after a removal needs the code an administrator opened it with'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'hardware_key_registration_closed';
    END IF;
  END IF;
  INSERT INTO hardware_key (user_id, credential_sha256, public_key, registered_at, registered_request_id)
  VALUES (actor, new_credential, new_public_key, at, request)
  RETURNING id INTO key_id;
  INSERT INTO audit_event (at, actor_id, actor_kind, action, object_type, object_id, request_id)
  VALUES (at, actor, 'user', 'hardware_key_registered', 'user', actor, request);
  IF closed THEN
    INSERT INTO audit_event (at, actor_kind, action, object_type, object_id, purpose, request_id)
    VALUES (at, 'system', 'security_event', 'user', actor, 'key_registered_after_removal', request);
    INSERT INTO hardware_key_notice (user_id, kind, removal_id, event_at, next_attempt_at, expires_at)
    VALUES (actor, 'registered_after_removal', opening, at, at, at + interval '90 days')
    ON CONFLICT ON CONSTRAINT hardware_key_notice_once DO NOTHING;
  END IF;
  first_after_removal := closed;
  RETURN NEXT;
END;
$$;

-- Whether the acting account may register a key now: not_closed (registration needs no code), open (a usable opening
-- and the code's digest matches), else refused, answered alike for no opening and a wrong code. A wrong digest against
-- a usable opening counts one try (the fifth spends the opening); every refusal records the security event
-- key_registration_refused, at most once an account and an hour. It returns, never raises, so the count commits. The
-- flow calls it before it asks the provider to register anything.
CREATE FUNCTION hardware_key_registration_judge(code_sha256 bytea, began timestamptz, request text) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
#variable_conflict use_variable
DECLARE
  actor uuid := app_actor_id();
  mark timestamptz;
  at timestamptz;
  opening uuid;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'a registration is judged at READ COMMITTED' USING ERRCODE = 'feature_not_supported';
  END IF;
  SELECT u.sign_in_not_before INTO mark FROM "user" u WHERE u.id = actor FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'only an account asks about its own registration' USING ERRCODE = 'insufficient_privilege';
  END IF;
  at := clock_timestamp();
  IF NOT account_key_registration_closed(actor) THEN
    RETURN 'not_closed';
  END IF;
  -- A step begun at or before the mark, or ahead of the clock, is refused without a try counted: it is no guess.
  IF began IS NOT NULL AND began <= at AND (mark IS NULL OR began > mark) THEN
    opening := hardware_key_opening_usable(actor, at);
    IF opening IS NOT NULL THEN
      IF code_sha256 IS NOT NULL
         AND EXISTS (SELECT 1 FROM hardware_key_removal r WHERE r.id = opening AND sha256(r.registration_code_sha256) = sha256(code_sha256)) THEN
        RETURN 'open';
      END IF;
      UPDATE hardware_key_removal r SET registration_code_tries = r.registration_code_tries + 1 WHERE r.id = opening;
    END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM audit_event e
                  WHERE e.object_type = 'user' AND e.object_id = actor AND e.action = 'security_event' AND e.actor_kind = 'system'
                    AND e.purpose = 'key_registration_refused' AND e.at > at - interval '1 hour') THEN
    INSERT INTO audit_event (at, actor_kind, action, object_type, object_id, purpose, request_id)
    VALUES (at, 'system', 'security_event', 'user', actor, 'key_registration_refused', request);
  END IF;
  RETURN 'refused';
END;
$$;

-- Every key row of the account, live and removed (a removed one without its public key). Read once in a key sign-in
-- and once in a password-and-code sign-in of an account that must hold a key. Like sign_in_account, it is open to the
-- application role before a session exists; it returns nothing secret, and the flow calls it only after the provider
-- has verified the person (the application role is trusted for that order, as for sign_in_account).
CREATE FUNCTION sign_in_hardware_keys(target_user uuid) RETURNS TABLE (credential_sha256 bytea, public_key bytea, removed boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT k.credential_sha256, CASE WHEN k.removed_at IS NULL THEN k.public_key END, k.removed_at IS NOT NULL
    FROM hardware_key k
   WHERE k.user_id = target_user
   ORDER BY k.registered_at, k.id
$$;

-- One security_event for the account, purpose key_refused_<why>, why a closed list. It counts no failed sign-in: a
-- count would let the holder of a removed key lock the account. At most one row for an account and a reason in an
-- hour, so a replayed refusal cannot flood the audit log. An account that does not exist records nothing.
CREATE FUNCTION sign_in_key_refused(target_user uuid, why text, request text) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
#variable_conflict use_variable
DECLARE
  what text;
BEGIN
  IF why IS NULL OR why NOT IN ('not_registered', 'removed', 'assertion', 'malformed') THEN
    RAISE EXCEPTION 'unknown key refusal' USING ERRCODE = 'check_violation';
  END IF;
  what := 'key_refused_' || why;
  IF NOT EXISTS (SELECT 1 FROM "user" u WHERE u.id = target_user)
     OR EXISTS (SELECT 1 FROM audit_event e
                 WHERE e.object_type = 'user' AND e.object_id = target_user AND e.action = 'security_event' AND e.actor_kind = 'system'
                   AND e.purpose = what AND e.at > clock_timestamp() - interval '1 hour') THEN
    RETURN;
  END IF;
  INSERT INTO audit_event (at, actor_kind, action, object_type, object_id, purpose, request_id)
  VALUES (clock_timestamp(), 'system', 'security_event', 'user', target_user, what, request);
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- 9. For the web: the two-person removal and the opening (tp_app; docs/adr/0095)
-- ---------------------------------------------------------------------------------------------------

-- Each checks the actor itself (account_removes_keys and actor_key_session), takes the account's row first, FOR NO KEY
-- UPDATE, before any key, removal, session or outbox row (docs/adr/0093 D2's order), reads the clock once after the
-- wait and uses that one value for the judgement and for what it writes, and refuses outside READ COMMITTED.

-- A platform administrator asks for the removal of every key of another account. Nothing else changes: no key, no
-- session, no notice. A request of this account already past its 24 hours is marked expired here, so the one-open-
-- request index is exact. A second open request fails on hardware_key_removal_open_once.
CREATE FUNCTION hardware_key_removal_request(target_user uuid, acting_session uuid, request text) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
#variable_conflict use_variable
DECLARE
  actor uuid := app_actor_id();
  address text;
  at timestamptz;
  removal uuid := gen_random_uuid();
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'a key removal is requested at READ COMMITTED' USING ERRCODE = 'feature_not_supported';
  END IF;
  IF actor IS NULL OR NOT account_removes_keys(actor) OR NOT actor_key_session(acting_session) THEN
    RAISE EXCEPTION 'only a platform administrator seven days in the role, just signed in with a registered hardware key, requests a key removal'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF target_user = actor THEN
    RAISE EXCEPTION 'an administrator does not remove the keys of their own account' USING ERRCODE = 'check_violation', CONSTRAINT = 'hardware_key_removal_not_own_account';
  END IF;
  SELECT lower(u.email) INTO address FROM "user" u WHERE u.id = target_user FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no such account' USING ERRCODE = 'no_data_found';
  END IF;
  at := clock_timestamp();
  WITH lapsed AS (
    UPDATE hardware_key_removal r SET state = 'expired', decided_at = at, decided_request_id = request
     WHERE r.user_id = target_user AND r.state = 'requested' AND r.expires_at <= at
    RETURNING r.user_id
  )
  INSERT INTO audit_event (at, actor_kind, action, object_type, object_id, request_id)
  SELECT at, 'system', 'hardware_key_removal_expired', 'user', l.user_id, request FROM lapsed l;
  INSERT INTO hardware_key_removal (id, user_id, requested_by, requested_at, expires_at, request_id, address_sha256)
  VALUES (removal, target_user, actor, at, at + interval '24 hours', request, sha256(convert_to(removal::text || ':' || address, 'UTF8')));
  INSERT INTO audit_event (at, actor_id, actor_kind, action, object_type, object_id, request_id)
  VALUES (at, actor, 'user', 'hardware_key_removal_requested', 'user', target_user, request);
  RETURN removal;
END;
$$;

-- A second platform administrator confirms, inside 24 hours: not the requester, not the account, and the requester
-- still passing the same predicate (a request made by an account that has since lost the role or been disabled is
-- void). Then, together or not at all: every live key of the account removed (the only statement that removes a key
-- names the account, never a key), the mark moved, every open session ended, a hold for a key registered across a
-- reset cleared (the account is not unlocked here), the removal decided, its audit row, the member's notice and the
-- provider sign-out. An account with no live key is still confirmed: the mark, the sessions, the hold and the
-- provider's leftovers are the point for an account whose keys predate the registry.
CREATE FUNCTION hardware_key_removal_confirm(removal uuid, acting_session uuid, request text) RETURNS TABLE (keys_removed integer, sessions_ended integer)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
#variable_conflict use_variable
DECLARE
  actor uuid := app_actor_id();
  account uuid;
  held hardware_key_removal%ROWTYPE;
  at timestamptz;
  event uuid;
  keys integer;
  sessions integer;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'a key removal is confirmed at READ COMMITTED' USING ERRCODE = 'feature_not_supported';
  END IF;
  IF actor IS NULL OR NOT account_removes_keys(actor) OR NOT actor_key_session(acting_session) THEN
    RAISE EXCEPTION 'only a platform administrator seven days in the role, just signed in with a registered hardware key, confirms a key removal'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT r.user_id INTO account FROM hardware_key_removal r WHERE r.id = removal;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no such key removal' USING ERRCODE = 'no_data_found';
  END IF;
  PERFORM 1 FROM "user" u WHERE u.id = account FOR NO KEY UPDATE;
  SELECT r.* INTO held FROM hardware_key_removal r WHERE r.id = removal FOR UPDATE;
  IF held.state <> 'requested' THEN
    RAISE EXCEPTION 'this key removal is already decided' USING ERRCODE = 'check_violation', CONSTRAINT = 'hardware_key_removal_decided';
  END IF;
  at := clock_timestamp();
  IF actor = held.requested_by THEN
    RAISE EXCEPTION 'a key removal is confirmed by a second platform administrator' USING ERRCODE = 'check_violation', CONSTRAINT = 'hardware_key_removal_two_people';
  END IF;
  IF actor = held.user_id THEN
    RAISE EXCEPTION 'an administrator does not remove the keys of their own account' USING ERRCODE = 'check_violation', CONSTRAINT = 'hardware_key_removal_not_own_account';
  END IF;
  IF at >= held.expires_at THEN
    RAISE EXCEPTION 'this key removal request has expired' USING ERRCODE = 'check_violation', CONSTRAINT = 'hardware_key_removal_in_time';
  END IF;
  IF NOT account_removes_keys(held.requested_by) THEN
    RAISE EXCEPTION 'the administrator who requested this key removal no longer may' USING ERRCODE = 'check_violation', CONSTRAINT = 'hardware_key_removal_requester_left';
  END IF;
  UPDATE hardware_key k SET removed_at = at, removal_id = removal WHERE k.user_id = account AND k.removed_at IS NULL;
  GET DIAGNOSTICS keys = ROW_COUNT;
  UPDATE "user" u SET sign_in_not_before = GREATEST(u.sign_in_not_before, at) WHERE u.id = account;
  UPDATE user_session s SET ended_at = at, end_reason = 'revoked' WHERE s.user_id = account AND s.ended_at IS NULL;
  GET DIAGNOSTICS sessions = ROW_COUNT;
  IF EXISTS (
       SELECT 1 FROM audit_event locked
        WHERE locked.object_type = 'user' AND locked.object_id = account AND locked.action = 'security_event'
          AND locked.actor_kind = 'system' AND locked.purpose = 'account_locked_key_across_reset'
          AND NOT EXISTS (
            SELECT 1 FROM audit_event cleared
             WHERE cleared.object_type = 'user' AND cleared.object_id = account AND cleared.action = 'security_event'
               AND cleared.actor_kind = 'system' AND cleared.purpose = 'key_across_reset_cleared' AND cleared.at > locked.at)) THEN
    INSERT INTO audit_event (at, actor_kind, action, object_type, object_id, purpose, request_id)
    VALUES (clock_timestamp(), 'system', 'security_event', 'user', account, 'key_across_reset_cleared', request);
  END IF;
  UPDATE hardware_key_removal r
     SET state = 'confirmed', decided_by = actor, decided_at = at, decided_request_id = request, keys_removed = keys, sessions_ended = sessions
   WHERE r.id = removal;
  INSERT INTO audit_event (at, actor_id, actor_kind, action, object_type, object_id, request_id)
  VALUES (at, actor, 'user', 'hardware_key_removal_confirmed', 'user', account, request)
  RETURNING id INTO event;
  INSERT INTO hardware_key_notice (user_id, kind, removal_id, event_at, next_attempt_at, expires_at)
  VALUES (account, 'removed', removal, at, at, at + interval '90 days');
  INSERT INTO provider_sign_out (user_id, reason, source_event_id, request_id, queued_at, next_attempt_at)
  VALUES (account, 'hardware_keys_removed', event, request, at, at);
  keys_removed := keys;
  sessions_ended := sessions;
  RETURN NEXT;
END;
$$;

-- Any one platform administrator but the account stops a requested removal (the requester may cancel their own), each
-- time on the audit log with their ID. The account itself cannot: a thief in the account must not stop its removal.
-- True when this call cancelled it; false when it was decided already or its 24 hours are over.
CREATE FUNCTION hardware_key_removal_cancel(removal uuid, acting_session uuid, request text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
#variable_conflict use_variable
DECLARE
  actor uuid := app_actor_id();
  account uuid;
  held hardware_key_removal%ROWTYPE;
  at timestamptz;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'a key removal is cancelled at READ COMMITTED' USING ERRCODE = 'feature_not_supported';
  END IF;
  IF actor IS NULL OR NOT account_removes_keys(actor) OR NOT actor_key_session(acting_session) THEN
    RAISE EXCEPTION 'only a platform administrator seven days in the role, just signed in with a registered hardware key, cancels a key removal'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT r.user_id INTO account FROM hardware_key_removal r WHERE r.id = removal;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no such key removal' USING ERRCODE = 'no_data_found';
  END IF;
  IF actor = account THEN
    RAISE EXCEPTION 'an account does not cancel the removal of its own keys' USING ERRCODE = 'check_violation', CONSTRAINT = 'hardware_key_removal_not_own_account';
  END IF;
  PERFORM 1 FROM "user" u WHERE u.id = account FOR NO KEY UPDATE;
  SELECT r.* INTO held FROM hardware_key_removal r WHERE r.id = removal FOR UPDATE;
  at := clock_timestamp();
  IF held.state <> 'requested' OR at >= held.expires_at THEN
    RETURN false;
  END IF;
  UPDATE hardware_key_removal r SET state = 'cancelled', decided_by = actor, decided_at = at, decided_request_id = request WHERE r.id = removal;
  INSERT INTO audit_event (at, actor_id, actor_kind, action, object_type, object_id, request_id)
  VALUES (at, actor, 'user', 'hardware_key_removal_cancelled', 'user', account, request);
  RETURN true;
END;
$$;

-- For a platform administrator only: the open requests and those decided in the last 30 days. IDs and times only; the
-- console joins names through its own policies. registration_closed is the account's state now, not the row's.
CREATE FUNCTION hardware_key_removals()
RETURNS TABLE (removal_id uuid, user_id uuid, requested_by uuid, requested_at timestamptz, expires_at timestamptz, state text, decided_by uuid,
  decided_at timestamptz, live_keys integer, registration_open_until timestamptz, registration_closed boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
#variable_conflict use_variable
BEGIN
  IF NOT coalesce(app_actor_platform_permitted('organization.manage'), false) THEN
    RAISE EXCEPTION 'only a platform administrator lists key removals' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
    SELECT r.id, r.user_id, r.requested_by, r.requested_at, r.expires_at, r.state, r.decided_by, r.decided_at,
           (SELECT count(*)::integer FROM hardware_key k WHERE k.user_id = r.user_id AND k.removed_at IS NULL),
           r.registration_open_until, account_key_registration_closed(r.user_id)
      FROM hardware_key_removal r
     WHERE r.state = 'requested' OR r.decided_at > now() - interval '30 days'
     ORDER BY r.requested_at DESC, r.id;
END;
$$;

-- After a removal the account's next registration is closed until a platform administrator opens it, for one hour,
-- with the SHA-256 of a one-time code the web made and showed the opener once; the opener reads the code to the
-- member on a channel PaidWhole already holds. One opener, by decision: the opener already passes the seven days and
-- the fresh key session, and the code goes to the member by voice. Not the account's own. Only the account's latest
-- confirmed removal, only while the account is closed, and only when no usable opening stands (one whose hour has
-- passed, whose tries are spent or which a later mark killed may be replaced; tries back to 0). The member is told by
-- email at the first opening of a removal. Returns when the opening ends.
CREATE FUNCTION hardware_key_registration_open(removal uuid, acting_session uuid, code_sha256 bytea, request text) RETURNS timestamptz
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
#variable_conflict use_variable
DECLARE
  actor uuid := app_actor_id();
  account uuid;
  held hardware_key_removal%ROWTYPE;
  at timestamptz;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'a registration is opened at READ COMMITTED' USING ERRCODE = 'feature_not_supported';
  END IF;
  IF actor IS NULL OR NOT account_removes_keys(actor) OR NOT actor_key_session(acting_session) THEN
    RAISE EXCEPTION 'only a platform administrator seven days in the role, just signed in with a registered hardware key, opens a registration'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF code_sha256 IS NULL OR octet_length(code_sha256) <> 32 THEN
    RAISE EXCEPTION 'a registration is opened with the SHA-256 of its code' USING ERRCODE = 'check_violation', CONSTRAINT = 'hardware_key_removal_opening';
  END IF;
  SELECT r.user_id INTO account FROM hardware_key_removal r WHERE r.id = removal;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no such key removal' USING ERRCODE = 'no_data_found';
  END IF;
  IF actor = account THEN
    RAISE EXCEPTION 'an account does not open its own registration' USING ERRCODE = 'check_violation', CONSTRAINT = 'hardware_key_removal_not_own_account';
  END IF;
  PERFORM 1 FROM "user" u WHERE u.id = account FOR NO KEY UPDATE;
  SELECT r.* INTO held FROM hardware_key_removal r WHERE r.id = removal FOR UPDATE;
  at := clock_timestamp();
  IF held.state <> 'confirmed' OR NOT account_key_registration_closed(account)
     OR EXISTS (SELECT 1 FROM hardware_key_removal later
                 WHERE later.user_id = account AND later.state = 'confirmed' AND later.id <> held.id
                   AND (later.decided_at, later.id) > (held.decided_at, held.id)) THEN
    RAISE EXCEPTION 'a registration is opened for the latest removal of an account that has registered no key since'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'hardware_key_registration_not_closed';
  END IF;
  IF hardware_key_opening_usable(account, at) IS NOT NULL THEN
    RAISE EXCEPTION 'this registration is already open' USING ERRCODE = 'check_violation', CONSTRAINT = 'hardware_key_registration_open_once';
  END IF;
  UPDATE hardware_key_removal r
     SET registration_opened_by = actor, registration_opened_at = at, registration_open_until = at + interval '1 hour',
         registration_code_sha256 = code_sha256, registration_code_tries = 0, registration_opened_request_id = request
   WHERE r.id = removal;
  INSERT INTO audit_event (at, actor_id, actor_kind, action, object_type, object_id, request_id)
  VALUES (at, actor, 'user', 'hardware_key_registration_opened', 'user', account, request);
  INSERT INTO hardware_key_notice (user_id, kind, removal_id, event_at, next_attempt_at, expires_at)
  VALUES (account, 'registration_opened', removal, at, at, at + interval '90 days')
  ON CONFLICT ON CONSTRAINT hardware_key_notice_once DO NOTHING;
  RETURN at + interval '1 hour';
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- 10. The platform's provider_sign_outs job (tp_operator; docs/adr/0095)
-- ---------------------------------------------------------------------------------------------------

-- None calls operator_assert_scope: a sign-out names no practice, and the job runs each with app.practice_ids empty.
-- The short functions wait for no lock they judge time after, so they read now().

-- One row a call, claimed only to be called at once: undone, not given up, due, with no lease or a lapsed one, and
-- under 30 tries. The locking read runs exactly once (the MATERIALIZED CTE) and skips rows another run holds. The try
-- is counted here, so a row that kills its worker still runs out of tries; the lease is two minutes, and the row goes
-- to the back of the order until then. The only reader of the provider's subject, which is stored nowhere here.
CREATE FUNCTION operator_provider_sign_out_claim() RETURNS TABLE (sign_out_id uuid, account_id uuid, subject text, try smallint)
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  WITH due AS MATERIALIZED (
    SELECT p.id
      FROM provider_sign_out p
     WHERE p.done_at IS NULL AND p.gave_up_at IS NULL AND p.next_attempt_at <= now()
       AND (p.leased_until IS NULL OR p.leased_until <= now()) AND p.attempts < 30
     ORDER BY p.next_attempt_at, p.id
     LIMIT 1
       FOR UPDATE SKIP LOCKED
  )
  UPDATE provider_sign_out p
     SET attempts = p.attempts + 1, leased_until = now() + interval '2 minutes', next_attempt_at = now() + interval '2 minutes'
    FROM due d, "user" u
   WHERE p.id = d.id AND u.id = p.user_id
  RETURNING p.id, p.user_id, u.cognito_sub, p.attempts
$$;

-- The provider answered (signed_out, or no_such_user: there is nothing left to sign out). It acts only for the claim
-- it names (try is the row's attempts) on an undone row, so a stale worker changes nothing. A row already given up is
-- still marked done: the success is true and is recorded. provider_signed_out is written from this UPDATE's own
-- result, once. True when this call recorded it.
CREATE FUNCTION operator_provider_sign_out_done(sign_out uuid, try smallint, outcome text, request text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
#variable_conflict use_variable
DECLARE
  account uuid;
  why text;
BEGIN
  IF outcome IS NULL OR outcome NOT IN ('signed_out', 'no_such_user') THEN
    RAISE EXCEPTION 'unknown provider sign-out outcome' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE provider_sign_out p SET done_at = now(), leased_until = NULL
   WHERE p.id = sign_out AND p.attempts = try AND p.done_at IS NULL
  RETURNING p.user_id, p.reason INTO account, why;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  INSERT INTO audit_event (actor_kind, action, object_type, object_id, purpose, request_id)
  VALUES ('system', 'provider_signed_out', 'user', account, why, request);
  RETURN true;
END;
$$;

-- A try that failed, for the claim it names, on a row neither done nor given up: the error's class-like name (never
-- its message; unknown for anything else), the lease cleared, the next try after 1, 5, 15 and 60 minutes, and 60 for
-- every try past the fourth. It decides neither late nor given up: the sweep does, from the row alone.
CREATE FUNCTION operator_provider_sign_out_failed(sign_out uuid, try smallint, error_name text, request text) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  UPDATE provider_sign_out p
     SET last_error_code = CASE WHEN error_name ~ '^[A-Za-z][A-Za-z0-9]{0,63}$' THEN error_name ELSE 'unknown' END,
         leased_until = NULL,
         next_attempt_at = now() + make_interval(mins => (ARRAY[1, 5, 15, 60])[least(p.attempts, 4)])
   WHERE p.id = sign_out AND p.attempts = try AND p.done_at IS NULL AND p.gave_up_at IS NULL
$$;

-- The sweep. Late: five tries, or four with no running lease. Given up: 30 tries with no running lease, or 24 hours
-- since it was queued and four tries with no running lease; a row never tried is never given up (after a long outage
-- it is claimed). provider_sign_out_undelivered is written from the UPDATE that set the mark, once under overlapping
-- runs. Returns one row for each line not yet acknowledged, LATE or GAVE_UP (a row may owe both), on every run until
-- operator_provider_sign_out_reported acknowledges it: the paging line is written at least once, never lost.
CREATE FUNCTION operator_provider_sign_outs_overdue(request text) RETURNS TABLE (sign_out_id uuid, account_id uuid, cause_request_id text, code text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
#variable_conflict use_variable
BEGIN
  UPDATE provider_sign_out p SET late_at = now()
   WHERE p.done_at IS NULL AND p.late_at IS NULL
     AND (p.attempts >= 5 OR (p.attempts >= 4 AND (p.leased_until IS NULL OR p.leased_until <= now())));
  WITH given AS (
    UPDATE provider_sign_out p SET gave_up_at = now(), late_at = coalesce(p.late_at, now())
     WHERE p.done_at IS NULL AND p.gave_up_at IS NULL AND (p.leased_until IS NULL OR p.leased_until <= now())
       AND (p.attempts >= 30 OR (p.attempts >= 4 AND p.queued_at <= now() - interval '24 hours'))
    RETURNING p.user_id, p.reason
  )
  INSERT INTO audit_event (actor_kind, action, object_type, object_id, purpose, request_id)
  SELECT 'system', 'provider_sign_out_undelivered', 'user', g.user_id, g.reason, request FROM given g;
  RETURN QUERY
    SELECT p.id, p.user_id, p.request_id, 'LATE'::text FROM provider_sign_out p WHERE p.late_at IS NOT NULL AND p.late_reported_at IS NULL
    UNION ALL
    SELECT p.id, p.user_id, p.request_id, 'GAVE_UP'::text FROM provider_sign_out p WHERE p.gave_up_at IS NOT NULL AND p.gave_up_reported_at IS NULL
    ORDER BY 1, 4;
END;
$$;

-- The job wrote the paging line for this row and code: acknowledged, once. Called only after the line is written.
CREATE FUNCTION operator_provider_sign_out_reported(sign_out uuid, code text) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
#variable_conflict use_variable
BEGIN
  IF code = 'LATE' THEN
    UPDATE provider_sign_out p SET late_reported_at = now() WHERE p.id = sign_out AND p.late_at IS NOT NULL AND p.late_reported_at IS NULL;
  ELSIF code = 'GAVE_UP' THEN
    UPDATE provider_sign_out p SET gave_up_reported_at = now() WHERE p.id = sign_out AND p.gave_up_at IS NOT NULL AND p.gave_up_reported_at IS NULL;
  ELSE
    RAISE EXCEPTION 'unknown provider sign-out line' USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

-- Rows done more than 90 days ago, and given-up rows 90 days after their line was written. Never an undone row that
-- was not given up and reported. Returns how many went.
CREATE FUNCTION operator_provider_sign_outs_expire(at_most integer) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
#variable_conflict use_variable
DECLARE
  removed integer;
BEGIN
  IF at_most IS NULL OR at_most < 1 THEN
    RAISE EXCEPTION 'expire at least one row a run' USING ERRCODE = 'check_violation';
  END IF;
  DELETE FROM provider_sign_out p
   WHERE p.id IN (SELECT x.id FROM provider_sign_out x
                   WHERE x.done_at <= now() - interval '90 days' OR (x.done_at IS NULL AND x.gave_up_reported_at <= now() - interval '90 days')
                   ORDER BY x.queued_at LIMIT at_most);
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END;
$$;

-- Requests past their 24 hours: expired, once, each with hardware_key_removal_expired. A row a confirmation holds is
-- skipped and read again next minute (the confirmation refuses a late request itself).
CREATE FUNCTION operator_key_removals_expire(at_most integer, request text) RETURNS TABLE (removal_id uuid, user_id uuid)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
#variable_conflict use_variable
DECLARE
  lapsed hardware_key_removal%ROWTYPE;
BEGIN
  FOR lapsed IN
    SELECT r.* FROM hardware_key_removal r
     WHERE r.state = 'requested' AND r.expires_at <= clock_timestamp()
     ORDER BY r.expires_at, r.id
     LIMIT greatest(at_most, 0)
       FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE hardware_key_removal r SET state = 'expired', decided_at = clock_timestamp(), decided_request_id = request WHERE r.id = lapsed.id;
    INSERT INTO audit_event (actor_kind, action, object_type, object_id, request_id)
    VALUES ('system', 'hardware_key_removal_expired', 'user', lapsed.user_id, request);
    removal_id := lapsed.id;
    user_id := lapsed.user_id;
    RETURN NEXT;
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- 11. The platform's hardware_key_notices job (tp_operator; docs/adr/0091's five, for hardware_key_notice)
-- ---------------------------------------------------------------------------------------------------

-- A notice undelivered or failed, reported once: hardware_key_notice_undelivered in the audit log, naming the account,
-- its purpose the notice's kind. True exactly once a notice. Called by the definers below; granted to no role.
CREATE FUNCTION hardware_key_notice_report_undelivered(notice uuid, request text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
#variable_conflict use_variable
DECLARE
  reported hardware_key_notice%ROWTYPE;
BEGIN
  UPDATE hardware_key_notice n SET undelivered_reported_at = now()
   WHERE n.id = notice AND n.undelivered_reported_at IS NULL AND n.state IN ('undelivered', 'failed')
  RETURNING n.* INTO reported;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  INSERT INTO audit_event (actor_kind, action, object_type, object_id, purpose, request_id)
  VALUES ('system', 'hardware_key_notice_undelivered', 'user', reported.user_id, reported.kind, request);
  RETURN true;
END;
$$;

-- Step 1, first each minute: a pending notice whose event is 24 hours old is never sent: failed as NoticeStale and
-- reported. A notice a claim holds is left to it. Returns the notices this call reported.
CREATE FUNCTION operator_key_notices_stale(at_most integer, request text) RETURNS TABLE (notice_id uuid, user_id uuid)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
#variable_conflict use_variable
DECLARE
  stale hardware_key_notice%ROWTYPE;
BEGIN
  FOR stale IN
    SELECT n.* FROM hardware_key_notice n
     WHERE n.state = 'pending' AND n.event_at <= now() - interval '24 hours'
     ORDER BY n.event_at, n.id
     LIMIT greatest(at_most, 0)
       FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE hardware_key_notice n SET state = 'failed', error_code = 'NoticeStale' WHERE n.id = stale.id;
    IF hardware_key_notice_report_undelivered(stale.id, request) THEN
      notice_id := stale.id;
      user_id := stale.user_id;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

-- Step 2: the notices due a send (pending, their next attempt come, under 24 hours old), oldest attempt first. IDs only.
CREATE FUNCTION operator_key_notices_due(at_most integer) RETURNS TABLE (notice_id uuid, user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT n.id, n.user_id
    FROM hardware_key_notice n
   WHERE n.state = 'pending' AND n.next_attempt_at <= now() AND n.event_at > now() - interval '24 hours'
   ORDER BY n.next_attempt_at, n.id
   LIMIT greatest(at_most, 0)
$$;

-- Step 3, in the transaction that sends the one message and records it: locks the notice if it is still pending, due
-- and under 24 hours old, and returns its account, the address, the kind and the event's time. The only reader of the
-- address. It sends only to the address the account had when the removal was requested: if the address has changed
-- since, the notice is failed here as AddressChanged and reported, and the row returned has no address and
-- undelivered true, for the job to log and commit. Nothing when another run holds it, or it is not due or not pending.
CREATE FUNCTION operator_key_notice_claim(notice uuid) RETURNS TABLE (user_id uuid, email text, kind text, event_at timestamptz, undelivered boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
#variable_conflict use_variable
DECLARE
  held hardware_key_notice%ROWTYPE;
  address text;
  same boolean;
BEGIN
  SELECT n.* INTO held FROM hardware_key_notice n
   WHERE n.id = notice AND n.state = 'pending' AND n.next_attempt_at <= now() AND n.event_at > now() - interval '24 hours'
     FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  SELECT u.email, r.address_sha256 = sha256(convert_to(r.id::text || ':' || lower(u.email), 'UTF8')) INTO address, same
    FROM "user" u JOIN hardware_key_removal r ON r.id = held.removal_id WHERE u.id = held.user_id;
  user_id := held.user_id;
  kind := held.kind;
  event_at := held.event_at;
  IF coalesce(same, false) THEN
    email := address;
    undelivered := false;
  ELSE
    UPDATE hardware_key_notice n SET state = 'failed', error_code = 'AddressChanged' WHERE n.id = notice;
    PERFORM hardware_key_notice_report_undelivered(notice, NULL);
    email := NULL;
    undelivered := true;
  END IF;
  RETURN NEXT;
END;
$$;

-- Step 3's record, before the claim's transaction commits: the message SES accepted, once, while pending, with
-- hardware_key_notice_sent. The message-ID lock comes before the read of the mail record, so an SES event of the
-- message being recorded meanwhile is read once it commits (operator_record_mail_event takes the same lock before it
-- writes). True when the message is already undelivered and this reported it.
CREATE FUNCTION operator_key_notice_sent(notice uuid, message_id text, request text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
#variable_conflict use_variable
DECLARE
  arrived mail_send%ROWTYPE;
  told uuid;
  told_kind text;
  now_state text;
BEGIN
  IF message_id IS NULL OR message_id !~ '^[A-Za-z0-9-]{20,100}$' THEN
    RAISE EXCEPTION 'a key notice is recorded with the message ID SES gave' USING ERRCODE = 'check_violation', CONSTRAINT = 'hardware_key_notice_message_id';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('hardware_key_notice:' || message_id, 0));
  SELECT m.* INTO arrived FROM mail_send m WHERE m.ses_message_id = message_id AND m.kind = 'hardware_keys_removed';
  UPDATE hardware_key_notice n
     SET ses_message_id = message_id, sent_at = now(),
         state = CASE WHEN arrived.state IN ('bounced', 'suppressed', 'rejected') THEN 'undelivered'
                      WHEN arrived.delivered_at IS NOT NULL THEN 'delivered'
                      ELSE 'sent' END
   WHERE n.id = notice AND n.state = 'pending'
  RETURNING n.user_id, n.kind, n.state INTO told, told_kind, now_state;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'a key notice is recorded as sent once, while pending' USING ERRCODE = 'check_violation', CONSTRAINT = 'hardware_key_notice_sent';
  END IF;
  INSERT INTO audit_event (actor_kind, action, object_type, object_id, purpose, request_id)
  VALUES ('system', 'hardware_key_notice_sent', 'user', told, told_kind, request);
  IF now_state = 'undelivered' THEN
    RETURN hardware_key_notice_report_undelivered(notice, request);
  END IF;
  RETURN false;
END;
$$;

-- Step 4, a try that failed, in a new transaction after the rollback: one attempt more, the next after 1, 5, 15 and 60
-- minutes; failed after the fifth, or at once for a permanent SES error, with the error's name (a code, never its
-- message; Unrecognized for anything else), which reports it (true). A notice no longer pending is unchanged.
CREATE FUNCTION operator_key_notice_failed(notice uuid, error_name text, permanent boolean, request text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
#variable_conflict use_variable
DECLARE
  now_state text;
BEGIN
  UPDATE hardware_key_notice n
     SET attempts = n.attempts + 1,
         state = CASE WHEN coalesce(permanent, false) OR n.attempts + 1 >= 5 THEN 'failed' ELSE 'pending' END,
         error_code = CASE WHEN coalesce(permanent, false) OR n.attempts + 1 >= 5
                           THEN CASE WHEN error_name ~ '^[A-Za-z]{1,64}$' THEN error_name ELSE 'Unrecognized' END END,
         next_attempt_at = CASE WHEN coalesce(permanent, false) OR n.attempts + 1 >= 5 THEN n.next_attempt_at
                                ELSE now() + make_interval(mins => (ARRAY[1, 5, 15, 60])[n.attempts + 1]) END
   WHERE n.id = notice AND n.state = 'pending'
  RETURNING n.state INTO now_state;
  IF now_state = 'failed' THEN
    RETURN hardware_key_notice_report_undelivered(notice, request);
  END IF;
  RETURN false;
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- 12. The record of an SES event, and the nightly expiry (replaced in place; docs/adr/0091 D8 and D14)
-- ---------------------------------------------------------------------------------------------------

-- As migration 20261111090000 created it, with the key notice: a hardware_keys_removed message's events take the
-- message-ID lock before the mail record is written; once the record's state moves, the notice holding the message
-- takes the same step a password notice takes (sent to delivered; sent or delivered to undelivered on a bounce, a
-- suppression or a rejection, reported once through hardware_key_notice_undelivered). Its arguments and its result's
-- columns are unchanged, so the previous image's call still runs; an undelivered key notice is on the audit log, not
-- in a new column.
CREATE OR REPLACE FUNCTION operator_record_mail_event(message_id text, stream text, event text, mail_at timestamptz, event_at timestamptz, recipient text,
  kind text, subject uuid, recipient_user uuid, practice uuid, bounce_kind text, bounce_subtype text, complaint_type text, request text)
RETURNS TABLE (recorded boolean, state text, notice_undelivered uuid, invoice_undelivered uuid, invitation_undelivered uuid, stream_paused text,
  password_notice_undelivered uuid)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
#variable_conflict use_variable
DECLARE
  new_state text;
  given_bounce text;
  given_subtype text;
  given_complaint text;
  happened timestamptz := least(coalesce(event_at, now()), now());
  held mail_send%ROWTYPE;
  resolved_user uuid;
  prospect uuid;
  priced screening_run%ROWTYPE;
  touched_notice uuid;
  touched_invoice uuid;
  touched_stage text;
  touched_password_notice uuid;
  touched_key_notice uuid;
BEGIN
  recorded := false;
  notice_undelivered := NULL;
  invoice_undelivered := NULL;
  invitation_undelivered := NULL;
  stream_paused := NULL;
  password_notice_undelivered := NULL;
  IF event IS NULL OR event NOT IN ('send', 'delivery_delay', 'delivery', 'bounce', 'complaint', 'reject', 'rendering_failure') THEN
    RAISE EXCEPTION 'unknown mail event' USING ERRCODE = 'check_violation', CONSTRAINT = 'mail_event_type';
  END IF;
  IF mail_at IS NULL THEN
    RAISE EXCEPTION 'a mail event names when its message was sent' USING ERRCODE = 'check_violation', CONSTRAINT = 'mail_event_sent_at';
  END IF;
  IF kind = 'password_changed' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('password_notice:' || message_id, 0));
  ELSIF kind = 'hardware_keys_removed' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('hardware_key_notice:' || message_id, 0));
  END IF;
  IF practice IS NOT NULL OR kind IN ('support_grant_opened', 'support_grant_closed') THEN
    PERFORM operator_assert_scope(practice);
  END IF;
  IF event = 'bounce' THEN
    given_bounce := CASE WHEN bounce_kind IN ('permanent', 'transient', 'undetermined') THEN bounce_kind ELSE 'undetermined' END;
    given_subtype := CASE WHEN bounce_subtype IN ('general', 'no_email', 'suppressed', 'on_account_suppression_list', 'on_configuration_set_suppression_list',
                                                  'mailbox_full', 'message_too_large', 'content_rejected', 'attachment_rejected', 'undetermined', 'other')
                          THEN bounce_subtype ELSE 'other' END;
    -- Suppressed by the account's own list (or a set's override of it, which only changes what goes on that list): SES
    -- accepted the message, sent it to no one and counts it toward neither rate. A bounce from SES's global suppression
    -- list (subtype suppressed: the address bounced recently for some sender) is counted toward the account's bounce rate
    -- as any hard bounce is, so it is a bounce here too: the window, the refusal list and the bounce marks count it.
    new_state := CASE WHEN given_subtype IN ('on_account_suppression_list', 'on_configuration_set_suppression_list') THEN 'suppressed' ELSE 'bounced' END;
  ELSIF event = 'complaint' THEN
    given_complaint := CASE WHEN complaint_type IS NULL THEN 'unspecified'
                            WHEN complaint_type IN ('abuse', 'auth_failure', 'fraud', 'not_spam', 'virus', 'other', 'unspecified') THEN complaint_type
                            ELSE 'other' END;
    new_state := 'complained';
  ELSE
    new_state := CASE event WHEN 'send' THEN 'sent' WHEN 'delivery_delay' THEN 'delayed' WHEN 'delivery' THEN 'delivered' ELSE 'rejected' END;
  END IF;
  IF stream = 'screening' THEN
    IF kind IN ('screening_result', 'screening_failed') THEN
      SELECT r.* INTO priced FROM screening_run r WHERE r.id = subject;
      IF FOUND THEN
        SELECT u.prospect_id INTO prospect FROM screening_upload u WHERE u.id = priced.upload_id;
      END IF;
    END IF;
  ELSIF kind = 'cognito' THEN
    SELECT u.id INTO resolved_user FROM "user" u WHERE lower(u.email) = lower(btrim(recipient));
  ELSIF recipient_user IS NOT NULL THEN
    SELECT u.id INTO resolved_user FROM "user" u WHERE u.id = recipient_user;
  END IF;

  INSERT INTO mail_send (ses_message_id, stream, kind, subject_id, recipient_user_id, screening_prospect_id, state, bounce_kind, bounce_subtype, complaint_type,
                         sent_at, delivered_at, undelivered_at, complained_at)
  VALUES (message_id, stream, kind, subject, resolved_user, prospect, new_state,
          CASE WHEN new_state IN ('bounced', 'suppressed') THEN given_bounce END, CASE WHEN new_state IN ('bounced', 'suppressed') THEN given_subtype END,
          CASE WHEN new_state = 'complained' THEN given_complaint END,
          mail_at, CASE WHEN new_state = 'delivered' THEN happened END, CASE WHEN new_state IN ('bounced', 'suppressed', 'rejected') THEN happened END,
          CASE WHEN new_state = 'complained' THEN happened END)
  ON CONFLICT (ses_message_id) DO NOTHING
  RETURNING * INTO held;
  IF FOUND THEN
    recorded := true;
  ELSE
    SELECT m.* INTO held FROM mail_send m WHERE m.ses_message_id = message_id FOR UPDATE;
    IF mail_state_rank(new_state) > mail_state_rank(held.state) THEN
      UPDATE mail_send m
         SET state = new_state,
             bounce_kind = CASE WHEN new_state IN ('bounced', 'suppressed') THEN given_bounce END,
             bounce_subtype = CASE WHEN new_state IN ('bounced', 'suppressed') THEN given_subtype END,
             complaint_type = CASE WHEN new_state = 'complained' THEN given_complaint END,
             delivered_at = CASE WHEN new_state = 'delivered' THEN happened ELSE m.delivered_at END,
             undelivered_at = CASE WHEN new_state IN ('bounced', 'suppressed', 'rejected') THEN happened ELSE m.undelivered_at END,
             complained_at = CASE WHEN new_state = 'complained' THEN happened ELSE m.complained_at END
       WHERE m.ses_message_id = message_id
      RETURNING * INTO held;
      recorded := true;
    END IF;
  END IF;
  state := held.state;
  IF NOT recorded THEN
    RETURN NEXT;
    RETURN;
  END IF;

  -- A probe proves the event path, and counts toward nothing else.
  IF held.kind = 'probe' THEN
    IF held.state = 'delivered' THEN
      UPDATE mail_stream s SET probe_delivered_at = now() WHERE s.stream = held.stream;
    ELSIF held.state = 'bounced' THEN
      UPDATE mail_stream s SET probe_bounced_at = now() WHERE s.stream = held.stream;
    END IF;
    RETURN NEXT;
    RETURN;
  END IF;

  -- A notice's recipient takes its message's state, by the message's ID alone.
  IF held.stream = 'notices' AND held.state <> 'sent' THEN
    IF held.kind IN ('support_grant_opened', 'support_grant_closed') THEN
      UPDATE support_grant_notice_recipient r SET state = held.state
       WHERE r.ses_message_id = message_id AND mail_state_rank(r.state) < mail_state_rank(held.state)
      RETURNING r.notice_id INTO touched_notice;
      IF touched_notice IS NOT NULL AND held.state IN ('bounced', 'suppressed', 'rejected') AND support_notice_report_undelivered(touched_notice, request) THEN
        SELECT n.support_grant_id INTO notice_undelivered FROM support_grant_notice n WHERE n.id = touched_notice;
      END IF;
    ELSIF held.kind = 'dunning' THEN
      UPDATE dunning_notice_recipient d SET state = held.state
       WHERE d.ses_message_id = message_id AND mail_state_rank(d.state) < mail_state_rank(held.state)
      RETURNING d.invoice_id, d.stage INTO touched_invoice, touched_stage;
      IF touched_invoice IS NOT NULL AND held.state IN ('bounced', 'suppressed', 'rejected') AND dunning_notice_report_undelivered(touched_invoice, touched_stage, request) THEN
        invoice_undelivered := touched_invoice;
      END IF;
    END IF;
  END IF;

  IF held.stream = 'transactional' AND held.kind = 'password_changed' AND held.state IN ('delivered', 'bounced', 'suppressed', 'rejected') THEN
    UPDATE password_notice p SET state = CASE WHEN held.state = 'delivered' THEN 'delivered' ELSE 'undelivered' END
     WHERE p.ses_message_id = message_id
       AND (p.state = 'sent' OR (p.state = 'delivered' AND held.state IN ('bounced', 'suppressed', 'rejected')))
    RETURNING p.id INTO touched_password_notice;
    IF touched_password_notice IS NOT NULL AND held.state <> 'delivered' AND password_notice_report_undelivered(touched_password_notice, request) THEN
      password_notice_undelivered := touched_password_notice;
    END IF;
  END IF;

  IF held.stream = 'transactional' AND held.kind = 'hardware_keys_removed' AND held.state IN ('delivered', 'bounced', 'suppressed', 'rejected') THEN
    UPDATE hardware_key_notice n SET state = CASE WHEN held.state = 'delivered' THEN 'delivered' ELSE 'undelivered' END
     WHERE n.ses_message_id = message_id
       AND (n.state = 'sent' OR (n.state = 'delivered' AND held.state IN ('bounced', 'suppressed', 'rejected')))
    RETURNING n.id INTO touched_key_notice;
    IF touched_key_notice IS NOT NULL AND held.state <> 'delivered' THEN
      PERFORM hardware_key_notice_report_undelivered(touched_key_notice, request);
    END IF;
  END IF;

  -- An invitation whose Cognito message did not arrive: only one sent at or after the invitation's latest send (less 5
  -- seconds of clock skew), so a late bounce of a message a resend replaced never flags it.
  IF held.stream = 'transactional' AND held.kind = 'cognito' AND held.recipient_user_id IS NOT NULL
     AND held.state IN ('bounced', 'suppressed', 'rejected', 'complained') THEN
    WITH flagged AS (
      UPDATE invitation i SET undelivered_at = held.sent_at, undelivered_reason = held.state
       WHERE i.user_id = held.recipient_user_id AND i.accepted_at IS NULL AND held.sent_at >= i.sent_at - interval '5 seconds'
         AND (i.undelivered_at IS NULL OR i.undelivered_at <= held.sent_at)
      RETURNING i.id, i.sent_at
    )
    SELECT f.id INTO invitation_undelivered FROM flagged f ORDER BY f.sent_at DESC, f.id LIMIT 1;
  END IF;

  -- The screening's own outcomes: the refusal list, the bounce marks and the cut-off.
  IF held.stream = 'screening'
     AND ((held.state = 'bounced' AND held.bounce_kind = 'permanent') OR (held.state = 'complained' AND held.complaint_type <> 'not_spam')) THEN
    IF recipient IS NOT NULL AND btrim(recipient) <> '' THEN
      INSERT INTO screening_mail_refusal (recipient_sha256, reason, recorded_at, expires_at)
      VALUES (mail_recipient_sha256(recipient, held.state = 'bounced'), CASE WHEN held.state = 'bounced' THEN 'bounced' ELSE 'complained' END, now(), now() + interval '365 days')
      ON CONFLICT (recipient_sha256) DO UPDATE SET reason = EXCLUDED.reason, recorded_at = EXCLUDED.recorded_at, expires_at = EXCLUDED.expires_at;
    END IF;
    IF held.state = 'bounced' AND priced.id IS NOT NULL THEN
      INSERT INTO screening_bounce_mark (subject, subject_kind, ses_message_id, bounced_at, expires_at)
      SELECT v.marked, v.marked_kind, message_id, happened, happened + interval '7 days'
        FROM (VALUES (priced.rate_subject, 'account'), (priced.client_subject, 'client')) AS v (marked, marked_kind)
       WHERE v.marked IS NOT NULL
      ON CONFLICT DO NOTHING;
    END IF;
    stream_paused := mail_stream_cutoff(request);
  END IF;
  RETURN NEXT;
END;
$$;

-- As migration 20261111090000 left it, with the key notices: an expired one that is no longer pending goes too.
CREATE OR REPLACE FUNCTION operator_mail_expire(at_most integer) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  removed integer := 0;
  counted integer;
BEGIN
  IF at_most IS NULL OR at_most < 1 THEN
    RAISE EXCEPTION 'expire at least one row a run' USING ERRCODE = 'check_violation';
  END IF;
  DELETE FROM screening_bounce_mark b
   WHERE (b.subject_kind, b.subject, b.ses_message_id) IN (
     SELECT x.subject_kind, x.subject, x.ses_message_id FROM screening_bounce_mark x WHERE x.expires_at <= now() ORDER BY x.expires_at LIMIT at_most);
  GET DIAGNOSTICS counted = ROW_COUNT;
  removed := removed + counted;
  DELETE FROM mail_send m
   WHERE m.ses_message_id IN (SELECT x.ses_message_id FROM mail_send x WHERE x.expires_at <= now() ORDER BY x.expires_at LIMIT at_most);
  GET DIAGNOSTICS counted = ROW_COUNT;
  removed := removed + counted;
  DELETE FROM screening_mail_refusal f
   WHERE f.recipient_sha256 IN (SELECT x.recipient_sha256 FROM screening_mail_refusal x WHERE x.expires_at <= now() ORDER BY x.expires_at LIMIT at_most);
  GET DIAGNOSTICS counted = ROW_COUNT;
  removed := removed + counted;
  DELETE FROM password_notice p
   WHERE p.id IN (SELECT x.id FROM password_notice x WHERE x.expires_at <= now() AND x.state <> 'pending' ORDER BY x.expires_at LIMIT at_most);
  GET DIAGNOSTICS counted = ROW_COUNT;
  removed := removed + counted;
  DELETE FROM hardware_key_notice n
   WHERE n.id IN (SELECT x.id FROM hardware_key_notice x WHERE x.expires_at <= now() AND x.state <> 'pending' ORDER BY x.expires_at LIMIT at_most);
  GET DIAGNOSTICS counted = ROW_COUNT;
  RETURN removed + counted;
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- 13. The reserved audit actions
-- ---------------------------------------------------------------------------------------------------

-- As migration 20261111090000 left it, with the nine actions only the functions above write. hardware_key_registered
-- is not reserved here: the previous image writes it directly during the deploy, and the registry row, not the audit
-- row, is what makes a key live; the contract migration reserves it.
DROP POLICY audit_event_record ON audit_event;
CREATE POLICY audit_event_record ON audit_event FOR INSERT TO tp_app
  WITH CHECK (
    actor_id = app_actor_id()
    AND actor_kind IN ('user', 'service')
    AND action NOT IN ('notice_sent', 'security_event', 'sign_in_failed', 'data_key_destroyed', 'notice_undelivered', 'mail_stream_paused', 'mail_stream_resumed',
                       'organization_suspended', 'organization_reinstated', 'password_notice_sent', 'password_notice_undelivered',
                       'hardware_key_removal_requested', 'hardware_key_removal_confirmed', 'hardware_key_removal_cancelled', 'hardware_key_removal_expired',
                       'hardware_key_registration_opened', 'hardware_key_notice_sent', 'hardware_key_notice_undelivered', 'provider_signed_out',
                       'provider_sign_out_undelivered')
    AND (practice_id IS NULL OR practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]))
  );

-- ---------------------------------------------------------------------------------------------------
-- 14. Privileges, once: every table and function this migration creates or replaces is revoked from PUBLIC and granted
-- to exactly its role (CREATE OR REPLACE keeps an ACL, so the two replaced functions are stated again)
-- ---------------------------------------------------------------------------------------------------

REVOKE ALL ON hardware_key, hardware_key_removal, hardware_key_notice, provider_sign_out FROM PUBLIC;
REVOKE ALL ON hardware_key, hardware_key_removal, hardware_key_notice, provider_sign_out FROM tp_app;
REVOKE ALL ON hardware_key, hardware_key_removal, hardware_key_notice, provider_sign_out FROM tp_operator;
GRANT INSERT (key_credential_sha256) ON user_session TO tp_app;
REVOKE ALL ON FUNCTION hardware_key_is_final(), hardware_key_removal_is_final(), account_removes_keys(uuid), actor_key_session(uuid),
  account_key_registration_closed(uuid), hardware_key_opening_usable(uuid, timestamptz), user_session_hardware_key(),
  membership_end_marks_account(), membership_removal_target_holds(), audit_event_provider_sign_out(),
  hardware_key_record(bytea, bytea, bytea, timestamptz, text), hardware_key_registration_judge(bytea, timestamptz, text),
  sign_in_hardware_keys(uuid), sign_in_key_refused(uuid, text, text), hardware_key_removal_request(uuid, uuid, text),
  hardware_key_removal_confirm(uuid, uuid, text), hardware_key_removal_cancel(uuid, uuid, text), hardware_key_removals(),
  hardware_key_registration_open(uuid, uuid, bytea, text), operator_provider_sign_out_claim(),
  operator_provider_sign_out_done(uuid, smallint, text, text), operator_provider_sign_out_failed(uuid, smallint, text, text),
  operator_provider_sign_outs_overdue(text), operator_provider_sign_out_reported(uuid, text), operator_provider_sign_outs_expire(integer),
  operator_key_removals_expire(integer, text), hardware_key_notice_report_undelivered(uuid, text), operator_key_notices_stale(integer, text),
  operator_key_notices_due(integer), operator_key_notice_claim(uuid), operator_key_notice_sent(uuid, text, text),
  operator_key_notice_failed(uuid, text, boolean, text),
  operator_record_mail_event(text, text, text, timestamptz, timestamptz, text, text, uuid, uuid, uuid, text, text, text, text),
  operator_mail_expire(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hardware_key_record(bytea, bytea, bytea, timestamptz, text), hardware_key_registration_judge(bytea, timestamptz, text),
  sign_in_hardware_keys(uuid), sign_in_key_refused(uuid, text, text), hardware_key_removal_request(uuid, uuid, text),
  hardware_key_removal_confirm(uuid, uuid, text), hardware_key_removal_cancel(uuid, uuid, text), hardware_key_removals(),
  hardware_key_registration_open(uuid, uuid, bytea, text) TO tp_app;
GRANT EXECUTE ON FUNCTION operator_provider_sign_out_claim(), operator_provider_sign_out_done(uuid, smallint, text, text),
  operator_provider_sign_out_failed(uuid, smallint, text, text), operator_provider_sign_outs_overdue(text),
  operator_provider_sign_out_reported(uuid, text), operator_provider_sign_outs_expire(integer), operator_key_removals_expire(integer, text),
  operator_key_notices_stale(integer, text), operator_key_notices_due(integer), operator_key_notice_claim(uuid),
  operator_key_notice_sent(uuid, text, text), operator_key_notice_failed(uuid, text, boolean, text),
  operator_record_mail_event(text, text, text, timestamptz, timestamptz, text, text, uuid, uuid, uuid, text, text, text, text),
  operator_mail_expire(integer) TO tp_operator;

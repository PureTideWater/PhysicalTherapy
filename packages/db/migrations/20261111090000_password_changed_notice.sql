-- The password-changed notice (Schema PR 1 of the queue; part 2 of the auth emails; test matrix SGN-16). After migration
-- 20261110090000. Decisions: docs/adr/0091 (new); and docs/adr/0065, 0049 and 0009.
--
-- What it adds:
-- - password_notice: the outbox of the email that tells an account's address its password was changed. Global and the
--   owner's alone (forced row-level security, the owner's policy, no grant to any role): a user's ID, the reset event's
--   ID and time, the send's state, its SES message ID and an error code. No PHI, no address and no name; the address
--   is read only by operator_password_notice_claim(), for a pending notice that is due and under 24 hours old.
-- - audit_event_password_notice, an AFTER INSERT trigger on audit_event: the database writes one pending notice in the
--   reset's own transaction (the web is unchanged), for password_reset_completed alone, and only when a person records
--   it about themselves (the guard: actor_kind user, object_type user, object_id the actor; docs/adr/0091 D3), so no
--   event can send a notice to another account's address. One notice an event (password_notice_once).
-- - The mail kind password_changed, on the transactional stream (mail_send_kind and mail_send_stream_kind).
-- - password_notice_report_undelivered(), the one helper that reports a notice undelivered (password_notice_undelivered
--   in the audit log), once a notice, called by exactly four definers: the record of an SES event, the record of the
--   send (an undelivered state that arrived first), a failed send, and the stale sweep.
-- - Five operator functions for the platform's password_notices job, in the order it calls them each minute:
--   operator_password_notices_stale(at_most, request) fails and reports every pending notice 24 hours old
--   (NoticeStale); operator_password_notices_due(at_most) lists the pending, due notices under 24 hours (IDs only);
--   operator_password_notice_claim(notice) locks one, checks the cutoff again under the lock, and returns its account's
--   ID, address and change time; operator_password_notice_sent(notice, message_id, request) records the message SES
--   accepted (password_notice_sent) in the claim's transaction; operator_password_notice_failed(notice, error_name,
--   permanent, request), in a new transaction after a send that threw, retries after 1, 5, 15 and 60 minutes and fails
--   it at the fifth try or at once on a permanent error.
-- - operator_record_mail_event() returns a seventh column, password_notice_undelivered, last (an OUT column cannot be
--   added in place, so it is dropped and created, its body that of migration 20261107090000 with exactly the notice's
--   additions, and its privileges stated again); the notice takes its message's state, and a message-ID lock
--   (pg_advisory_xact_lock on 'password_notice:' and the ID), taken by this function before it writes the mail record
--   and by the send before it reads it, makes the end state the same in any order of the send and SES's events.
-- - operator_mail_expire() also deletes notices 90 days after the change, never one still pending.
-- - The application role may no longer write the audit actions password_notice_sent and password_notice_undelivered
--   (the audit_event_record policy, as migration 20261108090000 left it, with the two reserved).
--
-- Tables touched: password_notice (new); mail_send (its two kind CHECKs rewritten in one ALTER TABLE: one scan);
-- audit_event (the audit_event_record policy recreated; one AFTER INSERT trigger added); "user" (referenced by the new
-- foreign key: locked, not changed). No PHI table, no ledger table, no rule table and no pricing table is touched; no
-- function sets app.practice_ids or app.actor_id. Every function is revoked from PUBLIC: the five operator functions,
-- the record and the expiry are SECURITY DEFINER, owned by tp_owner, granted to tp_operator alone; the trigger function
-- is SECURITY DEFINER and granted to no role (a trigger fires without EXECUTE); the helper is SECURITY INVOKER and
-- granted to no role. Runs as tp_owner.
--
-- The locks (docs/adr/0091 D11; docs/adr/0083's loop): "user" SHARE ROW EXCLUSIVE for the foreign key, audit_event
-- ACCESS EXCLUSIVE for the policy and the trigger, mail_send ACCESS EXCLUSIVE for the CHECKs, taken together with
-- NOWAIT in one subtransaction, once a second, up to 300 tries. A refused try holds and queues nothing, so a sign-in
-- (which writes audit_event and then "user") goes on and never deadlocks against it. If no moment comes in five minutes
-- it fails with '"user", audit_event or mail_send stayed in use for five minutes; run the deploy again (docs/adr/0091)'
-- (55P03), before any service moves, and the deploy is run again. Once held, to the commit (the DDL and one scan of
-- mail_send, at most about 91 days of messages), these wait and then proceed: every write of "user" (sign-in
-- bookkeeping, record_sign_in_with_mfa, a settings save), every audited mutation and every read of audit_event, every
-- read or write of mail_send (the mail_events job, the console's mail page).
--
-- Safe with the previous image running, and on rollback (ADR 0009:42-43; ADR 0049; docs/adr/0091 D12): every object is
-- added and the CHECKs only widen.
-- - The web is unchanged; its reset now also queues a notice, in its own transaction.
-- - The previous platform image selects operator_record_mail_event()'s six columns by name (the seventh is last), calls
--   operator_mail_expire(integer) with the new body (which never deletes a pending notice), writes neither reserved
--   action, and has no password_notices job: notices wait pending until the new image sends them, inside the cutoff,
--   or fails and reports them as stale past it. It cannot read an SES event of kind password_changed (its dead-letter
--   queue holds it until it is redriven); such events exist only after the new image sends.
-- - A rollback of the image keeps this schema; roll forward rather than stay back (docs/runbooks/deploy-and-rollback.md).
-- Rollout: migrate, then the new platform image (with the operator role's transactional statement and SUPPORT_EMAIL),
-- then the rest; the web needs nothing.
--
-- Not in it: SS-01 D11's REVOKE of organization.status from the application role (no deploy fact yet), and ADR 0081 A6
-- (Schema PR 6).

-- ---------------------------------------------------------------------------------------------------
-- Preflight: what this migration replaces is what its design read, and nothing it creates exists
-- ---------------------------------------------------------------------------------------------------

DO $$
DECLARE
  columns text[];
BEGIN
  IF to_regclass('public.password_notice') IS NOT NULL THEN
    RAISE EXCEPTION 'password_notice already exists; migration 20261111090000 creates it' USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF to_regprocedure('audit_event_password_notice()') IS NOT NULL THEN
    RAISE EXCEPTION 'audit_event_password_notice() already exists; migration 20261111090000 creates it' USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF to_regprocedure('operator_record_mail_event(text, text, text, timestamptz, timestamptz, text, text, uuid, uuid, uuid, text, text, text, text)') IS NULL THEN
    RAISE EXCEPTION 'operator_record_mail_event() of migration 20261107090000 does not exist; migration 20261111090000 recreates it' USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  SELECT array_agg(a.name ORDER BY a.n) INTO columns
    FROM pg_proc p, unnest(p.proargnames, p.proargmodes) WITH ORDINALITY AS a (name, mode, n)
   WHERE p.oid = 'operator_record_mail_event(text, text, text, timestamptz, timestamptz, text, text, uuid, uuid, uuid, text, text, text, text)'::regprocedure AND a.mode = 't';
  IF columns IS DISTINCT FROM ARRAY['recorded', 'state', 'notice_undelivered', 'invoice_undelivered', 'invitation_undelivered', 'stream_paused']
     OR position('invitation_undelivered := NULL;' IN pg_get_functiondef('operator_record_mail_event(text, text, text, timestamptz, timestamptz, text, text, uuid, uuid, uuid, text, text, text, text)'::regprocedure)) = 0
     OR position('stream_paused := mail_stream_cutoff(request);' IN pg_get_functiondef('operator_record_mail_event(text, text, text, timestamptz, timestamptz, text, text, uuid, uuid, uuid, text, text, text, text)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'operator_record_mail_event() is not the body of migration 20261107090000 that migration 20261111090000 replaces; rebase this migration on its latest body'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF position('DELETE FROM screening_mail_refusal f' IN pg_get_functiondef('operator_mail_expire(integer)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'operator_mail_expire(integer) is not the body of migration 20261107090000 that migration 20261111090000 replaces; rebase this migration on its latest body'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'audit_event' AND policyname = 'audit_event_record'
       AND position('organization_reinstated' IN with_check) > 0 AND position('password_notice_sent' IN with_check) = 0
  ) THEN
    RAISE EXCEPTION 'audit_event_record is not the policy of migration 20261108090000 that migration 20261111090000 replaces; rebase this migration on its latest text'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF position('password_changed' IN (SELECT pg_get_constraintdef(c.oid) FROM pg_constraint c WHERE c.conrelid = 'mail_send'::regclass AND c.conname = 'mail_send_kind')) > 0 THEN
    RAISE EXCEPTION 'mail_send_kind already admits password_changed; migration 20261111090000 adds it' USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- The table locks, without a queue (docs/adr/0091, D11)
-- ---------------------------------------------------------------------------------------------------

-- A new-device sign-in holds audit_event (the user_device_security_events trigger) and then updates "user", so a plain
-- wait on "user" would stall every sign-in behind it and could never win. Each try below takes the three locks in one
-- subtransaction with NOWAIT: a refused try releases what it took and queues nobody. Held to the end of the migration.
DO $$
BEGIN
  FOR attempt IN 1..300 LOOP
    BEGIN
      LOCK TABLE "user" IN SHARE ROW EXCLUSIVE MODE NOWAIT;
      LOCK TABLE audit_event IN ACCESS EXCLUSIVE MODE NOWAIT;
      LOCK TABLE mail_send IN ACCESS EXCLUSIVE MODE NOWAIT;
      RETURN;
    EXCEPTION WHEN lock_not_available THEN
      PERFORM pg_sleep(1);
    END;
  END LOOP;
  RAISE EXCEPTION '"user", audit_event or mail_send stayed in use for five minutes; run the deploy again (docs/adr/0091)' USING ERRCODE = 'lock_not_available';
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- 1. The kind password_changed, on the transactional stream (docs/adr/0091, D5)
-- ---------------------------------------------------------------------------------------------------

-- Both CHECKs in one ALTER TABLE, so PostgreSQL validates them in a single scan of mail_send (A-2). Their literals keep
-- MAIL_KINDS's and MAIL_STREAM_KINDS's order (packages/db/src/schema/operations.ts). mail_send_subject is unchanged: a
-- password_changed message names its subject, the notice's ID.
ALTER TABLE mail_send
  DROP CONSTRAINT mail_send_kind,
  ADD CONSTRAINT mail_send_kind CHECK (kind IN ('cognito', 'digest', 'password_changed', 'dunning', 'support_grant_opened', 'support_grant_closed',
    'screening_result', 'screening_failed', 'screening_reminder', 'screening_withdrawal', 'probe')),
  DROP CONSTRAINT mail_send_stream_kind,
  ADD CONSTRAINT mail_send_stream_kind CHECK (
       (stream = 'transactional' AND kind IN ('cognito', 'digest', 'password_changed', 'probe'))
    OR (stream = 'notices' AND kind IN ('support_grant_opened', 'support_grant_closed', 'dunning', 'probe'))
    OR (stream = 'screening' AND kind IN ('screening_result', 'screening_failed', 'screening_reminder', 'screening_withdrawal', 'probe')));

-- ---------------------------------------------------------------------------------------------------
-- 2. The outbox (docs/adr/0091, D4)
-- ---------------------------------------------------------------------------------------------------

-- One row a completed reset: pending until SES accepts its message (sent), then delivered or undelivered as SES reports
-- it, or failed when never accepted (the SES error's name, Unrecognized, or NoticeStale past the cutoff). No index on
-- user_id: no user row is ever deleted, and nothing reads notices by user. No foreign key to audit_event, which is
-- append-only and guarded by its own triggers: a key would add a lock to every reset's insert for nothing. expires_at
-- is changed_at plus 90 days, written by the trigger; its CHECK is a range, as mail_send_expiry_window's, so the
-- session's time zone never makes a write fail.
CREATE TABLE password_notice (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES "user" (id),
  audit_event_id uuid NOT NULL CONSTRAINT password_notice_once UNIQUE,
  changed_at timestamptz NOT NULL,
  state text NOT NULL DEFAULT 'pending' CONSTRAINT password_notice_state CHECK (state IN ('pending', 'sent', 'delivered', 'undelivered', 'failed')),
  attempts smallint NOT NULL DEFAULT 0 CONSTRAINT password_notice_attempts CHECK (attempts BETWEEN 0 AND 5),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  ses_message_id text UNIQUE CONSTRAINT password_notice_message_id CHECK (ses_message_id ~ '^[A-Za-z0-9-]{20,100}$'),
  error_code text CONSTRAINT password_notice_error_code CHECK (error_code ~ '^[A-Za-z]{1,64}$'),
  sent_at timestamptz,
  undelivered_reported_at timestamptz,
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT password_notice_sent CHECK ((ses_message_id IS NULL) = (state IN ('pending', 'failed')) AND (ses_message_id IS NULL) = (sent_at IS NULL)),
  CONSTRAINT password_notice_failed CHECK ((state = 'failed') = (error_code IS NOT NULL)),
  CONSTRAINT password_notice_reported CHECK (undelivered_reported_at IS NULL OR state IN ('undelivered', 'failed')),
  CONSTRAINT password_notice_expiry_window CHECK (expires_at > changed_at AND expires_at <= changed_at + interval '91 days')
);
-- Due and stale both scan only pending rows.
CREATE INDEX password_notice_pending ON password_notice (next_attempt_at) WHERE state = 'pending';
CREATE INDEX password_notice_by_expiry ON password_notice (expires_at);
CREATE TRIGGER password_notice_updated_at BEFORE UPDATE ON password_notice FOR EACH ROW EXECUTE FUNCTION set_updated_at();
ALTER TABLE password_notice ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_notice FORCE ROW LEVEL SECURITY;
CREATE POLICY password_notice_owner ON password_notice FOR ALL TO tp_owner USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------------------------------
-- 3. The undelivered report: one helper, four callers (docs/adr/0091, D8)
-- ---------------------------------------------------------------------------------------------------

-- A notice undelivered (bounced, suppressed or rejected) or failed, reported once: password_notice_undelivered in the
-- audit log, naming the account. True exactly once a notice. Its callers are the four definers below (the record of an
-- SES event, the record of the send, a failed send and the stale sweep), which run as the owner; granted to no role.
CREATE FUNCTION password_notice_report_undelivered(notice uuid, request text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SET search_path = pg_catalog, public, pg_temp AS $$
#variable_conflict use_variable
DECLARE
  reported password_notice%ROWTYPE;
BEGIN
  UPDATE password_notice p SET undelivered_reported_at = now()
   WHERE p.id = notice AND p.undelivered_reported_at IS NULL AND p.state IN ('undelivered', 'failed')
  RETURNING p.* INTO reported;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  INSERT INTO audit_event (actor_kind, action, object_type, object_id, purpose, request_id)
  VALUES ('system', 'password_notice_undelivered', 'user', reported.user_id, 'password_changed', request);
  RETURN true;
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- 4. What queues a notice: the account's own completed reset (docs/adr/0091, D1 to D3)
-- ---------------------------------------------------------------------------------------------------

-- Written in the reset's own transaction (the web's withActor transaction that ends the account's sessions and records
-- password_reset_completed), so a notice exists only if the event does, and only after the app's sessions ended. A
-- definer owned by tp_owner, so the web's insert as tp_app writes a table tp_app cannot touch; it fires for every role's
-- insert. Its insert can fail only on the actor's own row (read in the same transaction) or a CHECK on the event's own
-- values, and ON CONFLICT covers the key, so it stops no reset; a lost notice would fail silently, so nothing catches.
CREATE FUNCTION audit_event_password_notice() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  INSERT INTO password_notice (user_id, audit_event_id, changed_at, expires_at)
  VALUES (NEW.actor_id, NEW.id, NEW.at, NEW.at + interval '90 days')
  ON CONFLICT ON CONSTRAINT password_notice_once DO NOTHING;
  RETURN NULL;
END;
$$;
-- The guard (D3): the actor is a person (not a job's service actor, nor the database's system), and the object is that
-- person's own account. audit_event_record lets a user name any object, so without it one user's event could send a
-- notice to another's address. An event that does not match is recorded as before and queues nothing.
CREATE TRIGGER audit_event_password_notice AFTER INSERT ON audit_event FOR EACH ROW
  WHEN (NEW.action = 'password_reset_completed' AND NEW.actor_kind = 'user' AND NEW.object_type = 'user' AND NEW.object_id = NEW.actor_id)
  EXECUTE FUNCTION audit_event_password_notice();

-- ---------------------------------------------------------------------------------------------------
-- 5. The platform's password_notices job (tp_operator; docs/adr/0091, D6 and D7)
-- ---------------------------------------------------------------------------------------------------

-- None calls operator_assert_scope: a password notice names no practice, and the job runs each with app.practice_ids
-- empty. Each step is its own transaction but the claim's, which lasts through the send and its record.

-- Step 1, first each minute: every pending notice whose change is 24 hours old is never sent (a "your password was
-- changed" email a day late misleads more than it helps): failed as NoticeStale, attempts unchanged, and reported. A
-- notice a claim holds is left to it. Returns the notices this call reported.
CREATE FUNCTION operator_password_notices_stale(at_most integer, request text) RETURNS TABLE (notice_id uuid, user_id uuid)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
#variable_conflict use_variable
DECLARE
  stale password_notice%ROWTYPE;
BEGIN
  FOR stale IN
    SELECT p.* FROM password_notice p
     WHERE p.state = 'pending' AND p.changed_at <= now() - interval '24 hours'
     ORDER BY p.changed_at, p.id
     LIMIT greatest(at_most, 0)
       FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE password_notice p SET state = 'failed', error_code = 'NoticeStale' WHERE p.id = stale.id;
    IF password_notice_report_undelivered(stale.id, request) THEN
      notice_id := stale.id;
      user_id := stale.user_id;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

-- Step 2: the notices due a send (pending, their next attempt come, under 24 hours old), oldest attempt first. IDs only.
CREATE FUNCTION operator_password_notices_due(at_most integer) RETURNS TABLE (notice_id uuid, user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT p.id, p.user_id
    FROM password_notice p
   WHERE p.state = 'pending' AND p.next_attempt_at <= now() AND p.changed_at > now() - interval '24 hours'
   ORDER BY p.next_attempt_at, p.id
   LIMIT greatest(at_most, 0)
$$;

-- Step 3, in the transaction that sends the one message and records it: locks the notice if it is still pending, due
-- and under 24 hours old (the cutoff checked again under the lock), and returns its account's ID, address and the
-- change's time. The only reader of the address. Nothing when another run holds it, or it is not due, not pending or
-- past the cutoff. No status filter on the account: one disabled after the reset is still told.
CREATE FUNCTION operator_password_notice_claim(notice uuid) RETURNS TABLE (user_id uuid, email text, changed_at timestamptz)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
#variable_conflict use_variable
BEGIN
  PERFORM 1 FROM password_notice p
    WHERE p.id = notice AND p.state = 'pending' AND p.next_attempt_at <= now() AND p.changed_at > now() - interval '24 hours'
      FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT p.user_id, u.email, p.changed_at FROM password_notice p JOIN "user" u ON u.id = p.user_id WHERE p.id = notice;
END;
$$;

-- Step 3's record, before the claim's transaction commits: the message SES accepted, once, while pending, with
-- password_notice_sent. The message-ID lock comes before the read of the mail record, so an SES event of the message
-- being recorded meanwhile is read once it commits (the mirror takes the same lock before it writes). The notice takes
-- F of that record: undelivered when it is bounced, suppressed or rejected; delivered when it was delivered; sent
-- otherwise. True when that is undelivered and this reported it. The cutoff is not checked again: a message SES
-- accepted is recorded as sent.
CREATE FUNCTION operator_password_notice_sent(notice uuid, message_id text, request text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
#variable_conflict use_variable
DECLARE
  arrived mail_send%ROWTYPE;
  told uuid;
  now_state text;
BEGIN
  IF message_id IS NULL OR message_id !~ '^[A-Za-z0-9-]{20,100}$' THEN
    RAISE EXCEPTION 'a password notice is recorded with the message ID SES gave' USING ERRCODE = 'check_violation', CONSTRAINT = 'password_notice_message_id';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('password_notice:' || message_id, 0));
  SELECT m.* INTO arrived FROM mail_send m WHERE m.ses_message_id = message_id;
  UPDATE password_notice p
     SET ses_message_id = message_id, sent_at = now(),
         state = CASE WHEN arrived.state IN ('bounced', 'suppressed', 'rejected') THEN 'undelivered'
                      WHEN arrived.delivered_at IS NOT NULL THEN 'delivered'
                      ELSE 'sent' END
   WHERE p.id = notice AND p.state = 'pending'
  RETURNING p.user_id, p.state INTO told, now_state;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'a password notice is recorded as sent once, while pending' USING ERRCODE = 'check_violation', CONSTRAINT = 'password_notice_sent';
  END IF;
  INSERT INTO audit_event (actor_kind, action, object_type, object_id, purpose, request_id)
  VALUES ('system', 'password_notice_sent', 'user', told, 'password_changed', request);
  IF now_state = 'undelivered' THEN
    RETURN password_notice_report_undelivered(notice, request);
  END IF;
  RETURN false;
END;
$$;

-- Step 4, a send that threw, in a new transaction after the rollback: one attempt more, the next after 1, 5, 15 and 60
-- minutes; failed after the fifth, or at once for a permanent SES error, with the error's name (a code, never its
-- message; Unrecognized for anything else), which reports it (true). A notice no longer pending is unchanged.
CREATE FUNCTION operator_password_notice_failed(notice uuid, error_name text, permanent boolean, request text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
#variable_conflict use_variable
DECLARE
  now_state text;
BEGIN
  UPDATE password_notice p
     SET attempts = p.attempts + 1,
         state = CASE WHEN coalesce(permanent, false) OR p.attempts + 1 >= 5 THEN 'failed' ELSE 'pending' END,
         error_code = CASE WHEN coalesce(permanent, false) OR p.attempts + 1 >= 5
                           THEN CASE WHEN error_name ~ '^[A-Za-z]{1,64}$' THEN error_name ELSE 'Unrecognized' END END,
         next_attempt_at = CASE WHEN coalesce(permanent, false) OR p.attempts + 1 >= 5 THEN p.next_attempt_at
                                ELSE now() + make_interval(mins => (ARRAY[1, 5, 15, 60])[p.attempts + 1]) END
   WHERE p.id = notice AND p.state = 'pending'
  RETURNING p.state INTO now_state;
  IF now_state = 'failed' THEN
    RETURN password_notice_report_undelivered(notice, request);
  END IF;
  RETURN false;
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- 6. The record of an SES event: a seventh column (docs/adr/0091, D8)
-- ---------------------------------------------------------------------------------------------------

-- As migration 20261107090000 created it, with the password-changed notice: a password_changed message's events take
-- the message-ID lock before the mail record is written (A-3); once the record's state moves, the notice holding the
-- message takes F's step (sent to delivered; sent or delivered to undelivered on a bounce, a suppression or a
-- rejection, reported once through password_notice_undelivered, the notice's ID; a delay or a complaint changes
-- nothing, and undelivered is final). A notice still pending or failed holds no message ID and is never touched. Its
-- result columns are the six of 20261107090000 and password_notice_undelivered last, so the previous image's call,
-- which names the six, still runs. Dropped and created: an OUT column cannot be added in place.
DROP FUNCTION operator_record_mail_event(text, text, text, timestamptz, timestamptz, text, text, uuid, uuid, uuid, text, text, text, text);
CREATE FUNCTION operator_record_mail_event(message_id text, stream text, event text, mail_at timestamptz, event_at timestamptz, recipient text,
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

-- ---------------------------------------------------------------------------------------------------
-- 7. Expiry: the notices too (docs/adr/0091, D14)
-- ---------------------------------------------------------------------------------------------------

-- The nightly mail_expiry job: at most at_most expired rows of each of the bounce marks, the messages, the refusal list
-- and the password-changed notices. Returns how many went. A notice still pending is never expired (A-4): the stale
-- sweep fails and reports it first, so no notice disappears without a page, even after a long rollback.
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
  RETURN removed + counted;
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- 8. The reserved audit actions
-- ---------------------------------------------------------------------------------------------------

-- As migration 20261108090000 left it, with the two actions the outbox writes reserved too. password_reset_completed
-- stays the web's to write.
DROP POLICY audit_event_record ON audit_event;
CREATE POLICY audit_event_record ON audit_event FOR INSERT TO tp_app
  WITH CHECK (
    actor_id = app_actor_id()
    AND actor_kind IN ('user', 'service')
    AND action NOT IN ('notice_sent', 'security_event', 'sign_in_failed', 'data_key_destroyed', 'notice_undelivered', 'mail_stream_paused', 'mail_stream_resumed',
                       'organization_suspended', 'organization_reinstated', 'password_notice_sent', 'password_notice_undelivered')
    AND (practice_id IS NULL OR practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]))
  );

-- ---------------------------------------------------------------------------------------------------
-- 9. Privileges, once: the table and every function this migration creates or recreates is revoked from PUBLIC and
-- granted to exactly its role (CREATE OR REPLACE keeps an ACL, so the replaced function is stated again)
-- ---------------------------------------------------------------------------------------------------

REVOKE ALL ON password_notice FROM PUBLIC;
REVOKE ALL ON password_notice FROM tp_app;
REVOKE ALL ON FUNCTION password_notice_report_undelivered(uuid, text), audit_event_password_notice(),
  operator_password_notices_stale(integer, text), operator_password_notices_due(integer), operator_password_notice_claim(uuid),
  operator_password_notice_sent(uuid, text, text), operator_password_notice_failed(uuid, text, boolean, text),
  operator_record_mail_event(text, text, text, timestamptz, timestamptz, text, text, uuid, uuid, uuid, text, text, text, text),
  operator_mail_expire(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION operator_password_notices_stale(integer, text), operator_password_notices_due(integer),
  operator_password_notice_claim(uuid), operator_password_notice_sent(uuid, text, text),
  operator_password_notice_failed(uuid, text, boolean, text),
  operator_record_mail_event(text, text, text, timestamptz, timestamptz, text, text, uuid, uuid, uuid, text, text, text, text),
  operator_mail_expire(integer) TO tp_operator;

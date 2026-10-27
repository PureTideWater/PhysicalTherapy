-- The mail streams, delivery recorded by message, notices from a recorded outbox, and the screening's cut-off (PR 6b-4 of
-- Change Order 001's PR 6b: audit #76; the founder's answers of 2026-10-21 to PR 6b's questions Q1 (the mail streams,
-- SES Essentials, address validation), Q9 (the cut-off: a 7-day window, floors of 200 and 2,500, half of SES's review
-- levels, a platform administrator resumes with a reason), Q10 (a) (a bounce budget per client and per email account),
-- Q11 (b) (a keyed hash of a refused screening address kept 12 months, only to refuse it) and Q12 (the screening's own
-- sender)). Decisions: docs/adr/0065 (new), 0062, 0049, 0050, 0019 and 0014.
--
-- - mail_stream: the three SES streams (transactional, notices, screening), one seeded row each. Only the screening
--   stream pauses (a CHECK): on its own rates over the window (permanent bounces above 3% of its sends, floor 200;
--   complaints other than not_spam above 0.08%, floor 2,500; the window starts 7 days ago or at the last resume, whichever
--   is later), on the account's warning alarms (account_rate) or on SES's enforcement (account_review), or by hand. A
--   pause clears the SES confirmation; a resume (a platform administrator, cause_fixed or false_alarm) resets the window,
--   makes the probes due at once and sends nothing until the platform's reconcile reads the screening set enabled again.
--   Each row is seeded confirmed: no stream has been paused, and the platform's reconcile clears the confirmation within
--   a minute should SES read the set disabled.
-- - mail_send: one row per message (each message has one recipient), keyed by SES's message ID, with its stream, kind,
--   subject, user (customer streams), the screening's prospect (set null when the prospect goes), state and the
--   bounce's or complaint's codes. No address and no hash of one. Kept 30 days on the screening stream and 90 on the
--   others (mail_send_expiry). States move one way: sent, delayed, delivered, then bounced, suppressed, rejected or
--   complained, and a lower-ranked event never overwrites a higher one, so events land in any order and once.
-- - mail_recipient_key and mail_recipient_sha256(): SHA-256 of a pepper made at this migration and the mailbox the
--   address reaches (mail_recipient_canonical(): case, white space, Unicode NFKC, a +tag, googlemail.com and Gmail's
--   dots), so every spelling of one inbox keys alike. The only address-derived value kept is screening_mail_refusal's
--   (Q11 (b)): a screening address that bounced permanently or was reported as spam (not not_spam), for 365 days, read
--   only to refuse a new screening to it. No customer stream's outcome is ever on the list.
-- - screening_bounce_mark (Q10 (a)): one 7-day mark per screening permanent bounce for each of the run's keyed subjects,
--   its account's (screening_run.rate_subject, migration 20261106090000) and its client's (screening_run.client_subject,
--   new: the rate limiter's keyed HMAC of the client address, null when the web had none); a subject with 3 live marks
--   is refused a new screening (screening_bounce_budget).
-- - The refusals, by triggers, so no function body of migrations 20261105090000 or 20261106090000 is copied but
--   submit_screening()'s: an accepted upload is refused while the screening stream is paused (screening_paused), BEFORE
--   INSERT on screening_upload, so a refused upload, which is never emailed, is still recorded with its reasons; a run
--   is refused for the bounce budget (screening_bounce_budget) and then for an address on the refusal list
--   (screening_contact_undeliverable), BEFORE INSERT on screening_run; and a claim, completion or failure of a run is
--   refused while the screening's mail is not sending (screening_mail_paused), BEFORE UPDATE OF status on screening_run.
--   In submit_screening() the refusals come in this order: closed; the ZIP statuses, the rows and
--   screening_band_outside_content; screening_paused; screening_bounce_budget; screening_contact_undeliverable. The
--   submitter's budget comes before the address (review S1), so no client or account past its budget can test an
--   address against the refusal list.
-- - The consumer (tp_screening) reads screening_mail_gate() before it claims; the web (tp_app) reads
--   screening_mail_status() (paused; ready once the screening's delivered and bounced probes have come back within
--   48 hours and since the last resume), and screening_submit_mail_refusal() before it spends an address validation
--   (closed, paused, the budget, the refusal list, in that order; review S4).
-- - Break-glass notices from a recorded outbox (support_grant_notice and support_grant_notice_recipient, both tenant
--   tables, registered, read by the application role under the practice's scope): the recipients are recorded first,
--   one row per current practice administrator, and each is sent in its own transaction; notice_sent is written at the
--   first send SES accepts, never before; a notice with no administrator writes notice_undelivered and no notice_sent;
--   the first undelivered recipient writes notice_undelivered once and notifies each current administrator in the app
--   (support_notice_undelivered). Dunning the same way (dunning_notice_recipient, billing's, no policy for any role).
--   operator_record_support_notice(), operator_practice_administrator_emails() and billing_owner_emails() are dropped.
-- - invitation gains undelivered_at and undelivered_reason: a Cognito message to an invited user that bounces, is
--   suppressed, rejected or reported, sent at or after the invitation's latest send (less 5 seconds), flags it.
-- - The application role may no longer write the audit actions notice_undelivered, mail_stream_paused and
--   mail_stream_resumed; notification gains the kind support_notice_undelivered.
-- - submit_screening() is dropped and created with one parameter more, client_subject text DEFAULT NULL after request,
--   its body that of migration 20261106090000 but for the run's client_subject (a db test diffs the two bodies).
--
-- Runs as tp_owner. Adds 8 tables (2 of them registered tenant tables), 2 columns on invitation and 1 on screening_run;
-- recreates the notification kind CHECK (a scan of notification under an ACCESS EXCLUSIVE lock) and the audit_event_record
-- policy. No PHI table but the two notice tables, no ledger table, no rule table and no pricing table is touched; no
-- function sets app.practice_ids. Safe with the previous image running, except during the deploy window:
-- 1. the previous platform task's support-access notices and dunning fail at the three dropped functions and roll back:
--    no notice is recorded or sent by it, and a dunning stage does not move; the new platform task sends each (an
--    opening due before the migration is still due: no notice row and no notice_sent; a closing keeps notified_at
--    null; the invoice keeps its stage). A rollback to the previous tag leaves both jobs failing the same way until the
--    new image returns;
-- 2. the previous web's submissions keep working: client_subject defaults to null, so their runs carry the account's
--    budget alone;
-- 3. the previous consumer does not read the mail gate; should the screening stream pause in the window, its claims and
--    completions are refused (screening_mail_paused) and pg-boss retries them; the screening is closed in production
--    until launch;
-- 4. the previous console reads console_support_grants() with its columns first, and the new ones after; the previous
--    web shows no support_notice_undelivered notification correctly until the new web is deployed (the new platform task
--    writes them only for a notice it sent);
-- 5. nothing the previous image sends goes through a configuration set, so no event of it is recorded.
-- Rollout: migrate, then the new worker image (the mail_events and mail_expiry jobs, the outboxes), then the new web.

-- ---------------------------------------------------------------------------------------------------
-- 1. The keyed hash of a screening address (D12; Q11 (b))
-- ---------------------------------------------------------------------------------------------------

-- One pepper of 64 hex characters, made here from two random UUIDs (the repository has no pgcrypto): 244 random bits,
-- each UUID's version and variant bits being fixed, so a copy of the refusal list alone cannot be matched against a
-- list of addresses. The owner's alone: no role holds a privilege
-- on it, and it never changes.
CREATE TABLE mail_recipient_key (
  id boolean PRIMARY KEY DEFAULT true CONSTRAINT mail_recipient_key_one CHECK (id),
  pepper text NOT NULL CONSTRAINT mail_recipient_key_pepper CHECK (pepper ~ '^[0-9a-f]{64}$')
);
INSERT INTO mail_recipient_key (pepper) VALUES (replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''));
CREATE TRIGGER mail_recipient_key_fixed BEFORE UPDATE OR DELETE ON mail_recipient_key FOR EACH ROW EXECUTE FUNCTION reject_change();
CREATE TRIGGER mail_recipient_key_no_truncate BEFORE TRUNCATE ON mail_recipient_key FOR EACH STATEMENT EXECUTE FUNCTION reject_change();
ALTER TABLE mail_recipient_key ENABLE ROW LEVEL SECURITY;
ALTER TABLE mail_recipient_key FORCE ROW LEVEL SECURITY;
CREATE POLICY mail_recipient_key_owner ON mail_recipient_key FOR ALL TO tp_owner USING (true) WITH CHECK (true);

-- The mailbox an address reaches, so every spelling of one inbox keys alike (review S2): canonicalMailbox() in
-- packages/db/src/mail-address.ts is the same rule, and mail.db.test.ts holds the two equal on a table of spellings.
-- Unicode NFKC (which composes as NFC does); ASCII white space dropped at either end; ASCII letters in lower case (the
-- "C" collation's rule, whatever the database's locale); split at the last @, an address with no local part or no
-- domain standing as read so far; the domain's trailing dots dropped and googlemail.com read as gmail.com; everything
-- from the local part's first + dropped, at every domain; and at gmail.com alone, the local part's dots dropped (Google:
-- dots do not matter in a Gmail address, and do in a Google Workspace one). A local part those two would leave empty is
-- kept. Used only to look an address up, never to send. Granted to no role.
CREATE FUNCTION mail_recipient_canonical(address text) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  as_read text := lower(btrim(normalize(coalesce(address, ''), NFKC), E' \t\n\r\f' || chr(11)) COLLATE "C");
  -- The last @, counted from the end.
  last_at integer := strpos(reverse(as_read), '@');
  local_part text;
  domain_part text;
  mailbox_part text;
BEGIN
  IF last_at = 0 THEN
    RETURN as_read;
  END IF;
  local_part := left(as_read, length(as_read) - last_at);
  domain_part := rtrim(right(as_read, last_at - 1), '.');
  IF local_part = '' OR domain_part = '' THEN
    RETURN as_read;
  END IF;
  IF domain_part = 'googlemail.com' THEN
    domain_part := 'gmail.com';
  END IF;
  mailbox_part := split_part(local_part, '+', 1);
  IF domain_part = 'gmail.com' THEN
    mailbox_part := replace(mailbox_part, '.', '');
  END IF;
  RETURN CASE WHEN mailbox_part = '' THEN local_part ELSE mailbox_part END || '@' || domain_part;
END;
$$;

-- The keyed hash of an address: SHA-256 of the pepper and the mailbox it reaches (mail_recipient_canonical()), as hex.
-- Granted to no role; it runs as its caller, the owner inside the definer functions and triggers below. It never raises
-- with its input.
CREATE FUNCTION mail_recipient_sha256(address text) RETURNS text
LANGUAGE sql STABLE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT encode(sha256(decode(k.pepper, 'hex') || convert_to(mail_recipient_canonical(address), 'UTF8')), 'hex') FROM mail_recipient_key k
$$;

-- ---------------------------------------------------------------------------------------------------
-- 2. The streams and the messages (D1, D3 to D6)
-- ---------------------------------------------------------------------------------------------------

CREATE TABLE mail_stream (
  stream text PRIMARY KEY CONSTRAINT mail_stream_name CHECK (stream IN ('transactional', 'notices', 'screening')),
  paused_at timestamptz,
  paused_reason text CONSTRAINT mail_stream_paused_reason CHECK (paused_reason IN ('bounce_rate', 'complaint_rate', 'account_rate', 'account_review', 'operator')),
  -- The platform administrator who paused it by hand; null for a pause the cut-off made.
  paused_by uuid REFERENCES "user" (id),
  -- The window's counts when it paused.
  pause_sends integer CONSTRAINT mail_stream_pause_sends CHECK (pause_sends >= 0),
  pause_bounces integer CONSTRAINT mail_stream_pause_bounces CHECK (pause_bounces >= 0),
  pause_complaints integer CONSTRAINT mail_stream_pause_complaints CHECK (pause_complaints >= 0),
  -- The last resume (or this migration): the window starts at the later of it and 7 days ago.
  window_starts_at timestamptz NOT NULL DEFAULT now(),
  resumed_at timestamptz,
  -- When the platform's reconcile last read the stream's SES configuration set enabled while the stream was open;
  -- cleared by a pause, by a resume and by a read of the set disabled. The screening's runs are claimed only with it.
  ses_enabled_confirmed_at timestamptz,
  probe_sent_at timestamptz,
  probe_delivered_at timestamptz,
  probe_bounced_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mail_stream_only_screening_pauses CHECK (stream = 'screening' OR paused_at IS NULL),
  CONSTRAINT mail_stream_pause_reason CHECK ((paused_at IS NULL) = (paused_reason IS NULL)),
  CONSTRAINT mail_stream_pause_by CHECK ((paused_by IS NOT NULL) = (paused_reason IS NOT DISTINCT FROM 'operator')),
  CONSTRAINT mail_stream_pause_counts CHECK ((paused_at IS NULL) = (pause_sends IS NULL)
    AND (pause_sends IS NULL) = (pause_bounces IS NULL) AND (pause_sends IS NULL) = (pause_complaints IS NULL)),
  CONSTRAINT mail_stream_paused_unconfirmed CHECK (paused_at IS NULL OR ses_enabled_confirmed_at IS NULL)
);
INSERT INTO mail_stream (stream, ses_enabled_confirmed_at) VALUES ('transactional', now()), ('notices', now()), ('screening', now());
CREATE TRIGGER mail_stream_updated_at BEFORE UPDATE ON mail_stream FOR EACH ROW EXECUTE FUNCTION set_updated_at();
ALTER TABLE mail_stream ENABLE ROW LEVEL SECURITY;
ALTER TABLE mail_stream FORCE ROW LEVEL SECURITY;
CREATE POLICY mail_stream_owner ON mail_stream FOR ALL TO tp_owner USING (true) WITH CHECK (true);

-- One row per message. sent_at is SES's mail.timestamp, from whichever event of the message came first.
CREATE TABLE mail_send (
  ses_message_id text PRIMARY KEY CONSTRAINT mail_send_message_id CHECK (ses_message_id ~ '^[A-Za-z0-9-]{20,100}$'),
  stream text NOT NULL REFERENCES mail_stream (stream),
  kind text NOT NULL CONSTRAINT mail_send_kind CHECK (kind IN ('cognito', 'digest', 'dunning', 'support_grant_opened', 'support_grant_closed',
    'screening_result', 'screening_failed', 'screening_reminder', 'screening_withdrawal', 'probe')),
  -- The notice row, digest, invoice, screening run or lead the message is about; null for Cognito's and a probe.
  subject_id uuid,
  -- The customer the message went to (its tp_recipient tag, or for Cognito's the user with the address); never on the
  -- screening stream.
  recipient_user_id uuid REFERENCES "user" (id),
  screening_prospect_id uuid REFERENCES screening_prospect (id) ON DELETE SET NULL,
  state text NOT NULL CONSTRAINT mail_send_state CHECK (state IN ('sent', 'delayed', 'delivered', 'bounced', 'suppressed', 'rejected', 'complained')),
  bounce_kind text CONSTRAINT mail_send_bounce_kind CHECK (bounce_kind IN ('permanent', 'transient', 'undetermined')),
  bounce_subtype text CONSTRAINT mail_send_bounce_subtype CHECK (bounce_subtype IN ('general', 'no_email', 'suppressed', 'on_account_suppression_list',
    'on_configuration_set_suppression_list', 'mailbox_full', 'message_too_large', 'content_rejected', 'attachment_rejected', 'undetermined', 'other')),
  complaint_type text CONSTRAINT mail_send_complaint_type CHECK (complaint_type IN ('abuse', 'auth_failure', 'fraud', 'not_spam', 'virus', 'other', 'unspecified')),
  sent_at timestamptz NOT NULL,
  delivered_at timestamptz,
  undelivered_at timestamptz,
  complained_at timestamptz,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CONSTRAINT mail_send_stream_kind CHECK (
       (stream = 'transactional' AND kind IN ('cognito', 'digest', 'probe'))
    OR (stream = 'notices' AND kind IN ('support_grant_opened', 'support_grant_closed', 'dunning', 'probe'))
    OR (stream = 'screening' AND kind IN ('screening_result', 'screening_failed', 'screening_reminder', 'screening_withdrawal', 'probe'))),
  CONSTRAINT mail_send_subject CHECK ((kind IN ('cognito', 'probe')) = (subject_id IS NULL)),
  CONSTRAINT mail_send_screening_names_no_user CHECK (stream <> 'screening' OR recipient_user_id IS NULL),
  CONSTRAINT mail_send_prospect_on_screening CHECK (stream = 'screening' OR screening_prospect_id IS NULL),
  CONSTRAINT mail_send_bounce CHECK ((state IN ('bounced', 'suppressed')) = (bounce_kind IS NOT NULL) AND (bounce_kind IS NULL) = (bounce_subtype IS NULL)),
  CONSTRAINT mail_send_complaint CHECK ((state = 'complained') = (complaint_type IS NOT NULL)),
  CONSTRAINT mail_send_expiry_window CHECK (expires_at > sent_at AND expires_at <= sent_at + interval '91 days')
);
CREATE INDEX mail_send_by_stream ON mail_send (stream, sent_at);
CREATE INDEX mail_send_by_subject ON mail_send (kind, subject_id) WHERE subject_id IS NOT NULL;
CREATE INDEX mail_send_by_prospect ON mail_send (screening_prospect_id) WHERE screening_prospect_id IS NOT NULL;
CREATE INDEX mail_send_undelivered ON mail_send (stream, undelivered_at) WHERE undelivered_at IS NOT NULL;
CREATE INDEX mail_send_by_expiry ON mail_send (expires_at);

-- A message is kept 30 days after it was sent on the screening stream (its prospect's own 30), 90 on the others; the
-- durable record of a notice's delivery is its recipient row, which follows the grant or the invoice.
CREATE FUNCTION mail_send_expiry() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  NEW.expires_at := NEW.sent_at + CASE WHEN NEW.stream = 'screening' THEN interval '30 days' ELSE interval '90 days' END;
  RETURN NEW;
END;
$$;
CREATE TRIGGER mail_send_expiry BEFORE INSERT OR UPDATE OF stream, sent_at, expires_at ON mail_send FOR EACH ROW EXECUTE FUNCTION mail_send_expiry();
CREATE TRIGGER mail_send_updated_at BEFORE UPDATE ON mail_send FOR EACH ROW EXECUTE FUNCTION set_updated_at();
ALTER TABLE mail_send ENABLE ROW LEVEL SECURITY;
ALTER TABLE mail_send FORCE ROW LEVEL SECURITY;
CREATE POLICY mail_send_owner ON mail_send FOR ALL TO tp_owner USING (true) WITH CHECK (true);

-- A state's rank: a lower-ranked event never overwrites a higher one, and the terminal states (an undelivered message,
-- a complaint, an outbox row that failed) are equal, so none overwrites another. pending is an outbox row's first.
CREATE FUNCTION mail_state_rank(state text) RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT CASE state WHEN 'pending' THEN -1 WHEN 'sent' THEN 0 WHEN 'delayed' THEN 1 WHEN 'delivered' THEN 2
                    WHEN 'complained' THEN 3 WHEN 'bounced' THEN 3 WHEN 'suppressed' THEN 3 WHEN 'rejected' THEN 3 WHEN 'failed' THEN 3 END
$$;

-- A stream's window (Q9): from the later of 7 days ago and its last resume, its messages SES counts toward the account's
-- rates (probes, those the account's own suppression list held back and rejected ones aside), the permanent bounces
-- among them (a bounce from SES's global suppression list included, as SES counts it) and the complaints other than
-- not_spam; and where it starts (starts_at), which the console shows (review M8).
CREATE FUNCTION mail_window_counts(target text) RETURNS TABLE (starts_at timestamptz, sends integer, bounces integer, complaints integer)
LANGUAGE sql STABLE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT w.starts_at,
         count(m.*)::integer,
         count(m.*) FILTER (WHERE m.state = 'bounced' AND m.bounce_kind = 'permanent')::integer,
         count(m.*) FILTER (WHERE m.state = 'complained' AND m.complaint_type <> 'not_spam')::integer
    FROM mail_stream s
    CROSS JOIN LATERAL (SELECT greatest(now() - interval '7 days', s.window_starts_at) AS starts_at) w
    LEFT JOIN mail_send m ON m.stream = s.stream AND m.kind <> 'probe' AND m.state NOT IN ('suppressed', 'rejected') AND m.sent_at >= w.starts_at
   WHERE s.stream = target
   GROUP BY w.starts_at
$$;

-- Whether the screening's mail is sending: not paused, and SES confirmed since the last pause. The triggers below read it;
-- granted to no role (it runs as its caller, the owner inside the definer functions).
CREATE FUNCTION screening_mail_sending() RETURNS boolean
LANGUAGE sql STABLE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT coalesce((SELECT s.paused_at IS NULL AND s.ses_enabled_confirmed_at IS NOT NULL FROM mail_stream s WHERE s.stream = 'screening'), false)
$$;

-- The consumer's gate (section 5, D3 and D5): read before it claims; a run received before resumed_at was held by a
-- pause. Granted to tp_screening alone.
CREATE FUNCTION screening_mail_gate() RETURNS TABLE (sending boolean, resumed_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT screening_mail_sending(), (SELECT s.resumed_at FROM mail_stream s WHERE s.stream = 'screening')
$$;

-- The web's (screeningOpen(), D7 and D8): paused, and ready once sending with a delivered and a bounced probe of the
-- screening stream come back within 48 hours and since the last resume. A missing row reads paused and not ready.
CREATE FUNCTION screening_mail_status() RETURNS TABLE (paused boolean, ready boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT coalesce(bool_or(s.paused_at IS NOT NULL), true),
         coalesce(bool_or(screening_mail_sending()
                          AND s.probe_delivered_at >= greatest(now() - interval '48 hours', coalesce(s.resumed_at, '-infinity'))
                          AND s.probe_bounced_at >= greatest(now() - interval '48 hours', coalesce(s.resumed_at, '-infinity'))), false)
    FROM mail_stream s WHERE s.stream = 'screening'
$$;

-- ---------------------------------------------------------------------------------------------------
-- 3. The screening's refusal list and bounce budget (Q11 (b), Q10 (a))
-- ---------------------------------------------------------------------------------------------------

-- The keyed hash of a screening address that bounced permanently or was reported (not as not_spam) on the screening
-- stream, kept 365 days from its latest such outcome, only to refuse a new screening to it.
CREATE TABLE screening_mail_refusal (
  recipient_sha256 text PRIMARY KEY CONSTRAINT screening_mail_refusal_recipient CHECK (recipient_sha256 ~ '^[0-9a-f]{64}$'),
  reason text NOT NULL CONSTRAINT screening_mail_refusal_reason CHECK (reason IN ('bounced', 'complained')),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CONSTRAINT screening_mail_refusal_expiry CHECK (expires_at > recorded_at AND expires_at <= recorded_at + interval '366 days')
);
CREATE INDEX screening_mail_refusal_by_expiry ON screening_mail_refusal (expires_at);
ALTER TABLE screening_mail_refusal ENABLE ROW LEVEL SECURITY;
ALTER TABLE screening_mail_refusal FORCE ROW LEVEL SECURITY;
CREATE POLICY screening_mail_refusal_owner ON screening_mail_refusal FOR ALL TO tp_owner USING (true) WITH CHECK (true);

-- The client's keyed subject (Q10 (a)): the rate limiter's HMAC of the screening bucket's client address, as the web
-- computes it for its own limit (null when no trusted proxy named one). It goes with the run at 30 days, and never changes.
ALTER TABLE screening_run ADD COLUMN client_subject text CONSTRAINT screening_run_client_subject CHECK (client_subject ~ '^[0-9a-f]{64}$');
CREATE TRIGGER screening_run_client_subject_fixed BEFORE UPDATE OF client_subject ON screening_run
  FOR EACH ROW WHEN (NEW.client_subject IS DISTINCT FROM OLD.client_subject) EXECUTE FUNCTION reject_change();

-- One 7-day mark for each subject of a run whose result or failure notice bounced permanently: its account's and its
-- client's keyed subjects. No address. It goes with its message, or at 7 days.
CREATE TABLE screening_bounce_mark (
  subject text NOT NULL CONSTRAINT screening_bounce_mark_subject CHECK (subject ~ '^[0-9a-f]{64}$'),
  subject_kind text NOT NULL CONSTRAINT screening_bounce_mark_subject_kind CHECK (subject_kind IN ('client', 'account')),
  ses_message_id text NOT NULL REFERENCES mail_send (ses_message_id) ON DELETE CASCADE,
  bounced_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CONSTRAINT screening_bounce_mark_expiry CHECK (expires_at = bounced_at + interval '7 days'),
  PRIMARY KEY (subject_kind, subject, ses_message_id)
);
CREATE INDEX screening_bounce_mark_by_expiry ON screening_bounce_mark (expires_at);
CREATE INDEX screening_bounce_mark_by_message ON screening_bounce_mark (ses_message_id);
ALTER TABLE screening_bounce_mark ENABLE ROW LEVEL SECURITY;
ALTER TABLE screening_bounce_mark FORCE ROW LEVEL SECURITY;
CREATE POLICY screening_bounce_mark_owner ON screening_bounce_mark FOR ALL TO tp_owner USING (true) WITH CHECK (true);

-- Whether a submitter is past its bounce budget (Q10 (a)): its account's or its client's keyed subject (null: none) has
-- 3 live bounce marks. Granted to no role: the run's trigger and the web's check before the address (section 9) read it.
CREATE FUNCTION screening_bounce_budget_spent(account_subject text, client_subject text) RETURNS boolean
LANGUAGE sql STABLE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT (SELECT count(*) FROM screening_bounce_mark b WHERE b.subject_kind = 'account' AND b.subject = $1 AND b.expires_at > now()) >= 3
      OR (SELECT count(*) FROM screening_bounce_mark b WHERE b.subject_kind = 'client' AND b.subject = $2 AND b.expires_at > now()) >= 3
$$;

-- Whether a contact address's mailbox is on the refusal list (Q11 (b)). Granted to no role, as above.
CREATE FUNCTION screening_contact_refused(address text) RETURNS boolean
LANGUAGE sql STABLE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM screening_mail_refusal f WHERE f.recipient_sha256 = mail_recipient_sha256($1) AND f.expires_at > now())
$$;

-- An accepted upload is refused while the screening stream is paused (D7). A refused upload is never emailed, so it is
-- recorded with its reasons whatever the stream's state.
CREATE FUNCTION screening_upload_mail_gate() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM mail_stream s WHERE s.stream = 'screening' AND s.paused_at IS NULL) THEN
    RAISE EXCEPTION 'new screenings are paused while their result emails cannot be sent' USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_paused';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER screening_upload_mail_gate BEFORE INSERT ON screening_upload FOR EACH ROW WHEN (NEW.status = 'accepted') EXECUTE FUNCTION screening_upload_mail_gate();

-- A run is refused, in this order (review S1): for its submitter's bounce budget (screening_bounce_budget), then for a
-- contact address on the refusal list (screening_contact_undeliverable; D9). The submitter comes first, so a client or
-- an account past its budget gets the one answer whatever the address, and cannot test an address against the list. A
-- refused upload has no run, so it is recorded whatever the list says.
CREATE FUNCTION screening_run_mail_refusal() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF screening_bounce_budget_spent(NEW.rate_subject, NEW.client_subject) THEN
    RAISE EXCEPTION 'too many recent screening emails from this sender could not be delivered' USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_bounce_budget';
  END IF;
  IF screening_contact_refused((SELECT p.contact_email FROM screening_upload u JOIN screening_prospect p ON p.id = u.prospect_id WHERE u.id = NEW.upload_id)) THEN
    RAISE EXCEPTION 'a screening''s result cannot be emailed to its contact address' USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_contact_undeliverable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER screening_run_mail_refusal BEFORE INSERT ON screening_run FOR EACH ROW EXECUTE FUNCTION screening_run_mail_refusal();

-- A run is not claimed, completed or failed (each ends in an email) while the screening's mail is not sending (D7); it
-- stays queued, or in pricing for the stale rule, until the stream is resumed and SES confirmed.
CREATE FUNCTION screening_run_mail_gate() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF ((NEW.status = 'pricing' AND (OLD.status = 'queued' OR NEW.attempts IS DISTINCT FROM OLD.attempts))
      OR (OLD.status = 'pricing' AND NEW.status = 'complete')
      OR (NEW.status = 'failed' AND OLD.status IS DISTINCT FROM 'failed'))
     AND NOT screening_mail_sending() THEN
    RAISE EXCEPTION 'the screening''s mail is not sending: the run waits' USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_mail_paused';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER screening_run_mail_gate BEFORE UPDATE OF status ON screening_run FOR EACH ROW EXECUTE FUNCTION screening_run_mail_gate();

-- ---------------------------------------------------------------------------------------------------
-- 4. Break-glass notices from a recorded outbox (D10)
-- ---------------------------------------------------------------------------------------------------

-- One row a grant's opening or closing notice, with how many administrators it went to (0: the practice had none).
-- Not PHI: registered because it carries a NOT NULL practice_id.
CREATE TABLE support_grant_notice (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  support_grant_id uuid NOT NULL REFERENCES support_grant (id),
  practice_id uuid NOT NULL REFERENCES practice (id),
  notice text NOT NULL CONSTRAINT support_grant_notice_kind CHECK (notice IN ('support_grant_opened', 'support_grant_closed')),
  recipients smallint NOT NULL CONSTRAINT support_grant_notice_recipients CHECK (recipients BETWEEN 0 AND 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- When its first undelivered recipient (or its want of any) was reported: once a notice.
  undelivered_reported_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_grant_notice_once UNIQUE (support_grant_id, notice),
  CONSTRAINT support_grant_notice_practice UNIQUE (id, practice_id)
);
CREATE INDEX support_grant_notice_by_practice ON support_grant_notice (practice_id, support_grant_id);
CREATE TRIGGER support_grant_notice_updated_at BEFORE UPDATE ON support_grant_notice FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- One row a notice's administrator: pending until sent, then the message's state as SES reports it, or failed. Its
-- practice is its notice's (the foreign key names both).
CREATE TABLE support_grant_notice_recipient (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notice_id uuid NOT NULL,
  practice_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES "user" (id),
  ses_message_id text UNIQUE CONSTRAINT support_grant_notice_recipient_message_id CHECK (ses_message_id ~ '^[A-Za-z0-9-]{20,100}$'),
  state text NOT NULL DEFAULT 'pending' CONSTRAINT support_grant_notice_recipient_state CHECK (state IN ('pending', 'sent', 'delayed', 'delivered', 'complained',
    'bounced', 'suppressed', 'rejected', 'failed')),
  attempts smallint NOT NULL DEFAULT 0 CONSTRAINT support_grant_notice_recipient_attempts CHECK (attempts BETWEEN 0 AND 5),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  -- The SES error's name, never its message.
  failure_code text CONSTRAINT support_grant_notice_recipient_failure_code CHECK (failure_code ~ '^[A-Za-z]{1,64}$'),
  sent_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_grant_notice_recipient_once UNIQUE (notice_id, user_id),
  FOREIGN KEY (notice_id, practice_id) REFERENCES support_grant_notice (id, practice_id),
  CONSTRAINT support_grant_notice_recipient_sent CHECK ((ses_message_id IS NULL) = (state IN ('pending', 'failed')) AND (ses_message_id IS NULL) = (sent_at IS NULL)),
  CONSTRAINT support_grant_notice_recipient_failed CHECK ((state = 'failed') = (failure_code IS NOT NULL))
);
CREATE INDEX support_grant_notice_recipient_by_practice ON support_grant_notice_recipient (practice_id, notice_id);
CREATE INDEX support_grant_notice_recipient_pending ON support_grant_notice_recipient (next_attempt_at) WHERE state = 'pending';
CREATE TRIGGER support_grant_notice_recipient_updated_at BEFORE UPDATE ON support_grant_notice_recipient FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Each a tenant table: the registered policy, the owner's for the definer functions below, and the application role reads
-- under its scope what support_grant itself admits (the practice's owning group, or a platform administrator). No role
-- writes either but through the definer functions.
ALTER TABLE support_grant_notice ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_grant_notice FORCE ROW LEVEL SECURITY;
CREATE POLICY support_grant_notice_tenant ON support_grant_notice
  USING (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]))
  WITH CHECK (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]));
CREATE POLICY support_grant_notice_owner ON support_grant_notice FOR ALL TO tp_owner USING (true) WITH CHECK (true);
CREATE POLICY support_grant_notice_read_by_practice_and_platform ON support_grant_notice AS RESTRICTIVE FOR SELECT TO tp_app
  USING (practice_id = ANY ((SELECT app_actor_group_practice_ids())::uuid[]) OR (SELECT app_actor_is_platform_admin()));
ALTER TABLE support_grant_notice_recipient ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_grant_notice_recipient FORCE ROW LEVEL SECURITY;
CREATE POLICY support_grant_notice_recipient_tenant ON support_grant_notice_recipient
  USING (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]))
  WITH CHECK (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]));
CREATE POLICY support_grant_notice_recipient_owner ON support_grant_notice_recipient FOR ALL TO tp_owner USING (true) WITH CHECK (true);
CREATE POLICY support_grant_notice_recipient_read_by_practice_and_platform ON support_grant_notice_recipient AS RESTRICTIVE FOR SELECT TO tp_app
  USING (practice_id = ANY ((SELECT app_actor_group_practice_ids())::uuid[]) OR (SELECT app_actor_is_platform_admin()));
INSERT INTO phi_table_registry (table_name, registered_by, policy_name) VALUES
  ('support_grant_notice', '20261107090000_mail_streams', 'support_grant_notice_tenant'),
  ('support_grant_notice_recipient', '20261107090000_mail_streams', 'support_grant_notice_recipient_tenant');

-- The practice's current administrators, the recipients of its break-glass notices (as before: invited ones too, a
-- disabled one never). Granted to no role.
CREATE FUNCTION support_notice_administrators(target_practice uuid) RETURNS TABLE (user_id uuid)
LANGUAGE sql STABLE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT DISTINCT m.user_id FROM practice p
    JOIN membership m ON m.organization_id = p.organization_id
    JOIN "user" u ON u.id = m.user_id
   WHERE p.id = target_practice AND m.role = 'practice_admin' AND (m.ends_at IS NULL OR m.ends_at > now()) AND u.status <> 'disabled'
$$;

-- A notice's first undelivered recipient, reported once: notice_undelivered in the audit log, and an in-app notification
-- to each current administrator (subject: the notice's own row, so a grant's two notices never collide). Granted to no
-- role; the callers run in the notice's practice.
CREATE FUNCTION support_notice_report_undelivered(notice uuid, request text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SET search_path = pg_catalog, public, pg_temp AS $$
#variable_conflict use_variable
DECLARE
  reported support_grant_notice%ROWTYPE;
BEGIN
  UPDATE support_grant_notice n SET undelivered_reported_at = now() WHERE n.id = notice AND n.undelivered_reported_at IS NULL RETURNING n.* INTO reported;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  INSERT INTO audit_event (actor_kind, action, object_type, object_id, practice_id, grant_id, purpose, request_id)
  VALUES ('system', 'notice_undelivered', 'support_grant', reported.support_grant_id, reported.practice_id, reported.support_grant_id, reported.notice, request);
  INSERT INTO notification (practice_id, user_id, kind, subject_id, counts, totals_cents)
  SELECT reported.practice_id, a.user_id, 'support_notice_undelivered', reported.id, '{}'::jsonb, '{}'::jsonb
    FROM support_notice_administrators(reported.practice_id) a
  ON CONFLICT ON CONSTRAINT notification_once DO NOTHING;
  RETURN true;
END;
$$;

-- A notice's counts for the console, counted from its rows: delivered (a complaint was delivered too), undelivered,
-- pending, and its latest send. No row when the notice has not been opened. Granted to no role.
CREATE FUNCTION support_notice_counts(target uuid, notice text) RETURNS TABLE (recipients integer, delivered integer, undelivered integer, pending integer, sent_at timestamptz)
LANGUAGE sql STABLE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT n.recipients::integer,
         count(r.*) FILTER (WHERE r.state IN ('delivered', 'complained'))::integer,
         count(r.*) FILTER (WHERE r.state IN ('bounced', 'suppressed', 'rejected', 'failed'))::integer,
         count(r.*) FILTER (WHERE r.state = 'pending')::integer,
         max(r.sent_at)
    FROM support_grant_notice n LEFT JOIN support_grant_notice_recipient r ON r.notice_id = n.id
   WHERE n.support_grant_id = target AND n.notice = $2
   GROUP BY n.id, n.recipients
$$;

-- Step 1, in the notice's practice: records the notice and one pending recipient a current administrator, once. A
-- closing notice is opened only once the grant has ended, and sets notified_at ("the closing notice was handled"). An
-- opening the previous image already recorded (its notice_sent) is not opened again. With no administrator: recipients 0,
-- notice_undelivered, and no notice_sent.
CREATE FUNCTION operator_open_support_notice(target uuid, notice text, request text) RETURNS TABLE (notice_id uuid, recipients integer, opened boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
#variable_conflict use_variable
DECLARE
  g support_grant%ROWTYPE;
  created uuid;
  counted integer;
BEGIN
  IF notice IS NULL OR notice NOT IN ('support_grant_opened', 'support_grant_closed') THEN
    RAISE EXCEPTION 'unknown notice' USING ERRCODE = 'check_violation';
  END IF;
  SELECT s.* INTO g FROM support_grant s WHERE s.id = target;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown support grant' USING ERRCODE = 'no_data_found';
  END IF;
  PERFORM operator_assert_scope(g.practice_id);
  PERFORM pg_advisory_xact_lock(hashtext(notice || ':' || target::text));
  opened := false;
  SELECT n.id, n.recipients INTO notice_id, recipients FROM support_grant_notice n WHERE n.support_grant_id = target AND n.notice = notice;
  IF FOUND THEN
    RETURN NEXT;
    RETURN;
  END IF;
  -- Not opened: none, and no recipient, unless it is opened below.
  notice_id := NULL;
  recipients := 0;
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
  INSERT INTO support_grant_notice (support_grant_id, practice_id, notice, recipients) VALUES (target, g.practice_id, notice, 0) RETURNING support_grant_notice.id INTO created;
  INSERT INTO support_grant_notice_recipient (notice_id, practice_id, user_id)
  SELECT created, g.practice_id, a.user_id FROM support_notice_administrators(g.practice_id) a ORDER BY a.user_id LIMIT 500;
  GET DIAGNOSTICS counted = ROW_COUNT;
  IF counted = 0 THEN
    UPDATE support_grant_notice n SET undelivered_reported_at = now() WHERE n.id = created;
    INSERT INTO audit_event (actor_kind, action, object_type, object_id, practice_id, grant_id, purpose, request_id)
    VALUES ('system', 'notice_undelivered', 'support_grant', target, g.practice_id, target, notice, request);
  ELSE
    UPDATE support_grant_notice n SET recipients = counted WHERE n.id = created;
  END IF;
  notice_id := created;
  recipients := counted;
  opened := true;
  RETURN NEXT;
END;
$$;

-- The recipients due a send (pending, their next attempt come), openings first. Across practices: IDs only.
CREATE FUNCTION operator_support_notices_pending(at_most integer) RETURNS TABLE (notice_id uuid, practice_id uuid, user_id uuid, support_grant_id uuid, notice text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT r.notice_id, r.practice_id, r.user_id, n.support_grant_id, n.notice
    FROM support_grant_notice_recipient r JOIN support_grant_notice n ON n.id = r.notice_id
   WHERE r.state = 'pending' AND r.next_attempt_at <= now()
   ORDER BY n.notice = 'support_grant_closed', r.next_attempt_at, r.notice_id, r.user_id
   LIMIT greatest(at_most, 0)
$$;

-- Step 2, in the notice's practice, in the transaction that sends the one message: locks a recipient due a send and
-- returns its address and the count of records read under the grant (the closing notice says it). Nothing when another
-- run holds it or it is not due.
CREATE FUNCTION operator_support_notice_claim(notice uuid, recipient uuid) RETURNS TABLE (email text, reads bigint)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
#variable_conflict use_variable
DECLARE
  held support_grant_notice%ROWTYPE;
BEGIN
  SELECT n.* INTO held FROM support_grant_notice n WHERE n.id = notice;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown support grant notice' USING ERRCODE = 'no_data_found';
  END IF;
  PERFORM operator_assert_scope(held.practice_id);
  PERFORM 1 FROM support_grant_notice_recipient r
    WHERE r.notice_id = notice AND r.user_id = recipient AND r.state = 'pending' AND r.next_attempt_at <= now()
      FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT u.email, (SELECT count(*) FROM audit_event e WHERE e.grant_id = held.support_grant_id AND e.action = 'read') FROM "user" u WHERE u.id = recipient;
END;
$$;

-- Step 2's commit: the message SES accepted, its ID kept and a state that arrived first copied over. The notice's first
-- accepted send writes notice_sent ("handed to the mail service"). True when the recipient is already undelivered and
-- this reported the notice.
CREATE FUNCTION operator_support_notice_sent(notice uuid, recipient uuid, message_id text, request text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
#variable_conflict use_variable
DECLARE
  held support_grant_notice%ROWTYPE;
  arrived text;
  now_state text;
BEGIN
  SELECT n.* INTO held FROM support_grant_notice n WHERE n.id = notice;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown support grant notice' USING ERRCODE = 'no_data_found';
  END IF;
  PERFORM operator_assert_scope(held.practice_id);
  SELECT m.state INTO arrived FROM mail_send m WHERE m.ses_message_id = message_id;
  UPDATE support_grant_notice_recipient r
     SET ses_message_id = message_id, sent_at = now(),
         state = CASE WHEN mail_state_rank(arrived) > mail_state_rank('sent') THEN arrived ELSE 'sent' END
   WHERE r.notice_id = notice AND r.user_id = recipient AND r.state = 'pending'
  RETURNING r.state INTO now_state;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'a notice is recorded as sent to an administrator once, while pending' USING ERRCODE = 'check_violation', CONSTRAINT = 'support_grant_notice_recipient_sent';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('support_grant_notice:' || notice::text, 0));
  IF NOT EXISTS (
    SELECT 1 FROM audit_event e
     WHERE e.action = 'notice_sent' AND e.actor_kind = 'system' AND e.object_type = 'support_grant' AND e.object_id = held.support_grant_id AND e.purpose = held.notice
  ) THEN
    INSERT INTO audit_event (actor_kind, action, object_type, object_id, practice_id, grant_id, purpose, request_id)
    VALUES ('system', 'notice_sent', 'support_grant', held.support_grant_id, held.practice_id, held.support_grant_id, held.notice, request);
  END IF;
  IF now_state IN ('bounced', 'suppressed', 'rejected') THEN
    RETURN support_notice_report_undelivered(notice, request);
  END IF;
  RETURN false;
END;
$$;

-- A send that threw, in a new transaction after the rollback: one attempt more, the next after 1, 5, 15 and 60 minutes;
-- failed after the fifth, or at once for a permanent SES error, which reports the notice undelivered (true).
CREATE FUNCTION operator_support_notice_failed(notice uuid, recipient uuid, error_name text, permanent boolean, request text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
#variable_conflict use_variable
DECLARE
  held support_grant_notice%ROWTYPE;
  now_state text;
BEGIN
  SELECT n.* INTO held FROM support_grant_notice n WHERE n.id = notice;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown support grant notice' USING ERRCODE = 'no_data_found';
  END IF;
  PERFORM operator_assert_scope(held.practice_id);
  UPDATE support_grant_notice_recipient r
     SET attempts = r.attempts + 1,
         state = CASE WHEN coalesce(permanent, false) OR r.attempts + 1 >= 5 THEN 'failed' ELSE 'pending' END,
         failure_code = CASE WHEN coalesce(permanent, false) OR r.attempts + 1 >= 5
                             THEN CASE WHEN error_name ~ '^[A-Za-z]{1,64}$' THEN error_name ELSE 'Unrecognized' END END,
         next_attempt_at = CASE WHEN coalesce(permanent, false) OR r.attempts + 1 >= 5 THEN r.next_attempt_at
                                ELSE now() + make_interval(mins => (ARRAY[1, 5, 15, 60])[r.attempts + 1]) END
   WHERE r.notice_id = notice AND r.user_id = recipient AND r.state = 'pending'
  RETURNING r.state INTO now_state;
  IF now_state = 'failed' THEN
    RETURN support_notice_report_undelivered(notice, request);
  END IF;
  RETURN false;
END;
$$;

-- Step 5: an opening is handled once its notice row exists (or, for a grant noticed before migration 20261107090000, its
-- system notice_sent event); a closing once notified_at is set, as before.
CREATE OR REPLACE FUNCTION operator_due_support_notices(at_most integer) RETURNS TABLE (support_grant_id uuid, practice_id uuid, notice text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  (SELECT s.id, s.practice_id, 'support_grant_opened'
     FROM support_grant s
    WHERE NOT EXISTS (SELECT 1 FROM support_grant_notice n WHERE n.support_grant_id = s.id AND n.notice = 'support_grant_opened')
      AND NOT EXISTS (
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

-- ---------------------------------------------------------------------------------------------------
-- 5. Dunning from the same outbox (D10), as tp_billing
-- ---------------------------------------------------------------------------------------------------

-- One row an invoice's dunning stage and billing owner. Billing's: no policy or privilege for any role but the owner's;
-- every read and write is through the billing definer functions. It follows the invoice, which is never deleted.
CREATE TABLE dunning_notice_recipient (
  invoice_id uuid NOT NULL REFERENCES invoice (id),
  stage text NOT NULL CONSTRAINT dunning_notice_recipient_stage CHECK (stage IN ('payment_failed', 'second_notice', 'third_notice', 'final_notice', 'suspended', 'reinstated')),
  organization_id uuid NOT NULL REFERENCES organization (id),
  user_id uuid NOT NULL REFERENCES "user" (id),
  ses_message_id text UNIQUE CONSTRAINT dunning_notice_recipient_message_id CHECK (ses_message_id ~ '^[A-Za-z0-9-]{20,100}$'),
  state text NOT NULL DEFAULT 'pending' CONSTRAINT dunning_notice_recipient_state CHECK (state IN ('pending', 'sent', 'delayed', 'delivered', 'complained',
    'bounced', 'suppressed', 'rejected', 'failed')),
  attempts smallint NOT NULL DEFAULT 0 CONSTRAINT dunning_notice_recipient_attempts CHECK (attempts BETWEEN 0 AND 5),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  failure_code text CONSTRAINT dunning_notice_recipient_failure_code CHECK (failure_code ~ '^[A-Za-z]{1,64}$'),
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (invoice_id, stage, user_id),
  CONSTRAINT dunning_notice_recipient_sent CHECK ((ses_message_id IS NULL) = (state IN ('pending', 'failed')) AND (ses_message_id IS NULL) = (sent_at IS NULL)),
  CONSTRAINT dunning_notice_recipient_failed CHECK ((state = 'failed') = (failure_code IS NOT NULL))
);
CREATE INDEX dunning_notice_recipient_by_organization ON dunning_notice_recipient (organization_id, invoice_id);
CREATE INDEX dunning_notice_recipient_pending ON dunning_notice_recipient (next_attempt_at) WHERE state = 'pending';
CREATE TRIGGER dunning_notice_recipient_updated_at BEFORE UPDATE ON dunning_notice_recipient FOR EACH ROW EXECUTE FUNCTION set_updated_at();
ALTER TABLE dunning_notice_recipient ENABLE ROW LEVEL SECURITY;
ALTER TABLE dunning_notice_recipient FORCE ROW LEVEL SECURITY;
CREATE POLICY dunning_notice_recipient_owner ON dunning_notice_recipient FOR ALL TO tp_owner USING (true) WITH CHECK (true);

-- An invoice's stage notice not delivered to every owner, reported once: notice_undelivered on the invoice (purpose: the
-- stage). Granted to no role.
CREATE FUNCTION dunning_notice_report_undelivered(target_invoice uuid, notice_stage text, request text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('dunning_notice:' || target_invoice::text || ':' || notice_stage, 0));
  IF EXISTS (
    SELECT 1 FROM audit_event e
     WHERE e.action = 'notice_undelivered' AND e.actor_kind = 'system' AND e.object_type = 'invoice' AND e.object_id = target_invoice AND e.purpose = notice_stage
  ) THEN
    RETURN false;
  END IF;
  INSERT INTO audit_event (actor_kind, action, object_type, object_id, purpose, request_id)
  VALUES ('system', 'notice_undelivered', 'invoice', target_invoice, notice_stage, request);
  RETURN true;
END;
$$;

-- In the stage's transaction: one pending recipient each current billing owner (as before: active, with
-- organization.billing), once a stage. With none: notice_undelivered on the invoice.
CREATE FUNCTION billing_open_dunning_notice(target_invoice uuid, notice_stage text, request text) RETURNS TABLE (recipients integer, opened boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  organization uuid;
  counted integer;
BEGIN
  IF notice_stage IS NULL OR notice_stage NOT IN ('payment_failed', 'second_notice', 'third_notice', 'final_notice', 'suspended', 'reinstated') THEN
    RAISE EXCEPTION 'unknown dunning stage' USING ERRCODE = 'check_violation';
  END IF;
  SELECT i.organization_id INTO organization FROM invoice i WHERE i.id = target_invoice;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown invoice' USING ERRCODE = 'no_data_found';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('dunning_notice:' || target_invoice::text || ':' || notice_stage, 0));
  SELECT count(*)::integer INTO counted FROM dunning_notice_recipient d WHERE d.invoice_id = target_invoice AND d.stage = notice_stage;
  IF counted > 0 OR EXISTS (
    SELECT 1 FROM audit_event e
     WHERE e.action = 'notice_undelivered' AND e.actor_kind = 'system' AND e.object_type = 'invoice' AND e.object_id = target_invoice AND e.purpose = notice_stage
  ) THEN
    recipients := counted;
    opened := false;
    RETURN NEXT;
    RETURN;
  END IF;
  INSERT INTO dunning_notice_recipient (invoice_id, stage, organization_id, user_id)
  SELECT DISTINCT target_invoice, notice_stage, organization, m.user_id
    FROM membership m JOIN "user" u ON u.id = m.user_id
   WHERE m.organization_id = organization AND (m.ends_at IS NULL OR m.ends_at > now()) AND u.status = 'active'
     AND roles_permit(ARRAY[m.role], 'organization.billing');
  GET DIAGNOSTICS counted = ROW_COUNT;
  IF counted = 0 THEN
    PERFORM dunning_notice_report_undelivered(target_invoice, notice_stage, request);
  END IF;
  recipients := counted;
  opened := true;
  RETURN NEXT;
END;
$$;

CREATE FUNCTION billing_dunning_notices_pending(at_most integer) RETURNS TABLE (invoice_id uuid, stage text, organization_id uuid, user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT d.invoice_id, d.stage, d.organization_id, d.user_id FROM dunning_notice_recipient d
   WHERE d.state = 'pending' AND d.next_attempt_at <= now()
   ORDER BY d.next_attempt_at, d.invoice_id, d.stage, d.user_id
   LIMIT greatest(at_most, 0)
$$;

CREATE FUNCTION billing_dunning_notice_claim(target_invoice uuid, notice_stage text, recipient uuid) RETURNS TABLE (email text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
#variable_conflict use_variable
BEGIN
  PERFORM 1 FROM dunning_notice_recipient d
    WHERE d.invoice_id = target_invoice AND d.stage = notice_stage AND d.user_id = recipient AND d.state = 'pending' AND d.next_attempt_at <= now()
      FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  RETURN QUERY SELECT u.email FROM "user" u WHERE u.id = recipient;
END;
$$;

CREATE FUNCTION billing_dunning_notice_sent(target_invoice uuid, notice_stage text, recipient uuid, message_id text, request text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
#variable_conflict use_variable
DECLARE
  arrived text;
  now_state text;
BEGIN
  SELECT m.state INTO arrived FROM mail_send m WHERE m.ses_message_id = message_id;
  UPDATE dunning_notice_recipient d
     SET ses_message_id = message_id, sent_at = now(),
         state = CASE WHEN mail_state_rank(arrived) > mail_state_rank('sent') THEN arrived ELSE 'sent' END
   WHERE d.invoice_id = target_invoice AND d.stage = notice_stage AND d.user_id = recipient AND d.state = 'pending'
  RETURNING d.state INTO now_state;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'a dunning notice is recorded as sent to an owner once, while pending' USING ERRCODE = 'check_violation', CONSTRAINT = 'dunning_notice_recipient_sent';
  END IF;
  IF now_state IN ('bounced', 'suppressed', 'rejected') THEN
    RETURN dunning_notice_report_undelivered(target_invoice, notice_stage, request);
  END IF;
  RETURN false;
END;
$$;

CREATE FUNCTION billing_dunning_notice_failed(target_invoice uuid, notice_stage text, recipient uuid, error_name text, permanent boolean, request text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
#variable_conflict use_variable
DECLARE
  now_state text;
BEGIN
  UPDATE dunning_notice_recipient d
     SET attempts = d.attempts + 1,
         state = CASE WHEN coalesce(permanent, false) OR d.attempts + 1 >= 5 THEN 'failed' ELSE 'pending' END,
         failure_code = CASE WHEN coalesce(permanent, false) OR d.attempts + 1 >= 5
                             THEN CASE WHEN error_name ~ '^[A-Za-z]{1,64}$' THEN error_name ELSE 'Unrecognized' END END,
         next_attempt_at = CASE WHEN coalesce(permanent, false) OR d.attempts + 1 >= 5 THEN d.next_attempt_at
                                ELSE now() + make_interval(mins => (ARRAY[1, 5, 15, 60])[d.attempts + 1]) END
   WHERE d.invoice_id = target_invoice AND d.stage = notice_stage AND d.user_id = recipient AND d.state = 'pending'
  RETURNING d.state INTO now_state;
  IF now_state = 'failed' THEN
    RETURN dunning_notice_report_undelivered(target_invoice, notice_stage, request);
  END IF;
  RETURN false;
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- 6. Invitations, notifications and the reserved audit actions
-- ---------------------------------------------------------------------------------------------------

-- When the undelivered Cognito message was sent (SES's mail.timestamp), and why. Written by operator_record_mail_event()
-- alone; the users page shows it while undelivered_at >= sent_at - 5 seconds.
ALTER TABLE invitation
  ADD COLUMN undelivered_at timestamptz,
  ADD COLUMN undelivered_reason text CONSTRAINT invitation_undelivered_reason CHECK (undelivered_reason IN ('bounced', 'suppressed', 'rejected', 'complained')),
  ADD CONSTRAINT invitation_undelivered CHECK ((undelivered_at IS NULL) = (undelivered_reason IS NULL));

ALTER TABLE notification DROP CONSTRAINT notification_kind_check;
-- support_notice_undelivered: a break-glass notice did not reach every administrator (subject: the notice's row; counts
-- and totals empty, so monitoring_figure_codes() is unchanged).
ALTER TABLE notification ADD CONSTRAINT notification_kind_check CHECK (kind IN ('monitoring_run', 'digest', 'recoupment', 'follow_up', 'support_notice_undelivered'));

-- As migration 20261015180000 left it, with the three actions the mail record writes reserved too.
DROP POLICY audit_event_record ON audit_event;
CREATE POLICY audit_event_record ON audit_event FOR INSERT TO tp_app
  WITH CHECK (
    actor_id = app_actor_id()
    AND actor_kind IN ('user', 'service')
    AND action NOT IN ('notice_sent', 'security_event', 'sign_in_failed', 'data_key_destroyed', 'notice_undelivered', 'mail_stream_paused', 'mail_stream_resumed')
    AND (practice_id IS NULL OR practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]))
  );

-- ---------------------------------------------------------------------------------------------------
-- 7. The platform's mail_events job (tp_operator; D5, D6)
-- ---------------------------------------------------------------------------------------------------

-- Pauses the screening stream once, with the window's counts, clearing SES's confirmation, and writes mail_stream_paused
-- (the system's, or the platform administrator's who paused it by hand). Granted to no role.
CREATE FUNCTION mail_stream_pause(reason text, actor uuid, request text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  counted record;
BEGIN
  SELECT w.sends, w.bounces, w.complaints INTO counted FROM mail_window_counts('screening') w;
  UPDATE mail_stream s
     SET paused_at = now(), paused_reason = reason, paused_by = actor, pause_sends = counted.sends, pause_bounces = counted.bounces,
         pause_complaints = counted.complaints, ses_enabled_confirmed_at = NULL
   WHERE s.stream = 'screening' AND s.paused_at IS NULL;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  INSERT INTO audit_event (actor_id, actor_kind, action, object_type, purpose, request_id)
  VALUES (actor, CASE WHEN actor IS NULL THEN 'system' ELSE 'user' END, 'mail_stream_paused', 'mail_stream', reason, request);
  RETURN true;
END;
$$;

-- One SES event of one message, recorded once (D5 step 3). The first event seen creates the message's row; a later one
-- moves its state only forward. When the state moves: a probe sets its stream's probe columns; a notice's recipient row
-- takes the state, and the notice's or the invoice's first undelivered recipient is reported (notice_undelivered: the
-- support grant's ID; invoice_undelivered: the invoice's); a Cognito message to an invited user flags the invitation
-- (invitation_undelivered); a screening message links its prospect, and a permanent bounce or a complaint other than
-- not_spam puts the address's keyed hash on the refusal list, a permanent bounce marks the run's subjects, and either can
-- pause the screening stream (stream_paused: the reason). recipient is read only to resolve a Cognito user and to hash a
-- refused screening address; it is never stored, logged or returned. A notice's event runs in its practice's scope.
CREATE FUNCTION operator_record_mail_event(message_id text, stream text, event text, mail_at timestamptz, event_at timestamptz, recipient text,
  kind text, subject uuid, recipient_user uuid, practice uuid, bounce_kind text, bounce_subtype text, complaint_type text, request text)
RETURNS TABLE (recorded boolean, state text, notice_undelivered uuid, invoice_undelivered uuid, invitation_undelivered uuid, stream_paused text)
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
  counted record;
BEGIN
  recorded := false;
  notice_undelivered := NULL;
  invoice_undelivered := NULL;
  invitation_undelivered := NULL;
  stream_paused := NULL;
  IF event IS NULL OR event NOT IN ('send', 'delivery_delay', 'delivery', 'bounce', 'complaint', 'reject', 'rendering_failure') THEN
    RAISE EXCEPTION 'unknown mail event' USING ERRCODE = 'check_violation', CONSTRAINT = 'mail_event_type';
  END IF;
  IF mail_at IS NULL THEN
    RAISE EXCEPTION 'a mail event names when its message was sent' USING ERRCODE = 'check_violation', CONSTRAINT = 'mail_event_sent_at';
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
      VALUES (mail_recipient_sha256(recipient), CASE WHEN held.state = 'bounced' THEN 'bounced' ELSE 'complained' END, now(), now() + interval '365 days')
      ON CONFLICT (recipient_sha256) DO UPDATE SET reason = EXCLUDED.reason, recorded_at = EXCLUDED.recorded_at, expires_at = EXCLUDED.expires_at;
    END IF;
    IF held.state = 'bounced' AND priced.id IS NOT NULL THEN
      INSERT INTO screening_bounce_mark (subject, subject_kind, ses_message_id, bounced_at, expires_at)
      SELECT v.marked, v.marked_kind, message_id, happened, happened + interval '7 days'
        FROM (VALUES (priced.rate_subject, 'account'), (priced.client_subject, 'client')) AS v (marked, marked_kind)
       WHERE v.marked IS NOT NULL
      ON CONFLICT DO NOTHING;
    END IF;
    SELECT w.sends, w.bounces, w.complaints INTO counted FROM mail_window_counts('screening') w;
    IF counted.bounces::bigint * 10000 > 300 * greatest(counted.sends, 200)::bigint THEN
      IF mail_stream_pause('bounce_rate', NULL, request) THEN
        stream_paused := 'bounce_rate';
      END IF;
    ELSIF counted.complaints::bigint * 100000 > 80 * greatest(counted.sends, 2500)::bigint THEN
      IF mail_stream_pause('complaint_rate', NULL, request) THEN
        stream_paused := 'complaint_rate';
      END IF;
    END IF;
  END IF;
  RETURN NEXT;
END;
$$;

-- The account's signals (D6 b, c): its warning alarms (account_rate) and SES's enforcement (account_review) pause the
-- screening stream alone, once. True when this call paused it.
CREATE FUNCTION operator_mail_account_signal(signal text, request text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF signal IN ('bounce_rate_alarm', 'complaint_rate_alarm') THEN
    RETURN mail_stream_pause('account_rate', NULL, request);
  ELSIF signal = 'enforcement_not_healthy' THEN
    RETURN mail_stream_pause('account_review', NULL, request);
  END IF;
  RAISE EXCEPTION 'unknown mail account signal' USING ERRCODE = 'check_violation', CONSTRAINT = 'mail_account_signal';
END;
$$;

-- For the reconcile and the probes: each stream's pause and SES confirmation; a probe is due daily once the last came
-- back, at once after a resume, and again when one has not come back in 26 hours (probe_missed), never while paused or
-- unconfirmed.
CREATE FUNCTION operator_mail_streams() RETURNS TABLE (stream text, paused boolean, confirmed boolean, probe_due boolean, probe_missed boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT s.stream, s.paused_at IS NOT NULL, s.ses_enabled_confirmed_at IS NOT NULL,
         s.paused_at IS NULL AND s.ses_enabled_confirmed_at IS NOT NULL
           AND (s.probe_sent_at IS NULL
                OR (NOT o.outstanding AND s.probe_sent_at <= now() - interval '24 hours')
                OR (o.outstanding AND s.probe_sent_at <= now() - interval '26 hours')),
         s.paused_at IS NULL AND s.ses_enabled_confirmed_at IS NOT NULL AND o.outstanding AND s.probe_sent_at <= now() - interval '26 hours'
    FROM mail_stream s,
         LATERAL (SELECT s.probe_sent_at IS NOT NULL
                         AND (coalesce(s.probe_delivered_at < s.probe_sent_at, true) OR coalesce(s.probe_bounced_at < s.probe_sent_at, true)) AS outstanding) o
   ORDER BY s.stream
$$;

-- The reconcile read the stream's SES set: enabled confirms an open stream (once, until cleared); disabled clears it.
-- True when the stream is confirmed after the call.
CREATE FUNCTION operator_mail_stream_confirmed(stream text, enabled boolean) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
#variable_conflict use_variable
DECLARE
  confirmed timestamptz;
BEGIN
  IF stream IS NULL OR stream NOT IN ('transactional', 'notices', 'screening') OR enabled IS NULL THEN
    RAISE EXCEPTION 'unknown mail stream' USING ERRCODE = 'check_violation', CONSTRAINT = 'mail_stream_name';
  END IF;
  IF enabled THEN
    UPDATE mail_stream s SET ses_enabled_confirmed_at = now() WHERE s.stream = stream AND s.paused_at IS NULL AND s.ses_enabled_confirmed_at IS NULL;
  ELSE
    UPDATE mail_stream s SET ses_enabled_confirmed_at = NULL WHERE s.stream = stream AND s.ses_enabled_confirmed_at IS NOT NULL;
  END IF;
  SELECT s.ses_enabled_confirmed_at INTO confirmed FROM mail_stream s WHERE s.stream = stream;
  RETURN confirmed IS NOT NULL;
END;
$$;

CREATE FUNCTION operator_mail_probe_sent(stream text) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
#variable_conflict use_variable
BEGIN
  IF stream IS NULL OR stream NOT IN ('transactional', 'notices', 'screening') THEN
    RAISE EXCEPTION 'unknown mail stream' USING ERRCODE = 'check_violation', CONSTRAINT = 'mail_stream_name';
  END IF;
  UPDATE mail_stream s SET probe_sent_at = now() WHERE s.stream = stream;
END;
$$;

-- The nightly mail_expiry job: at most at_most expired rows of each of the bounce marks, the messages and the refusal
-- list. Returns how many went.
CREATE FUNCTION operator_mail_expire(at_most integer) RETURNS integer
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
  RETURN removed + counted;
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- 8. The console (tp_app; feature_flag.manage, as console_model_spend)
-- ---------------------------------------------------------------------------------------------------

-- Each stream as the console's mail page shows it. window_starts_at is where the window's counts start, the later of 7
-- days ago and the last resume (mail_window_counts()), never a resume older than the 7 days the counts cover (review M8).
CREATE FUNCTION console_mail_streams() RETURNS TABLE (stream text, paused_at timestamptz, paused_reason text, paused_by uuid, pause_sends integer,
  pause_bounces integer, pause_complaints integer, window_starts_at timestamptz, window_sends integer, window_bounces integer, window_complaints integer,
  resumed_at timestamptz, confirmed_at timestamptz, sending boolean, ready boolean, probe_sent_at timestamptz, probe_delivered_at timestamptz,
  probe_bounced_at timestamptz, client_marks integer, account_marks integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF app_actor_id() IS NULL OR NOT app_actor_is_person() OR NOT coalesce(app_actor_platform_permitted('feature_flag.manage'), false) THEN
    RAISE EXCEPTION 'only a platform administrator reads the mail streams' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
    SELECT s.stream, s.paused_at, s.paused_reason, s.paused_by, s.pause_sends, s.pause_bounces, s.pause_complaints, w.starts_at,
           w.sends, w.bounces, w.complaints, s.resumed_at, s.ses_enabled_confirmed_at,
           s.paused_at IS NULL AND s.ses_enabled_confirmed_at IS NOT NULL,
           s.paused_at IS NULL AND s.ses_enabled_confirmed_at IS NOT NULL
             AND coalesce(s.probe_delivered_at >= greatest(now() - interval '48 hours', coalesce(s.resumed_at, '-infinity')), false)
             AND coalesce(s.probe_bounced_at >= greatest(now() - interval '48 hours', coalesce(s.resumed_at, '-infinity')), false),
           s.probe_sent_at, s.probe_delivered_at, s.probe_bounced_at, k.client_marks, k.account_marks
      FROM mail_stream s
      CROSS JOIN LATERAL mail_window_counts(s.stream) w
      CROSS JOIN LATERAL (
        SELECT count(*) FILTER (WHERE b.subject_kind = 'client')::integer AS client_marks, count(*) FILTER (WHERE b.subject_kind = 'account')::integer AS account_marks
          FROM screening_bounce_mark b WHERE s.stream = 'screening' AND b.expires_at > now()
      ) k
     ORDER BY s.stream;
END;
$$;

-- A pause by hand (reason operator), the screening stream's alone.
CREATE FUNCTION console_pause_mail_stream(stream text, reason text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
#variable_conflict use_variable
BEGIN
  IF app_actor_id() IS NULL OR NOT app_actor_is_person() OR NOT coalesce(app_actor_platform_permitted('feature_flag.manage'), false) THEN
    RAISE EXCEPTION 'only a platform administrator pauses a mail stream' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF stream IS DISTINCT FROM 'screening' THEN
    RAISE EXCEPTION 'only the screening stream pauses' USING ERRCODE = 'check_violation', CONSTRAINT = 'mail_stream_only_screening_pauses';
  END IF;
  IF reason IS DISTINCT FROM 'operator' THEN
    RAISE EXCEPTION 'a stream paused by hand is paused by the operator' USING ERRCODE = 'check_violation', CONSTRAINT = 'mail_stream_paused_reason';
  END IF;
  RETURN mail_stream_pause('operator', app_actor_id(), NULL);
END;
$$;

-- A resume, a platform administrator's deliberate act with its reason: the window starts again, the probes are due at
-- once, and nothing is claimed until the reconcile reads SES sending.
CREATE FUNCTION console_resume_mail_stream(stream text, reason text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
#variable_conflict use_variable
BEGIN
  IF app_actor_id() IS NULL OR NOT app_actor_is_person() OR NOT coalesce(app_actor_platform_permitted('feature_flag.manage'), false) THEN
    RAISE EXCEPTION 'only a platform administrator resumes a mail stream' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF reason IS NULL OR reason NOT IN ('cause_fixed', 'false_alarm') THEN
    RAISE EXCEPTION 'a stream is resumed for a cause fixed or a false alarm' USING ERRCODE = 'check_violation', CONSTRAINT = 'mail_stream_resume_reason';
  END IF;
  UPDATE mail_stream s
     SET paused_at = NULL, paused_reason = NULL, paused_by = NULL, pause_sends = NULL, pause_bounces = NULL, pause_complaints = NULL,
         window_starts_at = now(), resumed_at = now(), probe_sent_at = NULL, ses_enabled_confirmed_at = NULL
   WHERE s.stream = stream AND s.paused_at IS NOT NULL;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  INSERT INTO audit_event (actor_id, actor_kind, action, object_type, purpose)
  VALUES (app_actor_id(), 'user', 'mail_stream_resumed', 'mail_stream', reason);
  RETURN true;
END;
$$;

-- Recent undelivered or reported customer messages for the runbook (at most 500, newest first), each with its kind,
-- user, subject and, for a support notice, its practice; the screening's are counted by kind and state, never listed.
CREATE FUNCTION console_mail_undelivered(since timestamptz) RETURNS TABLE (stream text, kind text, state text, recipient_user_id uuid, practice_id uuid,
  subject_id uuid, undelivered_at timestamptz, messages integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF app_actor_id() IS NULL OR NOT app_actor_is_person() OR NOT coalesce(app_actor_platform_permitted('feature_flag.manage'), false) THEN
    RAISE EXCEPTION 'only a platform administrator reads undelivered mail' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
    (SELECT m.stream, m.kind, m.state, m.recipient_user_id, n.practice_id, m.subject_id, coalesce(m.undelivered_at, m.complained_at), 1
       FROM mail_send m
       LEFT JOIN support_grant_notice n ON m.kind IN ('support_grant_opened', 'support_grant_closed') AND n.id = m.subject_id
      WHERE m.stream <> 'screening' AND m.kind <> 'probe' AND m.state IN ('bounced', 'suppressed', 'rejected', 'complained')
        AND coalesce(m.undelivered_at, m.complained_at) >= coalesce($1, now() - interval '7 days')
      ORDER BY coalesce(m.undelivered_at, m.complained_at) DESC, m.ses_message_id
      LIMIT 500)
    UNION ALL
    (SELECT 'screening', m.kind, m.state, NULL::uuid, NULL::uuid, NULL::uuid, max(coalesce(m.undelivered_at, m.complained_at)), count(*)::integer
       FROM mail_send m
      WHERE m.stream = 'screening' AND m.kind <> 'probe' AND m.state IN ('bounced', 'suppressed', 'rejected', 'complained')
        AND coalesce(m.undelivered_at, m.complained_at) >= coalesce($1, now() - interval '7 days')
      GROUP BY m.kind, m.state);
END;
$$;

-- As before, with each notice's recipients counted from its rows (null when it has not been opened): delivered,
-- undelivered, pending and its latest send. The columns before the new ones are unchanged.
DROP FUNCTION console_support_grants();
CREATE FUNCTION console_support_grants() RETURNS TABLE (support_grant_id uuid, practice_id uuid, user_id uuid, ticket text, reason text,
  created_at timestamptz, expires_at timestamptz, notified_at timestamptz, reads bigint,
  opened_recipients integer, opened_delivered integer, opened_undelivered integer, opened_pending integer, opened_sent_at timestamptz,
  closed_recipients integer, closed_delivered integer, closed_undelivered integer, closed_pending integer, closed_sent_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT s.id, s.practice_id, s.user_id, s.ticket, s.reason, s.created_at, s.expires_at, s.notified_at,
         (SELECT count(*) FROM audit_event e WHERE e.grant_id = s.id AND e.action = 'read'),
         o.recipients, o.delivered, o.undelivered, o.pending, o.sent_at,
         c.recipients, c.delivered, c.undelivered, c.pending, c.sent_at
    FROM support_grant s
    LEFT JOIN LATERAL support_notice_counts(s.id, 'support_grant_opened') o ON true
    LEFT JOIN LATERAL support_notice_counts(s.id, 'support_grant_closed') c ON true
   WHERE app_actor_platform_permitted('support_grant.create')
   ORDER BY s.created_at DESC, s.id
$$;

-- ---------------------------------------------------------------------------------------------------
-- 9. submit_screening(), recreated on top of migration 20261106090000's body (Q10 (a); section 5, D7)
-- ---------------------------------------------------------------------------------------------------

DROP FUNCTION submit_screening(text, text, text, text, text, text[], text[], integer[], text[], text[], text[], bigint[], integer[], integer, integer, bigint,
  integer, bigint, bigint, text, text, text, text, text, text, text, text, timestamptz, text, text);

-- An accepted upload, exactly as migration 20261106090000 left it, and one parameter more after request: client_subject,
-- the rate limiter's keyed HMAC of the client address (64 hex characters, or null when the web had none; the run's CHECK
-- refuses anything else), which the run keeps for the bounce budget. Its default keeps the previous web's calls working
-- during the deploy window. The refusals this migration adds come from the triggers on screening_upload and screening_run.
-- A db test diffs this body against that migration's.
CREATE FUNCTION submit_screening(practice text, state_code text, zip5 text, plus_four text, email text, codes text[], modifier_sets text[],
  unit_counts integer[], places text[], products text[], bands text[], allowed_cents bigint[], claim_counts integer[],
  rows_left_out integer, claim_lines_left_out integer, allowed_cents_left_out bigint, rows_outside_content integer,
  claim_lines_outside_content bigint, allowed_cents_outside_content bigint, heard_from text, campaign_source text,
  campaign_medium text, campaign_name text, click_kind text, firm text, consent_sha256 text, terms_sha256 text, received timestamptz,
  rate_account_subject text, request text, client_subject text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  in_force integer := current_rule_release();
  manifest text;
  split uuid := place_of_service_split_in_force();
  location text;
  kept_plus_four text;
  content_days datemultirange;
  n integer := coalesce(cardinality(codes), 0);
  rows_hash text;
  lock_key bigint;
  created uuid;
  kept_prospect uuid;
  kept_upload uuid;
BEGIN
  SELECT r.manifest_sha256 INTO manifest FROM rule_release r WHERE r.release_no = in_force;
  IF in_force IS NULL OR manifest IS NULL OR split IS NULL THEN
    RAISE EXCEPTION 'screening is closed until a rule release is in force and a place-of-service split is approved'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_closed';
  END IF;
  SELECT l.status INTO location FROM locality_status(in_force, zip5, plus_four, NULL, NULL) l;
  IF location = 'zip_plus_four_needed'
     AND NOT EXISTS (SELECT 1 FROM rule_record r WHERE r.release_no = in_force AND r.record_type = 'locality_map_plus_four' AND r.key = jsonb_build_object('zip', zip5)) THEN
    location := 'locality_not_loaded';
  END IF;
  IF location = 'zip_unknown' THEN
    RAISE EXCEPTION 'the rule release in force maps no locality for this ZIP code' USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_zip_unknown';
  ELSIF location = 'zip_plus_four_needed' THEN
    RAISE EXCEPTION 'this ZIP code spans two payment localities: its ZIP+4 is needed' USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_zip_plus_four';
  ELSIF location = 'zip_plus_four_unknown' THEN
    RAISE EXCEPTION 'the ZIP+4 list in force holds no locality for this ZIP+4' USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_zip_plus_four_unknown';
  ELSIF location IS DISTINCT FROM 'ready' THEN
    RAISE EXCEPTION 'the rule release in force has not loaded the locality list for this ZIP code' USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_locality_not_loaded';
  END IF;
  -- Kept only when the ZIP needs it (minimisation): a ZIP+4 given for any other ZIP is not stored.
  IF EXISTS (SELECT 1 FROM rule_record r
              WHERE r.release_no = in_force AND r.record_type = 'locality_map' AND r.key = jsonb_build_object('zip', zip5)
                AND coalesce((r.value ->> 'plus_four_required')::boolean, false)) THEN
    kept_plus_four := plus_four;
  END IF;
  IF n NOT BETWEEN 1 AND 50000
     OR array_ndims(codes) <> 1 OR array_ndims(modifier_sets) IS DISTINCT FROM 1 OR array_ndims(unit_counts) IS DISTINCT FROM 1
     OR array_ndims(places) IS DISTINCT FROM 1 OR array_ndims(products) IS DISTINCT FROM 1 OR array_ndims(bands) IS DISTINCT FROM 1
     OR array_ndims(allowed_cents) IS DISTINCT FROM 1 OR array_ndims(claim_counts) IS DISTINCT FROM 1
     OR cardinality(modifier_sets) <> n OR cardinality(unit_counts) <> n OR cardinality(places) <> n OR cardinality(products) <> n
     OR cardinality(bands) <> n OR cardinality(allowed_cents) <> n OR cardinality(claim_counts) <> n THEN
    RAISE EXCEPTION 'a screening is 1 to 50,000 rows, every column with a value for each' USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_rows';
  END IF;
  -- The days every silently read content is loaded for (audit #7), once: a Medicare row's quarter must lie inside them.
  SELECT range_intersect_agg(s.loaded) INTO content_days FROM rule_release_content_span(in_force) s;
  IF EXISTS (SELECT 1 FROM unnest(products, bands) AS u (product, band)
              WHERE u.product IN ('medicare_ffs', 'ma_noncontracted') AND NOT (content_days @> screening_band_days(u.band))) THEN
    RAISE EXCEPTION 'a Medicare row''s quarter is outside the content the release in force has loaded' USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_band_outside_content';
  END IF;
  -- Submissions of one practice take these locks in one order (its ZIP and name, its contact address), so the later
  -- waits for the earlier to commit, then sees it and replaces it.
  FOR lock_key IN
    SELECT k FROM unnest(ARRAY[hashtextextended('screening_practice:' || zip5 || ':' || screening_practice_key(practice), 0),
                               hashtextextended('screening_contact:' || lower(btrim(email)), 0)]) AS k
     ORDER BY k
  LOOP
    PERFORM pg_advisory_xact_lock(lock_key);
  END LOOP;
  -- The SHA-256 of the rows as accepted, in their canonical form (format.ts, encodeScreeningRows: each row's eight
  -- fields tab-joined in column order, the rows joined by line feeds), from the rows stored below and never from the
  -- caller: a hash of the file would cover the rows the browser left out. A row with a null field is refused by its
  -- column's NOT NULL below, so no hash is kept beside rows other than those it covers.
  SELECT encode(sha256(convert_to(string_agg(u.code || E'\t' || u.mods || E'\t' || u.unit_count::text || E'\t' || u.place || E'\t' || u.product || E'\t' || u.band
                                             || E'\t' || u.allowed::text || E'\t' || u.claims::text, E'\n' ORDER BY u.ordinality), 'UTF8')), 'hex')
    INTO rows_hash
    FROM unnest(codes, modifier_sets, unit_counts, places, products, bands, allowed_cents, claim_counts)
           WITH ORDINALITY AS u (code, mods, unit_count, place, product, band, allowed, claims, ordinality);
  -- The campaign code is kept only when the founder lists it (marketing_campaign_listed_only(), on the table): the
  -- prospect returns the code as kept, listed, 'other' or null, and the outcome takes that, so the two never differ.
  WITH prospect AS (
    INSERT INTO screening_prospect (practice_name, state, zip, zip_plus_four, contact_email, source, utm_source, utm_medium, utm_campaign, paid_click,
                                    referring_firm, followup_consent_sha256, screening_terms_sha256)
    VALUES (btrim(practice), state_code, zip5, kept_plus_four, lower(btrim(email)), heard_from, campaign_source, campaign_medium, campaign_name, click_kind,
            firm, consent_sha256, terms_sha256)
    RETURNING id, utm_campaign
  ), upload AS (
    INSERT INTO screening_upload (prospect_id, rows_sha256, row_count, status, left_out_rows, left_out_claim_lines, left_out_allowed_cents,
                                  outside_content_rows, outside_content_claim_lines, outside_content_allowed_cents)
    SELECT prospect.id, rows_hash, n, 'accepted', rows_left_out, claim_lines_left_out, allowed_cents_left_out,
           rows_outside_content, claim_lines_outside_content, allowed_cents_outside_content FROM prospect
    RETURNING id
  ), outcome AS (
    -- The counts-only outcome: bands, the channel computed here, the prospect's campaign code as kept.
    INSERT INTO screening_outcome (upload_id, screened_month, stage, source, channel, campaign, consented, row_band, left_out_band, release_no, after_refusal)
    SELECT upload.id, to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM'), 'accepted', heard_from, marketing_channel(campaign_medium, click_kind), prospect.utm_campaign,
           consent_sha256 IS NOT NULL, screening_count_band(n), screening_count_band(rows_left_out), in_force,
           -- A refused upload of the practice (the same ZIP and practice name, or the same contact address) still kept.
           EXISTS (SELECT 1 FROM screening_upload ru JOIN screening_prospect rp ON rp.id = ru.prospect_id
                    WHERE ru.status = 'rejected'
                      AND (rp.contact_email = lower(btrim(email)) OR (rp.zip = zip5 AND screening_practice_key(rp.practice_name) = screening_practice_key(practice))))
      FROM upload, prospect
    RETURNING id
  ), run AS (
    INSERT INTO screening_run (upload_id, release_no, release_manifest_sha256, place_of_service_split_id, row_count, received_at, rate_subject,
                               wait_reason, queue_priority, client_subject)
    SELECT upload.id, in_force, manifest, split, n, least(greatest(coalesce(received, now()), now() - interval '10 minutes'), now()), rate_account_subject,
           tier.wait_reason, tier.queue_priority, client_subject
      FROM upload, screening_queue_tier(rate_account_subject, n) tier
    RETURNING id, wait_reason
  ), tallied AS (
    -- The upload in the day's tally (Q7): the account's share and the cap count it even once a later screening of
    -- the same practice or address replaces this one and deletes its run.
    INSERT INTO screening_queue_tally (rate_subject, row_count, wait_reason)
    SELECT rate_account_subject, n, run.wait_reason FROM run
  ), uploaded AS (
    INSERT INTO screening_result (run_id, row_no, procedure_code, modifiers, units, place_of_service, payer_product, service_band, claim_count, observed_allowed_cents, disposition)
    SELECT run.id, u.ordinality::integer, u.code, CASE WHEN u.mods = '' THEN '{}'::text[] ELSE string_to_array(u.mods, ' ') END, u.unit_count, u.place,
           u.product, u.band, u.claims, u.allowed,
           CASE WHEN u.product IN ('ma_contracted', 'commercial') THEN 'contract_required' WHEN u.product IN ('medicaid', 'other') THEN 'not_screened' ELSE 'pending' END
      FROM run, unnest(codes, modifier_sets, unit_counts, places, products, bands, allowed_cents, claim_counts)
             WITH ORDINALITY AS u (code, mods, unit_count, place, product, band, allowed, claims, ordinality)
  )
  INSERT INTO audit_event (actor_kind, action, object_type, object_id, purpose, request_id)
  SELECT 'system', 'screening_submitted', 'screening_run', run.id, 'screening', request FROM run, outcome
  RETURNING object_id INTO created;
  SELECT u.prospect_id, u.id INTO kept_prospect, kept_upload FROM screening_run r JOIN screening_upload u ON u.id = r.upload_id WHERE r.id = created;
  -- The screenings this one replaces, locked before anything of theirs is changed: their prospects, then their runs,
  -- each in id order (see above). A run another transaction holds (a conversion, an open, a completion) is waited for;
  -- a prospect the expiry job holds is waited for and, deleted by it, skipped.
  PERFORM 1 FROM screening_prospect o, screening_prospect k
    WHERE k.id = kept_prospect AND o.id <> k.id
      AND EXISTS (SELECT 1 FROM screening_upload u WHERE u.prospect_id = o.id AND u.status = 'accepted')
      AND (o.contact_email = k.contact_email OR (o.zip = k.zip AND screening_practice_key(o.practice_name) = screening_practice_key(k.practice_name)))
    ORDER BY o.id
      FOR UPDATE OF o;
  PERFORM 1 FROM screening_run r JOIN screening_upload u ON u.id = r.upload_id JOIN screening_prospect o ON o.id = u.prospect_id, screening_prospect k
    WHERE k.id = kept_prospect AND o.id <> k.id AND u.status = 'accepted'
      AND (o.contact_email = k.contact_email OR (o.zip = k.zip AND screening_practice_key(o.practice_name) = screening_practice_key(k.practice_name)))
    ORDER BY r.id
      FOR UPDATE OF r;
  -- The outcomes of the screenings this one replaces, before the screenings are deleted (which unlinks them).
  UPDATE screening_outcome o SET superseded = true
    FROM screening_upload u, screening_prospect p, screening_prospect k
   WHERE o.upload_id = u.id AND u.prospect_id = p.id AND u.status = 'accepted' AND NOT o.superseded
     AND k.id = kept_prospect AND p.id <> k.id
     AND (p.contact_email = k.contact_email OR (p.zip = k.zip AND screening_practice_key(p.practice_name) = screening_practice_key(k.practice_name)));
  -- The screening replaces any earlier accepted one of the same practice (screening_replaced), deleted with its upload,
  -- run and rows, each an audit event.
  WITH kept AS (
    SELECT p.id, p.zip, p.practice_name, p.contact_email FROM screening_prospect p WHERE p.id = kept_prospect
  ), replaced AS (
    DELETE FROM screening_prospect o USING kept, screening_upload u
     WHERE u.prospect_id = o.id AND u.status = 'accepted' AND o.id <> kept.id
       AND (o.contact_email = kept.contact_email OR (o.zip = kept.zip AND screening_practice_key(o.practice_name) = screening_practice_key(kept.practice_name)))
    RETURNING o.id
  )
  INSERT INTO audit_event (actor_kind, action, object_type, object_id, purpose, request_id)
  SELECT 'system', 'screening_replaced', 'screening_prospect', replaced.id, 'screening', request FROM replaced;
  RETURN created;
END;
$$;

-- The web's check before it spends one of the day's address validations (review S4; D9): the refusal of an accepted
-- upload's mail that submit_screening() would give, in its order, writing nothing: screening_closed (no release in
-- force, or no split approved), screening_paused, screening_bounce_budget (the submitter's keyed subjects), then
-- screening_contact_undeliverable (the address's mailbox); null when none applies. The submitter's budget comes before
-- the address, as in the run's trigger (S1), so a client or an account past it learns nothing of the list here either.
-- The triggers stay the backstop for a change between this read and the submission. Granted to tp_app.
CREATE FUNCTION screening_submit_mail_refusal(email text, rate_account_subject text, client_subject text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT CASE
           WHEN current_rule_release() IS NULL OR place_of_service_split_in_force() IS NULL
                OR NOT EXISTS (SELECT 1 FROM rule_release r WHERE r.release_no = current_rule_release() AND r.manifest_sha256 IS NOT NULL) THEN 'screening_closed'
           WHEN NOT EXISTS (SELECT 1 FROM mail_stream s WHERE s.stream = 'screening' AND s.paused_at IS NULL) THEN 'screening_paused'
           WHEN screening_bounce_budget_spent($2, $3) THEN 'screening_bounce_budget'
           WHEN screening_contact_refused($1) THEN 'screening_contact_undeliverable'
         END
$$;

-- ---------------------------------------------------------------------------------------------------
-- 10. The functions the outboxes replace
-- ---------------------------------------------------------------------------------------------------

DROP FUNCTION operator_record_support_notice(uuid, text, text);
DROP FUNCTION operator_practice_administrator_emails(uuid);
DROP FUNCTION billing_owner_emails(uuid);

-- ---------------------------------------------------------------------------------------------------
-- 11. Privileges, once: every table and function this migration creates is revoked from PUBLIC and granted to exactly
-- its role (CREATE OR REPLACE keeps an ACL, so the replaced function is stated again)
-- ---------------------------------------------------------------------------------------------------

REVOKE ALL ON mail_recipient_key, mail_stream, mail_send, screening_mail_refusal, screening_bounce_mark, dunning_notice_recipient,
  support_grant_notice, support_grant_notice_recipient FROM PUBLIC;
GRANT SELECT ON support_grant_notice, support_grant_notice_recipient TO tp_app;

REVOKE ALL ON FUNCTION mail_recipient_canonical(text), mail_recipient_sha256(text), mail_send_expiry(), mail_state_rank(text), mail_window_counts(text),
  screening_mail_sending(), screening_mail_gate(), screening_mail_status(), screening_bounce_budget_spent(text, text), screening_contact_refused(text),
  screening_submit_mail_refusal(text, text, text),
  screening_upload_mail_gate(), screening_run_mail_refusal(), screening_run_mail_gate(),
  support_notice_administrators(uuid), support_notice_report_undelivered(uuid, text), support_notice_counts(uuid, text),
  operator_open_support_notice(uuid, text, text), operator_support_notices_pending(integer), operator_support_notice_claim(uuid, uuid),
  operator_support_notice_sent(uuid, uuid, text, text), operator_support_notice_failed(uuid, uuid, text, boolean, text), operator_due_support_notices(integer),
  dunning_notice_report_undelivered(uuid, text, text), billing_open_dunning_notice(uuid, text, text), billing_dunning_notices_pending(integer),
  billing_dunning_notice_claim(uuid, text, uuid), billing_dunning_notice_sent(uuid, text, uuid, text, text),
  billing_dunning_notice_failed(uuid, text, uuid, text, boolean, text), mail_stream_pause(text, uuid, text),
  operator_record_mail_event(text, text, text, timestamptz, timestamptz, text, text, uuid, uuid, uuid, text, text, text, text),
  operator_mail_account_signal(text, text), operator_mail_streams(), operator_mail_stream_confirmed(text, boolean), operator_mail_probe_sent(text),
  operator_mail_expire(integer), console_mail_streams(), console_pause_mail_stream(text, text), console_resume_mail_stream(text, text),
  console_mail_undelivered(timestamptz), console_support_grants(),
  submit_screening(text, text, text, text, text, text[], text[], integer[], text[], text[], text[], bigint[], integer[], integer, integer, bigint,
    integer, bigint, bigint, text, text, text, text, text, text, text, text, timestamptz, text, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION operator_open_support_notice(uuid, text, text), operator_support_notices_pending(integer), operator_support_notice_claim(uuid, uuid),
  operator_support_notice_sent(uuid, uuid, text, text), operator_support_notice_failed(uuid, uuid, text, boolean, text), operator_due_support_notices(integer),
  operator_record_mail_event(text, text, text, timestamptz, timestamptz, text, text, uuid, uuid, uuid, text, text, text, text),
  operator_mail_account_signal(text, text), operator_mail_streams(), operator_mail_stream_confirmed(text, boolean), operator_mail_probe_sent(text),
  operator_mail_expire(integer) TO tp_operator;
GRANT EXECUTE ON FUNCTION billing_open_dunning_notice(uuid, text, text), billing_dunning_notices_pending(integer), billing_dunning_notice_claim(uuid, text, uuid),
  billing_dunning_notice_sent(uuid, text, uuid, text, text), billing_dunning_notice_failed(uuid, text, uuid, text, boolean, text) TO tp_billing;
GRANT EXECUTE ON FUNCTION screening_mail_status(), screening_submit_mail_refusal(text, text, text), console_mail_streams(), console_pause_mail_stream(text, text),
  console_resume_mail_stream(text, text), console_mail_undelivered(timestamptz), console_support_grants(),
  submit_screening(text, text, text, text, text, text[], text[], integer[], text[], text[], text[], bigint[], integer[], integer, integer, bigint,
    integer, bigint, bigint, text, text, text, text, text, text, text, text, timestamptz, text, text, text) TO tp_app;
GRANT EXECUTE ON FUNCTION screening_mail_gate() TO tp_screening;

-- The free screening's own consumer and the 60-second time check (PR 6b-3 of Change Order 001's PR 6b: audit #53 parts
-- 3 and 4, decisions 13 to 16 and #31's screening part; the founder's answers of 2026-10-21 to PR 6b's questions Q1 (a)
-- and (b), consumer option A held at 0 in production until launch, and Q7, the account's share, the daily cap and the
-- honest wait). Decisions: docs/adr/0062, 0049, 0019 and 0014.
--
-- - tp_screening: the consumer's role (WORKER_JOBS=screening; one 2 vCPU, 4 GiB task pricing three screenings at once,
--   each in its own worker thread). The role bootstrap creates it (packages/db/src/roles.ts: NOLOGIN, NOSUPERUSER,
--   NOBYPASSRLS, a member of nothing, owning nothing) and its login tp_screening_login, which may SET ROLE to it
--   without inheriting it (apps/worker/src/deploy/logins.ts), as billing's does. It is granted EXECUTE on the nine
--   functions that price a screening and on operator_screening_queue(), and on nothing else: no table, no other
--   function. The application role may not switch to it (catalog.ts).
-- - screening_run gains five columns: received_at, when the web began receiving the upload (by the web's clock,
--   clamped into the ten minutes before the run's creation; backfilled from created_at), the start of the time to
--   email; rate_subject, the rate limiter's keyed HMAC of the screening bucket's account (rateSubjectHash,
--   apps/web/src/lib/http/rate-limit.ts), passed by the web as rate_account_subject, never the account itself
--   (backfilled with a SHA-256 of each run's own ID, so no earlier run shares an account); wait_reason and
--   queue_priority, the run's place in the queue set once at submission; and progress_at, when the attempt pricing it
--   last claimed it or recorded a batch, which staleness reads (2 minutes, not 10 minutes after the claim). The column is
--   rate_subject, not the plan's account_subject: SEC-17 (packages/db/src/screening.db.test.ts) refuses a screening
--   column named like an account number. It goes with the run at 30 days, as the address beside it does.
-- - The queue (Q7): submit_screening() puts an upload past its account's share of rows this UTC day (100,000) at
--   priority -k, its k-th such upload today (at most -20), and otherwise one past the day's cap of rows of normal
--   uploads (1,000,000) at -1, with its reason (screening_queue_tier(), from screening_wait_limits()); every other
--   upload at 0. Every upload is accepted. pg-boss takes higher priorities first, then older jobs, and
--   operator_screening_due() orders the same way. No lock is taken for the sums, so submissions at the same moment can
--   overshoot the share or the cap by what is in flight (docs/adr/0062).
-- - screening_wait(run): the web's honest message (the run's priority and reason, the runs being priced, and the queued
--   runs pg-boss takes before it). operator_screening_queue(): the consumer's gauge, normal-tier queued runs and the
--   oldest one's age (OldestQueuedMs), the waiting tier's count, and the runs being priced.
-- - operator_screening_complete() returns received_at and wait_reason, so the consumer logs the time to email from the
--   web's receipt; a pause of the screening's mail is the job's to judge (6b-4), not a column here.
-- - operator_screening_release() reads the release's shared types through rule_record_by_type: the release's record
--   types by a loose index scan, the six keyed types left out, each other type by the index (no scan of rule_record).
--
-- Every shared function is recreated on top of the body migration 20261105090000 left, read from a freshly migrated
-- database: submit_screening() as it was but for its two new parameters (received, rate_account_subject, before request)
-- and the run's four new values; operator_screening_claim() as it was but for staleness on progress_at, which the claim
-- sets; operator_screening_record() as it was but for the update of progress_at in place of the lock; the others as
-- each says. Privileges come last, once: every function this migration creates is revoked from PUBLIC and granted to
-- exactly its role (CREATE OR REPLACE keeps an ACL). tp_operator keeps the nine pricing functions for one release, so the
-- previous image's platform task still prices during the deploy window; the first schema pull request after this one is
-- deployed revokes them (docs/runbooks/deploy-and-rollback.md: add, then remove). No PHI table, no ledger table, no rule
-- table, no pricing_run or priced_line row and no rule release or record row is touched; the PHI registry is unchanged
-- (the screening tables hold no practice and no patient, and tp_screening reads none of them).
--
-- Runs as tp_owner. Safe with the previous image running, except during the deploy window:
-- 1. the previous web's submissions fail: submit_screening()'s signature changed. The screening is closed in production
--    until launch, so no prospect meets it there;
-- 2. the previous platform task still works screening_price beside the new consumer, with tp_operator's grants kept: the
--    claim fences any run both take, and a run either completes is complete once. Its calls work against the new
--    bodies (the claim sets progress_at, which the trigger accepts; a recorded batch also moves it; due's new column is
--    not among those it reads by name, nor complete's two);
-- 3. a stale run is claimed again 2 minutes after its last progress, not 10 after its claim, by either image;
-- 4. a job the previous web sends carries pg-boss's default priority (0, the normal tier) and no heartbeat of its own,
--    and takes the queue's heartbeat once the new consumer has set it (updateQueue);
-- 5. the previous platform task's minute schedule of screening_price stays in pg-boss until the new consumer removes it
--    at its start; a schedule fired before then runs the sweep on the consumer.
-- Rollback across this pull request is run from the previous tag: its platform prices again under tp_operator's
-- grants; its web cannot submit a screening (effect 1) until this image returns; the new columns and functions stay,
-- unused. Rollout: migrate, then the new worker image (the screening consumer, and the platform without
-- screening_price), then the new web.

-- ---------------------------------------------------------------------------------------------------
-- 1. screening_run: when the upload was received, its account's keyed subject, its place in the queue, its progress
-- ---------------------------------------------------------------------------------------------------

ALTER TABLE screening_run
  -- When the web began receiving the upload (its handler's start, before any parsing), by the web's clock; the time to
  -- email is measured from it. submit_screening() clamps what it is given into the ten minutes before the run's
  -- creation, so a clock never refuses a prospect.
  ADD COLUMN received_at timestamptz,
  -- The rate limiter's keyed HMAC of the screening bucket's account (a business domain, or a free-mail mailbox), as the
  -- web computes it for its own limit: the database never receives the account. The share sums an account's rows by it.
  ADD COLUMN rate_subject text,
  -- Why the run waits behind the normal tier (Q7): past its account's share today, or past the day's cap. Set once.
  ADD COLUMN wait_reason text,
  -- pg-boss's priority for the run's job, higher first: 0, the normal tier (and pg-boss's default, so the previous web's
  -- sends rank as normal), or -k for an account's k-th upload past its share today (-1 past the day's cap). Set once.
  ADD COLUMN queue_priority smallint NOT NULL DEFAULT 0,
  -- When the attempt pricing the run claimed it or last recorded a batch; a run in pricing is stale 2 minutes after it.
  ADD COLUMN progress_at timestamptz;

-- The backfill changes columns a run otherwise keeps for good, so the run's rules are off for this one statement, inside
-- this migration's transaction. Every run before this migration is its own account's (a SHA-256 of 'run:' and its ID,
-- in the subject's shape), was received when it was created, and last progressed when it was last claimed.
ALTER TABLE screening_run DISABLE TRIGGER screening_run_rules;
UPDATE screening_run
   SET received_at = created_at, rate_subject = encode(sha256(convert_to('run:' || id::text, 'UTF8')), 'hex'), progress_at = started_at;
ALTER TABLE screening_run ENABLE TRIGGER screening_run_rules;

ALTER TABLE screening_run
  ALTER COLUMN received_at SET NOT NULL,
  ALTER COLUMN rate_subject SET NOT NULL,
  ADD CONSTRAINT screening_run_received CHECK (received_at BETWEEN created_at - interval '10 minutes' AND created_at),
  ADD CONSTRAINT screening_run_rate_subject CHECK (rate_subject ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT screening_run_wait_reason CHECK (wait_reason IN ('account_share', 'daily_cap')),
  ADD CONSTRAINT screening_run_priority CHECK (queue_priority BETWEEN -20 AND 0 AND (queue_priority = 0) = (wait_reason IS NULL)),
  ADD CONSTRAINT screening_run_progress CHECK (
    (status <> 'queued' OR progress_at IS NULL)
    AND (status NOT IN ('pricing', 'complete') OR progress_at IS NOT NULL)
    AND (progress_at IS NULL OR progress_at >= started_at));

-- The day's sums at submission (the cap's normal rows, and an account's rows), and the queued runs in pg-boss's order
-- (operator_screening_due(), screening_wait(), operator_screening_queue()).
CREATE INDEX screening_run_created_at ON screening_run (created_at);
CREATE INDEX screening_run_account_day ON screening_run (rate_subject, created_at);
CREATE INDEX screening_run_waiting ON screening_run (queue_priority DESC, created_at) WHERE status = 'queued';

-- ---------------------------------------------------------------------------------------------------
-- 2. The queue's tier (Q7)
-- ---------------------------------------------------------------------------------------------------

-- The founder's numbers (Q7, 2026-10-21): an account's share of rows a UTC day (two worst-shape files), and the day's
-- cap of rows of uploads within their share (ten accounts' shares). Read by screening_queue_tier() alone, which
-- submit_screening() calls as the owner; granted to no role, and nothing in the web reads them.
CREATE FUNCTION screening_wait_limits() RETURNS TABLE (account_rows integer, daily_rows integer)
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT 100000, 1000000
$$;

-- An upload's place in the queue, at its submission: past its account's share when the account's rows this UTC day,
-- this upload's with them, exceed the share, at -k for its k-th such upload today (at most -20), so heavy accounts take
-- turns and none's surplus goes before another's first; otherwise past the day's cap, at -1, when the day's rows of
-- normal uploads, this one's with them, exceed the cap (the cap counts the normal tier alone, so one firm's surplus
-- does not use up everyone else's protection); otherwise normal, at 0. No lock: what is in flight at once can overshoot.
-- Granted to no role; submit_screening() calls it as the owner.
CREATE FUNCTION screening_queue_tier(subject text, row_count integer) RETURNS TABLE (wait_reason text, queue_priority smallint)
LANGUAGE sql STABLE SET search_path = pg_catalog, public, pg_temp AS $$
  WITH limits AS (
    SELECT l.account_rows, l.daily_rows FROM screening_wait_limits() l
  ), today AS (
    SELECT date_trunc('day', now(), 'UTC') AS started
  ), account AS (
    SELECT coalesce(sum(r.row_count), 0) + $2 AS rows, count(*) FILTER (WHERE r.wait_reason = 'account_share') AS waiting
      FROM screening_run r, today WHERE r.rate_subject = $1 AND r.created_at >= today.started
  ), normal AS (
    SELECT coalesce(sum(r.row_count), 0) + $2 AS rows FROM screening_run r, today WHERE r.wait_reason IS NULL AND r.created_at >= today.started
  )
  SELECT CASE WHEN account.rows > limits.account_rows THEN 'account_share' WHEN normal.rows > limits.daily_rows THEN 'daily_cap' END,
         (CASE WHEN account.rows > limits.account_rows THEN -least(20, 1 + account.waiting)
               WHEN normal.rows > limits.daily_rows THEN -1
               ELSE 0 END)::smallint
    FROM limits, account, normal
$$;

-- ---------------------------------------------------------------------------------------------------
-- 3. The shared screening functions, each recreated on top of migration 20261105090000's body
-- ---------------------------------------------------------------------------------------------------

-- A run keeps its upload, release, split, row count, dates, receipt, account and place in the queue; it moves queued
-- to pricing (a stale run is claimed again, one attempt more, the claim setting its progress), pricing to complete or
-- failed, or queued to failed; while it is priced, the attempt that claimed it moves its progress forward and nothing
-- else; its token, its conversion and its first open are each set once (a complete run's conversion and first open in
-- the same update or apart).
CREATE OR REPLACE FUNCTION screening_run_rules() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF (NEW.id, NEW.upload_id, NEW.release_no, NEW.release_manifest_sha256, NEW.place_of_service_split_id, NEW.row_count, NEW.created_at, NEW.expires_at,
      NEW.received_at, NEW.rate_subject, NEW.wait_reason, NEW.queue_priority)
     IS DISTINCT FROM (OLD.id, OLD.upload_id, OLD.release_no, OLD.release_manifest_sha256, OLD.place_of_service_split_id, OLD.row_count, OLD.created_at, OLD.expires_at,
      OLD.received_at, OLD.rate_subject, OLD.wait_reason, OLD.queue_priority) THEN
    RAISE EXCEPTION 'a screening run keeps its upload, release, split, row count, dates, account and place in the queue' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status = 'pricing' AND NEW.status = 'pricing' AND NEW.attempts = OLD.attempts THEN
    -- A recorded batch, by the attempt that claimed the run: its progress, forward only. Its CHECKs hold everything
    -- else of a run in pricing empty.
    IF NEW.started_at IS DISTINCT FROM OLD.started_at OR NEW.progress_at IS NULL OR NEW.progress_at < OLD.progress_at THEN
      RAISE EXCEPTION 'a screening run being priced moves only its progress, and only forward' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.status = 'pricing' AND OLD.status IN ('queued', 'pricing') THEN
    IF NEW.attempts <> OLD.attempts + 1 OR NEW.started_at IS NOT DISTINCT FROM OLD.started_at THEN
      RAISE EXCEPTION 'a screening run is claimed one attempt at a time, from when it is claimed' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF (OLD.status = 'pricing' AND NEW.status IN ('complete', 'failed')) OR (OLD.status = 'queued' AND NEW.status = 'failed') THEN
    IF NEW.attempts <> OLD.attempts OR NEW.started_at IS DISTINCT FROM OLD.started_at OR NEW.progress_at IS DISTINCT FROM OLD.progress_at THEN
      RAISE EXCEPTION 'a screening run ends on the attempt that priced it' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.converted_at IS NOT NULL OR NEW.first_opened_at IS NOT NULL THEN
      RAISE EXCEPTION 'a screening is opened and converts once it is complete' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF OLD.status = 'complete' AND NEW.status = 'complete' THEN
    IF (NEW.attempts, NEW.started_at, NEW.completed_at, NEW.engine_version, NEW.result_token_sha256, NEW.failed_at, NEW.failure_code, NEW.progress_at)
       IS DISTINCT FROM (OLD.attempts, OLD.started_at, OLD.completed_at, OLD.engine_version, OLD.result_token_sha256, OLD.failed_at, OLD.failure_code, OLD.progress_at) THEN
      RAISE EXCEPTION 'a complete screening keeps its result and its link' USING ERRCODE = 'check_violation';
    END IF;
    IF (NEW.converted_prospect_request_id, NEW.converted_at) IS DISTINCT FROM (OLD.converted_prospect_request_id, OLD.converted_at)
       AND (OLD.converted_at IS NOT NULL OR NEW.converted_at IS NULL) THEN
      RAISE EXCEPTION 'a screening converts to an audit request once' USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_converted_once';
    END IF;
    IF NEW.first_opened_at IS DISTINCT FROM OLD.first_opened_at AND (OLD.first_opened_at IS NOT NULL OR NEW.first_opened_at IS NULL) THEN
      RAISE EXCEPTION 'a screening result is first opened once' USING ERRCODE = 'check_violation';
    END IF;
    IF (NEW.converted_prospect_request_id, NEW.converted_at, NEW.first_opened_at) IS NOT DISTINCT FROM (OLD.converted_prospect_request_id, OLD.converted_at, OLD.first_opened_at) THEN
      RAISE EXCEPTION 'a complete screening changes only by its conversion or its first open' USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    RAISE EXCEPTION 'a screening run moves queued, pricing, then complete or failed' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP FUNCTION submit_screening(text, text, text, text, text, text[], text[], integer[], text[], text[], text[], bigint[], integer[], integer, integer, bigint,
  integer, bigint, bigint, text, text, text, text, text, text, text, text, text);

-- An accepted upload, exactly as migration 20261105090000 left it (the refusals in their order, the hash, the locks, the
-- outcome, the run pinned to the release and the split in force, the rows, and the replacement of an earlier screening
-- of the same practice), and two parameters more before request: received, when the web began receiving the upload
-- (null is now), and rate_account_subject, the rate limiter's keyed HMAC of the account (64 hex characters, or the run's
-- CHECK refuses it). The run keeps both, the receipt clamped into the ten minutes before its creation, and the tier
-- screening_queue_tier() gives it (Q7). A db test diffs this body against that migration's (D7).
CREATE FUNCTION submit_screening(practice text, state_code text, zip5 text, plus_four text, email text, codes text[], modifier_sets text[],
  unit_counts integer[], places text[], products text[], bands text[], allowed_cents bigint[], claim_counts integer[],
  rows_left_out integer, claim_lines_left_out integer, allowed_cents_left_out bigint, rows_outside_content integer,
  claim_lines_outside_content bigint, allowed_cents_outside_content bigint, heard_from text, campaign_source text,
  campaign_medium text, campaign_name text, click_kind text, firm text, consent_sha256 text, terms_sha256 text, received timestamptz,
  rate_account_subject text, request text) RETURNS uuid
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
                               wait_reason, queue_priority)
    SELECT upload.id, in_force, manifest, split, n, least(greatest(coalesce(received, now()), now() - interval '10 minutes'), now()), rate_account_subject,
           tier.wait_reason, tier.queue_priority
      FROM upload, screening_queue_tier(rate_account_subject, n) tier
    RETURNING id
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

-- Claims a run, as migration 20261105090000 left it, but stale 2 minutes after its last progress (the claim, or a
-- recorded batch) rather than 10 minutes after its claim; the claim sets its progress. Same signature and result, so
-- its grants stay.
CREATE OR REPLACE FUNCTION operator_screening_claim(run uuid)
RETURNS TABLE (release_no integer, release_manifest_sha256 text, release_available boolean, zip text, zip_plus_four text, settings jsonb, as_of date,
  row_count integer, attempt integer)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  target screening_run%ROWTYPE;
BEGIN
  SELECT r.* INTO target FROM screening_run r WHERE r.id = $1 FOR UPDATE;
  IF NOT FOUND OR now() >= target.expires_at THEN
    RETURN;
  END IF;
  IF target.status = 'queued' OR (target.status = 'pricing' AND target.progress_at < now() - interval '2 minutes' AND target.attempts < 3) THEN
    UPDATE screening_run r SET status = 'pricing', attempts = target.attempts + 1, started_at = now(), progress_at = now() WHERE r.id = target.id;
  ELSE
    RETURN;
  END IF;
  RETURN QUERY
    SELECT target.release_no, target.release_manifest_sha256,
           EXISTS (SELECT 1 FROM rule_release rl
                    WHERE rl.release_no = target.release_no AND rl.manifest_sha256 = target.release_manifest_sha256 AND rl.published_at IS NOT NULL
                      AND NOT EXISTS (SELECT 1 FROM rule_release_withdrawal w WHERE w.release_no = rl.release_no)),
           p.zip, p.zip_plus_four, s.settings, (target.created_at AT TIME ZONE 'UTC')::date, target.row_count, target.attempts + 1
      FROM screening_upload u
      JOIN screening_prospect p ON p.id = u.prospect_id
      JOIN place_of_service_split s ON s.id = target.place_of_service_split_id
     WHERE u.id = target.upload_id;
END;
$$;

DROP FUNCTION operator_screening_due(integer, integer);

-- Runs to price: queued for at least the age given (their own job takes newer ones), and runs whose pricing has made no
-- progress for 2 minutes (a consumer that stopped); at most 100, in pg-boss's order: the higher priority first, then
-- the older. Each with its priority, which the sweep sends its job again with; the previous image reads the first three
-- columns by name.
CREATE FUNCTION operator_screening_due(min_queued_age_seconds integer, at_most integer)
RETURNS TABLE (run_id uuid, status text, attempts integer, queue_priority smallint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT r.id, r.status, r.attempts, r.queue_priority FROM screening_run r
   WHERE now() < r.expires_at
     AND ((r.status = 'queued' AND r.created_at <= now() - make_interval(secs => greatest(coalesce(min_queued_age_seconds, 0), 0)))
       OR (r.status = 'pricing' AND r.progress_at < now() - interval '2 minutes'))
   ORDER BY r.queue_priority DESC, r.created_at, r.id
   LIMIT least(greatest(coalesce(at_most, 0), 0), 100)
$$;

DROP FUNCTION operator_screening_complete(uuid, text, text, text, text, integer);

-- Completes a run, exactly as migration 20261104090000 did, and returns two columns more: when the web received its
-- upload, from which the consumer measures the time to email once the send returns, and why it waited, if it did (a
-- run in the waiting tier is outside the 60-second promise, and logged apart).
CREATE FUNCTION operator_screening_complete(run uuid, token_sha256 text, withdrawal_token_sha256 text, engine text, request text, attempt integer)
RETURNS TABLE (contact_email text, row_count integer, kept_with text, received_at timestamptz, wait_reason text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  target screening_run%ROWTYPE;
  prospect screening_prospect%ROWTYPE;
  uploaded timestamptz;
  carried uuid;
BEGIN
  SELECT r.* INTO target FROM screening_run r WHERE r.id = $1 FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no such screening run' USING ERRCODE = 'no_data_found';
  END IF;
  IF target.status = 'complete' THEN
    RETURN;
  END IF;
  IF target.status <> 'pricing' OR target.attempts IS DISTINCT FROM $6 THEN
    RAISE EXCEPTION 'a screening run completes from pricing, by the attempt that claimed it' USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_run_attempt';
  END IF;
  IF now() >= target.expires_at THEN
    RAISE EXCEPTION 'a screening that expired while it was priced does not complete' USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_run_expired';
  END IF;
  IF EXISTS (SELECT 1 FROM screening_result s WHERE s.run_id = target.id AND s.disposition = 'pending') THEN
    RAISE EXCEPTION 'a screening run completes once every row is priced' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE screening_run r SET status = 'complete', result_token_sha256 = $2, completed_at = now(), engine_version = $4 WHERE r.id = target.id;
  INSERT INTO audit_event (actor_kind, action, object_type, object_id, purpose, request_id)
  VALUES ('system', 'screening_completed', 'screening_run', target.id, 'screening', $5);
  -- The counts-only outcome, every figure computed here from the stored rows.
  UPDATE screening_outcome o
     SET stage = 'priced', engine_version = $4,
         priced_share_pct = CASE WHEN t.total = 0 THEN 0 ELSE (100 * t.priced / t.total)::smallint END,
         contract_share_pct = CASE WHEN t.total = 0 THEN 0 ELSE (100 * t.contract / t.total)::smallint END,
         could_not_price_share_pct = CASE WHEN t.total = 0 THEN 0 ELSE (100 * t.could_not_price / t.total)::smallint END,
         not_screened_share_pct = CASE WHEN t.total = 0 THEN 0 ELSE (100 * t.not_screened / t.total)::smallint END,
         anomaly_band = screening_count_band(t.anomalies), anomaly_difference_band = screening_difference_band(t.anomaly_gap)
    FROM (SELECT coalesce(sum(s.observed_allowed_cents), 0)::bigint AS total,
                 coalesce(sum(s.observed_allowed_cents) FILTER (WHERE s.disposition = 'priced'), 0)::bigint AS priced,
                 coalesce(sum(s.observed_allowed_cents) FILTER (WHERE s.disposition = 'contract_required'), 0)::bigint AS contract,
                 coalesce(sum(s.observed_allowed_cents) FILTER (WHERE s.disposition IN ('unpriced', 'rates_change_in_band')), 0)::bigint AS could_not_price,
                 coalesce(sum(s.observed_allowed_cents) FILTER (WHERE s.disposition = 'not_screened'), 0)::bigint AS not_screened,
                 count(*) FILTER (WHERE s.disposition = 'priced' AND screening_standing(s.expected_cents, s.reduced_cents, s.observed_allowed_cents, s.claim_count) = 'anomaly') AS anomalies,
                 sum(coalesce(s.reduced_cents, s.expected_cents) - s.observed_allowed_cents)
                   FILTER (WHERE s.disposition = 'priced' AND screening_standing(s.expected_cents, s.reduced_cents, s.observed_allowed_cents, s.claim_count) = 'anomaly')::bigint AS anomaly_gap
            FROM screening_result s WHERE s.run_id = target.id) t
   WHERE o.upload_id = target.upload_id AND o.stage = 'accepted';
  SELECT u.created_at INTO uploaded FROM screening_upload u WHERE u.id = target.upload_id;
  SELECT p.* INTO prospect FROM screening_upload u JOIN screening_prospect p ON p.id = u.prospect_id WHERE u.id = target.upload_id;
  -- The practice's kept summaries screened before this upload go, each an audit event; the request of the latest of
  -- the same ZIP and practice name this deletion took that carries one goes over. A request whose summary matched by
  -- the contact address alone keeps no summary (screening_lead_left_request). A summary another completion deleted
  -- first is not among them.
  WITH replaced AS (
    DELETE FROM screening_lead l
     WHERE l.screened_at < uploaded
       AND (l.contact_email = prospect.contact_email OR (l.zip = prospect.zip AND screening_practice_key(l.practice_name) = screening_practice_key(prospect.practice_name)))
    RETURNING l.id, l.prospect_request_id, l.screened_at,
              (l.zip = prospect.zip AND screening_practice_key(l.practice_name) = screening_practice_key(prospect.practice_name)) AS same_practice
  ), recorded AS (
    INSERT INTO audit_event (actor_kind, action, object_type, object_id, purpose, request_id)
    SELECT 'system',
           CASE WHEN replaced.prospect_request_id IS NOT NULL AND NOT replaced.same_practice THEN 'screening_lead_left_request' ELSE 'screening_lead_replaced' END,
           CASE WHEN replaced.prospect_request_id IS NULL THEN 'screening_lead' ELSE 'prospect_request' END,
           coalesce(replaced.prospect_request_id, replaced.id), 'screening', $5
      FROM replaced
    RETURNING 1
  )
  SELECT replaced.prospect_request_id INTO carried FROM replaced
   WHERE replaced.prospect_request_id IS NOT NULL AND replaced.same_practice
   ORDER BY replaced.screened_at DESC, replaced.id DESC LIMIT 1;
  IF prospect.followup_consent_sha256 IS NOT NULL OR carried IS NOT NULL THEN
    PERFORM screening_freeze_lead(target.id, carried, $3, true, $5);
  END IF;
  RETURN QUERY SELECT prospect.contact_email, target.row_count,
                      CASE WHEN carried IS NOT NULL THEN 'earlier_request' WHEN prospect.followup_consent_sha256 IS NOT NULL THEN 'consent' ELSE 'none' END,
                      target.received_at, target.wait_reason;
END;
$$;

-- The pinned release's records of the types no row's key selects, as migration 20261105090000 left it, read through
-- rule_record_by_type (release_no, record_type) instead of a scan of every release's records (#31; measured on the
-- scale release: a parallel sequential scan of rule_record, 705 ms warm and about 13 s cold on gp3, against 1.3 ms by
-- the index): the release's record types one at a time by a loose index scan, the six keyed types left out (pfs_rvu,
-- ncci_mue, mppr_rate, ncci_ptp, locality_map and locality_map_plus_four: KEYED_RECORD_TYPES in
-- apps/worker/src/price/keyed-release.ts, which a db test holds equal), then each other type's records by the index,
-- one statement a type, so no plan joins the types to a scan of the release. Every type but the keyed, without naming
-- the shared ones, in the order it always gave (type, effective date, id). Nothing for a run not being priced, or whose
-- release is not there as pinned. PL/pgSQL now, its result unchanged, so its grants stay.
CREATE OR REPLACE FUNCTION operator_screening_release(run uuid)
RETURNS TABLE (record_type text, key jsonb, value jsonb, effective_from text, effective_to text, sha256 text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  pinned integer;
  shared text;
BEGIN
  SELECT r.release_no INTO pinned FROM screening_run r
    JOIN rule_release rl ON rl.release_no = r.release_no AND rl.manifest_sha256 = r.release_manifest_sha256 AND rl.published_at IS NOT NULL
   WHERE r.id = $1 AND r.status = 'pricing'
     AND NOT EXISTS (SELECT 1 FROM rule_release_withdrawal w WHERE w.release_no = r.release_no);
  IF NOT FOUND THEN
    RETURN;
  END IF;
  FOR shared IN
    WITH RECURSIVE types (found) AS (
      SELECT (SELECT t.record_type FROM rule_record t WHERE t.release_no = pinned ORDER BY t.record_type LIMIT 1)
      UNION ALL
      SELECT (SELECT t.record_type FROM rule_record t WHERE t.release_no = pinned AND t.record_type > types.found ORDER BY t.record_type LIMIT 1)
        FROM types WHERE types.found IS NOT NULL
    )
    SELECT types.found FROM types
     WHERE types.found IS NOT NULL AND types.found NOT IN ('pfs_rvu', 'ncci_mue', 'mppr_rate', 'ncci_ptp', 'locality_map', 'locality_map_plus_four')
     ORDER BY types.found
  LOOP
    RETURN QUERY
      SELECT rr.record_type, rr.key, rr.value, rr.effective_from::text, rr.effective_to::text, rr.sha256
        FROM rule_record rr
       WHERE rr.release_no = pinned AND rr.record_type = shared
       ORDER BY rr.effective_from, rr.id;
  END LOOP;
END;
$$;

-- Records what pricing found for up to 5,000 pending rows, exactly as migration 20261104090000 did, but the run is
-- updated rather than only locked: its progress moves to now (never back), so a consumer that dies is noticed 2 minutes
-- after its last batch and a slow one is not. The same refusal when the run is not being priced by this attempt
-- (screening_run_attempt).
CREATE OR REPLACE FUNCTION operator_screening_record(run uuid, row_nos integer[], dispositions text[], expected_line_cents bigint[], expected_line_unrounded numeric[],
  expected_cents bigint[], difference_cents bigint[], in_reduction_pools boolean[], reduced_line_cents bigint[], reduced_line_unrounded numeric[],
  reduced_cents bigint[], reduced_difference_cents bigint[], reduced_trace_sha256s text[], unpriced_reasons text[], unpriced_details text[],
  trace_sha256s text[], attempt integer) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  n integer := coalesce(cardinality($2), 0);
  recorded integer;
BEGIN
  IF n > 5000 OR coalesce(cardinality($3), 0) <> n OR coalesce(cardinality($4), 0) <> n OR coalesce(cardinality($5), 0) <> n OR coalesce(cardinality($6), 0) <> n
     OR coalesce(cardinality($7), 0) <> n OR coalesce(cardinality($8), 0) <> n OR coalesce(cardinality($9), 0) <> n OR coalesce(cardinality($10), 0) <> n
     OR coalesce(cardinality($11), 0) <> n OR coalesce(cardinality($12), 0) <> n OR coalesce(cardinality($13), 0) <> n OR coalesce(cardinality($14), 0) <> n
     OR coalesce(cardinality($15), 0) <> n OR coalesce(cardinality($16), 0) <> n THEN
    RAISE EXCEPTION 'at most 5,000 rows at a time, every field with a value for each' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE screening_run r SET progress_at = greatest(r.progress_at, now()) WHERE r.id = $1 AND r.status = 'pricing' AND r.attempts = $17;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'rows are recorded for a run being priced, by the attempt that claimed it' USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_run_attempt';
  END IF;
  UPDATE screening_result s
     SET disposition = f.disposition, expected_line_cents = f.line_cents, expected_line_unrounded = f.line_unrounded, expected_cents = f.total_cents,
         difference_cents = f.difference, in_reduction_pool = f.pooled, reduced_line_cents = f.reduced_line, reduced_line_unrounded = f.reduced_unrounded,
         reduced_cents = f.reduced_total, reduced_difference_cents = f.reduced_difference, reduced_trace_sha256 = f.reduced_trace,
         unpriced_reason = f.reason, unpriced_detail = f.detail, trace_sha256 = f.trace
    FROM unnest($2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
           AS f (row_no, disposition, line_cents, line_unrounded, total_cents, difference, pooled, reduced_line, reduced_unrounded, reduced_total,
                 reduced_difference, reduced_trace, reason, detail, trace)
   WHERE s.run_id = $1 AND s.row_no = f.row_no AND s.disposition = 'pending';
  GET DIAGNOSTICS recorded = ROW_COUNT;
  RETURN recorded;
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- 4. The consumer's gauge and the web's honest wait
-- ---------------------------------------------------------------------------------------------------

-- The queue, counts only, for the consumer's minute log line (OldestQueuedMs alarms above 2 minutes): the normal-tier
-- runs queued, and how long the oldest of them has waited since the web received it, in milliseconds (0 when none);
-- the waiting tier's queued runs; and the runs being priced. Unexpired runs only.
CREATE FUNCTION operator_screening_queue() RETURNS TABLE (queued integer, queued_waiting integer, pricing integer, oldest_queued_ms bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT (count(*) FILTER (WHERE r.status = 'queued' AND r.queue_priority = 0))::integer,
         (count(*) FILTER (WHERE r.status = 'queued' AND r.queue_priority < 0))::integer,
         (count(*) FILTER (WHERE r.status = 'pricing'))::integer,
         coalesce(floor(extract(epoch FROM now() - min(r.received_at) FILTER (WHERE r.status = 'queued' AND r.queue_priority = 0)) * 1000)::bigint, 0)
    FROM screening_run r
   WHERE r.status IN ('queued', 'pricing') AND now() < r.expires_at
$$;

-- What the web tells a prospect once their upload is stored (the "sent" page's four states, Q12): the run's priority
-- and why it waits, if it does; how many runs are being priced; and how many unexpired queued runs pg-boss takes before
-- it (a higher priority, or the same priority and created earlier). Counts and the run's own two values only; no row
-- for a run that is not there.
CREATE FUNCTION screening_wait(run uuid) RETURNS TABLE (queue_priority smallint, wait_reason text, pricing integer, queued_ahead integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT t.queue_priority, t.wait_reason,
         (SELECT count(*)::integer FROM screening_run p WHERE p.status = 'pricing' AND now() < p.expires_at),
         (SELECT count(*)::integer FROM screening_run q
           WHERE q.status = 'queued' AND now() < q.expires_at AND q.id <> t.id
             AND (q.queue_priority > t.queue_priority OR (q.queue_priority = t.queue_priority AND (q.created_at, q.id) < (t.created_at, t.id))))
    FROM screening_run t
   WHERE t.id = $1
$$;

-- ---------------------------------------------------------------------------------------------------
-- 5. Privileges, once, last
-- ---------------------------------------------------------------------------------------------------

-- Every function this migration creates, or drops and creates, is revoked from PUBLIC by name (there are no default
-- privileges); CREATE OR REPLACE keeps a function's ACL, so those are not repeated. The two the queue's tier reads are
-- granted to no role: submit_screening() calls them as the owner.
REVOKE ALL ON FUNCTION screening_wait_limits(), screening_queue_tier(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION submit_screening(text, text, text, text, text, text[], text[], integer[], text[], text[], text[], bigint[], integer[], integer, integer, bigint,
  integer, bigint, bigint, text, text, text, text, text, text, text, text, timestamptz, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION operator_screening_due(integer, integer), operator_screening_complete(uuid, text, text, text, text, integer), operator_screening_queue(),
  screening_wait(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION submit_screening(text, text, text, text, text, text[], text[], integer[], text[], text[], text[], bigint[], integer[], integer, integer,
  bigint, integer, bigint, bigint, text, text, text, text, text, text, text, text, timestamptz, text, text) TO tp_app;
GRANT EXECUTE ON FUNCTION screening_wait(uuid) TO tp_app;
-- The one-release overlap: the previous image's platform task still claims, records and completes. The first schema
-- pull request after this one is deployed revokes the nine from tp_operator.
GRANT EXECUTE ON FUNCTION operator_screening_due(integer, integer), operator_screening_complete(uuid, text, text, text, text, integer) TO tp_operator;
-- The consumer: the nine that price a screening, and its gauge; nothing else (not operator_screening_expire(), which stays
-- the platform's, nor the reminders, which PR 6e decides).
GRANT EXECUTE ON FUNCTION operator_screening_due(integer, integer), operator_screening_claim(uuid), operator_screening_release(uuid),
  operator_screening_run_keys(uuid), operator_screening_run_records(uuid), operator_screening_rows(uuid, integer, integer, integer),
  operator_screening_record(uuid, integer[], text[], bigint[], numeric[], bigint[], bigint[], boolean[], bigint[], numeric[], bigint[], bigint[], text[], text[],
    text[], text[], integer),
  operator_screening_complete(uuid, text, text, text, text, integer), operator_screening_fail(uuid, text, text, integer), operator_screening_queue() TO tp_screening;

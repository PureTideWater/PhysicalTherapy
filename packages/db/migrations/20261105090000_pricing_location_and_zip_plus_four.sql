-- The practice's pricing location, its pricing settings taken at onboarding, and the ZIP+4 in the free screening (PR
-- 6b-2 of Change Order 001's PR 6b: audit #33, #16's minimal record, #7's screening part and #31's ZIP+4 key; the
-- founder's answers of 2026-10-21 to PR 6b's questions Q2 (a), Q3 (a), Q5 (a), Q6 (a) and Q11 (a)). Decisions:
-- docs/adr/0064, 0062, 0039, 0040, 0017 and 0013.
--
-- - rule_record: its record-type CHECK takes locality_map_plus_four, the ZIP+4 file's localities of a ZIP that spans
--   more than one (Q3 (a), a granted exception to reconciliation-001's rule-table check, named in
--   tools/engine-freeze/exception.json). The one statement here that touches a rule table; no row of one is written.
-- - practice_site: the practice's one pricing location (Q2 (a)): its billing ZIP and, where Medicare's locality list
--   needs it, its ZIP+4; undated, one per practice (the multi-site pull request adds windows and drops the unique
--   index). No PHI (a business address's ZIP), but it has a NOT NULL practice_id, so it is registered and forced as
--   every such table is. The application role reads it in a practice's scope and writes it only through
--   practice_set_location() and practice_confirm_location() (a person outside the platform's staff who holds
--   pricing_settings.set in the practice, while it is active) and the console's console_set_practice_location() and
--   console_set_practice_settings() (a platform administrator, who reads it whole, its ZIP+4 too, through
--   console_practice_settings()). A person's save or confirmation is recorded on the location (confirmed_by,
--   confirmed_at), which every role that opens the practice reads, and the console's change of the ZIP or ZIP+4
--   clears it (the review of 2026-10-22, findings 1, 2, 8, 9 and 14). A practice is created with its location in the
--   same transaction (the deferred constraint trigger practice_has_site), whoever inserts it; a location is never
--   deleted, and changes only its ZIP, ZIP+4, who set them and who confirmed them; its updated_at and updated_by move
--   only when the ZIP or ZIP+4 changes (finding 11). Backfilled from practice.zip; a practice with no ZIP before this
--   migration (dev and staging only) gets no row and its months wait.
-- - practice.zip: deprecated, never read or written from here on (the multi-site pull request drops it); the
--   application role may no longer insert or update it.
-- - role_permission: pricing_settings.set for the practice administrator, the billing manager and the firm principal,
--   denied to the reimbursement reviewer (Q5 (a), a granted exception before PR 14; a security review follows).
-- - The location's status in a release: locality_status() and practice_location_status(), the closed list ready,
--   no_release, zip_missing, zip_unknown, locality_not_loaded, zip_plus_four_needed, zip_plus_four_unknown
--   (LOCATION_STATUSES in packages/contracts/src/location.ts, with the words a customer reads).
-- - The place-of-service split: screening_place_of_service_split becomes place_of_service_split, the default of every
--   place a practice has not set, pinned on each pricing run (pricing_run.place_of_service_split_id, set by
--   pricing_run_rules() to the split in force) and read by the price job through pricing_run_split(), which gives the
--   approval's time too, for the re-run's diff to name (finding 16). The audit action
--   screening_split_approved and object type screening_place_of_service_split keep their names, so the approval
--   history reads under one name. pricing_run_rules() also refuses a run of a practice with no location
--   (pricing_run_location_missing); a month whose ZIP is missing waits with no run.
-- - The screening (Q6 (a), Q11 (a)): a ZIP whose locality_map record needs its ZIP+4 is no longer refused but asked for
--   its ZIP+4 (or told the ZIP+4 list is not loaded, when the release in force has none of the ZIP: finding 22), kept
--   on screening_prospect only then and deleted with the prospect at 30 days (the header of
--   20261104090000_free_screening.sql, which says no ZIP+4 is taken, describes that migration and is not edited); the
--   keyed release read holds the ZIP's locality_map_plus_four record; a Medicare row in a quarter outside the
--   release's loaded MPPR and MUE content (rule_release_content_span(), audit #7) is left out by the browser and
--   counted on the upload, three numbers beside the floor's, and refused here when sent anyway
--   (screening_band_outside_content); the result's summary returns the three counts and the ZIP+4 (finding 21); the
--   labels move to screening-labels/2026-11-05.
--
-- Every function this migration creates (not one it replaces) is followed by REVOKE ALL ... FROM PUBLIC and exactly its
-- grant; CREATE OR REPLACE keeps a function's ACL. No ledger table, no pricing_run or priced_line row, and no rule
-- release or record row is touched.
--
-- Runs as tp_owner. Safe with the previous image running, except during the deploy window:
-- 1. practice creation in the console (the old image writes practice.zip, now revoked, and inserts no location);
-- 2. the split's console approval (functions renamed);
-- 3. the screening's submission (signature changed; closed in production until release 1);
-- 4. a run created by one image and priced by the other fails engine_version_mismatch
--    (apps/worker/src/price/execute.ts:170-172). A person creates a new run; a monitored month is planned again, since
--    a failed run covers nothing (apps/worker/src/monitor/plan.ts:89);
-- 5. the old image's strict trace schema (packages/pricing/src/trace.ts) refuses a trace carrying zip_plus_four or
--    plus_four. Only a practice that saves a ZIP+4 during the window produces one;
-- 6. the old image's price jobs read practice.zip, which keeps its backfilled value, so a location saved through the
--    new image is not seen by them;
-- 7. a run the old image's web or monitor inserts is pinned by pricing_run_rules() to the split in force, but the old
--    image's price job prices it from practice.settings alone (it reads no split): the run completes, immutable,
--    naming a split its traces did not use, and a place the practice has not set stops as ENGINE_ERROR
--    place_of_service_unmapped. Only where a split is approved before the new worker runs: approve no split until it
--    is running, or re-run each run pinned in the window (the review of 2026-10-22, finding 7; ADR 0064).
-- Everything else the previous image does still works: its console settings save (console_set_practice_settings(),
-- same signature) sets the location (a person's, of an active practice), its console page reads
-- console_practice_settings() by its columns' names, which ignores the new zip_plus_four, its practice reads see the
-- backfilled practice.zip, its run inserts are pinned by the trigger (see 7), and its result page reads
-- screening_result_summary() with SELECT *, which ignores the four new columns. Rollout: migrate, then the new worker,
-- then the new web.

-- ---------------------------------------------------------------------------------------------------
-- 1. rule_record's record types (Q3 (a))
-- ---------------------------------------------------------------------------------------------------

ALTER TABLE rule_record
  DROP CONSTRAINT rule_record_record_type_check,
  ADD CONSTRAINT rule_record_record_type_check CHECK (record_type IN ('pfs_rvu', 'pfs_gpci', 'conversion_factor', 'mppr_rate', 'therapy_threshold', 'assistant_modifier', 'sequestration', 'ncci_ptp', 'ncci_mue', 'carc', 'rarc', 'claim_status_code', 'state_prompt_pay', 'dispute_window', 'locality_map', 'locality_map_plus_four', 'denial_category'));

-- ---------------------------------------------------------------------------------------------------
-- 2. practice_site: the practice's pricing location (Q2 (a); audit #16's minimal record, #33)
-- ---------------------------------------------------------------------------------------------------

CREATE TABLE practice_site (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practice (id),
  -- The billing ZIP, five digits.
  zip text NOT NULL CONSTRAINT practice_site_zip CHECK (zip ~ '^[0-9]{5}$'),
  -- The ZIP+4's four digits, for a ZIP whose locality_map record needs them; null otherwise.
  zip_plus_four text CONSTRAINT practice_site_zip_plus_four CHECK (zip_plus_four ~ '^[0-9]{4}$'),
  -- The person who last set its ZIP or ZIP+4; null when backfilled from practice.zip.
  updated_by uuid REFERENCES "user" (id),
  -- The person of the practice who last saved or confirmed it as it stands (practice_set_location(),
  -- practice_confirm_location()), and when; both null until then, and again once the console changes its ZIP or ZIP+4.
  -- The practice's confirmation while confirmed_at is at or after updated_at.
  confirmed_by uuid REFERENCES "user" (id),
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT practice_site_confirmed CHECK ((confirmed_by IS NULL) = (confirmed_at IS NULL))
);
-- PR 6b: one location per practice. The multi-site pull request drops this index (two sites may be open at once) and
-- adds their windows.
CREATE UNIQUE INDEX practice_site_one_per_practice ON practice_site (practice_id);

ALTER TABLE practice_site ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice_site FORCE ROW LEVEL SECURITY;
CREATE POLICY practice_site_tenant ON practice_site
  USING (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]))
  WITH CHECK (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]));
-- The definer functions below (the setters, the deferred check) read and write it as the owner.
CREATE POLICY practice_site_owner ON practice_site FOR ALL TO tp_owner USING (true) WITH CHECK (true);

INSERT INTO phi_table_registry (table_name, registered_by, policy_name) VALUES
  ('practice_site', '20261105090000_pricing_location_and_zip_plus_four', 'practice_site_tenant');

-- A location is never deleted (a deleted practice keeps it, as it kept practice.zip: the row holds no PHI), and it
-- changes only its ZIP, its ZIP+4, who set them and who confirmed them. A change of the ZIP or ZIP+4 stamps updated_at;
-- any other write, a save of the same location or a confirmation among them, keeps updated_at and updated_by, whoever
-- writes it, so no run reads as priced before a change that did not happen and no confirmation is undone by one (the
-- review of 2026-10-22, finding 11).
CREATE FUNCTION practice_site_rules() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'a practice''s pricing location is never deleted; it is set again' USING ERRCODE = 'check_violation', CONSTRAINT = 'practice_site_kept';
  END IF;
  IF (NEW.id, NEW.practice_id, NEW.created_at) IS DISTINCT FROM (OLD.id, OLD.practice_id, OLD.created_at) THEN
    RAISE EXCEPTION 'a practice''s pricing location changes only its ZIP, its ZIP+4, who set them and who confirmed them' USING ERRCODE = 'check_violation', CONSTRAINT = 'practice_site_fixed';
  END IF;
  IF (NEW.zip, NEW.zip_plus_four) IS DISTINCT FROM (OLD.zip, OLD.zip_plus_four) THEN
    NEW.updated_at := now();
  ELSE
    NEW.updated_at := OLD.updated_at;
    NEW.updated_by := OLD.updated_by;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER practice_site_rules BEFORE UPDATE OR DELETE ON practice_site FOR EACH ROW EXECUTE FUNCTION practice_site_rules();
CREATE TRIGGER practice_site_no_truncate BEFORE TRUNCATE ON practice_site FOR EACH STATEMENT EXECUTE FUNCTION reject_change();

-- A practice is created with its location (audit #33: no practice prices from an empty ZIP), checked at commit so the
-- practice and then its location are inserted in one transaction (the console's creation calls
-- console_set_practice_location() after its insert). It binds every insert, the owner's included; a definer, so it
-- sees the location whoever inserted the practice.
CREATE FUNCTION practice_site_required() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM practice_site s WHERE s.practice_id = NEW.id) THEN
    RAISE EXCEPTION 'a practice is created with its pricing location (its billing ZIP) in the same transaction'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'practice_has_site';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER practice_has_site AFTER INSERT ON practice DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION practice_site_required();

-- Every practice that has a billing ZIP keeps it as its location.
INSERT INTO practice_site (practice_id, zip) SELECT p.id, p.zip FROM practice p WHERE p.zip IS NOT NULL;

REVOKE ALL ON practice_site FROM PUBLIC;
GRANT SELECT ON practice_site TO tp_app;
REVOKE ALL ON FUNCTION practice_site_rules(), practice_site_required() FROM PUBLIC;

-- ---------------------------------------------------------------------------------------------------
-- 3. practice.zip, deprecated
-- ---------------------------------------------------------------------------------------------------

COMMENT ON COLUMN practice.zip IS 'Deprecated by practice_site (ADR 0064): never read or written; dropped by the multi-site PR';
REVOKE INSERT (zip), UPDATE (zip) ON practice FROM tp_app;

-- ---------------------------------------------------------------------------------------------------
-- 4. The permission matrix (Q5 (a)): packages/db/src/authz/permissions.ts's rows for pricing_settings.set
-- ---------------------------------------------------------------------------------------------------

INSERT INTO role_permission (role, action, effect) VALUES
  ('billing_manager', 'pricing_settings.set', 'allow'),
  ('firm_principal', 'pricing_settings.set', 'allow'),
  ('practice_admin', 'pricing_settings.set', 'allow'),
  ('reviewer', 'pricing_settings.set', 'deny');

-- ---------------------------------------------------------------------------------------------------
-- 5. The location's status in a release, and who sets it
-- ---------------------------------------------------------------------------------------------------

-- A ZIP and ZIP+4 in a release, over a period (null bounds: the whole release; a record overlaps when its window meets
-- [period_from, period_to]). The first that holds:
-- - zip_unknown: the release has no locality_map record of the ZIP in any window (not on Medicare's list: the
--   customer checks it);
-- - locality_not_loaded: the ZIP's records exist but none overlaps the period (a content gap: nothing to change);
-- - zip_plus_four_needed: an overlapping record needs the ZIP+4 and none is given;
-- - locality_not_loaded: it needs the ZIP+4, one is given, and no locality_map_plus_four record of the ZIP overlaps
--   the period (the ZIP+4 list is not loaded: nothing to change);
-- - zip_plus_four_unknown: overlapping plus-four records, none of whose ranges holds the ZIP+4 (four digits, compared
--   in "C"; anything else is held by none);
-- - ready, with the carrier and locality of the latest overlapping window, through the range holding the ZIP+4 when
--   the ZIP needs one (null for every other status).
-- The engine stays the judge of each line: a status serves the screens, the waiting months and the screening.
CREATE FUNCTION locality_status(release integer, zip5 text, plus_four text, period_from date, period_to date)
RETURNS TABLE (status text, carrier text, locality text)
LANGUAGE sql STABLE SET search_path = pg_catalog, public, pg_temp AS $$
  WITH period AS (
    SELECT daterange($4, $5, '[]') AS days
  ), five AS (
    SELECT r.effective_from, coalesce((r.value ->> 'plus_four_required')::boolean, false) AS flagged,
           r.value ->> 'carrier' AS carrier, r.value ->> 'locality' AS locality, daterange(r.effective_from, r.effective_to, '[]') && p.days AS meets
      FROM rule_record r CROSS JOIN period p
     WHERE r.release_no = $1 AND r.record_type = 'locality_map' AND r.key = jsonb_build_object('zip', $2)
  ), nine AS (
    SELECT r.effective_from, r.id, r.value
      FROM rule_record r CROSS JOIN period p
     WHERE r.release_no = $1 AND r.record_type = 'locality_map_plus_four' AND r.key = jsonb_build_object('zip', $2)
       AND daterange(r.effective_from, r.effective_to, '[]') && p.days
  ), held AS (
    SELECT n.effective_from, n.id, e ->> 'carrier' AS carrier, e ->> 'locality' AS locality
      FROM nine n CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(n.value -> 'ranges') = 'array' THEN n.value -> 'ranges' ELSE '[]'::jsonb END) e
     WHERE $3 ~ '^[0-9]{4}$' AND (e ->> 'from') COLLATE "C" <= $3 COLLATE "C" AND $3 COLLATE "C" <= (e ->> 'to') COLLATE "C"
  ), facts AS (
    SELECT EXISTS (SELECT 1 FROM five) AS known,
           EXISTS (SELECT 1 FROM five WHERE meets) AS in_period,
           EXISTS (SELECT 1 FROM five WHERE meets AND flagged) AS flagged,
           EXISTS (SELECT 1 FROM nine) AS nine_loaded,
           EXISTS (SELECT 1 FROM held) AS nine_holds
  ), judged AS (
    SELECT f.flagged, CASE WHEN NOT f.known THEN 'zip_unknown'
                           WHEN NOT f.in_period THEN 'locality_not_loaded'
                           WHEN f.flagged AND $3 IS NULL THEN 'zip_plus_four_needed'
                           WHEN f.flagged AND NOT f.nine_loaded THEN 'locality_not_loaded'
                           WHEN f.flagged AND NOT f.nine_holds THEN 'zip_plus_four_unknown'
                           ELSE 'ready' END AS status
      FROM facts f
  ), pick AS (
    -- The latest overlapping window's carrier and locality: the range holding the ZIP+4 when the ZIP needs one.
    SELECT x.carrier, x.locality
      FROM (SELECT h.effective_from, h.carrier, h.locality FROM held h WHERE (SELECT j.flagged FROM judged j)
            UNION ALL
            SELECT f.effective_from, f.carrier, f.locality FROM five f WHERE f.meets AND NOT (SELECT j.flagged FROM judged j)) x
     ORDER BY x.effective_from DESC
     LIMIT 1
  )
  SELECT j.status,
         CASE WHEN j.status = 'ready' THEN (SELECT k.carrier FROM pick k) END,
         CASE WHEN j.status = 'ready' THEN (SELECT k.locality FROM pick k) END
    FROM judged j
$$;

-- The practice's location in a release, under the caller's row-level security: no_release when no release is given,
-- zip_missing when the practice has no location (or the caller's scope does not hold it), otherwise
-- locality_status()'s.
CREATE FUNCTION practice_location_status(target uuid, release integer, period_from date, period_to date) RETURNS text
LANGUAGE sql STABLE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT CASE WHEN $2 IS NULL THEN 'no_release'
              WHEN s.practice_id IS NULL THEN 'zip_missing'
              ELSE (SELECT l.status FROM locality_status($2, s.zip, s.zip_plus_four, $3, $4) l) END
    FROM (SELECT 1) one LEFT JOIN practice_site s ON s.practice_id = $1
$$;

-- Sets the practice's location, for a person outside the platform's staff who holds pricing_settings.set in an active
-- practice of the caller's scope (audit #33; checked in the handler and here; a deleted practice's location is never
-- set, the review of 2026-10-22, finding 2). A ZIP is five digits and a ZIP+4 four (practice_site_zip and
-- practice_site_zip_plus_four name a refusal); one that needs its ZIP+4, or one the release does not map, is
-- accepted, and its status returned (under the release in force, over the whole release), never refused. The save is
-- the person's confirmation of the location as saved (confirmed_by, confirmed_at; findings 1 and 8); a save of the
-- same ZIP and ZIP+4 changes nothing else (practice_site_rules()). It keeps the caller's scope. The route records the
-- audit event and queues the monitor.
CREATE FUNCTION practice_set_location(target uuid, zip5 text, plus_four text) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF app_actor_id() IS NULL OR NOT app_actor_is_person() OR user_is_internal(app_actor_id())
     OR NOT coalesce(target = ANY (nullif(current_setting('app.practice_ids', true), '')::uuid[]), false)
     OR NOT coalesce(app_actor_permitted(target, 'pricing_settings.set'), false)
     OR NOT EXISTS (SELECT 1 FROM practice p WHERE p.id = target AND p.status = 'active') THEN
    RAISE EXCEPTION 'a practice''s pricing location is set by a person of the practice who holds pricing_settings.set in it, while it is active' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF zip5 IS NULL OR zip5 !~ '^[0-9]{5}$' THEN
    RAISE EXCEPTION 'a billing ZIP is five digits' USING ERRCODE = 'check_violation', CONSTRAINT = 'practice_site_zip';
  END IF;
  IF plus_four !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION 'a ZIP+4 is four digits' USING ERRCODE = 'check_violation', CONSTRAINT = 'practice_site_zip_plus_four';
  END IF;
  INSERT INTO practice_site (practice_id, zip, zip_plus_four, updated_by, confirmed_by, confirmed_at) VALUES (target, zip5, plus_four, app_actor_id(), app_actor_id(), now())
    ON CONFLICT (practice_id) DO UPDATE SET zip = EXCLUDED.zip, zip_plus_four = EXCLUDED.zip_plus_four, updated_by = EXCLUDED.updated_by,
      confirmed_by = EXCLUDED.confirmed_by, confirmed_at = EXCLUDED.confirmed_at;
  RETURN practice_location_status(target, current_rule_release(), NULL, NULL);
END;
$$;

-- Confirms the practice's location as it stands (Getting started's "Confirm your billing ZIP"; the review of
-- 2026-10-22, findings 1, 8 and 9): practice_set_location()'s guard, and only a location that leaves nothing to
-- change under the release in force, over the whole release (ready, or locality_not_loaded: content PaidWhole loads);
-- any other status, a practice with no location among them, is refused (practice_site_settled). Records the person
-- and the time on the location, which every role that opens the practice reads; the location itself, its updated_at
-- and its updated_by stay. Returns the status. It keeps the caller's scope. The route records the audit event.
CREATE FUNCTION practice_confirm_location(target uuid) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  standing text;
BEGIN
  IF app_actor_id() IS NULL OR NOT app_actor_is_person() OR user_is_internal(app_actor_id())
     OR NOT coalesce(target = ANY (nullif(current_setting('app.practice_ids', true), '')::uuid[]), false)
     OR NOT coalesce(app_actor_permitted(target, 'pricing_settings.set'), false)
     OR NOT EXISTS (SELECT 1 FROM practice p WHERE p.id = target AND p.status = 'active') THEN
    RAISE EXCEPTION 'a practice''s pricing location is confirmed by a person of the practice who holds pricing_settings.set in it, while it is active' USING ERRCODE = 'insufficient_privilege';
  END IF;
  standing := practice_location_status(target, current_rule_release(), NULL, NULL);
  IF standing IS DISTINCT FROM 'ready' AND standing IS DISTINCT FROM 'locality_not_loaded' THEN
    RAISE EXCEPTION 'a practice''s pricing location is confirmed only while it leaves nothing to change' USING ERRCODE = 'check_violation', CONSTRAINT = 'practice_site_settled';
  END IF;
  UPDATE practice_site s SET confirmed_by = app_actor_id(), confirmed_at = now() WHERE s.practice_id = target;
  RETURN standing;
END;
$$;

-- The console's: a platform administrator (organization.manage) sets a practice's location at its creation (in the
-- creating transaction, before the deferred check) and from the console's practice page. The write runs in that one
-- practice's scope and the caller's scope is restored. A change of the ZIP or ZIP+4 clears the practice's
-- confirmation, so the location waits for a person of the practice to confirm it; the same location keeps it (the
-- review of 2026-10-22, findings 1 and 8). Null for a practice that does not exist or is deleted. The route records the
-- audit event and queues the monitor.
CREATE FUNCTION console_set_practice_location(target uuid, zip5 text, plus_four text) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  scope text := current_setting('app.practice_ids', true);
  result text;
BEGIN
  IF app_actor_id() IS NULL OR NOT app_actor_is_person() OR NOT coalesce(app_actor_platform_permitted('organization.manage'), false) THEN
    RAISE EXCEPTION 'only a platform administrator sets a practice''s pricing location from the console' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF zip5 IS NULL OR zip5 !~ '^[0-9]{5}$' THEN
    RAISE EXCEPTION 'a billing ZIP is five digits' USING ERRCODE = 'check_violation', CONSTRAINT = 'practice_site_zip';
  END IF;
  IF plus_four !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION 'a ZIP+4 is four digits' USING ERRCODE = 'check_violation', CONSTRAINT = 'practice_site_zip_plus_four';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM practice p WHERE p.id = target AND p.status = 'active') THEN
    RETURN NULL;
  END IF;
  PERFORM set_config('app.practice_ids', ARRAY[target]::text, true);
  INSERT INTO practice_site AS s (practice_id, zip, zip_plus_four, updated_by) VALUES (target, zip5, plus_four, app_actor_id())
    ON CONFLICT (practice_id) DO UPDATE SET zip = EXCLUDED.zip, zip_plus_four = EXCLUDED.zip_plus_four, updated_by = EXCLUDED.updated_by,
      confirmed_by = CASE WHEN (s.zip, s.zip_plus_four) IS NOT DISTINCT FROM (EXCLUDED.zip, EXCLUDED.zip_plus_four) THEN s.confirmed_by END,
      confirmed_at = CASE WHEN (s.zip, s.zip_plus_four) IS NOT DISTINCT FROM (EXCLUDED.zip, EXCLUDED.zip_plus_four) THEN s.confirmed_at END;
  result := practice_location_status(target, current_rule_release(), NULL, NULL);
  PERFORM set_config('app.practice_ids', coalesce(scope, '{}'), true);
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION locality_status(integer, text, text, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION locality_status(integer, text, text, date, date) TO tp_app;
REVOKE ALL ON FUNCTION practice_location_status(uuid, integer, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION practice_location_status(uuid, integer, date, date) TO tp_app;
REVOKE ALL ON FUNCTION practice_set_location(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION practice_set_location(uuid, text, text) TO tp_app;
REVOKE ALL ON FUNCTION practice_confirm_location(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION practice_confirm_location(uuid) TO tp_app;
REVOKE ALL ON FUNCTION console_set_practice_location(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION console_set_practice_location(uuid, text, text) TO tp_app;

DROP FUNCTION console_practice_settings(uuid);

-- As before (20261022090000), the ZIP now the location's and its ZIP+4 beside it (both null when it has none), so the
-- console shows the stored location and its status, and a save never replaces a ZIP+4 it did not show (the review of
-- 2026-10-22, finding 14). Recreated for its new column; the previous image reads its columns by name.
CREATE FUNCTION console_practice_settings(target uuid) RETURNS TABLE (practice_id uuid, organization_id uuid, name text, zip text, zip_plus_four text, settings jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT p.id, p.organization_id, p.name, s.zip, s.zip_plus_four, p.settings
    FROM practice p LEFT JOIN practice_site s ON s.practice_id = p.id
   WHERE p.id = target AND app_actor_platform_permitted('organization.manage')
$$;

REVOKE ALL ON FUNCTION console_practice_settings(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION console_practice_settings(uuid) TO tp_app;

-- As before (20261022090000), but a ZIP sets the location, never practice.zip: a non-null new_zip that differs from
-- the location's ZIP sets it and clears its ZIP+4 and the practice's confirmation; the same ZIP or a null one leaves
-- the location as it is. The new image passes null and sets the location through console_set_practice_location(); the
-- previous image's save, which passes the form's ZIP, keeps working during the deploy, for a person and an active
-- practice alone, as console_set_practice_location() (the review of 2026-10-22, finding 2). That branch goes once the
-- previous image is gone (a follow-up), leaving console_set_practice_location() the console's one location writer.
CREATE OR REPLACE FUNCTION console_set_practice_settings(target uuid, new_zip text, new_settings jsonb) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  scope text := current_setting('app.practice_ids', true);
  changed boolean;
BEGIN
  IF app_actor_id() IS NULL OR NOT app_actor_platform_permitted('organization.manage') THEN
    RAISE EXCEPTION 'only a platform administrator sets a practice''s settings from the console' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF new_zip IS NOT NULL AND new_zip !~ '^[0-9]{5}$' THEN
    RAISE EXCEPTION 'a billing ZIP is five digits' USING ERRCODE = 'check_violation', CONSTRAINT = 'practice_site_zip';
  END IF;
  IF new_settings IS NULL OR jsonb_typeof(new_settings) <> 'object' OR EXISTS (SELECT 1 FROM jsonb_object_keys(new_settings) k WHERE NOT k = ANY (practice_setting_keys())) THEN
    RAISE EXCEPTION 'the console sets the pricing and triage settings only' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM set_config('app.practice_ids', ARRAY[target]::text, true);
  UPDATE practice p SET settings = (p.settings - practice_setting_keys()) || new_settings WHERE p.id = target;
  changed := FOUND;
  IF changed AND new_zip IS NOT NULL THEN
    IF NOT app_actor_is_person() THEN
      RAISE EXCEPTION 'a practice''s pricing location is set from the console by a person' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF EXISTS (SELECT 1 FROM practice p WHERE p.id = target AND p.status = 'active') THEN
      INSERT INTO practice_site AS s (practice_id, zip, updated_by) VALUES (target, new_zip, app_actor_id())
        ON CONFLICT (practice_id) DO UPDATE SET zip = EXCLUDED.zip, zip_plus_four = NULL, updated_by = EXCLUDED.updated_by, confirmed_by = NULL, confirmed_at = NULL
        WHERE s.zip IS DISTINCT FROM EXCLUDED.zip;
    END IF;
  END IF;
  PERFORM set_config('app.practice_ids', coalesce(scope, '{}'), true);
  RETURN changed;
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- 6. The place-of-service split, every practice's default (renamed from the screening's)
-- ---------------------------------------------------------------------------------------------------

ALTER TABLE screening_place_of_service_split RENAME TO place_of_service_split;
ALTER TABLE place_of_service_split RENAME CONSTRAINT screening_place_of_service_split_settings TO place_of_service_split_settings;
ALTER TABLE place_of_service_split RENAME CONSTRAINT screening_place_of_service_split_approved_by_fkey TO place_of_service_split_approved_by_fkey;
ALTER INDEX screening_place_of_service_split_pkey RENAME TO place_of_service_split_pkey;
ALTER INDEX screening_place_of_service_split_in_force RENAME TO place_of_service_split_in_force;
ALTER TRIGGER screening_place_of_service_split_append_only ON place_of_service_split RENAME TO place_of_service_split_append_only;
ALTER TRIGGER screening_place_of_service_split_no_truncate ON place_of_service_split RENAME TO place_of_service_split_no_truncate;
ALTER POLICY screening_place_of_service_split_owner ON place_of_service_split RENAME TO place_of_service_split_owner;
-- Its ACL (revoked from PUBLIC, no grant) goes with it.
ALTER FUNCTION screening_split_valid(jsonb) RENAME TO place_of_service_split_valid;

-- The split in force: the latest approval, its id breaking a tie. A definer, so the run guard (pricing_run_rules(),
-- which runs as the caller) pins it for a person's run and a job's alike.
CREATE FUNCTION place_of_service_split_in_force() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT s.id FROM place_of_service_split s ORDER BY s.approved_at DESC, s.id DESC LIMIT 1
$$;

-- The console (tp_app): the contract specialist reads and approves the split (rate_record.approve), as before
-- (20261104090000) under the new names.
CREATE FUNCTION console_place_of_service_splits()
RETURNS TABLE (id uuid, settings jsonb, approved_by uuid, approved_by_email text, approved_at timestamptz, in_force boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NOT coalesce(app_actor_platform_permitted('rate_record.approve'), false) THEN
    RAISE EXCEPTION 'the place-of-service split is read and approved by a contract specialist' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
    SELECT s.id, s.settings, s.approved_by, u.email, s.approved_at, row_number() OVER (ORDER BY s.approved_at DESC, s.id DESC) = 1
      FROM place_of_service_split s LEFT JOIN "user" u ON u.id = s.approved_by
     ORDER BY s.approved_at DESC, s.id DESC
     LIMIT 50;
END;
$$;

CREATE FUNCTION console_approve_place_of_service_split(settings jsonb) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  created uuid;
BEGIN
  IF app_actor_id() IS NULL OR NOT app_actor_is_person() OR NOT coalesce(app_actor_platform_permitted('rate_record.approve'), false) THEN
    RAISE EXCEPTION 'the place-of-service split is approved by a contract specialist' USING ERRCODE = 'insufficient_privilege';
  END IF;
  INSERT INTO place_of_service_split (settings, approved_by) VALUES ($1, app_actor_id()) RETURNING place_of_service_split.id INTO created;
  RETURN created;
END;
$$;

-- As before (20261104090000): open while a release is in force and a split is approved.
CREATE OR REPLACE FUNCTION screening_status() RETURNS TABLE (release_no integer, place_of_service_split_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT CASE WHEN o.split IS NULL THEN NULL ELSE o.release END, CASE WHEN o.release IS NULL THEN NULL ELSE o.split END
    FROM (SELECT current_rule_release() AS release, place_of_service_split_in_force() AS split) o
$$;

REVOKE ALL ON FUNCTION place_of_service_split_in_force() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION place_of_service_split_in_force() TO tp_app;
REVOKE ALL ON FUNCTION console_place_of_service_splits() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION console_place_of_service_splits() TO tp_app;
REVOKE ALL ON FUNCTION console_approve_place_of_service_split(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION console_approve_place_of_service_split(jsonb) TO tp_app;

DROP FUNCTION console_screening_splits();
DROP FUNCTION console_approve_screening_split(jsonb);

-- ---------------------------------------------------------------------------------------------------
-- 7. pricing_run: the split pinned, and no run without a location
-- ---------------------------------------------------------------------------------------------------

-- The split in force when the run was created (null for a run created before any split was approved, and for every
-- run before this migration). Set by pricing_run_rules(), never by a caller: the application role has no grant on it.
ALTER TABLE pricing_run ADD COLUMN place_of_service_split_id uuid REFERENCES place_of_service_split (id);

-- The split a pricing run pinned, for the price job (runSettings), and when it was approved, for the re-run's diff to
-- name (the review of 2026-10-22, finding 16): one row only for a run of a practice in the caller's scope that pinned
-- one; none for a run that pinned none (no split was approved when it was created) or a run outside the scope.
CREATE FUNCTION pricing_run_split(run uuid) RETURNS TABLE (place_of_service_split_id uuid, settings jsonb, approved_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT s.id, s.settings, s.approved_at
    FROM pricing_run r JOIN place_of_service_split s ON s.id = r.place_of_service_split_id
   WHERE r.id = $1 AND r.practice_id = ANY (nullif(current_setting('app.practice_ids', true), '')::uuid[])
$$;

REVOKE ALL ON FUNCTION pricing_run_split(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pricing_run_split(uuid) TO tp_app;

-- As before (20261020090000), with two rules more on INSERT, both under the caller's own privileges and policies: a
-- run of a practice with no location is refused (pricing_run_location_missing; audit #33: the month waits with no
-- run, re-runs included), and the run pins the split in force (a caller's other value is refused,
-- pricing_run_split_pinned); and the split joins what never changes.
CREATE OR REPLACE FUNCTION pricing_run_rules() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  lines bigint;
  original record;
  split uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'a pricing run is never deleted' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'queued' OR NEW.coverage IS NOT NULL OR NEW.completed_at IS NOT NULL OR NEW.failure_code IS NOT NULL
       OR NEW.accepted_by IS NOT NULL OR NEW.accepted_at IS NOT NULL THEN
      RAISE EXCEPTION 'a pricing run starts queued' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.release_no IS DISTINCT FROM current_rule_release() THEN
      RAISE EXCEPTION 'rule-release mismatch: a pricing run pins the newest published rule release' USING ERRCODE = 'check_violation';
    END IF;
    -- Under the caller's policies, for a practice of the caller's scope (the application role reads practice_site): a
    -- run of a practice outside it is refused by pricing_run_tenant after this trigger, and is not told whether that
    -- practice has a location.
    IF coalesce(NEW.practice_id = ANY (nullif(current_setting('app.practice_ids', true), '')::uuid[]), false)
       AND NOT EXISTS (SELECT 1 FROM practice_site s WHERE s.practice_id = NEW.practice_id) THEN
      RAISE EXCEPTION 'a pricing run prices a practice that has its pricing location (its billing ZIP)'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'pricing_run_location_missing';
    END IF;
    IF NEW.rerun_of_id IS NOT NULL THEN
      -- Under the caller's policies: a run of another practice is not found.
      SELECT r.practice_id, r.status, r.period_from, r.period_to, coalesce(r.lines_loaded_by, r.created_at) AS cut_off
        INTO original FROM pricing_run r WHERE r.id = NEW.rerun_of_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'a re-run prices a complete run of its own practice again' USING ERRCODE = 'check_violation';
      END IF;
      IF original.practice_id <> NEW.practice_id OR original.status <> 'complete' THEN
        RAISE EXCEPTION 'a re-run prices a complete run of its own practice again' USING ERRCODE = 'check_violation';
      END IF;
      IF (original.period_from, original.period_to, original.cut_off) IS DISTINCT FROM (NEW.period_from, NEW.period_to, NEW.lines_loaded_by) THEN
        RAISE EXCEPTION 'a re-run prices the period and the lines of the run it prices again' USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    split := place_of_service_split_in_force();
    IF NEW.place_of_service_split_id IS NULL THEN
      NEW.place_of_service_split_id := split;
    ELSIF NEW.place_of_service_split_id IS DISTINCT FROM split THEN
      RAISE EXCEPTION 'a pricing run pins the place-of-service split in force' USING ERRCODE = 'check_violation', CONSTRAINT = 'pricing_run_split_pinned';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.practice_id, NEW.period_from, NEW.period_to, NEW.release_no, NEW.engine_version, NEW.created_by, NEW.created_by_job_id, NEW.created_at, NEW.rerun_of_id, NEW.lines_loaded_by,
      NEW.place_of_service_split_id)
     IS DISTINCT FROM (OLD.id, OLD.practice_id, OLD.period_from, OLD.period_to, OLD.release_no, OLD.engine_version, OLD.created_by, OLD.created_by_job_id, OLD.created_at, OLD.rerun_of_id, OLD.lines_loaded_by,
      OLD.place_of_service_split_id) THEN
    RAISE EXCEPTION 'a pricing run''s practice, period, release, engine, creator, place-of-service split and the run it prices again never change' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status IN ('complete', 'failed') THEN
    -- The one step a complete run takes: a person accepts a re-run, once (J17).
    IF OLD.status = 'complete' AND OLD.rerun_of_id IS NOT NULL AND OLD.accepted_at IS NULL AND NEW.accepted_at IS NOT NULL
       AND (NEW.status, NEW.coverage, NEW.failure_code, NEW.completed_at) IS NOT DISTINCT FROM (OLD.status, OLD.coverage, OLD.failure_code, OLD.completed_at) THEN
      IF NEW.accepted_at IS DISTINCT FROM now() OR NEW.accepted_by IS DISTINCT FROM app_actor_id() THEN
        RAISE EXCEPTION 'a re-run is accepted by the person acting, when they accept it' USING ERRCODE = 'check_violation';
      END IF;
      IF EXISTS (SELECT 1 FROM rule_release_withdrawal w WHERE w.release_no = OLD.release_no) THEN
        RAISE EXCEPTION 'a re-run pinned to a withdrawn rule release is never accepted; re-run it under the release in force' USING ERRCODE = 'check_violation';
      END IF;
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'a pricing run never changes once it is complete or failed; a new release or mapping means a new run' USING ERRCODE = 'check_violation';
  END IF;
  IF (NEW.accepted_by, NEW.accepted_at) IS DISTINCT FROM (OLD.accepted_by, OLD.accepted_at) THEN
    RAISE EXCEPTION 'only a complete re-run is accepted' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status = 'running' AND OLD.status = 'queued' OR NEW.status = OLD.status THEN
    IF (NEW.coverage, NEW.completed_at, NEW.failure_code) IS DISTINCT FROM (OLD.coverage, OLD.completed_at, OLD.failure_code) THEN
      RAISE EXCEPTION 'an open pricing run records its coverage when it completes and its failure when it fails' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.status = 'complete' THEN
    IF NEW.completed_at IS DISTINCT FROM now() THEN
      RAISE EXCEPTION 'a pricing run''s completion records the time it completed' USING ERRCODE = 'check_violation';
    END IF;
    SELECT count(*) INTO lines FROM priced_line p WHERE p.pricing_run_id = NEW.id;
    IF (NEW.coverage ->> 'lines') IS DISTINCT FROM lines::text THEN
      RAISE EXCEPTION 'a complete pricing run''s coverage counts exactly the lines it priced' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.status = 'failed' THEN
    IF EXISTS (SELECT 1 FROM priced_line p WHERE p.pricing_run_id = NEW.id) THEN
      RAISE EXCEPTION 'a failed pricing run holds no priced lines' USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    RAISE EXCEPTION 'a pricing run moves queued, running, then complete or failed' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- 8. The screening: the ZIP+4, the keyed read, and quarters outside the loaded content (Q6 (a), Q11 (a))
-- ---------------------------------------------------------------------------------------------------

-- The ZIP+4, kept only when the ZIP's locality_map record in the release in force needs it, and deleted with the
-- prospect at 30 days (screening_prospect_fixed already refuses any update). screening_lead and prospect_request keep
-- the five-digit ZIP alone, and a practice is still matched by its five-digit ZIP and name.
ALTER TABLE screening_prospect
  ADD COLUMN zip_plus_four text CONSTRAINT screening_prospect_zip_plus_four CHECK (zip_plus_four ~ '^[0-9]{4}$');

-- The Medicare rows the browser left out because their quarter is outside the release's loaded content (Q6 (a)): how
-- many, their claim lines and their allowed total, as the browser counted them after the floor's, for the result to
-- say. Never which rows, and no hash over them; zero on a rejected upload. Kept with the upload for its 30 days, never
-- copied to screening_lead or screening_outcome, whose lists are ruled (ADR 0062, decisions 7 and 12).
-- screening_upload_fixed (reject_change() on every update) already covers them.
ALTER TABLE screening_upload
  ADD COLUMN outside_content_rows integer NOT NULL DEFAULT 0 CONSTRAINT screening_upload_outside_content_rows CHECK (outside_content_rows BETWEEN 0 AND 50000),
  ADD COLUMN outside_content_claim_lines bigint NOT NULL DEFAULT 0,
  ADD COLUMN outside_content_allowed_cents bigint NOT NULL DEFAULT 0,
  -- Each row left out sums 11 to 100,000 claim lines (the floor runs first; a row holds at most 100,000), at most
  -- $25,000.00 a claim line; a rejected upload leaves nothing out.
  ADD CONSTRAINT screening_upload_outside_content_claim_lines
    CHECK (outside_content_claim_lines BETWEEN 11::bigint * outside_content_rows AND 100000::bigint * outside_content_rows),
  ADD CONSTRAINT screening_upload_outside_content_allowed CHECK (outside_content_allowed_cents BETWEEN 0 AND 2500000::bigint * outside_content_claim_lines),
  ADD CONSTRAINT screening_upload_outside_content_accepted CHECK (status = 'accepted' OR outside_content_rows = 0),
  DROP CONSTRAINT screening_upload_accepted_rows,
  ADD CONSTRAINT screening_upload_accepted_rows
    CHECK (status <> 'accepted' OR (row_count BETWEEN 1 AND 50000 AND row_count + left_out_rows + outside_content_rows <= 50000));

-- An upload's rejection reasons, as before (20261104090000), and one code more: band_outside_content, a Medicare row
-- in a quarter outside the release's loaded content sent anyway (named by its row and the service_band field, never
-- its quarter).
CREATE OR REPLACE FUNCTION screening_rejection_valid(reason jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE WHEN jsonb_typeof(reason) IS DISTINCT FROM 'object' THEN false ELSE coalesce(
       jsonb_typeof(reason -> 'code') = 'string'
   AND (reason ->> 'code') IN ('phi_column', 'unknown_column', 'duplicate_column', 'missing_column', 'row_shape', 'invalid_value', 'band_holds_date',
                               'band_in_future', 'band_outside_content', 'duplicate_row', 'no_rows', 'too_many_rows', 'row_count_mismatch', 'too_few_claim_lines')
   AND NOT EXISTS (SELECT 1 FROM jsonb_object_keys(reason) k WHERE k NOT IN ('code', 'column', 'row', 'first_row', 'field', 'phi'))
   AND (NOT reason ? 'column' OR (jsonb_typeof(reason -> 'column') = 'number' AND (reason ->> 'column') ~ '^[1-9][0-9]?$' AND (reason ->> 'column')::integer <= 64))
   AND (NOT reason ? 'row' OR (jsonb_typeof(reason -> 'row') = 'number' AND (reason ->> 'row') ~ '^[1-9][0-9]{0,7}$' AND (reason ->> 'row')::integer <= 10000000))
   AND (NOT reason ? 'first_row' OR (jsonb_typeof(reason -> 'first_row') = 'number' AND (reason ->> 'first_row') ~ '^[1-9][0-9]{0,7}$' AND (reason ->> 'first_row')::integer <= 10000000))
   AND (NOT reason ? 'field' OR (jsonb_typeof(reason -> 'field') = 'string'
        AND (reason ->> 'field') IN ('procedure_code', 'modifiers', 'units', 'place_of_service', 'payer_product', 'service_band', 'allowed_total', 'claim_count')))
   AND (NOT reason ? 'phi' OR (jsonb_typeof(reason -> 'phi') = 'string'
        AND (reason ->> 'phi') IN ('name', 'date_of_birth', 'member_id', 'date_of_service', 'claim_number'))), false)
  END
$$;

-- A refused upload's codes as an outcome keeps them, as before (20261104090000), at most the 14 there are now.
CREATE OR REPLACE FUNCTION screening_refusal_codes_valid(codes text[]) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog, pg_temp AS $$
  SELECT coalesce(cardinality(codes) <= 14
     AND (cardinality(codes) = 0 OR (array_ndims(codes) = 1 AND array_lower(codes, 1) = 1))
     AND array_position(codes, NULL) IS NULL
     AND NOT EXISTS (SELECT 1 FROM unnest(codes) c
                      WHERE c NOT IN ('phi_column', 'unknown_column', 'duplicate_column', 'missing_column', 'row_shape', 'invalid_value', 'band_holds_date',
                                      'band_in_future', 'band_outside_content', 'duplicate_row', 'no_rows', 'too_many_rows', 'row_count_mismatch',
                                      'too_few_claim_lines'))
     AND codes = ARRAY(SELECT d.c FROM (SELECT DISTINCT c FROM unnest(codes) c) d ORDER BY d.c COLLATE "C"), false)
$$;

-- The result page's labels: SCREENING_LABELS_VERSION in apps/web/src/lib/screening/labels.ts, now with the ZIP+4's
-- two engine details and the quarters outside the loaded content.
CREATE OR REPLACE FUNCTION screening_labels_version() RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog, pg_temp AS $$
  SELECT 'screening-labels/2026-11-05'::text
$$;

DROP FUNCTION submit_screening(text, text, text, text, text[], text[], integer[], text[], text[], text[], bigint[], integer[], integer, integer, bigint, text, text,
  text, text, text, text, text, text, text);

-- An accepted upload, as before (20261104090000), with the ZIP+4 and the rows outside the loaded content. The refusals
-- before anything is written, in this order: screening_closed; the location in the release in force, over the whole
-- release (locality_status()): screening_zip_unknown, screening_zip_plus_four (the ZIP needs its ZIP+4: enter it),
-- screening_zip_plus_four_unknown (the ZIP+4 list holds no range with it) and screening_locality_not_loaded (the
-- release has not loaded the ZIP+4 list), the last before any ZIP+4 is asked for when the release holds no ZIP+4 list
-- of the ZIP, so a prospect is never sent to find digits the screening cannot use (the review of 2026-10-22, finding
-- 22; a practice's own status keeps locality_status()'s order, since a practice needs its ZIP+4 anyway);
-- screening_rows; and screening_band_outside_content, a Medicare row (original
-- or Medicare Advantage without a contract, the products the screening prices) whose quarter is not inside every span
-- of rule_release_content_span(), computed once. Nothing in an error names a value. The ZIP+4 is kept only when the
-- ZIP's locality_map record needs it; the three counts of the rows left out for their quarter are stored on the
-- upload. Everything else is as before: the hash, the locks, the outcome, the run pinned to the release and the split
-- in force, the rows, and the replacement of an earlier screening of the same practice.
CREATE FUNCTION submit_screening(practice text, state_code text, zip5 text, plus_four text, email text, codes text[], modifier_sets text[],
  unit_counts integer[], places text[], products text[], bands text[], allowed_cents bigint[], claim_counts integer[],
  rows_left_out integer, claim_lines_left_out integer, allowed_cents_left_out bigint, rows_outside_content integer,
  claim_lines_outside_content bigint, allowed_cents_outside_content bigint, heard_from text, campaign_source text,
  campaign_medium text, campaign_name text, click_kind text, firm text, consent_sha256 text, terms_sha256 text, request text) RETURNS uuid
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
    INSERT INTO screening_run (upload_id, release_no, release_manifest_sha256, place_of_service_split_id, row_count)
    SELECT upload.id, in_force, manifest, split, n FROM upload
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

REVOKE ALL ON FUNCTION submit_screening(text, text, text, text, text, text[], text[], integer[], text[], text[], text[], bigint[], integer[], integer, integer, bigint,
  integer, bigint, bigint, text, text, text, text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION submit_screening(text, text, text, text, text, text[], text[], integer[], text[], text[], text[], bigint[], integer[], integer, integer,
  bigint, integer, bigint, bigint, text, text, text, text, text, text, text, text, text) TO tp_app;

-- The ZIP's five-digit status is locality_status()'s now.
DROP FUNCTION screening_zip_status(text);
DROP FUNCTION screening_split_in_force();

DROP FUNCTION screening_result_summary(text);

-- The result's summary, as before (20261104090000), and four columns more: the Medicare rows the browser left out for
-- their quarter (outside the release's loaded content), their claim lines and their allowed total, for the result
-- page to say (the release's spans, rule_release_content_span(release_no), name the quarters loaded); and the
-- prospect's ZIP+4, kept only when the ZIP needs it, for the heading to name the location priced (the review of
-- 2026-10-22, finding 21; kept as before, so what the page says is kept does not change).
CREATE FUNCTION screening_result_summary(token_sha256 text)
RETURNS TABLE (
  run_id uuid, practice_name text, state text, zip text, release_no integer, engine_version text, created_at timestamptz, expires_at timestamptz,
  rows integer, claim_lines bigint, observed_cents bigint,
  priced_rows integer, priced_claim_lines bigint, expected_cents bigint, priced_observed_cents bigint, difference_cents bigint,
  pooled_rows integer, reduced_cents bigint, reduced_difference_cents bigint,
  contract_rows integer, contract_claim_lines bigint, contract_observed_cents bigint,
  not_screened_rows integer, not_screened_claim_lines bigint, not_screened_observed_cents bigint,
  unpriced_rows integer, unpriced_claim_lines bigint, unpriced_observed_cents bigint,
  left_out_rows integer, left_out_claim_lines bigint, left_out_observed_cents bigint,
  converted boolean, release_withdrawn boolean, kept_with text,
  outside_content_rows integer, outside_content_claim_lines bigint, outside_content_observed_cents bigint, zip_plus_four text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT r.id, p.practice_name, p.state, p.zip, r.release_no, r.engine_version, r.created_at, r.expires_at,
         t.all_rows, t.all_claims, t.all_observed,
         t.priced_rows, t.priced_claims, t.priced_expected, t.priced_observed, t.priced_difference,
         t.pooled_rows, t.priced_reduced, t.priced_reduced_difference,
         t.contract_rows, t.contract_claims, t.contract_observed,
         t.not_screened_rows, t.not_screened_claims, t.not_screened_observed,
         t.unpriced_rows, t.unpriced_claims, t.unpriced_observed,
         u.left_out_rows, u.left_out_claim_lines::bigint, u.left_out_allowed_cents,
         r.converted_at IS NOT NULL,
         EXISTS (SELECT 1 FROM rule_release_withdrawal w WHERE w.release_no = r.release_no),
         -- Whether this screening's summary is kept (screening_lead), and with what: the audit request made from it, an
         -- earlier screening's request it took over (decision 17), or consent; 'none' when it is not kept.
         coalesce((SELECT CASE WHEN l.prospect_request_id IS NULL THEN 'consent'
                               WHEN l.prospect_request_id = r.converted_prospect_request_id THEN 'own_request'
                               ELSE 'earlier_request' END
                     FROM screening_lead l WHERE l.upload_id = r.upload_id), 'none'),
         u.outside_content_rows, u.outside_content_claim_lines, u.outside_content_allowed_cents, p.zip_plus_four
    FROM screening_run r
    JOIN screening_upload u ON u.id = r.upload_id
    JOIN screening_prospect p ON p.id = u.prospect_id
    CROSS JOIN LATERAL (
      SELECT count(*)::integer AS all_rows,
             coalesce(sum(s.claim_count), 0)::bigint AS all_claims,
             coalesce(sum(s.observed_allowed_cents), 0)::bigint AS all_observed,
             count(*) FILTER (WHERE s.disposition = 'priced')::integer AS priced_rows,
             coalesce(sum(s.claim_count) FILTER (WHERE s.disposition = 'priced'), 0)::bigint AS priced_claims,
             coalesce(sum(s.expected_cents) FILTER (WHERE s.disposition = 'priced'), 0)::bigint AS priced_expected,
             coalesce(sum(s.observed_allowed_cents) FILTER (WHERE s.disposition = 'priced'), 0)::bigint AS priced_observed,
             coalesce(sum(s.difference_cents) FILTER (WHERE s.disposition = 'priced'), 0)::bigint AS priced_difference,
             count(*) FILTER (WHERE s.disposition = 'priced' AND s.in_reduction_pool)::integer AS pooled_rows,
             -- The lowest figures: the fully reduced one for a code in the reduction across codes, the one figure otherwise.
             coalesce(sum(coalesce(s.reduced_cents, s.expected_cents)) FILTER (WHERE s.disposition = 'priced'), 0)::bigint AS priced_reduced,
             coalesce(sum(coalesce(s.reduced_difference_cents, s.difference_cents)) FILTER (WHERE s.disposition = 'priced'), 0)::bigint AS priced_reduced_difference,
             count(*) FILTER (WHERE s.disposition = 'contract_required')::integer AS contract_rows,
             coalesce(sum(s.claim_count) FILTER (WHERE s.disposition = 'contract_required'), 0)::bigint AS contract_claims,
             coalesce(sum(s.observed_allowed_cents) FILTER (WHERE s.disposition = 'contract_required'), 0)::bigint AS contract_observed,
             count(*) FILTER (WHERE s.disposition = 'not_screened')::integer AS not_screened_rows,
             coalesce(sum(s.claim_count) FILTER (WHERE s.disposition = 'not_screened'), 0)::bigint AS not_screened_claims,
             coalesce(sum(s.observed_allowed_cents) FILTER (WHERE s.disposition = 'not_screened'), 0)::bigint AS not_screened_observed,
             count(*) FILTER (WHERE s.disposition IN ('unpriced', 'rates_change_in_band'))::integer AS unpriced_rows,
             coalesce(sum(s.claim_count) FILTER (WHERE s.disposition IN ('unpriced', 'rates_change_in_band')), 0)::bigint AS unpriced_claims,
             coalesce(sum(s.observed_allowed_cents) FILTER (WHERE s.disposition IN ('unpriced', 'rates_change_in_band')), 0)::bigint AS unpriced_observed
        FROM screening_result s WHERE s.run_id = r.id) t
   WHERE r.result_token_sha256 = token_sha256 AND r.status = 'complete' AND now() < r.expires_at
$$;

REVOKE ALL ON FUNCTION screening_result_summary(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION screening_result_summary(text) TO tp_app;

DROP FUNCTION operator_screening_claim(uuid);

-- Claims a run, as before (20261104090000), and returns the prospect's ZIP+4 beside its ZIP (null unless the ZIP needs
-- it), for the pricing context.
CREATE FUNCTION operator_screening_claim(run uuid)
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
  IF target.status = 'queued' OR (target.status = 'pricing' AND target.started_at < now() - interval '10 minutes' AND target.attempts < 3) THEN
    UPDATE screening_run r SET status = 'pricing', attempts = target.attempts + 1, started_at = now() WHERE r.id = target.id;
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

REVOKE ALL ON FUNCTION operator_screening_claim(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION operator_screening_claim(uuid) TO tp_operator;

-- The pinned release's records whatever a row's key, as before (20261104090000), with the sixth keyed type left to the
-- keyed read: locality_map_plus_four, which a line looks up by the ZIP.
CREATE OR REPLACE FUNCTION operator_screening_release(run uuid)
RETURNS TABLE (record_type text, key jsonb, value jsonb, effective_from text, effective_to text, sha256 text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT rr.record_type, rr.key, rr.value, rr.effective_from::text, rr.effective_to::text, rr.sha256
    FROM screening_run r
    JOIN rule_release rl ON rl.release_no = r.release_no AND rl.manifest_sha256 = r.release_manifest_sha256 AND rl.published_at IS NOT NULL
    JOIN rule_record rr ON rr.release_no = r.release_no
   WHERE r.id = $1 AND r.status = 'pricing'
     AND NOT EXISTS (SELECT 1 FROM rule_release_withdrawal w WHERE w.release_no = r.release_no)
     AND rr.record_type NOT IN ('pfs_rvu', 'ncci_mue', 'mppr_rate', 'ncci_ptp', 'locality_map', 'locality_map_plus_four')
   ORDER BY rr.record_type, rr.effective_from, rr.id
$$;

-- The keyed records, as before (20261104090000), and the prospect's ZIP in the ZIP+4 file (locality_map_plus_four,
-- keyed by the five-digit ZIP), so the fetch holds whatever the lookup reads, whether or not a ZIP+4 was given.
CREATE OR REPLACE FUNCTION operator_screening_run_records(run uuid)
RETURNS TABLE (record_type text, key jsonb, value jsonb, effective_from text, effective_to text, sha256 text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  WITH keyed AS (
    SELECT r.release_no, k.codes, k.zip FROM screening_run r CROSS JOIN LATERAL operator_screening_run_keys(r.id) k WHERE r.id = $1
  ), wanted AS (
    SELECT keyed.release_no, w.record_type, w.key
      FROM keyed CROSS JOIN LATERAL (
        SELECT t.record_type, t.key FROM unnest(keyed.codes) c
          CROSS JOIN LATERAL (VALUES ('pfs_rvu', jsonb_build_object('hcpcs', c, 'modifier', '')),
                                     ('ncci_mue', jsonb_build_object('hcpcs', c)),
                                     ('mppr_rate', jsonb_build_object('hcpcs', c, 'modifier', '')),
                                     ('ncci_ptp', jsonb_build_object('column1', c, 'column2', c))) AS t (record_type, key)
        UNION ALL SELECT 'mppr_rate', jsonb_build_object('component', 'practice_expense')
        UNION ALL SELECT 'locality_map', jsonb_build_object('zip', keyed.zip)
        UNION ALL SELECT 'locality_map_plus_four', jsonb_build_object('zip', keyed.zip)) w
  )
  SELECT rr.record_type, rr.key, rr.value, rr.effective_from::text, rr.effective_to::text, rr.sha256
    FROM wanted JOIN rule_record rr ON rr.release_no = wanted.release_no AND rr.record_type = wanted.record_type AND rr.key = wanted.key
   ORDER BY rr.record_type, rr.effective_from, rr.id
$$;

-- ---------------------------------------------------------------------------------------------------
-- 9. The content a release has loaded (audit #7), for the screening and, later, the Release-operations PR
-- ---------------------------------------------------------------------------------------------------

-- The dates each silently read content is loaded for in a release: the union of its records' windows. A content with
-- no record in the release has an empty span ('{}'), never the infinite one: without the FILTER the LEFT JOIN's row
-- of nulls aggregates to daterange(NULL, NULL, '[]'), which is (,), every date (measured on PostgreSQL 18.4). A null
-- effective_to is an open window, loaded onward. MUE stands in for the NCCI quarter; same-code pairs are too sparse to
-- date their absence.
CREATE FUNCTION rule_release_content_span(release integer)
RETURNS TABLE (content text, loaded datemultirange)
LANGUAGE sql STABLE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT c.content,
         coalesce(range_agg(daterange(r.effective_from, r.effective_to, '[]')) FILTER (WHERE r.id IS NOT NULL), '{}'::datemultirange)
    FROM (VALUES ('mppr_code'), ('mppr_general'), ('ncci_mue')) c (content)
    LEFT JOIN rule_record r ON r.release_no = $1
     AND ((c.content = 'mppr_code' AND r.record_type = 'mppr_rate' AND r.key ? 'hcpcs')
       OR (c.content = 'mppr_general' AND r.record_type = 'mppr_rate' AND r.key ? 'component')
       OR (c.content = 'ncci_mue' AND r.record_type = 'ncci_mue'))
   GROUP BY c.content
   ORDER BY c.content
$$;

-- A screening row's quarter as its days: '2026-Q2' is [2026-04-01, 2026-07-01). Null for anything else (the row's
-- own CHECK refuses it).
CREATE FUNCTION screening_band_days(band text) RETURNS daterange
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE WHEN band ~ '^20[0-9]{2}-Q[1-4]$'
              THEN daterange(make_date(substr(band, 1, 4)::integer, substr(band, 7, 1)::integer * 3 - 2, 1),
                             (make_date(substr(band, 1, 4)::integer, substr(band, 7, 1)::integer * 3 - 2, 1) + interval '3 months')::date, '[)') END
$$;

REVOKE ALL ON FUNCTION rule_release_content_span(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rule_release_content_span(integer) TO tp_app;
REVOKE ALL ON FUNCTION screening_band_days(text) FROM PUBLIC;

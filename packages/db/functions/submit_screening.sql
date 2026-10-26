-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- submit_screening(text,text,text,text,text,text[],text[],integer[],text[],text[],text[],bigint[],integer[],integer,integer,bigint,integer,bigint,bigint,text,text,text,text,text,text,text,text,timestamp with time zone,text,text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 8ea4e5450dbe8708
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.submit_screening(practice text, state_code text, zip5 text, plus_four text, email text, codes text[], modifier_sets text[], unit_counts integer[], places text[], products text[], bands text[], allowed_cents bigint[], claim_counts integer[], rows_left_out integer, claim_lines_left_out integer, allowed_cents_left_out bigint, rows_outside_content integer, claim_lines_outside_content bigint, allowed_cents_outside_content bigint, heard_from text, campaign_source text, campaign_medium text, campaign_name text, click_kind text, firm text, consent_sha256 text, terms_sha256 text, received timestamp with time zone, rate_account_subject text, request text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
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
$function$;
ALTER FUNCTION public.submit_screening(text,text,text,text,text,text[],text[],integer[],text[],text[],text[],bigint[],integer[],integer,integer,bigint,integer,bigint,bigint,text,text,text,text,text,text,text,text,timestamp with time zone,text,text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.submit_screening(text,text,text,text,text,text[],text[],integer[],text[],text[],text[],bigint[],integer[],integer,integer,bigint,integer,bigint,bigint,text,text,text,text,text,text,text,text,timestamp with time zone,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_screening(text,text,text,text,text,text[],text[],integer[],text[],text[],text[],bigint[],integer[],integer,integer,bigint,integer,bigint,bigint,text,text,text,text,text,text,text,text,timestamp with time zone,text,text) TO tp_app;

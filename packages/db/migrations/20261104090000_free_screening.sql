-- The free screening layer (Change Order 001, CO-04 and CO-12's four screening tables; reconciliation-001 decisions
-- D18 (a), D19 (a), D20 (a) and D21 (a), approved 2026-10-17, and the owner's rulings of 2026-10-18 on the reduction
-- across codes and sequestration; milestone 6 follow-up). Decisions: docs/adr/0062,
-- 0053 (prospect_request, the public form's pattern this copies), 0029 (the engine), 0038 (the $5 anomaly default),
-- 0014 and 0019 (platform jobs as the operator role).
--
-- A prospect uploads an aggregate file (one row per code, modifier set, units, place of service, payer product and
-- service-date band, with the allowed total and the claim count) and is emailed a link to what the unchanged engine
-- expects under Medicare for each row. Nothing here is PHI and nothing names a practice: the browser parses the
-- file, the server checks its header names and typed rows, and no byte of it is stored, nor any hash of it: an
-- accepted upload keeps the SHA-256 of the rows the server accepted, computed here from the rows it stores, and its
-- row count; a refused one its row count and the reasons by code, column position and kind (never a header's text or
-- a cell). Every row sums at least 11 claim lines (the CMS small-cell standard; the founder's ruling of 2026-10-18): a
-- row of fewer, beside its quarter and the practice's name and ZIP, can be one patient's service line. The browser
-- leaves such a row out and the upload keeps only how many rows, claim lines and dollars it left out; the server
-- refuses one sent anyway, by its row number; and screening_result_claim_count refuses one stored. A practice keeps
-- one accepted screening at a time: a later one of the same practice (the same ZIP and practice name, or the same
-- contact address) replaces it, so no two of its screenings are held at once to be subtracted, row from row or from
-- what was left out, into a cell of fewer than 11 claim lines. A kept summary (below) is not a screening: from a later
-- screening's upload to its completion, and for the 30 days a later one that fails or is abandoned is kept, the
-- practice's summary and that screening's stored rows are both held. No reader in the application holds both (the
-- later screening has no link until it completes), but the owner's role could subtract one from the other; counsel's
-- small-cell questions name this (ADR 0062).
--
-- - screening_prospect: the practice's name, state, five-digit ZIP and the contact address the result link goes to.
--   No ZIP+4: the engine takes a five-digit ZIP alone, so a ZIP whose locality_map record needs its ZIP+4 is refused
--   (screening_zip_plus_four) rather than asked for a ZIP+4 nothing could use, until PR 6b, which the founder's ruling
--   of 2026-10-18 puts before launch, takes one.
-- - screening_upload: one upload a prospect sent: its row count, accepted or rejected, and the reasons; for an
--   accepted one, the SHA-256 of its rows as accepted, and how many rows of fewer than 11 claim lines the browser left
--   out, their claim lines and their allowed total (never which rows).
-- - screening_place_of_service_split: the platform's default facility or non-facility setting per place of
--   service, approved by a contract specialist (rate_record.approve; a person, never a model), append-only; the
--   latest approval is in force. A fifth table beside CO-12's four: the engine needs a split and no rule record
--   carries one (fixtures/golden/QUESTIONS.md, Q08).
-- - screening_run: an accepted upload priced under the release in force and the split in force, both pinned at
--   creation, then queued, pricing, complete or failed. Only the SHA-256 of the result link's token is stored.
-- - screening_result: one row per uploaded row, its facts as decoded and, once priced, the engine's figures: the
--   engine's amount for one line before sequestration (read from its trace and rounded once, the unrounded value
--   beside it; payers report allowed amounts before sequestration) times the claim count, in bigint, outside the
--   engine (D19 a), and the difference from the allowed total in the file; whether the engine ranked the code in the
--   reduction across a visit's codes; and, for such a code, the same figures for the row priced again by the engine
--   as a later procedure of a visit, fully reduced. A row is an anomaly only when its allowed total is more than $5 a
--   claim line below its lowest figure; a pooled row between its two figures is within the range of the reduction
--   across codes. MA contracted and commercial rows are never priced (contract_required); medicaid and other rows are
--   not screened.
--
-- What outlives a screening (audit #57; the founder's rulings of 2026-10-20, which amend CO-04's "results expire
-- after 30 days"; ADR 0062, Outcomes, leads and attribution):
-- - screening_outcome: one counts-only row for every screening, a refused one included, kept with no end date: its
--   stage, month, how the prospect heard of us, the channel, a campaign the founder lists, bands of its row counts,
--   whole-percent shares, an anomaly band, a dollar band, how soon it was first opened, and whether an audit was
--   requested. Never a name, an email, a ZIP, an exact count, a date or a dollar figure; unlinked from its screening
--   when that expires or is replaced, and then sealed.
-- - screening_lead and screening_lead_product: the frozen summary of a converted or consenting prospect's screening,
--   kept 12 months from the upload, one for a practice at a time (a later screening of the practice replaces it at its
--   completion; one of the same ZIP and practice name carries the audit request over, the founder's ruling of
--   2026-10-20, decision 17, while one that matches by the contact address alone leaves the request without a summary,
--   never on another practice's figures), every claim-line sum 0 or at least 11. The result page and the result email
--   say whether this screening's summary is kept and with which request (screening_result_summary's kept_with,
--   operator_screening_complete's), so a prospect whose screening took over an earlier request is told so.
-- - marketing_campaign: the campaign codes a row may keep, listed by the founder. Every row that keeps a link's
--   campaign code (a prospect, a kept summary, an audit request and an outcome) keeps it only when it is listed as the
--   row is written, 'other' for any other code and null for none, by a trigger on each table, whatever writes it (the
--   founder's ruling of 2026-10-21: a shape check cannot catch a person's name typed inside a code). A code listed
--   later leaves the rows that kept 'other' as they are.
-- - screening_prospect gains how the prospect heard of us, the attribution cookie's campaign codes and kind of paid
--   click, a referring firm, and the SHA-256s of the follow-up consent (PR 6e captures it) and of the screening terms
--   accepted (audit #51); screening_run gains when the result was first opened by a person.
-- - prospect_request gains the same attribution (its campaign code only when listed), whether it came from a
--   screening, and why a declined request was declined (a closed list).
--
-- The tables live in schema public with row-level security forced and one policy, the owner's; they have no
-- practice_id and no phi_table_registry row, and no role but the owner reads or writes them. The application role
-- reaches them only through the SECURITY DEFINER functions below (submit, reject, read by token, the result's opened
-- signal, convert, withdraw, and the console's split and campaign list), the operator role (platform jobs) only
-- through operator_screening_*(). Nothing is recorded while screening is closed. A screening's prospect, upload, run
-- and rows expire 30 days after the upload: the reads refuse them from expires_at on, and the screening_expiry job
-- deletes them; an accepted screening goes sooner when a later one of the same practice replaces it (submit_screening,
-- each an audit event, screening_replaced). Its outcome stays, unlinked; a kept summary goes after 12 months (the same
-- job), at a replacement's completion, on withdrawal, or with its audit request. A run is priced only under its pinned
-- release while that release is published, its manifest unchanged and not withdrawn; a result whose release has
-- since been withdrawn says so. The release is read in two parts: the record types no row's key selects, which the
-- job holds once per release and manifest (operator_screening_release), and the five a line looks up by its own key,
-- read per run by the keys its rows can ask for (operator_screening_run_keys, operator_screening_run_records; audit
-- #53). The conversion to an audit request is an audit event (screening_converted) and outlives the expiry.
--
-- Runs as tp_owner. Safe with the previous image running: yes. Added: nine tables, their CHECK and trigger functions,
-- the standing a result's figures are read by (screening_standing), the bands and channel outcomes are written with,
-- the campaign list's check (marketing_campaign_kept, marketing_campaign_listed_only), the definer functions and their
-- grants, and a second, twelve-argument submit_prospect_request. Altered: prospect_request gains eight columns with
-- their CHECKs (built-ins only, so the application role's direct updates need no EXECUTE), a column grant (UPDATE
-- (declined_reason) to tp_app), a replaced trigger function (prospect_request_fixed) and a trigger that keeps its
-- campaign code only when listed (prospect_request_campaign_listed, on an insert or an update naming utm_campaign,
-- which the application role's updates never name); its declined rows take 'not_recorded' as their reason. The previous image's review,
-- decline and conversion meet only built-in CHECKs, its decline records 'not_recorded', and it calls the six-argument
-- submit_prospect_request, which stays. No other existing table, function, policy, CHECK or grant changes, and no DDL
-- touches a rule, ledger or pricing table. Rollout: migrate, then the new worker (it creates the screening queues),
-- then the new web; a submission whose job cannot be sent yet stays queued and the minute sweep prices it. The
-- previous image's decline names no reason, so while it may run prospect_request_fixed() records 'not_recorded' for
-- it; the migration that follows once no previous image runs replaces that fill-in with a refusal, so a decline with no
-- reason (a handler's bug, a direct update) raises instead of recording a reason no one gave.

-- ---------------------------------------------------------------------------------------------------
-- What a row may hold
-- ---------------------------------------------------------------------------------------------------

-- An upload's rejection reasons: at most 20, each an object of these keys only: a code, and where it applies the
-- column's position (1 to 64), a row (1 to 10,000,000), the first row of a run of them, the field (one of the
-- eight columns) and the PHI kind. Never a header's text or a cell's value: a row of fewer than 11 claim lines
-- (too_few_claim_lines) is named by its number and the claim_count field alone, never its count, code or quarter.
CREATE FUNCTION screening_rejection_valid(reason jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE WHEN jsonb_typeof(reason) IS DISTINCT FROM 'object' THEN false ELSE coalesce(
       jsonb_typeof(reason -> 'code') = 'string'
   AND (reason ->> 'code') IN ('phi_column', 'unknown_column', 'duplicate_column', 'missing_column', 'row_shape', 'invalid_value', 'band_holds_date',
                               'band_in_future', 'duplicate_row', 'no_rows', 'too_many_rows', 'row_count_mismatch', 'too_few_claim_lines')
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

CREATE FUNCTION screening_rejections_valid(reasons jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT CASE WHEN jsonb_typeof(reasons) IS DISTINCT FROM 'array' THEN false
              WHEN jsonb_array_length(reasons) > 20 THEN false
              ELSE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(reasons) r WHERE NOT screening_rejection_valid(r)) END
$$;

-- A place-of-service split: an object of 1 to 99 places (two digits, 01 to 99), each facility or non_facility.
CREATE FUNCTION screening_split_valid(settings jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE WHEN jsonb_typeof(settings) IS DISTINCT FROM 'object' THEN false ELSE coalesce(
       (SELECT count(*) FROM jsonb_object_keys(settings)) BETWEEN 1 AND 99
   AND NOT EXISTS (SELECT 1 FROM jsonb_each(settings) e
                    WHERE e.key !~ '^(0[1-9]|[1-9][0-9])$' OR jsonb_typeof(e.value) <> 'string' OR (e.value #>> '{}') NOT IN ('facility', 'non_facility')), false)
  END
$$;

-- A row's modifier set: at most four two-character modifiers, distinct and in ascending (byte) order, so one set
-- has one spelling and the uniqueness of a row's key holds.
CREATE FUNCTION screening_modifiers_valid(modifiers text[]) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog, pg_temp AS $$
  SELECT coalesce(cardinality(modifiers) <= 4
     AND (cardinality(modifiers) = 0 OR (array_ndims(modifiers) = 1 AND array_lower(modifiers, 1) = 1))
     AND array_position(modifiers, NULL) IS NULL
     AND array_to_string(modifiers, ' ') ~ '^([0-9A-Z]{2}( [0-9A-Z]{2}){0,3})?$'
     AND (cardinality(modifiers) < 2 OR modifiers[1] COLLATE "C" < modifiers[2] COLLATE "C")
     AND (cardinality(modifiers) < 3 OR modifiers[2] COLLATE "C" < modifiers[3] COLLATE "C")
     AND (cardinality(modifiers) < 4 OR modifiers[3] COLLATE "C" < modifiers[4] COLLATE "C"), false)
$$;

-- A practice name as two prospects of one practice are compared: lower case, each run of white space one space.
CREATE FUNCTION screening_practice_key(practice text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog, pg_temp AS $$
  SELECT lower(regexp_replace(btrim(practice), '\s+', ' ', 'g'))
$$;

-- The marketing channel a screening or request came by (MARKETING_CHANNELS), computed here from the campaign medium
-- and the kind of paid click, never taken from a caller. A medium no list names is 'other'; with none or 'other', a
-- paid click names the channel. Called only inside the definer functions below.
CREATE FUNCTION marketing_channel(utm_medium text, paid_click text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE WHEN m.channel IN ('none', 'other') AND paid_click IN ('paid_search', 'paid_social') THEN paid_click ELSE m.channel END
    FROM (SELECT CASE
                   WHEN utm_medium IS NULL THEN 'none'
                   WHEN utm_medium IN ('email', 'newsletter') THEN 'email'
                   WHEN utm_medium IN ('cpc', 'ppc', 'paid_search', 'sem') THEN 'paid_search'
                   WHEN utm_medium IN ('paid_social') THEN 'paid_social'
                   WHEN utm_medium IN ('social', 'organic_social', 'linkedin') THEN 'social'
                   WHEN utm_medium IN ('partner', 'referral', 'affiliate') THEN 'partner'
                   WHEN utm_medium IN ('event', 'conference', 'webinar') THEN 'event'
                   WHEN utm_medium IN ('content', 'blog', 'podcast', 'article') THEN 'content'
                   ELSE 'other'
                 END AS channel) m
$$;

-- A count as an outcome keeps it (SCREENING_COUNT_BANDS): a band, never the number. None for no count or zero.
CREATE FUNCTION screening_count_band(n bigint) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE WHEN n IS NULL OR n <= 0 THEN 'none' WHEN n <= 100 THEN '1_100' WHEN n <= 1000 THEN '101_1k'
              WHEN n <= 10000 THEN '1k_10k' WHEN n <= 50000 THEN '10k_50k' ELSE 'over_50k' END
$$;

-- A sum of dollars as an outcome keeps it (SCREENING_DIFFERENCE_BANDS), the narrowest step $1,000: none for no sum
-- or one of zero or less; then under $1,000, under $10,000, under $50,000, under $250,000, and $250,000 or more.
CREATE FUNCTION screening_difference_band(gap_cents bigint) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE WHEN gap_cents IS NULL OR gap_cents <= 0 THEN 'none' WHEN gap_cents < 100000 THEN 'under_1k'
              WHEN gap_cents < 1000000 THEN '1k_to_10k' WHEN gap_cents < 5000000 THEN '10k_to_50k'
              WHEN gap_cents < 25000000 THEN '50k_to_250k' ELSE '250k_or_more' END
$$;

-- How soon a result was first opened (SCREENING_OPEN_BANDS), by UTC calendar days from the upload; never a date.
CREATE FUNCTION screening_open_band(uploaded timestamptz, opened timestamptz) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE WHEN d.days IS NULL THEN NULL WHEN d.days <= 0 THEN 'same_day' WHEN d.days <= 2 THEN '1_2_days'
              WHEN d.days <= 7 THEN '3_7_days' ELSE '8_30_days' END
    FROM (SELECT (opened AT TIME ZONE 'UTC')::date - (uploaded AT TIME ZONE 'UTC')::date AS days) d
$$;

-- A refused upload's reasons as an outcome keeps them: the codes alone (screening_rejection_valid()'s list), distinct
-- and in ascending order, at most the 13 there are; never a row, a column or a field.
CREATE FUNCTION screening_refusal_codes_valid(codes text[]) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog, pg_temp AS $$
  SELECT coalesce(cardinality(codes) <= 13
     AND (cardinality(codes) = 0 OR (array_ndims(codes) = 1 AND array_lower(codes, 1) = 1))
     AND array_position(codes, NULL) IS NULL
     AND NOT EXISTS (SELECT 1 FROM unnest(codes) c
                      WHERE c NOT IN ('phi_column', 'unknown_column', 'duplicate_column', 'missing_column', 'row_shape', 'invalid_value', 'band_holds_date',
                                      'band_in_future', 'duplicate_row', 'no_rows', 'too_many_rows', 'row_count_mismatch', 'too_few_claim_lines'))
     AND codes = ARRAY(SELECT d.c FROM (SELECT DISTINCT c FROM unnest(codes) c) d ORDER BY d.c COLLATE "C"), false)
$$;

-- The version of the result page's labels a kept summary was shown under: SCREENING_LABELS_VERSION in
-- apps/web/src/lib/screening/labels.ts (a test holds the two equal, and the labels to their version).
CREATE FUNCTION screening_labels_version() RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog, pg_temp AS $$
  SELECT 'screening-labels/2026-10-18'::text
$$;

-- A screening's prospect, upload and run are kept until they expire, then deleted together (screening_expiry), or
-- until a later accepted screening of the same practice replaces them (screening_replaced). A row deleted with its
-- parent (the cascade from its prospect or upload) was checked with that parent.
CREATE FUNCTION screening_kept_until_expiry() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  prospect uuid;
BEGIN
  IF OLD.expires_at <= now() THEN
    RETURN OLD;
  END IF;
  IF TG_TABLE_NAME = 'screening_prospect' THEN
    prospect := OLD.id;
  ELSIF TG_TABLE_NAME = 'screening_upload' THEN
    SELECT p.id INTO prospect FROM screening_prospect p WHERE p.id = OLD.prospect_id;
    IF NOT FOUND THEN
      RETURN OLD;
    END IF;
  ELSE
    SELECT u.prospect_id INTO prospect FROM screening_upload u WHERE u.id = OLD.upload_id;
    IF NOT FOUND THEN
      RETURN OLD;
    END IF;
  END IF;
  IF NOT screening_replaced(prospect) THEN
    RAISE EXCEPTION 'a screening is kept until it expires, 30 days after its upload, or a later screening of the same practice replaces it'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_kept_until_expiry';
  END IF;
  RETURN OLD;
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- Prospects and uploads
-- ---------------------------------------------------------------------------------------------------

CREATE TABLE screening_prospect (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_name text NOT NULL CONSTRAINT screening_prospect_practice_name
    CHECK (btrim(practice_name) <> '' AND length(practice_name) <= 200 AND practice_name = btrim(practice_name)),
  -- The 50 states, DC, and the territories USPS serves (PR, VI, GU, AS, MP); format.ts holds the same list.
  state text NOT NULL CONSTRAINT screening_prospect_state CHECK (state IN (
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
    'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
    'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC', 'PR', 'VI', 'GU', 'AS', 'MP')),
  zip text NOT NULL CONSTRAINT screening_prospect_zip CHECK (zip ~ '^[0-9]{5}$'),
  -- An address the mail service can send to, lower case: an RFC 5322 dot-atom before the @ (no leading, trailing or
  -- doubled dot) of at most 64 characters, a domain of two or more labels after it with no trailing dot, plain ASCII.
  contact_email text NOT NULL CONSTRAINT screening_prospect_contact_email
    CHECK (contact_email ~ '^[a-z0-9!#$%&''*+/=?^_`{|}~-]+(\.[a-z0-9!#$%&''*+/=?^_`{|}~-]+)*@[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
           AND length(contact_email) <= 254 AND strpos(contact_email, '@') <= 65 AND contact_email = lower(contact_email)),
  -- How the prospect heard of PaidWhole: one of the closed list the form offers (PROSPECT_SOURCES in
  -- packages/db/src/schema/onboarding.ts, written inline here as in every CHECK that uses it), or none.
  source text CONSTRAINT screening_prospect_source CHECK (source IS NULL OR source IN (
    'search', 'billing_firm', 'colleague', 'association', 'event', 'social', 'paidwhole_email', 'article', 'other')),
  -- The campaign codes of the first-party attribution cookie (pw_first_touch; apps/web/src/lib/http/attribution.ts),
  -- normalised there and shape-checked here: codes a link carried, never a person's identifier. The campaign code is
  -- kept only when the founder lists it, 'other' otherwise (marketing_campaign_listed_only(), the founder's ruling of
  -- 2026-10-21): a shape check cannot catch a name typed inside a code.
  utm_source text CONSTRAINT screening_prospect_utm_source CHECK (utm_source ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
  utm_medium text CONSTRAINT screening_prospect_utm_medium CHECK (utm_medium ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
  utm_campaign text CONSTRAINT screening_prospect_utm_campaign CHECK (utm_campaign ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
  -- The kind of paid click the landing URL carried, from the presence of a click-ID parameter; never its value.
  paid_click text CONSTRAINT screening_prospect_paid_click CHECK (paid_click IN ('paid_search', 'paid_social')),
  -- The billing firm that referred the practice, as typed (screened for identifier shapes by the handler).
  referring_firm text CONSTRAINT screening_prospect_referring_firm
    CHECK (btrim(referring_firm) <> '' AND length(referring_firm) <= 200 AND referring_firm = btrim(referring_firm)),
  -- The SHA-256 of the exact follow-up consent wording the prospect ticked; null is no consent (PR 6e captures it).
  followup_consent_sha256 text CONSTRAINT screening_prospect_followup_consent CHECK (followup_consent_sha256 ~ '^[0-9a-f]{64}$'),
  -- The SHA-256 of the screening terms' text the prospect accepted (audit #51, the founder's ruling of 2026-10-20);
  -- null until the terms' wording, the founder's and counsel's, and its checkbox land.
  screening_terms_sha256 text CONSTRAINT screening_prospect_screening_terms CHECK (screening_terms_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  CONSTRAINT screening_prospect_expiry CHECK (expires_at = created_at + interval '30 days')
);
CREATE INDEX screening_prospect_by_expiry ON screening_prospect (expires_at);
-- The prospects of one practice, as a new screening finds the one it replaces (screening_replaced).
CREATE INDEX screening_prospect_by_contact ON screening_prospect (contact_email);
CREATE INDEX screening_prospect_by_practice ON screening_prospect (zip, screening_practice_key(practice_name));

CREATE TABLE screening_upload (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid NOT NULL REFERENCES screening_prospect (id) ON DELETE CASCADE,
  -- On an accepted upload, the SHA-256 of its rows as the server accepted them, in their canonical form (format.ts,
  -- encodeScreeningRows), computed by submit_screening from the rows it stores and never taken from the caller. Never
  -- a hash of the file: the file holds the rows the browser left out, and a hash over them, with no key, beside the
  -- rows kept and the sums of those left out, would let a left-out row be found by trial. A refused upload keeps no
  -- hash, because the rows refused can hold the very row the floor withholds.
  rows_sha256 text CONSTRAINT screening_upload_rows_sha256 CHECK (rows_sha256 ~ '^[0-9a-f]{64}$'),
  row_count integer NOT NULL CONSTRAINT screening_upload_row_count CHECK (row_count BETWEEN 0 AND 10000000),
  status text NOT NULL CONSTRAINT screening_upload_status CHECK (status IN ('accepted', 'rejected')),
  rejection_reasons jsonb NOT NULL DEFAULT '[]'::jsonb CONSTRAINT screening_upload_reasons CHECK (screening_rejections_valid(rejection_reasons)),
  -- The rows the prospect's browser left out before sending because each sums fewer than 11 claim lines (format.ts,
  -- SCREENING_MIN_CLAIM_LINES): how many, their claim lines and their allowed total, as the browser counted them, for
  -- the result to say. Never which rows: no code, modifier, units, place of service, payer product or quarter, and no
  -- hash over any of them. When one row of one claim line is left out, these are that line's count and allowed amount,
  -- without its key (counsel's question, ADR 0062). Zero on a rejected upload.
  left_out_rows integer NOT NULL DEFAULT 0 CONSTRAINT screening_upload_left_out_rows CHECK (left_out_rows BETWEEN 0 AND 50000),
  left_out_claim_lines integer NOT NULL DEFAULT 0,
  left_out_allowed_cents bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  CONSTRAINT screening_upload_rejected CHECK (
    (status = 'rejected') = (CASE WHEN jsonb_typeof(rejection_reasons) = 'array' THEN jsonb_array_length(rejection_reasons) > 0 ELSE false END)),
  CONSTRAINT screening_upload_accepted_rows CHECK (status <> 'accepted' OR (row_count BETWEEN 1 AND 50000 AND row_count + left_out_rows <= 50000)),
  -- An accepted upload has the hash of its rows; a refused one has none.
  CONSTRAINT screening_upload_rows_hashed CHECK ((status = 'accepted') = (rows_sha256 IS NOT NULL)),
  -- Each row left out sums 1 to 10 claim lines, at most $25,000.00 a claim line; a rejected upload leaves nothing out.
  CONSTRAINT screening_upload_left_out_claim_lines CHECK (left_out_claim_lines BETWEEN left_out_rows AND 10 * left_out_rows),
  CONSTRAINT screening_upload_left_out_allowed CHECK (left_out_allowed_cents BETWEEN 0 AND 2500000::bigint * left_out_claim_lines),
  CONSTRAINT screening_upload_left_out_accepted CHECK (status = 'accepted' OR left_out_rows = 0),
  CONSTRAINT screening_upload_expiry CHECK (expires_at = created_at + interval '30 days')
);
CREATE INDEX screening_upload_by_prospect ON screening_upload (prospect_id);

-- Whether a prospect's accepted screening has been replaced: another prospect of the same practice (the same ZIP and
-- practice name, or the same contact address) has an accepted upload. A practice keeps one accepted screening at a
-- time (submit_screening deletes the one a new upload replaces), because two held at once could be subtracted, row
-- from row or from what was left out, into a cell of fewer than 11 claim lines.
CREATE FUNCTION screening_replaced(prospect uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM screening_prospect o
      JOIN screening_prospect n ON n.id <> o.id
       AND (n.contact_email = o.contact_email OR (n.zip = o.zip AND screening_practice_key(n.practice_name) = screening_practice_key(o.practice_name)))
      JOIN screening_upload u ON u.prospect_id = n.id AND u.status = 'accepted'
     WHERE o.id = prospect)
$$;

-- ---------------------------------------------------------------------------------------------------
-- The place-of-service split the specialist approves
-- ---------------------------------------------------------------------------------------------------

CREATE TABLE screening_place_of_service_split (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settings jsonb NOT NULL CONSTRAINT screening_place_of_service_split_settings CHECK (screening_split_valid(settings)),
  approved_by uuid NOT NULL REFERENCES "user" (id),
  approved_at timestamptz NOT NULL DEFAULT now()
);
-- The split in force: the latest approval, its id breaking a tie.
CREATE INDEX screening_place_of_service_split_in_force ON screening_place_of_service_split (approved_at DESC, id DESC);
CREATE TRIGGER screening_place_of_service_split_append_only BEFORE UPDATE OR DELETE ON screening_place_of_service_split
  FOR EACH ROW EXECUTE FUNCTION reject_change();
CREATE TRIGGER screening_place_of_service_split_no_truncate BEFORE TRUNCATE ON screening_place_of_service_split
  FOR EACH STATEMENT EXECUTE FUNCTION reject_change();

-- ---------------------------------------------------------------------------------------------------
-- Runs and results
-- ---------------------------------------------------------------------------------------------------

CREATE TABLE screening_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id uuid NOT NULL UNIQUE REFERENCES screening_upload (id) ON DELETE CASCADE,
  -- The release in force when the run was created (current_rule_release()); deliberately no foreign key, so no
  -- DDL touches rule_release. The manifest's SHA-256 pins its content.
  release_no integer NOT NULL CONSTRAINT screening_run_release_no CHECK (release_no > 0),
  release_manifest_sha256 text NOT NULL CONSTRAINT screening_run_release_manifest CHECK (release_manifest_sha256 ~ '^[0-9a-f]{64}$'),
  place_of_service_split_id uuid NOT NULL REFERENCES screening_place_of_service_split (id),
  row_count integer NOT NULL CONSTRAINT screening_run_row_count CHECK (row_count BETWEEN 1 AND 50000),
  status text NOT NULL DEFAULT 'queued' CONSTRAINT screening_run_status CHECK (status IN ('queued', 'pricing', 'complete', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CONSTRAINT screening_run_attempts CHECK (attempts BETWEEN 0 AND 3),
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  engine_version text CONSTRAINT screening_run_engine_version CHECK (engine_version ~ '^[a-z0-9][a-z0-9./-]{0,31}$'),
  failure_code text CONSTRAINT screening_run_failure_code CHECK (failure_code ~ '^[A-Z][A-Z0-9_]{0,63}$'),
  -- The SHA-256 of the result link's token; the token itself is never stored.
  result_token_sha256 text UNIQUE CONSTRAINT screening_run_result_token CHECK (result_token_sha256 ~ '^[0-9a-f]{64}$'),
  converted_prospect_request_id uuid REFERENCES prospect_request (id),
  converted_at timestamptz,
  -- When the result was first opened by a person: the result page's signal after it was visible and used
  -- (screening_result_opened()), or the conversion; never the link's GET, which a mail scanner also makes.
  first_opened_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  CONSTRAINT screening_run_opened CHECK (first_opened_at IS NULL OR status = 'complete'),
  CONSTRAINT screening_run_complete CHECK (
    (status = 'complete') = (result_token_sha256 IS NOT NULL)
    AND (status = 'complete') = (completed_at IS NOT NULL)
    AND (status = 'complete') = (engine_version IS NOT NULL)),
  CONSTRAINT screening_run_failed CHECK ((status = 'failed') = (failure_code IS NOT NULL) AND (status = 'failed') = (failed_at IS NOT NULL)),
  CONSTRAINT screening_run_started CHECK (
    (status <> 'queued' OR (started_at IS NULL AND attempts = 0))
    AND (status NOT IN ('pricing', 'complete') OR (started_at IS NOT NULL AND attempts >= 1))),
  CONSTRAINT screening_run_converted CHECK (
    (converted_at IS NULL) = (converted_prospect_request_id IS NULL) AND (converted_at IS NULL OR status = 'complete')),
  CONSTRAINT screening_run_expiry CHECK (expires_at = created_at + interval '30 days')
);
CREATE INDEX screening_run_by_status ON screening_run (status, created_at);

-- A run keeps its upload, release, split, row count and dates; it moves queued to pricing (a stale run is claimed
-- again, one attempt more), pricing to complete or failed, or queued to failed; its token, its conversion and its
-- first open are each set once (a complete run's conversion and first open in the same update or apart).
CREATE FUNCTION screening_run_rules() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF (NEW.id, NEW.upload_id, NEW.release_no, NEW.release_manifest_sha256, NEW.place_of_service_split_id, NEW.row_count, NEW.created_at, NEW.expires_at)
     IS DISTINCT FROM (OLD.id, OLD.upload_id, OLD.release_no, OLD.release_manifest_sha256, OLD.place_of_service_split_id, OLD.row_count, OLD.created_at, OLD.expires_at) THEN
    RAISE EXCEPTION 'a screening run keeps its upload, release, split, row count and dates' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status = 'pricing' AND OLD.status IN ('queued', 'pricing') THEN
    IF NEW.attempts <> OLD.attempts + 1 OR NEW.started_at IS NOT DISTINCT FROM OLD.started_at THEN
      RAISE EXCEPTION 'a screening run is claimed one attempt at a time, from when it is claimed' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF (OLD.status = 'pricing' AND NEW.status IN ('complete', 'failed')) OR (OLD.status = 'queued' AND NEW.status = 'failed') THEN
    IF NEW.attempts <> OLD.attempts OR NEW.started_at IS DISTINCT FROM OLD.started_at THEN
      RAISE EXCEPTION 'a screening run ends on the attempt that priced it' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.converted_at IS NOT NULL OR NEW.first_opened_at IS NOT NULL THEN
      RAISE EXCEPTION 'a screening is opened and converts once it is complete' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF OLD.status = 'complete' AND NEW.status = 'complete' THEN
    IF (NEW.attempts, NEW.started_at, NEW.completed_at, NEW.engine_version, NEW.result_token_sha256, NEW.failed_at, NEW.failure_code)
       IS DISTINCT FROM (OLD.attempts, OLD.started_at, OLD.completed_at, OLD.engine_version, OLD.result_token_sha256, OLD.failed_at, OLD.failure_code) THEN
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
CREATE TRIGGER screening_run_rules BEFORE UPDATE ON screening_run FOR EACH ROW EXECUTE FUNCTION screening_run_rules();

CREATE TABLE screening_result (
  run_id uuid NOT NULL REFERENCES screening_run (id) ON DELETE CASCADE,
  row_no integer NOT NULL CONSTRAINT screening_result_row_no CHECK (row_no BETWEEN 1 AND 50000),
  -- CPT Category I, II, III, PLA and MAAA, or HCPCS Level II: five letters (a name) are never a code.
  procedure_code text NOT NULL CONSTRAINT screening_result_procedure_code CHECK (procedure_code ~ '^([0-9]{4}[0-9FMTU]|[A-V][0-9]{4})$'),
  modifiers text[] NOT NULL CONSTRAINT screening_result_modifiers CHECK (screening_modifiers_valid(modifiers)),
  units integer NOT NULL CONSTRAINT screening_result_units CHECK (units BETWEEN 1 AND 999),
  place_of_service text NOT NULL CONSTRAINT screening_result_place_of_service CHECK (place_of_service ~ '^(0[1-9]|[1-9][0-9])$'),
  payer_product text NOT NULL CONSTRAINT screening_result_payer_product
    CHECK (payer_product IN ('medicare_ffs', 'ma_noncontracted', 'ma_contracted', 'commercial', 'medicaid', 'other')),
  service_band text NOT NULL CONSTRAINT screening_result_service_band CHECK (service_band ~ '^20[0-9]{2}-Q[1-4]$'),
  -- At least 11 claim lines (the CMS small-cell standard; format.ts, SCREENING_MIN_CLAIM_LINES): a row of fewer can be
  -- one patient's service line, so it is never stored. At most 100,000.
  claim_count integer NOT NULL CONSTRAINT screening_result_claim_count CHECK (claim_count BETWEEN 11 AND 100000),
  -- At most $25,000.00 a claim line, so an identifier typed under the allowed total is refused, never kept as dollars.
  observed_allowed_cents bigint NOT NULL CONSTRAINT screening_result_observed
    CHECK (observed_allowed_cents BETWEEN 0 AND 99999999999 AND observed_allowed_cents <= 2500000::bigint * claim_count),
  disposition text NOT NULL CONSTRAINT screening_result_disposition
    CHECK (disposition IN ('pending', 'priced', 'unpriced', 'rates_change_in_band', 'contract_required', 'not_screened')),
  -- The engine's amount for one line of the row priced alone, before sequestration (its trace's amount before that
  -- step, rounded once under the trace's rule, its unrounded value beside it): the figure before the reduction
  -- across codes; that amount times the claim count, in bigint, and its difference from the allowed total in the file.
  expected_line_cents bigint,
  expected_line_unrounded numeric,
  expected_cents bigint,
  difference_cents bigint,
  -- The engine's trace of the one-line claim ranked its code in the reduction across a visit's codes (the mppr
  -- adjustment's in_pool): a visit with several such codes prices lower than the rows priced alone.
  in_reduction_pool boolean,
  -- For a row in that reduction only: the engine's amount for the row priced as a later procedure of a visit (every
  -- unit reduced), before sequestration and rounded once as above: the fully reduced figure; it times the claim
  -- count, its difference from the allowed total, and the SHA-256 of that pricing's trace.
  reduced_line_cents bigint,
  reduced_line_unrounded numeric,
  reduced_cents bigint,
  reduced_difference_cents bigint,
  reduced_trace_sha256 text CONSTRAINT screening_result_reduced_trace_sha256 CHECK (reduced_trace_sha256 ~ '^[0-9a-f]{64}$'),
  unpriced_reason text CONSTRAINT screening_result_unpriced_reason CHECK (unpriced_reason IN (
    'NO_AGREEMENT', 'NO_MAPPING', 'AMBIGUOUS_RATE', 'NO_RATE_FOR_CODE', 'NO_PFS_VALUE', 'UNSUPPORTED_METHOD', 'SECONDARY_PAYER',
    'MUE_EXCEEDED', 'UNITS_RULE_UNKNOWN', 'DATE_OUTSIDE_VERSIONS', 'REVERSED_CLAIM', 'ENGINE_ERROR')),
  unpriced_detail text CONSTRAINT screening_result_unpriced_detail CHECK (unpriced_detail ~ '^[a-z][a-z0-9_]{0,63}$'),
  -- The SHA-256 of the engine's trace for the row's one-line claim.
  trace_sha256 text CONSTRAINT screening_result_trace_sha256 CHECK (trace_sha256 ~ '^[0-9a-f]{64}$'),
  PRIMARY KEY (run_id, row_no),
  CONSTRAINT screening_result_once UNIQUE (run_id, procedure_code, modifiers, units, place_of_service, payer_product, service_band),
  -- MA contracted and commercial rows are never priced as non-contracted: they cannot be priced without a contract.
  CONSTRAINT screening_result_contract_required CHECK ((payer_product IN ('ma_contracted', 'commercial')) = (disposition = 'contract_required')),
  CONSTRAINT screening_result_not_screened CHECK ((payer_product IN ('medicaid', 'other')) = (disposition = 'not_screened')),
  CONSTRAINT screening_result_medicare CHECK (
    payer_product NOT IN ('medicare_ffs', 'ma_noncontracted') OR disposition IN ('pending', 'priced', 'unpriced', 'rates_change_in_band')),
  CONSTRAINT screening_result_priced CHECK (
    (disposition = 'priced') = (expected_line_cents IS NOT NULL)
    AND (disposition = 'priced') = (expected_line_unrounded IS NOT NULL)
    AND (disposition = 'priced') = (expected_cents IS NOT NULL)
    AND (disposition = 'priced') = (difference_cents IS NOT NULL)
    AND (disposition = 'priced') = (in_reduction_pool IS NOT NULL)),
  CONSTRAINT screening_result_figures CHECK (
    disposition <> 'priced'
    OR (expected_line_cents >= 0 AND abs(expected_line_unrounded - expected_line_cents) < 1
        AND expected_cents = expected_line_cents * claim_count AND difference_cents = expected_cents - observed_allowed_cents)),
  -- The fully reduced figure belongs to a priced row in the reduction across codes, and to no other.
  CONSTRAINT screening_result_reduced CHECK (
    coalesce(disposition = 'priced' AND in_reduction_pool, false) = (reduced_line_cents IS NOT NULL)
    AND coalesce(disposition = 'priced' AND in_reduction_pool, false) = (reduced_line_unrounded IS NOT NULL)
    AND coalesce(disposition = 'priced' AND in_reduction_pool, false) = (reduced_cents IS NOT NULL)
    AND coalesce(disposition = 'priced' AND in_reduction_pool, false) = (reduced_difference_cents IS NOT NULL)
    AND coalesce(disposition = 'priced' AND in_reduction_pool, false) = (reduced_trace_sha256 IS NOT NULL)),
  CONSTRAINT screening_result_reduced_figures CHECK (
    reduced_line_cents IS NULL
    OR (reduced_line_cents BETWEEN 0 AND expected_line_cents AND abs(reduced_line_unrounded - reduced_line_cents) < 1
        AND reduced_cents = reduced_line_cents * claim_count AND reduced_difference_cents = reduced_cents - observed_allowed_cents)),
  CONSTRAINT screening_result_unpriced CHECK (
    (disposition = 'unpriced') = (unpriced_reason IS NOT NULL) AND (unpriced_detail IS NULL OR unpriced_reason IN ('ENGINE_ERROR', 'NO_PFS_VALUE'))),
  CONSTRAINT screening_result_trace CHECK ((disposition IN ('priced', 'unpriced', 'rates_change_in_band')) = (trace_sha256 IS NOT NULL))
);
-- The rows a run has still to price, in order.
CREATE INDEX screening_result_pending ON screening_result (run_id, row_no) WHERE disposition = 'pending';

-- Rows are inserted with their run, while it is queued, before any is priced.
CREATE FUNCTION screening_result_inserted() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM screening_inserted a LEFT JOIN screening_run r ON r.id = a.run_id
              WHERE r.status IS DISTINCT FROM 'queued' OR a.disposition NOT IN ('pending', 'contract_required', 'not_screened')) THEN
    RAISE EXCEPTION 'a screening''s rows are inserted with its run, before it is priced' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER screening_result_inserted AFTER INSERT ON screening_result REFERENCING NEW TABLE AS screening_inserted
  FOR EACH STATEMENT EXECUTE FUNCTION screening_result_inserted();

-- A row's facts never change; its disposition moves once, from pending to what pricing found.
CREATE FUNCTION screening_result_rules() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF (NEW.run_id, NEW.row_no, NEW.procedure_code, NEW.modifiers, NEW.units, NEW.place_of_service, NEW.payer_product, NEW.service_band, NEW.claim_count, NEW.observed_allowed_cents)
     IS DISTINCT FROM (OLD.run_id, OLD.row_no, OLD.procedure_code, OLD.modifiers, OLD.units, OLD.place_of_service, OLD.payer_product, OLD.service_band, OLD.claim_count, OLD.observed_allowed_cents) THEN
    RAISE EXCEPTION 'a screening row keeps the facts it was uploaded with' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.disposition <> 'pending' OR NEW.disposition NOT IN ('priced', 'unpriced', 'rates_change_in_band') THEN
    RAISE EXCEPTION 'a screening row is priced once, from pending' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER screening_result_rules BEFORE UPDATE ON screening_result FOR EACH ROW EXECUTE FUNCTION screening_result_rules();

-- Prospects and uploads never change; the three are deleted only once expired, and never truncated.
CREATE TRIGGER screening_prospect_fixed BEFORE UPDATE ON screening_prospect FOR EACH ROW EXECUTE FUNCTION reject_change();
CREATE TRIGGER screening_upload_fixed BEFORE UPDATE ON screening_upload FOR EACH ROW EXECUTE FUNCTION reject_change();
CREATE TRIGGER screening_prospect_kept_until_expiry BEFORE DELETE ON screening_prospect FOR EACH ROW EXECUTE FUNCTION screening_kept_until_expiry();
CREATE TRIGGER screening_upload_kept_until_expiry BEFORE DELETE ON screening_upload FOR EACH ROW EXECUTE FUNCTION screening_kept_until_expiry();
CREATE TRIGGER screening_run_kept_until_expiry BEFORE DELETE ON screening_run FOR EACH ROW EXECUTE FUNCTION screening_kept_until_expiry();
CREATE TRIGGER screening_prospect_no_truncate BEFORE TRUNCATE ON screening_prospect FOR EACH STATEMENT EXECUTE FUNCTION reject_change();
CREATE TRIGGER screening_upload_no_truncate BEFORE TRUNCATE ON screening_upload FOR EACH STATEMENT EXECUTE FUNCTION reject_change();
CREATE TRIGGER screening_run_no_truncate BEFORE TRUNCATE ON screening_run FOR EACH STATEMENT EXECUTE FUNCTION reject_change();
CREATE TRIGGER screening_result_no_truncate BEFORE TRUNCATE ON screening_result FOR EACH STATEMENT EXECUTE FUNCTION reject_change();

-- ---------------------------------------------------------------------------------------------------
-- What outlives a screening (audit #57, the founder's rulings of 2026-10-20): the counts-only outcome of every
-- screening, the frozen summary a converted or consenting prospect's screening keeps for 12 months, and the
-- campaign codes the founder lists
-- ---------------------------------------------------------------------------------------------------

-- The campaign codes a row may keep: campaigns the founder sends to many people, so a one-off code is never kept. A
-- listed code stays listed (no update, delete or truncate); listing one later does not reclassify the rows that
-- kept 'other'.
CREATE TABLE marketing_campaign (
  code text PRIMARY KEY CONSTRAINT marketing_campaign_code CHECK (code ~ '^[a-z0-9][a-z0-9._-]{0,63}$' AND code <> 'other'),
  -- What the listing's audit event names (marketing_campaign_registered's object), so the trail says which code was listed.
  id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  label text NOT NULL CONSTRAINT marketing_campaign_label CHECK (btrim(label) <> '' AND length(label) <= 120 AND label = btrim(label)),
  added_by uuid NOT NULL REFERENCES "user" (id),
  added_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER marketing_campaign_fixed BEFORE UPDATE OR DELETE ON marketing_campaign FOR EACH ROW EXECUTE FUNCTION reject_change();
CREATE TRIGGER marketing_campaign_no_truncate BEFORE TRUNCATE ON marketing_campaign FOR EACH STATEMENT EXECUTE FUNCTION reject_change();

-- A campaign code as a row keeps it (the founder's ruling of 2026-10-21): the code itself only when it is listed in
-- marketing_campaign as the row is written, 'other' for any other code, and null for none. A shape check cannot
-- catch a person's name typed inside a code ('jane-doe-follow-up' has a code's shape); the founder's list can. A code
-- listed later leaves a row that kept 'other' as it is: the code it was given was never stored.
CREATE FUNCTION marketing_campaign_kept(given text) RETURNS text
LANGUAGE sql STABLE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT CASE WHEN given IS NULL THEN NULL
              WHEN EXISTS (SELECT 1 FROM marketing_campaign c WHERE c.code = given) THEN given
              ELSE 'other' END
$$;

-- Every row that keeps a link's campaign code (screening_prospect, screening_lead and prospect_request, as
-- utm_campaign) keeps it through this trigger, as it is inserted and on any update that names the column, so no
-- write path stores a code the founder has not listed: the definer functions, the owner's own writes, and any role
-- that might be granted a write later (the trigger runs as the role writing, which must then also read the list, or
-- the write fails). A code of the wrong shape is refused before the column's CHECK can print the row, so no error
-- carries it; the web layer drops one before it gets here. On an update the table's immutability guard (the
-- tables' *_fixed and *_rules triggers) still refuses any change: a row's code is set once, as it is written.
CREATE FUNCTION marketing_campaign_listed_only() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NEW.utm_campaign !~ '^[a-z0-9][a-z0-9._-]{0,63}$' THEN
    RAISE EXCEPTION 'a campaign code is 1 to 64 lower-case letters, digits, dots, hyphens and underscores'
      USING ERRCODE = 'check_violation', CONSTRAINT = TG_TABLE_NAME || '_utm_campaign';
  END IF;
  NEW.utm_campaign := marketing_campaign_kept(NEW.utm_campaign);
  RETURN NEW;
END;
$$;
CREATE TRIGGER screening_prospect_campaign_listed BEFORE INSERT OR UPDATE OF utm_campaign ON screening_prospect
  FOR EACH ROW EXECUTE FUNCTION marketing_campaign_listed_only();

-- One row for every screening, a refused one included, written by the definer functions alone and kept with no end
-- date (the founder's ruling of 2026-10-20, Q6): its stage, the month, how the prospect heard of us, the channel, a
-- listed campaign, bands of its row counts, whole-percent shares of an allowed total it never holds, an anomaly band,
-- a dollar band whose narrowest step is $1,000, how soon it was first opened, whether an audit was requested, whether
-- an accepted screening followed a refused upload of the practice still kept (never flagged on the refused outcome,
-- which would tie its reasons to a later converted outcome), and the release. Never a name, an email, a ZIP, an exact count, a
-- date or a dollar figure, so the difference of two outcomes is never a cell of claim lines. It links to its
-- screening's upload while that is kept and is unlinked (upload_id null) when the screening expires or is replaced;
-- an unlinked outcome is sealed. No audit event names one.
CREATE TABLE screening_outcome (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The live screening's upload while it is kept; null once it expires or is replaced.
  upload_id uuid UNIQUE REFERENCES screening_upload (id) ON DELETE SET NULL,
  screened_month text NOT NULL CONSTRAINT screening_outcome_month CHECK (screened_month ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
  stage text NOT NULL CONSTRAINT screening_outcome_stage CHECK (stage IN ('refused', 'accepted', 'priced', 'failed')),
  source text CONSTRAINT screening_outcome_source CHECK (source IS NULL OR source IN (
    'search', 'billing_firm', 'colleague', 'association', 'event', 'social', 'paidwhole_email', 'article', 'other')),
  channel text NOT NULL CONSTRAINT screening_outcome_channel CHECK (channel IN ('none', 'email', 'paid_search', 'paid_social', 'social', 'partner', 'event', 'content', 'other')),
  -- A code from marketing_campaign when it is listed there at submission; 'other' when not; null with no campaign code
  -- (the prospect's utm_campaign as kept, and screening_outcome_campaign_listed() on every write).
  campaign text CONSTRAINT screening_outcome_campaign CHECK (campaign IS NULL OR campaign = 'other' OR campaign ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
  consented boolean NOT NULL DEFAULT false,
  row_band text NOT NULL CONSTRAINT screening_outcome_row_band CHECK (row_band IN ('none', '1_100', '101_1k', '1k_10k', '10k_50k', 'over_50k')),
  left_out_band text NOT NULL DEFAULT 'none' CONSTRAINT screening_outcome_left_out_band CHECK (left_out_band IN ('none', '1_100', '101_1k', '1k_10k', '10k_50k')),
  refusal_codes text[] NOT NULL DEFAULT '{}' CONSTRAINT screening_outcome_refusal_codes CHECK (screening_refusal_codes_valid(refusal_codes)),
  -- An accepted screening that followed a refused upload of the practice still kept (set as it is written).
  after_refusal boolean NOT NULL DEFAULT false,
  release_no integer CONSTRAINT screening_outcome_release CHECK (release_no > 0),
  engine_version text CONSTRAINT screening_outcome_engine CHECK (engine_version ~ '^[a-z0-9][a-z0-9./-]{0,31}$'),
  -- Whole percents (floored) of the file's allowed total: priced, cannot be priced without a contract, could not be
  -- priced (unpriced or rates change in the quarter), and not screened.
  priced_share_pct smallint CONSTRAINT screening_outcome_priced_share CHECK (priced_share_pct BETWEEN 0 AND 100),
  contract_share_pct smallint CONSTRAINT screening_outcome_contract_share CHECK (contract_share_pct BETWEEN 0 AND 100),
  could_not_price_share_pct smallint CONSTRAINT screening_outcome_could_not_price_share CHECK (could_not_price_share_pct BETWEEN 0 AND 100),
  not_screened_share_pct smallint CONSTRAINT screening_outcome_not_screened_share CHECK (not_screened_share_pct BETWEEN 0 AND 100),
  anomaly_band text CONSTRAINT screening_outcome_anomaly_band CHECK (anomaly_band IN ('none', '1_100', '101_1k', '1k_10k', '10k_50k')),
  anomaly_difference_band text CONSTRAINT screening_outcome_difference_band
    CHECK (anomaly_difference_band IN ('none', 'under_1k', '1k_to_10k', '10k_to_50k', '50k_to_250k', '250k_or_more')),
  first_open_band text CONSTRAINT screening_outcome_open_band CHECK (first_open_band IN ('same_day', '1_2_days', '3_7_days', '8_30_days')),
  converted boolean NOT NULL DEFAULT false,
  superseded boolean NOT NULL DEFAULT false,
  CONSTRAINT screening_outcome_refused CHECK ((stage = 'refused') = (cardinality(refusal_codes) > 0)
    AND (stage <> 'refused' OR (release_no IS NULL AND left_out_band = 'none' AND NOT consented AND NOT superseded))
    AND (NOT after_refusal OR stage <> 'refused')),
  CONSTRAINT screening_outcome_pinned CHECK ((stage = 'refused') = (release_no IS NULL)),
  CONSTRAINT screening_outcome_accepted_rows CHECK (stage = 'refused' OR row_band NOT IN ('none', 'over_50k')),
  CONSTRAINT screening_outcome_priced CHECK (
    (stage = 'priced') = (engine_version IS NOT NULL) AND (stage = 'priced') = (priced_share_pct IS NOT NULL)
    AND (stage = 'priced') = (contract_share_pct IS NOT NULL) AND (stage = 'priced') = (could_not_price_share_pct IS NOT NULL)
    AND (stage = 'priced') = (not_screened_share_pct IS NOT NULL) AND (stage = 'priced') = (anomaly_band IS NOT NULL)
    AND (stage = 'priced') = (anomaly_difference_band IS NOT NULL)),
  -- Each share floors, so the four sum to 97..100; all zero only when the file's allowed total is zero.
  CONSTRAINT screening_outcome_shares CHECK (stage <> 'priced'
    OR (priced_share_pct + contract_share_pct + could_not_price_share_pct + not_screened_share_pct BETWEEN 97 AND 100)
    OR (priced_share_pct + contract_share_pct + could_not_price_share_pct + not_screened_share_pct = 0)),
  CONSTRAINT screening_outcome_band CHECK (stage <> 'priced' OR (anomaly_band = 'none') = (anomaly_difference_band = 'none')),
  CONSTRAINT screening_outcome_opened CHECK (first_open_band IS NULL OR stage = 'priced'),
  CONSTRAINT screening_outcome_converted CHECK (NOT converted OR stage = 'priced')
);
CREATE INDEX screening_outcome_by_cohort ON screening_outcome (screened_month, source, channel, campaign);

-- An outcome keeps what it was written with; its link only goes (once); its stage moves only from accepted to priced
-- or failed, its figures set on the move to priced; its first open band is set once; its flags go from false to
-- true once; and once unlinked it is sealed.
CREATE FUNCTION screening_outcome_rules() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF OLD.upload_id IS NULL THEN
    RAISE EXCEPTION 'an outcome no longer linked to its screening is sealed' USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_outcome_sealed';
  END IF;
  IF (NEW.id, NEW.screened_month, NEW.source, NEW.channel, NEW.campaign, NEW.consented, NEW.row_band, NEW.left_out_band, NEW.refusal_codes, NEW.release_no, NEW.after_refusal)
     IS DISTINCT FROM (OLD.id, OLD.screened_month, OLD.source, OLD.channel, OLD.campaign, OLD.consented, OLD.row_band, OLD.left_out_band, OLD.refusal_codes, OLD.release_no, OLD.after_refusal) THEN
    RAISE EXCEPTION 'an outcome keeps what it was written with' USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_outcome_fixed';
  END IF;
  IF NEW.upload_id IS DISTINCT FROM OLD.upload_id AND NEW.upload_id IS NOT NULL THEN
    RAISE EXCEPTION 'an outcome''s link to its screening only goes' USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_outcome_fixed';
  END IF;
  IF NEW.stage IS DISTINCT FROM OLD.stage AND NOT (OLD.stage = 'accepted' AND NEW.stage IN ('priced', 'failed')) THEN
    RAISE EXCEPTION 'an outcome moves from accepted to priced or failed' USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_outcome_fixed';
  END IF;
  IF (NEW.engine_version, NEW.priced_share_pct, NEW.contract_share_pct, NEW.could_not_price_share_pct, NEW.not_screened_share_pct, NEW.anomaly_band, NEW.anomaly_difference_band)
     IS DISTINCT FROM (OLD.engine_version, OLD.priced_share_pct, OLD.contract_share_pct, OLD.could_not_price_share_pct, OLD.not_screened_share_pct, OLD.anomaly_band, OLD.anomaly_difference_band)
     AND NOT (OLD.stage = 'accepted' AND NEW.stage = 'priced') THEN
    RAISE EXCEPTION 'an outcome''s figures are set once, as it is priced' USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_outcome_fixed';
  END IF;
  IF NEW.first_open_band IS DISTINCT FROM OLD.first_open_band AND OLD.first_open_band IS NOT NULL THEN
    RAISE EXCEPTION 'an outcome''s first open is set once' USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_outcome_fixed';
  END IF;
  IF (OLD.converted AND NOT NEW.converted) OR (OLD.superseded AND NOT NEW.superseded) THEN
    RAISE EXCEPTION 'an outcome''s flags are set once' USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_outcome_fixed';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER screening_outcome_rules BEFORE UPDATE ON screening_outcome FOR EACH ROW EXECUTE FUNCTION screening_outcome_rules();
-- The outcome's campaign, as marketing_campaign_listed_only() keeps a utm_campaign: listed, 'other' or null.
CREATE FUNCTION screening_outcome_campaign_listed() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NEW.campaign !~ '^[a-z0-9][a-z0-9._-]{0,63}$' THEN
    RAISE EXCEPTION 'a campaign code is 1 to 64 lower-case letters, digits, dots, hyphens and underscores'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_outcome_campaign';
  END IF;
  NEW.campaign := marketing_campaign_kept(NEW.campaign);
  RETURN NEW;
END;
$$;
CREATE TRIGGER screening_outcome_campaign_listed BEFORE INSERT OR UPDATE OF campaign ON screening_outcome
  FOR EACH ROW EXECUTE FUNCTION screening_outcome_campaign_listed();
CREATE TRIGGER screening_outcome_kept BEFORE DELETE ON screening_outcome FOR EACH ROW EXECUTE FUNCTION reject_change();
CREATE TRIGGER screening_outcome_no_truncate BEFORE TRUNCATE ON screening_outcome FOR EACH STATEMENT EXECUTE FUNCTION reject_change();

-- The frozen summary of a converted or consenting prospect's screening, kept 12 months from the upload (the
-- founder's ruling of 2026-10-20, Q4), one for a practice at a time: the practice's name, state, ZIP and contact
-- address with how they heard of us, the release, the labels the result was shown under, and sums over the stored
-- rows (each of at least 11 claim lines, so every claim-line sum is 0 or at least 11); the left-out claim lines and
-- allowed amount only at 11 or more. A later screening of the practice replaces it at that screening's completion
-- and carries its audit request over. No patient: no phi_table_registry row; a business contact's personal data,
-- under the privacy notice.
CREATE TABLE screening_lead (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The live screening, while it is kept.
  upload_id uuid UNIQUE REFERENCES screening_upload (id) ON DELETE SET NULL,
  practice_name text NOT NULL CONSTRAINT screening_lead_practice_name
    CHECK (btrim(practice_name) <> '' AND length(practice_name) <= 200 AND practice_name = btrim(practice_name)),
  state text NOT NULL CONSTRAINT screening_lead_state CHECK (state IN (
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
    'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
    'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC', 'PR', 'VI', 'GU', 'AS', 'MP')),
  zip text NOT NULL CONSTRAINT screening_lead_zip CHECK (zip ~ '^[0-9]{5}$'),
  contact_email text NOT NULL CONSTRAINT screening_lead_contact_email
    CHECK (contact_email ~ '^[a-z0-9!#$%&''*+/=?^_`{|}~-]+(\.[a-z0-9!#$%&''*+/=?^_`{|}~-]+)*@[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
           AND length(contact_email) <= 254 AND strpos(contact_email, '@') <= 65 AND contact_email = lower(contact_email)),
  source text CONSTRAINT screening_lead_source CHECK (source IS NULL OR source IN (
    'search', 'billing_firm', 'colleague', 'association', 'event', 'social', 'paidwhole_email', 'article', 'other')),
  utm_source text CONSTRAINT screening_lead_utm_source CHECK (utm_source ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
  utm_medium text CONSTRAINT screening_lead_utm_medium CHECK (utm_medium ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
  utm_campaign text CONSTRAINT screening_lead_utm_campaign CHECK (utm_campaign ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
  paid_click text CONSTRAINT screening_lead_paid_click CHECK (paid_click IN ('paid_search', 'paid_social')),
  referring_firm text CONSTRAINT screening_lead_referring_firm
    CHECK (btrim(referring_firm) <> '' AND length(referring_firm) <= 200 AND referring_firm = btrim(referring_firm)),
  consent_sha256 text CONSTRAINT screening_lead_consent CHECK (consent_sha256 ~ '^[0-9a-f]{64}$'),
  -- The withdrawal (unsubscribe) link's token, stored only as its SHA-256; consent-based leads only (PR 6e).
  withdrawal_token_sha256 text UNIQUE CONSTRAINT screening_lead_withdrawal_token CHECK (withdrawal_token_sha256 ~ '^[0-9a-f]{64}$'),
  -- The reminder before deletion (PR 6e).
  reminder_sent_at timestamptz,
  prospect_request_id uuid UNIQUE REFERENCES prospect_request (id) ON DELETE CASCADE,
  release_no integer NOT NULL CONSTRAINT screening_lead_release CHECK (release_no > 0),
  release_manifest_sha256 text NOT NULL CONSTRAINT screening_lead_release_manifest CHECK (release_manifest_sha256 ~ '^[0-9a-f]{64}$'),
  engine_version text NOT NULL CONSTRAINT screening_lead_engine CHECK (engine_version ~ '^[a-z0-9][a-z0-9./-]{0,31}$'),
  labels_version text NOT NULL CONSTRAINT screening_lead_labels CHECK (labels_version ~ '^screening-labels/20[0-9]{2}-[0-9]{2}-[0-9]{2}$'),
  screened_at timestamptz NOT NULL,
  result_first_opened_at timestamptz,
  row_count integer NOT NULL CONSTRAINT screening_lead_row_count CHECK (row_count BETWEEN 1 AND 50000),
  claim_lines bigint NOT NULL CONSTRAINT screening_lead_claim_lines CHECK (claim_lines >= 11),
  observed_cents bigint NOT NULL CONSTRAINT screening_lead_observed CHECK (observed_cents >= 0),
  anomaly_rows integer NOT NULL CONSTRAINT screening_lead_anomaly_rows CHECK (anomaly_rows BETWEEN 0 AND 50000),
  left_out_rows integer NOT NULL CONSTRAINT screening_lead_left_out_rows CHECK (left_out_rows BETWEEN 0 AND 50000),
  -- Kept only at 11 or more; else null.
  left_out_claim_lines integer CONSTRAINT screening_lead_left_out_claim_lines CHECK (left_out_claim_lines >= 11),
  left_out_allowed_cents bigint CONSTRAINT screening_lead_left_out_allowed CHECK (left_out_allowed_cents >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CONSTRAINT screening_lead_basis CHECK (consent_sha256 IS NOT NULL OR prospect_request_id IS NOT NULL),
  CONSTRAINT screening_lead_consent_only CHECK (consent_sha256 IS NOT NULL OR (withdrawal_token_sha256 IS NULL AND reminder_sent_at IS NULL)),
  CONSTRAINT screening_lead_left_out CHECK ((left_out_claim_lines IS NULL) = (left_out_allowed_cents IS NULL)
    AND (left_out_claim_lines IS NULL OR left_out_rows > 0)),
  -- Frozen at 12 months; a withdrawal moves it to now() just before the lead is deleted.
  CONSTRAINT screening_lead_expiry CHECK (expires_at > screened_at AND expires_at <= screened_at + interval '12 months')
);
CREATE INDEX screening_lead_by_expiry ON screening_lead (expires_at);
CREATE INDEX screening_lead_by_contact ON screening_lead (contact_email);
CREATE INDEX screening_lead_by_practice ON screening_lead (zip, screening_practice_key(practice_name));

-- The same sums by payer product, each claim-line sum 0 or at least 11. The differences are not stored: a read
-- computes them as expected or lowest less observed.
CREATE TABLE screening_lead_product (
  lead_id uuid NOT NULL REFERENCES screening_lead (id) ON DELETE CASCADE,
  payer_product text NOT NULL CONSTRAINT screening_lead_product_payer_product
    CHECK (payer_product IN ('medicare_ffs', 'ma_noncontracted', 'ma_contracted', 'commercial', 'medicaid', 'other')),
  row_count integer NOT NULL CONSTRAINT screening_lead_product_row_count CHECK (row_count BETWEEN 1 AND 50000),
  claim_lines bigint NOT NULL CONSTRAINT screening_lead_product_claim_lines CHECK (claim_lines >= 11),
  observed_cents bigint NOT NULL CONSTRAINT screening_lead_product_observed CHECK (observed_cents >= 0),
  priced_rows integer NOT NULL DEFAULT 0 CONSTRAINT screening_lead_product_priced_rows CHECK (priced_rows >= 0),
  priced_claim_lines bigint NOT NULL DEFAULT 0,
  priced_observed_cents bigint NOT NULL DEFAULT 0 CONSTRAINT screening_lead_product_priced_observed CHECK (priced_observed_cents >= 0),
  -- Before the reduction across codes.
  expected_cents bigint NOT NULL DEFAULT 0 CONSTRAINT screening_lead_product_expected CHECK (expected_cents >= 0),
  -- Fully reduced for pooled rows, the one figure otherwise.
  lowest_cents bigint NOT NULL DEFAULT 0 CONSTRAINT screening_lead_product_lowest CHECK (lowest_cents >= 0),
  pooled_rows integer NOT NULL DEFAULT 0,
  anomaly_rows integer NOT NULL DEFAULT 0,
  could_not_price_rows integer NOT NULL DEFAULT 0,
  could_not_price_claim_lines bigint NOT NULL DEFAULT 0,
  could_not_price_observed_cents bigint NOT NULL DEFAULT 0 CONSTRAINT screening_lead_product_could_not_price_observed CHECK (could_not_price_observed_cents >= 0),
  PRIMARY KEY (lead_id, payer_product),
  CONSTRAINT screening_lead_product_cells CHECK ((priced_claim_lines = 0 OR priced_claim_lines >= 11)
    AND (could_not_price_claim_lines = 0 OR could_not_price_claim_lines >= 11)),
  CONSTRAINT screening_lead_product_medicare CHECK (payer_product IN ('medicare_ffs', 'ma_noncontracted')
    OR (priced_rows = 0 AND priced_claim_lines = 0 AND priced_observed_cents = 0 AND expected_cents = 0 AND lowest_cents = 0
        AND pooled_rows = 0 AND anomaly_rows = 0 AND could_not_price_rows = 0 AND could_not_price_claim_lines = 0 AND could_not_price_observed_cents = 0)),
  CONSTRAINT screening_lead_product_partition CHECK (payer_product NOT IN ('medicare_ffs', 'ma_noncontracted')
    OR (priced_rows + could_not_price_rows = row_count AND priced_claim_lines + could_not_price_claim_lines = claim_lines
        AND priced_observed_cents + could_not_price_observed_cents = observed_cents)),
  CONSTRAINT screening_lead_product_figures CHECK (lowest_cents <= expected_cents AND pooled_rows BETWEEN 0 AND priced_rows AND anomaly_rows BETWEEN 0 AND priced_rows)
);

-- A lead keeps what it was frozen with, but, each once: its link to the live screening goes; its first open, its
-- audit request, its withdrawal token's hash and its reminder are set; and a withdrawal moves its expiry to now.
CREATE FUNCTION screening_lead_rules() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF (NEW.id, NEW.practice_name, NEW.state, NEW.zip, NEW.contact_email, NEW.source, NEW.utm_source, NEW.utm_medium, NEW.utm_campaign, NEW.paid_click,
      NEW.referring_firm, NEW.consent_sha256, NEW.release_no, NEW.release_manifest_sha256, NEW.engine_version, NEW.labels_version, NEW.screened_at,
      NEW.row_count, NEW.claim_lines, NEW.observed_cents, NEW.anomaly_rows, NEW.left_out_rows, NEW.left_out_claim_lines, NEW.left_out_allowed_cents, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.practice_name, OLD.state, OLD.zip, OLD.contact_email, OLD.source, OLD.utm_source, OLD.utm_medium, OLD.utm_campaign, OLD.paid_click,
      OLD.referring_firm, OLD.consent_sha256, OLD.release_no, OLD.release_manifest_sha256, OLD.engine_version, OLD.labels_version, OLD.screened_at,
      OLD.row_count, OLD.claim_lines, OLD.observed_cents, OLD.anomaly_rows, OLD.left_out_rows, OLD.left_out_claim_lines, OLD.left_out_allowed_cents, OLD.created_at) THEN
    RAISE EXCEPTION 'a kept screening summary keeps what it was frozen with' USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_lead_fixed';
  END IF;
  IF (NEW.upload_id IS DISTINCT FROM OLD.upload_id AND NEW.upload_id IS NOT NULL)
     OR (NEW.result_first_opened_at IS DISTINCT FROM OLD.result_first_opened_at AND OLD.result_first_opened_at IS NOT NULL)
     OR (NEW.prospect_request_id IS DISTINCT FROM OLD.prospect_request_id AND OLD.prospect_request_id IS NOT NULL)
     OR (NEW.withdrawal_token_sha256 IS DISTINCT FROM OLD.withdrawal_token_sha256 AND OLD.withdrawal_token_sha256 IS NOT NULL)
     OR (NEW.reminder_sent_at IS DISTINCT FROM OLD.reminder_sent_at AND OLD.reminder_sent_at IS NOT NULL) THEN
    RAISE EXCEPTION 'a kept screening summary''s link goes once, and its first open, request, withdrawal token and reminder are each set once'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_lead_fixed';
  END IF;
  IF NEW.expires_at IS DISTINCT FROM OLD.expires_at AND NEW.expires_at > now() THEN
    RAISE EXCEPTION 'a kept screening summary''s expiry moves only to now, as it is withdrawn' USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_lead_fixed';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER screening_lead_rules BEFORE UPDATE ON screening_lead FOR EACH ROW EXECUTE FUNCTION screening_lead_rules();
CREATE TRIGGER screening_lead_campaign_listed BEFORE INSERT OR UPDATE OF utm_campaign ON screening_lead
  FOR EACH ROW EXECUTE FUNCTION marketing_campaign_listed_only();

-- A lead is deleted only once it expires (or is withdrawn, which moves its expiry to now), when a complete screening
-- of the same practice (the same ZIP and practice name, or the same contact address) was uploaded after it, which
-- replaces it, or when its audit request is gone (the cascade from the request's deletion, audit #51).
CREATE FUNCTION screening_lead_kept() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF OLD.expires_at <= now() THEN
    RETURN OLD;
  END IF;
  IF OLD.prospect_request_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM prospect_request q WHERE q.id = OLD.prospect_request_id) THEN
    RETURN OLD;
  END IF;
  IF EXISTS (SELECT 1 FROM screening_run r JOIN screening_upload u ON u.id = r.upload_id JOIN screening_prospect p ON p.id = u.prospect_id
              WHERE r.status = 'complete' AND u.created_at > OLD.screened_at
                AND (p.contact_email = OLD.contact_email OR (p.zip = OLD.zip AND screening_practice_key(p.practice_name) = screening_practice_key(OLD.practice_name)))) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'a kept screening summary is kept 12 months from its upload, until a later screening of the practice replaces it, or until it is withdrawn'
    USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_lead_kept';
END;
$$;
CREATE TRIGGER screening_lead_kept BEFORE DELETE ON screening_lead FOR EACH ROW EXECUTE FUNCTION screening_lead_kept();
CREATE TRIGGER screening_lead_no_truncate BEFORE TRUNCATE ON screening_lead FOR EACH STATEMENT EXECUTE FUNCTION reject_change();

-- A lead's product rows never change and go only with their lead.
CREATE FUNCTION screening_lead_product_kept() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM screening_lead l WHERE l.id = OLD.lead_id) THEN
    RAISE EXCEPTION 'a kept screening summary''s products go only with it' USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_lead_kept';
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER screening_lead_product_fixed BEFORE UPDATE ON screening_lead_product FOR EACH ROW EXECUTE FUNCTION reject_change();
CREATE TRIGGER screening_lead_product_kept BEFORE DELETE ON screening_lead_product FOR EACH ROW EXECUTE FUNCTION screening_lead_product_kept();
CREATE TRIGGER screening_lead_product_no_truncate BEFORE TRUNCATE ON screening_lead_product FOR EACH STATEMENT EXECUTE FUNCTION reject_change();

-- Every table forces row-level security; the owner's policy serves the definer functions below, and no other role
-- holds a privilege on any of them.
ALTER TABLE screening_prospect ENABLE ROW LEVEL SECURITY;
ALTER TABLE screening_prospect FORCE ROW LEVEL SECURITY;
CREATE POLICY screening_prospect_owner ON screening_prospect FOR ALL TO tp_owner USING (true) WITH CHECK (true);
ALTER TABLE screening_upload ENABLE ROW LEVEL SECURITY;
ALTER TABLE screening_upload FORCE ROW LEVEL SECURITY;
CREATE POLICY screening_upload_owner ON screening_upload FOR ALL TO tp_owner USING (true) WITH CHECK (true);
ALTER TABLE screening_place_of_service_split ENABLE ROW LEVEL SECURITY;
ALTER TABLE screening_place_of_service_split FORCE ROW LEVEL SECURITY;
CREATE POLICY screening_place_of_service_split_owner ON screening_place_of_service_split FOR ALL TO tp_owner USING (true) WITH CHECK (true);
ALTER TABLE screening_run ENABLE ROW LEVEL SECURITY;
ALTER TABLE screening_run FORCE ROW LEVEL SECURITY;
CREATE POLICY screening_run_owner ON screening_run FOR ALL TO tp_owner USING (true) WITH CHECK (true);
ALTER TABLE screening_result ENABLE ROW LEVEL SECURITY;
ALTER TABLE screening_result FORCE ROW LEVEL SECURITY;
CREATE POLICY screening_result_owner ON screening_result FOR ALL TO tp_owner USING (true) WITH CHECK (true);
ALTER TABLE screening_outcome ENABLE ROW LEVEL SECURITY;
ALTER TABLE screening_outcome FORCE ROW LEVEL SECURITY;
CREATE POLICY screening_outcome_owner ON screening_outcome FOR ALL TO tp_owner USING (true) WITH CHECK (true);
ALTER TABLE screening_lead ENABLE ROW LEVEL SECURITY;
ALTER TABLE screening_lead FORCE ROW LEVEL SECURITY;
CREATE POLICY screening_lead_owner ON screening_lead FOR ALL TO tp_owner USING (true) WITH CHECK (true);
ALTER TABLE screening_lead_product ENABLE ROW LEVEL SECURITY;
ALTER TABLE screening_lead_product FORCE ROW LEVEL SECURITY;
CREATE POLICY screening_lead_product_owner ON screening_lead_product FOR ALL TO tp_owner USING (true) WITH CHECK (true);
ALTER TABLE marketing_campaign ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_campaign FORCE ROW LEVEL SECURITY;
CREATE POLICY marketing_campaign_owner ON marketing_campaign FOR ALL TO tp_owner USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------------------------------
-- prospect_request (migration 20261030090000, applied; nothing in it is edited): attribution, whether it came from a
-- screening, and why a declined request was declined. Every CHECK here uses built-ins alone, because the application
-- role updates the table directly (the console's review), and a CHECK calling a function needs EXECUTE on it on every
-- update (the bug migration 20261030110000 fixed for prospect_payers_valid; ADR 0053).
-- ---------------------------------------------------------------------------------------------------

ALTER TABLE prospect_request
  ADD COLUMN source text CONSTRAINT prospect_request_source CHECK (source IS NULL OR source IN (
    'search', 'billing_firm', 'colleague', 'association', 'event', 'social', 'paidwhole_email', 'article', 'other')),
  ADD COLUMN utm_source text CONSTRAINT prospect_request_utm_source CHECK (utm_source ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
  ADD COLUMN utm_medium text CONSTRAINT prospect_request_utm_medium CHECK (utm_medium ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
  ADD COLUMN utm_campaign text CONSTRAINT prospect_request_utm_campaign CHECK (utm_campaign ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
  ADD COLUMN paid_click text CONSTRAINT prospect_request_paid_click CHECK (paid_click IN ('paid_search', 'paid_social')),
  ADD COLUMN referring_firm text CONSTRAINT prospect_request_referring_firm
    CHECK (btrim(referring_firm) <> '' AND length(referring_firm) <= 200 AND referring_firm = btrim(referring_firm)),
  -- The request came from a screening's result (convert_screening()).
  ADD COLUMN from_screening boolean NOT NULL DEFAULT false,
  -- Why a declined request was declined (PROSPECT_DECLINED_REASONS): required on the console's decline;
  -- 'not_recorded' for a request declined before this migration, or by the previous image, and never offered.
  ADD COLUMN declined_reason text CONSTRAINT prospect_request_declined_reason CHECK (declined_reason IS NULL OR declined_reason IN (
    'no_response', 'not_now', 'price', 'too_little_to_recover', 'chose_other', 'doing_it_themselves', 'data_unavailable',
    'compliance_declined', 'not_a_fit', 'not_a_prospect', 'other', 'not_recorded'));

-- A request's own fields, its attribution and whether it came from a screening never change once received; only its
-- review moves, and a converted or declined request's status (and a declined one's reason) are fixed. A move to
-- declined without a reason (the previous image's decline) records 'not_recorded', and a decline that names
-- 'not_recorded' itself is refused, so that reason only ever means a decline before this migration or by the previous
-- image. One exception, for the backfill below: a request declined before this migration takes 'not_recorded' as its
-- reason with nothing else changed, and keeps when it was reviewed. Built-ins only: it runs as the application role.
CREATE OR REPLACE FUNCTION prospect_request_fixed() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF (NEW.id, NEW.contact_name, NEW.contact_email, NEW.organization_name, NEW.locations, NEW.payers, NEW.billing_arrangement, NEW.created_at,
      NEW.source, NEW.utm_source, NEW.utm_medium, NEW.utm_campaign, NEW.paid_click, NEW.referring_firm, NEW.from_screening)
     IS DISTINCT FROM (OLD.id, OLD.contact_name, OLD.contact_email, OLD.organization_name, OLD.locations, OLD.payers, OLD.billing_arrangement, OLD.created_at,
      OLD.source, OLD.utm_source, OLD.utm_medium, OLD.utm_campaign, OLD.paid_click, OLD.referring_firm, OLD.from_screening) THEN
    RAISE EXCEPTION 'a prospect request is kept as it was received' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status = 'declined' AND OLD.declined_reason IS NULL AND NEW.declined_reason = 'not_recorded'
     AND (NEW.status, NEW.organization_id, NEW.reviewed_by, NEW.reviewed_at) IS NOT DISTINCT FROM (OLD.status, OLD.organization_id, OLD.reviewed_by, OLD.reviewed_at) THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'converted' THEN
    RAISE EXCEPTION 'a converted request names its organization for good' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status = 'declined' AND (NEW.status, NEW.declined_reason) IS DISTINCT FROM (OLD.status, OLD.declined_reason) THEN
    RAISE EXCEPTION 'a declined request keeps its status and its reason' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status = 'declined' AND OLD.status <> 'declined' THEN
    IF NEW.declined_reason = 'not_recorded' THEN
      RAISE EXCEPTION 'a decline names its reason from the list; not recorded is only the previous image''s' USING ERRCODE = 'check_violation', CONSTRAINT = 'prospect_request_declined_reason';
    END IF;
    IF NEW.declined_reason IS NULL THEN
      NEW.declined_reason := 'not_recorded';
    END IF;
  END IF;
  NEW.reviewed_at := now();
  RETURN NEW;
END;
$$;

UPDATE prospect_request SET declined_reason = 'not_recorded' WHERE status = 'declined';

ALTER TABLE prospect_request ADD CONSTRAINT prospect_request_declined CHECK ((status = 'declined') = (declined_reason IS NOT NULL));

-- A request keeps its campaign code only when the founder lists it (marketing_campaign_listed_only(), the founder's
-- ruling of 2026-10-21), whether submit_prospect_request() or convert_screening() writes it. The trigger fires on an
-- insert and on an update that names utm_campaign alone: the application role's review updates name only the columns
-- it is granted (status, organization_id, reviewed_by, declined_reason), so they never fire it and need no read of
-- the list, and an update that names the column meets prospect_request_fixed(), which refuses any change to it.
CREATE TRIGGER prospect_request_campaign_listed BEFORE INSERT OR UPDATE OF utm_campaign ON prospect_request
  FOR EACH ROW EXECUTE FUNCTION marketing_campaign_listed_only();

-- ---------------------------------------------------------------------------------------------------
-- The public form (tp_app)
-- ---------------------------------------------------------------------------------------------------

-- The split in force: the latest approval.
CREATE FUNCTION screening_split_in_force() RETURNS uuid LANGUAGE sql STABLE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT s.id FROM screening_place_of_service_split s ORDER BY s.approved_at DESC, s.id DESC LIMIT 1
$$;

-- Whether screening is open: the release in force and the split in force, or nulls when either is missing
-- (production stays closed until release 1 is published).
CREATE FUNCTION screening_status() RETURNS TABLE (release_no integer, place_of_service_split_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT CASE WHEN o.split IS NULL THEN NULL ELSE o.release END, CASE WHEN o.release IS NULL THEN NULL ELSE o.split END
    FROM (SELECT current_rule_release() AS release, screening_split_in_force() AS split) o
$$;

-- Whether the release in force maps the five-digit ZIP to a locality, and whether it needs the ZIP+4 to (such a ZIP
-- is refused: the engine takes a five-digit ZIP alone).
CREATE FUNCTION screening_zip_status(zip5 text) RETURNS TABLE (known boolean, plus_four_required boolean)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT count(*) > 0, coalesce(bool_or((r.value ->> 'plus_four_required')::boolean), false)
    FROM rule_record r
   WHERE r.release_no = current_rule_release() AND r.record_type = 'locality_map' AND r.key = jsonb_build_object('zip', zip5)
$$;

-- An accepted upload: the prospect, the upload (the SHA-256 of its rows, computed here, its row count, and the rows of
-- fewer than 11 claim lines the browser left out, as three numbers), a queued run pinned to the release and the split
-- in force, and every row, decoded and checked by the server; the arrays are the rows' columns in order (modifier sets
-- space-joined, '' for none). Returns the run. A ZIP the release maps to no locality, or to one that needs its ZIP+4,
-- is refused. The tables' CHECKs and the row key's uniqueness hold the rest (a row of fewer than 11 claim lines among
-- them); nothing in an error names a value. The upload replaces any earlier accepted screening of the same practice
-- (the same ZIP and practice name, or the same contact address): that one is deleted with its upload, run and rows,
-- each an audit event (screening_replaced), so a practice never has two screenings held at once to be subtracted.
-- The prospect keeps how they heard of us, the campaign codes and kind of paid click of the attribution cookie (its
-- campaign code only when the founder lists it, 'other' otherwise), the referring firm, and the SHA-256s of the consent and terms wording accepted (null for none). Its counts-only outcome
-- is written here (accepted, its bands and channel computed here, and whether a refused upload of the practice is
-- still kept: after_refusal), and the outcomes of the screenings it replaces are marked superseded before they are
-- deleted; a refused outcome is never changed. Kept summaries (screening_lead) are not touched here: a later screening
-- replaces one at its completion. The screenings it replaces are locked first, each prospect and then each run, in id
-- order, before their outcomes and their deletion: the order the expiry job takes (prospect, run, outcome) and, from
-- the run on, the order a conversion, the result's opened signal, a completion and a failure take (run, outcome, then
-- the upload), so a submission never deadlocks with them.
CREATE FUNCTION submit_screening(practice text, state_code text, zip5 text, email text, codes text[], modifier_sets text[],
  unit_counts integer[], places text[], products text[], bands text[], allowed_cents bigint[], claim_counts integer[],
  rows_left_out integer, claim_lines_left_out integer, allowed_cents_left_out bigint, heard_from text, campaign_source text,
  campaign_medium text, campaign_name text, click_kind text, firm text, consent_sha256 text, terms_sha256 text, request text) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  in_force integer := current_rule_release();
  manifest text;
  split uuid := screening_split_in_force();
  zip_known boolean;
  plus_four boolean;
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
  SELECT z.known, z.plus_four_required INTO zip_known, plus_four FROM screening_zip_status(zip5) z;
  IF NOT zip_known THEN
    RAISE EXCEPTION 'the rule release in force maps no locality for this ZIP code' USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_zip_unknown';
  END IF;
  IF plus_four THEN
    RAISE EXCEPTION 'this ZIP code spans two localities, and the engine takes a five-digit ZIP alone' USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_zip_plus_four';
  END IF;
  IF n NOT BETWEEN 1 AND 50000
     OR array_ndims(codes) <> 1 OR array_ndims(modifier_sets) IS DISTINCT FROM 1 OR array_ndims(unit_counts) IS DISTINCT FROM 1
     OR array_ndims(places) IS DISTINCT FROM 1 OR array_ndims(products) IS DISTINCT FROM 1 OR array_ndims(bands) IS DISTINCT FROM 1
     OR array_ndims(allowed_cents) IS DISTINCT FROM 1 OR array_ndims(claim_counts) IS DISTINCT FROM 1
     OR cardinality(modifier_sets) <> n OR cardinality(unit_counts) <> n OR cardinality(places) <> n OR cardinality(products) <> n
     OR cardinality(bands) <> n OR cardinality(allowed_cents) <> n OR cardinality(claim_counts) <> n THEN
    RAISE EXCEPTION 'a screening is 1 to 50,000 rows, every column with a value for each' USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_rows';
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
    INSERT INTO screening_prospect (practice_name, state, zip, contact_email, source, utm_source, utm_medium, utm_campaign, paid_click, referring_firm,
                                    followup_consent_sha256, screening_terms_sha256)
    VALUES (btrim(practice), state_code, zip5, lower(btrim(email)), heard_from, campaign_source, campaign_medium, campaign_name, click_kind, firm,
            consent_sha256, terms_sha256)
    RETURNING id, utm_campaign
  ), upload AS (
    INSERT INTO screening_upload (prospect_id, rows_sha256, row_count, status, left_out_rows, left_out_claim_lines, left_out_allowed_cents)
    SELECT prospect.id, rows_hash, n, 'accepted', rows_left_out, claim_lines_left_out, allowed_cents_left_out FROM prospect
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

-- A refused upload: the prospect and the upload with its row count and reasons (codes, positions and kinds only); no
-- hash, since the rows refused can hold the row the floor withholds, and no run. Nothing is recorded while screening
-- is closed. It replaces nothing: it holds no row. The prospect keeps its attribution as an accepted one does, and the
-- refusal its counts-only outcome: refused, the band of its row count and the sorted, distinct codes of its reasons
-- (never a row, a column or a field).
CREATE FUNCTION reject_screening_upload(practice text, state_code text, zip5 text, email text, row_count integer, reasons jsonb, heard_from text,
  campaign_source text, campaign_medium text, campaign_name text, click_kind text, firm text, terms_sha256 text, request text)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  created uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM screening_status() o WHERE o.release_no IS NOT NULL AND o.place_of_service_split_id IS NOT NULL) THEN
    RAISE EXCEPTION 'screening is closed until a rule release is in force and a place-of-service split is approved'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_closed';
  END IF;
  -- The campaign code as kept (listed, 'other' or null; marketing_campaign_listed_only()), the outcome's too.
  WITH prospect AS (
    INSERT INTO screening_prospect (practice_name, state, zip, contact_email, source, utm_source, utm_medium, utm_campaign, paid_click, referring_firm,
                                    screening_terms_sha256)
    VALUES (btrim(practice), state_code, zip5, lower(btrim(email)), heard_from, campaign_source, campaign_medium, campaign_name, click_kind, firm, terms_sha256)
    RETURNING id, utm_campaign
  ), upload AS (
    INSERT INTO screening_upload (prospect_id, row_count, status, rejection_reasons)
    SELECT prospect.id, $5, 'rejected', reasons FROM prospect
    RETURNING id
  ), outcome AS (
    INSERT INTO screening_outcome (upload_id, screened_month, stage, source, channel, campaign, row_band, refusal_codes)
    SELECT upload.id, to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM'), 'refused', heard_from, marketing_channel(campaign_medium, click_kind), prospect.utm_campaign,
           screening_count_band($5),
           ARRAY(SELECT d.code FROM (SELECT DISTINCT r ->> 'code' AS code FROM jsonb_array_elements(CASE WHEN jsonb_typeof(reasons) = 'array' THEN reasons ELSE '[]'::jsonb END) r) d
                  ORDER BY d.code COLLATE "C")
      FROM upload, prospect
    RETURNING id
  )
  INSERT INTO audit_event (actor_kind, action, object_type, object_id, purpose, request_id)
  SELECT 'system', 'screening_rejected', 'screening_upload', upload.id, 'screening', request FROM upload, outcome
  RETURNING object_id INTO created;
  RETURN created;
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- The result link (tp_app): each read answers only for a complete run before it expires, by the SHA-256 of the
-- link's token, and computes every figure here as bigint sums of the stored rows.
-- ---------------------------------------------------------------------------------------------------

-- Where an allowed total stands against a row's (or a group's summed) figures, the owner's ruling of 2026-10-18:
-- 'anomaly' when it is more than $5 a claim line (ADR 0038's default threshold, exceeded) below the lowest figure,
-- the fully reduced one for a code in the reduction across codes and the one figure otherwise; 'at_or_above' at or
-- above the figure before that reduction; 'within_reduction_range' from the fully reduced figure up to below the
-- figure before the reduction; and 'below_by_threshold_or_less' below the lowest figure by $5 a claim line or less.
-- A SQL-standard body (RETURN), so PostgreSQL parses it once, here, binding its operators to pg_catalog's whatever
-- search_path a caller has, and inlines it into each query that calls it: the reads below call it for every row and
-- every group (50,000 rows and 20,507 groups at the capacity test's worst shape), and a function with its own SET
-- search_path is never inlined, so each call ran through the function executor (466 ms a ranking of the worst shape,
-- 197 ms inlined; measured on PostgreSQL 18, result-page.large.db.test.ts). The same CASE, the same answers.
CREATE FUNCTION screening_standing(expected bigint, reduced bigint, observed bigint, claim_lines bigint) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
RETURN CASE
         WHEN coalesce(reduced, expected) - observed > 500 * claim_lines THEN 'anomaly'
         WHEN observed >= expected THEN 'at_or_above'
         WHEN reduced IS NOT NULL AND observed >= reduced THEN 'within_reduction_range'
         ELSE 'below_by_threshold_or_less'
       END;

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
  converted boolean, release_withdrawn boolean, kept_with text)
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
                     FROM screening_lead l WHERE l.upload_id = r.upload_id), 'none')
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

-- The priced rows by payer product and code, each group numbered in the order the result page lists them: the largest
-- difference from the lowest figures first, then by payer product and code, so the order is total and the same on
-- every read. The figure before the reduction across codes is summed, and the lowest figures (each row's: the fully
-- reduced figure for a pooled row, the one figure otherwise). A group is an anomaly when one of its rows is
-- (screening_standing(), row by row: more than $5 a claim line below its lowest figure), and says how many; otherwise
-- its standing is its sums'. Neither is ever computed outside these sums of the engine's figures. It answers only for a
-- complete run before it expires. Called only inside the two definer functions below (no grant), so it runs as the
-- owner.
CREATE FUNCTION screening_result_ranked_groups(token_sha256 text)
RETURNS TABLE (group_no integer, payer_product text, procedure_code text, rows integer, claim_lines bigint, expected_cents bigint, lowest_cents bigint,
  observed_cents bigint, difference_cents bigint, lowest_difference_cents bigint, in_reduction_pool boolean, anomaly_rows integer, standing text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT (row_number() OVER (ORDER BY g.lowest_difference DESC, g.product COLLATE "C", g.code COLLATE "C"))::integer,
         g.product, g.code, g.row_total, g.claims, g.expected, g.lowest, g.observed, g.difference, g.lowest_difference, g.pooled, g.anomalies,
         CASE WHEN g.anomalies > 0 THEN 'anomaly' ELSE screening_standing(g.expected, CASE WHEN g.pooled THEN g.lowest END, g.observed, g.claims) END
    FROM (SELECT s.payer_product AS product, s.procedure_code AS code, count(*)::integer AS row_total, sum(s.claim_count)::bigint AS claims,
                 sum(s.expected_cents)::bigint AS expected, sum(coalesce(s.reduced_cents, s.expected_cents))::bigint AS lowest,
                 sum(s.observed_allowed_cents)::bigint AS observed, sum(s.difference_cents)::bigint AS difference,
                 sum(coalesce(s.reduced_difference_cents, s.difference_cents))::bigint AS lowest_difference,
                 bool_or(s.in_reduction_pool) AS pooled,
                 (count(*) FILTER (WHERE screening_standing(s.expected_cents, s.reduced_cents, s.observed_allowed_cents, s.claim_count) = 'anomaly'))::integer AS anomalies
            FROM screening_run r JOIN screening_result s ON s.run_id = r.id
           WHERE r.result_token_sha256 = $1 AND r.status = 'complete' AND now() < r.expires_at AND s.disposition = 'priced'
           GROUP BY s.payer_product, s.procedure_code) g
$$;

-- One page of those groups, in their order: pages numbered from 1, at most 100 groups a page (per_page is held to 1 to
-- 100), and a page past the last is empty. The result page reads one page at a time, so what it holds is bounded
-- whatever the result's size (the capacity test's worst shape has 20,507 groups, audit #53 part 1). The fully reduced
-- sums are given only for a group with a row in the reduction across codes.
CREATE FUNCTION screening_result_groups(token_sha256 text, page integer, per_page integer)
RETURNS TABLE (group_no integer, payer_product text, procedure_code text, rows integer, claim_lines bigint, expected_cents bigint, reduced_cents bigint,
  observed_cents bigint, difference_cents bigint, reduced_difference_cents bigint, in_reduction_pool boolean, anomaly_rows integer, anomaly boolean,
  standing text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT g.group_no, g.payer_product, g.procedure_code, g.rows, g.claim_lines, g.expected_cents, CASE WHEN g.in_reduction_pool THEN g.lowest_cents END,
         g.observed_cents, g.difference_cents, CASE WHEN g.in_reduction_pool THEN g.lowest_difference_cents END, g.in_reduction_pool, g.anomaly_rows,
         g.anomaly_rows > 0, g.standing
    FROM screening_result_ranked_groups($1) g
   CROSS JOIN (SELECT greatest(coalesce($2, 1), 1)::bigint AS page, least(greatest(coalesce($3, 0), 1), 100)::bigint AS size) p
   WHERE g.group_no > (p.page - 1) * p.size AND g.group_no <= p.page * p.size
   ORDER BY g.group_no
$$;

-- What the result page says of every group, and of the groups a page of screening_result_groups() does not show (its
-- arguments; a page past the last is taken as the last): how many groups, how many are anomalies and how many are within
-- the range of the reduction across codes; the page's size, how many pages, the page shown and its first and last
-- group (0 and 0 with no group); and the groups not on that page: how many, how many are anomalies, and their rows,
-- claim lines and summed figures, the lowest figures summed as the result's summary sums them (the fully reduced figure
-- for a pooled row, the one figure otherwise). Every figure is a bigint sum here. Nothing for a link that is unknown,
-- expired or not complete.
CREATE FUNCTION screening_result_group_totals(token_sha256 text, page integer, per_page integer)
RETURNS TABLE (groups integer, anomaly_groups integer, within_reduction_groups integer, page_size integer, pages integer, page_no integer,
  first_group integer, last_group integer, other_groups integer, other_anomaly_groups integer, other_rows integer, other_claim_lines bigint,
  other_expected_cents bigint, other_lowest_cents bigint, other_observed_cents bigint, other_difference_cents bigint, other_lowest_difference_cents bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  WITH ranked AS MATERIALIZED (SELECT * FROM screening_result_ranked_groups($1)),
       sized AS (SELECT (SELECT count(*) FROM ranked)::integer AS total, least(greatest(coalesce($3, 0), 1), 100) AS size),
       shown AS (SELECT z.total, z.size, greatest((z.total + z.size - 1) / z.size, 1) AS pages,
                        least(greatest(coalesce($2, 1), 1), greatest((z.total + z.size - 1) / z.size, 1)) AS page
                   FROM sized z),
       placed AS (SELECT r.*, (r.group_no <= (s.page - 1) * s.size OR r.group_no > s.page * s.size) AS other FROM ranked r CROSS JOIN shown s)
  SELECT s.total, (SELECT count(*) FROM placed p WHERE p.standing = 'anomaly')::integer,
         (SELECT count(*) FROM placed p WHERE p.standing = 'within_reduction_range')::integer,
         s.size, s.pages, s.page, least((s.page - 1) * s.size + 1, s.total), least(s.page * s.size, s.total),
         o.groups, o.anomalies, o.row_total, o.claims, o.expected, o.lowest, o.observed, o.difference, o.lowest_difference
    FROM shown s
   CROSS JOIN (SELECT count(*)::integer AS groups, (count(*) FILTER (WHERE p.standing = 'anomaly'))::integer AS anomalies,
                      coalesce(sum(p.rows), 0)::integer AS row_total, coalesce(sum(p.claim_lines), 0)::bigint AS claims,
                      coalesce(sum(p.expected_cents), 0)::bigint AS expected, coalesce(sum(p.lowest_cents), 0)::bigint AS lowest,
                      coalesce(sum(p.observed_cents), 0)::bigint AS observed, coalesce(sum(p.difference_cents), 0)::bigint AS difference,
                      coalesce(sum(p.lowest_difference_cents), 0)::bigint AS lowest_difference
                 FROM placed p WHERE p.other) o
   WHERE EXISTS (SELECT 1 FROM screening_run r WHERE r.result_token_sha256 = $1 AND r.status = 'complete' AND now() < r.expires_at)
$$;

-- Every row by payer product and what became of it (and why a row could not be priced).
CREATE FUNCTION screening_result_coverage(token_sha256 text)
RETURNS TABLE (payer_product text, disposition text, unpriced_reason text, unpriced_detail text, rows integer, claim_lines bigint, observed_cents bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT s.payer_product, s.disposition, s.unpriced_reason, s.unpriced_detail, count(*)::integer, sum(s.claim_count)::bigint, sum(s.observed_allowed_cents)::bigint
    FROM screening_run r JOIN screening_result s ON s.run_id = r.id
   WHERE r.result_token_sha256 = token_sha256 AND r.status = 'complete' AND now() < r.expires_at
   GROUP BY s.payer_product, s.disposition, s.unpriced_reason, s.unpriced_detail
   ORDER BY s.payer_product, s.disposition, s.unpriced_reason NULLS FIRST, s.unpriced_detail NULLS FIRST
$$;

-- At most the top 100 priced rows, the largest difference from the row's lowest figure first, each with both figures
-- where it has two and its standing (screening_standing()).
CREATE FUNCTION screening_result_rows(token_sha256 text, top integer)
RETURNS TABLE (row_no integer, procedure_code text, modifiers text[], units integer, place_of_service text, payer_product text, service_band text,
  claim_count integer, observed_allowed_cents bigint, expected_line_cents bigint, expected_cents bigint, difference_cents bigint, in_reduction_pool boolean,
  reduced_line_cents bigint, reduced_cents bigint, reduced_difference_cents bigint, standing text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT s.row_no, s.procedure_code, s.modifiers, s.units, s.place_of_service, s.payer_product, s.service_band, s.claim_count, s.observed_allowed_cents,
         s.expected_line_cents, s.expected_cents, s.difference_cents, s.in_reduction_pool, s.reduced_line_cents, s.reduced_cents, s.reduced_difference_cents,
         screening_standing(s.expected_cents, s.reduced_cents, s.observed_allowed_cents, s.claim_count)
    FROM screening_run r JOIN screening_result s ON s.run_id = r.id
   WHERE r.result_token_sha256 = token_sha256 AND r.status = 'complete' AND now() < r.expires_at AND s.disposition = 'priced'
   ORDER BY coalesce(s.reduced_difference_cents, s.difference_cents) DESC, s.row_no
   LIMIT least(greatest(coalesce(top, 0), 0), 100)
$$;

-- The frozen summary of a run's screening (screening_lead and its product rows), kept 12 months from the upload with
-- the audit request given or the prospect's consent: bigint sums over the stored rows, with the filters of
-- screening_result_summary() and screening_result_coverage(); the prospect's practice, state, ZIP, contact address,
-- consent and attribution; the run's release, manifest, engine and first open; the labels' version; and of what the
-- browser left out, the row count, and the claim lines and allowed amount only at 11 or more. The prospect's consent
-- is kept only with keep_consent, the completion's (with the withdrawal token's hash it needs: a consent lead without
-- one is refused); a conversion's summary is kept on its request alone, so a prospect who withdrew their consent can
-- still request an audit, and the consent they withdrew is never kept again. Called only inside the definer functions
-- below (no grant), so it runs as the owner. Returns the lead.
CREATE FUNCTION screening_freeze_lead(run uuid, request_id uuid, withdrawal_token_sha256 text, keep_consent boolean, request text) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  target screening_run%ROWTYPE;
  prospect screening_prospect%ROWTYPE;
  upload screening_upload%ROWTYPE;
  created uuid;
BEGIN
  SELECT r.* INTO target FROM screening_run r WHERE r.id = $1 AND r.status = 'complete';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'a screening summary is kept from a complete run' USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_lead_basis';
  END IF;
  SELECT u.* INTO upload FROM screening_upload u WHERE u.id = target.upload_id;
  SELECT p.* INTO prospect FROM screening_prospect p WHERE p.id = upload.prospect_id;
  IF $4 AND prospect.followup_consent_sha256 IS NOT NULL AND $3 IS NULL THEN
    RAISE EXCEPTION 'a summary kept by consent has a withdrawal link' USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_lead_withdrawal_token';
  END IF;
  INSERT INTO screening_lead (upload_id, practice_name, state, zip, contact_email, source, utm_source, utm_medium, utm_campaign, paid_click, referring_firm,
                              consent_sha256, withdrawal_token_sha256, prospect_request_id, release_no, release_manifest_sha256, engine_version, labels_version,
                              screened_at, result_first_opened_at, row_count, claim_lines, observed_cents, anomaly_rows, left_out_rows, left_out_claim_lines,
                              left_out_allowed_cents, expires_at)
  SELECT upload.id, prospect.practice_name, prospect.state, prospect.zip, prospect.contact_email, prospect.source, prospect.utm_source, prospect.utm_medium,
         prospect.utm_campaign, prospect.paid_click, prospect.referring_firm, CASE WHEN $4 THEN prospect.followup_consent_sha256 END,
         CASE WHEN $4 AND prospect.followup_consent_sha256 IS NOT NULL THEN $3 END, $2, target.release_no, target.release_manifest_sha256,
         target.engine_version, screening_labels_version(), upload.created_at, target.first_opened_at, t.all_rows, t.all_claims, t.all_observed, t.anomalies,
         upload.left_out_rows,
         CASE WHEN upload.left_out_claim_lines >= 11 THEN upload.left_out_claim_lines END,
         CASE WHEN upload.left_out_claim_lines >= 11 THEN upload.left_out_allowed_cents END,
         upload.created_at + interval '12 months'
    FROM (SELECT count(*)::integer AS all_rows, coalesce(sum(s.claim_count), 0)::bigint AS all_claims, coalesce(sum(s.observed_allowed_cents), 0)::bigint AS all_observed,
                 (count(*) FILTER (WHERE s.disposition = 'priced'
                                     AND screening_standing(s.expected_cents, s.reduced_cents, s.observed_allowed_cents, s.claim_count) = 'anomaly'))::integer AS anomalies
            FROM screening_result s WHERE s.run_id = target.id) t
  RETURNING id INTO created;
  INSERT INTO screening_lead_product (lead_id, payer_product, row_count, claim_lines, observed_cents, priced_rows, priced_claim_lines, priced_observed_cents,
                                      expected_cents, lowest_cents, pooled_rows, anomaly_rows, could_not_price_rows, could_not_price_claim_lines,
                                      could_not_price_observed_cents)
  SELECT created, s.payer_product, count(*)::integer, sum(s.claim_count)::bigint, sum(s.observed_allowed_cents)::bigint,
         count(*) FILTER (WHERE s.disposition = 'priced')::integer,
         coalesce(sum(s.claim_count) FILTER (WHERE s.disposition = 'priced'), 0)::bigint,
         coalesce(sum(s.observed_allowed_cents) FILTER (WHERE s.disposition = 'priced'), 0)::bigint,
         coalesce(sum(s.expected_cents) FILTER (WHERE s.disposition = 'priced'), 0)::bigint,
         coalesce(sum(coalesce(s.reduced_cents, s.expected_cents)) FILTER (WHERE s.disposition = 'priced'), 0)::bigint,
         count(*) FILTER (WHERE s.disposition = 'priced' AND s.in_reduction_pool)::integer,
         count(*) FILTER (WHERE s.disposition = 'priced' AND screening_standing(s.expected_cents, s.reduced_cents, s.observed_allowed_cents, s.claim_count) = 'anomaly')::integer,
         count(*) FILTER (WHERE s.disposition IN ('unpriced', 'rates_change_in_band'))::integer,
         coalesce(sum(s.claim_count) FILTER (WHERE s.disposition IN ('unpriced', 'rates_change_in_band')), 0)::bigint,
         coalesce(sum(s.observed_allowed_cents) FILTER (WHERE s.disposition IN ('unpriced', 'rates_change_in_band')), 0)::bigint
    FROM screening_result s WHERE s.run_id = target.id
   GROUP BY s.payer_product;
  INSERT INTO audit_event (actor_kind, action, object_type, object_id, purpose, request_id)
  VALUES ('system', 'screening_lead_kept', 'screening_lead', created, 'screening', $5);
  RETURN created;
END;
$$;

-- The result page's signal that a person opened it (the result page sends it after two seconds visible and a first
-- interaction; never the link's GET, which a mail scanner also makes): for a complete run before it expires, the
-- first time, the run's first open, its outcome's band and its kept summary's first open, and an audit event of the
-- run. Anything else does nothing, and answers alike.
CREATE FUNCTION screening_result_opened(token_sha256 text) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  target screening_run%ROWTYPE;
BEGIN
  SELECT r.* INTO target FROM screening_run r
   WHERE r.result_token_sha256 = $1 AND r.status = 'complete' AND now() < r.expires_at AND r.first_opened_at IS NULL
     FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  UPDATE screening_run r SET first_opened_at = now() WHERE r.id = target.id;
  UPDATE screening_outcome o SET first_open_band = screening_open_band(u.created_at, now())
    FROM screening_upload u WHERE u.id = target.upload_id AND o.upload_id = u.id AND o.first_open_band IS NULL;
  UPDATE screening_lead l SET result_first_opened_at = now() WHERE l.upload_id = target.upload_id AND l.result_first_opened_at IS NULL;
  INSERT INTO audit_event (actor_kind, action, object_type, object_id, purpose, request_id)
  VALUES ('system', 'screening_result_opened', 'screening_run', target.id, 'screening', NULL);
END;
$$;

-- The conversion from a screening to an audit request: a prospect_request in the screening's contact address and
-- practice name, with the prospect's attribution and from_screening (that table's CHECKs and trigger apply),
-- recorded on the run once and as an audit event, which outlives the screening's expiry. It also records the first
-- open if the result page's signal did not, marks the outcome converted, and keeps the screening's summary with the
-- request: frozen now, on the request alone and never with the prospect's consent, when the run has none (a consent
-- summary withdrawn included), or given the request when its summary has none (a summary already carrying an earlier
-- request keeps that one). An unknown, expired or incomplete link is no_data_found.
CREATE FUNCTION convert_screening(token_sha256 text, contact text, location_count integer, payer_names text[], arrangement text, request text) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  target screening_run%ROWTYPE;
  prospect screening_prospect%ROWTYPE;
  lead screening_lead%ROWTYPE;
  created uuid;
BEGIN
  SELECT r.* INTO target FROM screening_run r
   WHERE r.result_token_sha256 = $1 AND r.status = 'complete' AND now() < r.expires_at
     FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no screening result at this link' USING ERRCODE = 'no_data_found';
  END IF;
  IF target.converted_at IS NOT NULL THEN
    RAISE EXCEPTION 'a screening converts to an audit request once' USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_converted_once';
  END IF;
  SELECT p.* INTO prospect FROM screening_upload u JOIN screening_prospect p ON p.id = u.prospect_id WHERE u.id = target.upload_id;
  -- As submit_prospect_request() writes a request, with the screening's attribution and from_screening, which no
  -- later update may set (prospect_request_fixed()).
  INSERT INTO prospect_request (contact_name, contact_email, organization_name, locations, payers, billing_arrangement, source, utm_source, utm_medium,
                                utm_campaign, paid_click, referring_firm, from_screening)
  VALUES (btrim(contact), prospect.contact_email, prospect.practice_name, location_count, payer_names, arrangement, prospect.source, prospect.utm_source,
          prospect.utm_medium, prospect.utm_campaign, prospect.paid_click, prospect.referring_firm, true)
  RETURNING id INTO created;
  UPDATE screening_run r SET converted_prospect_request_id = created, converted_at = now(), first_opened_at = coalesce(r.first_opened_at, now()) WHERE r.id = target.id;
  UPDATE screening_outcome o SET converted = true, first_open_band = coalesce(o.first_open_band, screening_open_band(u.created_at, now()))
    FROM screening_upload u WHERE u.id = target.upload_id AND o.upload_id = u.id;
  SELECT l.* INTO lead FROM screening_lead l WHERE l.upload_id = target.upload_id FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM screening_freeze_lead(target.id, created, NULL, false, request);
  ELSE
    UPDATE screening_lead l SET prospect_request_id = coalesce(l.prospect_request_id, created), result_first_opened_at = coalesce(l.result_first_opened_at, now())
     WHERE l.id = lead.id;
  END IF;
  INSERT INTO audit_event (actor_kind, action, object_type, object_id, purpose, request_id)
  VALUES ('system', 'screening_converted', 'prospect_request', created, 'screening', request);
  RETURN created;
END;
$$;

-- A consenting prospect's withdrawal (PR 6e's link): the summary kept with that withdrawal token's hash is deleted
-- now, its products with it, and the withdrawal is an audit event. An unknown token does nothing; the route answers
-- alike.
CREATE FUNCTION screening_lead_withdraw(token_sha256 text, request text) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  target uuid;
BEGIN
  SELECT l.id INTO target FROM screening_lead l WHERE l.withdrawal_token_sha256 = $1 AND $1 ~ '^[0-9a-f]{64}$' FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  UPDATE screening_lead l SET expires_at = now() WHERE l.id = target;
  DELETE FROM screening_lead l WHERE l.id = target;
  INSERT INTO audit_event (actor_kind, action, object_type, object_id, purpose, request_id)
  VALUES ('system', 'screening_lead_withdrawn', 'screening_lead', target, 'screening', $2);
END;
$$;

-- The public audit request with its attribution (/request-audit): how the requester heard of us, the attribution
-- cookie's campaign codes (its campaign code only when the founder lists it, 'other' otherwise: the table's
-- prospect_request_campaign_listed) and kind of paid click, and the referring firm. The six-argument form stays for the
-- previous image until no image calls it.
CREATE FUNCTION submit_prospect_request(contact text, email text, organization text, location_count integer, payer_names text[], arrangement text,
  heard_from text, campaign_source text, campaign_medium text, campaign_name text, click_kind text, firm text) RETURNS uuid
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  INSERT INTO prospect_request (contact_name, contact_email, organization_name, locations, payers, billing_arrangement, source, utm_source, utm_medium,
                                utm_campaign, paid_click, referring_firm)
  VALUES (btrim(contact), lower(btrim(email)), btrim(organization), location_count, payer_names, arrangement, heard_from, campaign_source, campaign_medium,
          campaign_name, click_kind, firm)
  RETURNING id
$$;

-- ---------------------------------------------------------------------------------------------------
-- The console (tp_app): the contract specialist approves the place-of-service split (rate_record.approve).
-- ---------------------------------------------------------------------------------------------------

CREATE FUNCTION console_screening_splits()
RETURNS TABLE (id uuid, settings jsonb, approved_by uuid, approved_by_email text, approved_at timestamptz, in_force boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NOT coalesce(app_actor_platform_permitted('rate_record.approve'), false) THEN
    RAISE EXCEPTION 'the screening split is read and approved by a contract specialist' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
    SELECT s.id, s.settings, s.approved_by, u.email, s.approved_at, row_number() OVER (ORDER BY s.approved_at DESC, s.id DESC) = 1
      FROM screening_place_of_service_split s LEFT JOIN "user" u ON u.id = s.approved_by
     ORDER BY s.approved_at DESC, s.id DESC
     LIMIT 50;
END;
$$;

CREATE FUNCTION console_approve_screening_split(settings jsonb) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  created uuid;
BEGIN
  IF app_actor_id() IS NULL OR NOT app_actor_is_person() OR NOT coalesce(app_actor_platform_permitted('rate_record.approve'), false) THEN
    RAISE EXCEPTION 'the screening split is approved by a contract specialist' USING ERRCODE = 'insufficient_privilege';
  END IF;
  INSERT INTO screening_place_of_service_split (settings, approved_by) VALUES ($1, app_actor_id()) RETURNING screening_place_of_service_split.id INTO created;
  RETURN created;
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- The platform jobs (tp_operator): screening_price and screening_expiry
-- ---------------------------------------------------------------------------------------------------

-- Runs to price: queued for at least the age given (the on-demand job takes newer ones), and runs whose pricing
-- started over ten minutes ago (a worker that stopped); at most 100, oldest first.
CREATE FUNCTION operator_screening_due(min_queued_age_seconds integer, at_most integer) RETURNS TABLE (run_id uuid, status text, attempts integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT r.id, r.status, r.attempts FROM screening_run r
   WHERE now() < r.expires_at
     AND ((r.status = 'queued' AND r.created_at <= now() - make_interval(secs => greatest(coalesce(min_queued_age_seconds, 0), 0)))
       OR (r.status = 'pricing' AND r.started_at < now() - interval '10 minutes'))
   ORDER BY r.created_at, r.id
   LIMIT least(greatest(coalesce(at_most, 0), 0), 100)
$$;

-- Claims a run: queued to pricing, or a stale pricing run again with one attempt more (at most three). Returns what
-- pricing needs (the pinned release, whether it is still there as pinned: published, its manifest unchanged and not
-- withdrawn; the prospect's ZIP, the split, the date the run was created in UTC, its row count and the attempt), or
-- nothing when the run is not there to claim. The attempt fences the calls that follow: operator_screening_rows(),
-- operator_screening_record(), operator_screening_complete() and operator_screening_fail() take it and refuse an
-- attempt the run has moved past, so a slow attempt a stale claim overtook stops at its next call instead of
-- recording, completing or failing a run another attempt prices.
CREATE FUNCTION operator_screening_claim(run uuid)
RETURNS TABLE (release_no integer, release_manifest_sha256 text, release_available boolean, zip text, settings jsonb, as_of date, row_count integer, attempt integer)
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
           p.zip, s.settings, (target.created_at AT TIME ZONE 'UTC')::date, target.row_count, target.attempts + 1
      FROM screening_upload u
      JOIN screening_prospect p ON p.id = u.prospect_id
      JOIN screening_place_of_service_split s ON s.id = target.place_of_service_split_id
     WHERE u.id = target.upload_id;
END;
$$;

-- The pinned release's rule records the engine reads whatever a row's key (with the stored SHA-256 the traces name):
-- every record type but the five a line looks up by its own key (pfs_rvu, ncci_mue, mppr_rate, ncci_ptp and
-- locality_map), which operator_screening_run_records() reads by the keys the run's rows can ask for. The job holds
-- these once per release and manifest. Only for a run being priced, and only while the release's manifest is the one
-- the run pinned and the release is not withdrawn (content known to be wrong prices nothing).
CREATE FUNCTION operator_screening_release(run uuid)
RETURNS TABLE (record_type text, key jsonb, value jsonb, effective_from text, effective_to text, sha256 text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT rr.record_type, rr.key, rr.value, rr.effective_from::text, rr.effective_to::text, rr.sha256
    FROM screening_run r
    JOIN rule_release rl ON rl.release_no = r.release_no AND rl.manifest_sha256 = r.release_manifest_sha256 AND rl.published_at IS NOT NULL
    JOIN rule_record rr ON rr.release_no = r.release_no
   WHERE r.id = $1 AND r.status = 'pricing'
     AND NOT EXISTS (SELECT 1 FROM rule_release_withdrawal w WHERE w.release_no = r.release_no)
     AND rr.record_type NOT IN ('pfs_rvu', 'ncci_mue', 'mppr_rate', 'ncci_ptp', 'locality_map')
   ORDER BY rr.record_type, rr.effective_from, rr.id
$$;

-- The keys a run's rows can ask for: the distinct procedure codes of its Medicare rows still to price (original
-- Medicare and Medicare Advantage without a contract), sorted, and the prospect's ZIP; read from the run's own rows,
-- never from a caller. Under the same guards as operator_screening_release(); nothing otherwise.
CREATE FUNCTION operator_screening_run_keys(run uuid) RETURNS TABLE (codes text[], zip text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT ARRAY(SELECT d.code FROM (SELECT DISTINCT s.procedure_code AS code FROM screening_result s
                                    WHERE s.run_id = r.id AND s.payer_product IN ('medicare_ffs', 'ma_noncontracted') AND s.disposition = 'pending') d
                ORDER BY d.code COLLATE "C"),
         p.zip
    FROM screening_run r
    JOIN screening_upload u ON u.id = r.upload_id
    JOIN screening_prospect p ON p.id = u.prospect_id
    JOIN rule_release rl ON rl.release_no = r.release_no AND rl.manifest_sha256 = r.release_manifest_sha256 AND rl.published_at IS NOT NULL
   WHERE r.id = $1 AND r.status = 'pricing'
     AND NOT EXISTS (SELECT 1 FROM rule_release_withdrawal w WHERE w.release_no = r.release_no)
$$;

-- The pinned release's keyed records for exactly those keys, by equality on rule_record_identity: for each code, its
-- fee schedule values (pfs_rvu, no modifier), its MUE (ncci_mue), its own reduction record (mppr_rate, no modifier) and
-- its same-code pair (ncci_ptp: a screening claim is one line, or two of the same code); the general reduction record
-- (mppr_rate, practice expense); and the prospect's ZIP in the locality map. Under the same guards; nothing otherwise.
CREATE FUNCTION operator_screening_run_records(run uuid)
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
        UNION ALL SELECT 'locality_map', jsonb_build_object('zip', keyed.zip)) w
  )
  SELECT rr.record_type, rr.key, rr.value, rr.effective_from::text, rr.effective_to::text, rr.sha256
    FROM wanted JOIN rule_record rr ON rr.release_no = wanted.release_no AND rr.record_type = wanted.record_type AND rr.key = wanted.key
   ORDER BY rr.record_type, rr.effective_from, rr.id
$$;

-- The run's rows still to price, after a row number, at most 5,000 at a time; nothing for an attempt the run has moved
-- past.
CREATE FUNCTION operator_screening_rows(run uuid, after_row integer, at_most integer, attempt integer)
RETURNS TABLE (row_no integer, procedure_code text, modifiers text[], units integer, place_of_service text, payer_product text, service_band text,
  claim_count integer, observed_allowed_cents bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT s.row_no, s.procedure_code, s.modifiers, s.units, s.place_of_service, s.payer_product, s.service_band, s.claim_count, s.observed_allowed_cents
    FROM screening_run r JOIN screening_result s ON s.run_id = r.id
   WHERE r.id = $1 AND r.status = 'pricing' AND r.attempts = $4 AND s.disposition = 'pending' AND s.row_no > coalesce($2, 0)
   ORDER BY s.row_no
   LIMIT least(greatest(coalesce($3, 0), 0), 5000)
$$;

-- Records what pricing found for up to 5,000 pending rows of a run being priced, by the attempt that claimed it; the
-- arrays are the rows' fields in order. Returns how many rows it recorded (a row already recorded is left as it is).
-- An attempt the run has moved past, or a run no longer being priced, is refused (screening_run_attempt).
CREATE FUNCTION operator_screening_record(run uuid, row_nos integer[], dispositions text[], expected_line_cents bigint[], expected_line_unrounded numeric[],
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
  PERFORM 1 FROM screening_run r WHERE r.id = $1 AND r.status = 'pricing' AND r.attempts = $17 FOR SHARE;
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

-- Completes a run being priced once no row is pending: the SHA-256 of the link's token (the token itself never
-- reaches the database) and the engine's version. Returns where the link goes and the row count; nothing when the
-- run is already complete (a retry after the email went). In the same transaction: the outcome is priced, with its
-- shares (each 100 * part / total, floored, of the bigint sums of the allowed amounts: priced, cannot be priced without
-- a contract, could not be priced, not screened; all 0 when the total is 0), its anomaly band (the count of priced rows
-- screening_standing() names an anomaly) and the band of those rows' summed gap below their lowest figure; and this
-- screening replaces the practice's kept summaries screened before it (the same ZIP and practice name, or the same
-- contact address), each deletion an audit event. The audit request of the most recently screened one that has one,
-- among those of the same ZIP and practice name this transaction deleted, goes over to this run's summary (decision
-- 17; two completions at once that both match one summary: only the one that deleted it carries its request); a
-- summary that matched by the contact address alone (another practice, or the same one renamed) leaves its request
-- without a summary, never on another practice's figures, and its event says so (screening_lead_left_request). With a
-- carried request, or the prospect's consent (and the withdrawal token's hash it needs), this run's summary is frozen.
-- So a failed or abandoned replacement deletes nothing. Returns where the link goes, the row count, and what this
-- run's summary is kept with ('earlier_request', 'consent' or 'none'), so the email can say so. An attempt the run has
-- moved past, or a run no longer being priced, is refused (screening_run_attempt), and so is a run whose screening
-- expired while it was priced (screening_run_expired: its link would open nothing).
CREATE FUNCTION operator_screening_complete(run uuid, token_sha256 text, withdrawal_token_sha256 text, engine text, request text, attempt integer)
RETURNS TABLE (contact_email text, row_count integer, kept_with text)
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
                      CASE WHEN carried IS NOT NULL THEN 'earlier_request' WHEN prospect.followup_consent_sha256 IS NOT NULL THEN 'consent' ELSE 'none' END;
END;
$$;

-- Fails a queued or pricing run with a code, and its outcome. Returns where the notice goes; nothing when the run had
-- already ended, or when the attempt named (an attempt's own failure) is one the run has moved past. The sweep, failing
-- a run out of attempts, names none.
CREATE FUNCTION operator_screening_fail(run uuid, failure text, request text, attempt integer) RETURNS TABLE (contact_email text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  target screening_run%ROWTYPE;
BEGIN
  SELECT r.* INTO target FROM screening_run r WHERE r.id = $1 FOR UPDATE;
  IF NOT FOUND OR target.status NOT IN ('queued', 'pricing') OR ($4 IS NOT NULL AND target.attempts <> $4) THEN
    RETURN;
  END IF;
  UPDATE screening_run r SET status = 'failed', failure_code = $2, failed_at = now() WHERE r.id = target.id;
  UPDATE screening_outcome o SET stage = 'failed' WHERE o.upload_id = target.upload_id AND o.stage = 'accepted';
  INSERT INTO audit_event (actor_kind, action, object_type, object_id, purpose, request_id)
  VALUES ('system', 'screening_failed', 'screening_run', target.id, 'screening', $3);
  RETURN QUERY
    SELECT p.contact_email FROM screening_upload u JOIN screening_prospect p ON p.id = u.prospect_id WHERE u.id = target.upload_id;
END;
$$;

-- Deletes up to at_most prospects whose screening has expired, with their uploads, runs and rows, each an audit
-- event (their outcomes stay, unlinked), and up to at_most kept summaries past their 12 months, with their products,
-- each an audit event. Returns how many prospects, runs and summaries went.
CREATE FUNCTION operator_screening_expire(at_most integer, request text) RETURNS TABLE (prospects integer, runs integer, leads integer)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  doomed uuid[];
  doomed_leads uuid[];
  run_total integer;
BEGIN
  SELECT coalesce(array_agg(x.id), '{}') INTO doomed FROM (
    SELECT p.id FROM screening_prospect p WHERE p.expires_at <= now()
     ORDER BY p.expires_at, p.id
     LIMIT least(greatest(coalesce($1, 0), 0), 1000)
       FOR UPDATE SKIP LOCKED) x;
  SELECT count(*)::integer INTO run_total FROM screening_run r JOIN screening_upload u ON u.id = r.upload_id WHERE u.prospect_id = ANY (doomed);
  DELETE FROM screening_prospect p WHERE p.id = ANY (doomed);
  INSERT INTO audit_event (actor_kind, action, object_type, object_id, purpose, request_id)
  SELECT 'system', 'screening_expired', 'screening_prospect', d.id, 'screening', $2 FROM unnest(doomed) AS d (id);
  SELECT coalesce(array_agg(x.id), '{}') INTO doomed_leads FROM (
    SELECT l.id FROM screening_lead l WHERE l.expires_at <= now()
     ORDER BY l.expires_at, l.id
     LIMIT least(greatest(coalesce($1, 0), 0), 1000)
       FOR UPDATE SKIP LOCKED) x;
  DELETE FROM screening_lead l WHERE l.id = ANY (doomed_leads);
  INSERT INTO audit_event (actor_kind, action, object_type, object_id, purpose, request_id)
  SELECT 'system', 'screening_lead_expired', 'screening_lead', d.id, 'screening', $2 FROM unnest(doomed_leads) AS d (id);
  RETURN QUERY SELECT cardinality(doomed), run_total, cardinality(doomed_leads);
END;
$$;

-- The consenting prospects' kept summaries due a reminder before they are deleted (PR 6e's job sets the days): no
-- reminder yet, and expiring within the days given; at most 1,000, the soonest first.
CREATE FUNCTION operator_screening_reminders_due(within_days integer, at_most integer) RETURNS TABLE (lead_id uuid, contact_email text, expires_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT l.id, l.contact_email, l.expires_at FROM screening_lead l
   WHERE l.consent_sha256 IS NOT NULL AND l.reminder_sent_at IS NULL
     AND l.expires_at > now() AND l.expires_at <= now() + make_interval(days => greatest(coalesce($1, 0), 0))
   ORDER BY l.expires_at, l.id
   LIMIT least(greatest(coalesce($2, 0), 0), 1000)
$$;

-- Records a consent summary's reminder, once, as an audit event. Returns whether it was recorded now.
CREATE FUNCTION operator_screening_reminder_sent(lead uuid, request text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  UPDATE screening_lead l SET reminder_sent_at = now() WHERE l.id = $1 AND l.consent_sha256 IS NOT NULL AND l.reminder_sent_at IS NULL;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  INSERT INTO audit_event (actor_kind, action, object_type, object_id, purpose, request_id)
  VALUES ('system', 'screening_lead_reminded', 'screening_lead', $1, 'screening', $2);
  RETURN true;
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- The campaign list (tp_app): a person with organization.manage lists a code (PR 7 builds its screen)
-- ---------------------------------------------------------------------------------------------------

-- The listing is an audit event naming the campaign's ID (marketing_campaign.id), so the trail says which code was
-- listed and by whom. That a listed campaign is one sent to many people is the founder's rule, kept by review (ADR
-- 0062); the outcome reports (PR 7) show a campaign's cohort only at 11 or more (the founder's ruling of 2026-10-21).
-- Listing a code changes no row already written: one that kept 'other' keeps it.
CREATE FUNCTION console_register_marketing_campaign(code text, label text) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  listed uuid;
BEGIN
  IF app_actor_id() IS NULL OR NOT app_actor_is_person() OR NOT coalesce(app_actor_platform_permitted('organization.manage'), false) THEN
    RAISE EXCEPTION 'a campaign is listed by a platform administrator' USING ERRCODE = 'insufficient_privilege';
  END IF;
  INSERT INTO marketing_campaign (code, label, added_by) VALUES ($1, btrim($2), app_actor_id()) RETURNING marketing_campaign.id INTO listed;
  INSERT INTO audit_event (actor_id, actor_kind, action, object_type, object_id, purpose)
  VALUES (app_actor_id(), 'user', 'marketing_campaign_registered', 'marketing_campaign', listed, 'console');
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------------------------------

REVOKE ALL ON screening_prospect, screening_upload, screening_place_of_service_split, screening_run, screening_result, screening_outcome, screening_lead,
  screening_lead_product, marketing_campaign FROM PUBLIC;

REVOKE ALL ON FUNCTION screening_rejection_valid(jsonb), screening_rejections_valid(jsonb), screening_split_valid(jsonb), screening_modifiers_valid(text[]),
  screening_practice_key(text), marketing_channel(text, text), screening_count_band(bigint), screening_difference_band(bigint),
  screening_open_band(timestamptz, timestamptz), screening_refusal_codes_valid(text[]), screening_labels_version(), screening_replaced(uuid),
  marketing_campaign_kept(text), marketing_campaign_listed_only(), screening_outcome_campaign_listed(), screening_kept_until_expiry(), screening_run_rules(), screening_result_inserted(), screening_result_rules(), screening_outcome_rules(), screening_lead_rules(),
  screening_lead_kept(), screening_lead_product_kept(), screening_split_in_force(), screening_status(), screening_standing(bigint, bigint, bigint, bigint),
  screening_zip_status(text),
  submit_screening(text, text, text, text, text[], text[], integer[], text[], text[], text[], bigint[], integer[], integer, integer, bigint, text, text, text, text, text, text, text, text, text),
  reject_screening_upload(text, text, text, text, integer, jsonb, text, text, text, text, text, text, text, text), screening_result_summary(text),
  screening_result_ranked_groups(text), screening_result_groups(text, integer, integer), screening_result_group_totals(text, integer, integer),
  screening_result_coverage(text), screening_result_rows(text, integer), screening_freeze_lead(uuid, uuid, text, boolean, text),
  screening_result_opened(text), convert_screening(text, text, integer, text[], text, text), screening_lead_withdraw(text, text),
  submit_prospect_request(text, text, text, integer, text[], text, text, text, text, text, text, text), console_screening_splits(),
  console_approve_screening_split(jsonb), console_register_marketing_campaign(text, text), operator_screening_due(integer, integer),
  operator_screening_claim(uuid), operator_screening_release(uuid), operator_screening_run_keys(uuid), operator_screening_run_records(uuid),
  operator_screening_rows(uuid, integer, integer, integer),
  operator_screening_record(uuid, integer[], text[], bigint[], numeric[], bigint[], bigint[], boolean[], bigint[], numeric[], bigint[], bigint[], text[], text[], text[], text[], integer),
  operator_screening_complete(uuid, text, text, text, text, integer), operator_screening_fail(uuid, text, text, integer), operator_screening_expire(integer, text),
  operator_screening_reminders_due(integer, integer), operator_screening_reminder_sent(uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION screening_status(), screening_zip_status(text),
  submit_screening(text, text, text, text, text[], text[], integer[], text[], text[], text[], bigint[], integer[], integer, integer, bigint, text, text, text, text, text, text, text, text, text),
  reject_screening_upload(text, text, text, text, integer, jsonb, text, text, text, text, text, text, text, text), screening_result_summary(text),
  screening_result_groups(text, integer, integer), screening_result_group_totals(text, integer, integer), screening_result_coverage(text),
  screening_result_rows(text, integer), screening_result_opened(text),
  convert_screening(text, text, integer, text[], text, text), screening_lead_withdraw(text, text),
  submit_prospect_request(text, text, text, integer, text[], text, text, text, text, text, text, text), console_screening_splits(),
  console_approve_screening_split(jsonb), console_register_marketing_campaign(text, text) TO tp_app;

GRANT EXECUTE ON FUNCTION operator_screening_due(integer, integer), operator_screening_claim(uuid), operator_screening_release(uuid),
  operator_screening_run_keys(uuid), operator_screening_run_records(uuid), operator_screening_rows(uuid, integer, integer, integer),
  operator_screening_record(uuid, integer[], text[], bigint[], numeric[], bigint[], bigint[], boolean[], bigint[], numeric[], bigint[], bigint[], text[], text[], text[], text[], integer),
  operator_screening_complete(uuid, text, text, text, text, integer), operator_screening_fail(uuid, text, text, integer), operator_screening_expire(integer, text),
  operator_screening_reminders_due(integer, integer), operator_screening_reminder_sent(uuid, text) TO tp_operator;

-- The console's decline records its reason (prospect_request_platform_review is unchanged).
GRANT UPDATE (declined_reason) ON prospect_request TO tp_app;

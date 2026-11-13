-- An ROI statement keeps the priced lines its actionable figure counted (schema PR 5; from #93's F9; docs/adr/0082
-- Decision 7).
--
-- Under the ledger freeze exception the founder granted for schema PR 5, and nothing beyond it: new bodies for two
-- functions, each written below exactly as the founder read it, down to the byte.
-- - roi_links_valid(jsonb), Appendix A of the ask of 2026-11-07 (granted 2026-11-07; body 13c4dd46b9203095): the CHECK
--   on roi_statement.links accepts today's four keys or those four and actionable_open_lines, and refuses the empty
--   object, which today's body let through (its key comparison answered null).
-- - roi_statement_rules(), Appendix D2 of the ask of 2026-11-12 with its one header line, SET plan_cache_mode TO
--   'force_custom_plan' after the SET search_path line (granted 2026-11-12; body ad925199131cb411): a new statement
--   that carries actionable_open_lines has its actionable figure checked against the variance of the priced lines it
--   links, each once and each a line of a case it links. A statement without the key keeps today's rule.
-- The grant is for these two texts in schema PR 5 only. A fault found in either is never repaired here: the corrected
-- text goes back to the founder with its proof.
--
-- What does not change: no table, column, constraint text, index, policy, role, trigger definition, grant or FORCE
-- setting; no amount, stage, matching rule or definition of recovered. CREATE OR REPLACE keeps each function's
-- identity, owner and grants (roi_links_valid stays granted to tp_app and to no one else; roi_statement_rules to no
-- one, as a trigger function), and the trigger roi_statement_rules on roi_statement is not dropped, created or altered.
-- Both stay SECURITY INVOKER with the same search_path; neither sets app.practice_ids or app.actor_id. Runs as tp_owner.
--
-- Why two preflights and a self-check:
-- - Section 1 refuses unless the two bodies it replaces are the ones the exception was granted on.
-- - Section 3 reads every stored statement through the new roi_links_valid before anything else is replaced.
--   PostgreSQL does not check stored rows again when a function a CHECK calls is replaced, so this migration does. By
--   the two bodies, the only rows today's CHECK passes and the new one refuses are those whose links is the empty
--   object, which no code writes. If one is found the migration refuses with counts only and changes nothing. To list
--   them, as tp_owner with the practices in scope:
--     SELECT s.practice_id, s.id FROM roi_statement s WHERE roi_links_valid(s.links) IS NOT TRUE;
--   (with the new body installed in a transaction that is rolled back; today's body answers null for them).
-- - Section 5 refuses unless the two stored bodies are the granted ones, byte for byte, and the header line is stored.
--
-- Locks, and what a deploy sees (designs/lane-a-ledger-freeze-batch-preflight.md on claude/build-ops):
-- - Through section 3's scan, to commit: ACCESS SHARE on roi_statement, practice and their indexes, the lock every
--   SELECT takes. Nobody waits for it. It holds back vacuum's horizon for as long as the scan runs.
-- - It does NOT take only reading locks. For its closing count section 3 takes a SHARE lock on roi_statement, with
--   NOWAIT, once a second, up to 30 tries, and holds it to commit (the closing count, the guard and sections 4 and 5:
--   0.12 to 2.7 s measured at 1,000,000 statements in 1,000 practices, nothing on an empty table). While it is held a
--   new statement, the record of a statement's printed PDF and a vacuum or analyze of the table wait; readers do not.
--   Without it a statement inserted by a transaction still open at the closing count would never be checked.
-- - A refused try holds and queues nothing. If a statement writer's transaction or a vacuum of the table stays open
--   across all 30 tries the migration fails with "roi_statement stayed in use for 30 seconds at the preflight's closing
--   count; run the deploy again", nothing changed, and the deploy is run again. The runner does not retry that refusal.
-- - Time: the scan reads one practice at a time under this role's own one-practice scope, so the tenant policy is
--   compared with a one-element list: 196 to 206 s at 1,000,000 statements in 1,000 practices (SYNTHETIC rows,
--   PostgreSQL 18.4), against a limit of 5 minutes for the migration. Recorded residual: that was measured with the
--   table's pages cached; it is not shown on cold storage. Every real run today is on an empty table. The scan does
--   not stop itself at 5 minutes: a larger database could then never migrate.
--
-- Safe with the previous image running, in this order only: this migration, then the image. After it and before the
-- new image, the old writer stores four-key statements (accepted; the new block of roi_statement_rules is skipped
-- without the key) and records PDFs as before. After the new image, statements carry five keys, and the old image (a
-- rollback, or the other task during a deploy) reads links by key name and ignores the fifth. The new image before
-- this migration would have every statement refused by today's CHECK. A rollback of the image needs no data change.
-- This migration is never rolled back; a fix is a new forward migration under a new exception. Nothing is backfilled
-- and no stored row is written.

-- ---------------------------------------------------------------------------------------------------
-- 1. Preflight: the bodies this migration replaces are the ones the founder's exception was granted on
-- ---------------------------------------------------------------------------------------------------

-- Each replaced function's stored body (pg_proc.prosrc, the text between its dollar quotes) is compared whole, by
-- SHA-256; packages/db/functions prints the first 16 digits of the same hash. A migration that comes to sort before
-- this one and changes either body makes this one refuse: the exception puts the two granted bodies in place of
-- these two, so a different starting body is the founder's question again, never a silent rebase. Run twice, the
-- second run finds its own bodies and refuses too.
DO $$
BEGIN
  IF (SELECT encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') FROM pg_proc p WHERE p.oid = to_regprocedure('roi_links_valid(jsonb)'))
     IS DISTINCT FROM '49416713dd4d13ddf0766e35db60cc7306cebb8e06ee89ea7345beae2b5e51a3' THEN
    RAISE EXCEPTION 'roi_links_valid(jsonb) is not the body the ledger freeze exception of 2026-11-07 for schema PR 5 was granted on; the exception covers no other'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF (SELECT encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') FROM pg_proc p WHERE p.oid = to_regprocedure('roi_statement_rules()'))
     IS DISTINCT FROM '5a8bc6319828acb29a7f57aad9ebd57501734a71826a1e4d1d6953db9e85965c' THEN
    RAISE EXCEPTION 'roi_statement_rules() is not the body the ledger freeze exception of 2026-11-07 and 2026-11-12 for schema PR 5 was granted on; the exception covers no other'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- 2. roi_links_valid: Appendix A, as granted
-- ---------------------------------------------------------------------------------------------------

-- DO NOT EDIT: the statement below is the founder's granted text, pasted, and section 5 refuses any other byte.
CREATE OR REPLACE FUNCTION public.roi_links_valid(links jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT jsonb_typeof(links) = 'object'
     AND coalesce((SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(links) k), '{}') IN (
           ARRAY['actionable_open', 'approved_unposted', 'interest', 'recovered'],
           ARRAY['actionable_open', 'actionable_open_lines', 'approved_unposted', 'interest', 'recovered'])
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_each(links) e
        WHERE jsonb_typeof(e.value) <> 'array'
           OR EXISTS (SELECT 1 FROM jsonb_array_elements(e.value) v WHERE jsonb_typeof(v) <> 'string' OR v #>> '{}' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'))
$function$;

-- ---------------------------------------------------------------------------------------------------
-- 3. Preflight: every stored statement passes the new roi_links_valid
-- ---------------------------------------------------------------------------------------------------

-- One practice at a time, each in this role's own transaction-local scope, through the same tenant policy every
-- reader passes (roi_statement_tenant); nothing is bypassed and the scope is '{}' again when the block ends. A
-- statement is checked by the new function itself, never by a copy of its expression, and IS NOT TRUE stops on a null
-- answer too (a CHECK would pass one).
-- Why every stored statement is checked: practice_id is NOT NULL with a foreign key to practice, and this role reads
-- practice whole (asserted first), so every statement belongs to a listed practice; under the SHARE lock no insert is
-- open, so every stored statement is committed and visible to the closing count; the table is insert-only (its
-- trigger refuses DELETE and any change of links, TRUNCATE is refused), so a practice whose stored count equals the
-- count checked holds the same statements; and the guard catches a scope that opened nothing.
DO $$
DECLARE
  ids uuid[]; arrived uuid[]; n int; i int; attempt int; locked boolean := false;
  seen bigint[]; bad bigint[]; stored bigint; total bigint; refused bigint; hit int;
  probe boolean; c_seen bigint; c_bad bigint; rescans int := 0;
  t0 timestamptz := clock_timestamp(); t1 timestamptz; t2 timestamptz;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'the stored-statement preflight needs READ COMMITTED: its closing count must see every committed statement' USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- The list of practices is whole only for the role practice_resolver names; any other role would read none or some.
  IF NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = 'practice'::regclass AND p.polname = 'practice_resolver' AND p.polcmd = 'r'
                    AND pg_get_expr(p.polqual, p.polrelid) = 'true' AND p.polroles = ARRAY[(SELECT r.oid FROM pg_roles r WHERE r.rolname = current_user)]) THEN
    RAISE EXCEPTION 'the stored-statement preflight runs as the role that reads every practice (practice_resolver); it is running as another' USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  ids := ARRAY(SELECT id FROM practice ORDER BY id);
  n := cardinality(ids);
  seen := array_fill(0::bigint, ARRAY[n]); bad := array_fill(0::bigint, ARRAY[n]);
  -- The scan: every practice, deleted ones too, one at a time, in its own scope.
  FOR i IN 1..n LOOP
    PERFORM set_config('app.practice_ids', ARRAY[ids[i]]::text, true);
    SELECT count(*), count(*) FILTER (WHERE roi_links_valid(s.links) IS NOT TRUE) INTO c_seen, c_bad FROM roi_statement s WHERE s.practice_id = ids[i];
    seen[i] := c_seen; bad[i] := c_bad;
  END LOOP;
  t1 := clock_timestamp();
  -- The closing lock, without a queue: a refused try holds and queues nothing. Held to the end of the migration.
  FOR attempt IN 1..30 LOOP
    BEGIN
      LOCK TABLE roi_statement IN SHARE MODE NOWAIT; locked := true; EXIT;
    EXCEPTION WHEN lock_not_available THEN PERFORM pg_sleep(1);
    END;
  END LOOP;
  IF NOT locked THEN
    RAISE EXCEPTION 'roi_statement stayed in use for 30 seconds at the preflight''s closing count; run the deploy again' USING ERRCODE = 'lock_not_available';
  END IF;
  t2 := clock_timestamp();
  -- The closing count, under the lock: practices created meanwhile are added, and the stored count of every practice
  -- is set against the count checked. A practice whose count moved is read again, whole.
  arrived := ARRAY(SELECT a.id FROM (SELECT id FROM practice EXCEPT SELECT unnest(ids)) a ORDER BY a.id);
  IF cardinality(arrived) > 0 THEN
    ids := ids || arrived; seen := seen || array_fill(0::bigint, ARRAY[cardinality(arrived)]); bad := bad || array_fill(0::bigint, ARRAY[cardinality(arrived)]);
    n := cardinality(ids);
  END IF;
  FOR i IN 1..n LOOP
    PERFORM set_config('app.practice_ids', ARRAY[ids[i]]::text, true);
    SELECT count(*) INTO stored FROM roi_statement s WHERE s.practice_id = ids[i];
    IF stored <> seen[i] THEN
      rescans := rescans + 1;
      SELECT count(*), count(*) FILTER (WHERE roi_links_valid(s.links) IS NOT TRUE) INTO c_seen, c_bad FROM roi_statement s WHERE s.practice_id = ids[i];
      seen[i] := c_seen; bad[i] := c_bad;
    END IF;
  END LOOP;
  -- The totals are taken from the whole arrays, so no loop bound can leave a practice out of them.
  SELECT coalesce(sum(x), 0) INTO total FROM unnest(seen) x;
  SELECT coalesce(sum(x), 0), count(*) FILTER (WHERE x > 0) INTO refused, hit FROM unnest(bad) x;
  -- The empty-pass guard: with every practice in scope, is there any statement at all? It stops at the first row.
  PERFORM set_config('app.practice_ids', ids::text, true);
  probe := EXISTS (SELECT 1 FROM roi_statement);
  PERFORM set_config('app.practice_ids', '{}', true);
  IF probe <> (total > 0) THEN
    RAISE EXCEPTION 'the stored-statement preflight read % statements in % practices, but the table % empty; nothing is changed', total, n, CASE WHEN probe THEN 'is not' ELSE 'is' END
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- Counts only: no statement, practice, links text or figure is named.
  IF refused > 0 THEN
    RAISE EXCEPTION '% of % stored ROI statements, in % of % practices, fail the new roi_links_valid; nothing is changed', refused, total, hit, n USING ERRCODE = 'check_violation';
  END IF;
  RAISE NOTICE 'preflight: % statements checked in % practices, 0 refused; scan % ms, lock wait % ms, closing % ms, % practices read again',
    total, n, round(extract(epoch FROM t1 - t0) * 1000), round(extract(epoch FROM t2 - t1) * 1000), round(extract(epoch FROM clock_timestamp() - t2) * 1000), rescans;
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- 4. roi_statement_rules: Appendix D2 with its one header line, as granted
-- ---------------------------------------------------------------------------------------------------

-- DO NOT EDIT: the statement below is the founder's granted text, pasted, and section 5 refuses any other byte of its
-- body and a missing header line.
CREATE OR REPLACE FUNCTION public.roi_statement_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
DECLARE
  sums record;
  lines record;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'an ROI statement keeps its figures; a new one is generated' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.id, NEW.practice_id, NEW.period_from, NEW.period_to, NEW.proof_level, NEW.fees_cents, NEW.recovered_cents, NEW.interest_cents, NEW.approved_unposted_cents,
        NEW.actionable_open_cents, NEW.pursuit_hours, NEW.links, NEW.generated_by, NEW.generated_at, NEW.created_at)
       IS DISTINCT FROM (OLD.id, OLD.practice_id, OLD.period_from, OLD.period_to, OLD.proof_level, OLD.fees_cents, OLD.recovered_cents, OLD.interest_cents, OLD.approved_unposted_cents,
        OLD.actionable_open_cents, OLD.pursuit_hours, OLD.links, OLD.generated_by, OLD.generated_at, OLD.created_at)
       OR OLD.document_key IS NOT NULL OR NEW.document_key IS NULL THEN
      RAISE EXCEPTION 'an ROI statement keeps its figures; only its printed PDF is recorded, once' USING ERRCODE = 'check_violation';
    END IF;
    IF practice_in_scope(NEW.practice_id) THEN
      IF app_actor_is_person() THEN
        RAISE EXCEPTION 'the statement job records the printed PDF, in no one''s name' USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF left(NEW.document_key, char_length('practices/' || NEW.practice_id::text || '/reports/' || NEW.id::text || '/')) <> 'practices/' || NEW.practice_id::text || '/reports/' || NEW.id::text || '/' THEN
        RAISE EXCEPTION 'a statement''s PDF is stored under its own practice and statement' USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
  END IF;
  NEW.generated_at := now();
  IF NEW.document_key IS NOT NULL OR NEW.pdf_sha256 IS NOT NULL THEN
    RAISE EXCEPTION 'a statement is printed after it is written' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT practice_in_scope(NEW.practice_id) THEN
    RETURN NEW;
  END IF;
  IF app_actor_is_person() THEN
    IF NEW.generated_by IS DISTINCT FROM app_actor_id() OR NOT coalesce(app_actor_permitted(NEW.practice_id, 'posting.reconcile'), false) THEN
      RAISE EXCEPTION 'an ROI statement is generated on demand by a person who reconciles postings, in their own name' USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF NEW.generated_by IS NOT NULL THEN
    RAISE EXCEPTION 'the quarterly statement is generated in no one''s name' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT (SELECT count(*) FROM jsonb_array_elements_text(NEW.links -> 'recovered')) + (SELECT count(*) FROM jsonb_array_elements_text(NEW.links -> 'interest')) AS linked,
         (SELECT count(*) FROM ledger_entry e WHERE e.practice_id = NEW.practice_id AND e.id IN (SELECT x::uuid FROM jsonb_array_elements_text(NEW.links -> 'recovered') x))
           + (SELECT count(*) FROM ledger_entry e WHERE e.practice_id = NEW.practice_id AND e.id IN (SELECT x::uuid FROM jsonb_array_elements_text(NEW.links -> 'interest') x)) AS found,
         (SELECT coalesce(sum(e.amount_cents), 0) FROM ledger_entry e WHERE e.practice_id = NEW.practice_id AND e.id IN (SELECT x::uuid FROM jsonb_array_elements_text(NEW.links -> 'recovered') x)) AS recovered,
         (SELECT coalesce(sum(e.amount_cents), 0) FROM ledger_entry e WHERE e.practice_id = NEW.practice_id AND e.id IN (SELECT x::uuid FROM jsonb_array_elements_text(NEW.links -> 'interest') x)) AS interest
    INTO sums;
  IF sums.linked <> sums.found OR sums.recovered <> NEW.recovered_cents OR sums.interest <> NEW.interest_cents THEN
    RAISE EXCEPTION 'an ROI statement''s recovered and interest are the sums of the entries it links' USING ERRCODE = 'check_violation';
  END IF;
  -- Its actionable figure is the variance of the priced lines it links (from #93's F9; docs/adr/0082 Decision 7), each
  -- once and each a line of a case it links. A statement without the key (one written before this migration, or by the
  -- image before it during a deploy or after a rollback) keeps today's rule: its actionable figure is not checked.
  IF NEW.links ? 'actionable_open_lines' THEN
    SELECT (SELECT count(*) FROM jsonb_array_elements_text(NEW.links -> 'actionable_open_lines')) AS linked,
           count(*) FILTER (WHERE m.case_id IN (SELECT x::uuid FROM jsonb_array_elements_text(NEW.links -> 'actionable_open') x)) AS found,
           coalesce(sum(m.variance_cents), 0) AS cents
      FROM (SELECT DISTINCT x::uuid AS id FROM jsonb_array_elements_text(NEW.links -> 'actionable_open_lines') x) i
     CROSS JOIN LATERAL (
           SELECT p.variance_cents,
                  (SELECT l.case_id FROM case_line l
                    WHERE l.service_line_id = p.service_line_id AND l.priced_line_id = p.id AND l.practice_id = NEW.practice_id) AS case_id
             FROM priced_line p
            WHERE p.id = i.id AND p.practice_id = NEW.practice_id
           OFFSET 0) m
      INTO lines;
    IF lines.linked <> lines.found OR lines.cents <> NEW.actionable_open_cents THEN
      RAISE EXCEPTION 'an ROI statement''s actionable figure is the variance of the priced lines it links, each once and each a line of a case it links' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------------------------------
-- 5. Self-check: the two stored bodies are the granted ones, and the header line is stored
-- ---------------------------------------------------------------------------------------------------

-- Written as section 1's, so a function that is missing refuses too. The files are LF in every checkout
-- (.gitattributes), so the bytes hashed are the bytes pasted: a file whose pasted text differs from a granted text by
-- one byte cannot be applied anywhere.
DO $$
BEGIN
  IF (SELECT encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') FROM pg_proc p WHERE p.oid = to_regprocedure('roi_links_valid(jsonb)'))
     IS DISTINCT FROM '13c4dd46b9203095db8f26e124ed3652e5ec58bf5a46f0b28fd561b6cd1f2da4' THEN
    RAISE EXCEPTION 'roi_links_valid(jsonb) is not stored as Appendix A, the text granted on 2026-11-07; nothing is changed'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF (SELECT encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') FROM pg_proc p WHERE p.oid = to_regprocedure('roi_statement_rules()'))
     IS DISTINCT FROM 'ad925199131cb4117e43a97216f65c59ea09769f3bb0ee4f40f5b3bef748eca5' THEN
    RAISE EXCEPTION 'roi_statement_rules() is not stored as Appendix D2, the text granted on 2026-11-12; nothing is changed'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF (SELECT p.proconfig FROM pg_proc p WHERE p.oid = to_regprocedure('roi_statement_rules()'))
     IS DISTINCT FROM ARRAY['search_path=pg_catalog, public, pg_temp', 'plan_cache_mode=force_custom_plan'] THEN
    RAISE EXCEPTION 'roi_statement_rules() is not stored with the header line granted on 2026-11-12 (plan_cache_mode) after its search_path; nothing is changed'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
END;
$$;

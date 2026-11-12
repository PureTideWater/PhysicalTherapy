-- W41, 2026-11-12: the design's reference text for step 3.3 (NOT a migration; the builder writes the migration from
-- the addendum after a person's typed /new-migration). psql variable :lock = 1 adds the closing SHARE lock (the
-- addendum's question 1); 0 leaves the block with reading locks only.
-- It reads one practice at a time under the migration role's own one-practice scope, so the tenant policy is
-- evaluated against a one-element list, and no policy, role or FORCE setting is touched.
SELECT set_config('w41.lock', :'lock', true);
DO $$
DECLARE
  ids uuid[]; arrived uuid[]; n int; i int; pass int; attempt int; moved int; locked boolean := false;
  seen bigint[]; bad bigint[]; stored bigint; total bigint := 0; refused bigint := 0; hit int := 0;
  refused_ids uuid[] := '{}'; more uuid[]; probe boolean; c_seen bigint; c_bad bigint; rescans int := 0;
  t0 timestamptz := clock_timestamp(); t1 timestamptz; t2 timestamptz;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'the stored-statement preflight needs READ COMMITTED: its closing count must see every committed statement' USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  ids := ARRAY(SELECT id FROM practice ORDER BY id);
  n := cardinality(ids);
  seen := array_fill(0::bigint, ARRAY[n]); bad := array_fill(0::bigint, ARRAY[n]);
  -- Pass 1: every practice, one at a time, in its own scope. A statement is checked by the new function itself.
  FOR i IN 1..n LOOP
    PERFORM set_config('app.practice_ids', ARRAY[ids[i]]::text, true);
    SELECT count(*), count(*) FILTER (WHERE roi_links_valid(s.links) IS NOT TRUE) INTO c_seen, c_bad FROM roi_statement s WHERE s.practice_id = ids[i];
    seen[i] := c_seen; bad[i] := c_bad;
  END LOOP;
  t1 := clock_timestamp();
  -- Closing: the stored count of every practice against the count checked. The table is insert-only (its trigger
  -- refuses DELETE and TRUNCATE; an UPDATE cannot change links), so an equal count is the same set of statements.
  IF current_setting('w41.lock') = '1' THEN
    FOR attempt IN 1..30 LOOP
      BEGIN
        LOCK TABLE roi_statement IN SHARE MODE NOWAIT; locked := true; EXIT;
      EXCEPTION WHEN lock_not_available THEN PERFORM pg_sleep(1);
      END;
    END LOOP;
    IF NOT locked THEN
      RAISE EXCEPTION 'roi_statement stayed in use for 30 seconds at the preflight''s closing count; run the deploy again' USING ERRCODE = 'lock_not_available';
    END IF;
  END IF;
  t2 := clock_timestamp();
  FOR pass IN 1..3 LOOP
    moved := 0;
    arrived := ARRAY(SELECT id FROM practice WHERE id <> ALL (ids) ORDER BY id);
    IF cardinality(arrived) > 0 THEN
      ids := ids || arrived; seen := seen || array_fill(0::bigint, ARRAY[cardinality(arrived)]); bad := bad || array_fill(0::bigint, ARRAY[cardinality(arrived)]);
      n := cardinality(ids);
    END IF;
    FOR i IN 1..n LOOP
      PERFORM set_config('app.practice_ids', ARRAY[ids[i]]::text, true);
      SELECT count(*) INTO stored FROM roi_statement s WHERE s.practice_id = ids[i];
      IF stored <> seen[i] THEN
        moved := moved + 1; rescans := rescans + 1;
        SELECT count(*), count(*) FILTER (WHERE roi_links_valid(s.links) IS NOT TRUE) INTO c_seen, c_bad FROM roi_statement s WHERE s.practice_id = ids[i];
    seen[i] := c_seen; bad[i] := c_bad;
      END IF;
    END LOOP;
    EXIT WHEN moved = 0 OR locked;
  END LOOP;
  IF moved > 0 AND NOT locked THEN
    RAISE EXCEPTION 'statements kept arriving in % practices through three closing counts; run the deploy again', moved USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  FOR i IN 1..n LOOP
    total := total + seen[i]; refused := refused + bad[i];
    IF bad[i] > 0 THEN
      hit := hit + 1;
      IF cardinality(refused_ids) < 20 THEN
        PERFORM set_config('app.practice_ids', ARRAY[ids[i]]::text, true);
        more := ARRAY(SELECT s.id FROM roi_statement s WHERE s.practice_id = ids[i] AND roi_links_valid(s.links) IS NOT TRUE ORDER BY s.id LIMIT 20 - cardinality(refused_ids));
        refused_ids := refused_ids || more;
      END IF;
    END IF;
  END LOOP;
  -- The empty-pass guard, by another road: with every practice in scope, is there any statement at all? The probe
  -- stops at the first row it can see, so the whole list is read against one row, not a million.
  PERFORM set_config('app.practice_ids', ids::text, true);
  probe := EXISTS (SELECT 1 FROM roi_statement);
  PERFORM set_config('app.practice_ids', '{}', true);
  IF probe <> (total > 0) THEN
    RAISE EXCEPTION 'the stored-statement preflight read % statements in % practices, but the table % empty; nothing is changed', total, n, CASE WHEN probe THEN 'is not' ELSE 'is' END USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF refused > 0 THEN
    RAISE EXCEPTION '% of % stored ROI statements, in % of % practices, fail the new roi_links_valid; nothing is changed. Statement IDs (the first %): %',
      refused, total, hit, n, cardinality(refused_ids), array_to_string(refused_ids, ', ') USING ERRCODE = 'check_violation';
  END IF;
  RAISE NOTICE 'preflight: % statements checked in % practices, 0 refused; scan % ms, lock wait % ms, closing % ms, % practices read again (lock held from then to commit: %)',
    total, n, round(extract(epoch FROM t1 - t0) * 1000), round(extract(epoch FROM t2 - t1) * 1000), round(extract(epoch FROM clock_timestamp() - t2) * 1000), rescans, locked;
END $$;

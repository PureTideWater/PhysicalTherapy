-- The key registry's two validations (LANES.md Queues item 37; docs/adr/0095). After the key registry's migration,
-- in a file of its own so that migration's exclusive locks are released before any scan starts.
--
-- What it does: validates user_session_key_digest, mail_send_kind and mail_send_stream_kind, which that migration
-- added NOT VALID. Each VALIDATE takes SHARE UPDATE EXCLUSIVE on its table, which blocks no read and no write, for one
-- scan (it conflicts only with a vacuum or another schema change). The locks are taken first with NOWAIT in the
-- loop of docs/adr/0083, once a second, up to 300 tries; a refused try holds and queues nothing.
--
-- Tables touched: user_session, mail_send (catalog flags only; no row changes). No function, no policy, no grant.
-- Safe with the previous image running: nothing it reads or writes changes. Safe to run again: validating a valid
-- constraint does nothing. Runs as tp_owner.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conrelid = 'public.user_session'::regclass AND c.conname = 'user_session_key_digest')
     OR position('hardware_keys_removed' IN (SELECT pg_get_constraintdef(c.oid) FROM pg_constraint c WHERE c.conrelid = 'public.mail_send'::regclass AND c.conname = 'mail_send_kind')) = 0
     OR position('hardware_keys_removed' IN (SELECT pg_get_constraintdef(c.oid) FROM pg_constraint c WHERE c.conrelid = 'public.mail_send'::regclass AND c.conname = 'mail_send_stream_kind')) = 0 THEN
    RAISE EXCEPTION 'the key registry''s constraints are not the ones this migration validates; it runs after the key registry''s migration'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
END;
$$;

DO $$
BEGIN
  FOR attempt IN 1..300 LOOP
    BEGIN
      LOCK TABLE user_session IN SHARE UPDATE EXCLUSIVE MODE NOWAIT;
      LOCK TABLE mail_send IN SHARE UPDATE EXCLUSIVE MODE NOWAIT;
      RETURN;
    EXCEPTION WHEN lock_not_available THEN
      PERFORM pg_sleep(1);
    END;
  END LOOP;
  RAISE EXCEPTION 'user_session or mail_send stayed under a vacuum or a schema change for five minutes; run the deploy again (docs/adr/0095)' USING ERRCODE = 'lock_not_available';
END;
$$;

ALTER TABLE user_session VALIDATE CONSTRAINT user_session_key_digest;
ALTER TABLE mail_send VALIDATE CONSTRAINT mail_send_kind;
ALTER TABLE mail_send VALIDATE CONSTRAINT mail_send_stream_kind;

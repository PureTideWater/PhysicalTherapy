-- The console's specialist queue, counted practice by practice (PRD 7, Internal console; docs/adr/0047).
--
-- 20261027090000_packet_and_ledger_review.sql gave console_contract_queue() its regulations column by
-- joining each practice's packet versions to "packet" on its current version. With every active
-- practice in scope for the one query (the function's own app.practice_ids), the packet side was read
-- by that scope alone: for each practice, and each of its versions citing the regulation, every packet
-- of every practice was fetched and checked against every practice's ID. Measured on a synthetic
-- database of 600 practices with two packets each, the column alone took 405 seconds; driven from the
-- practice's own packets (packet_by_practice), then their current versions by primary key, it takes
-- about a second and counts the same. The generated route tests, which build hundreds of practices in
-- one database, timed out on the queue.
--
-- Only the regulations column changes; the other columns, the callers it answers and its scope
-- handling are as before.
--
-- Runs as tp_owner. Safe with the previous image running: the function keeps its name, arguments and
-- columns, so CREATE OR REPLACE keeps its grants, and every caller reads the same rows.

CREATE OR REPLACE FUNCTION console_contract_queue() RETURNS TABLE (
  practice_id uuid, name text, documents_awaiting bigint, drafts bigint, proposals_awaiting bigint, awaiting_sign_off bigint,
  open_questions bigint, regulations_awaiting bigint, support_grant_ends_at timestamptz
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  callers_scope text := current_setting('app.practice_ids', true);
BEGIN
  IF NOT (coalesce(app_actor_platform_permitted('contract.review'), false) OR coalesce(app_actor_platform_permitted('support_grant.create'), false)) THEN
    RETURN;
  END IF;
  -- Every active practice in scope for the one query below; the caller's scope is put back after it.
  PERFORM set_config('app.practice_ids', (SELECT '{' || coalesce(string_agg(p.id::text, ','), '') || '}' FROM practice p WHERE p.status = 'active'), true);
  RETURN QUERY
    SELECT p.id, p.name,
           (SELECT count(*) FROM source_document d
             WHERE d.practice_id = p.id AND d.kind IN ('contract', 'exhibit', 'payer_letter') AND d.scan_status = 'clean' AND d.status = 'stored'
               AND NOT EXISTS (SELECT 1 FROM contract_version v
                                WHERE v.practice_id = d.practice_id AND d.id = ANY (v.source_document_ids) AND v.status IN ('approved', 'signed_off', 'superseded'))),
           (SELECT count(*) FROM contract_version v WHERE v.practice_id = p.id AND v.status = 'draft'),
           (SELECT count(*) FROM contract_version v WHERE v.practice_id = p.id AND v.status = 'proposed'),
           (SELECT count(*) FROM contract_version v WHERE v.practice_id = p.id AND v.status = 'approved'),
           (SELECT count(*) FROM contract_question q WHERE q.practice_id = p.id AND q.status = 'open'),
           -- The practice's packets first, then each one's current version: both read by the practice.
           (SELECT count(*) FROM packet k JOIN packet_version v ON v.id = k.current_version_id AND v.practice_id = k.practice_id
             WHERE k.practice_id = p.id AND v.content -> 'citation' ->> 'kind' = 'regulation' AND v.regulation_confirmed_by IS NULL AND v.approved_by IS NULL),
           (SELECT max(least(s.expires_at, s.created_at + interval '4 hours')) FROM support_grant s
             WHERE s.practice_id = p.id AND s.user_id = app_actor_id()
               AND s.created_at <= now() AND now() < s.expires_at AND now() < s.created_at + interval '4 hours')
      FROM practice p
     WHERE p.status = 'active'
     ORDER BY p.name, p.id;
  PERFORM set_config('app.practice_ids', coalesce(callers_scope, '{}'), true);
END;
$$;

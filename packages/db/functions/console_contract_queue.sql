-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- console_contract_queue()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 34782bbb84bc92d2
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.console_contract_queue()
 RETURNS TABLE(practice_id uuid, name text, documents_awaiting bigint, drafts bigint, proposals_awaiting bigint, awaiting_sign_off bigint, open_questions bigint, regulations_awaiting bigint, support_grant_ends_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
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
$function$;
ALTER FUNCTION public.console_contract_queue() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.console_contract_queue() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.console_contract_queue() TO tp_app;

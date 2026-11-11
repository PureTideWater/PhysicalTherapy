-- A payer's answer and a contract's source are never the same document, in Postgres; a person's "Window passed" only
-- on a window that has ended; and the link that says a letter was uploaded for a submission (docs/adr/0085, the dated
-- amendment of 2026-11-11; design section 7.2 of the payer-response pull request, items 1 to 5).
--
-- Each rule below is one the web's handlers already apply (CLAUDE.md: check in the handler and in Postgres):
-- 1. case_line_rules(): a person writes a line off as "Window passed" only once the line's dispute window has ended,
--    by the date rule the function already applies to triage's strike and to a reopen.
-- 2. console_contract_queue(): a payer's answer is not a document awaiting abstraction. The count leaves out a
--    document a payer response names and one filed for a submission. With it, the index payer_response_by_document.
-- 3. payer_response_belongs(): the document a response names is the practice's, top-level, a payer letter or other
--    document, scanned clean, stored, and no contract version's source.
-- 4. contract_version_documents_ok(): a contract version never names a document a payer response names, or a letter
--    filed for a submission.
-- 5. source_document.filed_for_submission_id: written only when the document is inserted, by a person who logs
--    submissions, for the latest submission of a case of the practice; a zip's entries take their zip's.
--
-- No table is created. No amount, stage, ledger table, policy, job or approval changes. Five functions are replaced
-- with CREATE OR REPLACE, which keeps each one's identity, owner and grants. Three keep every attribute. One changes
-- its language and volatility, contract_version_documents_ok (section 5 says why), and one gains a search_path,
-- source_document_rules (section 4). The application role gains one right, INSERT on the new column, and no UPDATE on
-- it. Runs as tp_owner.
--
-- Items 3 and 4 shut each other out under one lock, the one the web's handlers take
-- (apps/web/src/lib/contracts/tagging.ts, DOCUMENT_USE_LOCK): pg_advisory_xact_lock on 'document_use:' and the
-- document's id. Each function takes the lock, then checks, and the lock is held to the end of the transaction, so of
-- a response naming a document and a version naming it at the same moment, the second waits for the first to commit
-- and is then refused. That is true only at READ COMMITTED, where the check after the wait reads what the wait was
-- for; at REPEATABLE READ or above it would read the transaction's first snapshot and pass, so both functions refuse
-- there (as migrations 20261103090000 and 20261112090000 do). No mutating route runs above READ COMMITTED.
--
-- Safe with the previous image running, and on rollback: every new refusal mirrors a check that image's handlers make
-- before they write (since the payer-response pull request), the new column is nullable and nothing writes it yet,
-- and no image reads a replaced function's text. The column and the indexes stay on a rollback.

-- ---------------------------------------------------------------------------------------------------
-- 1. The table locks, without a queue
-- ---------------------------------------------------------------------------------------------------

-- The new column and its foreign key need ACCESS EXCLUSIVE on source_document and SHARE ROW EXCLUSIVE on submission;
-- the index needs SHARE on payer_response. payer_response and contract_version are also held in SHARE so that no
-- response or version is being written while the preflight below reads them and the rules are replaced: a writer
-- that began under the old rules has committed or rolled back before the locks are granted, and the next one runs
-- the new rules. Each try takes the four locks in one subtransaction with NOWAIT: a refused try releases what it took
-- and queues nobody behind it. Held to the end of the migration.
DO $$
BEGIN
  FOR attempt IN 1..300 LOOP
    BEGIN
      LOCK TABLE source_document IN ACCESS EXCLUSIVE MODE NOWAIT;
      LOCK TABLE submission IN SHARE ROW EXCLUSIVE MODE NOWAIT;
      LOCK TABLE payer_response IN SHARE MODE NOWAIT;
      LOCK TABLE contract_version IN SHARE MODE NOWAIT;
      RETURN;
    EXCEPTION WHEN lock_not_available THEN
      PERFORM pg_sleep(1);
    END;
  END LOOP;
  RAISE EXCEPTION 'source_document, submission, payer_response or contract_version stayed in use for five minutes; run the deploy again (docs/adr/0085)' USING ERRCODE = 'lock_not_available';
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- 2. Preflight: no document is already both a response's letter and a version's source
-- ---------------------------------------------------------------------------------------------------

-- Items 3 and 4 hold "never both" for every row from here on only if it is true now. The handlers have refused both
-- halves since the payer-response pull request, so a database loaded through them holds none. If one does, this
-- migration stops and changes nothing, saying how many (a count only: no id, no text): a version holding such a
-- document could otherwise never be edited or amended again (docs/runbooks/deploy-and-rollback.md). Every practice
-- is in scope for the read (deleted ones included), as migration 20261109090000's backfill; the scope is emptied after.
SELECT set_config('app.practice_ids', coalesce((SELECT array_agg(id)::text FROM practice), '{}'), true);
DO $$
DECLARE
  both_uses bigint;
BEGIN
  SELECT count(*) INTO both_uses
    FROM source_document d
   WHERE EXISTS (SELECT 1 FROM payer_response r WHERE r.practice_id = d.practice_id AND r.document_id = d.id)
     AND EXISTS (SELECT 1 FROM contract_version v WHERE v.practice_id = d.practice_id AND d.id = ANY (v.source_document_ids));
  IF both_uses > 0 THEN
    RAISE EXCEPTION '% document(s) are named by a payer response and by a contract version; nothing was changed (docs/runbooks/deploy-and-rollback.md)', both_uses USING ERRCODE = 'check_violation';
  END IF;
END;
$$;
SELECT set_config('app.practice_ids', '{}', true);

-- ---------------------------------------------------------------------------------------------------
-- 3. source_document.filed_for_submission_id, and the two indexes
-- ---------------------------------------------------------------------------------------------------

-- Why the document was uploaded, when it was uploaded for a payer's answer: the submission the response form was
-- open on. NULL for every other document, and for every document until the web writes it. Like a document's kind,
-- size, uploader and zip (migration 20261016090000), it is written at insert and never changed: the application role
-- gets INSERT on the column and no UPDATE, and source_document_rules() refuses a change by any role.
ALTER TABLE source_document ADD COLUMN filed_for_submission_id uuid REFERENCES submission (id);
GRANT INSERT (filed_for_submission_id) ON source_document TO tp_app;

-- A submission's own uploads, for the response form's list (few rows: only letters uploaded in that form).
CREATE INDEX source_document_by_filed_submission ON source_document (practice_id, filed_for_submission_id) WHERE filed_for_submission_id IS NOT NULL;

-- "Does a response name this document?", asked by console_contract_queue() for every document it counts, by
-- contract_version_documents_ok() for every document of a version, and by the web's lists.
CREATE INDEX payer_response_by_document ON payer_response (practice_id, document_id) WHERE document_id IS NOT NULL;

-- ---------------------------------------------------------------------------------------------------
-- 4. source_document_rules(): the link's rules
-- ---------------------------------------------------------------------------------------------------

-- The function is the one of migration 20261016090000 as later migrations left it, with these additions only:
-- - a top-level document inserted with the link is a payer letter, uploaded in their own name by a person who logs
--   submissions, for a submission of the practice that is its case's latest. "Latest" is read without the case's
--   submission lock: the link says why the letter was uploaded, a submission logged a moment later makes it "not the
--   latest" whether or not this check waited, and a response may name the letter either way. The checks run whether or
--   not the practice is in the transaction's scope: out of scope the lookups find nothing and the insert is refused.
-- - a zip's entry takes its zip's link (set here, so no writer can forget it), and one that names another is refused;
-- - the link never changes.
-- One attribute is added: SET search_path = pg_catalog, public, pg_temp, as every later trigger function of this
-- schema has. The function had none, so the "source_document" it reads a zip's row from was whatever the session's
-- search path found first, a temporary table of that name included; a zip's link read from there could name another
-- practice's submission (and a zip's uploader, scan verdict and format could be faked the same way before this
-- migration). With the path set, it reads public.source_document under the caller's policies. Still SECURITY INVOKER.
CREATE OR REPLACE FUNCTION source_document_rules() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $function$
@@SOURCE_DOCUMENT_RULES@@
$function$;

-- ---------------------------------------------------------------------------------------------------
-- 5. contract_version_documents_ok(): never a response's letter, never a letter filed for a submission
-- ---------------------------------------------------------------------------------------------------

-- Called only by contract_version_rules() (BEFORE INSERT OR UPDATE on contract_version; untouched here): on INSERT,
-- and when a draft or proposed version's terms change. No policy, constraint or index calls it.
--
-- It was LANGUAGE sql STABLE. It is now plpgsql and VOLATILE, and that is the point of the change, not a side effect:
-- a STABLE function reads the snapshot of the statement that called it, so a lock taken inside it would wait for the
-- other transaction and then check with a snapshot from before the wait, and never see the response that committed
-- meanwhile. In a VOLATILE plpgsql function each statement reads a new snapshot at READ COMMITTED, so the check after
-- the lock reads what the lock waited for. Same signature, return type and search_path; CREATE OR REPLACE keeps its
-- owner and its one grant (EXECUTE to tp_app).
--
-- For a version that names documents it: refuses above READ COMMITTED; takes each document's 'document_use:' lock, in
-- ascending id order, so two versions naming the same documents never take them in opposite orders; refuses, in its
-- own words, a document a payer response of the practice names or one filed for a submission; then answers the
-- question it always answered, word for word as before (each id once; each a clean contract, exhibit or payer-letter
-- document of the practice), which contract_version_rules() turns into its own refusal.
CREATE OR REPLACE FUNCTION contract_version_documents_ok(v contract_version) RETURNS boolean
LANGUAGE plpgsql VOLATILE SET search_path = pg_catalog, public, pg_temp AS $function$
DECLARE
  document uuid;
BEGIN
  IF cardinality(v.source_document_ids) > 0 THEN
    IF current_setting('transaction_isolation') <> 'read committed' THEN
      RAISE EXCEPTION 'a contract version''s documents are checked at READ COMMITTED' USING ERRCODE = 'feature_not_supported';
    END IF;
    FOR document IN SELECT DISTINCT x FROM unnest(v.source_document_ids) x ORDER BY x LOOP
      PERFORM pg_advisory_xact_lock(hashtextextended('document_use:' || document::text, 0));
    END LOOP;
    IF EXISTS (SELECT 1 FROM source_document d
                WHERE d.id = ANY (v.source_document_ids) AND d.practice_id = v.practice_id
                  AND (d.filed_for_submission_id IS NOT NULL
                       OR EXISTS (SELECT 1 FROM payer_response r WHERE r.practice_id = d.practice_id AND r.document_id = d.id))) THEN
      RAISE EXCEPTION 'a version''s documents are never a payer response''s letter or a letter filed for a submission' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN (SELECT count(DISTINCT x) FROM unnest(v.source_document_ids) x) = cardinality(v.source_document_ids)
     AND (SELECT count(*) FROM source_document d
           WHERE d.id = ANY (v.source_document_ids) AND d.practice_id = v.practice_id
             AND d.kind IN ('contract', 'exhibit', 'payer_letter') AND d.scan_status = 'clean') = cardinality(v.source_document_ids);
END;
$function$;

-- ---------------------------------------------------------------------------------------------------
-- 6. payer_response_belongs(): the letter a response names
-- ---------------------------------------------------------------------------------------------------

-- The function is the one of migration 20261023090000 with two changes, both only for a response that names a
-- document. Before the case's submission lock (so every path locks document, then submission; the handler already
-- holds the document's lock when this trigger runs) it refuses above READ COMMITTED and takes the document's
-- 'document_use:' lock. And where it checked only that the document is the practice's, it now checks the handler's
-- whole predicate (apps/web/src/lib/packets/submissions.ts, RESPONSE_DOCUMENT): the practice's, top-level, a payer
-- letter or other document, clean, stored, and named by no contract version of the practice in any status. One
-- message for every refusal, as the route has one. A response with no document is checked exactly as before.
CREATE OR REPLACE FUNCTION payer_response_belongs() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $function$
@@PAYER_RESPONSE_BELONGS@@
$function$;

-- ---------------------------------------------------------------------------------------------------
-- 7. case_line_rules(): a person's "Window passed" only on a window that has ended
-- ---------------------------------------------------------------------------------------------------

-- The function is the one of migration 20261019160000 with one branch added to a person's write-off, after the check
-- of their name and permission: 'window_passed' is refused while the line's window is unknown or has not ended, by the
-- same date the function already uses for triage's strike and for a reopen. It fires on the transition, so a line
-- already written off stays as it is. A case line's INSERT is unchanged (triage's own judgement, on its pass's date).
CREATE OR REPLACE FUNCTION case_line_rules() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $function$
@@CASE_LINE_RULES@@
$function$;

-- ---------------------------------------------------------------------------------------------------
-- 8. console_contract_queue(): a payer's answer is not a document awaiting abstraction
-- ---------------------------------------------------------------------------------------------------

-- The function is the one of migration 20261028090000 with two conditions added to documents_awaiting: the document
-- is not filed for a submission, and no payer response of its practice names it (the web's NOT_A_RESPONSE_LETTER,
-- apps/web/src/lib/contracts/contract-queries.ts). Nothing else changes: SECURITY DEFINER, the search_path with
-- pg_catalog first and pg_temp last, the permission gate, the transaction-local widening of app.practice_ids to the
-- active practices for its one query and the caller's scope put back after it, the columns it returns, its owner and
-- its one grant (EXECUTE to tp_app).
CREATE OR REPLACE FUNCTION console_contract_queue()
RETURNS TABLE (practice_id uuid, name text, documents_awaiting bigint, drafts bigint, proposals_awaiting bigint, awaiting_sign_off bigint, open_questions bigint, regulations_awaiting bigint, support_grant_ends_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $function$
@@CONSOLE_CONTRACT_QUEUE@@
$function$;

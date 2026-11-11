import re, sys
F = '/home/user/pr4/packages/db/functions/'
def body(name):
    import subprocess
    t = subprocess.run(['git', '-C', '/home/user/pr4', 'show', 'a3a32024:packages/db/functions/' + name + '.sql'], capture_output=True, text=True, check=True).stdout
    m = re.search(r'AS \$function\$\n(.*)\n\$function\$;', t, re.S)
    return m.group(1)
def sub(text, old, new):
    assert text.count(old) == 1, (text.count(old), old[:60])
    return text.replace(old, new)

clr = sub(body('case_line_rules'),
"""      RAISE EXCEPTION 'a line is written off by a person who works cases, in their own name' USING ERRCODE = 'insufficient_privilege';
""",
"""      RAISE EXCEPTION 'a line is written off by a person who works cases, in their own name' USING ERRCODE = 'insufficient_privilege';
    ELSIF NEW.written_off_reason = 'window_passed' AND (window_end IS NULL OR window_end >= (now() AT TIME ZONE 'UTC')::date) THEN
      RAISE EXCEPTION 'a person writes a line off as window passed only once its window has ended' USING ERRCODE = 'check_violation';
""")

ccq = sub(body('console_contract_queue'),
"""AND d.scan_status = 'clean' AND d.status = 'stored'
""",
"""AND d.scan_status = 'clean' AND d.status = 'stored'
               AND d.filed_for_submission_id IS NULL
               AND NOT EXISTS (SELECT 1 FROM payer_response r WHERE r.practice_id = d.practice_id AND r.document_id = d.id)
""")

prb = body('payer_response_belongs')
prb = sub(prb,
"""  SELECT s.id, s.case_id, s.submitted_on INTO sent FROM submission s""",
"""  IF NEW.document_id IS NOT NULL THEN
    IF current_setting('transaction_isolation') <> 'read committed' THEN
      RAISE EXCEPTION 'a payer response naming a document is recorded at READ COMMITTED' USING ERRCODE = 'feature_not_supported';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('document_use:' || NEW.document_id::text, 0));
  END IF;
  SELECT s.id, s.case_id, s.submitted_on INTO sent FROM submission s""")
prb = sub(prb,
"""  IF NEW.document_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM source_document d WHERE d.id = NEW.document_id AND d.practice_id = NEW.practice_id) THEN
    RAISE EXCEPTION 'a payer response''s document is a document of its practice' USING ERRCODE = 'check_violation';
""",
"""  IF NEW.document_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM source_document d
        WHERE d.id = NEW.document_id AND d.practice_id = NEW.practice_id AND d.parent_document_id IS NULL
          AND d.kind IN ('payer_letter', 'other') AND d.scan_status = 'clean' AND d.status = 'stored'
          AND NOT EXISTS (SELECT 1 FROM contract_version v WHERE v.practice_id = d.practice_id AND d.id = ANY (v.source_document_ids))) THEN
    RAISE EXCEPTION 'a payer response''s document is a clean, stored payer letter or other document of its practice that no contract version names' USING ERRCODE = 'check_violation';
""")

sdr = body('source_document_rules')
sdr = sub(sdr, "  zip_format text;\n", "  zip_format text;\n  zip_filed uuid;\n  filed record;\n")
sdr = sub(sdr, "SELECT p.uploaded_by, p.scan_status, p.format_id INTO zip_uploader, zip_scan, zip_format",
               "SELECT p.uploaded_by, p.scan_status, p.format_id, p.filed_for_submission_id INTO zip_uploader, zip_scan, zip_format, zip_filed")
sdr = sub(sdr,
"""      RAISE EXCEPTION 'a zip entry carries its zip''s export format' USING ERRCODE = 'check_violation';
    END IF;
""",
"""      RAISE EXCEPTION 'a zip entry carries its zip''s export format' USING ERRCODE = 'check_violation';
    END IF;
    IF TG_OP = 'INSERT' THEN
      IF NEW.filed_for_submission_id IS NOT NULL AND NEW.filed_for_submission_id IS DISTINCT FROM zip_filed THEN
        RAISE EXCEPTION 'a zip entry carries its zip''s submission' USING ERRCODE = 'check_violation';
      END IF;
      NEW.filed_for_submission_id := zip_filed;
    END IF;
""")
sdr = sub(sdr,
"""  IF NEW.status IN ('scanned', 'parse_queued') AND NEW.scan_status <> 'clean' THEN""",
"""  IF TG_OP = 'INSERT' AND NEW.parent_document_id IS NULL AND NEW.filed_for_submission_id IS NOT NULL THEN
    IF NEW.kind <> 'payer_letter' THEN
      RAISE EXCEPTION 'a letter is filed for a submission as a payer letter' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT coalesce(app_actor_is_person(), false) OR NEW.uploaded_by IS DISTINCT FROM app_actor_id()
       OR NOT coalesce(app_actor_permitted(NEW.practice_id, 'submission.log'), false) THEN
      RAISE EXCEPTION 'a letter is filed for a submission by a person who logs submissions, in their own name' USING ERRCODE = 'insufficient_privilege';
    END IF;
    SELECT s.id, s.case_id INTO filed FROM submission s WHERE s.id = NEW.filed_for_submission_id AND s.practice_id = NEW.practice_id;
    IF NOT FOUND OR filed.id IS DISTINCT FROM case_latest_submission(filed.case_id) THEN
      RAISE EXCEPTION 'a letter is filed for the latest submission of a case of its practice' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF NEW.status IN ('scanned', 'parse_queued') AND NEW.scan_status <> 'clean' THEN""")
sdr = sub(sdr,
"""  IF TG_OP = 'UPDATE' THEN
""",
"""  IF TG_OP = 'UPDATE' THEN
    IF NEW.filed_for_submission_id IS DISTINCT FROM OLD.filed_for_submission_id THEN
      RAISE EXCEPTION 'the submission a document was filed for never changes' USING ERRCODE = 'check_violation';
    END IF;
""")
tpl = open('template.sql').read()
for k, v in dict(CASE_LINE_RULES=clr, CONSOLE_CONTRACT_QUEUE=ccq, PAYER_RESPONSE_BELONGS=prb, SOURCE_DOCUMENT_RULES=sdr).items():
    tpl = sub(tpl, '@@' + k + '@@', v)
assert '@@' not in tpl
open('20261114090000_payer_response_document_rules.sql', 'w').write(tpl)
print('ok', len(tpl.splitlines()), 'lines')

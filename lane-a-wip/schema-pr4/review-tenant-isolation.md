# Schema PR 4: the tenant isolation and authorization review (on a539fa14), with W15's dispositions

The reviewer (read-only; it may not write files) ran every experiment as tp_app on a copy of the migrated database
and handed its report back in its message; W15 wrote this record from it on 2026-11-11 and checked each finding.

## Findings
- **F1, should-fix: TAKEN.** `source_document_rules()` has no `search_path` of its own, so its unqualified
  `FROM source_document p` can be steered by a temporary table of that name. Reproduced as tp_app: a zip entry of
  practice A took the link of practice B's submission from a shadowing temp table, and a made-up id answered with the
  foreign key's error (an existence test of any practice's submission id). **W15's check: not reachable on a
  migrated database.** There tp_app has neither TEMP on the database nor CREATE on public (both `f` on a database the
  runner migrated); the reviewer's copy was made with `CREATE DATABASE ... TEMPLATE`, which does not copy the
  database's own privileges, so TEMP was PUBLIC's again in the copy. It is defence in depth for a database where that
  right was left on; before this migration the same shadow could fake a zip's uploader,
  scan verdict and format. **Fix:** the function gets `SET search_path = pg_catalog, public, pg_temp` (the design's
  proposal P2, now taken), with a test (a superuser's temp table, read as tp_app) that failed first: the entry took the shadow's link. The composite foreign key the
  reviewer also offered is not taken: no table of this schema has one (plain key plus the trigger's practice check is
  the house pattern), and with the search path fixed the trigger's own lookup is the practice's.
- **F2, should-fix: NOT TAKEN, recorded as a residual.** A letter filed for a submission whose bytes equal an earlier
  unlinked upload becomes `duplicate`; the earlier copy stays stored and unlinked, so it is still counted and can still
  be a version's source until a response names it (reproduced). The reviewer's fix, "treat a document as filed when any
  row of the practice with the same hash is linked", is refused for this reason: with rule 4 checking every document
  of a version every time, one person with `submission.log` who uploads a copy of a contract's source letter in a
  response form would make every version naming that letter impossible to edit or amend, for good (the link never
  changes). That turns one workflow's upload into a lock on the other's records, and expected amounts trace to those
  versions. What the duplicate leaves is no worse than before the form's upload: the earlier copy was already a payer
  letter in the contract lists, uploaded there outside the form; the form then chooses that original for the response
  (design 2.6), and the response, once recorded, closes it under rules 3 and 4. Carried to the PR description ("not
  closed") and to the web half's design (P3): what the form says and does when its upload duplicates an unlinked copy.
- **F3, note (older than this PR).** A response naming a made-up document id is refused by the foreign key (23503)
  before the trigger, another practice's real document by the trigger's one message (23514). The web checks first,
  so no person sees either. The design's "one message for every refusal" is reworded to "every refusal the trigger makes".
- **Test note: TAKEN.** `document-use-rules.db.test.ts` acted as tp_owner; it now acts as tp_app.

## Not broken (what was tried)
- `console_contract_queue()`: the scope is restored after a statement timeout in a savepoint and through a cursor;
  an error without a savepoint aborts the transaction; the new conditions join on the practice; header, search_path
  and grants unchanged.
- The link's rules: another practice's submission, a made-up id and a scope holding both practices get one message;
  a job, a person without `submission.log` and another person's name are refused; tp_app has INSERT on the column and
  nothing else new; no role changes the link.
- The advisory lock: tp_app could always take any key, and the web's handler already locks whatever id it is sent;
  a refused insert in a savepoint leaves no lock; a stall lasts no longer than the caller's own request.
- Catalog and cross-tenant tests: 2 files, 1,219 passed. No registry row is needed (no table added).
- Messages: no name, date or text; the preflight prints a count.

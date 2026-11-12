<!-- The body below follows the whole, unedited output of
`pnpm -s db:domain-model --summary-since origin/claude/build-platform --function-diffs list`, which opens the description. -->

## What changes

One migration, `20261114090000_payer_response_document_rules.sql`, makes Postgres apply five rules the web's handlers already apply (the payer-response pull request, #85, left them "for Lane A"; its design section 7.2, items 1 to 5):

1. A person writes a line off as "Window passed" only once the line's dispute window has ended (`case_line_rules`).
2. A payer's answer is not a "document awaiting abstraction": the console's contract queue leaves out a document a payer response names, and a letter filed for a submission (`console_contract_queue`; with it, an index on a response's document).
3. The document a response names is the practice's, top-level, a payer letter or other document, scanned clean, stored, and no contract version's source (`payer_response_belongs`).
4. A contract version never names a document a payer response names, or a letter filed for a submission (`contract_version_documents_ok`).
5. A new, empty column, `source_document.filed_for_submission_id`: the submission a letter was uploaded for in the response form. It is written only when the document is inserted, by a person who logs submissions, in their own name, for the latest submission of a case of the practice; a zip's entries take their zip's; it never changes, and no role moves a document under or out of a zip afterwards.

Nobody using the product sees a change. Every new refusal mirrors a check the handlers make first, and nothing writes the new column until the web half follows (Lane B's: the upload route, the contract lists, the response form's list).

**This is the schema batching plan's PR 4. PR 3 is skipped and keeps its place:** its subject, slice 4's export render, is not built yet (ruling (a): the next schema PR is always in build while the current one waits).

It also carries one record with no code: ADR 0093's Status line moves from "proposed" to "accepted" (the founder approved it with #142, merged as 3bff4fd6).

## Why

CLAUDE.md: never rely on the handler alone; check in the handler and in Postgres. ADR 0085 recorded these five as owed by the database, the fifth as a security residual: a letter uploaded in the response form but named by no response was still offered as a contract's source. ADR 0085's dated amendment of 2026-11-11 (in this pull request) records the database half. Test matrix: CAS-45, CAS-48 and the new CAS-58.

## What the founder should know before approving

1. **One thing is not closed, and it was a choice.** If a person uploads a letter in the response form and its bytes are the same as an earlier upload that carries no link (for example the same letter uploaded earlier on the Contracts screen), the new upload is marked a duplicate, and the earlier copy stays exactly as it was: stored, not linked to any submission, still shown in the contract lists and still able to be named as a contract version's source, until a response names it. From the moment a response names it, rules 3 and 4 keep it out of the contract side for good. The review offered a fix, to treat a document as filed whenever any document of the practice with the same bytes (the same hash) is filed. **It was refused**, for this reason: rule 4 checks every document of a version every time the version is saved, and the link never changes. So one person who logs submissions, by uploading a copy of a contract's source letter in the response form, by mistake or on purpose, would make every contract version that names that letter impossible to edit or amend, permanently. Expected amounts trace to those versions. A gap that leaves one extra letter in a list was judged safer than a rule that lets one upload lock another workflow's records. What is left is no worse than today: the earlier copy was already a payer letter in the contract lists before the form was opened. What the form says and does when its upload duplicates an unlinked copy belongs to the web half and is recorded for it.
2. **One function changes its kind, deliberately.** `contract_version_documents_ok` was a STABLE SQL function and is now a VOLATILE plpgsql function. Rules 3 and 4 shut each other out under one lock per document (the lock the handlers already take): of a response and a version naming the same document at the same moment, the second waits for the first and is then refused. A STABLE function would wait and then check with what it saw before the wait, and miss the other's commit. No policy, constraint or index calls it; its one caller is the contract version trigger. Its answer, owner and grant are unchanged.
3. **A known crossing the web still has to close.** The database's own checks never deadlock with each other. A handler's lock followed by the database's can: two people who each add a different letter to two open contract versions that end up naming both letters can each hold one lock and wait for the other's. PostgreSQL ends one of the two requests with an error and nothing saved; the other is recorded; no wrong row is written. It needs that exact pattern at the same moment, and the fix is in the web's handlers (Lane B's files), recorded in ADR 0085's amendment.
4. **Two new refusals a handler never meets.** A response naming a document, and a contract version naming documents, are refused above READ COMMITTED (there the wait in point 2 would prove nothing). No mutating route runs above READ COMMITTED, and a test holds that.
5. **The migration refuses to apply over a broken state.** Before it changes anything it counts, in every practice, the documents that both a response and a version name, and stops with the count alone if there is one. It asks this of the responses and the versions, not of every document, so the time it holds the documents table does not grow with uploads; it does grow with the number of practices (measured: over a minute and a half at 2,000 practices on synthetic rows), which no environment has when this applies, once, before launch. None can exist where data was loaded through the handlers since #85, and the seeded database has none. `docs/runbooks/deploy-and-rollback.md` has a new section: what to keep idle at the deploy (the migration needs `source_document` free of every open transaction, for a moment, within five minutes, or it changes nothing and the deploy is run again), and what to do if the count is not zero (a finding for the founder, never a row changed by hand).
6. **Hazards from the new-migration list, each found by reading the five function files' diffs:**
   - a volatility and language change on `contract_version_documents_ok` (point 2; no policy calls it);
   - a new `SET search_path = pg_catalog, public, pg_temp` on `source_document_rules`, which had none (the tenant review's finding: a temporary table named `source_document` could stand in for the zip's row; not reachable by the application role on a migrated database, which cannot create one; fixed as defence in depth, with a test that failed first). It stays SECURITY INVOKER;
   - one new grant to a role that had none on that column: INSERT on `source_document.filed_for_submission_id` to `tp_app`, and no UPDATE;
   - a SECURITY DEFINER function replaced, `console_contract_queue`: two conditions added to one count. Its search path (`pg_catalog` first, `pg_temp` last), its permission gate, its transaction-local widening of `app.practice_ids` and the caller's scope put back after it, its owner and its one grant are unchanged, word for word.
   None of the others: no `set_config` added or changed, no built SQL, no LEAKPROOF, no STRICT removed, no grant to PUBLIC, no owner change, no new overload of a scope function, no scope check removed.

## What it does not change

- Pricing engine (`packages/pricing`): nothing.
- Ledger (`packages/ledger`): nothing. No ledger table is read, written or locked by the migration; `packages/ledger/src` is untouched.
- Database schema and migrations: one new migration: one nullable column with its foreign key, one column grant, two partial indexes, five functions replaced with `CREATE OR REPLACE` (each keeps its identity, owner and grants). No table, policy, trigger or job is added or removed; no amount, stage or approval changes. No applied migration is edited.
- Content releases (`content/`): nothing.
- Domain model (`docs/product/domain-model.md`), its approval line and `approvers.json`: the document is regenerated and its approval line is blank until the founder commits the suggested line; `approvers.json` is untouched.
- CI and the GitHub settings: nothing.
- The web and the worker: nothing. No handler, screen, word or job changes here.

## Checks

The required checks report on this page by themselves: <!-- required-checks -->`all green`, `mutation`,
`screening-capacity gate` and `approval-of-record`<!-- /required-checks -->.

| Command | Result |
| --- | --- |
@@CHECKS@@

## Reviewer agents' findings

Two adversarial reviews (the database one ran twice, in two sessions), then one review of the fixes alone; each finding checked before it was taken or refused.

| Reviewer | Finding | Resolution |
| --- | --- | --- |
| Tenant isolation and authorization | F1: `source_document_rules` has no search path of its own, so a temporary table named `source_document` could stand in for a zip's row and hand an entry another practice's link | Fixed (217e96ce), with a test that failed first. Checked: not reachable by `tp_app` on a migrated database (no TEMP right, no CREATE on `public`); defence in depth |
| Tenant isolation and authorization | F2: a filed letter whose bytes equal an earlier unlinked upload becomes a duplicate, and the earlier copy stays in the contract lists until a response names it | Not taken, recorded as open (point 1 above; ADR 0085's amendment): matching by hash would let one upload lock contract versions for good |
| Tenant isolation and authorization | F3 (older than this change): a response naming a made-up document id is refused by the foreign key, another practice's real document by the trigger's one message | Not a defect here: the web checks first, so no person sees either. The design's wording corrected to "every refusal the trigger makes" |
| Tenant isolation and authorization | The document-use tests acted as the owner role | Fixed (217e96ce): they act as the application role |
| Database | F1: a handler's one document lock, then the trigger's ascending locks, can cross with another request's: two people adding different letters to two open versions that end up naming both (reproduced as the application role). PostgreSQL ends one request with a deadlock error and nothing saved; no wrong row | Not a defect of the migration (the triggers alone never cross); deferred to the web half, where the fix is (take the trigger's locks in its order before the write, or answer the error as busy). Recorded in ADR 0085's amendment (f8732bda), which had wrongly said it ends as "busy" |
| Database | F2: the handlers hash the document id as the request sent it, the triggers hash the stored id's text; the two keys are equal only for a lowercase id | Not a defect here: the triggers hold the rule either way. Deferred to the web half (cast the id before hashing); recorded in the amendment |
| Database | F3: "read uncommitted" is refused too, though PostgreSQL runs it as READ COMMITTED | Not a defect: safe, and nothing uses it |
| Database | F4, F5: the lock loop's session holds a snapshot for up to five minutes; the index build on `source_document` is the whole of the time the locks are held (about a second per million documents on a development machine) | Recorded in the runbook's new section (f8732bda) |
| Database (a second run of the same review) | S1: the preflight read every document against every contract version while `source_document` was held against all access (13.4 s at one million documents and 100 versions, synthetic) | Fixed (c07965d6), with a test that failed first: it asks the responses and the versions and never reads the documents; the same count |
| Database (second run) | N1: the owner role could move a document under or out of a zip, leaving an entry whose link is not its zip's (the application role never could) | Fixed (c07965d6), with a test that failed first: `source_document_rules` refuses the move for every role |
| Database (second run) | N3: `contract_version_documents_ok` takes a lock for every id before it knows any is a document | Not taken: any role can take advisory locks itself, and the web caps a version at 100 documents |
| Database, the fixes' own review | The new preflight is slow when thousands of practices are in scope at once (over a minute and a half on synthetic rows for 2,000 practices, 100,000 responses, 20,000 versions; the first form took 47 s there) | Not taken, recorded in the runbook: this migration applies once to each environment, before launch, when those tables are small. See point 5 |
| Database, the fixes' own review | The two new tests left cases out (an entry taken out of its zip or moved to another; a join in the preflight) | Fixed (9090c4b3) |
| Database | Not broken: a refused try of the lock loop holds and queues nothing; the check after the wait reads the other's commit in both orders, on INSERT and on UPDATE; no index, policy, constraint or view depends on the function whose kind changed; the preflight reads every practice and misses no pair; the previous image runs unchanged | None needed |

## Freeze exception

No: it changes none of them. The engine's arithmetic, the ledger's semantics, the content pipeline, the security program and the milestones are untouched; the five rules are ones the handlers already apply, now also applied in Postgres.

## Domain model

The summary that opens this description is the whole output of `pnpm -s db:domain-model --summary-since origin/claude/build-platform --function-diffs list`. Document SHA-256 before: `@@BEFORE@@` (approved with #143). After: `@@AFTER@@`, awaiting approval. The copy in the `domain model` check's job summary is the one that counts, with the five function files' diffs. The approval line is blank; the build posts it as a suggested change and never writes it. The hazards read from those diffs are point 6 above.

## The founder's approval

This pull request merges only after the founder's approving GitHub review of its latest commit and green required
checks. The build waits for that review from the day it works under its own GitHub account
(`docs/runbooks/github-governance.md`, 3i), and from step 5 GitHub requires it too; before 3i, on green checks alone
(reconciliation 001, D4 (a)). The review is the record of the approval, not anything written here; a new commit
dismisses it. The build then merges, and never reviews.

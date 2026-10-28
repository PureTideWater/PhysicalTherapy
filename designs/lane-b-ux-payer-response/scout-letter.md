# Scout B: the payer's letter uploaded inside "Log a payer response" (UX-007, C-011)

UX PR 10, `co-001/ux-payer-response`. Read from the checkout `/home/user/ux-payer-response` at 165c599
(`claude/build-platform` with #74). Every `file:line` below is at that commit unless it says otherwise. No product
code was changed. Synthetic data only.

## 0. Answers in short

1. **Today:** the form tells the person to upload the letter on Uploads, which cannot take one. With no letter on
   file the form does not render at all. The only path that works is the Contracts panel, and a letter uploaded
   there joins the contract lists: 'Documents to tag', 'Documents awaiting abstraction' and the console count.
2. **Exclusion:** filter both `listContractDocuments` selections with "no `payer_response` names this document"
   (`payer_response.document_id`). It needs no column and no kind. A terms letter, which no response names, stays
   in. The same filter in `console_contract_queue()` is a migration, so it goes to Lane A. Cited in section 2.4.
3. **Upload in the form:** use the shared `Uploader` with `kinds=[payer_letter]`, inside the `ActionForm` where the
   Document field sits. Render the form always, never swap it for an empty state. The uploader's own
   `router.refresh()` after the scan keeps the typed fields (ADR 0077 D10). The best version needs four additive
   uploader props or fixes, which goes past "only pass the kind" (section 3.3). That is a decision for the
   orchestrator.
4. **New defects found:**
   - The response's document is not checked for kind, scan or status anywhere: not in the route, the service or
     Postgres.
   - The Document list shows held documents, because its query has no status filter.
   - `lib/routes/submissions.ts` must change, but it is missing from the PR's file list.
5. **For Lane A (migrations):**
   - (a) The exclusion in `console_contract_queue()`, with an index on `payer_response (practice_id, document_id)`.
   - (b) `payer_response_belongs()` refuses a document that is not a clean, stored, top-level payer letter or
     other document.
   - (c) Optional: a link recorded at upload time (letter to submission), which closes the window between the
     upload and the recording.
   - No new document kind is needed.
6. **Coordination:** open draft PRs #75 and #78 both change `uploader.tsx` (section 5).

## 1. Today's flow

### 1.1 What the person reads and does

1. On `/p/[practiceId]/cases/[caseId]/submissions`, the 'Log a payer response' card says "with its document (upload
   the payer's letter on the Uploads screen first)" (`app/p/[practiceId]/cases/[caseId]/submissions/page.tsx:268`).
2. With no clean payer letter or other document on file, the card shows only the EmptyState "No response document
   yet. Upload the payer's letter (as a payer letter or other document) on the Uploads screen; it appears here once
   it is scanned clean." (`:271-275`). No fields render, so nothing can be typed first.
3. Uploads offers only '835 remittance' and 'ERA export' (`app/p/[practiceId]/uploads/page.tsx:40-48`), so the step
   the page names fails. 'Other document' cannot be uploaded from any screen.
4. The path that works, and the one the e2e takes, is Contracts: choose 'Kind of document', then 'Payer letter',
   then upload (`apps/web/e2e/packets.spec.ts:473-477`; the review cited :421-423 at 4d99df8). The panel offers
   `CONTRACT_DOCUMENT_KINDS` (`lib/routes/contracts.ts:47`, used at :123, rendered at
   `app/p/[practiceId]/contracts/page.tsx:202-224`).
5. The person returns to Submissions and chooses the letter in 'Document' (`submissions/page.tsx:293-308`). The
   options come from `responseDocuments()` (`lib/packets/submissions.ts:330-338`), read only for a person who logs
   (`lib/routes/submissions.ts:106`).

### 1.2 What goes wrong

- **The letter joins the contract documents.** `listContractDocuments` takes kinds `CONTRACT_KINDS =
  ('contract','exhibit','payer_letter')` (`lib/contracts/contract-queries.ts:16`, :347-359). The letter therefore
  shows in:
  - the Contracts page's 'Documents to tag' (`lib/routes/contracts.ts:116`, and the contract page :161);
  - the specialist's 'Documents awaiting abstraction' (`lib/routes/abstraction.ts:110`);
  - the console's `documents_awaiting` count (section 2.4).
- **The Document list takes every clean payer letter and other document of the practice:** every case, terms letters
  included, newest 50, with `parent_document_id IS NULL` (`lib/packets/submissions.ts:332-334`).
- **New defect: the list has no status filter.** Intake records the clean verdict before it deduplicates and files
  the document (`apps/worker/src/intake/intake.ts:249`, then `claimBytes` :124-139 and disposition). A clean
  document may still be:
  - a duplicate (status `duplicate`, :135);
  - an expanded zip parent (`expanded`, :382);
  - held as `wrong_type` or `unreadable`.

  All of these are offered as the response's document. `listContractDocuments` requires `status = 'stored'`
  (`contract-queries.ts:348`), and so does tagging (`lib/contracts/tagging.ts:41`).
- **New defect, security: nothing checks the response's document.**
  - The route takes `documentId: opaqueId` (`lib/routes/submissions.ts:227`).
  - The service inserts it as given (`apps/worker/src/packets/services.ts:756-787`).
  - The trigger checks only that the document is the practice's (`packages/db/functions/payer_response_belongs.sql:44-46`).
  - The foreign key names `source_document (id)` with no kind check (migration
    `20261023090000_packets_submissions_and_responses.sql:239`).

  So a crafted post can record a response "with its document" that is an 835, a quarantined file or one still
  awaiting its bytes. Under CLAUDE.md ("check in the handler and in Postgres"), the handler check belongs here and
  the Postgres check goes to Lane A (section 4).

## 2. The tagging and abstraction lists, and the exclusion

### 2.1 How a kind decides

- One query serves both lists. It filters on kind in `CONTRACT_KINDS`, `scan_status = 'clean'` and `status =
  'stored'`, plus a selection (`contract-queries.ts:339-348`):
  - `untagged`: no version names the document;
  - `awaiting_abstraction`: no approved, signed-off or superseded version names it.
- A payer letter is a legitimate contract source:
  - `contract_version_documents_ok()` admits `payer_letter` (`packages/db/functions/contract_version_documents_ok.sql:15-17`;
    migration `20261016160000_contracts_and_mapping.sql:291-297`);
  - tagging accepts it (`lib/contracts/tagging.ts:41`);
  - a version built on a contract plus a payer letter is tested (`lib/routes/models-routes.db.test.ts:493-500`);
  - the version page says a payer letter is never sent to the model
    (`app/p/[practiceId]/abstraction/versions/[versionId]/page.tsx:71`, :104).
- So the kind alone cannot tell a terms letter from a response letter. Dropping `payer_letter` from
  `CONTRACT_KINDS` would cut the terms-letter path, which the review rejected on correction.

### 2.2 The exclusion (no column, no migration)

Add one clause to the `WHERE` in `listContractDocuments` (`contract-queries.ts:348`), so it covers both selections:

```sql
AND NOT EXISTS (SELECT 1 FROM payer_response r WHERE r.practice_id = d.practice_id AND r.document_id = d.id)
```

- **Tenancy:** both tables are tenant-scoped on `app.practice_ids` with FORCE RLS:
  - `source_document_tenant`: migration `20261016090000_documents_payers_plans.sql:179-183`;
  - `payer_response_tenant`: `20261023090000:874-878`, `GRANT SELECT` :890.

  Every caller is a `practiceRoute` in the practice's own scope (contracts :116 and :161; abstraction :110,
  permission `rate_record.edit` :104), so the subquery sees exactly that practice's responses. A practice cannot
  see another's.
- **Cost:** there is no index on `payer_response.document_id`; the only index is `payer_response_by_submission`
  (`20261023090000:261`). For one practice's paged list the practice_id prefix is enough. The definer function
  is a different case (section 2.4).
- **Name it:** a shared fragment such as `NOT_A_RESPONSE_LETTER`, so the web lists and Lane A's function read the
  same words.

### 2.3 The test the queue names

The best home is `lib/routes/workbench-routes.db.test.ts`, 'submissions and responses (CAS-14, J10)' (:598-652). It
already has an attested export, a logged submission, a seeded clean, stored `payer_letter` (:608-615) and recorded
responses (:620-644).

- **Exclusion test:**
  1. Seed a second clean, stored `payer_letter` (the terms letter).
  2. Before the response, assert both are in `listContractDocuments(…, 'untagged')` and
     `(…, 'awaiting_abstraction')`.
  3. Record a response with the first letter.
  4. Assert the response letter is out of both lists and the terms letter is still in, and that the totals agree.

  Calling the query directly avoids needing a specialist persona in the workbench world. Alternatively, use
  `contractsPage` for the manager and `abstractionPage` for a specialist, as `contracts-routes.db.test.ts:320-361`
  does.
- **Handler check:** in the same block, the route refuses as the response's document:
  - an `x12_835`;
  - a `payer_letter` with `scan_status` `pending`;
  - a `duplicate`;
  - an `expanded` zip.

  It also refuses another practice's document as not found. `page.documents` leaves out the held and duplicate
  rows. The existing assertion at :618 still holds, because the seeded letter is stored.

### 2.4 `console_contract_queue()`: Lane A's, confirmed

- It is a `SECURITY DEFINER` function (`packages/db/functions/console_contract_queue.sql:8-12`). Its
  `documents_awaiting` counts every clean, stored `contract`, `exhibit` or `payer_letter` that no
  approved, signed-off or superseded version names, with no response exclusion (:24-27).
- **Citation correction:** the definition in force is migration
  `20261028090000_specialist_queue_by_practice.sql:19-53` (count at :34-37). The review cites
  `20261016200000_contract_questions_and_queue.sql:118-140`, which is the original. The function was recreated at
  `20261027090000_packet_and_ledger_review.sql:444-445` and replaced again in 20261028090000.
- The generated file must not be edited by hand (`console_contract_queue.sql:1-2`), so the change is a
  `CREATE OR REPLACE` in a new migration: Lane A's.
- 20261028090000's header (:3-11) records a 405-second timeout at 600 practices, so Lane A should add `CREATE INDEX
  … ON payer_response (practice_id, document_id) WHERE document_id IS NOT NULL` with it.
- Its caller is `lib/routes/console.ts:800-847`, which is a #42 file (`pr42-files.txt:26`). The caller needs no
  change: the columns stay the same.
- Until Lane A lands, the console count and the console's list of practices with queue work (:839) include response
  letters that the web lists leave out. The PR description should say so.

## 3. Uploading inside the form

### 3.1 The uploader today (`components/uploads/uploader.tsx`)

- **Props** (:56-72): `practiceId`, `canUpload`, `csrfToken`, `roleNames`, `gate {open, reason}`,
  `limits {maxFiles, maxBytes, contentTypes}`, `kinds?: UploadKind[]` (`{kind, label, contentTypes, formats?}`),
  `heading?`, `description?`, `uploaders?`, `showReceipts?`.
- **Kind select:** when `kinds` is given, the uploader renders a 'Kind of document' select (:319-340). It starts on
  `kinds[0]` (:142) and has no empty option. Its id is fixed (`upload-kind`, and `upload-files` for the input,
  :381).
- **Protocol:**
  1. `POST /p/{id}/uploads/request {files:[{kind, contentType, sizeBytes, formatId?}]}` (:205).
  2. `PUT` to the presigned target (S3) or the local receiver (:108-137).
  3. `POST uploads/complete {documentId}` (:166).
  4. Poll `GET uploads/receipts?document_ids=` every 1.5 s while anything is unsettled (:260-277).
- **Server side** (`lib/routes/uploads.ts`):
  - `request` (:224-261) needs `file.upload` and the `upload` rate limit, takes any `DOCUMENT_KINDS` kind
    (`fileSchema` :174-184; `payer_letter` is one, `packages/db/src/schema/documents.ts:18`) and checks the BAA
    (:236);
  - `complete` (:322-342) marks the document received and queues `intake {practice_id, document_id}`.
- **How a finished upload is reported:** only inside the uploader, as the batch card's receipt. Once every file of a
  batch with `kinds` has settled, it calls `router.refresh()` (:254-259). Nothing reaches the parent: there is no
  callback.
- **Two defects that matter inside a form:**
  - The Retry button (:435) has no `type`. `Button` renders a bare `<button>` (`packages/ui/src/components/button.tsx:40-42`),
    so inside the `ActionForm` a Retry would submit the response.
  - The file input is `multiple` (:383) and a payer letter may be a zip (`lib/uploads/limits.ts`, `payer_letter:
    pdf + zip`). A zip's letters are child documents, which `responseDocuments` leaves out
    (`parent_document_id IS NULL`), and the zip itself ends `expanded`. So a zip uploaded in the form gives
    nothing the person can choose.

### 3.2 Keeping the typed fields while the file uploads and is scanned

- The upload is its own requests. The `ActionForm` sends nothing while it runs, and the uploader's controls carry no
  `name`, so `new FormData(form)` never includes them.
- On settle, the uploader's `router.refresh()` reads the page again in place. `ActionForm` is written for this:
  "Still rendered, the form keeps its state" (`components/action-form.tsx:42-46`). ADR 0077 D10 lists "an upload"
  among the in-place reads that keep uncontrolled fields and render for whoever is signed in now
  (`docs/adr/0077-…md:148-160`).
- If another person has signed in, `useClearedForAnotherPerson` remounts the form's children
  (`action-form.tsx:80`, :86). The batch, and the file names it shows, are cleared with them. That is the right
  outcome.
- **Condition 1: the form renders always.** The empty-state branch (`submissions/page.tsx:271-275`) must go. The
  Document field position holds either the select or, with no letter on file, the line "Upload the payer's letter
  here; it can be chosen once it is scanned clean." (the review's words). React then reconciles the other fields in
  place when the refresh adds the first option.
- **Condition 2: the uncontrolled fields keep stable `defaultValue`s.**
  - 'Received on' (`defaultValue={asOf}`) changes only at midnight UTC, and a field the person has edited keeps its
    value.
  - Selects keep their chosen option when options are added, because React keys options by value
    (`components/field.tsx:203-209`).
- **e2e evidence:** today's journey already depends on this. FRM-01's refused response keeps 'partial'
  (`e2e/packets.spec.ts:487-494`).

### 3.3 The recommended design, and the leavesOut tension

The best design is a client `PayerResponseForm` (a new file, for example `components/packets/response-form.tsx`). It
takes the server action as a prop, as `ActionForm` already does, and composes:

- the fields;
- the Document field;
- the shared `Uploader` with `kinds=[{kind:'payer_letter', label:'Payer letter', contentTypes:['application/pdf']}]`,
  `showReceipts={false}`, a heading such as "Drop the payer's letter here", and the Uploads page's gate.

It needs four changes in `uploader.tsx`. All are additive and change nothing for existing callers:

| # | Change | Why | Without it |
|---|---|---|---|
| a | Pass the kind (what the queue allows) | Files the upload as a payer letter | Not possible |
| b | `type="button"` on Retry (:435) | Inside the form, Retry would submit the response | A failed upload's Retry posts the form |
| c | An optional `onSettled(receipt)` callback, beside the existing `router.refresh()` | The form chooses the letter just uploaded. On a `duplicate` receipt it chooses `duplicateOf.documentId` when that is a clean, stored payer letter or other document, and otherwise says "This letter is already on file" | The person picks their letter out of up to 50 practice-wide options, identified only by upload time and SHA-256 prefix. Re-uploading a letter already on file gives a held duplicate with no way forward |
| d | An optional `multiple={false}`, with `accept` from the kind's types and a zip refused in the browser | One response, one letter | A zip yields nothing choosable (3.1) |

- With (c), the form can also pass `ActionForm`'s `beforeSubmit` (`action-form.tsx:74-75`). A press while the letter
  is still uploading or scanning then sends nothing and says "Wait for the letter's scan; it can be chosen once it
  is scanned clean." This is a `role="status"` line by the Document field.
- **Tension:** prs.json order 10 says "`uploader.tsx` changes here only to pass the kind; UX PRs 47, 48 and 49 build
  the uploader's behaviour on it". (b) to (d) go past that.
- **Recommendation:** take all four here. They are small, opt-in props, and PRs 47 to 49 can build on them unchanged.
  This is the orchestrator's call. If they are left out, record them for UX PR 47 and accept the three outcomes in
  the table's last column.
- A path that needs no uploader change exists for (c): watch for a new option after the refresh. It is fragile
  (another person's upload in the same window would be chosen), so it is not recommended.

### 3.4 Server and page changes (no migration)

- **`lib/routes/submissions.ts`** (not in prs.json's files, but needed; not a #42 file; no open PR touches it):
  - The page data gains `upload: {canUpload: rolesPermit(access.roles,'file.upload'), gate, limits}`. The gate is
    the Uploads page's (BAA and not suspended, `lib/routes/uploads.ts:110-117`). The Contracts panel's gate is
    BAA only (`lib/routes/contracts.ts:100`, :118-121), so do not copy that one.
  - `recordResponseAction` checks the document in the handler before the service runs: the practice's, top-level,
    `kind IN ('payer_letter','other')`, `scan_status = 'clean'`, `status = 'stored'`. It is refused as an
    `InputError` on `documentId`, with words such as "the payer's letter, once its scan is clean".
  - Today `billing_manager` and `firm_principal` hold both `submission.log` and `file.upload`
    (`packages/db/src/authz/permissions.ts:137-151`, :195-198). Still compute `canUpload` separately.
- **`lib/packets/submissions.ts`:**
  - `responseDocuments` adds `AND status = 'stored'`.
  - The submission log names each response's document: "Payer letter, uploaded …, SHA-256 abc123…" with a link to
    its receipt `/p/[practiceId]/uploads/[documentId]` (`uploadDocumentPage`, `practice.open`,
    `lib/routes/uploads.ts:126-146`). This replaces the bare "(with its document)" (`submissions/page.tsx:388`),
    and it is "list them on the submissions page". The worker's `submissionLog` already returns `documentId`
    (`lib/packets/submissions.ts:53`, :145); the metadata is a web-side read.
  - Optional: make that read and `responseDocuments` audited reads (`readWithAudit`), as `contract-queries.ts`
    does for documents (:352-357). They are metadata only, so this is not a blocker.
- **`submissions/page.tsx`:** the card description becomes "To the submission of {date}, with the payer's letter:
  upload it here or choose one already on file. …". The empty state is replaced as in 3.2. The csrf token comes
  from `pageCsrfToken()` and role names from `roleNames()`, as the Contracts page does
  (`app/p/[practiceId]/contracts/page.tsx:9,19,211-214`).
- **`lib/routes/contracts.ts`:** the exclusion lives in `contract-queries.ts`, so the only change here is the
  comment on `CONTRACT_DOCUMENT_KINDS` (:47): a payer letter here is a terms letter, and a response letter is
  uploaded with its response.
  - Optional: a sentence on the Contracts panel ("A payer's answer to a dispute is uploaded with its response, on
    the case's Submissions page."). That is `app/p/[practiceId]/contracts/page.tsx:204-206`, which is not in the
    file list. Recommended, since it closes the path that leaks; it needs the orchestrator's yes on the file.

### 3.5 Keys, file names, PHI

- The in-form upload uses the same routes, so nothing new is exposed.
- **Object keys:** `intake/{practiceId}/{documentId}`, then `practices/{practiceId}/documents/{documentId}`
  (`packages/db/src/schema/documents.ts:91-93`, :111-113). They are opaque and per practice, and the worker seals
  each document under the practice's key (`lib/uploads/targets.ts:16-22`).
- **File names:** they stay in the browser (`uploader.tsx:14-18`; "No route ever sees a file's name",
  `lib/routes/uploads.ts:46`).
- **Job payload:** IDs only (:339).
- **Download:** the receipt CSV is named by the document's ID (:385-386).
- The letter is PHI: it shows only in the uploader's batch (its name, in this browser) and as metadata in the
  select.
- Nothing new is logged.

### 3.6 The document's kind

Use `payer_letter`, which already exists, for these reasons:

- Intake accepts PDF bytes only for it (`apps/worker/src/intake/classify.ts:34`).
- It reads the letter's page text (`apps/worker/src/intake/pages.ts:20`), which the planned denial-letter reader
  needs. That reader is v1.5, behind its own flag (`apps/worker/src/packets/letter-records.ts:5-10`).
- Its receipt calls it "payer letter" (`lib/uploads/receipt-labels.ts:198`).

Why not the alternatives:

- `other` would keep it out of the contract lists by kind. But it takes any bytes, gets no page text, and mislabels
  the letter.
- A new kind such as `payer_response_letter` would need these changes:
  - a migration (the kind CHECK, `20261016090000_documents_payers_plans.sql:33`, widened since);
  - `DOCUMENT_KINDS`;
  - `CONTENT_TYPES`;
  - the intake tables;
  - the receipts.

  It would still not cover letters already uploaded through Contracts.
- Kinds never change after insert ("kind, size, declared type, uploader, zip and key never change", :205; the
  INSERT-only grant :210), so a letter cannot be re-filed later.

### 3.7 Tenancy and audit

- **Tenancy:**
  - All reads and writes run in the practice's own scope.
  - `source_document` has FORCE RLS plus restrictive INSERT policies: BAA on file, `uploaded_by = actor`, and
    inserted unscanned (`20261016090000:179-189`; `20261017090000_document_scan_gate.sql:67-68`).
  - `payer_response` has FORCE RLS with `recorded_by` as the actor (`20261023090000:874-880`).
  - The trigger also checks that a person recording a response holds `submission.log` in their own name
    (`payer_response_belongs.sql:17-21`).
  - Nothing here crosses practices. The existing cross-tenant test covers both tables, since both are in
    `phi_table_registry`.
- **Audit events, unchanged:**
  - `upload_batch_requested` and `upload_requested` for each document (`lib/routes/uploads.ts:234`, :252);
  - `upload_stored` for the local receiver (:273);
  - `upload_completed` (:334) and `upload_retried` (:356);
  - `payer_response_recorded` (`lib/routes/submissions.ts:233`).

  The response row's `document_id` is the link. No new event is needed.

### 3.8 Tests and the e2e

- **db tests:** see 2.3.
- **e2e** (`packets.spec.ts`, replacing :473-477 and updating the header :40-42):
  1. Open Submissions.
  2. In 'Log a payer response', choose Response 'partial', leave the amount empty, and type a SYNTHETIC note.
  3. Inside `withWorker`, `setInputFiles` the synthetic PDF on the form's 'Choose files to upload' and wait for
     'Stored' (90 s, as now).
  4. Assert that 'Response' is still 'partial', the note is kept, 'Received on' is unchanged, and Document now holds
     the letter: chosen with (c), or picked by `selectOption({index:1})` without it.
  5. Press Record: the FRM-01 refusal of the amount, with the existing assertions (:485-494).
  6. Run the phone-width checks (:495-516).
  7. Fill 60.00, record, and check the log shows the letter's line.
  8. New: `/contracts` 'Documents to tag' does not list the letter.
- **axe:** `expectAccessible` on `/submissions` with the uploader inside. `atPhoneWidth` already runs there (:496)
  and adds `landmark-unique` (`e2e/a11y.ts:24`, :113). The uploader's `<section aria-label="Drop zone">` is a
  region landmark, and there is one on this page.
- **Test-matrix rows** (reserved CAS-45 to CAS-48). Suggested for this part, in the style of `test-matrix.md:129-130`:
  - **CAS-47:** a payer's letter uploaded in 'Log a payer response' goes through the same scanned intake, keeps the
    typed fields through the scan, and is the response's document. The handler refuses a document that is not a
    clean, stored payer letter or other document.
  - **CAS-48:** a payer letter that a response names leaves 'Documents to tag' and 'Documents awaiting abstraction',
    and a terms letter stays.

  UX-035's rows take CAS-45 and CAS-46. `test-matrix.md` and the synth registry are shared with #42 under LANES
  rule 6. Register one no-file `packages/synth` entry for each new row (module 5, CAS).

## 4. What needs a migration (Lane A), and what this PR does without it

| For Lane A | Why it is a migration | This PR meanwhile |
|---|---|---|
| `console_contract_queue()`: the same `NOT EXISTS` on `payer_response`, plus an index on `payer_response (practice_id, document_id) WHERE document_id IS NOT NULL` | A SECURITY DEFINER function in force from `20261028090000:19-53`; `functions/*.sql` is generated (:1-2) | The web lists exclude response letters. The console counts them until Lane A lands, which the PR description says |
| `payer_response_belongs()`: the document is the practice's, top-level, `payer_letter` or `other`, scan clean and status stored | A trigger function (`functions/payer_response_belongs.sql:44-46`); "check in the handler and in Postgres" | The handler check (3.4) |
| Optional: a link written when the letter is uploaded (for example `source_document.submission_id`, set by `uploads/request` for kind `payer_letter` from the response form) | A new column, set only on insert like the other immutable columns | A letter uploaded in the form but never recorded shows in 'Documents to tag' and the abstraction queue as a payer letter until a response names it. With (c) and `beforeSubmit` the window is short, but an abandoned upload stays |
| Not needed: a new document kind, or a column linking a response to its letter | `payer_response.document_id` is the link (`20261023090000:239`) | |

## 5. Coordination and risks

- **Open draft PRs changing `uploader.tsx`, both behind `claude/build-platform`:**
  - **#75 (`co-001/contract-phi-check`):** `startingKind` (a single kind starts chosen), `KindField` with the help
    "A document's kind cannot be changed once it is uploaded.", files held for an explicit Upload, and
    `batchProblems`. It adds `uploader.test.tsx`.
  - **#78 (`co-001/ux-download-refusals`):** a leave guard while sending, and `reportFrom` and `receiptsNotice`.

  Changes (a) to (d) fit both: a single `payer_letter` kind starts chosen under #75, and #78's guard protects an
  in-form upload. Under LANES rule 6, whichever merges second keeps both. #81 does not overlap. PRs #51 and #52
  are merged, so their dependencies are met.
- **No #42 file is touched.** `console.ts` is #42's but needs no change. `docs/product/test-matrix.md` and
  `packages/synth/src/cases/*.ts` are shared under rule 6.
- **Corrections to the review's citations at this base:**
  - the e2e upload is at :473-477, not :421-423;
  - the empty state is at `submissions/page.tsx:271-275`, not :293-297;
  - the description is at :268, not :290;
  - the queue function in force is `20261028090000:19-53`, not `20261016200000:118-140`.
- **'Other document':** this design still gives it no upload path; the form uploads payer letters only. UX PR 48
  ("Uploads takes every kind") is where it lands. The Document select keeps listing `other` documents already on
  file.

## 6. Waiting on someone

- **The orchestrator:** whether `uploader.tsx` takes (b) to (d) here, against prs.json's "only to pass the kind"
  (section 3.3). The recommendation is yes. Also whether `app/p/[practiceId]/contracts/page.tsx` may take the
  one-sentence pointer (3.4).
- **A product question, low priority, not decided here:** a payer's response letter that also announces new terms
  leaves the abstraction queue once a response names it. Uploading it again on Contracts gives a held duplicate,
  because intake deduplicates by bytes across kinds (`apps/worker/src/intake/intake.ts:124-139`). The
  recommendation is to keep it excluded, as the review chose: a terms change normally comes as its own notice. Lane
  A's optional upload-time link would let a later design offer "also a terms letter".

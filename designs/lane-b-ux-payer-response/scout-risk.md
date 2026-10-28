# Scout C: security, money and the boundaries (UX PR 10, `co-001/ux-payer-response`)

I read the code at `/home/user/ux-payer-response` (`165c5993`, #74 merged; #51 and #52 merged; #42 open at `6f23c42`). I
edited no product code. I applied `.claude/agents/security-reviewer.md` and the parts of
`.claude/agents/payment-engine-reviewer.md` that apply. Requirements: UX-035 (`lane-b-ux-review.md:1629-1646`), UX-007
(`:1705-1722`), prs.json order 10, and #74's U-UX-6 (`approval-summaries/lane-b-ux-forms-reviews.md:585-610`). Scout A
(`scout-choices.md`) covers the two selects' words and layout. I checked the facts it cites that this report relies on,
and they hold.

## 0. In brief

1. **Neither pre-answered choice writes a ledger entry or a stage row on save, but both move money.** The write-off takes
   the line out of the dispute: out of the actionable total, out of later approvals, and possibly the whole case closed.
   The pre-answered 'Accepted' becomes immutable, and at the next reconcile it is `approved` ledger entries and a move to
   Payer approved. Recovered (posted or deposited) is never reached without cash. Section 1.
2. **The refusal.** Of the five reasons, only 'Window passed' can be contradicted by the line's stored facts. The handler
   check, its words and its field key `reason` are in section 2. Postgres has no rule for a person's write-off reason, so
   the database half is a migration: **for Lane A**.
3. **The in-form upload has five gaps beyond the four threats named in the task** (section 3). Three are bugs the plan
   must not ship:
   - (a) the uploader's Retry button and the receipt list's buttons have no `type`, so inside the response form they
     **submit it**;
   - (b) the Document select preselects the practice's newest letter, which can be another case's (another patient's),
     and the record can never be changed;
   - (c) the response route takes **any** `documentId` of the practice. Nothing in the handler, the worker service or
     Postgres checks that the document is clean, stored, a payer letter, or top-level. The page's list is the only filter,
     and it checks the scan alone, which is set *before* intake dedupes and sniffs.

   The other two:
   - (d) a response letter can still be tagged into a contract version by a crafted request, and the version review then
     shows its pages to `practice.open` roles (the viewer has no `phi.read`);
   - (e) the uploader must never reuse the form's request key, or the save reads 'Already sent' over nothing.
4. **Boundaries.**
   - No code file the plan touches is a #42 file.
   - No change to `packages/pricing`, `packages/ledger` or `apps/worker/src/reconcile`.
   - Four Postgres rules go to Lane A (section 4.3).
   - prs.json's list needs `lib/routes/submissions.ts` and `lib/contracts/tagging.ts` added, and preferably
     `lib/routes/abstraction.ts`, plus tests.
5. **ADR 0085 is warranted.** It records three lasting rules that other PRs and Lane A must follow (section 5).

## 1. What the write-off and the payer response record today, and what a pre-answered choice does

### 1.1 The write-off (`practice.cases.write_off`, `apps/web/src/lib/routes/triage.ts:464-495`)

**The form.**
- The Reason select is `required` with no empty option, so it opens on 'Window passed'
  (`app/p/[practiceId]/cases/[caseId]/page.tsx:222`; `WRITE_OFF_REASONS[0]`, `packages/triage/src/cases.ts:93`).
- Only the confirmation checkbox must be ticked (`page.tsx:224`).

**The route.**
- It accepts any `z.enum(WRITE_OFF_REASONS)` (`triage.ts:471`). It loads `caseLineState()` (`:478`), which already
  computes `windowPassed` (`apps/web/src/lib/triage/queries.ts:678-690`, `FOR UPDATE`), and never reads it.
- Only when the line is not yet written off (`:482`) does it run
  `UPDATE case_line SET written_off_reason, written_off_text (encrypted), written_off_by = app_actor_id()` (`:485`).

**Records.**
- One `case_line` update and the audit event `case_line_written_off` (`:472`).
- The trigger sets `written_off_at = now()` and `actionable = false` (`packages/db/functions/case_line_rules.sql:41-42`).
- `case_rules()` recomputes the case's actionable total and deadline without the line. When every line is written off, the
  case becomes `closed_written_off` (`case_rules.sql:53-54`), and a closed case takes no submission (`CLOSED_CASE_SUBMISSION`,
  `lib/packets/unattested.ts:217-218`).

**Stage.** No `line_status` row is inserted, so the line's stage does not move.

**Ledger.** Nothing is written. From then on the reconcile's approvals skip the line
(`apps/worker/src/reconcile/responses.ts:54`), so a later acceptance approves nothing for it.

**The harm, concretely.** On an open line ('Window ends 2036-04-05' in `p.case.write-off-open.1280`), a person ticks the
confirmation and presses Write off without opening Reason.
- The line leaves the dispute under a false audited reason: "Written off: Window passed, by …" (`page.tsx:203`).
- If it was the case's last open line, the case closes and no submission can be logged.
- It can be undone only by an explicit reopen while the window is open (`triage.ts:518`; `case_line_rules.sql:55-57`). If
  nobody notices before the window ends, the underpayment is never disputed, and the reopen is refused for good.
- Reports and the timeline that read `written_off:window_passed` count it as lost to the window.

### 1.2 The payer response (`practice.cases.submissions.respond`, `apps/web/src/lib/routes/submissions.ts:215-272`)

**The form.**
- Response opens on 'Accepted' (`submissions/page.tsx:283`).
- Received on is prefilled with today (`:284`).
- Document opens on the first listed document (`:293-308`, below).

**The route.**
- It requires an amount exactly for accepted or partial (`:235-238`), more than zero (`:239-241`), and the submission in
  the case (`:248-251`).
- Then `recordResponseOnce` (`lib/packets/submissions.ts:364-376`) calls `recordPayerResponse`
  (`apps/worker/src/packets/services.ts:756-787`), which inserts one `payer_response` row in the person's name.
- Audit: `payer_response_recorded` (`submissions.ts:233`).

**Records, at once.**
- The row **never changes once recorded** (`payer_response_rules.sql:13-14`).
- The case's state is derived from the latest response: accepted becomes **Resolved** (`case_rules.sql:69-70`), partial
  becomes Partially resolved (`:67`).
- No ledger entry and no stage move (LED-01; the route's doc, `submissions.ts:213`).

**At the next reconcile, not on save.**
- `approveFromResponses` (`reconcile/pass.ts:40`; `responses.ts:46-87`) reads **every** accepted or partial response of
  the practice, not only the latest (`acceptedPayerResponses`, `services.ts:963-990`). It writes `approved` ledger entries
  with evidence `payer_response` (`packages/ledger/src/stages.ts:37-40`), split by variance and capped per line.
- `syncLineStages` (`pass.ts:45`; `reconcile/stages.ts:72-102`) then moves those lines to **Payer approved**
  (`ledger_line_stage.sql:33-35`).
- Recovered needs posted or deposited proof, so a mistaken acceptance is never counted recovered. It does show as Payer
  approved on the home tile (`app/p/[practiceId]/page.tsx:209`), in Reconciliation and in reports.

**The harm, concretely.** A denial arrives, and the person presses 'Record the response' with Response still on 'Accepted'.
- The refusal names **Amount** ('what the payer accepted, in dollars and cents'), not Response (`submissions.ts:237`). It
  steers the person to type an amount.
- Once they do, an acceptance the payer never gave is recorded for good. The case reads Resolved at once. The next
  reconcile approves that amount and moves the submitted lines to Payer approved.
- A later, correct response cannot remove it, because every acceptance stays in the reconcile's input. Only a specialist's
  ledger correction (`reversed` or `adjusted`, `stages.ts:28-29`) offsets the entries, and the false response stays in the
  record.

### 1.3 The same defect in the same form: the Document select (`submissions/page.tsx:293-308`)

- It is `required`, with no empty option, over `responseDocuments()`: every clean payer letter or 'other' document of the
  **practice**, newest first (`lib/packets/submissions.ts:330-338`), not the case's.
- A hurried press therefore links the practice's newest letter as this response's evidence. That letter can be another
  case's, about another patient, and the link is immutable.
- With the in-form upload, "newest" can be a colleague's upload made a minute earlier.
- This PR rewrites the field (UX-007), so the same rule applies: it starts on 'Choose the payer’s letter'. The only thing
  ever chosen for the person is the letter this form itself uploaded (section 3).

## 2. The server-side refusal

**Which reasons the line's facts can contradict.**
- Only `window_passed`. It is true exactly when `caseLineState().windowPassed`, that is
  `window_ends_on IS NOT NULL AND window_ends_on < today UTC` (`queries.ts:681`). That is the same test the system's
  write-off (`case_line_rules.sql:32`), the reopen (`triage.ts:518`) and triage's daily strike use.
- It is contradicted when the window is open, and unsupported when no window is known.
- `payer_correct_on_review`, `not_worth_pursuit`, `duplicate` and `other` are judgments no stored fact decides (Scout A
  1.3 agrees).
- The one conflict is a write-off of a line the payer has approved: section 6, the founder's.

**The exact check** (`writeOffLineAction`):
- Inside `if (line.writtenOffReason === null)` at `:482`, before the UPDATE, so a repeat stays a no-op:
  `if (checked.data.reason === 'window_passed' && !line.windowPassed) throw new InputError([{ field: 'reason', message }])`.
- `caseLineState` already locks the row, so check and write see one state.
- Give the schema its own message, so an unchosen post from a crafted request, or from a browser without JavaScript,
  names the field: `reason: z.enum(WRITE_OFF_REASONS, 'choose the reason')` (precedent `lib/routes/abstraction.ts:227-228`).

**The words** (Scout A's, adopted unchanged; they name a rule and carry no date or value, per CLAUDE.md "no PHI in an
error message"):
- window open: 'its dispute window is still open, so “Window passed” is not its reason';
- no window known: 'no dispute window is known for this line, so “Window passed” is not its reason; choose “Other” and
  say why'.

**Field key: `reason`.** #74's RefusalSummary resolves a key by the control's `name` (`components/form-issues.tsx:416-421`),
so the summary reads "Reason: …", and the select is focused and marked `aria-invalid`.

**The same pattern on the response route.**
- `kind: z.enum(PERSON_RESPONSE_KINDS, 'choose the payer’s answer')` → key `kind` ('Response').
- The document checks in section 3 → key `documentId` ('Document').
- The handler must check before Postgres does. Postgres's own refusal (23514) surfaces as key `input`
  (`lib/http/invoke.ts:317-320`), so it names no field.

**Postgres.** Nothing exists to reuse. `case_line_rules()` checks a person's write-off only for actor and `case.work`
(`case_line_rules.sql:35-37`). It already loads `window_end` (`:29`). The rule goes in the person branch: **a migration,
for Lane A** (4.3 item 1). The handler check is complete without it, since the route is the only path a person writes off
by today. Bulk write-off (audit #125) must call the same check, or wait for Lane A's rule.

## 3. The upload inside the form: threat model

| Threat | What holds today | What the plan must do |
| --- | --- | --- |
| **A letter with PHI in its filename** | The name never leaves the browser. The request sends kind, type, size and format only (`components/uploads/uploader.tsx:16-17, 206`; `lib/routes/uploads.ts:46`). The object key is the opaque ID (ADR 0026:25). The intake job payload is `{practice_id, document_id}` (`uploads.ts:339`). Receipts and downloads use IDs (`:385-386`). The file input has **no `name`** (`uploader.tsx:379-394`), so it is not part of the response form's post. | Keep the file input unnamed when it sits inside the `<form>`. A `name` would post the File, name included, to the server action. Never echo the name into the form or a notice. **e2e:** upload a synthetic file whose name carries a sentinel (for example `SYNTHETIC-NAME-SENTINEL-letter.pdf`), and assert that no request URL or body in the journey contains the sentinel. |
| **A wrong practice** | The scope holds only the route's practice (`packages/db/src/authz/scope.ts:13-17, 203-226`). RLS on `source_document` hides another practice's document. `payer_response_belongs()` refuses a document of another practice (`payer_response_belongs.sql:39`), but as an unnamed 23514. The submission must belong to the case and practice (`submissions.ts:248-251`). | The handler's document check (below) queries with `practice_id = $2`. A document of another practice reads exactly like one that does not exist (no oracle) and is refused on `documentId`. The uploader posts to the page's own `/p/{practiceId}/uploads/request`, and `file.upload` is checked there (`uploads.ts:231`). |
| **A replayed request key** | A mutation's key is claimed in `mutation_request`, unique on **(user, key) across every route**, in the same transaction (`invoke.ts:231-237, 251-253`). A replay does nothing, and the response is also deduplicated by `recordResponseOnce` (`lib/packets/submissions.ts:364-376`). Each uploader post makes its own key (`uploader.tsx:97`). The CSRF token and origin are checked on every mutation (`invoke.ts:146-156`). | **The uploader must never read or reuse the form's hidden `requestKey`.** Its claim would turn the response save into `duplicate`, which reads 'Already sent … saved' (`lib/http/next.ts:239-242`; `form-issues.tsx:505`) over a response never recorded. Pass the page's `pageCsrfToken()` to the uploader, as `uploads/page.tsx:33` does. The `router.refresh()` the uploader fires when its batch settles (`uploader.tsx:254-259`) re-renders `FormKeys` with a fresh key. That is harmless, and `recordResponseOnce` still catches a double press across the two keys. |
| **A scan still running when the response is saved** | `scan_status = 'clean'` is recorded **before** dedupe, sniffing and storing (`apps/worker/src/intake/intake.ts:240-262`, order at `:28-50`). A clean letter can still be `received` or `scanned` (mid-intake), `duplicate`, `wrong_type` (a payer letter must be a PDF, `ACCEPTED_CONTENT`), `quarantined` (an executable caught by the sniff) or `unreadable`. `responseDocuments()` filters on the scan alone (`lib/packets/submissions.ts:333`), while the contract lists also require `status = 'stored'` (`contract-queries.ts:348`). **No layer checks the document a response names.** The route takes any `opaqueId` (`submissions.ts:227`), the worker inserts it (`services.ts:767-781`), and Postgres checks only the practice (`payer_response_belongs.sql:39`). A crafted or racing post can link a pending, held, flagged or 835 document, or a zip entry, to an immutable response. | **Refuse until the letter is stored clean.** Allowing it would leave a response that can never change pointing at evidence that may later be held. Handler check before `recordResponseOnce`: the document is the practice's, `parent_document_id IS NULL`, kind in (`payer_letter`, `other`), `scan_status = 'clean' AND status = 'stored'`, and no `contract_version` names it. Use the same predicate in `responseDocuments()`, as one shared fragment in `lib/packets/submissions.ts`. Proposed words, key `documentId` (designer to check against CO-11): still in intake → 'the letter is still being scanned; choose it once it shows Stored'; held → 'this document was held at intake, so it cannot be the response’s evidence; upload the letter again as a PDF'; duplicate → 'the same file was uploaded before; choose that copy from the list'; a contract's document → 'this letter is one of a contract’s documents; upload the payer’s answer here'; anything else → 'choose the payer’s letter from the list, or upload it here'. In the form, the Document select starts on 'Choose the payer’s letter', so a press while the scan runs is stopped by `required`. When this form's own upload settles stored, the select chooses that `documentId`, which the uploader got from the server. **Never choose "the newest letter".** Announce the choice in the live region. Set `maxFiles: 1`, since a response has one document. |
| **(new) Buttons inside the form submit it** | `@tp/ui` `Button` renders `<button>` with no default `type` (`packages/ui/src/components/button.tsx:41-42`). Inside a `<form>` that means **submit**. The uploader's **Retry** (`uploader.tsx:435`) and ReceiptList's Reload, Retry and pager buttons (`components/uploads/receipts.tsx:124, 182, 196, 202`) would all submit 'Record the response'. Only 'Choose files' is `type="button"` (`:395`). | Render the in-form uploader with `showReceipts={false}`, and give Retry `type="button"`: a one-word change in `uploader.tsx`, allowed by "changes here only to pass the kind", since without it the in-form use is unsafe. Add a browser test that pressing Retry inside the form submits nothing. If Scout B places the uploader outside the `<form>` element, this row falls away, but the type fix is still right for UX PRs 47 to 49. |
| **(new) A response letter becomes a contract document** | Payer letters are PHI (`lib/models/contract-proposals.ts:132-133`). `tagDocument` accepts any clean, stored payer letter by ID (`lib/contracts/tagging.ts:40-46`; used by `routes/contracts.ts:225` with `file.upload` and `routes/abstraction.ts:169` with `rate_record.edit`). Amend, supersede and draft edit take a `documentId` too (`abstraction.ts:~400-440`; `packages/contracts/src/services.ts:337-345`). Once a version names it, `versionPage` shows its pages to **`practice.open`** (`routes/contracts.ts:186-192`; `lib/contracts/review.ts:91-96`), so the viewer reads it, as does the contract specialist. Neither holds `phi.read` (`packages/db/src/authz/permissions.ts:135, 200-204`). Today's only working path, upload on Contracts, puts response letters in exactly that list (UX-007). No model is involved: terms are proposed from contracts and exhibits only (`contract-proposals.ts:134-137`), and the denial-letter reader is unwired (v1.5, behind its own flag). | UX-007's list exclusion is the visible half. **Enforce it in the handler too** (CLAUDE.md: never the UI alone). In `contract-queries.ts`, add one predicate, `NOT EXISTS (SELECT 1 FROM payer_response r WHERE r.document_id = d.id AND r.practice_id = d.practice_id)`, used by both `SELECTIONS` (`:340-344`) and a `contractDocumentChoosable()` check. Refuse in `tagDocument` (`InputError` on `documentId`: 'this letter is a payer’s answer to a dispute; it stays with its case and is not a contract document'). Preferably also in the three abstraction handlers. The database half is Lane A's (4.3 items 3 and 4). Recorded edge: duplicate detection (`intake.ts:124-136`) means one file cannot be both a response's evidence and a contract source. A payer letter that both answers a dispute and announces new terms must be linked one way. I recommend the strict separation as the safer option, since the alternative shows a patient's letter to roles without `phi.read`. |

**Permissions.** `submission.log` belongs to the billing manager and the firm principal, and both hold `file.upload`
(`permissions.ts:137-150, 187, 195-196`). Even so, compute `canUpload` and the upload gate separately, as `uploadsPage`
does: the BAA is checked in the handler (`uploads.ts:236-238`), and a suspended organization is refused in Postgres
(`invoke.ts:297-300`). Do not infer them from `canLog`.

**Refresh.** The uploader calls `router.refresh()` only when `kinds` is passed (`uploader.tsx:254`). A design that fixes
the kind by a new prop must keep the refresh, or the stored letter never reaches the select. The typed fields survive the
refresh, because the form stays mounted (the form must render with no documents too, replacing the `documents.length === 0`
branch at `submissions/page.tsx:271-276`). #74's per-person mark still clears it if another person's session appears
(`components/form-keys.tsx:9-19`).

## 4. The boundaries

### 4.1 Files

**prs.json's eight, none in `pr42-files.txt`:**
- `app/p/[practiceId]/cases/[caseId]/submissions/page.tsx`
- `lib/packets/submissions.ts`
- `lib/contracts/contract-queries.ts`
- `lib/routes/contracts.ts`
- `components/uploads/uploader.tsx`
- `e2e/packets.spec.ts`
- `app/p/[practiceId]/cases/[caseId]/page.tsx`
- `lib/routes/triage.ts`

**To add (none in #42):**
- `lib/routes/submissions.ts`: the kind's message and the document check;
- `lib/contracts/tagging.ts`: the refusal;
- recommended, `lib/routes/abstraction.ts`: the same refusal on amend, supersede and draft edit;
- `e2e/triage.spec.ts`;
- route database tests:
  - a write-off test beside `lib/routes/workbench-routes.db.test.ts` (Scout A's setup);
  - the response-document refusals in `unattested-submission-routes.db.test.ts` or a new `submissions-routes.db.test.ts`;
  - the list exclusion and the tag refusal in `contracts-routes.db.test.ts`;
- a browser test for the uploader's Retry.

**#42 files the PR would touch:** only the shared documents, `docs/product/test-matrix.md` (`pr42-files.txt:86`) and
`packages/synth/src/cases/matrix.ts` and `registry.ts` (`:136-137`). They follow LANES.md rule 6, with the precedent of
`lane-b-ux-forms.md:1143-1148`. #42 is open; checked by REST, since `gh pr view` is refused here.

### 4.2 The freezes

- **Engine.** No file in `packages/pricing` changes. The refusal only reads `priced_line.window_ends_on` through the
  existing `caseLineState`.
- **Ledger, additions only.** Nothing in `packages/ledger`, `apps/worker/src/reconcile` or the worker's packet services
  changes. LED-01 holds: recording writes no entry. The e2e's existing assertions stay and guard it: approved $0.00 before
  the reconcile, $60.00 after, recovered $0.00 (`packets.spec.ts:519-534`).
- **Money.** No new money arithmetic, float or rounding. The amount keeps `optionalDollars` → bigint cents
  (`submissions.ts:199-206`).
- **Models.** No model reads or proposes anything here.

### 4.3 For Lane A (migrations; left out of this PR, each under CO-02 with its function file and `domain-model.md` regenerated)

1. **`case_line_rules()`.** In the person branch (after `:35-37`):
   `IF NEW.written_off_reason = 'window_passed' AND (window_end IS NULL OR window_end >= (now() AT TIME ZONE 'UTC')::date)`
   `THEN RAISE … 'check_violation'`.
2. **`console_contract_queue()`** (SECURITY DEFINER). Its `documents_awaiting` gets the payer-response exclusion
   (`console_contract_queue.sql:24-27`). The function must keep `SET search_path` with `pg_catalog` first and `pg_temp`
   last, its scope save and restore with `is_local` true, and its grants (the reviewer's checklist). Until it lands, the
   console count includes response letters the web lists leave out (prs.json's `leavesOut`).
3. **`payer_response_belongs()`.** A person's response names a top-level `payer_letter` or `other` document that is
   `clean` and `stored` and that no `contract_version` names (`:39` checks only the practice today).
4. **`contract_version_documents_ok()`.** A document a `payer_response` links is never a version's source (`:15-17`).
   With item 3 this keeps the two workflows apart whichever comes first.

No infrastructure is needed: the same presign, receiver, scan and S3 keys.

## 5. ADR 0085: warranted

Record three decisions that outlive this PR and bind other work:

- **(D1) A choice that records a fact starts unchosen.** A fact is what happened, what a document says, what a payer
  answered, a reason.
  - The select starts on an *enabled* empty first option with `required` (Scout A 3.2: a disabled placeholder falls back
    to the first real option on reset).
  - The route's enum carries a message that names the field.
  - A select that sets a preference may open on its current or recommended value.
  - This is product-wide: the same defect stands in Channel (`submissions/page.tsx:75`), the mapping Agreement
    (`mapping/[planId]/page.tsx:160`), the abstraction Method, Cited document and Topic
    (`abstraction/versions/[versionId]/page.tsx:181, 251, 302, 451`) and the console compliance 'What'
    (`console/compliance/page.tsx:191`).
  - Bulk write-off (audit #125) and UX PRs 47 to 49 need the rule written down.
- **(D2) A handler refuses a choice the record's own stored facts contradict, on that field.** The database mirrors the
  rule through Lane A (the write-off reason now; the pattern for later ones).
- **(D3) A payer's response letter is the case's evidence.**
  - It is uploaded where it is used, as kind `payer_letter`, and becomes the choice only once stored clean.
  - A response names only a clean, stored, top-level letter that no contract version names.
  - A letter a response links is kept out of the contract lists and refused as a contract source. A payer's terms letter
    stays abstractable.
  - The console count and the two database rules follow in Lane A.
  - Alternatives rejected:
    - every payer letter out by its kind (cuts terms letters);
    - a filter in the list only (a crafted post passes);
    - saving while the scan runs (an immutable record pointing at evidence that may be held).

## 6. Waiting on someone

- **Founder (money and stage ruling, not decided here).** Whether a line at Payer approved or Recovered may be written
  off, and with which reasons. The form is offered whatever the stage (`cases/[caseId]/page.tsx:215`), and neither the
  route nor `case_line_rules()` checks it. Such a write-off leaves the line's ledger entries standing and takes it out of
  later approvals (`responses.ts:54`) and of the case's resolved count (`case_rules.sql:33-37`). (Same as Scout A section 7.)
- **Lane A:** the four rules in 4.3.

## 7. Matrix rows proposed (reserved CAS-45 to CAS-48; Scout A proposed CAS-45 and CAS-46)

- `| CAS-47 | The payer’s letter uploaded in “Log a payer response” | Chosen as the response’s document only once stored clean, and only the letter that form uploaded; a response naming a document still in intake, held, of another kind, a zip entry, another practice’s, or a contract’s is refused on Document and nothing is recorded; the letter stays out of the tagging and abstraction lists, and tagging it is refused; a payer’s terms letter stays in |`
- `| CAS-48 | The file’s name in the in-form upload | No request the journey makes carries it; the response form’s request key is never the upload’s |`

For the registry, one `none(…)` entry per row (synthetic practices the tests create; no file), as Scout A notes for
CAS-45 and CAS-46.

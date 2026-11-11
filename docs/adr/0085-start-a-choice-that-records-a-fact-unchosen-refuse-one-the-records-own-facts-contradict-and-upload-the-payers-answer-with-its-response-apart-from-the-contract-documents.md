# 0085. Start a choice that records a fact unchosen, refuse one the record's own facts contradict, and upload the payer's answer with its response, apart from the contract documents

- **Status:** proposed (`co-001/ux-payer-response`, the UX baseline review's tenth pull request)
- **Date:** 2026-10-28
- **Deciders:** the founder, under the standing rule of 2026-10-18; the co-founder, under the founder's delegation of
  2026-10-25, whose rulings take each recommended wording and visible change ("Choose the reason", "Choose the payer’s
  answer"); the build (Lane B); Lane A for the database's half. Each reversible by the founder
- **PRD sections:** 6 (Cross-cutting: every error shown with a next step; PRD.md:256); 7 (Submissions and responses:
  "Log a submission or response", PRD.md:279; every destructive action confirms with the consequence stated,
  PRD.md:302); 12 (Write-offs and reopening, PRD.md:514); test matrix CAS-45 to CAS-48; ADRs
  [0026](0026-take-uploads-in-through-a-scanned-landing-a-streaming-seal-and-zips-expanded-entry-by-entry.md) (the
  scanned intake),
  [0038](0038-triage-runs-into-anomalies-and-cases-keep-five-stages-and-release-an-audit-report-only-once-a-reviewer-signs.md)
  (the five stages and the write-off reasons),
  [0041](0041-write-packets-as-immutable-verified-versions-approve-them-in-sql-insert-identifiers-at-export-and-derive-case-states-from-submissions.md)
  (case states derived from submissions and responses) and
  [0077](0077-submit-forms-from-the-browser-keep-what-was-typed-name-each-refused-field-by-its-label-and-size-controls-for-phones.md)
  (forms keep what was typed; browser validation on)

## Context

Three selects that record a fact for good arrived on their first value, with no empty option, so `required` never
fired. "Write this line off" opened on Reason "Window passed" for any line, including one whose dispute window was open
for years: ticking the confirmation and pressing Write off recorded "Written off: Window passed, by {email}", a false
audited fact that drops the line from the dispute and can close the case (UX-035, and #74's review finding U-UX-6).
"Log a payer response" opened on Response "Accepted": a response never changes once recorded, the case reads Resolved
at once, and the next reconcile approves the amount on the submission's lines. "Log a submission" opened on the first
channel, recorded with the submission. The response's Document select had no empty option either, over every clean
letter of the practice, newest first, so a hurried press linked the newest letter, which can be another case's.

The route accepted a reason the line's own records contradict: `writeOffLineAction` loaded the line's window under
`FOR UPDATE` and never read it, and `case_line_rules()` checks the window only when triage writes a line off.

The payer's letter could not be uploaded where the form asked for it (UX-007). The card said to upload it on the
Uploads screen, which offers only an 835 and an ERA export; with no letter on file the card showed no form at all. The
only path that worked was the Contracts panel's "Payer letter" kind, which files the payer's answer among the contract
documents: it joined "Documents to tag" and the contract specialist's "Documents awaiting abstraction", and a tagged
letter's pages are shown on the version pages to roles that hold no `phi.read` (the viewer; the contract specialist,
on the abstraction version page). A payer letter is also a legitimate contract source (a terms letter), so its kind
alone cannot decide.

Nothing checked the letter a response names: the route took any ID, the worker inserted it, and the trigger checks only
the practice, so a crafted post could link an 835, a quarantined file or a zip entry to a response that never changes.
The list itself filtered on the scan alone, and intake records the clean verdict before it settles, deduplicates and
sniffs a document, so a clean document could still be mid-intake, a duplicate, an expanded zip or held.

## Decision

- **D1. A choice that records a fact starts unchosen.** A fact is what happened or what a person attests: a reason, a
  payer's answer, a channel, a document as evidence, a document's kind. Its select starts on an empty first option
  ("Choose the …") with `required`, and its route's enum or ID schema carries a message that names what to choose
  ("choose the reason", "choose the payer’s answer", "choose the channel", "choose the payer’s letter"), shown after
  the field's label in #74's summary. A select that sets a preference or a filter may open on its current or
  recommended value. In a select a form posts, the placeholder is **enabled**: HTML makes an enabled first option with
  an empty value, in a required single select, the select's placeholder label option, and the browser's default
  selection, a form's reset, the render before hydration and the post without JavaScript all fall past a disabled
  option to the first real one. A controlled select outside any form, which no reset or post reaches and which holds
  its own action until it is chosen, may lead with a disabled placeholder, as #75's uploader kind select does ("Choose
  the kind of document"). Either way it starts unchosen. "Received on" starts empty too, with `required`, bounded by
  the submission and today: a reopening denial counts the next dispute level's window and the case's deadline from it,
  so today's date is never recorded for a letter that came earlier. The words under it say so, and the route refuses
  an empty date on its field ("enter the date the payer’s letter was received").
  The words under Response say what each answer does to the case, as `case_rules()` derives it: "Accepted", or
  "Denied" without reopening the case, marks it "Resolved"; "Partially accepted", "Partially resolved"; "More
  information requested", or a denial that reopens it, "Awaiting response". If the case's lines already decide its
  state, a response leaves it as it is: a line at "Payer approved" or later, a line moved back from it (the case stays
  "Awaiting response", as `case_rules()` counts a line the ledger or a person reopened from "Payer approved" or
  "Recovered" before any answer), or every line written off.
- **D2. Offer only what the record's facts allow; refuse what they contradict, on its field.** Where stored facts
  decide whether a choice can be true, one function decides it for the page (which leaves the choice out, and says
  why under the field) and for the handler (which refuses it on that field, in the same transaction that writes,
  before the database). The refusal names the rule, never a value. The database mirrors the rule (Lane A); a choice no
  stored fact decides stays the person's judgment and is never second-guessed. Of the five write-off reasons only
  "Window passed" is decided by the line's records: true exactly when its window is known and ended before today
  (UTC), as triage's strike and the reopen judge it; a window that cannot be shown open is not open, so with no window
  known it is not true either. `apps/web/src/lib/cases/write-off.ts` holds the rule (`writeOffReasonsFor`,
  `contradictedReason`, `withheldReasonHint`); the case page offers its reasons by it and `writeOffLineAction` refuses
  by it from the row `caseLineState()` holds `FOR UPDATE`, inside its "not yet written off" branch, so a repeat stays
  a no-op. A line's window only ever passes, so the route never refuses a reason the page offered.
- **D3. The payer's answer is uploaded where it is used.** "Log a payer response" holds the shared uploader for one
  payer letter (kind `payer_letter`, PDF), first in the form, and the form shows whether or not a letter is on file.
  The form chooses only the letter it uploaded itself, once stored, never the newest and never over the person's own
  choice, and never moves focus to do it; a duplicate it does not choose is named in the status by when its copy was
  uploaded, as its option starts. A press while the letter uploads or is scanned sends nothing. The letters
  offered are grouped, so that another case's letter is a deliberate choice: those no response names yet that this
  person uploaded, then those another person uploaded (which may be another case's answer, uploaded in its form and
  not recorded yet), then those of this case's earlier responses, listed whole, then those of other cases' responses
  (a payer may answer two cases in one letter, so the route still records one). Each option starts with what tells it
  apart, so a phone's picker that cuts the line keeps it: "Uploaded here" for the letter the form uploaded, then the
  time it was uploaded, its kind and its SHA-256's prefix. Where this person cannot upload, or the practice's uploads
  are closed, the card says to choose a letter on file, or, with none on file, that no response can be recorded yet,
  and the uploader's panel says why, under a title true to the
  state ("Uploads are not open yet" before the BAA, and only then; "Uploads are paused" while a hold on the person's
  uploads can lift; "Uploads are closed" for a closure, which promises no restart; "Uploads are stopped" for a hold whose
  cause these words do not know), the hold as ADR 0080 decides it for this person (`practice_run_refusal_for` with
  `file.upload`: the owner's hold, or a grantee's through its grant) and the database's sentence whole beneath, never
  repeating the title, on every page that offers an upload (one gate, `lib/routes/uploads.ts` `uploadGate`, which the
  practice home's empty state titles alike). One letter's
  refusals are in its own words ("The file is empty."; "save the letter as a smaller PDF"), never a batch's "split it
  or zip it". An uploader inside a form:
  - renders only `type="button"` buttons and unnamed controls, so the server action never receives the file or its
    name;
  - uses its own request keys and the page's CSRF token, never the form's key;
  - renders its headings one level below the form's card, and the form closes the letter's part with a heading of its
    own before the fields that follow;
  - lets the form know of its batch, so the form marks itself touched even for a dropped file, and the form's remount
    for another person clears the batch.
- **D4. A letter is a case's evidence or a contract's source, never both.** A response names only a top-level payer
  letter or other document, scanned clean and stored, that no contract version names (`RESPONSE_DOCUMENT`,
  `apps/web/src/lib/packets/submissions.ts`); every other document is refused on the letter with one sentence, which
  tells a crafted post nothing about a document it cannot see. A letter a response names leaves the contract lists
  ("Documents to tag", "Documents awaiting abstraction"; `NOT_A_RESPONSE_LETTER`,
  `apps/web/src/lib/contracts/contract-queries.ts`) and is refused as a contract's source by every handler that takes
  one (the two tag routes, the amendment and the correction; `refuseResponseLetter`,
  `apps/web/src/lib/contracts/tagging.ts`); a payer's terms letter, which no response names, stays abstractable. Each
  handler that makes a document a response's evidence or a contract's source first takes the document's transaction
  advisory lock (`pg_advisory_xact_lock(hashtextextended('document_use:' || id, 0))`, on the ID in its canonical
  lower-case form), before any other lock, so the two cannot both pass at once and cannot deadlock; Lane A's triggers
  take the same key. The link is `payer_response.document_id`; no kind or column is added. The Contracts panel calls
  its payer letter kind a payer's terms or policy letter ("Payer’s terms or policy letter") and says that a payer's
  answer to a dispute goes with its response instead.

## Alternatives considered

- **A disabled empty first option** (UX-035's words). In a select a form posts, a reset or a render without
  `defaultValue` falls to the first enabled option, which is the defect again; it needs a change to the shared
  `SelectField`; and it prevents nothing `required` does not. A controlled select outside any form may keep one (D1).
- **Leave "Window passed" in the list and refuse it only in the route.** It offers a choice the route then refuses,
  though the page already knows the answer.
- **Hide "Window passed" in the page only.** A post without JavaScript, or a crafted one, still records it (U-UX-6).
- **Judge "Window passed" by the contract's own window where the engine does not compute it.** The product has no
  date for that window; its own date decides, as for the reopen and triage's strike, and Other with the person's words
  remains.
- **Take every payer letter out of the contract lists by its kind.** It cuts the terms-letter path the data model
  admits.
- **Filter the lists only, with no handler refusal.** A crafted tag or amendment would still make a patient's letter
  a contract source, shown to roles without `phi.read`.
- **File the in-form upload as kind `other`, or a new kind.** `other` takes any bytes, gets no page text and mislabels
  the letter; a new kind needs a migration and stays blind to letters already on file.
- **The uploader beside the form, outside `<form>`.** The batch, file names included, would survive another person's
  sign-in, which the form's remount clears inside it, and the letter's select and the uploader would need a context
  across the form's edge.
- **A whole client form, holding a press while scanning through `ActionForm`'s `beforeSubmit`.** The field's own
  `setCustomValidity` holds the press with the same words and leaves the page a server component.
- **Choose the newest letter after the page is read again, with no word from the uploader.** Another person's upload
  in the same minute would be chosen: another patient's letter, linked for good.
- **Save the response while the letter is scanned, and link it later.** A response never changes; it would point at
  evidence intake may still hold.
- **Leave out of the list every letter a response already names.** It blocks a payer letter that answers twice.
- **One practice-wide list of letters, ungrouped.** Another case's letter is one mis-click from an immutable response.
- **Leave other cases' letters out of the list and refuse them in the route.** It loses a payer's one letter
  answering two cases, and turns a duplicate the person holds into a dead end.
- **Let a response name a contract version's source.** It keeps a document in both workflows; the strict rule is one
  invariant for the lists, the handlers and Lane A's rules.
- **Leave the race between a tag and a response to Lane A's triggers.** The handlers close it today with a
  transaction advisory lock, as the web already takes for its own work.
- **Keep the uploader's `<h2>` headings**, or move them to a later pull request; and **only `<h3>` headings in the
  uploader, with no heading before Response.** Either way the form's fields would sit under "This batch" for anyone who
  moves by headings.

## Consequences

- No fact about money or a case is recorded by not choosing: an acceptance the payer never gave, a write-off of an
  open line as lost to its window, a channel. Each needs a choice the person makes.
- The one reason the records can contradict is refused in the handler now, and in the database once Lane A's rule
  lands. Bulk write-off (audit #125) offers reasons by `writeOffReasonsFor` and refuses by `contradictedReason`.
- The payer's letter is uploaded and chosen in one place, and the submissions page's log names each response's letter
  and links its receipt.
- A letter **a response names** stops reaching the contract specialist's queue and the version pages' readers without
  `phi.read`. A letter uploaded in the form but **never recorded** with a response does not: no response names it, so
  it is listed in "Documents to tag" and "Documents awaiting abstraction", can be tagged, and its pages can then be read
  by those roles, as any payer letter uploaded on Contracts can today. This residual stays open until Lane A's
  upload-time link, a column on `source_document` written at upload (a security item).
- For the same reason, a letter uploaded in one case's form and not yet recorded is offered on every other case's
  form, among the letters no response names. Until the upload-time link says which case it belongs to, the form lists
  it apart when another person uploaded it ("Letters others uploaded that no response names yet", after the person's
  own), so another patient's letter is never the first choice; the same link closes this.
- Costs: one more choice and one more date in each form; up to 50 audited reads of the letters per view of the
  submissions page by a person who logs responses, plus this case's own letters, listed whole; until Lane A's migration the console's count of documents awaiting abstraction includes
  response letters; a letter already a contract's document cannot be a response's.
- Lane A's half, each a migration: `case_line_rules()` refuses a person's "Window passed" while the window is open or
  unknown; `console_contract_queue()` leaves out the letters a response names, with an index on `payer_response
  (practice_id, document_id)`; `payer_response_belongs()` admits only a document `RESPONSE_DOCUMENT` admits;
  `contract_version_documents_ok()` refuses a document a payer response names, both triggers under the `document_use:`
  key; and the upload-time link above.

## Not covered

- The six other selects that record a fact and open pre-answered: the mapping's Agreement; the abstraction's Method,
  Cited document and Topic; the console's compliance "What"; the Uploads panel's "Kind of document", which opens on
  "835 remittance". One follow-up pull request, each with its route's enum message.
- Bulk write-off (audit #125), which must use D1 and D2.
- Writing off a line already at Payer approved or Recovered: the founder's question, not decided here.
- A letter that both answers a dispute and announces terms: it leaves the abstraction queue once a response names it.
- The residual above, until Lane A's upload-time link.

## Not verified here

- Browsers other than Chromium, for the custom validity message on the letter select. Without it, `required` still
  stops the press with the browser's own words.

## Revisit when

- Lane A's rules land: the handlers keep their checks, which name the field, and the database's become the second
  check.
- The denial-letter reader (v1.5) reads response letters.
- A path to take a document out of a draft version exists.
- An uploader offering several kinds is placed inside a form: its kind placeholder then becomes enabled (D1).

## Amendment (`co-001/payer-response-db-rules`, 2026-11-11): the database half

This decision left five rules "for Lane A", each needing a migration. Migration
`20261114090000_payer_response_document_rules.sql` adds them, so each check a handler makes is now also made in
Postgres (CLAUDE.md: check in the handler and in Postgres):

1. **`case_line_rules()`**: a person's "Window passed" is refused while the line's dispute window is unknown or has
   not ended, by the date the function already uses for triage's strike and for a reopen. A case line's INSERT is
   unchanged: it carries triage's own judgement, on its pass's date.
2. **`console_contract_queue()`**: a document a payer response names, or one filed for a submission, is not a
   "document awaiting". With it, the index `payer_response_by_document`.
3. **`payer_response_belongs()`**: the document a response names is the practice's, top-level, a payer letter or
   other document, scanned clean, stored, and no contract version's source in any status: the route's own predicate.
4. **`contract_version_documents_ok()`**: a contract version never names a document a payer response names, or a
   letter filed for a submission. Every document of the version is checked every time, not only a newly named one.
5. **`source_document.filed_for_submission_id`** closes the residual this decision recorded: a letter uploaded in
   the response form but named by no response was still a payer letter the contract lists offered. The column says
   why the letter was uploaded. It is written only when the document is inserted, by a person who logs submissions,
   in their own name, for the latest submission of a case of the practice; a zip's entries take their zip's; it
   never changes. Rules 2 and 4 read it from this migration on. The web half follows (the upload route writes it; the
   contract lists and the tagging handlers read it; the response form lists a submission's own uploads first): until
   then the column is NULL everywhere and nothing a person sees changes.

**One lock, and why one function changed its kind.** Rules 3 and 4 shut each other out under the lock the handlers
already take, `document_use:` and the document's id: each takes the lock, then checks, and holds it to the end of its
transaction, so of a response and a version naming one document at the same moment the second waits and is then
refused. Two things make that true, and both are enforced:

- **The check after the wait must read what the wait was for.** `contract_version_documents_ok()` was a `STABLE` SQL
  function, which reads the snapshot of the statement that called it: a lock taken inside it would wait and then check
  with a snapshot from before the wait. It is now a `VOLATILE` plpgsql function, in which each statement reads a new
  snapshot. Its signature, answer, owner and grant are unchanged.
- **Only at READ COMMITTED.** At REPEATABLE READ or above a transaction keeps its first snapshot through the wait, so
  both functions refuse there when a document is named. No mutating route runs above READ COMMITTED.

A version locks its documents in ascending id order, and a response locks its document before its case's submission
lock, so no two of these triggers take the same locks in opposite orders.

**The invariant is proven when the migration applies.** Before it changes anything, the migration counts documents
that both a response and a version name, in every practice, and stops if there is one: under rule 4 a version holding
such a document could never be edited or amended again. `docs/runbooks/deploy-and-rollback.md` says what to do then.

**A search path for `source_document_rules()`.** The function had no `search_path` of its own, so the
`source_document` it reads a zip's row from was whatever the session's path found first, a temporary table of that
name included, and a zip's link read from there could name another practice's submission. It now has
`SET search_path = pg_catalog, public, pg_temp`, as every later trigger function of this schema has, and stays
SECURITY INVOKER. On a migrated database the application role can create no temporary table, so this is defence in
depth, with a test that failed first.

**Not closed: a filed letter whose bytes an earlier upload already holds.** A letter uploaded in the response form
whose bytes equal an earlier upload that carries no link becomes a `duplicate`, and the earlier copy stays as it was:
stored, unlinked, still in the contract lists and still able to be a version's source, until a response names it
(rules 3 and 4 close it from then). Matching by hash ("a document is filed when any document of the practice with the
same bytes is") was refused: rule 4 checks every document of a version every time, so one person who logs submissions,
by uploading a copy of a contract's source letter in the response form, would make every version naming that letter
impossible to edit or amend, for good, since the link never changes. Expected amounts trace to those versions. What
the duplicate leaves is no worse than before: the earlier copy was already a payer letter in the contract lists. What
the form says and does when its upload duplicates an unlinked copy belongs to the web half.

**Not taken.** The same window check on a case line's INSERT (it would tie triage's date to the database clock); a
different lock order in the web's handlers (below; recorded for the handlers' own pull request); a composite foreign key from the link to the submission's practice (no
table of this schema has one: a plain key and the trigger's practice check are the pattern, and with the search path
set the trigger's lookup is the practice's).

**Known, and the handlers' to close: a handler's one lock, then the trigger's several.** The triggers alone never
cross. A handler that tags a document takes that one document's lock first, and the version's trigger then takes every
document of the version in ascending order. Two people who each add a different letter to two open versions that end
up naming both letters can therefore hold one lock each and wait for the other's (reproduced by this pull request's
database review, as the application role). PostgreSQL ends one of the two after its deadlock timeout (`40P01`): that
request fails with nothing saved, the other is recorded, and no wrong row is written. It is not answered as "busy"
today. The fix is in the web, not in a migration: take the locks the trigger will take, in its order, before the
write, or answer `40P01` on these routes as busy. The same review noted that the handlers hash the id as the request
sent it and the triggers hash the stored uuid's text, which are equal only for a lowercase id; the triggers hold the
rule either way, and the handlers should cast the id to `uuid` before hashing. Both are recorded for the web half.

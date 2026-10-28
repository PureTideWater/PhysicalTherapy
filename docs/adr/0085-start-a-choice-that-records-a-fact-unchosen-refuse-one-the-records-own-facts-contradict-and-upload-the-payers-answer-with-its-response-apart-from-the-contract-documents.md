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
  the kind of document"). Either way it starts unchosen. "Received on" stays prefilled with today: a date the person
  sees and can change, bounded by the submission and today.
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
  choice, and never moves focus to do it. A press while the letter uploads or is scanned sends nothing. The letters
  offered are grouped, so that another case's letter is a deliberate choice: those no response names yet, then those
  of this case's earlier responses, then those of other cases' responses (a payer may answer two cases in one letter,
  so the route still records one). An uploader inside a form:
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
  ("Documents to tag", "Documents awaiting abstraction", the console's count; `NOT_A_RESPONSE_LETTER`,
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
- Costs: one more choice in each form; up to 50 audited reads of the letters per view of the submissions page by a
  person who logs responses; until Lane A's migration the console's count of documents awaiting abstraction includes
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

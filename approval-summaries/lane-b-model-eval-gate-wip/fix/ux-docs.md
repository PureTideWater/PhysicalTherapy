# ux part: what the documents must now say (PR #75 fix round)

For the integrator. Each item names the document and the passage (line numbers as of 9b7eadfe), says what is now wrong,
and gives the words. Nothing here is edited by the ux part.

## ADR 0070, Part 3

### 1. "The refusal" (lines 680-694): the mapping and the notices

Now wrong: `screen_failed` no longer maps to `screen_unavailable`; `screen_invalid` no longer "stays `refused`"; the
quoted notice texts are gone; "Propose the terms card stays, and a second click runs the whole check again" is true
but now said to the person only for a failed read. Replace the second bullet (from "The web maps `names_patient`"
through "a second click runs the whole check again.") with:

- The web maps each code to a notice of its own, before the generic `refused` (`apps/web/src/lib/models/path.ts`):
  `names_patient` to `names_patient`, `screen_unavailable` to `screen_unavailable`, `screen_failed` to
  `screen_failed`. `screen_invalid` reads as `screen_unavailable`: it is the code's mistake, not the document's, so
  the person is never told the input is at fault (the generic `refused` says "The input cannot be sent to a model as
  it is"); the document was not checked, and a second try meets the same mistake. The operator's log still names it
  apart (`MODEL_INPUT_SCREEN_INVALID`). The screen's own limits (`contract-proposals.ts` `SCREEN_LIMITS`) answer
  `screen_limited` [once the integrator applies the gateway part's request 4; until then they answer
  `screen_unavailable`]. Each gives its case the next step it can take today, and all four name the records one
  way, "the practice's patient records" (`notices.ts`; the PR #75 review's UX-2 and UX-3):
  - `names_patient`: "This document holds an identifier from the practice’s patient records, so it was not sent to
    the model. If it is a payer letter or an explanation of benefits (EOB), it has no terms to enter: choose the
    version’s contract or exhibit as the document to read, or ask the practice for the contract below. If it is a
    contract or an exhibit, enter its terms by hand below."
  - `screen_unavailable`: "This document could not be checked against the practice’s patient records, so it was not
    sent to the model. Enter its terms by hand below."
  - `screen_failed`: "The practice’s patient records could not be read to check this document just now, so it was
    not sent to the model. Try again in a minute, or enter its terms by hand below." The next click reads the records
    again, before any budget hold or model call, so a second try is worth it; the bound's notice does not say so,
    since a practice above the bound meets it again until F3.
  - `screen_limited`: "Documents have been checked against the practice’s patient records as many times as allowed
    for now, so this one was not sent to the model. Try again later, or enter its terms by hand below." ("Later", not
    "in an hour": a day limit resets only within the day.)
  The first leads with the case the check exists for, a misfiled payer letter or EOB, which has no terms to enter and
  cannot be filed again yet (F4): its way on is the version's own contract or exhibit, or the practice's, through
  the "Ask the practice" card on the same page. A contract or an exhibit that holds an identifier (a single-case
  agreement, or a collision on a TIN or a ZIP+4) is entered by hand. "Below" is true of each: the notices show only on
  a draft version, where "Have the model propose the terms", "Enter a rate record" and "Ask the practice" sit under
  them. None promises re-filing.

And in the third bullet, "The refusal tells the person that the document holds an identifier of one of the practice's
patients" stays true; the notice no longer says the document "names a patient", which overstated it (the check reads
identifiers, never names, and also refuses a TIN or ZIP+4 equal to a stored member ID).

### 2. "The upload panel" (lines 717-726): files wait; Upload, never the select's change

Now wrong: "a drop or a choice of files while no kind is chosen is refused with "Choose the kind of document first,
then choose the files again." before anything is asked of the server (the ERA format check's pattern)". The baseline
review found that pattern a defect (UX-049, should fix), and it threw the files away. Replace that sentence with:

> A drop or a choice of files while no kind is chosen keeps the files in the browser and sends nothing: they are
> listed by name under "Waiting to upload", the kind select is marked `aria-invalid`, described first by "Choose the
> kind of document for these 3 files, then upload them." (`counted()`; "this file … upload it" for one), then by its
> help, and focused; the words sit under the select as an alert, re-inserted at each attempt, so a second drop of the
> same files is announced too. Once the kind is chosen the words go (UX-5) and "Upload 3 files" appears beside
> "Clear": the files upload only on that button, never on the select's change, because an arrow key on a closed
> select changes it once a press (proven in Chromium 1.56: three ArrowDowns gave contract, exhibit, payer letter),
> so starting on the change would file them under the first kind the arrow passed, and a kind, once recorded, never
> changes (F4). A file dropped again (the same name, size and last change) is held once; a choice made while files
> wait joins them and waits for Upload; a batch's own problems (an empty or too large file, a spreadsheet for a
> CSV-only kind, more than 100 files waiting) refuse only the files just chosen; a server refusal puts the files back
> to wait. An ERA export with no system chosen waits the same way, under the system select ("Choose which system’s
> ERA export these 3 files are, then upload them."), which closes the baseline's UX-049. Every panel that offers
> kinds says under the select "A document’s kind cannot be changed once it is uploaded." (UX-4). Focus never drops
> to the page: Upload moves it to "This batch", Clear to "Choose files", a refusal to Upload.

### 3. "What it gives up" (lines 728-750): the scope sentence and a bullet for what a person meets

Now wrong: line 730, "Each gap is a document the check sends that names a patient, or a document it refuses that
does not:", is not true of its own list (the audit trail and the trace of a failure are neither). Replace with:
"Each gap is a document the check sends that names a patient, a document it refuses that does not, a record it leaves
incomplete, or a step a person meets:". Add, last:

- **What a person meets:** a misfiled document cannot be filed again until F4: it stays a contract in its version,
  and the notice can only point to the version's contract or the practice's. The notice says "this document" without
  naming which: the redirect carries only the code, so on a version that holds two contract-kind documents (MOD-12's
  zip of a contract and an EOB) the person tells them apart by the "Document to read" select, which goes back to the
  first. Files waiting for a kind live only in the browser tab: a reload or leaving the page loses them (nothing was
  sent, and the page says what waits). A batch's problems still name a file by its place ("File 2 is empty."), the
  baseline's UX-181 (UX PR 47).

(The UX-1, UX-3, UX-4 and UX-5 gaps the review's UX-6 asked to list are fixed in this PR, so they are not listed.)

### 4. Departure 3 (lines 783-786)

Now wrong: "The person sees one notice for both `screen_unavailable` and `screen_failed`." Replace with: "The person
sees a notice for each: the bound's says to enter the terms by hand, a failed read's to try again (the next click reads
again) or enter them by hand, where the design (5.4) gave both the bound's words (the PR #75 review's UX-3); a check
the gateway did not issue reads as the bound's."

### 5. Departure 17 (lines 815-820), its last sentence

Now wrong: "The refusal is unit-tested through a pure `batchProblems` and static markup (apps/web has no DOM test
environment) and in the browser by the contracts e2e." Replace with: "What files do before the kind is unit-tested
through the pure `afterChoosing`, `waitingFor`, `waitingText` and `heldWith`, and the static markup of `KindField` and
`HeldFiles` (apps/web has no DOM test environment), and in the browser by the contracts e2e (held, marked, focused,
announced again, cleared, and uploaded on Upload with one request)."

### 6. A new departure (append after the last; update the ADR's count of departures wherever it states one)

> **Files chosen before the kind wait for Upload** (`uploader.tsx`), where the design (5.9) refused them with "Choose
> the kind of document first, then choose the files again." (the ERA format check's pattern), and where the baseline's
> settled fix for that pattern (UX-049, "They upload as soon as you choose") would start the batch on the select's
> change. Both lose: the first throws the files away and marks nothing (WCAG 3.3.1; the baseline's "a refusal keeps
> every value, files too"); the second files them under whatever kind an arrow key passes first, a kind that never
> changes. The ERA export's system waits the same way, so UX PR 47 (`co-001/ux-uploader`) keeps the files without
> starting on the choice.

### 7. Consequences (lines 848-849 and 853-854)

Now wrong: the specialist "enters the terms by hand" for a misfiled payer letter or EOB, which has no terms; "the
notice says it was filed as the wrong kind, and hand entry is the way on". Replace 848-849 with:

> - A payer letter or an EOB filed as a contract, or inside a zip filed as one, is refused before the model, with no
>   `model_call` row; the specialist reads the version's contract or exhibit instead, or asks the practice for it
>   (Ask the practice), and enters terms by hand only for a contract or exhibit that holds an identifier (a single-case
>   agreement, or a collision on a TIN or ZIP+4).

and 853-854 with:

> - A misfiled document cannot be re-filed until F4: it stays a contract in its draft version, and the notice points to
>   the version's contract or the practice's, never to hand entry of a letter's terms. Files chosen before their kind
>   wait in the browser until the person chooses it and presses Upload, so the panel files nothing by default or by an
>   arrow key.

### 8. Revisit when (line 860)

"F4 lands (the notice can say "re-file it")" stays. Add: "a contract-kind document is refused on a version that holds
two (the redirect could carry the refused document's opaque ID, so the notice names it and the select offers the
other)."

## docs/runbooks/model-evaluation.md (lines 218-223)

Now wrong: "`MODEL_INPUT_NAMES_PATIENT` (the document names a patient of the practice; it is a misfiled payer letter or
EOB, and its terms are entered by hand)" tells an operator every such line is a misfiled letter, which misleads the
triage of a false refusal reported on a real contract. Replace the parenthesis with: "(the document holds one of the
practice's identifiers: most often a misfiled payer letter or EOB, for which the specialist reads the version's
contract or asks the practice for it; also a contract that names a patient, or a collision on a TIN or ZIP+4, whose
terms are entered by hand)". After `MODEL_INPUT_SCREEN_FAILED (... the scope)` add: "; the person's notice says to try
again, since the next click reads again". After `MODEL_INPUT_SCREEN_INVALID (...)` add: "; the person reads the bound's
notice, never that the document is at fault".

## docs/product/PRD.md (line 575)

Now wrong: "one that holds a member ID, payer claim number or patient control number of the practice's is a misfiled
payer letter or EOB, and is refused, never sent." Replace with: "one that holds a member ID, payer claim number or
patient control number of the practice's is refused, never sent (most often it is a misfiled payer letter or EOB)."

## Outside this repository (for the integrator to pass on; not docs/)

- `/home/user/ops/designs/lane-b-model-eval-gate.md` 5.4 (lines 986-992) and 5.9 (lines 1078-1081) quote the old
  notice texts and the refuse-and-discard; a note that the build departs (items 4 and 6 above) is enough.
- `/home/user/ops/designs/lane-b-ux-review.md`: UX-049's Fix (line 2435) and section 6.1's words (line 1335) say "They
  upload as soon as you choose". Amend to "They wait, listed, until you choose the system and press Upload: an arrow
  key on the closed select changes it once a press, so starting on the change files them under the first system it
  passes (PR #75, UX-1)", and mark UX-049 fixed by PR #75, so UX PR 47 keeps the explicit Upload and does not add
  auto-start back. UX PR 47's test line (line 724, "an ERA batch with no system keeps its files and starts on the
  choice") becomes "... keeps its files and starts only on Upload" (already held by uploader.test.tsx).
- The screen tour's state `p.uploads.error-era-system` and `p.contracts.no-kind` now show the held files, not the
  "Nothing was uploaded" alert; new shots are needed for the PR's reviewer table.

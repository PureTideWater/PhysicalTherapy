# Review: the co-001/ux-payer-response design (UX PR 10)

The one adversarial review of `designs/lane-b-ux-payer-response.md` (1161 lines, read whole), against the code at
`/home/user/ux-payer-response` (`165c599`), the requirements (UX-035, UX-007, their clusters, prs.json order 10, #74's
U-UX-6), the three scouts' reports, and the three lenses: security (`.claude/agents/security-reviewer.md`), money and
stage (`.claude/agents/payment-engine-reviewer.md`), UX and brand (`.claude/agents/ux-brand-reviewer.md`). Open pull
requests were read by REST on 2026-10-28 (#42, #75, #78, #81, #82).

## Verdict

**No blocking finding. Twelve should-fix, sixteen nits.** The design's core holds and is the best option on each
point it decides: an enabled empty first option, not a disabled one (2.1, checked against the HTML selectedness
rules and React's `defaultValue`); one rule for the page and the handler (2.2, 2.3), monotonic, so the route never
refuses what the page offered; the response's letter checked in the handler by one predicate shared with the list
(2.6); the exclusion keyed on `payer_response.document_id` with no column (2.5.7), which keeps the terms-letter path
UX-007's correction protects; the handler refusals for tagging, amendment and correction; Retry's `type="button"`;
the uploader never reusing the form's request key. Every hard constraint holds: no migration (five Lane A items,
7.2); no file of #42 beyond the three shared documents LANES.md rule 6 covers (re-checked against #42's current 217
files, not only the stale 143-line list); nothing in `packages/pricing`, `packages/ledger`, `apps/worker/src/reconcile`
or the worker's packet services; ADR 0085 used, and warranted; CAS-45 to CAS-48 collide with no open PR's rows (#81
adds CAS-41 only, #75 MOD-12, #78 DLR-01 to DLR-04, #82 CI-21 to CI-23).

The should-fix findings are where the design is weaker than the best option or says something the code does not
do: the letter list still offers other cases' letters (S1); another person's sign-in does not clear a dropped file
(S2); an orphaned in-form upload still reaches the contract lists, which the ADR says no longer happens (S3); a race
the handlers can close now is left to Lane A (S4); the uploader's headings land inside the form (S5); three strings
are untrue or misdirect (S6, S7, S8); one harness test cannot pass as written (S9); the tour's error shot is blocked
by the new required select (S10); ADR 0085 D1 contradicts #75's uploader (S11); and the Contracts panel's own "Payer
letter" label, the root of UX-007's misfiling, is left for later though this PR edits that page (S12).

---

## Should-fix

### S1. The letter list still offers letters already the evidence of another case's response (security and privacy, money record)

- **What.** 2.6 keeps "A letter named by an earlier response stays choosable" (design :527-529), and
  `responseDocuments()` stays practice-wide, the 50 newest (`apps/web/src/lib/packets/submissions.ts:330-338`),
  each option told apart only by kind, upload time and a 12-character hash prefix (`submissions/page.tsx:300-306`).
  The design itself names the harm (1.3, :94-96: "another case's, about another patient, to an immutable response")
  and then fixes only the default. A person choosing "a letter already on file" (the hint invites it, 6.1) can still
  link another patient's letter to a response that never changes (`payer_response_rules.sql:16-18`), and it feeds
  the reconcile's approvals.
- **The design's reason does not need the practice-wide list.** The route test it cites reuses one letter within
  **one case**: two submissions of the same case (`lib/routes/workbench-routes.db.test.ts:615`, `:616`, `:633`, `:644`).
- **Fix (recommended).** Group the options, so nothing legitimate is lost and a cross-case choice is never a
  mis-click: `responseDocuments(scope, practiceId, caseId)` returns three groups through `SelectField`'s existing
  `ChoiceGroup` (`components/field.tsx`, the optgroup support): "This case’s response letters" (a response of a
  submission of this case names it), "Not yet a response’s letter" (no response names it), and last "Another case’s
  response letter". The route keeps `RESPONSE_DOCUMENT` alone (a payer may answer two cases in one letter, and a
  duplicate upload proves the person holds that very file, so `duplicate-chosen` still works). The status line for
  `duplicate-chosen` says when the copy on file is another case's letter. Add the case to CAS-48 (a letter of another
  case's response is listed in its own group; the route still records it) and to 4.5.
- Alternative if the orchestrator prefers strictness: leave the third group out and send a duplicate whose original
  is another case's letter to `duplicate-unusable`; this loses the two-cases-one-letter path.

### S2. Another person's sign-in does not clear a file dropped on the drop zone (security, PHI in a file name)

- **What.** 2.5.3 (:396-399), 2.7 (:549, the reason the uploader sits inside the form) and 2.8 (:560) rely on #74's
  remount to clear the batch, file name included. The remount happens only when the form saw an `input` event or
  was refused: `useClearedForAnotherPerson` sets `touched` on `input` alone and returns early otherwise
  (`components/form-issues.tsx:340-349`). Choosing a file through the picker fires `input` on the file input, but a
  **drop** on the drop zone fires none (`components/uploads/uploader.tsx:279-283`, `:302-313`), and the field's
  automatic choice is a state change that fires none either. A person who drops the letter (its name may carry the
  patient's name) and types nothing leaves the batch row, name and all, to the next person in that browser.
- **Why no test sees it.** 4.4 item 9 (:755-756) types before uploading.
- **Fix.** `ResponseLetterField` marks the form touched: when `onBatchChange` first reports a batch (and when it
  chooses a letter) it dispatches `new Event('input', { bubbles: true })` from its select. Add to 4.4: a file
  dropped (a `drop` event with a `DataTransfer`), nothing typed, another person's mark rendered: the batch row and
  the sentinel name are gone and the summary says "Form cleared". Correct 2.8's row to name the drop path.

### S3. An in-form upload that is never recorded still reaches the contract lists, and the ADR says it does not (security)

- **What.** A letter uploaded in the form and then not recorded with (the person chooses another letter while it
  scans, which clears the custom validity, :372; or leaves) is a payer letter no response names. It enters
  "Documents to tag" and "Documents awaiting abstraction", `refuseResponseLetter` does not refuse it (it refuses only
  letters a response names, 2.5.7), so it can be tagged, and the version page then shows its pages to `practice.open`
  roles without `phi.read` (`lib/routes/contracts.ts:186-192`; the very exposure of 1.5 item 3). The design records
  the window as "short" (2.8 :566; 8.1 :1134) and calls Lane A's fix "recommended" (7.2 item 5), while ADR 0085's
  Consequences say "response letters stop reaching the contract specialist's queue and the version page's readers
  without `phi.read`" (:895-897), which is not true for this path.
- **Fix.** (1) ADR Consequences and 2.8 say exactly what remains: an orphaned in-form upload is listed, taggable and
  readable by those roles until Lane A's upload-time link. (2) Lane A item 5 moves from "recommended" to the
  security item it is, under "Waiting on someone: Lane A", and the pull request's description names the residual.
  (3) The `stored-not-chosen` status adds where that letter goes if no response names it, so the person can choose
  it here instead (6.1 :963). No migration-free fix exists that the design missed (no column or kind marks an
  upload's purpose; `other` would hide it but takes any bytes, `apps/worker/src/intake/classify.ts:38`, and loses page
  text), so recording it precisely is the fix here.

### S4. The tag-against-response race is left to Lane A, though the handlers can close it now (security)

- **What.** 7.2 item 4 (:1091-1095) and 8.1 (:1135) give the per-document lock to Lane A's triggers. The web
  handlers already take transaction advisory locks with no migration (`apps/web/src/lib/cases/workbench.ts:92`,
  `:117`; `packages/contracts/src/services.ts:269`), as intake does per hash (`apps/worker/src/intake/intake.ts:125`).
  Both handlers run their check and their write in the route's one transaction.
- **Fix.** `responseDocumentChoosable()` and `refuseResponseLetter()` each first run `SELECT
  pg_advisory_xact_lock(hashtextextended('document_use:' || $1::text, 0))` on the document ID. Under READ COMMITTED
  the check after the lock sees the other transaction's commit, so "a response's evidence or a contract's source,
  never both" (2.5.7) holds in the handlers today. Lane A's triggers take the same key (say so in 7.2 item 4). One
  line in 8.1 changes from "Lane A's lock" to "the handlers' lock; Lane A's triggers repeat it".

### S5. The uploader's headings land inside the form and capture its fields (UX and accessibility, WCAG 1.3.1, 2.4.6)

- **What.** The drop zone's heading is an `<h2>` (`uploader.tsx:314`) and "This batch" is a `Card` whose `CardTitle`
  is an `<h2>` (`uploader.tsx:413-416`; `packages/ui/src/components/card.tsx:19-21`), under the card's own `<h2>` "Log
  a payer response" (`submissions/page.tsx:267`). Placed first in the form (2.5.1), they put Response, Received on,
  Amount, Denial reason and Notes under "This batch" (or under "Upload the payer’s letter" before a file is chosen)
  for anyone who moves by headings. The Contracts panel's structure is not a precedent: no fields follow its
  uploader. axe's `heading-order` is a best-practice rule, so 4.7's WCAG run will not see it.
- **Fix.** Take the heading level in this PR (the design defers it to UX PR 47, :421-423 and 7.3 item 3): an opt-in
  `headingLevel?: 2 | 3` on `Uploader`, additive like (a) to (d), rendering the drop zone's heading and the batch's
  title at that level (the batch title as an `<h3 data-slot="card-title">` with the same classes); the response form
  passes 3. Add to 4.4 item 10: the field's headings are `h3`.

### S6. The words under Response imply that Denied and More information requested can change (money and status words)

- **What.** "Accepted and Partially accepted are recorded for good, …" (2.4 :274-276; 6.1 :971). Every response is
  recorded for good: the UPDATE refusal and the DELETE and TRUNCATE triggers apply to every kind
  (`payer_response_rules.sql:16-18`; migration `20261023090000:738-739`). Scoping "for good" to two kinds tells the
  person a hurried Denied can be corrected, which it cannot. "Resolved or Partially resolved" also leaves the reader
  to map which, and "then" hides that approval waits for the next reconcile (the design's own table says so, :285).
- **Fix (recommended words).** "Every response is recorded for good. Accepted resolves the case and Partially
  accepted partly resolves it; at its next reconcile the recovery ledger approves up to the amount below on the lines
  this submission asked for (Payer approved). Nothing is recovered until it is posted or deposited." Update CAS-46's
  assertion and 4.6 step 2 to match.

### S7. The `held` status points the wrong way (UX words)

- **What.** "The letter was held at intake, so it is not chosen; its line above says why." (6.1 :962). By 2.5.1's
  order (:299-300) the status line sits under the select, and the batch row with the receipt's words comes after the
  drop zone, **below** it.
- **Fix.** "The letter was held at intake, so it is not chosen; its line under This batch says why."

### S8. A stored letter that has not reached the list has no state, and a failed refresh leaves the person stuck (UX reliability)

- **What.** 2.5.2's table (:362-369) goes from "receipt not settled" (`scanning`) to "settled `stored`, once the
  refresh has brought it into `letters`". Between the two, nothing is defined, so the status keeps saying "The letter
  is being scanned", which is false. The uploader refreshes once (`uploader.tsx:254-259`); if that refresh fails, or
  the letter is excluded by then (a tag in another tab), the status never changes and no next step is given.
- **Fix.** Add a state `stored-listing` ("The letter is stored and is being added to the list.") and, when the
  letter is not in `letters` after a second refresh the field asks for itself, `stored-not-listed` ("The letter is
  stored but cannot be chosen here. Reload the page, then choose it; what you typed is not kept by a reload."), with
  the custom validity cleared in both. Add a harness case: receipt `stored`, `letters` never updated.

### S9. Harness test 4.4 item 6 presses Enter in a textarea (test design)

- **What.** "Enter in Notes sends exactly one action" (:750-751). Notes is a `TextAreaField`
  (`submissions/page.tsx:319`); Enter in a textarea inserts a line break, and implicit submission comes only from a
  single-line input. The harness form (3.2 :621) holds a Response select, Notes and the field: no single-line input,
  so the test either fails or proves nothing about (b), whose risk 2.5.4 names as Enter in **Amount** (:411).
- **Fix.** The `?form=response-letter` harness form adds the Amount `Field`; item 6 presses Enter in Amount with Retry
  showing and asserts exactly one action, with the form's own fields, and no call to the retry route.

### S10. The tour's `p.submissions.error` shot can no longer reach the refusal (screens)

- **What.** The tour's act chooses Response and fills Received on, then presses
  (`tools/lane-b-screen-tour/capture/tour.spec.ts:2445-2459`). After this PR the Payer’s letter select is first,
  required and on `''`, so the browser stops the press and `refused(page)` never sees the summary. 4.8 calls the
  tour "robust to the new first option" (:837-838), and 6.2 wants this shot "with the letter's field above it"
  (:1012).
- **Fix.** The act chooses the letter first (`page.getByLabel('Payer’s letter', { exact: true }).selectOption({
  index: 1 })`; PACKETS has its letter on file); say so in 4.8 and 6.2. The new `letter-scanning` cap is right to leave
  the letter unchosen. 4.8 also cites "(6.3)", which does not exist.

### S11. ADR 0085 D1 contradicts #75's uploader, and the kind select is missing from the list (coordination, ADR)

- **What.** #75 (draft, `871faff`) gives the uploader's kind select a **disabled** first option, "Choose the kind of
  document", with `required`, and holds files until a kind is chosen (its `CHOOSE_KIND_PLACEHOLDER` and `KindField` in
  `uploader.tsx`). A document's kind is a fact recorded for good (migration `20261016090000:204-205`; #75's own help
  line "A document’s kind cannot be changed once it is uploaded."), so D1 squarely covers it, and D1 says "Disabled
  placeholders are not used" (:873-877). 3.7 (:670) plans the merge but not the contradiction. 7.3 item 1's five
  selects also omit the Uploads panel's preselected "835 remittance" kind (`uploader.tsx:142`;
  `uploads/page.tsx:40-48`), which #75 keeps.
- **Fix.** Name #75's kind select in 3.7 and in the ADR (Not covered, with the reason D1 gives); add the Uploads kind
  select to 7.3 item 1; record under "Waiting on someone (the orchestrator)" that #75 takes D1's enabled placeholder
  when it rebases, or that ADR 0085 states why a kind select differs. Whichever merges second keeps both, by rule 6.

### S12. The Contracts panel still labels the kind "Payer letter", the label that files a payer's answer there (UX-007's root)

- **What.** The panel's options come from `KIND_NAMES`, capitalised (`app/p/[practiceId]/contracts/page.tsx:217`;
  `lib/uploads/receipt-labels.ts:198`): "Payer letter" is what a person holding the payer's answer chooses, as the e2e
  journey does today (`e2e/packets.spec.ts:474-476`). The design adds a sentence to the description (6.1 :988-992) and
  defers the label to UX PR 47 (7.3 item 4), though this PR already edits `contracts/page.tsx` (3.4).
- **Fix.** Relabel it here, in the `kinds` map at `:217` only ("Payer’s terms or policy letter"; `KIND_NAMES` and the
  receipts unchanged), keep the sentence, and note the merge with #75, which rewrites the same lines. A wrong kind
  never changes once uploaded, so the label is where the mistake is prevented.

---

## Nits

1. **1.5 item 3** says the contract specialist reads a version's pages on the `practice.open` version page. The
   specialist holds no `practice.open` (`packages/db/src/authz/permissions.ts:200-204`); they read pages through the
   abstraction version page (`rate_record.edit`). The conclusion holds for the viewer.
2. **1.5, the corrections:** the remittance check is `payer_response_belongs.sql:42-44`, not `:44-46`.
3. **Header and 3.7:** #42 is now at `46974a2`, with 217 files (the list in `pr42-files.txt` holds 143). The
   intersection was re-run here and is unchanged (only the three shared documents); re-run it at build.
4. **6.1, the drop zone:** "One PDF, up to 2 GiB." is written as `formatBytes(upload.maxBytes)`, which prints "2.0
   GiB" (`lib/uploads/receipt-labels.ts:208-217`); and the uploader's own "Each file is scanned …" follows a one-file
   sentence. Write the exact string that renders.
5. **6.1, the log line:** the link text names the letter but opens a metadata receipt titled "Receipt …"
   (`app/p/[practiceId]/uploads/[documentId]/page.tsx:269`). Say where it goes (WCAG 2.4.4): "(with its document: the
   receipt of the payer letter uploaded 2026-10-28 14:02 UTC, SHA-256 {hash})".
6. **6.1, `duplicate-unusable`:** "That file is already on file, but not as a letter a response can carry" repeats
   itself and uses the design's word "carry". Suggest: "This file was uploaded before as another kind of document or
   as a contract’s document, so it cannot be this response’s letter. Upload the letter in another form, such as the
   payer’s portal page saved as a PDF."
7. **`stored-not-chosen`:** "Choose it in the list" asks the person to find their upload among options told apart
   by time and hash. Mark the form's own upload in its option ("…, uploaded here").
8. **6.1, the tagging refusal** has no next step (`PRD.md:256`): end it "; tag the contract, exhibit or the payer’s
   terms letter instead".
9. **The no-window branch** (a hint and a refusal sentence) looks unreachable for a case line: triage inserts a case
   line actionable or struck on a known, ended window (`case_line_rules.sql:16-23`, `:31-34`; `packages/triage/src/
   actionable.ts:10-15`). Keep it as a defensive branch, say so, and test it in the unit test only.
10. **Focus and the live region:** say that the automatic choice never moves focus, and that the status line renders
    empty from the first render (a live region present before it changes).
11. **Two polite live regions** announce on settle: the batch's `CardDescription` (`uploader.tsx:416-418`) and the
    field's status line. Acceptable; note it in 4.7.
12. **2.5.8, "one gate, one place":** `lib/routes/reconciliation.ts:114` keeps its BAA-only gate. Take it too, or
    scope the sentence.
13. **The letter hint** says "Upload the payer’s letter here" when the person cannot upload (`canUpload` false or the
    gate closed); choose the hint by `upload.canUpload && upload.gate.open`.
14. **7.3 item 2:** the packet's attachable documents (`lib/packets/queries.ts:183-191`) also offer other cases'
    response letters, not only held and duplicate ones; say so.
15. **The tour's new cap** leaves a SYNTHETIC document in intake on PACKETS for the rest of the run; no later PACKETS
    shot lists uploads (checked: the `p.uploads` shots use other practices), so say so in 6.2.
16. **8.1's last row** cites `workbench-routes.db.test.ts:451`; the submission calls are at `:452`, `:554-556`, `:616`,
    `:633`.

---

## Cites checked

Every file:line in sections 1 to 8 was opened at `165c599` (and the tour on `claude/build-ops`'s checkout). All hold
except those named above (nits 1, 2, 3, 4, 16; S9's harness form; S10's "(6.3)"). Checked and holding, among others:
`cases/[caseId]/page.tsx:203`, `:215`, `:222`, `:224`; `submissions/page.tsx:37`, `:75`, `:117-119`, `:268`,
`:271-276`, `:282-284`, `:293-308`, `:383`, `:388`; `lib/routes/triage.ts:464-495`, `:471`, `:472`, `:478`, `:482`,
`:494`, `:517-519`; `lib/triage/queries.ts:592`, `:631-632`, `:678-690`; `case_line_rules.sql:29-42`, `:55`;
`packages/triage/src/cases.ts:93`; `lib/routes/submissions.ts:82-113`, `:139`, `:195`, `:225-227`, `:233`, `:235-252`,
`:270`; `lib/packets/submissions.ts:110-150`, `:330-338`, `:364-376`; `uploader.tsx:14-18`, `:97`, `:101`, `:108-137`,
`:142`, `:166`, `:180`, `:201-206`, `:249-259`, `:314`, `:319-340`, `:379-397`, `:400-411`, `:435`;
`packages/ui/src/components/button.tsx:40-42`; `receipts.tsx:124`, `:182`, `:196`, `:202` (and `ReceiptStatus` holds
no button); `components/field.tsx:35-64`, `:203-209`, `:233-243`; `form-issues.tsx:416-421`; `action-form.tsx:42-46`,
`:80`, `:86`; `lib/cases/refusals.ts:7-15`; `lib/http/invoke.ts:231-253`, `:317-320`; `lib/http/next.ts:239-242`;
`contract-queries.ts:16`, `:340-359`; `tagging.ts:40-46`; `abstraction.ts:110`, `:169`, `:227-228`, `:393-440`;
`contracts.ts:47`, `:100`, `:118-121`, `:186-192`, `:225`; `uploads.ts:46`, `:107-117`, `:131-146`, `:231`, `:236`,
`:339`; `permissions.ts:137-151`, `:195-198`; `payer_response_belongs.sql:32-34`, `:39-41`;
`payer_response_rules.sql:16-18`; `case_rules.sql:33-37`, `:53-58`, `:67-70`; `ledger_line_stage.sql:33-35`;
`reconcile/pass.ts:40`, `:45`; `reconcile/responses.ts:46-86`; `reconcile/stages.ts:72`; `packets/services.ts:756`,
`:963`; `intake.ts:124-139`, `:240-262`; migrations `20261016090000:181-183`, `:204-210`; `20261016160000:291-297`;
`20261023090000:239`, `:253`, `:261`, `:738-739`, `:874-878`, `:890`; `20261026090000:250`; `20261028090000:3-11`,
`:19-53`; `20261015140500:15`; `contract-proposals.ts:132-137`; `models-routes.db.test.ts:493-500`; `console.ts:839`;
`e2e/packets.spec.ts:40-42`, `:401-407`, `:474-477`, `:483-493`, `:521-534`; `e2e/triage.spec.ts:136`, `:147-151`;
`e2e/unattested.spec.ts:117`, `:149`; `e2e/export-attempts.ts:68`; `e2e/a11y.ts:11`, `:101`; ADR 0077 `:146-160`,
`:198-202`; `upload-form.tsx:169`; `console/prospects/page.tsx:115-121`; `PRD.md:256`, `:279`, `:302`, `:514`;
`tour.spec.ts:91-96`, `:2145`, `:2326`, `:2442-2459`; `packages/synth/src/cases/matrix.ts:170-181`;
`registry.ts:246-251`; `fixtures.test.ts:33`.

## What the three lenses found holding

- **Security.** No PHI reaches a URL, key, job payload, log or error: the file input stays unnamed, the upload request
  sends kind, type and size only, keys are opaque, the refusals name rules. Every check is in the handler as well as
  the screen, scoped by `practice_id` under FORCE RLS on both tables in the new subqueries; the uploader uses its own
  request keys and the page's CSRF token; the uploads it makes go through the scanned intake with the server's
  limits. The two new document reads become audited reads. S2, S3 and S4 are the gaps.
- **Money and stage.** No amount is computed, rounded or moved; no stage or ledger entry is written by anything new;
  LED-01's e2e assertions stay; the only new refusal stops a false reason and records nothing; no model touches a
  number, a stage or the letter. The founder's question (a write-off of a line at Payer approved or Recovered) is
  recorded, not decided. S1 and S6 are the money-record points.
- **UX and brand.** The words keep the brand's rules ("recovered" only with posted or deposited; the typographic
  apostrophe; refusals in the lower-case rule style; no value in a refusal); the placeholder is an enabled first
  option with the codebase's precedent; the form keeps typed values through the upload and the refresh; the e2e
  checks the page at 390 px after the upload. S5, S7, S8, S10 and S12 are the gaps.

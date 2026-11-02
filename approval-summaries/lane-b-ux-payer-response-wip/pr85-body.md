## What changes

Choices that record a fact no longer arrive already answered, and the payer's letter is uploaded in the form that asks for it. This is the UX baseline review's PR 10: UX-035, graded blocking at baseline, and UX-007. It was deferred from #74's review as U-UX-6. The head is a97d6011: the build's 29dded52, the base merge 90ec40ab, a fix round of three commits (2865db68, cf6d0f42, 13e4e2fe) and one final polish commit (a97d6011).

- **Choices start unchosen.** These fields each start on an enabled, empty first option marked `required`: the write-off Reason, the payer's Response, the submission's Channel and the response's Payer's letter. Their first options read "Choose the reason", "Choose the payer’s answer", "Choose the channel" and "Choose the payer’s letter". Each route refuses an empty choice on that field, so #74's summary names the field. "Received on" now starts empty and `required` too. It sits between the submission's date and today, and the hint under it says that a reopening denial counts the next level's window from it. The route refuses an empty date on its field: "enter the date the payer’s letter was received". Before, a hurried press recorded "Window passed" or "Accepted", which nobody chose, and today's date, which nobody entered. The next level's window and the case deadline were then counted from that date.
- **Only reasons that can be true.** The write-off offers "Window passed" only after the line's window has ended. A hint says why it is withheld: either the window is still open or no window is known. The route refuses "Window passed" on an open or unknown window. It does this inside the "not yet written off" branch, before anything is written, and its words carry no date.
- **What each answer records.** The words under Response cover every answer, following `case_rules()`:
  - "Accepted", or "Denied" without reopening the case, marks the case "Resolved".
  - "Partially accepted" marks it "Partially resolved".
  - "More information requested", or a denial that reopens the case, marks it "Awaiting response".
  - When the case's lines already decide its state, the response leaves that state as it is. That covers a line at "Payer approved" or later, a line moved back from it, and every line written off.
  - At the next reconcile, the recovery ledger approves up to the amount on the lines this submission asked for.
  - Nothing counts as recovered until it is posted or deposited.
- **The payer's letter is uploaded in the form.** "Log a payer response" now uploads the letter itself (one PDF, scanned, then chosen) and keeps every typed field during the upload and the scan.
  - The card's description depends on whether this person can upload here now and whether a letter is on file. When neither is possible, it says no response can be recorded yet.
  - The letters are listed in four groups:
    - "Letters you uploaded that no response names yet";
    - "Letters others uploaded that no response names yet";
    - "Letters of this case’s earlier responses", listed whole;
    - "Letters of other cases’ responses".
  - Each option starts with the details that tell letters apart: "Uploaded here" for the letter this form uploaded, then the upload time, then the SHA-256 prefix.
  - A duplicate the form does not choose is named by its copy's upload time.
  - Refusals for a single letter use its own words: "The file is empty."; "save the letter as a smaller PDF".
  - Before, the card sent the person to Uploads, which takes no letters. The only path that worked put the letter in the contract tagging lists.
- **The route checks the letter a response names.** The letter must be a document of the practice that is top-level, of kind payer letter or other, scanned clean and stored, and that no contract version names as a source. The web handler checks it (`responseDocumentChoosable` in `lib/packets/submissions.ts`) before the service records the response; before, the route and the service accepted any document of the practice, so a crafted post could link an 835 or a quarantined file. The trigger `payer_response_belongs()` is unchanged and still checks only the practice; applying the letter check there is Lane A item 3. The check and the tagging both take a `document_use:` advisory lock on the document, so a letter cannot be tagged as a contract document and named by a response at the same time.
- **Contracts and Reconciliation.**
  - A letter a response names leaves "Documents to tag" and "Documents awaiting abstraction".
  - On Contracts, the kind reads "Payer’s terms or policy letter". The panel is now "Upload a contract, exhibit or payer’s terms letter", it is named by that title, and its drop zone is the h3 "Choose contracts, exhibits or payer’s terms letters to upload". It states the limit as "2.0 GiB", formatted as on Submissions.
  - On Reconciliation, the upload panel is named by its title, and its drop zone is the h3 "Choose posting or EFT exports to upload".
  - Contracts and Reconciliation now share the upload gate that Uploads uses.
- **A closed upload panel names the true state.** The title reads "Uploads are not open yet" before the BAA, "Uploads are paused" while the organization is suspended, and "Uploads are closed" once it is closed. The body uses upload words, not "new runs". A suspension text the panel does not know is shown whole under "Uploads are stopped". When uploads are closed, the Reconciliation "No export uploaded yet" state says "No export can be uploaded now; the note above says why." For a person who cannot upload, it names who can.

### Every visible and wording change

All were taken under the co-founder's standing direction (2026-10-25 ~21:34 UTC), within `.claude/rules/brand.md` and CO-11. The build's and the fix round's strings are all in section 6.1 of the design (`designs/lane-b-ux-payer-response.md` on `claude/build-ops`): added at 2e8d37a3 and checked against the code at a97d6011, with two card description rows corrected at f82a536e. Every user-facing string added in `apps/web/src` since 90ec40ab is there. The list below is the full record.

- Case page, "Write this line off":
  - Reason opens on "Choose the reason".
  - "Window passed" is withheld, with "“Window passed” is offered once this line’s dispute window has ended." or "“Window passed” is not offered: no dispute window is known for this line."
  - Refusals: "choose the reason"; "a line whose dispute window is still open is not written off as “Window passed”; choose the reason that applies"; "a line with no known dispute window is not written off as “Window passed”; choose “Other” and say why".
- Submissions, "Log a submission": Channel opens on "Choose the channel"; refusal "choose the channel".
- Submissions, "Log a payer response":
  - The card's description in four states. Open uploads with a letter on file: "upload it here, or choose one already on file". Open with none: "upload it here". Closed with one on file: "Choose the payer’s letter already on file…". Closed with none: "…so no response can be recorded yet".
  - The letter's field comes first, under "Upload the payer’s letter" (h3). Its hint follows the same four states. A status line covers the scan, storage, choice, duplicate and hold cases. The press is held while the letter uploads or scans. The letter is refused if it is not one PDF.
  - The four letter groups and the option order described above.
  - "What the letter says" (h3) heads the fields that follow.
  - Response opens on "Choose the payer’s answer", with the words above under it.
  - "Received on" starts empty, with its hint and refusal.
  - Refusals on fields: "choose the payer’s answer", "choose the payer’s letter".
  - The log names each response's letter and links its receipt.
- The uploader:
  - Each drop zone's region is named by its heading, not "Drop zone".
  - At 390 px the drop zone's padding is `p-4` (`sm:p-8` above).
  - The progress bar is drawn in token colours.
  - Retry never submits.
  - Inside a form, its headings sit one level below the card.
- The closed-panel titles and bodies above appear on Uploads, Submissions, Contracts and Reconciliation.
- Contracts: the kind label, the panel title and accessible name, the h3 drop-zone heading, the limit as "2.0 GiB", and the line "A payer’s answer to a dispute goes with its response instead, on the case’s Submissions and responses page."
- Reconciliation: the panel's accessible name follows its title; the h3 "Choose posting or EFT exports to upload"; the empty Exports next step.

### Shared files, ADR and tests

- **Base merge (90ec40ab).** It merged `claude/build-platform` at 83d71fd6 (#81, #78) and kept both sides (LANES.md rule 6):
  - In `uploader.tsx`, #78's leave guard, `DownloadLinks`, `reportFrom` and `receiptsNotice` sit beside this PR's five changes. `inFlight` reuses #78's `stillSending`.
  - A new CAS-47 browser test proves three things: the guard asks only while the letter is being sent, a Retry re-arms it, and the response's press never meets it.
  - `test-matrix.md`, synth `matrix.ts` and `registry.ts` keep CAS-41 before CAS-45 to CAS-48.
  - The base has since gained #82 (bce57f16) and #83 (43565235). Neither conflicts: `git merge-tree` of a97d6011 and 43565235 is clean, and only the three shared documents overlap. The base is merged again before this pull request merges.
- Decision record: ADR 0085 (new). It was updated in the fix round: D1 (Received on; every answer's words), D3 (the four groups, the option order, the closed-panel titles, the single-letter words) and D4.
- Tests: CAS-45 to CAS-48 are registry entries without files in synth module 5. Their `expected.json` is synth's own output.

### What this pull request leaves open

Listed so that no reviewer reads more into it (design 3.9).

- **The residuals.**
  - A letter uploaded in the form and never recorded with a response is listed among the contract documents and can be tagged. Its pages can then be read by the viewer and the contract specialist, who hold no `phi.read`, as for any payer letter uploaded on Contracts today (design 2.8). It stays open until Lane A's item 5, which is a security item.
  - For the same reason, a letter another person uploaded in another case's form is offered on every case's form, though now in its own group after the person's own letters (S2-N3).
  - At 375 px the Contracts kind select is cut again; at 390 px it fits with nothing to spare (re-review round 2).
  - The "Uploads are stopped" state cannot be reached on synthetic data, so it has no shot. It is proven by a db test.
  - Pre-existing and not touched:
    - the packet's attachable-evidence list shows every letter, including other cases' response letters;
    - in dark mode, the date-picker icon is dark on dark;
    - prettier warns on the merged files exactly as it warns on both parents.
- **Lane A** (design 7.2). Each item is a new migration under CO-02; the handlers check, and lock, today.
  1. `case_line_rules()` refuses a person's "Window passed" while the window is open or unknown.
  2. `console_contract_queue()` leaves out response letters, with an index on `payer_response (practice_id, document_id)`. Until then, the console's count of documents awaiting abstraction includes them.
  3. `payer_response_belongs()` applies the handler's letter check.
  4. `contract_version_documents_ok()` refuses a letter a response names. Items 3 and 4 take the `document_use:` lock key.
  5. A security item: an upload-time link column on the uploaded document (design 2.8, 8.1). It closes both residuals above.
- **The founder's open question** (design 8.2): whether a line already at Payer approved or Recovered may be written off, and with which reasons. Not decided here; see "Waiting on the founder".
- **Uploads still says "Drop 835 files or ERA exports here".** This wording predates this PR, which leaves it. Contracts and Reconciliation now say "Choose … to upload"; Uploads follows in its own UX pull request.
- **F1, as a product question.** A case reopened for the next dispute level keeps an open next-level window (`payer_response.next_window_ends_on`), but "Window passed" is judged, here as everywhere else in the product, by the line's own window. Whether a reopened case's lines should be judged by the next level's window is a product question for the founder and the product. It is not a defect of this PR.
- **Beyond the queue's file list** (design 3.6). The queue (`prs.json`) names eight files; `git diff 83d71fd6 a97d6011` changes 41. Beyond the eight:
  - `uploader.tsx` is in the list, but only to pass the kind; its four other additive changes go beyond that: a Retry that never submits, a finished-upload report, single-file mode and a heading level;
  - `lib/routes/submissions.ts`, `uploads.ts`, `reconciliation.ts`, `abstraction.ts` and `lib/contracts/tagging.ts`;
  - `app/p/[practiceId]/contracts/page.tsx` and `reconciliation/page.tsx`;
  - `lib/cases/write-off.ts`, `components/packets/response-card.tsx` and `components/packets/response-letter.tsx` (all new);
  - `components/reconciliation/display.tsx` (`exportsEmptyNextStep`) and `components/test-support/forms-harness.tsx`;
  - the db, unit and browser tests, and the e2e specs and helper beyond `packets.spec.ts`;
  - ADR 0085, the CAS-45 to CAS-48 `expected.json` files and the three shared documents (test matrix, synth matrix, registry).
- **#75.** Its disabled kind placeholder sits outside any posted form, which ADR 0085 D1 allows.
- **Shared files with open pull requests** (from GitHub's file lists today):
  - #75 (871faff9): `contracts/page.tsx`, `reconciliation/page.tsx`, `uploader.tsx`, `lib/routes/uploads.db.test.ts` and the three shared documents (test matrix, synth matrix, registry);
  - #84: the three shared documents;
  - #42: the test matrix only.
  Whichever merges second keeps both (LANES.md rule 6).
- **Waiting on the founder:** whether a line already at Payer approved or Recovered may be written off, and with which reasons. This is a money and stage ruling, not decided here.

## Why

The UX baseline review's PR 10 (`designs/lane-b-ux-review.md`, UX-035 and UX-007; clusters C-065 and C-011; on `claude/build-ops`). UX-035 was graded blocking. A pre-answered Response records a payer decision nobody made: the case moves to Resolved, and at the next reconcile an amount is approved on the ledger. A pre-answered write-off reason records a false fact on the line. Lane A's orchestrator moved this pull request ahead of UX PR 6 and 7 for that reason (2026-10-28 03:45 UTC). The fix round answers the two adversarial reviews, the critic's nits and three rounds of re-review (below).

## What it does not change

- Pricing engine (`packages/pricing`): unchanged.
- Ledger (`packages/ledger`): unchanged, and nothing under `apps/worker/src/reconcile` changes. What an acceptance records is unchanged; only its words are now shown.
- Database schema and migrations: no migration, and `packages/db/functions` is unchanged. The matching database rules are Lane A's (below).
- Content releases (`content/`): unchanged.
- Domain model (`docs/product/domain-model.md`), its approval line and `approvers.json`: unchanged.
- CI and the GitHub settings: unchanged. No workflow, manifest or lockfile is among the 41 changed files.
- Also unchanged:
  - No file of #42 (PR 6b-4) changes, except the shared documents LANES.md rule 6 names (the test matrix, the synth matrix and the registry).
  - No new dependency.
  - Authorization and tenancy: every new read is practice-scoped and audited as before, and no stage or ledger path is touched.
  - The mutation gate found no money path changed.

## Checks

The required checks report on this page by themselves: <!-- required-checks -->`all green`, `mutation`,
`screening-capacity gate` and `approval-of-record`<!-- /required-checks -->.

The full local suite ran on 13e4e2fe, on Node 24.22.0 and PostgreSQL 18.4. a97d6011 changes three files on top of it (the Reconciliation page, one e2e spec and one e2e helper), and the checks those files reach were run on a97d6011; their record names no Node or PostgreSQL version.

| Command | Result |
| --- | --- |
| **On a97d6011 (head)** | |
| `pnpm typecheck` | Pass. 22 projects. |
| eslint on the 3 changed files | Pass. Exit 0. |
| `pnpm lint:copy`, `pnpm lint:logs` | Pass. 540 files; 1,085 files. |
| `pnpm build` (web and worker), build stamp a97d6011 | Pass. Tree clean. |
| e2e (prebuilt), 7 specs: reconciliation, ledger-patient-share, brand, packets, unattested, font-hosts, viewer-phi | 13 passed, 0 failed. |
| `pnpm synth --all`; `watched.ts --write`; `git diff` | 0 written, 654 unchanged (16 EMR unchanged); 539 lines; no diff. |
| **On 13e4e2fe (the full local suite)** | |
| `pnpm install --frozen-lockfile` | Pass. Already up to date. |
| `pnpm typecheck` | Pass. 22 projects. |
| `tools/stryker/affected.ts --base 83d71fd6`; `tools/stryker/gate.ts` | No money, pricing, ledger or packets path affected, so no shard. Gate passed. |
| `pnpm lint` | Pass. 1,674 files, 0 errors, 0 warnings. |
| `pnpm lint:copy`, `pnpm lint:logs` | Pass. 540 files; 1,085 files. |
| `pnpm check:fixtures` | Pass. 333 guard files, 3,875 text files. |
| `pnpm test` | Pass. 403 files: 6,823 passed, 4 skipped. Coverage thresholds met. |
| `pnpm test:golden` | Pass. 376 tests. |
| `pnpm test:oracle` | Pass. pyx12 and edi835 agree on all 687 fixtures. |
| `pnpm verify-content` | Pass. |
| `pnpm test:db`, 4 shards, each on a freshly migrated database | Pass. 129 files: 9,293 passed, 1 skipped, 0 failed. |
| `pnpm build`, build stamp 13e4e2fe | Pass. |
| `pnpm test:e2e`, 2 shards | 63 passed, 0 failed, 0 flaky, 0 retries. |
| `pnpm synth --all`; `watched.ts --write`; `git diff --exit-code` | 0 written; unchanged; clean. |
| `pnpm actions:check`, `pnpm toolchain:check` | Not run: no workflow, manifest or lockfile changed. |
| Model identifiers in `git diff 83d71fd6` | None. |

No command failed, flaked or was re-run. The base merge's own checks on 90ec40ab were green too:
- typecheck, lint, lint:copy, lint:logs and check:fixtures;
- unit: 6,818 passed, 4 skipped;
- synth and `watched.ts` wrote nothing;
- `test:db` on the upload, workbench, contracts and unattested route files and route-test shards 2 to 9: 4,660 passed.

## Reviewer agents' findings

The reviews ran on 90ec40ab against base 83d71fd6.
- **Security and money:** two finders.
- **UX and brand:** two finders, using before and after shots from `tools/lane-b-screen-tour`.

There were 20 findings, and three verifiers judged each one: 13 were real and 7 refuted. Every real finding was fixed in 2865db68, and later commits proved or extended some fixes (named in each row). Re-review then ran until a round found nothing. The shots are in private galleries:
- **Before (83d71fd6):** [1280](https://claude.ai/artifact/P3JBtVwbWhpuDMXdwLxsSJ), [390](https://claude.ai/artifact/W3BeEkHZBD3jDHZbqEHj4F), [1280 dark](https://claude.ai/artifact/7g5ME7bzUPa3f6Z4rF37uM).
- **First after (90ec40ab):** [1280](https://claude.ai/artifact/Af9wPUdrWCySD3QpYGmbWC), [390](https://claude.ai/artifact/DgTGAdMWr1qEX1oMVRnqog), [1280 dark](https://claude.ai/artifact/DYrg8YoYSwcPXQxhJuFQXQ).
- **After the fix round (13e4e2fe):** [1280](https://claude.ai/artifact/3iCSW99opuzmyvS7eohkzz), [390](https://claude.ai/artifact/C5TvJaTbjSfUjUEJ5Woxus), [1280 dark](https://claude.ai/artifact/7nVhABbzohq7uv8TPbfAP3).

| Reviewer | Finding | Resolution |
| --- | --- | --- |
| Design reviewer (security, money and UX lenses) | 28 findings on the design (12 should-fix, 16 nits) | Each was applied before the build (design section 9). |
| Design-conformance critic (after the build) | 8 nits, nothing blocking or should-fix | n1 to n8 below. |
| Critic | n1: a duplicate the person did not choose had no words | Fixed in 2865db68: new status `duplicate-not-chosen`, which cf6d0f42 extended to name the copy's upload time and to add `-other-case`. |
| Critic | n2: the design table says "since the upload began", but the rule is stricter | Not a defect in the code. The ADR and the code agree (the form never overrides the person's choice). The design's wording is corrected at 2e8d37a3: the letter is chosen only while the select is empty or still holds the letter the form chose, and a letter the person chose at any time is never replaced. |
| Critic | n3: ADR D4 named "the console's count" as a list the letter leaves | Fixed in 2865db68: removed from D4. The count stays open (Lane A item 2). |
| Critic | n4: `DOCUMENT_USE_LOCK` was copied three times | Fixed in 2865db68: exported from `tagging.ts`. The db test keeps its own literal so it still checks the exact key Lane A matches. |
| Critic | n5: the CAS-45 to 48 `expected.json` files contradict the design's "No synth fixture" | Not a defect in the code: they are generator output, as for CAS-39. The design's wording is corrected at 2e8d37a3: the header, 4.2 and section 9 say the generator writes only `expected.json` for these no-file entries. |
| Critic | n6: a duplicate beyond the list's limit of 50 got untrue words, and this case's group was cut | Fixed in 2865db68: this case's letters are listed whole and the limit applies to the rest. The `duplicate-unusable` words are now true. |
| Critic | n7: the paused upload gate on Contracts and Reconciliation was untested | Fixed in 2865db68: tests in `contracts-routes` and `reconciliation-routes` db, and Uploads in `billing-routes`. |
| Critic | n8: the tour (design 6.2) and this description (design 3.9) are outside the repo | Done. The tour steps are on `claude/build-ops` (ed3e2f7d, 10871e99, ceb1f4c2), and this description states 3.9. |
| Security and money | S2-N1 (should-fix): the Response hint omitted that "Denied" without a reopen marks the case Resolved | Fixed in 2865db68: the hint covers every answer, as `case_rules()` derives it. 13e4e2fe adds a line the ledger moved back from Payer approved. Proven by workbench db tests and the packets e2e. |
| Security and money | S2-N2 (should-fix, predates): "Received on" defaulted to today, and the next window and the case deadline are counted from it | Fixed in 2865db68: the field starts empty and `required`, with a hint, and the route refuses an empty, blank or missing date on its field. A db test shows the window counts from the date entered. |
| Security and money | S2-N3 (polish, predates): another case's unrecorded letter was listed first on every form | Fixed in 2865db68 as far as the form can: the person's own unrecorded letters are listed first, and letters others uploaded follow in their own group, so another person's upload comes first only when the person has none of their own. The full fix is Lane A item 5 (see residuals). |
| UX and brand | ux85-1 (should-fix): a suspended organization's panel read "Uploads are not open yet" over "new runs" words, now on three more screens | Fixed in 2865db68: titles and bodies true to each state, in an upload's words. 13e4e2fe shows an unknown text whole under "Uploads are stopped". Proven by db tests on Uploads, Contracts and Reconciliation. |
| UX and brand | ux85-2 (should-fix): at 390 px the Contracts kind select cut "Payer’s terms or policy letter" | Fixed in 2865db68: the drop zone is `p-4` on phones. cf6d0f42 added an e2e check that measures the select at 390 px; a probe showed it fails without the fix. |
| UX and brand | ux85-5 (polish, predates): "payer letter" named two things | Fixed in 2865db68: the Contracts title and drop-zone heading now say "payer’s terms letter". 13e4e2fe pins them in e2e. |
| UX and brand | ux85-7 (polish, predates): "2 GiB" on Contracts but "2.0 GiB" on Submissions | Fixed in 2865db68: Contracts uses `formatBytes`. 13e4e2fe pins it in e2e. |
| UX and brand | U2-ux85-r2-1 (should-fix): the response card said "upload it here" while uploads were paused | Fixed in 2865db68: the description depends on the person's upload right and the gate. cf6d0f42 moved it into `response-card.tsx`, which the page and the harness share, with browser tests for all four texts. |
| UX and brand | U2-ux85-r2-2 (polish): every option started "Payer letter, uploaded", so at 390 px the distinguishing part was cut | Fixed in 2865db68: options start with "Uploaded here", then the time. |
| UX and brand | U2-ux85-r2-3 (polish): a single letter was told to "split it or zip it" | Fixed in 2865db68: "The file is empty." and "…save the letter as a smaller PDF." |
| UX and brand | U2-ux85-r2-5 (polish): the Response hint named options without quotation marks | Fixed in 2865db68: options and states are quoted, as in the write-off hint. |
| UX and brand | U2-ux85-r2-6 (polish, predates): the drop zone was a landmark named "Drop zone" | Fixed in 2865db68: the region is named by its heading on every page. |
| UX and brand | U2-ux85-r2-7 (polish, predates): the progress bar used the browser's green | Fixed in 2865db68: drawn in token colours. cf6d0f42 asserts the classes. |
| Security and money | F1 (refuted, 3 of 3): "Window passed" ignores a case reopened for the next dispute level | Not a defect of this PR. Triage's strike and `case_line_rules()` judge by the same window, so the rule matches the product's one meaning, and the strike writes such a line off first. Left open as a product question (below). |
| UX and brand | ux85-3 (refuted, 3 of 3): the refusal summary lists Response before the letter | Not reachable: both selects are `required` with browser validation on, so the server's summary never carries both. |
| UX and brand | ux85-4 (refuted, 2 of 3): "This batch" is drawn larger than its sibling h3s | The design chose card-title classes for it (uploader change e), and ADR 0056's scale does not require otherwise. |
| UX and brand | ux85-6 (refuted, 2 of 3): two parentheses in a row in the log line | They were already on the base. The PR only lengthened the second, using the design's 6.1 words. |
| UX and brand | ux85-8 (refuted, 3 of 3): "Choose a file" stays offered while the letter is in flight | A new choice replaces the batch rather than adding a file to it, and the design chose this (2.5.2). |
| UX and brand | U2-ux85-r2-4 (refuted, 3 of 3): an error stays under the letter after the form chooses it | Not reachable with browser validation on, and the platform keeps issues until the next response by design. |
| UX and brand | U2-ux85-r2-8 (refuted, 3 of 3): the Contracts sentence gives no link to Submissions | It is neither an error nor an empty state; the rail's Cases link is on every page. |
| Re-review round 1 (on 2865db68): correctness, security, money | R1: the route does not bound "Received on" | Not a defect: `payer_response_belongs()` already refuses a date before the submission or after today, which round 3 confirmed. |
| Re-review round 1: UX, brand, tests | 4 findings: the card text was unproven; the closed card with no letter on file contradicted its hint; the duplicate's copy was not named; the 390 px select and the progress bar were untested | All fixed in cf6d0f42. |
| Re-review round 2 (on cf6d0f42): correctness, security, money | The hint omitted a line the ledger moved back from Payer approved | Fixed in 13e4e2fe. The packets e2e's hint pattern fails without the new clause, and a new workbench db test fails without the database's reopened-lines branch of `case_rules()`. |
| Re-review round 2: UX, brand, tests | The hint was hard to parse; the Contracts strings were unpinned and the card's name differed from its title; the fallback said "paused" twice; the 390 px select fits with 0 px to spare | The first three were fixed in 13e4e2fe: hint reworded, Contracts card named by its title with an h3 drop zone and pinned in e2e, fallback under "Uploads are stopped". The fourth was not taken because the select still fits at 390 px; it is listed under residuals. |
| Re-review round 3 (cf6d0f42 plus fix pass 3's changes, then uncommitted and later committed in 13e4e2fe) | None from either reviewer | Each fix was confirmed, each proven by a test that fails without it. Round 3 made no changes of its own. |
| UX delta review (after shots at cf6d0f42, plus code) | No finding against the change. One pre-existing polish: Reconciliation's empty Exports said "Upload … above" while uploads were paused | Fixed in 13e4e2fe: `exportsEmptyNextStep`, with 3 unit tests. Seen in `p.reconciliation.uploads-paused.1280` (after the fix round). |
| Final delta (cf6d0f42..13e4e2fe): correctness, security, money | None | No new query, and no tenancy, authorization, ledger or stage path. |
| Final delta: UX and brand | None against the change. One pre-existing polish: the Reconciliation upload card was named "Upload exports" apart from its title, with an h2 drop zone beside the card's h2 | Fixed in a97d6011: named by its title, with the h3 "Choose posting or EFT exports to upload". The reconciliation e2e proves both levels. This commit came after the 13e4e2fe galleries, so it was judged from code and e2e. |
| Base merge review (90ec40ab) | None. Both sides are intact in all 5 overlapping files, and the new CAS-47 leave-guard test is sound. | Not applicable. |

Shots behind these rows (by shot id; each at `.1280`, `.390` and `.1280-dark`):
- `p.submissions.default`, `.error`, `.error-unchosen-response`, `.error-unchosen-channel`, `.notice`, `.letter-refused`, `.letter-scanning`, `.letter-list`, `.uploads-paused`;
- `p.case.write-off-open`, `p.case.error-unchosen`;
- `p.contracts.default`, `.kind-letter`, `.packets`, `.uploads-paused`;
- `p.reconciliation.default`, `.empty`, `.uploads-paused`;
- `p.uploads.default`, `.era-format`.

Baseline: UX-035 and UX-007 are fixed on screen. UX-024 is still open; it is not this PR's.

## Freeze exception

No: it changes none of them.

## Domain model

No migration; the document is unchanged.

## The founder's approval

This pull request merges only after the founder's approving GitHub review of its latest commit and green required
checks. The build waits for that review from the day it works under its own GitHub account
(`docs/runbooks/github-governance.md`, 3i), and from step 5 GitHub requires it too; before 3i, on green checks alone
(reconciliation 001, D4 (a)). The review is the record of the approval, not anything written here; a new commit
dismisses it. The build then merges, and never reviews.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01FcouKNxBLBBy2FVM7bfSvj

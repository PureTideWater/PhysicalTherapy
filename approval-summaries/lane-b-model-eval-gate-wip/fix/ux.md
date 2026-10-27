# PART ux: PR #75 fix round (co-001/contract-phi-check, head 9b7eadfe)

Resumed run: there was no earlier progress file and none of my files had been changed, so all of this was done in this run (20:05-20:45 UTC). Nothing was committed, stashed or reset. I did not touch any file outside my part: changes to other files are in requests.md "## ux" and the document changes are in ux-docs.md.

Worktree files changed (8):
- apps/web/src/components/uploads/uploader.tsx
- apps/web/src/components/uploads/uploader.test.tsx
- apps/web/src/lib/models/notices.ts
- apps/web/src/lib/models/path.ts
- apps/web/src/lib/models/path.test.ts
- apps/web/src/app/p/[practiceId]/abstraction/versions/[versionId]/page.tsx
- apps/web/src/app/p/[practiceId]/contracts/page.tsx
- apps/web/e2e/contracts.spec.ts

Not needed: a migration, a change to words.ts (counted() was enough), or any change to reconciliation/page.tsx (see "Left").

## Findings

### UX-1 (major): files chosen before a kind are thrown away. Fixed.

**What it does now.** Files dropped or chosen before the kind (or before an ERA export's system) are kept in the browser and nothing is sent.
- They are listed by name under "Waiting to upload: N files".
- The waiting select gets `aria-invalid="true"` and `aria-describedby="upload-kind-error upload-kind-help"`: the error is read first, then the help, as in field.tsx.
- Focus moves to that select.
- The words appear under the select as `role="alert"`. The element is keyed by an attempt counter, so a second drop of the same file is announced again.
- Once the kind is chosen, the words go away and "Upload N files" appears beside "Clear".
- Files upload only on that button, never on the select's change.
- A file dropped again (same name, size and lastModified) is held once.
- A new choice made while files wait joins them and waits for the button; focus goes to Upload.
- A batch's own problems (an empty or too-large file, a spreadsheet for a CSV-only kind, more than 100 files waiting) refuse only the files just chosen. The files already waiting are kept.
- A server refusal puts the files back to wait, with focus on Upload.
- Focus never drops to the page: Upload moves it to the "This batch" card (tabIndex -1), and Clear moves it to "Choose files".
- While files wait, "Choose files" becomes an outline button, so Upload is the one primary action.
- The ready path does not change: a panel with its kind chosen and nothing waiting starts at once, as before (the Uploads page's 835, and every other e2e flow).

**Where (uploader.tsx).**
- KIND_HELP: :97
- waitingFor: :116; waitingText: :124
- heldWith (dedupe): :131-147
- afterChoosing: :150-186; tooMany: :188
- batchProblems: :215. It no longer pushes the two "choose … again" messages and no longer takes the unused `format` parameter.
- KindField: :309
- HeldFiles: :375
- Focus effect: :440
- Refusal keeps the files: :490
- choose, uploadHeld, clearHeld: :565-596
- Wiring: KindField :639, format select :660-688, Choose files :714, HeldFiles :717, batch card :733
- CHOOSE_KIND_FIRST and the old ERA refusal are removed.

**Reviewer's fix vs skeptic's.** I took the skeptic's fix, which refines the reviewer's (explicit Upload and Clear, dedupe, re-announce on every attempt, ERA system too). The task offered "upload as soon as a kind is chosen", and I rejected it because it can file under a kind the person did not choose. The proof: in Chromium, three ArrowDowns on the closed select changed the kind three times (contract, exhibit, payer_letter) with zero requests. Auto-start would have filed the files under Contract on the first press, and a kind never changes.

**The ERA system as well.** I applied the same hold to an ERA export with no system (the skeptic's item 1, which closes the baseline's UX-049). It is the same harm in the same component, and this PR touched its cause (batchProblems). Leaving it out would give the panel two behaviours for one situation. The cost is one other e2e: era-exports.spec.ts:100-104 must change. The exact edit is requests.md "## ux" item 1. Without it that spec fails, because the old words are gone and a re-choice now waits for Upload.

**Tests.**
- uploader.test.tsx was rewritten. It now covers waitingFor, waitingText, heldWith, afterChoosing (hold, focus, dedupe, join, start, ERA, refusals, the limit, an empty choice), the static markup of KindField (aria-invalid, describedby order, alert, help) and HeldFiles (group, names, Clear, Upload count), and that batchProblems never refuses a choice still to make.
  - Before the fix (old uploader): 15 failed, 9 passed (progress/fix-ux-uploader-before.log).
  - After: 24/24 passed (progress/fix-ux-uploader-after.log).
- Browser proof, run in Chromium 1.56 on the real Uploader bundled by esbuild with next/navigation stubbed. The harness is in the scratchpad (scratchpad/phi/fix-ux-harness: build.cjs, drive.cjs, drive-before.cjs; results before.json and after.json).
  - Before (head bundle): the files were dropped; the select had no aria-invalid or describedby; focus stayed on BODY; a repeat drop inserted nothing (silent); after a kind was chosen the stale alert stayed and nothing was held.
  - After: held, marked, described and focused; the repeat drop re-inserted `#upload-kind-error`; three arrows sent 0 requests; Upload sent 1 request with kind contract for both files and focused "This batch"; a 403 kept both files with focus on Upload; Clear left focus on Choose files; the Uploads 835 started at once; an ERA file was held with `#upload-format` focused and invalid, and Upload sent its formatId.
  - Styled screenshots (the app's built CSS) at 1280, 390 and 1280-dark, in fix-ux-harness/held-*.png. No horizontal scroll at 390.
- e2e contracts.spec.ts:74-124, this PR's step, rewritten:
  - the region is named by its title;
  - the select has the help as its description;
  - a drop with no kind is held, focused, aria-invalid and described;
  - a second choice joins it and changes the words;
  - Clear sends focus to Choose files and nothing is uploaded;
  - with the agreement chosen before its kind, selecting Contract sends no request;
  - Upload 1 file focuses "This batch", reaches "Stored", and makes exactly one /uploads/request.
  - PASSED: 1 passed in 2.5 min including the production build (progress/fix-ux-e2e-contracts.log).
  - I did not run this e2e against the old uploader: that would mean swapping the file in a shared worktree. The unit and browser before/after cover it.

### UX-5 (nit; folded into UX-1): the refusal stays after a kind is chosen. Fixed.

The words under the select come from the current state (files are waiting and the kind is missing), so they go away the moment a kind is chosen. The browser proof shows `kindError` null and no alert after one arrow press. A kind or system change while files wait also clears the last alert, because the files are checked again on Upload (uploader.tsx:648-651, :670-672). I rejected the skeptic's fallback ("Now choose the files again …"): it was only needed if UX-1 was deferred.

### UX-4 (minor): the kind's permanence is not said at the moment it is chosen. Fixed.

On every panel that offers kinds, under the select: "A document’s kind cannot be changed once it is uploaded." It is `<p id="upload-kind-help">`, tied by aria-describedby, and placed after the select as the skeptic said (the same as `upload-format-help`). It shows on Contracts, Reconciliation and Uploads, and is true on all three.
- Test: uploader.test.tsx, "says, where the kind is chosen, …". It failed before (no describedby) and passes after.
- e2e: `toHaveAccessibleDescription` on Contracts.
- I did not build the skeptic's optional `kindHelp` prop ("held as a duplicate"); it is a nice-to-have.

### UX-2 (minor; reviewer major): the names_patient notice's next step. Fixed (notices.ts:48-49).

New words, with the misfiled case first because the check exists for it:
"This document holds an identifier from the practice’s patient records, so it was not sent to the model. If it is a payer letter or an explanation of benefits (EOB), it has no terms to enter: choose the version’s contract or exhibit as the document to read, or ask the practice for the contract below. If it is a contract or an exhibit, enter its terms by hand below."

- I took the skeptic's text over the reviewer's: in MOD-12's case the real contract is already in the version, so "ask the practice" alone is not the best step.
- I reworded "propose from" to name the select the person uses ("as the document to read").
- It promises no re-filing (F4).
- "Below" is true: notices show only on a draft version, where the propose card, "Enter a rate record" and "Ask the practice" sit underneath.
- It names no patient, identifier, kind of identifier or count (m14).
- Not done: the skeptic's optional improvement, carrying the refused document's ID in the redirect. It is in ux-docs.md as a "Revisit when" item. It would change routes/models.ts, the gateway part's file.

### UX-3 (minor): screen_unavailable says "patient details". Fixed, with the skeptic's split.

I took the skeptic's fix over the reviewer's single text. "Try again later" is false for a practice above the bound until F3, and a failed read is worth a second click.
- `screen_failed` is a new problem (notices.ts MODEL_PROBLEMS :33, text :51): "The practice’s patient records could not be read to check this document just now, so it was not sent to the model. Try again in a minute, or enter its terms by hand below."
- `screen_unavailable` (:50): "This document could not be checked against the practice’s patient records, so it was not sent to the model. Enter its terms by hand below."
- path.ts:172-188 maps `screen_failed` to `screen_failed`.
- All four contract-screen notices name the records one way, "the practice’s patient records", and path.test.ts now guards that.
- I also added `screen_limited` (notices.ts :34, text :52-53), which is the notices.ts half of the gateway part's request 4. I used different words from the request: "patient details" would break one name per thing, and "in an hour" is false when a day limit is the one hit. The contract-proposals.ts half stays with the integrator (requests.md "## ux" item 3).
- This breaks the gateway part's models-routes.db.test.ts screen_failed case, as expected. With my change that test now receives `?model=screen_failed` (1 failed, 15 passed; progress/fix-ux-models-routes-db.log). The exact edit is requests.md "## ux" item 2.
- Tests: path.test.ts was rewritten.
  - Before: 3 of 3 failed (progress/fix-ux-path-before.log).
  - After: 3 of 3 passed, and 27/27 together with the uploader tests (progress/fix-ux-path-after.log).

### N-1 (nit): screen_invalid gets the generic text that blames the document. Fixed (path.ts:187).

`screen_invalid` now reads as `screen_unavailable`, and I chose that over a text of its own. Its words are true: the document was not checked. They do not blame the input, and hand entry is the right step because a retry meets the same code fault. It also needs no new notice for a case lint.test.ts makes impossible in production. The operator's log still names it apart (MODEL_INPUT_SCREEN_INVALID).
- Test: path.test.ts. It received 'refused' before and passes after.

### N-2 (nit): the propose card says nothing of the check. Fixed (abstraction/versions/[versionId]/page.tsx:111-114).

The card now ends: "… A payer letter is never sent to it, and a contract or exhibit is first checked against the practice’s patient records: one that holds an identifier from them is not sent either."
- It has no unit test (static copy). pnpm lint:copy passes and tsc is clean.

### N-3 (nit, pre-existing): the contracts upload region's name differs from its title. Fixed (contracts/page.tsx:192-194).

`<Card role="region" aria-labelledby="upload-contract-title">` and `<CardTitle id="upload-contract-title">`, so the name is the title and cannot drift from it. This is the form the baseline's UX PR 24 plans. I updated the e2e locator (contracts.spec.ts:78), and the passing e2e proves it.

### UX-6 (docs): not a code finding. Written in ux-docs.md.

The ADR, runbook and PRD corrections are in /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/fix/ux-docs.md:
- ADR 0070 Part 3: "The refusal", "The upload panel", "What it gives up" (the scope sentence and a "What a person meets" bullet for what is left), departures 3 and 17, a new departure (files wait for Upload, not auto-start, citing the arrow-key proof), Consequences :848-849 and :853-854, and Revisit when.
- runbooks/model-evaluation.md:218-223.
- PRD.md:575.
- Notes for ops: design 5.4 and 5.9; UX-049's Fix line in the baseline, which must not bring auto-start back in UX PR 47.

## Every changed string (for the PR description)

- apps/web/src/components/uploads/uploader.tsx:97, select help: "A document’s kind cannot be changed once it is uploaded."
- uploader.tsx:127, under the kind select while files wait: "Choose the kind of document for this file, then upload it." / "Choose the kind of document for these N files, then upload them."
- uploader.tsx:127, under the system select while files wait: "Choose which system’s ERA export this file is, then upload it." / "Choose which system’s ERA export these N files are, then upload them."
- uploader.tsx:391, group title: "Waiting to upload: N files" (counted())
- uploader.tsx:401, button: "Upload N files" / "Upload 1 file"
- uploader.tsx:405, button: "Clear"
- Removed: "Choose the kind of document first, then choose the files again." and "Choose which system’s ERA export the files are, then choose the files again."
- notices.ts:48-49 names_patient, :50 screen_unavailable, :51 screen_failed (new), :52-53 screen_limited (new): the texts quoted above.
- abstraction/versions/[versionId]/page.tsx:113-114: "…, and a contract or exhibit is first checked against the practice’s patient records: one that holds an identifier from them is not sent either."
- contracts/page.tsx:192: region name "Upload a contract or exhibit" becomes the title, "Upload a contract, exhibit or payer letter" (aria-labelledby).

## Left, or for the integrator

1. requests.md "## ux" item 1 (required): era-exports.spec.ts:98-104. Item 2 (required): models-routes.db.test.ts, the screen_failed case. Item 3: contract-proposals.ts's `SCREEN_LIMITED_PROBLEM = 'screen_limited'`, its comments and :731. Item 4 (optional): align the gateway's internal "patient details" sentences.
2. I did not run era-exports.spec.ts (not my file). Its new flow is proven in the harness (after.json u2-u4).
3. Named, not changed: the same defect class as N-3 remains on reconciliation/page.tsx:278 ("Upload exports" under "Upload posting and EFT exports") and the version page's "Propose the terms" region. E2e files outside this part depend on both names (reconciliation.spec.ts:55, ledger.ts:76, models.spec.ts:124/171). They belong in UX PR 24.
4. Still open from the baseline and left to UX PR 47: UX-097 (the hidden file input is a tab stop), UX-159 (partly helped: the selects now take `max-w-full`), UX-163 and UX-181 (problems name files by position).
5. New screen-tour shots are needed for `p.contracts.no-kind`, `p.uploads.error-era-system` and the version page's model notices.
6. A React Compiler lint bailout (react-hooks/preserve-manual-memoization) came from computing `waiting` before the useCallbacks. I moved it after them (uploader.tsx:562), and lint is clean.

## Commands and results (all under flock /tmp/laneb-heavy.lock, PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH:/opt/node22/bin)

- `pnpm exec vitest run --project unit apps/web/src/components/uploads/uploader.test.tsx`: before 15 failed, 9 passed; after 24/24.
- `pnpm exec vitest run --project unit apps/web/src/lib/models/path.test.ts apps/web/src/components/uploads/uploader.test.tsx`: path before 3 of 3 failed; after 27/27.
- `pnpm exec vitest run --project unit apps/web/src/components apps/web/src/lib/models apps/web/src/lib/copy tools/brand-copy`: 27 files, 275/275.
- `pnpm exec tsc -p apps/web --noEmit`: exit 0.
- `pnpm exec eslint <the 8 files>`: exit 0.
- `pnpm lint:copy`: exit 0 ("514 files read; the product copy keeps the brand's words").
- `E2E_ADMIN_URL=postgres://postgres:test@localhost:5433/postgres E2E_DATABASE=tp_e2e_ux E2E_PORT=3197 PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers pnpm exec playwright test e2e/contracts.spec.ts` (in apps/web): 1 passed (2.5 min, including the build).
- `DATABASE_URL=postgres://postgres:test@localhost:5433/postgres pnpm exec vitest run --project db apps/web/src/lib/routes/models-routes.db.test.ts`: 1 failed, 15 passed. The failure is the expected screen_failed case, which waits for requests.md "## ux" item 2.
- Browser harness: `node build.cjs && node drive.cjs` (and `drive-before.cjs <head bundle>`), with results in after.json and before.json; `node shots.cjs` for the screenshots.

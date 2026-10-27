# PR #75 (contract PHI check, ADR 0070 Part 3): UX and brand review

Reviewer: UX and brand (the `ux-brand-reviewer` checklist, run as a default agent). Head `9b7eadfe`, base `e908c214`.
Clone: `/tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/clones/review-ux`.
Synthetic data only. Cites are `file:line` at the head unless marked otherwise.

## What I looked at

Every tile of both runs in `scratchpad/phi/ux-capture.md` was read: 59 before (`screens-before`, TOUR_REF `e908c214`) and
70 after (`screens-after`, TOUR_REF `9b7eadfe`).

| Shot id | Before | After | What it shows |
| --- | --- | --- | --- |
| `p.contracts.default.1280`, `.1280-dark`, `.390` | 2, 2, 3 tiles | 2, 2, 3 tiles | The kind select changes from Contract to "Choose the kind of document". It fits at 390 px (about 222 px). The 664 px table overflow is the same before and after. |
| `p.contracts.no-kind.1280`, `.1280-dark`, `.390` | not taken (the base preselects Contract, so the step would upload) | 2, 2, 3 tiles | "Nothing was uploaded / Choose the kind of document first, then choose the files again." The alert sits under the dashed zone, inside the card. The select is not marked. |
| `p.reconciliation.default.1280`, `.1280-dark`, `.390` | 4, 4, 5 | 4, 4, 5 | Only the select changes (Posting export becomes the placeholder). It fits at 390 px. The 405 px table overflow is the same before and after. |
| `p.uploads.default.1280`, `.1280-dark`, `.390` | 1, 1, 2 | 1, 1, 2 | Unchanged: "835 remittance" is still chosen. The panel is pixel-identical (capture note). |
| `p.abstraction-version.model-names-patient.*` | 3, 3, 5 (no notice: the base does not know the code) | 4, 4, 5 | "Nothing was proposed" with the names_patient text. It wraps cleanly at 390 px and the title is legible in dark. |
| `p.abstraction-version.model-screen-unavailable.*` | 3, 3, 5 (no notice) | 4, 4, 5 | "Nothing was proposed" with the screen_unavailable text. |
| `p.abstraction-version.model-notice.*` | 4, 4, 5 | 4, 4, 5 | The existing "Model step recorded" notice, for comparison. Unchanged. |

Also checked:
- `pnpm lint:copy` at the head passes (514 files).
- A Playwright check in the clone (`scratchpad/phi/ux-scripts/select-arrow.cjs`, Chromium 1.56 headless). Pressing ArrowDown on a focused, closed `<select>` fires `change` on every press: `["contract","exhibit","payer_letter"]`. This decides the fix for UX-1.
- The design's 5.4, 5.9, m14, m15 and N4; ADR 0070 Part 3, its departures 1 to 19 and "What it gives up".
- The baseline's open findings on these screens.

## Findings, most severe first

### UX-1 (major, should fix). A drop or a choice of files before the kind throws the files away, and the select is not marked, focused or tied to the message

- **Where:** `/p/[practiceId]/contracts` and `/p/[practiceId]/reconciliation`; shots `p.contracts.no-kind.1280`, `.390`, `.1280-dark`.
- **Evidence:**
  - `apps/web/src/components/uploads/uploader.tsx:125-126` adds `CHOOSE_KIND_FIRST` (`:87`). `start()` then returns at `:255` without keeping the chosen files.
  - The refusal renders below the drop zone (`:457-468`). The select (`:381-401`) gets no `aria-invalid` and no `aria-describedby`, and focus does not move to it. The shot shows the select unmarked above the alert.
  - A second refused attempt renders the same `<li key={problem}>` with unchanged text. The DOM does not change, so a screen reader hears nothing the second time. The PR's own e2e (`apps/web/e2e/contracts.spec.ts:77-89`) makes exactly that second attempt.
  - The heading "Drop contracts, exhibits or payer letters here" invites the drop that is now refused. On a phone, the person goes back through the file picker for every file.
- **Rule:**
  - WCAG 3.3.1, 3.3.3 and 4.1.3.
  - Checklist: "a refusal keeps every value, files too"; "each error is text under its control ... tied by `aria-describedby`"; "focus moves to the error".
  - Baseline UX-049 (C-037). It found this exact pattern on the ERA system select, rated it should fix and settled "keep the files and start on the choice".
  - This PR copies that pattern ("the ERA format check's pattern", ADR 0070 `:721`) onto two more screens. It worsens the baseline finding and touches its cause, so the finding is this change's own.
- **Best fix** (`uploader.tsx` only; no migration, no ruling needed):
  - Hold the chosen files in the browser while no kind is chosen. Nothing goes to the server.
  - Show the message under the select, with `id="upload-kind-problem"`. Set `aria-invalid="true"` and `aria-describedby="upload-kind-problem upload-kind-help"` on the select, and move focus to it.
  - When a kind is chosen, show a button that starts the batch: "Upload 3 files" (through `counted()`), and "Clear" beside it.
  - Do **not** start the upload on the select's `change`, which departs from UX-049's "they upload as soon as you choose". Arrowing through a closed select fires `change` on every press (proven above), so a keyboard user would upload under Contract on the first press. That is the very misfiling this PR prevents, and it cannot be undone (F4).
  - A second drop adds to the held files and updates the count, so the message changes and is announced.
  - Words for the message: "Choose the kind of document for these 3 files, then upload them." With one file: "this file" and "upload it".
  - Apply the same hold to the ERA system refusal: that closes UX-049 in the same edit.
  - Tests: a pure `heldBatch` helper in `uploader.test.tsx`, and the contracts e2e, which should assert the files are kept, the select is `aria-invalid` and focused, and the batch starts only on the button.

### UX-2 (major, should fix). The names_patient notice tells the contract specialist to enter terms that a letter or EOB does not have, and gives no step for that case

- **Where:** `/p/[practiceId]/abstraction/versions/[versionId]`; shots `p.abstraction-version.model-names-patient.1280`, `.390`.
- **Evidence:** `apps/web/src/lib/models/notices.ts:26`.
  1. "Enter its terms by hand." comes before the case it does not fit. A payer letter or an EOB has no contract terms. The ADR's own consequence repeats this: "the specialist enters the terms by hand" (ADR 0070 `:849`).
  2. "it was filed as the wrong kind" has no next step, and the specialist cannot re-file it (F4). For an EOB there is no right kind on this screen at all: the Contracts kinds are contract, exhibit and payer letter (`apps/web/src/lib/routes/contracts.ts:47`).
  3. The real next step is already on the page and goes unnamed: the always-shown "Ask the practice" card (`page.tsx:449`).
  4. "names a patient" is not what the check proves. It reads identifiers only, never names ("What it gives up"), and it refuses a TIN or ZIP+4 that equals a stored member ID, which names no patient (ADR "Refused that names no patient"; measured 10 and 10).
  5. "EOB" appears in no screen before this PR (`git grep`; not in `words.ts` INITIALISMS).
- **Rule:**
  - `PRD.md:256`: every error carries a next step the reader's role can take, true to where it points.
  - Checklist "Words": claim nothing the product cannot prove; one name per thing.
  - `BRAND.md:23`: exact.
- **PHI (for the security reviewer):** "enter its terms by hand" sends a specialist, who holds no `phi.read` (ADR alternatives table), to read a patient's EOB line by line. The words below send them to the practice instead.
- **Best fix** (`notices.ts:26`, `path.test.ts:31`, the ADR's quoted text at `:688-689`; no migration):
  - New text: "This document holds an identifier from the practice's patient records, so it was not sent to the model. If it is a contract or an exhibit, enter its terms by hand below. If it is a payer letter or an explanation of benefits (EOB), it has no terms to enter: ask the practice for the contract below."
  - It names no patient, identifier, kind or count (m14 uses the same words: "holds an identifier of the practice").
  - It promises no re-filing (F4).
  - Both "below" targets exist on a draft version, the only state that offers "Propose the terms" (`page.tsx:107`, `:173`, `:449`).

### UX-3 (minor). The screen_unavailable notice says "patient details", and gives no retry for a check that failed

- **Where:** shots `p.abstraction-version.model-screen-unavailable.1280`, `.390`. The `screen_failed` state shares this notice by code (`apps/web/src/lib/models/path.ts:179`, `:195-196`); it was not shot.
- **Evidence:**
  - `notices.ts:27`: "could not be checked for patient details". The check reads three identifier kinds, not names, dates of birth or addresses. The sibling notice uses another name for the same records (one name per thing).
  - `screen_failed` is a read failure that a second click may clear (ADR `:692`: "a second click runs the whole check again"). The notice offers only hand entry, so a specialist may abstract a whole contract by hand after a passing database fault.
  - The bound (50,000 identifiers) refuses every time. A single text must therefore be true for both cases.
- **Rule:** `PRD.md:256` (a true next step); checklist "Words" (exact; one name per thing).
- **Best fix** (`notices.ts:27`, `path.test.ts:33`, ADR `:690-691`):
  - New text: "This document could not be checked against the practice's patient records, so it was not sent to the model. Try again later; if it is refused again, enter its terms by hand below."
  - This keeps one code: no change to `?model=` or the route schema.

### UX-4 (minor). The panel never says the kind is permanent, at the one moment it matters

- **Where:** shots `p.contracts.default.*` and `p.reconciliation.default.*`.
- **Evidence:** A recorded kind never changes (`uploader.tsx:92-97`; F4). On Contracts the kind decides whether a model reads the file. The select (`:378-401`) has no help line, so the person learns of the permanence only after a wrong choice.
- **Rule:** `PRD.md:302` (an action that cannot be undone states its consequence); baseline (a precondition shows before the work).
- **Best fix:**
  - Add `<p id="upload-kind-help" className="max-w-prose text-xs text-muted-foreground">` under the label: "Choose it before adding files: a document's kind cannot be changed once it is uploaded."
  - Tie it with `aria-describedby` (see UX-1).
  - Use the same line on both panels. The Uploads page shows no placeholder, so it can keep its current markup or take the same line.

### UX-5 (minor). The refusal stays on screen after the kind is chosen, contradicting the select

- **Evidence:** The select's `onChange` (`uploader.tsx:385-388`) sets the kind and the format, but not `problems`. After choosing Contract, "Nothing was uploaded / Choose the kind of document first" still sits under a select that reads Contract, until the next batch.
- **Rule:** checklist "Words" (a state's words match the record).
- **Best fix:** UX-1's held files replace the message. If UX-1 is deferred, `onChange` should at least drop `CHOOSE_KIND_FIRST` from `problems`: `setProblems((found) => found.filter((problem) => problem !== CHOOSE_KIND_FIRST))`. The ERA line should be dropped the same way when a system is chosen.

### UX-6 (minor). ADR 0070 Part 3's "What it gives up" is incomplete in what a person meets, and one consequence is untrue

- **Evidence:**
  - `:728-750` lists only detection and audit gaps. Three things a person meets are missing:
    - the no-kind refusal discards the chosen files (UX-1), and `:721` calls it "the ERA format check's pattern" without noting that the baseline found that pattern a defect (UX-049);
    - a `screen_failed` refusal offers no retry (UX-3);
    - the kind's permanence is not told at upload (UX-4).
  - `:849` and `:853` say the specialist "enters the terms by hand" for a misfiled payer letter or EOB, which has no terms (UX-2).
  - The rest of the list matches the code as far as a screen shows it.
- **Best fix:**
  - Add a "**What a person meets:**" bullet to `:728-750` naming the gaps above, or remove it once UX-1, UX-3 and UX-4 are fixed.
  - Reword `:848-849` and `:853`: "... is refused before the model, with no `model_call` row; the specialist asks the practice for the contract, and enters the terms by hand only for a contract or exhibit that holds an identifier."

## Nits

- `path.ts:198`: `screen_invalid` falls to the generic `refused` text, "The input cannot be sent to a model as it is; enter it by hand." That blames the input for what the ADR calls the code's mistake. Lint keeps the state out of production, so it is left as is; if it ever shows, the words should be "Something went wrong on our side; nothing was sent. Try again, or ask support."
- "Have the model propose the terms" (`page.tsx:111-114`) says "A payer letter is never sent to it". One more clause would prepare the specialist for UX-2's notice: "Each document is first checked against the practice's patient records, and one that holds a patient's identifier is not sent." (recommendation)
- Pre-existing, not caused: the Contracts upload region is named "Upload a contract or exhibit" while its title reads "Upload a contract, exhibit or payer letter" (`contracts/page.tsx:192-194`). The baseline asks for regions named as their titles (UX PR 24).

## What is sound

- **No preselected kind.** Contracts and Reconciliation start with no kind. This fits the baseline's "a choice that records a fact starts unanswered" and stops a letter or EOB being filed as a contract by default.
- **The select.**
  - It keeps its visible label "Kind of document" (a `<label for>`), with `required` exposed as `aria-required`.
  - The disabled placeholder is read with the label. It appears only on a panel that started with no kind (departure 17), so the Uploads page shows no dead option.
  - It fits at 390 px on both panels, and its dark boundary and text are legible (tokens only).
- **The Uploads page** keeps its 835 default and is unchanged (pixel-identical panel).
- **The notice frame.**
  - Both refusals use the same "Nothing was proposed" frame as the other model problems. The kind is told apart by title and words, not by colour alone.
  - Both name no patient, identifier, kind or count (m14). Neither says "AI" (`lint:copy`).
  - They wrap cleanly at 390 px, and the danger title stays legible in dark.
- **The refusal text** names no file. File names stay in the browser.
- **Sizes and units** are unchanged by this PR.

## Open baseline findings on these screens

- **UX-049 (C-037)**, the ERA refusal discards files: still open, and **worse**, now on three panels (UX-1).
- **UX-097 (C-072)**, the hidden file input is a tab stop (`uploader.tsx:440-451`): still open, unchanged.
- **UX-159 (C-148)**, the kind select runs past the drop zone at 390 px on Uploads (`p.uploads.default.390`, select to x 393 against a border at x 373): still open, unchanged. The new placeholder fits on Contracts and Reconciliation.
- **UX-163 (C-178)**, "2 GiB", "2.0 GiB", "KiB" and lower-case kinds ("contract, 1.9 KiB" in Documents to tag): still open, unchanged.
- **UX-197 (C-188)**, "Drop ... here" on a phone: still open. It now also invites the refused drop (UX-1).
- **UX-013 (C-018)**, notices from the URL replay on refresh and Back: still open. The two new codes join `?model=` and do not change the class.
- **UX-082 (C-021)**, every notice is `role="alert"`: still open. The new refusals are errors, so their role is right.
- **UX PR 3 and 34**, tables overflow at 390 px (Contracts 664 px, Uploads 534 px, Reconciliation 405 px): still open, unchanged.

## Not seen and not checked

- **Not seen, judged from code:**
  - the Reconciliation panel's no-kind refusal (the same component and words as Contracts);
  - `screen_failed` (it shows screen_unavailable's notice, `path.ts:179`);
  - `screen_invalid` (it shows the generic refused text, `notices.ts:25`);
  - the notices on a draft version, the only state where they occur after a real click (the tour opened them by URL on a signed-off version).
- **Not checked:** a live screen reader's announcement order; Windows High Contrast; reduced motion (no motion is added).

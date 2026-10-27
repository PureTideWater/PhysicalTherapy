# Build 2b (wf_7d776c57-f07) results

## Builder A2

Slice A's last part is done. `pnpm typecheck` passes on all 22 projects, which also clears split-form's errors. The unit tests are green. The browser tests pass on a dev signal only, not of record: the pinned Chromium isn't installed, so CI is still the record for them. Nothing was committed.

**Files changed** (all under `/home/user/ux-forms`):
- `apps/web/src/components/action-form.tsx`
  - **Now uses:** `useGuardedSubmit`, `FormIssues`, and `RefusalSummary` first in the form, keyed by seq.
  - **Button:** `PendingStatus` sits inside the button's `flex flex-wrap items-center gap-2` wrapper. The button is `aria-disabled` while pending, never `disabled`, and its words don't change.
  - **Props:** new `beforeSubmit`; `labels` and `problems` removed. `wrapSubmit` is kept.
  - **Header comment:** states 2.2's two conditions.
  - **Kept:** every #50 export (`summaryLead` is now re-exported from form-issues).
  - **`RefreshAfterRefusal`:** also renders for a `stale` state, and then notes no takeover. It refreshes once per state, so React's strict mode can't refresh twice.
  - **Noted refusal lines:** without `labels`, the lines `RefusalFallback` shows are read lazily from the summary's items, so they keep the names the page gives them and never show a key.
- `apps/web/src/lib/http/next.ts`
  - `stale` added, `problems` dropped, `invalid` kept.
  - The invalid lead is now "Fix the fields listed here, then try again."
  - `csrf_refused`, and an invalid outcome whose only issue is `requestKey`, both return the stale state ("This page was out of date, so nothing was saved.").
  - Both runners share one helper, `refusedInput`. `guardMessage` now only words the rate limit.
- `apps/web/src/components/form-issues.tsx` — **outside my listed files, needed so #50's behaviour isn't lost.**
  - **Why:** #50's run forms named issues on hidden fields through `labels` ("This run: …", "This re-run: …"); the route words those messages to read after that name (ADR 0037), and `e2e/pricing.spec.ts:318` asserts it. Without `labels`, the item would lose its subject.
  - **Change:** new `hiddenName()`. A hidden input's own `data-error-name` now names its item. The item is never a link, never focused, and doesn't count toward the lead, as #50 did.
- **The `labels=` callers:** in `pricing-runs/[runId]/page.tsx`, `pricing-runs/compare/page.tsx` and `releases/page.tsx` (under `apps/web/src/app/p/[practiceId]/`), the labels moved to `data-error-name` on the hidden inputs. No other caller of `labels` or `problems` was left.
- `apps/web/e2e/pricing.spec.ts:321-322` — its "no generic lead" check looked for the old "Check the fields marked below." text, which would have made it pass vacuously; it now looks for "listed here, then try again."
- `apps/web/src/components/action-form.test.tsx` — the `summaryLead` calls are now `(state, 1)` / `(state, 0)`. Added cases for the plural lead, for the count before the page is read (`input` and `requestKey` left out), and for a stale error. Added a static-markup test: no summary before a press, no `disabled`, status inside the wrapper.
- `apps/web/src/components/settings/defaults.test.tsx` — it expected "{label}: {message}" in server-rendered markup, which can't happen now: the browser names the items. It now checks each field's label with its "Error:" line, and that no key ever shows.
- `apps/web/src/components/test-support/forms-harness.tsx` — the harness form is now the real ActionForm. I added three forms (the real `ScreeningSplitForm`, a refreshOnError form with named hidden fields, and two forms on one page), exposed #50's hand-off on `window.takeover`, and count responses on `body[data-shown]` instead of the old `data-seq`.
- `apps/web/src/components/test-support/browser.ts` — added an optional `FORMS_HARNESS_CHROMIUM` variable to point the harness at another Chromium on a developer's machine. It's unset by default, no path is committed, and the pinned version is unchanged.
- `apps/web/src/components/action-form.browser.test.tsx` — the six `it.todo`s are filled: five new tests plus the stale test, now on the real ActionForm. They cover:
  - a hidden-field issue named "This run: …";
  - refreshOnError noting its takeover with the named lines, and a stale page noting none;
  - one refresh per stale state;
  - a wrapping long label that is never disabled;
  - two forms on one page not marking each other;
  - the real split form refusing to send while it has problems.

**Checks run** (heavy commands under the lock):

| Check | Result |
|---|---|
| `pnpm typecheck` | 22/22 pass, run twice |
| eslint on every changed file | clean |
| Unit tests, `apps/web/src/components` + `lib/http` | 310 passed, 21 skipped (the browser tests, no pinned Chromium) |
| Same plus the browser tests and `packages/ui`, with `FORMS_HARNESS_CHROMIUM=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome` (dev signal) | 348 passed |
| Browser tests alone (dev signal) | 21 passed, no todos left |
| `packages/synth` unit | 185 passed; the registry test that waited for `action-form.test.tsx` is now green |
| `pnpm lint:copy`, `pnpm lint:logs` | clean |

**Left undone:** e2e not run (needs the browser of record and the app stack); `forms-keep-input.spec.ts` and the pricing, packets, sign-in, onboarding and contracts specs remain for the pipeline step.

Progress log: `/tmp/claude-0/-home-user-PhysicalTherapy/d75bf211-7cd4-58d6-b13d-568cbdc1db2a/scratchpad/progress/build-A2.md`

**Proposals (outside my files):**
1. ADR 0077 and design 3.4 should record the hidden-field naming: a hidden input's `data-error-name` names its item without a link, focus or a place in the lead count. The design currently says a hidden input is never a target.
2. `guardMessage` in `next.ts` is now used only inside that file; it could stop being exported.
3. Document `FORMS_HARNESS_CHROMIUM` in the runbook for machines where storage.googleapis.com is refused.

## Builder C3

Slice C is done on all eight waiting pages, and the refused "Partially accepted" step is in `packets.spec.ts`. That step has not been run, and no browser test was run at all.

**Files changed** (all edited in the worktree; nothing committed):
- `/home/user/ux-forms/apps/web/src/app/p/[practiceId]/abstraction/ledger/page.tsx`
  - The amount input is now a `Field` with the hint `form-hints.test.ts` asserts. Its label is now "Change in dollars"; the old "(a minus sign lowers it)" is covered by the hint.
  - The reason is a `TextAreaField`, and the confirm box is a `CheckboxField` named "Confirmation".
- `/home/user/ux-forms/apps/web/src/app/p/[practiceId]/cases/[caseId]/page.tsx`
  - The Owner select and the write-off Reason select are `SelectField`s.
  - "Why (for “Other” only)" and the reopen Reason are `Field`s. I kept the Why label because `triage.spec.ts` asserts "Why: …".
  - The confirm box is a `CheckboxField` named "Confirmation", and the note is a `TextAreaField`.
- `/home/user/ux-forms/apps/web/src/app/p/[practiceId]/cases/[caseId]/submissions/page.tsx`
  - All 4 selects are `SelectField`s and all 5 inputs are `Field`s. The amount's hint moved to `hint` and keeps the id `amount-hint`.
  - The two checkboxes are `CheckboxField`s: "sent without sign-off" is named "Confirmation", and the reopen box is named "Reopen the case".
  - The notes field is a `TextAreaField`.
  - I dropped the `data-confirm` attribute; no test or tool reads it.
- `/home/user/ux-forms/apps/web/src/app/p/[practiceId]/reconciliation/page.tsx`: the reverse-reason box is a `TextAreaField` and the confirm box is a `CheckboxField` named "Confirmation".
- `/home/user/ux-forms/apps/web/src/app/p/[practiceId]/cases/[caseId]/packet/page.tsx`: the request-message box is a `TextAreaField`.
- `/home/user/ux-forms/apps/web/src/app/p/[practiceId]/cases/[caseId]/packet/[versionId]/review/page.tsx`: the `confirm_<id>` list is a `CheckboxGroup` with the legend "Confirm each item before you attest" and `issueKey="confirm"`, as on the report review page.
- `/home/user/ux-forms/apps/web/src/app/p/[practiceId]/lines/[lineId]/page.tsx`: the note is a `TextAreaField`.
- `/home/user/ux-forms/apps/web/src/app/p/[practiceId]/coverage/page.tsx`
  - At the merged head the review form still had no `<FormKeys />`, so every review was refused. I added it.
  - `keep:<n>` is a `CheckboxGroup` with `issueKey="kept"`, and `dismiss` is a `CheckboxField` named "Dismiss the checklist".
  - The GET letter form is unchanged, as the earlier slices left GET forms.
- `/home/user/ux-forms/apps/web/e2e/packets.spec.ts`
  - The J10 step now starts with a refused partial response that has no amount. It checks that:
    - the summary reads "Not done" and "Additional amount the payer will pay: what the payer accepted, in dollars and cents";
    - Response still reads `partial`;
    - the amount field is marked invalid and has the focus;
    - no "recorded" notice appears.
  - Then the amount is filled and the step goes on as before. The header comment names FRM-01.
- `/home/user/ux-forms/packages/synth/src/cases/registry.ts`: `packets.spec.ts` is added to FRM-01's `assertedBy`. This file is on #42's list, but it is one of the shared documents LANES.md rule 6 allows.
- `/home/user/ux-forms/fixtures/synthetic/FRM-01/expected.json`: regenerated by `pnpm synth --all` for that registry change.

Every page keeps the ids, labels and data attributes the e2e specs use, and what #49, #51 and #52 added.

**Issue keys checked:** every key a field uses matches the key its route's schema refuses, so each refusal lands on its field.
- Ledger adjust: `amount`, `reason`, `confirm` (`lib/routes/specialist.ts:146-150`).
- Case page:
  - write-off: `reason`, `text`, `confirm`
  - reopen: `reason`
  - assign: `ownerUserId`
  - note: `text`
- Submissions:
  - log: `submittedOn`, `channel`, `reference`, `followUpOn`, `sentWithoutSignOff`
  - response: `kind`, `amount`, `documentId`, `receivedOn`, `denialCategory`, `reopensCase`, `notes`
- Reverse match: `reason`, `confirm`.
- Packet request: `message`.
- Attest: one `confirm_<id>` per box.
- Line note: `note`.
- Coverage review: `kept`, or `kept.<i>`, which resolves to the group, and `dismiss`.

A refusal on a hidden key (`entryId`, `matchId`, `proposalId`) or on `refused` shows as a message alone, as designed.

**Tests and checks run** (each under the lock):
- eslint on the 9 page and spec files and on `registry.ts`: clean.
- `tsc --noEmit` on apps/web: clean. That includes the other builder's in-progress files at the time.
- vitest unit on `form-hints.test.ts` plus all of `packages/synth`: 14 files, 188 passed. The ledger hint failure and the registry failure that were waiting are both gone.
- `pnpm lint:copy`: clean (517 files).
- `pnpm synth --all`: 1 file written (FRM-01), 635 unchanged.

**Left undone:**
- The new `packets.spec.ts` step has not been run. It needs the full e2e stack and the worker, which is "What remains" item 3.
- No db tests were run: I changed no route, schema or markup that a db test asserts. `models-routes.db.test.ts` calls the coverage route directly.
- No browser run, so there is no dev signal to report.

My running notes are in `/tmp/claude-0/-home-user-PhysicalTherapy/d75bf211-7cd4-58d6-b13d-568cbdc1db2a/scratchpad/progress/build-C3.md`.

**Proposals (outside my files):**
1. **`CheckboxGroup` and long labels** (`components/field.tsx`). It lays its options out in a wrapping row with each box centred against its text. That suits short choices, but the attestation lists and the coverage checklist have sentence-long labels. A column layout with the box at the top of its label would read better. This is the same component as the existing proposal for a per-box message.
2. **`CheckboxGroup` ids.** Its ids come from `issueKey` alone (`group-<issueKey>-<n>`), so two groups with the same key on one page would share ids. An optional `id` prop would prevent that.
3. **A test for the coverage review form.** Nothing renders it or submits it, which is how the missing `FormKeys` went unseen. An e2e step that keeps one checklist item through the page would catch a recurrence.
4. **A shared check for forms without `FormKeys`.** A static test, like `form-hints.test.ts`, could fail any `<ActionForm>` posting to a practice-mutation action that renders no `<FormKeys />`.

## Check

Build 2b integration check on `co-001/ux-forms` (worktree /home/user/ux-forms, HEAD 2982890e): every check I ran passes, and nothing failed that needed fixing or proving against e908c21. The browser tests passed only as a dev signal, not of record (they ran on Chromium 1243; the pinned build isn't installed). The e2e specs have not been run. Nothing was committed.

**Change summary**
- **Files:** 24 changed files are uncommitted: A2's and C3's 23, plus one line I changed (below).
- **#42 overlap:** the only changed file on #42's list is `packages/synth/src/cases/registry.ts` (C3's one-line FRM-01 `assertedBy` entry). It is the synth registry, which LANES.md rule 6 allows. The committed branch since e908c21 touches four list files, all shared documents (test-matrix.md, matrix.ts, registry.ts, watched-paths.txt).
- **My two edits:**
  - `/home/user/ux-forms/apps/web/src/lib/http/next.ts`: `guardMessage` is no longer exported. Only next.ts uses it; this was A2's proposal 2.
  - `/home/user/ux-forms/apps/web/src/lib/routes/workbench-routes.db.test.ts:236`: the test input still had the old lead, "Check the fields marked below." It now has the new lead with `invalid: true`. The expected result is unchanged.

**Checks**
| # | Check | Result |
|---|---|---|
| 1 | git status, diff, #42 list | Every changed file is A2's, C3's or mine; the #42 overlap is above. |
| 2 | API as used vs as built | `action-form.tsx`, `next.ts` and `form-issues.tsx` match `slice-a-api.md`. The C pages use the field components as built (typecheck confirms the signatures). In the `packets.spec.ts` FRM-01 step, the label, the route's message (`submissions.ts:237`) and the `amount-hint` id all agree. No mismatch needed fixing. |
| 3 | `pnpm typecheck` | 22/22 pass, run before and after my edits |
| 3 | `pnpm lint` (full) | 1622 files, 0 errors, 0 warnings |
| 3 | `lint:copy` / `lint:logs` / `verify-content` | Clean (517 files) / clean (1059 files) / pass |
| 3 | Unit tests: `apps/web`, `packages/ui`, `packages/synth`, browser tests on Chromium 1243 (dev signal, not of record) | 85 of 85 files, 1032 passed, 0 skipped |
| 3 | DB tests of the changed routes: sign-in, onboarding, billing, console, workbench, models | 6 files, 81 passed |
| 3 | DB tests: the generated route-tests (13 files) | 6870 passed |
| 4 | Leftovers | Nothing found (details below). |

**Leftovers (check 4)**
- No `labels=` or `FORM_LABELS` anywhere.
- No `ActionState.problems`. The `problems` that remain belong to unrelated code (split-form, template-mapper, content-due, models).
- A raw control inside an `ActionForm` appears only in two places:
  - the users page's confirm box, which is a #42 file and is planned for the after-#42 follow-up;
  - a unit-test fixture.
- The raw selects on the cases, pricing-runs and coverage pages are all in GET forms.
- The e2e `refusal()` helper (`e2e/helpers.ts:64`) matches both `data-slot="alert"` and `refusal-summary`, so it doesn't assume the old alert.

**Left, and why**
- The e2e specs have not run: `forms-keep-input.spec.ts`, C3's new refused "Partially accepted" step in `packets.spec.ts`, and the pricing, sign-in, onboarding, contracts and triage specs. They need the browser of record and the full app stack with the worker. This is item 3 of "What remains", with the draft PR, the two reviews, the fix round and CI.
- The attest page (and the report review page already committed) use `CheckboxGroup issueKey="confirm"`, but the route refuses `confirm_<id>` box by box. Each refusal does land on its own box and in the summary, but the group itself never shows a message. This is the existing "per-box message in `CheckboxGroup`" proposal, not a regression.

**Proposals (outside my files)**
1. Record in ADR 0077 and design 3.4 that a hidden input's `data-error-name` names its summary item (A2's proposal 1; the design currently says a hidden input is never a target).
2. Document `FORMS_HARNESS_CHROMIUM` in the runbook.
3. Add a static test that fails any `ActionForm` posting to a practice mutation without `<FormKeys />`, plus an e2e step that submits the coverage review form. That missing `FormKeys` went unseen because nothing submits the form.
4. Give `CheckboxGroup` an optional `id` prop, so two groups with the same `issueKey` on one page don't share ids.
5. Lay `CheckboxGroup` out as a column for sentence-long labels.

Progress log: /tmp/claude-0/-home-user-PhysicalTherapy/d75bf211-7cd4-58d6-b13d-568cbdc1db2a/scratchpad/progress/build-2b-check.md

## Critic

I compared the branch with the design at 2982890e plus the uncommitted tree: the diff from e908c21 (minus test-matrix.md) against sections 2 to 10, the section 12 dispositions and "What remains" items 1 and 2. I edited nothing. I ran no tests and relied on the checker's results.

The core matches the design: two hooks with the inFlight guard, emptying secrets by data-secret, the summary keyed by seq and first in the form, the lead chosen from what was placed, the focus rule, the stale state with router.refresh in ActionForm, aria-disabled with the status line, and the four unlayered CSS rules. Every file in the slice tables (7.1 to 7.6) is changed, and the matrix rows match 8.1 word for word. The registry entries and test files exist. Slice B's 10.2 strings, 5.4's hints, 10.3's messages, ADR 0077, ADR 0056, BRAND.md, the personas, the coverage form's FormKeys and the triage and packets steps all match.

Two correctness bugs:
1. **Version form, out-of-date page.** It shows the stale summary, "It is up to date now: press X again", but it never reads the page again. A second press sends the same old token and is refused the same way, every time.
2. **Export form and #42's upload form.** They show the bare "This page was out of date, so nothing was saved." with no next step and no refresh. Before this branch they said "Reload the page and try again", so this is a step back.

Departures from the design:
- **Attestation lists.** On the packet and report review pages, the route refuses `confirm_<id>` box by box, but the group listens for `confirm`. The group never shows its message or its mark, and each summary item is named by the box's whole sentence, not "Confirmation" or the legend.
- **FRM-02 is only partly tested.** Its row claims three kinds of redirect. Only the redirect to the same page with `?sent=` is tested.
- **Smaller ones** are listed below as nits.

The e2e specs have not been run. CI is the record.

- [should-fix] /home/user/ux-forms/apps/web/src/components/packets/version-form.tsx:117-160 (RefusalSummary with fromBrowser, no RefreshAfterRefusal): Correctness bug. Suppose the version form's CSRF token or request key is out of date (for example, the person signed in again in another tab). next.ts returns STALE, and RefusalSummary's Lead (fromBrowser=true) says "This page was out of date, so nothing was saved. It is up to date now: press “Save” again." But VersionForm never renders RefreshAfterRefusal, which is not exported from action-form.tsx, so router.refresh() never runs. The page is not up to date, and its FormKeys token and key are the old ones. Each further press sends them again and gets the same refusal, forever, while the summary keeps saying the page is up to date. Fix: export RefreshAfterRefusal, or a small hook, and render it when shown.state.stale is true.
- [should-fix] /home/user/ux-forms/apps/web/src/components/packets/export-status.tsx:68-125 (ExportRequestForm); also #42's components/screening/upload-form.tsx (outside this PR's files): Correctness regression. next.ts now maps csrf_refused and a requestKey-only refusal to { error: 'This page was out of date, so nothing was saved.', stale: true }, with no next step: the design leaves the next step to ActionForm. ExportRequestForm uses its own useActionState, prints state.error, and ignores `stale`. The person reads a sentence with no instruction and nothing refreshes, so pressing Export again is refused again. Before this branch the message said "Reload the page and try again." #42's upload form also uses runAction through its own useActionState and is hit the same way. It cannot be edited until #42 merges, so this needs either a stale handler in the export form plus a note for the after-#42 follow-up, or a STALE message that carries its own next step for forms that are not ActionForm.
- [should-fix] /home/user/ux-forms/apps/web/src/app/p/[practiceId]/cases/[caseId]/packet/[versionId]/review/page.tsx:349 and /home/user/ux-forms/apps/web/src/app/p/[practiceId]/reports/[reportId]/review/page.tsx:109 (CheckboxGroup issueKey="confirm"); components/form-issues.tsx:64-79 keyMatches: The routes refuse each box under its own key, `confirm_<id>` (lib/routes/reports.ts:217-222 and the packet route). useFieldIssue('confirm') only matches 'confirm' or 'confirm.<n>', so the group never shows its "Error:" line, never gets data-invalid or the left rule, and the fieldset's aria-describedby never names a message. In the summary, resolveKey('confirm_coverage') finds one box with no group, so nameOf reads labels[0], the box's whole checklist sentence. The item reads "<sentence>: <message>", where the design calls for "Confirmation" or the legend (CheckboxField requires errorName for exactly this reason: a sentence is no name). The checker saw this but filed it only as a proposal. Fixes inside this PR's files: list each option's name in the fieldset's data-issue-for and match `confirm_` keys, or give each group option an errorName.
- [should-fix] /home/user/ux-forms/apps/web/e2e/forms-keep-input.spec.ts:445-456 (the only FRM-02 assertion); packages/synth/src/cases/registry.ts FRM-02: The matrix row asserts three kinds of redirect. The one test the registry names for FRM-02 covers only the support form's redirect to the same path with `?sent=`. Nothing asserts a redirect to the identical address or to another page and back. The design's evidence for those, scout A's drive runs, is outside the repository. Either add the two cases, for example a harness form whose in-memory action throws a redirect, or narrow the row's wording.
- [nit] /home/user/ux-forms/apps/web/src/components/action-form.test.tsx (no 'FRM' anywhere); /home/user/ux-forms/apps/web/src/lib/routes/sign-in-routes.db.test.ts:152-191 (FRM-07 only in comments): The registry lists action-form.test.tsx under FRM-04, but none of its describe or it titles names FRM-04. sign-in-routes.db.test.ts is listed under FRM-07, but cites FRM-07 only in code comments, not in a test title. fixtures.test.ts only checks that the files exist, so nothing catches it.
- [nit] /home/user/ux-forms/apps/web/src/components/form-issues.tsx:310-328 (hiddenName) and the hidden inputs' data-error-name on pricing-runs/[runId], compare and releases pages: A hidden input's data-error-name now names its summary item ("This re-run: …"). That carries over #50's labels behaviour, and pricing.spec.ts relies on it. The design and ADR 0077 still say such an issue shows its message alone. The behaviour is reasonable, but neither document records it (the checker's proposal 1).
- [nit] /home/user/ux-forms/apps/web/src/components/settings/defaults.tsx:18,27,30: The `labels=` props are gone, but MATERIALITY_LABELS and PURSUIT_LABELS remain as exported per-form label tables. Only a test reads MATERIALITY_LABELS. The header comment now says "Each field takes its label from MATERIALITY_LABELS or PURSUIT_LABELS", which is false for the MoneyFields (label="Per line", "Per case" and others are written inline). Either drop the tables, or have the fields read them and fix the comment.
- [nit] /home/user/ux-forms/apps/web/e2e/helpers.ts:62-65: refusal() now also matches [data-slot="refusal-summary"]. That is necessary, because Alert spreads its props after data-slot="alert", so the summary loses the alert slot. But helpers.ts is not in any slice table, and 8.5 says it is unchanged. Record the change in the design and ADR so later locators know the summary has no [data-slot="alert"].
- [nit] /home/user/ux-forms/apps/web/src/components/action-form.browser.test.tsx:100-152 (FRM-01 test 1/2): The harness actions return states the test scripts itself, so asserting that the summary text holds no typed value proves the rendering, not the server. No test runs a real runAction or runSignInStep refusal and checks that the returned ActionState holds none of the submitted values. The clause is asserted only trivially.
- [nit] /home/user/ux-forms/apps/web/src/components/packets/version-form.tsx:102: This bug existed before this branch. Without JavaScript, or for a press React replays before the page hydrates, the model-draft button posts through draft.formAction, but `clicked` stays null, so `shown` is the write hook and the draft's refusal never appears. Fix: pick the hook whose state holds an error when `clicked` is null.
- [nit] /home/user/ux-forms/packages/ui/src/states/loading-announcement.tsx:6-24: Adds a 100 ms SETTLE_MS delay before the label appears, which 4.3 does not describe. It may be an improvement, but the design and ADR do not record it.

## Fix

All 11 gaps were real, and I fixed all of them; none needed a "not real" answer. Typecheck, eslint, both copy lints, the touched unit tests, the browser tests (dev signal) and the sign-in db test pass. I wrote the four new FRM-02 e2e steps but could not run them here. Nothing is committed.

**Gaps**

1. **Version form never reloads a stale page — fixed.** `RefreshAfterRefusal` is now exported from `action-form.tsx`, and `version-form.tsx` renders it when the shown state is stale. A new browser test shows one refresh, the "press “Save as a new version” again" wording, and the select keeping its value.
2. **Export form's stale refusal has no next step — fixed.**
   - In `next.ts`, the `STALE` words now end "… Reload the page and try again.", so #42's upload form, which only prints `state.error`, keeps a next step.
   - The summary's lead now writes the stale wording from the `stale` flag and never prints the server's words. It is exported from `form-issues.tsx` as `RefusalLead` (renamed from `Lead`).
   - `ExportRequestForm` uses `RefusalLead`, renders `RefreshAfterRefusal` when stale, and only invites another press when its own `onSubmit` saw the press. A new browser test covers it, and the `fields.test` stale case now uses the server's real words.
3. **Attestation lists never match `confirm_<id>` — fixed.** `CheckboxGroup` now also matches its boxes' own keys, both for its message and in the fieldset's `data-issue-for`. A new `itemized` prop names each box by the legend instead of its sentence. Both attestation pages pass `itemized`; the versions page's separate Medicare boxes still use their own labels. Covered by a new `fields.test` case and a browser test (summary item, `data-invalid`, `aria-describedby`, focus on the refused box).
4. **FRM-02 covered one redirect of three — fixed, not run.** Added to `forms-keep-input.spec.ts`:
   - The ROI test now saves the suggested period, lands on the statement page, and follows its "ROI statements" link back. It checks the suggested dates, no refusal and a new request key.
   - The console incident test now ticks a box and saves back to the identical `/console/status` address. It checks empty fields, no refusal and a new key, then resolves the incident so the public status page reads as before for the other specs.
   - The registry's FRM-02 reason is reworded to match.
5. **FRM ids missing from test titles — fixed.** FRM-04 is in `action-form.test.tsx`'s summary-lead describe title, and FRM-07 is in both titles in `sign-in-routes.db.test.ts`.
6. **Hidden inputs' `data-error-name` behaviour unrecorded — fixed.** The behaviour stays and is now written into ADR 0077 (D3) and a new design section, 12.1.
7. **Leftover label tables in `defaults.tsx` — fixed.** `MATERIALITY_LABELS` and `PURSUIT_LABELS` are gone, the labels are written on the fields, the header comment is corrected, and `defaults.test.tsx` checks the control names directly.
8. **`helpers.ts` `refusal()` change unrecorded — fixed.** Recorded in ADR 0077's Consequences and design 12.1, which also notes that the summary carries no `[data-slot="alert"]`.
9. **FRM-01 "state carries no typed value" only asserted trivially — fixed.** New `apps/web/src/lib/http/next.test.ts` runs the real `runAction` and `runSignInStep` over real routes (audit request, support ticket, sign-in password). Each is refused before any database call (bad input, missing request key, wrong origin), and none of the returned states holds a submitted value. Added to the registry under FRM-01 and FRM-07.
10. **Model-draft refusal hidden before a click is seen — fixed, no test.** With no click seen, `version-form.tsx` now shows the draft action's state when only that one holds an error. The harness can't simulate a post without JavaScript, so there is no test for this.
11. **Unrecorded 100 ms loading delay — fixed.** Recorded in design 12.1 against section 4.3.

**Checks**
- `pnpm typecheck`: 22 of 22 projects pass.
- eslint on every changed file: no errors.
- `pnpm lint:copy`: 517 files clean. `pnpm lint:logs`: 1059 files clean.
- Unit tests for apps/web, packages/ui and packages/synth: 1039 of 1040 passed. The one failure was fixture drift from the registry changes. `pnpm synth --all` rewrote the FRM-01, FRM-02 and FRM-07 `expected.json` files, and packages/synth then passed 185 of 185.
- Browser tests (`action-form.browser.test.tsx`, 24 of 24, three new) on the newer Chromium via `FORMS_HARNESS_CHROMIUM`: dev signal, not of record.
- db test `sign-in-routes.db.test.ts`: 7 of 7. I touched no route.
- e2e: not run, because it needs the full stack.

**Proposals outside this fix**
- The console practices page (`app/console/practices/[practiceId]/page.tsx`) still keeps a per-form `SETTINGS_LABELS` table, which also catches a missing label at compile time. Either drop it like `defaults.tsx`, or accept it in the design.
- In the after-#42 follow-up, `upload-form.tsx` should handle `stale` and use `RefusalLead`, so it reloads the page in place instead of asking for a reload.

Files I changed (another builder's uncommitted changes in the same files are kept):
- /home/user/ux-forms/apps/web/src/components/action-form.tsx
- /home/user/ux-forms/apps/web/src/components/packets/version-form.tsx
- /home/user/ux-forms/apps/web/src/components/packets/export-status.tsx
- /home/user/ux-forms/apps/web/src/components/form-issues.tsx
- /home/user/ux-forms/apps/web/src/components/field.tsx
- /home/user/ux-forms/apps/web/src/lib/http/next.ts
- /home/user/ux-forms/apps/web/src/lib/http/next.test.ts (new)
- /home/user/ux-forms/apps/web/src/components/fields.test.tsx
- /home/user/ux-forms/apps/web/src/components/action-form.browser.test.tsx
- /home/user/ux-forms/apps/web/src/components/action-form.test.tsx
- /home/user/ux-forms/apps/web/src/components/test-support/forms-harness.tsx
- /home/user/ux-forms/apps/web/src/components/settings/defaults.tsx
- /home/user/ux-forms/apps/web/src/components/settings/defaults.test.tsx
- /home/user/ux-forms/apps/web/src/lib/routes/sign-in-routes.db.test.ts
- /home/user/ux-forms/apps/web/e2e/forms-keep-input.spec.ts
- /home/user/ux-forms/apps/web/src/app/p/[practiceId]/cases/[caseId]/packet/[versionId]/review/page.tsx
- /home/user/ux-forms/apps/web/src/app/p/[practiceId]/reports/[reportId]/review/page.tsx
- /home/user/ux-forms/packages/synth/src/cases/registry.ts
- /home/user/ux-forms/fixtures/synthetic/FRM-01/expected.json
- /home/user/ux-forms/fixtures/synthetic/FRM-02/expected.json
- /home/user/ux-forms/fixtures/synthetic/FRM-07/expected.json
- /home/user/ux-forms/docs/adr/0077-submit-forms-from-the-browser-keep-what-was-typed-name-each-refused-field-by-its-label-and-size-controls-for-phones.md
- /home/user/ops/designs/lane-b-ux-forms.md (new section 12.1)

Progress file: /tmp/claude-0/-home-user-PhysicalTherapy/d75bf211-7cd4-58d6-b13d-568cbdc1db2a/scratchpad/progress/fix-2b.md

# Scout A: the two choices that record a fact (UX-035, C-065)

Read at `/home/user/ux-payer-response` (branch `co-001/ux-payer-response`, `165c5993`, #74 merged; #51 and #52 merged; #42 open).
No product code edited. Requirements: `lane-b-ux-review.md:1629-1646` (UX-035), `:1705-1722` (UX-007, read whole), #74's
U-UX-6 (`approval-summaries/lane-b-ux-forms-reviews.md`).

## 0. Findings and recommendations in brief

1. **No database rule stops a person writing a line off as 'Window passed' while its window is open.**
   `case_line_rules()` checks the window only for the system's own write-off (by NULL). A person's write-off is checked
   only for actor and permission (`packages/db/functions/case_line_rules.sql:31-37`). The handler checks nothing
   (`apps/web/src/lib/routes/triage.ts:471-488`). So the fix is in the handler now. The same rule in Postgres means
   recreating `case_line_rules()`, which is a migration: **for Lane A** (section 1.5).
2. **Of the five reasons, only 'Window passed' can be checked against the line's stored facts.** The other four are
   judgments only the person makes (section 1.3). The page lists 'Window passed' only when `line.windowPassed`, and the
   route refuses it otherwise. That covers both an open window and a line with no window, and it uses the same test as
   the system's write-off and the reopen (`window_ends_on IS NOT NULL AND window_ends_on < today UTC`).
3. **An acceptance is permanent and reaches the ledger.** Recording 'Accepted' or 'Partially accepted' moves no money
   and no line by itself (LED-01). Even so:
   - the case's state changes at once (Resolved or Partially resolved);
   - the next reconcile writes `approved` ledger entries from it and moves the lines the submission asked for to Payer
     approved;
   - the response can never be changed, and a later response does not undo those approvals (section 2.3).

   The hint must say this. Words are in section 5.
4. **Use the empty first option as #74 and the codebase already do: enabled, not disabled.** Example:
   `{ value: '', label: 'Choose the reason' }` with `required`. This follows `components/screening/upload-form.tsx:169`
   and `app/console/prospects/page.tsx:115-121`. A *disabled* placeholder would bring the defect back:
   - the browser's default and reset selection skip disabled options, so a missing `defaultValue` lands on 'Window
     passed' or 'Accepted';
   - `SelectField` cannot render a disabled option anyway (`field.tsx:203-209`).

   Neither page needs a change to `field.tsx` (section 3.2).
5. **Every existing test and tour step already makes these choices explicitly.** None relies on the default, so nothing
   breaks. Two comments go stale (section 4).
6. **Waiting on someone (founder):** whether a line already at Payer approved or Recovered may be written off at all,
   and with which reasons (section 7). It is not decided here and not in this PR.

## 1. The write-off

### 1.1 The form (after #74)
- `apps/web/src/app/p/[practiceId]/cases/[caseId]/page.tsx:215-226`: a `<details>` 'Write this line off' (:217), shown
  to `canWork` for every line not written off, whatever its stage. The form is
  `ActionForm action={writeOffFormAction} variant="destructive"`.
  - Reason `SelectField` (:222): `required`, `options={WRITE_OFF_REASONS.map(...)}`, no empty option, so it opens on
    'Window passed'.
  - Why `Field` (:223): 'Why (for "Other" only)', maxLength 500.
  - Confirmation `CheckboxField` (:224): `errorName="Confirmation"`, label `${WRITE_OFF_CONSEQUENCE} Write it off.`.
- The reopen form shows only when `!line.windowPassed && line.windowEndsOn !== null` (:227). The line shows 'Window ends
  {windowEndsOn ?? '—'}' (:187).
- Per-line facts come from `caseDetail()`: `windowEndsOn` and `windowPassed` (`apps/web/src/lib/triage/queries.ts:592,
  631-632`), so the page can filter per line with no new query.
- `writeOffFormAction` (`cases/[caseId]/actions.ts:9-11`) is a plain `runAction` (no `refusalState`).

### 1.2 The route, `writeOffLineAction` (`apps/web/src/lib/routes/triage.ts:464-495`)
- The route: id `practice.cases.write_off`, `phi: true`, permission `case.work`.
- Its input schema (:471): `caseLineId: opaqueId`, `reason: z.enum(WRITE_OFF_REASONS)` (no message of its own),
  `text: optionalText(z.string().max(500))`, `confirm: z.literal('on', 'confirm what a write-off does')`.
- Its checks:
  - `writeOffSchema` again (:474-477; `packages/triage/src/cases.ts:105-111`): text only for 'other', and required
    there;
  - `caseLineState()` (:478), not found → NotFound. It reads `window_ends_on` and
    `window_passed = (p.window_ends_on IS NOT NULL AND p.window_ends_on < (now() AT TIME ZONE 'UTC')::date)`, with
    `FOR UPDATE OF cl` (`queries.ts:678-690`). The route never reads `windowPassed` for a write-off, so it does no
    window check today.
- What it writes, and only if `line.writtenOffReason === null` (:482-490), so a repeat is a no-op:
  `UPDATE case_line SET written_off_reason, written_off_text (encrypted 'case_line.written_off_text'),
  written_off_by = app_actor_id()`.
- Audit: `{ action: 'case_line_written_off', objectType: 'case_line' }` (:472), written by the wrapper with
  `objectId = line.id` after the handler returns (`lib/http/invoke.ts:254-263`).
- Stage: none. The route inserts no `line_status` row, so the line's stage is unchanged. In the database, the trigger
  `case_line_rules()` sets `actionable = false` and `written_off_at = now()` (`case_line_rules.sql:41-43`). The case is
  then refreshed (`case_line_refresh_cases`, then `case_rules()`): the actionable total and deadline are recomputed, and
  the state becomes `closed_written_off` once every line is written off (`case_rules.sql:53-54`).
- The route's sample uses `not_worth_pursuit` (:494). Its consequence text is `WRITE_OFF_CONSEQUENCE` (:455-456).
- `reopenLineAction` (:503-540) is the pattern for the new refusal. It raises
  `InputError([{ field: 'caseLineId', message: 'a line past its window, or without one, cannot be actionable, so it is
  not reopened' }])` when `line.windowEndsOn === null || line.windowPassed` (:518-519).

### 1.3 The reasons, and which ones the line's stored facts can contradict

The list is `WRITE_OFF_REASONS`, `packages/triage/src/cases.ts:93`. The labels are `WRITE_OFF_TEXT` (:96-102). The
database mirrors both in `packages/db/src/schema/triage.ts:23` and in the CHECK at migration
`20261019160000:194`. The PRD only names the reasons (`docs/product/PRD.md:516`; ADR 0038:58-59).

| Reason (label) | Meaning | Checkable from stored facts? |
| --- | --- | --- |
| `window_passed` ('Window passed') | The line's own first-level dispute window, `priced_line.window_ends_on`, has ended. That date is the engine's: calendar days from the payment date, BPR16 (`packages/triage/src/deadline.ts:13-21`). It does not cover the next level's window: `EXPORT_REFUSAL_TEXT.next_window_passed` says "Do not write the lines off for it: their first-level windows are not this level's deadline" (`apps/web/src/lib/packets/export-attempts.ts:39-40`). Triage writes off with this reason daily for lines past their window in open cases (`apps/worker/src/triage/execute.ts:399-408`). | **Yes.** It is contradicted when `window_ends_on >= today (UTC)`, and unsupported when `window_ends_on IS NULL` ("a window that cannot be shown open is not open", NO_WINDOW, `packages/triage/src/actionable.ts:11-12`). It is true exactly when `caseLineState().windowPassed` is true. For a given case line it can only change from false to true, because `priced_line` is immutable and `case_line.priced_line_id` never changes (`case_line_rules.sql:25-28`). So a page that did not offer it never becomes wrong, and a page that offered it stays right. |
| `payer_correct_on_review` ('Payer correct on review') | On review, the payer's payment was right (the variance was not a real underpayment). | **Judgment.** No stored fact decides it. The only conflict is with a line the payer has since approved (stage Payer approved or Recovered); that is section 7's founder question, not a check. |
| `not_worth_pursuit` ('Not worth pursuit') | The person decides the line is not worth pursuing. | **Judgment.** The case's pursuit-cost estimate (`cases.ts:79-90`) informs it but does not decide it. |
| `duplicate` ('Duplicate') | The line duplicates another. | **Judgment.** Nothing stored marks a line as a duplicate. Loading is idempotent (a resend loads zero rows), and the line's own `case_line_once` (one case per service line, migration `:207`) already holds. A reversed or superseded claim is a separate not-actionable reason, not this one. |
| `other` ('Other') | The person's words, required. | **Judgment**, with text required (`writeOffSchema`, `case_line_other_says_why` CHECK, migration `:212`). |

Edge case, recorded rather than decided: a contract window cited in a rule the engine does not compute
(CONTRACT_WINDOW_RULE_NOT_COMPUTED) has an end "the product cannot judge". The engine's date may be earlier or later than
the contract's (`actionable.ts:12-15`). `caseLineState`, the case page, the reopen and triage's `closeWindows` all ignore
this and use `window_ends_on`. **Recommendation:** use that same test here, the safer option.
- 'Window passed' is then recorded only when the product's own date shows it, so a stored `window_passed` means the same
  thing whoever recorded it, and reports that read `written_off:window_passed` stay true.
- A person who knows the contract's real window ended earlier can still write the line off, with 'Other' and their
  words.
- No money or stage outcome changes, because the write-off still happens. So this is a design choice, not a founder
  ruling.

### 1.4 The database today
- `case_line_rules()` (`packages/db/functions/case_line_rules.sql`, from migration `20261019160000:465-523`; no later
  migration recreates it). It already loads `window_end` from `priced_line` (:29). Then:
  - **System write-off** (`written_off_by IS NULL`, :31-34): refused unless the reason is `window_passed`, the actor is
    not a person, and `window_end IS NOT NULL AND window_end < today UTC`.
  - **Person write-off** (:35-37): refused only if `written_off_by <> app_actor_id()` or the person lacks `case.work`.
    **No check of the reason against the window.**
  - Reopen (:55-57): refused when the window is null or has passed.
  - INSERT (:16-23): a line joins its case actionable or struck with `window_passed`, with no window check, because
    triage computes it (`execute.ts:377-385`).
- CHECK `case_line_system_writes_off_passed_windows` (migration `:213`): a write-off with no person is `window_passed`.
- How a database refusal would surface today: a 23514 becomes `{ field: 'input', message }`
  (`apps/web/src/lib/http/invoke.ts:317-320`), not named on Reason. The handler's own check comes first, so it names
  Reason.

### 1.5 For Lane A (a migration; left out of this PR)
- Recreate `case_line_rules()` in a new migration. In the person branch (after :35-37, `window_end` already loaded at
  :29), add:
  `IF NEW.written_off_reason = 'window_passed' AND (window_end IS NULL OR window_end >= (now() AT TIME ZONE 'UTC')::date)
  THEN RAISE EXCEPTION 'a person writes a line off as window passed only once its window has ended' USING ERRCODE =
  'check_violation'; END IF;`
- Regenerate `packages/db/functions/case_line_rules.sql` and `docs/product/domain-model.md`. The schema gate CO-02
  applies, with the founder's approval of record.
- The trigger fires only on the transition, so rows written before it stay. Lane A can report how many exist:
  `written_off_by IS NOT NULL AND written_off_reason = 'window_passed' AND window_ends_on >= written_off_at::date`.
- Lane A's PR 13 (bulk case work, audit #125; `lane-b-ux-review.md:593`) gets the same empty-first, filtered reason
  select, and this rule covers its route too.

### 1.6 Recommended change in this PR (no migration)
- **Page** (`cases/[caseId]/page.tsx:222`):
  `options={[{ value: '', label: 'Choose the reason' }, ...WRITE_OFF_REASONS.filter((reason) => reason !== 'window_passed' || line.windowPassed).map(...)]}`,
  keeping `required` and adding `defaultValue=""`. On a line whose window has passed but that triage has not struck
  yet, the list holds 'Window passed' and the other four; on any other line, only the four.
- **Route** (`triage.ts:471`): `reason: z.enum(WRITE_OFF_REASONS, 'choose the reason')`. The precedent for an enum with
  its own words is `lib/routes/abstraction.ts:227-228`.
- **Refusal:** inside `if (line.writtenOffReason === null)` at :482, before the UPDATE, so a repeat of an earlier
  write-off stays a no-op: `if (checked.data.reason === 'window_passed' && !line.windowPassed) throw new
  InputError([{ field: 'reason', message: ... }])`. Use two fixed sentences with no date: the window end is derived from
  the payment date, and refusal messages name rules, never values (`lib/cases/refusals.ts:7-10`; CLAUDE.md "never PHI
  in an error message"):
  - window open: 'its dispute window is still open, so “Window passed” is not its reason';
  - no window: 'no dispute window is known for this line, so “Window passed” is not its reason; choose “Other” and say
    why'.
- The field-named refusal (#74) resolves `reason` to the select named 'Reason' (`components/form-issues.tsx:408-433`).
  It reads "Reason: its dispute window is still open, …", focused, `aria-invalid`.

## 2. The payer response

### 2.1 The form ('Log a payer response', `cases/[caseId]/submissions/page.tsx:264-323`)
- The Card (:265, :267). Its CardDescription (:268) says "upload the payer's letter on the Uploads screen first"
  (UX-007's dead end). With no documents, an EmptyState and no form (:271-276).
- `ActionForm action={recordResponseFormAction} submit="Record the response"` (:278).
- The first row is `flex flex-wrap gap-3`:
  - Response `SelectField id="response-kind"` (:283): `required`, `options={PERSON_RESPONSE_KINDS.map(kind => ({ value:
    kind, label: RESPONSE_TEXT[kind] }))}`, no empty option, so it opens on 'Accepted';
  - Received on (:284): `type="date" defaultValue={asOf} min={latest.submittedOn} max={asOf} required`. Keep it, per
    UX-035;
  - Amount (:285-291): label 'Additional amount the payer will pay (accepted or partial only, dollars)', with a hint.
- Document `SelectField` (:292-307): `required`, `showChosen`, and **no empty option, so the first document is
  preselected**. See section 6.
- Denial reason (:309-316): `defaultValue=""`, 'None' first. Reopen checkbox (:317). Notes (:319).
- `PERSON_RESPONSE_KINDS` is `['accepted', 'partial', 'denied', 'info_requested']` (`lib/routes/submissions.ts:195`).
  `RESPONSE_TEXT` (`lib/cases/timeline.ts:13-19`): 'Accepted', 'Partially accepted', 'Denied', 'More information
  requested'.
- The page's doc (:84-100) and its header (:116-119) already say a response moves no money and no stage, and that
  Payer approved and Recovered (posted or deposited) come from the recovery ledger. The log line (:375-380) says
  "$X the payer will pay (Payer approved once the recovery ledger approves it)".

### 2.2 The route, `recordResponseAction` (`lib/routes/submissions.ts:207-286`)
- The route: id `practice.cases.submissions.respond`, permission `submission.log`, audit
  `payer_response_recorded`/`payer_response` (:233).
- Its schema (:222-232): `kind: z.enum(PERSON_RESPONSE_KINDS)` (no message), `amount: optionalDollars` (:198-205),
  `documentId: opaqueId`, `receivedOn: isoDate`, `denialCategory`, `reopensCase`, `notes`.
- The amount rule (:235-238): accepted or partial ⇔ an amount, otherwise refused on `amount`: 'what the payer accepted,
  in dollars and cents' / 'only an accepted or partial response states an amount'. Then:
  - more than zero (:239-241);
  - only a denial has a reason or reopens (:242-244);
  - a reopen needs a reason (:245-247);
  - the submission must belong to the case (:248-251).
- It then calls `recordResponseOnce()` under `underPacketRules` (:252-265). That function lives in
  `lib/packets/submissions.ts:364-376`; the same latest response again is a no-op. It goes on to `recordPayerResponse()`
  (`apps/worker/src/packets/services.ts:756-790`), which inserts one `payer_response` row in the person's name.
- A hazard today: with 'Accepted' preselected, pressing Record on a denial with no amount is refused on **Amount** ("what
  the payer accepted …"). That refusal steers the person to type an amount for a payer who accepted nothing, not to
  change Response. A placeholder stops the press at Response first.

### 2.3 What each kind records (the code, not the comments)
- The `payer_response` row (migration `20261023090000:230-260`) has these rules:
  - an amount if and only if accepted or partial, and more than zero (:253);
  - a document is required (:254);
  - a reopen only for a denial with a reason (:257).
- Triggers on that row:
  - `payer_response_rules()`: **never changes once recorded**, since UPDATE is refused (`payer_response_rules.sql:16-18`);
    it also computes the reopen window;
  - `payer_response_belongs()`: a person with `submission.log`, in their own name; answers the latest submission;
    `received_on` between the submission and today, and on or after the last response; the document belongs to the
    practice;
  - `payer_response_within_asked()`: the amount is at most the lines' variance plus the interest line.
- **The case's state, at once** (trigger `payer_response_refresh_case` → `case_rules()`, `case_rules.sql:48-73`). While
  no line is yet Payer approved or Recovered, the latest response decides it:
  - accepted → **Resolved**;
  - partial → **Partially resolved**;
  - info_requested, or a denial that reopens → Awaiting response, with the deadline set to the next window;
  - a denial that does not reopen → Resolved (the ELSE branch).

  Labels: `CASE_STATE_TEXT`, `components/triage/display.tsx:14-19`.
- **The ledger, at the next reconcile, not when the response is recorded (LED-01).** `reconcilePractice` calls
  `approveFromResponses` (`apps/worker/src/reconcile/pass.ts:40`; `reconcile/responses.ts:46-86`).
  - It reads **every** accepted or partial response, not only the latest (`acceptedPayerResponses`,
    `services.ts:963-990`).
  - It writes an `approved` `ledger_entry` (evidence `payer_response`, `packages/ledger/src/stages.ts:37-40`) for each
    line the submitted version asked for that is not written off. The amount is split by variance
    (`allocateByWeight`, allocated when there are several lines), each line capped at its variance less what is already
    approved.
  - `syncLineStages` (`reconcile/stages.ts:73-104`) then moves those lines to **Payer approved**
    (`ledger_line_stage.sql`: approved > 0 → payer_approved).
  - Recovered (posted or deposited) needs posting or EFT rows that match.
  - The reconcile runs on the daily monitoring schedule (`apps/worker/src/platform/monitoring-schedule.ts:51`), after an
    intake or monitor (`intake/intake.ts:224`, `monitor/job.ts:79`), after triage (`triage/job.ts:35`), and on a
    settings or reconciliation upload (`routes/settings.ts:414`, `routes/reconciliation.ts:334`). Recording a response
    does not trigger it.
- Accepted and partial differ only in the case's state. The ledger treats both the same.
- **No stored fact decides accepted against partial.** A full acceptance's amount can be below the variance, because the
  patient's share is never part of it (the Amount hint at :290; `responses.ts:36-40`). So there is no server check
  beyond the choice. Whether a full acceptance must equal what was asked would be a money question (section 7). It is
  not proposed.
- **A mistaken 'Accepted' is therefore lasting.** The case reads Resolved at once. The next reconcile approves the amount
  and moves the lines to Payer approved. A later response cannot undo that, because every accepted response stays in the
  ledger's input; only a ledger correction (reversed or adjusted) offsets it.

### 2.4 Recommended change (no migration)
- **Page** (:283): `options={[{ value: '', label: 'Choose the payer’s answer' }, ...PERSON_RESPONSE_KINDS.map(...)]}`,
  keeping `required` and adding `defaultValue=""`, plus `hint` with section 5's words.
- **Layout:** the Response sits in the `flex flex-wrap` row with Received on and Amount (:282-292). In a wrapping row a
  long hint makes that item as wide as the row, so move Response to its own row above [Received on, Amount]. The hint
  then reads under it at the form's width (`max-w-xl`). Amount already sits on a row of its own for the same reason.
- **Route** (:225): `kind: z.enum(PERSON_RESPONSE_KINDS, 'choose the payer’s answer')`. It then reads "Response: choose
  the payer’s answer" for a post without JavaScript, or a crafted one. The browser's `required` stops the press first.
- 'Received on' stays prefilled with today (a date the person sees and can change), per UX-035.

## 3. What #74 already gives

### 3.1 The pieces
- `SelectField` (`apps/web/src/components/field.tsx:232-293`) takes `{ value, label }` options and groups, plus
  `hint`, `error`, `errorName`, `issueFor` and `showChosen`, and passes `required`, `defaultValue` and the rest through
  to `<select>`.
  - **No placeholder prop.** `choiceOption` (:203-209) renders `<option value>` only, so a disabled option is not
    possible without changing `field.tsx`, which is not in this PR's files.
  - `hint` renders under the control (`Hint`, :58-64) and is in `aria-describedby` (`controlMarks`, :35-55).
- Values are kept after a refusal: `useGuardedSubmit` (`components/form-issues.tsx:226-293`) sends from `onSubmit` after
  `preventDefault`, so React never resets the form. `e2e/triage.spec.ts:150-155` asserts the kept reason, and
  `packets.spec.ts:485-488` the kept response.
- The field-named refusal: RefusalSummary names each issue by its label and links it, the field shows "Error: …" with
  `aria-invalid`, and the focus goes to the one refused field (`action-form.tsx:22-45`; `form-issues.tsx:408-433`).
- Browser validation stays on: `ActionForm` sets no `noValidate`, and ADR 0077 keeps it ("Turn browser validation off
  (`noValidate`). Kept for later", `docs/adr/0077-…md:201-202`). A required select left on its empty first option
  therefore gets the browser's own message, and nothing is sent.
- `showChosen` is not needed. 'Choose the payer’s answer' and the reasons are short; it matters only for long options
  (the Document select).

### 3.2 Enabled empty first option, not disabled (the recommended option, with reasons)
- **Enabled `<option value="">` first, with `required`.** HTML calls this the select's *placeholder label option*: the
  first option, value empty, a direct child of the select, in a single-choice select of display size 1. While it is
  chosen, the select is `valueMissing`.
  - The browser's default selection and its reset both choose the first **non-disabled** option. With an enabled
    placeholder that is the placeholder itself, with or without `defaultValue`, after the form remounts for another
    person, and without JavaScript.
  - The codebase's convention already does this: 'Choose a state' (`components/screening/upload-form.tsx:169`) and
    'Choose a reason' (`app/console/prospects/page.tsx:115-121`).
- **Disabled placeholder (UX-035's wording "first, empty, disabled option"): rejected.**
  - It shows only while `defaultSelected` is set, which React sets from `defaultValue=""`.
  - Any render without it, or a reset of a form whose markup lacks it, falls to the first enabled option, which is
    exactly 'Window passed' or 'Accepted'. That would bring the defect back silently.
  - It needs a `field.tsx` change.
  - Its only gain, that the person cannot choose "Choose the reason" again, prevents nothing, because `required` refuses
    it anyway.
- Set `defaultValue=""` all the same, so the intent is explicit in the markup.

## 4. Tests that pick these selects today, and tests to add

**Existing.** Every one already chooses explicitly, so none needs a new choice.
- `apps/web/e2e/triage.spec.ts:139-176`: picks 'Other' (:147). The comment at :150-151 ("a reset would put back 'Window
  passed'") goes stale: say 'Choose the reason'.
- `apps/web/e2e/unattested.spec.ts:146-152` and `apps/web/e2e/export-attempts.ts:67-70`: pick 'Not worth pursuit'.
- `apps/web/e2e/packets.spec.ts:477-532`: picks 'partial' (:483). The comment at :485-486 ("a reset would put back the
  first kind") goes stale. Scout B's UX-007 step (the letter uploaded in the form) rewrites :470-476 anyway.
- The screen tour, `/home/user/ops/tools/lane-b-screen-tour/capture/tour.spec.ts`:
  - :2312-2315 'write-off-open' only opens the details; the shot will show 'Choose the reason';
  - :2316-2330 picks 'Other' by label;
  - :2445-2459 picks Partial through `optionIndex`, which is robust to the added option.
  - The `p.case.write-off-open` and `p.submissions.*` shots change as intended.
- Route database tests post explicit reasons, never `window_passed` on an open line: `audit-e2e.db.test.ts:554-566`
  (`not_worth_pursuit`), `export-attempts-routes.db.test.ts:221,260`, `unattested-submission-routes.db.test.ts:362`
  ('other').
- The #74 harness (`components/test-support/forms-harness.tsx:115-118,139`; `action-form.browser.test.tsx:379`) uses
  its own REASONS with `defaultValue="window_passed"`. It is not the page, so it is unaffected; changing it is optional.

**To add.**
- **Route test** (prs.json's "unit" for the write-off is really a `*.db.test.ts`). Copy the setup in
  `apps/web/src/lib/routes/workbench-routes.db.test.ts:313-331`: a contract with a 30-day window, a run, and
  `w.triage(practice, runId, '2026-03-20')`, judged inside the windows, so the lines are actionable but their windows
  have passed today. **Do not triage again**, then:
  - (a) `window_passed` on such a line → ok, `writtenOffReason: 'window_passed'`, `writtenOffBy` the person;
  - (b) on a case whose contract window is long (open today) → `{ status: 'invalid', issues: [{ field: 'reason' }] }`,
    and the line is unchanged and actionable;
  - (c) `reason: ''` → `issues: [{ field: 'reason', message: 'choose the reason' }]`;
  - (d) on the submissions route, `kind: ''` → `issues: [{ field: 'kind' }]`, and nothing recorded.
- **e2e:** in `triage.spec.ts` (not a #42 file), the open line's Reason starts at '' with the text 'Choose the reason',
  and has no 'Window passed' option. In `packets.spec.ts`, the Response starts at '' and the hint is in its
  description.
- **Matrix rows** (reserved CAS-45 to CAS-48; style of `docs/product/test-matrix.md:100-128`). These are proposals for
  the two this scout covers; Scout B's UX-007 rows take the others.
  - `| CAS-45 | A write-off reason the line's own facts contradict | "Window passed" is neither offered nor accepted for a line whose dispute window is open or unknown; offered and recorded once it has ended; no reason is chosen until the person chooses one |`
  - `| CAS-46 | A payer response logged with no answer chosen | Refused, nothing recorded; the form says what an acceptance records |`

  Registry: `none(8, 'A case line and a payer response on synthetic practices the tests create: no file.', [...])`
  (`packages/synth/src/cases/registry.ts:238-251`). `test-matrix.md`, `matrix.ts` and `registry.ts` are in
  `pr42-files.txt` (:86, :136, :137), but they are shared documents under LANES.md rule 6. The precedent is
  `lane-b-ux-forms.md:1143-1148` (the BIL, DBF and FRM rows landed while #42 was open).

## 5. Words (checked against `.claude/rules/brand.md`, CO-11 and #74's style)
- Placeholders: 'Choose the reason'; 'Choose the payer’s answer'. Use the typographic ’, as this page does ('Payer’s
  reference'); U-UX-9 flagged the mixed apostrophes.
- Zod messages, in the lower-case rule style of `schemas.ts:20`: 'choose the reason'; 'choose the payer’s answer'.
- Write-off refusal: as in section 1.6. No date and no value.
- **Response hint (recommended; every clause traced in 2.3):**
  "Accepted and Partially accepted record the amount below as the payer’s answer, for good: the case shows Resolved (or
  Partially resolved) at once, and the recovery ledger’s next reconcile approves that amount across the lines this
  submission asked for (Payer approved). Nothing counts as recovered (posted or deposited) until a remittance pays it."
  - Brand: 'recovered' is labelled posted or deposited. 'Payer approved' is the stage's label (`STAGE_LABELS`). There is
    no 'AI' and no 'owed'.
  - Shorter alternative if the designer wants one line: "An acceptance (full or partial) is recorded for good, and the
    recovery ledger approves its amount for this submission’s lines (Payer approved); nothing is recovered (posted or
    deposited) until it is paid."

## 6. Same class, outside UX-035's two selects (for the orchestrator)
- **Document** on 'Log a payer response' (`submissions/page.tsx:292-307`) is `required` with no empty option, so the
  first clean document is preselected as the evidence of an audited fact. UX-007's in-form upload (Scout B) reworks
  this field. Recommended: the letter uploaded in the form becomes the choice, and a list of existing letters starts on
  an empty 'Choose the payer’s letter'.
- **Channel** on 'Log the submission' (`submissions/page.tsx:75`) opens on the first `SUBMISSION_CHANNELS` value. That is
  the same defect for a recorded fact, and no finding in UX-035 names it. Suggest including it here with
  'Choose the channel' (same file, same pattern), or tracking it separately.

## 7. Waiting on someone (founder; not decided, not in this PR)
- **Writing off a line already at Payer approved or Recovered.** The form is offered for every line not written off,
  whatever its stage (`cases/[caseId]/page.tsx:215`), and neither the route nor `case_line_rules()` checks the stage. A
  write-off then:
  - leaves the line's `approved`, posted or deposited ledger entries standing;
  - excludes it from later approvals (`responses.ts:54`) and from the case's resolved count (`case_rules.sql:35-38`).

  'Payer correct on review' on a line the payer itself approved reads as a contradiction. Whether such a line may be
  written off, and with which reasons, is a money and stage ruling.

## 8. Files (none of #42's; no change to `packages/pricing` or the ledger)
`apps/web/src/app/p/[practiceId]/cases/[caseId]/page.tsx`, `apps/web/src/lib/routes/triage.ts`,
`apps/web/src/app/p/[practiceId]/cases/[caseId]/submissions/page.tsx`, `apps/web/src/lib/routes/submissions.ts` (one
Zod message; not in prs.json's list, add it), tests in `apps/web/src/lib/routes/*.db.test.ts`, `apps/web/e2e/triage.spec.ts`
(not in prs.json's list, add it) and `apps/web/e2e/packets.spec.ts`. No ADR is needed for this part: it follows the
existing empty-first convention and the reopen route's refusal pattern.

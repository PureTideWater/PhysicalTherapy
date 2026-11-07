# co-001/ux-forms-after-42: the screening upload on the shared form core, the #42 pages' fields, and one wording for every refusal

Lane B item `ux-forms-after-42`: the follow-up to #74 (`co-001/ux-forms`, merged 165c599, "forms keep what the person
typed, and name the refused field"), queued in that design's 7.8 until #42 (mail streams) merged. #42 merged on
2026-11-02 as 22789493.

- **Branch:** `co-001/ux-forms-after-42` (local, not pushed), cut at `claude/build-platform` **31a7345f**. Worktree
  `/home/user/ux-forms-after-42`, installed.
- **Inputs:** the original design `designs/lane-b-ux-forms.md` (3.2, 3.4, 3.5, 3.5a, 3.7, 4.1, 5.1, 5.4, 7.8, 10.3, 11, 11.2,
  12); its status `approval-summaries/lane-b-ux-forms-status.md` ("Left for others"); four scout reports in
  `approval-summaries/lane-b-ux-forms-after-42-wip/progress/` (`scout-upload.md`, `scout-console.md`,
  `scout-words.md`, `scout-proposals.md`). The writer checked the points where the scouts disagreed against the tree (noted
  where they arise).
- **Paths** are under `apps/web/src/` unless they start with `apps/`, `packages/`, `docs/`, `tools/` or `e2e/`
  (`e2e/` means `apps/web/e2e/`). Line numbers are at 31a7345f.
- **Bounds:** no migration, no new dependency, no counter except the one the orchestrator allocated in section 5.1 (the
  skip link's row, CI-30), and none of S5's 4b files (section 8). The review of 2026-11-07 and its re-check (K1-K13) are
  applied; their dispositions are in section 10.

## Contents
1. Scope, and what changed since 7.8
2. Per file: now, change, exact words, tests, what a person sees
3. Decisions taken
4. Out of scope, and where each goes
5. Test-matrix rows and docs
6. Build slices and order
7. The screen-tour shot list
8. Risks and conflicts with open PRs, 4b and the queued UX PRs
9. The review plan
10. Review dispositions

---

## 1. Scope, and what changed since 7.8

### 1.1 What 7.8 asked for

| 7.8 row | This PR |
| --- | --- |
| `components/screening/upload-form.tsx`: a11y-other-15's three gaps; retire `FIELD_NAMES`; pending before any `await`; an `aria-disabled` button | All of it, by moving the form onto the shared core (2.1) |
| `app/console/support/page.tsx`: the Ticket hint; remove its `form-hints.test.ts` allowlist entry | Yes, with corrected words (2.2) |
| `app/settings/organizations/[organizationId]/users/page.tsx`: the raw confirm checkbox as a `CheckboxField` | Yes, plus both tables in a `ScrollTable`, closing `app/tables.test.ts`'s exemption (2.3) |
| `lib/routes/console.ts`: words-other-01's email message | Yes, plus the console's other messages that give no next step (2.5) |
| `lib/routes/settings.ts` and `lib/zip.ts`: one ZIP wording across the product | Yes, at every site the grep finds (7.8 listed two; there are nine) (2.4) |
| `lib/screening/routes.ts`: `NO_PATIENT_INFORMATION` and `contactName` | Yes, with one shared constant (2.6) |
| `components/shell.tsx` and each `loading.tsx`: the proposals in section 11 | The skip link (11.2.5) is in. The loading frames (11.2.4) stay out (4) |

The status file's "Left for others" adds: the upload form also handles `stale`, `RefusalLead` and the person mark;
`support-mail.ts`'s "opaque ID"; `console.ts`'s bare punctuation; the separator rule for every message; the
"enter at most {n} characters" pass; and `onboarding.spec.ts`'s random tag. All are in scope (2.4 to 2.8).

### 1.2 What changed since 7.8 was written

- **The shared form core exists now.** At 7.8's writing, `useGuardedSubmit`, `RefusalSummary`, `RefusalLead`, `stale`,
  `RefreshAfterRefusal`, the person mark, `PendingStatus`, `Hint` and name resolution through `data-issue-for` were all
  still being built. They are in `components/form-issues.tsx`, `action-form.tsx` and `field.tsx`. So most of 7.8's
  upload row is done by **adopting the core** rather than by local fixes. That also closes a gap 7.8 never named: today
  a dropped connection while sending a screening throws into `app/error.tsx` and loses every value and the chosen file.
- **#42 grew the files.** Every line 7.8 cites has moved. For example, `FIELD_NAMES` is now at `upload-form.tsx:119-128`
  (not :55-64), the email message is at `console.ts:724` (not :517), `NO_PATIENT_INFORMATION` is at
  `screening/routes.ts:294` (not :280), and `contactName` is at :1272 (not :1181).
- **#42 added a hazard.** The users page renders `ResendForm` twice in its Invitations section, in a hand-written
  `sm:hidden` list (`users/page.tsx:122-130`) and a `sm:table` table (:132-155), each with its own `FormKeys`. This is
  not `StackedRows`, so ADR 0077's "Not covered" (:265-267), which is about a row form in both copies of `StackedRows`,
  stays true as written but misses this page (2.3, 5.2).
- **#79** put four console tables in `ScrollTable` but skipped the users page's two tables (`users/page.tsx:52`, :132);
  `app/tables.test.ts:33` holds the page at exactly 2 bare tables until a PR wraps them.
- **#85** did the write-off default (11.2.6). **#74** itself ruled out `aria-busy` (`packages/ui/src/states/loading-state.tsx:18-19`).
- **The tour** has `support.error-unconfirmed` and `support.error-stale` now (11.2.9, partly done).
- **The server lead** is now plural-aware in the shared core ("Fix the field listed here…" for one field), but the
  upload form prints `state.error` verbatim, so one refused field still reads "Fix the fields listed here, then try
  again." (`lib/http/next.ts:150`).

### 1.3 Scope in one line

The screening upload form moves onto the shared core. The three #42 pages get their field fixes and the shell gets a
skip link. Every field's refusal message across the product moves to one form: one lower-case sentence with no full
stop and no colon of its own, saying what is wrong and then the next step, joined by a semicolon, so the summary's
"{Field}: {message}" never stacks colons. A unit test guards that form.

---

## 2. Per file

Each entry gives: **now** (file:line), **change**, **words** (exact), **tests** (failing first where behaviour
changes), and **sees** (what a person sees).

### 2.1 The screening upload form (slice U)

#### `components/screening/upload-form.tsx`

**Now:**
- **Names its own fields.** `FIELD_NAMES` (:119-128) and `issueField` (:130-132) name fields from the form's own table.
  `UploadRefusal` (:162-191) prints `state.error` (:176), then "{name}: {message}", and sits **after** both cards (:386).
  The original design's 3.5 wants the summary first.
- **The audit link.** The `formOnly` branch (:167, :172-173) links "request an audit" through `refusalSentence` (:138-153).
  This came from the review of 2026-10-27 and must be kept.
- **Focus.** A local `REFUSABLE_FIELDS` table and an effect (:194, :212-218) move focus. An `upload` issue focuses the
  alert, never the file input.
- **Submit (:240-267).** It awaits `read()` (:244) before `startTransition` (:263), so nothing is pending while a chosen
  file is parsed. There is no in-flight guard, and no `useGuardedSubmit`: a fetch `TypeError` reaches `app/error.tsx`.
- **The read race (:220-238).** A press while reading parses the file again. The older read's `finally` clears
  `reading` while the newer read is still running.
- **Button (:388).** It uses `disabled={pending || reading}`, and its words change to "Sending…" (:389).
- **The reading line (:345)** is outside the `role="status"` region (:347-370), so it is never announced.
- **The "Not sent" alert (:371-383)** has no id. The file input (:322-330) has only
  `aria-describedby="screening-file-hint"`, never `aria-invalid`, and never takes focus.
- **"Choose the file to screen."** (`lib/screening/messages.ts:206`) appears under "Nothing was sent. Fix the file and
  choose it again:", which is wrong when no file was chosen.
- **Hints at 12 px:** :331 (file) and :341 (template rules, `text-xs`, id `screening-template-rules`).
- **No method (:282).** `<form onSubmit={submit} …>` has no `method` and no `action`, so a press before hydration or
  without JavaScript sends a GET to `/screening` with `practiceName`, `state`, `zip`, `contactEmail`, `heardFrom` and
  `referringFirm` in the query string: the prospect's email address and practice name reach the URL, access logs and
  referrer. Only the file stays unsent (its input has no `name`). No no-JS e2e covers `/screening`
  (`javaScriptEnabled:false` appears only in `screening-phone.spec.ts:264`, `forms-keep-input` and `sign-in-time`).
- **The stale-result race (:240-267).** A second file chosen while a press is reading the first is not checked: the
  press sends whatever its `read()` returned.
- **Legal surfaces.** The comment at :74 carries counsel's `screening-kept-upload` marker (`docs/product/legal-surfaces.md:21`,
  `tools/test/legal-surfaces.test.ts`); the email field's messages come from `lib/screening/address.ts`, counsel's
  `screening-mail-address` surface (legal-surfaces.md:25; the founder's Q12 wording).

**Change:**
1. **Wrap in the core.** Wrap the form in `<FormIssues state={shown}>`. Make `<RefusalSummary state={shown} fromBrowser
   submit="Screen the file" formRef={formRef} renderMessage={refusalSentence}/>` the form's first child. Delete
   `FIELD_NAMES`, `issueField`, `REFUSABLE_FIELDS`, the focus effect and `UploadRefusal`. Drop each field's
   `error={refused(...)}`: `Field` and `SelectField` read the context, and `ContactEmailField` takes
   `useFieldIssue('contactEmail')`. Names now come from the page's labels (the original design's 3.4), so "ZIP code", "Work email" and so on are
   exactly what the person sees. **Keep the legal-surface comment at :74 beside the email `Field`, word for word, and do
   not change `UPLOAD_EMAIL_HINT`'s words**: `legal-surfaces.test.ts` maps the marker to this file, and counsel reviews
   the hint. `address.ts`'s five messages are not changed (2.6, "Left alone").
2. **Name and focus the file.** Give the file input `data-issue-for="upload"`, so an `upload` issue is named
   "File to screen", linked, and focused when it is the only issue. Render `<FieldError id="screening-file">` from
   `useFieldIssue('upload')` under the input.
3. **Post, never GET; submit on the guarded core.** Give the form `method="post"` and still no `action=`. A press without
   JavaScript then sends a POST to `/screening`, which is not a server action: with no `$ACTION_ID_` field in the body,
   Next renders the page again and ignores the fields. The values travel only in the request body and never reach a
   URL, a log or a referrer; the file input has no `name`, so the file is never sent and nothing is screened. Then follow
   the model of `components/packets/version-form.tsx:102-131`:
   - `const guarded = useGuardedSubmit(action, { inFlight })` and `const [preparing, startPreparing] = useTransition()`.
   - Do not use `guarded.formAction`: the form keeps no `action=` (`upload-form.test.tsx:42` pins this).
   - `read(file)` returns `{ file, result }`, and `pendingRead` holds that promise only while `chosen.current === file`.
     A rejection from `parseScreeningFile` (for example `NotReadableError` from `file.arrayBuffer`) becomes a local
     problem in the "Not sent" list, a new member of `FILE_MESSAGES` in `lib/screening/messages.ts`:
     `FILE_MESSAGES.unreadable` = **"This browser could not read the file. Choose it again."** (checked by the
     ux-brand-reviewer against brand.md and CO-11). As a `FILE_MESSAGES` "Not sent" list sentence it is covered by the
     guard's key-named allowlist (2.7), with no new entry of its own. It never throws into the transition or
     `app/error.tsx`, which would lose what was typed.
   - `onSubmit`: `preventDefault()`; return if `inFlight.current`; set `inFlight.current = true`; then
     `startPreparing(async () => { let sent = false; try { let got = await (pendingRead.current ?? read(chosen.current)); while (got.file !== chosen.current) got = await (pendingRead.current ?? read(chosen.current)); if (no file) { show the input's message; return; } if (local problems) { return; } guarded.send(body); sent = true; } finally { if (!sent) { inFlight.current = false; focus the input; } } })`.
     Only a result whose file is still the chosen one is sent: choosing a second file while a press is preparing sends
     the second file's rows, never the first's.
   - `pending = guarded.pending || preparing`.
   - This is pending from the press, sends one request per press, and on a dropped connection gives the core's
     `unconfirmed` state ("Not confirmed") with every value kept. The chosen `File` is kept in memory only, never in
     storage.
4. **Fix the read race.** Keep the parse in progress in the `pendingRead` ref and await it, never parsing twice. Clear
   `reading` only when `chosen.current === file`.
5. **Button and status.** Use `<Button type="submit" aria-disabled={pending || undefined}>Screen the file</Button>`, the
   same as the original design's 4.1 and `action-form.tsx:89`. Comment at the button: "Not aria-disabled while reading: a press then is
   accepted, waits for the read (change 3) and sends once." The `inFlight` ref is the only guard against a second press.
   Its words stay the same while pending (the original design's 4.1: never "Sending…"). Put `<PendingStatus pending={pending}/>` in the same
   `flex flex-wrap items-center gap-2` wrapper. Status comes from two places: the reading line (change 6) while the file
   is read, and `PendingStatus` ("Working…") from the press on. The Download button's (:337) `aria-describedby` moves
   from `screening-template-rules` to `screening-template-hint`. The submit button has none.
6. **The reading line.** Move "Reading the file in this browser…" (the same words, `data-state="reading"`) inside the
   `file-status` region. Its first render stays empty, as `upload-form.test.tsx:60` pins.
7. **Tie the file's problems to the file; React owns its attributes.** Give the `AlertDescription`
   `id="screening-file-problems"`. Key `aria-invalid` on both sources: `const uploadIssue = useFieldIssue('upload'); const
   invalid = problems.length > 0 || uploadIssue !== undefined;` then `aria-invalid={invalid || undefined}`. That puts
   `aria-invalid="true"` in the DOM before the summary's layout effect runs, so `markByHand` (`form-issues.tsx:476`)
   returns early and never writes either attribute; React alone owns them. The input does not need the summary item id:
   the field error describes it. `aria-describedby`, in this fixed order, keeping only the ids present:
   - server issue only: `screening-file-error screening-file-hint`;
   - local problems only: `screening-file-problems screening-file-hint`;
   - both: `screening-file-error screening-file-problems screening-file-hint`;
   - neither: `screening-file-hint`.

   A press with problems focuses the input. Keep the title "Not sent". Its lead becomes **"Nothing was sent. Choose the
   file again once each problem below is fixed:"** (was "Nothing was sent. Fix the file and choose it again:", which is
   untrue when the browser could not read a sound file; the new lead is true for every list item, each of which already
   says what to do). It is not a legal surface; `e2e/screening.spec.ts:269` pins only "Nothing was sent.", so only an
   `upload-form.test.tsx` pin of the old lead, if any, moves. In the same PR, add a sentence to `markByHand`'s comment (`form-issues.tsx:471-474`): a control that React
   renders with `aria-describedby` must set `aria-invalid` itself, or sit in a `[data-invalid]` wrapper, when it reads a
   field issue.
8. **"Choose the file to screen."** becomes the input's own message, with focus on the input, and leaves the "Not sent"
   list. `lib/screening/messages.ts:206` `noFile` leaves `FILE_MESSAGES` and becomes its own exported constant,
   `export const NO_FILE_CHOSEN = 'choose the file to screen';`, with a one-line doc comment saying it is the file
   input's field message, not a "Not sent" list sentence. Its only user, `upload-form.tsx:246`, imports it instead. The
   input reads "Error: choose the file to screen" and the summary "File to screen: choose the file to screen", one
   lower-case sentence like every field message (the original design's 3.2; 5.2). `FILE_MESSAGES` then holds only "Not
   sent" list sentences, and the guard (2.7) checks `NO_FILE_CHOSEN` as a field message; it fails first against the base
   string "Choose the file to screen.".
9. **`stale`: no refresh, its own lead.** Do not render `RefreshAfterRefusal`. The route is public: it has no token or
   request key to renew, and its only `stale` cause is the origin check (`lib/http/invoke.ts:382`, publicRoute's
   `csrf_refused` when `!sameOrigin`), which no refresh repairs; the core's stale lead in either variant ("This page was
   out of date … It is up to date now") would be false and the person would loop on the same refusal. Add an optional
   `stale="origin"` prop to `RefusalSummary`/`RefusalLead` (the default unchanged), with an `appOrigin?: string` beside
   it, that renders a dedicated lead which claims no refresh and does not blame the page's age:
   **"PaidWhole could not confirm that this page came from PaidWhole’s own web address (for example, a translated or
   saved copy cannot send a file), so nothing was sent. Open {appOrigin}/screening, fill in the form again, then screen
   the file."** `{appOrigin}/screening` is a link to that address, set in mono (to be checked by the ux-brand-reviewer
   against brand.md and CO-11).
   - **Where the origin comes from.** `screeningPage`'s handler (`lib/screening/routes.ts:194`, W1's file) returns
     `appOrigin: services.origin`, the same value `sameOrigin` compares against (`lib/http/invoke.ts:382`; set from
     `APP_ORIGIN` at `lib/server/config.ts:331`). `app/screening/page.tsx` passes it as `appOrigin` to
     `ScreeningUploadForm`, which passes it on as `<RefusalSummary stale="origin" appOrigin={appOrigin} …/>`. Never
     `window.location.origin`: on a translated, proxied or saved copy that names the copy. It is the app's configured
     address, never PHI or a person's data.
   - **No bare "address".** The lead never says "address" without "web", because this page already uses "address" for
     the work email (`KEEP_ADDRESS_LABEL`, the address hint).
   - **Without an origin** (only the test harness passes none), the same sentence reads "… Open the screening page at
     PaidWhole’s own web address, fill in the form again, then screen the file."
   - Keep the values typed and the file chosen, with a comment: "A retry on this page cannot pass the origin check; the
     values stay only so the person can copy them into the page at appOrigin." Comment at the prop's use, citing
     invoke.ts: `csrf_refused` on this route means only a failed origin check.
10. **No person mark.** Do not add `useClearedForAnotherPerson`. Add this comment: "The screening route is public and
    reads no session, and this page renders no FormKeys, so no other person can be signed in to clear it for (the
    precedent is request-audit/page.tsx:53)."
11. **Hints.** Use `<Hint id="screening-file" …/>` (keeping the id `screening-file-hint`) and
    `<Hint id="screening-template" …/>` (now `screening-template-hint`; `data-slot="template-hint"` goes). Both become
    14 px.
12. **`keepAddress`** (:108-113) stays a raw controlled checkbox. It resets when the email changes, and the route never
    refuses it, while `CheckboxField` is uncontrolled. Comment: "Controlled on purpose (it resets with the email); never
    refused, so not a CheckboxField."
13. **A no-JavaScript notice.** Add `<noscript>` inside the form, above the first card ("About your practice"):
    **"Screening a file needs JavaScript, because the file is read in this browser and never uploaded: only its rows of
    totals are sent. Turn JavaScript on before you fill in the form."** (checked by the ux-brand-reviewer). It repeats
    the card's own words (`upload-form.tsx:315`, "read in this browser and never uploaded: only its rows of totals are
    sent"), so the fact has one name on the page, and a person without JavaScript is not left pressing a button that
    does nothing.

**Words** (new or moved; the rest unchanged):
- The summary lead (shared core): "Fix the field listed here, then try again." for one issue, and "Fix the fields listed
  here, then try again." for several.
- The stale lead (screening only): "PaidWhole could not confirm that this page came from PaidWhole’s own web address
  (for example, a translated or saved copy cannot send a file), so nothing was sent. Open {appOrigin}/screening, fill in
  the form again, then screen the file." (`{appOrigin}/screening` a mono link; without an origin, "Open the screening
  page at PaidWhole’s own web address, fill in the form again, then screen the file.")
- The unconfirmed lead (shared core) is the existing words, unchanged.
- Under the file input: "Error: choose the file to screen".
- A file the browser cannot read: `FILE_MESSAGES.unreadable`, "This browser could not read the file. Choose it again."
  (the "Not sent" list).
- The "Not sent" lead: "Nothing was sent. Choose the file again once each problem below is fixed:" (change 7).
- The `<noscript>` line: "Screening a file needs JavaScript, because the file is read in this browser and never
  uploaded: only its rows of totals are sent. Turn JavaScript on before you fill in the form."
- The phi_column and band-date sentences in the browser's "Not sent" list (`lib/screening/messages.ts:83`, `:95`, K3):
  "…; remove the column, then choose the file again. A screening takes totals only, never patient information." and
  "…; remove the dates, then choose the file again."

**Tests:**
- **`components/screening/upload-form.test.tsx`** (rewrite :105-130). It pins `RefusalSummary` with `renderMessage` as a
  regression pin (static render; it does not fail first, because `summaryLead` is already singular at base for one
  placed issue): the audit link, `role="alert"` and `tabindex="-1"` stay, and `UploadRefusal` goes. The fixture's
  out-of-date `'Check the fields marked below.'` changes to the server's current lead. :101 changes to
  `screening-template-hint`. Pin `/<form[^>]*\bmethod="post"/` next to the existing no-`action=` assertion, and correct
  that test's comment to: "without JavaScript the form posts its fields to the page itself, which ignores them; the
  file input has no name, so the file is never sent". Update any pin of "Choose the file to screen." and of the old
  "Not sent" lead. Pin the `<noscript>` line's exact words (change 13).
- **`lib/screening/parse.test.ts`** :321, :328, :332, :344, :362-363 and :437 follow `messages.ts:83`/`:95`'s "choose the
  file again" (K3), each changed first so it fails red before the message changes.
- **`components/test-support/forms-harness.tsx`** gains a `screeningUpload` form (or extends the existing `screening`
  entry used at `action-form.browser.test.tsx:940`, if it can carry the cases below).
- **`components/action-form.browser.test.tsx`** adds new cases, each written to fail at base first:
  - **one refused field reads "field":** the harness action returns `{ error: 'Fix the fields listed here, then try
    again.', invalid: true, issues: [{ field: 'zip', message: … }] }` with SYNTHETIC values; the lead reads "Fix the
    field listed here, then try again." and the item is named "ZIP code" from the page's label, with a link. At base,
    `UploadRefusal` prints `state.error` verbatim, after both cards;
  - **reading, before a press:** with a file chosen and still being read, the button has no `aria-disabled` and no
    `opacity-50` look, and the `file-status` region reads "Reading the file in this browser…";
  - **a press while reading:** a plain click (not force); after it the button is `aria-disabled="true"`, keeps focus and
    its words, the status reads "Working…", and exactly one request goes out after the read finishes;
  - two presses while reading send one request, and the file is parsed once;
  - **the file changes while a press prepares:** choose A, press, choose B before A's read resolves; the action receives
    B's rows, or nothing, never A's;
  - **a read that rejects:** a file whose `arrayBuffer` rejects shows the "Not sent" lead "Nothing was sent. Choose the
    file again once each problem below is fixed:" and `FILE_MESSAGES.unreadable`, the form and values stay, and a press
    after choosing again sends exactly once (the guard does not swallow it);
  - a dropped connection keeps every value and the chosen file and shows "Not confirmed";
  - **the file's attributes:** a good file refused by the server with an `upload` issue gives `aria-invalid="true"`,
    `aria-describedby` exactly `screening-file-error screening-file-hint`, and focus on the input; then choosing a bad
    file gives exactly `screening-file-error screening-file-problems screening-file-hint`, with no summary item id;
    then a good file the server accepts gives `screening-file-hint` alone and no `aria-invalid`. At base the input never
    takes `aria-invalid`;
  - **stale:** the screening's origin lead shows, naming the harness's `appOrigin` in a mono link to
    `{appOrigin}/screening`; no "up to date" or "press “Screen the file” again" text appears; `router.refresh` is not
    called; and the values stay. A static pin asserts that the lead contains no "address" that is not "web address" (so
    never "own address" alone). At base the server's `STALE` words ("Reload the page and try again") show;
  - **a questioned address:** `MAILBOX_UNCONFIRMED` from the server shows the keep box, the summary item names "Work
    email", and the address-hint line does not repeat the message;
  - **renderMessage's reach** (moved here from 2.1's `form-issues` entry, C6): a field's item never uses
    `renderMessage`, checked on the first render and after placement.

  These fall under FRM-03, FRM-04 and FRM-05, whose registry entries already list this file.
- **`e2e/screening.spec.ts`:**
  - :242 changes `[data-slot="template-hint"]` to `#screening-template-hint`.
  - :265-273 adds: after a press with a bad file, the input has `aria-invalid="true"`, its `aria-describedby` contains
    `screening-file-problems`, and it is focused. Its :266 and :271 pins follow K3's "choose the file again".
  - :754-773 (the ZIP refusal) must still pass unchanged in shape. Re-run it.
  - Grep for "Row " and the old reason literals (2.7, `screeningReasonMessage`) and update every hit.
- **`e2e/forms-keep-input.spec.ts`** (owned by slice W1; this step lands with W1's hunk, 6): a no-JS step in a
  `javaScriptEnabled:false` context on `/screening`: fill the fields with synthetic values (a SYNTHETIC practice name and
  an `example.test` email), press "Screen the file", then assert that every request's URL has no query string and
  contains none of the field values (`new URL(page.url()).search === ''`), that no screening is created (no screening
  id or link appears), and that the request body carries no file part. It fails first at base (GET with a query
  string). Cited under FRM-06 (5.1).
- **Re-run unchanged:** `e2e/mail-cutoff.spec.ts:90-98` and `e2e/screening-phone.spec.ts:147-148`.

**Sees:**
- A refusal now appears at the top of the form, under "Not done", named by the label the person sees.
- A refused file is outlined, says what is wrong right under it, and takes focus.
- While the file is read the button stays available and a line says the file is being read; from the press, the button
  stays put with its words and a line beside it says it is working.
- A dropped connection no longer drops the person on an error page with everything gone.
- A page that fails the origin check says so plainly, names PaidWhole's web address to open, and does not pretend a
  refresh fixed it.
- Without JavaScript, a line says screening needs it, and nothing typed ever appears in the address bar.
- The hints are 14 px, not 12.

#### `components/form-issues.tsx`
- **Now:** `RefusalSummary` (:549-665) has no way to render a message with a link. Before `RefusalSummary`'s effect has
  read the placements (`targets === null` on the first render, and on the server), every item looks form-wide (:597-608).
- **Change:**
  - Add an optional `renderMessage?: (message: string) => ReactNode`. It applies only when `read !== null &&
    targets[index] === null && hidden === null`, or to an issue whose field is in `NO_FIELD` (`'input'`), which is
    decidable before the read; so a field's message is never rewritten, on the first render or after. Document it in the
    prop's comment.
  - Add the optional `stale="origin"` and `appOrigin` props (2.1 change 9), passed through to `RefusalLead`, whose
    origin variant renders the lead with `{appOrigin}/screening` as a mono link.
  - Extend `markByHand`'s comment (2.1 change 7).
- **Tests:** in `components/form-issues.test.ts` (pure functions; the file is `.ts`, not `.tsx`), a `summaryLead`-level
  case for the origin lead if it is a pure helper. The rendering cases (a form-wide item uses `renderMessage`; a field's
  item never does, before and after placement; the origin lead) are in `action-form.browser.test.tsx` (2.1).
- **Sees:** nothing new outside the screening.

#### `lib/http/next.ts`
- **Now:** :153-158 names "the screening upload, a #42 file, until it does" as the reason `STALE` says "Reload".
- **Change:** update the comment only. The words stay, because a post without JavaScript from any other form still needs
  "Reload". Say: "The words stay for a post made without JavaScript; every form with JavaScript replaces them with
  RefusalLead's, and the screening upload, which never posts to an action, with its own origin lead." This is a
  comment-only change in a capacity-watched file.

#### `components/form-hints.test.ts`
- **Change:** remove the `SMALL_ALLOWED` entry for `components/screening/upload-form.tsx` (:83-86) and the `ALLOWED`
  entry (the pattern-hint map) for `app/console/support/page.tsx` (:20-23, slice C's). Keep both maps, empty, so the
  next deferral has a place. Owned by slice U, which also removes slice C's entry; the test fails first if run against a
  base with only the entries removed.

### 2.2 Console support: the Ticket hint (slice C)

#### `app/console/support/page.tsx`
- **Now:** :57 is `<Field label="Ticket" name="ticket" required pattern="[A-Za-z0-9-]{1,64}" />`, with no hint and no
  `maxLength`. :39 says "company staff" and uses straight apostrophes ("practice's data", "practice's contracts").
- **Change:** `<Field label="Ticket" name="ticket" required maxLength={64} pattern="[A-Za-z0-9-]{1,64}" hint="The ticket’s number, as Support tickets shows it, such as 1042. Letters, digits and hyphens only." />`.
  At :39, change "company staff" to "PaidWhole staff" (the product's phrase: `sign-in/notice.tsx:204`,
  `terms/page.tsx:46`) and use curly apostrophes.
- **Why 1042 and not 7.8's "as in SYN-1234":** tickets are now numbered by the help desk: a ticket's number is a
  `bigint` (`support_ticket.number`, `20261030100000_support_desk_and_workforce.sql:12`), shown in the Tickets "Number"
  column (`console/tickets/page.tsx:51,62`) and on `/support` as "Ticket {n} opened", so 1042 is what a staff member
  will copy. The field itself still writes `support_grant.ticket`, free text checked only by
  `CHECK (ticket ~ '^[A-Za-z0-9-]{1,64}$')` (`20261015140000_tenancy.sql:125`) and not linked to `support_ticket.number`;
  grants made before the help desk, and both e2e specs (`SYN-CON-E2E`, `SYN-E2E-1`), use other references. So the hint
  says what to enter ("The ticket’s number, as Support tickets shows it") and the rule the field checks ("letters, digits and
  hyphens only"); it claims no link the database does not enforce. UX PR 74 (`co-001/ux-console-support-page`) makes
  the field a choice of an open ticket, which will replace this hint (section 8).
- **Tests:** FRM-04's `form-hints.test.ts` (2.1) fails if the entry stays without a hint. `getByLabel('Ticket')`
  (`e2e/contracts.spec.ts:169`, `e2e/hardware-key.spec.ts:26`) still matches.
- **Sees:** a 14 px line under Ticket saying what to enter; "PaidWhole staff".

### 2.3 The users page (slice C)

#### `app/settings/organizations/[organizationId]/users/page.tsx`

**Now:**
- :85-87 is `<label className="flex items-center gap-1 text-xs"><input type="checkbox" name="confirm" required /> They lose access now</label>`,
  inside the End membership row form (:81). It is 12 px, has no message of its own and no left rule.
- The Members table (:52) has no `ScrollTable`, so at 390 px the page scrolls sideways. The Invitations table (:132,
  `hidden … sm:table`) is bare too. `app/tables.test.ts:33` (`AFTER_42`) holds this file at exactly 2 bare tables,
  `removedBy: 'UX PR 75 (co-001/ux-users-page)'`; a file that gains or loses a bare table fails.
- Both tables end in an empty header cell (`<th className="py-1 font-medium" />`, :58 and :138), so the action column
  has no name.
- There are straight apostrophes at :31 ("organization's administrator") and :39 (`&apos;s`).

**Change:**
- Use `<CheckboxField id={`confirm-${member.membershipId}`} name="confirm" errorName="Confirmation" required label="They lose access now. End their membership." />`,
  following `cases/[caseId]/page.tsx:237` and `reconciliation/page.tsx:45`. The id is per row, because every member row
  renders this form. The server message `settings.ts:1082` ("confirm that this person loses access now") already gives
  the step, so keep it.
- Wrap the Members table in `<ScrollTable label="Members">` with `min-w-[40rem]` on the table, as
  `console/organizations/[organizationId]/page.tsx:120-121` does. This adds one copy, so no new two-copy form.
- Wrap the Invitations table too: `<div className="hidden sm:block"><ScrollTable label="Invitations"><table
  className="w-full min-w-[36rem] …">`, moving the `hidden sm:table` condition onto the wrapper outside `ScrollTable`,
  per the guard's bare-table rule (a table behind a condition inside a ScrollTable counts as bare). Delete the
  `AFTER_42` line for this file in `app/tables.test.ts`. This closes UX-011's users-page part here (section 8: UX PR 75
  is told; its StackedRows will later replace both).
- Name the action columns, in these exact words. A column with more than one control names all of them.
  - Members (:58): `<th className="py-1 font-medium"><span className="sr-only">Change role or end membership</span></th>`,
    because the cell holds both the Change role form (:75) and the End membership form (:81).
  - Invitations (:138): `<th className="py-1 font-medium"><span className="sr-only">Send again</span></th>`, matching
    `ResendForm`'s submit (:174).
- Use curly apostrophes at :31 and :39.
- **Not changed here:** the Invitations `ResendForm` in both copies. The shared key and pin is the 34th UX PR's work
  (ADR 0078 Decision 5); this PR corrects ADR 0077's "Not covered" to name this page (5.2).

**Tests:**
- `e2e/onboarding.spec.ts` near :232 adds `atPhoneWidth(admin, 'Users and roles', { tables: ['Members'] })`. At base it
  fails on the sideways scroll.
- `app/tables.test.ts`: the `AFTER_42` line for `users/page.tsx` is deleted. It fails first if the line is deleted
  against base (2 bare tables found where 0 are allowed).
- A refused confirmation cannot be reached in the browser (`required` stops the press), so the inline message is covered
  by `CheckboxField`'s own FRM-04 cases. No e2e reads "They lose access now".

**Sees:** a 14 px box with a full sentence and the shared mark; at 390 px the Members table scrolls inside its own frame,
not the page.

#### `app/console/mail/page.tsx` (an improvement in a #42 page this PR touches for the same rule)
- **Now:** the paragraph about SES's review (:143, `data-copy="resume-review"`) sits inside the Resume form but is not
  tied to the reason select.
- **Change:** add `id="resume-review"` to the `<p>` and `describedBy="resume-review"` to the `SelectField`
  (`field.tsx:262`).
- **Tests:** `e2e/mail-cutoff.spec.ts:140` still finds it by `data-copy`. Add an assertion there: the select's
  `aria-describedby` contains `resume-review`.
- **Sees:** nothing visible; a screen reader reads the review note with the select.

### 2.4 The ZIP wording, one across the product (slice W1)

| Site | Now | New |
| --- | --- | --- |
| `lib/zip.ts:32` `ZIP_CODE_FORMAT` (used by `settings.ts:664,690`, `console.ts:506,516`) | five digits, or ZIP+4 such as 27601-1234 | **enter five digits, or a ZIP+4 such as 27601-1234** |
| `lib/screening/routes.ts:348` | `` `the practice’s ZIP code: ${ZIP_CODE_FORMAT}` `` (prints "ZIP code: the practice’s ZIP code: …") | `ZIP_CODE_FORMAT` alone |
| `settings.ts:443` and `packages/packets/src/correspondence.ts:77` | a ZIP code of five digits, or ZIP+4 (nine digits, with or without its hyphen) | **enter five digits, or a ZIP+4 such as 27601-1234** (written out in packets, which cannot import apps/web; a unit test in `packages/packets` pins it) |
| Page hints: `app/p/[practiceId]/settings/pricing/page.tsx:106`, `app/console/organizations/[organizationId]/page.tsx:104`, `app/console/practices/[practiceId]/page.tsx:102` | Five digits, or ZIP+4 such as 27601-1234. | **Five digits, or a ZIP+4 such as 27601-1234.** (each keeps its second sentence) |
| `app/p/[practiceId]/settings/correspondence/page.tsx:86` (label "ZIP", no hint) | — | hint **Five digits, or a ZIP+4 such as 27601-1234.** |

- **Left alone:** `SCREENING_ZIP_MESSAGES` (`screening/routes.ts:779-783`), which the founder chose and counsel has not
  yet confirmed; `ZIP_HINT` (`upload-form.tsx:43`), which `e2e/screening.spec.ts:747` asserts; and `settings.ts:751-752`
  (`shownZip` "five digits", `shownZipPlusFour` "four digits"), the pricing page's hidden inputs
  (`pricing/page.tsx:115-116`) filled from the stored location, which only a tampered request reaches; a stale location
  is already refused by the handler's CHANGED message (review R6, refuted; section 10).
- **Tests that move:**
  - `lib/zip.test.ts`: a new assertion that pins `ZIP_CODE_FORMAT`. This one fails first.
  - `lib/routes/settings-routes.db.test.ts:275`
  - `lib/routes/console-routes.db.test.ts:165`
  - `lib/screening/routes.db.test.ts:433`
  - `components/fields.test.tsx:36` (a fixture)
  - `e2e/onboarding.spec.ts:573` (slice E)
  - `components/action-form.browser.test.tsx:127,604,608` (slice U owns this file and carries the new words)
- **Sees:** "Billing ZIP: enter five digits, or a ZIP+4 such as 27601-1234", and in the screening, "ZIP code: enter five
  digits, …" instead of the name printed twice.

### 2.5 The console's and settings' messages (slice W1)

All of these follow the house form in the original design's 3.2: one lower-case sentence (reason; step), with no full
stop and no colon of its own.

| Site | Now | New |
| --- | --- | --- |
| `console.ts:724` (email) | an internal user cannot join a practice group or a firm; support access is a support grant | **PaidWhole staff cannot join a practice group or a firm; to give support access, create a support grant from the ticket under Support** |
| `console.ts:727` | a member of a practice group or a firm cannot hold an internal role | **this person belongs to a practice group or a firm, so they cannot also be PaidWhole staff; invite a different address** |
| `console.ts:116` | at most 500 characters | **enter at most 500 characters** |
| `console.ts:117` | one line, with no line breaks | **write it on one line, with no line breaks** |
| `console.ts:496` (NPI) | ten digits | **enter the NPI’s 10 digits, or leave it blank** (the "10-digit" number style of `settings.ts:436`) |
| `console.ts:497` (tax ID) | four digits | **enter the last four digits of the tax ID, or leave it blank** |
| `console.ts:705`, `settings.ts:1002`, `:1055` | `` `a role a ${kind} organization holds` `` (prints a raw kind such as "group") | **choose one of the roles listed** |
| `console.ts:831` (Signed on) | a date (YYYY-MM-DD) | **enter the day it was signed** |
| `console.ts:835` (documentRef) | the e-signature reference (letters, digits and : / . _ -) | **use only letters, digits, colons, slashes, dots, underscores and hyphens, as the e-signature vendor gives it** |
| `console.ts:975` (ticket) | the ticket number (letters, digits and hyphens) | **enter the ticket’s number, such as 1042, using only letters, digits and hyphens** |
| `console.ts:697` | inline `z.email('enter an email address')` | `emailAddress` from `lib/routes/schemas.ts:23` (the same words, one source) |
| `settings.ts:435` (`correspondenceForm.name`, min) | a name or office | **enter a name or office** |
| `settings.ts:435` (max) | a name or office of at most 120 characters | **enter a name or office of at most 120 characters** |
| `settings.ts:436` (phone, min and max) and `correspondence.ts` `phone` | a 10-digit phone number, such as (919) 555-0100 | **enter a 10-digit phone number, such as (919) 555-0100** |
| `settings.ts:437` (extension, both) and `correspondence.ts` `phone_extension` | an extension of 1 to 6 digits | **enter an extension of 1 to 6 digits, or leave it blank** |
| `settings.ts:438` | an email address of at most 254 characters | **enter an email address of at most 254 characters** |
| `settings.ts:439-441` (through `blankText`) | at most 100 characters | **enter at most 100 characters** |
| `settings.ts:442` and `correspondence.ts` `address_state` | a USPS state or territory code, such as NC | **enter the two-letter USPS code of the state or territory, such as NC** |
| `correspondence.ts` `name` | a name or office of 1 to 120 characters, with no hidden characters and no @ (…) | **enter a name or office of 1 to 120 characters, with no hidden characters and no @ (an email goes in its own field)** |
| `correspondence.ts` `email` | an email address of at most 254 characters, with one @ and no spaces | **enter an email address of at most 254 characters, with one @ and no spaces** |
| `correspondence.ts` `address_line1` | a mailing address names its street line, city, state and ZIP, … | **enter the street line, 1 to 100 characters with no @ (an email goes in its own field)** |
| `correspondence.ts` `address_city` | (the same shared rule) | **enter the city, 1 to 100 characters with no @ (an email goes in its own field)** (the shared rule is split, so each field has its own message; the ZIP's is in 2.4, the state's above) |
| `correspondence.ts` `address_line2` | a second address line of 1 to 100 characters with no @ (…) | **enter a second address line of 1 to 100 characters with no @ (an email goes in its own field)** |
| `correspondence.ts` `contact` | a correspondence contact names a person or office and a phone number, and holds nothing else | **name a person or office and give a phone number, and nothing else** |
| `apps/worker/src/support/support-mail.ts:56-57` `WITHHELD_MESSAGE` | …naming the screen and the record’s opaque ID only. | **…naming the screen and the record’s ID only.** (as `/support` and `support.ts:249` say) |

- **Left alone:** `console.ts:721` ("you cannot add yourself to an organization"), whose next step is plain (add
  someone else). Also `settings.ts:1062` and `:1095`, which show Postgres rule text
  (`packages/db/functions/membership_rules.sql:18`); changing them needs a migration, so they go in 4.
- **The correspondence form is converted in one pass** (the rows above from `settings.ts:435` to `correspondence.ts`
  `contact`), so the form has one style; `address_zip` is in 2.4. The words match between `correspondenceForm` and
  `CORRESPONDENCE_FIELD_RULES` wherever the rule is the same; each new line passes `pnpm lint:copy` (CO-11).
- **Tests:**
  - `console-routes.db.test.ts:283` (email), plus new assertions for :727 and :975;
  - `console.ts:116`'s "at most 500 characters": `components/console/suspension-card.test.tsx:79` (a fixture) and
    `console-routes.db.test.ts:769`;
  - `packages/packets/src/correspondence.test.ts`: the unit test 2.4 adds for the ZIP rule pins every
    `CORRESPONDENCE_FIELD_RULES` value;
  - the builder greps each old correspondence literal across `apps/`, `packages/` and `e2e/` (including
    `settings-routes.db.test.ts`, the worker setter's tests and `e2e/forms-keep-input.spec.ts`) and updates every hit;
  - `settings-routes.db.test.ts` for the role message;
  - a new `support-mail` assertion of the literal in `apps/worker/src/support/support-mail.db.test.ts`, which imports the
    constant today, so pin the words.
- **Sees:** each console refusal now says what to do. "Email: PaidWhole staff cannot join a practice group or a firm; to
  give support access, create a support grant from the ticket under Support" (only platform administrators see this).

### 2.6 The public forms' messages: screening and request-audit (slice W1)

| Site | Now | New |
| --- | --- | --- |
| `NO_PATIENT_INFORMATION` (`screening/routes.ts:294`, used :320, :340, :1274, :1284) and `onboarding.ts:34` | two texts, colon-joined | one exported constant `NO_PATIENT_INFORMATION` in `lib/routes/schemas.ts`: **this form takes no patient information; remove anything that looks like an identifier, a date or a phone number, then send it again**. `onboarding.ts` imports it; `screening/routes.ts` re-exports it so `routes.db.test.ts:18` still finds it |
| `contactName` (`screening/routes.ts:1272`) and `practiceName` (:338) | your name / the practice’s name, at most 200 characters | `requiredText(200)` (`schemas.ts:20`): **fill this in** when empty, **enter at most 200 characters** when too long |
| `referringFirm` (:316, `onboarding.ts:83`) | the firm’s name, at most 200 characters | **enter at most 200 characters** |
| `contactEmail` (:352, :614) | an email address: the result’s link is sent there | **enter an email address; the result’s link is sent there** |
| `locations` (:1278; `onboarding.ts:113`, three messages) | a whole number of locations from 1 to 1,000 / … | **enter a whole number from 1 to 1,000** (all four) |
| `payers` (`onboarding.ts:40,47`) | name at least one payer / … | **name 1 to 50 payers, each at most 120 characters**; the 6,000 cap reads **enter at most 6,000 characters** |
| `screening/routes.ts:370` (upload overflow) | And N more problems like these | `` `and ${n} more ${n === 1 ? 'problem' : 'problems'} like these; fix ${n === 1 ? 'it' : 'them'} too, then choose the file again` `` (so it reads "File to screen: and 7 more problems like these; fix them too, then choose the file again"; the count stays a `toLocaleString` number, in mono wherever it renders); `routes.db.test.ts:161,319` follow, changed first so they fail red |

- **Tests:**
  - `screening/routes.db.test.ts:217` (contactEmail), `:1069` (firm), `:433` (ZIP), `:161`, `:319`;
  - `e2e/forms-keep-input.spec.ts:110` (request-audit; slice W1 owns this file);
  - new assertions of the convert-form and request-audit texts, which no test asserts today (`routes.db.test.ts:948`
    checks only field names).
- **Left alone (legal surfaces):** `lib/screening/address.ts`'s five messages (`ADDRESS_REFUSED`, `MAILBOX_UNCONFIRMED`,
  `suggestionMessage`, `endingSuggestionMessage`, `unknownEndingMessage`) and `SCREENING_BOUNCE_BUDGET`
  (`messages.ts:230`). They are counsel's `screening-mail-address` surface (legal-surfaces.md:25; the founder's Q12
  wording, for counsel to confirm), so they keep their sentence form ("Work email: We cannot send email to this
  address. Check it, or use another address.") until counsel rules; the guard test names them in its allowlist (2.7)
  and the ADR amendment records the exception (5.2). They have no ": " today.
- **Sees:** request-audit, the screening and the screening result page's convert form
  (`/screening/results/[resultId]`, through `screening/routes.ts:1272`, :1274, :1278, :1284; no result-screen file is
  edited, section 8) read the same, with one colon per line. The convert form's "Your name" refusal goes from "your
  name, at most 200 characters" to "fill this in".
- **The browser's overflow line** (`lib/screening/messages.ts:195`, "And N more problems like these.", asserted by
  `parse.test.ts:366`, `:407`) is left alone on purpose: it is a sentence in the "Not sent" list, whose lead (2.1 change
  7) already gives the step, and the guard's `FILE_MESSAGES`/list allowlist does not reach it.
- **The no-patient-information detector's logic is unchanged.** Only the message moves file, and the detector is not
  touched. Section 9 has the check on this.

### 2.7 The separator rule, across every message (slice W2)

The summary joins `${name}: ${message}` (`form-issues.tsx:608`, `:676`), so a message with a colon of its own reads
"Occurred on: the date is after today: enter…". Fix every such message in one pass, with a guard test. Rows marked
**(W1)** sit in files slice W1 owns and are built by W1 (section 6); the rest are W2's.

| Site | New |
| --- | --- |
| `screening/routes.ts:240-276` `screeningReasonMessage` **(W1)**, mapped to `{ field: 'upload' }` at :364, so each reads "File to screen: {message}" | every case becomes one lower-case sentence (reason; step) with no ": ", the row first as the subject, each named here so its step is reviewable. `{row}` is "row {n}", or "a row" when `reason.row` is undefined; `{column}` is `columnName(reason)` with its first letter lower-cased ("column 4", "a column"); `ItemLink` does not capitalise a message that follows a name: |
| — `phi_column` | `` `${column} holds ${kind}; remove the column, then choose the file again` ``, `kind` from the plural `PHI_KIND_LABELS` ("column 4 holds member IDs; remove the column, then choose the file again"). Never "upload again": the page says the file is never uploaded, and one action has one verb |
| — `unknown_column` | `` `${column} is not one of the eight screening columns; remove it` `` |
| — `duplicate_column` | `` `${column} is a second ${fieldName} column; keep one` `` |
| — `missing_column` | `` `the file has no ${fieldName} column; add it` `` |
| — `row_shape` | `` `${row} does not have one cell for each column; save the file again as CSV, then choose it again` `` |
| — `invalid_value`, with a field | `` `${row} has a value in the ${field} column that is not in the screening’s format; correct it, or leave the row out` `` (no article before the field name, so never "a allowed total" or "the units is") |
| — `invalid_value`, with no field | `` `${row} has a value that is not in the screening’s format; correct it, or leave the row out` `` (its own words: `fieldName`'s "a column" default never reaches this case, so never "a a column") |
| — `band_holds_date` | `` `row ${n}’s ${column} holds dates of service; a screening takes a calendar quarter, such as 2026-Q1, so remove the dates, then choose the file again` `` (fix round, UX-UX-2: its step, the browser twin's verb) |
| — `band_in_future` | `` `row ${n}’s service band is a quarter that has not started yet; leave the row out` `` (fix round, UX-UX-4) |
| — `band_outside_content` (row branch) | `` `row ${n}’s service band is a quarter outside the Medicare content PaidWhole has loaded, so a Medicare row in it cannot be screened; leave it out` `` |
| — `band_outside_content` (no row) | **every Medicare row is in a quarter outside the Medicare content PaidWhole has loaded, so there is nothing to screen; choose a file with rows in a screened quarter** |
| — `duplicate_row` | `` `${row} repeats row ${first}; add the two into one row` `` |
| — `no_rows` | **the file has no rows under its header; add the rows, then choose the file again** |
| — `too_many_rows` | `` `a screening takes at most ${max} rows; add together rows that repeat a code, modifiers, units, place of service, payer product and quarter, or leave rows out, such as a quarter or a payer product, until ${max} or fewer remain, then choose the file again` `` (fix round, UX-UX-1: never a second screening, since a later one replaces the earlier; the browser's `messages.ts` twin says the same) |
| — `row_count_mismatch` | **the rows sent do not match the file; choose the file again** |
| — `too_few_claim_lines` (both branches) | `` `row ${n} sums fewer than 11 claim lines; a screening takes rows of at least 11, because fewer can describe one patient’s care, so leave it out` `` and **every row sums fewer than 11 claim lines, so there is nothing to screen; a screening takes a row of at least 11 claim lines, because a row of fewer can describe one patient’s care, so choose a file with rows of at least 11 claim lines** (fix round, UX-UX-2: its step; brand-delta BD-1: one semicolon, the step led by ', so' like its siblings; the browser twin ends "Choose a file with rows of at least 11 claim lines.") |
| — the overflow line | lower-cased with a step by 2.6 (routes.ts:370) |
| `lib/screening/messages.ts:83`, `:95` **(U)**, the browser's "Not sent" twins of `phi_column` and `band_holds_date` | sentences, so they keep their capital and full stop, but take the same verb: "…; remove the column, then choose the file again. A screening takes totals only, never patient information." and "…; remove the dates, then choose the file again." (`messages.ts:92`'s `invalid_value` sentence, "Row 3, units: it must be …", has no article fault and is a list sentence; left alone) |
| `support.ts:249` **(W1)** | a ticket takes no patient information; remove names, dates of birth, member IDs, claim numbers, other identifiers and phone numbers, and name the screen and the record’s ID instead (keeps "record’s ID", so 2.5's `WITHHELD_MESSAGE` row still matches `/support`) |
| `settings.ts:267` **(W1)** | `` `the chain is not complete; ${…} not on file, and a platform administrator records it when it is signed` `` |
| `settings.ts:426` **(W1)** | leave out the @; an email address goes in its own field |
| `settings.ts:902` **(W1)** | our mail service is holding this address back; ask PaidWhole support to release it and send the invitation again (support releases and sends it from the console, `settings.ts:1125`; `ResendForm` offers no Send again for a held invitation, so the step stays support's; `components/settings/invitations.test.tsx:37` checked, unchanged) |
| `support.ts:379` **(W1)** | the status page is public; write no identifier, date of birth or phone number |
| `reconciliation.ts:130` | the case line is not open, because it was written off or its case is closed; open the case to see where it stands |
| `reconciliation.ts:133` (`no_change_in_amount`) | an adjustment changes the amount; enter a different amount |
| `mapping.ts:411` | the months changed since this page was shown; review them below and try again |
| `mapping.ts:420` | `` `${error.message}, for ${month.periodFrom} to ${month.periodTo}` `` (the builder checks that `error.message` is itself a colon-free fragment with no semicolon, since it is joined with ", for …") |
| `console-mail.ts:200` (the select labelled "Why it can resume") | choose why it can resume; the cause is fixed, or it was a false alarm |
| `sign-in.ts:151` | the sign-in service refused it; choose a different password |
| `sign-in.ts:418`, `:723` | the two passwords do not match; type the same password in both fields |
| `sign-in.ts:638` | the code did not match, or it has expired; check it, or send a new code |
| `compliance.ts:142` | say where the record is kept, never a person’s name, using only letters, digits, colons, slashes, dots, underscores and hyphens, such as records:training/2026 |
| `compliance.ts:152` | the date is after today; enter the day it happened, today or earlier |
| `compliance.ts:216` | no compliance platform is connected yet; download the export and upload it to your compliance platform yourself |
| `lib/packets/view.ts:38` | say what it counts or names, such as 3 claims, 6 units, page 2 or 3,650 days (the narrative's figure scanner reads a thousands comma, `packages/packets/src/scan.ts:474`; `view.test.ts:86` follows, and `3650` elsewhere in the tests is narrative text, not this message) |
| `lib/triage/queries.ts:68` (`runId`, a hidden field the person never chooses) | the pricing run in effect for its period is a complete run, or a re-run once accepted, not one it replaced; open that run (subject-first, so `reruns-routes.db.test.ts:316`, :317, :354, :355's `/^runId: the pricing run in effect for its period/` still pass) |
| `apps/worker/src/billing/account.ts:349` (`issueAuditInvoice`) | the organization has no payment method on file; ask its administrator to add one under Billing, then issue the invoice (`billing.db.test.ts:665`'s `/no payment method on file/` checked, still matches; :666's `/add a payment method/` covers the colon-free :290 message, which does not change) |

**The "enter at most {n} characters" pass:** every bare "at most {n} characters" in `lib/routes/packets.ts:175`,
`lib/routes/submissions.ts:166`, `:276`, `lib/reconciliation/template.ts:23` and `settings.ts:439-441` (through
`blankText`, 2.5) becomes "enter at most {n} characters". `console.ts:831`/`:835`'s "(letters, digits and : / . _ -)"
hints are rewritten in 2.5, matching `compliance.ts:142`'s "letters, digits, colons, slashes, dots, underscores and
hyphens".

**Guard test** (new, `lib/routes/messages.test.ts`, under FRM-04), read through the TypeScript compiler API (already
installed; files outside `apps/web` are read by path, so no new import or dependency):
- **Files:** under `apps/web/src`, `lib/routes/**`, `lib/screening/**`, `lib/packets/**`, `lib/triage/**`,
  `lib/reconciliation/**` (`template.ts`) and `lib/zip.ts`; elsewhere, `apps/worker/src/billing/account.ts` and
  `packages/packets/src/correspondence.ts`.
- **Message positions:**
  (a) the string or template-literal arguments of zod method calls (`.min`, `.max`, `.length`, `.email`, `z.iso.date`,
  `z.enum`, `z.literal` and similar), positional or as an options object's `message`/`error` property, other than the
  first argument of `.regex`/`.max`/`.min`/`.length`;
  (b) `.refine`/`.superRefine` messages and `ctx.addIssue({ message })`;
  (c) string arguments to local schema helpers that carry a message (`blankText`, `noAt`, `optionalText`,
  `requiredText`); the robust form is every string or template literal passed to any call inside a `z.object(...)`
  initializer, with a small named allowlist for non-message strings;
  (d) `InputError` and `BillingRefusedError` message literals, and the `message` expression of every
  `{ field, message }` object literal (template literals and calls included);
  (e) exported string constants and the string values of exported records (`RESUME_REASON_LABELS`,
  `CORRESPONDENCE_FIELD_RULES`);
  (f) the string returns of message-building functions; and, by direct call, `screeningReasonMessage` for every member
  of `SCREENING_REJECTION_CODES`, with and without a row, column and field.
- **Template literals:** the head and spans are checked; each substitution is opaque.
- **Rules:** fail on any ": " (colon then space); on a message that starts with "at most"; on a field message that
  starts with an upper-case letter or ends with "."; and on any screening message (`screeningReasonMessage`, every
  `lib/screening/messages.ts` string, list sentences included) that contains "upload again". A colon inside a token such
  as `records:training/2026` is not ": ". The direct calls of `screeningReasonMessage` also assert no "a a " and no
  "a allowed" substring, and pin both `invalid_value` variants (with a field, `allowed_total` among them, and without).
  The guard does not test for the step itself (a heuristic would be brittle across reason-first and verb-first
  sentences); each rewritten message in this section names its step, and the ux-brand-reviewer checks the step by hand
  (5.2 item 1).
  For the `*_FIELD_RULES` constants and the correspondence and settings zod messages only, a message must also start
  with a verb from a short list (enter, choose, use, write, name, leave, remove, fix, ask, sign, try, fill, open), so a
  validator-style message ("a 10-digit phone number…") fails there; the wider files keep reason-first sentences such as
  "the chain is not complete; …".
- **Allowlist, named in the test file with a reason each:** non-message literals (regex sources, value arrays such as
  `AGREEMENT_KINDS`, audit action names); the "Not sent" list sentences, named by key: `FILE_MESSAGES.empty`,
  `.tooLarge`, `.spreadsheet`, `.notText`, `.unclosedQuote`, `.textAfterQuote` and `.unreadable` (2.1 change 3); and
  counsel's surfaces, `lib/screening/address.ts`'s five messages, `SCREENING_BOUNCE_BUDGET` and
  `SCREENING_ZIP_MESSAGES`, until counsel rules (2.6). `NO_FILE_CHOSEN` (2.1 change 8, formerly `FILE_MESSAGES.noFile`)
  is a field message and is checked as one. The guard also fails when a `FILE_MESSAGES` key is not on this list, so a
  key added later is checked by default rather than exempted.
- **It fails first at base and lists the exact hits.** They must include `console-mail.ts:200`, `sign-in.ts:418`/`:723`,
  `console.ts:116`/`:831`/`:835`, `settings.ts:439-441`, `submissions.ts:166`/`:276`, `packets.ts:175`,
  `reconciliation/template.ts:23` and `screeningReasonMessage`'s cases. Any hit the table above does not list is fixed
  by the same rule and named in the PR description.

**Tests that move** (each with its slice):
- the builder greps each old literal across `apps/`, `packages/` and `e2e/` and updates every hit;
- `lib/routes/sign-in-routes.db.test.ts:300`, `:842`, `:968` (W2): the mismatch and code words. `e2e/sign-in.spec.ts`
  pins neither phrase and is dropped from the list. #129's new `e2e/sign-in-time.spec.ts:408` reads "the two passwords
  do not match" with `exact:false`; it survives, and #129 owns the file;
- `e2e/forms-keep-input.spec.ts:310` (W1, which owns the file): the stacked mismatch form; `:481` (W1): the
  `support.ts:249` words;
- `lib/routes/onboarding-routes.db.test.ts:538` (W1): `support.ts:249`; and its `support.ts:379` pin (W1);
  `components/fields.test.tsx:138` uses only the clause before the colon and does not move;
- `lib/screening/routes.db.test.ts:122-123`, `:158-159` (W1, `phi_column`'s "remove the column, then choose the file
  again"), `:179-181`, `:191`, `:197`, `:235`, `:478` (W1): `screeningReasonMessage`'s exact strings, each changed first
  so it fails red; `:222-228` gains the no-": " and lower-case assertion for every code (or relies on the guard), and
  both `invalid_value` variants are pinned (with the `allowed_total` field and with no field);
- `lib/screening/parse.test.ts` and `e2e/screening.spec.ts:266`, `:271` (U): the browser twins' "choose the file
  again" (2.1 Tests);
- `lib/routes/reconciliation-routes.db.test.ts` (W2): any pin of `reconciliation.ts:130`'s or `:133`'s words (the
  builder greps both);
- `lib/routes/reruns-routes.db.test.ts:316`, `:317`, `:354`, `:355` (W2): checked; they still pass with the subject-first
  `queries.ts:68` words;
- `lib/packets/view.test.ts:86`, `:101` (W2): `SAY_WHAT_IT_COUNTS` (now with "3,650 days");
- the correspondence and console message tests (W1): every pin of 2.5's changed words, the split `address_line1` and
  `address_city` rules included, changed first;
- `apps/worker/src/billing/billing.db.test.ts:665` (W2): checked, unchanged;
- `components/settings/invitations.test.tsx:37`: checked, unchanged;
- `pnpm lint:copy`: `tools/brand-copy/scan.ts:26,168` already cuts clauses at both `;` and `:`, so it behaves the same.

**Sees:** each refusal line has exactly one colon, after the field's name: "Occurred on: the date is after today; enter
the day it happened, today or earlier".

### 2.8 The shell, the skip link (slice C)

#### `components/shell.tsx`
- **Now:** there is no "Skip to" anywhere in `src`. `AppShell` has two branches (:325, :332), each with a `<main>` (:328, :353).
- **Change:**
  - Make `<a href="#content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 rounded-md bg-background px-3 py-2 text-sm font-medium ring-2 ring-ring">Skip to the content</a>`
    the first child of both branches.
  - Give both `<main>`s `id="content" tabIndex={-1}` and `focus:outline-none`. The focus shows through the landing,
    not a ring around the whole page; this is the standard pattern for a programmatic target.
  - The raw sign-out `<form>` (:112) has no fields; leave it.
- **Words:** "Skip to the content" (11.2.5).
- **Tests:** a new `e2e/skip-link.spec.ts` (slice E; it fails first at base): on a practice page, a console page and the
  settings users page, at 1280 and 390, the first Tab shows "Skip to the content", Enter moves focus to `main#content`,
  and the next Tab lands on the first control inside main. axe runs on the focused state. Its test titles cite the new
  row CI-30 (5.1; allocated by the orchestrator); CI-19 is not changed.
- **Not here:** the 12 public `page.tsx` files that render their own `<main>` under `PublicHeader` (screening,
  request-audit, the seven sign-in pages, maintenance, status, security). `PublicHeader` has one tab stop (the lockup
  link), so there is no block to bypass yet; they go to UX PR 68 (`co-001/ux-skip-and-rail`), which already lists
  `public-header.tsx` and `sign-in/layout.tsx` (section 4, section 8).
- **Sees:** a keyboard user's first Tab shows a visible "Skip to the content" link at the top left; others see nothing.

### 2.9 The e2e helpers and the random tag (slice E)

- **Now:** `e2e/onboarding.spec.ts:78`, `:357` and `e2e/mail-cutoff.spec.ts:65` use `randomUUID().slice(0, 8)` in a
  name the no-patient-information check reads. About 1 run in 40,000 draws an 8-digit date and is refused.
- **Change:** add `runTag()` to `e2e/helpers.ts`. It returns 8 lower-case letters from `randomBytes`, never digits. Use
  it at the three sites. The other sites (`e2e/ledger.ts:61`, `mail-notices.spec.ts:21`, `mapping.spec.ts:83`) also
  move, so there is one pattern.
- **Tests:** a unit assertion in the spec's setup: `runTag()` matches `/^[a-z]{8}$/`.

---

## 3. Decisions taken

The founder's standing rule (2026-10-18) applies: build the best option, never weighted by build effort.

1. **The upload form adopts the shared core, not local patches** (2.1). Local fixes to 7.8's three gaps would leave a
   second refusal pattern, a second name table, no dropped-connection handling and no stale lead. Adopting the core gives
   the one pattern everywhere, deletes ~90 lines, and closes the data-loss gap. *Security:* the form becomes
   `method="post"` with no action, so no field value ever reaches a URL, and without JavaScript nothing is screened;
   the file stays in memory, and nothing new is stored. The safer option.
2. **The audit link stays, through `renderMessage`** (2.1), restricted to form-wide items, so a field's message can never
   be rewritten into a link. The narrower API is the safer one.
3. **No person mark on the screening.** The route is public and reads no session, so there is no other person to clear
   for. Adding the hook would be dead code that looks like protection.
4. **`stale` on the screening gets its own origin lead, with no refresh** (2.1 change 9). The route's only `stale` is a
   failed origin check, which a refresh cannot repair, so the core's "It is up to date now" lead would be false. The
   `STALE` words in `next.ts` stay for other forms' posts without JavaScript; the comment is updated (2.1).
5. **One separator rule now, across every message** (2.7), not a partial pass. A partial pass leaves two styles, which is
   why U-UX-7 deferred it until after #42. It is now unblocked, and a guard test keeps it true. The 10.3 table's
   colon-joined wordings are superseded by semicolons (the ADR amendment records this). *Alternative rejected:* changing
   the summary's joiner (for example to an en dash) would touch every e2e that reads "Name: message" and break the shared
   "Error:" pattern.
6. **The Ticket example is "1042", not "SYN-1234"** (2.2): it matches what Support tickets shows.
7. **The email message names the staff "PaidWhole staff"** and the step names the card and button the person will use
   ("create a support grant from the ticket under Support"). Of the two drafts, "to give support access" is kept,
   because it names what the administrator was trying to do.
8. **contactEmail drops "work"** from one draft: the route does not require a work address, and the message must not
   claim a rule that is not checked.
9. **The skip link is in scope** (7.8 lists `shell.tsx`; the change is small; no open PR or 4b touches the file). Two
   queued UX PRs do: UX PR 67 (header menus) and UX PR 68 (`ux-skip-and-rail`, which plans the same link, UX-083).
   This PR takes the AppShell link and asks the orchestrator to strike the AppShell part of UX-083 from PR 68, which
   keeps the public header's link (section 8).
   **Loading frames are not**: keeping the shell while loading needs the shell moved into area layouts, a design of its
   own (4).
10. **The Members table goes into a `ScrollTable`; the two-copy Invitations form is documented, not fixed here.** The fix
    (one key and pin shared across copies) is the 34th UX PR's mechanism; doing it here for one page would fork that
    design. ADR 0077's "Not covered" is extended now to name this page (it is about `StackedRows` and misses a
    hand-written two-copy form), because an incomplete "Not covered" is a security record that misleads. Both tables
    go into `ScrollTable`, which closes the `app/tables.test.ts` exemption.
11. **One new matrix row: the skip link (CI-30, the CI series, beside CI-19).** The orchestrator allocated CI-30 on
    2026-11-07 at 01:19 UTC, in the series this design recommended. CI-19 ("Header controls named by their visible
    text", WCAG 2.5.3) is a different behaviour from a skip link (WCAG 2.4.1), so CI-19 stays as it is. The new browser
    cases are FRM-03/04/05's, the guard test is FRM-04's, and the screening's no-JS step is FRM-06's (5.1).
12. **The convert form's words change with the other public forms** (2.6). They share `requiredText(200)` and
    `NO_PATIENT_INFORMATION`; dropping them would leave the result page out of step. No result-screen file is edited;
    the 4b session is told (section 8).
13. **The console practices page's `SETTINGS_LABELS` table is kept** (`app/console/practices/[practiceId]/page.tsx:29-40`;
    the status file's proposals; build-2b review :243). Its `satisfies Record<keyof PracticeSettingsInput, string>`
    catches a missing label at compile time, which the page's labels alone would not. This PR edits only that page's
    ZIP hint (:102) and leaves the table as is; this closes the proposal.
14. **Legal surfaces are not reworded** (2.1, 2.6): the screening's address messages and the kept-upload hint keep
    counsel's wording until counsel rules, and the guard names them.

---

## 4. Out of scope, and where each goes

| Item | Where |
| --- | --- |
| The Notice PR: `?notice=` as a focused `role="status"` (`ArrivalNotice` pattern, ~20 pages; users page :41-46, `cases/page.tsx:62`) | its own PR (11.2.2), all pages at once |
| `noValidate` on ActionForm | after this PR merges: every message then gives a step (ADR 0077:207, :277) |
| Loading frames that keep the shell (40 `loading.tsx` files render their own `<main>`); 11.2.4's `aria-busy` is recorded as superseded by #74 | a layout design PR |
| The Invitations `ResendForm` in both copies: one key and pin | the 34th UX PR (ADR 0078 D5), which has to extend its mechanism beyond `StackedRows` to reach this page |
| `csrf_refused` with a reason (11.2.8) | its own security PR after #129 (`http.test.ts` is in #129) |
| Combined audit #103 citing FRM-01/07/05 | PR 7 / #103 |
| Tour states `error-duplicate`, `error-cleared`, a refused grid form and a refused row form | `tools/lane-b-screen-tour` on claude/build-ops |
| A static test that every non-public ActionForm renders FormKeys (allowlist derived from the route registry's public routes) | its own PR (a security-adjacent test deserves its own review) |
| The console's End membership without a confirmation (`console.ts:769-777`) | a proposal: give it the settings page's confirmation |
| `documentRef`'s `pattern` and a format hint on the console organization page | a proposal (that page is not otherwise changed) |
| The support hint "from the page's address" (12.2 open 4) | needs a ruling |
| RadioGroup; CheckboxGroup's `id` and per-box message; a column layout for long checkbox labels | a field-components PR |
| Text typed before hydration (S-SEC-2 edge a) | its own design |
| `FORMS_HARNESS_CHROMIUM` in developer docs | a docs PR |
| `settings.ts:1062`, `:1095` (Postgres rule text shown to the person) | a migration PR (not Lane B) |
| `SCREENING_ZIP_MESSAGES` | waits for counsel |
| `lib/screening/address.ts`'s five messages and `SCREENING_BOUNCE_BUDGET` in the house form (a lower-case sentence) | waits for counsel (legal surface `screening-mail-address`; Q12) |
| `apps/worker/src/billing/account.ts` in the copy lint's `COPY_FILES` (`tools/brand-copy/scan.ts:52-80`) | a proposal for the copy lint's owner (a lint-scope change outside this item's files); until then CO-11 is checked by hand there (section 8) |
| An automated check that every field message gives a step (contains "; " or starts with a listed verb, with a named allowlist) | a proposal; until then the ux-brand-reviewer checks the step by hand (2.7, 5.2 item 1) |
| A skip link on the 12 public pages under `PublicHeader` | UX PR 68 (`co-001/ux-skip-and-rail`), which lists `public-header.tsx`; or a public-frame PR that gives those pages one frame with the link and `main#content`, sharing the work with the loading frames |
| A persistent live region in `app/layout.tsx` (11.2.4) | the layout design PR, with the loading frames |
| "Pause the screening stream" (`app/console/mail/page.tsx`) is a one-press destructive action with no confirmation | UX PR 78 (`co-001/ux-console-confirm`, the console's widest actions ask for a tick) |
| The Ticket field as a choice of an open ticket | UX PR 74 (replaces 2.2's hint) |
| 12.2 open 8 (moving the split-form test) and open 10 (the split form announcing twice) | the split-form follow-up |

---

## 5. Test-matrix rows and docs

### 5.1 Test matrix
- **One new row, CI-30** (allocated by the orchestrator 2026-11-07 01:19 UTC in the CI series, beside CI-19, where the
  shell's other accessibility journey sits, as this design recommended; next free CI-31). The row goes in
  `docs/product/test-matrix.md` directly after CI-29, word for word in `matrix.ts`, with its registry entry in
  `packages/synth/src/cases/registry.ts`; `apps/web/e2e/skip-link.spec.ts` cites CI-30 in its test titles. A grep for
  the old FRM placeholder finds nothing in the design or the code:
  - Title: "The shell's skip link".
  - Text: "On a practice page, a console page and the settings users page, at 1280 and 390 px, the first Tab shows 'Skip
    to the content' in view, Enter moves focus to main#content, and the next Tab lands on the first control inside
    main; axe 4.14 with the WCAG 2.0/2.1 A and AA tags finds no violation in the focused state (WCAG 2.4.1)".
  - Registry entry: `none(0, "The skip-link journey reads the shell's first tab stop and the focus after Enter in the
    browser; no file.", ['apps/web/e2e/skip-link.spec.ts', 'apps/web/e2e/a11y.ts'])`.
  - CI-19's title, text and registry entry (`registry.ts:862`) are not changed.
- **FRM-04:** the new browser cases are FRM-03, FRM-04 and FRM-05's, whose registry entries already list
  `components/action-form.browser.test.tsx`. The guard test `lib/routes/messages.test.ts` is added to FRM-04's file list
  in `packages/synth/src/cases/registry.ts` (:917), and FRM-04's text gains, identically in `test-matrix.md`,
  `matrix.ts` and `registry.ts`: "and every field's refusal message outside a legal surface is one sentence with no
  colon of its own". It covers field messages only, so the "Not sent" list sentences the guard allowlists do not
  contradict the row.
- **FRM-06:** the screening's no-JS step (2.1) is cited by FRM-06 (`registry.ts:926`, which already lists
  `e2e/forms-keep-input.spec.ts`), and FRM-06's text gains: "; the screening upload, which posts to no action, puts no
  field value in a URL and screens nothing". No counter.
- **Three files change together.** `packages/synth/src/fixtures.test.ts:33-42` requires `packages/synth/src/cases/matrix.ts`
  to hold every row of `docs/product/test-matrix.md` word for word, so each row edit above (FRM-04 :684, FRM-06 :686,
  and the new row) is made in `test-matrix.md`, `matrix.ts` and `registry.ts` together, and `pnpm --filter @tp/synth
  test` runs in the integration step.
- **Shared files (LANES.md rule 6):** `test-matrix.md` with #126, #129 and 4b (TBL-08); `matrix.ts` with #126, #129 and
  4b; `registry.ts` with #126. The PR that merges second keeps every side's rows, by merge, never rebase.

### 5.2 Docs
- **ADR 0077: amend, no new ADR.** Add an "Amended (co-001/ux-forms-after-42, 2026-11)" block covering:
  1. **The separator rule:** "A field's message is one lower-case sentence with no full stop and no colon of its own:
     what is wrong, then the next step, joined by a semicolon; examples follow 'such as'. The only colons in a refusal
     are the summary's '{Field}:' and the field's 'Error:'. `lib/routes/messages.test.ts` enforces the form, except for
     a legal surface's wording until counsel rules; the step is reviewed by hand. The 'Not sent' list items are full
     sentences and stay outside the rule." (The colon after "of its own" is the ADR's prose, not a message.) This
     supersedes 10.3's colon-joined wordings.
  2. **"Not covered", extended:** keep the `StackedRows` bullet's mechanism and its sentence "No page renders a row form
     in both copies of `StackedRows` yet", and add: "Outside `StackedRows`, the settings users page's Invitations
     section (exempt from `StackedRows`, ADR 0078) renders `ResendForm` twice since #42, in a hand-written `sm:hidden`
     list and a `sm:table` table, each with its own `FormKeys`. A press dropped in one copy and repeated in the other
     after a resize or rotation sends a fresh key. The 34th UX PR's shared key and pin is to cover this page too, which
     means extending its mechanism beyond `StackedRows`." Section 4's row says the same.
  3. **The screening upload is on the core:** a public route, so `stale` means only a failed origin check, which gets
     its own lead and no refresh; no request key, no `duplicate` and no person mark. The form is `method="post"` with no
     action: no field value ever reaches a URL, and without JavaScript the file is never sent and nothing is screened.
  4. **11.2.4's `aria-busy`:** recorded as superseded (the loading state announces through `role="status"`).
  5. **Legal surfaces:** the separator rule applies to every message "except a legal surface's wording, until counsel
     rules" (`lib/screening/address.ts`, `SCREENING_BOUNCE_BUDGET`, `SCREENING_ZIP_MESSAGES`).
- **`docs/brand/BRAND.md`:** one words line: "A refusal names the field once, then says what is wrong and what to do in
  one sentence, with no colon inside it." #129 edits this file, so whichever merges second keeps both.
- **`.claude/agents/ux-brand-reviewer.md`:** not edited. #129 edits it; re-read it after #129 merges, before the review.
- **No ADR 0056 or PRD change.** `docs/product/domain-model.md` is not regenerated (no migration).

---

## 6. Build slices and order

Each file has one owner, so the slices' file sets are disjoint and U, C and W1 build in parallel; W2 follows W1 for the
guard test only. Heavy commands run under `flock /tmp/laneb-heavy.lock`.

| Slice | Files | Depends on |
| --- | --- | --- |
| **U, upload** | `components/screening/upload-form.tsx`, `upload-form.test.tsx`, `app/screening/page.tsx` (passes `appOrigin`), `lib/screening/messages.ts` (`NO_FILE_CHOSEN`, `FILE_MESSAGES.unreadable`, and :83, :95's "choose the file again"), `lib/screening/parse.test.ts` (:321-437 pins of :83/:95), `components/form-issues.tsx` (+ `form-issues.test.ts`), `lib/http/next.ts` (comment), `components/form-hints.test.ts`, `components/test-support/forms-harness.tsx`, `components/action-form.browser.test.tsx`, `e2e/screening.spec.ts` (hunks at :242, :265-273 and the reason-literal hits only) | none |
| **C, pages and shell** | `app/console/support/page.tsx`, `app/settings/organizations/[organizationId]/users/page.tsx`, `app/tables.test.ts`, `app/console/mail/page.tsx`, `components/shell.tsx` | none (U removes C's allowlist entry; land U's test with C) |
| **W1, the #42 words** | `lib/zip.ts`, `lib/zip.test.ts`, `lib/routes/settings.ts` (every row in 2.4, 2.5 and 2.7 marked W1), `console.ts`, `onboarding.ts`, `schemas.ts`, `support.ts` (:249, :379), `lib/screening/routes.ts` (2.4, 2.6, `screeningReasonMessage`, and `screeningPage`'s `appOrigin: services.origin` for slice U), `packages/packets/src/correspondence.ts` (+ `correspondence.test.ts`), `apps/worker/src/support/support-mail.ts`, `support-mail.db.test.ts`, the four ZIP pages (pricing, correspondence, console organization, console practice), `components/fields.test.tsx`, `components/console/suspension-card.test.tsx`, `settings-routes.db.test.ts`, `console-routes.db.test.ts`, `onboarding-routes.db.test.ts`, `screening/routes.db.test.ts`, `e2e/forms-keep-input.spec.ts` (including U's no-JS screening step and :310, :481) | none |
| **W2, separator pass** | `lib/routes/reconciliation.ts`, `mapping.ts`, `console-mail.ts`, `sign-in.ts`, `compliance.ts`, `packets.ts`, `submissions.ts`, `lib/reconciliation/template.ts`, `lib/packets/view.ts`, `lib/triage/queries.ts`, `apps/worker/src/billing/account.ts`, their tests (`sign-in-routes.db.test.ts`, `view.test.ts`, `reruns-routes.db.test.ts` checked), new `lib/routes/messages.test.ts` | its edits in parallel; the guard test lands after W1 (it reads W1's files) |
| **E, e2e and records** | `e2e/helpers.ts`, `e2e/onboarding.spec.ts`, `e2e/mail-cutoff.spec.ts`, `e2e/ledger.ts`, `e2e/mail-notices.spec.ts`, `e2e/mapping.spec.ts`, new `e2e/skip-link.spec.ts`, `docs/product/test-matrix.md`, `packages/synth/src/cases/matrix.ts`, `packages/synth/src/cases/registry.ts`, `docs/adr/0077-…md`, `docs/brand/BRAND.md` | after C (skip link) and W1 (ZIP words); the new row is CI-30 (allocated) |

**Order:**
1. U, C, W1 and W2's edits in parallel. W2's guard test is written against the base and fails first, listing every hit;
   it is finished after W1 lands.
2. E.
3. Integration: `pnpm typecheck`, `pnpm lint`, `pnpm lint:copy`, `pnpm lint:logs`, `pnpm test`, `pnpm test:db`,
   `pnpm --filter @tp/synth test` (`fixtures.test.ts`, matrix word for word), the browser harness, `pnpm test:e2e`
   (screening, onboarding, mail-cutoff, forms-keep-input, sign-in, skip-link, contracts, hardware-key,
   screening-phone), `tools/test/legal-surfaces.test.ts`, `pnpm verify-content`, and `pnpm synth --all` (0 written).
4. The screening-capacity gate runs (`upload-form.tsx`, `form-issues.tsx`, `field.tsx`, `next.ts`, `lib/zip.ts`,
   `screening/routes.ts` and `onboarding.ts` are watched, `tools/screening-capacity/watched-paths.txt:40-56,90,97,109,122`).
   No new module is imported, so the list itself is unchanged.
5. Before opening the PR, merge `claude/build-platform` into the branch (rule 6) if #126 or #129 has merged.

---

## 7. The screen-tour shot list

- **Ids** are `<key>.<variant>.<width>`, with `-dark` for the dark shot.
- **Each id** is taken at 1280 light, 390 light and 1280 dark, with `TOUR_REF=31a7345f` (base) and then the head.
- **Refused states are listed explicitly.** States marked *new* need the tour change below.

| Change | Shots |
| --- | --- |
| Upload form | `screening.default`, `screening.file-ready`, `screening.error-member-id`, `screening.error-dos`, `screening.error-zip`, `screening.error-no-phi` (tour.spec.ts:1733-1790); `screening.loading` (*new reach*: `capHeld`'s `busy: /^Sending/` at :1793 becomes `/^(Sending|Working)/`, since at the head the button keeps "Screen the file" and `PendingStatus` says "Working…"); `screening.error-unconfirmed` (*new*: abort the upload POST with `page.route`, as `support.error-unconfirmed` does at :2187; nothing is sent); `screening.no-javascript` (*new*: a `javaScriptEnabled:false` context, the `<noscript>` line). `screening.loading-reading` stays unreachable (:1795) |
| Convert form (result page) | `screening-result.default` and `screening-result.error-name` (:1800, :1838-1855; "your name, at most 200 characters" becomes "fill this in"). The tour declares only `screening-result.default.1280-dark`, so `screening-result.error-name.1280-dark` needs a tour id (*new*). The locations and payers refusals are covered by `routes.db.test.ts`, not by a shot |
| Ticket hint | `console.support.default`, `console.support.error` (:2120-2134) |
| Help desk refusal (`support.ts:249`) | `support.error` (:2161-2173) |
| Users page | `settings.users.default`, `settings.users.error`, `settings.users.end-membership-ticked`, `settings.users.notice-invited` (:2325-2350); the 390 shots show both tables' `ScrollTable` |
| Email and other console words | `console.organization.error` (:1966-1977), `console.organization.default` (ZIP hint) |
| ZIP | `console.practice.default`, `console.practice.error` (:1987-1998), `p.pricing-settings.default`, `p.pricing-settings.error` (:3759 on), `p.correspondence.default` (:3712) and `p.correspondence.error` (*new*: a refused ZIP and phone, so the converted correspondence words show) |
| Separator pass | `console.compliance.error`, `sign-in-mfa.error`, `sign-in-new-password.error-mismatch` (:1526), `request-audit.error` (the no-patient-information state, :1393-1400) |
| Mail resume | `console.mail.default` and `console.mail.resume` (*new key*: no `console.mail` state exists in tour.spec.ts today; the default page and the Resume form open, to confirm no visible change and the select's description) |
| Skip link | new state `interaction:skip-link-focused` on `p.cases.default`, `console.organizations.default`, `settings.users.default` |

**Size:** 35 ids, so 105 captures per ref and 210 across base and head (fewer where a dark id is not declared).

**The tour change:** one commit on `claude/build-ops` in `tools/lane-b-screen-tour/capture/tour.spec.ts` adds the *new*
states above (`screening.loading`'s busy pattern, `screening.error-unconfirmed`, `screening.no-javascript` asserting the
`<noscript>` line's exact words from 2.1 change 13,
`screening-result.error-name.1280-dark`, `p.correspondence.error`, `console.mail`, `interaction:skip-link-focused`). This
item is read-only on build-ops; the Lane B tour owner writes that commit before the head capture, and the orchestrator
assigns it.

**Not reachable:** a refused confirmation on the users page (`required` stops the press) and the screening's `stale`
(an origin failure the tour cannot produce from its own origin; covered by the browser test).

---

## 8. Risks and conflicts with open PRs, 4b and the queued UX PRs

| Risk or conflict | Hold |
| --- | --- |
| **S5's 4b.** `co-001/ux-screening-result-words` is not pushed and not on this machine (no remote matches "4b" or "screening-labels"; `ux-screening-result-tables` and its wip branch are already contained in claude/build-platform). Its files: `components/screening/anomalies.tsx`, `result-summary.tsx`, `result.test.tsx`, `lib/screening/labels.ts`, `labels.test.ts`, `e2e/screening.spec.ts` at :509 and :517, and TBL-08 in `test-matrix.md` and `matrix.ts`. | This PR edits no result-screen file (also untouched: `coverage.tsx`, `result-view.tsx`, `result-tables.test.tsx`, `table-parts.tsx`, `opened-signal*`, `convert-form.tsx`). The result page's convert-form refusal words change through `lib/screening/routes.ts:1272`/`:1274`/`:1278`/`:1284` only (2.6), so 4b's result-page shots in an error state may differ: S5's 4b session is told (route file only; no 4b file touched), and asked to expect the words in `e2e/screening.spec.ts` if it comes to assert the convert refusal (it does not today). Shared files: `e2e/screening.spec.ts` (this PR edits only :242, :265-273 and the reason-literal hits, separate hunks), and `docs/product/test-matrix.md` and `packages/synth/src/cases/matrix.ts` (4b's TBL-08; rule 6). Whichever merges second merges, never rebases. |
| **#126** (ledger interest, d2fdd106) | Shared: `docs/product/test-matrix.md`, `packages/synth/src/cases/matrix.ts`, `packages/synth/src/cases/registry.ts` (slice E's row edits and the new row, rule 6). Not shared: `tools/screening-capacity/watched-paths.txt` (this PR adds no module), `lib/routes/specialist.ts`, the reconciliation page (W2 changes `lib/routes/reconciliation.ts`, which #126 does not touch). |
| **#129** (sign-in time and brand email, f4fef908) | Shared: `docs/product/test-matrix.md`, `packages/synth/src/cases/matrix.ts` and `docs/brand/BRAND.md` (rule 6 and merge). #129's new `e2e/sign-in-time.spec.ts:408` reads the mismatch words with `exact:false` and survives 2.7's change; #129 owns that file. Read but not edited here: `.claude/agents/ux-brand-reviewer.md`, re-read after #129 merges. Not shared: `http.test.ts` (11.2.8 stays out), `sign-in/forgot-password/page.tsx`; `lib/routes/sign-in.ts` is not in #129. |
| **Queued UX PRs, all "after #42"** (`designs/lane-b-ux-review.md`) | This PR closes parts of their findings; the orchestrator is asked to strike these from the queued PRs: **UX PR 67** (`ux-header-menus`): shares `shell.tsx`; the skip link sits before the header menus. **UX PR 68** (`ux-skip-and-rail`): plans the same skip link (UX-083); this PR takes the AppShell link, PR 68 keeps `public-header.tsx`, `sign-in/layout.tsx` and the rail; it also lists `console/support/page.tsx`. **UX PR 74** (`ux-console-support-page`): shares `console/support/page.tsx` and `console.ts`; this PR closes UX-077's hint part only, and PR 74's ticket-as-a-choice later replaces the free-text field and its hint. **UX PR 75** (`ux-users-page`): shares the users page and `settings.ts`; this PR closes UX-011's users-page part (both tables in `ScrollTable`; `app/tables.test.ts`'s line naming PR 75 is deleted here), and PR 75's StackedRows later replaces the tables. **UX PR 78** (`ux-console-confirm`): shares `console.ts`, `console/support/page.tsx`, the users page and `screening/routes.ts`; it takes the pause confirmation (section 4). **UX PR 83** (`ux-settings-words`): shares `settings.ts`; this PR's next-step messages close UX-050's two messages if they are among 2.5/2.7's rows (the orchestrator checks). **UX PR 84** (`ux-screening-upload-page`): shares `upload-form.tsx`, `messages.ts` and `routes.ts`; this PR moves the form onto the core and closes UX-087's file-field part. **UX PR 85** (`ux-screening-messages`): shares `messages.ts` and `routes.ts`; this PR's `screeningReasonMessage` and ZIP sentence work overlaps UX-113/UX-154; `SCREENING_ZIP_MESSAGES` stays PR 85's (founder and counsel). Each later PR rebuilds on this one's words. |
| Re-sending a screening after "Not confirmed" | `submit_screening()` replaces any earlier screening of the same practice, and `screening_result_once` keys the result. The builder confirms in a db test that a second identical send after a dropped first one creates one result and sends one result mail. If it sends two mails, the unconfirmed lead must say so, and the security reviewer rules. |
| The separator pass changes words that e2e and db tests pin | The builder greps every old literal. The guard test prevents a regression. Tests import constants where one exists. |
| The PHI-guard message moving to `schemas.ts` | Only the message text and its import move; the detector and its call sites are unchanged (the second review checks the diff). |
| Copy lint on new words | `pnpm lint:copy` covers apps/web/src, packages/packets/src and `support-mail.ts`. CO-11: no new word says owed, underpaid, recovered or AI. `apps/worker/src/billing/account.ts` (W2's :349 message) is outside `COPY_ROOTS` and `COPY_FILES` (`tools/brand-copy/scan.ts:52-80`), so the builder and the ux-brand-reviewer check CO-11 on its new words by hand; adding the file to `COPY_FILES` is outside this item's files and is proposed in section 4. |
| UX PR 85 and the browser's twins of the screening messages | `lib/screening/messages.ts:83`/`:95` take "choose the file again" in this PR (slice U), so the server and browser surfaces never use two verbs for one action; PR 85, which shares `messages.ts`, rebuilds on these words. |
| Capacity gate runtime | It runs on this PR (watched files). Nothing changes server-side cost except message strings. |

---

## 9. The review plan

- **UX and brand review** (the `ux-brand-reviewer` agent, `.claude/agents/ux-brand-reviewer.md` re-read at the merged
  head after #129):
  - Every new or changed string in section 2 is read against `.claude/rules/brand.md`, BRAND.md and CO-11: one name per
    thing, a next step in each refusal, no validator text, curly apostrophes.
  - The tour's before and after shots in section 7 at all three captures.
  - The keyboard path through the upload form (press while reading, refused file, stale) and the skip link.
  - The new words that need its check: the screening's origin lead (against brand.md and CO-11), the read-failure line
    (`FILE_MESSAGES.unreadable`), the new "Not sent" lead, the `<noscript>` line, `screeningReasonMessage`'s sentences
    (each with its step), the browser twins' "choose the file again", and 2.7's reconciliation and compliance words.
- **A second review: yes.** This PR touches:
  - a PHI-adjacent public form's submit path (`upload-form.tsx`: what is sent, what is kept after a dropped connection,
    nothing stored or logged);
  - the no-patient-information message's source (`schemas.ts`, `screening/routes.ts`, `onboarding.ts`);
  - sign-in's refusal words (`sign-in.ts:151,418,638,723`);
  - the legal-surface marker in `upload-form.tsx` (kept word for word) and the guard's exemption of counsel's wording.

  A security and privacy reviewer checks four things:
  1. The upload's file stays in memory only; no field value ever reaches a URL (the form is `method="post"` with no
     action), and without JavaScript nothing is screened (the no-JS e2e step, 2.1).
  2. `stale` on the public route maps only from the origin check; its lead claims no refresh, asks the person to fill
     in the form again at `{appOrigin}/screening`, and takes `appOrigin` from the server's configured origin
     (`services.origin`), never from `window.location`.
  3. The no-patient-information detector and its call sites are unchanged.
  4. The sign-in changes are words only, with no change to the step, lock count or outcome.

  It also rules on the re-send after "Not confirmed" (section 8). No money logic is touched; `account.ts` changes one
  message's punctuation only.
- **Not needed:** a migration or domain-model approval (no schema), or a dependency review (none added).

---

## 10. Review dispositions

The review of 2026-11-07: 17 review findings (R1-R17), each put to two skeptics, and a critic's 11 findings (C1-C11),
each checked against the tree at 31a7345f (and `claude/build-ops` 651ededf for the tour) by the applier. Votes are the
two skeptics' (confirm or refute).

| Finding | Severity | Votes | Disposition |
| --- | --- | --- | --- |
| R1 the upload form sends a GET with every field in the URL without JavaScript | blocking | 2 confirm | Applied: `method="post"`, no action (2.1 change 3); `<noscript>` line (change 13); unit pin and no-JS e2e step under FRM-06 (2.1 tests, 5.1); wording in 3.1, 5.2 item 3 and 9 check 1 corrected |
| R2 `screeningReasonMessage` stacks a second colon | blocking | 2 confirm | Applied: its cases in the 2.7 table as lower-case, row-first clauses (W1); the guard calls it for every code; its `routes.db.test.ts` pins and the e2e grep listed |
| R3 the guard misses zod messages | should | 2 confirm | Applied: the guard's files and message positions (a)-(f) named in 2.7, with an allowlist and the base-failure list; `settings.ts:439-441` added to the "enter at most" pass; `console.ts:831/835` hints aligned with `compliance.ts:142` |
| R4 `support.ts:249`'s colon message | should | 2 confirm | Applied: 2.7 row (W1, keeps "record’s ID"); `onboarding-routes.db.test.ts:538` and `forms-keep-input.spec.ts:481` in the moving tests, both W1's (C9 settles ownership) |
| R5 the correspondence form half converted | should | 2 confirm | Applied: every `correspondenceForm` message and `CORRESPONDENCE_FIELD_RULES` entry converted in 2.5; the packets test pins every rule; `correspondence.ts` in the guard, with a verb-first rule limited to the field-rule maps and the correspondence/settings zod messages |
| R6 `settings.ts:752`'s "four digits" | should | 2 refute | Refuted: `shownZip`/`shownZipPlusFour` are hidden inputs filled from the stored location (`pricing/page.tsx:115-116`), reached only by a tampered request; the proposed "enter … or leave it blank" would tell a person to edit a field they cannot see. Recorded as left alone in 2.4 |
| R7 `account.ts` cited at the wrong line | should | 2 confirm | Applied: `account.ts:349`; `billing.db.test.ts:665`/`:666` noted as checked |
| R8 the convert form's words reach the result page | should | 2 confirm | Applied: rows kept (decision 12); `screening-result.default`/`.error-name` in section 7 (dark id requested); section 8's 4b row reworded and 4b told; 2.6 Sees names the result page |
| R9 the stale lead claims a refresh that cannot help | should | 2 confirm | Applied: no `RefreshAfterRefusal`; a `stale="origin"` lead (2.1 change 9, words); decision 4, `next.ts` comment and ADR item 3 updated; browser case asserts no refresh |
| R10 `aria-disabled` while reading | should | 2 confirm | Applied: `aria-disabled={pending || undefined}` (change 5); browser cases split into before-press and after-press |
| R11 a stale file sent, and a stuck guard | should | 2 confirm | Applied: `read()` returns `{ file, result }` with a loop to the chosen file; read failure becomes a local problem; try/finally clears `inFlight`; two browser cases |
| R12 the file input's attributes fought over with `markByHand` | should | 2 confirm | Applied: `aria-invalid` keyed on local and server problems; exact `aria-describedby` orders; browser case; `markByHand`'s comment extended |
| R13 the skip link loaded onto CI-19 | should | 2 confirm (one says a new FRM row, one a new CI row) | Applied: CI-19 unchanged; one COUNTER REQUEST, with a placeholder FRM id and the series left to the orchestrator and the CI a11y series recommended; text and registry entry in 5.1; 2.8 and decision 11 updated; CI-30 allocated 01:19 UTC, placeholder replaced (K6) |
| R14 the singular-lead test cannot fail first | should | 2 confirm | Applied: the static case kept as a regression pin; the failing-first case moved to `action-form.browser.test.tsx` on the harness form |
| R15 stale lines and citations | nit | 2 confirm | Applied: `shell.tsx` :325/:332; #129 head f4fef908; `ALLOWED` and `SMALL_ALLOWED` named apart; the Download button's describedby |
| R16 ADR wording and "Error: Choose…" | nit | 2 confirm | Applied: ADR 0077's StackedRows sentence kept and the users page added as "outside StackedRows" (1.2, 3.10, 4, 5.2); `noFile` becomes "choose the file to screen" in place; the guard checks field messages for a leading capital and a full stop |
| R17 the public pages' skip link and `SETTINGS_LABELS` | nit | 2 confirm | Applied: the public pages go to UX PR 68 (2.8, section 4); `SETTINGS_LABELS` kept by ruling (decision 13), closing the proposal |
| C1 `app/tables.test.ts` fails when Members is wrapped | blocking | critic; confirmed (`tables.test.ts:33`, users page :52, :132) | Applied: both tables in `ScrollTable`, the `AFTER_42` line deleted, `tables.test.ts` in slice C (2.3, 6) |
| C2 `matrix.ts` must change with `test-matrix.md` | blocking | critic; confirmed (`fixtures.test.ts:33-42`) | Applied: `matrix.ts` in slice E and section 8 (shared with #126, #129, 4b); `pnpm --filter @tp/synth test` in the integration step (5.1, 6) |
| C3 the upload form's legal surfaces | blocking | critic; confirmed (`upload-form.tsx:74`, `address.ts:17-44`, `legal-surfaces.md:21,25`) | Applied: the marker and `UPLOAD_EMAIL_HINT` kept (2.1 change 1); `address.ts`'s five messages and `SCREENING_BOUNCE_BUDGET` left alone (2.6, 4); ADR exception (5.2 item 5); guard allowlist; questioned-address browser case; `legal-surfaces.test.ts` in the integration step |
| C4 queued UX PRs claim the same files | should | critic; confirmed (`lane-b-ux-review.md`), and widened: UX PR 68 plans the same skip link, UX PR 84 the same upload form | Applied: one section 8 row for UX PRs 67, 68, 74, 75, 78, 83, 84 and 85, with what to strike |
| C5 shot list gaps | should | critic; confirmed (`busy: /^Sending/` at :1793; no `console.mail` key; `support.error` at :2161) | Applied: `screening.loading`, `screening.error-unconfirmed`, `support.error`, `console.mail` added; the build-ops commit and its writer named (7) |
| C6 `renderMessage` before placement | should | critic; confirmed (`form-issues.tsx:597-608`; the test file is `.ts`) | Applied: the condition `read !== null && …` or `NO_FIELD`; the case moved to the browser test; file name corrected |
| C7 the held-invitation words change who acts | should | critic; confirmed (`settings.ts:902`, :1125) | Applied: "…release it and send the invitation again"; `invitations.test.tsx:37` checked |
| C8 the moving-tests list misses pins | should | critic; confirmed (sign-in-routes.db.test.ts, reruns-routes.db.test.ts, suspension-card.test.tsx, view.test.ts) | Applied: each named with its slice; `e2e/sign-in.spec.ts` dropped; `queries.ts:68` subject-first, keeping the regex; #129's reader recorded |
| C9 the slices are not disjoint | should | critic; confirmed | Applied: one owner per file; W1 owns `settings.ts`, `screening/routes.ts`, `support.ts`, `forms-keep-input.spec.ts`, `onboarding-routes.db.test.ts`; W2's guard lands after W1 (6) |
| C10 unplaced proposals and #42 surfaces | nit | critic; confirmed (`console-mail.ts:200`, users page :58, :138) | Applied: the live region and the pause confirmation in section 4; `console-mail.ts:200` as "choose why it can resume; …"; the empty headers named with `sr-only` text |
| C11 the Ticket hint's rationale | nit | critic; confirmed (`20261015140000_tenancy.sql:125`; e2e fills `SYN-CON-E2E`, `SYN-E2E-1`) | Applied: 1042 kept with the corrected reason; UX PR 74's replacement noted (2.2) |

**The re-check of 2026-11-07** (K1-K13), each finding confirmed against the tree at 31a7345f with refined fixes; none
refuted. The applier checked the facts the fixes rest on: `services.origin` is what `sameOrigin` compares
(`invoke.ts:382`, `config.ts:331`); `FIELD_NAMES` and the "a column" default (`screening/routes.ts:228-242`); the client
twins at `messages.ts:83`, `:92`, `:95`, `:195`, `:199-207`; `reconciliation.ts:130`, `:133`; and the narrative scanner's
thousands comma (`packages/packets/src/scan.ts:474`).

| Finding | Severity | Disposition |
| --- | --- | --- |
| K1 the origin lead is unclear ("its own address") and implies a retry here works | should | Applied (2.1 change 9, Words, Tests, form-issues, 6, 9): new words naming "PaidWhole’s own web address" and `{appOrigin}/screening` as a mono link, "fill in the form again"; `appOrigin` from `services.origin` through `screeningPage` and `app/screening/page.tsx`, never `window.location`; harness fallback sentence; kept values commented as copy-only; browser case and a static no-bare-"address" pin; ux-brand-reviewer list |
| K2 `invalid_value` reads "a allowed total" / "a a column" and has no step | should | Applied (2.7): two variants, with and without a field, each ending "correct it, or leave the row out"; pinned in `routes.db.test.ts` and the guard's direct calls (no "a a ", no "a allowed"). `messages.ts:92`'s list sentence has no article fault and stays |
| K3 phi_column keeps "upload again" against the page's "never uploaded" | should | Applied (2.7 own row, 2.1 Words/Tests, 6, 8): "remove the column, then choose the file again"; the browser twins `messages.ts:83`, `:95` changed in slice U with `parse.test.ts` and `e2e/screening.spec.ts:266`, `:271` red first; `routes.db.test.ts:122-123`, `:158-159` listed; the guard fails on "upload again" |
| K4 rewritten messages without a step | should | Applied (2.7): every screening code named in its own row with its step (`band_in_future`, `row_shape`, `band_outside_content` without a row, `no_rows`, `too_many_rows` and the rest); `reconciliation.ts:130` and `:133` with steps. The step is reviewed by hand and recorded so in ADR item 1; an automated step check is a section 4 proposal |
| K5 "one lower-case clause" contradicts the semicolon join | should | Applied (1.3, 2.1 change 8, 2.5, 2.7 header and `mapping.ts:420`, 4, 5.1 FRM-04, 5.2 item 1, BRAND.md line): "one lower-case sentence … joined by a semicolon"; FRM-04 limited to field messages outside a legal surface; the "Not sent" list items named as outside the rule. Guard assertions unchanged |
| K6 the counter is allocated | should | Applied: CI-30 at the header, 2.8, decision 11, 5.1 (after CI-29, word for word in `matrix.ts`, registry entry, `skip-link.spec.ts` titles), 6 and R13; no FRM placeholder left |
| K7 the `<noscript>` line names the privacy fact differently | nit | Applied with refinement (2.1 change 13, Words, 2.1 Tests, 7): the card's own words "read in this browser and never uploaded: only its rows of totals are sent", then "Turn JavaScript on before you fill in the form."; placement unchanged; the finding's placement and WCAG 3.3.7 claims dropped |
| K8 the action columns' sr-only words unspecified | should | Applied (2.3): "Change role or end membership" (Members, :58) and "Send again" (Invitations, :138); a column with more than one control names all of them |
| K9 the read-failure line under an untrue lead, outside `FILE_MESSAGES` | nit | Applied (2.1 changes 3 and 7, Words, Tests; 2.7 allowlist): `FILE_MESSAGES.unreadable`, words unchanged; the lead becomes "Nothing was sent. Choose the file again once each problem below is fixed:" (not a legal surface; only `e2e/screening.spec.ts:269`'s "Nothing was sent." pins it there); a read-rejection browser case asserts both, red first; for the ux-brand-reviewer. No founder ruling needed |
| K10 `noFile` escapes the field-message check | nit | Applied, preferred option (2.1 change 8, 2.7): `NO_FILE_CHOSEN` exported on its own and checked as a field message, red first against "Choose the file to screen."; the allowlist names `FILE_MESSAGES`' list keys, and an unlisted key fails. Recorded beside R16 |
| K11 the overflow line dangles; 2.6 and 2.7 disagree on :370 | nit | Applied (2.6, 2.7): "and N more problems like these; fix them too, then screen the file again" (singular "fix it too"), `routes.db.test.ts:161`, `:319` red first; 2.7 cites 2.6 and drops the wrong :329 citation; the browser's `messages.ts:195` overflow sentence left alone on purpose (a list sentence under a lead that gives the step) |
| K12 small wording faults | nit | Applied (2.5, 2.7): (a) "so they cannot also be"; (b) "of the state or territory" in both sites; (c) "the NPI’s 10 digits"; (d) `compliance.ts:142` verb-first; (e) "upload it to your compliance platform yourself"; (f) "3,650 days" (the scanner accepts the comma; only `view.test.ts:86` pins the message); (g) `address_line1` and `address_city` split into their own messages; their tests listed, red first |
| K13 document inconsistencies | nit | Applied: 5.2 renumbered so legal surfaces stay item 5 (C3's citation holds) and `aria-busy` is item 4; "the original design's 3.2/3.4/3.5/4.1" and 3.2 added to Inputs; 2.6 says "the no-patient-information detector", "guard test" kept for `messages.test.ts`; section 8's copy-lint row says `account.ts` is outside the copy lint and CO-11 is checked by hand there; adding it to `COPY_FILES` reported as a section 4 proposal |

**A second review of the applied design:** recommended, light. The applied changes add a public-form privacy fix (R1),
a new lead (R9), a guard scope (R3), a legal-surface exemption (C3) and one COUNTER REQUEST; the security and privacy
reviewer's four checks (section 9) already cover them, and the ux-brand-reviewer must check the new wordings (section 9's
list, widened by the re-check) before the build.


# co-001/ux-payer-response: the payer's letter is uploaded inside "Log a payer response", and a choice that records a fact starts unchosen

The UX baseline review's tenth pull request. Branch `co-001/ux-payer-response`, cut from `claude/build-platform` at
`165c599` (with #74, UX PR 1: `ActionForm` keeps values after a refusal and names the field; the shared `SelectField`,
`CheckboxField` and the rest; ADR 0077). Worktree `/home/user/ux-payer-response`. Every file:line below was read at
`165c599`, unless it names another commit. The requirements are UX-035 (C-065) and UX-007 (C-011) in
`designs/lane-b-ux-review.md:1629-1646` and `:1705-1722`, read whole, and #74's review finding U-UX-6
(`approval-summaries/lane-b-ux-forms-reviews.md:585-610`), the same defect, deferred to this pull request. The three
scouts' reports sit beside this file (`designs/lane-b-ux-payer-response/scout-{choices,letter,risk}.md`). Where a scout
and the code disagree, this design follows the code and says so (section 1.5).

Reserved for this PR: ADR 0085 (used: section 5), test-matrix rows CAS-45 to CAS-48 (section 4.1). No synth fixture:
each row gets a no-file registry entry in module 5 (CAS). **No migration** (section 7): four database rules and one
column are recorded for Lane A.

**Lands on** `claude/build-platform` as it stands: #74, #51 and #52, which prs.json's `dependsOn` names, are merged in
`165c599`. Two open draft pull requests change `components/uploads/uploader.tsx` (#75, #78), and #75 also changes
`app/p/[practiceId]/contracts/page.tsx`: LANES.md rule 6, the one merged second keeps both (section 3.7). #42 is open
(`6f23c42`, checked by REST: `gh pr view` is refused by the GraphQL block); no file here is one of #42's, except the
three shared documents rule 6 covers.

## Contents

1. The defects and their causes
2. The decisions
3. Files, in build slices, and what is left for Lane A
4. Tests
5. Docs: ADR 0085
6. Every string a person sees, and the screenshots
7. No migration; the proposals outside this PR
8. Risks, and what is waiting on someone

Findings answered, by section: 2.1 to 2.4 answer UX-035 whole (the two pre-answered selects, the reasons listed only
when they can be true, the server refusal, the words under Response) and U-UX-6; 2.5 and 2.6 answer UX-007 whole (the
letter uploaded in the form, the typed fields kept, the exclusion from tagging and abstraction, the letters listed on
the submissions page), with the console count left to Lane A as UX-007 says. Two defects of the same class that no
finding names are fixed here because they sit in the same form and the same files: the Channel select on "Log a
submission" (2.1) and the Document select, which preselects the practice's newest letter (2.5).

---

## 1. The defects and their causes

### 1.1 The write-off Reason arrives on "Window passed"

**What a person sees.** On a case, "Write this line off" opens on Reason "Window passed" for any line, including a line
whose window is open until 2036 (`p.case.write-off-open.1280`; UX-035). Ticking the confirmation and pressing Write off
records "Written off: Window passed, by {email}" (`app/p/[practiceId]/cases/[caseId]/page.tsx:203`), a false audited
fact.

**Where.**
- The select: `cases/[caseId]/page.tsx:222`, `SelectField … name="reason" required
  options={WRITE_OFF_REASONS.map(…)}`. `WRITE_OFF_REASONS` starts with `'window_passed'`
  (`packages/triage/src/cases.ts:93`). With no empty option the browser selects the first option, so `required` never
  fires; only the confirmation box (`:224`) must be touched.
- The route: `writeOffLineAction` (`lib/routes/triage.ts:464-495`) takes `reason: z.enum(WRITE_OFF_REASONS)` (`:471`),
  loads `caseLineState()` (`:478`), which already computes `windowPassed` with `FOR UPDATE`
  (`lib/triage/queries.ts:678-690`, the test at `:681`), and never reads it. The reopen route beside it does
  (`triage.ts:517-519`).
- The database: `case_line_rules()` checks the window only when triage writes a line off
  (`packages/db/functions/case_line_rules.sql:31-34`). A person's write-off is checked for actor and permission only
  (`:35-37`). So no layer refuses a person's "Window passed" on an open window.

**What it costs** (scout C 1.1, checked). No `line_status` row is written, so the line's stage does not move. The
trigger sets `actionable = false` (`case_line_rules.sql:41-42`); the case leaves the line out of its actionable total
and deadline, and closes `closed_written_off` when it was the last open line (`case_rules.sql:53-54`), after which no
submission is logged. The reconcile skips a written-off line from then on (`apps/worker/src/reconcile/responses.ts:54`),
so a later acceptance approves nothing for it. Only a reopen while the window is open undoes it
(`triage.ts:517-519`); if nobody notices, the underpayment is never disputed.

### 1.2 The payer response arrives on "Accepted"

**What a person sees.** "Log a payer response" opens on Response "Accepted" with "Received on" prefilled with today
(`submissions/page.tsx:283-284`). A denial pressed in a hurry is refused on **Amount**, "what the payer accepted, in
dollars and cents" (`lib/routes/submissions.ts:235-238`), which steers the person to type an amount for a payer who
accepted nothing.

**Where.** `submissions/page.tsx:283`, `options={PERSON_RESPONSE_KINDS.map(…)}` with no empty option;
`PERSON_RESPONSE_KINDS` starts with `'accepted'` (`lib/routes/submissions.ts:195`). The route's `kind:
z.enum(PERSON_RESPONSE_KINDS)` (`:225`) has no message of its own.

**What it costs** (section 2.9). The response never changes once recorded
(`packages/db/functions/payer_response_rules.sql:16-18`). The case reads Resolved at once (`case_rules.sql:69-70`). At
the next reconcile, `approveFromResponses` reads every accepted or partial response
(`apps/worker/src/reconcile/pass.ts:40`; `responses.ts:46-86`) and writes `approved` ledger entries, and
`syncLineStages` moves the lines to Payer approved (`pass.ts:45`; `ledger_line_stage.sql:33-35`). Only a specialist's
`reversed` or `adjusted` entry offsets it, and the false response stays in the record.

### 1.3 The same defect beside them: Channel and Document

- **Channel** on "Log a submission" opens on the first `SUBMISSION_CHANNELS` value (`submissions/page.tsx:75`): the way
  the practice sent the packet, recorded for good with the submission. No finding names it; it is the same defect in the
  same file (scout A section 6).
- **Document** on "Log a payer response" is `required` with no empty option (`:293-308`), over `responseDocuments()`,
  every clean payer letter or other document of the **practice**, newest first (`lib/packets/submissions.ts:330-338`). A
  hurried press links the newest letter, which can be another case's, about another patient, to an immutable response.

### 1.4 The payer's letter cannot be uploaded where the form asks for it (UX-007)

**What a person sees.**
- The card says "with its document (upload the payer’s letter on the Uploads screen first)" (`submissions/page.tsx:268`).
- With no letter on file the card shows an empty state and **no form** (`:271-276`): "Upload the payer's letter (as a
  payer letter or other document) on the Uploads screen; it appears here once it is scanned clean."
- Uploads offers only "835 remittance" and "ERA export from a practice-management system"
  (`app/p/[practiceId]/uploads/page.tsx:40-48`). The step the page names fails, and "other document" cannot be uploaded
  anywhere.
- The only path that works, and the one the e2e journey takes, is the Contracts panel: Kind of document, Payer letter,
  upload (`e2e/packets.spec.ts:473-477`; the panel offers `CONTRACT_DOCUMENT_KINDS`, `lib/routes/contracts.ts:47`).

**Where it then goes.** `listContractDocuments` takes kinds `('contract', 'exhibit', 'payer_letter')`
(`lib/contracts/contract-queries.ts:16`, `:347-359`), so the payer's answer joins "Documents to tag" (Contracts,
`lib/routes/contracts.ts:116`) and the specialist's "Documents awaiting abstraction" (`lib/routes/abstraction.ts:110`):
on PACKETS the acceptance letter sits there beside "A new contract with this payer" (UX-007;
`p.abstraction.default.1280`, the tour's note "PACKETS: the payer letter awaiting abstraction",
`tools/lane-b-screen-tour/capture/tour.spec.ts:2145`). The console's count of documents awaiting abstraction
(`console_contract_queue()`, in force from migration `20261028090000_specialist_queue_by_practice.sql:19-53`, the
count at `:34-37`) counts it too.

**Why kind alone cannot decide.** A payer letter is a legitimate contract source: `contract_version_documents_ok()`
admits it (migration `20261016160000_contracts_and_mapping.sql:291-297`), tagging accepts it
(`lib/contracts/tagging.ts:41`), and a version built on a contract and a payer's terms letter is tested
(`lib/routes/models-routes.db.test.ts:493-500`). Taking every payer letter out of abstraction by its kind would cut the
terms-letter path; the review rejected that on correction (UX-007, Notes).

### 1.5 Three defects the scouts found, confirmed here

1. **Nothing checks the document a response names.** The route takes `documentId: opaqueId`
   (`lib/routes/submissions.ts:227`); the worker inserts it as given (`apps/worker/src/packets/services.ts:756-787`); the
   trigger checks only that it is the practice's (`packages/db/functions/payer_response_belongs.sql:39-41`; scout B cited
   `:44-46`, which is the remittance check). A crafted post can link an 835, a quarantined file or a zip entry to a
   response that never changes.
2. **The Document list has no status filter.** `responseDocuments()` filters on the scan alone
   (`lib/packets/submissions.ts:332-334`). Intake records the clean verdict **before** it settles, deduplicates and sniffs
   the document (`apps/worker/src/intake/intake.ts:249`, then `:250-251` and `claimBytes`, `:124-139`), so a clean
   document can still be mid-intake, a `duplicate`, an `expanded` zip, or held `wrong_type` or `unreadable`. The contract
   lists and tagging require `status = 'stored'` (`contract-queries.ts:348`; `tagging.ts:41`).
3. **A response letter can become a contract document, and the version page then shows its pages to roles that do not
   read PHI.** `tagDocument` accepts any clean, stored payer letter (`tagging.ts:40-46`; used by
   `lib/routes/contracts.ts:225`, `file.upload`, and `lib/routes/abstraction.ts:169`, `rate_record.edit`), and the amend
   and supersede handlers take a `documentId` (`abstraction.ts:393-440`). A version's page is `practice.open`
   (`lib/routes/contracts.ts:186-192`), so the viewer and the contract specialist, who hold no `phi.read`
   (`packages/db/src/authz/permissions.ts:190`, `:200`), read the letter's pages.

**Two corrections to the scouts.**
- A database refusal of a payer response does not surface under the key `input`, as scout C says: `recordResponseOnce`
  runs inside `underPacketRules` (`lib/routes/submissions.ts:252`), which turns a database rule into the field
  `refused` (`lib/cases/refusals.ts:7-15`). The write-off's UPDATE is not wrapped, so its 23514 surfaces as `input`
  (`lib/http/invoke.ts:317-320`). Either way the database's refusal names no field the person sees, which is why the
  handler checks first (2.3, 2.6).
- Scout A's words under Response end "until a remittance pays it". A line is recovered only on `posted` or `deposited`
  ledger entries (`packages/db/functions/ledger_line_stage.sql:33-35`), which come from the practice's posting and EFT
  exports, not from a remittance. The words in 2.4 say "posted or deposited".

**Why no test saw these.** Every e2e journey, tour step and route test picks the reason, response and channel
explicitly (`e2e/triage.spec.ts:147`, `e2e/unattested.spec.ts:149`,
`e2e/export-attempts.ts:68`, `e2e/packets.spec.ts:483`; the route tests post `not_worth_pursuit`, `other`,
`info_requested` and the rest), and the e2e journey uploads the letter on Contracts, where it works. The two e2e steps
that log a submission rely on the Channel default (`packets.spec.ts:401-407`, `unattested.spec.ts:105-117`).

---

## 2. The decisions

### 2.1 A choice that records a fact starts unchosen

Four selects record a fact for good: the write-off Reason, the payer's Response, the submission's Channel and the
response's letter. Each gets an **enabled** empty first option, keeps `required`, and starts on it:

| Select | First option | Markup | The route's message when it arrives empty |
| --- | --- | --- | --- |
| Reason (`cases/[caseId]/page.tsx:222`) | Choose the reason | `defaultValue=""` | `reason: z.enum(WRITE_OFF_REASONS, 'choose the reason')` (`triage.ts:471`) |
| Response (`submissions/page.tsx:283`) | Choose the payer’s answer | `defaultValue=""` | `kind: z.enum(PERSON_RESPONSE_KINDS, 'choose the payer’s answer')` (`routes/submissions.ts:225`) |
| Channel (`submissions/page.tsx:75`) | Choose the channel | `defaultValue=""` | `channel: z.enum(SUBMISSION_CHANNELS, 'choose the channel')` (`routes/submissions.ts:139`) |
| Payer’s letter (today "Document", `:293-308`) | Choose the payer’s letter | controlled, starts `''` (2.5.2) | `documentId: z.uuid('choose the payer’s letter').transform((value) => value.toLowerCase())` (`:227`; `opaqueId`'s own message reads "Invalid UUID") |

The enum message is the zod 4 form the codebase already uses (`lib/routes/abstraction.ts:227-228`). With JavaScript, the
browser stops the press on the empty required select with its own message, because ADR 0077 keeps browser validation on
(`docs/adr/0077-…md:201-202`); a post without JavaScript, or a crafted one, gets the route's refusal named on the field,
"Reason: choose the reason", through #74's summary (`components/form-issues.tsx:416-421` resolves the key by the
control's name).

**Enabled, not disabled** (UX-035's fix says "a first, empty, disabled option"; scout A 3.2, adopted). HTML makes an
enabled first option with an empty value, in a required single select, the select's placeholder label option: while it
is chosen the select is `valueMissing`. The browser's default selection and a form reset both take the first option
that is **not disabled**, so an enabled placeholder is what the select shows on any render, with or without
`defaultValue`, after #74's remount for another person, and without JavaScript. A disabled one shows only while React's
`defaultValue=""` holds; any render without it, or a reset, lands on "Window passed" or "Accepted" again, silently. It
also needs a `field.tsx` change (`choiceOption`, `components/field.tsx:203-209`, renders no `disabled`), and its one gain,
that "Choose the reason" cannot be chosen back, prevents nothing, since `required` refuses it. The codebase's own
precedent is the enabled form: "Choose a state" (`components/screening/upload-form.tsx:169`), "Choose a reason"
(`app/console/prospects/page.tsx:115-121`), "Choose the system" (`components/uploads/uploader.tsx:356`).
`defaultValue=""` is still written, so the intent is in the markup.

**"Received on" stays prefilled with today** (`submissions/page.tsx:284`), as UX-035 rules: a date the person sees and
can change, bounded by the submission and today (`min`, `max`), and refused by the database outside them
(`payer_response_belongs.sql:32-34`).

### 2.2 The reasons listed are the ones that can be true for the line

Of the five reasons (`packages/triage/src/cases.ts:93`), only one can be checked against what the line's records hold
(scout A 1.3, checked):

| Reason | Checkable? |
| --- | --- |
| Window passed | **Yes.** True exactly when `window_ends_on IS NOT NULL AND window_ends_on < today (UTC)`, which `caseDetail()` and `caseLineState()` already compute (`lib/triage/queries.ts:592`, `:681`), and which triage's strike, the system's write-off (`case_line_rules.sql:32`) and the reopen (`triage.ts:518`; `case_line_rules.sql:55`) use. Contradicted while the window is open; unsupported while no window is known ("a window that cannot be shown open is not open", `packages/triage/src/actionable.ts:11-12`) |
| Payer correct on review, Not worth pursuit, Duplicate, Other | No: the person's judgment. Nothing stored decides them (Other says why, `cases.ts:105-111`) |

So one new module holds the rule for the page and the route alike, `apps/web/src/lib/cases/write-off.ts` (new; the list
itself stays in `packages/triage`, as UX-035's notes say):

```ts
/** The reasons that can be true for the line, in the list's order: "Window passed" only once its window has ended. */
export function writeOffReasonsFor(line: { readonly windowPassed: boolean }): readonly WriteOffReason[];

/** Why the line's own records contradict the reason, as the route refuses it; null when nothing does. */
export function contradictedReason(reason: WriteOffReason, line: { readonly windowEndsOn: string | null; readonly windowPassed: boolean }): string | null;

/** The line under Reason when "Window passed" is not offered; null when it is. */
export function withheldReasonHint(line: { readonly windowEndsOn: string | null; readonly windowPassed: boolean }): string | null;
```

The page (`cases/[caseId]/page.tsx:222`) builds the options as `[{ value: '', label: 'Choose the reason' },
...writeOffReasonsFor(line).map((reason) => ({ value: reason, label: writeOffText(reason) }))]`, with `defaultValue=""`
and `hint={withheldReasonHint(line) ?? undefined}`. On a line whose window has passed and that triage has not struck yet,
the list holds all five; on any other line, the four judgments.

**It never goes stale the wrong way.** For a given case line `windowPassed` can only turn from false to true:
`priced_line` never changes, and neither does `case_line.priced_line_id` (`case_line_rules.sql:25-28`). A page that did
not offer "Window passed" is at worst a day behind (the person reads the page again); a page that offered it is right
for good, so the route never refuses a reason the page offered.

**A contract window the engine does not compute** (CONTRACT_WINDOW_RULE_NOT_COMPUTED, `actionable.ts:12-15`): the
product's own date (`window_ends_on`, calendar days from the payment date) decides, as for the reopen and triage's
strike (scout A's recommendation, taken). A stored "Window passed" then means the same thing whoever recorded it, and
the reports that read `written_off:window_passed` stay true. A person who knows the contract's real window ended
earlier writes the line off with Other and their words. The write-off still happens, so no money or stage outcome
turns on this: a design choice, not a founder ruling.

### 2.3 The route refuses a reason the line's own records contradict

In `writeOffLineAction` (`triage.ts:464-495`), inside `if (line.writtenOffReason === null)` (`:482`) and before the
UPDATE:

```ts
const contradicted = contradictedReason(checked.data.reason, line);
if (contradicted !== null) {
  throw new InputError([{ field: 'reason', message: contradicted }]);
}
```

- **Inside the branch**, so a repeat of an earlier write-off stays the no-op it is today.
- **One state.** `caseLineState()` reads the line `FOR UPDATE OF cl` (`queries.ts:678-690`), so the check and the
  write see the same row.
- **The words name the rule, never a value** (no date: the window's end derives from the payment date; the codebase's
  refusals "name a rule, never a value", `lib/cases/refusals.ts:7-10`; CLAUDE.md: no PHI in an error message). Two
  sentences, chosen by `windowEndsOn` (section 6).
- **Field key `reason`**: #74 names it "Reason", marks the select `aria-invalid` and focuses it.
- **Postgres.** No rule exists to reuse: `case_line_rules()` checks a person's write-off for actor and `case.work` only
  (`:35-37`), though it already loads `window_end` (`:29`). The same rule there is a new migration recreating the
  function: **for Lane A** (7.2, item 1). The handler's check is complete for today's one path by which a person writes
  a line off; bulk write-off (audit #125) calls `contradictedReason` too, or waits for Lane A's rule.

The same pattern on the submissions routes: `kind` and `channel` get their messages (2.1), and the response's letter is
checked in the handler (2.6). The handler always checks first, because a database refusal names no field the person
sees: the write-off's 23514 surfaces as `input` (`invoke.ts:317-320`), and the response's as `refused`
(`underPacketRules`, `lib/cases/refusals.ts:15`; section 1.5).

### 2.4 What the words under Response say an acceptance records

Response moves to a row of its own (in the `flex flex-wrap` row with Received on and Amount, `submissions/page.tsx:282`,
a hint makes its item as wide as the row and pushes the other two down) and carries this hint, in its
`aria-describedby` through `SelectField`'s `hint` (`field.tsx:35-64`):

> Accepted and Partially accepted are recorded for good, with the amount below: the case reads Resolved or Partially
> resolved, and the recovery ledger then approves up to that amount on the lines this submission asked for (Payer
> approved). Nothing is recovered until it is posted or deposited.

Each clause, against the code:

| Clause | What makes it true |
| --- | --- |
| recorded for good | UPDATE refused (`payer_response_rules.sql:16-18`); DELETE and TRUNCATE refused (migration `20261023090000:738-739`). A later response does not take it back: the reconcile reads every acceptance, not only the latest (`acceptedPayerResponses`, `apps/worker/src/packets/services.ts:963-990`) |
| with the amount below | Amount is required for these two and refused for the others (`routes/submissions.ts:235-238`; CHECK `payer_response_amount_when_accepted`, migration `:253`) |
| the case reads Resolved or Partially resolved | The latest response decides the case while no line has reached Payer approved or Recovered: partial → Partially resolved, accepted → Resolved (`case_rules.sql:67-70`; the lines decide first, `:53-58`, which the "or" still covers). Labels: `CASE_STATE_TEXT` (`components/triage/display.tsx:18-19`) |
| the recovery ledger then approves up to that amount on the lines this submission asked for (Payer approved) | At the next reconcile, not on save (LED-01; recording does not start one): `approveFromResponses` splits the amount over the submitted version's lines by variance, each line at most what it asked less what is already approved, written-off lines left out (`responses.ts:46-86`, `:54-55`); the database refuses an acceptance above what was asked (`payer_response_within_asked`, migration `20261026090000:250-268`); `syncLineStages` then moves the lines to Payer approved (`reconcile/stages.ts:72-102`; `ledger_line_stage.sql:33-35`). "Payer approved" is the stage's label (`STAGE_LABELS`), as the log line beside it says (`submissions/page.tsx:383`) |
| Nothing is recovered until it is posted or deposited | Recovered needs `posted` or `deposited` entries that cover the approval (`ledger_line_stage.sql:33-35`); the brand rule ("Recovered" is never labelled without posted or deposited, `.claude/rules/brand.md`) |

The page already says that recording a response moves no money and no stage, and where Payer approved and Recovered
come from (`submissions/page.tsx:117-119`, the doc at `:84-100`); the hint says it where the choice is made.

### 2.5 The payer's letter is uploaded inside the form

#### 2.5.1 Where, and in what order

A new client component, `apps/web/src/components/packets/response-letter.tsx`, `ResponseLetterField`, renders the
letter's part of the form: the **Payer’s letter** select (today's "Document"), a status line under it, and the shared
`Uploader` for one payer letter. The page renders it as a child of the `ActionForm`, **first** in the form:

1. Payer’s letter: the select, its hint, its status line, then the drop zone ("Upload the payer’s letter") and, once a
   file is chosen, the uploader's batch row.
2. Response, with the hint of 2.4.
3. Received on, Amount (a wrapping row, as now).
4. Denial reason, Reopen the case (as now).
5. Notes.
6. Record the response.

**Why first.** The person has the letter in hand. Uploading it first starts the scan, which takes seconds to a minute,
while they type what it says (the answer, the date received, the amount); the letter is chosen by itself when the scan
is done (2.5.2). With the letter last they would type everything and then wait. Either order keeps what was typed
(2.5.3), and the e2e journey types before the upload to prove it.

The card's description says so (section 6), and the form **always renders** when the person logs responses and a
submission exists: the empty-state branch (`submissions/page.tsx:271-276`) goes. With no letter on file the select holds
only "Choose the payer’s letter" and its hint says to upload the letter here.

`ResponseLetterField`'s props, which slice C codes against (section 3):

```ts
export interface ResponseLetterFieldProps {
  readonly practiceId: string;
  /** The page's CSRF token (pageCsrfToken()), never the form's request key. */
  readonly csrfToken: string;
  readonly roleNames: string;
  readonly upload: { readonly canUpload: boolean; readonly gate: { readonly open: boolean; readonly reason: string | null }; readonly maxBytes: number };
  /** The letters a response may carry (responseDocuments(), 2.6), newest first. */
  readonly letters: readonly ResponseDocument[];
}
```

It renders `SelectField id="response-document" name="documentId" label="Payer’s letter" required showChosen` with
`value`/`onChange` (the field passes a controlled value through, `field.tsx:233-243`), options `[{ value: '', label:
'Choose the payer’s letter' }, ...letters]` labelled as today (`submissions/page.tsx:300-306`, the kind's words moving
from the page's `KIND_TEXT`, `:37`), `describedBy` the status line (`<p id="response-letter-status" role="status"
data-letter-status={state}>`), and:

```tsx
<Uploader
  practiceId={practiceId}
  csrfToken={csrfToken}
  roleNames={roleNames}
  canUpload={upload.canUpload}
  gate={upload.gate}
  limits={{ maxFiles: 1, maxBytes: upload.maxBytes, contentTypes: ['application/pdf'] }}
  kinds={[{ kind: 'payer_letter', label: 'Payer letter', contentTypes: ['application/pdf'] }]}
  single={{ refusal: 'Choose one PDF: the payer’s letter itself, not a zip or another kind of file.' }}
  onBatchChange={follow}
  heading="Upload the payer’s letter"
  description={`One PDF, up to ${formatBytes(upload.maxBytes)}.`}
  uploaders="Billing managers, analysts and firm principals upload files; a letter already on file can still be chosen above."
  showReceipts={false}
/>
```

#### 2.5.2 Which letter is chosen, and when

The rule (scout C's, adopted): **the form chooses only the letter it uploaded itself, and only once that letter is
stored. It never chooses "the newest letter", and never replaces a letter the person chose.**

`ResponseLetterField` follows the uploader's batch through `onBatchChange` (2.5.4) and holds `chosen` (the select's
value, `''` at first) and whether the person chose it:

| The batch | What the field does | Status line (`data-letter-status`) |
| --- | --- | --- |
| A file is uploading, or its receipt has not settled | Nothing chosen yet. While the select is still on `''`, `setCustomValidity` gives it the scanning sentence, so a press shows that sentence in the browser's bubble and sends nothing | `scanning` |
| Settled `stored` | Once the uploader's own `router.refresh()` (`uploader.tsx:253-259`) has brought the letter into `letters`, it is chosen, unless the person chose a letter themselves since the upload began | `chosen`, or `stored-not-chosen` |
| Settled `duplicate`, and its original (`receipt.duplicateOf.documentId`) is in `letters` | The original is chosen, on the same terms | `duplicate-chosen` |
| Settled `duplicate`, and the original is not in `letters` (a contract's document, another kind, or held) | Nothing chosen | `duplicate-unusable` |
| Settled anything else (held, quarantined, wrong type, unreadable) | Nothing chosen; the batch row shows the receipt's own words (`ReceiptStatus`) | `held` |
| Not sent (the PUT failed) | Nothing chosen; the batch row shows Not sent and Retry, as on Uploads | none |

A second upload replaces the first batch (`uploader.tsx:201-202`); a letter the form chose itself may be replaced by
the next one it uploads, a letter the person chose never is. The custom validity is cleared whenever the select holds a
value or nothing is in flight. The status line is a polite live region, so each change is announced once.

`responseDocuments()` lists only letters a response may carry (2.6), so a duplicate's original that is, say, a
contract's document is never offered, and the form says why instead of choosing it.

#### 2.5.3 What was typed survives the upload and the scan

- **The upload is its own requests.** The uploader posts to `/p/{practiceId}/uploads/request`, PUTs the bytes and posts
  `complete` (`uploader.tsx:205`, `:108-137`, `:166`); the `ActionForm` sends nothing while it runs.
- **Its controls are never posted.** The file input, the kind and format selects and the buttons carry no `name`
  (`uploader.tsx:324-339`, `:379-394`), so `new FormData(form)` in #74's `useGuardedSubmit` never holds them, and #74's
  summary never resolves a key to them (`form-issues.tsx:416-421` resolves by name). The file input **must stay
  unnamed** inside a form: a `name` would post the File, its name included, to the server action (2.8).
- **The page is read again in place.** When the batch settles, the uploader calls `router.refresh()`
  (`uploader.tsx:253-259`), which renders the new letter into the select. `ActionForm` is written for exactly this:
  "Still rendered, the form keeps its state" (`components/action-form.tsx:42-46`), and ADR 0077 D10 names "an upload"
  among the in-place reads (`docs/adr/0077-…md:148-160`). Two conditions hold it:
  1. The form renders in both states, with and without a letter on file (2.5.1), so React reconciles the same form and
     its fields in place when the refresh adds the first option.
  2. The fields' `defaultValue`s are stable across the refresh: Received on's `asOf` changes only at midnight UTC, and a
     field the person edited keeps its value whatever its default; a select keeps its chosen option when options are
     added, since React keys options by value (`field.tsx:203-209`). The letter select is controlled, and its state lives
     in a component that stays mounted.
- **Another person signed in on the same browser.** The refresh renders for whoever is signed in now; #74's mark then
  remounts the form's children (`useClearedForAnotherPerson`, `action-form.tsx:80`, `:86`), which clears the typed
  fields **and** the uploader's batch, file name included, and says "Form cleared". That is the right outcome, and the
  reason the uploader sits inside the form rather than beside it (2.7).

#### 2.5.4 The uploader's changes, and prs.json's "only to pass the kind"

prs.json order 10 says `uploader.tsx` "changes here only to pass the kind; UX PRs 47, 48 and 49 build the uploader's
behaviour on it". The best in-form upload needs four small changes, each additive and opt-in, none touching what UX PRs
47 to 49 build (keeping chosen files and naming them, sizes in KB, MB and GB, every kind on Uploads, the receipt's
next step):

| # | Change in `components/uploads/uploader.tsx` | Why | Without it |
| --- | --- | --- | --- |
| a | **A single kind offered shows no "Kind of document" select** (`:319-340` renders only when `kinds.length > 1`); the batch's `router.refresh()` still runs, since `kinds` is given (`:254`) | "Pass the kind": the form files the upload as a payer letter. A select with one option beside the Payer’s letter select reads as a second choice of document | Two document selects in one field; no current caller passes one kind (Uploads passes two, `uploads/page.tsx:40-48`; Contracts three, `contracts/page.tsx:217`), so nothing else changes |
| b | **`type="button"` on Retry** (`:435`) | `@tp/ui`'s `Button` renders a bare `<button>` (`packages/ui/src/components/button.tsx:40-42`), so inside the form Retry is a submit button: it would post the response, and, being before the form's own button in tree order, it would be the form's default button, so Enter in Amount would press it | A failed upload's Retry records the response |
| c | **`onBatchChange?: (batch: { readonly pending: boolean; readonly settled: readonly Receipt[] }) => void`**, called from an effect whenever `pending` (`:249-252`) or the settled receipts change | The form learns when its own upload is in flight and how it settled, so it chooses that letter (2.5.2) and holds a press while it scans | The person picks their letter from up to 50 practice-wide options named only by upload time and a SHA-256 prefix, and a re-uploaded letter is a held duplicate with no way forward |
| d | **`single?: { readonly refusal: string }`**: the file input takes one file (no `multiple`, `:383`) with `accept` from the kind's types; more than one file, a zip (`declaredType`, `:78-83`) or another type is refused in the browser with `refusal` under "Nothing was uploaded" (`:400-411`); the button reads "Choose a file" and the input's label "Choose a file to upload" | A response has one letter. A zip's letters become child documents, which a response may not carry (2.6), and the zip itself ends `expanded` | A zip uploaded in the form yields nothing to choose; "At most 1 files at once; zip the rest and upload the zip." (`:180`) |

**Decision: all four land here** (scouts B and C recommend it; the founder's standing rule takes the best option, never
weighted by build effort). (b) is a defect fix every caller gets; (a), (c) and (d) change nothing for a caller that does
not pass them. UX PRs 47 to 49 build on them unchanged. If the orchestrator holds prs.json's sentence, (a) and (b) are
the minimum (without (b) the in-form upload is unsafe), and (c) and (d) go to UX PR 47 with the outcomes in the table's
last column recorded against UX-007. Recorded under "Waiting on someone" (8.2).

Not changed: the uploader's `<h2>` headings inside a card whose title is also an `<h2>` (`uploader.tsx:314`, `:415`;
`CardTitle`, `packages/ui/src/components/card.tsx:19-21`). The Contracts panel has the same structure today; axe's WCAG
2.1 A and AA rules do not include heading order. A heading level prop is proposed for UX PR 47 (7.3).

#### 2.5.5 The kind: `payer_letter`

Kept, for these reasons (scout B 3.6, checked):
- Intake takes PDF bytes only for it (`apps/worker/src/intake/classify.ts:34`) and reads and seals its page text
  (`apps/worker/src/intake/pages.ts:20`), which the planned denial-letter reader needs (v1.5, behind its own flag,
  `apps/worker/src/packets/letter-records.ts:5-10`).
- Its receipt calls it a payer letter (`lib/uploads/receipt-labels.ts:198`), and it is what the person holds.
- It covers the letters already uploaded through Contracts, which a new kind would not.

Rejected: `other` (it takes any bytes, gets no page text, and mislabels the letter) and a new kind such as
`payer_response_letter` (a migration to widen the kind CHECK, `DOCUMENT_KINDS`, `CONTENT_TYPES`, intake's tables and the
receipts, and still blind to letters on file). A kind never changes after insert (migration
`20261016090000_documents_payers_plans.sql:205`, `:210`), so the choice is made once, at upload.

#### 2.5.6 The link, and the letters listed on the submissions page

- **The link is `payer_response.document_id`** (migration `20261023090000:239`). No new column: the response row says
  which letter is its evidence, and that is what the exclusion reads (2.5.7).
- **The log names each response's letter** (UX-007: "list them on the submissions page"). Today it says "(with its
  document)" (`submissions/page.tsx:388`). `ResponseView` gains `document: ResponseDocument | null`, read in
  `submissionsOf()` (`lib/packets/submissions.ts:110-150`) for the responses' `documentId`s, and the line reads "(with
  its document: [Payer letter, uploaded 2026-10-28 14:02 UTC], SHA-256 {hash})", the bracketed words a link to the
  letter's receipt, `/p/{practiceId}/uploads/{documentId}` (`uploadDocumentPage`, `practice.open`,
  `lib/routes/uploads.ts:131-146`), the hash through the page's `Hash` (`components/packets/display.tsx:62-71`). The
  receipt shows metadata only, and both pages are `practice.open`.
- **Audited reads.** `source_document` is a PHI table, and the contract screens read it with `readWithAudit`
  (`contract-queries.ts:352-357`). `responseDocuments()` and the log's read become audited reads too
  (`objectType: 'source_document'`, `purpose: 'case_review'`, the purpose the case screens use), which today's
  `responseDocuments()` is not.

#### 2.5.7 The exclusion from tagging and abstraction

**One clause, in one place.** `contract-queries.ts` exports

```ts
/** Not a payer's answer to a dispute: no payer response names the document (alias d). */
export const NOT_A_RESPONSE_LETTER = 'NOT EXISTS (SELECT 1 FROM payer_response r WHERE r.practice_id = d.practice_id AND r.document_id = d.id)';
```

and `listContractDocuments` adds it to its `WHERE` (`:348`), so it covers both selections (`SELECTIONS`, `:340-344`):
"Documents to tag" (Contracts) and "Documents awaiting abstraction" (the specialist's). It needs no column: a terms letter,
which no response names, stays in both; a letter becomes a response's evidence the moment a response names it, whether
it was uploaded in the form or, before this PR, on Contracts.

- **Tenancy.** Both tables are FORCE RLS on `app.practice_ids` (`source_document_tenant`, migration
  `20261016090000:181-183`; `payer_response_tenant`, migration `20261023090000:874-878`, its only SELECT policy, granted at
  `:890`). Every caller is a `practiceRoute` in the practice's own scope (`contracts.ts:116`, `:161`;
  `abstraction.ts:110`), so the subquery sees exactly that practice's responses, and the contract specialist under a
  support grant reads them as anyone in the scope does.
- **Cost.** `payer_response` has no index on `document_id` (only `payer_response_by_submission`, migration `:261`). For
  one practice's paged list the practice's rows are few; the definer function's count over every practice is another
  matter, and Lane A adds the index with it (7.2, item 2).
- **The handlers refuse it too** (CLAUDE.md: never the screen alone). `tagging.ts` exports
  `refuseResponseLetter(scope, practiceId, documentId)`, which runs `SELECT 1 FROM source_document d WHERE d.id = $1 AND
  d.practice_id = $2 AND NOT ${NOT_A_RESPONSE_LETTER}` and throws `InputError([{ field: 'documentId', message }])`
  (section 6). `tagDocument` calls it after its own document check (`tagging.ts:40-46`), which covers both tag routes
  (`contracts.ts:225`, `abstraction.ts:169`); the amend and supersede handlers call it when they name a document
  (`abstraction.ts:395-415`, `:417-440`). With 2.6's refusal the other way round, a document is a response's evidence or a
  contract's source, never both.
- **The console count** (`console_contract_queue()`, SECURITY DEFINER) is a migration: Lane A's (7.2, item 2). Until it
  lands, the console's documents-awaiting count and its list of practices with queue work
  (`lib/routes/console.ts:839`, a #42 file that needs no change) include response letters the web lists leave out; the
  pull request's description says so.
- **The Contracts panel says where a payer's answer goes.** Its description gains one sentence (section 6), the words in
  a constant beside `CONTRACT_DOCUMENT_KINDS` (`contracts.ts:47`), whose comment says a payer letter here is a terms
  letter. The page is `app/p/[practiceId]/contracts/page.tsx:205-206`, a file not in prs.json's list and changed by #75
  (rule 6); taken here because it closes the path by which response letters reached the contract lists.

#### 2.5.8 The page's upload settings and its gate

`submissionsPage` (`routes/submissions.ts:82-113`) returns `upload: { canUpload: rolesPermit(access.roles,
'file.upload'), gate, maxBytes: MAX_UPLOAD_BYTES }` and `roles: access.roles` (for `roleNames`), computed only when the
person logs responses (as `documents` is, `:106`). `canUpload` is its own check, not inferred from `canLog`, though today
the billing manager and the firm principal hold both (`permissions.ts:137-151`, `:195-198`).

The **gate** is the Uploads page's, BAA on file and the organization not suspended (`uploads.ts:107-117`), not the
Contracts panel's BAA-only gate (`contracts.ts:100`, `:118-121`). It moves into one exported function,
`uploadGate(scope, practiceId)` in `lib/routes/uploads.ts`, used by the Uploads page, the submissions page and the
Contracts page, so a suspended organization's Contracts panel says "Uploads are paused: {reason}." before a file is
chosen instead of refusing it after (`uploader.tsx:101`); one gate, one place.

### 2.6 The route checks the letter a response names

**One predicate for the list and the handler**, in `lib/packets/submissions.ts`:

```ts
/** A document a payer response may carry (alias d): top-level, a payer letter or other document, scanned clean and stored, and no contract version's source. */
const RESPONSE_DOCUMENT = `d.parent_document_id IS NULL AND d.kind IN ('payer_letter', 'other') AND d.scan_status = 'clean' AND d.status = 'stored'
  AND NOT EXISTS (SELECT 1 FROM contract_version v WHERE v.practice_id = d.practice_id AND d.id = ANY (v.source_document_ids))`;
```

- `responseDocuments()` (`:330-338`) selects `FROM source_document d WHERE d.practice_id = $1 AND ${RESPONSE_DOCUMENT}`,
  newest first, 50, audited (2.5.6). This adds the status filter (1.5, item 2) and leaves out contract sources.
- `responseDocumentChoosable(scope, practiceId, documentId): Promise<boolean>`, the same predicate for one ID, is called
  by `recordResponseAction` after its own checks (`routes/submissions.ts:235-251`) and before `recordResponseOnce`
  (`:252`). False throws `InputError([{ field: 'documentId', message: 'choose the payer’s letter from the list, or
  upload it here' }])`, read as "Payer’s letter: choose the payer’s letter from the list, or upload it here".
- **One message for every refusal** (another practice's document, which RLS hides; one still in intake; a duplicate; a
  held, quarantined or expanded one; a zip entry; another kind; a contract's source). The form never posts any of them
  (it lists and chooses only letters the predicate admits, 2.5.2), so the refusal answers a crafted post or a race with
  a tag in another tab; one sentence tells such a post nothing about a document it cannot see. Scout C's five
  per-state sentences are not taken: words no person meets through the form.
- **A letter named by an earlier response stays choosable.** A payer may answer twice in one letter, and the existing
  route test records several responses with one letter (`workbench-routes.db.test.ts:606-648`). It is the person's
  choice; the form never makes it for them.
- **Why "until stored", not "until clean".** A response never changes (`payer_response_rules.sql:16-18`); a response
  naming a document still in intake could point for good at evidence intake later holds as a duplicate, a wrong type or
  an executable (`intake.ts:240-262`).
- **Postgres.** `payer_response_belongs()` checks only the practice (`:39-41`): the same predicate there is Lane A's
  (7.2, item 3). The response's sample input (`routes/submissions.ts:270`) names `refs.responseDocumentId`, a top-level,
  clean, stored payer letter (`lib/routes/test-support/packet-world.ts:117-121`), so the route registry's samples still
  pass.

### 2.7 Alternatives considered, and why each is rejected

| Alternative | Why not |
| --- | --- |
| A disabled empty first option (UX-035's words) | A reset or a render without `defaultValue` falls to the first enabled option, the defect again; needs a `field.tsx` change; prevents nothing `required` does not (2.1) |
| Leave "Window passed" in the list and refuse it only in the route | Offers a choice the route then refuses; the list already knows the answer (`line.windowPassed`, `queries.ts:631-632`) |
| Hide "Window passed" in the page only | A post without JavaScript or a crafted one still records it (CLAUDE.md: check in the handler); U-UX-6 named this gap |
| Judge "Window passed" by the contract's own window where the engine does not compute it | The product has no date for that window (`actionable.ts:12-15`); its own date decides, as for the reopen and triage's strike, and Other with the person's words remains (2.2) |
| Take every payer letter out of the contract lists by its kind | Cuts the terms-letter path the data model admits (UX-007's correction) |
| Filter the lists only, with no handler refusal | A crafted tag or amendment still makes a patient's letter a contract source, shown to roles without `phi.read` (1.5, item 3) |
| File the in-form upload as kind `other`, or a new kind | 2.5.5 |
| The uploader beside the form, outside `<form>` | No nested-button risk, but the batch (file names) would survive another person's sign-in, which #74's remount clears inside the form, and the letter select and the uploader would need a context across the form's edge. Inside, with (b), is safer and simpler |
| A whole client form (`PayerResponseForm`) with `ActionForm`'s `beforeSubmit` to hold a press while scanning | `beforeSubmit` is a function, so the form would move to the client to pass it; the field's own `setCustomValidity` holds the press with the same words and leaves the page a server component |
| Choose the newest letter after the refresh, with no uploader callback | Another person's upload in the same minute would be chosen: another patient's letter, linked for good |
| Save the response while the letter is still scanned, and link it later | A response never changes; it would point at evidence intake may hold (2.6) |
| Exclude from the Document list every letter a response already names | Blocks a payer letter that answers twice; the route test does exactly this (2.6) |
| A response may name a contract version's source | Keeps a document in both workflows; the strict rule is one invariant for the lists, the handlers and Lane A's rules. Its edge, a response letter already tagged by mistake, is recorded (8.2) |

### 2.8 Security analysis

| Threat | What holds |
| --- | --- |
| A file name carrying PHI | The name never leaves the browser: the request sends kind, type, size and format only (`uploader.tsx:14-18`, `:206`; "No route ever sees a file's name", `uploads.ts:46`); object keys are opaque IDs (`packages/db/src/schema/documents.ts:91-93`, `:111-113`); the intake job carries `{practice_id, document_id}` (`uploads.ts:339`). Inside the form the file input stays unnamed (2.5.3), so the server action never receives the File. The status line never echoes the name; the batch row shows it in this browser only, as on Uploads, and #74's remount clears it for another person. **e2e:** a file named with a sentinel; no request URL or body in the journey contains it (4.6) |
| Another practice's document | The page's scope holds only the route's practice (`packages/db/src/authz/scope.ts:203-226`); RLS hides other practices' documents; the handler queries `practice_id = $2` and refuses on the letter with the one message, so a document of another practice reads exactly as one that does not exist; the trigger refuses it again (`payer_response_belongs.sql:39-41`). The uploader posts to the page's own `/p/{practiceId}/uploads/*`, which checks `file.upload` and the BAA (`uploads.ts:231`, `:236`) |
| A replayed or shared request key | Each uploader request makes its own key (`crypto.randomUUID()`, `uploader.tsx:97`); keys are claimed per user across every route (`invoke.ts:231-253`). The uploader never reads the form's hidden `requestKey`: if it did, its claim would turn the response's save into `duplicate`, "This form was already sent, so nothing new was saved" (`lib/http/next.ts:239-242`), over a response never recorded. Its token is the page's `pageCsrfToken()`, as Uploads and Contracts pass (`uploads/page.tsx:33`, `contracts/page.tsx:211`). The refresh after the upload renders a fresh form key, which is harmless, and `recordResponseOnce` still catches a double press across two keys (`lib/packets/submissions.ts:364-376`). **Tested:** the uploader's request keys are never the form's (4.4, 4.6) |
| A response saved while the scan runs | Refused until the letter is stored clean (2.6); the select starts unchosen, the form chooses only its own stored upload, and a press while scanning sends nothing (2.5.2) |
| A button inside the form that submits it | Retry gets `type="button"` (2.5.4 b); the receipt list, whose Reload, Retry and pager buttons have no type (`components/uploads/receipts.tsx:124`, `:182`, `:196`, `:202`), is not rendered (`showReceipts={false}`); "Choose files" is already a button (`uploader.tsx:395`). **Tested:** pressing Retry inside the form sends no action (4.4). #75's held-files Upload button must be `type="button"` too when it lands (3.7) |
| A response letter made a contract source and shown to roles without `phi.read` | The lists leave it out and the three handlers refuse it (2.5.7); Lane A adds the database rule (7.2, item 4). No model reads it: terms are proposed from contracts and exhibits only (`lib/models/contract-proposals.ts:132-137`) |
| An uploaded letter never recorded | It is a payer letter no response names, so it shows in the contract lists until a response names it, as any payer letter uploaded on Contracts does today. The form's flow makes the window short (upload, then record); an abandoned upload stays. Closing it needs an upload-time link, a column: recommended to Lane A (7.2, item 5) |
| Logging and audit | Nothing new is logged (the uploader's and the routes' logs stay IDs only). The audit events are unchanged (`upload_batch_requested`, `upload_requested`, `upload_completed`, `upload_retried`, `uploads.ts:234-356`; `payer_response_recorded`, `routes/submissions.ts:233`; `case_line_written_off`, `triage.ts:472`; `contract_document_tagged`); the two document reads become audited reads (2.5.6) |
| Tenancy | No new table, column, policy, grant, job, route or S3 key shape. Both tables in the new subqueries are in `phi_table_registry` with FORCE RLS, so the cross-tenant and catalog tests cover them unchanged |

### 2.9 Money and stage analysis

- **No new arithmetic.** No amount is computed, rounded or moved here. The response's amount stays
  `optionalDollars` → integer cents (`routes/submissions.ts:199-206`); no float; no model.
- **The engine freeze.** Nothing in `packages/pricing` changes. The refusal reads `priced_line.window_ends_on` through
  the existing `caseLineState()`.
- **The ledger, additions only.** Nothing in `packages/ledger`, `apps/worker/src/reconcile` or the worker's packet
  services changes. LED-01 holds: recording a response writes no entry, and the e2e's existing assertions guard it
  (approved $0.00 before the reconcile, $60.00 after, recovered $0.00: `e2e/packets.spec.ts:521-534`).
- **Stages.** The write-off still writes no `line_status` row; the refusal only stops a false reason. The response still
  moves no stage on save; Payer approved still comes only from the reconcile, Recovered only from posted or deposited
  entries.
- **What changes for money.** A person can no longer record, by not choosing, an acceptance the payer never gave (which
  the next reconcile would approve and show as Payer approved on the home tile, `app/p/[practiceId]/page.tsx:209`), a
  write-off of an open line as lost to its window (which drops it from the dispute and can close the case), or a
  submission's channel. Each now needs a choice the person makes, and the one reason the records can contradict is
  refused.
- **Founder's question, not decided** (8.2): whether a line already at Payer approved or Recovered may be written off,
  and with which reasons. Neither the page (`cases/[caseId]/page.tsx:215`), the route nor `case_line_rules()` checks the
  stage today; this PR does not change that.

---

## 3. Files, in build slices, and what is left for Lane A

Five slices, each with its own files: no file is in two slices, so builders can work in parallel. Slices C and D code
against the APIs this design fixes (`ResponseLetterFieldProps` and the uploader's props, 2.5.1 and 2.5.4;
`uploadGate`, 2.5.8; `NOT_A_RESPONSE_LETTER` and `refuseResponseLetter`, 2.5.7); the branch typechecks and its tests
pass once all five are in. Paths are under `apps/web/src/` unless they start with `apps/`, `packages/` or `docs/`.
Intersected with `designs/lane-b-release-content-checks/pr42-files.txt` by script: only the three shared documents of
slice E are #42's, which LANES.md rule 6 lets both lanes change (precedent: `lane-b-ux-forms.md:1143-1148`, the BIL,
DBF and FRM rows landed while #42 was open). Nothing in `packages/pricing`, `packages/ledger`,
`apps/worker/src/reconcile` or the worker's packet services changes.

### 3.1 Slice A: the write-off

| File | Change |
| --- | --- |
| `lib/cases/write-off.ts` (new) | `writeOffReasonsFor`, `contradictedReason`, `withheldReasonHint` and their words (2.2, 2.3, section 6) |
| `lib/cases/write-off.test.ts` (new) | 4.3 |
| `lib/routes/triage.ts` | `reason: z.enum(WRITE_OFF_REASONS, 'choose the reason')` (`:471`); the refusal inside `:482`, before the UPDATE (2.3) |
| `app/p/[practiceId]/cases/[caseId]/page.tsx` | the Reason select (`:222`): "Choose the reason" first, `writeOffReasonsFor(line)`, `defaultValue=""`, the hint (2.2) |
| `apps/web/e2e/triage.spec.ts` | 4.6: the Reason starts unchosen and offers no "Window passed" on an open line; the stale comment at `:150-151` ("a reset would put back “Window passed”") says the form keeps the reason chosen |

### 3.2 Slice B: the uploader and the letter's field

| File | Change |
| --- | --- |
| `components/uploads/uploader.tsx` | 2.5.4 (a) to (d) |
| `components/packets/response-letter.tsx` (new, client) | `ResponseLetterField` (2.5.1, 2.5.2) |
| `components/packets/response-letter.browser.test.tsx` (new) | 4.4 |
| `components/test-support/forms-harness.tsx` | a `?form=response-letter` page: an `ActionForm` with a Response select, a Notes field and `ResponseLetterField` over the real `Uploader`; `window.harness.letters`, the server's list, rendered again on the stand-in router's `refresh()` |
| `lib/routes/uploads.ts` | `uploadGate(scope, practiceId)` exported; `uploadsPage` uses it (`:107-117`) (2.5.8) |

### 3.3 Slice C: the response and the submission, server and page

| File | Change |
| --- | --- |
| `lib/routes/submissions.ts` | `channel` (`:139`) and `kind` (`:225`) messages; `documentId: z.uuid('choose the payer’s letter')…` (`:227`); the page's `upload` and `roles` (2.5.8); the letter check before `recordResponseOnce` (2.6) |
| `lib/packets/submissions.ts` | `RESPONSE_DOCUMENT`; `responseDocuments()` on it, audited; `responseDocumentChoosable()`; `ResponseView.document`, read audited in `submissionsOf()` (2.5.6, 2.6) |
| `app/p/[practiceId]/cases/[caseId]/submissions/page.tsx` | Channel's first option (`:75`); the card's description (`:268`); the empty state goes (`:271-276`); `ResponseLetterField` first in the form, with `pageCsrfToken()` and `roleNames(roles)` as the Contracts page passes them (`contracts/page.tsx:9`, `:19`, `:211-214`); Response on its own row with its first option and hint (`:282-283`); the log names each response's letter (`:388`); `KIND_TEXT` (`:37`) moves to the field |
| `apps/web/e2e/packets.spec.ts` | 4.6; the Channel chosen before "Log the submission" (`:405-407`); the header's sentence on the payer letter (`:40-42`) |
| `apps/web/e2e/unattested.spec.ts` | the Channel chosen before "Log the submission sent without sign-off" (`:115-117`) |

### 3.4 Slice D: the contract side

| File | Change |
| --- | --- |
| `lib/contracts/contract-queries.ts` | `NOT_A_RESPONSE_LETTER`, in `listContractDocuments`'s `WHERE` (`:348`); its doc (`:346`) says "no payer response names them" |
| `lib/contracts/tagging.ts` | `refuseResponseLetter()`; `tagDocument` calls it after its document check (`:40-46`) |
| `lib/routes/abstraction.ts` | the amend (`:395-415`) and supersede (`:417-440`) handlers call `refuseResponseLetter` when `documentId` is given |
| `lib/routes/contracts.ts` | the comment on `CONTRACT_DOCUMENT_KINDS` (`:47`); `RESPONSE_LETTER_ELSEWHERE`, the panel's sentence; `contractsPage`'s gate through `uploadGate` (`:100`, `:118-121`) |
| `app/p/[practiceId]/contracts/page.tsx` | the panel's description (`:205-206`) ends with `RESPONSE_LETTER_ELSEWHERE` |

### 3.5 Slice E: route tests and documents

| File | Change |
| --- | --- |
| `lib/routes/workbench-routes.db.test.ts` | 4.5 |
| `docs/adr/0085-start-a-choice-that-records-a-fact-unchosen-refuse-one-the-records-own-facts-contradict-and-upload-the-payers-answer-with-its-response-apart-from-the-contract-documents.md` (new) | section 5 |
| `docs/product/test-matrix.md`, `packages/synth/src/cases/matrix.ts`, `packages/synth/src/cases/registry.ts` | CAS-45 to CAS-48 (4.1, 4.2) |

### 3.6 Against prs.json's file list

prs.json lists eight files; all eight are here. Added, each needed and none #42's: `lib/routes/submissions.ts` (the
messages, the page's upload settings, the letter check), `lib/routes/uploads.ts` (the one gate),
`lib/contracts/tagging.ts` and `lib/routes/abstraction.ts` (the handler refusals), `app/p/[practiceId]/contracts/page.tsx`
(the panel's sentence), `components/packets/response-letter.tsx`, `lib/cases/write-off.ts` and their tests,
`components/test-support/forms-harness.tsx`, `e2e/triage.spec.ts` and `e2e/unattested.spec.ts` (the two choices
explicit), `lib/routes/workbench-routes.db.test.ts`, the ADR and the three shared documents. prs.json's "unit" test for
the write-off route is a route database test (`*.db.test.ts`), as every route test is; the pure rule also has a unit
test. Size: about 650 lines with tests, against prs.json's 320; the difference is the letter's field, the handler
checks, and their tests.

### 3.7 Open pull requests that touch these files

From `gh api repos/PureTideWater/PhysicalTherapy/pulls/{n}/files` on 2026-10-28, intersected with this design's files:

| PR | Branch | Shared files | What it means here |
| --- | --- | --- | --- |
| #75 (draft) | `co-001/contract-phi-check` | `components/uploads/uploader.tsx` (it rewrites the kind's handling: `startingKind`, `KindField` with `required` and a help line, files held for an explicit Upload, `batchProblems`; it creates `uploader.test.tsx`), `app/p/[practiceId]/contracts/page.tsx` | Whichever merges second keeps both. With #75 in: `KindField` renders only when more than one kind is offered (its `startingKind` already starts a lone kind chosen); `single` refuses through its `batchProblems`; its Upload button for held files is `type="button"`; 4.4's test that no uploader button submits the form covers it. The panel's sentence goes beside #75's change to the same description |
| #78 (draft) | `co-001/ux-download-refusals` | `components/uploads/uploader.tsx` (a leave guard while sending), `lib/routes/uploads.ts`, `components/uploads/receipts.tsx` (not rendered here) | Its leave guard protects the in-form upload too. `uploadGate` sits beside its `uploads.ts` changes |
| #81, #82 (drafts) | `co-001/suite-cap-1-bounded-reads`, `co-001/ci-pin-age` | the three shared documents | LANES.md rule 6; #81's design reserves CAS-40 to CAS-42 (`designs/suite-cap-1-triage-locks.md:18`), so CAS-45 to CAS-48 sit after them in id order |
| #42 (draft) | `co-001/pr-06b-mail-streams` | the three shared documents | LANES.md rule 6 |

### 3.8 What is left for Lane A

Five changes need a migration, so none is in this pull request; each is set out in 7.2 with its reason and its SQL's
shape: (1) `case_line_rules()` refuses a person's "Window passed" while the window is open or unknown; (2)
`console_contract_queue()` leaves out the letters a payer response names, with an index on `payer_response
(practice_id, document_id)`; (3) `payer_response_belongs()` admits only a document `RESPONSE_DOCUMENT` admits; (4)
`contract_version_documents_ok()` refuses a document a payer response names; (5) an upload-time link, so a letter
uploaded for a response never enters the contract lists even before the response is recorded.

---

## 4. Tests

### 4.1 Test matrix: four rows in "Triage, cases and packets (CAS)"

Added to `docs/product/test-matrix.md` after CAS-39 (and after CAS-40 to CAS-44, in id order, if those land first), and to
`packages/synth/src/cases/matrix.ts` word for word (`packages/synth/src/fixtures.test.ts:33` holds the two identical):

```
| CAS-45 | A write-off reason the line’s own records contradict | The Reason starts on “Choose the reason”, and a write-off with no reason chosen is refused on Reason; “Window passed” is neither offered nor accepted for a line whose dispute window is open or unknown, and is refused on Reason with nothing written; once the window has ended it is offered and recorded |
| CAS-46 | A payer response or a submission with nothing chosen | The Response starts on “Choose the payer’s answer”, the Channel on “Choose the channel” and the payer’s letter on “Choose the payer’s letter”; a response with no answer or no letter, or a submission with no channel, is refused on that field and nothing is recorded; the words under Response say that an acceptance is recorded for good, what the case then reads, that the recovery ledger then approves up to its amount (Payer approved), and that nothing is recovered until it is posted or deposited |
| CAS-47 | The payer’s letter uploaded in “Log a payer response” | The form shows with no letter on file; the letter goes through the same scanned intake; what was typed before the upload keeps its value through the scan and the page read again; the letter is chosen only once it is stored, and only the letter that form uploaded or, for a duplicate, the copy on file a response may carry, never over the person’s own choice; a press while it is scanned sends nothing; no button of the uploader submits the form; no request carries the file’s name, and no upload request carries the form’s request key; the submission log names each response’s letter and links its receipt |
| CAS-48 | A payer’s answer kept apart from the contract documents | A response naming a document still in intake, held, a duplicate, a zip or one of its entries, of a kind other than a payer letter or other document, of another practice, or a contract version’s source is refused on the letter with one sentence, and nothing is recorded; a letter a response names leaves Documents to tag and Documents awaiting abstraction, and tagging it, or naming it in an amendment or a correction, is refused; a payer’s terms letter that no response names stays in both lists |
```

In `matrix.ts`, after the CAS-39 entry, each as `{ id, title, assertion }` with the same text (the multi-line form CAS-38
and CAS-39 use, `matrix.ts:170-181`).

### 4.2 Registry entries

`packages/synth/src/cases/registry.ts`, after the CAS-39 entry (`:246-251`), under the comment `// Lane B
(co-001/ux-payer-response): a choice that records a fact starts unchosen, and the payer’s letter is uploaded with its
response, apart from the contract documents.`, each `none(8, …)` (milestone 8, as the CAS rows beside them):

| Id | Why no file | `assertedBy` |
| --- | --- | --- |
| CAS-45 | "A case line on a synthetic practice the test creates, written off: no file." | `apps/web/src/lib/cases/write-off.test.ts`, `apps/web/src/lib/routes/workbench-routes.db.test.ts`, `apps/web/e2e/triage.spec.ts` |
| CAS-46 | "A response and a submission logged on a synthetic practice the test creates: no file." | `apps/web/src/lib/routes/workbench-routes.db.test.ts`, `apps/web/e2e/packets.spec.ts` |
| CAS-47 | "A SYNTHETIC payer letter the test builds as a PDF and uploads in the browser: no file." | `apps/web/src/components/packets/response-letter.browser.test.tsx`, `apps/web/e2e/packets.spec.ts` |
| CAS-48 | "Documents the test inserts in each intake state, and a response recorded with one: no file." | `apps/web/src/lib/routes/workbench-routes.db.test.ts`, `apps/web/e2e/packets.spec.ts` |

No new module: these are case and packet behaviour (module 5, CAS). Every test that asserts a row names its id in its
title, as the repository's tests do.

### 4.3 Unit: `lib/cases/write-off.test.ts` (new; CAS-45)

1. `writeOffReasonsFor({ windowPassed: true })` is the five reasons in the list's order; with `false`, the four without
   `window_passed`.
2. `contradictedReason('window_passed', …)`: the open sentence for `{ windowEndsOn: '2036-04-05', windowPassed: false }`,
   the unknown sentence for `{ windowEndsOn: null, windowPassed: false }`, null for `{ windowEndsOn: '2026-04-19',
   windowPassed: true }`; null for each of the other four reasons on all three lines.
3. **The page offers exactly what the route accepts:** for each of the five reasons on each of the three lines (all 15),
   `writeOffReasonsFor(line).includes(reason)` is `contradictedReason(reason, line) === null`.
4. `withheldReasonHint`: the open hint, the unknown hint, null.
5. No sentence holds a digit (no date reaches a refusal).

### 4.4 Browser harness: `components/packets/response-letter.browser.test.tsx` (new; CAS-47)

On #74's harness (`components/test-support/browser.ts`; Playwright's Chromium, no new dependency), the new
`?form=response-letter` page; the uploader's server is stood in for with `page.route` on `**/uploads/request`,
`**/uploads/complete`, `**/uploads/retry`, `**/uploads/receipts*` and the PUT target, each answering as the test
scripts. Every title cites CAS-47 (and FRM-01 where it checks kept values).

1. The letter starts on "Choose the payer’s letter" (value `''`); a press sends no action (the select is
   `valueMissing`).
2. **What was typed survives the scan.** Response "Partially accepted" chosen and Notes typed; a file
   `SYNTHETIC-NAME-SENTINEL-letter.pdf` chosen. While its receipt is `received`: status `scanning`, the select's
   `validationMessage` is the scanning sentence, a press sends no action. Receipt `stored`: the stand-in router's
   `refresh()` was called once; the test renders `letters` with the new ID; the select holds it, status `chosen`;
   Response and Notes hold what was typed.
3. **Never over the person's choice.** During the scan the person chooses a letter already listed; on `stored` the select
   keeps it, status `stored-not-chosen`.
4. **A duplicate.** `duplicate` with its original in `letters`: the original chosen, `duplicate-chosen`; with an original
   not in `letters`: nothing chosen, `duplicate-unusable`.
5. **Held.** `wrong_type`: nothing chosen, `held`, the batch row shows the receipt's words.
6. **No uploader button submits the form.** The PUT answers 500: Not sent and Retry. Pressing Retry calls the retry
   route and sends no action; Enter in Notes sends exactly one action, with the form's own fields.
7. **One PDF.** Two files, or one `.zip`, dropped: "Nothing was uploaded" with the `single` refusal, and no request made.
8. **Names and keys.** No request URL or body the page sent holds the sentinel; no upload request's `requestKey` is the
   form's hidden `requestKey`; the action's entries hold no file and nothing of the uploader's.
9. **Another person.** After typing and uploading, the harness renders another person's mark: the fields and the batch
   are cleared (the sentinel name is gone from the page), and the summary says "Form cleared".
10. **A single kind.** No "Kind of document" select is rendered; the file input has no `multiple` and accepts PDFs.

### 4.5 Route database tests: `lib/routes/workbench-routes.db.test.ts`

In "the Cases workbench (CAS-03, CAS-04, CAS-06)":

- **`offers and accepts “Window passed” only once a line’s window has ended, and refuses a write-off with no reason
  (CAS-45)`.** A practice as in the WINDOW test (`:313-331`: a 30-day window, triaged on `2026-03-20`) but **not triaged
  again**, so its lines are actionable and their windows have passed: `casePage` shows `windowPassed` true; writing one
  off as `window_passed` is recorded, by the manager. A `cas08Case` (triaged today, its windows open): `window_passed` is
  `{ status: 'invalid', issues: [{ field: 'reason', message: <the open sentence> }] }`, the line still actionable with no
  write-off and no `case_line_written_off` audit event for it; `reason: ''` is refused with "choose the reason".

In "submissions and responses (CAS-14, J10)", the existing test's setup (`:599-617`: write, approve, export, attest, log)
becomes a helper `submittedCase(label)` the new tests share:

- **`refuses a response or a submission with nothing chosen (CAS-46)`.** `kind: ''` → `kind`, "choose the payer’s
  answer"; `documentId: ''` → `documentId`, "choose the payer’s letter"; `logSubmissionAction` with `channel: ''` →
  `channel`, "choose the channel"; the submissions page shows no new response and no new submission.
- **`records a response only with a stored letter a response may carry, and keeps that letter apart from the contract
  documents (CAS-48)`.** Documents inserted as the owner: a payer letter still `pending`; one clean but `received`; a
  `duplicate`; a zip `expanded` and one of its entries; a clean, loaded `x12_835`; another practice's stored letter; a
  stored letter tagged to a contract (through `tagContractDocument`); and two stored letters, A and T. `page.documents`
  lists A, T and the block's seeded letter, nothing else. Each of the first eight is refused on `documentId` with the one
  sentence, and the submission's responses are unchanged. A response recorded with A. Then: `listContractDocuments`,
  `untagged` and `awaiting_abstraction`, leave A out and keep T, as do `contractsPage` (the manager) and `abstractionPage`
  (a contract specialist under a support grant, a helper beside `reviewerOf`, `:144-153`), totals agreeing;
  `tagContractDocument` (manager) and `startAbstraction` (specialist) with A, and `amendVersionAction` and
  `supersedeVersionAction` naming A on the practice's signed-off version, are each refused on `documentId` with the
  tagging sentence and change nothing.
- The existing test's assertions stay as they are (`:618` still lists the seeded letter: it is stored, top-level and no
  contract's).

### 4.6 End to end

**`apps/web/e2e/packets.spec.ts`**, the response step (`:471-536`), rewritten (CAS-46, CAS-47, CAS-48; FRM-01 and
FRM-08 kept):

1. The submission step (`:401-407`) chooses Channel "Payer portal" before "Log the submission", and first asserts the
   Channel holds `''` with the text "Choose the channel".
2. On Submissions, "Log a payer response" shows its form with no letter on file: the Payer’s letter select holds only
   "Choose the payer’s letter", with the upload hint; Response holds `''` ("Choose the payer’s answer"), and its
   description holds the hint's words.
3. Response "Partially accepted" chosen and Notes typed ("SYNTHETIC: the payer accepts part"); Received on left as
   prefilled.
4. Inside `withWorker`, the SYNTHETIC letter (the same `syntheticPdf` as today, `:475`) set on the form's "Choose a file
   to upload", named `SYNTHETIC-NAME-SENTINEL-letter.pdf`; the form's batch row shows Stored (90 s, as today), and the
   status says the letter is chosen.
5. Response still `partial`, Notes still typed, Received on unchanged, and the Payer’s letter select holds a letter ID.
6. "Record the response": the FRM-01 refusal on the amount, with today's assertions (`:487-493`); the phone-width checks
   (`:494-515`), now on the select labelled "Payer’s letter".
7. Amount 60.00, recorded; the log's partial response names "Payer letter, uploaded …" and links its receipt.
8. `/contracts`: "Documents to tag" has no row `[data-document="{the letter's ID}"]` (CAS-48).
9. Across the step, a `page.on('request')` collector: no request URL or body holds `SYNTHETIC-NAME-SENTINEL`, and no
   upload request's `requestKey` is the response form's (CAS-47).
10. The reconcile and the ledger assertions (`:521-534`) stay unchanged (LED-01).

The header (`:40-42`) says the letter is uploaded in "Log a payer response". `KNOWN` and `assertNoPhi` stay.

**`apps/web/e2e/triage.spec.ts`**, the write-off step (`:139-176`, CAS-45): before choosing Other, the Reason holds `''`
with the text "Choose the reason", its options have no "Window passed" (the line's window is open), and its description
holds the withheld hint; the rest as today.

**`apps/web/e2e/unattested.spec.ts`** (`:115-117`): Channel "Payer portal" chosen before the log.

### 4.7 Accessibility

- `expectAccessible(approver, 'Submissions, the payer’s letter uploaded in the response form')` (WCAG 2.1 A and AA,
  `e2e/a11y.ts:11`) after the upload is stored and before the record, on
  `/p/[practiceId]/cases/[caseId]/submissions` with the uploader and its batch inside the form; `atPhoneWidth` keeps
  checking no sideways scroll and landmark-unique there (`a11y.ts:101`; the drop zone is the page's one "Drop zone"
  region).
- The status line is a polite live region (`role="status"`) and in the select's `aria-describedby`, after its hint.
- In `triage.spec.ts`, today's `expectAccessible(page, 'A case')` (`:136`) runs before the write-off; the step adds one
  after opening "Write this line off" with the hint showing.

### 4.8 Existing tests that change, or go stale

- `e2e/triage.spec.ts:150-151` and `e2e/packets.spec.ts:485-486` say a reset would put back the first reason or kind:
  rewritten (a reset would now put back the empty choice, which `required` refuses).
- The screen tour (`tools/lane-b-screen-tour/capture/tour.spec.ts`, outside the repository) picks Response by
  `optionIndex` (`:2453`) and Reason by label (`:2326`), both robust to the new first option; its notes change (6.3).
- #74's harness REASONS keep `defaultValue="window_passed"` (`components/test-support/forms-harness.tsx`): a harness
  form, not the page; unchanged.
- The route registry's samples: the write-off's (`triage.ts:494`, `not_worth_pursuit`) and the response's
  (`routes/submissions.ts:270`, a stored letter) still pass.

---

## 5. Docs

### 5.1 ADR 0085 (needed)

Scout A judged its own half needed no ADR (it follows the empty-first convention and the reopen's refusal pattern);
scout C judged one warranted. Warranted: the rules outlive this pull request and bind others. Bulk write-off (audit
#125) must offer and refuse reasons the same way; the five other selects that record a fact must start unchosen;
UX PRs 47 to 49 build on an uploader that now sits inside a form; and Lane A's five database changes need one statement
of what they mirror. In outline, in the shape of ADRs 0077 and 0078:

**0085. Start a choice that records a fact unchosen, refuse one the record's own facts contradict, and upload the
payer's answer with its response, apart from the contract documents**

- **Status:** proposed (`co-001/ux-payer-response`, the UX baseline review's tenth pull request).
- **Date:** 2026-10-28.
- **Deciders:** the founder, under the standing rule of 2026-10-18; the co-founder, under the founder's delegation of
  2026-10-25, whose rulings take each recommended wording and visible change ("Choose the reason", "Choose the payer’s
  answer"); the build (Lane B); Lane A for the database's half. Each reversible by the founder.
- **PRD sections:** 6 (cross-cutting: every error shown with a next step, `PRD.md:256`); 7 (Submissions and responses:
  "log a submission or response", `:279`; every destructive action confirms with the consequence stated, `:302`); 12
  (Write-offs and reopening, `:514`); test matrix CAS-45 to CAS-48; ADRs 0026 (the scanned intake), 0038 (the five
  stages and the write-off reasons), 0041 (case states derived from submissions and responses), 0077 (forms keep what
  was typed; browser validation on).
- **Context.** Section 1 of the design: three selects that record a fact arrive on their first value; the route accepts
  a reason the line's records contradict; the payer's letter cannot be uploaded where the form asks for it, and the
  only path that works files it among the contract documents; nothing checks the letter a response names.
- **Decision.**
  - **D1. A choice that records a fact starts unchosen.** A fact is what happened or what a person attests: a reason, a
    payer's answer, a channel, a document as evidence. Its select starts on an enabled empty first option ("Choose
    the …") with `required`, and its route's enum or ID schema carries a message that names what to choose. A select
    that sets a preference or a filter may open on its current or recommended value. Disabled placeholders are not
    used: a reset falls past them to the first real option.
  - **D2. Offer only what the record's facts allow; refuse what they contradict, on its field.** Where stored facts
    decide whether a choice can be true, one function decides it for the page (which leaves the choice out, and says
    why under the field) and for the handler (which refuses it on that field, in the same transaction that writes,
    before the database). The refusal names the rule, never a value. The database mirrors the rule (Lane A); a
    choice no stored fact decides stays the person's judgment and is never second-guessed.
  - **D3. The payer's answer is uploaded where it is used.** "Log a payer response" holds the shared uploader for one
    payer letter (kind `payer_letter`, PDF). The form chooses only the letter it uploaded itself, once stored, never the
    newest and never over the person's own choice; a press while the scan runs sends nothing. An uploader inside a form
    renders only `type="button"` buttons and unnamed controls, uses its own request keys and the page's CSRF token, and
    never the form's key; the form's remount for another person clears its batch.
  - **D4. A letter is a case's evidence or a contract's source, never both.** A response names only a top-level payer
    letter or other document, scanned clean and stored, that no contract version names. A letter a response names
    leaves the contract lists ("Documents to tag", "Documents awaiting abstraction", the console's count) and is refused
    as a contract's source by every handler that takes one; a payer's terms letter, which no response names, stays
    abstractable. The link is `payer_response.document_id`; no kind or column is added.
- **Alternatives considered:** design 2.7.
- **Consequences.** No fact about money or a case is recorded by not choosing; the one reason the records can
  contradict is refused in the handler now and in the database once Lane A's rule lands; the payer's letter is
  uploaded and chosen in one place, and response letters stop reaching the contract specialist's queue and the
  version page's readers without `phi.read`. Costs: one more choice in each form; until Lane A's migration the console's
  count of documents awaiting abstraction includes response letters; a letter already a contract's document cannot be
  a response's (8.2).
- **Not covered.** The five other selects that record a fact and open pre-answered (7.3, item 1); bulk write-off
  (audit #125), which must use D1 and D2; writing off a line already at Payer approved or Recovered (the founder's
  question, 8.2); a letter that both answers a dispute and announces terms (8.2); an uploaded letter never recorded,
  until Lane A's upload-time link (7.2, item 5).
- **Not verified here.** Browsers other than Chromium for the custom validity message on the letter select.
- **Revisit when.** Lane A's rules land (the handlers keep their checks, which name the field; the database's become
  the second check); the denial-letter reader (v1.5) reads response letters; a path to take a document out of a draft
  version exists.

### 5.2 Other documents

- `docs/product/test-matrix.md` and the synth registry: section 4.
- No change to `docs/brand/BRAND.md`, `.claude/rules/brand.md` or the PRD: the words follow them (section 6).
- `docs/product/reconciliation-001.md` is not edited (as in `lane-b-ux-forms.md`, 9.3).

---

## 6. Every string a person sees, and the screenshots

Checked against `.claude/rules/brand.md`, `docs/brand/BRAND.md` and CO-11 (`docs/product/change-order-001.md:93-97`):
"recovered" only with posted or deposited; no "owed", "AI", "intelligence" or "ProofPack"; the typographic apostrophe
and quotation marks, as these pages use them (U-UX-9 flagged mixed apostrophes); refusal messages in the lower-case rule
style read after the field's name (`lib/routes/schemas.ts:19-20`); no value, date or file name in a refusal. Where a
scout offered words, the recommended option is taken and named.

### 6.1 New and changed strings (exact)

**The case page, "Write this line off"**

| Where | Words |
| --- | --- |
| Reason, first option | Choose the reason |
| Hint under Reason, the window open | “Window passed” is offered once this line’s dispute window has ended. |
| Hint under Reason, no window known | “Window passed” is not offered: no dispute window is known for this line. |
| Refusal, no reason (route) | choose the reason |
| Refusal, "Window passed" on an open window (route) | a line whose dispute window is still open is not written off as “Window passed”; choose the reason that applies |
| Refusal, "Window passed" with no window known (route) | a line with no known dispute window is not written off as “Window passed”; choose “Other” and say why |

The refusals read, in #74's summary, "Reason: a line whose dispute window is still open is not written off as “Window
passed”; choose the reason that applies". Scout A's words ("its dispute window is still open, so “Window passed” is not
its reason") are reworded so that "its", after "Reason:", cannot read as the reason's own.

**Submissions, "Log a submission"**

| Where | Words |
| --- | --- |
| Channel, first option | Choose the channel |
| Refusal, no channel (route) | choose the channel |

**Submissions, "Log a payer response"**

| Where | Words |
| --- | --- |
| Card description (today `:268`) | To the submission of {date}. Start with the payer’s letter: upload it here, or choose one already on file, and fill in what it says while it is scanned. A denial with a reason can reopen the case for the next dispute level, within its window. |
| Letter select, label (today "Document") | Payer’s letter |
| Letter select, first option | Choose the payer’s letter |
| Hint, no letter on file (replaces the empty state, `:272-275`) | Upload the payer’s letter here; it is chosen once it is scanned clean. |
| Hint, letters on file | Upload the payer’s letter here, or choose one already on file; a letter uploaded here is chosen once it is scanned clean. |
| Status, `scanning` | The letter is being scanned. It is chosen here once it is scanned clean, and what you typed stays. |
| Status, `chosen` | The letter you uploaded is chosen. |
| Status, `duplicate-chosen` | That file was already on file, so the copy on file is chosen. |
| Status, `duplicate-unusable` | That file is already on file, but not as a letter a response can carry, so it is not chosen. Upload another copy of the letter, such as the payer’s portal page saved as a PDF. |
| Status, `held` | The letter was held at intake, so it is not chosen; its line above says why. |
| Status, `stored-not-chosen` | The letter you uploaded is stored. Choose it in the list if it is this response’s letter. |
| Bubble while scanning (`setCustomValidity`) | The payer’s letter is still being scanned; it is chosen here once it is scanned clean. |
| Drop zone heading | Upload the payer’s letter |
| Drop zone description | One PDF, up to 2 GiB. Each file is scanned for malware before anything reads it. (the second sentence is the uploader's own, `uploader.tsx:316-317`) |
| Drop zone button; the file input's label | Choose a file; Choose a file to upload |
| Refused in the browser (`single`) | Choose one PDF: the payer’s letter itself, not a zip or another kind of file. (under "Nothing was uploaded") |
| Who uploads, when the role cannot | Billing managers, analysts and firm principals upload files; a letter already on file can still be chosen above. |
| Response, first option | Choose the payer’s answer |
| Hint under Response | Accepted and Partially accepted are recorded for good, with the amount below: the case reads Resolved or Partially resolved, and the recovery ledger then approves up to that amount on the lines this submission asked for (Payer approved). Nothing is recovered until it is posted or deposited. |
| Refusal, no answer (route) | choose the payer’s answer |
| Refusal, no letter (route) | choose the payer’s letter |
| Refusal, a letter a response may not carry (route) | choose the payer’s letter from the list, or upload it here |

Scout A's longer hint ("…the recovery ledger’s next reconcile approves that amount across the lines…") is shortened,
and its "until a remittance pays it" corrected (1.5). The review's empty-state words, taken under the co-founder's
ruling ("Upload the payer's letter here; it can be chosen once it is scanned clean."), are kept but for "it can be
chosen", which becomes "it is chosen", since the form now chooses it.

**Submissions, the log** (today `:388`)

| Where | Words |
| --- | --- |
| A response with its letter | (with its document: [Payer letter, uploaded 2026-10-28 14:02 UTC], SHA-256 {hash}), the bracket a link to its receipt; "Other document" for kind `other` |
| A reprocessed remittance's response | (from a reprocessed remittance), unchanged |

**Contracts, "Upload a contract, exhibit or payer letter"** (description, `contracts/page.tsx:205-206`)

> Each file goes through the same scanned intake as an 835. Once it is stored, tag it to its payer below; it then
> enters the contract specialist’s queue. A payer’s answer to a dispute goes with its response instead, on the case’s
> Submissions and responses page.

**Contracts and abstraction, tagging, amending or correcting with a response's letter** (route; no field on the page,
so #74 shows it alone)

| Where | Words |
| --- | --- |
| Refusal (`documentId`) | a payer’s answer to a dispute stays with its case’s response and is not a contract’s document |

**Contracts, a suspended organization's panel** (through `uploadGate`; the words are today's on Uploads,
`uploads.ts:117`): "Uploads are not open yet" / "Uploads are paused: {reason}."

### 6.2 Screenshots the UX review needs

By the screen tour's ids (`<route key>.<variant>.<width>`, `.1280-dark` for the dark tokens; `tour.spec.ts:428`), at
1280 and 390 light and 1280 dark, **before** at `165c599` and **after** at this branch's head:

| Route | Shot ids | What changes |
| --- | --- | --- |
| `/p/[practiceId]/cases/[caseId]/submissions` | `p.submissions.default` | Channel on "Choose the channel"; the response form with the letter first (select, hint, drop zone), Response on "Choose the payer’s answer" with its hint on its own row; the log's partial response names its letter |
| | `p.submissions.error` | The partial response refused on the amount, with the letter's field above it |
| | `p.submissions.notice` | The recorded notice and the log line naming the letter |
| | `p.submissions.letter-scanning` (new) | The letter uploaded in the form and still in intake: the batch row, the `scanning` status, Partially accepted and the note kept |
| | `p.submissions.empty`, `p.submissions.attestation-waiting`, `p.submissions.loading` | Regression only: no response form on these |
| `/p/[practiceId]/cases/[caseId]` | `p.case.write-off-open` | Reason on "Choose the reason", the withheld hint under it (PACKETS' lines are open) |
| | `p.case.error` | Other refused for no words, unchanged but for the Reason's list |
| `/p/[practiceId]/abstraction` | `p.abstraction.default` | PACKETS' acceptance letter, which its partial response names, no longer awaits abstraction; the tour's note ("PACKETS: the payer letter awaiting abstraction", `:2145`) changes to say so |
| `/p/[practiceId]/contracts` | `p.contracts.default` | The panel's new sentence |
| `/p/[practiceId]/uploads` | `p.uploads.default` | Regression only: two kinds, so the kind select stays |

`p.submissions.letter-scanning` needs a new `cap()` in `tour.spec.ts`, after the error shot (`:2445-2459`). The tour
runs no worker, so the letter stays in intake, which is the state to show:

```ts
  await cap(browser, {
    key: 'p.submissions',
    route: sb,
    persona: 'packet-approver',
    path: subPath,
    state: 'interaction:letter-scanning',
    note: 'A SYNTHETIC payer letter uploaded inside Log a payer response after Partially accepted was chosen and a note typed; no worker runs in the tour, so it stays in intake and the form says it is being scanned.',
    act: async (page) => {
      const form = page.getByRole('region', { name: 'Log a payer response' });
      await form.getByLabel('Response', { exact: true }).selectOption({ index: await optionIndex(page, /^Response$/, /Partial/i) });
      await form.getByLabel('Notes (kept encrypted)').fill('SYNTHETIC: the payer accepts part of the amount disputed.');
      await form.getByLabel('Choose a file to upload').setInputFiles({ name: 'SYNTHETIC-letter.pdf', mimeType: 'application/pdf', buffer: readFileSync(`${SCREENS}/fixtures/synthetic/CON-01/version-1.pdf`) });
      await expect(form.locator('[data-letter-status="scanning"]')).toBeVisible({ timeout: 30_000 });
    },
  });
  notReached('p.submissions', 'letter-chosen', sb, 'a letter scanned clean needs the worker, which the tour does not run; e2e/packets.spec.ts asserts it');
  notReached('p.submissions', 'no-letter', sb, 'a submission with no letter on file is e2e/packets.spec.ts’s journey, before its upload (not in the populate set)');
```

The tour's `p.abstraction.default` note (`:2145`) becomes "PACKETS: its acceptance letter, which a response names, is
not awaiting abstraction." The UX review asks for every changed state at 1280 dark too, so the run names
`p.submissions.error.1280-dark`, `p.submissions.letter-scanning.1280-dark` and `p.case.write-off-open.1280-dark` in
`TOUR_ONLY` (`tour.spec.ts:91-96`).

---

## 7. No migration; the proposals outside this PR

### 7.1 No migration

Nothing here changes a table, column, constraint, policy, grant, trigger or function:
- the exclusion is a `NOT EXISTS` over `payer_response.document_id`, which exists (migration `20261023090000:239`);
- the letter keeps the existing kind `payer_letter`;
- the refusals are in the handlers (`triage.ts`, `routes/submissions.ts`, `tagging.ts`, `abstraction.ts`);
- the audited reads use existing object types and a purpose the CHECK's pattern admits (migration
  `20261015140500_audit_and_operations.sql:15`) and the case screens already use (`case_review`);
- the uploader uses the existing routes, presign, receiver, scan, keys and job; no infrastructure changes.

`docs/product/domain-model.md` is therefore not regenerated, and the schema gate (CO-02) is not engaged.

### 7.2 For Lane A (each a new migration, its function file regenerated, under CO-02)

1. **`case_line_rules()`: a person's "Window passed" only on a window that has ended.** In the person's branch
   (`packages/db/functions/case_line_rules.sql:35-37`; `window_end` is loaded at `:29`):
   ```sql
   ELSIF NEW.written_off_reason = 'window_passed' AND (window_end IS NULL OR window_end >= (now() AT TIME ZONE 'UTC')::date) THEN
     RAISE EXCEPTION 'a person writes a line off as window passed only once its window has ended' USING ERRCODE = 'check_violation';
   ```
   *Why:* CLAUDE.md, "check in the handler and in Postgres"; the handler's check (2.3) covers today's one path, and bulk
   write-off (audit #125) will add another. The trigger fires on the transition, so rows already written stay; Lane A can
   count any with `written_off_by IS NOT NULL AND written_off_reason = 'window_passed' AND window_ends_on >=
   written_off_at::date` (scout A 1.5).
2. **`console_contract_queue()` (SECURITY DEFINER): the same exclusion, and its index.** Its `documents_awaiting`
   (in force from `20261028090000_specialist_queue_by_practice.sql:19-53`, the count at `:34-37`; the review cited the
   original, `20261016200000:118-140`) gains `AND NOT EXISTS (SELECT 1 FROM payer_response r WHERE r.practice_id =
   d.practice_id AND r.document_id = d.id)`, the words of `NOT_A_RESPONSE_LETTER`. The function keeps its `SET
   search_path` (`pg_catalog` first, `pg_temp` last), its local save and restore of `app.practice_ids` and its grants.
   With it, `CREATE INDEX payer_response_by_document ON payer_response (practice_id, document_id) WHERE document_id IS
   NOT NULL`. *Why:* UX-007's own "for Lane A"; the function counts every active practice in one query, and the same
   migration's header records a 405-second count at 600 practices before it was driven by index (`:3-11`). Its caller,
   `lib/routes/console.ts:800-847` (#42's), needs no change.
3. **`payer_response_belongs()`: the letter a response names.** When `NEW.document_id IS NOT NULL`, refuse unless the
   document is the practice's, top-level, `payer_letter` or `other`, `scan_status = 'clean'`, `status = 'stored'`, and no
   `contract_version` names it (today only the practice is checked, `payer_response_belongs.sql:39-41`). *Why:* the
   handler's check (2.6), mirrored.
4. **`contract_version_documents_ok()`: never a response's letter.** Refuse a source document a `payer_response` names
   (`packages/db/functions/contract_version_documents_ok.sql:15-17` admits any clean payer letter). With item 3, both
   triggers take one advisory lock per document (as intake does per hash, `intake.ts:125`), so a response and a tag of
   the same letter in two transactions cannot both pass. *Why:* the handler refusals (2.5.7), mirrored; the version page
   shows a source's pages to roles without `phi.read`.
5. **An upload-time link (recommended).** A column on `source_document`, written only at insert like the others that
   never change (migration `20261016090000:205`, `:210`), for example `filed_for_submission_id uuid REFERENCES
   submission (id)`, which `uploads/request` sets when the response form asks (the practice's submission, the latest of
   its case, a person who logs submissions); the contract lists and the console count then leave such a letter out from
   the moment it is uploaded, and the response form can list the submission's own uploads first. *Why:* closes the one
   path left (2.8): a letter uploaded in the form but never recorded is a payer letter no response names, so it shows in
   the contract lists until a response names it. The web half follows in a later Lane B pull request once the column
   exists.

### 7.3 Proposals outside this PR's files

1. **Five more selects that record a fact open pre-answered** (ADR 0085 D1): the mapping's Agreement
   (`app/p/[practiceId]/mapping/[planId]/page.tsx:160`), the abstraction's Method (`abstraction/versions/[versionId]/page.tsx:181`),
   Cited document (`:251`, `:302`) and Topic (`:451`), and the console's compliance "What"
   (`app/console/compliance/page.tsx:191`). None is a #42 file. One follow-up UX pull request, each with its route's enum
   message.
2. **The packet's attachable documents have no status filter** (`lib/packets/queries.ts:183-191`): duplicates, held
   documents and zip parents are offered as packet evidence. The same shape of predicate (top-level, clean, stored).
3. **The uploader's headings inside a card** are `<h2>` under the card's `<h2>` (2.5.4): a heading-level prop, for UX PR
   47, which owns the uploader's naming.
4. **The Contracts panel's kind label** "Payer letter" invites a payer's answer: "Payer’s terms or policy letter", for UX
   PR 47 (it owns `contracts/page.tsx` and `receipt-labels.ts`).
5. **The receipt's Stored words** "the payer letter is kept for its review" (`lib/uploads/receipt-labels.ts:536`) read
   oddly for a payer's answer: for UX PR 49 (the receipt says what happens next).
6. **Bulk write-off** (audit #125; `lane-b-ux-review.md:593`) offers `writeOffReasonsFor` per line and refuses with
   `contradictedReason`.

---

## 8. Risks, and what is waiting on someone

### 8.1 Risks, and what holds each

| Risk | What holds it |
| --- | --- |
| #75 or #78 merges first and its `uploader.tsx` conflicts | LANES.md rule 6; 3.7 says what each keeps; 4.4's test (no uploader button submits the form; a lone kind shows no select) fails if a merge drops either |
| The console's count disagrees with the web lists until Lane A's item 2 | Said in the pull request's description; a count, not money |
| A letter already a contract version's source (uploaded on Contracts before this PR and tagged) is the payer's answer | It cannot be the response's letter (2.6); uploading it again is a duplicate that cannot be chosen, and the status line says to upload another copy, such as the payer's portal page saved as a PDF. Only synthetic data exists before launch; the product question is in 8.2 |
| A letter uploaded in the form and never recorded stays in the contract lists | The flow is upload, then record, so the window is short; it is the case today for every letter uploaded on Contracts; Lane A's item 5 closes it |
| A tag in another tab between the list and the press | The handler refuses with the one sentence, nothing recorded; Lane A's lock (item 4) |
| The page offered no "Window passed" and the window ends before the press | Monotonic (2.2): the route never refuses what the page offered; the person reads the page again |
| `setCustomValidity` words in browsers other than Chromium | A standard API; without it `required` still stops the press with the browser's words; only Chromium is tested (ADR 0085, Not verified) |
| More audit rows | Up to 50 audited reads per submissions page view for a person who logs responses, plus one per response's letter: the same order as the contract screens (25 a page) |
| The web lists' `NOT EXISTS` with no index on `document_id` | One practice's rows; Lane A's index (item 2) |
| A test or tour step that relied on Channel's default | The two e2e steps that log a submission choose it (3.3); no tour step presses "Log the submission"; the route tests post explicit channels (`workbench-routes.db.test.ts:451`, `:616`; `unattested-submission-routes.db.test.ts:218`, `:316`; `pricing-current-routes.db.test.ts:287`) |

### 8.2 Waiting on someone

- **The founder (a money and stage ruling, not decided here).** Whether a line already at Payer approved or Recovered
  may be written off, and with which reasons. The form is offered whatever the line's stage
  (`cases/[caseId]/page.tsx:215`), and neither the route nor `case_line_rules()` checks the stage. Such a write-off
  leaves the line's ledger entries standing and takes it out of later approvals (`responses.ts:54`) and of the case's
  resolved count (`case_rules.sql:33-37`); "Payer correct on review" on a line the payer itself approved reads as a
  contradiction. Scouts A (section 7) and C (section 6) raise it; this PR changes nothing about it.
- **The product (low priority, not decided).** (a) A payer's letter that answers a dispute and also announces new terms
  leaves the abstraction queue once a response names it, and cannot be uploaded again on Contracts (a duplicate,
  `intake.ts:124-139`): kept excluded, as the review chose, since a terms change normally comes as its own notice.
  (b) A letter already filed as a contract's document, or under another kind, that is in fact the payer's answer has no
  path to the response: a way to take a document out of a draft version, or Lane A's item 5 with a re-filing, would be
  the answer.
- **The orchestrator.** (i) `uploader.tsx` takes four changes, not only the kind (2.5.4): taken under the standing rule;
  if held to "only the kind", (a) and (b) are the floor and (c) and (d) go to UX PR 47. (ii) Files beyond prs.json's
  list (3.6), two of them shared with open drafts: `app/p/[practiceId]/contracts/page.tsx` (#75) and
  `lib/routes/uploads.ts` (#78). (iii) The Channel select is fixed here, though no finding names it (1.3). (iv) ADR 0085
  is used.
- **Lane A.** The five changes of 7.2.

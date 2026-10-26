# co-001/ux-forms: Scout B's inventory of the forms

Checkout `/home/user/ux-forms` (branch co-001/ux-forms, cut from claude/build-platform 4d99df8). All paths are under
`apps/web/src/` unless stated otherwise. #42 means the file is in open PR #42 (`/tmp/claude-0/pr42-files.txt`). The
scanner and its raw output are in the scratchpad (`scan/scan.py`, `scan/out2.txt`, `scan/action-route.txt`,
`scan/tour-errors.txt`).

## 0. Counts and headline facts

- **112 `<ActionForm>` call sites in 60 files.** The brief said 61; the true count is 60. Some components render more
  than once at runtime: TagForm and AnswerForm (`components/contracts/forms.tsx`) on 4 pages, MatchForm on
  reconciliation twice, and the per-row forms.
  - 68 forms have visible controls. 44 have only hidden fields and a button.
  - **#42 files with ActionForms (2 files, 6 forms):** `app/console/support/page.tsx` (2) and
    `app/settings/organizations/[organizationId]/users/page.tsx` (4). Both are fixed through ActionForm alone, with no
    edit to the page.
- **Only one page passes `labels`:** `app/p/[practiceId]/settings/pricing/page.tsx:23` (FORM_LABELS, used at :97 and
  :112). Its override reads 'Billing ZIP'. The control's own label reads 'Billing ZIP (ZIP+4 if Medicare needs one)'.
- **Raw controls inside ActionForms:** 49 (`<input>`, `<select>`, `<textarea>`, or `<Input>` from @tp/ui used without
  Field).
  - Plus 4 inputs in the versions page's local `Checkbox` (`abstraction/versions/[versionId]/page.tsx:46`).
  - Plus the controlled TemplateMapper.
  - 1 of the 49 is in a #42 file (users page :85).
- **Every visible named control has a label.** It is either `<Label htmlFor>`, `<label htmlFor>`, or a wrapping
  `<label>`. So `control.labels` resolves for every control. Groups have a fieldset and legend, except the two
  attestation checklists.
- **Radio groups:** one, `template` in `components/reconciliation/template-mapper.tsx:87,92`. It is controlled and
  sits inside an ActionForm.
- **Nothing uses `form=`.** No nested named buttons sit inside an ActionForm. version-form, which is not an ActionForm,
  has `name="intent"` buttons.
- **Secret fields (all in Field):**
  - Passwords: `app/sign-in/page.tsx:28`, `app/sign-in/new-password/page.tsx:28` and `:29`.
  - One-time codes: `app/sign-in/mfa/page.tsx:24` and `app/sign-in/enroll/page.tsx:34`. These are
    **type text** with `autocomplete="one-time-code"`, not type password. A "clear secrets" rule keyed on `type=password`
    alone would keep the code.
- **File inputs in an ActionForm:** one, `app/console/organizations/[organizationId]/page.tsx:291` (Signed PDF,
  posted with `fileField`).
- **Defect found that is not in mine.md (blocking, not #42):** the coverage checklist review form
  (`app/p/[practiceId]/coverage/page.tsx:283`, ActionForm with `reviewEvidenceFormAction`) renders **no FormKeys**: no
  requestKey and no CSRF token.
  - The route `lib/routes/models.ts:167` is a practice mutation (csrfToken required, `invoke.ts:367`), so every submit
    is refused, either csrf_refused or 'requestKey: reload the page and try again'.
  - No e2e test submits it. `lib/routes/models-routes.db.test.ts:580` calls the route directly.
  - Fix: add `<FormKeys />` at :284. It is a one-line change inside the PR's scope, since that file is touched anyway
    for its raw checkboxes.
- **No migration is needed for anything here.**

## 1. Per-file table (every ActionForm)

How to read the table:
- **Ctl** is the controls. F, S and T are Field, SelectField and TextAreaField. RAW is raw controls, with lines.
- **Keys** is how the request key and CSRF token are rendered: FK is `<FormKeys/>`, h() is the versions page's
  `hidden()` (FormKeys plus practiceId), fk() is `formKeys()`, {keys} is a prop, and "public" means none, by design.
- **Def** is where the default values come from.

| File | #42 | Forms (line: action) | Controls | Groups / special | Def | Keys |
|---|---|---|---|---|---|---|
| app/account/devices/page.tsx | | 46 revokeDevice | hidden deviceId | | | FK |
| app/account/notifications/page.tsx | | 42 saveNotificationPreferences | RAW checkbox digestEmail :45, inApp :49 (wrapping labels) | | defaultChecked prefs | FK |
| app/console/billing/page.tsx | | 80 issueAuditInvoice | S organizationId | | | FK |
| app/console/compliance/page.tsx | | 114 sendEvidence; 184 recordEvidence | 184: S kind, policy, member; F occurredOn(date), documentRef, sha256(pattern) | | | FK |
| app/console/models/page.tsx | | 60 kill switch; 77 setModelFlag | 60: hidden key, target, value; 77: S key, target; F value | 77: Flag reset to 'Kill switch' (narrow-other-02) | | FK |
| app/console/organizations/[organizationId]/page.tsx | | 65 status; 104 createPractice; 155 unlock; 162 endMembership; 173 invite; 212 resend; 265 recordAgreement; 278 uploadAgreement | 104: F name, npi(pattern), taxIdLast4(pattern), zip; 173: F email, S role; 265: S kind, practiceId, F version, signer, signedOn, documentRef, sha256; 278: S x2, F x3, **F type=file document** | file input (278) | | FK |
| app/console/organizations/page.tsx | | 34 createOrganization | S kind, F name | | | FK |
| app/console/practices/[practiceId]/page.tsx | | 72 setPracticeLocation; 94 setPracticeSettings | 72: F zip; 94: F x8, S defaultRounding | | zip=stored; settings=form.* (all stored) | FK |
| app/console/prospects/page.tsx | | 91 convert; 96 contacted; 102 decline | 102: S declinedReason (id per row) | | | FK |
| app/console/rule-releases/page.tsx | | 221 prepareRuleRelease | none | issue key 'release' | | FK |
| app/console/status/page.tsx | | 49 maintenance; 68 componentStatus (per row); 102 updateIncident (per row); 111 openIncident | 68: S status; 102: S status, T message; 111: F title, S impact, **RAW checkbox group `components[]` :119**, T message | fieldset+legend 'Components affected' :115-116 | S status = stored | FK |
| app/console/support/page.tsx | **#42** | 48 createSupportGrant; 99 endSupportGrant | 48: S practiceId, userId; F ticket(pattern), reason | | | FK |
| app/console/terms/page.tsx | | 64 publishTerms | F version, documentRef, sha256 | | | FK |
| app/console/tickets/page.tsx | | 82 setTicketStatus | hidden | | | FK |
| app/p/[practiceId]/abstraction/ledger/page.tsx | | 25 adjustEntry (per entry, in details) | RAW input amount :31 (Label), textarea reason :35 (Label), checkbox confirm :38 (wrapping, long label) | | | FK |
| app/p/[practiceId]/abstraction/page.tsx | | 148 withdrawQuestion | hidden | | | FK |
| app/p/[practiceId]/abstraction/regulations/page.tsx | | 88 confirmRegulation | RAW checkbox confirm :93 (wrapping) | | | FK |
| app/p/[practiceId]/abstraction/versions/[versionId]/page.tsx | | 118 proposeTerms; 138 rejectProposal; 155 approveField; 163 removeRateRecord; 187 addRateRecord; 278 updateVersion; 311 citeWindow; 356 verifyWindow; 398 approveVersion; 418 amend; 440 supersede; 455 askQuestion; 474 withdrawQuestion | 118: S documentId, RAW checkbox ambiguous :123; 187: F x9, S x7, **local Checkbox x4 :233-236**, F page, **RAW textarea quote :265**; 278: F x6; 311: S documentId, F page, **RAW textarea quote :320**, S unit, measuredFrom; 418: F x2, S; 440: F x2; 455: S topic, **RAW textarea question :464** | fieldset+legend 'Medicare adjustments…' :231-232 | 278: version.*; 311: version.disputeWindow.* | h() x13 |
| app/p/[practiceId]/anomalies/page.tsx | | 104 review; 111 requestValidation | hidden | | | FK |
| app/p/[practiceId]/cases/[caseId]/packet/[versionId]/review/page.tsx | | 313 attestPacket | RAW checkboxes `confirm_<id>` :322 (wrapping, item text) | no fieldset or legend | | FK |
| app/p/[practiceId]/cases/[caseId]/packet/page.tsx | | 409 requestApproval; 419 approve | 409: RAW textarea message :415 (Label) | | | FK |
| app/p/[practiceId]/cases/[caseId]/page.tsx | | 109 assign; 202 writeOff (in details); 229 reopen (in details); 266 note | RAW select ownerUserId :115; select reason :208; Input text :218; checkbox confirm :221 (long label); Input reason :235; textarea text :271 | write-off reason resets to 'Window passed' (a11y-practice-1-03) | owner = stored | FK |
| app/p/[practiceId]/cases/[caseId]/submissions/page.tsx | | 67 logSubmission; 299 recordResponse | RAW Input submittedOn :75, select channel :79, Input reference :90, Input followUpOn :94, checkbox sentWithoutSignOff :98; select kind :307, Input receivedOn :317, Input amount :321, select documentId :326, select denialCategory :338, checkbox reopensCase :348, textarea notes :354 | | submittedOn=maxOn; receivedOn=asOf; denialCategory='' | FK |
| app/p/[practiceId]/cases/page.tsx | | 72 triageRun; 133 openCase (per pattern); 171 setMateriality | RAW select runId :77; select ownerUserId :144; Input lineMateriality :177, caseMateriality :181 | 133: key 'pattern' | materiality = stored | FK |
| app/p/[practiceId]/claims/page.tsx | | 107 findClaim | F payerClaimControlNumber | | | FK |
| app/p/[practiceId]/contracts/versions/[versionId]/page.tsx | | 70 signOff | hidden | | | FK |
| app/p/[practiceId]/coverage/page.tsx | | 283 reviewEvidence; 306 suggestEvidence; 325 generateReport | 283: RAW checkboxes `keep:<n>` :290 (defaultChecked), dismiss :297 | fieldset+legend 'Keep the items that apply' | keep = checked | **283: NO FormKeys (bug)**; FK |
| app/p/[practiceId]/lines/[lineId]/page.tsx | | 293 addLineNote | RAW textarea note :299 (Label) | | | FK |
| app/p/[practiceId]/mapping/[planId]/page.tsx | | 152 mapPlan | S kind, contractVersionId, supersedesId; F effectiveFrom, lastDay | | | FK |
| app/p/[practiceId]/notifications/page.tsx | | 41 markRead | hidden | | | FK |
| app/p/[practiceId]/pricing-runs/[runId]/page.tsx | | 99 accept; 138 rerun | hidden | | | FK |
| app/p/[practiceId]/pricing-runs/compare/page.tsx | | 110 accept | hidden | | | FK |
| app/p/[practiceId]/pricing-runs/page.tsx | | 80 createPricingRun | RAW Input fromMonth :87, toMonth :91 (type month) | | | FK |
| app/p/[practiceId]/reconciliation/page.tsx | | 36 reverseMatch (component, in details); 352 matchClaim; 451 MatchForm (x2 uses) | 36: RAW textarea reason :42, checkbox confirm :45 (long label) | | | FK |
| app/p/[practiceId]/reconciliation/template/page.tsx | | 78 saveTemplate | TemplateMapper (controlled: radio `template`, input system, select date_format, select column_*; unnamed file input) | fieldset+legend 'Template' | current template | FK |
| app/p/[practiceId]/releases/page.tsx | | 96 rerun | hidden | | | FK |
| app/p/[practiceId]/reports/[reportId]/page.tsx | | 128 release | hidden | | | FK |
| app/p/[practiceId]/reports/[reportId]/review/page.tsx | | 102 attestReport | RAW checkboxes `confirm_<id>` :110 | no fieldset or legend | | FK |
| app/p/[practiceId]/reports/documents/[documentId]/page.tsx | | 92 generate | hidden (incl. month) | | | FK |
| app/p/[practiceId]/reports/monthly/page.tsx | | 63 generate | hidden (incl. month) | | | FK |
| app/p/[practiceId]/reports/page.tsx | | 93 generateReport; 192 monthly PDF; 225 coverage | RAW select runId :98; Input month :198 | | month=lastMonth | FK |
| app/p/[practiceId]/reports/roi/page.tsx | | 50 generateRoi | F periodFrom, periodTo (date) | | suggested quarter (shows a valid default beside a refusal) | FK |
| app/p/[practiceId]/settings/agreements/page.tsx | | 68 confirmAgreements | RAW checkbox confirm :72 | | | FK |
| app/p/[practiceId]/settings/correspondence/page.tsx | | 70 setCorrespondenceContact | F x8, S address_state | fieldset+legend (address) :79-80 | stored contact | FK |
| app/p/[practiceId]/settings/defaults/page.tsx | | 45 setMateriality; 67 setPursuit | F x2; F x3 | | stored | FK |
| app/p/[practiceId]/settings/pricing/page.tsx | | 97 setPricingLocation; 112 confirmPricingLocation | 97: F zip; 112: hidden confirm, shownZip, shownZipPlusFour | **labels={FORM_LABELS}** | zip=stored | FK |
| app/p/[practiceId]/settings/proof-level/page.tsx | | 54 setProofLevel | S proofLevel; RAW checkbox confirm :59 | | other level | FK |
| app/request-audit/page.tsx | | 53 requestAudit | F x5, T payers, S x2 | | | public |
| app/settings/billing/[organizationId]/page.tsx | | 92 choosePlan; 166 payInvoice | S plan | | | FK |
| app/settings/organizations/[organizationId]/users/page.tsx | **#42** | 74 changeRole; 80 endMembership; 103 invite; 138 resend | S role; RAW checkbox confirm :85; F email, S role | | role = stored or billing_manager | FK |
| app/sign-in/enroll/page.tsx | | 33 enroll | F code (**one-time-code**) | | | public |
| app/sign-in/mfa/page.tsx | | 23 mfa | F code (**one-time-code**) | | | public |
| app/sign-in/new-password/page.tsx | | 27 newPassword | F password, confirm (**password**) | | | public |
| app/sign-in/page.tsx | | 26 signIn | F email, **password** | | | public |
| app/support/page.tsx | | 49 createTicket | S category, F subject, T message; hidden screen | | | FK |
| app/terms/page.tsx | | 64 acceptTerms | hidden termsVersionId | | | FK |
| components/billing/payment-method-card.tsx | | 97 add ACH; 104 add card; 110 settle | F routingNumber, accountNumber; F cardNumber | | synthetic simulator values (testRouting, 000123456789, 4242…) | fk() |
| components/contracts/forms.tsx | | 44 TagForm; 77 AnswerForm | S payerId, contractId (or hidden when fixed), F title, effectiveFrom, lastDay; RAW textarea answer :84 | | | FK |
| components/screening/convert-form.tsx | | 57 convert | F contactName, locations, T payers, S billingArrangement | | | public |
| components/screening/split-form.tsx | | 92 approveSplit | unnamed controlled Inputs; hidden `settings` (built in JS) | not progressively enhanced | split in force | {keys} |

## 2. Raw controls to move onto the shared fields

**Not #42; migrate in this PR:**
- `app/account/notifications/page.tsx`: 45, 49 (checkboxes)
- `app/console/status/page.tsx`: 119 (checkbox group `components[]`)
- `app/p/[practiceId]/abstraction/ledger/page.tsx`: 31 (input), 35 (textarea), 38 (checkbox)
- `app/p/[practiceId]/abstraction/regulations/page.tsx`: 93 (checkbox)
- `app/p/[practiceId]/abstraction/versions/[versionId]/page.tsx`: 123 (checkbox); 265, 320, 464 (textareas); local
  Checkbox at 46-53 (used at 233-236)
- `app/p/[practiceId]/cases/[caseId]/packet/[versionId]/review/page.tsx`: 322 (checkbox list)
- `app/p/[practiceId]/cases/[caseId]/packet/page.tsx`: 415 (textarea)
- `app/p/[practiceId]/cases/[caseId]/page.tsx`: 115, 208 (selects); 218, 235 (Input); 221 (checkbox); 271 (textarea)
- `app/p/[practiceId]/cases/[caseId]/submissions/page.tsx`:
  - selects: 79, 307, 326, 338
  - Inputs: 75, 90, 94, 317, 321
  - checkboxes: 98, 348
  - textarea: 354
- `app/p/[practiceId]/cases/page.tsx`: 77, 144 (selects); 177, 181 (Input)
- `app/p/[practiceId]/coverage/page.tsx`: 290, 297 (checkboxes, with the FormKeys fix)
- `app/p/[practiceId]/lines/[lineId]/page.tsx`: 299 (textarea)
- `app/p/[practiceId]/pricing-runs/page.tsx`: 87, 91 (Input month)
- `app/p/[practiceId]/reconciliation/page.tsx`: 42 (textarea), 45 (checkbox)
- `app/p/[practiceId]/reports/[reportId]/review/page.tsx`: 110 (checkbox list)
- `app/p/[practiceId]/reports/page.tsx`: 98 (select), 198 (Input month)
- `app/p/[practiceId]/settings/agreements/page.tsx`: 72
- `app/p/[practiceId]/settings/proof-level/page.tsx`: 59
- `components/contracts/forms.tsx`: 84 (textarea)
- `components/reconciliation/template-mapper.tsx`: radio group 87/92, input 111, selects 115/133. These are controlled.
  They need only the error mark and message (via context), not a value fix.

That is 48 raw controls in 19 files, plus the local Checkbox and TemplateMapper. Shared components this needs:
- **CheckboxField** (a single checkbox with a short name for errors, distinct from its long consequence label).
- **CheckboxGroup** or **ChoiceGroup** (fieldset, legend and issue key; for `components[]`, `keep:<n>`, the `template`
  radios and the `confirm_<id>` lists).
- **Field** already serves `type=month` and `type=date`.
- **TextAreaField** lacks an `error` slot and an `aria-invalid` style. **SelectField** has `error`, but lacks `hint`,
  an `aria-invalid` style and passthrough of other props (for example `onChange` or `disabled`); it takes only label,
  name, options, required, id, defaultValue and error (`components/field.tsx:139-208`).

**#42; leave as is.** The fix reaches them through ActionForm and the shared fields only:
- `app/settings/organizations/[organizationId]/users/page.tsx`: 85 (checkbox confirm, wrapping label).
- `components/screening/upload-form.tsx` (not an ActionForm): its own `FIELD_NAMES` table (:55-64). This is the
  per-form label table that design question 3 retires. Retire it after #42.

## 3. Issue keys the server returns, and whether each names a control of its form

Where issue keys come from:
- Zod issues come from `invoke.ts:83-85` and `issuesOf` (path joined with '.', or 'input' when there is no path).
  Keys equal the form's control names, because `formInput` (`lib/http/form.ts`) passes names through and folds
  `name[]` into `name`.
- Explicit `InputError` and handler refusals come from `invoke.ts:300-320`.

**Keys that map to no control of their form.** Today each shows as the raw key; the "message alone" column is what the
summary would say with no field name.

| Key | Source (file:line) | Form(s) | Message alone would say |
|---|---|---|---|
| `requestKey` | lib/http/invoke.ts:107; lib/routes/billing.ts:73 | every mutation (hidden) | "reload the page and try again" |
| `input` | invoke.ts:84 (no-path Zod); :310 (ContractWorkflowError without issues); :320 (pg 23514 rule); billing.ts:80; lib/screening/routes.ts:1212,1215 (#42) | any; mostly users and console membership rules, contract workflow, simulator | the database rule's text (for example the last-administrator rule) or the workflow message |
| `refused` | lib/cases/refusals.ts:14,22,25 (underPacketRules: settings.ts:317,338; submissions.ts:160,252; workbench open case; packets); models.ts:37 (proposeTerms, rejectProposal) | defaults materiality and pursuit, submissions log and response, cases open, versions propose and reject, version-form | the packet rule's or proposal's own message |
| `pattern` | lib/routes/workbench.ts:71,76 | cases/page.tsx:133 openCase (hidden key fields) | "…below the case materiality of $X, so it keeps accumulating; lower the case materiality to open it" or PATTERN_NOT_WAITING |
| `contact` | lib/routes/settings.ts:519 (#42) | settings/correspondence | CorrespondenceContactRefused message |
| `status` | lib/routes/console.ts:104 (#42) | console org 65 (hidden) | "a closed organization is neither suspended nor reinstated". (support.ts:443 `status` on updateIncident maps to its select.) |
| `platform` | lib/routes/compliance.ts:213,222 | console/compliance 114 sendEvidence (no controls) | "no compliance platform is connected yet: download the export and give it to the platform" |
| `release` | lib/routes/rule-releases.ts:136,143 | console/rule-releases 221 (no controls) | "this server has no content checkout; …" or the release tool's error |
| `organizationId` | apps/worker/src/billing/account.ts:167,185,188,289 (BillingRefusedError) | settings/billing choosePlan, payInvoice, simulator (hidden); **maps** on console/billing (select) | "the organization has no payment method on file; its administrator adds one in Settings first", and so on |
| `invoiceId` | account.ts:277,280 | settings/billing payInvoice (hidden) | "only an unpaid invoice is paid" |
| `membershipId`, `invitationId` | settings.ts:1027,1062 (#42); console-onboarding.ts:202 | users page, console org (hidden) | "this invitation was accepted, or its membership has ended" |
| `termsVersionId` | lib/routes/onboarding.ts:275 | terms 64 (hidden) | "a newer version of the terms is in force; read it and accept that one" |
| `releaseNo`, `runId` | lib/routes/pricing.ts:222,225,228,322 | pricing-runs create, rerun, accept (hidden) | LOCATION_WAITING, or "…; reload the page to price under the release in force" |
| `caseLineId` | lib/routes/triage.ts:475 | case reopen (hidden) | "a line past its window, or without one, cannot be actionable, so it is not reopened" |
| `entryId`, `versionId` | lib/routes/specialist.ts:85,155 | ledger adjust, regulations (hidden) | "the entry, or the match it came from, was reversed; it is never adjusted again" |
| `reportId`, `pdfSha256` | lib/routes/reports.ts:229,232,235,275,278 | report review, release (hidden) | "only a generated report is attested"; "the files the checklist showed are not this report's; reload the checklist" |
| `shownZip` | settings.ts:672 (LOCATION_CHANGED_ISSUE; #42) | pricing confirm 112 (hidden; FORM_LABELS names it) | LOCATION_CHANGED |
| `questionId` | abstraction.ts:490 | versions 474, abstraction 148 withdraw (hidden) | "the question is already answered or withdrawn" |
| `month` | lib/routes/report-documents.ts:31 | monthly :63 and documents :92 (hidden); maps on reports :198 | "the month of service the summary covers" |
| `match`, `serviceLineId`, `claimId`, `remittanceId`, `matchId`, `amount` | lib/routes/reconciliation.ts:130-136 (REFUSALS) | MatchForm, matchClaim (all hidden); reverse (reason and confirm only) | "this evidence is already matched…", "the amounts do not agree to the cent…", "the match was already reversed" |
| `quote` | abstraction.ts:82,266,368 | **maps** on addRateRecord and citeWindow; unmapped on approveField 155, verifyWindow 356, approveVersion 398 | EVIDENCE_PROBLEM_TEXT + "; check the document, the page number and the quote" |
| `disputeWindow`, `disputeWindowRule`, `disputeWindowDays`, `citation` | packages/contracts/src/services.ts:204,611,618,624,716,753,761 | verify, approve and cite forms; `disputeWindowDays` lives on the other form (updateVersion) | "cite the page that states the dispute window first", "enter the window's days first" |
| package-internal Zod paths | packages/contracts/src/services.ts:92 | versions forms | dotted paths of the workflow's own schema |
| `settings` | lib/screening/routes.ts:1302,1309,1314 (#42) | console screening split (hidden, built in JS) | the split rule's message |
| `components` | Zod path from lib/routes/support.ts:393-396 (componentList) | console/status 111; the controls are named `components[]` | with none ticked, the preprocess passes `undefined`, so the message is Zod's "Invalid input: expected array, received undefined", not 'choose at least one component' (a11y-other-09). `namedItem('components')` finds nothing, and `namedItem('components[]')` returns a RadioNodeList, which ActionForm skips. |
| `kept`, `kept.<n>` | lib/routes/models.ts:155-165 (withKept preprocess) | coverage 283 (`keep:<n>`) | Zod's array message |
| `template` | lib/reconciliation/template.ts:72 (and lib/routes/reconciliation.ts:328) | reconciliation/template (radio group: RadioNodeList, unmarked today) | the template problem text |
| packet export reasons | lib/routes/packets.ts:252 | ExportRequestForm (not ActionForm) | handled by `refusalCodes` |
| sign-in steps: none | lib/routes/sign-in.ts:42-46 (MESSAGES), :85-86 (policy as `problems`) | mfa, enroll, new-password | error only; no field is marked (a11y-other-08) |

**Keys that map, with a label caveat.** The name should be the label as shown, but several labels carry text that
reads badly in an error line:
- **Parentheses:**
  - 'Billing ZIP (ZIP+4 if Medicare needs one)'
  - 'Last month (blank for one month)'
  - 'Per line (dollars)'
  - every '(optional)'
- **Long consequence sentences on confirm checkboxes:** write-off (WRITE_OFF_CONSEQUENCE, `lib/routes/triage.ts:411`),
  reverse, adjust, regulations, agreements, proof-level and users.
- **Item text on attestation checklists.**

The single source for the name therefore needs a short-name override on the control itself. A data attribute such as
`data-error-name`, set by CheckboxField or Field, would keep the label as the source without a per-form table.

## 4. Forms not on ActionForm that post

| Component | How it posts | Reset defect? | Error-naming defects |
|---|---|---|---|
| components/packets/version-form.tsx:118 | `<form action={writeDispatch}>`; buttons `name="intent"` (save, code_draft) and a per-button `formAction={modelDispatch}` (model_draft) | **Yes.** promptPayState select :125 and `attach:<id>` checkboxes :139 reset. The NarrativeEditor is controlled (`narrative-editor.tsx:19,27`) and survives. | Prints raw `{issue.field}:` (:155); no aria-invalid, no focus, no summary focus. Keys: refused, intent, narrative, promptPayState, attach:*. An onSubmit port must build `new FormData(form, event.nativeEvent.submitter)` and route model_draft to its own dispatcher. |
| components/packets/export-status.tsx:69 ExportRequestForm | form action; hidden fields only | No (nothing typed) | Non-refusal issues print raw `{issue.field}:` (:93) |
| components/screening/split-form.tsx | is an ActionForm | Controlled; survives | Key `settings` unmapped. The live problem list is not a live region and the fields are not marked (a11y-other-09). Without JS it posts an empty `settings`, so it is not progressively enhanced (its inputs are unnamed by design). |
| components/screening/convert-form.tsx | is an ActionForm (public) | Yes (via ActionForm) | All keys map (contactName, locations, payers, billingArrangement), plus `input` |
| components/screening/upload-form.tsx (#42) | onSubmit + preventDefault + startTransition (:117-147) | No | Own FIELD_NAMES table (:55-64); leave until after #42 |
| components/hardware-key.tsx:70 | onSubmit + preventDefault; controlled email; fetch JSON | No | Message only (no field); focus is dropped (a11y-other-07, out of this PR unless shared) |
| components/billing/stripe-payment-method.tsx:213 | onSubmit; Stripe Element | No | Stripe's own messages |
| components/uploads/uploader.tsx | no `<form>`; fetch JSON | No | Shows `issues[0].message` only (:100) |
| components/reconciliation/template-mapper.tsx | inside an ActionForm; controlled | No (its unnamed sample file input is cleared by today's reset, the preview state is kept) | `template` and `column_*` keys: the radio group is unmarked |
| app/sign-in/** (page, mfa, enroll, new-password) | ActionForm | Yes: the email is lost; passwords and codes are cleared (which is right for secrets) | mfa and enroll return an error with no issue; the policy arrives as `problems`, no field marked |
| components/shell.tsx:97 sign-out (#42) | form action | n/a | n/a |
| GET filter forms (remittances, cases :192, pricing-runs compare :107, anomalies, mapping, claims :52, coverage letter :347, monthly :50, contracts, packets/reference-search) | method=get navigation | n/a | out of scope |

## 5. e2e tests that refill after a refusal, or will see kept values

Playwright's `fill()` clears the field before typing, and `check()` and `selectOption()` are idempotent. So **no
existing test breaks because values are kept.** The refills only stop proving anything.
- `e2e/helpers.ts:29-33` enterPassword: it does `page.goto('/sign-in')` every time, so values are never kept across
  calls. Unaffected.
- `e2e/helpers.ts:42-56` signInWithTotp: refills the code with `fill`. It passes either way. If codes are cleared on a
  refusal, it still passes.
- `e2e/sign-in.spec.ts:55-63` lockout loop: enterPassword is a fresh page each time. Unaffected. Add: after a wrong
  password, Email still holds the address and Password is empty.
- `e2e/onboarding.spec.ts:291-299`: refills email and password after 'Too many attempts' with `fill`. Passes. Add a
  kept-email assert.
- `e2e/contracts.spec.ts:114-116` (enterRecord refill) and `:140-147`: the comment says "The refused form is reset, as
  the rate record's is: the page, the quote and the rule are entered again." **The comment must change.** The code
  passes (fill and selectOption).

**Will break or must change:**
- `e2e/onboarding.spec.ts:536-542` asserts all of the following:
  - `getByRole('alert').filter({ hasText: 'Billing ZIP: five digits, or ZIP+4 such as 27601-1234' })`. This relies on
    FORM_LABELS overriding the DOM label 'Billing ZIP (ZIP+4 if Medicare needs one)'.
  - `aria-invalid=true` and `toBeFocused()` on the ZIP field.

  It breaks if the override goes, if the item format or wording changes (words-other-01 rewrites the message to
  'Billing ZIP: enter five digits…'), or if focus moves to the summary first.
- `e2e/helpers.ts:63` `refusal(page)` is `page.locator('[data-slot="alert"]')`, used with strict `toContainText` in:
  - sign-in.spec.ts:57,61
  - onboarding.spec.ts:294,298,299
  - contracts.spec.ts:116,145,210 (filtered by 'Not done')

  If the PR adds a **second** `[data-slot="alert"]` in a refused state (for example a per-field message built with
  `<Alert>`), these fail in strict mode. Inline field errors must not use Alert. Keep the summary's title 'Not done'
  (contracts.spec filters on it).
- `e2e/screening.spec.ts:716-719` (#42; upload-form) asserts `aria-describedby="field-zip-error field-zip-hint"`.
  Field's error-then-hint order (`components/field.tsx:4-7`) must not change.

**Success path (design risk, not a refill):**
- Nearly every action redirects to the **same path** with `?notice=`. Today React's form reset clears the form after
  that success.
- With onSubmit + startTransition nothing resets, and Next keeps the client ActionForm mounted across a same-route
  navigation. So a create form (invite, add note, rate record, open incident, write-off, ask a question) would show the
  last entry again after it was saved, and the old `state.error` summary can persist. Verify this in the build.
- The design should reset explicitly on success. Two options:
  - `form.reset()` once the transition settles with no new state;
  - key the form by its request key.
- Forms submitted twice successfully in e2e use fill, selectOption or check, so they pass either way:
  - onboarding: Send invitation x3, Create practice x2, Upload agreement x2, Save/Confirm billing ZIP
  - packets: Write…version x3, Request approval x4
  - contracts: Tag to the payer x2, Verify the window x2
  - models: Propose the terms x2
  - billing: Choose plan
- No ActionForm unit test exists. `components/action-form.test.tsx` is new.

## 6. The screen tour's refused-form states

From `/home/user/ops/tools/lane-b-screen-tour/capture/tour.spec.ts`. The helper `refused()` (:536) waits for
`[data-slot="alert"], [role="alert"]` matching
`/Not done|Check the fields|Not sent|Not signed in|Account locked|Nothing was uploaded/`. Keep 'Not done', or update
this regex for the after-shots. `press()` (:813) is a click, with a dispatchEvent fallback.

**ActionForm refusals (before and after for this PR):**

| Shot key (line) | Route | Form | What it types or chooses |
|---|---|---|---|
| sign-in.error-wrong-password (936) | /sign-in | signIn | lockout email, wrong password |
| sign-in.error-locked (2948-2962) | /sign-in | signIn | ten wrong passwords |
| sign-in-mfa.error (1112) | /sign-in/mfa | mfa | code 000000 |
| sign-in-new-password.error-mismatch (1158) | /sign-in/new-password | newPassword | two different passwords |
| sign-in-new-password.error-policy (1165) | /sign-in/new-password | newPassword | 'syntheticpassword' twice |
| sign-in-enroll.error (1202) | /sign-in/enroll | enroll | code 000000 |
| request-audit.error (1033) | /request-audit | requestAudit | requestForm (:1023): name, email, Organization 'SYNTHETIC CLINIC 2026-01-01', 2 locations, payers, billing |
| screening-result.error-name (1416) | /screening/results/[resultId] | convert | name ' ', 2, payer |
| console.organizations.error (1520) | /console/organizations | createOrganization | Name ' ' |
| console.organization.error (1543) | /console/organizations/[id] | invite | support persona's email |
| console.practice.error (1564) | /console/practices/[id] | location | ZIP '0001' |
| console.billing.error (1600) | /console/billing | issueAuditInvoice | SYNTHETIC BILLING FIRM |
| console.compliance.error (1618) | /console/compliance | recordEvidence | Policy approved, policy 1, 2030-01-01, ref, sha |
| console.models.error (1640) | /console/models | setModelFlag | budget flag, Everyone, '5.00' |
| console.status.error (1661) | /console/status | openIncident | title and update, no component |
| console.support.error (1680, #42 page) | /console/support | createSupportGrant | ticket SYN-REFUSED-1, reason ' ' |
| console.terms.error (1700) | /console/terms | publishTerms | version '2026 11', ref, sha |
| support.error (1720) | /support?from=remittances | createTicket | Subject with 'date of birth', message |
| settings.billing-org.error (1820) | /settings/billing/[id] | add ACH | routing '12345' |
| settings.users.error (1839, #42 page) | /settings/organizations/[id]/users | invite | viewer's email, Enter |
| p.abstraction.error-tag (1904) | /p/[id]/abstraction | TagForm | payer index 0, no title or date |
| p.abstraction-ledger.error-adjust-zero (1951) | /p/[id]/abstraction/ledger | adjust | 0.00, reason, ticked |
| p.abstraction-version.error-amend (1977) | /p/[id]/abstraction/versions/[id] | amend | 2026-01-01 |
| p.cases.error (2029) | /p/[id]/cases | setMateriality | 'abc' |
| p.case.error (2056) | /p/[id]/cases/[id] | writeOff | reason Other, ticked, no words |
| p.submissions.error (2156) | /p/[id]/cases/[id]/submissions | recordResponse | Partial, received date, no amount |
| p.claims.error (2213) | /p/[id]/claims | findClaim | SYNNOMATCH0001 |
| p.contracts.error (2253) | /p/[id]/contracts | TagForm | payer C, contract, overlapping dates |
| p.contract.error (2272) | /p/[id]/contracts/[id] | TagForm (fixed contract) | overlapping dates |
| p.line.error (2357) | /p/[id]/lines/[id] | addLineNote | ' ' |
| p.plan.error (2381) | /p/[id]/mapping/[id] | mapPlan | contract kind, 2026-01-01, no version |
| p.pricing-runs.error (2417) | /p/[id]/pricing-runs | createPricingRun | 2026-04 to 2026-03 |
| p.reconciliation.error-reverse (2479) | /p/[id]/reconciliation | reverseMatch | reason ' ', ticked |
| p.roi.error (2584) | /p/[id]/reports/roi | generateRoi | 2026-09-30 to 2026-04-01 |
| p.correspondence.error (2749) | /p/[id]/settings/correspondence | contact | Name 'SYNTHETIC@OFFICE' + phone, street, city, state, ZIP |
| p.defaults.error (2776) | /p/[id]/settings/defaults | setPursuit | rate 42.00 only |
| p.pricing-settings.error (2795) | /p/[id]/settings/pricing | setPricingLocation | ZIP '1234' |

**Browser-only or non-ActionForm error states.** Context for this PR; their behaviour should not change:
- screening.error-member-id, error-dos (1328), error-zip, error-no-phi (1347): #42, upload-form.
- console.screening.error (1776): split-form live list, nothing submitted.
- p.packet.error-live-check (2081): narrative live check.
- p.template.error (2505): sample file.
- p.reconciliation.error-empty-file (2461) and p.uploads.error-era-system (2656): uploader.
- sign-in-hardware-key.error-no-credential (997) and error-locked (2968), sign-in-register-key.error (1262).
- p.coverage.error-letter-codes (2326): a GET handler that answers raw JSON.

**Forms the tour never refuses:**
- versions: add rate record, cite window
- console org: agreements
- prospects decline
- version-form
- coverage checklist review (which would show the FormKeys bug)
- the attestation checklists
- confirm agreements and proof level

## 7. Facts the design should hold to

1. **Progressive enhancement.** Keep `action={formAction}` with onSubmit + preventDefault.
   - Without JS the post still runs, but the page re-renders from the server, so values are lost there (no echo, by
     rule).
   - split-form is JS-only by construction (unnamed inputs, settings built in the browser).
   - hardware-key is JS-only (WebAuthn).
2. **FormData.** Use `new FormData(form, submitter)` to keep parity with React's own submit, which includes the
   submitter. ActionForm has no named submitters today; version-form does.
   - `$ACTION_*` fields are skipped by `formInput` (`lib/http/form.ts:10`).
   - File entries reach `formUpload` as before.
3. **Secrets.** Clear `type=password` **and** `autocomplete=one-time-code` fields on a refusal. Keep the email.
   - The simulator's routing, account and card numbers are synthetic test values; keeping them in the browser is
     fine.
4. **One source for the name.** Use the control's own `<label>` (`control.labels`), with a short-name attribute on
   the control for long or parenthesised labels (checkboxes, attestation items).
   - For a group, take the fieldset's legend (from a RadioNodeList or `name[]`).
   - For a key with no control, show the message alone, never the key.
   - Retire the `labels` prop (FORM_LABELS is its only user) or keep it as an override, and update
     onboarding.spec.ts:539.
5. **Inline messages** must not be `<Alert>` (the e2e strict-mode constraint above). The summary keeps the title
   'Not done' (contracts.spec and the tour regex).
6. **Message rewrites (words-other-01)** live in `lib/routes/console.ts`, `settings.ts`, `practice.ts`, `index.ts` and
   `lib/screening/routes.ts`. All are #42 files, so those rewrites wait for #42. The ActionForm, Field and page changes
   touch no #42 file.
7. **No migration** is needed for anything in this inventory.

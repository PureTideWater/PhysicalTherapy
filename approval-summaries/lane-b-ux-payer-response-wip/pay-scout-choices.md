# Scout A: choices that record a fact (UX-035)

Started 2026-10-28. Checkout /home/user/ux-payer-response @165c5993.

## Status
- [ ] requirements read
- [x] requirements read (UX-035 lane-b-ux-review.md:1629-1646; UX-007 :1705-1722; U-UX-6 in approval-summaries/lane-b-ux-forms-reviews.md)

## 1. Write-off facts (so far)
- WRITE_OFF_REASONS packages/triage/src/cases.ts:93 = window_passed, payer_correct_on_review, not_worth_pursuit, duplicate, other; labels WRITE_OFF_TEXT :96-102; writeOffSchema :105-111 (text only and required for other)
- DB mirror WRITE_OFF_REASON_VALUES packages/db/src/schema/triage.ts:23; CHECK in migration 20261019160000:194
- writeOffLineAction apps/web/src/lib/routes/triage.ts:463-495: id practice.cases.write_off, permission case.work, phi, input z.object caseLineId, reason z.enum(WRITE_OFF_REASONS), text optionalText(500), confirm z.literal('on') (:471); audit case_line_written_off/case_line (:472); writeOffSchema re-check (:474-477); caseLineState (:478) -> NotFound; only if writtenOffReason null: UPDATE case_line SET written_off_reason, written_off_text (encrypted), written_off_by=app_actor_id() (:483-488); NO window check; NO line_status insert (no stage change); redirect case page. sample reason not_worth_pursuit (:493)
- WRITE_OFF_CONSEQUENCE triage.ts:455-456
- reopenLineAction triage.ts:503-535 refuses windowEndsOn null or windowPassed with InputError field caseLineId (:516-518) -> pattern for the new refusal
- caseLineState apps/web/src/lib/triage/queries.ts:668-690: loads window_ends_on and window_passed = (p.window_ends_on IS NOT NULL AND p.window_ends_on < (now() AT TIME ZONE 'UTC')::date), FOR UPDATE OF cl
- caseDetail queries.ts:579ff gives each line windowEndsOn/windowPassed (:592, :631-632) -> page has it per line
- DB: case_line_rules() packages/db/functions/case_line_rules.sql (migration 20261019160000:465-523). For a person's write-off (written_off_by set) :35 checks only actor = written_off_by and case.work; NO reason/window check. System write-off (by NULL) :32 requires reason window_passed AND not a person AND window_end not null AND window_end < today. Reopen :55 refuses window_end null or < today. CHECK case_line_system_writes_off_passed_windows (migration :213). => no DB rule today on a person's window_passed while open; adding one = recreate case_line_rules() in a new migration (Lane A).
- 'Window passed' = the line's OWN first-level window priced_line.window_ends_on (engine date, calendar days from BPR16 payment date; packages/triage/src/deadline.ts:13-21); system write-off apps/worker/src/triage/execute.ts:380-403; EXPORT_REFUSAL_TEXT.next_window_passed apps/web/src/lib/packets/export-attempts.ts:39-40 says "Do not write the lines off for it: their first-level windows are not this level's deadline" -> next-level window is NOT a window_passed write-off
- Case page form: apps/web/src/app/p/[practiceId]/cases/[caseId]/page.tsx:215-226 (details 'Write this line off' :217; Reason SelectField :222 required, options all WRITE_OFF_REASONS, no empty; Why Field :223; Confirmation CheckboxField :224); reopen form hidden when line.windowPassed||windowEndsOn null (:227); 'Window ends' shown :187
- writeOffFormAction cases/[caseId]/actions.ts:9-11 runAction (no refusalState); DB 23514 -> invalid issue field 'input' (apps/web/src/lib/http/invoke.ts:317-320); InputError -> invalid with issues (:301-303); next.ts refusedInput :186-198
- PRD: write-off reasons named only (docs/product/PRD.md:516); actionable needs window open on day of triage (:496); destructive confirm (:302)
- Reasons vs facts: window_passed checkable (window_ends_on not null and < today UTC); payer_correct_on_review, not_worth_pursuit, duplicate, other = person's judgment (no stored fact decides them)

## 3. What #74 gives (so far)
- SelectField apps/web/src/components/field.tsx:232-293: options Choice{value,label}|ChoiceGroup; choiceOption :203-209 renders <option value> only (NO disabled option support); no placeholder prop; error/errorName/issueFor/hint; showChosen :244ff (measured, aria-hidden line)
- Precedent for empty first option + required, ENABLED: components/screening/upload-form.tsx:169 ('Choose a state'); app/console/prospects/page.tsx:115-121 ('Choose a reason', required)
- ActionForm apps/web/src/components/action-form.tsx:61-96: no noValidate -> browser constraint validation runs before onSubmit; ADR 0077 keeps browser validation (docs/adr/0077...:201 'Turn browser validation off (noValidate). Kept for later')
- useGuardedSubmit form-issues.tsx:226-293: onSubmit preventDefault, sends FormData; no form reset on refusal (kept values)
- Route parse issues -> {field: path, message: zod message} apps/web/src/lib/http/invoke.ts:84; enum message precedent: z.enum(VALUES, 'choose ...') apps/web/src/lib/routes/abstraction.ts:227-228; requiredText 'fill this in' schemas.ts:20
- HTML: select reset/default selection skips DISABLED options (first non-disabled option gets selectedness) -> a disabled placeholder without defaultSelected falls back to 'Window passed' on reset/no-JS; enabled placeholder needs nothing

## 2. Payer response facts (so far)
- Form: apps/web/src/app/p/[practiceId]/cases/[caseId]/submissions/page.tsx:264-323 Card 'Log a payer response' (:265,:267); CardDescription :268 ('upload the payer's letter on the Uploads screen first'); EmptyState when no documents :271-276; ActionForm recordResponseFormAction :278; Response SelectField id response-kind :283 required, options PERSON_RESPONSE_KINDS (no empty); Received on :284 defaultValue asOf min latest.submittedOn max asOf required; Amount :285-291 (hint); Document SelectField :292-307 required showChosen (also no empty option -> first document preselected!); Denial reason :309-316 defaultValue '' with 'None'; Reopen checkbox :317; Notes :319
- Page doc :84-100 "recording a response moves no money and no stage"; header :116-119 'payer approved and recovered ... come from the recovery ledger, not from a response recorded here'; log line :375-380 '<amount> the payer will pay (Payer approved once the recovery ledger approves it)'
- Also pre-answered: submission Channel select :75 (SUBMISSION_CHANNELS first) -> same class of defect, not in UX-035 (note only)
- Route recordResponseAction apps/web/src/lib/routes/submissions.ts:207-286: PERSON_RESPONSE_KINDS :195 accepted, partial, denied, info_requested; DENIAL_CATEGORIES :196; schema :222-232 kind z.enum (no message); amount rule :236-239 (accepted/partial need amount; others none), :240-242 >0, denial-only checks :243-248; submission belongs :249-252; recordResponseOnce via underPacketRules :253-266; doc comment :198-206 "Recording it writes no ledger entry and moves no line (LED-01)"; audit payer_response_recorded/payer_response :234
- recordResponseOnce apps/web/src/lib/packets/submissions.ts:364-376 (same latest response again = no-op) -> recordPayerResponse apps/worker/src/packets/services.ts:756-790 INSERT payer_response, doc :748-755 "never writes a ledger entry and never moves a line (LED-01): the recovery ledger does both from the response (acceptedPayerResponses) and the remittances ... The case's state follows from it"
- DB payer_response table migration 20261023090000:230-260: CHECK amount iff accepted/partial and >0 (:253); evidence doc (:254); reopen only denial w/ reason (:257); rules payer_response_rules.sql: never changes once recorded (UPDATE refused :16-18), reopen window; payer_response_belongs.sql: person w/ submission.log in own name, latest submission only, received_on in [submitted_on, today], on/after previous response, doc of practice; payer_response_within_asked.sql: amount <= lines' variance + interest; payer_response_refresh_case trigger -> case_rules
- case_rules.sql:48-73: state derived; with no line yet payer_approved/recovered: latest response accepted -> 'resolved'; partial -> 'partially_resolved'; info_requested or denied+reopens -> awaiting_response; denied (no reopen) -> 'resolved' (ELSE branch!) ; no response -> submitted
- Ledger: reconcile pass apps/worker/src/reconcile/pass.ts:40 approveFromResponses (reconcile/responses.ts:46-86): EVERY accepted/partial response (acceptedPayerResponses services.ts:963-990, all, not only latest) -> 'approved' ledger_entry per asked line not written off, amount allocateByWeight by variance, capped at variance minus approved already, evidence payer_response; then syncLineStages (reconcile/stages.ts:73-104) moves lines to payer_approved (ledger_line_stage.sql: approved>0 -> payer_approved). STAGE_EVIDENCE approved: claim|payer_response packages/ledger/src/stages.ts:37-40
- reconcile runs: daily monitoring schedule (apps/worker/src/platform/monitoring-schedule.ts:51), after an upload/intake (intake.ts:224, monitor/job.ts:79), after triage (triage/job.ts:35), settings change (routes/settings.ts:414), reconciliation upload (routes/reconciliation.ts:334); NOT on response record
- => a mistaken Accepted: case reads Resolved at once; next reconcile writes approved entries and moves the asked lines to Payer approved; a later response cannot undo the approved entries (all accepted responses are read); recovered still needs posted/deposited
- RESPONSE_TEXT apps/web/src/lib/cases/timeline.ts:13-19 (Accepted, Partially accepted, Denied, More information requested); CASE_STATE_TEXT components/triage/display.tsx:14-19 (Resolved, Partially resolved, Awaiting response)
- Brand: 'Recovered' never without posted/deposited (.claude/rules/brand.md 'Every money figure...'; CO-11 docs/product/change-order-001.md:93-97)
- Refusal messages name rules never values (lib/cases/refusals.ts:7-10; invoke.ts:318); CLAUDE.md: no PHI in error message -> no window date in the refusal

## 1b. Edge facts
- actionable.ts:11-15: NO_WINDOW (null window = not open); CONTRACT_WINDOW_RULE_NOT_COMPUTED: product says neither open nor passed (engine date may be earlier or later than contract's); caseLineState/case page ignore rule-computed (windowPassed from window_ends_on only); triage closeWindows execute.ts:399-408 writes off open cases' lines with window_ends_on < asOf (daily)
- case lines inserted only by triage insertCaseLines execute.ts:377-385 (struck at once if window passed) and e2e helper
- windowPassed is monotonic per case line (priced_line immutable, case_line.priced_line_id never changes: case_line_rules.sql:25-28)
- Stage question (not decided): write-off form shows for any line not written off whatever its stage (page.tsx:215), incl. payer_approved/recovered; DB no stage check -> 'Payer correct on review' vs a payer's acceptance -> founder
- Same-class pre-answered selects outside UX-035: submission Channel (submissions/page.tsx:75), response Document (:292-307, first document preselected; UX-007 territory)

## 4. Tests that pick these selects (all choose explicitly; none relies on the default)
- e2e/triage.spec.ts:139-176 picks 'Other' (:147); comment :150-151 'a reset would put back "Window passed"' becomes stale
- e2e/unattested.spec.ts:146-152 'Not worth pursuit'; e2e/export-attempts.ts:67-70 'Not worth pursuit'
- e2e/packets.spec.ts:477-532 response 'partial' (:483); comment :485-486 'a reset would put back the first kind' stale
- tour /home/user/ops/tools/lane-b-screen-tour/capture/tour.spec.ts:2312-2330 (write-off-open; error picks Other :2326), :2445-2459 (Partial via optionIndex :2453)
- route db tests: audit-e2e.db.test.ts:554-566 (not_worth_pursuit), export-attempts-routes.db.test.ts:221,260 (not_worth_pursuit), unattested-submission-routes.db.test.ts:362 (other) -> none uses window_passed on an open line
- harness components/test-support/forms-harness.tsx:115-118,139 + action-form.browser.test.tsx:379 (own REASONS, defaultValue window_passed) unaffected
- #51 and #52 merged (gh api); #42 open; #42 files include docs/product/test-matrix.md (pr42-files.txt:86), packages/synth/src/cases/matrix.ts (:136), registry.ts (:137) BUT LANES.md rule 6 makes these shared docs (precedent lane-b-ux-forms.md:1143-1148) -> CAS-45..48 may land
- registry style: none(8, '<no-file reason>', [asserting test files]) packages/synth/src/cases/registry.ts:238-251
- prs.json order 10: tests 'unit: ... the write-off route refuses Window passed while the window is open' -> really a route db test (*.db.test.ts)
- Status: all 4 parts researched; next = write report
- DONE: report written to /home/user/ops/designs/lane-b-ux-payer-response/scout-choices.md (2026-10-28)

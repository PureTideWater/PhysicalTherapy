# Build C3 (slice C on the eight waiting pages + packets.spec step)
Started 2026-10-27. Worktree /home/user/ux-forms at 2982890. Design + status + build notes read.
## Pages
- DONE abstraction/ledger: amount -> Field (id amount-<id>, label "Change in dollars" (parenthetical moved into the 5.4 hint), pattern kept); reason -> TextAreaField; confirm -> CheckboxField (id confirm-<id>, errorName Confirmation). Label import dropped.
- DONE cases/[caseId]: Owner select -> SelectField (id case-owner, Unassigned option); write-off Reason -> SelectField (id reason-<line>); Why -> Field (id text-<line>, label kept: triage.spec asserts "Why: ..."); confirm -> CheckboxField (id confirm-<line>, errorName Confirmation); reopen Reason -> Field (id reopen-<line>); note -> TextAreaField (id case-note). Input/Label imports dropped.
- DONE cases/[caseId]/submissions: SubmissionForm: submittedOn Field, channel SelectField, reference Field, followUpOn Field (template label), sentWithoutSignOff CheckboxField (id <prefix>-sent-without-sign-off, errorName Confirmation; unused data-confirm attr dropped). Response form: kind SelectField, receivedOn Field, amount Field (id amount, hint moved to hint prop -> same amount-hint id), documentId SelectField (label as template string), denialCategory SelectField (None option), reopensCase CheckboxField (errorName "Reopen the case"), notes TextAreaField. Input/Label dropped.
- DONE reconciliation: ReverseForm reason -> TextAreaField (id reason-<match><suffix>); confirm -> CheckboxField (id confirm-<match><suffix>, errorName Confirmation). Label import dropped. Match forms are hidden-only: unchanged.
- DONE cases/[caseId]/packet: request-message -> TextAreaField (id request-message). Label import dropped.
- DONE packet/[versionId]/review: confirm_<id> list -> CheckboxGroup legend "Confirm each item before you attest", issueKey "confirm" (as the report review page), required boxes.
- DONE lines/[lineId]: note -> TextAreaField (id note). Label import dropped.
- DONE coverage: review form still lacked <FormKeys /> at the merged head (real defect) -> added; keep:<n> boxes -> CheckboxGroup legend "Keep the items that apply", issueKey kept (value on, defaultChecked, same label node); dismiss -> CheckboxField (id evidence-dismiss, errorName "Dismiss the checklist"). data-item attr dropped (no test reads it). Letter GET form untouched (as earlier slices: GET forms untouched).
- DONE e2e/packets.spec.ts: J10 step gains the refused partial response before the recorded one (summary "Not done" + "Additional amount the payer will pay: what the payer accepted, in dollars and cents", response kept partial, amount aria-invalid + focused, no recorded notice); header + matrix list name FRM-01.
- DONE registry.ts FRM-01 assertedBy += apps/web/e2e/packets.spec.ts (rule-6 shared doc; on pr42 list as a shared doc).
## Keys checked
- coverage: reviewEvidenceAction (models.ts:167-181, withKept preprocess) proposalId (hidden), kept (array; issue path kept or kept.<i>, resolves to fieldset data-issue-for=kept), dismiss. MATCH.
- lines: addLineNote (remittances.ts:291) note. MATCH.
- review: attestPacketExportAction ATTEST_INPUT (packets.ts:328) caseId, versionId, pdfSha256, csvSha256 (hidden), ...ATTEST_CONFIRMATIONS confirm_<id> per box: each resolves by its own name. MATCH. refused -> refusalState error.
- packet: requestApprovalAction (packets.ts:207) message. MATCH.
- reconciliation: reverseMatchAction (reconciliation.ts:247) matchId, reason, confirm. MATCH.
- submissions: logSubmissionAction (submissions.ts:135) submittedOn, channel, reference, followUpOn, sentWithoutSignOff (:158,:177); recordResponseAction (:222) kind, amount (:237,:240), documentId, receivedOn, denialCategory (:243,:246), reopensCase, notes. MATCH.
- cases/[caseId]: writeOffLineAction (triage.ts:471) caseLineId, reason, text, confirm (+writeOffSchema paths reason/text); reopenLineAction reason; assignCaseAction ownerUserId; addNoteAction text; refused -> refusalState error. MATCH.
- ledger -> adjustEntryAction (lib/routes/specialist.ts:146-150): amount, reason, confirm; entryId (hidden, not_standing) shows as message alone. MATCH.
## Tests
## Left / proposals
- eslint (9 page/spec files + registry.ts): clean. tsc apps/web --noEmit: clean. pnpm synth --all: 1 written (FRM-01 expected.json assertedBy), 635 unchanged.
- vitest unit form-hints.test.ts + packages/synth: 14 files, 188 passed.
- pnpm lint:copy: clean (517 files).
- db tests: not run: no route, schema or db-asserted markup changed (models-routes.db.test.ts calls the coverage route directly; unchanged).
- e2e packets.spec.ts: not run (needs the full e2e stack and browser; status item 3).
## STATUS: all eight pages, packets.spec step and registry done; result returned.

# Merge of claude/build-platform 72096e94 (#75) into co-001/ux-payer-response

Base: origin/claude/build-platform = 72096e9468781a83602443a788d7056c706b568b (#75 merge). Branch was a97d6011 (merge-base 83d71fd6; 43565235 = #83's merge, already in).
Arrived: #92, #93, #90, #42, #95, #91, #94, #107, #105, #75.
Commits (local, NOT pushed):
- f03381def1fad988046a9870c34ae81879f9c3a0 Merge claude/build-platform (72096e94: #75 the contract PHI check, #42, #90, #93 and the rest) into co-001/ux-payer-response (parents a97d6011, 72096e94)
- 32bfde407ae2036c95c6a528d0a08ebdb0229d34 Packets journey: set the Contracts kind back to Contract, not to its first option (follow-up; e2e found it after the merge commit, since E2E_PREBUILT needs a clean committed tree to stamp; no amend)
Both end with the given Co-Authored-By / Claude-Session trailer. HEAD 32bfde40; tree clean.

## Conflicts and resolutions (design 3.7, the #75 row)
1. apps/web/src/components/uploads/uploader.tsx: #75's kind handling kept whole (startingKind, KindField required, disabled "Choose a kind" placeholder + KIND_HELP, held files for explicit Upload, batchProblems, afterChoosing, leaveAsks(batch, held), counted(), initialKind), with this PR's five changes on top:
   - KindField renders only when kinds.length >= 2 (a lone kind starts chosen via startingKind).
   - Single mode refuses through batchProblems(chosen, kind, limits, single?) (new exported SingleFile type): >1 file, a zip or a type not in the kind's types -> single.refusal; empty -> "The file is empty."; too large -> single.tooLarge(limit). afterChoosing and uploadHeld pass `single` too; a second file beside one held -> single.refusal (not "At most 1 file"). declaredType now takes {name,type}.
   - Held files' Upload/Clear already type="button" (#75); Retry type="button" (this PR).
   - headingLevel applies to the drop zone heading, the batch title and Receipts; #75 adds no heading (its waiting-list title is a <p>).
   - Leave guard: #75's useLeaveGuard(leaveAsks(batch, held.length)) (covers stillSending) beside this PR's inFlight/onBatchChange report, so held files and in-form sends both ask.
   - gate keeps this PR's title + #75's limits comment; Choose button = #75's ref/outline variant + this PR's "Choose a file" label; accept guards a null kind; header comment keeps both paragraphs (in-form one: guard asks "while the letter is being sent or waits to upload (leaveAsks)").
2. apps/web/src/app/p/[practiceId]/contracts/page.tsx: this PR's title "Upload a contract, exhibit or payer’s terms letter" (id contract-upload-title, over #75's upload-contract-title) and RESPONSE_LETTER_ELSEWHERE sentence beside #75's description; #75's limits (union of the kinds' types); kinds={upload.kinds} (route labels from CONTRACT_KIND_LABELS, "Payer’s terms or policy letter"), under #75's "Choose a kind" placeholder; this PR's heading, headingLevel 3, formatBytes size.
3. apps/web/src/components/reconciliation/display.test.tsx: one union import; all tests kept (base 26 + ours 4 + #93's 1 = 31, no duplicate names).
4. apps/web/e2e/uploads.spec.ts: #75's selectShows steps/comment kept; region found by this PR's heading name "Drop 835 files or ERA exports here".

Made to agree with the merged uploader:
- apps/web/e2e/contracts.spec.ts (#75's new step, merged cleanly): panel by this PR's title, drop zone by its heading (not "Drop zone").
- apps/web/src/components/uploads/uploader.test.tsx: gate gains title: null (this PR's type); added tests: lone kind shows no kind select (single mode markup: "The file is", accept=application/pdf, no multiple); batchProblems single mode; afterChoosing single mode.
- apps/web/e2e/packets.spec.ts (commit 32bfde40): `kind.selectOption({ index: 0 })` hit #75's disabled placeholder; now selectOption('contract').

## Both-sides files checked (script: every added line of each side present, no extras; only the intentional title/id and import differences)
test-matrix.md (no duplicate ids, each prefix ordered, CAS-45..48 kept), synth matrix.ts, registry.ts, reconciliation/display.tsx, test-support/forms-harness.tsx, cases/[caseId]/page.tsx, reconciliation/page.tsx, lib/routes/uploads.ts, uploads/contracts-routes/reconciliation-routes db tests, e2e packets/reconciliation/triage/uploads specs. uploader.test.tsx was #75's only (not both sides).

## Regenerated
pnpm install --frozen-lockfile: ok. watched.ts --write: 553 lines, no diff. pnpm synth --all twice: 0 written both times (292 cases, 693 unchanged; 8 EMR formats).

## Checks
- typecheck 0 (first run caught the test gate title, fixed, rerun 0); lint 0 (also at 32bfde40); lint:copy 0; lint:logs 0; check:fixtures 0.
- vitest unit (uploads, reconciliation, packets incl. response-letter.browser.test): 6 files, 84 passed.
- route db tests on fresh tp_paymerge_72096e94 (PG18 5433, which was down and was started with pg_ctl -D /root/pgdata18; 45 migrations incl. #42's mail_streams): uploads, unattested-submission-routes, contracts-routes, reconciliation-routes, workbench-routes, billing-routes: 6 files, 81 passed. Dropped.
- pnpm build 0; E2E_PREBUILT=1 (E2E_DATABASE=tp_e2e_paymerge75, E2E_PORT=3485, admin 5433) at f03381de: uploads, contracts, packets, reconciliation, triage: 7 passed, 1 failed (packets.spec:662, above). After 32bfde40: rebuilt, stamped, packets.spec 2 passed. E2E db dropped; 5433 has only postgres/template0/template1.

## What reads or looks different from a97d6011, beyond #75's own changes
WHAT-CHANGED: yes
- Log a payer response, after the upload request is refused: the letter now stays in the form as "Waiting to upload: 1 file" with "Upload 1 file" and "Clear" (#75's keep-on-refusal applied to the form), the "Choose a file" button turns outline, and leaving the page asks while it waits. Before, the refusal cleared the file.
- Log a payer response: dropping or choosing a second file while one waits is refused with the form's sentence ("Choose one PDF: the payer’s letter itself, not a zip or another kind of file.") under "Nothing was uploaded".
- Nothing else on the form changes: no kind select or placeholder or kind help (lone kind), same headings (h3), same words, Retry still type="button".
- Contracts panel: this PR's title, sentence, heading (h3) and "Payer’s terms or policy letter" label now sit under #75's unchosen "Choose a kind" select with its help line, so the select starts on "Choose a kind" rather than Contract. That is the two sides together, nothing new from the merge.
- Uploads and Reconciliation panels: no difference beyond #75's.

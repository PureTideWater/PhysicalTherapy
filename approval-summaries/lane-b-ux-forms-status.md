# Lane B: ux-forms status (co-001/ux-forms)

**Continued 2026-10-27 01:20 UTC** by session_01TAgFZo3SGSTBEfKRjX1jeG (a Lane B item session started by Lane A's
orchestrator, session_01TrKDxeLbxVo7t7zwRXFzrg). GitHub login: PureTideWater. Machine: setup-container OK except the
Playwright browser (storage.googleapis.com refused; **waiting on the person: storage.googleapis.com** for local browser
tests of record and the UX review's screenshots). Then the UX review's PR 6 and PR 7 in the same session.


Forms keep what the person typed, and name the refused field (the UX baseline review's first PR). Built by
session_01VNsi2Kru6pfk8CAbQ2AaYB; stopped cleanly at 2026-10-26 10:10 UTC on the orchestrator's wind-down. The next
session (Lane A or Lane B) continues from here.

## Now (2026-10-27 19:20 UTC)
- **PR #74** (draft), head **4f0b526**, subscribed. CI on 4f0b526: green but e2e (1/2), FRM-06's test bug (commented on
  the PR; fixed in the worktree, rides the fix round's push).
- **Reviews done** (`approval-summaries/lane-b-ux-forms-reviews.md`): 16 real findings, all fixed in this PR but U-UX-6,
  deferred to UX PR 10 `co-001/ux-payer-response` (the baseline's UX-035).
- **Galleries** (private to this account; the co-founder shares them from each page's Share menu): before (e908c21)
  1280 https://claude.ai/artifact/JTLJX4saVr5nQ59EEvDDo7, 390 https://claude.ai/artifact/E7CDHT8hUTpPZMq6TKK18J;
  after (4f0b526, what the reviews saw) 1280 https://claude.ai/artifact/7f5Xg3Kj8992F1jBTh7Hew, 390
  https://claude.ai/artifact/N1ikEiBauh8PDGvVnNNhgU.
- **Fix round part 1, wf_723c6bc6-add:** the three fixers finished (F1 form core, F2 fields and styles, F3 words and
  components); the account's 5-hour limit stopped the run at ~17:12 UTC (records, check, verifiers). **Resumed 19:12
  UTC** with resumeFromRunId (PostgreSQL restarted by the setup script). The fixers' work in progress is saved at
  **`co-001/wip-ux-forms` 44ed04f** (no PR, no CI): if this container is gone, check that commit out over 4f0b526 and
  continue the fix round from `approval-summaries/lane-b-ux-forms-wip/fix-*.md`. Check-in trig_01UDQayFbYZBj7M92B9swn7Q
  at 2026-10-28 00:20 UTC.
- **Next:** commit locally; fix round part 2 (the full local suite once, the after shots retaken at the new head, the UX
  findings re-checked from them); one push; the PR description; the fresh-clone verification reading CI; merge.

## Handoff
- **Branch:** `co-001/ux-forms`, head **17bbb70**, pushed, on claude/build-platform 7ef421b (#54 included). Two commits:
  0c0ea22 (slices B, D, E) and 17bbb70 (slice A without #50's files, the C pages no open PR touches). No PR is open.
- **Design:** `designs/lane-b-ux-forms.md` (sections 1 to 12; section 7 is the file list by slice, 7.9 the landing
  order, 8 the tests, 12 the review's 23 dispositions). Scouts and review in `designs/lane-b-ux-forms/`.
- **Reserved IDs:** ADR 0077 (written: `docs/adr/0077-…md` on the branch), test-matrix FRM-01 to FRM-08 (in
  `docs/product/test-matrix.md`, `packages/synth/src/cases/{matrix,registry}.ts`), synth MODULE_NUMBER 16 for FRM
  (confirmed by the orchestrator 09:27; `common.ts`, fixtures `fixtures/synthetic/FRM-01..08`).
- **No migration**, no new dependency, no #42 file (only the three shared documents, LANES.md rule 6).
- **Builders' notes:** `designs/lane-b-ux-forms/build/` (the API spec, each slice's log, both integration checks).
- **Workflow scripts:** `workflow-scripts/lane-b-ux-forms-{design,build-1,build-2a}-*.js`. The component API every
  slice codes against: section 3 of the design, as built in `apps/web/src/components/form-issues.tsx`, `field.tsx`,
  `password-field.tsx`.

### Built and tested
| Slice | What | Tests (local; no CI yet, no PR) |
|---|---|---|
| B: sign-in and server words | the code and password steps refuse on their own field; a code with spaces or a hyphen accepted (client and `sixDigitCode`); routing, account, request-audit, evidence date, terms version, no-payment-method words; `listed()`; `componentList` | words and Cognito unit 18; db: sign-in and onboarding routes 25, billing routes plus the 12 generated security route files 6,877, worker billing and sign-in 23 |
| D: console and shared surfaces | console status `CheckboxGroup`; format hints; `/support` no-PHI hints; hardware key (aria-disabled, status line, alert focus, "Not registered"); uploader's hidden input out of the tab order; split form (`role=status`, marks, `beforeSubmit`); Stripe form; `LoadingState` announced (`loading-announcement.tsx`) | packages/ui and component unit tests (in the 319 below) |
| E: e2e, personas, docs | `apps/web/e2e/forms-keep-input.spec.ts` (written, **never run**: it needs the new ActionForm), four personas, `triage.spec.ts` refused write-off, `contracts.spec.ts` comment, ADR 0077, ADR 0056 and BRAND.md notes, FRM rows | synth deterministic (`pnpm synth --all` 0 written) |
| A, part: the form core minus #50's files | `form-issues.tsx` (context, `RefusalSummary` named by the page's labels, `useGuardedSubmit`, `PendingStatus`, `summaryLead(state, placed)`), `field.tsx` (client; `CheckboxField`, `CheckboxGroup`; `data-secret` for codes), `password-field.tsx`, `form.ts` comment, ui `button`/`input`/`styles.css` (2 px invalid mark, 16 px below 48rem, scroll padding, wrapping); the in-repo browser harness | `action-form.browser.test.tsx` 16 passed, 6 todo; apps/web components + packages/ui + synth unit: 319 passed, 6 todo, 2 failing that wait (below) |
| C, part: pages no open PR touches | cases, reports, report review (`CheckboxGroup`), pricing runs, version and export forms, abstraction regulations and versions (hints), agreements, proof level, settings pricing, contracts forms, template mapper; all `labels=` props removed (incl. #54's defaults, console models and practice settings); e2e `refusal()` also matches `[data-slot="refusal-summary"]` | eslint clean on every changed file; lint:copy, lint:logs clean |

**Typecheck now:** 4 errors, all fixed only by #50's files (`export-status.tsx:106` needs `ActionState.invalid`;
`split-form.tsx:139,148` need ActionForm's `beforeSubmit`). **Unit failures now:** the synth registry test (FRM-04 names
`action-form.test.tsx`, which #50 creates) and `form-hints.test.ts` (the ledger amount hint, which waits for #51).

### What remains, in the landing order
1. **When #50 (co-001/superseded-rerun) merges** (it was open at a3c583d, CI green, at 10:09): merge
   claude/build-platform into the branch with a merge commit (rule 6), `pnpm install`, then slice A's last three files
   (design 7.1; details in the build-2a check, `designs/lane-b-ux-forms/build/build-2a-check.md`, summarised here):
   - `components/action-form.tsx`: keep every #50 export (`refreshOnError`, `RefreshAfterRefusal`, `RefusalTakeover`,
     `noteRefusal`, `takesFocus`, `summaryLead` (re-export from form-issues), `takesOrphanedRefusal`,
     `RefusalFallback`); adopt `useGuardedSubmit`, `FormIssues`, `RefusalSummary`, `PendingStatus` (inside the button's
     `flex flex-wrap items-center gap-2` wrapper); the button `aria-disabled`, never `disabled`; add `beforeSubmit`;
     remove `labels` and `problems`; render `RefreshAfterRefusal` for `stale` too; the header comment on 2.2's two
     conditions (pass the server action itself to `useActionState`, never a wrapper; never render FormKeys in a layout).
   - `lib/http/next.ts`: keep #50's `invalid`; add `stale`; drop `problems`; the lead words of 3.5; `csrf_refused` and a
     requestKey-only refusal become `stale` (3.5a).
   - `components/action-form.test.tsx`: #50's `summaryLead(state, true/false)` calls become `(state, 1)`/`(state, 0)`,
     plus 3.5's new cases.
   - Fill the 6 `it.todo` browser tests and swap the harness form for the real ActionForm.
2. **When #51, #52 and #49 merge** (rule 6 each time): slice C on the eight waiting pages (design 7.3, 7.4):
   #51: `abstraction/ledger` (input + the hint `form-hints.test.ts` asserts, text area, `CheckboxField`),
   `cases/[caseId]` (write-off Reason select, checkbox as `CheckboxField errorName="Confirmation"`, inputs, text area),
   `cases/[caseId]/submissions` (selects, inputs, checkboxes, text area), `reconciliation` (reverse reason
   `TextAreaField`, checkbox); and `e2e/packets.spec.ts`'s refused "Partially accepted" step (exact steps in
   `designs/lane-b-ux-forms/build/build-E.md`), then add it to FRM-01's `assertedBy`.
   #52: `cases/[caseId]/packet` (text area), `packet/[versionId]/review` (`CheckboxGroup` "Confirm each item before you
   attest"), `lines/[lineId]` (text area); `words.ts` merges trivially with #52's.
   #49: `coverage` (add the missing `<FormKeys />` to the review form, a real defect: every submit is refused today;
   `keep:<n>` as a `CheckboxGroup issueKey="kept"`, `dismiss` as a `CheckboxField`).
3. **Then the rest of the pipeline:** the full typecheck, lint and unit; run `forms-keep-input.spec.ts` and the
   affected e2e (sign-in, onboarding, contracts, triage, packets); a draft PR into claude/build-platform from the
   template (written with update_pull_request, read back), subscribed; two adversarial reviews (UX and brand with
   before and after screenshots of the refused forms at 1280 and 390 px via `tools/lane-b-screen-tour`, TOUR_REF the
   base then the head, `*.error.*` shots; security and accessibility with `.claude/agents/security-reviewer.md` plus
   WCAG 2.1 AA, 2.2's 3.3.7 and 2.4.11); a fix round with the full local suite; a fresh-clone verification reading CI;
   merge per lane-b.md "Merging".
4. **After #42 merges:** the follow-up `co-001/ux-forms-after-42` (design 7.8): upload-form.tsx (`a11y-other-15`,
   its own label table retired), console support Ticket hint, the users page's raw checkbox, and the ZIP, email and
   screening wordings.

### Notes for the next session
- gitleaks reads a synthetic password literal in a test as a key: build such values from parts in one constant
  (`TYPED_PASSWORD` in `action-form.browser.test.tsx`).
- The browser unit tests run in vitest's unit project with the installed Playwright Chromium (about 8 s warm, 34 s
  cold), under the heavy lock.
- Proposals outside this PR are in the design's section 11.2 and the build summaries: "enter at most {n} characters"
  wording in packets.ts, settings.ts, submissions.ts and reconciliation/template.ts; a note on `NewPasswordStep` for an
  empty `problems` list; a shared `RadioGroup`; a per-box message in `CheckboxGroup`.

## Log
| Time (UTC) | Stage | Detail |
|---|---|---|
| 2026-10-26 04:57 | Started | Machine set up (setup-container OK; gh login PureTideWater). Worktree /home/user/ux-forms, co-001/ux-forms from 4d99df8. |
| 2026-10-26 06:25 | Design done | `designs/lane-b-ux-forms.md` (wf_58d3ea85-4e0: three scouts, the author, one adversarial reviewer with 3 blocking, 11 should-fix and 8 nits, all dispositioned in its section 12). **No migration.** ADR 0077 (amends 0056's type scale for phones). FRM-01 to FRM-08 written. Mechanism proved in a real browser: `action=` kept for the no-JavaScript post, onSubmit + preventDefault + synchronous startTransition, nothing echoed from the server; success resets through Next's redirect remount; passwords and codes emptied after a refusal; a ref guards double presses; a dropped connection keeps the values. Unit tests run in the existing Playwright browser (no new dependency; apps/web/package.json is #42's). |
| 2026-10-26 06:25 | Waiting on #50 | #50 (superseded-rerun) also rewrites `action-form.tsx` and `next.ts` and adds `action-form.test.tsx`; it is at its final verification. The build starts on the base once #50 merges, keeping #50's exports. Postgres restarted after the worker restart (setup-container re-run). |
| 2026-10-26 09:05 | Resumed, build part 1 | The 5-hour limit stopped the session about 06:15; resumed 09:00 on the orchestrator's message. Branch fast-forwarded to 7ef421b (#54 merged). #50 still open (a3c583d, CI green), so build part 1 (wf_2292c24d-611) builds slices B, D and E against the design's component API; slice A, C1 and C2 follow once #50 merges. |
| 2026-10-26 09:27 | Build part 1 done; part 2a | Part 1 (wf_2292c24d-611): slices B, D, E, 54 files, committed 0c0ea22 and pushed (no PR yet). Checks without slice A: lint:copy, lint:logs, tsc for ui/synth/worker clean; 203 unit tests pass; db tests of the changed routes pass (sign-in and onboarding 25, billing and the 12 generated security route files 6877, worker billing and sign-in 23). Synth module 16 confirmed for FRM by the orchestrator (09:27). Part 2a (wf_0ee7c77c-8b4): slice A without #50's three files, and the C1/C2 pages no open PR touches. Waiting: #50 (action-form.tsx, next.ts), #51/#52/#49 (eight pages). |
| 2026-10-26 09:52 | Build part 2a done | wf_0ee7c77c-8b4: slice A's new files (form-issues.tsx, field.tsx, password-field.tsx, the ui styles, the in-repo browser harness with 16 browser tests passing and 6 todo until ActionForm adopts them), and the C pages no open PR touches. I removed the last `labels=` props (#54's defaults, console models and practice settings) and widened the e2e `refusal()` helper to the new summary. gitleaks refused a synthetic test password literal once: rewritten unpushed (a joined constant), pushed as 17bbb70. Checks: typecheck has only the 4 errors #50's files fix; eslint, lint:copy, lint:logs clean; unit 319 passed, 2 failing that wait for #50 (the synth registry names action-form.test.tsx) and #51 (the ledger hint). Waiting on #50, then #49, #51, #52. |
| 2026-10-26 10:10 | Stopped (wind-down) | The orchestrator's wind-down of 10:09 UTC (weekly usage at 90%; Lane B hands over to Lane A). Nothing was running; the #50 waiter was stopped. Branch pushed at 17bbb70, worktree clean, no PR, no scheduled check-in. Handoff below. |

## Decisions (each with its reason in the design)
- Keep values in the browser, never echo them (security, the safer option); without JavaScript the post works and shows the errors, but values are lost (the accepted cost).
- Field names come from the label the person sees, read from the page: one source, no per-form table.
- The summary first in the form, "Fix the field(s) listed here, then try again.", items linking to fields; inline "Error:" under each field; a 2 px danger border (not colour alone).
- Secrets (password, one-time code) emptied after a refusal, with a note under each.
- 16 px controls below 48rem; a pasted code with spaces accepted, client and server.
- Show password: yes (hidden until mounted, spell check and autocapitalise off, re-hidden before submit).
| 2026-10-27 01:44 | Resumed; base merged | Brief read. claude/build-platform (e908c21: #50, #51, #52, #49, #56, #53, #55, #48) merged into the branch with a merge commit, 9f9757e: seven conflicts, all keep-both (test matrix, matrix.ts and registry.ts RCC before FRM; synth modules RCC 14 and FRM 16; personas; the support page keeps #56's category default and the branch's hints). `watched.ts --write` regenerated (2982890: form-issues.tsx, loading-announcement.tsx). Typecheck: only split-form's 3 errors left (ActionForm's `beforeSubmit`, slice A). Next: build workflow (slice A's three files, C on the eight waiting pages, the browser tests, e2e packets step). |
| 2026-10-27 01:51 | Build 2b running; pause | Build workflow wf_7d776c57-f07 started 01:46 (builders A2: action-form.tsx, next.ts, action-form.test.tsx, the browser todos; C3: the eight waiting pages, packets.spec step; then an integration check, a design critic and a fixer). Script `workflow-scripts/lane-b-ux-forms-build-2b-wf_7d776c57-f07.js`; progress files in this session's scratchpad `progress/build-{A2,C3}.md`, `build-2b-check.md`, `critic-2b.md`, `fix-2b.md`. **The orchestrator's pause (01:50, weekly usage 94%, reset 14:00 UTC):** this workflow finishes; then no new workflow until 14:05. Check-in scheduled 2026-10-27T14:05Z (trig_01KiYG9d8Ghh5mDSXj3MUH8V). Next: commit and push the build, then the draft PR and its reviews after 14:05. |
| 2026-10-27 02:45 | Build 2b done; holding | wf_7d776c57-f07 completed (51 min; 5 agents): slice A on #50's files, slice C on the eight waiting pages, packets.spec refused step, FRM-02's three redirects, next.test.ts; critic's 11 gaps all fixed (version form and export form now read a stale page again; attestation lists name boxes by legend; hidden inputs named by data-error-name, recorded in ADR 0077 D3 and design 12.1). gitleaks refused a literal request key in next.test.ts once: rewritten unpushed (randomUUID), pushed 4f0b526. Holding until 14:05 UTC (check-in trig_01KiYG9d8Ghh5mDSXj3MUH8V); "Resume at 14:05 UTC" above. |

| 2026-10-27 14:18 | Resumed; PR #74; reviews | Setup re-run: everything ok, Playwright's pinned Chromium 1194 laid out (storage.googleapis.com allowed). Browser unit tests 24/24 of record. Draft PR #74 opened (description read back identical), subscribed. Reviews workflow wf_1a8adc67-91d started (e2e, security and accessibility, UX and brand with shots; adversarial verification). |

| 2026-10-27 16:00 | Reviews done; fix round | wf_1a8adc67-91d (23 agents, 95 min): e2e of the never-run specs (one test bug fixed, 22/22), security and accessibility review, UX and brand review from 153+153 shots, every finding verified (16 real). CI on 4f0b526: one e2e failure, the same test bug (PR comment). Tour captures for #74's states committed on claude/build-ops (merged with UX PR 5's download-refusal helpers, both kept). Fix round part 1 started: wf_723c6bc6-add. |

| 2026-10-27 19:20 | Limit stop; resumed | Fix round part 1 (wf_723c6bc6-add): the three fixers done by ~16:51; the 5-hour limit stopped records, check and verifiers at ~17:12. The four galleries published (private). 19:08 the orchestrator's resume: WIP saved to co-001/wip-ux-forms 44ed04f, PostgreSQL restarted, the workflow resumed from its run. |

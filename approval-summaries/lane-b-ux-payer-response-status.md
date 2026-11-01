# Lane B: ux-payer-response status (co-001/ux-payer-response)

The UX baseline review's PR 10: the payer's answer and the write-off reason start unchosen; the payer's letter is
uploaded inside "Log a payer response"; the server refuses a reason the line's own facts contradict (UX-035, blocking at
baseline, and UX-007; C-065 and C-011; deferred from #74's review as U-UX-6). **From 2026-11-01 owned by Lane B's
orchestrator (session_01FcouKNNHsdecRMzfTs7XwW) and run by its item session
session_01FcouKNxBLBBy2FVM7bfSvj (https://claude.ai/code/session_01FcouKNxBLBBy2FVM7bfSvj)** (prompt: `lanes/lane-b-item-prompts-2026-11-01/ux-payer-response.md`).
Before 2026-11-01 it was run by session_01TAgFZo3SGSTBEfKRjX1jeG on Lane A's orchestrator's order (history below).

## Now (2026-11-01 16:59 UTC)
- **PR #85: open, draft, head 29dded52, base claude/build-platform 83d71fd6; `mergeable_state` dirty, 0 check runs.**
  Its branch sits on 165c599 (#74) and lacks 56ed6279 (#81) and 83d71fd6 (#78). Conflicts with the base: `uploader.tsx`
  (3 hunks), `docs/product/test-matrix.md`, synth `matrix.ts` and `registry.ts`. `lib/routes/uploads.ts` now merges cleanly
  (#78 merged as 83d71fd6); `uploader.tsx` conflicts with it.
- **Subscription:** `subscribe_pr_activity` on #85 refused for this session ("Could not subscribe", both owner spellings,
  2026-11-01 16:59); PR state is polled with `pull_request_read` and send_later check-ins instead.
- **Lost:** the old reviews run wf_be925c9b-c8d (its progress files `rev85-sec.md`, `shots85.md`, `rev85-ux.md` and
  `pay-build-result.json` were in the old session's scratchpad; no findings file; the tour spec has none of #85's
  `cap(...)` steps). The reviews start again (step 3). The old check-in trig_01VmPUaCgFFjDLZev4GuKyfh (Lane A's account,
  2026-10-28) is gone; no task exists for this item.
- **Synth:** no new module; **module 21 is unused** (reported to the orchestrator for release under rule 4). CAS-45 to
  CAS-48 are no-file registry entries in module 5, and synth's no-file output `fixtures/synthetic/CAS-4{5..8}/expected.json`
  is on the branch (critic nit n5).
- **Machine:** setup-container OK (2026-11-01 16:59); GitHub login PureTideWater.
- **Next:** step 2, the base merge (workflow), then the two reviews, fix round, description, verification, merge
  (last of #82, #86, #75, #84, #83, #85).
- **For Lane A** (design 7.2; reported to the orchestrator 2026-11-01 16:59 for the handoff to Lane A before 2026-11-03 14:00 UTC):
  1. `case_line_rules()` refuses a person's "Window passed" while the window is open or unknown;
  2. `console_contract_queue()` leaves out response letters, with an index on `payer_response (practice_id, document_id)`;
  3. `payer_response_belongs()` applies the handler's letter check;
  4. `contract_version_documents_ok()` refuses a letter a response names (3 and 4 take the `document_use:` lock key);
  5. **a security item:** an upload-time link column on the uploaded document (design 2.8, 8.1).
- **Waiting on someone:** the founder (design 8.2, write-off of a line at Payer approved or Recovered; does not block);
  runbook 3i (does not block); the orchestrator (8.2 i–v; does not block).

## History: the state at 2026-10-28 05:55 UTC (stale; kept as record)
- **Design done** (wf_6c170a1a-e77; `designs/lane-b-ux-payer-response.md`, 1,499 lines; scouts in
  `designs/lane-b-ux-payer-response/`; the review `review.md` there, 28 findings (12 should-fix, 16 nits), all applied:
  section 9). **No migration.** ADR 0085 (needed: section 5.1); CAS-45 to CAS-48, each a no-file registry entry in
  module 5; no new module (synth writes no-file `expected.json` for CAS-45 to 48).
- **Decisions taken** (the recommended option, recorded with reasons in the design):
  - every select that records a fact starts on an enabled empty first option with `required` (ADR 0085 D1, narrowed:
    a controlled select outside any form may keep a disabled one); the Channel select too, though no finding named it;
  - the write-off lists only reasons that can be true for the line, and the route refuses "Window passed" on an open or
    unknown window (no date in the refusal: the window end derives from the payment date);
  - the payer's letter is uploaded inside "Log a payer response" through the uploader, which takes five small additive
    changes (the kind, a non-submitting Retry, a finished-upload callback, single-file mode, a heading level), beyond
    prs.json's "only the kind": with only the kind a re-uploaded letter is a held duplicate with no way forward;
  - the route checks the letter a response names (it accepted any document of the practice: a security gap the scout
    found), behind a `document_use:` advisory lock shared with tagging;
  - a letter a response names leaves the contract tagging and abstraction lists; the hint under Response says what an
    acceptance records, true to the stage machine.
- **Files beyond prs.json's list:** `lib/routes/submissions.ts`, `lib/routes/uploads.ts` (then shared with open #78; #78 has since merged),
  `lib/routes/reconciliation.ts`, `lib/contracts/tagging.ts`, `lib/routes/abstraction.ts`, `app/p/[practiceId]/contracts/page.tsx`
  (shared with open #75), `e2e/triage.spec.ts`, `e2e/unattested.spec.ts`, `lib/cases/write-off.ts` (new). Open #83 changes
  `e2e/a11y.ts`, which the design's checks call. LANES.md rule 6: the PR merged second keeps both.
- **For Lane A** (each a new migration, its function file regenerated, under CO-02; design 7.2):
  1. `case_line_rules()` refuses a person's "Window passed" while the window is open or unknown;
  2. `console_contract_queue()` leaves out response letters, with an index on `payer_response (practice_id, document_id)`;
  3. `payer_response_belongs()` applies the handler's letter check;
  4. `contract_version_documents_ok()` refuses a letter a response names (3 and 4 take the `document_use:` lock key);
  5. **a security item:** an upload-time link column on the uploaded document, so a letter uploaded in the form but
     never recorded cannot be tagged or read by roles without `phi.read` (design 2.8, 8.1).
- **Waiting on someone (the founder):** whether a line already at Payer approved or Recovered may be written off, and
  with which reasons (a money and stage ruling; recorded, not decided; design 8.2).
- **Built** (wf_0fd81a80-111): 30 files, committed and pushed as **29dded5**. Integration check green: typecheck,
  lint, copy, logs, fixtures, synth, unit 1,142, db 183 plus the covering route-test shards 4,635, e2e 9/9. The
  design critic: 8 nits, no blocking or should-fix (carried into the fix round). Progress files `lane-b-ux-payer-response-wip/`.
- **Draft PR #85** opened from the template (description by the helper, read back), subscribed.
- **Running:** the reviews workflow wf_be925c9b-c8d (security with the money lens in a fresh clone; UX and brand from
  before 165c599 and after 29dded5 tour shots; each finding verified). Script archived.
- **Next:**
  the draft PR; two reviews (UX and brand with shots; security with the money lens); fix round with the full suite; the
  fresh-clone verification; merge. Check-in trig_01VmPUaCgFFjDLZev4GuKyfh at 10:24 UTC.

## Log
| Time (UTC) | Stage | Detail |
|---|---|---|
| 2026-10-28 03:55 | Started | The orchestrator's order (03:45): PR 10 before PR 6 and 7. Branch and worktree cut from 165c599; design workflow started. |
| 2026-10-28 05:15 | Design: review next | The limit stopped wf_6c170a1a-e77 at ~04:20 after the scouts and the author (`designs/lane-b-ux-payer-response.md`, complete draft; scouts in `designs/lane-b-ux-payer-response/`). Resumed at 05:15 with resumeFromRunId (the review and revision run). |

| 2026-10-28 05:55 | Design done | wf_6c170a1a-e77 finished on resume: review 28 findings, all applied. Decisions, Lane A items and the founder's question recorded above. Build next. |

| 2026-10-28 06:00 | Build | wf_0fd81a80-111 started: builders A to E, integration check, critic, fixer. |

| 2026-10-28 07:45 | Built; PR #85; reviews | Build 29dded5 pushed; draft PR #85; reviews workflow wf_be925c9b-c8d started. |
| 2026-11-01 16:59 | Taken back | Lane B's orchestrator's item session took the item; status corrected; old reviews run lost; PR dirty, no CI; subscription refused, polling. Base merge next. |

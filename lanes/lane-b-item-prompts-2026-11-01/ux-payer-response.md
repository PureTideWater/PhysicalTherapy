## Your item
UX PR 10 is `co-001/ux-payer-response` (PR #85). It covers UX-035 (blocking at baseline) and UX-007, and #74's review deferred it as U-UX-6. The write-off Reason, the payer's Response, the Channel and the letter select now start on an enabled empty option with `required`. The write-off lists "Window passed" only once the line's window has ended, and `lib/routes/triage.ts` refuses it on an open or unknown window. The payer's letter is uploaded inside "Log a payer response". The route checks the letter a response names, behind a `document_use:` advisory lock that tagging also takes. Why it matters: a pre-answered Response records a payer decision nobody made. That moves the case to Resolved, and the next reconcile approves an amount on the ledger. A pre-answered Reason records a false fact on a line. There is no migration. The database half is five items for Lane A (design §7.2).

### Branch and head
- Branch: `co-001/ux-payer-response` at **29dded52cc37c9724255fe5f9c9d3bf720ca8dbc** (`git ls-remote`, 2026-11-01 ~14:50 UTC).
  - It is one commit on 165c5993 (#74).
  - It lacks 56ed6279 (#81) and 83d71fd6 (#78, the current base).
- WIP refs: none. There is no `co-001/wip-ux-payer-response`, and no `salvage/*` branch touches this work.

### PR
- #85 is open and draft, with `mergeable_state` **dirty** and **0 check runs**. It cannot run CI until the conflicts are resolved.
- Base `claude/build-platform` at 83d71fd6. 30 files, +2,476 −203. No comments and no reviews. Last updated 2026-10-28T07:32:24Z.
- The body is 7,721 characters:
  - It still says the full suite and both adversarial reviews are "pending".
  - Its footer is the old session's URL.

### Design
- `designs/lane-b-ux-payer-response.md` on `claude/build-ops` (15725ba2), 1,499 lines.
  - Done, reviewed and revised: 28 findings (12 should-fix, 16 nits), all applied (§9).
  - Scouts and review: `designs/lane-b-ux-payer-response/{scout-choices,scout-letter,scout-risk,review}.md`.
- The design was written against 165c599. Re-read it against 83d71fd6:
  - #78 and #81 are now in the base. #78 changed `components/uploads/uploader.tsx` and `lib/routes/uploads.ts`, and created `uploader.test.tsx`.
  - Line 17, §3.7 and §8.2(ii) still call #78 (and #81) open drafts.
  - §6.2 says the before shots are at 165c599.
- Build and critic progress files: `approval-summaries/lane-b-ux-payer-response-wip/`, 13 files. The 8 nits n1 to n8 are in `pay-critic.md`.

### Status file
`approval-summaries/lane-b-ux-payer-response-status.md` exists. Correct these first:
1. "Now (2026-10-28 05:55 UTC)" and "Run by session_01TAgFZo3SGSTBEfKRjX1jeG on Lane A's orchestrator's order" are stale. The item now belongs to Lane B's orchestrator (session_01FcouKNNHsdecRMzfTs7XwW) and to this session.
2. "Running: the reviews workflow wf_be925c9b-c8d" is wrong. That run is lost:
   - its progress files (`rev85-sec.md`, `shots85.md`, `rev85-ux.md`) and `pay-build-result.json` were in the old session's scratchpad, not on build-ops;
   - no findings file exists;
   - `tools/lane-b-screen-tour/capture/tour.spec.ts` at 15725ba2 has none of #85's `cap(...)` steps, and its `p.submissions.error` act chooses no letter.
3. "Check-in trig_01VmPUaCgFFjDLZev4GuKyfh at 10:24 UTC" is stale. It belonged to the old session on Lane A's account, and its time passed on 2026-10-28. `list_triggers` on this account, completed tasks included, has no task for this item.
4. "Draft PR #85 … subscribed" was the old session's subscription. Subscribe again.
5. "Next: the draft PR; …" is stale: the draft PR is open.
6. Missing from the file: the PR is **dirty** with **no CI**, and its base 165c599 lacks 56ed6279 and 83d71fd6.
7. "`lib/routes/uploads.ts` (shared with open #78)" is stale. #78 merged as 83d71fd6. `uploads.ts` now merges cleanly with the base, but `uploader.tsx` conflicts with it.
8. "no synth fixture" is wrong. The build wrote `fixtures/synthetic/CAS-4{5..8}/expected.json`, which is synth's no-file output (critic nit n5).

### Reserved numbers
- LANES.md's claim row: "ADR 0085 if the design needs one; test-matrix CAS-45 to CAS-48; `packages/synth` cases the same if needed (module 21 if a new module is needed)". Rule 4's line of 03:40 UTC reserves synth module 21 "if it needs one".
- Used:
  - ADR 0085: `docs/adr/0085-start-a-choice-that-records-a-fact-unchosen-refuse-one-the-records-own-facts-contradict-and-upload-the-payers-answer-with-its-response-apart-from-the-contract-documents.md`.
  - CAS-45 to CAS-48, as no-file registry entries in module 5 (CAS).
- Module 21 is unused: the design says "no new module". Record that in the status file now and report it at step 1, so the orchestrator can release it under rule 4.
- Migration timestamps: none (no migration).

### Setup arguments
- `co-001/ux-payer-response:/home/user/ux-payer-response`
- Run it in the background until it prints OK:
  `git -C /home/user/PhysicalTherapy fetch -q origin claude/build-ops && git -C /home/user/PhysicalTherapy show FETCH_HEAD:tools/setup-container.sh > /tmp/setup-container.sh && bash /tmp/setup-container.sh co-001/ux-payer-response:/home/user/ux-payer-response`
- If it fails with "node: /opt/node24/bin/node reports 'v24.22.1', not v24.22.0", run `mv /opt/node24 /opt/node24.base-image` and run it again. The copy at 15725ba2 does not move the base image's Node aside.
- storage.googleapis.com has been allowed since 2026-10-27, so the playwright line must read ok.

### Exact next step
Done:
- the design (wf_6c170a1a-e77);
- the build (wf_0fd81a80-111, 29dded52): typecheck, lint, unit 1,142, db 183 + 4,635, e2e 9/9; critic 8 nits;
- draft PR #85.

Remaining: the base merge, two reviews, the fix round, verification and the merge.

Rules for every stage:
- Run every heavy command under `flock /tmp/laneb-heavy.lock` with `export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH`.
- Run at most 2 heavy workflows at once.
- Before each one, schedule a `send_later` about 5 h 10 min ahead.
- The orchestrator paces usage (rule 9; the co-founder's reading on 2026-11-01 ~14:40 UTC was under 20% weekly: go wide). Never cut a run off mid-way.
- Keep progress files under `/home/user/ops/approval-summaries/lane-b-ux-payer-response-wip/` and commit them as you go, never in a scratchpad.
- Archive each script as `workflow-scripts/lane-b-ux-payer-response-<stage>-<runId>.js`.

1. **Records.**
   - Run `git -C /home/user/ops pull --no-rebase origin claude/build-ops` first.
   - Correct the status file (list above), commit, pull again, and push: `GITLEAKS=/root/.cache/paidwhole/gitleaks/8.24.3/gitleaks git -C /home/user/PhysicalTherapy push origin claude/build-ops`. Never force.
   - Call `subscribe_pr_activity` (PureTideWater/PhysicalTherapy, 85). If it says another agent already watches #85, record that and poll with `pull_request_read` instead.
   - `send_message` the orchestrator (session_01FcouKNNHsdecRMzfTs7XwW): Lane A items 1 to 5 (design §7.2) are not yet under LANES.md's "Handed to Lane A" and must go into the handoff to Lane A before 2026-11-03 14:00 UTC. Module 21 is unused.
2. **Base merge.** Adapt `workflow-scripts/lane-b-ux-download-refusals-merge-79-wf_5d10d874-4af.js` (merge, adversarial review of the resolution, checks on the merged tree).
   - In `/home/user/ux-payer-response`, merge `origin/claude/build-platform` (83d71fd6 or later) with a merge commit, keeping both sides of the 4 conflicts:
     - `apps/web/src/components/uploads/uploader.tsx` (3 hunks): #78's leave guard and other changes, plus this PR's five additive changes;
     - `docs/product/test-matrix.md`, `packages/synth/src/cases/matrix.ts` and `registry.ts`: CAS-41 beside CAS-45 to CAS-48. The DLR rows merge without a conflict.
   - Then run `pnpm install --frozen-lockfile`, `pnpm exec tsx tools/screening-capacity/watched.ts --write` (the base changed `watched-paths.txt`; never hand-merge it) and `pnpm synth --all`.
   - On the merged tree, also run #78's `uploader.test.tsx` (new to this branch) and the uploads and workbench route db tests.
   - Push: `GITLEAKS=/root/.cache/paidwhole/gitleaks/8.24.3/gitleaks git -C /home/user/ux-payer-response push origin co-001/ux-payer-response`. The hook runs; never use `--no-verify`.
   - This push gives #85 its first CI run. The PR changes two watched paths (synth `matrix.ts`, `registry.ts`), so the screening-capacity gate measures, which takes 30 to 60 min.
3. **Two reviews.** Adapt `workflow-scripts/lane-b-ux-payer-response-reviews-wf_be925c9b-c8d.js`:
   - Set `HEAD` to the merge commit and `BASE` to the base commit merged (83d71fd6, not 165c599 as design §6.2 says), so the diff is this PR's alone.
   - Replace `SP` with a durable path.
   - Point COMMON at `pay-build-check.md` and `pay-critic.md` in the wip folder instead of the lost `pay-build-result.json`.
   - Add `/opt/pnpm-bin` to its PATH line.
   - Reviewer 2: security with the money lens, in a fresh clone.
   - Reviewer 1: UX and brand, from before (BASE) and after (HEAD) tour shots at 1280 and 390 px light and 1280 px dark.
     - The shots agent adds design §6.2's `cap(...)` steps and §4.8's letter choice in the `p.submissions.error` act to `tools/lane-b-screen-tour/capture/tour.spec.ts` and `designs/lane-b-ux-review/route-map.json` on build-ops.
     - It commits them after a pull, keeping both sides if another session changed them.
     - It builds the gallery files and names their path in the status file for the orchestrator to publish. Do not publish. Never put a PNG or tile on a branch.
   - Every finding is adversarially verified. Write them to `approval-summaries/lane-b-ux-payer-response-review-findings.json`. Stop if a review returns nothing.
4. **Fix round.** Adapt `workflow-scripts/lane-b-packet-day-counts-fix-round-wf_c661e0c2-b5e.js` (fix, re-review, capture, UX review, suite).
   - Apply every verified finding plus the critic's nits n1 to n8 (`pay-critic.md`).
   - No migration and no file on LANES.md's "Not while #42 is open" list. Anything that needs either goes to "For Lane A".
   - Retake the after shots if anything visible changed.
   - Then run the full local suite, once:
     - typecheck, lint, lint:copy, lint:logs, check:fixtures;
     - `pnpm test`, `test:golden`, `test:oracle`;
     - `test:db` in 4 shards, one after another, each on a fresh PG18 database on 5433;
     - build, stamp, then e2e with `E2E_PREBUILT=1`;
     - the shards `pnpm exec tsx tools/stryker/affected.ts` names against the base, then the gate;
     - `pnpm verify-content` and synth's check.
   - Run `actions:check` and `toolchain:check` only if a workflow, manifest or lockfile changes. The base delta changes none.
   - Push once, with GITLEAKS as above.
5. **Description.** Rewrite it from `.github/pull_request_template.md` with MCP `update_pull_request`:
   - include the base merge, the Checks table on the new head, and the reviewers' findings and resolutions;
   - end with this session's footer;
   - stay under 65,536 characters, and read it back.
6. **Verification.** Adapt `workflow-scripts/lane-b-ux-download-refusals-verify-4-wf_f6ddc946-253.js`: one fresh-clone agent reading CI on the head.
7. **Merge, last of the six.**
   - When #82, #86, #75, #84 and #83 have merged, merge the latest base once with a merge commit, resolving per rule 6:
     - `uploader.tsx` and `contracts/page.tsx` against #75: follow design §3.7's #75 row (with #75 in, `KindField` renders only when more than one kind is offered).
     - The three shared documents.
   - Regenerate `watched-paths.txt`, the lockfile and synth. Never hand-merge them.
   - Re-run the checks the resolution touches:
     - the uploader browser and unit tests;
     - e2e, because #83 changes `apps/web/e2e/a11y.ts`, which `packets.spec.ts` and `triage.spec.ts` import.
   - If the #75 resolution changes what the form shows, retake the `p.submissions.*`, `p.contracts.default` and `p.uploads.default` after shots, and run a UX delta review.
   - CI must be green on that head for `all green`, `mutation`, `screening-capacity gate` and `approval-of-record`.
   - Mark the PR ready, wait for approval-of-record's re-run, then call `merge_pull_request` with method merge and `expectedHeadSha`.
   - Unsubscribe, read the push runs, remove the worktree and update the status file.
   - `send_message` the orchestrator that #85 merged, with its merge commit.

### Merge order and dependencies
- #85 merges last, after #82 → #86 → #75 → #84 → #83. It merges the base now (step 2) and again just before it merges.
- Trial merges were re-run today with `git merge-tree`. #85 merges second in each pair, so #85 resolves, keeping both:
  - **Base 83d71fd6:** `uploader.tsx`, `test-matrix.md`, synth `matrix.ts`, `registry.ts`.
  - **#75** (871faff9; its session continues from wip-5 7f77cb19, the same result): `apps/web/src/app/p/[practiceId]/contracts/page.tsx` and `uploader.tsx`. Design §8.2(v): #75's disabled kind placeholder sits outside a form, which ADR 0085 D1 allows.
  - **#84** (e3299ea2): `test-matrix.md`, `matrix.ts`, `registry.ts`.
  - **#83:**
    - No conflict against PR head f4a97668.
    - WIP f5e0ceba conflicts on `test-matrix.md`, `matrix.ts` and `registry.ts`.
    - Both heads change `apps/web/e2e/a11y.ts`, which this PR's e2e imports.
  - **#82** (96758e44): `test-matrix.md`, `matrix.ts`, `registry.ts`.
  - **#86** (83167b8f, which contains the base): the same four files as the base, with no conflict of its own.
- Against #42 and the schema chain, whichever merges second resolves:
  - **#42** (be63bdc2): `test-matrix.md`, `matrix.ts`, `registry.ts`.
  - **SS-01** (f897a282), **1b** (358dc53f) and **interest** (e0646746): each conflicts on `apps/web/src/lib/routes/uploads.ts` plus the three shared documents.
- redact-ssn-phone shares no code file with #85 (its `redact.ts` overlap is #75's). Its MOD-15 and MOD-16 rows, and any other item that adds test-matrix rows and merges first, will touch the three shared documents. Keep both.

### Waiting on someone
- **Founder (via the orchestrator to the co-founder, rule 8):** design §8.2, whether a line already at Payer approved or Recovered may be written off, and with which reasons. It is recorded, not decided. The brief rates it as arguably within the co-founder's delegation. **Does not block the merge:** this PR changes nothing about it.
- **Founder:** runbook 3i and `APPROVAL_REVIEW_REQUIRED`. Until 3i, merge on green checks after the verification and approval-of-record's re-run. **Does not block.**
- **Product (§8.2 a, b):** low priority. **Does not block.**
- **The orchestrator (§8.2 i–v):**
  - The uploader's five changes beyond prs.json's "only the kind", the files beyond prs.json, and the Channel select were taken under the standing rule and are stated in the PR.
  - For (v), the orchestrator asks #75's session to confirm the D1 reading.
  - **Does not block.**
- **Lane A:** the five §7.2 migrations. Item 5, the upload-time link, is a security item, and its residual is stated in the PR. Report them at step 1. **Does not block** this merge.

### Follow-on
None. UX PR 6 runs in its own session.

### Resume
Resume from your status file: it is your handoff. Do not message the old sessions.

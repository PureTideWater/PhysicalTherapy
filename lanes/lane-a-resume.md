# Lane A: how to resume after the weekly limit (written 2026-10-27 ~02:15 UTC)

This account (Lane A's) read 94% of its weekly allowance at ~01:50 UTC; the limit resets on 2026-10-27 at 14:00 UTC.
If it stops the session first, everything needed to continue is on GitHub: this file, the WIP branches and
`approval-summaries/lane-a-wip/`. A check-in fires into Lane A's session (session_01TrKDxeLbxVo7t7zwRXFzrg) at 14:05
UTC (trigger trig_01XqKZsF9KvqAG7S6pBGUmoi). Read this file first, then LANES.md, then HANDOFF.md "Start here".

## 0. The machine
- If `/home/user/pr6b4` and `/home/user/ops` still exist, the container survived: run
  `bash /tmp/setup-container.sh co-001/pr-06b-mail-streams:/home/user/pr6b4` (or fetch it again from `claude/build-ops`)
  only if PostgreSQL is down.
- If the container is new: `git -C /home/user/PhysicalTherapy fetch -q origin claude/build-ops && git -C
  /home/user/PhysicalTherapy show FETCH_HEAD:tools/setup-container.sh > /tmp/setup-container.sh && bash
  /tmp/setup-container.sh co-001/pr-06b-mail-streams:/home/user/pr6b4`, in the background, until it prints OK.
  storage.googleapis.com is now allowed, so Playwright's Chromium lays out.
- The continuity snapshot (`tools/lane-a-snapshot.sh`) ran every 5 minutes until the limit or 14:30 UTC. Restart it
  if more work runs before the next quiet point.

## 1. #42 (PR 6b-4), the fix round: workflow wf_ba2333bd-714
- **Pushed:** the base merge `098636e` (e908c21 merged, conflicts in consumer.db.test.ts, ADR 0062 and
  reconciliation-001 resolved keeping both lanes; lockfile and watched-paths unchanged by regeneration; domain model
  hash unchanged, 07c4a8ee…; 45 function files written).
- **CI on 098636e:** db 1-4, e2e 1-2, build, images, lint, static green. Red: `unit`, merge-caused
  (`apps/worker/src/web-entries.test.ts`: 13 worker files reachable from `runtime.ts` now import `@tp/db`'s main entry
  instead of `@tp/db/runtime`; the integrator was told to root-cause and fix it); `domain model` (the expected
  approval line, the founder's).
- **Builders' work:** branches `co-001/wip-pr42-fix-db`, `-infra`, `-harness` (fast-forward snapshots of each
  builder's clone; not PRs; no CI), uncommitted changes in `approval-summaries/lane-a-wip/<key>.uncommitted.patch`,
  each agent's progress file in `approval-summaries/lane-a-wip/progress/pr42-*.md`, the script in
  `workflow-scripts/lane-a-pr42-fix-round-wf_ba2333bd-714.js`.
- **To resume:**
  - If the journal exists (`/root/.claude/projects/-home-user-PhysicalTherapy/e99dbc78-96e5-5013-a491-2b14e5309bfe/subagents/workflows/wf_ba2333bd-714/journal.jsonl`):
    `Workflow({scriptPath: <the script>, resumeFromRunId: "wf_ba2333bd-714"})`. Completed agents return cached results;
    stopped ones restart and continue from their progress files.
  - If not: recreate each builder's clone from its WIP branch (`git clone -q /home/user/pr6b4 <SP>/pr42/build-<key>`,
    `git -C it fetch origin co-001/wip-pr42-fix-<key>`, check it out as `fix-<key>`, `git apply` its patch), copy the
    progress files back to `<SP>/progress/` (their hashes are shortened; read full hashes from git), and run the
    script again: each builder continues from its progress file, then the integrator runs.
- **Then:** CI on the pushed head; the fresh-clone verification reading CI; the approval line posted as a suggested
  change (`gh api repos/PureTideWater/PhysicalTherapy/pulls/42/comments`, never a review); tell the person exactly
  what the founder must do; the merge after the founder's approved review of the latest commit.

## 2. Lane A's schema designs: workflow wf_5f09e0bd-311
- SS-01 (`designs/ss-01-suspension.md`), SUITE-CAP-1 (`designs/suite-cap-1-triage-locks.md`) and the interest
  credited twice (`designs/ledger-interest-once.md`), each scouts, author, one reviewer, revision. Whatever was
  written is committed by the snapshot. Resume as in 1 (script `workflow-scripts/lane-a-lane-a-schema-designs-wf_5f09e0bd-311.js`).
- The interest fix's build waits on the founder's ledger freeze exception (asked 2026-10-27 ~01:45 UTC).

## 3. HANDOFF.md and the tracker: workflow wf_83d455b5-98c
- If HANDOFF.md's new "Start here" was not committed, its draft is uncommitted in `/home/user/ops` (or lost with the
  container): run the workflow again (script `workflow-scripts/lane-a-lane-a-fold-handoff-wf_83d455b5-98c.js`).
  Then refresh the tracker artifact (HANDOFF.md "Tracker").

## 4. Lane B's five sessions (each holds until 14:05 UTC and resumes itself from its status file)
| Session | Item, then follow-on | Status file |
|---|---|---|
| session_017SNqG4nQbbt6xqEG1ZDKe6 | #120, then #32 | `lane-b-model-eval-gate-status.md`, `lane-b-unmapped-plan-status.md` |
| session_01UzQ6wgZgtThBRBxXTFYhRB | ci-browser, then P1, P2, P4 | `lane-b-ci-deps-status.md` |
| session_01TAgFZo3SGSTBEfKRjX1jeG | ux-forms, then UX PRs 6 and 7 | `lane-b-ux-forms-status.md`, ... |
| session_019VghcxKzP9LAj3WK8k6u1D | UX PR 3, then 4 | `lane-b-ux-table-scroll-status.md`, ... |
| session_01L3tN5LCq2aNYetEQBNJYZg | UX PR 5, then 9 | `lane-b-ux-download-refusals-status.md`, ... |
- Each was told (02:10 UTC) to push its work and progress files to GitHub and to put a "Resume at 14:05 UTC" block at
  the top of its status file. If one did not resume by ~14:20 UTC: `send_message` it to resume from its status file;
  if it is gone, `create_session` again with `source_url` https://github.com/PureTideWater/PhysicalTherapy, the same
  title and prompt (the brief `lanes/lane-b-session-brief.md` plus its item lines in `lanes/lane-b.md`, 2026-10-27
  ~01:40 UTC), adding "resume from your status file".

## 5. Also pending
- The UX baseline galleries are published (2026-10-27 ~14:55 UTC): 1280 px https://claude.ai/artifact/6ufwbZwVBXm35KhLwuhTPA, 390 px https://claude.ai/artifact/M4zbLDTkfhez4g9D6uJvgo (private to this account).
  as private artifacts on this account; the copies were in the session's scratchpad (`ux-galleries/`). If the
  container is new they are gone: ask the person to upload the two zips again. Never commit them to the public
  repository without the person's word.
- The founder: #42's domain model approval when it is ready; the ledger freeze exception for the interest fix.
- Counters: next free ADR 0085, synth module 21, fixture release 900008 (LANES.md rule 4).
- Before Friday 2026-10-30 19:00 UTC (or this account's limit before then): the handoff to Lane B, like
  `lanes/lane-b-handoff-to-lane-a.md`.

## Update 2026-10-27 19:10 UTC
- The 5-hour limit stopped everything at ~17:12-17:27 UTC and the container restarted; resumed at 19:05-19:10 (setup re-run, both workflows resumed, the six Lane B sessions messaged).
- #42's integrator works in `/home/user/pr6b4`; its unpushed commits are now snapshotted to `co-001/wip-pr42-integrate` (8aa45a46 at 19:07) and its uncommitted changes to `approval-summaries/lane-a-wip/integrate.uncommitted.patch`. If the container is new: check out `co-001/wip-pr42-integrate` as `co-001/pr-06b-mail-streams` in `/home/user/pr6b4` (it fast-forwards from 098636e3), apply the patch, then resume the integrator.
- If the six sessions read FAILED in list_sessions, the limit stopped them: `send_message` each to resume (the text of 19:08 UTC in this session's log).
- Safety check-in: 2026-10-28 00:10 UTC (the next 5-hour window).

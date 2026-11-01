## Your item
UX PR 9, `co-001/ux-home-figures`, comes from the UX review's PR 9: UX-003 (C-009, blocking), UX-015 (C-048, should fix) and UX-140 (C-183, polish). Today the base computes "actionable" four ways. On LEDGER the home tile reads $0.00 and the ROI statement reads $30.00 for the same case.

The fix:
- **One predicate.** Every live actionable figure of a practice's cases goes through one predicate: home, Cases, case page, packet builder, ROI statement and digest. The predicate is `ACTIONABLE_NOW*` in `apps/worker/src/triage/actionable-now.ts`, exported through `@tp/worker/triage` (already in `apps/worker/package.json`). Two exceptions keep their own figure (F2): the audit report, counted per run, and the monthly summary, counted per month.
- **Recovered tile.** It shows "to date, since <date>" and "This quarter (YYYY-QN)" from one ledger read.
- **Words.** "Stage five" leaves every read text except `components/help.ts`, a #42 file that is a follow-up. The Payer approved notes are worded by proof level.
- **Empty home.** It names the gate Uploads itself uses (`practice_baa_on_file()`, an organization-wide BAA included).

Code computes every number in integer cents. Nothing changes under `packages/pricing` or `packages/ledger`, and there is no migration. This is a Lane B session, not acting Lane A, so LANES rule 2 applies in full.

### Branch and head
- `co-001/ux-home-figures` = `83d71fd62c6d419be61fd7aaa5b9033ef5c18b56`.
  - That is the same commit as `claude/build-platform` (#78's merge).
  - Checked with `git ls-remote` at 2026-11-01 ~14:50 UTC.
- The branch has no commits of its own. Nothing the old builders made survived.
- There is no WIP ref: no `co-001/wip-ux-home-figures*` exists on origin. Start the build from the base.

### PR
None yet: open a draft PR at the build stage. GitHub's pulls API with head `PureTideWater:co-001/ux-home-figures` and state all returns 0 PRs.

### Design
- **`designs/lane-b-ux-home-figures.md`** on build-ops (15725ba2; last changed 5d234561, 2026-10-28 07:35 UTC):
  - D1 to D11; §4 tests HOM-01 to HOM-04; §5 screens; §6 pipeline; §7 open questions.
  - The section "Design review and dispositions" (F1 to F13, all taken) wins over every section above it.
  - Verdict: build with changes, no migration, no frozen code.
  - F4 adds `cases/[caseId]/packet/page.tsx` to D10's files.
  - Historical, do not edit: the header's "claim row 185" (now LANES.md line 190), the old session id, and D10's `co-001/wip-ux-forms` overlap (stale: ux-forms merged as #74).
- **`designs/lane-b-ux-home-figures-review.json`:** the reviewer's raw findings (wf_132e0b59-2b4: 13 findings, "build with changes").
- **Base:** the design was written against 83d71fd, and the base has not moved, so its line references hold. The CAS-41 anchors were re-checked: `lib/dashboard/queries.ts:93-97` and `:138-146` are the three statements. If the base moves before the builders start, re-read D10's file list and those anchors against the new base.
- Stage 1 (the design and its review) is **done**.

### Status file
`/home/user/ops/approval-summaries/lane-b-ux-home-figures-status.md` exists. Its last commit is 1674f8e7, at 2026-10-28 07:36 UTC. Correct these facts before anything else:
1. **Header.** It says "Run by session_01L3tN5LCq2aNYetEQBNJYZg … started 2026-10-27 by Lane A's orchestrator". It is now this session, started 2026-11-01 by Lane B's orchestrator (session_01FcouKNNHsdecRMzfTs7XwW).
2. **#78's merge time.**
   - The header says 2026-10-28 06:51 UTC, and the log says "06:55 UTC: PR 5 merged (#78)".
   - GitHub's `merged_at` is 2026-10-28T06:50:22Z (merge commit 83d71fd6).
3. **"Now (2026-10-28 07:36 UTC)".**
   - The builders wf_5fc0815b-69d, marked "running", were lost when Lane A's account hit its weekly limit (~07:55–08:05 UTC 2026-10-28). The builders do not commit, so nothing reached origin.
   - The before shots wf_0f9ac53c-daf, marked "running", were lost with the old scratchpad. No tiles survive.
   - Neither run can be resumed: resumeFromRunId works only in the same session.
4. **"Safety check-in: send_later at 2026-10-28T12:04Z"** is obsolete. `list_triggers` returns nothing (checked 2026-11-01).
5. **Worktree `/home/user/ux-home-figures`** does not exist. Setup recreates it.
6. **"#42 files: … 217 files at 06:52 UTC".**
   - #42 is now at be63bdc2 with 219 files. Its merge base is 56ed6279, and it does not contain 83d71fd6.
   - The overlap with this PR is still rows only, in `docs/product/test-matrix.md` and `packages/synth/src/cases/{matrix,registry}.ts`.
   - #42's acting-Lane-A session is about to merge the base into it, so re-check at step 4.
7. **Log.** There is no entry after 07:36 UTC on 2026-10-28. Add a 2026-11-01 entry: taken back by Lane B; stages 2 onward re-run.

Still true; keep as written:
- the branch has no commits, and there is no PR;
- the reserved numbers;
- "For Lane A" (F9, open question 3);
- the proposals;
- "Waiting on someone: Nothing" (see below).

### Reserved numbers
As LANES.md's claim row (line 190) has them: "PR 9: ADR 0082 if needed; test-matrix HOM-01 to HOM-04, a new series; synth module 20 (HOM) if needed".
- **ADR 0082** is not written anywhere: there is no `docs/adr/0082-*` on the base or on any `co-001/*` branch. D11 says it is needed.
- **HOM-01 to HOM-04** are unused on every branch.
- **Module 20** is unused. The base's `MODULE_NUMBER` ends at DLR 18, and no open branch touches `cases/common.ts` or `expected/types.ts`.
- **Nothing else** is reserved or needed: no migration timestamp and no fixture release. If you need anything more, write a COUNTER REQUEST at the top of the status file.

### Setup arguments
`co-001/ux-home-figures:/home/user/ux-home-figures`

### Exact next step
1. **Machine.** Run in the background until it prints OK:
   ```
   git -C /home/user/PhysicalTherapy fetch -q origin claude/build-ops && git -C /home/user/PhysicalTherapy show FETCH_HEAD:tools/setup-container.sh > /tmp/setup-container.sh && bash /tmp/setup-container.sh co-001/ux-home-figures:/home/user/ux-home-figures
   ```
   - If it fails with "node: /opt/node24/bin/node reports 'v24.22.1', not v24.22.0", run `mv /opt/node24 /opt/node24.base-image` and run it again.
   - The playwright line should pass: storage.googleapis.com has been allowed since 2026-10-27. Session brief §1 is stale on this.
   - Record the output of `gh api user --jq .login`; expect PureTideWater.
2. **Status file.** Make the corrections listed above, then:
   ```
   git -C /home/user/ops pull --no-rebase origin claude/build-ops
   ```
   Commit, then push:
   ```
   GITLEAKS=/root/.cache/paidwhole/gitleaks/8.24.3/gitleaks git -C /home/user/PhysicalTherapy push origin claude/build-ops
   ```
   Update the status file at the end of every stage below.
3. **Base check.** Run `git -C /home/user/PhysicalTherapy fetch -q origin claude/build-platform`, then `git ls-remote origin claude/build-platform`.
   - If the base moved past 83d71fd6, fast-forward the branch: `git -C /home/user/ux-home-figures merge --ff-only origin/claude/build-platform`, then `git -C /home/user/ux-home-figures push origin co-001/ux-home-figures` (through the hook).
   - Use that commit as BASE everywhere below.
   - If #42 has merged by then, its files are base files. Keep the design's scope anyway.
4. **#42's file list.** Regenerate it into this session's scratchpad. The old `${SP}/pr42-files.txt` is gone, and the build script reads that path.
   ```
   git -C /home/user/PhysicalTherapy fetch -q origin co-001/pr-06b-mail-streams:refs/remotes/origin/co-001/pr-06b-mail-streams
   git -C /home/user/PhysicalTherapy diff --name-only $(git -C /home/user/PhysicalTherapy merge-base origin/claude/build-platform origin/co-001/pr-06b-mail-streams) origin/co-001/pr-06b-mail-streams > $SP/pr42-files.txt
   ```
   At be63bdc2 it has 219 lines. If #42's head moved, the count differs; use the live head.
5. **Stage 2: adapt the scripts.** Copy `/home/user/ops/workflow-scripts/lane-b-ux-home-figures-build-wf_5fc0815b-69d.js` and `…-capture-before-wf_0f9ac53c-daf.js`, then change:
   - **`SP`, in both:** from the old `/tmp/claude-0/…/12cbf3a7-…/scratchpad` to this session's scratchpad.
   - **The base, in both, only if it moved.**
     - In the build script that means COMMON's "83d71fd", the Integrate step's `affected.ts --base 83d71fd6` and the CAS-41 anchors.
     - In the capture script it means `TOUR_REF`.
     - Replace the 8-character `83d71fd6` before the 7-character `83d71fd`, or a trailing "6" is left behind.
   - **`Claude-Session`, in capture-before:** from `…session_01L3tN5L…` to this session's URL.
   - **The capture notes, in capture-before:** change "the earlier PR's capture notes in ${SP}/progress/dlr-capture-before.md and dlr-capture-after.md" to `/home/user/ops/approval-summaries/lane-b-ux-download-refusals-wip/dlr-capture-before.md`. Only that file was archived.
6. **Run both workflows.** That is the limit of two heavy workflows.
   - **Usage:** the co-founder said under 20% weekly at 2026-11-01 ~14:40 UTC, and go wide. On later days ask again before a heavy run (rule 9).
   - **Order:** the build runs Core, then Screens and Docs, then Integrate with the CAS-41 gate. The before shots run beside it.
   - **Check-in:** first schedule `send_later` about 5 h 10 min ahead, and cancel it when the runs end. The account's window resets at 19:10 UTC today, and many sessions are running.
   - **Do not lose the work again:**
     - The builders do not commit. Whenever a phase ends, and before the window closes, push a WIP snapshot of the worktree to `co-001/wip-ux-home-figures`, each parented on the previous WIP tip. Never force; a diverged WIP ref gets `-2`, `-3`, and so on.
     - Copy `${SP}/progress/hom-*.md` to `approval-summaries/lane-b-ux-home-figures-wip/` on build-ops.
   - **CAS-41 gate:** if it fails (F1), stop that part and record it "for Lane A's PR 11" (Lane A's milestone PR, not UX PR 11). Build the rest.
   - **F11:** take the re-export in `lib/routes/uploads.ts`. Do not edit `lib/routes/contracts.ts` or `lib/routes/reconciliation.ts`, which #85 changes.
   - **After Integrate:** commit on `co-001/ux-home-figures` and push through the pre-push hook. Record anything still failing for the fix round.
   - **Archive** both scripts as `workflow-scripts/lane-b-ux-home-figures-{build,capture-before}-<newRunId>.js`.
7. **Stage 3: draft PR** into `claude/build-platform`.
   - Fill every section of `.github/pull_request_template.md`, writing "None" rather than omitting one. "Domain model": "No migration; the document is unchanged." "Freeze exception": "No: it changes none of them", if stage 4 agrees.
   - Write it with MCP `update_pull_request` and read it back. End it with the Claude Code footer and this session's URL.
   - Include:
     - the CAS-41 numbers (F1, F13);
     - that UX-023's Actionable part closes here (F4);
     - the words chosen (open question 6);
     - "For Lane A": F9's `roi_links_valid()` key `actionable_open_lines`, and open question 3.
   - Call `subscribe_pr_activity`.
8. **Stage 4: two reviews in fresh clones.** Adapt `lane-b-ux-download-refusals-reviews-wf_1c44b1a2-762.js`, replacing its security reviewer with the payment-engine reviewer. Keep its skeptic pass and its refusal when a review returns nothing.
   - **UX and brand** (`.claude/agents/ux-brand-reviewer.md`): the before shots from step 6 and after shots on the head, at 1280/390 px light and 1280 px dark. The sample is §5's screens.
   - **Payment engine** (`.claude/agents/payment-engine-reviewer.md`):
     - the ROI statement's figure and the digest's figure;
     - that `packages/pricing` and `packages/ledger` are untouched;
     - whether redefining `roi_statement.actionable_open_cents` and the digest's stored figure, from ADR 0082's date, needs a freeze exception.
9. **Stage 5: fix round.**
   - Adapt `lane-b-ux-download-refusals-fix-wf_959acf20-bf4.js`.
   - Run the full local suite once. Every heavy command runs under `flock /tmp/laneb-heavy.lock` with `PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH`. The suite:
     - unit, golden, oracle;
     - test:db in 4 fresh PG18 shards on port 5433;
     - build, then e2e with `E2E_PREBUILT=1`;
     - the affected Stryker shards, then the gate;
     - verify-content and synth's check.
   - Push once.
10. **Stage 6: fresh-clone verification that reads CI.** Adapt `lane-b-ux-download-refusals-verify-wf_8a1a9b4b-bb5.js`.
11. **Stage 7: merge.**
    - Merge the latest base in with a merge commit. Rerun the generators and commit what they write; never hand-merge a generated file:
      - `tools/screening-capacity/watched.ts --write`;
      - `pnpm synth --all`;
      - `pnpm install` if the lockfile is touched.
    - Wait for green on `all green`, `mutation`, `screening-capacity gate` and `approval-of-record`. Ruleset 25837331 is strict, so the head must be up to date with the base.
    - Mark the PR ready and wait for approval-of-record's re-run. Then call `merge_pull_request` with method merge and `expectedHeadSha`.
    - Unsubscribe, read the push runs, clean the worktree, and record the merge in the status file. Do not edit LANES.md or lane-b.md.

Done: stage 1. Remaining: stages 2 to 7.

### Merge order and dependencies
Nothing must merge first; this item can start now. A trial merge is not possible yet, because nothing is built. The overlaps below compare the design's files with each open branch's changes since its merge base (checked 2026-11-01). LANES rule 6 applies: the PR merged second resolves the conflict and keeps both sides.
- **Rows** in `docs/product/test-matrix.md` and `packages/synth/src/cases/{matrix,registry}.ts` are shared with:
  - #42 (be63bdc2), #75 (871faff9; wip-5 7f77cb19), #82 (96758e44), #83 (f4a97668; WIP f5e0ceba), #84 (e3299ea2), #85 (29dded52);
  - SS-01 `co-001/ss-01-suspension-refusal` (f897a282), 1b `co-001/suite-cap-1-triage-locks` (358dc53f) and interest `co-001/ledger-interest-once` (e0646746).
  - Put HOM after the newest series (DLR on the base).
  - No open branch touches `cases/common.ts` or `expected/types.ts` (module 20).
  - #86 (83167b8f) touches no file of this PR.
- **#85 (UX PR 10)** also changes `cases/[caseId]/page.tsx`, `apps/web/e2e/packets.spec.ts` and `lib/routes/uploads.ts` (F11's re-export site). It also changes `lib/routes/contracts.ts` and `lib/routes/reconciliation.ts`, so take F11's re-export and leave those two alone.
  - #85 adds `uploadGate()` to `uploads.ts`: the BAA plus the suspension pause, the same gate as D9 and HOM-03.
  - Whichever PR merges second resolves, keeping one gate. If #85 is in first, the home reads `uploadGate()`. If this PR is first, `baaOnFile` and `NO_BAA` stay exported from `uploads.ts` so #85's code still compiles.
- **SS-01, 1b and interest** form the schema chain. Their PRs open strictly one at a time, each after the one before merges, and SS-01's after #42.
  - All three change `app/p/[practiceId]/page.tsx` (SS-01 renames `page.data.suspension` to `hold`) and `lib/routes/uploads.ts`.
  - Interest also changes `reconcile/public.ts` and `reconcile/statement-html.ts`.
  - If this PR merges first, the schema PR resolves. Otherwise this PR does, with the empty state reading whichever field is current.
- **#42.** This PR edits none of the files on the "Not while #42 is open" list; it only adds rows to the shared documents. Left alone: `lib/routes/practice.ts`, `components/help.ts`, `lib/monitoring/queries.ts`, `digest/job.ts` and `apps/{web,worker}/package.json`.
- **SUITE-CAP-3** (`co-001/suite-cap-3-reconcile`; not on origin, its design is restarting) works in `apps/worker/src/reconcile/`. Check its files against `reconcile/{statements,public}.ts` once it has a branch.
- **Later:** UX PRs 11 and 12 (the home, the case page, `lib/dashboard/queries.ts`) land after or beside this one. #46 is not designed; it shares the ROI pages and `apps/worker/src/report`, and whichever merges second resolves.

### Waiting on someone
- **Co-founder** (wording is delegated to him since 2026-10-25): the out-of-figure clause and the Payer approved note (open question 6). Take the design's words, record them in the PR, and he may change them. This does not block the merge.
- **Freeze exception:** none is expected; the design review found no frozen code. If the payment-engine review finds the change to the ROI statement's stored figure counts as the ledger's semantics, record it under "Waiting on someone". That part waits for the exception (the founder's per session brief §6; the co-founder's under the 2026-10-25 delegation).
- **Lane A** (offers, not needs). Acting Lane A is the orchestrator's #42 and schema-chain sessions until 2026-11-03 14:00 UTC; this session is not acting Lane A.
  - F9's fifth `roi_links_valid()` key (a migration).
  - Open question 3: should `case.actionable_cents` hold the live figure (Lane A's PR 11)?
  - Neither blocks the merge. If the CAS-41 gate fails, only that part moves to PR 11.
- **Founder:** nothing for this item. Runbook 3i is not done and `APPROVAL_REVIEW_REQUIRED` is unset (approval-of-record passes), so merge on green checks plus the verification (LANES rule 7). Nothing blocks.

### Follow-on
None. #46, the Verified seal, is claimed in LANES.md (line 187: `co-001/verified-seal`, ADR 0074, LED-19 to LED-22, claimed 2026-10-26 00:35) but is **not designed**.
- lane-b.md says "Queued, not designed". There is no design, no `lane-b-verified-seal-status.md` and no branch on origin.
- ADR 0074 and LED-19 to LED-22 are unused on every branch.
- Take it only if Lane B's orchestrator assigns it after this PR merges, starting at stage 1. It must land before PR 7's red team and before any ROI statement reaches a customer.

### Resume
Resume from your status file: it is your handoff. Do not message the old sessions.

## Your item
PR #84 fixes the packet narrative verifier, which used to type a figure by its shape alone. Because of that, any input value passed in any role. For example, the contract window's "10000 days" passed as "10000 visits", and a date's year passed as "2026 claims". The export job runs this check again, and it is the last check before a payer receives a narrative. The design's probes found 42 false passes and 2 false failures in 62 narratives. The fix is one role reader (`packages/packets/src/roles.ts`, `roles-words.ts`) used by the verifier, the browser editor and the gateway's pre-call check, with every input held only in the roles its record gives it (ADR 0086). It was built and reviewed on 2026-10-28. The three reviews raised 5 blocking findings: payment-engine 2, correctness 2 (one of them the same cue-union defect the payment-engine review found), UX 1. The fix round (wf_c661e0c2-b5e) was never pushed and is lost. On CI, `stryker (packets-words)` was cancelled at the 30-minute job limit. `packages/packets` is a money package: keep its mutation score, and review it against the payment-engine checklist and for correctness.

### Branch and head
- **Branch:** `co-001/packet-day-counts`. Live head **e3299ea2ec5634a08d6d8f79e38cb623636e0fa8** (`git ls-remote origin`, 2026-11-01 ~16:00Z). It is the build 9e25b11a (parent 0dd1ba7e) plus a merge of base 56ed6279.
- **Base:** `claude/build-platform` is now **83d71fd6** (#78).
  - A trial merge into e3299ea2 is clean (`git merge-tree`, tree c4d10648).
  - Between 56ed6279 and 83d71fd6 nothing changed under `packages/packets`, `packages/model-gateway`, `apps/web/src/{components,lib}/packets`, `apps/worker/src/packets`, `stryker/` or `pnpm-lock.yaml`.
  - The base did change `apps/web/src/lib/routes/packets.ts` (#78 added `returnTo` for refused exports). That file holds the approve and request-approval actions the fix round will change. #84 does not touch it yet, and it merges clean.
  - The base also added DLR rows to the test matrix and the synth matrix and registry, plus 3 lines to `watched-paths.txt`. All of these merge clean.
- **WIP ref:** `co-001/wip-packet-day-counts` = **acfd8980** (2026-10-28 05:13Z, parent 0dd1ba7e). It is the builder's state before the build finished. It is neither an ancestor nor a descendant of e3299ea2. **Do not continue from it, and do not move it.**
- **No other WIP refs exist.** `co-001/wip-packet-day-counts-2` is free. The fix round's local commits never reached origin.

### PR
- **#84:** open, draft, into `claude/build-platform`.
  - `mergeable_state` is "behind" (PR base sha 56ed6279).
  - 2 commits, +3,911 −736, 38 files. 0 reviews, 0 review comments, 1 issue comment.
- **The comment** (2026-10-28T07:26:03Z) gives the CI cause: split `roles-words.ts` by word family; do not raise the time limit.
- **CI on e3299ea2** (Actions run 40646243545 for mutation):
  - **`mutation` failed** (check run/job 122687553967), because `stryker (packets-words)` (job 122675878615) was cancelled at the limit (06:55:15–07:25:33Z).
  - `notify` was skipped. The other 26 checks passed.
  - CI shard times: packets-roles 10m04s, packets-rest 12m31s, packets-scan 9m40s, packets-explain 12m55s.
- **The description** (6,253 characters) has the template's sections. Three things are out of date:
  - the reviewer rows still say "To come";
  - the "Full local suite" row still says "To come";
  - its footer links the old session (session_019i9ifC3LkwNtonZfNSNmCp).

### Design
- **File:** `designs/lane-b-packet-day-counts.md` on build-ops, last changed in 18a70faf (2026-10-28 06:50Z).
  - It has §§0–7, "Proposals outside this item" and "Review and departures (the build, 2026-10-28)".
  - The design and its review are done.
- **No fix-round section yet.** Add one after "Review and departures". The old script called it the design's "section 7 ('Fix round')", but §7 is now "Coordination".
- **Lost evidence.** The evidence files the design cites were in the old scratchpad `/tmp/claude-0/-home-user-PhysicalTherapy/c2897427-570e-5954-bd7a-54cacd103451/scratchpad/progress/` and are gone: `pdc-probe1.txt`, `pdc-proto3.txt`/`.json`, `pdc-proto-suite.log`, `pdc-proto-suite2.log`, `pdc-proto-golden.log` and `zz-pdc-proto.ts.keep`.

### Status file
`approval-summaries/lane-b-packet-day-counts-status.md` on build-ops exists (last changed in fbf4845e, 2026-10-28 07:29Z). Correct these facts first; live state contradicts each one:
1. **Session.** It names session_019i9ifC3LkwNtonZfNSNmCp, started by Lane A's orchestrator (session_01TrKDxeLbxVo7t7zwRXFzrg). From 2026-11-01 it is this session, run by Lane B's orchestrator (session_01FcouKNNHsdecRMzfTs7XwW).
2. **Worktree.** The file says `/home/user/packet-day-counts` is "installed". It does not exist until setup creates it.
3. **Check-ins.** The file lists safety check-ins at 05:28 and 10:24 UTC. None are scheduled: `list_triggers` is empty.
4. **WIP ref.** The 05:13 entry implies `co-001/wip-packet-day-counts` holds work to continue. acfd8980 predates the build 9e25b11a and the PR head, so it is unusable.
5. **Fix round.** The file says "Fix round running (wf_c661e0c2-b5e) … the session pushes once at the end", and its "Next step" says "resume with resumeFromRunId". The run was lost with its container, nothing reached origin, and a new session cannot resume it. Record it as lost and redone in full.
6. **Review findings.** The three reviews' full findings are lost:
   - the wf_5607bc50-a7b journal (`/root/.claude/projects/-home-user-PhysicalTherapy/c2897427-…/subagents/workflows/wf_5607bc50-a7b/journal.jsonl`);
   - the scratchpad files `pdc-review-pe.md`, `pdc-review-corr.md`, `pdc-review-ux.md`, `pdc-review-ux-probe.txt` and `pdc-capture.md`.

   What survives: the counts in the 07:45 entry, and the "In particular" list in `workflow-scripts/lane-b-packet-day-counts-fix-round-wf_c661e0c2-b5e.js`.
7. **Subscription.** "Subscribed" was the old session's subscription. Subscribe again.
8. **Merge hold.** The merge hold (07:20 entry and "Waiting on someone") lapsed at 2026-10-28 11:00 UTC with #75 unmerged. The order now is handoff §6: #84 merges after #75 (ADR 0054).
9. **Base.** The base is no longer 56ed627. It is 83d71fd6, and the PR shows "behind" (clean in trial).
10. **Reserved line.** It says "ADR 0086 if needed". ADR 0086 is in use: `docs/adr/0086-read-every-narrative-figure-in-the-role-its-words-give-it-and-hold-each-input-to-the-roles-its-record-gives-it.md`.

Also add facts the file lacks:
- **Shots already on build-ops** (fbf4845e): the screen tour's `p.packet` shots, with variant `error-wrong-role` and state `interaction:live-check-pass`, are in `tools/lane-b-screen-tour/capture/tour.spec.ts` lines ~2355–2393. Their ids are `p.packet.error-wrong-role.{1280,390,1280-dark}` and `p.packet.live-check-pass.{1280,390,1280-dark}`. Their entry is in `designs/lane-b-ux-review/route-map.json` (`p.packet` "error" (a2), (a3)).
- **Missing shot:** a stored version that the current reading fails does not exist yet.
- **First capture failed:** the first capture's before-build stopped with ELIFECYCLE at 07:24 (TOUR_MINUTES=30 under a busy lock). Its log is lost.

### Reserved numbers
From LANES.md's claim row (redact-placeholders, then packet-day-counts): "0086 if the second does; … CAS-43 to CAS-44 (second); `packages/synth` cases the same if needed".
- **ADR 0086** (in use). Amendments go to ADRs 0047, 0054 and 0061.
- **Test-matrix CAS-43 and CAS-44** (in use).
- **Synth cases CAS-43 and CAS-44.** They are in the existing CAS module (MODULE_NUMBER 5), with `none(8, …)` registry entries and `fixtures/synthetic/CAS-43/expected.json` and `CAS-44/expected.json`. No new module.
- **No migration timestamps.** Anything more needs a COUNTER REQUEST; the next free are CAS-52 and ADR 0089.

### Setup arguments
`co-001/packet-day-counts:/home/user/packet-day-counts`

### Exact next step
1. **Machine.**
   - Run this in the background, again until it prints OK:
     `git -C /home/user/PhysicalTherapy fetch -q origin claude/build-ops && git -C /home/user/PhysicalTherapy show FETCH_HEAD:tools/setup-container.sh > /tmp/setup-container.sh && bash /tmp/setup-container.sh co-001/packet-day-counts:/home/user/packet-day-counts`
   - If it fails with "node: /opt/node24/bin/node reports 'v24.22.1', not v24.22.0", run `mv /opt/node24 /opt/node24.base-image` and run it again. origin's build-ops at 15725ba2 does not have the automatic fix.
   - storage.googleapis.com is allowed, so the playwright line must read ok.
   - Record `gh api user --jq .login`; expect PureTideWater.
   - Call `subscribe_pr_activity` for PureTideWater/PhysicalTherapy 84. If it says another Claude agent already watches the PR (the old session on Lane A's account), record that in the status file, read the PR with `gh api` / `pull_request_read` at each stage, and tell the orchestrator through the status file. Do not message the old session.
2. **Status file.**
   - Pull: `git -C /home/user/ops pull --no-rebase origin claude/build-ops`.
   - Correct the file (the list above), and commit in `/home/user/ops` with this session's attribution lines.
   - Push: `GITLEAKS=/root/.cache/paidwhole/gitleaks/8.24.3/gitleaks git -C /home/user/PhysicalTherapy push origin claude/build-ops`.
3. **Base merge.** In `/home/user/packet-day-counts`:
   - Run `git merge --no-ff origin/claude/build-platform` (83d71fd6, clean).
   - Under `flock /tmp/laneb-heavy.lock`, with `export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH`, run `pnpm install --frozen-lockfile`, `pnpm -s exec tsx tools/screening-capacity/watched.ts --write` and `pnpm synth --all`. No diff is expected; if there is one, commit it.
   - From here on, after every commit, push a safety copy to a **new** WIP ref, fast-forward only: `GITLEAKS=/root/.cache/paidwhole/gitleaks/8.24.3/gitleaks git push origin HEAD:refs/heads/co-001/wip-packet-day-counts-2`. This triggers no CI.
   - The PR branch still gets one push, at the end of the fix round.
4. **Recover the lost findings.**
   - **Done so far:** the design and its review, the build, the draft PR, the merge of 56ed6279, and the three reviews (whose findings are lost).
   - **Script:** adapt `workflow-scripts/lane-b-packet-day-counts-reviews-wf_5607bc50-a7b.js` (send_later first: see 5).
     - Use a new SP, HEAD = the step-3 merge, and BASE = `83d71fd6`.
     - The clone fetches `co-001/wip-packet-day-counts-2` and `claude/build-platform`, not the PR branch.
     - Put the PATH from step 3 in its RULES.
   - **Reviewers:** keep the payment-engine and correctness reviewers. Drop capture and UX: the first UX review read only code, and the UX review on shots runs in step 5.
   - **Reproduce the known blocking findings first,** then the should-fix items in the fix-round script's "In particular" list:
     - (both reviewers) an amount, date or day count takes the union of its clause's cues, so a dispute stated backwards passes, and the gateway's pre-call check regressed against the base;
     - (payment-engine) a whole-clause quote match passes in any role;
     - (correctness) a year lead beats a count noun, which reopens "2026 claims";
     - (correctness, for the lost UX blocking finding) a version the new reading fails still shows "Verifier passed" (`apps/web/src/components/packets/display.tsx`) and can be requested and approved (`apps/web/src/lib/routes/packets.ts` `requestApprovalAction` and `approvePacketVersionAction`, `apps/web/src/lib/cases/workbench.ts`).
   - **Findings file:** write the regenerated findings whole (severity, file, reproduction, fix) to `approval-summaries/lane-b-packet-day-counts-reviews.md` on build-ops, then pull and push. The fix round reads that file, not a scratchpad journal.
5. **Fix round.**
   - **Script:** adapt `workflow-scripts/lane-b-packet-day-counts-fix-round-wf_c661e0c2-b5e.js`:
     - a new SP;
     - WT `/home/user/packet-day-counts`;
     - BASE `83d71fd6` (its `narrative-roles.ts` is the strictness baseline);
     - JOURNAL and the old `pdc-review-*` paths replaced by the step-4 findings file;
     - this session's URL in the COMMIT lines;
     - the PATH from step 3 in RULES;
     - each fixer also pushes the WIP ref (and nothing else).
   - **Check-in:** before each heavy workflow (steps 4, 5 and 8), schedule a `send_later` about 5 h 10 min ahead, and cancel it when the run ends.
   - **Stages:**
     - **Fix:**
       - Fix every finding, and add every reproduction as a named CAS-43 or CAS-44 example.
       - Prove the gateway is at least as strict as the base on every swap the base caught.
       - Re-run the verifier in the request-approval and approve actions, and wherever "Verifier passed" is shown. Record any Postgres-side part as "for Lane A"; build no migration.
       - Stay off every file in LANES.md's "Not while #42 is open" list. `routes/packets.ts` and `display.tsx` are outside it.
       - Run the property tests over 40 seeds.
       - Update ADR 0086 and its amendments, the matrix and the synth matrix word for word, and run `pnpm synth --case`.
     - **The Stryker split:**
       - Split `roles-words.ts` (1,128 mutants; 22m42s locally; cancelled on CI) by word family. Each family is a file built per call, as `vocabulary()` is now, with its own shard.
       - The natural families are:
         - labels and nouns: `LABELS`, `ROW_LABELS`, `COUNT_NOUNS`, `ORDINAL_NOUNS`, `NOT_THE_COUNT`, `YEAR_*`;
         - the cue lists: `DAY_`, `PAGE_`, `AMOUNT_`, `PERCENT_` and `DATE_CUES`;
         - function and ordinal words.
       - Update `stryker/shards.json` (and its `$comment`), `stryker/base.mjs`, `tools/stryker/shards.test.ts`, `tools/stryker/affected.test.ts`, `tools/stryker/equivalent/packets.json` and `docs/runbooks/ci.md`'s shard table, and run `watched.ts --write`.
       - Aim for each shard under ~12 min locally. packets-roles took 7m16s locally and 10m04s on CI.
       - Never raise `timeout-minutes: 30` in `.github/workflows/mutation.yml`. Its matrix comes from `tools/stryker/affected.ts` over `shards.json`, so no workflow change should be needed. If one is, run `pnpm actions:check` and `pnpm toolchain:check`.
       - Time packets-rest too (17m23s locally before the fix).
     - **Re-review** with both lenses, then **Fix 2**.
     - **Capture:**
       - Before = TOUR_REF `83d71fd6`, after = the local HEAD (also on the WIP ref).
       - Use `TOUR_MINUTES=90` and follow `tools/lane-b-screen-tour/README.md` "From another lane" and "Set-up and a run".
       - Set TOUR_ONLY to the six existing ids plus the new shot's three.
       - Add the new shot, a stored synthetic version whose report passed under the old reading, opened by an approver, as `cap(...)` in `capture/tour.spec.ts` plus its `route-map.json` entry on build-ops. Pull, then push through the hook.
       - Shoot at 1280 and 390 px light and 1280 px dark.
       - Tile with `/usr/bin/python3 -I tools/lane-b-screen-tour/tile.py`.
       - PNGs never go on a branch; share them as a private gallery.
     - **UX review** on the shots, then **Fix 3**.
     - **Full suite:**
       - lint, typecheck, lint:logs, verify-content;
       - test, test:golden, test:oracle;
       - test:db in 4 shards on PG18 port 5433;
       - build, stamp, then e2e with `E2E_PREBUILT=1`;
       - every packets shard, timed, then the gate;
       - the synth check.
   - **Archive** the scripts as `workflow-scripts/lane-b-packet-day-counts-<stage>-<runId>.js`.
6. **One push.**
   - Run `GITLEAKS=/root/.cache/paidwhole/gitleaks/8.24.3/gitleaks git -C /home/user/packet-day-counts push origin HEAD:co-001/packet-day-counts`. It is a fast-forward from e3299ea2, through the hook. Never use `--no-verify` and never force.
   - Read CI: `all green`; `mutation`, with every packets shard inside 30 min; `screening-capacity gate`; `approval-of-record`.
7. **Description.**
   - Rewrite it from `.github/pull_request_template.md` with MCP `update_pull_request`, stay under 65,536 characters, and read it back.
   - Include the reviewer table: the 3 reviews (findings regenerated), the re-review and the UX review on shots, each finding with its resolution, and the sample.
   - Include the checks table with each shard's time, the shard split and the base merge.
   - End with this session's Claude Code footer.
8. **Verification.** One agent in a fresh clone, reading CI on the head. Adapt `workflow-scripts/lane-b-redact-placeholders-verify-wf_658451b6-c62.js`.
9. **Merge**, after #75:
   - Merge the latest base with a merge commit.
   - Resolve ADR 0054 keeping both: #75's text plus this PR's amendment paragraph, as design §7 says.
   - Regenerate with `pnpm install`, `watched.ts --write` and `pnpm synth --all`; never hand-merge them. Run the delta's checks.
   - Push, and get CI green.
   - Mark ready with MCP `update_pull_request` (draft false) or `gh api -X POST repos/PureTideWater/PhysicalTherapy/pulls/84/ccr/ready_for_review`. GraphQL and `gh pr ready` are refused here.
   - Wait for approval-of-record's re-run.
   - Call `merge_pull_request` with method merge and `expectedHeadSha`.
   - Unsubscribe, read the push runs, remove the worktree, and update the status file.

### Merge order and dependencies
- **Order** (handoff §6): #82, then #86, then #75, then **#84**, then #83, then #85. #84 merges only after #75. If the orchestrator changes the order, #75 resolves the conflict instead.
- **Conflicts** (merge-tree, checked live):
  - **#75 × #84: ADR 0054.** This holds against both #75's head 871faff9 and wip-5 7f77cb19. 871faff9 also conflicts on `uploader.tsx`, but that is #75's own base conflict. #84 resolves ADR 0054, keeping both.
  - **#85 (29dded52) × #84:** `docs/product/test-matrix.md`, and synth `matrix.ts` and `registry.ts`. #85 merges later and resolves them.
  - **SUITE-CAP-1b (358dc53f) and interest (e0646746) × #84:** test-matrix, `docs/runbooks/ci.md`, matrix and registry. The schema chain resolves these; those branches already conflict with the base on the same files.
  - **#83:** clean against #84, but it conflicts with the base on test-matrix and registry. It merges after #84 and resolves them.
  - **redact-ssn-phone** (no branch yet) may also amend ADR 0054. Whichever merges second resolves.
- **No conflicts** with #42 (be63bdc2), #82, #83 (f4a97668 and WIP f5e0ceba), #86, SS-01 (f897a282) or Dependabot #87–#89. ux-download-refusals, ux-table-scroll and ux-forms are already in the base.

### Waiting on someone
- **Founder: nothing blocks this merge.**
  - Approval of record: until runbook 3i (ADR 0063), merge on green required checks once the fresh-clone verification has passed (LANES rule 7).
  - Any migration is the founder's to approve through `docs/product/domain-model.md`. None is needed here.
- **Lane A** (Lane B's orchestrator acts for it until 2026-11-03 14:00 UTC; HANDOFF.md warns it may be 15:00):
  - design proposal 1, a migration to accept `tp-packet-verifier/3` and make it current;
  - any Postgres-side part of the "Verifier passed" fix.

  Record these as "for Lane A". **They do not block** the merge, because the handlers and the export job re-run the verifier.
- **Design proposal 2,** narrative prompt v2, needs an evaluation baseline with model access. It is not part of this PR and blocks nothing.

### Follow-on
none

### Resume
Resume from your status file: it is your handoff. Do not message the old sessions.

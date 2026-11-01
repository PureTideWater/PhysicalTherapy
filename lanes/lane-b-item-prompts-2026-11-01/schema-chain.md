## Your item
The schema chain is three Lane A schema PRs. This session runs them as acting Lane A from Lane B's account until Lane A returns. LANES.md gives that return as 2026-11-03 14:00 UTC; HANDOFF.md warns it may be 15:00 UTC (EST from 2026-11-01).
- **SS-01** (`designs/ss-01-suspension.md`): a suspended firm's granted practices still start new work. This is a blocking defect handed over by #56.
- **SUITE-CAP-1b** (`designs/suite-cap-1-triage-locks.md`, part 1b): `line_status_rules()` takes one advisory lock per line, which runs out of the lock table at real size. Part 1a merged as #81 (56ed6279).
- **The interest fix** (`designs/ledger-interest-once.md`): AMT I and PLB L6 are both credited, so interest counts twice.

All three are built in part. They merge strictly in the order #42, SS-01, 1b, interest, and only one schema PR is open at a time (LANES.md rule 2). Each merges only after the founder commits its domain-model approval line. The founder granted both ledger freeze exceptions on 2026-10-27 at 20:49 UTC (`approval-summaries/founder-asks-2026-10-27.md` line 3).

Read in this order:
1. `lanes/lane-b-session-brief.md` (re-dated in your prompt).
2. `lanes/acting-lane-a-brief.md` on build-ops.
   - This file is **not on build-ops at 15725ba2**. The orchestrator writes it, so pull build-ops first.
   - Its schema rules replace the session brief's §8 ban on migrations and on the domain model for this item.
   - If it is still missing, these rules hold:
     - Migrations go only through `/new-migration`'s marker route, and only for the chain's own unmerged 20261108090000, 20261109090000 and 20261110090000.
     - Never write the approval line or `approvers.json`.
     - One schema PR open at a time, and no merge without the founder's committed line.
     - Commit the regenerated `packages/db/functions` before the founder signs.
     - The description opens with `--summary-since … --function-diffs list`.
3. The status file.
4. The three designs.
5. `approval-summaries/lane-a-ss01-build-result.json`, which holds SS-01's suite totals and handed-on items (a) to (j).
6. `approval-summaries/lane-a-ss01-merge42-sc1b-build-result.json`.
7. `approval-summaries/lane-a-suitecap1b-reread.json`.
8. `.claude/skills/new-migration/SKILL.md`.

### Branch and head
Live heads, checked with `git ls-remote` at 14:50 UTC:
- **SS-01:** `co-001/ss-01-suspension-refusal` at `f897a282c50ca6c91a325800dca69850257d3af8` (2026-10-28 05:56Z).
  - It contains 2ff5c631, which merged the base at 56ed6279: #76, #77, #80, #79, #74 and #81. It also contains 6f23c42b, f5bd6201 and d763ba78.
  - It lacks #42's be63bdc2 and the base 83d71fd6 (#78).
  - No checks of f897a282 are recorded.
- **SUITE-CAP-1b:** `co-001/suite-cap-1-triage-locks` at `358dc53f5340092daf57226a0769486218bd5418` (2026-10-28 03:25Z).
  - It descends from f5bd6201.
  - It lacks f897a282 and 56ed6279 (1a's readers).
- **Interest:** `co-001/ledger-interest-once` at `e064674676fbbedb9688fecbf833bfe4bcf820bf` (2026-10-28 07:47Z).
  - That is 358dc53f plus b5949dc1 (schema), a3c9d068 (ledger core), 1b5036e3 (synth), 39e5caa0 (reconcile) and e0646746 (records).
  - **Slice 4 (screens) is not on origin.**
- **WIP refs:** none exist for the chain, so continue from the three heads. `co-001/wip-suite-cap-1a` (13b69afa) is 1a's, which merged; ignore it.
- **Inputs:**
  - #42: `co-001/pr-06b-mail-streams` at `be63bdc2ab933532785dd3058c423db04ff6b25e`, equal to `co-001/wip-pr42-integrate`.
  - The base: `claude/build-platform` at `83d71fd62c6d419be61fd7aaa5b9033ef5c18b56`.
- **Never force a push.** A diverged WIP ref goes to a fresh name (`co-001/wip-<item>-2`).

### PR
- There is no PR, open or closed, from any of the three branches. No CI runs exist on them either.
- #42 is open as a draft at be63bdc2, with mergeable_state `behind` (base 56ed6279).
- SS-01's draft PR opens only after #42 merges. 1b's opens after SS-01 merges, and interest's after 1b merges. Open none before then.

### Design
All three are on build-ops. Every design was written against e908c21 and #42 at 15189a50 (SS-01) or 6f23c42b (the other two), so re-read the parts the new heads touch.
- **`designs/ss-01-suspension.md`:** designed and reviewed (9 findings, all taken; §18; last commit 216da70a).
  - The design stage's progress files are `approval-summaries/lane-a-wip/progress/design-ss01-*.md`.
  - The builders' progress was in the old scratchpad and is lost.
- **`designs/suite-cap-1-triage-locks.md` part 1b:** reviewed (§16; 37bf0fb7).
  - The 2026-10-27 re-read said "build with deltas" (`lane-a-suitecap1b-reread.json`).
  - §4.5 is the granted ledger part. §13 lists the slices. §7's CAS-42.5 and .6 are the real-size runs.
- **`designs/ledger-interest-once.md`:** two reviews (§15, §16; e682aa56).
  - §10.1 is the granted exception; stay inside its text. §13 lists slices 1 to 6.
  - The build's re-read deltas were never archived and are lost.

### Status file
`approval-summaries/lane-a-schema-chain-status.md` exists; its last commit is f540d48b (2026-10-28 05:41Z). Correct these first, then push build-ops: `git -C /home/user/ops pull --no-rebase origin claude/build-ops`, then `GITLEAKS=/root/.cache/paidwhole/gitleaks/8.24.3/gitleaks git -C /home/user/PhysicalTherapy push origin claude/build-ops`. Never force.
1. **Session.** It names session_019i9ifCi6u3MV8sy7oAhUmy, which is on Lane A's account and stopped. Replace it with this session: Lane B's account, acting Lane A, for orchestrator session_01FcouKNNHsdecRMzfTs7XwW.
2. **SS-01's head.** It says f5bd6201 in "Now" and in the Items table. Live it is f897a282:
   - 2ff5c631 merged base 56ed6279 (#76, #77, #80, #79, #74, #81).
   - f897a282 puts the suspension card on #74's fields and #79's table floor.
   - The domain model still reads 6559c5b9…c2fadc at line 7413.
3. **wf_96af352a-4ed shows "Running".** It stopped in or after stage 1:
   - It pushed 2ff5c631 (05:47) and f897a282 (05:56). The account stopped near 08:00.
   - Stage 1's checks (4 test:db shards and the whole e2e suite) have no surviving record, so treat f897a282 as unchecked.
   - Stages 2 to 4 never pushed: SS-01 into 1b, the deferred parts, the route scout and the integrator.
   - No `b1b-*.md` progress files exist, and the old scratchpad is gone.
4. **Interest shows "Building (wf_4860596d-bb1)".**
   - Slices 1, 2, 3 and 5 are pushed.
   - **Slice 4 (builder W, the screens) is not.** No `apps/web` file changes between 358dc53f and e0646746, and `apps/web/e2e/ledger-interest.spec.ts` does not exist.
   - The re-read's deltas and the builders' reports are lost.
   - The Integrate phase never ran.
   - The domain model at e0646746 reads 3083defa…0d09 at line 7468, never checked.
5. **1b "waits on 1a and SS-01".** 1a has merged (#81, 56ed6279), but 1b is still 358dc53f and contains neither 56ed6279 nor f897a282.
6. **Check-ins.** trig_015zUyNTQAE48NHK4vYz3Sw6 and trig_011P79pdAThs6U9K5f147QAX are gone; `list_triggers` returns nothing.
7. **#42.** "#42 moved to 6f23c42b" and "fix round on co-001/wip-pr42-*" are stale. #42 is at be63bdc2, open and draft. Its own session (S0) merges 83d71fd6 and records the 2026-11-01 legal sign-off in ADR 0065 and reconciliation-001 (step 1), then pushes.
8. **"For SS-01's base merge at PR time."** It lists #80, #79 and #74 as still to merge; they are already in SS-01. The base delta now is #78 (83d71fd6) only, and the trial merge conflicts in `apps/web/scripts/synthetic-personas.ts` only.
9. **SUITE-CAP-3.** It is said to run in "SUITE-CAP-1a's session, after 1a". It is now Lane B's own item (`lane-b-suite-cap-3-status.md`; its design was lost), not this session's.
10. **"Decisions taken: None yet."** That contradicts the 03:55 decisions: the SELECT grant on `line_status_head` to tp_app; CAS-42.3 at 2,000 lines; LED-06's segments. Move them under that heading.
11. **"Waiting on someone".** Add the 8-CPU runner for 1b's CAS-42.5 and .6 (founder).

### Reserved numbers
From LANES.md's claim rows, quoted exactly:
- **SS-01:** "ADR 0080 if the design needs one; test-matrix BIL-07 to BIL-10; `packages/synth` cases the same if needed (module 15)".
- **SUITE-CAP-1 (shared row):** "ADR 0083 if the design needs one; test-matrix CAS-40 to CAS-42; `packages/synth` cases the same if needed (module 5); fixture release 900008 only if needed".
  - CAS-41 is 1a's and already merged.
  - ADR 0083 exists on the base, and 1b adds its section. It is not yet on 1b's branch.
- **Interest:** "ADR 0084 if the design needs one; test-matrix LED-23 to LED-25; `packages/synth` cases the same (module 6); fixture release 900008 only if needed".

Migration timestamps are not in the reservation cells; only 1b's state cell names 20261109090000. On the branches:
- `20261108090000_suspension_refusal.sql`
- `20261109090000_line_status_heads.sql`
- `20261110090000_ledger_interest_once.sql`

The base ends at `20261106090000_screening_consumer.sql`, and #42 adds `20261107090000_mail_streams.sql`. No COUNTER REQUEST is needed.

### Setup arguments
`co-001/ss-01-suspension-refusal:/home/user/ss01 co-001/suite-cap-1-triage-locks:/home/user/sc1b co-001/ledger-interest-once:/home/user/interest`

Run them through the session brief §1 command. If setup fails with "node: /opt/node24/bin/node reports 'v24.22.1', not v24.22.0", run `mv /opt/node24 /opt/node24.base-image` and run setup again. (The script on origin at 15725ba2 does not move it itself.) storage.googleapis.com has been allowed since 2026-10-27, so the playwright line should read ok.

### Exact next step
1. **Setup.**
   - Run the setup script in the background until it prints OK.
   - Record `gh api user --jq .login`; it should print PureTideWater.
   - Correct the status file as listed above and push build-ops.
2. **Workflow 1 (heavy), started now.** Adapt `workflow-scripts/lane-a-base-into-ss01-sc1b-deferred-wf_96af352a-4ed.js`.
   - **Edits to the script:**
     - `SP` becomes your own scratchpad, and `ATTR`'s Claude-Session line becomes your session URL.
     - COMMON's PATH becomes `/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH`. Drop `/home/user/pr6b4`, which is not set up.
     - Keep COMMON's "never write in /home/user/interest".
     - Rewrite stage 1's prompt: the head is f897a282, which already holds 56ed6279 and the #79 and #74 patterns, so verify them rather than redo them. The base is 83d71fd6, which adds #78 only.
     - 1b's head is 358dc53f.
   - **Stage 1, base into SS-01:**
     - Merge 83d71fd6 with a merge commit and resolve `synthetic-personas.ts` keeping both sides.
     - Regenerate on a fresh database: the domain model, `packages/db/functions`, `watched.ts --write` and `synth --all`.
     - Never change `apps/web/src/app/tables.test.ts`'s counts; wrap any table in ScrollTable instead.
     - Run the script's whole check list, because f897a282 was never checked: typecheck, lint, lint:copy, lint:logs, unit, test:db in 4 shards, build, stamp, then the **whole** e2e suite (`E2E_PREBUILT=1 --workers=2`, ports 4971-4979), verify-content, synth and fixtures, and `db:domain-model --check`.
     - Push.
   - **Stage 2, SS-01 into 1b:**
     - Merge the new SS-01 head into 1b with a merge commit. The domain model and function files are regenerated, never hand-merged.
     - In test-matrix, `docs/runbooks/ci.md`, synth `matrix.ts` and `registry.ts`, keep both sides: CAS-41 sits between CAS-39 and CAS-40.
     - Keep ADR 0083 whole.
     - Check that 1a's readers meet 1b's `line_status_head` and `claim_by_superseded`.
     - Push.
   - **Stage 3, 1b's deferred parts:**
     - The slice 1 measurement gate.
     - CAS-42.1 and .2, with SLOW_FIRST and `tools/test/db-shards.test.ts`'s count (`reconcile.large` beside `triage.large`).
     - ADR 0083's 1b section.
     - Run the read-only real-size route scout beside them. It must not dispatch anything. Give it these facts:
       - The repo is public and owned by a User account (`gh api`).
       - On the base, `.github/workflows/release-capacity.yml` runs on `ubuntu-26.04` (1b's 358dc53f still reads `ubuntu-24.04`) and has `workflow_dispatch`.
       - `docs/runbooks/screening-capacity.md`, "Time advisory and binding": larger runners exist only for organizations on GitHub Team or Enterprise Cloud.
   - **Stage 4, integrator:**
     - An adversarial read, then the full local suite once. Exclude CAS-42.5 and .6 (the real-size runs) and record them as waiting.
     - One push, no PR.
3. **Workflow 2 (heavy), started once workflow 1 has pushed stage 2.** Wait for stage 2 because the base changed both slice-4 pages since e908c21: `reconciliation/page.tsx` by 100 lines through SS-01, and the ROI page. Building W on 358dc53f's copies would conflict.
   - Adapt `workflow-scripts/lane-a-interest-once-build-wf_4860596d-bb1.js`. Rewrite `SP`, `ATTR` and PATH.
   - **(a) A new first stage:** merge 1b's new head into interest with a merge commit.
     - Regenerate the domain model and functions on a fresh database.
     - In test-matrix, ci.md, matrix and registry, keep both sides.
     - Run typecheck, lint, unit, test:db in 4 shards and `db:domain-model --check`. Push.
   - **(b) Builder W only,** from phase "Screens and records" (lines 86-91): slice 4 per §13 and §§6.3 and 7.
     - `DELTAS`, `CSINFO` and `RINFO` are lost. Replace them with: "read §16 and the pushed commits a3c9d068, b5949dc1, 39e5caa0, 1b5036e3 and e0646746 for the interfaces".
     - Keep `tables.test.ts`'s counts.
     - W may add its tests to LED-23/24's `assertedBy`.
   - **(c) Phase Integrate** (line 103 onward), with its report inputs replaced the same way.
     - Whole-repo checks.
     - A seam read against §10.1's granted text and §16.
     - The full local suite once (Stryker 100% on `interest.ts`; e2e on ports 4981-4989).
     - One push. Record the domain model's SHA-256 and line number.
   - **For both workflows:**
     - Run every heavy command under `flock /tmp/laneb-heavy.lock`. Run at most two heavy workflows at once.
     - Schedule a `send_later` about 5 h 10 min ahead before each run.
     - Archive both scripts on build-ops under the names `acting-lane-a-brief.md` gives. If it gives none, use `workflow-scripts/lane-a-<item>-<stage>-<runId>.js`, matching the chain's earlier scripts.
4. **When #42 pushes its step-1 head.** `git ls-remote origin refs/heads/co-001/pr-06b-mail-streams` stops reading be63bdc2; the orchestrator also tells you.
   - Never merge into a worktree while a workflow is writing there.
   - Merge that head into SS-01 with a merge commit and regenerate the domain model and function files.
   - Re-read SS-01's recreated objects on #42's bodies: the `audit_event_record` policy, the `organization` table and SS-01's functions.
     - If a body moved, change 20261108090000 only through `/new-migration`'s `.claude/.allow-protected-edit` marker route.
     - The marker is set and removed in a trap, never committed, and allowed only for the chain's own unmerged migrations.
   - Run the checks and push.
   - Then merge SS-01 into 1b, then 1b into interest, with the same merge, regenerate and db-test steps, pushing each.
5. **After #42 merges (the orchestrator tells you): SS-01's PR stage.**
   1. Merge the latest base and regenerate. Re-read the recreated objects if #42's migration changed after step 1.
   2. Open the draft PR into `claude/build-platform`.
      - The description follows `.github/pull_request_template.md`.
      - `pnpm -s db:domain-model --summary-since origin/claude/build-platform --function-diffs list` goes whole at the top.
      - Keep it under 65,536 characters.
      - Write it with MCP `update_pull_request`, read it back, and call `subscribe_pr_activity`.
   3. Two reviews: tenancy and security; UX and brand, with shots at 1280 and 390 px light and 1280 px dark.
   4. The fix round with the full suite, including `db:domain-model --check` on a fresh database. One push.
   5. A fresh-clone verification reading CI. Everything must be green except `domain model`, whose log names only the missing approval.
   6. Commit `packages/db/functions` before the founder signs.
   7. Post the line that `--check --require-approval` names as one suggested-change PR comment, via `gh api repos/PureTideWater/PhysicalTherapy/pulls/<n>/comments` (new-migration skill). Never a review, never the line itself, never `approvers.json`.
   8. Tell the orchestrator. After the founder's commit:
      - Re-merge the base if it moved.
      - Get the required checks green: all green, mutation, screening-capacity gate, approval-of-record.
      - Mark the PR ready and wait for approval-of-record's re-run.
      - Run `merge_pull_request` with method merge and `expectedHeadSha`.
      - Unsubscribe, read the push runs, and clean up.
6. **1b, after SS-01 merges.** Same pipeline.
   - Its reviews are database and concurrency; reliability (harness, heap line, alarm); and payment-engine (§4.5).
   - Its PR carries the before-and-after real-size summaries (CAS-42.6).
7. **Interest, after 1b merges.** Same pipeline. Its reviews are payment-engine, and UX and brand with shots.

**Pipeline state:**

| | Design | Build | Suite | Still to run |
|---|---|---|---|---|
| SS-01 | done | done; f897a282 unchecked | done at d763ba78 only | base and #42 merges with checks, PR, reviews, fix round, verification, approval, merge |
| 1b | done | partial (358dc53f) | not run | SS-01 merge, deferred parts, integrator suite, real-size runs, PR onward |
| Interest | done | partial: slices 1, 2, 3 and 5; **slice 4 missing** | not run | 1b merge, slice 4, integrator suite, PR onward |

### Merge order and dependencies
**Order:** #42, then SS-01, then 1b, then interest, each opening only after the one before has merged.
- Lane B's PRs merge independently in the order #82, #86, #75, #84, #83, #85.
- Each schema PR merges the latest base just before its own merge.
- The PR merged second resolves conflicts, keeping both sides (rule 6).

**Conflicts per /tmp/brief.md Part 2, re-checked live:**
- **SS-01 × base:** `apps/web/scripts/synthetic-personas.ts`. SS-01 resolves it now.
- **SS-01 × #42:** `docs/product/domain-model.md`, regenerated on SS-01's side.
- **1b × SS-01:** `domain-model.md` (regenerated), `docs/product/test-matrix.md`, `docs/runbooks/ci.md`, `packages/synth/src/cases/{matrix,registry}.ts`. 1b resolves them.
- **1b and interest × base:** `synthetic-personas.ts`, `console/billing/page.tsx`, `console/organizations/[organizationId]/page.tsx`, `p/[practiceId]/settings/agreements/page.tsx`, ADR 0062, test-matrix, ci.md, matrix and registry.
  - These arrive through SS-01's merges.
  - Never merge the base straight into 1b or interest ahead of SS-01.

**Trial merges today, files both sides change:**
- SS-01 × #85 29dded52: `apps/web/src/lib/routes/uploads.ts`, test-matrix, matrix, registry.
- 1b × #85 and interest × #85: `uploads.ts` (SS-01's change, carried), plus the base files.
- Interest × #75 (871faff9 and wip-5 7f77cb19): `packages/synth/src/cases/workflow.ts`.
- SS-01 × #86: `synthetic-personas.ts` only, because #86 already holds 83d71fd6. It clears once SS-01 merges 83d71fd6.

Whichever PR merges second resolves; normally that is the schema PR.

### Waiting on someone
- **Founder: #42's domain-model approval.** It gates #42's merge, which S0 runs. It blocks SS-01's PR from opening.
- **Founder: each schema PR's domain-model approval.** The founder commits the suggested line on GitHub, as on #39 (54ec890). This blocks each merge (CO-02).
- **Founder: a route for 1b's real-size runs** (CAS-42.5 and .6, the design's "Before and after on the PR").
  - This container's 4 CPUs stop them as RUNNER_TOO_SMALL.
  - GitHub's larger runners exist only for organizations on Team or Enterprise Cloud, and the owner PureTideWater is a User account.
  - The founder's third ruling of 2026-10-23, "Free: time advisory", took the screening-capacity jobs off the 8-core runner for that reason. That ruling does not decide this case.
  - It is a cost and owner-admin decision. Ask early.
  - It does not block 1b's PR from opening or its reviews. As designed, it blocks 1b's merge, and therefore interest's PR, unless the founder rules otherwise.
- **For the founder's information:** SS-01's `REFUSAL_SUMMARY.organization_suspended` reads "new work had stopped for the practice's organization". It blocks nothing.
- **Already granted, nothing waiting:** both ledger freeze exceptions (2026-10-27 20:49 UTC). Each PR quotes the grant word for word in its ADR (0083, 0084) and in reconciliation-001.

### Follow-on
None. Stop at a clean, recorded point before Lane A returns at 2026-11-03 14:00 UTC (possibly 15:00). The orchestrator writes the handback from your status file. SS-01's handed-on items (a) to (j) stay Lane A's. SUITE-CAP-3 is Lane B's, not this session's.

### Resume
Resume from your status file: it is your handoff. Do not message the old sessions.

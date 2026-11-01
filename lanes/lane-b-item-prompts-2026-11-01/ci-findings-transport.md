## Your item
`ci-findings-transport` is a latent CI defect in the content calendar. At `.github/workflows/content-calendar.yml:78`, notify's one step puts `FINDINGS_B64: ${{ needs.check.outputs.findings }}` into a single environment variable. That value is the base64 of `findings.json`, which is capped at `MAX_FILE_BYTES = 700_000` (`tools/content-calendar/render.ts:18`, refused at `:127-135`), so it can reach 933,336 characters. Linux allows 131,072 bytes for one environment string. Any findings file over 98,292 bytes stops notify before bash starts, the job goes red, and nothing is filed.

This is the same class of failure as #42's `images` failure, where buildx metadata was 132,387 bytes against 131,072. #86 fixes that one and lists this value as over the limit in its T6 table (`over: 'ci-findings-transport'`).

The defect is still latent. Every scheduled run has succeeded; the latest is 41315385814 (2026-11-01 14:16 UTC, at 83d71fd6, both jobs green). The task is to change the transport so that 20 full findings, plus the titles of the rest, always reach notify, and to hold that with a property test. It is a no-migration Lane B item under ADR 0071 (the repository is public).

### Branch and head
- `co-001/ci-findings-transport` is not on origin. `git ls-remote origin` at 16:24 UTC shows no ref matching finding, transport or calendar. There are no WIP refs, and no PR has this head (open or closed).
- Cut the branch from `claude/build-platform` only after #86 merges. The live heads now:
  - the base: 83d71fd62c6d419be61fd7aaa5b9033ef5c18b56;
  - #86 (`co-001/ci-images-digest`): 83167b8f659acf526c1c3252ec6e0f3e69a0086c;
  - #82 (`co-001/ci-pin-age`): 96758e442dd01e2fb393ff6e9cac6f07e58a78c2;
  - `claude/build-ops`: 15725ba2.

### PR
None yet: open a draft PR at the build stage.

### Design
- The design does not exist yet. Write `designs/lane-b-ci/ci-findings-transport.md` and its review `designs/lane-b-ci/ci-findings-transport-review.md` on `claude/build-ops`, following the ci-images-digest precedent.
- The source is `designs/lane-b-ci/ci-images-digest.md`: 1,205 lines, SHA-256 `3088a50f88fb53a2…a332`. It was folded at 06:19–06:37, committed in 7af84163 (2026-10-28 07:11 UTC), and has not changed since. Read:
  - §3: the inventory row at `:360` and the note at `:370`;
  - "What left this change" at `:479-488`;
  - C6 and C7 at `:1007-1027`;
  - R6 at `:1066-1067` and R7 at `:1068-1073` (the run-of-record pattern);
  - §12 P3 at `:1092-1112`;
  - the fold's S3, S4 and N7 at `:1180-1201`.
- Also read:
  - `designs/lane-b-ci/ci-images-digest-review.md`: S3 at `:142-166`, S4 at `:168-186`;
  - for background, `designs/lane-b-release-content-checks.md`, the content calendar's own design. Its fix rounds SB-5 and S8 explain notify's shape.

### Status file
- **Path:** `approval-summaries/lane-b-ci-findings-transport-status.md`. It does not exist on build-ops 15725ba2; the orchestrator creates it. If it is still missing when you start, create it in the RESUME-BLOCK format of `lane-b-ci-images-digest-status.md`.
- **Do not edit `LANES.md`, `lanes/lane-b.md` or `HANDOFF.md`** (session brief §7). The orchestrator writes them from your status file. If a LANES fact below is still stale after your first pull, list it in your status file for the orchestrator.
- These facts in other records are contradicted by live state. Do not carry them into your file:
  - **`LANES.md:197`, Lane cell:** reads "B (run by Lane A's orchestrator)"; should be "B". The orchestrator fixes it (brief F).
  - **`LANES.md:197`, State cell:** reads "Queued in session_01UzQ6wgZgtThBRBxXTFYhRB after ci-images-digest merges; below #82's merge". In fact it is this session's item: design now, build after #86 merges. The orchestrator fixes it.
  - **"The last scheduled run, 40510094317, succeeded"** (`LANES.md:197`, design C7 at `:1022`, `lane-b-ci-images-digest-status.md:35`):
    - the latest scheduled run is 41315385814 (2026-11-01, success);
    - 40701931556, 40890577605, 41069380201 and 41206542657 also succeeded, as did push run 40593100120 (#77's merge);
    - scheduled runs fire at about 13:40–14:20 UTC, not at the cron's 07:17.
  - **`lane-b-ci-deps-status.md:22`** queues this item in the old CI session ("Then P2, P4"). That session no longer carries it. The file belongs to #82's session; leave it alone.
  - **`lane-b-ci-images-digest-status.md`** says "build starting" (06:41) and is stale. In fact:
    - #86 is an open draft at 83167b8f, mergeable clean, with a body of 125,892 characters;
    - its 25 checks are 23 success and 2 skipped (runs 40653896226, 40653896246, 40653896254, 40653896273, 40653896300);
    - it has no reviews.

    The file is #86's session's to fix; read live state instead.
  - **Design line references:**
    - `workflows.test.ts:1124` (notify has no `uses:`) still holds on the base, inside `expectQuietNotify` `:1119-1128`. On #86 it is `:1135`, inside `:1130-1139`. The helper also pins `permissions` to exactly `{ issues: 'write' }` and forbids `${{` in `run:`. release-capacity's notify uses it too (`:1292` on #86, `:1281` on the base).
    - On #86, T6 is at:
      - `BoundedValue.over`: `:3194-3199`;
      - the two content-calendar rows: `:3228-3240`;
      - the `over` assertions: `:3307-3311`.
    - On #86, T3's `unboundedValueProblems` is at `:3064`. `notifyStep` and `runNotify` are at `:1195` and `:1198`.

### Reserved numbers
- **None reserved;** the claim row says "None expected". If you need a number, write "COUNTER REQUEST: <what>" at the top of the status file and use a placeholder until the orchestrator fills it in the claim row. Never take one yourself.
- **Expected:** no new ADR. ADR 0071 is amended, and ADR 0066's Part 3 sentence at `:982-983` on #86 is edited.
- **If a test-matrix row is needed:** by the orchestrator's count, the next free CI number is 30 and the next free RCC number is 09. The CI-21 to CI-29 range is held by P1, P2, P4 and P5. A new row also needs its `packages/synth` registry case, because the fixtures test wants one per row.

### Setup arguments
- **Design stage:** no arguments. Run it in the background, and repeat until it prints OK:
  ```
  git -C /home/user/PhysicalTherapy fetch -q origin claude/build-ops && git -C /home/user/PhysicalTherapy show FETCH_HEAD:tools/setup-container.sh > /tmp/setup-container.sh && bash /tmp/setup-container.sh
  ```
  - If it fails with "node: /opt/node24/bin/node reports 'v24.22.1', not v24.22.0", run `mv /opt/node24 /opt/node24.base-image`, then run setup again.
  - To read #86, first run `git -C /home/user/PhysicalTherapy fetch -q origin +refs/heads/co-001/ci-images-digest:refs/remotes/origin/co-001/ci-images-digest`, then `git -C /home/user/PhysicalTherapy show origin/co-001/ci-images-digest:<path>`.
- **Build stage:** `co-001/ci-findings-transport:/home/user/ci-findings-transport`. The script refuses a branch that is not on origin ("is not on origin"), so push the cut branch first (step 4).

### Exact next step
Done: only the claim (`LANES.md:197`, 2026-10-28 06:55). Remaining: design with its reviewer, build, draft PR, two reviews, fix round, verification, merge.

1. **Machine, then records.**
   - Run setup (above), then `git -C /home/user/ops pull --no-rebase origin claude/build-ops`.
   - Create or correct your status file only, not LANES.md.
   - Push with `GITLEAKS=/root/.cache/paidwhole/gitleaks/8.24.3/gitleaks git -C /home/user/PhysicalTherapy push origin claude/build-ops`. Pull first and never force.
2. **Design with one reviewer, now.**
   - Adapt `workflow-scripts/lane-b-ci-follow-ups-design-wf_bdbe0a79-0d1.js`: one author, one adversarial reviewer (CI and test infrastructure, with the security lens on notify's token and permissions), then the fold.
   - Rewrite `SP` (your own scratchpad), `OUT` and `DESIGN`. Also rewrite `CTX`:
     - the base 83d71fd6 and #86's head 83167b8f;
     - the standing rulings;
     - no reserved numbers;
     - #42's files;
     - no migration.
   - Rewrite `ITEMS` as this one item, and the fold's "Review (<date>)" heading. Keep the SAVE progress files.
   - Copy the folded design and the review into `designs/lane-b-ci/`.
   - The design must:
     - **Re-read live code:**
       - `content-calendar.yml` at 83d71fd6: check outputs `:45-46`, the calendar step `:54-60`, notify `:65-135` (`gh` at `:86`, `:94`, `:123`);
       - `render.ts:15-18` and `:127-135`;
       - `tools/content-calendar/index.ts:81-87`: today it writes `findingsJson` before the summary;
       - `content-calendar.test.ts:580-584`;
       - on #86's head, `tools/test/workflows.test.ts`: T3 (`:3064`), T6 (`:3194-3311`), `expectQuietNotify`, `runNotify`, the check job's test (`:1156`) and notify's tests (`:1208-1266`);
       - ADR 0071; `docs/runbooks/content-updates.md`; ADR 0066 `:982-983` on #86; `docs/runbooks/ci.md:60-61`. Line 61 says notify "alone holds `issues: write`, checks nothing out and runs no repository code".
     - **Weigh P3's candidates:**
       - fixed `FINDINGS_B64_0` to `_3`, each at most 131,056 characters, under the 1 MB limit on job outputs. Each new value needs its own T6 row with a bound.
       - an artifact read with `gh run download "$GITHUB_RUN_ID" -n findings`:
         - It needs `actions: read`, which changes `expectQuietNotify` (release-capacity shares it) and `ci.md:61`.
         - It adds `actions/upload-artifact` to the check job: reuse the repository's existing pin, since #82's three-day floor applies to any new pin.
         - The repository is public, so the artifact is readable; confirm the findings hold only public references (ADR 0071 Q1).
         - Verify, do not assume, that a running run's own v4 artifact downloads.
       - a total budget for bodies. This changes what an issue says.
     - **Hold P3's property in a test:** `MAX_OPENED_PER_RUN × (MAX_BODY + overhead) + titles of the rest ≤ capacity`. Compute the capacity from 131,072 bytes per environment string and from 1 MB of job outputs counted as UTF-16.
     - **Carry these over:**
       - write `summary.md` before `findingsJson`;
       - append the summary whenever it was written, then exit with the CLI's status;
       - expect "over 98292" (no separator) if the bound changes;
       - rewrite T6's `over` row and remove the `over` field, so that no row is over the limit.
     - **Name the run of record for notify**, which never runs on a pull request.
       - The pull request exercises only the check job.
       - The merge's own push run triggers the workflow (the push paths include `content-calendar.yml` and `tools/content-calendar/**`), so notify runs for real within minutes, as #49's merge run 40339580175 did. Take that run as the proof, recorded as #86's R7 is.
       - A `workflow_dispatch` on the branch would file real `content-due` issues on the public repository. Prefer the merge run.
       - Add a local proof that a file over 98,292 bytes passes. #86's T2 E2BIG test is the pattern.
     - **Confirm the item needs no migration.** If one turns out to be needed, stop that part and record it "for Lane A" (rule 2).
   - Archive the script as `workflow-scripts/lane-b-ci-findings-transport-design-<runId>.js` and push build-ops.
3. **Wait for #86.**
   - Do not `subscribe_pr_activity` to #86; its own session holds that subscription.
   - Poll with `gh api repos/PureTideWater/PhysicalTherapy/pulls/86 --jq '.merged, .merge_commit_sha'` and `git ls-remote origin claude/build-platform`, with `send_later` check-ins.
   - After #86 merges, re-read the design against the merge commit, because #86's fix round may change T3 or T6. If it changed what the design relies on, adapt `lane-b-ci-pin-age-reread-wf_05b5c43a-d57.js`.
4. **Cut, push and build.**
   - Run:
     ```
     git -C /home/user/PhysicalTherapy fetch origin claude/build-platform && git -C /home/user/PhysicalTherapy branch co-001/ci-findings-transport origin/claude/build-platform && GITLEAKS=/root/.cache/paidwhole/gitleaks/8.24.3/gitleaks git -C /home/user/PhysicalTherapy push origin co-001/ci-findings-transport
     ```
   - Run setup with the build argument.
   - Build red first by adapting `lane-b-ci-pin-age-build-wf_6cbdbf9d-9c3.js`.
   - Open the draft PR into `claude/build-platform` at once:
     - write the description from `.github/pull_request_template.md`, under 65,536 characters;
     - send it with MCP `update_pull_request` and read it back;
     - call `subscribe_pr_activity`.
5. **Two adversarial reviews in fresh clones:** CI and test infrastructure; security and supply chain (`.claude/agents/security-reviewer.md`). Adapt `lane-b-ci-browser-reviews-wf_7b903031-7ca.js` and drop its Capture phase and its UX review; nothing a person sees in the product changes.
6. **Fix round.** Adapt `lane-b-ci-pin-age-fix-round-wf_dfb43bb4-b4c.js`.
   - Run the full local suite once, plus `BASE=origin/claude/build-platform pnpm actions:check` and `BASE=origin/claude/build-platform pnpm toolchain:check` (this is a workflow change).
   - Run each under `flock /tmp/laneb-heavy.lock`, with `export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH`.
   - Push once.
   - Before each heavy workflow, schedule a `send_later` about 5 h 10 min ahead.
7. **Fresh-clone verification reading CI.** Adapt `lane-b-ci-pin-age-verify-wf_4dac1326-48a.js`.
8. **Merge.**
   - Merge the latest base in with a merge commit. Regenerate any generated file; never hand-merge one.
   - Wait for green on `all green`, `mutation`, `screening-capacity gate` and `approval-of-record`. The content-calendar `check` also runs on this PR and must be green.
   - Mark the PR ready, wait for approval-of-record's re-run, then call `merge_pull_request` with method merge and `expectedHeadSha`.
   - Read the merge's push run of content-calendar, notify included, and record it as the run of record.
   - Unsubscribe and clean the worktree.
   - Record the merge, its commit and the run in the status file. The orchestrator logs them in LANES.md and `lanes/lane-b.md`.

### Merge order and dependencies
- **Order:** #82 (96758e44) first, then #86 (83167b8f), then this item. The branch is cut after #86 merges, so it starts from #82's and #86's ADR 0066, reconciliation-001 and `workflows.test.ts`.
- **No overlap on this item's own files:** none of the open PR heads touches `content-calendar.yml`, `tools/content-calendar/**`, ADR 0071 or `content-updates.md`. Checked: #42 be63bdc2, #75 871faff9 and wip-5 7f77cb19, #82, #83 f4a97668 and WIP f5e0ceba, #84 e3299ea2, #85 29dded52, #86, Dependabot #87, #88 and #89, SS-01 f897a282, 1b 358dc53f, and interest e0646746. None of these files is on `LANES.md`'s "Not while #42 is open" list (`:84-91`).
- **Shared files, if this item touches them.** The PR merged second resolves the conflict and keeps both sides (LANES rule 6):
  - `tools/test/workflows.test.ts`: #42 (a 7-line images hunk; not on the explicit list, and #82 and #86 set the precedent);
  - reconciliation-001: #42, #75, SS-01, 1b, interest;
  - `docs/runbooks/ci.md`: #84, 1b, interest;
  - ADR 0066 and `workflows.test.ts`: P2 `ci-trivy-version`, P4 `ci-mutation-trigger`, P5 `ci-catalog` and ci-browser's after-#42 follow-up, none on origin yet;
  - ADR 0071: release-content-checks' after-#42 PR (ADR 0071 "The split"), not on origin;
  - if a test-matrix row is added, `test-matrix.md`, synth `matrix.ts` and `registry.ts` conflict with #42, #75, #83, #84, #85, SS-01, 1b and interest. Regenerate with `pnpm synth --all`.

### Waiting on someone
- **Nothing blocks the design or the merge.**
  - Transport and permission choices take the recommended option, and for security the safer one. That is the co-founder's ruling of 2026-10-26 ~00:20 UTC: "Don't ask for approvals anymore just build and optimize."
  - Record each choice with its reasons in the design, the PR description, ADR 0071, reconciliation-001 and your status file (rule 8; the orchestrator copies it to `lanes/lane-b.md`).
- **Wording of issues.** If the design changes what an issue says (the body-budget candidate), apply the recommended wording under the co-founder's standing ruling of 2026-10-25 ~21:34 UTC: "Apply wording and visible changes without asking me first." Report it in the PR description and the status file; he may reverse it. This does not block the merge.
- **Founder only:**
  - Runbook 3i and `APPROVAL_REVIEW_REQUIRED` do not block. Until then, a non-schema PR merges on green CI after the verification (rule 7).
  - Any repository or Actions setting change (owner-admin) is the founder's and would block the option that needs it; prefer a transport that needs none.
- **Usage (rule 9):** ask for the weekly usage % before each heavy run. At 2026-11-01 ~14:40 UTC it was under 20% ("go wide"). The design is not a heavy run.

### Follow-on
None. The old CI session queued P2 `ci-trivy-version` and P4 `ci-mutation-trigger` after this item (`lane-b-ci-deps-status.md:22`); the orchestrator places them.

### Resume
Resume from your status file: it is your handoff. Do not message the old sessions.

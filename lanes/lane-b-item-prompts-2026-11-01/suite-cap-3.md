## Your item
SUITE-CAP-3 makes a reconcile pass work at real size. On the base, three functions in `apps/worker/src/reconcile/` grow faster than the number of lines: `candidatesFor` (remittances.ts:179), `claimLines` (remittances.ts:249) and `syncLineStages` (stages.ts:72). On a 4-CPU container a pass took 57.7 s at 2,000 lines and 341.8 s at 6,000.

Until this is fixed, the weekly release-capacity run's full-size reconcile step is expected to fail its attempt check. That step is step 7b in `tools/release-capacity/run.ts`, which SUITE-CAP-1b adds; it is on 1b's branch and not yet on the base. The schema-chain session found the problem while building 1b (`approval-summaries/lane-a-schema-chain-status.md` lines 86–93).

The fix belongs in the worker. It is Lane B's work and stays inside the ledger freeze:
- The matching rules, every amount and the recovered total stay exactly as they are. The ledger oracle and LED-01 to LED-18 must pass byte for byte.
- Nothing under `packages/ledger/src` changes.
- `claim_by_superseded` is 1b's D15. Cite it; do not add it.
- Any other index, table or migration goes in your status file as "for Lane A", with its exact DDL and its measured gain. A change to the ledger tables also needs a founder freeze exception.

### Branch and head
- `co-001/suite-cap-3-reconcile` is **not on origin** (checked with `git ls-remote origin` at 2026-11-01 ~14:50 UTC).
  - There is no WIP ref: no `co-001/wip-suite-cap-3*`, and nothing under `salvage/*`.
  - Nothing from the old worktree or the old design survived.
- Cut the branch from `claude/build-platform` at **83d71fd62c6d419be61fd7aaa5b9033ef5c18b56**. Check it again at step 2.
- Between 56ed6279 (the old cut point) and 83d71fd6, nothing under `apps/worker/src/reconcile` or `packages/ledger` changed (`git diff --stat` is empty).
- Branches to read but not check out:
  - `co-001/suite-cap-1-triage-locks` at 358dc53f5340092daf57226a0769486218bd5418 (1b).
    - It does not contain 56ed6279. It does carry #42's and SS-01's commits.
    - In `reconcile/` it only adds two files: `reconcile.large.db.test.ts` and `stage-head.db.test.ts`.
    - Its migration is `20261109090000_line_status_heads.sql`.
  - `co-001/ledger-interest-once` at e064674676fbbedb9688fecbf833bfe4bcf820bf: the interest fix, 5 commits on 358dc53f. Its migration is `20261110090000`.

### PR
None yet: open a draft PR at the build stage. `gh api 'repos/PureTideWater/PhysicalTherapy/pulls?state=all&head=PureTideWater:co-001/suite-cap-3-reconcile'` returns 0.

### Design
- `designs/lane-b-suite-cap-3-reconcile.md` is **missing** from build-ops at 15725ba2. It was never committed. Workflow wf_860fa29e-3e1 and its scratchpad were lost with the old container.
- `workflow-scripts/lane-b-suite-cap-3-design-wf_860fa29e-3e1.js` (62 lines) is archived. Its phases:
  1. Scout: a code map, and a real-size profile in parallel.
  2. Design, with its options probed in a scratch clone.
  3. One review, with the payment-engine and tenancy lenses.
  4. Revise.
- House style, and 1b's D15: `designs/suite-cap-1-triage-locks.md` (D15 is at line 475).
- Prior art:
  - `approval-summaries/lane-b-suite-cap-1a-capacity-probe.md`. This is only the record; the probe scripts were in the lost scratchpad.
  - `approval-summaries/lane-b-suite-cap-1a-status.md` lines 11, 23, 26 and 34.
    - Without `claim_by_superseded`, `claimLines` took 650.4 s of 1a's 100,000-line report.
    - `chainContext`'s practice-wide reads are also what the reconcile calls.
  - 1b's `apps/worker/src/reconcile/reconcile.large.db.test.ts` (CAS-42.3).
    - `TP_LARGE_RECONCILE_LINES` defaults to 2,000, and `PASS_BUDGET_MS` is 150,000.
    - Its 835s are LED-06's synthetic segments; reuse its seeding.
  - `apps/worker/src/triage/test-support/memory.ts` on the base.
  - The interest fix's `apps/worker/src/reconcile/chain.large.db.test.ts` (LED-25 at size). It plans `claimLines`' statement, copied word for word as `CLAIM_LINES`, at 50,000 claims.

### Status file
`approval-summaries/lane-b-suite-cap-3-status.md` exists. Its last entry is 2026-10-28 05:58 UTC. Live state contradicts the following; correct them first:
1. **Session and orchestrator.** It names session_019i9ifDUYaz9Hta77Vukkzo, "run for the co-founder under Lane A's orchestrator (session_01TrKDxeLbxVo7t7zwRXFzrg)". It is now this new session, under Lane B's orchestrator session_01FcouKNNHsdecRMzfTs7XwW, from 2026-11-01. The old session is not visible on this account.
2. **Claim row.** It says "Claim: LANES.md row 190". The claim row is now line 195 of LANES.md at 15725ba2.
3. **Branch and worktree.** It says the branch was cut from `claude/build-platform` at 56ed6279, with worktree `/home/user/suite-cap-3-reconcile`. The branch is not on origin and the worktree does not exist. Re-cut at 83d71fd6.
4. **Design file.** It names `designs/lane-b-suite-cap-3-reconcile.md`. That file does not exist.
5. **Workflow.** It says "wf_860fa29e-3e1 is running" and "If stopped: resumeFromRunId wf_860fa29e-3e1 … progress/cap3-*.md". The run and its scratchpad (`/tmp/claude-0/…/b8fe4f4f-…/scratchpad`) are lost and cannot be resumed. Restart from the archived script.
6. **Check-in.** It says "Check-in 10:20 UTC (trig_01XCQ1wFB3pozWMx6cnPpRC2)". `get_trigger` returns not found, and `list_triggers` shows none enabled. Schedule your own.
7. **Freeze.** It says "LED-01 to LED-17 pass byte for byte". The base also has LED-18 (added in e46aa6b8 on 2026-10-26, already in 56ed6279), so the freeze holds LED-01 to LED-18.
8. **Probe scripts.** The prior art "`${SP}/repro/`, `${SP}/results/`" is gone. Only the probe record survives.

LANES.md's claim row (line 195) has the same stale facts: the old session, "LED-01 to LED-17", and "B (run by Lane A's orchestrator)". The orchestrator corrects LANES.md. Do not edit it.

### Reserved numbers
From the LANES.md claim row, word for word: "ADR 0087 if the design needs one; test-matrix CAS-49 to CAS-51; `packages/synth` cases the same if needed (module 5)".
- Module 5 is the existing CAS module (`MODULE_NUMBER` CAS: 5), not a new module.
- No migration timestamp and no fixture release are reserved. This item opens no migration.
- CAS-49 to CAS-51 and ADR 0087 are unused on the base and on every `co-001/*` head (checked). That covers the open PRs, the WIP refs and the schema-chain branches.
- If you need more numbers, write "COUNTER REQUEST: <what>" at the top of the status file.

### Setup arguments
`co-001/suite-cap-3-reconcile:/home/user/suite-cap-3-reconcile`

Use it only after the branch is on origin. On origin's copy, `tools/setup-container.sh` fails a branch argument that is not on origin (line 1059), so the first run takes no arguments (step 1).

### Exact next step
1. **Container.** Run setup in the background until it prints OK:
   ```
   git -C /home/user/PhysicalTherapy fetch -q origin claude/build-ops && git -C /home/user/PhysicalTherapy show FETCH_HEAD:tools/setup-container.sh > /tmp/setup-container.sh && bash /tmp/setup-container.sh
   ```
   - If it fails with "node: /opt/node24/bin/node reports 'v24.22.1', not v24.22.0", run `mv /opt/node24 /opt/node24.base-image` and run setup again.
   - storage.googleapis.com is allowed, so the Playwright line should work.
   - Record the output of `gh api user --jq .login` (expected: PureTideWater).
2. **Branch.**
   - First check that the branch is still absent and the base unchanged: `git -C /home/user/PhysicalTherapy ls-remote origin refs/heads/claude/build-platform refs/heads/co-001/suite-cap-3-reconcile`.
   - Then cut and push it:
     ```
     git -C /home/user/PhysicalTherapy fetch -q origin claude/build-platform && git -C /home/user/PhysicalTherapy branch --no-track co-001/suite-cap-3-reconcile origin/claude/build-platform && git -C /home/user/PhysicalTherapy push -u origin co-001/suite-cap-3-reconcile
     ```
   - The push goes through the pre-push hook. Never use --no-verify, and never force.
   - Then run setup again with the setup argument above.
3. **Records.**
   - Correct the status file (items 1–8 above), using the time from `date -u`.
   - Run `git -C /home/user/ops pull --no-rebase origin claude/build-ops`, commit, then push: `GITLEAKS=/root/.cache/paidwhole/gitleaks/8.24.3/gitleaks git -C /home/user/PhysicalTherapy push origin claude/build-ops`.
   - Do not edit LANES.md, lanes/lane-b.md or HANDOFF.md.
4. **Adapt and run the design script.** Copy `workflow-scripts/lane-b-suite-cap-3-design-wf_860fa29e-3e1.js` and make these changes:
   - **Paths and wording:**
     - Set `SP` to this session's scratchpad.
     - Change every 56ed6279 (in RULES and in the profile's checkout) to 83d71fd6.
     - Change "row 190" to "line 195", and "under Lane A's orchestrator" to Lane B's.
     - Set PATH to `/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH`.
     - Change "LED-01 to LED-17" to "LED-01 to LED-18", in RULES and in the design's hard requirements.
   - **Prior art:** drop `${SP}/repro/` and `${SP}/results/`. Rebuild the probe from the 1a probe record and from the seeding in 1b's `reconcile.large.db.test.ts`.
   - **Measurements:** measure the base code in three states, on the private cluster (port 5494, max_locks_per_transaction raised; the base's per-row locks hit 53200 otherwise):
     - (a) the base as is;
     - (b) with section 4 of 1b's migration only (`claim_by_superseded`);
     - (c) with sections 3–6 of `packages/db/migrations/20261109090000_line_status_heads.sql` (on 358dc53f) applied by hand. Section 5 replaces `line_status_rules()`, the trigger behind `syncLineStages`' `line_status` inserts. Section 6 changes the ledger triggers' lock.
   - **Profile shapes:** include step 7b's shape as well as postings only. Step 7b is an 835 that reprocesses every actionable line, plus a posting export, approved and posted in one reconcile pass (1b's `tools/release-capacity/scenario.ts`).
   - **Interest fix:** have the design read e0646746's versions of these files, so the fix does not fight the interest fix and keeps its gain once that lands:
     - `remittances.ts`;
     - `ledger.ts` (`ledgerMatches` now orders by `ledger_match.seq`);
     - `interest-chains.ts`;
     - `chain.large.db.test.ts` (its `CLAIM_LINES` copy);
     - `packages/ledger/src/{stages,interest}.ts`;
     - migration `20261110090000`, which adds a new BEFORE INSERT trigger `ledger_entry_within_interest` and changes `ledger_match_rules()`.
   - **Shared code:** `claimLines` and `chainContext` are also used by the audit report (`patient-share.ts`). If either changes, the report path and CAS-41 are in scope.
   - **"For Lane A" part:** the design writes it with exact DDL and the measured gain. Copy it into the status file; the orchestrator moves it to LANES.md "## Handed to Lane A" (line 201).

   Then:
   - Schedule a `send_later` about 5 h 10 min ahead, and cancel it when the run finishes.
   - Launch the workflow.
   - Archive the script as `workflow-scripts/lane-b-suite-cap-3-design-<runId>.js`.
   - Commit the design and the status file on build-ops.
5. **Remaining pipeline stages.** Done so far: the claim, the reservations and the archived script. No pipeline stage is done.
   - **Design:** step 4.
   - **Builders:** adapt `workflow-scripts/lane-b-suite-cap-1a-build-wf_34688805-4ff.js`; change `SP` and `WT`.
   - **Draft PR at once,** into `claude/build-platform` (never main):
     - Fill the description from `.github/pull_request_template.md`, with every section present and "None" rather than omitted. Model it on `approval-summaries/lane-b-suite-cap-1a-pr81-description.md`.
     - Keep it under 65,536 characters, end it with the Claude Code footer, and put no model identifier in it.
     - Write it with MCP `update_pull_request` and read it back.
     - Call `subscribe_pr_activity`.
   - **Two adversarial reviews:** adapt `workflow-scripts/lane-b-suite-cap-1a-review-wf_f5ab600c-f27.js`, with each review in a fresh clone.
     - The first is `payment-engine-reviewer`; the freeze requires it.
     - The second is `security-reviewer`, covering tenancy, PHI reads, decrypt counts and logs, with 1a's concurrency-and-capacity lens folded in.
     - If anything a person sees changes, `ux-brand-reviewer` with shots is also required (LANES.md rule 1). The design expects nothing visible to change.
   - **Fix round:** adapt `workflow-scripts/lane-b-suite-cap-1a-fix-wf_e5086638-950.js`. Run the full local suite once, every heavy command under `flock /tmp/laneb-heavy.lock`, then push once. The suite:
     - lint, typecheck and lint:logs;
     - unit and golden;
     - the ledger oracle, and LED-01 to LED-18 byte for byte;
     - the equality test of the pass's writes, old code against new;
     - CAS-49 to CAS-51, and CAS-41 if `claimLines` or `chainContext` change;
     - test:db in 4 shards, one after another, each on a fresh PG18 database (port 5433);
     - build, stamp, then e2e with `E2E_PREBUILT=1`;
     - the affected Stryker shards (`tools/stryker/affected.ts`), then the gate;
     - `pnpm verify-content` and the synth check;
     - if a worker import changes: `pnpm exec tsx tools/screening-capacity/watched.ts --write`, then commit what it writes;
     - `pnpm actions:check` and `toolchain:check` only after a workflow, manifest or lockfile change.

     `remittances.ts` and `stages.ts` are on the screening-capacity watched list, so CI's capacity gate measures this PR (about 12 to 19 minutes).
   - **Fresh-clone verification reading CI:** adapt `workflow-scripts/lane-b-suite-cap-1a-verify-wf_f8c221c4-b76.js`.
   - **Merge** (LANES.md rules 6 and 7):
     1. Merge the latest `claude/build-platform` in with a merge commit. Never rebase or force.
     2. Regenerate the lockfile, `watched-paths.txt` and `packages/db/functions`; never hand-merge them.
     3. Wait for CI to go green on that head: `all green`, `mutation`, `screening-capacity gate` and `approval-of-record`. The verification must have passed.
     4. Mark the PR ready and wait for approval-of-record's re-run.
     5. Call `merge_pull_request` with method merge and `expectedHeadSha`.
     6. Unsubscribe, read the push runs, remove the worktree, archive the scripts and the description on build-ops, and update the status file.

### Merge order and dependencies
- **Nothing must merge first.** The item has no migration and does not wait on #42 or the schema chain.
- **Shared documents:** `docs/product/test-matrix.md`, `packages/synth/src/cases/matrix.ts` and `registry.ts`.
  - #42, #75, #82, #83, #84 and #85 change them, and so do SS-01, 1b and the interest fix. #86 does not.
  - The PR merged second resolves them by hand, keeping both sides' rows (LANES.md rule 6; `matrix.ts` repeats the matrix word for word).
  - Then it runs `pnpm synth --all`, which regenerates `fixtures/synthetic`, and commits the result.
- **Generated file:** `tools/screening-capacity/watched-paths.txt`, if this PR changes it. #42, #75, #83, #84, SS-01, 1b and the interest fix also change it. Regenerate it with `watched.ts --write`; never hand-merge.
- **Only if the build touches them:**
  - `stryker/shards.json` (#84 and the interest fix also change it);
  - `docs/runbooks/ci.md` (#82, #84, #86, 1b and the interest fix);
  - `vitest.config.ts` SLOW_FIRST and `tools/test/db-shards.test.ts` (1b's deferred CAS-42.1 and .2 work adds `reconcile.large` there).
- **The interest fix (e0646746)** merges only after #42, SS-01 and 1b, one schema PR at a time. Its code overlaps this item:
  - `remittances.ts`: +148/−83. It changes the imports, `RemittanceOutcome`, `ChainContext`, `Counts`, `recoupReversals`, `providerAdjustments`, `hashesOf` and `reconcileRemittances`, but not `candidatesFor` or `claimLines`.
  - `ledger.ts`, `public.ts` and `statement-html.ts`.
  - The chain, ledger, payment-terms and ledger-oracle db tests.
  - New files: `interest-chains.ts`, `interest.db.test.ts` and `chain.large.db.test.ts`.
  - Whichever merges second resolves, keeping both sides.
  - If `claimLines`' SQL changes, whichever merges second also updates `CLAIM_LINES` in `chain.large.db.test.ts`.
  - If the interest fix lands first, re-run this item's equality proof with LED-23 to LED-25 and the `seq` order.
- **1b** only adds new files in `reconcile/`, so there is no textual conflict there. Whichever lands second re-checks CAS-42.3's 2,000-line default, its `PASS_BUDGET_MS` (150 s, set from 57.7 s at 2,000 lines) and step 7b's expectation.
- **#42's freeze list** (LANES.md "Not while #42 is open", lines 84–91): `reconcile/` and `packages/ledger` are outside it. Leave its files alone, including the worker's `runtime.ts`, `config.ts`, `jobs/platform.ts` and `tools/screening-capacity/{run,report}.ts`.

### Waiting on someone
- **Founder: a ledger freeze exception,** only if the design wants a change to the ledger tables. That part goes "for Lane A"; it does not block this PR's merge.
- **Founder: an 8-CPU runner.** On a 4-CPU runner, 1b's real-size runs stop with RUNNER_TOO_SMALL. The runner is needed to prove step 7b at full size after 1b merges. It does not block this PR's merge.
- **Founder: runbook 3i and `APPROVAL_REVIEW_REQUIRED`.** Until then, merge on green CI once the verification has passed. This does not block.
- Nothing else.

### Follow-on
None.

### Resume
Resume from your status file: it is your handoff. Do not message the old sessions.

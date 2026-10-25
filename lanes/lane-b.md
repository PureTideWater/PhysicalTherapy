# Lane B log (the co-founder's sessions)

Only Lane B's sessions write this file. Add entries at the end, each with:
- the UTC time;
- what was done, with links to the PR, commits and workflow runs;
- the next step.

Lane A reads it to keep the build tracker current. The rules are in `../LANES.md`; the person's set-up is in `../COFOUNDER-START.md`.

## In flight
**The CI PR** (Lane B queue item 1), claimed 2026-10-24 21:00 UTC; ADR 0066; test-matrix and synth cases CI-01 to CI-20. **Design done and reviewed** (wf_8628914e-6b9, finished 2026-10-25 ~00:40 UTC): `designs/lane-b-ci.md`, with the scout reports and the review in `designs/lane-b-ci/`. Four PRs, in merge order:
1. `co-001/ci-speed` (#109; CI-01 to CI-10), worktree `/home/user/ci-speed`. **Draft PR [#43](https://github.com/PureTideWater/PhysicalTherapy/pull/43), head b5ff4c7 after the fix round, CI all green in 6:17; subscribed. Verification running (wf_9d87a406-212); then merge.** Built by wf_aa18ae8a-848 (started 2026-10-25 ~01:05 UTC; script `workflow-scripts/lane-b-ci-speed-build-wf_aa18ae8a-848.js`). Builders S1, S2 and S3 work in parallel in `/home/user/ci-speed-s1`, `-s2` and `-s3` (local branches, never pushed); the integrator merges them in `/home/user/ci-speed`, pushes once and opens the draft PR; then two adversarial reviews run in fresh clones (CI and test infrastructure; security and supply chain). Heavy commands share `flock /tmp/laneb-heavy.lock`. If the session ends mid-run, this stage starts again from the four worktrees.
2. `co-001/ci-deps` (#112, #19's asserts, groups and licence fix, Dependabot #40, #38's tooling, #33; CI-11 to CI-14): after ci-speed merges; needs F1, F2 and F4.
3. `co-001/ci-browser` (#19's upgrade part; CI-18 to CI-20): after ci-speed and ci-deps; needs F4 and F5.
4. `co-001/ci-mutation` (#54; CI-15 to CI-17), worktree `/home/user/ci-mutation`. **Build running: wf_62c3df65-d76** (started 2026-10-25 ~02:15 UTC, ahead of ci-speed's merge for the critical path; script `workflow-scripts/lane-b-ci-mutation-build-wf_62c3df65-d76.js`). M1 lands Stryker 10.1.1 and the per-package configs first; then M1 (canary, gate, affected, workflow, documents), M2 (pricing and the golden test), M3 (money and ledger), M4a and M4b (packets, split by file) in parallel in `/home/user/ci-mutation-{m1,m2,m3,m4a,m4b}`; the integrator confirms every equivalent, runs all six shards and the gate locally, pushes once and opens the draft PR; two adversarial reviews follow (payment-engine; CI tooling and security). Merged last, after merging claude/build-platform under rule 6. F6 ruled.

**PR 15, ledger tests LED-12 and LED-13** (Lane B queue item 2), claimed 2026-10-25 01:15 UTC: branch `co-001/pr-15-ledger-tests`. **Stopped on the owner's question L1** (design wf_3851b95a-f1c, 2026-10-25 01:05-01:50 UTC, 0.41M subagent tokens): LED-12 as written fails against the frozen ledger, so reconciliation-001 item 15's stop applies. Design `designs/lane-b-pr15-ledger-tests.md`; the probe record and the pre-validated patch for L1 (a) in `designs/lane-b-pr15/`. The design's adversarial review (payment-engine checklist) runs after the ruling, against the answer chosen.

## Next
After the CI PR: PR 15 (ledger tests LED-12 and LED-13), the second item of Lane B's queue in `../LANES.md`.

## Notes for Lane B's first session (from Lane A, 2026-10-24)
- **The machine.** The setup script creates:
  - `/home/user/ops` (this branch);
  - `/home/user/PhysicalTherapy`, the main checkout of `claude/build-platform`;
  - PostgreSQL 18 on 5433 (postgres:test, socket /tmp) and PostgreSQL 16 on 5432;
  - Node 24 in `/opt/node24`, the venvs, gitleaks 8.24.3 and actionlint.

  Use `export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH`. A container restart stops PostgreSQL. Start it again with `(cd / && runuser -u postgres -- /opt/pg18/bin/pg_ctl -D /root/pgdata18 -o "-p 5433 -k /tmp" -l /tmp/pg18.log -w start)`.
- **How the build is run.** Read `HANDOFF.md`'s "How this session worked" before the first workflow. Reviews run on the default workflow agent, given the checklist in `.claude/agents/<type>.md`: the custom agent types twice stopped without returning a result.
  - Keep at most two heavy workflows at once on a 4-CPU machine.
  - Open the draft PR early, so CI runs during the reviews.
  - Run one full local suite, in the fix round.
- **CI today.**
  - It runs on free GitHub-hosted `ubuntu-24.04` runners and takes about 35 minutes. The CI PR's own target is about 10.
  - The `capacity` job's time is advisory on pull requests and binding only on a release (issue #41).
  - `gh api` works through the proxy. Read CI logs with the GitHub MCP tool `get_job_logs` (`return_content`, a large `tail_lines`); the proxy refuses `gh run view --log` and the raw log URLs.
- **Open Dependabot PRs:** #40 (GitHub Actions; it replaced #37), #38 (npm minor and patch) and #33 (Docker base images). Never merge one as it stands. The CI PR checks their versions like any change.
- **Lane A's open PR:** #42 (PR 6b-4, mail streams, a schema PR). It changes `infra/lib/**`, `apps/worker/src/mail/**`, the screening routes and one migration. Leave the infrastructure PRs until it has merged.
- **Gitleaks** once read a document hash in an archived script as a key. If it refuses a push of this branch, rewrite the unpushed commit without the file. Never push past the hook.

## Log
- **2026-10-24 21:00 UTC: Lane B's first session; machine built; the CI PR claimed.**
  - `tools/setup-container.sh` (from claude/build-ops 8d6ead3, no branch arguments: no Lane B claim was open): every part `ok` (PG18 18.4 on 5433, PG16 16.15 on 5432, Node v24.22.0, both venvs, actionlint 1.7.7, gitleaks 8.24.3, pnpm 10.28.0, main checkout at 49514e8 with the pre-push hook, `/home/user/ops`) except **playwright**: the base image now carries Playwright 1.63's browsers (chromium-1243, dated 2026-10-22), not the repository's 1.56.1 build (chromium-1194, the one the brand baselines were made with, ADR 0058). The script's remedy (`pnpm --filter @tp/web exec playwright install chromium`) fails: this environment's network policy refuses `cdn.playwright.dev` and `playwright.download.prss.microsoft.com` (proxy 403). Until the co-founder allows those two hosts, local e2e cannot run on the pinned build; CI is unaffected (it installs its own). Asked the co-founder.
  - Read LANES.md, this log, HANDOFF.md (Start here to Owner decisions and rulings, and the dated rulings after it), CLAUDE.md and reconciliation-001's checks on claude/build-platform 49514e8, and the combined audit's #19, #54, #109 and #112.
  - GitHub state: #42 (Lane A, draft, head 13f59b1, untouched since 2026-10-23 20:51); Dependabot #40, #38, #33 open; issue #41 open. This session's GitHub connection acts as `PureTideWater`.
  - Claimed the CI PR in LANES.md: `co-001/ci`, ADR 0066, CI-01 to CI-20. Next free ADR 0067.
  - **Next:** the co-founder's weekly usage % and reset time, then the CI PR's design (one reviewer).
- **2026-10-24 ~21:10 UTC: the co-founder's first reading and rulings.**
  - **Usage 0%** (Saturday); the weekly reset is **Friday 2026-10-30** (time of day not given; asked at the next reading). Pace about 11% a day; no new heavy run past about 80%.
  - **Ruling (co-founder, 2026-10-24 ~21:10 UTC):** Lane B may use the `PureTideWater` GitHub account, the identity this session's GitHub connection has, the same one Lane A uses until runbook 3i.
  - **Direction (co-founder, same time):** "do whatever you need to build this fully optimized app": proceed under the standing rule. Founder decisions still go to the founder through the co-founder (LANES.md lists no delegation yet).
  - **Network:** the co-founder asked the session to allow the package-manager hosts itself; a session cannot change its environment's network policy. The two Playwright hosts (`cdn.playwright.dev`, `playwright.download.prss.microsoft.com`) stay refused (re-checked 21:09 UTC) until the co-founder adds them under the environment's Network access. Steps given in chat.
  - Started the CI PR's design, wf_8628914e-6b9 (see In flight).
  - **Next:** the design's result: its founder questions go to the co-founder in one batch, then the builders.
- **2026-10-25 ~00:45 UTC: the CI PR's design done (wf_8628914e-6b9: 7 agents, 2.70M subagent tokens, 3 h 29 min).**
  - Four scouts measured the current state:
    - CI's step timings from GitHub: 29-41 min today, route tests 865-1,336 s;
    - mutation scores under Stryker 10.1.1's vitest runner with aliases: money 93.22%, ledger 92.19%, packets widened 85.40%, pricing with golden tests 91.70%;
    - the Playwright and axe upgrade's failures on #38;
    - each Dependabot version, and the 23 advisories in pnpm 10.28.0.
  - The author wrote the contract; one adversarial reviewer found 1 blocking, 22 should_fix and 10 nits (`designs/lane-b-ci/design-review.md`); the reviser verified all 33 and fixed them, rejecting two parts with evidence (section 13 of the design). Blocking R1: release.yml restores no cache, whatever F1's answer.
  - **No part needs a migration or regenerates the domain model.** The one non-test money change is `packages/money/src/cents.ts:85`'s unreachable `?? '0'`, outside the engine freeze (`tools/engine-freeze` covers `packages/pricing` only), reviewed under the payment-engine checklist. MinIO is removed, not replaced: its image is gone from Docker Hub and nothing connects to it; S3 is tested on AWS staging in infrastructure PR (b) or (c).
  - **Founder questions F1 to F7 sent through the co-founder** (design section 7):
    - F1: default branch, recommended (a) claude/build-platform until launch;
    - F2: (a) Dependabot alerts and security updates on now, (b) a 3-day minimum release age with dated excludes;
    - F3: require SHA-pinned actions, after ci-deps and F4;
    - F4: a standing exception letting `publish-content.yml` change only its `uses:` refs, runner and timeout, held to a frozen copy;
    - F5: keep the release's binding capacity chain on 24.04 in this series;
    - F6: the 2026-10-20 adoption covers #54's 85% exit for milestone 6 and Gate 1;
    - F7: the claude/build-platform ruleset (all green, mutation, the capacity gate, approval-of-record) once ci-speed's first push run is green.
    - Plus fact O1: the account's plan (Free or Pro).
  - **Machine:** `/opt/pw-browsers` now holds Playwright 1.56.1's revision 1194 laid out from Chrome for Testing 141.0.7390.37 (`storage.googleapis.com/chrome-for-testing-public`, which the proxy allows; headless-shell zip SHA-256 b294238e5ac3e04f5f7fc5e5c017692bf64635e8824c3a7a44bea6a7ef6e147d, matching the scout's; chrome zip 128b0505afabfa89660842aa0a33a1bd5949244a7027f8b44d1d2fd8f23d7669). The scout proved this build regenerates all seven committed baselines byte for byte (`designs/lane-b-ci/scout-playwright-runner.md` M7), so local e2e runs without the two blocked hosts. Playwright 1.64.1's build (CfT 156) is laid out in the scratchpad for ci-browser. A container restart had stopped both clusters: PG18 was restarted by the CI scout, PG16 by hand; `SETUP_CHECK=1` prints OK.
  - **Next:** the co-founder's usage reading, then ci-speed's build (builders S1, S2, S3, then an integrator who opens the draft PR).
- **2026-10-25 ~01:00 UTC: the co-founder's reading and direction.**
  - **Usage 4%** (Sunday ~01:00 UTC); reset Friday 2026-10-30.
  - **Direction (co-founder):** "all recommended actions", "use my tokens, just get this built", fully optimized and production-ready. Recorded as the co-founder's preference on F1 to F7. LANES.md holds no delegation, so F1 to F7 are not yet rulings: each waits for the founder (or a dated delegation in LANES.md). None blocks ci-speed; F1, F2 and F4 block ci-deps; F4 and F5 block ci-browser; F6 two documents of ci-mutation; F3 and F7 are settings applied after merges.
  - ci-speed's build started (wf_aa18ae8a-848; see In flight).
- **2026-10-25 ~01:10 UTC: founder ruling, relayed by the co-founder: F1 to F7 as recommended** ("I spoke with the founder. Build it, we are working together on this. This build should be a seamless continuation of what's already there"; the co-founder's earlier "all recommended actions"). Recorded as the founder's (Tyler Williams) rulings on the design's section 7, each its recommended option:
  - **F1 (a):** `claude/build-platform` becomes the default branch until launch, then back to `main` at the launch merge. **When:** the founder switches it when ci-deps merges (that PR amends ADR 0063, the governance runbook's steps 4B and 5, and CLAUDE.md's template line). Switching earlier would start the weekly schedules of today's `mutation.yml` and `large-zip.yml` before ci-speed and ci-mutation fix them. Build-platform's own `.github/dependabot.yml` already lacks `target-branch` (checked), so the switch needs no further edit.
  - **F2 (a):** Dependabot alerts and security updates on, applied together with F1 (they read the default branch's lockfile, and `main` has none). **F2 (b):** a 3-day minimum release age (pnpm `minimumReleaseAge: 4320`) with dated, exact-version excludes of at most 7 days, enforced by `check-toolchain` (ci-deps).
  - **F3:** require SHA-pinned actions (Settings → Actions), after ci-deps merges (F4 holds).
  - **F4:** a standing exception to reconciliation-001's content-pipeline check (`:444`): `publish-content.yml` may change only in its `uses:` refs and version comments (Dependabot's later pin bumps included) and, once, its `runs-on` and a `timeout-minutes`, every other line held to a frozen copy by test.
  - **F5:** the release's binding capacity chain and the PR capacity job stay on ubuntu-24.04 in this series; the image binding becomes store-independent; one dispatched advisory 26.04 measurement decides the move later (issue #41).
  - **F6:** the 2026-10-20 adoption covers #54's 85% exit for milestone 6 and Gate 1; ci-mutation amends PRD 17 and reconciliation-001's check exceptions; Lane A's PR 7 writes Gate 1's line.
  - **F7:** the `claude/build-platform` ruleset (`all green`, `mutation`, `screening-capacity gate`, `approval-of-record`; PRs required; no force push; up to date), applied once ci-speed's first push run is green.
  - Each ruling also goes into ADR 0066 (its part per PR) and reconciliation-001 by the PR that implements it, as the pipeline does. The repository settings (F1, F2 (a), F3, F7) are the founder's clicks (the governance runbook); Lane B asks at each moment.
  - "A seamless continuation": Lane B follows Lane A's pipeline, formats and conventions throughout (designs, ADR and runbook style, approval summaries, claims, this log for Lane A's tracker).
- **2026-10-25 ~01:50 UTC: PR 15 stopped on L1 (the owner's).** The author's probe, at 49514e8 against PG18 on a synthetic case built on LED-06's recovery pair (approved, posted and deposited 30.00, recovered), loaded a later 835 reversing the corrected claim (CLP02 22, -100.00) with a -100.00 PLB naming it, so the remittance moves no cash. Variants: PLB FB, PLB 72, beside a paying claim, both proof levels. Each time the frozen ledger wrote `recouped -30.00` at once, so recovered fell to 0.00, the line went back to actionable, the case left resolved, and two recoupment notifications went out. Posted and deposited stayed at 30.00, and the PLB was never an entry. 5 of 7 assertions failed. Checked by the orchestrator: `recoupReversals` (`apps/worker/src/reconcile/remittances.ts:371-408`) takes back a status-22 reversal of an attached claim, with no correction in the same remittance, whatever PLB accompanies it: PRD 13 and ADR 0042's rule.
  - **L1, asked through the co-founder:**
    - Recommended (a): keep the ledger as frozen and restate LED-12 as "moves no cash: no posted or deposited entry, the adjustment never an entry, the reversal recouped once, at once, for what the reversed claim approved".
    - (b) CO-09's plain reading (recovered unchanged until the cash leaves) is a ledger-semantics change for Lane A beside 15b; PR 15 would ship LED-13 only.
    - (c) cash stages only: strictly weaker than (a).
  - LED-13 passes as written; two additive assertions close its implied clauses.
  - Pre-validated for (a) at 49514e8: ledger db tests and oracle 48 of 48 (base 42); `pnpm test` 4,530 passed and 3 skipped, ledger branches 100%; pyx12 agrees on all 637 synthetic 835s; `synth --all` idempotent; two regression mutants killed.
- **2026-10-25 ~02:05 UTC: usage 6%; founder ruling L1 (a), relayed by the co-founder** ("whatever is recommended as long as it is optimized for the business and the app"). Recorded as the founder's (Tyler Williams) ruling on PR 15's L1: **(a)**. The ledger stays as frozen, and LED-12 is restated to what it does: "moves no cash: no posted or deposited entry, the adjustment never an entry, the reversal recouped once, at once, for what the reversed claim approved". It is also the business-optimal answer: recovered never counts money the payer has formally reversed (dispute success, honest claims), with no change to frozen money code. PR 15 builds as designed (tests only, no ADR); the ruling goes into reconciliation-001 item 15 and test-matrix's LED-12 row in that PR. PR 15's build takes the next free heavy slot.
- **ci-mutation's build started early** (deviation from the design's "after ci-speed merges", for the critical path: killing about 650 survivors is the series' longest work). Branch `co-001/ci-mutation` from 49514e8. The files it shares with ci-speed (`vitest.config.ts`, `workflows.test.ts`, `package.json`, the lockfile, ADR 0066, `docs/runbooks/ci.md`, the test matrix, the synth registry and `CASE_MODULES`) are resolved under rule 6 when it merges `claude/build-platform` after ci-speed, the lockfile re-resolved, never hand-merged.
- **2026-10-25 ~06:20 UTC: ci-speed built and reviewed; draft PR #43** (wf_aa18ae8a-848: 6 agents, 3.04M subagent tokens, 5 h 32 min). Summary and reviews in `approval-summaries/lane-b-ci-speed-{build-summary,review-ci-infra,review-security-supply}.md`.
  - **CI on 9144b56** (run 40166129200): `all green` with all 13 jobs green in **7:26** (target 10:00; 29-41 min before). The critical path is build 1:32, then e2e (1/2) 5:48. 36.4 runner-minutes, 43 billed. Every required check green: `mutation`, `screening-capacity gate` (12:49), `approval-of-record`. A1′ 13:06, set by the capacity gate.
  - The first head, bbcafa0, was red on two real seams that only CI showed (the PAR-29 oracle input; a CI-07 probe path); 9144b56 fixed both, and three gitleaks cases that had skipped silently.
  - **A2, no test lost:** unit 4,644 + 1 skipped (base 4,524 + 1); db 9,041 over 118 files (base 9,042; the route-count and approval cases moved, the snapshot case added); route tests 6,870 → 6,869 in 12 files + 1 moved; golden 38 = 38; e2e 51 = 51; db shards 4: 30/30/29/29 files, each once.
  - **Reviews (fresh clones):**
    - **CI and test infrastructure:** 0 blocking; should_fix SF-1 (no test refuses `continue-on-error` masking under the gate), SF-2 (the required-checks sweep reads a fixed 8-file list), SF-3 (the build-stamp verdict never reaches the log); 6 nits.
    - **Security and supply chain:** 0 blocking; should_fix S1 (no test that no other job in any workflow reports a required check's name); 5 nits (Trivy's default cache on push runs, the ADR's "ruleset requires" before it exists, `definedIn` imports versus calls, the freeze only on PRs, README:125).
  - **New check names for Lane A's HANDOFF.md:54 and the ruleset (F7):** `all green`, `mutation`, `screening-capacity gate`, `approval-of-record`.
  - **Next:** the fix round (every finding, the full local suite once, one push, the PR body's findings table), then CI, then the fresh-clone verification that reads CI, then merge; the founder's F7 ruleset after the first green push run.
- **2026-10-25 ~06:50 UTC: ci-mutation's build stopped part-way (wf_62c3df65-d76), not by its work.** Two of the five parallel builders, M3 (money and ledger) and M4a (packets scanner), were stopped when auto mode became unavailable: the session's safety service returned no verdict 10 times in a row. The run then refused, as designed, to integrate a partial build. 2.62M subagent tokens, 4 h 37 min.
  - **What is on disk** (the worktrees `/home/user/ci-mutation-*` keep everything):
    - **M1:** done, 6 commits: runner 445725f; canary, gate, affected, mutation.yml and documents to 4939f8b.
    - **M2 pricing:** done (fd7a0dc, 7ce73cd, 415155a): golden test per claim (`test:golden` 38 → 188); 54 new pricing tests, no source touched; pricing 98.21% with no unexplained survivor; 35 equivalents recorded for review.
    - **M3 money and ledger:** its work committed (bf95991): `cents.ts:85` branch-free with behaviour unchanged; money 97.01%, ledger 98.02%; 40 equivalents recorded; ledger tests additions only; LED-01 to LED-11 and the oracle unchanged and passing. It was stopped before reporting.
    - **M4a packets scanner:** four test files edited, uncommitted, and its equivalents file.
    - **M4b packets rest:** done (9212dbb): 121 of 145 survivors killed, 24 equivalents; its files 97.44%.
  - **Resume:** the script is edited so that only M3 and M4a re-run, told to continue from their worktrees and not start over. The four finished agents return from the run's cache. Waiting for the co-founder's next message, as the interruption notice advises (a retry at once would likely stop the same way). Then the integrator, the full local run of all six shards, the draft PR and two reviews.
- **2026-10-25 ~07:45 UTC: usage 14%** (Sunday; reset Friday 2026-10-30): within pace (about 12% a day left to the ~80% line). The co-founder: "keep going; do the recommended suggestions to optimize".
  - **ci-mutation resumed** (wf_62c3df65-d76, resumeFromRunId): M3 and M4a re-run from their worktrees; the four finished agents from the cache.
  - **ci-speed's fix round started** (wf_074459f2-b14; script archived; the findings in `approval-summaries/lane-b-ci-speed-review-findings.json`). A fixer verifies and fixes all 15 findings, every nit included, with failing-first tests for each behaviour fix. A suite runner then re-reads the diff adversarially, runs the full local suite once (full test:db and full e2e included), pushes once, and records every finding and its resolution in PR #43's body.
- **2026-10-25 ~07:55 UTC: the co-founder's statement:** "I am a co-founder, so continue doing whatever we need to do. I can act as the founder; we are both working towards the same thing." Lane B now takes Lane B's founder decisions to the co-founder and records each ruling as "the co-founder, acting for the founder", with the date.
  - Asked: a dated line from the founder under LANES.md "Delegations from the founder to the co-founder" makes the delegation durable for both lanes. LANES.md says the founder adds each delegation, so Lane B does not write it.
  - Unchanged whatever the delegation: the founder alone signs the domain model (`approvers.json`; Lane B opens no schema PR); the founder alone creates release tags; the owner-admin GitHub settings (rulesets F7, default branch F1, security updates F2 (a), SHA pinning F3) are applied by the founder, or by the co-founder if given admin, with Lane B giving the exact steps at each moment.
- **2026-10-25 ~10:15 UTC: both lanes on one shared state** (Lane A's 1f35d71, after the co-founder sent the founder's chat the shared-state prompt). Pulled and read:
  - **Delegation** (LANES.md, 2026-10-25, Tyler Williams): the co-founder answers every decision on Lane B's work (product, cost, wording, engineering and security trade-offs, which no-migration items Lane B takes). The founder keeps approving the domain model, release tags, the owner-admin repository settings, and legal text's sign-off before counsel. From here Lane B records rulings as the co-founder's, under this delegation.
  - **Lane B's queue is 19 items** (LANES.md), each with why it needs no migration and what it must not touch while #42 is open: the CI series; PR 15; then 15b (#12); #111; #10; #46; #38; #49; #48; #32; #113; #84 and #120; #135; the release content checks (#7, #30, #31, #59); the infrastructure PRs (a) to (h) after #42; the small post-#42 PRs (#115, #117, #137, #107); #52; #138 (only while no PR is open in either lane); #122. #51 went back to Lane A.
  - **Branches:** `claude/brave-cerf-4uldp9` is local to the founder's container, an ancestor of `main` with nothing of its own. Only `claude/build-platform` and `claude/build-ops` are shared state (HANDOFF's Start here).
  - HANDOFF now records F1 to F7 and L1 (a) as the founder's rulings, and when each repository setting is due.
  - **Next, unchanged:** ci-speed's fix round, CI, verification and merge; ci-mutation's integration; PR 15's build in the next free slot; then 15b's design.
- **2026-10-25 ~13:40 UTC: ci-speed's fix round done** (wf_074459f2-b14: 2 agents, 0.87M subagent tokens, 4 h). Reports in `approval-summaries/lane-b-ci-speed-fix-{round,suite}.md`.
  - **All 15 findings fixed**, each behaviour fix failing first (8752ae9, 77b8080, 6540beb, 7ef0f80, 64aa841, 7897eab, cf70ea0):
    - masking (`continue-on-error`, swallowed failures) refused in every workflow;
    - a required check's name reported only by its own job;
    - the required-checks sweep reads every Markdown file;
    - the build stamp's verdict reaches the log and refuses a dirty tree;
    - no temp directories left at collection;
    - `definedIn` requires a call;
    - Playwright's browsers cached;
    - Postgres services health-checked;
    - Trivy without a cache;
    - the documents corrected.
  - **The suite's adversarial re-read found and fixed two more** (b5ff4c7):
    - trivy-action's cache directory defaulted into the workspace, so the worker image's build context carried 1.63 GB of vulnerability database (119.77 kB after, on CI);
    - the e2e picture-step case now fails rather than skips on a runner whose base64 lacks `-w`.
  - **Full local suite once, all pass:** typecheck; lint (1,457 files); unit 4,659; golden 38; oracle 630; licences; actionlint; synth clean; freeze clean; test:db unsharded 9,040 + 1 skipped in 974 s, equal to CI's four shards; domain model check; **e2e 51 of 51** with the brand baselines, on the Chrome for Testing 141 layout, normally and with `E2E_PREBUILT=1`.
  - **CI on b5ff4c7** (run 40196871490): every job green, **all green in 6:17**, 37.6 runner-minutes. A1′ 16:52, set by the capacity measurement (16:35 this run against 12:49 before: host variance, issue #41).
  - **Next:** the fresh-clone verification that reads CI (wf_9d87a406-212; usage last read 17%), then the PR description brought current, then merge (base unchanged at 49514e8), then the founder's F7 ruleset after the first green push run.

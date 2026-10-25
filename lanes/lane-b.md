# Lane B log (the co-founder's sessions)

Only Lane B's sessions write this file. Add entries at the end, each with:
- the UTC time;
- what was done, with links to the PR, commits and workflow runs;
- the next step.

Lane A reads it to keep the build tracker current. The rules are in `../LANES.md`; the person's set-up is in `../COFOUNDER-START.md`.

## In flight
**The CI PR** (Lane B queue item 1), claimed 2026-10-24 21:00 UTC; ADR 0066; test-matrix and synth cases CI-01 to CI-20. **Design done and reviewed** (wf_8628914e-6b9, finished 2026-10-25 ~00:40 UTC): `designs/lane-b-ci.md`, with the scout reports and the review in `designs/lane-b-ci/`. Four PRs, in merge order:
1. `co-001/ci-speed` (#109; CI-01 to CI-10), worktree `/home/user/ci-speed`. **Build running: wf_aa18ae8a-848** (started 2026-10-25 ~01:05 UTC; script `workflow-scripts/lane-b-ci-speed-build-wf_aa18ae8a-848.js`). Builders S1, S2 and S3 work in parallel in `/home/user/ci-speed-s1`, `-s2` and `-s3` (local branches, never pushed); the integrator merges them in `/home/user/ci-speed`, pushes once and opens the draft PR; then two adversarial reviews run in fresh clones (CI and test infrastructure; security and supply chain). Heavy commands share `flock /tmp/laneb-heavy.lock`. If the session ends mid-run, this stage starts again from the four worktrees.
2. `co-001/ci-deps` (#112, #19's asserts, groups and licence fix, Dependabot #40, #38's tooling, #33; CI-11 to CI-14): after ci-speed merges; needs F1, F2 and F4.
3. `co-001/ci-browser` (#19's upgrade part; CI-18 to CI-20): after ci-speed and ci-deps; needs F4 and F5.
4. `co-001/ci-mutation` (#54; CI-15 to CI-17): built beside ci-deps once ci-speed merges, merged last; F6 for two documents.

**PR 15, ledger tests LED-12 and LED-13** (Lane B queue item 2), claimed 2026-10-25 01:15 UTC: branch `co-001/pr-15-ledger-tests`. **Design running: wf_3851b95a-f1c** (the second heavy slot, beside ci-speed's build; script `workflow-scripts/lane-b-pr15-design-wf_3851b95a-f1c.js`): the author probes LED-12 as written against the frozen ledger (if it fails, work stops and the owner is asked, reconciliation-001 item 15), writes `designs/lane-b-pr15-ledger-tests.md`; one adversarial reviewer (the payment-engine checklist); one revision.

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

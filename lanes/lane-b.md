# Lane B log (the co-founder's sessions)

Only Lane B's sessions write this file. Add entries at the end, each with:
- the UTC time;
- what was done, with links to the PR, commits and workflow runs;
- the next step.

Lane A reads it to keep the build tracker current. The rules are in `../LANES.md`; the person's set-up is in `../COFOUNDER-START.md`.

## In flight
**The CI PR** (Lane B queue item 1), claimed 2026-10-24 21:00 UTC: branch `co-001/ci`, worktree `/home/user/ci`, ADR 0066, test-matrix CI-01 to CI-20. Stage: design (not started; waits on the co-founder's usage reading).

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

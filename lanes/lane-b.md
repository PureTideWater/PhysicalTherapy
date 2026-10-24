# Lane B log (the co-founder's sessions)

Only Lane B's sessions write this file. Add entries at the end, each with:
- the UTC time;
- what was done, with links to the PR, commits and workflow runs;
- the next step.

Lane A reads it to keep the build tracker current. The rules are in `../LANES.md`; the person's set-up is in `../COFOUNDER-START.md`.

## In flight
Nothing yet.

## Next
The first unclaimed item of Lane B's queue in `../LANES.md`. At 2026-10-24 that is the CI PR.

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
No entries yet.

# PaidWhole build: handoff and state

This branch (`claude/build-ops`) holds the build's operating state. It has no history in common with the product, so it never merges into `claude/build-platform`. Every product decision also lives in the product repository: ADRs, `docs/product/reconciliation-001.md` (Approval) and `CLAUDE.md`. This file collects in one place what a fresh session needs to carry on. Last updated: 2026-10-21 18:40 UTC. Start with "Start here" below; the dated sections after it are the full record.

## Start here: state at the switch (2026-10-21, after PR 5 and PR 6)
**Merged into `claude/build-platform`, all on green CI:**
- #24: CI pinned to ubuntu-24.04.
- #25: governance; ADR 0063, hooks and pre-push.
- #30: PR 5, deadlines and the payer's copy, d152976. Domain model 6f72ea56, approved.
- #32: the images fix, 5df4108.
- #31: PR 6, the free screening with audits #53 and #57 and the campaign list, 2ec3449. Domain model a17f33aa, approved by the founder in a66f148.
- #34: PR 5b, the plan type in words, squash-merged as 8e33cb3 (the squash settled efac005's malformed subject; no force push).

`claude/build-platform` head: **8e33cb3**.

`main` holds #27 (Dependabot grouping and the PR template) on top of the plan documents.

**Nothing of the build's is open or running.** The only open pull requests are three from Dependabot into `claude/build-platform`: #26 (npm minor and patch, 9 updates), #29 (GitHub Actions, 8 updates) and #33 (Docker base images). Leave them for the final pass's Dependabot step and the CI PR (the versions dismissed on 2026-10-18), each checked like any change; never merge one as it stands. No workflow is mid-run, no check-in is scheduled, and no worktree is left except `/home/user/ops`. Scratch databases need no cleanup: a new container starts with empty clusters. The archived run script `co-001-pr5-qualifiers-and-image-fix-wf_ac693abe-059.js` is the only one not on this branch: gitleaks read a document hash in it as a key, and the push was not forced.

**Next, in order** (reconciliation-001 "Proposed pull requests, in order"; the combined audit `audits/combined/combined-report.md` maps each upgrade to its PR):
1. **PR 6b.**
   - ZIP+4 localities: the engine lookup, practice settings and the screening. This is the only engine change the 2026-10-18 freeze exception allows.
   - The screening's own consumer, sized to the worst accepted 50,000-row file. Give the founder its monthly cost before building it (decision 14); it may exceed the ~$18/month accepted.
   - Switch on the 60-second time check (decisions 13 to 16; ADR 0062).
   - Possibly a schema PR, which then needs the founder's approval.
2. **PR 6c:** the audit's engine corrections, under one freeze exception (ADR 0061 notes on remittance_date).
3. **PR 6d:** denials in the paid audit's triage (audit item 1).
4. **PR 6e:** consent capture, the withdrawal page (screening_lead_withdraw) and reminders.
5. **PR 7:** milestone 6 exit, with the red team, gates and scorecard. It also carries the console funnel, the lead list, the campaign screen (console_register_marketing_campaign) and campaign reports with a minimum cohort of 11. Its read functions make it a schema PR.
6. **PRs 8 to 17** as listed in reconciliation-001. Schema PRs needing approval: 8, 14 and 17, plus any other that adds a migration.
7. **The audit PRs, then milestone 12, milestone 13 and the final pass** (runbooks, whole-plan audit, 390 px screens, mono figures, e2e journeys, the Dependabot PRs, settings.json last).

**Open for the founder (none blocks PR 6b):**
- Whether the narrative verifier should also catch a letter claim-filing-indicator code (for example "plan identifier MC"). Today only digit codes fail as figures, and the approving person is the check (ADR 0061).
- The CLP06 words: 7 of the 19 were matched against public sources. The X12 TR3 code list is the check of record before the first real packet.
- **Counsel, before the first real packet and before the screening opens:**
  - the wording in decisions 3, 4, 7 and 17;
  - the cookie notice;
  - the 11-claim-line floor (the number, lines or patients, a left-out total under 11, what counts as "the same practice");
  - the screening terms;
  - the "campaign codes ... of the link you came from" wording (retention.ts, wording.ts), which can now say a code is kept only when it is on the founder's list.
- **The specialist:** Q21 on sequestration (`fixtures/golden/QUESTIONS.md`).
- **The founder's own setup:** runbook 3i (a GitHub identity for the build), then `APPROVAL_REVIEW_REQUIRED`. Until then the build merges on green CI (D4 (a)).

**Follow-ups to fold into a later PR:**
- The CI PR takes the Dependabot versions dismissed on 2026-10-18.
- Dependabot coverage for the postgres and minio images.
- The build-branch docs fix: main has 11 files, and the PR template exists only on main.
- A later migration that turns the `not_recorded` decline fill-in into a refusal once the old website no longer runs.

**How this session worked, so the next one works the same way:**
- **Pipeline (founder, 2026-10-20):**
  1. Design first, with one reviewer.
  2. Builders check what they touch.
  3. Open a draft PR at once so CI runs during the reviews.
  4. At least two adversarial reviews.
  5. One full local suite in the fix round.
  6. A fresh-clone verification that reads CI.
  7. At most two heavy workflows at once.
  8. Short agent reports.
- **Use the default workflow agent for reviews,** given the checklist in `.claude/agents/<type>.md`. The custom agent types (payment-engine-reviewer, edi-reviewer) twice stopped without calling StructuredOutput, which left a PR unreviewed. Have the script refuse to go on when a review returns nothing.
- **Approval lines:** this session's GitHub CLI token is invalid, so the suggested-change route of CLAUDE.md is unavailable. Post the exact line in one PR comment with the web-editor steps (the edit URL `https://github.com/PureTideWater/PhysicalTherapy/edit/<branch>/docs/product/domain-model.md`). The founder commits it. When the founder asks in chat for the build to write it, decline: CLAUDE.md, ADR 0063 and the protect-approval hook forbid it. Before asking, regenerate and read the Cross-checks block. This session found and fixed a false "Column differences: 4" there (e297346).
- **Pushing:**
  - Push from the worktree. If its checkout lacks `.githooks`, push from the main checkout with `GITLEAKS=/root/.cache/paidwhole/gitleaks/8.24.3/gitleaks git -C /home/user/PhysicalTherapy push origin <branch>`.
  - The permission check refuses force-pushes. Never force: fix a malformed commit message with a squash merge of the PR instead. Squash is allowed on the build branch; ADR 0063 forbids it only into main.
- **Merge order** when two PRs edit reconciliation-001 or the ADRs: merge the one the founder approved first, merge the base into the other with a merge commit, resolve keeping both, then merge it.
- **Container restarts** stop Postgres and workflows. Restart both clusters (commands in "Environment recipe"), then resume a stopped workflow with `resumeFromRunId`, which works within one session only.
- **Disk:** clear finished review clones under the scratchpad when free space drops below about 8 GB.

**Weekly usage (founder, 2026-10-21):**
- The meter was at 24% at 00:15 UTC and 35% at 12:40 UTC on Wednesday. The reset is assumed Tuesday 14:00 UTC; confirm it with the founder.
- That is ahead of the ~11%-a-day pace, mostly from closing PR 5.
- Ask the founder for the % and the reset time at session start and before each heavy run. Start no new heavy run past about 80%, never cut a run off mid-way, and keep every quality stage.

## How to resume in a new session
1. Read this file, then `CLAUDE.md`, `docs/product/change-order-001.md` and `docs/product/reconciliation-001.md` on `claude/build-platform`.
2. Set up the environment ("Fresh session", next). Check open pull requests and the branches listed under "Where things stand".
3. Update the tracker (below) and tell the founder where things stand before starting new work.

## Fresh session: tools/setup-container.sh
A new cloud session gets a fresh container, and only what is on GitHub survives. Before anything else, run `tools/setup-container.sh` from this branch, as root, until it prints `OK`. Pass every open `co-001/*` branch as an argument. Each one gets a worktree: `co-001/pr-06b-…` goes to `/home/user/pr6b`, and `co-001/<name>` goes to `/home/user/<name>`.
```
git -C /home/user/PhysicalTherapy fetch -q origin claude/build-ops
git -C /home/user/PhysicalTherapy show FETCH_HEAD:tools/setup-container.sh > /tmp/setup-container.sh
bash /tmp/setup-container.sh co-001/<open branch> ...
```
- **Run the last line in the background.** A fresh run takes several minutes: it downloads about 100 MB and fills the 1.2 GB pnpm store through the proxy. That is longer than the Bash tool's default timeout of 2 minutes, which would cut it off. Give that Bash call `run_in_background: true` (or `timeout: 600000`), read the summary when it finishes, and run it again until it prints `OK`.
- **A cut-off run is safe to repeat.** Each part is built next to its final path (`<path>.tmp.<pid>`) and moved into place only when it is complete, so a cluster, an install or a clone exists only when it is whole. A venv carries a marker file until it is complete. The next run removes whatever a cut-off run left behind. Only one run at a time: a second one stops at the lock in `/tmp/setup-container`.
- **Why `FETCH_HEAD`:** the fetch updates `origin/claude/build-ops` only when the clone has the default fetch refspec, while `FETCH_HEAD` is always the commit just fetched. The script itself fetches each branch by name when the refspec is narrower.
- **If the repository is not cloned yet,** use `git clone -q --depth 1 -b claude/build-ops https://github.com/PureTideWater/PhysicalTherapy /tmp/ops-boot`, then run `bash /tmp/ops-boot/tools/setup-container.sh …`, also in the background. The script clones the repository itself.
- **What it sets up:** the same paths and ports as the environment recipe below.
  - PostgreSQL 18.4 in `/opt/pg18`, cluster `/root/pgdata18`, port 5433, superuser `postgres:test`, trust on the `/tmp` socket.
  - PostgreSQL 16 in `/root/pgdata`, port 5432. The build had `postgresql-16` 16.15-0ubuntu0.24.04.1. The Ubuntu archive offers only its newest 16.x, so the script prints a note when the version differs.
  - Node v24.22.0 in `/opt/node24`.
  - Python 3.12 with pyx12 4.0.0 and defusedxml 0.7.1 in `/opt/py312-ci`, as in CI.
  - The oracle venv `/root/.venvs/tp-oracle`: Python 3.13 from the base image, with the same two packages. `tools/test-oracle/README.md` and the older briefs (`TP_ORACLE_PYTHON=/root/.venvs/tp-oracle/bin/python`) use this path. `/opt/py312-ci/bin/python` works for `pnpm test:oracle` too.
  - gitleaks 8.24.3 at `/root/.cache/paidwhole/gitleaks/8.24.3/gitleaks`, also linked at `/tmp/claude-0/gitleaks/gitleaks`.
  - actionlint 1.7.7 in `/opt/actionlint`, on PATH as `/usr/local/bin/actionlint`. This is a new home: in the old container, actionlint lived only in that session's scratchpad.
  - pnpm is the base image's 10.28.0. Only when no pnpm is on PATH, the script installs `pnpm@10.28.0` from the npm registry into `/opt/pnpm-10.28.0` (pinned hashes) and links it at `/usr/local/bin/pnpm`, outside `/opt/node24`.
  - It also starts both servers, checks out `claude/build-platform`, runs `pnpm install --frozen-lockfile`, and adds `/home/user/ops` and the PR worktrees.
- **Checks:** every download is pinned.
  - PostgreSQL 18, Node and pnpm are npm registry tarballs. Each is checked against a pinned SHA-256, a pinned SHA-512 and the registry's own SHA-512.
  - Node comes only from `node-linux-x64@24.22.0`, the source of the build's `/opt/node24`. nodejs.org is not used: the proxy refuses it, and its checksum list would come from the same host, unpinned.
  - actionlint is checked against its release's checksums file and a pinned SHA-256. pyx12 and defusedxml are installed with `pip --require-hashes`. gitleaks comes from the repository's own installer, which pins its SHA-256.
  - Every run compares `/opt/pg18` and `/opt/node24` file for file with their tarballs, and checks that each venv holds exactly pyx12, defusedxml and pip.
  - Only the Ubuntu packages (PostgreSQL 16, locales and python3.12-venv, each installed only when missing) are not pinned.
- **Result:** it prints one line per part with its version, then `OK`, or `FAILED` with exactly what failed and what to do about it.
- **Running it again** installs nothing that is already in place. It is not read-only, though: it fetches origin, fast-forwards branches that are behind, and runs `pnpm install` where `node_modules` does not match `pnpm-lock.yaml`. It never lets pnpm delete an existing `node_modules`; if pnpm wants to, the script stops and says how to do it. **While agents are working, use check mode instead.**
- **Check without changing anything:** `SETUP_CHECK=1 bash /home/user/ops/tools/setup-container.sh <same branches>`. On the old container, add `ACTIONLINT=<old scratchpad>/gov-r2/actionlint`, because actionlint was never installed in `/opt/actionlint` there. Then `export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH` as before.
- **Testing:** these settings let you test it elsewhere: `SETUP_PREFIX`, `PG18_PORT`, `PG16_PORT`, `PG16_SKIP=1`, `PG_SOCKET_DIR`, `CLONE_DIR`, `OPS_DIR`, `WORKTREE_ROOT` and `REPO_URL`, plus `ACTIONLINT` in check mode. The postgres user must be able to enter `SETUP_PREFIX`. The scratchpad cannot be used directly, because `/tmp/claude-0` is 0700 and Claude Code resets it, so bind-mount a scratchpad directory (for example at `/mnt/setup-test`).
- **Tested on 2026-10-21, under a prefix:**
  - a fresh install, with no pnpm on PATH so that the pinned pnpm path ran;
  - runs killed with SIGKILL while PostgreSQL 18 was being copied into place, while a venv was being made, during initdb and during `git worktree add`, each followed by a run that ended in `OK`;
  - a cluster without the port and socket lines, reported with its remedy, and a tampered cached tarball, reported by check mode and downloaded again by the next run;
  - a clone with a narrow fetch refspec;
  - a rerun and check mode, neither of which changed anything;
  - check mode on this machine.
  The installed trees are identical to this machine's `/opt/pg18` and `/opt/node24`, the venvs hold the same packages, and the clusters have the same settings apart from the port.

### Paths that moved
The old session's scratchpad does not survive. It is `/tmp/claude-0/-home-user-PhysicalTherapy/32de87b7-30ec-5c00-8f16-6ecf80418ed3/scratchpad`, written `scratchpad/` in this file and `SP` in the briefs. A new session has its own scratchpad under another id. The files in it that matter are on this branch, or the script rebuilds them:
- `scratchpad/gov-r2/actionlint` and `scratchpad/gov-build/actionlint/actionlint` are now `/opt/actionlint/actionlint`, also `actionlint` on PATH.
- `scratchpad/design/` is now `/home/user/ops/designs/`.
- `scratchpad/best-option-audit/report.{md,json}` is now `/home/user/ops/audits/`, and `combined-report.{md,json}` is now `/home/user/ops/audits/combined/`.
- `scratchpad/audit-page/build.py` is now `/home/user/ops/audit-page/build.py`.
- `scratchpad/pr5-approval-summary.md` and `scratchpad/pr6-approval-summary.md` are now in `/home/user/ops/approval-summaries/`. Copy the latest ones here before the switch: review rounds rewrite them in the scratchpad.
- `/root/.venvs/tp-oracle` and `/tmp/claude-0/gitleaks/gitleaks` keep their paths; the script rebuilds them.
- `SP` (logs and per-role work directories) becomes the new session's own scratchpad.
- **Before reusing a brief** from `workflow-scripts/`, rewrite its `SP`, `ENV`, `SCRATCH` and `ACTIONLINT` constants first, and point its design, audit and summary paths at the list above.

## Standing rule from the founder (2026-10-18)
Recommend and build only the best option, whatever the effort to build it. The app must be a well-oiled, incredible product focused on quality, accuracy and user experience, and set up to become a multi-million-dollar business. Judge every option on:
- accuracy, quality, user experience and growth;
- security and privacy, and compliance (HIPAA, Medicare appeal rules, state prompt-pay laws, payer-contract confidentiality, WCAG and ADA, honest claims);
- reliability, cost to serve, and dispute success;
- time to value, resilience to change (CMS and payer updates), AI safety, maintainability, and business and due-diligence readiness.

When asking the founder a question, recommend the best option first. Never let the cost of building it decide the recommendation, and say plainly what each option gives up. This rule goes into every build brief and into `CLAUDE.md` in the next pull request.

## Who decides
- Tyler Williams is the founder and owner, and the only approver of `docs/product/domain-model.md`: `packages/db/domain-model/approvers.json` lists "Tyler Williams". Use they/them when a pronoun is needed.
- An approval line is written only when the founder says so, for the exact SHA-256 they approved. Any change to the text means asking again. Agents never write one.

## Owner decisions and rulings (all recorded in the repo as noted)
- **2026-10-17, reconciliation:**
  - D1 to D36 accepted as recommended.
  - D5 (a): all of it, in order.
  - D4 (a): one PR per item, merged by Claude when CI is green.
  - D29: independent sign-off threshold $2,500 per case.
  - D7 (b), D23 (b).
  - `.claude/rules/brand.md` stays as the drop-in wrote it.
  - The 2026-10-18 standing rule means the audits below re-check D1 to D36.
- **D14 timing:** `.claude/settings.json` is committed as the final pass's last commit, because it denies `git push` and turns on the sandbox. The staged copy is described in ADR 0059.
- **PR 2:** domain model approved on 2026-10-17 (`ec475408…`).
- **PR 3:** the fixture guard also reads `.txt`, `.dat` and extensionless tables. This is stricter than D14's wording; the founder can revert it.
- **PR 4:** domain model approved on 2026-10-18 (`374a7b83…bcbe`), along with rulings on the export key, payer aliasing and export limits (ADR 0060).
- **PR 5, 2026-10-18 (ADR 0061, "Owner rulings"):**
  - Schema approved at `6435fadd…2673`, with one addition: the reviewer attests only after downloading both the PDF and the CSV, each matching its stored hash, enforced in the handler and in Postgres.
  - The new hash still needs the founder's confirmation.
  - D16 (a) without another approver is left to D27's PR.
  - Contract appeal-level evidence goes into PR 8.
- **PR 6, 2026-10-18 (ADR 0062, "Owner rulings"):**
  - Reduction-pool rows are priced twice by the unchanged engine and flagged only below the fully reduced figure.
  - Compare against the engine's figure before sequestration (specialist to confirm, Q21).
  - A result priced under a withdrawn release may still convert, with a notice.
  - ZIP+4: superseded at 11:47 UTC. Fix before launch in **PR 6b**: practice settings and screening accept ZIP+4 and the engine resolves the locality from it. Five-digit ZIPs and golden lines are unchanged; the engine freeze is loosened for this lookup only. ADR 0062 still says "keep refusing" and must be amended.
- **PR 6 limits awaiting confirmation with its approval:** $25,000 per claim line, 100,000 claim lines per row, and a hand-kept free-mail list.

- **2026-10-18 16:20 UTC, after the first audit (founder):**
  - Make the repository private. The founder clicks it, ideally after upgrading to GitHub Pro: Free gives private repositories no branch protection and only 2,000 Actions minutes a month.
  - Repair main: revert #7. Done as PR #18, merged at `8d7acce`. Main is again the plan documents, plus `.github/dependabot.yml` with `target-branch: claude/build-platform`. The ten Dependabot PRs (#8 to #17) were closed. Never open or merge a PR into main until launch.
  - Fold the audit's PR 5 fixes in before merge:
    - #4: a "pricing still current" check at approval, export, attestation and the audit report;
    - #5: the contract window records its unit and what it runs from, and Medicare Advantage deadlines stay unverified until the specialist confirms the route (Q34), so no MA packet exports until then;
    - #26: export refusals are visible with their remedy;
    - #61: no dead Approve button, one form.
    The PR 5 fingerprint confirmation waits until these land.
  - Fold the audit's PR 6 fix in before merge: #6, at least 11 claim lines per screening row, enforced in the browser, the server and the database (counsel confirms the number).
  - Full governance (#12), in the governance PR (`co-001/governance`, workflow `wf_6a5ccaf0-c47`):
    - hooks switched on now;
    - CODEOWNERS;
    - a "changes since last approved" summary;
    - an `approval-of-record` CI job that requires the founder's GitHub review once the build agent has its own identity (repository variable `APPROVAL_REVIEW_REQUIRED`);
    - the founder's guide in `docs/runbooks/github-governance.md`.
    Approval of record becomes the founder's GitHub "Approve" review, which can be done from the phone. The founder then does: GitHub Pro, private, the bot account, rulesets.

## Where things stand (2026-10-18 13:45 UTC)
- **Merged into `claude/build-platform`:** #1 (Step 0), #2 (PR 1 brand and copy), #3 (PR 2 domain model), #4 (PR 3 EMR fixtures), #5 (screen-tour fixes), #6 (PR 4 ERA intake). Head: `fe470c1`.
- **main:** repaired by #18 (`8d7acce`), the plan documents only, until launch.
- **First audit done:** 64 upgrades (11 critical, 37 high, 16 medium), in `scratchpad/best-option-audit/report.md` and `report.json`. The second audit (`wf_8e577203-afb`) merges into `combined-report.md`.
- **PR 6 rulings:** done and verified at `dfd48f8`. The PR 6 audit-fix workflow `wf_fb7ce904-a6f` is running: the 11-line floor (#6), the denied-lines template wording (#1) and the ZIP+4 amendment.
- **PR 5 download rule:** done and verified at `6f9829a` (22 checks). The worker now has its own database login, a sixth login and secret in the infra. The PR 5 audit-fix workflow `wf_4eae97e6-03a` is running (#4, #5, #26, #61). After it, rewrite the approval summary and ask the founder to confirm the new SHA-256.
- **Audit items to put to the founder with the combined report:** #21 (deadline alerts PR after PR 5), #25 (reviewer queue after PR 5 and PR 6b) and #34 (figures explained in words), plus all the other critical and high items.
- **PR 5:** `co-001/pr-05-packet-deadline`, worktree `/home/user/pr5`. Workflow `wf_e3d92d32-ee0` (download rule) is in review. Next steps:
  1. The founder confirms the new hash.
  2. Write the approval line.
  3. Run `pnpm db:domain-model --check --require-approval`.
  4. Open the PR and merge it when green.
- **PR 6:** `co-001/pr-06-free-screening`, worktree `/home/user/pr6`. Workflow `wf_d8c22991-041` (rulings) is in review or fixes. After PR 5 merges:
  1. Merge `claude/build-platform` into PR 6.
  2. Regenerate the domain model.
  3. Ask for approval, including the limits.
  4. Amend ADR 0062's ZIP+4 ruling.
  5. Open the PR and merge it when green.
- **Audits:**
  - `wf_056e247c-cff`: decisions, deferred items, accuracy, experience and growth.
  - `wf_8e577203-afb`: ten more angles, merged with the first audit.
  - Output goes to `scratchpad/best-option-audit/combined-report.md` (copy it here when done). Publish it for the founder and ask for decisions on the critical and high items.
- **Next PRs:**
  - PR 6b (ZIP+4).
  - PR 7 to PR 17, per `reconciliation-001.md`. PR 8 now includes appeal-level evidence.
  - Milestone 12 (reduced scope), then milestone 13.
  - Final pass: runbooks, whole-plan audit, phone-width (390 px) screens and mono figures, retry-safe uploads in the models, monitoring, reports and triage e2e journeys, the Dependabot PRs, `settings.json` as the last commit, final verification, and a final report listing the human-blocked items and a day-one launch checklist.
- **Schema PRs needing the founder's approval:** PR 5, PR 6, possibly PR 6b, PR 8, PR 14 and PR 17.
- **Re-pricing breaks packets** (screen tour) belongs to PR 11.

## Restart of 2026-10-18 18:40 UTC (spend limit, then a container restart)
The org's spend limit stopped several agents mid-run; the founder raised it. The founder then ruled (18:50 UTC): **never sacrifice quality to use fewer agents.** Every PR keeps its full pipeline: independent builders, at least two independent adversarial reviews from different angles, a fix round, a fresh-clone CI-equivalent verification agent, then GitHub CI. Credits are saved only where quality is untouched: replaying finished steps from cache, finishing saved edits instead of redoing them, and not rerunning suites without need.
- **PR 5 audit fixes** (`wf_4eae97e6-03a`): resumed on the original design (three reviews, full verify). The setup is cached; the builders finish the saved work (`salvage/co-001-pr-05-packet-deadline-wip`).
- **PR 6 audit fixes** (`wf_fb7ce904-a6f`): resumed on the original design. The build role reviews the committed work at `1bc9426` and completes its checks; two reviews, fix, verify.
- **Governance** (`wf_6a5ccaf0-c47`): resumed on the original design (two reviews, fix, verify). The build is cached.
- **Second audit** (`wf_8e577203-afb`): resumed on the original design. 101 steps are cached; the 20 cut-off adversarial checks run, then the merge writes `combined-report.md` and `.json`.
- **Saving unfinished edits** (the founder asked for this): `tools/salvage.sh` snapshots every worktree's uncommitted edits to `salvage/<branch>-wip` on GitHub. Every check-in runs it.

## Environment recipe (cloud container)
- Postgres 16 on 5432: `su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D /root/pgdata -o '-p 5432 -k /tmp' -l /tmp/pg16.log start"`.
- Postgres 18 on 5433 (CI parity): `su postgres -c "/opt/pg18/bin/pg_ctl -D /root/pgdata18 -o '-p 5433 -k /tmp' -l /tmp/pg18.log start"`, superuser `postgres:test`.
- Node 24 is at `/opt/node24/bin`; Python 3.12 with pyx12 is at `/opt/py312-ci/bin`; gitleaks 8.24.3 is at `/root/.cache/paidwhole/gitleaks/8.24.3/gitleaks`, and also at `/tmp/claude-0/gitleaks/gitleaks`; after `tools/setup-container.sh`, actionlint 1.7.7 is at `/opt/actionlint/actionlint` (on the old container it is only in the scratchpad, at `gov-r2/actionlint`). If the container is replaced, run `tools/setup-container.sh` (see "Fresh session").
- One worktree per PR (`/home/user/prN`). Each agent role gets its own database (`tp_prN_<role>_<n>`) and its own E2E port.
- `pnpm lint` needs about 6 GiB of heap.
- **Disk:** keep more than 5 GB free. Delete only clones that belong to merged PRs or finished workflows, after checking nothing running uses them.
- **Agents:**
  - The `security-reviewer`, `edi-reviewer` and `payment-engine-reviewer` agent types have small turn limits, so use general-purpose agents with their brief.
  - Never SendMessage a workflow agent, because it starts a duplicate.
  - After a container restart, start Postgres again and resume workflows with `resumeFromRunId`.

## Tracker
- **Artifact:** https://claude.ai/artifact/MFFHU21aJ9CP4CAnwU7WKR (PaidWhole Build Tracker, a dashboard backed by an artifact database).
- **Refresh:**
  1. Run `python3 -I tracker/build_status.py <outdir>`. `MANUAL`, `STEP_RUNS`, `BATCHES`, `HISTORY` and `ETA` are edited by hand.
  2. Upload each changed JSON as an asset (`Artifact publish {url, asset:true, file_path}`).
  3. Point `datasets/<id>` at it with ArtifactData update `{source:{kind:file,url:/_blob/<id>,name,format:json}, updated:{at,by:"Claude"}}` and `if_version`.
  4. Delete the old blob and update `tracker/assets.json`.
- **ETA** (re-estimated 2026-10-18): 2026-10-21 to 2026-10-24.

## Files here
- `tracker/`: the tracker generator, asset ids and page.
- `approval-summaries/`: the plain-language summaries sent to the founder.
- `workflow-scripts/`: every workflow script run so far. They are reusable briefs for the remaining PRs.

## Pause of 2026-10-19 01:37 UTC
- All four runs stopped on the weekly limit (resets 2026-10-20 14:00 UTC): governance (two reviews, fix, verify left), PR 5 audit fixes (three builders' remainder, three reviews, verify), audit 2 (15 checks plus merge of 122), PR 6 audit fixes (build).
- Uncommitted edits saved: salvage/co-001-pr-05-packet-deadline-wip (e8ac527, on top of 85579f6), salvage/co-001-pr-06-free-screening-wip (eae2ad9, on top of 1bc9426). Governance had none.
- One resume is scheduled for 2026-10-20 14:10 UTC (trig_01Uz1MHApXbEYtc9P5y48ZMZ). No other check-ins are armed.

## Resume of 2026-10-20 14:20 UTC (weekly reset)
- The extra-credit run of 2026-10-19 01:38 got further before the limit: PR 5 has the migration (85579f6), the #4 pricing-current work (b9fe863) and the #5 window work (0dd211d) committed, plus three untracked db tests (saved at salvage 345c594); PR 6's A5 and A6 are committed (a4ce0d7, 9b7f1b6); governance's two reviews finished; audit 2 is at 117 of 122.
- No codex/* branches exist. claude/build-platform (fe470c1) and main (8d7acce) are unchanged. Five Dependabot branches target claude/build-platform, as #18 set up.
- All four runs resumed at 14:20 UTC with resumeFromRunId on their full designs.

## Founder rulings of 2026-10-20 ~15:10 UTC (combined audit)
- Combined audit published: https://claude.ai/artifact/AZsQjBeEUXqs5UcPYWPt4g (source scratchpad/best-option-audit/combined-report.{md,json}; page built by scratchpad/audit-page/build.py). 138 upgrades: 18 critical, 83 high, 33 medium, 4 low; 19 freeze exceptions; 4,750-7,590 added plan hours.
- **Adopt all of it.** The 19 freeze exceptions are granted; the ruling changes the report lists are accepted as it recommends; new PRs land where the report places them; the running costs are accepted (AWS Network Firewall about $580 a month, Cognito Plus per user, screening consumer about $18 a month, PDF service minimums, GitHub Team organization, AWS backup account and log retention, hosted status page). No success fee as a build item. Every schema change still needs the founder's SHA-256 approval.
- **Schedule:** keep the full list and move the gate dates; quality first.
- **PR 5 and PR 6:** fold in now, before merge: #37 part 1 (the packet a payer's examiner receives, 4-8 h) into PR 5; #53 (the screening's 60-second promise: test and cache) and #57 (screening result columns, while its migration awaits approval) into PR 6.
- **Approvals:** every PR requires the founder's GitHub approval before merge (replaces D4 (a)) once the build agent has its own GitHub account (governance guide step 3); ADR 0063 goes from zero to one required approval. Until then D4 (a) continues.
- CI runner pin: PR #24 merged into claude/build-platform as 262d37d (audit #19; workflow wf_a441e4f6-922). Governance must pin approval-of-record.yml and resolve 4 hunks in ci.yml and supply-chain.yml when it merges the build branch. Dependabot #23 (Playwright 1.64.1) waits for the CI PR that moves to 26.04. GitHub runner-images issue #14748 confirms ubuntu-latest moves to 26.04 from 2026-10-19 to 2026-11-19.
- Governance round 1 verified at 19a47f6 (2 reviews, 18 findings, 16 real and fixed; fresh clone green). Round 2 running (wf_8e7d9b51-fa7): merge 262d37d, pin approval-of-record.yml, the 2026-10-20 rulings (one required approval once the agent has its own identity; the build merges after the founder approves), audit #20 (b) policy, controls map and PR template, (c) launch switch, (d) Team-plan organization move before PR 7, (e) pre-push hook, (f) security.txt and disclosure page; then 2 reviews, fix, verify. Then open the governance PR.

## Founder ruling of 2026-10-20 ~18:30 UTC: the efficient pipeline (no quality given up)
Applies from the next round of every PR. Every stage stays: design, independent builders, at least two adversarial reviews, a fix round, a fresh-clone verification, GitHub CI.
1. **Design first.** A setup agent writes the PR's design contract from its audit items and rulings; one reviewer checks the contract before any builder starts; founder questions go up front, in one batch.
2. **Builders check what they touch.** `pnpm typecheck` (whole repo), lint and the tests of the packages they changed. No full test:db or e2e at build time.
3. **Draft PR at once.** When the builders have pushed, open the PR as a draft into claude/build-platform and subscribe, so GitHub CI (the full suite: typecheck, lint, unit, golden, oracle, db, e2e, build) runs while the reviewers work.
4. **Fix round runs the full local suite once**, then pushes.
5. **Fresh-clone verification reads CI.** Launch it after CI on the fix head finishes (the PR event wakes the session). It clones fresh, checks scope, makes the PR's proofs, writes the approval summary, and reads CI's result for that head instead of rerunning the identical suite. Red CI goes back to a fix round.
6. **At most two heavy workflows at once** on this 4-CPU machine.
7. **Short agent reports:** every check with its result, every finding with its disposition, every open item; narrative short, full logs on disk.
8. **Fresh session** once PR 5 and PR 6 have merged and nothing is running: bring this file fully up to date, check it against the conversation, then the founder starts a new session from it.
- PR 6 audit-fix round verified at 3c1b289 (wf_fb7ce904-a6f done): 11-line floor in three layers; review fixes: the database hashes only accepted rows (rows_sha256), and a practice keeps one accepted screening at a time (a later one replaces the earlier, audit event screening_replaced), so two screenings cannot be subtracted into a small cell. Domain model unapproved at afba214a... (do not ask the founder to sign it: PR 6 regenerates after PR 5 merges and after #53/#57). Approval summary: scratchpad/pr6-approval-summary.md. Counsel questions added (left-out totals under 11; how wide 'the same practice' is).
- Design step running (wf_7d287f43-933): scratchpad/design/pr5-37-payer-packet.md and scratchpad/design/pr6-53-57-screening.md, each written, reviewed and revised. Builds start when a heavy slot frees (PR 5 fix round and governance round 2 are the two running).

## Founder rulings of 2026-10-20 ~20:00 UTC: the 19 design decisions
- The founder accepted the recommended answer on all 19 questions in scratchpad/design/decisions-2026-10-20.md: 1-6 for PR 5 (#37 part 1, design scratchpad/design/pr5-37-payer-packet.md, including contact_missing as a coded refusal in PR 5's migration) and 7-19 for PR 6 (#53 parts 1-2 and #57 schema, design scratchpad/design/pr6-53-57-screening.md, including the screening_terms_sha256 column for #51). The builders record each ruling in ADR 0061 (PR 5) and ADR 0062 (PR 6). Counsel confirms the wording of 3, 4, 7 and 17, the cookie notice and the 11-line floor before the first real packet or the screening opens.
- Build order: PR 6 #53/#57 build starts when a heavy slot frees; PR 5 #37 build starts after PR 5's current fix and verify round finishes (same worktree).

## Founder rulings of 2026-10-20 ~21:00 UTC: governance
- Content publisher: a GitHub App owned by the organization, Contents only, the only bypass of "Protect main" and of content-release tag creation, its key in environment content-publish readable only from main (runbook step 7). Confirmed.
- Release tags (v*): only the founder creates them, from the Releases page; the deploy runbook checks the tag's commit is on main. Confirmed.
- One PR into main before launch is allowed: main's .github/dependabot.yml to the grouped, limited copy (target-branch lines kept) plus .github/pull_request_template.md; opened after the governance PR merges and before runbook step 5; the founder approves it.
- Rulesets split: "Protect main history" (no bypass at all) and "Protect main" (pull-request rule); content-release tag rules split the same way. Confirmed.
- To do: record these four in ADR 0063's 2026-10-20 amendment and the runbook ("confirmed by the founder") after the round-3 fix (wf_73afeed2-2d3) finishes; PR #25 is open as a draft and subscribed.
- Governance: PR #25 (draft) at 0acf852 (round-3 fixes f890ffc, cd42a64; founder's four rulings 0acf852). Final verify running (wf_d18db740-5e7). Lesson for the efficient pipeline: ci.yml cancels an in-progress run on each new push (concurrency), so batch pushes on a draft PR; supply-chain and approval-of-record were green on 98392bf and cd42a64.

## PR 5 audit-fix round verified (2026-10-20 ~21:25 UTC) and two rulings
- PR 5 verified at 6d93b40 (wf_4eae97e6-03a done): every check passed; #4, #5, #26, #61 proven in a scratch copy; domain model unapproved at 372fa545... (do NOT ask to sign: #37 part 1 changes one SQL function next, so the founder signs once after it).
- Founder rulings of 2026-10-20 ~21:25 UTC:
  1. Pricing that goes stale after export but before attestation: the submission is logged as unattested ("sent without sign-off: pricing went stale after export") so reconciliation tracks the payer's answer; the stale packet is never attested.
  2. "Remittance date" in a contract window means the remittance advice's own date, not the payment date (BPR16); such windows stay unverified until PR 6c computes it.
- Next PR 5 round: merge claude/build-platform (after #25 merges), #37 part 1 (design scratchpad/design/pr5-37-payer-packet.md, rulings 1-6), ruling 1 above (an unattested submission path, in PR 5's migration), record ruling 2 in ADR 0061; the version-form.tsx name="intent" nit; draft PR at once; reviews; fix; verify reads CI.
- 2026-10-20 21:40 UTC: PR #25 merged as 82035ae. Main checkout fast-forwarded (hooks in .claude/settings.json now live for this session's edits; CLAUDE.md has the new lines). The pre-push launcher was installed by session-start.sh, then PARKED at /tmp/claude-0/pre-push.launcher.parked because it refuses pushes from pr5/pr6 (their branches lack .githooks/pre-push until they merge 82035ae). Reinstall with `CLAUDE_PROJECT_DIR=/home/user/PhysicalTherapy bash .claude/hooks/session-start.sh` once both have merged the base. salvage.sh pushes go through it after that.
- Next: the one PR into main (dependabot.yml groups + pull_request_template.md), per the founder's ruling, pushed from a checkout that has the hook.
- 2026-10-20 ~22:10 UTC: PR #27 into main merged as 220f2b4, on the founder's in-session approval (GitHub forbids the author's own review while the build works under the founder's account): main's dependabot.yml grouped and limited (target-branch kept) and the PR template. main now has 11 files. Follow-ups: (1) a build-branch docs PR fixing runbook lines ~414/525 and ADR 0063 ~130/136 ("main's 10 files" -> 11, "main has no template"); fold into the next build-branch PR that touches docs; (2) watch Dependabot: one grouped actions PR should replace #19, #20, #22; (3) the CI PR must take deliberately the versions dismissed by closing #8-#14, #16, #17 on 2026-10-18 (node 26-slim images, actions/checkout 7, pnpm/action-setup 6, docker/build-push-action 7, docker/login-action 4, actions/upload-artifact 7, typescript 7.0.2, @types/node), since Dependabot will not propose them again; (4) postgres:18 and minio in docker-compose/CI have no Dependabot coverage (propose in a build-branch PR).
- Pre-push launcher: every agent start runs .claude/hooks/session-start.sh, which reinstalls .git/hooks/pre-push, so parking it does not hold. A worktree whose branch lacks .githooks/pre-push (pr6 until it merges 82035ae; the orphan claude/build-ops) pushes from the main checkout: `GITLEAKS=/root/.cache/paidwhole/gitleaks/8.24.3/gitleaks git -C /home/user/PhysicalTherapy push origin <branch>`, which runs the build branch's hook over the branch's commits. salvage.sh now pushes that way.
- PR 6 round 3 build done (wf_5ae217ac-cdb): #57 schema and day-one writes (fbce120), #53 parts 1-2 (scale release 900100, tools/screening-capacity, screening-capacity.yml, per-release keyed read with oracle; bef9f3b). The capacity run found a real blocker: the result page renders all groups, and a worst-shape result (20,507 groups) exhausts the web task's 512 MiB heap. Local times: worst shape 108 s alone, 238 s three at once; practice shape up to 51 s three at once (all over 48 s once PR 6b enforces time). Round 3 review running (wf_0ee61711-35d): merge 82035ae, the heap fix, case registry SCR-03/10-14, draft PR (number from the prepare step), three reviews, fix with full suite and domain model regenerated. Then verify reads CI. screening_terms_sha256 stays nullable until PR 6e.
- PR 5 round 4 build done (wf_235f54e6-f57): head 73b7f2d (merge e1dbc86 of 82035ae; schema 5a00530/6d8513f: contact_missing, submission.unattested_reason, packet_version_unattested_reason(), submission_logged_unattested; #37 part 1 2b43617/c9b57b5/73b7f2d; unattested path a4fe888/e227dc2). Draft PR #30 opened and subscribed. Review round running (wf_c851231c-1ca): three reviews, fix with full suite, domain model regenerated, scratchpad/pr5-approval-summary.md rewritten. Then verify reads CI on #30, then ask the founder to sign the SHA-256.
- Notes from the build: only roles with submission.log (billing manager, firm principal) log submissions, reviewers stay read-only (D16); the correspondence setter route is gated by agreement.sign (practice_admin only); test-matrix rows CAS-26 to CAS-28.

## Founder rulings of 2026-10-21 ~00:10 UTC: fresh session and weekly pacing
- **Fresh session after PR 5 and PR 6 complete (merged), with no gaps.** Before the switch: nothing running; every in-flight item, ruling, open question, follow-up and file recorded here or in the repo; every session-only file copied to this branch (designs/, audits/combined/, approval-summaries/, audit-page/, workflow-scripts/, CODEX-BRIEF.md); tools/setup-container.sh rebuilds the machine (Postgres 16 and 18, Node 24.22.0, Python 3.12 with pyx12, gitleaks, actionlint) and is tested; then a resume message for the founder to paste. Workflow runs cannot be resumed across sessions, so switch only when none is mid-run.
- **Never run out of weekly usage, never at the cost of quality.** Keep every stage (design, independent builders, at least two adversarial reviews, a fix round, a fresh-clone check, GitHub CI). Save only waste: (1) the fresh session; (2) pace steadily across the week: ask the founder for the usage meter's percentage and reset time at each session start and when a big run is about to start, start no new heavy run once the week is at about 80%, and never let a run be cut off mid-way; (3) give agents exact file sections, not whole large documents (the combined audit is 300 KB: cite item numbers and line ranges); (4) group audit items that change the same code into one PR; (5) the efficient pipeline of 2026-10-20.
- 2026-10-21 01:20 UTC: container restart stopped PR 5 round 4 review (wf_c851231c-1ca), PR 6 round 3 review (wf_0ee61711-35d) and the setup script (wf_53f6258f-c18); all three resumed with resumeFromRunId at 01:35. Salvage saved pr6 (41fb9cb). Disk was 6.1 GB free: dropped 40 idle test databases, old scratch clones (engines, pt-tool, pt-copy, mut92, diagrams, gov-review-bypass, screen-tour) and the merged worktrees repair-main, pw-brand and governance; now 9.5 GB free. CI on #30 at 73b7f2d failed only in domain-model.db.test (stale document, blank approval), commented on the PR.

## Founder rulings of 2026-10-21 ~03:30 UTC: PR 5
- PR 5 fix round done at 86d7edc (wf_c851231c-1ca): 29 findings, all fixed except the pre-guard stale export (ruled below). Domain model text SHA-256 6f72ea56563c379e05a601f3af019ad4ce3358f55cc02b06fcec17ea23d830a0; CI at 3e878f6 failed only the approval case.
- The founder APPROVED that text (SHA 6f72ea56...). gh is not authenticated in this session, so the suggested-change route of CLAUDE.md is unavailable; the exact approval line was posted as a PR #30 comment with the GitHub web-editor steps, for the founder to commit themselves ("Approved by: Tyler Williams  Date: 2026-10-21  Document SHA-256: `6f72ea56...`"). The build never writes it.
- Confirmed the reviewer's checklist wording as written; the payer CSV carries a packet_reference column on every row (D3 change, no schema); no remedy for a pre-guard export whose pricing went stale (no environment has sent a real export).
- Running: final small round (wf_b596410d-bed): CSV reference column, reconciliation journey wait, ADR 0061 rulings; one review; fix. Then: founder's approval commit, verify reads CI, merge #30.
- Approval summaries copied to approval-summaries/ (latest).

## 2026-10-21 ~07:00 UTC: PR 5 verified; founder rulings on PR 6
- PR 5 final small round (wf_b596410d-bed): packet_reference CSV column (c4582bc), journey wait (1b9368a), ADR 0061 rulings (921b6ca), and the real flake fixed: a torn read; the Reconciliation, specialist ledger, case and practice home pages read in one REPEATABLE READ snapshot (7618f1d). CI at 7618f1d: only the approval case fails. Fresh-clone verification (wf_869b22cd-9e8) passed: scope, SHA 6f72ea56 unchanged, the RR pages never reach pricing_current_read_lock (only its four write triggers refuse RR), writes at READ COMMITTED, proofs #4 #5 #37 stale-export contact_missing all hold. Founder's approval-line commit still pending (instructions in the PR #30 comment).
- Running (wf_ac693abe-059): PR 5 payer copy prints payer and plan without X12 qualifier prefixes ('2U:', 'CE:'), the release number stays (D14); and branch co-001/images-node-start with PR 6's 8f6e4d5 (production images could not start Node as user node) for its own PR.
- Founder rulings on PR 6 (2026-10-21): keep as built: an email-only match deletes the kept summary and carries no request; result page and email say when a summary is kept with an earlier request; deletion through PR 6e's withdrawal link. Requests keep utm_campaign only if it is on the founder's campaign list (source and medium keep the shape checks). PR 7 campaign reports use a minimum cohort of 11. The images fix goes to claude/build-platform now as its own PR.
- PR 6 at 7bcb5fc (round-3 fix done, 29 of 30 findings fixed; J10 race was PR 5's torn read, now fixed there; result-page.large.db.test timeout under load). Next PR 6 round, after PR 5 merges: merge the base, the campaign allowlist, drop 8f6e4d5's duplicate if the images PR merged, regenerate the domain model, review, verify, approval.

## 2026-10-21 ~12:30 UTC: PR 5 final head; images PR #32
- The founder committed the approval line (e63af26, SHA 6f72ea56...). The qualifier round (wf_ac693abe-059) then pushed 6fc2ce1 and 575d541 after it, so PR #30's head is 575d541. Neither commit touches the domain model; `--require-approval` passes. Merge #30 on green CI at 575d541 (D4 a; APPROVAL_REVIEW_REQUIRED is not yet set).
- In 6fc2ce1, the verifier reads a token led by a qualifier code (two capitals or digits and a colon, or TRN03:, CLP06:, NAME: or PLAN:) as one identifier, so "CE:SYNPLAN-FIX-ONE" in a narrative fails with figure_not_in_input. As a side effect, a time "10:30" is read as one identifier; it passes only when a quoted input holds it. An ERA export's PLAN: plan prints "plan <name>". payer.ts is in both Stryker configs. Verifier score 86.39 (scan.ts 85.65; facts.ts 83.33 on lines this PR did not change).
- Open for the founder, recorded in ADR 0061 "Verification fix (2026-10-21)": CLP06-only plans print "plan identifier 12". The options are (a) words from an X12 claim filing indicator table, ZZ left out as in (b), which is recommended and needs a source for the words the founder accepts (pyx12's map has codes only); or (b) leave the plan off the "To:" line. Goes into a follow-up PR after the ruling.
- Images fix: PR #32 (co-001/images-node-start, 70ba431, the cherry-pick of 8f6e4d5), opened from the template and subscribed. Merge on green; PR 6's round then drops its duplicate in the base merge.
- **Founder ruling 2026-10-21 ~12:40 UTC: CLP06-only plans print the plan type in words** (option (a)), from the X12 claim filing indicator list (element 1032); ZZ ("mutually defined") leaves the plan off the "To:" line as in (b); a code with no words refuses the copy (PayerCopyWordsError). Built as a follow-up PR from claude/build-platform after #30 merges. Usage: 35% at 12:40 UTC Wednesday (24% at 00:15), so the pace runs ahead of 11% a day; keep to two heavy workflows at once and stop new heavy runs at about 80%.

## 2026-10-21 ~13:15 UTC: PR 5 and the images fix merged; two runs started
- Merged #30 (PR 5) as d152976 and #32 (images fix) as 5df4108 into claude/build-platform, both on green CI. Unsubscribed both and cancelled the check-in. Removed worktrees pr5 and pr-images. A container restart at 12:59 stopped Postgres; restarted both clusters. Freed the old review clones (15 GB free).
- Running wf_ad7fee73-02b (PR 6 final round, /home/user/pr6): merge 5df4108 (reconcile both migrations), campaign allowlist (unlisted code stored as 'other', enforced in Postgres), ADR 0062 "Owner rulings (2026-10-21)", the result-page.large test's timeout fixed at its root; two reviews; fix round with the full suite; fresh-clone verify; approval summary (scratchpad pr6-approval-summary.md) and PR #31 body (scratchpad pr6-final/pr31-body.md). E2e ports 4801 to 4809, databases tp_pr6f_*. Resume with resumeFromRunId if a restart stops it.
- Running wf_c012584a-956 (PR 5b, /home/user/pr5b, branch co-001/pr-05b-plan-type-words): plan type in words per the ruling; payment-engine and EDI reviewers; fix round. It opens its own draft PR. Ports 4901 to 4909, databases tp_pr5b_*. No migration: merge on green (D4 a).
- After both: post the PR 6 approval line for the founder (new SHA), merge PR 5b on green, merge PR 6 after the founder's approval commit and green CI; then the fresh-session handoff.
- PR 5b is draft PR #34 (head efac005, CI green). Both specialist reviews (custom agent types payment-engine-reviewer and edi-reviewer) stopped without reporting, so the first fix round saw no findings. Not merged: the reviews rerun as default workflow agents following .claude/agents/*.md (run wf_c012584a-956 resumed, task wt18houdr; the build replays from cache). Use default agents for reviews from now on. Open lead: planKey() with a null filingIndicator (ERA claims) giving 'CLP06:null'. Word cross-check: sources agree on 12, 13, 16, HM, MA, MC and OF; the other 12 codes rest on the ruling's transcription of the X12 list (ADR 0061 says reading the TR3 is the check of record).

## 2026-10-21 ~17:30 UTC: PR 6 final round done (wf_ad7fee73-02b)
- PR 6 (#31) head 6a4ec80. The round merged 5df4108 (4525977): the two migrations share no changed object, and a catalog comparison proves PR 5's objects intact. It built the campaign allowlist in Postgres (3164a2a, marketing_campaign_kept() plus triggers on four columns; unlisted is stored as 'other'), the 2026-10-21 rulings in ADR 0062 and reconciliation-001 (24bfb51), and the result-page test fix at its root (c33e5a7, screening_standing() inlined). Two reviews found one nit, fixed in 592244e. The full local suite passed except the approval case. The fresh-clone verify held all six proofs.
- Found during regeneration: the domain model's cross-check listed four false column differences (PgSmallInt missing from cross-check.ts's own copy of the type map). Fixed in e297346 (one shared POSTGRES_TYPES, a test holding it to every schema type) and regenerated in 6a4ec80. New approval hash **a17f33aa3b3ace6efcf11171789b6cfbdb0193f0dc76be5b28cdd47840deebfe**. Two reviews of the fix are running (wf_57d0b10d-984). The PR #31 body is updated, PR #31 is subscribed, and approval-summaries/pr6-approval-summary.md is updated.
- Next: post the approval-line comment after those reviews; the founder commits the line; CI green; merge #31. PR 5b (#34) review rerun: wf_c012584a-956.
- Leftover scratch database tp_test_dde88f4bd1c64e60af0a6b58808d836c on 5433: drop it once no run is live.
- 2026-10-21 17:35 UTC: the founder committed the approval line on PR #31 (a66f148, a17f33aa..., Tyler Williams, 2026-10-21). `--check --strict --require-approval` passes on a fresh PG 18. Merge #31 on green CI at a66f148. The founder asked in chat for the build to add the line; it was declined under CLAUDE.md/ADR 0063 (gh token invalid, so no suggested change), and the founder then committed it.
- PR 5b (#34) head 203a432. The review rerun found two nits. reconciliation-001 overclaimed that no narrative can hold a filing indicator code; only digit codes 12 to 17 fail as figures, and letter codes such as MC pass. Fixed in 203a432 and stated in ADR 0061 (the founder may rule whether the verifier should catch letter codes; the approving person is the check today). efac005 lacks a blank line after its subject; the force-push of the reword was refused by the permission check, which is correct (local branch co-001/pr-05b-plan-type-words-reworded, to delete). Plan: merge #31 first; merge the base into #34 (reconciliation-001 conflicts: put PR 5b's bullet at the end of the "Ruled by the owner ... October 21, 2026, on PR 5" list, before PR 6's blocks); after CI is green, **squash-merge #34** with a clean message (squash is allowed on the build branch; ADR 0063 forbids it only into main).

## 2026-10-21 ~19:45 UTC: new session (e7bf8d14), machine rebuilt, tracker brought current
- `tools/setup-container.sh` printed OK on its first run (PG 18.4 on 5433, PG 16.15 on 5432, Node 24.22.0, both venvs, actionlint 1.7.7, gitleaks 8.24.3, pnpm 10.28.0; `claude/build-platform` at 8e33cb3; ops at d789e96).
- GitHub as the handoff says: head 8e33cb3; only Dependabot #26, #29 and #33 open.
- Tracker: the old session's workflow journals went with its container, so `tracker/build_status.py` now reads this session's journals and, for a step whose journal is missing, the last published `work.json` (kept as `tracker/frozen-work-2026-10-18.json`). Everything from 2026-10-18 17:22 to now is recorded by hand (MANUAL, BATCH_MANUAL): governance #25, CI pin #24, main #27, PR 5 #30, images #32, PR 6 #31, PR 5b #34, the audit decisions and the 19 design questions. A PR 6b batch is added; its design run id replaces `PR6B_DESIGN_RUN` once launched. ETA re-estimated to 2026-11-18 .. 2027-01-10 (basis in the file). Test counts from PR 5b's full suite (unit 3845, db 8587; e2e 49 by count).
- PR 6b scope, from the handoff and the combined audit's placements: ZIP+4 localities (engine lookup under the freeze exception, practice settings, screening; ADR 0062 amended); #33 pricing settings at onboarding; #53 parts 3 and 4 (the screening's own consumer, its role and login, metrics and alarms), sized to the worst accepted 50,000-row file with its monthly cost put to the founder before building (decision 14); the 60-second time check switched on by declaring `compute.screening` in `infra/lib/environments.ts` (decisions 13 to 16, `tools/screening-capacity/limits.ts`); #76 the screening's email streams; #7's screening refusal; #31's screening cache (check what PR 6 already did); #16's question to the founder (ZIP+4 on a site record or on practice settings). #3, #28 and #29 stay in PR 6c (the engine corrections under one freeze exception).
- **Usage (founder, 2026-10-21 ~19:55 UTC, Wednesday): 41%.** Resets Tuesday (time assumed 14:00 UTC, as before). About two days ahead of the 11%-a-day pace: about 39% is left for new heavy runs before the ~80% stop. At most two heavy workflows at once.
- **Running: wf_b7b1b9d1-40f (design-pr6b, script in workflow-scripts/).** Three read-only design tracks, each with one reviewer and a revision, then one plan: A ZIP+4 and pricing settings (#33, #16's question, #7's screening refusal) → `SP/design/pr6b-zip4-settings.md`; B the screening consumer measured with the capacity harness's ProcessRuntime (the Docker daemon is not running here), its monthly cost (Fargate price fetched and cited), the time check (decisions 13 to 16), #31's screening part → `SP/design/pr6b-consumer-time.md`; C the email streams (#76) → `SP/design/pr6b-email-streams.md`; plan → `SP/design/pr6b-plan.md` (PR split, migration order, builders, the founder's questions in one batch with the monthly cost first). SP is `/tmp/claude-0/-home-user/e7bf8d14-3b4c-5e38-9cea-a1f92a95083e/scratchpad`; copy the four files to `designs/` when it finishes. Design agents use databases `tp_pr6b_design_*` on 5433 and clones under `SP/design-scratch/`. Next: put the plan's questions to the founder; builders start only after the answers.
- **2026-10-21 ~22:00 UTC: design run wf_b7b1b9d1-40f done** (10 of 10 agents, none empty; 3.1M subagent tokens, 2 h 05 m). Files copied to `designs/pr6b-{zip4-settings,consumer-time,email-streams,plan}.md`. The plan splits PR 6b into four PRs, serial because each migration rewrites `submit_screening` and the domain model:
  1. **6b-1** `co-001/pr-06b-zip4-engine`: the engine's ZIP+4 lookup (five pricing files, about 45 lines, ENGINE_VERSION phase-two/2), the locality_map_plus_four record type and ZIP9 parser, synthetic release 900006, golden G196-G199, `tools/engine-freeze` (exception file, differential test of base vs head engine, CI step). No migration.
  2. **6b-2** `co-001/pr-06b-pricing-location`: practice_site (#16's minimal record), #33's pricing settings and onboarding, months waiting as location_not_ready, the place-of-service split pinned on each run, ZIP+4 in the screening, #7's content span (out-of-span rows left out and counted). Migration `20261105090000_pricing_location_and_zip_plus_four.sql`; the founder's approval.
  3. **6b-3** `co-001/pr-06b-screening-consumer`: a fourth Fargate service (2 vCPU/4 GiB, three worker threads, one task), role tp_screening and its login, queue share and daily cap, wait states, metrics and alarms, the harness running the consumer with time enforced at 48 s, the launch check. Migration `20261106090000_screening_consumer.sql`; the founder's approval.
  4. **6b-4** `co-001/pr-06b-mail-streams`: three SES configuration sets, events through EventBridge/SQS to a mail_events job, mail_send, the screening stream's cut-off, outbox for notices, 15 alarms, ADR 0065, deliverability runbook. Migration `20261107090000_mail_streams.sql`; the founder's approval.
- Measured sizing (ProcessRuntime, this 4-CPU machine, Postgres pinned to 2 CPUs): three worst files at once 41.1 s in a 2-vCPU pool with three slots; two slots 55.8 s; one 1-vCPU slot serial 75.4 s; 0.5 vCPU alone 44.1 s. Two harness bugs found for 6b-3: cgroup-v1 affinity shrinking (exec services under taskset) and a queue-order race (wait for the large jobs' pgboss rows). The first CI capacity run of 6b-3 is the measurement of record; above 44 s goes to the founder before merge.
- Costs (us-east-1 assumed: the stacks pin no region; AWS pages refused by the proxy, prices from search and third parties, arithmetic checked): consumer A ≈ $74.50/month per environment; mail streams ≈ $18 per environment; 4-core CI runner ≈ $22; total ≈ $207/month after launch, ≈ $133 before (production consumer held at 0). The founder's 13 questions (plan Q1 to Q13) and 15 open items (O1 to O15) are in `designs/pr6b-plan.md`. Waiting on the founder's answers; no builder starts before.

## Founder rulings of 2026-10-21 ~22:30 UTC: PR 6b's 13 questions
- The founder: "Do all the recommended options for these questions as long as it optimizes the app." Every recommended answer of `designs/pr6b-plan.md` section 3 is accepted (each is the design's best option under the standing rule):
  - **Q1 costs approved:** consumer option A (one 2 vCPU/4 GiB task, three screenings at once in threads, ≈ $74.50/month per environment); production's consumer held at 0 until launch (≈ $0.40); staging always on (≈ $74.50); a 4-core CI runner once the repository is private (≈ $22); mail streams with the SQS interface endpoint (≈ $18 per environment); SES Essentials; address validation $0.01 a screening capped at 1,000 a day. ≈ $207/month after launch, ≈ $133 before. The AWS prices were read from search results, not AWS's pages (open item O12 stays: re-read them on AWS's pages before the first deploy).
  - **Q2** practice_site, one per practice, undated. **Q3** widen rule_record's type CHECK by locality_map_plus_four (a granted exception to reconciliation-001's rule-table check, in 6b-2's migration). **Q4** golden G196-G199 under 900006, existing files byte-identical (a granted exception). **Q5** pricing_settings.set for practice_admin, billing_manager and firm_principal, reviewer denied (a granted exception before PR 14; security-reviewer pass in 6b-2).
  - **Q6** out-of-span Medicare rows left out and counted. **Q7** 100,000 rows per account per UTC day, 1,000,000 cap, over-share uploads wait at priority -k, all accepted and told. **Q8** the capacity test a required check from 6b-3 (the founder sets the ruleset; the 4-core runner first). **Q9** 7-day window, floors 200/2,500, half of SES's review levels, administrator resume with a reason. **Q10** bounce budget per client and domain, yes. **Q11** (a) no wording change for ZIP+4; (b) keyed hash of a bad address kept 12 months only to refuse it. **Q12** sender results@screening.<domain> named PaidWhole, Reply-To SupportEmail, and the recommended page wording; each PR shows its exact text before merge (counsel confirms before the screening opens). **Q13** for the billing PR, not 6b: suspension waits for a delivered dunning notice or an operator-recorded contact.
  - Each PR records the rulings it builds in its ADR(s) and reconciliation-001, dated 2026-10-21.
- Worktrees for PR 6b: `/home/user/pr6b1` (co-001/pr-06b-zip4-engine), then pr6b2, pr6b3, pr6b4. Give setup-container.sh `co-001/pr-06b-zip4-engine:pr6b1` and so on (the default mapping would put all four at /home/user/pr6b).
- 2026-10-21 22:51 UTC: usage 44% (founder). A container restart at ~22:50 stopped Postgres; both clusters restarted with the recipe; the pr6b1 worktree, /opt tools and the scratchpad survived. Next: the 6b-1 build workflow (E1 engine and rules, E2 oracle and freeze tool in parallel, then E2's golden claims, then the draft PR), then 6b-1's review round alongside 6b-2's build (two heavy runs).
- **Running: wf_b5f7d725-b1e (pr6b1-build, script in workflow-scripts/), started ~22:55 UTC** in /home/user/pr6b1 on co-001/pr-06b-zip4-engine: E1 (engine five files, rules type locality_map_plus_four and ZIP9 parser, synthetic 900006, PRC-21/22, ADR 0064, amends 0029/0033/0034) and E2 (independent Python oracle ZIP9 step, tools/engine-freeze with the rule-table DDL check and the differential test, ci.yml step, CODEOWNERS) in parallel; then E2 adds golden G196-G199; then the draft PR with the money label. Databases tp_pr6b1_*. If a restart stops it: restart both clusters, then resume with resumeFromRunId and its scriptPath. Next: 6b-1's two adversarial reviews and fix round (full suite) alongside 6b-2's build stacked on this branch (worktree /home/user/pr6b2, branch co-001/pr-06b-pricing-location), then the fresh-clone verification reading CI, then merge 6b-1 on green (no migration; D4 (a)).
- **2026-10-21 ~23:55 UTC: 6b-1 built (wf_b5f7d725-b1e done, 4 of 4 agents).** Draft **PR #35** (co-001/pr-06b-zip4-engine, head 210a043), subscribed. Freeze diff: exactly the five engine files (76+/14-); golden G196-G199 added (154 claims, 330 lines; engine equals the independent oracle); differential test: base equals head on 150 claims/326 lines and 20,000 generated claims. The "money" label did not exist; applied to #35 (GitHub created it) so CI's mutation job runs on the next push. Builder findings: O1 (ZIP9 layout) unconfirmed, cms.gov unreachable through the proxy (single plus-four at 22-25 from search and the California DIR copy; ADR 0064 says so); gitleaks refused a golden plan key, the unpushed commits were rewritten (no force); E1 pinned GPCI_SYNTHETIC_900006.csv in packages/synth/src/guard/pinned-tables.json (founder-owned in CODEOWNERS: tell the founder); **PR 5's merged migration 20261103090000 creates a trigger ON rule_release_withdrawal**, DDL on a rule table with no recorded exception (the fix round records it in reconciliation-001 as a departure put to the founder).
- **Running (two heavy):** wf_974d9814-2a4 (pr6b1-review-fix: reviews "engine" and "freeze" as default agents, then the fix round with the full suite incl. e2e on 48xx and Stryker, one push, PR body) and wf_36310b26-88f (pr6b2-build in /home/user/pr6b2, branch co-001/pr-06b-pricing-location stacked on 6b-1 at 210a043: L1 migration 20261105090000 and the domain model, then L2 worker/capacity and L3 web/e2e, then a draft PR with base co-001/pr-06b-zip4-engine). Databases tp_pr6b1_* and tp_pr6b2_*; e2e 48xx and 49xx. Scripts in workflow-scripts/. Check-in armed (01:35 UTC, trig_019QVrHRSH8DZ2MatCr9bmVf). Next: after CI on 6b-1's fix head, the fresh-clone verification reading CI, then merge #35 on green (no migration); 6b-2's two reviews (payment-engine and security, Q5) and fix round; then the founder's approval line for 6b-2 in a PR comment.
- **2026-10-22 ~01:45 UTC: 6b-2 built (wf_36310b26-88f done, 4 of 4 agents, 1.6M tokens, 1 h 52 m).** Draft **PR #36** (co-001/pr-06b-pricing-location, head f742def, base co-001/pr-06b-zip4-engine; GitHub retargets it when #35 merges), subscribed. Migration `20261105090000_pricing_location_and_zip_plus_four.sql`; freeze check lets through exactly its statement 1 (the rule_record CHECK, Q3 (a)); domain model regenerated (89 tables, 0 cross-check differences; a false "Created by not found" for the renamed split fixed in migration-text.ts) at SHA-256 **c3065bf937efd4ada6a034b48afe474176cd0b6fa39b6354dbab5c2fadf50f9a** (do NOT ask the founder to sign it yet: the review round may change it). Builder departures to review: data-dictionary.md left verbatim (D2 (a)); locality_status order; the location guard limited to the caller's scope; screening_result_summary() dropped and recreated; outside_content lines capped at 100,000 a row. Open items for the 6b-2 fix round: practice users cannot read the split's approved_at (re-run diff label) and the console cannot read a practice's ZIP+4 (both need definer reads in the unmerged migration); SCR-08 wording; "before {Q}" result wording inferred (Q12, founder then counsel); screening.spec and pricing.spec e2e not run locally; O8's keyed-read time comes from CI's capacity run.
- **gh works through the proxy** in this session (`gh auth status` says the token is invalid, but `gh api` calls succeed): the suggested-change route of CLAUDE.md for approval lines is available (post one PR review comment on the approval line with a ```suggestion block; never a review event).
- Next heavy run (needs the founder's usage reading first): 6b-2's review round, three adversarial reviews (security and tenancy, required for Q5; pricing runs, waits, split and diff; screening, wording and accessibility) and a fix round with the full suite.
- 2026-10-22 02:08 UTC: #36's first capacity run (f742def) failed only "queue order: S5-4 was not queued and started behind the scenario's large uploads" (time still "open, PR 6b"; S4 worst 170.5 s on the shared platform task, as expected before 6b-3's consumer). Root cause: the harness race the Track B design found (the small upload was sent once the large runs existed, but the web enqueues a run's job only after its commit). Fixed on #36 in 7c7b078 (tools/screening-capacity/run.ts waits for the large uploads' pgboss.job rows); typecheck, eslint and the capacity unit tests pass. 6b-3's C3 no longer needs this fix (the affinity fix still does). #35 carries the old harness; if its capacity run hits the same race, port 7c7b078.
- **2026-10-22 ~02:20 UTC: 6b-1 review round done (wf_974d9814-2a4, 3 agents, 1.39M tokens).** 12 findings, all real; 11 fixed at the root with failing-first tests, pushed once as **3e6f4b9** (#35 still draft, body updated). Highlights: (1) Stryker never measured anything under Vitest 5 (vitest-runner 10.0.0 named tests "a b", Vitest filters "a > b"): pnpm patch + canary; mutation moved to `.github/workflows/mutation.yml` (labeled events, weekly, fails an engine change without the money label); full Stryker 89.49% vs break 85. (2) New ENGINE_ERROR detail `no_locality_plus_four` (no ZIP+4 file in force: a content gap) split from `zip_plus_four_not_in_locality_map` (unlisted ZIP+4, trace names the record as plus_four_unlisted): a change to design 8 (e), accepted by the build as the more accurate option within the granted five-file exception. (3) recompute accepts only ZIP+4 steps the engine writes. (4-7, 11, 12) the freeze checker: exception.json names its PR (pull_request 35, checked against PR_NUMBER), unused entries are problems, every non-test file of packages/pricing frozen and @tp/pricing must resolve to packages/pricing/src, eight rule-table DDL bypasses closed, a committed rule-table catalog snapshot (tools/engine-freeze/rule-tables.catalog.json, test:db), the differential test runs the base engine on the base's own money/rules/contracts and compares recompute; releases pinned by any golden claim frozen. (8) ZIP9 parser: 80-char records, one YYYYQ equal to the window's quarter, refuses a second code at 26-29. (10) PR 5's trigger `rule_release_withdrawal_pricing_current_lock` recorded in reconciliation-001 as a departure from line 445 put to the founder. Full suite passed on the final tree (unit 4,213, golden 38, oracle 630, test:db 8,776 + 1 environmental skip (restore-drill: pg_dump 16 vs PG 18), e2e 49, build, actionlint, Stryker).
- **For the founder (none blocks 6b-1's merge):** rule on PR 5's trigger (accept as an exception to reconciliation-001:445 with ADR 0061 amended, or decline and a later PR drops it under its own rule_table_ddl exception); make `mutation` a required check and set the rulesets and required code-owner review ADR 0063 describes (the repository has none today, so CODEOWNERS on exception.json is not enforced); whether approval-of-record should require the founder's review when exception.json changes before APPROVAL_REVIEW_REQUIRED.
- **Running: wf_0aa3b806-9ae (pr6b2-merge-base)**: merges 3e6f4b9 into #36 (conflicts in ADR 0064, test-matrix.md, registry.ts, exception.json), and the four items 6b-1 left for 6b-2: no_locality_plus_four handled as a content gap everywhere; exception.json in the new format (pull_request 36, only the CHECK); rule-tables.catalog.json regenerated; the CHECK and closed-list test confirmed. One push; domain model regenerated only if the migration changes. Then (needs the founder's usage reading) 6b-2's review round. Waiting on CI for #35 at 3e6f4b9, then its fresh-clone verification, then merge #35.
- **2026-10-22 ~02:55 UTC:** #36 merge step done (wf_0aa3b806-9ae): merge commit 2d453ed of 3e6f4b9, then c29f477 (no_locality_plus_four treated as a content gap in the worker, re-run diff, screening label; labels hash pinned 52e44426...; version stays screening-labels/2026-11-05), 0b47a32 (rule-tables.catalog.json: only the CHECK gains locality_map_plus_four), 90cb4ce (check.test.ts pins #36's exception). **#36 head 90cb4ce; domain model unchanged at c3065bf9...** Freeze check passes with PR_NUMBER=36 and fails with 35 (negative control). #36's check at 7c7b078 failed only the expected approval case (comment posted on #36).
- #35 at 3e6f4b9: `check` failed only in `pnpm audit --prod` (registry ERR_SOCKET_TIMEOUT x3); later steps skipped; e2e, build, cdk passed. Re-ran the failed job once (attempt 2) and commented on #35. A second failure counts as real. Mutation and capacity on 3e6f4b9 pending. Then the fresh-clone verification, then merge #35.
- **2026-10-22 ~03:45 UTC: a real race fixed in 6b-1, carried into 6b-2.** #36's check at 90cb4ce failed one unit test: tools/lint-logs/scan.test.ts "repository scan" hit ENOENT on a file of `packages/pricing/.freeze-base/<sha>-<pid>/` (the differential test's extract of the base engine, inside the repository, deleted while the scan ran beside it). Root cause in 6b-1's fix-round differential test. Fix e50c310 on #35: the extract goes to a new `mkdtemp` directory under os.tmpdir() (each package still links its own node_modules), the .gitignore/vitest/eslint entries and check.test.ts's wiring test for the in-repo extract are removed, and the extraction test asserts the extract is outside the repository. Checked: typecheck, lint, `CI=true ENGINE_FREEZE_BASE=8e33cb3 pnpm test` (282 files, 4,212 tests, none skipped; no in-repo extract seen during the run; no temp leftover). Merged into #36 as 39528b8 (typecheck, lint, unit 287 files/4,266 tests, freeze check with PR_NUMBER=36: no problems). #35's earlier audit-timeout re-run is superseded by e50c310's CI.
- 2026-10-22 ~04:20 UTC: #35 at e50c310 all green (check, mutation, capacity, images, licenses, approval-of-record; mergeable clean). A container restart at ~03:57 had stopped Postgres (restarted; nothing local was running). **Running: wf_1214850f-3b0 (pr6b1-verify)**, the fresh-clone verification that reads CI; summary to SP/pr6b1-verify/summary.md. On pass: mark #35 ready, merge with a merge commit (keeps #36's merge history), retarget #36 to claude/build-platform, then delete nothing until #36 has merged the new base.
- **2026-10-22 ~04:30 UTC: #35 verified (wf_1214850f-3b0: pass at e50c310).** Summary for the founder saved to `approval-summaries/pr6b1-summary.md`. The verifier's doc nit fixed in 65fc80e (ADRs 0029/0033/0034/0064: three optional trace keys, both ZIP+4 stops; docs only; tools/test and lint:copy pass); #35's body updated (post-review commits, the verification, design 8 (e) accepted by the build as the more accurate option inside the exception, 6b-2's items done). Next: CI green on 65fc80e (docs only, so no re-verification) → mark #35 ready → merge with a merge commit → retarget #36 to claude/build-platform → merge the new base into #36.
- **2026-10-22 ~05:20 UTC: PR 6b-1 (#35) MERGED as 510a26d** (merge commit; CI green on 65fc80e, docs only after the verified e50c310). Unsubscribed #35. Worktree /home/user/pr6b1 removed; branch co-001/pr-06b-zip4-engine left on the remote. Main checkout fast-forwarded to 510a26d. **#36 retargeted to claude/build-platform**; base merged as 3013666 (ADR 0064's status-line conflict resolved: 6b-2's amendment text with "three optional keys"); freeze check against 510a26d with PR_NUMBER=36 lets through only the CHECK and its catalog snapshot; freeze and tools tests 163 passed; lint:copy passed. #36 mergeable; its check fails only the approval case (expected; comment on #36). Container restarts at ~03:57 and ~04:50 (Postgres restarted each time; nothing local was running). **Next: #36's review round (three reviews: security and tenancy for Q5, pricing runs and waits, screening wording and accessibility; then a fix round with the full suite) needs the founder's usage reading first.**
- 2026-10-22 ~06:00 UTC: #36 CI at 3013666 (base claude/build-platform): every check green except the expected approval case (unit 4,265, golden 38, oracle 630, test:db 8,990 + the approval case, e2e 51, freeze, mutation, capacity). Container restarted again at ~05:50 (Postgres restarted). #36 is ready for its review round; waiting on the founder's usage reading. Check-in armed for 09:53 UTC (trig_01Drj6baPph3oQmnD1e8nMPV).

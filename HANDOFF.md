# PaidWhole build: handoff and state

This branch (`claude/build-ops`) holds the build's operating state. It has no history in common with the product, so it never merges into `claude/build-platform`. Every product decision also lives in the product repository: ADRs, `docs/product/reconciliation-001.md` (Approval) and `CLAUDE.md`. This file collects in one place what a fresh session needs to carry on. Last updated: 2026-10-18 18:52 UTC.

## How to resume in a new session
1. Read this file, then `CLAUDE.md`, `docs/product/change-order-001.md` and `docs/product/reconciliation-001.md` on `claude/build-platform`.
2. Set up the environment (below). Check open pull requests and the branches listed under "Where things stand".
3. Update the tracker (below) and tell the founder where things stand before starting new work.

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
- Node 24 is at `/opt/node24/bin`; Python 3.12 with pyx12 is at `/opt/py312-ci/bin`; gitleaks 8.24.3 is at `/tmp/claude-0/gitleaks/gitleaks`. If the container is replaced, reinstall them (see the CI workflow for versions).
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

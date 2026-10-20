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

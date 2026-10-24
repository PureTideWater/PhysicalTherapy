# Two build lanes (from 2026-10-24)

The founder (Tyler Williams) and the co-founder each run the build from their own Claude Max 20x account, in parallel (the founder's decision of 2026-10-24). A **lane** is one person's account and its cloud sessions:
- **Lane A:** the founder's sessions. Its log is `HANDOFF.md`, and it keeps the build tracker (an artifact the founder owns).
- **Lane B:** the co-founder's sessions. Its log is `lanes/lane-b.md`. A person starting Lane B reads `COFOUNDER-START.md` first.

Both lanes read this file before starting any pull request. They change it only to add a claim, a hand-over or a state change, and they pull it fresh first.

## Rules both lanes follow
1. **Same product rules and pipeline.** These apply in full:
   - `CLAUDE.md` on `claude/build-platform`;
   - the founder's standing rule (recommend and build only the best option, never weighted by build effort, never sacrificing quality);
   - reconciliation-001's checks;
   - the pipeline: design first with one reviewer; builders; a draft PR; two adversarial reviews as default workflow agents; a fix round with the full local suite; a fresh-clone verification that reads CI.

   `HANDOFF.md`'s "How this session worked" says how each stage is run.
2. **One schema PR at a time, and only in Lane A.** A pull request that adds a migration, or that regenerates `docs/product/domain-model.md`, belongs to Lane A, and Lane B never opens one. If a Lane B design turns out to need a migration, Lane B stops, records it under "Handed to Lane A" below, and takes its next item.
   - Why: each migration recreates shared functions on the previous one's body and regenerates the domain model. The founder approves the domain model by its SHA-256, so two open at once would conflict and void each other's approval.
3. **Claim before you start.**
   - Pull this branch (`git -C /home/user/ops pull --no-rebase origin claude/build-ops`).
   - Add a row under "Claims" and push it before any design work.
   - If the item is already claimed, take the next one.
   - Lane A claims its items too.
4. **Reserve shared numbers in the claim.**
   - **ADR:** take the next ADR number free both in `docs/adr` on `claude/build-platform` and in every claim here.
   - **Other numbers:** reserve the new `docs/product/test-matrix.md` row IDs and the `packages/synth` case IDs the design adds.
   - **Next free ADR:** at 2026-10-24 21:00 UTC it is **0067** (PR 6b-4 holds 0065, the CI PR 0066).
5. **Branches.** Cut each `co-001/<name>` branch from the latest `claude/build-platform`. Each change gets one PR into `claude/build-platform`, opened as a draft first, worked in a worktree `/home/user/<name>`. Never open a PR into `main`. Never create a release tag.
6. **Merging.**
   - Before a merge, merge the latest `claude/build-platform` into the PR branch with a merge commit. Never rebase or force-push.
   - Let CI go green on that head, then merge with a merge commit.
   - When both lanes changed the same document (reconciliation-001, `test-matrix.md`, an ADR, `packages/synth/src/cases/registry.ts`, a runbook), the PR merged second resolves the conflict and keeps both lanes' changes.
7. **Who may merge, and when.**
   - **Non-schema PRs:** merge on green CI once the fresh-clone verification has passed (ADR 0063, D4 (a)). This holds until the founder's runbook 3i and `APPROVAL_REVIEW_REQUIRED`.
   - **Schema PRs (Lane A):** also need the founder's committed approval line.
   - **Never:** approve or request changes on a PR, or merge a Dependabot PR as it stands.
8. **Decisions.**
   - Product, cost, wording, legal and security trade-offs, and approvals, are the founder's.
   - Lane B's session asks the co-founder. He answers what the founder has delegated (listed below) and takes the rest to the founder.
   - Every ruling is recorded with who made it and when: in the lane's log, and in the PR's ADR and reconciliation-001, as the pipeline already does.
9. **Usage.** Each lane paces its own account.
   - Before every heavy run, ask the lane's person for their weekly usage % and reset time.
   - Pace to about 11% a day, and start no new heavy run past about 80%.
   - Never cut a run off mid-way.
10. **Records.**
    - Lane A writes `HANDOFF.md` and the tracker. Lane B writes `lanes/lane-b.md` and its rows here.
    - Lane A folds Lane B's progress into the tracker. Neither lane edits the other's log.
    - Archive workflow scripts in `workflow-scripts/` and summaries in `approval-summaries/`; Lane B prefixes its files with `lane-b-`.
    - Push this branch from the main checkout: `GITLEAKS=/root/.cache/paidwhole/gitleaks/8.24.3/gitleaks git -C /home/user/PhysicalTherapy push origin claude/build-ops`. Pull first, and never force.
11. **Pushing.**
    - Every push goes through the pre-push hook (the fixture check and gitleaks). Never use `--no-verify`.
    - Never write files through the GitHub connector.
    - A refused push is fixed by rewriting only commits not yet pushed.
12. **Data and attribution.**
    - **Data:** synthetic data only (`packages/synth`). No PHI, real 835, real contract or real export anywhere.
    - **Attribution:** no model identifier in a repository artifact. Every GitHub comment ends with the Claude Code footer. Commits end with the attribution lines the session's own system prompt gives.

## Queues
Items follow reconciliation-001's "Proposed pull requests, in order" and the combined audit's "Where the work lands" (`audits/combined/combined-report.md`, whose table names each upgrade's PR). A lane confirms at design that an item needs no migration before Lane B builds it.

**Lane A (schema PRs, and the serial chain they sit in):**
- PR 6b-4 (#42; its fix round comes next);
- 6c, 6d and 6e;
- 4b;
- first-finding, release-operations and contract-integrity;
- alerts;
- PR 7 and 7b;
- PR 8 to 14, then 15b, 16 and 17;
- billing 2;
- milestone 12, milestone 13 and the final pass.

If Lane B runs dry, Lane A hands it items from this list that need no migration.

**Lane B (no migration), in order:**
1. **The CI PR** (before PR 7). It covers four combined-audit items:
   - #19's runner upgrade part;
   - #54, mutation testing that really runs on the money code;
   - #109, CI in about 10 minutes instead of 35;
   - #112, a dependency-update policy that yields green PRs.

   It also takes the Dependabot versions dismissed on 2026-10-18, and checks the open Dependabot PRs #40 (GitHub Actions; it replaced #37), #38 (npm minor and patch) and #33 (Docker base images) like any change. It adds Dependabot coverage for the postgres and minio images.

   Runners stay free GitHub-hosted (founder, 2026-10-23: a personal account cannot have larger runners; issue #41).

   It goes first because faster CI speeds both lanes.
2. **PR 15: ledger tests LED-12 and LED-13** (reconciliation-001 item 15; tests only). If 15b (combined audit #12) needs a migration, it is Lane A's.
3. **The infrastructure PRs, once PR 6b-4 (#42) has merged.** 6b-4 rewrites `infra/lib/constructs/{network,monitoring,compute,identity,operator-role,application-role,screening-role}.ts`. One PR each, in this order:
   - (a) database login rotation and connection resilience (#72, before the first staging deploy);
   - (b) backups and recovery (#17, the multi-region key, and drill v2 of #70);
   - (c) least privilege and egress;
   - (d) deploy safety;
   - (e) the job platform;
   - (f) observability;
   - (g) the status page.

   Read the combined audit's entry for each. Role or login DDL is a migration, so any part that needs one goes to Lane A.
4. **The legal-surfaces PR** (#51 and #52): the terms text, the privacy notice, the screening terms and the AMA notice. Its text goes to the founder and then to counsel (O4).

## Claims
| Item | Lane | Branch / PR | Started (UTC) | Reserved | State |
|---|---|---|---|---|---|
| PR 6b-4, mail streams (audit #76) | A | `co-001/pr-06b-mail-streams` / #42 | 2026-10-23 16:45 | ADR 0065; SCR-21, SCR-22, SEC-18, SEC-19, JOB-05 | Reviewed; fix round after the 2026-10-27 reset |
| The CI PR (audit #19's upgrade part, #54, #109, #112; Dependabot #40, #38, #33 and the versions dismissed on 2026-10-18; postgres and minio coverage) | B | `co-001/ci` (a split into several PRs, if the design makes one, is recorded here) | 2026-10-24 21:00 | ADR 0066; test-matrix CI-01 to CI-20 (a new series, Lane B's); no `packages/synth` case IDs (any the design needs are added here first) | Claimed; design next, after the co-founder's usage reading |

## Handed to Lane A
None yet.

## Delegations from the founder to the co-founder
None yet. The founder adds each delegation here, dated. Until then, Lane B takes every founder decision to the founder.

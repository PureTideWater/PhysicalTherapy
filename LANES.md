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
   - **Screens:** every pull request that changes something a person sees takes the UX and brand review (`.claude/agents/ux-brand-reviewer.md`) as one of its two adversarial reviews, with before and after screenshots at 1280 px and 390 px (`tools/lane-b-screen-tour/README.md`, "From another lane"). Both lanes. (The founder's ruling, relayed by the co-founder, 2026-10-25 ~21:10 UTC; added by Lane A 2026-10-27.)
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
   - **Shared counters from 2026-10-27:** Lane A's orchestrator allocates them for both lanes until Lane B returns (Friday 2026-10-30 19:00 UTC), and records each in the claim row. At 2026-10-27 01:35 UTC the next free are **ADR 0085** (0078 to 0084 reserved below), **`packages/synth` module 21** (17 TBL, 18 DLR, 19 SGN, 20 HOM reserved below) and **fixture release 900008**.
5. **Branches.** Cut each `co-001/<name>` branch from the latest `claude/build-platform`. Each change gets one PR into `claude/build-platform`, opened as a draft first, worked in a worktree `/home/user/<name>`. Never open a PR into `main`. Never create a release tag.
6. **Merging.**
   - Before a merge, merge the latest `claude/build-platform` into the PR branch with a merge commit. Never rebase or force-push.
   - Let CI go green on that head, then merge with a merge commit.
   - When both lanes changed the same document (reconciliation-001, `test-matrix.md`, an ADR, `packages/synth/src/cases/registry.ts`, a runbook), the PR merged second resolves the conflict and keeps both lanes' changes.
   - Generated files (`pnpm-lock.yaml`, `tools/screening-capacity/watched-paths.txt`, `packages/db/functions/*.sql`) are never hand-merged or hand-edited. Each PR commits what its generator writes, and the PR merged second runs the generator again on the merged tree (`pnpm install`, `watched.ts --write`, `pnpm db:domain-model --out`). Added 2026-10-26 by Lane B, under the co-founder's Q2 of 2026-10-25.
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
- 6c, the engine corrections under one freeze exception: #2's window step, #3, #4 (two priced-line columns, so a migration), #5, #28, #105 and #110's calendar package. #110 moves the engine's own date code, so the engine freeze reads it as an engine change; it stays with 6c's single engine version bump.
- 6d: #1 (a remark-code table), with #23 and #14's interest basis, which change the same triage and must use 6c's sequestration basis;
- 6e;
- 4b: #13, #25, #26, #42, #43 and #104;
- first-finding: #34 and #35. #32 moved to Lane B.
- release-operations' load path: #8, with its impact-count table. #7, #30, #31 and #59 moved to Lane B.
- contract-integrity: #15, #21 and #80;
- alerts: #39 and #47;
- legal surfaces' tables: #51, with its legal-text table and version columns. Lane B keeps #52.
- PR 7 (its read functions make it a schema PR) and 7b (#41);
- PR 8 to 14 and PR 16;
- PR 17;
- billing 2: #58, #77, #78 and #79;
- the audit's other schema PRs: parse operations (#44), agreements (#50), the fee-schedule importer (#36), the reviewer queue (#40), Original Medicare pricing (#29), and #17's recovery-key column;
- milestone 12, milestone 13 and the final pass.

**Lane B (no migration), in the order they should land.** "Why no migration" quotes the item's "What it changes" line in `audits/combined/combined-report.md`.

"Not while #42 is open" means: leave alone every file PR 6b-4 changes, until it merges:
- the migrations, and `packages/db/src/{schema/*,row-factory.ts}`;
- `packages/observability/src/fields.ts`;
- in the worker: `apps/worker/src/{mail,platform/{mail-events,support-notices,wiring},billing/dunning,digest/job,screening/{job,thread,threads,message},jobs/platform,config,runtime,web-entries.test}.ts`;
- in the web: `apps/web/src/lib/{routes/{console,console-mail,index,practice,settings,registry.test},screening/*,http/rate-limit,monitoring/queries,legal-surfaces,server/{config,services}}.ts`, `apps/web/src/components/{help,shell,monitoring/display,screening/upload-form}.tsx`, and the screening, console mail, console support, support-access and users pages;
- in the infrastructure: `infra/lib/{mail,deploy-parameters,platform-stack}.ts` and `infra/lib/constructs/{application-role,compute,database,identity,mail-streams,monitoring,network,operator-role,screening-role}.ts`;
- `tools/screening-capacity/{run,report}.ts`;
- the runbooks `deploy-and-rollback.md` and `deliverability.md`, `docs/product/legal-surfaces.md`, and `docs/policies/data-retention.md`.

The shared documents (test-matrix, reconciliation-001, ADRs, the synth registry) follow rule 6. Every item is confirmed migration-free again at its design; a part that turns out to need a migration goes to Lane A under "Handed to Lane A".

1. **The CI series** (`designs/lane-b-ci.md`): ci-speed (#43, 9c57d2d) and ci-mutation (#44, de8f9b5) merged; ci-deps next, then ci-browser. Before PR 7.
2. **PR 15: ledger tests LED-12 and LED-13** (L1 (a)). Tests only. Merged as #45 (6ddd587).
3. **PR 15b: ledger amounts in payment terms (#12).** It lands beside PR 15, and before any ROI statement reaches a customer.
   - **Why no migration:** "Database: no new columns; the figures come from stored line data."
   - **Needs:** the ledger freeze exception, and the PRD 13 ruling on what "approved" means. Both are decisions the co-founder may answer (delegation of 2026-10-25). Payment-engine review.
   - **Not while #42 is open:** nothing of #42's. `packages/ledger` and `apps/worker/src/reconcile` are outside it.
4. **Readable database-function diffs (#111).** It lands before PR 8's migrations, and helps every Lane A schema review.
   - **Why no migration:** "Database: no schema change." It is tooling over the migrations; it never edits one.
   - **Not while #42 is open:** none of #42's migration or domain-model files. Run it on #42's migration only as a read-only check.
5. **A superseded re-run cannot be accepted (#10).** It lands before PR 8.
   - **Why no migration:** "Database: no." The check lives in the service. The optional mirror in the pricing-run trigger would be a migration, and it is not taken here; Lane A gets it if wanted.
   - **Not while #42 is open:** if the acceptance route sits in `apps/web/src/lib/routes/practice.ts`, change it only after #42 merges. The service code is free.
6. **The Verified seal claims only what it proves (#46).** It lands before PR 7's red team and before any ROI statement reaches a customer.
   - **Why no migration:** "Ledger: an added refusal reason on the report … Database: no."
   - **Wording:** the CO-11 and BRAND.md words are the co-founder's to approve (delegated).
   - **Not while #42 is open:** nothing of #42's. Its files are `components/brand/Verified.tsx`, the ROI pages and `apps/worker/src/report`.
7. **Every figure explained in words (#38).** It lands before the first audit packet is submitted.
   - **Why no migration:** "Database: no." It is a code-only renderer from the stored trace.
   - **Not while #42 is open:** nothing of #42's. It touches the packets, the packet review and the line-trace pages.
8. **The access log pages past the first (#49).**
   - **Why no migration:** "Database: no."
   - **Not while #42 is open:** its route is in `apps/web/src/lib/routes/settings.ts`, which #42 changes, so build it after #42 merges, or keep the change in the access-log page and its query.
9. **A narrative survives sign-out (#48).**
   - **Why no migration:** "Database: no." The draft is kept client-side and restored.
   - **Not while #42 is open:** nothing of #42's. It touches the packet pages and actions.
10. **One unmapped plan no longer freezes a whole month (#32)**, first-finding's no-migration part. It lands before PR 7, so its red team attacks it.
    - **Why no migration:** "Database: no."
    - **Needs:** the milestone 3 check's exception ("an unmapped plan blocks pricing"). The co-founder may rule it.
    - **Not while #42 is open:** nothing of #42's. It touches pricing-run planning and the mapping and coverage pages.
11. **Agent instructions any tool can read, and a ten-minute setup (#113).**
    - **Why no migration:** "Database: no." Docs and the setup path.
    - **Not while #42 is open:** nothing of #42's. Coordinate `CLAUDE.md` with ci-deps' template line.
12. **The model evaluation gate (#84) and the contract PHI check before the model (#120).** One PR or two, before PR 16 and before the first real-model baseline run.
    - **Why no migration:** both "Database: no."
    - **Not while #42 is open:** nothing of #42's. Both live in `packages/model-gateway` and the contract proposal path.
13. **The bank account shown first (#135).**
    - **Why no migration:** "Database: no."
    - **Not while #42 is open:** nothing of #42's. It touches `apps/web/src/lib/routes/billing.ts`, the billing pages and `components/billing`.
14. **Release content checks (#7, #30, #31, #59)**, release-operations' no-migration part. It lands before PR 7 (#7) and before release 1 is loaded. #8, the load path and its table, stays in Lane A.
    - **Why no migration:** #7, #30 and #59 say "Database: no", and #31 says "no DDL on rule tables".
    - **Needs:** #30 touches the frozen content pipeline, so it needs that check's exception (the co-founder may rule it).
    - **Not while #42 is open:** #59's alarms go in `infra/lib/constructs/monitoring.ts`, and its job's log fields in `fields.ts`. Land those after #42 merges, or split them out.
15. **The infrastructure PRs, after #42 merges**, one PR each:
    - (a) database login rotation and connection resilience (#72 and #116, "Database: no schema change"), before the first staging deploy;
    - (b) backups and recovery (#17's infrastructure, the multi-region key, drill v2 of #70). #17's recovery-key column is a migration, so it is Lane A's;
    - (c) least privilege and egress, with the staging endpoints in one zone and ARM tasks (#136, "Database: no");
    - (d) deploy safety, with the release hardening of #67 ("Database: no"; after the CI series, which also changes the Dockerfiles);
    - (e) the job platform (#73, "Database: no");
    - (f) observability (#75, "Database: no");
    - (g) the status page;
    - (h) the write-once packets bucket (#45, "Database: no"), before PR 8 and PR 12.

    Each changes the constructs #42 rewrites, so none starts before it merges.
16. **After #42 merges, small PRs**, each touching #42's files:
    - raw error messages kept out of the job queue table and the web logs (#115, "Database: no"; it overlaps #42's review nit on `digest/job.ts` and `worker.ts`);
    - missed days in the write-once audit copy (#117, "Database: no"; its job is wired in `platform/wiring.ts`);
    - the guard on the web-worker boundary (#137, "Database: no"; it extends #42's `web-entries.test.ts`);
    - the claims and lines page (#107, "Database: none unless the volume test needs a column", and then that column is Lane A's).
17. **The AMA notice and the CPT records (#52)**, legal surfaces' no-migration part, before the screening opens publicly.
    - **Why no migration:** "Database: no."
    - **Not while #42 is open:** it changes `apps/web/src/lib/legal-surfaces.ts` and `docs/product/legal-surfaces.md`, which #42 changes, so it lands after #42 merges. The legal text's sign-off before counsel stays the founder's.
18. **A code formatter (#138)**, "after PR 6b, before PR 7 branches".
    - **Why no migration:** "Database: no."
    - **When:** it reformats every file, so it lands only while no PR is open in either lane, by agreement between the lanes.
19. **The AI statement, code-checked (#122)**, after PR 16 (or in the final pass).
    - **Why no migration:** "Database: no."
    - **Needs:** PRD 16's table gains a row, which the co-founder may approve.

## Claims
| Item | Lane | Branch / PR | Started (UTC) | Reserved | State |
|---|---|---|---|---|---|
| PR 6b-4, mail streams (audit #76) | A | `co-001/pr-06b-mail-streams` / #42 | 2026-10-23 16:45 | ADR 0065; SCR-21, SCR-22, SEC-18, SEC-19, JOB-05 | Reviewed; fix round after the 2026-10-27 reset |
| The CI PR (audit #19's upgrade part, #54, #109, #112; Dependabot #40 and #33 (open), #38 (closed by Dependabot 2026-10-25 18:57 UTC; its versions still come in through ci-deps) and the versions dismissed on 2026-10-18; postgres and minio coverage) | B | Four PRs, in merge order (`designs/lane-b-ci.md`): `co-001/ci-speed` (#109), `co-001/ci-deps` (#112), `co-001/ci-browser` (#19), `co-001/ci-mutation` (#54) | 2026-10-24 21:00 | ADR 0066 (one ADR, a part per PR); test-matrix CI-01 to CI-20 (a new series, Lane B's: ci-speed CI-01 to CI-10, ci-deps CI-11 to CI-14, ci-mutation CI-15 to CI-17, ci-browser CI-18 to CI-20); `packages/synth` cases CI-01 to CI-20 (a new module CI, the same IDs) | Handoff state at 2026-10-26 ~10:40 UTC; see lanes/lane-b.md "Start here". ci-speed merged as #43 (9c57d2d), ci-mutation as #44 (de8f9b5). ci-deps: **merged as #48 (e908c21, 2026-10-26 21:06 UTC)**; the founder's settings in `designs/lane-b-settings-after-ci-deps.md` are now due. ci-browser: `co-001/ci-browser` pushed at 8b38f48 (phase 1), stopped until ci-deps merges. Status `approval-summaries/lane-b-ci-deps-status.md` **Continued from 2026-10-27 as a Lane B item by Lane A's orchestrator (session_01TrKDxeLbxVo7t7zwRXFzrg), in a parallel session of its own; the session is named in lanes/lane-b.md.** ci-browser first (merge e908c21, then phase 2), then P1, P2 and P4 in the same session. |
| CI follow-ups from ci-deps' re-read (design §3.2.6): P1, action pins and image digests held to the three-day floor; P2, trivy's version pinned to the latest, with a hijacked-tag check; P4, a narrower mutation trigger for root-manifest changes; P5, one catalog line for repeated package ranges | B | `co-001/ci-pin-age`, `co-001/ci-trivy-version`, `co-001/ci-mutation-trigger`, `co-001/ci-catalog` (one PR each) | 2026-10-26 00:55 | ADR 0066, a new part each; test-matrix and `packages/synth` CI-21 to CI-29 | Handoff state at 2026-10-26 ~10:40 UTC; see lanes/lane-b.md "Start here". P1, P2 and P4 designed and reviewed (`designs/lane-b-ci/follow-up-p1-pin-age.md`, `-p2-trivy-version.md`, `-p4-*.md`), not built; P5 waits for #42 and ci-browser. Test-matrix CI-21 to CI-29 |
| PR 15, ledger tests LED-12 and LED-13 (reconciliation-001 item 15; CO-09; tests only) | B | `co-001/pr-15-ledger-tests` / #45 (merged) | 2026-10-25 01:15 | No ADR expected (one is reserved here first if the design needs it); test-matrix LED-12 and LED-13 (named by CO-09); `packages/synth` cases LED-12 (its new fixture) and LED-13 (a no-file registry entry) | L1 ruled (a) by the founder, relayed by the co-founder, 2026-10-25 ~02:05 UTC: the ledger as frozen, LED-12 restated (`designs/lane-b-pr15-ledger-tests.md`). Tests only, no migration, no ADR. Merged as #45 (6ddd587, 2026-10-25 ~20:05 UTC) after its fresh-clone verification; the row's wording approved by the co-founder (reconciliation-001 item 15) |
| UX/UI and brand baseline review, then the reviewer checklist (the co-founder, 2026-10-25) | B | None for the review; `co-001/ux-brand-reviewer` for the checklist PR | 2026-10-25 20:50 | No ADR expected (one is reserved here first if the design needs it); no test-matrix or `packages/synth` IDs | **Review:** capture done (857 shots; galleries in lanes/lane-b.md); 11 reviewers done (335 raw findings, 208 problems after clustering); the synthesis `designs/lane-b-ux-review.md` done (208 findings: 16 blocking, 121 should fix, 71 polish; 91 PRs in landing order, `designs/lane-b-ux-review/synthesis/prs.json`). **Checklist: merged as #55 (6070e41, 2026-10-26 10:30 UTC)** after two adversarial reviews (41 findings, all fixed), the documentation-only suite and a fresh-clone check reading CI. Changes no product code; brief `designs/lane-b-ux-review-brief.md` |
| PR 15b: ledger amounts in payment terms (#12; queue item 3) | B | `co-001/pr-15b-ledger-payment-terms` | 2026-10-25 23:55 | ADR 0067; test-matrix LED-14 to LED-18; `packages/synth` cases LED-14 to LED-18 | Handoff state at 2026-10-26 ~10:40 UTC; see lanes/lane-b.md "Start here". **Merged as #51 (c355633, 2026-10-26 12:41 UTC).** Status `approval-summaries/lane-b-pr15b-status.md` |
| Readable database-function diffs (#111; queue item 4) | B | `co-001/db-function-diffs` | 2026-10-25 23:55 | ADR 0068 if the design needs one; test-matrix DBF-01 to DBF-05 (a new series, Lane B's); `packages/synth` cases DBF-01 to DBF-05 (no-file registry entries; the fixtures test needs one per matrix row; reservation widened 2026-10-26 ~00:30 UTC), synth module number 13 | **Merged as #46 (4d99df8, 2026-10-26 04:37 UTC)** after its fresh-clone verification, every required check green on 15b1abd (the base, c5195ee, merged in; both lanes' synth module entries kept). Proposals queued: I2, CI renders the summary from the base ref (its own PR); a protect-content.sh guard and a CLAUDE.md Never line for `packages/db/functions` (the founder's); a sentence in Appendix C's introduction (Lane A, at its next regeneration). Status in `approval-summaries/lane-b-db-function-diffs-status.md` |
| A superseded re-run cannot be accepted (#10; queue item 5) | B | `co-001/superseded-rerun` | 2026-10-25 23:55 | ADR 0069 if the design needs one; test-matrix PRC-25 to PRC-28; `packages/synth` cases PRC-25 to PRC-28 if it needs fixtures | Handoff state at 2026-10-26 ~10:40 UTC; see lanes/lane-b.md "Start here". **Merged as #50 (9d3ab33, 2026-10-26 11:06 UTC).** Status `approval-summaries/lane-b-superseded-rerun-status.md` |
| The model evaluation gate (#84) and the contract PHI check before the model (#120) (queue item 12) | B | `co-001/model-eval-gate` (#84), then `co-001/contract-phi-check` (#120) | 2026-10-25 23:55 | ADR 0070 (Parts 1-3); test-matrix MOD-07 to MOD-12; `packages/synth` cases MOD-07 to MOD-12 if it needs fixtures | **#84 merged as #53 (88a0e4e, 2026-10-26 09:50 UTC)** after its fresh-clone verification, every required check green on f8e0bb1. #120 (`co-001/contract-phi-check`, ADR 0070 Part 3, MOD-12): stopped at a clean point, pushed at d7447ad, no PR (the builders' work; the integrator, suite and PR pipeline remain). A parallel Lane B session; status in `approval-summaries/lane-b-model-eval-gate-status.md` **Continued from 2026-10-27 as a Lane B item by Lane A's orchestrator (session_01TrKDxeLbxVo7t7zwRXFzrg), in a parallel session of its own; the session is named in lanes/lane-b.md.** #120 (`co-001/contract-phi-check`): integrator, full suite and the PR pipeline. Then, in the same session, #32's build (the row below; its numbers already reserved). |
| Release content checks (#7, #30, #31, #59; queue item 14) | B | `co-001/release-content-checks` (its #42-file parts in a later PR after #42 merges) | 2026-10-25 23:58 | ADR 0071 if the design needs one; test-matrix RCC-01 to RCC-08 (a new series, Lane B's); `packages/synth` cases RCC-01 to RCC-08, synth module number 14; fixture release 900007; synthetic scale release 900110 (generated by the weekly release-capacity test outside the repository; claimed 2026-10-26 ~05:25) | Handoff state at 2026-10-26 ~10:40 UTC; see lanes/lane-b.md "Start here". **Merged as #49 (d725977, 2026-10-26 14:25 UTC).** The #42-file parts wait for #42 (status file, "Split for after #42 merges"). Status `approval-summaries/lane-b-release-content-checks-status.md` |
| Every figure explained in words (#38; queue item 7), then a narrative survives sign-out (#48; queue item 9) | B | `co-001/figures-in-words`, then `co-001/narrative-draft` (one session, one after the other) | 2026-10-26 00:35 | ADR 0072 (#38) and ADR 0076 (#48; reserved 2026-10-26 ~01:20 UTC); test-matrix CAS-30 to CAS-34 (#38) and CAS-35 to CAS-37 (#48); `packages/synth` cases the same | Handoff state at 2026-10-26 ~10:40 UTC; see lanes/lane-b.md "Start here". #38: **merged as #52 (3486f75, 2026-10-26 11:41 UTC).** #48 (narrative draft): designed and reviewed (`designs/lane-b-narrative-draft.md`), not started. Status `approval-summaries/lane-b-figures-in-words-status.md` |
| The bank account shown first (#135; queue item 13) | B | `co-001/bank-account-first` | 2026-10-26 00:35 | ADR 0073 if the design needs one; test-matrix BIL-01 to BIL-04 (a new series, Lane B's); `packages/synth` cases BIL-01 to BIL-04, synth module number 15 | **Merged as #47 (c5195ee, 2026-10-26 ~03:58 UTC)** after its fresh-clone verification, every required check green. Its proposal, to show a bank account still waiting on Stripe's micro-deposits on later visits, is queued under "improve as you go". Status in `approval-summaries/lane-b-bank-account-first-status.md` |
| **Materiality settings show stored cents as dollars** (a money bug the UX baseline review found, 2026-10-26: Settings → Defaults shows $5.00 as "$500" and pre-fills the dollar fields with cents, so saving it unchanged raises both thresholds 100-fold) | B | `co-001/materiality-cents` | 2026-10-26 04:20 | No ADR expected; test-matrix CAS-38 to CAS-39; `packages/synth` cases CAS-38 to CAS-39 | **Merged as #54 (7ef421b, 2026-10-26 08:56 UTC).** Claimed under "improve as you go", ahead of the review's other PRs because it is a money defect. Run by the #135 session (session_01SbDNvf4ojucLA3uyPfs1FC); status `approval-summaries/lane-b-materiality-cents-status.md` |
| **Forms keep what the person typed, and name the refused field** (the UX baseline review's first PR, 2026-10-26: every `ActionForm` resets its fields when the server refuses it, found by six of the eleven reviewers; field errors named by code key, marked on Input only, the summary below the fields, focus dropped) | B | `co-001/ux-forms` | 2026-10-26 04:35 | ADR 0077 if the design needs one; test-matrix FRM-01 to FRM-08 (a new series, Lane B's); `packages/synth` cases FRM-01 to FRM-08 (no-file entries), synth module number 16 (allocated 09:27) | Handoff state at 2026-10-26 ~10:40 UTC; see lanes/lane-b.md "Start here". Stopped at a clean point: `co-001/ux-forms` pushed at 17bbb70, no PR. Slice A waits for #50, C1 and C2 for #51 and #52. Design `designs/lane-b-ux-forms.md`; status `approval-summaries/lane-b-ux-forms-status.md` **Continued from 2026-10-27 as a Lane B item by Lane A's orchestrator (session_01TrKDxeLbxVo7t7zwRXFzrg), in a parallel session of its own; the session is named in lanes/lane-b.md.** Then, in the same session, the UX review's PR 6 (`co-001/ux-sign-in-time`) and PR 7 (`co-001/ux-sign-in-recovery`), which share its sign-in files. Reserved for PR 6 and PR 7: ADR 0081 if needed (shared); test-matrix SGN-01 to SGN-04 (PR 6) and SGN-05 to SGN-08 (PR 7), a new series; synth module 19 (SGN) if needed; status files `lane-b-ux-sign-in-time-status.md` and `lane-b-ux-sign-in-recovery-status.md`. |
| **A suspended organization never reads "In good standing"** (the UX baseline review's PR 2, UX-004: the billing page says "In good standing" above "New runs have stopped", with no reason or next step) | B | `co-001/ux-suspended-standing` | 2026-10-26 09:27 | No ADR expected; test-matrix BIL-05 to BIL-06; `packages/synth` cases BIL-05 to BIL-06 if fixtures are needed (module 15) | Handoff state at 2026-10-26 ~10:40 UTC; see lanes/lane-b.md "Start here". **Merged as #56 (0e28f9b, 2026-10-26 12:11 UTC).** The stored suspension reason and the console's reason form are Lane A's (a migration; `lib/routes/console.ts` is a #42 file). Status `approval-summaries/lane-b-ux-suspended-standing-status.md` |
| The Verified seal claims only what it proves (#46; queue item 6) | B | `co-001/verified-seal` | 2026-10-26 00:35 | ADR 0074 if the design needs one; test-matrix LED-19 to LED-22; `packages/synth` cases LED-19 to LED-22 | Handoff state at 2026-10-26 ~10:40 UTC; see lanes/lane-b.md "Start here". Queued, not started (15b's session stopped after #51). Status `approval-summaries/lane-b-verified-seal-status.md` if it exists |
| One unmapped plan no longer freezes a whole month (#32; queue item 10) | B | `co-001/unmapped-plan` | 2026-10-26 00:35 | ADR 0075 if the design needs one; test-matrix MAP-06 to MAP-10 and PRC-29 to PRC-31; `packages/synth` cases the same | Handoff state at 2026-10-26 ~10:40 UTC; see lanes/lane-b.md "Start here". Designed, reviewed and revised (`designs/lane-b-unmapped-plan.md`; no migration), not built. The stored notice and email are Lane A's. Status `approval-summaries/lane-b-unmapped-plan-status.md` |
| **Every table scrolls by keyboard and shows that it scrolls; phones get one stacked-row layout** (the UX review's PR 3, `co-001/ux-table-scroll`; UX-011, UX-079), then **the screening result reads on a phone** (PR 4, `co-001/ux-screening-result-tables`, which builds on PR 3's `ScrollTable` and stacked-row primitive) | B (run by Lane A's orchestrator) | `co-001/ux-table-scroll`, then `co-001/ux-screening-result-tables` (one session, one after the other) | 2026-10-27 01:35 | ADR 0078 if the design needs one (shared by both PRs); test-matrix TBL-01 to TBL-04 (PR 3) and TBL-05 to TBL-08 (PR 4), a new series; `packages/synth` cases the same if needed, synth module number 17 (TBL) | Running in session_019VghcxKzP9LAj3WK8k6u1D (started 2026-10-27 01:40 UTC). Status `approval-summaries/lane-b-ux-table-scroll-status.md` |
| **A refused download comes back to its form, never a JSON page** (the UX review's PR 5, `co-001/ux-download-refusals`; UX-010), then **one actionable figure on the home and the ROI statement** (PR 9, `co-001/ux-home-figures`) | B (run by Lane A's orchestrator) | `co-001/ux-download-refusals`, then `co-001/ux-home-figures` (one session, one after the other) | 2026-10-27 01:35 | ADR 0079 if the design needs one; test-matrix DLR-01 to DLR-04, a new series; `packages/synth` cases the same if needed, synth module number 18 (DLR). PR 9: ADR 0082 if needed; test-matrix HOM-01 to HOM-04, a new series; synth module 20 (HOM) if needed | Running in session_01L3tN5LCq2aNYetEQBNJYZg (started 2026-10-27 01:40 UTC). Status `approval-summaries/lane-b-ux-download-refusals-status.md`, then `lane-b-ux-home-figures-status.md` |
| **Three flaky tests that can fail any PR's `unit` job** (found by #120's CI on #75, 2026-10-27: `tools/test/workflows.test.ts:880` at vitest's 5 s default; `apps/worker/src/price/rerun-rule.property.test.ts:233-253`'s unseeded coverage check; `packages/packets/src/verifier.test.ts:384`'s `fc.pre`), with a sweep for their siblings; tests only | B (run by Lane A's orchestrator) | `co-001/test-flakes` | 2026-10-27 14:35 | No ADR expected; no test-matrix IDs (tests only) | Claimed; session starting. Status `approval-summaries/lane-b-test-flakes-status.md` |
| **SS-01: a suspended firm's granted practices still run** (blocking; handed to Lane A by #56, 2026-10-26) | A | `co-001/ss-01-suspension-refusal` (a schema PR; opened only after #42 merges) | 2026-10-27 01:35 | ADR 0080 if the design needs one; test-matrix BIL-07 to BIL-10; `packages/synth` cases the same if needed (module 15) | Claimed; design running (wf_5f09e0bd-311) while #42's fix round runs |
| **SUITE-CAP-1: triage at real size runs out of shared memory** (one advisory lock per line in `line_status_rules()`; handed to Lane A by #49, 2026-10-26) | A | `co-001/suite-cap-1-triage-locks` (a schema PR if the design needs a migration; after SS-01 in the chain) | 2026-10-27 01:45 | ADR 0083 if the design needs one; test-matrix CAS-40 to CAS-42; `packages/synth` cases the same if needed (module 5); fixture release 900008 only if needed | Claimed; design running (wf_5f09e0bd-311) |
| **Interest credited twice** (AMT I and PLB L6 both credited; with 15b's ledger items N1, the `ledger_match` sequence and the `superseded_by_claim_id` index if the design keeps them together; handed to Lane A by #51, 2026-10-26) | A | `co-001/ledger-interest-once` (after the founder's ledger freeze exception) | 2026-10-27 01:45 | ADR 0084 if the design needs one; test-matrix LED-23 to LED-25; `packages/synth` cases the same (module 6); fixture release 900008 only if needed | Claimed; design running (wf_5f09e0bd-311); the build waits for the founder's freeze exception |

## Handed to Lane A
- **2026-10-25, from Lane B's ci-mutation (PR #44) review: four defects of the frozen pricing engine, for PR 6c** (engine corrections under one freeze exception). Lane B changes no engine code; the tests pin today's behaviour, named as current behaviour and a known defect, so 6c flips them. Detail in `approval-summaries/lane-b-ci-mutation-fix-fa.md` and `lane-b-ci-mutation-fix-suite.md`:
  1. `price` sorts a claim's lines by `a.lineNo - b.lineNo` before `validateFacts`, so a NaN line number leaves the order to the sort (V8 keeps [3, NaN, 1]). Validate line numbers first, or use a total comparator.
  2. A year basis the engine cannot read as `LOCKED:<four digits>` prices at the records in force, as CURRENT does. This is a money-path defect and a founder question: it should stop the line. Also, `YearBasis`'s `` `LOCKED:${number}` `` is wider than the contracts schema.
  3. A two-digit place of service reads an inherited `placeOfServiceSettings` key: `validSettings` checks own keys, but the lookup reads through the prototype.
  4. An unknown rounding rule stops with ENGINE_ERROR detail 'unexpected', where it should have a detail of its own.
  - **Also for 6c:** a new pricing source file needs its shard in `stryker/shards.json`; the mutation gate fails a shard report that leaves a held file out.

- **2026-10-25, from Lane B: a timing flake in the screening journey, for #42's fix round** (#42 changes `apps/web/e2e/screening.spec.ts`, so Lane B does not edit it).
  - **What failed:** the push run on 6ddd587 (ci 40229005858, first attempt, job 121276766373). `apps/web/e2e/screening.spec.ts:135` (SCR-01 to SCR-07, SCR-18) failed at `:339`: the outcome's stage read `priced` where the test expects `accepted`. The upload row read just before had asserted `accepted`, so the consumer priced the upload between the test's two reads.
  - **Its retry could not recover.** It failed at `e2e/helpers.ts:87`, because the first attempt had already registered the platform administrator's hardware key.
  - **A flake, not this tree.** The same tree passed on f4d125b (ci 40226881568), and the failed job's one re-run passed (attempt 2, job 121281840873).
  - **Fix:**
    - read the outcome only after the consumer has finished, or assert either stage;
    - make the key registration safe to retry.
  - Until then, a Lane B head that fails only this test gets one re-run of the failed job, and never merges red.

- **2026-10-25, from Lane B: Lane A's screen-changing PRs take the same UX and brand reviewer (the co-founder, acting for the founder, 2026-10-25 ~21:10 UTC).** Add to LANES.md rule 1, for both lanes: every pull request that changes something a person sees takes the UX and brand review (`.claude/agents/ux-brand-reviewer.md`, once Lane B's checklist PR merges) as one of its two adversarial reviews, with before and after screenshots at 1280 px and 390 px. Lane B does not edit LANES.md's rules; Lane A makes this change.
  - **The checklist:** PR #55 (`co-001/ux-brand-reviewer`) adds `.claude/agents/ux-brand-reviewer.md`, and the PR template's reviewer comment names it.
  - **How a Lane A session takes the shots:** `tools/lane-b-screen-tour/README.md` on `claude/build-ops`, section "From another lane". It covers the prerequisites, one check command, the sample a PR must show, the tiling script (`tile.py`), and the rule that either lane adds a route's `cap(...)` calls.
  - **For Lane A's PR 7 (#103):** once PR 7's generated WCAG 2.2 check lands, the checklist's CI paragraph ("axe's WCAG 2.1 rules where journeys go") goes stale. Keep one list of the WCAG 2.2 manual checks, either the checklist's Accessibility bullet or PR 7's list, with the other pointing to it. Add tagged PDFs to the checklist's print bullet when PR 7 tags them.

- **2026-10-26, from Lane B's #111 (readable database-function diffs, `co-001/db-function-diffs`): one coordination step for #42 and every migration PR; no decision needed.**
  - **What it adds:** `pnpm db:domain-model --out` will also write `packages/db/functions/<name>.sql`, one file per database function. The db job and the domain-model job's `--check` fail when those files are out of date. The domain model's text and hash do not change.
  - **For #42:** #111 merged first (PR #46, 4d99df8, 2026-10-26 04:37 UTC). So #42's next `--out`, after it merges the base, writes its function files too: at 13f59b1 that is 45 files (35 added, 3 removed, 7 changed). Commit them before the founder signs #42's approval line, because a commit after their approval dismisses it.
  - **From now on, every migration PR** commits its regenerated `packages/db/functions` files in the same PR, before the founder signs. Its description carries `pnpm db:domain-model --summary-since origin/<base> --function-diffs list`.
  - **At Lane A's next regeneration:** one sentence in Appendix C's introduction pointing to the function files (proposed by #111's session).
  - Design: `designs/lane-b-db-function-diffs.md`. Status: `approval-summaries/lane-b-db-function-diffs-status.md`.

- **2026-10-26, from Lane B's PR 15b design (#12): the case close "payer corrected; balance is the patient's" needs a stored value, so a migration, for Lane A.**
  - **Proposed:** the reconcile job writes a case-line close when a correction's payment increase is zero because the patient's share took it (PR-1, PR-2, PR-3). The close leaves the actionable total, and a case state is derived from it; `deriveCaseState` mirrors it. It is not a write-off.
  - **Where:** with PR 8's case schema, beside #11. It needs DDL on case and case_line (the CHECKs at migration 20261019160000 :166, :194, :213).
  - **Until then,** 15b records the outcome as an "approved" match with no entry and no response, and shows the words from stored rows. The migration makes the case close.
  - Design: `designs/lane-b-pr15b.md` §0.5. Status: `approval-summaries/lane-b-pr15b-status.md`.

- **2026-10-26, from Lane B's model evaluation gate and contract PHI check (#84, #120; `designs/lane-b-model-eval-gate.md`): two proposals that need migrations, for Lane A.**
  - **F3, #120's best option:** compact lookup hashes for the member ID, the patient control number and the payer claim number, with a SECURITY DEFINER screen function, so a contract proposal can be checked for identifiers without scanning raw values. Until it lands, Lane B's PR refuses fail-closed above 50,000 identifiers.
  - **F4:** a reviewed correction of a document's kind (a stored, approved change, not an overwrite).
  - Status: `approval-summaries/lane-b-model-eval-gate-status.md`.

- **2026-10-26, from Lane B's release content checks (#59): a migration for the later PR's daily `content_due` platform job, for Lane A.**
  - **What it adds:** `operator_content_coverage()`, SECURITY DEFINER with `search_path` pinned and EXECUTE to `tp_operator` only. It returns the release in force and, per content, the date multirange of its windows, the newest `effective_from` and the newest source retrieved date. It returns no key, value or quote.
  - **Why a migration:** platform jobs run as `tp_operator`, which has no grant on rule objects, and a GRANT on `rule_record` would be DDL on a rule table. So #59's "Database: no" holds for Lane B's PR, but not for the daily job.
  - Status: `approval-summaries/lane-b-release-content-checks-status.md`.
- **2026-10-26, from Lane B's materiality cents (#54, merged as 7ef421b): two steps in a #42 file, for Lane A after #42 merges; no migration.**
  - **`apps/web/src/lib/routes/settings.ts` adopts the shared money-input helper.** #54 added `dollarsField` and `dollarsForInput`, now used by Settings → Defaults, the cases page, the workbench, the console's practice settings and the model budget. It left `settings.ts` alone because the file is in #42. Its materiality save should take `dollarsField` too, so every dollar field parses one way.
  - **One limit for amounts.** The stores accept 12 digits of cents, but `settings.ts`'s save takes 11 (`\d{1,9}(\.\d{1,2})?`). The fix is the same helper, with the stores' limit.
  - Status: `approval-summaries/lane-b-materiality-cents-status.md`.
- **2026-10-26, from Lane B's model evaluation gate (#84, PR #53): one line in a #42 file, for #42's next base merge; no decision needed.**
  - **The change:** `infra/test/compute.test.ts` pins the permitted CLI's call. #53 changes the pinned call from `readGatewayConfig()` to `readGatewayConfig(process.env, { serving: 'evaluable' })`, because the default now refuses to serve in production until a feature passes the gate.
  - **For #42:** `git merge-tree` of #53's head with #42's head 13f59b1 merges the file cleanly (#42 edits other hunks). Whichever merges second keeps both and re-runs the test (rule 6, under the co-founder's Q2 precedent for #42-shared files; allowed by the orchestrator, 2026-10-26 09:48 UTC).
  - Status: `approval-summaries/lane-b-model-eval-gate-status.md`.
- **2026-10-26, from Lane B's #32 design (one unmapped plan no longer freezes a month; `designs/lane-b-unmapped-plan.md`): the billing managers' stored notice and email, for Lane A.**
  - **What it needs:** audit #32 names a stored notice and an email to billing managers when a month waits on an unmapped plan. That takes a migration (a notification kind, two figure codes, and a recipients function that selects billing managers) and #42's mail files.
  - **What Lane B does now:** the no-migration PR (ADR 0075; test-matrix MAP-06 to MAP-09 and PRC-29 to PRC-31). MAP-10 stays reserved for the Lane B follow-up after #42 and this migration merge.
  - Status: `approval-summaries/lane-b-unmapped-plan-status.md`.

- **2026-10-26, from Lane B's #38 (every figure explained in words, merged as #52, 3486f75): four proposals for Lane A, none needed for #52.**
  - **Migrations:**
    - a `words_changed` export failure code;
    - the stored words version the approver saw (columns on `packet_version`);
    - optionally, a stored worksheet.
  - **A #42 file:** a refused-job record in `apps/worker/src/worker.ts`.
  - **A code-owned PR:** four payment-engine-reviewer checklist lines.
  - Details: `approval-summaries/lane-b-figures-in-words-status.md`. #48's narrative draft is designed (`designs/lane-b-narrative-draft.md`, ADR 0076, CAS-35 to CAS-37), not started.

- **2026-10-26, from Lane B's UX PR 2 (`co-001/ux-suspended-standing`, merged as #56, 0e28f9b): one blocking product defect and three follow-ups, for Lane A.**
  - **Blocking (SS-01):** a firm's suspension refuses no runs on its granted practices. #56 fixed only what the page says. The refusal needs a migration to `organization_run_refusal` and `practice_run_refusal`, and the console card's claim changes with it.
  - **Follow-ups:**
    - the stored suspension reason, note and time, and the console's reason form (a migration; `lib/routes/console.ts` is #42's);
    - the database refusal's words ("PaidWhole", not "a platform administrator");
    - #42's `apps/worker/src/billing/dunning.ts` sends "New runs have started again" while PaidWhole's suspension lasts (SS-08).
  - **If wanted:** a way to reopen a closed organization (none exists, so #56 promises none).
  - Status: `approval-summaries/lane-b-ux-suspended-standing-status.md`.

- **2026-10-26, from Lane B's release content checks (#49), found by its real-size test (audit #31's point): SUITE-CAP-1, a capacity defect, for Lane A.**
  - **What fails:** under the quarterly scale release 900110 (4.17 M records), a large practice's month (100,000 lines) prices within the worker task (peak 804 MiB of 1,024, no restarts). But its triage fails, and so does the audit report that triages inline: Postgres 53200 "out of shared memory".
  - **Why:** `line_status_rules()` takes a `pg_advisory_xact_lock` per line inside one ~60,000-line triage transaction, exhausting `max_locks_per_transaction`. The trigger is in the applied migrations, so the defect predates #49.
  - **The fix is Lane A's:** a migration (one lock per run or practice instead of per line, or a batched transaction), or an RDS parameter.
  - **Until it is fixed,** the weekly release-capacity workflow #49 adds fails on its first scheduled run. Schedules fire only from the default branch, so this starts once the default branch moves to `claude/build-platform` (F1 (a), due when ci-deps merges).
  - **Advisory:** the per-content windows query takes 10 to 13 s cold at real size, against a 5 s budget (the stored-windows proposal with #8).
  - Status: `approval-summaries/lane-b-release-content-checks-status.md`.

- **2026-10-26, from Lane B's PR 15b (#12, merged as #51, c355633): four ledger items for Lane A, outside #12's freeze exception, so not changed by #51.**
  - **Interest credited twice:** a remittance's interest is credited twice when it comes as both an AMT I segment and a PLB L6 adjustment (the builders' finding). It is a money defect in the ledger's existing behaviour, so it needs a ledger change under its own exception.
  - **N1, the interest "allocated" flag:** payment-engine review N1, pre-existing.
  - **Ordering:** a sequence column for `ledger_match`'s order within one reconcile.
  - **An index:** on `claim.superseded_by_claim_id`.
  - Status and the reviews: `approval-summaries/lane-b-pr15b-status.md`. #46, the Verified seal, is queued, not started.

- **2026-10-26, from Lane B's ci-deps (#48): a race in the screening capacity harness, for Lane A (`run.ts` is a #42 file).**
  - **What failed:** `screening-capacity gate` failed once on fb0af1d with `result link did not open: S4#3 S4-1 (HTTP 404)`, every timing normal. Its one re-run passed.
  - **Why:** the worker sends the result email before the run commits, so the harness can open the link too early. An investigation agent, read-only, is about 90% sure, from the log's evidence.
  - **The fix:** before opening each link, wait for the run's commit, bounded by `LOG_WAIT_MS`: poll `runFacts` until `complete`, or open after the existing wait for the "emailed" log lines. A 404 then means a broken link.
  - Status: `approval-summaries/lane-b-ci-deps-status.md`.

## Delegations from the founder to the co-founder
- **2026-10-25, Tyler Williams (the founder):** The co-founder may answer for me every decision on Lane B's work: product, cost, wording, engineering and security trade-offs, and which no-migration items Lane B takes. These stay mine: approving docs/product/domain-model.md, release tags, the owner-admin repository settings (I apply them, or I grant the co-founder admin), and sign-off of legal text before it goes to counsel.

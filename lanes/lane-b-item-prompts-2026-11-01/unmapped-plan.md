## Your item
#32 in the combined audit, item 10 in the LANES queue: one unmapped plan should no longer freeze a whole month. Today, if any plan in a period has no mapping, the whole run is refused. On 83d71fd6 this happens in three places:
- `apps/worker/src/price/create.ts:105-106` (`assertPracticePricingAllowed`);
- `price/execute.ts:377` (`assertPricingAllowed`, which fails the run with `unmapped_plan` at :383);
- `monitor/plan.ts:312` (catches `PricingRefusedError` into `waitingOnMapping`).

A practice's first ERA export brings new `PLAN:` keys (ADR 0060). That export can therefore stop the findings of every mapped payer until someone maps every plan, and lines lose their window in the meantime.

The design does six things:
- It removes the guard. Lines of an unmapped plan stay `NO_MAPPING` one by one through the existing resolver, and the engine is unchanged.
- A period with no mapped plan still gets no run.
- Coverage `tp-pricing-coverage/2` records the unmapped plans.
- Coverage, Pricing runs, Home and both reports say "N plans have no mapping; their lines are not priced".
- "Price these months again" uses #50's `createRerun`, in the person's name, accepted by hand.
- "Price them now" queues the monitor for months that are waiting.

There is no migration. The milestone 3 exception is granted (`HANDOFF.md:473`: "The 19 freeze exceptions are granted").

### Branch and head
- `co-001/unmapped-plan` is **not on origin** (`git ls-remote origin`, 2026-11-01 16:25 UTC).
- There are no WIP refs: nothing matches `co-001/wip-unmapped*`.
- Cut it from `claude/build-platform` at `83d71fd62c6d419be61fd7aaa5b9033ef5c18b56` (#78), or later if the base moves.

### PR
None yet: open a draft PR at the build stage. No PR, open or closed, has head `co-001/unmapped-plan` (`gh api …/pulls?state=all&head=…` returns 0).

### Design
- **Files:**
  - `/home/user/ops/designs/lane-b-unmapped-plan.md`, revision 2, commit ca0f6438. The other commit, 4cef69f3, changed only the status file.
  - Review: `designs/lane-b-unmapped-plan/review.md`. It has 2 blocking findings, 9 should-fix and 7 nits, all dispositioned in §14.
  - Script: `workflow-scripts/lane-b-unmapped-plan-design-wf_98ca48d8-64c.js`.
- **State:** done, reviewed and revised, but stale.
  - It was read at ed85bcf3 (the superseded-rerun branch, 2026-10-26 09:23). The base is 307 commits past that.
  - **25 of its §13 files changed since.** 20 are code and test files. The other 5 are `matrix.ts`, `registry.ts`, `test-matrix.md`, `PRD.md` and `reconciliation-001.md`.
  - The biggest changes:

    | File | Lines changed |
    |---|---|
    | `report/content.ts` | 692 |
    | `components/reports/documents.tsx` | 323 |
    | `coverage/page.tsx` | 300 |
    | `components/pricing/display.tsx` | 197 |
    | `price/execute.ts` | 192 |
    | `monitor.db.test.ts` | 181 |
    | `monitor/plan.ts` | 138 |
    | `mapping/[planId]/page.tsx` | 124 |
    | `mapping/page.tsx` | 118 |
    | `lib/pricing/queries.ts` | 89 |

  - **Unchanged since ed85bcf3, so their line references still hold:**
    - `create.ts`, `rerun.ts`, `in-effect.ts`, `lines.ts`;
    - `lib/routes/pricing.ts`, `lib/routes/mapping.ts`;
    - `mapping-queries.ts`, `dashboard/queries.ts`, `billing/runs.ts`;
    - `packages/contracts/src/*`;
    - ADRs 0028, 0030, 0035, 0039 and 0060.
- **Merged since the design was read:**
  - **#50 final** (9d3ab335). `createRerun` (`rerun.ts:220`) and `RERUN_ACCEPTANCE` (`in-effect.ts:135`) are unchanged from ed85bcf3.
  - **#52** (ADR 0072): `lib/pricing/queries.ts` (where `runNames` lives, now :344), `pricing-routes.db.test.ts` and `pricing.spec.ts`.
  - **#56:** a 2-line change to the home `page.tsx`.
  - **#51:** `report/content.ts`, `html.ts` and the home page.
  - **#49** (ADR 0071): months waiting on Medicare content.
    - `contentFailure`, `coversMore` and `waitingOnContent` sit beside `waitingOnMapping` in `monitor/plan.ts:291-306`.
    - Content stops (`releaseContentSpans`, `releaseContentWindows`) are in `execute.ts`.
    - `WAITING_ON_CONTENT` is a log code in `monitor/job.ts:72`, not in plan.ts or execute.ts.
  - **#74** (ActionForm, Field, form-issues; ADR 0077).
  - **#79** (ScrollTable and StackedRows; ADR 0078; `app/tables.test.ts`).
  - **#78** (download refusals on Coverage and reports; ADR 0079).
  - **#81** (batched audit-report reads; ADR 0083).
  - #48, #53, #76, #77 and #80 touched only the rows files and PRD.
- **Stale references:**
  - `HANDOFF.md:336-339` is now `:471-473`.
  - `LANES.md:118` is now `:120`.
  - §13's "export `uncoveredMonths` as it is" needs no change: it was already exported at ed85bcf3 (:91), now at :117.
  - `packages/db/src/schema/pricing.ts:61` has a comment that says `tp-pricing-coverage/1`, and §13 does not list it. It is a comment only: no SQL reads the format, and no migration is needed.
  - `/tmp/claude-0/pr42-files.txt` is gone. Rechecked against #42 at be63bdc2: the design touches only ADR 0039 and the shared rows files (`test-matrix.md`, `reconciliation-001.md`, synth `matrix.ts` and `registry.ts`), so it is still within the lane rules.

### Status file
`/home/user/ops/approval-summaries/lane-b-unmapped-plan-status.md` exists, and its last entry is 2026-10-26 10:14. Correct these first:
- **"Stopped… the weekly usage is at 90%, and Lane B is handed to Lane A on 2026-10-27":** wrong now.
  - Lane B's orchestrator (session_01FcouKNNHsdecRMzfTs7XwW) took Lane B back on 2026-11-01. LANES.md at 15725ba2 does not record this yet; cite the orchestrator's entry once it is pushed.
  - Usage is under 20% (the co-founder, 2026-11-01 ~14:40 UTC).
  - The item now runs in its own session, in parallel. It no longer runs "after #75, in the same session" (`lanes/lane-a-handoff-to-lane-b.md:66`). The old session_017SNqG4nQbbt6xqEG1ZDKe6 is gone (`get_session`: not found).
- **"the branch… is cut after #10 merges" and "latest claude/build-platform, which then holds #50":** #50 merged 2026-10-26 11:06 UTC (9d3ab335). The base is now 83d71fd6.
- **"resumes with resumeFromRunId once #50 merges":** obsolete. The design finished at 10:01, and the old scratchpad is gone.
- **"two adversarial reviews (… security for the new route)":** design §10 has three reviews and two new routes, `practice.mapping.price_again` and `practice.mapping.price_waiting`, plus a conditional `monitor` enqueue.
- **"a notification kind, two figure codes, a recipients function":** design §14 12c dropped the figure codes. §13 says "no figure codes". `LANES.md:254` repeats the old wording; tell the orchestrator.
- **The design as ready to build:** it is 307 commits behind and must be re-read first (see Design).
- **Still true:**
  - No branch and no worktree exist.
  - Lane A's notice migration is not built. No migration for it is on the base, #42, SS-01, 1b or interest.
  - MAP-10 is still kept.

### Reserved numbers
- **LANES.md claim row (`LANES.md:188`), verbatim:** "ADR 0075 if the design needs one; test-matrix MAP-06 to MAP-10 and PRC-29 to PRC-31; `packages/synth` cases the same".
- **This PR uses:** ADR 0075, MAP-06 to MAP-09, PRC-29 to PRC-31.
- **MAP-10** stays reserved for the notice follow-up (`LANES.md:253-256`).
- **Synth:** no new module (MAP = 2, `packages/synth/src/cases/common.ts:18`) and no new fixture release (it uses 900001).
- **Migration timestamps:** none.
- All are checked free on 83d71fd6 and on every open branch: #42, #75 and its wip-5, #82, #83 and its WIP, #84 and its WIP, #85, #86, SS-01, 1b and interest.

### Setup arguments
`co-001/unmapped-plan:/home/user/unmapped-plan`. Use this only after the branch exists on origin; until then `setup-container.sh` fails with "co-001/unmapped-plan is not on origin".

### Exact next step
1. **Container setup** (run in the background until it prints OK):
   ```
   git -C /home/user/PhysicalTherapy fetch -q origin claude/build-ops && git -C /home/user/PhysicalTherapy show FETCH_HEAD:tools/setup-container.sh > /tmp/setup-container.sh && bash /tmp/setup-container.sh
   ```
   - If it fails with "node: /opt/node24/bin/node reports 'v24.22.1', not v24.22.0", run `mv /opt/node24 /opt/node24.base-image` and run the script again.
   - Create the branch on origin through the pre-push hook. Never use --no-verify.
     ```
     git -C /home/user/PhysicalTherapy fetch -q origin claude/build-platform && GITLEAKS=/root/.cache/paidwhole/gitleaks/8.24.3/gitleaks git -C /home/user/PhysicalTherapy push origin FETCH_HEAD:refs/heads/co-001/unmapped-plan
     ```
   - Then run `bash /tmp/setup-container.sh co-001/unmapped-plan:/home/user/unmapped-plan`.
   - Update the status file, pulling before you edit and never forcing:
     - `git -C /home/user/ops pull --no-rebase origin claude/build-ops`;
     - correct the file and commit;
     - push with `GITLEAKS=/root/.cache/paidwhole/gitleaks/8.24.3/gitleaks git -C /home/user/PhysicalTherapy push origin claude/build-ops`.
2. **Design re-read** (the remaining part of stage 1). Adapt `lane-b-unmapped-plan-design-wf_98ca48d8-64c.js`: rewrite `SP`, set `WT` to `/home/user/unmapped-plan` (its `WT` names `/home/user/superseded-rerun`, which is gone), and change the base to 83d71fd6.
   - One agent re-reads the design against 83d71fd6, file by file, and updates every file:line reference.
   - Keep the location waits and #49's content waits when the guard goes.
   - Use #50's `createRerun` (`price/rerun.ts:220`) and `RERUN_ACCEPTANCE` (`price/in-effect.ts:135`).
   - Use #74's ActionForm and Field for both new forms and for the Pricing runs field error.
   - Use #79's ScrollTable and StackedRows for the new `components/mapping/months.tsx`.
   - Respect #78's refusal routes and #81's batched audit-report read. Re-read #52's `runNames`.
   - Recheck the overlaps with #42 (be63bdc2), SS-01 (f897a282) and UX PR 9.
   - Then one adversarial reviewer. Record the result as revision 3 in §14.
3. **Before shots** on the base, for the design §9 screens:
   - 1280 and 390 px light, and 1280 px dark, on a synthetic practice.
   - Follow `tools/lane-b-screen-tour/README.md`, "From another lane" and "Set-up and a run".
   - Adapt `workflow-scripts/lane-b-ux-download-refusals-capture-before-wf_c067d77c-56b.js`.
   - Shots never go on a branch, because the repository is public; share them as a private gallery.
4. **Build** (not started).
   - Builders split by the design §13 areas. Adapt `lane-b-superseded-rerun-build-wf_dfe5dba3-fd5.js`: rewrite `SP`, set `WT` to `/home/user/unmapped-plan`, set `DESIGN` to the unmapped-plan design, and update the base.
   - Run `pnpm synth --all` (MAP-06's 835 and the expected.json files).
   - Run `pnpm exec tsx tools/screening-capacity/watched.ts --write`.
     - The PR touches 18 paths already in `watched-paths.txt`: `packages/contracts/src/{coverage,index,load}.ts`, `apps/worker/src/price/{coverage,create,execute,lines,public,rerun}.ts`, `monitor/{job,plan}.ts`, `report/{content,documents,html}.ts`, `apps/web/src/lib/billing/runs.ts`, and synth `{matrix,pricing,registry}.ts`.
     - The new `price/mapped-plan.ts` joins the list if a watched file imports it.
     - So the `screening-capacity gate` measures in CI.
   - Push.
5. **Draft PR** into `claude/build-platform` at once.
   - Fill the description from `.github/pull_request_template.md`, with every section present, under 65,536 characters, ending with the Claude Code footer.
   - Write it only with MCP `update_pull_request` and read it back.
   - Call `subscribe_pr_activity`.
6. **Three reviews** (design §10), each in a fresh clone with its `.claude/agents/<type>.md` checklist:
   - payment-engine-reviewer;
   - ux-brand-reviewer, with before and after shots;
   - security-reviewer: `practice.mapping.price_again`, `practice.mapping.price_waiting`, and the conditional `monitor` enqueue on mapping.

   Adapt `lane-b-superseded-rerun-review-wf_724a71c1-069.js` and `lane-b-ux-download-refusals-reviews-wf_1c44b1a2-762.js`. The script must stop if a review returns nothing.
7. **Fix round**, then one push. Adapt `lane-b-superseded-rerun-fix-wf_11fa7137-42b.js`. Run the full suite once:
   - unit, golden, oracle;
   - `pnpm lint`, `pnpm typecheck`;
   - test:db in 4 shards, one after another, each on a fresh PG18 database (port 5433);
   - build, stamp, then e2e with `E2E_PREBUILT=1`;
   - the affected Stryker shards (`stryker/shards.json`), then the gate;
   - `verify-content`, synth's check, `lint:copy`, `lint:logs`.

   Run every heavy command under `flock /tmp/laneb-heavy.lock` with `export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH`.
8. **Fresh-clone verification**, reading CI on the head. Adapt `lane-b-superseded-rerun-verify-wf_f83c3757-009.js`.
9. **Merge**, as in the next section.

Throughout:
- At most 2 heavy workflows in the container.
- Every agent keeps a progress file (the SAVE rule).
- Schedule a `send_later` about 5 h 10 min ahead before each heavy workflow.
- Archive each script as `workflow-scripts/lane-b-unmapped-plan-<stage>-<runId>.js`.
- Add a status-file entry after each stage.
- Usage (rule 9) was under 20% on 2026-11-01. Start no heavy run past about 80%, and never cut one off mid-way.
- Synthetic data only.

### Merge order and dependencies
- **#75:** no code dependency, so this PR need not wait for it. It merges when ready, in the orchestrator's one-at-a-time order.
  - This PR shares no code file with #75 (871faff9; wip-5 7f77cb19). The only shared files are:
    - `docs/product/test-matrix.md`;
    - `packages/synth/src/cases/{matrix,registry}.ts`;
    - `docs/product/reconciliation-001.md`;
    - `docs/product/PRD.md`, at different lines: #75 changes :575 and :691, this PR :175, :237 and :704.
- **The rows files:**
  - #42 be63bdc2 and #82 96758e44 share `test-matrix.md`, `matrix.ts`, `registry.ts` and `reconciliation-001.md`.
  - #83 f4a97668, #84 e3299ea2 and #85 29dded52 share `test-matrix.md`, `matrix.ts` and `registry.ts`.
  - #86 83167b8f shares only `reconciliation-001.md`.
  - Interest also changes `PRD.md`, at :548.
  - The PR merged second resolves these, keeping both sides (rule 6), and regenerates with `pnpm synth --all`.
- **ADR 0039:** #42 and the schema chain (SS-01, 1b, interest) both append to it. Keep both.
- **UX PR 9, home figures** (`co-001/ux-home-figures`, equal to the base, can start now): its design D10 changes `lib/dashboard/queries.ts` and the home `app/p/[practiceId]/page.tsx`, as this PR does. The PR merged second resolves.
- **Code conflicts with the schema chain:**
  - SS-01 f897a282, and 1b 358dc53f and interest e0646746 (which carry it), change the home `page.tsx` (`suspension` becomes `hold`) and `apps/web/src/lib/billing/runs.ts` (`practice_run_refusal_for`, `CONTINUES_STARTED_WORK`).
  - SS-01's `route-tests/define.ts` (`expectQueuedWorkGated`) checks the jobs each route's ok call queues:
    - A route that queues a person-started job (`price`, `triage`, `intake`, …) must be in `RUN_STARTING_ROUTES` or `CONTINUES_STARTED_WORK`.
    - `monitor` and `reconcile` are `PRACTICE_OWN_JOBS` and need neither list.
  - So whichever side merges second does the following:
    - Keep both new routes in `RUN_STARTING_ROUTES`, as the design does.
    - Add nothing to `CONTINUES_STARTED_WORK`, which `suspension-refusal.db.test.ts:155` pins to `['practice.uploads.complete']`.
    - Leave the mapping route's conditional `monitor` enqueue out of both lists.
    - `run_starting_permissions()` is unaffected, because `mapping.edit` is already a run-starting permission.
  - If this PR merges second, this session resolves. If SS-01 merges second, the schema-chain session resolves, told through the orchestrator.
- **To merge:**
  1. Merge the latest base with a merge commit. Regenerate the lockfile and `watched-paths.txt`; never hand-merge them.
  2. CI must be green on that head for `all green`, `mutation`, `screening-capacity gate` and `approval-of-record`.
  3. Mark the PR ready and wait for approval-of-record's re-run.
  4. Call `merge_pull_request` with method merge and `expectedHeadSha`.
  5. Unsubscribe, read the push runs, and clean the worktree.

  Never approve, never force, never open a PR into main.

### Waiting on someone
- **Nothing blocks the merge.**
  - The founder granted the milestone 3 exception on 2026-10-20 at ~15:10 UTC (`HANDOFF.md:473`).
  - The co-founder's standing ruling of 2026-10-26 ~00:20 UTC covers every design choice (take the recommended option and record why), so there are no open questions.
- **Lane A: the stored notice and email to the people who may map plans** (`mapping.edit`).
  - It is a "Handed to Lane A" request (`LANES.md:253-256`), not part of the acting-Lane-A schema chain.
  - It needs a migration (a notification kind and role-filtered recipients, with no figure codes) plus #42's mail files.
  - It is not built, and it needs the founder's domain-model approval.
  - It blocks only the MAP-10 follow-up, not this PR.
- **Founder:** runbook 3i and `APPROVAL_REVIEW_REQUIRED`. Until then the PR merges on green checks and the fresh-clone verification (rule 7). This does not block today.
- **Later, not decided:** a payer-name alias between an export's plans and the 835's (design §11, "Proposals outside this PR"). The design leaves it for the co-founder to consider, but `ADR 0060:215` calls it "the owner's call", which makes it the founder's unless delegated. It blocks nothing.

### Follow-on
After #32 merges, the same session takes #48, "a narrative survives sign-out":
- **Branch:** `co-001/narrative-draft`, not on origin, with no PR.
- **Design:** `/home/user/ops/designs/lane-b-narrative-draft.md` and `designs/lane-b-narrative-draft-review.json` (commit ff1bc830). It was designed and reviewed at 6ddd587 on 2026-10-26, with script `workflow-scripts/lane-b-narrative-draft-design-wf_c4f857f0-8b2.js`.
  - Its header cites `LANES.md:172`, which is now :181. Its prerequisite #38 merged as #52 (3486f75c).
- **Reserved:** ADR 0076 and CAS-35 to CAS-37 (`LANES.md:181`), checked free. No migration.
- **Records:** its entries are in `approval-summaries/lane-b-figures-in-words-status.md` ("PR B"). Create `approval-summaries/lane-b-narrative-draft-status.md`.
- **Re-read the design first.** Merges since 6ddd587 touched its files:

  | Merged PR | Files it changed |
  |---|---|
  | #74 | `components/action-form.tsx`, `packets/version-form.tsx`, `packets/export-status.tsx`, `hardware-key.tsx`, `app/sign-in/page.tsx`, `lib/routes/sign-in.ts` |
  | #50, #74, #78 | `lib/http/next.ts`; #78 moved `signInFor` into `lib/http/sign-in-for.ts` |
  | #52, #74, #78, #79 | `cases/[caseId]/packet/page.tsx` |
  | #74, #78, #79 | `uploads/uploader.tsx`, `uploads/receipts.tsx` |

  - It edits `apps/web/e2e/helpers.ts`, which is now a #42 file at be63bdc2. The design lists it as a change, but not as a #42 file.
  - It overlaps UX PR 6 (`co-001/ux-sign-in-time`) on `app/sign-in/page.tsx` and `app/sign-in/notice.tsx`.
  - It overlaps #75 and #85 on `components/uploads/uploader.tsx`.
  - In each overlap, the PR merged second resolves.
- **Parts waiting for #42** (design §13): `components/shell.tsx`, `docs/policies/data-retention.md` and `lib/http/rate-limit.ts` are still #42 files at be63bdc2. None of them blocks the PR.

### Resume
Resume from your status file: it is your handoff. Do not message the old sessions.

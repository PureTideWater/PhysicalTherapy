# Lane B log (the co-founder's sessions)

Only Lane B's sessions write this file. Add entries at the end, each with:
- the UTC time;
- what was done, with links to the PR, commits and workflow runs;
- the next step.

Lane A reads it to keep the build tracker current. The rules are in `../LANES.md`; the person's set-up is in `../COFOUNDER-START.md`.

## Start here (Lane B): the state at 2026-10-26 ~21:10 UTC, the handoff to Lane A
**Lane A: read `lane-b-handoff-to-lane-a.md` (beside this file) first.** It orders what is due now. A session that continues Lane B's work reads this section first, after `../LANES.md`. From 2026-10-27 that is a Lane A
session: the co-founder works Lane A from then on. Lane A runs on another Claude account against the same GitHub
repository, so everything it needs is here, in LANES.md, in the status files (`approval-summaries/lane-b-*-status.md`)
and on GitHub. This section says:
- what Lane B merged, what is open and what each open item's next step is;
- what stopped where, and what waits on whom;
- the rulings already made, and the conventions that kept the build safe.

The dated log below is the record; nothing in it is needed to continue. This section supersedes the 2026-10-25 ~20:35
UTC one. Where `HANDOFF.md`'s "Start here" disagrees, this section and GitHub are current (Lane B does not edit
HANDOFF.md; LANES.md rule 10).

### The state in one screen
- **Merged by Lane B into `claude/build-platform`**, each as a merge commit after its fresh-clone verification, with
  every required check green on its head:

  | PR | Item | Merge commit | Merged (UTC) |
  | --- | --- | --- | --- |
  | #43 | ci-speed (CI 1 of 4) | 9c57d2d | 2026-10-25 14:16 |
  | #44 | ci-mutation (CI 4 of 4) | de8f9b5 | 2026-10-25 18:50 |
  | #45 | PR 15, ledger tests LED-12 and LED-13 | 6ddd587 | 2026-10-25 20:04 |
  | #47 | #135, the bank account shown first (ADR 0073, BIL-01 to BIL-04) | c5195ee | 2026-10-26 03:56 |
  | #46 | #111, readable database-function diffs (ADR 0068, DBF-01 to DBF-05) | 4d99df8 | 2026-10-26 04:37 |
  | #54 | the materiality settings' cents shown as dollars, a money bug the UX review found (CAS-38, CAS-39) | 7ef421b | 2026-10-26 08:56 |
  | #53 | #84, the model evaluation gate (ADR 0070 Parts 1 and 2, MOD-07 to MOD-11) | 88a0e4e | 2026-10-26 09:50 |
  | #55 | the UX and brand reviewer checklist, `.claude/agents/ux-brand-reviewer.md` | 6070e41 | 2026-10-26 10:30 |
  | #50 | #10, a superseded re-run cannot be accepted (amends ADR 0037; PRC-25 to PRC-28) | 9d3ab33 | 2026-10-26 11:06 |
  | #52 | #38, every figure explained in words (ADR 0072, CAS-30 to CAS-34) | 3486f75 | 2026-10-26 11:41 |
  | #56 | UX PR 2, a suspended organization never reads "In good standing" (UX-004; BIL-05, BIL-06) | 0e28f9b | 2026-10-26 12:11 |
  | #51 | PR 15b, ledger amounts in payment terms (#12; ADR 0067, LED-14 to LED-18) | c355633 | 2026-10-26 12:41 |
  | #49 | the release content checks (#7, #30, #31, #59; ADR 0071, RCC-01 to RCC-08) | d725977 | 2026-10-26 14:25 |
  | #48 | ci-deps (CI 2 of 4; ADR 0066): every action and image pinned, Dependabot's groups, cooldowns and trust rules | e908c21 | 2026-10-26 21:06 |

- **Open Lane B PRs at this writing**, each run by its own Lane B session, each told to finish to its merge or stop at
  a clean, recorded step. The status file says exactly where it is:

  | PR | Item | Head | Status file | Next step |
  | --- | --- | --- | --- | --- |

  **No Lane B PR is open.** #48 merged last, so the founder's three repository settings are now due:
  `designs/lane-b-settings-after-ci-deps.md` (F1 (a) the default branch, F2 (a) Dependabot alerts and security updates, then F3 SHA pinning).
- **Stopped at a clean point: branch pushed, no PR, the status file a handoff, nothing running:**

  | Branch | Head | Item | What remains | Status file |
  | --- | --- | --- | --- | --- |
  | `co-001/ux-forms` | 17bbb70 | UX PR 1: forms keep what the person typed (UX-001; ADR 0077, FRM-01 to FRM-08, synth module 16) | slice A after #50 merges; C1 and C2 after #51 and #52; then the PR pipeline | `lane-b-ux-forms-status.md` |
  | `co-001/contract-phi-check` | d7447ad | #120, the contract PHI check before the model (ADR 0070 Part 3, MOD-12) | the integrator, the full suite, the PR pipeline | `lane-b-model-eval-gate-status.md` |
  | `co-001/ci-browser` | 8b38f48 | ci-browser (CI 3 of 4), phase 1 built | after #48 merges: phase 2, the PR pipeline (`designs/lane-b-ci.md` §3.3) | `lane-b-ci-deps-status.md` |

- **Designed and reviewed, not built** (each design on this branch):
  - #32, one unmapped plan no longer freezes a month: `designs/lane-b-unmapped-plan.md` (ADR 0075; MAP-06 to MAP-10,
    PRC-29 to PRC-31). Its stored notice and email are Lane A's (LANES.md "Handed to Lane A").
  - #48's narrative draft survives sign-out: `designs/lane-b-narrative-draft.md` (ADR 0076, CAS-35 to CAS-37).
  - The CI follow-ups P1 (action pins and image digests held to the age floor), P2 (trivy's version) and P4 (a
    narrower mutation trigger): `designs/lane-b-ci/follow-up-p{1,2,4}-*.md` (CI-21 to CI-29).
  - Queued, not designed: #46, the Verified seal (LED-19 to LED-22, ADR 0074); #135's micro-deposit proposal.
- **The UX/UI and brand baseline review: done** (`designs/lane-b-ux-review.md`).
  - **What it covered:** 857 screenshots of every reachable screen and state, at 1280 and 390 px, light and dark from
    the tokens; eleven expert reviewers; 342 findings in 208 verified problems (16 blocking, 121 should fix,
    71 polish).
  - **The queue:** 91 proposed PRs in landing order (§3; as data, `designs/lane-b-ux-review/synthesis/prs.json`).
    PRs 1 and 2 are above. The next blocking ones that touch no #42 file are PR 3 (`ux-table-scroll`), PR 4 (the
    screening result on a phone), PR 5 (a refused download back to its form) and PR 6 (sign-in time limits).
  - **To Lane A:** 19 items (§5). **To the founder:** 5 questions (§6.2; under "Waiting on someone" below). The
    wording and brand choices taken under the co-founder's ruling are in §6.1.
  - **The galleries**, private to the co-founder's claude.ai account: 1280 px
    https://claude.ai/artifact/NmJco1UsT631vdmXts8HHD, 390 px https://claude.ai/artifact/V1vzMZc3BrJ8mtw1HXG5jh. Each
    shot shows the UX findings that cite it. Another account sees them only once the co-founder shares them from each
    page's Share menu.
  - **From now on,** every PR that changes what a person sees takes the UX and brand review (#55's checklist) as one
    of its two adversarial reviews, in both lanes. A Lane A session takes the shots as
    `tools/lane-b-screen-tour/README.md` "From another lane" says.
- **Lane A's open #42** (PR 6b-4, mail streams; a schema PR) is a draft at 13f59b1. What Lane B's merges mean for it,
  each in LANES.md "Handed to Lane A":
  - its next `pnpm db:domain-model --out` also writes `packages/db/functions` (45 files at 13f59b1), committed before
    the founder signs (#46);
  - generated files (the lockfile, `tools/screening-capacity/watched-paths.txt`, `packages/db/functions`) are
    regenerated by the PR merged second (LANES.md rule 6);
  - #53 changed one line of `infra/test/compute.test.ts`, which merges cleanly with #42's head;
  - the shared documents (test-matrix, reconciliation-001, the synth registry and matrix) keep both lanes' rows.
- **Dependabot, never merged as it stands** (the founder's rule; Lane B never merges one):
  - #40, the actions group (11 updates, open): ci-deps supersedes it with its own SHA pins, so it closes as up to date once #48 merges, or is recorded with its state.
  - #33, the base images (`node:26-slim`, open): ci-deps declines it with a node-major ignore rule and moves both images to Debian trixie digests on Node 24. Node 26 gets a PR of its own (N8).
  - npm updates resume from 2026-10-26T19:18:50Z, when Stryker 10.1.1 turns three days old, under ci-deps' cooldown and trust rules.
- **Other `co-001/*` branches on GitHub** (not Lane B's work today): `co-001/pr-05b-plan-type-words` (PR 5b, #34, merged 2026-10-21) and `co-001/main-dependabot-template` (#27 into `main`, merged 2026-10-20) are leftover branches of merged PRs (HANDOFF.md). Lane B deletes no branch. `co-001/pr-06b-mail-streams` is Lane A's #42.
- **Lane B's sessions:** all idle, with nothing running and no check-ins, except ci-deps' (tonight's 19:20 step) and this session's check at 19:45 UTC. Each finished session's last message and status file name its merge or its stopping point.
- **Repository rules:** the ruleset "Protect the build branch" (F7) requires `all green`, `mutation`,
  `screening-capacity gate` and `approval-of-record`, up to date, through a PR, with no bypass. `main` is unchanged by
  rule: no PR into `main` and no release tag before launch (CLAUDE.md "Merging", ADR 0063).
- **The tip:** e908c21 (#48's merge, 2026-10-26 21:06 UTC). The last measured counts, on #48's head 7b6b10b (which
  held every merge before it): unit 6,265 and 1 skipped; db 9,222 and 1 skipped; e2e 54. Its push runs were still
  running at this writing; read them first.
- **Proposals:** each status file ends with the improvements its session found but did not build (LANES.md's "improve
  as you go"). #10's, for example: a stuck run's operator view and action, two first runs of one period priced out of
  creation order, a detection of lines with no pricing in effect, and `color-scheme: dark` for form controls (also UX
  review F1's ground).
- **Usage:** 90% weekly at ~10:05 UTC (the co-founder's reading). The co-founder allowed Lane B up to 98%
  (~10:13 UTC). The weekly reset is Friday 2026-10-30 19:00 UTC. The account's 5-hour limit stopped every session
  twice on 2026-10-26 (~02:20 to 03:40 and ~06:15 to 08:40 UTC); progress files kept every agent's work.
- **Lane B's sessions** (claude.ai/code, tagged `lane-b`): each status file names its session. Each stops at a clean
  point, with nothing running and no scheduled check-in, except ci-deps' tonight. Their containers end with them;
  everything they built is on GitHub.

### Next actions, in order (for whoever continues Lane B's work)
1. **The founder's three settings,** now due (#48 merged): `designs/lane-b-settings-after-ci-deps.md`. Then read Dependabot's
   first runs after the default-branch switch (`lane-b-ci-deps-status.md`). Also pin pnpm 10.34.8 in `tools/setup-container.sh`
   on this branch, as ci-deps' merge asks. Follow "Merging" below: base merged in with a merge commit, CI green on that head,
   the fresh-clone verification, ready, then `merge_pull_request` with `expectedHeadSha`.
2. **ci-browser** (`co-001/ci-browser`, phase 2; its design is `designs/lane-b-ci.md` §3.3), then the follow-ups P1, P2 and P4.
3. **The stopped branches:**
   - `co-001/ux-forms`: #50, #51 and #52 have merged, so all its slices can go ahead;
   - `co-001/contract-phi-check`;
   - then #32's build, the narrative draft, #46.
4. **The UX review's queue,** from PR 3, in landing order. A PR marked "after #42" waits for #42; a migration part is
   Lane A's.
5. **LANES.md's queue,** from its first open item, with its "Not while #42 is open" list.

### Waiting on someone
- **The founder** (owner-admin, legal or Lane A's; so not delegated), through the co-founder:
  - **When ci-deps (#48) merges:** F1 (a) the default branch, F2 (a) Dependabot alerts and security updates, then F3
    actions pinned to a full SHA. The steps: `designs/lane-b-settings-after-ci-deps.md`.
  - **From the UX review** (`designs/lane-b-ux-review.md` §6.2, each with its options and recommendation):
    - F1, dark mode: it reverses D9 item 3 ("dark mode stays off"; reconciliation-001.md:309);
    - F2, the terms page shows no terms text (legal);
    - F3, the palette (the brand owner's, ADR 0058 D9);
    - F4, the screening's kept-data notices (legal surfaces, counsel's list);
    - F5, the screening's sentences held for counsel.
  - **From #84 and #120:**
    - the per-field recall and precision floors of the evaluation gate: they ship unset, so it fails closed;
    - whether the data-rights addendum covers accepted proposals used as examples (legal text).
  - **From #111:** a `protect-content.sh` guard and a CLAUDE.md Never line for `packages/db/functions` (generated
    files).
  - **The rulesets 4B and 4C** (`main`'s two, and the `v*` release tags'). Neither exists, and HANDOFF does not
    schedule them. In 4B, target `main` by pattern, not "Include default branch".
  - **Still open:**
    - O12, the PR capacity run's length (`designs/lane-b-ci.md` §11);
    - O1, the account's plan;
    - Lane A's PR 6c (four frozen-engine defects from #44's review);
    - the amendments to LANES.md items 3, 10 and 14 (their exceptions were granted on 2026-10-20).
  - **The co-founder's own approval:** a dated delegation line in LANES.md and a small governance PR (approvers.json,
    ADR 0063, the approval-of-record check) would let it count in their own name. Lane B never signs the founder's
    name.
- **The co-founder** (delegated, LANES.md 2026-10-25):
  - ci-browser's A9 inspection of its regenerated baselines;
  - payment-engine/S1 from #44, a MoneyError guard in `multiplyCents`;
  - reorder or drop any of the UX review's 91 PRs.
- **Lane A:** every entry under LANES.md "Handed to Lane A". Those added on 2026-10-26:
  - the UX reviewer for screen-changing PRs, and how to take the shots;
  - #111's function files;
  - #53's one-line hunk;
  - #54's two `settings.ts` steps;
  - #32's stored notice;
  - #84 and #120's F3 and F4;
  - #59's coverage function;
  - 15b's stored case close;
  - the UX review's 19 items (`designs/lane-b-ux-review.md` §5).

### Rulings and decisions of record (each in the log below, with who and when)
- **The founder (Tyler Williams):**
  - F1 to F7 as recommended, relayed by the co-founder, 2026-10-25 ~01:10 UTC;
  - L1 (a), relayed by the co-founder, ~02:05 UTC;
  - the delegation to the co-founder, recorded by Lane A in LANES.md (1f35d71, 2026-10-25 ~10:05 UTC);
  - the combined audit adopted whole, its 19 freeze exceptions granted and its ruling changes accepted, 2026-10-20 ~15:10 UTC (HANDOFF.md);
  - Lane A's screen-changing PRs take the same UX and brand reviewer (`.claude/agents/ux-brand-reviewer.md`, once Lane B's checklist PR merges), with before and after screenshots at 1280 px and 390 px; handed to Lane A (LANES.md) to add to rule 1 (the co-founder, acting for the founder, 2026-10-25 ~21:10 UTC).
- **The co-founder:**
  - Lane B uses the `PureTideWater` GitHub account, 2026-10-24 ~21:10 UTC;
  - his directions "all recommended actions" (~01:00 UTC) and "keep going; do the recommended suggestions to optimize" (~07:45 UTC), applied as his rulings under the delegation;
  - LED-12's row wording approved as recommended, under that direction with no separate message (~17:45 UTC; reconciliation-001 item 15);
  - the UX/UI baseline review is the next session's first task, ~16:50 UTC;
  - the review also runs with the build, ~17:00 UTC;
  - the recommendation that Lane A take the same reviewer, ~17:05 UTC, for the founder to decide;
  - **Q2 (CI series and #42's files, 2026-10-25 ~21:05 UTC):** rule 6; the PR merged second keeps both, the lockfile re-resolved and never hand-merged; axe runs over #42's pages (O6) if #42 merges first; ci-browser does not wait for #42;
  - **Q3 (scope of "every recommended option", 2026-10-25 ~21:05 UTC):** pre-approves engineering-only choices inside an already-ruled design, recorded as his rulings and reversible; batches with wording, brand, product, cost or security trade-offs still go to him;
  - **Q4 (ux-brand-reviewer.md's `model:` key and checklist suite, 2026-10-25 ~21:05 UTC):** `model:` follows the other reviewer files (rule 12); the checklist PR takes a documentation-only suite (typecheck, lint, lint:copy, unit);
  - **Standing direction, "improve as you go" (2026-10-25 ~21:27 UTC):** "If you ever discover a way to improve or optimize something as you're building do it. Always do this." Applied as the convention "Improve as you go" below;
  - **Wording and visible changes without asking (2026-10-25 ~21:34 UTC):** "Apply wording and visible changes without asking me first." Each takes the recommended option at once and is reported to him afterwards. Cost and security trade-offs still go to him first; founder-kept matters stay the founder's.

  - **"Don't ask for approvals anymore just build and optimize" (2026-10-26 ~00:20 UTC):** cost and security trade-offs take the recommended option (security: the safer one), recorded with reasons; founder-kept matters stay the founder's.
  - **The budget (2026-10-26 ~10:13 UTC):** "You can use 98% of usage. So do what you can up until that. Lane A is running on a different account different usage. Lane A is another Claude account but working from the same git hub repo."
- **The orchestrator (Lane B's main session), under those rulings:**
  - generated files are regenerated by the PR merged second (LANES.md rule 6's note, 2026-10-26 ~04:46 UTC);
  - #53 kept a one-line hunk in `infra/test/compute.test.ts`, a #42 file that merges cleanly (2026-10-26 09:48 UTC);
  - the dark-mode choice goes to the founder (it reverses D9 item 3); meanwhile, dark stays off.

### How Lane B runs: conventions and pitfalls (each one cost time once)
- **Shared counters, allocated only by this session** (parallel sessions ask; each claim row names its numbers). Next free at 2026-10-26 ~09:27 UTC:
  - ADR **0078** (0065 is #42's, 0066 the CI series', and 0067 to 0077 are claimed; 0077 by ux-forms at ~04:35). Used so far: 0067 (15b, open), 0068 (#46), 0070 (#53), 0071 (#49, open), 0072 (#52, open), 0073 (#47). Reserved, not yet written: 0069 (#10 amended ADR 0037 instead, so 0069 is free to reuse), 0074 (#46, the seal), 0075 (#32), 0076 (the narrative draft), 0077 (ux-forms);
  - `packages/synth` MODULE_NUMBER **17** (`packages/synth/src/cases/common.ts:18` ends at CI 12; DBF 13, RCC 14, BIL 15 and FRM 16 are claimed; FRM at 09:27);
  - fixture release **900008** (900001 to 900006 exist, 900007 is the release content checks', 900100 is the screening's scale release, and 900110 the release content checks' scale release, generated outside the repository);
  - test-matrix IDs: two digits, `[A-Z]{2,3}-\d{2}` (`packages/synth/src/fixtures.test.ts:36`), so MOD-07, not MOD-7.
- **Improve as you go** (the co-founder's standing direction, 2026-10-25 ~21:27 UTC). Every improvement or optimization found while building gets done, by whoever finds it (the session or any workflow agent; every workflow prompt says so). Where it lands:
  - **Inside the current PR** when it sits in files the PR already changes, or is small and of the same kind. It goes through the same reviews, tests and verification, and the PR description names it.
  - **As its own PR, next in Lane B's queue,** when it is larger or of another kind. Add it to LANES.md as a dated item "on the co-founder's standing direction of 2026-10-25" (one PR per change, LANES rule 5).
  - **Handed to Lane A** when it needs a migration, or changes frozen code (the engine under `packages/pricing`, the ledger's existing behaviour, the content pipeline).
  - **Wording, brand and what a person sees: done without asking** (the co-founder, 2026-10-25 ~21:34 UTC). Each takes the recommended option at once, within `.claude/rules/brand.md`, CO-11 and the PRD. The PR description and this log report it to him afterwards, and he may reverse any.
  - **Cost and security trade-offs: decided without asking too** (the co-founder, 2026-10-26 ~00:20 UTC: "Don't ask for approvals anymore just build and optimize"). Take the recommended option: for security, the safer one. Record it with its reasons in the design or PR description and in this log. Nothing waits on a question to him.
  - **The founder's, through the co-founder:** the domain model, release tags, owner-admin settings, legal text (the terms, the cookie notice, the screening terms, the AMA notice, HANDOFF's counsel list), and any reversal of a recorded founder ruling.
  - Never skip a pipeline stage for it, and never stop a running workflow for it. A finding inside a running workflow is applied at its next stage, or in the next workflow.
- **Node.** The shell's default `node` is 22. Run `export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH` in every command or script.
  - pnpm comes from `/opt/node22/bin`, but then runs on Node 24.
  - The mutation canary and the gate record the Node they ran on, and the repository requires `>=24`.
- **One heavy command at a time:** `flock /tmp/laneb-heavy.lock <command>`. Heavy means install, build, typecheck, lint, test, test:db, e2e with `--workers=2`, Stryker, and the screen tour's build and server.
  - Keep at most two heavy workflows at once, and tell every workflow agent the same.
  - The full local suite runs once, in the fix round: unit; golden; oracle; test:db in shards one after another; build, stamp, then e2e with `E2E_PREBUILT=1`; the mutation shards a change affects, then the gate.
- **The machine restarted but the session is still open** (PostgreSQL down, or a run reports it was stopped). Disk, worktrees and the scratchpad survive.
  - Run `bash /home/user/ops/tools/setup-container.sh` again, with the open branches: it restarts both clusters.
  - Resume each stopped workflow with `resumeFromRunId`, after editing its script with a RESUMED note and the lock rule. Only the same session can resume them.
  - **If the session itself ended,** a new session starts again from this section, and a stage cut off mid-run starts again from its worktree.
- **If auto mode becomes unavailable,** workflow agents stop mid-run. Wait for the person, then resume the same way.
- **An interrupt of the main session stops background workflow agents too** (2026-10-25 21:27 UTC: four agents lost, and nothing showed it for 73 minutes). The stop button and a message sent while a reply is running both count. So:
  - every workflow agent keeps a progress file and continues from it (the SAVE rule in `workflow-scripts/lane-b-ux-capture-wf_b56fe7b4-652.js`);
  - a monitor reports each agent's finish and any 10 minutes with no agent writing;
  - after any interrupt, read the running workflows' journals at once, and resume the stopped ones.
- **Counting tests:** take a PR's count changes from CI's run totals or a full local run, never from `vitest list`. That lists a parametric test once: PR 15 added seven per-835 parse cases that `vitest list` missed, and its description had to be corrected before the verification passed.
- **Waiting:** the Bash tool blocks a foreground `sleep`. Run long commands with `run_in_background` and wait for their notification, or use Monitor with an until-loop. A PR's events arrive through `subscribe_pr_activity`.
- **PR descriptions:**
  - Write them only with the MCP `update_pull_request` tool, then read them back. A `gh api` PATCH rewrote #43's footer.
  - For a long body, a helper agent writes it from a file and proves it byte for byte against `gh api …/pulls/<n> --jq .body`.
  - Follow `.github/pull_request_template.md`, and end with the attribution lines.
- **CI logs:** use `get_job_logs` (`return_content`, a large `tail_lines`). The proxy refuses artifact downloads, so read Stryker's results from the job logs. PR CI cancels a run in progress on each new push, so push once per round.
- **Merging:**
  1. Merge the latest `claude/build-platform` into the PR branch with a merge commit (rule 6, keeping both lanes' changes). Re-resolve the lockfile with `pnpm install`; never hand-merge it.
  2. Re-check what the merge touched, the affected mutation shard included, and push.
  3. Wait for CI green on that head: every check, `mutation` and `screening-capacity gate` included.
  4. Run the fresh-clone verification: one agent in a fresh clone, reading CI.
  5. Mark the PR ready (`update_pull_request`, draft false), then `merge_pull_request` with method `merge` and `expectedHeadSha`.
  6. Unsubscribe from the PR. Fast-forward the main checkout and run `pnpm install` there under the lock. Remove the worktrees and local branches (remote branches stay). Archive the summaries, then log.
  7. Read the push runs the merge starts.
- **Pushing:**
  - Every push goes through the pre-push hook (the fixture check and gitleaks). Never use `--no-verify`, never force, and never add a `.gitleaksignore` entry.
  - **A refused push of unpushed commits:** `git reset --soft origin/<branch>`, remove the flagged text, then commit and push again.
  - **What gitleaks flagged before:** the development master key, once. Keep keys out of files; the tour's `env.sh` derives the key at run time. Also, once, a document hash in an archived script; shorten such a hash to 8 hex digits and an ellipsis, as HANDOFF does.
- **Money code:**
  - The engine freeze: no non-test change under `packages/pricing`. Lane B pins defects with tests and hands them to Lane A's 6c.
  - The ledger: additions only.
  - A new pricing or ledger source file needs its shard in `stryker/shards.json`.
  - A survivor is killed with a test, or recorded as equivalent only when no input can tell it apart, with a reviewer who is not its proposer.
- **Records:**
  - workflow scripts go in `workflow-scripts/lane-b-*.js`, summaries in `approval-summaries/lane-b-*`, designs in `designs/lane-b-*`;
  - this log, after each step;
  - LANES.md's claim rows, when a state changes;
  - before reusing an archived script, rewrite its scratchpad constant (`SP`) to this session's scratchpad (HANDOFF.md, "Paths that moved").
  - Push `claude/build-ops` with rule 10's command.

### Where things are
- **Branches and checkouts:**
  - `/home/user/ops`: this branch, `claude/build-ops`;
  - `/home/user/PhysicalTherapy`: the main checkout of `claude/build-platform`, with the pre-push hook;
  - worktrees: `/home/user/<name>`, one per PR; the screen tour's is `/home/user/screens`.
- **Designs:**
  - the CI series: `designs/lane-b-ci.md`, with its scouts and review in `designs/lane-b-ci/`;
  - PR 15: `designs/lane-b-pr15-ledger-tests.md` and `designs/lane-b-pr15/`;
  - the UX brief: `designs/lane-b-ux-review-brief.md`; the review: `designs/lane-b-ux-review.md`, with its manifest, coverage, route map, raw findings and synthesis in `designs/lane-b-ux-review/`;
  - each parallel item's design: `designs/lane-b-<name>.md` (bank-account-first, db-function-diffs, superseded-rerun, unmapped-plan, pr15b, figures-in-words, narrative-draft, release-content-checks, model-eval-gate, materiality-cents, ux-forms, ux-suspended-standing, ux-brand-reviewer), with reviews beside them.
- **Records:**
  - summaries and reviews: `approval-summaries/lane-b-{ci-speed,ci-mutation,pr15}-*`;
  - workflow scripts: `workflow-scripts/lane-b-*`.
- **Tools:**
  - the screen tour: `tools/lane-b-screen-tour/` (its README, "From another lane" for any session). The first gallery: https://claude.ai/artifact/3WudgKdMPDcRik4Z5bxU3c, 30 screens of 9c57d2d. The baseline's: 1280 px https://claude.ai/artifact/NmJco1UsT631vdmXts8HHD and 390 px https://claude.ai/artifact/V1vzMZc3BrJ8mtw1HXG5jh. All private to the co-founder;
  - the gallery builder: `tools/lane-b-screen-gallery/`.
  - the machine: `tools/setup-container.sh`. It checks everything with `SETUP_CHECK=1`, and lays out Chrome for Testing for Playwright's pinned revisions, because the proxy refuses Playwright's own download hosts.

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
- **2026-10-25 ~13:50 UTC: ci-mutation built and reviewed; draft PR #44** (wf_62c3df65-d76 with its resume: 9 agents, 4.72M subagent tokens in all). Summary and reviews in `approval-summaries/lane-b-ci-mutation-*`.
  - **Scores** (gate, truncated, equivalents counted as survivors):

    | Package | Before | After |
    |---|---|---|
    | money | 93.22% | 97.00% |
    | ledger | 91.88% | 98.13% |
    | pricing | 91.47% | 98.57% |
    | packets | 85.61% | 95.87% |

    662 undetected mutants down to 165, each a reviewed equivalent. Of 175 proposed, the integrator signed 165 and rejected 10, which are now killed by tests.
  - **Checks:**
    - golden test per claim: `test:golden` 188;
    - ledger 0 deletions; LED-01 to LED-11 and the oracle unchanged;
    - the freeze clean;
    - every canary 5 of 5;
    - the gate's negative proof fails as it should.
  - **CI run 40195705539:** all six shards green (4:06 to 6:39), the `mutation` gate green with the local numbers, the workflow 7:35.
  - **Reviews:**
    - **payment-engine:** B1, two pricing records that a NaN lineNo tells apart; S1, a rounding kill by an off-type input; S2, a test stating that pricing a malformed year basis is the engine's rule; 5 nits. N4 is for Lane A: the engine sorts lineNo with `a - b`.
    - **ci-tooling-security:** B1, a PR that deletes a money test affects no package; SF1, fully-run is judged per shard, not per file; SF2, the changes guard fails open; SF3, Unicode-dependent equivalents on a floating Node; SF4, the data-file guard misses path forms; SF5, ADR 0066's Part 4 provenance lost in the rule-6 merge; SF6, importClosure misses workspace export forms; 7 nits.
  - **Fix round running** (wf_877c195a-66e). Two fixers in parallel: money-path tests and records; tooling, workflow and documents. Then the suite runner merges both, merges claude/build-platform if #43 has merged (rule 6), runs the full local suite once with all six shards, pushes once, and updates the PR body.
  - **For Lane A's PR 6c** (engine corrections, under the freeze): payment-engine N4 (a NaN line number leaves a claim's lines out of order) and S2 (a malformed in-type year basis is priced at the records in force rather than refused). Lane B does not change the engine; the fix round's report will give the exact cases.
- **2026-10-25 ~14:00 UTC: PR #43 (ci-speed, CI 1 of 4) MERGED as 9c57d2d**, Lane B's first merge.
  - **Verification** (wf_9d87a406-212, 0.60M tokens; `approval-summaries/lane-b-ci-speed-verify-summary.md`), fresh clone at b5ff4c7, every check of design 3.1.7 passed:
    - scope, 99 files, each named or recorded; the forbidden paths empty;
    - the freeze;
    - typecheck cold 67 s, warm 24 s;
    - lint, 1,457 files;
    - actionlint and the tools tests (470);
    - synth clean;
    - the stale-name grep, history only;
    - bounded db proofs, 576.
  - **CI figures:**
    - A1: median 7:26, worst 7:43, latest 6:17 (target 10:00 / 12:00); 37.6 runner-minutes;
    - A1′ 16:52, set by the capacity gate;
    - A2, no test lost: unit 4,658 + 1; db 9,040 + 1 = base − 2 moved + 1 new; golden 38; e2e 51;
    - the shard union, each shard's printed SHA-256 re-hashed, equals the unsharded list of 118 files;
    - A3: slowest db file 145 s; route files 45 to 57 s;
    - the differential test ran.
  - **Finding F1** (should_fix) was the PR description's text only: three statements stale after the fix round. It was corrected in the description; the verifier: "once the description is corrected the verdict is pass, with nothing to re-run". N1, three figures from an earlier head in ADR 0066, dependabot.yml and ci.md, rides ci-deps.
  - Marked ready, merged with a merge commit (base unchanged at 49514e8). Unsubscribed #43; main checkout fast-forwarded to 9c57d2d; the four ci-speed worktrees removed.
  - **For Lane A:** CI is now parallel jobs behind `all green` (about 6-8 min). A schema PR's missing approval line shows as the `domain model` check, no longer inside test:db. #42 picks this up when it merges `claude/build-platform`.
  - **Next:**
    - the first push run on 9c57d2d; when green, the founder's F7 ruleset (steps to the co-founder);
    - PR #44's fix round, which now merges 9c57d2d under rule 6;
    - PR 15's build (wf_c2a31a50-55d);
    - ci-deps when a slot frees.
- **2026-10-25 ~14:35 UTC: the first push runs on 9c57d2d are green:** `ci` (run 40201435875, 14:16 to 14:23 UTC, `all green` among its jobs) and `screening-capacity` (40201435976, to 14:28). **F7 is due:** the founder applies the `claude/build-platform` ruleset by `docs/runbooks/github-governance.md` step 4A. Its four required checks, each sourced from GitHub Actions: `all green`, `mutation`, `screening-capacity gate`, `approval-of-record`. Up to date required, PRs required with 0 approvals, no bypass, deletions restricted, force pushes blocked. Steps sent to the co-founder for the founder (an owner-admin setting the founder keeps, per the delegation).
- **2026-10-25 ~15:40 UTC: screen tour for the co-founder** (wf_8f5524d1-dad, 2 agents, 0.60M tokens; asked for, about 1% of usage). 30 screens (26 at 1280 px, 4 at 390 px), captured from the production build of 9c57d2d.
  - **How:**
    - the repository's own e2e setup, synthetic data only;
    - five unchanged e2e journeys filled the screens (layout-1280, packets, reconciliation, monitoring, billing);
    - the real sign-in flow as each role;
    - every image checked by a second agent.
  - Published as a private gallery: https://claude.ai/artifact/3WudgKdMPDcRik4Z5bxU3c (the co-founder shares it from its Share menu).
  - **Defects the tour found** (none blocks; candidates for a small Lane B fix PR or the final pass's 390 px work):
    1. At 390 px the ROI statement's PDF SHA-256 does not wrap, so the page renders 489 px wide.
    2. At 390 px the practice home's agreements table and the free screening's file-template table cut off their last column.
    3. At 1280 px, two wide tables on the screening result run past the right edge.
    4. To check: the practice home shows Actionable $0.00 while the ROI statement lists "Actionable in open cases: $30.00" for the same practice. The two count different things; the wording should say so.
    5. A notification reads "on 1 lines".
- **2026-10-25 ~15:55 UTC: container restart.** It stopped PostgreSQL, ci-mutation's fix round (wf_877c195a-66e) and PR 15's build (wf_c2a31a50-55d). Disk, worktrees, commits and the scratchpad survived; no scratch database was left.
  - **What had finished:** the ci-mutation fixers FA and FB had committed; the suite runner had merged them and claude/build-platform 9c57d2d (da4d7e9) and was in its full suite. PR 15's design review had run; its builder had pushed 0e56e01; no PR was open yet.
  - **Recovery (~16:10 UTC):** both clusters restarted by hand. Both runs resumed with resumeFromRunId: the cached agents replayed; the stopped agent was told to continue from its worktree, with every heavy command under the lock, one at a time. Scripts re-archived.
- **2026-10-25 ~16:40 UTC: `tools/setup-container.sh` lays out Playwright's Chromium from Chrome for Testing when the base image lacks it.** The base image of 2026-10-22 carries only 1.63's chromium-1243, and the proxy refuses Playwright's own hosts, so the step printed FAIL in every new container.
  - **What changed:** `step_playwright` now lays out the pinned revision from `storage.googleapis.com/chrome-for-testing-public`. Each zip's SHA-256 is pinned in CFT_BUILDS (1194 for Playwright 1.56.1, CfT 141.0.7390.37; 1248 for 1.64.1, CfT 156.0.8078.4, ready for ci-browser). The tree is built beside its final path and moved into place whole; check mode reports what is missing.
  - **Tested:**
    - both revisions laid out into a scratch directory by the script's own functions, the 1194 trees identical to the hand layout in /opt/pw-browsers (file lists, the headless binary byte for byte);
    - the 1248 trees identical to the scout's, the headless binary's SHA-256 the recorded 4fa61f0b…;
    - Playwright 1.56.1 launches from the laid-out tree;
    - `SETUP_CHECK=1` prints OK.
  - For Lane A too: its next container gets OK without the manual layout.
- **2026-10-25 ~16:50 UTC: the co-founder's decision (delegated): a UX/UI and brand review is the next Lane B session's first task.** The brief is `designs/lane-b-ux-review-brief.md`.
  - **What it does:** captures every page at 1280 px and 390 px. Five expert lenses review it: brand and visual design, flows per role, words, accessibility, 390 px and states. A synthesizer and one adversarial reviewer follow.
  - **Output:** ranked findings and proposed PRs for Lane B's queue. Anything needing a migration goes to Lane A.
  - **Cost:** about 3 to 4% of usage. No product code.
  - **Asked and answered the same hour:** several parallel Lane B chats would not be faster. They share one weekly allowance, add merge conflicts on shared files and CI re-runs, and cannot coordinate in real time. Instead: a fresh chat per milestone (the handoff), parallel agents inside each chat, and a separate chat only for work with no file overlap (for example the infrastructure PRs after #42) when usage allows.
- **2026-10-25 ~17:00 UTC: the co-founder's decision (delegated): the UX/UI review also runs with the build, not only once.** Added to `designs/lane-b-ux-review-brief.md`:
  - **The checklist:** the baseline review's first deliverable is `.claude/agents/ux-brand-reviewer.md`, in its own small Lane B PR.
  - **Every screen-changing Lane B PR:** the UX and brand review is one of its two adversarial reviews, with before and after screenshots of the changed screens at 1280 px and 390 px.
  - **Each milestone:** a light whole-app re-tour.
  - **Lane A:** the founder is asked whether Lane A's screen-changing PRs take the same reviewer.
- **2026-10-25 ~17:05 UTC: the co-founder recommends that Lane A's screen-changing PRs take the same UX and brand reviewer.** Lane A's pipeline is the founder's (the delegation covers Lane B's work), so this goes to the founder. A ready line for the founder's chat was given to the co-founder: adopt it in LANES.md rule 1 as a rule both lanes follow, using `.claude/agents/ux-brand-reviewer.md` once Lane B's checklist PR merges. Lane B does not edit LANES.md's rules.
- **2026-10-25 ~17:45 UTC: PR 15 built and reviewed; draft PR [#45](https://github.com/PureTideWater/PhysicalTherapy/pull/45)**, head 0e56e01 (wf_c2a31a50-55d with its resume: 4 agents, 0.87M subagent tokens). Summaries and reviews in `approval-summaries/lane-b-pr15-*`.
  - **Design review:** 4 should_fix, 6 nits. SF-1, LED-12's cash assertion needed a posted and deposited path on the reversal's remittance: two synth posting CSVs and two new tests. SF-2, "recouped once" against a withheld forward balance. SF-3, one LED-12 text in four places. SF-4, 15b is Lane B's. All fixed in 9437754 and 0e56e01; N-5 (a line with two approvals) handed to 15b's design.
  - **CI on 0e56e01:** every job green.
  - **Reviews** (payment-engine; test and fixture integrity): 0 blocking, 0 should_fix, 10 nits.
  - **Fix round running** (wf_bc33f972-a3a): the ten nits, the full local suite once with one heavy step at a time, one push, the PR body. Subscribed to #45.
  - **The co-founder's approval** of LED-12's row wording, as recommended (his "every recommended" direction under the delegation), goes into item 15.
- **2026-10-25 ~18:30 UTC: ci-mutation's fix round done; PR #44 head 7542aae, CI all green** (wf_877c195a-66e with its resume: 3 agents, 0.40M on the resume). Reports in `approval-summaries/lane-b-ci-mutation-fix-{fa,fb,suite}.md`.
  - **All 22 findings fixed.** Both blocking ones:
    - the two pricing records a NaN line tells apart are deleted, and a test kills both mutants;
    - a deleted or renamed money test or data file now affects its package.
  - **The suite's re-read** fixed 5 more.
  - **Full local suite once, all pass:**
    - unit 4,986 + 3 skipped, branches 100% (money 56/56, pricing 594/594, ledger 415/415, edi835 714/714);
    - golden 188; oracle 630;
    - test:db in six sequential shards, 9,040 + 1 = every db file once;
    - e2e 51 with `E2E_PREBUILT=1` on the stamped build;
    - canary 5 of 5 in every shard.
  - **The gate passes, the same locally and on CI:** money 96.58%, ledger 98.13%, pricing 98.67%, packets 95.87%. That leaves 164 undetected mutants, each a reviewed equivalent.
  - **CI run 40219164530:** every job green, the six stryker jobs 4:05 to 10:06. `all green` took 16:01 because e2e (2/2) took 14:36 (the verifier says whose).
  - **Handed to Lane A** (LANES.md): four frozen-engine defects for PR 6c.
  - **Open:**
    - payment-engine/S1, whether text cast past `Cents` should be refused by an explicit MoneyError guard in `multiplyCents` (a later money change; the co-founder decides under the delegation);
    - O7, rebalance `stryker/shards.json` if packets-rest nears 15 minutes.
  - **Running:** the fresh-clone verification (wf_13f42dd4-505).
- **2026-10-25 ~18:50 UTC: PR #44 (ci-mutation, CI 4 of 4) MERGED as de8f9b5.**
  - **Verification** (wf_13f42dd4-505, 0.31M tokens; `approval-summaries/lane-b-ci-mutation-verify-summary.md`): pass at 7542aae, every check.
    - scope (pricing tests only; the ledger 12 test files with 0 deletions; money's one non-test line, cents.ts:85; golden and migrations untouched); the freeze with PR_NUMBER=44;
    - golden 188, the claim-set test green; the ledger db tests and the oracle (LED-01 to LED-11, 1,285 passed in 11 files);
    - the canary 5 of 5; the money-ledger shard and the gate passing; the negative proof (one deleted assertion fails the gate, naming cents.ts:114);
    - typecheck, lint, actionlint, 840 tool tests, synth clean;
    - **CI:** six shards each with its canary 5 of 5, 4:05 to 10:06; the gate the same as locally; 164 records, none self-reviewed.
  - **The 15:58 A1 was the runner's:** e2e (2/2)'s apt download crawled at 43 kB/s from one Azure Ubuntu mirror; e2e (2/2) took 4:41 on 9c57d2d.
  - **Nits:**
    - V1 and V2, the PR description's wording on how `mutation` is enforced, and A1′ (16:08): corrected in #44's description after the merge;
    - V3, for ci-browser: cache the e2e jobs' system packages (playwright install --with-deps) so a slow mirror cannot set A1;
    - V4: O7, rebalance stryker/shards.json if packets-rest nears 15 minutes.
  - **Merge:** marked ready and merged with a merge commit (base 9c57d2d, unchanged since its rule-6 merge). Unsubscribed #44; the main checkout fast-forwarded to de8f9b5; the eight ci-mutation worktrees and branches removed.
  - **PR #45 (PR 15) now merges claude/build-platform at de8f9b5 under rule 6 before its own merge:** the test matrix, the synth registry, totals.test.ts, README and reconciliation-001, keeping both.
- **2026-10-25 ~19:30 UTC: PR #45 closing out; the handoff written.**
  - **PR #45's fix round** (wf_bc33f972-a3a) is done: head b7e15e8, all ten nits fixed, and the full local suite passed once.
    - The fixer committed 539cd23 and 8eeef29; the suite runner's re-read added b7e15e8.
    - Unit: 4,664 and 3 skipped, ledger branches 415/415. Golden 38. Oracle 637.
    - test:db in six shards: 9,049 and 1 skipped, the two ledger files 51/51. e2e 51.
    - CI on b7e15e8 was green, with every mutation shard passing on the merge ref.
  - **Rule 6:** merged claude/build-platform at de8f9b5 into the branch as f4d125b. The merge was clean: the six files both sides changed (README, reconciliation-001, test-matrix, totals.test.ts, matrix.ts, registry.ts) merged by hunk. The checks on the merged head followed (next entry).
  - **Handoff:**
    - the "Start here (Lane B)" section above replaces "In flight", "Next" and Lane A's first-session notes;
    - COFOUNDER-START.md's message points at it;
    - LANES.md's CI series row and queue item 1 now record the two merges.
  - **The screen tour no longer names this session's scratchpad.** Every script and spec reads `TOUR_DIR`, and a new `setup.sh` builds the worktree and the working directory (its README, Set-up). Shell and Python syntax checked.
  - **Pitfall found:** the shell's default `node` is 22. A check script started without the PATH line ran on it, and was stopped and re-run on Node 24 (now in Start here).
- **2026-10-25 ~20:05 UTC: PR #45 (PR 15, ledger tests LED-12 and LED-13) MERGED as 6ddd587.** Reconciliation-001 item 15 is done.
  - **Checks on the merged head f4d125b:** each one under the lock, on Node v24.22.0. All passed:
    - install, fixtures (248 read, 2,809 searched), typecheck, lint (1,487 files), synth (clean);
    - unit: 4,994 and 3 skipped;
    - the ledger db files: 51/51;
    - the money-ledger canary: 5/5;
    - the shard (2:56) and the gate: money 96.58%, ledger 98.13%, `ledger.json`'s 31 records unchanged, none stale or killed.
  - **Pushed** b7e15e8..f4d125b through the hook.
  - **CI on f4d125b:** all 22 runs green (`notify` skipped by design).
    - `all green` at 13:10; db (4/4) spent 10 minutes installing the browser's system packages (V3, now in ci-browser's carry-ins).
    - Mutation chose money-ledger only.
    - screening-capacity measured, because synth's case files are watched. It passed with the advisory S4 time (53.1 to 53.8 s), the same as the base's push run.
  - **Verification** (wf_d8645c76-19d, 0.48M tokens; `approval-summaries/lane-b-pr15-verify-summary.md`): every code, CI and scope check passed.
    - The merge tree reproduces exactly. The scope is tests and documents.
    - db +9 on CI over identical shard file lists.
    - The rows match word for word in seven places. Item 15 names the founder, the relay and the co-founder's approval.
    - The fix round's dispositions hold, with four mutants re-run.
  - **Its one should_fix was in the description:** it said 1 more unit test, but CI runs 8 more (the LED-13 property plus 7 parse cases for LED-12's 835s), because the base count had been taken from `vitest list`. Three nits were also fixed: stale section references, CI on the head, and the capacity note. The description was corrected by `update_pull_request` and read back byte for byte through `gh api`. Nothing needed a re-run (#43's precedent).
  - **Merge:** marked ready, then merged with a merge commit at the expected head f4d125b (base de8f9b5 unchanged).
  - **Clean-up:**
    - unsubscribed #45; the main checkout fast-forwarded and its packages installed;
    - `/home/user/pr15` and the local branch removed (the remote branch stays, as for every merged PR);
    - the fix-round, fix-suite and verification summaries and the verify script archived;
    - `SETUP_CHECK=1` printed OK.
  - **Lane B now has nothing open.** The next session starts at "Start here (Lane B)": the UX/UI baseline review, then ci-deps, ci-browser and 15b.
- **2026-10-25 ~20:35 UTC: the handoff reviewed and corrected; 6ddd587's red push run triaged.**
  - **The review** (wf_22368784-06b, 0.67M tokens; script archived) ran two read-only agents: a cold-start critic walking COFOUNDER-START's message, and a fact-checker against git, GitHub and the files. They returned 51 findings, 6 of them blocking, all applied:
    - **ci 40229005858 on 6ddd587 had failed** in e2e (2/2) after Start here was written: a screening-journey timing flake. One re-run of the failed job passed (attempt 2), and the flake went to Lane A under "Handed to Lane A".
    - **The screen tour never prepared its database.** serve.sh now runs `e2e/prepare.ts` first.
    - **COFOUNDER-START's step 1** would have passed unstarted branches named in the claims. It now passes only the branches Start here lists as open.
    - **#33 is now node:26-slim,** which ci-deps declines. #38 was closed by Dependabot because Stryker 10.1.1 was under three days old under `minimum-release-age`.
  - **The should_fix and nit findings, each applied:**
    - **Already ruled:** the founder's 2026-10-20 adoption of the combined audit already rules 15b's #12, #32 and #30. LANES.md items 3, 10 and 14 are for Lane A to amend.
    - **Not yet in place:** chromium-1248 is pinned but not laid out.
    - **Stale or wrong:** ci-deps' design predates ci-speed and ci-mutation (a scout re-reads it first); the misquoted ADR 0066:333 nit; the capacity times (now up to 18:32); #43's merge time (14:16 UTC).
    - **Contradictions:** the CI series against #42's files (a step-1 question to the co-founder); restart handling, now the same in COFOUNDER-START and here; HANDOFF's older Start here, which this section now outranks.
    - **The UX brief:** the route map, dark tokens only, a private gallery for the screenshots, the cost estimate method, the right audit numbers, legal text staying the founder's, and the queue ruling.
    - **The checklist PR:** its pipeline.
    - **The tour:** the master key derived at run time, `TOUR_MINUTES`, `TOUR_REF`, a reliable stop, the gallery template path and the README's accuracy.
    - **Records:** the line for the founder's chat, recorded verbatim; the rulings' sources and times.
  - **The tour run end to end at 6ddd587** with the fixes (`TOUR_DIR` in this scratchpad). The first run caught one more defect: run.sh found the server by matching its path in the process list, and failed when build.sh was started by a relative path. A pid file fixes it, and a stop touched during the build now holds. The second run's setup, prepare, build and server start passed, then the populate journeys; the capture's result follows.
- **2026-10-25 ~20:40 UTC: the screen tour's end-to-end run finished; the machine left clean.**
  - **The run, at 6ddd587** (20:28 to 20:36 UTC):
    - setup, prepare ("migrated and seeded"), build and the server passed;
    - the 6 populate journeys passed;
    - `tour.spec.ts` captured 27 PNGs, writing `shots.json` and `ids.json`;
    - the server and the lock stopped together, leaving port 3297 free.
  - **One more defect, fixed:** run.sh's capture also ran the two retake specs. With one worker they run in file order, so `mapping.spec.ts` ran before the tour had written `ids.json`, and failed. run.sh now captures `tour.spec.ts` alone; the retakes stay redo.sh's.
  - **Cleaned up:**
    - the smoke worktree `/home/user/screens`;
    - the leftover synthetic databases (`tp_e2e_cimut`, and `tp_e2e_screens` after the run);
    - every stale `/tmp/tp-e2e-*` directory.

    No worktree, database or server of Lane B's is left.
  - **The handoff is complete.** The next session starts at "Start here (Lane B)".
- **2026-10-25 ~20:50 UTC: a new Lane B session; machine built; the UX review claimed.**
  - `tools/setup-container.sh` (from claude/build-ops 3ffdc83, no branch arguments: Start here lists nothing open in Lane B) printed OK: PG18 18.4 on 5433, PG16 16.15 on 5432, Node v24.22.0, both venvs, actionlint 1.7.7, gitleaks 8.24.3, pnpm 10.28.0, Playwright 1.56.1's chromium-1194, the main checkout at 6ddd587 with the pre-push hook, `/home/user/ops` at 3ffdc83.
  - `gh api user --jq .login` prints `PureTideWater`, as ruled.
  - **GitHub, checked against Start here:** `claude/build-platform` at 6ddd587; its push runs green (ci 40229005858 on attempt 2, mutation 40229005837, screening-capacity 40229005836). Open PRs: #42 (draft, 13f59b1), Dependabot #40 and #33. Rulesets `[]` (F7 not yet applied); default branch `main`.
  - Read LANES.md, Start here (Lane B), HANDOFF.md's Start here, standing rule, who decides, owner decisions and the dated rulings of 2026-10-20 to 2026-10-24, CLAUDE.md and reconciliation-001's checks at 6ddd587.
  - **Claimed** the UX/UI and brand baseline review and its checklist PR (`co-001/ux-brand-reviewer`) in LANES.md: no ADR, no test-matrix or synth IDs. Next free ADR still 0067.
  - **Next:** the co-founder's usage reading and the step-1 questions, then the route-map scout.
- **2026-10-25 ~21:05 UTC: the co-founder's rulings on Q2, Q3 and Q4 recorded; mobile GitHub steps given.**
  - **Direction (co-founder, 2026-10-25 ~21:05 UTC):** "All recommended options as long as it's the best option." Applied as rulings on the three open step-1 design questions:
    - **Q2 (CI series and #42's files):** rule 6; the PR merged second keeps both, the lockfile re-resolved and never hand-merged; axe runs over #42's pages (O6) if #42 merges first; ci-browser does not wait for #42 to merge.
    - **Q3 (scope of "every recommended option"):** pre-approves engineering-only choices inside an already-ruled design, recorded as his rulings and reversible; batches with wording, brand, product, cost or security trade-offs still go to him.
    - **Q4 (`ux-brand-reviewer.md`'s `model:` key and checklist suite):** `model:` follows the other reviewer files (rule 12); the checklist PR takes a documentation-only suite (typecheck, lint, lint:copy, unit).
  - **Still open:** Q1, the usage reading: the current % and the reset time's time of day (rule 9).
  - **Mobile GitHub steps for F7** given in chat (mobile browser → desktop site, https://github.com/PureTideWater/PhysicalTherapy/settings/rules, as the account owner).
  - **Next:** the co-founder's usage reading, then the route-map scout.
- **2026-10-25 ~21:10 UTC: Lane A's screen-changing PRs take the same UX and brand reviewer (ruled).**
  - **Ruling (the co-founder, acting for the founder, 2026-10-25 ~21:10 UTC):** every pull request that changes something a person sees — in both lanes — takes the UX and brand review (`.claude/agents/ux-brand-reviewer.md`, once Lane B's checklist PR merges) as one of its two adversarial reviews, with before and after screenshots at 1280 px and 390 px.
  - Added to LANES.md "Handed to Lane A". Removed from "Waiting on someone". Lane A adds it to rule 1.
  - **Next:** the co-founder's usage reading, then the route-map scout.
- **2026-10-25 ~21:15 UTC: F7 applied: the ruleset "Protect the build branch" on `claude/build-platform`.**
  - **Applied by the co-founder** on the `PureTideWater` owner account, under the founder's F7 ruling (2026-10-25 ~01:10 UTC).
  - **The first save (21:07:53 UTC) did not match runbook step 4A.** The session read it through the rulesets API and found three problems, and a name that differed:
    - it targeted no branch (`include: []`), so it protected nothing;
    - `all green` was required twice, once from any source, which a plain commit status could fake;
    - the pull-request rule had `require_extra_approval_for_unattributed_changes` on. Step 4A does not list it, and GitHub's documentation could not be found. It could have demanded an approval that the build's own account cannot give.
    - The name was "build-platform", taken from this session's own mobile steps; the runbook's check looks for "Protect the build branch".
  - **Corrected at 21:14:05 UTC; re-read and matching step 4A on every point.** The fields are in "The state in one screen". `rules/branches/claude/build-platform` returns its four rules. ci, mutation, screening-capacity and approval-of-record each run on every pull request, with no path filter, so no required check can leave a merge waiting forever.
  - **Two other things are open.** Step 4B (`main`'s two rulesets) and step 4C (the release-tag rulesets) do not exist, and HANDOFF does not schedule them. They are the founder's, under "Waiting on someone".
  - **Next:** the co-founder's usage reading, then the route-map scout.
- **2026-10-25 ~21:20 UTC: usage 28%; the co-founder: "Go as far as we can."**
  - Reset Friday 2026-10-30, time of day not given. 52 points to the ~80% line over about 4.5 days, about 11.5% a day.
  - **Applied as:** two heavy workflows at once, back to back, with no new heavy run past ~80%, none cut off mid-way, and a reading asked at each checkpoint. The UX review is the first; ci-deps' scout and design review run beside it.
  - **The UX review's cost estimate:** given to the co-founder when capture is done, as the brief says. Under "go as far as we can", the reviewers start straight after, unless the estimate is more than twice the brief's 3 to 4%.
- **2026-10-25 ~21:22 UTC: the container had restarted; machine rebuilt; two workflows started.**
  - PostgreSQL was down after a container restart (the session stayed open). `tools/setup-container.sh` was re-run with no branch arguments, and printed OK, both clusters started.
  - **The UX baseline, part 1** (wf_b56fe7b4-652; script archived). Steps:
    - four scouts map the 83 routes (persona, records, the spec that creates them, states), and a critic checks the map for completeness and writes `designs/lane-b-ux-review/route-map.{json,md}`;
    - one agent extends `tools/lane-b-screen-tour` on this branch, so every reachable route is shot at 1280 px light, 1280 px dark (tokens only) and 390 px light, plus the states the map names (states at 1280 and 390, light). The tour gets a `TOUR_ONLY` filter for retakes. The agent runs the tour under the lock (`TOUR_MINUTES=90`, a bound of about 150 minutes held) and leaves the port and the database clean;
    - checkers look at every image; one retake round follows, then the manifest, `coverage.md` and the five reviewer image sets.
  - **ci-deps' design re-read** (wf_c51b25c9-e94; script archived). Two scouts check the files and the versions against 6ddd587. An author brings §3.2 current, adding §3.2.6. One adversarial reviewer follows, then every finding is resolved in §3.2.7. No heavy command runs in it.
  - Neither workflow commits; the session reviews their files and commits them.
  - **Next:** the capture's result → the cost estimate to the co-founder → the five reviewers. ci-deps' re-read → its builders.
- **2026-10-25 ~21:27 UTC: the co-founder's standing direction: "If you ever discover a way to improve or optimize something as you're building do it. Always do this."**
  - Recorded under "Rulings and decisions of record", and as the convention "Improve as you go": inside the current PR when it fits, its own next PR otherwise, Lane A's when it needs a migration or frozen code, and the co-founder first when it touches wording, brand, what a person sees, cost or security.
  - The two running workflows are not stopped: their prompts already let the capture agent improve the tour tool and the ci-deps author make the best engineering choice. Every later workflow prompt carries the direction.
- **2026-10-25 ~21:34 UTC: the co-founder's ruling: "Apply wording and visible changes without asking me first."**
  - Wording, brand and anything a person sees now take the recommended option at once, within the brand rules, CO-11 and the PRD. Each is reported to him afterwards, in the PR description and this log, and he may reverse any.
  - **Still to him first:** cost and security trade-offs. **Still the founder's, through him:** the domain model, release tags, owner-admin settings, legal text and any reversal of a founder ruling.
  - **The UX review follows it.** Its wording, brand and dark-mode choices take their recommended options and are reported. Its proposed PRs are claimed as queued in LANES.md's Claims table, under "improve as you go", and reported; he may reorder or drop any. The brief and Start here say so.
  - **Unchanged:** ci-browser's A9 inspection of the regenerated baselines stays his. It is the design's acceptance check by a person, not a choice.
- **2026-10-25 ~22:45 UTC: both workflows had stalled since 21:27; resumed with progress files.**
  - **What happened:** at 21:27:28 UTC the co-founder interrupted the session's reply to send a message. The interrupt also cut off all four running workflow agents (the two route-map scouts and the two ci-deps scouts). Each transcript ends at that second with "[Request interrupted by user]". No agent had returned, so nothing was cached. The workflow tasks ended without a completion notice and sat idle until the co-founder asked at 22:40.
  - **Fixed in both scripts (RESUMED notes; archived):** every agent keeps a progress file in the scratchpad (`progress/`, `ci-deps-progress/`) as it goes. If one exists at its start, it continues from it, so a cut-off agent loses at most its last step. Both prompts now carry "improve as you go".
  - **Resumed** with resumeFromRunId at ~22:45 UTC; nothing was cached, so both start again from their first agents.
  - **Watchdog:** a monitor reports each agent's finish, and any 10 minutes in which no agent writes, so a silent stall is seen within minutes.
  - **Pitfall, for Start here:** an interrupt of the main session (the stop button, or sending while a reply is running) also stops background workflow agents. A plain new message sent after a reply has ended does not.
- **2026-10-25 ~23:40 UTC: usage 32%. The co-founder lifts the pacing; Lane B runs in parallel sessions until Tuesday.**
  - **His words:** "Just use whatever tokens you need we have plenty what can you do to speed this build up? Use whatever you need we are at 32% and I am switching to lane A on Tuesday. So use whatever you need by Tuesday. Just to get this sped up but don't sacrifice any quality, needs to be optimized in every angle."
  - **Ruling (the co-founder, 2026-10-25 ~23:40 UTC):**
    - rule 9's pacing of about 11% a day is lifted until Tuesday 2026-10-27;
    - no usage reading is needed before a heavy run;
    - never cut a run off mid-way. The session keeps a margin, so no run starts that the allowance could not finish.
    - **By Tuesday:** every Lane B item is merged, or at a clean, recorded stopping point in Start here, because the co-founder then switches to Lane A.
  - **Calibration:** 28% → 32% from 21:17 to ~23:40, over about 4.5M agent tokens (input, output and cache writes) plus the session's own, about 1.1M per 1%.
  - **The speed-up: parallel Lane B sessions, each in its own container.** This container's 4 CPUs and its one heavy lock queue every item behind the screen capture. The 2026-10-25 ~16:50 answer ("parallel chats would not be faster") rested on a shared allowance, merge conflicts and no coordination. The allowance no longer binds. The items taken share no files with each other or with #42. This session coordinates them through the session tools and their status files.
    - The founder's "at most two heavy workflows at once" is a limit per 4-CPU machine, so each container keeps it.
    - Every stage of the pipeline stays in every session.
  - **Claimed centrally** (LANES.md Claims, with their numbers), each for its own session:
    - PR 15b (ADR 0067, LED-14 to LED-18);
    - #111 (ADR 0068 if needed, DBF-01 to DBF-05);
    - #10 (ADR 0069 if needed, PRC-25 to PRC-28);
    - #84 and #120 (ADR 0070, MOD-07 to MOD-12; corrected from MOD-7, since the matrix pads to two digits).
    - **Why these:** they are queue items 3, 4, 5 and 12, the next ones free of shared files. Items 6 to 10 change screens and wait for the UX baseline's findings, so they take them in. #49 waits for #42. #113 follows ci-deps' CLAUDE.md line.
  - **Rules the parallel sessions keep:**
    - Only this session edits LANES.md and lanes/lane-b.md. The others write only their own designs, summaries, scripts and a `approval-summaries/lane-b-<item>-status.md`, pulling before each push.
    - Each merges its own PR when green and verified, as "Merging" says. If the base moves first, it merges the base again (rule 6) and waits for CI on the new head.
    - Cost and security questions come to this session, which takes them to the co-founder.
  - **ci-deps** moves to its own session once its design re-read finishes, so this machine stays with the capture and the review.
- **2026-10-25 ~23:49 UTC: four parallel Lane B sessions started** (create_session, the same environment and model, auto mode). Each runs the full pipeline for one item and keeps `approval-summaries/lane-b-<name>-status.md` current:

  | Item | Session | Branch | Status file |
  |---|---|---|---|
  | PR 15b (#12) | session_01Rv82bANhoRiK91FKEN7Pff | `co-001/pr-15b-ledger-payment-terms` | `lane-b-pr15b-status.md` |
  | #111 | session_01BcoCApZmuH8eWJEys32HQK | `co-001/db-function-diffs` | `lane-b-db-function-diffs-status.md` |
  | #10 | session_01CwzySVsjqgoXijLDMKj7VG | `co-001/superseded-rerun` | `lane-b-superseded-rerun-status.md` |
  | #84 and #120 | session_01FmreSD8rXTREwwBkY2B4wh | `co-001/model-eval-gate` (and `co-001/contract-phi-check` if split) | `lane-b-model-eval-gate-status.md` |

  - PR 15b's session was started first and checked: it took the brief and began the setup. Then the other three were started.
  - Each brief holds:
    - the item and its rulings, and the reserved numbers;
    - the bootstrap command, and what to read;
    - the pipeline, the merge procedure under the ruleset, and the decision rules (Q3, the visible-change ruling, cost and security to the co-founder through this session);
    - the records rules, the SAVE rule for workflow agents, the Tuesday 12:00 UTC deadline, and the never-list.
  - This session watches their status files, takes their questions to the co-founder, and logs their merges here.
- **2026-10-25 ~23:50 UTC: a fifth parallel session: the release content checks (#7, #30, #31, #59; queue item 14)**, session_01W9rDrzhJaxXahvsufd7yC4, `co-001/release-content-checks`, status `approval-summaries/lane-b-release-content-checks-status.md`.
  - Claimed with ADR 0071 if needed and RCC-01 to RCC-08 (a new series).
  - #30's content-pipeline exception is already granted (2026-10-20 adoption). #59's parts in #42's files (`monitoring.ts`, `fields.ts`) are split into a later PR after #42 merges.
  - Its `publish-content.yml` overlap with ci-deps (F4) is resolved under rule 6.
- **2026-10-26 ~00:05 UTC: #111's session: design reviewed, no migration; a coordination step handed to Lane A.**
  - Its design review took all 17 findings. There is no workflow change, and the domain model's text and hash are unchanged.
  - After it merges, `db:domain-model --out` also writes one SQL file per database function, checked in CI. If #111 merges first, #42 commits those files before the founder signs its approval line. Added to LANES.md "Handed to Lane A".
  - **The UX route map is done** (`designs/lane-b-ux-review/route-map.{json,md}`, committed with the review): all 83 pages are reachable on synthetic data, 35 from the seed and 48 after the populate journeys.
    - Six extra entries name pages that do not exist. They came from this session's own scout file lists, which were partly retyped from a truncated listing instead of copied from the generated file. The checker caught all six and added the real pages that were missing; the six are removed before the map is committed.
    - **Lesson:** pass a generated list to a workflow verbatim (read the whole file), never retyped.
- **2026-10-26 ~00:20 UTC: the co-founder: "Don't ask for approvals anymore just build and optimize."**
  - **Ruling:** every Lane B choice takes the recommended option without asking him, cost and security trade-offs included (security: the safer option). Each is recorded with its reasons and reported afterwards. The "Improve as you go" convention says so.
  - **Unchanged, because they are not his to give** (LANES.md delegation of 2026-10-25): the domain model's approval, release tags, owner-admin settings and legal text's sign-off stay the founder's. Lane B does not ask about them. It records each one where it is needed, under "Waiting on someone", for the founder and Lane A.
  - **The approval question of ~00:10 UTC** (whether the co-founder may approve in his own name) is dropped. It is noted for the founder: a dated delegation line in LANES.md plus a small governance PR would let the co-founder's own approval count as the approval of record. Lane B never signs the founder's name.
  - Sent to all five parallel sessions: decide and record, never wait on a question.
- **2026-10-26 ~00:30 UTC: the parallel sessions' briefs corrected on #42's shared documents.**
  - The briefs said "never touch a file #42 changes". That is stricter than LANES.md, which lets the shared documents follow rule 6.
  - #42 changes four of them: `docs/product/test-matrix.md`, `docs/product/reconciliation-001.md`, `packages/synth/src/cases/matrix.ts` and `registry.ts`, plus amendments to older ADRs. Every new test-matrix row also needs its matrix and registry entries (`packages/synth/src/fixtures.test.ts`). PR 15 changed all of them while #42 was open.
  - Sent to all five: add rows and entries there under rule 6 (the PR merged second keeps both), and leave every other #42 file alone.
  - #111's reservation is widened to synth cases DBF-01 to DBF-05 (no-file entries). Its session had held back for want of that.
  - **Messages to the sessions do not interrupt them:** they arrive as queued notifications, which the session reads between steps (seen in #111's transcript).
- **2026-10-26 ~00:25 UTC: two more parallel sessions, and two follow-on items for warm sessions.** Each was checked against #42's 143 files and the items already running.

  | Item | Session | Branch | Status file |
  |---|---|---|---|
  | #38, then #48 (queue items 7 and 9; the packet pages) | session_01DMD91cYkbNgkEp1nmeSwpy | `co-001/figures-in-words`, then `co-001/narrative-draft` | `lane-b-figures-in-words-status.md` |
  | #135 (queue item 13; billing pages, not #42's worker billing files) | session_01SbDNvf4ojucLA3uyPfs1FC | `co-001/bank-account-first` | `lane-b-bank-account-first-status.md` |
  | #46 (queue item 6), after 15b merges | PR 15b's session (session_01Rv82bANhoRiK91FKEN7Pff) | `co-001/verified-seal` | `lane-b-verified-seal-status.md` |
  | #32 (queue item 10), after #10 merges | #10's session (session_01CwzySVsjqgoXijLDMKj7VG) | `co-001/unmapped-plan` | `lane-b-unmapped-plan-status.md` |

  - #46 shares the report code with 15b, and #32 shares the pricing-run code with #10, so each follows in the warm session rather than running beside it.
  - Every screen-changing PR takes the UX and brand review, with before-and-after screenshots, and folds in the baseline's findings on its screens once `designs/lane-b-ux-review.md` lands.
  - The new briefs carry the 00:20 ruling (decide without asking) and the rule-6 exception for #42's four shared documents.
  - **Not started, with why:**
    - ci-deps: its re-read is finishing here; it then gets its own session, and ci-browser follows in it;
    - #113: after ci-deps' CLAUDE.md line;
    - #49 and the post-#42 items 15 and 16: they wait for #42;
    - #52: legal text, the founder's sign-off;
    - #138, the formatter: both lanes idle;
    - #122: after PR 16.
- **2026-10-26 ~00:40 UTC: ci-deps' design re-read done (wf_c51b25c9-e94: 5 agents, 1.85M subagent tokens, 1 h 52 min). ci-deps and ci-browser handed to a parallel session.**
  - **Scouts** (`designs/lane-b-ci/scout-ci-deps-reread-{files,versions}.md`):
    - the action table is still current;
    - the file and line references and the stale branches are fixed. Examples: PINNED now at `workflows.test.ts:77-92`; a vacuous `actions/cache@v4` check at `:686`; `supply-chain.yml` deleted.
    - compose's healthcheck must use TCP (`pg_isready -h 127.0.0.1`), because the socket answers first;
    - and more: the full lists are in the reports.
  - **The adversarial review** (`designs/lane-b-ci/ci-deps-reread-review.md`): 1 blocking, 20 should_fix, 16 nits. All 37 were verified and fixed (§3.2.7). B1 was half right: Dependabot's peer probe passes an uncapped 7- or 14-day gate to pnpm, so majors and minors would silently get no PR.
  - **Three security choices, each taken as recommended under the 00:20 ruling** (recorded at the end of §3.2.7):
    - CQ1 (a): npm cooldown 3 days, the same as `minimumReleaseAge`;
    - CQ2 (a): `trustPolicyExclude` for semver 6.3.1 alone;
    - CQ3 (a): packageManager's pnpm held to the three-day age.
  - **Improvements outside ci-deps (P1 to P8):**
    - P1 (pins and digests held to three days; recommended yes), P2 (trivy's version), P4 (a narrower mutation trigger) and P5 (catalog lines) are claimed as their own PRs, under the CI follow-ups row;
    - P3 (pnpm 11's trustLockfile) and P6 (re-read the ruleset after runbook step 2) are notes for later;
    - P7, this log's Dependabot resume time, is fixed: 2026-10-26T19:18:50Z.
  - **The CI session:** session_01TztFLKnDUJniegCFmkfMoc. It runs ci-deps, then ci-browser (re-read first, with the V3, O6 and O7 carry-ins and shell.tsx under Q2), then P1, P2 and P4. Status in `approval-summaries/lane-b-ci-deps-status.md`.
    - **A9**, the inspection of the regenerated baselines, falls under the 00:20 ruling: an adversarial visual-inspection agent at full resolution, plus a private gallery the co-founder may look at. It does not block the merge.
    - **When ci-deps merges,** this session gives the co-founder the steps for F1 (a), F2 (a), then F3. Owner-admin settings are never changed by a session.
  - **Eight parallel sessions now**, plus this one (the UX capture, then its review and the checklist PR).
- **2026-10-26 ~00:42 UTC: PR 15b's session: design written, in review. One part handed to Lane A.**
  - All of #12's payment-terms amounts, and "billable to the patient", need no migration (checked against every CHECK and trigger they write through).
  - The stored case close "payer corrected; balance is the patient's" needs DDL on case and case_line. Added to LANES.md "Handed to Lane A", for PR 8's case schema; 15b records the outcome without it.
  - **Taken as recommended under the 00:20 ruling** (design §0.5):
    - Q1: 15b records the outcome, with words from stored rows, and the stored close goes to Lane A;
    - Q2: a reprocessing that raises or keeps the allowed amount but pays less is matched "decreased", and takes back the payment fall, capped.
- **2026-10-26 ~01:05 UTC: the #84/#120 session's design is reviewed; the build started.**
  - **Two PRs, no migration:**
    - `co-001/model-eval-gate` (#84: the gate, evaluation set v2, faults, per-feature serving; ADR 0070 Parts 1 and 2);
    - then `co-001/contract-phi-check` (#120; Part 3).
  - **`tools/screening-capacity/watched-paths.txt`** (a #42 file) is generated and held by its unit test. It is treated like the lockfile under rule 6: each PR regenerates it, the one merged second regenerates again, and nobody edits it by hand. This is within the co-founder's Q2, so confirmed.
  - **Handed to Lane A (LANES.md):**
    - F3: compact lookup hashes with a SECURITY DEFINER screen function, #120's best option. Until then the PR refuses fail-closed above 50,000 identifiers;
    - F4: a reviewed correction of a document's kind.
  - **For the founder, under "Waiting on someone":** F1, the gate's floors (unset, failing closed, needing model access); F2, the data-rights addendum (legal text).
  - **Fixed:** the matrix's IDs are padded to two digits, so the reservations now read MOD-07 to MOD-12 and MAP-06 to MAP-10. Sent to the #84/#120 and #10 sessions.
  - **The UX capture** is in its first full run (from 00:30 UTC; the populate journeys passed, 93 PNGs by 00:47).
    - The container had restarted again at about 22:40 UTC, and the capture agent started PG18 by hand.
    - The agent also ran `git checkout --` on `tools/lane-b-screen-tour/{build,setup}.sh` in `/home/user/ops`, to undo its own first edits to those two files. Both were clean before, so nothing was lost; it reported the breach itself. The session checks the ops tree before every commit.
- **2026-10-26 ~01:20 UTC: #38 and #48 both designed and reviewed, no migration; #38 building.** ADR 0076 reserved for #48 (its draft is kept in page memory only, with the in-place lock and sign-in). #38 takes ADR 0072 and CAS-30 to CAS-34; #48 takes CAS-35 to CAS-37.
  - **#135 opened draft PR #47** (~01:15 UTC; no migration). Its design review caught that `save_default_payment_method: 'on_subscription'` would keep charging a card after a bank account was added; fixed in the design.
  - Its proposal, to show a bank account still waiting on Stripe's micro-deposits on later visits, is noted for the queue after #135.
  - **The UX capture** is at 709 PNGs (01:17 UTC). Along the way it found and fixed a held submit that was actually sent, and a 390 px loading state taken too early. Both were capture faults, on the synthetic database.
  - Session clocks drift: the #38 session's message said ~02:45 UTC at 01:19. The sessions were told to take times from `date -u`.
- **2026-10-26 ~01:30 UTC: the release content checks' design is reviewed (no migration); shared counters allocated centrally.**
  - It found that fixture release numbers and synth module numbers are shared counters the parallel sessions could collide on. Allocated in the claim rows:
    - DBF module 13 (#111), RCC module 14 plus fixture release 900007 (the release content checks), BIL module 15 (#135).
    - The next free values are under "Shared counters" in the conventions. #135's session was told BIL = 15.
  - **Handed to Lane A:** `operator_content_coverage()` for #59's later daily `content_due` job. `tp_operator` has no grant on rule objects, and a GRANT on `rule_record` would be DDL on a rule table.
- **2026-10-26 ~02:15 UTC: the UX capture is done; the image checks run 20 batches at once.**
  - **Capture** (wf_b56fe7b4-652's capture agent):
    - **857 shots covering all 83 reachable routes.** At 1280 px light, 385 (84 default, 126 interaction, 75 error, 52 loading, 45 empty, 3 not-found); 83 at 1280 px dark (tokens only), one per route; 389 at 390 px light.
    - **36 named states that synthetic data cannot show** are each recorded with the reason, never faked. Examples: the screening's "not open yet", a 50-group pager, empty consoles the seed always fills, a tampered ledger.
    - **The lock** was held about 100 minutes in two fresh-prepare sessions; the final data is session 2 (populate 3.0 min, capture 28 min, a 390 px sticky-header retake).
    - **Clean at the end:** server stopped, port 3297 free, `tp_e2e_screens` dropped.
  - **The tour tool grew** (committed here):
    - `tour.spec.ts` rewritten: a declarative capture helper, stable ids, `TOUR_ONLY`, bounded timeouts, held submits that are truly aborted, and loading shots taken after prefetch;
    - `screens.config.ts` populates with seven specs (`reports.spec.ts` added), and `run.sh` excludes only the webhook test;
    - new `reserve.sh` (re-serve a build from a fresh prepare), `build-only.sh` and `batches.py`, with the README.
  - **The route map is committed** with the 83 real pages. The six phantom paths are kept only in the readable map's "Paths with no page".
  - **Faster checks:** the workflow runs two agents at a time on this 4-CPU container, so its 20 check batches would have taken about ten rounds. Eighteen background checkers took batches 03 to 20 at once, writing the same progress and verdict files as the workflow's checkers, which take the results when they reach each batch.
- **2026-10-26 ~02:16 UTC: usage 53% weekly; the 5-hour session limit at 90% (resets about 03:40 UTC). Ready for the limit.**
  - **The weekly reset time is now known:** Friday 2026-10-30, 15:00 UTC-4, so 19:00 UTC.
  - **If the session limit runs out first,** model calls fail and every running turn and workflow agent stops. Nothing on disk is lost:
    - commits and PR branches are pushed, and merges and pushes are atomic;
    - CI runs on GitHub regardless;
    - every workflow agent keeps a progress file (the SAVE rule);
    - every session keeps its status file.
  - **Recovery is armed, so nothing needs a person:**
    - this session wakes at 03:45 UTC (send_later trig_01DnPQir4gPp2sMxn3vhqUdA) to check every workflow and session and resume what stopped;
    - each parallel session was told to schedule its own send_later at 03:50 UTC to resume its workflows from their progress files.
  - **Priority sent to all eight sessions:** finish the current PR before any follow-on. This session says when to stop starting new work (~85% weekly).
- **2026-10-26 ~03:50 UTC: the 5-hour session limit hit at about 02:20 to 02:48 UTC, and reset at 03:40. Everything resumed, nothing lost.**
  - **What stopped:** every session's turn and workflow agents, here and in all eight parallel sessions, with rate_limit 429. Here:
    - the UX workflow wf_b56fe7b4-652 ended with 19 checkers, the retake and the manifest failed;
    - 16 of the 18 background checkers stopped part-way.
  - **What held:**
    - every progress file: 706 of the 852 images were already judged, and batches 01, 10 and 20 were complete;
    - every pushed branch and open PR (#47, #49, #50 and #111's), and CI on GitHub;
    - the screen tour's PNGs and shots.json.
  - **The container also restarted again** (PostgreSQL down). `tools/setup-container.sh` was re-run and printed OK.
  - **Resumed at ~03:48 UTC:**
    - seven fresh checkers judge only the 146 unjudged images, reading the progress files and writing each batch's verify file;
    - the retake and the manifest run next, as a small workflow;
    - all eight sessions were sent a resume message (their own 03:50 send_laters are a backup).
  - **Usage:** this session's rate-limit record now shows the seven-day limit at "allowed_warning", resetting at 1793386800 (Friday 2026-10-30 19:00 UTC, as recorded). The weekly figure is near the line, so new starts stop at ~85% as planned.
  - **Fixed:** the ops push retry loop. `cmd | tail -1 && break` read tail's exit status, so a rejected push looked like success and was never retried. The pushes were checked: the branch is level with origin. `scratchpad/push-ops.sh` now checks git's own exit status.
- **2026-10-26 ~04:00 UTC: #135 merged; the UX baseline's checks done; 11 reviewers running; the retake running.**
  - **#135, the bank account shown first: merged as PR #47 (c5195ee, ~03:58 UTC).** The first of the parallel items, after its fresh-clone verification with every required check green. Its micro-deposit proposal is queued.
  - **The checks are complete: 857 verdicts.** 683 ok; 152 product findings (other 114, cropped 43, dark-not-applied 6, state-not-shown 7 and error-page 2, not fixable); 22 capture faults for the retake. Committed:
    - `designs/lane-b-ux-review/manifest.json` (every shot, with its verdict and the checker's note; file basenames only);
    - `coverage.md` (every route by width, theme and state, and the 78 skipped shots with reasons).
  - **The review, 11 reviewers at once** as background agents: the workflow's two-agent limit on this container would have run them in six rounds.
    - The lenses: brand (96 images); flows, practice and other (124 and 85); words, practice and other (127 and 76); accessibility, practice 1 and 2 and other (107, 107 and 152); 390 px and states, practice 1 and 2 and other (115, 115 and 142). 1,246 image reads.
    - Each has the checkers' notes as leads, and a shared brief (`scratchpad/ux/reviewer-common.md`): the rules, the in-flight Lane B PRs to fold into, #42's files, the finding format and a progress file.
  - **The retake** (wf_f5c2fa03-d95): the 22 capture faults (sticky headers at 390, the empty-filter and zero-read states), under the lock, then their check. The retaken shots join the review afterwards.
- **2026-10-26 ~04:20 UTC: a money bug found by the UX review, fixed ahead of the rest.**
  - The 390 px practice reviewer's finding narrow-practice-2-02 (blocking), confirmed in the code at 6ddd587:
    - `apps/web/src/app/p/[practiceId]/settings/defaults/page.tsx:40,48-49` shows `materiality.lineCents` and `caseCents`, which are raw cents strings (`lib/routes/settings.ts:295`), as dollars, and pre-fills the "(dollars)" fields with them;
    - the save parses dollars (`settings.ts:269-272`, `parseAmount`);
    - so the page reads "$500 per line and $25000 per case" for $5.00 and $250.00, and saving it unchanged sets $500 and $25,000. Triage would then stop pursuing every shortfall under $500.
  - The cases page does it right (`cases/page.tsx:22,177`: `formatCents(parseCents(...))` and `<Money>`). No #42 file is involved.
  - **Claimed** as `co-001/materiality-cents` (CAS-38 to CAS-39) and given to the idle #135 session, with the full pipeline: payment-engine review plus the UX review, and a sweep for the same class of bug across apps/web.
- **2026-10-26 ~04:33 UTC: the UX review's reviewers are done but one; the retake is done; the synthesis is next.**
  - **Ten of eleven reviewers handed back** (words-practice still running). Raw findings by lens, before deduplication:
    - brand 18 (0 blocking);
    - flows: practice 36 (3), other 30 (4);
    - words: other 45 (1);
    - accessibility: practice 1 28 (1), practice 2 24 (1), other 26 (2);
    - 390 px and states: practice 1 26 (3), practice 2 23 (2), other 23 (2).
  - **The same blocking defect, from six lenses:** every form built on `ActionForm` (about 112) empties or resets its fields when the server refuses it. The cause is `apps/web/src/components/action-form.tsx:65`: `<form action>` under React 19, with no values sent back. The screening upload form already avoids it (`onSubmit` plus `startTransition`). The file is not one of #42's.
  - **Other blocking findings, to be verified by the synthesis:**
    - there is no password, authenticator or hardware-key recovery (flows-other-02);
    - the terms page shows no terms text. That is legal text, so it is the founder's (flows-other-13, words-other-18; combined audit #51);
    - a suspended organization reads "In good standing". Storing the reason needs a migration, so that part goes to Lane A (flows-other-11);
    - a payer's answer letter can only be uploaded through Contracts (flows-practice-02);
    - nothing tells the second person a packet waits for their approval (flows-practice-03);
    - enrolment expires in 3 to 5 minutes with no warning (a11y-other-23);
    - a bad coverage-letter code shows raw JSON (narrow-practice-1-09);
    - the screening result tables hide Allowed, Difference and Status at 390 px (narrow-other-05).
  - **Dark mode:** the brand reviewer recommends a per-user Appearance setting: match the device by default, plus Light and Dark. That reverses D9 item 3 ("dark mode stays off", reconciliation-001.md:309), so it goes to the founder through the co-founder. Storing the setting needs a migration (Lane A). Meanwhile the dark tokens' three defects (sign-in on Paper, native controls, print) can be fixed with no visible change while dark stays off.
  - **The retake** (wf_f5c2fa03-d95) retook all 22 capture faults and its checker passed all 22. tour.spec.ts gained a `toTop` step: the visual viewport, not only the layout scroll, goes back to 0 before a full-page shot. It also gained `filterToEmpty` and a zero-read grant chosen at shot time. The manifest carries the new verdicts.
  - **Next:** the synthesis workflow (`lane-b-ux-synthesis`):
    - a retake reviewer on the 22 new shots;
    - a clusterer by root cause, with a script check that every finding id is placed;
    - two writers who verify each canonical finding against c5195ee;
    - a planner: ranks, groups into PRs in landing order, writes `designs/lane-b-ux-review.md`;
    - one adversarial reviewer on the rules and one fact checker on the code;
    - a reviser.
- **2026-10-26 ~04:38 UTC: #111 merged as PR #46 (4d99df8, 04:37:35 UTC).** Readable database-function diffs, one generated file per function (ADR 0068). It is the second of the parallel items. Its session reads the push runs, then takes `co-001/ux-forms`, the UX review's first PR (claimed ~04:35; its brief was sent by message).
- **2026-10-26 ~04:57 UTC: ux-forms gets its own session.** #111's session finished: its push runs on 4d99df8 are green (ci, mutation, screening-capacity). It declined ux-forms, rightly, because its brief was one PR, and a message from another session does not widen a brief. So `co-001/ux-forms` runs in a new parallel session (session_01VNsi2Kru6pfk8CAbQ2AaYB, created 04:56:47 UTC), with the full brief and the standing rulings, the same as the first eight.
  - Its PG18 note, for every session: after a container restart, PostgreSQL 18 on 5433 can keep a stale `/root/pgdata18/postmaster.pid`. Re-running `tools/setup-container.sh` clears it.
  - LANES rule 6 now names the generated files (the lockfile, `watched-paths.txt`, `packages/db/functions`): the PR merged second regenerates them. #38's session needed it for `watched-paths.txt`, and it applies to every migration PR's function files.
- **2026-10-26 ~05:02 UTC: all eleven reviewers done; the synthesis started (wf_3582cebc-d2b).**
  - **335 raw findings, 23 blocking,** before deduplication. words-practice came last: 56 findings (3 blocking), the form reset and the materiality cents among them, and Actionable disagreeing between the home tile and the ROI statement.
  - Archived on this branch as `designs/lane-b-ux-review/raw-findings.md`: markdown, ids in backticks; gitleaks passed it.
  - **The synthesis, in order:**
    1. a retake reviewer on the 22 new shots, all five lenses;
    2. a clusterer by root cause, then a script check (`check-clusters.py`, run by a low-effort agent) that every id sits in exactly one cluster, with up to two fix passes;
    3. two writers who verify each canonical finding against 4d99df8;
    4. a planner who ranks them, groups them into PRs in landing order and writes `designs/lane-b-ux-review.md`;
    5. one adversarial reviewer on the rules and a fact checker on the code, in parallel;
    6. a reviser.
  - Every agent keeps a progress file (SAVE rule), and a monitor raises a 10-minute stall alarm. The script is archived in `workflow-scripts/`.
- **2026-10-26 ~05:11 UTC: the UX review's screenshot galleries are published, private.** One version holds at most 511 files, so each width has its own gallery; each links to the other:
  - 1280 px, light and dark (468 shots): https://claude.ai/artifact/NmJco1UsT631vdmXts8HHD
  - 390 px (389 shots): https://claude.ai/artifact/V1vzMZc3BrJ8mtw1HXG5jh
  - **What they do:** filter by area, role, state, theme and the checker's verdict; open a shot full size with its route, role and the checker's note. `#shot-id` links straight to a shot.
  - **Images:** lossless WebP, 42.7 MB in all against 155 MB of PNG. The builder is `tools/lane-b-screen-gallery/`.
  - **Next:** once the synthesis lands, the findings that cite each shot are added to both galleries. The next re-tour compares against these files.
- **2026-10-26 ~05:20 UTC: the checklist PR `co-001/ux-brand-reviewer` started, run from this session while the synthesis works.**
  - **Workflow wf_f49e6c03-028:** a designer, then one adversarial reviewer, then a reviser, then one builder. Worktree `/home/user/ux-brand-reviewer`, cut from 4d99df8.
  - **Inputs:** the brand's rules and the 335 raw findings, or the synthesis if it lands first. The checklist targets recurring defect classes, not single bugs.
  - **Q4 applies:** the `model:` key follows the other reviewer files, and the suite is documentation-only.
  - **Next:** the draft PR, two adversarial reviews (brand and copy; consistency with the other reviewer files and the brief's "Then"), the fix round with the documentation-only suite, a fresh-clone verification reading CI, then the merge.
- **2026-10-26 ~06:15 to 08:40 UTC: the account's 5-hour limit stopped every session again; recovered at 08:58.**
  - **What stopped:** the synthesis's planner, the checklist's reviser, and six of the parallel sessions (ux-forms, #38, the release content checks, #84/#120, #10, 15b). Every one stopped with its progress files written. The container restarted too, so PostgreSQL was down.
  - **Recovery, at 08:58-08:59:**
    - `tools/setup-container.sh` re-run (OK);
    - both workflows resumed with `resumeFromRunId` (the completed agents replay from cache);
    - the six stopped sessions sent a resume message. ci-deps was idle with its own check-ins scheduled (merge at ~15:15, the lockfile re-resolve after 19:20), and the #135 session resumed on its own.
  - **materiality-cents merged as #54 (7ef421b, 08:56:17 UTC):** the third parallel item, after its fresh-clone verification. The main checkout is fast-forwarded to it.
  - **Lesson kept:** the limit now stops the account about every two to three hours of eight-session work. Two things keep that from losing work: every agent's progress file, and a resume message sent the moment the limit resets.
- **2026-10-26 ~09:08 UTC: the checklist PR is up as draft #55 (eea716d).**
  - **The file:** `.claude/agents/ux-brand-reviewer.md`, 99 lines. Every check cites its rule, or is marked "(recommendation)" or "(baseline)".
  - **The template:** `.github/pull_request_template.md`'s reviewer comment now names the new reviewer. Open #48 edits lines 1-8 of the same file, so the two never touch the same lines.
  - **Its design:** one adversarial review, 19 points, all applied.
  - **The two improvements it took:**
    - D1, a wider trigger: `packages/ui/src`, `packages/brand/src`, and any file whose strings reach a screen;
    - D5, the template comment.
  - **16 px fields stay a recommendation:** ADR 0056 sets dense controls at 14, and the PR that changes the fields amends ADR 0056.
  - **Now:** its two adversarial reviews (brand and copy; consistency and fitness for use) and the fix round with the documentation-only suite (wf_2db9e9db-7fd). Then the push, the fresh-clone verification reading CI, and the merge.
- **2026-10-26 09:48 UTC: #53 (the model evaluation gate) may keep a one-line hunk in a #42 file.** `infra/test/compute.test.ts` pins the permitted CLI's call, and #53 must change it to `readGatewayConfig(process.env, { serving: 'evaluable' })`. It merges cleanly with #42's head (`git merge-tree`), so the orchestrator allowed it under rule 6 and the co-founder's Q2 precedent; the alternative, holding #53 until #42 merges, would block the gate for an unknown time. Noted under LANES.md "Handed to Lane A" for #42's next base merge. #53 is green on every check, and its fresh-clone verification passed.
- **2026-10-26 09:50 UTC: #84, the model evaluation gate, merged as PR #53 (88a0e4e).** It is the fourth parallel item. CI was green on f8e0bb1, and the fresh-clone verification passed. The session moves to #120, the contract PHI check (`co-001/contract-phi-check`). Merged so far: #47, #46, #54 and #53.
- **2026-10-26 ~10:05-10:14 UTC: the wind-down for the handoff to Lane A tomorrow morning, and the co-founder's budget ruling.**
  - **The reading:** the co-founder reported 90% weekly usage (~10:05 UTC), past the ~85% stop for new starts.
  - **Ruled, the co-founder, ~10:13 UTC:** "You can use 98% of usage. So do what you can up until that. Lane A is running on a different account different usage. Lane A is another Claude account but working from the same git hub repo." So Lane B may spend up to 98%, and the handoff goes through the repository: `claude/build-ops` (LANES.md, this file, the status files) and the PRs.
  - **Finishing to merge:** #50 (#10), #51 (15b), #52 (#38), #49 (the release content checks), #55 (the checklist, this session), `co-001/ux-suspended-standing` (UX PR 2, built; resumed after the ruling), and ci-deps (#48) tonight after 19:20 UTC, its last steps time-bound.
  - **Stopped at clean, recorded points** (branch pushed, status file a handoff, nothing running):
    - `co-001/ux-forms` at 17bbb70: partly built; slice A after #50, C1 and C2 after #51 and #52;
    - `co-001/contract-phi-check` (#120): stopping after its builders;
    - #32: design done, not built;
    - #46 (the Verified seal) and #48's narrative draft: not started;
    - ci-browser at 8b38f48 (phase 1 built) and the CI follow-ups P1, P2 and P4: designed and reviewed.
- **2026-10-26 ~10:30 UTC: the UX review is complete, and its checklist merged as #55 (6070e41).**
  - **The synthesis** (`designs/lane-b-ux-review.md`, wf_3582cebc-d2b): 342 reviewer findings, retake included, in 208 verified problems (16 blocking, 121 should fix, 71 polish; none dropped). They are grouped into 91 PRs in landing order (§3; data in `designs/lane-b-ux-review/synthesis/prs.json`).
    - 19 items go to Lane A (§5).
    - 5 questions go to the founder (§6.2): dark mode, the terms text, the palette, and two screening legal texts.
    - The wording and brand choices taken under the co-founder's ruling are listed in §6.1.
    - One adversarial review on the rules and a fact check on the code found 6 blocking, 24 should fix and 26 nits: 54 applied, 2 rejected with reasons (§10).
  - **The galleries** now show, on each shot, the UX findings that cite it: 303 of the 468 shots at 1280 and 126 of the 389 at 390. They are private to the co-founder's account, so Lane A's account sees them only once shared from each page's Share menu.
  - **#55:** `.claude/agents/ux-brand-reviewer.md`, 128 lines, and the PR template names it.
    - Its reviews: two adversarial ones (41 findings, all fixed).
    - Its suite: documentation-only (typecheck, lint, lint:copy, unit 5,077 passed and 3 skipped).
    - Its verification: a fresh-clone check that it changes exactly the two files, the frontmatter matches security-reviewer.md's, and every required check is green on f8a795d.
    - Its review's blocking point, how Lane A takes the shots, is fixed on this branch: the tour README's "From another lane" section and `tile.py`.
  - Merged today: #47, #46, #54, #53, #55.
- **2026-10-26 11:06 UTC: #10 merged as PR #50 (9d3ab33).** A superseded re-run cannot be accepted. Head c4f2742, after three fix rounds and the fresh-clone verification. ux-forms' slice A, which waited on it, can start.
- **2026-10-26 11:41 UTC: #38 merged as PR #52 (3486f75).** Every figure explained in words. Two base merges (#50's brought one import conflict in `apps/web/src/lib/pricing/queries.ts`, both sides kept), the fresh-clone verification on dcdb644, then CI green on the merged head. #48's narrative draft stays designed, not started.
- **2026-10-26 12:11 UTC: UX PR 2 merged as PR #56 (0e28f9b).** A suspended organization's billing page no longer reads "In good standing": one standing, worked out in one place. It is the first UX review PR to merge, and the first to take the new UX and brand review (#55's checklist) as one of its two. Handed to Lane A with it (LANES.md): a firm's suspension refuses no runs on its granted practices, a blocking product defect that needs a migration (SS-01); the stored reason and the console's form; the database refusal's words; #42's dunning mail during a suspension.
- **2026-10-26 ~12:35 UTC: the push CI on 0e28f9b (#56's merge) was cancelled in one job, not by a test.** `db (2/4)` (job 121564437093) hung in `playwright install --with-deps chromium`, the browser's system packages, from 12:12 to 12:31 UTC until the job's timeout, before any test ran. Every other job passed, and `all green` failed with it. This is V3, the slow uncached install that ci-browser caches. The failed jobs were re-run once (run 40320655101, attempt 2), as the rules allow for a job that died in its install.
  - **The re-run passed** (run 40320655101, attempt 2): `db (2/4)` and `all green` green, so all three push runs on 0e28f9b are green.
- **2026-10-26 12:41 UTC: PR 15b merged as #51 (c355633).** Ledger amounts in payment terms (audit #12, ADR 0067, LED-14 to LED-18), after two fix rounds, the payment-engine and UX reviews, and the fresh-clone verification. Its follow-on #46 (the Verified seal) stays queued, not started.
- **2026-10-26 14:25 UTC: the release content checks merged as #49 (d725977).** Audits #7, #30, #31 and #59 (ADR 0071, RCC-01 to RCC-08), after two adversarial reviews, a fix round, three base merges (six conflicted code files, both sides kept) and the fresh-clone verification. Its real-size test found SUITE-CAP-1 (handed to Lane A). The parts in #42's files wait for #42 (its status file's "Split for after #42 merges"). Ten Lane B merges on 2026-10-26; only ci-deps (#48) remains, tonight.
- **2026-10-26 ~15:50 UTC: usage 96% (the co-founder's reading); the cap is 98%.**
  - **Continues:** ci-deps (#48) finishes tonight on the required stages only (~1% expected). If a step fails beyond a quick fix, it stops at a recorded step for the next session.
  - **Stays stopped for Lane A:** `co-001/ux-forms` (17bbb70). Every PR it waited on (#50, #51, #52) has merged. Its design, build notes and status file say what remains.
  - **This session:** no more half-hourly monitors. A check at 19:45 UTC, and ci-deps' message when it merges.
- **2026-10-26 21:06 UTC: ci-deps merged as #48 (e908c21). Lane B's handoff is complete.** CI 2 of 4: every action and image pinned by SHA and digest, Dependabot's groups, cooldowns and trust rules, and `packageManager`'s pnpm held to its age. Head 7b6b10b, with all four required checks green and the fresh-clone verification passed (unit 6,265; db 9,222; e2e 54). The founder's three settings are now due. That makes 11 Lane B merges on 2026-10-26 and 14 since 2026-10-25. No Lane B PR is open, and every session is idle.
- **2026-10-27 ~01:40 UTC: Lane A's orchestrator takes over Lane B's work (written by Lane A, session_01TrKDxeLbxVo7t7zwRXFzrg, for the co-founder, under the handoff `lane-b-handoff-to-lane-a.md`).**
  - **The machine and GitHub:** `tools/setup-container.sh` all ok except Playwright's pinned Chromium: the environment's network policy refuses storage.googleapis.com (the person is asked to allow it). The GitHub login is `PureTideWater`.
  - **The founder's three settings:** F1 reads done (the default branch is `claude/build-platform`); F2's security updates read enabled (alerts unreadable through the proxy; the person confirms); F3 waits on the person.
  - **Five parallel sessions, one per item,** each with the brief `lanes/lane-b-session-brief.md` (bootstrap, reading list, the whole pipeline, the 5-hour-limit rule, decisions, records, never-list). Only the orchestrator edits LANES.md and this log; each session keeps its status file. Started 01:39 to 01:40 UTC, each with the repository as its source:

    | Item, then its follow-on | Session | Branch | Status file |
    |---|---|---|---|
    | #120 contract PHI check, then #32 unmapped plan | session_017SNqG4nQbbt6xqEG1ZDKe6 | `co-001/contract-phi-check`, then `co-001/unmapped-plan` | `lane-b-model-eval-gate-status.md`, then `lane-b-unmapped-plan-status.md` |
    | ci-browser, then P1, P2, P4; pnpm 10.34.8 in the setup script; Dependabot's first runs (#33 rebased to node 26) | session_01UzQ6wgZgtThBRBxXTFYhRB | `co-001/ci-browser`, then `co-001/ci-pin-age`, `co-001/ci-trivy-version`, `co-001/ci-mutation-trigger` | `lane-b-ci-deps-status.md` |
    | UX PR 1 ux-forms, then UX PRs 6 and 7 (sign-in) | session_01TAgFZo3SGSTBEfKRjX1jeG | `co-001/ux-forms`, then `co-001/ux-sign-in-time`, `co-001/ux-sign-in-recovery` | `lane-b-ux-forms-status.md`, then `lane-b-ux-sign-in-time-status.md`, `lane-b-ux-sign-in-recovery-status.md` |
    | UX PR 3 table scroll, then UX PR 4 screening result on a phone | session_019VghcxKzP9LAj3WK8k6u1D | `co-001/ux-table-scroll`, then `co-001/ux-screening-result-tables` | `lane-b-ux-table-scroll-status.md`, then `lane-b-ux-screening-result-tables-status.md` |
    | UX PR 5 download refusals, then UX PR 9 home figures | session_01L3tN5LCq2aNYetEQBNJYZg | `co-001/ux-download-refusals`, then `co-001/ux-home-figures` | `lane-b-ux-download-refusals-status.md`, then `lane-b-ux-home-figures-status.md` |

  - A first set of five (01:37 to 01:38 UTC) started without the repository as their source, so with no clone and no GitHub tools. The orchestrator stopped and archived them within a minute (session_01Xyekmt…, 01DoCS9f…, 01Rjwc3F…, 01F41jVg…, 014uKrdE…); nothing was pushed.
  - **Counters** (LANES.md rule 4, now allocated by Lane A's orchestrator): ADR 0078 (TBL), 0079 (DLR), 0080 (SS-01, Lane A), 0081 (SGN), 0082 (HOM), each if needed; synth modules 17 TBL, 18 DLR, 19 SGN, 20 HOM; test-matrix TBL-01 to TBL-08, DLR-01 to DLR-04, SGN-01 to SGN-08, HOM-01 to HOM-04, BIL-07 to BIL-10 (SS-01). Next free: ADR 0083, module 21, fixture release 900008.
  - **Lane A, meanwhile:** #42's fix round (wf_ba2333bd-714: the base merged with regeneration, three builders, one integrator with the full suite), then SS-01's design.
- **2026-10-27 ~01:50 UTC (Lane A's orchestrator): the founder's settings done; usage 94%; the sessions held after their current stage.**
  - **Settings:** the person reports F2 (Dependabot alerts and security updates) and F3 (actions pinned to a full-length SHA) applied. Read back: the default branch is `claude/build-platform` (F1) and `security_and_analysis.dependabot_security_updates` reads `enabled` (F2); the alerts and Actions-permissions endpoints are refused by the proxy, so F2's alerts and F3 rest on the person's word, and F3 is proved by the next workflow run that starts (every action is pinned since #48).
  - **Usage:** this account (Lane A's) reads 94% weekly at ~01:50 UTC (the co-founder's reading); it resets today, 2026-10-27, at 14:00 UTC. The orchestrator's ruling, as the recommended option under LANES.md rule 9: the remaining allowance goes first to #42's fix round, so the founder can approve it during the pause. Each of the five sessions finishes the stage it is running (none cut off mid-run), records it in its status file, starts no new workflow until 14:05 UTC, and keeps a check-in at 14:05 UTC that resumes it.
- **2026-10-27 ~14:35 UTC (Lane A's orchestrator): the weekly limit reset; every session resumed; a sixth item.**
  - The limit stopped this account at ~02:50 UTC (Lane A's #42 fix round and designs mid-run; the five sessions holding). At the 14:00 UTC reset: three sessions resumed on their own check-ins (#120, ux-forms, UX PR 3); ci-browser's and download-refusals' check-ins never fired, so the orchestrator disabled them and resumed both by message at 14:20. Every session reads ultracode active, effort xhigh.
  - State: #120 is draft PR #75 (head 9b7eadf; reviews running); ux-forms is PR #74 (CI); UX PR 3 is building; ci-browser and download-refusals resumed.
  - **New Lane B item, `co-001/test-flakes`** (session_019i9ifAWsQ6zhLLegnMqSdK): three flaky unit tests found by #75's CI that can fail any PR (workflows.test.ts:880 at vitest's 5 s default; rerun-rule.property.test.ts's unseeded coverage check; verifier.test.ts:384's `fc.pre`), with a sweep for siblings. Tests only. Until it merges, a head whose only red is one of these gets one re-run of the failed job, never a merge on red.
- **2026-10-27 ~14:55 UTC (Lane A's orchestrator): the UX baseline galleries on Lane A's account.** The person uploaded both galleries (exported from the co-founder's account). They are now private artifacts on this account, read whole and checked before publishing (synthetic data only; the billing simulator's published test numbers and a synthetic persona's sample authenticator key appear, as in the originals), each linking to the other: 1280 px https://claude.ai/artifact/6ufwbZwVBXm35KhLwuhTPA (468 shots), 390 px https://claude.ai/artifact/M4zbLDTkfhez4g9D6uJvgo (389 shots). A shot's image is `s/NNNN.webp`, NNNN its `k` in `designs/lane-b-ux-review/manifest.json`; a session on this account reads one with the Artifact tool's `read` and `path`. The images stay out of the public repository.
- **2026-10-27 ~19:20 UTC: test-flakes merged as #76 (085299b).** Fixed: the nested-run notify tests' timeouts (workflows.test.ts, file-wide 30 s, every child process bounded), the re-run property's coverage (a fixed `examples:` entry reaching every outcome), the verifier's count properties (both sides, counts biased to the inputs' codes), denial-letter.test.ts's names, and the db-shards and worksheet timeouts. Every open PR picks them up at its next base merge. Its review's two product defects are a new item (`co-001/redact-placeholders`, then `co-001/packet-day-counts`, session_019i9ifC3LkwNtonZfNSNmCp, from 19:10 UTC). Proposals queued in its status file: affected.test.ts's 55.9 of 120 s, threads.test.ts's wall-clock bounds, a repository-wide timeout rule for tests that spawn processes.
- **2026-10-27 ~20:35 UTC (Lane A's orchestrator): Lane A's three designs done; SUITE-CAP-1a in its own session.** SS-01, SUITE-CAP-1 and the interest fix are designed and adversarially reviewed (nine findings each, all taken; `designs/ss-01-suspension.md`, `designs/suite-cap-1-triage-locks.md`, `designs/ledger-interest-once.md`). SUITE-CAP-1 split into 1a (bounded reads and a streamed audit report, no migration, CAS-41) and 1b (the schema PR). **1a runs now in session_019i9ifDUYaz9Hta77Vukkzo** (`co-001/suite-cap-1-bounded-reads`), so the weekly release-capacity run can pass sooner. The founder's two ledger freeze exceptions are asked (`approval-summaries/founder-asks-2026-10-27.md`).
- **2026-10-27 ~21:35 UTC (Lane A's orchestrator): an incident, resolved.** The #120 session force-pushed its own WIP ref (`co-001/wip-contract-phi-check`, 4ee7c665 to 2e4ce479, ~21:21 UTC): it had parented each WIP snapshot on the PR head rather than on the WIP tip, so the second was not a fast-forward. Nothing else was rewritten: PR #75's branch stayed 9b7eadfe and every `claude/build-ops` push was a fast-forward. The overwritten snapshot was recovered from the local object store and pushed, without force, to `co-001/wip-contract-phi-check-1`. Every session was reminded: never force a push, WIP refs included; a diverged WIP ref gets a fresh name (`-2`, `-3`, ...). Recorded in its status file.
- **2026-10-27 22:13 UTC: ci-browser merged as #77 (ecebdc90)** (CI 3 of 4; ADR 0066 Part 3; CI-18 to CI-20): Playwright 1.64.1, axe 4.14.0, Chrome for Testing 1248, the seven regenerated baselines inspected and accepted as recommended (A9's evidence in `designs/lane-b-ci/ci-browser-a9/`), the content-calendar and release-capacity jobs on ubuntu-26.04. Every check green on 6d945c7b, the fresh-clone verification passed. For #42 (rule 6, Q2): #42 merges ecebdc90 in, keeps both sides of apps/web/package.json, apps/worker/package.json, shell.tsx and tools/screening-capacity/measure.test.ts, re-resolves the lockfile with `pnpm install` and regenerates watched-paths.txt; its CI then runs axe 4.14 over its mail journeys (O6). Next in that session: the O5 26.04 probe, then P1, P2, P4.

### 2026-10-28 00:15 UTC (Lane A's orchestrator): resumed after the 5-hour window
- The limit stopped every session at about 23:00 UTC. At 00:11 the setup re-run brought PostgreSQL back (OK); the snapshot loop was restarted.
- #42: the verification round's fix agent (wf_6faedfe4-8e0) resumed from its progress file at 00:15: failing-first, the migration edit (marker route), code and docs were done and uncommitted on 9664763b (#77 merged in); next: commit, the full suite once, one push, the body with the changed legal sentences listed for the founder's sign-off.
- Seven sessions told to resume from their status files: #120/#32, ci-browser follow-ups, ux-forms, download-refusals, redaction, SUITE-CAP-1a, the schema chain. Table-scroll (#79) waits on the person to approve or deny its Artifact publish (its before-and-after screenshots).
- Safety check-in: 2026-10-28 05:10 UTC (trig_016UjAWEaLDhLhqkoKEEWZNA).

### 2026-10-28 00:25 UTC: redact-placeholders merged as #80 (0dd1ba7)
- The letter reader's redaction now works in one pass over a folded view: no placeholder is corrupted. Eleven more leak classes the probe found are fixed: accents, ß, typographic apostrophes and dashes, hyphenated-surname halves, invisible characters, "Jo Ann", initials, and IDs written with `_` `.` `/` `:`. A crafted 100 kB letter took 97 s and now runs in linear time.
- Before the merge: the full local suite, two adversarial reviews (security, correctness), a fresh-clone verification, and every required check green on 351262e.
- ADR 0054 amended; ADR 0085 released (free again); MOD-13 and MOD-14 used.
- The e2e screening timing flake hit once (screening.spec.ts:339; its fix is on #42's branch) and passed on its one re-run.
- #75 merges second and resolves redact.ts (its identifierPattern widening has no function left); its session knows.
- Proposals recorded in the status file: the packets verifier's identifierSpans has the same gaps (its own PR in packages/packets); local test:db and e2e need DATABASE_URL on 5433; a PRD 14 question for the founder (redact SSNs and phone numbers by pattern?).
- The session continues with packet day counts (`co-001/packet-day-counts`).

### 2026-10-28 01:45 UTC: UX PR 3 (table scroll) merged as #79 (a6e754f)
- Every required check green on 7102b8b (unit 6,459 passed, 1 skipped; db 9,223; e2e 56 of 56); fresh-clone verification passed. ADR 0078 and TBL-01 to TBL-04 (synth module 17) used. The person approved its screenshot Artifact after the 00:15 resume.
- For #42's next base merge (rule 6): #79 changed `components/screening/result.test.tsx`, which #42 also changes; `apps/web/src/app/tables.test.ts` exempts #42's bare tables by exact count (console/support 1, users 2, support-access 1). If #42's head changes those counts (its verify round stacks the users page below sm), #42 edits that exemption line in its merge. #42's `console/mail` table already sits in `ScrollTable`.
- PR 4 (screening result on a phone, `co-001/ux-screening-result-tables`) started from a6e754f in the same session.

### 2026-10-28 03:20 UTC: Lane A's ruling on UX PR 4b's labels (asked by the screening-result-tables session)
- 4b re-pins `screening-labels/2026-11-05` under the same name, with no migration. Why: a kept summary records the version it was shown under (screening_lead.labels_version), so a version is fixed once an environment keeps a summary under it. Environments deploy only from a release tag's images. The founder alone creates tags, and origin has none today, so no summary exists under it. PR 6b-2 set the precedent (dfec40dc). A new name would need a migration and the founder's domain-model approval to protect a record that does not exist.
- Conditions:
  - labels.test.ts states the rule: "a version may be re-pinned under its name only while no release tag contains it".
  - Tags are checked again before 4b merges. If one exists, the labels part becomes a new version with its migration, for Lane A.
  - 4b waits for #42 (lib/screening/*).
- Not the founder's decision: no ruling changes, and audit #57's rule holds for every released version.

### 2026-10-28 03:40 UTC: UX PR 1 (forms keep input) merged as #74 (165c599); UX PR 10 next
- #74: CI green on 8cab9c9, the fresh-clone verification passed, approval-of-record re-ran; #79 merged into it first (14 conflicted files, both sides kept).
- Order in the ux-forms session (Lane A's call): UX PR 10 `co-001/ux-payer-response` (UX-035, blocking: a write-off Reason or a payer Response that opens pre-answered can record a decision nobody chose, which moves a line's stage) before UX PR 6 and 7 (sign-in time and recovery). Reserved for PR 10: ADR 0085, CAS-45 to CAS-48, synth module 21 if needed. Next free: ADR 0087, synth module 22, fixture release 900008.
- After #42 merges: `co-001/ux-forms-after-42` (design 7.8).

### 2026-10-28 04:15 UTC: the schema chain's state; SUITE-CAP-3 claimed
- SS-01: built, with the full local suite green at d763ba78; #42's pushed head merged in (f5bd6201). It opens its PR when #42 merges.
- SUITE-CAP-1b: the parts that don't depend on 1a are built (358dc53f). The measurement gate, CAS-42.1 and .2, and the real-size runs wait for 1a.
- The interest fix is building on 1b's branch (wf_4860596d-bb1).
- SS-01's hand-overs (a) to (j) are in LANES.md "Handed to Lane A".
- New item SUITE-CAP-3, reconcile at real size: 6,000 lines took 341.8 s, growing faster than the line count. It goes next in SUITE-CAP-1a's session after 1a merges. Reserved: ADR 0087, CAS-49 to CAS-51. The matching rules and the ledger stay frozen.
- Next free: ADR 0088, synth module 22, fixture release 900008.

### 2026-10-28 05:20 UTC (Lane A's orchestrator): resumed after the 04:05-04:27 stop
- The 5-hour limit stopped every session at about 04:05 to 04:27 UTC; this container restarted (setup re-run, snapshot loop restarted).
- #42: the verification round's fix agent pushed 46974a25 at 04:03, after the full local suite on that tree. It includes #80 and #79; #74 comes next round. Then the limit stopped it, before the body update.
  - CI on 46974a25: unit, db 1 to 4, e2e 1 and 2, lint, static, build, mutation, capacity, screening-capacity gate and approval-of-record are green.
  - Red: `domain model` (expected: only the founder's approval line, hash `b23fed0e…`) and `images` (being root-caused now).
- Eight sessions told to resume: the schema chain, SUITE-CAP-1a, packet day counts, download refusals, screening-result-tables, CI P1, #120, and ux-forms (UX PR 10).

### 2026-10-28 05:50 UTC: #42's `images` failure root-caused; its final round started
- `images` on 46974a25 was not #42's code. #77's image identity steps pass the whole build-push-action metadata into one environment variable, and buildx's metadata carries the pull_request event, description included. #42's description (95,324 characters) made it 132,387 bytes, over Linux's 131,072, so bash never started. Push runs pass, and a re-run cannot help.
- The fix goes to the base as `co-001/ci-images-digest` (the CI session): pass only the config digest.
- #42's final round (wf_fb12f910-d87):
  - merge #74 and port the same fix;
  - run the checks the delta needs;
  - push once;
  - cut the description below GitHub's 65,536-character cap, moving the review tables to `approval-summaries/pr6b4-review-record.md`;
  - post one PR comment on the images failure;
  - a fresh-clone verification reading CI.
- Then I post the approval line as a suggested change and tell the founder exactly what to do.

### 2026-10-28 05:50 UTC: SUITE-CAP-1a merged as #81 (56ed6279)
- Both adversarial reviews said merge. The review round fixed a confirmed capacity regression: patient-balance batches re-read the match history once per batch, now once per report.
- At 100,000 lines: triage 248.0 s to 52.2 s; the audit report from out-of-memory to 726.3 s. On the default lock table both still fail 53200 until 1b. Records: approval-summaries/lane-b-suite-cap-1a-*.md.
- The same session started SUITE-CAP-3 (reconcile at real size).
- #42's final round was stopped at 05:45 to take #81 into the same push, and resumed: one push with #74, #81 and the images fix.

### 2026-10-28 06:55 UTC: #42 carries the base PR's exact images fix; ci-findings-transport claimed
- The CI session handed over its patch (49 lines, SHA-256 8cf981fb…). It uses `fromJSON(... || '{}')` because the runner evaluates a step's env before its `if:`, and fromJSON('') is an evaluation error. #42's round was stopped before its push, and the patch was applied byte for byte as be63bdc2 on top of the #81 merge (17e233f0): workflows test 114 passed, actionlint and eslint clean. The round resumed for typecheck, actions:check, toolchain:check and capacity, then the push.
- New item `ci-findings-transport` (content-calendar.yml:78, latent) is queued for the CI session.
- Waiting on someone: Dependabot #33 (main's old base-images group) can only be closed by hand, never merged. That is the founder's (or the triager's).

### 2026-10-28 07:20 UTC: #78 merged; merge hold for #75
- UX PR 5 (download refusals) merged as #78 at 06:50 UTC; PR 9 (home figures) follows in the same session.
- At #75's request, the merge hold in LANES.md "Claims" runs until #75 merges or 11:00 UTC. #75 has chased the base four times since 22:00.
- #42 pushes its final round on the base at 56ed6279. #78 and #75 come in at one more base merge after #75 lands. The approval line is posted once this round's verification passes; the domain model's text, so its hash, does not change with a base merge that has no migration.

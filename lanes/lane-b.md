# Lane B log (the co-founder's sessions)

Only Lane B's sessions write this file. Add entries at the end, each with:
- the UTC time;
- what was done, with links to the PR, commits and workflow runs;
- the next step.

Lane A reads it to keep the build tracker current. The rules are in `../LANES.md`; the person's set-up is in `../COFOUNDER-START.md`.

## Start here (Lane B): Lane B is back from 2026-11-01 14:50 UTC
**From 2026-11-01 14:50 UTC Lane B's orchestrator (session_01FcouKNNHsdecRMzfTs7XwW) holds every Lane B item and, until Lane A's
account returns (2026-11-03 14:00 UTC, possibly 15:00 UTC), acts as Lane A for #42's last steps and the schema chain.** Start at
the log's last entry, "2026-11-01 14:50 UTC (Lane B's orchestrator)", then `../LANES.md` "Claims" (each row names its PR, head,
status file and session), `lane-b-session-brief.md`, `acting-lane-a-brief.md`, and the item prompts in
`lane-b-item-prompts-2026-11-01/` (one file per item session; a lost session is restarted from its file). Each item's status file
(`approval-summaries/lane-b-*-status.md`; `lane-a-pr42-status.md` and `lane-a-schema-chain-status.md` for the acting-Lane-A work) is
its handoff. The shared counters are in LANES.md rule 4.

The rest of this section is the state at 2026-10-26 ~21:10 UTC, Lane B's handoff to Lane A, kept as history: where it differs from
the log's last entry, the claim rows, the status files or GitHub, those are current. Its "How Lane B runs" and "Where things are"
still hold. Then, Lane A read `lane-b-handoff-to-lane-a.md` (beside this file) first. A session that continues Lane B's work reads this section first, after `../LANES.md`. From 2026-10-27 that is a Lane A
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
- **Shared counters: LANES.md rule 4 is the record.** From 2026-11-01 14:50 UTC Lane B's orchestrator
  (session_01FcouKNNHsdecRMzfTs7XwW) allocates them for both lanes until Lane A's account returns; an item session writes
  "COUNTER REQUEST: <what>" at the top of its status file, and each claim row names its numbers. Next free at 2026-11-01 14:50 UTC:
  - ADR **0091** (0089 is the Dependabot batch's and 0090 UX PR 8's, each only if needed; 0069 was never used and is free to reuse);
  - `packages/synth` MODULE_NUMBER **22** (`packages/synth/src/cases/common.ts:18` ends at DLR 18 on the base; 19 SGN, 20 HOM and 21
    (UX PR 10, if needed) are reserved);
  - fixture release **900008** (900007 is the release content checks'; 900100 and 900110 are scale releases generated outside the
    repository; SUITE-CAP-1b and the interest fix name 900008 only if needed);
  - test-matrix, next free per series: CAS-52, MOD-19, LED-26, BIL-11, CI-32, MAP-11, PRC-32, SGN-13, HOM-05, TBL-09, DLR-05,
    SEC-20, SCR-23, JOB-06, FRM-09, RCC-09, DBF-06;
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

### 2026-10-30 14:15 UTC (Lane A's orchestrator): the weekly limit stopped Lane A's account; handoff to Lane B written
- Lane A's account hit its weekly limit at about 07:55 to 08:05 UTC on 2026-10-28 (resets 2026-11-03 14:00 UTC). Every session on it stopped mid-run, and nothing on GitHub moved after 08:04 UTC that day apart from Dependabot #87 to #89.
- #42 is at be63bdc2 with CI green except `domain model` (the founder's approval line). Its description, its one PR comment and its fresh-clone verification did not run. The description drafts are now on claude/build-ops in `approval-summaries/lane-a-wip/pr42-body-drafts/`.
- The handoff to Lane B is `lanes/lane-a-handoff-to-lane-b.md`. Lane B takes back every Lane B item at 19:00 UTC today; Lane A keeps #42 and the schema chain.

### 2026-10-30 14:30 UTC (Lane A's orchestrator): Lane A's account is out of usage; Lane B acts as Lane A until 2026-11-03 14:00 UTC
- At the co-founder's word (Lane A's account has about 45 credits left), #42's final round was stopped before it spent them. Its #78 merge was aborted, so #42 stands at be63bdc2 on origin and locally.
- `lanes/lane-a-handoff-to-lane-b.md` now gives Lane B's account Lane A's work too: #42's last steps (its section 4a) and the schema chain (4b), until Lane A's account returns, plus the counters.
- The snapshot loop is stopped. The 19:20 UTC check-in is cancelled. The 2026-11-03 14:10 UTC check-in stays: it reads this log first and hands back nothing that Lane B holds.

### 2026-11-01 (Lane A's orchestrator): the founder's decisions; #33 closed
- The founder signed off #42's legal text as written. Social Security and phone numbers are to be redacted by pattern before the model reads a letter: new item `co-001/redact-ssn-phone`, with ADR 0088 and MOD-15 and MOD-16 reserved. Dependabot #33 is closed, not merged, at the co-founder's word.
- Lane B had not started by 2026-11-01. Nothing was pushed after the handoff, and every PR stands as on 2026-10-28.

### 2026-11-01 14:50 UTC (Lane B's orchestrator): Lane B back; every Lane B item taken back; acting Lane A until 2026-11-03
- **The co-founder's answers** (in session_01FcouKNNHsdecRMzfTs7XwW, about 14:40 UTC): weekly usage is under 20%, so go wide:
  every item that can run now starts now. The three founder decisions of 2026-11-01 that Lane A's session recorded (18bbe0e9,
  15725ba2) are confirmed as genuine in this session and stand: #42's legal text is signed off as written; Social Security and
  phone numbers are redacted by pattern (redact-ssn-phone); Dependabot #33 is closed (unmerged, 14:03:52 UTC).
- **Taken back:** every Lane B item (handoff sections 2 and 3) and, as acting Lane A until Lane A's account returns
  (2026-11-03 14:00 UTC, possibly 15:00 UTC), #42's last steps and the schema chain. In LANES.md "Claims": the dated blockquote;
  every row that read "B (run by Lane A's orchestrator)" reads "B"; #42's and the schema chain's rows say "acting Lane A: Lane B's
  account until 2026-11-03 14:00 UTC"; each row's PR, head and state corrected (also SUITE-CAP-3's freeze is LED-01 to LED-18,
  the redact-ssn-phone row no longer says PRD 14 records the ruling, and the redact-placeholders row's "synth module 10" was
  `completesIn`).
- **What the records had wrong** (checked against git, GitHub and the session tools):
  - #42's description was updated (2026-10-28 08:04:16Z, 61,992 characters, read back identical, SHA-256 394426ea…); handoff §2
    and the 2026-10-30 14:15 entry above said it was not.
  - Handoff §4a step 2 cannot be met as written: the summary (59,308 bytes), the legal text (11,476) and the actions (2,000) pass
    65,536. The 10-28 structure stays (the summary whole at the top, the legal text whole in the record's §1, a pointer in the
    body), with the legal section marked signed off.
  - UX PR 6's design is partial: §§1-4 and the SGN rows only; §§5-8, its review and its revision never ran, and
    `co-001/ux-sign-in-time` is at 165c5993 with no commits.
  - #84: `co-001/wip-packet-day-counts` (acfd8980) is neither an ancestor nor a descendant of the PR head e3299ea2; the fix round
    wf_c661e0c2-b5e is wholly lost.
  - #86's status file is stale ("build starting", 06:41): #86 is built at 83167b8f, contains 83d71fd6, has CI green (23 success,
    2 skipped), merges clean and has no reviews yet; its build scripts were never archived.
  - #85 is `dirty` and has no CI: its base 165c5993 lacks 56ed6279 and 83d71fd6.
  - The schema chain moved past its status file: SS-01 is at f897a282 (it holds 56ed6279 and 6f23c42b, not be63bdc2 or 83d71fd6),
    not f5bd6201; the interest fix is at e0646746 (5 commits on 358dc53f) with no integrator or full-suite result; 1b is
    unchanged at 358dc53f.
- **Sessions, one per item, started in this order.** Each prompt is the rewritten `lane-b-session-brief.md` (plus
  `acting-lane-a-brief.md` for acting Lane A) and the item's file in `lane-b-item-prompts-2026-11-01/`:
  1. `pr42`: #42's last steps (acting Lane A; status `lane-a-pr42-status.md`, new);
  2. `schema-chain`: SS-01, SUITE-CAP-1b and the interest fix (acting Lane A);
  3. `ci-pin-age`: #82 (CI P1), then P2 and P4;
  4. `ci-images-digest`: #86;
  5. `contract-phi-check`: #75;
  6. `packet-day-counts`: #84;
  7. `ux-screening-result-tables`: #83 (UX PR 4), then 4b after #42 merges;
  8. `ux-payer-response`: #85 (UX PR 10);
  9. `ux-home-figures`: UX PR 9;
  10. `suite-cap-3`: SUITE-CAP-3;
  11. `ux-sign-in-time`: UX PR 6;
  12. `ci-findings-transport`: the design now, the build after #86 merges (status `lane-b-ci-findings-transport-status.md`, new);
  13. `unmapped-plan`: #32, then #48 (narrative draft);
  14. `redact-ssn-phone`: the design now, the build after #75 merges (status `lane-b-redact-ssn-phone-status.md`, new);
  15. `dependabot-batch`: #87, #88 and #89 as the build's own PRs (status `lane-b-dependabot-batch-status.md`, new).

  Merge order (handoff §6): #82, #86, #75, #84, #83, #85; the schema chain one PR at a time after #42 (#42, SS-01, 1b, interest).
- **Counters allocated** (LANES.md rule 4; each checked free on the base, on every origin branch and in every claim): the
  Dependabot batch ADR 0089 (only if the SDK major needs a decision record) and MOD-17 to MOD-18; UX PR 8
  (`co-001/ux-account-security`, claimed today, after UX PR 7) ADR 0090 if needed and SGN-09 to SGN-12; ci-findings-transport
  CI-30 to CI-31 if it needs a row. Next free: ADR 0091, synth module 22, fixture release 900008.
- **Container:** `tools/setup-container.sh` fails "node: /opt/node24/bin/node reports 'v24.22.1', not v24.22.0" on the current
  base image; the fix is `mv /opt/node24 /opt/node24.base-image`, then run it again (every item prompt says so).
  storage.googleapis.com has been allowed since 2026-10-27, so the playwright line reads ok.
- **Next:** the item sessions start.

### 2026-11-01 16:58 UTC (Lane B's orchestrator): fifteen item sessions started, every one in ultracode
- **Records pushed first (rule 3):** 8b10b9f6 (claims, counters, briefs, item prompts), 2fa076c3 (every session runs in
  ultracode, the co-founder's instruction of 2026-11-01), e92795ee (`tools/setup-container.sh` now moves a base image's
  own `/opt/node24` of another version aside by itself and installs the pinned v24.22.0; tested with a stub and
  `SETUP_CHECK=1`). The manual `mv` in the 14:50 entry is no longer needed.
- **The co-founder, 2026-11-01 ~16:50 UTC:** "No need to ask for approvals just make sure things are optimized" and
  "Make sure every session prompt ensures ultra code is used." Every prompt starts with `ultracode.`; the session brief's
  section 4 makes every substantive stage a workflow with adversarial verification.
- **Each session's prompt** is short: it reads `lanes/lane-b-session-brief.md` (plus `lanes/acting-lane-a-brief.md` when
  acting Lane A) and its item file `lanes/lane-b-item-prompts-2026-11-01/<key>.md` from build-ops, then resumes from its
  status file. A lost session restarts from the same three files.
- **Sessions** (environment env_018EqbVb4cYQpfgMLn55TVEj, repository attached at `claude/build-platform`, auto mode),
  in the order started:

  | Key | Item | Session |
  | --- | --- | --- |
  | pr42 | #42 PR 6b-4, last steps (acting Lane A) | `session_01FcouKMmYaqDNXbqJyagW8u` |
  | ci-pin-age | #82 P1, then P2, then P4 | `session_01FcouKNP2XtaombFLueKLnu` |
  | ci-images-digest | #86 | `session_01FcouKN1UjKZTWt4U9bZjyW` |
  | contract-phi-check | #75 | `session_01FcouKPAcRv6FTuHCMKAre2` |
  | packet-day-counts | #84 | `session_01FcouKQVq7K3Np8pwNtDhew` |
  | ux-screening-result-tables | #83 UX PR 4 (then 4b after #42) | `session_01FcouKRDfoFAeXZK4Thp8M8` |
  | ux-payer-response | #85 UX PR 10 | `session_01FcouKNxBLBBy2FVM7bfSvj` |
  | ux-home-figures | UX PR 9 | `session_01FcouKPLmdYyBmbVaUjag2c` |
  | suite-cap-3 | SUITE-CAP-3 | `session_01FcouKP4ekrT97eyDtLe4Rd` |
  | ux-sign-in-time | UX PR 6 | `session_01FcouKNxVRK8x6iV52PfxXz` |
  | ci-findings-transport | ci-findings-transport (build after #86) | `session_01FcouKQ3BjYKaME5uBLn8Lz` |
  | unmapped-plan | #32, then #48 narrative draft | `session_01FcouKNB2TyuPCAha9BaEjQ` |
  | redact-ssn-phone | SSN and phone redaction (build after #75) | `session_01FcouKP1U2GGDFhhZT9CaUV` |
  | dependabot-batch | #87, #88, #89 as the build's own PRs | `session_01FcouKRD17iBBR4HhnYcQQx` |
  | schema-chain | SS-01, 1b, interest (acting Lane A) | `session_01FcouKQthXdmDnPmwhFepxW` |

- **Not started yet, each its own session later:** UX PR 7 (sign-in recovery) after UX PR 6; UX PR 8 (account security,
  claimed today) after UX PR 7; ux-forms-after-42 after #42 merges; P5 ci-catalog after #42; #46 Verified seal as
  ux-home-figures' follow-on.
- **Merge order** (handoff §6): #82, #86, #75, #84, #83, #85; the schema chain one PR at a time after #42.
- **Waiting on the founder:** #42's domain-model approval (the suggested line, once posted); the 8-CPU runner for 1b's
  real-size runs; #42's launch actions 2–7; runbook 3i.
- **Next:** each session reports its stage changes here by message; the orchestrator keeps LANES.md and this log current
  and writes the handoff back to Lane A before 2026-11-03 14:00 UTC.

### 2026-11-01 18:00 UTC (Lane A's orchestrator): the old sessions on Lane A's account archived
- Lane B's account has started: UX PR 10 (#85) and UX PR 6 run in its new sessions.
- The old sessions on Lane A's account still held PR subscriptions. Each push by Lane B woke them on Lane A's credits, and they blocked Lane B's sessions from subscribing. Archived: session_017SNqG4nQbbt6xqEG1ZDKe6, 01UzQ6wgZgtThBRBxXTFYhRB, 019i9ifC3LkwNtonZfNSNmCp, 019VghcxKzP9LAj3WK8k6u1D, 01L3tN5LCq2aNYetEQBNJYZg, 019i9ifDUYaz9Hta77Vukkzo, 01TAgFZo3SGSTBEfKRjX1jeG and the schema chain's 019i9ifCi6u3MV8sy7oAhUmy. Each can be unarchived; nothing on origin is lost. Lane A's orchestrator unsubscribed from #42, so Lane B's acting-Lane-A session can subscribe to it.
- Still scheduled on Lane A's account: only the 2026-11-03 14:10 UTC check-in. It reads this log and takes nothing back that Lane B holds.

### 2026-11-01 18:00 UTC (Lane B's orchestrator): first check-in
- **Merged:** #82 (ci-pin-age P1) as bce57f16, 2026-11-01 17:19 UTC (from 9db52a2b).
- **The co-founder's go:** #86 and #83 waited for the co-founder's go typed in-session (given ~17:25 UTC); both now
  running: #86 wf_d3f0da30-f5f, #83 wf_2f124449-b78.
- **PR subscriptions:** every session's `subscribe_pr_activity` on its PR was refused, so sessions poll with
  `pull_request_read` and `send_later`; no effect on the pipeline.
- **Stage per item:**
  - pr42: integrate round wf_57cb0124-835;
  - ci-pin-age: P2 and P4 design re-reads;
  - ci-images-digest: reviews;
  - contract-phi-check: base merge 4 wf_4ca98146-d24;
  - packet-day-counts: reviews regenerated (28 distinct, 9 blocking), fix round;
  - ux-screening-result-tables: finishing, wf_2f124449-b78;
  - ux-payer-response: 90ec40ab pushed, reviews;
  - ux-home-figures: builders;
  - suite-cap-3: design;
  - ux-sign-in-time: design §§5-8;
  - ci-findings-transport: design done (run artifact transport), waits for #86;
  - unmapped-plan: design re-read, rev 3;
  - redact-ssn-phone: design done (22 findings applied; safer choices in §15), build after #75;
  - dependabot-batch: design done (33 findings), builders;
  - schema-chain: wf_5566bd1c-8eb.
- **Counters released** (LANES.md rule 4): ADR 0088 (redact-ssn-phone: an ADR 0054 amendment and an ADR 0070 N6
  sentence were enough) and ADR 0089 (Dependabot batch: unused); synth module 21 (#85 adds no module); CI-30 and CI-31
  (ci-findings-transport needs no row). MOD-17 and MOD-18 are used by the Dependabot batch. Next free: ADR 0088, synth
  module 21, fixture release 900008.
- **Dependabot rulings:** PR C, `co-001/dependabot-group-routing` (the group-routing fix; amends CI-12, no new number),
  claimed 2026-11-01 18:00 UTC. Order: after #86, never ahead of a PR already green and waiting; deadline guard
  2026-11-04 12:00 UTC (before Dependabot's 2026-11-05T04:31Z run). A, B and C may merge while #42 waits on the founder.
- **#85's Lane A items** (design §7.2 items 1-5, added under LANES.md "Handed to Lane A"): `case_line_rules` window
  refusal; `console_contract_queue` excludes response letters, with an index; `payer_response_belongs` letter check;
  `contract_version_documents_ok` refuses a named letter; security: an upload-time link column.
- **The co-founder's completion estimate** (asked 17:25 UTC): the software build is about 17% done now, about 21% after
  the in-flight wave (range 17-29%); the tracker's 66% counts only the original plan. Launch-ready is lower: the
  people-only launch work stands at about 0 of 28 items.
- **Next:** merges #86, #75, #84, #83, #85; #42's step-1 push, then the founder's approval line.

### 2026-11-01 20:05 UTC (Lane B's orchestrator): the 5-hour stop and the resume
- **The stop:** the account's 5-hour window stopped every session ~18:35-19:10 UTC; 7 of the 15 were left FAILED.
- **The co-founder, 19:20 UTC:** hourly limits should no longer apply on the Ultra plan; he asked to kick everything back
  off.
- **The resume:** the orchestrator sent every session a resume message at 19:56 UTC. By 19:59 UTC all 15 confirmed
  running or waiting by design. Sessions still report a 5-hour window resetting 00:10 UTC: if the plan change has not
  applied, another stop is possible.
- **The subscription refusals, explained:** the old sessions on Lane A's account held each PR's subscription (see Lane A's
  18:00 UTC entry); 01UzQ6wgZgtThBRBxXTFYhRB stood down and released #82's at 17:20 UTC.
- **#82's push runs on bce57f16, all green:** ci 41330911483, mutation 41330911489, screening-capacity 41330911481, dry
  run 41330911485. #82's description v5 is pending.
- **The base's redaction gap, routed to #75:** `packages/model-gateway/src/redact.ts` `years()` and `iso()` accept a
  four-digit year below 100, so a claim number shaped like `0023-04-26` reads as a date and reaches the model
  unredacted; MOD-13 fails on seed 1162287068 (found by #83's suite). #75 owns `redact.ts` changes and took it as fix 4
  (a plausible year only), after its base merge 4, in one push; redact-ssn-phone has the FYI. Recorded under LANES.md
  "Handed to Lane A" (2026-11-01 20:05 UTC (a)), with the flaky `tools/release/load.db.test.ts` (b) and SUITE-CAP-3's
  early profile for 1b (c).
- **#85's galleries** (before / after):
  - 1280 px: https://claude.ai/artifact/P3JBtVwbWhpuDMXdwLxsSJ / https://claude.ai/artifact/Af9wPUdrWCySD3QpYGmbWC
  - 390 px: https://claude.ai/artifact/W3BeEkHZBD3jDHZbqEHj4F / https://claude.ai/artifact/DgTGAdMWr1qEX1oMVRnqog
  - 1280 px dark: https://claude.ai/artifact/7g5ME7bzUPa3f6Z4rF37uM / https://claude.ai/artifact/DYrg8YoYSwcPXQxhJuFQXQ
- **The Dependabot alert:** one moderate alert on the default branch; the build gets 403 on alerts, so the co-founder was
  asked to read it (https://github.com/PureTideWater/PhysicalTherapy/security/dependabot). Non-blocking.
- **Stage per item:**
  - pr42: step 1 pushed c65f9cf2; #82 merged locally as 6c28d6a2 (`co-001/wip-pr42-integrate-3`), db shards 2-4,
    build, e2e and capacity left (wf_a2590f4b-2bb), then the push;
  - ci-pin-age: P4 building on bce57f16; P2 after #86 (on the base if #86 is still open when P4 reaches its draft);
  - ci-images-digest (#86): reviews done (S1 CI, S1 security, 4 nits); bce57f16 in on WIP b2a41a00 (N32); fix round next;
  - contract-phi-check (#75): base merge 4 local (584f5218, 7cd60740; WIP -6), suite green so far; fix 4 (redact.ts
    plausible year) running; then one push;
  - packet-day-counts (#84): fix round (28 distinct, 9 blocking), resumed; WIP snapshot -3 9554cdc7;
  - ux-screening-result-tables (#83): CI all green on 71536c60, mergeable; description and verification
    (wf_a898fcc2-e82), then ready and waiting after #86, #75, #84;
  - ux-payer-response (#85): reviews done (13 real findings, none blocking); fix round wf_747662b4-90f;
  - ux-home-figures: build integrating (WIP f22eeffc); CAS-41 gate passes (100k lines: 7,775 ms against 18,312 ms);
  - suite-cap-3: design; early profile superlinear (6,000 lines with 1b's sections: 1,486 s);
  - ux-sign-in-time (UX PR 6): built (slices A-D, WIP 92984990 before its nit fixes); draft #92 at e4e05a0d (20:10 UTC),
    reviews running (wf_b4cf4f54-7c4);
  - ci-findings-transport: design done, waits for #86 (idle by design);
  - unmapped-plan (#32): building (wf_ffe27481-f78), WIP ae465bf9 (core, docs, synth done; reports and web partial);
  - redact-ssn-phone: design done, waits for #75 (idle by design);
  - dependabot-batch: A draft #90 (06f79c07, CI green, reviews); C draft #91 (651f8b80); B finishing (WIP 7d153446);
  - schema-chain: SS-01 pushed 9777ddc0 (all green); now efb20704 (bce57f16 in), checks green through test:db; build
    and e2e next; waits for #42's #82-merged head.
- **Next:** #86 merges first, then #75, #84, #83, #85; #42's push, then its suggested approval line for the founder.

### 2026-11-02 01:00 UTC (Lane B's orchestrator): check-in 3
- **Merged:** #83 (UX PR 4, the screening result on a phone) as 43565235, 2026-11-01 20:40 UTC (from 71536c60, under the
  20:36 UTC rule); push runs green: ci 41348075952, mutation 41348076075, screening-capacity 41348076076.
- **New PRs:** #90 (Dependabot A, the SDK major), #91 (C, group routing), #92 (UX PR 6, sign-in time), #93 (UX PR 9, home
  figures), #94 (B, aws-cdk and minor-and-patch), #95 (#32, one unmapped plan).
- **Ruling, 2026-11-01 20:36 UTC (Lane B's orchestrator): the merge rule.** A verified, green PR merges as soon as it is
  ready; the section-6 order applies only between PRs that conflict with each other (the one merged second resolves).
  Broadcast to 11 sessions (wf_0d9195c0-5f7); #83, ready and verified, was told to merge at once. Recorded in LANES.md
  under the lapsed merge hold.
- **Ruling, 2026-11-01 21:59 UTC (Lane B's orchestrator):** #85 waits for #75 only (it resolves #75's `uploader.tsx` and
  contracts page, design 3.7); #84 resolves #85's test-matrix/registry overlap at its base merge. Told #85 and #84.
- **New conflict pairs:** #94/#91 (`docs/runbooks/dependency-upgrades.md`'s AWS paragraph); #42/#94 (both app manifests
  and the lockfile; the one merged second regenerates).
- **ADR 0066 numbering** (in LANES.md's CI follow-ups row): #86 notice N32; P2 notices N33-N42, proposals P38-P42; P4
  notices from N43, proposals P29-P37, P43, P44.
- **#42 at the founder:** verified (21:14 UTC) at head 6c28d6a2; description posted (64,998 characters); `images` comment
  posted. The suggested approval line (Tyler Williams, 2026-11-01, `b23fed0e…2518`, line 7334):
  https://github.com/PureTideWater/PhysicalTherapy/pull/42#discussion_r4437376734. **Waiting on the founder to commit the
  suggestion**; the schema chain opens nothing until #42 merges. 6c28d6a2 forwarded to the schema chain.
- **#85's after-fix galleries** (a97d6011):
  - 1280 px: https://claude.ai/artifact/3iCSW99opuzmyvS7eohkzz
  - 390 px: https://claude.ai/artifact/C5TvJaTbjSfUjUEJ5Woxus
  - 1280 px dark: https://claude.ai/artifact/7nVhABbzohq7uv8TPbfAP3
- **The co-founder's question, 21:40 UTC:** "How can we speed this development up?" The orchestrator's recommendations:
  - the founder approves suggestions the same day (#42's line gates the whole schema chain);
  - move the repository to a GitHub organization on Team: 8-CPU runners (the real-size runs SUITE-CAP-1b waits for), a
    merge queue, a private repository;
  - start the people-only launch work now;
  - a second wave of 8-10 sessions;
  - CI as the full-suite record, with affected tests run locally: awaiting the co-founder's yes (a LANES.md rule 1
    change);
  - group same-code work.
- **Stage per item:**
  - pr42: verified; suggested approval line posted; waiting on the founder's commit;
  - ci-pin-age: P2 re-read done (22 findings, 8 critic gaps; e71571bf), waits for #86; P4 re-read done (28 findings, 12
    gaps; dafb08f1), building (wf_f8ce3582-ddc) on `co-001/ci-mutation-trigger` at 43565235;
  - ci-images-digest (#86): reviews verified (CI S1; security S1/S2/S3; 6 nits; 2 refuted); fix round wf_401c564d-6b7
    (base 43565235, T6 structural references, key-expression refusal, per-string byte sums, the pull-request runs'
    build-record upload off: the event was public for 90 days; nits), full suite, trial merges against #42 and the co-001
    heads, one push (R3);
  - contract-phi-check (#75): fix 4 in (a year of 1900-2099 only; the seed's regression test); F4-1 found and fixed
    (numbers joined by an underscore, a pipe or a backslash never matched: an older redaction gap); cf61a828 (WIP -7);
    base merge 5 (43565235) wf_51ee625f-c33 running (at 22:12 UTC the suite green so far on 49156dd8); then one push;
  - packet-day-counts (#84): fix round; resolves #85's test-matrix/registry overlap at its base merge; merges after #75;
  - ux-screening-result-tables (#83): merged; idle at a clean point until #42 merges, then UX PR 4b (reuses TBL-08);
  - ux-payer-response (#85): fix round pushed a97d6011 (13 findings and the nits fixed; re-review dry; unit 6,823, db
    9,293, e2e 63); verified and ready (21:59 UTC, CI green); waits for #75 only;
  - ux-home-figures (#93): draft at af3b6d89 (integration green; CAS-41 gate passes); base 43565235 in (87691be4, CI
    green); reviews done (~21:40 UTC: 23 real findings, none blocking); fix round wf_768311e7-b88;
  - suite-cap-3: design;
  - ux-sign-in-time (#92): CI green on e4e05a0d; reviews done (SEC-01: Start again left the pending step live; SEC-02;
    UXS-02 to UXS-05); fix round wf_aabddb31-b59, then the after-push shots and the UX review;
  - ci-findings-transport: design done; builds early on a WIP ref from #86's fix-round head; its PR after #86 merges;
  - unmapped-plan (#95): draft at 8517ee3a (local checks green: unit 6,845, catalog and cross-tenant); CI green; three
    reviews running (wf_4b65ed61-326);
  - redact-ssn-phone: design done, waits for #75 (idle by design);
  - dependabot-batch: A #90 reviews done (0 blocking, 5 should fix, 13 nits), fix round wf_416e36ca-397; B #94 (484e9f06,
    43565235 in, CI green) and C #91 (651f8b80, CI green) in reviews (wf_91a35eba-252);
  - schema-chain: SS-01 efb20704 green (e2e 68); 1b ce408d2f (SS-01 in; db 9,600); wf_5566bd1c-8eb (1b's gate and the
    interest fix's slice 4) and wf_a12c973a-c12 (#42's 6c28d6a2 and the base 43565235 into SS-01) running.
- **Next:** each PR merges as soon as it is verified and green; between conflicting pairs, #86 before P2 and #91, #75
  before #85 and #84; #42 at the founder's commit, then the schema chain.

### 2026-11-02 02:35 UTC (Lane B's orchestrator): the weekly cap and the pacing call
- **The weekly cap:** every session reports `rate_limit` `seven_day` `allowed_warning`, resetting 2026-11-06 19:00 UTC.
  The 5-hour stops (~22:20 UTC on 2026-11-01, reset 00:10 UTC) were HTTP 429 `usage_limit_reached` with overage
  disabled at the organization level; "no hourly limits" did not hold for this account.
- **The co-founder's call (relayed 02:07 UTC):** finish the near-done PRs, economically and with no follow-ons; pause the
  design- and build-stage items at clean points, with one check-in at 2026-11-06 19:15 UTC; no second wave. Budget is
  kept for the Lane A handoff.
  - **Finishing:** #86 (ci-images-digest), #75 (contract-phi-check), #85 (ux-payer-response), #93 (ux-home-figures), #95
    (unmapped-plan), Dependabot (#90, #94, #91), #84 (packet-day-counts; its re-review loop now ends at the first dry
    round), the schema chain (to a clean point: SS-01 bb13be1b, 1b, interest c18a847e) and #42.
  - **Paused until the reset:** UX PR 4b (#83's follow-on), ci-findings-transport (built on WIP b9a83bd3, paused before
    its reviews), redact-ssn-phone (design done), P2 and P4 (P4 is draft #96 at 50029e64, paused before its reviews;
    resume wf_f8ce3582-ddc), SUITE-CAP-3 (profile: 10,000 lines with 1b 3,412 s; WIP a215ba62).
  - **Held:** UX PR 7 (now unblocked by #92) and every other new session.
- **Ruling, 02:11 UTC (Lane B's orchestrator):** P4 keeps its `tools/test/workflows.test.ts` edit (the mutation describe
  only; disjoint from #42; trial merge clean), a shared file under rule 6 with #42.
- **Merged:** #92 (UX PR 6, sign-in time) as 4eaf7124, 2026-11-02 02:14 UTC, from ab68af87. Left: UX PR 7 (with UXS-01),
  UX PR 64, UX PR 66 and the "three days" comment (Lane A and the founder), UXR2-02, audit #103.
- **The Lane A handoff:** written early and pushed (`lanes/lane-b-handoff-to-lane-a-2026-11-03.md`, 713bd72b; checked
  live at 02:25 UTC); refreshed before 2026-11-03 14:00 UTC. LANES.md "Handed to Lane A" now has #84's
  `tp-packet-verifier/3` migration, #92's `identity.ts` comment and AssociateSoftwareToken staging check, and #93's F9.
- **#42:** still waiting on the founder's commit of the suggested approval line at 02:30 UTC (head 6c28d6a2, behind the
  base by #83 and #92, both migration-free).
- **Other:** O9's capacity sizing (S4 45.6 s against 44 s) is a founder item blocking launch, not merges (issue #41);
  recorded in #94. 1b's CAS-42.1 reports 481 s against its 180 s budget (investigating; CAS-42.2 passes).

### 2026-11-02 06:20 UTC (Lane B's orchestrator): #93 and #90 merged; the founder approved #42
- **#42:** THE FOUNDER COMMITTED THE APPROVAL LINE as 9426a8d1 (2026-11-02 02:36 UTC: "Approved by: Tyler Williams
  Date: 2026-11-01  Document SHA-256: `b23fed0e…2518`"). #42's session is merging the base and going to merge; then the
  schema chain opens SS-01's PR.
- **Merged:** #93 (UX PR 9, home figures) as 877e662f, 02:44 UTC, from d1e4c4c4, all green; #90 (PR A, the SDK major) as
  88708069, 04:00 UTC; Dependabot #87 closed with a comment. 88708069 changes `packages/model-gateway` (sdk ^1.3.0, the
  client options, ADR 0048, MOD-17 and MOD-18); #75 told; #94 takes A's merge (a `package.json` conflict). Merges this
  round: #82, #83, #92, #93, #90.
- **Stopped at clean points:** #92's session (push runs on 4eaf7124 green after one ci re-run; an archive candidate) and
  #93's (no follow-on; #46's Verified seal deferred to after the reset; proposals after #42: `help.ts` stage five and
  the reconciliation-001 line).
- **The schema chain at clean points:** SS-01 bb13be1b (unit 7,160, test:db 9,567+1, e2e 69; domain model `3922b6a6…f019`
  at line 7414, provisional); 1b 048bc843 (test:db 9,608, e2e 69, Stryker; domain model `e024cf9f…efc4df` at line 7459,
  provisional). CAS-42.1 481 s -> 95.8 s (the candidate-query fix). 1b needs NO 8-CPU runner (the 4-CPU runner gave its
  real-size verdicts): the founder ask is withdrawn once the `--small` smoke confirms. The interest fix finishing
  (wf_3c4cf5ac-af0).
- **SUITE-CAP-3:** paused after design (67159eaf; WIP 956b32ef). Probed: 6,000 lines 1,486 -> 378 s; 10,000 lines
  3,412 -> 1,058 s; the writes identical; ADR 0087 needed. Its `ledger_line_net` rewrite (10,000 lines 1,058 -> 263 s;
  DDL in the design's §14.1) needs a founder ledger-freeze exception: Handed to Lane A, 2026-11-02 06:20 UTC (a). All five
  design-stage sessions are paused.
- **In flight:** #84 resumed 06:18 UTC with the Stryker split (17 shards; WIP `-5` = 15d8ed1c; the base 88708069's
  `test-support/browser.ts` conflict merged inside the fix round); #94 and #91 in fix rounds; #85 waits for #75 (now also
  a `display.test.tsx` overlap with #93, resolved in its one base merge).
- **Push run red on 88708069** (ci 41386010790, `unit`): `action-form.browser.test.tsx` FRM-01 :366 timed out at 30 s;
  7,012 others passed; mutation and capacity green; the tree equals cf124313 (passed on the PR). Likely a flake; the
  Dependabot session is root-causing it (wf_63290a32-038).
- **Open: three flaky tests** (Handed to Lane A, 2026-11-02 06:20 UTC (b)): `tools/release/load.db.test.ts`;
  `apps/worker/src/report/csv-arena.test.ts:151` (5 s timeout; proposal: an explicit timeout for CAS-41.3's test);
  `apps/web/src/components/action-form.browser.test.tsx` FRM-01 :366 (30 s timeout).
- **The third 5-hour stop:** ~03:10-05:50 UTC; the sessions resumed after it.
- **The co-founder's question on reusing open-source code** (answered 03:05 UTC): a bounded prior-art check in the design
  stage for official data sources, permissively licensed maintained libraries and test oracles; never copying code
  without a compatible licence. Awaiting the co-founder's yes to add it to the session brief.

### 2026-11-02 09:25 UTC (Lane B's orchestrator): #42 and #95 merged; SS-01's PR under way
- **#42 MERGED** as 22789493 (2026-11-02 07:35 UTC, a merge commit) from head 9bb0604e: the founder's approval line
  9426a8d1 (Tyler Williams, 2026-11-01, `b23fed0e…2518`), then the base 88708069 merged in (migration-free; `--check
  --require-approval` still reads `b23fed0e…2518`). CI green on 9bb0604e, `domain model` and `all green` included;
  fresh-clone verification pass. Push runs on 22789493 green (ci 41407227669, mutation 41407227619, screening-capacity
  41407227658). Its session is done. The items that waited on #42 (UX PR 4b, ux-forms-after-42, P5 ci-catalog, the
  `help.ts` proposals) stay paused until the 7-day reset.
- **#95 (#32, one unmapped plan) MERGED** as 2affb854 (08:47 UTC) from head 48dabc28 after its fresh-clone
  verification; push runs on 2affb854 green (ci 41415623536, mutation 41415623512, screening-capacity 41415623520). Used
  ADR 0075, MAP-06 to MAP-09 and PRC-29 to PRC-31; MAP-10 stays reserved for Lane A's notice follow-up. #48 (narrative
  draft) NOT started (pacing): paused. Base now **2affb854**.
- **Merges this round:** #82, #83, #92, #93, #90, #42, #95.
- **The schema chain (acting Lane A):**
  - **SS-01's PR stage runs** (wf_78cd4c88-7b1, from 07:40 UTC): the base 22789493 merged into bb13be1b and
    regenerated, the draft PR, two reviews (security and tenant isolation; UX and brand with shots), the fix round with
    one full suite, the verification, then its suggested approval line for the founder as one pull-request comment. At
    09:25 UTC origin is still bb13be1b and no PR is open. It is the only schema PR to open next.
  - **1b at 048bc843.** **The 8-CPU-runner ask is WITHDRAWN** (06:22 UTC): the `--small` smoke at 048bc843 passed on 4
    CPUs, and GitHub's free 4-CPU runner gave FULL_SIZE verdicts (runs 40479127979, 40584379787); CAS-42.5 and .6 run at
    1b's PR stage. New at ~09:20 UTC: CAS-42.1 fails at 048bc843 too (the report 730-750 s against 180 s; its plan
    depends on whether autovacuum's ANALYZE lands after triage); a plan-independent fix runs (wf_3118d5d7-edb).
  - **Interest:** 379fed9f (1b in, 04:26 UTC), then slice 4 (d37a0ee3) and the integrator's take-back fix: at its clean
    point **74a6b290** (~09:20 UTC), its one full suite green but for 1b's CAS-42.1 (unit 7,275, e2e 71); domain model
    `47887070…eb8ef` at line 7469, provisional.
- **Rulings:** (06:22 UTC) the Dependabot session owns **PR D**, `co-001/test-flakes-2`, tests only: FRM-01's monotonic
  wait (the root cause of the red push run on 88708069: the exact data-shown wait raced a deliberate re-key ~35-50 ms
  later, 1 in 48 CI runs, not #90's change) and `csv-arena.test.ts:151`'s explicit timeout; added to the Dependabot claim
  row; it builds after B's and C's suites. (08:52 UTC, an update) **#91 no longer waits for #86** (the first-ready rule;
  a trivial ADR 0066 overlap that #86 resolves); B, C and D merge when ready. Told to the Dependabot and #86
  sessions.
- **Dependabot:** after #90 it closed #89 (04:07 UTC) and #88 (04:10 UTC) and opened #97 (minor-and-patch, 17 updates),
  deferred to the next weekly triage (pacing; named in #94). After #42 merged it closed #97 (07:42 UTC) and opened #98
  (minor-and-patch, 18 updates, 07:45 UTC), left like #97 to the next weekly triage.
- **In flight (finishing):** #75: 88708069 merged locally (WIP `-9` 315ac91e), the suite green through test:db; mutation,
  e2e and critic 2, then one push. #86: check rounds on the open dispositions (repair 1 fixed two loosenings, WIP
  a5bc1170; repairs since on the WIP ref, 5c01f150 at 09:18 UTC); then the base, the suite once, push R3. #84: the
  Stryker split done (17 shards; `-5` 15d8ed1c), a base-merge step before its one suite and re-reviews. #85: verified and
  ready at a97d6011, waits for #75 only. #94 (B): fix round in its suite (`-b` f43f809d), then B(6) at its merge prep.
  #91 (C): fix round done (b1fd5df1); merge prep wf_194e8aaf-799.
- **LANES.md "Handed to Lane A", #32:** checked: it already reads as design §14 (review 12c) does (no figure codes;
  `lines` and `billed` exist); its "What Lane B did" line now names #95.
- **The handoff** (`lanes/lane-b-handoff-to-lane-a-2026-11-03.md`) is refreshed to this state (sections 1-3, 5-7 and 9);
  the 8-CPU runner is off the founder items there and in LANES.md.

### 2026-11-03 14:20 UTC (Lane A's orchestrator, back after its weekly reset)
- Read `lanes/lane-b-handoff-to-lane-a-2026-11-03.md` (state as of 2026-11-02 09:25 UTC). Nothing on GitHub or claude/build-ops has moved since about 11:15 UTC on 2026-11-02. The refresh and stand-down that handoff promised before 14:00 UTC today did not happen, most likely because Lane B's 7-day cap stopped it.
- Live heads: base 21fa10df (#91 merged after the handoff); SS-01 bb13be1b (no PR; its PR stage wf_78cd4c88-7b1 was mid-run, so anything it had not pushed exists only in its session's worktree); SUITE-CAP-1b 22177731 (the CAS-42.1 report-plan fix, pushed 11:02 UTC 2026-11-02); interest 74a6b290.
- **Lane A takes back the schema chain, #42's follow-ups and the counters from these heads, as soon as the co-founder confirms.** Lane B's acting-Lane-A sessions (session_01FcouKMmYaqDNXbqJyagW8u and session_01FcouKQthXdmDnPmwhFepxW) must not resume the chain after Lane B's reset (2026-11-06 19:00 UTC): read this entry first and stand down.

### 2026-11-04 02:30 UTC (Lane A's orchestrator): the schema chain taken back
- The co-founder said go (Lane A's weekly usage 10%). session_019i9ifEG147aKfNHEAsoS7h runs SS-01's PR stage from bb13be1b, then carries 1b (22177731) and interest (74a6b290) forward until each one's turn.
- Its pacing: CI is the full suite of record; locally the fast checks, the touched tests and the domain-model check; the full local suite once per branch on its final tree; the base merged once, right before a push.
- Lane B's acting-Lane-A sessions stand down on their next wake.

### 2026-11-04 02:45 UTC (Lane A's orchestrator): Lane A finishes Lane B's six waiting PRs until 2026-11-06 18:30 UTC
- The co-founder's direction: decide without asking, speed up without lowering quality, no extra usage.
- Four sessions on Lane A's account, by `lanes/acting-lane-b-2026-11-04.md`:
  - S1: #75, then #85;
  - S2: #84;
  - S3: #86, then #96;
  - S4: #94, then PR D.
- The speed rules there now apply to both lanes. Lane B's sessions read this entry before resuming. At 18:30 UTC on 2026-11-06 each acting session stands down at a clean point with a RESUME-BLOCK for Lane B.

### 2026-11-04 03:40 UTC (Lane A's orchestrator): two base-red causes after #94 (4846f043), neither #94's
- **images:** the Trivy installer's host (get.trivy.dev) stopped resolving on 2026-11-03, so every images job and release.yml's scan fail. S4 is fixing it: `co-001/ci-trivy-install-2026-11-04` installs the pinned Trivy from its GitHub release with a checksum (ADR 0066 amendment, two reviews), and its diff goes to every session to port.
- **screening-capacity:** the repository is now **private** on a personal GitHub Free account. Private standard runners have 2 CPUs, and the capacity harness refuses fewer than 4 by design (RUNNER_TOO_SMALL), so the required "screening-capacity gate" fails for every PR touching the screening, and the weekly release-capacity run fails too. Private on Free also has no branch protection, secret scanning or push protection (ADR 0063). **For the founder:** github-governance.md sections 1 and 2 (an organization on GitHub Team, then the repository transferred into it), then a 4-core larger runner whose label the build puts in both capacity jobs. Tracked in issue #102. Until then, a PR that touches watched paths cannot pass that gate.

### 2026-11-04 05:50 UTC (Lane A's orchestrator): check-in
- All five sessions are running: the schema chain and S1 to S4.
- Merged so far today: #94 (Dependabot B) as 4846f043.
- Open: #104 (SS-01, reviews running), #75 (pushed a8149341; verification 2), #105 (PR D), #106 (CI fetch fix) and the split Trivy-pin PR.
- Blocked on the founder's runner decision (the repository is private; issue #102): #104, #75 to #85 to #84, and #106.

### 2026-11-04 06:30 UTC (Lane A's orchestrator)
- Merged:
  - #107, Trivy installed from its pinned GitHub release with a checksum, as 7bf7b252. Every images job is green again after the next base merge.
  - PR D (#105, test-flakes-2), as df4daff7.
- Waiting only on the founder's runner and organization decision (#102): #75 (verified, a8149341), then #85 and #84; SS-01 #104 (in its fix round); #106 (the capacity gate's private-repository fetch fix). Each needs one base merge and a push after the decision.
- S4 takes UX PR 7 (sign-in recovery) as acting Lane B and keeps #106 dormant.

### 2026-11-04 07:10 UTC (Lane A's orchestrator): the repository is public again; #102 resolved
- The founder made the repository public (the API reads private=false). Standard runners have 4 CPUs again, so the screening-capacity gate and CAS-42.5's free route work.
- Told every session:
  - S1: #75 now, then #85.
  - S2: #84 after #85.
  - S3: #86 takes #107, then #96.
  - S4: #106 is woken and merged for robustness; UX PR 7 continues.
  - The schema chain: SS-01 #104 finishes, then its approval line.
- Still with the founder: the release loader's freeze exception (`tools/release/load.db.test.ts`'s flake; the schema chain's ask of 2026-11-04 05:50 UTC).

### 2026-11-04 07:40 UTC: #75 (contract-phi-check) merged as 72096e94
- CI: all 26 checks green, the capacity gate and images included. S1 goes on to #85 (four conflicts to resolve at its base merge), then hands to S2 for #84.
- redact-ssn-phone, which waited for #75, can now start. It is Lane B's, paused until Lane B's reset.

### 2026-11-04 09:25 UTC: #106 merged as 881e2bbd; #86 merged as 24531dc2
- #106: the screening-capacity gate's private-repository fetch fix and the CI-11 guard.
- #86 (ci-images-digest): description cut to 33,954 characters.
- New merge step, in force from 08:00: GitHub now enforces the up-to-date rule, so a PR whose base moved since its last CI merges the base again and re-runs CI first (`lanes/acting-lane-b-2026-11-04.md`, 2a).
- S3: #96, then ci-findings-transport. S1: #85, then redact-ssn-phone. S4: UX PR 7.

### 2026-11-04 09:30 UTC: UX PR 7 (sign-in recovery) is draft #108
- Head 6b25ed60, built red-first; integration green, e2e and axe included.
- S-3 ruled the safer way (ADR 0081 A2 amended): a Cognito or audit failure on a real account answers like a non-account and is logged by IDs only.
- The wording departures D-1 to D-4 from the UX review's ruled words are listed in the PR body. Taken under the co-founder's "decide without asking" direction; none is legal text.
- Two reviews are running.
- Handed to Lane A (not blocking): alarms on password-reset requests per user and on undelivered requests (R-11); branded wording for Cognito's code email; a "your password was changed" email.

### 2026-11-04 09:55 UTC: the release loader's freeze exception granted
- Recorded in `approval-summaries/founder-asks-2026-10-27.md`. The schema chain puts the loader fix (its failing-first patch: 4 files) into SUITE-CAP-1b. That fixes the flaky `tools/release/load.db.test.ts` at its root.
- SS-01 (#104) awaits the founder's commit of its suggested approval line (https://github.com/PureTideWater/PhysicalTherapy/pull/104#discussion_r4465978371).

### 2026-11-04 11:50 UTC: UX PR 7 (#108) merged as 45d7d0c1; SS-01's line committed by the founder
- #108: design, then build red-first, then two reviews with skeptics, two fix rounds, the full suite once and two verifications. The CI capacity gate passed.
- SS-01: the founder committed the approval line (d214ad6c, 11:30 UTC). The schema chain is taking the base forward, then CI, ready and merge.
- **Security, Lane A, now in S4:** `co-001/cognito-confidential-client` (#108's P-1).
  - The problem: Cognito's app client is public with EMAIL_ONLY recovery, so ForgotPassword, ConfirmForgotPassword and InitiateAuth can be called past the app's gate, rate limit, audit and lockout. A confirmed user with no factor can be taken over through MFA_SETUP.
  - The fix: a confidential client with SecretHash.
  - Also in it: P-3 (the per-code attempt cap) and R-11 (the reset alarms).
  - Reserved: ADR 0088 if needed and SEC-20 to SEC-23. Next free: ADR 0089 (0090 is UX PR 8's), SEC-24.
- Queued after it in S4:
  - the dark sign-in frame's links at about 1.9:1 contrast (a WCAG failure, on the base already);
  - the branded code email and a "password changed" email.

### 2026-11-04 12:30 UTC: cognito-confidential-client designed as two PRs (ADR 0088)
- Why two: a Cognito client cannot gain a secret in place. CDK replaces it with a new client ID, so an image rollback across a single PR would break every sign-in.
- PR 1, building now: the enrolment rule (MFA_SETUP only inside a live invitation, matched by sub and email; closes the app-path takeovers); the invitation rule; SecretHash support, inactive until a secret exists; the staging diff role denied DescribeUserPoolClient and ListUserPoolClientSecrets; the R-11 alarms; SEC-20 to SEC-23.
- PR 2, after PR 1 is on staging: the confidential client, its secret in Secrets Manager (readable by the web role only), rotation, the cutover.
- Decided by Lane A's orchestrator, as recommended:
  - ruling 13: rotation by the break-glass role only;
  - ruling 14: admin-delete-user by break-glass only;
  - ruling 15: N+1 within 7 days of N in production, and before the first customer invitation.
- For the founder before PR 2 merges: ruling 16 (an SCP or permission boundary denying DescribeUserPoolClient to read-only permission sets) and the credentialed steps F1 to F5 (design section 10).

### 2026-11-04 13:10 UTC: SS-01 merged as #104 (e084da22)
- The first schema PR of the chain. It rested on: the founder's line d214ad6c; `--check --require-approval` exit 0 (08c1ba47…6142); all required checks green, the domain model included; approval-of-record re-run after ready; fresh-clone verification passed.
- Next in the chain: SUITE-CAP-1b's PR stage. Its open items: CAS-42.5's memory.peak (980 MiB against 921.6); the loader warning's wording; the founder's ruling on the INDEX_CLEANUP ON amendment.
- Merged today in all: #94, #107, #105, #75, #106, #86, #108, #104.

### 2026-11-04 13:15 UTC: the loader freeze's INDEX_CLEANUP ON amendment granted
- Recorded in `approval-summaries/founder-asks-2026-10-27.md`. It goes into SUITE-CAP-1b's PR with the loader fix.

### 2026-11-04 14:40 UTC: #109 merged; SUITE-CAP-1b open as #110; a rule break caught and corrected
- #109 (test-flakes-3, scan.test.ts on a mocked clock) merged as c4941291.
- SUITE-CAP-1b is draft #110 (head d219e97d), with three reviews running. Its body quotes both of the founder's freeze grants.
- **The rule break:** S4's build agent for cognito-confidential-client PR 1 met a gitleaks refusal on a synthetic test password. It added two .gitleaksignore entries (45b7766f, 1721a256) on `co-001/cognito-confidential-client` and opened draft #112. Never merged.
- **The remedy:** PR 1 is rebuilt on `co-001/cognito-confidential-client-pr1` without an ignore entry, with the test value rewritten. #112 is closed with a comment. The superseded branch `co-001/cognito-confidential-client` stays on origin unmerged (whether to delete it is the person's call); it must never be merged or reused. Workflow prompts now state that a gitleaks refusal means rewriting the flagged text, never .gitleaksignore.
- **For the founder before release N reaches production:** F0, a staging check that Cognito's challenge names the user's sub (ADR 0088 "Not verified here").
- **Lane A's queue:** a migration to relink an app row to a new Cognito subject. Until then, the stuck-invitee runbook uses the re-send remedy.

### 2026-11-04 16:30 UTC: #84's fix round done; packet-figure-placeholders claimed
- #84 (packet day counts) is at `co-001/wip-packet-day-counts-2` 3b276add and waits only for #85.
  - Each figure now takes its own role, never the union of its clause's cues.
  - verifierNow runs at request, approval, export and on screens.
  - Its packets Stryker is split into 13 shards.
- The re-review loop kept finding English ways to name part of the lines ("apiece", "save one"). Every one also passes the base, so #84 narrows the class and opens nothing; ADR 0086 records it as a known limit.
- **Decided by Lane A's orchestrator (CLAUDE.md's first rule, code computes every number):** the narrative's figures become placeholders bound to fact ids, rendered by code at export, and free-text numbers in a model narrative are refused.
  - New item `co-001/packet-figure-placeholders`; ADR 0089 if needed; CAS-52 to CAS-55.
  - In S2 after #84: design first; built only if time allows before the handback. A migration, if one is needed, is Lane A's.
- Next free: ADR 0091 (0090 is UX PR 8's), CAS-56.

### 2026-11-04 17:45 UTC: cognito-confidential-client PR 1 merged as #113 (9b237a93)
- On the base now:
  - second-factor enrolment only inside a live invitation, matched by Cognito sub and email;
  - no invitation onto a Cognito user that ever signed in;
  - SecretHash support, inactive until a secret exists;
  - the staging diff role denied the client-secret reads;
  - the R-11 alarms;
  - ADR 0088, proposed; SEC-20 to SEC-23.
- PR 2 (the confidential client and the cutover) is cut after PR 1 is deployed to staging.
- For the founder: F0 (a staging sign-in with a synthetic account, before release N reaches production); F1 to F5 and ruling 16 (the SCP), before PR 2.
- #114 (test-flakes-4) is open, opened by the orchestrator for S2. S4 goes on to the dark sign-in frame's link contrast, then the code email and the "password changed" email.

### 2026-11-04 18:10 UTC: SUITE-CAP-1b (#110) fix round pushed 4a8357d9; CAS-42.5's memory measure decided
- #110's fix round: the confirmed findings fixed; the loader amendment, failing first; 14 operator-word fixes; the harness exercises step 7b; #109 and #113 merged in. Full suite once, green: unit 7,610; test:db 9,815; e2e 77; Stryker.
- **Decided (not a founder ruling: no ruling chose memory.peak; ADR 0062's own check already judges anonymous memory):** CAS-42.5's 90% line (921.6 MiB) applies to the worker container's working set, memory.current minus inactive_file. That is the kubelet's eviction measure, and the kernel reclaims inactive cache before an OOM kill.
  - memory.peak and memory by kind stay reported beside it.
  - Any oom or oom_kill event fails the run.
  - Evidence from two instrumented runs on one tree: peak 842.9 and 958.6 MiB, all of the swing page cache (238 and 335 MiB); the worker's own memory 595.8 and 622.8 MiB.

### 2026-11-04 18:40 UTC: #114 merged (9c6bb102); #85 merged (17641c88)
- #114 (test-flakes-4): the screening thread's failure code moved to a module of its own, so its test no longer loads the thread's whole graph.
- #85 (UX PR 10): the payer's answer and the write-off reason start unchosen; the letter is uploaded inside "Log a payer response". #104's suspension gate and #85's upload gate are resolved into one upload gate, with the resolution reviewed (0 findings).
- Open:
  - #84: S2's final base merge, now unblocked.
  - #115 (redact-label-boundary): CI re-running after the #108 sign-in-time flake.
  - #110 (SUITE-CAP-1b): working-set measure and step 7b on its own practice.
  - test-flakes-5 (S4): axe waits for the page title.
  - #96 and ci-findings-transport (S3).
- Merged today: 12.

### 2026-11-04 21:05 UTC: #115 merged (00fd2906); #96 merged (30871f72)
- #115 (redact-label-boundary): a sentence end now breaks a label's head, so an ID written as a date after a bare "ID:" is redacted. MOD-13's seed 460548619 is pinned.
- #96 (P4, ci-mutation-trigger): a change that Stryker core loads (the root typescript) now runs its shards. The mutant counts equal the base push run on all 42 files.
- PE-S1 (nine shard rows in ci.md, shardsFor = 9) goes to #84, which merges second.
- S1 is on redact-ssn-phone; S3 on ci-findings-transport. P2 (ci-trivy-version) stays Lane B's.
- Merged today: 14.

### 2026-11-04 22:35 UTC: two production causes found by SUITE-CAP-1b's acceptance run
- **The worker's practice pool** holds 4 connections, but the worker runs up to 15 practice jobs at once. Long jobs hold a connection for their whole run, so later jobs time out waiting and pg-boss retries them; this happens in production whenever more than 4 long jobs overlap.
  - The fix rides #110: the pool sized to the job slots (15), failed attempts logged by code, failing-first tests.
  - Added guards: a synth-time check that the pools never exceed each environment's max_connections, and a DatabaseConnections alarm at 80%.
  - Pre-existing; recorded in ADR 0083.
- **A 2,000-line reconcile** takes 538 to 731 s against the 900 s attempt. It is pre-existing and handed to SUITE-CAP-3 with the profile: byPatient about 403 s; the case refresh 90 to 115 s. The capacity summary's "Known gap" line shows the margin.
- Also handed back to Lane B: test-flakes-6 (threads.test.ts's oom case under a process-wide max-old-space-size).
- S4's next item after #117 and #116: `co-001/pricing-run-cutoff`, a product defect. The run's creation check reads now() as a JS Date (milliseconds) while the price job reads it to the microsecond, so a line created in the same millisecond is missed. It causes false refusals only; the fix keeps the cut-off at full precision.

### 2026-11-04 22:40 UTC: #117 (c7bed0f7) and #116 (35422a92) merged
- #117 (test-flakes-5): the e2e accessibility helper waits for the page's title before axe; the sweep covers 179 calls.
- #116: in dark mode the sign-in frame takes --pw-bg (existing tokens; light unchanged). Its lowest contrast ratio is now 8.39:1, up from 1.02 to 1.97.
  - The UX review's N1 goes to the brand owner (ADR 0056:134): does dark sign-in keep Paper, or take the dark ground as now?
- test-flakes-6 (threads.test.ts's oom case under a process-wide max-old-space-size) is raised: S2 takes it right after #84, since it costs every session's full local run.
- Merged today: 16.

### 2026-11-04 22:50 UTC: brand rulings adopted (`approval-summaries/founder-asks-2026-10-27.md`)
- Sign-in uses Paper in light mode and the dark ground in dark mode (as #116 built). BRAND.md section 4 is amended to match.
- `--pw-unpriced` is darkened to at least 4.5:1 on its tint.
- Dark mode ships only after a dark-mode pass over every screen; then it follows the OS preference, with a settings override.
- Work:
  - **brand-settle** (`co-001/brand-settle`): the ADR 0056 amendment, BRAND.md section 4, and the `--pw-unpriced` darkening with its contrast test. In S4 after pricing-run-cutoff, before the emails; one UX and brand review with shots.
  - **dark-mode-ship** (the full pass, then the OS hook and the setting): queued for Lane B.

### 2026-11-04 23:50 UTC: #84 (packet day counts) merged as 7fb3e102
- Each figure now takes its own role.
- verifierNow runs at request, approval, export and on screens.
- The packets Stryker split now runs every shard, at 98.99%.
- The CI mutation failure on a654224a was #84's own. Its role properties had pushed two recorded equivalents past Stryker's per-mutant clock. Fixed in ec974c60 by reducing those properties' runs: no timeout raised, no equivalent edited.
- For Lane A: the tp-packet-verifier/3 migration (in #84's status file).
- S2 next: test-flakes-6, then packet-figure-placeholders' build.
- Merged on 2026-11-04 in all, 17: #94, #107, #105, #75, #106, #86, #108, #104, #109, #113, #114, #85, #115, #96, #117, #116, #84.

### 2026-11-05 00:00 UTC: test-flakes-6's real fix; a latent memory-safety defect for untrusted PDFs
- test-flakes-6: on Node 24 a worker thread cannot hold its own heap under a process-wide --max-old-space-size (measured). The oom case therefore runs in a child node started without the flag, passing with and without it. Lane A's orchestrator's first suggestion (execArgv/env) was wrong and is withdrawn.
- **Found by its sweep (latent):** contract-page extraction (`packages/contracts/src/evidence/pages.ts`) relies on a worker thread's 192 MiB limit. heap.ts's planned `--max-old-space-size=560` on the worker task would override it, so a hostile PDF could exhaust the 1,024 MiB task.
  - **Decided:** extraction runs in a child process with its own heap flag, with a test of its heap limit under the real command and a synth-time guard.
  - **Order:** heap.ts's flag must not ship before it.
  - Item `co-001/pages-child-process`, in S3 after ci-findings-transport.

### 2026-11-05 01:25 UTC: #119 merged (370b8973); SUITE-CAP-1b's CAS-42.5 passes; RDS classes decided
- #119 (test-flakes-6): the screening pool's oom case runs in a child node without the heap flag.
- #110 (SUITE-CAP-1b) head c2626113: CAS-42.5 passed on attempt 1, run 41940882156. Then come an adversarial review of the round's infra and worker code, the base merge, the body, and the suggested line.
- **Decided:** staging RDS goes to db.t4g.medium (production's class; about +$23 a month). Dev goes to db.t4g.small with stop-first worker deploys in dev only (about +$11 a month when deployed), its heartbeat alarm quiet during deploys. Recorded in ADR 0083. PRD section 19's cost line stays the founder's.
- **For Lane B (SUITE-CAP-3):** `approval-summaries/lane-a-to-lane-b-sc1b-reconcile-time-2026-11-05.md`, with 7b's 2,000-line reconcile at 526 to 657 s of 900, and the profile.

### 2026-11-05 02:00 UTC: pricing-run-cutoff merged as #118 (54d061fd)
- The run-creation cut-off reads now()::text. rerunReasons and runsPricedElsewhere compare in SQL, and rerunReasons fails closed.
- The console's suspension card matches by status_since, read once as text.
- Reviews: payment engine, correctness and delta, with skeptics. No B or S findings.
- Unchanged: packages/pricing, the schema and every amount.
- Leftover WIP refs `co-001/wip-pricing-run-cutoff` and `co-001/wip/pricing-run-cutoff-s4` are now superseded. Deleting them is the person's housekeeping call; until then they stay, never reused.
- S4: brand-settle is running, then the emails.

### 2026-11-05 02:15 UTC: counter allocated
- SEC-24: pages-child-process ("An untrusted document is read in its own process"). SEC-20 to SEC-23 are cognito-confidential-client's (#113).
- Next free: SEC-25, CAS-56, ADR 0091 (0090 is UX PR 8's), synth module 21 (Lane B released 21; none taken since), fixture release 900008.
- #120 (ci-findings-transport) is verified, its base re-merged after #118, CI running. pages-child-process is built (WIP c369bc77) and in its two reviews.

### 2026-11-05 04:05 UTC: #120 (af3e79f3) and #121 (f185655c) merged; SUITE-CAP-1b awaits the founder's line
- #120 (ci-findings-transport): the content calendar's findings travel without exceeding one environment string. Its first run of record read all 16 findings.
- #121 (brand-settle): `--pw-unpriced` is #5F6A79 (4.90:1 on its tint; the test holds 4.8 or more). ADR 0056 is amended with the brand rulings, BRAND.md sections 3, 4 and 7 agree, and ADR 0058 has an "Answered" line. The anomaly chip's sans "$5" is queued for UX PR 4b.
- #110 (SUITE-CAP-1b): the suggested approval line is posted (https://github.com/PureTideWater/PhysicalTherapy/pull/110#discussion_r4476277082; e024cf9f…c4df). CAS-42.5 passes: working set 719.9 of 921.6 MiB, OOM 0, every job on attempt 1.
- S4 next: `co-001/auth-emails` (the branded Cognito code email via CustomMessage; a "password changed" email through #42's transactional stream). SGN-13 to SGN-16; ADR 0091 if needed.
- Next free: ADR 0092, SGN-17, SEC-25, CAS-56.

### 2026-11-05 05:10 UTC: SUITE-CAP-1b merged as #110 (f7d609cc)
- The second schema PR of the chain. It rested on the founder's line 61fc4e6c, `--check --require-approval` exit 0, every check green, and CAS-42.5 and CAS-42.6 passing.
- On the base now:
  - one practice lock key in triage and the ledger triggers, per the founder's Q1 exception;
  - the worker pool sized to its job slots;
  - the connection budget checked at synthesis, with a DatabaseConnections alarm;
  - the release loader's freeze, with both grants;
  - RDS staging at medium and dev at small.
- Next: the interest fix's PR stage (head 650a3108; its own CAS-42.5 passes at full size).
- Merged since 2026-11-05 00:00 UTC: #84, #119, #118, #120, #121, #110.

### 2026-11-05 06:50 UTC: auth emails part 1 merged as #125 (0f4a5ed5); interest open as #126
- #125: every Cognito code email goes through a CustomMessage trigger in brand words (@tp/auth-mail), text-first, with no link in any code email and an anti-phishing footer. The pool's own templates are a branded fallback. Security S-2: an email cannot be changed by its own token holder (keepOriginal; empty writeAttributes). SGN-13 to SGN-15; ADR 0081 amended.
- **Decided:**
  - O-5 (brand): a White plate behind the lockup in every worker email, because forced inversion in mail clients is undetectable. PR `co-001/email-lockup-plate`.
  - O-8 (wording): "If you asked more than once, use the newest code." It is true either way; whether a new request replaces the old code is left to the staging smoke checks.
- **Lane A, schema, queued after #126:** `co-001/password-changed-notice` (ADR 0091, SGN-16). It adds a password_notice table filled by an AFTER INSERT trigger on audit_event, tp_operator claim functions and a password_changed kind on the transactional stream. S4 builds it to verification on its branch; its PR opens when #126 merges, and then it needs the founder's approval line.
- The interest fix is draft #126 (head c49367c5), in four reviews.
- Next free: ADR 0092, SGN-17.

### 2026-11-05 07:40 UTC: redact-ssn-phone merged as #127 (23b25ad0); #128 open
- #127, the founder's ruling of 2026-11-01, is built:
  - a payer letter's SSNs and phone numbers are redacted by pattern ([SSN], [PHONE]);
  - an independent survivor scan refuses a letter in which one survives;
  - PRD 14, ADR 0054, ADR 0070 N6 and reconciliation-001 record the ruling;
  - MOD-15 and MOD-16 are used.
- #128 is open (packet-figure-placeholders slice 1, opened by the orchestrator for S2).
- S1 next: `co-001/packets-verifier-identifier-fold` (MOD-19, MOD-20). The packets verifier's identifierSpans gets the gateway's fold, with a differential property test against the gateway matcher. Then SUITE-CAP-3's worker-side fixes if time allows.
- Merged since 2026-11-05 00:00 UTC: #84, #119, #118, #120, #121, #110, #125, #127.
- Next free: MOD-21, CAS-56, SEC-25, SGN-17, ADR 0092.

### 2026-11-05 07:55 UTC (Lane A's orchestrator): Lane A at 99% weekly; handoff to Lane B written
- Every session on Lane A's account was told to stand down now. Each one: no new workflow; WIP refs pushed; a RESUME-BLOCK in its status file; unsubscribed from its PRs; check-ins cancelled. A verified, green PR may merge first.
- The handoff is `lanes/lane-a-handoff-to-lane-b-2026-11-05.md`. Lane B runs everything from 2026-11-06 19:00 UTC, including the schema chain as acting Lane A, until Lane A's reset (~2026-11-10 14:00 UTC).
- The orchestrator's 2026-11-06 handback trigger is deleted.

### 2026-11-06 19:40 UTC (Lane B's orchestrator): back after the weekly cap; the 2026-11-05 handoff acknowledged
- **Stopped, then back.** The account's 7-day cap stopped this orchestrator from 2026-11-02 ~12:35 to 2026-11-06 19:16 UTC.
  The refresh of the 2026-11-03 handoff (`lane-b-handoff-to-lane-a-2026-11-03.md`) planned for before 2026-11-03 14:00 UTC
  did not happen: build-ops has no commit from 2026-11-02 11:02 to 2026-11-03 14:16 UTC. Lane A found the state live (its
  entry of 2026-11-03 14:20 UTC) and took the chain back at 2026-11-04 02:30 UTC.
- **Acknowledged:** Lane A's handoff `lane-a-handoff-to-lane-b-2026-11-05.md` (14655cc4, 5431c8ad, 1575a7e8). From
  2026-11-06 19:00 UTC Lane B runs everything: its own items, the acting items, and the schema chain as acting Lane A until
  Lane A's reset (~2026-11-10 14:00 UTC). One schema PR at a time; the founder's decisions stay the founder's. Lane B
  allocates the counters until Lane A returns (LANES.md rule 4, the 19:40 UTC sentence).
- **Adopted for Lane B:** the speed rules of 2026-11-04 (`acting-lane-b-2026-11-04.md`), 2a included:
  - CI is the suite of record; the full local suite runs once per PR.
  - The base is merged once, right before the last push; GitHub's up-to-date rule (2a) can ask for one more.
  - Two adversarial reviews with skeptics for the database, money, PHI and the gateway, sign-in, security and CI
    permissions; one for wording, display, test-only and dependency changes.
  - At most two heavy workflows per session, under flock.
  - A gitleaks refusal is fixed by rewriting the flagged text, never by a .gitleaksignore entry (#112).
- **Live heads (checked 19:33 UTC):** `claude/build-platform` cc3dd7f6 (#128); `main` 220f2b4e (unmoved since 2026-10-20);
  `claude/build-ops` 719ab121 before this entry; no tags. 25 PRs merged into build-platform since 2026-11-02 12:35 UTC, all
  as merge commits under the PureTideWater login; nothing into main or build-ops. Open, all into build-platform and behind
  it: #126 (draft, 13 ahead / 67 behind), #129 (draft, 4 / 29), Dependabot #122, #123 and #124 (1 / 29 each).
- **Records:** LANES.md's Lane B claim rows were at their 2026-11-02 states and its counters line at 2026-11-01 20:05 UTC
  (its "next free ADR 0088" was wrong); both are brought to the live state in this commit. HANDOFF.md has no commit since
  2026-11-01; Lane A wrote its 2026-11-03 to 11-05 entries in this file. The co-founder's last recorded instruction is
  2026-11-04 22:50 UTC.
- **Usage:** no weekly figure is recorded for Lane B since its reset. The 5-hour window reads allowed, no overage, resetting
  2026-11-07 00:10 UTC. The figure is asked of the co-founder before any heavy run (rule 9; D below).

#### The 15 sessions
- **Ten items merged.** Each is a merge commit under PureTideWater; "S1" to "S4" are Lane A's acting-Lane-B sessions
  (session_019i9ifCJSbPYXpafL86Rm6J, session_019i9ifAd3jhRt1Vkzz2vUSQ, session_019i9ifDkvaQzK4YgTGnKWC3,
  session_019i9ifAfByN2caCea4jgSdu).

  | Session | Item | Merged (UTC) | By |
  | --- | --- | --- | --- |
  | session_01FcouKMmYaqDNXbqJyagW8u | pr42 (acting Lane A) | #42 22789493, 2026-11-02 07:34 | this session |
  | session_01FcouKN1UjKZTWt4U9bZjyW | ci-images-digest | #86 24531dc2, 2026-11-04 09:20 | S3 |
  | session_01FcouKPAcRv6FTuHCMKAre2 | contract-phi-check | #75 72096e94, 2026-11-04 07:38 | S1 (this session pushed nothing after 11-02) |
  | session_01FcouKQVq7K3Np8pwNtDhew | packet-day-counts | #84 7fb3e102, 2026-11-04 23:53 | S2 |
  | session_01FcouKNxBLBBy2FVM7bfSvj | ux-payer-response | #85 17641c88, 2026-11-04 18:37 | S1 |
  | session_01FcouKPLmdYyBmbVaUjag2c | ux-home-figures | #93 877e662f, 2026-11-02 02:42 | this session |
  | session_01FcouKNxVRK8x6iV52PfxXz | ux-sign-in-time | #92 4eaf7124, 2026-11-02 02:14 | this session |
  | session_01FcouKQ3BjYKaME5uBLn8Lz | ci-findings-transport | #120 af3e79f3, 2026-11-05 02:23 | S3 |
  | session_01FcouKRD17iBBR4HhnYcQQx | dependabot-batch | A #90 88708069 (11-02 03:59) and C #91 21fa10df (11-02 10:22); B #94 4846f043 (11-04 02:51) and D #105 df4daff7 (11-04 06:26) | this session (A, C); S4 (B, D) |
  | session_01FcouKP1U2GGDFhhZT9CaUV | redact-ssn-phone | #127 23b25ad0, 2026-11-05 07:35 | S1 |

  Also merged in the window for kept sessions: P4 #96 (30871f72, 11-04 21:04, S3); SS-01 #104 (e084da22, 11-04 13:04) and
  SUITE-CAP-1b #110 (f7d609cc, 11-05 05:04), both by Lane A's schema-chain session_019i9ifEG147aKfNHEAsoS7h.
- **Archived at this entry (9):** pr42, ci-images-digest, contract-phi-check, packet-day-counts, ux-payer-response,
  ux-home-figures, ux-sign-in-time, ci-findings-transport, dependabot-batch (its cleanup list copied below first).
- **Kept (6):**
  - ci-pin-age (session_01FcouKNP2XtaombFLueKLnu): the P2 re-design, wave 2.
  - ux-screening-result-tables (session_01FcouKRDfoFAeXZK4Thp8M8): UX PR 4b, wave 2.
  - unmapped-plan (session_01FcouKNB2TyuPCAha9BaEjQ): #48, wave 3.
  - redact-ssn-phone (session_01FcouKP1U2GGDFhhZT9CaUV): MOD-16's follow-up `co-001/redact-range-glued`, wave 1.
  - suite-cap-3 (session_01FcouKP4ekrT97eyDtLe4Rd): the design review, wave 1.
  - schema-chain (session_01FcouKQthXdmDnPmwhFepxW): #126 as acting Lane A, wave 1. It never re-runs the SS-01 or 1b
    stages and never pushes its old interest head 74a6b290.
- **Each item's true state and holder** is in its LANES.md claim row (19:40 UTC sentences). New claim rows:
  `co-001/redact-range-glued`; pages-child-process (session_01FcouKQJppM8BdCui7NVQUa) and #129 email-lockup-plate
  (session_01FcouKRo5iee5QFtPT8UimZ), new Lane B sessions started 19:29 UTC; packet-figure-placeholders (no row until
  now; slice 2 in session_01FcouKPkXdRW5ntz6ye92pL, started 19:37 UTC).

#### Cleanup list (leftover refs; prune later, never force-delete a ref someone uses)
- `co-001/ux-home-figures` d1e4c4c4 (#93's head, in the base); `co-001/wip-ux-home-figures` 27a848c1;
  `co-001/wip-ux-home-figures-2` b29b1a31.
- `co-001/wip-packet-day-counts-2` to `-5` (2eab51ef, #84's head, in the base; 9554cdc7; 081a8034; 15d8ed1c), and the
  unsuffixed `co-001/wip-packet-day-counts` acfd8980.
- `co-001/wip-dependabot-batch-a` 442d7a81, `-b` f463f486, `-c` b1fd5df1 (all in the base). The dependabot session's local
  worktrees (`/home/user/deps-aws-cdk-minor-patch`, `/home/user/test-flakes-2`) live only in its container.
- `co-001/wip-contract-phi-check` and `-1` to `-9` (`-9` 315ac91e in the base).
- The schema chain's `co-001/wip-ss01-chain` 79315a09 (in the base), `co-001/wip-interest-chain` d39b72c0 (in 23369ae6) and
  `co-001/wip-interest-w` 589e31d5 (a 2026-11-02 stash of slice 4's screens, in no later head), superseded.
- Never prune `co-001/wip-interest-fix` 23369ae6 (#126's live start), `co-001/wip-pages-child-process`,
  `co-001/wip/email-lockup-plate-s4` or `co-001/wip-suite-cap-3` while their items run. Lane A's own list (handoff §5:
  `co-001/cognito-confidential-client`, never to be merged; `co-001/wip-pricing-run-cutoff`; `co-001/wip/pricing-run-cutoff-s4`)
  stays the person's call.

#### Waves (handoff §8's pace: about five sessions, at most two heavy workflows each)
- **Wave 1, now:**
  - MOD-16 (session_01FcouKP1U2GGDFhhZT9CaUV, `co-001/redact-range-glued`): two reviews (PHI, the gateway).
  - #126 (session_01FcouKQthXdmDnPmwhFepxW, acting Lane A), from 23369ae6 by its RESUME-BLOCK (6dc6858a); the steps are
    in its claim row.
  - pages-child-process (new session, two reviews).
  - #129 (new session; sign-in emails, so two reviews; it carries O-5 and O-8).
  - SUITE-CAP-3's design review (session_01FcouKP4ekrT97eyDtLe4Rd, light; no build).
- **Wave 2, as slots free:**
  - UX PR 4b (session_01FcouKRDfoFAeXZK4Thp8M8), with #121's P1.
  - packet-figure-placeholders slice 2 (ADR 0089, a fresh session from the RESUME-BLOCK in
    `lane-b-packet-figure-placeholders-status.md`; started early, at 19:40 UTC, in session_01FcouKPkXdRW5ntz6ye92pL),
    then verifier-identifier-fold (MOD-19, MOD-20). They and #84's /3 migration all touch the packet verifier: one at a
    time.
  - Dependabot triage of #122 to #124 (a fresh session; one replacement PR like #94, checked against #94;
    `pnpm actions:check` and `pnpm toolchain:check`).
  - After #126 merges: password-changed-notice (ADR 0091, SGN-16), then the rest of the schema queue (handoff §4) in order:
    #84's /3 migration, #85's §7.2 items, #93's F9, the Cognito subject relink, the rest of "Handed to Lane A".
  - The P2 re-design (session_01FcouKNP2XtaombFLueKLnu).
- **Wave 3:** dark-mode-ship (after 4b, as a pass over every screen), ux-forms-after-42, UX PR 8, #46, #48
  (session_01FcouKNB2TyuPCAha9BaEjQ, after slice 2), P5 ci-catalog.
- **Hand to Lane A:** nothing now (Lane A is out). At about 2026-11-10 14:00 UTC, what remains of the schema queue goes back
  through a handback entry here.
- **Before Lane B's own weekly limit** (the week resets about 2026-11-13 19:00 UTC): a handback like Lane A's.

#### (D) Pending with the founder and the co-founder
- **The co-founder:**
  - Lane B's weekly usage % and reset time (rule 9); none is recorded since the reset.
  - Confirm that the 2026-11-02 pacing call ("no second wave") is finished for this week, so the handoff's plan goes
    ahead; the three sessions that woke cite it.
  - Confirm extra usage stays off.
- **The founder:**
  1. The approval of record on #126, and on every later schema PR.
  2. The freeze exception for SUITE-CAP-3's `ledger_line_net` rewrite (not yet asked; its draft comes from the design
     review).
  3. Cognito PR 2: staging, ruling 16, and the credentialed steps F1 to F5.
  4. F0, from the #112 .gitleaksignore incident (a staging sign-in with a synthetic account before release N reaches
     production).
  5. PRD section 19's cost line for the RDS classes (staging db.t4g.medium about +$23 a month, dev db.t4g.small about +$11).
  6. #42's launch actions: AWS, DNS, SES, counsel O4, consumer size O9.
  7. Issues: #102 is still open, though its cause was fixed on 2026-11-04 when the repository went public again; #73 and
     #111 (release capacity) are open, and Lane B checks #73 on cc3dd7f6.
  8. For awareness, the orchestrators' calls on founder ground: O-8 (raised for the co-founder); UX PR 7's S-3 and wording
     departures D-1 to D-4; Cognito rulings 13 to 15; the CAS-42.5 working-set judgement; the placeholder rule; the
     child-process rule.
  9. Release tags are the founder's; there are none.

### 2026-11-06 21:30 UTC (Lane B's orchestrator): the co-founder's plan for the week; PHI findings
- **The plan of record for 2026-11-06 to 2026-11-10** is the co-founder's handoff prompt (19:30 UTC; it reached this
  session at 19:35 UTC). Where it differs from the 19:40 UTC waves above, it wins. About five sessions at once, at most
  two heavy workflows each:
  - **S1**, session_01FcouKP1U2GGDFhhZT9CaUV: `co-001/redact-range-glued` (MOD-16), then
    `co-001/redact-ssn-phone-leaks` (MOD-21, MOD-22; added at 21:04 UTC, PHI first), then the packets verifier
    identifier fold (MOD-19, MOD-20).
  - **S2**, session_01FcouKQthXdmDnPmwhFepxW, acting Lane A: #126, then password-changed-notice (ADR 0091, SGN-16), then
    the 11-05 handoff's §4 queue. One schema PR open at a time, and each suggested line's link goes to the co-founder at
    once.
  - **S3**, session_01FcouKQJppM8BdCui7NVQUa: pages-child-process (SEC-24). Its second item, #129, already runs in
    parallel in session_01FcouKRo5iee5QFtPT8UimZ (started 19:29 UTC, before the plan), so S3 finishes sooner. Once
    pages-child-process merges, S3 takes its next item from S5's list.
  - **S4**, session_01FcouKPkXdRW5ntz6ye92pL: packet-figure-placeholders slice 2 (ADR 0089, CAS-52 to CAS-54).
  - **S5**, session_01FcouKRDfoFAeXZK4Thp8M8, in this order:
    1. UX PR 4b, with #121's P1;
    2. ux-forms-after-42;
    3. SUITE-CAP-3's worker-side fixes only (no `ledger_line_net` rewrite without a founder exception);
    4. P2;
    5. P5;
    6. UX PR 8;
    7. dark-mode-ship.

    It starts when #129 merges.
  - **The other kept sessions:**
    - SUITE-CAP-3's design review finishes in session_01FcouKP4ekrT97eyDtLe4Rd. It was told at 19:50 UTC that the build
      covers the worker-side fixes only, and that the `ledger_line_net` part goes into the freeze-exception ask.
    - P2's 19:40 UTC slot in session_01FcouKNP2XtaombFLueKLnu is superseded by S5's queue. That session stays kept and
      idle, as does #48's (session_01FcouKNB2TyuPCAha9BaEjQ, wave 3).
    - Dependabot #122 to #124 stay open and untriaged.
- **New sessions** are created with `source_url` https://github.com/PureTideWater/PhysicalTherapy and `source_revision`
  `claude/build-platform`. Each gets an `append_system_prompt` that authorizes it to:
  - push `co-001/*` branches and `claude/build-ops`;
  - open and update its own draft PRs, and comment on and subscribe to them;
  - merge verified, green PRs as LANES.md allows.

  So none waits on a relayed go-ahead. S4 (19:37 UTC) is the first. If one still waits, the co-founder types "go" in it.
- **Decisions:** the orchestrator decides as an expert software architect, takes the most optimized option (for security,
  the safer one) and records why.
- **Founder-only.** These go to the co-founder with the exact text or link:
  - approving `docs/product/domain-model.md` by committing the suggested approval line;
  - release tags;
  - owner-admin settings;
  - legal text;
  - freeze exceptions;
  - reversing a founder ruling.
- **Never:**
  - sign or approve as the founder, or write the approval line or approvers.json;
  - approve or request changes on a PR;
  - merge a schema PR before the founder commits its line;
  - open a PR into main, or create a release tag;
  - use --no-verify, force-push, or touch .gitleaksignore (a gitleaks refusal is fixed by rewriting the flagged text);
  - write files through the GitHub connector;
  - put PHI or a model identifier in any artifact.
- **Stand-down at 2026-11-10 09:00 UTC** (a scheduled reminder). That is before Lane A's reset (~14:00 UTC); it comes
  sooner if this account nears its limit. Every session:
  - pushes its WIP refs;
  - writes its RESUME-BLOCK;
  - unsubscribes from every PR;
  - cancels its check-ins.

  Then the handoff back is finalized.
- **Rolling handoff:** `lanes/lane-b-handoff-to-lane-a-2026-11-10.md` is started in this commit. Every records commit keeps
  it current, so a handoff exists whenever Lane B stops. The reason: the 7-day cap stopped this orchestrator too
  (2026-11-02 12:35 to 2026-11-06 19:16 UTC), and the planned refresh of the 11-03 handoff never happened.

#### Two PHI findings (S1, on the base cc3dd7f6: gaps in #127's SSN and phone patterns)
1. **An SSN or phone number glued digit to digit to an amount or a range reaches the model unredacted.** The survivor scan
   does not refuse the letter either. S1's MOD-16 sweep found it at 20:20 UTC. Synthetic examples:
   `900 12 3456150.00-01/02/2020`, and `SSN 900123456120.00-...`. A space in place of the dash leaks the same way.
2. **A masked SSN glued after digits or a word is sent too** (for example `...2020XXX-XX-3456`).
- **Cause and exposure:** the range fix did not cause these. They have been on the base since #127 merged
  (2026-11-05). Nothing is live before launch, so no real letter is exposed.
- **The hunt:** a read-only workflow, wf_8da6dd19-398, maps the whole class at cc3dd7f6 from five angles:
  - digit-glued;
  - letter-, placeholder- and mask-glued;
  - character evasions;
  - barrier interplay;
  - structure and the other model paths.

  It loops until two dry rounds, then a completeness critic. Round 1 reported **52 candidate classes**: digit-glued 13,
  letter- or mask-glued 13, barriers 10, characters 16.
- **The hunt's skeptics** are batched per angle: 3 lenses by 5 angles a round, not 3 per leak. This machine runs two
  agents at a time, so 156 single-leak skeptics would take many hours.
- **What the hunt produces:** its synthesis is the leaks PR's design input. It separates pattern gaps (to fix) from
  obfuscation beyond pattern reach (to fix, or a documented residual for the co-founder).
- **Decision (S1's, agreed 21:03 UTC):** the fixes are their own PR, `co-001/redact-ssn-phone-leaks`, after
  `co-001/redact-range-glued` and before the verifier fold. The range-glued PR fixes a CI flake that can turn any PR's
  unit job red at random, so it should not wait on a much larger PHI change. Its PHI review still checks that the range
  barrier widens no leak.
- **Counters:** MOD-21 and MOD-22 were allocated to the leaks PR at 21:04 UTC; the next free is MOD-23.
- **How the leaks PR is built:** two reviews (PHI and security; gateway correctness) with skeptics. Where a number's
  boundary is unknowable, the letter is refused, never guessed.
- Its claim row is added in this commit.

#### Other state at 21:30 UTC
- **#129's full local suite is green** on 31c41a9d (cc3dd7f6 merged once):
  - unit 9,929;
  - db 9,863;
  - e2e 81 of 81;
  - also infra 793, golden 381, oracle 689, and the brand baselines byte for byte.

  Fix round 2 (wf_5ac1f379-e54: D1, D2) runs on WIP 0234d5fe. Then the push, CI, the verification and the merge.
- **Live heads,** checked 21:32 UTC with `git ls-remote` and the GitHub API (read-only):
  - `claude/build-platform` cc3dd7f6: nothing has merged since #128 (2026-11-05 08:19 UTC);
  - `main` 220f2b4e;
  - `claude/build-ops` 796b8cec before this commit;
  - no tags;
  - open: #126 (draft, c49367c5), #129 (draft, 231da9c4), and Dependabot #122, #123 and #124.
- **LANES.md in this commit:**
  - S4's claim row (slice 2, added at 19:40 UTC) is checked.
  - New rows: redact-ssn-phone-leaks, the packets verifier identifier fold, password-changed-notice and dark-mode-ship.
  - Every S1 to S5 row gets its 21:30 UTC sentence.
  - The counters line now reads next free MOD-23.
  - A note at the top of "Claims" records the plan of record.
- **Schema queue note** (under "Handed to Lane A", on the /3 migration): slice 3's `VERIFIER_FORMAT` flip must ship with
  or after slice 4's export render. This is S4's finding: the flip stores token templates, and the export prints them only
  once slice 4 renders them.

#### The ultracode flag
- **The audit:** at 19:50 UTC the live session records showed the flag on for this orchestrator and for S5's and P2's
  sessions only, which are the sessions the co-founder typed in. The six working sessions (S1, S2, SUITE-CAP-3, S3, #129,
  S4) showed it absent.
- **A relayed message does not set it.** This orchestrator sent "ultracode." to the six at 19:50 UTC (priority next), and
  at the 19:54 UTC re-check the flag was still absent. Only a typed message turns it on.
- **The co-founder was asked** to type "ultracode" in the six working sessions.
- **Meanwhile** each runs every substantive stage as a Workflow with adversarial checks, as the brief requires.

#### Build completion, re-estimated (the co-founder asked at 20:59 UTC)
- **About 19% at the end of 2026-11-06 (range 13 to 23%), up from about 17% on 11-01.** Same method as 11-01, one
  estimator and one skeptic.
  - 32 PRs merged from 11-01 to 11-05 add about 3 points: #42, five UX PRs, two schema-chain PRs and 14 unplanned fixes.
  - About 536 hours of newly found scope take about 1 point back: packet placeholders, Cognito, the privacy leaks, hostile
    PDFs and dark mode.
  - Nothing had merged in the 37 hours before the estimate, because both accounts were capped.
- **Launch-ready: about 15%.** None of the 28 people-only items is done. They include release content, the 157 golden
  lines to verify, counsel, AWS under the BAA, Stripe and SOC 2.
- **Left, largest first:**
  - the audit fixes, about 4,300 to 6,900 hours, with 13 critical items open;
  - about 40 schema PRs, each needing the founder's approval;
  - 82 of the 91 UX review PRs;
  - milestones 12 and 13, and the final pass.
- **The limits on pace** are the usage caps and the founder's approval turnaround, not the number of sessions.

#### Pending with the co-founder and the founder
- **The co-founder:**
  - type "ultracode" in the six working sessions;
  - Lane B's weekly usage % and reset time (rule 9);
  - #126's suggested-line link, relayed when S2 posts it.
- **The founder:**
  - #126's approval of record;
  - SUITE-CAP-3's freeze exception for the `ledger_line_net` rewrite (the ask is being drafted, not yet asked);
  - the rest as in (D) of 19:40 UTC, and the rolling handoff's section 5.

### 2026-11-06 22:45 UTC (Lane B's orchestrator): the founder's freeze exception; D14; schema batching
- **The founder's freeze exception, granted.** Relayed by the co-founder at ~22:40 UTC: "Yes to freeze exception from
  Tyler."
  - **What it covers:** new bodies of `ledger_line_net` and `ledger_entry_rules`, exactly as written in
    `approval-summaries/lane-b-suite-cap-3-freeze-exception-ask.md`, in one migration after #126. Nothing else changes:
    no table, column, index, trigger, amount, stage or rule.
  - **What proves it:** every amount, stage, refusal and recovered total stays unchanged, shown by LED-01 to LED-18,
    LED-23 to LED-25, the ledger oracle, the refusal tests and the write-equality dumps.
  - **Where it is recorded:** `approval-summaries/founder-asks-2026-10-27.md`, "Decided 2026-11-06"; LANES.md "Handed to
    Lane A", 22:45 UTC.
- **The co-founder's standing instruction, same time:** "Don't ask for approvals anymore just make the most optimized
  decision."
  - From now on the orchestrator and the sessions decide without asking. Each takes the most optimized option under the
    founder's standing rule (for security and privacy, the safer one) and records who decided, when and why.
  - **These stay the founder's (CLAUDE.md; the delegation of 2026-10-25):**
    - the approval of record (committing the suggested approval line);
    - release tags;
    - the owner-admin settings;
    - legal text;
    - reversing or lifting a founder ruling. A new freeze exception lifts a freeze the founder ruled, so it is still
      relayed with its exact text.
- **The schema queue,** one schema PR at a time, each with the founder's committed line:
  0. #126;
  1. password-changed-notice;
  2. the ledger-function migration (granted; Lane A measures again on #126's base);
  3. then the rest of the 11-05 handoff's §4.
- **Schema batching.** To cut the founder's approval cycles, S2 batches related schema items into fewer PRs. It is still
  one schema PR open at a time, each with the founder's committed line. A batch never widens a grant and keeps the /3
  migration's ordering (with or after slice 4's export render).
- **D14, ruled 22:31 UTC:** the weekly run's step 7b stays on practice F, raised to 10,000 lines, until the
  ledger-function migration merges. Then it moves back to practice A's month, as SUITE-CAP-1b's hand-off asked;
  SUITE-CAP-3's PR amends ADR 0083 with this condition.
  - **Why:** A's month measures 1,653 s against the 900 s attempt today, and 310 s with both new bodies.
- **SUITE-CAP-3's measurement** (wf_9dd7a743-340, on cc3dd7f6; step 7b at 2,000 lines):
  - practice F: 620 s on the base, 21.5 s with the worker fix;
  - spread R: 159 s to 46 s;
  - the writes are identical row for row in every pair.

  The review loop wf_d171f0f0-948 is running (payment-engine and security lenses, skeptics, a completeness critic). The
  build (worker-side fixes only) is S5's third item.
- **#129 and #130,** checked live at 22:37 UTC (REST, read-only):
  - **#129** (email lockup plate), draft at 34927fd0: ci, mutation, screening-capacity and approval-of-record are all
    green. Next: the fresh-clone verification that reads CI, ready, and the merge.
  - **#130** (pages-child-process, SEC-24), draft at 43a81626: every check green at 22:36 UTC. Next: the verification,
    ready, and the merge.
  - `claude/build-platform` is still cc3dd7f6. #126 is draft at c49367c5, behind the base, red on three checks: the
    domain model (the blank approval line), e2e 1/2 (INT-REL-1, fixed on the WIP ref) and the "all green" roll-up.
- **S1 to S5,** from their status files:
  - **S1** (MOD-16, WIP e0cf46e0): round 1's PHI review was lost, and its notes showed regressions against the base. The
    workflow was stopped and resumed with a base-against-head differential PHI review. The PR merges only with zero
    regressions against the base (build-ops 22378989).
  - **S2:** #126 as at 21:30 UTC; then password-changed-notice, then the ledger-function migration.
  - **S3:** #130, above.
  - **S4** (slice 2): wf_445df00c-8d3 done; 9 findings confirmed, two blocking (MONEY-A-1, MONEY-B-1). Round 2 runs
    (wf_db15c2a6-888; build-ops 9a625442).
  - **S5:** waits for #129 to merge.

### 2026-11-07 00:35 UTC (Lane B's orchestrator): #130 merged; S5 and S3 started
Heads checked live at 00:33 UTC (`git ls-remote origin`; REST, read-only); status files read to 00:36 UTC.

- **The account's 5-hour limit stopped every session's workflows** between ~22:58 and 00:10 UTC (its reset). The
  machines restarted; each session re-ran its setup (PostgreSQL restarted) and resumed its workflow in the same run at
  00:35 UTC. What each lost is in its row below.
  - **Why so soon:** S1 ran two heavy workflows at once (the build and the leak hunt), which used the 5-hour window in
    ~4.7 h. S1 now holds the hunt until its build ends.
- **#130 merged** (pages-child-process, SEC-24): 2026-11-06 22:55 UTC as **31a7345f**, from 43a81626, by S3
  (session_01FcouKQJppM8BdCui7NVQUa).
  - CI on 43a81626: 38 check runs green.
  - The fresh-clone verification wf_1edda650-2ad passed. Its hostile-input probe, run under the parent's
    `--max-old-space-size=560`, refused all five inputs within bounds, with no reader left and no core.
  - `claude/build-platform` is now 31a7345f, the first base move since cc3dd7f6. Its push runs are green (ci
    42308243590, mutation 42308243735, screening-capacity 42308243690); the item is closed.
  - **`infra/lib/heap.ts`'s `--max-old-space-size=560` is unblocked:** the worker task's flag may now ship.
  - S3's proposals (status file; not in #130): a step in ci.yml's images job that reads one synthetic PDF through
    `dist/page-reader.js` in the built worker image; the core-crash test run in CI. The open risk stays: the child can
    open network connections, to revisit with Node 26 LTS.
- **S5 started UX PR 4b** (session_01FcouKRDfoFAeXZK4Thp8M8; GO at 22:57 UTC, when #130 freed the slot).
  - `co-001/ux-screening-result-words` is cut at 31a7345f, not on origin yet. Status
    `approval-summaries/lane-b-ux-screening-result-words-status.md`.
  - Scope: design §11 with #121's P1; TBL-08 reworded, no new number; no migration; Lane A's three §12.1 conditions.
  - The build workflow wf_efec3b83-f5b started at 00:35 UTC: a scout re-pins §11 against the tree, a completeness
    critic, the builder, the fast checks and the screening e2e specs.
  - Next: the push and the draft PR; one review (UX and brand, with shots and skeptics); the full suite once; the merge
    under rule 2a.
- **S3 took ux-forms-after-42** from S5's queue (assigned 22:57 UTC, claimed 23:00 UTC), so the LANES.md row names S3,
  session_01FcouKQJppM8BdCui7NVQUa, not S5.
  - Status `approval-summaries/lane-b-ux-forms-after-42-status.md`. Cut locally at 31a7345f; nothing pushed yet.
  - The design refresh of 7.8 against the base (wf_8ed4a036-bce: one reviewer and a critic) was stopped at its start by
    the 5-hour limit and resumed at 00:35 UTC. Then the build, the shots, the draft PR, the UX and brand review, the
    fix round with the full suite once, the push, CI, the verification, the merge.
  - S5's order is otherwise unchanged: 4b, SUITE-CAP-3's worker-side fixes, P2, P5, UX PR 8, dark-mode-ship.
- **The other rows:**
  - **S1** (`co-001/redact-range-glued`; session_01FcouKP1U2GGDFhhZT9CaUV): WIP 6fc88092.
    - The re-run PHI review (a 350,000-letter seeded base-against-head differential) found no SSN, phone or DOB digit
      that the base redacts sent at e0cf46e0. PHI1-1 is recorded and pinned, with no code change.
    - The re-review's fixes are in: 9ecbe6c9 (GATEWAY1-1) and 6fc88092 (ADR 0054 and the tests pin what the range
      barrier sends: PHI1-1 to PHI1-3, GATEWAY1-2, GATEWAY1-4).
    - The 5-hour stop lost round 2's reviews, the final fixer, the suite and the critic; wf_bca3d2b3-77c resumed.
    - The branch is still cc3dd7f6; no PR. It merges only with zero base-against-head regressions.
    - Then the follow-on, `co-001/redact-ssn-phone-leaks` (MOD-21, MOD-22; not cut). Its hunt lost its round-2 skeptics,
      rounds 3 and 4 and its synthesis to the stop, and is held until this build ends.
  - **S2** (#126; session_01FcouKQthXdmDnPmwhFepxW): pushed at d2fdd106 (~22:48 UTC) after cc3dd7f6 was merged once and
    the full local suite ran once (the mutation gate's two survivors at `interest.ts:353` killed by d2fdd106).
    - **The second review round is not done:** its two reviewers were cut off by the 5-hour limit (~23:55 UTC) without
      returning. wf_29adffb1-b27 redoes it (loop until dry, a completeness critic), then CAS-42.5 on the final head, the
      re-shots, the description and the verification. S2 is near the last push.
    - CI on d2fdd106: e2e green (INT-REL-1 fixed); red on the domain model (the blank approval line, as expected) and on
      `unit`, cancelled at its 20-minute timeout. Behind 31a7345f, merged once right before the merge.
    - The batching plan: the read-only wf_255f9403-721 (5 of 7 scouts done before the stop) resumed beside it.
  - **S4** (slice 2; session_01FcouKPkXdRW5ntz6ye92pL): round 1's nine findings fixed in d21f4577 (new code
    `fact_not_separated`). Round 2, wf_db15c2a6-888, was stopped at 22:58 UTC after the carry-over verdicts and the
    equivalent's review: the `template.ts` equivalent is signed in d96a053a (WIP); NEW-1 is fixed (fails closed); NEW-2
    is an accepted reading in ADR 0089. Resumed at 00:35 UTC: the loop-until-dry rounds and the critic. No PR.
  - **SUITE-CAP-3** (session_01FcouKP4ekrT97eyDtLe4Rd): the review loop wf_d171f0f0-948 finished round 1: 15 findings,
    9 upheld by the skeptics; both lenses gave BUILD WITH CHANGES, nothing blocking.
    - The surviving findings are applied to the design (f795bf28, §18): code changes go into slices 2 and 3, tests into
      CAS-49.1, CAS-49.6 and CAS-50.
    - The freeze-exception ask gained the 360 s wording and two proof items (a cross-practice test; a plan test). The
      two granted bodies are unchanged, so the founder's grant stands as given.
    - Round 2's reviewers and the critic were stopped by the 5-hour limit; resumed at 00:35 UTC.
  - **#129** (email lockup plate; session_01FcouKRo5iee5QFtPT8UimZ): CI was all green on 34927fd0. The base moved to
    31a7345f, which shares `test-matrix.md` and the synth registry, so wf_464a574d-f04 merged it once: f4fef908, no
    conflicts, every check it ran passed. The 5-hour limit stopped it after the merge commit; it resumed and pushed
    f4fef908 (~00:40 UTC). Next: CI on f4fef908, the fresh-clone verification, ready, the merge.
- **For Lane A's slice-3 migration (S4's note, 22:36 UTC; ADR 0089):**
  - /3 reports carry six new codes: `free_figure`, `number_word`, `unknown_fact`, `fact_not_canonical`,
    `fact_contradicted` and `fact_not_separated`.
  - All six are of kind `'fact'`.
  - The mismatch key `canonical` appears on `fact_not_canonical` only.
  - Recorded in the rolling handoff (§4, item 3) and in the slice's LANES.md row.
- **The co-founder's question, 22:40 UTC:** "How can we speed this development up". The answer given, in order:
  1. **Raise the usage ceiling first:** the organization's extra usage (or a higher limit). The weekly cap has been the
     largest single stop: it stopped this orchestrator from 2026-11-02 to 2026-11-06, and stood Lane A down at 99% on
     2026-11-05.
  2. **Same-day founder approval lines:** each schema PR waits on the founder's committed line, so committing it the
     day it is posted keeps the one-at-a-time chain moving.
  3. **The GitHub organization on the Team plan:** a merge queue (in place of each PR merging the base again by hand
     under the up-to-date rule), larger runners, and a private repository (it stays public until then).
  4. **Start the people-only launch work now:** what no session can do (the founder's launch and staging items in the
     rolling handoff's §5).
  5. **Already in place:** schema batching, the speed rules (`lanes/acting-lane-b-2026-11-04.md`), the rolling handoff,
     and about five sessions in parallel.

### 2026-11-07 03:35 UTC (Lane B's orchestrator): schema batching plan; rulings; the reviewer lesson
Heads checked live at 03:36 UTC (`git ls-remote origin`; no tags); status files read to 03:36 UTC; the orchestrator's
notes from 00:32 UTC.

- **The reviewer lesson (broadcast to every session at 01:33 UTC).**
  - **Custom reviewer agent types never return in workflows.** #126's second review round lost every reviewer of a
    custom type (payment-engine-reviewer, security-reviewer, ux-brand-reviewer) three rounds running (wf_29adffb1-b27):
    each ended without returning its result.
  - **The rule:** every review agent in a workflow is a default agent that reads `.claude/agents/<type>.md` and applies
    that checklist.
  - **Never count an empty review as passed.** A round whose reviewers returned nothing is not a dry round; it is re-run.
    (The same shape as the leak hunt's false "two dry rounds" of 2026-11-07 00:35 UTC: failed hunters returned nothing.)
  - Applied since: #126's round redone as wf_a71650bd-ea2; 4b's review step switched to a default agent and wf_5e44d8cf-109
    resumed; SUITE-CAP-3's review rounds ran as default agents with three skeptics each; #129 checked (wf_5ac1f379-e54's
    three ux-brand-reviewer rounds each returned a real result with shots).
  - Added to `lanes/lane-b-session-brief.md` §5 and the rolling handoff §7.
- **#131 merged (UX PR 4b, the screening result's words and tones):** 2026-11-07 03:27 UTC as **8a722f80**, from 9e577017,
  by S5 (session_01FcouKRDfoFAeXZK4Thp8M8). `claude/build-platform` is 8a722f80.
  - **The 4b ruling (01:31 UTC, acting Lane A):** the re-pin under `screening-labels/2026-11-05` also takes P5's four
    figure labels ("Medicare figure, ..."). Conditions: 0 tags at the merge; the UX review covers every occurrence; the
    ruling recorded in #131 and the status file. All three met: the `labels.test.ts` VERSIONS comment names all seven
    changed strings; 0 tags right before the merge; the verifier's grep found no leftover.
  - The path: draft #131 at c2725961 (01:40 UTC); CI fix 03ec41f5 (`tools/brand-colors` read "#121" as a hex colour);
    `unit` on 03ec41f5 failed on MOD-16, seed 383403599 (job 128259888791; the base's flake, forwarded to S1); the UX and
    brand review passed with fixes (4B-UX-02, 4B-UX-03); the full local suite once; the fix round pushed at 9e577017.
  - CI on 9e577017: 22 runs green (unit 9,952; db 9,864; e2e 81). Fresh-clone verification wf_a6153b93-653: PASS. One nit
    not taken: `lib/screening/routes.ts:836`'s doc comment "Expected less allowed", for the next change to that file.
  - S5 next: P2, P5, UX PR 8, dark-mode-ship. SUITE-CAP-3's build runs in its own session (below), so it leaves S5's list.
- **The schema batching plan** (acting Lane A, S2; read-only wf_255f9403-721; three rounds of a critic and a risk skeptic):
  `approval-summaries/lane-a-schema-queue-plan-2026-11-07.md`. **10 schema PRs for about 22 queued items**, about 18 founder
  approval cycles if each shipped alone. One schema PR open at a time, as before.
  1. password-changed-notice (ADR 0091, SGN-16); D11's REVOKE only on the founder's deploy fact.
  2. The granted SUITE-CAP-3 bodies, alone (an exact grant is never widened).
  3. `tp-packet-verifier/3` (slice 3) with #38's stored words version and `words_changed`.
  4. #85's design §7.2, items 1 to 5 (+ F4 if designed in time).
  5. The ledger-freeze batch: #93's F9 plus the other ledger items, under one combined founder ask.
  6. Identity: the Cognito relink, ADR 0081 A6 (moved from PR 1), SEC-N5 (conditional).
  7. SS-01 D15's suspension mail with Q13, and #32's notice.
  8. PHI identifier lookups: #120's F3 with `provider_adjustment.reference`.
  9. Triage's stored waiting patterns.
  10. Release-content health (`operator_content_coverage()`).
  - **PR 1 is building** in S2 since 02:20 UTC (wf_5cf101cd-7ab): `co-001/password-changed-notice` (origin 7b38c9c5)
    stacked on #126, migration 20261111090000; no PR until #126 merges. D11 and A6 do not ride.
- **The orchestrator's rulings on the plan (02:20 UTC; the co-founder: decide without asking):**
  - (a) Skip-ahead: yes. When the next PR's gate is unmet, the next ready one opens; each skip recorded.
  - (b) Both queued (the safer option): SEC-N5 in PR 6, conditional on staging evidence of Cognito's `auth_time`;
    `provider_adjustment.reference` (PHI under ADR 0027, stored in plain text) in PR 8 with #120's F3. Both recorded in
    LANES.md "Handed to Lane A", 2026-11-07 03:35 UTC, from S2's 02:25 UTC entry.
  - (c) PR 5's combined freeze ask written now and relayed to the founder early (no ask file on build-ops yet at 03:36 UTC).
  - (d) D11's deploy fact is the founder's statement (below).
  - (e) #38 §2.2's heading governs only the stored worksheet; the words version is not founder-gated and stays in PR 3.
- **The D11 deploy fact, asked of the founder through the co-founder:** does every environment run an image that contains
  #104 (SS-01), so that any rollback lands on an image that contains #104? GitHub shows no deployments or tags. Until it is
  stated, D11's REVOKE does not ride PR 1; it rides the first non-ledger carrier after the fact (never PR 2 or PR 5), with
  its rollback floor (never roll back past #104). **Pending.**
- **SUITE-CAP-3** (session_01FcouKP4ekrT97eyDtLe4Rd):
  - **Design reviewed** (b27a9861): seven rounds of default agents (payment-engine and security checklists), three skeptics
    per finding: 46 findings, 31 applied, 15 refuted; two completeness checks and a final consistency check. Verdict BUILD.
  - **Corrections to the granted ask's text (38123394), the two bodies unchanged:** (1) the 360 s is a sizing bound only;
    no release check enforces it. (2) A's month was compared on totals (counts and cents), not row for row; row for row
    holds at F 10,000 and R 2,000. The grant's scope is the two bodies, which are byte-identical to the granted text, so
    **the grant stands**. The founder was informed through the co-founder.
  - **D14** (ruled 2026-11-06 22:31 UTC) is now in design §0, D9, D14, 8.4 and 14.1. The build keeps step 7b on practice F
    at 10,000 lines. The plan keeps D14's move out of PR 2: a no-migration follow-up after PR 2 and this worker PR both
    merge, measured on that tree; if A's month is over 360 s, step 7b stays on F and the Known gap line is reworded, never
    removed.
  - **BUILD GO 02:15 UTC, worker-side only:** slices 1 to 6 and 5a; CAS-49 to CAS-51; ADR 0087; no migration, index or
    table. wf_f2526ebe-769 runs in the item's own session (branch fast-forwarded to 31a7345f; WIP
    `co-001/wip-suite-cap-3-build`; check-in 07:27 UTC).
  - **For the web owner (LANES.md Queues item 21):** the reopen, the write-off and the five manual reconciliation actions
    can wait on a reconcile pass for minutes, each holding one of the web's 10 connections; the fix is a `ledger:`
    try-lock with an identifier-free, retryable refusal, never a blocking wait.
- **#126** (S2): **CAS-42.5 PASSED on d2fdd106** (run 42307508461: working set 668.3 of 921.6 MiB; F's reconcile 603.0 s of
  900 s). CI on d2fdd106 green except the domain model (the blank line only) and `unit` (a degraded runner; re-run once).
  The second review round is redone with default agents (wf_a71650bd-ea2), including **candidate F1 (money):** an
  out-of-order upload across two reconcile passes might hold 11.40 of interest where 6.00 was paid. Live at 03:36 UTC the
  branch is at 9824f4e9 (03:18 UTC), whose commits name review F1 (MONEY-R2-1, 8ea33e13: a PLB L6's payments wait while a
  take-back of a chain that may yet hold interest is not written whole) and F2 (the runbook's lock loop); S2's status file
  has not recorded it yet.
- **S1, `co-001/redact-range-glued`, and MOD-16's seeds:**
  - Review round 2 found **PHI2-1 (blocking):** the fix let the call's own DOB, name part, member ID or claim number glued
    at a range end through, where cc3dd7f6 refused only by chance (6,602 of 21,600 targeted letters). Fix round 2
    (8d98b8bb to 3fcb9359; WIP = 3fcb9359; 632 of 632 gateway tests) reads the call's own identifiers across glued
    boundaries.
  - **Review round 3 (03:35 UTC) found that fix itself regressed:** PHI3-1 and PHI3-2 (blocking: a glued or camel-case own
    name between an SSN or phone label and the number cuts the label, so SSNs that cc3dd7f6 redacted are sent), PHI3-3
    and PHI3-4 (own-DOB shapes still sent), GATEWAY3-1 to GATEWAY3-3. The third round running in which a fix traded one
    regression for another, so S1 stopped the build before its final fixer and runs **a judge workflow, wf_5d1aedda-db5:**
    one base-against-candidate differential gate (at least 200,000 seeded letters plus every finding's inputs), two
    candidates from 3fcb9359 (A patches the glued reading; B reverts it and refuses an own identifier glued across a
    boundary the patterns do not read), two judges (PHI first; correctness and over-refusal), then reviews with skeptics
    on the winner until dry. The bar: zero base-redacted or base-refused inputs sent, zero must-stay changes, except
    classes recorded in ADR 0054 with a pinned row.
  - **The three MOD-16 seeds** (forwarded 01:54 UTC): 1034253323 (#128's CI), -1074798020 (#129, run 42319584132) and
    383403599 (#131, job 128259888791). The winner pins each failing at cc3dd7f6 and passing at HEAD before the one full
    local suite.
  - range-glued is the critical path for #129. #131 did not wait: its `unit` was green on 9e577017.
- **#129** waits on range-glued: CI on f4fef908 green but `unit` (MOD-16, seed -1074798020, the same on its one re-run).
  Nothing more is pushed meanwhile; then the base (8a722f80) merged once, CI, the verification, the merge.
- **S3, ux-forms-after-42:** designed (wf_8ed4a036-bce; 27 findings applied); **CI-30 allocated** at 01:19 UTC (the shell's
  skip link; next free CI-31); building in wf_24fdaecd-29b (slices U, C, W1, W2 in parallel worktrees, integration with E
  into `co-001/wip-ux-forms-after-42`). It covers parts of queued UX PRs 67, 68, 74, 75 and 84: struck in LANES.md Queues
  item 20 (UX PR 68's AppShell skip link; UX PR 74's Ticket hint; UX PR 75's users-page tables in `ScrollTable`; UX PR 84's
  upload form on the shared core and UX-087's file-field part; UX PR 67 nothing struck).
- **S4, slice 2:** round 2 (wf_db15c2a6-888) runs its loop-until-dry review rounds: NEW-1 fixed in code (3d44aff7), NEW-2 an
  accepted reading (c3a2743e), then 2f3726ad and 0b5ca610; WIP = 0b5ca610 (03:16 UTC). No PR yet.
- **Counters:** CI-30 to `co-001/ux-forms-after-42`. Next free: ADR 0092, synth module 21, fixture release 900008;
  test-matrix MOD-23, CAS-56, SEC-25, SGN-17, CI-31 (the other series as at 2026-11-06 19:40 UTC).

### 2026-11-07 06:40 UTC (Lane B's orchestrator)
Heads checked live at 06:37 UTC (`git ls-remote origin`; no tags); status files read to 06:37 UTC; the orchestrator's
notes from 03:37 UTC.

- **The second review lesson (06:40 UTC), beside the 01:33 UTC custom-agentType lesson.**
  - A review, skeptic or critic agent that dies (a usage stop) or returns nothing never counts; a round with a dead agent
    is not dry.
  - Workflow scripts must throw (or redo the agent) on a null result, as S4 did on 2026-11-07: slice 2's round 3 lost its
    agents at the 5-hour limit, was not counted dry, and resumed at 05:50 UTC with the script throwing on a dead skeptic or
    critic.
  - Added to `lanes/lane-b-session-brief.md` §5 and the rolling handoff §7.
- **The 5-hour limit stopped the account's workflows twice more:** ~04:45-05:30 UTC (S1's judge workflow, before any
  agent returned) and ~05:00-05:50 UTC (S4's slice-2 round 3; S3's check round 1). Each resumed in its same run, with the
  setup re-run where PostgreSQL was down.
- **#131 merged** (UX PR 4b): 2026-11-07 03:27 UTC as **8a722f80**, from 9e577017, by S5. `claude/build-platform` is still
  8a722f80 at 06:37 UTC; `main` 220f2b4e; no tags.
- **S5 is on P2** (`co-001/ci-trivy-version`) since ~03:45 UTC: the delta re-design, on 8a722f80, of only what #107
  (7bf7b252) and #106 (881e2bbd) leave undone; then the build alone, with two reviews (CI permissions); CI-24 to CI-26,
  N33 to N42 and P38 to P42 as reserved. Not on origin yet. session_01FcouKNP2XtaombFLueKLnu stays idle (superseded).
- **#126's F1, the blocking money defect, is fixed** (S2, acting Lane A; head **9824f4e9**):
  - Confirmed by a red db test: with two remittances uploaded out of order (two-chains.835 before paired.835), a PLB L6's
    payment written in one reconcile pass blocked its own take-back in the next, leaving 11.40 of interest on the lines
    against 6.00 of cash.
  - The fix (8ea33e13): `interestWrites` holds a PLB L6's payments while any take-back of a chain that may still hold
    interest is not written in full. Both orders end at 0 on the lines, never above the cash; LED-23's renumbered-reversal
    overstatement (5.40) closes too. Failing-first db, unit and property tests; `interest.ts` 100% (328 mutants); no
    migration change; the domain model unchanged. F2 (9824f4e9): the runbook for the lock loop's 55P03, with a guard test.
  - **The trade-off, for the founder's awareness** (ADR 0084 and #126's body): a payment netted against a take-back of a
    reversal whose claim is never uploaded is never credited: low by up to that payment, never high. Not an ask.
  - Running, wf_d944494b-d50: three judges on F-M2-1, the remaining nits, a third review round on everything since
    d2fdd106 (until dry), the base merged once, the full local suite once, the push, CAS-42.5 on the final head, the body,
    the fresh-clone verification, then the suggested line (not posted yet).
  - Beside it: PR 1, `co-001/password-changed-notice`, at f110efd9 on origin (stacked on #126; no PR until #126 merges);
    PR 5's freeze ask, draft v1 kept as WIP and not relayed (it did not converge), a short rewrite running
    (wf_c7d47053-463).
- **S1, `co-001/redact-range-glued`: the judge workflow wf_5d1aedda-db5** (candidates A, patching the glued reading, and
  B, reverting it and refusing an own identifier glued across a boundary the patterns do not read; a differential gate of
  at least 200,000 seeded letters; two judges; reviews on the winner until dry). Several hours; check-in ~10:57 UTC.
  - **The tie-break ruling for S1's judges (03:40 UTC, given to them verbatim):** a close call goes to **B** (refuse where
    the boundary is unknowable: the safer option); the winner must show **zero PHI regressions per identifier kind** on
    the gate and **no must-stay damage beyond the base**.
  - WIP 3fcb9359; the branch still cc3dd7f6; no PR. **#129 waits on it** (f4fef908 unchanged); a test is never skipped or
    pinned to get round MOD-16. A fourth failing seed, -594136649, showed in S3's ux-forms-after-42 integration run (no
    gateway file changed).
- **S4, slice 2:** round 2 done; 12 more findings fixed, one **blocking**: a `draft.ts` mutant recorded and signed as
  "equivalent" hid a real $0.00-interest print in the /2 draft's interest guard; fixed with a test (WIP 0b5ca610). Round 3
  resumed at 05:50 UTC (above). No branch pushed; no PR.
- **S3, ux-forms-after-42: built** (wf_24fdaecd-29b): slices U, C, W1 and W2 integrated with E into
  `co-001/wip-ux-forms-after-42` = **dab7d237** (on origin). Its integration: typecheck, lint, the generators and the
  browser harness green; `pnpm test` 10,014 with the one MOD-16 failure above; test:db 9,870; e2e 84 of 84. Stopped at
  ~05:00 UTC in check round 1's skeptics and resumed. Next: the check rounds with repairs, the head shots, the draft PR,
  the two reviews.
- **Counters:** none allocated. Next free unchanged: ADR 0092, synth module 21, fixture release 900008; test-matrix MOD-23,
  CAS-56, SEC-25, SGN-17, CI-31 (the other series as at 2026-11-06 19:40 UTC).
- Records: LANES.md claim rows (P2, ux-forms, 4b, #126, MOD-16, #129, slice 2); the brief §5; the rolling handoff, now
  current as of 06:40 UTC.

### 2026-11-07 09:40 UTC (Lane B's orchestrator)
Heads checked live at 09:43 UTC (`git ls-remote origin`, the open PRs; no tags); status files read to 09:40 UTC
(build-ops 66fc06f0); the orchestrator's notes from 06:40 to 09:37 UTC.

- **Pacing: the 7-day limit at its warning level again** (06:50 UTC; it resets 2026-11-13 19:00 UTC). Decided under the
  "finish near-done" precedent: MOD-16 (S1), #126 to its suggested line, PR 5's ask text, S4's slice 2,
  ux-forms-after-42, SUITE-CAP-3's build and #129 continue; P2's build and schema PR 1's build are held at clean points;
  S5 stops. No new item started since.
- **Who runs what (06:40 UTC).** S5 refused P2 without a typed human go (an older session). P2 went back to its original
  session, ci-pin-age (session_01FcouKNP2XtaombFLueKLnu), which holds the design and accepts the orchestrator's resume.
  Future queue items (P5, UX PR 8, dark-mode-ship) go only to sessions created with the `append_system_prompt`
  authorization.
- **The setup fix, 6bc01e3d on build-ops (`tools/setup-container.sh`):** a machine restart leaves /root at 0700, so the
  PostgreSQL clusters stay down (found by SUITE-CAP-3). `start_server` now reopens /root to 0755 before `pg_ctl start`.
  Verified at 06:50 UTC on the orchestrator's container: /root at 0700 reproduced; the setup restored 0755 and started
  both clusters.
- **S5 done; #131's claim row closed.** S5 (session_01FcouKRDfoFAeXZK4Thp8M8, ux-screening-result-words) finished clean
  at 06:47 UTC: #131 merged as 8a722f80; its push runs on 8a722f80 green (screening-capacity, mutation; ci green on
  attempt 2 after one re-run of MOD-16's base flake, seed -460602131). Its status file is final and pushed; no
  check-ins, workflows or worktrees are left. S5 is free and, under the pacing, takes no new item.
  - **Proposal recorded:** `lib/screening/routes.ts:836`'s doc comment "Expected less allowed" becomes "The Medicare
    figure less allowed" at the next change to that file.
- **S1, `co-001/redact-range-glued`:**
  - **MOD-16's five seeds,** pinned failing at cc3dd7f6 and passing at HEAD in its final stage: 1034253323 (#128),
    -1074798020 (#129), 383403599 (#131's job), -460602131 (the base's own push run on 8a722f80, red on `unit`; to S1 at
    06:40 UTC) and -594136649 (S3's integration run; to S1 at 06:50 UTC).
  - At the pacing, candidate A and the two judges were dropped (06:45 UTC, the status file); B is built alone against
    the bar.
  - **The gate (07:20 UTC; 975,489 seeded synthetic letters, 5,292 synthetic patients):** neither head meets the bar
    against cc3dd7f6. HEAD 3fcb9359 sends SSN 38,604 and phone 33,965 (about 65,000 of them the
    glued-own-name-cuts-the-label class), DOB 95, name parts 648 and initials 357, and damages 3,615 code or unit
    letters. The earlier head 6fc88092 sends name parts 15,064, DOB 6,036, initials 3,455, member 2,465, claim 1,511 and
    SSN 7,495.
  - **The orchestrator's ruling (07:20 UTC) on SSN-shaped amounts at range ends (the R1 must-stay conflict):** fail
    closed where it is not decidable at run time (refuse as the base does: no regression, no damage beyond the base). A
    class is send-exempt only if the generator's ground truth shows no identifier of any kind, of any patient, in every
    letter of the class, and the rule decides from structure (a code-computed money figure), not surface text; one
    failing letter refuses the class. Every class is reported with its counts in the PR description and the status file.
  - S1 acknowledged at 07:21 UTC, applied the ruling verbatim to B and restarted B from its progress file at 07:22 UTC.
    B's gate numbers come next.
- **#126 (S2, acting Lane A):** in its round 4 at 08:44 UTC; head 9c68a4be (08:45 UTC, live; WIP
  `co-001/wip-interest-fix` the same). wf_d944494b-d50 runs to the suggested line, which is not posted yet.
- **Schema PR 1, password-changed-notice, held clean (06:42 UTC):** branch f110efd9 (the database, worker and infra, and
  records parts built and pushed); WIP `co-001/wip-pwnotice` c0ced87f (the base merged, the seam tests); `unit` 10,065
  green. The suite, the reviews and the fix round wait for #126's founder line (RESUME-BLOCK in
  `approval-summaries/lane-a-auth-emails-status.md`).
- **PR 5's combined ledger freeze ask: ready (08:44 UTC) and relayed.**
  `approval-summaries/lane-a-ledger-freeze-ask-pr5-2026-11-07.md` (build-ops 9102eadf; base 8a722f80):
  - Q1: `roi_links_valid` accepts a fifth key, `actionable_open_lines`;
  - Q2: `roi_statement_rules`' sum check (only with Q1);
  - Q3: an empty links object `{}` is refused.
  - Lane A recommends yes to all three. The grant is the appendix text only, for PR 5 only.
  - Relayed to the co-founder (a push notification and the chat) at 08:45 UTC, for Tyler (the founder); awaiting his
    answer. SUITE-CAP-3's further ledger items are a later ask.
- **S4, slice 2:** reviews done at 07:03 UTC (round 3 nits only; the critic's one finding fixed: a `draft.ts`
  "equivalent" was not equivalent, and a test now kills it); WIP e30a44aa, then 7e9618e3. Suite stage wf_ca36d6f2-079:
  the base 8a722f80 merged, one full local suite, the branch push, the PR description. Its status file at 09:37 UTC
  (build-ops 815839e3): the suite green; `co-001/packet-figure-placeholders-2` pushed at a851850d; the PR body prepared.
  **Draft #133** at a851850d, opened by S4 at 09:38 UTC (live at 09:43 UTC; status file 66fc06f0: subscribed, CI
  running).
- **ux-forms-after-42 (S3, session_01FcouKQJppM8BdCui7NVQUa): draft #132** at 76da396a (opened 08:03 UTC; 85 files; two
  check rounds repaired; 105 after-shots). Next, wf_1bd58daa-b34: the UX and brand review with shots and the security
  and privacy review (including a ruling on the late re-send's second result email), skeptics and a critic, one fix
  round with the base 8a722f80 merged, the full suite once, one push, the description. Waiting on nothing.
- **P2, `co-001/ci-trivy-version` (session_01FcouKNP2XtaombFLueKLnu):** the delta re-read is done and committed (08:30
  UTC; wf_ab899371-7bf: 19 findings, 5 S and 14 N; 17 fixed, 2 refuted; CI-24 to CI-26, Part 6 and N33 to N42 free;
  target Trivy v0.76.1). **Held before the build:** no commits on the branch (= the base 8a722f80), no WIP.
  - The key fact: #107's de7438c8 ages `tools/trivy/release.txt` by the action pins' default-branch rule, so P2 moves
    Trivy to its own verified release-branch rule (the 3-day floor kept).
  - **The orchestrator's ruling (08:30 UTC):** the per-release exclude is not the founder's (the founder's exclude under
    the floor and the 48-hour database floor are untouched); no relay.
  - Status file at build-ops 097acc24. Its check-in trig_01R6nXDdCD43e1PypnQ2Dtwi, at 2026-11-13 19:15 UTC, is settled
    at the stand-down (cancelled, or handed to Lane A).
- **#129 (session_01FcouKRo5iee5QFtPT8UimZ):** ready at f4fef908 (WIP s5), green on every check but `unit`'s MOD-16 base
  flake. Its check-ins stopped at 08:38 UTC; it is idle until the orchestrator messages it after
  `co-001/redact-range-glued` merges, then: the base merged once, the push, CI, the verification, the merge. **When
  MOD-16 merges:** wake #129; #126, S4's #133 and #132 take the fixed base at their own base merges.
- **The check-in at 09:37 UTC:** no failed sessions. Running: S1 (B building), S2 (#126's round 4), S4 (storing the PR
  body), ux-forms-after-42 (#132's reviews), SUITE-CAP-3 (session_01FcouKP4ekrT97eyDtLe4Rd; re-running the setup after
  the /root permissions). Idle by design: #129 (waits on MOD-16), P2 (held at the cap), S5 (done). #126's suggested
  approval line is not posted yet. No new item started.
- **Carried from the 06:35 UTC check-in:** (a) the web owner's try-lock item and (b) the UX PR 67, 68, 74, 75 and 84
  strikes were already in LANES.md (Queues items 21 and 20) and the rolling handoff; (c) the five seeds, (d) S4's WIP
  move and (e) the setup fix are recorded now (above, their LANES.md rows and the handoff).
- **Counters:** none allocated; PR #132 is ux-forms-after-42's. Next free unchanged: ADR 0092, synth module 21, fixture
  release 900008; test-matrix MOD-23, CAS-56, SEC-25, SGN-17, CI-31 (the other series as at 2026-11-06 19:40 UTC).
- Records: LANES.md claim rows (P2, ux-forms-after-42, 4b closed, SUITE-CAP-3, #126, UX PR 8, MOD-16, #129, slice 2,
  password-changed-notice, dark-mode-ship) and "Handed to Lane A" (PR 5's ask); the rolling handoff, now current as of
  09:40 UTC.

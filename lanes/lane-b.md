# Lane B log (the co-founder's sessions)

Only Lane B's sessions write this file. Add entries at the end, each with:
- the UTC time;
- what was done, with links to the PR, commits and workflow runs;
- the next step.

Lane A reads it to keep the build tracker current. The rules are in `../LANES.md`; the person's set-up is in `../COFOUNDER-START.md`.

## Start here (Lane B): the state at 2026-10-25 ~20:35 UTC
A new Lane B session reads this section first, after `../LANES.md`. It says:
- what is merged, and what runs next in what order;
- what waits on whom, and the rulings already made;
- the conventions and pitfalls that kept the build safe.

Two independent reviewers checked it against git, GitHub and the files before handing off: a cold-start critic and a fact-checker (wf_22368784-06b, 2026-10-25 ~20:10 UTC). Their 51 findings are applied. The dated log below is the record; nothing in it is needed to continue.

Where `HANDOFF.md`'s "Start here" disagrees with this section, this section and GitHub are current. HANDOFF's is Lane A's state at 2026-10-25 10:00 UTC (1f35d71). It still shows `claude/build-platform` at 49514e8, #43 in its fix round and three open Dependabot PRs. Lane B does not edit HANDOFF.md (LANES.md rule 10); Lane A folds this section in.

### The state in one screen
- **Merged by Lane B into `claude/build-platform`**, each as a merge commit after a fresh-clone verification that read CI:
  - [#43](https://github.com/PureTideWater/PhysicalTherapy/pull/43) ci-speed (CI 1 of 4), as 9c57d2d (2026-10-25 14:16 UTC). CI went from 29-41 minutes to about 6-8: parallel jobs behind one `all green` gate, db in 4 shards, and e2e in 2 shards over one stamped build.
  - [#44](https://github.com/PureTideWater/PhysicalTherapy/pull/44) ci-mutation (CI 4 of 4), as de8f9b5 (~18:50 UTC). Every money package is mutation-tested, gated above 85% with no unexplained survivor. Scores: money 96.58%, ledger 98.13%, pricing 98.67%, packets 95.87%, with 164 reviewed equivalents.
  - [#45](https://github.com/PureTideWater/PhysicalTherapy/pull/45) PR 15 (ledger tests LED-12 and LED-13), as 6ddd587 (20:04 UTC). Tests only, under the founder's ruling L1 (a). Reconciliation-001 item 15 is done.
- **Open in Lane B: nothing.** No PR, no workflow, no worktree, and no claim in progress.
  - The main checkout `/home/user/PhysicalTherapy` is at 6ddd587, the same as origin, with its packages installed.
  - `SETUP_CHECK=1` printed OK at 20:05 UTC.
- **`main` is unchanged, by rule.** It holds the plan documents until launch. No PR goes into `main` and no release tag is created before launch, unless the founder rules otherwise (CLAUDE.md "Merging", ADR 0063).
  - "Up to date" means merged into `claude/build-platform`.
  - The default branch moves to `claude/build-platform` when ci-deps merges (F1 (a)).
- **F7 is applied** (2026-10-25: created 21:07 UTC, corrected 21:14 UTC, by the co-founder on the `PureTideWater` owner account). The ruleset "Protect the build branch" (id 25837331) is active and targets `refs/heads/claude/build-platform` alone:
  - deletions restricted, force pushes blocked, a PR with 0 approvals, no bypass;
  - the four checks `all green`, `mutation`, `screening-capacity gate` and `approval-of-record`, each from GitHub Actions (app 15368), with branches up to date.
  - Every PR into the branch, Lane A's #42 included, now merges only up to date and with all four green. Each of the four workflows runs on every pull request, with no path filter.
- **Lane A:** [#42](https://github.com/PureTideWater/PhysicalTherapy/pull/42) (PR 6b-4, mail streams, a schema PR) is a draft at 13f59b1. Its fix round comes after the 2026-10-27 reset.
  - It changes 143 files. Take the list from `gh api 'repos/PureTideWater/PhysicalTherapy/pulls/42/files?per_page=100&page=1' --jq '.[].filename'` and `page=2`, not from LANES.md's summary list.
- **Dependabot** (never merge one as it stands):
  - #40, the actions group, is now 11 updates. ci-deps supersedes it with its own pins: each action at its latest release, SHA-pinned.
  - #33, the base images, now proposes `node:26-slim` (rebased 2026-10-25 14:18 UTC, head bc82651). ci-deps declines it with an ignore rule and moves both images to Debian trixie digests on Node 24; Node 26 gets a PR of its own (N8; LTS from 2026-10-28). `designs/lane-b-ci.md:662` still calls #33 "Node 25", which is stale.
  - #38 (npm minor and patch) was closed by Dependabot at 18:57 UTC: "no longer updatable".
    - Its npm update on de8f9b5 (run 40223237798) failed for every dependency. Dependabot ran pnpm with `--config.minimum-release-age=4320`, and ci-mutation's Stryker 10.1.1 was under three days old.
    - Its versions are still behind at 6ddd587 (vitest and coverage 5.0.4, eslint 10.12.0, postcss 8.5.30, next 16.4.1), so ci-deps takes §3.2's versions.
    - Dependabot's npm updates resume once Stryker 10.1.1 is three days old, from about 2026-10-26 19:50 UTC.
- **CI on `claude/build-platform`:**
  - The push runs on de8f9b5 are green (ci 40223130551, mutation 40223130477, screening-capacity 40223130509).
  - On 6ddd587, mutation 40229005837 (every package) and screening-capacity 40229005836 are green.
  - ci 40229005858 failed on its first attempt (20:04 to 20:11 UTC), in e2e (2/2) alone. `apps/web/e2e/screening.spec.ts:135` (SCR-01 to SCR-07, SCR-18) failed at `:339`: the outcome's stage read `priced` where the test expects `accepted`, because the consumer priced the upload between the test's two reads. Playwright's retry then failed at `e2e/helpers.ts:87`, because the first attempt had already registered the platform administrator's hardware key. The same tree passed on f4d125b (ci 40226881568).
  - **The one re-run passed:** e2e (2/2) attempt 2 (job 121281840873, 20:26 to 20:30 UTC), and `all green` with it, so ci 40229005858 is green on attempt 2. A timing flake in the screening journey, handed to Lane A (LANES.md "Handed to Lane A", for #42's fix round).
- **Test counts at 6ddd587** (CI on #45's head f4d125b, the same tree):
  - unit 4,996 and 1 skipped (locally 4,994 and 3);
  - db 9,049 and 1 skipped, over 118 files in 4 shards;
  - e2e 51; golden 188;
  - pyx12 agrees on all 637 synthetic 835s.
- **Usage:** last read **28% at ~21:20 UTC on 2026-10-25** (the co-founder: "Go as far as we can"). That leaves 52 points to the ~80% line over about 4.5 days to the reset, about 11.5% a day.
  - This log's earlier readings put it at about 0.7M subagent tokens per 1% of the weekly allowance. From ~21:10 UTC the session and its agents run on a larger model with ultracode on, so re-measure at the next reading.
  - The weekly reset is Friday 2026-10-30. Its time of day is still not given.

### Next actions, in order
1. **Machine and reading.** Follow COFOUNDER-START.md's message.
   - The setup script needs no branch arguments: no Lane B branch is open.
   - `gh api user --jq .login` must print `PureTideWater` (the co-founder's ruling, 2026-10-24 ~21:10 UTC). If it prints another login, stop and ask the co-founder before any push or merge: CLAUDE.md's merge rule changes for a build that works as its own account (runbook 3i).
   - Read CI on the head of `claude/build-platform` (above). A red run there comes before any new work:
     - re-run a failed job once, and only to tell a flake from a regression;
     - if it is a flake in a file #42 changes, hand it to Lane A (as below), and do not edit the file;
     - if it fails again, tell the co-founder before any heavy run.
   - **At the first reading, ask the co-founder for the usage % and the reset time (rule 9).** Three other questions are already ruled (co-founder, 2026-10-25 ~21:05 UTC):
     - **CI series and #42's files:** rule 6; the PR merged second keeps both, the lockfile re-resolved and never hand-merged; axe runs over #42's pages (O6) if #42 merges first; ci-browser does not wait for #42.
     - **Scope of "every recommended option":** pre-approves engineering-only choices inside an already-ruled design, recorded as his rulings and reversible; batches with wording, brand, product, cost or security trade-offs still go to him.
     - **ux-brand-reviewer.md's `model:` key:** follows the other reviewer files (rule 12); the checklist PR takes a documentation-only suite (typecheck, lint, lint:copy, unit).
2. **The UX/UI and brand baseline review: the first task** (the co-founder's decision, 2026-10-25 ~16:50 UTC). It changes no product code.
   - **Brief:** `designs/lane-b-ux-review-brief.md`, read whole.
   - **Claim:** pull, then add a row under Claims and push it before starting:
     - item: "UX/UI and brand baseline review, then the reviewer checklist (the co-founder, 2026-10-25)";
     - lane: B;
     - branch: none for the review; `co-001/ux-brand-reviewer` for the checklist PR;
     - reserved: no ADR expected (reserve one first if the design needs it), and no test-matrix or synth IDs.
   - **Capture with `tools/lane-b-screen-tour`** (its README).
     - Set `TOUR_DIR` in the new scratchpad, then run `setup.sh`. `serve.sh` prepares the database, and `env.sh` derives the development key itself.
     - Give a whole-app capture `TOUR_MINUTES=90`.
     - After every run, check that `fuser 3297/tcp` prints nothing.
     - The tool was run end to end at 6ddd587 before the handoff (20:28 to 20:36 UTC). Setup, prepare, build and server start passed; the 6 populate journeys passed; `tour.spec.ts` captured 27 PNGs with `shots.json` and `ids.json`; and the server and lock ended together, leaving the port free. run.sh now captures `tour.spec.ts` alone (the retake specs need a tour's `ids.json`, so they run through redo.sh).
   - **Before capturing, a scout writes the route map.** For each of the 83 `page.tsx` routes (`find apps/web/src/app -name page.tsx`; 84 once #42 merges), it records:
     - the persona that may open it (`apps/web/scripts/synthetic-personas.ts`, and the route's permission in `apps/web/src/lib/routes/*.ts`);
     - the record its dynamic segments need;
     - which `apps/web/e2e/*.spec.ts` creates that record.

     Populate with the specs the map names. A route no spec reaches is recorded as "not reachable on synthetic data", never faked. Each capture starts from a fresh prepare.
   - **Grow the spec on `claude/build-ops`.** Extend `tools/lane-b-screen-tour/capture/tour.spec.ts`, not the copy in `$TOUR_DIR`, and push it with the review, so later PRs' before-and-after tours reuse it (`TOUR_REF` gives a PR's base, then its head).
     - **Today's coverage:** 30 screenshots, 26 at 1280 px and 4 at 390 px.
     - **The target:** every route at 1280 px and 390 px, the dark tokens, and the empty, loading and error states the journeys reach.
   - **Dark:** the app has dark tokens but no switch and no `prefers-color-scheme` rule, so no user reaches dark today.
     - Capture it by setting `data-theme="dark"` after each load, as `apps/web/e2e/brand.spec.ts:407` does.
     - Label those shots "dark (tokens only)" and judge their contrast as advisory.
     - Put the choice (follow the device's setting, offer a switch, or stay light-only) in the co-founder's batch.
   - **Where the pictures go:** a private artifact gallery, as on 2026-10-25. The repository is public, so `claude/build-ops` gets only `designs/lane-b-ux-review.md`, the manifest and any small crop a finding needs. Record the gallery's URL here.
   - **Cost:** estimate it once the capture is done, from the image count, and tell the co-founder before the reviewers start. Give each lens only its images: the 390 px reviewer the 390 px and state shots; the brand reviewer one shot per layout and the dark set; the flows reviewer each role's path. Give every reviewer the manifest and exact file sections, never whole large documents.
   - **Output:**
     - `designs/lane-b-ux-review.md`: the findings ranked and grouped into proposed PRs in landing order;
     - one batch of wording and brand choices for the co-founder, recommended option first. A choice that changes legal text (the terms, the cookie notice, the screening terms, the AMA notice, or anything on HANDOFF.md's counsel list), or that reverses a recorded founder ruling, goes to the founder through the co-founder;
     - the co-founder rules which proposed PRs Lane B takes, and where they sit (delegated: "which no-migration items Lane B takes"). Record the ruling, then add them to Lane B's queue in LANES.md as one dated block, "Added from the UX baseline review (the co-founder, <date>)". If he reads LANES.md's line 7 as forbidding queue additions, ask the founder, through him, to allow "queue items on a recorded ruling" there first;
     - a proposal that needs a migration goes under "Handed to Lane A". A no-migration proposal touching a file #42 changes stays in Lane B's queue, marked "after #42 merges", as items 8 and 15 to 17 are.
   - **Inputs besides the brief's:**
     - the screen tour's five defects (log, 2026-10-25 ~15:40 UTC);
     - the founder's own screenshot tour of 2026-10-17 and its fixes (`workflow-scripts/co-001-fix-screen-tour-wf_0291578a-a18.js`, merged from `co-001/fix-screen-tour`), so findings already fixed are not raised again;
     - the combined audit's experience items #48, #89, #90, #103 (every route's accessibility, with WCAG 2.2's rules; it lands in Lane A's PR 7), #107 and #125;
     - #102, the Approve button, which already landed in PR 5;
     - Lane B's visible-screen items #38, #46, #49, #52 and #135.
   - **Then the checklist PR**, `co-001/ux-brand-reviewer`, under the review's claim.
     - **Design:** the review's findings plus a one-page outline of the checklist's sections, with one reviewer.
     - **Build:** one builder writes `.claude/agents/ux-brand-reviewer.md` with `security-reviewer.md`'s frontmatter keys. The four existing reviewer files carry a `model:` key; rule 12 applies: follow them (ruled, co-founder, 2026-10-25 ~21:05 UTC).
     - **Draft PR**, from `.github/pull_request_template.md`.
     - **Two adversarial reviews:** brand and copy, against `.claude/rules/brand.md` and CO-11; and consistency with the other reviewer files and the brief's "Then".
     - **Fix round:** the full local suite once, unless the co-founder rules a documentation-only suite (typecheck, lint, lint:copy, unit), which he may (delegated).
     - **Then** the fresh-clone verification that reads CI.
     - **Order:** it merges before the review rounds of ci-browser and 15b, which both change screens and take the UX review as one of their two.
3. **ci-deps (CI 2 of 4; audit #112; claimed in the CI series' row).** It may run beside step 2 as the second heavy workflow if usage allows; at most two at once.
   - **Design:** `designs/lane-b-ci.md` §3.2. It was reviewed on 2026-10-24 at 49514e8, before ci-speed and ci-mutation merged, so its file and line references and version notes predate both. For example, `workflows.test.ts`'s PINNED is cited at `:46-58` and sits at `:77` at 6ddd587.
   - **Before the builders, one scout re-reads §3.2 against the current head:**
     - what ci-speed and ci-mutation changed in each file §3.2.2 lists, mutation.yml's three jobs included (§3.2's pins, timeouts and release-age rules must cover them, and Stryker 10.1.1);
     - the plan to drop the Postgres `services:` for compose, now that ci-speed gave those services health checks;
     - #40's 11 updates, #33's version, and which of #38's versions are behind;
     - O3, pnpm 10.34.8's release age on frozen installs and under Dependabot.

     Changes to the design go to its one reviewer. Builders start after that.
   - **Rulings:** F1 (a), F2 (a) and (b), and F4 yes, all as recommended (the founder, relayed 2026-10-25 ~01:10 UTC). F2 (b)'s `minimumReleaseAge: 4320` holds every new direct dependency as it held Stryker, so test its exclude path.
   - **Carry in** (verifier nits, fixed in the commit that next touches each file):
     - ADR 0066:333 calls the gate "the required `mutation` job". Until the F7 ruleset, only ADR 0063's merge rule requires it, so write "the `mutation` job (required once the F7 ruleset is applied)".
     - ADR 0066:179 (Part 1's "Measured") gives 132 new tests less 12 renamed (4,644 and 1 skipped on 9144b56). It should give 146 less 12 (4,658 and 1 skipped on CI, b5ff4c7).
     - `.github/dependabot.yml:4` says "about 45 runner minutes". Measured, it is 36-38 (43-44 billed).
     - `docs/runbooks/ci.md:97`, `docs/runbooks/github-governance.md:66` and ADR 0066:175 give the capacity gate as "13 to 16 minutes". Measured since: 11:59 (9c57d2d push), 15:52 (7542aae PR), 18:28 (de8f9b5 push), 18:32 (f4d125b PR; the gate at 18:52 from the run's start) and 17:30 (6ddd587 push).
   - **When it merges, the founder** (owner-admin settings, not delegated):
     - makes `claude/build-platform` the default branch (F1 (a));
     - turns on Dependabot alerts and security updates (F2 (a));
     - then, with F4's pins in, requires actions pinned to a full SHA (F3).
4. **ci-browser (CI 3 of 4; audit #19's upgrade part).** After ci-deps, and after the checklist PR.
   - **Design:** §3.3. Rulings: F4 yes; F5, the capacity chain stays on ubuntu-24.04. Re-read it against the head as for ci-deps.
   - **Carry in:**
     - **V3:** cache the system packages the browser jobs install (`playwright install --with-deps`), in e2e and in the db shards. #44's verification found the slowdown in e2e. On #45's head, db (4/4) spent 10 of its 13 minutes on that install, with 2 minutes of tests, and alone held `all green` to 13:10.
     - **O6:** the axe sweep over #42's journeys, if #42 merged first.
     - **O7:** rebalance `stryker/shards.json` if packets-rest nears 15 minutes (5:50 to 10:06 measured).
     - **#42's shell.tsx:** as the co-founder rules at step 1.
     - **A9's inspection of the seven regenerated baselines is the co-founder's** (delegated). Give him the PR's image-diff link, the pixel counts and the crop, and record his answer with the date.
     - **The UX review** is one of its two adversarial reviews (it changes shell.tsx and the brand baselines).
   - **Browsers:** `tools/setup-container.sh` pins chromium-1248 and its headless shell (CfT 156.0.8078.4) in CFT_BUILDS (`:957-960`). But `step_playwright` lays out only the revisions the main checkout's Playwright names, so `/opt/pw-browsers` has 1194 (and the image's 1243), not 1248. The design's CfT 156 layout was in the old session's scratchpad, and is gone.
     - Before ci-browser's local e2e and its baseline regeneration, lay 1248 out from the pinned zips.
     - Best: a small claude/build-ops change, letting `step_playwright` also lay out what each argument worktree's `apps/web/package.json` names.
     - Or by hand, as `cft_layout` does: into `/opt/pw-browsers/chromium-1248/chrome-linux64` and `/opt/pw-browsers/chromium_headless_shell-1248/chrome-headless-shell-linux64`, each with INSTALLATION_COMPLETE and DEPENDENCIES_VALIDATED.
5. **PR 15b: ledger amounts in payment terms** (queue item 3; audit #12). It lands before any ROI statement reaches a customer.
   - **The rulings are already made.** On 2026-10-20 ~15:10 UTC the founder adopted the combined audit whole (HANDOFF.md, "Founder rulings of 2026-10-20 ~15:10 UTC (combined audit)"):
     - "the 19 freeze exceptions are granted", #12's ledger exception among them;
     - "the ruling changes the report lists are accepted as it recommends", PRD 13's two definitions of "approved" among them.

     #12's best option keeps deciding the outcome on the allowed amount, and measures every ledger amount in what the payer actually pays. 15b's design records the ruling in its ADR and in reconciliation-001. Only a departure from #12's best option goes to the co-founder (delegated).
     - LANES.md's items 3, 10 and 14 still say "Needs" these exceptions. #32's milestone 3 exception and #30's content-pipeline exception were granted the same day, so they too are already ruled. Ask the founder's lane to amend those lines; Lane B does not edit LANES.md's text.
   - **From PR 15's review:** N-5, a line with two approvals. LED-12's last clause is pinned only on lines with one approval.
   - **Unchanged by rule:** LED-06's "not resolved" check (`apps/worker/src/reconcile/ledger.db.test.ts:221`) stays, because LED-01 to LED-11 must not change.
   - **Reviews:** payment-engine, and the UX review (its figures show on screens).
6. **Then Lane B's queue in LANES.md, from item 4, in order.**
   - Items 15 to 17, and every "Not while #42 is open" part, wait for #42 to merge.
   - Item 18, the formatter, needs both lanes idle.

### Waiting on someone
- **The founder** (owner-admin or Lane A's, so not delegated):
  - **The governance runbook's other rulesets** (step 4B, `main`'s two; step 4C, the two for the `v*` release tags):
    - Neither exists: the rulesets API lists only "Protect the build branch" (2026-10-25 ~21:15 UTC).
    - HANDOFF's "Repository settings, and when to click each" does not schedule them. They are owner-admin settings, so the founder's; Lane A says when.
    - **In 4B, target `main` by pattern, not "Include default branch":** F1 moves the default branch to `claude/build-platform`, and these rulesets must never hold it.
  - **O12, the PR capacity run's length:** job time 11:59 to 18:32 so far. It is due after ci-speed's first five push runs; three have run so far (9c57d2d, de8f9b5, 6ddd587).
    - `designs/lane-b-ci.md` §11 names the two options and what each changes: S4 once on PRs instead of three times, or the scenarios split across parallel runners.
    - Their costs in minutes are still to be measured and brought with them.
  - **O1:** the account's plan (Free or Pro), a fact that sets the concurrent-job limit.
  - **Lane A's PR 6c:** four frozen-engine defects found by #44's review (LANES.md, "Handed to Lane A").
  - **Lane A's screening journey:** the e2e timing failure above. Handed to Lane A in LANES.md, for #42's fix round: read the outcome only after the consumer has finished, or assert either stage, and make the key registration safe to retry.
  - **The amendments to LANES.md's items 3, 10 and 14** (step 5).
- **The co-founder** (delegated, LANES.md 2026-10-25):
  - the usage reading: the current % and the reset time's time of day (rule 9);
  - payment-engine/S1, from #44: an explicit MoneyError guard in `multiplyCents` for text cast past `Cents`. It would be a later money change, in its own PR, with payment-engine review;
  - the UX review's batch and its queue ruling, when they come;
  - ci-browser's A9 inspection.

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
  - **Q4 (ux-brand-reviewer.md's `model:` key and checklist suite, 2026-10-25 ~21:05 UTC):** `model:` follows the other reviewer files (rule 12); the checklist PR takes a documentation-only suite (typecheck, lint, lint:copy, unit).

### How Lane B runs: conventions and pitfalls (each one cost time once)
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
  - the UX brief: `designs/lane-b-ux-review-brief.md`.
- **Records:**
  - summaries and reviews: `approval-summaries/lane-b-{ci-speed,ci-mutation,pr15}-*`;
  - workflow scripts: `workflow-scripts/lane-b-*`.
- **Tools:**
  - the screen tour: `tools/lane-b-screen-tour/` (its README). The published gallery: https://claude.ai/artifact/3WudgKdMPDcRik4Z5bxU3c, 30 screens of 9c57d2d, private to the co-founder.
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
- **2026-10-25 ~21:40 UTC: the container had restarted; machine rebuilt; two workflows started.**
  - PostgreSQL was down after a container restart (the session stayed open). `tools/setup-container.sh` was re-run with no branch arguments, and printed OK, both clusters started.
  - **The UX baseline, part 1** (wf_b56fe7b4-652; script archived). Steps:
    - four scouts map the 83 routes (persona, records, the spec that creates them, states), and a critic checks the map for completeness and writes `designs/lane-b-ux-review/route-map.{json,md}`;
    - one agent extends `tools/lane-b-screen-tour` on this branch, so every reachable route is shot at 1280 px light, 1280 px dark (tokens only) and 390 px light, plus the states the map names (states at 1280 and 390, light). The tour gets a `TOUR_ONLY` filter for retakes. The agent runs the tour under the lock (`TOUR_MINUTES=90`, a bound of about 150 minutes held) and leaves the port and the database clean;
    - checkers look at every image; one retake round follows, then the manifest, `coverage.md` and the five reviewer image sets.
  - **ci-deps' design re-read** (wf_c51b25c9-e94; script archived). Two scouts check the files and the versions against 6ddd587. An author brings §3.2 current, adding §3.2.6. One adversarial reviewer follows, then every finding is resolved in §3.2.7. No heavy command runs in it.
  - Neither workflow commits; the session reviews their files and commits them.
  - **Next:** the capture's result → the cost estimate to the co-founder → the five reviewers. ci-deps' re-read → its builders.
- **2026-10-25 ~21:45 UTC: the co-founder's standing direction: "If you ever discover a way to improve or optimize something as you're building do it. Always do this."**
  - Recorded under "Rulings and decisions of record", and as the convention "Improve as you go": inside the current PR when it fits, its own next PR otherwise, Lane A's when it needs a migration or frozen code, and the co-founder first when it touches wording, brand, what a person sees, cost or security.
  - The two running workflows are not stopped: their prompts already let the capture agent improve the tour tool and the ci-deps author make the best engineering choice. Every later workflow prompt carries the direction.

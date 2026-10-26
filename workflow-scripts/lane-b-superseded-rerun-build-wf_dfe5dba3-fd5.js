export const meta = {
  name: 'lane-b-superseded-rerun-build',
  description: 'Build audit #10 (superseded re-run): worker, docs, before screens, web, then checks',
  phases: [{ title: 'Build' }, { title: 'Web' }, { title: 'Check' }],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/81ccf0db-8a34-5ffa-8cb9-5886112da886/scratchpad'
const SAVE = (file, what) => `Save as you go: keep ${SP}/progress/${file} up to date (${what}), so an interruption loses nothing. If it already exists when you start, an earlier run of yours was interrupted: read it, trust what it holds unless the code says otherwise, and continue from where it stopped.`
const WT = '/home/user/superseded-rerun'
const DESIGN = '/home/user/ops/designs/lane-b-superseded-rerun.md'
const COMMON = `You are a builder for a Lane B pull request: combined audit #10, "a superseded re-run cannot be accepted". The design of record is ${DESIGN} (read it whole first, including §12 Review and dispositions; it is the spec — follow it exactly, and where the code shows it wrong, do the correct thing and record the deviation and why in your progress file and your result).
Work in the worktree ${WT} (branch co-001/superseded-rerun, from claude/build-platform 6ddd587). Other builders edit other files in the same worktree at the same time: change ONLY the files your task names (plus a new file it names). Do not commit, push, or run git commands that change the index or the tree (git diff/status are fine).
Rules:
- Every shell command starts with: export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH
- Heavy commands (pnpm install, build, typecheck, lint, vitest runs, test:db, e2e, Stryker) run one at a time under: flock /tmp/laneb-heavy.lock <command>. Keep each run targeted (one file or project) during building; the full suite runs later.
- No migration, nothing under packages/db/migrations or packages/pricing (engine freeze), no file of open PR #42 (list: /tmp/claude-0/pr42-files.txt) EXCEPT the shared documents docs/product/test-matrix.md, packages/synth/src/cases/matrix.ts and registry.ts, which this PR may add rows to.
- Synthetic data only. No model name or identifier in any file. No PHI, identifier or value in a log, URL, error message or job payload. Match the surrounding code's comment density, naming and idiom (these files have rich doc comments citing PRD/J-numbers and ADRs; follow suit).
- Improve as you go: an improvement inside your files goes in (record it); outside, record it as a proposal in your result.`

phase('Build')
const [worker, docs, before] = await parallel([
  () => agent(`${COMMON}

YOUR TASK: the worker side. Files: apps/worker/src/price/in-effect.ts, rerun.ts, public.ts, rerun.db.test.ts, a new rerun-rule.property.test.ts, diff-location.db.test.ts, and any other existing worker test the design (§6.4) says must change with the rule. Implement the rule of §2 (the SQL fragments, the reasons superseded / newer_run_pending / changed_meanwhile / not_in_effect on RerunRefusedError, the pricing_current lock taken first at READ COMMITTED with the isolation refusal, createRerun's refusals, and whatever the web needs exported to show why a re-run cannot be accepted and which run it replaces — design §3.1, §3.2, §3.4 inputs; export it through public.ts so the web builder can use it). Write the tests of §6.2-§6.4 with the PRC-25..PRC-28 IDs in describe names, including the concurrency tests (two transactions; nothing deadlocks) and the parity test against the database's pricing_run_in_effect(). Check stryker/shards.json: if any file you touch or add is held by a mutation shard, keep the shard complete (a new source file needs its shard entry).
Run, each under the lock: the worker typecheck (pnpm --filter @tp/worker typecheck or the repo's tools), then vitest for your test files (find how db tests are run: vitest.config / vitest.workspace, project db; e.g. pnpm vitest run --project db apps/worker/src/price/rerun.db.test.ts), and the property test in the unit project. All must pass.
${SAVE('build-worker.md', 'each file changed, decisions and deviations, test runs and results')}
Return: the exported API for the web builder (exact names, signatures, the reason codes and the shape of any "why not acceptable / replaced run" read), files changed, tests added with pass counts, deviations from the design, proposals.`, { label: 'build-worker', phase: 'Build' }),

  () => agent(`${COMMON}

YOUR TASK: the documents. Files: the ADR 0037 amendment (docs/adr/0037-*.md; a dated amendment as design §7 says, in the style of other amendments in docs/adr), the four test-matrix rows PRC-25 to PRC-28 exactly as design §6.1 words them in docs/product/test-matrix.md (after PRC-24, in its table format), the identical rows in packages/synth/src/cases/matrix.ts (it mirrors test-matrix.md word for word; packages/synth/src/fixtures.test.ts checks it), and registry entries in packages/synth/src/cases/registry.ts using none(...) like PRC-24, with assertedBy naming the test files design §6 names (apps/worker/src/price/rerun.db.test.ts, apps/worker/src/price/rerun-rule.property.test.ts, apps/web/src/lib/routes/reruns-routes.db.test.ts, apps/web/e2e/pricing.spec.ts as each row is asserted; check what fixtures.test.ts requires of assertedBy, e.g. that the files exist and mention the ID — the other builders are writing those tests now with the IDs in describe names; if a check needs the files to exist, note it and run the check again at the end). Any other doc the design §7 lists (docs/product text describing acceptance; PRD wording only if the design says). Run pnpm vitest run packages/synth (under the lock) and pnpm lint:copy if it covers docs.
${SAVE('build-docs.md', 'each file changed and each check run')}
Return: files changed, the exact rows added, check results, anything left for the end.`, { label: 'build-docs', phase: 'Build' }),

  () => agent(`You take the BEFORE screenshots for a Lane B pull request (audit #10: a superseded re-run cannot be accepted). The design ${DESIGN} §8 (8.1 Before, 8.3 For the screenshot step) names the screens and states: at least the re-run page of a superseded re-run (showing the Accept button the bug offers), the compare page with Accept, the run page of a run that is not in effect (offering Re-run), the re-runs list, and the release note's re-run list if reachable; at 1280 px and 390 px, light theme.
Tool: /home/user/ops/tools/lane-b-screen-tour (read its README.md and every script; follow it exactly, including the heavy lock flock /tmp/laneb-heavy.lock for build and serve, TOUR_MINUTES, the stop file, the server-stopped check and the cleanup). Use TOUR_DIR=${SP}/screens-before and TOUR_REF=6ddd587 (the PR's base). The screens need data the default tour does not make: write a capture spec of your own at /home/user/ops/designs/lane-b-superseded-rerun/capture/superseded.spec.ts (only that path on claude/build-ops is yours; never edit the tool's own files — copy what you need into TOUR_DIR) that builds the states through the product as the repository's apps/web/e2e/pricing.spec.ts does (read it, helpers.ts, journeys.ts, prepare.ts; and how the monitor or a person creates a newer run of the month), then captures. Make the spec work against BOTH the base and the head (the after shots reuse it on the head, where the Accept button is replaced by an explanation; so locate states by navigation, not by the presence of Accept). If populating a superseded state through screens is impossible in the base, use the e2e database directly only through the app's own helpers, never invented SQL that the product could not produce.
Rules: export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH in every command. Synthetic data only. The PNGs stay in ${SP}/screens-before/png (never committed; the repository is public). Write ${SP}/screens-before/shots.json (file, route, state, width).
${SAVE('screens-before.md', 'each step done, each run with its result, the lock and server state')}
At the end: the server stopped (fuser 3297/tcp prints nothing), the database dropped, temp dirs removed, the /home/user/screens worktree left as the tool leaves it.
Return: the list of shots (file, state, width), how each state was produced, how to re-run the spec on the head (exact commands), and any problem.`, { label: 'screens-before', phase: 'Build' }),
])

phase('Web')
const web = await agent(`${COMMON}

YOUR TASK: the web side. The worker builder finished; its result (the API to use):
${typeof worker === 'string' ? worker : JSON.stringify(worker)}

Files: apps/web/src/lib/routes/pricing.ts (refusal() for the new reasons with the labels of design §8.2, canAccept and the compare page against the run acceptance replaces, the run page data; also fix the stacked doc comment above LOCATION_WAITING — "A refusal of the re-run services..." belongs on refusal()), apps/web/src/lib/pricing/queries.ts, apps/web/src/app/p/[practiceId]/pricing-runs/[runId]/page.tsx, apps/web/src/app/p/[practiceId]/pricing-runs/compare/page.tsx, apps/web/src/components/pricing/display.tsx, apps/web/src/components/action-form.tsx (the opt-in refreshOnError), apps/web/src/lib/routes/releases.ts and apps/web/src/app/p/[practiceId]/releases/page.tsx, apps/web/src/lib/routes/reruns-routes.db.test.ts (§6.5; and the existing tests the rule changes), apps/web/e2e/pricing.spec.ts (§6.6). Exact wording from design §8.2; brand rules in .claude/rules/brand.md (tokens only, status colours only for data with a label, Alert component from packages/ui, mono for codes). Authorization stays as is (mapping.edit, handler and Postgres); the audit event pricing_run_accepted stays on success.
Run, each under the lock: web typecheck, pnpm lint (or the targeted lint for apps/web), pnpm lint:copy, vitest for reruns-routes.db.test.ts and any other changed test, and the e2e pricing spec if feasible (read apps/web/playwright.config.ts and lane-b.md's e2e notes: build, stamp, E2E_PREBUILT=1; if it is too heavy now, say so — the fix round runs it).
${SAVE('build-web.md', 'each file changed, decisions and deviations, test runs and results')}
Return: files changed, tests and their results, the visible changes with exact wording as built, deviations, proposals.`, { label: 'build-web', phase: 'Web' })

phase('Check')
const check = await agent(`${COMMON}

YOUR TASK: the integration check of everything the builders did in ${WT} (git diff against 6ddd587 shows it). Builders' results:
WORKER: ${typeof worker === 'string' ? worker : JSON.stringify(worker)}
DOCS: ${typeof docs === 'string' ? docs : JSON.stringify(docs)}
WEB: ${typeof web === 'string' ? web : JSON.stringify(web)}
1. Read the whole diff against the design; list any part of the design not built, and build it (any file in the PR's scope).
2. Run, each under the lock: pnpm typecheck; pnpm lint; pnpm lint:copy; pnpm lint:logs; pnpm vitest run packages/synth; the unit tests of the changed packages; test:db for the changed db test files plus the catalog and cross-tenant tests (find their paths); tools/engine-freeze check if runnable locally (git diff --stat 6ddd587 -- packages/pricing/src ':!**/*.test.ts' must be empty). Fix what fails (in scope), and re-run.
3. Confirm: no file under packages/db/migrations or packages/pricing changed; no #42 file changed except the three shared documents; no model identifier added (grep the diff for model names).
${SAVE('build-check.md', 'each check, its result, and each fix')}
Return: the final list of changed files, each check with its result and counts, fixes made, anything still failing with why.`, { label: 'build-check', phase: 'Check' })

return { worker, docs, before, web, check }

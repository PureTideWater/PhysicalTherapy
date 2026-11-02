export const meta = {
  name: 'lane-b-unmapped-plan-build',
  description: 'Build #32 (unmapped plan) from design revision 3: core worker and contracts, docs and synth, reports, web library and routes, web screens, then integration checks and a completeness critic',
  phases: [{ title: 'Core' }, { title: 'Second' }, { title: 'Screens' }, { title: 'Check' }, { title: 'Critic' }],
}
// RESUMED 2026-11-01 ~20:00 UTC: the 5-hour limit (reset 19:10 UTC) stopped build-reports and build-weblib mid-run; the
// container's worker restarted (PostgreSQL restarted by setup-container.sh). Core and docs replay from cache; the two
// stopped agents continue from their progress files. Work so far is on co-001/wip-unmapped-plan (ae465bf9).
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/aa4b05fd-cf7b-57fe-8086-b5b14b24e00e/scratchpad'
const SAVE = (file, what) => `Save as you go: keep ${SP}/progress/${file} up to date (${what}), so an interruption loses nothing. If it already exists when you start, an earlier run of yours was interrupted: read it, trust what it holds unless the code says otherwise, and continue from where it stopped.`
const WT = '/home/user/unmapped-plan'
const DESIGN = '/home/user/ops/designs/lane-b-unmapped-plan.md'
const S = r => (typeof r === 'string' ? r : JSON.stringify(r))
const COMMON = `You are a builder for a Lane B pull request: combined audit #32, "one unmapped plan no longer freezes a whole month". The design of record is ${DESIGN}, revision 3 (read it whole first, including §13 Files to change and §14 with every disposition: revision 3's review R3-1..R3-12 and critic items C1..C12 are part of the spec). It is the spec: follow it exactly, and where the code shows it wrong, do the correct thing and record the deviation and why in your progress file and your result.
Work in the worktree ${WT} (branch co-001/unmapped-plan, at claude/build-platform 83d71fd6). Other builders edit other files in the same worktree at the same time: change ONLY the files your task names (plus new files it names). Do not commit, push, or run git commands that change the index or the tree (git diff/status are fine).
Rules:
- Every shell command starts with: export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH
- Heavy commands (pnpm install, build, typecheck, lint, vitest runs, test:db, e2e, Stryker) run one at a time under: flock /tmp/laneb-heavy.lock <command>. Keep each run targeted (one file or project) while building; the full suite runs in the fix round. Long commands run with run_in_background and are waited on by notification (no foreground sleep). Database tests use PostgreSQL 18 on port 5433 (read how the repo's test:db finds its database: package.json scripts, vitest config, packages/db test support).
- No migration, nothing under packages/db/migrations or packages/db/src/schema, no non-test change under packages/pricing (engine freeze), docs/product/unpriced-reasons.md and docs/product/domain-model.md unchanged, and no file of open PR #42 (list: ${SP}/pr42-files.txt) EXCEPT the shared documents docs/product/test-matrix.md, docs/product/reconciliation-001.md, packages/synth/src/cases/matrix.ts and registry.ts, and amendments appended to older ADRs.
- CLAUDE.md's rules: code computes every number; money is integer cents (bigint), never a float; every mutation is a server action or route handler with a Zod schema, a role check, a practice-scoped transaction (SET LOCAL app.practice_ids, app.actor_id) and an audit event; no name, date of birth, member ID, claim number or document text in a log, URL, job payload or error message (IDs only).
- Synthetic data only. No model name or identifier in any file. Match the surrounding code's comment density, naming and idiom (rich doc comments citing PRD, ADRs and test-matrix IDs; follow suit). Wording on screens exactly as the design gives it, within .claude/rules/brand.md.
- Improve as you go: an improvement inside your files goes in (record it); outside, record it as a proposal in your result.`

phase('Core')
const [core, docs] = await parallel([
  () => agent(`${COMMON}

YOUR TASK: the core (contracts, worker pricing, monitor, job registry, PHI guard). Files (design §13): packages/contracts/src/coverage.ts, load.ts, index.ts, coverage.test.ts, contracts.db.test.ts; apps/worker/src/price/create.ts, execute.ts, lines.ts, rerun.ts (comment only), coverage.ts, public.ts, price.test.ts, price.db.test.ts; apps/worker/src/monitor/plan.ts, job.ts, job.test.ts, monitor.db.test.ts; apps/worker/src/jobs/registry.ts, registry.test.ts; packages/observability/src/phi-guard.ts and phi-guard.test.ts; and any other worker or contracts file §13 assigns to these areas. Implement: the guard removed at the three sites with lines of an unmapped plan left NO_MAPPING by the existing resolver, PricingRunNothingMapped for a period with no mapped plan, coverage tp-pricing-coverage/2 with unmapped plans (lines and billed cents), the monitor's months payload (at most 240 first-of-month dates; MONITOR_MONTHS_LIMIT) with location and content waits kept, the plan_months: lock if it belongs in the worker, and the exports the web needs through price/public.ts (PRICEABLE_LINE, uncoveredMonths, PricingRunNothingMapped, and anything else §13 names). Tests with the design's IDs (MAP-06..MAP-09, PRC-29..PRC-31) in describe names as §8.3 assigns them to these files.
Run, each under the lock: typecheck of contracts and worker (find the repo's per-package typecheck), then vitest for each changed test file (unit and db projects). All must pass.
${SAVE('build-core.md', 'each file changed, decisions and deviations, test runs and results')}
Return: the exported API for the other builders (exact names, signatures, the coverage/2 type, the job payload shape), files changed, tests with pass counts, deviations, proposals.`, { label: 'build-core', phase: 'Core' }),

  () => agent(`${COMMON}

YOUR TASK: the documents and synth. Files (design §13 and §6, §8.1, §8.2): docs/adr/0075-<slug>.md (new; in the style of the newest ADRs in docs/adr, with the milestone 3 exception recorded: the founder granted it in the adoption of the combined audit, 2026-10-20 ~15:10 UTC, HANDOFF.md:473 on claude/build-ops), the amendments appended to ADRs 0028, 0030, 0035, 0039 and 0060 (dated 2026-11-01, in each file's amendment style; ADR 0039 is also amended by #42 and the schema chain: append only), docs/product/test-matrix.md (MAP-01 reworded; MAP-06..MAP-09 and PRC-29..PRC-31 exactly as §8.1 words them; MAP-10 NOT used), docs/product/PRD.md, docs/product/milestone-prompts.md, docs/product/reconciliation-001.md (the exception and the checks as §6.3 says), the README.md wording C1 names, packages/synth/src/cases/matrix.ts (mirrors test-matrix.md word for word), registry.ts (entries with assertedBy naming the test files §8.3 names), packages/synth/src/cases/pricing.ts (the MAP-06 synthetic 835 case on release 900001, module MAP=2, no new module or release), then run pnpm synth --all (under the lock) to write fixtures/synthetic/MAP-06/{remit.835,expected.json}, the other new expected.json files, and MAP-01's changed expected.json. Read packages/synth/src/fixtures.test.ts for what it requires (e.g. assertedBy files exist and mention the ID: other builders are writing those tests now; if a check needs them, note it and re-run at the end).
Run, each under the lock: pnpm vitest run packages/synth, pnpm verify-content if it covers these, pnpm lint:copy if it covers docs.
${SAVE('build-docs.md', 'each file changed and each check run')}
Return: files changed, the rows as written, check results, anything left for the end.`, { label: 'build-docs', phase: 'Core' }),
])
if (!core) throw new Error('core builder returned nothing: stop')

phase('Second')
const [reports, weblib] = await parallel([
  () => agent(`${COMMON}

The core builder finished; its result (the API to use):
${S(core)}

YOUR TASK: the worker reports. Files (design §5.5, §5.6, §13): apps/worker/src/report/content.ts, html.ts, documents.ts, documents.test.ts, report.test.ts, test-support/whole-read.ts, document-content.ts, audit-content.ts, and any other report file §13 assigns. New reports say the design's sentences from coverage/2; reports stored before keep their sentence (R3-9); respect #81's batched audit-report read (the whole-read reference report gains unmapped_plans).
Run, each under the lock: worker typecheck, vitest for each changed test file. All must pass.
${SAVE('build-reports.md', 'each file changed, decisions and deviations, test runs and results')}
Return: files changed, tests with pass counts, the sentences as built, deviations, proposals.`, { label: 'build-reports', phase: 'Second' }),

  () => agent(`${COMMON}

The core builder finished; its result (the API to use):
${S(core)}

YOUR TASK: the web library, routes and their database tests. Files (design §3.2, §4, §13): new apps/web/src/lib/pricing/mapped-plan.ts and mapped-plan.db.test.ts; apps/web/src/lib/contracts/mapping-queries.ts; apps/web/src/lib/routes/mapping.ts (practice.mapping.price_again, practice.mapping.price_waiting, the conditional monitor enqueue with months, the notices), routes/pricing.ts (including the comment at :55), routes/coverage.ts (including the comment at :33); apps/web/src/lib/billing/runs.ts (both new routes in RUN_STARTING_ROUTES; nothing in CONTINUES_STARTED_WORK; the mapping's monitor enqueue in neither list); apps/web/src/lib/pricing/queries.ts; apps/web/src/lib/dashboard/queries.ts; apps/web/src/lib/reports/documents.ts; apps/web/src/lib/http/route.ts (SampleRefs.mappedNotPricedRunId); route tests: apps/web/src/lib/routes/route-tests/world.ts, test-support/pricing-world.ts (seedMappedNotPriced), new mapping-routes.db.test.ts, pricing-routes.db.test.ts (the :232 monitor expectation), contracts-routes.db.test.ts, report-documents-routes.db.test.ts (:181 readiness), audit-e2e.db.test.ts. #50's createRerun and RERUN_ACCEPTANCE are used, in the person's name, accepted by hand; the plan_months: per-practice lock; the rerun_failed state; the to_triage list as R3-4 says; aggregates in SQL (#81). Every new route: Zod schema, role check (mapping.edit as the design says), practice-scoped transaction, audit event; per-persona route tests generated by the registry must pass. Do NOT touch apps/web/src/lib/routes/index.ts, practice.ts, settings.ts or registry.test.ts (#42 files): if route registration needs one of them, find how routes register without it, or record it.
Run, each under the lock: web typecheck, vitest for each changed and new db test file, and the route registry/per-persona tests that exercise the new routes. All must pass.
${SAVE('build-weblib.md', 'each file changed, decisions and deviations, test runs and results')}
Return: the data each page gets (function names, return types) for the screens builder, routes and their refusals, files changed, tests with pass counts, deviations, proposals.`, { label: 'build-weblib', phase: 'Second' }),
])
if (!weblib) throw new Error('web library builder returned nothing: stop')

phase('Screens')
const screens = await agent(`${COMMON}

The web library builder finished; its result (the data and routes to use):
${S(weblib)}

YOUR TASK: the screens. Files (design §5, §9, §13): apps/web/src/app/p/[practiceId]/page.tsx (home), coverage/page.tsx, pricing-runs/page.tsx, pricing-runs/[runId]/page.tsx, mapping/page.tsx, mapping/[planId]/page.tsx, mapping/actions.ts; apps/web/src/components/pricing/display.tsx, display.test.tsx, reports/documents.tsx, reports/display.tsx; new apps/web/src/components/mapping/months.tsx and months.test.tsx; e2e apps/web/e2e/mapping.spec.ts, pricing.spec.ts and any other e2e file §13 names. Use #74's ActionForm and Field for both new forms (hidden fields with data-error-name) and the Pricing runs field error under the fromMonth Field; #79's ScrollTable with StackedRows for months.tsx (stacked rows at 390 px, buttons full width); Alert from packages/ui, tokens only. Exact wording from §5, §9 and C2's notice list. Do not touch components/help.tsx, shell.tsx or any #42 file.
Run, each under the lock: web typecheck, pnpm lint for apps/web (or the targeted lint), pnpm lint:copy, vitest for each changed component test. E2E: write the specs; running them needs build, stamp and E2E_PREBUILT=1 (read apps/web/playwright.config.ts) — run the two changed specs if feasible under the lock, else say so (the fix round runs them).
${SAVE('build-screens.md', 'each file changed, decisions and deviations, test runs and results')}
Return: files changed, tests and results, the visible changes with exact wording as built, deviations, proposals.`, { label: 'build-screens', phase: 'Screens' })

phase('Check')
const check = await agent(`${COMMON}

YOUR TASK: the integration check of everything the builders did in ${WT} (git -C ${WT} diff 83d71fd6 and git status show it). Builders' results:
CORE: ${S(core)}
DOCS: ${S(docs)}
REPORTS: ${S(reports)}
WEBLIB: ${S(weblib)}
SCREENS: ${S(screens)}
1. Read the whole diff against design §13 and the dispositions; list any part not built, and build it (any file in the PR's scope).
2. Run pnpm synth --all again (under the lock) so every fixture matches; then exactly: export PATH=...; pnpm exec tsx tools/screening-capacity/watched.ts --write and confirm tools/screening-capacity/watched-paths.txt is unchanged (the design says it stays unchanged; if it changes, keep the generator's output and record why).
3. Run, each under the lock: pnpm typecheck; pnpm lint; pnpm lint:copy; pnpm lint:logs; pnpm verify-content; pnpm vitest run packages/synth; pnpm test (unit + property); the changed db test files plus the catalog and cross-tenant tests and the route registry per-persona tests (find their paths). Fix what fails (in scope) and re-run.
4. Confirm: git -C ${WT} diff --stat 83d71fd6 -- packages/pricing/src ':!**/*.test.ts' is empty; nothing under packages/db/migrations or packages/db/src/schema changed; docs/product/domain-model.md and unpriced-reasons.md unchanged; no #42 file changed except the shared documents (compare git diff --name-only against ${SP}/pr42-files.txt); no model identifier in the diff; no PHI or identifier in a log, URL, job payload or error message.
${SAVE('build-check.md', 'each check, its result, and each fix')}
Return: the final list of changed files, each check with its result and counts, fixes made, anything still failing with why.`, { label: 'build-check', phase: 'Check' })

phase('Critic')
const critic = await agent(`${COMMON}

YOUR TASK: completeness critic. Compare the built diff (git -C ${WT} diff 83d71fd6, plus untracked files) against design ${DESIGN} section by section: every §2-§5 rule, every §8.1 row with its assertedBy test existing and naming the ID, every §9 wording on its screen, every §14 disposition (R1..R16, R3-1..R3-12, C1..C12) honoured. The integration check returned: ${S(check)}
For each gap you verify, fix it in scope, then re-run the affected targeted tests under the lock and pnpm typecheck. ${SAVE('build-critic.md', 'each gap, its fix, and the test results')}
Return: the gaps found, what you changed, the test results, and anything left for the fix round.`, { label: 'build-critic', phase: 'Critic' })

return { core, docs, reports, weblib, screens, check, critic }
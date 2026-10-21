export const meta = {
  name: 'pr6b2-build',
  description: 'PR 6b-2 (the practice pricing location, pricing settings at onboarding, ZIP+4 in the screening): L1 migration and database first, then L2 worker/capacity and L3 web/e2e in parallel, then the draft PR stacked on 6b-1',
  phases: [
    { title: 'Database', detail: 'L1: the migration, packages/db, the domain model, exception.json' },
    { title: 'Build', detail: 'L2 worker, contracts and capacity; L3 web and e2e, in parallel' },
    { title: 'Draft PR', detail: 'merge 6b-1 if it moved, scope check, domain-model summary, draft PR' },
  ],
}

const WT = '/home/user/pr6b2'
const BR = 'co-001/pr-06b-pricing-location'
const BASE = 'co-001/pr-06b-zip4-engine'
const SP = '/tmp/claude-0/-home-user/e7bf8d14-3b4c-5e38-9cea-a1f92a95083e/scratchpad'
const DESIGN = '/home/user/ops/designs/pr6b-zip4-settings.md'
const PLAN = '/home/user/ops/designs/pr6b-plan.md'
const ATTR = `End every commit message with these two lines, after a blank line:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MXvjcgRoTSrfU3V7a5MShH`

const CONTEXT = `Repository PureTideWater/PhysicalTherapy (PaidWhole). Worktree ${WT}, branch ${BR}, cut from ${BASE} at 210a043 (PR 6b-1, draft #35: the engine's ZIP+4 lookup, record type locality_map_plus_four, synthetic release 900006, tools/engine-freeze; another workflow is reviewing and fixing it in /home/user/pr6b1 right now, so it may gain commits: never touch /home/user/pr6b1, its databases tp_pr6b1_* or e2e ports 48xx). pnpm install is done in ${WT}.
This is PR 6b-2 of four (the plan's 6b-2): the practice's pricing location, pricing settings at onboarding (audit #33), the minimal practice_site record (#16), ZIP+4 in the screening, the screening's content span (#7's screening part) and #31's ZIP+4 key. It has ONE migration, 20261105090000_pricing_location_and_zip_plus_four.sql, and regenerates docs/product/domain-model.md for the founder's SHA-256 approval (never write the approval line, approvers.json or anything that approves).
The founder ruled on 2026-10-21 (~22:30 UTC; /home/user/ops/HANDOFF.md, "Founder rulings of 2026-10-21 ~22:30 UTC: PR 6b's 13 questions"): every recommended answer accepted. For this PR: Q2 (a) practice_site, one per practice, undated, edited in Settings > Pricing settings; Q3 (a) widen rule_record's type CHECK by locality_map_plus_four (a granted exception, named in tools/engine-freeze/exception.json); Q5 (a) the permission pricing_settings.set for practice_admin, billing_manager and firm_principal, reviewer denied (a granted exception before PR 14; a security review follows); Q6 (a) Medicare rows in quarters outside the loaded content left out and counted, and a request that bypasses the browser refused; Q11 (a) no wording change for the ZIP+4 in what the pages say is kept; Q12 the recommended wording (put every new prospect-facing sentence, word for word, in the PR body for the founder and counsel). Record the rulings this PR builds in ADR 0064's amendment and ADR 0062, dated 2026-10-21.
Read these sections, not whole documents: the plan ${PLAN} lines 126-162 (6b-2's contents and migration rows 1-9), 241-247 (builders and file ownership), 453-521 (acceptance; 6b-2's proofs at 486-500), 544-658 (section 5: disagreements resolved and the deltas that apply to 6b-2); the design ${DESIGN} sections 3.5-3.6 (lines 327-347), 4 (394-689), 5 (690-816), 6 (817-861), 7 (862-965), the 6b-2 rows of 8 (966-1103), 9 (1104-1118: PRC-23, PRC-24, SCR-15, SCR-16), 10 (1119-1168) and 14 (the review, 1231 on). Where the design and the code disagree, the code is the fact; follow the design's intent and report the difference.
Environment: export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH. PostgreSQL 18 on 5433 (postgres:test, socket /tmp): name databases tp_pr6b2_<role>_<n> and drop them when done. E2e ports 4901-4909 only. Logs under ${SP}/pr6b2/.
Rules that bind this run:
- CLAUDE.md, in full: forced RLS and the PHI registry for every table that can hold PHI, practice_id NOT NULL, the application role owns nothing and gains no BYPASSRLS, every mutation a Zod schema plus a role check plus a practice-scoped transaction plus an audit event, checked in the handler AND in Postgres; no name, address or document text in a log, job payload, URL or error.
- No change under packages/pricing/src (the freeze tool fails any from this PR on), to existing golden files, releases 900001-900006, content/releases/**, tools/verify-content, ledger tables, or any applied migration. The only DDL on a rule table is the one CHECK widening of Q3 (a).
- The edit hooks in .claude/settings.json are live. protect-content refuses edits to migrations: for THIS PR's new migration only, use the route .claude/skills/new-migration/SKILL.md documents (the marker .claude/.allow-protected-edit created by a shell command for the edit and removed in a trap; never committed; never for an applied migration). Never bypass any other hook.
- You may share ${WT} with another builder. Stage only your own paths and commit with 'git commit -m "..." -- <paths>'; retry if the index is locked. Push after each commit with 'git push -u origin ${BR}', retrying after 2, 4, 8 and 16 s on a network error; if rejected because the other builder pushed first, 'git pull --no-rebase origin ${BR}' and push again. Never force, never --no-verify; a refused push is fixed by rewriting only your unpushed commits, as the hook says.
- Commit messages follow the repository's style (lowercase area prefix, one sentence saying what changes and why, naming the audit item and the founder's ruling). ${ATTR}
- Builders check what they touch: pnpm typecheck (whole repository), pnpm lint, and the unit and db tests of the files they changed. No full test:db or e2e run (CI on the draft PR runs those; the fix round runs the full suite).
- Never skip, disable or loosen a test. Failures in another builder's files are reported, not fixed.
- Report briefly: every check with its command and result, every open item.`

const BUILD = { type: 'object', properties: {
  summary: { type: 'string' },
  head: { type: 'string' },
  interfaces: { type: 'string', description: 'exact SQL function signatures, grants, columns, statuses and error codes other builders call' },
  files: { type: 'array', items: { type: 'string' } },
  checks: { type: 'array', items: { type: 'object', properties: { command: { type: 'string' }, passed: { type: 'boolean' }, note: { type: 'string' } }, required: ['command', 'passed'] } },
  open_items: { type: 'array', items: { type: 'string' } },
}, required: ['summary', 'head', 'files', 'checks', 'open_items'] }
const PR = { type: 'object', properties: {
  pr_number: { type: 'number' }, head: { type: 'string' }, url: { type: 'string' }, base: { type: 'string' },
  domain_model_sha256: { type: 'string' }, scope_ok: { type: 'boolean' },
  checks: { type: 'array', items: { type: 'object', properties: { command: { type: 'string' }, passed: { type: 'boolean' }, note: { type: 'string' } }, required: ['command', 'passed'] } },
  open_items: { type: 'array', items: { type: 'string' } },
}, required: ['pr_number', 'head', 'base', 'domain_model_sha256', 'scope_ok', 'checks', 'open_items'] }

phase('Database')
const l1 = await agent(`${CONTEXT}

You are builder L1, the database. You own: packages/db/migrations/20261105090000_pricing_location_and_zip_plus_four.sql (new); packages/db/src/** (schema/{tenancy,screening,pricing}.ts, authz/permissions.ts, catalog.ts, row-factory.ts, tenant-world.ts with createPracticeWithLocation, seed.ts, and the db tests location.db.test.ts (new), screening, migrate, access, documents, hardening, crypto/practice-keys and identity); packages/db/domain-model/**; docs/product/{domain-model,data-dictionary}.md; tools/engine-freeze/exception.json; and ADR 0064's amendment (location, settings, waits, split, screening ZIP+4, content span).
1. Write the migration exactly as the plan's rows 1-9 and the design's section 6 say, following .claude/skills/new-migration/SKILL.md: the rule_record type CHECK widened to the 17 values; practice_site with its CHECKs, unique index, forced RLS, tenant and owner policies, phi_table_registry row, SELECT to tp_app, rules, no-truncate, required() and the deferred constraint trigger practice_has_site, and the backfill; practice.zip deprecated with INSERT and UPDATE revoked from tp_app; role_permission rows for pricing_settings.set (Q5 (a)); locality_status(), practice_location_status(), practice_set_location(), console_set_practice_location(), with console_practice_settings() and console_set_practice_settings() replaced; the split renamed to place_of_service_split with place_of_service_split_in_force() and pricing_run_split(uuid) as SECURITY DEFINER granted to tp_app, the console split functions and screening_status() replaced; pricing_run.place_of_service_split_id and pricing_run_rules() replaced (the pin and the missing-location guard); the screening objects (screening_prospect.zip_plus_four, the three outside_content_* columns on screening_upload, submit_screening and operator_screening_claim dropped and created, the replaced read, records, validators and labels version, screening_zip_status dropped); rule_release_content_span(integer) with its FILTER, and screening_band_days(text). Every created function followed by REVOKE ALL ... FROM PUBLIC and exactly its grant; SET search_path on every definer; the header's six deploy-window effects. Safe with the previous image running, or say exactly why not.
2. Drizzle schema, permissions.ts (and its equality test with role_permission), catalog.ts lists (only lists grow), the row factory and tenant world (the cross-tenant test must cover practice_site; extend the factory, never skip the table), seed.ts, and the db tests the design's section 8 lists for the database, including a closed-list test holding RULE_RECORD_TYPES equal to the CHECK's 17 values and privileges checked by exact name.
3. Rewrite tools/engine-freeze/exception.json for this PR only: no engine files, no golden files, and one rule_table_ddl entry naming this migration's CHECK statement exactly as tools/engine-freeze/check.ts prints it; run the check against the merge base with ${BASE} and show it passes with exactly that statement.
4. Regenerate docs/product/domain-model.md (pnpm db:domain-model --out --strict on a freshly migrated PostgreSQL 18 database), read its Cross-checks block and report any column or table difference it lists (a false one is a bug to fix, as PR 6's was); update data-dictionary.md; amend ADR 0064 and record the founder's answers Q2, Q3, Q5, Q6 and Q11 (a) of 2026-10-21.
5. Checks: pnpm typecheck; pnpm lint; packages/db unit; the db tests above, the catalog and cross-tenant tests included, on a fresh PG 18 database; pnpm -s db:domain-model --check (it regenerates the committed text exactly; --require-approval is expected to fail until the founder signs).
Commit, push, and return your report. In "interfaces", give L2 and L3 exactly what they call: every function's signature, its grant and caller role, the statuses and error codes, the new columns, and the labels version.`, { label: 'build: L1 database', phase: 'Database', schema: BUILD })
if (!l1) return { error: 'L1 returned nothing' }

phase('Build')
const L1INFO = `L1 has pushed the migration and the database layer (head ${l1.head}). Run git pull --no-rebase origin ${BR} first. L1's interfaces: ${String(l1.interfaces || '').slice(0, 12000)}
L1's open items: ${JSON.stringify(l1.open_items).slice(0, 3000)}`
const [l2, l3] = await parallel([
  () => agent(`${CONTEXT}

${L1INFO}

You are builder L2, worker, contracts and capacity. You own: packages/contracts/src/{location,index}.ts; apps/worker/src/price/{settings,create,execute,impact,causes,diff,keyed-release}.ts; apps/worker/src/monitor/{plan,job}.ts; apps/worker/src/jobs/registry.ts; apps/worker/src/screening/{adapter,job,format}.ts; apps/worker/src/screening/test-support/legacy-release.ts (the one identifier the design names; legacy-adapter.ts stays hash-pinned and untouched); the worker test files of the design's sections 4.7 and 8; packages/synth/src/release/scale.ts; tools/screening-capacity/{uploads,run,oracle}.ts; docs/product/test-matrix.md rows PRC-23, PRC-24, SCR-15 and SCR-16 (with packages/synth's registry and matrix.ts if its fixtures test requires them); and ADR 0039's amendment. Do not touch apps/web or packages/db (L3 and L1 own them).
Build the design's worker parts: months that wait as location_not_ready (no run created while the location is missing; a run whose line stops on the location fails as location_not_ready with no lines kept, and the month is not re-created every day; fixed-fee months price as today), re-planned when the location is saved; the place-of-service split pinned on each run and read by the worker as tp_app through pricing_run_split; the re-run diff naming the setting (records read in only one run skipped only for the locality and GPCI types and only when the ZIP or ZIP+4 changed); the screening's ZIP+4 and its keyed read including locality_map_plus_four (the sixth keyed type), the content span with out-of-span rows left out and counted (Q6 (a)); the split-ZIP capacity upload checked against a whole-release oracle while the frozen oracle keeps the five-digit uploads; the 50,000-row test's Medicare rows moved into 2026 with the row count still 50,000; and the scale release's ZIP9 size and keyed-read time reported (open item O8).
Checks: pnpm typecheck; pnpm lint; apps/worker unit and the worker db tests you changed (run as tp_app where the design says); packages/synth; packages/contracts; tools/screening-capacity unit. Commit, push, return your report.`, { label: 'build: L2 worker and capacity', phase: 'Build', schema: BUILD }),
  () => agent(`${CONTEXT}

${L1INFO}

You are builder L3, web and e2e. You own: the apps/web/src/** files of the design's section 7 (lib/zip.ts; routes/{settings,console,practice}.ts; console/practice-settings.ts; screening/{routes,labels,messages,content-span}.ts; retention.ts only if Q11's answer needed it, which it does not (Q11 (a)); the components and pages listed; the web db tests and test-support; screening.large.db.test.ts) and apps/web/e2e/**, and ADR 0062's amendment (the design's section 10, its twelve edits, recording the founder's answers Q2, Q6, Q11 (a) and Q12 of 2026-10-21, and replacing ADR 0062's "keep refusing" ZIP+4 ruling text with what the founder ruled on 2026-10-18 at 11:47 UTC). Do not touch apps/worker or packages/db (L2 and L1 own them).
Build the design's web parts: Settings > Pricing settings (an administrator, billing manager or firm principal sets the location: Zod schema, the pricing_settings.set role check in the handler AND Postgres through practice_set_location, a practice-scoped transaction, an audit event); the console's location setter; practice creation requiring the five-digit ZIP with its status in the release in force; Getting started's "Confirm your billing ZIP"; the location statuses in plain words (known; needs ZIP+4; not loaded for that date, which never asks the customer to change anything); the screening's ZIP+4 input, its refusal messages and the left-out-quarters sentences and counts (Q6 (a)); the new labels version; every practice the tests insert going through the one helper; the e2e journey of section 4.7 (a practice created with no seeded settings reaches a priced month; a flagged ZIP waits and creates no run each day) and prepare.ts approving the same split the screening spec approves. Accessibility: every new control labelled, errors announced, works at 390 px.
Checks: pnpm typecheck; pnpm lint; pnpm lint:copy; apps/web unit and the web db tests you changed; the new e2e journey spec alone on port 4901 (not the whole e2e suite). Commit, push, return your report, with every new prospect- or customer-facing sentence word for word.`, { label: 'build: L3 web and e2e', phase: 'Build', schema: BUILD }),
])
if (!l2 || !l3) return { error: 'a builder returned nothing', l1, l2, l3 }

phase('Draft PR')
const pr = await agent(`${CONTEXT}

Open PR 6b-2 as a DRAFT so CI runs while the reviewers work. Builders' reports: L1 ${JSON.stringify(l1).slice(0, 5000)} L2 ${JSON.stringify(l2).slice(0, 4000)} L3 ${JSON.stringify(l3).slice(0, 5000)}
1. In ${WT}: git pull --no-rebase origin ${BR}; git fetch origin ${BASE}; if ${BASE} has moved past 210a043, merge it with a merge commit (never rebase), resolving any conflict keeping both sides' intent. If anything changed, regenerate the domain model on a fresh PG 18 database, rerun the freeze check (tools/engine-freeze/check.ts against the merge base with ${BASE}) and pnpm typecheck and pnpm lint. git status is clean; the branch is pushed.
2. Scope: git diff --name-only $(git merge-base origin/${BASE} HEAD) lists only files the three builders own (the plan's lines 241-247), the one migration and nothing under packages/pricing/src; report any other path with why. pnpm -s db:domain-model --check passes (regenerates the committed text exactly); report the document's SHA-256 as the generator prints it.
3. Create the draft pull request with base ${BASE} (stacked; GitHub retargets it to claude/build-platform when 6b-1 merges) using the GitHub MCP tool create_pull_request (ToolSearch "select:mcp__github__create_pull_request"). Title: "PR 6b-2: the practice's pricing location, pricing settings at onboarding, and ZIP+4 in the screening (audit #33, #16, #7; ADR 0064, 0062)". The body opens with the output of 'pnpm -s db:domain-model --summary-since origin/claude/build-platform' (CLAUDE.md), then every section of .github/pull_request_template.md on origin/main (git show origin/main:.github/pull_request_template.md) answered from the reports: what changes and why; the founder's answers it builds and the granted exceptions (Q3 (a) rule_record CHECK, Q5 (a) the permission before PR 14); the schema change and that the founder's SHA-256 approval is needed after the review round (no approval line now); every new prospect- and customer-facing sentence word for word (Q12: the founder, then counsel); the checks run; what the reviewers should look at (a security review is required for Q5); the open items. End the body with:

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01MXvjcgRoTSrfU3V7a5MShH
Return the PR number, head, URL, base, the domain model's SHA-256, the scope result and the open items.`, { label: 'draft PR 6b-2', phase: 'Draft PR', schema: PR })
return { l1, l2, l3, pr }

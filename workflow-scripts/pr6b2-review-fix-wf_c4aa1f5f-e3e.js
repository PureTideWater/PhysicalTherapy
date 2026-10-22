export const meta = {
  name: 'pr6b2-review-fix',
  description: 'PR 6b-2 (#36, pricing location, onboarding, ZIP+4 in the screening): three independent adversarial reviews (security and tenancy; pricing runs; screening, wording and accessibility), then one fix round with the full local suite and one push',
  phases: [
    { title: 'Review', detail: 'three default workflow agents with the repository checklists, each in a fresh clone' },
    { title: 'Fix', detail: 'verify each finding, fix at the root, the founder ruling on PR 5, full suite once, push, PR body, approval summary' },
  ],
}

const WT = '/home/user/pr6b2'
const BR = 'co-001/pr-06b-pricing-location'
const HEAD = '3013666938a08d1971923980e8c1ca1e2552b2d9'
const SP = '/tmp/claude-0/-home-user/e7bf8d14-3b4c-5e38-9cea-a1f92a95083e/scratchpad'
const DESIGN = '/home/user/ops/designs/pr6b-zip4-settings.md'
const PLAN = '/home/user/ops/designs/pr6b-plan.md'
const BUILDLOG = '/tmp/claude-0/-home-user/e7bf8d14-3b4c-5e38-9cea-a1f92a95083e/tasks/wazgrgdht.output'
const MERGELOG = '/tmp/claude-0/-home-user/e7bf8d14-3b4c-5e38-9cea-a1f92a95083e/tasks/waueqd1gk.output'
const ATTR = `End every commit message with these two lines, after a blank line:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MXvjcgRoTSrfU3V7a5MShH`

const CONTEXT = `Repository PureTideWater/PhysicalTherapy (PaidWhole). PR 6b-2 is draft pull request #36 into claude/build-platform (base 510a26d, where PR 6b-1, the engine's ZIP+4 lookup, is merged), branch ${BR}, head ${HEAD}, worktree ${WT}. It adds the practice's pricing location (practice_site, audit #16's minimal record), pricing settings at onboarding (#33), months that wait for the location, the place-of-service split pinned on each run, ZIP+4 in the screening, the screening's content span (#7's screening part) and #31's ZIP+4 key. One migration, packages/db/migrations/20261105090000_pricing_location_and_zip_plus_four.sql (unmerged, so it may still change), and docs/product/domain-model.md regenerated at SHA-256 c3065bf937efd4ada6a034b48afe474176cd0b6fa39b6354dbab5c2fadf50f9a, not yet approved (CI's only red is that approval case).
The founder's rulings it builds (2026-10-21; /home/user/ops/HANDOFF.md "Founder rulings of 2026-10-21 ~22:30 UTC"): Q2 (a) practice_site, one per practice, undated, edited in Settings > Pricing settings; Q3 (a) the rule_record CHECK widened by locality_map_plus_four (a granted exception, named in tools/engine-freeze/exception.json); Q5 (a) the permission pricing_settings.set for practice_admin, billing_manager and firm_principal, reviewer denied (a granted exception before PR 14, which requires this security review); Q6 (a) Medicare rows in quarters outside the loaded content left out and counted, and refused when a request bypasses the browser; Q11 (a) no wording change for the ZIP+4 in what the pages say is kept; Q12 the recommended wording, every new prospect- or customer-facing sentence shown word for word to the founder and then counsel.
Sources (sections, not whole documents): the plan ${PLAN} lines 126-162, 241-247, 453-545, 544-658; the design ${DESIGN} sections 3.5-3.6 (327-347), 4 (394-689), 5 (690-816), 6 (817-861), 7 (862-965), 8 (966-1103), 9-10 (1104-1168); the build report ${BUILDLOG} and the merge report ${MERGELOG} (JSON; read their open items).
Environment: export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH. PostgreSQL 18 on 5433 (postgres:test, socket /tmp); name databases tp_pr6b2_<role>_<n> and drop them when done. E2e ports 4901-4909. The container restarts now and then: if PostgreSQL stops answering, start it with su postgres -c "/opt/pg18/bin/pg_ctl -D /root/pgdata18 -o '-p 5433 -k /tmp' -l /tmp/pg18.log start" and carry on.
Rules: CLAUDE.md in full (forced RLS and the registry, practice_id, the application role owns nothing and gains no BYPASSRLS, every mutation a Zod schema, a role check, a practice-scoped transaction and an audit event, checked in the handler AND in Postgres, no name, address, ZIP or document text in a log, job payload, URL or error); the engine freeze (nothing under packages/pricing changes); existing golden files and releases untouched; no applied migration edited; the edit hooks in .claude/settings.json are live and never bypassed; never skip, disable or loosen a test; never force-push or --no-verify.`

const REVIEW = { type: 'object', properties: {
  verdict: { type: 'string' },
  findings: { type: 'array', items: { type: 'object', properties: {
    title: { type: 'string' }, severity: { type: 'string', enum: ['blocking', 'should_fix', 'nit'] },
    file_line: { type: 'string' }, failure_path: { type: 'string', description: 'a concrete input, role or sequence that produces the wrong result' },
    evidence: { type: 'string', description: 'the command you ran or the code you read that shows it' }, fix: { type: 'string' } },
    required: ['title', 'severity', 'file_line', 'failure_path', 'evidence', 'fix'] } },
  checked: { type: 'array', items: { type: 'string' } },
}, required: ['verdict', 'findings', 'checked'] }
const FIX = { type: 'object', properties: {
  summary: { type: 'string' }, head: { type: 'string' },
  domain_model_sha256: { type: 'string' },
  dispositions: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, real: { type: 'boolean' }, action: { type: 'string' }, commit: { type: 'string' } }, required: ['title', 'real', 'action'] } },
  checks: { type: 'array', items: { type: 'object', properties: { command: { type: 'string' }, passed: { type: 'boolean' }, note: { type: 'string' } }, required: ['command', 'passed'] } },
  wording: { type: 'string', description: 'every new prospect- or customer-facing sentence, word for word, with where it shows' },
  approval_summary: { type: 'string', description: 'the plain-language approval summary for the founder, in markdown' },
  open_items: { type: 'array', items: { type: 'string' } },
}, required: ['summary', 'head', 'domain_model_sha256', 'dispositions', 'checks', 'wording', 'approval_summary', 'open_items'] }

const LENSES = [
  { key: 'security', method: '.claude/agents/security-reviewer.md', text: `Lens: security, tenancy and privacy (required by Q5 (a)). Attack:
- pricing_settings.set: the role_permission rows, permissions.ts and its equality test; every route that sets or confirms the location checks it in the handler AND Postgres refuses the same call (practice_set_location and the confirm path) for a reviewer, a viewer, a firm user without a grant, another practice's user and a support grant; the console's console_set_practice_location under organization.manage; an audit event on every change.
- practice_site: FORCE RLS, the tenant and owner policies, the phi_table_registry row, the catalog lists (only grown), the cross-tenant probes, the no-truncate and rules triggers, the deferred practice_has_site constraint, the backfill; whether practice.zip's revoked writes leave any path that still writes it.
- Every new or replaced SECURITY DEFINER function (locality_status, practice_location_status, practice_set_location, console_set_practice_location, console_practice_settings, console_set_practice_settings, place_of_service_split_in_force, pricing_run_split, the console split functions, screening_status, rule_release_content_span, screening_band_days, submit_screening, operator_screening_claim and the other screening functions): SET search_path, REVOKE ALL FROM PUBLIC and exactly its grant, and that a caller cannot read or write another practice's location, split or run through it (try it as tp_app with one practice in app.practice_ids and another's id). The builder narrowed the location guard to the caller's scope: confirm it leaks nothing and refuses nothing it should allow.
- The screening: submit_screening's 28 arguments (the ZIP+4, the three outside_content counts and their bounds), rate limits, what an abusive request can store or learn; no ZIP, ZIP+4, address or name in a log, job payload (the monitor job's {practice_id, request_id} payload included), URL or error; retention of the ZIP+4 with the prospect (30 days) and of the counts.
Run the db tests that prove each rule and craft the probes that would break them.` },
  { key: 'pricing', method: '.claude/agents/payment-engine-reviewer.md and .claude/rules/money-and-contracts.md (read .claude/rules/ for the money rules)', text: `Lens: pricing runs, waits and the split. Attack:
- Months that wait: no run is created while a practice has no location; a run whose line stops on the location fails location_not_ready with no lines kept and is not re-created every day; fixed-fee months price as before; saving the location queues the monitor so waiting months price with no hand re-run; no_locality_plus_four (6b-1's content-gap detail) never fails a run or blames the practice. Look for a month that never prices, prices twice, or prices at the wrong location.
- The split: pinned on each run at insert, read by the worker as tp_app through pricing_run_split, immutable afterwards (CLAUDE.md rule 3: pricing_run and priced_line are immutable); a practice's own place-of-service setting wins over the default split; a correction to the split reaches the next run only.
- The re-run diff and causes: a location change names the setting with both values; records read in only one run are skipped only for the location record types and only when the ZIP or ZIP+4 changed, never hiding a release change; PRC-19 still lists exactly the changed lines; PRC-16 recompute still equals every stored amount; AUDIT-01 still reproduces.
- The screening's pricing: the keyed release read includes locality_map_plus_four (RELEASE_READ_OUTSIDE_FETCH otherwise), the ZIP+4 reaches the engine only through the unchanged price(), the content span counts and the left-out rows, figures in bigint cents, the oracle comparisons (the frozen oracle for five-digit uploads, the whole-release oracle for the split-ZIP upload).
- Unpriced reasons unchanged; no change under packages/pricing; golden and releases untouched.
Run the worker and db tests that prove each rule and write the probes that would break them.` },
  { key: 'screening', method: '.claude/rules/ (brand and copy rules) and the copy lint (tools/brand-copy)', text: `Lens: the screening and the practice's experience, wording and accessibility. Attack:
- Every new prospect- and customer-facing sentence: plain words, honest, never blaming the practice for a gap in PaidWhole's content (no_locality_plus_four, locality_not_loaded), never asking the practice to change a correct ZIP, no forbidden term (the copy lint's list: owed, underpaid, recovered without posted or deposited), consistent with what the pages already promise (decision 7's list of what is kept; Q11 (a): the ZIP+4 needs no new wording). List each sentence word for word with where it shows, for the founder and counsel (Q12); flag any that overclaims or confuses, with a better wording.
- Settings > Pricing settings, Getting started's "Confirm your billing ZIP", the coverage card for months waiting on the location, the console's location form (the builder noted the console cannot read a practice's ZIP+4 and that the re-run diff cannot name the split's approval date): is each screen complete and correct for each role, and what is the best fix?
- The screening's ZIP field: asks for the ZIP+4 only where Medicare needs it, keeps the chosen file, says plainly when PaidWhole has not loaded the list; the left-out-quarters counts and sentences; the result page with outside_content; the labels version pinned.
- Accessibility at 390 px and with a keyboard and screen reader: every new control labelled, errors announced and tied to their field, focus order, no information by colour alone.
- The e2e journeys (a practice created with no seeded settings reaches a priced month; a flagged ZIP waits and creates no run each day; the screening's SCR-15) prove what they claim.
Run the web tests and the relevant e2e specs (ports 4905-4909) where they show it.` },
]

phase('Review')
const reviews = await parallel(LENSES.map(l => () => agent(`${CONTEXT}

You are an independent adversarial reviewer of PR #36 at ${HEAD}. Clone it fresh: git clone -q -b ${BR} /home/user/PhysicalTherapy ${SP}/pr6b2/review-${l.key} (check git rev-parse HEAD equals ${HEAD}; if not, git checkout ${HEAD}), then pnpm install --frozen-lockfile there. Change nothing in ${WT}, push nothing, post nothing. Use ${l.method} as your review method.

${l.text}

Report only findings with a concrete failing path, each with its evidence (a command you ran, or file:line you read) and the fix; list what you checked and found sound. Severity: blocking, should_fix or nit. Finish every lead you open, call StructuredOutput with your findings (an empty list if there are none) before you stop, and delete your clone and databases at the end.`, { label: `review: ${l.key}`, phase: 'Review', schema: REVIEW })))
if (reviews.filter(r => r && Array.isArray(r.findings)).length < LENSES.length) {
  log('A review returned nothing; refusing to go on unreviewed.')
  return { error: 'a review returned nothing', reviews }
}
const findings = reviews.flatMap((r, i) => r.findings.map(f => ({ ...f, lens: LENSES[i].key })))
log(`${findings.length} findings from three reviews`)

phase('Fix')
const fix = await agent(`${CONTEXT}

You run PR 6b-2's fix round in ${WT} (branch ${BR}, head ${HEAD}). git pull --no-rebase origin ${BR} first; if claude/build-platform has moved past 510a26d, merge it with a merge commit.
1. The three reviews' findings are below. Each is a claim to verify yourself, not an order. Fix every real one at its root, with a test that fails before the fix where a test can show it; say why for any that is not real. A change to the unmerged migration goes through the marker route .claude/skills/new-migration/SKILL.md documents (never committed; never for an applied migration).
Findings: ${JSON.stringify(findings, null, 1).slice(0, 60000)}
2. Also:
- The founder's ruling of 2026-10-22 on PR 5's trigger rule_release_withdrawal_pricing_current_lock (statement 22 of the applied migration 20261103090000_deadline_verification_and_export_attestation.sql): ACCEPTED as an exception to reconciliation-001's "No DDL touches rule_release, rule_record or rule_release_withdrawal". The founder asked the build to accept it if it adds value; it does. It is a BEFORE INSERT trigger whose function, pricing_current_change_lock(), only takes a transaction-scoped advisory lock (pricing_current:withdrawal). It writes nothing and changes no rule data. It serializes approval, the export guard, the attestation and the submission's flag with a release's withdrawal, so no packet is approved or exported as current while the release it was priced under is being withdrawn (audit #4). Removing it would reopen that race. Record it in reconciliation-001, replacing the "departure ... put to the founder" entry with a "Ruled by the founder, Tyler Williams, on October 22, 2026" entry, in ADR 0061 (an amendment naming the trigger and why), and in ADR 0064, where its "Revisit when" item is now settled. Change no migration for it.
- The builders' open items (${BUILDLOG}, ${MERGELOG}): practice users cannot read the split's approval date for the re-run diff, and the console cannot read a practice's ZIP+4. Build the best fix for each (for example, the date returned by pricing_run_split, and the ZIP+4 by console_practice_settings, each with its grant and a test). Also fix SCR-08's wording in docs/product/test-matrix.md (and the matrix and registry) now that S1-2 is compared with the whole-release oracle. Leave L3's "before {Q}" result wording as built, listed for the founder and counsel.
- If the schema changes, regenerate docs/product/domain-model.md on a fresh PostgreSQL 18 database (pnpm db:domain-model --out --strict), read its Cross-checks block (a false difference is a bug to fix), and report the new SHA-256. Never write the approval line or approvers.json.
3. Then run the full local suite ONCE on the final tree and record each command and result: pnpm typecheck; pnpm lint; pnpm lint:copy; pnpm lint:logs; pnpm check:fixtures; pnpm synth --all with git diff --exit-code fixtures/synthetic; PR_NUMBER=36 pnpm -s exec tsx tools/engine-freeze/check.ts $(git merge-base origin/claude/build-platform HEAD); CI=true ENGINE_FREEZE_BASE=$(git merge-base origin/claude/build-platform HEAD) pnpm test; pnpm test:golden; pnpm test:oracle with TP_ORACLE_PYTHON=/opt/py312-ci/bin/python; pnpm verify-content; a fresh PostgreSQL 18 database migrated from empty, then pnpm test:db against it (only the approval case may fail); pnpm -s db:domain-model --check; pnpm test:e2e on ports 4901-4909; pnpm build; actionlint. If a changed file is in a Stryker mutate list (stryker.config.mjs, stryker.verifier.config.mjs), run Stryker on those files and report the score. CI's capacity workflow measures the capacity; do not run the harness locally. A failure is fixed at its root and the affected checks rerun.
4. Commit in the repository's style (lowercase area prefix; one sentence saying what changes and why). ${ATTR} Push ONCE at the end: git push -u origin ${BR}, retrying after 2, 4, 8 and 16 s on a network error; never force, never --no-verify; a refused push is fixed by rewriting only unpushed commits.
5. Update #36's body with the GitHub MCP tool update_pull_request (ToolSearch "select:mcp__github__update_pull_request"): keep the template's sections and the domain-model summary at the top (regenerate it with pnpm -s db:domain-model --summary-since origin/claude/build-platform if the schema changed), add a "Review round" table (every finding, real or not, what was done, its commit) and the full suite's results, list every new prospect- and customer-facing sentence word for word (Q12), state the domain model's SHA-256 awaiting approval, and keep the ending lines. Keep it a draft.
6. Return, in approval_summary, a plain-language summary for the founder in markdown (subagents cannot write report files): what 6b-2 changes for a practice and a prospect, the schema in plain words (each new table, column, function and permission, and why), what proves it (with numbers), what changed in this round, the SHA-256 they are asked to approve, and the open items. Short and plain.
Return the head you pushed, the domain model's SHA-256, every disposition, every check, the wording list, the approval summary and the open items.`, { label: 'fix: 6b-2 review round', phase: 'Fix', schema: FIX })
if (!fix) throw new Error('the fix round returned nothing')
return { reviews, findings, fix }

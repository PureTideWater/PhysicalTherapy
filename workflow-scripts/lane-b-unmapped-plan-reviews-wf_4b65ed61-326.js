export const meta = {
  name: 'lane-b-unmapped-plan-reviews',
  description: 'PR #95 (#32 unmapped plan): description from the template; after shots; payment-engine, security, and UX/brand reviews in fresh clones; each finding adversarially verified; loop until dry; completeness critic',
  phases: [{ title: 'Describe' }, { title: 'Review' }, { title: 'Screens' }, { title: 'UX' }, { title: 'Verify' }, { title: 'Critic' }],
}
// RESUMED 2026-11-02 ~01:05 UTC: the 5-hour limit (reset 00:10 UTC) stopped the payment-engine and UX reviews, the
// security findings' verifiers and the critic; the worker restarted and setup-container.sh restarted PostgreSQL. The
// description, the security review's round 1 and the after shots replay from cache.
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/aa4b05fd-cf7b-57fe-8086-b5b14b24e00e/scratchpad'
const SAVE = (file, what) => `Save as you go: keep ${SP}/progress/${file} up to date (${what}), so an interruption loses nothing. If it already exists when you start, an earlier run of yours was interrupted: read it, trust what it holds unless the code says otherwise, and continue from where it stopped.`
const HEAD = '8517ee3a'
const BASE = '83d71fd6'
const DESIGN = '/home/user/ops/designs/lane-b-unmapped-plan.md'
const REPO = 'https://github.com/PureTideWater/PhysicalTherapy'
const FINDINGS = { type: 'object', properties: { summary: { type: 'string' }, findings: { type: 'array', items: { type: 'object', properties: {
  id: { type: 'string' }, severity: { type: 'string', enum: ['blocking', 'should-fix', 'nit'] }, file: { type: 'string' }, line: { type: 'number' }, title: { type: 'string' },
  evidence: { type: 'string', description: 'file:line citations, and a concrete failing sequence or input' }, fix: { type: 'string' } }, required: ['id', 'severity', 'file', 'title', 'evidence', 'fix'] } } }, required: ['summary', 'findings'] }
const VERDICT = { type: 'object', properties: { real: { type: 'boolean' }, severity: { type: 'string', enum: ['blocking', 'should-fix', 'nit'] }, reason: { type: 'string' }, fix: { type: 'string' } }, required: ['real', 'severity', 'reason'] }
const RULES = `Rules: export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH in every command. Heavy commands (pnpm install, build, typecheck, lint, vitest, test:db, e2e, Stryker, the screen tour's build and server) only under flock /tmp/laneb-heavy.lock, one at a time, long ones with run_in_background waited on by notification (no foreground sleep). Database tests use PostgreSQL 18 on port 5433 (DATABASE_URL=postgres://postgres:test@localhost:5433/postgres, or how the repo's test:db sets it). Synthetic data only. No model name or identifier in any file. Never pkill -f a pattern your own shell matches. Never push, commit to the branch, comment on GitHub, or approve.`
const CLONE = (name) => `Work in a fresh clone of your own: if /home/user/review-${name} does not exist, git clone --quiet --branch co-001/unmapped-plan ${REPO} /home/user/review-${name} && git -C /home/user/review-${name} checkout --quiet ${HEAD}; then (under the lock) pnpm install --frozen-lockfile there. Check that HEAD is ${HEAD}. Scratch tests go in that clone only; remove nothing else.`
const COMMON = `You review Lane B pull request PureTideWater/PhysicalTherapy #95, "One unmapped plan no longer freezes a whole month (audit #32; ADR 0075)", branch co-001/unmapped-plan at ${HEAD}, base claude/build-platform ${BASE}. The diff: git diff ${BASE}..${HEAD} (89 paths). The design of record: ${DESIGN} (revision 3, with §14 dispositions) and its reviews in /home/user/ops/designs/lane-b-unmapped-plan/. Be adversarial: find real defects, each with a concrete failing sequence or input, file:line evidence and a fix. Do not report style preferences as defects; do report anything wrong, unsafe, untested, inaccurate, or not the best option (the founder's standing rule). Try to refute each finding yourself before reporting it. ${RULES}`

const DIMS = [
  { key: 'payment-engine', file: 'payment-engine-reviewer.md', focus: `Focus: the removed guard and the per-line NO_MAPPING path through the existing resolver (no line of an unmapped plan ever priced; every mapped line priced; a period with no mapped plan never gets a run: PricingRunNothingMapped); coverage tp-pricing-coverage/2 (counts and integer cents of every line of each unmapped plan; /1 still read); the monitor's months payload and the location (#33) and Medicare-content (#49) waits; "Price these months again" through #50's createRerun and RERUN_ACCEPTANCE (in effect, newer_run_pending, rerun_failed, months_changed), the plan_months: lock order against execute.ts, the pricing_current lock and the mapping action (deadlock, double runs, a month priced twice or never); the SQL aggregates (priced_line_shortfall_cents, to_triage) against what the run in effect really holds; the reports' sentences from stored coverage; trace and immutability (pricing_run and priced_line immutable; a new release means a new run); the engine freeze (no non-test change under packages/pricing); whether the tests would catch a regression (mutate in your clone and see).` },
  { key: 'security', file: 'security-reviewer.md', focus: `Focus: the two new routes practice.mapping.price_again and practice.mapping.price_waiting and the mapping action's conditional monitor enqueue (Zod schema, role check in the handler and in Postgres, practice-scoped transaction with SET LOCAL app.practice_ids and app.actor_id, audit event; RUN_STARTING_ROUTES and the suspension gate; CONTINUES_STARTED_WORK untouched); tenant isolation of every new query (apps/web/src/lib/pricing/mapped-plan.ts, mapping-queries.ts, dashboard and pricing queries, report readiness): practice_id predicates, RLS, the advisory-lock keys; PHI reads through the audited read path (pricing_run audit object, purpose payer_plan_mapping); the job payload's months field and packages/observability/src/phi-guard.ts (could the new exact format admit a date of birth or other PHI?); no identifier, PHI or value in an error message, URL, log or job payload; per-persona generated route tests; the cross-tenant and catalog tests.` },
]

phase('Describe')
const describe = agent(`You write the description of draft PR PureTideWater/PhysicalTherapy #95 (branch co-001/unmapped-plan at ${HEAD}, base claude/build-platform ${BASE}). ${SAVE('describe-95.md', 'sections written, the file path, the update and the read-back')}
Sources: the template ${'/home/user/unmapped-plan/.github/pull_request_template.md'} (every section present, in order; "None" rather than omitted; keep its required-checks markers exactly); the design ${DESIGN} (revision 3; §9 visible changes with exact wording, §11 decisions with reasons, proposals outside the PR); the status file /home/user/ops/approval-summaries/lane-b-unmapped-plan-status.md (checks run so far with counts); the build progress files ${SP}/progress/build-*.md (deviations G4, G5 and others); git -C /home/user/unmapped-plan diff --stat ${BASE}..${HEAD}.
Content: What changes (plain words, the visible changes with exact wording); Why (combined audit #32, LANES.md queue item 10; the milestone 3 exception granted by the founder in the adoption of the combined audit, 2026-10-20 ~15:10 UTC, HANDOFF.md:473); What it does not change (each line answered: engine unchanged, ledger unchanged, no migration, no content release, domain model unchanged, CI unchanged); Checks (the table of each command run on ${HEAD} with its result; e2e and the full test:db shards and Stryker "run in the fix round"); Reviewer agents' findings (rows for payment-engine, security, UX and brand: "running" for now; the before-shot sample ids from the status file's 17:22 entry, kept in a private gallery); Freeze exception ("Yes:" the milestone 3 exception, founder, 2026-10-20 ~15:10 UTC, recorded in ADR 0075 and reconciliation-001); Domain model ("No migration; the document is unchanged."); The founder's approval (the template's text as is). Also: decisions taken with reasons (the co-founder's ruling 2026-10-26 ~00:20 UTC), the overlaps and who resolves them (SS-01: both new routes stay in RUN_STARTING_ROUTES, nothing in CONTINUES_STARTED_WORK, the monitor enqueue in neither; UX PR 9; the shared documents), what is handed to Lane A (the stored notice and email, MAP-10 reserved), proposals outside the PR. No PHI, no model name or identifier. Under 60,000 characters. End with exactly these lines:

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01FcouKNB2TyuPCAha9BaEjQ

Write the body to ${SP}/pr95-body.md. Then set it ONLY with the MCP tool mcp__github__update_pull_request (owner PureTideWater, repo PhysicalTherapy, pullNumber 95, body = the file's exact text; load it with ToolSearch "select:mcp__github__update_pull_request,mcp__github__pull_request_read"), never gh api PATCH. Read it back with mcp__github__pull_request_read method get, and prove it byte for byte against the file (write the returned body to ${SP}/pr95-readback.md and diff; GitHub may normalise line endings: if it differs, find why and fix). Return: the character count, the diff result, and the sections.`, { label: 'describe-95', phase: 'Describe' })

phase('Review')
const reviewRound = (d, seen, round) => agent(`${COMMON}

${CLONE(d.key)}
YOUR CHECKLIST: .claude/agents/${d.file} in the clone (read it and apply every item). ${d.focus}
${seen.length ? `This is round ${round}. Findings already reported (do not repeat them; find NEW defects only, or return an empty list): ${JSON.stringify(seen.map(f => ({ title: f.title, file: f.file, line: f.line })))}` : ''}
${SAVE(`review-${d.key}-r${round}.md`, 'each finding as you confirm it, with evidence')}
Return the findings.`, { label: `review-${d.key}-r${round}`, phase: 'Review', schema: FINDINGS })

const verify = (f, dim) => agent(`${COMMON}

Adversarially verify ONE review finding (from the ${dim} review) against the code at ${HEAD} (read it in /home/user/review-${dim}, read only; or your own detached worktree). Try to REFUTE it: is the evidence accurate, does the failure really occur (reproduce it with a scratch test if you can), is the fix right and the best option? real=true only if it holds. Re-grade its severity. Write nothing except ${SP}/progress/verify-${dim}-${f.id}.md (your notes, continued if it exists).
Finding ${f.id} (${f.severity}) ${f.file}:${f.line || ''}: ${f.title}
Evidence: ${f.evidence}
Fix proposed: ${f.fix}`, { label: `verify:${dim}:${f.id}`, phase: 'Verify', schema: VERDICT })

const runDim = async (d) => {
  const seen = [], confirmed = []
  for (let round = 1; round <= 3; round++) {
    const r = await reviewRound(d, seen, round)
    if (!r) { if (round === 1) throw new Error(`${d.key} review returned nothing: stop`); break }
    const fresh = r.findings.filter(f => !seen.some(s => s.title === f.title && s.file === f.file))
    if (!fresh.length) break
    seen.push(...fresh)
    const vs = await parallel(fresh.map(f => () => verify(f, d.key)))
    fresh.forEach((f, i) => confirmed.push({ ...f, dim: d.key, round, verdict: vs[i] }))
    if (!vs.filter(Boolean).some(v => v.real)) break
  }
  log(`${d.key}: ${confirmed.length} findings, ${confirmed.filter(f => f.verdict && f.verdict.real).length} judged real`)
  return confirmed
}

const screensThenUx = async () => {
  const shots = await agent(`You take the AFTER screenshots for PR #95 (co-001/unmapped-plan at ${HEAD}). ${RULES}
Save as you go: keep ${SP}/progress/up-capture-after.md up to date (each command and result).
Follow /home/user/ops/tools/lane-b-screen-tour/README.md ("From another lane", "Set-up and a run", and the section on PR #32) exactly as the before run did: pull claude/build-ops first (git -C /home/user/ops pull --no-rebase origin claude/build-ops) so setup.sh copies the latest spec; TOUR_DIR=${SP}/screens-after (fresh), TOUR_REF=${HEAD}; TOUR_ONLY='p.home.unmapped-plan*,p.coverage.unmapped-plan*,p.pricing-runs.unmapped-plan*,p.pricing-run.unmapped-plan*,p.mapping.unmapped-plan*,p.plan.unmapped-plan*,p.report-document.unmapped-plan*'; setup.sh, build.sh under flock, run.sh with populate, touch stop, check 'server stopped' and fuser 3297/tcp, drop the database tp_e2e_screens, rm the temp dirs, then /usr/bin/python3 -I /home/user/ops/tools/lane-b-screen-tour/tile.py ${SP}/screens-after p.home.unmapped-plan p.coverage.unmapped-plan p.pricing-runs.unmapped-plan p.pricing-run.unmapped-plan p.mapping.unmapped-plan p.plan.unmapped-plan p.report-document.unmapped-plan. The before run is ${SP}/screens-before (39 shots; its notes in ${SP}/progress/up-capture-before.md). If a cap fails at the head because the screen changed as designed, make the spec version-tolerant on claude/build-ops (commit and push through the hook, never force) and retake. Return: shot count, failures with reasons, the tiles index path, and what differs from the before shots.`, { label: 'capture-after', phase: 'Screens' })
  const ux = []
  const seen = []
  for (let round = 1; round <= 2; round++) {
    const r = await agent(`${COMMON}

YOUR CHECKLIST: .claude/agents/ux-brand-reviewer.md (read it in /home/user/unmapped-plan, read only, and apply every item: brand (.claude/rules/brand.md), WCAG 2.1 AA with 2.2's additions, the UX baseline review, wording and figures, focus and keyboard, what a refusal or refresh keeps). Before shots: ${SP}/screens-before (shots.json, tiles/index.json); after shots: ${SP}/screens-after (same). The capture agent reported: ${typeof shots === 'string' ? shots : JSON.stringify(shots)}. View the tiles with the Read tool (both sides, 1280 light, 1280 dark, 390 light) and read the changed screens' code in the diff (pages under apps/web/src/app/p/[practiceId]/{page.tsx,coverage,pricing-runs,mapping}, components/mapping/months.tsx, components/pricing/display.tsx, components/reports/*, and the wording against design §5 and §9). List the sample in your summary, and any changed route outside it as "not seen, by sample".
${seen.length ? `Round ${round}. Already reported (find NEW defects only, or return an empty list): ${JSON.stringify(seen.map(f => f.title))}` : ''}
${SAVE(`review-ux-r${round}.md`, 'each finding with the shot id and evidence')}
Return the findings (file and line of the code to change; evidence names the shot ids, in backticks).`, { label: `review-ux-r${round}`, phase: 'UX', schema: FINDINGS, agentType: 'ux-brand-reviewer' })
    if (!r) { if (round === 1) throw new Error('UX review returned nothing: stop'); break }
    const fresh = r.findings.filter(f => !seen.some(s => s.title === f.title))
    if (!fresh.length) break
    seen.push(...fresh)
    const vs = await parallel(fresh.map(f => () => verify(f, 'ux')))
    fresh.forEach((f, i) => ux.push({ ...f, dim: 'ux', round, verdict: vs[i] }))
    if (!vs.filter(Boolean).some(v => v.real)) break
  }
  return { shots, ux }
}

const [pe, sec, uxr, desc] = await parallel([
  () => runDim(DIMS[0]),
  () => runDim(DIMS[1]),
  () => screensThenUx(),
  () => describe,
])
const all = [...(pe || []), ...(sec || []), ...((uxr && uxr.ux) || [])]

phase('Critic')
const critic = await agent(`${COMMON}

You are the completeness critic of PR #95's reviews. The verified findings so far (JSON): ${JSON.stringify(all.map(f => ({ dim: f.dim, id: f.id, severity: f.severity, title: f.title, file: f.file, real: f.verdict && f.verdict.real })))}
Ask what is missing: a changed file no review read (compare git diff --name-only ${BASE}..${HEAD} against what the reviews cover: docs, ADRs, test-matrix rows and their assertedBy tests, fixtures, e2e specs, the README), a rule of the design not checked, a test row whose test does not assert what the row says, a checklist item of the three agent files not applied, a claim in the PR description (read it: mcp__github__pull_request_read, load with ToolSearch) that is untrue. Read only (in /home/user/unmapped-plan). ${SAVE('review-critic.md', 'each gap with evidence')}
Return gaps as findings (same shape), verified by you against the code.`, { label: 'review-critic', phase: 'Critic', schema: FINDINGS })
const criticVerified = critic ? await parallel(critic.findings.map(f => () => verify(f, 'critic').then(v => ({ ...f, dim: 'critic', verdict: v })))) : []

return { describe: desc, shots: uxr && uxr.shots, findings: [...all, ...criticVerified.filter(Boolean)] }
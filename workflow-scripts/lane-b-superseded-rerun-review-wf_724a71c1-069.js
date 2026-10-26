export const meta = {
  name: 'lane-b-superseded-rerun-review',
  description: 'PR #50 reviews: payment-engine, security, after screenshots then UX and brand review',
  phases: [{ title: 'Review' }, { title: 'Screens' }, { title: 'UX' }],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/81ccf0db-8a34-5ffa-8cb9-5886112da886/scratchpad'
const SAVE = (file, what) => `Save as you go: keep ${SP}/progress/${file} up to date (${what}), so an interruption loses nothing. If it already exists when you start, an earlier run of yours was interrupted: read it, trust what it holds unless the code says otherwise, and continue from where it stopped.`
const WT = '/home/user/superseded-rerun'
const HEAD = '961783a'
const BASE = '6ddd587'
const DESIGN = '/home/user/ops/designs/lane-b-superseded-rerun.md'
const FINDINGS = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    findings: { type: 'array', items: { type: 'object', properties: {
      id: { type: 'string' }, severity: { type: 'string', enum: ['blocking', 'should-fix', 'nit'] },
      file: { type: 'string' }, line: { type: 'number' }, title: { type: 'string' },
      evidence: { type: 'string', description: 'file:line citations, and a concrete failing sequence or input' },
      fix: { type: 'string' } }, required: ['id', 'severity', 'file', 'title', 'evidence', 'fix'] } },
  },
  required: ['summary', 'findings'],
}
const COMMON = `You review Lane B pull request PureTideWater/PhysicalTherapy #50, "A superseded re-run cannot be accepted (combined audit #10)", branch co-001/superseded-rerun at ${HEAD}, base claude/build-platform ${BASE}. The checkout is ${WT} (read-only for you: change nothing there, commit nothing). The diff: git -C ${WT} diff ${BASE}..${HEAD}. The design of record: ${DESIGN} (and its review, /home/user/ops/designs/lane-b-superseded-rerun/review.md). Be adversarial: your job is to find real defects, each with a concrete failing sequence or input, file:line evidence, and a fix. Do not report style preferences as defects; do report anything that is wrong, unsafe, untested, inaccurate, or not the best option (the founder's standing rule). Verify each finding against the code before reporting it (try to refute it yourself first). Commands that run tests are heavy: run them under flock /tmp/laneb-heavy.lock, one at a time, with export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH. You may write scratch tests under ${SP}/review-scratch only (never in the worktree) — or, if a test must sit in the repo tree to run, copy the worktree to ${SP}/review-scratch/<name> with git worktree add --detach and work there, removing it at the end.`

phase('Review')
const reviewPromise = parallel([
  () => agent(`${COMMON}

YOUR CHECKLIST: ${WT}/.claude/agents/payment-engine-reviewer.md (read it and apply every item that bears on pricing runs and acceptance). Focus: the acceptance and re-run rule (apps/worker/src/price/rerun.ts, in-effect.ts) against the in-effect rule everywhere it is read (PRICED_IN_EFFECT, RUN_IN_EFFECT, the database's pricing_run_in_effect(), the pricing_run trigger in packages/db/migrations: grep accepted_at), the monitor (apps/worker/src/monitor/plan.ts), triage, coverage, the audit report and packets that read the run in effect; any sequence of runs, releases, withdrawals, mappings, sign-offs, overlapping periods, failed runs and concurrent transactions where a line loses its pricing in effect, regresses to older pricing, or a valid acceptance is refused; the lock order (deadlock against execute.ts, the packet locks, pricing_current users); the property test's model faithfulness (apps/worker/src/price/test-support/rerun-model.ts) and whether the tests would catch a regression (mutate the rule mentally or in a scratch copy and see if a test fails); trace and immutability (pricing_run and priced_line immutable; acceptance changes nothing priced). Also the engine freeze (no non-test change under packages/pricing).
${SAVE('review-payment-engine.md', 'each finding as you confirm it, with evidence')}
Return the findings.`, { label: 'review-payment-engine', phase: 'Review', schema: FINDINGS }),
  () => agent(`${COMMON}

YOUR CHECKLIST: ${WT}/.claude/agents/security-reviewer.md (read it and apply every item). Focus: the accept and re-run routes (apps/web/src/lib/routes/pricing.ts, releases.ts) and the pages; authorization in the handler (mapping.edit) and in Postgres (RLS, the pricing_run trigger's actor and permission checks); tenant isolation of every new query (practice_id predicates, the advisory-lock key, the new SQL fragments, rerunBlock, the queries in apps/web/src/lib/pricing/queries.ts; do new reads go through readWithAudit as PHI reads must?); the audit event (pricing_run_accepted on success; whether refusals should be audited per the codebase's convention); no identifier, PHI or value in an error message, URL, log or job payload (the new refusal messages, the links); Cache-Control on PHI responses; the ActionForm refreshOnError change (any client-side leak or loop); the isolation-level guard and the lock (can a caller hold the practice's pricing_current lock to deny service, and is that worse than before?); the cross-tenant and catalog tests still cover this. Run pnpm lint:logs.
${SAVE('review-security.md', 'each finding as you confirm it, with evidence')}
Return the findings.`, { label: 'review-security', phase: 'Review', schema: FINDINGS }),
])

phase('Screens')
const after = await agent(`You take the AFTER screenshots for Lane B PR #50 (audit #10: a superseded re-run cannot be accepted), to compare with the BEFORE shots already taken on the base.
Read first: ${SP}/progress/screens-before.md (how the before shots were made), ${SP}/screens-before/shots.json, the capture spec /home/user/ops/designs/lane-b-superseded-rerun/capture/superseded.spec.ts, and /home/user/ops/tools/lane-b-screen-tour/README.md and its scripts. Repeat the same procedure exactly, with TOUR_DIR=${SP}/screens-after and TOUR_REF=${HEAD} (the PR head), the same spec, the same states, at 1280 px and 390 px, light theme. On the head, the superseded states show an explanation instead of Accept, and the stale-tab Accept is refused then the page refreshes to the explanation: capture the refusal moment too if the spec can (adapt the spec only in ways that still run on the base, and record each change). The heavy lock covers build and serve (flock /tmp/laneb-heavy.lock); end with the server stopped (fuser 3297/tcp prints nothing), the database dropped, temp dirs removed, /home/user/screens left as the tool leaves it. PNGs stay in ${SP}/screens-after/png (never committed). Write ${SP}/screens-after/shots.json in the same form, with matching state names, so before and after pair up.
Rules: export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH in every command. Synthetic data only.
${SAVE('screens-after.md', 'each step done, each run with its result, the lock and server state')}
Return: the shot list paired with the before shots (before file, after file, state, width), and any problem.`, { label: 'screens-after', phase: 'Screens' })

phase('UX')
const ux = await agent(`You are the UX and brand reviewer for Lane B PR #50 (audit #10: a superseded re-run cannot be accepted), one of its adversarial reviews, because the PR changes what a person sees.
Judge against: /home/user/ops/designs/lane-b-ux-review-brief.md ("What it judges against": .claude/rules/brand.md, docs/brand/BRAND.md, tokens, the copy rules in apps/web/src/lib/copy/words.ts and tools/brand-copy, CO-11, PRD's cross-cutting requirements at docs/product/PRD.md:256 — keyboard, labels, contrast, every error with a next step, no state a refresh loses — and WCAG 2.1 AA / 2.2 where it adds). The checkout: ${WT} at ${HEAD} (read only). The design's wording section: ${DESIGN} §8.
The screenshots, paired: BEFORE in ${SP}/screens-before (shots.json, png/) and AFTER in ${SP}/screens-after (shots.json, png/). The after-capture agent reported: ${typeof after === 'string' ? after : JSON.stringify(after)}
View every pair with the Read tool (it shows images). For each screen and state, at 1280 and 390 px: does the person understand why a re-run cannot be accepted and what to do next; is the wording plain, accurate, consistent with the rest of the app and the copy rules (no jargon a practice manager would not know, no "runId"-style leak, "Recovered" rules not relevant here); are badges and alerts on brand (tokens, status colours only for data with a label, no brass text on white), readable at 390 px (no overflow, wrapping, tap targets), accessible (the Alert role, focus after the refresh, link names that make sense out of context, contrast); is anything visible worse than before; does the refresh-after-refusal behave well (no lost input, no flash of a refused state)? Also read the component code (apps/web/src/components/pricing/display.tsx, the two pricing-run pages, releases page, action-form.tsx) for states the shots did not reach (plural forms, other-period and never-in-effect variants, pending) and judge their wording.
${SAVE('review-ux.md', 'each finding as you confirm it, with the shot file names as evidence')}
Return the findings (file = the component or page file; evidence = the shot file names and what they show).`, { label: 'review-ux', phase: 'UX', schema: FINDINGS })

const [pe, sec] = await reviewPromise
return { paymentEngine: pe, security: sec, after, ux }

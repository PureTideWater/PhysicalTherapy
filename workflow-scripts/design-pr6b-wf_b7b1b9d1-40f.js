export const meta = {
  name: 'design-pr6b',
  description: 'PR 6b design: ZIP+4 localities and pricing settings, the screening consumer (measured size, monthly cost) and the 60-second check, the screening email streams; one reviewer each, revise, then one plan with the founder questions in one batch; no code',
  phases: [
    { title: 'Design', detail: 'three focused design files, read-only on the repo' },
    { title: 'Review', detail: 'one independent adversarial reviewer per design' },
    { title: 'Revise', detail: 'apply the real findings' },
    { title: 'Plan', detail: 'pull requests, migration, builder split, founder questions' },
  ],
}

const SP = '/tmp/claude-0/-home-user/e7bf8d14-3b4c-5e38-9cea-a1f92a95083e/scratchpad'
const REPO = '/home/user/PhysicalTherapy'
const AUDIT = '/home/user/ops/audits/combined/combined-report.md'
const HANDOFF = '/home/user/ops/HANDOFF.md'
const RECON = `${REPO}/docs/product/reconciliation-001.md`
const ADR62 = `${REPO}/docs/adr/0062-screen-prospects-from-aggregate-rows-without-phi-price-each-row-with-the-unchanged-engine-and-send-the-result-by-emailed-link.md`
const PR6DESIGN = '/home/user/ops/designs/pr6-53-57-screening.md'

const COMMON = `Repository PureTideWater/PhysicalTherapy (PaidWhole), checked out at ${REPO} on claude/build-platform, head 8e33cb3 (PR 5, PR 6 and PR 5b merged). CLAUDE.md's rules bind the design.

THIS IS A DESIGN STEP ONLY. ${REPO} is READ-ONLY for you: do not edit, stage, commit, checkout, stash, reset or run pnpm install there, and add no worktree to it. Read files directly or with git -C ${REPO} show/log/grep. If you must run something (a measurement or a throwaway script), clone into your own directory under ${SP}/design-scratch/ (git clone -q ${REPO} <dir>; PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH; pnpm install --frozen-lockfile there; the pnpm store is shared so it is fast), use only databases named tp_pr6b_design_<yourkey>_* on PostgreSQL 18 (port 5433, socket /tmp, postgres:test), drop them when done, and delete the clone when done. Run no full test suite. Make no commit anywhere and push nothing.

Read only the sections you need (the founder's pacing rule: exact sections, not whole large documents):
- Founder rulings: ${HANDOFF} lines 5-74 (state and next steps), 131-139 (standing rule), 144-186 (owner rulings), 261-293 (audit adopted in full, efficient pipeline, design decisions), 309-313 (pacing).
- ${RECON}: line 428 (the engine freeze and its PR 6b exception, with its check), lines 495-527 (the PR 6 rulings: ZIP+4 superseded at line 499, decisions 13 to 16 at 521-527).
- ${ADR62}: "Owner rulings (2026-10-18)" (about lines 619-668), "Owner rulings (2026-10-20): the 60-second promise at production size" (about 710-765), "Owner rulings (2026-10-21)" (about 766-817), "Revisit when" (818 on). Read more of it only where your design touches it.
- The combined audit ${AUDIT} (the founder adopted it in full on 2026-10-20: every item lands where it says, its costs accepted, every schema change still needs the founder's SHA-256 approval). Item line ranges: #7 254-262, #16 335-343, #31 472-480, #33 490-498, #53 670-678, #76 877-885.

The founder's standing rule: recommend and build only the best option for accuracy, quality, user experience, growth, security and privacy, compliance (HIPAA, honest claims), reliability, cost to serve and maintainability, NEVER weighted by build effort. Where a choice is genuinely the founder's (a promise to users, a legal wording, a running cost, a number only they set, or a change to one of their rulings), do not decide it: write it as a question with your recommended answer first, and say plainly what each option gives up. Write plainly and tightly: decisions, exact schema (names, types, CHECKs, grants, RLS, the PHI registry, catalog lists), exact files to change, the tests that prove each rule (unit, db, e2e, golden, capacity), the ADRs to amend, and what is out of scope. Every claim about the code cites file:line. Never put real PHI, a real 835 or a real contract anywhere.

Your final report is short: the file path, a summary of the decisions, whether the schema changes, the founder questions, and the open items. Full detail goes in the file.`

const DESIGN_SCHEMA = {
  type: 'object',
  properties: {
    file: { type: 'string' },
    summary: { type: 'string' },
    schema_change: { type: 'boolean' },
    engine_change: { type: 'string', description: 'exactly what changes under packages/pricing/src (non-test), or "none"' },
    monthly_cost: { type: 'string', description: 'new running costs this design adds, itemised with the price source, or "none"' },
    founder_questions: { type: 'array', items: { type: 'string' } },
    open_items: { type: 'array', items: { type: 'string' } },
  },
  required: ['file', 'summary', 'schema_change', 'engine_change', 'monthly_cost', 'founder_questions', 'open_items'],
}
const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    findings: { type: 'array', items: { type: 'object', properties: {
      title: { type: 'string' },
      severity: { type: 'string', enum: ['blocking', 'should_fix', 'nit'] },
      problem: { type: 'string' },
      evidence: { type: 'string', description: 'file:line or document section that shows it' },
      fix: { type: 'string' } }, required: ['title', 'severity', 'problem', 'evidence', 'fix'] } },
    verdict: { type: 'string' },
  },
  required: ['findings', 'verdict'],
}
const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    file: { type: 'string' },
    pull_requests: { type: 'array', items: { type: 'object', properties: {
      name: { type: 'string' }, branch: { type: 'string' }, contents: { type: 'string' }, migration: { type: 'string' },
      domain_model_approval: { type: 'boolean' }, depends_on: { type: 'string' } }, required: ['name', 'branch', 'contents', 'migration', 'domain_model_approval', 'depends_on'] } },
    builders: { type: 'array', items: { type: 'object', properties: {
      pr: { type: 'string' }, role: { type: 'string' }, owns: { type: 'string' } }, required: ['pr', 'role', 'owns'] } },
    founder_questions: { type: 'array', items: { type: 'string' } },
    monthly_cost_summary: { type: 'string' },
    open_items: { type: 'array', items: { type: 'string' } },
  },
  required: ['file', 'pull_requests', 'builders', 'founder_questions', 'monthly_cost_summary', 'open_items'],
}

const TRACKS = [
  {
    key: 'zip4-settings',
    file: `${SP}/design/pr6b-zip4-settings.md`,
    brief: `TRACK A: ZIP+4 localities (the engine lookup, practice settings, the screening), pricing settings at onboarding (#33), the shape question of #16, and the screening's content refusal (#7's PR 6b part).

1. ZIP+4 (the founder's ruling of 2026-10-18 11:47 UTC, ${RECON} line 499 and ADR 0062's ZIP+4 ruling): practice settings and the screening accept a ZIP+4; the engine resolves the locality from it; five-digit ZIPs and the golden lines are unchanged; the engine freeze is loosened for that lookup ONLY (line 428 gives the check: git diff --stat <base> -- packages/pricing/src ':!**/*.test.ts' must hold only the lookup). ADR 0062 still says "keep refusing" and must be amended; say exactly how. Find and cite: the engine's ZIP check and locality read (packages/pricing/src/engine.ts around lines 96, 254, 600-609; EngineInputError 'locality_needs_zip_plus_four'; reasons.ts, trace.ts, types.ts, recompute.ts), the locality_map record and its parser (packages/rules/src/parsers/locality.ts) and how CMS publishes ZIP-to-locality (the five-digit file with its plus-four flag and the ZIP+4 file; describe the real format without loading real content), how the release keys locality_map, the trace and recompute(trace) (PRC-16 must still hold, so the trace carries what the lookup used), any engine or rule version recorded on a pricing run and what a re-run diff shows when only the ZIP+4 changes, every settings reader and writer of the ZIP (practice.settings, apps/web/src/lib/routes/settings.ts, the console), the screening's ZIP input, its refusal and its keyed release read (apps/web/src/lib/screening/*, apps/worker/src/screening/adapter.ts and the release cache: a run reads keyed records by its codes and ZIP and fails RELEASE_READ_OUTSIDE_FETCH otherwise, so the fetch must include what the ZIP+4 lookup reads), and the synthetic releases (900001-900004 and 900005 must not change; a new SYNTHETIC release takes a new number if ZIP+4 records are needed; the golden claims pin manifests). Design the smallest exact engine change, its tests (including a property or table test that every five-digit ZIP not needing ZIP+4 prices identically before and after), and how CI proves the freeze holds for everything else.
2. #33 (audit 490-498): a five-digit ZIP required at practice creation and its status in the release in force; the place of service split filled from the specialist-approved default at pricing time and recorded on the run (find PR 6's split table and generalize it as the audit says); a 'Pricing settings' section in Settings for an administrator or billing manager (audited; Zod; role check; practice-scoped transaction; the handler AND Postgres check); 'Confirm your billing ZIP' in Getting started; runs that wait, by name, while the ZIP is missing, and saving it queues the monitor so waiting months price with no hand re-run; an e2e journey that creates a practice with no seeded settings and reaches a priced month. Decide what is a new unpriced reason versus a run that waits (CLAUDE.md: unpriced reasons are a closed list and the engine's list is unchanged; say how you keep both).
3. #16 (audit 335-343): the audit asks the founder to confirm where the ZIP+4 lives: on a dated site record (the multi-site register lands in a new PR right after PR 6b) or on practice settings as the ruling said. Put this to the founder with your recommendation first and what each option gives up. If you recommend the site record, design the minimal site record PR 6b creates so the follow-on PR extends it without churn, and state what single-site practices see.
4. #7's PR 6b part (audit 254-262): "the screening refuses out-of-span bands with a dated message". Design that refusal for the screening only (the release-operations PR does the rest); find how the screening's rows carry dates or date bands today.
5. Engine change and ADRs: list every non-test line under packages/pricing/src that changes; the ADRs amended (0062 and any engine ADR); the domain model regeneration if the schema changes; the test-matrix rows (packages/synth/src/cases/registry.ts and docs/product/test-matrix.md) if any are added.`,
  },
  {
    key: 'consumer-time',
    file: `${SP}/design/pr6b-consumer-time.md`,
    brief: `TRACK B: the screening's own consumer (#53 parts 3 and 4), sized by measurement, with its monthly cost for the founder's approval BEFORE anything is built (decision 14), and the 60-second time check switched on (decisions 13 to 16). Also #31's screening part.

1. Read: #53 (audit 670-678), decisions 13-16 (${RECON} 521-527; ADR 0062 "the 60-second promise at production size"), the PR 6 design's capacity sections (${PR6DESIGN} lines 164-380), tools/screening-capacity/limits.ts (screeningConsumer(), HARNESS_RUNS_SCREENING_CONSUMER, RUNNER_TO_FARGATE, TIME_PROMISE_MS, TIME_ALLOWANCE_MS), env.ts, containers.ts (DockerRuntime and ProcessRuntime), report.ts and their tests, .github/workflows/screening-capacity.yml, infra/lib/environments.ts (compute settings), infra/lib/platform-stack.ts and jobs.ts and the constructs (how worker services, task sizes, queues and WORKER_JOBS are declared), ADR 0049 (one task per service, egress), apps/worker (how the screening job is registered on pg-boss and where it runs today: the platform task, one at a time), and the database roles and logins (PR 5 gave the worker its own login, a member of tp_app and the marker role tp_job; the catalog test lists roles and grants).
2. Design the consumer as the audit says: from the worker image, its own service, its own role and a login limited to the screening functions (find them; the catalog test extended), two screenings at a time per task unless measurement shows another number is better, a fixed or tightly capped task count (never uncapped scaling on a public form), a daily row cap that tells prospects their result will take longer, time-to-email metrics with an alarm, and an honest "this can take a few minutes" when the queue is deep. Say how the platform task stops running screenings and how a deploy moves queued jobs without loss.
3. SIZE IT BY MEASUREMENT. The promise covers any accepted 50,000-row file, the worst shape included (decision 14), with the capacity test's scenario (the practice and worst uploads alone, three at once, a small one behind them, cold cache). The previous session measured under the platform task's limits (0.25 vCPU, 512 MiB): worst shape 108 s alone and 238 s three at once; practice shape up to 51 s three at once (${HANDOFF} lines 341-348 and the PR 6 round notes). The Docker daemon is NOT running in this container, so use the harness's ProcessRuntime (cgroups, the build outputs laid out as the images lay them out; it cannot limit Postgres, which is fine for sizing the consumer) in your own clone, against your own databases. Measure the candidate sizes you need (for example 0.5, 1 and 2 vCPU with 1 to 4 GiB, and concurrency 1 vs 2) on the worst and practice shapes, alone and three at once. Before each measurement record the machine's load (uptime) and repeat any run taken with a load above 1.5. Report each measurement with its exact command, limits and result in the design file. Pricing is single-threaded Node: say whether one screening can use more than one core, and if that needs a change to the screening job (never to the engine), design it. Choose the size that meets 48 s on the runner for every accepted file (decision 15's line until staging measures the runner-to-Fargate factor), and say what margin you leave for Fargate being slower than this machine.
4. MONTHLY COST: find the AWS region the stacks deploy to (infra). Get the current Fargate on-demand price per vCPU-hour and per GB-hour for that region (and ARM/Graviton if the image can run on it; say whether it can) with WebSearch or WebFetch from aws.amazon.com, citing the source and the date read; if the network refuses, say so and use the figure the audit or repo cites, flagged as unverified. Itemise everything the consumer adds each month: the tasks (always on, 730 hours), CloudWatch metrics, alarms and logs, the new login's secret in Secrets Manager, anything else. Give two or three options (for example: always-on at the measured size; a smaller always-on plus a capped step-up while the queue is deep), recommended first, each with its monthly cost, its worst-case time to result, and what it gives up. This is the founder's first question; it may exceed the roughly $18 a month accepted.
5. The time check: PR 6b declares compute.screening in infra/lib/environments.ts and sets HARNESS_RUNS_SCREENING_CONSUMER, which turns the time verdict on in tested code; design the harness changes so it runs the consumer as production will (service, concurrency, task count), the 48-second line (decision 15), how report.test.ts and limits.test.ts change, and decision 13's launch rule (the screening does not open until the latest capacity run on the image being deployed passes with time enforced): where that rule is enforced (launch switch, deploy runbook, a check) and how. Say whether the capacity workflow should become a required check now and recommend; the founder decides how it joins the merge rule.
6. #31's screening part (audit 472-480): "the screening caches one copy per release and looks up the ZIP's locality separately". Check what PR 6's release read (#53 part 2) already does and state precisely what, if anything, is left for PR 6b (coordinate in prose with Track A's ZIP+4 lookup: the keyed fetch must include the ZIP+4 records).
7. ADR 0049 and ADR 0062 amendments; infra tests (CDK assertions, cdk-diff-plan) that prove the service, its size, its cap and its alarms.`,
  },
  {
    key: 'email-streams',
    file: `${SP}/design/pr6b-email-streams.md`,
    brief: `TRACK C: keep the free screening's email from getting customer email paused (#76, audit 877-885; it lands in PR 6b, and the screening does not go public before it lands).

1. Find and cite: every sender of mail (apps/worker/src/mail and around: Cognito invitations and recovery codes, digests, support-grant and break-glass notices, dunning, PR 6's screening result email and any reminder), how each is sent today (SES API, one sender identity, no configuration set), the SES and Cognito setup in infra (infra/lib), the launch switch from governance, existing alarms and the observability constructs, the runbooks directory, and how screening prospects and support grants are stored (packages/db schema and migrations).
2. Design as the audit's best option says: SES configuration sets per stream (transactional including Cognito, notices, screening) with reputation metrics; bounce, complaint and delivery events flowing to a platform job (choose the best path: SES event destinations to SNS or EventBridge, then SQS, then the job; IAM least privilege; idempotent by message ID) that records each send by message ID, marks a screening prospect bounced, flags an undelivered break-glass notice to the operator and on the grant, and alerts on a bounced invitation; an automatic cut-off that pauses the screening stream ALONE above 3% bounces or 0.08% complaints (say over what window and minimum volume), with the screening page then saying so honestly; account-level alarms; mail-domain and typo checks before a screening send (no outside lookup that leaks the address unless you justify it); a screening sending subdomain (DNS records: SPF, DKIM, DMARC, custom MAIL FROM; what the founder must set at the registrar); a deliverability runbook in docs/runbooks.
3. Schema: the mail-send table and the delivery state on screening prospects. For each: columns, types, CHECKs, who writes it (which role, through which SECURITY DEFINER function), RLS and whether it is practice-scoped (catalog rules in packages/db/src/catalog.ts; the PHI registry; screening data is not PHI, but customer addresses are personal data: store the least that works, for example a hash of the address plus the message ID and stream), retention, and the domain-model regeneration. CLAUDE.md: no name, address or document text in logs, job payloads or error messages; log IDs.
4. A notice recorded as sent though SES suppressed it must no longer read as delivered: say where the product shows delivery state and what changes.
5. Monthly cost: itemise (SES configuration sets, SNS or EventBridge, SQS, CloudWatch alarms and metrics, Route 53 records if the zone is in AWS) with the price source and date read (WebSearch or WebFetch; if refused, say so).
6. ADRs to amend or add; infra tests (CDK assertions) and db and worker tests that prove each rule, including the cut-off pausing only the screening stream.`,
  },
]

phase('Design')
const results = await pipeline(
  TRACKS,
  t => agent(`${COMMON}\n\n${t.brief}\n\nWrite the design to ${t.file} (mkdir -p ${SP}/design). Then return the structured report.`,
    { label: `design: ${t.key}`, phase: 'Design', schema: DESIGN_SCHEMA }),
  (d, t) => {
    if (!d) throw new Error(`design ${t.key} returned nothing`)
    return agent(`${COMMON}\n\nYou are the ONE independent adversarial reviewer of the design in ${d.file} (its summary: ${d.summary}). The brief it answers:\n${t.brief}\n\nCheck it against the code as it is at 8e33cb3 (read it), the audit item's full text, CLAUDE.md and the founder's rulings. Look hard for: a rule it would break (the engine freeze beyond the ZIP+4 lookup, golden lines or synthetic releases 900001-900005 changed, PRC-16, ledger or content-pipeline DDL, unpriced reasons, forced RLS and the catalog, the cross-tenant test, PHI or personal data in logs, payloads, URLs or errors, a figure computed outside code); a schema detail that fails the catalog or cross-tenant tests; a measurement or cost figure that is wrong, unsourced, or not reproducible from what the file records; a test that would pass without proving its rule; anything that would make CI red (typecheck, lint, unit, golden, oracle, db, e2e, build, the capacity workflow, actionlint, the workflows test's runner pin); a part of the brief or the audit's best option it skips; scope that belongs to another PR (PR 6c engine corrections, PR 6e consent and withdrawal, PR 7, the site-register PR, the release-operations PR); a decision it takes that belongs to the founder; anything that is not the best option for the customer or the business. Verify each finding against the code before reporting it. Report each with its evidence and the fix.`,
      { label: `review: ${t.key}`, phase: 'Review', schema: REVIEW_SCHEMA }).then(r => {
        if (!r || !Array.isArray(r.findings)) throw new Error(`review ${t.key} returned nothing; refusing to go on unreviewed`)
        return { d, r }
      })
  },
  (dr, t) => agent(`${COMMON}\n\nYou are revising the design in ${dr.d.file}. Its one independent reviewer reported the findings below. Each is a claim to verify against the code and the documents, not an order: apply the real ones to the file, and at its end add a short 'Review' section listing every finding with what you did and why. Keep founder questions as questions with the recommended answer first and what each option gives up.\n\nFindings: ${JSON.stringify(dr.r.findings, null, 2)}\nVerdict: ${dr.r.verdict}\n\nReturn the structured report for the revised file.`,
    { label: `revise: ${t.key}`, phase: 'Revise', schema: DESIGN_SCHEMA }),
)

const revised = results.filter(Boolean)
if (revised.length !== TRACKS.length) {
  log(`Stopped before the plan: ${TRACKS.length - revised.length} track(s) did not finish design, review and revision.`)
  return { stopped: true, revised }
}

phase('Plan')
const plan = await agent(`${COMMON}\n\nYou write the ONE plan for PR 6b from three reviewed and revised designs:\n${revised.map(r => `- ${r.file}: ${r.summary}\n  schema change: ${r.schema_change}; engine change: ${r.engine_change}; monthly cost: ${r.monthly_cost}\n  founder questions: ${JSON.stringify(r.founder_questions)}\n  open items: ${JSON.stringify(r.open_items)}`).join('\n')}\n\nRead the three files. Write ${SP}/design/pr6b-plan.md with:\n1. The pull requests. The founder asked for one PR per change into claude/build-platform, and the handoff calls this work "PR 6b". Recommend the split that is best for review quality, the engine-freeze check (a PR whose packages/pricing/src diff holds only the ZIP+4 lookup), the founder's domain-model approvals (each PR with a migration needs its own approval and regenerates the domain model, and two migration PRs open at once conflict on that document, so say the order), CI time and the launch rule (the screening opens only after the consumer, the time check and the email streams land). For each PR: name, branch (co-001/pr-06b-<slug>, and further letters or slugs if split), contents, its migration (file name after the newest in packages/db/migrations, objects, or none), whether the domain model needs approval, and what it depends on.\n2. The builders for each PR: two or three roles whose files do not overlap (name the files or directories each owns), each running pnpm typecheck (whole repo), lint and the tests of the packages it touches; who writes the migration and regenerates the domain model; which ADRs each amends.\n3. The founder's questions in ONE batch, the monthly cost FIRST: the consumer's options with their monthly cost, worst-case time to result and what each gives up, plus the email streams' cost, then #16's shape question, then any other question the designs raise (merge duplicates; drop any a design could settle itself under the standing rule; recommended answer first; plain words; what each option gives up). Mark which questions block which builders.\n4. The acceptance checks per PR (the reconciliation's must-not-change checks that apply, plus each design's proofs), and what the fresh-clone verification must prove.\n5. Anything the three designs disagree on, resolved, with the reason; and anything none of them covers from the audit items #7, #16, #31, #33, #53 and #76 or the handoff's PR 6b line.\nReturn the structured plan.`,
  { label: 'plan: pr6b', phase: 'Plan', schema: PLAN_SCHEMA })
if (!plan) throw new Error('the plan returned nothing')
return { revised, plan }

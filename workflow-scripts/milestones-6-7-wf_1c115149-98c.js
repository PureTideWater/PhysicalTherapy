export const meta = {
  name: 'milestones-6-7',
  description: 'Milestones 6-7: pricing runs, engine phase two with 200 golden lines, triage and the audit report, re-run diffs and rule-release console, monitoring jobs and digests; then review and fixes',
  phases: [
    { title: 'Round 1', detail: 'pricing runs || phase-two golden lines then engine' },
    { title: 'Round 2', detail: 'triage + audit report || re-run diffs + rule releases console' },
    { title: 'Round 3', detail: 'monitoring jobs and digests' },
    { title: 'Review', detail: 'payment engine, security, plan conformance' },
    { title: 'Fix', detail: 'two fix passes and a fresh-clone verification' },
  ],
}

const ENV = `
ENVIRONMENT AND HOUSE RULES (read carefully before anything else):
- Repository: /home/user/PhysicalTherapy (git, branch claude/build-platform). Work only inside it. When done, commit with a message "<area>: <summary>", a short body, a blank line and exactly these two trailer lines:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014R3xHbQ6gkeorGunia7amR
  Do NOT push. Never put a model name or model identifier in code, comments, docs or commit messages.
- The specification is the plan in docs/product/: PRD.md (sections 1-21), data-dictionary.md, rules-reference.md, test-matrix.md, milestone-prompts.md (opening prompt and done-check per milestone), unpriced-reasons.md, sessions.md. CLAUDE.md and .claude/rules/*.md are house rules; .claude/skills and .claude/agents describe the expected workflow. Milestones 0-5 are built (monorepo and content pipeline; tenancy, RLS, audit, identity, route wrapper and registry; synth and the pyx12 oracle; the 835 parser and loader; intake; mapping and coverage screens; the contract repository; pricing engine phase one with golden lines from an independent worksheet). Read docs/adr/*.md and the README first and keep their conventions (@tp/* packages exporting TypeScript source; Vitest projects unit/db/golden; forward-only migrations <YYYYMMDDHHMMSS>_<name>.sql, never edit an earlier one; roles tp_owner, tp_app, tp_operator, tp_app_dev; withPracticeScope / withJobScope / readWithAudit; the route wrapper and registry with generated cross-tenant route tests; the catalog test and catalog-driven cross-tenant tests for every new PHI table; envelope encryption; @tp/money for every amount; ObjectStore and provider interfaces with local implementations; the golden format tp-golden-claim/2 in fixtures/golden/README.md; fixtures from packages/synth). Follow the plan exactly: nothing it does not ask for, nothing it requires skipped. When the plan is silent, choose the simplest option consistent with it, list it under decisions, and write an ADR when non-obvious.
- Never modify CLAUDE.md, .claude/**, docs/product/PRD.md, data-dictionary.md, rules-reference.md, test-matrix.md, milestone-prompts.md, docs/product/diagrams, or .github/workflows/ci.yml. Do not create .claude/settings.json. Never write under content/releases/. Never change an existing golden line's expected values (that is a human step with the specialist); new golden lines may be added.
- Postgres 16 runs at postgres://postgres:test@localhost:5432/postgres (superuser; CI uses postgres:18). If down: su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D /root/pgdata -l /root/pgdata/log.txt -o '-p 5432 -k /tmp' start". ALWAYS run migrations and database tests against your own freshly created scratch database (unique name, dropped after); never migrate the shared "postgres" database. For e2e use your own E2E database name (E2E_ADMIN_URL or the repo's mechanism) so you never drop another agent's.
- Network: npm and PyPI work; cms.gov, x12.org, ncdoi.gov are blocked (403) - do not retry. No Docker, no MinIO, no AWS credentials: AWS/Stripe services sit behind interfaces with local implementations and SDK implementations tested with mocked clients. pyx12 is installed in the venv /root/.venvs/tp-oracle (TP_ORACLE_PYTHON=/root/.venvs/tp-oracle/bin/python).
- Toolchain: Node 22 locally (CI Node 24), pnpm 10.28, Python 3.13. Playwright Chromium is preinstalled (PLAYWRIGHT_BROWSERS_PATH set); never run "playwright install".
- Data: synthetic only (ISA06 SYNTHSENDER, GS02 SYNTH; SYNTHETIC labels on reference data). Never real PHI or real files; never CMS/X12 values typed from memory.
- Decisions already taken: a job is attempted at most three times and the third failure raises the operator alert (ADR 0019, infra/lib/jobs.ts). There is no reimbursement specialist in this session: new golden lines come from the independent worksheet in tools/golden-worksheet, are written before the engine code that prices them, and stay specialist_verified false with questions in fixtures/golden/QUESTIONS.md.
- Quality bar: strict TypeScript; no float on any amount; every behavior has a test; the 100% branch gates on packages/pricing, packages/ledger, packages/edi835 and packages/db/src/authz stay green. Before finishing, run the checks your work touches (pnpm typecheck, lint, lint:logs, test, and as relevant test:db on a fresh scratch database, test:golden, test:oracle, synth --all with a clean git status after, build, test:e2e) and report real outcomes. Never claim a check passed that you did not run.
`
const PARALLEL_NOTE = (mine, theirs) => `
ANOTHER AGENT IS WORKING AT THE SAME TIME on: ${theirs}. You own: ${mine}. Do not edit the other agent's paths. If you must touch a shared file (root package.json, pnpm-lock.yaml, a shared index, the route registry, the nav rail), re-read it immediately before editing and keep the edit minimal. Run pnpm install only at the very start if you need new dependencies. Commit only your own paths (git add <paths>, never git add -A); if git reports an index.lock, wait and retry. If a repo-wide check fails only because of the other agent's uncommitted work, say so rather than editing their files.
`
const BUILD_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    built: { type: 'array', items: { type: 'string' } },
    checks: { type: 'array', items: { type: 'object', properties: { command: { type: 'string' }, passed: { type: 'boolean' }, note: { type: 'string' } }, required: ['command', 'passed', 'note'] } },
    decisions: { type: 'array', items: { type: 'string' } },
    not_done: { type: 'array', items: { type: 'string' } },
    interfaces: { type: 'string', description: 'public APIs, file formats and table names later agents must use' },
    commit: { type: 'string' },
  },
  required: ['summary', 'built', 'checks', 'decisions', 'not_done', 'interfaces', 'commit'],
}
const FINDINGS_SCHEMA = {
  type: 'object',
  properties: {
    findings: { type: 'array', items: { type: 'object', properties: {
      severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
      area: { type: 'string', enum: ['pricing', 'golden', 'runs', 'triage', 'report', 'monitoring', 'releases', 'web', 'db', 'other'] },
      file: { type: 'string' }, issue: { type: 'string' }, plan_reference: { type: 'string' }, fix: { type: 'string' },
    }, required: ['severity', 'area', 'file', 'issue', 'plan_reference', 'fix'] } },
    checks_run: { type: 'array', items: { type: 'string' } },
  },
  required: ['findings', 'checks_run'],
}
const FIX_SCHEMA = {
  type: 'object',
  properties: {
    fixed: { type: 'array', items: { type: 'string' } },
    rejected: { type: 'array', items: { type: 'object', properties: { finding: { type: 'string' }, reason: { type: 'string' } }, required: ['finding', 'reason'] } },
    checks: BUILD_SCHEMA.properties.checks,
    commit: { type: 'string' },
  },
  required: ['fixed', 'rejected', 'checks', 'commit'],
}
const brief = r => r ? JSON.stringify({ summary: r.summary, interfaces: r.interfaces, decisions: r.decisions, not_done: r.not_done }) : 'null (agent failed)'

// ---------------- Round 1
phase('Round 1')
const [runs, phase2] = await parallel([
  () => agent(`${ENV}${PARALLEL_NOTE('pricing-run persistence: packages/db migrations with timestamps 20261018090000-20261018119999 and Drizzle schema for pricing_run and priced_line, the run orchestration (in apps/worker and/or a small module outside packages/pricing, which must stay pure), the worker "price" job, apps/web Pricing runs screen, the line trace page, and Coverage screen numbers', 'packages/pricing (engine phase two), tools/golden-worksheet and fixtures/golden')}

TASK: Pricing runs - the persistence and orchestration the engine runs under (PRD 5 J7, PRD 8 pricing_run and priced_line, PRD 11 inputs and step 9, Milestone 7 prompt "pricing runs with pinned releases and versions"; built now because milestone 6's triage and audit report price from runs). Read PRD 5 (J6, J7), 7 (Pricing runs, Coverage and Claims-and-lines screens), 8 (pricing_run, priced_line, Invariants), 9 (The release pipeline step 4, Why this matters for the audit), 11 (all), the data dictionary rows for pricing_run and priced_line (note ADR 0029 on expected_unrounded), docs/product/unpriced-reasons.md, rules-reference.md (Unpriced reasons and their remedies), test-matrix MAP-01..MAP-05, PRC-12, PRC-14, PRC-15, PRC-19, JOB-01.

Build:
1. Migration(s) and Drizzle schema for pricing_run and priced_line exactly per the data dictionary (PHI tables; unique (pricing_run_id, service_line_id); the indexes the data dictionary lists). A run is created for a practice and a period, pinned to the current rule release and to the contract versions in force on each service date; it records engine_version, created_by, status and a coverage summary; once complete a run and its priced lines never change (triggers for every role); a new release means a new run.
2. Run creation and execution: refuse a run when the requested release does not match what is loaded (rule-release mismatch, J7); price every line of the period through @tp/contracts' resolver and @tp/pricing's price() under exactly one practice (withJobScope); a line whose plan has no mapping is NO_MAPPING and never priced from a guess (MAP-01: pricing refused on an unmapped plan through the existing guard); a run that errors on a line records that line's ENGINE_ERROR and continues; store expected_allowed_cents, expected_unrounded, observed_allowed_cents, variance_cents, unpriced_reason, adjustments_applied, window_ends_on and the full trace per line; compute coverage (priced lines and dollars as a share of all), unpriced reasons by count, and variance by payer pattern.
3. The worker "price" job: idempotent by run ID, one practice per job, singleton per practice, three attempts then the alert; pricing 100,000 lines stays within the PRD 11 target when run end to end (measure and report).
4. Screens: Pricing runs (runs with period, release, versions, coverage, variance by payer pattern; create a run; a run never changes once complete), the line trace page (every step of the trace shown in order with its record and release IDs; readWithAudit), the Claims-and-lines expected-allowed column and status from the latest complete run, and Coverage's priced shares and unpriced reasons by count with remedies (replacing the zero placeholders).
5. db tests: immutability of a complete run, rule-release mismatch refused, MAP-01..MAP-05 through a real run, the trace stored on priced_line recomputes with @tp/pricing's recompute(), JOB-01 replay with no duplicate effects. Register every route.`, { label: 'R1 pricing runs', phase: 'Round 1', schema: BUILD_SCHEMA }),
  () => agent(`${ENV}${PARALLEL_NOTE('packages/pricing, tools/golden-worksheet, fixtures/golden, and new SYNTHETIC fixture releases under fixtures/synthetic/rules/ numbered after the existing ones (if you need more NCCI or MUE values)', 'pricing-run persistence: packages/db migrations, apps/worker pricing-run job and apps/web runs screens')}

TASK: Milestone 7, part A - engine phase two, golden lines FIRST. Read the Milestone 7 prompt; PRD 2 (points 2, 6, 8), 9 (contract rate records: every parameter), 11 (all), 18 (the pricing oracle: "Two hundred lines across five fixture payers by Monitoring v1, covering every method, every adjustment flag on and off, every unpriced reason, rounding at boundaries and reversals"), 20 (timed units default, per-visit supported and case rates unpriced); docs/product/rules-reference.md (commercial contract methods; NCCI; MUE; timed units); fixtures/golden/README.md, QUESTIONS.md and the existing golden claims; packages/pricing as built in milestone 5 and its ADRs; test-matrix PRC-05, PRC-06, PRC-07, PRC-10, PRC-11, PRC-17, PRC-18, PRC-19.

Order of work, which is the point of this task:
1. Extend the independent worksheet (tools/golden-worksheet, Python, no shared code with TypeScript) for FIXED_SCHEDULE (amount per unit for the code and modifier set, times units), LESSER_OF (the lesser of the computed schedule amount and the line charge), PER_VISIT (the per-visit amount once per claim per date across the included codes: the first included line carries it, the others expect zero), UNSUPPORTED (UNSUPPORTED_METHOD), NCCI procedure-to-procedure edits when apply_ncci is on (97140 with 97530 on the same day without a 59 or X modifier raises the review flag PRD 2 and PRC-11 describe; record it, do not change the price unless the plan says so), MUE when apply_ncci is on (units above the MUE value are MUE_EXCEEDED for review, not priced down), the timed-units rule (UNITS_RULE_UNKNOWN already exists for UNKNOWN; MEDICARE_POOLED and PER_CODE recorded as such, units taken as billed until minute logs exist), and contract-specific adjustments (a percentage or a cap the record defines, PRD 11 step 4; add the rate-record parameter in @tp/contracts' terms if it does not exist, keeping old records valid).
2. Add golden claims so that, together with the existing ones, there are at least 200 golden lines across five fixture payers (each payer a synthetic contract with its own methods and flags), covering every method, every adjustment flag on and off, every unpriced reason including MUE_EXCEEDED and UNITS_RULE_UNKNOWN, rounding at boundaries, reversals, and the PRC cases above. Each new claim is written and committed BEFORE the engine code that prices it (commit the worksheet and golden claims first, then the engine), with specialist_verified false and any new judgement calls added to QUESTIONS.md.
3. Then implement those methods and edits in packages/pricing (pure; @tp/money for every step; traces extended so recompute() reproduces every new branch; recompute stays independent of price()), with fast-check properties (PRC-17 doubling units doubles the base for fixed and percent methods; PRC-18 turning a flag off never lowers the amount; per-visit total independent of line order; lesser-of never exceeds either input) and 100% branch coverage.
Done when pnpm test:golden matches every one of the 200 or more golden lines to the cent and every trace recomputes, property tests pass, and coverage stays at 100%.`, { label: 'R1 phase-two golden + engine', phase: 'Round 1', schema: BUILD_SCHEMA }),
])

// ---------------- Round 2
phase('Round 2')
const [triage, diffs] = await parallel([
  () => agent(`${ENV}${PARALLEL_NOTE('packages/triage, packages/db migrations with timestamps 20261018120000-20261018149999 for anomaly, line_status, case, case_line, the audit report generation in apps/worker (PDF through Playwright, CSV), apps/web Anomalies, Cases (report-only list for v0), Reports (audit report) and the reviewer checklist screens', 're-run diffs, release dry-run impact, the run comparison screen and the internal-console Rule releases screen')}

TASK: Milestone 6 - triage, the status model and the audit report. Runs report: ${brief(runs)} Phase-two engine report: ${brief(phase2)}

Read the Milestone 6 prompt; PRD 1 (summary), 3 (Reimbursement reviewer persona), 4 (Audit v0), 5 (J8, J12), 6 (Anomaly screening, Triage and cases, Reports and exports rows), 7 (Anomalies, Cases, Reports screens; dollar figures carry their stage label; "recovered" only beside stage-five amounts), 8 (anomaly, line_status, case, case_line; The status machine; Invariants), 12 (Anomaly screening, From validated to actionable, Deadlines and pursuit cost, Write-offs and reopening, What a customer sees as the headline), 17 (Milestone 6 row), 20 (materiality $5 per line and $250 per case, anomaly cohort minimum 30 lines); the data dictionary rows for anomaly, line_status, case, case_line and practice.settings; docs/product/diagrams/status-machine.svg; test-matrix CAS-01..CAS-07, PRC-14, PRC-15.

Build:
1. Migrations and Drizzle schema for anomaly, line_status, case and case_line per the data dictionary (PHI tables). Five line stages flagged, validated, actionable, payer_approved, recovered: transitions monotonic forward, enforced in SQL; a reopen is an explicit action with a reason and an audit event (reopened_from), and a report generated before the reopen keeps its numbers (CAS-07). Case states open, submitted, awaiting_response, partially_resolved, resolved, closed_written_off derived from lines and submissions, never set by hand except write-off.
2. packages/triage: anomaly cohorts (same payer and plan, code and modifier set, place of service, quarter; at least the practice's minimum, default 30, else no anomaly - CAS-01; modal observed allowed, distribution, lines below the mode by more than the practice's anomaly threshold; output a count and a dollar range labelled investigatory; never in a case or a report total - CAS-02); from validated to actionable exactly per PRD 12 (variance at or above the per-line materiality, default $5, the dispute window open on the triage date (else WINDOW_PASSED, validated not actionable - PRC-14), the claim not reversed or superseded, the version signed off, no open write-off); negative variance recorded and never a case (PRC-15); case grouping by payer pattern from traces (same payer and plan, same rate record, same adjustment behavior such as "MPPR applied where the contract does not allow it" or "prior-year conversion factor"; one case per pattern - CAS-03); case materiality default $250 (smaller patterns accumulate - CAS-04); deadlines as the earliest open window among a case's lines, lines whose windows close struck through and out of the actionable total; pursuit-cost estimate from practice settings (staff rate, minutes per packet, minutes per follow-up) for net expected value; write-offs from the closed reason list (window passed, payer correct on review, not worth pursuit, duplicate, other with text) that leave the actionable total and stay visible (CAS-06). A case total equals the sum of its actionable lines. Pure functions where possible, tested with fast-check.
3. The audit report (v0 deliverable): generated in the worker as a PDF through Playwright and Chromium, plus CSV, with coverage, anomalies, validated discrepancies and actionable amounts kept apart, pursuit cost and evidence gaps (PRD 4 Audit v0); the headline as three numbers (actionable, payer approved, recovered) with flagged and validated below with their labels (PRD 12); every total linked to its stage; stored as an object with its SHA-256; line-level exports role-gated and logged.
4. The independent-reviewer checklist: the reimbursement reviewer role (read-only, PRD 3) reviews an audit report against its contracts and signs an attestation before the report is released; the report cannot be released unsigned.
5. Screens: Anomalies (cohorts with counts, dollars, modal and observed amounts, the investigatory label; open a cohort; mark reviewed; convert to a validation request; hidden below the minimum size), Cases (v0 report-only list by stage, payer, owner, deadline, actionable total; detail with lines, trace links, deadline, pursuit cost; the full workbench is milestone 8), Reports (generate and download the audit report; export history), the reviewer checklist. Register every route.
6. An end-to-end synthetic audit: a test that takes a synthetic practice through upload, parse, mapping, a signed-off contract, a pricing run, triage and the audit report, and asserts the report's numbers line for line against an expected file computed independently. The PRD's check "the three hand-run audits reproduce from the app line for line" needs the three real audits; say plainly that it remains open.`, { label: 'R2 triage + audit report', phase: 'Round 2', schema: BUILD_SCHEMA }),
  () => agent(`${ENV}${PARALLEL_NOTE('re-run diffs and run comparison (code beside the pricing-run orchestration), tools/release dry-run impact, apps/web run comparison screen and the internal-console Rule releases screen, and the customer release note', 'packages/triage, the triage and case migrations, the audit report worker code and the Anomalies, Cases, Reports and reviewer screens')}

TASK: Milestone 7, part B - re-runs under a new release, run diffs, and the rule-release console. Runs report: ${brief(runs)} Phase-two engine report: ${brief(phase2)}

Read PRD 5 (J6 re-run offer, J17), 7 (Pricing runs: compare two runs, re-run under a new release with a diff; Internal console: Rule releases), 9 (The release pipeline, steps 4 and 5), 18 (Releases: a content rollback by loading the previous release, runs pinned to the withdrawn release flagged rather than changed), the Milestone 7 prompt ("re-run diffs under a new release ... a re-run under release 2 lists exactly the changed lines"), .claude/skills/load-release, test-matrix PRC-19, MAP-03.

Build:
1. Re-run: create a new run for the same practice and period under a different release (or after a mapping correction, MAP-03), never changing the original; a diff of two runs listing exactly the lines whose expected allowed, unpriced reason or adjustments changed, with before and after and the cause (release record, version or mapping) from the traces; nothing is accepted until a person accepts the new run.
2. pnpm release:dry-run <n>: now real - for every complete run in the database it names (staging snapshot in production use), price the run's lines under release n in memory and list the runs whose lines would change and how many lines (the impact list the load-release skill pastes into the pull request).
3. A test that builds SYNTHETIC release 2-style data (a new fixture release that changes exactly one RVU) and proves the re-run diff lists exactly the affected lines (PRC-19), and that a content rollback flags runs pinned to the withdrawn release without changing them.
4. Screens: Pricing runs "compare two runs" and "re-run under a new release with a diff"; the internal console Rule releases screen (drafts, checker results from verify-content, published releases, release notes, affected-run diffs; prepare and check, never publish from the app - publishing is CI on merge); the customer release note (what changed, which of their runs would change, a button to re-run). Register every route.`, { label: 'R2 re-run diffs + rule releases', phase: 'Round 2', schema: BUILD_SCHEMA }),
])

// ---------------- Round 3
phase('Round 3')
const monitoring = await agent(`${ENV}
TASK: Milestone 7, part C - monthly monitoring jobs, digests and notifications. Reports - runs: ${brief(runs)} triage: ${brief(triage)} diffs: ${brief(diffs)}

Read PRD 5 (J11, J12 monthly summary), 6 (Monitoring jobs and notifications row), 8 (job and job_run, notification, digest), 15 (Worker), 19 (Monitoring and alerts), the data dictionary's Operations rows (job and job_run, notification, digest), the Milestone 7 prompt ("the monthly monitoring jobs (parse, price, triage, reconcile) with singleton keys, and digests that carry counts and totals only"), test-matrix JOB-01..JOB-04.

Build:
1. Any missing Operations tables (job_run fields beside pg-boss, notification, digest) by migration, per the data dictionary; notification and digest have no PHI column at all (counts jsonb, totals_cents jsonb).
2. The monitoring chain: on each new upload batch (or on a schedule) parse, price under the current versions, triage, and reconcile (reconcile is the ledger's, milestone 9: register the step with a no-op handler that records it ran and leave the seam), each a job with a singleton key per practice and job type and an idempotency key, one practice per job, three attempts then the operator alert and "last run failed" on the practice dashboard data (JOB-02); replay with the same key has no duplicate effects (JOB-01); the worker heartbeat alarm path (two misses) stays as built (JOB-04).
3. Digests: an email digest (SES behind the existing mail interface; links only, never PHI in a body) with counts and dollar totals only - new validated variance by payer, cases nearing deadline, recoveries posted (zero until milestone 9), coverage changes, contracts expiring - and in-app notifications with the same rule (JOB-03: a test proves no PHI column is referenced). Notification preferences live in the user's settings.
4. The monthly variance summary report (J12) as counts and totals by stage, never mixing stages.
5. Integration tests (Vitest against Postgres) running the chain end to end on synthetic files: idempotency under replay, retries and alerts.
Run the full check list before committing. Commit with area "monitoring".`, { label: 'R3 monitoring jobs + digests', phase: 'Round 3', schema: BUILD_SCHEMA })

const reports = { runs: brief(runs), phase2: brief(phase2), triage: brief(triage), diffs: brief(diffs), monitoring: brief(monitoring) }

// ---------------- Review
phase('Review')
const REVIEW_BASE = `${ENV}
You are a READ-ONLY reviewer: run any commands, write only under /tmp/claude-0/review-m6-7-<your lens>, never edit tracked files. The work under review is git diff 36f8cc6..HEAD (milestones 6 and 7). Confirm every finding with a probe (a throwaway test, SQL as the application role, a crafted fixture, an HTTP request) before reporting it. Build reports: ${JSON.stringify(reports)}
`
const reviews = await parallel([
  () => agent(`${REVIEW_BASE}
LENS: payment engine and triage. Apply .claude/agents/payment-engine-reviewer.md to packages/pricing (phase two), tools/golden-worksheet, fixtures/golden, the pricing-run orchestration and packages/triage: floats, rounding before the final step, adjustments without their flag, Medicare rules on commercial lines, per-visit allocation, lesser-of, NCCI and MUE behaving as review not price, contract-specific adjustments, windows computed from the wrong date, traces that cannot recompute, whether the worksheet is still independent of the engine, golden lines added after the engine code that prices them (check git history), the actionable rule (every condition of PRD 12), case grouping by pattern, materiality, deadlines, write-offs and reopen, anomaly cohorts and their exclusion from totals, stage monotonicity, the headline never mixing stages, and whether run immutability and re-run diffs hold. Recompute a sample of the new golden lines by hand.`, { label: 'review: engine + triage', phase: 'Review', schema: FINDINGS_SCHEMA }),
  () => agent(`${REVIEW_BASE}
LENS: security. Apply .claude/agents/security-reviewer.md to everything added: new PHI tables (practice_id, forced RLS, exact tenant policy, registry, generated tests), runs and jobs that could span practices, digests and notifications free of PHI (send one and read it), the audit report PDF and CSV (stored objects sealed with the practice key, opaque keys, line-level exports role-gated and logged), the reviewer role staying read-only, routes missing from the registry, role checks only outside the handler, stage changes or reopens without an audit event, any way to alter a complete run or priced line.`, { label: 'review: security', phase: 'Review', schema: FINDINGS_SCHEMA }),
])
const plan = await agent(`${REVIEW_BASE}
LENS: plan conformance and fresh checkout. First: git clone /home/user/PhysicalTherapy /tmp/claude-0/review-m6-7-plan/repo and run pnpm install --frozen-lockfile, typecheck, lint, lint:logs, verify-content, synth --all (git status clean after), test, test:golden, test:oracle, a fresh database db:migrate + test:db, db:seed, build, test:e2e, cdk:diff; record each failure with output. Then compare with the done-checks of milestones 6 and 7 (docs/product/milestone-prompts.md and PRD 17), PRD 4 (Audit v0 and Monitoring v1 includes), 5 (J7, J8, J11, J12, J17), 6 (Anomaly screening, Triage and cases, Monitoring jobs, Reports rows), 7 (every screen built), 8, 9, 11, 12, 18, 20 (defaults), the data dictionary (every field of every new table), and every PRC, CAS-01..07, MAP and JOB case in the test matrix. Report what is missing, wrong, beyond the plan, or a faked check.`, { label: 'review: plan + fresh checkout', phase: 'Review', schema: FINDINGS_SCHEMA })
const findings = [...reviews, plan].filter(Boolean).flatMap(r => r.findings)
log(`${findings.length} findings (${findings.filter(f => f.severity === 'blocker').length} blockers, ${findings.filter(f => f.severity === 'major').length} major)`)

// ---------------- Fix
phase('Fix')
const FIX_TASK = (label, list) => `${ENV}
TASK: Fix review findings for ${label}. Independent reviewers produced these findings (JSON):
${JSON.stringify(list, null, 1)}

For each: verify it against the code and the plan first. Fix every real blocker and major finding (security findings take the safer fix), and every real minor one that is cheap and in scope. Never edit an existing golden line's expected value: if one is wrong, report it as rejected with the evidence. Do not widen scope beyond the plan. For any finding you judge wrong or out of scope, say why. Run the affected checks and report them. Commit with area "fix".`
const A = findings.filter(f => ['pricing', 'golden', 'runs'].includes(f.area))
const B = findings.filter(f => !['pricing', 'golden', 'runs'].includes(f.area))
const fixA = await agent(FIX_TASK('pricing, golden lines and pricing runs', A), { label: 'fix A: pricing/golden/runs', phase: 'Fix', schema: FIX_SCHEMA })
const fixB = await agent(`${FIX_TASK('triage, the audit report, monitoring, releases, web, database and everything else', B)}

After committing, verify the whole repository from a fresh clone (git clone /home/user/PhysicalTherapy /tmp/claude-0/fix-m6-7-verify; pnpm install --frozen-lockfile, typecheck, lint, lint:logs, verify-content, synth --all with a clean git status after, test, test:golden, test:oracle, fresh database db:migrate + test:db, db:seed, build, test:e2e, cdk:diff) and report each result. If something fails, fix it and commit again.`, { label: 'fix B: triage/monitoring/web + verify', phase: 'Fix', schema: FIX_SCHEMA })

return { reports, findings, fixA, fixB, raw: { runs, phase2, triage, diffs, monitoring } }

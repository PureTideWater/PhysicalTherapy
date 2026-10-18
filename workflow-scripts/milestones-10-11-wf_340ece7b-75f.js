export const meta = {
  name: 'milestones-10-11',
  description: 'Milestones 10-11: model gateway with verifiers, logging, budgets, kill switch and evaluation harness; production compute, Stripe billing, customer sign-in, settings, CSRF, rate limits, status page, SOC 2 Type I checklist; then review and fixes',
  phases: [
    { title: 'Round 1', detail: 'model gateway core || production compute infrastructure' },
    { title: 'Round 2', detail: 'evaluation harness + gateway in the product || Stripe billing' },
    { title: 'Round 3', detail: 'customer sign-in, settings and production readiness' },
    { title: 'Review', detail: 'security, gateway + billing correctness, plan conformance' },
    { title: 'Fix', detail: 'two fix passes and a fresh-clone verification' },
  ],
}

const ENV = `
ENVIRONMENT AND HOUSE RULES (read carefully before anything else):
- Repository: /home/user/PhysicalTherapy (git, branch claude/build-platform). Work only inside it. Commit with messages "<area>: <summary>", a short body, a blank line and exactly these two trailer lines:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014R3xHbQ6gkeorGunia7amR
  COMMIT AT CHECKPOINTS as you go (after each coherent piece that typechecks), not only at the end: this container has restarted several times and a restart loses uncommitted work. Do NOT push. Never put a model name or model identifier in code comments, docs or commit messages (model identifiers live only in configuration, as PRD 14 requires).
- The specification is the plan in docs/product/: PRD.md (sections 1-21), data-dictionary.md, rules-reference.md, test-matrix.md, milestone-prompts.md (opening prompt and done-check per milestone), unpriced-reasons.md, sessions.md. CLAUDE.md and .claude/rules/*.md are house rules; .claude/skills and .claude/agents describe the expected workflow. Milestones 0-9 are built: content pipeline; tenancy, RLS, audit, identity, the route wrapper and registry; synth and the pyx12 oracle; the 835 parser, loader and intake; mapping, coverage, contracts and the specialist queue; the pricing engine, runs and re-run diffs; triage, cases and the audit report; monitoring and digests; packets with the deterministic verifier and two-person approval; the recovery ledger, reconciliation and the ROI statement; the dashboard, reports and journeys J2, J4-J12. Read docs/adr/*.md and the README first and keep their conventions (@tp/* packages exporting TypeScript source; Vitest projects unit/db/golden; forward-only migrations <YYYYMMDDHHMMSS>_<name>.sql, never edit or rename one an earlier commit added; roles tp_owner, tp_app, tp_operator, tp_app_dev; withPracticeScope / withJobScope / readWithAudit; the route wrapper and registry with generated cross-tenant route tests; the catalog test and generated cross-tenant tests for every new PHI table; envelope encryption and sealed objects; @tp/money; provider interfaces with local implementations; the worker's Playwright PDF pipeline; the ESLint rule that already forbids provider SDK imports outside packages/model-gateway). Follow the plan exactly: nothing it does not ask for, nothing it requires skipped. When the plan is silent, choose the simplest option consistent with it, list it under decisions, and write an ADR when non-obvious.
- Never modify CLAUDE.md, .claude/**, docs/product/PRD.md, data-dictionary.md, rules-reference.md, test-matrix.md, milestone-prompts.md, docs/product/diagrams, or .github/workflows/ci.yml. Do not create .claude/settings.json. Never write under content/releases/. Never change an existing golden line's expected values.
- Postgres 16 runs at postgres://postgres:test@localhost:5432/postgres (superuser; CI uses postgres:18). If down: su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D /root/pgdata -l /root/pgdata/log.txt -o '-p 5432 -k /tmp' start". ALWAYS run migrations and database tests against your own freshly created scratch database (unique name, dropped after). For e2e use your own E2E_DATABASE and E2E_PORT. The full database suite takes about 27 minutes; run targeted db test files while iterating and the full suite once before your final commit.
- Network: npm and PyPI work; cms.gov, x12.org, ncdoi.gov, api.stripe.com and the AWS endpoints (including Bedrock) are blocked or unauthenticated here - do not retry them. No Docker, no AWS credentials, no Stripe keys, no model access. Every external service sits behind an interface with a local implementation for dev, tests and e2e, and the real implementation written against the official SDK and tested with mocked clients. Say plainly which done-checks therefore cannot be met here.
- Toolchain: Node 22 locally (CI Node 24), pnpm 10.28, Python 3.13 (pyx12 venv: TP_ORACLE_PYTHON=/root/.venvs/tp-oracle/bin/python). Playwright Chromium is preinstalled (PLAYWRIGHT_BROWSERS_PATH set); never run "playwright install".
- Data: synthetic only. No real PHI, no real files, nothing typed from memory as if it were real reference data.
- Decisions already taken: a job is attempted at most three times and the third failure raises the operator alert (ADR 0019).
- Quality bar: strict TypeScript; no float on any amount; every behavior has a test; the 100% branch gates stay green. Before finishing, run the checks your work touches (pnpm typecheck, lint, lint:logs, test, and as relevant test:db on a fresh scratch database, test:golden, test:oracle, synth --all with a clean git status after, build, test:e2e, cdk:diff) and report real outcomes. Never claim a check passed that you did not run.
`
const PARALLEL_NOTE = (mine, theirs) => `
ANOTHER AGENT IS WORKING AT THE SAME TIME on: ${theirs}. You own: ${mine}. Do not edit the other agent's paths. If you must touch a shared file (root package.json, pnpm-lock.yaml, a shared index, the route registry, the nav rail), re-read it immediately before editing and keep the edit minimal. Run pnpm install only at the very start if you need new dependencies. Commit only your own paths (git add <paths>, never git add -A); if git reports an index.lock, wait and retry. If a repo-wide check fails only because of the other agent's uncommitted work, verify your own work in a clean git worktree of your commit instead, and say so.
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
      area: { type: 'string', enum: ['gateway', 'eval', 'infra', 'billing', 'auth', 'web', 'db', 'other'] },
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
const [gateway, compute] = await parallel([
  () => agent(`${ENV}${PARALLEL_NOTE('packages/model-gateway, packages/db migrations with timestamps 20261029090000-20261029119999 for model_call and eval_example plus their Drizzle schema, the feature flag for the kill switch, and their tests', 'infra/ (production compute)')}

TASK: Milestone 10, part A - the model gateway. Read the Milestone 10 prompt; PRD 1 (rule 1), 4 (v1: model-proposed contract extraction with specialist verification), 5 (J5 v1 path, J9 narrative), 14 (all of it: the four functions, provider and data path, PHI minimization, untrusted input, logging and evaluation, operational limits), 15 (Models row), 16 (Threats: injected instructions, a narrative inventing a number), 19 (model-call cost per practice against budget), 20 (model path: Bedrock behind the gateway interface, revisited at milestone 10); the data dictionary rows for model_call, eval_example and feature_flag; CLAUDE.md ("Call a model outside packages/model-gateway. Give a model tools when it reads a document." under Never); test-matrix MOD-01..MOD-06.

Build:
1. packages/model-gateway as the only code that calls a model: a ModelProvider interface with a Bedrock implementation (Claude through the Bedrock runtime, VPC endpoint in production; SDK client mocked in tests) and an Anthropic API implementation for the HIPAA-ready alternative behind the same interface; the choice is configuration, recorded as an ADR with Bedrock as the default until counsel's read (PRD 20); model identifiers are configuration pinned per prompt version, never a floating alias; a local deterministic provider for dev, tests and e2e that returns fixed outputs keyed by input hash (clearly not a model).
2. The four purpose-typed functions, each with a pinned prompt version, a JSON schema for its output, a verifier, and a model_call log record: proposeContractTerms (contract or exhibit page text, or Textract text for scans; candidate rate_record rows with method, parameters, flags, effective dates and for every field the page number and quoted text; verifier: every quote is a substring of its page text, every amount and date appears in its quote, conflicting candidates flagged not merged - MOD-01, MOD-02), readDenialLetter (v1.5 per PRD 14: build it behind the kill switch and a feature flag defaulting off; PHI minimized - names, DOB, member IDs and claim numbers stripped by exact match before the call where the task allows, never more than one patient's material per call; dates and references must appear in the letter text; category validated against the code list), draftPacketNarrative (the approved pattern-statement inputs with no identifiers at all; a citation marker on every sentence; the output passes through the existing packets verifier - any number, date, code or count not in the inputs, or a sentence without a citation, fails), suggestEvidenceRequests (unpriced reasons and coverage gaps to a checklist phrased for the customer; every item maps to a known reason code).
3. Untrusted input (MOD-04): calls that read documents have no tools and no ability to act; output is a proposal code validates and a person approves; a test feeds a document with embedded instructions and proves nothing changes authority.
4. Logging: model_call rows per the data dictionary (practice, actor, purpose, model identifier, prompt version, input document hashes, output hash, tokens, cost, citations, verifier result, later the reviewer decision and changed fields, latency), in the product's own database only, never text; eval_example per the data dictionary (synthetic or permitted sources only).
5. Operational limits: 60-second timeout with one retry under the same idempotency key; per-practice daily budgets with alerts (MOD-05: calls refused when exceeded); a kill switch feature flag that turns every model feature off and leaves the product working on hand-entered records (MOD-06); prompt text and schemas versioned under packages/model-gateway/prompts/ with a changelog per prompt.
6. Lint: the existing ESLint rule forbids provider SDK imports outside packages/model-gateway; add the milestone's check - a fixture test file that imports the provider directly makes the lint fail (prove it in a test of the lint config).
Commit at checkpoints. Report the APIs in "interfaces".`, { label: 'R1 model gateway core', phase: 'Round 1', schema: BUILD_SCHEMA }),
  () => agent(`${ENV}${PARALLEL_NOTE('infra/ and one new ADR', 'packages/model-gateway and its migrations')}

TASK: Milestone 11, part A - production compute and edge infrastructure in CDK (milestone 1 deliberately left it for now; see ADR 0012 and README). Read PRD 15 (Stack: Compute, Web, Files, Identity, Email, Observability, Infrastructure as code; Environments; Request path for a PHI page; Cost), 16 (Network: WAF with managed rules and rate limits, VPC endpoints, no public database; Dependency and image hygiene: container scanning; Change management), 18 (Releases: tagged images, migrations as a job before the new image receives traffic, rollback by redeploying the previous image), 19 (Monitoring and alerts: uptime checks, certificate expiry, failed sign-in bursts), and the existing infra code and tests.

Build, as shared constructs for dev, staging and production:
1. ECR repositories for web and worker with image scanning on push and immutable tags.
2. ECS Fargate services for the web app and the worker in private subnets, task definitions with secrets from Secrets Manager (application login, cookie secret, operator login only for the worker's platform jobs), the existing task roles, log groups with retention, the worker heartbeat setting the alarm expects, and a one-off migration task run before the new image receives traffic.
3. An application load balancer (HTTPS only, TLS 1.2+, ACM certificate parameter) with a WAF web ACL (AWS managed rule groups plus a rate-based rule) and CloudFront for static assets only; no PHI path cached.
4. Egress the services need (Cognito API and JWKS, SES, Stripe API for billing, the compliance platform) through NAT or interface endpoints, chosen and justified in the ADR; CORS on the documents bucket naming the app origin for presigned uploads.
5. Cognito: the passkey relying-party ID and SES as the email sender (milestone 1 left these).
6. Uptime checks (Route 53 health checks or CloudWatch Synthetics) on the web app and API, a certificate-expiry alarm, and alarms to the operator topic; no alarm text contains PHI.
7. CDK assertion tests for every control above (encryption, private subnets, WAF attached with a rate rule, scan on push, HTTPS only, no public task IPs, health checks, the migration task ordering).
Done when the infra tests pass, cdk synth succeeds for every stack and pnpm cdk:diff passes without credentials. State plainly that nothing has been deployed. Commit at checkpoints.`, { label: 'R1 production compute (CDK)', phase: 'Round 1', schema: BUILD_SCHEMA }),
])

// ---------------- Round 2
phase('Round 2')
const [evalh, billing] = await parallel([
  () => agent(`${ENV}${PARALLEL_NOTE('the evaluation harness (packages/model-gateway/eval or tools/), synthetic contract and narrative evaluation sets generated through packages/synth, and the gateway wiring in apps/web and apps/worker: specialist queue proposals, packet builder narrative drafting, coverage evidence suggestions', 'Stripe billing: a billing package or module, migrations with timestamps 20261029150000-20261029179999, billing screens and webhooks')}

TASK: Milestone 10, part B - the evaluation harness and the gateway in the product. Gateway report: ${brief(gateway)}

Read PRD 14 (Logging and evaluation: "The evaluation set starts with 40 synthetic contracts and exhibits of varied layouts (tables, prose, scanned) ... the gate for a prompt or model change is field-level precision and recall on that set with no regression, run in CI on the synthetic subset ... Narrative drafting has a zero-tolerance gate: any verifier failure on the 300-case synthetic set blocks the change"), 18 (Layers: Model), 5 (J5 v1, J9), 7 (Rate record review, Specialist queue, Packet builder, Coverage), the Milestone 10 done-check, test-matrix MOD-01..MOD-06.

Build:
1. Through packages/synth (registry cases, deterministic): 40 synthetic contracts and exhibits of varied layouts - tables, prose, and scanned (image-only PDFs, with their Textract-style text recorded for the local provider) - each with its ground-truth rate records, page and quote; and the 300-case synthetic narrative set (pattern-statement inputs with no identifiers), each with its required facts. Labelled SYNTHETIC.
2. The harness: runs a provider over the sets and scores field-level precision and recall for contract extraction against ground truth and the zero-failure narrative gate through the packets verifier; stores results against a committed baseline so a prompt or model change that regresses fails. It must run in CI on the synthetic subset through a command CI already calls (ci.yml cannot change; choose a project in pnpm test or pnpm test:golden and document it in an ADR). With no model access here, CI runs the harness against the local deterministic provider; prove the gate works by injecting regressions and verifier failures (a provider that drops a field, misquotes, or adds a figure) and showing the gate fails. State plainly that the real gate needs a model and must be run inside the PHI boundary or with credentials before the milestone closes.
3. In the product, every model feature behind the kill switch and the budget: the specialist queue's proposals awaiting verification (proposeContractTerms on an uploaded contract, then the Rate record review screen verifies each proposed field against its cited page; the reviewer's decision and changed fields go back to model_call; reviewer corrections become eval_example rows only under the data-rights terms flag); the packet builder's "draft narrative" (draftPacketNarrative, verified, edited by a person, approval rules unchanged); the coverage screen's evidence checklist (suggestEvidenceRequests). With the kill switch on, every screen still works by hand (MOD-06) - prove it in e2e.
4. Playwright e2e on the local provider: propose terms for a synthetic contract, verify and approve; draft a narrative, see the verifier pass, approve as a second person; kill switch on and the same journeys work by hand.
Commit at checkpoints.`, { label: 'R2 eval harness + gateway in product', phase: 'Round 2', schema: BUILD_SCHEMA }),
  () => agent(`${ENV}${PARALLEL_NOTE('Stripe billing: a billing module (package or apps/worker + apps/web modules), packages/db migrations with timestamps 20261029150000-20261029179999 for subscription, invoice, usage_snapshot, the webhook route, billing screens in Settings, the ROI statement fees seam', 'the evaluation harness, synthetic evaluation sets, and the gateway wiring in the specialist queue, packet builder and coverage screens')}

TASK: Milestone 11, part B - billing. Read the Milestone 11 prompt; PRD 4 (Monitoring v1: Stripe billing - annual and monthly plans, invoices, ACH; usage-based billing excluded), 5 (J18), 6 (Billing row: "Stripe customers, subscriptions, invoices, ACH and card; firm invoicing by nightly grant count; dunning; suspension rules"; acceptance "A test ACH payment completes; a suspended organization can read but not run"), 8 (subscription, invoice, usage_snapshot: "Billing never reads PHI tables"), 13 (ROI statement: fees paid in the period), 15 (Billing: Stripe, no PHI), 16 (Vendor boundaries: Stripe for non-PHI); the data dictionary rows for subscription, invoice and usage_snapshot.

Build:
1. Migrations and Drizzle schema for subscription, invoice and usage_snapshot per the data dictionary; these are organization-level, never PHI, and billing code never reads a PHI table (enforce with privileges and a test).
2. A BillingProvider interface with the Stripe implementation (official SDK; customers, products and prices for annual and monthly plans and audit invoices, subscriptions, invoices, ACH via us_bank_account and card, webhooks verified by signature, idempotency keys; tested with a mocked client) and a local implementation that simulates Stripe test mode, including test ACH settlement and failure events, for dev, tests and e2e.
3. Dunning and suspension: failed payments follow a dunning schedule; after 30 days the organization is suspended - new runs (pricing, monitoring jobs, packet exports, report generation) are refused with the reason, while data stays readable (PRD 5 J18, PRD 6 acceptance); reinstated on payment. Enforced in the job chain and the route wrapper, and in SQL where a job is created.
4. Usage snapshots nightly (granted_practices, active_practices per organization) as the seam firm per-practice billing uses in milestone 12; the firm invoicing itself is milestone 12.
5. The ROI statement's fees paid in the period now come from paid invoices (the milestone 9 seam).
6. Billing screens in Settings (plan, payment method with ACH or card through Stripe Elements in production and the local simulator in dev, invoices, status and suspension notices) for organization owners; the internal console's billing status per organization.
7. Tests: a test ACH payment completes (local simulator), webhooks are idempotent and signature-checked, a suspended organization can read but not run, nothing billing touches reads PHI.
Commit at checkpoints.`, { label: 'R2 Stripe billing', phase: 'Round 2', schema: BUILD_SCHEMA }),
])

// ---------------- Round 3
phase('Round 3')
const ready = await agent(`${ENV}
TASK: Milestone 11, part C - customer sign-in and production readiness. Reports - gateway: ${brief(gateway)} eval/product: ${brief(evalh)} billing: ${brief(billing)} compute: ${brief(compute)}

Read the Milestone 11 prompt and done-check ("a new customer signs up, enrolls MFA, pays by test ACH and reaches the dashboard, and the readiness checklist is green"); PRD 3 (personas: practice administrator, billing manager, analyst, viewer), 4 (Monitoring v1: customer sign-in with MFA and those roles; SOC 2 Type I), 5 (J1 end to end, J2), 6 (Identity and sessions; Organizations; Agreements; cross-cutting requirements), 7 (Settings screen, Sign-in and MFA; every state), 15 (Request path), 16 (Authentication, Authorization in depth, every control), 19 (Support: in-app help per screen; a support address that creates a ticket), 20 (identity: Cognito revisited at milestone 11; proof level setting deferred from milestone 9); docs/product/sessions.md (CSRF and rate limits arrive now); the milestone 1 auth code (ADR 0016, 0017).

Build:
1. Customer onboarding (J1, J2): the prospect request form on a public page (no PHI: name, organization, locations, payers, billing arrangement), the platform administrator creating the organization and practice and sending the practice administrator invitation (Cognito invitation through SES; local outbox in dev), agreements (BAA, engagement letter, terms, data-rights addendum) recorded from the e-signature vendor's webhook or by upload with hash, the practice administrator accepting the invitation, enrolling MFA, confirming the agreement chain, inviting a billing manager and a viewer. Terms acceptance with version and timestamp per user (re-prompted when the terms version changes).
2. The Settings screen (PRD 7): users and roles, invitations, grants and agreements (practice-level view; firm flows are milestone 12), notification preferences, materiality and pursuit defaults, the proof level (posted or deposited, with the rule for lines already recovered from ADR 0043), the access log (read-only, answers "who read claim X"), export and deletion requests (placeholders until milestone 12, stated), billing (from part B). Administrator-only actions marked.
3. Production readiness: CSRF protection on every mutation (a token bound to the session checked in the route wrapper, plus Origin checks; a generated test proves every registered mutation refuses a missing or wrong token), rate limits (per user and per IP on sign-in, MFA, uploads, exports and mutations, stored in Postgres or a store that works across Fargate tasks; tested), security headers on every response (the full set, with CSP nonces for any inline script), error and maintenance pages (a maintenance flag), a public status page (component status and incidents, no PHI), in-app help per screen and a support address that creates a ticket, and cookie and session settings rechecked against sessions.md.
4. The SOC 2 Type I evidence checklist (PRD 16 SOC 2 and HIPAA evidence; every control in the section 16 table mapped to its criterion and its evidence source - CI job, CDK assertion, database test, runbook, policy document): an internal console screen showing each control's evidence status, and an export the compliance platform ingests (JSON over a CompliancePlatform interface; the vendor is not named in the plan, so the interface and a file export are the deliverable). Policies live in the repository as Markdown with versions under docs/policies/ - write the ones PRD 16 lists as evidence (access control, incident response, change management, vendor management, data retention, workforce and device) as concise, plan-faithful drafts marked for the security official's approval.
5. Playwright e2e for the done-check on the local providers: a new customer is invited, signs up, enrolls MFA, accepts terms, pays by test ACH through the billing simulator and reaches the dashboard; plus CSRF refusal and a rate-limited sign-in.
Run the full check list before your final commit. Commit at checkpoints.`, { label: 'R3 customer sign-in + readiness', phase: 'Round 3', schema: BUILD_SCHEMA })

const reports = { gateway: brief(gateway), compute: brief(compute), evalh: brief(evalh), billing: brief(billing), ready: brief(ready) }

// ---------------- Review
phase('Review')
const BASE_COMMIT = '09af918'
const REVIEW_BASE = `${ENV}
You are a READ-ONLY reviewer: run any commands, write only under /tmp/claude-0/review-m10-11-<your lens>, never edit tracked files. The work under review is git diff ${BASE_COMMIT}..HEAD (milestones 10 and 11). Confirm every finding with a probe (a throwaway test, SQL as the application role, a crafted request, a crafted document) before reporting it. Build reports: ${JSON.stringify(reports)}
`
const reviews = await parallel([
  () => agent(`${REVIEW_BASE}
LENS: security. Apply .claude/agents/security-reviewer.md: any model call outside the gateway (search the whole repo), tools given to a model reading a document, model output reaching a number, a stage, an approval or a submission, prompt injection through a crafted contract or letter, PHI sent to a model (identifiers in narrative inputs, more than one patient per denial-letter call, stripping by exact match), model_call holding text instead of hashes, budgets and the kill switch bypassable, CSRF on every mutation (find one without it), rate limits bypassable across tasks or by header spoofing, security headers and CSP, the public prospect form and status page leaking anything, Stripe webhooks without signature checks or replayable, billing reading PHI tables, suspension bypassable, invitations accepted by the wrong person, terms acceptance spoofable, new tables without RLS, routes missing from the registry, and the CDK: public task IPs, WAF missing, PHI cached at CloudFront, secrets in plain environment variables.`, { label: 'review: security', phase: 'Review', schema: FINDINGS_SCHEMA }),
  () => agent(`${REVIEW_BASE}
LENS: correctness of the gateway, evaluation and billing. Gateway: does every verifier do what PRD 14 says (quotes are substrings of the page; every amount and date appears in its quote; conflicting candidates flagged, not merged; narrative figures matched exactly; every sentence cited; evidence suggestions map to known reasons)? Fuzz each verifier with crafted outputs. Is the model identifier pinned per prompt version? Timeouts and the single retry with the same idempotency key? Do reviewer decisions and changed fields reach model_call? Evaluation: are the 40 contracts really varied (tables, prose, scanned), are precision and recall computed per field correctly, does a regression fail the gate, is the 300-case narrative gate zero-tolerance, and does CI actually run it through a command ci.yml calls? Billing: dunning dates, the 30-day suspension, reinstatement, idempotent webhooks, invoices and the ROI fees from paid invoices only, money in cents.`, { label: 'review: gateway + billing correctness', phase: 'Review', schema: FINDINGS_SCHEMA }),
])
const plan = await agent(`${REVIEW_BASE}
LENS: plan conformance and fresh checkout. First: git clone /home/user/PhysicalTherapy /tmp/claude-0/review-m10-11-plan/repo and run pnpm install --frozen-lockfile, typecheck, lint, lint:logs, verify-content, synth --all (git status clean after), test, test:golden, test:oracle, a fresh database db:migrate + test:db, db:seed, build, test:e2e, cdk:diff; record each failure with output. Then compare with the done-checks of milestones 10 and 11 (docs/product/milestone-prompts.md and PRD 17), PRD 4 (Monitoring v1 includes and excludes), 5 (J1, J2, J18), 6 (Identity, Billing, Admin console, Model gateway, Observability rows and the cross-cutting requirements), 7 (Settings, Sign-in and MFA, the internal console), 14, 15, 16, 19 (Support), 20, the data dictionary (every field of model_call, eval_example, feature_flag, subscription, invoice, usage_snapshot) and MOD-01..MOD-06, SEC-15. Report what is missing, wrong, beyond the plan, or a faked check.`, { label: 'review: plan + fresh checkout', phase: 'Review', schema: FINDINGS_SCHEMA })
const findings = [...reviews, plan].filter(Boolean).flatMap(r => r.findings)
log(`${findings.length} findings (${findings.filter(f => f.severity === 'blocker').length} blockers, ${findings.filter(f => f.severity === 'major').length} major)`)

// ---------------- Fix
phase('Fix')
const FIX_TASK = (label, list) => `${ENV}
TASK: Fix review findings for ${label}. Independent reviewers produced these findings (JSON):
${JSON.stringify(list, null, 1)}

For each: verify it against the code and the plan first. Fix every real blocker and major finding (security findings take the safer fix), and every real minor one that is cheap and in scope. Do not widen scope beyond the plan. For any finding you judge wrong or out of scope, say why. Run the affected checks and report them. Commit with area "fix", at checkpoints.`
const A = findings.filter(f => ['gateway', 'eval'].includes(f.area))
const B = findings.filter(f => !['gateway', 'eval'].includes(f.area))
const fixA = await agent(FIX_TASK('the model gateway and the evaluation harness', A), { label: 'fix A: gateway/eval', phase: 'Fix', schema: FIX_SCHEMA })
const fixB = await agent(`${FIX_TASK('infrastructure, billing, sign-in, readiness, web, database and everything else', B)}

After committing, verify the whole repository from a fresh clone (git clone /home/user/PhysicalTherapy /tmp/claude-0/fix-m10-11-verify; pnpm install --frozen-lockfile, typecheck, lint, lint:logs, verify-content, synth --all with a clean git status after, test, test:golden, test:oracle, fresh database db:migrate + test:db, db:seed, build, test:e2e, cdk:diff) and report each result. If something fails, fix it and commit again.`, { label: 'fix B: infra/billing/web + verify', phase: 'Fix', schema: FIX_SCHEMA })

return { reports, findings, fixA, fixB }

export const meta = {
  name: 'milestone-1-tenancy-security',
  description: 'Milestone 1: tenancy schema with forced RLS, audit log, catalog and cross-tenant tests, identity and sessions, authorization, CDK infrastructure; then review and fix',
  phases: [
    { title: 'Build', detail: 'db tenancy + infra in parallel, then identity/sessions/authz' },
    { title: 'Review', detail: 'security lens and plan conformance with fresh checkout' },
    { title: 'Fix', detail: 'address confirmed findings and re-run checks' },
  ],
}

const ENV = `
ENVIRONMENT AND HOUSE RULES (read carefully before anything else):
- Repository: /home/user/PhysicalTherapy (git, branch claude/build-platform). Work only inside it. When done, commit your work with a message "<area>: <summary>", a short body, then a blank line and exactly these two trailer lines:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014R3xHbQ6gkeorGunia7amR
  Do NOT push. Never put a model name or model identifier in code, comments, docs or commit messages.
- The specification is the plan imported into docs/product/: PRD.md (the build plan, sections 1-21), data-dictionary.md, rules-reference.md, test-matrix.md, milestone-prompts.md (the opening prompt and done-check for every milestone), unpriced-reasons.md and sessions.md. CLAUDE.md and .claude/rules/*.md are the house rules; .claude/skills and .claude/agents describe the workflow the repo expects. Milestone 0 is built: read docs/adr/*.md and the README Development section first, and keep the conventions they establish (package layout, @tp/* names, TypeScript source exports, Vitest projects unit/db/golden with *.db.test.ts and *.golden.test.ts, migration naming <YYYYMMDDHHMMSS>_<name>.sql, roles tp_owner / tp_app / tp_app_dev, @tp/money for every amount). Follow the plan exactly: do not add features it does not ask for and do not skip anything it requires for your task. When the plan is silent, choose the simplest option consistent with it and list it under decisions in your report (non-obvious ones also become an ADR in docs/adr/).
- Never modify CLAUDE.md, anything under .claude/, docs/product/*.md (other than adding new files there when the plan names them), docs/product/diagrams/, or .github/workflows/ci.yml: they are the verbatim plan. Do not create .claude/settings.json (it is added at the very end). Never write under content/releases/. Never edit a migration file that an earlier commit added; add a new migration instead.
- Postgres 16 runs locally at postgres://postgres:test@localhost:5432/postgres (superuser). CI uses postgres:18 at the same URL. If it is down, start it: su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D /root/pgdata -l /root/pgdata/log.txt -o '-p 5432 -k /tmp' start". Tests that need isolation create and drop their own databases (use the existing scratch-database helper).
- Network: the npm registry and PyPI work. cms.gov, x12.org, ncdoi.gov and similar sites are blocked by policy (HTTP 403) - do not retry them. There is no Docker daemon, no MinIO and no AWS credentials. Anything that talks to S3, KMS, Cognito, Bedrock, Textract, SES, GuardDuty or Stripe sits behind an interface with a local implementation used in dev and tests and the real AWS/Stripe implementation used in staging and production (written against the official SDKs, compiled and unit-tested with mocked clients).
- Toolchain: Node 22 locally (CI uses Node 24), pnpm 10.28, Python 3.13 with pip. Chromium for Playwright is preinstalled at /opt/pw-browsers (PLAYWRIGHT_BROWSERS_PATH is set); never run "playwright install". No Google fonts.
- Data: never put real PHI, a real remittance, a real contract, or real CMS/X12 values typed from memory anywhere. Synthetic data only; X12 fixtures use ISA06 "SYNTHSENDER" and GS02 "SYNTH".
- Decision already taken for the whole build (do not re-litigate): a job is attempted at most three times; the third failure raises the operator alert (JOB-02 "Three failures", PRD 10 "parsed at most three times").
- Quality bar: strict TypeScript; no float on any amount; every behavior has a test. Before finishing, run the checks your work touches (at minimum pnpm typecheck, pnpm lint, pnpm lint:logs, pnpm test, plus pnpm test:db on a fresh migrated database, pnpm build, pnpm test:e2e, pnpm cdk:diff as relevant) and report the real outcome of each. Never claim a check passed that you did not run; if something cannot be done in this environment, say exactly what and why.
`

const BUILD_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    built: { type: 'array', items: { type: 'string' } },
    checks: { type: 'array', items: { type: 'object', properties: { command: { type: 'string' }, passed: { type: 'boolean' }, note: { type: 'string' } }, required: ['command', 'passed', 'note'] } },
    decisions: { type: 'array', items: { type: 'string' } },
    not_done: { type: 'array', items: { type: 'string' } },
    commit: { type: 'string' },
  },
  required: ['summary', 'built', 'checks', 'decisions', 'not_done', 'commit'],
}
const FINDINGS_SCHEMA = {
  type: 'object',
  properties: {
    findings: { type: 'array', items: { type: 'object', properties: {
      severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
      file: { type: 'string' }, issue: { type: 'string' }, plan_reference: { type: 'string' }, fix: { type: 'string' },
    }, required: ['severity', 'file', 'issue', 'plan_reference', 'fix'] } },
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

phase('Build')
const [db, infra] = await parallel([
  () => agent(`${ENV}

TASK: Milestone 1, part A - the tenancy and audit foundation in packages/db (plus packages/observability and the worker jobs it needs). Read the Milestone 1 prompt in docs/product/milestone-prompts.md; PRD sections 3 (all), 6 (Organizations, Agreements, Audit log, Observability rows), 8 (Invariants), 15 (Database, Request path for a PHI page), 16 (Tenant isolation, Grants, Encryption, Audit log, Logging discipline, Backups and restore); the data dictionary's Tenancy and access and Operations tables and its conventions paragraph; test-matrix SEC-01, SEC-02, SEC-06, SEC-07, SEC-08, SEC-10, SEC-13; .claude/rules/privacy-and-tenant.md and .claude/skills/new-migration.

ANOTHER AGENT IS WORKING IN infra/ AT THE SAME TIME. Do not touch infra/. Commit only your own paths (git add <your paths>, never git add -A); if git reports an index.lock, wait a few seconds and retry. Avoid adding dependencies; if you must, add them in one pnpm install at the very start.

Build:
1. New migration(s) and the matching Drizzle schema for organization, practice, "user", membership, "grant", agreement, support_grant, phi_table_registry and audit_event, field for field as the data dictionary lists them (keep its names; quote reserved words). Every table that carries practice_id (not null) is a PHI table: practice_id indexed, ENABLE and FORCE ROW LEVEL SECURITY, a policy on practice_id = ANY(current_setting('app.practice_ids', true)::uuid[]) (the practice table itself on id), and a row in phi_table_registry. Tables without a not-null practice_id (organization, "user", membership, agreement with its nullable practice_id, audit_event) still get RLS and the policies the data dictionary's Policy column describes (members only; self and administrators; organization administrators; parties to it; the practice reads its own access log). The application role owns nothing, has no BYPASSRLS, and gets only the privileges each table needs; global tables stay read-only to it.
2. The effective-permission function in SQL (PRD 16, Grants): the allowed-practice set for app.actor_id = memberships intersected with grants in force (scope, starts_at, ends_at, revoked_at), so a revoked or expired grant yields nothing on the next request; a practice-owned organization's members reach their own practices without a grant; internal roles have no standing access (only an unexpired support_grant, max four hours, reaches PHI). A practice must always keep at least one practice administrator (enforced in SQL).
3. A TypeScript transaction API: withActor(actorId) for identity resolution, withPracticeScope({actorId, practiceIds}) that opens the transaction with SET LOCAL app.practice_ids and app.actor_id, and a job helper that takes exactly one practice and refuses more (SEC-06, "one practice per job"). readWithAudit() that writes an audit_event (actor, action, object type and id, practice, grant, purpose, request id) for every PHI read. audit_event is append-only: triggers reject UPDATE and DELETE for every role; the application role can only INSERT and SELECT under policy.
4. The catalog test (*.db.test.ts): every table with a practice_id column is registered, has relrowsecurity and relforcerowsecurity and at least one policy; every registered table exists and qualifies; no table is owned by the application role; no column anywhere is real, double precision or float; money columns ending _cents are bigint; rate columns are numeric(14,6). It must fail when a new PHI table lacks a forced policy (prove it in the test with a throwaway table).
5. Cross-tenant negative tests generated from the schema (add a table, get a test): for every table in phi_table_registry, create rows for practice A through the owner role using a generic row factory driven by the catalog (not-null columns, foreign keys, check constraints, enums), then as the application role scoped to practice B assert zero rows on SELECT, zero rows affected on UPDATE and DELETE, and refusal on INSERT of a row for practice A. Also: an expired grant yields zero rows; a revoked grant denies on the next transaction; a support grant past four hours yields nothing.
6. Application-layer encryption for the (enc) columns the data dictionary marks: an envelope-encryption KeyProvider interface (KMS GenerateDataKey/Decrypt with practice_id as encryption context in production; a local AES-256-GCM implementation for dev and test), per-practice data keys referenced by practice.data_key_ref, encrypt/decrypt helpers, a deterministic keyed hash for the indexed lookup the data dictionary names (claim payer_claim_control_number), and key destruction for the deletion workflow later (a destroyed key makes every ciphertext unreadable; test it).
7. packages/observability: confirm the allowlist in fields.ts covers the new ID fields only; pnpm lint:logs must fail on name, DOB, member ID, claim number or document text fields and on a nine-digit identifier (SEC-07); a canary test logs a synthetic record and asserts the output carries IDs only. Add a test helper or lint that fails when PHI-looking values appear in a URL path, an S3 key or a job payload (SEC-08), used by later milestones.
8. Worker jobs in apps/worker: audit_copy (nightly copy of audit_event rows to write-once object storage through an ObjectStore interface with an Object Lock implementation for production and a local file-system implementation for dev; idempotent per day) and restore_drill (restores the latest snapshot to a scratch instance through an interface; the local implementation does pg_dump/pg_restore into a scratch database, then runs row counts and the catalog test against it and records an evidence row; SEC-13). Retention classes from PRD 19 Data lifecycle as metadata (contract term plus six years; packets and audit seven years), recorded as an ADR since the plan revisits retention at this milestone.

Done when: pnpm db:migrate on a fresh database then pnpm test:db passes with zero cross-tenant rows; the application role cannot UPDATE or DELETE audit rows; the catalog test passes and demonstrably fails on a bad table; pnpm typecheck, lint, lint:logs and test pass. Commit with area "db".`, { label: 'M1a db tenancy + audit', phase: 'Build', schema: BUILD_SCHEMA }),
  () => agent(`${ENV}

TASK: Milestone 1, part C - the AWS infrastructure in infra/ (CDK, TypeScript). Read the Milestone 1 prompt; PRD section 15 (Stack, Environments, Cost), section 16 (Encryption, Network, Backups and restore, Secrets, Change management) and section 19 (Monitoring and alerts, Data lifecycle); docs/adr/0006 (cdk:diff fallback and the planned read-only staging role).

ANOTHER AGENT IS WORKING IN packages/db, packages/observability and apps/worker AT THE SAME TIME. Touch only infra/ (and docs/adr for one new ADR if needed). Do not run pnpm install or add dependencies (aws-cdk-lib and constructs are installed); if something is missing, report it. Commit only your own paths (git add infra docs/adr/<your file>, never git add -A); if git reports an index.lock, wait and retry.

Build, with one stack per environment (dev, staging, production) sharing constructs:
1. Network: a VPC with private subnets for the database and the worker (no public database endpoint), VPC endpoints for S3, KMS, Bedrock runtime, Secrets Manager, CloudWatch Logs and ECR.
2. Database: RDS PostgreSQL, Multi-AZ in production, encrypted with the environment's customer-managed KMS key, point-in-time recovery, daily snapshots retained 35 days, deletion protection in production, credentials in Secrets Manager (owner and application logins separately).
3. Files: S3 buckets for documents (versioning, block public access, TLS-only bucket policy, SSE-KMS with the environment key; the application wraps per-practice data keys under it) and for packets and audit copies (versioning plus Object Lock with a seven-year default retention). No PHI in object keys: keys are opaque IDs.
4. Keys and secrets: a customer-managed KMS key per environment with yearly rotation; grants that let the application generate and decrypt data keys with an encryption context of practice_id only; Secrets Manager secrets with a rotation hook where RDS supports it.
5. Identity: a Cognito user pool with MFA required (TOTP and WebAuthn/passkeys), password policy, no self sign-up in v0, advanced security on, and short token lifetimes consistent with docs/product/sessions.md.
6. Monitoring: the worker heartbeat alarm (a custom CloudWatch metric the worker emits; alarm when two consecutive heartbeats are missed, to an SNS topic for the operator), CloudTrail for the account, GuardDuty with S3 malware protection on the documents bucket.
7. The read-only GitHub OIDC role for the staging diff that ADR 0006 planned (trust limited to this repository's pull requests; ReadOnly plus CloudFormation describe) so cdk:diff can diff against staging in CI once someone configures the secret.
8. CDK assertion tests (Template.fromStack) for every control above: encryption at rest everywhere, no public database, private subnets, Object Lock and retention, key rotation, TLS-only bucket policies, VPC endpoints present, MFA required on the pool, the heartbeat alarm wired to two missed periods. These are the "CDK assertions" evidence of PRD 16.
Compute (Fargate, load balancer, WAF, CloudFront) is milestone 11; do not build it now, but leave the network and security groups ready for it.

Done when: pnpm --filter infra test (or the repo's equivalent) passes, cdk synth succeeds for every stack, pnpm cdk:diff passes without credentials, pnpm typecheck and lint pass. Commit with area "infra".`, { label: 'M1c infrastructure (CDK)', phase: 'Build', schema: BUILD_SCHEMA }),
])

const identity = await agent(`${ENV}

TASK: Milestone 1, part B - identity, sessions and authorization. Part A (packages/db tenancy, RLS, effective-permission SQL function, transaction API, readWithAudit, encryption) and part C (infra) are committed; read them first. Their reports:
PART A: ${JSON.stringify(db)}
PART C: ${JSON.stringify(infra)}

Read: docs/product/sessions.md (every rule), the Milestone 1 prompt, PRD sections 3 (personas table, authorization in code, lifecycle events), 5 (J1, J2, J15, J16), 6 (Identity and sessions, Organizations practices grants, Agreements, Admin console rows), 7 (Sign-in and MFA screen; Internal console; information architecture rules; every screen's empty, loading, error and permission states), 15 (Request path for a PHI page), 16 (Authentication, Authorization in depth); CLAUDE.md ("Every mutation: a server action or route handler with a Zod schema, a role check, a practice-scoped transaction ... and an audit event"); test-matrix SEC-02 (routes), SEC-03, SEC-04, SEC-05, SEC-15.

Build:
1. Authorization helpers in packages/db/src/authz (this path carries the 100% branch-coverage gate): the persona permission matrix from PRD 3 as data (role -> allowed actions, with the "must not" column enforced), effective permission = membership role intersected with grant scope, resolution of the allowed-practice set per request through the SQL function, and requireRole/requirePermission used in handlers. Role-specific actions also get a database check (a SQL function or policy the later packet-approval and grant-change actions call).
2. A single mutation and read wrapper in apps/web (for server actions and route handlers): Zod schema, session and MFA check, role check in the handler, practice-scoped transaction with SET LOCAL app.practice_ids and app.actor_id, an audit event, Cache-Control: private, no-store on PHI responses, opaque IDs only in URLs, and an idempotency or request key guard. Every route and action registers itself in a route registry with its roles and practice scoping; generate cross-tenant negative tests for every registered route from that registry (SEC-02, "every table and route"), so later milestones get tests for free. Nothing relies on middleware alone.
3. Identity: an AuthProvider interface with a Cognito implementation (aws-jwt-verify for tokens; sign-in with the MFA challenge; TOTP enrollment; WebAuthn/passkeys for internal roles; admin global sign-out for revocation; device list and device revoke) and a local DevAuthProvider for dev and tests that enforces the same rules (scrypt or argon2 passwords, TOTP via a standard library, real WebAuthn verification for internal roles so Playwright's virtual authenticator can exercise it, lockout after ten failures). MFA is mandatory: a user without MFA reaches no PHI route.
4. Sessions per docs/product/sessions.md: HttpOnly, Secure, SameSite=Lax cookies; 12-hour absolute expiry; 30-minute idle expiry on PHI screens (SEC-15); memberships and grants re-resolved on every request so revocation and expiry take effect on the next request (SEC-03, SEC-04); sign-in, sign-out, MFA and device events written to the audit log; security events (failed MFA bursts, new-device sign-ins) recorded for the weekly review. Prefer Cognito's own session and device state over new tables; if a table is unavoidable, add it by migration with RLS and explain why in an ADR.
5. Screens (Next.js App Router, server components, @tp/ui, with the empty, loading, error and permission states from PRD 7): the application shell (left rail, practice switcher at the top showing only practices in the allowed set), Sign-in and MFA (sign in, enroll, challenge, device list with revoke, lockout state, hardware-key notice for internal roles), and the minimal internal console v0 needs (PRD 6 Admin console "v0 (minimal)"; PRD 7 Internal console: Organizations and practices with their agreements and grants, and Support with break-glass grants from a ticket: reason, ticket, four-hour expiry, practice administrator notified at creation and expiry with the list of records read - J15). Platform administrators see no PHI without a support grant. Agreements are stored by reference and SHA-256 with version, signer and date; a grant cannot exist without an agreement (PRD 3, 6).
6. Seed: pnpm db:seed creates a synthetic organization, practices, users for every persona and agreements, for dev and e2e. Playwright e2e: sign in with TOTP; an internal role must use a hardware key (virtual authenticator); a user without MFA is refused on a PHI route; idle expiry (use a test clock hook or a short configured idle in the e2e env); a support grant expires at four hours.

Done when: pnpm test:db passes with zero cross-tenant rows for every table and every registered route; pnpm typecheck, lint, lint:logs, test (with the authz coverage gate), build and test:e2e pass. Commit with area "auth".`, { label: 'M1b identity + sessions + authz', phase: 'Build', schema: BUILD_SCHEMA })

phase('Review')
const reviews = await parallel([
  () => agent(`${ENV}

You are a READ-ONLY security reviewer (run commands freely, write only under /tmp/claude-0/review-m1-sec, never edit tracked files). Apply the brief in .claude/agents/security-reviewer.md to everything milestone 1 added (git diff e17ef3f..HEAD): find tables without practice_id or a forced policy, policies that are too broad (a policy that lets practice B see A, a WITH CHECK missing so a row can be written into another practice, SECURITY DEFINER functions without a fixed search_path, functions that leak rows across practices), queries outside a practice-scoped transaction, jobs that span practices, routes or actions that check roles only in middleware or not at all, log fields outside the allowlist, PHI in URLs, keys, filenames, emails or errors, missing audit events, session rules from docs/product/sessions.md not enforced (prove with requests), MFA bypasses, grant revocation or expiry not effective on the next request, support grants that outlive four hours, encryption keys reachable by the wrong practice, and any infra control in PRD 16 missing from the CDK assertions. Write throwaway probes (SQL as the application role, HTTP requests against a dev server, unit tests in /tmp) to confirm each finding. Never declare anything HIPAA compliant. Build reports for context:
A: ${JSON.stringify(db)}
C: ${JSON.stringify(infra)}
B: ${JSON.stringify(identity)}`, { label: 'review: security', phase: 'Review', schema: FINDINGS_SCHEMA }),
  () => agent(`${ENV}

You are a READ-ONLY reviewer (run commands freely, write only under /tmp/claude-0/review-m1-plan, never edit tracked files). First verify from a fresh checkout: git clone /home/user/PhysicalTherapy /tmp/claude-0/review-m1-plan/repo, then pnpm install --frozen-lockfile, pnpm typecheck, pnpm lint, pnpm lint:logs, pnpm verify-content, pnpm test, a fresh database with pnpm db:migrate then pnpm test:db, pnpm db:seed, pnpm build, pnpm test:e2e, pnpm cdk:diff. Record every failure with output. Then compare milestone 1 (git diff e17ef3f..HEAD) with the plan: the Milestone 1 prompt and done-check, the PRD 17 Milestone 1 row and its check ("Cross-tenant tests fail across practices on every table and route; the application role cannot modify audit rows; the restore job runs on staging"), PRD 3, 6, 7, 15 and 16, the data dictionary (every tenancy and operations field: names, types, nullability), docs/product/sessions.md, and test-matrix SEC-01..SEC-15 that fall in this milestone. Report what is missing, wrong, beyond the plan, or a faked check. Build reports for context:
A: ${JSON.stringify(db)}
C: ${JSON.stringify(infra)}
B: ${JSON.stringify(identity)}`, { label: 'review: plan + fresh checkout', phase: 'Review', schema: FINDINGS_SCHEMA }),
])
const findings = reviews.filter(Boolean).flatMap(r => r.findings)
log(`${findings.length} findings (${findings.filter(f => f.severity === 'blocker').length} blockers, ${findings.filter(f => f.severity === 'major').length} major)`)

phase('Fix')
const fix = await agent(`${ENV}

TASK: Fix milestone 1 review findings. Two independent reviewers produced these findings (JSON):
${JSON.stringify(findings, null, 1)}

For each: verify it against the code and the plan first. Fix every real blocker and major finding (security findings take the safer fix), and every real minor one that is cheap and inside milestone 1's scope. Do not widen scope beyond the plan. For any finding you judge wrong or out of scope, say why. Then verify from a fresh clone of your committed work (git clone /home/user/PhysicalTherapy /tmp/claude-0/fix-m1-verify; pnpm install --frozen-lockfile, typecheck, lint, lint:logs, verify-content, test, fresh database db:migrate + test:db, db:seed, build, test:e2e, cdk:diff) and report each result. Commit with area "fix".`, { label: 'M1 fix', phase: 'Fix', schema: FIX_SCHEMA })

return { db, infra, identity, findings, fix }

/**
 * Every control of PRD 16's "Controls and their tests" table, mapped to the SOC 2 trust services criteria and
 * the HIPAA Security Rule safeguards it evidences, and to its evidence sources: the CI job that runs it, the
 * CDK assertion, the database or unit test, the runbook, the policy document, or the record a person keeps
 * (docs/adr/0053). The table's own "Test or evidence" column decides the sources; nothing here adds a control.
 *
 * The criteria are the build's proposed mapping (2017 trust services criteria, the Security Rule's sections),
 * for the security official and the auditor to confirm before the Type I examination; the export says so.
 *
 * Repository evidence (a test, a CI step, an assertion, a runbook, a policy) is checked to exist by
 * controls.test.ts on every build, so the console can show it in place without reading the repository. What
 * only a person can produce (a policy's approval, a review, a tabletop, an attestation, a restore on staging) is
 * a record in compliance_record or restore_drill, which the checklist reads live.
 */

export type ControlId =
  | 'tenant_isolation'
  | 'grants'
  | 'authentication'
  | 'authorization_in_depth'
  | 'encryption'
  | 'audit_log'
  | 'logging_discipline'
  | 'upload_safety'
  | 'secrets'
  | 'backups_and_restore'
  | 'dependency_and_image_hygiene'
  | 'network'
  | 'incident_response'
  | 'change_management'
  | 'vendor_boundaries'
  | 'access_reviews'
  | 'workforce';

export type PolicyId = 'access-control' | 'incident-response' | 'change-management' | 'vendor-management' | 'data-retention' | 'workforce-and-device';

/** The records a person keeps for the checklist (compliance_record.kind), and the restore drill's own. */
export type RecordKind = 'policy_approval' | 'access_review' | 'tabletop_exercise' | 'training_attestation' | 'vendor_review' | 'risk_analysis' | 'security_official' | 'restore_drill';

export type EvidenceSource =
  /** A step of a CI workflow, by the workflow file and the command or action it runs. */
  | { readonly kind: 'ci_job'; readonly workflow: string; readonly step: string; readonly what: string }
  /** A test in the repository, by file and the title (or part of it) of the test that proves it. */
  | { readonly kind: 'database_test' | 'unit_test' | 'e2e_test' | 'cdk_assertion'; readonly file: string; readonly test: string }
  | { readonly kind: 'runbook'; readonly file: string }
  | { readonly kind: 'policy'; readonly policy: PolicyId }
  /** A record a person (or the restore drill) writes, current within its period. */
  | { readonly kind: 'record'; readonly record: RecordKind; readonly withinDays: number; readonly what: string; readonly perWorkforceMember?: boolean }
  /** Collected by the compliance platform from GitHub or AWS directly; nothing the application holds. */
  | { readonly kind: 'external'; readonly system: 'github' | 'aws'; readonly what: string }
  /** Evidence the plan names that a later milestone builds: not in place yet, said plainly. */
  | { readonly kind: 'not_built'; readonly milestone: number; readonly what: string };

export interface Control {
  readonly id: ControlId;
  /** The control's name, exactly as PRD 16's table gives it. */
  readonly name: string;
  readonly implementation: string;
  /** The table's "Test or evidence" column, as the plan words it. */
  readonly planEvidence: string;
  readonly soc2: readonly string[];
  readonly hipaa: readonly string[];
  readonly evidence: readonly EvidenceSource[];
}

const CI = '.github/workflows/ci.yml';
const SUPPLY = '.github/workflows/supply-chain.yml';
const RELEASE = '.github/workflows/release.yml';

export const CONTROLS: readonly Control[] = [
  {
    id: 'tenant_isolation',
    name: 'Tenant isolation',
    implementation: "practice_id on every PHI table; ENABLE and FORCE ROW LEVEL SECURITY; policies on current_setting('app.practice_ids'); application role without ownership or BYPASSRLS; SET LOCAL per transaction; one practice per job",
    planEvidence: 'Catalog test: every table with a PHI marker has a forced policy; cross-tenant negative tests for read, write, bulk job and file access on every table and route, on every pull request',
    soc2: ['CC6.1', 'CC6.3'],
    hipaa: ['164.312(a)(1)', '164.308(a)(4)'],
    evidence: [
      { kind: 'ci_job', workflow: CI, step: 'pnpm db:migrate && pnpm test:db', what: 'the database suite on every pull request' },
      { kind: 'database_test', file: 'packages/db/src/catalog.db.test.ts', test: 'passes on the migrated schema' },
      { kind: 'database_test', file: 'packages/db/src/catalog.db.test.ts', test: 'fails when a new PHI table has no row-level security' },
      { kind: 'database_test', file: 'packages/db/src/cross-tenant.db.test.ts', test: 'reads none of A’s rows' },
      { kind: 'database_test', file: 'apps/web/src/lib/routes/route-tests.db.test.ts', test: 'gives %s of another practice nothing of this practice, and changes nothing of it' },
      { kind: 'policy', policy: 'access-control' },
    ],
  },
  {
    id: 'grants',
    name: 'Grants',
    implementation: 'Scope, dates, approver, agreement; effective-permission function in SQL; revocation checked per request',
    planEvidence: 'A revoked grant denies on the next request; an expired grant yields zero rows',
    soc2: ['CC6.2', 'CC6.3'],
    hipaa: ['164.308(a)(4)', '164.312(a)(1)'],
    evidence: [
      { kind: 'database_test', file: 'apps/web/src/lib/routes/revocation.db.test.ts', test: 'denies the next request after the practice administrator revokes the grant' },
      { kind: 'database_test', file: 'apps/web/src/lib/routes/revocation.db.test.ts', test: 'denies the next request once the grant has expired' },
      { kind: 'database_test', file: 'packages/db/src/access.db.test.ts', test: 'yields zero rows in every tenant table once the grant has expired' },
      { kind: 'policy', policy: 'access-control' },
    ],
  },
  {
    id: 'authentication',
    name: 'Authentication',
    implementation: 'Cognito; MFA required; hardware keys for internal roles; password policy; lockout; session limits',
    planEvidence: 'Integration tests; configuration exported as evidence',
    soc2: ['CC6.1', 'CC6.2'],
    hipaa: ['164.312(d)', '164.308(a)(5)(ii)(D)'],
    evidence: [
      { kind: 'database_test', file: 'apps/web/src/lib/auth/sign-in.db.test.ts', test: 'locks after ten failures' },
      { kind: 'database_test', file: 'apps/web/src/lib/auth/sign-in.db.test.ts', test: 'lets a TOTP sign-in only register a key' },
      { kind: 'database_test', file: 'apps/web/src/lib/routes/route-tests.db.test.ts', test: 'refuses a user without MFA' },
      { kind: 'database_test', file: 'apps/web/src/lib/routes/route-tests.db.test.ts', test: 'refuses a session idle for more than 30 minutes' },
      { kind: 'database_test', file: 'apps/web/src/lib/routes/route-tests.db.test.ts', test: 'refuses a missing or wrong CSRF token' },
      { kind: 'database_test', file: 'apps/web/src/lib/http/rate-limit.db.test.ts', test: 'shares one count across every server' },
      { kind: 'cdk_assertion', file: 'infra/test/identity.test.ts', test: 'requires MFA for every user' },
      { kind: 'cdk_assertion', file: 'infra/test/identity.test.ts', test: 'enforces the password policy' },
      { kind: 'e2e_test', file: 'apps/web/e2e/sign-in.spec.ts', test: 'locks the account after ten failed sign-ins' },
      { kind: 'external', system: 'aws', what: 'the Cognito user pool’s configuration (MFA, password policy, passkeys), exported by the compliance platform' },
      { kind: 'policy', policy: 'access-control' },
    ],
  },
  {
    id: 'authorization_in_depth',
    name: 'Authorization in depth',
    implementation: 'Role checks in handlers and server actions; policies for role-specific actions; no reliance on middleware',
    planEvidence: 'A test calls each mutation with each role',
    soc2: ['CC6.1', 'CC6.3'],
    hipaa: ['164.312(a)(1)', '164.308(a)(4)'],
    evidence: [
      { kind: 'database_test', file: 'apps/web/src/lib/routes/route-tests.db.test.ts', test: 'answers %s as the persona matrix says' },
      { kind: 'unit_test', file: 'apps/web/src/lib/routes/registry.test.ts', test: 'runs every server action through a registered action route' },
      { kind: 'database_test', file: 'packages/db/src/identity.db.test.ts', test: 'role_permission' },
      { kind: 'policy', policy: 'access-control' },
    ],
  },
  {
    id: 'encryption',
    name: 'Encryption',
    implementation: 'TLS 1.2 or later everywhere; RDS encryption; S3 server-side encryption with per-practice data keys under a customer-managed KMS key; key rotation yearly; data keys destroyed on deletion',
    planEvidence: 'Config checks in CI (CDK assertions); a deletion test',
    soc2: ['CC6.1', 'CC6.7', 'C1.2'],
    hipaa: ['164.312(a)(2)(iv)', '164.312(e)(1)'],
    evidence: [
      { kind: 'ci_job', workflow: CI, step: 'pnpm cdk:diff', what: 'the stacks synthesized, and their assertions run with the unit suite' },
      { kind: 'cdk_assertion', file: 'infra/test/encryption.test.ts', test: 'encrypts every data store under the environment key' },
      { kind: 'cdk_assertion', file: 'infra/test/encryption.test.ts', test: 'rotates every 365 days' },
      { kind: 'cdk_assertion', file: 'infra/test/database.test.ts', test: 'accepts only TLS 1.2 or later' },
      { kind: 'cdk_assertion', file: 'infra/test/edge.test.ts', test: 'listens on HTTPS 443 only' },
      { kind: 'not_built', milestone: 12, what: 'the deletion test (a deletion leaves no readable object and destroys the data key)' },
      { kind: 'policy', policy: 'data-retention' },
    ],
  },
  {
    id: 'audit_log',
    name: 'Audit log',
    implementation: 'Append-only audit_event with actor, action, object, practice, grant, purpose, request ID; PHI reads logged through a query wrapper; triggers reject update and delete; nightly copy to S3 Object Lock',
    planEvidence: 'A test proves the application role cannot modify audit rows; a monthly report counts reads by role',
    soc2: ['CC7.2', 'CC4.1'],
    hipaa: ['164.312(b)', '164.308(a)(1)(ii)(D)'],
    evidence: [
      { kind: 'database_test', file: 'packages/db/src/audit.db.test.ts', test: 'refuses UPDATE, DELETE and TRUNCATE by the application role' },
      { kind: 'database_test', file: 'packages/db/src/audit.db.test.ts', test: 'answers "which users read this object" in one query' },
      { kind: 'database_test', file: 'apps/worker/src/platform/audit-copy.db.test.ts', test: 'copies exactly the day’s events, in time order, as JSON lines with seven years of retention' },
      { kind: 'database_test', file: 'apps/web/src/lib/routes/onboarding-routes.db.test.ts', test: 'answers who read an object, newest first, for the practice’s administrators only' },
      { kind: 'not_built', milestone: 12, what: 'the monthly report that counts reads by role' },
    ],
  },
  {
    id: 'logging_discipline',
    name: 'Logging discipline',
    implementation: 'Structured logs with an allowlist of fields; a log lint that fails on name, DOB, member ID, claim number or document text fields; error tracker scrubbing; no PHI in URLs, S3 keys, filenames, emails or job payloads (IDs only)',
    planEvidence: 'The lint runs in CI; a canary test logs a synthetic record and asserts the output',
    soc2: ['CC7.2', 'C1.1'],
    hipaa: ['164.312(b)', '164.308(a)(1)(ii)(D)'],
    evidence: [
      { kind: 'ci_job', workflow: CI, step: 'pnpm typecheck && pnpm lint && pnpm lint:logs', what: 'the log lint on every pull request' },
      { kind: 'unit_test', file: 'packages/observability/src/logger.test.ts', test: 'drops a synthetic patient record that reaches it through a cast (canary)' },
      { kind: 'unit_test', file: 'packages/observability/src/phi-guard.test.ts', test: 'urlPhiFindings' },
    ],
  },
  {
    id: 'upload_safety',
    name: 'Upload safety',
    implementation: 'Pre-signed URLs with content-type and size limits; malware scan before parse; zip limits; original bytes immutable',
    planEvidence: 'Fixture tests with a renamed executable and a zip bomb',
    soc2: ['CC6.8', 'CC7.1'],
    hipaa: ['164.308(a)(5)(ii)(B)', '164.312(c)(1)'],
    evidence: [
      { kind: 'database_test', file: 'apps/worker/src/intake/intake.db.test.ts', test: 'quarantines a renamed executable and the EICAR file before reading further' },
      { kind: 'database_test', file: 'apps/worker/src/intake/intake.db.test.ts', test: 'a zip bomb' },
      { kind: 'unit_test', file: 'apps/worker/src/intake/zip.test.ts', test: 'holds an entry compressed beyond the ratio limit (a zip bomb)' },
    ],
  },
  {
    id: 'secrets',
    name: 'Secrets',
    implementation: 'Secrets Manager; no secrets in the repository (secret scan in CI); per-environment keys; rotation runbook',
    planEvidence: 'Secret scan on every pull request',
    soc2: ['CC6.1', 'CC6.7'],
    hipaa: ['164.312(a)(2)(iv)'],
    evidence: [
      { kind: 'ci_job', workflow: CI, step: 'gitleaks/gitleaks-action@v2', what: 'the secret scan on every pull request' },
      { kind: 'cdk_assertion', file: 'infra/test/database.test.ts', test: 'rotates the owner login by itself' },
    ],
  },
  {
    id: 'backups_and_restore',
    name: 'Backups and restore',
    implementation: 'RDS point-in-time recovery; daily snapshots retained 35 days; S3 versioning; a monthly restore of the latest snapshot to a scratch instance with row counts recorded',
    planEvidence: 'The restore job writes its evidence row; alarms on failure',
    soc2: ['A1.2', 'A1.3', 'CC7.5'],
    hipaa: ['164.308(a)(7)(ii)(A)', '164.308(a)(7)(ii)(D)'],
    evidence: [
      { kind: 'record', record: 'restore_drill', withinDays: 35, what: 'a passing restore drill on staging or production, its row counts and catalog test on the copy' },
      { kind: 'database_test', file: 'apps/worker/src/platform/restore-drill.db.test.ts', test: 'restores the source, passes the row counts and the catalog test on the copy, records the evidence and destroys the copy' },
      { kind: 'cdk_assertion', file: 'infra/test/database.test.ts', test: 'keeps point-in-time recovery and daily snapshots for 35 days' },
      { kind: 'policy', policy: 'data-retention' },
    ],
  },
  {
    id: 'dependency_and_image_hygiene',
    name: 'Dependency and image hygiene',
    implementation: 'Weekly dependency updates; pnpm audit --prod; container scanning; a software bill of materials per release; a license allowlist',
    planEvidence: 'CI gates',
    soc2: ['CC7.1', 'CC8.1'],
    hipaa: ['164.308(a)(1)(ii)(B)'],
    evidence: [
      { kind: 'ci_job', workflow: CI, step: 'pnpm audit --prod', what: 'the dependency audit on every pull request' },
      { kind: 'ci_job', workflow: SUPPLY, step: 'pnpm licenses:check', what: 'the license allowlist on every pull request' },
      { kind: 'ci_job', workflow: SUPPLY, step: 'aquasecurity/trivy-action', what: 'the container scan of both images on every pull request' },
      { kind: 'ci_job', workflow: RELEASE, step: 'sbom-', what: 'a software bill of materials per release image' },
      { kind: 'policy', policy: 'change-management' },
    ],
  },
  {
    id: 'network',
    name: 'Network',
    implementation: 'Private subnets for database and worker; VPC endpoints for S3, KMS, Bedrock; WAF with managed rules and rate limits; no public database endpoint',
    planEvidence: 'CDK assertions',
    soc2: ['CC6.6', 'CC6.1'],
    hipaa: ['164.312(e)(1)', '164.312(a)(1)'],
    evidence: [
      { kind: 'cdk_assertion', file: 'infra/test/network.test.ts', test: 'never exposes the database' },
      { kind: 'cdk_assertion', file: 'infra/test/network.test.ts', test: 'has interface endpoints for KMS, Bedrock runtime' },
      { kind: 'cdk_assertion', file: 'infra/test/edge.test.ts', test: 'limits every address first, then sign-in, with rate-based rules that block' },
      { kind: 'cdk_assertion', file: 'infra/test/edge.test.ts', test: 'applies the AWS managed IP reputation' },
    ],
  },
  {
    id: 'incident_response',
    name: 'Incident response',
    implementation: "A written runbook: detection, containment, forensics, notification clocks (the HIPAA rule's 60 days and the shorter periods customer BAAs set), customer communication templates; a yearly tabletop",
    planEvidence: 'The runbook is in the repository and the tabletop is logged',
    soc2: ['CC7.3', 'CC7.4', 'CC7.5'],
    hipaa: ['164.308(a)(6)(i)', '164.308(a)(6)(ii)'],
    evidence: [
      { kind: 'runbook', file: 'docs/runbooks/incident-response.md' },
      { kind: 'record', record: 'tabletop_exercise', withinDays: 365, what: 'the yearly tabletop, logged' },
      { kind: 'policy', policy: 'incident-response' },
    ],
  },
  {
    id: 'change_management',
    name: 'Change management',
    implementation: 'Pull requests with review, CI gates, tagged releases, migration dry-runs, rollback by image',
    planEvidence: 'Branch protection evidence',
    soc2: ['CC8.1'],
    hipaa: ['164.308(a)(1)(ii)(B)'],
    evidence: [
      { kind: 'external', system: 'github', what: 'branch protection on main: required review and the ci workflow’s checks, collected by the compliance platform' },
      { kind: 'ci_job', workflow: CI, step: 'pnpm db:migrate && pnpm test:db', what: 'migrations applied before the suite on every pull request' },
      { kind: 'database_test', file: 'packages/db/src/migrate.db.test.ts', test: 'migrate --dry-run' },
      { kind: 'policy', policy: 'change-management' },
    ],
  },
  {
    id: 'vendor_boundaries',
    name: 'Vendor boundaries',
    implementation: 'A subprocessor inventory with BAAs (AWS, the e-signature vendor, the compliance platform, Stripe for non-PHI); a data-flow map that matches it',
    planEvidence: 'Reviewed quarterly',
    soc2: ['CC9.2'],
    hipaa: ['164.308(b)(1)', '164.314(a)(1)'],
    evidence: [
      { kind: 'policy', policy: 'vendor-management' },
      { kind: 'record', record: 'vendor_review', withinDays: 92, what: 'the quarterly review of the subprocessor inventory and the data-flow map' },
    ],
  },
  {
    id: 'access_reviews',
    name: 'Access reviews',
    implementation: 'Quarterly review of memberships, grants and internal roles; break-glass grants expire in four hours',
    planEvidence: 'Review records',
    soc2: ['CC6.2', 'CC6.3'],
    hipaa: ['164.308(a)(3)(ii)(B)', '164.308(a)(4)(ii)(C)'],
    evidence: [
      { kind: 'record', record: 'access_review', withinDays: 92, what: 'the quarterly review of memberships, grants and internal roles' },
      { kind: 'database_test', file: 'apps/web/src/lib/routes/route-tests.db.test.ts', test: 'never makes the internal %s a member of the practice’s group' },
      { kind: 'policy', policy: 'access-control' },
    ],
  },
  {
    id: 'workforce',
    name: 'Workforce',
    implementation: 'Training at hire and yearly; device policy (disk encryption, screen lock, no PHI on laptops)',
    planEvidence: 'Attestations',
    soc2: ['CC1.4', 'CC2.2'],
    hipaa: ['164.308(a)(5)(i)', '164.310(d)(1)'],
    evidence: [
      { kind: 'record', record: 'training_attestation', withinDays: 365, perWorkforceMember: true, what: 'each workforce member’s training and device attestation, within the year' },
      { kind: 'policy', policy: 'workforce-and-device' },
    ],
  },
];

/**
 * The program's own evidence (PRD 16, SOC 2 and HIPAA evidence: "the risk analysis is a document with a review
 * date; the security official is named"), beside the controls.
 */
export const PROGRAM_EVIDENCE: readonly Extract<EvidenceSource, { kind: 'record' }>[] = [
  { kind: 'record', record: 'risk_analysis', withinDays: 365, what: 'the risk analysis, reviewed within the year' },
  { kind: 'record', record: 'security_official', withinDays: 100_000, what: 'the security official, named' },
];

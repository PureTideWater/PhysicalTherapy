# 0012. Build every environment's AWS foundation from the same CDK constructs, tested by template assertions

- **Status:** accepted
- **Date:** 2026-10-15
- **Deciders:** founder (engineering)
- **PRD sections:** 14 (provider and data path), 15 (stack, environments, cost), 16 (encryption, network, backups and
  restore, secrets, authentication, change management), 19 (monitoring and alerts, data lifecycle);
  `docs/product/sessions.md`; ADRs 0006 and 0009

## Context

Milestone 1 asks for CDK "for the VPC, RDS, S3 with per-practice KMS data keys, Secrets Manager and the worker
heartbeat alarm", plus Cognito with mandatory MFA, and PRD 16 names "CDK assertions" as the evidence for the
encryption and network controls. The compute (Fargate, load balancer, WAF, CloudFront) is milestone 11, so what is
built now must leave subnets, security groups, a task role and a log group for it to attach to. The repository is
built where there are no AWS credentials, so nothing here can be deployed or diffed against a live account; the
templates are the evidence, and some checks only CloudFormation can make at deploy time.

## Decision

**Shape.** `infra/lib/platform-stack.ts` composes the constructs in `infra/lib/constructs/` into one stack per
environment (`tp-dev`, `tp-staging`, `tp-production`); every difference between them is a field of
`environmentSettings()` in `infra/lib/environments.ts`. Stacks stay environment-agnostic (account and region from
the deploying credentials, as in milestone 0), so each uses two availability zones. Feature flags stay unset in
`cdk.json`: the tests build the app with `new App()`, and a flag that only `cdk synth` saw would make the tested
template differ from the deployed one, so behaviors that matter are explicit props instead (for example
`restrictDefaultSecurityGroup`).

| Setting | dev | staging | production |
| --- | --- | --- | --- |
| Database instance | db.t4g.micro | db.t4g.small | db.t4g.medium, Multi-AZ, deletion protection |
| Object Lock mode (packets, audit copies) | GOVERNANCE | GOVERNANCE | COMPLIANCE |
| User pool deletion protection, stack termination protection | off | off | on |
| Read-only pull-request diff role | no | yes | no |

**Network.** Subnet groups `edge` (public, no public addresses assigned, empty until the load balancer),
`app` (web, worker, rotation functions, endpoints) and `data` (RDS), the last two isolated: no NAT gateway and no
route out of the VPC. Interface endpoints for KMS, Bedrock runtime, Secrets Manager, CloudWatch Logs, ECR API and
ECR Docker, with private DNS, admitting HTTPS from the VPC only; an S3 gateway endpoint on the app route tables.
Web and worker security groups exist now with HTTPS egress only; the database admits PostgreSQL from them and from
the rotation functions, by security group, never by address.

**One key per environment.** A customer-managed key with yearly rotation encrypts every data store in the stack:
the database, the four buckets (SSE-KMS with bucket keys), both secrets, the alert topic, the worker log group and
the CloudTrail files. Services that cannot hold an IAM policy are added to the key policy with conditions where the
service supports them (CloudTrail by trail ARN, CloudWatch Logs by log group). The application's task role may call
`GenerateDataKey` and `Decrypt` directly only when the encryption context is exactly `practice_id`
(`ForAllValues:StringEquals` on `kms:EncryptionContextKeys` plus `Null: false`, so an empty context is refused); its
other uses of the key are through S3 for its three buckets and through Secrets Manager for its own login secret.
These are IAM conditions rather than KMS grants: KMS grants are runtime objects CloudFormation does not manage,
and conditions are declarative and asserted in tests. No `grant*` helper is used for the role, because the bucket
helpers add the key without conditions.

**Files.** `documents` is versioned; noncurrent versions expire after the 35-day backup window (PRD 19: backups 35
days) and stale multipart uploads after seven days. `packets` and `auditCopies` have Object Lock with a default
retention of seven years, written as `Years: 7` through the L1 resource because the L2 construct only writes days.
Production uses COMPLIANCE mode (write-once for everyone); staging and dev hold synthetic copies only and use
GOVERNANCE, the same retention with a permissioned bypass, so a synthetic environment can be cleared. Every bucket
blocks public access, refuses requests that are not TLS 1.2 or later, disables ACLs and is retained when the stack
is deleted. Bucket names are generated; object keys are the application's opaque IDs (the key layout and its
SEC-08 test belong to milestone 3's upload path).

**Database.** PostgreSQL 18 (the major version CI tests), `rds.force_ssl` and TLS 1.2 minimum, gp3 with storage
autoscaling, 35 days of automated backups (point-in-time recovery and the daily snapshot) kept after the instance
is deleted, a final snapshot on removal. No PostgreSQL logs are exported to CloudWatch: an error log can carry the
values of a failing statement. Two logins in two secrets: `tp_owner_login` is the RDS master user (the owner login
of ADR 0009, which `SET ROLE tp_owner`s), `tp_app_login` the application login the role bootstrap creates as a member
of `tp_app`. Both rotate every 30 days through Secrets Manager's hosted PostgreSQL functions in the app subnets. The
owner rotates itself; the application login uses alternating users (the function creates `tp_app_login_clone` and
grants it `tp_app_login`, so the clone inherits `tp_app` through it), and its first rotation waits for the schedule
because the login does not exist until the bootstrap creates it. The application role can read only its own
secret.

**Identity.** MFA required for every user with TOTP as the second factor (no SMS); passkeys (WebAuthn) allowed as a
sign-in factor with user verification required, which Cognito treats as multi-factor; the application requires a
passkey for internal roles. No self sign-up. Twelve-character passwords with all four classes. Threat protection
enforced, which needs the Plus plan. One web client with SRP and choice-based sign-in, no secret, no OAuth or hosted
UI, revocable tokens. Lifetimes from `sessions.md`: refresh token 12 hours (the absolute session), access and ID
tokens 15 minutes (half the 30-minute idle limit), sign-in session 3 minutes. Device tracking stays off, because a
remembered device skips MFA; the device list and the ten-failure lockout are application rules. The passkey
relying-party ID is set when the application's domain exists (milestone 11).

**Monitoring.** The worker already logs `worker heartbeat` as a JSON line per beat (milestone 0). A metric filter on
the worker's log group (`/tp/<env>/worker`, created now and encrypted) counts those lines as the custom metric
`TherapyPlatform/Worker` `Heartbeat`; the alarm fires on two consecutive empty 60-second periods with missing data
treated as breaching, and notifies the operator topic on alarm and on recovery. That is exactly two missed beats only
when the worker beats every 60 seconds, so the deployed worker runs with `WORKER_HEARTBEAT_SECONDS=60` (the stack
outputs the value; the worker's own default of 30 would alarm only after four misses). Operator subscriptions come
from deploy-time context (`tp:operatorEmail`, `tp:operatorSms`), never from the repository. A multi-region
CloudTrail with log file validation; a GuardDuty detector with S3 data-event and RDS login monitoring; Malware
Protection for S3 on the documents bucket, tagging each object with its result; GuardDuty findings of severity 4 or
more go to the operator as one line of finding type, severity and ID, published through an EventBridge role so
neither the topic nor the key admits the EventBridge service.

**Pull-request diff.** The staging stack holds a GitHub OIDC provider and `tp-staging-pull-request-diff`, assumable
only with audience `sts.amazonaws.com` and subject `repo:PureTideWater/PhysicalTherapy:pull_request`, for an hour,
with ReadOnlyAccess plus the CloudFormation describe calls and an explicit deny on object, secret-value, parameter
and decrypt reads. `pnpm cdk:diff` now runs `cdk diff tp-staging --method template`, because creating a change set
needs the deploy role. CI gets credentials only when the workflow is given them, which is a change to
`.github/workflows/ci.yml` (part of the plan's verbatim configuration, so not made here): `permissions:
{ contents: read, id-token: write }` on the job, and before `pnpm cdk:diff` an
`aws-actions/configure-aws-credentials` step with `role-to-assume` set from a repository secret holding the role's
ARN (the `PullRequestDiffRoleArn` output), skipped when the secret is empty so forks keep the synth-only path of
ADR 0006.

## Alternatives considered

| Option | Why not (or when we would switch) |
| --- | --- |
| The worker calls PutMetricData (or writes embedded metric format) | Needs a monitoring endpoint or a logger change; the heartbeat line already exists and the logs endpoint is already required. Switch if sub-minute detection is ever needed (high-resolution metrics) |
| A NAT gateway now | Nothing in milestone 1 needs the internet; milestone 11 adds egress (Stripe, SES) or more endpoints (Cognito) with the compute |
| KMS grants for the practice data keys | Not CloudFormation resources; would need a custom resource and could not be asserted in the template |
| RDS-managed master password | The L2 construct does not model it, the application login needs Secrets Manager rotation anyway, and one rotation mechanism is simpler to evidence |
| COMPLIANCE Object Lock in every environment | Synthetic objects in staging could never be removed for seven years; GOVERNANCE keeps the same default retention there |
| A key per data store | More keys to rotate and attest for no isolation the account boundary and IAM conditions do not already give |
| Recommended feature flags in `cdk.json` | The tested template would differ from the deployed one; explicit props say what each control is |

## Consequences

- `pnpm --filter @tp/infra test` (also part of `pnpm test`) asserts each control on all three templates: encryption
  of every data store under the key and the list of data stores itself, key rotation, private subnets with no
  route out, the endpoints, no public database, TLS-only bucket policies, public-access blocks, Object Lock mode and
  retention, backups, rotation, MFA and token lifetimes (read from `sessions.md`), the heartbeat alarm (and that the
  worker still logs the line it counts), the application role's key conditions, and the diff role's trust.
- Some checks happen only at deploy time and are unproven until the first staging deploy: Cognito's acceptance of
  passkey sign-in with MFA required (if refused, passkeys wait and the identity fallback of PRD 20 is weighed at
  milestone 11), GuardDuty's validation of the malware-protection role, the hosted rotation transform, and the
  OIDC provider (an account holds one per issuer; if staging already has GitHub's, import it instead).
- Milestone 11 inherits the web and worker security groups, the task role, the worker log group, the heartbeat
  interval, the empty `edge` subnets, the passkey relying-party ID, SES for Cognito email, and the egress decision.
- The heartbeat alarm is in ALARM from the first deploy until a worker runs; the operator gets one notification.

## Revisit when

The compute lands (milestone 11), the first deploy to staging runs, or the identity decision of PRD 20 is reopened.

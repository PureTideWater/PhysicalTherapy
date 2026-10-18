# 0049. Run the compute on Fargate behind an HTTPS-only load balancer and WAF, migrate before traffic moves, and egress through NAT for what has no endpoint

- **Status:** accepted; amends [0012](0012-aws-foundation-from-shared-cdk-constructs.md) (network, identity, monitoring),
  [0004](0004-job-singleton-keys.md) and [0019](0019-close-the-standing-access-paths-and-run-platform-jobs-as-an-operator-role.md)
  (pg-boss's login, the deploy job's logins, where the platform jobs run)
- **Date:** 2026-10-16
- **Deciders:** founder (engineering)
- **PRD sections:** 15 (Stack: compute, web, files, identity, email, observability, infrastructure as code; Environments;
  Request path for a PHI page; Cost), 16 (Encryption: TLS 1.2 or later everywhere; Network: WAF with managed rules and
  rate limits, VPC endpoints, no public database; Dependency and image hygiene: container scanning; Change management),
  18 (Releases: tagged images, migrations as a job before the new image receives traffic, rollback by redeploying the
  previous image), 19 (Runbooks: deploy and rollback; Monitoring and alerts: uptime checks, certificate expiry, failed
  sign-in bursts; Monthly costs); milestone 11, part A

## Context

Milestone 1 built the foundation (ADR 0012) and left the compute, the edge, the egress decision, the passkey
relying-party ID and SES for Cognito to milestone 11. The plan asks for ECS Fargate for the web app and the worker behind
an application load balancer with WAF, CloudFront for static assets only, tagged images, migrations run as a job before
the new image receives traffic, rollback by redeploying the previous image, and uptime, certificate-expiry and failed
sign-in alerts. Three gaps in what existed had to be closed for the compute to work at all: the platform jobs have their
own task role (ADR 0019) but the worker worked every queue in one process; pg-boss's login was ADR 0004's open
question, and pg-boss creates its own schema; and the logins the services use were a manual step on a database no person
can reach (private subnets, no bastion). Nothing here can be deployed from the environment the repository was built in
(no AWS credentials), so the templates and their assertion tests are the evidence, as in ADR 0012.

## Decision

**Deploy-time values are CloudFormation parameters** (`infra/lib/deploy-parameters.ts`), so the template the tests assert
is the one CloudFormation deploys and `cdk deploy` keeps each value from the previous deploy: `AppDomainName` (at most 63
characters, the Cognito relying-party limit), `CertificateArn` (ACM, the stack's region), `StaticDomainName`,
`StaticCertificateArn` (ACM, us-east-1, CloudFront's requirement), `MailFromAddress` (its domain a verified SES identity in
the region) and `ImageTag` (default `none`). The condition `Released` (ImageTag is not `none`) gates every service's
desired count and the migration run, so the first deploy creates the repositories before any image exists.

**Images** (`constructs/images.ts`): `tp-<env>-web` and `tp-<env>-worker`, immutable tags, basic scanning on push, KMS
under the environment key, retained, no lifecycle rule (every previous release stays available to roll back to). The
worker image also carries `dist/migrate.js`, `dist/logins.js` and `packages/db/migrations`; both images carry Amazon
RDS's certificate bundle at `/etc/ssl/certs/rds-global-bundle.pem`.

**Compute** (`constructs/compute.ts`): one cluster, three Fargate services and a migration task definition, x86_64
(what CI builds by default), in the `app` subnets with no public address, ECS Exec off, a deployment circuit breaker that
rolls back, each under its own security group and its own log group (`/tp/<env>/web|worker|platform|migration`, a year,
under the environment key, non-blocking with a 25 MiB buffer).

| Task | Runs | Task role | Logins (from Secrets Manager) |
| --- | --- | --- | --- |
| web | the Next.js server behind the load balancer | ApplicationRole | application, queue, cookie-sealing key |
| worker | practice jobs (`WORKER_JOBS=practice`) | ApplicationRole | application, queue |
| platform | platform jobs (`WORKER_JOBS=platform`): audit copy, restore drill, support notices, monitoring schedule | OperatorRole | operator, queue |
| migration | `dist/migrate.js`, then `dist/logins.js` | none (an empty role) | owner, and the three service logins' current username and password |

The worker gained `WORKER_JOBS` (`apps/worker/src/config.ts`): `practice` refuses the operator login, `platform` requires it
and refuses the application login and creates the practice queues without working them; unset (development, tests) keeps
one worker for both. The worker and platform tasks set `WORKER_HEARTBEAT_SECONDS=60`; the platform jobs log to their own
group with their own heartbeat metric and alarm, and their final failures count toward the same job-failure alarm. The
applications read whole URLs, but ECS injects a secret's fields and an alternating-users rotation changes the username,
so each task gets `<VARIABLE>_USERNAME` and `_PASSWORD` from the login's secret and its command is a POSIX shell script
(`infra/lib/launch.ts`) that joins them with the host, port and name, drops the parts and execs the image's own command.
Generated passwords already leave out every character a URL would need escaped; every URL says `sslmode=verify-full` and
Node trusts the RDS bundle (`NODE_EXTRA_CA_CERTS`). The web app's sign-in cookie key is a Secrets Manager secret of 43
letters and digits (32 bytes as base64). The application role gains the three Cognito administrative calls the web app
signs with AWS credentials (`AdminCreateUser`, `AdminGetUser`, `AdminUserGlobalSignOut`) on the environment's pool only.

**pg-boss's login** (settles ADR 0004's open question): a fourth login, `tp_queue_login`, with its own rotated secret
(alternating users, like the application and operator logins), a member of the NOLOGIN role `tp_queue`, which owns the
`pgboss` schema and nothing else and may create schemas in the database (pg-boss's start says `CREATE SCHEMA IF NOT
EXISTS`, which PostgreSQL checks against that privilege first). Every queue connection sets the role at sign-in
(`options=-c role=tp_queue`), so whatever pg-boss creates belongs to the role whichever rotation user is current. It is
a member of neither `tp_app` nor `tp_operator`, so it reads no practice table; the platform task holds no application
login. Checked here on PostgreSQL 16: pg-boss 12 installs, creates a queue and sends a job as that login, and every
`pgboss` object is owned by `tp_queue`.

**The migration task runs before the new image receives traffic** (`constructs/migration-run.ts`). A custom resource
(the CDK provider framework, two inline Node.js handlers in `infra/lib/migration-runner.ts`) starts the migration task
definition of the release in the app subnets and polls it every 15 seconds for up to 50 minutes; the web, worker and
platform services depend on it, so CloudFormation moves none of them to a new task definition until the migration has
exited 0, and a failed migration fails the deploy before any traffic moves. The task applies the migrations as the owner
login, then creates, when missing, `tp_queue` and its schema and the three service logins from their secrets, each in
its own role (`apps/worker/src/deploy/logins.ts`; ADR 0019's deploy job). A login that exists keeps its password: after
creation, rotation owns it. The run starts nothing before the first release, nothing while the stack rolls back (the
previous image runs on the newer schema, which the add, backfill and remove rule keeps safe, and the previous image's
migrator would refuse a history with files it lacks), and nothing for a deploy given `-c tp:skipMigrations=true`: the
deliberate rollback by redeploying the previous image. Context is read for one invocation only, so the next release
migrates again.

**Edge** (`constructs/edge.ts`): an internet-facing application load balancer in the `edge` subnets, one listener on 443
with the `AppDomainName` certificate and `ELBSecurityPolicy-TLS13-1-2-Res-2021-06` (TLS 1.2 and 1.3, forward-secret AEAD
ciphers), no listener on 80 (HTTPS only), invalid header fields dropped, deletion protection in production, a security
group that admits 443 alone and reaches only the web tasks on 3000. The target group checks `/sign-in` (200). A regional
web ACL is attached: a rate-based rule on every request (3,000 per address per five minutes), one on the sign-in pages
and the sign-in API (300), then the AWS managed IP reputation, common and known-bad-input rule groups, with the common
set's 8 KB body rule counted rather than blocked (a server action's form can be larger; uploads go to S3 directly).
Metrics are on and sampled requests off, because a sampled request keeps its headers, session cookies among them.
CloudFront serves `StaticDomainName` with its us-east-1 certificate, TLS 1.2 (2021 policy), HTTPS only: `/_next/static/*`
is cached, fetched from the application's own host over HTTPS with no cookie, header or query string passed on; every
other path is answered 404 by a CloudFront function at the edge and never reaches the application, so no page, route or
PHI is cached or served there. Static responses carry CORS for the application origin, HSTS and `nosniff`.

**Egress.** The `app` subnets now route out through NAT gateways in the `edge` subnets (one per zone in production, one
elsewhere); the `data` subnets still have no route out. The endpoints of ADR 0012 stay, so AWS traffic (KMS, Bedrock,
Secrets Manager, Logs, ECR, RDS, SES, S3) never leaves the VPC.

| What the tasks call | Path | Why |
| --- | --- | --- |
| Cognito user pools API and the JWKS its ID tokens are verified against (`cognito-idp.<region>.amazonaws.com`) | NAT | Sign-in is unauthenticated API calls plus a public JWKS fetch on the same host; an interface endpoint with private DNS would capture that host, and whether it serves those requests could not be confirmed from here. NAT works for all of them |
| SES (digests, support notices) | the existing `email` interface endpoint | Already decided (ADR 0019) |
| Stripe's API (billing, milestone 11 part B) | NAT | No private endpoint |
| The compliance platform's API (the SOC 2 evidence checklist, part B) | NAT | A SaaS API; the platform also reads the account through its own role, which needs no egress |

Security groups cannot name hosts, so HTTPS from the tasks may reach any internet host through NAT; the alternative
controls are listed below.

**Uploads.** The documents bucket's CORS admits a PUT from `https://<AppDomainName>` alone, with exactly the headers the
presigned PUT signs (`apps/web/src/lib/uploads/targets.ts`), and exposes nothing.

**Identity.** The passkey relying-party ID is `AppDomainName`, the value the web app gives WebAuthn (`WEBAUTHN_RP_ID`).
Cognito's own email goes through SES from `MailFromAddress` under its domain's identity (`DEVELOPER` sending account),
written on the L1 resource because the L2 option checks the address at synth time.

**Monitoring.** Uptime and certificate checks are CloudWatch Synthetics canaries in the stack's own region (Route 53
health-check metrics exist only in us-east-1, and the stacks are region-agnostic): the sign-in page (200) and the
sign-in API refusing an empty body (400, which starts no sign-in) every five minutes, and both served certificates
hourly, failing when either has under 30 days left (ACM renews 60 days ahead). Each alarms after two failed runs in a
row, missing runs counting as failed, and on recovery. One script (`infra/lib/uptime-script.ts`, Node's `https` and `tls`
only) whose messages name the host, path and status or the days left. The canaries share a role that writes their
artifacts (a private bucket under the environment key, 35 days), metrics and logs and uses the key only through S3 for
that bucket. Failed sign-in bursts alarm two ways: the web app's second-factor burst and lockout log lines (a metric
filter on the web log group) and any block by the web ACL's sign-in rate rule. Every alarm goes to the operator topic
with fixed text (the environment and a reason); none carries a value from a log line.

**Deploying** (nothing has been deployed). Before the first deploy, outside the stack: the two DNS names and their ACM
certificates (the static one in us-east-1), a verified SES identity for the sender's domain, CDK bootstrap.

1. `cdk deploy tp-<env> --parameters AppDomainName=… CertificateArn=… StaticDomainName=… StaticCertificateArn=…
   MailFromAddress=…` (ImageTag stays `none`): everything is created; no task runs; the heartbeat and uptime alarms
   are in ALARM until the first release. Point the two DNS names at `LoadBalancerDnsName` and
   `StaticAssetsDistributionDomain`.
2. CI builds both images from a release tag and pushes them to `WebRepositoryUri` and `WorkerRepositoryUri` under that
   tag.
3. `cdk deploy tp-<env> --parameters ImageTag=<tag>`: the migration task migrates and creates the logins, then the
   services move to the release.
4. Rollback: `cdk deploy tp-<env> -c tp:skipMigrations=true --parameters ImageTag=<previous tag>`.

## Alternatives considered

| Option | Why not (or when we would switch) |
| --- | --- |
| A Cognito interface endpoint instead of NAT for sign-in | Its private DNS would take over the host the JWKS and the unauthenticated sign-in calls use; switch once those are confirmed to work through it, keeping NAT for Stripe and the compliance platform |
| AWS Network Firewall or Route 53 Resolver DNS Firewall to allow only named egress hosts | Not asked for and a standing cost (Network Firewall especially); the next control to add if egress must be restricted by name |
| Route 53 health checks | Their metrics live in us-east-1 only, so alarms and the operator topic would need a second region |
| The ACM `DaysToExpiry` metric for certificate expiry | Covers the load balancer's certificate only; the CloudFront certificate's metric is in us-east-1. The canary checks what browsers are actually served |
| CloudFront in front of every path, caching static only | CloudFront would carry PHI pages; the plan says static assets only |
| A port-80 listener redirecting to HTTPS | HTTPS only: nothing is answered over plain HTTP |
| A separate stack for the image repositories | ADR 0012 keeps one stack per environment; the `none` image tag solves the first deploy instead |
| Run migrations from CI before `cdk deploy` | The ordering would live outside the template and could not be asserted; a failed migration would still need its own rollback path |
| One worker service for practice and platform jobs | One task role: either the platform jobs lose the operator role or the practice jobs gain it (ADR 0019) |
| pg-boss on the application login | That login would own pg-boss's tables, and the platform task would need it |
| ARM64 (Graviton) tasks | About a fifth cheaper; switch when CI builds arm64 images (Playwright's Chromium supports it) |
| ALB access logs, CloudFront logs, WAF logs | Not asked for; each needs a bucket or log group the key policy and the PHI rules must cover (ALB logs support SSE-S3 only) |
| HTTPS from the load balancer to the tasks | The Next.js standalone server does not terminate TLS; the hop stays in the private subnets |

## Consequences

- `pnpm --filter @tp/infra test` asserts on all three templates: the repositories (scan on push, immutable, KMS), the
  services in the app subnets with no public address, their roles, secrets, commands, heartbeat and log groups, the
  migration run and every service's dependency on it, the HTTPS-only listener and TLS policy, the web ACL attached with
  its rate rules and managed groups, CloudFront serving static paths only, NAT egress for the app subnets alone, CORS,
  the relying-party ID and SES, the canaries and every alarm's target and text; it runs the launch script under `sh` and
  the migration and canary handlers against fakes, and reads the applications' sources for the settings, commands and
  paths it relies on. `apps/worker/src/deploy/logins.db.test.ts` checks the login step on a scratch database.
- Some checks happen only at deploy time and are unproven until the first staging deploy: the provider framework and the
  migration task in a real account, Cognito's acceptance of the relying-party ID and of SES, the Synthetics runtime
  (`syn-nodejs-puppeteer-13.0`), the WAF metric dimensions the sign-in alarm reads, ECR pulls of KMS-encrypted images, and
  the RDS bundle download in the image build (the images have not been built here: no Docker).
- Costs over milestone 1: NAT gateways (an hourly charge each plus per-gigabyte processing; two in production), the load
  balancer, the web ACL and its rules, two canaries every five minutes and one hourly, CloudFront, and Fargate at the sizes
  in `environments.ts` (a quarter vCPU for web and platform, half for the worker), roughly in line with PRD 19's Fargate
  line. At list prices the interface endpoints of ADR 0012 alone come close to PRD 19's line for the load balancer,
  endpoints, WAF, GuardDuty and logs; revisit them with the first bill.
- Part B and later work inherit: building the web image with Next's `assetPrefix` set to `StaticAssetsOrigin` (until then
  static files load from the application host and CloudFront is unused) and allowing that origin in the security headers;
  Bedrock (`bedrock:InvokeModel`) and, once a reader is wired, Textract permissions on the application role, which the
  model gateway and contract intake decide; a status page, which can take over the API uptime check.
- A task started before two rotations of its login loses its connection (alternating users keep the previous password
  for one period, 30 days); releases replace the tasks more often than that.

## Revisit when

The first staging deploy, the first bill, a confirmed Cognito endpoint for sign-in and JWKS, CI building arm64 images, or
a decision to restrict egress by host.

# 0049. Run the compute on Fargate behind an HTTPS-only load balancer and WAF, migrate before traffic moves, and egress through NAT for what has no endpoint

- **Status:** accepted; amends [0012](0012-aws-foundation-from-shared-cdk-constructs.md) (network, identity, monitoring),
  [0004](0004-job-singleton-keys.md) and [0019](0019-close-the-standing-access-paths-and-run-platform-jobs-as-an-operator-role.md)
  (pg-boss's login, the deploy job's logins, where the platform jobs run); amended by PR 6b-3 (below: the screening
  consumer's service, role, login, egress, alarms and launch value, the release's images, and the web's size by the
  founder's ruling of 2026-10-22)
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
  in `environments.ts` (a quarter vCPU for web and platform, half for the worker; the web half a vCPU and 1 GiB since
  the founder's ruling of 2026-10-22, the amendment below), roughly in line with PRD 19's Fargate line. At list prices
  the interface endpoints of ADR 0012 alone come close to PRD 19's line for the load balancer, endpoints, WAF,
  GuardDuty and logs; revisit them with the first bill.
- Part B and later work inherit: building the web image with Next's `assetPrefix` set to `StaticAssetsOrigin` (until then
  static files load from the application host and CloudFront is unused) and allowing that origin in the security headers;
  Bedrock (`bedrock:InvokeModel`) and, once a reader is wired, Textract permissions on the application role, which the
  model gateway and contract intake decide; a status page, which can take over the API uptime check.
- A task started before two rotations of its login loses its connection (alternating users keep the previous password
  for one period, 30 days); releases replace the tasks more often than that.

## Revisit when

The first staging deploy, the first bill, a confirmed Cognito endpoint for sign-in and JWKS, CI building arm64 images, or
a decision to restrict egress by host.

## Amendment (PR 6b-3, 2026-10-21): the screening's own consumer, and the release's images

Audit #53 parts 3 and 4 and decisions 13 to 16 (the founder's rulings of 2026-10-20), built under the founder's answers
of 2026-10-21 (about 22:30 UTC) to PR 6b's questions, every recommended answer accepted: Q1, the consumer's size and cost
and production's consumer held until launch; Q7, the account's share and the day's cap; Q8, the capacity test as a
required check; Q12, the "sent" page's wording. docs/adr/0062 holds the screening's side; 0014 and 0019 the job split and
the role.

**A fourth service.** The compute table gains a row:

| Task | Runs | Task role | Logins (from Secrets Manager) |
| --- | --- | --- | --- |
| screening | the free screening's pricing (`WORKER_JOBS=screening`), three screenings at once, one worker thread each | ScreeningRole | screening, queue |

- **Size and count** (`environments.ts`, `compute.screening`): 2 vCPU and 4,096 MiB (Fargate's least memory at 2 vCPU),
  `concurrency` 3, `desiredCount` 1, x86_64 until arm64 images exist (audit #136). Every environment has the same size,
  so staging measures production's task. One task per service still holds: the screening service runs one, at a fixed
  count, with no Application Auto Scaling target (asserted in `infra/test/compute.test.ts`). Three at once replaces audit
  #53's "two at a time": two measured 55.8 s against the 48-second line.
- **When it runs** (`starts`): staging and development run it once released (`countOnceReleased`); production runs no
  task until the `ScreeningConsumer` parameter is `running` or the deploy carries a launch value (condition
  `ScreeningConsumerRunning`: released, and either running or a launch value other than `closed`, which the app
  computes at synthesis; Q1 (b)), so no deploy can
  open the screening with no consumer to price it (the review of 2026-10-22: a launch value with `ScreeningConsumer`
  left at `held`, or reset to it by a rollback across PR 6b-3, would have opened the form with nothing pricing and no
  alarm). Its heartbeat alarm counts a missing beat as missed only under that condition, so it is OK while the consumer
  is rightly held and alarms if it does not beat whenever the screening can open.
- **Heap** (#31's explicit limit; the plan's G3): the container runs `node --enable-source-maps
  --max-old-space-size=896 dist/main.js` (`COMMANDS.screening`), and the main thread and each pricing thread hold at
  most 896 MiB of old generation (`apps/worker/src/screening/threads.ts`): Node gives a worker thread its process's
  `--max-old-space-size` whatever its `resourceLimits` ask (measured on Node 24: a thread asking 1,024 MiB under a flag
  of 512 got 512), so one limit serves every isolate, and the design's 512 for the main thread with 1,024 for each
  thread could not hold. 4 x 896 = 3,584 MiB stays under 90% of 4,096 (`infra/test/screening.test.ts` reads the
  worker's own constants), so a thread out of memory fails alone.
- **Settings**: the common ones, `WORKER_JOBS=screening`, `WORKER_HEARTBEAT_SECONDS=60`, `SCREENING_CONCURRENCY`,
  `MAIL_FROM`, `APP_ORIGIN` and `STATIC_ASSET_ORIGIN`; `SCREENING_DATABASE_URL` (its own login) and `QUEUE_DATABASE_URL`
  (pg-boss's, role `tp_queue`). Stop timeout 120 seconds, Fargate's most: the consumer drains up to 110 and exits at 115.
- **ScreeningRole** (`constructs/screening-role.ts`; the plan's G4): `ses:SendEmail` on MailFromAddress's identity (its
  domain, or the address where that is verified too) with the condition `ses:FromAddress` equal to MailFromAddress, and
  nothing else; the login reaches the container through the execution role. PR 6b-4 narrows it to the screening's own
  identity and configuration set.
- **Its login** (`constructs/database.ts`): `tp_screening_login`, a seventh secret under the environment key, rotated
  every 30 days with alternating users like the other service logins. The migration task reads its current username
  and password (`TP_SCREENING_LOGIN_USERNAME`, `_PASSWORD`) and creates it when missing; it may `SET ROLE tp_screening`
  and inherits nothing (ADR 0019's amendment).
- **Egress, a deliberate exception to the app tier's "HTTPS anywhere"** (`constructs/network.ts`): the screening's
  security group admits nothing and sends HTTPS only to the interface endpoints' security group (Secrets Manager,
  CloudWatch Logs, ECR, SES) and to S3 by the region's S3 prefix list (the image layers, through the gateway), and
  PostgreSQL only to the database. No rule names an address range, so the NAT gateways, and the internet behind them,
  are out of its reach: the service that prices what strangers upload reaches no host but AWS's. The S3 prefix list's
  ID differs by region and has no CloudFormation attribute, so a deploy-time lookup reads it by its fixed name
  (`com.amazonaws.<region>.s3`; an `AwsCustomResource` making the one read-only call `ec2:DescribeManagedPrefixLists`,
  logging to `/tp/<env>/network-lookup` under the environment key).
- **Logs, metrics and alarms** (`constructs/monitoring.ts`, contract `infra/lib/screening.ts`; namespace
  `TherapyPlatform/Screening`, no dimension on any metric): the log group `/tp/<env>/screening`; `Heartbeat` (two missed
  beats, and on recovery); its final job failures toward the job-failure alarm; `TimeToEmailMs` from `screening result
  emailed`, from the web's receipt of the upload until the send returned (Maximum above 60,000 in five minutes, the
  promise; the waiting tier logs `screening result emailed after waiting` and stays out of it); `OldestQueuedMs` from the
  sweep's `screening queue` gauge of the normal tier (Maximum above 120,000 two minutes in a row); `RunFailed` (any
  error line, or a run out of attempts); and, from the web's group, `UploadsSentToWait` (an upload over its account's
  share or the day's cap, any in an hour).
- **The web** gains `IMAGE_TAG` (the `ImageTag` parameter), `SCREENING_LAUNCH` and `SCREENING_SLOTS` (tasks x threads, 3):
  the slots decide the "sent" page's "a few minutes".

**One parameter and a computed launch value** (`deploy-parameters.ts`, `screening-launch.ts`). `ScreeningConsumer`,
`held` (the default) or `running`, counts only where the consumer starts at launch. The screening's launch value,
`closed` or `<tag>:<SHA-256>` (pattern `^(closed|v[0-9A-Za-z.-]{1,60}:[0-9a-f]{64})$`: the tag and the SHA-256 of its
passing capacity report), is not a parameter (the founder's ruling of 2026-10-22): the CDK app computes it at synthesis
from `-c tp:launchReport=<file> -c tp:launchTag=<tag>` by running `launchCheck()` on the images the stack deploys,
`<WebRepositoryUri>:<tag>` and `<WorkerRepositoryUri>:<tag>` in the deploy's account and region (`CDK_DEFAULT_ACCOUNT`,
`CDK_DEFAULT_REGION`), each pulled from ECR first, and writes it into the web's `SCREENING_LAUNCH` and the
`ScreeningLaunch` output. The rule `ScreeningLaunchImageTag` (the template's Rules) refuses a deploy whose `ImageTag` is
not the tag it names. A report the check refuses stops the synthesis, naming decision 13 and each reason; no report
gives `closed`; context that would set the value by hand (`-c ScreeningLaunch`, `-c tp:screeningLaunch`) stops the
synthesis, and with no such parameter declared CloudFormation refuses `--parameters ScreeningLaunch=…`. A production web
opens the screening only when the value names the `IMAGE_TAG` it runs (decision 13). A launch value starts the consumer
(the condition `ScreeningConsumerRunning`, settled at synthesis: released, and `ScreeningConsumer=running` or a launch
value), and a deploy without one stops it only while `ScreeningConsumer` is still `held` (from launch on, every deploy
passes `running`). *As first built*, `ScreeningLaunch` was a parameter the deployer passed from the check's printed
value: the stack checked its form and the web its tag, but neither could tell a printed value from one typed by hand.

**The release's images** (`.github/workflows/release.yml`; decision 13 bound to both images). The release builds the
worker image and the web image three times (`web` with no static host, `web-staging` and `web-production` with each
environment's, from the repository variables `STAGING_STATIC_ASSET_ORIGIN` and `PRODUCTION_STATIC_ASSET_ORIGIN`), scans
each and writes its SBOM, measures the screening with time enforced on exactly `web-production` and `worker` as built,
on the capacity workflow's runner, and pushes exactly the images it scanned (loaded from the build's saved copies, each
ID checked), never a rebuild. Before this, the release pushed a second build of what it scanned, and the deploy built the
web image locally, unscanned. The report, its SHA-256 and its summary are the tag's release assets, from the one job that
may write contents. A failed measurement does not hold a security fix back; it keeps the screening closed. The deploy
copies the images into the environment's repositories unchanged and names the report to the CDK app, which runs the
launch check at synthesis (docs/runbooks/deploy-and-rollback.md, steps 3 and 4).

**The web's size (the founder's ruling of 2026-10-22 on the sizing question, O9).** The web task is half a vCPU and
1,024 MiB in every environment (`compute.web`: `cpu: 512, memoryMiB: 1024`), from a quarter vCPU and 512 MiB: the
review round of 2026-10-22 found the web's quarter vCPU the largest share of the worst capacity time (three 11-MB uploads
at once reached the queue after 14.6 to 16.0 s on it, 6.9 s on half a vCPU), and CI's run on 7abb99c measured a worst
of 46.0 s against the 44-s question. The consumer stays one task of 2 vCPU and 4 GiB with three threads; only if CI's
worst time is still above 44 s with the larger web do a 4 vCPU and 8 GiB consumer and GitHub's 8-core runner go back to
the founder, and the 48-s line and the 44-s question do not change. The capacity harness measures the web at this size,
read from the same declaration, and the launch check refuses a report measured at another. The web's command sets no
heap flag: Node 24 sizes V8's heap from the container's memory limit (a 560 MiB heap limit at 1 GiB, 259 MiB at 512
MiB, measured), so the heap follows the task.

**Cost** (PRD 19, the founder's Q1 of 2026-10-21; prices read from search results, to be read again on AWS's own pages
before the first deploy, open item O12): the consumer about $74.50 a month per environment once it runs (about $60.10 on
ARM after #136); staging always on; production about $0.40 a month (its secret) until launch. A 4-core larger runner for
the capacity workflow and the release's measurement once the repository is private, about $22 a month. The web at half
a vCPU and 1 GiB (the founder's ruling of 2026-10-22): about $18.02 a task a month instead of $9.01 (us-east-1
on-demand, x86, 730 hours: $0.04048 a vCPU-hour and $0.004445 a GB-hour), so about $36.04 a month in production's two
tasks instead of $18.02 (+$18.02), and about $18.02 in staging's one instead of $9.01 (+$9.01); dev's stack, when
deployed, likewise +$9.01. Every price is to be read again on AWS's pages before it is relied on (O12).

**Revisit when** staging measures the runner-to-Fargate factor (decision 15), arm64 images exist (#136), the screening's
own sending identity arrives (PR 6b-4), or a zone's loss costing about 3 minutes of screening is no longer acceptable
(a second task, about $72 a month more).

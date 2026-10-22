# Deploy and rollback

Trigger: a release tag (PRD 19 Runbooks; PRD 18 Releases). The stack and its order are ADR 0049's; this is the
procedure a second person follows. Nothing here needs, or may use, a customer's data: checks use the synthetic smoke
accounts and the health endpoint.

## Before the first deploy of an environment

Outside the stack, once: the two DNS names (`AppDomainName`, `StaticDomainName`) and their ACM certificates (the static
one in us-east-1), a verified SES identity for the sender's domain, CDK bootstrap in the account and region. Then:

```
cdk deploy tp-<env> --parameters AppDomainName=… CertificateArn=… StaticDomainName=… StaticCertificateArn=… \
  MailFromAddress=… SupportEmail=… SecurityEmail=…
```

`SecurityEmail` is the address `/.well-known/security.txt` and the disclosure page (`/security`) give for vulnerability
reports: a mailbox the security official reads, on a domain whose mail reaches it. It is never the support address,
whose mail opens tickets only for accounts (the web app refuses to start with the two equal), and it is not on the
support address's domain while that domain's mail goes to SES: the stack's receipt rule set holds only the support
recipient (`infra/lib/constructs/support-mail.ts`), so a report sent there would never reach a person, unless a receipt
rule for the security address is added first. An environment deployed before this parameter existed takes it on its next
deploy: pass `SecurityEmail=…` once.

`ImageTag` stays `none`: everything is created and no task runs (the heartbeat and uptime alarms stay in ALARM until the
first release). `ScreeningLaunch` stays `closed` and `ScreeningConsumer` `held` (their defaults; ADR 0062, decision 13
and the founder's Q1 (b) of 2026-10-21). Point the two DNS names at the `LoadBalancerDnsName` and
`StaticAssetsDistributionDomain` outputs. Write the Stripe keys (docs/runbooks/billing.md) and set up support mail
(docs/runbooks/support-mail.md).

Once the environment's `StaticAssetsOrigin` output exists, set the repository variable the release builds its web image
with (Settings, Secrets and variables, Actions, Variables): `STAGING_STATIC_ASSET_ORIGIN` or
`PRODUCTION_STATIC_ASSET_ORIGIN`, the output's value. A release tagged before it is set builds that web image with no
static host (its assets load from the application host), and says so in the build's log.

## A release

1. **Tag.** Merge to main with CI green and the founder's approval, then the founder creates the tag
   `v<major>.<minor>.<patch>` on main's merged commit (docs/runbooks/github-governance.md, 4C: only the founder can).
   The release workflow (`.github/workflows/release.yml`) builds the worker image and three web images (`web` with no
   static host, `web-staging` and `web-production` with each environment's), scans each and writes its software bill of
   materials, measures the screening's capacity with time enforced on exactly `web-production` and `worker` as built, and
   pushes exactly the images it built and scanned, never a rebuild, to the repository's container registry under the
   tag. It keeps the capacity report (`screening-capacity.json`), its SHA-256 and its summary as assets of the tag's
   GitHub release (a draft release when the tag had none). A failed measurement does not stop the push; it keeps
   production's screening closed (docs/runbooks/screening-capacity.md says how to read a red run). Before anything below,
   check that the tag names a commit on main; this must exit 0:

   ```
   git fetch origin --tags && git merge-base --is-ancestor <tag> origin/main
   ```

   If it does not, stop: the tag is not a reviewed release, and the deploy waits for one that is (the change-management
   policy, rule 5).
2. **Images for the environment.** Copy the release's images unchanged, never a local build, so the environment runs
   what was scanned and, in production, what was measured (the copy keeps each image's ID):

   ```
   docker pull ghcr.io/puretidewater/physicaltherapy/web-<env>:<tag>
   docker pull ghcr.io/puretidewater/physicaltherapy/worker:<tag>
   docker tag ghcr.io/puretidewater/physicaltherapy/web-<env>:<tag> <WebRepositoryUri>:<tag>
   docker tag ghcr.io/puretidewater/physicaltherapy/worker:<tag> <WorkerRepositoryUri>:<tag>
   docker push <WebRepositoryUri>:<tag> && docker push <WorkerRepositoryUri>:<tag>
   ```

   `<env>` is `staging` or `production` (each built with its own static host, so pages load their assets from
   CloudFront; ADR 0055); the plain `web` image, with none, is for an environment without CloudFront. The repositories'
   tags are immutable: a tag is never pushed twice.
3. **The launch check (production; decision 13, test matrix SCR-20).** Production's screening opens only for a passing
   capacity report of the tag being deployed, with time enforced, on both image IDs. Download the release's report and
   run the check on the images ECS will run: the copies step 2 pushed to ECR, pulled back from it (removing the local
   ECR tags first, so the pull reads ECR's manifest rather than the copy already on this machine):

   ```
   gh release download <tag> --pattern screening-capacity.json --dir <dir>
   docker image rm <WebRepositoryUri>:<tag> <WorkerRepositoryUri>:<tag>
   docker pull <WebRepositoryUri>:<tag> && docker pull <WorkerRepositoryUri>:<tag>
   pnpm exec tsx tools/screening-capacity/launch-check.ts --report <dir>/screening-capacity.json --tag <tag> \
     --web-image <WebRepositoryUri>:<tag> --worker-image <WorkerRepositoryUri>:<tag>
   ```

   It prints `ScreeningLaunch=<tag>:<the report's SHA-256>`, or each reason it refuses and exits non-zero; the deploy
   then passes `ScreeningLaunch=closed`. Pass only the value the check printed: the stack checks the value's form and
   the web its tag, but neither can tell a value the check printed from one typed by hand, so the check run here is the
   gate (the deployer, who holds production's credentials, is trusted with it). Staging needs no launch value: its
   screening is not gated, so the end-to-end journey and staging's measurement of the runner-to-Fargate factor
   (decision 15) run there.
4. **Deploy.** `cdk deploy tp-<env> --parameters ImageTag=<tag>`, and in production also
   `ScreeningLaunch=<the launch check's value, or closed>` on every deploy: CloudFormation keeps a parameter's previous
   value when a deploy leaves it out, and the web binds the value to the tag it runs, so a value kept from an earlier
   tag closes the screening rather than vouching for a new image. The screening consumer (held at no task until
   launch; the founder's Q1 (b)) runs whenever a deploy passes a launch value, so no deploy opens the screening without
   it. From production's first launch deploy on, also pass `ScreeningConsumer=running` on every deploy, so that a deploy
   whose launch check refused (`ScreeningLaunch=closed`) keeps the consumer pricing what prospects already sent. A
   rollback across PR 6b-3 removes the parameter, and the redeploy after it starts again from its default `held`: pass
   `running` then too. The migration task runs first, as the owner login, and creates any missing service
   login (the screening's `tp_screening_login` among them); no service moves to the new task definition until it has
   exited 0, so a failed migration fails the deploy before traffic moves. Each service then rolls with its circuit
   breaker.
5. **Smoke checks.** `GET https://<AppDomainName>/api/health` answers 200 (it touches the database); `/sign-in` and
   `/status` load; `/.well-known/security.txt` names the environment's `SecurityEmail` and links `/security`, which
   loads; in production, `/security` shows neither "What you can expect from us" nor "Research in good faith" while
   `docs/product/legal-surfaces.md` still lists them (a production server leaves out a legal text whose review is not
   recorded); a synthetic smoke account signs in; the platform log group shows each platform job's next scheduled run;
   the uptime canaries go green within ten minutes. In production, `/screening` shows the open form only when the deploy
   passed a launch value for the tag (and counsel's review of the screening's wording is recorded); with `closed` it says
   the screening is not open yet. Where the screening consumer runs (staging always; production once a deploy passes a
   launch value or `ScreeningConsumer=running`), its log group (`ScreeningLogGroup`) shows its heartbeat and the
   sweep's `screening queue` line every minute, and its heartbeat alarm is OK. On an environment's first deploy, and whenever `SecurityEmail` changes, send a
   test message to it and have the security official confirm it arrived. In staging, run `pnpm test:e2e` against the
   release before tagging it for production.

## The screening consumer (ADR 0062; PR 6b-3)

**How the platform stops pricing screenings.** From PR 6b-3 the platform jobs no longer list `screening_price`: the new
platform image neither schedules nor works it, and the screening consumer (`WORKER_JOBS=screening`, its own service)
does, three at once. The queue keeps its name, so nothing is copied or renamed. A run in the waiting tier (past its
account's share or the day's cap; ADR 0062, Q7) goes to a queue of its own, `screening_price_waiting`, which the
consumer works with one thread fewer than it has, so the waiting tier never holds every thread and a normal upload
that arrives meanwhile starts at once. At its start the consumer sets pg-boss's 60-second job heartbeat on both
queues, removes the platform's old minute schedule of `screening_price`, and schedules its own sweep
(`screening_sweep`). `tp_operator` keeps the nine pricing functions for one release, so the
previous image's platform task, still running while a deploy rolls, finishes or loses (to the fenced claim) what it holds
without a permission error or a false job-failure alarm.

**How a deploy moves queued jobs without loss.** The queue and every run live in Postgres, not in a task. ECS starts a
service's new task before it stops the old one (minimum 100%, maximum 200%), and the new consumer works the jobs the
previous one, or the previous web, queued. A job queued before the new consumer first started (by the previous web,
or the previous platform's sweep) carries the normal priority and no heartbeat: pg-boss copies a queue's heartbeat
onto a job when the job is queued and supervises each job by its own, so only jobs sent after the consumer set it have
one (the new web and the consumer's sweep send every screening job with its own). Should the consumer die while
pricing such a job, the job stays active until pg-boss's expiry, 15 minutes, which holds the sweep's re-send; that
prospect waits about 15 minutes, not 3. This holds for the jobs of that one deploy window only.

On SIGTERM a consumer stops fetching and waits up to 110 seconds for the runs its threads hold (exiting by itself at
115), inside its task's 120-second stop timeout. A run cut off anyway (a crash, a lost task or zone) keeps its recorded
batches: its job's heartbeat stops, pg-boss fails the job, and its retry or the minute's sweep (once the run has made
no progress for 2 minutes) claims it again, which prices only the rows still pending, at most three attempts in all.
That prospect waits about 3 minutes; nothing is lost.

**Rollback across PR 6b-3** runs from the previous tag's checkout (`git checkout <previous tag>`, then the rollback
below), because the previous image does not know `WORKER_JOBS=screening` and the previous stack has no screening service.
Its platform task prices screenings again, since `tp_operator`'s grants are kept for the release. Its web cannot submit
a screening: it calls the `submit_screening()` the migration replaced (the migration's effect 1), so every upload fails
with a server error until PR 6b-3 returns; in production the screening is closed until launch, and in staging, whose
screening is open, close the page or expect those failures. Before PR 6b-3 is deployed again:

- **Its two log groups.** The rollback leaves `/tp/<env>/screening` and `/tp/<env>/network-lookup` in place (both are
  kept when their stack resource goes, and have fixed names), and creating them again fails the deploy with "already
  exists". Either bring them back into the stack with `cdk import tp-<env>` (it asks for each one's name), or export
  them (`aws logs create-export-task`; they hold IDs only) and delete them (`aws logs delete-log-group`).
- **Its login**, if the rollback deleted `ScreeningLoginSecret`: as the owner login,
  `DROP ROLE IF EXISTS tp_screening_login, tp_screening_login_clone;` (the clone exists only once the 30-day rotation
  has run), so that the migration task creates the login again from the new secret.
- **The consumer's parameter.** Pass `ScreeningConsumer=running` again in production after launch (step 4).

No environment had been deployed before PR 6b-3, so its first deploy has no previous image; these rules hold for every
later one.

**Follow-up (open item O10).** The first schema pull request after PR 6b-3 is deployed to an environment revokes the nine
screening pricing functions from `tp_operator` (add, then remove, below): `REVOKE EXECUTE ON FUNCTION
operator_screening_due(integer, integer), operator_screening_claim(uuid), operator_screening_release(uuid),
operator_screening_run_keys(uuid), operator_screening_run_records(uuid), operator_screening_rows(...),
operator_screening_record(...), operator_screening_complete(...), operator_screening_fail(...) FROM tp_operator`, with
their exact signatures from the migration, once no platform task of an image before PR 6b-3 can run.

## Rollback

Redeploy the previous image, without migrating:

```
cdk deploy tp-<env> -c tp:skipMigrations=true --parameters ImageTag=<previous tag>
```

Migrations are add, backfill, remove (never a breaking change in one release), so the previous image runs on the newer
schema. Never edit or revert an applied migration: a fix is a new, forward migration in the next release. The context
value applies to that one deploy only; the next release migrates again. If the circuit breaker already rolled a service
back, confirm the task definition it runs is the previous release's before redeploying.

## After either

Record the tag, the time, who deployed and the smoke-check result in the release's pull request. A failed deploy or a
rollback is a change-management event: note its cause there too.

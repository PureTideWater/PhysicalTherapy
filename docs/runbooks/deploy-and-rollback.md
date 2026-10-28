# Deploy and rollback

Trigger: a release tag (PRD 19 Runbooks; PRD 18 Releases). The stack and its order are ADR 0049's; this is the
procedure a second person follows. Nothing here needs, or may use, a customer's data: checks use the synthetic smoke
accounts and the health endpoint.

## Before the first deploy of an environment

Outside the stack, once: the two DNS names (`AppDomainName`, `StaticDomainName`) and their ACM certificates (the static
one in us-east-1) and CDK bootstrap in the account and region. The stack owns its SES identities (MailFromAddress's
domain and `screening.<that domain>`) and verifies them in two phases (docs/adr/0065, D2; docs/runbooks/deliverability.md,
section 2). If SES in the region already holds an identity for either domain, one verified by hand under this runbook's
earlier text, delete it first, or the deploy fails creating the stack's ("already exists"):

```
aws sesv2 get-email-identity --email-identity <domain>        # and screening.<domain>
aws sesv2 delete-email-identity --email-identity <domain>
```

No environment sends mail before its first release (`ImageTag` stays `none`), so nothing is lost; remove the old
identity's DKIM records at the registrar when you set the stack's. (An import into the stack is not an option: the
identity names its configuration set, which the same deploy creates.) Then deploy phase 1:

```
cdk deploy tp-<env> --parameters AppDomainName=… CertificateArn=… StaticDomainName=… StaticCertificateArn=… \
  MailFromAddress=… SupportEmail=… SecurityEmail=… MailIdentitiesVerified=false
```

`SecurityEmail` is the address `/.well-known/security.txt` and the disclosure page (`/security`) give for vulnerability
reports: a mailbox the security official reads, on a domain whose mail reaches it. It is never the support address,
whose mail opens tickets only for accounts (the web app refuses to start with the two equal), and it is not on the
support address's domain while that domain's mail goes to SES: the stack's receipt rule set holds only the support
recipient (`infra/lib/constructs/support-mail.ts`), so a report sent there would never reach a person, unless a receipt
rule for the security address is added first. An environment deployed before this parameter existed takes it on its next
deploy: pass `SecurityEmail=…` once.

`ImageTag` stays `none`: everything is created and no task runs (the heartbeat and uptime alarms stay in ALARM until the
first release). Production's screening stays closed (no launch report is named; ADR 0062, decision 13) and
`ScreeningConsumer` stays `held` (its default; the founder's Q1 (b) of 2026-10-21). Point the two DNS names at the
`LoadBalancerDnsName` and `StaticAssetsDistributionDomain` outputs. Write the Stripe keys (docs/runbooks/billing.md) and set up support mail
(docs/runbooks/support-mail.md).

**Mail, the two phases (docs/runbooks/deliverability.md, section 2).** Phase 1 (`MailIdentitiesVerified=false`, the
default) creates the three configuration sets, the two identities, the event queue and its rules; Cognito keeps its own
default sender and the platform sends no probe. Set the DNS records the stack outputs (for each identity, the three
DKIM CNAMEs, the MAIL FROM MX and SPF and the DMARC record: `MailDkimRecord1` to `3`, `MailMailFromMxRecord`,
`MailMailFromSpfRecord`, `MailDmarcRecord`, and the same with `ScreeningMail…`) at the registrar, wait until both
identities read verified, then deploy again with `MailIdentitiesVerified=true` (phase 2): Cognito sends from
MailFromAddress through the transactional set, and the platform's probes prove the event path. Later deploys keep the
value (cdk reuses a parameter's previous value unless one is passed). Until both identities verify, SES refuses the
platform's own mail from an unverified sender with `MessageRejected`, a permanent error: each support-access or dunning
notice's recipient is marked failed at once and is never sent again, and the notice is reported undelivered
(`notice_undelivered` on the grant or the invoice, `NOTICE_UNDELIVERED`, and for a grant the administrators'
notification); a digest's job is retried only twice, within about two minutes, by pg-boss, and then fails. So no
release runs tasks (`ImageTag` stays `none`) until both identities read verified and phase 2 is deployed. In staging,
run the deliverability runbook's staging checks once after phase 2 (open item O11) and record them in the release's
pull request. Each account needs SES production access before any customer mail (the runbook's use
case text).

**The address-validation account (docs/adr/0065; deliverability runbook, section 2, step 1).** SES's validation of a
screening address names the address in its request, so it runs in an AWS account of the environment's own that holds
nothing else. Before the first release, a person creates that account, bootstraps CDK in it and deploys
`tp-<env>-address-validation` there with `ApplicationRoleArn=<this stack's ApplicationRoleArn output>`; then deploy this
stack with `MailValidationRoleArn=<that stack's AddressValidationRoleArn output>`. CloudFormation refuses a deploy whose
`ImageTag` names a release while `MailValidationRoleArn` is `none` (rule `ReleaseNeedsAddressValidationRole`), and a
released web refuses to start without it.

Once the environment's `StaticAssetsOrigin` output exists, set the repository variable the release builds its web image
with (Settings, Secrets and variables, Actions, Variables): `STAGING_STATIC_ASSET_ORIGIN` or
`PRODUCTION_STATIC_ASSET_ORIGIN`, the output's value. A release tagged before it is set builds that web image with no
static host (its assets load from the application host), and says so in the build's log.

## A release

1. **Tag.** Merge to main with CI green and the founder's approval, then the founder creates the tag
   `v<major>.<minor>.<patch>` on main's merged commit (docs/runbooks/github-governance.md, 4C: only the founder can).
   The release workflow (`.github/workflows/release.yml`) builds the worker image and three web images (`web` with no
   static host, `web-staging` and `web-production` with each environment's), scans each and writes its software bill of
   materials, measures the screening's capacity with time enforced and binding on exactly `web-production` and `worker`
   as built (every other capacity run is advisory: the founder's third ruling of 2026-10-23), and
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
   what was scanned and, in production, what was measured (the copy keeps each image's config, so its config digest,
   which step 3 compares):

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
3. **The launch report (production; decision 13, test matrix SCR-20).** Production's screening opens only on the
   capacity report `release.yml` measured on the tag being deployed and attested in that same run, binding and passing
   with time enforced, on both image IDs (an advisory report, a pull request's, is refused whatever its verdict, and so
   is a report measured anywhere else, or edited, which carries no attestation of the release's run on the tag), and
   only the CDK app sets its launch value (the founder's ruling of 2026-10-22): at synthesis it verifies the report's
   attestation with `gh attestation verify` against the bundle the release kept beside it (signed by this repository's
   `.github/workflows/release.yml` at `refs/tags/<tag>`, at the tag's commit, on a GitHub-hosted runner; the
   verification of PR 6b-3's capacity changes) and runs the launch check on the report the deploy names and on the
   images the stack deploys, `<WebRepositoryUri>:<tag>` and `<WorkerRepositoryUri>:<tag>` in the
   account and region of your credentials, with the tag's commit in this checkout (step 1 fetched the tags) and
   production's sizes as `infra/lib/environments.ts` declares them. It compares each image by its config digest: the
   report holds the IDs the release's runner measured (`docker image inspect -f {{.Id}}` on its classic overlay2 image
   store, where an image's ID is its config's SHA-256), and the check reads, for each tag in ECR, the manifest ECR holds
   (`docker buildx imagetools inspect --raw`, an index resolved to its one linux/amd64 image manifest, the platform the
   release builds and ECS runs) and takes its `config.digest`. So the images checked are the copies step 2 pushed, the
   images ECS runs, never a copy already on this machine; nothing is pulled, and your Docker's image store does not
   matter: under the containerd image store (the default for new Docker Desktop and Docker Engine 29 installs) `docker
   image inspect -f {{.Id}}` gives the manifest's digest instead, which is why the check never reads it. A registry it
   cannot read (log in first), a platform manifest not found, an index with no linux/amd64 manifest or an unexpected
   media type is named as the reason. Download the release's report with its attestation's bundle (the pattern takes
   `screening-capacity.json`, `screening-capacity.sha256` and `screening-capacity.sigstore.json`) and log Docker in to
   the environment's registry (`docker buildx` comes with Docker Desktop and with Docker Engine's
   `docker-buildx-plugin`). The check needs the GitHub CLI (`gh`; 2.89.0 has every flag it passes, and an older one is
   refused, naming the flag), which verifies the bundle on disk with no GitHub login and fetches Sigstore's trusted
   roots on first use from `tuf-repo-cdn.sigstore.dev` and `tuf-repo.github.com`. You may preview the check, which
   prints the value the deploy will compute, with a note naming the release's run and attempt that measured and
   attested the report, or each reason it refuses:

   ```
   gh release download <tag> --pattern 'screening-capacity.*' --dir <dir>
   aws ecr get-login-password | docker login --username AWS --password-stdin <account>.dkr.ecr.<region>.amazonaws.com
   pnpm exec tsx tools/screening-capacity/launch-check.ts --report <dir>/screening-capacity.json \
     --attestation <dir>/screening-capacity.sigstore.json --tag <tag> \
     --web-image <WebRepositoryUri>:<tag> --worker-image <WorkerRepositoryUri>:<tag>
   ```

   Nothing the preview prints is passed to the deploy. No stack declares a `ScreeningLaunch` parameter, so
   CloudFormation refuses `--parameters ScreeningLaunch=…`, and the CDK app stops on context that would set the value by
   hand (`-c ScreeningLaunch=…`, `-c tp:screeningLaunch=…`), naming decision 13; a value typed by hand cannot open the
   screening. Staging needs no report: its screening is not gated, so the end-to-end journey and staging's measurement
   of the runner-to-Fargate factor (decision 15) run there.
4. **Deploy.** `cdk deploy tp-<env> --parameters ImageTag=<tag>`. In production, to open the screening, or keep it open,
   name the tag's report and its attestation's bundle on every deploy, each with an absolute path (cdk runs the app
   from `infra/`); the three `-c` values go together:

   ```
   cdk deploy tp-production -c tp:launchReport=<dir>/screening-capacity.json \
     -c tp:launchAttestation=<dir>/screening-capacity.sigstore.json -c tp:launchTag=<tag> \
     --parameters ImageTag=<tag>
   ```

   The app writes `<tag>:<the report's SHA-256>` into the web's `SCREENING_LAUNCH` (the stack's `ScreeningLaunch` output
   shows it), and the stack's rule `ScreeningLaunchImageTag` refuses the deploy before any change unless `ImageTag` is
   `<tag>`. A report the check refuses stops the synthesis, naming decision 13 and each reason, and nothing is deployed:
   to ship the release with the screening closed, deploy again without the three `-c` values. A deploy without them closes
   production's screening, since context holds for one invocation only and no launch value carries over from an
   earlier deploy. The screening consumer (held at no task until launch; the founder's Q1 (b)) runs whenever the
   deploy carries a launch value, so no deploy opens the screening without it. From production's first launch deploy
   on, also pass `ScreeningConsumer=running` on every deploy, so that a deploy without a report (the screening closed)
   keeps the consumer pricing what prospects already sent. A rollback across PR 6b-3 removes that parameter, and the
   redeploy after it starts again from its default `held`: pass `running` then too. The migration task runs first, as
   the owner login, and creates any missing service login (the screening's `tp_screening_login` among them); no service
   moves to the new task definition until it has exited 0, so a failed migration fails the deploy before traffic moves.
   Each service then rolls with its circuit breaker.
5. **Smoke checks.** `GET https://<AppDomainName>/api/health` answers 200 (it touches the database); `/sign-in` and
   `/status` load; `/.well-known/security.txt` names the environment's `SecurityEmail` and links `/security`, which
   loads; in production, `/security` shows neither "What you can expect from us" nor "Research in good faith" while
   `docs/product/legal-surfaces.md` still lists them (a production server leaves out a legal text whose review is not
   recorded); a synthetic smoke account signs in; the platform log group shows each platform job's next scheduled run;
   the uptime canaries go green within ten minutes. In production, `/screening` shows the open form only when the deploy
   carried the tag's passing report (the `ScreeningLaunch` output is `<tag>:<SHA-256>`, not `closed`) and counsel's review
   of the screening's wording is recorded, the mail stream is sending and its probes are back (`/console/mail` reads
   "Ready to open" yes; in phase 1 it never does); otherwise it says the screening is not open yet, or, while the stream
   is paused, that new screenings are paused. Where the screening consumer
   runs (staging always; production once a deploy carries a launch report or `ScreeningConsumer=running`), its log
   group (`ScreeningLogGroup`) shows its heartbeat and the sweep's `screening queue` line every minute, and its heartbeat alarm is OK. On an environment's first deploy, and whenever `SecurityEmail` changes, send a
   test message to it and have the security official confirm it arrived. In staging, run `pnpm test:e2e` against the
   release before tagging it for production.

## Before the screening opens in production (open items O5, O11 and O14)

Each is recorded in the pull request of the release that opens it:

- a place-of-service split approved by a contract specialist before the first customer run;
- the launch deploy names the tag's report (step 4) and passes `ScreeningConsumer=running`, and every later deploy
  keeps passing it;
- both mail phases done, with the DNS records set and both identities verified (`MailIdentitiesVerified=true`), and
  `/console/mail` reading "Ready to open" yes;
- SES production access granted for the account and region;
- staging's deliverability checks recorded (open item O11: Cognito sending through the stack's identity, the screening
  set neither checking nor adding to the account's suppression list, the account's reputation metrics publishing, the
  database logging no bind value, and SES's address validation recorded as a read in the address-validation account
  alone);
- production's address-validation account set up and `MailValidationRoleArn` set (the release cannot run without it);
- counsel's review of the screening's wording recorded (docs/product/legal-surfaces.md: until then a production server
  keeps the screening closed);
- the founder's own steps (open item O14): the DNS records set at the registrar, both domains registered with Google
  Postmaster Tools and Microsoft SNDS, and the required checks in the main branch's ruleset
  (docs/runbooks/github-governance.md).

## The mail streams (ADR 0065; PR 6b-4)

**How a deploy moves notices without loss.** The migration replaces the support-access notice's functions with the
outbox's (`operator_record_support_notice()` and the address readers are dropped). While a deploy rolls, the previous
platform task's support-access notices and dunning fail at the dropped functions and roll back, so they wait for the
new task: none is lost or sent twice. The previous web keeps submitting screenings (`submit_screening()`'s new
parameter is last, with a default).

**Rollback across PR 6b-4** (to an earlier image, below) keeps the stack, the streams and the migration. The previous
platform image cannot send support-access notices or dunning (it calls the dropped functions): each waits, recorded,
until an image of PR 6b-4 or later runs again, so roll forward with a fix rather than staying back. Its web reads the
console's support list without the notices' delivery, and does not check a screening's address; the database still
refuses an address on the refusal list, and every upload while the stream is paused. To leave phase 2 instead (Cognito back to its default sender, the probes
stopped), deploy with `MailIdentitiesVerified=false`; in staging and production the screening then closes within 48
hours, since its probes no longer come back.

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

In production after launch, a rollback without a report closes the screening; to keep it open on the previous image,
add that tag's own report and its attestation's bundle, checked as in step 3 (`-c
tp:launchReport=<dir>/screening-capacity.json -c tp:launchAttestation=<dir>/screening-capacity.sigstore.json -c
tp:launchTag=<previous tag>`, both downloaded from the previous tag's release; a release from before the attestation
has no bundle, and its report is refused). A report of the previous tag that
the check refuses (one measured at other sizes than this checkout declares, for instance) stops the synthesis; roll
back without it, with the screening closed.

Migrations are add, backfill, remove (never a breaking change in one release), so the previous image runs on the newer
schema. Never edit or revert an applied migration: a fix is a new, forward migration in the next release. The context
value applies to that one deploy only; the next release migrates again. If the circuit breaker already rolled a service
back, confirm the task definition it runs is the previous release's before redeploying.

## After either

Record the tag, the time, who deployed and the smoke-check result in the release's pull request. A failed deploy or a
rollback is a change-management event: note its cause there too.

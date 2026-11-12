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
   Each service then rolls with its circuit breaker, its new tasks started before the old ones stop. In dev alone the
   worker stops first (`STOP_FIRST_DEPLOYMENT` in `infra/lib/environments.ts`; ADR 0083, "The instance classes"): dev
   has no practice worker from the old task's stop (up to 60 seconds) until the new task starts, its queued jobs wait in
   pg-boss, and its heartbeat alarm, which counts ten missed beats in dev, stays OK; a dev worker still silent after ten
   minutes pages as anywhere.
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

## A migration that cannot get a lock (ADR 0009, the amendment of 2026-11-11)

Every migration waits at most two seconds for any one lock. When a wait reaches that, the runner rolls the migration
back, pauses (1, 2, 4, 8, then 15 seconds) and tries it again, twenty times in all, about five minutes. While it
pauses it holds and queues nothing, so requests and jobs go on. If no try gets through, the deploy fails: cdk reports
"the migration task … stopped without migrating (exit code 1, …)", and the migration's log group `/tp/<env>/migration`
ends with

> db:migrate: `<file>` failed: a lock it needs stayed held (tried 20 times, waiting 2000 ms for each lock); it changed nothing; run the deploy again when no long job is running (docs/adr/0009)

That migration changed nothing (a migration before it in the same deploy stays applied: each commits on its own), and
no service moved (step 4). It means a transaction held one of the migration's tables through the whole five minutes: a
reconcile pass, a long triage or audit report, or jobs running back to back. Run the deploy again at a quieter hour.
Never take the locks by hand, and never end another session's transaction, or cancel a job or a vacuum, to make room.
A migration with a lock loop of its own (the sections below) fails in its own words instead, and is not tried again.
The runner starts no new try once the whole run has lasted thirty minutes (the deploy waits fifty for the task), so
the same message can say fewer than 20 tries. If the log instead ends with "failed and may be partly applied", stop:
that migration ended the runner's transaction itself, part of it may be in the database and it is not recorded. Do not run the
deploy again; compare the database with the file first (ADR 0009, the amendment's item 7).

## A line's stage lock (ADR 0083; SUITE-CAP-1b)

**The migration's lock loop.** `20261109090000_line_status_heads.sql` takes `claim`'s SHARE lock and `line_status`'s
SHARE ROW EXCLUSIVE lock together with `NOWAIT`, once a second, up to 300 tries, before it backfills `line_status_head`,
replaces `line_status_rules()` and builds `claim_by_superseded`. A refused try holds and queues nothing, so stage writers
(triage, the audit report, opening a case, reconcile, manual ledger work and a person's reopen) and 835 loads go on
while it waits for a moment with neither in flight. Once it holds both locks, stage writes wait for the backfill (a few
seconds per million events) and 835 loads for the index build. If no such moment comes in five minutes, the deploy
fails: cdk reports "the migration task … stopped without migrating (exit code 1, …)", and the migration's log group
`/tp/<env>/migration` ends with

> db:migrate: 20261109090000_line_status_heads.sql failed: line_status or claim stayed in use for five minutes; run the deploy again (docs/adr/0083)

(`lock_not_available`, 55P03). This migration runs in one transaction, so it changed nothing (a migration before it in
the same deploy stays applied: each commits on its own), and no service moved (step 4: no service moves until the
migration task exits 0). It means no try in the five minutes found a moment free of stage writes and 835 loads: a long
triage or audit report, or jobs running back to back. Run the deploy again, at a quieter hour if it repeats; never take
the locks by hand or end another session's transaction to make room.

**After it.** Two writers of the same line wait on that line's row in `line_status_head`: in `pg_stat_activity` the
waiting backend shows `wait_event_type = 'Lock'` with `wait_event = 'transactionid'` (`tuple` for a third writer queued
behind it), where before it was `advisory`. It is the same wait at the same grain, not new contention. Triage, the
report and reconcile each hold one advisory lock, their practice's (`triage:` or `ledger:`).

**Rollback across SUITE-CAP-1b** (to an earlier image, below) keeps the migration: the previous image's stage writers run
the same statements, and the trigger writes the head row for them. From launch on, SUITE-CAP-1a (the bounded reads)
reaches production in an earlier release than SUITE-CAP-1b (ADR 0083, D21), so the previous image already reads a month
in batches. Never roll back past SUITE-CAP-1a on this schema: that image reads a month's lines whole, and on the new
trigger a large month's report would take the worker down with a heap out-of-memory instead of failing 53200; roll
forward with a fix instead. If the trigger itself had to be undone, a later migration restores the earlier body; the
head table can stay, unused, since it is derived from `line_status`.

## The ledger's lock for interest credited once (ADR 0084)

**The migration's lock loop.** `20261110090000_ledger_interest_once.sql` takes `ledger_entry`'s and `ledger_match`'s
ACCESS EXCLUSIVE locks together with `NOWAIT`, once a second, up to 300 tries, before it numbers `ledger_match`
(`seq`), replaces `ledger_match_rules()`, relaxes two CHECKs and creates `ledger_entry_within_interest`. Unlike the
stage lock loop above, which only stage writes and 835 loads refuse, any open transaction that has read either table
refuses a try, a plain read included: a page that reads the ledger (Reconciliation, the ROI statement), a reconcile, a
statement being built, and a person's ledger action. A refused try holds and queues nothing, so all of them go on.
Once it holds both locks, those reads and writes wait for the rest of the migration (rewriting `ledger_match` for `seq`
and validating the two CHECKs: well under a second at launch size, longer as `ledger_match` grows), then proceed. A
page that reads at one snapshot (REPEATABLE READ: Reconciliation among them) whose snapshot began before the migration
committed (before the locks were taken or while they were held) then reads `ledger_match` as empty once, since the
rewrite gives every row the migration's transaction, and shows the ledger's entries with no matches; it writes nothing,
and a reload reads it whole. If no try finds both tables free in
five minutes, the deploy fails: cdk reports "the migration task … stopped without migrating (exit code 1, …)", and the
migration's log group `/tp/<env>/migration` ends with

> db:migrate: 20261110090000_ledger_interest_once.sql failed: ledger_entry or ledger_match stayed in use for five minutes; run the deploy again (docs/adr/0084)

(`lock_not_available`, 55P03). This migration runs in one transaction, so it changed nothing (a migration before it in
the same deploy stays applied: each commits on its own), and no service moved (step 4). It means no try in the five
minutes found both tables free: steady page traffic on Reconciliation or the ROI statement, or a reconcile: one
reconcile running holds both tables from its first read to its commit, and one practice's pass at 2,000 lines took
603.0 s at the deployed worker's size (CAS-42.5; 333.2 s for 2,084 lines, ADR 0083), past the five minutes by itself.
Run the deploy again at a quieter hour, outside the practices' working hours, with no reconcile queued or running (the
daily monitoring schedule queues every practice's reconcile at 05:10 UTC); never take the locks by hand, and never end
another session's transaction or cancel a reconcile to make room.

## Password-changed notices (ADR 0091; Schema PR 1)

**The migration's lock loop.** `20261111090000_password_changed_notice.sql` takes `"user"`'s SHARE ROW EXCLUSIVE lock and
`audit_event`'s and `mail_send`'s ACCESS EXCLUSIVE locks together with `NOWAIT`, once a second, up to 300 tries, before
any of its DDL. A refused try holds and queues nothing, so sign-ins (which write `audit_event` and then `"user"`),
audited requests and the mail record go on while it waits for a moment with none of the three in use. What refuses a
try is any open transaction that has read or written `audit_event` or `mail_send`, or written `"user"`: a sign-in and
every signed-in request, for their milliseconds (a page's audited read writes `audit_event`, as a mutation does); a
triage, a pricing run, an audit report or a packet export, from its first audited read or write to its commit (a
triage is one transaction); the nightly audit copy's read (01:20 UTC); and an autovacuum or autoanalyze of one of the
three, which a `NOWAIT` try never cancels, as a waiting lock would. A transaction that only reads `"user"`, or checks
a foreign key against it, refuses nothing.

Once the migration holds the three, until its commit (the DDL and one scan of `mail_send`, at most about 91 days of
messages: about 0.3 seconds measured with 500,000 mail records, not yet on RDS), every write of `"user"`, every audited
read or mutation, every other read of `audit_event` and every read or write of `mail_send` waits. Jobs and sign-ins
wait and then proceed. A signed-in request waits up to its three-second lock timeout and is then refused as busy, with
nothing saved (ADR 0092's amendment of 2026-11-11): a page shows its error state with "Try again", and a form answers
"The records this form needs are being updated, so nothing was saved." At the measured window no one is refused; if
people report those words during a deploy, the scan of `mail_send` has outgrown the measurement, and they try again
once it ends.

If no moment with the three free comes in five minutes, the deploy fails: cdk reports "the migration task … stopped
without migrating (exit code 1, …)", and `/tp/<env>/migration` ends with

> db:migrate: 20261111090000_password_changed_notice.sql failed: "user", audit_event or mail_send stayed in use for five minutes; run the deploy again (docs/adr/0091)

(`lock_not_available`, 55P03). This migration runs in one transaction, so it changed nothing (a migration before it in
the same deploy stays applied: each commits on its own), and no service moved (step 4). It means no try in the five
minutes found the three free: steady signed-in traffic, a long triage or audit report, or jobs running back to back.
Run the deploy again at a quieter hour: outside the practices' working hours, with no triage, pricing run, audit
report or packet export queued or running (the daily monitoring schedule queues every practice's monitoring at 05:10
UTC, which starts the day's pricing runs and their triage), and not at 01:20 UTC, when the audit copy reads. A vacuum
ends by itself; whether one runs is, in a session as the operator role (`tp_operator`):

```sql
SELECT count(*) FROM pg_stat_progress_vacuum WHERE datname = current_database();
```

(0 when none runs; the operator role sees that a vacuum runs, not on which table). Never take the locks by hand, and
never end another session's transaction, or cancel a job or a vacuum, to make room.

**The forward deploy.** The migration runs before any service moves (step 4). From its commit, every reset the web
completes for an account queues a notice in its own transaction, whichever web image completed it (the database writes
it), and the notices wait, pending, for the new platform task, which sends them within a minute of starting; one not
sent within 24 hours of its change is never sent, and pages (`PASSWORD_NOTICE_UNDELIVERED`;
docs/runbooks/deliverability.md, 3.10). In the web image this change touches two things only: the reset looks the
account up before it asks Cognito to change the password, so a database that cannot be reached leaves the password as
it was, and the console's mail page names the notices in the transactional stream's label. The previous platform task,
while it still runs, selects `operator_record_mail_event()`'s six columns by name and calls the new
`operator_mail_expire()`, so its mail jobs keep working. The same deploy gives the operator role its
`PasswordNoticeEmail` statement and the platform task `SUPPORT_EMAIL` (from the stack's `SupportEmail` parameter), and
adds the alarms `PASSWORD_NOTICE_UNDELIVERED`, `PasswordNoticeRecordFailed`, `PasswordResetSessionsNotEnded` and
`PasswordResetProviderSignOutFailed`; while IAM propagates, a refused first send is retried a minute later.

The release that carries ADR 0094 adds one alarm, `MembershipEndProviderSignOutFailed`, and no migration: End membership
then commits whatever Cognito answers and asks Cognito to sign the person out only afterwards. Rolled back, the previous
web asks Cognito inside End membership's transaction again (a refusal there ends nothing and shows an error) and
writes no line the alarm counts, so the alarm stays silent, not broken.

**The rolling platform deploy.** The platform service rolls with a minimum of 100% and a maximum of 200%
(`infra/lib/environments.ts`), so an old and a new platform task overlap, and an old task cannot read an SES event of
kind `password_changed` (it logs `MAIL_EVENT_UNREADABLE` and leaves the event, which moves to `tp-<env>-mail-events-dlq`
after five receives and raises `EventsDeadLetter`). After each deploy, check that queue, and redrive it once only new
tasks run (docs/runbooks/deliverability.md, 3.6). The dead-letter queue keeps an event 14 days, counted from when it
first reached the events queue; one left longer is gone, and its notice stays `sent`.

**Rollback across Schema PR 1** (to an earlier image, below) keeps the migration: every object it made is added and its
CHECKs only widen, so the previous image runs on it, and it sets no rollback floor of its own (the floors the sections
above state stay). What the previous images cannot do:

- send the notices: the previous platform image has no `password_notices` job, so every reset's notice waits pending,
  unsent and unreported, and nobody is paged for it (resets still queue them: the database writes the notice,
  whichever web image completes the reset);
- read an SES event of kind `password_changed`: each moves to the dead-letter queue as above, so a notice already sent
  stays `sent`, its delivery or bounce unrecorded, until the events are redriven, within the queue's 14 days;
- keep a reset from landing while the database cannot be reached: the previous web asks Cognito first and looks the
  account up afterwards, so such a reset changes the password, ends no session, records nothing and writes neither
  counted line (ADR 0091, D15).

The operator role's statement and ADR 0091's four alarms stay with the stack; `PasswordResetSessionsNotEnded` and
`PasswordResetProviderSignOutFailed` count lines the previous web already writes (docs/runbooks/incident-response.md),
so they keep paging. Roll forward with a fix rather than staying back. While rolled back, list who waits, in a session
as the operator role:

```sql
SELECT * FROM operator_password_notices_due(100);
```

It returns the notice's ID and the user's ID, nothing else, for each notice that waits, is due a try and is still
inside its 24 hours: at most 100, in the order the job would try them. A notice already past 24 hours is not in it: it
stays pending and unreported until the new job fails it. Every `password_reset_completed` the audit log holds since
the rollback began has a notice that waits, so this lists those, past the cutoff or not:

```sql
SELECT object_id AS user_id, at FROM audit_event
WHERE action = 'password_reset_completed' AND at >= '<rollback began>'::timestamptz
ORDER BY at;
```

A reset from before the rollback waits too if the new job had not sent its notice: one in the job's last minute, one
whose send was being retried (over up to 81 minutes), or every one since the job stopped sending, when that is why the
image was rolled back. Begin the statement that much earlier, and leave out each reset the platform log shows sent after
it (`password notice sent`, by `user_id`).

A person whose notice passes its 24 hours before the roll forward is never sent it: tell them another way then
(deliverability.md, 3.10, "In every case"), without waiting for the page that follows the roll forward. After rolling
forward, the new job sends every pending notice inside the cutoff, and every one older than 24 hours fails as
`NoticeStale`, up to 100 a run, and they share one page, one line a notice (tell each person another way:
deliverability.md, 3.10); then redrive `tp-<env>-mail-events-dlq`, so the delivered and bounced states, and any
`PASSWORD_NOTICE_UNDELIVERED` they raise, are recorded. The schema is never rolled back; undoing the trigger would be a
later migration.

## A sign-in step begun before a password reset (ADR 0093; the schema pull request after Schema PR 1)

**The migration's lock loop.** `20261112090000_sign_in_not_before.sql` takes `"user"`'s, `user_session`'s and
`password_notice`'s ACCESS EXCLUSIVE locks and `audit_event`'s SHARE ROW EXCLUSIVE lock together with `NOWAIT`, once a second, up to 300 tries,
before any of its DDL. A refused try holds and queues nothing. **It is harder to satisfy than Schema PR 1's loop**,
which took `"user"` in a mode readers do not refuse. Here a try is refused by any open transaction that has touched
`"user"` in any way, a read or a foreign-key check included, or `user_session`, or has written `audit_event`, or touched `password_notice` (the
`password_notices` job, for a moment each minute); and by an autovacuum or autoanalyze of one of the four. Every signed-in request and every job reads `"user"`. A request
holds it for milliseconds; a triage, a pricing run, an audit report or a packet export holds it to its commit; and
one reconcile pass (about 600 seconds at 2,000 lines) outlasts the loop's five minutes by itself.

So, before this deploy:

- deploy outside the practices' working hours;
- **have no reconcile queued or running**, and no triage, pricing run, audit report or packet export (the daily
  monitoring schedule queues every practice's monitoring at 05:10 UTC), and not at 01:20 UTC, when the audit copy
  reads;
- check that no vacuum runs, as the section above shows.

Once the migration holds the three, its DDL is catalog-only (two nullable columns with no default, six functions, two
triggers, one grant): no rewrite and no scan, so the hold is short. Until its commit every request and job waits or,
for a signed-in request, is refused as busy after its three-second lock timeout with nothing saved (ADR 0092).

If no moment with the three free comes in five minutes, the deploy fails: cdk reports that the migration task stopped
without migrating, and `/tp/<env>/migration` ends with

> db:migrate: 20261112090000_sign_in_not_before.sql failed: "user", user_session, audit_event or password_notice stayed in use for five minutes; run the deploy again (docs/adr/0093)

(`lock_not_available`, 55P03). This migration runs in one transaction, so it changed nothing, and no service moved
(step 4). Run the deploy again at a quieter moment. Never take the locks by hand, and never end another session's
transaction, or cancel a job or a vacuum, to make room.

**The forward deploy.** From the migration's commit, every reset any web image records moves the account's mark and
ends its sessions in the database, and a session insert that carries a start is checked against the mark. The new web
image reads each attempt's start from the database, carries it sealed through the steps, takes the account's row
lock first when it opens a session or records a reset, and sends a reset's confirm to Cognito once. The same deploy
adds the alarms `SignInStepRefusedAfterReset`, `HardwareKeyRegisteredAcrossReset`, `PasswordResetOutcomeUnknown` and
`SignInRefusedCrossedAccount` (docs/runbooks/incident-response.md).

**While both web images serve** (the minutes of the rolling deploy; ADR 0093, D8):

- a step an old task sealed carries no start; a new task that reads it treats it as no step, and the person starts
  again. If the load balancer sends their next step to an old task and the one after to a new one, they may start
  again more than once. It ends when the old tasks are gone;
- a step a new task sealed and an old task finishes is not checked: the old task's session insert carries no start,
  which the database neither checks nor locks. For those minutes the gap this change closes is open on old tasks;
- nobody is told anything new: a closed step reads "That sign-in step closed. Start again from your email and
  password."

Deploy off-hours for this too, as ADR 0088's cutover does, and confirm afterwards that only new web tasks run.

**Rollback across this migration** (to an earlier image, below) keeps the migration: every object is added, and it
sets no rollback floor of its own. The previous web image runs on it: its resets still move the mark and end the
sessions, since both are the database's. What it cannot do: carry a start, so its sessions open unchecked and a step
begun before a reset can again open a session or register a key after it (ADR 0091, D10's two cases); and it sends a
reset's confirm with the SDK's repeats, so a lost answer can again read as a refused code. The three alarms stay
with the stack and count nothing while the previous web runs, since it writes none of their lines. Roll forward with
a fix rather than staying back. The schema is never rolled back.

## A payer's answer and a contract's source, in Postgres (ADR 0085's amendment of 2026-11-11; Schema PR 4)

**The migration's lock loop.** `20261114090000_payer_response_document_rules.sql` takes `source_document`'s ACCESS
EXCLUSIVE lock, `submission`'s SHARE ROW EXCLUSIVE lock and SHARE locks on `payer_response` and `contract_version`
together with `NOWAIT`, once a second, up to 300 tries, before anything else. A refused try holds and queues nothing.
As in the two sections above, the first of the four is the hard one: a try is refused by any open transaction that
has touched `source_document` in any way, a read or a foreign-key check included. The other three are refused only by
a transaction that has written the table (a submission logged, a response recorded, a contract version saved or
signed off). An autovacuum or autoanalyze of any of the four refuses a try too. An upload, a scan verdict, a parse, a
contract screen and the console's contract queue each hold `source_document` for milliseconds; a job that reads a
document and then works in the same transaction holds it to its commit.

So, before this deploy:

- deploy outside the practices' working hours;
- have no long job queued or running that reads documents or writes one of the four tables: no parse or abstraction
  of an upload, no triage, pricing run, reconcile, audit report or packet export (the daily monitoring schedule
  queues every practice's monitoring at 05:10 UTC), and not at 01:20 UTC, when the audit copy reads;
- check that no vacuum runs, as the sections above show.

Once the migration holds the four, it reads every practice's responses and versions once (the preflight, below), adds
one nullable column with its foreign key (no scan: every row is NULL), builds two partial indexes and
replaces five functions. No table is rewritten and no ledger table is locked. The index on `source_document` is the
whole of the hold: the column and its key took milliseconds on two million synthetic rows and the index about a
second per million documents on a development machine, so once an environment holds more than about two million
documents, expect signed-in requests that touch a document to be refused as busy for those seconds. The preflight's read is quick while
practices are few; it reads every practice's responses and versions under the tenant policies, and on synthetic rows
for 2,000 practices, 100,000 responses and 20,000 versions it took over a minute and a half. This migration applies
once to each environment, before launch, when those tables are small; an environment restored from a later copy
already has it. While the loop
waits (up to five minutes) the migration's session holds a snapshot, which holds back vacuum's cleanup for that long
and nothing else. Until its commit every request and job
that touches a document waits or, for a signed-in request, is refused as busy after its three-second lock timeout
with nothing saved (ADR 0092).

If no moment with the four free comes in five minutes, the deploy fails: cdk reports that the migration task stopped
without migrating, and `/tp/<env>/migration` ends with

> db:migrate: 20261114090000_payer_response_document_rules.sql failed: source_document, submission, payer_response or contract_version stayed in use for five minutes; run the deploy again (docs/adr/0085)

(`lock_not_available`, 55P03). This migration runs in one transaction, so it changed nothing, and no service moved
(step 4). Run the deploy again at a quieter moment. Never take the locks by hand, and never end another session's
transaction, or cancel a job or a vacuum, to make room.

**When the preflight refuses.** Holding the locks, and before it changes anything, the migration counts the documents
that a payer response names and a contract version also names, in every practice. From this migration on the database
refuses to make such a pair, and a version holding one could never be edited or amended again, so the migration does
not apply over one. If the count is not zero the deploy fails the same way, and the log ends with

> db:migrate: 20261114090000_payer_response_document_rules.sql failed: N document(s) are named by a payer response and by a contract version; nothing was changed (docs/runbooks/deploy-and-rollback.md)

(`check_violation`, 23514; a count only, never an id or a text). Nothing was changed and no service moved. The web's
handlers have refused both halves of such a pair since the payer-response pull request, so none is expected in any
environment: a count above zero means a row was written around the handlers, or two requests crossed before this
lock existed in the database. Treat it as a finding, not as a deploy to retry:

- do not run the deploy again, and do not change or delete a row by hand to make the count zero: a response is
  recorded for good, and a signed-off version's documents are what its expected amounts trace to;
- open an incident (docs/runbooks/incident-response.md) and find the pairs in the founder’s break-glass session, by ID only:
  the practice, the document, the response and the version, and the version's status;
- bring them to the founder. Which record is wrong is a person's ruling for each pair (the letter is a payer's
  answer, so the version should never have named it, or it is a payer's terms letter, so the response should name
  another document), and the correction is a reviewed, forward migration that says so in its audit events;
- deploy again once that migration has applied before this one, in the same release.

**The forward deploy and both images.** Every new refusal mirrors a check the previous web image already makes
before it writes, so nothing a person sees changes while both images serve or after. The new column is NULL
everywhere until the web half writes it. One thing is new for a caller that goes around the handlers: a response
naming a document, and a contract version naming documents, are refused above READ COMMITTED. No mutating route runs
there.

**Rollback across this migration** (to an earlier image, below) keeps the migration: the column, the two indexes and
the five functions stay, and it sets no rollback floor of its own. The previous web image runs on it unchanged. The
schema is never rolled back.

## An ROI statement's listed lines (ADR 0082's amendment of 2026-11-13; Schema PR 5)

**What the migration does.** `20261115090000_roi_statement_actionable_lines.sql` replaces two functions under the
founder's ledger freeze exception for schema PR 5 (`roi_links_valid` and `roi_statement_rules`, each the granted
text) and changes no table, column, index, policy, trigger definition or stored row. Before it replaces the second it
reads every stored ROI statement once through the new `roi_links_valid` (the preflight), one practice at a time under
the tenant policy, because PostgreSQL does not check stored rows again when a function a CHECK calls is replaced.

**Its locks.** Through the preflight's read it holds ACCESS SHARE on `roi_statement`, `practice` and their indexes,
the lock every SELECT takes: nobody waits for it, and it holds back vacuum's cleanup for as long as the read runs.
It does not take only reading locks. For its closing count it takes `roi_statement`'s SHARE lock with `NOWAIT`, once a
second, up to 30 tries, and holds it to its commit. A refused try holds and queues nothing. A try is refused by a
transaction that has written `roi_statement` and is still open (the reconcile job storing a statement, the print job
recording a statement's PDF, a person generating a statement on demand) and by a vacuum or analyze of the table,
autovacuum's included. A transaction that only reads the table never refuses it. While the lock is held a new
statement, the record of a statement's PDF and a vacuum or analyze of the table wait; readers do not.

**How long.** On an empty `roi_statement`, which is every environment before launch, the whole migration takes
milliseconds and the lock is held for about a millisecond. On synthetic rows (1,000,000 statements of 40 IDs in 1,000
practices, PostgreSQL 18.4, a development machine, the table's pages cached) the read took 196 to 206 seconds and the
lock was held 0.12 to 2.7 seconds, against a limit of five minutes for this migration. That was not measured on cold
storage: with nothing cached the read is expected to take longer, and the read does not stop itself at five minutes.
The deploy's own limit is the migration task's (50 minutes).

So, before this deploy on an environment that holds statements:

- deploy outside the practices' working hours, and not while the daily reconcile runs or statements are printing;
- check that no vacuum or analyze of `roi_statement` runs, as the sections above show.

If the table stays in use across all 30 tries, the deploy fails: cdk reports that the migration task stopped without
migrating, and `/tp/<env>/migration` ends with

> db:migrate: 20261115090000_roi_statement_actionable_lines.sql failed: roi_statement stayed in use for 30 seconds at the preflight's closing count; run the deploy again

(`lock_not_available`, 55P03). The runner does not try this one again by itself. This migration runs in one
transaction, so it changed nothing, and no service moved (step 4). Run the deploy again at a quieter moment; the read
starts over. Never take the lock by hand, and never end another session's transaction, or cancel a job or a vacuum, to
make room.

**When the preflight refuses.** If a stored statement does not pass the new `roi_links_valid`, the deploy fails the
same way, and the log ends with

> db:migrate: 20261115090000_roi_statement_actionable_lines.sql failed: R of N stored ROI statements, in H of P practices, fail the new roi_links_valid; nothing is changed

(`check_violation`, 23514; the four letters stand for counts, and counts are all it prints: never an ID, a links
text or a figure). Nothing was changed and no service
moved. By the two function bodies the only stored statements this can be are ones whose `links` is the empty object,
which no code writes, so a count above zero means a row was written around the application. Treat it as a finding,
not as a deploy to retry:

- do not run the deploy again, and do not change or delete a statement by hand: a statement keeps its figures, and
  the table refuses UPDATE of them and DELETE;
- open an incident (docs/runbooks/incident-response.md) and list the statements in the founder's break-glass
  session, by ID only, with the query the migration's header gives;
- bring them to the founder. The correction is a reviewed, forward migration under a ledger freeze exception of its
  own, applied before this one in the same release.

Two other refusals name their own cause and change nothing: either function's stored body is not the one the
exception was granted on (a migration that sorts before this one changed it: the founder's question again, never a
rebase), or the preflight read a number of statements that the table's emptiness contradicts (the role or the scope
it ran under read nothing: a finding for the build, not a retry).

**The forward deploy and both images: this order only.** The migration first, then the image, as every release runs:
no service moves until the migration task has finished. After the migration and before the new image, the previous worker stores four-key statements
and records PDFs as before. After the new image, statements carry five keys (the fifth lists the priced lines the
actionable figure counted) and the database refuses a statement whose actionable figure is not the variance of the
lines it lists; the previous image, in a rollback or as the other task during a deploy, reads `links` by key name and
ignores the fifth. The new worker against a database without this migration would have every statement refused by
the old CHECK, which the release order never produces. Nothing a person sees changes: the statements list, a
statement's page, its CSV and its PDF read the same four keys.

**Rollback across this migration** (to an earlier image, below) keeps the migration and needs no data change: the
two functions stay, and the previous image runs on them unchanged. It sets no rollback floor of its own. This
migration is never rolled back; a fix is a new forward migration under a new exception.

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

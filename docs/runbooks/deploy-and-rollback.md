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
first release). Point the two DNS names at the `LoadBalancerDnsName` and `StaticAssetsDistributionDomain` outputs. Write
the Stripe keys (docs/runbooks/billing.md) and set up support mail (docs/runbooks/support-mail.md).

## A release

1. **Tag.** Merge to main with CI green and the founder's approval, then the founder creates the tag
   `v<major>.<minor>.<patch>` on main's merged commit (docs/runbooks/github-governance.md, 4C: only the founder can).
   The release workflow builds, scans and pushes both images with a software bill of materials. Before anything below,
   check that the tag names a commit on main; this must exit 0:

   ```
   git fetch origin --tags && git merge-base --is-ancestor <tag> origin/main
   ```

   If it does not, stop: the tag is not a reviewed release, and the deploy waits for one that is (the change-management
   policy, rule 5).
2. **Images for the environment.** Push both images to the environment's `WebRepositoryUri` and `WorkerRepositoryUri`
   under the tag (immutable tags: a tag is never pushed twice). Build the web image for the environment with its static
   host, so pages load their assets from CloudFront (Next writes the prefix into the build; ADR 0055):
   `docker build -f apps/web/Dockerfile --build-arg STATIC_ASSET_ORIGIN=<StaticAssetsOrigin output> .` A web image built
   without it still works: its assets load from the application host.
3. **Deploy.** `cdk deploy tp-<env> --parameters ImageTag=<tag>`. The migration task runs first, as the owner login,
   and creates any missing service login; no service moves to the new task definition until it has exited 0, so a failed
   migration fails the deploy before traffic moves. Each service then rolls with its circuit breaker.
4. **Smoke checks.** `GET https://<AppDomainName>/api/health` answers 200 (it touches the database); `/sign-in` and
   `/status` load; `/.well-known/security.txt` names the environment's `SecurityEmail` and links `/security`, which
   loads; in production, `/security` shows neither "What you can expect from us" nor "Research in good faith" while
   `docs/product/legal-surfaces.md` still lists them (a production server leaves out a legal text whose review is not
   recorded); a synthetic smoke account signs in; the platform log group shows each platform job's next scheduled run;
   the uptime canaries go green within ten minutes. On an environment's first deploy, and whenever `SecurityEmail`
   changes, send a test message to it and have the security official confirm it arrived. In staging, run `pnpm test:e2e`
   against the release before tagging it for production.

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

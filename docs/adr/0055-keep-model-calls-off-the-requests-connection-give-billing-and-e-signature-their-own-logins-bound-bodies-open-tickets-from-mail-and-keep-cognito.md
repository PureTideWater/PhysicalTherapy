# 0055. Keep model calls off the request's connection, give billing and e-signature their own logins, bound bodies, open tickets from mail, and keep Cognito

- **Status:** accepted; several parts are proven only by tests until the first staging deploy (see Consequences);
  amended by PR 6b-4 (below: Cognito's mail through the stack's identity and the transactional configuration set from
  the mail's phase 2;
  [0065](0065-send-mail-in-three-ses-streams-record-each-messages-delivery-send-notices-from-an-outbox-and-pause-the-screening-stream-alone.md))
- **Date:** 2026-10-17
- **Deciders:** founder (engineering)
- **PRD sections:** 5 (J18), 6 (Admin console; Billing; Agreements), 7 (Internal console; every screen's states), 13
  (ROI statement), 14 (Operational limits; Provider and data path), 15 (Stack: compute, documents, models), 16
  (Controls; Upload safety; Secrets; Change management), 19 (Runbooks; Monitoring; Support), 20 (Open decisions:
  Identity); test matrix MOD-05, MOD-06; CLAUDE.md "Never" (middleware alone; PHI in logs); ADRs 0015, 0019, 0048 to
  0054

## Context

Independent reviews of milestones 10 and 11 found 25 problems. Six were major: a model call could deadlock a web
task's database pool; a late failed-payment event never started the dunning clock; the dunning job stopped reaching new
failures; two submissions could subscribe an organization twice; no deployed task could call Bedrock or Textract; and
the console had no control for the model flags. Others were minor: the application login could reach billing's and the
e-signature webhook's privileges; webhook bodies were bounded only by their declared length; ticket text passed names
and dates; an invitation told an organization that an address belonged to another; and several texts, states and
runbooks were missing. This ADR records each decision, what stays open, and the findings that were not taken.

## Decision

**A model call never waits on its own request's pool.** The gateway's store (feature flags, budget holds, the
`model_call` row) runs on a pool of its own (`Services.modelPool`, five connections); each server makes at most four
model calls at once and each practice two (`CallLimiter`, `DEFAULT_CALL_LIMITS`). A call over a cap is refused at once
as `busy`, and the screen offers hand entry. Every pool and pg-boss gives up on a connection after ten seconds
(`CONNECTION_TIMEOUT_MS`), so an exhausted pool fails a request instead of hanging it. The load balancer's health check
is `GET /api/health`, which runs `SELECT 1`, so a task whose pool is starved is replaced. The load balancer's idle
timeout is 180 seconds, above two 60-second attempts, and the Next server keeps connections alive for 185 seconds.

**Billing and the e-signature webhook run on logins of their own.** The application login can no longer switch to
`tp_billing`. Billing's webhook and screens connect as `BILLING_DATABASE_URL`, a login (`tp_billing_login`, rotated in
Secrets Manager) granted `tp_billing` with `INHERIT FALSE, SET TRUE`. The platform jobs' operator role may also switch
to it for dunning and the usage snapshot. `record_esigned_agreement()` is executable only by the NOLOGIN role
`tp_esign`, which the e-signature webhook enters with `SET LOCAL ROLE` from its own login (`ESIGN_DATABASE_URL`). The
catalog test refuses any path from the application role to `tp_billing`, `tp_esign`, `tp_operator` or `tp_owner`.
Development uses the logins `tp_billing_dev` and `tp_esign_dev`.

**Request bodies are counted as they stream.** A route handler reads its body with a running byte count and answers 413
once the count passes the route's limit: a signed webhook's own limit, and 1 MB for a JSON POST. A chunked body is
refused as early as a declared one. Next's proxy buffers no more than 11 MB of any body, the largest legitimate one (a
server action carrying a signed agreement's PDF).

**Tickets are screened for written patient details.** `writtenPhiFindings` adds four checks to the identifier shapes:
dates written out, a birth date, identifiers of letters and digits, and a capitalized name after a word that introduces
a person ("Patient", "Member", "Mr" and the like). The form asks for screens and opaque IDs only.

**An invitation answers one way for every address in use.** `invitation_email_in_use()` is asked before the identity
provider is called. Every address in use, in this organization or elsewhere, gets the same answer, which names no
organization.

**Billing.** Each failed payment is recorded apart from the invoice snapshot's staleness. `first_failed_at` may only
move earlier, so a late `invoice.payment_failed` still starts the dunning clock. The dunning job selects only invoices
that may still need a notice, oldest first, so a backlog of settled ones cannot crowd out a new failure. A paid
invoice's stage is decided from when it was paid: on or after its suspension time means reinstated (with the notice and
the audit event); before, resolved. The first notice gives the suspension's day and time in UTC. Subscribing claims
`subscription_claim` first; a unique partial index allows one pending or created claim per organization, and the
Stripe idempotency key is the claim's. `practice_fees_paid` shares an invoice among the practices that existed when it
was paid (`practice.deleted_at`), so deleting a practice later changes no past period.

**The console switches the model features.** `/console/models` (`feature_flag.manage`, audited) sets the kill switch,
the daily budget and the letter reader for everyone, an organization or a practice, through `set_feature_flag()`. It
shows each active practice's calls and cost today against its budget (`console_model_spend()`, counts and amounts
only). The MOD-06 journey turns the kill switch on there. The console also suspends and reinstates an organization
(`console.organization_status`), through the same run refusal billing uses.

**The deployed tasks name their model path, and intake reads scans.** The web and worker tasks set
`MODEL_PROVIDER=bedrock` and `BEDROCK_REGION`; the application role may invoke the pinned models. In S3 mode the
worker's intake gives the page reader Textract (`createTextractPageReader`). A clean scanned document's bytes are
written once under `textract/` in the documents bucket, under a random key and SSE-KMS, and expire after a day like the
intake copies. The application role may start and read text detection, whose actions take no resource. Textract has
an interface endpoint.

**Static assets come from CloudFront when the image is built for it.** `next.config.ts` sets `assetPrefix` from
`STATIC_ASSET_ORIGIN`, a Docker build argument that must be an https origin. The web task names the same host so the CSP
allows scripts, styles, images and fonts from it. CloudFront answers `Cross-Origin-Resource-Policy: cross-origin` for
the assets, since the application's own `same-origin` would block them on the static host.

**Mail to the support address opens a ticket.** SES receives the address's mail over TLS, scans it and writes it to the
stack's support inbox (a private bucket under the environment key, a week's retention). Every five minutes the platform
`support_mail` job reads each message once (`support_mail_receipt`, by the SHA-256 of its key). A message opens a
ticket only when:

- the first `Authentication-Results` and `X-SES-Virus-Verdict` headers, which are SES's own, show a clean scan and DMARC
  passing for the From domain, or DKIM passing for a domain aligned with it;
- `operator_record_support_mail()` finds a non-disabled account at the From address.

Text that looks like it holds patient information opens a ticket that says only that a message came. The job never
learns who the sender is and logs codes only. A directory of `.eml` files (`SUPPORT_MAIL_DIR`) stands in for the inbox
locally. The stack does not activate its receipt rule set, because a region has only one active set.

**Runbooks.** `docs/runbooks/deploy-and-rollback.md`, `restore-drill.md`, `key-rotation.md` and `support-mail.md` are
written. Change management, Backups and restore, and Secrets name them as evidence, so `controls.test.ts` fails if one
goes missing.

**Smaller fixes.** The published response target is the plan's wording. The specialist queue's text describes the
proposals that milestone 10 now makes.

**Identity (PRD 20's open decision, revisit at milestone 11).** Cognito stays the identity provider, under the AWS
BAA, until the first billing firm's security review. That review, not the build, is what would change it. The decision
is reopened if the review requires something Cognito cannot provide: SAML or OIDC federation with the firm's own
identity provider, its MFA policy, session or device controls, or audit export. It is also reopened if Cognito's
sign-in experience demonstrably loses customers. The replacement would be a BAA-covered identity vendor behind the same
`AuthProvider` interface (`apps/web/src/lib/auth`). The sign-in, MFA, hardware-key and session code above that
interface would not change.

## Alternatives considered

| Option | Why not (or when we would switch) |
| --- | --- |
| End the request's transaction before a model call and reopen it after | Every route runs its handler inside one practice-scoped transaction; splitting it for model routes would make their writes non-atomic. The separate pool and caps remove the deadlock. Switch if model calls move to jobs |
| Move model calls into a job the screen polls | A larger change to the screens and their tests; the caps and the 180-second idle timeout cover the 120-second worst case |
| A definer function that verifies a billing event's ID, with no direct invoice writes | The webhook already records each event once; a separate login takes away the path from the application with less change |
| Screening tickets against the requester's own practices' identifiers | Names and identifiers are encrypted under each practice's key, and the support form runs with no practice in scope. Reading them for every ticket would decrypt and audit-log PHI to check a support message |
| Keeping ticket text from the desk until a support grant opens | The desk could not triage; the screen and the form's instruction keep PHI out instead |
| Rebuilding the asset prefix at container start | Next writes the prefix into the build, client chunks included; rewriting files at start is fragile and unverifiable here |
| Polling an IMAP mailbox for support mail | Another credential and a mail vendor outside the AWS BAA; SES receiving keeps mail inside the account |
| Activating the receipt rule set from the stack | It would deactivate any other rule set in the account and region |

## Not taken

- **The readiness checklist is not green, and the repository cannot make it so** (milestone 11's done check). The
  policies need the security official's approval and the people's records need to exist: access and vendor reviews,
  the tabletop, the risk analysis, the attestations and the named official. The restore drill and Stripe's test-mode
  ACH need staging. These are a person's tasks (docs/runbooks/restore-drill.md; docs/runbooks/billing.md, step 4).
- **The specialist can mark a contract ambiguous** was already fixed when the review ran (commit 6b781c4).
- **Bedrock's IAM permission and the budget alarm's metric filter** were already in place (commit b8746d0). This round
  adds the task settings, Textract and the console's spend view.
- **A loading.tsx for every page that lacks one.** A route segment's loading.tsx wraps its pages in a Suspense boundary,
  so Next sends a 200 and streams before the page's own checks run. A refusal then stops being a status: a 404 for
  another practice, or the redirect of a request without a session, arrives as a 200 page. The sign-in journey holds
  the refusal to a status ("a redirect status, not a page streamed with 200", for sessions.md's "the next request is
  refused"), and the e2e journeys failed on exactly this when the files were added (the sign-in and hardware-key
  journeys, and uploads made before the page hydrated). A
  loading state that keeps the refusal statuses needs each page's checks moved into a layout above the boundary, which
  is a change of its own. The leaf loading.tsx files from earlier milestones have the same effect on their own pages,
  and should be reviewed against that rule in the same change.

## Consequences

- New migrations: `20261101090000_billing_review.sql`, `20261101100000_esign_and_billing_logins.sql`,
  `20261101110000_console_models_and_invitations.sql` and `20261101120000_support_mail.sql`. New tables:
  `subscription_claim` and `support_mail_receipt`. New columns: `support_ticket.source` and `mail_ref`, and
  `practice.deleted_at`. The data dictionary does not list them yet.
- Production web tasks need `BILLING_DATABASE_URL`, which the stack builds from the billing login's secret, and
  `ESIGN_DATABASE_URL` once an e-signature vendor is chosen. The stack has no e-signature login yet, because no vendor
  is chosen (`ESIGN_PROVIDER=none`).
- The release workflow builds one image per tag for GHCR, without a static host, so those images load their assets
  from the application host. CloudFront serves them only for a web image built per environment with
  `STATIC_ASSET_ORIGIN` (docs/runbooks/deploy-and-rollback.md, step 2). Strict promotion of one image across
  environments and a per-environment asset host cannot both hold.
- Unproven until a staging deploy:
  - SES's write into the inbox under the environment key (the key policy admits SES only through S3, for this account;
    naming the bucket would make a cycle);
  - SES's header verdicts as the reader expects them;
  - Textract reading a staged object with the task role's own S3 and KMS permissions;
  - the asset prefix served through CloudFront.
  The support-mail runbook's step 5 checks the first two.
- A name written with no title or other cue still passes the ticket screen. The invitation check still tells an
  administrator that an address is in use somewhere, which unique email addresses imply; rate limits bound how often
  it can be asked.
- A model call still runs inside its request's transaction, holding one connection of the request pool for up to two
  minutes. At most four calls run per task, so a task's other requests keep six of its ten connections.

## Revisit when

The first staging deploy, the choice of an e-signature vendor, the first billing firm's security review, or model
calls moving into jobs.

## Amendment (PR 6b-4, 2026-10-23): Cognito's mail goes through the transactional stream

Audit #76 (docs/adr/0065, D2): Cognito stays the identity provider, and its mail (invitations with their temporary
passwords, verification and recovery codes) becomes one of the three SES streams. Until now the user pool sent as
`DEVELOPER` through an identity verified by hand, with no configuration set, so nothing recorded whether an invitation
arrived.

- **Phase 1** (`MailIdentitiesVerified=false`, the default): the user pool has no `EmailConfiguration`, so Cognito uses
  its own sender (no-reply@verificationemail.com, at most 50 messages a day), which needs no verified identity. A first
  deploy cannot fail on an identity the same deploy creates.
- **Phase 2** (`true`, once the stack's identity for MailFromAddress's domain reads verified): `EmailSendingAccount` is
  `DEVELOPER`, `From` is MailFromAddress, `SourceArn` the stack's identity and `ConfigurationSet` the transactional set
  (`tp-<env>-transactional`), so every Cognito message's events reach the platform. Cognito adds no message tag; the
  platform takes a transactional message with no kind as Cognito's and finds its user by the recipient, and a message
  to an invited user that bounces, is suppressed, rejected or reported flags the invitation (the users page shows "Not
  delivered" while the report is about the email last sent; `INVITATION_UNDELIVERED` pages the operator).
- The property is written to the resource under the condition `MailIdentitiesReady` (`Fn::If`, with `AWS::NoValue` in
  phase 1), since both the address and the identity are deploy-time values (`infra/test/identity.test.ts` asserts both
  phases).
- **Open (O11):** whether Cognito needs a sending-authorization policy on an identity in its own account when a
  configuration set is named; staging's phase 2 shows it (docs/runbooks/deliverability.md, section 2), and a policy, if
  needed, is a change to `infra/lib/constructs/mail-streams.ts`.

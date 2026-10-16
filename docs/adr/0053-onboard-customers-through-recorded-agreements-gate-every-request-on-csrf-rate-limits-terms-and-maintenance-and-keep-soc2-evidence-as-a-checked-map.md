# 0053. Onboard customers through recorded agreements and invitations, gate every request on CSRF, rate limits, terms and maintenance, and keep the SOC 2 evidence as a checked map

- **Status:** accepted for the build; the identity provider's email, the e-signature vendor, the compliance platform and
  the security official's approvals are outside what the build environment can reach (see Consequences)
- **Date:** 2026-10-16
- **Deciders:** founder (engineering)
- **PRD sections:** 5 (J1, J2, J14, J15), 6 (Agreements; Audit log; Identity and sessions), 7 (Settings; Internal console),
  13 (proof level), 16 (Controls and their tests; SOC 2 and HIPAA evidence), 19 (Support; Runbooks), 20 (the e-signature
  vendor); docs/product/sessions.md; milestone 11; ADRs 0016, 0017, 0043, 0046, 0049, 0050

## Context

Milestone 11 asks for the customer's way in (a request, an organization, its agreements, an invitation, MFA, the terms,
a team, a plan), the practice's Settings screen, and production readiness: CSRF on every mutation, rate limits,
security headers, error, maintenance and status pages, help and support, and the SOC 2 Type I evidence checklist with
policies. The plan names no e-signature vendor and no compliance platform, and the build environment reaches neither
Cognito's email nor any vendor.

## Decision

**Onboarding (J1, J2).** The public form at `/request-audit` takes no PHI: each text is screened for identifier shapes
(`textPhiFindings`) and kept only through `submit_prospect_request()`, counted per address. A platform administrator
converts a request into a practice group in the console, invites its practice administrator (the database refuses a
practice before its group has one), creates the practice and records the agreement chain. Agreements arrive two ways:
the e-signature vendor's webhook (`/api/agreements/webhook`, an HMAC signature over the raw body checked before
anything is read, the signed document fetched from the vendor and hashed here, recorded once per event by
`record_esigned_agreement()`), or a signed PDF uploaded in the console, hashed on the server and written once under
`agreements/<organization>/<agreement>.pdf` (the documents bucket's key, `If-None-Match`). Both store the agreement by
reference and SHA-256, as PRD 6 says. The vendor is an interface (`ESignatureProvider`) with a local stand-in that signs
its events the same way; production runs with none until procurement chooses one.

**Invitations.** Any membership a person creates for an invited user writes an `invitation` row (a trigger), which lasts
seven days, exactly as long as Cognito's temporary password (`tempPasswordValidity`, now seven days; a test holds the
two equal). An expired invitation refuses sign-in with its reason and is sent again only by the organization's
administrators or a platform administrator (`resend_invitation()`; Cognito's `AdminCreateUser` with `RESEND`).

**Terms of use.** Versions are published by reference and SHA-256 and never change; the latest is in force. Every
customer request (not the console's, whose staff work under the workforce policies) passes the terms gate in the route
wrapper (`app_actor_terms_required()`): a customer who has not accepted the version in force is sent to `/terms`, and
again when a new version is published. Each acceptance keeps its version and time. The terms page, support and sign-out
are exempt.

**The Settings screen.** Each section is its own route, so each is checked and tested on its own: the overview with
J2's checklist; users and roles (organization routes under `/settings/organizations/<organization>/users`); grants and
agreements with the administrator's confirmation of the chain (an audit event `agreement_chain_confirmed`); materiality
and pursuit defaults; the proof level; the access log; export and deletion (a stated placeholder until milestone 12);
notification preferences and billing linked where they already live. Administrator-only sections are marked.

**The proof level rule.** The level applies to the whole ledger at once, and only the practice administrator sets it.
Raising it to deposited moves each line recovered by its posting but not yet deposited back to payer approved, without
reopening its case, until its deposit matches; lowering it to posted moves every posted line to recovered. Statements
already printed keep the level they were printed at. Saving queues the practice's reconcile (`{practice_id, day}`),
which makes the move; a line moved back carries the note that says why. The screen states the rule and counts the lines
it would move before the change is saved.

**CSRF.** Every mutation of a signed-in user carries a token bound to the session: an HMAC of the session cookie's
token under the server's key (`csrfTokenFor`), rendered into every form by `FormKeys` and sent by scripts in the
`x-csrf-token` header, compared in constant time. Every POST and PUT, sessions or none, is also checked for the
application's origin (`Origin`, `Sec-Fetch-Site`) before anything in it is read, which also stops a sign-in step posted
from another site; only a webhook its sender signs skips the origin check. The cookies stay as sessions.md sets them
(`HttpOnly`, `Secure`, `SameSite=Lax`, 12 hours absolute, 30 minutes idle), rechecked here. The generated route tests
prove every mutation refuses a missing token, another session's token, a malformed one and a foreign origin.

**Rate limits.** Fixed windows counted in Postgres (`rate_limit_take()`), so every web task shares them, before the
request's transaction, so a refused attempt counts. Subjects are HMACs (never an address, email or user ID in clear):
per user for mutations, uploads and exports; per address and per account for sign-in and MFA; per address for the
public form and webhooks. The client's address is X-Forwarded-For's entry `TRUSTED_PROXY_HOPS` from the end (1 behind
the load balancer; required in production; 0, no address, elsewhere). The limits are the build's defaults, behind the
WAF's own (ADR 0049).

**Security headers.** A per-request Content-Security-Policy with a nonce (`src/proxy.ts`: scripts from this origin and
the nonce, `strict-dynamic`, Stripe's for its payment form; no framing, no plugins, `form-action 'self'`), and the fixed
set on every response from `next.config.ts` (HSTS, nosniff, `X-Frame-Options: DENY`, referrer, permissions,
cross-origin policies).

**Maintenance, status, errors.** A global `platform.maintenance` flag, set in the console through `set_feature_flag()`
and read by the wrapper at most every five seconds per server, sends every customer route to `/maintenance` while the
console stays open. The public `/status` page shows components and incidents staff wrote, through definer functions
that name nobody. The error pages show Next's opaque reference only and link to support and status.

**Support.** Every screen's help (`components/help.ts`) links to `/support`, which opens a ticket naming the screen;
the support address beside it opens one too (the desk records what arrives by email). Ticket text is screened for
identifiers like the public form: a ticket is not a place for PHI, and when the answer needs a practice's records the
desk opens a support grant (ADR 0019), which tells the practice administrator. The desk's queue reads requesters
through a definer function, since a support engineer reads no user row.

**The SOC 2 Type I checklist.** `packages/compliance` maps every control of PRD 16's table, word for word, to proposed
SOC 2 criteria and HIPAA Security Rule sections and to its evidence sources: CI steps, database and unit tests, CDK
assertions, e2e tests, runbooks, policies, records a person keeps, evidence the compliance platform collects from AWS
and GitHub, and evidence a later milestone builds. `controls.test.ts` proves on every build that each named test exists
with its title, each CI step is in its workflow and each runbook and policy is in the repository with its version. What
only a person can produce (a policy's approval of its current version, the quarterly access and vendor reviews, the
yearly tabletop and risk analysis, each workforce member's yearly attestation, the named security official) is a
`compliance_record` by reference and SHA-256, and the restore drill's evidence is its own table; the checklist reads
them live and never assumes them. The export (`tp-compliance-evidence/1`, JSON, no PHI and no names) is downloaded from
the console or sent over the `CompliancePlatform` interface, whose only implementation until a vendor is chosen writes a
file. The six policies in `docs/policies/` are drafts written from the plan for the security official to approve.

## Consequences

- J1 and J2 run end to end on the local providers (`apps/web/e2e/onboarding.spec.ts`): request, group, invitation,
  practice, agreements by upload and by webhook, password, MFA, terms, the confirmed chain, a team, a test ACH payment and
  the dashboard. Cognito's invitation email through SES, a real e-signature vendor and Stripe are not exercised here.
- The checklist is not green, and cannot be from the repository alone: every policy awaits approval, no review, tabletop,
  attestation, risk analysis or security official is recorded, no restore drill has run in an environment, and the
  deletion test and the monthly report of reads by role are milestone 12's. Fifteen of the seventeen controls become ready
  once their records exist; encryption and the audit log stay partial until milestone 12.
- The criteria mapping is a proposal; the security official and the auditor confirm it before the examination.
- The stack gains a CloudFormation parameter, `SupportEmail` (the address every screen's help names), so ADR 0049's
  deploy commands also pass `SupportEmail=…`; the web task sets `TRUSTED_PROXY_HOPS=1`, `ESIGN_PROVIDER=none` and
  `TP_ENVIRONMENT`, all of which the web app requires in production.
- Each new migration is forward-only: `20261030090000` (the tables and functions), `20261030100000` (the desk's queue and
  the workforce list), `20261030110000` (the payers check the application role evaluates on review).

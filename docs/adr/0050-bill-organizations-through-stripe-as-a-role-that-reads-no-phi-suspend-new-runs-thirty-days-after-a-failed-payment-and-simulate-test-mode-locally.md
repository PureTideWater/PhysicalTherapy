# 0050. Bill organizations through Stripe as a role that reads no PHI, suspend new runs 30 days after a failed payment, and simulate test mode locally

- **Status:** accepted; amends [0019](0019-close-the-standing-access-paths-and-run-platform-jobs-as-an-operator-role.md)
  (roles), [0049](0049-run-the-compute-on-fargate-behind-an-https-only-load-balancer-and-waf-migrate-before-traffic-moves-and-egress-through-nat-for-what-has-no-endpoint.md)
  (the web task's settings and secrets), and the ROI statement's fee seam of milestone 9
- **Date:** 2026-10-16
- **Deciders:** founder (engineering)
- **PRD sections:** 4 (billing in the platform's scope), 5 (J18: subscription, payment method, invoices in the
  organization's settings, audit invoices, dunning, suspension after 30 days with data readable), 6 (Billing row and its
  acceptance: "a test ACH payment completes; a suspended organization can read but not run"), 8 (billing never reads PHI
  tables), 13 (the ROI statement's fees), 15 (Stripe in the stack), 16 (secrets, webhooks); data dictionary rows
  subscription, invoice and usage_snapshot; milestone 11, part B

## Context

Billing is the organization's, never the practice's: a practice group or a billing firm pays for monitoring (monthly or
annual) and for audits, by ACH debit or card, through Stripe. Billing's code must never read PHI (PRD 8), Stripe's events
arrive by webhook from the public internet, a failed payment leads to dunning and, after 30 days, to a suspension that
stops new runs while every screen stays readable, and the ROI statement has waited since milestone 9 for the fees the
practice paid. None of it can be exercised against Stripe here: api.stripe.com is blocked from the build environment and
there are no Stripe keys, so the Stripe implementation is tested against the official SDK with a mocked client, and the
flows the product runs are exercised end to end against a local simulator of Stripe's test mode.

## Decision

**Records** (migration `20261029150000_billing.sql`; `packages/db/src/schema/billing.ts`). Four organization-level
tables with no practice and no PHI: `subscription` (one per organization: plan monthly or annual, Stripe's status, the
current period), `invoice` (Stripe's invoice: kind subscription, audit or other, integer cents due, paid and remaining,
status moving forward only, `first_failed_at` set once by the first failed payment, the dunning stage, how it was paid),
`usage_snapshot` (per organization per day: granted and active practices; written once, never changed) and
`billing_event` (each Stripe event ID once, with its outcome: applied, stale, ignored or unknown customer). Organizations
carry `billing_customer_ref` (Stripe's customer). Every table has row-level security: an organization's administrators
(the `organization.billing` permission: a group's practice administrator, a firm's principal) and platform
administrators (`billing.manage`) read; nobody writes but billing.

**Billing's role.** `tp_billing` is a NOLOGIN role that owns nothing. The application and operator logins are its
members `WITH INHERIT FALSE, SET TRUE`, so its privileges apply only inside a transaction that runs `SET LOCAL ROLE
tp_billing` (`withBilling`, `apps/worker/src/billing/scope.ts`), which also empties `app.practice_ids`. It may read and
write the four billing tables, read the organization's ID, kind, name, status and customer reference, write the customer
reference, and call three definer functions: `billing_usage_counts()` (counts per organization), `billing_owner_emails`
(the addresses dunning writes to) and `billing_record_audit` (billing's audit events). It has no privilege on any table
that can hold PHI; `apps/worker/src/billing/billing.db.test.ts` proves it from the catalog (every PHI table: no
privilege; the definer functions it can execute: exactly those three) and from the memberships (non-inheriting).

**The provider** (`packages/billing`). `BillingProvider` is what the product asks of Stripe: a customer, a SetupIntent
for Stripe Elements (ACH through `us_bank_account`, verified automatically: instantly or by microdeposits; and card), the default
payment method, a subscription to the monthly or annual price, an audit invoice, paying an open invoice, an invoice's
latest payment, and reading a webhook. `StripeBillingProvider` uses the official SDK (at the API version its release pins), finds or
creates its products and prices by lookup key, and sends an idempotency key with every request that creates or changes
something (derived from the request key of the form that asked, so a retried request creates nothing twice).
`LocalBillingProvider` simulates test mode: Stripe's IDs, its test values (routing number 110000000; account
000123456789 settles, 000111111116 is closed, 000222222227 has insufficient funds; card 4242424242424242 succeeds,
4000000000000341 is declined), ACH debits that stay pending until settled (`settle()`, or `advance(days)`, which also
retries failed payments on days 3, 7 and 14 and renews subscriptions), a declined card refused at once as Stripe's
`invoices.pay` refuses it, and Stripe-shaped events signed with Stripe's scheme (`t=…,v1=HMAC-SHA256`) delivered in order.
The plan and audit prices are in `packages/billing/config/plans.json` with `confirmed: false`: synthetic placeholders
(monthly $500, annual $5,400, audit $2,500) until the company sets its prices.

**Webhooks.** `POST /api/billing/webhook` is a public route that reads the body as sent (the signature covers its exact
bytes, at most 1 MB) and the `Stripe-Signature` header, verifies it before reading anything (five minutes' tolerance),
and answers 400 with nothing recorded when it does not verify. A verified event is claimed in `billing_event` by its ID
in the same transaction that applies it, so a repeated delivery answers 200 `duplicate` and changes nothing; an event
older than what is recorded for its object is recorded `stale` and changes nothing (Stripe does not order deliveries);
an event for a customer no organization holds is recorded `unknown_customer`. In development and the e2e suite the
simulator's events go through the same `receiveWebhook` in process.

**Dunning and suspension.** The clock starts at an unpaid invoice's first failed payment. The platform job
`billing_dunning` (daily) emails the organization's administrators on the day, a week later, two weeks later, a week
before the suspension and on the day it takes effect, and, once a suspended organization's invoice is paid, that new runs
have started again (a payment before the suspension ends the notices quietly). The suspension is not a
stored flag: the view `billing_standing` computes it (an open or uncollectible invoice whose payment first failed 30 or
more days ago), so it ends the moment Stripe's `invoice.paid` arrives, with nothing to reinstate by hand.
`organization_run_refusal` gives the reason, also for an organization a platform administrator holds suspended or has
closed. New work is refused in three places, each with the reason: the route wrapper refuses the routes that start new
work (a pricing run or re-run, triage, an audit report, a report document, an ROI statement, a packet export, an upload
and its retry; `apps/web/src/lib/billing/runs.ts`) with the outcome `suspended` (HTTP 402); the worker refuses a
run-starting job (monitor, reconcile, digest, packet export) and records it `refused`, not failed, so it is neither
retried nor alerted; and the database refuses the same work where it is recorded (triggers on pricing_run, audit_report,
report_document, roi_statement, digest, an uploaded source_document and a packet version's export), SQLSTATE 55000,
which the wrapper also turns into `suspended`. Work already started finishes: a zip's entries, a job past its check.
Every read stays open; the dashboard, the Uploads screen and the billing page say why runs have stopped.

**Usage snapshots.** The platform job `usage_snapshot` (nightly) records each group's and firm's granted and active
practices for the day, once; milestone 12 bills firms from them.

**The ROI statement's fees.** `practice_fees_paid` sums the group's invoices paid in the statement's period, each shared
equally among the group's active practices that existed when it was paid, the leftover cents one each to the earliest,
so the practices' fees add up to the invoice exactly (`PAID_INVOICE_FEES` replaces the zero source of milestone 9).

**Screens.** Settings, Billing (`/settings/billing`) lists the organizations the person administers; each one's page
(`/settings/billing/<organization>`) shows the standing and any notice, the plan (chosen once; a change of plan is
Stripe's customer portal's or an operator's), the payment method (Stripe Elements' Payment Element with a SetupIntent
in production, the simulator's test-value form in development), the invoices with Stripe's hosted page, and a button
to pay an open invoice now. These are a new kind of route, `organization`: the organization is named in the path, a
non-member gets not found, the permission is checked in the handler and again by the policies, and no practice is in
scope. The internal console's Billing status (`/console/billing`) lists every group's and firm's standing, plan, open
amount and latest usage, and issues an audit invoice; route results carry cents as text, as every route does.

**Configuration and deployment.** `BILLING_PROVIDER` is `stripe` or `local`. A production build refuses `local` (outside
the e2e suite) and any of the three Stripe settings missing, and bills in the mode the deployment names:
`BILLING_STRIPE_MODE` is `live` in the production environment and `test` in dev and staging (the stack sets it), the keys
must be of that mode, and live mode refuses plan prices that are not confirmed, so production cannot bill at placeholder
prices or with test keys, while staging runs Stripe's test mode at them. The web task reads `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET` and `STRIPE_PUBLISHABLE_KEY` from one Secrets Manager secret under the environment key, created
with placeholders the app refuses; only the web task names it. Stripe is reached through the NAT gateways (ADR 0049).
`docs/runbooks/billing.md` lists what an operator sets.

## Consequences

- Billing cannot read PHI even if its code tries: the role it runs as has no privilege on a PHI table, and the tests
  prove it from the catalog.
- A suspension and a reinstatement need no job and no person: they follow the invoice. The 30 days are counted in one
  place in SQL and in the dunning schedule; a database test holds the two to the same instant.
- A deploy of this change keeps the web app from starting until an operator writes the environment's Stripe keys (test
  keys in dev and staging, live ones in production) and, for production, the company confirms its prices (a commit
  setting `confirmed: true`). That is deliberate: there is no state in which production bills at a placeholder price or
  with test keys.
- Firms are billed at milestone 12, from the usage snapshots; a firm's own invoices and its suspension rules come then.
  An organization changes or cancels its plan through Stripe's customer portal or an operator until a screen exists.

## Not verified here

- No call has reached Stripe: no keys, and api.stripe.com is blocked from the build environment. The Stripe provider's
  requests are tested against the SDK's types with a mocked client; a person with test keys runs the flows once in Stripe's
  test mode (a test ACH payment through Elements, a declined card, a webhook from the Stripe CLI) before launch.
- The plan and audit prices are placeholders until the company confirms them.

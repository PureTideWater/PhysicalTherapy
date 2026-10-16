# Billing: Stripe keys, prices, the webhook endpoint and a stuck suspension

Billing is ADR 0050's. The deployed web app refuses to start until its environment's Stripe keys are written (test-mode
keys in dev and staging, live ones in production) and, in production, until the prices are confirmed, so production
never bills at a placeholder price or with test keys. Never paste a key into a ticket, a log, a commit or a session;
only into Secrets Manager.

## Before launch

1. **Prices.** The company sets the monthly, annual and audit prices. A pull request changes
   `packages/billing/config/plans.json`: the three `amount_cents` (integer cents, as text), `source` (who decided, and
   when) and `confirmed: true`. Review as any change to money.
2. **Stripe's keys.** In the Stripe dashboard (test mode for dev and staging, live mode for production; the stack sets
   `BILLING_STRIPE_MODE` to match), create a restricted or secret key, and a webhook endpoint at
   `https://<AppDomainName>/api/billing/webhook` with these events: `customer.subscription.created`, `.updated`,
   `.deleted`, `.paused`, `.resumed`; `invoice.created`, `.finalized`, `.updated`, `.paid`, `.payment_succeeded`,
   `.payment_failed`, `.voided`, `.marked_uncollectible`, `.overdue`; `setup_intent.succeeded`. Enable the
   `us_bank_account` (ACH Direct Debit) and card payment methods.
3. **Secrets Manager.** Write the environment's Stripe secret (`StripeSecret` in the compute construct; its description
   names the environment) as one JSON object: `{"secretKey": "sk_live_…", "webhookSecret": "whsec_…",
   "publishableKey": "pk_live_…"}` (`sk_test_`, `pk_test_` in dev and staging). Then force a new deployment of the web
   service so its tasks read it.
4. **Check.** The web service's tasks start (a refused setting is named in the web log group as `invalid settings: <NAME>`
   or `<NAME> is required`, never with its value). In staging, on Stripe's test mode, run once by hand: a test ACH
   payment through Elements, a declined test card, and a webhook sent with the Stripe CLI (`stripe trigger
   invoice.paid`), and record the result in the pull request.

## Rotating a key

Roll the key in Stripe, write the new value into the same secret, and force a new deployment of the web service. For the
webhook signing secret, Stripe keeps the old one valid for a period you choose: deploy within it.

## A webhook that did not arrive

Stripe retries failed deliveries for three days. Each delivery is recorded once in `billing_event` by its event ID, with
its outcome; a 400 means the signature did not verify (the wrong `webhookSecret`, or a proxy that changed the body).
Resend the event from the Stripe dashboard once the cause is fixed: a repeat changes nothing.

## A suspension that should have ended

A suspension is computed, not stored (the view `billing_standing`): it ends the moment the invoice is recorded paid.
If the customer paid and runs are still refused, find the invoice's `invoice.paid` event in Stripe and resend it. Do not
change `invoice` rows by hand. A platform administrator's own suspension of an organization (its status) is separate and
is lifted in the console.

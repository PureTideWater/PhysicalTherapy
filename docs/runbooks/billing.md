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
   `.payment_failed`, `.voided`, `.marked_uncollectible`, `.overdue`; `setup_intent.succeeded`. Then check
   the dashboard's payment settings (ADR 0073), in the same mode as the keys:
   - **Payment methods.** ACH Direct Debit (`us_bank_account`) and cards are the enabled methods. The application asks
     for exactly these two, the bank account first, on every SetupIntent, subscription and audit invoice, so another
     method the dashboard enables is never offered; but ACH turned off here leaves the card tab alone, so check that it
     is on.
   - **Financial Connections.** Its option to save a customer's bank login to Link stays off. The form turns Link off as
     a payment method, but this setting is Stripe's alone and the form cannot reach it; until it is checked off, nothing
     may say that adding a bank account creates no third-party account.
   - **One default, the customer's and every subscription's.** The customer's default payment method is the method on
     file and the one the billing page shows: subscriptions are created with `save_default_payment_method: 'off'`, and a
     new customer default becomes each live subscription's own default too, so the customer's default and every
     subscription's agree. A subscription's own default outranks the customer's and, left on the old card, would keep
     charging it after a bank account is added. Never set a payment method on a subscription by hand in the dashboard;
     let the administrator replace it on the billing page, which sets both.
3. **Secrets Manager.** Write the environment's Stripe secret (`StripeSecret` in the compute construct; its description
   names the environment) as one JSON object: `{"secretKey": "sk_live_…", "webhookSecret": "whsec_…",
   "publishableKey": "pk_live_…"}` (`sk_test_`, `pk_test_` in dev and staging). Then force a new deployment of the web
   service so its tasks read it.
4. **Check.** The web service's tasks start (a refused setting is named in the web log group as `invalid settings: <NAME>`
   or `<NAME> is required`, never with its value). In staging, on Stripe's test mode, run once by hand: a test ACH
   payment through Elements, a declined test card, and a webhook sent with the Stripe CLI (`stripe trigger
   invoice.paid`), and record the result in the pull request. Then, for ADR 0073, on a desktop browser and on a phone:
   - The form opens on the bank account tab, the card tab second, with no Apple Pay, Google Pay or Link tab.
   - **A card customer switching to a bank account.** A test organization adds a test card (`4242 4242 4242 4242`) and
     chooses the annual plan; the invoice is paid by card, and the page says that a new payment method replaces the one
     on file. It then adds a test bank account through Financial Connections; once `setup_intent.succeeded` arrives the
     page shows the bank account, the subscription in the dashboard shows the bank account as its own payment method
     too, and the next invoice (an audit invoice, or `stripe invoices pay` on an open one) is charged to the bank
     account, not the card.
   - The form wears the brand: its colors, radius and font in light, and Stripe's night theme under the dark tokens.
   - **A bank account waiting on a deposit.** A test bank account entered by hand (routing `110000000`, account
     `000123456789`) leaves the form showing the verification notice for Stripe's micro-deposit type (one deposit with a
     6-digit code, or two amounts) and Stripe's link; the card stays on file until the deposit's code (`SM11AA` in test
     mode) is entered on that page, and the bank account then takes over.
   - Financial Connections offers no Link sign-up, as the dashboard check above set.

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

PaidWhole's own suspension is stored (docs/adr/0080): the organization's status, its reason and when it began, with a
history row holding the actor and PaidWhole's internal note. It is set only in the console, on the organization's
page, with a reason from the closed list (at the customer's request, a security hold, the agreement ended), and lifted
there with a reinstatement reason, one click each. Nonpayment is never one of its reasons: an unpaid invoice is
billing's hold above, which the payment ends, so never suspend an organization in the console because an invoice is
unpaid, and never expect a payment to lift PaidWhole's suspension. Do not change `organization.status`,
`status_reason` or `organization_status_change` by hand: the setter checks the status the page showed and writes the
audit event, and a closed organization stays closed. A security hold stops new work only; to stop a person's access,
end their membership. A suspended group stops new work at its practices for everyone; a suspended firm stops only
its own people's new work through its grants, and the practices' own staff carry on.

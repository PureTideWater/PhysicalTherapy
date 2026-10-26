# 0073. Show the bank account first, keep cards, and let the customer's default govern every invoice

- **Status:** accepted (`co-001/bank-account-first`, combined audit #135); refines
  [0050](0050-bill-organizations-through-stripe-as-a-role-that-reads-no-phi-suspend-new-runs-thirty-days-after-a-failed-payment-and-simulate-test-mode-locally.md)
  (the order the methods are offered in, the audit invoice's methods and the method on file) without editing it: 0050 is
  in pull request #42's file list, and while #42 is open only the shared documents LANES.md rule 6 names are touched.
  Read 0050 with this ADR beside it.
- **Date:** 2026-10-26
- **Deciders:** the founder, Tyler Williams, who adopted the combined best-option audit in full on 2026-10-20 (about
  15:10 UTC; item #135 among it, "Make the bank account the payment method shown first"), under the standing rule of
  2026-10-18; the co-founder, under the founder's delegation of 2026-10-25, whose rulings of 2026-10-25 (about
  21:34 UTC) and 2026-10-26 (about 00:20 UTC) have the build take each recommended option without asking; the build
  (Lane B), for the design review's eight findings (F1 to F8, all accepted), each reversible by the founder
- **PRD sections:** 6 (the Billing row: "a test ACH payment completes"), 15 (Stripe in the stack); test matrix BIL-01 to
  BIL-04; ADRs 0050 and 0055

## Context

Combined audit #135 (low, cost): plans and audit invoices accept ACH or card equally, and at the placeholder prices a
card costs about $152 more per annual invoice and $68 more per audit than ACH. The founder adopted its best option: the
bank account shown first and preselected, one line saying it is preferred, cards still accepted everywhere (restricting
them per plan would fail the first invoice of a customer with a card on file), and no ACH discount, which is a pricing
decision. Nothing in the pricing engine, the ledger or the database changes, and no freeze exception is needed.

What the repository held at `6ddd587`:

- **The form.** `apps/web/src/components/billing/stripe-payment-method.tsx` mounted
  `<PaymentElement options={{ layout: 'tabs' }} />` with no order and the wallets left at Stripe's `auto`, so Stripe's
  dynamic ordering ("a dynamic ordering that optimizes payment method display for each user", `@stripe/stripe-js` 10)
  chose which tab came first, and Apple Pay or Google Pay could come before the bank account.
- **The server.** `packages/billing/src/stripe.ts` wrote `['us_bank_account', 'card']` out by hand twice: in the
  SetupIntent's `allowed_payment_method_types` and in the subscription's `payment_settings.payment_method_types`. The
  audit invoice (`createAuditInvoice`) set no `payment_settings`, so its hosted page and automatic charge offered
  whatever the Stripe dashboard enabled (possibly Link, wallets or other methods 0050 never chose), in Stripe's order.
- **The page.** The billing page's Payment method card read "ACH debit from a bank account, or a card. …", said nothing
  about which was preferred, and came after the Plan card, although a plan is refused until a method is on file. The
  practice onboarding step read "Choose a plan and a payment method", the order a plan does not allow.
- **The method on file (the design review's F1, blocking).** The subscription was created with
  `save_default_payment_method: 'on_subscription'`, so Stripe pinned the method that paid its first invoice on the
  subscription itself, and a subscription's `default_payment_method` outranks the customer's
  `invoice_settings.default_payment_method`, the one `setup_intent.succeeded` updates
  (`apps/worker/src/billing/events.ts`, through `setDefaultPaymentMethod`) and the one `paymentMethodOnFile` reads. A
  card customer who added a bank account would see the bank account on file while every renewal, and every retry of
  `invoices.pay`, kept charging the card. The local simulator always charges the customer's default, so no simulator
  test could see it: the copy this item adds ("Adding one replaces the card on file") would have been false in
  production alone.
- **A bank account waiting on a deposit (F6).** When Financial Connections falls back to micro-deposits
  (`verification_method: 'automatic'`), `confirmSetup` returns no error with the SetupIntent in `requires_action`
  (`verify_with_microdeposits`), and `setup_intent.succeeded` arrives only after the deposit is verified, days later.
  The form still said Stripe had confirmed the method.

## Decision

1. **One source of the order.** `packages/billing/src/types.ts`, exported as `@tp/billing/types` and re-exported by
   `@tp/billing`, holds `PAYMENT_METHOD_ORDER = ['us_bank_account', 'card'] as const`, and `PaymentMethodKind` is derived
   from it. The SetupIntent's
   `allowed_payment_method_types`, the subscription's and the audit invoice's `payment_settings.payment_method_types`,
   and the browser's `paymentMethodOrder` all read it, each as a fresh copy (`[...PAYMENT_METHOD_ORDER]`, since stripe
   23 types these as mutable arrays), so what the server allows and what the form shows cannot drift. The module's only
   import is a type, erased at compile, so the browser bundle can take it without Stripe's SDK or `node:crypto`;
   `types.test.ts` holds it to that. It lives in a module the screening-capacity watch already lists, so no watched path
   is added.
   A second copy in the component is exactly the drift this item exists to stop.
2. **The Payment Element.** Its options come from an exported pure function, `paymentElementOptions()`:
   `paymentMethodOrder` from the shared order, `layout: { type: 'tabs', defaultCollapsed: false }` (the first tab, the
   bank account, open and selected when the form appears), and `wallets: { applePay: 'never', googlePay: 'never',
   link: 'never' }`. Apple Pay and Google Pay are card-funded tabs that Stripe's dynamic ordering may place ahead of the
   bank account; turning them off keeps the bank tab first on every device. `link: 'never'` is defence in depth: Link is
   already excluded on the server, since it is not an allowed type. Fewer surfaces is also the safer choice for security
   and privacy. Cards stay fully accepted through the card tab.
3. **The audit invoice offers the same two methods.** `createAuditInvoice` sends `payment_settings:
   { payment_method_types: [...PAYMENT_METHOD_ORDER] }`, as the subscription does, so an audit's hosted page and its
   automatic charge use ACH or card and nothing the dashboard happens to enable. It restricts nothing 0050 allows: a
   card on file is still charged.
4. **The customer's default is the one method on file (F1).** Subscriptions are created with
   `save_default_payment_method: 'off'`, and `setDefaultPaymentMethod`, after it sets the customer's default, clears
   `default_payment_method` on each of the customer's subscriptions that is not canceled and carries one
   (`subscriptions.list` by customer, then `subscriptions.update(id, { default_payment_method: '' })`, each under an
   idempotency key derived from the caller's). The customer's `invoice_settings.default_payment_method` is then the
   single source of the method on file: the page reads it, and every invoice, a plan's or an audit's, is charged to it.
   The simulator already behaves so, and now matches Stripe.
5. **The preference line, in both modes** (Stripe and the local simulator), `data-notice="ach-preferred"`, in the
   audit's words: "A bank account (ACH) is preferred for annual plans and audits." With a card on file it continues:
   "Adding one replaces the card on file." The card's description leads with the bank account: "A bank account (ACH
   debit) or a card. The account or card number never reaches this application." No reason is given ("it costs less"):
   it would invite a discount question, which is the founder's pricing decision.
6. **A bank account waiting on Stripe's deposit (F6).** The form reads `result.setupIntent.status` through a pure
   exported function: `succeeded` or `processing` keeps the saved notice; `requires_action` with micro-deposit
   verification shows `data-notice="bank-verification-pending"`, which says Stripe sends a small deposit within two
   business days, that its code is entered on Stripe's verification page, and that the method on file stays in use until
   then, with a link to the SetupIntent's `hosted_verification_url` (Stripe's page; nothing is stored).
7. **The page and the onboarding step lead with the method.** The start button reads "Add a bank account (ACH) or card"
   with nothing on file and "Replace it with a bank account (ACH) or card" with a method on file, since a confirmed
   method becomes the default. The Payment method card moves into `components/billing/payment-method-card.tsx`, a plain
   synchronous component (the page renders the async `<FormKeys />` and passes it in, as
   `components/screening/split-form.tsx` does) unit-tested with `renderToStaticMarkup`, and comes before the Plan card
   (F5). A card's brand shows capitalized ("Visa"), unknown brand codes as sent. The practice onboarding step reads "Add
   a payment method and choose a plan / A bank account (ACH) is preferred; a card also works." The web compiles
   `@tp/billing` (it joins `transpilePackages` in `apps/web/next.config.ts`, F4), since the browser now imports its
   source.
8. **Not built.** Restricting cards per plan (the audit says not to); an ACH discount (the founder's pricing decision);
   any change to `apps/web/src/components/help.ts` (it already says "ACH or card") or to the worker's refusal of a plan
   without a method (`apps/worker/src/billing/*`); both are #42's files. No table, column, function, policy, role,
   route, query or permission changes: billing still runs only as `tp_billing`, which reads no PHI (0050, 0055), and
   `docs/product/domain-model.md` is untouched.

The Stripe set-up in `docs/runbooks/billing.md` gains the dashboard checks this depends on (ACH Direct Debit and cards
the enabled methods; Financial Connections' option to save bank logins to Link left off; why subscriptions keep no
default of their own) and a by-hand staging test of a card customer switching to a bank account.

## Alternatives considered

- **A constant in the component beside the server's lists.** Two copies of one order; the drift this item removes.
- **Restricting cards on annual plans or audits.** The audit rules it out: it would fail the first invoice of a
  customer with a card on file, and a card is a legitimate way to pay.
- **Keeping `'on_subscription'` and setting the subscription's default from the webhook as well.** Two places that can
  disagree, and every future subscription path would have to remember the second write; one default on the customer is
  simpler and is what the simulator already models.
- **Saying why the bank account is preferred ("it costs less").** It invites a discount question the founder has not
  ruled on; the audit's line is enough.
- **Leaving the wallets at `auto`.** Stripe may then show Apple Pay or Google Pay first on a phone, which defeats the
  order.

## Consequences

- Every Stripe request that collects or charges, and the form, offer exactly ACH then card from one constant; a change
  to the methods is one edit, and `stripe.test.ts` and `types.test.ts` fail if any request drifts (BIL-02).
- A card customer who adds a bank account is charged to the bank account from the next invoice, renewals and retries
  included, which is what the page tells them; a card customer who never adds one is never refused (BIL-04).
- Phones lose one-tap card entry through Apple Pay and Google Pay; a card number can still be typed. Accepted, since
  the item's purpose is to lead with the bank account.
- Stripe ignores `paymentMethodOrder` entries it cannot show (ACH outside the US, for example); the card tab then shows
  alone, which is correct.
- A pending micro-deposit is shown only right after the form; on a later visit the page shows the method on file until
  `setup_intent.succeeded` arrives. Showing it on later visits would need the provider to list open SetupIntents.
- `setDefaultPaymentMethod` makes one list call and at most one update per subscription that carries its own default;
  an organization has one subscription, so the cost is small and each call is idempotent.

## Not verified here

api.stripe.com is blocked from the build environment and there are no Stripe keys (0050), so the Stripe adapter is
tested against the official SDK with a mocked client and the flows run on the local simulator, whose form never
renders Stripe's Payment Element. Only staging's test mode shows:

- **The tab order.** That the Payment Element opens on the bank account tab, with the card tab second and no wallet or
  Link tab, on a desktop browser and on a phone.
- **The micro-deposit path.** That a test bank account routed to micro-deposits leaves the SetupIntent in
  `requires_action` with a `hosted_verification_url`, that the form shows the verification notice, and that the card
  stays on file until the deposit is verified.
- **The dashboard's Financial Connections Link setting.** Financial Connections may itself offer to save a bank login
  to Link, which `wallets.link` does not govern; it is a Stripe dashboard setting, which the organization should leave
  off. Until that is checked, nothing here claims the form creates no third-party account.

`docs/runbooks/billing.md` lists these as the by-hand checks, recorded in the pull request that first runs them.

## Revisit when

- The founder sets an ACH discount or real prices, which may change the preference line's wording.
- Stripe changes how a subscription's own default ranks against the customer's, or the product adds a second
  subscription per organization.
- Staging's test mode shows any of the three behaviours above differently.

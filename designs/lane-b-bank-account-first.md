# Design: the bank account shown first (combined audit #135; LANES.md queue item 13)

*Lane B, 2026-10-26. Branch `co-001/bank-account-first`, cut from `claude/build-platform` 6ddd587. Status:
`approval-summaries/lane-b-bank-account-first-status.md`.*

## The item
Combined audit #135 ("Make the bank account the payment method shown first", low, cost, 1-2 hours):

- **Now:** plans and audit invoices accept ACH or card equally, and Stripe's Payment Element picks which tab shows first
  ("a dynamic ordering that optimizes payment method display for each user", `@stripe/stripe-js` 10). At the placeholder
  prices a card costs about $152 more per annual invoice and $68 more per audit than ACH.
- **Best option (adopted with the audit, the founder, 2026-10-20 ~15:10 UTC):** the bank tab first and preselected, and
  one line: "A bank account (ACH) is preferred for annual plans and audits." Cards are not restricted per plan (that
  would fail the first invoice of a card-on-file customer). An ACH discount is a pricing decision and is not built.
- **What it changes:** "Pricing engine: no. Ledger: no. Database: no. Freeze exception: no."

## No migration (confirmed at design)
Everything here is presentation in the web app and the parameters of three Stripe requests. No table, column, function,
policy or role changes; `packages/db` is untouched, and so is `docs/product/domain-model.md`. Billing still runs only as
`tp_billing`, which reads no PHI (ADR 0050, 0055): no new query, no new route, no new permission.

## What is there today (6ddd587)
- `apps/web/src/components/billing/stripe-payment-method.tsx`: `<PaymentElement options={{ layout: 'tabs' }} />`, no
  order, wallets left at Stripe's `auto`. The start button already reads "Add a bank account (ACH) or card".
- `packages/billing/src/stripe.ts`: the SetupIntent allows `['us_bank_account', 'card']` and the subscription's
  `payment_settings.payment_method_types` is `['us_bank_account', 'card']`, each written out by hand. The audit invoice
  (`createAuditInvoice`) sets no `payment_settings`, so its hosted page offers whatever the Stripe dashboard enables
  (possibly Link, wallets or other methods ADR 0050 never chose), in Stripe's order.
- `apps/web/src/app/settings/billing/[organizationId]/page.tsx`: the Payment method card says "ACH debit from a bank
  account, or a card. …"; nothing says which is preferred, and nothing tells a card-on-file administrator that adding a
  bank account replaces the card (it does: `setup_intent.succeeded` sets the new method as the customer's default,
  `apps/worker/src/billing/events.ts`). The local simulator's form already lists the bank account first.

## Decisions (each the recommended option, taken without asking under the co-founder's rulings of 2026-10-25 ~21:34 UTC
and 2026-10-26 ~00:20 UTC; recorded here, in the PR and in the status file)

1. **One source of the order.** A new module `packages/billing/src/methods.ts`, exported as `@tp/billing/methods`
   (no imports, so the browser bundle can take it without Stripe's SDK or `node:crypto`):
   `PAYMENT_METHOD_ORDER = ['us_bank_account', 'card'] as const` and its type. The Stripe adapter's SetupIntent,
   subscription and audit invoice, and the browser's Payment Element, all read it, so the order cannot drift between
   what the server allows and what the form shows. `@tp/billing`'s index re-exports it for server code.
   *Why not a constant in the component:* a second copy is exactly the drift this item exists to stop.
2. **The Payment Element.** Options built by an exported pure function `paymentElementOptions()`:
   `paymentMethodOrder: [...PAYMENT_METHOD_ORDER]`, `layout: { type: 'tabs', defaultCollapsed: false }` (the first
   tab, the bank account, open and selected when the form appears), and `wallets: { applePay: 'never',
   googlePay: 'never', link: 'never' }`.
   *Why wallets off:* Apple Pay and Google Pay are card-funded and render as express buttons above the tabs, which would
   put a card first again; Link offers to save the method into a Stripe consumer account, a third party the
   organization never chose (ADR 0050 names ACH and card only). Off is also the safer option for security and privacy
   (fewer surfaces, no extra account). Cards stay fully accepted through the card tab.
3. **The audit invoice offers the same two methods.** `createAuditInvoice` sends
   `payment_settings: { payment_method_types: PAYMENT_METHOD_ORDER }`, as the subscription already does, so an audit's
   hosted invoice page and its automatic charge use ACH or card and nothing the dashboard happens to enable.
   *Why:* the audit names "annual plans and audits"; the audit invoice was the one path that ignored ADR 0050's methods.
   It restricts nothing ADR 0050 allows: a card on file is still charged.
4. **The preference line, on the page in both modes** (Stripe and the local simulator), `data-notice="ach-preferred"`,
   in the audit's words: "A bank account (ACH) is preferred for annual plans and audits." When the method on file is a
   card it continues: "Adding one replaces the card on file." The card description leads with the bank account:
   "A bank account (ACH debit) or a card. The account or card number never reaches this application."
   *Why no reason is given ("it costs less"):* it would invite a discount question, which is the founder's pricing
   decision; the audit's line is enough.
5. **The start button says what it does.** With no method on file it stays "Add a bank account (ACH) or card"; with one
   on file it reads "Replace it with a bank account (ACH) or card", since a confirmed method becomes the default.
6. **The Payment method card moves into `components/billing`** (`payment-method-card.tsx`, a server-renderable component
   taking the method on file, the provider and the simulator's test routing), so its words and order are unit-tested
   with `renderToStaticMarkup` like the other component tests. The page keeps its data loading and the simulator's
   server actions, passed in as props.
7. **Not built:** restricting cards per plan (the audit says not to); an ACH discount (the founder's pricing decision);
   any change to `help.ts` (it already says "ACH or card", and it is #42's file).
8. **ADR:** an amendment section in ADR 0050 ("Amendment (2026-10-26): the bank account shown first"), not a new ADR:
   the decision refines 0050's payment methods and belongs beside them. ADR 0073, reserved for this item, stays unused.

## Files
- `packages/billing/src/methods.ts` (new), `packages/billing/package.json` (the `./methods` export),
  `packages/billing/src/index.ts` (re-export), `packages/billing/src/stripe.ts` (the three requests read the constant;
  the audit invoice's `payment_settings`), `packages/billing/src/stripe.test.ts`, `packages/billing/src/methods.test.ts`.
- `apps/web/src/components/billing/stripe-payment-method.tsx`, `apps/web/src/components/billing/payment-method-card.tsx`
  (new), `apps/web/src/components/billing/billing.test.tsx` (new).
- `apps/web/src/app/settings/billing/[organizationId]/page.tsx`.
- `apps/web/src/lib/routes/billing.ts`: only its header comment if wording changes; no route changes.
- `apps/web/src/lib/routes/billing-routes.db.test.ts` (BIL-04), `apps/web/e2e/billing.spec.ts` (the line is visible).
- `docs/adr/0050-…md` (amendment), `docs/product/test-matrix.md` (a new "Billing (BIL)" section),
  `packages/synth/src/cases/matrix.ts` and `registry.ts` (BIL-01 to BIL-04, no-file entries, milestone 11).
- `apps/web/package.json` only if `@tp/billing` is not already a dependency of the web (it is, through the routes).

None is #42's: not `apps/worker/src/billing/*`, not `packages/db/src/schema/billing.ts`, not `help.ts`. The four shared
documents (test-matrix, matrix.ts, registry.ts; reconciliation-001 is not touched) follow LANES rule 6.

## Tests (BIL-01 to BIL-04, a new series: the matrix has no billing series at 6ddd587)
| ID | Case | Assertion |
| --- | --- | --- |
| BIL-01 | Stripe's payment form opens on the bank account | The Payment Element's options list `us_bank_account` first and `card` second, from the shared order; tabs with the first open; Apple Pay, Google Pay and Link off; the start button reads "Add a bank account (ACH) or card" with nothing on file and "Replace it with a bank account (ACH) or card" with a method on file |
| BIL-02 | What Stripe is asked to collect and charge | The SetupIntent, the subscription and the audit invoice each send exactly `['us_bank_account', 'card']`, bank first, from the shared order |
| BIL-03 | The page says the bank account is preferred | The Payment method card, with Stripe and with the simulator, says "A bank account (ACH) is preferred for annual plans and audits." and leads its description with the bank account; with a card on file it adds that adding a bank account replaces the card; with a bank account on file it does not; the simulator lists its bank form before its card form |
| BIL-04 | A card is never refused for a plan or an audit | Through the routes on the simulator, an organization with only a card on file chooses the annual plan and its invoice is paid by card, and an audit invoice issued to it is paid by card |

Where each runs: BIL-01 and BIL-03 in `apps/web/src/components/billing/billing.test.tsx` (unit), BIL-03's visible line
also in `apps/web/e2e/billing.spec.ts`; BIL-02 in `packages/billing/src/stripe.test.ts` and `methods.test.ts` (unit);
BIL-04 in `apps/web/src/lib/routes/billing-routes.db.test.ts` (db).

## Reviews
- Security (`.claude/agents/security-reviewer.md`): billing routes, Stripe, the no-PHI billing role, authorization in the
  handler and in Postgres. Expected surface: none new (no route, query or permission), the client bundle's new import
  (`@tp/billing/methods` must stay import-free), the wallets and Link choice.
- UX and brand: before and after screenshots (1280 px and 390 px, light, and dark by `data-theme="dark"`) of
  `/settings/billing/<organization>` with nothing on file, a bank account on file and a card on file. The tour runs the
  local simulator, so Stripe's own form never renders there (no Stripe keys, and Stripe.js loads only when Stripe's form
  starts); BIL-01 asserts its options instead. Checked against `.claude/rules/brand.md`, `docs/brand/BRAND.md`,
  `packages/brand`, CO-11, `words.ts` (`pnpm lint:copy`) and `designs/lane-b-ux-review-brief.md`, and the baseline
  review `designs/lane-b-ux-review.md` once it lands.

## Risks
- Stripe ignores `paymentMethodOrder` entries it cannot show (for example ACH outside the US); the card tab then shows
  alone, which is correct.
- Wallets off removes one-tap card entry on phones; accepted, since the item's purpose is to lead with the bank account
  and a card number can still be typed.

export const meta = {
  name: 'lane-b-bank-account-first-design-review',
  description: 'One adversarial review of the bank-account-first design (#135) before building',
  phases: [{ title: 'Review', detail: 'one adversarial design reviewer' }],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/4b2d015a-84c8-5610-8630-1a03db5b4a46/scratchpad'
const SAVE = (file, what) => `Save as you go: keep ${SP}/progress/${file} up to date (${what}), so an interruption loses nothing. If it already exists when you start, an earlier run of yours was interrupted: read it, trust what it holds unless the code says otherwise, and continue from where it stopped.`
const SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['build as designed', 'build with changes', 'redesign'] },
    needsMigration: { type: 'boolean' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          severity: { type: 'string', enum: ['blocking', 'should-fix', 'nit'] },
          area: { type: 'string' },
          claim: { type: 'string', description: 'what is wrong or missing, with file:line evidence' },
          fix: { type: 'string', description: 'the exact change to the design' },
        },
        required: ['id', 'severity', 'area', 'claim', 'fix'],
      },
    },
    summary: { type: 'string' },
  },
  required: ['verdict', 'needsMigration', 'findings', 'summary'],
}
phase('Review')
const review = await agent(`You are the one adversarial design reviewer for a small Lane B pull request of the PaidWhole build. Read-only: write nothing but your progress file.
${SAVE('design-review.md', 'each check and finding as you make it')}

The design: /home/user/ops/designs/lane-b-bank-account-first.md (combined audit #135, its entry at /home/user/ops/audits/combined/combined-report.md "### 135."). The code is /home/user/PhysicalTherapy at claude/build-platform 6ddd587 (read-only; do not edit, do not switch branches).

Try hard to break the design. Check, citing file:line:
1. Stripe facts. Against the installed SDK types (find them under /home/user/PhysicalTherapy/node_modules/.pnpm: @stripe/stripe-js 10, @stripe/react-stripe-js 7, stripe 23): does PaymentElement's paymentMethodOrder plus layout {type:'tabs', defaultCollapsed:false} put the bank tab first and selected? Is wallets {applePay, googlePay, link: 'never'} valid there? Does invoices.create accept payment_settings.payment_method_types with us_bank_account and card for a charge_automatically invoice? Can Elements options with only clientSecret coexist with these PaymentElement options? Any Stripe behaviour that defeats the design (e.g. us_bank_account needing mandate data, Financial Connections, a saved Link)?
2. The shared constant: can a 'use client' component import a new @tp/billing/methods subpath under Next.js 15/16 transpilePackages and the web's eslint import rules (check apps/web/next.config.*, eslint.config.js boundary rules, any rule restricting @tp/billing in client code, tools that list package exports)? Would re-exporting it from @tp/billing's index break anything? Does the stryker or coverage config care about a new packages/billing file?
3. Behaviour: is "Adding one replaces the card on file" true (apps/worker/src/billing/events.ts setup_intent handling, packages/billing/src/local.ts)? Is "Replace it with a bank account (ACH) or card" accurate in both Stripe and simulator modes? Does BIL-04 work on the local simulator (annual plan paid by card, audit invoice paid by card; check LocalBillingProvider and existing tests in apps/web/src/lib/routes/billing-routes.db.test.ts)?
4. Scope and rules: confirm no migration; confirm none of the files is in PR #42's list (${SP}/pr42-files.txt); confirm billing stays in the no-PHI tp_billing role (ADR 0050/0055); CLAUDE.md conventions (every mutation: Zod, role check, audit; no new mutation here?); copy rules (apps/web/src/lib/copy/words.ts, tools/brand-copy, .claude/rules/brand.md, docs/brand/BRAND.md voice); test-matrix and synth registry conventions (packages/synth/src/cases/matrix.ts, registry.ts, the fixtures test that checks them).
5. Anything better: is there a better option the design misses (for example where else the payment method is chosen or described: onboarding, the console's billing page, email templates, help text), or a needless part that should be cut? The standing rule: the best option, never weighted by build effort.
Return the verdict, whether a migration is needed, and the findings with exact design fixes.`, { label: 'design-review', phase: 'Review', schema: SCHEMA })
return review
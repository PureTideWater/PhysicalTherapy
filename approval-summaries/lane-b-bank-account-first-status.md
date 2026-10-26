# Status: the bank account shown first (#135; LANES queue item 13)

*Kept current at every stage by the Lane B session that builds it. Times UTC.*

- **Stage:** fix round running (wf_f41510b7-8f9, from ~01:25): every review finding, then the full local suite once; then one push.
- **Branch / PR:** `co-001/bank-account-first`, cut from 6ddd587, worktree /home/user/bank-account-first / #47 (draft), head 5ca2263.
- **Machine:** setup-container.sh printed OK; `gh api user` is PureTideWater.
- **Migration:** none (confirmed at design: presentation and three Stripe request parameters; `packages/db` untouched).
- **Reserved numbers:** test-matrix BIL-01 to BIL-04 (the matrix has no billing series at 6ddd587, so the reserved IDs
  are used as claimed); `packages/synth` BIL-01 to BIL-04 (no-file registry entries). ADR 0073 used (a new ADR: ADR 0050 is in
  #42's files, so it is not amended while #42 is open).
- **Choices (design §Decisions):** one shared order `@tp/billing/methods`; Payment Element bank tab first and open,
  wallets and Link off; the audit invoice limited to ACH and card like the subscription; the audit's preference line,
  plus "Adding one replaces the card on file." with a card on file; the start button says "Replace it with …" when a
  method is on file; no card restriction, no ACH discount (the founder's pricing decision).
- **Design review findings (wf_a54e8809-a7e), all accepted:** F1 blocking: `save_default_payment_method: 'on_subscription'`
  would keep charging a card after a bank account is added: subscriptions now save no default and a new default clears
  any subscription's own; F2 spread the readonly order for stripe 23; F3 the extracted card takes formKeys and the token
  as props; F4 `@tp/billing` joins the web's transpilePackages and methods.ts imports nothing; F5 the onboarding step and
  the Payment method card before the Plan card; F6 the micro-deposit pending notice with Stripe's verification link; F7
  the wallets rationale corrected and the Financial Connections Link setting named in the runbook; F8 shared documents
  listed, assertedBy on every BIL entry.
- **Improvement found:** the card brand shows lowercase ("visa") on the page; capitalized in this PR.
- **Proposal (outside this PR):** show a bank account still waiting on Stripe's micro-deposit on later visits (needs the
  provider to list open SetupIntents).
- **CI:** 5ca2263 green (all green, unit, db 1-4, e2e 1-2, lint, static, build, images, domain model, mutation, approval-of-record); screening capacity was still measuring at ~01:20.
- **Local checks before the first push:** typecheck 22 projects; lint 0/0; lint:copy, lint:logs pass; unit 5,006 passed,
  3 skipped, 2 failed in tools/screening-capacity/watched.test.ts (the new methods.ts was not in #42's watched list),
  fixed by moving the order into `types.ts`, which the list already holds (affected files then 397/397); billing db
  test 7/7 (BIL-04 included).
- **Build choice:** the shared order lives in `@tp/billing/types` (not a new `methods.ts`), so no #42 file
  (tools/screening-capacity/watched-paths.txt) changes; `PaymentMethodKind` is now derived from it.
- **Screens:** before (6ddd587) and after (5ca2263), 24 shots, published privately: https://claude.ai/artifact/WUGLnKUZ7FGejEjJ82udhJ
  (capture spec `workflow-scripts/lane-b-bank-account-first-capture.spec.ts`). The UX baseline review
  (`designs/lane-b-ux-review.md`) had not landed by ~01:25; it is folded in if it lands before merge.
- **Adversarial reviews (wf_6eeff1ed-435, ~01:13-01:19), both "merge after fixes", none blocking; all accepted**
  (`approval-summaries/lane-b-bank-account-first-review-findings.json`):
  - security S1 the three simulator forms shared one request key (one FormKeys element reused): a factory now;
    S2 clearing a subscription's default with '' is unproven at Stripe: set it to the new method instead;
    S3 BIL-04 passed without the fix: the simulator now models a subscription's own default, with a renewal test;
    S4 micro-deposit wording for 'amounts';
  - UX UX-1 pending notice with nothing on file; UX-2 micro-deposit types and a missing link; UX-3 role="status" and
    focus; UX-4 new-tab links announced; UX-5 "Replace with a bank account (ACH) or card"; UX-6 no Choose plan form
    with nothing on file (prices shown, a sentence); UX-7 unknown brands through labelOf; UX-8 one term "bank account
    (ACH)" and "On file: …"; UX-9 the replace line in both directions; UX-10 role="group"; UX-11 Stripe's form themed
    from the brand tokens.
- **Next:** the fix round's push; CI; the fresh-clone verification; merge.

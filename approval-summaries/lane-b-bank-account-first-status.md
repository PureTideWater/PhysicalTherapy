# Status: the bank account shown first (#135; LANES queue item 13)

*Kept current at every stage by the Lane B session that builds it. Times UTC.*

- **Stage:** fix round done and pushed (head 744e1d6, ~02:05): every finding fixed, the full local suite passed once on 422344b; CI on 744e1d6 next, then the fresh-clone verification.
- **Branch / PR:** `co-001/bank-account-first`, worktree /home/user/bank-account-first / #47 (draft), head 744e1d6 (commits 5ca2263, 56007bd, b15d45f, 422344b, 744e1d6). Base still 6ddd587.
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
- **Fix round (wf_f41510b7-8f9, ~01:25-02:05):** all 15 findings fixed (`approval-summaries/lane-b-bank-account-first-fix-suite.md`). Full local suite on 422344b:
  install, check:fixtures, typecheck (22), lint (1,490 files, 0/0), lint:copy, lint:logs, verify-content, engine
  freeze, synth --all clean; unit 322 files 5,013 passed 3 skipped; golden 188; oracle 637 agree; test:db six shards
  118 files 9,050 passed 1 skipped; build + stamp + e2e 51/51; mutation: no money package affected, gate passes.
- **Orchestrator allocation (~01:27):** the billing case module is 15 (DBF 13, RCC 14 on other branches): 744e1d6.
- **After shots retaken at 744e1d6** and the gallery updated (version 2).
- **PR description** updated with every finding's resolution and the suite, read back byte for byte (12,568 bytes).
- **Proposals (outside this PR):** a test-mode control that advances the simulator's clock, so BIL-04's renewal shows
  through the routes; the simulator emitting customer.subscription.updated when a subscription's default changes; a
  staging check by hand that Stripe's form accepts the resolved token colours, light and dark; showing a pending
  micro-deposit verification on later visits.
- **Next:** CI on 744e1d6; the fresh-clone verification; merge.

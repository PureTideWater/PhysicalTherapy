# Status: the bank account shown first (#135; LANES queue item 13)

*Kept current at every stage by the Lane B session that builds it. Times UTC.*

- **Stage:** design reviewed (wf_a54e8809-a7e, 2026-10-26 ~00:40: build with changes, no migration; F1 to F8 accepted and folded in); before shots taken (12, base 6ddd587, ~00:33); builders next.
- **Branch / PR:** `co-001/bank-account-first`, cut from 6ddd587, worktree /home/user/bank-account-first / no PR yet.
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
- **CI:** none yet.
- **Next:** builders in /home/user/bank-account-first, then the draft PR.

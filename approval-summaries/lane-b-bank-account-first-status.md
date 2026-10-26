# Status: the bank account shown first (#135; LANES queue item 13)

*Kept current at every stage by the Lane B session that builds it. Times UTC.*

- **Stage:** design written (2026-10-26 ~01:20), design review next.
- **Branch / PR:** `co-001/bank-account-first` (not yet cut) / no PR yet.
- **Machine:** setup-container.sh printed OK; `gh api user` is PureTideWater.
- **Migration:** none (confirmed at design: presentation and three Stripe request parameters; `packages/db` untouched).
- **Reserved numbers:** test-matrix BIL-01 to BIL-04 (the matrix has no billing series at 6ddd587, so the reserved IDs
  are used as claimed); `packages/synth` BIL-01 to BIL-04 (no-file registry entries). ADR 0073 not used: the decision is
  an amendment to ADR 0050.
- **Choices (design §Decisions):** one shared order `@tp/billing/methods`; Payment Element bank tab first and open,
  wallets and Link off; the audit invoice limited to ACH and card like the subscription; the audit's preference line,
  plus "Adding one replaces the card on file." with a card on file; the start button says "Replace it with …" when a
  method is on file; no card restriction, no ACH discount (the founder's pricing decision).
- **Findings:** none yet.
- **CI:** none yet.
- **Next:** design review (one adversarial reviewer), then the builders.

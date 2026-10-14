---
paths:
  - "packages/pricing/**"
  - "packages/ledger/**"
  - "packages/contracts/**"
  - "packages/packets/**"
---
# Money, contracts, packets
- All arithmetic through packages/money (bigint cents; Decimal for rates). No Number() on amounts.
- Pricing functions are pure: (lineFacts, agreement, rateRecords, release, settings) => Priced | Unpriced.
  No database, network or clock inside. Traces must recompute the amount in a test.
- Only signed_off contract versions price lines. Versions never overlap and never change once signed off.
- Every new pricing branch needs a hand-computed golden line in fixtures/golden with its worksheet, written
  before the code, plus a fast-check property test.
- ledger_entry is append-only and signed. Recovered = sum(posted or deposited) - recouped - reversed.
- The packet verifier is a hard gate: any figure, date, code, count or identifier not in the input fails.
- Identifiers are placeholders in drafts and are inserted by code at export from the canonical record.

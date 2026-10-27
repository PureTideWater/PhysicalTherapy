# For the founder (2026-10-27): two ledger freeze exceptions, and what's coming for approval

**GRANTED by the founder (Tyler Williams), relayed by the co-founder, 2026-10-27 20:49 UTC:** "Granted: the ledger freeze exceptions in designs/ledger-interest-once.md section 10.1 and designs/suite-cap-1-triage-locks.md section 4.5, as written." Each PR records the grant in its ADR and in reconciliation-001.

The co-founder relays these. Each is the founder's alone (reconciliation-001 "Ledger semantics"; LANES.md "Who decides").
Neither blocks #42. Both designs are reviewed (nine findings each, all taken) and are on `claude/build-ops`.

## 1. Ledger freeze exception: interest credited once (recommended: grant)

**The defect.** When a payer's remittance carries the same interest twice, once on the claim (AMT I) and once as a
provider-level adjustment (PLB L6), the ledger credits it twice. That overstates recovery. It is in the ledger's
existing behaviour, which is frozen, so the fix needs the founder's exception.

**The fix in one line.** The PLB L6 is the money; the claim's AMT I only says whose it is. Interest is credited once
per PLB L6, never past what it pays, and the database refuses anything else.

**The exact text to grant** is in `designs/ledger-interest-once.md` section 10.1 ("Ledger freeze exception, interest
credited once"), ready to grant as it stands: the DDL it may change, its seven behaviours, the files, and what stays
frozen (the stages, every principal amount, the definition of recovered, the parser and loader, LED-01 to LED-18's
amounts). It also replaces PRD 13's one sentence on interest with the design's section 9.2 text.

To grant it, the founder replies, for example: "Granted: the ledger freeze exception in designs/ledger-interest-once.md
section 10.1, as written."

## 2. Ledger freeze exception Q1: SUITE-CAP-1's ledger lock key (recommended: grant)

**The defect.** At real size (a 100,000-line month), the database runs out of lock memory, because some triggers take
one lock per line in a single transaction. Triage is fixed without touching the ledger. But a large reconcile still
takes about two ledger locks per line and can fail the same way, and it can make other practices' work fail meanwhile.

**The change.** Two ledger trigger functions (`ledger_entry_within_evidence()` and `ledger_entry_within_line()`) take
the practice's existing `ledger:` lock instead of one lock per row and per line. No check, refusal, message, amount,
stage or entry changes; LED-01 to LED-17 and the ledger oracle run unchanged; `packages/ledger` is untouched. Details:
`designs/suite-cap-1-triage-locks.md` sections 4.5 and 10.

**If not granted:** everything else ships, and the ledger part becomes its own later item (SUITE-CAP-2). Until then a
real-size reconcile can still fail.

To grant it: "Granted: SUITE-CAP-1's Q1, the ledger lock key in designs/suite-cap-1-triage-locks.md section 4.5."
Both exceptions can be granted together; they touch different functions.

## 3. Coming for the founder's approval (no decision now)

Each schema PR needs the founder's approval of `docs/product/domain-model.md` on its latest commit. Until runbook 3i
(a separate GitHub identity for the build), the founder approves by committing the suggested approval line on GitHub,
as on #39. In order:
1. **#42 (PR 6b-4, mail streams):** its fix round is finishing; the suggested approval line and the exact steps follow
   once CI is green and the fresh-clone check passes.
2. **SS-01 (a suspended firm's practices still run):** after #42. Notes for when it comes:
   - It decides part of ADR 0050's deferred point early: PaidWhole's own suspension or closure of a firm stops that
     firm's people's new work through its grants. A firm's nonpayment rules stay with milestone 12.
   - It keeps PRD:223, ADR 0050's computed nonpayment hold and Q13 as they are: a stored suspension takes no
     nonpayment reason (nonpayment is billing's own hold). A manual nonpayment suspension would need a new ruling,
     and the design recommends against it.
3. **SUITE-CAP-1b** (the triage lock fix), then **the interest fix**, each after the one before it merges.

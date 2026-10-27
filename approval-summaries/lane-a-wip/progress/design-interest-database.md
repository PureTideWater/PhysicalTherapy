# design-interest-database progress
Started 2026-10-27. Clone: $SP/designs/interest-database (detached at origin/claude/build-platform e908c214; #42 head 098636e3)
## Read so far
- LANES.md claim row (ADR 0084, LED-23..25, synth module 6, fixture 900008 only if needed); Handed-to-Lane-A entry (four items)
- lane-b-pr15b-status.md; review-payment-engine.md N1 (recordInterest allocated = named.length > 1; probe E4), builders' proposals (AMT I + PLB L6 double count; matched_at order -> S1 fixed in-pass, sequence/clock_timestamp needs migration)
- design lane-b-pr15b.md 0.5, 1.2 interest row (allocateByWeight, rem:513-560; LED-16 BPR 54.00 since AMT I left out of CLP04 per ADR 0021)
## Findings
(next: packages/ledger, apps/worker/src/reconcile, edi835 AMT I / PLB L6, migrations)

# Status: a suspended organization never reads "In good standing" (`co-001/ux-suspended-standing`)

*Kept current at every stage by the Lane B session that builds it. Times UTC (date -u).*

- **Stage:** design reviewed (wf_dc42b346-7e7, 09:35: build with changes, no migration, SS-01 to SS-14 accepted); before shots taken (12, base 7ef421b); builders next.
- **Branch / PR:** `co-001/ux-suspended-standing`, cut from 7ef421b / no PR yet.
- **Migration:** none (the billing view already holds the record status and billing's standing). No #42 file.
- **Reserved numbers:** test-matrix BIL-05, BIL-06; `packages/synth` BIL-05, BIL-06 (module 15) if needed. No ADR.
- **Choices (design §Decisions):** one `accountStanding()` in billing.ts (the record's status wins; closed over suspended); the badge "Suspended by PaidWhole" / "Closed" / "Suspended for nonpayment since …" / "Past due since …"; the next step with a link to `/support?from=billing`; a note that plan and payment changes do not lift a suspension by PaidWhole; the second adversarial review is correctness and tenancy.
- **Left to Lane A (per the review):** the stored suspension reason, note and time; the console's reason form.
- **Findings:** none yet. **CI:** none yet.
- **Next:** design review, then builders.

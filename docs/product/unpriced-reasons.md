# Unpriced reasons

The closed list of reasons a line is left unpriced (CLAUDE.md, Conventions: "Unpriced reasons are the closed
list in docs/product/unpriced-reasons.md. Never a guessed price."). A line is priced, or it carries exactly one
of these. The table below is copied word for word from the "Unpriced reasons and their remedies" table of the
[Rules reference](rules-reference.md); PRD section 11 lists the same twelve reasons. A test keeps this table,
that table and `UNPRICED_REASONS` in `packages/pricing` identical, so a reason is added in all three or in none.

| Reason | Meaning | Remedy shown on the Coverage screen |
| --- | --- | --- |
| `NO_MAPPING` | The payer and plan have no mapping on the service date | Map the plan |
| `NO_AGREEMENT` | Mapped as out of network or no agreement | None; anomaly screening only |
| `AMBIGUOUS_RATE` | More than one rate record matches | Specialist resolves scope |
| `NO_RATE_FOR_CODE` | The agreement has no term for the code | Obtain the exhibit page or confirm exclusion |
| `NO_PFS_VALUE` | No RVU for the code in the basis year | Check the code and year; some codes are carrier-priced |
| `UNSUPPORTED_METHOD` | Capitation or undefined case rate | None; reported |
| `SECONDARY_PAYER` | Claim status 2 or 3 | Deferred release |
| `MUE_EXCEEDED` | Units above the MUE with NCCI on | Review the claim |
| `UNITS_RULE_UNKNOWN` | Timed-units rule unknown for the payer | Confirm with the contract or import minutes |
| `DATE_OUTSIDE_VERSIONS` | No signed-off version covers the service date | Obtain the amendment or confirm the window |
| `REVERSED_CLAIM` | The claim was reversed and not corrected | None |
| `ENGINE_ERROR` | Unexpected input | Operator alert |

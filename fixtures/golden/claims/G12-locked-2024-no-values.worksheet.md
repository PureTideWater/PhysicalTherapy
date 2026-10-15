# Worksheet G12: Locked to 2024: the release holds no 2024 fee schedule

Computed by the independent worksheet tools/golden-worksheet (Python, exact decimal arithmetic; no code shared with packages/pricing).
Specialist verified: no. A reimbursement specialist checks every figure here before milestone 5 closes.
Every reference value comes from SYNTHETIC release 900002: invented for tests, never a CMS value.

## Inputs

- Release 900002 at fixtures/synthetic/rules/release-synth-900002; its MANIFEST.json has SHA-256 ac9b17c76f65ffe83be6bb543fb91349efa7470231d888e34e75fbfc3000ac52 and every file matched it.
- Practice settings: ZIP 00011; default rounding HALF_UP_CENT.
- Place-of-service settings (SYNTHETIC test assumption; fixtures/golden/QUESTIONS.md): 11 non-facility; 22 facility.
- Claim SYNTH-CLAIM-G12: status 1 (processed as primary); reversed by a later claim: no; superseded by a correction: no; payer and plan SYNTH-PAYER-1/PLAN-1.
- Remittance date: not known; dispute windows are judged on the triage date 2026-10-15.
- Mapping map-g12: contract, contract version cv-g12-1, 2026-01-01 to open.
- Contract version cv-g12-1 (contract contract-g12, version 1, signed_off, 2026-01-01 to open; windows: timely filing not stated, dispute not stated, appeal levels none stated):
  - Rate record rr-g12-1: PERCENT_OF_MEDICARE 105%, LOCKED:2024, locality practice, non_qualifying_apm; scope any code; any modifiers; any place of service; 2026-01-01 to open; flags apply_mppr off, apply_assistant_reduction off, apply_sequestration off, apply_ncci off; timed_units_rule PER_CODE; rounding not stated.

| Line | Code | Modifiers | Units | Service date | POS | Charge (cents) | Observed allowed (cents) | PR adjustments (cents) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 97110 | GP | 1 | 2026-04-14 | 11 | 6000 | 2000 (amt_b6) | none |

## Steps 1 to 3, per line

### Line 1: 97110 x 1 on 2026-04-14

Step 1, the agreement.
- Mapping map-g12 (contract, 2026-01-01 to open) is in force on 2026-04-14.
- The mapping names contract version cv-g12-1 of contract contract-g12; the version that prices the line is the signed-off one of that contract in force on 2026-04-14:
  - cv-g12-1 (version 1, signed_off, 2026-01-01 to open): signed off and in force.
- Rate records of cv-g12-1 against code 97110, modifier set [GP], place of service 11, 2026-04-14:
  - rr-g12-1 (any code; any modifiers; any place of service; 2026-01-01 to open): matches.
- Rate record rr-g12-1: PERCENT_OF_MEDICARE at 105%, year basis LOCKED:2024, locality basis practice, conversion factor non_qualifying_apm; flags apply_mppr off, apply_assistant_reduction off, apply_sequestration off, apply_ncci off; timed_units_rule PER_CODE; rounding not stated (the practice default applies).

Step 2, the base amount by method.
- Year basis LOCKED:2024: the 2024 fee schedule; each value is the latest record in force during 2024.
- **Unpriced: `NO_PFS_VALUE`.** Release 900002 has no relative value (pfs_rvu) for 97110 in 2024.

## Results

| Line | Outcome | Expected allowed (cents) | Unrounded (cents) | Rounding | Patient share (cents) | Variance (cents) | Dispute window |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | unpriced `NO_PFS_VALUE` | | | | | | |

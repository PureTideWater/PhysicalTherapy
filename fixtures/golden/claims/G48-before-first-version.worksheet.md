# Worksheet G48: A service date before the contract's first version

Computed by the independent worksheet tools/golden-worksheet (Python, exact decimal arithmetic; no code shared with packages/pricing).
Specialist verified: no. A reimbursement specialist checks every figure here before milestone 5 closes.
Every reference value comes from SYNTHETIC release 900001: invented for tests, never a CMS value.

## Inputs

- Release 900001 at fixtures/synthetic/rules/release-synth-900001; its MANIFEST.json has SHA-256 6d346c8fa596c0f720ff3176be10044e86c9b4fe843d37b04c59192cdbdce45a and every file matched it.
- Practice settings: ZIP 00011; default rounding HALF_UP_CENT.
- Place-of-service settings (SYNTHETIC test assumption; fixtures/golden/QUESTIONS.md): 11 non-facility; 22 facility.
- Claim SYNTH-CLAIM-G48: status 1 (processed as primary); reversed by a later claim: no; superseded by a correction: no; payer and plan SYNTH-PAYER-1/PLAN-1.
- Mapping map-g48: contract, contract version cv-g48-1, 2026-01-01 to open.
- Contract version cv-g48-1 (contract contract-g48, version 1, signed_off, 2026-07-01 to open):
  - Rate record rr-g48-1: PERCENT_OF_MEDICARE 110%, CURRENT, locality practice, non_qualifying_apm; scope any code; any modifiers; any place of service; 2026-07-01 to open; flags apply_mppr off, apply_assistant_reduction off, apply_sequestration off, apply_ncci off; timed_units_rule PER_CODE; rounding not stated.

| Line | Code | Modifiers | Units | Service date | POS | Charge (cents) | Observed allowed (cents) | PR adjustments (cents) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 97110 | GP | 1 | 2026-06-15 | 11 | 6000 | 2300 (amt_b6) | none |

## Steps 1 to 3, per line

### Line 1: 97110 x 1 on 2026-06-15

Step 1, the agreement.
- Mapping map-g48 (contract, 2026-01-01 to open) is in force on 2026-06-15.
- The mapping names contract version cv-g48-1 of contract contract-g48; the version that prices the line is the signed-off one of that contract in force on 2026-06-15:
  - cv-g48-1 (version 1, signed_off, 2026-07-01 to open): outside its window.
- **Unpriced: `DATE_OUTSIDE_VERSIONS`.** No signed-off version of contract contract-g48 covers 2026-06-15.

## Results

| Line | Outcome | Expected allowed (cents) | Unrounded (cents) | Rounding | Patient share (cents) |
| --- | --- | --- | --- | --- | --- |
| 1 | unpriced `DATE_OUTSIDE_VERSIONS` | | | | |

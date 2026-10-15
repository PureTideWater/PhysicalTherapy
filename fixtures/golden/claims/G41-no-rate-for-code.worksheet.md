# Worksheet G41: No rate record matches: by code, by place of service, by modifier set

Computed by the independent worksheet tools/golden-worksheet (Python, exact decimal arithmetic; no code shared with packages/pricing).
Specialist verified: no. A reimbursement specialist checks every figure here before milestone 5 closes.
Every reference value comes from SYNTHETIC release 900001: invented for tests, never a CMS value.

## Inputs

- Release 900001 at fixtures/synthetic/rules/release-synth-900001; its MANIFEST.json has SHA-256 6d346c8fa596c0f720ff3176be10044e86c9b4fe843d37b04c59192cdbdce45a and every file matched it.
- Practice settings: ZIP 00011; default rounding HALF_UP_CENT.
- Place-of-service settings (SYNTHETIC test assumption; fixtures/golden/QUESTIONS.md): 11 non-facility; 22 facility.
- Claim SYNTH-CLAIM-G41: status 1 (processed as primary); reversed by a later claim: no; superseded by a correction: no; payer and plan SYNTH-PAYER-1/PLAN-1.
- Mapping map-g41: contract, contract version cv-g41-1, 2026-01-01 to open.
- Contract version cv-g41-1 (contract contract-g41, version 1, signed_off, 2026-01-01 to open):
  - Rate record rr-g41-1: PERCENT_OF_MEDICARE 110%, CURRENT, locality practice, non_qualifying_apm; scope codes 97110, 97140; modifier sets [GP]; places of service 11; 2026-01-01 to open; flags apply_mppr off, apply_assistant_reduction off, apply_sequestration off, apply_ncci off; timed_units_rule PER_CODE; rounding not stated.

| Line | Code | Modifiers | Units | Service date | POS | Charge (cents) | Observed allowed (cents) | PR adjustments (cents) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 97530 | GP | 1 | 2026-03-10 | 11 | 7000 | 2900 (amt_b6) | none |
| 2 | 97140 | GP | 1 | 2026-03-10 | 22 | 5500 | 1800 (amt_b6) | none |
| 3 | 97140 | GP 59 | 1 | 2026-03-10 | 11 | 5500 | 2700 (amt_b6) | none |

## Steps 1 to 3, per line

### Line 1: 97530 x 1 on 2026-03-10

Step 1, the agreement.
- Mapping map-g41 (contract, 2026-01-01 to open) is in force on 2026-03-10.
- The mapping names contract version cv-g41-1 of contract contract-g41; the version that prices the line is the signed-off one of that contract in force on 2026-03-10:
  - cv-g41-1 (version 1, signed_off, 2026-01-01 to open): signed off and in force.
- Rate records of cv-g41-1 against code 97530, modifier set [GP], place of service 11, 2026-03-10:
  - rr-g41-1 (codes 97110, 97140; modifier sets [GP]; places of service 11; 2026-01-01 to open): no match, code 97530 is not in its codes.
- **Unpriced: `NO_RATE_FOR_CODE`.** No rate record of the version matches the line.

### Line 2: 97140 x 1 on 2026-03-10

Step 1, the agreement.
- Mapping map-g41 (contract, 2026-01-01 to open) is in force on 2026-03-10.
- The mapping names contract version cv-g41-1 of contract contract-g41; the version that prices the line is the signed-off one of that contract in force on 2026-03-10:
  - cv-g41-1 (version 1, signed_off, 2026-01-01 to open): signed off and in force.
- Rate records of cv-g41-1 against code 97140, modifier set [GP], place of service 22, 2026-03-10:
  - rr-g41-1 (codes 97110, 97140; modifier sets [GP]; places of service 11; 2026-01-01 to open): no match, place of service 22 is not in its places of service.
- **Unpriced: `NO_RATE_FOR_CODE`.** No rate record of the version matches the line.

### Line 3: 97140 x 1 on 2026-03-10

Step 1, the agreement.
- Mapping map-g41 (contract, 2026-01-01 to open) is in force on 2026-03-10.
- The mapping names contract version cv-g41-1 of contract contract-g41; the version that prices the line is the signed-off one of that contract in force on 2026-03-10:
  - cv-g41-1 (version 1, signed_off, 2026-01-01 to open): signed off and in force.
- Rate records of cv-g41-1 against code 97140, modifier set [59 GP], place of service 11, 2026-03-10:
  - rr-g41-1 (codes 97110, 97140; modifier sets [GP]; places of service 11; 2026-01-01 to open): no match, modifier set [59 GP] is not one of its modifier sets.
- **Unpriced: `NO_RATE_FOR_CODE`.** No rate record of the version matches the line.

## Results

| Line | Outcome | Expected allowed (cents) | Unrounded (cents) | Rounding | Patient share (cents) |
| --- | --- | --- | --- | --- | --- |
| 1 | unpriced `NO_RATE_FOR_CODE` | | | | |
| 2 | unpriced `NO_RATE_FOR_CODE` | | | | |
| 3 | unpriced `NO_RATE_FOR_CODE` | | | | |

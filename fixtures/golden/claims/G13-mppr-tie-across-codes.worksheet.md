# Worksheet G13: Multiple procedure reduction with a tie across two codes (2025 values)

Computed by the independent worksheet tools/golden-worksheet (Python, exact decimal arithmetic; no code shared with packages/pricing).
Specialist verified: no. A reimbursement specialist checks every figure here before milestone 5 closes.
Every reference value comes from SYNTHETIC release 900002: invented for tests, never a CMS value.

## Inputs

- Release 900002 at fixtures/synthetic/rules/release-synth-900002; its MANIFEST.json has SHA-256 ac9b17c76f65ffe83be6bb543fb91349efa7470231d888e34e75fbfc3000ac52 and every file matched it.
- Practice settings: ZIP 00011; default rounding HALF_UP_CENT.
- Place-of-service settings (SYNTHETIC test assumption; fixtures/golden/QUESTIONS.md): 11 non-facility; 22 facility.
- Claim SYNTH-CLAIM-G13: status 1 (processed as primary); reversed by a later claim: no; superseded by a correction: no; payer and plan SYNTH-PAYER-1/PLAN-1.
- Mapping map-g13: contract, contract version cv-g13-1, 2026-01-01 to open.
- Contract version cv-g13-1 (contract contract-g13, version 1, signed_off, 2026-01-01 to open):
  - Rate record rr-g13-1: PERCENT_OF_MEDICARE 100%, LOCKED:2025, locality practice, non_qualifying_apm; scope any code; any modifiers; any place of service; 2026-01-01 to open; flags apply_mppr on, apply_assistant_reduction off, apply_sequestration off, apply_ncci off; timed_units_rule PER_CODE; rounding not stated.

| Line | Code | Modifiers | Units | Service date | POS | Charge (cents) | Observed allowed (cents) | PR adjustments (cents) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 97112 | GP | 1 | 2026-04-14 | 11 | 6200 | 1900 (amt_b6) | none |
| 2 | 97110 | GP | 1 | 2026-04-14 | 11 | 6000 | 1300 (amt_b6) | none |

## Steps 1 to 3, per line

### Line 1: 97112 x 1 on 2026-04-14

Step 1, the agreement.
- Mapping map-g13 (contract, 2026-01-01 to open) is in force on 2026-04-14.
- The mapping names contract version cv-g13-1 of contract contract-g13; the version that prices the line is the signed-off one of that contract in force on 2026-04-14:
  - cv-g13-1 (version 1, signed_off, 2026-01-01 to open): signed off and in force.
- Rate records of cv-g13-1 against code 97112, modifier set [GP], place of service 11, 2026-04-14:
  - rr-g13-1 (any code; any modifiers; any place of service; 2026-01-01 to open): matches.
- Rate record rr-g13-1: PERCENT_OF_MEDICARE at 100%, year basis LOCKED:2025, locality basis practice, conversion factor non_qualifying_apm; flags apply_mppr on, apply_assistant_reduction off, apply_sequestration off, apply_ncci off; timed_units_rule PER_CODE; rounding not stated (the practice default applies).

Step 2, the base amount by method.
- Year basis LOCKED:2025: the 2025 fee schedule; each value is the latest record in force during 2025.
- pfs_rvu 97112 (year 2025, quarter A, 2025-01-01 to 2025-12-31): work 0.31, PE non-facility 0.66, PE facility 0.21, MP 0.11, status A.
- Place of service 11 is non-facility, so the non-facility practice-expense value applies.
- Locality: practice ZIP 00011 maps to carrier 99999 locality 01 (locality_map in force on 2026-04-14, 2026-01-01 to 2026-12-31).
- pfs_gpci 99999-01 (2025-01-01 to 2025-12-31): work 1.000, PE 0.940, MP 0.610.
- conversion_factor non_qualifying_apm (2025-01-01 to 2025-12-31): $19.6123 per RVU.
- Geographically adjusted RVUs: work 0.31 x 1.000 = 0.31; PE 0.66 x 0.940 = 0.6204; MP 0.11 x 0.610 = 0.0671; total 0.9975.
- Fee schedule amount per unit: 0.9975 x $19.6123 = $19.56326925.
- At 100%, per unit: work 607.9813 cents ($6.079813), practice expense 1216.747092 cents ($12.16747092), malpractice 131.598533 cents ($1.31598533); total 1956.326925 cents ($19.56326925).

Step 3, units: 1 as billed; 1956.326925 cents ($19.56326925) x 1 = 1956.326925 cents ($19.56326925).

### Line 2: 97110 x 1 on 2026-04-14

Step 1, the agreement.
- Mapping map-g13 (contract, 2026-01-01 to open) is in force on 2026-04-14.
- The mapping names contract version cv-g13-1 of contract contract-g13; the version that prices the line is the signed-off one of that contract in force on 2026-04-14:
  - cv-g13-1 (version 1, signed_off, 2026-01-01 to open): signed off and in force.
- Rate records of cv-g13-1 against code 97110, modifier set [GP], place of service 11, 2026-04-14:
  - rr-g13-1 (any code; any modifiers; any place of service; 2026-01-01 to open): matches.
- Rate record rr-g13-1: PERCENT_OF_MEDICARE at 100%, year basis LOCKED:2025, locality basis practice, conversion factor non_qualifying_apm; flags apply_mppr on, apply_assistant_reduction off, apply_sequestration off, apply_ncci off; timed_units_rule PER_CODE; rounding not stated (the practice default applies).

Step 2, the base amount by method.
- Year basis LOCKED:2025: the 2025 fee schedule; each value is the latest record in force during 2025.
- pfs_rvu 97110 (year 2025, quarter A, 2025-01-01 to 2025-12-31): work 0.30, PE non-facility 0.66, PE facility 0.20, MP 0.10, status A.
- Place of service 11 is non-facility, so the non-facility practice-expense value applies.
- Locality: practice ZIP 00011 maps to carrier 99999 locality 01 (locality_map in force on 2026-04-14, 2026-01-01 to 2026-12-31).
- pfs_gpci 99999-01 (2025-01-01 to 2025-12-31): work 1.000, PE 0.940, MP 0.610.
- conversion_factor non_qualifying_apm (2025-01-01 to 2025-12-31): $19.6123 per RVU.
- Geographically adjusted RVUs: work 0.30 x 1.000 = 0.3; PE 0.66 x 0.940 = 0.6204; MP 0.10 x 0.610 = 0.061; total 0.9814.
- Fee schedule amount per unit: 0.9814 x $19.6123 = $19.24751122.
- At 100%, per unit: work 588.369 cents ($5.88369), practice expense 1216.747092 cents ($12.16747092), malpractice 119.63503 cents ($1.1963503); total 1924.751122 cents ($19.24751122).

Step 3, units: 1 as billed; 1924.751122 cents ($19.24751122) x 1 = 1924.751122 cents ($19.24751122).

## Step 4a, the multiple procedure reduction, per day

### Multiple procedure reduction on 2026-04-14

Lines with apply_mppr on and a price so far: line 1, line 2. Units are ranked by their practice-expense amount, highest first; ties go to the lower line number, then the earlier unit (fixtures/golden/QUESTIONS.md).
- Line 1 (97112): always therapy, mppr_rate 97112 (2026-01-01 to 2026-12-31): 40%.
- Line 2 (97110): always therapy, mppr_rate 97110 (2026-01-01 to 2026-12-31): 40%.

| Rank | Line | Code | Unit | PE amount per unit (cents) | Treatment | Reduction (cents) |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 97112 | 1 | 1216.747092 | kept whole | 0 |
| 2 | 2 | 97110 | 1 | 1216.747092 | PE reduced by 40% | 1216.747092 x 40% = 486.6988368 |

## Steps 4 to 6, per line

### Line 1

Step 4, flagged adjustments in order (multiple procedure reduction, assistant reduction, sequestration).
- assistant_reduction: flag apply_assistant_reduction is off; not applied.
- sequestration: flag apply_sequestration is off; not applied.
- mppr: before 1956.326925, after 1956.326925; its unit is the day's highest-ranked, kept whole; unchanged.
- Contract-specific adjustments: none (phase one rate records define none).

Step 5, patient share: 0 cents ($0.00) from the line's PR adjustments (none); reported beside the expected amount, never subtracted from it.
- Claim status 1 (processed as primary); the claim is not reversed.

Step 6, rounding once: 1956.326925 cents under HALF_UP_CENT (the practice default; halves move away from zero) = **1956 cents ($19.56)**; the unrounded 1956.326925 is kept beside it.

### Line 2

Step 4, flagged adjustments in order (multiple procedure reduction, assistant reduction, sequestration).
- assistant_reduction: flag apply_assistant_reduction is off; not applied.
- sequestration: flag apply_sequestration is off; not applied.
- mppr: before 1924.751122, after 1438.0522852; 1924.751122 cents ($19.24751122) - the reductions of its units 486.6988368 = 1438.0522852 cents ($14.380522852).
- Contract-specific adjustments: none (phase one rate records define none).

Step 5, patient share: 0 cents ($0.00) from the line's PR adjustments (none); reported beside the expected amount, never subtracted from it.
- Claim status 1 (processed as primary); the claim is not reversed.

Step 6, rounding once: 1438.0522852 cents under HALF_UP_CENT (the practice default; halves move away from zero) = **1438 cents ($14.38)**; the unrounded 1438.0522852 is kept beside it.

## Results

| Line | Outcome | Expected allowed (cents) | Unrounded (cents) | Rounding | Patient share (cents) |
| --- | --- | --- | --- | --- | --- |
| 1 | priced | 1956 | 1956.326925 | HALF_UP_CENT | 0 |
| 2 | priced | 1438 | 1438.0522852 | HALF_UP_CENT | 0 |

# Worksheet G32: Rounding just below and just above a half cent

Computed by the independent worksheet tools/golden-worksheet (Python, exact decimal arithmetic; no code shared with packages/pricing).
Specialist verified: no. A reimbursement specialist checks every figure here before milestone 5 closes.
Every reference value comes from SYNTHETIC release 900001: invented for tests, never a CMS value.

## Inputs

- Release 900001 at fixtures/synthetic/rules/release-synth-900001; its MANIFEST.json has SHA-256 6d346c8fa596c0f720ff3176be10044e86c9b4fe843d37b04c59192cdbdce45a and every file matched it.
- Practice settings: ZIP 00011; default rounding HALF_UP_CENT.
- Place-of-service settings (SYNTHETIC test assumption; fixtures/golden/QUESTIONS.md): 11 non-facility; 22 facility.
- Claim SYNTH-CLAIM-G32: status 1 (processed as primary); reversed by a later claim: no; superseded by a correction: no; payer and plan SYNTH-PAYER-1/PLAN-1.
- Remittance date: not known; dispute windows are judged on the triage date 2026-10-15.
- Mapping map-g32: contract, contract version cv-g32-1, 2026-01-01 to open.
- Contract version cv-g32-1 (contract contract-g32, version 1, signed_off, 2026-01-01 to open; windows: timely filing not stated, dispute not stated, appeal levels none stated):
  - Rate record rr-g32-140: PERCENT_OF_MEDICARE 124.9999%, CURRENT, locality practice, non_qualifying_apm; scope codes 97140; any modifiers; any place of service; 2026-01-01 to open; flags apply_mppr off, apply_assistant_reduction off, apply_sequestration off, apply_ncci off; timed_units_rule PER_CODE; rounding HALF_UP_CENT.
  - Rate record rr-g32-112: PERCENT_OF_MEDICARE 125.0001%, CURRENT, locality practice, non_qualifying_apm; scope codes 97112; any modifiers; any place of service; 2026-01-01 to open; flags apply_mppr off, apply_assistant_reduction off, apply_sequestration off, apply_ncci off; timed_units_rule PER_CODE; rounding HALF_EVEN_CENT.
  - Rate record rr-g32-110: PERCENT_OF_MEDICARE 99.9999%, CURRENT, locality practice, non_qualifying_apm; scope codes 97110; any modifiers; any place of service; 2026-01-01 to open; flags apply_mppr off, apply_assistant_reduction off, apply_sequestration off, apply_ncci off; timed_units_rule PER_CODE; rounding TRUNCATE.

| Line | Code | Modifiers | Units | Service date | POS | Charge (cents) | Observed allowed (cents) | PR adjustments (cents) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 97140 | GP | 1 | 2026-03-10 | 11 | 5500 | 3000 (amt_b6) | none |
| 2 | 97112 | GP | 1 | 2026-03-10 | 11 | 6200 | 2400 (amt_b6) | none |
| 3 | 97110 | GP | 1 | 2026-03-10 | 11 | 6000 | 2100 (amt_b6) | none |

## Steps 1 to 3, per line

### Line 1: 97140 x 1 on 2026-03-10

Step 1, the agreement.
- Mapping map-g32 (contract, 2026-01-01 to open) is in force on 2026-03-10.
- The mapping names contract version cv-g32-1 of contract contract-g32; the version that prices the line is the signed-off one of that contract in force on 2026-03-10:
  - cv-g32-1 (version 1, signed_off, 2026-01-01 to open): signed off and in force.
- Rate records of cv-g32-1 against code 97140, modifier set [GP], place of service 11, 2026-03-10:
  - rr-g32-140 (codes 97140; any modifiers; any place of service; 2026-01-01 to open): matches.
  - rr-g32-112 (codes 97112; any modifiers; any place of service; 2026-01-01 to open): no match, code 97140 is not in its codes.
  - rr-g32-110 (codes 97110; any modifiers; any place of service; 2026-01-01 to open): no match, code 97140 is not in its codes.
- Rate record rr-g32-140: PERCENT_OF_MEDICARE at 124.9999%, year basis CURRENT, locality basis practice, conversion factor non_qualifying_apm; flags apply_mppr off, apply_assistant_reduction off, apply_sequestration off, apply_ncci off; timed_units_rule PER_CODE; rounding HALF_UP_CENT.

Step 2, the base amount by method.
- Year basis CURRENT: the fee schedule in effect on the date of service, 2026-03-10 (basis year 2026); each value is the record in force on that date.
- pfs_rvu 97140 (year 2026, quarter A, 2026-01-01 to 2026-12-31): work 0.34, PE non-facility 0.84, PE facility 0.24, MP 0.14, status A.
- Place of service 11 is non-facility, so the non-facility practice-expense value applies.
- Locality: practice ZIP 00011 maps to carrier 99999 locality 01 (locality_map in force on 2026-03-10, 2026-01-01 to 2026-12-31).
- pfs_gpci 99999-01 (2026-01-01 to 2026-12-31): work 1.000, PE 0.950, MP 0.650.
- conversion_factor non_qualifying_apm (2026-01-01 to 2026-12-31): $20.0000 per RVU.
- Geographically adjusted RVUs: work 0.34 x 1.000 = 0.34; PE 0.84 x 0.950 = 0.798; MP 0.14 x 0.650 = 0.091; total 1.229.
- Fee schedule amount per unit: 1.229 x $20.0000 = $24.58.
- At 124.9999%, per unit: work 849.99932 cents ($8.4999932), practice expense 1994.998404 cents ($19.94998404), malpractice 227.499818 cents ($2.27499818); total 3072.497542 cents ($30.72497542).

Step 3, units: 1 as billed; 3072.497542 cents ($30.72497542) x 1 = 3072.497542 cents ($30.72497542).

### Line 2: 97112 x 1 on 2026-03-10

Step 1, the agreement.
- Mapping map-g32 (contract, 2026-01-01 to open) is in force on 2026-03-10.
- The mapping names contract version cv-g32-1 of contract contract-g32; the version that prices the line is the signed-off one of that contract in force on 2026-03-10:
  - cv-g32-1 (version 1, signed_off, 2026-01-01 to open): signed off and in force.
- Rate records of cv-g32-1 against code 97112, modifier set [GP], place of service 11, 2026-03-10:
  - rr-g32-140 (codes 97140; any modifiers; any place of service; 2026-01-01 to open): no match, code 97112 is not in its codes.
  - rr-g32-112 (codes 97112; any modifiers; any place of service; 2026-01-01 to open): matches.
  - rr-g32-110 (codes 97110; any modifiers; any place of service; 2026-01-01 to open): no match, code 97112 is not in its codes.
- Rate record rr-g32-112: PERCENT_OF_MEDICARE at 125.0001%, year basis CURRENT, locality basis practice, conversion factor non_qualifying_apm; flags apply_mppr off, apply_assistant_reduction off, apply_sequestration off, apply_ncci off; timed_units_rule PER_CODE; rounding HALF_EVEN_CENT.

Step 2, the base amount by method.
- Year basis CURRENT: the fee schedule in effect on the date of service, 2026-03-10 (basis year 2026); each value is the record in force on that date.
- pfs_rvu 97112 (year 2026, quarter A, 2026-01-01 to 2026-12-31): work 0.32, PE non-facility 0.62, PE facility 0.22, MP 0.12, status A.
- Place of service 11 is non-facility, so the non-facility practice-expense value applies.
- Locality: practice ZIP 00011 maps to carrier 99999 locality 01 (locality_map in force on 2026-03-10, 2026-01-01 to 2026-12-31).
- pfs_gpci 99999-01 (2026-01-01 to 2026-12-31): work 1.000, PE 0.950, MP 0.650.
- conversion_factor non_qualifying_apm (2026-01-01 to 2026-12-31): $20.0000 per RVU.
- Geographically adjusted RVUs: work 0.32 x 1.000 = 0.32; PE 0.62 x 0.950 = 0.589; MP 0.12 x 0.650 = 0.078; total 0.987.
- Fee schedule amount per unit: 0.987 x $20.0000 = $19.74.
- At 125.0001%, per unit: work 800.00064 cents ($8.0000064), practice expense 1472.501178 cents ($14.72501178), malpractice 195.000156 cents ($1.95000156); total 2467.501974 cents ($24.67501974).

Step 3, units: 1 as billed; 2467.501974 cents ($24.67501974) x 1 = 2467.501974 cents ($24.67501974).

### Line 3: 97110 x 1 on 2026-03-10

Step 1, the agreement.
- Mapping map-g32 (contract, 2026-01-01 to open) is in force on 2026-03-10.
- The mapping names contract version cv-g32-1 of contract contract-g32; the version that prices the line is the signed-off one of that contract in force on 2026-03-10:
  - cv-g32-1 (version 1, signed_off, 2026-01-01 to open): signed off and in force.
- Rate records of cv-g32-1 against code 97110, modifier set [GP], place of service 11, 2026-03-10:
  - rr-g32-140 (codes 97140; any modifiers; any place of service; 2026-01-01 to open): no match, code 97110 is not in its codes.
  - rr-g32-112 (codes 97112; any modifiers; any place of service; 2026-01-01 to open): no match, code 97110 is not in its codes.
  - rr-g32-110 (codes 97110; any modifiers; any place of service; 2026-01-01 to open): matches.
- Rate record rr-g32-110: PERCENT_OF_MEDICARE at 99.9999%, year basis CURRENT, locality basis practice, conversion factor non_qualifying_apm; flags apply_mppr off, apply_assistant_reduction off, apply_sequestration off, apply_ncci off; timed_units_rule PER_CODE; rounding TRUNCATE.

Step 2, the base amount by method.
- Year basis CURRENT: the fee schedule in effect on the date of service, 2026-03-10 (basis year 2026); each value is the record in force on that date.
- pfs_rvu 97110 (year 2026, quarter A, 2026-01-01 to 2026-12-31): work 0.31, PE non-facility 0.71, PE facility 0.21, MP 0.11, status A.
- Place of service 11 is non-facility, so the non-facility practice-expense value applies.
- Locality: practice ZIP 00011 maps to carrier 99999 locality 01 (locality_map in force on 2026-03-10, 2026-01-01 to 2026-12-31).
- pfs_gpci 99999-01 (2026-01-01 to 2026-12-31): work 1.000, PE 0.950, MP 0.650.
- conversion_factor non_qualifying_apm (2026-01-01 to 2026-12-31): $20.0000 per RVU.
- Geographically adjusted RVUs: work 0.31 x 1.000 = 0.31; PE 0.71 x 0.950 = 0.6745; MP 0.11 x 0.650 = 0.0715; total 1.056.
- Fee schedule amount per unit: 1.056 x $20.0000 = $21.12.
- At 99.9999%, per unit: work 619.99938 cents ($6.1999938), practice expense 1348.998651 cents ($13.48998651), malpractice 142.999857 cents ($1.42999857); total 2111.997888 cents ($21.11997888).

Step 3, units: 1 as billed; 2111.997888 cents ($21.11997888) x 1 = 2111.997888 cents ($21.11997888).

## Steps 4 to 8, per line

### Line 1

Step 4, flagged adjustments in order (multiple procedure reduction, assistant reduction, sequestration).
- mppr: flag apply_mppr is off; not applied.
- assistant_reduction: flag apply_assistant_reduction is off; not applied.
- sequestration: flag apply_sequestration is off; not applied.
- Contract-specific adjustments: none (phase one rate records define none).

Step 5, patient share: 0 cents ($0.00) from the line's PR adjustments (none); reported beside the expected amount, never subtracted from it.
- Claim status 1 (processed as primary); the claim is not reversed.

Step 6, rounding once: 3072.497542 cents under HALF_UP_CENT (the rate record's rule; halves move away from zero) = **3072 cents ($30.72)**; the unrounded 3072.497542 is kept beside it.

Step 7, variance: expected allowed 3072 - observed allowed 3000 cents (amt_b6) = 72 cents: an underpayment.

Step 8, dispute window: the remittance date is not known, so no deadline can be worked out: NO_WINDOW on 2026-10-15.

### Line 2

Step 4, flagged adjustments in order (multiple procedure reduction, assistant reduction, sequestration).
- mppr: flag apply_mppr is off; not applied.
- assistant_reduction: flag apply_assistant_reduction is off; not applied.
- sequestration: flag apply_sequestration is off; not applied.
- Contract-specific adjustments: none (phase one rate records define none).

Step 5, patient share: 0 cents ($0.00) from the line's PR adjustments (none); reported beside the expected amount, never subtracted from it.
- Claim status 1 (processed as primary); the claim is not reversed.

Step 6, rounding once: 2467.501974 cents under HALF_EVEN_CENT (the rate record's rule; halves move to the even cent) = **2468 cents ($24.68)**; the unrounded 2467.501974 is kept beside it.

Step 7, variance: expected allowed 2468 - observed allowed 2400 cents (amt_b6) = 68 cents: an underpayment.

Step 8, dispute window: the remittance date is not known, so no deadline can be worked out: NO_WINDOW on 2026-10-15.

### Line 3

Step 4, flagged adjustments in order (multiple procedure reduction, assistant reduction, sequestration).
- mppr: flag apply_mppr is off; not applied.
- assistant_reduction: flag apply_assistant_reduction is off; not applied.
- sequestration: flag apply_sequestration is off; not applied.
- Contract-specific adjustments: none (phase one rate records define none).

Step 5, patient share: 0 cents ($0.00) from the line's PR adjustments (none); reported beside the expected amount, never subtracted from it.
- Claim status 1 (processed as primary); the claim is not reversed.

Step 6, rounding once: 2111.997888 cents under TRUNCATE (the rate record's rule; fractions of a cent are dropped toward zero) = **2111 cents ($21.11)**; the unrounded 2111.997888 is kept beside it.

Step 7, variance: expected allowed 2111 - observed allowed 2100 cents (amt_b6) = 11 cents: an underpayment.

Step 8, dispute window: the remittance date is not known, so no deadline can be worked out: NO_WINDOW on 2026-10-15.

## Results

| Line | Outcome | Expected allowed (cents) | Unrounded (cents) | Rounding | Patient share (cents) | Variance (cents) | Dispute window |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | priced | 3072 | 3072.497542 | HALF_UP_CENT | 0 | 72 | NO_WINDOW |
| 2 | priced | 2468 | 2467.501974 | HALF_EVEN_CENT | 0 | 68 | NO_WINDOW |
| 3 | priced | 2111 | 2111.997888 | TRUNCATE | 0 | 11 | NO_WINDOW |

# Worksheet G25: Two rate records, one with apply_mppr on and one off

Computed by the independent worksheet tools/golden-worksheet (Python, exact decimal arithmetic; no code shared with packages/pricing).
Specialist verified: no. A reimbursement specialist checks every figure here before milestone 5 closes.
Every reference value comes from SYNTHETIC release 900001: invented for tests, never a CMS value.

## Inputs

- Release 900001 at fixtures/synthetic/rules/release-synth-900001; its MANIFEST.json has SHA-256 6d346c8fa596c0f720ff3176be10044e86c9b4fe843d37b04c59192cdbdce45a and every file matched it.
- Practice settings: ZIP 00011; default rounding HALF_UP_CENT.
- Place-of-service settings (SYNTHETIC test assumption; fixtures/golden/QUESTIONS.md): 11 non-facility; 22 facility.
- Claim SYNTH-CLAIM-G25: status 1 (processed as primary); reversed by a later claim: no; superseded by a correction: no; payer and plan SYNTH-PAYER-1/PLAN-1.
- Remittance date: not known; dispute windows are judged on the triage date 2026-10-15.
- Mapping map-g25: contract, contract version cv-g25-1, 2026-01-01 to open.
- Contract version cv-g25-1 (contract contract-g25, version 1, signed_off, 2026-01-01 to open; windows: timely filing not stated, dispute not stated, appeal levels none stated):
  - Rate record rr-g25-a: PERCENT_OF_MEDICARE 100%, CURRENT, locality practice, non_qualifying_apm; scope codes 97110, 97112; any modifiers; any place of service; 2026-01-01 to open; flags apply_mppr on, apply_assistant_reduction off, apply_sequestration off, apply_ncci off; timed_units_rule PER_CODE; rounding not stated.
  - Rate record rr-g25-b: PERCENT_OF_MEDICARE 100%, CURRENT, locality practice, non_qualifying_apm; scope codes 97530; any modifiers; any place of service; 2026-01-01 to open; flags apply_mppr off, apply_assistant_reduction off, apply_sequestration off, apply_ncci off; timed_units_rule PER_CODE; rounding not stated.

| Line | Code | Modifiers | Units | Service date | POS | Charge (cents) | Observed allowed (cents) | PR adjustments (cents) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 97530 | GP | 1 | 2026-03-10 | 11 | 7000 | 2700 (amt_b6) | none |
| 2 | 97110 | GP | 1 | 2026-03-10 | 11 | 6000 | 2100 (amt_b6) | none |
| 3 | 97112 | GP | 1 | 2026-03-10 | 11 | 6200 | 1500 (amt_b6) | none |

## Steps 1 to 3, per line

### Line 1: 97530 x 1 on 2026-03-10

Step 1, the agreement.
- Mapping map-g25 (contract, 2026-01-01 to open) is in force on 2026-03-10.
- The mapping names contract version cv-g25-1 of contract contract-g25; the version that prices the line is the signed-off one of that contract in force on 2026-03-10:
  - cv-g25-1 (version 1, signed_off, 2026-01-01 to open): signed off and in force.
- Rate records of cv-g25-1 against code 97530, modifier set [GP], place of service 11, 2026-03-10:
  - rr-g25-a (codes 97110, 97112; any modifiers; any place of service; 2026-01-01 to open): no match, code 97530 is not in its codes.
  - rr-g25-b (codes 97530; any modifiers; any place of service; 2026-01-01 to open): matches.
- Rate record rr-g25-b: PERCENT_OF_MEDICARE at 100%, year basis CURRENT, locality basis practice, conversion factor non_qualifying_apm; flags apply_mppr off, apply_assistant_reduction off, apply_sequestration off, apply_ncci off; timed_units_rule PER_CODE; rounding not stated (the practice default applies).

Step 2, the base amount by method.
- Year basis CURRENT: the fee schedule in effect on the date of service, 2026-03-10 (basis year 2026); each value is the record in force on that date.
- pfs_rvu 97530 (year 2026, quarter A, 2026-01-01 to 2026-12-31): work 0.35, PE non-facility 0.95, PE facility 0.25, MP 0.15, status A.
- Place of service 11 is non-facility, so the non-facility practice-expense value applies.
- Locality: practice ZIP 00011 maps to carrier 99999 locality 01 (locality_map in force on 2026-03-10, 2026-01-01 to 2026-12-31).
- pfs_gpci 99999-01 (2026-01-01 to 2026-12-31): work 1.000, PE 0.950, MP 0.650.
- conversion_factor non_qualifying_apm (2026-01-01 to 2026-12-31): $20.0000 per RVU.
- Geographically adjusted RVUs: work 0.35 x 1.000 = 0.35; PE 0.95 x 0.950 = 0.9025; MP 0.15 x 0.650 = 0.0975; total 1.35.
- Fee schedule amount per unit: 1.35 x $20.0000 = $27.00.
- At 100%, per unit: work 700 cents ($7.00), practice expense 1805 cents ($18.05), malpractice 195 cents ($1.95); total 2700 cents ($27.00).

Step 3, units: 1 as billed; 2700 cents ($27.00) x 1 = 2700 cents ($27.00).

### Line 2: 97110 x 1 on 2026-03-10

Step 1, the agreement.
- Mapping map-g25 (contract, 2026-01-01 to open) is in force on 2026-03-10.
- The mapping names contract version cv-g25-1 of contract contract-g25; the version that prices the line is the signed-off one of that contract in force on 2026-03-10:
  - cv-g25-1 (version 1, signed_off, 2026-01-01 to open): signed off and in force.
- Rate records of cv-g25-1 against code 97110, modifier set [GP], place of service 11, 2026-03-10:
  - rr-g25-a (codes 97110, 97112; any modifiers; any place of service; 2026-01-01 to open): matches.
  - rr-g25-b (codes 97530; any modifiers; any place of service; 2026-01-01 to open): no match, code 97110 is not in its codes.
- Rate record rr-g25-a: PERCENT_OF_MEDICARE at 100%, year basis CURRENT, locality basis practice, conversion factor non_qualifying_apm; flags apply_mppr on, apply_assistant_reduction off, apply_sequestration off, apply_ncci off; timed_units_rule PER_CODE; rounding not stated (the practice default applies).

Step 2, the base amount by method.
- Year basis CURRENT: the fee schedule in effect on the date of service, 2026-03-10 (basis year 2026); each value is the record in force on that date.
- pfs_rvu 97110 (year 2026, quarter A, 2026-01-01 to 2026-12-31): work 0.31, PE non-facility 0.71, PE facility 0.21, MP 0.11, status A.
- Place of service 11 is non-facility, so the non-facility practice-expense value applies.
- Locality: practice ZIP 00011 maps to carrier 99999 locality 01 (locality_map in force on 2026-03-10, 2026-01-01 to 2026-12-31).
- pfs_gpci 99999-01 (2026-01-01 to 2026-12-31): work 1.000, PE 0.950, MP 0.650.
- conversion_factor non_qualifying_apm (2026-01-01 to 2026-12-31): $20.0000 per RVU.
- Geographically adjusted RVUs: work 0.31 x 1.000 = 0.31; PE 0.71 x 0.950 = 0.6745; MP 0.11 x 0.650 = 0.0715; total 1.056.
- Fee schedule amount per unit: 1.056 x $20.0000 = $21.12.
- At 100%, per unit: work 620 cents ($6.20), practice expense 1349 cents ($13.49), malpractice 143 cents ($1.43); total 2112 cents ($21.12).

Step 3, units: 1 as billed; 2112 cents ($21.12) x 1 = 2112 cents ($21.12).

### Line 3: 97112 x 1 on 2026-03-10

Step 1, the agreement.
- Mapping map-g25 (contract, 2026-01-01 to open) is in force on 2026-03-10.
- The mapping names contract version cv-g25-1 of contract contract-g25; the version that prices the line is the signed-off one of that contract in force on 2026-03-10:
  - cv-g25-1 (version 1, signed_off, 2026-01-01 to open): signed off and in force.
- Rate records of cv-g25-1 against code 97112, modifier set [GP], place of service 11, 2026-03-10:
  - rr-g25-a (codes 97110, 97112; any modifiers; any place of service; 2026-01-01 to open): matches.
  - rr-g25-b (codes 97530; any modifiers; any place of service; 2026-01-01 to open): no match, code 97112 is not in its codes.
- Rate record rr-g25-a: PERCENT_OF_MEDICARE at 100%, year basis CURRENT, locality basis practice, conversion factor non_qualifying_apm; flags apply_mppr on, apply_assistant_reduction off, apply_sequestration off, apply_ncci off; timed_units_rule PER_CODE; rounding not stated (the practice default applies).

Step 2, the base amount by method.
- Year basis CURRENT: the fee schedule in effect on the date of service, 2026-03-10 (basis year 2026); each value is the record in force on that date.
- pfs_rvu 97112 (year 2026, quarter A, 2026-01-01 to 2026-12-31): work 0.32, PE non-facility 0.62, PE facility 0.22, MP 0.12, status A.
- Place of service 11 is non-facility, so the non-facility practice-expense value applies.
- Locality: practice ZIP 00011 maps to carrier 99999 locality 01 (locality_map in force on 2026-03-10, 2026-01-01 to 2026-12-31).
- pfs_gpci 99999-01 (2026-01-01 to 2026-12-31): work 1.000, PE 0.950, MP 0.650.
- conversion_factor non_qualifying_apm (2026-01-01 to 2026-12-31): $20.0000 per RVU.
- Geographically adjusted RVUs: work 0.32 x 1.000 = 0.32; PE 0.62 x 0.950 = 0.589; MP 0.12 x 0.650 = 0.078; total 0.987.
- Fee schedule amount per unit: 0.987 x $20.0000 = $19.74.
- At 100%, per unit: work 640 cents ($6.40), practice expense 1178 cents ($11.78), malpractice 156 cents ($1.56); total 1974 cents ($19.74).

Step 3, units: 1 as billed; 1974 cents ($19.74) x 1 = 1974 cents ($19.74).

## Step 4a, the multiple procedure reduction, per day

### Multiple procedure reduction on 2026-03-10

Lines with apply_mppr on and a price so far: line 2, line 3. Units are ranked by their practice-expense amount, highest first; ties go to the lower line number, then the earlier unit (fixtures/golden/QUESTIONS.md).
- Line 2 (97110): always therapy, mppr_rate 97110 (2026-01-01 to 2026-12-31): 40%.
- Line 3 (97112): always therapy, mppr_rate 97112 (2026-01-01 to 2026-12-31): 40%.

| Rank | Line | Code | Unit | PE amount per unit (cents) | Treatment | Reduction (cents) |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 2 | 97110 | 1 | 1349 | kept whole | 0 |
| 2 | 3 | 97112 | 1 | 1178 | PE reduced by 40% | 1178 x 40% = 471.2 |

## Steps 4 to 8, per line

### Line 1

Step 4, flagged adjustments in order (multiple procedure reduction, assistant reduction, sequestration).
- mppr: flag apply_mppr is off; not applied.
- assistant_reduction: flag apply_assistant_reduction is off; not applied.
- sequestration: flag apply_sequestration is off; not applied.
- Contract-specific adjustments: none (phase one rate records define none).

Step 5, patient share: 0 cents ($0.00) from the line's PR adjustments (none); reported beside the expected amount, never subtracted from it.
- Claim status 1 (processed as primary); the claim is not reversed.

Step 6, rounding once: 2700 cents under HALF_UP_CENT (the practice default; halves move away from zero) = **2700 cents ($27.00)**; the unrounded 2700 is kept beside it.

Step 7, variance: expected allowed 2700 - observed allowed 2700 cents (amt_b6) = 0 cents: none.

Step 8, dispute window: the remittance date is not known, so no deadline can be worked out: NO_WINDOW on 2026-10-15.

### Line 2

Step 4, flagged adjustments in order (multiple procedure reduction, assistant reduction, sequestration).
- assistant_reduction: flag apply_assistant_reduction is off; not applied.
- sequestration: flag apply_sequestration is off; not applied.
- mppr: before 2112, after 2112; its unit is the day's highest-ranked, kept whole; unchanged.
- Contract-specific adjustments: none (phase one rate records define none).

Step 5, patient share: 0 cents ($0.00) from the line's PR adjustments (none); reported beside the expected amount, never subtracted from it.
- Claim status 1 (processed as primary); the claim is not reversed.

Step 6, rounding once: 2112 cents under HALF_UP_CENT (the practice default; halves move away from zero) = **2112 cents ($21.12)**; the unrounded 2112 is kept beside it.

Step 7, variance: expected allowed 2112 - observed allowed 2100 cents (amt_b6) = 12 cents: an underpayment.

Step 8, dispute window: the remittance date is not known, so no deadline can be worked out: NO_WINDOW on 2026-10-15.

### Line 3

Step 4, flagged adjustments in order (multiple procedure reduction, assistant reduction, sequestration).
- assistant_reduction: flag apply_assistant_reduction is off; not applied.
- sequestration: flag apply_sequestration is off; not applied.
- mppr: before 1974, after 1502.8; 1974 cents ($19.74) - the reductions of its units 471.2 = 1502.8 cents ($15.028).
- Contract-specific adjustments: none (phase one rate records define none).

Step 5, patient share: 0 cents ($0.00) from the line's PR adjustments (none); reported beside the expected amount, never subtracted from it.
- Claim status 1 (processed as primary); the claim is not reversed.

Step 6, rounding once: 1502.8 cents under HALF_UP_CENT (the practice default; halves move away from zero) = **1503 cents ($15.03)**; the unrounded 1502.8 is kept beside it.

Step 7, variance: expected allowed 1503 - observed allowed 1500 cents (amt_b6) = 3 cents: an underpayment.

Step 8, dispute window: the remittance date is not known, so no deadline can be worked out: NO_WINDOW on 2026-10-15.

## Results

| Line | Outcome | Expected allowed (cents) | Unrounded (cents) | Rounding | Patient share (cents) | Variance (cents) | Dispute window |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | priced | 2700 | 2700 | HALF_UP_CENT | 0 | 0 | NO_WINDOW |
| 2 | priced | 2112 | 2112 | HALF_UP_CENT | 0 | 12 | NO_WINDOW |
| 3 | priced | 1503 | 1502.8 | HALF_UP_CENT | 0 | 3 | NO_WINDOW |

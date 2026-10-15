# Worksheet G24: Commercial 120% with only apply_mppr on

Computed by the independent worksheet tools/golden-worksheet (Python, exact decimal arithmetic; no code shared with packages/pricing).
Specialist verified: no. A reimbursement specialist checks every figure here before milestone 5 closes.
Every reference value comes from SYNTHETIC release 900001: invented for tests, never a CMS value.

## Inputs

- Release 900001 at fixtures/synthetic/rules/release-synth-900001; its MANIFEST.json has SHA-256 6d346c8fa596c0f720ff3176be10044e86c9b4fe843d37b04c59192cdbdce45a and every file matched it.
- Practice settings: ZIP 00011; default rounding HALF_UP_CENT.
- Place-of-service settings (SYNTHETIC test assumption; fixtures/golden/QUESTIONS.md): 11 non-facility; 22 facility.
- Claim SYNTH-CLAIM-G24: status 1 (processed as primary); reversed by a later claim: no; superseded by a correction: no; payer and plan SYNTH-PAYER-1/PLAN-1.
- Remittance date: not known; dispute windows are judged on the triage date 2026-10-15.
- Mapping map-g24: contract, contract version cv-g24-1, 2026-01-01 to open.
- Contract version cv-g24-1 (contract contract-g24, version 1, signed_off, 2026-01-01 to open; windows: timely filing not stated, dispute not stated, appeal levels none stated):
  - Rate record rr-g24-1: PERCENT_OF_MEDICARE 120%, CURRENT, locality practice, non_qualifying_apm; scope any code; any modifiers; any place of service; 2026-01-01 to open; flags apply_mppr on, apply_assistant_reduction off, apply_sequestration off, apply_ncci off; timed_units_rule PER_CODE; rounding not stated.

| Line | Code | Modifiers | Units | Service date | POS | Charge (cents) | Observed allowed (cents) | PR adjustments (cents) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 97110 | GP | 2 | 2026-03-10 | 11 | 12000 | 4500 (amt_b6) | none |
| 2 | 97530 | GP | 1 | 2026-03-10 | 11 | 7000 | 3200 (amt_b6) | none |

## Steps 1 to 3, per line

### Line 1: 97110 x 2 on 2026-03-10

Step 1, the agreement.
- Mapping map-g24 (contract, 2026-01-01 to open) is in force on 2026-03-10.
- The mapping names contract version cv-g24-1 of contract contract-g24; the version that prices the line is the signed-off one of that contract in force on 2026-03-10:
  - cv-g24-1 (version 1, signed_off, 2026-01-01 to open): signed off and in force.
- Rate records of cv-g24-1 against code 97110, modifier set [GP], place of service 11, 2026-03-10:
  - rr-g24-1 (any code; any modifiers; any place of service; 2026-01-01 to open): matches.
- Rate record rr-g24-1: PERCENT_OF_MEDICARE at 120%, year basis CURRENT, locality basis practice, conversion factor non_qualifying_apm; flags apply_mppr on, apply_assistant_reduction off, apply_sequestration off, apply_ncci off; timed_units_rule PER_CODE; rounding not stated (the practice default applies).

Step 2, the base amount by method.
- Year basis CURRENT: the fee schedule in effect on the date of service, 2026-03-10 (basis year 2026); each value is the record in force on that date.
- pfs_rvu 97110 (year 2026, quarter A, 2026-01-01 to 2026-12-31): work 0.31, PE non-facility 0.71, PE facility 0.21, MP 0.11, status A.
- Place of service 11 is non-facility, so the non-facility practice-expense value applies.
- Locality: practice ZIP 00011 maps to carrier 99999 locality 01 (locality_map in force on 2026-03-10, 2026-01-01 to 2026-12-31).
- pfs_gpci 99999-01 (2026-01-01 to 2026-12-31): work 1.000, PE 0.950, MP 0.650.
- conversion_factor non_qualifying_apm (2026-01-01 to 2026-12-31): $20.0000 per RVU.
- Geographically adjusted RVUs: work 0.31 x 1.000 = 0.31; PE 0.71 x 0.950 = 0.6745; MP 0.11 x 0.650 = 0.0715; total 1.056.
- Fee schedule amount per unit: 1.056 x $20.0000 = $21.12.
- At 120%, per unit: work 744 cents ($7.44), practice expense 1618.8 cents ($16.188), malpractice 171.6 cents ($1.716); total 2534.4 cents ($25.344).

Step 3, units: 2 as billed; 2534.4 cents ($25.344) x 2 = 5068.8 cents ($50.688).

### Line 2: 97530 x 1 on 2026-03-10

Step 1, the agreement.
- Mapping map-g24 (contract, 2026-01-01 to open) is in force on 2026-03-10.
- The mapping names contract version cv-g24-1 of contract contract-g24; the version that prices the line is the signed-off one of that contract in force on 2026-03-10:
  - cv-g24-1 (version 1, signed_off, 2026-01-01 to open): signed off and in force.
- Rate records of cv-g24-1 against code 97530, modifier set [GP], place of service 11, 2026-03-10:
  - rr-g24-1 (any code; any modifiers; any place of service; 2026-01-01 to open): matches.
- Rate record rr-g24-1: PERCENT_OF_MEDICARE at 120%, year basis CURRENT, locality basis practice, conversion factor non_qualifying_apm; flags apply_mppr on, apply_assistant_reduction off, apply_sequestration off, apply_ncci off; timed_units_rule PER_CODE; rounding not stated (the practice default applies).

Step 2, the base amount by method.
- Year basis CURRENT: the fee schedule in effect on the date of service, 2026-03-10 (basis year 2026); each value is the record in force on that date.
- pfs_rvu 97530 (year 2026, quarter A, 2026-01-01 to 2026-12-31): work 0.35, PE non-facility 0.95, PE facility 0.25, MP 0.15, status A.
- Place of service 11 is non-facility, so the non-facility practice-expense value applies.
- Locality: practice ZIP 00011 maps to carrier 99999 locality 01 (locality_map in force on 2026-03-10, 2026-01-01 to 2026-12-31).
- pfs_gpci 99999-01 (2026-01-01 to 2026-12-31): work 1.000, PE 0.950, MP 0.650.
- conversion_factor non_qualifying_apm (2026-01-01 to 2026-12-31): $20.0000 per RVU.
- Geographically adjusted RVUs: work 0.35 x 1.000 = 0.35; PE 0.95 x 0.950 = 0.9025; MP 0.15 x 0.650 = 0.0975; total 1.35.
- Fee schedule amount per unit: 1.35 x $20.0000 = $27.00.
- At 120%, per unit: work 840 cents ($8.40), practice expense 2166 cents ($21.66), malpractice 234 cents ($2.34); total 3240 cents ($32.40).

Step 3, units: 1 as billed; 3240 cents ($32.40) x 1 = 3240 cents ($32.40).

## Step 4a, the multiple procedure reduction, per day

### Multiple procedure reduction on 2026-03-10

Lines with apply_mppr on and a price so far: line 1, line 2. Units are ranked by their practice-expense amount, highest first; ties go to the lower line number, then the earlier unit (fixtures/golden/QUESTIONS.md).
- Line 1 (97110): always therapy, mppr_rate 97110 (2026-01-01 to 2026-12-31): 40%.
- Line 2 (97530): always therapy, mppr_rate 97530 (2026-01-01 to 2026-12-31): 40%.

| Rank | Line | Code | Unit | PE amount per unit (cents) | Treatment | Reduction (cents) |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 2 | 97530 | 1 | 2166 | kept whole | 0 |
| 2 | 1 | 97110 | 1 | 1618.8 | PE reduced by 40% | 1618.8 x 40% = 647.52 |
| 3 | 1 | 97110 | 2 | 1618.8 | PE reduced by 40% | 1618.8 x 40% = 647.52 |

## Steps 4 to 8, per line

### Line 1

Step 4, flagged adjustments in order (multiple procedure reduction, assistant reduction, sequestration).
- assistant_reduction: flag apply_assistant_reduction is off; not applied.
- sequestration: flag apply_sequestration is off; not applied.
- mppr: before 5068.8, after 3773.76; 5068.8 cents ($50.688) - the reductions of its units 1295.04 = 3773.76 cents ($37.7376).
- Contract-specific adjustments: none (phase one rate records define none).

Step 5, patient share: 0 cents ($0.00) from the line's PR adjustments (none); reported beside the expected amount, never subtracted from it.
- Claim status 1 (processed as primary); the claim is not reversed.

Step 6, rounding once: 3773.76 cents under HALF_UP_CENT (the practice default; halves move away from zero) = **3774 cents ($37.74)**; the unrounded 3773.76 is kept beside it.

Step 7, variance: expected allowed 3774 - observed allowed 4500 cents (amt_b6) = -726 cents: an overpayment, recorded and never pursued.

Step 8, dispute window: the remittance date is not known, so no deadline can be worked out: NO_WINDOW on 2026-10-15.

### Line 2

Step 4, flagged adjustments in order (multiple procedure reduction, assistant reduction, sequestration).
- assistant_reduction: flag apply_assistant_reduction is off; not applied.
- sequestration: flag apply_sequestration is off; not applied.
- mppr: before 3240, after 3240; its unit is the day's highest-ranked, kept whole; unchanged.
- Contract-specific adjustments: none (phase one rate records define none).

Step 5, patient share: 0 cents ($0.00) from the line's PR adjustments (none); reported beside the expected amount, never subtracted from it.
- Claim status 1 (processed as primary); the claim is not reversed.

Step 6, rounding once: 3240 cents under HALF_UP_CENT (the practice default; halves move away from zero) = **3240 cents ($32.40)**; the unrounded 3240 is kept beside it.

Step 7, variance: expected allowed 3240 - observed allowed 3200 cents (amt_b6) = 40 cents: an underpayment.

Step 8, dispute window: the remittance date is not known, so no deadline can be worked out: NO_WINDOW on 2026-10-15.

## Results

| Line | Outcome | Expected allowed (cents) | Unrounded (cents) | Rounding | Patient share (cents) | Variance (cents) | Dispute window |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | priced | 3774 | 3773.76 | HALF_UP_CENT | 0 | -726 | NO_WINDOW |
| 2 | priced | 3240 | 3240 | HALF_UP_CENT | 0 | 40 | NO_WINDOW |

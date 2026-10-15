# Worksheet G31: Rounding exact half cents under TRUNCATE

Computed by the independent worksheet tools/golden-worksheet (Python, exact decimal arithmetic; no code shared with packages/pricing).
Specialist verified: no. A reimbursement specialist checks every figure here before milestone 5 closes.
Every reference value comes from SYNTHETIC release 900001: invented for tests, never a CMS value.

## Inputs

- Release 900001 at fixtures/synthetic/rules/release-synth-900001; its MANIFEST.json has SHA-256 6d346c8fa596c0f720ff3176be10044e86c9b4fe843d37b04c59192cdbdce45a and every file matched it.
- Practice settings: ZIP 00011; default rounding HALF_UP_CENT.
- Place-of-service settings (SYNTHETIC test assumption; fixtures/golden/QUESTIONS.md): 11 non-facility; 22 facility.
- Claim SYNTH-CLAIM-G31: status 1 (processed as primary); reversed by a later claim: no; superseded by a correction: no; payer and plan SYNTH-PAYER-1/PLAN-1.
- Remittance date: not known; dispute windows are judged on the triage date 2026-10-15.
- Mapping map-g31: contract, contract version cv-g31-1, 2026-01-01 to open.
- Contract version cv-g31-1 (contract contract-g31, version 1, signed_off, 2026-01-01 to open; windows: timely filing not stated, dispute not stated, appeal levels none stated):
  - Rate record rr-g31-1: PERCENT_OF_MEDICARE 125%, CURRENT, locality practice, non_qualifying_apm; scope any code; any modifiers; any place of service; 2026-01-01 to open; flags apply_mppr off, apply_assistant_reduction off, apply_sequestration off, apply_ncci off; timed_units_rule PER_CODE; rounding TRUNCATE.

| Line | Code | Modifiers | Units | Service date | POS | Charge (cents) | Observed allowed (cents) | PR adjustments (cents) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 97140 | GP | 1 | 2026-03-10 | 11 | 5500 | 3000 (amt_b6) | none |
| 2 | 97112 | GP | 1 | 2026-03-10 | 11 | 6200 | 2400 (amt_b6) | none |

## Steps 1 to 3, per line

### Line 1: 97140 x 1 on 2026-03-10

Step 1, the agreement.
- Mapping map-g31 (contract, 2026-01-01 to open) is in force on 2026-03-10.
- The mapping names contract version cv-g31-1 of contract contract-g31; the version that prices the line is the signed-off one of that contract in force on 2026-03-10:
  - cv-g31-1 (version 1, signed_off, 2026-01-01 to open): signed off and in force.
- Rate records of cv-g31-1 against code 97140, modifier set [GP], place of service 11, 2026-03-10:
  - rr-g31-1 (any code; any modifiers; any place of service; 2026-01-01 to open): matches.
- Rate record rr-g31-1: PERCENT_OF_MEDICARE at 125%, year basis CURRENT, locality basis practice, conversion factor non_qualifying_apm; flags apply_mppr off, apply_assistant_reduction off, apply_sequestration off, apply_ncci off; timed_units_rule PER_CODE; rounding TRUNCATE.

Step 2, the base amount by method.
- Year basis CURRENT: the fee schedule in effect on the date of service, 2026-03-10 (basis year 2026); each value is the record in force on that date.
- pfs_rvu 97140 (year 2026, quarter A, 2026-01-01 to 2026-12-31): work 0.34, PE non-facility 0.84, PE facility 0.24, MP 0.14, status A.
- Place of service 11 is non-facility, so the non-facility practice-expense value applies.
- Locality: practice ZIP 00011 maps to carrier 99999 locality 01 (locality_map in force on 2026-03-10, 2026-01-01 to 2026-12-31).
- pfs_gpci 99999-01 (2026-01-01 to 2026-12-31): work 1.000, PE 0.950, MP 0.650.
- conversion_factor non_qualifying_apm (2026-01-01 to 2026-12-31): $20.0000 per RVU.
- Geographically adjusted RVUs: work 0.34 x 1.000 = 0.34; PE 0.84 x 0.950 = 0.798; MP 0.14 x 0.650 = 0.091; total 1.229.
- Fee schedule amount per unit: 1.229 x $20.0000 = $24.58.
- At 125%, per unit: work 850 cents ($8.50), practice expense 1995 cents ($19.95), malpractice 227.5 cents ($2.275); total 3072.5 cents ($30.725).

Step 3, units: 1 as billed; 3072.5 cents ($30.725) x 1 = 3072.5 cents ($30.725).

### Line 2: 97112 x 1 on 2026-03-10

Step 1, the agreement.
- Mapping map-g31 (contract, 2026-01-01 to open) is in force on 2026-03-10.
- The mapping names contract version cv-g31-1 of contract contract-g31; the version that prices the line is the signed-off one of that contract in force on 2026-03-10:
  - cv-g31-1 (version 1, signed_off, 2026-01-01 to open): signed off and in force.
- Rate records of cv-g31-1 against code 97112, modifier set [GP], place of service 11, 2026-03-10:
  - rr-g31-1 (any code; any modifiers; any place of service; 2026-01-01 to open): matches.
- Rate record rr-g31-1: PERCENT_OF_MEDICARE at 125%, year basis CURRENT, locality basis practice, conversion factor non_qualifying_apm; flags apply_mppr off, apply_assistant_reduction off, apply_sequestration off, apply_ncci off; timed_units_rule PER_CODE; rounding TRUNCATE.

Step 2, the base amount by method.
- Year basis CURRENT: the fee schedule in effect on the date of service, 2026-03-10 (basis year 2026); each value is the record in force on that date.
- pfs_rvu 97112 (year 2026, quarter A, 2026-01-01 to 2026-12-31): work 0.32, PE non-facility 0.62, PE facility 0.22, MP 0.12, status A.
- Place of service 11 is non-facility, so the non-facility practice-expense value applies.
- Locality: practice ZIP 00011 maps to carrier 99999 locality 01 (locality_map in force on 2026-03-10, 2026-01-01 to 2026-12-31).
- pfs_gpci 99999-01 (2026-01-01 to 2026-12-31): work 1.000, PE 0.950, MP 0.650.
- conversion_factor non_qualifying_apm (2026-01-01 to 2026-12-31): $20.0000 per RVU.
- Geographically adjusted RVUs: work 0.32 x 1.000 = 0.32; PE 0.62 x 0.950 = 0.589; MP 0.12 x 0.650 = 0.078; total 0.987.
- Fee schedule amount per unit: 0.987 x $20.0000 = $19.74.
- At 125%, per unit: work 800 cents ($8.00), practice expense 1472.5 cents ($14.725), malpractice 195 cents ($1.95); total 2467.5 cents ($24.675).

Step 3, units: 1 as billed; 2467.5 cents ($24.675) x 1 = 2467.5 cents ($24.675).

## Steps 4 to 8, per line

### Line 1

Step 4, flagged adjustments in order (multiple procedure reduction, assistant reduction, sequestration).
- mppr: flag apply_mppr is off; not applied.
- assistant_reduction: flag apply_assistant_reduction is off; not applied.
- sequestration: flag apply_sequestration is off; not applied.
- Contract-specific adjustments: none (phase one rate records define none).

Step 5, patient share: 0 cents ($0.00) from the line's PR adjustments (none); reported beside the expected amount, never subtracted from it.
- Claim status 1 (processed as primary); the claim is not reversed.

Step 6, rounding once: 3072.5 cents under TRUNCATE (the rate record's rule; fractions of a cent are dropped toward zero) = **3072 cents ($30.72)**; the unrounded 3072.5 is kept beside it.

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

Step 6, rounding once: 2467.5 cents under TRUNCATE (the rate record's rule; fractions of a cent are dropped toward zero) = **2467 cents ($24.67)**; the unrounded 2467.5 is kept beside it.

Step 7, variance: expected allowed 2467 - observed allowed 2400 cents (amt_b6) = 67 cents: an underpayment.

Step 8, dispute window: the remittance date is not known, so no deadline can be worked out: NO_WINDOW on 2026-10-15.

## Results

| Line | Outcome | Expected allowed (cents) | Unrounded (cents) | Rounding | Patient share (cents) | Variance (cents) | Dispute window |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | priced | 3072 | 3072.5 | TRUNCATE | 0 | 72 | NO_WINDOW |
| 2 | priced | 2467 | 2467.5 | TRUNCATE | 0 | 67 | NO_WINDOW |

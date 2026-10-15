# Worksheet G08: Commercial 100% of Medicare with the qualifying-APM conversion factor named by the record

Computed by the independent worksheet tools/golden-worksheet (Python, exact decimal arithmetic; no code shared with packages/pricing).
Specialist verified: no. A reimbursement specialist checks every figure here before milestone 5 closes.
Every reference value comes from SYNTHETIC release 900001: invented for tests, never a CMS value.

## Inputs

- Release 900001 at fixtures/synthetic/rules/release-synth-900001; its MANIFEST.json has SHA-256 6d346c8fa596c0f720ff3176be10044e86c9b4fe843d37b04c59192cdbdce45a and every file matched it.
- Practice settings: ZIP 00011; default rounding HALF_UP_CENT.
- Place-of-service settings (SYNTHETIC test assumption; fixtures/golden/QUESTIONS.md): 11 non-facility; 22 facility.
- Claim SYNTH-CLAIM-G08: status 1 (processed as primary); reversed by a later claim: no; superseded by a correction: no; payer and plan SYNTH-PAYER-1/PLAN-1.
- Mapping map-g08: contract, contract version cv-g08-1, 2026-01-01 to open.
- Contract version cv-g08-1 (contract contract-g08, version 1, signed_off, 2026-01-01 to open):
  - Rate record rr-g08-1: PERCENT_OF_MEDICARE 100%, CURRENT, locality practice, qualifying_apm; scope any code; any modifiers; any place of service; 2026-01-01 to open; flags apply_mppr off, apply_assistant_reduction off, apply_sequestration off, apply_ncci off; timed_units_rule PER_CODE; rounding not stated.

| Line | Code | Modifiers | Units | Service date | POS | Charge (cents) | Observed allowed (cents) | PR adjustments (cents) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 97110 | GP | 1 | 2026-03-10 | 11 | 6000 | 2100 (amt_b6) | none |
| 2 | 97140 | GP | 2 | 2026-03-10 | 11 | 11000 | 4900 (amt_b6) | none |

## Steps 1 to 3, per line

### Line 1: 97110 x 1 on 2026-03-10

Step 1, the agreement.
- Mapping map-g08 (contract, 2026-01-01 to open) is in force on 2026-03-10.
- The mapping names contract version cv-g08-1 of contract contract-g08; the version that prices the line is the signed-off one of that contract in force on 2026-03-10:
  - cv-g08-1 (version 1, signed_off, 2026-01-01 to open): signed off and in force.
- Rate records of cv-g08-1 against code 97110, modifier set [GP], place of service 11, 2026-03-10:
  - rr-g08-1 (any code; any modifiers; any place of service; 2026-01-01 to open): matches.
- Rate record rr-g08-1: PERCENT_OF_MEDICARE at 100%, year basis CURRENT, locality basis practice, conversion factor qualifying_apm; flags apply_mppr off, apply_assistant_reduction off, apply_sequestration off, apply_ncci off; timed_units_rule PER_CODE; rounding not stated (the practice default applies).

Step 2, the base amount by method.
- Year basis CURRENT: the fee schedule in effect on the date of service, 2026-03-10 (basis year 2026); each value is the record in force on that date.
- pfs_rvu 97110 (year 2026, quarter A, 2026-01-01 to 2026-12-31): work 0.31, PE non-facility 0.71, PE facility 0.21, MP 0.11, status A.
- Place of service 11 is non-facility, so the non-facility practice-expense value applies.
- Locality: practice ZIP 00011 maps to carrier 99999 locality 01 (locality_map in force on 2026-03-10, 2026-01-01 to 2026-12-31).
- pfs_gpci 99999-01 (2026-01-01 to 2026-12-31): work 1.000, PE 0.950, MP 0.650.
- conversion_factor qualifying_apm (2026-01-01 to 2026-12-31): $20.1000 per RVU.
- Geographically adjusted RVUs: work 0.31 x 1.000 = 0.31; PE 0.71 x 0.950 = 0.6745; MP 0.11 x 0.650 = 0.0715; total 1.056.
- Fee schedule amount per unit: 1.056 x $20.1000 = $21.2256.
- At 100%, per unit: work 623.1 cents ($6.231), practice expense 1355.745 cents ($13.55745), malpractice 143.715 cents ($1.43715); total 2122.56 cents ($21.2256).

Step 3, units: 1 as billed; 2122.56 cents ($21.2256) x 1 = 2122.56 cents ($21.2256).

### Line 2: 97140 x 2 on 2026-03-10

Step 1, the agreement.
- Mapping map-g08 (contract, 2026-01-01 to open) is in force on 2026-03-10.
- The mapping names contract version cv-g08-1 of contract contract-g08; the version that prices the line is the signed-off one of that contract in force on 2026-03-10:
  - cv-g08-1 (version 1, signed_off, 2026-01-01 to open): signed off and in force.
- Rate records of cv-g08-1 against code 97140, modifier set [GP], place of service 11, 2026-03-10:
  - rr-g08-1 (any code; any modifiers; any place of service; 2026-01-01 to open): matches.
- Rate record rr-g08-1: PERCENT_OF_MEDICARE at 100%, year basis CURRENT, locality basis practice, conversion factor qualifying_apm; flags apply_mppr off, apply_assistant_reduction off, apply_sequestration off, apply_ncci off; timed_units_rule PER_CODE; rounding not stated (the practice default applies).

Step 2, the base amount by method.
- Year basis CURRENT: the fee schedule in effect on the date of service, 2026-03-10 (basis year 2026); each value is the record in force on that date.
- pfs_rvu 97140 (year 2026, quarter A, 2026-01-01 to 2026-12-31): work 0.34, PE non-facility 0.84, PE facility 0.24, MP 0.14, status A.
- Place of service 11 is non-facility, so the non-facility practice-expense value applies.
- Locality: practice ZIP 00011 maps to carrier 99999 locality 01 (locality_map in force on 2026-03-10, 2026-01-01 to 2026-12-31).
- pfs_gpci 99999-01 (2026-01-01 to 2026-12-31): work 1.000, PE 0.950, MP 0.650.
- conversion_factor qualifying_apm (2026-01-01 to 2026-12-31): $20.1000 per RVU.
- Geographically adjusted RVUs: work 0.34 x 1.000 = 0.34; PE 0.84 x 0.950 = 0.798; MP 0.14 x 0.650 = 0.091; total 1.229.
- Fee schedule amount per unit: 1.229 x $20.1000 = $24.7029.
- At 100%, per unit: work 683.4 cents ($6.834), practice expense 1603.98 cents ($16.0398), malpractice 182.91 cents ($1.8291); total 2470.29 cents ($24.7029).

Step 3, units: 2 as billed; 2470.29 cents ($24.7029) x 2 = 4940.58 cents ($49.4058).

## Steps 4 to 6, per line

### Line 1

Step 4, flagged adjustments in order (multiple procedure reduction, assistant reduction, sequestration).
- mppr: flag apply_mppr is off; not applied.
- assistant_reduction: flag apply_assistant_reduction is off; not applied.
- sequestration: flag apply_sequestration is off; not applied.
- Contract-specific adjustments: none (phase one rate records define none).

Step 5, patient share: 0 cents ($0.00) from the line's PR adjustments (none); reported beside the expected amount, never subtracted from it.
- Claim status 1 (processed as primary); the claim is not reversed.

Step 6, rounding once: 2122.56 cents under HALF_UP_CENT (the practice default; halves move away from zero) = **2123 cents ($21.23)**; the unrounded 2122.56 is kept beside it.

### Line 2

Step 4, flagged adjustments in order (multiple procedure reduction, assistant reduction, sequestration).
- mppr: flag apply_mppr is off; not applied.
- assistant_reduction: flag apply_assistant_reduction is off; not applied.
- sequestration: flag apply_sequestration is off; not applied.
- Contract-specific adjustments: none (phase one rate records define none).

Step 5, patient share: 0 cents ($0.00) from the line's PR adjustments (none); reported beside the expected amount, never subtracted from it.
- Claim status 1 (processed as primary); the claim is not reversed.

Step 6, rounding once: 4940.58 cents under HALF_UP_CENT (the practice default; halves move away from zero) = **4941 cents ($49.41)**; the unrounded 4940.58 is kept beside it.

## Results

| Line | Outcome | Expected allowed (cents) | Unrounded (cents) | Rounding | Patient share (cents) |
| --- | --- | --- | --- | --- | --- |
| 1 | priced | 2123 | 2122.56 | HALF_UP_CENT | 0 |
| 2 | priced | 4941 | 4940.58 | HALF_UP_CENT | 0 |

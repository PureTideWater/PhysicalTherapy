# Worksheet G02: PRD 11 worked example under a commercial contract at 110% of Medicare, flags off

Computed by the independent worksheet tools/golden-worksheet (Python, exact decimal arithmetic; no code shared with packages/pricing).
Specialist verified: no. A reimbursement specialist checks every figure here before milestone 5 closes.
Every reference value comes from SYNTHETIC release 900001: invented for tests, never a CMS value.

## Inputs

- Release 900001 at fixtures/synthetic/rules/release-synth-900001; its MANIFEST.json has SHA-256 6d346c8fa596c0f720ff3176be10044e86c9b4fe843d37b04c59192cdbdce45a and every file matched it.
- Practice settings: ZIP 00011; default rounding HALF_UP_CENT.
- Place-of-service settings (SYNTHETIC test assumption; fixtures/golden/QUESTIONS.md): 11 non-facility; 22 facility.
- Claim SYNTH-CLAIM-G02: status 1 (processed as primary); reversed by a later claim: no; superseded by a correction: no; payer and plan SYNTH-PAYER-1/PLAN-1.
- Remittance date: not known; dispute windows are judged on the triage date 2026-10-15.
- Mapping map-g02: contract, contract version cv-g02-1, 2026-01-01 to open.
- Contract version cv-g02-1 (contract contract-g02, version 1, signed_off, 2026-01-01 to open; windows: timely filing not stated, dispute not stated, appeal levels none stated):
  - Rate record rr-g02-1: PERCENT_OF_MEDICARE 110%, CURRENT, locality practice, non_qualifying_apm; scope any code; any modifiers; any place of service; 2026-01-01 to open; flags apply_mppr off, apply_assistant_reduction off, apply_sequestration off, apply_ncci off; timed_units_rule PER_CODE; rounding not stated.

| Line | Code | Modifiers | Units | Service date | POS | Charge (cents) | Observed allowed (cents) | PR adjustments (cents) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 97110 | GP | 2 | 2026-03-10 | 11 | 12000 | 4200 (amt_b6) | PR-2 840 |
| 2 | 97140 | GP | 1 | 2026-03-10 | 11 | 5500 | 2400 (amt_b6) | PR-2 480 |
| 3 | 97530 | GP | 1 | 2026-03-10 | 11 | 7000 | 2650 (amt_b6) | none |

## Steps 1 to 3, per line

### Line 1: 97110 x 2 on 2026-03-10

Step 1, the agreement.
- Mapping map-g02 (contract, 2026-01-01 to open) is in force on 2026-03-10.
- The mapping names contract version cv-g02-1 of contract contract-g02; the version that prices the line is the signed-off one of that contract in force on 2026-03-10:
  - cv-g02-1 (version 1, signed_off, 2026-01-01 to open): signed off and in force.
- Rate records of cv-g02-1 against code 97110, modifier set [GP], place of service 11, 2026-03-10:
  - rr-g02-1 (any code; any modifiers; any place of service; 2026-01-01 to open): matches.
- Rate record rr-g02-1: PERCENT_OF_MEDICARE at 110%, year basis CURRENT, locality basis practice, conversion factor non_qualifying_apm; flags apply_mppr off, apply_assistant_reduction off, apply_sequestration off, apply_ncci off; timed_units_rule PER_CODE; rounding not stated (the practice default applies).

Step 2, the base amount by method.
- Year basis CURRENT: the fee schedule in effect on the date of service, 2026-03-10 (basis year 2026); each value is the record in force on that date.
- pfs_rvu 97110 (year 2026, quarter A, 2026-01-01 to 2026-12-31): work 0.31, PE non-facility 0.71, PE facility 0.21, MP 0.11, status A.
- Place of service 11 is non-facility, so the non-facility practice-expense value applies.
- Locality: practice ZIP 00011 maps to carrier 99999 locality 01 (locality_map in force on 2026-03-10, 2026-01-01 to 2026-12-31).
- pfs_gpci 99999-01 (2026-01-01 to 2026-12-31): work 1.000, PE 0.950, MP 0.650.
- conversion_factor non_qualifying_apm (2026-01-01 to 2026-12-31): $20.0000 per RVU.
- Geographically adjusted RVUs: work 0.31 x 1.000 = 0.31; PE 0.71 x 0.950 = 0.6745; MP 0.11 x 0.650 = 0.0715; total 1.056.
- Fee schedule amount per unit: 1.056 x $20.0000 = $21.12.
- At 110%, per unit: work 682 cents ($6.82), practice expense 1483.9 cents ($14.839), malpractice 157.3 cents ($1.573); total 2323.2 cents ($23.232).

Step 3, units: 2 as billed; 2323.2 cents ($23.232) x 2 = 4646.4 cents ($46.464).

### Line 2: 97140 x 1 on 2026-03-10

Step 1, the agreement.
- Mapping map-g02 (contract, 2026-01-01 to open) is in force on 2026-03-10.
- The mapping names contract version cv-g02-1 of contract contract-g02; the version that prices the line is the signed-off one of that contract in force on 2026-03-10:
  - cv-g02-1 (version 1, signed_off, 2026-01-01 to open): signed off and in force.
- Rate records of cv-g02-1 against code 97140, modifier set [GP], place of service 11, 2026-03-10:
  - rr-g02-1 (any code; any modifiers; any place of service; 2026-01-01 to open): matches.
- Rate record rr-g02-1: PERCENT_OF_MEDICARE at 110%, year basis CURRENT, locality basis practice, conversion factor non_qualifying_apm; flags apply_mppr off, apply_assistant_reduction off, apply_sequestration off, apply_ncci off; timed_units_rule PER_CODE; rounding not stated (the practice default applies).

Step 2, the base amount by method.
- Year basis CURRENT: the fee schedule in effect on the date of service, 2026-03-10 (basis year 2026); each value is the record in force on that date.
- pfs_rvu 97140 (year 2026, quarter A, 2026-01-01 to 2026-12-31): work 0.34, PE non-facility 0.84, PE facility 0.24, MP 0.14, status A.
- Place of service 11 is non-facility, so the non-facility practice-expense value applies.
- Locality: practice ZIP 00011 maps to carrier 99999 locality 01 (locality_map in force on 2026-03-10, 2026-01-01 to 2026-12-31).
- pfs_gpci 99999-01 (2026-01-01 to 2026-12-31): work 1.000, PE 0.950, MP 0.650.
- conversion_factor non_qualifying_apm (2026-01-01 to 2026-12-31): $20.0000 per RVU.
- Geographically adjusted RVUs: work 0.34 x 1.000 = 0.34; PE 0.84 x 0.950 = 0.798; MP 0.14 x 0.650 = 0.091; total 1.229.
- Fee schedule amount per unit: 1.229 x $20.0000 = $24.58.
- At 110%, per unit: work 748 cents ($7.48), practice expense 1755.6 cents ($17.556), malpractice 200.2 cents ($2.002); total 2703.8 cents ($27.038).

Step 3, units: 1 as billed; 2703.8 cents ($27.038) x 1 = 2703.8 cents ($27.038).

### Line 3: 97530 x 1 on 2026-03-10

Step 1, the agreement.
- Mapping map-g02 (contract, 2026-01-01 to open) is in force on 2026-03-10.
- The mapping names contract version cv-g02-1 of contract contract-g02; the version that prices the line is the signed-off one of that contract in force on 2026-03-10:
  - cv-g02-1 (version 1, signed_off, 2026-01-01 to open): signed off and in force.
- Rate records of cv-g02-1 against code 97530, modifier set [GP], place of service 11, 2026-03-10:
  - rr-g02-1 (any code; any modifiers; any place of service; 2026-01-01 to open): matches.
- Rate record rr-g02-1: PERCENT_OF_MEDICARE at 110%, year basis CURRENT, locality basis practice, conversion factor non_qualifying_apm; flags apply_mppr off, apply_assistant_reduction off, apply_sequestration off, apply_ncci off; timed_units_rule PER_CODE; rounding not stated (the practice default applies).

Step 2, the base amount by method.
- Year basis CURRENT: the fee schedule in effect on the date of service, 2026-03-10 (basis year 2026); each value is the record in force on that date.
- pfs_rvu 97530 (year 2026, quarter A, 2026-01-01 to 2026-12-31): work 0.35, PE non-facility 0.95, PE facility 0.25, MP 0.15, status A.
- Place of service 11 is non-facility, so the non-facility practice-expense value applies.
- Locality: practice ZIP 00011 maps to carrier 99999 locality 01 (locality_map in force on 2026-03-10, 2026-01-01 to 2026-12-31).
- pfs_gpci 99999-01 (2026-01-01 to 2026-12-31): work 1.000, PE 0.950, MP 0.650.
- conversion_factor non_qualifying_apm (2026-01-01 to 2026-12-31): $20.0000 per RVU.
- Geographically adjusted RVUs: work 0.35 x 1.000 = 0.35; PE 0.95 x 0.950 = 0.9025; MP 0.15 x 0.650 = 0.0975; total 1.35.
- Fee schedule amount per unit: 1.35 x $20.0000 = $27.00.
- At 110%, per unit: work 770 cents ($7.70), practice expense 1985.5 cents ($19.855), malpractice 214.5 cents ($2.145); total 2970 cents ($29.70).

Step 3, units: 1 as billed; 2970 cents ($29.70) x 1 = 2970 cents ($29.70).

## Steps 4 to 8, per line

### Line 1

Step 4, flagged adjustments in order (multiple procedure reduction, assistant reduction, sequestration).
- mppr: flag apply_mppr is off; not applied.
- assistant_reduction: flag apply_assistant_reduction is off; not applied.
- sequestration: flag apply_sequestration is off; not applied.
- Contract-specific adjustments: none (phase one rate records define none).

Step 5, patient share: 840 cents ($8.40) from the line's PR adjustments (PR-2 840); reported beside the expected amount, never subtracted from it.
- Claim status 1 (processed as primary); the claim is not reversed.

Step 6, rounding once: 4646.4 cents under HALF_UP_CENT (the practice default; halves move away from zero) = **4646 cents ($46.46)**; the unrounded 4646.4 is kept beside it.

Step 7, variance: expected allowed 4646 - observed allowed 4200 cents (amt_b6) = 446 cents: an underpayment.

Step 8, dispute window: the remittance date is not known, so no deadline can be worked out: NO_WINDOW on 2026-10-15.

### Line 2

Step 4, flagged adjustments in order (multiple procedure reduction, assistant reduction, sequestration).
- mppr: flag apply_mppr is off; not applied.
- assistant_reduction: flag apply_assistant_reduction is off; not applied.
- sequestration: flag apply_sequestration is off; not applied.
- Contract-specific adjustments: none (phase one rate records define none).

Step 5, patient share: 480 cents ($4.80) from the line's PR adjustments (PR-2 480); reported beside the expected amount, never subtracted from it.
- Claim status 1 (processed as primary); the claim is not reversed.

Step 6, rounding once: 2703.8 cents under HALF_UP_CENT (the practice default; halves move away from zero) = **2704 cents ($27.04)**; the unrounded 2703.8 is kept beside it.

Step 7, variance: expected allowed 2704 - observed allowed 2400 cents (amt_b6) = 304 cents: an underpayment.

Step 8, dispute window: the remittance date is not known, so no deadline can be worked out: NO_WINDOW on 2026-10-15.

### Line 3

Step 4, flagged adjustments in order (multiple procedure reduction, assistant reduction, sequestration).
- mppr: flag apply_mppr is off; not applied.
- assistant_reduction: flag apply_assistant_reduction is off; not applied.
- sequestration: flag apply_sequestration is off; not applied.
- Contract-specific adjustments: none (phase one rate records define none).

Step 5, patient share: 0 cents ($0.00) from the line's PR adjustments (none); reported beside the expected amount, never subtracted from it.
- Claim status 1 (processed as primary); the claim is not reversed.

Step 6, rounding once: 2970 cents under HALF_UP_CENT (the practice default; halves move away from zero) = **2970 cents ($29.70)**; the unrounded 2970 is kept beside it.

Step 7, variance: expected allowed 2970 - observed allowed 2650 cents (amt_b6) = 320 cents: an underpayment.

Step 8, dispute window: the remittance date is not known, so no deadline can be worked out: NO_WINDOW on 2026-10-15.

## Results

| Line | Outcome | Expected allowed (cents) | Unrounded (cents) | Rounding | Patient share (cents) | Variance (cents) | Dispute window |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | priced | 4646 | 4646.4 | HALF_UP_CENT | 840 | 446 | NO_WINDOW |
| 2 | priced | 2704 | 2703.8 | HALF_UP_CENT | 480 | 304 | NO_WINDOW |
| 3 | priced | 2970 | 2970 | HALF_UP_CENT | 0 | 320 | NO_WINDOW |

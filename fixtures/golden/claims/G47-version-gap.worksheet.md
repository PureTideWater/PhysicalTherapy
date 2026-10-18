# Worksheet G47: A gap between two signed-off versions

Computed by the independent worksheet tools/golden-worksheet (Python, exact decimal arithmetic; no code shared with packages/pricing).
Specialist verified: no. A reimbursement specialist checks every figure here before milestones 5 and 7 close.
Every reference value comes from SYNTHETIC release 900001: invented for tests, never a CMS value.

## Inputs

- Release 900001 at fixtures/synthetic/rules/release-synth-900001; its MANIFEST.json has SHA-256 6d346c8fa596c0f720ff3176be10044e86c9b4fe843d37b04c59192cdbdce45a and every file matched it.
- Practice settings: ZIP 00011; default rounding HALF_UP_CENT.
- Place-of-service settings (SYNTHETIC test assumption; fixtures/golden/QUESTIONS.md): 11 non-facility; 22 facility.
- Claim SYNTH-CLAIM-G47: status 1 (processed as primary); reversed by a later claim: no; superseded by a correction: no; payer and plan SYNTH-PAYER-1/PLAN-1.
- Remittance date: not known; dispute windows are judged on the triage date 2026-10-15.
- Mapping map-g47: contract, contract version cv-g47-1, 2026-01-01 to open.
- Contract version cv-g47-1 (contract contract-g47, version 1, signed_off, 2026-01-01 to 2026-03-31; windows: timely filing not stated, dispute not stated, appeal levels none stated):
  - Rate record rr-g47-1: PERCENT_OF_MEDICARE at 110%, year basis CURRENT, locality basis practice, conversion factor non_qualifying_apm; scope any code; any modifiers; any place of service; 2026-01-01 to open; flags apply_mppr off, apply_assistant_reduction off, apply_sequestration off, apply_ncci off; timed_units_rule PER_CODE; rounding not stated; contract-specific adjustment none.
- Contract version cv-g47-2 (contract contract-g47, version 2, signed_off, 2026-05-01 to open; windows: timely filing not stated, dispute not stated, appeal levels none stated):
  - Rate record rr-g47-2: PERCENT_OF_MEDICARE at 115%, year basis CURRENT, locality basis practice, conversion factor non_qualifying_apm; scope any code; any modifiers; any place of service; 2026-05-01 to open; flags apply_mppr off, apply_assistant_reduction off, apply_sequestration off, apply_ncci off; timed_units_rule PER_CODE; rounding not stated; contract-specific adjustment none.

| Line | Code | Modifiers | Units | Service date | POS | Charge (cents) | Observed allowed (cents) | PR adjustments (cents) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 97110 | GP | 1 | 2026-03-10 | 11 | 6000 | 2300 (amt_b6) | none |
| 2 | 97110 | GP | 1 | 2026-04-15 | 11 | 6000 | 2300 (amt_b6) | none |
| 3 | 97110 | GP | 1 | 2026-05-12 | 11 | 6000 | 2300 (amt_b6) | none |

## Steps 1 to 3, per line

### Line 1: 97110 x 1 on 2026-03-10

Step 1, the agreement.
- Mapping map-g47 (contract, 2026-01-01 to open) is in force on 2026-03-10.
- The mapping names contract version cv-g47-1 of contract contract-g47; the version that prices the line is the signed-off one of that contract in force on 2026-03-10:
  - cv-g47-1 (version 1, signed_off, 2026-01-01 to 2026-03-31): signed off and in force.
  - cv-g47-2 (version 2, signed_off, 2026-05-01 to open): outside its window.
- Rate records of cv-g47-1 against code 97110, modifier set [GP], place of service 11, 2026-03-10:
  - rr-g47-1 (any code; any modifiers; any place of service; 2026-01-01 to open): matches.
- Rate record rr-g47-1: PERCENT_OF_MEDICARE at 110%, year basis CURRENT, locality basis practice, conversion factor non_qualifying_apm; flags apply_mppr off, apply_assistant_reduction off, apply_sequestration off, apply_ncci off; timed_units_rule PER_CODE; rounding not stated (the practice default applies); contract-specific adjustment: none.

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

Step 3, units and edits.
- Units: 1 as billed, under the timed-units rule PER_CODE, recorded: until minute logs are imported the units are taken as billed (PRD 2 point 6).
- Medically unlikely edit: apply_ncci is off; not checked.
- Base: 2323.2 cents ($23.232) x 1 = 2323.2 cents ($23.232).
- Procedure-to-procedure edits: apply_ncci is off; not checked.

### Line 2: 97110 x 1 on 2026-04-15

Step 1, the agreement.
- Mapping map-g47 (contract, 2026-01-01 to open) is in force on 2026-04-15.
- The mapping names contract version cv-g47-1 of contract contract-g47; the version that prices the line is the signed-off one of that contract in force on 2026-04-15:
  - cv-g47-1 (version 1, signed_off, 2026-01-01 to 2026-03-31): outside its window.
  - cv-g47-2 (version 2, signed_off, 2026-05-01 to open): outside its window.
- **Unpriced: `DATE_OUTSIDE_VERSIONS`.** No signed-off version of contract contract-g47 covers 2026-04-15.

### Line 3: 97110 x 1 on 2026-05-12

Step 1, the agreement.
- Mapping map-g47 (contract, 2026-01-01 to open) is in force on 2026-05-12.
- The mapping names contract version cv-g47-1 of contract contract-g47; the version that prices the line is the signed-off one of that contract in force on 2026-05-12:
  - cv-g47-1 (version 1, signed_off, 2026-01-01 to 2026-03-31): outside its window.
  - cv-g47-2 (version 2, signed_off, 2026-05-01 to open): signed off and in force.
- Rate records of cv-g47-2 against code 97110, modifier set [GP], place of service 11, 2026-05-12:
  - rr-g47-2 (any code; any modifiers; any place of service; 2026-05-01 to open): matches.
- Rate record rr-g47-2: PERCENT_OF_MEDICARE at 115%, year basis CURRENT, locality basis practice, conversion factor non_qualifying_apm; flags apply_mppr off, apply_assistant_reduction off, apply_sequestration off, apply_ncci off; timed_units_rule PER_CODE; rounding not stated (the practice default applies); contract-specific adjustment: none.

Step 2, the base amount by method.
- Year basis CURRENT: the fee schedule in effect on the date of service, 2026-05-12 (basis year 2026); each value is the record in force on that date.
- pfs_rvu 97110 (year 2026, quarter A, 2026-01-01 to 2026-12-31): work 0.31, PE non-facility 0.71, PE facility 0.21, MP 0.11, status A.
- Place of service 11 is non-facility, so the non-facility practice-expense value applies.
- Locality: practice ZIP 00011 maps to carrier 99999 locality 01 (locality_map in force on 2026-05-12, 2026-01-01 to 2026-12-31).
- pfs_gpci 99999-01 (2026-01-01 to 2026-12-31): work 1.000, PE 0.950, MP 0.650.
- conversion_factor non_qualifying_apm (2026-01-01 to 2026-12-31): $20.0000 per RVU.
- Geographically adjusted RVUs: work 0.31 x 1.000 = 0.31; PE 0.71 x 0.950 = 0.6745; MP 0.11 x 0.650 = 0.0715; total 1.056.
- Fee schedule amount per unit: 1.056 x $20.0000 = $21.12.
- At 115%, per unit: work 713 cents ($7.13), practice expense 1551.35 cents ($15.5135), malpractice 164.45 cents ($1.6445); total 2428.8 cents ($24.288).

Step 3, units and edits.
- Units: 1 as billed, under the timed-units rule PER_CODE, recorded: until minute logs are imported the units are taken as billed (PRD 2 point 6).
- Medically unlikely edit: apply_ncci is off; not checked.
- Base: 2428.8 cents ($24.288) x 1 = 2428.8 cents ($24.288).
- Procedure-to-procedure edits: apply_ncci is off; not checked.

## Steps 4 to 8, per line

### Line 1

Step 4, adjustments in order: the multiple procedure reduction, the assistant reduction and sequestration where their flags are on, then the rate record's own.
- mppr: flag apply_mppr is off; not applied.
- assistant_reduction: flag apply_assistant_reduction is off; not applied.
- sequestration: flag apply_sequestration is off; not applied.
- contract_adjustment: the rate record defines none; not applied.

Step 5, patient share: 0 cents ($0.00) from the line's PR adjustments (none); reported beside the expected amount, never subtracted from it.
- Claim status 1 (processed as primary); the claim is not reversed.

Step 6, rounding once: 2323.2 cents under HALF_UP_CENT (the practice default; halves move away from zero) = **2323 cents ($23.23)**; the unrounded 2323.2 is kept beside it.

Step 7, variance: expected allowed 2323 - observed allowed 2300 cents (amt_b6) = 23 cents: an underpayment.

Step 8, dispute window: the remittance date is not known, so no deadline can be worked out: NO_WINDOW on 2026-10-15.

### Line 3

Step 4, adjustments in order: the multiple procedure reduction, the assistant reduction and sequestration where their flags are on, then the rate record's own.
- mppr: flag apply_mppr is off; not applied.
- assistant_reduction: flag apply_assistant_reduction is off; not applied.
- sequestration: flag apply_sequestration is off; not applied.
- contract_adjustment: the rate record defines none; not applied.

Step 5, patient share: 0 cents ($0.00) from the line's PR adjustments (none); reported beside the expected amount, never subtracted from it.
- Claim status 1 (processed as primary); the claim is not reversed.

Step 6, rounding once: 2428.8 cents under HALF_UP_CENT (the practice default; halves move away from zero) = **2429 cents ($24.29)**; the unrounded 2428.8 is kept beside it.

Step 7, variance: expected allowed 2429 - observed allowed 2300 cents (amt_b6) = 129 cents: an underpayment.

Step 8, dispute window: the remittance date is not known, so no deadline can be worked out: NO_WINDOW on 2026-10-15.

## Results

| Line | Outcome | Expected allowed (cents) | Unrounded (cents) | Rounding | Patient share (cents) | Variance (cents) | Dispute window | Review flags |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | priced | 2323 | 2323.2 | HALF_UP_CENT | 0 | 23 | NO_WINDOW | none |
| 2 | unpriced `DATE_OUTSIDE_VERSIONS` | | | | | | | |
| 3 | priced | 2429 | 2428.8 | HALF_UP_CENT | 0 | 129 | NO_WINDOW | none |

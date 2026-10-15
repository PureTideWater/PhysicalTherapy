# Worksheet G10: Commercial 105% of the current fee schedule, from a release holding 2025 and 2026

Computed by the independent worksheet tools/golden-worksheet (Python, exact decimal arithmetic; no code shared with packages/pricing).
Specialist verified: no. A reimbursement specialist checks every figure here before milestone 5 closes.
Every reference value comes from SYNTHETIC release 900002: invented for tests, never a CMS value.

## Inputs

- Release 900002 at fixtures/synthetic/rules/release-synth-900002; its MANIFEST.json has SHA-256 ac9b17c76f65ffe83be6bb543fb91349efa7470231d888e34e75fbfc3000ac52 and every file matched it.
- Practice settings: ZIP 00011; default rounding HALF_UP_CENT.
- Place-of-service settings (SYNTHETIC test assumption; fixtures/golden/QUESTIONS.md): 11 non-facility; 22 facility.
- Claim SYNTH-CLAIM-G10: status 1 (processed as primary); reversed by a later claim: no; superseded by a correction: no; payer and plan SYNTH-PAYER-1/PLAN-1.
- Remittance date: not known; dispute windows are judged on the triage date 2026-10-15.
- Mapping map-g10: contract, contract version cv-g10-1, 2026-01-01 to open.
- Contract version cv-g10-1 (contract contract-g10, version 1, signed_off, 2026-01-01 to open; windows: timely filing not stated, dispute not stated, appeal levels none stated):
  - Rate record rr-g10-1: PERCENT_OF_MEDICARE 105%, CURRENT, locality practice, non_qualifying_apm; scope any code; any modifiers; any place of service; 2026-01-01 to open; flags apply_mppr off, apply_assistant_reduction off, apply_sequestration off, apply_ncci off; timed_units_rule PER_CODE; rounding not stated.

| Line | Code | Modifiers | Units | Service date | POS | Charge (cents) | Observed allowed (cents) | PR adjustments (cents) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 97110 | GP | 2 | 2026-04-14 | 11 | 12000 | 4400 (amt_b6) | none |
| 2 | 97530 | GP | 1 | 2026-04-14 | 11 | 7000 | 2800 (amt_b6) | none |

## Steps 1 to 3, per line

### Line 1: 97110 x 2 on 2026-04-14

Step 1, the agreement.
- Mapping map-g10 (contract, 2026-01-01 to open) is in force on 2026-04-14.
- The mapping names contract version cv-g10-1 of contract contract-g10; the version that prices the line is the signed-off one of that contract in force on 2026-04-14:
  - cv-g10-1 (version 1, signed_off, 2026-01-01 to open): signed off and in force.
- Rate records of cv-g10-1 against code 97110, modifier set [GP], place of service 11, 2026-04-14:
  - rr-g10-1 (any code; any modifiers; any place of service; 2026-01-01 to open): matches.
- Rate record rr-g10-1: PERCENT_OF_MEDICARE at 105%, year basis CURRENT, locality basis practice, conversion factor non_qualifying_apm; flags apply_mppr off, apply_assistant_reduction off, apply_sequestration off, apply_ncci off; timed_units_rule PER_CODE; rounding not stated (the practice default applies).

Step 2, the base amount by method.
- Year basis CURRENT: the fee schedule in effect on the date of service, 2026-04-14 (basis year 2026); each value is the record in force on that date.
- pfs_rvu 97110 (year 2026, quarter A, 2026-01-01 to 2026-12-31): work 0.31, PE non-facility 0.71, PE facility 0.21, MP 0.11, status A.
- Place of service 11 is non-facility, so the non-facility practice-expense value applies.
- Locality: practice ZIP 00011 maps to carrier 99999 locality 01 (locality_map in force on 2026-04-14, 2026-01-01 to 2026-12-31).
- pfs_gpci 99999-01 (2026-01-01 to 2026-12-31): work 1.000, PE 0.950, MP 0.650.
- conversion_factor non_qualifying_apm (2026-01-01 to 2026-12-31): $20.0000 per RVU.
- Geographically adjusted RVUs: work 0.31 x 1.000 = 0.31; PE 0.71 x 0.950 = 0.6745; MP 0.11 x 0.650 = 0.0715; total 1.056.
- Fee schedule amount per unit: 1.056 x $20.0000 = $21.12.
- At 105%, per unit: work 651 cents ($6.51), practice expense 1416.45 cents ($14.1645), malpractice 150.15 cents ($1.5015); total 2217.6 cents ($22.176).

Step 3, units: 2 as billed; 2217.6 cents ($22.176) x 2 = 4435.2 cents ($44.352).

### Line 2: 97530 x 1 on 2026-04-14

Step 1, the agreement.
- Mapping map-g10 (contract, 2026-01-01 to open) is in force on 2026-04-14.
- The mapping names contract version cv-g10-1 of contract contract-g10; the version that prices the line is the signed-off one of that contract in force on 2026-04-14:
  - cv-g10-1 (version 1, signed_off, 2026-01-01 to open): signed off and in force.
- Rate records of cv-g10-1 against code 97530, modifier set [GP], place of service 11, 2026-04-14:
  - rr-g10-1 (any code; any modifiers; any place of service; 2026-01-01 to open): matches.
- Rate record rr-g10-1: PERCENT_OF_MEDICARE at 105%, year basis CURRENT, locality basis practice, conversion factor non_qualifying_apm; flags apply_mppr off, apply_assistant_reduction off, apply_sequestration off, apply_ncci off; timed_units_rule PER_CODE; rounding not stated (the practice default applies).

Step 2, the base amount by method.
- Year basis CURRENT: the fee schedule in effect on the date of service, 2026-04-14 (basis year 2026); each value is the record in force on that date.
- pfs_rvu 97530 (year 2026, quarter A, 2026-01-01 to 2026-12-31): work 0.35, PE non-facility 0.95, PE facility 0.25, MP 0.15, status A.
- Place of service 11 is non-facility, so the non-facility practice-expense value applies.
- Locality: practice ZIP 00011 maps to carrier 99999 locality 01 (locality_map in force on 2026-04-14, 2026-01-01 to 2026-12-31).
- pfs_gpci 99999-01 (2026-01-01 to 2026-12-31): work 1.000, PE 0.950, MP 0.650.
- conversion_factor non_qualifying_apm (2026-01-01 to 2026-12-31): $20.0000 per RVU.
- Geographically adjusted RVUs: work 0.35 x 1.000 = 0.35; PE 0.95 x 0.950 = 0.9025; MP 0.15 x 0.650 = 0.0975; total 1.35.
- Fee schedule amount per unit: 1.35 x $20.0000 = $27.00.
- At 105%, per unit: work 735 cents ($7.35), practice expense 1895.25 cents ($18.9525), malpractice 204.75 cents ($2.0475); total 2835 cents ($28.35).

Step 3, units: 1 as billed; 2835 cents ($28.35) x 1 = 2835 cents ($28.35).

## Steps 4 to 8, per line

### Line 1

Step 4, flagged adjustments in order (multiple procedure reduction, assistant reduction, sequestration).
- mppr: flag apply_mppr is off; not applied.
- assistant_reduction: flag apply_assistant_reduction is off; not applied.
- sequestration: flag apply_sequestration is off; not applied.
- Contract-specific adjustments: none (phase one rate records define none).

Step 5, patient share: 0 cents ($0.00) from the line's PR adjustments (none); reported beside the expected amount, never subtracted from it.
- Claim status 1 (processed as primary); the claim is not reversed.

Step 6, rounding once: 4435.2 cents under HALF_UP_CENT (the practice default; halves move away from zero) = **4435 cents ($44.35)**; the unrounded 4435.2 is kept beside it.

Step 7, variance: expected allowed 4435 - observed allowed 4400 cents (amt_b6) = 35 cents: an underpayment.

Step 8, dispute window: the remittance date is not known, so no deadline can be worked out: NO_WINDOW on 2026-10-15.

### Line 2

Step 4, flagged adjustments in order (multiple procedure reduction, assistant reduction, sequestration).
- mppr: flag apply_mppr is off; not applied.
- assistant_reduction: flag apply_assistant_reduction is off; not applied.
- sequestration: flag apply_sequestration is off; not applied.
- Contract-specific adjustments: none (phase one rate records define none).

Step 5, patient share: 0 cents ($0.00) from the line's PR adjustments (none); reported beside the expected amount, never subtracted from it.
- Claim status 1 (processed as primary); the claim is not reversed.

Step 6, rounding once: 2835 cents under HALF_UP_CENT (the practice default; halves move away from zero) = **2835 cents ($28.35)**; the unrounded 2835 is kept beside it.

Step 7, variance: expected allowed 2835 - observed allowed 2800 cents (amt_b6) = 35 cents: an underpayment.

Step 8, dispute window: the remittance date is not known, so no deadline can be worked out: NO_WINDOW on 2026-10-15.

## Results

| Line | Outcome | Expected allowed (cents) | Unrounded (cents) | Rounding | Patient share (cents) | Variance (cents) | Dispute window |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | priced | 4435 | 4435.2 | HALF_UP_CENT | 0 | 35 | NO_WINDOW |
| 2 | priced | 2835 | 2835 | HALF_UP_CENT | 0 | 35 | NO_WINDOW |

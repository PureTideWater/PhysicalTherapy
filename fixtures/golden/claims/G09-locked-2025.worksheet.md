# Worksheet G09: Commercial 105% locked to the 2025 fee schedule

Computed by the independent worksheet tools/golden-worksheet (Python, exact decimal arithmetic; no code shared with packages/pricing).
Specialist verified: no. A reimbursement specialist checks every figure here before milestone 5 closes.
Every reference value comes from SYNTHETIC release 900002: invented for tests, never a CMS value.

## Inputs

- Release 900002 at fixtures/synthetic/rules/release-synth-900002; its MANIFEST.json has SHA-256 ac9b17c76f65ffe83be6bb543fb91349efa7470231d888e34e75fbfc3000ac52 and every file matched it.
- Practice settings: ZIP 00011; default rounding HALF_UP_CENT.
- Place-of-service settings (SYNTHETIC test assumption; fixtures/golden/QUESTIONS.md): 11 non-facility; 22 facility.
- Claim SYNTH-CLAIM-G09: status 1 (processed as primary); reversed by a later claim: no; superseded by a correction: no; payer and plan SYNTH-PAYER-1/PLAN-1.
- Remittance date: not known; dispute windows are judged on the triage date 2026-10-15.
- Mapping map-g09: contract, contract version cv-g09-1, 2026-01-01 to open.
- Contract version cv-g09-1 (contract contract-g09, version 1, signed_off, 2026-01-01 to open; windows: timely filing not stated, dispute not stated, appeal levels none stated):
  - Rate record rr-g09-1: PERCENT_OF_MEDICARE 105%, LOCKED:2025, locality practice, non_qualifying_apm; scope any code; any modifiers; any place of service; 2026-01-01 to open; flags apply_mppr off, apply_assistant_reduction off, apply_sequestration off, apply_ncci off; timed_units_rule PER_CODE; rounding not stated.

| Line | Code | Modifiers | Units | Service date | POS | Charge (cents) | Observed allowed (cents) | PR adjustments (cents) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 97110 | GP | 2 | 2026-04-14 | 11 | 12000 | 4000 (amt_b6) | none |
| 2 | 97112 | GP | 1 | 2026-04-14 | 11 | 6200 | 2000 (amt_b6) | none |
| 3 | 97530 | GP | 1 | 2026-04-14 | 11 | 7000 | 2500 (amt_b6) | none |

## Steps 1 to 3, per line

### Line 1: 97110 x 2 on 2026-04-14

Step 1, the agreement.
- Mapping map-g09 (contract, 2026-01-01 to open) is in force on 2026-04-14.
- The mapping names contract version cv-g09-1 of contract contract-g09; the version that prices the line is the signed-off one of that contract in force on 2026-04-14:
  - cv-g09-1 (version 1, signed_off, 2026-01-01 to open): signed off and in force.
- Rate records of cv-g09-1 against code 97110, modifier set [GP], place of service 11, 2026-04-14:
  - rr-g09-1 (any code; any modifiers; any place of service; 2026-01-01 to open): matches.
- Rate record rr-g09-1: PERCENT_OF_MEDICARE at 105%, year basis LOCKED:2025, locality basis practice, conversion factor non_qualifying_apm; flags apply_mppr off, apply_assistant_reduction off, apply_sequestration off, apply_ncci off; timed_units_rule PER_CODE; rounding not stated (the practice default applies).

Step 2, the base amount by method.
- Year basis LOCKED:2025: the 2025 fee schedule; each value is the latest record in force during 2025.
- pfs_rvu 97110 (year 2025, quarter A, 2025-01-01 to 2025-12-31): work 0.30, PE non-facility 0.66, PE facility 0.20, MP 0.10, status A.
- Place of service 11 is non-facility, so the non-facility practice-expense value applies.
- Locality: practice ZIP 00011 maps to carrier 99999 locality 01 (locality_map in force on 2026-04-14, 2026-01-01 to 2026-12-31).
- pfs_gpci 99999-01 (2025-01-01 to 2025-12-31): work 1.000, PE 0.940, MP 0.610.
- conversion_factor non_qualifying_apm (2025-01-01 to 2025-12-31): $19.6123 per RVU.
- Geographically adjusted RVUs: work 0.30 x 1.000 = 0.3; PE 0.66 x 0.940 = 0.6204; MP 0.10 x 0.610 = 0.061; total 0.9814.
- Fee schedule amount per unit: 0.9814 x $19.6123 = $19.24751122.
- At 105%, per unit: work 617.78745 cents ($6.1778745), practice expense 1277.5844466 cents ($12.775844466), malpractice 125.6167815 cents ($1.256167815); total 2020.9886781 cents ($20.209886781).

Step 3, units: 2 as billed; 2020.9886781 cents ($20.209886781) x 2 = 4041.9773562 cents ($40.419773562).

### Line 2: 97112 x 1 on 2026-04-14

Step 1, the agreement.
- Mapping map-g09 (contract, 2026-01-01 to open) is in force on 2026-04-14.
- The mapping names contract version cv-g09-1 of contract contract-g09; the version that prices the line is the signed-off one of that contract in force on 2026-04-14:
  - cv-g09-1 (version 1, signed_off, 2026-01-01 to open): signed off and in force.
- Rate records of cv-g09-1 against code 97112, modifier set [GP], place of service 11, 2026-04-14:
  - rr-g09-1 (any code; any modifiers; any place of service; 2026-01-01 to open): matches.
- Rate record rr-g09-1: PERCENT_OF_MEDICARE at 105%, year basis LOCKED:2025, locality basis practice, conversion factor non_qualifying_apm; flags apply_mppr off, apply_assistant_reduction off, apply_sequestration off, apply_ncci off; timed_units_rule PER_CODE; rounding not stated (the practice default applies).

Step 2, the base amount by method.
- Year basis LOCKED:2025: the 2025 fee schedule; each value is the latest record in force during 2025.
- pfs_rvu 97112 (year 2025, quarter A, 2025-01-01 to 2025-12-31): work 0.31, PE non-facility 0.66, PE facility 0.21, MP 0.11, status A.
- Place of service 11 is non-facility, so the non-facility practice-expense value applies.
- Locality: practice ZIP 00011 maps to carrier 99999 locality 01 (locality_map in force on 2026-04-14, 2026-01-01 to 2026-12-31).
- pfs_gpci 99999-01 (2025-01-01 to 2025-12-31): work 1.000, PE 0.940, MP 0.610.
- conversion_factor non_qualifying_apm (2025-01-01 to 2025-12-31): $19.6123 per RVU.
- Geographically adjusted RVUs: work 0.31 x 1.000 = 0.31; PE 0.66 x 0.940 = 0.6204; MP 0.11 x 0.610 = 0.0671; total 0.9975.
- Fee schedule amount per unit: 0.9975 x $19.6123 = $19.56326925.
- At 105%, per unit: work 638.380365 cents ($6.38380365), practice expense 1277.5844466 cents ($12.775844466), malpractice 138.17845965 cents ($1.3817845965); total 2054.14327125 cents ($20.5414327125).

Step 3, units: 1 as billed; 2054.14327125 cents ($20.5414327125) x 1 = 2054.14327125 cents ($20.5414327125).

### Line 3: 97530 x 1 on 2026-04-14

Step 1, the agreement.
- Mapping map-g09 (contract, 2026-01-01 to open) is in force on 2026-04-14.
- The mapping names contract version cv-g09-1 of contract contract-g09; the version that prices the line is the signed-off one of that contract in force on 2026-04-14:
  - cv-g09-1 (version 1, signed_off, 2026-01-01 to open): signed off and in force.
- Rate records of cv-g09-1 against code 97530, modifier set [GP], place of service 11, 2026-04-14:
  - rr-g09-1 (any code; any modifiers; any place of service; 2026-01-01 to open): matches.
- Rate record rr-g09-1: PERCENT_OF_MEDICARE at 105%, year basis LOCKED:2025, locality basis practice, conversion factor non_qualifying_apm; flags apply_mppr off, apply_assistant_reduction off, apply_sequestration off, apply_ncci off; timed_units_rule PER_CODE; rounding not stated (the practice default applies).

Step 2, the base amount by method.
- Year basis LOCKED:2025: the 2025 fee schedule; each value is the latest record in force during 2025.
- pfs_rvu 97530 (year 2025, quarter A, 2025-01-01 to 2025-12-31): work 0.34, PE non-facility 0.90, PE facility 0.24, MP 0.14, status A.
- Place of service 11 is non-facility, so the non-facility practice-expense value applies.
- Locality: practice ZIP 00011 maps to carrier 99999 locality 01 (locality_map in force on 2026-04-14, 2026-01-01 to 2026-12-31).
- pfs_gpci 99999-01 (2025-01-01 to 2025-12-31): work 1.000, PE 0.940, MP 0.610.
- conversion_factor non_qualifying_apm (2025-01-01 to 2025-12-31): $19.6123 per RVU.
- Geographically adjusted RVUs: work 0.34 x 1.000 = 0.34; PE 0.90 x 0.940 = 0.846; MP 0.14 x 0.610 = 0.0854; total 1.2714.
- Fee schedule amount per unit: 1.2714 x $19.6123 = $24.93507822.
- At 105%, per unit: work 700.15911 cents ($7.0015911), practice expense 1742.160609 cents ($17.42160609), malpractice 175.8634941 cents ($1.758634941); total 2618.1832131 cents ($26.181832131).

Step 3, units: 1 as billed; 2618.1832131 cents ($26.181832131) x 1 = 2618.1832131 cents ($26.181832131).

## Steps 4 to 8, per line

### Line 1

Step 4, flagged adjustments in order (multiple procedure reduction, assistant reduction, sequestration).
- mppr: flag apply_mppr is off; not applied.
- assistant_reduction: flag apply_assistant_reduction is off; not applied.
- sequestration: flag apply_sequestration is off; not applied.
- Contract-specific adjustments: none (phase one rate records define none).

Step 5, patient share: 0 cents ($0.00) from the line's PR adjustments (none); reported beside the expected amount, never subtracted from it.
- Claim status 1 (processed as primary); the claim is not reversed.

Step 6, rounding once: 4041.9773562 cents under HALF_UP_CENT (the practice default; halves move away from zero) = **4042 cents ($40.42)**; the unrounded 4041.9773562 is kept beside it.

Step 7, variance: expected allowed 4042 - observed allowed 4000 cents (amt_b6) = 42 cents: an underpayment.

Step 8, dispute window: the remittance date is not known, so no deadline can be worked out: NO_WINDOW on 2026-10-15.

### Line 2

Step 4, flagged adjustments in order (multiple procedure reduction, assistant reduction, sequestration).
- mppr: flag apply_mppr is off; not applied.
- assistant_reduction: flag apply_assistant_reduction is off; not applied.
- sequestration: flag apply_sequestration is off; not applied.
- Contract-specific adjustments: none (phase one rate records define none).

Step 5, patient share: 0 cents ($0.00) from the line's PR adjustments (none); reported beside the expected amount, never subtracted from it.
- Claim status 1 (processed as primary); the claim is not reversed.

Step 6, rounding once: 2054.14327125 cents under HALF_UP_CENT (the practice default; halves move away from zero) = **2054 cents ($20.54)**; the unrounded 2054.14327125 is kept beside it.

Step 7, variance: expected allowed 2054 - observed allowed 2000 cents (amt_b6) = 54 cents: an underpayment.

Step 8, dispute window: the remittance date is not known, so no deadline can be worked out: NO_WINDOW on 2026-10-15.

### Line 3

Step 4, flagged adjustments in order (multiple procedure reduction, assistant reduction, sequestration).
- mppr: flag apply_mppr is off; not applied.
- assistant_reduction: flag apply_assistant_reduction is off; not applied.
- sequestration: flag apply_sequestration is off; not applied.
- Contract-specific adjustments: none (phase one rate records define none).

Step 5, patient share: 0 cents ($0.00) from the line's PR adjustments (none); reported beside the expected amount, never subtracted from it.
- Claim status 1 (processed as primary); the claim is not reversed.

Step 6, rounding once: 2618.1832131 cents under HALF_UP_CENT (the practice default; halves move away from zero) = **2618 cents ($26.18)**; the unrounded 2618.1832131 is kept beside it.

Step 7, variance: expected allowed 2618 - observed allowed 2500 cents (amt_b6) = 118 cents: an underpayment.

Step 8, dispute window: the remittance date is not known, so no deadline can be worked out: NO_WINDOW on 2026-10-15.

## Results

| Line | Outcome | Expected allowed (cents) | Unrounded (cents) | Rounding | Patient share (cents) | Variance (cents) | Dispute window |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | priced | 4042 | 4041.9773562 | HALF_UP_CENT | 0 | 42 | NO_WINDOW |
| 2 | priced | 2054 | 2054.14327125 | HALF_UP_CENT | 0 | 54 | NO_WINDOW |
| 3 | priced | 2618 | 2618.1832131 | HALF_UP_CENT | 0 | 118 | NO_WINDOW |

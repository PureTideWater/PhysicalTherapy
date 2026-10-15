# Worksheet G15: Facility place of service for a code whose facility practice expense is NA

Computed by the independent worksheet tools/golden-worksheet (Python, exact decimal arithmetic; no code shared with packages/pricing).
Specialist verified: no. A reimbursement specialist checks every figure here before milestone 5 closes.
Every reference value comes from SYNTHETIC release 900001: invented for tests, never a CMS value.

## Inputs

- Release 900001 at fixtures/synthetic/rules/release-synth-900001; its MANIFEST.json has SHA-256 6d346c8fa596c0f720ff3176be10044e86c9b4fe843d37b04c59192cdbdce45a and every file matched it.
- Practice settings: ZIP 00011; default rounding HALF_UP_CENT.
- Place-of-service settings (SYNTHETIC test assumption; fixtures/golden/QUESTIONS.md): 11 non-facility; 22 facility.
- Claim SYNTH-CLAIM-G15: status 1 (processed as primary); reversed by a later claim: no; superseded by a correction: no; payer and plan SYNTH-MA-PLAN-1.
- Remittance date: not known; dispute windows are judged on the triage date 2026-10-15.
- Mapping map-ma-1: ma_noncontracted, 2026-01-01 to open.
- Contract versions: none.

| Line | Code | Modifiers | Units | Service date | POS | Charge (cents) | Observed allowed (cents) | PR adjustments (cents) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | G0283 | GP | 1 | 2026-03-10 | 22 | 2800 | 300 (amt_b6) | none |
| 2 | 97110 | GP | 1 | 2026-03-10 | 22 | 6000 | 1400 (amt_b6) | none |

## Steps 1 to 3, per line

### Line 1: G0283 x 1 on 2026-03-10

Step 1, the agreement.
- Mapping map-ma-1 (ma_noncontracted, 2026-01-01 to open) is in force on 2026-03-10.
- Medicare Advantage, non-contracted: priced as Original Medicare would, method PERCENT_OF_MEDICARE at 100%, year basis CURRENT, conversion factor non_qualifying_apm (the rules reference's default), every Medicare adjustment on (apply_mppr on, apply_assistant_reduction on, apply_sequestration on, apply_ncci on; timed_units_rule MEDICARE_POOLED); no contract rounding, so the practice default applies.

Step 2, the base amount by method.
- Year basis CURRENT: the fee schedule in effect on the date of service, 2026-03-10 (basis year 2026); each value is the record in force on that date.
- pfs_rvu G0283 (year 2026, quarter A, 2026-01-01 to 2026-12-31): work 0.08, PE non-facility 0.28, PE facility 0.00 (NA), MP 0.08, status A.
- Place of service 22 is facility, so the facility practice-expense value applies.
- **Unpriced: `NO_PFS_VALUE`.** The facility practice-expense value of G0283 is NA in 2026: the code has no relative value for this setting (fixtures/golden/QUESTIONS.md).

### Line 2: 97110 x 1 on 2026-03-10

Step 1, the agreement.
- Mapping map-ma-1 (ma_noncontracted, 2026-01-01 to open) is in force on 2026-03-10.
- Medicare Advantage, non-contracted: priced as Original Medicare would, method PERCENT_OF_MEDICARE at 100%, year basis CURRENT, conversion factor non_qualifying_apm (the rules reference's default), every Medicare adjustment on (apply_mppr on, apply_assistant_reduction on, apply_sequestration on, apply_ncci on; timed_units_rule MEDICARE_POOLED); no contract rounding, so the practice default applies.

Step 2, the base amount by method.
- Year basis CURRENT: the fee schedule in effect on the date of service, 2026-03-10 (basis year 2026); each value is the record in force on that date.
- pfs_rvu 97110 (year 2026, quarter A, 2026-01-01 to 2026-12-31): work 0.31, PE non-facility 0.71, PE facility 0.21, MP 0.11, status A.
- Place of service 22 is facility, so the facility practice-expense value applies.
- Locality: practice ZIP 00011 maps to carrier 99999 locality 01 (locality_map in force on 2026-03-10, 2026-01-01 to 2026-12-31).
- pfs_gpci 99999-01 (2026-01-01 to 2026-12-31): work 1.000, PE 0.950, MP 0.650.
- conversion_factor non_qualifying_apm (2026-01-01 to 2026-12-31): $20.0000 per RVU.
- Geographically adjusted RVUs: work 0.31 x 1.000 = 0.31; PE 0.21 x 0.950 = 0.1995; MP 0.11 x 0.650 = 0.0715; total 0.581.
- Fee schedule amount per unit: 0.581 x $20.0000 = $11.62.
- At 100%, per unit: work 620 cents ($6.20), practice expense 399 cents ($3.99), malpractice 143 cents ($1.43); total 1162 cents ($11.62).

Step 3, units: 1 as billed; 1162 cents ($11.62) x 1 = 1162 cents ($11.62).

## Step 4a, the multiple procedure reduction, per day

### Multiple procedure reduction on 2026-03-10

Lines with apply_mppr on and a price so far: line 2. Units are ranked by their practice-expense amount, highest first; ties go to the lower line number, then the earlier unit (fixtures/golden/QUESTIONS.md).
- Line 2 (97110): always therapy, mppr_rate 97110 (2026-01-01 to 2026-12-31): 40%.

| Rank | Line | Code | Unit | PE amount per unit (cents) | Treatment | Reduction (cents) |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 2 | 97110 | 1 | 399 | kept whole | 0 |

## Steps 4 to 8, per line

### Line 2

Step 4, flagged adjustments in order (multiple procedure reduction, assistant reduction, sequestration).
- mppr: before 1162, after 1162; its unit is the day's highest-ranked, kept whole; unchanged.
- assistant_reduction: before 1162, after 1162; no CQ or CO modifier on the line; unchanged.
- sequestration: before 1162, after 1127.14; the amount 1162 cents ($11.62) less the patient share 0 leaves the payer's share 1162 cents ($11.62); 3% of the payer's share is 34.86; 1162 - 34.86 = 1127.14 cents ($11.2714).
- Contract-specific adjustments: none (phase one rate records define none).
- apply_ncci is on: NCCI edits and MUE arrive in milestone 7 and change no amount here.

Step 5, patient share: 0 cents ($0.00) from the line's PR adjustments (none); reported beside the expected amount, never subtracted from it.
- Claim status 1 (processed as primary); the claim is not reversed.

Step 6, rounding once: 1127.14 cents under HALF_UP_CENT (the practice default; halves move away from zero) = **1127 cents ($11.27)**; the unrounded 1127.14 is kept beside it.

Step 7, variance: expected allowed 1127 - observed allowed 1400 cents (amt_b6) = -273 cents: an overpayment, recorded and never pursued.

Step 8, dispute window: the remittance date is not known, so no deadline can be worked out: NO_WINDOW on 2026-10-15.

## Results

| Line | Outcome | Expected allowed (cents) | Unrounded (cents) | Rounding | Patient share (cents) | Variance (cents) | Dispute window |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | unpriced `NO_PFS_VALUE` | | | | | | |
| 2 | priced | 1127 | 1127.14 | HALF_UP_CENT | 0 | -273 | NO_WINDOW |

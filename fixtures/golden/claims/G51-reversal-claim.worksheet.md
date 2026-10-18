# Worksheet G51: A reversal claim (status 22)

Computed by the independent worksheet tools/golden-worksheet (Python, exact decimal arithmetic; no code shared with packages/pricing).
Specialist verified: no. A reimbursement specialist checks every figure here before milestones 5 and 7 close.
Every reference value comes from SYNTHETIC release 900001: invented for tests, never a CMS value.

## Inputs

- Release 900001 at fixtures/synthetic/rules/release-synth-900001; its MANIFEST.json has SHA-256 6d346c8fa596c0f720ff3176be10044e86c9b4fe843d37b04c59192cdbdce45a and every file matched it.
- Practice settings: ZIP 00011; default rounding HALF_UP_CENT.
- Place-of-service settings (SYNTHETIC test assumption; fixtures/golden/QUESTIONS.md): 11 non-facility; 22 facility.
- Claim SYNTH-CLAIM-G51: status 22 (reversal of a prior payment); reversed by a later claim: no; superseded by a correction: no; payer and plan SYNTH-MA-PLAN-1.
- Remittance date: not known; dispute windows are judged on the triage date 2026-10-15.
- Mapping map-ma-1: ma_noncontracted, 2026-01-01 to open.
- Contract versions: none.

| Line | Code | Modifiers | Units | Service date | POS | Charge (cents) | Observed allowed (cents) | PR adjustments (cents) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 97110 | GP | 1 | 2026-03-10 | 11 | -6000 | -1800 (amt_b6) | PR-2 -400 |

## Steps 1 to 3, per line

### Line 1: 97110 x 1 on 2026-03-10

Step 1, the agreement.
- Mapping map-ma-1 (ma_noncontracted, 2026-01-01 to open) is in force on 2026-03-10.
- Medicare Advantage, non-contracted: priced as Original Medicare would, method PERCENT_OF_MEDICARE at 100%, year basis CURRENT, conversion factor non_qualifying_apm (the rules reference's default), every Medicare adjustment on (apply_mppr on, apply_assistant_reduction on, apply_sequestration on, apply_ncci on; timed_units_rule MEDICARE_POOLED); no contract rounding, so the practice default applies; no contract-specific adjustment.

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

Step 3, units and edits.
- Units: 1 as billed, under the timed-units rule MEDICARE_POOLED, recorded: until minute logs are imported the units are taken as billed (PRD 2 point 6).
- Medically unlikely edit: apply_ncci is on; ncci_mue 97110 (2026-01-01 to 2026-12-31, adjudication indicator 3) allows 7 unit(s); 1 is within it.
- Base: 2112 cents ($21.12) x 1 = 2112 cents ($21.12).
- Procedure-to-procedure edits: apply_ncci is on; no ncci_ptp record in force on 2026-03-10 has 97110 in column 2 and another line's code of the date in column 1.

## Step 4a, the multiple procedure reduction, per day

### Multiple procedure reduction on 2026-03-10

Lines with apply_mppr on and a price so far: line 1. Units are ranked by their practice-expense amount, highest first; ties go to the lower line number, then the earlier unit (fixtures/golden/QUESTIONS.md).
- Line 1 (97110): always therapy, mppr_rate 97110 (2026-01-01 to 2026-12-31): 40%.

| Rank | Line | Code | Unit | PE amount per unit (cents) | Treatment | Reduction (cents) |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 97110 | 1 | 1349 | kept whole | 0 |

## Steps 4 to 8, per line

### Line 1

Step 4, adjustments in order: the multiple procedure reduction, the assistant reduction and sequestration where their flags are on, then the rate record's own.
- mppr: before 2112, after 2112; its unit is the day's highest-ranked, kept whole; unchanged.
- assistant_reduction: before 2112, after 2112; no CQ or CO modifier on the line; unchanged.
- sequestration: before 2112, after 2036.64; the amount 2112 cents ($21.12) less the patient share -400 leaves the payer's share 2512 cents ($25.12); 3% of the payer's share is 75.36; 2112 - 75.36 = 2036.64 cents ($20.3664).
- contract_adjustment: the Medicare Advantage non-contracted terms define none; not applied.

Step 5, patient share: -400 cents ($-4.00) from the line's PR adjustments (PR-2 -400); reported beside the expected amount, never subtracted from it.
- **Unpriced: `REVERSED_CLAIM`.** Claim status 22 (reversal of a prior payment).

## Results

| Line | Outcome | Expected allowed (cents) | Unrounded (cents) | Rounding | Patient share (cents) | Variance (cents) | Dispute window | Review flags |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | unpriced `REVERSED_CLAIM` | | | | | | | |

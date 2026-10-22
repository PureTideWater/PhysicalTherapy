# Worksheet G196: A ZIP that spans localities, its ZIP+4 in the first range: 00012-0001 prices at locality 01

Computed by the independent worksheet tools/golden-worksheet (Python, exact decimal arithmetic; no code shared with packages/pricing).
Specialist verified: no. A reimbursement specialist checks every figure here before milestones 5 and 7 close.
Every reference value comes from SYNTHETIC release 900006: invented for tests, never a CMS value.

## Inputs

- Release 900006 at fixtures/synthetic/rules/release-synth-900006; its MANIFEST.json has SHA-256 be58019db25168b0589a671d4204b9f5402e1d1fc18e12fcbf5b867e17400930 and every file matched it.
- Practice settings: ZIP 00012; ZIP+4 0001; default rounding HALF_UP_CENT.
- Place-of-service settings (SYNTHETIC test assumption; fixtures/golden/QUESTIONS.md): 11 non-facility; 22 facility.
- Claim SYNTH-CLAIM-G196: status 1 (processed as primary); reversed by a later claim: no; superseded by a correction: no; payer and plan SYNTH-MA-PLAN-2.
- Remittance date: 2026-08-28; dispute windows are judged on the triage date 2026-10-15.
- Mapping map-ma-zip4: ma_noncontracted, 2026-01-01 to open.
- Contract versions: none.

| Line | Code | Modifiers | Units | Service date | POS | Charge (cents) | Observed allowed (cents) | PR adjustments (cents) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 97110 | GP | 2 | 2026-08-04 | 11 | 12000 | 3595 (amt_b6) | PR-2 719 |

## Steps 1 to 3, per line

### Line 1: 97110 x 2 on 2026-08-04

Step 1, the agreement.
- Mapping map-ma-zip4 (ma_noncontracted, 2026-01-01 to open) is in force on 2026-08-04.
- Medicare Advantage, non-contracted: priced as Original Medicare would, method PERCENT_OF_MEDICARE at 100%, year basis CURRENT, conversion factor non_qualifying_apm (the rules reference's default), every Medicare adjustment on (apply_mppr on, apply_assistant_reduction on, apply_sequestration on, apply_ncci on; timed_units_rule MEDICARE_POOLED); no contract rounding, so the practice default applies; no contract-specific adjustment.

Step 2, the base amount by method.
- Year basis CURRENT: the fee schedule in effect on the date of service, 2026-08-04 (basis year 2026); each value is the record in force on that date.
- pfs_rvu 97110 (year 2026, quarter A, 2026-01-01 to 2026-12-31): work 0.31, PE non-facility 0.71, PE facility 0.21, MP 0.11, status A.
- Place of service 11 is non-facility, so the non-facility practice-expense value applies.
- Locality: practice ZIP 00012 spans localities. Its locality_map record (in force on 2026-08-04, 2026-01-01 to 2026-12-31) names carrier 99999 locality 01 with the plus-four flag on, so its ZIP+4, 0001, names the locality from the ZIP9 file.
- ZIP+4 00012-0001: the locality_map_plus_four record of ZIP 00012 in force on 2026-08-04 (2026-01-01 to 2026-12-31) was read from fixtures/synthetic/cms/ZIP9_SYNTHETIC.txt, whose SHA-256 63c65ff5902955ab7aa4339c3db35ceb32ea985582f39541216088d46c4470d3 matched. Its line 2, `ZZ000129999901R01   10001                                                  20261`, read by the CMS ZIP9 layout (state 1-2, ZIP 3-7, carrier 8-12, pricing locality 13-14, rural indicator 15, plus-four flag 21, plus-four 22-25, year and quarter 76-80), gives state ZZ, carrier 99999, pricing locality 01, rural indicator R, year and quarter 20261.
- Locality: practice ZIP 00012-0001 maps to carrier 99999 locality 01.
- pfs_gpci 99999-01 (2026-01-01 to 2026-12-31): work 1.000, PE 0.950, MP 0.650.
- conversion_factor non_qualifying_apm (2026-01-01 to 2026-12-31): $20.0000 per RVU.
- Geographically adjusted RVUs: work 0.31 x 1.000 = 0.31; PE 0.71 x 0.950 = 0.6745; MP 0.11 x 0.650 = 0.0715; total 1.056.
- Fee schedule amount per unit: 1.056 x $20.0000 = $21.12.
- At 100%, per unit: work 620 cents ($6.20), practice expense 1349 cents ($13.49), malpractice 143 cents ($1.43); total 2112 cents ($21.12).

Step 3, units and edits.
- Units: 2 as billed, under the timed-units rule MEDICARE_POOLED, recorded: until minute logs are imported the units are taken as billed (PRD 2 point 6).
- Medically unlikely edit: apply_ncci is on; ncci_mue 97110 (2026-01-01 to 2026-12-31, adjudication indicator 3) allows 7 unit(s); 2 are within it.
- Base: 2112 cents ($21.12) x 2 = 4224 cents ($42.24).
- Procedure-to-procedure edits: apply_ncci is on; no ncci_ptp record in force on 2026-08-04 has 97110 in column 2 and another line's code of the date in column 1.

## Step 4a, the multiple procedure reduction, per day

### Multiple procedure reduction on 2026-08-04

Lines with apply_mppr on and a price so far: line 1. Units are ranked by their practice-expense amount, highest first; ties go to the lower line number, then the earlier unit (fixtures/golden/QUESTIONS.md).
- Line 1 (97110): always therapy, mppr_rate 97110 (2026-01-01 to 2026-12-31): 40%.

| Rank | Line | Code | Unit | PE amount per unit (cents) | Treatment | Reduction (cents) |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 97110 | 1 | 1349 | kept whole | 0 |
| 2 | 1 | 97110 | 2 | 1349 | PE reduced by 40% | 1349 x 40% = 539.6 |

## Steps 4 to 8, per line

### Line 1

Step 4, adjustments in order: the multiple procedure reduction, the assistant reduction and sequestration where their flags are on, then the rate record's own.
- mppr: before 4224, after 3684.4; 4224 cents ($42.24) - the reductions of its units 539.6 = 3684.4 cents ($36.844).
- assistant_reduction: before 3684.4, after 3684.4; no CQ or CO modifier on the line; unchanged.
- sequestration: before 3684.4, after 3595.438; the amount 3684.4 cents ($36.844) less the patient share 719 leaves the payer's share 2965.4 cents ($29.654); 3% of the payer's share is 88.962; 3684.4 - 88.962 = 3595.438 cents ($35.95438).
- contract_adjustment: the Medicare Advantage non-contracted terms define none; not applied.

Step 5, patient share: 719 cents ($7.19) from the line's PR adjustments (PR-2 719); reported beside the expected amount, never subtracted from it.
- Claim status 1 (processed as primary); the claim is not reversed.

Step 6, rounding once: 3595.438 cents under HALF_UP_CENT (the practice default; halves move away from zero) = **3595 cents ($35.95)**; the unrounded 3595.438 is kept beside it.

Step 7, variance: expected allowed 3595 - observed allowed 3595 cents (amt_b6) = 0 cents: none.

Step 8, dispute window: the plan is Medicare Advantage non-contracted, so Original Medicare's first-level window applies (dispute_window medicare redetermination, 2026-01-01 to open, in force on the remittance date 2026-08-28): 111 days from the remittance date 2026-08-28 (the record names no start, so the remittance date), ends on 2026-12-17; on the triage date 2026-10-15 it is open.

## Results

| Line | Outcome | Expected allowed (cents) | Unrounded (cents) | Rounding | Patient share (cents) | Variance (cents) | Dispute window | Review flags |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | priced | 3595 | 3595.438 | HALF_UP_CENT | 719 | 0 | OPEN (ends 2026-12-17) | none |

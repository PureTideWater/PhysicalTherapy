# Worksheet G190: Processed as tertiary and forwarded (status 21)

Computed by the independent worksheet tools/golden-worksheet (Python, exact decimal arithmetic; no code shared with packages/pricing).
Specialist verified: no. A reimbursement specialist checks every figure here before milestones 5 and 7 close.
Every reference value comes from SYNTHETIC release 900002: invented for tests, never a CMS value.

## Inputs

- Release 900002 at fixtures/synthetic/rules/release-synth-900002; its MANIFEST.json has SHA-256 ac9b17c76f65ffe83be6bb543fb91349efa7470231d888e34e75fbfc3000ac52 and every file matched it.
- Practice settings: ZIP 00011; default rounding HALF_UP_CENT.
- Place-of-service settings (SYNTHETIC test assumption; fixtures/golden/QUESTIONS.md): 11 non-facility; 22 facility.
- Claim SYNTH-CLAIM-G190: status 21 (processed as tertiary and forwarded); reversed by a later claim: no; superseded by a correction: no; payer and plan SYNTH-PAYER-E/PLAN-EPO.
- Remittance date: 2026-06-23; dispute windows are judged on the triage date 2026-10-15.
- Mapping map-e-epo: contract, contract version cv-e-1, 2025-07-01 to 2026-08-31.
- Mapping map-e-left: no_agreement, 2026-09-01 to open.
- Contract version cv-e-0 (contract contract-synth-e, version 1, superseded, 2025-07-01 to 2025-12-31; windows: timely filing 120 days, dispute 30 days, appeal levels none stated):
  - Rate record rr-e0-therapy: PERCENT_OF_MEDICARE at 110%, year basis CURRENT, locality basis practice, conversion factor non_qualifying_apm; scope codes 97110, 97112, 97116, 97140, 97530; any modifiers; any place of service; 2025-07-01 to 2025-12-31; flags apply_mppr off, apply_assistant_reduction off, apply_sequestration off, apply_ncci off; timed_units_rule PER_CODE; rounding HALF_EVEN_CENT; contract-specific adjustment none.
- Contract version cv-e-1 (contract contract-synth-e, version 2, signed_off, 2026-01-01 to 2026-03-31; windows: timely filing 120 days, dispute 30 days, appeal levels none stated):
  - Rate record rr-e1-therapy: PERCENT_OF_MEDICARE at 115%, year basis LOCKED:2025, locality basis practice, conversion factor non_qualifying_apm; scope codes 97110, 97112, 97116, 97140, 97530; any modifiers; any place of service; 2026-01-01 to 2026-03-31; flags apply_mppr on, apply_assistant_reduction off, apply_sequestration off, apply_ncci off; timed_units_rule PER_CODE; rounding HALF_EVEN_CENT; contract-specific adjustment pays 97.5% of the amount.
  - Rate record rr-e1-modalities: PERCENT_OF_MEDICARE at 115%, year basis LOCKED:2025, locality basis practice, conversion factor non_qualifying_apm; scope codes 97026, 97035; any modifiers; any place of service; 2026-01-01 to 2026-03-31; flags apply_mppr on, apply_assistant_reduction off, apply_sequestration off, apply_ncci off; timed_units_rule PER_CODE; rounding HALF_EVEN_CENT; contract-specific adjustment pays 97.5% of the amount.
  - Rate record rr-e1-evaluation: FIXED_SCHEDULE, 7400 cents ($74.00) per unit; scope codes 97161, 97162, 97163; any modifiers; any place of service; 2026-01-01 to 2026-03-31; flags apply_mppr off, apply_assistant_reduction off, apply_sequestration off, apply_ncci off; timed_units_rule PER_CODE; rounding not stated; contract-specific adjustment none.
- Contract version cv-e-2 (contract contract-synth-e, version 3, signed_off, 2026-05-01 to open; windows: timely filing 120 days, dispute 180 days, appeal levels level 1 90 days):
  - Rate record rr-e2-therapy: PERCENT_OF_MEDICARE at 120%, year basis CURRENT, locality basis practice, conversion factor qualifying_apm; scope codes 97110, 97112, 97140, 97530; any modifiers; any place of service; 2026-05-01 to open; flags apply_mppr on, apply_assistant_reduction on, apply_sequestration on, apply_ncci on; timed_units_rule PER_CODE; rounding TRUNCATE; contract-specific adjustment none.
  - Rate record rr-e2-97116: FIXED_SCHEDULE, 2500 cents ($25.00) per unit; scope codes 97116; any modifiers; any place of service; 2026-05-01 to open; flags apply_mppr off, apply_assistant_reduction on, apply_sequestration off, apply_ncci on; timed_units_rule PER_CODE; rounding not stated; contract-specific adjustment caps the line at 6000 cents ($60.00).
  - Rate record rr-e2-evaluation: LESSER_OF the line charge and the schedule (FIXED_SCHEDULE, 7600 cents ($76.00) per unit); scope codes 97161, 97162, 97163, 97164; any modifiers; any place of service; 2026-05-01 to open; flags apply_mppr off, apply_assistant_reduction off, apply_sequestration off, apply_ncci on; timed_units_rule PER_CODE; rounding HALF_UP_CENT; contract-specific adjustment none.
  - Rate record rr-e2-97750: PERCENT_OF_MEDICARE at 120%, year basis CURRENT, locality basis practice, conversion factor qualifying_apm; scope codes 97750; any modifiers; any place of service; 2026-05-01 to open; flags apply_mppr off, apply_assistant_reduction off, apply_sequestration off, apply_ncci on; timed_units_rule PER_CODE; rounding TRUNCATE; contract-specific adjustment none.

| Line | Code | Modifiers | Units | Service date | POS | Charge (cents) | Observed allowed (cents) | PR adjustments (cents) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 97110 | GP | 1 | 2026-06-02 | 11 | 6000 | 300 (amt_b6) | none |

## Steps 1 to 3, per line

### Line 1: 97110 x 1 on 2026-06-02

Step 1, the agreement.
- Mapping map-e-epo (contract, 2025-07-01 to 2026-08-31) is in force on 2026-06-02.
- The mapping names contract version cv-e-1 of contract contract-synth-e; the version that prices the line is the signed-off one of that contract in force on 2026-06-02:
  - cv-e-0 (version 1, superseded, 2025-07-01 to 2025-12-31): not signed off.
  - cv-e-1 (version 2, signed_off, 2026-01-01 to 2026-03-31): outside its window.
  - cv-e-2 (version 3, signed_off, 2026-05-01 to open): signed off and in force.
- Rate records of cv-e-2 against code 97110, modifier set [GP], place of service 11, 2026-06-02:
  - rr-e2-therapy (codes 97110, 97112, 97140, 97530; any modifiers; any place of service; 2026-05-01 to open): matches.
  - rr-e2-97116 (codes 97116; any modifiers; any place of service; 2026-05-01 to open): no match, code 97110 is not in its codes.
  - rr-e2-evaluation (codes 97161, 97162, 97163, 97164; any modifiers; any place of service; 2026-05-01 to open): no match, code 97110 is not in its codes.
  - rr-e2-97750 (codes 97750; any modifiers; any place of service; 2026-05-01 to open): no match, code 97110 is not in its codes.
- Rate record rr-e2-therapy: PERCENT_OF_MEDICARE at 120%, year basis CURRENT, locality basis practice, conversion factor qualifying_apm; flags apply_mppr on, apply_assistant_reduction on, apply_sequestration on, apply_ncci on; timed_units_rule PER_CODE; rounding TRUNCATE; contract-specific adjustment: none.

Step 2, the base amount by method.
- Year basis CURRENT: the fee schedule in effect on the date of service, 2026-06-02 (basis year 2026); each value is the record in force on that date.
- pfs_rvu 97110 (year 2026, quarter A, 2026-01-01 to 2026-12-31): work 0.31, PE non-facility 0.71, PE facility 0.21, MP 0.11, status A.
- Place of service 11 is non-facility, so the non-facility practice-expense value applies.
- Locality: practice ZIP 00011 maps to carrier 99999 locality 01 (locality_map in force on 2026-06-02, 2026-01-01 to 2026-12-31).
- pfs_gpci 99999-01 (2026-01-01 to 2026-12-31): work 1.000, PE 0.950, MP 0.650.
- conversion_factor qualifying_apm (2026-01-01 to 2026-12-31): $20.1000 per RVU.
- Geographically adjusted RVUs: work 0.31 x 1.000 = 0.31; PE 0.71 x 0.950 = 0.6745; MP 0.11 x 0.650 = 0.0715; total 1.056.
- Fee schedule amount per unit: 1.056 x $20.1000 = $21.2256.
- At 120%, per unit: work 747.72 cents ($7.4772), practice expense 1626.894 cents ($16.26894), malpractice 172.458 cents ($1.72458); total 2547.072 cents ($25.47072).

Step 3, units and edits.
- Units: 1 as billed, under the timed-units rule PER_CODE, recorded: until minute logs are imported the units are taken as billed (PRD 2 point 6).
- Medically unlikely edit: apply_ncci is on; ncci_mue 97110 (2026-01-01 to 2026-12-31, adjudication indicator 3) allows 7 unit(s); 1 is within it.
- Base: 2547.072 cents ($25.47072) x 1 = 2547.072 cents ($25.47072).
- Procedure-to-procedure edits: apply_ncci is on; no ncci_ptp record in force on 2026-06-02 has 97110 in column 2 and another line's code of the date in column 1.

## Step 4a, the multiple procedure reduction, per day

### Multiple procedure reduction on 2026-06-02

Lines with apply_mppr on and a price so far: line 1. Units are ranked by their practice-expense amount, highest first; ties go to the lower line number, then the earlier unit (fixtures/golden/QUESTIONS.md).
- Line 1 (97110): always therapy, mppr_rate 97110 (2026-01-01 to 2026-12-31): 40%.

| Rank | Line | Code | Unit | PE amount per unit (cents) | Treatment | Reduction (cents) |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 97110 | 1 | 1626.894 | kept whole | 0 |

## Steps 4 to 8, per line

### Line 1

Step 4, adjustments in order: the multiple procedure reduction, the assistant reduction and sequestration where their flags are on, then the rate record's own.
- mppr: before 2547.072, after 2547.072; its unit is the day's highest-ranked, kept whole; unchanged.
- assistant_reduction: before 2547.072, after 2547.072; no CQ or CO modifier on the line; unchanged.
- sequestration: before 2547.072, after 2470.65984; the amount 2547.072 cents ($25.47072) less the patient share 0 leaves the payer's share 2547.072 cents ($25.47072); 3% of the payer's share is 76.41216; 2547.072 - 76.41216 = 2470.65984 cents ($24.7065984).
- contract_adjustment: the rate record defines none; not applied.

Step 5, patient share: 0 cents ($0.00) from the line's PR adjustments (none); reported beside the expected amount, never subtracted from it.
- **Unpriced: `SECONDARY_PAYER`.** Claim status 21 (processed as tertiary and forwarded): secondary and tertiary claims are unpriced in v0 and v1.

## Results

| Line | Outcome | Expected allowed (cents) | Unrounded (cents) | Rounding | Patient share (cents) | Variance (cents) | Dispute window | Review flags |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | unpriced `SECONDARY_PAYER` | | | | | | | |

# Worksheet G126: No fee-schedule value under a percent lesser-of: NO_PFS_VALUE

Computed by the independent worksheet tools/golden-worksheet (Python, exact decimal arithmetic; no code shared with packages/pricing).
Specialist verified: no. A reimbursement specialist checks every figure here before milestones 5 and 7 close.
Every reference value comes from SYNTHETIC release 900003: invented for tests, never a CMS value.

## Inputs

- Release 900003 at fixtures/synthetic/rules/release-synth-900003; its MANIFEST.json has SHA-256 e4d7228d5344d9fc824b223ae7d1af7608c81a2c9ec9fc31db1e66f1e555f5c8 and every file matched it.
- Practice settings: ZIP 00011; default rounding HALF_UP_CENT.
- Place-of-service settings (SYNTHETIC test assumption; fixtures/golden/QUESTIONS.md): 11 non-facility; 22 facility.
- Claim SYNTH-CLAIM-G126: status 1 (processed as primary); reversed by a later claim: no; superseded by a correction: no; payer and plan SYNTH-PAYER-B/PLAN-HMO.
- Remittance date: 2026-05-07; dispute windows are judged on the triage date 2026-10-15.
- Mapping map-b-hmo: contract, contract version cv-b-1, 2026-01-01 to open.
- Contract version cv-b-1 (contract contract-synth-b, version 1, signed_off, 2026-01-01 to open; windows: timely filing 365 days, dispute not stated, appeal levels none stated):
  - Rate record rr-b-fixed: LESSER_OF the line charge and the schedule (FIXED_SCHEDULE, 3400 cents ($34.00) per unit); scope codes 97110, 97112, 97116, 97140; any modifiers; any place of service; 2026-01-01 to open; flags apply_mppr off, apply_assistant_reduction off, apply_sequestration on, apply_ncci off; timed_units_rule MEDICARE_POOLED; rounding HALF_EVEN_CENT; contract-specific adjustment pays 98% of the amount.
  - Rate record rr-b-medicare: LESSER_OF the line charge and the schedule (PERCENT_OF_MEDICARE at 125%, year basis CURRENT, locality basis practice, conversion factor non_qualifying_apm); scope codes 97530, 97161, 97162, 97163, 97164, 97026, 97035, G0283, 97750; any modifiers; any place of service; 2026-01-01 to open; flags apply_mppr off, apply_assistant_reduction on, apply_sequestration off, apply_ncci on; timed_units_rule PER_CODE; rounding TRUNCATE; contract-specific adjustment none.

| Line | Code | Modifiers | Units | Service date | POS | Charge (cents) | Observed allowed (cents) | PR adjustments (cents) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 97750 | GP | 1 | 2026-04-16 | 11 | 8000 | 4000 (amt_b6) | none |
| 2 | G0283 | GP | 1 | 2026-04-16 | 22 | 2000 | 800 (amt_b6) | none |
| 3 | 97530 | GP | 1 | 2026-04-16 | 22 | 7000 | 1700 (amt_b6) | none |

## Steps 1 to 3, per line

### Line 1: 97750 x 1 on 2026-04-16

Step 1, the agreement.
- Mapping map-b-hmo (contract, 2026-01-01 to open) is in force on 2026-04-16.
- The mapping names contract version cv-b-1 of contract contract-synth-b; the version that prices the line is the signed-off one of that contract in force on 2026-04-16:
  - cv-b-1 (version 1, signed_off, 2026-01-01 to open): signed off and in force.
- Rate records of cv-b-1 against code 97750, modifier set [GP], place of service 11, 2026-04-16:
  - rr-b-fixed (codes 97110, 97112, 97116, 97140; any modifiers; any place of service; 2026-01-01 to open): no match, code 97750 is not in its codes.
  - rr-b-medicare (codes 97530, 97161, 97162, 97163, 97164, 97026, 97035, G0283, 97750; any modifiers; any place of service; 2026-01-01 to open): matches.
- Rate record rr-b-medicare: LESSER_OF the line charge and the schedule (PERCENT_OF_MEDICARE at 125%, year basis CURRENT, locality basis practice, conversion factor non_qualifying_apm); flags apply_mppr off, apply_assistant_reduction on, apply_sequestration off, apply_ncci on; timed_units_rule PER_CODE; rounding TRUNCATE; contract-specific adjustment: none.

Step 2, the base amount by method.
- LESSER_OF: the schedule's amount for the units billed is compared with the line charge in step 3, and the lesser is the base.
- Year basis CURRENT: the fee schedule in effect on the date of service, 2026-04-16 (basis year 2026); each value is the record in force on that date.
- **Unpriced: `NO_PFS_VALUE`.** Release 900003 has no relative value (pfs_rvu) for 97750 in 2026.

### Line 2: G0283 x 1 on 2026-04-16

Step 1, the agreement.
- Mapping map-b-hmo (contract, 2026-01-01 to open) is in force on 2026-04-16.
- The mapping names contract version cv-b-1 of contract contract-synth-b; the version that prices the line is the signed-off one of that contract in force on 2026-04-16:
  - cv-b-1 (version 1, signed_off, 2026-01-01 to open): signed off and in force.
- Rate records of cv-b-1 against code G0283, modifier set [GP], place of service 22, 2026-04-16:
  - rr-b-fixed (codes 97110, 97112, 97116, 97140; any modifiers; any place of service; 2026-01-01 to open): no match, code G0283 is not in its codes.
  - rr-b-medicare (codes 97530, 97161, 97162, 97163, 97164, 97026, 97035, G0283, 97750; any modifiers; any place of service; 2026-01-01 to open): matches.
- Rate record rr-b-medicare: LESSER_OF the line charge and the schedule (PERCENT_OF_MEDICARE at 125%, year basis CURRENT, locality basis practice, conversion factor non_qualifying_apm); flags apply_mppr off, apply_assistant_reduction on, apply_sequestration off, apply_ncci on; timed_units_rule PER_CODE; rounding TRUNCATE; contract-specific adjustment: none.

Step 2, the base amount by method.
- LESSER_OF: the schedule's amount for the units billed is compared with the line charge in step 3, and the lesser is the base.
- Year basis CURRENT: the fee schedule in effect on the date of service, 2026-04-16 (basis year 2026); each value is the record in force on that date.
- pfs_rvu G0283 (year 2026, quarter A, 2026-01-01 to 2026-12-31): work 0.08, PE non-facility 0.28, PE facility 0.00 (NA), MP 0.08, status A.
- Place of service 22 is facility, so the facility practice-expense value applies.
- **Unpriced: `NO_PFS_VALUE`.** The facility practice-expense value of G0283 is NA in 2026: the code has no relative value for this setting (fixtures/golden/QUESTIONS.md).

### Line 3: 97530 x 1 on 2026-04-16

Step 1, the agreement.
- Mapping map-b-hmo (contract, 2026-01-01 to open) is in force on 2026-04-16.
- The mapping names contract version cv-b-1 of contract contract-synth-b; the version that prices the line is the signed-off one of that contract in force on 2026-04-16:
  - cv-b-1 (version 1, signed_off, 2026-01-01 to open): signed off and in force.
- Rate records of cv-b-1 against code 97530, modifier set [GP], place of service 22, 2026-04-16:
  - rr-b-fixed (codes 97110, 97112, 97116, 97140; any modifiers; any place of service; 2026-01-01 to open): no match, code 97530 is not in its codes.
  - rr-b-medicare (codes 97530, 97161, 97162, 97163, 97164, 97026, 97035, G0283, 97750; any modifiers; any place of service; 2026-01-01 to open): matches.
- Rate record rr-b-medicare: LESSER_OF the line charge and the schedule (PERCENT_OF_MEDICARE at 125%, year basis CURRENT, locality basis practice, conversion factor non_qualifying_apm); flags apply_mppr off, apply_assistant_reduction on, apply_sequestration off, apply_ncci on; timed_units_rule PER_CODE; rounding TRUNCATE; contract-specific adjustment: none.

Step 2, the base amount by method.
- LESSER_OF: the schedule's amount for the units billed is compared with the line charge in step 3, and the lesser is the base.
- Year basis CURRENT: the fee schedule in effect on the date of service, 2026-04-16 (basis year 2026); each value is the record in force on that date.
- pfs_rvu 97530 (year 2026, quarter A, 2026-01-01 to 2026-12-31): work 0.35, PE non-facility 0.95, PE facility 0.25, MP 0.15, status A.
- Place of service 22 is facility, so the facility practice-expense value applies.
- Locality: practice ZIP 00011 maps to carrier 99999 locality 01 (locality_map in force on 2026-04-16, 2026-01-01 to 2026-12-31).
- pfs_gpci 99999-01 (2026-01-01 to 2026-12-31): work 1.000, PE 0.950, MP 0.650.
- conversion_factor non_qualifying_apm (2026-01-01 to 2026-12-31): $20.0000 per RVU.
- Geographically adjusted RVUs: work 0.35 x 1.000 = 0.35; PE 0.25 x 0.950 = 0.2375; MP 0.15 x 0.650 = 0.0975; total 0.685.
- Fee schedule amount per unit: 0.685 x $20.0000 = $13.70.
- At 125%, per unit: work 875 cents ($8.75), practice expense 593.75 cents ($5.9375), malpractice 243.75 cents ($2.4375); total 1712.5 cents ($17.125).

Step 3, units and edits.
- Units: 1 as billed, under the timed-units rule PER_CODE, recorded: until minute logs are imported the units are taken as billed (PRD 2 point 6).
- Medically unlikely edit: apply_ncci is on; ncci_mue 97530 (2026-01-01 to 2026-12-31, adjudication indicator 3) allows 5 unit(s); 1 is within it.
- Base, the lesser of the schedule and the line charge: the schedule for 1 unit(s) is 1712.5 cents ($17.125) x 1 = 1712.5 cents ($17.125); the line charge is 7000 cents ($70.00); the lesser is the schedule, 1712.5 cents ($17.125).
- Procedure-to-procedure edits: apply_ncci is on; no ncci_ptp record in force on 2026-04-16 has 97530 in column 2 and another line's code of the date in column 1.

## Steps 4 to 8, per line

### Line 3

Step 4, adjustments in order: the multiple procedure reduction, the assistant reduction and sequestration where their flags are on, then the rate record's own.
- mppr: flag apply_mppr is off; not applied.
- sequestration: flag apply_sequestration is off; not applied.
- assistant_reduction: before 1712.5, after 1712.5; no CQ or CO modifier on the line; unchanged.
- contract_adjustment: the rate record defines none; not applied.

Step 5, patient share: 0 cents ($0.00) from the line's PR adjustments (none); reported beside the expected amount, never subtracted from it.
- Claim status 1 (processed as primary); the claim is not reversed.

Step 6, rounding once: 1712.5 cents under TRUNCATE (the rate record's rule; fractions of a cent are dropped toward zero) = **1712 cents ($17.12)**; the unrounded 1712.5 is kept beside it.

Step 7, variance: expected allowed 1712 - observed allowed 1700 cents (amt_b6) = 12 cents: an underpayment.

Step 8, dispute window: the contract states no dispute window, so the release's commercial default first-level window applies (dispute_window commercial_default redetermination, 2026-01-01 to open, in force on the remittance date 2026-05-07): 4 months from the date of service 2026-04-16, ends on 2026-08-16; on the triage date 2026-10-15 it is passed: WINDOW_PASSED, validated and not actionable; the amount is unchanged.

## Results

| Line | Outcome | Expected allowed (cents) | Unrounded (cents) | Rounding | Patient share (cents) | Variance (cents) | Dispute window | Review flags |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | unpriced `NO_PFS_VALUE` | | | | | | | |
| 2 | unpriced `NO_PFS_VALUE` | | | | | | | |
| 3 | priced | 1712 | 1712.5 | TRUNCATE | 0 | 12 | WINDOW_PASSED (ends 2026-08-16) | none |

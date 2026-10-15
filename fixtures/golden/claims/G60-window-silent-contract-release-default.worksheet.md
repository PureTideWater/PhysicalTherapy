# Worksheet G60: A contract silent on disputes: the release's commercial default, 4 months from the date of service, to the month's last day

Computed by the independent worksheet tools/golden-worksheet (Python, exact decimal arithmetic; no code shared with packages/pricing).
Specialist verified: no. A reimbursement specialist checks every figure here before milestone 5 closes.
Every reference value comes from SYNTHETIC release 900003: invented for tests, never a CMS value.

## Inputs

- Release 900003 at fixtures/synthetic/rules/release-synth-900003; its MANIFEST.json has SHA-256 e4d7228d5344d9fc824b223ae7d1af7608c81a2c9ec9fc31db1e66f1e555f5c8 and every file matched it.
- Practice settings: ZIP 00011; default rounding HALF_UP_CENT.
- Place-of-service settings (SYNTHETIC test assumption; fixtures/golden/QUESTIONS.md): 11 non-facility; 22 facility.
- Claim SYNTH-CLAIM-G60: status 1 (processed as primary); reversed by a later claim: no; superseded by a correction: no; payer and plan SYNTH-PAYER-G60/PLAN-1.
- Remittance date: 2026-06-25; dispute windows are judged on the triage date 2026-10-15.
- Mapping map-g60: contract, contract version cv-g60-1, 2026-01-01 to open.
- Contract version cv-g60-1 (contract contract-g60, version 1, signed_off, 2026-01-01 to open; windows: timely filing not stated, dispute not stated, appeal levels none stated):
  - Rate record rr-g60-1: PERCENT_OF_MEDICARE 110%, CURRENT, locality practice, non_qualifying_apm; scope any code; any modifiers; any place of service; 2026-01-01 to open; flags apply_mppr off, apply_assistant_reduction off, apply_sequestration off, apply_ncci off; timed_units_rule PER_CODE; rounding not stated.

| Line | Code | Modifiers | Units | Service date | POS | Charge (cents) | Observed allowed (cents) | PR adjustments (cents) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 97110 | GP | 1 | 2026-05-31 | 11 | 6000 | 2000 (amt_b6) | none |

## Steps 1 to 3, per line

### Line 1: 97110 x 1 on 2026-05-31

Step 1, the agreement.
- Mapping map-g60 (contract, 2026-01-01 to open) is in force on 2026-05-31.
- The mapping names contract version cv-g60-1 of contract contract-g60; the version that prices the line is the signed-off one of that contract in force on 2026-05-31:
  - cv-g60-1 (version 1, signed_off, 2026-01-01 to open): signed off and in force.
- Rate records of cv-g60-1 against code 97110, modifier set [GP], place of service 11, 2026-05-31:
  - rr-g60-1 (any code; any modifiers; any place of service; 2026-01-01 to open): matches.
- Rate record rr-g60-1: PERCENT_OF_MEDICARE at 110%, year basis CURRENT, locality basis practice, conversion factor non_qualifying_apm; flags apply_mppr off, apply_assistant_reduction off, apply_sequestration off, apply_ncci off; timed_units_rule PER_CODE; rounding not stated (the practice default applies).

Step 2, the base amount by method.
- Year basis CURRENT: the fee schedule in effect on the date of service, 2026-05-31 (basis year 2026); each value is the record in force on that date.
- pfs_rvu 97110 (year 2026, quarter A, 2026-01-01 to 2026-12-31): work 0.31, PE non-facility 0.71, PE facility 0.21, MP 0.11, status A.
- Place of service 11 is non-facility, so the non-facility practice-expense value applies.
- Locality: practice ZIP 00011 maps to carrier 99999 locality 01 (locality_map in force on 2026-05-31, 2026-01-01 to 2026-12-31).
- pfs_gpci 99999-01 (2026-01-01 to 2026-12-31): work 1.000, PE 0.950, MP 0.650.
- conversion_factor non_qualifying_apm (2026-01-01 to 2026-12-31): $20.0000 per RVU.
- Geographically adjusted RVUs: work 0.31 x 1.000 = 0.31; PE 0.71 x 0.950 = 0.6745; MP 0.11 x 0.650 = 0.0715; total 1.056.
- Fee schedule amount per unit: 1.056 x $20.0000 = $21.12.
- At 110%, per unit: work 682 cents ($6.82), practice expense 1483.9 cents ($14.839), malpractice 157.3 cents ($1.573); total 2323.2 cents ($23.232).

Step 3, units: 1 as billed; 2323.2 cents ($23.232) x 1 = 2323.2 cents ($23.232).

## Steps 4 to 8, per line

### Line 1

Step 4, flagged adjustments in order (multiple procedure reduction, assistant reduction, sequestration).
- mppr: flag apply_mppr is off; not applied.
- assistant_reduction: flag apply_assistant_reduction is off; not applied.
- sequestration: flag apply_sequestration is off; not applied.
- Contract-specific adjustments: none (phase one rate records define none).

Step 5, patient share: 0 cents ($0.00) from the line's PR adjustments (none); reported beside the expected amount, never subtracted from it.
- Claim status 1 (processed as primary); the claim is not reversed.

Step 6, rounding once: 2323.2 cents under HALF_UP_CENT (the practice default; halves move away from zero) = **2323 cents ($23.23)**; the unrounded 2323.2 is kept beside it.

Step 7, variance: expected allowed 2323 - observed allowed 2000 cents (amt_b6) = 323 cents: an underpayment.

Step 8, dispute window: the contract states no dispute window, so the release's commercial default first-level window applies (dispute_window commercial_default redetermination, 2026-01-01 to open, in force on the remittance date 2026-06-25): 4 months from the date of service 2026-05-31, ends on 2026-09-30; on the triage date 2026-10-15 it is passed: WINDOW_PASSED, validated and not actionable; the amount is unchanged.

## Results

| Line | Outcome | Expected allowed (cents) | Unrounded (cents) | Rounding | Patient share (cents) | Variance (cents) | Dispute window |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | priced | 2323 | 2323.2 | HALF_UP_CENT | 0 | 323 | WINDOW_PASSED (ends 2026-09-30) |

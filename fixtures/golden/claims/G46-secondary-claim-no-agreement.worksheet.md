# Worksheet G46: A secondary claim mapped as no agreement

Computed by the independent worksheet tools/golden-worksheet (Python, exact decimal arithmetic; no code shared with packages/pricing).
Specialist verified: no. A reimbursement specialist checks every figure here before milestone 5 closes.
Every reference value comes from SYNTHETIC release 900001: invented for tests, never a CMS value.

## Inputs

- Release 900001 at fixtures/synthetic/rules/release-synth-900001; its MANIFEST.json has SHA-256 6d346c8fa596c0f720ff3176be10044e86c9b4fe843d37b04c59192cdbdce45a and every file matched it.
- Practice settings: ZIP 00011; default rounding HALF_UP_CENT.
- Place-of-service settings (SYNTHETIC test assumption; fixtures/golden/QUESTIONS.md): 11 non-facility; 22 facility.
- Claim SYNTH-CLAIM-G46: status 2 (processed as secondary); reversed by a later claim: no; superseded by a correction: no; payer and plan SYNTH-PAYER-OON/PLAN-2.
- Remittance date: not known; dispute windows are judged on the triage date 2026-10-15.
- Mapping map-g46: no_agreement, 2026-01-01 to open.
- Contract versions: none.

| Line | Code | Modifiers | Units | Service date | POS | Charge (cents) | Observed allowed (cents) | PR adjustments (cents) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 97110 | GP | 1 | 2026-03-10 | 11 | 6000 | 300 (amt_b6) | none |

## Steps 1 to 3, per line

### Line 1: 97110 x 1 on 2026-03-10

Step 1, the agreement.
- Mapping map-g46 (no_agreement, 2026-01-01 to open) is in force on 2026-03-10.
- **Unpriced: `NO_AGREEMENT`.** The plan is mapped as no_agreement: no agreement governs the line.

## Results

| Line | Outcome | Expected allowed (cents) | Unrounded (cents) | Rounding | Patient share (cents) | Variance (cents) | Dispute window |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | unpriced `NO_AGREEMENT` | | | | | | |

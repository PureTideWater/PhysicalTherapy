# SYNTHETIC variant therapy rules for the golden lines (release 900003)

Invented values for tests only. None of these is a CMS, state or X12 value, and none may be used to
price a real line. Release fixtures/synthetic/rules/release-synth-900003 is release 900001 with these
records in place of its sequestration, general multiple procedure reduction and dispute window records.

- SYNTHETIC sequestration takes 3% of the payment after the beneficiary share from January 1, 2026 through June 30, 2026.
- SYNTHETIC sequestration is suspended from July 1, 2026: it takes 0%.
- SYNTHETIC multiple procedure reduction: 45% of the practice-expense component of the second and later always-therapy units in a day, for a code the MPPR file lists without a share of its own, from January 1, 2026.
- SYNTHETIC timely filing: 11 months from the date of service.
- SYNTHETIC redetermination window: 111 days.
- SYNTHETIC reconsideration window: 171 days.
- SYNTHETIC commercial default dispute window, where a contract states none: 4 months from the date of service.

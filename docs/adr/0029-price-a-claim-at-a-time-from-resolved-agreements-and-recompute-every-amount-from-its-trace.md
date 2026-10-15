# 0029. Price a claim at a time from resolved agreements, and recompute every amount from its trace

- **Status:** accepted
- **Date:** 2026-10-15
- **Deciders:** founder (engineering); the reimbursement specialist reviews the questions below before milestone 5 closes
- **PRD sections:** 2 (what the engine must get right), 9 (contract rate records), 11 (the expected-payment engine), 18 (the pricing oracle and the gates); test matrix PRC-01 to PRC-18 and PRC-20

## Context

Milestone 5 builds phase one of `packages/pricing`: Medicare Advantage non-contracted lines and `PERCENT_OF_MEDICARE`
terms, current or locked to a year, with the locality, the two conversion factors, the multiple procedure reduction,
the assistant reduction, sequestration, the patient share, windows, one rounding, the closed list of unpriced reasons
and a trace that recomputes the amount. The engine must be pure: PRD 11 says it "imports nothing from the database and
nothing from the network". Several facts shape how:

- The multiple procedure reduction ranks every always-therapy unit of a day, so one line cannot be priced alone.
- `@tp/contracts` resolves a line's agreement purely (ADR 0028), but its runtime entry point also exports the loaders
  and workflow services, which import `@tp/db`; a runtime import would bring the database package into the engine.
- No rule record carries the facility or non-facility split by place of service (fixtures/golden QUESTIONS Q08).
- The golden lines (ADR 0020) were computed before the engine by the independent worksheet; they are the oracle, and
  their unrounded values can carry more than the six decimal places of `priced_line.expected_unrounded numeric(18,6)`.
- Contract records may carry methods (fixed schedule, lesser of, per visit), a contract-named locality and a timed-units
  rule of `UNKNOWN`, none of which has a golden line yet; `.claude/rules/money-and-contracts.md` asks for a golden line
  before every pricing branch.

## Decision

- **One pure function per claim.** `price({ claim, release, settings, asOf })` takes the claim's line facts, each with
  its agreement as `@tp/contracts`' resolver returned it (or `RESOLUTION_FAILED` when the resolver raised its invariant
  error), an indexed rule release (`indexRelease`), the practice settings (billing ZIP, default rounding, the place-of-
  service split) and the triage date, and returns one priced or unpriced result per line, in line order. The signed-off
  rate record that prices a contract line arrives inside its resolution, so there is no separate list of records.
  `@tp/contracts` is imported as types only; the runtime imports are `@tp/money`, `@tp/rules` (record types and
  hashing) and zod (the trace schema). A test parses the source and fails on any other import, a value import of
  `@tp/contracts`, or a clock, randomness, locale, environment or network call.
- **PRD 11 in order, and the golden worksheet's readings.** Step 1 takes the resolver's outcome; a version that is not
  signed off is `ENGINE_ERROR` (the resolver already refuses it; the engine checks again). Step 2: `UNSUPPORTED` is
  `UNSUPPORTED_METHOD`; for `PERCENT_OF_MEDICARE` the code's `pfs_rvu` (modifier blank), the practice ZIP's
  `locality_map` record on the service date, that locality's `pfs_gpci` and the named `conversion_factor`, each for the
  basis year (CURRENT: in force on the service date; `LOCKED:<year>`: the latest record in force during that year); a
  missing RVU, or a practice-expense value marked NA for the setting, is `NO_PFS_VALUE`. Each unit is kept as work,
  practice-expense and malpractice parts in cents at the record's percentage. Step 3 multiplies by the units as billed.
  Step 4 applies, each only with its flag: the reduction (per claim and service date, the units of the lines priced so
  far with `apply_mppr` and an `mppr_rate` record, ranked by practice-expense part, ties to the lower line then the
  earlier unit; the first kept whole; the rest cut by the code's share or the general practice-expense rate), the
  assistant percentage of the amount after it, and the sequestration percentage of the amount less the patient share,
  floored at zero. Every percentage is read from the release. Step 5 reports the patient share and stops claim status 2
  or 3 (`SECONDARY_PAYER`), 22, or a claim reversed and not corrected (`REVERSED_CLAIM`). Step 6 rounds once, under the
  record's rule, else the practice default, else `HALF_UP_CENT`. Steps 7 and 8 give the variance and the dispute window.
- **What phase one refuses, as `ENGINE_ERROR` with a fixed detail code, never a guess.** Methods of milestone 7
  (`method_not_in_phase_one`), a contract-named locality (`locality_basis_not_in_phase_one`), a place of service missing
  from the settings, a release without the locality, GPCI, conversion factor, assistant, sequestration or reduction
  record a line needs, two records of one rule in force at once, units that are not a whole number of at least one,
  claim statuses other than 1, 2, 3, 4 and 22, a reversed claim a correction supersedes, duplicate line numbers, and
  malformed facts or settings. Any other exception is caught per line as `unexpected`. `MUE_EXCEEDED` and
  `UNITS_RULE_UNKNOWN` are in the type and produced from milestone 7: until minute logs are imported the timed-units
  rule changes nothing (PRD 2 point 6: units are taken as billed), so a line under `UNKNOWN` prices and its trace records
  the rule.
- **The place-of-service split is a practice setting** (`placeOfServiceSettings`), the same table the golden claims
  state as a SYNTHETIC input, until a rule record carries it.
- **Windows.** A priced line's dispute deadline runs from the remittance date: a contract's `dispute_window_days`; when
  the contract is silent, the release's `dispute_window` for `commercial_default` and the first-level window
  (`redetermination`); for Medicare Advantage non-contracted lines, the `medicare` redetermination window. The record's
  `measured_from` names the start (unnamed: the remittance date). No remittance date, or no record, is `NO_WINDOW`. A
  deadline before the triage date is `WINDOW_PASSED`, which triage reads; it never changes the amount.
- **The trace** (`tp-pricing-trace/1`, `pricingTraceSchema`) is JSON for `priced_line.trace`: the engine version, the
  release number and manifest SHA-256, the triage date, the settings, claim and line facts verbatim, the agreement
  (mapping, version, rate record, matching records when ambiguous, the version's windows), the terms, each rule record
  used by type, key, window and `rule_record.sha256`, every intermediate amount (unit parts, base, each adjustment's
  before and after with its inputs, the day's whole ranking for the reduction), the rounding with its origin, the
  variance, the window, and the outcome with the step that stopped an unpriced line. Amounts are exact decimal text.
- **`recompute(trace)` is written apart from `price`** (it imports nothing of the engine, the release index or the
  window code) and works the amount out again from the trace alone, by its own formulation: cents per RVU as the
  factor times the percentage, the ranking re-sorted from the recorded units, the patient share re-summed from the line's
  PR adjustments, the stops derived again from the recorded facts. It returns the result and every difference from what
  the trace recorded, and refuses a trace that is malformed or priced without a step its amount needs.
- **The unrounded amount is exact.** The engine and the trace keep every digit. The migration that creates
  `priced_line` (milestone 7, pricing runs) should declare `expected_unrounded` as `numeric` without a scale, so the
  stored value is the exact one, rather than the data dictionary's `numeric(18,6)`, which would round it (G09 line 2 is
  2054.14327125 cents). The trace stays the record recompute reads either way.
- **The golden test runs the engine.** `tools/golden-worksheet/engine.ts` turns each golden claim into the engine's
  inputs the way production will (the release read and its manifest checked; the mappings, versions and signed-off
  rate records built as `loadAgreementRecords` returns them, inclusive ends turned into half-open ones and a null code
  list into the claim's own codes; each line resolved by `agreementResolver`). `engine.golden.test.ts` compares every
  line field by field, recomputes every trace (PRC-16), checks the reasons the golden lines hold, and with `--report`
  writes `fixtures/golden/.report/engine.{json,md}` beside the worksheet's report.

## Alternatives considered

| Option | Why not (or when we would switch) |
| --- | --- |
| `price(line)` one line at a time | The reduction needs the day's other units; a per-line call would need the claim anyway |
| The engine calls `agreementResolver` itself | A runtime import of `@tp/contracts` loads `@tp/db`. Revisit if contracts gains a pure subpath export |
| Fixed schedule, lesser of, per visit and named localities now | No golden line exists for them; milestone 7 brings both together |
| `UNITS_RULE_UNKNOWN` for a timed-units rule of `UNKNOWN` | Commercial records default to `UNKNOWN`, so every such line would be unpriced before minute logs exist, and the reason belongs to milestone 7 |
| `UNSUPPORTED_METHOD` for the methods of milestone 7 | That reason has no remedy ("None; reported") and would hide supported terms; `ENGINE_ERROR` reaches the operator |
| Recompute by calling `price` again | It would agree with itself; the test must find a trace the engine could not reproduce |
| Store only the rounded cents | Rule 2 keeps the unrounded value beside the rounded one |

## Consequences

- 100 golden lines match to the cent and every trace recomputes; branch coverage of `packages/pricing` is 100%; the
  property tests cover the PRD 11 properties; 100,000 lines price with their traces in about four seconds on one
  thread here (the PRC-20 test allows two minutes).
- Milestone 7 adds the remaining methods, NCCI and MUE, the pricing runs that store results, and the `priced_line`
  column above. Its golden lines come first, as these did.
- Questions for the reimbursement specialist, beside fixtures/golden/QUESTIONS.md: (1) is redetermination the right
  first-level window for a Medicare Advantage non-contracted line, and for a contract silent on disputes; (2) should
  claim status 19, 20 and 21 (processed and forwarded) price, as phase one refuses them; (3) a reversed claim whose
  units are negative is `ENGINE_ERROR` before it reaches `REVERSED_CLAIM`, the order PRD 11 gives; is that acceptable.

## Revisit when

The specialist answers the questions above or in QUESTIONS.md, milestone 7 adds a method or the NCCI edits, or
`@tp/contracts` gains an entry point without the database.

# 0020. Compute the golden lines with an independent worksheet until the specialist verifies them

- **Status:** accepted
- **Date:** 2026-10-15
- **Deciders:** founder (engineering); the reimbursement specialist reviews before milestone 5 closes
- **PRD sections:** 11 (the engine's algorithm, unpriced reasons, the worked example), 17 (tests before formulas), 18 (the pricing oracle); test matrix PRC-01 to PRC-20

## Context

The pricing oracle is "golden lines hand-computed by the reimbursement specialist from the published CMS files and
the fixture contracts, recorded in `fixtures/golden/` with the worksheet that produced them, before the engine code
exists", and milestone 5 opens by loading "the specialist's 100 golden lines". No specialist is available while the
milestone is prepared, the real CMS files cannot be downloaded here, and release 900001 holds one fee-schedule year,
so a contract locked to a prior year (PRC-04) has nothing to price from. The plan also leaves pricing judgements to
the specialist (sequestration against an AMT B6 observed allowed, ties in the multiple procedure ranking, the order
of the assistant and multiple procedure reductions, and others) that any computed line must settle one way.

## Decision

- **An independent worksheet computes the lines.** `tools/golden-worksheet/golden_worksheet.py` is Python, standard
  library only, run with `python3 -I`, and shares no code, language or library with `packages/pricing`. Every
  operation runs in a decimal context that traps an inexact result or any rounding, so the only rounding is the
  final one of each line. It follows PRD 11 step by step and writes a worksheet per claim (every input value, every
  intermediate amount, each adjustment's before and after, the rounding), embedded in the golden file and beside it
  as Markdown for review. It verifies the release's manifest hash and every file hash before reading a record.
- **Golden files are claims** (`tp-golden-claim/1`, documented in `fixtures/golden/README.md`), because the
  multiple procedure reduction ranks a day's units: 53 claims, 100 lines. Each holds the engine's inputs (line facts,
  mappings, contract versions and rate records with method, parameters, flags and rounding, practice settings, the
  place-of-service split, the release reference), the expected result per line, the worksheet, and provenance
  `{computed_by: "independent worksheet tools/golden-worksheet", specialist_verified: false}`.
- **Honest labels.** Nothing claims the specialist's verification. `fixtures/golden/QUESTIONS.md` lists every
  judgement call with the worksheet's choice, its alternatives and the claims that depend on it. `write` refuses to
  change a claim once `specialist_verified` is true.
- **`pnpm test:golden`** runs `tools/golden-worksheet/worksheet.golden.test.ts`: it recomputes every claim with the
  worksheet and fails on any difference in a cent, a reason, a field or a worksheet line, and checks that the set
  still covers the phase-one reasons and the PRC cases. `--report` writes `fixtures/golden/.report/worksheet.{md,json}`
  for the golden-diff skill. Milestone 5 adds the engine's comparison to the same test and report.
- **A second SYNTHETIC year in release 900002.** `tools/golden-worksheet/synthetic-release.ts` builds
  `fixtures/synthetic/rules/release-synth-900002` from every file of 900001, unchanged, plus 2025 RVUs, GPCIs and
  conversion factors parsed by the real parsers from SYNTHETIC files in `fixtures/golden/sources` (the file list of
  `fixtures/synthetic/cms` is pinned by a rules test to 900001's sources). A unit test keeps the committed release
  equal to the build, and the content checker passes it.

## Alternatives considered

| Option | Why not |
| --- | --- |
| The worksheet in TypeScript, beside the engine | Shares the language, `@tp/money` and the habits of the engine's author; a shared misreading of decimal.js or of a helper would agree with itself |
| A spreadsheet | Not reproducible in CI, and a cell formula rounds where the format says |
| Expected values typed by hand without a program | Nothing re-derives them; a typo would become the oracle |
| Waiting for the specialist | Milestone 5 would start without tests before formulas, the order PRD 17 requires |
| Extending `tools/release/synthetic.ts` and `fixtures/synthetic/cms` | That builder and its sources are release 900001's, pinned by their own tests; release 900001 never changes |

## Consequences

- The specialist reviews 53 worksheets and 30 questions before milestone 5 can close; a changed answer is an input
  or worksheet change, then `write`, then a diff reviewed like code.
- The engine consumes the same inputs. Two findings for milestone 5: unrounded values can carry more than the six
  decimal places of `priced_line.expected_unrounded numeric(18,6)`; and the facility split by place of service has no
  rule record, so each golden file states it as a SYNTHETIC input.
- CI already installs Python for the pyx12 oracle; `pnpm test` and `pnpm test:golden` now need `python3` (3.11 or
  later; the tests pass on 3.11, 3.12 and 3.13) on the path.

## Revisit when

The specialist answers `fixtures/golden/QUESTIONS.md`, milestone 7 adds the remaining methods and NCCI (the worksheet
refuses them until their golden lines exist), or real release-1 files replace the SYNTHETIC values.

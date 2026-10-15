# 0007. Brand cents, narrow the decimal type, and make rounding the only way from unrounded to cents

- **Status:** accepted
- **Date:** 2026-10-15
- **Deciders:** founder (engineering)
- **PRD sections:** 1 (rule 2), 11 (step 6, rounding once; properties), 18 (what never ships: a float in a money path)

## Context

Milestone 0 asks for money helpers whose conversions "make float misuse impossible by type": integer cents,
exact decimals for rates and unrounded values, three contract rounding rules applied once, and no float on any
amount. Part A had `type Cents = bigint` (any bigint was cents) and exported the decimal.js constructor, whose
methods accept JavaScript numbers (`d.times(1.1)`) and offer `toNumber()` and `toDecimalPlaces()`, so a float or
a second rounding could reach a money path without a compile error. ESLint catches float literals and
`Number()` in the money packages, but not a number passed into decimal.js or a value rounded twice.

## Decision

- `Cents` is a branded `bigint`. It is built only by `cents(bigint)`, the parsers (`parseAmount` for dollar
  text, `parseCents` for the JSON integer string) and the arithmetic helpers. `cents()` also refuses a number at
  runtime, for values that arrive through a cast.
- `Decimal` is our own interface over a small wrapper around decimal.js (exponent notation off). Sums,
  differences and products are exact: they run in a decimal.js clone at its maximum precision (a billion
  significant digits), so no intermediate value loses a digit and a line can only be rounded where
  `roundToCents` rounds it. Division is the one inexact operation: a quotient that does not terminate stops at
  40 significant digits (`QUOTIENT_DIGITS`); dividing by 100 for a percentage terminates and is exact. Its
  operands are `Decimal` only, checked at compile time and at runtime; it has no `toNumber` and no rounding
  method. `decimal(text | bigint | Decimal)` builds one and refuses anything else, including exponent and
  leading-point text; `rate()` adds the numeric(14,6) shape check.
- `UnroundedCents` is a branded `Decimal` produced by `multiplyCents`, `addUnrounded`, `sumUnrounded` and
  `unroundedFromDollars`. `roundToCents(UnroundedCents, rule)` is the one function from unrounded to `Cents`;
  passing `Cents` (already rounded) or a bare `Decimal` does not compile. `roundOnce` returns the cents with the
  unrounded value and the rule beside them.
- `packages/rules` joins the packages under the float lint rule, since rule records carry cents and rates.
- `src/types.test.ts` holds `@ts-expect-error` lines for each misuse, so `pnpm typecheck` fails if one starts to
  compile.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Keep exporting the decimal.js constructor and rely on lint | Lint sees literals, not a number that flows in from elsewhere; `toNumber()` and `toDecimalPlaces()` stay one call away |
| A cast of one 40-digit decimal.js clone to the narrow interface (this ADR's first version) | decimal.js rounds sums and products at the clone's precision too, so a term below the 40th digit next to a half could be rounded twice (0.5 minus 10^-41 rounded to 1 cent, not 0); a cast cannot route division to a second clone |
| One clone at maximum precision for everything | A non-terminating quotient would compute a billion digits |
| Plain `bigint` cents with naming conventions | A unit count or an ID is also a bigint; the brand makes "this was parsed or computed as money" a type |

## Consequences

- The pricing engine (milestone 5) composes amounts as `UnroundedCents` and rounds once per line; a reviewer can
  grep for `roundToCents` to find every rounding step.
- Code outside the money packages that needs a decimal goes through `decimal()`; there is no `new Decimal`.
- `Decimal.dividedBy` rounds non-terminating quotients at 40 significant digits, far below a cent; dividing by
  100 for a percentage is exact. A test holds the double-rounding case above, and the product of eight
  eight-digit rates, to their exact values.
- The wrapper costs one small object per operation; the pricing performance target (100,000 lines in two
  minutes) is measured when the engine lands.

## Revisit when

A consumer needs an operation the narrow interface lacks (add it to the interface, with a test), or decimal.js
is replaced.

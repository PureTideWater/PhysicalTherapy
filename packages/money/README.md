# @tp/money

The only arithmetic path for money in the platform (CLAUDE.md rule 2).

- **Amounts are integer cents held as `bigint`.** `parseAmount("12.34")` reads decimal text digit by
  digit into `1234n`; `formatCents` and `formatUsd` write it back without passing through a float.
- **Rates are decimals.** `rate("1.10")` parses a `numeric(14,6)` value into a `Decimal` (decimal.js,
  40 significant digits). `multiplyCents` keeps the full unrounded product in cents.
- **Rounding happens once per line.** `roundToCents(unrounded, rule)` applies the contract's rule
  (`HALF_UP_CENT`, `HALF_EVEN_CENT` or `TRUNCATE`; `HALF_UP_CENT` when the contract is silent). Callers
  keep the unrounded value beside the rounded one.

## How money code avoids floats

ESLint (`eslint.config.js`) fails the build on any of these inside `packages/money`, `packages/pricing`,
`packages/ledger` and `packages/packets`, tests included:

| Forbidden | Write instead |
| --- | --- |
| `parseFloat(text)`, `Number.parseFloat(text)` | `parseAmount(text)` for amounts, `rate(text)` for rates |
| `Number(value)`, `new Number(value)` | keep the `bigint`; use `BigInt(text)` for whole numbers |
| a fractional or exponent literal such as `1.1`, `.85` or `1e3` | `rate('1.10')`, `new Decimal('0.85')`, `1000n` |

Decimal values are only ever constructed from strings or bigints (`new Decimal('0.5')`,
`centsToDecimal(1234n)`), never from a JavaScript number with a fraction. Integer literals such as `2`
or `100n` are fine. `Intl.NumberFormat` receives the exact decimal string (`"1234.56"`), which the
standard formats without converting it to a double.

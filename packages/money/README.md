# @tp/money

The only arithmetic path for money in the platform (CLAUDE.md rule 2).

- **Amounts are integer cents, a branded `bigint` (`Cents`).** A plain `number` or an unchecked `bigint`
  does not type-check where cents are expected. Build cents with `cents(1234n)`, from dollar text with
  `parseAmount("12.34")` (digit by digit, refusing a third decimal place), or from their JSON form with
  `parseCents("1234")`; write them back with `formatCents` (`"12.34"`), `centsToString` (`"1234"`) or
  `formatUsd(cents, locale)`, none of which passes through a float. Add and subtract with `addCents`,
  `subtractCents`, `negateCents`, `sumCents`, `compareCents`, `minCents` and `maxCents`.
- **Rates and unrounded values are `Decimal`s** (decimal.js at 40 significant digits, behind a narrower
  interface). `decimal("0.85")` and `decimal(85n)` build them; `rate("1.10")` also checks the numeric(14,6)
  shape. Operands are other decimals only: `d.times(2)` and `d.plus("1")` do not compile, and there is no
  `toNumber`. Text output is always plain digits, never exponent notation.
- **Rounding happens once per line.** `multiplyCents(amount, rate)` keeps the full product as
  `UnroundedCents`; `addUnrounded`, `sumUnrounded` and `unroundedFromDollars` keep it unrounded. Only
  `roundToCents(unrounded, rule)` turns it into `Cents`, under the contract's rule (`HALF_UP_CENT`,
  `HALF_EVEN_CENT` or `TRUNCATE`; `DEFAULT_ROUNDING` is `HALF_UP_CENT`). `Cents` cannot be passed back in, so
  rounding twice does not compile. `roundOnce` returns the cents with the unrounded value and the rule beside
  them, as a priced line stores them.

`src/types.test.ts` holds the compile-time checks: each `@ts-expect-error` there is a float misuse that must
stay a type error, so `pnpm typecheck` fails if one starts to compile.

## How money code avoids floats

ESLint (`eslint.config.js`) fails the build on any of these inside `packages/money`, `packages/pricing`,
`packages/ledger`, `packages/packets` and `packages/rules`, tests included:

| Forbidden | Write instead |
| --- | --- |
| `parseFloat(text)`, `Number.parseFloat(text)` | `parseAmount(text)` for amounts, `rate(text)` or `decimal(text)` for rates |
| `Number(value)`, `new Number(value)` | keep the `bigint`; use `BigInt(text)` for whole numbers |
| a fractional or exponent literal such as `1.1`, `.85` or `1e3` | `rate('1.10')`, `decimal('0.85')`, `1000n` |

Decimals are only ever built from strings, bigints or other decimals; `decimal()` refuses a JavaScript number at
compile time and at runtime. `Intl.NumberFormat` receives the exact decimal string (`"1234.56"`), which the
standard formats without converting it to a double.

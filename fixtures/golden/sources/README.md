# fixtures/golden/sources

**SYNTHETIC, invented values. Not CMS data, never for pricing a real line.**

A second fee-schedule year for the golden lines locked to a prior year (`LOCKED:2025`, test matrix PRC-04). Release
900001 holds only 2026, and it is never changed, so `tools/golden-worksheet/synthetic-release.ts` builds
`fixtures/synthetic/rules/release-synth-900002`: every file of 900001 unchanged, plus the records parsed from these
files by the same parsers as real imports (`packages/rules/src/parsers`).

| File | Layout of | Parser | Notes |
| --- | --- | --- | --- |
| `PPRRVU_SYNTHETIC_2025.csv` | CMS PFS relative value file (PPRRVU) | `pfs_rvu` | 97026 is absent on purpose (`NO_PFS_VALUE` under `LOCKED:2025`); 97110 and 97112 share a non-facility PE RVU on purpose (a tie in the multiple procedure ranking) |
| `GPCI_SYNTHETIC_2025.csv` | CMS GPCI file | `pfs_gpci` | The SYNTHETIC locality 99999-01 with 2025 indices |
| `conversion-factor-SYNTHETIC-2025-pass-1.csv`, `-pass-2.csv` | The reviewer's conversion-factor CSV, prepared twice | `conversion_factor` | The builder refuses to run if the two preparations differ |

The variant release 900003, for the golden lines of a suspended sequestration, the general reduction rate and a
contract's default dispute window, is release 900001 with four of its record files replaced
(`tools/golden-worksheet/synthetic-release.ts`):

| File | What it is |
| --- | --- |
| `synthetic-rules-900003.md` | The SYNTHETIC sentences its hand-typed records quote: sequestration at 3% to 2026-06-30 and suspended from 2026-07-01, a 45% general reduction, the three Medicare windows and a commercial default dispute window of 4 months from the date of service |
| `MPPR_SYNTHETIC_900003.csv` | Release 900001's MPPR rate file with 97112's share left blank, parsed by the `mppr_rate` parser (the share becomes null) |

The hand-typed records and their second passes are committed in the release directory, as release 900001's are.

They live here rather than in `fixtures/synthetic/cms`, whose file list a rules test pins to release 900001's
sources. Changing a byte here means rebuilding release 900002 (`pnpm exec tsx tools/golden-worksheet/synthetic-release.ts`),
updating every golden claim's `inputs.release.manifest_sha256` that names it, and running the worksheet's `write`.

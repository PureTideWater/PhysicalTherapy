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

They live here rather than in `fixtures/synthetic/cms`, whose file list a rules test pins to release 900001's
sources. Changing a byte here means rebuilding release 900002 (`pnpm exec tsx tools/golden-worksheet/synthetic-release.ts`),
updating every golden claim's `inputs.release.manifest_sha256` that names it, and running the worksheet's `write`.

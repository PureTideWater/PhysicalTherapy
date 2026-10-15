# fixtures/synthetic/cms

**SYNTHETIC, invented values. Not CMS data, not X12 data, never for pricing a real line.**

Small files laid out like the public files the rule parsers read (`packages/rules/src/parsers`), so the
parsers, the content checker and the release loader can be tested without the real downloads. Every
number is invented and deliberately patterned (for example work RVUs of 0.31 to 0.35 for the timed
codes); the carrier `99999`, the state `ZZ` and ZIP codes `00011` and `00012` do not exist; code-list
descriptions say SYNTHETIC. Every file says SYNTHETIC on its first line except `ZIP5_SYNTHETIC.txt`,
whose fixed-width layout has no room for a banner. None of them can enter `content/`: `pnpm rules:import`
and `pnpm verify-content` refuse a SYNTHETIC banner, the bytes of any file here, and the reserved carrier
99999, state ZZ and ZIP codes 00000 to 00099.

| File | Layout of | Parser |
| --- | --- | --- |
| `PPRRVU_SYNTHETIC.csv` | CMS PFS relative value file (PPRRVU), stacked headings | `pfs_rvu` |
| `GPCI_SYNTHETIC.csv` | CMS GPCI file, one locality and a footnote | `pfs_gpci` |
| `ZIP5_SYNTHETIC.txt` | CMS ZIP code to carrier locality file (ZIP5) | `locality_map` |
| `conversion-factor-SYNTHETIC-pass-1.csv`, `-pass-2.csv` | the reviewer's conversion-factor CSV, prepared twice | `conversion_factor` |
| `MPPR_SYNTHETIC.csv` | CMS therapy MPPR rate file, one code repeated | `mppr_rate` |
| `NCCI_PTP_SYNTHETIC.txt` | NCCI practitioner PTP edits (tab-separated) | `ncci_ptp` |
| `NCCI_MUE_SYNTHETIC.csv` | NCCI practitioner services MUE table | `ncci_mue` |
| `CARC_SYNTHETIC.csv`, `RARC_SYNTHETIC.csv`, `CLAIM_STATUS_SYNTHETIC.csv` | X12 code list exports | `carc`, `rarc`, `claim_status_code` |
| `synthetic-rules.md` | the sentences the hand-typed synthetic records quote | (hand-typed) |

These files are the stored sources of `fixtures/synthetic/rules/release-synth-900001`: its records carry
their SHA-256, so changing a byte here means rebuilding that release (`tsx tools/release/synthetic.ts`)
and updating the hand-typed records' `source.sha256`.

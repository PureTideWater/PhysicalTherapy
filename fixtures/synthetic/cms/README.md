# fixtures/synthetic/cms

**SYNTHETIC, invented values. Not CMS data, not X12 data, never for pricing a real line.**

Small files laid out like the public files the rule parsers read (`packages/rules/src/parsers`), so the
parsers, the content checker and the release loader can be tested without the real downloads. Every
number is invented and deliberately patterned (for example work RVUs of 0.31 to 0.35 for the timed
codes); the carrier `99999`, the state `ZZ` and ZIP codes `00011` and `00012` do not exist; code-list
descriptions say SYNTHETIC. Every file says SYNTHETIC on its first line except `ZIP5_SYNTHETIC.txt` and
`ZIP9_SYNTHETIC.txt`, whose fixed-width layouts have no room for a banner. None of them can enter `content/`: `pnpm rules:import`
and `pnpm verify-content` refuse a SYNTHETIC banner, the bytes of any file here, and the reserved carrier
99999, state ZZ and ZIP codes 00000 to 00099.

| File | Layout of | Parser |
| --- | --- | --- |
| `PPRRVU_SYNTHETIC.csv` | CMS PFS relative value file (PPRRVU), stacked headings | `pfs_rvu` |
| `PPRRVU_SYNTHETIC_900004.csv` | the same file with one value changed (97110 work RVU 0.41, not 0.31): release 900004's, the re-run tests' "release 2" | `pfs_rvu` |
| `GPCI_SYNTHETIC.csv` | CMS GPCI file, one locality and a footnote | `pfs_gpci` |
| `GPCI_SYNTHETIC_900006.csv` | the same file with a second locality (99999-02: work 1.000, PE 1.050, MP 0.700): release 900006's, the ZIP+4 tests' | `pfs_gpci` |
| `ZIP5_SYNTHETIC.txt` | CMS ZIP code to carrier locality file (ZIP5); 00012 carries the plus-four flag | `locality_map` |
| `ZIP9_SYNTHETIC.txt` | CMS ZIP+4 to carrier locality file (ZIP9), one code per line at 22-25 (the layout docs/adr/0064 records): 00012's codes 0000-4999 in locality 01 and 5000-8999 in locality 02, 9000-9999 not listed. 9,000 lines, rendered by `tools/release/synthetic.ts` (`renderZip9Synthetic`) and held equal to it by a unit test | `locality_map_plus_four` |
| `conversion-factor-SYNTHETIC-pass-1.csv`, `-pass-2.csv` | the reviewer's conversion-factor CSV, prepared twice | `conversion_factor` |
| `MPPR_SYNTHETIC.csv` | CMS therapy MPPR rate file, one code repeated | `mppr_rate` |
| `NCCI_PTP_SYNTHETIC.txt` | NCCI practitioner PTP edits (tab-separated) | `ncci_ptp` |
| `NCCI_MUE_SYNTHETIC.csv` | NCCI practitioner services MUE table | `ncci_mue` |
| `CARC_SYNTHETIC.csv`, `RARC_SYNTHETIC.csv`, `CLAIM_STATUS_SYNTHETIC.csv` | X12 code list exports | `carc`, `rarc`, `claim_status_code` |
| `synthetic-rules.md` | the sentences the hand-typed synthetic records quote | (hand-typed) |

These files are the stored sources of `fixtures/synthetic/rules/release-synth-900001` (and, with
`PPRRVU_SYNTHETIC_900004.csv` in place of `PPRRVU_SYNTHETIC.csv`, of `release-synth-900004`; with
`GPCI_SYNTHETIC_900006.csv` in place of `GPCI_SYNTHETIC.csv`, and `ZIP9_SYNTHETIC.txt` besides, of `release-synth-900006`): its records carry
their SHA-256, so changing a byte here means rebuilding that release (`tsx tools/release/synthetic.ts`)
and updating the hand-typed records' `source.sha256`.

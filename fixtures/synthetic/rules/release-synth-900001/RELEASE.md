# SYNTHETIC test release 900001

Built 2026-10-15 by `tsx tools/release/synthetic.ts` from fixtures/synthetic/cms. Invented values for tests: never published,
never loaded outside a scratch test database, never used to price a real line. 65 records.

## Records

| Record type | Records | Earliest start | Latest end | Verification |
| --- | --- | --- | --- | --- |
| `assistant_modifier` | 2 | 2026-01-01 | open | L1 |
| `carc` | 6 | 2001-01-01 | open | L1 |
| `claim_status_code` | 3 | 2001-01-01 | open | L1 |
| `conversion_factor` | 2 | 2026-01-01 | 2026-12-31 | L1 |
| `denial_category` | 1 | 2026-01-01 | open | L1 |
| `dispute_window` | 3 | 2026-01-01 | open | L1 |
| `locality_map` | 2 | 2026-01-01 | 2026-12-31 | L1 |
| `mppr_rate` | 9 | 2026-01-01 | open | L1 |
| `ncci_mue` | 12 | 2026-01-01 | 2026-12-31 | L1 |
| `ncci_ptp` | 5 | 1996-01-01 | open | L1 |
| `pfs_gpci` | 1 | 2026-01-01 | 2026-12-31 | L1 |
| `pfs_rvu` | 12 | 2026-01-01 | 2026-12-31 | L1 |
| `rarc` | 3 | 2001-01-01 | open | L1 |
| `sequestration` | 1 | 2026-01-01 | open | L1 |
| `state_prompt_pay` | 1 | 2026-01-01 | open | L1 |
| `therapy_threshold` | 2 | 2026-01-01 | 2026-12-31 | L1 |

## Sources

| Source | Stored at | Downloaded from | Retrieved | SHA-256 |
| --- | --- | --- | --- | --- |
| SYNTHETIC X12 claim adjustment reason codes (CARC) (invented values) | `fixtures/synthetic/cms/CARC_SYNTHETIC.csv` | none | 2026-10-15 | `aaf6864a0765f36adb9d83a24535085c6d468cce68ac2adb939411aba80220f9` |
| SYNTHETIC X12 claim status codes (invented values) | `fixtures/synthetic/cms/CLAIM_STATUS_SYNTHETIC.csv` | none | 2026-10-15 | `ec495c2996299976ec61e6bbf8f887eefe42abddcf016c71b67353a9256783d3` |
| SYNTHETIC CMS geographic practice cost index file (GPCI) (invented values) | `fixtures/synthetic/cms/GPCI_SYNTHETIC.csv` | none | 2026-10-15 | `1a20190a02a0e836309f71eb49dd5e085c973b1b5a8753ec658b0dbab4784b0d` |
| SYNTHETIC CMS therapy multiple procedure payment reduction (MPPR) rate file (invented values) | `fixtures/synthetic/cms/MPPR_SYNTHETIC.csv` | none | 2026-10-15 | `be8068eec0ee6543be4258ac9ffb58f91f483a8c2c0d7320e2fd084e2eea46d5` |
| SYNTHETIC CMS NCCI medically unlikely edits, practitioner services (invented values) | `fixtures/synthetic/cms/NCCI_MUE_SYNTHETIC.csv` | none | 2026-10-15 | `61320bb25bebfbbe11aa4f09d16477653dbd819ee000be2bada6cd8f278aa5ab` |
| SYNTHETIC CMS NCCI procedure-to-procedure edits, practitioner services (invented values) | `fixtures/synthetic/cms/NCCI_PTP_SYNTHETIC.txt` | none | 2026-10-15 | `ab081001c236f0bc4423df3a2373bbec9ddddeaad59f35bdb812d0a7c28dda21` |
| SYNTHETIC CMS physician fee schedule relative value file (PPRRVU) (invented values) | `fixtures/synthetic/cms/PPRRVU_SYNTHETIC.csv` | none | 2026-10-15 | `1fbfcf98e0cb580b7428821d5dd11a4b284b1e47ba752213a30769149fa5f003` |
| SYNTHETIC X12 remittance advice remark codes (RARC) (invented values) | `fixtures/synthetic/cms/RARC_SYNTHETIC.csv` | none | 2026-10-15 | `eeca4d4163ec238d88c686380a15bdb8c03eb34d0870bc9ae706ee55f05bdf0f` |
| SYNTHETIC CMS ZIP code to carrier locality file (ZIP5) (invented values) | `fixtures/synthetic/cms/ZIP5_SYNTHETIC.txt` | none | 2026-10-15 | `47bcc5d36451c94346edbf360e52f280cf12a47f928fafa31422cbf08af0e297` |
| SYNTHETIC Physician fee schedule conversion factors, prepared from the final rule (invented values) | `fixtures/synthetic/cms/conversion-factor-SYNTHETIC-pass-1.csv` | none | 2026-10-15 | `1032acce581b3c0ffe95563dbd1f8218c1158e7bf45a110ec31ddf6499c10688` |
| SYNTHETIC therapy rules for tests (fixtures/synthetic/cms/synthetic-rules.md) | `fixtures/synthetic/cms/synthetic-rules.md` | none | 2026-10-15 | `c5f7544336aee203acd3e0cbd5561705cc93974223a510d2331a9749e70f41af` |

## Who verified

- L1 by SYNTHETIC fixture builder (tools/release/synthetic.ts) on 2026-10-15: `carc`, `claim_status_code`, `conversion_factor`, `locality_map`, `mppr_rate`, `ncci_mue`, `ncci_ptp`, `pfs_gpci`, `pfs_rvu`, `rarc`
- L1 by pnpm verify-content on 2026-10-15: `assistant_modifier`, `denial_category`, `dispute_window`, `mppr_rate`, `sequestration`, `state_prompt_pay`, `therapy_threshold`

## Impact on existing runs

SYNTHETIC fixture: loaded only into scratch test databases, where no pricing runs exist.

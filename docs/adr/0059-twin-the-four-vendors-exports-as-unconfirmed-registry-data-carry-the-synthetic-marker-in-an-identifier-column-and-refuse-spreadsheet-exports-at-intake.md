# 0059. Twin the four vendors' exports as unconfirmed registry data, carry the synthetic marker in an identifier column, and refuse spreadsheet exports at intake

- **Status:** accepted
- **Date:** 2026-10-17
- **Deciders:** the owner (D14 option a, in `docs/product/reconciliation-001.md`, approved 2026-10-17); the build (PR 3 of Change Order 001)
- **PRD sections:** 6 (Intake and documents), 13 (Recovery ledger, Matching steps 2 and 3), 16 (Development data boundary), 18 (Testing), 20 (Posting-export templates); Change Order 001, CO-03 (first part)

## Context

CO-03 asks `packages/synth` for synthetic twins of the ERA and payment-posting exports of WebPT Billing,
Prompt, SPRY and Raintree. Until the design-partner firm supplies the real formats, each is a placeholder in
the vendor's column vocabulary with a `FORMAT_UNCONFIRMED` marker, and the samples it supplies are format
descriptions and redacted headers, never files. Its acceptance includes "no file without the `SYNTHSENDER`
marker can enter fixtures". The reconciliation (PR 3) splits CO-03: this pull request brings the formats, the
fixtures, four posting templates and the tabular guard, with no schema change; the ERA export as an intake
kind (`era_export`, provenance on `remittance`, the cross-format duplicate rule, the Coverage flag; D12, D13)
is PR 4.

What the repository held, and what constrains the design:

- No format description of any of the four vendors has been received.
- The guard read only X12: `assertSyntheticX12` (`packages/synth/src/write.ts`) and `fixture-guard.sh` let a
  CSV through. The repository tracked 30 tabular files, all CSV under `fixtures/`, none carrying
  `SYNTHSENDER`: 10 are `packages/synth`'s own LED posting and bank exports; 20 are reference tables whose
  exact bytes other files pin (release manifests, the golden sources, the MOD-01 evaluation baseline,
  AUDIT-01's worksheet).
- The ledger's reader (`readCells`, `packages/ledger/src/templates.ts`) takes the first row as the header and
  ignores every column its template does not map. An added column changes no reading and no fingerprint; a
  banner or comment row above the header would make the file unreadable.
- `posting_row.template` is a free name under `CHECK (template ~ '^[a-z][a-z0-9_]{0,63}$')`, the ledger reads
  only `MM/DD/YYYY` and `YYYY-MM-DD` dates, and `parseAmount` reads a plain decimal (no `$`, thousands comma or
  parentheses).
- An `.xlsx` posting export passed intake (`apps/worker/src/intake/classify.ts`) but the reconcile step reads
  an export as text (`apps/worker/src/reconcile/exports.ts`), so it was stored and then unreadable. The one
  workbook reader in the repository, `sheetText` in `packages/contracts/src/evidence/page-thread.ts`, drops
  empty cells and ignores cell references, so it loses the column positions a template maps; changing it
  would change contract evidence page text and the hashes stored over it. `pnpm-lock.yaml` holds no other
  sheet reader.
- `.claude/settings.json` is not in the repository, so no hook runs in a session (reconciliation-001,
  milestone 0). The settings the Starter kit ships deny `git push` and turn on a sandbox.

## Decision

**A declarative registry, every format unconfirmed.** `packages/synth/src/formats/vendors/registry.ts` holds
`VENDOR_FORMATS`: for each vendor a `posting_export` and an `era_export`, eight entries with the IDs
`webpt_billing_posting_v0`, `webpt_billing_era_v0`, `prompt_posting_v0`, `prompt_era_v0`, `spry_posting_v0`,
`spry_era_v0`, `raintree_posting_v0` and `raintree_era_v0`. Each entry is data: its columns in file order (a
header in the vendor's plausible vocabulary, the field it holds, the field's type), the `markerColumn`, its
date format (one of the ledger's two), plain-decimal money, line ending, byte-order mark and list separator,
and `status: 'FORMAT_UNCONFIRMED'` with `confirmation: null` and a note that no format description has been
received and that the columns are not taken from any file, screen or document of the vendor.
`formatProblems()` checks an entry. Confirming a format is data alone: when its description agrees with the
columns, `status` becomes `FORMAT_CONFIRMED` and `confirmation` names the date received and the reference of
the redacted description; when it disagrees, a `_v1` entry is added beside `_v0`, so a posting row already
read under the placeholder keeps a template that exists. The matching ledger template flips with it, and
`pnpm synth --all` regenerates the fixtures.

**Placeholders from the case registry's own rows.** The generators invent no values. `posting.ts` reads
`packages/synth`'s own posting exports of LED-04, LED-08 (its later export) and LED-09 (its line-level row)
back into canonical rows (the `posting_row` fields, the amount in integer cents) and writes them in each
posting format. `era.ts` writes one row per service line of PAR-01, PAR-08 (original and correction),
PAR-09, PAR-12, PAR-13 and PAR-22 from each 835's parse expectation, with the claim's and the payment's
fields repeated on each line as remittance listings show them; a source must be loaded, balanced, carry only
line-level adjustments and no PLB, or it is refused, so each payment's rows total its claims paid and BPR02
to the cent. The twin generator is not used: its input is a parsed X12 document and its boundary admits only
synthetic input outside production, and the registry's claims are already synthetic, while its amount
scaling would break the totals to the cent. `fixtures.ts` writes `fixtures/synthetic/emr/<format_id>/`: the
export and a `manifest.json` (the format and its status, the source case files, the files with their hash
and size, the canonical rows in cents). The directory is not a case directory, so a case write never touches
it; `pnpm synth --all` writes it through `writeCases`, and the test compares it with a fresh generation
through `driftFrom`. They are named fixtures: the test matrix has no row for them, so neither the matrix nor
the case registry changes.

**The marker in an identifier column (D14 option a).** Every tabular fixture carries `SYNTHSENDER` in a real
identifier field of every data row: the synthetic posting export gains a last column "Payee ID" and the bank
export "Originator ID"; a vendor format names its `markerColumn`, the payee ID of a posting export or the
interchange sender of an ERA export, and its header says ID or identifier. No banner or comment row: row 1
stays the header the ledger reads. The ten LED CSVs and their `expected.json` were regenerated; no reading,
fingerprint or match changed.

**Four built-in posting templates, unconfirmed.** `BUILT_IN_POSTING_TEMPLATES` gains
`webpt_billing_posting_v0`, `prompt_posting_v0`, `spry_posting_v0` and `raintree_posting_v0` beside
`synthetic_pm_export_v1`, each mapping its format's columns to the posting fields with its own date format
and carrying `status: 'unconfirmed'` (`TEMPLATE_STATUSES`; the SYNTHETIC template is `confirmed`, a practice's
own mapping has none). The status is plain data shown beside the template's name ("(built in, format
unconfirmed)"); nothing reads a row differently by it. Template IDs are the format IDs, so
`posting_row.template` names the format a row was read with, within its CHECK: no DDL. The reader, the
fingerprints, the matching rules, `LEDGER_STAGES` and the recovered total are unchanged, and a vendor export
of a posting the practice already holds repeats its rows (stored once).

**Spreadsheet exports refused at intake.** `posting_export` and `eft_export` accept CSV content only: an
`.xlsx` or `.xls` is held as `wrong_type`, queues no reconcile, and its receipt says to save it as CSV. The
upload request no longer accepts the `.xlsx` type for these kinds; it still accepts
`application/vnd.ms-excel`, which Windows browsers declare a `.csv` as where Excel is installed, because the
worker sniffs the bytes. This is the smaller and safer option: no new dependency, no change to the contract
evidence reader or its hashes, and no export stored that would never be read.

**One guard, three places.** `assertSyntheticFixture(bytes, label)` in `packages/synth/src/write.ts` is the
one implementation of the marker rule. It sends X12 to `assertSyntheticX12` and reads a `.csv` (comma), a
`.tsv` (tab) or an `.xlsx` (every sheet, with inflate caps) as RFC 4180 text in UTF-8 with an optional
byte-order mark: row 1 is a header, there is at least one data row, and one identifier column holds exactly
`SYNTHSENDER` in every non-blank data row (for a vendor fixture, the registry's `markerColumn`). `.xls`,
`.xlsm` and `.ods` fixtures are refused. The only other way to pass is to be one of the reference tables
listed by path and exact sha256 in `packages/synth/src/guard/pinned-tables.json`, each with the reason
another file pins its bytes: the ten `fixtures/synthetic/cms` tables (the release-synth-900001 to 900004
manifests), the five `fixtures/golden/sources` tables (release-synth-900002 and 900003, and the golden rule
that `fixtures/golden` stays unchanged), the four MOD-01 contract-set exhibit tables (the set's hash in the
evaluation baseline) and AUDIT-01's `expected-lines.csv` (the Python worksheet, matched line for line). A
refusal names the file and the rule, never a cell value. `writeCases` and the audit writer call it on every
file; `fixture-guard.sh` applies it to the file a Write, Edit or MultiEdit under `fixtures/` or
`packages/synth/` would leave, through `packages/synth/src/guard/cli.ts`, refuses any write of a spreadsheet
there (a workbook fixture is generated, never written by hand), and fails closed without `jq`, `node` or
`tsx`; `pnpm check:fixtures` (`tools/fixture-check`) reads every file git would commit, as a CI step and
from its test in `pnpm test`.

**`.claude/settings.json` lands in the final pass.** The owner approved committing it (D14), but it denies
`git push` and turns on a sandbox, which would stop this build's own agents from pushing the remaining pull
requests of the change order. It lands as the final pass's last commit. Until then the hook rules written
here (the tabular rule in `fixture-guard.sh`, and `.claude/hooks/protect-approval.sh`) do not run in a
session; the writer and CI enforce the marker rule.

## Alternatives considered

| Option | Why not (or when we would switch) |
| --- | --- |
| D14 (b): a marker comment or banner row in each tabular fixture | The ledger takes row 1 as the header (`readCells`), so a banner row makes every export unreadable, and a vendor's real files have none. |
| D14 (c): guard every file type | Most fixture types (PDF, JSON) have no identifier field to carry the marker; the risk CO-03 names is a real export or remittance, which is X12 or tabular. |
| Read `.xlsx` exports through `sheetText` | It loses column positions (empty cells dropped, cell references ignored), so a template cannot map a column; fixing it changes contract evidence page text and its stored hashes. |
| Add a sheet reader (SheetJS, exceljs) | A new parser of untrusted input in the worker, a dependency and license review, for a format no design partner has asked for yet. Revisit when one does. |
| Vendor templates as practice mappings in settings, not built-ins | Every practice on a vendor would map the same columns by hand, and `posting_row.template` would read `practice` instead of naming the format. |
| Add the vendor fixtures to the test matrix and the case registry | The matrix has no row for them (CO-09 adds none), and the registry holds exactly the matrix's rows; named fixtures keep both unchanged. |
| Pass the source 835s through the twin generator | Its input is a parsed X12 document under a production-only boundary; the sources are already synthetic, and its amount scaling would break the totals to the cent. |
| Commit `.claude/settings.json` in this pull request | It denies `git push` and sandboxes the build's agents, which would stop the remaining pull requests; it lands as the final pass's last commit. |

## Consequences

- PR 4 has its inputs: eight formats with fixed IDs, ERA fixtures whose manifests hold the canonical rows a
  normalizer must produce (in integer cents, totalling each payment to the cent), and a status the Coverage
  flag can read. The `era_export` kind, its provenance and the duplicate rule (D12, D13) are PR 4's.
- A practice on one of the four systems can map a built-in template today; the screen says its format is
  unconfirmed. A posting already loaded from another export is stored once.
- When a format description arrives it changes registry data and one ledger template, not code; a template
  ID that changes keeps its old version for the rows read under it.
- An `.xlsx` or `.xls` posting or bank export is held at intake with a reason instead of being stored and
  failing later. Exhibits still accept `.xlsx` (docs/adr/0033).
- Checks: `packages/synth/src/formats/vendors/vendors.test.ts` (determinism, drift, marker, ERA totals, every
  format unconfirmed), `packages/ledger/src/templates.test.ts` and `settings.test.ts` (each template reads its
  fixture by path, round-trips with its status), `apps/worker/src/reconcile/vendor-exports.db.test.ts` (each
  vendor export loads into `posting_row` through the reconcile job under its template, equal to the manifest
  and to the SYNTHETIC read of the source cases), `apps/worker/src/intake/classify.test.ts` and
  `intake.db.test.ts` (a workbook export is held), and the guard's tests (`packages/synth/src/fixture-guard.test.ts`,
  `tools/fixture-check`, `tools/hooks`).

## Revisit when

A format description arrives from the design-partner firm (confirm the format, or add its `_v1`); a design
partner needs spreadsheet exports read; PR 4 lands the ERA export as intake; or the final pass commits
`.claude/settings.json`, after which the hook rules run in every session.

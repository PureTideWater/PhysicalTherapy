# 0059. Twin the four vendors' exports as unconfirmed registry data, carry the synthetic marker in an identifier column, and refuse spreadsheet exports at intake

- **Status:** accepted; amended by [0063](0063-protect-main-and-the-build-branch-make-the-founders-github-review-the-approval-of-record-open-each-approval-with-what-changed-and-switch-on-the-edit-hooks.md) (`.claude/settings.json` with the hooks lands before the final pass; NotebookEdit joins the matcher)
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
  CSV through. The repository tracked 30 CSV files under `fixtures/`, none carrying `SYNTHSENDER`: 10 are
  `packages/synth`'s own LED posting and bank exports; 20 are reference tables whose exact bytes other files
  pin (release manifests, the golden sources, the MOD-01 evaluation baseline, AUDIT-01's worksheet). Two
  more reference tables are `.txt` files the release manifests pin: `cms/NCCI_PTP_SYNTHETIC.txt`,
  tab-separated under a banner line as the CMS file is, and `cms/ZIP5_SYNTHETIC.txt`, fixed-width. The other
  `.txt` fixtures are contract and narrative prose.
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
`packages/synth`'s own posting exports of LED-04, LED-08 (its later export), LED-09 (its line-level row) and
LED-06 (its take-back, the recoupment posted as a negative amount) back into canonical rows (the `posting_row` fields, the amount in integer cents) and writes them in each
posting format. `era.ts` writes one row per service line of PAR-01, PAR-08 (original and correction),
PAR-09, PAR-12, PAR-13 and PAR-22 from each 835's parse expectation, with the claim's and the payment's
fields repeated on each line as remittance listings show them; a source must be loaded, balanced, carry only
line-level adjustments and no PLB, or it is refused, so each payment's rows total its claims paid and its
payment to the cent. The payment written is the parser's signed payment: BPR02 for a credit, BPR02 negated for
a debit (BPR03 `D`, a take-back), so a debit's Check Amount is negative like its lines. The twin generator is not used: its input is a parsed X12 document and its boundary admits only
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
fingerprint or match changed. LED-06 gained `recoupment-posting-export.csv`, the source of the vendor exports'
take-back row; no ledger test of the case loads it, so its stages and recovered total are unchanged.

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
`.xlsx` or `.xls` is held as `wrong_type` and queues no reconcile. The upload request no longer accepts the
`.xlsx` type for these kinds; it still accepts `application/vnd.ms-excel`, which Windows browsers declare a
`.csv` as where Excel is installed, because the worker sniffs the bytes. A person learns it before anything is
sent: the uploader refuses a spreadsheet chosen as a posting or EFT export, by its name or a workbook's
declared type ("File N is a spreadsheet: posting and EFT exports are read as CSV only. Save it as CSV
(comma-separated) and upload it again."), and the request names file N with the same remedy, so one workbook
in a batch of CSVs says which file to save again. A workbook that still arrives (in a zip, under another name)
is held; its receipt cannot tell a workbook from another file that is not CSV text without a schema change, so
it gives both remedies: save a spreadsheet as CSV, or check the file and kind. This is the smaller and safer
option: no new dependency, no change to the contract evidence reader or its hashes, and no export stored that
would never be read.

**One guard, three places.** `assertSyntheticFixture(bytes, label)` in `packages/synth/src/write.ts` is the
one implementation of the marker rule. `label` is the file's repository path; a refusal
(`SyntheticSenderError`) names it and the rule broken, never a cell's value, and whatever the guard cannot read
it refuses.

- X12 content, whatever the file is called, goes to `assertSyntheticX12`, unchanged.
- A file's kind is read from its own name: a path's last segment, or an archive entry's name, kept apart from
  the label a refusal shows, so `x!.csv` and `.csv` are CSV files like any other.
- A `.csv` (comma), `.tsv` or `.tab` (tab) or `.psv` (pipe) is read as RFC 4180 text in UTF-8: a byte-order mark ignored, CRLF or LF;
  text that is not UTF-8, a quote never closed or text after a closing quote is refused. Blank rows are skipped
  as the ledger skips them, so the header is the row the ledger reads as one. There is at least one data row,
  and one identifier column holds exactly `SYNTHSENDER` in every data row. For a vendor fixture
  (`fixtures/synthetic/emr/<format_id>/`) the identifier column is the registry's `markerColumn`, matched as
  the ledger matches a header (trimmed, in any case), and no other column stands in for it. For any other
  table it is a column whose header has the word ID or identifier (Payee ID, payee_id, PayeeID, Originator ID;
  not Paid): D14 (a) puts the marker in a real identifier field, and a column named for nothing would be a
  marker row by another name.
- A text file whose name does not say what it holds (`.txt`, `.text`, `.dat`, `.prn`, `.asc`, or no extension)
  is held to the same rule when its lines split as a table, as intake reads a `text/plain` export: two
  consecutive non-blank lines among its first fifty that split into the same number of fields, two or more on a
  tab or a pipe, three or more on a comma or a semicolon (read as Latin-1 to decide, so a table in another
  encoding is found and refused for not being UTF-8). Prose, whose lines rarely agree so, and fixed-width text
  are not tables. D14 names CSV, TSV and XLSX; a tab-delimited export saved as `.txt` is the same export, so the
  rule follows the content.
- An `.xlsx` is read by the guard's own reader (`guard/archive.ts`, `guard/xlsx.ts`): the zip's central
  directory, stored or deflated entries, at most 10,000 entries, 64 MiB inflated per entry and 256 MiB per
  archive, sizes checked before and while inflating. A workbook fixture is generated, never saved from a
  spreadsheet program, so it holds only the parts a generated workbook holds (`[Content_Types].xml`, the package
  and workbook relationships, `docProps/app.xml` and `core.xml`, `xl/workbook.xml`, `xl/styles.xml`, the theme,
  `xl/sharedStrings.xml` and `xl/worksheets/sheetN.xml`): an embedded file, a nested workbook, a drawing or a
  part under another name is refused unread. Every worksheet the content types declare, the workbook's
  relationships name or `xl/worksheets/` holds is read, hidden ones included, with shared strings, inline
  strings and cached values, each cell at the column its reference names; a worksheet, shared strings or
  workbook typed by extension (`<Default>`), a relationship outside the workbook, a declared sheet it does not
  hold, a shared string no cell shows, CDATA, a document type or an unclosed comment is refused, and comments
  are taken out before the reading, so a marker inside one counts for nothing. Every sheet that holds data meets
  the same rule, and one at least does. `formats/zip.ts` stays the writer's stored-only reader and `sheetText` stays the contract evidence's.
- `.xls`, `.xlsm`, `.xlsb`, `.xltx`, `.xltm`, `.ods`, `.fods` and `.numbers` are refused by name; OLE2 content
  (a legacy `.xls`), an OpenDocument spreadsheet and a workbook under any name but `.xlsx` by content. Any other
  zip is checked entry by entry, each entry as a file of its own name, three levels deep, and a gzip as the
  file it holds (`remit.835.gz` as `remit.835`), inflated within the same per-entry cap. A zip64, encrypted or
  otherwise compressed archive, one whose sizes disagree, and one holding two entries of one name (extractors
  keep the last, a reader by name the first) are refused.
- The only other way to pass is the pin: the file's repository path and exact sha256 are listed in
  `packages/synth/src/guard/pinned-tables.json`, each with the reason another file pins its bytes. The 21
  tables are the eleven `fixtures/synthetic/cms` tables, ten CSV files and the tab-separated NCCI PTP `.txt`
  (the release-synth-900001 to 900004 manifests hash them,
  and the importer refuses a second conversion-factor preparation that differs from the first), the five
  `fixtures/golden/sources` tables (release-synth-900002 and 900003, the same two-preparation check in
  `tools/golden-worksheet`, and `fixtures/golden` staying unchanged), the four MOD-01 contract-set exhibit
  tables (MOD-01's `expected.json` and the evaluation baseline's `set_sha256`), and AUDIT-01's
  `expected-lines.csv` (written by the Python worksheet; the audit test matches it line for line). A changed byte,
  or the same bytes at another path, falls back to the marker rule.

`writeCases` checks every file it is given, labelled `fixtures/synthetic/<path>`, before it writes any, so the
LED exports, the EMR sets and the MOD-01 tables meet the rule (or their pin) as `pnpm synth --all` writes them;
the audit writer checks what it writes, and the PAR-29 large file its envelope header.

`.claude/hooks/fixture-guard.sh` keeps its X12 rule word for word: anywhere, a Write's content or an Edit's new
string that is an interchange from another sender is refused; the same test now reads each new string of a
MultiEdit too. Under `fixtures/` or `packages/synth/` (the path taken relative to the file's own repository, so
a worktree's file is its own, with dot segments taken out, symbolic links resolved, the file's own as a Write
follows it and those in its existing directory part, and in any case, so no other spelling of a fixture's path
slips past) it refuses any Write, Edit or MultiEdit of a spreadsheet by name, lets source and documents through
(`.ts`, `.tsx`, `.js`, `.json`, `.md`), and checks every other file, a CSV or TSV above all, as the call would
leave it: `packages/synth/src/guard/cli.ts` rebuilds the result from the call and the file on disk and runs
`assertSyntheticFixture` on it. An Edit or MultiEdit is rebuilt only when each old_string is in the file
exactly as written (once, or with replace_all); any other is refused, because Claude Code may still apply it,
matching CRLF as LF and curly quotes as straight ones, and the guard would not have seen the result. That
refusal costs nothing for a generated fixture, which is regenerated rather than edited. The rebuild also
closes two gaps the X12 rule alone leaves there: an Edit that changes ISA06 inside a committed file, and an
interchange behind a byte-order mark. It fails closed (exit 2) without `jq`, `node` or `tsx`, on input that is
not JSON, on a link it cannot read, and on any error of the check.

`pnpm check:fixtures` (`tools/fixture-check`) reads every file git would commit (`git ls-files --cached
--others --exclude-standard`), anywhere in the tree: by name every CSV, TSV (`.tab`, `.psv` too) and
spreadsheet, under `fixtures/` and `packages/synth/` every `.txt`, `.dat` or extensionless file, and by content
every X12 interchange, zip, gzip and OLE2 file. It is CI's step right after the secret scan, before
`pnpm synth --all`, so it reads the commit's own bytes: the generation rewrites a hand-edited generated file
and removes an extra one from every case and EMR directory, so a check after it would read a tree the commit
does not hold. The step after `pnpm synth --all` fails unless `fixtures/synthetic` is unchanged (`git diff`
and `git status`, scoped to what synth writes), so a committed fixture the generation would rewrite or remove
fails the run too. `pnpm test` runs the check on the tree (`check.test.ts`, with negative cases in a scratch
repository). It reads the whole tree, not only `fixtures/`, because CLAUDE.md keeps a real 835 or export out of
the repository, not only out of its fixtures; today every table is under `fixtures/`. Outside `fixtures/` and
`packages/synth/` a `.txt` file is prose (READMEs, notes) and is read only for X12.

**The founder's approval, guarded.** `.claude/hooks/protect-approval.sh` (PreToolUse on Edit, Write and
MultiEdit) refuses, with exit 2 and its reason, any call whose result changes an "Approved by:" line of
`docs/product/domain-model.md` (the result rebuilt with `jq` from the call and the file on disk; a call it
cannot rebuild exactly, an old_string that is not in the file exactly once as written, is refused, since
Claude Code may apply it with curly quotes read as straight or CRLF as LF), and any change at all to
`packages/db/domain-model/approvers.json`: the founder's approval is written only on the founder's
instruction, by the founder. It keys on both paths though PR 2, which adds the files, is not merged on this
base, and a file that does not exist yet is held to the same rule. Paths resolve from the hook input's cwd as
`protect-content.sh` resolves them, with dot segments taken out, symbolic links resolved as
`fixture-guard.sh` resolves them, and in any case, and it fails closed without `jq` or on input it cannot read. `protect-content.sh` and `typecheck.sh` are unchanged.
`tools/hooks/hooks.test.ts` runs every `.claude/hooks/*.sh` with JSON on stdin, with allowed and refused cases
for each, in scratch repositories and workspaces under the temporary directory (never
`.claude/.allow-protected-edit` in the worktree), and fails for a hook script without cases.

**`.claude/settings.json` lands in the final pass.** The owner approved committing it (D14), but it denies
`git push` and turns on a sandbox, which would stop this build's own agents from pushing the remaining pull
requests of the change order. It lands as the final pass's last commit. Until then the hook rules written
here (the tabular rule, the MultiEdit sender test, the link resolution and the refusal of an edit it cannot
rebuild in `fixture-guard.sh`, and `.claude/hooks/protect-approval.sh`) do not run in a session; they take effect
when it lands. Until then the writer and CI enforce the marker rule. When it lands, both run as PreToolUse hooks on
`Edit|Write|MultiEdit`, beside `protect-content.sh` (PreToolUse) and `typecheck.sh` (PostToolUse), unchanged.

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
| Any column holding `SYNTHSENDER`, whatever its header | D14 (a) puts the marker in a real identifier field; a column named for nothing, or "Paid", is a marker row by another name. A vendor format's own column is required, so another identifier column cannot stand in for it. |
| The tabular rule in bash and `jq` inside the hook | A second CSV reader (quoting, a byte-order mark, an edit's result rebuilt) would drift from the writer's. One implementation behind `guard/cli.ts` keeps the writer, the hook and CI the same, at the cost of `node` and `tsx`, without which the hook fails closed. |
| Add the marker column to the reference tables | Their exact bytes are pinned by the release manifests, the golden lines, the evaluation baseline and the audit worksheet, which must stay unchanged; the pin admits those bytes at that path only. |
| Check only `fixtures/` and `packages/synth/` in CI | CLAUDE.md keeps a real 835 or export out of the whole repository. The hook keeps the narrower scope so it stays fast in a session; CI and `pnpm test` read the whole tree. |
| Rebuild an edit in the hooks as Claude Code matches it (CRLF as LF, curly quotes as straight) | A second copy of the tool's matching drifts from it as the tool changes; an edit the hook cannot rebuild exactly is refused instead, which costs nothing for a generated fixture and the generated domain model. |
| Read every `.txt` in the tree as a possible table | READMEs and notes outside `fixtures/` and `packages/synth/` are prose; the hook's scope and the generated text fixtures are where a real export would land. |
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
- A table that is neither generated with the marker nor pinned cannot be committed: CI and `pnpm test` refuse
  it, whether it is named `.csv`, `.tsv`, `.tab`, `.psv` or `.xlsx`, or (under `fixtures/` and `packages/synth/`)
  is a `.txt`, `.dat` or extensionless file whose lines split as a table, inside a zip or a gzip or not. A new reference table is pinned in the same pull request as what pins it, with that reason.
- A file a shell command writes passes no hook (the hooks see Write, Edit and MultiEdit); the writer, the check
  in `pnpm test` and CI's step still refuse it. A hook check of a fixture file starts `tsx` (about a third of a
  second); source and documents under those directories are let through without it.
- Checks: `packages/synth/src/formats/vendors/vendors.test.ts` (determinism, drift, marker, ERA totals, every
  format unconfirmed), `packages/ledger/src/templates.test.ts` and `settings.test.ts` (each template reads its
  fixture by path, round-trips with its status), `apps/worker/src/reconcile/vendor-exports.db.test.ts` (each
  vendor export loads into `posting_row` through the reconcile job under its template, equal to the manifest
  and to the SYNTHETIC read of the source cases, the take-back stored as a negative amount),
  `apps/worker/src/intake/classify.test.ts` and `intake.db.test.ts` (a workbook export is held),
  `apps/web/src/lib/uploads/csv-exports.test.ts` and `apps/web/src/lib/routes/uploads.db.test.ts` (a spreadsheet
  export is named before and by the request), the guard's tests (`packages/synth/src/fixture-guard.test.ts`,
  `tools/fixture-check`, `tools/hooks`), and `tools/test/workflows.test.ts` (the check before the generation,
  the clean tree after it).

## Revisit when

A format description arrives from the design-partner firm (confirm the format, or add its `_v1`); a design
partner needs spreadsheet exports read; PR 4 lands the ERA export as intake; or the final pass commits
`.claude/settings.json`, after which the hook rules run in every session.

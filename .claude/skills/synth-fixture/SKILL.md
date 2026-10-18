---
name: synth-fixture
description: Generate a synthetic 835, contract exhibit, posting export or EFT export that exercises a named case from the test matrix.
argument-hint: "[case-id]"
allowed-tools: Read Write Bash(pnpm synth *)
---
Read docs/product/test-matrix.md for case $0. Generate the files with pnpm synth --case $0 (sender SYNTHSENDER,
GS02 SYNTH, shifted dates, invented identifiers). Add the expected outcome to fixtures/synthetic/<case>/expected.json
and a test that asserts it. Never derive a fixture from a real file outside packages/synth's twin generator.
A posting, bank or EMR export (CSV or TSV) carries SYNTHSENDER in every data row of an identifier column (a payee
or sender ID; for fixtures/synthetic/emr/<format_id>/, the column the vendor registry names), after a header row
and with no banner row; never hand-write a spreadsheet. pnpm synth refuses a file without the marker, and so do
the fixture hook and pnpm check:fixtures (.claude/rules/fixtures.md, docs/adr/0059).

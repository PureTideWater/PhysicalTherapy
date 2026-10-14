---
name: synth-fixture
description: Generate a synthetic 835, contract exhibit, posting export or EFT export that exercises a named case from the test matrix.
argument-hint: "[case-id]"
allowed-tools: Read Write Bash(pnpm synth *)
---
Read docs/product/test-matrix.md for case $0. Generate the files with pnpm synth --case $0 (sender SYNTHSENDER,
GS02 SYNTH, shifted dates, invented identifiers). Add the expected outcome to fixtures/synthetic/<case>/expected.json
and a test that asserts it. Never derive a fixture from a real file outside packages/synth's twin generator.

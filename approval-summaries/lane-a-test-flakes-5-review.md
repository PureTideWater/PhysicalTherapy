# PR #117 (test-flakes-5): review of 9575c2c9

Tests only: axe's helper waits for the page's title before it scans, which fixes the sign-in-time document-title flake (run 41885977909).

- B1 (blocking): the CI-19 row was amended in docs/product/test-matrix.md only. The word-for-word copy in packages/synth/src/cases/matrix.ts and fixtures/synthetic/CI-19/expected.json kept the old text, so the unit job failed. CI's unit on 9575c2c9 confirms it.
- N1 (nit): with no title named, any non-empty title passes, the previous page's included.
- N2 (nit): the expected-title proof case was never shown red.
- N3 (nit): the two invite tests were observed once each locally.
- Refuted: none.

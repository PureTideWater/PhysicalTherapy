---
paths:
  - "**/*.test.ts"
  - ".github/**"
  - "content/**"
---
# Testing and releases
- Oracles: pyx12 for the parser, specialist golden lines for pricing, synthetic export outcomes for the ledger.
- 100% branch coverage on packages/pricing, packages/ledger, packages/edi835 and authorization helpers.
- Cross-tenant negative tests are generated from the schema; add a table, get a test.
- content/releases is published by CI on merge. Work in content/drafts; publish with /load-release.
- A golden difference needs an explanation reviewed by the specialist (/golden-diff). Never update blindly.

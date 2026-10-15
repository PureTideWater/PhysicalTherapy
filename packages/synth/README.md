# @tp/synth

Synthetic data for every case in `docs/product/test-matrix.md`, and the twin generator (PRD section 16).
Nothing here is ever derived from a real file except through the twin generator, inside production.

```sh
pnpm synth --all           # every case and oracle variant into fixtures/synthetic/ (deterministic)
pnpm synth --case PAR-08   # one case (or V01 for an oracle variant)
pnpm synth --large         # the 10,000-claim PAR-29 file into fixtures/synthetic/PAR-29/generated/ (ignored)
```

## The 835 writer

- `File835` / `Interchange835` / `FunctionalGroup835` / `TransactionSet835` / `Remittance835` / `Claim` /
  `ServiceLine` (`src/x12/model.ts`) are the typed 005010X221A1 model: BPR, TRN, CUR, REF, DTM, payer
  (N1, N3, N4, REF, PER CX, BL and IC) and payee (N1, N3, N4, REF) loops, LX, CLP, CAS, NM1 (QC, IL, 74, 82),
  MIA, MOA, REF, DTM, PER, AMT, QTY, SVC with DTM, CAS, REF, AMT, QTY and LQ, and PLB.
- `documentFor835(file, { amountStyle })` builds the segments with control numbers and counts;
  `renderDocument(document, { lineEnding, bom })` writes them with each interchange's delimiters (element,
  component, repetition, segment terminator). ISA06 is always SYNTHSENDER and GS02 always SYNTH.
- `SynthWorld` invents parties; `line`, `claim`, `remittance`, `reversalOf`, `singleTransactionFile` and
  `envelopeOf` build balanced claims and payments (a line pays its charge minus its CAS, a claim its charge
  minus every adjustment, BPR02 the claims paid minus the PLB amounts) unless an amount is given on purpose.
- `summarize835(document)` is the oracle's normalized summary (`tp-oracle-835/1`, docs/adr/0022);
  `expectParse(file, document)` the parser and loader expectation (docs/adr/0021).

## The case registry

- `CASES` (one per test-matrix row, in matrix order), `VARIANT_CASES` (V01 to V31) and `ALL_CASES` are
  `CaseDefinition`s: `id`, `module`, `title`, `assertion`, `completesIn` (milestone), `assertedBy` (existing
  tests), `noFileReason`, `dir` (under fixtures/synthetic), `variant`, and `generate()`, which returns a
  `GeneratedCase` (`files` with their bytes, `expected`: the `CaseExpectation` written as expected.json, and
  `documents`: the segment documents of its well-formed 835s, in memory). `findCase(id)` and `generateAll()`.
- `writeLargeFixture(syntheticRoot, sha?)` streams the PAR-29 file; `largeFixtureFacts()` gives its size,
  hashes and counts.
- Other formats: `postingExport` and `eftExport` (CSV), `exhibitText` and `exhibitPdf` (contract exhibits),
  `writeZip` and `readZip` (stored, deterministic), `writePdf`.

## The twin generator

```ts
const session = new TwinSession({ boundary: TwinBoundary.production() });   // production only
const twin = session.twin(parsedDocument);                                  // an X12Document
renderDocument(twin);
```

`TwinBoundary.production()` requires `NODE_ENV=production` and `TP_ENVIRONMENT=production`; elsewhere only
`TwinBoundary.syntheticInputOnly()` exists, which refuses any input that is not already synthetic
(docs/adr/0024). The twin keeps every segment, element and component; shifts dates by one offset; replaces
names and identifiers consistently; perturbs amounts and rebalances them so every claim and transaction
balances exactly as the original did.

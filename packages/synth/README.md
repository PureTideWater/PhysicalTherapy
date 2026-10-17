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
- Other formats: `postingExport` and `eftExport` (CSV, with `SYNTHSENDER` in their last column, "Payee ID" and
  "Originator ID"), `exhibitText` and `exhibitPdf` (contract exhibits), `writeZip` and `readZip` (stored,
  deterministic), `writePdf`.

## The EMR export formats

`src/formats/vendors/` (Change Order 001, CO-03; docs/adr/0059):

- `registry.ts` is the declarative `VENDOR_FORMATS`: for WebPT Billing, Prompt, SPRY and Raintree, a
  `posting_export` (`<vendor>_posting_v0`) and an `era_export` (`<vendor>_era_v0`). Each entry has its columns in
  file order (header in the vendor's plausible vocabulary, field, type), the `markerColumn` that holds
  `SYNTHSENDER` (the payee ID of a posting export, the interchange sender of an ERA export), its date format (one
  of the ledger's two), plain-decimal money, line ending, byte-order mark and list separator, and `status`
  `FORMAT_UNCONFIRMED` with `confirmation: null` and a note that no format description has been received.
  `formatProblems(format)` checks an entry. To confirm a format, set `status` to `FORMAT_CONFIRMED` and
  `confirmation` to the date and reference of the redacted format description (when its columns differ, add a
  `_v1` entry and keep `_v0`), flip the ledger's matching posting template to `status: 'confirmed'`, and run
  `pnpm synth --all`.
- `posting.ts` reads the case registry's own posting exports (LED-04, LED-08's later export, LED-09's line-level
  row) back into canonical rows and writes them in each posting format; `era.ts` writes one row per service line
  of loaded, balanced 835s with line-level adjustments only and no PLB (PAR-01, PAR-08, PAR-09, PAR-12, PAR-13,
  PAR-22), so each payment's rows total its claims paid and its signed payment (BPR02, negated for a debit) to
  the cent.
- `fixtures.ts` builds `fixtures/synthetic/emr/<format_id>/` (the export and a `manifest.json` with the canonical
  rows in cents); `pnpm synth --all` writes them through `writeCases` and removes a format directory the
  registry no longer has. The packages/ledger posting templates of the same IDs read the posting exports.
- The marker rule: every CSV, TSV or .xlsx fixture carries `SYNTHSENDER` in an identifier column of every data row
  (D14 option a), and the writer, the hook and CI refuse one that does not.

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

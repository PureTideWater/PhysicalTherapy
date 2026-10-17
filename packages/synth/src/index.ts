/**
 * @tp/synth: generators for synthetic 835 files, contracts, posting exports and bank exports that
 * exercise every case in docs/product/test-matrix.md, plus the twin generator interface
 * (milestone 2). Nothing here is ever derived from a real file outside the twin generator.
 */
export { SYNTH_GS02, SYNTH_ISA06, SYNTH_SENDER_ID } from './identity';
export { type SynthRequest, SynthUsageError, parseSynthArgs } from './args';

// Dates and determinism.
export { type CalendarDate, addDays, calendarDate, fromX12Date, parseCalendarDate, toX12Date } from './core/dates';
export { Random, seedFrom } from './core/random';
export { canonicalJson, prettyJson, sha256 } from './core/json';

// The X12 segment model and the 835 writer.
export {
  DEFAULT_DELIMITERS,
  type Delimiters,
  type RenderOptions,
  X12BuildError,
  type X12Document,
  type X12Element,
  type X12Interchange,
  type X12Segment,
  elementValue,
  renderDocument,
  seg,
  segmentText,
} from './x12/segments';
export * from './x12/model';
export { type AmountStyle, balancingPayment, documentFor835, formatX12Amount, paymentAmount, transactionBody } from './x12/build835';
export { type ClaimSpec, type LineSpec, type RemittanceSpec, SynthWorld, claim, dollars, envelopeOf, line, remittance, reversalOf, singleTransactionFile } from './x12/factory';
export { wrongTransactionDocument } from './x12/other';
export { ORACLE_FORMAT, type OracleSummary, SummaryError, summarize835 } from './x12/summary';
export type * from './x12/summary';

// Expected outcomes and the case registry.
export type * from './expected/types';
export { CASE_MODULES } from './expected/types';
export { CODE_LIST_RELEASE, SYNTHETIC_CARCS, SYNTHETIC_RARCS, allocateProRata, expectParse } from './expected/parse';
export { CaseBuilder, type GeneratedCase, type GeneratedFile, type RenderedX12, render835, summarySha256, x12Expectation } from './cases/builder';
export { ALL_CASES, CASES, type CaseDefinition, VARIANT_CASES, findCase, generateAll } from './cases/registry';
export { TEST_MATRIX, type MatrixRow } from './cases/matrix';
export { LARGE_CLAIMS, LARGE_FIXTURE_PATH, type LargeFixtureFacts, largeFixtureChunks, largeFixtureFacts, writeLargeFixture } from './cases/large';

// Other file formats.
export { type EftRow, type PostingRow, EFT_EXPORT_HEADER, POSTING_EXPORT_HEADER, eftExport, postingExport } from './formats/csv';
export { type Exhibit, type ExhibitPage, EXHIBIT_BANNER, exhibitPageLines, exhibitPdf, exhibitText } from './formats/exhibit';
export { readZip, writeZip, type ZipEntry } from './formats/zip';
export { writePdf } from './formats/pdf';

// The EMR export formats (Change Order 001, CO-03; docs/adr/0059), every one FORMAT_UNCONFIRMED.
export * from './formats/vendors/registry';
export { type CanonicalPostingRow, POSTING_SOURCES, type PostingSource, postingSourceRows, readSyntheticPostingExport, vendorPostingExport } from './formats/vendors/posting';
export { type CanonicalEraRow, ERA_SOURCES, type EraCheck, type EraSource, eraRowsOf, eraSourceRows, vendorEraExport } from './formats/vendors/era';
export { EMR_DIR, EXPORT_FILES, MANIFEST_FILE, type EmrFixtureSet, type EmrManifest, emrFixtureSets, emrWritable, staleEmrDirectories } from './formats/vendors/fixtures';
export { VendorFormatError, readTable as readVendorTable, vendorCsv, writeDate, writeMoney } from './formats/vendors/table';

// The model gateway's synthetic evaluation sets (test matrix MOD-01 and MOD-03).
export * from './eval/formats';
export { CONTRACT_SET_DIR, CONTRACT_SET_SIZE, contractSetFiles, contractSetSpecs, normalizeText, writtenDate } from './eval/contract-set';
export { NARRATIVE_SET_DIR, NARRATIVE_SET_SIZE, narrativeSetCases, narrativeSetFiles } from './eval/narrative-set';
export { SCAN_HEIGHT, SCAN_WIDTH, TEXTRACT_RECORDING_FORMAT, type RecordedBlock, type TextractRecording, scannedPdf, textractRecording } from './formats/scan';

// Writing fixtures.
export { SyntheticSenderError, assertSyntheticX12, driftFrom, writeCases } from './write';

// The twin generator (production only; synthetic input elsewhere).
export { TwinBoundary, TwinBoundaryError } from './twin/boundary';
export { type TwinOptions, TwinSession, generateTwin } from './twin/twin';

/**
 * @tp/edi835: the X12 835 parser, written against the 005010X221A1 structure (milestone 2; PRD
 * section 10). A pure function from bytes, or a stream of chunks, to typed events and a parse report:
 * no database, no network, no clock, and no model anywhere near it. Loading the events is a separate,
 * idempotent step that uses the deduplication decisions in dedup.ts.
 */
export { EDI_ERROR_CODES, Edi835UsageError, SYNTAX_REASONS, type BalanceScope, type EdiError, type EdiErrorCode, type Position, type SyntaxReason } from './errors';
export { type Delimiters, ISA_LENGTH, ISA_WIDTHS, MAX_SEGMENT_LENGTH, type Segment, type TokenSink, Tokenizer, readIsaHeader } from './tokenizer';
export { type CodeListName, type CodeListProvider, type ExternalCodeList, type InternalCodeSet, X12_835_CODE_SETS, inCodeSet, releaseCodeLists } from './code-lists';
export { type ComponentSpec, type ElementKind, type ElementSpec, SPECS, type SegmentSpec } from './spec';
export { type UnknownCode, isDecimal, isPositiveDecimal, isoDate, isoShortDate } from './values';
export { type ClaimBalance, type ClaimFigures, type LineFigures, allocateProRata, balanceClaim, casTotal, observedAllowed, patientShare } from './balance';
export { plbCategory } from './transaction';
export { Edi835Parser, FUNCTIONAL_ID, INTERCHANGE_VERSION, type ParseOptions, TRANSACTION_VERSION, receiptOf } from './parser';
export { type KnownDocument, type KnownRemittance, type RemittanceDecision, duplicateDocument, remittanceDecision, remittanceKeyText } from './dedup';
export { type Edi835StreamItem, type ParseResult, STREAMING_THRESHOLD_BYTES, parse835, parse835Stream, remittancesOf } from './stream';
export * from './types';

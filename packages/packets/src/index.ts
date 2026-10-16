/**
 * @tp/packets: packet assembly, the deterministic verifier, identifier placeholders and their insertion
 * at export, prompt-pay interest and the next dispute window (PRD 12; milestone 8). Pure functions over
 * the records a case and its approved contract hold: no database, network or model inside. The
 * verifier is a hard gate with no bypass; the database refuses an approval of a version it failed.
 * Printing the export (PDF and CSV) is the worker's (apps/worker/src/packets).
 */
export { type AssemblyInput, type AssemblyLine, type DocumentReference, PacketAssemblyError, assemblePacket, dollars, requestedAction } from './assemble';
export { addDays, daysFrom, isIsoDate } from './dates';
export { draftNarrative } from './draft';
export { type NarrativeFacts, narrativeFacts } from './facts';
export {
  type CitedMethod,
  type CodeSummary,
  type ContractCitation,
  EVIDENCE_GAP_CODES,
  EVIDENCE_KINDS,
  type EvidenceGap,
  type EvidenceGapCode,
  type EvidenceItem,
  type EvidenceKind,
  FOLLOW_UP_DAYS,
  IDENTIFIER_KINDS,
  type IdentifierKind,
  type InterestLine,
  type InterestSection,
  PACKET_FORMAT,
  PAYER_RESPONSE_KINDS,
  type PacketCitation,
  type PacketContent,
  type PatternFacts,
  type PayerIdentification,
  type PayerResponseKind,
  type PracticeIdentification,
  type RegulationCitation,
  type RuleReleaseReference,
  SOURCE_KINDS,
  SUBMISSION_CHANNELS,
  type ScheduleLine,
  type Source,
  type SourceKind,
  type SubmissionChannel,
  VERIFIER_FORMAT,
} from './format';
export { canonicalJson, versionSha256 } from './hash';
export { type InterestLineInput, type InterestResult, type PromptPayRecord, promptPayInterest } from './interest';
export {
  type ExportLine,
  type ExportedPacket,
  IdentifierInsertionError,
  NOT_ON_RECORD,
  PLACEHOLDER_PATTERN,
  type RowIdentifiers,
  fillPlaceholders,
  insertIdentifiers,
  isIdentifierKind,
  lineHoldsOnlyPlaceholders,
  placeholder,
} from './placeholders';
export { type ReadableText, type TextSpan, readableText } from './readable';
export { type Figure, type FigureKind, type Span, canonicalNumber, isoDate, numbersInWords, romanValue, scanText, sentenceSpans } from './scan';
export { MISMATCH_CODES, type Mismatch, type MismatchCode, type VerifierReport, identifierForms, narrativeSha256, verifyNarrative } from './verifier';
export { type AppealLevel, type NextWindow, type NextWindowBasis, type WindowLength, nextDisputeWindow } from './windows';

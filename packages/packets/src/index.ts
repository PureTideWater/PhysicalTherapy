/**
 * @tp/packets: packet assembly, the deterministic verifier, identifier placeholders and their insertion
 * at export, prompt-pay interest, the next dispute window, and (tp-packet/2, CO-05) each line's deadline
 * with its status and its calculation summary copied from its trace (PRD 12; milestone 8), and (audit item #37 part 1)
 * the packet's reference derived from its approved hash, the practice's correspondence contact, and the payer and plan as
 * the payer's copy names them (never in their remittance-key form), and (combined audit #38, docs/adr/0072) every
 * figure of a calculation explained in words from its stored trace (./explain: the renderer, also the browser-safe
 * subpath @tp/packets/explain; explainPacket() binds a version's words to the traces its approval names), and
 * (docs/adr/0086) every narrative figure read in the role its words give it (./roles.ts) and held to it. Pure
 * functions over the records a case and its approved contract hold: no database, network or model inside. The
 * verifier is a hard gate with no bypass; the database refuses an approval of a version it failed.
 * Printing the export (PDF and CSV) is the worker's (apps/worker/src/packets).
 */
export {
  type AssemblyInput,
  type AssemblyLine,
  type DeadlineInput,
  type DocumentReference,
  PacketAssemblyError,
  assemblePacket,
  dollars,
  lineDeadline,
  packetDeadline,
  requestedAction,
} from './assemble';
export { CalculationError, lineCalculation, traceSha256 } from './calculation';
export {
  CORRESPONDENCE_CONTACT_KEY,
  CORRESPONDENCE_FIELDS,
  CORRESPONDENCE_FIELD_RULES,
  type CorrespondenceAddress,
  type CorrespondenceContact,
  CorrespondenceContactError,
  type CorrespondenceContactInput,
  type CorrespondenceContactState,
  type CorrespondenceField,
  SYNTHETIC_CORRESPONDENCE_CONTACT,
  USPS_STATE_CODES,
  correspondenceContactOf,
  correspondenceContactSetting,
  correspondenceText,
  phoneText,
} from './correspondence';
export { addDays, daysFrom, isIsoDate } from './dates';
export { draftNarrative } from './draft';
export { type ExplainBindingReason, ExplainBindingError, type PacketWords, type RowWords, explainPacket } from './explain';
export {
  AUDIENCES,
  type Audience,
  CODES,
  type ExplainCitation,
  type ExplainLineOptions,
  ExplainShapeError,
  ExplainWordsError,
  type FigureForm,
  type FigureSource,
  type LineWords,
  PAYER_CODES,
  RENDERER_REVISION,
  type Segment,
  type Sentence,
  type StepKind,
  type StepWords,
  UNPRICED_MEANING,
  UNPRICED_REMEDY,
  WORDS_VERSION,
  type Worksheet,
  type WorksheetLine,
  type WorksheetPart,
  explainLine,
  feeScheduleWorksheets,
  plainText,
} from './explain/index';
export { type NarrativeFacts, heldRoles, narrativeFacts } from './facts';
export {
  type CalculationStep,
  type CitedMethod,
  type CodeSummary,
  type ContractCitation,
  type DeadlineSource,
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
  type LineCalculation,
  type LineDeadline,
  PACKET_FORMAT,
  PACKET_FORMATS,
  PAYER_RESPONSE_KINDS,
  type PacketCitation,
  type PacketContent,
  type PacketContentV1,
  type PacketContentV2,
  type PacketDeadline,
  type PacketFormat,
  type PatternFacts,
  type PayerIdentification,
  type PayerResponseKind,
  type PracticeIdentification,
  type RegulationCitation,
  type RuleReleaseReference,
  SOURCE_KINDS,
  SUBMISSION_CHANNELS,
  type ScheduleLine,
  type ScheduleLineV2,
  type Source,
  type SourceKind,
  type SubmissionChannel,
  VERIFIER_FORMAT,
  isPacketV2,
} from './format';
export { canonicalJson, versionSha256 } from './hash';
export { INTEREST_EXCLUSION_TEXT, type InterestLineInput, type InterestResult, type PromptPayRecord, interestExclusionText, interestStated, lineInterestStated, promptPayInterest } from './interest';
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
export {
  CLAIM_FILING_INDICATOR_TEXT,
  MA_NONCONTRACTED_CITATION,
  type PlanNaming,
  QUALIFIED_IDENTIFIER,
  type RemittanceKey,
  payerAndPlanText,
  payerText,
  planName,
  planText,
  remittanceKey,
} from './payer';
export { type ReadableText, type TextSpan, readableText } from './readable';
export { FIGURE_ROLES, type FigureReading, type FigureRole, type ReadKind, readFigures } from './roles';
export { PACKET_REFERENCE_PATTERN, exportFileName, normalizePacketReference, packetReference, packetReferencePrefix, withPacketReference } from './reference';
export { type Figure, type FigureKind, type Span, canonicalNumber, isoDate, numbersInWords, romanValue, scanText, sentenceSpans } from './scan';
export { type CheckedFigure, MISMATCH_CODES, type Mismatch, type MismatchCode, type VerifierReport, checkedFigures, identifierForms, narrativeSha256, verifyNarrative } from './verifier';
export { wordsVersionOf } from './words-version';
export { type AppealLevel, type NextWindow, type NextWindowBasis, type WindowLength, nextDisputeWindow } from './windows';

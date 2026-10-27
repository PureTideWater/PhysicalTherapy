/**
 * @tp/packets/explain: every figure explained in words (combined audit #38; docs/adr/0072). A stored trace and the
 * citation beside it in, plain sentences and the fee-schedule worksheet out, for three audiences: the line trace page,
 * the packet builder and review, and the payer's PDF read the same renderer. Pure and browser-safe: no node:crypto, no
 * database, no I/O. The root entry point (@tp/packets) adds explainPacket(), which checks each trace's SHA-256 against
 * the approved content before it words anything.
 */
export {
  FIGURE_FORMS,
  type FigureForm,
  type FigureSource,
  ExplainShapeError,
  type Segment,
  type Sentence,
  formatFigure,
  plainText,
  segmentText,
} from './figures';
export {
  AUDIENCES,
  type Audience,
  type ExplainCitation,
  type ExplainLineOptions,
  type LineWords,
  STEP_KINDS,
  type StepKind,
  type StepWords,
  explainLine,
  worksheetKeyOf,
} from './line';
export { SLOTS, type Slot, type SlotPath, pathMatchesSlot } from './slots';
export { RENDERER_REVISION, WORDS_VERSION } from './version';
export {
  CODES,
  DETAIL_TEXT,
  ExplainWordsError,
  METHOD_TEXT,
  PAYER_CODES,
  ROUNDING_TEXT,
  STEP_TEXT,
  UNPRICED_MEANING,
  UNPRICED_REMEDY,
  WORD_TABLES,
  type WordsCode,
  wordsOf,
} from './words';
export { type Worksheet, type WorksheetLine, type WorksheetOptions, type WorksheetPart, feeScheduleWorksheets } from './worksheet';

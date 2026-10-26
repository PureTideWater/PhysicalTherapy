/**
 * @tp/model-gateway: the only code in the repository that calls a model (PRD 14; milestone 10). ESLint
 * forbids importing a provider SDK anywhere else (eslint.config.js, MODEL_SDK_PATTERNS). Models propose; code
 * verifies; people approve. Four purpose-typed functions, each with a pinned prompt version under
 * prompts/, an output schema, a verifier and a model_call row; the model path (Bedrock by default,
 * Anthropic's HIPAA-ready API as the alternative, the local deterministic provider in development and
 * tests) is configuration (docs/adr/0048).
 */

export {
  ALL_SERVED,
  FLAGGED_PURPOSES,
  MODEL_PURPOSES,
  type ModelPurpose,
  PURPOSE_VARIANTS,
  type ServedKey,
  type ServedSet,
  offeredPurposes,
  purposeServed,
  servedKey,
} from './purposes';
export { type CallContext, type GatewayOptions, type GatewayResult, ModelGateway, permittedRequestKey } from './gateway';
export { CallLimiter, type CallLimits, DEFAULT_CALL_LIMITS } from './limiter';
export {
  DuplicateModelCallError,
  GatewayConfigError,
  GatewayError,
  InputRefusedError,
  ModelBudgetExceededError,
  ModelBusyError,
  ModelCallFailedError,
  ModelFeatureOffError,
  PhiBoundaryError,
} from './errors';
export { CALL_TIMEOUT_MS, type GatewayConfig, type ServingOptions, createProvider, pinnedModels, readGatewayConfig, unservedCount } from './config';
export {
  COMMITTED_BASELINE,
  COMMITTED_FLOORS,
  COMMITTED_SERVING,
  type NotServedReason,
  SERVING_RULES,
  type Serving,
  type ServingDecision,
  type ServingInputs,
  entryFor,
  gatewayServing,
  productionServing,
  servedSet,
  servingDecisions,
} from './evaluated';
export { FLOORS_FORMAT, FLOOR_KINDS, type FloorKind, type FloorRef, type Floors, belowFloors, floorPpm, floorsSchema, meetsFloor, parseFloors, unsetFloors } from './floors-format';
export {
  CORRECTION_DECISIONS,
  CORRECTION_FORMAT,
  CORRECTION_FORMATS,
  CORRECTION_FORMAT_V1,
  CORRECTION_FORMAT_V2,
  type Correction,
  type EarlierPermittedReport,
  type FinalRecord,
  PERMITTED_FIELDS,
  PERMITTED_REPORT_FORMAT,
  PERMITTED_REPORT_FORMAT_V1,
  type PermittedField,
  MEASURED_PROBLEMS,
  OUTSIDE_MODEL_PROBLEMS,
  type PermittedOutcome,
  type PermittedReport,
  type PermittedResult,
  type PermittedRunIdentity,
  type PermittedVariantReport,
  correctionSchema,
  earlierPermittedReportSchema,
  finalKeys,
  isLegacyCorrection,
  permittedOutcome,
  permittedRegressions,
  permittedReport,
  permittedReportProblems,
  permittedReportSchema,
  permittedResult,
  scorePermitted,
  scoredFinals,
  statedKeys,
} from './permitted';
export {
  type DerivedCounts,
  type FieldTally,
  type Stated,
  TALLY_KEYS,
  type Tallied,
  type TrueKeys,
  ZERO_TALLY,
  addTally,
  asCounts,
  pairRecords,
  sumTallies,
  tallyFields,
  totalTally,
  wrongVerified,
  zeroTallies,
} from './tally';
export {
  BASELINE_FIELDS,
  BASELINE_FORMAT,
  type Baseline,
  type BaselineEntry,
  type BaselineField,
  type BaselinePurpose,
  CONTRACT_VARIANTS,
  type ContractBaseline,
  type ContractVariant,
  type NarrativeBaseline,
  type ServedRecord,
  baselineSchema,
  contractEntrySchema,
  narrativeEntrySchema,
  parseBaseline,
  tallySchema,
} from './baseline-format';
export {
  type CompleteOptions,
  EFFORTS,
  type Effort,
  type ModelProvider,
  type ModelRequest,
  type ModelResponse,
  PROVIDER_FAILURES,
  PROVIDER_KINDS,
  ProviderFailure,
  type ProviderFailureCode,
  type ProviderKind,
  type StopReason,
} from './provider';
export { BEDROCK_ANTHROPIC_VERSION, BedrockProvider, type BedrockProviderOptions } from './providers/bedrock';
export { type AnthropicMessages, AnthropicProvider, type AnthropicProviderOptions } from './providers/anthropic';
export { LOCAL_OUTPUT_FORMAT, LocalDeterministicProvider, localOutputKey } from './providers/local';
export { PROMPTS, PROMPT_FORMAT, type PromptVersion, modelFor, providerSchema } from './prompts';
export { type CallCost, type ModelPrice, PRICES, callCost, priceOf } from './prices';
export { DEFAULT_DAILY_BUDGET_CENTS, type FlagRow, type GatewayFeatures, resolveFeatures } from './flags';
export { type CallActor, MemoryModelCallStore, type ModelCallRecord, type ModelCallStore } from './store';
export {
  type FeatureFlagInput,
  OperatorEvaluationStore,
  type PermittedExampleInput,
  PostgresModelCallStore,
  type PracticeActor,
  type ReviewerDecisionInput,
  featuresIn,
  recordPermittedExample,
  recordPermittedExampleIn,
  recordReviewerDecision,
  recordReviewerDecisionIn,
  setFeatureFlag,
} from './postgres-store';
export { PURPOSE_SPECS, type PurposeInputs, type PurposeOutputs, type PurposeProposals, type RequestInputs, requestFor } from './specs';
export {
  CONTRACT_KINDS,
  type CandidateReview,
  type CodeDefault,
  type ContractPages,
  type ContractPagesInput,
  type ContractTermsOutput,
  type ContractTermsProposal,
  FIELD_PROBLEMS,
  type FieldProblem,
  type FieldReview,
  MAX_PAGES,
  NAMES_PATIENT_MESSAGE,
  type ProposedRateRecord,
  SCREEN_UNAVAILABLE_MESSAGE,
  verifyContractTerms,
} from './functions/contract-terms';
export {
  CONTRACT_SCREEN_PURPOSE,
  type PatientRecordsCheck,
  type PracticeRecordsOptions,
  SCREEN_MAX_IDENTIFIERS,
  type ScreenIdentifiers,
  type ScreenOutcome,
  issuedCheck,
  practiceRecordsCheck,
  recordContractScreenRequested,
  screenAuditRequestId,
  syntheticRecordsCheck,
} from './patient-records';
export {
  type DenialCategory,
  type DenialLetterInput,
  type DenialLetterOutput,
  type DenialLetterProposal,
  type LetterFieldReview,
  type OtherPatientCheck,
  verifyDenialLetter,
} from './functions/denial-letter';
export { type NarrativeInput, type NarrativeOutput, type NarrativeProposal, narrativeInputs } from './functions/narrative';
export {
  type EvidenceGap,
  type EvidenceRequest,
  type EvidenceRequestsInput,
  type EvidenceRequestsOutput,
  type EvidenceRequestsProposal,
  KNOWN_REASON_CODES,
  verifyEvidenceRequests,
} from './functions/evidence-requests';
export { type LetterClaim, type PatientIdentifiers, SCREEN_FLOORS, compactIdentifier, identifierCandidates, identifierRuns, redactLetter } from './redact';

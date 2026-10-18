/**
 * @tp/model-gateway: the only code in the repository that calls a model (PRD 14; milestone 10). ESLint
 * forbids importing a provider SDK anywhere else (eslint.config.js, MODEL_SDK_PATTERNS). Models propose; code
 * verifies; people approve. Four purpose-typed functions, each with a pinned prompt version under
 * prompts/, an output schema, a verifier and a model_call row; the model path (Bedrock by default,
 * Anthropic's HIPAA-ready API as the alternative, the local deterministic provider in development and
 * tests) is configuration (docs/adr/0048).
 */

export { MODEL_PURPOSES, FLAGGED_PURPOSES, type ModelPurpose } from './purposes';
export { type CallContext, type GatewayOptions, type GatewayResult, ModelGateway } from './gateway';
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
export { CALL_TIMEOUT_MS, type GatewayConfig, assertPricesConfirmed, createProvider, pinnedModels, readGatewayConfig } from './config';
export { EVALUATED_PURPOSES, type MissingEvaluation, RECORDED_EVALUATIONS, type RecordedEvaluation, assertEvaluated, unevaluatedModels } from './evaluated';
export {
  CORRECTION_FORMAT,
  type Correction,
  type FieldCounts as PermittedFieldCounts,
  PERMITTED_FIELDS,
  PERMITTED_REPORT_FORMAT,
  type PermittedField,
  type PermittedReport,
  type PermittedResult,
  addCounts,
  correctionSchema,
  finalKeys,
  permittedRegressions,
  permittedReport,
  permittedReportSchema,
  scorePermitted,
  statedKeys,
} from './permitted';
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
export { PURPOSE_SPECS, type PurposeInputs, type PurposeOutputs, type PurposeProposals, requestFor } from './specs';
export {
  CONTRACT_KINDS,
  type CandidateReview,
  type CodeDefault,
  type ContractPagesInput,
  type ContractTermsOutput,
  type ContractTermsProposal,
  type FieldProblem,
  type FieldReview,
  MAX_PAGES,
  type ProposedRateRecord,
  verifyContractTerms,
} from './functions/contract-terms';
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
export { type LetterClaim, type PatientIdentifiers, compactIdentifier, identifierCandidates, redactLetter } from './redact';

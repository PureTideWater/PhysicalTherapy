/**
 * The one interface every model path sits behind (PRD 14, Provider and data path; PRD 20: Bedrock by
 * default, Anthropic's HIPAA-ready API as the alternative, the choice made in configuration and
 * recorded in docs/adr/0048). A request is a fixed system prompt, one user message holding the input
 * as data, and the JSON schema the answer must follow. There is no field for tools, tool choice,
 * servers, containers or files, so no call can give a model a way to act: a call that reads a document
 * can only return text, which code verifies and a person approves (PRD 14, Untrusted input).
 */

export const PROVIDER_KINDS = ['bedrock', 'anthropic', 'local'] as const;
export type ProviderKind = (typeof PROVIDER_KINDS)[number];

export const EFFORTS = ['low', 'medium', 'high'] as const;
export type Effort = (typeof EFFORTS)[number];

export interface ModelRequest {
  /** The pinned model identifier the prompt version names for this provider (configuration only). */
  readonly modelId: string;
  /** The prompt version, as model_call records it (propose-contract-terms/1). */
  readonly promptVersion: string;
  readonly system: string;
  /** The input, framed as data (./untrusted.ts). */
  readonly user: string;
  /** The JSON schema the answer follows (the prompt version's schema.json). */
  readonly outputSchema: Readonly<Record<string, unknown>>;
  readonly maxTokens: number;
  readonly effort: Effort;
}

/** Why a response ended: finished, cut off at the token limit, declined, or anything else. */
export type StopReason = 'end' | 'max_tokens' | 'refusal' | 'other';

export interface ModelResponse {
  /** The answer's text (JSON, by the schema), the text blocks joined. */
  readonly text: string;
  readonly tokensIn: number;
  readonly tokensOut: number;
  readonly stopReason: StopReason;
}

export interface CompleteOptions {
  /** Aborted when the gateway's 60-second timeout for the attempt passes. */
  readonly signal: AbortSignal;
}

export interface ModelProvider {
  readonly kind: ProviderKind;
  complete(request: ModelRequest, options: CompleteOptions): Promise<ModelResponse>;
}

/** Codes a provider failure is reported under, and whether the gateway's one retry applies. */
export const PROVIDER_FAILURES = {
  timeout: true,
  throttled: true,
  unavailable: true,
  rejected: false,
  no_fixed_output: false,
} as const;
export type ProviderFailureCode = keyof typeof PROVIDER_FAILURES;

/** A provider's failure, by code; never the provider's own message, which may echo the request. */
export class ProviderFailure extends Error {
  override readonly name = 'ProviderFailure';
  readonly retryable: boolean;

  constructor(readonly code: ProviderFailureCode) {
    super(`the model provider failed: ${code}`);
    this.retryable = PROVIDER_FAILURES[code];
  }
}

/** Whether an error is the abort of the attempt's own signal. */
export function isAbort(error: unknown, signal: AbortSignal): boolean {
  return signal.aborted || (error instanceof Error && error.name === 'AbortError');
}

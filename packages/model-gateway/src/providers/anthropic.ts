import Anthropic from '@anthropic-ai/sdk';

import { type CompleteOptions, type ModelProvider, type ModelRequest, type ModelResponse, ProviderFailure, isAbort } from '../provider';
import { messagesResponse } from './messages';

/**
 * Anthropic's API under its standard business associate agreement with HIPAA readiness enabled: the
 * alternative path behind the same interface (PRD 14, Provider and data path; docs/adr/0048). Only the
 * Messages API with structured outputs is used, both eligible there; the Batch API, Files API, code
 * execution, Skills and the MCP connector are never called. The client is built with no retries of
 * its own (the gateway makes the one retry) and is mocked in tests.
 */

/** The part of the SDK's client the provider calls. */
export interface AnthropicMessages {
  readonly messages: Pick<Anthropic['messages'], 'create'>;
}

export interface AnthropicProviderOptions {
  readonly client: AnthropicMessages;
  /** The SDK's own timeout per request; the gateway's signal ends the attempt at 60 seconds either way. */
  readonly timeoutMs?: number;
}

export function anthropicFailure(error: unknown, signal: AbortSignal): ProviderFailure {
  if (error instanceof ProviderFailure) {
    return error;
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError || isAbort(error, signal)) {
    return new ProviderFailure('timeout');
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new ProviderFailure('throttled');
  }
  if (error instanceof Anthropic.APIConnectionError || error instanceof Anthropic.InternalServerError) {
    return new ProviderFailure('unavailable');
  }
  if (error instanceof Anthropic.APIError && typeof error.status === 'number' && error.status >= 500) {
    return new ProviderFailure('unavailable');
  }
  return new ProviderFailure('rejected');
}

/** The SDK's client, as configuration builds it: the key from the environment's secret, no SDK retries. */
export function anthropicClient(apiKey: string, timeoutMs: number): AnthropicMessages {
  return new Anthropic({ apiKey, maxRetries: 0, timeout: timeoutMs });
}

export class AnthropicProvider implements ModelProvider {
  readonly kind = 'anthropic' as const;

  constructor(private readonly options: AnthropicProviderOptions) {}

  async complete(request: ModelRequest, options: CompleteOptions): Promise<ModelResponse> {
    try {
      // The Messages request of ./messages.ts, as the SDK types it: no tools, servers, containers or files.
      const params: Anthropic.MessageCreateParamsNonStreaming = {
        model: request.modelId,
        max_tokens: request.maxTokens,
        system: request.system,
        messages: [{ role: 'user', content: [{ type: 'text', text: request.user }] }],
        output_config: { effort: request.effort, format: { type: 'json_schema', schema: { ...request.outputSchema } } },
        stream: false,
      };
      const message = await this.options.client.messages.create(params, { signal: options.signal, maxRetries: 0, timeout: this.options.timeoutMs ?? 60_000 });
      return messagesResponse(message);
    } catch (error) {
      throw anthropicFailure(error, options.signal);
    }
  }
}

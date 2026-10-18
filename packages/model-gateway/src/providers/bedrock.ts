import { type BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

import { type CompleteOptions, type ModelProvider, type ModelRequest, type ModelResponse, ProviderFailure, type ProviderFailureCode, isAbort } from '../provider';
import { messagesBody, messagesResponse } from './messages';

/**
 * Claude on AWS Bedrock, the default model path (PRD 14 and 20; docs/adr/0048): the Bedrock runtime's
 * InvokeModel inside the company's AWS account, reached through the bedrock-runtime VPC endpoint in
 * production (infra's network construct; with private DNS the regional endpoint resolves to it),
 * under the AWS business associate agreement. The body is the Messages request with Bedrock's
 * anthropic_version; the model identifier is the prompt version's, from configuration. The client is
 * built with one attempt, because the gateway makes the one retry itself under the same idempotency
 * key, and is mocked in tests.
 */

export const BEDROCK_ANTHROPIC_VERSION = 'bedrock-2023-05-31';

export interface BedrockProviderOptions {
  readonly client: Pick<BedrockRuntimeClient, 'send'>;
}

/** Bedrock's exceptions by name, as the gateway's failure codes. */
const FAILURES: Readonly<Record<string, ProviderFailureCode>> = {
  ThrottlingException: 'throttled',
  ServiceQuotaExceededException: 'throttled',
  ServiceUnavailableException: 'unavailable',
  InternalServerException: 'unavailable',
  ModelNotReadyException: 'unavailable',
  ModelTimeoutException: 'timeout',
};

export function bedrockFailure(error: unknown, signal: AbortSignal): ProviderFailure {
  if (error instanceof ProviderFailure) {
    return error;
  }
  if (isAbort(error, signal)) {
    return new ProviderFailure('timeout');
  }
  const name = error instanceof Error ? error.name : '';
  return new ProviderFailure(FAILURES[name] ?? 'rejected');
}

export class BedrockProvider implements ModelProvider {
  readonly kind = 'bedrock' as const;

  constructor(private readonly options: BedrockProviderOptions) {}

  async complete(request: ModelRequest, options: CompleteOptions): Promise<ModelResponse> {
    const body = { anthropic_version: BEDROCK_ANTHROPIC_VERSION, ...messagesBody(request) };
    try {
      const output = await this.options.client.send(
        new InvokeModelCommand({ modelId: request.modelId, contentType: 'application/json', accept: 'application/json', body: new TextEncoder().encode(JSON.stringify(body)) }),
        { abortSignal: options.signal },
      );
      return messagesResponse(JSON.parse(new TextDecoder().decode(output.body)) as unknown);
    } catch (error) {
      throw bedrockFailure(error, options.signal);
    }
  }
}
